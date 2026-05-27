from .registry import ai_rule

@ai_rule("signage", "现场标识类")

def detect_site_signage(service, frame):
    if frame is None:
        return False, None

    if service.is_debug_force("signage"):
        return service._check_cooldown_and_alarm(
            "安全标识缺失",
            "DEBUG: 强制触发安全标识缺失报警(链路测试)",
            1.0,
            service._debug_box(frame),
        )

    if service.model is None and not service._load_model_safe():
        return False, None

    try:
        h, w, _ = frame.shape
        roi_x1, roi_y1 = int(w * 0.2), int(h * 0.2)
        roi_x2, roi_y2 = int(w * 0.8), int(h * 0.8)

        results = service.model(frame, conf=0.45, verbose=False)[0]
        sign_found_in_roi = False

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)
            if label == "safety_sign":
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                center_x = (x1 + x2) / 2
                center_y = (y1 + y2) / 2
                if roi_x1 < center_x < roi_x2 and roi_y1 < center_y < roi_y2:
                    sign_found_in_roi = True
                    break

        if sign_found_in_roi:
            service.sign_missing_counter = 0
            return False, None

        service.sign_missing_counter += 1
        if service.sign_missing_counter >= service.MISSING_THRESHOLD:
            return service._check_cooldown_and_alarm(
                "安全标识缺失",
                "固定监控区域内未检测到风险告知牌/操作规程牌",
                1.0,
                [roi_x1, roi_y1, roi_x2, roi_y2],
            )

        return False, None

    except Exception as e:
        print(f"⚠️ 标识检测出错: {e}")
        return False, None
