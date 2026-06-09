from .registry import ai_rule

@ai_rule("boom_sign", "曲臂车现场标识类")

def detect_boom_lift_site_signage(service, frame):
    if frame is None:
        return False, None

    if service.is_debug_force("boom_sign"):
        return service._check_cooldown_and_alarm(
            "曲臂车现场标识缺失",
            "DEBUG: 强制触发曲臂车现场标识缺失报警",
            1.0,
            service._debug_box(frame),
        )

    if service.model is None and not service._load_model_safe():
        return False, None

    try:
        results = service.model(frame, conf=0.45, verbose=False)[0]

        violation_labels = {"boom_lift_no_sign", "curved_arm_no_sign", "曲臂车无标识"}
        boom_labels = {"boom_lift", "aerial_work_platform", "mewp", "曲臂车", "高空作业平台"}
        sign_ok_labels = {
            "safety_sign",
            "warning_sign", "operation_procedure", "acceptance_plate",
            "警示标识", "操作规程牌", "验收牌",
        }

        found_boom = None
        found_any_sign = False

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in violation_labels:
                conf = float(box.conf[0])
                coords = box.xyxy[0].tolist()
                return service._check_cooldown_and_alarm(
                    "曲臂车现场标识缺失",
                    "检测到曲臂车作业现场缺少警示标识/操作规程/验收牌",
                    conf,
                    coords,
                )

            if found_boom is None and label in boom_labels:
                found_boom = box
            if label in sign_ok_labels:
                found_any_sign = True

        if found_boom is not None and not found_any_sign:
            service.boom_sign_missing_counter += 1
            if service.boom_sign_missing_counter >= service.BOOM_MISSING_THRESHOLD:
                coords = found_boom.xyxy[0].tolist()
                return service._check_cooldown_and_alarm(
                    "曲臂车现场标识缺失",
                    "检测到曲臂车作业现场疑似缺少警示标识/规程/验收牌(多帧一致)",
                    1.0,
                    coords,
                )
        else:
            service.boom_sign_missing_counter = 0

        return False, None

    except Exception as e:
        print(f"⚠️ 曲臂车现场标识检测出错: {e}")
        return False, None
