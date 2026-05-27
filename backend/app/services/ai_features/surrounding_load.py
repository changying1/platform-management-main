import math
from .registry import ai_rule


@ai_rule("surrounding_load", "基坑周边荷载")
def surrounding_load(service, frame):
    """
    基坑周边2m范围内堆土或重物过高
    """

    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        pits = []
        loads = []

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)
            x1, y1, x2, y2 = map(int, box.xyxy[0])

            if label in {"pit", "foundation_pit", "hole", "opening"}:
                pits.append((x1, y1, x2, y2))

            elif label in {"soil", "heavy_object", "material", "load"}:
                loads.append((x1, y1, x2, y2))

        if len(pits) == 0 or len(loads) == 0:
            return False, {}

        for px1, py1, px2, py2 in pits:
            pcx = (px1 + px2) / 2
            pcy = (py1 + py2) / 2

            for lx1, ly1, lx2, ly2 in loads:
                lcx = (lx1 + lx2) / 2
                lcy = (ly1 + ly2) / 2
                dist = math.sqrt((pcx - lcx) ** 2 + (pcy - lcy) ** 2)

                # 像素近似 2m
                if dist < 200:
                    load_height = ly2 - ly1
                    if load_height > 120:
                        return True, {
                            "type": "surrounding_load",
                            "msg": "基坑周边2m范围内堆土或重物过高",
                            "score": 0.8,
                            "coords": [lx1, ly1, lx2, ly2],
                            "height_px": load_height,
                        }

        return False, {}

    except Exception as e:
        print(f"⚠️ 基坑周边荷载检测出错: {e}")
        return False, {}