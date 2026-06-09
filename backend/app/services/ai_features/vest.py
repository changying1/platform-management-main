from __future__ import annotations

from typing import Any

from ._runtime_entry import legacy_alarm_detect, runtime_detect
from .registry import ai_rule


def detect(frame: Any, **kwargs) -> dict:
    return runtime_detect("vest", frame, **kwargs)


def detect_vest(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def run(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def analyze(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


@ai_rule("vest", "反光背心检测")
def detect_vest_alarm(service, frame):
    return legacy_alarm_detect(service, "vest", frame)
