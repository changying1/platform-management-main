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
unit_collection = get_mongo_collection("responsibility_unit")
project_collections = (
    get_mongo_collection("project"),
    get_mongo_collection("projects"),
    get_mongo_collection("sql_projects"),
)


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


def _validate_bounds(bounds_json: str | None) -> float:
    area = _calculate_area(bounds_json)
    if area is None or area <= 0:
        raise ValueError("Grid boundary must contain at least three valid points")
    return area


def _text(value) -> str:
    return str(value or "").strip()


def _project_parent_candidates(project_id: str | None) -> list:
    raw = _text(project_id)
    if not raw:
        return []
    candidates = [raw, f"PRJ-{raw}"]
    if raw.startswith("PRJ-"):
        candidates.append(raw.removeprefix("PRJ-"))
    if raw.isdigit():
        candidates.append(int(raw))
    return list(dict.fromkeys(candidates))


def _grid_unit_id(grid_id: str) -> str:
    return grid_id if grid_id.startswith("GRID-") else f"GRID-{grid_id}"


def _find_grid_parent_unit_id(project_id: str | None) -> str | None:
    candidates = _project_parent_candidates(project_id)
    if not candidates:
        return None

    project = unit_collection.find_one({
        "type": "project",
        "$or": [
            {"project_id": {"$in": candidates}},
            {"unit_id": {"$in": candidates}},
            {"id": {"$in": candidates}},
        ],
    })
    if project:
        return _text(project.get("unit_id") or project.get("_id"))

    return _text(project_id) or None


def _lookup_project_name(project_id: str | None) -> str:
    raw = _text(project_id)
    if not raw:
        return ""
    values = [raw]
    if raw.isdigit():
        values.append(int(raw))
    if ObjectId.is_valid(raw):
        object_id = ObjectId(raw)
    else:
        object_id = None
    for collection in project_collections:
        query = {
            "$or": [
                {"id": {"$in": values}},
                {"project_id": {"$in": values}},
                {"unit_id": {"$in": values}},
                {"name": raw},
                {"project_name": raw},
            ]
        }
        if object_id:
            query["$or"].append({"_id": object_id})
        project = collection.find_one(query)
        if project:
            return _text(project.get("name") or project.get("project_name") or project.get("title"))
    return ""


def _lookup_unit_name(unit_id: str | None) -> str:
    raw = _text(unit_id)
    if not raw:
        return ""
    values = [raw]
    if raw.startswith("PRJ-"):
        values.append(raw.removeprefix("PRJ-"))
    if raw.startswith("GRID-"):
        values.append(raw.removeprefix("GRID-"))
    numeric_values = [int(value) for value in values if str(value).isdigit()]
    lookup_values = list(dict.fromkeys(values + numeric_values))
    object_ids = [ObjectId(value) for value in values if ObjectId.is_valid(value)]
    query = {
        "$or": [
            {"unit_id": {"$in": lookup_values}},
            {"id": {"$in": lookup_values}},
            {"project_id": {"$in": lookup_values}},
            {"grid_id": {"$in": lookup_values}},
            {"team_id": {"$in": lookup_values}},
            {"name": {"$in": [str(value) for value in values]}},
        ]
    }
    if object_ids:
        query["$or"].append({"_id": {"$in": object_ids}})
    unit = unit_collection.find_one(query)
    if unit:
        return _text(unit.get("name") or unit.get("project_name") or unit.get("team_name"))

    project_name = _lookup_project_name(raw)
    if project_name:
        return project_name

    grid = grid_collection.find_one({
        "$or": [
            {"grid_id": {"$in": lookup_values}},
            {"id": {"$in": lookup_values}},
            {"name": {"$in": [str(value) for value in values]}},
        ]
    })
    if grid:
        return _text(grid.get("name") or grid.get("grid_id"))
    return ""


