from .registry import ai_rule


@ai_rule("machine_radius", "机械回转半径")
def machine_radius(service, frame):

    if frame is None:
        return False, {}

    results = service.model(frame)[0]

    machines = []
    persons = []

    for box in results.boxes:

        cls = int(box.cls[0])
        name = service.labels[cls]

        x1, y1, x2, y2 = map(int, box.xyxy[0])

        if name in ["excavator", "crane"]:
            machines.append((x1, y1, x2, y2))

        if name == "person":
            persons.append((x1, y1, x2, y2))

    for mx1, my1, mx2, my2 in machines:

        cx = (mx1 + mx2) / 2
        cy = (my1 + my2) / 2

        for px1, py1, px2, py2 in persons:

            px = (px1 + px2) / 2
            py = (py1 + py2) / 2

            if abs(px - cx) < 400 and abs(py - cy) < 400:

                return True, {
                    "type": "machine_radius",
                    "msg": "人员进入机械回转半径"
                }

    return False, {}