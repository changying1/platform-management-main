from __future__ import annotations

from typing import Any, Iterable


PPE_GENERIC_CODES = {"ppe_violation", "ppe", "personal_protective_equipment"}

ALARM_LABELS = {
    "no_helmet": "\u672a\u4f69\u6234\u5b89\u5168\u5e3d",
    "nohelmet": "\u672a\u4f69\u6234\u5b89\u5168\u5e3d",
    "helmet_missing": "\u672a\u4f69\u6234\u5b89\u5168\u5e3d",
    "helmetmissing": "\u672a\u4f69\u6234\u5b89\u5168\u5e3d",
    "head": "\u672a\u4f69\u6234\u5b89\u5168\u5e3d",
    "no_safety_helmet": "\u672a\u4f69\u6234\u5b89\u5168\u5e3d",
    "safety_helmet_missing": "\u672a\u4f69\u6234\u5b89\u5168\u5e3d",
    "no_vest": "\u672a\u7a7f\u53cd\u5149\u8863",
    "novest": "\u672a\u7a7f\u53cd\u5149\u8863",
    "vest_missing": "\u672a\u7a7f\u53cd\u5149\u8863",
    "reflective_vest_missing": "\u672a\u7a7f\u53cd\u5149\u8863",
    "reflectivevestmissing": "\u672a\u7a7f\u53cd\u5149\u8863",
    "no_reflective_vest": "\u672a\u7a7f\u53cd\u5149\u8863",
    "no_harness": "\u672a\u7cfb\u5b89\u5168\u5e26",
    "harness_missing": "\u672a\u7cfb\u5b89\u5168\u5e26",
    "safety_harness_missing": "\u672a\u7cfb\u5b89\u5168\u5e26",
    "harness_violation": "\u672a\u6b63\u786e\u4f69\u6234\u5b89\u5168\u5e26",
    "no_gloves": "\u672a\u6234\u9632\u62a4\u624b\u5957",
    "gloves_missing": "\u672a\u6234\u9632\u62a4\u624b\u5957",
    "no_goggles": "\u672a\u6234\u62a4\u76ee\u955c",
    "goggles_missing": "\u672a\u6234\u62a4\u76ee\u955c",
    "mask_missing": "\u672a\u6234\u9632\u62a4\u53e3\u7f69",
    "no_mask": "\u672a\u6234\u9632\u62a4\u53e3\u7f69",
    "smoking": "\u53d1\u73b0\u5438\u70df",
    "smoke": "\u53d1\u73b0\u70df\u96fe",
    "fire": "\u53d1\u73b0\u660e\u706b",
    "flame": "\u53d1\u73b0\u660e\u706b",
    "person_fall": "\u4eba\u5458\u5012\u5730",
    "personfall": "\u4eba\u5458\u5012\u5730",
    "fence_intrusion": "\u7535\u5b50\u56f4\u680f\u95ef\u5165",
    "fence_exit": "\u7535\u5b50\u56f4\u680f\u8d8a\u754c",
    "intrusion": "\u533a\u57df\u95ef\u5165",
}

PPE_DESCRIPTION_HINTS = (
    ("\u53cd\u5149\u8863\u7f3a\u5931", "\u672a\u7a7f\u53cd\u5149\u8863"),
    ("\u672a\u7a7f\u53cd\u5149\u8863", "\u672a\u7a7f\u53cd\u5149\u8863"),
    ("\u672a\u4f69\u6234\u53cd\u5149\u8863", "\u672a\u7a7f\u53cd\u5149\u8863"),
    ("\u5b89\u5168\u5e3d\u7f3a\u5931", "\u672a\u4f69\u6234\u5b89\u5168\u5e3d"),
    ("\u672a\u6234\u5b89\u5168\u5e3d", "\u672a\u4f69\u6234\u5b89\u5168\u5e3d"),
    ("\u672a\u4f69\u6234\u5b89\u5168\u5e3d", "\u672a\u4f69\u6234\u5b89\u5168\u5e3d"),
    ("\u5b89\u5168\u5e26\u7f3a\u5931", "\u672a\u7cfb\u5b89\u5168\u5e26"),
    ("\u672a\u7cfb\u5b89\u5168\u5e26", "\u672a\u7cfb\u5b89\u5168\u5e26"),
    ("\u672a\u4f69\u6234\u5b89\u5168\u5e26", "\u672a\u6b63\u786e\u4f69\u6234\u5b89\u5168\u5e26"),
)


def normalize_alarm_code(value: Any) -> str:
    return (
        str(value or "")
        .strip()
        .strip("[]")
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )


def _append_unique(items: list[str], value: str) -> None:
    value = str(value or "").strip()
    if value and value not in items:
        items.append(value)


def _iter_alarm_boxes(alarm: dict) -> Iterable[dict]:
    candidates = [
        alarm.get("alarm_boxes"),
        alarm.get("boxes"),
        (alarm.get("details") or {}).get("alarm_boxes") if isinstance(alarm.get("details"), dict) else None,
        (alarm.get("details") or {}).get("boxes") if isinstance(alarm.get("details"), dict) else None,
    ]
    for boxes in candidates:
        if isinstance(boxes, list):
            for box in boxes:
                if isinstance(box, dict):
                    yield box


def ppe_detail_labels(alarm: dict) -> list[str]:
    labels: list[str] = []
    for box in _iter_alarm_boxes(alarm):
        for field in ("type", "label", "raw_label", "class", "name"):
            code = normalize_alarm_code(box.get(field))
            if code in PPE_GENERIC_CODES:
                continue
            mapped = ALARM_LABELS.get(code) or ALARM_LABELS.get(code.replace("_", ""))
            if mapped:
                _append_unique(labels, mapped)
                break

    text = " ".join(
        str(alarm.get(field) or "")
        for field in ("description", "message", "msg", "alarm_content", "behavior")
    )
    for hint, label in PPE_DESCRIPTION_HINTS:
        if hint in text:
            _append_unique(labels, label)
    return labels


def alarm_display_type(alarm: dict) -> str:
    raw_type = alarm.get("alarm_type") or alarm.get("behavior_code") or alarm.get("event_type") or alarm.get("type") or ""
    code = normalize_alarm_code(raw_type)
    if code in PPE_GENERIC_CODES:
        details = ppe_detail_labels(alarm)
        if details:
            return "\u3001".join(details)
        return "\u9632\u62a4\u7528\u54c1\u7a7f\u6234\u5f02\u5e38"
    return ALARM_LABELS.get(code) or ALARM_LABELS.get(code.replace("_", "")) or raw_type
