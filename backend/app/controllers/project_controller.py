from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
import json

from app.core.data_scope import is_hq, project_ids_for_user, text, value_variants
from app.core.database import get_mongo_collection, get_compatible_mongo_db
from app.core.security import get_current_user
from app.services.audit_log_service import write_audit_log
from app.schemas.project_schema import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListItem,
    UserBasic,
    DeviceBasic,
    RegionBasic,
)

router = APIRouter(prefix="/projects", tags=["Projects"])

projects_collection = get_mongo_collection("project")
legacy_projects_collection = get_mongo_collection("projects")
sql_projects_collection = get_mongo_collection("sql_projects")
users_collection = get_mongo_collection("users")
personnel_collection = get_mongo_collection("personnel")
devices_collection = get_mongo_collection("device")
regions_collection = get_mongo_collection("project_region")
fences_collection = get_mongo_collection("fence")
teams_collection = get_mongo_collection("team")
grids_collection = get_mongo_collection("grid")
alarms_collection = get_mongo_collection("alarm_record")
branches_collection = get_mongo_collection("branch")
legacy_branches_collection = get_mongo_collection("branches")
sql_branches_collection = get_mongo_collection("sql_branches")


def _project_collections():
    return (projects_collection, legacy_projects_collection, sql_projects_collection)


def _branch_collections():
    return (branches_collection, legacy_branches_collection, sql_branches_collection)


def _safe_int(value, default=0):
    try:
        return default if value in (None, "") else int(value)
    except (TypeError, ValueError):
        return default


def _cjk_score(value: str) -> int:
    return sum(1 for ch in value if "\u4e00" <= ch <= "\u9fff") - value.count("�") * 5


def _clean_text(value):
    if value in (None, ""):
        return value
    text = str(value)
    candidates = [text]
    for encoding in ("gbk", "cp936"):
        try:
            candidates.append(text.encode(encoding).decode("utf-8"))
        except UnicodeError:
            pass
    return max(candidates, key=_cjk_score)


def _project_matches_search(project: dict, search: str) -> bool:
    needle = search.lower()
    fields = (
        project.get("name"),
        project.get("description"),
        project.get("manager"),
        project.get("manager_name"),
        project.get("code"),
        project.get("location"),
    )
    return any(needle in str(value or "").lower() or needle in str(_clean_text(value) or "").lower() for value in fields)


def _branch_doc(branch_id: int | str | None):
    if branch_id in (None, ""):
        return None
    variants = value_variants(branch_id)
    if not variants:
        return None
    for collection in _branch_collections():
        branch = collection.find_one({"$or": [{"id": {"$in": variants}}, {"branch_id": {"$in": variants}}]}, {"_id": 0})
        if branch:
            return branch
    return None


def _branch_names(branch_id: int | str | None) -> set[str]:
    branch = _branch_doc(branch_id)
    names = set()
    if branch:
        for field in ("name", "company", "department", "branch_name"):
            value = text(_clean_text(branch.get(field)))
            if value:
                names.add(value)
    return names


def _project_branch_id(project: dict):
    for field in ("branch_id", "branchId", "department_id"):
        value = project.get(field)
        if value not in (None, ""):
            return value
    return None


def _project_branch_names(project: dict) -> set[str]:
    names = set()
    for field in ("branch_name", "company", "department", "dept"):
        value = text(_clean_text(project.get(field)))
        if value:
            names.add(value)
    branch_id = _project_branch_id(project)
    names.update(_branch_names(branch_id))
    return names


def _project_matches_branch(project: dict, branch_id: int | None) -> bool:
    if not branch_id:
        return True
    selected_ids = {text(value) for value in value_variants(branch_id)}
    project_branch = _project_branch_id(project)
    if project_branch not in (None, ""):
        project_ids = {text(value) for value in value_variants(project_branch)}
        if selected_ids & project_ids:
            return True

    selected_names = _branch_names(branch_id)
    return bool(selected_names and selected_names & _project_branch_names(project))


def _id_query(value):
    return {"$or": [{"id": int(value)}, {"id": str(value)}]}


def _project_doc(project_id: int):
    project = _find_project_in_collections(project_id)
    return project or _virtual_project_doc(project_id)


def _find_project_in_collections(project_id: int):
    entry = _find_project_entry(project_id)
    return entry[1] if entry else None


def _find_project_entry(project_id: int):
    for collection in _project_collections():
        project = collection.find_one(_id_query(project_id), {"_id": 0})
        if project:
            return collection, project
    return None


