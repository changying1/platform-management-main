from .registry import ai_rule

CONF_HEAD = 0.1
CONF_HELMET = 0.6


@ai_rule("helmet", "安全帽类")

def detect_safety_helmet(service, frame):
    """单模型安全帽检测:head=未戴帽报警,helmet=已戴帽合规(支持多目标)"""
    if frame is None:
        return False, None

    if service.is_debug_force("helmet"):
        return service._check_cooldown_and_alarm(
            "未佩戴安全帽",
            "DEBUG: 强制触发未佩戴安全帽报警(链路测试)",
            1.0,
            service._debug_box(frame),
        )

    try:
        result = service._helmet_detect(frame, conf_head=CONF_HEAD, conf_helmet=CONF_HELMET)
        if result is None:
            return False, None

        head_count = result["head_count"]
        helmet_count = result["helmet_count"]
        all_boxes = result["all_boxes"]

        if head_count == 0 and helmet_count == 0:
            return False, None

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
                return service._check_cooldown_and_multi_alarm("未佩戴安全帽", violation_boxes)

        return False, None

    except Exception as e:
        print(f"⚠️ 安全帽检测出错: {e}")
        return False, None
