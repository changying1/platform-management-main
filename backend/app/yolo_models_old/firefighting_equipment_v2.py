import math
import os
import threading

import cv2

from .registry import ai_rule


DISTANCE_THRESHOLD_PX = int(os.getenv("FIRE_DISTANCE_THRESHOLD_PX", "1000"))
ALARM_TYPE = "消防措施不足"
ALARM_MESSAGE = "动火作业现场未满足消防安全要求:半径10m内无灭火器/消防水桶,且无正确使用的灭火毯"
ALARM_COOLDOWN_SECONDS = 300

_FIRE_SERVICE = None
_FIRE_SERVICE_LOCK = threading.Lock()


class FireEquipmentService:
    def __init__(self, model_path: str = "app/models/fire_equipment.pt"):
        self.model_path = model_path
        self.model = None
        self.class_names = {
            0: "fire_bucket",
            1: "fire_blanket",
            2: "fire_extinguisher",
            3: "fire",
            4: "smoke",
            5: "spark",
        }
        self.class_names_cn = {
            "fire_extinguisher": "灭火器",
            "fire_bucket": "消防水桶",
            "fire_blanket": "灭火毯",
            "fire": "火焰",
            "smoke": "烟雾",
            "spark": "火花",
        }
        self.equipment_classes = {"fire_extinguisher", "fire_bucket", "fire_blanket"}
        self.fire_zone_classes = {"fire", "smoke", "spark"}

    def _resolve_model_path(self) -> str:
        if os.path.isabs(self.model_path):
            return self.model_path

        normalized = self.model_path.replace("/", os.sep).replace("\\", os.sep)
        feature_dir = os.path.dirname(os.path.abspath(__file__))
        services_dir = os.path.dirname(feature_dir)
        app_dir = os.path.dirname(services_dir)
        backend_dir = os.path.dirname(app_dir)

        candidates = [
            os.path.join(os.getcwd(), normalized),
            os.path.join(backend_dir, normalized),
            os.path.join(app_dir, os.path.basename(normalized)),
        ]

        for candidate in candidates:
            if os.path.exists(candidate):
                return candidate

        return candidates[0]

    def _cuda_available(self) -> bool:
        try:
            import torch

            return torch.cuda.is_available()
        except Exception:
            return False

    def _load_model_safe(self) -> bool:
        if self.model is not None:
            return True

        try:
            full_path = self._resolve_model_path()
            if not os.path.exists(full_path):
                print(f"[fire_equipment_v2] 未找到模型文件: {full_path}")
                return False

            from ultralytics import YOLO

            print("[fire_equipment_v2] 正在加载动火消防器材模型...")
            loaded_model = YOLO(full_path)
            loaded_model.to("cuda" if self._cuda_available() else "cpu")
            self.model = loaded_model
            print("[fire_equipment_v2] 动火消防器材模型加载完成")
            return True
        except Exception as exc:
            print(f"[fire_equipment_v2] 模型加载失败: {exc}")
            return False

    def get_raw_detection(self, frame, conf: float = 0.5):
        if frame is None:
            return None

        if not self._load_model_safe():
            return None

        try:
            results = self.model(frame, conf=conf, verbose=False)[0]
        except Exception as exc:
            print(f"[fire_equipment_v2] 推理失败: {exc}")
            return None

        equipment = []
        fire_zones = []

        for box in results.boxes:
            cls_id = int(box.cls[0])
            cls_name = results.names.get(cls_id, self.class_names.get(cls_id, "unknown"))
            item = {
                "label": cls_name,
                "label_cn": self.class_names_cn.get(cls_name, cls_name),
                "conf": float(box.conf[0]),
                "coords": box.xyxy[0].tolist(),
            }

            if cls_name in self.equipment_classes:
                equipment.append(item)
            elif cls_name in self.fire_zone_classes:
                fire_zones.append(item)

        return {
            "equipment": equipment,
            "fire_zones": fire_zones,
        }

    def draw_detection_result(self, frame, detect_result):
        if frame is None or detect_result is None:
            return frame

        draw_frame = frame.copy()

        for item in detect_result.get("equipment", []):
            x1, y1, x2, y2 = map(int, item["coords"])
            label = f"{item['label_cn']} {item['conf']:.2f}"
            cv2.rectangle(draw_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(draw_frame, label, (x1, max(20, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        for item in detect_result.get("fire_zones", []):
            x1, y1, x2, y2 = map(int, item["coords"])
            label = f"{item['label_cn']} {item['conf']:.2f}"
            cv2.rectangle(draw_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
            cv2.putText(draw_frame, label, (x1, max(20, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        return draw_frame


def _get_fire_service() -> FireEquipmentService:
    global _FIRE_SERVICE
    if _FIRE_SERVICE is not None:
        return _FIRE_SERVICE

    with _FIRE_SERVICE_LOCK:
        if _FIRE_SERVICE is None:
            _FIRE_SERVICE = FireEquipmentService(model_path="app/models/fire_equipment.pt")

    return _FIRE_SERVICE


def judge_fire_equipment_violation(service, detect_result):
    if not detect_result:
        return False, None

    equipment = detect_result.get("equipment", [])
    fire_zones = detect_result.get("fire_zones", [])

    if not fire_zones:
        return False, None

    extinguishers = [item for item in equipment if item.get("label") == "fire_extinguisher"]
    buckets = [item for item in equipment if item.get("label") == "fire_bucket"]
    blankets = [item for item in equipment if item.get("label") == "fire_blanket"]

    violation_boxes = []
    for zone in fire_zones:
        measure_satisfied = False

        if _has_nearby_equipment(extinguishers, zone):
            measure_satisfied = True
        if _has_nearby_equipment(buckets, zone):
            measure_satisfied = True
        if _is_blanket_covering_correctly(blankets, zone):
            measure_satisfied = True

        if not measure_satisfied:
            violation_boxes.append(
                {
                    "type": ALARM_TYPE,
                    "msg": ALARM_MESSAGE,
                    "score": 1.0,
                    "coords": zone["coords"],
                }
            )

    if not violation_boxes:
        return False, None

    print(
        "[fire_equipment_v2] 检测到动火消防器材违规: "
        f"火源区域={len(fire_zones)} "
        f"灭火器={len(extinguishers)} "
        f"消防水桶={len(buckets)} "
        f"灭火毯={len(blankets)} "
        f"违规区域={len(violation_boxes)}"
    )

    is_alarm, details = service._check_cooldown_and_multi_alarm(
        ALARM_TYPE,
        violation_boxes,
        cooldown_seconds=ALARM_COOLDOWN_SECONDS,
    )

    if is_alarm:
        print("[fire_equipment_v2] 已触发报警")
    else:
        print("[fire_equipment_v2] 检测到违规,但命中冷却时间,未重复报警")

    return is_alarm, details


def _has_nearby_equipment(equipment_list, fire_zone, threshold_px: int = DISTANCE_THRESHOLD_PX) -> bool:
    if not equipment_list:
        return False

    zx1, zy1, zx2, zy2 = fire_zone["coords"]
    zone_cx = (zx1 + zx2) / 2
    zone_cy = (zy1 + zy2) / 2

    for item in equipment_list:
        ex1, ey1, ex2, ey2 = item["coords"]
        item_cx = (ex1 + ex2) / 2
        item_cy = (ey1 + ey2) / 2
        dist = math.sqrt((item_cx - zone_cx) ** 2 + (item_cy - zone_cy) ** 2)
        if dist < threshold_px:
            return True

    return False


def _is_blanket_covering_correctly(blankets, fire_zone) -> bool:
    if not blankets:
        return False

    zx1, zy1, zx2, zy2 = fire_zone["coords"]
    zone_center_x = (zx1 + zx2) / 2
    zone_center_y = (zy1 + zy2) / 2
    zone_bottom_y = zy2
    zone_height = max(1, zy2 - zy1)

    for blanket in blankets:
        bx1, by1, bx2, by2 = blanket["coords"]
        blanket_center_y = (by1 + by2) / 2

        horizontal_cover = bx1 < zone_center_x < bx2
        vertical_below = blanket_center_y > zone_center_y
        vertical_distance = by1 - zone_bottom_y
        close_enough = vertical_distance < zone_height * 2

        if horizontal_cover and vertical_below and close_enough:
            return True

    return False


@ai_rule("firefighting_equipment_v2", "动火消防器材V2")
def firefighting_equipment_v2(service, frame):
    if frame is None:
        return False, None

    if service.is_debug_force("firefighting_equipment_v2"):
        return service._check_cooldown_and_alarm(
            ALARM_TYPE,
            f"DEBUG: {ALARM_MESSAGE}",
            1.0,
            service._debug_box(frame),
            cooldown_seconds=ALARM_COOLDOWN_SECONDS,
        )

    detector = _get_fire_service()
    detect_result = detector.get_raw_detection(frame, conf=0.5)
    if detect_result is None:
        return False, None

    return judge_fire_equipment_violation(service, detect_result)
