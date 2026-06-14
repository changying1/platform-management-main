from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.schemas.grid_personnel_schema import GridPersonnelCreate, GridPersonnelUpdate, GridPersonnelOut
from app.core.security import get_current_user
from app.services.Grid.grid_personnel_service import grid_personnel_service

router = APIRouter(prefix="/api/grid-personnel", tags=["Grid Personnel"])


@router.get("/", response_model=list[GridPersonnelOut])
def list_personnel(
    role: Optional[str] = Query(None, description="角色筛选"),
    department: Optional[str] = Query(None, description="所属单位筛选"),
    current_user: dict = Depends(get_current_user),
):
    return grid_personnel_service.list_personnel(role=role, department=department, current_user=current_user)


@router.get("/{personnel_id}", response_model=GridPersonnelOut)
def get_personnel(personnel_id: str, current_user: dict = Depends(get_current_user)):
    personnel = grid_personnel_service.get_personnel_by_id(personnel_id, current_user=current_user)
    if not personnel:
        raise HTTPException(status_code=404, detail="责任人员不存在")
    return personnel


@router.post("/", response_model=GridPersonnelOut)
def create_personnel(data: GridPersonnelCreate):
    return grid_personnel_service.create_personnel(data)


@router.put("/{personnel_id}", response_model=GridPersonnelOut)
def update_personnel(personnel_id: str, data: GridPersonnelUpdate, current_user: dict = Depends(get_current_user)):
    updated = grid_personnel_service.update_personnel(personnel_id, data, current_user=current_user)
    if not updated:
        raise HTTPException(status_code=404, detail="责任人员不存在")
    return updated


@router.delete("/{personnel_id}")
def delete_personnel(personnel_id: str, current_user: dict = Depends(get_current_user)):
    success = grid_personnel_service.delete_personnel(personnel_id, current_user=current_user)
    if not success:
        raise HTTPException(status_code=404, detail="责任人员不存在")
    return {"success": True}


@router.post("/{personnel_id}/assign-grid/{grid_id}", response_model=GridPersonnelOut)
def assign_grid(personnel_id: str, grid_id: str, current_user: dict = Depends(get_current_user)):
    updated = grid_personnel_service.assign_grid(personnel_id, grid_id, current_user=current_user)
    if not updated:
        raise HTTPException(status_code=404, detail="责任人员不存在")
    return updated


@router.delete("/{personnel_id}/assign-grid/{grid_id}", response_model=GridPersonnelOut)
def remove_grid(personnel_id: str, grid_id: str, current_user: dict = Depends(get_current_user)):
    updated = grid_personnel_service.remove_grid(personnel_id, grid_id, current_user=current_user)
    if not updated:
        raise HTTPException(status_code=404, detail="责任人员不存在")
    return updated
