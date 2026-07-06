from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

from ._runtime_entry import legacy_alarm_detect
from .registry import ai_rule


CLASS_NAMES = {
    0: "spark",
    1: "flame",
    2: "ember",
}

CN_LABELS = {
    "spark": "火星/热渣飞溅",
    "flame": "明火/小火苗",
    "ember": "余火/炽热点/阴燃热渣",
}

DEFAULT_CLASS_CONF = {
    "spark": 0.30,
    "flame": 0.25,
    "ember": 0.20,
}


def _default_model_path() -> Path:
    env_path = (
        os.getenv("FIRE_MODEL_PATH")
        or os.getenv("RESIDUAL_FIRE_MODEL_PATH")
        or os.getenv("AFTER_FIRE_MODEL_PATH")
    )
    if env_path:
        return Path(env_path)

    return Path(__file__).resolve().parents[1] / "yolo_models" / "fire.pt"


class ResidualFireDetector:
    """
    Detector for post-hot-work residual fire inspection.

    Classes expected from the trained YOLO model:
      0 spark: flying sparks or hot slag points
      1 flame: visible flame or small flame
      2 ember: residual hot slag, glowing ember, smoldering hot spot
    """

    def __init__(
        self,
        model_path: str | Path | None = None,
        conf: float = 0.20,
        iou: float = 0.55,
        device: str | int | None = None,
        imgsz: int = 640,
        class_conf: dict[str, float] | None = None,
    ):
        self.model_path = Path(model_path) if model_path else _default_model_path()
        self.conf = float(conf)
        self.iou = float(iou)
        self.device = device
        self.imgsz = int(imgsz)
        self.class_conf = {**DEFAULT_CLASS_CONF, **(class_conf or {})}
        self._model = None

    def _load_model(self):
        if self._model is not None:
            return self._model
        if not self.model_path.exists():
            raise FileNotFoundError(
                f"余火检测模型不存在: {self.model_path}. "
                "请将训练权重放到 backend/app/services/yolo_models/fire.pt，"
                "或设置环境变量 FIRE_MODEL_PATH。"
            )
        try:
            from ultralytics import YOLO
        except Exception as exc:
            raise RuntimeError(f"ultralytics 未安装或加载失败: {exc}") from exc
        self._model = YOLO(str(self.model_path))
        print(f"[AI][fire] Loaded model: {self.model_path.resolve()}")
        return self._model

    @staticmethod
    def _frame_size(result: Any) -> list[int] | None:
        orig_shape = getattr(result, "orig_shape", None) or ()
        if len(orig_shape) >= 2:
            return [int(orig_shape[1]), int(orig_shape[0])]
        return None

    @staticmethod
    def _norm_bbox(xyxy: list[float], frame_size: list[int] | None) -> list[float] | None:
        if not frame_size:
            return None
        w, h = frame_size
        if w <= 0 or h <= 0:
            return None
        x1, y1, x2, y2 = xyxy
        return [
            max(0.0, min(1.0, x1 / w)),
            max(0.0, min(1.0, y1 / h)),
            max(0.0, min(1.0, x2 / w)),
            max(0.0, min(1.0, y2 / h)),
        ]

    def _risk_level(
        self,
        detections: list[dict[str, Any]],
        post_hot_work: bool,
        minutes_since_end: float | None,
    ) -> tuple[str, str, bool]:
        ember_count = sum(1 for d in detections if d["raw_label"] == "ember")
        flame_count = sum(1 for d in detections if d["raw_label"] == "flame")
        spark_count = sum(1 for d in detections if d["raw_label"] == "spark")

        in_30min_window = post_hot_work and (
            minutes_since_end is None or 0 <= float(minutes_since_end) <= 30
        )

        if flame_count > 0 and in_30min_window:
            return "critical", "动火结束后巡检范围内发现明火/小火苗，需立即处置。", True
        if ember_count > 0 and in_30min_window:
            return "high", "动火结束后巡检范围内发现余火/炽热点，存在复燃风险。", True
        if flame_count > 0:
            return "high", "发现明火/小火苗。", True
        if ember_count > 0:
            return "medium", "发现余火/炽热点。", True
        if spark_count >= 3:
            return "medium", "发现多处火星/热渣飞溅。", True
        if spark_count > 0:
            return "low", "发现少量火星/热渣点。", True
        return "none", "未发现火星、火苗或余火。", False

    def detect(self, frame: Any, **kwargs) -> dict[str, Any]:
        model = self._load_model()
        conf = float(kwargs.get("conf", kwargs.get("confidence", self.conf)))
        iou = float(kwargs.get("iou", self.iou))
        imgsz = int(kwargs.get("imgsz", self.imgsz))
        device = kwargs.get("device", self.device)
        post_hot_work = bool(
            kwargs.get("post_hot_work", kwargs.get("hot_work_finished", True))
        )
        minutes_since_end = kwargs.get("minutes_since_end")

        started = time.time()
        predict_kwargs = {
            "conf": conf,
            "iou": iou,
            "imgsz": imgsz,
            "verbose": False,
        }
        if device is not None:
            predict_kwargs["device"] = device

        results = model(frame, **predict_kwargs)
        if not results:
            return {
                "success": True,
                "alarm": False,
                "alarm_type": "fire",
                "risk_level": "none",
                "message": "未发现火星、火苗或余火。",
                "detections": [],
                "elapsed_ms": round((time.time() - started) * 1000, 2),
            }

        result = results[0]
        names = getattr(result, "names", {}) or getattr(model, "names", {}) or {}
        frame_size = self._frame_size(result)
        detections: list[dict[str, Any]] = []

        for box in getattr(result, "boxes", []) or []:
            class_id = int(box.cls[0])
            model_label = names.get(class_id, CLASS_NAMES.get(class_id, str(class_id)))
            raw_label = str(model_label).lower()
            if raw_label not in CN_LABELS:
                raw_label = CLASS_NAMES.get(class_id, raw_label)
            if raw_label not in CN_LABELS:
                continue

            confidence = float(box.conf[0])
            if confidence < self.class_conf.get(raw_label, conf):
                continue

            bbox = [float(v) for v in box.xyxy[0].tolist()]
            x1, y1, x2, y2 = bbox
            if x2 <= x1 or y2 <= y1:
                continue

            detections.append(
                {
                    "class_id": class_id,
                    "raw_label": raw_label,
                    "label": CN_LABELS[raw_label],
                    "confidence": confidence,
                    "bbox": bbox,
                    "coords": bbox,
                    "coords_norm": self._norm_bbox(bbox, frame_size),
                    "frame_size": frame_size,
                    "target_type": raw_label,
                }
            )

        detections.sort(
            key=lambda item: (
                0 if item["raw_label"] == "flame" else 1 if item["raw_label"] == "ember" else 2,
                -item["confidence"],
            )
        )

        risk_level, message, alarm = self._risk_level(
            detections=detections,
            post_hot_work=post_hot_work,
            minutes_since_end=float(minutes_since_end) if minutes_since_end is not None else None,
        )

        return {
            "success": True,
            "alarm": alarm,
            "alarm_type": "fire",
            "algo_type": "fire",
            "risk_level": risk_level,
            "message": message,
            "detections": detections,
            "results": detections,
            "boxes": detections,
            "target_count": len(detections),
            "spark_count": sum(1 for d in detections if d["raw_label"] == "spark"),
            "flame_count": sum(1 for d in detections if d["raw_label"] == "flame"),
            "ember_count": sum(1 for d in detections if d["raw_label"] == "ember"),
            "post_hot_work": post_hot_work,
            "minutes_since_end": minutes_since_end,
            "model_path": str(self.model_path),
            "elapsed_ms": round((time.time() - started) * 1000, 2),
        }


