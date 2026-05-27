from .registry import ai_rule


@ai_rule("hole_protection", "孔口防护")
def hole_protection(service, frame):

    if frame is None:
        return False, {}

    results = service.model(frame)[0]

    hole = 0
    guardrail = 0
    safety_net = 0

    for box in results.boxes:

        cls = int(box.cls[0])
        name = service.labels[cls]

        if name in ["hole", "opening"]:
            hole += 1

        if name in ["guardrail", "fence"]:
            guardrail += 1

        if name in ["safety_net", "net"]:
            safety_net += 1

    if hole > 0:

        if guardrail == 0 or safety_net == 0:

            return True, {
                "type": "hole_protection",
                "msg": "孔口缺少护栏或安全网"
            }

    return False, {}