import time
from .registry import ai_rule

_last_hotwork_supervisor_seen = 0.0


@ai_rule("hotwork_supervisor_duty", "动火监护人履职")
def hotwork_supervisor_duty(service, frame):
    global _last_hotwork_supervisor_seen

    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        hot_work = 0
        supervisor = 0
        unrelated = 0

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in {"welding", "cutting", "hot_work"}:
                hot_work += 1
            elif label in {"hotwork_supervisor", "fire_watch", "supervisor"}:
                supervisor += 1
            elif label in {"phone_use", "idle_behavior"}:
                unrelated += 1

        now = time.time()
        if supervisor > 0:
            _last_hotwork_supervisor_seen = now

        if hot_work > 0:
            if supervisor == 0 and (_last_hotwork_supervisor_seen == 0 or now - _last_hotwork_supervisor_seen > 300):
                return True, {
                    "type": "hotwork_supervisor_duty",
                    "msg": "动火作业未安排专职监护人或监护人离岗超过5分钟",
                }

            if unrelated > 0:
                return True, {
                    "type": "hotwork_supervisor_duty",
                    "msg": "动火监护人存在与监护无关的行为",
                }

        return False, {}

    except Exception as e:
        print(f"⚠️ 动火监护人履职检测出错: {e}")
        return False, {}