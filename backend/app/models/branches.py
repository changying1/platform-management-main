from sqlalchemy import Column, Integer, String, Float, Text, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class Branch(Base):
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True, index=True)
    province = Column(String(50), nullable=True, comment="省份")
    name = Column(String(100), nullable=True, comment="分公司名称")
    lng = Column(Float, nullable=True, comment="经度")
    lat = Column(Float, nullable=True, comment="纬度")
    address = Column(String(255), nullable=True, comment="地址")
    project = Column(String(100), nullable=True, comment="项目")
    manager = Column(String(50), nullable=True, comment="负责人")
    phone = Column(String(20), nullable=True, comment="联系电话")
    device_count = Column(Integer, default=0, comment="设备数量")
    status = Column(String(20), default="normal", comment="状态")
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    remark = Column(Text, nullable=True)
