from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class Team(Base):
    """
    工队模型，用于管理工队信息
    """
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), index=True, comment="工队名称")
    description = Column(String(255), nullable=True, comment="工队描述")
    grid_id = Column(Integer, ForeignKey('grids.id'), nullable=True, comment="所属网格")
    
    # 关系
    grid = relationship("Grid", backref="teams")
    work_types = relationship("WorkType", back_populates="team")
