from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from pymongo import ReturnDocument

from app.core.database import get_mongo_collection
from app.schemas.device_schema import (
    DbDeviceCreate,
    DbDeviceOut,
    DbDeviceUpdate,
    DeviceCreate,
    DeviceUpdate,
    DeviceItem,
    DeviceWithTrajectory,
    TrajectoryPoint,
)
from app.services.Device.device_service import device_service
from app.services.jt808_service import jt808_manager
from app.utils.logger import get_logger

router = APIRouter(prefix="/device", tags=["设备管理"])
db_router = APIRouter(prefix="/devices", tags=["Mongo Devices"])
logger = get_logger("DeviceController")


class DeviceCreateRequest(BaseModel):
    device_id: str
    name: str
    lat: float = 0.0
    lng: float = 0.0
    company: str
    project: str
    type: Optional[str] = None
    team: Optional[str] = None
    status: str = "offline"
    holder: str = ""
    holderPhone: Optional[str] = None
    remark: Optional[str] = None
    trajectory: List[TrajectoryPoint] = []


class DeviceUpdateRequest(BaseModel):
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


class TrajectoryPointRequest(BaseModel):
    timestamp: str
    lat: float
    lng: float
    speed: Optional[float] = None
    direction: Optional[float] = None


def _device_to_response(device: dict) -> dict:
    last_update = (
        device.get("lastUpdate")
        or device.get("updatedAt")
        or device.get("updated_at")
        or device.get("createdAt")
        or device.get("created_at")
        or ""
    )
    if isinstance(last_update, datetime):
        last_update = last_update.isoformat()

    created_at = device.get("createdAt") or device.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()

    updated_at = device.get("updatedAt") or device.get("updated_at")
    if isinstance(updated_at, datetime):
        updated_at = updated_at.isoformat()

    is_fault = bool(device.get("is_fault", False))
    is_online = bool(device.get("is_online", False))
    status = device.get("status")
    if not status:
        status = "fault" if is_fault else "online" if is_online else "offline"

    lat = device.get("lat")
    if lat is None:
        lat = device.get("last_lat")
    if lat is None:
        lat = 0.0

    lng = device.get("lng")
    if lng is None:
        lng = device.get("last_lng")
    if lng is None:
        lng = 0.0

    return {
        "device_id": str(device.get("device_id") or device.get("device_code") or device.get("id") or ""),
        "name": device.get("name") or device.get("device_name") or "",
        "lat": lat,
        "lng": lng,
        "company": str(device.get("company") or device.get("branch_id") or ""),
        "project": str(device.get("project") or device.get("project_id") or ""),
        "type": device.get("type") or device.get("device_type") or "",
        "team": device.get("team") or device.get("install_location") or "",
        "status": status,
        "holder": str(device.get("holder") or device.get("holder_id") or ""),
        "holderPhone": device.get("holderPhone") or "",
        "remark": device.get("remark", ""),
        "lastUpdate": str(last_update or ""),
        "createdAt": created_at,
        "updatedAt": updated_at,
        "trajectory": device.get("trajectory") or [],
    }

def _mongo_device_query(device_id: str) -> dict:
    if ObjectId.is_valid(device_id):
        return {"$or": [{"_id": device_id}, {"_id": ObjectId(device_id)}]}
    return {"_id": device_id}


def _mongo_device_to_response(device: dict) -> dict:
    if not device:
        return {}

    return {
        "id": str(device.get("_id") or device.get("id") or ""),
        "device_name": device.get("device_name") or device.get("name") or "",
        "device_type": device.get("device_type") or "JT808",
        "ip_address": device.get("ip_address") or "0.0.0.0",
        "port": device.get("port") or 8989,
        "stream_url": device.get("stream_url"),
        "owner_id": device.get("owner_id"),
        "is_online": bool(device.get("is_online", False)),
        "last_latitude": device.get("last_latitude"),
        "last_longitude": device.get("last_longitude"),
    }


@router.get("/list", response_model=List[DeviceItem])
def get_devices():
    """获取所有设备"""
    try:
        devices = device_service.get_devices()
        return [_device_to_response(device) for device in devices]
    except Exception as e:
        logger.error(f"获取设备列表失败: {e}")
        return []


@router.get("/devices", response_model=List[DeviceItem])
def get_all_devices():
    """获取所有设备列表（与 fence/devices 兼容）"""
    devices = device_service.get_devices()
    result = []

    for device in devices:
        result.append(_device_to_response(device))

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
                    "type": "JT808",
                    "team": "",
                    "status": "online" if is_online else "offline",
                    "holder": "未知",
                    "holderPhone": phone,
                    "remark": "",
                    "lastUpdate": datetime.now().isoformat()
                })

    return result


@router.get("/{device_id}", response_model=DeviceItem)
def get_device(device_id: str, hours: Optional[int] = None):
    """根据device_id获取设备（支持按时间筛选轨迹）"""
    device = device_service.get_device_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    
    # 如果指定了hours参数，筛选最近hours小时内的轨迹
    if hours is not None and hours > 0 and device.get("trajectory"):
        # 使用UTC时区的当前时间，与轨迹中的timestamp保持一�?
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
        device["trajectory"] = [
            point for point in device["trajectory"]
            if datetime.fromisoformat(point.get("timestamp", "").replace("Z", "+00:00")) >= cutoff_time
        ]
    
    return _device_to_response(device)


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
        type=payload.type,
        team=payload.team,
        status=payload.status,
        holder=payload.holder,
        holderPhone=payload.holderPhone,
        remark=payload.remark,
        trajectory=payload.trajectory
    )
    new_device = device_service.create_device(device_data)
    return _device_to_response(new_device)


