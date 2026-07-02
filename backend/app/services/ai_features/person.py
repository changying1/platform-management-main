from __future__ import annotations

from typing import Any

from ._runtime_entry import legacy_alarm_detect, runtime_detect
from .registry import ai_rule


def detect(frame: Any, **kwargs) -> dict:
    return runtime_detect("person", frame, **kwargs)


def detect_person(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def run(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


def analyze(frame: Any, **kwargs) -> dict:
    return detect(frame, **kwargs)


@ai_rule("person", "人员检测")
def detect_person_alarm(service, frame, device_id=None):
    return legacy_alarm_detect(service, "person", frame, device_id=device_id)
