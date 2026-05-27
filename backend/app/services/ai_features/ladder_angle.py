import cv2
import numpy as np
from .registry import ai_rule

@ai_rule("ladder_angle", "梯子角度类")

def detect_ladder_angle(service, frame):

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

    best_angle = None
    best_line = None

    for line in lines:

        x1, y1, x2, y2 = line[0]

        angle = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))

        if 50 < angle < 90:

            if best_angle is None or angle > best_angle:
                best_angle = angle
                best_line = (x1, y1, x2, y2)

    if best_line is None:
        return False, None

    if best_angle > 75:
        return service._check_cooldown_and_alarm(
            "梯子角度违规",
            f"检测到梯子搭设角度异常 (当前: {best_angle:.1f}°),存在倾覆风险",
            0.85,
            [int(x) for x in best_line],
        )

    return False, None