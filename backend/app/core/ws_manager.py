import asyncio
from typing import Optional

from app.core.data_scope import in_scope
from app.core.database import get_mongo_collection


alarm_clients: list[dict] = []

_main_event_loop: Optional[asyncio.AbstractEventLoop] = None


def set_main_event_loop(loop: Optional[asyncio.AbstractEventLoop]):
    global _main_event_loop
    _main_event_loop = loop


def register_alarm_client(websocket, current_user: dict):
    alarm_clients.append({"websocket": websocket, "user": current_user})


def unregister_alarm_client(websocket):
    for client in list(alarm_clients):
        if client.get("websocket") is websocket:
            alarm_clients.remove(client)


def _alarm_scope_kwargs() -> dict:
    return {
        "project_fields": ("project_id",),
        "grid_fields": ("grid_id",),
        "team_fields": ("team_id",),
        "branch_fields": ("branch_id",),
        "company_fields": ("company", "department"),
        "project_name_fields": ("project",),
        "team_name_fields": ("team", "workTeam", "work_team"),
    }


def _visible_to_client(data: dict, current_user: dict) -> bool:
    if not isinstance(data, dict):
        return False

    candidates = [dict(data)]
    device_id = data.get("device_id") or data.get("trigger_device_id")
    fence_id = data.get("fence_id")
    alarm_id = data.get("id") or data.get("alarm_id")

    try:
        if alarm_id not in (None, ""):
            alarm_doc = get_mongo_collection("alarm_record").find_one({
                "$or": [{"id": alarm_id}, {"id": str(alarm_id)}, {"id": int(alarm_id) if str(alarm_id).isdigit() else alarm_id}]
            })
            if alarm_doc:
                candidates.append(alarm_doc)

        if device_id not in (None, ""):
            numeric_id = int(device_id) if str(device_id).isdigit() else device_id
            device_query = {"$or": [{"id": numeric_id}, {"id": str(device_id)}, {"device_id": numeric_id}, {"device_id": str(device_id)}]}
            for collection_name in ("video_device", "device"):
                device_doc = get_mongo_collection(collection_name).find_one(device_query)
                if device_doc:
                    candidates.append(device_doc)

        if fence_id not in (None, ""):
            numeric_id = int(fence_id) if str(fence_id).isdigit() else fence_id
            fence_doc = get_mongo_collection("fence").find_one({
                "$or": [{"id": numeric_id}, {"id": str(fence_id)}, {"fence_id": numeric_id}, {"fence_id": str(fence_id)}]
            })
            if fence_doc:
                candidates.append(fence_doc)
    except Exception:
        pass

    return any(in_scope(doc, current_user, **_alarm_scope_kwargs()) for doc in candidates)


async def push_alarm(data):
    disconnected = []

    for client in list(alarm_clients):
        ws = client.get("websocket")
        current_user = client.get("user") or {}
        if not _visible_to_client(data, current_user):
            continue

        try:
            await ws.send_json(data)
        except Exception:
            disconnected.append(ws)

    for ws in disconnected:
        unregister_alarm_client(ws)


def push_alarm_threadsafe(data):
    if _main_event_loop and _main_event_loop.is_running():
        asyncio.run_coroutine_threadsafe(push_alarm(data), _main_event_loop)
        return

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(push_alarm(data))
    except RuntimeError:
        # No main event loop is available yet; skip transient websocket delivery.
        pass
