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
    description: str | None = None
    location: str | None = None
    status: str = "pending"

class AlarmUpdate(BaseModel):
    status: str | None = None
    description: str | None = None
    severity: str | None = None
    handler: str | None = None
    remark: str | None = None

class AlarmOut(AlarmCreate):
    id: int
    project_id: int | None = None
    timestamp: datetime
    handled_at: datetime | None = None
    recording_path: Optional[str] = None
    alarm_image_path: Optional[str] = None
    recording_status: str = "pending"
    recording_error: Optional[str] = None
    device_name: str | None = None
    person_name: str | None = None
    person_label: str | None = None
    source_type: str | None = None
    
    
    class Config:
        from_attributes=True
