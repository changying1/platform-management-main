from .registry import ai_rule


@ai_rule("drainage_facility", "基坑排水设施")
def drainage_facility(service, frame):

    if frame is None:
        return False, {}

    results = service.model(frame)[0]

    ditch = 0
    sump = 0

    for box in results.boxes:

        cls = int(box.cls[0])
        name = service.labels[cls]

        if name in ["ditch", "drain"]:
            ditch += 1

        if name in ["well", "sump"]:
            sump += 1

    if ditch == 0 or sump == 0:

        return True, {
            "type": "drainage_facility",
            "msg": "基坑排水设施不足"
        }

    return False, {}