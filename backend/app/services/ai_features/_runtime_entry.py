from __future__ import annotations

from typing import Any

from app.services.ai_runtime import detect_frame, get_model_config
from app.services.ai_runtime.model_registry import is_alarm_label
from app.services.ai_runtime.result_adapter import to_alarm_boxes


def runtime_detect(algorithm_code: str, frame: Any, **kwargs) -> dict:
    return detect_frame(algorithm_code, frame, **kwargs)


def legacy_alarm_detect(service, algorithm_code: str, frame: Any, device_id=None, **kwargs):
    # 优先从已加载的模块中获取自定义的 detect() 逻辑，避免包未初始化完全时的导入问题
    import sys
    import importlib
    
    module = sys.modules.get(f"app.services.ai_features.{algorithm_code}")
    if module is None:
        try:
            module = importlib.import_module(f"app.services.ai_features.{algorithm_code}")
        except Exception:
            try:
                module = importlib.import_module(f".{algorithm_code}", package=__package__)
            except Exception:
                module = None

    if module is not None and hasattr(module, "detect"):
        try:
            detect_fn = getattr(module, "detect")
            result = detect_fn(frame, **kwargs)
        except Exception as e:
            print(f"[AI][{algorithm_code}] 执行自定义 detect 失败: {e}")
            import traceback
            traceback.print_exc()
            result = runtime_detect(algorithm_code, frame, **kwargs)
    else:
        result = runtime_detect(algorithm_code, frame, **kwargs)

    if not result.get("success"):
        print(f"[AI][{algorithm_code}] {result.get('error')}")
        return False, None

    config = get_model_config(algorithm_code)
    alarm_labels = config.alarm_labels if config else None
    boxes = to_alarm_boxes(result, alarm_labels)
    if not boxes:
        return False, {
            "alarm": False,
            "type": result.get("algorithm_code") or algorithm_code,
            "algorithm_code": result.get("algorithm_code") or algorithm_code,
            "algorithm_name": result.get("algorithm_name") or algorithm_code,
            "detections": result.get("detections") or [],
        }

    alarm_type = str(boxes[0].get("type") or algorithm_code).strip()
    return True, {
        "alarm": True,
        "type": alarm_type,
        "algorithm_code": result.get("algorithm_code") or algorithm_code,
        "algorithm_name": result.get("algorithm_name") or algorithm_code,
        "boxes": boxes,
        "alarm_boxes": boxes,
    }


def has_alarm_detection(algorithm_code: str, detection: dict) -> bool:
    config = get_model_config(algorithm_code)
    if not config:
        return True
    return is_alarm_label(config, str(detection.get("label", "")))
