import cv2
import numpy as np
from .registry import ai_rule


@ai_rule("foundation_protection", "基坑周边防护")
def foundation_protection(service, frame):
    """
    基坑周边防护栏杆高度/立杆间距检测(CV近似)
    """

    if frame is None:
        return False, {}

    try:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)

        lines = cv2.HoughLinesP(
            edges,
            1,
            np.pi / 180,
            threshold=80,
            minLineLength=80,
            maxLineGap=20,
        )

        if lines is None:
            return True, {
                "type": "foundation_protection",
                "msg": "未检测到基坑周边防护栏杆",
                "score": 0.8,
            }

        vertical_lines = []
        horizontal_lines = []

        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))

            if angle > 75:
                vertical_lines.append((x1, y1, x2, y2))
            elif angle < 15:
                horizontal_lines.append((x1, y1, x2, y2))

        # 没有立杆或横杆,视为防护缺失
        if len(vertical_lines) == 0 or len(horizontal_lines) == 0:
            return True, {
                "type": "foundation_protection",
                "msg": "基坑周边防护栏杆不完整",
                "score": 0.8,
            }

        # 粗略检查“高度”和“间距”
        # 高度:取竖线平均长度
        avg_height = np.mean([abs(y2 - y1) for x1, y1, x2, y2 in vertical_lines])

        # 间距:按竖线 x 中心排序后取相邻距离
        xs = sorted([(x1 + x2) / 2 for x1, y1, x2, y2 in vertical_lines])
        gaps = [xs[i + 1] - xs[i] for i in range(len(xs) - 1)] if len(xs) > 1 else []

        # 像素近似阈值,后续可按摄像头标定调整
        too_low = avg_height < 120
        too_wide = len(gaps) > 0 and max(gaps) > 200

        if too_low or too_wide:
            return True, {
                "type": "foundation_protection",
                "msg": f"基坑周边防护异常:{'栏杆高度不足' if too_low else ''}{',' if too_low and too_wide else ''}{'立杆间距过大' if too_wide else ''}",
                "score": 0.8,
                "avg_height_px": round(float(avg_height), 2),
                "max_gap_px": round(float(max(gaps)), 2) if gaps else None,
            }

        return False, {}

    except Exception as e:
        print(f"⚠️ 基坑周边防护检测出错: {e}")
        return False, {}