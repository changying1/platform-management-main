from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class TeamBase(BaseModel):
    name: str
    color: str
    company: Optional[str] = ""
    project: Optional[str] = ""


class TeamCreate(TeamBase):
    fence_ids: Optional[List[str]] = []


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    company: Optional[str] = None
    project: Optional[str] = None
    fence_ids: Optional[List[str]] = None


class TeamItem(TeamBase):
    team_id: str
    fence_ids: List[str] = []
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None

    class Config:
        from_attributes = True


class TeamWithFences(TeamItem):
    fences: List[dict] = []


class WorkTeamItem(BaseModel):
    id: str
    name: str
    color: str
    fences: List[dict] = []