import os
import time
from .registry import ai_rule

_face_service = None
_last_recognition_time = 0.0

# 人脸识别间隔(秒),计算开销大,需要限频
RECOGNITION_INTERVAL = float(os.getenv("AI_FACE_RECOGNITION_INTERVAL", "3"))


def _get_face_service():
    global _face_service
    if _face_service is None:
        from app.services.ai_features.face_service import FaceService
        _face_service = FaceService()
    return _face_service


@ai_rule("face_recognition", "人脸识别")

def detect_and_recognize_faces(service, frame):
    """人脸识别:YOLO Pose 定位 + FaceNet 比对,结果推送前端显示,不写报警记录."""
    global _last_recognition_time

    if frame is None:
        return False, None

    # 频率控制
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
            label = r["info"] if r["info"] else r["name"]
            boxes.append({
                "type": "人脸识别",
                "msg": f"{label} ({r['similarity']:.0%})",
                "score": r["similarity"],
                "coords": r["coords"],
            })

        # WebSocket 推送到前端(标记为人脸识别,前端不弹窗不报警音)
        data = {"face_recognition": True, "boxes": boxes}
        service._push_alarm_safe(data)

        for r in results:
            print(f"👤 [人脸识别] {r['name']} (相似度: {r['similarity']:.4f})")

        # 返回 False 跳过报警记录入库(人脸识别不是报警)
        return False, None

    except Exception as e:
        print(f"⚠️ 人脸识别出错: {e}")
        return False, None
