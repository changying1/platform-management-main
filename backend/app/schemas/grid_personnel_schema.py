from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class GridPersonnelRole(str, Enum):
    GRID_MANAGER = "grid_manager"
    SAFETY_MANAGER = "safety_manager"
    TECHNICIAN = "technician"
    INSPECTOR = "inspector"


class GridPersonnelBase(BaseModel):
    name: str
    role: GridPersonnelRole
    phone: str
    department: str
    grid_ids: Optional[List[str]] = []


class GridPersonnelCreate(GridPersonnelBase):
    pass


class GridPersonnelUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[GridPersonnelRole] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    grid_ids: Optional[List[str]] = None


class GridPersonnelOut(GridPersonnelBase):
    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
