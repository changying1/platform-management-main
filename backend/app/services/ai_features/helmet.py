from __future__ import annotations

from typing import Any

from ._runtime_entry import legacy_alarm_detect, runtime_detect
from .registry import ai_rule


def detect(frame: Any, **kwargs) -> dict:
    return runtime_detect("helmet", frame, **kwargs)


def detect_helmet(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def run(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def analyze(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


@ai_rule("helmet", "安全帽检测")
def detect_safety_helmet(service, frame, device_id=None):
    return legacy_alarm_detect(service, "helmet", frame, device_id=device_id)
