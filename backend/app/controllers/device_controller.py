from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from pymongo import ReturnDocument

from app.core.data_scope import in_scope, is_hq, scope_filter
from app.core.database import get_mongo_collection, get_personnel_collection
from app.core.security import get_current_user
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
from app.services.device_location_history_service import device_location_history_service
from app.services.attendance_service import attendance_service
from app.services.audit_log_service import write_audit_log
from app.services.jt808_service import jt808_manager
from app.utils.logger import get_logger

router = APIRouter(prefix="/device", tags=["设备管理"])
db_router = APIRouter(prefix="/devices", tags=["Mongo Devices"])
logger = get_logger("DeviceController")

CAMERA_TYPES = {"bullet_camera", "dome_camera", "body_camera", "drone", "camera", "dome", "bullet"}
LOCATION_TYPES = {
    "rtk",
    "uwb",
    "gps_tag",
    "gps_band",
    "smart_helmet",
    "location",
    "gateway",
    "uwb_band",
    "uwb_badge",
    "rtk_band",
    "rtk_badge",
    "wifi",
    "jt808",
}
DEVICE_USE_NAMES = {"定位基站", "基准站", "流动站", "基站", "移动站", "固定站"}


def _text(value) -> str:
    return "" if value in (None, "") else str(value).strip()


def _collection_name_index(collection_name: str, id_fields: tuple[str, ...]) -> dict:
    try:
        collection = get_mongo_collection(collection_name)
        index = {}
        for item in collection.find({}, {"_id": 0}):
            name = _text(item.get("name"))
            if not name:
                continue
            for field in id_fields:
                value = _text(item.get(field))
                if value:
                    index[value] = name
        return index
    except Exception:
        return {}


def _unit_name_indexes() -> dict:
    return {
        "branches": _collection_name_index("branch", ("id", "branch_id")),
        "projects": _collection_name_index("project", ("id", "project_id")),
        "grids": _collection_name_index("grid", ("id", "grid_id", "unit_id")),
        "teams": _collection_name_index("team", ("id", "team_id", "unit_id")),
        "personnel": _personnel_name_indexes(),
    }


def _first_unit_for_project(collection_name: str, project_id: str) -> dict:
    if not project_id:
        return {}
    try:
        return get_mongo_collection(collection_name).find_one(
            {"project_id": {"$in": [project_id, int(project_id) if project_id.isdigit() else project_id]}},
            {"_id": 0},
        ) or {}
    except Exception:
        return {}


def _personnel_name_indexes() -> dict:
    try:
        collection = get_personnel_collection()
        index = {}
        for item in collection.find({}, {"username": 1, "name": 1, "employeeId": 1, "phone": 1, "_id": 1}):
            name = _text(item.get("username") or item.get("name"))
            if not name:
                continue
            for field in ("_id", "employeeId", "phone", "username", "name"):
                value = _text(item.get(field))
                if value:
                    index[value] = name
        return index
    except Exception:
        return {}


def _name_from_index(value, index: dict) -> str:
    raw = _text(value)
    return index.get(raw, raw)


class DeviceCreateRequest(BaseModel):
    device_id: str
    name: str
    lat: float = 0.0
    lng: float = 0.0
    company: str
    branch_id: Optional[str] = None
    project: str
    project_id: Optional[str] = None
    grid: Optional[str] = None
    grid_id: Optional[str] = None
    type: Optional[str] = None
    team: Optional[str] = None
    team_id: Optional[str] = None
    personnel_id: Optional[str] = None
    install_location: Optional[str] = None
    status: str = "offline"
    holder: str = ""
    holderPhone: Optional[str] = None
    phone_num: Optional[str] = None
    remark: Optional[str] = None
    trajectory: List[TrajectoryPoint] = []


class DeviceUpdateRequest(BaseModel):
    name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    company: Optional[str] = None
    branch_id: Optional[str] = None
    project: Optional[str] = None
    project_id: Optional[str] = None
    grid: Optional[str] = None
    grid_id: Optional[str] = None
    type: Optional[str] = None
    team: Optional[str] = None
    team_id: Optional[str] = None
    personnel_id: Optional[str] = None
    install_location: Optional[str] = None
    status: Optional[str] = None
    holder: Optional[str] = None
    holderPhone: Optional[str] = None
    phone_num: Optional[str] = None
    remark: Optional[str] = None
    trajectory: Optional[List[TrajectoryPoint]] = None


class TrajectoryPointRequest(BaseModel):
    timestamp: str
    lat: float
    lng: float
    speed: Optional[float] = None
    direction: Optional[float] = None


