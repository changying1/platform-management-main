from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.schemas.device_schema import DeviceCreate, DeviceUpdate, DeviceItem, DeviceWithTrajectory, TrajectoryPoint
from app.services.Device.device_service import device_service
from app.services.jt808_service import jt808_manager

router = APIRouter(prefix="/device", tags=["设备管理"])


class DeviceCreateRequest(BaseModel):
    device_id: str
    name: str
    lat: float
    lng: float
    company: str
    project: str
    status: str
    holder: str
    holderPhone: Optional[str] = None
    trajectory: List[TrajectoryPoint] = []


class DeviceUpdateRequest(BaseModel):
    name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    company: Optional[str] = None
    project: Optional[str] = None
    status: Optional[str] = None
    holder: Optional[str] = None
    holderPhone: Optional[str] = None
    trajectory: Optional[List[TrajectoryPoint]] = None


class TrajectoryPointRequest(BaseModel):
    timestamp: str
    lat: float
    lng: float
    speed: Optional[float] = None
    direction: Optional[float] = None


@router.get("/list", response_model=List[DeviceItem])
def get_devices():
    """获取所有设备"""
    devices = device_service.get_devices()
    result = []
    for device in devices:
        device_item = {
            "device_id": device.get("device_id"),
            "name": device.get("name"),
            "lat": device.get("lat"),
            "lng": device.get("lng"),
            "company": device.get("company"),
            "project": device.get("project"),
            "status": device.get("status"),
            "holder": device.get("holder"),
            "holderPhone": device.get("holderPhone", ""),
            "lastUpdate": device.get("lastUpdate"),
            "createdAt": device.get("createdAt"),
            "updatedAt": device.get("updatedAt"),
            "trajectory": device.get("trajectory", [])
        }
        result.append(device_item)
    return result


@router.get("/devices", response_model=List[DeviceItem])
def get_all_devices():
    """获取所有设备列表（与fence/devices兼容）"""
    devices = device_service.get_devices()
    result = []

    for device in devices:
        device_item = {
            "device_id": device.get("device_id"),
            "name": device.get("name"),
            "lat": device.get("lat"),
            "lng": device.get("lng"),
            "company": device.get("company"),
            "project": device.get("project"),
            "status": device.get("status"),
            "holder": device.get("holder"),
            "holderPhone": device.get("holderPhone", ""),
            "lastUpdate": device.get("lastUpdate")
        }
        result.append(device_item)

    for phone, dev_data in jt808_manager.device_store.items():
        lat = dev_data.get("last_latitude")
        lng = dev_data.get("last_longitude")
        is_online = dev_data.get("is_online", False)

        if lat is not None and lng is not None:
            matched = False
            for d in result:
                if d.get("holderPhone") and phone.lstrip("0") in d.get("holderPhone", "").replace("*", ""):
                    d["lat"] = lat
                    d["lng"] = lng
                    d["status"] = "online" if is_online else "offline"
                    d["lastUpdate"] = datetime.now().isoformat()
                    matched = True
                    break

            if not matched:
                result.append({
                    "device_id": phone,
                    "name": f"设备{phone}",
                    "lat": lat,
                    "lng": lng,
                    "company": "未知",
                    "project": "未知",
                    "status": "online" if is_online else "offline",
                    "holder": "未知",
                    "holderPhone": phone,
                    "lastUpdate": datetime.now().isoformat()
                })

    return result


@router.get("/{device_id}", response_model=DeviceItem)
def get_device(device_id: str):
    """根据device_id获取设备"""
    device = device_service.get_device_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    return {
        "device_id": device.get("device_id"),
        "name": device.get("name"),
        "lat": device.get("lat"),
        "lng": device.get("lng"),
        "company": device.get("company"),
        "project": device.get("project"),
        "status": device.get("status"),
        "holder": device.get("holder"),
        "holderPhone": device.get("holderPhone", ""),
        "lastUpdate": device.get("lastUpdate"),
        "createdAt": device.get("createdAt"),
        "updatedAt": device.get("updatedAt"),
        "trajectory": device.get("trajectory", [])
    }


