import math
import os
import threading

from ultralytics import YOLO

from .registry import ai_rule

PERSON_DISTANCE_MODEL_PATH = os.getenv(
    "AI_PERSON_DISTANCE_MODEL_PATH",
    "app/ai_models/yolo26_person_distance.pt",
)
PERSON_DISTANCE_CONFIDENCE = float(os.getenv("AI_PERSON_DISTANCE_CONFIDENCE", "0.3"))
PERSON_DISTANCE_SAFE_METERS = float(os.getenv("AI_PERSON_DISTANCE_SAFE_METERS", "1.5"))
PERSON_DISTANCE_PIXEL_PER_METER_RATIO = float(
    os.getenv("AI_PERSON_DISTANCE_PIXEL_PER_METER_RATIO", "0.3")
)
PERSON_DISTANCE_COOLDOWN_SECONDS = int(os.getenv("AI_PERSON_DISTANCE_COOLDOWN_SECONDS", "120"))

_PERSON_DISTANCE_MODEL = None
_PERSON_DISTANCE_MODEL_LOCK = threading.Lock()


def _load_person_distance_model():
    global _PERSON_DISTANCE_MODEL

    if _PERSON_DISTANCE_MODEL is not None:
        return _PERSON_DISTANCE_MODEL

    with _PERSON_DISTANCE_MODEL_LOCK:
        if _PERSON_DISTANCE_MODEL is not None:
            return _PERSON_DISTANCE_MODEL

        model_path = os.path.join(os.getcwd(), PERSON_DISTANCE_MODEL_PATH)
        if not os.path.exists(model_path):
            print(f"[AI person_distance] 未找到模型文件: {model_path}")
            return None

        try:
            model = YOLO(model_path)
            model.to("cpu")
            _PERSON_DISTANCE_MODEL = model
            print(f"[AI person_distance] 模型加载成功: {model_path}")
            return _PERSON_DISTANCE_MODEL
        except Exception as exc:
            print(f"[AI person_distance] 模型加载失败: {exc}")
            return None


def _is_person_label(cls_id, cls_name):
    normalized_name = str(cls_name or "").strip().lower()
    return normalized_name == "person" or cls_id == 0 or "person" in normalized_name


def _result_class_name(results, cls_id):
    names = getattr(results, "names", None)
    if isinstance(names, dict):
        return names.get(cls_id, str(cls_id))
    if isinstance(names, (list, tuple)) and 0 <= cls_id < len(names):
        return names[cls_id]
    return str(cls_id)


@ai_rule("person_distance", "多人作业人员间距检测")
def person_distance(service, frame):
    if frame is None:
        return False, None

    if service.is_debug_force("person_distance"):
        return service._check_cooldown_and_alarm(
            "person_distance",
            "DEBUG: 人员间距检测强制告警",
            1.0,
            service._debug_box(frame),
            cooldown_seconds=PERSON_DISTANCE_COOLDOWN_SECONDS,
        )

    model = _load_person_distance_model()
    if model is None:
        return False, None

    try:
        results = model(frame, conf=PERSON_DISTANCE_CONFIDENCE, verbose=False)[0]
    except Exception as exc:
        print(f"[AI person_distance] 推理失败: {exc}")
        return False, None

    person_boxes = []

    for box in results.boxes:
        cls_id = int(box.cls[0])
        cls_name = _result_class_name(results, cls_id)
        if not _is_person_label(cls_id, cls_name):
            continue

        conf_val = float(box.conf[0])
        coords = box.xyxy[0].tolist()
        bottom_center_x = (coords[0] + coords[2]) / 2
        bottom_center_y = coords[3]

        person_boxes.append(
            {
                "coords": coords,
                "bottom_center": (bottom_center_x, bottom_center_y),
                "conf": conf_val,
            }
        )

    if len(person_boxes) < 2:
        return False, None

    frame_width = frame.shape[1]
    pixel_per_meter = max(1.0, frame_width * PERSON_DISTANCE_PIXEL_PER_METER_RATIO)
    safe_distance_pixels = PERSON_DISTANCE_SAFE_METERS * pixel_per_meter
    violation_boxes = []
    violation_pairs = []

    for i in range(len(person_boxes)):
        for j in range(i + 1, len(person_boxes)):
            person1 = person_boxes[i]
            person2 = person_boxes[j]

            x1, y1 = person1["bottom_center"]
            x2, y2 = person2["bottom_center"]
            pixel_distance = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

            if pixel_distance >= safe_distance_pixels:
                continue

            actual_distance = pixel_distance / pixel_per_meter
            alarm_msg = (
                f"多人作业安全距离不足 "
                f"({actual_distance:.2f}m < {PERSON_DISTANCE_SAFE_METERS:.1f}m)"
            )
            violation_pairs.append((i + 1, j + 1, actual_distance))

            violation_boxes.append(
                {
                    "type": "person_distance",
                    "msg": alarm_msg,
                    "score": person1["conf"],
                    "coords": person1["coords"],
                }
            )
            violation_boxes.append(
                {
                    "type": "person_distance",
                    "msg": alarm_msg,
                    "score": person2["conf"],
                    "coords": person2["coords"],
                }
            )

    if not violation_boxes:
        return False, None

    is_alarm, details = service._check_cooldown_and_multi_alarm(
        "person_distance",
        violation_boxes,
        cooldown_seconds=PERSON_DISTANCE_COOLDOWN_SECONDS,
    )

    if is_alarm:
        pair_desc = ", ".join(
            [f"({a},{b})={distance:.2f}m" for a, b, distance in violation_pairs[:5]]
        )
        if len(violation_pairs) > 5:
            pair_desc += " ..."
        print(
            f"[AI person_distance] 检测到人员间距违规: "
            f"人员数={len(person_boxes)} 违规对数={len(violation_pairs)} "
            f"详情={pair_desc}"
        )
    else:
        print("[AI person_distance] 检测到人员间距违规，但命中冷却时间，未重复报警")

    return is_alarm, details
