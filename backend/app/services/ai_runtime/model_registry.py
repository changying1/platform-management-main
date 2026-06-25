from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Mapping, Optional


@dataclass(frozen=True)
class ModelConfig:
    algorithm_code: str
    algorithm_name: str
    model_name: str
    model_type: str = "auto"
    class_map: Mapping[int, str] | None = None
    alarm_labels: frozenset[str] | None = None
    allowed_labels: frozenset[str] | None = None
    ignored_labels: frozenset[str] | None = None
    label_alias_map: Mapping[str, str] | None = None
    bbox_filter: Mapping[str, object] | None = None
    enabled: bool = True
    disabled_reason: str = ""
    confidence: float = 0.25
    iou: float = 0.45
    input_size: int = 640


_MODELS_DIR = Path(__file__).resolve().parents[1] / "yolo_models"


MODEL_REGISTRY: Dict[str, ModelConfig] = {
    "helmet": ModelConfig(
        algorithm_code="helmet",
        algorithm_name="安全帽检测",
        model_name="helmet",
        class_map={0: "head", 1: "safehat"},
        alarm_labels=frozenset({"no_helmet"}),
        allowed_labels=frozenset({"head", "safehat", "no_helmet", "helmet"}),
        label_alias_map={"head": "no_helmet", "safehat": "helmet"},
        bbox_filter={
            "labels": frozenset({"head", "no_helmet"}),
            "min_width": 12,
            "min_height": 12,
            "min_area_ratio": 0.00025,
            "edge_margin_ratio": 0.02,
            "edge_min_area_ratio": 0.0012,
            "min_aspect_ratio": 0.25,
            "max_aspect_ratio": 4.0,
        },
        confidence=0.5,
    ),
    "person": ModelConfig(
        algorithm_code="person",
        algorithm_name="人员检测",
        model_name="person",
        class_map={0: "person"},
        alarm_labels=frozenset({"person"}),
        allowed_labels=frozenset({"person"}),
    ),
    "smoking": ModelConfig(
        algorithm_code="smoking",
        algorithm_name="吸烟检测",
        model_name="smoking",
        class_map={0: "cigarettes", 1: "smoking"},
        alarm_labels=frozenset({"smoking"}),
        allowed_labels=frozenset({"smoking"}),
        confidence=0.5,
    ),
    "fire": ModelConfig(
        algorithm_code="fire",
        algorithm_name="烟火检测",
        model_name="fire",
        class_map={0: "火", 1: "烟"},
        alarm_labels=frozenset({"fire", "smoke"}),
        allowed_labels=frozenset({"火", "烟", "fire", "flame", "smoke"}),
        label_alias_map={"火": "fire", "flame": "fire", "烟": "smoke"},
    ),
    "vest": ModelConfig(
        algorithm_code="vest",
        algorithm_name="反光衣检测",
        model_name="vest",
        class_map={0: "reflection", 1: "clothes"},
        alarm_labels=frozenset({"no_vest"}),
        allowed_labels=frozenset({"reflection", "clothes", "reflective_vest", "no_vest"}),
        label_alias_map={"reflection": "reflective_vest", "clothes": "no_vest"},
        bbox_filter={
            "labels": frozenset({"clothes", "no_vest"}),
            "min_width": 18,
            "min_height": 24,
            "min_area_ratio": 0.0008,
            "edge_margin_ratio": 0.02,
            "edge_min_area_ratio": 0.0025,
            "min_aspect_ratio": 0.2,
            "max_aspect_ratio": 3.2,
        },
        confidence=0.5,
    ),
    "face": ModelConfig(
        algorithm_code="face",
        algorithm_name="人脸检测",
        model_name="face",
        model_type="onnx",
        class_map={0: "face"},
        alarm_labels=frozenset({"face"}),
        allowed_labels=frozenset({"face"}),
        enabled=True,
    ),
    "phone": ModelConfig(
        algorithm_code="phone",
        algorithm_name="打电话检测",
        model_name="phone",
        model_type="pt",
        class_map={0: "phone", 1: "face"},
        alarm_labels=frozenset({"phone"}),
        allowed_labels=frozenset({"phone"}),
    ),
}


def get_models_dir() -> Path:
    return _MODELS_DIR


def list_model_configs() -> Dict[str, ModelConfig]:
    return dict(MODEL_REGISTRY)


def get_model_config(algorithm_code: str) -> Optional[ModelConfig]:
    return MODEL_REGISTRY.get((algorithm_code or "").strip())


def resolve_model_path(config: ModelConfig) -> tuple[Optional[Path], str, Optional[str]]:
    model_type = (config.model_type or "auto").lower()
    if not config.enabled:
        return None, model_type, config.disabled_reason or "disabled"

    if model_type == "auto":
        for suffix, detected_type in ((".pt", "pt"), (".onnx", "onnx")):
            candidate = _MODELS_DIR / f"{config.model_name}{suffix}"
            if candidate.exists():
                return candidate, detected_type, None
        expected = f"{_MODELS_DIR / (config.model_name + '.pt')} or {_MODELS_DIR / (config.model_name + '.onnx')}"
        return None, "auto", f"model file does not exist: {expected}"

    if model_type not in {"pt", "onnx"}:
        return None, model_type, f"unsupported model type: {model_type}"

    candidate = _MODELS_DIR / f"{config.model_name}.{model_type}"
    if not candidate.exists():
        return None, model_type, f"model file does not exist: {candidate}"

    return candidate, model_type, None


def label_for_class(config: ModelConfig, class_id: int, fallback: object = None) -> str:
    if config.class_map and class_id in config.class_map:
        return str(config.class_map[class_id])
    if fallback is not None:
        return str(fallback)
    return str(class_id)


def mapped_label_for(config: ModelConfig, label: str) -> str:
    raw = str(label or "").strip()
    if not raw:
        return raw
    if config.label_alias_map and raw in config.label_alias_map:
        return str(config.label_alias_map[raw])
    return raw


def is_alarm_label(config: ModelConfig, label: str) -> bool:
    if not config.alarm_labels:
        return False
    return mapped_label_for(config, label) in config.alarm_labels


def iter_algorithm_codes() -> Iterable[str]:
    return MODEL_REGISTRY.keys()
