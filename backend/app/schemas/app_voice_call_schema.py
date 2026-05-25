from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


ClientType = Literal["app", "web"]
RoomStatus = Literal["calling", "active", "ended", "cancelled", "missed"]
MemberStatus = Literal["invited", "ringing", "joined", "rejected", "left", "missed", "offline"]


class AppVoiceParticipant(BaseModel):
    user_id: str
    name: str | None = None
    client_type: ClientType = "app"


class AppVoiceRoomCreate(BaseModel):
    initiator: AppVoiceParticipant
    members: list[AppVoiceParticipant] = Field(default_factory=list)
    title: str | None = None


class AppVoiceRoomInvite(BaseModel):
    inviter_id: str
    members: list[AppVoiceParticipant] = Field(default_factory=list)


class AppVoiceRoomAction(BaseModel):
    user_id: str
    client_type: ClientType = "app"


class AppVoiceMuteUpdate(BaseModel):
    user_id: str
    muted: bool


class AppVoiceMemberOut(BaseModel):
    user_id: str
    name: str | None = None
    client_type: ClientType = "app"
    role: str = "member"
    status: MemberStatus
    agora_uid: int | None = None
    muted: bool = False
    invited_at: datetime | None = None
    joined_at: datetime | None = None
    left_at: datetime | None = None
    rejected_at: datetime | None = None


class AppVoiceRoomOut(BaseModel):
    room_id: str
    agora_channel: str
    title: str | None = None
    type: str = "agora_voice_call"
    status: RoomStatus
    initiator_id: str
    members: list[AppVoiceMemberOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    ended_at: datetime | None = None


class AgoraJoinInfoOut(BaseModel):
    app_id: str
    room_id: str
    channel_name: str
    uid: int
    token: str
    expire_at: datetime
    room: AppVoiceRoomOut


class AppVoiceRecordOut(BaseModel):
    room_id: str
    title: str | None = None
    initiator_id: str
    status: RoomStatus
    member_count: int
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: int = 0
    members: list[AppVoiceMemberOut] = Field(default_factory=list)


class CallSocketEvent(BaseModel):
    type: str
    room_id: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
