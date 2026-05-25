from .registry import ai_rule

@ai_rule("supervisor_count", "现场监督人数统计")
def count_supervisors(service, frame):

    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.5, verbose=False)[0]

        supervisor_count = 0

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label == "helmet":

                x1, y1, x2, y2 = map(int, box.xyxy[0])
                h, w, _ = frame.shape
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)

                helmet_crop = frame[y1:y2, x1:x2]
                color = service._get_helmet_color(helmet_crop)

                if color == "red":
                    supervisor_count += 1

        # 监护人不存在
        if supervisor_count == 0:
            return service._check_cooldown_and_alarm(
                "现场人数统计违规",
                "现场检测到监护人数量不足 (当前: 0)",
                1.0,
                [0, 0, 100, 100],  # 占位符坐标
            )

        return False, {
            "type": "supervisor_ok",
            "count": supervisor_count
        }

    except Exception as e:
        print("监督人数检测异常:", e)
        return False, {}