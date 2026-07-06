import json
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException

from app.core.data_scope import (
    branch_ids_for_user,
    grid_ids_for_user,
    in_scope,
    is_hq,
    project_ids_for_user,
    scope_filter,
    team_ids_for_user,
    text,
    user_level,
)
from app.core.database import get_mongo_collection
from app.schemas.responsibility_unit_schema import ResponsibilityUnitCreate, ResponsibilityUnitUpdate
from app.utils.logger import get_logger


logger = get_logger("ResponsibilityUnitService")

unit_collection = get_mongo_collection("responsibility_unit")
personnel_collection = get_mongo_collection("personnel")
project_collection = get_mongo_collection("project")
legacy_project_collection = get_mongo_collection("projects")
sql_project_collection = get_mongo_collection("sql_projects")
branch_collection = get_mongo_collection("branch")
legacy_branch_collection = get_mongo_collection("branches")
sql_branch_collection = get_mongo_collection("sql_branches")
grid_collection = get_mongo_collection("grid")
team_collection = get_mongo_collection("team")

TEAM_ID_FIELDS = ("team_id",)
GRID_ID_FIELDS = ("grid_id",)
PROJECT_ID_FIELDS = ("project_id",)

TYPE_ORDER = {
    "branch": 1,
    "project": 2,
    "safety_office": 3,
    "grid": 4,
    "team": 5,
    "personnel": 6,
}

LEGACY_TYPE_MAP = {
    "division": "project",
    "workshop": "safety_office",
    "site": "grid",
    "subproject": "team",
}

ALLOWED_PARENT_TYPES = {
    "branch": {""},
    "project": {"branch", ""},
    "safety_office": {"project"},
    "grid": {"project"},
    "team": {"grid"},
    "personnel": {"team"},
}

RESPONSIBILITY_LEVEL_NAMES = {
    "branch": "分公司",
    "project": "项目",
    "grid": "网格",
    "team": "工队",
}


def _text(value) -> str:
    if hasattr(value, "value"):
        value = value.value
    return str(value or "").strip()


def _normalize_type(value) -> str:
    raw = _text(value)
    return LEGACY_TYPE_MAP.get(raw, raw)


def _node_id(doc: dict) -> str:
    return _text(doc.get("unit_id")) or str(doc.get("_id"))


def _business_key(unit: dict) -> str:
    unit_type = _normalize_type(unit.get("type"))
    if unit_type == "grid":
        value = _text(unit.get("grid_id") or unit.get("unit_id"))
    elif unit_type == "team":
        value = _text(unit.get("team_id") or unit.get("unit_id"))
    elif unit_type == "project":
        value = _text(unit.get("project_id") or unit.get("unit_id"))
    else:
        value = _text(unit.get("unit_id") or unit.get("id"))
    return f"{unit_type}:{value}" if value else ""


def _parent_aliases(unit: dict) -> list[str]:
    aliases = [_text(unit.get("unit_id")), _text(unit.get("id"))]
    if unit.get("_id"):
        aliases.append(str(unit.get("_id")))
    unit_type = _normalize_type(unit.get("type"))
    if unit_type == "grid":
        aliases.append(_text(unit.get("grid_id")))
    elif unit_type == "team":
        aliases.append(_text(unit.get("team_id")))
    elif unit_type == "project":
        aliases.append(_text(unit.get("project_id")))
    return [alias for alias in dict.fromkeys(aliases) if alias]


def _unit_lookup_query(unit_id: str) -> dict:
    unit_id = _text(unit_id)
    if unit_id.startswith("synthetic-"):
        unit_id = unit_id.removeprefix("synthetic-")
    values = [unit_id]
    if unit_id.isdigit():
        values.append(int(unit_id))
    object_ids = []
    if ObjectId.is_valid(unit_id):
        object_ids.append(ObjectId(unit_id))
    clauses = [
        {"unit_id": {"$in": values}},
        {"id": {"$in": values}},
        {"grid_id": {"$in": values}},
        {"team_id": {"$in": values}},
        {"personnel_id": {"$in": values}},
        {"project_id": {"$in": values}},
        {"name": {"$in": [str(value) for value in values]}},
    ]
    if object_ids:
        clauses.append({"_id": {"$in": object_ids}})
    return {"$or": clauses}


