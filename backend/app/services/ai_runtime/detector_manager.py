from __future__ import annotations

import os
from threading import Lock
from typing import Any

from .model_registry import get_model_config, resolve_model_path
from .onnx_detector import OnnxDetector, load_image
from .result_adapter import failure_result, success_result
from .yolo_process_detector import YoloProcessDetector
from .yolo_detector import YoloDetector


class DetectorManager:
    def __init__(self):
        self._cache = {}
        self._lock = Lock()

    def clear_cache(self):
        with self._lock:
            self._cache.clear()

    def detect_frame(self, algorithm_code: str, frame: Any, **kwargs) -> dict:
        config = get_model_config(algorithm_code)
        if config is None:
            return failure_result(algorithm_code, f"未知算法 code: {algorithm_code}")

        model_path, model_type, error = resolve_model_path(config)
        if error:
            return failure_result(config, error)

        try:
            tracker_scope = kwargs.get("tracker_scope") if kwargs.get("track") else None
            detector = self._get_detector(config, model_path, model_type, tracker_scope=tracker_scope)
            detections = detector.detect(frame, **kwargs)
            result = success_result(config, detections)
            timing = getattr(detector, "last_timing", None)
            if timing:
                result["timing"] = dict(timing)
            return result
        except Exception as exc:
            return failure_result(config, str(exc))

    def _get_detector(self, config, model_path, model_type, tracker_scope=None):
        cache_key = (config.algorithm_code, str(model_path), model_type, tracker_scope)
        with self._lock:
            detector = self._cache.get(cache_key)
            if detector is None:
                if model_type == "pt":
                    if os.getenv("AI_YOLO_PROCESS", "1").lower() in {"0", "false", "no", "off"}:
                        detector = YoloDetector(model_path, config)
                    else:
                        detector = YoloProcessDetector(model_path, config)
                elif model_type == "onnx":
                    detector = OnnxDetector(model_path, config)
                else:
                    raise RuntimeError(f"不支持的模型类型: {model_type}")
                self._cache[cache_key] = detector
            return detector


_MANAGER = DetectorManager()


def get_detector_manager() -> DetectorManager:
    return _MANAGER


def clear_detector_cache():
    _MANAGER.clear_cache()


def detect_frame(algorithm_code: str, frame: Any, **kwargs) -> dict:
    return _MANAGER.detect_frame(algorithm_code, frame, **kwargs)


def load_frame(source: Any):
    return load_image(source)
