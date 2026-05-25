from fastapi import APIRouter, HTTPException
from typing import List, Optional

from app.core.database import get_mongo_collection, get_next_sequence
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
alarms_collection = get_mongo_collection("alarm_record")


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


def _id_query(value):
    return {"$or": [{"id": int(value)}, {"id": str(value)}]}


def _project_doc(project_id: int):
    project = _find_project_in_collections(project_id)
    return project or _virtual_project_doc(project_id)


def _find_project_in_collections(project_id: int):
    for collection in (projects_collection, legacy_projects_collection, sql_projects_collection):
        project = collection.find_one(_id_query(project_id), {"_id": 0})
        if project:
            return project
    return None


def _project_source_docs(query=None):
    query = query or {}
    for collection in (projects_collection, legacy_projects_collection, sql_projects_collection):
        docs = list(collection.find(query, {"_id": 0}).sort("id", 1))
        if docs:
            return docs
    return []


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


def _project_devices(project_name: str):
    devices = []
    for dev in devices_collection.find({"project": project_name}, {"_id": 0}):
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


def _to_response(project: dict) -> ProjectResponse:
    user_ids = [int(x) for x in project.get("user_ids", []) if str(x).isdigit()]
    region_ids = [int(x) for x in project.get("region_ids", []) if str(x).isdigit()]
    project_name = _clean_text(project.get("name")) or ""
    return ProjectResponse(
        id=_safe_int(project.get("id")),
        name=project_name,
        description=_clean_text(project.get("description")),
        manager=_clean_text(project.get("manager") or project.get("manager_name")),
        status=project.get("status"),
        remark=_clean_text(project.get("remark")),
        branch_id=project.get("branch_id"),
        users=_project_users(user_ids, project_name),
        devices=_project_devices(project_name),
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


@router.get("/", response_model=List[ProjectListItem])
def get_projects(search: Optional[str] = None, branch_id: Optional[int] = None):
    query = {}

    if branch_id:
        query["branch_id"] = branch_id

    result = []
    source_projects = _project_source_docs(query)
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
            if branch_id:
                query_by_personnel["branch_id"] = branch_id
            source_projects = _project_source_docs(query_by_personnel)

    if not source_projects:
        source_projects = _virtual_project_docs()
        if search:
            source_projects = [p for p in source_projects if _project_matches_search(p, search)]
        if branch_id:
            source_projects = [p for p in source_projects if _safe_int(p.get("branch_id")) == branch_id]

    for project in source_projects:
        user_ids = project.get("user_ids", [])
        region_ids = project.get("region_ids", [])
        project_name = _clean_text(project.get("name")) or ""
        fence_count = _project_fence_count(project)
        alarm_count = _project_alarm_count(project)
        device_count = _project_count_by_name(devices_collection, project_name)
        user_count = len(user_ids) if user_ids else _project_count_by_name(personnel_collection, project_name)
        result.append(ProjectListItem(
            id=_safe_int(project.get("id")),
            name=project_name,
            description=_clean_text(project.get("description")),
            manager=_clean_text(project.get("manager") or project.get("manager_name")),
            status=project.get("status"),
            remark=_clean_text(project.get("remark")),
            branch_id=project.get("branch_id"),
            branch_name=project.get("branch_name"),
            user_count=_safe_int(project.get("user_count"), user_count),
            device_count=_safe_int(project.get("device_count"), device_count),
            region_count=len(region_ids),
            fence_count=_safe_int(project.get("fence_count"), fence_count),
            alarm_count=_safe_int(project.get("alarm_count"), alarm_count),
        ))
    return result


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int):
    project = _project_doc(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return _to_response(project)


@router.post("/", response_model=ProjectResponse)
def create_project(project_data: ProjectCreate):
    next_id = get_next_sequence("project_id")
    doc = project_data.model_dump()
    doc["id"] = next_id
    projects_collection.insert_one(doc)
    return _to_response(doc)


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: int, project_data: ProjectUpdate):
    project = _project_doc(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    updates = {k: v for k, v in project_data.model_dump().items() if v is not None}
    if updates:
        projects_collection.update_one(_id_query(project_id), {"$set": updates})
    return _to_response(_project_doc(project_id))


@router.delete("/{project_id}")
def delete_project(project_id: int):
    result = projects_collection.delete_one(_id_query(project_id))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="项目不存在")
    return {"message": "项目已删除"}


@router.get("/{project_id}/fences")
def get_project_fences(project_id: int):
    project = _project_doc(project_id)
    if not project:
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