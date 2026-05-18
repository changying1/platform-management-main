from pydantic import BaseModel
from typing import Optional
from enum import Enum


class GridLevel(str, Enum):
    PROJECT = "project"
    WORKSHOP = "workshop"
    TEAM = "team"
    WORKFACE = "workface"


class GridStatus(str, Enum):
    NORMAL = "normal"
    WARNING = "warning"
    ALARM = "alarm"


class GridBase(BaseModel):
    grid_id: str
    name: str
    level: GridLevel
    status: GridStatus = GridStatus.NORMAL
    area: Optional[float] = None
    description: Optional[str] = ""
    bounds_json: Optional[str] = ""
    parent_id: Optional[str] = None
    project_id: Optional[str] = None


class GridCreate(GridBase):
    pass


class GridUpdate(BaseModel):
    grid_id: Optional[str] = None
    name: Optional[str] = None
    level: Optional[GridLevel] = None
    status: Optional[GridStatus] = None
    area: Optional[float] = None
    description: Optional[str] = None
    bounds_json: Optional[str] = None
    parent_id: Optional[str] = None
    project_id: Optional[str] = None


class GridOut(GridBase):
    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
