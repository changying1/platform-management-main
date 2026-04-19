from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class TrajectoryPoint(BaseModel):
    timestamp: str
    lat: float
    lng: float
    speed: Optional[float] = None
    direction: Optional[float] = None


class DeviceBase(BaseModel):
    name: str
    lat: float
    lng: float
    company: str
    project: str
    status: str
    holder: str
    holderPhone: Optional[str] = None


class DeviceCreate(DeviceBase):
    device_id: str
    trajectory: Optional[List[TrajectoryPoint]] = []


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    company: Optional[str] = None
    project: Optional[str] = None
    status: Optional[str] = None
    holder: Optional[str] = None
    holderPhone: Optional[str] = None
    trajectory: Optional[List[TrajectoryPoint]] = None


class DeviceItem(DeviceBase):
    device_id: str
    lastUpdate: str
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    trajectory: List[TrajectoryPoint] = []

    class Config:
        from_attributes = True


class DeviceWithTrajectory(DeviceItem):
    pass