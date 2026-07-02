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
import sys
from datetime import datetime, timedelta
from app.services.ai_service import AIService
from app.core.database import SessionLocal, get_mongo_db, get_next_sequence
from app.services import ai_features
from app.services.video_service import (
    VideoService,
    RECORD_SEGMENT_SECONDS,
    RECORD_SEGMENT_SAFE_MARGIN_SECONDS,
    ALARM_VIDEO_FFMPEG_TIMEOUT_SECONDS,
)
from app.services.ai_runtime import detect_frame
from app.services.ai_runtime.model_registry import list_model_configs
from app.services.ai_runtime.result_adapter import to_alarm_boxes
from app.services.alarm_service import AlarmService
from urllib.parse import urlsplit, urlunsplit, unquote, quote
from PIL import Image, ImageDraw, ImageFont
from app.utils.logger import get_logger
from app.core.ws_manager import push_alarm_threadsafe
from app.utils.config_manager import get_system_settings


logger = get_logger("AIManager")

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class AIManager:
    PERSON_DETECTOR_ALGO = "person"
    PERSON_SCOPED_ALGOS = {
        "helmet",
        "vest",
        "reflective_vest",
        "smoking",
        "phone",
        "phone_call",
        "calling",
        "mask",
        "face",
    }
    FULL_FRAME_ALGOS = {
        "fire",
        "flame",
        "smoke",
        "manhole",
        "intrusion",
        "crowd",
        "fall",
    }
    PERSON_TRACK_MAX_MISSES = 8
    PERSON_TRACK_IOU_THRESHOLD = 0.25
    PERSON_TRACK_NMS_IOU_THRESHOLD = 0.55
    PERSON_TRACK_MIN_SCORE = float(os.getenv("AI_PERSON_TRACK_MIN_SCORE", "0.55"))
    PERSON_TRACK_MAX_AREA_RATIO = float(os.getenv("AI_PERSON_TRACK_MAX_AREA_RATIO", "0.65"))
    PERSON_TRACK_MIN_ASPECT_RATIO = float(os.getenv("AI_PERSON_TRACK_MIN_ASPECT_RATIO", "0.25"))
    PERSON_TRACK_MAX_ASPECT_RATIO = float(os.getenv("AI_PERSON_TRACK_MAX_ASPECT_RATIO", "1.4"))
    PERSON_ROI_PADDING_RATIO = 0.12
    FACE_VOTE_WINDOW_SECONDS = float(os.getenv("AI_FACE_VOTE_WINDOW_SECONDS", "12"))
    FACE_VOTE_MIN_SAMPLES = int(os.getenv("AI_FACE_VOTE_MIN_SAMPLES", "3"))
    FACE_VOTE_MIN_RATIO = float(os.getenv("AI_FACE_VOTE_MIN_RATIO", "0.6"))
    FACE_VOTE_MIN_SIMILARITY = float(os.getenv("AI_FACE_VOTE_MIN_SIMILARITY", "0.38"))

    CURRENT_AI_ALARM_LEVELS = {
        "head": "HIGH",
        "no_helmet": "HIGH",
        "safehat": "LOW",
        "helmet": "LOW",
        "person": "HIGH",
        "smoking": "HIGH",
        "fire": "SEVERE",
        "flame": "SEVERE",
        "smoke": "SEVERE",
        "火": "SEVERE",
        "reflection": "LOW",
        "reflective_vest": "LOW",
        "clothes": "MEDIUM",
        "no_vest": "MEDIUM",
        "phone": "HIGH",
        "call": "HIGH",
        "calling": "HIGH",
    }

    CURRENT_AI_BEHAVIOR_ALIASES = {
        "helmet": ("head", "no_helmet", "safehat", "helmet"),
        "person": ("person",),
        "smoking": ("smoking",),
        "smoke": ("smoke",),
        "fire": ("fire", "flame", "火"),
        "vest": ("reflection", "reflective_vest", "clothes", "no_vest"),
        "phone": ("phone", "call", "calling"),
    }

    def __init__(self):
        self.active_monitors = {}
        self.device_rules = {}
        self.latest_person_tracks = {}
        self.latest_person_tracks_lock = threading.Lock()
        self.frontend_frame_trackers = {}
        self.frontend_frame_trackers_lock = threading.Lock()
        self.frontend_person_debug = {}
        self.frontend_person_debug_lock = threading.Lock()
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

    def get_latest_person_tracks(self, device_id):
        key = str(device_id)
        with self.latest_person_tracks_lock:
            payload = copy.deepcopy(self.latest_person_tracks.get(key) or {})
        if not payload:
            return {
                "device_id": key,
                "timestamp": None,
                "frame_width": None,
                "frame_height": None,
                "tracks": [],
            }
        try:
            timestamp = payload.get("timestamp")
            if timestamp:
                updated_at = datetime.fromisoformat(str(timestamp))
                payload["age_ms"] = int(max(0.0, (datetime.now() - updated_at).total_seconds()) * 1000)
                try:
                    stale_seconds = max(1.0, float(os.getenv("AI_PERSON_TRACK_STALE_SECONDS", "3.0")))
                except ValueError:
                    stale_seconds = 3.0
                if datetime.now() - updated_at > timedelta(seconds=stale_seconds):
                    return {
                        "device_id": key,
                        "timestamp": datetime.now().isoformat(),
                        "frame_width": payload.get("frame_width"),
                        "frame_height": payload.get("frame_height"),
                        "tracks": [],
                        "stale": True,
                        "age_ms": payload.get("age_ms"),
                    }
        except Exception:
            pass
        return payload

    def _publish_latest_person_tracks(self, device_id, frame, person_tracks):
        frame_h, frame_w = frame.shape[:2] if frame is not None and getattr(frame, "shape", None) is not None else (0, 0)
        tracks = []
        for track in person_tracks or []:
            misses = int(track.get("misses", 0) or 0)
            if misses > self.PERSON_TRACK_MAX_MISSES:
                continue
            coords = track.get("coords") or []
            if len(coords) < 4 or not frame_w or not frame_h:
                continue
            try:
                x1, y1, x2, y2 = [float(v) for v in coords[:4]]
            except Exception:
                continue
            tracks.append({
                "track_id": track.get("track_id"),
                "coords": [int(x1), int(y1), int(x2), int(y2)],
                "coords_norm": [
                    max(0.0, min(1.0, x1 / frame_w)),
                    max(0.0, min(1.0, y1 / frame_h)),
                    max(0.0, min(1.0, x2 / frame_w)),
                    max(0.0, min(1.0, y2 / frame_h)),
                ],
                "personnel_id": track.get("personnel_id") or track.get("candidate_personnel_id"),
                "personName": track.get("personName") or track.get("candidate_personName"),
                "face_similarity": track.get("face_similarity") or track.get("candidate_face_similarity"),
                "face_confirmed": bool(track.get("face_confirmed")),
                "candidate_personnel_id": track.get("candidate_personnel_id"),
                "candidate_personName": track.get("candidate_personName"),
                "candidate_face_similarity": track.get("candidate_face_similarity"),
                "face_vote_count": track.get("face_vote_count"),
                "face_vote_total": track.get("face_vote_total"),
                "score": (track.get("box") or {}).get("score"),
                "misses": misses,
            })
        with self.latest_person_tracks_lock:
            self.latest_person_tracks[str(device_id)] = {
                "device_id": str(device_id),
                "timestamp": datetime.now().isoformat(),
                "frame_width": frame_w or None,
                "frame_height": frame_h or None,
                "tracks": tracks,
            }

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

    def _format_detection_result(self, algo_key, is_alarm, details):
        status = "alarm" if is_alarm else "ok"
        alarm_type = self._extract_alarm_type(details) if is_alarm else ""
        if alarm_type:
            status = f"{status}({alarm_type})"
        return f"{algo_key}:{status}"

    def _split_detection_algos(self, active_algos):
        person_scoped = []
        full_frame = []
        track_people = False
        for algo_key in active_algos:
            normalized = str(algo_key or "").strip()
            if not normalized:
                continue
            if normalized in {self.PERSON_DETECTOR_ALGO, "face"}:
                track_people = True
                continue
            if normalized in self.PERSON_SCOPED_ALGOS:
                track_people = True
                person_scoped.append(normalized)
            else:
                full_frame.append(normalized)
        return person_scoped, full_frame, track_people

    def _iou(self, a, b):
        try:
            ax1, ay1, ax2, ay2 = [float(v) for v in a[:4]]
            bx1, by1, bx2, by2 = [float(v) for v in b[:4]]
        except Exception:
            return 0.0
        ix1 = max(ax1, bx1)
        iy1 = max(ay1, by1)
        ix2 = min(ax2, bx2)
        iy2 = min(ay2, by2)
        inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
        area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
        denom = area_a + area_b - inter
        return inter / denom if denom > 0 else 0.0

    def _box_center_inside(self, inner_box, outer_box):
        try:
            x1, y1, x2, y2 = [float(v) for v in inner_box[:4]]
            ox1, oy1, ox2, oy2 = [float(v) for v in outer_box[:4]]
        except Exception:
            return False
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        return ox1 <= cx <= ox2 and oy1 <= cy <= oy2

    def _detect_person_boxes(self, frame, device_id=None, use_model_tracker=True, strict_filter=True):
        min_score = self.PERSON_TRACK_MIN_SCORE if strict_filter else float(os.getenv("AI_FRONTEND_PERSON_MIN_SCORE", "0.35"))
        model_conf = min_score if strict_filter else float(os.getenv("AI_FRONTEND_PERSON_MODEL_CONF", "0.18"))
        imgsz = int(os.getenv(
            "AI_PERSON_TRACK_IMGSZ" if strict_filter else "AI_FRONTEND_PERSON_IMGSZ",
            "480" if strict_filter else "640",
        ))
        debug_info = {
            "raw": 0,
            "kept": 0,
            "min_score": min_score,
            "model_conf": model_conf,
            "imgsz": imgsz,
            "filtered": {},
            "labels": [],
            "error": "",
        }
        try:
            result = detect_frame(
                self.PERSON_DETECTOR_ALGO,
                frame,
                track=bool(use_model_tracker),
                persist=bool(use_model_tracker),
                tracker=os.getenv("AI_PERSON_TRACKER", "botsort.yaml"),
                classes=[0],
                imgsz=imgsz,
                conf=model_conf,
                tracker_scope=str(device_id or "default"),
            )
        except Exception as exc:
            self._emit_alarm_log("warning", "[PERSON_DETECT_FAILED] error={}", exc)
            debug_info["error"] = str(exc)
            if not strict_filter:
                with self.frontend_person_debug_lock:
                    self.frontend_person_debug[str(device_id)] = debug_info
            return []
        if not result.get("success"):
            self._emit_alarm_log("warning", "[PERSON_DETECT_FAILED] error={}", result.get("error"))
            debug_info["error"] = str(result.get("error") or "")
            if not strict_filter:
                with self.frontend_person_debug_lock:
                    self.frontend_person_debug[str(device_id)] = debug_info
            return []

        raw_boxes = to_alarm_boxes(result, None)
        debug_info["raw"] = len(raw_boxes or [])
        boxes = []
        for box in raw_boxes:
            normalized_box = self._normalize_box_coords_for_frame(box, getattr(frame, "shape", None))
            if normalized_box is None:
                debug_info["filtered"]["bad_coords"] = debug_info["filtered"].get("bad_coords", 0) + 1
                continue
            label = str(normalized_box.get("label") or normalized_box.get("type") or "").lower()
            raw_label = str(normalized_box.get("raw_label") or "").lower()
            debug_info["labels"].append({
                "label": label,
                "raw_label": raw_label,
                "score": float(normalized_box.get("score") or normalized_box.get("confidence") or 0.0),
            })
            if label and "person" not in label and "people" not in label and "worker" not in label and "person" not in raw_label:
                debug_info["filtered"]["label"] = debug_info["filtered"].get("label", 0) + 1
                continue
            score = float(normalized_box.get("score") or normalized_box.get("confidence") or 0.0)
            if score and score < min_score:
                debug_info["filtered"]["score"] = debug_info["filtered"].get("score", 0) + 1
                continue
            if strict_filter:
                frame_h, frame_w = frame.shape[:2]
                x1, y1, x2, y2 = [float(v) for v in normalized_box.get("coords")[:4]]
                box_w = max(1.0, x2 - x1)
                box_h = max(1.0, y2 - y1)
                area_ratio = (box_w * box_h) / max(1.0, float(frame_w * frame_h))
                aspect_ratio = box_w / box_h
                if area_ratio > self.PERSON_TRACK_MAX_AREA_RATIO:
                    debug_info["filtered"]["area"] = debug_info["filtered"].get("area", 0) + 1
                    continue
                if aspect_ratio < self.PERSON_TRACK_MIN_ASPECT_RATIO or aspect_ratio > self.PERSON_TRACK_MAX_ASPECT_RATIO:
                    debug_info["filtered"]["aspect"] = debug_info["filtered"].get("aspect", 0) + 1
                    continue
            normalized_box["type"] = "person"
            normalized_box["label"] = "person"
            boxes.append(normalized_box)
        kept = self._dedupe_person_boxes(boxes)
        debug_info["kept"] = len(kept)
        if not strict_filter:
            with self.frontend_person_debug_lock:
                self.frontend_person_debug[str(device_id)] = debug_info
            print(
                f"[AI_FRONTEND_PERSON_DETECT] device_id={device_id} raw={debug_info['raw']} kept={debug_info['kept']} "
                f"model_conf={model_conf} min_score={min_score} imgsz={imgsz} filtered={debug_info['filtered']} labels={debug_info['labels'][:3]}"
            )
        return kept

    def _dedupe_person_boxes(self, boxes):
        sorted_boxes = sorted(
            boxes or [],
            key=lambda box: float(box.get("score") or box.get("confidence") or 0.0),
            reverse=True,
        )
        kept = []
        for box in sorted_boxes:
            coords = box.get("coords") or []
            if len(coords) < 4:
                continue
            if any(self._iou(coords, existing.get("coords") or []) >= self.PERSON_TRACK_NMS_IOU_THRESHOLD for existing in kept):
                continue
            kept.append(box)
        return kept

    def _face_identity_from_match(self, match):
        if not isinstance(match, dict):
            return None
        person = match.get("person") if isinstance(match.get("person"), dict) else {}
        personnel_id = match.get("personnel_id") or person.get("id") or person.get("_id")
        person_name = match.get("personName") or match.get("label") or person.get("username") or person.get("name")
        if not personnel_id or not person_name:
            return None
        try:
            similarity = float(match.get("similarity") or match.get("face_similarity") or 0.0)
        except Exception:
            similarity = 0.0
        if similarity and similarity < self.FACE_VOTE_MIN_SIMILARITY:
            return None
        return {
            "personnel_id": str(personnel_id),
            "personName": str(person_name),
            "person": person,
            "similarity": similarity,
        }

    def _apply_face_vote_to_track(self, track, match):
        identity = self._face_identity_from_match(match)
        if not identity:
            return
        now = time.time()
        votes = [
            vote for vote in track.get("face_votes", [])
            if now - float(vote.get("time", 0.0) or 0.0) <= self.FACE_VOTE_WINDOW_SECONDS
        ]
        votes.append({**identity, "time": now})
        track["face_votes"] = votes
        track["candidate_personnel_id"] = identity.get("personnel_id")
        track["candidate_personName"] = identity.get("personName")
        track["candidate_person"] = identity.get("person") or {}
        track["candidate_face_similarity"] = identity.get("similarity")

        grouped = {}
        for vote in votes:
            key = vote.get("personnel_id")
            if not key:
                continue
            item = grouped.setdefault(key, {"count": 0, "similarity_sum": 0.0, "latest": vote})
            item["count"] += 1
            item["similarity_sum"] += float(vote.get("similarity") or 0.0)
            item["latest"] = vote
        if not grouped:
            return

        best_key, best = max(grouped.items(), key=lambda item: (item[1]["count"], item[1]["similarity_sum"]))
        total = len(votes)
        count = int(best["count"])
        latest = best["latest"]
        track["candidate_personnel_id"] = best_key
        track["candidate_personName"] = latest.get("personName")
        track["candidate_person"] = latest.get("person") or {}
        track["candidate_face_similarity"] = best["similarity_sum"] / max(1, count)
        track["face_vote_count"] = count
        track["face_vote_total"] = total
        if count < self.FACE_VOTE_MIN_SAMPLES or (count / max(1, total)) < self.FACE_VOTE_MIN_RATIO:
            return

        track["personnel_id"] = best_key
        track["personName"] = latest.get("personName")
        track["person"] = latest.get("person") or {}
        track["face_similarity"] = best["similarity_sum"] / max(1, count)
        track["face_vote_count"] = count
        track["face_vote_total"] = total
        track["face_confirmed"] = True

    def _update_person_tracks(self, tracker_state, person_boxes, face_matches=None):
        tracker_state = tracker_state or {"next_id": 1, "tracks": []}
        if any(box.get("track_id") is not None for box in person_boxes or []):
            tracks = []
            for box in person_boxes or []:
                raw_track_id = box.get("track_id")
                if raw_track_id is None:
                    continue
                track = {
                    "track_id": f"person_{raw_track_id}",
                    "coords": box.get("coords"),
                    "box": box,
                    "misses": 0,
                    "last_seen": time.time(),
                }
                tracks.append(track)
            tracker_state["tracks"] = tracks
            if face_matches:
                for track in tracker_state["tracks"]:
                    match = self._select_face_match_for_box(track.get("box") or {"coords": track.get("coords")}, face_matches)
                    if not match:
                        continue
                    face_coords = self._box_coords(match)
                    if face_coords is not None and not (
                        self._iou(face_coords, track.get("coords", [])) > 0
                        or self._box_center_inside(face_coords, track.get("coords", []))
                    ):
                        continue
                    self._apply_face_vote_to_track(track, match)
            return tracker_state["tracks"]

        tracks = tracker_state.setdefault("tracks", [])
        next_id = int(tracker_state.get("next_id", 1) or 1)

        unmatched_tracks = set(range(len(tracks)))
        matched_box_indices = set()
        for box_index, box in enumerate(person_boxes):
            coords = box.get("coords")
            best_track_index = None
            best_score = 0.0
            for track_index in list(unmatched_tracks):
                score = self._iou(coords, tracks[track_index].get("coords", []))
                if score > best_score:
                    best_score = score
                    best_track_index = track_index
            if best_track_index is not None and best_score >= self.PERSON_TRACK_IOU_THRESHOLD:
                track = tracks[best_track_index]
                track["coords"] = coords
                track["box"] = box
                track["misses"] = 0
                track["last_seen"] = time.time()
                unmatched_tracks.discard(best_track_index)
                matched_box_indices.add(box_index)

        for box_index, box in enumerate(person_boxes):
            if box_index in matched_box_indices:
                continue
            tracks.append({
                "track_id": f"person_{next_id}",
                "coords": box.get("coords"),
                "box": box,
                "misses": 0,
                "last_seen": time.time(),
            })
            next_id += 1

        for track_index in list(unmatched_tracks):
            if track_index < len(tracks):
                tracks[track_index]["misses"] = int(tracks[track_index].get("misses", 0)) + 1

        tracker_state["tracks"] = [
            track
            for track in tracks
            if int(track.get("misses", 0)) <= self.PERSON_TRACK_MAX_MISSES
        ]
        tracker_state["next_id"] = next_id

        if face_matches:
            for track in tracker_state["tracks"]:
                match = self._select_face_match_for_box(track.get("box") or {"coords": track.get("coords")}, face_matches)
                if not match:
                    continue
                face_coords = self._box_coords(match)
                if face_coords is not None and not (
                    self._iou(face_coords, track.get("coords", [])) > 0
                    or self._box_center_inside(face_coords, track.get("coords", []))
                ):
                    continue
                self._apply_face_vote_to_track(track, match)

        return tracker_state["tracks"]

    def _expand_person_roi(self, frame, coords):
        if frame is None or not coords:
            return None, None
        frame_h, frame_w = frame.shape[:2]
        try:
            x1, y1, x2, y2 = [float(v) for v in coords[:4]]
        except Exception:
            return None, None
        pad = self.PERSON_ROI_PADDING_RATIO * max(x2 - x1, y2 - y1)
        x1 = int(max(0, round(x1 - pad)))
        y1 = int(max(0, round(y1 - pad)))
        x2 = int(min(frame_w, round(x2 + pad)))
        y2 = int(min(frame_h, round(y2 + pad)))
        if x2 <= x1 or y2 <= y1:
            return None, None
        return frame[y1:y2, x1:x2].copy(), (x1, y1, x2, y2)

    def _translate_details_from_roi(self, details, roi_rect, full_frame_shape, track):
        if not isinstance(details, dict) or not roi_rect or not full_frame_shape:
            return details
        translated = copy.deepcopy(details)
        roi_x1, roi_y1, roi_x2, roi_y2 = roi_rect
        roi_shape = (max(1, roi_y2 - roi_y1), max(1, roi_x2 - roi_x1), 3)
        frame_h, frame_w = full_frame_shape[:2]
        track_coords = list(track.get("coords") or [])
        boxes = []

        for box in self._extract_alarm_boxes(translated):
            normalized = self._normalize_box_coords_for_frame(box, roi_shape)
            if normalized is None:
                continue
            x1, y1, x2, y2 = normalized["coords"]
            full_coords = [
                int(max(0, min(frame_w - 1, x1 + roi_x1))),
                int(max(0, min(frame_h - 1, y1 + roi_y1))),
                int(max(0, min(frame_w - 1, x2 + roi_x1))),
                int(max(0, min(frame_h - 1, y2 + roi_y1))),
            ]
            if full_coords[2] <= full_coords[0] or full_coords[3] <= full_coords[1]:
                continue
            normalized["coords"] = full_coords
            normalized["coords_norm"] = [
                full_coords[0] / frame_w,
                full_coords[1] / frame_h,
                full_coords[2] / frame_w,
                full_coords[3] / frame_h,
            ]
            normalized["frame_width"] = frame_w
            normalized["frame_height"] = frame_h
            normalized["source"] = "person_roi"
            normalized["person_track_id"] = track.get("track_id")
            normalized["target_id"] = track.get("track_id")
            normalized["person_box"] = track_coords
            if len(track_coords) >= 4:
                normalized["person_box_norm"] = [
                    float(track_coords[0]) / frame_w,
                    float(track_coords[1]) / frame_h,
                    float(track_coords[2]) / frame_w,
                    float(track_coords[3]) / frame_h,
                ]
            if track.get("personnel_id"):
                normalized["personnel_id"] = track.get("personnel_id")
            if track.get("personName"):
                normalized["personName"] = track.get("personName")
            if track.get("person"):
                normalized["person"] = track.get("person")
            if track.get("face_similarity") is not None:
                normalized["face_similarity"] = track.get("face_similarity")
            if track.get("face_confirmed"):
                normalized["face_confirmed"] = True
                normalized["face_vote_count"] = track.get("face_vote_count")
                normalized["face_vote_total"] = track.get("face_vote_total")
            boxes.append(normalized)

        if boxes:
            translated["alarm_boxes"] = boxes
            translated["boxes"] = boxes
        translated["person_track_id"] = track.get("track_id")
        translated["target_id"] = track.get("track_id")
        translated["person_box"] = track_coords
        translated["personnel_id"] = track.get("personnel_id") or translated.get("personnel_id")
        translated["personName"] = track.get("personName") or translated.get("personName")
        if track.get("face_confirmed"):
            translated["face_confirmed"] = True
            translated["face_vote_count"] = track.get("face_vote_count")
            translated["face_vote_total"] = track.get("face_vote_total")
        if track.get("person"):
            translated["person"] = track.get("person")
        return translated

    def _handle_alarm_result(self, frame, device_id, algo_key, details, alarm_trace_id, mode):
        alarm_type = self._extract_alarm_type(details)
        self._emit_alarm_log(
            "info",
            "[ALARM_TRIGGERED] trace_id={} mode={} device_id={} algo={} alarm_type={}",
            alarm_trace_id,
            mode,
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
            return False

        details = self._normalize_alarm_details_for_frame(details, frame)
        img_path = self._save_alarm_image(frame, device_id, details, alarm_trace_id=alarm_trace_id)
        self._save_alarm_to_db(device_id, details, img_path, algo_key=algo_key, alarm_trace_id=alarm_trace_id)
        return True

    def _process_detection_frame(self, frame, device_id, active_algos, tracker_state, mode, monitor_id="", use_model_tracker=True, strict_person_filter=True):
        detection_results = []
        person_scoped_algos, full_frame_algos, track_people = self._split_detection_algos(active_algos)
        active_algo_set = {str(algo or "").strip() for algo in active_algos}
        needs_face_trace = "face" in active_algo_set or bool(full_frame_algos)
        face_matches = tracker_state.get("face_matches") or []
        if needs_face_trace:
            try:
                face_interval = max(0.5, float(os.getenv("AI_FACE_TRACE_INTERVAL_SECONDS", "3.0")))
            except ValueError:
                face_interval = 3.0
            now = time.time()
            last_face_trace_at = float(tracker_state.get("face_trace_at", 0.0) or 0.0)
            if now - last_face_trace_at >= face_interval:
                face_started_at = time.time()
                face_matches = self._run_face_trace_for_frame(frame)
                tracker_state["face_matches"] = face_matches
                tracker_state["face_trace_at"] = now
                face_elapsed = time.time() - face_started_at
                if face_elapsed > 0.8:
                    print(f"[FACE_TRACE_SLOW] device_id={device_id} elapsed={face_elapsed:.2f}s")
        person_tracks = []

        if track_people:
            person_boxes = self._detect_person_boxes(
                frame,
                device_id=device_id,
                use_model_tracker=use_model_tracker,
                strict_filter=strict_person_filter,
            )
            person_tracks = self._update_person_tracks(tracker_state, person_boxes, face_matches)
            self._publish_latest_person_tracks(device_id, frame, person_tracks)
            detection_results.append(f"person:tracks={len(person_tracks)}")
            self._emit_alarm_log(
                "info",
                "[PERSON_TRACKS] mode={} device_id={} monitor_id={} detected={} active_tracks={}",
                mode,
                device_id,
                monitor_id or "-",
                len(person_boxes),
                len(person_tracks),
            )

        for algo_key in full_frame_algos:
            if algo_key not in self.algo_handlers:
                print(f"Unknown AI algorithm type: {algo_key}")
                detection_results.append(f"{algo_key}:unknown")
                continue
            is_alarm, details = self.algo_handlers[algo_key](frame, device_id=device_id)
            detection_results.append(self._format_detection_result(algo_key, is_alarm, details))
            if not is_alarm:
                continue
            details = self._attach_face_trace_to_details(details, face_matches)
            alarm_trace_id = self._new_alarm_trace_id()
            self._handle_alarm_result(frame, device_id, algo_key, details, alarm_trace_id, mode)

        for track in person_tracks:
            roi_frame, roi_rect = self._expand_person_roi(frame, track.get("coords"))
            if roi_frame is None:
                continue
            for algo_key in person_scoped_algos:
                if algo_key not in self.algo_handlers:
                    print(f"Unknown AI algorithm type: {algo_key}")
                    detection_results.append(f"{algo_key}:unknown")
                    continue
                is_alarm, details = self.algo_handlers[algo_key](roi_frame, device_id=device_id)
                scoped_result = self._format_detection_result(algo_key, is_alarm, details)
                detection_results.append(f"{track.get('track_id')}:{scoped_result}")
                if not is_alarm:
                    continue
                details = self._translate_details_from_roi(details, roi_rect, frame.shape, track)
                alarm_trace_id = self._new_alarm_trace_id()
                self._handle_alarm_result(frame, device_id, algo_key, details, alarm_trace_id, mode)

        return detection_results

    def detect_frontend_frame(self, device_id, frame, algo_type_str="person,face"):
        active_algos = [x.strip() for x in str(algo_type_str or "person,face").split(",") if x.strip()]
        key = str(device_id)
        with self.frontend_frame_trackers_lock:
            tracker_state = self.frontend_frame_trackers.setdefault(key, {"next_id": 1, "tracks": []})
        self._process_detection_frame(
            frame,
            key,
            active_algos,
            tracker_state,
            "frontend_frame",
            use_model_tracker=False,
            strict_person_filter=False,
        )
        payload = self.get_latest_person_tracks(key)
        with self.frontend_person_debug_lock:
            payload["person_debug"] = copy.deepcopy(self.frontend_person_debug.get(key) or {})
        return payload

    def _emit_second_detection_log(self, mode, device_id, second_index, results, monitor_id=""):
        if not results:
            return

        max_items = 6
        short_results = list(results[:max_items])
        if len(results) > max_items:
            short_results.append(f"+{len(results) - max_items} more")

        logger.info(
            "[AI_DETECT_SECOND] mode={} device_id={} monitor_id={} second={} results={}",
            mode,
            device_id,
            monitor_id or "-",
            second_index,
            ",".join(short_results),
        )

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

    def _clean_alarm_display_message(self, value) -> str:
        text = str(value or "").strip()
        text = re.sub(r"[（(]\s*\d{1,3}(?:\.\d+)?\s*%\s*[）)]", "", text)
        text = re.sub(r"\bconfidence\s*[:：]?\s*\d{1,3}(?:\.\d+)?\s*%?", "", text, flags=re.I)
        text = re.sub(r"置信度\s*[:：]?\s*\d{1,3}(?:\.\d+)?\s*%?", "", text)
        return re.sub(r"\s{2,}", " ", text).strip()

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

        if normalized.startswith("rtsp://") and "/Streaming/Channels/" in normalized:
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
        monitor_id = f"{device_id}-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"
        if monitor_mode == "rtsp":
            thread = threading.Thread(
                target=self._monitor_loop,
                args=(device_id, ai_rtsp_url, record_rtsp_url, algo_type, stop_event),
                daemon=True,
            )
        else:
            thread = threading.Thread(
                target=self._snapshot_monitor_loop,
                args=(device_id, ezviz_serial, ezviz_channel, algo_type, stop_event, monitor_id),
                daemon=True,
            )

        self.active_monitors[device_id] = {
            "stop_event": stop_event,
            "thread": thread,
            "mode": monitor_mode,
            "monitor_id": monitor_id,
        }

        thread.start()
        self._emit_alarm_log(
            "info",
            "[ALARM_MONITOR_STARTED] device_id={} mode={} monitor_id={} algo_type={} ai_rtsp_url={} record_rtsp_url={} ezviz_serial={} ezviz_channel={}",
            device_id,
            monitor_mode,
            monitor_id,
            algo_type,
            ai_rtsp_url or "",
            record_rtsp_url or "",
            ezviz_serial or "",
            ezviz_channel,
        )
        return True

    def _split_rule_value(self, value):
        if value is None:
            return []
        if isinstance(value, (list, tuple, set)):
            result = []
            for item in value:
                result.extend(self._split_rule_value(item))
            return result
        return [item.strip() for item in re.split(r"[,，、\s]+", str(value)) if item.strip()]

    def _rules_from_video_doc(self, doc):
        seen = set()
        result = []
        for key in ("ai_rules", "algo_rules", "rules", "algo_type", "algos"):
            for rule in self._split_rule_value((doc or {}).get(key)):
                if rule not in seen:
                    seen.add(rule)
                    result.append(rule)
        return result

    def restore_configured_monitors(self):
        try:
            docs = list(self.video_service._video_collection().find({}, {"_id": 0}))
        except Exception as exc:
            self._emit_alarm_log("error", "[AI_MONITOR_RESTORE_FAILED] stage=load_devices error={}", exc)
            return {"restored": 0, "skipped": 0, "failed": 1}

        restored = 0
        skipped = 0
        failed = 0

        for doc in docs:
            device_id = str((doc or {}).get("id") or "").strip()
            if not device_id:
                skipped += 1
                continue

            rules = self._rules_from_video_doc(doc)
            if not rules:
                skipped += 1
                continue

            algo_type = ",".join(rules)
            self.set_device_rules(device_id, rules)

            if device_id in self.active_monitors:
                skipped += 1
                continue

            rtsp_url = str((doc or {}).get("rtsp_url") or (doc or {}).get("stream_url") or "").strip()
            if "ezopen" in rtsp_url.lower():
                rtsp_url = ""

            try:
                if self.start_monitoring(device_id, rtsp_url, algo_type):
                    restored += 1
                else:
                    failed += 1
            except Exception as exc:
                failed += 1
                self._emit_alarm_log(
                    "error",
                    "[AI_MONITOR_RESTORE_DEVICE_FAILED] device_id={} rules={} error={}",
                    device_id,
                    algo_type,
                    exc,
                )

        self._emit_alarm_log(
            "info",
            "[AI_MONITOR_RESTORE_DONE] restored={} skipped={} failed={}",
            restored,
            skipped,
            failed,
        )
        return {"restored": restored, "skipped": skipped, "failed": failed}

    def _fetch_ezviz_snapshot_frame(self, device_serial: str, channel_no: int):
        payload = {
            "deviceSerial": device_serial,
            "channelNo": int(channel_no or 1),
        }

        body = None
        capture_errors = []
        for path in ["/api/lapp/device/capture", "/api/lapp/v2/device/capture"]:
            try:
                body = self.video_service._call_ezviz_api(path, payload)
                break
            except Exception as exc:
                capture_errors.append(f"{path}: {exc}")
                body = None

        if body is None:
            self._emit_alarm_log(
                "warning",
                "[ALARM_SNAPSHOT_CAPTURE_FAILED] serial={} channel={} errors={}",
                device_serial,
                channel_no,
                " | ".join(capture_errors) or "empty response",
            )
            return None

        data = body.get("data") or {}
        pic_url = data.get("picUrl") or data.get("url") or data.get("picURL") or ""
        if not pic_url:
            self._emit_alarm_log(
                "warning",
                "[ALARM_SNAPSHOT_NO_PIC_URL] serial={} channel={} response={}",
                device_serial,
                channel_no,
                json.dumps(body, ensure_ascii=False)[:800],
            )
            return None

        try:
            response = requests.get(pic_url, timeout=8)
            if response.status_code != 200 or not response.content:
                self._emit_alarm_log(
                    "warning",
                    "[ALARM_SNAPSHOT_DOWNLOAD_FAILED] serial={} channel={} status={} bytes={}",
                    device_serial,
                    channel_no,
                    response.status_code,
                    len(response.content or b""),
                )
                return None

            np_buf = np.frombuffer(response.content, dtype=np.uint8)
            frame = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
            return frame
        except Exception:
            self._emit_alarm_log(
                "warning",
                "[ALARM_SNAPSHOT_DECODE_FAILED] serial={} channel={}",
                device_serial,
                channel_no,
            )
            return None

    def _snapshot_monitor_loop(self, device_id, device_serial, channel_no, algo_type_str, stop_event, monitor_id=""):
        import traceback

        started_at_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        active_algos = [x.strip() for x in algo_type_str.split(",") if x.strip()]
        interval_seconds = max(0.12, float(os.getenv("AI_EVZIZ_SNAPSHOT_INTERVAL_SECONDS", "1.0")))

        print(f"[AI] ezviz snapshot monitor started: serial={device_serial}, channel={channel_no}, interval={interval_seconds}s, started_at={started_at_str}")

        started_at = time.time()
        tracker_state = {"next_id": 1, "tracks": []}
        try:
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
                    detection_results = self._process_detection_frame(
                        frame,
                        device_id,
                        active_algos,
                        tracker_state,
                        "ezviz_snapshot",
                        monitor_id=monitor_id,
                    )
                except Exception as logic_error:
                    print(f"Snapshot detection logic error: {logic_error}")
                    detection_results = []

                elapsed_second = max(1, int(time.time() - started_at) + 1)
                self._emit_second_detection_log("ezviz_snapshot", device_id, elapsed_second, detection_results, monitor_id)
                elapsed = time.time() - loop_started_at
                wait_seconds = max(0.0, interval_seconds - elapsed)
                if stop_event.wait(wait_seconds):
                    break
        except BaseException as thread_error:
            logger.error(
                f"[THREAD_CRASH] ezviz snapshot monitor {device_id} crashed; started_at={started_at_str}",
                exc_info=True,
            )
            print(f"[THREAD_CRASH] ezviz snapshot monitor {device_id} crashed: {thread_error}")
            traceback.print_exc()
        finally:
            print(f"--- snapshot monitor thread exited: {device_id} (started_at={started_at_str}) ---")
            exit_reason = "stop_event_set" if stop_event.is_set() else "loop_ended"
            self._emit_alarm_log(
                "warning",
                "[ALARM_SNAPSHOT_MONITOR_EXIT] device_id={} monitor_id={} serial={} channel={} reason={}",
                device_id,
                monitor_id or "-",
                device_serial,
                channel_no,
                exit_reason,
            )
            monitor = self.active_monitors.get(str(device_id))
            if monitor and monitor.get("stop_event") is stop_event:
                self.active_monitors.pop(str(device_id), None)

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

    def _run_face_trace_for_frame(self, frame):
        try:
            from app.services.ai_features.face import detect as detect_face

            result = detect_face(frame)
            detections = result.get("detections") if isinstance(result, dict) else []
            matches = []
            for det in detections or []:
                person_name = str(det.get("personName") or det.get("label") or "").strip()
                personnel_id = str(det.get("personnel_id") or "").strip()
                if not personnel_id or not person_name or person_name in {"未知", "未知人员", "未识别"}:
                    continue
                matches.append(det)
            self._emit_alarm_log("info", "[FACE_TRACE] detected={} matched={}", len(detections or []), len(matches))
            return matches
        except Exception as exc:
            self._emit_alarm_log("warning", "[FACE_TRACE_FAILED] error={}", exc)
            return []

    def _box_coords(self, box):
        if not isinstance(box, dict):
            return None
        value = box.get("coords") or box.get("bbox") or box.get("bounding_box")
        if not isinstance(value, (list, tuple)) or len(value) < 4:
            return None
        try:
            x1, y1, x2, y2 = [float(v) for v in list(value)[:4]]
        except (TypeError, ValueError):
            return None
        if x2 < x1:
            x1, x2 = x2, x1
        if y2 < y1:
            y1, y2 = y2, y1
        return x1, y1, x2, y2

    def _select_face_match_for_box(self, box, face_matches):
        if not face_matches:
            return None
        if len(face_matches) == 1:
            return face_matches[0]

        box_coords = self._box_coords(box)
        if box_coords is None:
            return face_matches[0]
        bx1, by1, bx2, by2 = box_coords

        best = None
        best_score = -1.0
        for face in face_matches:
            face_coords = self._box_coords(face)
            if face_coords is None:
                continue
            fx1, fy1, fx2, fy2 = face_coords
            cx = (fx1 + fx2) / 2.0
            cy = (fy1 + fy2) / 2.0
            contains_center = bx1 <= cx <= bx2 and by1 <= cy <= by2
            ix1, iy1 = max(bx1, fx1), max(by1, fy1)
            ix2, iy2 = min(bx2, fx2), min(by2, fy2)
            inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
            face_area = max(1.0, (fx2 - fx1) * (fy2 - fy1))
            score = inter / face_area + (1.0 if contains_center else 0.0)
            if score > best_score:
                best = face
                best_score = score

        return best or face_matches[0]

    def _attach_face_trace_to_details(self, details, face_matches):
        if not face_matches or not isinstance(details, dict):
            return details

        boxes = details.get("alarm_boxes") or details.get("boxes") or []
        if not isinstance(boxes, list) or not boxes:
            return details

        for box in boxes:
            if not isinstance(box, dict):
                continue
            match = self._select_face_match_for_box(box, face_matches)
            if not match:
                continue
            person = match.get("person") or {}
            person_name = match.get("personName") or match.get("label") or person.get("username") or person.get("name")
            personnel_id = match.get("personnel_id") or person.get("id") or person.get("_id")
            if person_name:
                box["personName"] = person_name
            if personnel_id:
                box["personnel_id"] = str(personnel_id)
            if person:
                box["person"] = person
            if match.get("similarity") is not None:
                box["face_similarity"] = match.get("similarity")

        return details

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
        monitor = self.active_monitors.get(device_id) or {}
        self._emit_alarm_log(
            "warning",
            "[ALARM_MONITOR_STOP_REQUESTED] device_id={} mode={} monitor_id={}",
            device_id,
            monitor.get("mode") or "",
            monitor.get("monitor_id") or "",
        )
        stop_event = monitor.get("stop_event")
        if stop_event:
            stop_event.set()
        self.active_monitors.pop(device_id, None)
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

        if not raw.startswith("rtsp://"):
            _push(raw)
            return candidates

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
        os.environ.setdefault(
            "OPENCV_FFMPEG_CAPTURE_OPTIONS",
            "rtsp_transport;tcp|stimeout;5000000|fflags;nobuffer|flags;low_delay|probesize;32768|analyzeduration;0",
        )
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
                    try:
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    except Exception:
                        pass
                    print(f"✅ 拉流候选可用: {candidate}")
                    return cap, candidate

                cap.release()
            except Exception as e:
                print(f"⚠️ VideoCapture 打开失败: {candidate} | {e}")
                continue

        return None, None

    def _start_latest_frame_reader(self, cap, stop_event, device_id):
        state = {
            "frame": None,
            "seq": 0,
            "last_read_at": 0.0,
            "error_count": 0,
        }
        lock = threading.Lock()

        def _reader():
            while not stop_event.is_set():
                try:
                    ret, frame = cap.read()
                    if not ret or frame is None:
                        with lock:
                            state["error_count"] += 1
                        time.sleep(0.02)
                        continue
                    with lock:
                        state["frame"] = frame
                        state["seq"] += 1
                        state["last_read_at"] = time.time()
                        state["error_count"] = 0
                except Exception as exc:
                    with lock:
                        state["error_count"] += 1
                    print(f"[AI_FRAME_READER_ERROR] device_id={device_id} error={exc}")
                    time.sleep(0.05)

        thread = threading.Thread(target=_reader, name=f"ai-latest-frame-{device_id}", daemon=True)
        thread.start()
        return state, lock, thread

    def _get_latest_reader_frame(self, reader_state, reader_lock, last_seq):
        with reader_lock:
            seq = int(reader_state.get("seq") or 0)
            frame = reader_state.get("frame")
            last_read_at = float(reader_state.get("last_read_at") or 0.0)
        if frame is None or seq == last_seq:
            return None, last_seq, last_read_at
        return frame.copy(), seq, last_read_at

    def _monitor_loop(self, device_id, rtsp_url, record_rtsp_url, algo_type_str, stop_event):
        import traceback
        from datetime import datetime
        started_at_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        print(f"📷 正在连接视频流: {rtsp_url} (启动时间: {started_at_str})")

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

            print(f"--- DEBUG线程已退出: {device_id} (该线程启动于: {started_at_str}) ---")
            return

        # ========= 正常视频逻辑 =========
        cap = None
        try:
            try:
                cap, used_url = self._open_video_capture(rtsp_url)

                if cap is None:
                    print(f"❌ 视频流打开失败 (线程启动于: {started_at_str})")
                    return
                print(f"✅ 视频流连接成功: {used_url} (线程启动于: {started_at_str})")

                # AI 拉流成功后再启动录像，避免部分设备因并发连接导致 AI 打不开。
                try:
                    video_id = int(device_id)
                    if record_rtsp_url:
                        self.video_service.start_ffmpeg_recording(video_id, record_rtsp_url)
                except Exception as e:
                    print(f"⚠️ 启动分段录像失败(不影响AI检测): {e}")

            except Exception as e:
                print(f"❌ 视频流异常: {e} (线程启动于: {started_at_str})")
                return

            active_algos = [x.strip() for x in algo_type_str.split(",") if x.strip()]
            try:
                frame_interval = max(1, int(os.getenv("AI_RTSP_FRAME_INTERVAL", "1")))
            except ValueError:
                frame_interval = 1
            try:
                drain_frames = max(0, int(os.getenv("AI_STREAM_DRAIN_FRAMES", "2")))
            except ValueError:
                drain_frames = 2
            frame_count = 0
            tracker_state = {"next_id": 1, "tracks": []}
            print(f"[AI_STREAM_TUNING] device_id={device_id} frame_interval={frame_interval} drain_frames={drain_frames}")
            latest_reader_state, latest_reader_lock, latest_reader_thread = self._start_latest_frame_reader(cap, stop_event, device_id)
            latest_seq = 0

            while not stop_event.is_set():
                frame, latest_seq, latest_read_at = self._get_latest_reader_frame(
                    latest_reader_state,
                    latest_reader_lock,
                    latest_seq,
                )
                if frame is None:
                    if latest_read_at and time.time() - latest_read_at > 5:
                        print(f"[AI_FRAME_READER_STALE] device_id={device_id} age={time.time() - latest_read_at:.1f}s")
                    time.sleep(0.02)
                    continue

                frame_count += 1
                if frame_count % frame_interval != 0:
                    continue

                try:
                    detection_started_at = time.time()
                    self._process_detection_frame(
                        frame,
                        device_id,
                        active_algos,
                        tracker_state,
                        "rtsp",
                    )
                    detection_elapsed = time.time() - detection_started_at
                    if detection_elapsed > 0.8:
                        print(f"[AI_FRAME_SLOW] device_id={device_id} elapsed={detection_elapsed:.2f}s")
                    continue

                    face_matches = self._run_face_trace_for_frame(frame)
                    for algo_key in active_algos:
                        if algo_key == "face":
                            continue

                        if algo_key not in self.algo_handlers:
                            print(f"⚠️ 未识别算法类型: {algo_key}")
                            continue

                        is_alarm, details = self.algo_handlers[algo_key](frame, device_id=device_id)

                        if is_alarm:
                            details = self._attach_face_trace_to_details(details, face_matches)
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

                            img_path = self._save_alarm_image(frame, device_id, details, alarm_trace_id=alarm_trace_id)
                            self._save_alarm_to_db(device_id, details, img_path, algo_key=algo_key, alarm_trace_id=alarm_trace_id)

                except Exception as logic_error:
                    print(f"⚠️ 逻辑异常: {logic_error}")

                time.sleep(0.02)
        except BaseException as thread_error:
            logger.error(f"❌ [线程崩溃] RTSP监控线程 {device_id} 发生致命异常退出! 启动时间: {started_at_str}", exc_info=True)
            print(f"❌ [线程崩溃] RTSP监控线程 {device_id} 发生致命异常! 异常信息: {thread_error}")
            traceback.print_exc()
        finally:
            if cap is not None:
                cap.release()
            print(f"--- 监控线程已退出: {device_id} (该线程启动于: {started_at_str}) ---")
            monitor = self.active_monitors.get(str(device_id))
            if monitor and monitor.get("stop_event") is stop_event:
                self.active_monitors.pop(str(device_id), None)

    # =========================
    # 保存报警图片
    # =========================
    def _save_alarm_image(self, frame, device_id, details=None, alarm_trace_id: str | None = None):
        try:
            # 1. 先规范化报警详情里的框，再在图片上绘制
            details = self._normalize_alarm_details_for_frame(details, frame)
            draw_frame = frame.copy()
            boxes = []
            if details and isinstance(details, dict):
                boxes = details.get("alarm_boxes") or details.get("boxes") or []

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

    def _extract_alarm_boxes(self, details):
        if not isinstance(details, dict):
            return []

        def _append_candidate(value, candidates, source_key: str | None = None):
            if not value:
                return
            if isinstance(value, list):
                if len(value) >= 4 and all(isinstance(v, (int, float, str)) for v in value[:4]):
                    candidates.append((source_key or "coords", list(value[:4])))
                else:
                    for item in value:
                        _append_candidate(item, candidates, source_key=source_key)
            elif isinstance(value, tuple):
                if len(value) >= 4 and all(isinstance(v, (int, float, str)) for v in value[:4]):
                    candidates.append((source_key or "coords", list(value[:4])))
                else:
                    for item in list(value):
                        _append_candidate(item, candidates, source_key=source_key)
            elif isinstance(value, dict):
                for nested_key in (
                    "alarm_boxes",
                    "boxes",
                    "target_boxes",
                    "detections",
                    "detection_results",
                    "results",
                    "bbox",
                    "bounding_box",
                ):
                    nested_value = value.get(nested_key)
                    if nested_value:
                        _append_candidate(nested_value, candidates, source_key=nested_key)
                        return
                candidates.append(value)

        candidates = []
        for key in (
            "alarm_boxes",
            "boxes",
            "target_boxes",
            "detections",
            "detection_results",
            "results",
            "bbox",
            "bounding_box",
            "coords_norm",
            "coords",
        ):
            _append_candidate(details.get(key), candidates, source_key=key)

        boxes = []
        for item in candidates:
            if isinstance(item, dict):
                boxes.append(copy.deepcopy(item))
            elif isinstance(item, tuple) and len(item) == 2:
                source_key, values = item
                values = list(values[:4])
                source_key = str(source_key or "coords")
                if source_key in {"bbox", "bounding_box"}:
                    boxes.append({source_key: values})
                elif source_key == "coords_norm" or source_key == "coords":
                    boxes.append({source_key: values})
                elif source_key == "x_y_w_h":
                    boxes.append({"bbox": values})
                else:
                    boxes.append({"coords": values})
        return self._dedupe_alarm_boxes(boxes)

    def _dedupe_alarm_boxes(self, boxes):
        if not isinstance(boxes, list):
            return []

        def _box_key(box):
            if not isinstance(box, dict):
                return None

            coords = None
            for key in ("coords", "bbox", "bounding_box", "coords_norm"):
                value = box.get(key)
                if isinstance(value, (list, tuple)) and len(value) >= 4:
                    try:
                        coords = tuple(round(float(v), 4) for v in list(value)[:4])
                    except (TypeError, ValueError):
                        coords = tuple(str(v) for v in list(value)[:4])
                    break
            if coords is None:
                return None

            label = str(box.get("type") or box.get("label") or box.get("raw_label") or "")
            return (label, coords)

        seen = set()
        result = []
        for box in boxes:
            key = _box_key(box)
            if key is not None:
                if key in seen:
                    continue
                seen.add(key)
            result.append(box)
        return result

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
        source_field = ""
        if isinstance(box.get("coords_norm"), (list, tuple)) and len(box.get("coords_norm")) >= 4:
            raw_values = list(box.get("coords_norm")[:4])
            source_field = "coords_norm"
        elif isinstance(box.get("coords"), (list, tuple)) and len(box.get("coords")) >= 4:
            raw_values = list(box.get("coords")[:4])
            source_field = "coords"
        elif isinstance(box.get("bbox"), (list, tuple)) and len(box.get("bbox")) >= 4:
            raw_values = list(box.get("bbox")[:4])
            source_field = "bbox"
        elif isinstance(box.get("bounding_box"), (list, tuple)) and len(box.get("bounding_box")) >= 4:
            raw_values = list(box.get("bounding_box")[:4])
            source_field = "bounding_box"
        elif all(k in box for k in ("x1", "y1", "x2", "y2")):
            raw_values = [box.get("x1"), box.get("y1"), box.get("x2"), box.get("y2")]
            source_field = "x1_y1_x2_y2"
        elif all(k in box for k in ("x", "y", "w", "h")):
            raw_values = [box.get("x"), box.get("y"), box.get("w"), box.get("h")]
            source_kind = "xywh"
            source_field = "x_y_w_h"

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
        normalized_box["source"] = normalized_box.get("source") or source_field or "ai_detection_snapshot"
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

    def _rescale_box_coords_for_frame(self, box, target_frame_shape):
        if not isinstance(box, dict) or not target_frame_shape:
            return None

        try:
            target_h = int(target_frame_shape[0])
            target_w = int(target_frame_shape[1])
        except Exception:
            return None
        if target_w <= 0 or target_h <= 0:
            return None

        coords_norm = box.get("coords_norm")
        if isinstance(coords_norm, (list, tuple)) and len(coords_norm) >= 4:
            try:
                nx1, ny1, nx2, ny2 = [float(v) for v in list(coords_norm)[:4]]
            except (TypeError, ValueError):
                return None
            if all(np.isfinite(v) for v in (nx1, ny1, nx2, ny2)):
                x1 = nx1 * target_w
                y1 = ny1 * target_h
                x2 = nx2 * target_w
                y2 = ny2 * target_h
                rescaled = copy.deepcopy(box)
                rescaled["coords"] = [
                    int(round(max(0.0, min(float(target_w - 1), x1)))),
                    int(round(max(0.0, min(float(target_h - 1), y1)))),
                    int(round(max(0.0, min(float(target_w - 1), x2)))),
                    int(round(max(0.0, min(float(target_h - 1), y2)))),
                ]
                rescaled["frame_width"] = target_w
                rescaled["frame_height"] = target_h
                rescaled["source"] = rescaled.get("source") or "coords_norm_rescaled"
                return rescaled if rescaled["coords"][2] > rescaled["coords"][0] and rescaled["coords"][3] > rescaled["coords"][1] else None

        coords = None
        for key in ("coords", "bbox", "bounding_box"):
            value = box.get(key)
            if isinstance(value, (list, tuple)) and len(value) >= 4:
                coords = list(value[:4])
                break
        if coords is None:
            return self._normalize_box_coords_for_frame(box, target_frame_shape)

        try:
            x1, y1, x2, y2 = [float(v) for v in coords]
        except (TypeError, ValueError):
            return None
        if any(not np.isfinite(v) for v in (x1, y1, x2, y2)):
            return None
        if x2 <= x1 or y2 <= y1:
            return self._normalize_box_coords_for_frame(box, target_frame_shape)

        source_w = box.get("frame_width") or box.get("source_frame_width")
        source_h = box.get("frame_height") or box.get("source_frame_height")
        try:
            source_w = float(source_w)
            source_h = float(source_h)
        except (TypeError, ValueError):
            source_w = source_h = 0.0

        if source_w > 0 and source_h > 0 and (abs(source_w - target_w) > 1 or abs(source_h - target_h) > 1):
            scale_x = target_w / source_w
            scale_y = target_h / source_h
            x1 *= scale_x
            x2 *= scale_x
            y1 *= scale_y
            y2 *= scale_y

        rescaled = copy.deepcopy(box)
        rescaled["coords"] = [
            int(round(max(0.0, min(float(target_w - 1), x1)))),
            int(round(max(0.0, min(float(target_h - 1), y1)))),
            int(round(max(0.0, min(float(target_w - 1), x2)))),
            int(round(max(0.0, min(float(target_h - 1), y2)))),
        ]
        rescaled["coords_norm"] = [
            rescaled["coords"][0] / target_w,
            rescaled["coords"][1] / target_h,
            rescaled["coords"][2] / target_w,
            rescaled["coords"][3] / target_h,
        ]
        rescaled["frame_width"] = target_w
        rescaled["frame_height"] = target_h
        rescaled["source"] = rescaled.get("source") or "frame_rescaled"
        return rescaled if rescaled["coords"][2] > rescaled["coords"][0] and rescaled["coords"][3] > rescaled["coords"][1] else None

    def _normalize_alarm_details_for_frame(self, details, frame):
        if not isinstance(details, dict) or frame is None:
            return details

        normalized_details = copy.deepcopy(details)
        frame_shape = getattr(frame, "shape", None)
        candidate_boxes = self._extract_alarm_boxes(normalized_details)
        normalized_boxes = []
        for box in candidate_boxes:
            normalized_box = self._normalize_box_coords_for_frame(box, frame_shape)
            if normalized_box is not None:
                normalized_boxes.append(normalized_box)
        normalized_boxes = self._dedupe_alarm_boxes(normalized_boxes)

        if normalized_boxes:
            normalized_details["alarm_boxes"] = normalized_boxes
            normalized_details["boxes"] = normalized_boxes
            self._emit_alarm_log(
                "info",
                "[ALARM_BOX_NORMALIZED] bbox_count={} frame_width={} frame_height={}",
                len(normalized_boxes),
                int(frame_shape[1]) if frame_shape and len(frame_shape) > 1 else 0,
                int(frame_shape[0]) if frame_shape else 0,
            )
        else:
            self._emit_alarm_log(
                "warning",
                "[ALARM_BOX_NORMALIZED] bbox_count=0 reason=no_valid_bbox",
            )
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

            for box in boxes:
                coords = box.get("coords")
                label_type = box.get("type", "异常")
                msg = box.get("msg", "")

                # 英文标签 → 中文显示映射
                LABEL_DISPLAY_MAP = {
                    "no_helmet": "未带安全帽",
                    "helmet_missing": "未带安全帽",
                    "helmet": "安全帽",
                    "safehat": "安全帽",
                    "smoking": "吸烟",
                    "phone": "打电话",
                    "calling": "打电话",
                    "call": "打电话",
                    "fire": "烟火",
                    "flame": "明火",
                    "smoke": "烟雾",
                    "no_vest": "未穿反光衣",
                    "reflective_vest": "反光衣",
                    "vest": "反光衣",
                    "clothes": "反光衣",
                    "person": "人员",
                    "person_fall": "人员倒地",
                    "fall": "人员倒地",
                    "safety_harness": "安全带",
                    "safety_harness_missing": "未系安全带",
                    "unauthorized_person": "陌生人员闯入",
                    "crowd": "人群聚集",
                    "crowd_detection": "人群聚集",
                    "no_helmet_area": "未戴安全帽区域",
                    "ladder": "梯子",
                    "ladder_detection": "梯子检测",
                    "work": "作业",
                    "work_detection": "作业检测",
                }
                label_type = LABEL_DISPLAY_MAP.get(label_type, label_type)

                # 同样清理 msg 中的英文标签
                for eng, chn in LABEL_DISPLAY_MAP.items():
                    if eng in msg:
                        msg = msg.replace(eng, chn)

                if not coords or len(coords) < 4:
                    continue

                x1, y1, x2, y2 = map(int, coords)

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

                text_lines = [str(label_type), str(person_info)]
                if msg:
                    text_lines.append(str(msg))
                display_text = "\n".join(text_lines)

                try:
                    max_text_width = max(80, int(frame.shape[1] * 0.42))
                    wrapped_lines = []
                    for line in text_lines:
                        current = ""
                        for char in line:
                            candidate = current + char
                            bbox = draw.textbbox((0, 0), candidate, font=font)
                            if current and bbox[2] - bbox[0] > max_text_width:
                                wrapped_lines.append(current)
                                current = char
                            else:
                                current = candidate
                        if current:
                            wrapped_lines.append(current)
                    display_text = "\n".join(wrapped_lines)

                    padding = max(4, int(font_size * 0.25))
                    gap = max(line_width + 3, int(font_size * 0.25))
                    text_bbox = draw.multiline_textbbox((0, 0), display_text, font=font, spacing=2)
                    text_w = text_bbox[2] - text_bbox[0]
                    text_h = text_bbox[3] - text_bbox[1]
                    bg_w = text_w + padding * 2
                    bg_h = text_h + padding * 2
                    frame_h, frame_w = frame.shape[:2]

                    text_x = max(0, min(x1, frame_w - bg_w))
                    if y1 - gap - bg_h >= 0:
                        text_y = y1 - gap - bg_h
                    elif y2 + gap + bg_h <= frame_h:
                        text_y = y2 + gap
                    else:
                        right_space = frame_w - x2 - gap
                        left_space = x1 - gap
                        if right_space >= bg_w:
                            text_x = x2 + gap
                        elif left_space >= bg_w:
                            text_x = x1 - gap - bg_w
                        text_y = max(0, min(y1, frame_h - bg_h))

                    bg_rect = [
                        int(text_x),
                        int(text_y),
                        int(text_x + bg_w),
                        int(text_y + bg_h),
                    ]
                    draw.rectangle(bg_rect, fill=(255, 0, 0, 220))
                    draw.multiline_text(
                        (int(text_x + padding), int(text_y + padding)),
                        display_text,
                        font=font,
                        fill=(255, 255, 255),
                        spacing=2,
                    )
                    continue
                except Exception:
                    pass

                # 绘制文字背景条
                try:
                    # 使用 textbbox 获取文本尺寸 (Pillow 8.0+)
                    bbox = draw.textbbox((x1, y1 - 10), display_text, font=font)
                    # 往上或往下绘制背景，防止文字出界 (简化始终画在框顶部附近，略带半透明)
                    bg_rect = [bbox[0]-5, bbox[1]-5, bbox[2]+5, bbox[3]+5]
                    draw.rectangle(bg_rect, fill=(255, 0, 0, 180))
                except Exception:
                    pass

                # 绘制白色文字
                draw.text((x1, y1 - font_size - 10), display_text, font=font, fill=(255, 255, 255))

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
        draw_window_before=0.25,
        draw_window_after=0.25,
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

            valid_boxes = []
            for box in boxes:
                if not isinstance(box, dict):
                    continue
                normalized = self._rescale_box_coords_for_frame(box, (height, width, 3))
                if normalized is not None:
                    valid_boxes.append(normalized)
            if not valid_boxes:
                raise ValueError("no drawable bbox in alarm video")
            self._emit_alarm_log(
                "info",
                "[ALARM_VIDEO_BOX_RESCALED] trace_id={} video_width={} video_height={} boxes={}",
                alarm_trace_id or "-",
                width,
                height,
                [
                    {
                        "source_size": [box.get("frame_width"), box.get("frame_height")],
                        "original": box.get("original_coords") or box.get("coords") or box.get("bbox"),
                        "coords": box.get("coords"),
                    }
                    for box in valid_boxes[:5]
                ],
            )

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
                    frame = self._draw_boxes_on_frame(frame, valid_boxes)

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
            try:
                transcode_proc = subprocess.run(
                    transcode_cmd,
                    capture_output=True,
                    text=True,
                    timeout=ALARM_VIDEO_FFMPEG_TIMEOUT_SECONDS,
                )
            except subprocess.TimeoutExpired as exc:
                raise TimeoutError(
                    f"报警视频生成超时: ffmpeg box transcode 超过 {ALARM_VIDEO_FFMPEG_TIMEOUT_SECONDS:.0f} 秒"
                ) from exc
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

    def _classify_alarm_video_error(self, error: Exception | str) -> str:
        if isinstance(error, TimeoutError):
            return "video_failed"

        error_text = str(error or "").lower()
        if "no_video_segment:" in error_text:
            return "no_video_segment"

        video_failed_markers = (
            "video_failed:",
            "timeout",
            "timed out",
            "报警视频生成超时",
            "ffmpeg",
            "concat",
            "trim",
            "generated video file is empty",
        )
        if any(marker in error_text for marker in video_failed_markers):
            return "video_failed"

        return "no_video_segment"

    def _coerce_alarm_datetime(self, value):
        if isinstance(value, datetime):
            alarm_dt = value
        elif isinstance(value, (int, float)):
            alarm_dt = datetime.fromtimestamp(value)
        elif isinstance(value, str) and value.strip():
            text = value.strip().replace("T", " ")
            if text.endswith("Z"):
                text = text[:-1] + "+00:00"
            try:
                alarm_dt = datetime.fromisoformat(text)
            except ValueError:
                alarm_dt = None
                for fmt in ("%Y-%m-%d %H:%M:%S", "%Y%m%d_%H%M%S", "%Y%m%d%H%M%S"):
                    try:
                        alarm_dt = datetime.strptime(text, fmt)
                        break
                    except ValueError:
                        continue
                if alarm_dt is None:
                    return None
        else:
            return None

        if getattr(alarm_dt, "tzinfo", None) is not None:
            alarm_dt = alarm_dt.astimezone().replace(tzinfo=None)
        return alarm_dt.replace(microsecond=0)

    def _resolve_alarm_time(self, alarm_id: int, fallback_alarm_time=None, details=None):
        sources = []
        alarm_record = self._find_alarm_doc_by_id(alarm_id) or {}

        image_path_keys = (
            "alarm_image_path",
            "snapshot_path",
            "screenshot_path",
            "thumbnail_path",
            "image_url",
            "snapshot_url",
            "picture_url",
            "image_path",
        )
        for container_name, container in (("alarm", alarm_record), ("details", details if isinstance(details, dict) else {})):
            for key in image_path_keys:
                image_path = (container or {}).get(key)
                if image_path:
                    parsed = self.video_service._parse_alarm_event_time(os.path.basename(urlsplit(str(image_path)).path))
                    sources.append((f"{container_name}.{key}.filename", parsed))

        for container_name, container in (("alarm", alarm_record), ("details", details if isinstance(details, dict) else {})):
            for key in ("snapshot_time", "image_time", "capture_time"):
                sources.append((f"{container_name}.{key}", (container or {}).get(key)))

        for container_name, container in (("details", details if isinstance(details, dict) else {}), ("alarm", alarm_record)):
            for key in ("detection_time", "alarm_time", "trigger_time", "timestamp", "created_at"):
                sources.append((f"{container_name}.{key}", (container or {}).get(key)))
        sources.append(("argument.alarm_time", fallback_alarm_time))

        for source, value in sources:
            alarm_dt = self._coerce_alarm_datetime(value)
            if alarm_dt is not None:
                return alarm_dt, source
        return None, "missing"

    def _format_alarm_video_time(self, value: datetime) -> str:
        return value.strftime("%Y-%m-%d %H:%M:%S")

    def _segments_missing_reason(self, segments, alarm_time: datetime, clip_start: datetime, clip_end: datetime) -> str:
        if not segments:
            return "missing_pre_and_post_segment"
        has_before = any(seg_start <= alarm_time for _, seg_start, _ in segments)
        has_after = any(seg_end > alarm_time for _, _, seg_end in segments)
        has_pre_window = any(seg_start <= clip_start and seg_end > clip_start for _, seg_start, seg_end in segments)
        has_post_window = any(seg_start < clip_end and seg_end >= clip_end for _, seg_start, seg_end in segments)
        if not has_before and not has_after:
            return "missing_pre_and_post_segment"
        if not has_before or not has_pre_window:
            return "missing_pre_segment"
        if not has_after or not has_post_window:
            return "missing_post_segment"
        return "alarm_time_not_covered"

    def _segments_cover_timerange(self, segments, clip_start: datetime, clip_end: datetime, tolerance_seconds: float = 1.0) -> bool:
        if not segments:
            return False
        tolerance = timedelta(seconds=max(0.0, float(tolerance_seconds)))
        merged: list[tuple[datetime, datetime]] = []
        for _, seg_start, seg_end in sorted(segments, key=lambda item: item[1]):
            if seg_end <= seg_start:
                continue
            if not merged or seg_start > merged[-1][1] + tolerance:
                merged.append((seg_start, seg_end))
            elif seg_end > merged[-1][1]:
                merged[-1] = (merged[-1][0], seg_end)
        return any(start <= clip_start + tolerance and end >= clip_end - tolerance for start, end in merged)

    def _collect_alarm_video_segments(self, video_id: int, alarm_time: datetime, clip_start: datetime, clip_end: datetime):
        segments = self.video_service._collect_segments_for_timerange(
            video_id,
            clip_start,
            clip_end,
            include_temp_buffer=True,
        )
        covers_alarm_time = any(seg_start <= alarm_time < seg_end for _, seg_start, seg_end in segments)
        covers_clip_window = covers_alarm_time and self._segments_cover_timerange(segments, clip_start, clip_end)
        missing_reason = "" if covers_clip_window else self._segments_missing_reason(
            segments,
            alarm_time,
            clip_start,
            clip_end,
        )
        return segments, covers_clip_window, missing_reason

    def _log_alarm_video_state(
        self,
        alarm_id,
        device_id,
        alarm_time,
        clip_start,
        clip_end,
        segments,
        covers_alarm_time,
        boxes,
        output_path="",
        duration_seconds=0,
        recording_status="pending",
        extra_reason="",
    ):
        selected_segments = []
        for seg_path, seg_start, seg_end in segments:
            selected_segments.append(
                {
                    "name": os.path.basename(seg_path),
                    "start": self._format_alarm_video_time(seg_start),
                    "end": self._format_alarm_video_time(seg_end),
                    "duration": round((seg_end - seg_start).total_seconds(), 3),
                }
            )
        self._emit_alarm_log(
            "info",
            "[ALARM_VIDEO_STATE] alarm_id={} device_id={} alarm_time={} clip_start={} clip_end={} "
            "selected_segments={} covers_alarm_time={} bbox_count={} output_path={} duration_seconds={} "
            "recording_status={} reason={}",
            alarm_id,
            device_id,
            self._format_alarm_video_time(alarm_time),
            self._format_alarm_video_time(clip_start),
            self._format_alarm_video_time(clip_end),
            json.dumps(selected_segments, ensure_ascii=False),
            bool(covers_alarm_time),
            len(boxes or []),
            output_path or "",
            duration_seconds or 0,
            recording_status,
            extra_reason or "",
        )

    def _resolve_alarm_boxes_for_video(self, alarm_id, details=None, fallback_boxes=None):
        alarm_record = self._find_alarm_doc_by_id(alarm_id) or {}
        alarm_record_details = alarm_record.get("details") if isinstance(alarm_record.get("details"), dict) else {}
        sources = []
        for container_name, container in (
            ("alarm_record", alarm_record),
            ("alarm_record.details", alarm_record_details),
            ("details", details if isinstance(details, dict) else {}),
        ):
            if not isinstance(container, dict):
                continue
            for key in (
                "alarm_boxes",
                "boxes",
                "target_boxes",
                "detections",
                "detection_results",
                "results",
                "bbox",
                "bounding_box",
                "coords_norm",
                "coords",
            ):
                value = container.get(key)
                if value:
                    sources.append((f"{container_name}.{key}", value))

        if fallback_boxes:
            sources.append(("fallback_boxes", fallback_boxes))

        resolved = []
        source_name = "missing"
        for source_name, value in sources:
            candidate_details = {"alarm_boxes": value}
            resolved = self._extract_alarm_boxes(candidate_details)
            if resolved:
                break

        if resolved:
            self._emit_alarm_log(
                "info",
                "[ALARM_VIDEO_BOX_SOURCE] alarm_id={} bbox_count={} box_source={}",
                alarm_id,
                len(resolved),
                source_name,
            )
        else:
            self._emit_alarm_log(
                "warning",
                "[ALARM_VIDEO_BOX_SOURCE] alarm_id={} bbox_count=0 box_source=missing",
                alarm_id,
            )
        return resolved, source_name

    def _validate_alarm_video_result(
        self,
        result,
        record_anchor_time: datetime,
        clip_start: datetime,
        clip_end: datetime,
        min_after_anchor_seconds: float = 3.0,
    ):
        recording_path = (result or {}).get("recording_path") or ""
        recording_full_path = (result or {}).get("recording_full_path") or ""
        if not recording_path:
            raise ValueError("video_failed: recording_path empty")
        if not recording_full_path or not os.path.exists(recording_full_path):
            raise ValueError("video_failed: alarm video file missing")

        duration_seconds = self.video_service._probe_video_duration(recording_full_path, timeout_seconds=8.0)
        if duration_seconds is None:
            duration_seconds = result.get("duration_seconds")
        try:
            duration_seconds = float(duration_seconds)
        except (TypeError, ValueError):
            duration_seconds = 0.0
        if duration_seconds <= 0:
            raise ValueError("video_failed: duration_seconds <= 0")
        actual_start = self._coerce_alarm_datetime(result.get("start_time")) or clip_start
        actual_end = self._coerce_alarm_datetime(result.get("end_time"))
        if actual_end is None:
            actual_end = actual_start + timedelta(seconds=duration_seconds)
        covers_anchor_time = actual_start <= record_anchor_time <= actual_end
        alarm_offset = (record_anchor_time - actual_start).total_seconds()
        has_video_after_anchor = (duration_seconds - alarm_offset) >= float(min_after_anchor_seconds)
        expected_duration = max(1.0, (clip_end - clip_start).total_seconds())
        covers_requested_window = (
            actual_start <= clip_start + timedelta(seconds=1.5)
            and actual_end >= clip_end - timedelta(seconds=1.5)
            and duration_seconds >= expected_duration - 2.0
        )
        timing = {
            "duration_seconds": duration_seconds,
            "actual_clip_start": actual_start,
            "actual_clip_end": actual_end,
            "alarm_second": alarm_offset,
            "covers_anchor_time": bool(covers_anchor_time),
            "has_video_after_anchor": bool(has_video_after_anchor),
            "covers_requested_window": bool(covers_requested_window),
            "min_after_anchor_seconds": float(min_after_anchor_seconds),
        }
        if not covers_anchor_time:
            raise ValueError(
                f"record_anchor_time_not_covered: record_anchor_time={self._format_alarm_video_time(record_anchor_time)} "
                f"actual_start={self._format_alarm_video_time(actual_start)} "
                f"actual_end={self._format_alarm_video_time(actual_end)}"
            )
        if alarm_offset < 0 or duration_seconds <= alarm_offset:
            raise ValueError(
                f"record_anchor_time_not_covered: duration_seconds={duration_seconds:.3f} alarm_second={alarm_offset:.3f}"
            )
        if not has_video_after_anchor:
            raise ValueError(
                f"record_anchor_tail_not_ready: duration_seconds={duration_seconds:.3f} "
                f"alarm_second={alarm_offset:.3f} min_after={min_after_anchor_seconds:.3f}"
            )
        if not covers_requested_window:
            raise ValueError(
                f"requested_clip_window_not_covered: duration_seconds={duration_seconds:.3f} "
                f"expected_duration={expected_duration:.3f} "
                f"actual_start={self._format_alarm_video_time(actual_start)} "
                f"actual_end={self._format_alarm_video_time(actual_end)} "
                f"requested_start={self._format_alarm_video_time(clip_start)} "
                f"requested_end={self._format_alarm_video_time(clip_end)}"
            )
        return timing

    def _save_alarm_clip_async_legacy(
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
                self._update_alarm_recording_status(alarm_id, "video_failed", None, "device_id is not a video camera id")
                self._emit_alarm_log(
                    "error",
                    "[ALARM_VIDEO_FAILED] trace_id={} alarm_id={} device_id={} reason=device_id_not_video_id",
                    alarm_trace_id or "-",
                    alarm_id,
                    device_id,
                )
                return
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
            mature_buffer = RECORD_SEGMENT_SECONDS + RECORD_SEGMENT_SAFE_MARGIN_SECONDS
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
            saved_recording_path = None
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
                    saved_recording_path = result.get("recording_path") or ""
                    if not saved_recording_path:
                        raise ValueError("video_failed: alarm video generated without recording_path")
                    recording_full_path = result.get("recording_full_path")
                    expected_alarm_second = (trigger_time - clip_start).total_seconds()
                    duration_seconds = result.get("duration_seconds")
                    try:
                        duration_seconds = float(duration_seconds)
                    except (TypeError, ValueError):
                        duration_seconds = None

                    self._update_alarm_recording_status(
                        alarm_id,
                        "saved",
                        saved_recording_path,
                        None,
                        duration_seconds=result.get("duration_seconds"),
                        start_time=result.get("start_time"),
                        end_time=result.get("end_time"),
                        alarm_second=int(round(expected_alarm_second)),
                    )

                    def _clamp_alarm_second(value):
                        try:
                            second = int(round(float(value)))
                        except (TypeError, ValueError):
                            second = 0
                        if duration_seconds and duration_seconds > 0:
                            second = min(second, max(0, int(duration_seconds) - 1))
                        return max(0, second)

                    anchor_alarm_second = _clamp_alarm_second(expected_alarm_second)
                    box_alarm_second = anchor_alarm_second
                    match_score = None
                    alarm_record = self._find_alarm_doc_by_id(alarm_id) or {}
                    alarm_image_path = alarm_record.get("alarm_image_path") or ""
                    try:
                        matched_alarm_second, match_score = self._locate_alarm_frame_in_video(
                            recording_full_path,
                            alarm_image_path,
                            expected_alarm_second,
                        )
                        box_alarm_second = _clamp_alarm_second(matched_alarm_second)
                        self._emit_alarm_log(
                            "info",
                            "[ALARM_VIDEO_FRAME_MATCHED] alarm_id={} expected={} actual={} score={:.4f}",
                            alarm_id,
                            int(round(expected_alarm_second)),
                            box_alarm_second,
                            match_score,
                        )
                    except Exception as match_error:
                        fallback_alarm_second, fallback_offset = self._get_alarm_frame_fallback_second(
                            expected_alarm_second,
                            result.get("duration_seconds"),
                        )
                        box_alarm_second = _clamp_alarm_second(fallback_alarm_second)
                        self._emit_alarm_log(
                            "warning",
                            "[ALARM_VIDEO_FRAME_MATCH_FALLBACK] alarm_id={} expected={} offset={} box_second={} reason={}",
                            alarm_id,
                            int(round(expected_alarm_second)),
                            fallback_offset,
                            box_alarm_second,
                            match_error,
                        )

                    if boxes:
                        try:
                            self._draw_alarm_boxes_on_video(
                                recording_full_path,
                                boxes,
                                box_alarm_second,
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
                        alarm_second=anchor_alarm_second,
                    )
                    self._update_alarm_fields(
                        alarm_id,
                        {
                            "alarm_second": anchor_alarm_second,
                            "box_anchor_second": box_alarm_second,
                            "box_start_second": max(0, box_alarm_second - 1),
                            "box_end_second": min(
                                int(duration_seconds) if duration_seconds else box_alarm_second + 2,
                                box_alarm_second + 2,
                            ),
                        },
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
                    if saved_recording_path:
                        self._emit_alarm_log(
                            "error",
                            "[ALARM_VIDEO_POSTPROCESS_FAILED] trace_id={} alarm_id={} device_id={} path={} error={}",
                            alarm_trace_id or "-",
                            alarm_id,
                            device_id,
                            saved_recording_path,
                            e,
                        )
                        return
                    last_error = e
                    error_text = str(e)
                    if "合并失败" in error_text or "裁剪失败" in error_text or "生成的视频文件" in error_text:
                        failure_status = "video_failed"
                    else:
                        failure_status = "no_video_segment"
                    failure_status = self._classify_alarm_video_error(e)
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

    def _save_alarm_clip_async(
        self,
        alarm_id: int,
        device_id: str,
        alarm_time: datetime,
        alarm_trace_id: str | None = None,
        details=None,
        boxes=None,
    ):
        fallback_boxes = []
        try:
            if isinstance(boxes, list):
                fallback_boxes = boxes
        except Exception:
            fallback_boxes = []
        if not fallback_boxes and isinstance(details, dict):
            detail_boxes = (
                details.get("boxes")
                or details.get("detections")
                or details.get("detection_results")
                or details.get("target_boxes")
                or details.get("alarm_boxes")
                or []
            )
            try:
                if isinstance(detail_boxes, list):
                    fallback_boxes = detail_boxes
            except Exception:
                fallback_boxes = []

        def _worker(fallback_boxes=fallback_boxes, details=details, alarm_id=alarm_id):
            try:
                video_id = int(device_id)
            except Exception:
                self._update_alarm_recording_status(
                    alarm_id,
                    "video_failed",
                    None,
                    "device_id is not a video camera id",
                )
                self._emit_alarm_log(
                    "error",
                    "[ALARM_VIDEO_FAILED] trace_id={} alarm_id={} device_id={} reason=device_id_not_video_id",
                    alarm_trace_id or "-",
                    alarm_id,
                    device_id,
                )
                return

            detection_time = self._coerce_alarm_datetime(alarm_time)
            snapshot_time, alarm_time_source = self._resolve_alarm_time(
                alarm_id,
                fallback_alarm_time=alarm_time,
                details=details,
            )
            if snapshot_time is None:
                self._update_alarm_recording_status(alarm_id, "video_failed", None, "alarm_time missing")
                self._emit_alarm_log(
                    "error",
                    "[ALARM_VIDEO_FAILED] trace_id={} alarm_id={} device_id={} reason=alarm_time_missing",
                    alarm_trace_id or "-",
                    alarm_id,
                    device_id,
                )
                return

            try:
                recording_time_offset_seconds = float(os.getenv("ALARM_VIDEO_RECORDING_TIME_OFFSET_SECONDS", "0"))
            except (TypeError, ValueError):
                recording_time_offset_seconds = 0.0
            record_anchor_time = snapshot_time + timedelta(seconds=recording_time_offset_seconds)
            clip_start = record_anchor_time - timedelta(seconds=30)
            clip_end = record_anchor_time + timedelta(seconds=30)
            retry_interval_seconds = 5
            try:
                min_after_anchor_seconds = float(os.getenv("ALARM_VIDEO_MIN_AFTER_SNAPSHOT_SECONDS", "3"))
            except (TypeError, ValueError):
                min_after_anchor_seconds = 3.0
            min_after_anchor_seconds = max(0.0, min(min_after_anchor_seconds, 10.0))
            try:
                configured_wait = int(os.getenv("ALARM_VIDEO_MAX_WAIT_SECONDS", "120"))
            except (TypeError, ValueError):
                configured_wait = 120
            max_wait_seconds = max(90, min(configured_wait, 120))
            deadline = time.time() + max_wait_seconds
            last_error = None
            failure_status = "no_video_segment"
            last_segments = []
            last_covers_alarm_time = False

            self._emit_alarm_log(
                "info",
                "[ALARM_VIDEO_SCHEDULED] trace_id={} alarm_id={} device_id={} detection_time={} snapshot_time={} record_anchor_time={} source={} clip_start={} clip_end={} retry_interval={} max_wait={} min_after_anchor={} recording_time_offset_seconds={}",
                alarm_trace_id or "-",
                alarm_id,
                device_id,
                self._format_alarm_video_time(detection_time or snapshot_time),
                self._format_alarm_video_time(snapshot_time),
                self._format_alarm_video_time(record_anchor_time),
                alarm_time_source,
                self._format_alarm_video_time(clip_start),
                self._format_alarm_video_time(clip_end),
                retry_interval_seconds,
                max_wait_seconds,
                min_after_anchor_seconds,
                recording_time_offset_seconds,
            )

            self._emit_alarm_log(
                "info",
                "[ALARM_VIDEO_BOX_RESOLVE_START] alarm_id={} fallback_count={}",
                alarm_id,
                len(fallback_boxes or []),
            )
            resolved_boxes, box_source = self._resolve_alarm_boxes_for_video(
                alarm_id,
                details=details,
                fallback_boxes=fallback_boxes,
            )
            video_boxes = resolved_boxes or []
            box_rendered = False
            self._emit_alarm_log(
                "info",
                "[ALARM_VIDEO_BOX_RESOLVE_OK] alarm_id={} box_source={} box_count={}",
                alarm_id,
                box_source,
                len(video_boxes),
            )
            if not video_boxes:
                self._emit_alarm_log(
                    "info",
                    "[ALARM_VIDEO_BOX_SKIPPED] trace_id={} alarm_id={} reason=no_boxes",
                    alarm_trace_id or "-",
                    alarm_id,
                )

            attempt = 0
            while True:
                attempt += 1
                segments, covers_alarm_time, missing_reason = self._collect_alarm_video_segments(
                    video_id,
                    record_anchor_time,
                    clip_start,
                    clip_end,
                )
                last_segments = segments
                last_covers_alarm_time = covers_alarm_time
                self._log_alarm_video_state(
                    alarm_id,
                    device_id,
                    record_anchor_time,
                    clip_start,
                    clip_end,
                    segments,
                    covers_alarm_time,
                    video_boxes,
                    recording_status="generating" if covers_alarm_time else "waiting",
                    extra_reason=missing_reason,
                )

                if not covers_alarm_time:
                    last_error = ValueError(f"{missing_reason}: alarm_time_not_covered")
                    failure_status = "alarm_time_not_covered" if segments else "no_video_segment"
                    if time.time() >= deadline:
                        break
                    time.sleep(retry_interval_seconds)
                    continue

                try:
                    self._emit_alarm_log(
                        "info",
                        "[ALARM_VIDEO_GENERATING] trace_id={} alarm_id={} device_id={} attempt={} snapshot_time={} clip_start={} clip_end={}",
                        alarm_trace_id or "-",
                        alarm_id,
                        device_id,
                        attempt,
                        self._format_alarm_video_time(snapshot_time),
                        self._format_alarm_video_time(clip_start),
                        self._format_alarm_video_time(clip_end),
                    )
                    result = self.video_service.save_playback_clip(
                        video_id,
                        clip_start,
                        clip_end,
                        output_type="alarm",
                        filename_prefix=f"alarm_{alarm_id}",
                    )
                    recording_full_path = result.get("recording_full_path")
                    timing = self._validate_alarm_video_result(
                        result,
                        record_anchor_time,
                        clip_start,
                        clip_end,
                        min_after_anchor_seconds=min_after_anchor_seconds,
                    )
                    duration_seconds = timing["duration_seconds"]

                    actual_start = timing["actual_clip_start"]
                    actual_end = timing["actual_clip_end"]
                    anchor_alarm_second = max(
                        0,
                        min(int(round(timing["alarm_second"])), max(0, int(duration_seconds) - 1)),
                    )
                    box_alarm_second = anchor_alarm_second
                    alarm_record = self._find_alarm_doc_by_id(alarm_id) or {}
                    alarm_image_path = alarm_record.get("alarm_image_path") or ""
                    try:
                        matched_alarm_second, match_score = self._locate_alarm_frame_in_video(
                            recording_full_path,
                            alarm_image_path,
                            timing["alarm_second"],
                        )
                        self._emit_alarm_log(
                            "info",
                            "[ALARM_VIDEO_FRAME_MATCHED] alarm_id={} expected_by_anchor={} matched={} score={:.4f}",
                            alarm_id,
                            int(round(timing["alarm_second"])),
                            matched_alarm_second,
                            match_score,
                        )
                        box_alarm_second = matched_alarm_second
                    except Exception as match_error:
                        self._emit_alarm_log(
                            "warning",
                            "[ALARM_VIDEO_FRAME_MATCH_FALLBACK] alarm_id={} expected_by_anchor={} box_second={} reason={}",
                            alarm_id,
                            int(round(timing["alarm_second"])),
                            box_alarm_second,
                            match_error,
                        )

                    box_alarm_second = max(0, min(box_alarm_second, max(0, int(duration_seconds) - 1)))

                    box_render_error_text = ""
                    if video_boxes:
                        try:
                            self._draw_alarm_boxes_on_video(
                                recording_full_path,
                                video_boxes,
                                box_alarm_second,
                                draw_window_before=0.25,
                                draw_window_after=0.25,
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
                                len(video_boxes),
                            )
                            box_rendered = True
                        except Exception as box_error:
                            box_render_error_text = f"box render failed: {box_error}"
                            self._emit_alarm_log(
                                "error",
                                "[ALARM_VIDEO_BOX_FAILED] trace_id={} alarm_id={} error={}",
                                alarm_trace_id or "-",
                                alarm_id,
                                box_error,
                            )
                            box_rendered = False

                    self._update_alarm_recording_status(
                        alarm_id,
                        "saved",
                        result.get("recording_path"),
                        None,
                        duration_seconds=round(float(duration_seconds), 2),
                        start_time=self._format_alarm_video_time(actual_start),
                        end_time=self._format_alarm_video_time(actual_end),
                        alarm_second=anchor_alarm_second,
                    )
                    self._update_alarm_fields(
                        alarm_id,
                        {
                            "recording_status": "saved",
                            "recording_path": result.get("recording_path") or "",
                            "recording_error": box_render_error_text[:255] if box_render_error_text else "",
                            "duration_seconds": round(float(duration_seconds), 2),
                            "alarm_second": anchor_alarm_second,
                            "recording_start_time": self._format_alarm_video_time(actual_start),
                            "recording_end_time": self._format_alarm_video_time(actual_end),
                            "recording_time_offset_seconds": recording_time_offset_seconds,
                            "record_anchor_time": self._format_alarm_video_time(record_anchor_time),
                            "box_rendered": box_rendered,
                            "box_anchor_second": box_alarm_second,
                            "box_start_second": max(0, box_alarm_second - 1),
                            "box_end_second": min(int(duration_seconds), box_alarm_second + 2),
                        },
                    )
                    self._log_alarm_video_state(
                        alarm_id,
                        device_id,
                        record_anchor_time,
                        clip_start,
                        clip_end,
                        segments,
                        True,
                        video_boxes,
                        output_path=result.get("recording_path") or "",
                        duration_seconds=duration_seconds,
                        recording_status="saved",
                    )
                    self._emit_alarm_log(
                        "info",
                        "[ALARM_VIDEO_SAVED] trace_id={} alarm_id={} device_id={} path={} alarm_second={} box_second={} duration_seconds={:.2f}",
                        alarm_trace_id or "-",
                        alarm_id,
                        device_id,
                        result.get("recording_path"),
                        anchor_alarm_second,
                        box_alarm_second,
                        float(duration_seconds),
                    )
                    self._emit_alarm_log(
                        "info",
                        "[ALARM_VIDEO_FINAL] trace_id={} alarm_id={} detection_time={} snapshot_time={} record_anchor_time={} clip_requested_start={} clip_requested_end={} actual_clip_start={} actual_clip_end={} actual_duration={:.2f} alarm_second={:.2f} covers_anchor_time={} has_video_after_anchor={} box_rendered={} final_recording_status={}",
                        alarm_trace_id or "-",
                        alarm_id,
                        self._format_alarm_video_time(detection_time or snapshot_time),
                        self._format_alarm_video_time(snapshot_time),
                        self._format_alarm_video_time(record_anchor_time),
                        self._format_alarm_video_time(clip_start),
                        self._format_alarm_video_time(clip_end),
                        self._format_alarm_video_time(actual_start),
                        self._format_alarm_video_time(actual_end),
                        float(duration_seconds),
                        float(timing["alarm_second"]),
                        timing["covers_anchor_time"],
                        timing["has_video_after_anchor"],
                        box_rendered,
                        "saved",
                    )
                    return
                except Exception as exc:
                    last_error = exc
                    error_text = str(exc)
                    if "alarm_time_not_covered" in error_text or "record_anchor_time_not_covered" in error_text:
                        failure_status = "alarm_time_not_covered"
                    elif "record_anchor_tail_not_ready" in error_text:
                        failure_status = "alarm_time_not_covered"
                    elif "alarm_video_box_render_failed" in error_text:
                        failure_status = "alarm_video_box_render_failed"
                    else:
                        failure_status = self._classify_alarm_video_error(exc)

                    self._emit_alarm_log(
                        "warning",
                        "[ALARM_VIDEO_RETRY] trace_id={} alarm_id={} device_id={} attempt={} error={}",
                        alarm_trace_id or "-",
                        alarm_id,
                        device_id,
                        attempt,
                        exc,
                    )
                    if failure_status in {"video_failed", "alarm_video_box_render_failed"} or time.time() >= deadline:
                        break
                    time.sleep(retry_interval_seconds)

            self._update_alarm_recording_status(alarm_id, failure_status, None, str(last_error or ""))
            self._log_alarm_video_state(
                alarm_id,
                device_id,
                record_anchor_time,
                clip_start,
                clip_end,
                last_segments,
                last_covers_alarm_time,
                video_boxes,
                recording_status=failure_status,
                extra_reason=str(last_error or ""),
            )
            self._emit_alarm_log(
                "error",
                "[ALARM_VIDEO_FAILED] trace_id={} alarm_id={} device_id={} status={} error={}",
                alarm_trace_id or "-",
                alarm_id,
                device_id,
                failure_status,
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
        normalized_details = copy.deepcopy(details) if isinstance(details, dict) else {}
        boxes = self._extract_alarm_boxes(normalized_details)

        box_count = len(boxes)
        person_info = {}
        person_name = ""
        personnel_id = ""

        candidate_boxes = boxes
        if not candidate_boxes and isinstance(normalized_details, dict) and isinstance(normalized_details.get("boxes"), list):
            candidate_boxes = normalized_details["boxes"]

        # 收集所有 box 中的人员信息（支持多人告警）
        person_names = []
        personnel_ids = []
        person_infos = []
        first_box = {}

        if isinstance(candidate_boxes, list) and candidate_boxes:
            for candidate_box in candidate_boxes:
                if not isinstance(candidate_box, dict):
                    continue
                candidate_person = candidate_box.get("person") or {}
                candidate_name = (
                    candidate_box.get("personName")
                    or candidate_box.get("person_name")
                    or candidate_box.get("trigger_person_name")
                    or (candidate_person.get("username") if isinstance(candidate_person, dict) else "")
                    or (candidate_person.get("name") if isinstance(candidate_person, dict) else "")
                    or ""
                )
                candidate_id = (
                    candidate_box.get("personnel_id")
                    or candidate_box.get("trigger_person_id")
                    or (candidate_person.get("id") if isinstance(candidate_person, dict) else "")
                    or (candidate_person.get("_id") if isinstance(candidate_person, dict) else "")
                    or ""
                )
                if candidate_name and candidate_name not in person_names:
                    person_names.append(candidate_name)
                if candidate_id and str(candidate_id) not in personnel_ids:
                    personnel_ids.append(str(candidate_id))
                if candidate_name or candidate_id:
                    person_infos.append(candidate_person if isinstance(candidate_person, dict) and candidate_person else candidate_box)
                if not first_box and candidate_box.get("msg"):
                    first_box = candidate_box
            if not first_box:
                first_box = candidate_boxes[0] or {}
            alarm_msg = alarm_msg or first_box.get("msg")

        person_name = ", ".join(person_names) if person_names else ""
        personnel_id = ", ".join(personnel_ids) if personnel_ids else ""
        person_info = person_infos[0] if person_infos else {}

        if not alarm_type:
            alarm_type = "unknown"
        if not alarm_msg:
            alarm_msg = "检测到异常"
        alarm_msg = self._clean_alarm_display_message(alarm_msg)

        # 根据检测算法 code / 告警类型 / 中文名称获取对应的告警等级
        severity = self._resolve_ai_alarm_severity(alarm_type, algo_key=algo_key, details=details)
        # 方便排查：描述里附带框数量
        if box_count > 0:
            alarm_msg = f"{alarm_msg}（检测框数量: {box_count}）"

        try:
            next_id = int(get_next_sequence("alarm_record_id"))
            now = datetime.now()
            detected_at = None
            if isinstance(details, dict):
                for time_key in ("detection_time", "alarm_time", "trigger_time", "timestamp", "created_at"):
                    detected_at = self._coerce_alarm_datetime(details.get(time_key))
                    if detected_at is not None:
                        break
            if detected_at is None:
                detected_at = now
            bound_image_path = self._bind_alarm_image_filename(image_path, next_id, str(device_id))
            snapshot_at = self._coerce_alarm_datetime(
                self.video_service._parse_alarm_event_time(os.path.basename(urlsplit(str(bound_image_path)).path))
            )
            if snapshot_at is None and isinstance(details, dict):
                for time_key in ("snapshot_time", "image_time", "capture_time"):
                    snapshot_at = self._coerce_alarm_datetime(details.get(time_key))
                    if snapshot_at is not None:
                        break
            if snapshot_at is None:
                snapshot_at = detected_at

            if isinstance(normalized_details, dict):
                normalized_details["alarm_boxes"] = boxes
                normalized_details["boxes"] = boxes
                normalized_details["snapshot_time"] = snapshot_at
                normalized_details["image_time"] = snapshot_at
                normalized_details["capture_time"] = snapshot_at

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
                "timestamp": detected_at,
                "alarm_time": detected_at,
                "detection_time": detected_at,
                "snapshot_time": snapshot_at,
                "image_time": snapshot_at,
                "capture_time": snapshot_at,
                "description": alarm_msg,
                "status": "pending",
                "handled_at": None,
                "location": None,
                "recording_path": "",
                "recording_status": "pending",
                "recording_error": "",
                "alarm_image_path": bound_image_path or "",
                "alarm_boxes": boxes,
                "details": normalized_details,

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
                detected_at,
                alarm_trace_id=alarm_trace_id,
                details=details,
                boxes=boxes,
            )

            print(f"✅ 报警已保存 (ID: {next_id})")
            websocket_payload = {
                "id": saved_payload.get("id", next_id),
                "device_id": str(saved_payload.get("device_id", device_id)),
                "device_name": saved_payload.get("device_name") or saved_payload.get("trigger_device_name") or "",
                "branch_id": saved_payload.get("branch_id"),
                "branch_name": saved_payload.get("branch_name") or saved_payload.get("company") or "",
                "company": saved_payload.get("company") or saved_payload.get("branch_name") or "",
                "project_id": saved_payload.get("project_id"),
                "project_name": saved_payload.get("project_name") or saved_payload.get("project") or "",
                "project": saved_payload.get("project") or saved_payload.get("project_name") or "",
                "grid_id": saved_payload.get("grid_id"),
                "grid_name": saved_payload.get("grid_name") or saved_payload.get("grid") or "",
                "grid": saved_payload.get("grid") or saved_payload.get("grid_name") or "",
                "team_id": saved_payload.get("team_id"),
                "team_name": saved_payload.get("team_name") or saved_payload.get("team") or "",
                "team": saved_payload.get("team") or saved_payload.get("team_name") or "",
                "person_branch_id": saved_payload.get("person_branch_id"),
                "person_branch_name": saved_payload.get("person_branch_name") or saved_payload.get("person_company") or "",
                "person_company": saved_payload.get("person_company") or saved_payload.get("person_branch_name") or "",
                "person_project_id": saved_payload.get("person_project_id"),
                "person_project_name": saved_payload.get("person_project_name") or saved_payload.get("person_project") or "",
                "person_project": saved_payload.get("person_project") or saved_payload.get("person_project_name") or "",
                "person_grid_id": saved_payload.get("person_grid_id"),
                "person_grid_name": saved_payload.get("person_grid_name") or saved_payload.get("person_grid") or "",
                "person_grid": saved_payload.get("person_grid") or saved_payload.get("person_grid_name") or "",
                "person_team_id": saved_payload.get("person_team_id"),
                "person_team_name": saved_payload.get("person_team_name") or saved_payload.get("person_team") or "",
                "person_team": saved_payload.get("person_team") or saved_payload.get("person_team_name") or "",
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
                "personnel_id": saved_payload.get("personnel_id", personnel_id),
                "person_name": saved_payload.get("person_name", person_name or "未知"),
                "trigger_person_id": saved_payload.get("trigger_person_id") or saved_payload.get("personnel_id", personnel_id),
                "trigger_person_name": saved_payload.get("trigger_person_name") or saved_payload.get("person_name", person_name or "未知"),
                "person": saved_payload.get("person") or person_info or {},
                "alarm_second": saved_payload.get("alarm_second"),
                "recording_start_time": saved_payload.get("recording_start_time"),
                "recording_end_time": saved_payload.get("recording_end_time"),
                "duration_seconds": saved_payload.get("duration_seconds"),
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
