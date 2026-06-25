from __future__ import annotations

import logging
from typing import Any

from ._runtime_entry import legacy_alarm_detect, runtime_detect
from .registry import ai_rule
from app.services.ai_runtime.face_library_manager import face_library_manager

logger = logging.getLogger("FaceDetector")


def detect(frame: Any, **kwargs) -> dict:
    # 1. 运行通用人脸检测 (利用 ONNX 模型在画面上定位人脸 bbox)
    result = runtime_detect("face", frame, **kwargs)

    # 2. 如果检测失败或未检测到人脸，直接返回结果
    if not result.get("success") or not result.get("detections") or frame is None:
        return result

    # 确保人脸比对管理器已加载底库
    face_library_manager.ensure_loaded()

    # 3. 对检测到的每张人脸进行特征提取与底库实名比对 (后处理)
    h_orig, w_orig = frame.shape[:2]
    
    for det in result["detections"]:
        bbox = det.get("bbox")
        if not bbox or len(bbox) < 4:
            continue

        x1, y1, x2, y2 = bbox
        x1 = max(0, int(x1))
        y1 = max(0, int(y1))
        x2 = min(w_orig, int(x2))
        y2 = min(h_orig, int(y2))

        # 确保裁剪区域有效
        if x2 > x1 and y2 > y1:
            face_crop = frame[y1:y2, x1:x2]
            
            # 调用底库进行特征比对与人员识别
            match_result = face_library_manager.match_face(face_crop)
            if match_result:
                # 识别成功，重写 label 为人名，并注入人员详细档案及相似度
                det["raw_label"] = "face"
                det["label"] = match_result["name"]
                det["person"] = match_result["person"]
                det["similarity"] = match_result["similarity"]
                logger.info("[人脸识别成功] 姓名=%s, 相似度=%.4f", match_result["name"], match_result["similarity"])
            else:
                # 识别失败，保持原样或标记为未知
                det["raw_label"] = "face"
                det["label"] = "未知人员"

    return result


def detect_face(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def run(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def analyze(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


@ai_rule("face", "人脸检测")
def detect_face_alarm(service, frame):
    return legacy_alarm_detect(service, "face", frame)
