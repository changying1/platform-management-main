import math
from .registry import ai_rule


@ai_rule("lifting_radius_safety", "吊装作业半径安全")
def lifting_radius_safety(service, frame):
    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        cranes = []
        persons = []
        materials = []

        crane_labels = {"crane", "truck_crane", "boom_truck", "lifting_machine"}
        material_labels = {"material", "scaffold", "stack", "equipment", "load"}

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)
            x1, y1, x2, y2 = map(int, box.xyxy[0])

            if label in crane_labels:
                cranes.append((x1, y1, x2, y2))
            elif label == "person":
                persons.append((x1, y1, x2, y2))
            elif label in material_labels:
                materials.append((x1, y1, x2, y2))

        for cx1, cy1, cx2, cy2 in cranes:
            ccx = (cx1 + cx2) / 2
            ccy = (cy1 + cy2) / 2

            for px1, py1, px2, py2 in persons:
                pcx = (px1 + px2) / 2
                pcy = (py1 + py2) / 2
                if math.hypot(pcx - ccx, pcy - ccy) < 350:
                    return True, {
                        "type": "lifting_radius_safety",
                        "msg": "吊装回转半径内有无关人员",
                        "coords": [px1, py1, px2, py2],
                    }

            for mx1, my1, mx2, my2 in materials:
                mcx = (mx1 + mx2) / 2
                mcy = (my1 + my2) / 2
                if math.hypot(mcx - ccx, mcy - ccy) < 350:
                    return True, {
                        "type": "lifting_radius_safety",
                        "msg": "吊装回转半径内堆放非作业设备或材料",
                        "coords": [mx1, my1, mx2, my2],
                    }

        return False, {}

    except Exception as e:
        print(f"⚠️ 吊装作业半径安全检测出错: {e}")
        return False, {}