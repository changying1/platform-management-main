from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from bson import ObjectId
from pymongo import ReturnDocument

from app.core.database import get_device_collection
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

router = APIRouter(prefix="/device", tags=["设备管理"])
db_router = APIRouter(prefix="/devices", tags=["Mongo Devices"])


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

@db_router.get("/", response_model=List[DbDeviceOut])
def get_db_devices():
    """获取 MongoDB 定位设备列表，不影响 /video 的 video_device"""
    collection = get_device_collection()
    mongo_devices = list(collection.find({}))

    result = [_mongo_device_to_response(device) for device in mongo_devices]

    existing_ids = {str(item.get("id")) for item in result}
    existing_stream_urls = {
        str(item.get("stream_url"))
        for item in result
        if item.get("stream_url")
    }

    # 合并 JT808 内存里的实时设备状态
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
            "device_name": m_dev.get("device_name", f"定位器-{phone_str}"),
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
    collection = get_device_collection()
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
    collection = get_device_collection()
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
    collection = get_device_collection()
    result = collection.delete_one(_mongo_device_query(device_id))

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")

    return {"status": "success"}


router.include_router(db_router)

