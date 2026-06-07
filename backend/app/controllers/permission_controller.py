from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.database import get_mongo_collection
from app.core.data_scope import in_scope
from app.core.security import get_current_user
from app.services.audit_log_service import write_audit_log
from app.services.permission_service import list_role_permissions, save_role_permissions

router = APIRouter(prefix="/api/permissions", tags=["Permissions"])

ROLE_RANK = {
    "team_admin": 1,
    "grid_admin": 2,
    "project_safety_admin": 3,
    "branch_admin": 4,
    "headquarters_admin": 5,
}


class RolePermissionUpdate(BaseModel):
    permissions: list[str]


def _normalize_account(doc: dict) -> dict:
    permission_level = doc.get("permission_level") or (
        "headquarters_admin"
        if str(doc.get("role") or "").upper() in {"HQ", "ADMIN"}
        else "project_safety_admin"
    )
    return {
        "id": str(doc.get("id") or doc.get("username") or doc.get("personnel_id") or ""),
        "username": doc.get("username") or "",
        "name": doc.get("full_name") or doc.get("username") or "",
        "role": str(doc.get("role") or "").upper(),
        "level": permission_level,
        "company": doc.get("company") or doc.get("department") or "",
        "project": doc.get("project") or "",
        "team": doc.get("team") or doc.get("work_team") or "",
        "department_id": doc.get("department_id"),
        "personnel_id": doc.get("personnel_id"),
        "status": doc.get("status") or "active",
        "description": doc.get("department") or doc.get("company") or doc.get("project") or "",
    }


def _account_visible(account_doc: dict, current_user: dict) -> bool:
    if str(account_doc.get("username") or "") == str(current_user.get("username") or ""):
        return True
    current_level = current_user.get("permission_level") or "headquarters_admin"
    current_rank = ROLE_RANK.get(current_level, 0)
    target_level = account_doc.get("permission_level") or (
        "headquarters_admin"
        if str(account_doc.get("role") or "").upper() in {"HQ", "ADMIN"}
        else "project_safety_admin"
    )
    if ROLE_RANK.get(target_level, 0) > current_rank:
        return False
    return in_scope(
        account_doc,
        current_user,
        project_fields=("project_id",),
        grid_fields=("grid_id", "grid_ids"),
        team_fields=("team_id",),
        branch_fields=("branch_id", "department_id"),
        company_fields=("company", "department"),
        project_name_fields=("project",),
        team_name_fields=("team", "work_team"),
    )


@router.get("/roles")
def get_roles(current_user: dict = Depends(get_current_user)):
    current_level = current_user.get("permission_level") or "headquarters_admin"
    current_rank = ROLE_RANK.get(current_level, 0)
    roles = list_role_permissions()
    return [
        item
        for item in roles
        if ROLE_RANK.get(item.get("level"), 0) <= current_rank
    ]


@router.get("/accounts")
def get_permission_accounts(current_user: dict = Depends(get_current_user)):
    current_level = current_user.get("permission_level") or "headquarters_admin"
    current_rank = ROLE_RANK.get(current_level, 0)
    current_department_id = current_user.get("department_id")

    query = {
        "permission_level": {"$in": list(ROLE_RANK.keys())},
        "status": {"$nin": ["inactive", "disabled", "deleted"]},
    }
    docs = list(get_mongo_collection("users").find(query, {"_id": 0}).sort("id", 1))
    docs = [doc for doc in docs if _account_visible(doc, current_user)]
    accounts = [_normalize_account(doc) for doc in docs]

    visible_accounts = []
    for account in accounts:
        if ROLE_RANK.get(account.get("level"), 0) > current_rank:
            continue
        if current_department_id not in (None, 0):
            account_department_id = account.get("department_id")
            if account_department_id not in (None, "", current_department_id, str(current_department_id)):
                continue
        visible_accounts.append(account)
    return visible_accounts


@router.put("/roles/{level}")
def update_role_permissions(
    level: str,
    payload: RolePermissionUpdate,
    current_user: dict = Depends(get_current_user),
):
    current_level = current_user.get("permission_level") or "headquarters_admin"
    current_rank = ROLE_RANK.get(current_level, 0)
    target_rank = ROLE_RANK.get(level, 0)
    if target_rank == 0:
        raise HTTPException(status_code=400, detail="unknown permission level")
    if current_rank < target_rank:
        raise HTTPException(status_code=403, detail="cannot assign a higher permission level")
    try:
        before = next((item for item in list_role_permissions() if item.get("level") == level), None)
        updated = save_role_permissions(level, payload.permissions)
        write_audit_log(
            current_user=current_user,
            action="修改角色权限",
            target_type="permission",
            target_name=updated.get("name") or level,
            before=before,
            after=updated,
            extra={
                "granted": sorted(set(updated.get("permissions", [])) - set((before or {}).get("permissions", []))),
                "revoked": sorted(set((before or {}).get("permissions", [])) - set(updated.get("permissions", []))),
            },
        )
        return updated
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
