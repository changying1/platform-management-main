from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class WorkType(Base):
    """
    工种模型，用于管理工种信息
    """
    __tablename__ = "work_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), index=True, comment="工种名称")
    description = Column(String(255), nullable=True, comment="工种描述")
    team_id = Column(Integer, ForeignKey('teams.id'), nullable=True, comment="所属工队")
    
    # 关系
    team = relationship("Team", back_populates="work_types")
