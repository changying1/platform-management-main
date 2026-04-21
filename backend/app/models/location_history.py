from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime

class DeviceLocationHistory(Base):
    __tablename__ = "device_location_history"

    id = Column(String(64), primary_key=True)
    device_id = Column(String(50), ForeignKey("devices.id"), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    speed = Column(Float, nullable=True)
    direction = Column(Float, nullable=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_device_timestamp', 'device_id', 'timestamp'),
    )
