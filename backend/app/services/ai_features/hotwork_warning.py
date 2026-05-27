from .registry import ai_rule


@ai_rule("hotwork_warning", "动火作业警示")
def hotwork_warning(service, frame):
    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        hot_work = 0
        sign = 0
        belt = 0
        red_light = 0

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in {"welding", "cutting", "hot_work"}:
                hot_work += 1
            elif label in {"warning_sign", "hotwork_warning_sign"}:
                sign += 1
            elif label in {"warning_belt", "warning_line"}:
                belt += 1
            elif label in {"red_warning_light", "warning_light"}:
                red_light += 1

        if hot_work > 0 and (sign == 0 or belt == 0):
            return True, {
                "type": "hotwork_warning",
                "msg": "动火现场未设置明显警示标识或防火警示带",
            }

        return False, {}

    except Exception as e:
        print(f"⚠️ 动火作业警示检测出错: {e}")
        return False, {}