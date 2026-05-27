import cv2
import numpy as np
from .registry import ai_rule

@ai_rule("ladder_detail", "梯子细节类")

def detect_ladder_detail(service, frame):

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

    xs = []
    ys = []

    for x1, y1, x2, y2 in ladder_lines:
        xs.extend([x1, x2])
        ys.extend([y1, y2])

    lx1, ly1, lx2, ly2 = min(xs), min(ys), max(xs), max(ys)

    # ===== 梯脚区域 =====
    h, w = frame.shape[:2]
    lx1 = max(lx1, 0)
    lx2 = min(lx2, w)

    bottom = frame[max(ly2 - 40, 0):ly2, lx1:lx2]

    if bottom.size == 0:
        return False, None

    # ===== 垫高检测 =====
    bottom_gray = cv2.cvtColor(bottom, cv2.COLOR_BGR2GRAY)
    bottom_edges = cv2.Canny(bottom_gray, 50, 150)

    if bottom_edges.size == 0:
        return False, None

    edge_density = np.sum(bottom_edges > 0) / bottom_edges.size

    if edge_density > 0.08:

        details = {
            "type": "ladder_detail_violation",
            "msg": "梯脚疑似垫高或不稳定",
            "coords": [lx1, ly2 - 40, lx2, ly2],
            "score": 0.7,
        }

        return True, details

    # ===== 防滑检测 =====
    hsv = cv2.cvtColor(bottom, cv2.COLOR_BGR2HSV)

    lower_black = np.array([0, 0, 0])
    upper_black = np.array([180, 255, 60])

    mask_black = cv2.inRange(hsv, lower_black, upper_black)

    black_ratio = cv2.countNonZero(mask_black) / mask_black.size

    if black_ratio < 0.02:

        details = {
            "type": "ladder_detail_violation",
            "msg": "梯脚防滑可能缺失",
            "coords": [lx1, ly2 - 40, lx2, ly2],
            "score": 0.7,
        }

        return True, details

    return False, None