from __future__ import annotations

from typing import Any

from ._runtime_entry import legacy_alarm_detect, runtime_detect
from .registry import ai_rule


def detect(frame: Any, **kwargs) -> dict:
    return runtime_detect("fire", frame, **kwargs)


def detect_fire(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def run(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def analyze(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


@ai_rule("fire", "火焰检测")
def detect_fire_alarm(service, frame, device_id=None):
    return legacy_alarm_detect(service, "fire", frame, device_id=device_id)