def _project_source_docs(query=None):
    query = query or {}
    docs_by_id = {}
    for collection in _project_collections():
        for doc in collection.find(query, {"_id": 0}).sort("id", 1):
            project_id = _safe_int(doc.get("id"))
            if project_id and project_id not in docs_by_id:
                docs_by_id[project_id] = doc
    return [docs_by_id[key] for key in sorted(docs_by_id)]


def _max_project_id() -> int:
    max_id = 0
    for collection in _project_collections():
        for item in collection.find({}, {"_id": 0, "id": 1}):
            max_id = max(max_id, _safe_int(item.get("id")))
    return max_id


def _next_project_id() -> int:
    next_id = _max_project_id() + 1
    counters = get_compatible_mongo_db("counters")["counters"]
    counters.update_one(
        {"_id": "project_id"},
        {"$max": {"seq": next_id}},
        upsert=True,
    )
    return next_id


def _virtual_project_docs():
    if _project_source_docs():
        return []

    projects_by_name = {}

    def add_project(name, project_id=None, branch_id=None):
        name = str(name or "").strip()
        if not name or name == "string":
            return
        current = projects_by_name.setdefault(name, {"name": name})
        if project_id not in (None, "") and not current.get("id"):
            current["id"] = _safe_int(project_id)
        if branch_id not in (None, "") and not current.get("branch_id"):
            current["branch_id"] = _safe_int(branch_id)

    for collection in (devices_collection, fences_collection, teams_collection, personnel_collection):
        try:
            for item in collection.find({"project": {"$nin": [None, "", "string"]}}, {"_id": 0, "project": 1}):
                add_project(item.get("project"))
        except Exception:
            continue

    try:
        for alarm in alarms_collection.find({}, {"_id": 0, "project": 1, "project_id": 1, "branch_id": 1, "location_desc": 1}):
            if alarm.get("project"):
                add_project(alarm.get("project"), alarm.get("project_id"), alarm.get("branch_id"))
                continue
            location_desc = str(alarm.get("location_desc") or "").strip()
            if "-" in location_desc:
                add_project(location_desc.split("-", 1)[0], alarm.get("project_id"), alarm.get("branch_id"))
            elif "项目" in location_desc:
                add_project(location_desc.split("项目", 1)[0] + "项目", alarm.get("project_id"), alarm.get("branch_id"))
    except Exception:
        pass

    docs = []
    for idx, project in enumerate(sorted(projects_by_name.values(), key=lambda p: (p.get("id") or 999999, p["name"])), start=1):
        project_id = project.get("id") or idx
        docs.append({
            "id": project_id,
            "name": project["name"],
            "description": "",
            "manager": "",
            "status": "active",
            "remark": "由设备、人员、围栏、告警等业务数据自动汇总",
            "branch_id": project.get("branch_id"),
            "user_ids": [],
            "region_ids": [],
        })
    return docs


def _virtual_project_doc(project_id: int):
    for project in _virtual_project_docs():
        if _safe_int(project.get("id")) == project_id:
            return project
    return None


def _project_match_values(project: dict) -> list:
    project_id = project.get("id")
    values = [value for value in [project_id, str(project_id) if project_id is not None else None] if value not in (None, "")]
    if project_id:
        try:
            values.append(int(project_id))
        except (TypeError, ValueError):
            pass
    return list(dict.fromkeys(values))


def _project_resource_query(project: dict) -> dict:
    project_name = _clean_text(project.get("name")) or ""
    candidates = _project_match_values(project)
    query = {"$or": [
        {"project_id": {"$in": candidates}},
        {"projectId": {"$in": candidates}},
        {"project": project_name},
        {"project_name": project_name},
    ]}
    return query


def _project_grid_ids(project: dict) -> list[str]:
    ids = [str(x) for x in project.get("grid_ids", []) if str(x)]
    for grid in grids_collection.find(_project_resource_query(project), {"_id": 0, "grid_id": 1, "id": 1}):
        for value in (grid.get("grid_id"), grid.get("id")):
            if value not in (None, ""):
                ids.append(str(value))
    return list(dict.fromkeys(ids))


