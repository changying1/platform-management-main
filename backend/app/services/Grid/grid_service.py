from datetime import datetime
import json
import math
from bson import ObjectId
from app.core.data_scope import in_scope, merge_filters, scope_filter
from app.core.database import get_mongo_collection
from app.schemas.grid_schema import GridCreate, GridUpdate
from app.utils.logger import get_logger

logger = get_logger("GridService")

grid_collection = get_mongo_collection("grid")


def _calculate_area(bounds_json: str | None) -> float | None:
    if not bounds_json:
        return None
    try:
        points = json.loads(bounds_json)
    except (TypeError, ValueError):
        return None
    if not isinstance(points, list) or len(points) < 3:
        return None

    normalized = []
    for point in points:
        if not isinstance(point, list) or len(point) < 2:
            return None
        try:
            lat = float(point[0])
            lng = float(point[1])
        except (TypeError, ValueError):
            return None
        normalized.append((lat, lng))

    avg_lat = sum(lat for lat, _lng in normalized) / len(normalized)
    meters_per_lat = 111_320
    meters_per_lng = 111_320 * math.cos(math.radians(avg_lat))
    projected = [(lng * meters_per_lng, lat * meters_per_lat) for lat, lng in normalized]

    shoelace = 0.0
    for index, (x1, y1) in enumerate(projected):
        x2, y2 = projected[(index + 1) % len(projected)]
        shoelace += x1 * y2 - x2 * y1
    return round(abs(shoelace) / 2, 2)


def _to_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "grid_id": doc.get("grid_id", ""),
        "name": doc.get("name", ""),
        "level": doc.get("level") or "workface",
        "description": doc.get("description", ""),
        "bounds_json": doc.get("bounds_json", ""),
        "status": doc.get("status") or "normal",
        "area": doc.get("area") if doc.get("area") is not None else _calculate_area(doc.get("bounds_json")),
        "parent_id": doc.get("parent_id"),
        "project_id": str(doc.get("project_id") or ""),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
    }


class GridService:
    def list_grids(self, level: str = None, status: str = None, current_user: dict = None):
        filter_query = {}
        if level:
            filter_query["level"] = level
        if status:
            filter_query["status"] = status

        if current_user:
            filter_query = merge_filters(filter_query, scope_filter(
                current_user,
                project_fields=("project_id",),
                grid_fields=("grid_id", "parent_id"),
                team_fields=(),
                branch_fields=(),
                company_fields=(),
                project_name_fields=(),
                team_name_fields=(),
            ))

        docs = list(grid_collection.find(filter_query).sort("created_at", -1))
        return [_to_out(doc) for doc in docs]

    def get_grid_by_id(self, grid_id: str, current_user: dict = None):
        doc = grid_collection.find_one({"grid_id": grid_id})
        if doc and (not current_user or in_scope(
            doc,
            current_user,
            project_fields=("project_id",),
            grid_fields=("grid_id", "parent_id"),
            team_fields=(),
            branch_fields=(),
            company_fields=(),
            project_name_fields=(),
            team_name_fields=(),
        )):
            return _to_out(doc)
        if ObjectId.is_valid(grid_id):
            doc = grid_collection.find_one({"_id": ObjectId(grid_id)})
            if doc and (not current_user or in_scope(
                doc,
                current_user,
                project_fields=("project_id",),
                grid_fields=("grid_id", "parent_id"),
                team_fields=(),
                branch_fields=(),
                company_fields=(),
                project_name_fields=(),
                team_name_fields=(),
            )):
                return _to_out(doc)
        return None

    def get_grid_by_object_id(self, object_id: str):
        if not ObjectId.is_valid(object_id):
            return None
        doc = grid_collection.find_one({"_id": ObjectId(object_id)})
        return _to_out(doc) if doc else None

    def create_grid(self, data: GridCreate):
        doc = data.model_dump()
        if not str(doc.get("project_id") or "").strip():
            raise ValueError("Grid must belong to a project")
        if grid_collection.find_one({"grid_id": doc.get("grid_id")}):
            raise ValueError("Grid ID already exists")
        now = datetime.now().isoformat()
        doc["status"] = doc.get("status") or "normal"
        doc["area"] = doc.get("area") if doc.get("area") is not None else _calculate_area(doc.get("bounds_json"))
        doc["created_at"] = now
        doc["updated_at"] = now

        result = grid_collection.insert_one(doc)
        new_doc = grid_collection.find_one({"_id": result.inserted_id})
        logger.info(f"Created grid: {doc.get('name')}")
        return _to_out(new_doc)

    def update_grid(self, grid_id: str, data: GridUpdate, current_user: dict = None):
        if not ObjectId.is_valid(grid_id):
            return None
        existing = grid_collection.find_one({"_id": ObjectId(grid_id)})
        if current_user and not in_scope(
            existing,
            current_user,
            project_fields=("project_id",),
            grid_fields=("grid_id", "parent_id"),
            team_fields=(),
            branch_fields=(),
            company_fields=(),
            project_name_fields=(),
            team_name_fields=(),
        ):
            return None

        update_data = {
            k: v for k, v in data.model_dump(exclude_unset=True).items()
            if v is not None
        }

        if not update_data:
            doc = grid_collection.find_one({"_id": ObjectId(grid_id)})
            return _to_out(doc) if doc else None

        update_data["updated_at"] = datetime.now().isoformat()
        if "bounds_json" in update_data and "area" not in update_data:
            update_data["area"] = _calculate_area(update_data.get("bounds_json"))

        grid_collection.update_one(
            {"_id": ObjectId(grid_id)},
            {"$set": update_data}
        )

        doc = grid_collection.find_one({"_id": ObjectId(grid_id)})
        return _to_out(doc) if doc else None

    def delete_grid(self, grid_id: str, current_user: dict = None):
        if not ObjectId.is_valid(grid_id):
            return False
        existing = grid_collection.find_one({"_id": ObjectId(grid_id)})
        if current_user and not in_scope(
            existing,
            current_user,
            project_fields=("project_id",),
            grid_fields=("grid_id", "parent_id"),
            team_fields=(),
            branch_fields=(),
            company_fields=(),
            project_name_fields=(),
            team_name_fields=(),
        ):
            return False

        result = grid_collection.delete_one({"_id": ObjectId(grid_id)})
        if result.deleted_count:
            logger.info(f"Deleted grid: {grid_id}")
            return True
        return False

    def get_grid_stats(self, current_user: dict = None):
        query = {}
        if current_user:
            query = scope_filter(
                current_user,
                project_fields=("project_id",),
                grid_fields=("grid_id", "parent_id"),
                team_fields=(),
                branch_fields=(),
                company_fields=(),
                project_name_fields=(),
                team_name_fields=(),
            )
        total = grid_collection.count_documents(query)
        normal = grid_collection.count_documents(query)
        warning = 0
        alarm = 0

        return {
            "total_count": total,
            "normal_count": normal,
            "warning_count": warning,
            "alarm_count": alarm,
        }


grid_service = GridService()
