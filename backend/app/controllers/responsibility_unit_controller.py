from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.schemas.responsibility_unit_schema import ResponsibilityUnitCreate, ResponsibilityUnitUpdate, ResponsibilityUnitOut
from app.services.Grid.responsibility_unit_service import responsibility_unit_service

router = APIRouter(prefix="/api/responsibility-units", tags=["Responsibility Unit Management"])


@router.get("/", response_model=list[ResponsibilityUnitOut])
def list_units(
    unit_type: Optional[str] = Query(None, description="单元类型筛选"),
    parent_id: Optional[str] = Query(None, description="父节点ID筛选")
):
    return responsibility_unit_service.list_units(unit_type=unit_type, parent_id=parent_id)


@router.get("/tree")
def get_tree():
    return responsibility_unit_service.get_tree()


@router.get("/{unit_id}", response_model=ResponsibilityUnitOut)
def get_unit(unit_id: str):
    unit = responsibility_unit_service.get_unit_by_id(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="责任单元不存在")
    return unit


@router.post("/", response_model=ResponsibilityUnitOut)
def create_unit(data: ResponsibilityUnitCreate):
    return responsibility_unit_service.create_unit(data)


@router.put("/{unit_id}", response_model=ResponsibilityUnitOut)
def update_unit(unit_id: str, data: ResponsibilityUnitUpdate):
    updated = responsibility_unit_service.update_unit(unit_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="责任单元不存在")
    return updated


@router.delete("/{unit_id}")
def delete_unit(unit_id: str):
    success = responsibility_unit_service.delete_unit(unit_id)
    if not success:
        raise HTTPException(status_code=400, detail="删除失败，该单元可能存在子节点")
    return {"success": True}


@router.post("/{unit_id}/move-up")
def move_up(unit_id: str):
    result = responsibility_unit_service.move_up(unit_id)
    if not result:
        raise HTTPException(status_code=404, detail="责任单元不存在")
    return result


@router.post("/{unit_id}/move-down")
def move_down(unit_id: str):
    result = responsibility_unit_service.move_down(unit_id)
    if not result:
        raise HTTPException(status_code=404, detail="责任单元不存在")
    return result


@router.post("/{unit_id}/change-parent")
def change_parent(unit_id: str, new_parent_id: str = Query(..., description="新父节点ID")):
    result = responsibility_unit_service.change_parent(unit_id, new_parent_id)
    if not result:
        raise HTTPException(status_code=404, detail="责任单元不存在")
    return result
