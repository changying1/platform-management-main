import cv2
import numpy as np
from .registry import ai_rule

@ai_rule("ladder_operation", "梯子作业规范类")
def detect_ladder_operation(service, frame):
    if frame is None:
        return False, None

    # 确保模型可用
    if service.model is None and not service._load_model_safe():
        return False, None

    try:
        results = service.model(frame, conf=0.45, verbose=False)[0]
        boxes = results.boxes

        persons = []
        for box in boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)
            if label == "person":
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                persons.append((x1, y1, x2, y2))

        supervisor_count = service.count_supervisors(frame)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)

        lines = cv2.HoughLinesP(
            edges,
            1,
            np.pi / 180,
            threshold=80,
            minLineLength=100,
            maxLineGap=20,
        )

        if lines is None:
            return False, None

        ladder_lines = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
            if 60 < angle < 90:
                ladder_lines.append((x1, y1, x2, y2))

        if len(ladder_lines) < 2:
            return False, None

        xs, ys = [], []
        for x1, y1, x2, y2 in ladder_lines:
            xs.extend([x1, x2])
            ys.extend([y1, y2])

        ladder_rect = (min(xs), min(ys), max(xs), max(ys))
        lx1, ly1, lx2, ly2 = ladder_rect

        ladder_person_count = 0
        for px1, py1, px2, py2 in persons:
            cx = (px1 + px2) // 2
            cy = (py1 + py2) // 2
            if lx1 < cx < lx2 and ly1 < cy < ly2:
                ladder_person_count += 1

        if ladder_person_count >= 2 and supervisor_count == 0:
            details = {
                "type": "ladder_operation_violation",
                "msg": "梯子上多人且无监护",
                "coords": list(ladder_rect),
                "score": 0.8,
            }
            return True, details

        return False, None

    except Exception as e:
        print(f"⚠️ 梯子作业规范检测出错: {e}")
        return False, None