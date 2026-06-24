import os
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from app.core.database import get_mongo_collection
from app.core.security import create_auth_session, get_current_user
from app.services.permission_service import get_permissions_for_level
from app.schemas.log_schema import LogCreate
from app.services.log_service import LogService
from app.utils.config_manager import (
    get_force_initial_password_change,
    get_lockout_duration_minutes,
    get_login_attempts_limit,
    get_login_failed_alert_threshold,
    get_password_expire_days,
    get_password_min_length,
    get_password_require_complexity,
)

# 账号锁定功能开关
ACCOUNT_LOCK_ENABLED = os.getenv("ACCOUNT_LOCK_ENABLED", "true").lower() == "true"

router = APIRouter(prefix="/api/auth", tags=["Auth"])

ROLE_RANK = {
    "team_admin": 1,
    "grid_admin": 2,
    "project_safety_admin": 3,
    "branch_admin": 4,
    "headquarters_admin": 5,
}


class LoginReq(BaseModel):
    username: str
    password: str


class SwitchAccountReq(BaseModel):
    username: str


class ChangePasswordReq(BaseModel):
    old_password: str
    new_password: str


def _resolve_role(user: dict) -> str:
    return (user.get("role") or "BRANCH").upper()


def _resolve_permission_level(user: dict) -> str:
    permission_level = user.get("permission_level")
    if permission_level:
        return permission_level
    responsibility_level = str(user.get("responsibility_level") or user.get("responsibilityLevel") or "").strip()
    permission_level = {
        "branch": "branch_admin",
        "project": "project_safety_admin",
        "grid": "grid_admin",
        "team": "team_admin",
    }.get(responsibility_level)
    if permission_level:
        return permission_level
    role = _resolve_role(user)
    if role in {"HQ", "ADMIN"} or user.get("username") == "admin":
        return "headquarters_admin"
    return "project_safety_admin"


def _is_enabled(user: dict) -> bool:
    return str(user.get("status") or "active").lower() in {"active", "normal", "正常"}


def _text(value) -> str:
    return str(value or "").strip()


def _values(doc: dict, keys: tuple[str, ...]) -> set[str]:
    return {_text(doc.get(key)) for key in keys if _text(doc.get(key))}


def _overlaps(left: set[str], right: set[str]) -> bool:
    return bool(left and right and left.intersection(right))


def _find_branch(department_id):
    if department_id in (None, "", 0, "0"):
        return None
    branch_id = int(department_id)
    for collection_name in ["branch", "branches", "sql_branches"]:
        branch = get_mongo_collection(collection_name).find_one(
            {"$or": [{"id": branch_id}, {"id": str(branch_id)}]},
            {"_id": 0},
        )
        if branch:
            return branch
    return None


def _password_changed_at(user: dict) -> datetime | None:
    raw = user.get("password_changed_at") or user.get("updated_at") or user.get("created_at")
    if isinstance(raw, datetime):
        return raw
    if isinstance(raw, str) and raw:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


def _password_expired(user: dict) -> bool:
    changed_at = _password_changed_at(user)
    if not changed_at:
        return False
    return datetime.now() - changed_at >= timedelta(days=get_password_expire_days())


def _must_change_password(user: dict) -> bool:
    return bool(user.get("must_change_password")) or (
        get_force_initial_password_change() and not user.get("password_changed_at")
    )


