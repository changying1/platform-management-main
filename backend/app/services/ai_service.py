import os
import time

from app.core.ws_manager import push_alarm, push_alarm_threadsafe
from app.services.ai_features.helmet import detect_safety_helmet as helmet_rule
import asyncio


class AIService:
    def __init__(self, cooldown_seconds=5, shared_cooldown_map=None):
        self.cooldown_seconds = cooldown_seconds
        # 如果传入共享映射则用共享的，否则用实例私有的（兼容旧调用）
        self.last_alarm_time_map = shared_cooldown_map if shared_cooldown_map is not None else {}

        self.debug_force_alarms = set(
            [x.strip() for x in os.getenv("AI_DEBUG_FORCE_ALARMS", "").split(",") if x.strip()]
        )

    def is_debug_force(self, algo_key: str) -> bool:
        return ("all" in self.debug_force_alarms) or (algo_key in self.debug_force_alarms)

    def _debug_box(self, frame):
        try:
            h, w = frame.shape[:2]
            return [int(w * 0.12), int(h * 0.12), int(w * 0.45), int(h * 0.45)]
        except Exception:
            return [0, 0, 120, 120]

    def _check_cooldown_and_alarm(self, alarm_type, msg, score, coords, cooldown_seconds=None):

        now = time.time()
        
        # 统一规范化 key，防止因为带了动态后缀导致的冷却失效
        # 例如将 "现场人数统计违规"、"现场人数统计异常" 统一映射为同一个冷却 KEY
        cooldown_key = alarm_type
        if "安全标识" in alarm_type or "缺失标识" in alarm_type:
            cooldown_key = "SAFETY_SIGN_COOLDOWN"
        elif "人数统计" in alarm_type or "监护人" in alarm_type:
            cooldown_key = "SUPERVISOR_COOLDOWN"
        elif "梯子" in alarm_type:
            cooldown_key = "LADDER_COOLDOWN"

        last = self.last_alarm_time_map.get(cooldown_key, 0.0)

        # 默认按钮：5秒，特殊名单：300秒；支持按规则覆盖
        current_cooldown = self.cooldown_seconds if cooldown_seconds is None else cooldown_seconds
        current_cooldown = max(10, current_cooldown)
        
        is_long_cooldown = cooldown_key in ["SAFETY_SIGN_COOLDOWN", "SUPERVISOR_COOLDOWN", "LADDER_COOLDOWN"]
        if is_long_cooldown:
            current_cooldown = 300

        if now - last > current_cooldown:
            # 写入统一的共享 KEY
            self.last_alarm_time_map[cooldown_key] = now

            print(f"🚨 [AI监测] 报警已发出! ({alarm_type})")

            data = {
                "alarm": True,
                "boxes": [
                    {
                        "type": alarm_type,
                        "msg": msg,
                        "score": score,
                        "coords": coords
                    }
                ]
            }

            # 在 AI 线程中安全触发异步推送，避免 no running event loop
            self._push_alarm_safe(data)

            return True, data

        return False, None

    def _check_cooldown_and_multi_alarm(self, alarm_type, boxes, cooldown_seconds=None):
        """多目标版本：一次推送多个标框，共享冷却控制"""
        now = time.time()
        cooldown_key = alarm_type
        last = self.last_alarm_time_map.get(cooldown_key, 0.0)

        current_cooldown = self.cooldown_seconds if cooldown_seconds is None else cooldown_seconds
        current_cooldown = max(10, current_cooldown)

        if now - last > current_cooldown:
            self.last_alarm_time_map[cooldown_key] = now
            data = {"alarm": True, "boxes": boxes}
            self._push_alarm_safe(data)
            print(f"🚨 [AI监测] 报警已发出! ({alarm_type})")
            return True, data

        return False, None

    def _push_alarm_safe(self, data):
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(push_alarm(data))
        except RuntimeError:
            # 当前线程没有事件循环（AI 检测线程常见），投递到主事件循环。
            try:
                push_alarm_threadsafe(data)
            except Exception as e:
                print(f"⚠️ WebSocket 推送失败: {e}")
        except Exception as e:
            print(f"⚠️ WebSocket 推送失败: {e}")

