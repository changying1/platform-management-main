from __future__ import annotations

from threading import Lock
from typing import Any

from .model_registry import get_model_config, resolve_model_path
from .onnx_detector import OnnxDetector, load_image
from .result_adapter import failure_result, success_result
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
            detector = self._get_detector(config, model_path, model_type)
            detections = detector.detect(frame, **kwargs)
            return success_result(config, detections)
        except Exception as exc:
            return failure_result(config, str(exc))

    def _get_detector(self, config, model_path, model_type):
        cache_key = (config.algorithm_code, str(model_path), model_type)
        with self._lock:
            detector = self._cache.get(cache_key)
            if detector is None:
                if model_type == "pt":
                    detector = YoloDetector(model_path, config)
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