def _build_login_payload(user: dict, response: Response):
    role = _resolve_role(user)
    permission_level = _resolve_permission_level(user)
    permissions = get_permissions_for_level(permission_level)
    department_id = user.get("department_id")
    branch = None
    token = create_auth_session(user)

    if role == "BRANCH":
        if department_id is None:
            raise HTTPException(status_code=400, detail="分部账号未绑定分公司")
        branch_doc = _find_branch(department_id)
        if not branch_doc:
            raise HTTPException(status_code=400, detail="账号分公司信息未配置正确")

        lng = branch_doc.get("lng") if branch_doc.get("lng") is not None else branch_doc.get("longitude")
        lat = branch_doc.get("lat") if branch_doc.get("lat") is not None else branch_doc.get("latitude")
        coord = [float(lng), float(lat)] if lng is not None and lat is not None else None
        branch = {
            "id": int(branch_doc.get("id")),
            "province": branch_doc.get("province") or "",
            "name": branch_doc.get("name") or "",
            "coord": coord,
            "address": branch_doc.get("address"),
            "project": branch_doc.get("project"),
            "manager": branch_doc.get("manager"),
            "phone": branch_doc.get("phone"),
            "deviceCount": int(branch_doc.get("device_count") or 0),
            "status": branch_doc.get("status") or "正常",
            "updatedAt": str(branch_doc.get("updated_at")) if branch_doc.get("updated_at") else None,
            "remark": branch_doc.get("remark"),
        }

    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=12 * 60 * 60,
    )

    return {
        "userId": int(user.get("id")),
        "username": user.get("username"),
        "full_name": user.get("full_name"),
        "role": role,
        "token": token,
        "permission_level": permission_level,
        "permissions": permissions,
        "department_id": department_id,
        "company": user.get("company") or user.get("department") or "",
        "project": user.get("project") or "",
        "project_id": user.get("project_id") or "",
        "grid_id": user.get("grid_id") or "",
        "grid_ids": user.get("grid_ids") or user.get("gridIds") or [],
        "team_id": user.get("team_id") or "",
        "team": user.get("team") or user.get("work_team") or "",
        "branch": branch,
        "must_change_password": _must_change_password(user),
        "password_expired": _password_expired(user),
    }


def _normalize_switch_account(user: dict) -> dict:
    permission_level = _resolve_permission_level(user)
    return {
        "id": str(user.get("id") or user.get("username") or user.get("personnel_id") or ""),
        "username": user.get("username") or "",
        "name": user.get("full_name") or user.get("username") or "",
        "role": _resolve_role(user),
        "level": permission_level,
        "company": user.get("company") or user.get("department") or "",
        "project": user.get("project") or "",
        "project_id": user.get("project_id") or "",
        "department_id": user.get("department_id"),
        "status": user.get("status") or "active",
        "description": user.get("department") or user.get("company") or user.get("project") or "",
    }


def _can_switch_to_user(target_user: dict, current_user: dict) -> bool:
    if str(target_user.get("username") or "") == str(current_user.get("username") or ""):
        return True

    current_level = current_user.get("permission_level") or "headquarters_admin"
    target_level = _resolve_permission_level(target_user)
    if ROLE_RANK.get(target_level, 0) > ROLE_RANK.get(current_level, 0):
        return False

    if current_level == "headquarters_admin":
        return True

    branch_match = _overlaps(
        _values(target_user, ("department_id", "branch_id")),
        _values(current_user, ("department_id", "branch_id")),
    ) or _overlaps(
        _values(target_user, ("company", "department")),
        _values(current_user, ("company", "department")),
    )
    if current_level == "branch_admin":
        return branch_match

    project_match = _overlaps(
        _values(target_user, ("project_id",)),
        _values(current_user, ("project_id",)),
    ) or _overlaps(
        _values(target_user, ("project",)),
        _values(current_user, ("project",)),
    )
    if current_level == "project_safety_admin":
        return branch_match and project_match

    grid_match = _overlaps(
        _values(target_user, ("grid_id", "grid_ids")),
        _values(current_user, ("grid_id", "grid_ids")),
    )
    if current_level == "grid_admin":
        return branch_match and project_match and grid_match

    team_match = _overlaps(
        _values(target_user, ("team_id", "team", "work_team")),
        _values(current_user, ("team_id", "team", "work_team")),
    )
    if current_level == "team_admin":
        return branch_match and project_match and team_match

    return False


def _write_login_log(username: str, success: bool, details: str):
    try:
        LogService().create_log(
            None,
            LogCreate(
                operator=username or "unknown",
                action="登录成功" if success else "登录失败",
                target_type="login",
                target_name=username or "unknown",
                details=details,
                level="info" if success else "warning",
                extra={"success": success},
            ),
        )
    except Exception:
        pass


