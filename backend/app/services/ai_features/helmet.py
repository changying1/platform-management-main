from .registry import ai_rule
from .face_fusion import attach_faces_to_boxes

# ==========================================
# 分类别置信度阈值
# ==========================================
CONF_HEAD = 0.1     # 对未戴帽（头）的置信度阈值
CONF_HELMET = 0.6   # 对已戴帽（安全帽）的置信度阈值
ALARM_COOLDOWN_SECONDS = 120


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
        result = service._helmet_detect(frame, conf_head=CONF_HEAD, conf_helmet=CONF_HELMET)
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
