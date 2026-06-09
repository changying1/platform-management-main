from .registry import ai_rule


@ai_rule("cross_operation", "交叉作业")
def cross_operation(service, frame):
    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        hot_work = 0
        upper_work = 0
        lower_work = 0
        barrier = 0
        fire_bucket = 0

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in {"welding", "cutting", "hot_work"}:
                hot_work += 1
            elif label in {"high_altitude_work", "upper_work"}:
                upper_work += 1
            elif label in {"material_handling", "lower_work", "person"}:
                lower_work += 1
            elif label in {"fire_barrier", "isolation_board"}:
                barrier += 1
            elif label in {"fire_bucket", "spark_bucket"}:
                fire_bucket += 1

        if hot_work > 0 and (upper_work > 0 or lower_work > 0) and barrier == 0 and fire_bucket == 0:
            return True, {
                "type": "cross_operation",
                "msg": "动火作业与其他作业交叉进行且未采取防火隔离措施",
            }

        return False, {}

    except Exception as e:
        print(f"⚠️ 交叉作业检测出错: {e}")
        return False, {}