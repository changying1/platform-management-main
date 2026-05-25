from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.schemas.app_voice_call_schema import (
    AgoraJoinInfoOut,
    AppVoiceMuteUpdate,
    AppVoiceRecordOut,
    AppVoiceRoomAction,
    AppVoiceRoomCreate,
    AppVoiceRoomInvite,
    AppVoiceRoomOut,
)
from app.services.app_voice_call_service import AppVoiceCallService

router = APIRouter(prefix="/app/call/voice", tags=["App Voice Call"])
ws_router = APIRouter(tags=["App Voice Call WebSocket"])
service = AppVoiceCallService()


class AppVoiceCallSocketManager:
    def __init__(self):
        self.clients: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.clients.setdefault(str(user_id), []).append(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket):
        sockets = self.clients.get(str(user_id), [])
        if websocket in sockets:
            sockets.remove(websocket)
        if not sockets and str(user_id) in self.clients:
            del self.clients[str(user_id)]

    async def send_to_user(self, user_id: str, data: dict):
        disconnected = []
        for websocket in self.clients.get(str(user_id), []):
            try:
                await websocket.send_json(data)
            except Exception:
                disconnected.append(websocket)
        for websocket in disconnected:
            self.disconnect(user_id, websocket)

    async def notify_room_members(self, room: dict, event_type: str, data: dict | None = None):
        payload = {
            "type": event_type,
            "room_id": room.get("room_id"),
            "data": data or {"room": room},
        }
        for member in room.get("members", []):
            await self.send_to_user(str(member.get("user_id")), payload)


socket_manager = AppVoiceCallSocketManager()


@router.post("/rooms", response_model=AppVoiceRoomOut)
async def create_room(payload: AppVoiceRoomCreate):
    room = service.create_room(payload.initiator, payload.members, payload.title)
    await socket_manager.notify_room_members(room, "call_invite", {"room": room})
    return room


@router.get("/rooms", response_model=list[AppVoiceRoomOut])
def list_rooms(
    user_id: str = Query(...),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
):
    return service.list_rooms_for_user(user_id=user_id, status=status, limit=limit)


@router.get("/rooms/{room_id}", response_model=AppVoiceRoomOut)
def get_room(room_id: str):
    return service.get_room(room_id)


@router.post("/rooms/{room_id}/join", response_model=AgoraJoinInfoOut)
async def join_room(room_id: str, payload: AppVoiceRoomAction):
    result = service.join_room(room_id, payload.user_id, payload.client_type)
    await socket_manager.notify_room_members(result["room"], "member_joined", {"room": result["room"], "user_id": payload.user_id})
    return result


@router.post("/rooms/{room_id}/leave", response_model=AppVoiceRoomOut)
async def leave_room(room_id: str, payload: AppVoiceRoomAction):
    room = service.leave_room(room_id, payload.user_id, payload.client_type)
    await socket_manager.notify_room_members(room, "member_left", {"room": room, "user_id": payload.user_id})
    if room["status"] == "ended":
        await socket_manager.notify_room_members(room, "call_ended", {"room": room})
    return room


@router.post("/rooms/{room_id}/reject", response_model=AppVoiceRoomOut)
async def reject_room(room_id: str, payload: AppVoiceRoomAction):
    room = service.reject_room(room_id, payload.user_id, payload.client_type)
    await socket_manager.notify_room_members(room, "member_rejected", {"room": room, "user_id": payload.user_id})
    return room


@router.post("/rooms/{room_id}/cancel", response_model=AppVoiceRoomOut)
async def cancel_room(room_id: str, payload: AppVoiceRoomAction):
    room = service.cancel_room(room_id, payload.user_id, payload.client_type)
    await socket_manager.notify_room_members(room, "call_cancelled", {"room": room})
    return room


@router.post("/rooms/{room_id}/invite", response_model=AppVoiceRoomOut)
async def invite_members(room_id: str, payload: AppVoiceRoomInvite):
    room = service.invite_members(room_id, payload.members)
    await socket_manager.notify_room_members(room, "call_invite", {"room": room, "inviter_id": payload.inviter_id})
    return room


@router.post("/rooms/{room_id}/mute", response_model=AppVoiceRoomOut)
async def update_mute(room_id: str, payload: AppVoiceMuteUpdate):
    room = service.update_mute(room_id, payload.user_id, payload.muted)
    await socket_manager.notify_room_members(room, "member_mute_changed", {"room": room, "user_id": payload.user_id, "muted": payload.muted})
    return room


@router.get("/rooms/{room_id}/agora-token", response_model=AgoraJoinInfoOut)
def renew_token(
    room_id: str,
    user_id: str = Query(...),
    client_type: str = Query(default="app"),
):
    return service.renew_token(room_id, user_id, client_type)


@router.get("/records", response_model=list[AppVoiceRecordOut])
def list_records(limit: int = Query(default=100, ge=1, le=200)):
    return service.list_records(limit=limit)


@ws_router.websocket("/ws/app/call/voice/{user_id}")
async def app_voice_call_ws(websocket: WebSocket, user_id: str):
    await socket_manager.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        socket_manager.disconnect(user_id, websocket)