def _device_to_response(device: dict, unit_names: Optional[dict] = None, include_trajectory: bool = True) -> dict:
    unit_names = unit_names or {}
    personnel_names = unit_names.get("personnel", {})
    branch_id = _text(device.get("branch_id"))
    project_id = _text(device.get("project_id"))
    grid_id = _text(device.get("grid_id"))
    team_id = _text(device.get("team_id"))
    branch_name = _text(device.get("company") or device.get("branch_name") or device.get("department")) or _name_from_index(branch_id, unit_names.get("branches", {}))
    project_name = _text(device.get("project") or device.get("project_name")) or _name_from_index(project_id, unit_names.get("projects", {}))
    grid_name = _text(device.get("grid") or device.get("grid_name")) or _name_from_index(grid_id, unit_names.get("grids", {}))
    team_name = _text(device.get("team") or device.get("team_name") or device.get("workTeam") or device.get("work_team")) or _name_from_index(team_id, unit_names.get("teams", {}))
    if project_id and not grid_name:
        fallback_grid = _first_unit_for_project("grid", project_id)
        grid_id = grid_id or _text(fallback_grid.get("grid_id") or fallback_grid.get("id"))
        grid_name = _text(fallback_grid.get("name"))
    if project_id and not team_name:
        fallback_team = _first_unit_for_project("team", project_id)
        team_id = team_id or _text(fallback_team.get("team_id") or fallback_team.get("id"))
        team_name = _text(fallback_team.get("name"))
        if not grid_id:
            grid_id = _text(fallback_team.get("grid_id"))
            grid_name = grid_name or _name_from_index(grid_id, unit_names.get("grids", {}))
    install_location = _text(device.get("install_location"))
    if team_name in DEVICE_USE_NAMES:
        install_location = install_location or team_name
        team_name = ""
    phone_num = _text(device.get("phone_num"))
    holder_raw = _text(device.get("holder") or device.get("holder_id") or device.get("personnel_id"))
    holder_name = _name_from_index(holder_raw, personnel_names)
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
        "device_code": _text(device.get("device_code")),
        "device_serial": _text(device.get("device_serial")),
        "raw_id": _text(device.get("id") or device.get("_id")),
        "name": device.get("name") or device.get("device_name") or "",
        "lat": lat,
        "lng": lng,
        "company": branch_name,
        "branch_id": branch_id or None,
        "project": project_name,
        "project_id": project_id or None,
        "grid": grid_name,
        "grid_id": grid_id or None,
        "type": device.get("type") or device.get("device_type") or "",
        "install_location": install_location,
        "team": team_name,
        "team_id": team_id or None,
        "personnel_id": device.get("personnel_id"),
        "status": status,
        "holder": holder_name,
        "holderPhone": device.get("holderPhone") or "",
        "phone_num": phone_num,
        "remark": device.get("remark", ""),
        "lastUpdate": str(last_update or ""),
        "createdAt": created_at,
        "updatedAt": updated_at,
        "trajectory": device.get("trajectory") or [] if include_trajectory else [],
    }


def _require_phone_num(phone_num: Optional[str]) -> str:
    value = str(phone_num or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="设备唯一机器码(phone_num)不能为空")
    return value


def _ensure_unique_phone_num(phone_num: str, exclude_device_id: Optional[str] = None) -> None:
    collection = get_mongo_collection("device")
    query = {"phone_num": phone_num}
    existing = collection.find_one(query, {"_id": 0, "device_id": 1})
    if existing and str(existing.get("device_id") or "") != str(exclude_device_id or ""):
        raise HTTPException(status_code=400, detail="设备唯一机器码(phone_num)已存在")


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
        "last_latitude": device.get("last_latitude") or device.get("lat"),
        "last_longitude": device.get("last_longitude") or device.get("lng"),
    }


def _scope_kwargs() -> dict:
    return {
        "project_fields": ("project_id",),
        "grid_fields": ("grid_id",),
        "team_fields": ("team_id",),
        "branch_fields": ("branch_id",),
        "company_fields": ("company", "department"),
        "project_name_fields": ("project",),
        "team_name_fields": ("team", "workTeam", "work_team", "install_location"),
    }


def _device_in_scope(device: dict | None, user: dict) -> bool:
    return in_scope(device, user, **_scope_kwargs())


def _device_type(device: dict | None) -> str:
    if not device:
        return ""
    raw_type = device.get("type") or device.get("device_type")
    if not raw_type:
        return "location"
    return str(raw_type).strip().lower()


