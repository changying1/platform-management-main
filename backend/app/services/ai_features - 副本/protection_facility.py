from .registry import ai_rule


@ai_rule("protection_facility", "临边洞口防护设施")
def protection_facility(service, frame):

    if frame is None:
        return False, {}

    results = service.model(frame)[0]

    hole = 0
    guardrail = 0

    for box in results.boxes:

        cls = int(box.cls[0])
        name = service.labels[cls]

        if name in ["hole", "edge"]:
            hole += 1

        if name in ["guardrail", "fence"]:
            guardrail += 1

    if hole > 0 and guardrail == 0:

        return True, {
            "type": "protection_facility",
            "msg": "临边或洞口缺少防护设施"
        }

    return False, {}