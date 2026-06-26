from datetime import datetime
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from app.core.data_scope import in_scope, merge_filters, scope_filter
from app.core.database import get_mongo_collection, get_next_sequence, get_personnel_collection
from app.schemas.personnel_schema import PersonnelCreate, PersonnelUpdate
from app.services.audit_log_service import write_audit_log
from app.services.permission_service import get_permissions_for_level
from app.utils.logger import get_logger

logger = get_logger("PersonnelService")

PERMISSION_BY_ROLE = {
    "HQ Manager": "headquarters_admin",
    "Branch Admin": "branch_admin",
    "Project Manager": "project_safety_admin",
    "Grid Admin": "grid_admin",
    "Safety Officer": "project_safety_admin",
    "Team Admin": "team_admin",
}

APP_ROLE_BY_PERMISSION = {
    "headquarters_admin": "HQ",
    "branch_admin": "BRANCH",
    "project_safety_admin": "PROJECT",
    "grid_admin": "GRID",
    "team_admin": "TEAM",
}

def _is_worker_role(role: str | None) -> bool:
    normalized = str(role or "Worker").strip().lower()
    return normalized in {"worker", "工人", "作业人员", "普通员工"}


def _permission_level_for(role: str | None, explicit_level: str | None) -> str:
    if explicit_level:
        return explicit_level
    return PERMISSION_BY_ROLE.get(str(role or ""), "project_safety_admin")


def _login_user_id_for_personnel(doc: dict) -> str:
    personnel_id = str(doc.get("_id") or "")
    username = (
        doc.get("loginUsername")
        or doc.get("employeeId")
        or doc.get("phone")
        or doc.get("username")
        or ""
    ).strip()

    clauses = []
    if personnel_id:
        clauses.append({"personnel_id": personnel_id})
    if username:
        clauses.append({"username": username})
    if not clauses:
        return ""

    user = get_mongo_collection("users").find_one({"$or": clauses}, {"_id": 0, "id": 1})
    if not user or user.get("id") is None:
        return ""
    return str(user.get("id"))


def _to_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "userId": _login_user_id_for_personnel(doc),
        "username": doc.get("username", ""),
        "dept": doc.get("dept", ""),
        "phone": doc.get("phone", ""),
        "role": doc.get("role", "Worker"),
        "addedDate": doc.get("addedDate", ""),
        "parentId": doc.get("parentId"),
        "faceImage": doc.get("faceImage", ""),
        "loginUsername": doc.get("loginUsername", ""),
        "permissionLevel": doc.get("permissionLevel", ""),
        "gridRole": doc.get("gridRole") or doc.get("grid_role") or "",
        "gridIds": doc.get("gridIds") or doc.get("grid_ids") or [],
        "responsibilityUnitId": doc.get("responsibilityUnitId") or doc.get("responsibility_unit_id") or "",

        "employeeId": doc.get("employeeId", ""),
        "idCard": doc.get("idCard", ""),
        "company": doc.get("company", ""),
        "branchId": doc.get("branchId") or doc.get("branch_id") or "",
        "projectId": doc.get("projectId") or doc.get("project_id") or "",
        "gridId": doc.get("gridId") or doc.get("grid_id") or "",
        "teamId": doc.get("teamId") or doc.get("team_id") or "",
        "isResponsibilityPerson": bool(doc.get("isResponsibilityPerson") or doc.get("is_responsibility_person")),
        "responsibilityLevel": doc.get("responsibilityLevel") or doc.get("responsibility_level") or "",
        "project": doc.get("project", ""),
        "workType": doc.get("workType", ""),
        "workTeam": doc.get("workTeam", ""),
        "team": doc.get("team", ""),
        "entryDate": doc.get("entryDate", ""),
        "status": doc.get("status", "active"),
        "emergencyContact": doc.get("emergencyContact", ""),
    }


