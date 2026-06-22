from fastapi import APIRouter, Depends, HTTPException, Body
from app.core.database import get_db, get_mongo_collection
from app.schemas.admin_schema import UserCreate, UserUpdate, UserOut
from app.services.admin_service import AdminService
from app.utils.config_manager import get_safety_production_days, get_system_settings as load_system_settings, save_system_settings_to_mongo
import os
import json
from datetime import date
from typing import List

router = APIRouter(prefix="/admin", tags=["Admin"])
service = AdminService()

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROJECT_ROOT = os.path.dirname(BACKEND_ROOT)
CONFIG_FILE = os.path.join(BACKEND_ROOT, "system_config.json")
STORAGE_SETTINGS_FILES = [
    os.path.join(PROJECT_ROOT, "storage", "system_settings.json"),
    os.path.join(BACKEND_ROOT, "storage", "system_settings.json"),
]

from app.core.security import get_current_user
from app.core.data_scope import is_hq, user_level
from app.services.audit_log_service import write_audit_log
from app.services.permission_service import save_role_permissions

PERMISSION_MODULE_CODES = {
    "dashboard": ["dashboard.view"],
    "monitor": ["monitor.playback", "monitor.track", "monitor.voice", "monitor.camera"],
    "monitor.view": ["monitor.playback", "monitor.track", "monitor.camera"],
    "fence": ["fence.view", "fence.create", "fence.edit", "fence.delete"],
    "grid": ["grid.view", "grid.create", "grid.edit", "grid.delete"],
    "grid.view": ["grid.view"],
    "team": ["team.view", "team.create", "team.edit", "team.delete"],
    "team.view": ["team.view"],
    "device": ["device.view", "device.create", "device.edit", "device.delete"],
    "device.view": ["device.view"],
    "personnel": ["personnel.view", "personnel.create", "personnel.edit", "personnel.delete"],
    "personnel.view": ["personnel.view"],
    "alarm": ["alarm.view", "alarm.handle"],
    "alarm.view": ["alarm.view"],
    "system": ["system.role", "system.log"],
}

SETTINGS_PERMISSION_FIELDS = {
    "hqAdminPermissions": "headquarters_admin",
    "branchAdminPermissions": "branch_admin",
    "projectAdminPermissions": "project_safety_admin",
    "gridAdminPermissions": "grid_admin",
    "teamAdminPermissions": "team_admin",
}


def _permission_codes_from_setting(items: list) -> list[str]:
    codes = []
    for item in items or []:
        text = str(item)
        codes.extend(PERMISSION_MODULE_CODES.get(text, [text] if "." in text else []))
    return list(dict.fromkeys(codes))


def _sync_role_permissions_from_settings(settings: dict):
    for field, level in SETTINGS_PERMISSION_FIELDS.items():
        values = settings.get(field)
        if isinstance(values, list):
            save_role_permissions(level, _permission_codes_from_setting(values))

# 检查是否为系统管理员
def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ["ADMIN", "HQ"]:
        raise HTTPException(status_code=403, detail="只有系统管理员可以执行此操作")
    return current_user


def require_permission_manager(current_user: dict = Depends(get_current_user)):
    if is_hq(current_user) or user_level(current_user) == "branch_admin":
        return current_user
    raise HTTPException(status_code=403, detail="无权管理系统账号权限")


def require_settings_manager(current_user: dict = Depends(get_current_user)):
    if is_hq(current_user) or user_level(current_user) in {"branch_admin", "project_safety_admin"}:
        return current_user
    raise HTTPException(status_code=403, detail="无权查看或修改系统设置")
def _role_permission_level(role: str | None) -> str | None:
    return {
        "HQ": "headquarters_admin",
        "ADMIN": "headquarters_admin",
        "headquarters_admin": "headquarters_admin",
        "BRANCH": "branch_admin",
        "branch_admin": "branch_admin",
        "PROJECT": "project_safety_admin",
        "project_safety_admin": "project_safety_admin",
        "GRID": "grid_admin",
        "grid_admin": "grid_admin",
        "TEAM": "team_admin",
        "team_admin": "team_admin",
    }.get(str(role or ""))


