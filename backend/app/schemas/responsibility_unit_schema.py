from pydantic import BaseModel
from typing import Optional
from enum import Enum


class UnitType(str, Enum):
    DIVISION = "division"      # 分部
    WORKSHOP = "workshop"      # 工区
    SITE = "site"              # 工点
    SUBPROJECT = "subproject"  # 分部工程


class ResponsibilityUnitBase(BaseModel):
    unit_id: str
    name: str
    type: UnitType
    parent_id: Optional[str] = None
    level: int = 1
    is_under_construction: bool = True
    sort_order: int = 0


class ResponsibilityUnitCreate(ResponsibilityUnitBase):
    pass


class ResponsibilityUnitUpdate(BaseModel):
    unit_id: Optional[str] = None
    name: Optional[str] = None
    type: Optional[UnitType] = None
    parent_id: Optional[str] = None
    level: Optional[int] = None
    is_under_construction: Optional[bool] = None
    sort_order: Optional[int] = None


class ResponsibilityUnitOut(ResponsibilityUnitBase):
    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
