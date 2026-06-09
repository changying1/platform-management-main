from .registry import ai_rule
import time

water_timer = None


@ai_rule("water_accumulation", "基坑积水")
def water_accumulation(service, frame):

    global water_timer

    if frame is None:
        return False, {}

    results = service.model(frame)[0]

    water = 0

    for box in results.boxes:

        cls = int(box.cls[0])
        name = service.labels[cls]

        if name in ["water", "puddle"]:
            water += 1

    if water > 0:

        if water_timer is None:
            water_timer = time.time()

        if time.time() - water_timer > 7200:

            return True, {
                "type": "water_accumulation",
                "msg": "基坑积水超过2小时"
            }

    else:
        water_timer = None

    return False, {}