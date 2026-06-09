from .registry import ai_rule


@ai_rule("firefighting_equipment", "动火消防器材")
def firefighting_equipment(service, frame):
    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        hot_work = 0
        extinguisher = 0
        water_bucket = 0
        fire_blanket = 0

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in {"welding", "cutting", "hot_work"}:
                hot_work += 1
            elif label in {"extinguisher", "fire_extinguisher"}:
                extinguisher += 1
            elif label in {"water_bucket"}:
                water_bucket += 1
            elif label in {"fire_blanket"}:
                fire_blanket += 1

        if hot_work > 0 and (extinguisher == 0 and water_bucket == 0 and fire_blanket == 0):
            return True, {
                "type": "firefighting_equipment",
                "msg": "动火作业现场未配备消防器材",
            }

        return False, {}

    except Exception as e:
        print(f"⚠️ 消防器材检测出错: {e}")
        return False, {}