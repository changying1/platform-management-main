from .registry import ai_rule


@ai_rule("lifted_object_fixing", "被吊物固定")
def lifted_object_fixing(service, frame):
    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        object_count = 0
        bad_fix_count = 0

        object_labels = {"lifted_object", "steel_member", "cabinet", "cable_drum", "load"}
        bad_labels = {"off_center_sling", "loose_sling", "no_anti_slip", "no_corner_protection"}

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in object_labels:
                object_count += 1
            elif label in bad_labels:
                bad_fix_count += 1

        if object_count > 0 and bad_fix_count > 0:
            return True, {
                "type": "lifted_object_fixing",
                "msg": "被吊物捆扎点不合理、绳索松动或未采取防滑防尖锐措施",
                "object_count": object_count,
                "bad_fix_count": bad_fix_count,
            }

        return False, {}

    except Exception as e:
        print(f"⚠️ 被吊物固定检测出错: {e}")
        return False, {}