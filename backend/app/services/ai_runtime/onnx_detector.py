from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .model_registry import ModelConfig, label_for_class


class OnnxDetector:
    def __init__(self, model_path: Path, config: ModelConfig):
        self.model_path = Path(model_path)
        self.config = config
        self._session = None
        self._input_name = None

    def _load(self):
        if self._session is not None:
            return self._session

        if not self.model_path.exists():
            raise FileNotFoundError(f"模型文件不存在: {self.model_path}")

        try:
            import onnxruntime as ort
        except Exception as exc:
            raise RuntimeError(f"onnxruntime 未安装或加载失败: {exc}") from exc

        self._session = ort.InferenceSession(str(self.model_path), providers=["CPUExecutionProvider"])
        self._input_name = self._session.get_inputs()[0].name
        return self._session

    def detect(self, frame: Any, **kwargs) -> list[dict]:
        session = self._load()
        image = load_image(frame)
        input_tensor, ratio, pad = letterbox_preprocess(image, int(kwargs.get("input_size", self.config.input_size)))
        outputs = session.run(None, {self._input_name: input_tensor})
        return postprocess(
            outputs,
            image.shape[:2],
            ratio,
            pad,
            self.config,
            float(kwargs.get("conf", kwargs.get("confidence", self.config.confidence))),
            float(kwargs.get("iou", self.config.iou)),
        )


def load_image(source: Any) -> np.ndarray:
    if isinstance(source, np.ndarray):
        return source
    if isinstance(source, (str, Path)):
        image = cv2.imread(str(source))
        if image is None:
            raise ValueError(f"图片读取失败: {source}")
        return image
    raise TypeError("推理输入必须是 OpenCV frame(numpy.ndarray) 或图片路径")


def letterbox_preprocess(image: np.ndarray, input_size: int) -> tuple[np.ndarray, float, tuple[float, float]]:
    height, width = image.shape[:2]
    ratio = min(input_size / height, input_size / width)
    new_width, new_height = int(round(width * ratio)), int(round(height * ratio))
    resized = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_LINEAR)

    pad_w = (input_size - new_width) / 2
    pad_h = (input_size - new_height) / 2
    top, bottom = int(round(pad_h - 0.1)), int(round(pad_h + 0.1))
    left, right = int(round(pad_w - 0.1)), int(round(pad_w + 0.1))
    padded = cv2.copyMakeBorder(resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114))

    blob = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)
    blob = np.ascontiguousarray(blob, dtype=np.float32) / 255.0
    return blob[None], ratio, (left, top)


def postprocess(
    outputs: list[np.ndarray],
    image_shape: tuple[int, int],
    ratio: float,
    pad: tuple[float, float],
    config: ModelConfig,
    conf_threshold: float,
    iou_threshold: float,
) -> list[dict]:
    predictions = np.asarray(outputs[0])
    predictions = np.squeeze(predictions)
    if predictions.ndim == 1:
        predictions = predictions[None, :]
    if predictions.shape[0] < predictions.shape[1] and predictions.shape[0] in {5, 6, 7, 84, 85}:
        predictions = predictions.T

    boxes, scores, class_ids = [], [], []
    for pred in predictions:
        # 兼容 YOLOv8 格式的单类模型，每个预测向量最少包含 5 个元素 (x, y, w, h, score)
        if pred.shape[0] < 5:
            continue

        obj_conf = float(pred[4])
        class_scores = pred[5:]
        if class_scores.size:
            class_id = int(np.argmax(class_scores))
            score = obj_conf * float(class_scores[class_id]) if obj_conf <= 1.0 else float(class_scores[class_id])
        else:
            class_id = int(pred[5]) if pred.shape[0] > 5 else 0
            score = obj_conf

        if score < conf_threshold:
            continue

        cx, cy, w, h = [float(v) for v in pred[:4]]
        x1 = cx - w / 2
        y1 = cy - h / 2
        x2 = cx + w / 2
        y2 = cy + h / 2
        x1, y1, x2, y2 = scale_bbox([x1, y1, x2, y2], image_shape, ratio, pad)
        boxes.append([x1, y1, x2 - x1, y2 - y1])
        scores.append(score)
        class_ids.append(class_id)

    keep = cv2.dnn.NMSBoxes(boxes, scores, conf_threshold, iou_threshold)
    if len(keep) == 0:
        return []

    detections = []
    for index in np.array(keep).reshape(-1):
        x, y, w, h = boxes[int(index)]
        class_id = class_ids[int(index)]
        raw_label = label_for_class(config, class_id)
        detections.append(
            {
                "raw_label": raw_label,
                "label": raw_label,
                "confidence": float(scores[int(index)]),
                "bbox": [float(x), float(y), float(x + w), float(y + h)],
                "frame_size": [int(image_shape[1]), int(image_shape[0])],
            }
        )
    return detections


def scale_bbox(
    bbox: list[float],
    image_shape: tuple[int, int],
    ratio: float,
    pad: tuple[float, float],
) -> tuple[float, float, float, float]:
    height, width = image_shape
    pad_w, pad_h = pad
    x1 = (bbox[0] - pad_w) / ratio
    y1 = (bbox[1] - pad_h) / ratio
    x2 = (bbox[2] - pad_w) / ratio
    y2 = (bbox[3] - pad_h) / ratio
    return (
        max(0.0, min(float(width), x1)),
        max(0.0, min(float(height), y1)),
        max(0.0, min(float(width), x2)),
        max(0.0, min(float(height), y2)),
    )
