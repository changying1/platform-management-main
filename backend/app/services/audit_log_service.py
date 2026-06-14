from __future__ import annotations

from datetime import date, datetime
from typing import Any

from bson import ObjectId

from app.schemas.log_schema import LogCreate
from app.services.log_service import LogService
from app.utils.logger import get_logger


IGNORED_CHANGE_FIELDS = {"_id", "created_at", "updated_at", "createdAt", "updatedAt", "lastUpdate", "trajectory"}
logger = get_logger("AuditLogService")


def audit_operator(current_user: dict | None) -> str:
    if not current_user:
        return "unknown"
    return str(
        current_user.get("full_name")
        or current_user.get("username")
        or current_user.get("name")
        or "unknown"
    )


def serialize_audit_value(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [serialize_audit_value(item) for item in value]
    if isinstance(value, dict):
        return {str(k): serialize_audit_value(v) for k, v in value.items()}
    return value


def audit_changes(before: dict | None, after: dict | None, allowed_fields: set[str] | None = None) -> dict[str, dict[str, Any]]:
    before = before or {}
    after = after or {}
    keys = set(before.keys()) | set(after.keys())
    if allowed_fields is not None:
        keys &= allowed_fields
    keys -= IGNORED_CHANGE_FIELDS

    changes: dict[str, dict[str, Any]] = {}
    for key in sorted(keys):
        old = serialize_audit_value(before.get(key))
        new = serialize_audit_value(after.get(key))
        if old != new:
            changes[key] = {"old": old, "new": new}
    return changes


def changes_summary(changes: dict[str, dict[str, Any]]) -> str:
    if not changes:
        return "无字段变化"
    return "；".join(f"{field}: {item.get('old', '')} -> {item.get('new', '')}" for field, item in changes.items())


def write_audit_log(
    *,
    current_user: dict | None,
    action: str,
    target_type: str,
    target_name: str,
    before: dict | None = None,
    after: dict | None = None,
    details: str | None = None,
    extra: dict[str, Any] | None = None,
    company: str | None = None,
    project: str | None = None,
    grid: str | None = None,
    team: str | None = None,
    level: str = "info",
    allowed_fields: set[str] | None = None,
) -> None:
    try:
        changes = audit_changes(before, after, allowed_fields)
        payload = {
            "changes": changes,
            "before": serialize_audit_value(before) if before else None,
            "after": serialize_audit_value(after) if after else None,
            **(extra or {}),
        }
        LogService().create_log(
            None,
            LogCreate(
                operator=audit_operator(current_user),
                action=action,
                target_type=target_type,
                target_name=target_name or "unknown",
                details=details or changes_summary(changes),
                level=level,
                company=company,
                project=project,
                grid=grid,
                team=team,
                extra=payload,
            ),
        )
    except Exception as exc:
        logger.error(f"Failed to write audit log for {target_type}/{target_name}: {exc}")
