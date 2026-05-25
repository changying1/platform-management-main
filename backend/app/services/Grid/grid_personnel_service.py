from datetime import datetime
from bson import ObjectId
from app.core.database import get_mongo_collection
from app.schemas.grid_personnel_schema import GridPersonnelCreate, GridPersonnelUpdate
from app.utils.logger import get_logger

logger = get_logger("GridPersonnelService")

personnel_collection = get_mongo_collection("grid_personnel")


def _to_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "role": doc.get("role", ""),
        "phone": doc.get("phone", ""),
        "department": doc.get("department", ""),
        "grid_ids": doc.get("grid_ids", []),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
    }


class GridPersonnelService:
    def list_personnel(self, role: str = None, department: str = None):
        filter_query = {}
        if role:
            filter_query["role"] = role
        if department:
            filter_query["department"] = department

        docs = list(personnel_collection.find(filter_query).sort("created_at", -1))
        return [_to_out(doc) for doc in docs]

    def get_personnel_by_id(self, personnel_id: str):
        if not ObjectId.is_valid(personnel_id):
            return None
        doc = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
        return _to_out(doc) if doc else None

    def create_personnel(self, data: GridPersonnelCreate):
        doc = data.model_dump()
        now = datetime.now().isoformat()
        doc["created_at"] = now
        doc["updated_at"] = now

        result = personnel_collection.insert_one(doc)
        new_doc = personnel_collection.find_one({"_id": result.inserted_id})
        logger.info(f"Created grid personnel: {doc.get('name')}")
        return _to_out(new_doc)

    def update_personnel(self, personnel_id: str, data: GridPersonnelUpdate):
        if not ObjectId.is_valid(personnel_id):
            return None

        update_data = {
            k: v for k, v in data.model_dump(exclude_unset=True).items()
            if v is not None
        }

        if not update_data:
            doc = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
            return _to_out(doc) if doc else None

        update_data["updated_at"] = datetime.now().isoformat()

        personnel_collection.update_one(
            {"_id": ObjectId(personnel_id)},
            {"$set": update_data}
        )

        doc = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
        return _to_out(doc) if doc else None

    def delete_personnel(self, personnel_id: str):
        if not ObjectId.is_valid(personnel_id):
            return False

        result = personnel_collection.delete_one({"_id": ObjectId(personnel_id)})
        if result.deleted_count:
            logger.info(f"Deleted grid personnel: {personnel_id}")
            return True
        return False

    def assign_grid(self, personnel_id: str, grid_id: str):
        if not ObjectId.is_valid(personnel_id):
            return None

        personnel_collection.update_one(
            {"_id": ObjectId(personnel_id)},
            {
                "$addToSet": {"grid_ids": grid_id},
                "$set": {"updated_at": datetime.now().isoformat()},
            }
        )

        doc = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
        return _to_out(doc) if doc else None

    def remove_grid(self, personnel_id: str, grid_id: str):
        if not ObjectId.is_valid(personnel_id):
            return None

        personnel_collection.update_one(
            {"_id": ObjectId(personnel_id)},
            {
                "$pull": {"grid_ids": grid_id},
                "$set": {"updated_at": datetime.now().isoformat()},
            }
        )

        doc = personnel_collection.find_one({"_id": ObjectId(personnel_id)})
        return _to_out(doc) if doc else None


grid_personnel_service = GridPersonnelService()
