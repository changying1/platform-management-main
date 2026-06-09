import math
from .registry import ai_rule


@ai_rule("pipeline_operation", "管线作业监护")
def pipeline_operation(service, frame):
    """
    管线两侧1m范围内挖土作业是否有专人监护
    """

    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        pipelines = []
        excavators = []
        persons = []

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)
            x1, y1, x2, y2 = map(int, box.xyxy[0])

            if label in {"pipeline", "pipe_line", "underground_pipeline"}:
                pipelines.append((x1, y1, x2, y2))

            elif label in {"excavator", "machine", "digging_machine"}:
                excavators.append((x1, y1, x2, y2))

            elif label == "person":
                persons.append((x1, y1, x2, y2))

        if len(pipelines) == 0 or len(excavators) == 0:
            return False, {}

        for px1, py1, px2, py2 in pipelines:
            pcx = (px1 + px2) / 2
            pcy = (py1 + py2) / 2

            for ex1, ey1, ex2, ey2 in excavators:
                ecx = (ex1 + ex2) / 2
                ecy = (ey1 + ey2) / 2

                dist = math.sqrt((pcx - ecx) ** 2 + (pcy - ecy) ** 2)

                # 像素近似 1m
                if dist < 100:
                    # 检查附近是否有监护人
                    supervisor_found = False
                    for sx1, sy1, sx2, sy2 in persons:
                        scx = (sx1 + sx2) / 2
                        scy = (sy1 + sy2) / 2
                        sdist = math.sqrt((pcx - scx) ** 2 + (pcy - scy) ** 2)

                        if sdist < 150:
                            supervisor_found = True
                            break

                    if not supervisor_found:
                        return True, {
                            "type": "pipeline_operation",
                            "msg": "管线两侧1m范围内挖土无专人监护",
                            "score": 0.8,
                            "coords": [px1, py1, px2, py2, ex1, ey1, ex2, ey2],
                        }

        return False, {}

    except Exception as e:
        print(f"⚠️ 管线作业监护检测出错: {e}")
        return False, {}