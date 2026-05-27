from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any

class LogCreate(BaseModel):
    operator: str
    action: str
    target_type: str
    target_name: str
    details: Optional[str] = None
    company: Optional[str] = None
    project: Optional[str] = None
    team: Optional[str] = None
    extra: Optional[dict[str, Any]] = None

class LogOut(BaseModel):
    id: int
    operator: str
    action: str
    target_type: str
    target_name: str
    details: Optional[str] = None
    company: Optional[str] = None
    project: Optional[str] = None
    team: Optional[str] = None
    extra: Optional[dict[str, Any]] = None
    time: datetime
    
    class Config:
        from_attributes=True
