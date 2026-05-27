from pydantic import BaseModel
from datetime import datetime
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class AlarmCreate(BaseModel):
    device_id: str
    fence_id: int | None = None
    project_id: int | None = None
    alarm_type: str
    severity: str
    description: str
    location: str | None = None
    status: str = "pending"

class AlarmUpdate(BaseModel):
    status: str | None = None
    description: str | None = None
    severity: str | None = None

class AlarmOut(AlarmCreate):
    id: int
    project_id: int | None = None
    timestamp: datetime
    handled_at: datetime | None = None
    recording_path: Optional[str] = None
    alarm_image_path: Optional[str] = None
    recording_status: str = "pending"
    recording_error: Optional[str] = None
    device_name: Optional[str] = None
    person_name: Optional[str] = None
    personnel_id: Optional[str] = None
    image_url: Optional[str] = None
    snapshot_url: Optional[str] = None
    picture_url: Optional[str] = None
    video_url: Optional[str] = None
    clip_url: Optional[str] = None
    duration: Optional[int] = None
    duration_seconds: Optional[int] = None
    video_duration: Optional[int] = None
    clip_duration: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    error_message: Optional[str] = None
    
    
    class Config:
        from_attributes=True
