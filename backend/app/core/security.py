from datetime import datetime, timedelta
from secrets import token_urlsafe

from fastapi import Cookie, Header, HTTPException, Query

from app.core.database import get_mongo_collection
from app.utils.config_manager import (
    get_force_initial_password_change,
    get_max_concurrent_sessions,
    get_password_expire_days,
)


SESSION_TTL_HOURS = 12


def _clean_text(value) -> str:
    return str(value or "").strip()


def _normalize_role(value) -> str:
    return _clean_text(value or "HQ").upper()


def _normalize_department_id(value):
    if value in (None, "", "null", "NULL"):
        return None
    try:
        return int(value)
    except Exception:
        return None


def _find_user(username: str | None):
    username = _clean_text(username)
    if not username:
        return None
    return get_mongo_collection("users").find_one({"username": username}, {"_id": 0})


def _user_password_changed_at(user: dict) -> datetime | None:
    raw = user.get("password_changed_at") or user.get("updated_at") or user.get("created_at")
    if isinstance(raw, datetime):
        return raw
    if isinstance(raw, str):
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return None
    return None


def _password_expired(user: dict) -> bool:
    changed_at = _user_password_changed_at(user)
    if not changed_at:
        return False
    return datetime.now() - changed_at >= timedelta(days=get_password_expire_days())


def _must_change_password(user: dict) -> bool:
    return bool(user.get("must_change_password")) or (
        get_force_initial_password_change() and not user.get("password_changed_at")
    )


def _prune_expired_sessions(username: str):
    collection = get_mongo_collection("auth_sessions")
    now = datetime.now()
    collection.delete_many({
        "username": username,
        "$or": [
            {"expires_at": {"$lte": now}},
            {"created_at": {"$lte": now - timedelta(hours=SESSION_TTL_HOURS)}},
        ],
    })


def _active_session_count(username: str) -> int:
    collection = get_mongo_collection("auth_sessions")
    now = datetime.now()
    return collection.count_documents({"username": username, "expires_at": {"$gt": now}})

def _drop_oldest_active_sessions(username: str, keep_count: int):
    collection = get_mongo_collection("auth_sessions")
    now = datetime.now()
    active_sessions = list(
        collection.find(
            {"username": username, "expires_at": {"$gt": now}},
            {"_id": 1},
        ).sort("created_at", 1)
    )
    remove_count = max(0, len(active_sessions) - keep_count)
    if remove_count:
        collection.delete_many({"_id": {"$in": [session["_id"] for session in active_sessions[:remove_count]]}})


def _user_to_current_user(user: dict) -> dict:
    role = _normalize_role(user.get("role"))
    permission_level = user.get("permission_level")
    if not permission_level:
        responsibility_level = _clean_text(user.get("responsibility_level") or user.get("responsibilityLevel"))
        permission_level = {
            "branch": "branch_admin",
            "project": "project_safety_admin",
            "grid": "grid_admin",
            "team": "team_admin",
        }.get(responsibility_level)
        if not permission_level:
            permission_level = "headquarters_admin" if role in {"HQ", "ADMIN"} or user.get("username") == "admin" else "project_safety_admin"

    return {
        "id": user.get("id"),
        "role": role,
        "department_id": _normalize_department_id(user.get("department_id")),
        "username": user.get("username"),
        "permission_level": permission_level,
        "company": user.get("company") or user.get("department") or "",
        "department": user.get("department") or "",
        "branch_id": user.get("branch_id") or user.get("department_id") or "",
        "project": user.get("project") or "",
        "project_id": user.get("project_id") or "",
        "grid_id": user.get("grid_id") or "",
        "grid_ids": user.get("grid_ids") or user.get("gridIds") or [],
        "grid_role": user.get("grid_role") or user.get("gridRole") or "",
        "team_id": user.get("team_id") or "",
        "team": user.get("team") or "",
        "work_team": user.get("work_team") or "",
        "responsibility_unit_id": user.get("responsibility_unit_id") or "",
        "responsibility_level": user.get("responsibility_level") or "",
        "personnel_id": user.get("personnel_id") or "",
        "must_change_password": _must_change_password(user),
        "password_expired": _password_expired(user),
    }


def create_auth_session(user: dict) -> str:
    token = token_urlsafe(32)
    now = datetime.now()
    username = user.get("username")
    _prune_expired_sessions(username)
    max_sessions = max(1, get_max_concurrent_sessions())
    if _active_session_count(username) >= max_sessions:
        _drop_oldest_active_sessions(username, max_sessions - 1)
    get_mongo_collection("auth_sessions").insert_one({
        "token": token,
        "username": username,
        "created_at": now,
        "expires_at": now + timedelta(hours=SESSION_TTL_HOURS),
    })
    return token


def _find_session_user(token: str | None):
    token = _clean_text(token)
    if not token:
        return None

    session = get_mongo_collection("auth_sessions").find_one({
        "token": token,
        "expires_at": {"$gt": datetime.now()},
    })
    if not session:
        return None
    user = _find_user(session.get("username"))
    if not user:
        return None
    if _password_expired(user):
        return None
    return user


def current_user_from_token(token: str | None):
    user = _find_session_user(token)
    if user:
        return _user_to_current_user(user)
    return None


def get_current_user(
    x_role: str | None = Header(default=None, alias="X-Role"),
    x_department_id: str | None = Header(default=None, alias="X-Department-Id"),
    x_username: str | None = Header(default=None, alias="X-Username"),
    x_permission_level: str | None = Header(default=None, alias="X-Permission-Level"),
    x_auth_token: str | None = Header(default=None, alias="X-Auth-Token"),
    authorization: str | None = Header(default=None, alias="Authorization"),
    auth_token: str | None = Cookie(default=None),
    token: str | None = Query(default=None),
):
    bearer_token = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer_token = authorization.split(" ", 1)[1]

    current_user = current_user_from_token(x_auth_token or bearer_token or auth_token or token)
    if current_user:
        return current_user

    header_user = _find_user(x_username)
    if header_user:
        return _user_to_current_user(header_user)

    raise HTTPException(status_code=401, detail="未登录或登录已过期")

