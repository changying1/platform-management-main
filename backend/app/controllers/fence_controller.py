"""
围栏模块控制器 —— MongoDB版
提供围栏和作业队的 CRUD 接口.
"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services.Fence.fence_service import FenceService
from app.services.Fence.collect_service import fence_collect_service
from app.services.Fence.team_service import team_service
from app.schemas.team_schema import WorkTeamItem
from app.schemas.fence_schema import FenceUpdate as ServiceFenceUpdate
from app.core.data_scope import in_scope
from app.core.security import get_current_user
 
# TODO: 轨迹回放待迁移到 MongoDB 后恢复
# import copy
# import uuid
# from datetime import datetime, timedelta
# from fastapi import APIRouter, HTTPException, Query
# from sqlalchemy import and_
# from app.services.jt808_service import jt808_manager
# from app.core.database import SessionLocal
# from app.models.location_history import DeviceLocationHistory

fence_service = FenceService()

router = APIRouter(prefix="/fence", tags=["Electronic Fence"])


class Schedule(BaseModel):
    start: str
    end: str


class FenceItem(BaseModel):
    id: str
    name: str
    company: str
    project: str
    branch_id: Optional[str | int] = None


    project_id: Optional[str | int] = None


    grid_id: Optional[str | int] = None


    team_id: Optional[str | int] = None


    type: str
    behavior: str
    severity: str
    schedule: Schedule
    effective_time: str = "00:00-23:59"
    center: Optional[List[float]] = None
    radius: Optional[float] = None
    points: Optional[List[List[float]]] = None
    createdAt: str
    updatedAt: str


class FenceCreate(BaseModel):
    name: str
    company: Optional[str] = ""
    project: Optional[str] = ""
    grid: Optional[str] = ""
    team: Optional[str] = ""
    branch_id: Optional[str | int] = None
    project_id: Optional[str | int] = None
    grid_id: Optional[str | int] = None
    team_id: Optional[str | int] = None
    shape: str
    behavior: str
    severity: str
    schedule: Optional[Schedule] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    center: Optional[List[float]] = None
    radius: Optional[float] = None
    points: Optional[List[List[float]]] = None


class RegionItem(BaseModel):
    id: str
    name: str
    company: str
    project: str
    points: List[List[float]]


class CollectPointItem(BaseModel):
    device_id: str
    lat: float
    lng: float
    timestamp: str


class CollectPointsResponse(BaseModel):
    active: bool
    started_at: Optional[str] = None
    device_ids: List[str]
    points: List[CollectPointItem]
    count: int
    can_draw: bool


class DebugCollectPointRequest(BaseModel):
    device_id: str
    lat: float
    lng: float


REGIONS: List[dict] = [
    {
        "id": "region1",
        "name": "8号线施工区",
        "company": "中铁一局",
        "project": "西安地铁8号线",
        "points": [[34.278, 109.128], [34.286, 109.128], [34.286, 109.138], [34.278, 109.138]],
    },
]


def _fence_scope_kwargs() -> dict:
    return {
        "project_fields": ("project_id",),
        "grid_fields": ("grid_id",),
        "team_fields": ("team_id",),
        "branch_fields": ("branch_id",),
        "company_fields": ("company", "department"),
        "project_name_fields": ("project",),
        "team_name_fields": ("team", "workTeam", "work_team"),
    }


def _fence_visible(fence: dict | None, current_user: dict) -> bool:
    return in_scope(fence, current_user, **_fence_scope_kwargs())


def _shape_label(fence: dict) -> str:
    shape = fence.get("shape") or ""
    return shape.capitalize()


def _fence_to_item(fence: dict) -> dict:
    return {
        "id": str(fence.get("fence_id") or fence.get("id") or ""),
        "name": fence.get("name"),
        "company": fence.get("company") or "",
        "project": fence.get("project") or "",
        "branch_id": fence.get("branch_id"),
        "project_id": fence.get("project_id"),
        "grid_id": fence.get("grid_id"),
        "team_id": fence.get("team_id"),
        "type": _shape_label(fence),
        "behavior": fence.get("behavior"),
        "severity": fence.get("severity"),
        "schedule": fence.get("schedule"),
        "effective_time": fence.get("effective_time") or "00:00-23:59",
        "center": fence.get("geometry", {}).get("center"),
        "radius": fence.get("geometry", {}).get("radius"),
        "points": fence.get("geometry", {}).get("points"),
        "createdAt": fence.get("createdAt"),
        "updatedAt": fence.get("updatedAt"),
    }


def _default_scope_fields(current_user: dict) -> dict:
    return {
        "branch_id": current_user.get("branch_id") or current_user.get("department_id"),
        "project_id": current_user.get("project_id"),
        "grid_id": current_user.get("grid_id"),
        "team_id": current_user.get("team_id"),
    }


@router.get("/list", response_model=List[FenceItem])
def get_fences(current_user: dict = Depends(get_current_user)):
    """获取所有围栏"""
    fences = fence_service.get_fences(current_user=current_user)
    result = []
    for fence in fences:
        fence_item = {
            "id": str(fence.get("fence_id") or fence.get("id") or ""),
            "name": fence.get("name"),
            "company": fence.get("company"),
            "project": fence.get("project"),
            "branch_id": fence.get("branch_id"),
            "project_id": fence.get("project_id"),
            "grid_id": fence.get("grid_id"),
            "team_id": fence.get("team_id"),
            "type": _shape_label(fence),
            "behavior": fence.get("behavior"),
            "severity": fence.get("severity"),
            "schedule": fence.get("schedule"),
            "effective_time": fence.get("effective_time") or "00:00-23:59",
            "center": fence.get("geometry", {}).get("center"),
            "radius": fence.get("geometry", {}).get("radius"),
            "points": fence.get("geometry", {}).get("points"),
            "createdAt": fence.get("createdAt"),
            "updatedAt": fence.get("updatedAt")
        }
        result.append(fence_item)
    return result


@router.get("/teams", response_model=List[WorkTeamItem])
def get_work_teams(current_user: dict = Depends(get_current_user)):
    """获取作业队及其围栏"""
    teams_with_fences = team_service.get_teams_with_fences(current_user=current_user)
    result = []
    for team in teams_with_fences:
        team_item = {
            "id": team.get("team_id"),
            "name": team.get("name"),
            "color": team.get("color"),
            "fences": team.get("fences", [])
        }
        result.append(team_item)
    return result


@router.post("/add", response_model=FenceItem)
def add_fence(payload: FenceCreate, current_user: dict = Depends(get_current_user)):
    """新建围栏"""
    if payload.shape == "circle" and payload.center:
        coordinates_json = json.dumps(payload.center)
    elif payload.shape == "polygon" and payload.points:
        coordinates_json = json.dumps(payload.points)
    else:
        coordinates_json = "[]"

    from app.schemas.fence_schema import FenceCreate as ServiceFenceCreate
    from app.schemas.fence_schema import AlarmLevel

    severity_map = {
        "normal": AlarmLevel.LOW,
        "risk": AlarmLevel.MEDIUM,
        "severe": AlarmLevel.HIGH
    }
    alarm_type = severity_map.get(payload.severity, AlarmLevel.MEDIUM)

    service_shape = payload.shape
    if service_shape != "circle":
        service_shape = "polygon"

    service_payload = ServiceFenceCreate(
        name=payload.name,
        project_region_id=None,
        shape=service_shape,
        behavior=payload.behavior,
        coordinates_json=coordinates_json,
        radius=payload.radius,
        effective_time="00:00-23:59",
        remark="",
        alarm_type=alarm_type
    )

    scope_fields = {
        **_default_scope_fields(current_user),
        "branch_id": payload.branch_id or _default_scope_fields(current_user).get("branch_id"),
        "project_id": payload.project_id or _default_scope_fields(current_user).get("project_id"),
        "grid_id": payload.grid_id or _default_scope_fields(current_user).get("grid_id"),
        "team_id": payload.team_id or _default_scope_fields(current_user).get("team_id"),
        "grid": payload.grid,
        "team": payload.team,
    }

    draft_fence = {
        **scope_fields,
        "company": payload.company,
        "project": payload.project,
    }
    if not _fence_visible(draft_fence, current_user):
        raise HTTPException(status_code=403, detail="无权在该范围创建围栏")

    new_fence = fence_service.create_fence(
        service_payload,
        company=payload.company,
        project=payload.project,
        schedule=payload.schedule.model_dump() if payload.schedule else {
            "start": payload.startTime,
            "end": payload.endTime,
        },
        scope_fields=scope_fields,
        current_user=current_user,
    )

    result = {
        "id": new_fence.get("fence_id"),
        "name": new_fence.get("name"),
        "company": new_fence.get("company", ""),
        "project": new_fence.get("project", ""),
        "grid": new_fence.get("grid", ""),
        "team": new_fence.get("team", ""),
        "branch_id": new_fence.get("branch_id"),
        "project_id": new_fence.get("project_id"),
        "grid_id": new_fence.get("grid_id"),
        "team_id": new_fence.get("team_id"),
        "type": _shape_label(new_fence),
        "behavior": new_fence.get("behavior"),
        "severity": new_fence.get("severity"),
        "schedule": new_fence.get("schedule"),
        "effective_time": new_fence.get("effective_time") or "00:00-23:59",
        "center": new_fence.get("geometry", {}).get("center"),
        "radius": new_fence.get("geometry", {}).get("radius"),
        "points": new_fence.get("geometry", {}).get("points"),
        "createdAt": new_fence.get("createdAt"),
        "updatedAt": new_fence.get("updatedAt")
    }
    return result


class FenceCreateNew(BaseModel):
    name: str
    project_region_id: Optional[int] = None
    shape: str
    behavior: str
    coordinates_json: str
    radius: Optional[float] = None
    effective_time: str
    remark: Optional[str] = None
    alarm_type: str
    deviceIds: Optional[List[str]] = None


class FenceUpdatePayload(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    project: Optional[str] = None
    shape: Optional[str] = None
    type: Optional[str] = None
    behavior: Optional[str] = None
    severity: Optional[str] = None
    alarm_type: Optional[str] = None
    schedule: Optional[Schedule] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    center: Optional[List[float]] = None
    radius: Optional[float] = None
    points: Optional[List[List[float]]] = None
    coordinates_json: Optional[str] = None
    project_region_id: Optional[int] = None
    effective_time: Optional[str] = None
    remark: Optional[str] = None
    is_active: Optional[int | bool] = None
    branch_id: Optional[str | int] = None
    project_id: Optional[str | int] = None
    grid_id: Optional[str | int] = None
    team_id: Optional[str | int] = None


def _service_shape(value: str | None) -> str | None:
    if not value:
        return None
    return "circle" if str(value).lower() == "circle" else "polygon"


def _alarm_level_from_value(value: str | None):
    if not value:
        return None
    from app.schemas.fence_schema import AlarmLevel

    value = str(value).lower()
    severity_map = {
        "normal": AlarmLevel.LOW,
        "general": AlarmLevel.LOW,
        "risk": AlarmLevel.MEDIUM,
        "severe": AlarmLevel.HIGH,
        "low": AlarmLevel.LOW,
        "medium": AlarmLevel.MEDIUM,
        "high": AlarmLevel.HIGH,
    }
    return severity_map.get(value, AlarmLevel.MEDIUM)


def _update_to_service_payload(payload: FenceUpdatePayload) -> tuple[ServiceFenceUpdate, dict, dict]:
    data = payload.model_dump(exclude_unset=True)
    shape = _service_shape(data.get("shape") or data.get("type"))

    coordinates_json = None
    if "coordinates_json" in data:
        coordinates_json = data.get("coordinates_json")
    elif shape == "circle" and data.get("center") is not None:
        coordinates_json = json.dumps(data.get("center"))
    elif shape == "polygon" and data.get("points") is not None:
        coordinates_json = json.dumps(data.get("points"))

    service_update = {}
    if "name" in data:
        service_update["name"] = data["name"]
    if "project_region_id" in data:
        service_update["project_region_id"] = data["project_region_id"]
    if shape:
        service_update["shape"] = shape
    if "behavior" in data:
        service_update["behavior"] = data["behavior"]
    if coordinates_json is not None:
        service_update["coordinates_json"] = coordinates_json
    if "radius" in data:
        service_update["radius"] = data["radius"]
    if "effective_time" in data:
        service_update["effective_time"] = data["effective_time"]
    if "remark" in data:
        service_update["remark"] = data["remark"]
    if "is_active" in data:
        service_update["is_active"] = int(bool(data["is_active"]))
    alarm_type = _alarm_level_from_value(data.get("alarm_type") or data.get("severity"))
    if alarm_type:
        service_update["alarm_type"] = alarm_type

    metadata_updates = {}
    if "company" in data:
        metadata_updates["company"] = data["company"]
    if "project" in data:
        metadata_updates["project"] = data["project"]
    if payload.schedule:
        metadata_updates["schedule"] = payload.schedule.model_dump()
    elif data.get("startTime") or data.get("endTime"):
        metadata_updates["schedule"] = {
            "start": data.get("startTime"),
            "end": data.get("endTime"),
        }

    scope_fields = {
        key: data[key]
        for key in ("branch_id", "project_id", "grid_id", "team_id")
        if key in data
    }
    return ServiceFenceUpdate(**service_update), metadata_updates, scope_fields


@router.post("/", response_model=FenceItem)
def create_fence_new(payload: FenceCreateNew, current_user: dict = Depends(get_current_user)):
    """新建围栏(新API格式)"""
    coordinates_json = payload.coordinates_json
    try:
        coordinates = json.loads(coordinates_json)
    except:
        coordinates = []
        coordinates_json = "[]"

    from app.schemas.fence_schema import FenceCreate as ServiceFenceCreate
    from app.schemas.fence_schema import AlarmLevel

    alarm_type_map = {
        "low": AlarmLevel.LOW,
        "medium": AlarmLevel.MEDIUM,
        "high": AlarmLevel.HIGH
    }
    alarm_type = alarm_type_map.get(payload.alarm_type, AlarmLevel.MEDIUM)

    service_shape = payload.shape
    if service_shape != "circle":
        service_shape = "polygon"

    service_payload = ServiceFenceCreate(
        name=payload.name,
        project_region_id=payload.project_region_id,
        shape=service_shape,
        behavior=payload.behavior,
        coordinates_json=coordinates_json,
        radius=payload.radius,
        effective_time=payload.effective_time,
        remark=payload.remark or "",
        alarm_type=alarm_type
    )

    scope_fields = _default_scope_fields(current_user)
    if not _fence_visible(scope_fields, current_user):
        raise HTTPException(status_code=403, detail="无权在该范围创建围栏")

    new_fence = fence_service.create_fence(
        service_payload,
        company=current_user.get("company") or current_user.get("department") or "",
        project=current_user.get("project") or "",
        scope_fields=scope_fields,
        current_user=current_user,
    )

    result = {
        "id": new_fence.get("fence_id"),
        "name": new_fence.get("name"),
        "company": new_fence.get("company", ""),
        "project": new_fence.get("project", ""),
        "type": _shape_label(new_fence),
        "behavior": new_fence.get("behavior"),
        "severity": new_fence.get("severity"),
        "schedule": new_fence.get("schedule"),
        "center": new_fence.get("geometry", {}).get("center"),
        "radius": new_fence.get("geometry", {}).get("radius"),
        "points": new_fence.get("geometry", {}).get("points"),
        "createdAt": new_fence.get("createdAt"),
        "updatedAt": new_fence.get("updatedAt")
    }
    return result


@router.put("/{fence_id}", response_model=FenceItem)
def update_fence(fence_id: str, payload: FenceUpdatePayload, current_user: dict = Depends(get_current_user)):
    """更新围栏"""
    service_payload, metadata_updates, scope_fields = _update_to_service_payload(payload)
    if scope_fields or any(key in metadata_updates for key in ("company", "project")):
        draft_fence = {
            **_default_scope_fields(current_user),
            **scope_fields,
            "company": metadata_updates.get("company"),
            "project": metadata_updates.get("project"),
        }
        if not _fence_visible(draft_fence, current_user):
            raise HTTPException(status_code=403, detail="无权将围栏更新到该范围")

    updated_fence = fence_service.update_fence(
        fence_id,
        service_payload,
        current_user=current_user,
        metadata_updates=metadata_updates,
        scope_fields=scope_fields,
    )
    if not updated_fence:
        raise HTTPException(status_code=404, detail="Fence not found")
    return _fence_to_item(updated_fence)


@router.delete("/delete/{fence_id}")
def delete_fence(fence_id: str, current_user: dict = Depends(get_current_user)):
    """删除围栏"""
    success = fence_service.delete_fence(fence_id, current_user=current_user)
    if not success:
        raise HTTPException(status_code=404, detail="Fence not found")
    return {"status": "success"}


@router.delete("/{fence_id}")
def delete_fence_short(fence_id: str, current_user: dict = Depends(get_current_user)):
    """删除围栏(兼容 /fence/{id})"""
    return delete_fence(fence_id, current_user)


@router.get("/regions", response_model=List[RegionItem])
def get_regions(current_user: dict = Depends(get_current_user)):
    """获取所有项目区域"""
    return [region for region in REGIONS if _fence_visible(region, current_user)]


@router.get("/generate/{fence_id}")
def generate_fence(fence_id: str, current_user: dict = Depends(get_current_user)):
    """根据围栏ID生成围栏"""
    fence = fence_service.get_fence_by_id(fence_id, current_user=current_user)
    if not fence:
        raise HTTPException(status_code=404, detail="Fence not found")
    return fence


@router.get("/stats")
def get_stats(current_user: dict = Depends(get_current_user)):
    """获取围栏统计信息"""
    fences = fence_service.get_fences(current_user=current_user)
    return {
        "total": len(fences),
        "active": len([f for f in fences if f.get("is_active", True)]),
        "by_shape": {
            "circle": len([f for f in fences if f.get("shape") == "circle"]),
            "polygon": len([f for f in fences if f.get("shape") == "polygon"])
        }
    }


@router.post("/collect/points", response_model=CollectPointsResponse)
def start_collect_points():
    """开始一次新的围栏顶点收集,清空上一次会话结果."""
    return fence_collect_service.start_session()


@router.get("/collect/points", response_model=CollectPointsResponse)
def get_collect_points():
    """获取当前收集会话中已收到的唯一设备点位."""
    return fence_collect_service.get_snapshot()


@router.delete("/collect/points")
def stop_collect_points():
    """结束本次收集会话并清空缓存点位."""
    snapshot = fence_collect_service.stop_session()
    return {"status": "success", "last_snapshot": snapshot}


@router.post("/collect/debug-point", response_model=CollectPointsResponse)
def collect_debug_point(payload: DebugCollectPointRequest | List[DebugCollectPointRequest]):
    """调试入口:手动写入一个或多个设备点位到当前收集会话."""
    items = payload if isinstance(payload, list) else [payload]

    accepted_any = False
    for item in items:
        accepted = fence_collect_service.record_point(
            device_id=item.device_id,
            lat=item.lat,
            lng=item.lng,
        )
        accepted_any = accepted_any or accepted

    if not accepted_any:
        raise HTTPException(status_code=409, detail="Collect session is not active")
    return fence_collect_service.get_snapshot()

    # =========================
    # TODO: 以下轨迹回放接口待迁移到 MongoDB 后恢复,目前使用 SQL 模型 DeviceLocationHistory
    # =========================

    # @router.get("/location/history")
    # def get_location_history(
    #     device_id: str = Query(..., description="设备ID"),
    #     start_time: Optional[str] = Query(None, description="开始时间 ISO 格式"),
    #     end_time: Optional[str] = Query(None, description="结束时间 ISO 格式"),
    #     hours: Optional[int] = Query(24, description="查询最近N小时的数据(当不指定起止时间时)"),
    # ):
    #     """查询设备历史轨迹数据"""
    #     db = SessionLocal()
    #
    #     query = db.query(DeviceLocationHistory).filter(DeviceLocationHistory.device_id == device_id)
    #
    #     if start_time and end_time:
    #         try:
    #             start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
    #             end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
    #             query = query.filter(
    #                 and_(
    #                     DeviceLocationHistory.timestamp >= start_dt,
    #                     DeviceLocationHistory.timestamp <= end_dt
    #                 )
    #             )
    #         except Exception:
    #             pass
    #     else:
    #         cutoff_time = datetime.now() - timedelta(hours=hours)
    #         query = query.filter(DeviceLocationHistory.timestamp >= cutoff_time)
    #
    #     locations = query.order_by(DeviceLocationHistory.timestamp).all()
    #
    #     result = []
    #     for loc in locations:
    #         result.append({
    #             "lat": loc.latitude,
    #             "lng": loc.longitude,
    #             "speed": loc.speed,
    #             "direction": loc.direction,
    #             "time": loc.timestamp.isoformat()
    #         })
    #
    #     db.close()
    #
    #     return {
    #         "device_id": device_id,
    #         "points": result,
    #         "count": len(result)
    #     }

    # @router.get("/location/devices/history")
    # def get_all_devices_history_summary(
    #     days: int = Query(7, description="最近N天"),
    # ):
    #     """获取所有设备最近N天的轨迹摘要(用于轨迹回放列表)"""
    #     db = SessionLocal()
    #
    #     cutoff_time = datetime.now() - timedelta(days=days)
    #
    #     from sqlalchemy import func
    #
    #     locations = db.query(
    #         DeviceLocationHistory.device_id,
    #         func.min(DeviceLocationHistory.timestamp).label("start_time"),
    #         func.max(DeviceLocationHistory.timestamp).label("end_time"),
    #         func.count(DeviceLocationHistory.id).label("point_count")
    #     ).filter(
    #         DeviceLocationHistory.timestamp >= cutoff_time
    #     ).group_by(
    #         DeviceLocationHistory.device_id
    #     ).all()
    #
    #     result = []
    #     for row in locations:
    #         result.append({
    #             "deviceId": row.device_id,
    #             "deviceName": f"定位设备-{row.device_id}",
    #             "holder": "",
    #             "company": "默认公司",
    #             "project": "默认项目",
    #             "team": "默认班组",
    #             "startTime": row.start_time.isoformat() if row.start_time else None,
    #             "endTime": row.end_time.isoformat() if row.end_time else None,
    #             "pointCount": row.point_count
    #         })
    #
    #     db.close()
    #
    #     return {
    #         "tracks": result
    #     }