@router.put("/update/{device_id}", response_model=DeviceItem)
def update_device(device_id: str, payload: DeviceUpdateRequest):
    """更新设备"""
    device_data = DeviceUpdate(
        name=payload.name,
        lat=payload.lat,
        lng=payload.lng,
        company=payload.company,
        project=payload.project,
        type=payload.type,
        team=payload.team,
        status=payload.status,
        holder=payload.holder,
        holderPhone=payload.holderPhone,
        remark=payload.remark,
        trajectory=payload.trajectory
    )
    updated_device = device_service.update_device(device_id, device_data)
    if not updated_device:
        raise HTTPException(status_code=404, detail="设备不存在")
    return _device_to_response(updated_device)


@router.delete("/delete/{device_id}")
def delete_device(device_id: str):
    """删除设备"""
    success = device_service.delete_device(device_id)
    if not success:
        raise HTTPException(status_code=404, detail="设备不存在")
    return {"status": "success"}


@router.post("/{device_id}/trajectory", response_model=DeviceItem)
def add_trajectory(device_id: str, payload: TrajectoryPointRequest):
    """Add trajectory point."""
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
    return _device_to_response(updated_device)


@router.get("/{device_id}/trajectory")
def get_trajectory(device_id: str, hours: int = 24):
    """获取设备轨迹"""
    trajectory = device_service.get_trajectory(device_id, hours)
    return {"device_id": device_id, "trajectory": trajectory}

@db_router.get("/", response_model=List[DbDeviceOut])
def get_db_devices():
    """List MongoDB location devices."""
    collection = get_mongo_collection("sql_devices")
    mongo_devices = list(collection.find({}))

    result = [_mongo_device_to_response(device) for device in mongo_devices]

    existing_ids = {str(item.get("id")) for item in result}
    existing_stream_urls = {
        str(item.get("stream_url"))
        for item in result
        if item.get("stream_url")
    }

    # 合并 JT808 内存里的实时设备状�?
    for phone, m_dev in jt808_manager.device_store.items():
        phone_str = str(phone)

        if phone_str in existing_ids or phone_str in existing_stream_urls:
            for item in result:
                if item.get("id") == phone_str or item.get("stream_url") == phone_str:
                    item["last_latitude"] = m_dev.get("last_latitude") or item.get("last_latitude")
                    item["last_longitude"] = m_dev.get("last_longitude") or item.get("last_longitude")
                    item["is_online"] = bool(m_dev.get("is_online", False))
                    break
            continue

        result.append({
            "id": phone_str,
            "device_name": m_dev.get("device_name", f"定位�?{phone_str}"),
            "device_type": "JT808",
            "ip_address": "0.0.0.0",
            "port": 8989,
            "stream_url": phone_str,
            "owner_id": 1,
            "is_online": bool(m_dev.get("is_online", False)),
            "last_latitude": m_dev.get("last_latitude"),
            "last_longitude": m_dev.get("last_longitude"),
        })

    return result


@db_router.post("/", response_model=DbDeviceOut)
def create_db_device(device_in: DbDeviceCreate):
    """新增 MongoDB 定位设备"""
    collection = get_mongo_collection("sql_devices")
    data = device_in.model_dump()

    custom_id = str(data.pop("id", "")).strip()
    now = datetime.now().isoformat()

    doc = {
        **data,
        "is_online": False,
        "last_latitude": None,
        "last_longitude": None,
        "createdAt": now,
        "updatedAt": now,
    }

    if custom_id:
        doc["_id"] = custom_id

    collection.insert_one(doc)
    return _mongo_device_to_response(doc)


@db_router.put("/{device_id}", response_model=DbDeviceOut)
def update_db_device(device_id: str, device_in: DbDeviceUpdate):
    """更新 MongoDB 定位设备"""
    collection = get_mongo_collection("sql_devices")
    update_data = device_in.model_dump(exclude_unset=True)

    if not update_data:
        existing = collection.find_one(_mongo_device_query(device_id))
        if not existing:
            raise HTTPException(status_code=404, detail="Device not found")
        return _mongo_device_to_response(existing)

    update_data["updatedAt"] = datetime.now().isoformat()

    result = collection.find_one_and_update(
        _mongo_device_query(device_id),
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Device not found")

    return _mongo_device_to_response(result)


@db_router.delete("/{device_id}")
def delete_db_device(device_id: str):
    """删除 MongoDB 定位设备"""
    collection = get_mongo_collection("sql_devices")
    result = collection.delete_one(_mongo_device_query(device_id))

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")

    return {"status": "success"}


router.include_router(db_router)

class DevicePositionUpdate(BaseModel):
    device_id: str
    lat: float
    lng: float


@router.post("/update-position")
def update_device_position(payload: DevicePositionUpdate):
    """Update device position."""
    # 使用现有的update_device方法来更新设备位�?
    device_data = DeviceUpdate(
        lat=payload.lat,
        lng=payload.lng
    )
    updated_device = device_service.update_device(payload.device_id, device_data)
    if not updated_device:
        raise HTTPException(status_code=404, detail="设备不存在")
    return {"status": "success", "device_id": payload.device_id, "lat": payload.lat, "lng": payload.lng}
