from .registry import ai_rule


@ai_rule("lifting_gear_safety", "吊具安全")
def lifting_gear_safety(service, frame):
    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        gear_count = 0
        defect_count = 0

        gear_labels = {"wire_rope", "shackle", "hook", "lifting_gear", "rope"}
        defect_labels = {"broken_wire", "wear", "deformation", "crack", "missing_latch"}

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in gear_labels:
                gear_count += 1
            elif label in defect_labels:
                defect_count += 1

        if gear_count > 0 and defect_count > 0:
            return True, {
                "type": "lifting_gear_safety",
                "msg": "吊索具存在断丝、磨损、变形或防脱装置缺失",
                "gear_count": gear_count,
                "defect_count": defect_count,
            }

        return False, {}

    except Exception as e:
        print(f"⚠️ 吊具安全检测出错: {e}")
        return False, {}