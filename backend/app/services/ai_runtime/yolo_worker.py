from __future__ import annotations

import json
import os
import pickle
import struct
import sys
from pathlib import Path

_PROTOCOL_IN = sys.stdin.buffer
_PROTOCOL_OUT = sys.stdout.buffer


def _read_message():
    header = _PROTOCOL_IN.read(4)
    if not header:
        return None
    size = struct.unpack("!I", header)[0]
    payload = _PROTOCOL_IN.read(size)
    if len(payload) != size:
        return None
    return pickle.loads(payload)


def _write_message(message):
    payload = pickle.dumps(message, protocol=pickle.HIGHEST_PROTOCOL)
    _PROTOCOL_OUT.write(struct.pack("!I", len(payload)))
    _PROTOCOL_OUT.write(payload)
    _PROTOCOL_OUT.flush()


def main():
    sys.stdout = sys.stderr
    backend_dir = Path(__file__).resolve().parents[3]
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from app.services.ai_runtime.model_registry import get_model_config, resolve_model_path
    from app.services.ai_runtime.yolo_detector import YoloDetector

    hello = json.loads(os.environ.get("AI_YOLO_WORKER_HELLO", "{}") or "{}")
    algorithm_code = hello.get("algorithm_code") or "person"
    config = get_model_config(algorithm_code)
    if config is None:
        raise RuntimeError(f"unknown algorithm: {algorithm_code}")
    model_path, model_type, error = resolve_model_path(config)
    if error:
        raise RuntimeError(error)
    if model_type != "pt":
        raise RuntimeError(f"worker only supports pt models, got {model_type}")

    detector = YoloDetector(model_path, config)
    _write_message({"ok": True, "ready": True, "algorithm_code": algorithm_code})

    while True:
        message = _read_message()
        if message is None:
            break
        if message.get("op") == "stop":
            break
        if message.get("op") != "detect":
            _write_message({"ok": False, "error": "unknown op"})
            continue
        try:
            detections = detector.detect(message.get("frame"), **(message.get("kwargs") or {}))
            _write_message({
                "ok": True,
                "request_id": message.get("request_id"),
                "detections": detections,
                "timing": dict(getattr(detector, "last_timing", None) or {}),
            })
        except Exception as exc:
            _write_message({
                "ok": False,
                "request_id": message.get("request_id"),
                "error": str(exc),
                "timing": dict(getattr(detector, "last_timing", None) or {}),
            })


if __name__ == "__main__":
    main()
