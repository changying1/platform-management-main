from pathlib import Path

from ultralytics import YOLO

from .registry import ai_rule


# ==========================================
# 作业行为模型配置
# ==========================================
WORK_BEHAVIOR_MODEL_PATH = "app/yolo_models/yolo26-phone_smoke.pt"
WORK_BEHAVIOR_CONF = 0.25
WORK_BEHAVIOR_IOU = 0.45
ALARM_COOLDOWN_SECONDS = 120

_WORK_BEHAVIOR_MODEL = None


def _load_work_behavior_model_safe():
    global _WORK_BEHAVIOR_MODEL
    if _WORK_BEHAVIOR_MODEL is not None:
        return True

    try:
        path = Path(WORK_BEHAVIOR_MODEL_PATH)
        if not path.exists():
            print(f"❌ [错误] 找不到作业行为模型: {path}")
            return False

        print(f"✅ [AI作业行为] 使用模型: {path}")
        model = YOLO(str(path))
        model.to("cpu")
        _WORK_BEHAVIOR_MODEL = model
        return True
    except Exception as e:
        print(f"❌ [严重错误] 作业行为模型加载失败: {e}")
        return False


def _work_behavior_detect(frame):
    """
    单模型作业行为检测：
    cls=0 -> 玩手机
    cls=1 -> 抽烟
    """
    if not _load_work_behavior_model_safe():
        return None

    results = _WORK_BEHAVIOR_MODEL(
        frame,
        conf=WORK_BEHAVIOR_CONF,
        iou=WORK_BEHAVIOR_IOU,
        verbose=False,
    )[0]

    boxes = []
    if not results.boxes:
        return boxes

    for box in results.boxes:
        cls = int(box.cls[0])
        conf_val = float(box.conf[0])
        coords = box.xyxy[0].tolist()

        if cls == 0:
            boxes.append({
                "type": "作业行为违规",
                "msg": f"检测到作业时玩手机 ({conf_val:.0%})",
                "score": conf_val,
                "coords": coords,
            })
            print(f"📱 检测到玩手机 (置信度: {conf_val:.2f})")
        elif cls == 1:
            boxes.append({
                "type": "作业行为违规",
                "msg": f"检测到作业时抽烟 ({conf_val:.0%})",
                "score": conf_val,
                "coords": coords,
            })
            print(f"🚬 检测到抽烟 (置信度: {conf_val:.2f})")

    return boxes


@ai_rule("behavior", "作业行为类")
def detect_work_behavior(service, frame):
    if frame is None:
        return False, None

    if service.is_debug_force("behavior"):
        return service._check_cooldown_and_alarm(
            "作业行为违规",
            "DEBUG: 强制触发作业行为违规报警（玩手机/抽烟）",
            1.0,
            service._debug_box(frame),
            cooldown_seconds=ALARM_COOLDOWN_SECONDS,
        )

    try:
        violation_boxes = _work_behavior_detect(frame)
        if not violation_boxes:
            return False, None

        return service._check_cooldown_and_multi_alarm(
            "作业行为违规",
            violation_boxes,
            cooldown_seconds=ALARM_COOLDOWN_SECONDS,
        )

    except Exception as e:
        print(f"⚠️ 作业行为检测出错: {e}")
        return False, None
