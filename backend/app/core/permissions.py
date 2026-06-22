from fastapi import HTTPException

from app.services.permission_service import get_permissions_for_level


def user_permissions(user: dict | None) -> list[str]:
    if not user:
        return []
    permissions = user.get("permissions")
    if isinstance(permissions, list):
        return [str(item) for item in permissions]
    return get_permissions_for_level(user.get("permission_level"))


def require_permission(current_user: dict, code: str):
    if code not in user_permissions(current_user):
        raise HTTPException(status_code=403, detail=f"缺少权限：{code}")
