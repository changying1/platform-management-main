from __future__ import annotations

from pathlib import Path
from typing import Any
import os

from .model_registry import ModelConfig, label_for_class


class YoloDetector:
    def __init__(self, model_path: Path, config: ModelConfig):
        self.model_path = Path(model_path)
        self.config = config
        self._model = None

    def _load(self):
        if self._model is not None:
            return self._model

        if not self.model_path.exists():
            raise FileNotFoundError(f"模型文件不存在: {self.model_path}")

        try:
            from ultralytics import YOLO
        except Exception as exc:
            raise RuntimeError(f"ultralytics 未安装或加载失败: {exc}") from exc

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

    def detect(self, frame: Any, **kwargs) -> list[dict]:
        model = self._load()
        device = kwargs.get("device") or self._device()
        conf = float(kwargs.get("conf", kwargs.get("confidence", self.config.confidence)))
        iou = float(kwargs.get("iou", self.config.iou))
        imgsz = int(kwargs.get("imgsz", kwargs.get("input_size", self.config.input_size)) or self.config.input_size)
        classes = kwargs.get("classes")
        if classes is not None and not isinstance(classes, (list, tuple, set)):
            classes = [classes]
        classes = [int(item) for item in classes] if classes is not None else None

        if kwargs.get("track"):
            results = model.track(
                frame,
                conf=conf,
                iou=iou,
                imgsz=imgsz,
                classes=classes,
                tracker=str(kwargs.get("tracker") or "botsort.yaml"),
                persist=bool(kwargs.get("persist", True)),
                device=device,
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
                verbose=False,
            )
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
