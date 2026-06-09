from __future__ import annotations

from pathlib import Path
from typing import Any

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

    def detect(self, frame: Any, **kwargs) -> list[dict]:
        model = self._load()
        conf = float(kwargs.get("conf", kwargs.get("confidence", self.config.confidence)))
        iou = float(kwargs.get("iou", self.config.iou))
        results = model(frame, conf=conf, iou=iou, verbose=False)
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
            detections.append(
                {
                    "raw_label": raw_label,
                    "label": label_for_class(self.config, class_id, raw_label),
                    "confidence": float(box.conf[0]),
                    "bbox": [float(v) for v in box.xyxy[0].tolist()],
                    "frame_size": frame_size,
                }
            )

        return detections
