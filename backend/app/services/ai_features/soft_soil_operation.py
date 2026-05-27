from .registry import ai_rule


@ai_rule("soft_soil_operation", "软土作业")
def soft_soil_operation(service, frame):

    if frame is None:
        return False, {}

    results = service.model(frame)[0]

    machine = 0
    mat = 0

    for box in results.boxes:

        cls = int(box.cls[0])
        name = service.labels[cls]

        if name in ["excavator", "machine"]:
            machine += 1

        if name in ["mat", "plate", "board"]:
            mat += 1

    if machine > 0 and mat == 0:

        return True, {
            "type": "soft_soil_operation",
            "msg": "软土场地机械作业未铺设垫板"
        }

    return False, {}