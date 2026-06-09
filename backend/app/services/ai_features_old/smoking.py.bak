from .registry import ai_rule

# 抽烟检测置信度阈值（高于双模型推理的 0.1，过滤低置信度误报）
SMOKING_CONFIDENCE = 0.50


@ai_rule("smoking", "抽烟检测")

def detect_smoking(service, frame):
    """基于 YOLO26 双模型检测是否有人员抽烟（支持多目标）"""
    if frame is None:
        return False, None

    if service.is_debug_force("smoking"):
        return service._check_cooldown_and_alarm(
            "检测到抽烟行为",
            "DEBUG: 强制触发抽烟报警（链路测试）",
            1.0,
            service._debug_box(frame),
        )

    try:
        result = service._dual_detect(frame, conf=0.1)
        if result is None:
            return False, None

        detected_types = result["detected_types"]
        all_boxes = result["all_boxes"]

        if 'Smoking' not in detected_types:
            return False, None

        # 收集所有置信度达标的 Smoking 框
        smoking_boxes = []
        for b in all_boxes:
            if b["label"] == 'Smoking' and b["conf"] >= SMOKING_CONFIDENCE:
                smoking_boxes.append({
                    "type": "检测到抽烟行为",
                    "msg": f"检测到人员正在抽烟 ({b['conf']:.0%})",
                    "score": b["conf"],
                    "coords": b["coords"],
                })

        if not smoking_boxes:
            return False, None

        return service._check_cooldown_and_multi_alarm("检测到抽烟行为", smoking_boxes)

    except Exception as e:
        print(f"⚠️ 抽烟检测出错: {e}")
        return False, None
