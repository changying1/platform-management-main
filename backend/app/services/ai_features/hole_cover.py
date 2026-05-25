from .registry import ai_rule


@ai_rule("hole_cover", "孔口覆盖")
def hole_cover(service, frame):

    if frame is None:
        return False, {}

    results = service.model(frame)[0]

    hole = 0
    cover = 0
    warning = 0

    for box in results.boxes:

        cls = int(box.cls[0])
        name = service.labels[cls]

        if name in ["hole", "opening"]:
            hole += 1

        if name in ["cover", "plate", "shield"]:
            cover += 1

        if name in ["warning_sign", "sign", "warning"]:
            warning += 1

    if hole > 0:

        if cover == 0 or warning == 0:

            return True, {
                "type": "hole_cover",
                "msg": "孔口未设置盖板或警示标志"
            }

    return False, {}