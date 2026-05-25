from .registry import ai_rule


@ai_rule("outrigger_safety", "吊车支腿")
def outrigger_safety(service, frame):
    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        crane_count = 0
        outrigger_count = 0
        pad_count = 0
        bad_labels_count = 0

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in {"crane", "truck_crane"}:
                crane_count += 1
            elif label in {"outrigger", "support_leg"}:
                outrigger_count += 1
            elif label in {"pad", "steel_plate", "support_pad"}:
                pad_count += 1
            elif label in {"outrigger_not_fully_extended", "no_pad", "pad_too_small"}:
                bad_labels_count += 1

        if crane_count > 0 and (bad_labels_count > 0 or outrigger_count == 0 or pad_count == 0):
            return True, {
                "type": "outrigger_safety",
                "msg": "吊车支腿未完全伸出或未规范垫设垫板",
                "crane_count": crane_count,
                "outrigger_count": outrigger_count,
                "pad_count": pad_count,
                "bad_labels_count": bad_labels_count,
            }

        return False, {}

    except Exception as e:
        print(f"⚠️ 吊车支腿检测出错: {e}")
        return False, {}