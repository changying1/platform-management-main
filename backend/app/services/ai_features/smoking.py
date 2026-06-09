from __future__ import annotations

from typing import Any

from ._runtime_entry import legacy_alarm_detect, runtime_detect
from .registry import ai_rule


def detect(frame: Any, **kwargs) -> dict:
    return runtime_detect("smoking", frame, **kwargs)


def detect_smoke(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def detect_smoking(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def run(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def analyze(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


@ai_rule("smoking", "吸烟检测")
def detect_smoking_alarm(service, frame):
    return legacy_alarm_detect(service, "smoking", frame)
