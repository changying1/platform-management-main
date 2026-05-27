import time
from .registry import ai_rule

_last_lifting_supervisor_seen = 0.0


@ai_rule("lifting_supervisor_duty", "吊装监护人履职")
def lifting_supervisor_duty(service, frame):
    global _last_lifting_supervisor_seen

    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        work_present = 0
        supervisor_present = 0
        unrelated_behavior = 0

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in {"crane", "hook", "lifted_object", "lifting_work"}:
                work_present += 1
            elif label in {"lifting_supervisor", "supervisor", "signalman"}:
                supervisor_present += 1
            elif label in {"phone_use", "idle_behavior"}:
                unrelated_behavior += 1

        now = time.time()
        if supervisor_present > 0:
            _last_lifting_supervisor_seen = now

        if work_present > 0:
            if supervisor_present == 0 and (_last_lifting_supervisor_seen == 0 or now - _last_lifting_supervisor_seen > 300):
                return True, {
                    "type": "lifting_supervisor_duty",
                    "msg": "吊装作业未安排专职监护人或监护人离岗超过5分钟",
                }

            if unrelated_behavior > 0:
                return True, {
                    "type": "lifting_supervisor_duty",
                    "msg": "吊装监护人存在与监护无关的行为",
                }

        return False, {}

    except Exception as e:
        print(f"⚠️ 吊装监护人履职检测出错: {e}")
        return False, {}