def _validate_password_policy(password: str):
    if len(password or "") < get_password_min_length():
        raise HTTPException(status_code=400, detail=f"密码长度至少{get_password_min_length()}位")
    if get_password_require_complexity():
        has_upper = any(ch.isupper() for ch in password)
        has_lower = any(ch.islower() for ch in password)
        has_digit = any(ch.isdigit() for ch in password)
        if not (has_upper and has_lower and has_digit):
            raise HTTPException(status_code=400, detail="密码需同时包含大写字母、小写字母和数字")


def _login_state_collection():
    return get_mongo_collection("auth_login_state")


def _get_login_state(username: str) -> dict:
    return _login_state_collection().find_one({"username": username}, {"_id": 0}) or {}


def _locked_until(username: str) -> datetime | None:
    raw = _get_login_state(username).get("locked_until")
    if isinstance(raw, datetime):
        return raw
    if isinstance(raw, str) and raw:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


def _assert_not_locked(username: str):
    if not ACCOUNT_LOCK_ENABLED:
        return
    locked_until = _locked_until(username)
    if locked_until and locked_until > datetime.now():
        minutes = max(1, int((locked_until - datetime.now()).total_seconds() // 60) + 1)
        raise HTTPException(status_code=423, detail=f"账号已锁定，请{minutes}分钟后再试")


def _record_login_failed(username: str, reason: str):
    key = username or "unknown"
    # 如果锁定功能禁用，只记录日志，不锁定账号
    if not ACCOUNT_LOCK_ENABLED:
        _write_login_log(key, False, reason)
        return

    state = _get_login_state(key)
    count = int(state.get("failed_count") or 0) + 1
    update = {
        "failed_count": count,
        "last_failed_at": datetime.now(),
        "last_reason": reason,
    }
    attempts_limit = get_login_attempts_limit()
    if count >= attempts_limit:
        update["failed_count"] = 0
        update["locked_until"] = datetime.now() + timedelta(minutes=get_lockout_duration_minutes())

    _login_state_collection().update_one({"username": key}, {"$set": update}, upsert=True)
    _write_login_log(key, False, reason)

    alert_threshold = get_login_failed_alert_threshold()
    if count >= alert_threshold:
        _write_login_log(key, False, f"连续{count}次登录失败，已达到告警阈值{alert_threshold}")

    if count >= attempts_limit:
        raise HTTPException(status_code=423, detail=f"登录失败次数过多，账号已锁定{get_lockout_duration_minutes()}分钟")


def _record_login_success(username: str):
    key = username or "unknown"
    _login_state_collection().delete_one({"username": key})
    _write_login_log(key, True, "用户登录成功")


def _ensure_default_admin_login(username: str):
    if username.lower() != "admin":
        return

    now = datetime.now()
    get_mongo_collection("users").update_one(
        {"username": "admin"},
        {
            "$set": {
                "hashed_password": "1",
                "password": "1",
                "role": "HQ",
                "permission_level": "headquarters_admin",
                "status": "active",
                "department_id": None,
                "password_changed_at": now,
                "must_change_password": False,
                "updated_at": now,
            },
            "$setOnInsert": {
                "id": 1,
                "username": "admin",
                "full_name": "admin",
                "created_at": now,
            },
        },
        upsert=True,
    )
    _login_state_collection().delete_one({"username": "admin"})


@router.post("/login")
def login(req: LoginReq, response: Response):
    username = (req.username or "").strip()
    _ensure_default_admin_login(username)
    _assert_not_locked(username)

    user = get_mongo_collection("users").find_one({"username": username}, {"_id": 0})
    if not user:
        _record_login_failed(username, "账号不存在或密码错误")
        raise HTTPException(status_code=401, detail="账号或密码错误")
    if not _is_enabled(user):
        _record_login_failed(username, "账号未启用")
        raise HTTPException(status_code=403, detail="账号未启用")

    stored_password = user.get("hashed_password") or user.get("password") or ""
    if stored_password != req.password:
        _record_login_failed(username, "账号不存在或密码错误")
        raise HTTPException(status_code=401, detail="账号或密码错误")

    payload = _build_login_payload(user, response)
    _record_login_success(username)
    return payload


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    permission_level = current_user.get("permission_level") or "project_safety_admin"
    user_id = current_user.get("id")
    return {
        "userId": int(user_id) if user_id is not None else "",
        "username": current_user.get("username") or "",
        "full_name": current_user.get("full_name") or current_user.get("username") or "",
        "role": current_user.get("role") or "",
        "permission_level": permission_level,
        "permissions": get_permissions_for_level(permission_level),
        "department_id": current_user.get("department_id"),
        "company": current_user.get("company") or current_user.get("department") or "",
        "project": current_user.get("project") or "",
        "project_id": current_user.get("project_id") or "",
        "grid_id": current_user.get("grid_id") or "",
        "grid_ids": current_user.get("grid_ids") or [],
        "team_id": current_user.get("team_id") or "",
        "team": current_user.get("team") or current_user.get("work_team") or "",
        "must_change_password": bool(current_user.get("must_change_password")),
        "password_expired": bool(current_user.get("password_expired")),
    }


@router.post("/change-password")
def change_password(req: ChangePasswordReq, current_user: dict = Depends(get_current_user)):
    username = current_user.get("username")
    user = get_mongo_collection("users").find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="账号不存在")

    stored_password = user.get("hashed_password") or user.get("password") or ""
    if stored_password != req.old_password:
        raise HTTPException(status_code=400, detail="原密码不正确")
    if req.new_password == req.old_password:
        raise HTTPException(status_code=400, detail="新密码不能与原密码相同")

    _validate_password_policy(req.new_password)
    now = datetime.now()
    get_mongo_collection("users").update_one(
        {"username": username},
        {
            "$set": {
                "hashed_password": req.new_password,
                "password": req.new_password,
                "password_changed_at": now,
                "must_change_password": False,
                "updated_at": now,
            }
        },
    )
    get_mongo_collection("auth_sessions").delete_many({"username": username})
    _write_login_log(username, True, "用户修改密码成功")
    return {"success": True, "message": "密码修改成功，请重新登录"}


@router.get("/switchable-accounts")
def get_switchable_accounts(current_user: dict = Depends(get_current_user)):
    projection = {
        "_id": 0,
        "id": 1,
        "username": 1,
        "full_name": 1,
        "role": 1,
        "permission_level": 1,
        "responsibility_level": 1,
        "responsibilityLevel": 1,
        "company": 1,
        "department": 1,
        "department_id": 1,
        "branch_id": 1,
        "project": 1,
        "project_id": 1,
        "grid_id": 1,
        "grid_ids": 1,
        "gridIds": 1,
        "team_id": 1,
        "team": 1,
        "work_team": 1,
        "status": 1,
        "personnel_id": 1,
    }
    docs = list(get_mongo_collection("users").find({}, projection).sort("id", 1).limit(100))
    accounts = [
        _normalize_switch_account(doc)
        for doc in docs
        if _is_enabled(doc) and _can_switch_to_user(doc, current_user)
    ]
    current_username = str(current_user.get("username") or "")
    accounts.sort(
        key=lambda item: (
            0 if str(item.get("username") or "") == current_username else 1,
            -ROLE_RANK.get(str(item.get("level") or ""), 0),
            str(item.get("username") or ""),
        )
    )
    return accounts


@router.post("/switch")
def switch_account(
    req: SwitchAccountReq,
    response: Response,
    current_user: dict = Depends(get_current_user),
):
    target_user = get_mongo_collection("users").find_one({"username": req.username}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="账号不存在")
    if not _is_enabled(target_user):
        raise HTTPException(status_code=403, detail="账号未启用")
    if not _can_switch_to_user(target_user, current_user):
        raise HTTPException(status_code=403, detail="无权切换到该账号")

    return _build_login_payload(target_user, response)
