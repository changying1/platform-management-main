from datetime import datetime

from bson import ObjectId

from app.core.data_scope import in_scope, merge_filters, scope_filter
from app.core.database import get_personnel_collection
from app.schemas.grid_personnel_schema import GridPersonnelCreate, GridPersonnelUpdate
from app.utils.logger import get_logger


logger = get_logger("GridPersonnelService")

personnel_collection = get_personnel_collection()

DEFAULT_GRID_ROLE = "grid_manager"


def _grid_role(doc: dict) -> str:
    return doc.get("gridRole") or doc.get("grid_role") or ""


def _grid_ids(doc: dict) -> list[str]:
    value = doc.get("gridIds") if doc.get("gridIds") is not None else doc.get("grid_ids")
    return value if isinstance(value, list) else []


def _to_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("username") or doc.get("name") or "",
        "role": _grid_role(doc) or DEFAULT_GRID_ROLE,
        "phone": doc.get("phone") or "",
        "department": doc.get("company") or doc.get("dept") or doc.get("department") or "",
        "grid_ids": _grid_ids(doc),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
    }


class GridPersonnelService:
    def list_personnel(self, role: str = None, department: str = None, current_user: dict = None):
        filter_query = {
            "$or": [
                {"gridRole": {"$exists": True, "$ne": ""}},
                {"grid_role": {"$exists": True, "$ne": ""}},
                {"gridIds": {"$exists": True, "$ne": []}},
                {"grid_ids": {"$exists": True, "$ne": []}},
            ]
        }
        if role:
            filter_query["$and"] = [{
                "$or": [
                    {"gridRole": role},
                    {"grid_role": role},
                ]
            }]
        if department:
            filter_query.setdefault("$and", []).append({
                "$or": [
                    {"company": department},
                    {"dept": department},
                    {"department": department},
                ]
            })
        if current_user:
            filter_query = merge_filters(filter_query, scope_filter(
                current_user,
                project_fields=("projectId", "project_id"),
                grid_fields=("gridIds", "grid_ids", "gridId", "grid_id"),
                team_fields=("teamId", "team_id"),
                branch_fields=("branchId", "branch_id"),
                company_fields=("company", "dept", "department"),
                project_name_fields=("project",),
                team_name_fields=("team", "workTeam", "work_team"),
            ))

        docs = list(personnel_collection.find(filter_query).sort("created_at", -1))
        return [_to_out(doc) for doc in docs]

    def get_personnel_by_id(self, personnel_id: str, current_user: dict = None):
        if not ObjectId.is_valid(personnel_id):
            return None
        doc = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
        if current_user and not in_scope(
            doc,
            current_user,
            project_fields=("projectId", "project_id"),
            grid_fields=("gridIds", "grid_ids", "gridId", "grid_id"),
            team_fields=("teamId", "team_id"),
            branch_fields=("branchId", "branch_id"),
            company_fields=("company", "dept", "department"),
            project_name_fields=("project",),
            team_name_fields=("team", "workTeam", "work_team"),
        ):
            return None
        return _to_out(doc) if doc else None

    def create_personnel(self, data: GridPersonnelCreate):
        doc = data.model_dump()
        now = datetime.now().isoformat()
        personnel_doc = {
            "username": doc.get("name") or "",
            "phone": doc.get("phone") or "",
            "company": doc.get("department") or "",
            "dept": doc.get("department") or "",
            "role": "Worker",
            "gridRole": doc.get("role") or DEFAULT_GRID_ROLE,
            "gridIds": doc.get("grid_ids") or [],
            "created_at": now,
            "updated_at": now,
        }

        result = personnel_collection.insert_one(personnel_doc)
        new_doc = personnel_collection.find_one({"_id": result.inserted_id})
        logger.info(f"Created grid responsible personnel from personnel: {doc.get('name')}")
        return _to_out(new_doc)

    def update_personnel(self, personnel_id: str, data: GridPersonnelUpdate, current_user: dict = None):
        if not ObjectId.is_valid(personnel_id):
            return None
        existing = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
        if current_user and not in_scope(
            existing,
            current_user,
            project_fields=("projectId", "project_id"),
            grid_fields=("gridIds", "grid_ids", "gridId", "grid_id"),
            team_fields=("teamId", "team_id"),
            branch_fields=("branchId", "branch_id"),
            company_fields=("company", "dept", "department"),
            project_name_fields=("project",),
            team_name_fields=("team", "workTeam", "work_team"),
        ):
            return None

        update_data = {}
        payload = data.model_dump(exclude_unset=True)
        if "name" in payload and payload["name"] is not None:
            update_data["username"] = payload["name"]
        if "phone" in payload and payload["phone"] is not None:
            update_data["phone"] = payload["phone"]
        if "department" in payload and payload["department"] is not None:
            update_data["company"] = payload["department"]
            update_data["dept"] = payload["department"]
        if "role" in payload and payload["role"] is not None:
            update_data["gridRole"] = payload["role"]
            update_data["grid_role"] = payload["role"]
        if "grid_ids" in payload and payload["grid_ids"] is not None:
            update_data["gridIds"] = payload["grid_ids"]
            update_data["grid_ids"] = payload["grid_ids"]

        if not update_data:
            doc = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
            return _to_out(doc) if doc else None

        update_data["updated_at"] = datetime.now().isoformat()
        personnel_collection.update_one({"_id": ObjectId(personnel_id)}, {"$set": update_data})
        doc = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
        return _to_out(doc) if doc else None

    def delete_personnel(self, personnel_id: str, current_user: dict = None):
        if not ObjectId.is_valid(personnel_id):
            return False
        existing = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
        if current_user and not in_scope(
            existing,
            current_user,
            project_fields=("projectId", "project_id"),
            grid_fields=("gridIds", "grid_ids", "gridId", "grid_id"),
            team_fields=("teamId", "team_id"),
            branch_fields=("branchId", "branch_id"),
            company_fields=("company", "dept", "department"),
            project_name_fields=("project",),
            team_name_fields=("team", "workTeam", "work_team"),
        ):
            return False

        result = personnel_collection.update_one(
            {"_id": ObjectId(personnel_id)},
            {
                "$unset": {"gridRole": "", "grid_role": "", "gridIds": "", "grid_ids": ""},
                "$set": {"updated_at": datetime.now().isoformat()},
            },
        )
        if result.modified_count:
            logger.info(f"Removed grid responsibility from personnel: {personnel_id}")
            return True
        return False

    def assign_grid(self, personnel_id: str, grid_id: str, current_user: dict = None):
        if not ObjectId.is_valid(personnel_id):
            return None
        existing = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
        if current_user and not in_scope(
            existing,
            current_user,
            project_fields=("projectId", "project_id"),
            grid_fields=("gridIds", "grid_ids", "gridId", "grid_id"),
            team_fields=("teamId", "team_id"),
            branch_fields=("branchId", "branch_id"),
            company_fields=("company", "dept", "department"),
            project_name_fields=("project",),
            team_name_fields=("team", "workTeam", "work_team"),
        ):
            return None

        personnel_collection.update_one(
            {"_id": ObjectId(personnel_id)},
            {
                "$addToSet": {"gridIds": grid_id, "grid_ids": grid_id},
                "$set": {
                    "gridRole": DEFAULT_GRID_ROLE,
                    "grid_role": DEFAULT_GRID_ROLE,
                    "updated_at": datetime.now().isoformat(),
                },
            },
        )
        doc = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
        return _to_out(doc) if doc else None

    def remove_grid(self, personnel_id: str, grid_id: str, current_user: dict = None):
        if not ObjectId.is_valid(personnel_id):
            return None
        existing = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
        if current_user and not in_scope(
            existing,
            current_user,
            project_fields=("projectId", "project_id"),
            grid_fields=("gridIds", "grid_ids", "gridId", "grid_id"),
            team_fields=("teamId", "team_id"),
            branch_fields=("branchId", "branch_id"),
            company_fields=("company", "dept", "department"),
            project_name_fields=("project",),
            team_name_fields=("team", "workTeam", "work_team"),
        ):
            return None

        personnel_collection.update_one(
            {"_id": ObjectId(personnel_id)},
            {
                "$pull": {"gridIds": grid_id, "grid_ids": grid_id},
                "$set": {"updated_at": datetime.now().isoformat()},
            },
        )
        doc = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
        return _to_out(doc) if doc else None


grid_personnel_service = GridPersonnelService()