def _sync_grid_responsibility_unit(doc: dict) -> None:
    grid_id = _text(doc.get("grid_id"))
    if not grid_id:
        return

    now = datetime.now().isoformat()
    parent_id = _text(doc.get("parent_id")) or _find_grid_parent_unit_id(doc.get("project_id"))
    unit_id = _grid_unit_id(grid_id)
    unit_doc = {
        "unit_id": unit_id,
        "name": doc.get("name") or grid_id,
        "type": "grid",
        "parent_id": parent_id or None,
        "project_id": _text(doc.get("project_id")) or None,
        "grid_id": grid_id,
        "team_id": None,
        "personnel_id": None,
        "responsible_person_id": None,
        "safety_office_role": "",
        "level": 4 if parent_id else 1,
        "is_under_construction": True,
        "updated_at": now,
    }

    existing = unit_collection.find_one({
        "$or": [
            {"grid_id": grid_id, "type": "grid"},
            {"unit_id": unit_id, "type": "grid"},
            {"unit_id": grid_id, "type": "grid"},
        ]
    })

    if existing:
        unit_collection.update_one({"_id": existing["_id"]}, {"$set": unit_doc})
        return

    max_sort = unit_collection.find_one({"parent_id": unit_doc["parent_id"]}, sort=[("sort_order", -1)])
    unit_doc["sort_order"] = (max_sort.get("sort_order", 0) + 1) if max_sort else 1
    unit_doc["created_at"] = now
    unit_collection.insert_one(unit_doc)


def _to_out(doc: dict) -> dict:
    project_id = _text(doc.get("project_id"))
    parent_id = _text(doc.get("parent_id"))
    return {
        "id": str(doc["_id"]),
        "grid_id": doc.get("grid_id", ""),
        "name": doc.get("name", ""),
        "level": doc.get("level") or "workface",
        "description": doc.get("description", ""),
        "bounds_json": doc.get("bounds_json", ""),
        "status": doc.get("status") or "normal",
        "area": doc.get("area") if doc.get("area") is not None else _calculate_area(doc.get("bounds_json")),
        "parent_id": parent_id or None,
        "parent_name": _lookup_unit_name(parent_id),
        "project_id": project_id,
        "project_name": _lookup_project_name(project_id),
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
        doc["area"] = doc.get("area") if doc.get("area") is not None else _validate_bounds(doc.get("bounds_json"))
        doc["parent_id"] = _text(doc.get("parent_id")) or _find_grid_parent_unit_id(doc.get("project_id"))
        doc["created_at"] = now
        doc["updated_at"] = now

        result = grid_collection.insert_one(doc)
        new_doc = grid_collection.find_one({"_id": result.inserted_id})
        _sync_grid_responsibility_unit(new_doc)
        logger.info(f"Created grid: {doc.get('name')}")
        return _to_out(new_doc)

    def update_grid(self, grid_id: str, data: GridUpdate, current_user: dict = None):
        if not ObjectId.is_valid(grid_id):
            return None
        existing = grid_collection.find_one({"_id": ObjectId(grid_id)})
        if not existing:
            return None
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
            update_data["area"] = _validate_bounds(update_data.get("bounds_json"))
        elif "bounds_json" not in update_data:
            update_data["area"] = update_data.get("area", existing.get("area") or _validate_bounds(existing.get("bounds_json")))

        if "project_id" in update_data and "parent_id" not in update_data:
            update_data["parent_id"] = _find_grid_parent_unit_id(update_data.get("project_id"))

        grid_collection.update_one(
            {"_id": ObjectId(grid_id)},
            {"$set": update_data}
        )

        doc = grid_collection.find_one({"_id": ObjectId(grid_id)})
        if doc:
            _sync_grid_responsibility_unit(doc)
            old_grid_id = _text(existing.get("grid_id"))
            new_grid_id = _text(doc.get("grid_id"))
            if old_grid_id and new_grid_id and old_grid_id != new_grid_id:
                unit_collection.delete_many({
                    "type": "grid",
                    "$or": [
                        {"grid_id": old_grid_id},
                        {"unit_id": _grid_unit_id(old_grid_id)},
                        {"unit_id": old_grid_id},
                    ],
                })
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
            deleted_grid_id = _text(existing.get("grid_id")) if existing else ""
            if deleted_grid_id:
                unit_collection.delete_many({
                    "type": "grid",
                    "$or": [
                        {"grid_id": deleted_grid_id},
                        {"unit_id": _grid_unit_id(deleted_grid_id)},
                        {"unit_id": deleted_grid_id},
                    ],
                })
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