def _legacy_lookup_query(unit_id: str, fields: tuple[str, ...]) -> dict:
    unit_id = _text(unit_id)
    if unit_id.startswith("synthetic-"):
        unit_id = unit_id.removeprefix("synthetic-")
    values = [unit_id]
    if unit_id.isdigit():
        values.append(int(unit_id))
    clauses = [{field: {"$in": values}} for field in fields]
    clauses.append({"name": {"$in": [str(value) for value in values]}})
    clauses.append({"project_name": {"$in": [str(value) for value in values]}})
    clauses.append({"team_name": {"$in": [str(value) for value in values]}})
    if ObjectId.is_valid(unit_id):
        clauses.append({"_id": ObjectId(unit_id)})
    return {"$or": clauses}


def _legacy_grid_to_unit(grid: dict) -> dict:
    grid_id = _text(grid.get("grid_id") or grid.get("_id"))
    latitude, longitude = _grid_center(grid)
    return _synthetic_unit(
        unit_id=grid_id,
        name=grid.get("name") or f"缃戞牸{grid_id}",
        unit_type="grid",
        parent_id=_text(grid.get("project_id")) or None,
        project_id=_text(grid.get("project_id")) or None,
        grid_id=grid_id,
        level=2,
        sort_order=grid.get("sort_order", 0),
        latitude=latitude,
        longitude=longitude,
        center=grid.get("center"),
        zoom_level=grid.get("zoom_level"),
    )


def _legacy_project_to_unit(project: dict) -> dict:
    project_id = _text(project.get("id") or project.get("project_id") or project.get("_id"))
    branch_id = _text(project.get("branch_id"))
    return _synthetic_unit(
        unit_id=project_id,
        name=project.get("name") or project.get("project_name") or f"椤圭洰{project_id}",
        unit_type="project",
        parent_id=f"BRANCH-{branch_id}" if branch_id else None,
        project_id=project_id,
        level=2,
        sort_order=project.get("sort_order", 0),
        latitude=project.get("latitude") or project.get("lat"),
        longitude=project.get("longitude") or project.get("lng"),
        center=project.get("center"),
        zoom_level=project.get("zoom_level"),
    )


def _legacy_team_to_unit(team: dict) -> dict:
    team_id = _text(team.get("team_id") or team.get("id") or team.get("_id"))
    project_id = _text(team.get("project_id"))
    grid_id = _text(team.get("grid_id"))
    return _synthetic_unit(
        unit_id=team_id,
        name=team.get("name") or team.get("team_name") or f"宸ラ槦{team_id}",
        unit_type="team",
        parent_id=grid_id or project_id or None,
        project_id=project_id or None,
        grid_id=grid_id or None,
        team_id=team_id,
        level=3,
        sort_order=team.get("sort_order", 0),
    )


def _legacy_unit_by_id(unit_id: str) -> dict | None:
    for collection in (project_collection, legacy_project_collection, sql_project_collection):
        project = collection.find_one(_legacy_lookup_query(unit_id, ("id", "project_id")))
        if project:
            return _legacy_project_to_unit(project)
    grid = grid_collection.find_one(_legacy_lookup_query(unit_id, ("grid_id", "id")))
    if grid:
        return _legacy_grid_to_unit(grid)
    team = team_collection.find_one(_legacy_lookup_query(unit_id, ("team_id", "id")))
    if team:
        return _legacy_team_to_unit(team)
    return None


