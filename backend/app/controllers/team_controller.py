from fastapi import APIRouter, Depends, HTTPException
from typing import List
from pydantic import BaseModel
from app.schemas.team_schema import TeamCreate, TeamUpdate, TeamItem, TeamWithFences
from app.services.Fence.team_service import team_service
from app.core.security import get_current_user
from app.services.audit_log_service import write_audit_log

router = APIRouter(prefix="/team", tags=["作业队"])


def _team_name(team: dict | None, fallback: str = "") -> str:
    if not team:
        return fallback
    return str(team.get("name") or team.get("team_id") or team.get("id") or fallback)


def _team_item(team: dict) -> dict:
    return {
        "team_id": team.get("team_id"),
        "name": team.get("name"),
        "color": team.get("color"),
        "company": team.get("company", ""),
        "project": team.get("project", ""),
        "project_id": team.get("project_id", ""),
        "grid_id": team.get("grid_id", ""),
        "fence_ids": team.get("fence_ids", []),
        "createdAt": team.get("createdAt"),
        "updatedAt": team.get("updatedAt"),
    }


def _write_team_log(
    *,
    current_user: dict,
    action: str,
    team: dict | None,
    before: dict | None = None,
    after: dict | None = None,
    level: str = "info",
    extra: dict | None = None,
) -> None:
    source = after or before or team or {}
    write_audit_log(
        current_user=current_user,
        action=action,
        target_type="team",
        target_name=_team_name(source),
        before=before,
        after=after,
        company=source.get("company"),
        project=str(source.get("project_id") or source.get("project") or "") or None,
        grid=str(source.get("grid_id") or "") or None,
        team=_team_name(source),
        level=level,
        extra={"sub_type": "team", **(extra or {})},
    )


class TeamCreateRequest(BaseModel):
    name: str
    color: str
    company: str = ""
    project: str = ""
    project_id: str = ""
    grid_id: str = ""
    fence_ids: List[str] = []


class TeamUpdateRequest(BaseModel):
    name: str = None
    color: str = None
    company: str = None
    project: str = None
    project_id: str = None
    grid_id: str = None
    fence_ids: List[str] = None


@router.get("/list", response_model=List[TeamItem])
def get_teams(current_user: dict = Depends(get_current_user)):
    """获取所有作业队"""
    teams = team_service.get_teams(current_user=current_user)
    result = []
    for team in teams:
        team_item = {
            "team_id": team.get("team_id"),
            "name": team.get("name"),
            "color": team.get("color"),
            "company": team.get("company", ""),
            "project": team.get("project", ""),
            "project_id": team.get("project_id", ""),
            "grid_id": team.get("grid_id", ""),
            "fence_ids": team.get("fence_ids", []),
            "createdAt": team.get("createdAt"),
            "updatedAt": team.get("updatedAt")
        }
        result.append(team_item)
    return result


@router.get("/teams", response_model=List[TeamWithFences])
def get_teams_with_fences(current_user: dict = Depends(get_current_user)):
    """获取所有作业队及其关联的围栏详情"""
    return team_service.get_teams_with_fences(current_user=current_user)


@router.get("/{team_id}", response_model=TeamItem)
def get_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """根据team_id获取作业队"""
    team = team_service.get_team_by_id(team_id, current_user=current_user)
    if not team:
        raise HTTPException(status_code=404, detail="作业队不存在")
    return {
        "team_id": team.get("team_id"),
        "name": team.get("name"),
        "color": team.get("color"),
        "company": team.get("company", ""),
            "project": team.get("project", ""),
            "project_id": team.get("project_id", ""),
            "grid_id": team.get("grid_id", ""),
        "fence_ids": team.get("fence_ids", []),
        "createdAt": team.get("createdAt"),
        "updatedAt": team.get("updatedAt")
    }


@router.post("/add", response_model=TeamItem)
def add_team(payload: TeamCreateRequest, current_user: dict = Depends(get_current_user)):
    """创建作业队"""
    team_data = TeamCreate(
        name=payload.name,
        color=payload.color,
        company=payload.company,
        project=payload.project,
        project_id=payload.project_id,
        grid_id=payload.grid_id,
        fence_ids=payload.fence_ids
    )
    new_team = team_service.create_team(team_data)
    _write_team_log(
        current_user=current_user,
        action="添加工队",
        team=new_team,
        after=new_team,
    )
    return {
        "team_id": new_team.get("team_id"),
        "name": new_team.get("name"),
        "color": new_team.get("color"),
        "company": new_team.get("company", ""),
        "project": new_team.get("project", ""),
        "project_id": new_team.get("project_id", ""),
        "grid_id": new_team.get("grid_id", ""),
        "fence_ids": new_team.get("fence_ids", []),
        "createdAt": new_team.get("createdAt"),
        "updatedAt": new_team.get("updatedAt")
    }