_DETECTOR: ResidualFireDetector | None = None


def get_detector(**kwargs) -> ResidualFireDetector:
    global _DETECTOR
    model_path = kwargs.get("model_path")
    if _DETECTOR is None or (model_path and Path(model_path) != _DETECTOR.model_path):
        _DETECTOR = ResidualFireDetector(
            model_path=model_path,
            conf=kwargs.get("conf", kwargs.get("confidence", 0.20)),
            iou=kwargs.get("iou", 0.55),
            device=kwargs.get("device", None),
            imgsz=kwargs.get("imgsz", 640),
        )
    return _DETECTOR


def detect(frame: Any, **kwargs) -> dict[str, Any]:
    return get_detector(**kwargs).detect(frame, **kwargs)


def detect_residual_fire(frame: Any, **kwargs) -> dict[str, Any]:
    return detect(frame, **kwargs)


def detect_after_fire(frame: Any, **kwargs) -> dict[str, Any]:
    return detect(frame, **kwargs)


def run(frame: Any, **kwargs) -> dict[str, Any]:
    return detect(frame, **kwargs)


def analyze(frame: Any, **kwargs) -> dict[str, Any]:
    return detect(frame, **kwargs)


@ai_rule("fire", "余火检测")
def detect_fire_alarm(service, frame, device_id=None):
    return legacy_alarm_detect(service, "fire", frame, device_id=device_id)


@ai_rule("residual_fire", "余火检测（兼容别名）")
def detect_residual_fire_alarm(service, frame, device_id=None):
    return legacy_alarm_detect(service, "fire", frame, device_id=device_id)
