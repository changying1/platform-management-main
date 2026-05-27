from .registry import ai_rule

@ai_rule("behavior", "作业行为类")

def detect_work_behavior(service, frame):
    if frame is None:
        return False, None

    if service.is_debug_force("behavior"):
        return service._check_cooldown_and_alarm(
            "作业行为违规",
            "DEBUG: 强制触发作业行为违规报警(玩手机/吸烟)",
            1.0,
            service._debug_box(frame),
        )

    if service.model is None and not service._load_model_safe():
        return False, None

    try:
        results = service.model(frame, conf=0.45, verbose=False)[0]

        behavior_labels = {
            "phone_use", "use_phone", "play_phone", "cellphone", "phone", "玩手机",
            "smoking", "smoke", "cigarette", "吸烟",
        }

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in behavior_labels:
                conf = float(box.conf[0])
                coords = box.xyxy[0].tolist()

                if ("phone" in label) or ("手机" in label):
                    hit_desc = "玩手机"
                else:
                    hit_desc = "吸烟"

                return service._check_cooldown_and_alarm(
                    "作业行为违规",
                    f"检测到作业时{hit_desc}等与工作无关行为",
                    conf,
                    coords,
                )

        return False, None

    except Exception as e:
        print(f"⚠️ 作业行为检测出错: {e}")
        return False, None