@router.put("/update/{team_id}", response_model=TeamItem)
def update_team(team_id: str, payload: TeamUpdateRequest, current_user: dict = Depends(get_current_user)):
    """更新作业队"""
    team_data = TeamUpdate(
        name=payload.name,
        color=payload.color,
        company=payload.company,
        project=payload.project,
        project_id=payload.project_id,
        grid_id=payload.grid_id,
        fence_ids=payload.fence_ids
    )
    before = team_service.get_team_by_id(team_id, current_user=current_user)
    updated_team = team_service.update_team(team_id, team_data, current_user=current_user)
    if not updated_team:
        raise HTTPException(status_code=404, detail="作业队不存在")


    _write_team_log(
        current_user=current_user,
        action="变更工队信息",
        team=updated_team,
        before=before,
        after=updated_team,
    )
    return {
        "team_id": updated_team.get("team_id"),
        "name": updated_team.get("name"),
        "color": updated_team.get("color"),
        "company": updated_team.get("company", ""),
        "project": updated_team.get("project", ""),
        "project_id": updated_team.get("project_id", ""),
        "grid_id": updated_team.get("grid_id", ""),
        "fence_ids": updated_team.get("fence_ids", []),
        "createdAt": updated_team.get("createdAt"),
        "updatedAt": updated_team.get("updatedAt")
    }


@router.delete("/delete/{team_id}")
def delete_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """删除作业队"""
    before = team_service.get_team_by_id(team_id, current_user=current_user)
    success = team_service.delete_team(team_id, current_user=current_user)
    if not success:
        raise HTTPException(status_code=404, detail="作业队不存在")
    _write_team_log(
        current_user=current_user,
        action="删除工队",
        team=before,
        before=before,
        level="warning",
    )


    return {"message": "作业队删除成功"}


@router.post("/{team_id}/fence/{fence_id}", response_model=TeamItem)
def add_fence_to_team(team_id: str, fence_id: str, current_user: dict = Depends(get_current_user)):
    """添加围栏到作业队"""
    before = team_service.get_team_by_id(team_id, current_user=current_user)
    updated_team = team_service.add_fence_to_team(team_id, fence_id, current_user=current_user)
    if not updated_team:
        raise HTTPException(status_code=404, detail="作业队不存在")


    _write_team_log(
        current_user=current_user,
        action="工队关联围栏",
        team=updated_team,
        before=before,
        after=updated_team,
        extra={"fence_id": fence_id},
    )
    return {
        "team_id": updated_team.get("team_id"),
        "name": updated_team.get("name"),
        "color": updated_team.get("color"),
        "company": updated_team.get("company", ""),
        "project": updated_team.get("project", ""),
        "project_id": updated_team.get("project_id", ""),
        "grid_id": updated_team.get("grid_id", ""),
        "fence_ids": updated_team.get("fence_ids", []),
        "createdAt": updated_team.get("createdAt"),
        "updatedAt": updated_team.get("updatedAt")
    }


@router.delete("/{team_id}/fence/{fence_id}", response_model=TeamItem)
def remove_fence_from_team(team_id: str, fence_id: str, current_user: dict = Depends(get_current_user)):
    """从作业队移除围栏"""
    before = team_service.get_team_by_id(team_id, current_user=current_user)
    updated_team = team_service.remove_fence_from_team(team_id, fence_id, current_user=current_user)
    if not updated_team:
        raise HTTPException(status_code=404, detail="作业队不存在")


    _write_team_log(
        current_user=current_user,
        action="工队移除围栏",
        team=updated_team,
        before=before,
        after=updated_team,
        extra={"fence_id": fence_id},
    )
    return {
        "team_id": updated_team.get("team_id"),
        "name": updated_team.get("name"),
        "color": updated_team.get("color"),
        "company": updated_team.get("company", ""),
        "project": updated_team.get("project", ""),
        "project_id": updated_team.get("project_id", ""),
        "grid_id": updated_team.get("grid_id", ""),
        "fence_ids": updated_team.get("fence_ids", []),
        "createdAt": updated_team.get("createdAt"),
        "updatedAt": updated_team.get("updatedAt")
    }
