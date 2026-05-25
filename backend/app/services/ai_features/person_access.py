from .registry import ai_rule


@ai_rule("person_access", "孔内人员上下")
def person_access(service, frame):

    if frame is None:
        return False, {}

    results = service.model(frame)[0]

    person = 0
    ladder = 0
    bucket = 0

    for box in results.boxes:

        cls = int(box.cls[0])
        name = service.labels[cls]

        if name == "person":
            person += 1

        if name in ["ladder", "rope_ladder"]:
            ladder += 1

        if name in ["bucket", "skip"]:
            bucket += 1

    # 有人但没有梯子
    if person > 0 and ladder == 0:

        return True, {
            "type": "person_access",
            "msg": "孔内未设置安全软梯"
        }

    # 有人乘渣桶
    if bucket > 0 and person > 0:

        return True, {
            "type": "bucket_access",
            "msg": "检测到人员乘渣桶上下"
        }

    return False, {}