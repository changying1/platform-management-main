from __future__ import annotations

from datetime import date, datetime
from typing import Any

from bson import ObjectId

from app.core.database import get_mongo_collection
from app.schemas.log_schema import LogCreate
from app.services.log_service import LogService
from app.utils.config_manager import get_log_audit_enabled
from app.utils.logger import get_logger


IGNORED_CHANGE_FIELDS = {"_id", "created_at", "updated_at", "createdAt", "updatedAt", "lastUpdate", "trajectory"}
logger = get_logger("AuditLogService")

FIELD_LABELS = {
    "permissions": "权限列表",
    "name": "名称",
    "status": "状态",
    "company": "所属公司",
    "branch_id": "所属公司",
    "branch_name": "所属公司",
    "project": "所属项目",
    "project_id": "所属项目",
    "project_name": "所属项目",
    "parent_id": "上级单位",
    "parent_name": "上级单位",
    "grid": "所属网格",
    "grid_id": "所属网格",
    "grid_name": "所属网格",
    "team": "所属工队",
    "team_id": "所属工队",
    "team_name": "所属工队",
    "description": "描述",
    "level": "层级",
    "area": "面积",
    "bounds_json": "边界范围",
    "device_name": "设备名称",
    "device_id": "设备ID",
    "device_serial": "设备序列号",
    "serial_number": "序列号",
    "device_type": "设备类型",
    "ip_address": "IP地址",
    "stream_url": "视频流地址",
    "rtsp_url": "RTSP地址",
}

RELATION_NAME_FIELDS = {
    "branch_id": ("company", "branch_name", "branch", "department"),
    "project_id": ("project", "project_name", "projectName"),
    "parent_id": ("parent_name", "parent", "parent_unit_name", "parentUnitName", "parent_grid_name", "parentGridName"),
    "grid_id": ("grid", "grid_name", "gridName", "name"),
    "team_id": ("team", "team_name", "teamName", "workTeam", "work_team"),
}

PROJECT_COLLECTIONS = ("project", "projects", "sql_projects")
UNIT_COLLECTIONS = ("responsibility_unit", "branch", "branches", "sql_branches", "grid", "team")


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


def _empty_display(value: Any) -> bool:
    return value is None or value == ""


def _text(value: Any) -> str:
    return str(value or "").strip()


def _snapshot_name(snapshot: dict | None, fields: tuple[str, ...]) -> str:
    if not isinstance(snapshot, dict):
        return ""
    for field in fields:
        value = snapshot.get(field)
        if _text(value):
            return _text(value)
    return ""


def _lookup_values(value: Any) -> list[Any]:
    raw = _text(value)
    if not raw:
        return []
    values: list[Any] = [raw]
    if raw.startswith("PRJ-"):
        values.append(raw.removeprefix("PRJ-"))
    if raw.startswith("GRID-"):
        values.append(raw.removeprefix("GRID-"))
    for item in list(values):
        if str(item).isdigit():
            values.append(int(item))
    return list(dict.fromkeys(values))


def _lookup_object_ids(value: Any) -> list[ObjectId]:
    raw = _text(value)
    candidates = [raw]
    if raw.startswith("PRJ-") or raw.startswith("GRID-"):
        candidates.append(raw.split("-", 1)[1])
    return [ObjectId(item) for item in candidates if ObjectId.is_valid(item)]


def _find_doc_name(collection_name: str, query: dict, name_fields: tuple[str, ...]) -> str:
    try:
        doc = get_mongo_collection(collection_name).find_one(query)
    except Exception:
        return ""
    if not doc:
        return ""
    for field in name_fields:
        name = _text(doc.get(field))
        if name:
            return name
    return ""


def _lookup_project_name(value: Any) -> str:
    values = _lookup_values(value)
    if not values:
        return ""
    query = {
        "$or": [
            {"id": {"$in": values}},
            {"project_id": {"$in": values}},
            {"unit_id": {"$in": values}},
            {"name": {"$in": [str(item) for item in values]}},
            {"project_name": {"$in": [str(item) for item in values]}},
        ]
    }
    object_ids = _lookup_object_ids(value)
    if object_ids:
        query["$or"].append({"_id": {"$in": object_ids}})
    for collection_name in PROJECT_COLLECTIONS:
        name = _find_doc_name(collection_name, query, ("name", "project_name", "title"))
        if name:
            return name
    return ""


def _lookup_unit_name(value: Any) -> str:
    values = _lookup_values(value)
    if not values:
        return ""
    string_values = [str(item) for item in values]
    query = {
        "$or": [
            {"unit_id": {"$in": values}},
            {"id": {"$in": values}},
            {"project_id": {"$in": values}},
            {"grid_id": {"$in": values}},
            {"team_id": {"$in": values}},
            {"name": {"$in": string_values}},
            {"project_name": {"$in": string_values}},
            {"team_name": {"$in": string_values}},
        ]
    }
    object_ids = _lookup_object_ids(value)
    if object_ids:
        query["$or"].append({"_id": {"$in": object_ids}})
    for collection_name in UNIT_COLLECTIONS:
        name = _find_doc_name(collection_name, query, ("name", "project_name", "team_name"))
        if name:
            return name
    return _lookup_project_name(value)


def _lookup_relation_value_name(field: str, value: Any) -> str:
    if field == "project_id":
        return _lookup_project_name(value)
    if field in {"parent_id", "branch_id", "grid_id", "team_id"}:
        return _lookup_unit_name(value)
    return ""


def _change_value_display(field: str, value: Any, snapshot: dict | None) -> str:
    if _empty_display(value):
        return "-"
    name_fields = RELATION_NAME_FIELDS.get(field)
    if name_fields:
        name = _snapshot_name(snapshot, name_fields)
        if name:
            return name
        name = _lookup_relation_value_name(field, value)
        if name:
            return name
    if isinstance(value, list):
        return "、".join(str(item) for item in value) if value else "-"
    if isinstance(value, dict):
        return str(serialize_audit_value(value))
    return str(value)


def changes_summary(
    changes: dict[str, dict[str, Any]],
    before: dict | None = None,
    after: dict | None = None,
) -> str:
    if not changes:
        return "无字段变化"
    parts = []
    for field, item in changes.items():
        label = FIELD_LABELS.get(field, field)
        old_value = _change_value_display(field, item.get("old"), before)
        new_value = _change_value_display(field, item.get("new"), after)
        parts.append(f"{label}: {old_value} -> {new_value}")
    return "；".join(parts)


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
        if not get_log_audit_enabled():
            return
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
                details=details or changes_summary(changes, before, after),
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