def _project_team_ids(project: dict, grid_ids: list[str] | None = None) -> list[str]:
    ids = [str(x) for x in project.get("team_ids", []) if str(x)]
    query = _project_resource_query(project)
    if grid_ids:
        query["$or"].append({"grid_id": {"$in": grid_ids}})
    for team in teams_collection.find(query, {"_id": 0, "team_id": 1, "id": 1}):
        for value in (team.get("team_id"), team.get("id")):
            if value not in (None, ""):
                ids.append(str(value))
    return list(dict.fromkeys(ids))


def _project_devices(project: dict):
    devices = []
    for dev in devices_collection.find(_project_resource_query(project), {"_id": 0}):
        devices.append(DeviceBasic(
            id=str(dev.get("device_id") or dev.get("id") or ""),
            device_name=dev.get("name") or dev.get("device_name") or "",
            device_type=dev.get("type") or dev.get("device_type") or "",
            is_online=dev.get("status") == "online" or bool(dev.get("is_online")),
        ))
    return devices


def _project_users(user_ids: list[int], project_name: str | None = None):
    users = []
    if user_ids:
        query = {"$or": [{"id": {"$in": user_ids}}, {"id": {"$in": [str(x) for x in user_ids]}}]}
        source = users_collection.find(query, {"_id": 0})
    elif project_name:
        source = personnel_collection.find({"project": project_name}, {"_id": 0})
    else:
        return users

    for idx, user in enumerate(source, start=1):
        users.append(UserBasic(
            id=_safe_int(user.get("id"), idx),
            username=user.get("username") or user.get("name") or "",
            full_name=user.get("full_name") or user.get("name"),
        ))
    return users


def _project_regions(region_ids: list[int]):
    regions = []
    if not region_ids:
        return regions
    query = {"$or": [{"id": {"$in": region_ids}}, {"id": {"$in": [str(x) for x in region_ids]}}]}
    for region in regions_collection.find(query, {"_id": 0}):
        regions.append(RegionBasic(
            id=int(region.get("id")),
            name=region.get("name") or "",
            coordinates_json=region.get("coordinates_json") or region.get("coordinates") or "[]",
            remark=region.get("remark"),
        ))
    return regions


def _project_coordinates(project: dict) -> tuple[float | None, float | None]:
    latitude = project.get("latitude") or project.get("lat")
    longitude = project.get("longitude") or project.get("lng")
    if latitude is not None and longitude is not None:
        try:
            return float(latitude), float(longitude)
        except (TypeError, ValueError):
            pass

    center = project.get("center")
    if isinstance(center, str):
        try:
            center = json.loads(center)
        except (TypeError, ValueError):
            center = None
    if isinstance(center, (list, tuple)) and len(center) >= 2:
        try:
            return float(center[1]), float(center[0])
        except (TypeError, ValueError):
            pass
    return None, None


def _to_response(project: dict) -> ProjectResponse:
    user_ids = [int(x) for x in project.get("user_ids", []) if str(x).isdigit()]
    region_ids = [int(x) for x in project.get("region_ids", []) if str(x).isdigit()]
    project_name = _clean_text(project.get("name")) or ""
    latitude, longitude = _project_coordinates(project)
    grid_ids = _project_grid_ids(project)
    team_ids = _project_team_ids(project, grid_ids)
    return ProjectResponse(
        id=_safe_int(project.get("id")),
        name=project_name,
        description=_clean_text(project.get("description")),
        manager=_clean_text(project.get("manager") or project.get("manager_name")),
        status=project.get("status"),
        remark=_clean_text(project.get("remark")),
        latitude=latitude,
        longitude=longitude,
        branch_id=_safe_int(_project_branch_id(project)) or None,
        grid_ids=grid_ids,
        team_ids=team_ids,
        users=_project_users(user_ids, project_name),
        devices=_project_devices(project),
        regions=_project_regions(region_ids),
    )


def _project_count_by_name(collection, project_name: str):
    return collection.count_documents({"project": project_name})


def _project_fence_count(project: dict):
    project_id = project.get("id")
    return fences_collection.count_documents({
        "$or": [
            {"project_id": project_id},
            {"project_id": str(project_id)},
            {"project_id": int(project_id) if project_id else None},
            {"project": project.get("name")},
        ]
    })


def _project_alarm_count(project: dict):
    project_id = project.get("id")
    project_name = project.get("name") or ""

    return alarms_collection.count_documents({
        "$or": [
            {"project_id": project_id},
            {"project_id": str(project_id)},
            {"project_id": int(project_id) if project_id else None},
            {"project": project_name},
        ]
    })


