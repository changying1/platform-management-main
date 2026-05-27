import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException
from pymongo import DESCENDING, ReturnDocument

from app.core.database import get_mongo_collection, get_next_sequence
from app.schemas.app_voice_call_schema import AppVoiceParticipant
from app.services.agora_token_service import AgoraTokenService
from app.utils.logger import get_logger

logger = get_logger("AppVoiceCallService")

ROOM_STATUS_CALLING = "calling"
ROOM_STATUS_ACTIVE = "active"
ROOM_STATUS_ENDED = "ended"
ROOM_STATUS_CANCELLED = "cancelled"
ROOM_STATUS_MISSED = "missed"

MEMBER_STATUS_RINGING = "ringing"
MEMBER_STATUS_JOINED = "joined"
MEMBER_STATUS_REJECTED = "rejected"
MEMBER_STATUS_LEFT = "left"
MEMBER_STATUS_MISSED = "missed"

CALLING_EXPIRE_MINUTES = 5
ACTIVE_EXPIRE_HOURS = 2


class AppVoiceCallService:
    def __init__(self):
        self.rooms = get_mongo_collection("app_voice_call_rooms")
        self.records = get_mongo_collection("app_voice_call_records")
        self.uid_map = get_mongo_collection("app_voice_call_uid_map")
        self.agora = AgoraTokenService()

    def _now(self) -> datetime:
        return datetime.utcnow()

    def _identity_key(self, user_id: str, client_type: str = "app") -> str:
        return f"{client_type}:{user_id}"

    def _get_or_create_agora_uid(self, user_id: str, client_type: str = "app") -> int:
        key = self._identity_key(str(user_id), client_type)
        existing = self.uid_map.find_one({"_id": key})
        if existing:
            return int(existing["agora_uid"])

        agora_uid = int(get_next_sequence("app_voice_call_agora_uid"))
        if agora_uid <= 0:
            agora_uid = 1

        doc = self.uid_map.find_one_and_update(
            {"_id": key},
            {
                "$setOnInsert": {
                    "user_id": str(user_id),
                    "client_type": client_type,
                    "agora_uid": agora_uid,
                    "created_at": self._now(),
                }
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return int(doc["agora_uid"])

    def _member_doc(self, participant: AppVoiceParticipant, role: str, status: str) -> dict:
        now = self._now()
        user_id = str(participant.user_id)
        client_type = participant.client_type or "app"
        doc = {
            "user_id": user_id,
            "name": participant.name,
            "client_type": client_type,
            "role": role,
            "status": status,
            "agora_uid": self._get_or_create_agora_uid(user_id, client_type),
            "muted": False,
            "invited_at": now,
            "joined_at": now if status == MEMBER_STATUS_JOINED else None,
            "left_at": None,
            "rejected_at": None,
        }
        return doc

    def _serialize_room(self, room: dict) -> dict:
        return {
            "room_id": room.get("room_id", ""),
            "agora_channel": room.get("agora_channel", room.get("room_id", "")),
            "title": room.get("title"),
            "type": room.get("type", "agora_voice_call"),
            "status": room.get("status", ROOM_STATUS_CALLING),
            "initiator_id": str(room.get("initiator_id", "")),
            "members": room.get("members", []),
            "created_at": room.get("created_at"),
            "updated_at": room.get("updated_at"),
            "started_at": room.get("started_at"),
            "ended_at": room.get("ended_at"),
        }

    def _room_or_404(self, room_id: str) -> dict:
        room = self.rooms.find_one({"room_id": room_id})
        if not room:
            raise HTTPException(status_code=404, detail="App voice call room not found")
        return room

    def create_room(self, initiator: AppVoiceParticipant, members: list[AppVoiceParticipant], title: str | None) -> dict:
        now = self._now()
        room_id = f"avc-{uuid.uuid4().hex[:16]}"
        seen = {self._identity_key(str(initiator.user_id), initiator.client_type)}
        normalized_members = [self._member_doc(initiator, "host", MEMBER_STATUS_JOINED)]

        for member in members:
            key = self._identity_key(str(member.user_id), member.client_type)
            if key in seen:
                continue
            seen.add(key)
            normalized_members.append(self._member_doc(member, "member", MEMBER_STATUS_RINGING))

        if len(normalized_members) < 2:
            raise HTTPException(status_code=400, detail="At least one invited member is required")

        room = {
            "room_id": room_id,
            "agora_channel": room_id,
            "title": title,
            "type": "agora_voice_call",
            "status": ROOM_STATUS_CALLING,
            "initiator_id": str(initiator.user_id),
            "members": normalized_members,
            "created_at": now,
            "updated_at": now,
            "started_at": None,
            "ended_at": None,
        }
        self.rooms.insert_one(room)
        logger.info(f"Created app voice call room {room_id}")
        return self._serialize_room(room)

    def get_room(self, room_id: str) -> dict:
        self._close_stale_open_rooms(room_id=room_id)
        return self._serialize_room(self._room_or_404(room_id))

    def list_rooms_for_user(self, user_id: str, status: str | None = None, limit: int = 50) -> list[dict]:
        self._close_stale_open_rooms(user_id=user_id)
        query = {
            "members": {
                "$elemMatch": {
                    "user_id": str(user_id),
                    "client_type": "app",
                }
            }
        }
        if status:
            query["status"] = status
        else:
            query["status"] = {"$in": [ROOM_STATUS_CALLING, ROOM_STATUS_ACTIVE]}

        docs = list(
            self.rooms.find(query)
            .sort([("updated_at", DESCENDING), ("created_at", DESCENDING)])
            .limit(limit)
        )
        return [self._serialize_room(item) for item in docs]

    def _close_stale_open_rooms(self, user_id: str | None = None, room_id: str | None = None) -> None:
        now = self._now()
        query: dict = {
            "$or": [
                {
                    "status": ROOM_STATUS_CALLING,
                    "created_at": {"$lt": now - timedelta(minutes=CALLING_EXPIRE_MINUTES)},
                },
                {
                    "status": ROOM_STATUS_ACTIVE,
                    "created_at": {"$lt": now - timedelta(hours=ACTIVE_EXPIRE_HOURS)},
                },
            ]
        }
        if user_id:
            query["members"] = {
                "$elemMatch": {
                    "user_id": str(user_id),
                    "client_type": "app",
                    "status": {"$in": [MEMBER_STATUS_RINGING, MEMBER_STATUS_JOINED]},
                }
            }
        if room_id:
            query["room_id"] = room_id

        stale_rooms = list(self.rooms.find(query))
        for room in stale_rooms:
            status = room.get("status")
            members = room.get("members", [])
            for member in members:
                if status == ROOM_STATUS_CALLING and member.get("status") == MEMBER_STATUS_RINGING:
                    member["status"] = MEMBER_STATUS_MISSED
                    member["left_at"] = now
                elif status == ROOM_STATUS_ACTIVE and member.get("status") == MEMBER_STATUS_JOINED:
                    member["status"] = MEMBER_STATUS_LEFT
                    member["left_at"] = now

            next_status = ROOM_STATUS_MISSED if status == ROOM_STATUS_CALLING else ROOM_STATUS_ENDED
            updated = self.rooms.find_one_and_update(
                {"room_id": room.get("room_id")},
                {
                    "$set": {
                        "members": members,
                        "status": next_status,
                        "ended_at": room.get("ended_at") or now,
                        "updated_at": now,
                    }
                },
                return_document=ReturnDocument.AFTER,
            )
            self._upsert_record(updated)

    def list_records(self, limit: int = 100) -> list[dict]:
        docs = list(
            self.records.find({})
            .sort([("ended_at", DESCENDING), ("created_at", DESCENDING)])
            .limit(limit)
        )
        return [self._serialize_record(item) for item in docs]

    def join_room(self, room_id: str, user_id: str, client_type: str) -> dict:
        self._close_stale_open_rooms(room_id=room_id)
        room = self._room_or_404(room_id)
        if room.get("status") in {ROOM_STATUS_ENDED, ROOM_STATUS_CANCELLED, ROOM_STATUS_MISSED}:
            raise HTTPException(status_code=409, detail="Call room is already closed")

        key = self._identity_key(str(user_id), client_type)
        members = room.get("members", [])
        member_found = False
        now = self._now()

        for member in members:
            if self._identity_key(str(member.get("user_id")), member.get("client_type", "app")) == key:
                member_found = True
                member["status"] = MEMBER_STATUS_JOINED
                member["joined_at"] = member.get("joined_at") or now
                member["left_at"] = None
                member["rejected_at"] = None
                member["agora_uid"] = member.get("agora_uid") or self._get_or_create_agora_uid(user_id, client_type)
                break

        if not member_found:
            raise HTTPException(status_code=403, detail="User is not invited to this call room")

        started_at = room.get("started_at") or now
        status = ROOM_STATUS_ACTIVE
        updated = self.rooms.find_one_and_update(
            {"room_id": room_id},
            {
                "$set": {
                    "members": members,
                    "status": status,
                    "started_at": started_at,
                    "updated_at": now,
                }
            },
            return_document=ReturnDocument.AFTER,
        )

        agora_uid = next(
            int(member["agora_uid"])
            for member in members
            if self._identity_key(str(member.get("user_id")), member.get("client_type", "app")) == key
        )
        token_info = self.agora.build_rtc_token(channel_name=room_id, uid=agora_uid)
        return {
            "app_id": token_info["app_id"],
            "room_id": room_id,
            "channel_name": room_id,
            "uid": agora_uid,
            "token": token_info["token"],
            "expire_at": token_info["expire_at"],
            "room": self._serialize_room(updated),
        }

    def leave_room(self, room_id: str, user_id: str, client_type: str) -> dict:
        room = self._room_or_404(room_id)
        members = room.get("members", [])
        now = self._now()
        key = self._identity_key(str(user_id), client_type)

        for member in members:
            if self._identity_key(str(member.get("user_id")), member.get("client_type", "app")) == key:
                member["status"] = MEMBER_STATUS_LEFT
                member["left_at"] = now
                break
        else:
            raise HTTPException(status_code=403, detail="User is not in this call room")

        should_end = not any(member.get("status") == MEMBER_STATUS_JOINED for member in members)
        status = ROOM_STATUS_ENDED if should_end else room.get("status", ROOM_STATUS_ACTIVE)
        update = {
            "members": members,
            "status": status,
            "updated_at": now,
        }
        if should_end:
            update["ended_at"] = now

        updated = self.rooms.find_one_and_update(
            {"room_id": room_id},
            {"$set": update},
            return_document=ReturnDocument.AFTER,
        )
        if should_end:
            self._upsert_record(updated)
        return self._serialize_room(updated)

    def reject_room(self, room_id: str, user_id: str, client_type: str) -> dict:
        room = self._room_or_404(room_id)
        members = room.get("members", [])
        now = self._now()
        key = self._identity_key(str(user_id), client_type)

        for member in members:
            if self._identity_key(str(member.get("user_id")), member.get("client_type", "app")) == key:
                member["status"] = MEMBER_STATUS_REJECTED
                member["rejected_at"] = now
                break
        else:
            raise HTTPException(status_code=403, detail="User is not invited to this call room")

        updated = self.rooms.find_one_and_update(
            {"room_id": room_id},
            {"$set": {"members": members, "updated_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        return self._serialize_room(updated)

    def cancel_room(self, room_id: str, user_id: str, client_type: str) -> dict:
        room = self._room_or_404(room_id)
        if str(room.get("initiator_id")) != str(user_id):
            raise HTTPException(status_code=403, detail="Only the initiator can cancel this call room")

        now = self._now()
        updated = self.rooms.find_one_and_update(
            {"room_id": room_id},
            {
                "$set": {
                    "status": ROOM_STATUS_CANCELLED,
                    "ended_at": now,
                    "updated_at": now,
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        self._upsert_record(updated)
        return self._serialize_room(updated)

    def invite_members(self, room_id: str, members: list[AppVoiceParticipant]) -> dict:
        room = self._room_or_404(room_id)
        if room.get("status") in {ROOM_STATUS_ENDED, ROOM_STATUS_CANCELLED}:
            raise HTTPException(status_code=409, detail="Call room is already closed")

        existing = {
            self._identity_key(str(member.get("user_id")), member.get("client_type", "app"))
            for member in room.get("members", [])
        }
        room_members = room.get("members", [])
        for member in members:
            key = self._identity_key(str(member.user_id), member.client_type)
            if key in existing:
                continue
            existing.add(key)
            room_members.append(self._member_doc(member, "member", MEMBER_STATUS_RINGING))

        updated = self.rooms.find_one_and_update(
            {"room_id": room_id},
            {"$set": {"members": room_members, "updated_at": self._now()}},
            return_document=ReturnDocument.AFTER,
        )
        return self._serialize_room(updated)

    def update_mute(self, room_id: str, user_id: str, muted: bool) -> dict:
        room = self._room_or_404(room_id)
        members = room.get("members", [])
        for member in members:
            if str(member.get("user_id")) == str(user_id):
                member["muted"] = bool(muted)
                break
        else:
            raise HTTPException(status_code=403, detail="User is not in this call room")

        updated = self.rooms.find_one_and_update(
            {"room_id": room_id},
            {"$set": {"members": members, "updated_at": self._now()}},
            return_document=ReturnDocument.AFTER,
        )
        return self._serialize_room(updated)

    def renew_token(self, room_id: str, user_id: str, client_type: str) -> dict:
        room = self._room_or_404(room_id)
        key = self._identity_key(str(user_id), client_type)
        for member in room.get("members", []):
            if self._identity_key(str(member.get("user_id")), member.get("client_type", "app")) == key:
                agora_uid = int(member.get("agora_uid") or self._get_or_create_agora_uid(user_id, client_type))
                token_info = self.agora.build_rtc_token(channel_name=room_id, uid=agora_uid)
                return {
                    "app_id": token_info["app_id"],
                    "room_id": room_id,
                    "channel_name": room_id,
                    "uid": agora_uid,
                    "token": token_info["token"],
                    "expire_at": token_info["expire_at"],
                    "room": self._serialize_room(room),
                }
        raise HTTPException(status_code=403, detail="User is not in this call room")

    def _serialize_record(self, record: dict) -> dict:
        started_at = record.get("started_at")
        ended_at = record.get("ended_at")
        duration = 0
        if started_at and ended_at:
            duration = max(int((ended_at - started_at).total_seconds()), 0)

        return {
            "room_id": record.get("room_id", ""),
            "title": record.get("title"),
            "initiator_id": str(record.get("initiator_id", "")),
            "status": record.get("status", ROOM_STATUS_ENDED),
            "member_count": len(record.get("members", [])),
            "started_at": started_at,
            "ended_at": ended_at,
            "duration_seconds": duration,
            "members": record.get("members", []),
        }

    def _upsert_record(self, room: dict) -> None:
        if not room:
            return
        self.records.update_one(
            {"room_id": room.get("room_id")},
            {
                "$set": {
                    "room_id": room.get("room_id"),
                    "title": room.get("title"),
                    "initiator_id": str(room.get("initiator_id", "")),
                    "status": room.get("status", ROOM_STATUS_ENDED),
                    "members": room.get("members", []),
                    "started_at": room.get("started_at"),
                    "ended_at": room.get("ended_at"),
                    "created_at": room.get("created_at"),
                    "updated_at": self._now(),
                }
            },
            upsert=True,
        )
