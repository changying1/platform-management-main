from __future__ import annotations

from typing import Any

from app.services.ai_runtime import detect_frame, get_model_config
from app.services.ai_runtime.model_registry import is_alarm_label
from app.services.ai_runtime.result_adapter import to_alarm_boxes


def runtime_detect(algorithm_code: str, frame: Any, **kwargs) -> dict:
    return detect_frame(algorithm_code, frame, **kwargs)


def legacy_alarm_detect(service, algorithm_code: str, frame: Any, **kwargs):
    result = runtime_detect(algorithm_code, frame, **kwargs)
    if not result.get("success"):
        print(f"[AI][{algorithm_code}] {result.get('error')}")
        return False, None

    config = get_model_config(algorithm_code)
    alarm_labels = config.alarm_labels if config else None
    boxes = to_alarm_boxes(result, alarm_labels)
    if not boxes:
        return False, None

    alarm_type = result.get("algorithm_name") or algorithm_code
    if hasattr(service, "_check_cooldown_and_multi_alarm"):
        return service._check_cooldown_and_multi_alarm(alarm_type, boxes)

    return True, {"alarm": True, "type": algorithm_code, "boxes": boxes}


def has_alarm_detection(algorithm_code: str, detection: dict) -> bool:
    config = get_model_config(algorithm_code)
    if not config:
        return True
    return is_alarm_label(config, str(detection.get("label", "")))