def _project_grid_count(project: dict):
    project_id = project.get("id")
    project_name = project.get("name") or ""
    grid_ids = [grid_id for grid_id in project.get("grid_ids", []) if str(grid_id)]

    candidates = [value for value in [project_id, str(project_id) if project_id is not None else None] if value not in (None, "")]
    if project_id:
        try:
            candidates.append(int(project_id))
        except (TypeError, ValueError):
            pass

    query = {"$or": [
        {"project_id": {"$in": candidates}},
        {"project": project_name},
        {"project_name": project_name},
    ]}
    if grid_ids:
        query["$or"].extend([
            {"grid_id": {"$in": grid_ids}},
            {"id": {"$in": grid_ids}},
        ])

    return max(len(grid_ids), grids_collection.count_documents(query))


def _project_team_count(project: dict):
    project_id = project.get("id")
    project_name = project.get("name") or ""
    team_ids = [team_id for team_id in project.get("team_ids", []) if str(team_id)]
    project_candidates = [value for value in [project_id, str(project_id) if project_id is not None else None] if value not in (None, "")]
    if project_id:
        try:
            project_candidates.append(int(project_id))
        except (TypeError, ValueError):
            pass

    grid_cursor = grids_collection.find({
        "$or": [
            {"project_id": {"$in": project_candidates}},
            {"project": project_name},
            {"project_name": project_name},
        ]
    }, {"grid_id": 1, "id": 1})
    grid_ids = set()
    for grid in grid_cursor:
        for value in (grid.get("grid_id"), grid.get("id")):
            if value not in (None, ""):
                grid_ids.add(str(value))

    query = {"$or": [
        {"project_id": {"$in": project_candidates}},
        {"project": project_name},
        {"project_name": project_name},
    ]}
    if team_ids:
        query["$or"].extend([
            {"team_id": {"$in": team_ids}},
            {"id": {"$in": team_ids}},
        ])
    if grid_ids:
        query["$or"].append({"grid_id": {"$in": list(grid_ids)}})

    return max(len(team_ids), teams_collection.count_documents(query))


def _project_visible(project: dict, current_user: dict) -> bool:
    if is_hq(current_user):
        return True

    level = current_user.get("permission_level")
    if level == "branch_admin":
        branch_ids = [text(current_user.get("department_id")), text(current_user.get("branch_id"))]
        branch_ids = [item for item in branch_ids if item]
        return not branch_ids or any(_project_matches_branch(project, _safe_int(branch_id)) for branch_id in branch_ids)

    visible_project_ids = project_ids_for_user(current_user)
    if visible_project_ids:
        return text(project.get("id")) in visible_project_ids

    project_name = text(current_user.get("project"))
    return bool(project_name and text(project.get("name")) == project_name)