def _person_name(person_id: Optional[str]) -> str:
    person_id = _text(person_id)
    if not person_id:
        return ""
    query = {"$or": [{"id": person_id}, {"personnel_id": person_id}, {"employeeId": person_id}, {"employee_id": person_id}]}
    if ObjectId.is_valid(person_id):
        query["$or"].append({"_id": ObjectId(person_id)})
    person = personnel_collection.find_one(query)
    if not person:
        return ""
    return _text(person.get("username") or person.get("name") or person.get("full_name"))


def _project_docs() -> list[dict]:
    seen = set()
    result = []
    for collection in (project_collection, legacy_project_collection, sql_project_collection):
        for doc in collection.find({}).sort("id", 1):
            project_id = _text(doc.get("id") or doc.get("_id"))
            if not project_id or project_id in seen:
                continue
            seen.add(project_id)
            result.append(doc)
    return result


def _branch_docs() -> list[dict]:
    seen = set()
    result = []
    for collection in (branch_collection, legacy_branch_collection, sql_branch_collection):
        for doc in collection.find({}).sort("id", 1):
            branch_id = _text(doc.get("id") or doc.get("_id"))
            if not branch_id or branch_id in seen:
                continue
            seen.add(branch_id)
            result.append(doc)
    return result


def _synthetic_unit(unit_id: str, name: str, unit_type: str, parent_id=None, project_id=None, grid_id=None, team_id=None, level=1, sort_order=0, latitude=None, longitude=None, center=None, zoom_level=None) -> dict:
    return {
        "id": f"synthetic-{unit_id}",
        "unit_id": unit_id,
        "name": name or unit_id,
        "type": unit_type,
        "parent_id": parent_id,
        "project_id": project_id,
        "grid_id": grid_id,
        "team_id": team_id,
        "personnel_id": None,
        "responsible_person_id": None,
        "safety_office_role": "",
        "level": level,
        "is_under_construction": unit_type in {"grid", "team"},
        "sort_order": sort_order,
        "latitude": latitude,
        "longitude": longitude,
        "center": center,
        "zoom_level": zoom_level,
        "created_at": "",
        "updated_at": "",
    }


def _grid_center(grid: dict) -> tuple[float | None, float | None]:
    lat = grid.get("latitude") or grid.get("lat")
    lng = grid.get("longitude") or grid.get("lng")
    try:
        if lat is not None and lng is not None:
            return float(lat), float(lng)
    except (TypeError, ValueError):
        pass

    raw = grid.get("bounds_json") or grid.get("bounds")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            raw = None
    if not isinstance(raw, list):
        return None, None

    points = []
    for point in raw:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            continue
        try:
            first, second = float(point[0]), float(point[1])
        except (TypeError, ValueError):
            continue
        if -90 <= first <= 90 and -180 <= second <= 180:
            points.append((first, second))
        elif -90 <= second <= 90 and -180 <= first <= 180:
            points.append((second, first))
    if not points:
        return None, None
    return (
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    )