def _text(value) -> str:
    return str(value or "").strip()


def _user_target_name(user) -> str:
    if isinstance(user, dict):
        return _text(user.get("full_name") or user.get("username") or user.get("id"))
    return _text(getattr(user, "full_name", None) or getattr(user, "username", None) or getattr(user, "id", None))


def _settings_snapshot() -> dict:
    return load_system_settings()


def _current_user_label(current_user: dict | None) -> str:
    if not current_user:
        return "system"
    return str(
        current_user.get("username")
        or current_user.get("full_name")
        or current_user.get("name")
        or current_user.get("id")
        or "system"
    )


def _normalize_safety_production_settings(settings: dict, previous: dict) -> dict:
    today = date.today().isoformat()
    current_days = get_safety_production_days()
    incoming_has_value = "safetyProductionDays" in settings
    try:
        incoming_days = int(float(settings.get("safetyProductionDays", current_days)))
    except (TypeError, ValueError):
        incoming_days = current_days

    if not incoming_has_value:
        settings["safetyProductionDays"] = current_days
    elif incoming_days != current_days:
        settings["safetyProductionDays"] = max(0, incoming_days)
    else:
        settings["safetyProductionDays"] = current_days

    settings["safetyProductionUpdatedDate"] = today
    return settings


VIDEO_RESTART_SETTING_KEYS = {
    "videoStoragePath",
    "videoStorageFolders",
    "videoStorageType",
    "videoSegmentMinutes",
    "videoRetentionDays",
    "videoQuality",
    "alarmVideoRetentionDays",
    "alarmVideoSurroundMinutes",
    "alarmScreenshotRetentionDays",
    "storageMaxSizeGB",
    "storageWarningThreshold",
    "storageCriticalThreshold",
    "storageAutoCleanup",
    "storageCleanupStrategy",
}


def _video_restart_required(before: dict, after: dict) -> bool:
    return any(before.get(key) != after.get(key) for key in VIDEO_RESTART_SETTING_KEYS)


def ensure_user_scope_bound(user):
    level = _role_permission_level(user.role)
    if level in (None, "headquarters_admin"):
        return
    company = _text(getattr(user, "company", None) or getattr(user, "department", None))
    project = _text(getattr(user, "project", None))
    work_team = _text(getattr(user, "work_team", None))
    team = _text(getattr(user, "team", None))
    has_department = getattr(user, "department_id", None) not in (None, "", 0)
    if level == "branch_admin" and not (company or has_department):
        raise HTTPException(status_code=400, detail="分公司管理员必须绑定分公司")
    if level == "project_safety_admin":
        if not (company or has_department):
            raise HTTPException(status_code=400, detail="项目级管理员必须绑定分公司")
        if not project:
            raise HTTPException(status_code=400, detail="项目级管理员必须绑定项目")
    if level == "team_admin":
        if not (company or has_department):
            raise HTTPException(status_code=400, detail="工队管理员必须绑定分公司")
        if not project:
            raise HTTPException(status_code=400, detail="工队管理员必须绑定项目")
        if not (work_team or team):
            raise HTTPException(status_code=400, detail="工队管理员必须绑定工队或班组")


@router.get("/users", response_model=list[UserOut])
def get_users(db=Depends(get_db), current_user: dict = Depends(require_permission_manager)):
    # Using get_users_by_hierarchy with 0 or None to get all
    return service.get_users_by_hierarchy(db, 0, current_user=current_user)

