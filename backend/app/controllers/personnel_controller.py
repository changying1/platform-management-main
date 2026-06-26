from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.core.data_scope import in_scope
from app.core.security import get_current_user
from app.schemas.personnel_schema import PersonnelCreate, PersonnelUpdate, PersonnelOut
from app.services.personnel_service import PersonnelService
import os
import shutil
from uuid import uuid4
import logging
from pymongo.errors import DuplicateKeyError

router = APIRouter(prefix="/api/personnel", tags=["Personnel"])
service = PersonnelService()
logger = logging.getLogger(__name__)

ROLE_RANK = {
    "team_admin": 1,
    "grid_admin": 2,
    "project_safety_admin": 3,
    "branch_admin": 4,
    "headquarters_admin": 5,
}


def ensure_can_assign_permission(permission_level: str | None, current_user: dict):
    if not permission_level:
        return
    current_rank = ROLE_RANK.get(current_user.get("permission_level") or "", 0)
    target_rank = ROLE_RANK.get(permission_level, 0)
    if target_rank == 0:
        raise HTTPException(status_code=400, detail="unknown permission level")
    if current_rank < target_rank:
        raise HTTPException(status_code=403, detail="cannot assign a higher permission level")


def _bound_value(value: str | None) -> str:
    return str(value or "").strip()


def ensure_management_scope_bound(data):
    role = data.role or "Worker"
    if role in {"Worker", "worker", "工人", "作业人员", "普通员工"}:
        return

    permission_level = data.permissionLevel or {
        "HQ Manager": "headquarters_admin",
        "Branch Admin": "branch_admin",
        "Project Manager": "project_safety_admin",
        "Grid Admin": "grid_admin",
        "Safety Officer": "project_safety_admin",
        "Team Admin": "team_admin",
    }.get(role, "project_safety_admin")

    company = _bound_value(data.company)
    project = _bound_value(data.project)
    work_team = _bound_value(data.workTeam)
    team = _bound_value(data.team)

    if permission_level == "headquarters_admin":
        return
    if permission_level == "branch_admin" and not company:
        raise HTTPException(status_code=400, detail="分公司管理员必须绑定分公司")
    if permission_level == "project_safety_admin":
        if not company:
            raise HTTPException(status_code=400, detail="项目级管理员必须绑定分公司")
        if not project:
            raise HTTPException(status_code=400, detail="项目级管理员必须绑定项目")
    if permission_level == "grid_admin":
        if not company:
            raise HTTPException(status_code=400, detail="网格管理员必须绑定分公司")
        if not project:
            raise HTTPException(status_code=400, detail="网格管理员必须绑定项目")
        if not _bound_value(getattr(data, "gridId", None)):
            raise HTTPException(status_code=400, detail="网格管理员必须绑定网格")
    if permission_level == "team_admin":
        if not company:
            raise HTTPException(status_code=400, detail="工队管理员必须绑定分公司")
        if not project:
            raise HTTPException(status_code=400, detail="工队管理员必须绑定项目")
        if not (work_team or team):
            raise HTTPException(status_code=400, detail="工队管理员必须绑定工队或班组")


def ensure_target_in_scope(data, current_user: dict):
    if in_scope(
        data.dict(),
        current_user,
        project_fields=("projectId", "project_id"),
        grid_fields=("gridId", "grid_id", "gridIds", "grid_ids"),
        team_fields=("teamId", "team_id"),
        branch_fields=("branchId", "branch_id"),
        company_fields=("company", "dept", "department"),
        project_name_fields=("project",),
        team_name_fields=("team", "workTeam", "work_team"),
    ):
        return
    raise HTTPException(status_code=403, detail="personnel target is outside current user scope")


@router.get("/", response_model=list[PersonnelOut])
def list_personnel(current_user: dict = Depends(get_current_user)):
    return service.list_personnel(current_user=current_user)


@router.post("/", response_model=PersonnelOut)
def create_personnel(data: PersonnelCreate, current_user: dict = Depends(get_current_user)):
    ensure_management_scope_bound(data)
    ensure_can_assign_permission(data.permissionLevel, current_user)
    ensure_target_in_scope(data, current_user)
    try:
        return service.create_personnel(data, current_user=current_user)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="人员已存在，请勿重复创建")


@router.put("/{personnel_id}", response_model=PersonnelOut)
def update_personnel(
    personnel_id: str,
    data: PersonnelUpdate,
    current_user: dict = Depends(get_current_user),
):
    ensure_management_scope_bound(data)
    ensure_can_assign_permission(data.permissionLevel, current_user)
    updated = service.update_personnel(personnel_id, data, current_user=current_user)
    if not updated:
        raise HTTPException(status_code=404, detail="Personnel not found")
    return updated

@router.post("/{personnel_id}/face", response_model=PersonnelOut)
def upload_personnel_face(
    personnel_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    allowed_exts = {".jpg", ".jpeg", ".png", ".webp"}
    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()

    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="Only jpg, jpeg, png, webp files are allowed")

    backend_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    face_dir = os.path.join(backend_root, "static", "faces")
    os.makedirs(face_dir, exist_ok=True)

    filename = f"{personnel_id}_{uuid4().hex}{ext}"
    save_path = os.path.join(face_dir, filename)

    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    face_image_url = f"/static/faces/{filename}"

    updated = service.update_face_image(personnel_id, face_image_url, current_user=current_user)
    if not updated:
        raise HTTPException(status_code=404, detail="Personnel not found")

    try:
        from app.services.ai_runtime.face_library_manager import face_library_manager

        face_library_manager.reload_database()
    except Exception as exc:
        logger.warning("Failed to reload face database after personnel face upload: %s", exc)

    return updated

@router.delete("/{personnel_id}")
def delete_personnel(personnel_id: str, current_user: dict = Depends(get_current_user)):
    success = service.delete_personnel(personnel_id, current_user=current_user)
    return {"success": success}
