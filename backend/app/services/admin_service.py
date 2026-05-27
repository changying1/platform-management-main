from app.core.database import get_mongo_collection, get_next_sequence
from app.schemas.admin_schema import UserCreate, UserUpdate
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

    def create_user(self, mongo_db, user_data: UserCreate):
        logger.info(f"Creating new user: {user_data.username} with role {user_data.role}")
        next_id = get_next_sequence("user_id")
        doc = {
            "id": next_id,
            "username": user_data.username,
            "hashed_password": user_data.password,
            "password": user_data.password,
            "role": user_data.role,
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

    def update_user(self, mongo_db, user_id: int, user_data: UserUpdate):
        logger.info(f"Updating user {user_id}")
        if not self._find_by_id(user_id):
            return None

        updates = {}
        for field in ["username", "full_name", "role", "phone", "department", "parent_id", "department_id"]:
            value = getattr(user_data, field, None)
            if value is not None:
                updates[field] = value
        if user_data.password:
            updates["hashed_password"] = user_data.password
            updates["password"] = user_data.password

        if updates:
            self.collection.update_one({"$or": [{"id": int(user_id)}, {"id": str(user_id)}]}, {"$set": updates})
        return self._to_out(self._find_by_id(user_id))

    def get_users_by_hierarchy(self, mongo_db, user_id: int):
        logger.info(f"Fetching users (hierarchy context for {user_id})")
        return [self._to_out(doc) for doc in self.collection.find({}, {"_id": 0}).sort("id", 1)]

    def delete_user(self, mongo_db, user_id: int):
        logger.info(f"Deleting user {user_id}")
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