def _first_text(*values) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _person_delete_details(person: dict) -> str:
    parts = []
    name = _first_text(person.get("name"), person.get("username"))
    employee_id = _first_text(person.get("employeeId"), person.get("employee_id"))
    company = _first_text(person.get("company"), person.get("dept"), person.get("department"))
    project = _first_text(person.get("project"), person.get("projectName"), person.get("project_name"))
    grid = _first_text(person.get("grid"), person.get("gridName"), person.get("grid_name"))
    team = _first_text(person.get("team"), person.get("workTeam"), person.get("work_team"))
    if name:
        parts.append(f"人员：{name}")
    if employee_id:
        parts.append(f"工号：{employee_id}")
    if company:
        parts.append(f"所属公司：{company}")
    if project:
        parts.append(f"所属项目：{project}")
    if grid:
        parts.append(f"所属网格：{grid}")
    if team:
        parts.append(f"所属工队：{team}")
    return "已删除人员" + (f"（{'；'.join(parts)}）" if parts else "")


class PersonnelService:
    def __init__(self):
        self.collection = get_personnel_collection()
        self.user_collection = get_mongo_collection("users")
        self.branch_collection = get_mongo_collection("branch")

    def _find_branch_id_by_name(self, company: str | None):
        name = str(company or "").strip()
        if not name:
            return None
        branch = self.branch_collection.find_one({"name": name}, {"_id": 0, "id": 1})
        if not branch:
            return None
        try:
            return int(branch.get("id"))
        except (TypeError, ValueError):
            return None

    def _sync_login_account(self, doc: dict):
        role = doc.get("role")
        if _is_worker_role(role):
            self.user_collection.delete_one({"personnel_id": str(doc.get("_id"))})
            return

        username = (
            doc.get("loginUsername")
            or doc.get("employeeId")
            or doc.get("phone")
            or doc.get("username")
            or ""
        ).strip()
        password = (doc.get("loginPassword") or doc.get("password") or "").strip()
        if not username:
            return

        permission_level = _permission_level_for(role, doc.get("permissionLevel"))
        app_role = APP_ROLE_BY_PERMISSION.get(permission_level, "PROJECT")
        department_id = 0 if app_role == "HQ" else self._find_branch_id_by_name(doc.get("company"))

        user_doc = {
            "username": username,
            "hashed_password": password,
            "password": password,
            "role": app_role,
            "permission_level": permission_level,
            "permissions": get_permissions_for_level(permission_level),
            "grid_role": doc.get("gridRole") or doc.get("grid_role") or "",
            "grid_ids": doc.get("gridIds") or doc.get("grid_ids") or [],
            "responsibility_unit_id": doc.get("responsibilityUnitId") or doc.get("responsibility_unit_id") or "",
            "phone": doc.get("phone") or "",
            "department": doc.get("company") or doc.get("dept") or "",
            "department_id": department_id,
            "parent_id": None,
            "full_name": doc.get("username") or username,
            "status": "active",
            "employee_code": doc.get("employeeId") or "",
            "id_card": doc.get("idCard") or "",
            "work_type_id": doc.get("workType") or "",
            "team": doc.get("team") or "",
            "work_team": doc.get("workTeam") or "",
            "company": doc.get("company") or "",
            "branch_id": doc.get("branchId") or doc.get("branch_id") or "",
            "project_id": doc.get("projectId") or doc.get("project_id") or "",
            "grid_id": doc.get("gridId") or doc.get("grid_id") or "",
            "team_id": doc.get("teamId") or doc.get("team_id") or "",
            "is_responsibility_person": bool(doc.get("isResponsibilityPerson") or doc.get("is_responsibility_person")),
            "responsibility_level": doc.get("responsibilityLevel") or doc.get("responsibility_level") or "",
            "project": doc.get("project") or "",
            "entry_date": doc.get("entryDate") or "",
            "emergency_contact": doc.get("emergencyContact") or "",
            "personnel_id": str(doc.get("_id")),
            "updated_at": datetime.now(),
        }

        existing = self.user_collection.find_one({
            "$or": [
                {"personnel_id": str(doc.get("_id"))},
                {"username": username},
            ]
        })
        if not password and existing:
            password = existing.get("hashed_password") or existing.get("password") or ""
        if not password:
            return

        user_doc["hashed_password"] = password
        user_doc["password"] = password

        if existing:
            self.user_collection.update_one({"_id": existing["_id"]}, {"$set": user_doc})
            return

        user_doc["id"] = int(get_next_sequence("user_id"))
        user_doc["created_at"] = datetime.now()
        self.user_collection.insert_one(user_doc)

    def list_personnel(self, current_user: dict = None):
        filter_query = {}
        if current_user:
            filter_query = scope_filter(
                current_user,
                project_fields=("projectId", "project_id"),
                grid_fields=("gridId", "grid_id", "gridIds", "grid_ids"),
                team_fields=("teamId", "team_id"),
                branch_fields=("branchId", "branch_id"),
                company_fields=("company", "dept", "department"),
                project_name_fields=("project",),
                team_name_fields=("team", "workTeam", "work_team"),
            )
        docs = list(self.collection.find(filter_query).sort("created_at", 1))
        return [_to_out(doc) for doc in docs]

    def create_personnel(self, data: PersonnelCreate, current_user: dict = None):
        doc = data.dict()
        duplicate_or = []
        for field in ("employeeId", "idCard", "phone"):
            value = str(doc.get(field) or "").strip()
            if value:
                duplicate_or.append({field: value})
        username = str(doc.get("username") or "").strip()
        if username:
            scoped_name_query = {"username": username}
            for field in ("company", "project", "workTeam", "team"):
                value = str(doc.get(field) or "").strip()
                if value:
                    scoped_name_query[field] = value
            duplicate_or.append(scoped_name_query)
        if duplicate_or:
            existing = self.collection.find_one({"$or": duplicate_or})
            if existing:
                raise DuplicateKeyError("人员已存在，请勿重复创建")

        if doc.get("role") == "HQ Manager":
            doc["parentId"] = None

        doc["addedDate"] = datetime.now().strftime("%Y-%m-%d")
        doc["created_at"] = datetime.now()
        doc["updated_at"] = datetime.now()

        result = self.collection.insert_one(doc)
        new_doc = self.collection.find_one({"_id": result.inserted_id})
        self._sync_login_account(new_doc)
        write_audit_log(
            current_user=current_user,
            action="添加人员",
            target_type="person",
            target_name=new_doc.get("name") or new_doc.get("username") or str(new_doc.get("_id")),
            after=new_doc,
            company=new_doc.get("company") or new_doc.get("dept"),
            project=new_doc.get("project"),
            grid=new_doc.get("grid") or new_doc.get("gridName") or new_doc.get("grid_name") or new_doc.get("gridId") or new_doc.get("grid_id"),
            team=new_doc.get("team") or new_doc.get("workTeam"),
        )
        logger.info(f"Created personnel: {doc.get('username')}")
        return _to_out(new_doc)

    def get_personnel_by_id(self, personnel_id: str, current_user: dict = None):
        if not ObjectId.is_valid(personnel_id):
            return None
        doc = self.collection.find_one({"_id": ObjectId(personnel_id)})
        if current_user and not in_scope(
            doc,
            current_user,
            project_fields=("projectId", "project_id"),
            grid_fields=("gridId", "grid_id", "gridIds", "grid_ids"),
            team_fields=("teamId", "team_id"),
            branch_fields=("branchId", "branch_id"),
            company_fields=("company", "dept", "department"),
            project_name_fields=("project",),
            team_name_fields=("team", "workTeam", "work_team"),
        ):
            return None
        return _to_out(doc) if doc else None

    def update_personnel(self, personnel_id: str, data: PersonnelUpdate, current_user: dict = None):
        if not ObjectId.is_valid(personnel_id):
            return None
        existing = self.collection.find_one({"_id": ObjectId(personnel_id)})
        if current_user and not in_scope(
            existing,
            current_user,
            project_fields=("projectId", "project_id"),
            grid_fields=("gridId", "grid_id", "gridIds", "grid_ids"),
            team_fields=("teamId", "team_id"),
            branch_fields=("branchId", "branch_id"),
            company_fields=("company", "dept", "department"),
            project_name_fields=("project",),
            team_name_fields=("team", "workTeam", "work_team"),
        ):
            return None

        update_data = {
            k: v for k, v in data.dict(exclude_unset=True).items()
            if v is not None
        }

        if not update_data:
            doc = self.collection.find_one({"_id": ObjectId(personnel_id)})
            return _to_out(doc) if doc else None

        if update_data.get("role") == "HQ Manager":
            update_data["parentId"] = None

        update_data["updated_at"] = datetime.now()

        self.collection.update_one(
            {"_id": ObjectId(personnel_id)},
            {"$set": update_data}
        )

        doc = self.collection.find_one({"_id": ObjectId(personnel_id)})
        if doc:
            self._sync_login_account(doc)
            write_audit_log(
                current_user=current_user,
                action="变更人员信息",
                target_type="person",
                target_name=doc.get("name") or doc.get("username") or personnel_id,
                before=existing,
                after=doc,
                company=doc.get("company") or doc.get("dept"),
                project=doc.get("project"),
                grid=doc.get("grid") or doc.get("gridName") or doc.get("grid_name") or doc.get("gridId") or doc.get("grid_id"),
                team=doc.get("team") or doc.get("workTeam"),
            )
        return _to_out(doc) if doc else None

    def update_face_image(self, personnel_id: str, face_image_url: str, current_user: dict = None):
        if not ObjectId.is_valid(personnel_id):
            return None
        existing = self.collection.find_one({"_id": ObjectId(personnel_id)})
        if current_user and not in_scope(
            existing,
            current_user,
            project_fields=("projectId", "project_id"),
            grid_fields=("gridId", "grid_id", "gridIds", "grid_ids"),
            team_fields=("teamId", "team_id"),
            branch_fields=("branchId", "branch_id"),
            company_fields=("company", "dept", "department"),
            project_name_fields=("project",),
            team_name_fields=("team", "workTeam", "work_team"),
        ):
            return None

        self.collection.update_one(
            {"_id": ObjectId(personnel_id)},
            {
                "$set": {
                    "faceImage": face_image_url,
                    "updated_at": datetime.now(),
                }
            }
        )

        doc = self.collection.find_one({"_id": ObjectId(personnel_id)})
        return _to_out(doc) if doc else None

    def delete_personnel(self, personnel_id: str, current_user: dict = None):
        if not ObjectId.is_valid(personnel_id):
            return False
        existing = self.collection.find_one({"_id": ObjectId(personnel_id)})
        if current_user and not in_scope(
            existing,
            current_user,
            project_fields=("projectId", "project_id"),
            grid_fields=("gridId", "grid_id", "gridIds", "grid_ids"),
            team_fields=("teamId", "team_id"),
            branch_fields=("branchId", "branch_id"),
            company_fields=("company", "dept", "department"),
            project_name_fields=("project",),
            team_name_fields=("team", "workTeam", "work_team"),
        ):
            return False

        # 删除该人员，同时把直属下级的 parentId 清空，避免树结构断掉后仍引用不存在的人
        result = self.collection.delete_one({"_id": ObjectId(personnel_id)})
        if result.deleted_count:
            self.user_collection.delete_one({"personnel_id": personnel_id})
            self.collection.update_many(
                {"parentId": personnel_id},
                {"$set": {"parentId": None, "updated_at": datetime.now()}}
            )
            write_audit_log(
                current_user=current_user,
                action="删除人员",
                target_type="person",
                target_name=existing.get("name") or existing.get("username") or personnel_id,
                before=existing,
                details=_person_delete_details(existing),
                company=existing.get("company") or existing.get("dept"),
                project=existing.get("project"),
                grid=existing.get("grid") or existing.get("gridName") or existing.get("grid_name") or existing.get("gridId") or existing.get("grid_id"),
                team=existing.get("team") or existing.get("workTeam"),
                level="warning",
                allowed_fields=set(),
            )
            return True

        return False
