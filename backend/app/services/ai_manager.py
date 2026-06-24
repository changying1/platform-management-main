import threading
import time
import cv2
import os
import uuid
import re
import json
import copy
import requests
import subprocess
import numpy as np
from datetime import datetime, timedelta
from app.services.ai_service import AIService
from app.core.database import SessionLocal, get_mongo_db, get_next_sequence
from app.services import ai_features
from app.services.video_service import VideoService, RECORD_SEGMENT_SECONDS, RECORD_SEGMENT_SAFE_MARGIN_SECONDS
from app.services.ai_runtime.model_registry import list_model_configs
from app.services.alarm_service import AlarmService
from urllib.parse import urlsplit, urlunsplit, unquote, quote
from PIL import Image, ImageDraw, ImageFont
from app.utils.logger import get_logger
from app.core.ws_manager import push_alarm_threadsafe
from app.utils.config_manager import get_system_settings


logger = get_logger("AIManager")


class AIManager:
    CURRENT_AI_ALARM_LEVELS = {
        "head": "HIGH",
        "no_helmet": "HIGH",
        "safehat": "LOW",
        "helmet": "LOW",
        "person": "HIGH",
        "smoking": "HIGH",
        "fire": "SEVERE",
        "flame": "SEVERE",
        "火": "SEVERE",
        "smoke": "SEVERE",
        "烟": "SEVERE",
        "reflection": "LOW",
        "reflective_vest": "LOW",
        "clothes": "HIGH",
        "no_vest": "HIGH",
        "phone": "HIGH",
        "call": "HIGH",
        "calling": "HIGH",
    }

    CURRENT_AI_BEHAVIOR_ALIASES = {
        "helmet": ("head", "no_helmet", "safehat", "helmet"),
        "person": ("person",),
        "smoking": ("smoking",),
        "fire": ("fire", "flame", "火", "smoke", "烟"),
        "vest": ("reflection", "reflective_vest", "clothes", "no_vest"),
        "phone": ("phone", "call", "calling"),
    }

    def __init__(self):
        self.active_monitors = {}
        self.device_rules = {}
        self.alarm_cooldown_seconds = max(10, int(os.getenv("AI_ALARM_TRIGGER_COOLDOWN_SECONDS", "10")))
        self.alarm_last_trigger_time = {}
        self.alarm_state_lock = threading.Lock()
        # 全局共享冷却时间映射，解决重启监控或多路干扰导致的冷却失效
        self.global_last_alarm_time = {}
        
        self.ai_service = AIService(shared_cooldown_map=self.global_last_alarm_time)
        self.video_service = VideoService()
        self.base_dir = os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )
        self.static_dir = self.video_service._get_alarm_screenshot_root()
        os.makedirs(self.static_dir, exist_ok=True)

        # 算法分发表
        self.algo_handlers = ai_features.get_algo_handlers(self.ai_service)
        logger.info(f"当前注册算法列表: {list(self.algo_handlers.keys())}")

        # AI检测行为告警等级映射：当前模型注册表为主，兼容历史默认项，并允许系统设置覆盖。
        self.ai_alarm_level_map = self._build_current_ai_alarm_level_map()
        self.ai_alarm_level_map.update({
            'helmet': 'HIGH',
            'helmet_missing': 'HIGH',
            'safety_harness': 'SEVERE',
            'safety_harness_missing': 'SEVERE',
            'smoking': 'HIGH',
            'fall': 'SEVERE',
            'person_fall': 'SEVERE',
            'unauthorized': 'HIGH',
            'unauthorized_person': 'HIGH',
            'fire': 'SEVERE',
            'fire_detected': 'SEVERE',
            '消防措施不足': 'SEVERE',
            'no_helmet_area': 'MEDIUM',
            'crowd': 'MEDIUM',
            'crowd_detection': 'MEDIUM',
        })
        self._load_ai_alarm_level_map()
        self._log_current_ai_alarm_level_map()

    def _normalize_behavior_key(self, behavior_code):
        return str(behavior_code or "").strip().lower()

    def _register_ai_alarm_behavior(self, level_map, behavior_code):
        behavior_code = str(behavior_code or "").strip()
        if not behavior_code:
            return

        normalized_code = self._normalize_behavior_key(behavior_code)
        level_map[normalized_code] = self.CURRENT_AI_ALARM_LEVELS.get(normalized_code, "HIGH")

    def _build_current_ai_alarm_level_map(self):
        level_map = {}

        for algorithm_code, config in list_model_configs().items():
            behavior_codes = set(config.alarm_labels or ())
            behavior_codes.update(self.CURRENT_AI_BEHAVIOR_ALIASES.get(algorithm_code, (algorithm_code,)))

            for behavior_code in sorted(behavior_codes, key=str):
                self._register_ai_alarm_behavior(level_map, behavior_code)

        return level_map

    def _log_current_ai_alarm_level_map(self):
        logger.info(f"当前 AI 等级映射: {len(self.ai_alarm_level_map)} 种检测行为")

    def _alarm_collection(self):
        return get_mongo_db()["alarm_record"]

    def _find_alarm_doc_by_id(self, alarm_id: int | str):
        return self._alarm_collection().find_one({"id": int(alarm_id)})

    def _update_alarm_fields(self, alarm_id: int | str, updates: dict):
        clean_updates = {k: v for k, v in (updates or {}).items() if k != "_id"}
        if not clean_updates:
            return
        self._alarm_collection().update_one(
            {"id": int(alarm_id)},
            {"$set": clean_updates}
        )

    def _infer_project_id_from_device(self, device_id: int | str):
        try:
            db_video = self.video_service._get_video_runtime_by_id(device_id)
            if not db_video:
                return None

            # 先尝试直接拿 project_id
            direct_project_id = getattr(db_video, "project_id", None)
            if direct_project_id not in [None, "", 0, "0"]:
                try:
                    return int(direct_project_id)
                except Exception:
                    return direct_project_id

            return None
        except Exception:
            return None

    def _new_alarm_trace_id(self) -> str:
        return f"alarmtrace-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"

    def _emit_alarm_log(self, level: str, message: str, *args):
        level_lower = (level or "info").lower()
        if level_lower == "warning":
            logger.warning(message, *args)
        elif level_lower == "error":
            logger.error(message, *args)
        else:
            logger.info(message, *args)

        try:
            rendered = message.format(*args)
        except Exception:
            rendered = f"{message} | args={args}"
        print(rendered)

    def _normalize_alarm_level(self, level) -> str:
        normalized = str(level or "").strip().lower()
        return {
            "severe": "high",
            "critical": "high",
            "high": "high",
            "risk": "medium",
            "warning": "medium",
            "medium": "medium",
            "normal": "low",
            "info": "low",
            "low": "low",
        }.get(normalized, "high")

    def _normalize_alarm_key(self, value) -> str:
        return re.sub(r"[\s_\-]+", "", str(value or "").strip().lower())

    def _load_ai_alarm_level_map(self):
        loaded_map = {}
        for key, level in self.ai_alarm_level_map.items():
            normalized_level = self._normalize_alarm_level(level)
            loaded_map[str(key).strip().lower()] = normalized_level
            loaded_map[self._normalize_alarm_key(key)] = normalized_level

        settings = get_system_settings()
        for item in settings.get("aiAlarmLevelConfigs") or []:
            if not isinstance(item, dict):
                continue
            level = self._normalize_alarm_level(item.get("level"))
            for alias in [item.get("code"), item.get("name"), item.get("id")]:
                if alias in [None, ""]:
                    continue
                loaded_map[str(alias).strip().lower()] = level
                loaded_map[self._normalize_alarm_key(alias)] = level

        self.ai_alarm_level_map = loaded_map

    def _resolve_ai_alarm_severity(self, alarm_type: str, algo_key: str | None = None, details: dict | None = None) -> str:
        self._load_ai_alarm_level_map()
        candidates = [algo_key, alarm_type]
        if isinstance(details, dict):
            candidates.extend([details.get("code"), details.get("name")])
            boxes = details.get("boxes")
            if isinstance(boxes, list):
                for box in boxes[:3]:
                    if isinstance(box, dict):
                        candidates.extend([box.get("code"), box.get("name"), box.get("type")])

        for candidate in candidates:
            if candidate in [None, ""]:
                continue
            raw_key = str(candidate).strip().lower()
            normalized_key = self._normalize_alarm_key(candidate)
            if raw_key in self.ai_alarm_level_map:
                return self.ai_alarm_level_map[raw_key]
            if normalized_key in self.ai_alarm_level_map:
                return self.ai_alarm_level_map[normalized_key]
        return "high"

    # =========================
    # 启动监控
    # =========================
    def _normalize_rtsp_path(self, url: str) -> str:
        if not isinstance(url, str):
            return ""
        raw = url.strip()
        if not raw.startswith("rtsp://"):
            return raw

        scheme, _, rest = raw.partition("://")
        if "/" not in rest:
            return raw

        host_part, path_part = rest.split("/", 1)
        return f"{scheme}://{host_part}/" + path_part.lstrip("/")

    def _replace_hik_channel(self, url: str, channel: str) -> str:
        return re.sub(r"/Streaming/Channels/\d+", f"/Streaming/Channels/{channel}", url)

    def _with_double_slash_path(self, url: str) -> str:
        if not isinstance(url, str) or not url.startswith("rtsp://"):
            return url
        scheme, _, rest = url.partition("://")
        if "/" not in rest:
            return url
        host_part, path_part = rest.split("/", 1)
        return f"{scheme}://{host_part}//{path_part.lstrip('/')}"

    def _plan_ai_and_record_rtsp(self, rtsp_url: str):
        """优先将 AI 与录像拆到不同通道，减少部分设备二次 SETUP=500 问题。"""
        normalized = self._normalize_rtsp_path(str(rtsp_url or ""))
        if not normalized:
            return "", ""

        if "/Streaming/Channels/" in normalized:
            ai_url = self._replace_hik_channel(normalized, "101")
            rec_url = self._replace_hik_channel(normalized, "102")
            return ai_url, rec_url

        return normalized, normalized

    def start_monitoring(self, device_id, rtsp_url, algo_type="helmet,smoking"):
        device_id = str(device_id)

        if device_id in self.active_monitors:
            print(f"⚠️ 设备 {device_id} 已经在监控中")
            self._emit_alarm_log("info", "[ALARM_MONITOR_ALREADY_RUNNING] device_id={}", device_id)
            return False

        ai_rtsp_url, record_rtsp_url = self._plan_ai_and_record_rtsp(rtsp_url)
        monitor_mode = "rtsp"
        ezviz_serial = ""
        ezviz_channel = 1

        if not ai_rtsp_url:
            db = SessionLocal()
            try:
                db_video = None
                if device_id.isdigit():
                    db_video = self.video_service._get_video_runtime_by_id(device_id)

                if db_video and getattr(db_video, "device_serial", None):
                    ezviz_serial = str(getattr(db_video, "device_serial", "") or "").strip()
                    ezviz_channel = int(getattr(db_video, "channel_no", 1) or 1)
                    monitor_mode = "ezviz_snapshot"
                else:
                    print("❌ AI 启动失败：RTSP 地址为空，且设备未配置萤石云序列号")
                    self._emit_alarm_log(
                        "error",
                        "[ALARM_MONITOR_START_FAILED] device_id={} reason=missing_rtsp_and_ezviz_serial",
                        device_id,
                    )
                    return False
            finally:
                db.close()

        print(f"--- 启动 AI 监控: {device_id} | 功能: {algo_type} | 模式: {monitor_mode} ---")
        if monitor_mode == "rtsp":
            print(f"🎯 AI拉流地址: {ai_rtsp_url}")
            print(f"💾 录像拉流地址: {record_rtsp_url}")
        else:
            print(f"☁️ 萤石抓图序列号: {ezviz_serial} | 通道: {ezviz_channel}")

        stop_event = threading.Event()
        if monitor_mode == "rtsp":
            thread = threading.Thread(
                target=self._monitor_loop,
                args=(device_id, ai_rtsp_url, record_rtsp_url, algo_type, stop_event),
                daemon=True,
            )
        else:
            thread = threading.Thread(
                target=self._snapshot_monitor_loop,
                args=(device_id, ezviz_serial, ezviz_channel, algo_type, stop_event),
                daemon=True,
            )

        self.active_monitors[device_id] = {
            "stop_event": stop_event,
            "thread": thread,
            "mode": monitor_mode,
        }

        thread.start()
        self._emit_alarm_log(
            "info",
            "[ALARM_MONITOR_STARTED] device_id={} mode={} algo_type={} ai_rtsp_url={} record_rtsp_url={} ezviz_serial={} ezviz_channel={}",
            device_id,
            monitor_mode,
            algo_type,
            ai_rtsp_url or "",
            record_rtsp_url or "",
            ezviz_serial or "",
            ezviz_channel,
        )
        return True

    def _fetch_ezviz_snapshot_frame(self, device_serial: str, channel_no: int):
        payload = {
            "deviceSerial": device_serial,
            "channelNo": int(channel_no or 1),
        }

        body = None
        for path in ["/api/lapp/device/capture", "/api/lapp/v2/device/capture"]:
            try:
                body = self.video_service._call_ezviz_api(path, payload)
                break
            except Exception:
                body = None

        if body is None:
            return None

        data = body.get("data") or {}
        pic_url = data.get("picUrl") or data.get("url") or data.get("picURL") or ""
        if not pic_url:
            return None

        try:
            response = requests.get(pic_url, timeout=8)
            if response.status_code != 200 or not response.content:
                return None

            np_buf = np.frombuffer(response.content, dtype=np.uint8)
            frame = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
            return frame
        except Exception:
            return None

    def _snapshot_monitor_loop(self, device_id, device_serial, channel_no, algo_type_str, stop_event):
        active_algos = [x.strip() for x in algo_type_str.split(",") if x.strip()]
        # 萤石抓图接口开销较高，默认 1.2s 一帧，必要时可通过环境变量调优。
        interval_seconds = max(0.8, float(os.getenv("AI_EVZIZ_SNAPSHOT_INTERVAL_SECONDS", "1.0")))

        print(f"📸 萤石抓图检测启动: serial={device_serial}, channel={channel_no}, interval={interval_seconds}s")

        while not stop_event.is_set():
            loop_started_at = time.time()
            frame = self._fetch_ezviz_snapshot_frame(device_serial, channel_no)

            if frame is None:
                self._emit_alarm_log(
                    "warning",
                    "[ALARM_SNAPSHOT_FRAME_EMPTY] device_id={} serial={} channel={}",
                    device_id,
                    device_serial,
                    channel_no,
                )
                if stop_event.wait(1.0):
                    break
                continue

            try:
                for algo_key in active_algos:
                    if algo_key not in self.algo_handlers:
                        print(f"⚠️ 未识别算法类型: {algo_key}")
                        continue

                    is_alarm, details = self.algo_handlers[algo_key](frame)

                    if is_alarm:
                        alarm_type = self._extract_alarm_type(details)
                        alarm_trace_id = self._new_alarm_trace_id()
                        self._emit_alarm_log(
                            "info",
                            "[ALARM_TRIGGERED] trace_id={} mode=ezviz_snapshot device_id={} algo={} alarm_type={}",
                            alarm_trace_id,
                            device_id,
                            algo_key,
                            alarm_type or algo_key,
                        )
                        if not self._should_trigger_alarm(device_id, algo_key, alarm_type or algo_key, details):
                            self._emit_alarm_log(
                                "info",
                                "[ALARM_SKIPPED_COOLDOWN] trace_id={} device_id={} alarm_type={} cooldown_seconds={}",
                                alarm_trace_id,
                                device_id,
                                alarm_type or algo_key,
                                self.alarm_cooldown_seconds,
                            )
                            continue

                        details = self._normalize_alarm_details_for_frame(details, frame)
                        img_path = self._save_alarm_image(frame, device_id, details, alarm_trace_id=alarm_trace_id)
                        self._save_alarm_to_db(device_id, details, img_path, algo_key=algo_key, alarm_trace_id=alarm_trace_id)
            except Exception as logic_error:
                print(f"⚠️ 抓图检测逻辑异常: {logic_error}")

            elapsed = time.time() - loop_started_at
            wait_seconds = max(0.0, interval_seconds - elapsed)
            if stop_event.wait(wait_seconds):
                break

        print(f"--- 抓图监控线程已退出: {device_id} ---")

    def get_device_rules(self, device_id):
        device_id = str(device_id)
        rules_str = str(self.device_rules.get(device_id, "")).strip()
        if not rules_str:
            return []
        return [item.strip() for item in rules_str.split(",") if item.strip()]

    def set_device_rules(self, device_id, rules):
        device_id = str(device_id)

        if isinstance(rules, list):
            normalized = [str(item).strip() for item in rules if str(item).strip()]
            self.device_rules[device_id] = ",".join(normalized) if normalized else ""
        else:
            self.device_rules[device_id] = str(rules or "").strip()

        return self.get_device_rules(device_id)

    # =========================
    # 停止监控
    # =========================
    def stop_monitoring(self, device_id):
        device_id = str(device_id)

        if device_id not in self.active_monitors:
            print(f"⚠️ 设备 {device_id} 不在监控中")
            self._emit_alarm_log("info", "[ALARM_MONITOR_NOT_RUNNING] device_id={}", device_id)
            return False

        print(f"--- 停止 AI 监控: {device_id} ---")
        self.active_monitors[device_id]["stop_event"].set()
        del self.active_monitors[device_id]
        self._emit_alarm_log("info", "[ALARM_MONITOR_STOPPED] device_id={}", device_id)
        return True

    # =========================
    # 主监控循环
    # =========================
    def _build_rtsp_candidates(self, rtsp_url):
        if rtsp_url == 0 or rtsp_url == "0":
            return [0]

        raw = self._normalize_rtsp_path(str(rtsp_url or ""))
        if not raw:
            return []

        candidates = []

        def _push(url):
            if url and url not in candidates:
                candidates.append(url)

        # 候选优先级：101 -> 102 -> 1 -> 当前地址，兼容不同海康通道写法。
        if "/Streaming/Channels/" in raw:
            channel_match = re.search(r"/Streaming/Channels/(\d+)", raw)
            current_channel = channel_match.group(1) if channel_match else ""

            for channel in ["101", "102", "1", current_channel]:
                if not channel:
                    continue
                v = self._replace_hik_channel(raw, channel)
                _push(v)
                _push(self._with_double_slash_path(v))

        _push(raw)
        _push(self._with_double_slash_path(raw))

        # 仅修正路径的重复斜杠，保留原始鉴权串
        if raw.startswith("rtsp://"):
            scheme, _, rest = raw.partition("://")
            if "/" in rest:
                host_part, path_part = rest.split("/", 1)
                fixed_path_url = f"{scheme}://{host_part}/" + path_part.lstrip("/")
                _push(fixed_path_url)

            # 对用户名密码做一次 decode/encode 归一化，兼容 %40 等字符
            try:
                parts = urlsplit(raw)
                host = parts.hostname or ""
                if host:
                    port = f":{parts.port}" if parts.port else ""
                    path = "/" + (parts.path or "").lstrip("/")

                    username = parts.username
                    password = parts.password

                    if username is not None:
                        u_dec = unquote(username)
                        p_dec = unquote(password or "")

                        netloc_encoded = f"{quote(u_dec, safe='')}:{quote(p_dec, safe='')}@{host}{port}"
                        encoded_url = urlunsplit((parts.scheme or "rtsp", netloc_encoded, path, parts.query, parts.fragment))
                        _push(encoded_url)
                        _push(self._with_double_slash_path(encoded_url))
                    else:
                        no_auth_url = urlunsplit((parts.scheme or "rtsp", f"{host}{port}", path, parts.query, parts.fragment))
                        _push(no_auth_url)
                        _push(self._with_double_slash_path(no_auth_url))
            except Exception:
                pass

        return candidates

    def _open_video_capture(self, rtsp_url):
        os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|stimeout;5000000")
        candidates = self._build_rtsp_candidates(rtsp_url)
        if not candidates:
            return None, None

        print(f"🔎 RTSP候选地址数: {len(candidates)}")

        for candidate in candidates:
            # 仅使用 FFmpeg 后端，避免 CAP_ANY 落到 CAP_IMAGES 触发误导性异常日志。
            try:
                print(f"🔁 尝试拉流: {candidate}")
                if candidate == 0:
                    cap = cv2.VideoCapture(0)
                else:
                    cap = cv2.VideoCapture(candidate, cv2.CAP_FFMPEG)

                if cap.isOpened():
                    print(f"✅ 拉流候选可用: {candidate}")
                    return cap, candidate

                cap.release()
            except Exception as e:
                print(f"⚠️ VideoCapture 打开失败: {candidate} | {e}")
                continue

        return None, None

    def _monitor_loop(self, device_id, rtsp_url, record_rtsp_url, algo_type_str, stop_event):
        print(f"📷 正在连接视频流: {rtsp_url}")

        # ========= DEBUG 模式 =========
        DEBUG_MODE = os.getenv("AI_DEBUG", "0") == "1"

        if DEBUG_MODE:
            print("🔥 DEBUG模式：四功能并行测试")

            test_algos = list(self.algo_handlers.keys())

            while not stop_event.is_set():
                for algo in test_algos:
                    details = {
                        "type": f"DEBUG-{algo}",
                        "msg": f"{algo} 功能链路测试报警",
                    }
                    self._save_alarm_to_db(device_id, details, "", algo_key=algo)
                time.sleep(5)

            print(f"--- DEBUG线程已退出: {device_id} ---")
            return

        # ========= 正常视频逻辑 =========
        try:
            cap, used_url = self._open_video_capture(rtsp_url)

            if cap is None:
                print("❌ 视频流打开失败")
                return
            print(f"✅ 视频流连接成功: {used_url}")

            # AI 拉流成功后再启动录像，避免部分设备因并发连接导致 AI 打不开。
            try:
                video_id = int(device_id)
                if record_rtsp_url:
                    self.video_service.start_ffmpeg_recording(video_id, record_rtsp_url)
            except Exception as e:
                print(f"⚠️ 启动分段录像失败(不影响AI检测): {e}")

        except Exception as e:
            print(f"❌ 视频流异常: {e}")
            return

        active_algos = [x.strip() for x in algo_type_str.split(",") if x.strip()]
        frame_interval = 5
        frame_count = 0

        while not stop_event.is_set():
            ret, frame = cap.read()

            if not ret:
                time.sleep(2)
                continue

            frame_count += 1
            if frame_count % frame_interval != 0:
                continue

            try:
                for algo_key in active_algos:

                    if algo_key not in self.algo_handlers:
                        print(f"⚠️ 未识别算法类型: {algo_key}")
                        continue

                    is_alarm, details = self.algo_handlers[algo_key](frame)

                    if is_alarm:
                        alarm_type = self._extract_alarm_type(details)
                        alarm_trace_id = self._new_alarm_trace_id()
                        self._emit_alarm_log(
                            "info",
                            "[ALARM_TRIGGERED] trace_id={} mode=rtsp device_id={} algo={} alarm_type={}",
                            alarm_trace_id,
                            device_id,
                            algo_key,
                            alarm_type or algo_key,
                        )
                        if not self._should_trigger_alarm(device_id, algo_key, alarm_type or algo_key, details):
                            self._emit_alarm_log(
                                "info",
                                "[ALARM_SKIPPED_COOLDOWN] trace_id={} device_id={} alarm_type={} cooldown_seconds={}",
                                alarm_trace_id,
                                device_id,
                                alarm_type or algo_key,
                                self.alarm_cooldown_seconds,
                            )
                            continue

                        details = self._normalize_alarm_details_for_frame(details, frame)
                        img_path = self._save_alarm_image(frame, device_id, details, alarm_trace_id=alarm_trace_id)
                        self._save_alarm_to_db(device_id, details, img_path, algo_key=algo_key, alarm_trace_id=alarm_trace_id)

            except Exception as logic_error:
                print(f"⚠️ 逻辑异常: {logic_error}")

            time.sleep(0.02)

        cap.release()
        print(f"--- 监控线程已退出: {device_id} ---")

    # =========================
    # 保存报警图片
    # =========================
    def _save_alarm_image(self, frame, device_id, details=None, alarm_trace_id: str | None = None):
        try:
            # 1. 如果有报警详情，先在图片上绘制报警框
            details = self._normalize_alarm_details_for_frame(details, frame)
            draw_frame = frame.copy()
            boxes = []
            if details and isinstance(details, dict):
                boxes = details.get("boxes") or []

            if boxes:
                draw_frame = self._draw_boxes_on_frame(draw_frame, boxes)

            # 2. 生成文件名并保存图片
            filename = f"{device_id}_{int(time.time())}_{uuid.uuid4().hex[:6]}.jpg"
            screenshot_dir = self.video_service._get_alarm_screenshot_root()
            filepath = os.path.join(screenshot_dir, filename)

            saved = cv2.imwrite(filepath, draw_frame)
            image_web_path = self.video_service._to_backend_static_web_path(filepath)
            if saved:
                self._emit_alarm_log(
                    "info",
                    "[ALARM_SCREENSHOT_SAVED] trace_id={} device_id={} path={}",
                    alarm_trace_id or "-",
                    device_id,
                    image_web_path,
                )
                return image_web_path

            self._emit_alarm_log(
                "error",
                "[ALARM_SCREENSHOT_SAVE_FAILED] trace_id={} device_id={} path={}",
                alarm_trace_id or "-",
                device_id,
                image_web_path,
            )
            return ""

        except Exception as e:
            print(f"❌ 图片保存失败: {e}")
            self._emit_alarm_log(
                "error",
                "[ALARM_SCREENSHOT_SAVE_EXCEPTION] trace_id={} device_id={} error={}",
                alarm_trace_id or "-",
                device_id,
                e,
            )
            return ""

    def _bind_alarm_image_filename(self, image_path: str | None, alarm_id: int, device_id: str) -> str:
        if not image_path:
            return ""

        path_name = os.path.basename(urlsplit(str(image_path)).path)
        if not path_name:
            return image_path

        if path_name.startswith(f"alarm_{alarm_id}_"):
            return image_path

        source_path = os.path.join(self.static_dir, path_name)
        if not os.path.exists(source_path):
            return image_path

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_device_id = re.sub(r"[^0-9A-Za-z_-]+", "_", str(device_id))
        target_name = f"alarm_{alarm_id}_{safe_device_id}_{timestamp}.jpg"
        target_path = os.path.join(self.static_dir, target_name)
        try:
            os.replace(source_path, target_path)
            return f"/static/alarms/{target_name}"
        except Exception as e:
            self._emit_alarm_log(
                "warning",
                "[ALARM_SCREENSHOT_RENAME_FAILED] trace_id=- alarm_id={} source={} target={} error={}",
                alarm_id,
                source_path,
                target_path,
                e,
            )
            return image_path

    def _alarm_target_key(self, details):
        if not isinstance(details, dict):
            return ""
        boxes = details.get("boxes")
        first_box = boxes[0] if isinstance(boxes, list) and boxes else {}
        person = first_box.get("person") if isinstance(first_box, dict) else {}
        if not isinstance(person, dict):
            person = {}
        return str(
            person.get("id")
            or person.get("_id")
            or first_box.get("personnel_id")
            or first_box.get("target_id")
            or first_box.get("personName")
            or person.get("username")
            or person.get("name")
            or ""
        ).strip()

    def _should_trigger_alarm(self, device_id, algo_type, alarm_type, details=None):
        if not alarm_type:
            return True

        target_key = self._alarm_target_key(details)
        key_parts = [str(device_id), str(algo_type or ""), str(alarm_type)]
        if target_key:
            key_parts.append(target_key)
        cooldown_key = ":".join(key_parts)
        now = time.time()

        with self.alarm_state_lock:
            last = self.alarm_last_trigger_time.get(cooldown_key, 0.0)
            if now - last < self.alarm_cooldown_seconds:
                return False
            self.alarm_last_trigger_time[cooldown_key] = now

        return True

    def _extract_alarm_type(self, details):
        if not isinstance(details, dict):
            return ""

        alarm_type = str(details.get("type") or "").strip()
        if alarm_type:
            return alarm_type

        boxes = details.get("boxes")
        if isinstance(boxes, list) and boxes:
            first_box = boxes[0] or {}
            return str(first_box.get("type") or "").strip()

        return ""

    def _normalize_box_coords_for_frame(self, box, frame_shape):
        if not isinstance(box, dict) or not frame_shape:
            return None

        try:
            frame_h = int(frame_shape[0])
            frame_w = int(frame_shape[1])
        except Exception:
            return None
        if frame_w <= 0 or frame_h <= 0:
            return None

        raw_values = None
        source_kind = "xyxy"
        if isinstance(box.get("coords"), (list, tuple)) and len(box.get("coords")) >= 4:
            raw_values = list(box.get("coords")[:4])
        elif isinstance(box.get("bbox"), (list, tuple)) and len(box.get("bbox")) >= 4:
            raw_values = list(box.get("bbox")[:4])
            source_kind = "xywh"
        elif all(k in box for k in ("x1", "y1", "x2", "y2")):
            raw_values = [box.get("x1"), box.get("y1"), box.get("x2"), box.get("y2")]

        if raw_values is None:
            return None

        try:
            values = [float(v) for v in raw_values]
        except (TypeError, ValueError):
            return None
        if any(not np.isfinite(v) for v in values):
            return None

        is_normalized = all(0.0 <= v <= 1.0 for v in values)

        def scale_x(v):
            return v * frame_w if is_normalized else v

        def scale_y(v):
            return v * frame_h if is_normalized else v

        x1 = scale_x(values[0])
        y1 = scale_y(values[1])
        if source_kind == "xywh":
            x2 = x1 + scale_x(values[2])
            y2 = y1 + scale_y(values[3])
        else:
            x2 = scale_x(values[2])
            y2 = scale_y(values[3])
            if x2 <= x1 or y2 <= y1:
                x2 = x1 + scale_x(values[2])
                y2 = y1 + scale_y(values[3])

        x1 = max(0.0, min(float(frame_w - 1), x1))
        y1 = max(0.0, min(float(frame_h - 1), y1))
        x2 = max(0.0, min(float(frame_w - 1), x2))
        y2 = max(0.0, min(float(frame_h - 1), y2))

        if x2 <= x1 or y2 <= y1:
            return None
        if (x2 - x1) < 2 or (y2 - y1) < 2:
            return None

        normalized_box = copy.deepcopy(box)
        normalized_box["original_coords"] = list(raw_values)
        normalized_box["coords"] = [int(round(x1)), int(round(y1)), int(round(x2)), int(round(y2))]
        normalized_box["coords_norm"] = [
            x1 / frame_w,
            y1 / frame_h,
            x2 / frame_w,
            y2 / frame_h,
        ]
        normalized_box["frame_width"] = frame_w
        normalized_box["frame_height"] = frame_h
        return normalized_box

    def _normalize_alarm_details_for_frame(self, details, frame):
        if not isinstance(details, dict) or frame is None:
            return details

        normalized_details = copy.deepcopy(details)
        frame_shape = getattr(frame, "shape", None)
        for key in ("boxes", "alarm_boxes"):
            boxes = normalized_details.get(key)
            if not isinstance(boxes, list):
                continue
            normalized_boxes = []
            for box in boxes:
                normalized_box = self._normalize_box_coords_for_frame(box, frame_shape)
                if normalized_box is not None:
                    normalized_boxes.append(normalized_box)
            normalized_details[key] = normalized_boxes
        if not normalized_details.get("boxes") and isinstance(normalized_details.get("alarm_boxes"), list):
            normalized_details["boxes"] = normalized_details["alarm_boxes"]
        return normalized_details

    def _draw_boxes_on_frame(self, frame, boxes):
        """
        在图片上绘制报警框和中文标注 (解决乱码问题)。
        使用 Pillow 库进行中文绘制。
        """
        try:
            # OpenCV 转 Pillow
            img_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            draw = ImageDraw.Draw(img_pil)

            # 加载中文字体 (Windows 默认字体，如果 Linux 需替换路径)
            font_path = r"C:\Windows\Fonts\simhei.ttf"
            if not os.path.exists(font_path):
                # 尝试其他常见中文字体名
                font_path = r"C:\Windows\Fonts\msyh.ttc"
            
            try:
                # 字体大小根据图片高度动态调整
                font_size = max(18, int(frame.shape[0] * 0.03))
                font = ImageFont.truetype(font_path, font_size)
            except Exception:
                # 极端情况回退默认
                font = ImageFont.load_default()

            frame_h, frame_w = frame.shape[:2]

            for raw_box in boxes:
                box = raw_box if isinstance(raw_box, dict) else {}
                coords_norm = box.get("coords_norm")
                if isinstance(coords_norm, (list, tuple)) and len(coords_norm) >= 4:
                    try:
                        x1 = int(round(float(coords_norm[0]) * frame_w))
                        y1 = int(round(float(coords_norm[1]) * frame_h))
                        x2 = int(round(float(coords_norm[2]) * frame_w))
                        y2 = int(round(float(coords_norm[3]) * frame_h))
                    except (TypeError, ValueError):
                        continue
                else:
                    normalized_box = self._normalize_box_coords_for_frame(box, frame.shape)
                    if normalized_box is None:
                        continue
                    coords = normalized_box.get("coords")
                    if not coords or len(coords) < 4:
                        continue
                    try:
                        x1, y1, x2, y2 = [int(round(float(v))) for v in coords[:4]]
                    except (TypeError, ValueError):
                        continue

                x1 = max(0, min(frame_w - 1, x1))
                y1 = max(0, min(frame_h - 1, y1))
                x2 = max(0, min(frame_w - 1, x2))
                y2 = max(0, min(frame_h - 1, y2))
                if x2 <= x1 or y2 <= y1:
                    continue
                label_type = box.get("type", "异常")
                msg = box.get("msg", "")

                # 绘制红色报警框 (线宽动态)
                line_width = max(2, int(frame.shape[0] * 0.005))
                draw.rectangle([x1, y1, x2, y2], outline=(255, 0, 0), width=line_width)

                # 标注信息 (模拟人员名称展示)
                # 备注：实际可关联 face_recognition 的结果
                person = box.get("person") or {}
                person_name = (
                    box.get("personName")
                    or person.get("username")
                    or person.get("name")
                    or ""
                )

                if person_name:
                    person_info = f"人员: {person_name}"
                else:
                    person_info = "人员: 未知"

                display_text = f"{label_type}\n{person_info}\n{msg}"

                # 绘制文字背景条
                try:
                    # 使用 textbbox 获取文本尺寸 (Pillow 8.0+)
                    bbox = draw.textbbox((0, 0), display_text, font=font)
                    text_w = bbox[2] - bbox[0]
                    text_h = bbox[3] - bbox[1]
                    text_x = max(0, min(x1, max(0, frame_w - text_w - 10)))
                    text_y = y1 - text_h - 10
                    if text_y < 0:
                        text_y = min(max(0, frame_h - text_h - 10), y2 + 5)
                    text_y = max(0, text_y)
                    # 往上或往下绘制背景，防止文字出界 (简化始终画在框顶部附近，略带半透明)
                    bg_rect = [
                        max(0, text_x - 5),
                        max(0, text_y - 5),
                        min(frame_w - 1, text_x + text_w + 5),
                        min(frame_h - 1, text_y + text_h + 5),
                    ]
                    draw.rectangle(bg_rect, fill=(255, 0, 0, 180))
                except Exception:
                    text_x = x1
                    text_y = max(0, y1 - font_size - 10)

                # 绘制白色文字
                draw.text((text_x, text_y), display_text, font=font, fill=(255, 255, 255))

            # Pillow 转回 OpenCV
            return cv2.cvtColor(np.asarray(img_pil), cv2.COLOR_RGB2BGR)

        except Exception as draw_err:
            print(f"⚠️ 图片标注绘制失败: {draw_err}")
            return frame

    def _draw_alarm_boxes_on_video(
        self,
        video_path,
        boxes,
        trigger_offset_seconds,
        draw_window_before=1.0,
        draw_window_after=2.0,
        alarm_trace_id=None,
    ):
        if not boxes:
            return video_path
        if not video_path:
            raise ValueError("video_path is empty")

        cap = None
        writer = None
        raw_tmp_path = f"{video_path}.boxed.raw.tmp.mp4"
        h264_tmp_path = f"{video_path}.boxed.h264.tmp.mp4"
        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                raise ValueError("cannot open video")

            fps = cap.get(cv2.CAP_PROP_FPS)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

            if not fps or fps <= 0 or width <= 0 or height <= 0:
                raise ValueError(f"invalid video metadata fps={fps} width={width} height={height}")

            writer = cv2.VideoWriter(
                raw_tmp_path,
                cv2.VideoWriter_fourcc(*"mp4v"),
                fps,
                (width, height),
            )
            if not writer.isOpened():
                raise ValueError("cannot open temp video writer")

            start_seconds = max(0.0, float(trigger_offset_seconds) - float(draw_window_before))
            end_seconds = float(trigger_offset_seconds) + float(draw_window_after)

            frame_index = 0
            while True:
                ok, frame = cap.read()
                if not ok:
                    break

                current_seconds = frame_index / fps
                if start_seconds <= current_seconds <= end_seconds:
                    frame = self._draw_boxes_on_frame(frame, boxes)

                writer.write(frame)
                frame_index += 1

            if frame_index <= 0:
                raise ValueError("no frames written")

            writer.release()
            writer = None
            cap.release()
            cap = None

            if not os.path.exists(raw_tmp_path) or os.path.getsize(raw_tmp_path) == 0:
                raise ValueError("temp boxed video is empty")

            ffmpeg_path = self.video_service._get_ffmpeg_path()
            transcode_cmd = [
                ffmpeg_path,
                "-y",
                "-i", raw_tmp_path,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-an",
                h264_tmp_path,
            ]
            transcode_proc = subprocess.run(transcode_cmd, capture_output=True, text=True)
            if transcode_proc.returncode != 0:
                logger.error(
                    "[ALARM_VIDEO_BOX_TRANSCODE_FAILED] video_path=%s stderr=%s",
                    video_path,
                    (transcode_proc.stderr or "").strip()[-4000:],
                )
                raise ValueError(
                    "boxed video transcode failed: "
                    f"{(transcode_proc.stderr or '').strip()[-1000:]}"
                )
            if not os.path.exists(h264_tmp_path) or os.path.getsize(h264_tmp_path) == 0:
                logger.error(
                    "[ALARM_VIDEO_BOX_TRANSCODE_FAILED] video_path=%s stderr=empty output",
                    video_path,
                )
                raise ValueError("boxed h264 video is empty")

            os.replace(h264_tmp_path, video_path)
            logger.info(
                "[ALARM_VIDEO_BOX_TRANSCODED] video_path=%s tmp=%s final=%s",
                video_path,
                raw_tmp_path,
                video_path,
            )
            try:
                os.remove(raw_tmp_path)
            except Exception:
                pass
            return video_path
        except Exception:
            try:
                if writer is not None:
                    writer.release()
                if cap is not None:
                    cap.release()
                if os.path.exists(raw_tmp_path):
                    os.remove(raw_tmp_path)
                if os.path.exists(h264_tmp_path):
                    os.remove(h264_tmp_path)
            except Exception:
                pass
            raise

    def _resolve_alarm_image_file_path(self, alarm_image_path: str | None) -> str:
        if not alarm_image_path:
            return ""

        parsed_path = unquote(urlsplit(str(alarm_image_path)).path)
        filename = os.path.basename(parsed_path)
        if not filename:
            return ""

        if os.path.isabs(str(alarm_image_path)) and os.path.exists(str(alarm_image_path)):
            return str(alarm_image_path)

        if parsed_path.startswith("/static/alarms/"):
            return os.path.join(self.static_dir, filename)

        candidate = os.path.join(self.static_dir, filename)
        if os.path.exists(candidate):
            return candidate

        return str(alarm_image_path)

    def _prepare_alarm_match_frame(self, frame):
        if frame is None:
            return None

        resized = cv2.resize(frame, (320, 180), interpolation=cv2.INTER_AREA)
        height, width = resized.shape[:2]
        # Ignore the camera time/title strip and the very bottom controls/text area.
        cropped = resized[int(height * 0.15):int(height * 0.92), int(width * 0.04):int(width * 0.96)]
        gray = cv2.cvtColor(cropped, cv2.COLOR_BGR2GRAY)
        return cv2.GaussianBlur(gray, (3, 3), 0)

    def _frame_match_score(self, alarm_gray, video_gray) -> float:
        if alarm_gray is None or video_gray is None or alarm_gray.shape != video_gray.shape:
            return 0.0

        corr = cv2.matchTemplate(video_gray, alarm_gray, cv2.TM_CCOEFF_NORMED)
        corr_score = float(corr[0][0]) if corr.size else 0.0
        corr_score = max(0.0, min(1.0, (corr_score + 1.0) / 2.0))

        mse = float(np.mean((alarm_gray.astype(np.float32) - video_gray.astype(np.float32)) ** 2))
        mse_score = max(0.0, 1.0 - (mse / (255.0 * 255.0)))

        hist_a = cv2.calcHist([alarm_gray], [0], None, [64], [0, 256])
        hist_b = cv2.calcHist([video_gray], [0], None, [64], [0, 256])
        cv2.normalize(hist_a, hist_a)
        cv2.normalize(hist_b, hist_b)
        hist_corr = float(cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_CORREL))
        hist_score = max(0.0, min(1.0, (hist_corr + 1.0) / 2.0))

        return (corr_score * 0.55) + (mse_score * 0.30) + (hist_score * 0.15)

    def _locate_alarm_frame_in_video(
        self,
        video_path,
        alarm_image_path,
        expected_second,
        search_before=10,
        search_after=15,
    ):
        if not video_path or not os.path.exists(video_path):
            raise ValueError("video_path is missing")

        alarm_file_path = self._resolve_alarm_image_file_path(alarm_image_path)
        if not alarm_file_path or not os.path.exists(alarm_file_path):
            raise ValueError(f"alarm image is missing: {alarm_image_path}")

        alarm_image = cv2.imread(alarm_file_path)
        if alarm_image is None:
            raise ValueError(f"cannot read alarm image: {alarm_file_path}")

        alarm_gray = self._prepare_alarm_match_frame(alarm_image)
        if alarm_gray is None:
            raise ValueError("cannot prepare alarm image")

        cap = cv2.VideoCapture(video_path)
        try:
            if not cap.isOpened():
                raise ValueError("cannot open alarm video")

            fps = cap.get(cv2.CAP_PROP_FPS) or 0
            frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
            duration = (frame_count / fps) if fps > 0 and frame_count > 0 else 0

            expected_second = float(expected_second or 0)
            start_second = max(0.0, expected_second - float(search_before))
            end_second = expected_second + float(search_after)
            if duration > 0:
                end_second = min(duration, end_second)
            if end_second < start_second:
                raise ValueError("invalid search range")

            best_second = None
            best_score = -1.0
            current_second = start_second
            while current_second <= end_second + 0.001:
                cap.set(cv2.CAP_PROP_POS_MSEC, current_second * 1000.0)
                ok, frame = cap.read()
                if ok and frame is not None:
                    video_gray = self._prepare_alarm_match_frame(frame)
                    score = self._frame_match_score(alarm_gray, video_gray)
                    if score > best_score:
                        best_score = score
                        best_second = current_second
                current_second += 0.5

            if best_second is None:
                raise ValueError("no frames sampled")

            min_score = float(os.getenv("ALARM_VIDEO_FRAME_MATCH_MIN_SCORE", "0.55"))
            if best_score < min_score:
                raise ValueError(f"match score too low: {best_score:.4f} < {min_score:.4f}")

            return int(round(best_second)), best_score
        finally:
            cap.release()

    def _get_alarm_frame_fallback_second(self, expected_second, duration_seconds=None):
        offset = int(os.getenv("ALARM_VIDEO_ALARM_SECOND_OFFSET", "7"))
        final_second = int(round(float(expected_second or 0))) + offset
        if duration_seconds:
            final_second = min(final_second, max(0, int(duration_seconds)))
        return max(0, final_second), offset

    def _save_alarm_clip_async(
        self,
        alarm_id: int,
        device_id: str,
        alarm_time: datetime,
        alarm_trace_id: str | None = None,
        details=None,
        boxes=None,
    ):
        if boxes is None and isinstance(details, dict):
            boxes = details.get("boxes") or []
        boxes = boxes if isinstance(boxes, list) else []

        def _worker():
            try:
                video_id = int(device_id)
            except Exception:
                self._update_alarm_recording_status(alarm_id, "failed", None, "device_id 非摄像头ID，无法自动录像")
                self._emit_alarm_log(
                    "error",
                    "[ALARM_VIDEO_FAILED] trace_id={} alarm_id={} device_id={} reason=device_id_not_video_id",
                    alarm_trace_id or "-",
                    alarm_id,
                    device_id,
                )
                return

            clip_before_seconds, clip_after_seconds = self._get_alarm_clip_window_seconds()
            segment_seconds = RECORD_SEGMENT_SECONDS
            if hasattr(self.video_service, "_get_record_segment_seconds"):
                try:
                    segment_seconds = self.video_service._get_record_segment_seconds()
                except Exception:
                    segment_seconds = RECORD_SEGMENT_SECONDS
            mature_buffer = segment_seconds + RECORD_SEGMENT_SAFE_MARGIN_SECONDS
            wait_seconds = clip_after_seconds + mature_buffer
            self._emit_alarm_log(
                "info",
                "[ALARM_VIDEO_SCHEDULED] trace_id={} alarm_id={} device_id={} wait_seconds={} clip_before={} clip_after={}",
                alarm_trace_id or "-",
                alarm_id,
                device_id,
                wait_seconds,
                clip_before_seconds,
                clip_after_seconds,
            )
            time.sleep(wait_seconds)

            trigger_time = alarm_time if isinstance(alarm_time, datetime) else datetime.now() - timedelta(seconds=wait_seconds)
            if getattr(trigger_time, "tzinfo", None) is not None:
                trigger_time = trigger_time.astimezone().replace(tzinfo=None)
            clip_start = trigger_time - timedelta(seconds=clip_before_seconds)
            clip_end = trigger_time + timedelta(seconds=clip_after_seconds)

            last_error = None
            failure_status = "no_video_segment"
            for attempt in range(1, 3):
                try:
                    self._emit_alarm_log(
                        "info",
                        "[ALARM_VIDEO_GENERATING] trace_id={} alarm_id={} device_id={} attempt={} clip_start={} clip_end={}",
                        alarm_trace_id or "-",
                        alarm_id,
                        device_id,
                        attempt,
                        clip_start.strftime("%Y-%m-%d %H:%M:%S"),
                        clip_end.strftime("%Y-%m-%d %H:%M:%S"),
                    )
                    result = self.video_service.save_playback_clip(
                        video_id,
                        clip_start,
                        clip_end,
                        output_type="alarm",
                        filename_prefix=f"alarm_{alarm_id}",
                    )
                    recording_full_path = result.get("recording_full_path")
                    expected_alarm_second = (trigger_time - clip_start).total_seconds()
                    duration_seconds = result.get("duration_seconds")
                    try:
                        duration_seconds = float(duration_seconds)
                    except (TypeError, ValueError):
                        duration_seconds = None

                    def _clamp_alarm_second(value):
                        try:
                            second = int(round(float(value)))
                        except (TypeError, ValueError):
                            second = 0
                        if duration_seconds and duration_seconds > 0:
                            second = min(second, max(0, int(duration_seconds) - 1))
                        return max(0, second)

                    final_alarm_second = int(round(expected_alarm_second))
                    match_score = None
                    alarm_record = self._find_alarm_doc_by_id(alarm_id) or {}
                    alarm_image_path = alarm_record.get("alarm_image_path") or ""
                    try:
                        final_alarm_second, match_score = self._locate_alarm_frame_in_video(
                            recording_full_path,
                            alarm_image_path,
                            expected_alarm_second,
                        )
                        self._emit_alarm_log(
                            "info",
                            "[ALARM_VIDEO_FRAME_MATCHED] alarm_id={} expected={} actual={} score={:.4f}",
                            alarm_id,
                            int(round(expected_alarm_second)),
                            final_alarm_second,
                            match_score,
                        )
                    except Exception as match_error:
                        final_alarm_second, fallback_offset = self._get_alarm_frame_fallback_second(
                            expected_alarm_second,
                            result.get("duration_seconds"),
                        )
                        self._emit_alarm_log(
                            "warning",
                            "[ALARM_VIDEO_FRAME_MATCH_FALLBACK] alarm_id={} expected={} offset={} final={} reason={}",
                            alarm_id,
                            int(round(expected_alarm_second)),
                            fallback_offset,
                            final_alarm_second,
                            match_error,
                        )
                    final_alarm_second = _clamp_alarm_second(final_alarm_second)

                    if boxes:
                        try:
                            self._draw_alarm_boxes_on_video(
                                recording_full_path,
                                boxes,
                                final_alarm_second,
                                alarm_trace_id=alarm_trace_id,
                            )
                            try:
                                alarm_root = self.video_service._get_alarm_video_root()
                                rel_path = os.path.relpath(recording_full_path, alarm_root)
                                self.video_service._mirror_write_file(
                                    recording_full_path,
                                    os.path.join("alarm_videos", rel_path),
                                )
                            except Exception:
                                pass
                            self._emit_alarm_log(
                                "info",
                                "[ALARM_VIDEO_BOXED] trace_id={} alarm_id={} path={} box_count={}",
                                alarm_trace_id or "-",
                                alarm_id,
                                recording_full_path,
                                len(boxes),
                            )
                        except Exception as box_error:
                            self._emit_alarm_log(
                                "error",
                                "[ALARM_VIDEO_BOX_FAILED] trace_id={} alarm_id={} error={}",
                                alarm_trace_id or "-",
                                alarm_id,
                                box_error,
                            )
                    else:
                        self._emit_alarm_log(
                            "info",
                            "[ALARM_VIDEO_BOX_SKIPPED] trace_id={} alarm_id={} reason=no_boxes",
                            alarm_trace_id or "-",
                            alarm_id,
                        )
                    self._update_alarm_recording_status(
                        alarm_id,
                        "saved",
                        result.get("recording_path"),
                        None,
                        duration_seconds=result.get("duration_seconds"),
                        start_time=result.get("start_time"),
                        end_time=result.get("end_time"),
                        alarm_second=final_alarm_second,
                    )
                    print(f"✅ 报警视频已保存 (alarm_id={alarm_id}): {result.get('recording_path')}")
                    self._emit_alarm_log(
                        "info",
                        "[ALARM_VIDEO_SAVED] trace_id={} alarm_id={} device_id={} path={}",
                        alarm_trace_id or "-",
                        alarm_id,
                        device_id,
                        result.get("recording_path"),
                    )
                    return
                except Exception as e:
                    last_error = e
                    error_text = str(e)
                    if "合并失败" in error_text or "裁剪失败" in error_text or "生成的视频文件" in error_text:
                        failure_status = "video_failed"
                    else:
                        failure_status = "no_video_segment"
                    self._emit_alarm_log(
                        "warning",
                        "[ALARM_VIDEO_RETRY] trace_id={} alarm_id={} device_id={} attempt={} error={}",
                        alarm_trace_id or "-",
                        alarm_id,
                        device_id,
                        attempt,
                        e,
                    )
                    if attempt < 2:
                        time.sleep(max(8, RECORD_SEGMENT_SAFE_MARGIN_SECONDS))

            self._update_alarm_recording_status(alarm_id, failure_status, None, str(last_error))
            print(f"❌ 报警视频保存失败 (alarm_id={alarm_id}): {last_error}")
            self._emit_alarm_log(
                "error",
                "[ALARM_VIDEO_FAILED] trace_id={} alarm_id={} device_id={} error={}",
                alarm_trace_id or "-",
                alarm_id,
                device_id,
                last_error,
            )

        threading.Thread(target=_worker, daemon=True).start()

    def _get_alarm_clip_window_seconds(self) -> tuple[int, int]:
        settings = get_system_settings()
        minutes = settings.get("alarmVideoSurroundMinutes")
        if minutes is None:
            before = int(os.getenv("ALARM_VIDEO_CLIP_BEFORE_SECONDS", "30"))
            after = int(os.getenv("ALARM_VIDEO_CLIP_AFTER_SECONDS", "30"))
            return max(1, before), max(1, after)

        try:
            seconds = int(float(minutes) * 60)
        except (TypeError, ValueError):
            seconds = 30
        seconds = max(1, seconds)
        return seconds, seconds

    def _update_alarm_recording_status(
        self,
        alarm_id: int,
        status: str,
        path: str | None,
        error: str | None,
        duration_seconds: int | None = None,
        start_time: str | None = None,
        end_time: str | None = None,
        alarm_second: int | None = None,
    ):
        try:
            record = self._find_alarm_doc_by_id(alarm_id)
            if not record:
                return

            updates = {
                "recording_status": status,
                "recording_path": path or "",
                "recording_error": (error[:255] if error else ""),
                "duration_seconds": duration_seconds or 0,
                "alarm_second": alarm_second,
                "recording_start_time": start_time,
                "recording_end_time": end_time,
            }

            self._update_alarm_fields(alarm_id, updates)
            updated_record = self._find_alarm_doc_by_id(alarm_id) or record
            self._emit_alarm_log(
                "info",
                "[ALARM_RECORD_BINDING] alarm_id={} image={} video={} alarm_second={}",
                alarm_id,
                updated_record.get("alarm_image_path") or "",
                updated_record.get("recording_path") or "",
                updated_record.get("alarm_second"),
            )
        except Exception as e:
            print(f"⚠️ 更新报警录像状态失败 alarm_id={alarm_id}: {e}")

    # =========================
    # 写数据库
    # =========================
    def _save_alarm_to_db(self, device_id, details, image_path, algo_key: str | None = None, alarm_trace_id: str | None = None):
        if not details:
            return None

        # 兼容两种返回格式:
        # 1) {"type": "...", "msg": "..."}
        # 2) {"alarm": true, "boxes": [{"type": "...", "msg": "..."}]}
        alarm_type = self._extract_alarm_type(details)
        alarm_msg = details.get("msg") if isinstance(details, dict) else None
        boxes = (details.get("boxes") or []) if isinstance(details, dict) else []
        boxes = boxes if isinstance(boxes, list) else []

        box_count = 0
        person_info = {}
        person_name = ""
        personnel_id = ""

        if isinstance(details, dict) and isinstance(details.get("boxes"), list) and details["boxes"]:
            first_box = details["boxes"][0] or {}
            alarm_msg = alarm_msg or first_box.get("msg")
            box_count = len(details["boxes"])

            person_info = first_box.get("person") or {}
            person_name = (
                first_box.get("personName")
                or person_info.get("username")
                or person_info.get("name")
                or ""
            )
            personnel_id = str(
                person_info.get("id")
                or person_info.get("_id")
                or first_box.get("personnel_id")
                or ""
            )

        if not alarm_type:
            alarm_type = "unknown"
        if not alarm_msg:
            alarm_msg = "检测到异常"

        # 根据检测算法 code / 告警类型 / 中文名称获取对应的告警等级
        severity = self._resolve_ai_alarm_severity(alarm_type, algo_key=algo_key, details=details)
        # 方便排查：描述里附带框数量
        if box_count > 0:
            alarm_msg = f"{alarm_msg}（检测框数量: {box_count}）"

        try:
            next_id = int(get_next_sequence("alarm_record_id"))
            now = datetime.now()
            bound_image_path = self._bind_alarm_image_filename(image_path, next_id, str(device_id))

            project_id = self._infer_project_id_from_device(device_id)
            payload = {
                "id": next_id,
                "device_id": str(device_id),
                "trigger_device_id": device_id,
                "fence_id": None,
                "project_id": project_id,
                "alarm_source": "video",
                "source_type": "video",
                "alarm_type": alarm_type,
                "behavior_code": algo_key or alarm_type,
                "severity": severity,
                "timestamp": now,
                "description": alarm_msg,
                "status": "pending",
                "handled_at": None,
                "location": None,
                "recording_path": "",
                "recording_status": "pending",
                "recording_error": "",
                "alarm_image_path": bound_image_path or "",
                "alarm_boxes": boxes,

                # 人脸识别融合后的人员信息
                "personnel_id": personnel_id,
                "person_name": person_name or "未知",
                "person": person_info or {},
            }
            payload = AlarmService()._apply_org_snapshot_to_payload(payload)

            self._alarm_collection().insert_one(payload)
            saved_payload = self._find_alarm_doc_by_id(next_id) or payload

            print(f"[alarm] save db: device_id={device_id}, image_path={bound_image_path}, alarm_type={alarm_type}, alarm_msg={alarm_msg}")
            self._emit_alarm_log(
                "info",
                "[ALARM_DB_SAVED] trace_id={} alarm_id={} device_id={} alarm_type={} image_path={} status=pending",
                alarm_trace_id or "-",
                next_id,
                device_id,
                alarm_type,
                bound_image_path or "",
            )

            self._save_alarm_clip_async(
                next_id,
                str(device_id),
                now,
                alarm_trace_id=alarm_trace_id,
                boxes=boxes,
            )

            print(f"✅ 报警已保存 (ID: {next_id})")
            websocket_payload = {
                "id": saved_payload.get("id", next_id),
                "device_id": str(saved_payload.get("device_id", device_id)),
                "alarm_type": saved_payload.get("alarm_type", alarm_type),
                "description": saved_payload.get("description", alarm_msg),
                "timestamp": (
                    saved_payload.get("timestamp").isoformat()
                    if hasattr(saved_payload.get("timestamp"), "isoformat")
                    else str(saved_payload.get("timestamp") or now.isoformat())
                ),
                "alarm_image_path": saved_payload.get("alarm_image_path", bound_image_path or ""),
                "recording_status": saved_payload.get("recording_status", "pending"),
                "alarm_boxes": boxes,
            }
            push_alarm_threadsafe(websocket_payload)
            return next_id

        except Exception as e:
            print(f"❌ 数据库写入失败: {e}")
            self._emit_alarm_log(
                "error",
                "[ALARM_DB_SAVE_FAILED] trace_id={} device_id={} alarm_type={} error={}",
                alarm_trace_id or "-",
                device_id,
                alarm_type,
                e,
            )
            return None


ai_manager = AIManager()
