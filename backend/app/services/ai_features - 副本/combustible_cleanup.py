from .registry import ai_rule


@ai_rule("combustible_cleanup", "动火可燃物清理")
def combustible_cleanup(service, frame):
    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        hot_work = 0
        combustible = 0
        barrier = 0

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in {"welding", "cutting", "hot_work"}:
                hot_work += 1
            elif label in {"wood", "paint_bucket", "plastic_cloth", "cable_skin", "combustible"}:
                combustible += 1
            elif label in {"fire_barrier", "fire_blanket"}:
                barrier += 1

        if hot_work > 0 and combustible > 0 and barrier == 0:
            return True, {
                "type": "combustible_cleanup",
                "msg": "动火点周边存在易燃物且未采取隔离防护",
            }

        return False, {}

    except Exception as e:
        print(f"⚠️ 可燃物清理检测出错: {e}")
        return False, {}