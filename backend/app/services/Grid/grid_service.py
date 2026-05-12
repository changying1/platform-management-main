from datetime import datetime
from bson import ObjectId
from app.core.database import get_mongo_collection
from app.schemas.grid_schema import GridCreate, GridUpdate
from app.utils.logger import get_logger

logger = get_logger("GridService")

grid_collection = get_mongo_collection("grid")


def _to_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "grid_id": doc.get("grid_id", ""),
        "name": doc.get("name", ""),
        "level": doc.get("level", ""),
        "status": doc.get("status", "normal"),
        "area": doc.get("area"),
        "description": doc.get("description", ""),
        "bounds_json": doc.get("bounds_json", ""),
        "parent_id": doc.get("parent_id"),
        "project_id": doc.get("project_id"),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
    }


class GridService:
    def list_grids(self, level: str = None, status: str = None):
        filter_query = {}
        if level:
            filter_query["level"] = level
        if status:
            filter_query["status"] = status

        docs = list(grid_collection.find(filter_query).sort("created_at", -1))
        return [_to_out(doc) for doc in docs]

    def get_grid_by_id(self, grid_id: str):
        # 优先按业务ID grid_id 查询
        doc = grid_collection.find_one({"grid_id": grid_id})
        if doc:
            return _to_out(doc)
        # 兼容 MongoDB ObjectId 查询
        if ObjectId.is_valid(grid_id):
            doc = grid_collection.find_one({"_id": ObjectId(grid_id)})
            return _to_out(doc) if doc else None
        return None

    def get_grid_by_object_id(self, object_id: str):
        if not ObjectId.is_valid(object_id):
            return None
        doc = grid_collection.find_one({"_id": ObjectId(object_id)})
        return _to_out(doc) if doc else None

    def create_grid(self, data: GridCreate):
        doc = data.model_dump()
        now = datetime.now().isoformat()
        doc["created_at"] = now
        doc["updated_at"] = now

        result = grid_collection.insert_one(doc)
        new_doc = grid_collection.find_one({"_id": result.inserted_id})
        logger.info(f"Created grid: {doc.get('name')}")
        return _to_out(new_doc)

    def update_grid(self, grid_id: str, data: GridUpdate):
        if not ObjectId.is_valid(grid_id):
            return None

        update_data = {
            k: v for k, v in data.model_dump(exclude_unset=True).items()
            if v is not None
        }

        if not update_data:
            doc = grid_collection.find_one({"_id": ObjectId(grid_id)})
            return _to_out(doc) if doc else None

        update_data["updated_at"] = datetime.now().isoformat()

        grid_collection.update_one(
            {"_id": ObjectId(grid_id)},
            {"$set": update_data}
        )

        doc = grid_collection.find_one({"_id": ObjectId(grid_id)})
        return _to_out(doc) if doc else None

    def delete_grid(self, grid_id: str):
        if not ObjectId.is_valid(grid_id):
            return False

        result = grid_collection.delete_one({"_id": ObjectId(grid_id)})
        if result.deleted_count:
            logger.info(f"Deleted grid: {grid_id}")
            return True
        return False

    def get_grid_stats(self):
        total = grid_collection.count_documents({})
        normal = grid_collection.count_documents({"status": "normal"})
        warning = grid_collection.count_documents({"status": "warning"})
        alarm = grid_collection.count_documents({"status": "alarm"})

        danger_rank = []
        for doc in grid_collection.find({"status": {"$in": ["warning", "alarm"]}}).sort("created_at", -1).limit(5):
            danger_rank.append({
                "grid_id": str(doc["_id"]),
                "grid_name": doc.get("name", ""),
                "status": doc.get("status", ""),
            })

        return {
            "total_count": total,
            "normal_count": normal,
            "warning_count": warning,
            "alarm_count": alarm,
            "danger_rank": danger_rank,
        }


grid_service = GridService()
