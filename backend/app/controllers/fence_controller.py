"""
围栏模块控制器 —— MongoDB版
提供围栏和作业队的 CRUD 接口。
"""
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services.Fence.fence_service import FenceService
from app.services.Fence.team_service import team_service
from app.schemas.team_schema import WorkTeamItem

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
    type: str
    behavior: str
    severity: str
    schedule: Schedule
    center: Optional[List[float]] = None
    radius: Optional[float] = None
    points: Optional[List[List[float]]] = None
    createdAt: str
    updatedAt: str


class FenceCreate(BaseModel):
    name: str
    company: Optional[str] = ""
    project: Optional[str] = ""
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


REGIONS: List[dict] = [
    {
        "id": "region1",
        "name": "8号线施工区",
        "company": "中铁一局",
        "project": "西安地铁8号线",
        "points": [[34.278, 109.128], [34.286, 109.128], [34.286, 109.138], [34.278, 109.138]],
    },
]


@router.get("/list", response_model=List[FenceItem])
def get_fences():
    """获取所有围栏"""
    fences = fence_service.get_fences()
    result = []
    for fence in fences:
        fence_item = {
            "id": fence.get("fence_id"),
            "name": fence.get("name"),
            "company": fence.get("company"),
            "project": fence.get("project"),
            "type": fence.get("shape").capitalize(),
            "behavior": fence.get("behavior"),
            "severity": fence.get("severity"),
            "schedule": fence.get("schedule"),
            "center": fence.get("geometry", {}).get("center"),
            "radius": fence.get("geometry", {}).get("radius"),
            "points": fence.get("geometry", {}).get("points"),
            "createdAt": fence.get("createdAt"),
            "updatedAt": fence.get("updatedAt")
        }
        result.append(fence_item)
    return result


@router.get("/teams", response_model=List[WorkTeamItem])
def get_work_teams():
    """获取作业队及其围栏"""
    teams_with_fences = team_service.get_teams_with_fences()
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
def add_fence(payload: FenceCreate):
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

    new_fence = fence_service.create_fence(service_payload, company=payload.company, project=payload.project)

    result = {
        "id": new_fence.get("fence_id"),
        "name": new_fence.get("name"),
        "company": new_fence.get("company", ""),
        "project": new_fence.get("project", ""),
        "type": new_fence.get("shape").capitalize(),
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


@router.post("/", response_model=FenceItem)
def create_fence_new(payload: FenceCreateNew):
    """新建围栏（新API格式）"""
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

    new_fence = fence_service.create_fence(service_payload, company="", project="")

    result = {
        "id": new_fence.get("fence_id"),
        "name": new_fence.get("name"),
        "company": new_fence.get("company", ""),
        "project": new_fence.get("project", ""),
        "type": new_fence.get("shape").capitalize(),
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


@router.delete("/delete/{fence_id}")
def delete_fence(fence_id: str):
    """删除围栏"""
    success = fence_service.delete_fence(fence_id)
    if not success:
        raise HTTPException(status_code=404, detail="Fence not found")
    return {"status": "success"}


@router.get("/regions", response_model=List[RegionItem])
def get_regions():
    """获取所有项目区域"""
    return REGIONS


@router.get("/generate/{fence_id}")
def generate_fence(fence_id: str):
    """根据围栏ID生成围栏"""
    fence = fence_service.get_fence_by_id(fence_id)
    if not fence:
        raise HTTPException(status_code=404, detail="Fence not found")
    return fence


@router.get("/stats")
def get_stats():
    """获取围栏统计信息"""
    fences = fence_service.get_fences()
    return {
        "total": len(fences),
        "active": len([f for f in fences if f.get("is_active", True)]),
        "by_shape": {
            "circle": len([f for f in fences if f.get("shape") == "circle"]),
            "polygon": len([f for f in fences if f.get("shape") == "polygon"])
        }
    }