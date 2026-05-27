from pydantic import BaseModel
from typing import Optional
from enum import Enum


class GridLevel(str, Enum):
    PROJECT = "project"
    WORKSHOP = "workshop"
    TEAM = "team"
    WORKFACE = "workface"


class GridBase(BaseModel):
    grid_id: str
    name: str
    level: GridLevel
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