@router.post("/users", response_model=UserOut)
def create_user(user: UserCreate, db=Depends(get_db), current_user: dict = Depends(require_permission_manager)):
    # Logic for Department ID inheritance
    # 1. If assigned a parent (Supervisor), inherit their department
    if user.parent_id:
        parent_user = get_mongo_collection("users").find_one({"$or": [{"id": int(user.parent_id)}, {"id": str(user.parent_id)}]})
        if parent_user and parent_user.get("department_id"):
            user.department_id = parent_user.get("department_id")

    # 2. If the creator plays a role in a department, the new user must be in the same department
    # Note: department_id=0 usually means HQ/Super Admin, so we shouldn't restrict if it's 0.
    cid = current_user["department_id"]
    if cid is not None and cid != 0:
        user.department_id = cid
    ensure_user_scope_bound(user)
    
    created = service.create_user(db, user)
    write_audit_log(
        current_user=current_user,
        action="赋予账号权限",
        target_type="permission",
        target_name=_user_target_name(created),
        after=created if isinstance(created, dict) else getattr(created, "model_dump", lambda: {})(),
        company=getattr(user, "company", None),
        project=getattr(user, "project", None),
        grid=getattr(user, "grid", None) or getattr(user, "grid_name", None) or getattr(user, "grid_id", None),
        team=getattr(user, "team", None) or getattr(user, "work_team", None),
        extra={"permission_level": _role_permission_level(user.role), "role": user.role},
    )
    return created

@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, user_data: UserUpdate, db=Depends(get_db), current_user: dict = Depends(require_permission_manager)):
    # 1. Check permissions (Optional: Can only update subordinates?)
    # For now, allow department admin to update anyone they can see (logic in frontend/service usually restricts visibility)
    
    # 2. Logic for Department ID inheritance/restriction during update
    # If the updater is restricted to a department, they can't change the user's department to something else
    # Or, if they change the parent, the department might need to change automatically
    
    if current_user["department_id"] is not None and current_user["department_id"] != 0:
         # Enforce that the user remains in the updater's department
         user_data.department_id = current_user["department_id"]
    
    # Logic: If parent_id is changed, re-evaluate department_id
    if user_data.parent_id:
        parent_user = get_mongo_collection("users").find_one({"$or": [{"id": int(user_data.parent_id)}, {"id": str(user_data.parent_id)}]})
        if parent_user and parent_user.get("department_id"):
            user_data.department_id = parent_user.get("department_id")

    before_user = get_mongo_collection("users").find_one({"$or": [{"id": int(user_id)}, {"id": str(user_id)}]}, {"_id": 0})
    updated_user = service.update_user(db, user_id, user_data, current_user=current_user)
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")
    after_user = get_mongo_collection("users").find_one({"$or": [{"id": int(user_id)}, {"id": str(user_id)}]}, {"_id": 0})
    write_audit_log(
        current_user=current_user,
        action="修改账号权限",
        target_type="permission",
        target_name=_user_target_name(after_user or updated_user),
        before=before_user,
        after=after_user,
        company=(after_user or {}).get("company") or getattr(user_data, "company", None),
        project=(after_user or {}).get("project") or getattr(user_data, "project", None),
        grid=(after_user or {}).get("grid") or (after_user or {}).get("grid_name") or (after_user or {}).get("grid_id") or getattr(user_data, "grid", None),
        team=(after_user or {}).get("team") or (after_user or {}).get("work_team") or getattr(user_data, "team", None),
    )
    return updated_user

@router.delete("/users/{user_id}")
def delete_user(user_id: int, db=Depends(get_db), current_user: dict = Depends(require_permission_manager)):
    before_user = get_mongo_collection("users").find_one({"$or": [{"id": int(user_id)}, {"id": str(user_id)}]}, {"_id": 0})
    success = service.delete_user(db, user_id, current_user=current_user)
    if success:
        write_audit_log(
            current_user=current_user,
            action="删除账号权限",
            target_type="permission",
            target_name=_user_target_name(before_user) or str(user_id),
            before=before_user,
            company=(before_user or {}).get("company"),
            project=(before_user or {}).get("project"),
            grid=(before_user or {}).get("grid") or (before_user or {}).get("grid_name") or (before_user or {}).get("grid_id"),
            team=(before_user or {}).get("team") or (before_user or {}).get("work_team"),
            level="warning",
        )
    return {"success": success}