def _organization_units() -> list[dict]:
    units = []
    for index, branch in enumerate(_branch_docs(), start=1):
        branch_id = _text(branch.get("id") or branch.get("_id"))
        units.append(_synthetic_unit(
            unit_id=f"BRANCH-{branch_id}",
            name=branch.get("name") or f"分公司{branch_id}",
            unit_type="branch",
            level=1,
            sort_order=index,
        ))

    for index, project in enumerate(_project_docs(), start=1):
        project_id = _text(project.get("id") or project.get("_id"))
        branch_id = _text(project.get("branch_id"))
        # 获取项目坐标
        lat = project.get("latitude") or project.get("lat")
        lng = project.get("longitude") or project.get("lng")
        center = project.get("center")
        zoom_level = project.get("zoom_level")
        units.append(_synthetic_unit(
            unit_id=project_id,
            name=project.get("name") or project.get("project_name") or f"项目{project_id}",
            unit_type="project",
            parent_id=f"BRANCH-{branch_id}" if branch_id else None,
            project_id=project_id,
            level=2,
            sort_order=index,
            latitude=lat,
            longitude=lng,
            center=center,
            zoom_level=zoom_level,
        ))

    for index, grid in enumerate(grid_collection.find({}).sort("created_at", 1), start=1):
        grid_id = _text(grid.get("grid_id") or grid.get("_id"))
        project_id = _text(grid.get("project_id"))
        if not grid_id:
            continue
        # Prefer explicit coordinates, then derive a stable center from bounds_json.
        lat, lng = _grid_center(grid)
        center = grid.get("center")
        zoom_level = grid.get("zoom_level")
        units.append(_synthetic_unit(
            unit_id=grid_id,
            name=grid.get("name") or f"网格{grid_id}",
            unit_type="grid",
            parent_id=project_id or None,
            project_id=project_id or None,
            grid_id=grid_id,
            level=2,
            sort_order=index,
            latitude=lat,
            longitude=lng,
            center=center,
            zoom_level=zoom_level,
        ))

    for index, team in enumerate(team_collection.find({}), start=1):
        team_id = _text(team.get("team_id") or team.get("id") or team.get("_id"))
        project_id = _text(team.get("project_id"))
        grid_id = _text(team.get("grid_id"))
        if not team_id:
            continue
        # 获取工队坐标
        lat = team.get("latitude") or team.get("lat")
        lng = team.get("longitude") or team.get("lng")
        center = team.get("center")
        zoom_level = team.get("zoom_level")
        units.append(_synthetic_unit(
            unit_id=team_id,
            name=team.get("name") or team.get("team_name") or f"工队{team_id}",
            unit_type="team",
            parent_id=grid_id or project_id or None,
            project_id=project_id or None,
            grid_id=grid_id or None,
            team_id=team_id,
            level=3,
            sort_order=index,
            latitude=lat,
            longitude=lng,
            center=center,
            zoom_level=zoom_level,
        ))
    return units


def _to_out(doc: dict) -> dict:
    unit_type = _normalize_type(doc.get("type"))
    unit_id = _node_id(doc)
    responsible_person_id = doc.get("responsible_person_id")
    return {
        "id": str(doc["_id"]),
        "unit_id": unit_id,
        "name": doc.get("name", ""),
        "type": unit_type,
        "parent_id": doc.get("parent_id"),
        "project_id": doc.get("project_id") or (unit_id if unit_type == "project" else None),
        "grid_id": doc.get("grid_id") or (unit_id if unit_type == "grid" else None),
        "team_id": doc.get("team_id") or (unit_id if unit_type == "team" else None),
        "personnel_id": doc.get("personnel_id"),
        "responsible_person_id": responsible_person_id,
        "responsible_person_name": _person_name(responsible_person_id),
        "safety_office_role": doc.get("safety_office_role", ""),
        "level": doc.get("level", 1),
        "is_under_construction": doc.get("is_under_construction", True),
        "sort_order": doc.get("sort_order", 0),
        "latitude": doc.get("latitude"),
        "longitude": doc.get("longitude"),
        "center": doc.get("center"),
        "zoom_level": doc.get("zoom_level"),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
    }


def _unit_matches_user(unit: dict, user: dict) -> bool:
    if not user or is_hq(user):
        return True
    return in_scope(
        unit,
        user,
        project_fields=("project_id", "unit_id"),
        grid_fields=("grid_id", "unit_id"),
        team_fields=("team_id", "unit_id"),
        branch_fields=(),
        company_fields=(),
        project_name_fields=("name",),
        team_name_fields=("name",),
    )


