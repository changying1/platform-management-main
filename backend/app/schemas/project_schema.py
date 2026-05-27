from pydantic import BaseModel

from typing import List, Optional



# ===== 基础Schema =====



class UserBasic(BaseModel):

    """用户基础信息"""

    id: int

    username: str

    full_name: Optional[str] = None



    class Config:

        from_attributes = True



class DeviceBasic(BaseModel):

    """设备基础信息"""

    id: str

    device_name: str

    device_type: str

    is_online: bool



    class Config:

        from_attributes = True



class RegionBasic(BaseModel):

    """项目区域基础信息"""

    id: int

    name: str

    coordinates_json: str

    remark: Optional[str] = None



    class Config:

        from_attributes = True



class FenceBasic(BaseModel):

    """电子围栏基础信息"""

    id: int

    name: str

    shape: str

    behavior: str

    alarm_type: str

    is_active: int



    class Config:

        from_attributes = True



# ===== 项目相关Schema =====



class ProjectBase(BaseModel):

    """项目基础字段"""

    name: str

    description: Optional[str] = None

    manager: Optional[str] = None

    status: Optional[str] = "active"

    remark: Optional[str] = None



class ProjectCreate(ProjectBase):

    """创建项目"""

    branch_id: Optional[int] = None

    user_ids: List[int] = []

    device_ids: List[str] = []

    region_ids: List[int] = []



class ProjectUpdate(BaseModel):

    """更新项目"""

    name: Optional[str] = None

    description: Optional[str] = None

    manager: Optional[str] = None

    status: Optional[str] = None

    remark: Optional[str] = None

    branch_id: Optional[int] = None

    user_ids: Optional[List[int]] = None

    device_ids: Optional[List[str]] = None

    region_ids: Optional[List[int]] = None



class ProjectResponse(ProjectBase):

    """项目响应(包含关联数据)"""

    id: int

    branch_id: Optional[int] = None

    users: List[UserBasic] = []

    devices: List[DeviceBasic] = []

    regions: List[RegionBasic] = []



    class Config:

        from_attributes = True



class ProjectListItem(ProjectBase):
    """项目列表项(不包含详细关联数据,只显示统计信息)"""
    id: int
    branch_id: Optional[int] = None
    branch_name: Optional[str] = None
    user_count: int
    device_count: int
    region_count: int
    fence_count: int
    alarm_count: int = 0

    class Config:
        from_attributes = True