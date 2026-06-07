from datetime import datetime

from app.core.database import get_mongo_collection, get_next_sequence
from app.core.data_scope import in_scope
from app.schemas.admin_schema import UserCreate, UserUpdate
from app.utils.config_manager import get_force_initial_password_change
from app.utils.logger import get_logger

logger = get_logger("AdminService")


class AdminService:
    def __init__(self):
        self.collection = get_mongo_collection("users")

    def _to_out(self, doc: dict | None):
        if not doc:
            return None
        return {
            "id": int(doc.get("id") or 0),
            "username": doc.get("username") or "",
            "full_name": doc.get("full_name") or doc.get("username"),
            "role": doc.get("role") or "BRANCH",
            "phone": doc.get("phone"),
            "department": doc.get("department"),
            "department_id": doc.get("department_id"),
            "parent_id": doc.get("parent_id"),
            "status": doc.get("status") or "pending",
            "employee_code": doc.get("employee_code"),
        }

    def _find_by_id(self, user_id: int):
        return self.collection.find_one({"$or": [{"id": int(user_id)}, {"id": str(user_id)}]})

    def _visible_to_user(self, doc: dict | None, current_user: dict | None) -> bool:
        if current_user is None:
            return True
        if str((doc or {}).get("username") or "") == str(current_user.get("username") or ""):
            return True
        return in_scope(
            doc,
            current_user,
            project_fields=("project_id",),
            grid_fields=("grid_id", "grid_ids"),
            team_fields=("team_id",),
            branch_fields=("branch_id", "department_id"),
            company_fields=("company", "department"),
            project_name_fields=("project",),
            team_name_fields=("team", "work_team"),
        )

    def create_user(self, mongo_db, user_data: UserCreate):
        logger.info(f"Creating new user: {user_data.username} with role {user_data.role}")
        next_id = get_next_sequence("user_id")
        doc = {
            "id": next_id,
            "username": user_data.username,
            "hashed_password": user_data.password,
            "password": user_data.password,
            "password_changed_at": None,
            "must_change_password": get_force_initial_password_change(),
            "role": user_data.role,
            "permission_level": {
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
            }.get(str(user_data.role), None),
            "phone": user_data.phone,
            "department": user_data.department,
            "department_id": user_data.department_id,
            "parent_id": user_data.parent_id,
            "full_name": user_data.full_name or user_data.username,
            "status": "pending",
            "employee_code": user_data.employee_code,
            "id_card": user_data.id_card,
            "work_type_id": user_data.work_type_id,
            "team": user_data.team,
            "work_team": user_data.work_team,
            "company": user_data.company,
            "project": user_data.project,
            "entry_date": user_data.entry_date,
            "emergency_contact": user_data.emergency_contact,
        }
        self.collection.insert_one(doc)
        return self._to_out(doc)

    def update_user(self, mongo_db, user_id: int, user_data: UserUpdate, current_user: dict | None = None):
        logger.info(f"Updating user {user_id}")
        existing = self._find_by_id(user_id)
        if not existing or not self._visible_to_user(existing, current_user):
            return None

        updates = {}
        for field in ["username", "full_name", "role", "phone", "department", "parent_id", "department_id", "team", "work_team", "company", "project"]:
            value = getattr(user_data, field, None)
            if value is not None:
                updates[field] = value
        if "role" in updates:
            updates["permission_level"] = {
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
            }.get(str(updates["role"]), None)
        if user_data.password:
            updates["hashed_password"] = user_data.password
            updates["password"] = user_data.password
            updates["password_changed_at"] = datetime.now()
            updates["must_change_password"] = get_force_initial_password_change()

        if updates:
            updates["updated_at"] = datetime.now()
            self.collection.update_one({"$or": [{"id": int(user_id)}, {"id": str(user_id)}]}, {"$set": updates})
        return self._to_out(self._find_by_id(user_id))

    def get_users_by_hierarchy(self, mongo_db, user_id: int, current_user: dict | None = None):
        logger.info(f"Fetching users (hierarchy context for {user_id})")
        docs = self.collection.find({}, {"_id": 0}).sort("id", 1)
        return [self._to_out(doc) for doc in docs if self._visible_to_user(doc, current_user)]

    def delete_user(self, mongo_db, user_id: int, current_user: dict | None = None):
        logger.info(f"Deleting user {user_id}")
        existing = self._find_by_id(user_id)
        if not self._visible_to_user(existing, current_user):
            return False
        result = self.collection.delete_one({"$or": [{"id": int(user_id)}, {"id": str(user_id)}]})
        return result.deleted_count > 0

    def get_users_by_status(self, mongo_db, status: str):
        logger.info(f"Fetching users with status: {status}")
        return [self._to_out(doc) for doc in self.collection.find({"status": status}, {"_id": 0}).sort("id", 1)]

    def update_user_status(self, mongo_db, user_id: int, status: str):
        logger.info(f"Updating user {user_id} status to: {status}")
        result = self.collection.update_one(
            {"$or": [{"id": int(user_id)}, {"id": str(user_id)}]},
            {"$set": {"status": status}}
        )
        
        if result.modified_count > 0:
            logger.info(f"User {user_id} status updated to {status}")
            return self._to_out(self._find_by_id(user_id))
        return None

    def approve_all_pending(self, mongo_db):
        logger.info("Approving all pending users")
        result = self.collection.update_many({"status": "pending"}, {"$set": {"status": "active"}})
        
        if result.modified_count > 0:
            logger.info(f"Approved {result.modified_count} pending users")
        return result.modified_count
