from __future__ import annotations

import logging
from typing import Any, Iterable, Mapping

from .model_registry import ModelConfig, mapped_label_for


logger = logging.getLogger(__name__)


def _clean_bbox(bbox: Iterable[Any]) -> list[float]:
    values = list(bbox or [])[:4]
    while len(values) < 4:
        values.append(0)
    return [float(v) for v in values]


def _clean_frame_size(frame_size: Any) -> list[float] | None:
    values = list(frame_size or [])[:2]
    if len(values) < 2:
        return None
    width = float(values[0] or 0)
    height = float(values[1] or 0)
    if width <= 0 or height <= 0:
        return None
    return [width, height]


def _label_allowed(config: ModelConfig, raw_label: str, mapped_label: str) -> bool:
    labels = {raw_label, mapped_label}
    if config.ignored_labels and labels.intersection(config.ignored_labels):
        return False
    if config.allowed_labels and not labels.intersection(config.allowed_labels):
        return False
    return True


def _bbox_filtered_reason(
    config: ModelConfig,
    raw_label: str,
    mapped_label: str,
    bbox: list[float],
    frame_size: list[float] | None,
) -> str | None:
    rule = config.bbox_filter or {}
    if not rule:
        return None

    labels = set(rule.get("labels") or ())
    if labels and raw_label not in labels and mapped_label not in labels:
        return None

    x1, y1, x2, y2 = bbox
    width = max(0.0, x2 - x1)
    height = max(0.0, y2 - y1)
    if width < float(rule.get("min_width", 0) or 0):
        return "bbox_too_narrow"
    if height < float(rule.get("min_height", 0) or 0):
        return "bbox_too_short"

    aspect_ratio = width / height if height > 0 else 0.0
    min_aspect_ratio = float(rule.get("min_aspect_ratio", 0) or 0)
    max_aspect_ratio = float(rule.get("max_aspect_ratio", 0) or 0)
    if min_aspect_ratio and aspect_ratio < min_aspect_ratio:
        return "bbox_aspect_ratio_too_small"
    if max_aspect_ratio and aspect_ratio > max_aspect_ratio:
        return "bbox_aspect_ratio_too_large"

    if not frame_size:
        return None

    frame_width, frame_height = frame_size
    frame_area = frame_width * frame_height
    if frame_area <= 0:
        return None

    area_ratio = (width * height) / frame_area
    min_area_ratio = float(rule.get("min_area_ratio", 0) or 0)
    if min_area_ratio and area_ratio < min_area_ratio:
        return "bbox_area_too_small"

    edge_margin_ratio = float(rule.get("edge_margin_ratio", 0) or 0)
    edge_min_area_ratio = float(rule.get("edge_min_area_ratio", 0) or 0)
    if edge_margin_ratio and edge_min_area_ratio:
        margin_x = frame_width * edge_margin_ratio
        margin_y = frame_height * edge_margin_ratio
        near_edge = (
            x1 <= margin_x
            or y1 <= margin_y
            or x2 >= frame_width - margin_x
            or y2 >= frame_height - margin_y
        )
        if near_edge and area_ratio < edge_min_area_ratio:
            return "edge_bbox_area_too_small"

    return None


def normalize_detection(item: Mapping[str, Any], config: ModelConfig | None = None) -> dict | None:
    raw_label = str(item.get("raw_label", item.get("label", ""))).strip()
    mapped_label = mapped_label_for(config, raw_label) if config else raw_label
    confidence = float(item.get("confidence", item.get("conf", 0.0)) or 0.0)
    bbox = _clean_bbox(item.get("bbox", item.get("coords", [])))
    frame_size = _clean_frame_size(item.get("frame_size"))

    if config and not _label_allowed(config, raw_label, mapped_label):
        logger.debug(
            "[AI][%s] ignored detection raw_label=%s mapped_label=%s confidence=%.4f bbox=%s frame_size=%s filtered_reason=%s",
            config.algorithm_code,
            raw_label,
            mapped_label,
            confidence,
            bbox,
            frame_size,
            "label_not_allowed",
        )
        return None

    if config:
        filtered_reason = _bbox_filtered_reason(config, raw_label, mapped_label, bbox, frame_size)
        if filtered_reason:
            logger.debug(
                "[AI][%s] filtered detection raw_label=%s mapped_label=%s confidence=%.4f bbox=%s frame_size=%s filtered_reason=%s",
                config.algorithm_code,
                raw_label,
                mapped_label,
                confidence,
                bbox,
                frame_size,
                filtered_reason,
            )
            return None

    if config and raw_label != mapped_label:
        logger.debug(
            "[AI][%s] label mapped raw_label=%s mapped_label=%s",
            config.algorithm_code,
            raw_label,
            mapped_label,
        )

    return {
        "raw_label": raw_label,
        "label": mapped_label,
        "confidence": confidence,
        "bbox": bbox,
        "frame_size": frame_size,
    }


def success_result(config: ModelConfig, detections: Iterable[Mapping[str, Any]]) -> dict:
    normalized = []
    for item in detections:
        det = normalize_detection(item, config)
        if det is not None:
            normalized.append(det)

    return {
        "success": True,
        "algorithm_code": config.algorithm_code,
        "algorithm_name": config.algorithm_name,
        "detections": normalized,
        "error": None,
    }


def failure_result(config_or_code: ModelConfig | str, error: str) -> dict:
    if isinstance(config_or_code, ModelConfig):
        code = config_or_code.algorithm_code
        name = config_or_code.algorithm_name
    else:
        code = str(config_or_code or "")
        name = ""

    return {
        "success": False,
        "algorithm_code": code,
        "algorithm_name": name,
        "detections": [],
        "error": str(error),
    }


def to_alarm_boxes(result: Mapping[str, Any], alarm_labels: set[str] | frozenset[str] | None = None) -> list[dict]:
    boxes = []
    for det in result.get("detections", []) or []:
        label = str(det.get("label", ""))
        if alarm_labels is not None and label not in alarm_labels:
            continue
        boxes.append(
            {
                "type": label,
                "raw_label": str(det.get("raw_label", label)),
                "label": label,
                "msg": f"{result.get('algorithm_name') or result.get('algorithm_code')}: {label}",
                "score": float(det.get("confidence", 0.0) or 0.0),
                "coords": det.get("bbox", []),
            }
        )
    return boxes
