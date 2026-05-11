from fastapi import APIRouter, Depends
from typing import Optional
import json
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.core.security import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


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
