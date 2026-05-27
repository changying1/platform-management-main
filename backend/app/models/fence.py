from sqlalchemy import Column, Integer, String, Text, Float, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class AlarmLevel(str, enum.Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class FenceShape(str, enum.Enum):
    POLYGON = "polygon"
    CIRCLE = "circle"

class ProjectRegion(Base):
    __tablename__ = "project_regions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), index=True, comment="项目区域名字")
    coordinates_json = Column(Text, comment="多边形顶点坐标JSON")
    remark = Column(String(255), comment="区域备注")
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, comment="所属项目ID")
    
    # Relationships
    project = relationship("Project", back_populates="regions")
    fences = relationship("ElectronicFence", back_populates="project_region")

class ElectronicFence(Base):
    __tablename__ = "electronic_fences"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), index=True, comment="围栏名字")
    project_region_id = Column(Integer, ForeignKey("project_regions.id"), nullable=True, comment="所属项目区域ID")
    
    # New fields for shape support
    shape = Column(SQLEnum(FenceShape), default=FenceShape.POLYGON, comment="围栏形状: polygon, circle")
    behavior = Column(String(50), default="No Exit", comment="管控类型: No Entry (禁入), No Exit (禁出)")
    coordinates_json = Column(Text, comment="坐标JSON: 多边形为点数组, 圆形为圆心坐标")
    radius = Column(Float, nullable=True, comment="半径(米), 仅圆形围栏有效")

    effective_time = Column(String(50), comment="生效时间,格式如5.00-23.00")
    worker_count = Column(Integer, default=0, comment="违规人数 (禁入时为区内人数,禁出时为区外人数)")
    remark = Column(String(255), comment="围栏备注")
    alarm_type = Column(SQLEnum(AlarmLevel), default=AlarmLevel.MEDIUM, comment="报警类型")
    is_active = Column(Integer, default=1, comment="是否启用 1-启用 0-禁用")

    # Relationships
    project_region = relationship("ProjectRegion", back_populates="fences")
