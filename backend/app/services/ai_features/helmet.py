from .registry import ai_rule
from .face_fusion import attach_faces_to_boxes
from ultralytics import YOLO
import os

# ==========================================
# 分类别置信度阈值
# ==========================================
CONF_HEAD = 0.1     # 对未戴帽（头）的置信度阈值
CONF_HELMET = 0.6   # 对已戴帽（安全帽）的置信度阈值
ALARM_COOLDOWN_SECONDS = 120
HELMET_MODEL_PATH = "app/yolo_models/yolo26-helmet.pt"
_HELMET_MODEL = None


def _load_helmet_model_safe():
    global _HELMET_MODEL
    if _HELMET_MODEL is not None:
        return True

    try:
        path = os.path.join(os.getcwd(), HELMET_MODEL_PATH)
        if not os.path.exists(path):
            print(f"❌ [错误] 找不到Helmet模型: {path}")
            return False

        print("⏳ [AI安全帽] 正在加载Helmet模型 (CPU模式)...")
        model = YOLO(path)
        model.to("cpu")
        _HELMET_MODEL = model
        print("✅ [AI安全帽] Helmet模型加载完成")
        return True
    except Exception as e:
        print(f"❌ [严重错误] Helmet模型加载失败: {e}")
        return False


def _helmet_detect(frame, conf_head=0.1, conf_helmet=0.6):
    """
    单模型安全帽检测，支持 head/helmet 分类别置信度过滤。
    返回: dict {"all_boxes": [...], "head_count": int, "helmet_count": int} 或 None
    """
    if not _load_helmet_model_safe():
        return None

    base_conf = min(conf_head, conf_helmet)
    results = _HELMET_MODEL(frame, conf=base_conf, verbose=False)[0]

    all_boxes = []
    head_count = 0
    helmet_count = 0

    for box in results.boxes:
        cls_name = results.names[int(box.cls[0])]
        conf_val = float(box.conf[0])
        coords = box.xyxy[0].tolist()

        if cls_name == "head" and conf_val < conf_head:
            continue
        if cls_name == "helmet" and conf_val < conf_helmet:
            continue

        all_boxes.append({
            "label": cls_name,
            "conf": conf_val,
            "coords": coords,
        })

        if cls_name == "head":
            head_count += 1
        elif cls_name == "helmet":
            helmet_count += 1

    return {
        "all_boxes": all_boxes,
        "head_count": head_count,
        "helmet_count": helmet_count,
    }


@ai_rule("helmet", "安全帽类")
def detect_safety_helmet(service, frame):
    """单模型安全帽检测：head=未戴帽报警，helmet=已戴帽合规（支持多目标）"""
    if frame is None:
        return False, None

    if service.is_debug_force("helmet"):
        return service._check_cooldown_and_alarm(
            "未佩戴安全帽",
            "DEBUG: 强制触发未佩戴安全帽报警（链路测试）",
            1.0,
            service._debug_box(frame),
            cooldown_seconds=ALARM_COOLDOWN_SECONDS,
        )

    try:
        result = _helmet_detect(frame, conf_head=CONF_HEAD, conf_helmet=CONF_HELMET)
        if result is None:
            return False, None

        head_count = result["head_count"]
        helmet_count = result["helmet_count"]
        all_boxes = result["all_boxes"]

        # 没有检测到任何 head 或 helmet
        if head_count == 0 and helmet_count == 0:
            return False, None

        # 有 head（未戴帽）就报警，收集所有 head 框
        if head_count > 0:
            violation_boxes = []
            for b in all_boxes:
                if b["label"] == 'head':
                    violation_boxes.append({
                        "type": "未佩戴安全帽",
                        "msg": f"检测到人员未佩戴安全帽 ({b['conf']:.0%})",
                        "score": b["conf"],
                        "coords": b["coords"],
                    })
            if violation_boxes:
                violation_boxes = attach_faces_to_boxes(frame, violation_boxes)

                return service._check_cooldown_and_multi_alarm(
                    "未佩戴安全帽",
                    violation_boxes,
                    cooldown_seconds=ALARM_COOLDOWN_SECONDS,
                )

        # 只有 helmet，全部合规
        return False, None

    except Exception as e:
        print(f"⚠️ 安全帽检测出错: {e}")
        return False, None
