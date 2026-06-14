from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from app.core.security import get_current_user
from app.schemas.grid_schema import GridCreate, GridUpdate, GridOut
from app.services.Grid.grid_service import grid_service
from app.services.audit_log_service import write_audit_log

router = APIRouter(prefix="/api/grids", tags=["Grid Management"])


def _grid_project_value(grid: dict | None) -> str | None:
    if not grid:
        return None
    value = str(grid.get("project_id") or grid.get("project") or "").strip()
    return value or None


def _grid_name(grid: dict | None, fallback: str = "") -> str:
    if not grid:
        return fallback
    return str(grid.get("name") or grid.get("grid_id") or grid.get("id") or fallback)


def _grid_target_name(grid: dict | None, fallback: str = "") -> str:
    if not grid:
        return fallback
    name = str(grid.get("name") or "").strip()
    grid_id = str(grid.get("grid_id") or grid.get("id") or fallback or "").strip()
    if name and grid_id:
        return f"{name} ({grid_id})"
    return name or grid_id or fallback


@router.get("/", response_model=list[GridOut])
def list_grids(
    level: Optional[str] = Query(None, description="网格层级筛选"),
    status: Optional[str] = Query(None, description="状态筛选"),
    current_user: dict = Depends(get_current_user),
):
    return grid_service.list_grids(level=level, status=status, current_user=current_user)


@router.get("/stats")
def get_grid_stats(current_user: dict = Depends(get_current_user)):
    return grid_service.get_grid_stats(current_user=current_user)


@router.get("/{grid_id}", response_model=GridOut)
def get_grid(grid_id: str, current_user: dict = Depends(get_current_user)):
    grid = grid_service.get_grid_by_id(grid_id, current_user=current_user)
    if not grid:
        raise HTTPException(status_code=404, detail="网格不存在")
    return grid


@router.post("/", response_model=GridOut)
def create_grid(data: GridCreate, current_user: dict = Depends(get_current_user)):
    try:
        created = grid_service.create_grid(data)
        write_audit_log(
            current_user=current_user,
            action="添加网格",
            target_type="grid",
            target_name=_grid_target_name(created),
            after=created,
            project=_grid_project_value(created),
            grid=_grid_name(created),
            extra={"sub_type": "grid"},
        )
        return created
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/{grid_id}", response_model=GridOut)
def update_grid(grid_id: str, data: GridUpdate, current_user: dict = Depends(get_current_user)):
    before = grid_service.get_grid_by_id(grid_id, current_user=current_user)
    updated = grid_service.update_grid(grid_id, data, current_user=current_user)
    if not updated:
        raise HTTPException(status_code=404, detail="网格不存在")
    write_audit_log(
        current_user=current_user,
        action="变更网格信息",
        target_type="grid",
        target_name=_grid_target_name(updated, grid_id),
        before=before,
        after=updated,
        project=_grid_project_value(updated or before),
        grid=_grid_name(updated, grid_id),
        extra={"sub_type": "grid"},
    )
    return updated


@router.delete("/{grid_id}")
def delete_grid(grid_id: str, current_user: dict = Depends(get_current_user)):
    before = grid_service.get_grid_by_id(grid_id, current_user=current_user)
    success = grid_service.delete_grid(grid_id, current_user=current_user)
    if not success:
        raise HTTPException(status_code=404, detail="网格不存在")
    write_audit_log(
        current_user=current_user,
        action="删除网格",
        target_type="grid",
        target_name=_grid_target_name(before, grid_id),
        before=before,
        project=_grid_project_value(before),
        grid=_grid_name(before, grid_id),
        level="warning",
        extra={"sub_type": "grid"},
    )
    return {"success": True}
