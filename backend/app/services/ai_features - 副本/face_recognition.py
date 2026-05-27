import os
import time
from .registry import ai_rule

_face_service = None
_last_recognition_time = 0.0

RECOGNITION_INTERVAL = float(os.getenv("AI_FACE_RECOGNITION_INTERVAL", "3"))


def _get_face_service():
    global _face_service
    if _face_service is None:
        from app.services.face_service import FaceService
        _face_service = FaceService()
    return _face_service


@ai_rule("face_recognition", "人脸识别")

def detect_and_recognize_faces(service, frame):
    """人脸识别:YOLO Pose 定位 + FaceNet 比对,结果推送前端显示,不写报警记录."""
    global _last_recognition_time

    if frame is None:
        return False, None

    now = time.time()
    if now - _last_recognition_time < RECOGNITION_INTERVAL:
        return False, None
    _last_recognition_time = now

    try:
        face_svc = _get_face_service()
        results = face_svc.recognize_faces(frame)

        if not results:
            return False, None

        boxes = []
        for r in results:
            label = r.get("info") if r.get("info") else r.get("name", "未知人员")
            similarity = float(r.get("similarity", 0.0) or 0.0)
            coords_raw = r.get("coords") or [0, 0, 0, 0]
            coords = [int(float(v)) for v in coords_raw[:4]] if isinstance(coords_raw, (list, tuple)) else [0, 0, 0, 0]

            boxes.append({
                "type": "人脸识别",
                "msg": f"{label} ({similarity:.0%})",
                "score": similarity,
                "coords": coords,
                "track_id": int(r.get("track_id", 0) or 0),
            })

        # 统一按报警格式推送,便于前端复用绘框逻辑
        data = {"alarm": True, "type": "face_recognition", "msg": "人脸识别", "boxes": boxes}
        service._push_alarm_safe(data)

        for r in results:
            print(f"👤 [人脸识别] {r.get('name', '未知')} (相似度: {float(r.get('similarity', 0.0) or 0.0):.4f})")

        return False, None

    except Exception as e:
        print(f"⚠️ 人脸识别出错: {e}")
        return False, None
