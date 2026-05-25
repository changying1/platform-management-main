from sqlalchemy import Column, Integer, String, Table, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.branches import Branch

# 多对多关系表:项目-用户
project_users = Table(
    'project_users',
    Base.metadata,
    Column('project_id', Integer, ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True),
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
)

# 多对多关系表:项目-设备
project_devices = Table(
    'project_devices',
    Base.metadata,
    Column('project_id', Integer, ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True),
    Column('device_id', String(50), ForeignKey('devices.id', ondelete='CASCADE'), primary_key=True)
)

# 项目-项目区域关系:一对多(一个项目可以有多个项目区域)
# 项目区域表已经存在,我们需要给它添加 project_id 外键

class Project(Base):
    """
    项目模型,用于管理项目信息
    """
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), index=True, comment="项目名称")
    description = Column(Text, nullable=True, comment="项目描述")
    manager = Column(String(100), nullable=True, comment="项目经理")
    status = Column(String(20), default="active", comment="项目状态: active, completed, paused")
    remark = Column(String(255), nullable=True, comment="备注信息")
    
    # 新增:关联分公司
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=True, comment="所属分公司")
    branch = relationship("Branch", backref="projects")
    
    # 关系
    # 多对多:项目和用户
    users = relationship("User", secondary=project_users, backref="projects")
    
    # 多对多:项目和设备
    devices = relationship("Device", secondary=project_devices, backref="projects")
    
    # 一对多:项目和项目区域(需要修改 ProjectRegion 模型)
    regions = relationship("ProjectRegion", back_populates="project", cascade="all, delete-orphan")
