from __future__ import annotations

from pathlib import Path
from threading import Lock, current_thread
from typing import Any
import faulthandler
import os
import sys
import time

from .model_registry import ModelConfig, label_for_class


class YoloDetector:
    def __init__(self, model_path: Path, config: ModelConfig):
        self.model_path = Path(model_path)
        self.config = config
        self._model = None
        self._lock = Lock()
        self.last_timing: dict[str, Any] = {}
        self.last_benchmark: dict[str, Any] = {}
        self._benchmark_done = False

    def _load(self):
        if self._model is not None:
            return self._model

        with self._lock:
            if self._model is not None:
                return self._model

            if not self.model_path.exists():
                raise FileNotFoundError(f"model file does not exist: {self.model_path}")

            try:
                from ultralytics import YOLO
            except Exception as exc:
                raise RuntimeError(f"ultralytics is not installed or failed to load: {exc}") from exc

            self._model = YOLO(str(self.model_path))
            return self._model

    def _device(self):
        configured = str(os.getenv("AI_YOLO_DEVICE", "auto") or "auto").strip()
        if configured and configured.lower() != "auto":
            return configured
        try:
            import torch
            return "cuda:0" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"

    def _half_enabled(self, device: str, kwargs: dict) -> bool:
        configured = kwargs.get("half")
        if configured is None:
            configured = os.getenv("AI_YOLO_HALF", "1")
        value = str(configured).strip().lower()
        if value in {"0", "false", "no", "off"}:
            return False
        if value in {"1", "true", "yes", "on"}:
            return str(device).startswith("cuda")
        return str(device).startswith("cuda")

    def _sync_cuda(self, device: str):
        if os.getenv("AI_TIMING_SYNC_CUDA", "1").lower() in {"0", "false", "no", "off"}:
            return
        try:
            import torch
            if str(device).startswith("cuda") and torch.cuda.is_available():
                torch.cuda.synchronize()
        except Exception:
            pass

    def _benchmark_once(self, model: Any, frame: Any, *, conf: float, iou: float, imgsz: int, classes: list[int] | None, device: str, half: bool):
        if self._benchmark_done:
            return
        if os.getenv("AI_YOLO_BENCHMARK_ONCE", "1").lower() in {"0", "false", "no", "off"}:
            self._benchmark_done = True
            return
        self._benchmark_done = True
        try:
            import numpy as np

            shape = getattr(frame, "shape", None)
            if shape is None or len(shape) < 2:
                shape = (720, 1280, 3)
            channels = int(shape[2]) if len(shape) >= 3 else 3
            synthetic = np.zeros((int(shape[0]), int(shape[1]), channels), dtype=np.uint8)
            started_at = time.time()
            results = model(
                synthetic,
                conf=conf,
                iou=iou,
                imgsz=imgsz,
                classes=classes,
                device=device,
                half=half,
                verbose=False,
            )
            returned_at = time.time()
            self._sync_cuda(device)
            finished_at = time.time()
            result0 = results[0] if results else None
            speed = getattr(result0, "speed", None) or {}
            benchmark = {
                "algorithm": self.config.algorithm_code,
                "model": self.config.model_name,
                "device": device,
                "half": half,
                "imgsz": imgsz,
                "frame_shape": list(synthetic.shape),
                "model_call_ms": int((returned_at - started_at) * 1000),
                "cuda_sync_ms": int((finished_at - returned_at) * 1000),
                "total_ms": int((finished_at - started_at) * 1000),
                "speed_preprocess_ms": speed.get("preprocess"),
                "speed_inference_ms": speed.get("inference"),
                "speed_postprocess_ms": speed.get("postprocess"),
                "thread": current_thread().name,
            }
            self.last_benchmark = benchmark
            print(
                "[AI_YOLO_BENCHMARK] "
                f"algorithm={benchmark['algorithm']} model={benchmark['model']} "
                f"device={benchmark['device']} half={benchmark['half']} imgsz={benchmark['imgsz']} "
                f"frame_shape={benchmark['frame_shape']} model_call_ms={benchmark['model_call_ms']} "
                f"cuda_sync_ms={benchmark['cuda_sync_ms']} total_ms={benchmark['total_ms']} "
                f"speed_preprocess_ms={benchmark['speed_preprocess_ms']} "
                f"speed_inference_ms={benchmark['speed_inference_ms']} "
                f"speed_postprocess_ms={benchmark['speed_postprocess_ms']} thread={benchmark['thread']}",
                file=sys.stderr,
            )
        except Exception as exc:
            self.last_benchmark = {
                "algorithm": self.config.algorithm_code,
                "error": str(exc),
            }
            print(
                f"[AI_YOLO_BENCHMARK_FAILED] algorithm={self.config.algorithm_code} error={exc}",
                file=sys.stderr,
            )

    def detect(self, frame: Any, **kwargs) -> list[dict]:
        model = self._load()
        device = kwargs.get("device") or self._device()
        half = self._half_enabled(str(device), kwargs)
        conf = float(kwargs.get("conf", kwargs.get("confidence", self.config.confidence)))
        iou = float(kwargs.get("iou", self.config.iou))
        imgsz = int(kwargs.get("imgsz", kwargs.get("input_size", self.config.input_size)) or self.config.input_size)
        classes = kwargs.get("classes")
        if classes is not None and not isinstance(classes, (list, tuple, set)):
            classes = [classes]
        classes = [int(item) for item in classes] if classes is not None else None

        track = bool(kwargs.get("track"))
        tracker = str(kwargs.get("tracker") or "botsort.yaml")
        try:
            stack_slow_ms = max(0, int(os.getenv("AI_TIMING_STACK_SLOW_MS", "0")))
        except ValueError:
            stack_slow_ms = 0
        wait_started_at = time.time()
        self._lock.acquire()
        lock_acquired_at = time.time()
        benchmark_started_at = lock_acquired_at
        benchmark_finished_at = benchmark_started_at
        try:
            self._benchmark_once(model, frame, conf=conf, iou=iou, imgsz=imgsz, classes=classes, device=device, half=half)
            benchmark_finished_at = time.time()
            infer_started_at = time.time()
            dump_scheduled = False
            if stack_slow_ms > 0:
                try:
                    print(
                        f"[AI_TIMING_STACK_ARMED] threshold_ms={stack_slow_ms} "
                        f"thread={current_thread().name} track={track} imgsz={imgsz}",
                        file=sys.stderr,
                    )
                    faulthandler.dump_traceback_later(stack_slow_ms / 1000.0, repeat=False, file=sys.stderr)
                    dump_scheduled = True
                except Exception:
                    dump_scheduled = False
            if track:
                results = model.track(
                    frame,
                    conf=conf,
                    iou=iou,
                    imgsz=imgsz,
                    classes=classes,
                    tracker=tracker,
                    persist=bool(kwargs.get("persist", True)),
                    device=device,
                    half=half,
                    verbose=False,
                )
            else:
                results = model(
                    frame,
                    conf=conf,
                    iou=iou,
                    imgsz=imgsz,
                    classes=classes,
                    device=device,
                    half=half,
                    verbose=False,
                )
            model_returned_at = time.time()
            if dump_scheduled:
                try:
                    faulthandler.cancel_dump_traceback_later()
                except Exception:
                    pass
            self._sync_cuda(device)
            infer_finished_at = time.time()
        finally:
            self._lock.release()

        result0 = results[0] if results else None
        speed = getattr(result0, "speed", None) or {}
        frame_shape = list(getattr(frame, "shape", []) or [])
        frame_dtype = str(getattr(frame, "dtype", ""))
        frame_contiguous = None
        try:
            frame_contiguous = bool(frame.flags["C_CONTIGUOUS"])
        except Exception:
            pass
        self.last_timing = {
            "algorithm": self.config.algorithm_code,
            "model": self.config.model_name,
            "device": device,
            "half": half,
            "track": track,
            "tracker": tracker if track else "",
            "imgsz": imgsz,
            "conf": conf,
            "thread": current_thread().name,
            "stack_slow_ms": stack_slow_ms,
            "frame_shape": frame_shape,
            "frame_dtype": frame_dtype,
            "frame_contiguous": frame_contiguous,
            "lock_wait_ms": int((lock_acquired_at - wait_started_at) * 1000),
            "benchmark_overhead_ms": int((benchmark_finished_at - benchmark_started_at) * 1000),
            "model_call_ms": int((model_returned_at - infer_started_at) * 1000),
            "cuda_sync_ms": int((infer_finished_at - model_returned_at) * 1000),
            "infer_ms": int((infer_finished_at - infer_started_at) * 1000),
            "total_ms": int((lock_acquired_at - wait_started_at + infer_finished_at - infer_started_at) * 1000),
            "speed_preprocess_ms": speed.get("preprocess"),
            "speed_inference_ms": speed.get("inference"),
            "speed_postprocess_ms": speed.get("postprocess"),
            "benchmark": dict(self.last_benchmark or {}),
        }
        if not results:
            return []

        result = results[0]
        names = getattr(result, "names", {}) or getattr(model, "names", {}) or {}
        orig_shape = getattr(result, "orig_shape", None) or ()
        frame_size = None
        if len(orig_shape) >= 2:
            frame_size = [int(orig_shape[1]), int(orig_shape[0])]
        detections = []

        for box in getattr(result, "boxes", []) or []:
            class_id = int(box.cls[0])
            raw_label = names.get(class_id, class_id) if isinstance(names, dict) else class_id
            raw_label = str(raw_label)
            detection = {
                "raw_label": raw_label,
                "label": label_for_class(self.config, class_id, raw_label),
                "confidence": float(box.conf[0]),
                "bbox": [float(v) for v in box.xyxy[0].tolist()],
                "frame_size": frame_size,
            }
            track_ids = getattr(box, "id", None)
            if track_ids is not None:
                try:
                    detection["track_id"] = int(track_ids[0])
                except Exception:
                    pass
            detections.append(detection)

        return detections