@router.post("/add", response_model=DeviceItem)
def add_device(payload: DeviceCreateRequest):
    """创建设备"""
    device_data = DeviceCreate(
        device_id=payload.device_id,
        name=payload.name,
        lat=payload.lat,
        lng=payload.lng,
        company=payload.company,
        project=payload.project,
        status=payload.status,
        holder=payload.holder,
        holderPhone=payload.holderPhone,
        trajectory=payload.trajectory
    )
    new_device = device_service.create_device(device_data)
    return {
        "device_id": new_device.get("device_id"),
        "name": new_device.get("name"),
        "lat": new_device.get("lat"),
        "lng": new_device.get("lng"),
        "company": new_device.get("company"),
        "project": new_device.get("project"),
        "status": new_device.get("status"),
        "holder": new_device.get("holder"),
        "holderPhone": new_device.get("holderPhone", ""),
        "lastUpdate": new_device.get("lastUpdate"),
        "createdAt": new_device.get("createdAt"),
        "updatedAt": new_device.get("updatedAt"),
        "trajectory": new_device.get("trajectory", [])
    }


@router.put("/update/{device_id}", response_model=DeviceItem)
def update_device(device_id: str, payload: DeviceUpdateRequest):
    """更新设备"""
    device_data = DeviceUpdate(
        name=payload.name,
        lat=payload.lat,
        lng=payload.lng,
        company=payload.company,
        project=payload.project,
        status=payload.status,
        holder=payload.holder,
        holderPhone=payload.holderPhone,
        trajectory=payload.trajectory
    )
    updated_device = device_service.update_device(device_id, device_data)
    if not updated_device:
        raise HTTPException(status_code=404, detail="设备不存在")
    return {
        "device_id": updated_device.get("device_id"),
        "name": updated_device.get("name"),
        "lat": updated_device.get("lat"),
        "lng": updated_device.get("lng"),
        "company": updated_device.get("company"),
        "project": updated_device.get("project"),
        "status": updated_device.get("status"),
        "holder": updated_device.get("holder"),
        "holderPhone": updated_device.get("holderPhone", ""),
        "lastUpdate": updated_device.get("lastUpdate"),
        "createdAt": updated_device.get("createdAt"),
        "updatedAt": updated_device.get("updatedAt"),
        "trajectory": updated_device.get("trajectory", [])
    }


@router.delete("/delete/{device_id}")
def delete_device(device_id: str):
    """删除设备"""
    success = device_service.delete_device(device_id)
    if not success:
        raise HTTPException(status_code=404, detail="设备不存在")
    return {"status": "success"}


@router.post("/{device_id}/trajectory", response_model=DeviceItem)
def add_trajectory(device_id: str, payload: TrajectoryPointRequest):
    """添加轨迹点"""
    point = TrajectoryPoint(
        timestamp=payload.timestamp,
        lat=payload.lat,
        lng=payload.lng,
        speed=payload.speed,
        direction=payload.direction
    )
    updated_device = device_service.add_trajectory_point(device_id, point)
    if not updated_device:
        raise HTTPException(status_code=404, detail="设备不存在")
    return {
        "device_id": updated_device.get("device_id"),
        "name": updated_device.get("name"),
        "lat": updated_device.get("lat"),
        "lng": updated_device.get("lng"),
        "company": updated_device.get("company"),
        "project": updated_device.get("project"),
        "status": updated_device.get("status"),
        "holder": updated_device.get("holder"),
        "holderPhone": updated_device.get("holderPhone", ""),
        "lastUpdate": updated_device.get("lastUpdate"),
        "createdAt": updated_device.get("createdAt"),
        "updatedAt": updated_device.get("updatedAt"),
        "trajectory": updated_device.get("trajectory", [])
    }


@router.get("/{device_id}/trajectory")
def get_trajectory(device_id: str, hours: int = 24):
    """获取设备轨迹"""
    trajectory = device_service.get_trajectory(device_id, hours)
    return {"device_id": device_id, "trajectory": trajectory}


from datetime import datetime