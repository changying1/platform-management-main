import math
from .registry import ai_rule


@ai_rule("hotwork_tools", "动火工具")
def hotwork_tools(service, frame):
    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        oxygen = []
        acetylene = []
        hot_work_points = []
        defect = 0
        tilted = 0

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)
            x1, y1, x2, y2 = map(int, box.xyxy[0])

            if label == "oxygen_bottle":
                oxygen.append((x1, y1, x2, y2))
            elif label == "acetylene_bottle":
                acetylene.append((x1, y1, x2, y2))
            elif label in {"welding", "cutting", "hot_work"}:
                hot_work_points.append((x1, y1, x2, y2))
            elif label in {"gas_leak", "tool_damage"}:
                defect += 1
            elif label in {"bottle_tilted", "bottle_fallen"}:
                tilted += 1

        if defect > 0 or tilted > 0:
            return True, {
                "type": "hotwork_tools",
                "msg": "动火工具存在漏气、损坏或气瓶倾倒风险",
            }

        for ox1, oy1, ox2, oy2 in oxygen:
            ocx = (ox1 + ox2) / 2
            ocy = (oy1 + oy2) / 2

            for ax1, ay1, ax2, ay2 in acetylene:
                acx = (ax1 + ax2) / 2
                acy = (ay1 + ay2) / 2

                if math.hypot(ocx - acx, ocy - acy) < 200:
                    return True, {
                        "type": "hotwork_tools",
                        "msg": "氧气瓶与乙炔瓶间距不足",
                    }

            for hx1, hy1, hx2, hy2 in hot_work_points:
                hcx = (hx1 + hx2) / 2
                hcy = (hy1 + hy2) / 2
                if math.hypot(ocx - hcx, ocy - hcy) < 350:
                    return True, {
                        "type": "hotwork_tools",
                        "msg": "气瓶距动火点距离不足",
                    }

        return False, {}

    except Exception as e:
        print(f"⚠️ 动火工具检测出错: {e}")
        return False, {}