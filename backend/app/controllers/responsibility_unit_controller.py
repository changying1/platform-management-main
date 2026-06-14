from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from app.core.data_scope import in_scope, is_hq, user_level
from app.core.security import get_current_user
from app.schemas.responsibility_unit_schema import (
    ResponsibilityUnitCreate,
    ResponsibilityUnitOut,
    ResponsibilityUnitUpdate,
)
from app.services.Grid.responsibility_unit_service import responsibility_unit_service
from app.services.audit_log_service import write_audit_log

router = APIRouter(prefix="/api/responsibility-units", tags=["Responsibility Unit Management"])


def _require_responsibility_manager(current_user: dict):
    if is_hq(current_user):
        return
    if user_level(current_user) not in {"branch_admin", "project_safety_admin"}:
        raise HTTPException(status_code=403, detail="无权管理责任组织")


def _require_unit_scope(unit: dict | None, current_user: dict):
    if not unit:
        raise HTTPException(status_code=404, detail="责任单元不存在")
    if is_hq(current_user):
        return
    allowed = in_scope(
        unit,
        current_user,
        project_fields=("unit_id", "project_id"),
        grid_fields=("unit_id", "grid_id"),
        team_fields=("unit_id", "team_id"),
        branch_fields=("unit_id",),
        company_fields=(),
        project_name_fields=(),
        team_name_fields=(),
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="无权访问该责任单元")


def _unit_type(unit: dict | None) -> str:
    return str((unit or {}).get("type") or "").strip()


def _unit_name(unit: dict | None, fallback: str = "") -> str:
    if not unit:
        return fallback
    return str(unit.get("name") or unit.get("unit_id") or unit.get("id") or fallback)


def _unit_project(unit: dict | None) -> str | None:
    if not unit:
        return None
    value = str(unit.get("project_id") or unit.get("project") or "").strip()
    return value or None


def _unit_grid(unit: dict | None) -> str | None:
    if not unit:
        return None
    value = str(unit.get("grid_id") or (unit.get("unit_id") if _unit_type(unit) == "grid" else "") or "").strip()
    return value or None


def _unit_team(unit: dict | None) -> str | None:
    if not unit:
        return None
    value = str(unit.get("team_id") or (unit.get("unit_id") if _unit_type(unit) == "team" else "") or "").strip()
    return value or None


def _write_project_unit_log(
    *,
    current_user: dict,
    action: str,
    unit: dict | None,
    before: dict | None = None,
    after: dict | None = None,
    level: str = "info",
):
    unit_type = _unit_type(unit or after or before)
    if unit_type not in {"grid", "team"}:
        return

    is_team = unit_type == "team"
    write_audit_log(
        current_user=current_user,
        action=action,
        target_type="project",
        target_name=_unit_name(unit or after or before),
        before=before,
        after=after,
        project=_unit_project(unit or after or before),
        grid=_unit_grid(unit or after or before),
        team=_unit_team(unit or after or before) if is_team else None,
        level=level,
        extra={"sub_type": unit_type},
    )


@router.get("/", response_model=list[ResponsibilityUnitOut])
def list_units(
    unit_type: Optional[str] = Query(None, description="单元类型筛选"),
    parent_id: Optional[str] = Query(None, description="父节点ID筛选"),
    current_user: dict = Depends(get_current_user),
):
    return responsibility_unit_service.list_units(unit_type=unit_type, parent_id=parent_id, current_user=current_user)


@router.get("/tree")
def get_tree(current_user: dict = Depends(get_current_user)):
    return responsibility_unit_service.get_tree(current_user=current_user)


@router.get("/{unit_id}", response_model=ResponsibilityUnitOut)
def get_unit(unit_id: str, current_user: dict = Depends(get_current_user)):
    unit = responsibility_unit_service.get_unit_by_id(unit_id)
    _require_unit_scope(unit, current_user)
    if not unit:
        raise HTTPException(status_code=404, detail="责任单元不存在")
    return unit


@router.post("/", response_model=ResponsibilityUnitOut)
def create_unit(data: ResponsibilityUnitCreate, current_user: dict = Depends(get_current_user)):
    _require_responsibility_manager(current_user)
    if data.parent_id:
        _require_unit_scope(responsibility_unit_service.get_unit_by_id(data.parent_id), current_user)
    created = responsibility_unit_service.create_unit(data)
    unit_type = _unit_type(created)
    if unit_type in {"grid", "team"}:
        _write_project_unit_log(
            current_user=current_user,
            action="添加网格" if unit_type == "grid" else "添加工队",
            unit=created,
            after=created,
        )
    return created


@router.put("/{unit_id}", response_model=ResponsibilityUnitOut)
def update_unit(unit_id: str, data: ResponsibilityUnitUpdate, current_user: dict = Depends(get_current_user)):
    _require_responsibility_manager(current_user)
    before = responsibility_unit_service.get_unit_by_id(unit_id)
    _require_unit_scope(before, current_user)
    updated = responsibility_unit_service.update_unit(unit_id, data)

    if not updated:
        raise HTTPException(status_code=404, detail="责任单元不存在")

    unit_type = _unit_type(updated or before)
    if unit_type in {"grid", "team"}:
        _write_project_unit_log(
            current_user=current_user,
            action="变更网格信息" if unit_type == "grid" else "变更工队信息",
            unit=updated or before,
            before=before,
            after=updated,
        )
    return updated


@router.delete("/{unit_id}")
def delete_unit(unit_id: str, current_user: dict = Depends(get_current_user)):
    _require_responsibility_manager(current_user)
    before = responsibility_unit_service.get_unit_by_id(unit_id)
    _require_unit_scope(before, current_user)
    success = responsibility_unit_service.delete_unit(unit_id)

    if not success:
        raise HTTPException(status_code=400, detail="删除失败，该单元可能存在子节点")

    unit_type = _unit_type(before)
    if unit_type in {"grid", "team"}:
        _write_project_unit_log(
            current_user=current_user,
            action="删除网格" if unit_type == "grid" else "删除工队",
            unit=before,
            before=before,
            level="warning",
        )
    return {"success": True}


@router.post("/{unit_id}/move-up")
def move_up(unit_id: str, current_user: dict = Depends(get_current_user)):
    _require_responsibility_manager(current_user)
    _require_unit_scope(responsibility_unit_service.get_unit_by_id(unit_id), current_user)
    result = responsibility_unit_service.move_up(unit_id)
    if not result:
        raise HTTPException(status_code=404, detail="责任单元不存在")
    return result


@router.post("/{unit_id}/move-down")
def move_down(unit_id: str, current_user: dict = Depends(get_current_user)):
    _require_responsibility_manager(current_user)
    _require_unit_scope(responsibility_unit_service.get_unit_by_id(unit_id), current_user)
    result = responsibility_unit_service.move_down(unit_id)
    if not result:
        raise HTTPException(status_code=404, detail="责任单元不存在")
    return result


@router.post("/{unit_id}/change-parent")
def change_parent(
    unit_id: str,
    new_parent_id: str = Query(..., description="新父节点ID"),
    current_user: dict = Depends(get_current_user),
):
    _require_responsibility_manager(current_user)
    _require_unit_scope(responsibility_unit_service.get_unit_by_id(unit_id), current_user)
    _require_unit_scope(responsibility_unit_service.get_unit_by_id(new_parent_id), current_user)
    result = responsibility_unit_service.change_parent(unit_id, new_parent_id)
    if not result:
        raise HTTPException(status_code=404, detail="责任单元不存在")
    return result
