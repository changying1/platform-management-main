from .registry import ai_rule


@ai_rule("dewatering_monitor", "基坑降水监测")
def dewatering_monitor(service, frame):

    if frame is None:
        return False, {}

    results = service.model(frame)[0]

    pump = 0
    pipe = 0

    for box in results.boxes:

        cls = int(box.cls[0])
        name = service.labels[cls]

        if name in ["pump", "water_pump"]:
            pump += 1

        if name in ["pipe", "drain_pipe"]:
            pipe += 1

    if pump == 0 and pipe == 0:

        return True, {
            "type": "dewatering_monitor",
            "msg": "基坑未检测到降水设备"
        }

    return False, {}