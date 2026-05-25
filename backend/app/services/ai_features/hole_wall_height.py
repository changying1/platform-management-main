from .registry import ai_rule


@ai_rule("hole_wall_height", "孔口护壁高度")
def hole_wall_height(service, frame):

    if frame is None:
        return False, {}

    results = service.model(frame)[0]

    hole = None
    wall = None

    for box in results.boxes:

        cls = int(box.cls[0])
        name = service.labels[cls]

        x1, y1, x2, y2 = map(int, box.xyxy[0])

        if name in ["hole", "opening"]:
            hole = (x1, y1, x2, y2)

        if name in ["wall", "barrier"]:
            wall = (x1, y1, x2, y2)

    if hole and wall:

        hole_height = hole[3] - hole[1]
        wall_height = wall[3] - wall[1]

        ratio = wall_height / hole_height

        if ratio < 0.3:

            return True, {
                "type": "hole_wall_height",
                "msg": "孔口护壁高度不足30cm"
            }

    return False, {}