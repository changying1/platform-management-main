from .registry import ai_rule


@ai_rule("lifting_warning", "吊装作业警示")
def lifting_warning(service, frame):
    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        lifting_scene = 0
        sign_count = 0
        belt_count = 0
        light_count = 0

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in {"crane", "hook", "lifted_object", "lifting_work"}:
                lifting_scene += 1
            elif label in {"warning_sign", "lifting_warning_sign"}:
                sign_count += 1
            elif label in {"warning_belt", "warning_line"}:
                belt_count += 1
            elif label in {"warning_light", "red_light"}:
                light_count += 1

        if lifting_scene > 0 and (sign_count == 0 or belt_count == 0):
            return True, {
                "type": "lifting_warning",
                "msg": "吊装作业现场未按规定设置警示标识或警示带",
            }

        return False, {}

    except Exception as e:
        print(f"⚠️ 吊装作业警示检测出错: {e}")
        return False, {}