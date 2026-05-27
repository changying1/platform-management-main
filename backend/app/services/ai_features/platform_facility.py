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


def _estimate_plank_coverage(roi_bgr):
    """
    传统CV:估计脚手板“满铺程度”
    思路:用边缘+形态学把“缝隙/空洞”突出,然后估算空洞比例
    """
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    # 边缘
    edges = cv2.Canny(gray, 60, 150)

    # 形态学闭运算,连接边缘
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)

    # 反转:让“空洞/间隙”更明显(近似)
    inv = 255 - closed

    # 二值化
    _, bin_img = cv2.threshold(inv, 0, 255, cv2.THRESH_OTSU)

    # 统计“疑似空洞”比例(白色比例)
    hole_ratio = float(np.mean(bin_img == 255))

    # 经验阈值:>0.35 认为有明显未满铺/空洞(你后续可调参)
    return hole_ratio


def _estimate_guardrail_presence(roi_bgr):
    """
    传统CV:估计外边缘是否有栏杆(简单 heuristic)
    思路:在ROI上部区域统计“横向长直线”是否足够
    """
    h, w = roi_bgr.shape[:2]
    top = roi_bgr[0:int(h * 0.35), :]
    gray = cv2.cvtColor(top, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 60, 150)

    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180,
        threshold=80,
        minLineLength=int(w * 0.35),
        maxLineGap=10
    )
    if lines is None:
        return 0.0

    # 计算近似水平线占比
    horiz = 0
    total = 0
    for (x1, y1, x2, y2) in lines[:, 0]:
        total += 1
        dx = abs(x2 - x1)
        dy = abs(y2 - y1)
        if dx == 0:
            continue
        slope = dy / (dx + 1e-6)
        if slope < 0.15:  # 越小越水平
            horiz += 1

    return horiz / max(total, 1)


@ai_rule("platform_facility", "操作平台脚手板/防护栏杆检查")
def platform_facility(service, frame):
    """
    规则目标(第5条):
    - 脚手板未满铺 或 外边缘未设置防护栏杆 -> 异常
    返回: (is_alarm, details)
    """
    if frame is None:
        return False, {}

    # 1) 优先使用模型类别(如果你的 best.pt 里有这些类)
    # 你可以按你模型实际类别名调整下面这些 label
    preferred_platform_labels = ["platform", "scaffold", "operation_platform"]
    preferred_guardrail_labels = ["guardrail", "rail", "handrail"]
    preferred_plank_labels = ["plank", "board", "scaffold_board"]

    labels = getattr(service, "labels", None)
    model = getattr(service, "model", None)

    # service 里如果没有 labels,就尝试从 model.names 拿
    if labels is None and model is not None and hasattr(model, "names"):
        labels = list(model.names.values())

    def has_label(names):
        if not labels:
            return False
        return any(n in labels for n in names)

    # 如果模型具备 platform/guardrail/plank 类别,就用检测结果判断
    if model is not None and labels and (has_label(preferred_platform_labels) or has_label(preferred_guardrail_labels)):
        try:
            results = model(frame, conf=0.35, verbose=False)[0]
            dets = []

            for box in results.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                name = labels[cls_id] if cls_id < len(labels) else str(cls_id)
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                dets.append((name, conf, x1, y1, x2, y2))

            # 取“平台”区域(最大面积的 platform/scaffold)
            platforms = [d for d in dets if d[0] in preferred_platform_labels]
            if platforms:
                platforms.sort(key=lambda d: (d[4]-d[2])*(d[5]-d[3]), reverse=True)
                _, _, x1, y1, x2, y2 = platforms[0]
                roi = _safe_crop(frame, x1, y1, x2, y2)
            else:
                roi = frame  # 没找到平台类,退化为整帧判断

            # 护栏是否存在(在ROI附近找 guardrail)
            guardrails = [d for d in dets if d[0] in preferred_guardrail_labels]
            has_guardrail = len(guardrails) > 0

            # 脚手板是否满铺(如果模型有 plank 类,就用数量/覆盖;否则CV估计)
            if has_label(preferred_plank_labels):
                planks = [d for d in dets if d[0] in preferred_plank_labels]
                # 简化:数量过少视为未满铺(你后续可做覆盖率)
                plank_ok = len(planks) >= 2
            else:
                hole_ratio = _estimate_plank_coverage(roi)
                plank_ok = hole_ratio < 0.35

            if (not plank_ok) or (not has_guardrail):
                return True, {
                    "type": "platform_facility",
                    "msg": f"操作平台异常:脚手板{'未满铺' if not plank_ok else '正常'},护栏{'缺失' if not has_guardrail else '正常'}",
                    "plank_ok": plank_ok,
                    "guardrail_ok": has_guardrail,
                }

            return False, {
                "type": "platform_facility_ok",
                "msg": "操作平台检查正常",
                "plank_ok": True,
                "guardrail_ok": True,
            }

        except Exception as e:
            # 模型路径失败则走 CV 兜底
            print("[platform_facility] model path failed:", e)

    # 2) 模型类别不足时:纯CV兜底(整帧下半部作为“平台候选区域”)
    h, w = frame.shape[:2]
    roi = frame[int(h * 0.45):h, 0:w]

    hole_ratio = _estimate_plank_coverage(roi)
    guardrail_score = _estimate_guardrail_presence(roi)

    plank_ok = hole_ratio < 0.35
    guardrail_ok = guardrail_score > 0.25

    if (not plank_ok) or (not guardrail_ok):
        return True, {
            "type": "platform_facility",
            "msg": f"操作平台异常(CV估计):脚手板{'未满铺' if not plank_ok else '正常'},护栏{'可能缺失' if not guardrail_ok else '可能正常'}",
            "hole_ratio": round(hole_ratio, 3),
            "guardrail_score": round(guardrail_score, 3),
            "mode": "cv_fallback"
        }

    return False, {
        "type": "platform_facility_ok",
        "msg": "操作平台检查正常(CV估计)",
        "hole_ratio": round(hole_ratio, 3),
        "guardrail_score": round(guardrail_score, 3),
        "mode": "cv_fallback"
    }