@router.get("/", response_model=List[ProjectListItem])
def get_projects(
    search: Optional[str] = None,
    branch_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    result = []
    source_projects = _project_source_docs()
    if branch_id:
        source_projects = [p for p in source_projects if _project_matches_branch(p, branch_id)]
    if search:
        source_projects = [p for p in source_projects if _project_matches_search(p, search)]

    if not source_projects and search:
        personnel_with_name = personnel_collection.find(
            {"name": {"$regex": search, "$options": "i"}},
            {"project_id": 1, "_id": 0}
        )

        project_ids_from_personnel = set()
        for p in personnel_with_name:
            pid = p.get("project_id")
            if pid:
                project_ids_from_personnel.add(str(pid))

        if project_ids_from_personnel:
            query_by_personnel = {"$or": [
                {"id": {"$in": [int(pid) for pid in project_ids_from_personnel]}},
                {"id": {"$in": list(project_ids_from_personnel)}},
            ]}
            source_projects = _project_source_docs(query_by_personnel)
            if branch_id:
                source_projects = [p for p in source_projects if _project_matches_branch(p, branch_id)]

    if not source_projects:
        source_projects = _virtual_project_docs()
        if search:
            source_projects = [p for p in source_projects if _project_matches_search(p, search)]
        if branch_id:
            source_projects = [p for p in source_projects if _project_matches_branch(p, branch_id)]

    source_projects = [project for project in source_projects if _project_visible(project, current_user)]

    for project in source_projects:
        user_ids = project.get("user_ids", [])
        region_ids = project.get("region_ids", [])
        project_name = _clean_text(project.get("name")) or ""
        fence_count = _project_fence_count(project)
        alarm_count = _project_alarm_count(project)
        grid_count = _project_grid_count(project)
        team_count = _project_team_count(project)
        device_count = _project_count_by_name(devices_collection, project_name)
        user_count = len(user_ids) if user_ids else _project_count_by_name(personnel_collection, project_name)
        latitude, longitude = _project_coordinates(project)
        result.append(ProjectListItem(
            id=_safe_int(project.get("id")),
            name=project_name,
            description=_clean_text(project.get("description")),
            manager=_clean_text(project.get("manager") or project.get("manager_name")),
            status=project.get("status"),
            remark=_clean_text(project.get("remark")),
            latitude=latitude,
            longitude=longitude,
            branch_id=_safe_int(_project_branch_id(project)) or None,
            branch_name=next(iter(_project_branch_names(project)), None),
            user_count=_safe_int(project.get("user_count"), user_count),
            device_count=_safe_int(project.get("device_count"), device_count),
            region_count=len(region_ids),
            grid_count=_safe_int(project.get("grid_count"), grid_count),
            team_count=_safe_int(project.get("team_count"), team_count),
            fence_count=_safe_int(project.get("fence_count"), fence_count),
            alarm_count=_safe_int(project.get("alarm_count"), alarm_count),
        ))
    return result


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, current_user: dict = Depends(get_current_user)):
    project = _project_doc(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if not _project_visible(project, current_user):
        raise HTTPException(status_code=404, detail="项目不存在")
    return _to_response(project)


@router.post("/", response_model=ProjectResponse)
def create_project(project_data: ProjectCreate, current_user: dict = Depends(get_current_user)):
    next_id = _next_project_id()
    doc = project_data.model_dump()
    doc["id"] = next_id
    projects_collection.insert_one(doc)
    write_audit_log(
        current_user=current_user,
        action="添加项目",
        target_type="project",
        target_name=doc.get("name") or str(next_id),
        after=doc,
        project=doc.get("name"),
    )
    return _to_response(doc)


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: int, project_data: ProjectUpdate, current_user: dict = Depends(get_current_user)):
    entry = _find_project_entry(project_id)
    project = entry[1] if entry else _virtual_project_doc(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if not _project_visible(project, current_user):
        raise HTTPException(status_code=404, detail="项目不存在")
    updates = {k: v for k, v in project_data.model_dump().items() if v is not None}
    if updates:
        if not entry:
            raise HTTPException(status_code=404, detail="项目不存在")
        entry[0].update_one(_id_query(project_id), {"$set": updates})
    updated = _project_doc(project_id)
    write_audit_log(
        current_user=current_user,
        action="变更项目信息",
        target_type="project",
        target_name=(updated or project).get("name") or str(project_id),
        before=project,
        after=updated,
        project=(updated or project).get("name"),
    )
    return _to_response(updated)


@router.delete("/{project_id}")
def delete_project(project_id: int, current_user: dict = Depends(get_current_user)):
    entry = _find_project_entry(project_id)
    project = entry[1] if entry else _virtual_project_doc(project_id)
    if not project or not _project_visible(project, current_user):
        raise HTTPException(status_code=404, detail="项目不存在")
    if not entry:
        raise HTTPException(status_code=404, detail="项目不存在")
    result = entry[0].delete_one(_id_query(project_id))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="项目不存在")
    write_audit_log(
        current_user=current_user,
        action="删除项目",
        target_type="project",
        target_name=project.get("name") or str(project_id),
        before=project,
        project=project.get("name"),
        level="warning",
    )
    return {"message": "项目已删除"}


@router.get("/{project_id}/fences")
def get_project_fences(project_id: int, current_user: dict = Depends(get_current_user)):
    project = _project_doc(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if not _project_visible(project, current_user):
        raise HTTPException(status_code=404, detail="项目不存在")
    fences = []
    for fence in fences_collection.find({"$or": [{"project_id": project_id}, {"project_id": str(project_id)}, {"project": project.get("name")}]}, {"_id": 0}):
        fences.append({
            "id": _safe_int(fence.get("id") or fence.get("fence_id")),
            "name": fence.get("name"),
            "region_name": fence.get("region_name"),
            "region_id": _safe_int(fence.get("region_id")),
            "shape": fence.get("shape"),
            "behavior": fence.get("behavior"),
            "alarm_type": fence.get("alarm_type"),
            "is_active": fence.get("is_active", 1),
            "worker_count": fence.get("worker_count", 0),
        })
    return fences
