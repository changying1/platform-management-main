import cv2
import numpy as np
from .registry import ai_rule

def _safe_crop(img, x1, y1, x2, y2):
    h, w = img.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return None
    return img[y1:y2, x1:x2]


def _estimate_ladder_angle(roi_bgr):
    """
    传统CV:在梯子ROI里用 HoughLinesP 找主方向,估计与水平夹角.
    返回 angle_deg(0~90,越接近 90 越竖直)
    """
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 60, 160)

    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=80, minLineLength=50, maxLineGap=10)
    if lines is None:
        return None

    # 统计最长的几条线作为主方向
    candidates = []
    for (x1, y1, x2, y2) in lines[:, 0]:
        length = np.hypot(x2-x1, y2-y1)
        if length < 60:
            continue
        angle = np.degrees(np.arctan2(abs(y2-y1), abs(x2-x1) + 1e-6))  # 0~90
        candidates.append((length, angle))

    if not candidates:
        return None

    candidates.sort(reverse=True, key=lambda x: x[0])
    top = candidates[:8]
    # 加权平均角度
    total = sum(l for l, _ in top)
    angle = sum(l * a for l, a in top) / max(total, 1e-6)
    return float(angle)


@ai_rule("ladder_stability", "梯子稳固检查")
def ladder_stability(service, frame):
    """
    规则目标(第6条):
    - 梯子不稳固/不可靠 -> 异常
    当前实现:优先用模型找 ladder ROI;否则用整帧估角
    判断:角度过小(太平)或过大(几乎竖直不现实)视为不稳固(可调)
    """
    if frame is None:
        return False, {}

    model = getattr(service, "model", None)
    labels = getattr(service, "labels", None)
    if labels is None and model is not None and hasattr(model, "names"):
        labels = list(model.names.values())

    ladder_labels = ["ladder"]

    roi = None
    if model is not None and labels and any(n in labels for n in ladder_labels):
        try:
            results = model(frame, conf=0.35, verbose=False)[0]
            dets = []
            for box in results.boxes:
                cls_id = int(box.cls[0])
                name = labels[cls_id] if cls_id < len(labels) else str(cls_id)
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                dets.append((name, x1, y1, x2, y2))

            ladders = [d for d in dets if d[0] in ladder_labels]
            if ladders:
                ladders.sort(key=lambda d: (d[3]-d[1])*(d[4]-d[2]), reverse=True)
                _, x1, y1, x2, y2 = ladders[0]
                roi = _safe_crop(frame, x1, y1, x2, y2)
        except Exception as e:
            print("[ladder_stability] model path failed:", e)

    if roi is None:
        roi = frame  # 没检测到梯子,退化为整帧估计(弱判断)

    angle = _estimate_ladder_angle(roi)
    if angle is None:
        # 识别不出来时不要硬报警,避免误报
        return False, {
            "type": "ladder_stability_unknown",
            "msg": "梯子稳固:无法估计角度(可能未检测到梯子/画面质量不足)",
            "mode": "cv"
        }

    # 经验阈值(你后续可按规范/现场调参)
    # 常见安全梯角度大概 65~75 左右(这里给宽一点)
    min_ok = 55.0
    max_ok = 80.0

    stable = (min_ok <= angle <= max_ok)

    if not stable:
        return True, {
            "type": "ladder_stability",
            "msg": f"梯子不稳固:角度异常({angle:.1f}°)",
            "angle": round(angle, 1),
            "min_ok": min_ok,
            "max_ok": max_ok,
            "mode": "cv"
        }

    return False, {
        "type": "ladder_stability_ok",
        "msg": f"梯子稳固:角度正常({angle:.1f}°)",
        "angle": round(angle, 1),
        "min_ok": min_ok,
        "max_ok": max_ok,
        "mode": "cv"
    }