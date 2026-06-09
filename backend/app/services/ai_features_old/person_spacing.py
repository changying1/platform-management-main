import math
from .registry import ai_rule


@ai_rule("person_spacing", "多人作业人员间距")
def person_spacing(service, frame):
    """
    识别多人作业人员间距,小于 1.5m 为异常
    这里先用像素近似,后续可结合标定换算成真实距离
    """

    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        persons = []

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label == "person":
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cx = (x1 + x2) / 2
                cy = (y1 + y2) / 2
                persons.append((cx, cy, x1, y1, x2, y2))

        if len(persons) < 2:
            return False, {}

        min_dist = None
        pair_coords = None

        for i in range(len(persons)):
            for j in range(i + 1, len(persons)):
                x1, y1 = persons[i][0], persons[i][1]
                x2, y2 = persons[j][0], persons[j][1]
                dist = math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)

                if min_dist is None or dist < min_dist:
                    min_dist = dist
                    pair_coords = [
                        persons[i][2], persons[i][3], persons[i][4], persons[i][5],
                        persons[j][2], persons[j][3], persons[j][4], persons[j][5],
                    ]

        # 这里先用像素近似 1.5m,后续你可按摄像头标定调整
        if min_dist is not None and min_dist < 120:
            return True, {
                "type": "person_spacing",
                "msg": "多人作业人员间距不足(小于1.5m)",
                "score": 0.8,
                "coords": pair_coords,
                "distance_px": round(min_dist, 2),
            }

        return False, {}

    except Exception as e:
        print(f"⚠️ 人员间距检测出错: {e}")
        return False, {}