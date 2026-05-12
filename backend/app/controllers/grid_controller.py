from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.schemas.grid_schema import GridCreate, GridUpdate, GridOut
from app.services.Grid.grid_service import grid_service

router = APIRouter(prefix="/api/grids", tags=["Grid Management"])


@router.get("/", response_model=list[GridOut])
def list_grids(
    level: Optional[str] = Query(None, description="网格层级筛选"),
    status: Optional[str] = Query(None, description="状态筛选")
):
    return grid_service.list_grids(level=level, status=status)


@router.get("/stats")
def get_grid_stats():
    return grid_service.get_grid_stats()


@router.get("/{grid_id}", response_model=GridOut)
def get_grid(grid_id: str):
    grid = grid_service.get_grid_by_id(grid_id)
    if not grid:
        raise HTTPException(status_code=404, detail="网格不存在")
    return grid


@router.post("/", response_model=GridOut)
def create_grid(data: GridCreate):
    return grid_service.create_grid(data)


@router.put("/{grid_id}", response_model=GridOut)
def update_grid(grid_id: str, data: GridUpdate):
    updated = grid_service.update_grid(grid_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="网格不存在")
    return updated


@router.delete("/{grid_id}")
def delete_grid(grid_id: str):
    success = grid_service.delete_grid(grid_id)
    if not success:
        raise HTTPException(status_code=404, detail="网格不存在")
    return {"success": True}