@router.get("/users/hierarchy/{user_id}")
def get_subordinates(user_id: int, db=Depends(get_db), current_user: dict = Depends(require_permission_manager)):
    return service.get_users_by_hierarchy(db, user_id, current_user=current_user)

@router.get("/settings")
def get_system_settings(current_user: dict = Depends(require_settings_manager)):
    config = load_system_settings()
    config["safetyProductionDays"] = get_safety_production_days()
    config.setdefault("safetyProductionUpdatedDate", date.today().isoformat())
    return config

@router.post("/settings")
def save_system_settings(settings: dict = Body(...), db=Depends(get_db), current_user: dict = Depends(require_settings_manager)):
    try:
        before_settings = _settings_snapshot()
        settings = _normalize_safety_production_settings(settings, before_settings)
        mongo_saved = save_system_settings_to_mongo(settings, _current_user_label(current_user))
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)

        for settings_file in STORAGE_SETTINGS_FILES:
            os.makedirs(os.path.dirname(settings_file), exist_ok=True)
            with open(settings_file, 'w', encoding='utf-8') as f:
                json.dump(settings, f, ensure_ascii=False, indent=2)
        
        # 如果存储路径改变，自动重启所有录像进程
        _sync_role_permissions_from_settings(settings)

        restarted_recordings = False
        if _video_restart_required(before_settings, settings):
            from app.services.video_service import VideoService
            vs = VideoService()
            vs.restart_all_recordings(db)
            restarted_recordings = True
        write_audit_log(
            current_user=current_user,
            action="修改系统设置",
            target_type="system",
            target_name="系统设置",
            before=before_settings,
            after=settings,
        )
        
        message = "设置已保存，所有录像已重启并使用新路径" if restarted_recordings else "设置已保存"
        return {"success": True, "message": message, "recordingsRestarted": restarted_recordings, "mongoSaved": mongo_saved}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")

# 批量导入用户
@router.post("/users/batch")
def batch_create_users(
    users: List[dict] = Body(...), 
    db=Depends(get_db), 
    current_user: dict = Depends(require_permission_manager)
):
    results = []
    for user_data in users:
        try:
            # 创建用户对象
            user_create = UserCreate(
                username=user_data.get("username"),
                password=user_data.get("password"),
                full_name=user_data.get("name", user_data.get("full_name", "")),
                role=user_data.get("role", "worker"),
                phone=user_data.get("phone", ""),
                department_id=None,
                parent_id=None,
                employee_code=user_data.get("employeeId", ""),
                id_card=user_data.get("idCard", ""),
                work_type_id=user_data.get("workType", ""),
                team=user_data.get("team", ""),
                work_team=user_data.get("workTeam", ""),
                company=user_data.get("company", ""),
                project=user_data.get("project", ""),
                entry_date=user_data.get("entryDate", ""),
                emergency_contact=user_data.get("emergencyContact", ""),
            )
            
            created = service.create_user(db, user_create)
            results.append({"success": True, "user": created, "error": None})
        except Exception as e:
            results.append({"success": False, "user": None, "error": str(e)})
    
    return {"results": results}

# 获取待审核用户
@router.get("/users/pending")
def get_pending_users(db=Depends(get_db), current_user: dict = Depends(require_admin)):
    return service.get_users_by_status(db, "pending")

# 审核通过
@router.post("/users/{user_id}/approve")
def approve_user(user_id: int, db=Depends(get_db), current_user: dict = Depends(require_admin)):
    updated = service.update_user_status(db, user_id, "active")
    if not updated:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return {"success": True, "message": "用户已通过审核"}

# 拒绝审核
@router.post("/users/{user_id}/reject")
def reject_user(user_id: int, db=Depends(get_db), current_user: dict = Depends(require_admin)):
    updated = service.update_user_status(db, user_id, "inactive")
    if not updated:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return {"success": True, "message": "用户已被拒绝"}

# 批量通过
@router.post("/users/approve-all")
def approve_all_pending(db=Depends(get_db), current_user: dict = Depends(require_admin)):
    count = service.approve_all_pending(db)
    return {"success": True, "message": f"已通过 {count} 个待审核用户"}

