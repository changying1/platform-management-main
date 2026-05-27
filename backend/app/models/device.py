from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Float
from sqlalchemy.orm import relationship
from app.core.database import Base

class Device(Base):
    __tablename__ = "devices"

    # Camera ID (often the primary identifier for Hikvision/Helmet)
    id = Column(String(50), primary_key=True, index=True) 
    device_name = Column(String(100))
    device_type = Column(String(50)) # e.g., "HIKVISION_PTZ", "HELMET_CAM"
    ip_address = Column(String(50))
    port = Column(Integer, default=8000)
    stream_url = Column(String(200)) # RTSP/RTMP url
    is_online = Column(Boolean, default=False)
    
    # Last known location
    last_latitude = Column(Float, nullable=True)
    last_longitude = Column(Float, nullable=True)
    
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="devices")
    
    # alarms = relationship("AlarmRecord", back_populates="device")
