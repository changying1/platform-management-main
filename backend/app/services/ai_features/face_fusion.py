_face_service = None


def get_face_service():
    global _face_service
    if _face_service is None:
        from app.services.face_service import FaceService
        _face_service = FaceService()
    return _face_service


def _center(coords):
    x1, y1, x2, y2 = coords
    return (x1 + x2) / 2, (y1 + y2) / 2


def _point_in_box(point, box, expand_ratio=0.8):
    """
    判断人脸中心点是否落在安全帽 head 框附近。
    head 框通常比较小，所以这里扩大匹配范围。
    """
    px, py = point
    x1, y1, x2, y2 = box

    w = x2 - x1
    h = y2 - y1

    x1 = x1 - w * expand_ratio
    y1 = y1 - h * expand_ratio
    x2 = x2 + w * expand_ratio
    y2 = y2 + h * expand_ratio

    return x1 <= px <= x2 and y1 <= py <= y2

def _set_mock_person(box):
    username = "模拟用户：李工"
    old_msg = box.get("msg") or box.get("type") or ""

    box["personName"] = username
    box["faceSimilarity"] = 0.0
    box["person"] = {
        "id": "",
        "username": username,
        "name": username,
        "phone": "",
        "workType": "",
        "team": "",
        "faceImage": "",
        "isMock": True,
    }

    if not old_msg.startswith(username):
        box["msg"] = f"{username} - {old_msg}"

    return box


def attach_faces_to_boxes(frame, boxes):
    """
    将 MongoDB personnel 人脸识别结果融合到已有报警框中。
    识别成功：显示真实人员。
    未识别/未匹配：显示模拟用户：李工。
    """
    if not boxes:
        return boxes

    # 默认先给所有报警框填一个模拟人员，避免后续任何失败导致“未知”
    for box in boxes:
        _set_mock_person(box)

    if frame is None:
        return boxes

    try:
        face_svc = get_face_service()
        face_results = face_svc.recognize_faces(frame)
        print("🧩 [人脸融合识别结果]", face_results)
    except Exception as e:
        print(f"⚠️ [人脸融合] 人脸识别失败，使用模拟人员: {e}")
        return boxes

    # 没有人脸结果时，保留上面已经写入的“模拟用户：李工”
    if not face_results:
        return boxes

    for box in boxes:
        box_coords = box.get("coords")
        if not box_coords:
            continue

        best_face = None
        best_score = 0.0

        for face in face_results:
            face_coords = face.get("coords")
            if not face_coords:
                continue

            face_center = _center(face_coords)

            if _point_in_box(face_center, box_coords, expand_ratio=0.8):
                score = face.get("similarity", 0.0)
                if score > best_score:
                    best_score = score
                    best_face = face

        # 没有匹配到当前报警框的人脸，继续保留模拟人员
        if not best_face:
            continue

        person = best_face.get("person")
        name = best_face.get("name", "")

        if person:
            username = person.get("username") or name or ""
            box["person"] = person
        else:
            username = name or ""

        # 识别结果仍然未知时，继续保留模拟人员
        if not username or username == "未知人员":
            continue

        old_msg = box.get("msg") or box.get("type") or ""
        # 去掉之前预填的“模拟用户：李工 - ”
        old_msg = old_msg.replace("模拟用户：李工 - ", "")

        box["personName"] = username
        box["faceSimilarity"] = best_face.get("similarity", 0.0)
        box["msg"] = f"{username} - {old_msg}"

    return boxes