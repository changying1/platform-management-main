from fastapi import APIRouter, Depends
from collections import defaultdict
from datetime import datetime
from typing import Optional
import json
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db, get_mongo_db
from app.core.security import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


CAMERA_TYPES = {"bullet_camera", "dome_camera", "body_camera", "drone", "camera"}
LOCATION_TYPES = {"rtk", "uwb", "gps_tag", "gps_band", "smart_helmet", "location", "gateway"}
HIGH_SEVERITIES = {"high", "critical", "HIGH", "高危", "紧急"}
MEDIUM_SEVERITIES = {"medium", "warning", "MEDIUM", "重要", "安全隐患"}
LOW_SEVERITIES = {"low", "info", "LOW", "一般", "一般违章"}
PENDING_STATUSES = {"pending", "new", "unhandled", "0", 0}
RESOLVED_STATUSES = {"handled", "resolved", "closed", "1", 1}


def _as_int(value, default=0):
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_float(value):
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _dt_value(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(value[:19], fmt)
            except ValueError:
                continue
    return None


def _to_jsonable(value):
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return value


def _device_counts(devices):
    stats = {
        "cameraOnline": 0,
        "cameraOffline": 0,
        "cameraFault": 0,
        "locationOnline": 0,
        "locationOffline": 0,
        "locationLowBattery": 0,
    }
    for device in devices:
        dtype = str(device.get("device_type") or device.get("type") or "").lower()
        online = bool(device.get("is_online")) or str(device.get("status") or "").lower() == "online"
        fault = bool(device.get("is_fault")) or str(device.get("status") or "").lower() == "fault"
        if dtype in CAMERA_TYPES:
            if fault:
                stats["cameraFault"] += 1
            elif online:
                stats["cameraOnline"] += 1
            else:
                stats["cameraOffline"] += 1
        elif dtype in LOCATION_TYPES:
            if fault:
                stats["locationLowBattery"] += 1
            elif online:
                stats["locationOnline"] += 1
            else:
                stats["locationOffline"] += 1
    return stats


def _alarm_counts(alarms):
    stats = {"total": len(alarms), "high": 0, "medium": 0, "low": 0, "pending": 0, "resolved": 0}
    for alarm in alarms:
        severity = alarm.get("severity")
        status = alarm.get("status")
        if severity in HIGH_SEVERITIES:
            stats["high"] += 1
        elif severity in MEDIUM_SEVERITIES:
            stats["medium"] += 1
        elif severity in LOW_SEVERITIES:
            stats["low"] += 1
        if status in PENDING_STATUSES:
            stats["pending"] += 1
        if status in RESOLVED_STATUSES:
            stats["resolved"] += 1
    return stats


def _personnel_stats(personnel, attendance):
    total = len(personnel)
    management = security = construction = 0
    for person in personnel:
        level = str(person.get("identity_level") or "").lower()
        if "admin" in level:
            management += 1
        elif "safety" in level:
            security += 1
        else:
            construction += 1
    technical = max(0, total - management - security - construction)
    today_in = sum(1 for item in attendance if item.get("type") == "in")
    today_out = sum(1 for item in attendance if item.get("type") == "out")
    return {
        "total": total,
        "todayIn": today_in,
        "todayOut": today_out,
        "management": management,
        "technical": technical,
        "construction": construction,
        "security": security,
    }


def _latest_safety_days(alarms):
    high_alarm_dates = [
        _dt_value(alarm.get("timestamp") or alarm.get("created_at"))
        for alarm in alarms
        if alarm.get("severity") in HIGH_SEVERITIES
    ]
    high_alarm_dates = [dt for dt in high_alarm_dates if dt is not None]
    if not high_alarm_dates:
        return 0
    return max(0, (datetime.now() - max(high_alarm_dates)).days)


def _alarm_list(alarms, limit=50):
    sorted_alarms = sorted(
        alarms,
        key=lambda item: _dt_value(item.get("timestamp") or item.get("created_at")) or datetime.min,
        reverse=True,
    )
    return [
        {
            "id": str(alarm.get("id") or alarm.get("_id") or idx),
            "alarm_type": alarm.get("alarm_type") or "",
            "severity": alarm.get("severity") or "",
            "description": alarm.get("description") or "",
            "timestamp": _to_jsonable(alarm.get("timestamp")),
            "status": alarm.get("status") or "",
            "project_id": alarm.get("project_id"),
        }
        for idx, alarm in enumerate(sorted_alarms[:limit])
    ]


def _dashboard_data(name, level, branches, projects, devices, personnel, attendance, alarms, teams, work_types):
    project_count = len(projects)
    avg_progress = round(sum(_as_int(p.get("progress")) for p in projects) / max(project_count, 1))
    avg_duration = round(sum(_as_int(p.get("duration_days")) for p in projects) / max(project_count, 1))
    alarm_stats = _alarm_counts(alarms)
    return {
        "name": name,
        "level": level,
        "branches": len(branches),
        "projects": project_count,
        "devices": len(devices),
        "personnel": len(personnel),
        "teamCount": len(teams),
        "workTypeCount": len(work_types),
        "avgDuration": avg_duration,
        "projectsList": projects,
        "alarms": {**alarm_stats, "list": _alarm_list(alarms)},
        "personnelStats": _personnel_stats(personnel, attendance),
        "devicesList": _device_counts(devices),
        "avgProgress": avg_progress,
        "safetyDays": _latest_safety_days(alarms),
    }


@router.get("/overview")
def dashboard_overview(
    user: dict = Depends(get_current_user),
    mongo_db=Depends(get_mongo_db),
):
    """
    MongoDB-backed aggregate payload for the dashboard.
    It reads SQL dump collections imported as sql_* and keeps existing dashboard
    view shapes so the frontend can drop hard-coded statistics gradually.
    """
    dept_id = user.get("department_id")
    branch_filter = None if not dept_id or dept_id == 0 else _as_int(dept_id)

    branches_raw = list(mongo_db["sql_branches"].find({}, {"_id": 0}))
    projects_raw = list(mongo_db["sql_projects"].find({}, {"_id": 0}))
    devices_raw = list(mongo_db["sql_devices"].find({}, {"_id": 0}))
    personnel_raw = list(mongo_db["sql_personnel"].find({}, {"_id": 0}))
    attendance_raw = list(mongo_db["sql_attendance_records"].find({}, {"_id": 0}))
    alarms_raw = list(mongo_db["sql_alarm_records"].find({}, {"_id": 0}))
    teams_raw = list(mongo_db["sql_teams"].find({}, {"_id": 0}))
    work_types_raw = list(mongo_db["sql_work_types"].find({}, {"_id": 0}))

    if branch_filter is not None:
        branches_raw = [b for b in branches_raw if _as_int(b.get("id")) == branch_filter]
        projects_raw = [p for p in projects_raw if _as_int(p.get("branch_id")) == branch_filter]
        devices_raw = [d for d in devices_raw if _as_int(d.get("branch_id")) == branch_filter]
        personnel_raw = [p for p in personnel_raw if _as_int(p.get("branch_id")) == branch_filter]
        attendance_raw = [a for a in attendance_raw if _as_int(a.get("branch_id")) == branch_filter]
        teams_raw = [t for t in teams_raw if _as_int(t.get("branch_id")) == branch_filter]

    project_ids = {_as_int(p.get("id")) for p in projects_raw}
    alarms_raw = [a for a in alarms_raw if not a.get("project_id") or _as_int(a.get("project_id")) in project_ids]

    devices_by_project = defaultdict(list)
    for device in devices_raw:
        devices_by_project[_as_int(device.get("project_id"))].append(device)

    personnel_by_project = defaultdict(list)
    for person in personnel_raw:
        personnel_by_project[_as_int(person.get("project_id"))].append(person)

    teams_by_project = defaultdict(list)
    for team in teams_raw:
        teams_by_project[_as_int(team.get("project_id"))].append(team)

    work_type_ids_by_project = defaultdict(set)
    for person in personnel_raw:
        pid = _as_int(person.get("project_id"))
        wid = person.get("work_type_id")
        if wid is not None:
            work_type_ids_by_project[pid].add(wid)

    project_summaries = []
    for project in projects_raw:
        pid = _as_int(project.get("id"))
        project_devices = devices_by_project.get(pid, [])
        project_people = personnel_by_project.get(pid, [])
        project_teams = teams_by_project.get(pid, [])
        lng = _as_float(project.get("longitude"))
        lat = _as_float(project.get("latitude"))
        devices_for_map = []
        for device in project_devices:
            device_lng = _as_float(device.get("last_lng") or device.get("lng") or device.get("longitude"))
            device_lat = _as_float(device.get("last_lat") or device.get("lat") or device.get("latitude"))
            if device_lng is None or device_lat is None:
                continue
            devices_for_map.append(
                {
                    "id": device.get("id"),
                    "name": device.get("device_name") or device.get("name") or device.get("device_code") or "",
                    "type": device.get("device_type") or "",
                    "lng": device_lng,
                    "lat": device_lat,
                    "is_online": 1 if device.get("is_online") else 0,
                }
            )
        project_summaries.append(
            {
                "id": pid,
                "name": project.get("name") or "",
                "branch_id": _as_int(project.get("branch_id")),
                "branch": "",
                "manager": project.get("manager_name") or project.get("manager") or "",
                "status": project.get("status") or "active",
                "progress": _as_int(project.get("progress")),
                "longitude": lng,
                "latitude": lat,
                "center": project.get("center") or ([lng, lat] if lng is not None and lat is not None else None),
                "area_boundary": project.get("area_boundary"),
                "zoom_level": _as_int(project.get("zoom_level"), 16),
                "deviceCount": len(project_devices),
                "userCount": len(project_people),
                "fenceCount": _as_int(project.get("fence_count")),
                "teamCount": len(project_teams),
                "workTypeCount": len(work_type_ids_by_project.get(pid, set())),
                "safetyDays": _as_int(project.get("safety_days")),
                "devices": devices_for_map,
            }
        )

    branches = []
    for branch in branches_raw:
        lng = _as_float(branch.get("longitude") or branch.get("lng"))
        lat = _as_float(branch.get("latitude") or branch.get("lat"))
        branches.append(
            {
                "id": _as_int(branch.get("id")),
                "province": branch.get("province") or "",
                "name": branch.get("name") or "",
                "coord": [lng, lat] if lng is not None and lat is not None else None,
                "address": branch.get("address"),
                "manager": branch.get("manager"),
                "phone": branch.get("phone"),
                "deviceCount": _as_int(branch.get("device_count")),
                "status": branch.get("status") or "正常",
                "updatedAt": _to_jsonable(branch.get("updated_at")),
            }
        )

    branch_views = {}
    for branch in branches:
        bid = branch["id"]
        branch_projects = [p for p in project_summaries if p.get("branch_id") == bid]
        branch_project_ids = {p["id"] for p in branch_projects}
        branch_devices = [d for d in devices_raw if _as_int(d.get("branch_id")) == bid]
        branch_people = [p for p in personnel_raw if _as_int(p.get("branch_id")) == bid]
        branch_attendance = [a for a in attendance_raw if _as_int(a.get("branch_id")) == bid]
        branch_alarms = [a for a in alarms_raw if _as_int(a.get("project_id")) in branch_project_ids]
        branch_teams = [t for t in teams_raw if _as_int(t.get("branch_id")) == bid]
        branch_views[str(bid)] = _dashboard_data(
            f"{branch['name']}·信息总览",
            "headquarters",
            [branch],
            branch_projects,
            branch_devices,
            branch_people,
            branch_attendance,
            branch_alarms,
            branch_teams,
            work_types_raw,
        )

    project_views = {}
    for project in project_summaries:
        pid = project["id"]
        project_devices = devices_by_project.get(pid, [])
        project_people = personnel_by_project.get(pid, [])
        project_attendance = [a for a in attendance_raw if _as_int(a.get("project_id")) == pid]
        project_alarms = [a for a in alarms_raw if _as_int(a.get("project_id")) == pid]
        project_teams = teams_by_project.get(pid, [])
        base = _dashboard_data(
            f"{project['name']}·详情",
            "project",
            [b for b in branches if b["id"] == project.get("branch_id")],
            [project],
            project_devices,
            project_people,
            project_attendance,
            project_alarms,
            project_teams,
            work_types_raw,
        )
        base.update(
            {
                "projectId": pid,
                "projectName": project["name"],
                "manager": project.get("manager") or "",
                "projects": 1,
                "progress": project.get("progress") or 0,
                "completionRate": project.get("progress") or 0,
                "scheduleStatus": "正常推进" if (project.get("progress") or 0) >= 60 else "进行中",
            }
        )
        project_views[str(pid)] = base

    national = _dashboard_data(
        "全国信息总览",
        "national",
        branches,
        project_summaries,
        devices_raw,
        personnel_raw,
        attendance_raw,
        alarms_raw,
        teams_raw,
        work_types_raw,
    )

    return {
        "branches": branches,
        "projects": project_summaries,
        "national": national,
        "branchesById": branch_views,
        "projectsById": project_views,
        "todayAlarms": _alarm_list(alarms_raw),
    }


@router.get("/summary")
def dashboard_summary(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    顶部统计：改为返回分公司的项目列表信息
    """
    dept_id = user.get("department_id")
    
    where_sql = ""
    params = {}
    
    if dept_id and dept_id != 0:
        where_sql = "WHERE p.branch_id = :bid"
        params["bid"] = dept_id

    rows = db.execute(text(f"""
        SELECT
          p.id, p.name, p.branch_id, p.manager, p.status,
          p.longitude, p.latitude, p.center, p.area_boundary, p.zoom_level,
          (SELECT COUNT(*) FROM devices WHERE project_id = p.id) as deviceCount,
          (SELECT COUNT(*) FROM project_users WHERE project_id = p.id) as userCount,
          (SELECT COUNT(*) FROM project_regions WHERE project_id = p.id) as fenceCount,
          DATEDIFF(NOW(), (
              SELECT MAX(created_at) FROM alarms 
              WHERE project_id = p.id 
              AND severity IN ('high', 'critical', 'HIGH')
          )) as safety_days
        FROM projects p
        {where_sql}
        ORDER BY p.id ASC
    """), params).mappings().all()

    device_rows = db.execute(text("""
        SELECT id, name, device_type, lng, lat, is_online, project_id
        FROM devices 
        WHERE lng IS NOT NULL AND lat IS NOT NULL
        ORDER BY project_id, id
    """)).mappings().all()

    devices_by_project = {}
    for d in device_rows:
        pid = d["project_id"]
        if pid not in devices_by_project:
            devices_by_project[pid] = []
        devices_by_project[pid].append({
            "id": d["id"],
            "name": d["name"] or "",
            "type": d["device_type"] or "",
            "lng": d["lng"],
            "lat": d["lat"],
            "is_online": 1 if d["is_online"] else 0
        })

    data = []
    for r in rows:
        safety_days = int(r["safety_days"]) if r["safety_days"] is not None else 0
        
        center = None
        if r["center"]:
            try:
                if isinstance(r["center"], str):
                    center = json.loads(r["center"])
                else:
                    center = r["center"]
            except:
                center = None
        
        area_boundary = None
        if r["area_boundary"]:
            try:
                if isinstance(r["area_boundary"], str):
                    area_boundary = json.loads(r["area_boundary"])
                else:
                    area_boundary = r["area_boundary"]
            except:
                area_boundary = None
        
        longitude = None
        if r["longitude"]:
            longitude = float(r["longitude"])
        
        latitude = None
        if r["latitude"]:
            latitude = float(r["latitude"])
        
        project_devices = []
        for d in devices_by_project.get(r["id"], []):
            project_devices.append({
                "id": d["id"],
                "name": d["name"],
                "type": d["type"],
                "lng": float(d["lng"]) if d["lng"] else None,
                "lat": float(d["lat"]) if d["lat"] else None,
                "is_online": d["is_online"]
            })
        
        data.append({
            "id": r["id"],
            "name": r["name"] or "",
            "branch_id": r["branch_id"],
            "manager": r["manager"] or "",
            "status": r["status"] or "active",
            "longitude": longitude,
            "latitude": latitude,
            "center": center,
            "area_boundary": area_boundary,
            "zoom_level": int(r["zoom_level"] or 16),
            "deviceCount": int(r["deviceCount"] or 0),
            "userCount": int(r["userCount"] or 0),
            "fenceCount": int(r["fenceCount"] or 0),
            "safetyDays": max(0, safety_days),
            "devices": project_devices
        })
        
    return data


@router.get("/branches")
def list_branches(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),  # ✅ 新增：仅用于判断 HQ / BRANCH
):
    """
    分公司列表：给前端地图展示使用
    前端需要 coord: [lng, lat]（经度在前）
    """
    # ✅ 仅增加：总部/分部可见性控制
    # 只要有 department_id 且不为0 (总部)，就强制过滤
    where_sql = ""
    params = {}
    dept_id = user.get("department_id")
    
    if dept_id and dept_id != 0:
        where_sql = "WHERE id = :bid"
        params["bid"] = dept_id

    rows = db.execute(text(f"""
        SELECT
          id, province, name, lng, lat, address, project, manager, phone,
          device_count, status, updated_at, remark
        FROM branches
        {where_sql}
        ORDER BY id ASC
    """), params).mappings().all()

    data = []
    for r in rows:
        coord = None
        if r["lng"] is not None and r["lat"] is not None:
            coord = [float(r["lng"]), float(r["lat"])]

        data.append({
            "id": int(r["id"]),
            "province": r.get("province") or "",
            "name": r.get("name") or "",
            "coord": coord,  # [lng, lat]
            "address": r.get("address"),
            "project": r.get("project"),
            "manager": r.get("manager"),
            "phone": r.get("phone"),
            "deviceCount": int(r.get("device_count") or 0),
            "status": r.get("status") or "正常",
            "updatedAt": str(r.get("updated_at")) if r.get("updated_at") else None,
            "remark": r.get("remark"),
        })

    return data


@router.get("/alarms")
def list_dashboard_alarms(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    limit: int = 10
):
    """
    Get recent alarm records for the dashboard
    """
    from app.models.alarm_records import AlarmRecord
    from app.models.project import Project
    from app.models.branches import Branch
    
    dept_id = user.get("department_id")
    
    # 直接通过 project_id 关联，不再需要 device→project_devices 的间接 JOIN
    query = db.query(AlarmRecord, Branch.name.label("branch_name"))\
        .outerjoin(Project, AlarmRecord.project_id == Project.id)\
        .outerjoin(Branch, Project.branch_id == Branch.id)
        
    if dept_id and dept_id != 0:
        query = query.filter(Project.branch_id == dept_id)
        
    # Get latest alarms
    alarms = query.order_by(AlarmRecord.timestamp.desc()).limit(limit).all()
    
    result = []
    for alarm, branch_name in alarms:
        result.append({
            "id": alarm.id,
            "alarm_type": alarm.alarm_type,
            "severity": alarm.severity,
            "description": alarm.description,
            "timestamp": alarm.timestamp.strftime("%Y-%m-%d %H:%M:%S") if alarm.timestamp else None,
            "status": alarm.status,
            "project_id": alarm.project_id,
            "branch_name": branch_name or "未知"
        })
        
    return result


@router.get("/devices")
def list_devices(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """获取所有设备列表 - 从 MySQL devices 表读取"""
    rows = db.execute(text("""
        SELECT d.id, d.name, d.device_id as device_code, d.device_type, 
               d.lng, d.lat, d.is_online, d.status, d.project_id,
               p.branch_id
        FROM devices d
        LEFT JOIN projects p ON d.project_id = p.id
        ORDER BY d.id DESC
    """)).mappings().all()
    
    return [
        {
            "id": row["id"],
            "name": row["name"] or "",
            "device_code": row["device_code"] or "",
            "device_type": row["device_type"] or "",
            "lng": row["lng"],
            "lat": row["lat"],
            "status": 1 if row["is_online"] else 0,
            "is_online": 1 if row["is_online"] else 0,
            "project_id": row["project_id"],
            "branch_id": row["branch_id"]
        }
        for row in rows
    ]


@router.get("/devices/statistics")
def device_statistics(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """设备分类统计"""
    camera_types = ["bullet_camera", "dome_camera", "body_camera", "drone", "camera"]
    location_types = ["rtk", "uwb", "gps_tag", "gps_band", "smart_helmet", "location"]
    
    rows = db.execute(text("""
        SELECT device_type, is_online, COUNT(*) as cnt
        FROM devices
        GROUP BY device_type, is_online
    """)).mappings().all()
    
    cameras_online = 0
    cameras_offline = 0
    cameras_fault = 0
    locations_online = 0
    locations_offline = 0
    locations_fault = 0
    
    for r in rows:
        dtype = (r["device_type"] or "").lower()
        cnt = int(r["cnt"] or 0)
        is_online = r["is_online"] or False
        
        if dtype in camera_types:
            if is_online:
                cameras_online += cnt
            else:
                cameras_offline += cnt
        
        if dtype in location_types:
            if is_online:
                locations_online += cnt
            else:
                locations_offline += cnt
    
    return {
        "cameras": {
            "online": cameras_online,
            "offline": cameras_offline,
            "fault": cameras_fault
        },
        "locations": {
            "online": locations_online,
            "offline": locations_offline,
            "fault": locations_fault
        }
    }


@router.get("/alarms/statistics")
def alarm_statistics(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """告警统计 - 从 MySQL alarm_records 表读取真实数据"""
    row_total = db.execute(text("SELECT COUNT(*) as cnt FROM alarm_records")).mappings().first()
    total = int(row_total["cnt"]) if row_total else 0
    
    row_pending = db.execute(text("SELECT COUNT(*) as cnt FROM alarm_records WHERE status IN ('pending', 'new', 'unhandled', 0)")).mappings().first()
    pending = int(row_pending["cnt"]) if row_pending else 0
    
    row_handled = db.execute(text("SELECT COUNT(*) as cnt FROM alarm_records WHERE status IN ('handled', 'resolved', 'closed', 1)")).mappings().first()
    handled = int(row_handled["cnt"]) if row_handled else 0
    
    row_high = db.execute(text("SELECT COUNT(*) as cnt FROM alarm_records WHERE severity IN ('high', 'critical', 'HIGH', '紧急', '高危')")).mappings().first()
    high = int(row_high["cnt"]) if row_high else 0
    
    row_medium = db.execute(text("SELECT COUNT(*) as cnt FROM alarm_records WHERE severity IN ('medium', 'warning', 'MEDIUM', '重要', '安全隐患')")).mappings().first()
    medium = int(row_medium["cnt"]) if row_medium else 0
    
    row_low = db.execute(text("SELECT COUNT(*) as cnt FROM alarm_records WHERE severity IN ('low', 'info', 'LOW', '一般', '一般违章')")).mappings().first()
    low = int(row_low["cnt"]) if row_low else 0
    
    row_today_new = db.execute(text("SELECT COUNT(*) as cnt FROM alarm_records WHERE DATE(timestamp) = CURDATE()")).mappings().first()
    today_new = int(row_today_new["cnt"]) if row_today_new else 0
    
    resolve_rate = round(handled / max(total, 1) * 100, 1)
    
    return {
        "total": total,
        "high": high,
        "medium": medium,
        "low": low,
        "pending": pending,
        "resolved": handled,
        "todayNew": today_new,
        "resolveRate": resolve_rate
    }


@router.get("/alarms/today")
def today_alarms(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """今日告警 - 从 MySQL alarms 表读取真实数据"""
    rows = db.execute(text("""
        SELECT id, alarm_type, severity, description, timestamp
        FROM alarm_records 
        ORDER BY timestamp DESC 
        LIMIT 50
    """)).mappings().all()
    
    return [
        {
            "id": str(row["id"]),
            "alarm_type": row["alarm_type"] or "",
            "severity": row["severity"] or "",
            "description": row["description"] or "",
            "timestamp": str(row["timestamp"]) if row["timestamp"] else None
        }
        for row in rows
    ]


@router.get("/attendance/today")
def today_attendance(
    db: Session = Depends(get_db),
    branch_id: Optional[int] = None,
    project_id: Optional[int] = None,
    user: dict = Depends(get_current_user),
):
    """今日考勤 - 从 MySQL attendance_records 表读取"""
    query_in = "SELECT COUNT(*) as cnt FROM attendance_records WHERE type = 'in'"
    query_out = "SELECT COUNT(*) as cnt FROM attendance_records WHERE type = 'out'"
    params = {}
    
    if branch_id:
        query_in += " AND branch_id = :branch_id"
        query_out += " AND branch_id = :branch_id"
        params["branch_id"] = branch_id
    if project_id:
        query_in += " AND project_id = :project_id"
        query_out += " AND project_id = :project_id"
        params["project_id"] = project_id
    
    row_in = db.execute(text(query_in), params).mappings().first()
    row_out = db.execute(text(query_out), params).mappings().first()
    
    today_in = int(row_in["cnt"]) if row_in else 0
    today_out = int(row_out["cnt"]) if row_out else 0
    
    return {
        "today_in": today_in,
        "today_out": today_out
    }


@router.get("/personnel/stats")
def personnel_statistics(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """人员统计 - 从 MySQL personnel 表读取"""
    row_total = db.execute(text("SELECT COUNT(*) as total FROM personnel WHERE status = 'active'")).mappings().first()
    total = int(row_total["total"]) if row_total else 0
    
    row_online = db.execute(text("SELECT COUNT(*) as cnt FROM personnel WHERE is_on_site = 1 AND status = 'active'")).mappings().first()
    online = int(row_online["cnt"]) if row_online else 0
    
    management = 0
    technical = 0
    construction = 0
    security = 0
    
    rows = db.execute(text("""
        SELECT identity_level, COUNT(*) as cnt 
        FROM personnel 
        WHERE status = 'active' 
        GROUP BY identity_level
    """)).mappings().all()
    
    for row in rows:
        level = row["identity_level"]
        cnt = int(row["cnt"])
        if 'admin' in level:
            management += cnt
        elif 'safety' in level:
            security += cnt
        else:
            construction += cnt
    
    technical = max(0, total - management - construction - security)
    
    return {
        "management": management,
        "technical": technical,
        "construction": construction,
        "security": security
    }


@router.get("/safety-days")
def safety_days(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """安全生产天数 - 从 MySQL alarms 表计算"""
    from datetime import datetime
    
    row = db.execute(text("""
        SELECT DATEDIFF(NOW(), MAX(created_at)) as days 
        FROM alarms 
        WHERE severity IN ('high', 'critical', 'HIGH')
    """)).mappings().first()
    
    days = int(row["days"]) if row and row["days"] is not None else 0
    
    return {
        "safetyDays": max(0, days)
    }


@router.get("/project/work-types")
def project_work_types(
    project_id: int = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """项目工种统计"""
    return []


@router.get("/branches/stats")
def branches_stats(
    mongo_db=Depends(get_mongo_db),
    user: dict = Depends(get_current_user),
):
    """分公司统计 - 从 MongoDB 获取分公司信息"""
    branches_raw = list(mongo_db["sql_branches"].find({}, {"_id": 0}))
    
    total = len(branches_raw)
    
    status_counts: Record[str, int] = {}
    for branch in branches_raw:
        status = branch.get("status") or "未知"
        status_counts[status] = status_counts.get(status, 0) + 1
    
    return {
        "total": total,
        "byStatus": status_counts,
        "branches": [
            {
                "id": branch.get("id"),
                "name": branch.get("name"),
                "province": branch.get("province"),
                "status": branch.get("status"),
                "deviceCount": branch.get("device_count", 0),
            }
            for branch in branches_raw
        ]
    }


@router.get("/violations/stats")
def violations_stats(
    mongo_db=Depends(get_mongo_db),
    user: dict = Depends(get_current_user),
):
    """违规行为统计 - 从 MongoDB 获取违规记录"""
    alarm_records = list(mongo_db["alarm_record"].find({}, {"_id": 0}))
    
    total = len(alarm_records)
    
    by_severity: Record[str, int] = {}
    by_status: Record[str, int] = {}
    by_behavior: Record[str, int] = {}
    by_project: Record[str, int] = {}
    
    today_count = 0
    today_violations = []
    
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).date()
    
    for record in alarm_records:
        severity = record.get("severity") or "未知"
        status = record.get("status") or "未知"
        behavior = record.get("behavior_code") or record.get("behavior") or "未知"
        project_id = str(record.get("project_id", "未知"))
        
        by_severity[severity] = by_severity.get(severity, 0) + 1
        by_status[status] = by_status.get(status, 0) + 1
        by_behavior[behavior] = by_behavior.get(behavior, 0) + 1
        by_project[project_id] = by_project.get(project_id, 0) + 1
        
        alarm_time = record.get("alarm_time")
        if alarm_time:
            try:
                alarm_date = datetime.fromisoformat(alarm_time.replace("Z", "+00:00")).date()
                if alarm_date == today:
                    today_count += 1
                    if len(today_violations) < 20:
                        today_violations.append({
                            "id": record.get("id"),
                            "behavior": behavior,
                            "severity": severity,
                            "person": record.get("captured_person_name"),
                            "location": record.get("location_desc"),
                            "time": alarm_time,
                        })
            except:
                pass
    
    return {
        "total": total,
        "todayCount": today_count,
        "bySeverity": by_severity,
        "byStatus": by_status,
        "byBehavior": by_behavior,
        "byProject": by_project,
        "todayViolations": today_violations,
    }


@router.get("/personnel/details")
def personnel_details(
    mongo_db=Depends(get_mongo_db),
    user: dict = Depends(get_current_user),
):
    """人员详情 - 从 MongoDB 获取人员信息（包含管理人员）"""
    personnel = list(mongo_db["sql_personnel"].find({}, {"_id": 0}))
    
    total = len(personnel)
    
    by_branch: Record[str, int] = {}
    by_position: Record[str, int] = {}
    by_status: Record[str, int] = {}
    by_level: Record[str, int] = {}
    
    managers = []
    branch_managers = {}
    
    branches = {b["id"]: b["name"] for b in list(mongo_db["sql_branches"].find({}, {"_id": 0, "id": 1, "name": 1}))}
    
    for person in personnel:
        branch_id = str(person.get("branch_id", "未知"))
        position = person.get("position") or "未知"
        status = person.get("status") or "未知"
        level = person.get("identity_level") or "未知"
        
        by_branch[branch_id] = by_branch.get(branch_id, 0) + 1
        by_position[position] = by_position.get(position, 0) + 1
        by_status[status] = by_status.get(status, 0) + 1
        by_level[level] = by_level.get(level, 0) + 1
        
        if "管理员" in position or "经理" in position or level in ["headquarters_admin", "branch_admin", "project_manager"]:
            if len(managers) < 30:
                managers.append({
                    "id": person.get("id"),
                    "name": person.get("name"),
                    "position": position,
                    "branch": branches.get(person.get("branch_id")),
                    "branch_id": person.get("branch_id"),
                    "phone": person.get("phone"),
                    "level": level,
                    "status": status,
                })
    
    for m in managers:
        bid = str(m["branch_id"]) if m["branch_id"] else "总部"
        if bid not in branch_managers:
            branch_managers[bid] = []
        branch_managers[bid].append(m)
    
    return {
        "total": total,
        "byBranch": by_branch,
        "byPosition": by_position,
        "byStatus": by_status,
        "byLevel": by_level,
        "managers": managers,
        "branchManagers": branch_managers,
        "branches": branches,
    }


@router.get("/ai/full-data")
def ai_full_data(
    mongo_db=Depends(get_mongo_db),
    user: dict = Depends(get_current_user),
):
    """AI 助手完整数据接口 - 汇总所有MongoDB数据供AI分析"""
    
    result = {}
    
    # 1. 分公司数据
    branches = list(mongo_db["sql_branches"].find({}, {"_id": 0}))
    result["branches"] = {
        "total": len(branches),
        "list": branches,
        "byStatus": {b.get("status", "未知"): sum(1 for x in branches if x.get("status") == b.get("status")) for b in branches}
    }
    
    # 2. 项目数据
    projects = list(mongo_db["sql_projects"].find({}, {"_id": 0}))
    result["projects"] = {
        "total": len(projects),
        "list": projects[:20],
        "byBranch": {str(p.get("branch_id", "未知")): sum(1 for x in projects if str(x.get("branch_id")) == str(p.get("branch_id"))) for p in projects}
    }
    
    # 3. 人员数据
    personnel = list(mongo_db["sql_personnel"].find({}, {"_id": 0}))
    managers = [p for p in personnel if "管理员" in (p.get("position", "") or "") or p.get("identity_level") in ["headquarters_admin", "branch_admin", "project_manager"]]
    result["personnel"] = {
        "total": len(personnel),
        "managers": managers[:30],
        "byLevel": {p.get("identity_level", "未知"): sum(1 for x in personnel if x.get("identity_level") == p.get("identity_level")) for p in personnel},
        "byBranch": {str(p.get("branch_id", "未知")): sum(1 for x in personnel if str(x.get("branch_id")) == str(p.get("branch_id"))) for p in personnel}
    }
    
    # 4. 设备数据
    devices = list(mongo_db["sql_devices"].find({}, {"_id": 0}))
    result["devices"] = {
        "total": len(devices),
        "online": sum(1 for d in devices if d.get("is_online")),
        "offline": sum(1 for d in devices if not d.get("is_online")),
        "byType": {d.get("device_type", "未知"): sum(1 for x in devices if x.get("device_type") == d.get("device_type")) for d in devices}
    }
    
    # 5. 告警数据
    alarms = list(mongo_db["sql_alarms"].find({}, {"_id": 0}))
    result["alarms"] = {
        "total": len(alarms),
        "pending": sum(1 for a in alarms if a.get("status") == "pending"),
        "resolved": sum(1 for a in alarms if a.get("status") == "resolved"),
        "bySeverity": {a.get("severity", "未知"): sum(1 for x in alarms if x.get("severity") == a.get("severity")) for a in alarms}
    }
    
    # 6. 违规行为记录
    alarm_records = list(mongo_db["alarm_record"].find({}, {"_id": 0}))
    result["violations"] = {
        "total": len(alarm_records),
        "byBehavior": {r.get("behavior_code", "未知"): sum(1 for x in alarm_records if x.get("behavior_code") == r.get("behavior_code")) for r in alarm_records},
        "bySeverity": {r.get("severity", "未知"): sum(1 for x in alarm_records if x.get("severity") == r.get("severity")) for r in alarm_records},
        "recent": alarm_records[:10]
    }
    
    # 7. 视频设备
    video_devices = list(mongo_db["sql_video_devices"].find({}, {"_id": 0}))
    result["video_devices"] = {
        "total": len(video_devices),
        "byStatus": {v.get("status", "未知"): sum(1 for x in video_devices if x.get("status") == v.get("status")) for v in video_devices}
    }
    
    # 8. 工作类型
    work_types = list(mongo_db["sql_work_types"].find({}, {"_id": 0}))
    result["work_types"] = {
        "total": len(work_types),
        "list": work_types
    }
    
    # 9. 用户数据
    users = list(mongo_db["sql_users"].find({}, {"_id": 0, "password": 0}))
    result["users"] = {
        "total": len(users),
        "list": users[:10]
    }
    
    return result
