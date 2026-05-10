from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db, get_mongo_collection
from app.models.project import Project
from app.models.admin_user import User
from app.models.fence import ProjectRegion, ElectronicFence
from app.schemas.project_schema import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListItem,
    UserBasic,
    DeviceBasic,
    RegionBasic
)

router = APIRouter(prefix="/projects", tags=["Projects"])

# MongoDB 设备集合（用于获取项目设备数量）
devices_collection = get_mongo_collection("device")

@router.get("/", response_model=List[ProjectListItem])
def get_projects(
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    获取项目列表（包含统计信息）
    可选参数: search - 按项目名称搜索
    """
    query = db.query(Project)
    
    # 搜索过滤
    if search:
        query = query.filter(Project.name.contains(search))
    
    projects = query.all()
    
    # 构建响应，包含统计信息
    result = []
    for project in projects:
        # 统计电子围栏数量（通过项目区域关联）
        fence_count = 0
        for region in project.regions:
            fence_count += len(region.fences)
        
        # 从 MongoDB 获取设备数量（避免使用缺失的 project_devices 表）
        device_count = devices_collection.count_documents({"project": project.name})
        
        result.append(ProjectListItem(
            id=project.id,
            name=project.name,
            description=project.description,
            manager=project.manager,
            status=project.status,
            remark=project.remark,
            branch_id=project.branch_id,
            user_count=len(project.users),
            device_count=device_count,
            region_count=len(project.regions),
            fence_count=fence_count
        ))
    
    return result

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    """
    获取项目详情（包含所有关联数据）
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    # 从 MongoDB 获取项目的设备列表（避免使用缺失的 project_devices 表）
    mongo_devices = list(devices_collection.find({"project": project.name}))
    devices_response = []
    for dev in mongo_devices:
        devices_response.append(DeviceBasic(
            id=dev.get("device_id") or dev.get("id") or "",
            device_name=dev.get("name") or dev.get("device_name") or "",
            device_type=dev.get("type") or "",
            is_online=dev.get("status") == "online"
        ))
    
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        manager=project.manager,
        status=project.status,
        remark=project.remark,
        branch_id=project.branch_id,
        users=[UserBasic.from_orm(u) for u in project.users],
        devices=devices_response,
        regions=[RegionBasic.from_orm(r) for r in project.regions]
    )

@router.post("/", response_model=ProjectResponse)
def create_project(project_data: ProjectCreate, db: Session = Depends(get_db)):
    """
    创建新项目
    """
    # 创建项目基本信息
    new_project = Project(
        name=project_data.name,
        description=project_data.description,
        manager=project_data.manager,
        status=project_data.status,
        remark=project_data.remark,
        branch_id=project_data.branch_id
    )
    
    # 添加关联的用户
    if project_data.user_ids:
        users = db.query(User).filter(User.id.in_(project_data.user_ids)).all()
        new_project.users = users
    
    # 设备关联不再使用 SQLAlchemy（避免缺失的 project_devices 表）
    # 设备通过 MongoDB 的 project 字段关联
    
    # 添加关联的项目区域
    if project_data.region_ids:
        regions = db.query(ProjectRegion).filter(ProjectRegion.id.in_(project_data.region_ids)).all()
        # 更新区域的project_id
        for region in regions:
            region.project_id = None  # 先设为None，稍后会被设置
        new_project.regions = regions
    
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    
    # 从 MongoDB 获取项目的设备列表
    mongo_devices = list(devices_collection.find({"project": new_project.name}))
    devices_response = []
    for dev in mongo_devices:
        devices_response.append(DeviceBasic(
            id=dev.get("device_id") or dev.get("id") or "",
            device_name=dev.get("name") or dev.get("device_name") or "",
            device_type=dev.get("type") or "",
            is_online=dev.get("status") == "online"
        ))
    
    return ProjectResponse(
        id=new_project.id,
        name=new_project.name,
        description=new_project.description,
        manager=new_project.manager,
        status=new_project.status,
        remark=new_project.remark,
        branch_id=new_project.branch_id,
        users=[UserBasic.from_orm(u) for u in new_project.users],
        devices=devices_response,
        regions=[RegionBasic.from_orm(r) for r in new_project.regions]
    )

@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    db: Session = Depends(get_db)
):
    """
    更新项目信息
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    # 更新基本字段
    if project_data.name is not None:
        project.name = project_data.name
    if project_data.description is not None:
        project.description = project_data.description
    if project_data.manager is not None:
        project.manager = project_data.manager
    if project_data.status is not None:
        project.status = project_data.status
    if project_data.remark is not None:
        project.remark = project_data.remark
    if project_data.branch_id is not None:
        project.branch_id = project_data.branch_id
    
    # 更新用户关联
    if project_data.user_ids is not None:
        users = db.query(User).filter(User.id.in_(project_data.user_ids)).all()
        project.users = users
    
    # 设备关联不再使用 SQLAlchemy（避免缺失的 project_devices 表）
    # 设备通过 MongoDB 的 project 字段关联
    
    # 更新项目区域关联
    if project_data.region_ids is not None:
        # 先清除旧区域的project_id
        for old_region in project.regions:
            old_region.project_id = None
        
        # 设置新区域
        regions = db.query(ProjectRegion).filter(ProjectRegion.id.in_(project_data.region_ids)).all()
        for region in regions:
            region.project_id = project_id
        project.regions = regions
    
    db.commit()
    db.refresh(project)
    
    # 从 MongoDB 获取项目的设备列表
    mongo_devices = list(devices_collection.find({"project": project.name}))
    devices_response = []
    for dev in mongo_devices:
        devices_response.append(DeviceBasic(
            id=dev.get("device_id") or dev.get("id") or "",
            device_name=dev.get("name") or dev.get("device_name") or "",
            device_type=dev.get("type") or "",
            is_online=dev.get("status") == "online"
        ))
    
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        manager=project.manager,
        status=project.status,
        remark=project.remark,
        branch_id=project.branch_id,
        users=[UserBasic.from_orm(u) for u in project.users],
        devices=devices_response,
        regions=[RegionBasic.from_orm(r) for r in project.regions]
    )

@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    """
    删除项目
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    # 清除项目区域的project_id引用
    for region in project.regions:
        region.project_id = None
    
    db.delete(project)
    db.commit()
    
    return {"message": "项目已删除"}

@router.get("/{project_id}/fences")
def get_project_fences(project_id: int, db: Session = Depends(get_db)):
    """
    获取项目的所有电子围栏（通过项目区域关联）
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    # 收集所有项目区域的围栏
    fences = []
    for region in project.regions:
        for fence in region.fences:
            fences.append({
                "id": fence.id,
                "name": fence.name,
                "region_name": region.name,
                "region_id": region.id,
                "shape": fence.shape.value if hasattr(fence.shape, 'value') else fence.shape,
                "behavior": fence.behavior,
                "alarm_type": fence.alarm_type.value if hasattr(fence.alarm_type, 'value') else fence.alarm_type,
                "is_active": fence.is_active,
                "worker_count": fence.worker_count
            })
    
    return fences