def _is_location_device(device: dict | None) -> bool:
    dtype = _device_type(device)
    return dtype in LOCATION_TYPES and dtype not in CAMERA_TYPES


@router.get("/list", response_model=List[DeviceItem])
def get_devices(current_user: dict = Depends(get_current_user)):
    """获取所有设备"""
    try:
        devices = [
            device
            for device in device_service.get_devices(include_trajectory=False)
            if _is_location_device(device) and _device_in_scope(device, current_user)
        ]
        unit_names = _unit_name_indexes()
        return [_device_to_response(device, unit_names, include_trajectory=False) for device in devices]
    except Exception as e:
        logger.error(f"获取设备列表失败: {e}")
        return []


@router.get("/devices", response_model=List[DeviceItem])
def get_all_devices(current_user: dict = Depends(get_current_user)):
    """获取所有设备列表（与 fence/devices 兼容）"""
    devices = [
        device
        for device in device_service.get_devices(include_trajectory=False)
        if _is_location_device(device) and _device_in_scope(device, current_user)
    ]
    unit_names = _unit_name_indexes()
    result = []

    for device in devices:
        result.append(_device_to_response(device, unit_names, include_trajectory=False))

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
                if not is_hq(current_user):
                    continue
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


@router.get("/trajectories")
def get_device_trajectories(
    hours: int = 24,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """批量获取定位设备轨迹，供轨迹回放页面使用，避免前端逐个设备请求。"""
    try:
        safe_hours = max(1, min(int(hours or 24), 24 * 90))
        devices = [
            device
            for device in device_service.get_devices_with_trajectory(safe_hours, start_time, end_time)
            if _is_location_device(device) and _device_in_scope(device, current_user)
        ]
        unit_names = _unit_name_indexes()
        return [_device_to_response(device, unit_names, include_trajectory=True) for device in devices]
    except Exception as e:
        logger.error(f"批量获取设备轨迹失败: {e}")
        return []


@router.get("/trajectories/summary")
def get_device_trajectory_summaries(
    hours: int = 24,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """获取轨迹列表摘要，不返回完整点位数组。"""
    safe_hours = max(1, min(int(hours or 24), 24 * 90))
    summaries = device_location_history_service.get_track_summaries(
        safe_hours,
        start_time,
        end_time,
    )
    results = []
    for summary in summaries:
        device_id = str(summary.get("device_id") or "")
        device = device_service.get_device_by_id(device_id) or {}
        merged = {**summary, **device, "device_id": device_id}
        if device and not _is_location_device(device):
            continue
        if _device_in_scope(merged, current_user):
            results.append(
                {
                    key: value
                    for key, value in merged.items()
                    if key not in {"_id", "trajectory"}
                }
            )
    return results


@router.get("/trajectories/{device_id}/points")
def get_device_trajectory_points(
    device_id: str,
    hours: int = 24,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """点击回放时按设备和时间范围加载完整点位。"""
    device = device_service.get_device_by_id(device_id)
    scope_source = device or device_location_history_service.collection.find_one({"device_id": device_id})
    if (
        not scope_source
        or (device and not _is_location_device(device))
        or not _device_in_scope(scope_source, current_user)
    ):
        raise HTTPException(status_code=404, detail="设备不存在")
    safe_hours = max(1, min(int(hours or 24), 24 * 90))
    return {
        "device_id": device_id,
        "points": device_location_history_service.get_device_points(
            device_id,
            safe_hours,
            start_time,
            end_time,
        ),
    }


@router.get("/{device_id}", response_model=DeviceItem)
def get_device(device_id: str, hours: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    """根据device_id获取设备（支持按时间筛选轨迹）"""
    device = device_service.get_device_by_id(device_id)
    if device and not _is_location_device(device):
        raise HTTPException(status_code=404, detail="Device not found")
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    if not _device_in_scope(device, current_user):
        raise HTTPException(status_code=404, detail="设备不存在")
    
    # 如果指定了hours参数，筛选最近hours小时内的轨迹
    if hours is not None and hours > 0 and device.get("trajectory"):
        # 使用UTC时区的当前时间，与轨迹中的timestamp保持一�?
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
        device["trajectory"] = [
            point for point in device["trajectory"]
            if datetime.fromisoformat(point.get("timestamp", "").replace("Z", "+00:00")) >= cutoff_time
        ]
    
    if hours is not None and hours > 0:
        device["trajectory"] = device_service.get_trajectory(device_id, hours)
    return _device_to_response(device)


@router.post("/add", response_model=DeviceItem)
def add_device(payload: DeviceCreateRequest, current_user: dict = Depends(get_current_user)):
    """创建设备"""
    payload_data = payload.model_dump()
    if not _is_location_device(payload_data):
        raise HTTPException(status_code=400, detail="Device endpoint only accepts location devices")
    if not _device_in_scope(payload_data, current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    phone_num = _require_phone_num(payload.phone_num)
    _ensure_unique_phone_num(phone_num)
    device_data = DeviceCreate(
        device_id=payload.device_id,
        name=payload.name,
        lat=payload.lat,
        lng=payload.lng,
        company=payload.company,
        branch_id=payload.branch_id,
        project=payload.project,
        project_id=payload.project_id,
        grid=payload.grid,
        grid_id=payload.grid_id,
        type=payload.type,
        install_location=payload.install_location,
        team=payload.team,
        team_id=payload.team_id,
        personnel_id=payload.personnel_id,
        status=payload.status,
        holder=payload.holder,
        holderPhone=payload.holderPhone,
        phone_num=phone_num,
        remark=payload.remark,
        trajectory=payload.trajectory
    )
    new_device = device_service.create_device(device_data)
    write_audit_log(
        current_user=current_user,
        action="添加设备",
        target_type="device",
        target_name=new_device.get("name") or new_device.get("device_id"),
        after=new_device,
        company=new_device.get("company"),
        project=new_device.get("project"),
        grid=new_device.get("grid") or new_device.get("grid_name") or new_device.get("grid_id"),
        team=new_device.get("team"),
    )
    return _device_to_response(new_device)


@router.put("/update/{device_id}", response_model=DeviceItem)
def update_device(device_id: str, payload: DeviceUpdateRequest, current_user: dict = Depends(get_current_user)):
    """更新设备"""
    phone_num = payload.phone_num
    if phone_num is not None:
        phone_num = _require_phone_num(phone_num)
        _ensure_unique_phone_num(phone_num, exclude_device_id=device_id)
    device_data = DeviceUpdate(
        name=payload.name,
        lat=payload.lat,
        lng=payload.lng,
        company=payload.company,
        branch_id=payload.branch_id,
        project=payload.project,
        project_id=payload.project_id,
        grid=payload.grid,
        grid_id=payload.grid_id,
        type=payload.type,
        install_location=payload.install_location,
        team=payload.team,
        team_id=payload.team_id,
        personnel_id=payload.personnel_id,
        status=payload.status,
        holder=payload.holder,
        holderPhone=payload.holderPhone,
        phone_num=phone_num,
        remark=payload.remark,
        trajectory=payload.trajectory
    )
    existing = device_service.get_device_by_id(device_id)
    if not _is_location_device(existing) or not _device_in_scope(existing, current_user):
        raise HTTPException(status_code=404, detail="设备不存在")
    update_payload = payload.model_dump(exclude_unset=True)
    if not _is_location_device({**existing, **update_payload}):
        raise HTTPException(status_code=400, detail="Device endpoint only accepts location devices")
    updated_device = device_service.update_device(device_id, device_data)
    if not updated_device:
        raise HTTPException(status_code=404, detail="设备不存在")
    write_audit_log(
        current_user=current_user,
        action="变更设备信息",
        target_type="device",
        target_name=updated_device.get("name") or device_id,
        before=existing,
        after=updated_device,
        company=updated_device.get("company"),
        project=updated_device.get("project"),
        grid=updated_device.get("grid") or updated_device.get("grid_name") or updated_device.get("grid_id"),
        team=updated_device.get("team"),
    )
    return _device_to_response(updated_device)


@router.delete("/delete/{device_id}")
def delete_device(device_id: str, current_user: dict = Depends(get_current_user)):
    """删除设备"""
    existing = device_service.get_device_by_id(device_id)
    if not _is_location_device(existing) or not _device_in_scope(existing, current_user):
        raise HTTPException(status_code=404, detail="设备不存在")
    success = device_service.delete_device(device_id)
    if not success:
        raise HTTPException(status_code=404, detail="设备不存在")
    write_audit_log(
        current_user=current_user,
        action="删除设备",
        target_type="device",
        target_name=existing.get("name") or device_id,
        before=existing,
        company=existing.get("company"),
        project=existing.get("project"),
        grid=existing.get("grid") or existing.get("grid_name") or existing.get("grid_id"),
        team=existing.get("team"),
        level="warning",
    )
    return {"status": "success"}


@router.post("/{device_id}/trajectory", response_model=DeviceItem)
def add_trajectory(
    device_id: str,
    payload: TrajectoryPointRequest,
    current_user: dict = Depends(get_current_user),
):
    """Add trajectory point."""
    existing = device_service.get_device_by_id(device_id)
    if not _is_location_device(existing) or not _device_in_scope(existing, current_user):
        raise HTTPException(status_code=404, detail="Device not found")
    point = TrajectoryPoint(
        timestamp=payload.timestamp,
        lat=payload.lat,
        lng=payload.lng,
        speed=payload.speed,
        direction=payload.direction
    )
    updated_device = device_service.add_trajectory_point(device_id, point)
    updated_device = updated_device or device_service.get_device_by_id(device_id)
    if not updated_device:
        raise HTTPException(status_code=404, detail="设备不存在")
    return _device_to_response(updated_device)


@router.get("/{device_id}/trajectory")
def get_trajectory(device_id: str, hours: int = 24, current_user: dict = Depends(get_current_user)):
    """获取设备轨迹"""
    existing = device_service.get_device_by_id(device_id)
    if not _is_location_device(existing) or not _device_in_scope(existing, current_user):
        raise HTTPException(status_code=404, detail="Device not found")
    trajectory = device_service.get_trajectory(device_id, hours)
    return {"device_id": device_id, "trajectory": trajectory}


@router.get("/{device_id}/attendance/week")
def get_device_week_attendance(device_id: str, current_user: dict = Depends(get_current_user)):
    """Get attendance records for this device in the last 7 days."""
    existing = device_service.get_device_by_id(device_id)
    if existing and (not _is_location_device(existing) or not _device_in_scope(existing, current_user)):
        raise HTTPException(status_code=404, detail="Device not found")
    return {"device_id": device_id, "records": attendance_service.get_device_week_records(device_id)}

@db_router.get("/", response_model=List[DbDeviceOut])
def get_db_devices(current_user: dict = Depends(get_current_user)):
    """List MongoDB location devices."""
    collection = get_mongo_collection("sql_devices")
    query = scope_filter(current_user, **_scope_kwargs())
    mongo_devices = [device for device in collection.find(query) if _is_location_device(device)]

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

        if not is_hq(current_user):
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
def create_db_device(device_in: DbDeviceCreate, current_user: dict = Depends(get_current_user)):
    """新增 MongoDB 定位设备"""
    collection = get_mongo_collection("sql_devices")
    data = device_in.model_dump()
    if not _is_location_device(data):
        raise HTTPException(status_code=400, detail="Device endpoint only accepts location devices")
    if not _device_in_scope(data, current_user):
        raise HTTPException(status_code=403, detail="无权在该范围创建设备")

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
def update_db_device(
    device_id: str,
    device_in: DbDeviceUpdate,
    current_user: dict = Depends(get_current_user),
):
    """更新 MongoDB 定位设备"""
    collection = get_mongo_collection("sql_devices")
    existing = collection.find_one(_mongo_device_query(device_id))
    if not _is_location_device(existing) or not _device_in_scope(existing, current_user):
        raise HTTPException(status_code=404, detail="Device not found")
    update_data = device_in.model_dump(exclude_unset=True)
    candidate = {**existing, **update_data}
    if not _is_location_device(candidate):
        raise HTTPException(status_code=400, detail="Device endpoint only accepts location devices")

    if not update_data:
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
def delete_db_device(device_id: str, current_user: dict = Depends(get_current_user)):
    """删除 MongoDB 定位设备"""
    collection = get_mongo_collection("sql_devices")
    existing = collection.find_one(_mongo_device_query(device_id))
    if not _is_location_device(existing) or not _device_in_scope(existing, current_user):
        raise HTTPException(status_code=404, detail="Device not found")
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
def update_device_position(
    payload: DevicePositionUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update device position."""
    existing = device_service.get_device_by_id(payload.device_id)
    if not _is_location_device(existing) or not _device_in_scope(existing, current_user):
        raise HTTPException(status_code=404, detail="Device not found")
    # 使用现有的update_device方法来更新设备位�?
    device_data = DeviceUpdate(
        lat=payload.lat,
        lng=payload.lng
    )
    updated_device = device_service.update_device(payload.device_id, device_data)
    if not updated_device:
        raise HTTPException(status_code=404, detail="设备不存在")
    return {"status": "success", "device_id": payload.device_id, "lat": payload.lat, "lng": payload.lng}
