from __future__ import annotations

import logging
from typing import Any

from ._runtime_entry import legacy_alarm_detect
from .registry import ai_rule
from app.services.ai_runtime.face_library_manager import face_library_manager

logger = logging.getLogger("FaceDetector")


def detect(frame: Any, **kwargs) -> dict:
    result = face_library_manager.detect_and_match(frame)
    detections = result.get("detections") if isinstance(result, dict) else []
    matched = [
        det
        for det in detections or []
        if det.get("personnel_id") and not det.get("face_match_low_confidence")
    ]
    logger.info("InsightFace detection complete: faces=%d matched=%d", len(detections or []), len(matched))
    return result


def detect_face(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def run(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def analyze(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


@ai_rule("face", "face detection")
def detect_face_alarm(service, frame, device_id=None):
    return legacy_alarm_detect(service, "face", frame, device_id=device_id)
