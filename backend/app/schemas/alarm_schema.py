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
    handler: str | None = None
    remark: str | None = None

class AlarmOut(AlarmCreate):
    id: int
    project_id: int | None = None
    branch_id: Optional[int | str] = None
    branch_name: Optional[str] = None
    company: Optional[str] = None
    project_name: Optional[str] = None
    project: Optional[str] = None
    grid_id: Optional[str] = None
    grid_name: Optional[str] = None
    grid: Optional[str] = None
    team_id: Optional[int | str] = None
    team_name: Optional[str] = None
    team: Optional[str] = None
    trigger_person_name: Optional[str] = None
    trigger_person_id: Optional[str] = None
    timestamp: datetime
    handled_at: datetime | None = None
    recording_path: Optional[str] = None
    alarm_image_path: Optional[str] = None
    recording_status: str = "pending"
    recording_error: Optional[str] = None
    device_name: Optional[str] = None
    person_name: Optional[str] = None
    personnel_id: Optional[str] = None
    alarm_boxes: Optional[list[dict]] = None
    image_url: Optional[str] = None
    snapshot_url: Optional[str] = None
    picture_url: Optional[str] = None
    video_url: Optional[str] = None
    clip_url: Optional[str] = None
    duration: Optional[float] = None
    duration_seconds: Optional[float] = None
    alarm_second: Optional[int] = None
    recording_start_time: Optional[datetime] = None
    recording_end_time: Optional[datetime] = None
    recording_time_offset_seconds: Optional[float] = None
    record_anchor_time: Optional[datetime] = None
    box_rendered: Optional[bool] = None
    box_start_second: Optional[int] = None
    box_end_second: Optional[int] = None
    video_duration: Optional[float] = None
    clip_duration: Optional[float] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    error_message: Optional[str] = None
    source_type: Optional[str] = None
    
    
    class Config:
        from_attributes=True
