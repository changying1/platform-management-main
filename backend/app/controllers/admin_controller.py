from fastapi import APIRouter, Depends, HTTPException, Body
from app.core.database import get_db, get_mongo_collection
from app.schemas.admin_schema import UserCreate, UserUpdate, UserOut
from app.services.admin_service import AdminService
import os
import json
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

# 检查是否为系统管理员
def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ["ADMIN", "HQ"]:
        raise HTTPException(status_code=403, detail="只有系统管理员可以执行此操作")
    return current_user
@router.get("/users", response_model=list[UserOut])
def get_users(db=Depends(get_db)):
    # Using get_users_by_hierarchy with 0 or None to get all
    return service.get_users_by_hierarchy(db, 0)

@router.post("/users", response_model=UserOut)
def create_user(user: UserCreate, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
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
    
    return service.create_user(db, user)

@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, user_data: UserUpdate, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
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

    updated_user = service.update_user(db, user_id, user_data)
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    return updated_user

@router.delete("/users/{user_id}")
def delete_user(user_id: int, db=Depends(get_db)):
    success = service.delete_user(db, user_id)
    return {"success": success}

@router.get("/users/hierarchy/{user_id}")
def get_subordinates(user_id: int, db=Depends(get_db)):
    return service.get_users_by_hierarchy(db, user_id)

@router.get("/settings")
def get_system_settings():
    config = {}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except:
            pass
    return config

@router.post("/settings")
def save_system_settings(settings: dict = Body(...), db=Depends(get_db)):
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)

        for settings_file in STORAGE_SETTINGS_FILES:
            os.makedirs(os.path.dirname(settings_file), exist_ok=True)
            with open(settings_file, 'w', encoding='utf-8') as f:
                json.dump(settings, f, ensure_ascii=False, indent=2)
        
        # 如果存储路径改变，自动重启所有录像进程
        from app.services.video_service import VideoService
        vs = VideoService()
        vs.restart_all_recordings(db)
        
        return {"success": True, "message": "设置已保存，所有录像已重启并使用新路径"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")

# 批量导入用户
@router.post("/users/batch")
def batch_create_users(
    users: List[dict] = Body(...), 
    db=Depends(get_db), 
    current_user: dict = Depends(require_admin)
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

