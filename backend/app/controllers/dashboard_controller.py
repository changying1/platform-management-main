from collections import Counter
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends

from app.core.database import get_mongo_db
from app.core.security import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

CAMERA_TYPES = {"bullet_camera", "dome_camera", "body_camera", "drone", "camera", "dome", "bullet"}
LOCATION_TYPES = {"rtk", "uwb", "gps_tag", "gps_band", "smart_helmet", "location", "gateway"}
HIGH_SEVERITIES = {"high", "critical", "severe", "HIGH", "高危", "紧急"}
PENDING_STATUSES = {"pending", "new", "unhandled", "0", 0}
RESOLVED_STATUSES = {"handled", "resolved", "closed", "1", 1}


def _docs(db, *names):
    for name in names:
        try:
            if name in db.list_collection_names():
                docs = list(db[name].find({}, {"_id": 0}))
                if docs:
                    return docs
        except Exception:
            continue
    return []


def _as_int(value, default=0):
    try:
        return default if value in (None, "") else int(value)
    except (TypeError, ValueError):
        return default


def _dt(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(value[:19], fmt)
            except ValueError:
                pass
    return None


def _load(db, user):
    branch_id = user.get("department_id")
    branches = _docs(db, "branches", "sql_branches")
    projects = _docs(db, "projects", "sql_projects")
    devices = _docs(db, "device", "video_device", "sql_devices")
    personnel = _docs(db, "personnel", "sql_personnel")
    attendance = _docs(db, "attendance_records", "sql_attendance_records")
    alarms = _docs(db, "alarm_record", "sql_alarm_records", "sql_alarms")
    teams = _docs(db, "team", "teams", "sql_teams")
    work_types = _docs(db, "work_types", "sql_work_types")

    if branch_id and branch_id != 0:
        branches = [b for b in branches if _as_int(b.get("id")) == int(branch_id)]
        projects = [p for p in projects if _as_int(p.get("branch_id")) == int(branch_id)]
        project_ids = {str(p.get("id")) for p in projects}
        project_names = {p.get("name") for p in projects}
        devices = [d for d in devices if _as_int(d.get("branch_id")) == int(branch_id) or str(d.get("project_id") or d.get("project")) in project_ids | project_names]
        personnel = [p for p in personnel if _as_int(p.get("branch_id")) == int(branch_id)]
        attendance = [a for a in attendance if _as_int(a.get("branch_id")) == int(branch_id)]
        teams = [t for t in teams if _as_int(t.get("branch_id")) == int(branch_id)]
        alarms = [a for a in alarms if not a.get("project_id") or str(a.get("project_id")) in project_ids]
    return branches, projects, devices, personnel, attendance, alarms, teams, work_types


def _belongs_to_project(item, project):
    return str(item.get("project_id") or item.get("project")) in {str(project.get("id")), project.get("name")}


def _format_time(value):
    if not value:
        return ""
    if isinstance(value, dict) and "$date" in value:
        value = value["$date"]
    if hasattr(value, 'strftime'):
        return value.strftime('%Y-%m-%d %H:%M:%S')
    ts = str(value).strip()
    if "T" in ts:
        ts = ts.replace("T", " ")
    if "." in ts:
        ts = ts.split(".")[0]
    return ts[:19] if len(ts) >= 19 else ts


def _attendance_person_key(item):
    value = (
        item.get("person_id")
        or item.get("personnel_id")
        or item.get("user_id")
        or item.get("worker_id")
        or item.get("employee_id")
        or item.get("device_id")
    )
    return str(value) if value not in (None, "") else None


def _attendance_type(item):
    raw = str(
        item.get("type")
        or item.get("event_type")
        or item.get("direction")
        or item.get("status")
        or ""
    ).strip().lower()
    if raw in {"in", "entry", "enter", "clock_in", "check_in", "signin", "on_site", "进场", "入场"}:
        return "in"
    if raw in {"out", "exit", "leave", "clock_out", "check_out", "signout", "off_site", "离场", "出场"}:
        return "out"
    return ""


def _clean_description(desc):
    if not desc:
        return ""
    desc = str(desc).strip()
    if desc.startswith("Device "):
        desc = desc[7:]
    # Normalize legacy fence alarms that were generated in English.
    desc = desc.replace("entered restricted area", "闯入禁入区域")
    desc = desc.replace("left designated area", "离开指定区域")
    desc = desc.replace("restricted area", "禁入区域")
    desc = desc.replace("designated area", "指定区域")
    desc = desc.replace(": ", "：")
    return desc

def _alarm_list(alarms, limit=50):
    alarms = sorted(alarms, key=lambda a: _dt(a.get("timestamp") or a.get("created_at") or a.get("alarm_time")) or datetime.min, reverse=True)
    return [{
        "id": str(a.get("id") or idx),
        "alarm_type": a.get("alarm_type") or "",
        "severity": a.get("severity") or "",
        "description": _clean_description(a.get("description") or ""),
        "timestamp": _format_time(a.get("timestamp") or a.get("created_at") or a.get("alarm_time")),
        "status": a.get("status") or "",
        "project_id": a.get("project_id"),
        "branch_name": a.get("branch_name") or "未知",
    } for idx, a in enumerate(alarms[:limit])]


def _device_stats(devices):
    stats = {"cameraOnline": 0, "cameraOffline": 0, "cameraFault": 0, "locationOnline": 0, "locationOffline": 0, "locationLowBattery": 0}
    for d in devices:
        dtype = str(d.get("device_type") or d.get("type") or "").lower()
        online = bool(d.get("is_online")) or str(d.get("status") or "").lower() == "online"
        fault = str(d.get("status") or "").lower() == "fault" or bool(d.get("is_fault"))
        if dtype in CAMERA_TYPES:
            stats["cameraFault" if fault else "cameraOnline" if online else "cameraOffline"] += 1
        elif dtype in LOCATION_TYPES:
            stats["locationLowBattery" if fault else "locationOnline" if online else "locationOffline"] += 1
    return stats


def _alarm_stats(alarms):
    return {
        "total": len(alarms),
        "high": sum(1 for a in alarms if a.get("severity") in HIGH_SEVERITIES),
        "medium": sum(1 for a in alarms if str(a.get("severity")).lower() in {"medium", "warning"}),
        "low": sum(1 for a in alarms if str(a.get("severity")).lower() in {"low", "info"}),
        "pending": sum(1 for a in alarms if a.get("status") in PENDING_STATUSES),
        "resolved": sum(1 for a in alarms if a.get("status") in RESOLVED_STATUSES),
        "list": _alarm_list(alarms),
    }


def _personnel_stats(personnel, attendance):
    levels = Counter(str(p.get("identity_level") or "").lower() for p in personnel)
    management = sum(v for k, v in levels.items() if "admin" in k or "manager" in k)
    security = sum(v for k, v in levels.items() if "safety" in k or "security" in k)
    construction = max(0, len(personnel) - management - security)
    department_stats = {"management": management, "technical": 0, "construction": construction, "security": security}
    
    today = datetime.now().date()
    
    today_in_people = set()
    today_out_people = set()
    person_last_state = {}
    
    for a in attendance:
        ts = _dt(a.get("timestamp") or a.get("time") or a.get("created_at"))
        if not ts:
            continue
        person_id = _attendance_person_key(a)
        event_type = _attendance_type(a)
        if not person_id or not event_type:
            continue
            
        if ts.date() == today:
            if event_type == "in":
                today_in_people.add(person_id)
            elif event_type == "out":
                today_out_people.add(person_id)

        if person_id not in person_last_state or ts > person_last_state[person_id]["time"]:
            person_last_state[person_id] = {
                "time": ts,
                "type": event_type
            }
    
    on_site = sum(1 for v in person_last_state.values() if v["type"] == "in")
    
    return {
        "total": len(personnel),
        "todayIn": len(today_in_people),
        "todayOut": len(today_out_people),
        "onSite": on_site,
        **department_stats,
        "departmentStats": department_stats,
    }


def _safety_days(alarms):
    dates = [_dt(a.get("timestamp") or a.get("created_at") or a.get("alarm_time")) for a in alarms if a.get("severity") in HIGH_SEVERITIES]
    dates = [d for d in dates if d]
    return max(0, (datetime.now() - max(dates)).days) if dates else 0


def _avg(projects, field):
    return round(sum(_as_int(p.get(field)) for p in projects) / max(len(projects), 1))


def _view(name, level, branches, projects, devices, personnel, attendance, alarms, teams, work_types):
    return {
        "name": name,
        "level": level,
        "branches": len(branches),
        "projects": len(projects),
        "devices": len(devices),
        "personnel": len(personnel),
        "teamCount": len(teams),
        "workTypeCount": len(work_types),
        "projectsList": projects,
        "alarms": _alarm_stats(alarms),
        "personnelStats": _personnel_stats(personnel, attendance),
        "devicesList": _device_stats(devices),
        "avgProgress": _avg(projects, "progress"),
        "avgDuration": _avg(projects, "duration_days"),
        "safetyDays": _safety_days(alarms),
    }


@router.get("/overview")
def dashboard_overview(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    branches, projects, devices, personnel, attendance, alarms, teams, work_types = _load(mongo_db, user)
    projects_by_id = {}
    for project in projects:
        p_devices = [d for d in devices if _belongs_to_project(d, project)]
        p_personnel = [p for p in personnel if _belongs_to_project(p, project)]
        p_attendance = [a for a in attendance if _belongs_to_project(a, project)]
        p_alarms = [a for a in alarms if _belongs_to_project(a, project)]
        p_teams = [t for t in teams if _belongs_to_project(t, project)]
        item = _view(project.get("name") or "", "project", branches[:1], [project], p_devices, p_personnel, p_attendance, p_alarms, p_teams, work_types)
        item.update({
            "projectId": project.get("id"),
            "projectName": project.get("name") or "",
            "manager": project.get("manager") or "",
            "progress": _as_int(project.get("progress")),
            "completionRate": _as_int(project.get("progress")),
        })
        projects_by_id[str(project.get("id"))] = item

    branches_by_id = {}
    for branch in branches:
        bid = _as_int(branch.get("id"))
        b_projects = [p for p in projects if _as_int(p.get("branch_id")) == bid]
        project_ids = {str(p.get("id")) for p in b_projects}
        project_names = {p.get("name") for p in b_projects}
        b_devices = [d for d in devices if _as_int(d.get("branch_id")) == bid or str(d.get("project_id") or d.get("project")) in project_ids | project_names]
        b_personnel = [p for p in personnel if _as_int(p.get("branch_id")) == bid]
        b_attendance = [a for a in attendance if _as_int(a.get("branch_id")) == bid]
        b_alarms = [a for a in alarms if str(a.get("project_id")) in project_ids]
        b_teams = [t for t in teams if _as_int(t.get("branch_id")) == bid or str(t.get("project_id")) in project_ids]
        branches_by_id[str(bid)] = _view(branch.get("name") or "", "headquarters", [branch], b_projects, b_devices, b_personnel, b_attendance, b_alarms, b_teams, work_types)

    return {
        "branches": branches,
        "projects": projects,
        "national": _view("全国信息总览", "national", branches, projects, devices, personnel, attendance, alarms, teams, work_types),
        "branchesById": branches_by_id,
        "projectsById": projects_by_id,
        "todayAlarms": _alarm_list(alarms),
    }


@router.get("/summary")
def dashboard_summary(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    _, projects, devices, _, _, alarms, _, _ = _load(mongo_db, user)
    data = []
    for p in projects:
        p_devices = [d for d in devices if _belongs_to_project(d, p)]
        data.append({
            "id": p.get("id"),
            "name": p.get("name") or "",
            "branch_id": p.get("branch_id"),
            "manager": p.get("manager") or "",
            "status": p.get("status") or "active",
            "longitude": p.get("longitude") or p.get("lng"),
            "latitude": p.get("latitude") or p.get("lat"),
            "center": p.get("center"),
            "area_boundary": p.get("area_boundary"),
            "zoom_level": _as_int(p.get("zoom_level"), 16),
            "deviceCount": len(p_devices),
            "userCount": _as_int(p.get("user_count") or len(p.get("user_ids") or [])),
            "fenceCount": _as_int(p.get("fence_count") or len(p.get("region_ids") or [])),
            "safetyDays": _safety_days([a for a in alarms if _belongs_to_project(a, p)]),
            "devices": p_devices,
        })
    return data


@router.get("/branches")
def list_branches(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    branches = _load(mongo_db, user)[0]
    return [{
        "id": _as_int(b.get("id")),
        "province": b.get("province") or "",
        "name": b.get("name") or "",
        "coord": [float(b["lng"]), float(b["lat"])] if b.get("lng") is not None and b.get("lat") is not None else None,
        "address": b.get("address"),
        "project": b.get("project"),
        "manager": b.get("manager"),
        "phone": b.get("phone"),
        "deviceCount": _as_int(b.get("device_count")),
        "status": b.get("status") or "正常",
        "updatedAt": str(b.get("updated_at")) if b.get("updated_at") else None,
        "remark": b.get("remark"),
    } for b in branches]


@router.get("/alarms")
def list_dashboard_alarms(limit: int = 10, user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    return _alarm_list(_load(mongo_db, user)[5], limit)


@router.get("/devices")
def list_devices(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    return _load(mongo_db, user)[2]


@router.get("/devices/statistics")
def device_statistics(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    stats = _device_stats(_load(mongo_db, user)[2])
    return {
        "cameras": {"online": stats["cameraOnline"], "offline": stats["cameraOffline"], "fault": stats["cameraFault"]},
        "locations": {"online": stats["locationOnline"], "offline": stats["locationOffline"], "fault": stats["locationLowBattery"]},
    }


@router.get("/alarms/statistics")
def alarm_statistics(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    alarms = _load(mongo_db, user)[5]
    stats = _alarm_stats(alarms)
    return {**stats, "todayNew": len(today_alarms(user=user, mongo_db=mongo_db)), "resolveRate": round(stats["resolved"] / max(stats["total"], 1) * 100, 1)}


@router.get("/alarms/today")
def today_alarms(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    now = datetime.now()
    seven_days_ago = now - timedelta(days=7)
    all_alarms = _alarm_list(_load(mongo_db, user)[5], 50)
    result = []
    for a in all_alarms:
        ts = _dt(a.get("timestamp"))
        if ts and ts >= seven_days_ago:
            result.append(a)
        if len(result) >= 20:
            break
    return result


@router.get("/attendance/today")
def today_attendance(branch_id: Optional[int] = None, project_id: Optional[int] = None, user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    attendance = _load(mongo_db, user)[4]
    if branch_id:
        attendance = [a for a in attendance if _as_int(a.get("branch_id")) == branch_id]
    if project_id:
        attendance = [a for a in attendance if _as_int(a.get("project_id")) == project_id]
    stats = _personnel_stats([], attendance)
    return {"today_in": stats["todayIn"], "today_out": stats["todayOut"], "on_site": stats["onSite"]}


@router.get("/personnel/stats")
def personnel_statistics(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    return _personnel_stats(_load(mongo_db, user)[3], _load(mongo_db, user)[4])


@router.get("/safety-days")
def safety_days(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    return {"safetyDays": _safety_days(_load(mongo_db, user)[5])}


@router.get("/project/work-types")
def project_work_types(project_id: int = None, user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    return _load(mongo_db, user)[7]


@router.get("/branches/stats")
def branches_stats(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    branches = _load(mongo_db, user)[0]
    return {"total": len(branches), "byStatus": dict(Counter(b.get("status") or "未知" for b in branches)), "branches": branches}


@router.get("/violations/stats")
def violations_stats(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    alarms = _load(mongo_db, user)[5]
    return {
        "total": len(alarms),
        "todayCount": len(today_alarms(user=user, mongo_db=mongo_db)),
        "bySeverity": dict(Counter(a.get("severity") or "未知" for a in alarms)),
        "byStatus": dict(Counter(a.get("status") or "未知" for a in alarms)),
        "byBehavior": dict(Counter(a.get("behavior_code") or a.get("behavior") or a.get("alarm_type") or "未知" for a in alarms)),
        "byProject": dict(Counter(str(a.get("project_id") or "未知") for a in alarms)),
        "todayViolations": today_alarms(user=user, mongo_db=mongo_db)[:20],
    }


@router.get("/personnel/details")
def personnel_details(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    personnel = _load(mongo_db, user)[3]
    return {
        "total": len(personnel),
        "byBranch": dict(Counter(str(p.get("branch_id") or "未知") for p in personnel)),
        "byPosition": dict(Counter(p.get("position") or "未知" for p in personnel)),
        "byStatus": dict(Counter(p.get("status") or "未知" for p in personnel)),
        "byLevel": dict(Counter(p.get("identity_level") or "未知" for p in personnel)),
        "managers": personnel[:30],
        "branchManagers": {},
        "branches": {b.get("id"): b.get("name") for b in _load(mongo_db, user)[0]},
    }


@router.get("/ai/full-data")
def ai_full_data(user: dict = Depends(get_current_user), mongo_db=Depends(get_mongo_db)):
    branches, projects, devices, personnel, attendance, alarms, teams, work_types = _load(mongo_db, user)
    return {
        "branches": {"total": len(branches), "list": branches},
        "projects": {"total": len(projects), "list": projects[:50]},
        "devices": {"total": len(devices), "list": devices[:100]},
        "personnel": {"total": len(personnel), "list": personnel[:100]},
        "attendance": {"total": len(attendance)},
        "alarms": {"total": len(alarms), "list": _alarm_list(alarms, 100)},
        "teams": {"total": len(teams), "list": teams},
        "workTypes": {"total": len(work_types), "list": work_types},
    }