def _filter_tree_for_user(nodes: list[dict], user: dict | None) -> list[dict]:
    if not user or is_hq(user):
        return nodes

    level = user_level(user)
    level_anchor_type = {
        "branch_admin": "branch",
        "project_safety_admin": "project",
        "grid_admin": "grid",
        "team_admin": "team",
    }.get(level)
    all_anchors = {
        "branch": {text(value) for value in branch_ids_for_user(user) if text(value)},
        "project": {text(value) for value in project_ids_for_user(user) if text(value)},
        "grid": {text(value) for value in grid_ids_for_user(user) if text(value)},
        "team": {text(value) for value in team_ids_for_user(user) if text(value)},
    }
    all_names = {
        "branch": {text(user.get("company") or user.get("department"))},
        "project": {text(user.get("project"))},
        "grid": {text(user.get("grid"))},
        "team": {text(user.get("team") or user.get("work_team"))},
    }
    all_names = {key: {value for value in value_set if value} for key, value_set in all_names.items()}
    anchors = {key: (value if key == level_anchor_type else set()) for key, value in all_anchors.items()}
    names = {key: (value if key == level_anchor_type else set()) for key, value in all_names.items()}

    def node_keys(node: dict) -> set[str]:
        keys = {
            text(node.get("unit_id")),
            text(node.get("id")),
            text(node.get("project_id")),
            text(node.get("grid_id")),
            text(node.get("team_id")),
        }
        return {key for key in keys if key}

    def is_anchor(node: dict) -> bool:
        unit_type = _normalize_type(node.get("type"))
        if unit_type not in anchors:
            return False
        if node_keys(node) & anchors[unit_type]:
            return True
        return text(node.get("name")) in names.get(unit_type, set())

    has_anchor = any(anchors.values()) or any(names.values())

    def flatten(items):
        result = []
        for item in items:
            if isinstance(item, list):
                result.extend(flatten(item))
            elif item:
                result.append(item)
        return result

    def visit(node: dict):
        if has_anchor and is_anchor(node):
            return {**node, "children": node.get("children", [])}
        children = flatten(visit(child) for child in node.get("children", []))
        if not has_anchor and _unit_matches_user(node, user):
            return {**node, "children": node.get("children", [])}
        if children:
            return {**node, "children": children}
        return None

    result = []
    for root in nodes:
        filtered = visit(root)
        if isinstance(filtered, list):
            result.extend(filtered)
        elif filtered:
            result.append(filtered)
    return result


def _responsibility_person_units(unit_type: str = None, parent_id: str = None) -> list[dict]:
    docs = personnel_collection.find({
        "$or": [
            {"isResponsibilityPerson": True},
            {"is_responsibility_person": True},
        ]
    })
    result = []
    for doc in docs:
        level = _text(doc.get("responsibilityLevel") or doc.get("responsibility_level"))
        personnel_id = str(doc.get("_id"))
        project_id = _text(doc.get("projectId") or doc.get("project_id"))
        grid_id = _text(doc.get("gridId") or doc.get("grid_id"))
        team_id = _text(doc.get("teamId") or doc.get("team_id"))

        parent = None
        if level == "team":
            parent = team_id
        elif level == "grid":
            parent = grid_id
        elif level == "project":
            parent = project_id
        elif level == "branch":
            branch_id = _text(doc.get("branchId") or doc.get("branch_id"))
            parent = f"BRANCH-{branch_id}" if branch_id else ""

        level_name = RESPONSIBILITY_LEVEL_NAMES.get(level, "责任")
        item = {
            "id": f"personnel-resp-{personnel_id}",
            "unit_id": f"RESP-PERSON-{personnel_id}",
            "name": f"{doc.get('username') or doc.get('name') or '责任人员'}（{level_name}责任人员）",
            "type": "personnel",
            "parent_id": parent or None,
            "project_id": project_id or None,
            "grid_id": grid_id or None,
            "team_id": team_id or None,
            "personnel_id": personnel_id,
            "responsible_person_id": personnel_id,
            "safety_office_role": "",
            "level": 5,
            "is_under_construction": True,
            "sort_order": 9999,
            "created_at": str(doc.get("created_at") or doc.get("addedDate") or ""),
            "updated_at": str(doc.get("updated_at") or ""),
        }
        if unit_type and item["type"] != unit_type:
            continue
        if parent_id is not None and item["parent_id"] != (parent_id or None):
            continue
        result.append(item)
    return result


