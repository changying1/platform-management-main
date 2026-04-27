from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CallCreate(BaseModel):
    initiator_id: int
    member_ids: List[int]


class GroupCallSessionOut(BaseModel):
    id: int
    room_id: str
    initiator_id: int
    member_ids: List[int] = Field(default_factory=list)
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str


class TtsSendRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to be spoken by JT808 terminals")
    target_phones: List[str] = Field(default_factory=list, description="Target JT808 phone numbers")
    priority: int = Field(default=100, ge=1, le=1000)
    max_retries: int = Field(default=3, ge=0, le=10)
    request_source: str = Field(default="group_call")
    operator: Optional[str] = None


class TtsQueueJobOut(BaseModel):
    id: str
    device_phone: str
    device_name: Optional[str] = None
    status: str
    retry_count: int
    max_retries: int
    jt808_sequence: Optional[int] = None
    sent_at: Optional[datetime] = None
    acked_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    last_error: Optional[str] = None


class TtsBatchOut(BaseModel):
    batch_id: str
    text: str
    request_source: Optional[str] = None
    operator: Optional[str] = None
    created_at: datetime
    requested_count: int
    queued_count: int
    sending_count: int
    acked_count: int
    failed_count: int
    retry_wait_count: int
    jobs: List[TtsQueueJobOut] = Field(default_factory=list)
