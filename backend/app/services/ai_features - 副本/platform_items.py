from .registry import ai_rule
import time

_last_throw_time = 0


@ai_rule("platform_items", "高处平台物品管理")
def platform_items(service, frame):
    """
    识别高处平台是否存在:
    - 随意堆放材料
    - 抛掷物料行为
    """

    if frame is None:
        return False, {}

    results = service.model(frame)[0]

    objects = []
    persons = []

    for box in results.boxes:
        cls = int(box.cls[0])
        name = service.labels[cls]
        conf = float(box.conf[0])

        if name in ["tool", "material", "brick", "board"]:
            objects.append(conf)

        if name == "person":
            persons.append(conf)

    # 平台上存在大量物品
    if len(objects) > 5:

        return True, {
            "type": "platform_items",
            "msg": "高处作业平台物品堆放过多",
            "count": len(objects)
        }

    # 简单抛掷行为检测(连续检测)
    global _last_throw_time
    if len(objects) > 0 and len(persons) > 0:

        now = time.time()

        if now - _last_throw_time < 2:
            return True, {
                "type": "platform_throw",
                "msg": "检测到可能的抛掷物料行为"
            }

        _last_throw_time = now

    return False, {}