class ResponsibilityUnitService:
    def list_units(self, unit_type: str = None, parent_id: str = None, current_user: dict = None):
        filter_query = {}
        if unit_type:
            filter_query["type"] = unit_type
        else:
            filter_query["type"] = {"$nin": [*LEGACY_TYPE_MAP.keys(), "safety_office"]}
        if parent_id is not None:
            filter_query["parent_id"] = parent_id if parent_id else None
        if current_user and not is_hq(current_user):
            filter_query = {"$and": [filter_query, scope_filter(
                current_user,
                project_fields=("project_id", "unit_id"),
                grid_fields=("grid_id", "unit_id"),
                team_fields=("team_id", "unit_id"),
                branch_fields=(),
                company_fields=(),
                project_name_fields=("name",),
                team_name_fields=("name",),
            )]}

        docs = list(unit_collection.find(filter_query).sort("sort_order", 1))
        result = [_to_out(doc) for doc in docs] + _responsibility_person_units(unit_type, parent_id)
        if current_user and not is_hq(current_user):
            return [unit for unit in result if _unit_matches_user(unit, current_user)]
        return result

    def get_unit_by_id(self, unit_id: str):
        doc = unit_collection.find_one(_unit_lookup_query(unit_id))
        if doc:
            return _to_out(doc)
        legacy_unit = _legacy_unit_by_id(unit_id)
        if legacy_unit:
            return legacy_unit
        return None

    def _get_parent(self, parent_id: Optional[str]):
        if not parent_id:
            return None
        parent = unit_collection.find_one(_unit_lookup_query(parent_id))
        if parent:
            return parent
        return _legacy_unit_by_id(parent_id)

    def _validate_unit(self, doc: dict, parent: dict | None = None):
        unit_type = _normalize_type(doc.get("type"))
        parent_type = _normalize_type(parent.get("type")) if parent else ""
        doc["type"] = unit_type

        if unit_type not in TYPE_ORDER:
            raise HTTPException(status_code=400, detail="责任节点类型不正确")

        if unit_type != "project" and not parent:
            raise HTTPException(status_code=400, detail="项目以下节点必须选择上级节点")

        if unit_type == "safety_office":
            raise HTTPException(status_code=400, detail="安监办属于项目级岗位/权限名称，不作为责任组织树节点")

        if parent_type not in ALLOWED_PARENT_TYPES[unit_type]:
            raise HTTPException(status_code=400, detail="组织层级必须按 项目-网格-班组-人员 向下建立")

        if unit_type == "project" and parent:
            raise HTTPException(status_code=400, detail="项目节点不能有上级节点")

        if unit_type in {"safety_office", "grid", "team", "personnel"} and not _text(doc.get("project_id")):
            doc["project_id"] = parent.get("project_id") or parent.get("unit_id")

        if unit_type == "grid" and not _text(doc.get("grid_id")):
            doc["grid_id"] = doc.get("unit_id")

        if unit_type == "team" and not _text(doc.get("team_id")):
            doc["team_id"] = doc.get("unit_id")

        if unit_type == "personnel" and not _text(doc.get("personnel_id")):
            raise HTTPException(status_code=400, detail="人员节点必须绑定人员ID")

    def create_unit(self, data: ResponsibilityUnitCreate):
        doc = data.model_dump()
        parent = self._get_parent(doc.get("parent_id"))
        self._validate_unit(doc, parent)

        now = datetime.now().isoformat()
        doc["created_at"] = now
        doc["updated_at"] = now
        doc["level"] = parent.get("level", 1) + 1 if parent else 1
        doc["parent_id"] = _node_id(parent) if parent else None

        max_sort = unit_collection.find_one({"parent_id": doc["parent_id"]}, sort=[("sort_order", -1)])
        doc["sort_order"] = (max_sort.get("sort_order", 0) + 1) if max_sort else 1

        result = unit_collection.insert_one(doc)
        new_doc = unit_collection.find_one({"_id": result.inserted_id})
        logger.info(f"Created responsibility unit: {doc.get('name')}")
        return _to_out(new_doc)

    def update_unit(self, unit_id: str, data: ResponsibilityUnitUpdate):
        doc = unit_collection.find_one(_unit_lookup_query(unit_id))
        if not doc:
            return None

        update_data = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if not update_data:
            return _to_out(doc)

        merged = {**doc, **update_data}
        parent = self._get_parent(merged.get("parent_id"))
        self._validate_unit(merged, parent)

        if "parent_id" in update_data:
            update_data["parent_id"] = parent.get("unit_id") if parent else None
            update_data["level"] = parent.get("level", 1) + 1 if parent else 1
            self._update_children_level(doc.get("unit_id"), update_data["level"])

        update_data["updated_at"] = datetime.now().isoformat()
        unit_collection.update_one({"_id": doc["_id"]}, {"$set": update_data})
        updated_doc = unit_collection.find_one({"_id": doc["_id"]})
        return _to_out(updated_doc)

    def _update_children_level(self, parent_unit_id: str, parent_level: int):
        children = unit_collection.find({"parent_id": parent_unit_id})
        for child in children:
            new_level = parent_level + 1
            unit_collection.update_one({"_id": child["_id"]}, {"$set": {"level": new_level}})
            self._update_children_level(child.get("unit_id"), new_level)

    def delete_unit(self, unit_id: str):
        doc = unit_collection.find_one(_unit_lookup_query(unit_id))
        if not doc:
            legacy_unit = _legacy_unit_by_id(unit_id)
            if not legacy_unit:
                return False

            if legacy_unit.get("type") == "project":
                child_aliases = _parent_aliases(legacy_unit)
                children_count = (
                    unit_collection.count_documents({"parent_id": {"$in": child_aliases}})
                    + grid_collection.count_documents({"project_id": {"$in": child_aliases}})
                    + team_collection.count_documents({"project_id": {"$in": child_aliases}})
                )
                if children_count > 0:
                    logger.warning(f"Cannot delete legacy project unit {unit_id}: has {children_count} children")
                    return False
                result = None
                for collection in (project_collection, legacy_project_collection, sql_project_collection):
                    result = collection.delete_one(_legacy_lookup_query(unit_id, ("id", "project_id")))
                    if result.deleted_count:
                        break
            elif legacy_unit.get("type") == "grid":
                child_aliases = _parent_aliases(legacy_unit)
                children_count = (
                    unit_collection.count_documents({"parent_id": {"$in": child_aliases}})
                    + team_collection.count_documents({"grid_id": {"$in": child_aliases}})
                )
                if children_count > 0:
                    logger.warning(f"Cannot delete legacy grid unit {unit_id}: has {children_count} children")
                    return False
                result = grid_collection.delete_one(_legacy_lookup_query(unit_id, ("grid_id", "id")))
            elif legacy_unit.get("type") == "team":
                child_aliases = _parent_aliases(legacy_unit)
                children_count = unit_collection.count_documents({"parent_id": {"$in": child_aliases}})
                if children_count > 0:
                    logger.warning(f"Cannot delete legacy team unit {unit_id}: has {children_count} children")
                    return False
                result = team_collection.delete_one(_legacy_lookup_query(unit_id, ("team_id", "id")))
            else:
                return False

            if result and result.deleted_count:
                logger.info(f"Deleted legacy responsibility unit: {unit_id}")
                return True
            return False

        parent_aliases = _parent_aliases(doc)
        children_count = unit_collection.count_documents({"parent_id": {"$in": parent_aliases}})
        if children_count > 0:
            logger.warning(f"Cannot delete unit {unit_id}: has {children_count} children")
            return False

        result = unit_collection.delete_one({"_id": doc["_id"]})
        if result.deleted_count:
            logger.info(f"Deleted responsibility unit: {unit_id}")
            return True
        return False

    def move_up(self, unit_id: str):
        return self._move(unit_id, direction="up")

    def move_down(self, unit_id: str):
        return self._move(unit_id, direction="down")

    def _move(self, unit_id: str, direction: str):
        doc = unit_collection.find_one(_unit_lookup_query(unit_id))
        if not doc:
            return None

        current_sort = doc.get("sort_order", 0)
        op = "$lt" if direction == "up" else "$gt"
        order = -1 if direction == "up" else 1
        sibling = unit_collection.find_one(
            {"parent_id": doc.get("parent_id"), "sort_order": {op: current_sort}},
            sort=[("sort_order", order)],
        )
        if not sibling:
            return _to_out(doc)

        now = datetime.now().isoformat()
        unit_collection.update_one({"_id": doc["_id"]}, {"$set": {"sort_order": sibling["sort_order"], "updated_at": now}})
        unit_collection.update_one({"_id": sibling["_id"]}, {"$set": {"sort_order": current_sort, "updated_at": now}})
        return self.get_unit_by_id(unit_id)

    def change_parent(self, unit_id: str, new_parent_id: str):
        doc = unit_collection.find_one(_unit_lookup_query(unit_id))
        if not doc:
            return None

        parent = self._get_parent(new_parent_id)
        canonical_parent_id = _node_id(parent) if parent else None
        merged = {**doc, "parent_id": canonical_parent_id}
        self._validate_unit(merged, parent)
        new_level = parent.get("level", 1) + 1 if parent else 1
        max_sort = unit_collection.find_one({"parent_id": canonical_parent_id}, sort=[("sort_order", -1)])

        unit_collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {
                "parent_id": canonical_parent_id,
                "level": new_level,
                "sort_order": (max_sort.get("sort_order", 0) + 1) if max_sort else 1,
                "updated_at": datetime.now().isoformat(),
            }},
        )
        self._update_children_level(_node_id(doc), new_level)
        return self.get_unit_by_id(unit_id)

    def get_tree(self, current_user: dict = None):
        all_units = _organization_units()
        for unit in self.list_units(current_user=current_user):
            existing_keys = {_business_key(u): index for index, u in enumerate(all_units)}
            key = _business_key(unit)
            if key and key in existing_keys:
                # 保留坐标信息，避免被覆盖
                existing_unit = all_units[existing_keys[key]]
                unit["latitude"] = unit.get("latitude") or existing_unit.get("latitude")
                unit["longitude"] = unit.get("longitude") or existing_unit.get("longitude")
                unit["center"] = unit.get("center") or existing_unit.get("center")
                unit["zoom_level"] = unit.get("zoom_level") or existing_unit.get("zoom_level")
                all_units[existing_keys[key]] = unit
            elif unit["unit_id"] not in {u["unit_id"] for u in all_units}:
                all_units.append(unit)
        alias_map = {}
        for unit in all_units:
            for alias in _parent_aliases(unit):
                alias_map[alias] = unit["unit_id"]

        safety_parent_map = {}
        visible_units = []
        for unit in all_units:
            unit_type = _normalize_type(unit.get("type"))
            if unit_type == "safety_office":
                parent_id = alias_map.get(_text(unit.get("parent_id")), unit.get("parent_id"))
                for alias in _parent_aliases(unit):
                    safety_parent_map[alias] = parent_id
                continue
            visible_units.append(unit)

        unit_map = {u["unit_id"]: {**u, "children": []} for u in visible_units}
        root_nodes = []

        for unit in visible_units:
            parent_id = alias_map.get(_text(unit.get("parent_id")), unit.get("parent_id"))
            parent_id = safety_parent_map.get(parent_id, parent_id)
            if parent_id and parent_id in unit_map:
                unit_map[parent_id]["children"].append(unit_map[unit["unit_id"]])
            else:
                root_nodes.append(unit_map[unit["unit_id"]])

        return _filter_tree_for_user(root_nodes, current_user)


responsibility_unit_service = ResponsibilityUnitService()
