from .registry import ai_rule


@ai_rule("residual_fire_disposal", "动火余火处置")
def residual_fire_disposal(service, frame):
    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        ember = 0
        hot_slag = 0
        water_cooling = 0

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in {"ember", "spark_residue"}:
                ember += 1
            elif label in {"hot_slag", "slag"}:
                hot_slag += 1
            elif label in {"water_cooling", "spray_cooling"}:
                water_cooling += 1

        if (ember > 0 or hot_slag > 0) and water_cooling == 0:
            return True, {
                "type": "residual_fire_disposal",
                "msg": "动火结束后未彻底处置余火或未浇水降温",
            }

        return False, {}

    except Exception as e:
        print(f"⚠️ 余火处置检测出错: {e}")
        return False, {}