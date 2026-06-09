from .registry import ai_rule

@ai_rule("harness", "安全带类")

def detect_safety_harness(service, frame):
    if frame is None:
        return False, None

    if service.is_debug_force("harness"):
        return service._check_cooldown_and_alarm(
            "未正确佩戴安全带",
            "DEBUG: 强制触发安全带佩戴违规报警(链路测试)",
            1.0,
            service._debug_box(frame),
        )

    if service.model is None and not service._load_model_safe():
        return False, None

    try:
        results = service.model(frame, conf=0.5, verbose=False)[0]
        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label == "harness_violation":
                conf = float(box.conf[0])
                coords = box.xyxy[0].tolist()
                return service._check_cooldown_and_alarm(
                    "未正确佩戴安全带",
                    "检测到高处作业人员安全带佩戴不符合五点式标准",
                    conf,
                    coords,
                )

        return False, None

    except Exception as e:
        print(f"⚠️ 安全带检测出错: {e}")
        return False, None
