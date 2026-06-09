from .registry import ai_rule


@ai_rule("mobile_platform", "移动式操作平台检查")
def mobile_platform(service, frame):

    if frame is None:
        return False, {}

    results = service.model(frame)[0]

    platform = 0
    guardrail = 0
    ladder = 0

    for box in results.boxes:

        cls = int(box.cls[0])
        name = service.labels[cls]

        if name == "mobile_platform":
            platform += 1

        if name in ["guardrail", "rail"]:
            guardrail += 1

        if name == "ladder":
            ladder += 1

    if platform > 0:

        if guardrail == 0 or ladder == 0:

            return True, {
                "type": "mobile_platform",
                "msg": "移动式操作平台缺少护栏或登高扶梯"
            }

    return False, {}