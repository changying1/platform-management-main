from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional, List


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
    type: Optional[str] = None
    team: Optional[str] = None
    status: str
    holder: str
    holderPhone: Optional[str] = None
    remark: Optional[str] = None


class DeviceCreate(DeviceBase):
    device_id: str
    trajectory: Optional[List[TrajectoryPoint]] = []


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    company: Optional[str] = None
    project: Optional[str] = None
    type: Optional[str] = None
    team: Optional[str] = None
    status: Optional[str] = None
    holder: Optional[str] = None
    holderPhone: Optional[str] = None
    remark: Optional[str] = None
    trajectory: Optional[List[TrajectoryPoint]] = None


class DeviceItem(DeviceBase):
    device_id: str
    lastUpdate: str
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    trajectory: List[TrajectoryPoint] = []

    @field_validator("device_id", mode="before")
    @classmethod
    def stringify_device_id(cls, value):
        return str(value) if value is not None else ""

    model_config = ConfigDict(from_attributes=True)


class DeviceWithTrajectory(DeviceItem):
    pass
class DbDeviceBase(BaseModel):
    id: str
    device_name: str
    device_type: Optional[str] = "JT808"
    ip_address: Optional[str] = "0.0.0.0"
    port: Optional[int] = 8989
    stream_url: Optional[str] = None
    owner_id: Optional[int] = None

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, value):
        return str(value) if value is not None else ""


class DbDeviceCreate(DbDeviceBase):
    pass


class DbDeviceUpdate(BaseModel):
    device_name: Optional[str] = None
    device_type: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    stream_url: Optional[str] = None
    is_online: Optional[bool] = None
    owner_id: Optional[int] = None
    last_latitude: Optional[float] = None
    last_longitude: Optional[float] = None


class DbDeviceOut(DbDeviceBase):
    is_online: bool
    last_latitude: Optional[float] = None
    last_longitude: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)
