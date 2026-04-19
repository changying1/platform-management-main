from fastapi import APIRouter, HTTPException
from typing import List
from pydantic import BaseModel
from app.schemas.team_schema import TeamCreate, TeamUpdate, TeamItem, TeamWithFences
from app.services.Fence.team_service import team_service

router = APIRouter(prefix="/team", tags=["作业队"])


class TeamCreateRequest(BaseModel):
    name: str
    color: str
    company: str = ""
    project: str = ""
    fence_ids: List[str] = []


class TeamUpdateRequest(BaseModel):
    name: str = None
    color: str = None
    company: str = None
    project: str = None
    fence_ids: List[str] = None


@router.get("/list", response_model=List[TeamItem])
def get_teams():
    """获取所有作业队"""
    teams = team_service.get_teams()
    result = []
    for team in teams:
        team_item = {
            "team_id": team.get("team_id"),
            "name": team.get("name"),
            "color": team.get("color"),
            "company": team.get("company", ""),
            "project": team.get("project", ""),
            "fence_ids": team.get("fence_ids", []),
            "createdAt": team.get("createdAt"),
            "updatedAt": team.get("updatedAt")
        }
        result.append(team_item)
    return result


@router.get("/teams", response_model=List[TeamWithFences])
def get_teams_with_fences():
    """获取所有作业队及其关联的围栏详情"""
    return team_service.get_teams_with_fences()


@router.get("/{team_id}", response_model=TeamItem)
def get_team(team_id: str):
    """根据team_id获取作业队"""
    team = team_service.get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="作业队不存在")
    return {
        "team_id": team.get("team_id"),
        "name": team.get("name"),
        "color": team.get("color"),
        "company": team.get("company", ""),
        "project": team.get("project", ""),
        "fence_ids": team.get("fence_ids", []),
        "createdAt": team.get("createdAt"),
        "updatedAt": team.get("updatedAt")
    }


@router.post("/add", response_model=TeamItem)
def add_team(payload: TeamCreateRequest):
    """创建作业队"""
    team_data = TeamCreate(
        name=payload.name,
        color=payload.color,
        company=payload.company,
        project=payload.project,
        fence_ids=payload.fence_ids
    )
    new_team = team_service.create_team(team_data)
    return {
        "team_id": new_team.get("team_id"),
        "name": new_team.get("name"),
        "color": new_team.get("color"),
        "company": new_team.get("company", ""),
        "project": new_team.get("project", ""),
        "fence_ids": new_team.get("fence_ids", []),
        "createdAt": new_team.get("createdAt"),
        "updatedAt": new_team.get("updatedAt")
    }


@router.put("/update/{team_id}", response_model=TeamItem)
def update_team(team_id: str, payload: TeamUpdateRequest):
    """更新作业队"""
    team_data = TeamUpdate(
        name=payload.name,
        color=payload.color,
        company=payload.company,
        project=payload.project,
        fence_ids=payload.fence_ids
    )
    updated_team = team_service.update_team(team_id, team_data)
    if not updated_team:
        raise HTTPException(status_code=404, detail="作业队不存在")
    return {
        "team_id": updated_team.get("team_id"),
        "name": updated_team.get("name"),
        "color": updated_team.get("color"),
        "company": updated_team.get("company", ""),
        "project": updated_team.get("project", ""),
        "fence_ids": updated_team.get("fence_ids", []),
        "createdAt": updated_team.get("createdAt"),
        "updatedAt": updated_team.get("updatedAt")
    }


@router.delete("/delete/{team_id}")
def delete_team(team_id: str):
    """删除作业队"""
    success = team_service.delete_team(team_id)
    if not success:
        raise HTTPException(status_code=404, detail="作业队不存在")
    return {"message": "作业队删除成功"}


@router.post("/{team_id}/fence/{fence_id}", response_model=TeamItem)
def add_fence_to_team(team_id: str, fence_id: str):
    """添加围栏到作业队"""
    updated_team = team_service.add_fence_to_team(team_id, fence_id)
    if not updated_team:
        raise HTTPException(status_code=404, detail="作业队不存在")
    return {
        "team_id": updated_team.get("team_id"),
        "name": updated_team.get("name"),
        "color": updated_team.get("color"),
        "company": updated_team.get("company", ""),
        "project": updated_team.get("project", ""),
        "fence_ids": updated_team.get("fence_ids", []),
        "createdAt": updated_team.get("createdAt"),
        "updatedAt": updated_team.get("updatedAt")
    }


@router.delete("/{team_id}/fence/{fence_id}", response_model=TeamItem)
def remove_fence_from_team(team_id: str, fence_id: str):
    """从作业队移除围栏"""
    updated_team = team_service.remove_fence_from_team(team_id, fence_id)
    if not updated_team:
        raise HTTPException(status_code=404, detail="作业队不存在")
    return {
        "team_id": updated_team.get("team_id"),
        "name": updated_team.get("name"),
        "color": updated_team.get("color"),
        "company": updated_team.get("company", ""),
        "project": updated_team.get("project", ""),
        "fence_ids": updated_team.get("fence_ids", []),
        "createdAt": updated_team.get("createdAt"),
        "updatedAt": updated_team.get("updatedAt")
    }