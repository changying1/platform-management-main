from sqlalchemy import Column, Integer, String, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from app.core.database import Base


class Grid(Base):
    """
    网格模型，用于管理网格化管理的网格信息
    """
    __tablename__ = "grids"

    id = Column(Integer, primary_key=True, index=True)
    grid_id = Column(String(50), unique=True, index=True, comment="网格编号")
    name = Column(String(100), index=True, comment="网格名称")
    level = Column(String(20), comment="网格层级: project, workshop, team, workface")
    description = Column(Text, nullable=True, comment="网格描述")
    bounds_json = Column(Text, nullable=True, comment="网格边界JSON")
    parent_id = Column(Integer, ForeignKey('grids.id'), nullable=True, comment="上级网格")
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=True, comment="所属项目")
    created_at = Column(datetime, default=func.now())
    updated_at = Column(datetime, default=func.now(), onupdate=func.now())
    
    # 关系
    parent = relationship("Grid", remote_side=[id], backref="children")
    project = relationship("Project", backref="grids")
    teams = relationship("Team", back_populates="grid")
