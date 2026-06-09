from __future__ import annotations

from typing import Any

from .model_registry import list_model_configs, resolve_model_path


def _dependency_available(model_type: str) -> tuple[bool, str]:
    if model_type == "onnx":
        try:
            import onnxruntime as ort  # noqa: F401
        except Exception as exc:
            return False, f"onnxruntime unavailable: {exc}"
    elif model_type == "pt":
        try:
            from ultralytics import YOLO  # noqa: F401
        except Exception as exc:
            return False, f"ultralytics unavailable: {exc}"
    return True, ""


def list_algorithms() -> list[dict[str, Any]]:
    algorithms: list[dict[str, Any]] = []
    for config in list_model_configs().values():
        model_path, model_type, error = resolve_model_path(config)
        enabled = error is None
        reason = config.disabled_reason or error or ""

        if enabled:
            enabled, reason = _dependency_available(model_type)

        algorithms.append(
            {
                "key": config.algorithm_code,
                "algorithm_code": config.algorithm_code,
                "desc": config.algorithm_name,
                "algorithm_name": config.algorithm_name,
                "model_type": model_type,
                "model_path": str(model_path) if model_path else "",
                "enabled": bool(enabled),
                "reason": reason,
                "disabled_reason": reason if not enabled else "",
            }
        )
    return algorithms
