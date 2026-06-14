from datetime import datetime

from app.core.database import get_mongo_collection


ALL_PERMISSIONS = [
    "dashboard.view",
    "monitor.playback", "monitor.track", "monitor.voice", "monitor.camera",
    "fence.view", "fence.create", "fence.edit", "fence.delete",
    "device.view", "device.create", "device.edit", "device.delete",
    "personnel.view", "personnel.create", "personnel.edit", "personnel.delete",
    "alarm.view", "alarm.handle",
    "system.role", "system.log",
]

DEFAULT_ROLE_PERMISSIONS = {
    "headquarters_admin": list(ALL_PERMISSIONS),
    "branch_admin": list(ALL_PERMISSIONS),
    "project_safety_admin": list(ALL_PERMISSIONS),
    "grid_admin": list(ALL_PERMISSIONS),
    "team_admin": list(ALL_PERMISSIONS),
}

ROLE_NAMES = {
    "headquarters_admin": "总部管理员",
    "branch_admin": "分公司管理员",
    "project_safety_admin": "项目管理员",
    "grid_admin": "网格管理员",
    "team_admin": "工队管理员",
}


def get_role_permission_collection():
    return get_mongo_collection("role_permissions")


def get_permissions_for_level(level: str | None) -> list[str]:
    permission_level = level or "project_safety_admin"
    doc = get_role_permission_collection().find_one({"level": permission_level}, {"_id": 0})
    if doc and isinstance(doc.get("permissions"), list):
        permissions = [str(item) for item in doc["permissions"]]
    else:
        permissions = list(DEFAULT_ROLE_PERMISSIONS.get(permission_level, []))
    return list(dict.fromkeys(permissions))


def list_role_permissions() -> list[dict]:
    collection = get_role_permission_collection()
    result = []
    for level, defaults in DEFAULT_ROLE_PERMISSIONS.items():
        doc = collection.find_one({"level": level}, {"_id": 0}) or {}
        permissions = doc.get("permissions") if isinstance(doc.get("permissions"), list) else defaults
        result.append({
            "level": level,
            "name": ROLE_NAMES.get(level, level),
            "permissions": list(dict.fromkeys(list(permissions))),
        })
    return result


def save_role_permissions(level: str, permissions: list[str]) -> dict:
    if level not in DEFAULT_ROLE_PERMISSIONS:
        raise ValueError("Unknown permission level")
    clean_permissions = list(dict.fromkeys([str(item) for item in permissions if item]))
    doc = {
        "level": level,
        "name": ROLE_NAMES.get(level, level),
        "permissions": clean_permissions,
        "updated_at": datetime.now(),
    }
    get_role_permission_collection().update_one(
        {"level": level},
        {"$set": doc, "$setOnInsert": {"created_at": datetime.now()}},
        upsert=True,
    )
    return doc
