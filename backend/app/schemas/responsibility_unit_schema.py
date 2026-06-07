from enum import Enum
from typing import Optional

from pydantic import BaseModel


class UnitType(str, Enum):
    PROJECT = "project"
    SAFETY_OFFICE = "safety_office"
    GRID = "grid"
    TEAM = "team"
    PERSONNEL = "personnel"


class ResponsibilityUnitBase(BaseModel):
    unit_id: str
    name: str
    type: UnitType
    parent_id: Optional[str] = None
    project_id: Optional[str] = None
    grid_id: Optional[str] = None
    team_id: Optional[str] = None
    personnel_id: Optional[str] = None
    responsible_person_id: Optional[str] = None
    responsible_person_name: Optional[str] = None
    safety_office_role: Optional[str] = ""
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
    project_id: Optional[str] = None
    grid_id: Optional[str] = None
    team_id: Optional[str] = None
    personnel_id: Optional[str] = None
    responsible_person_id: Optional[str] = None
    safety_office_role: Optional[str] = None
    level: Optional[int] = None
    is_under_construction: Optional[bool] = None
    sort_order: Optional[int] = None


class ResponsibilityUnitOut(ResponsibilityUnitBase):
    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
