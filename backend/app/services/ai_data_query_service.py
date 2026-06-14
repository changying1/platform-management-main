from collections import Counter
from datetime import datetime
import re

from app.controllers.dashboard_controller import _alarm_list, _load
from app.core.data_scope import in_scope, is_hq


SENSITIVE_KEYS = {
    "_id",
    "password",
    "hashed_password",
    "password_hash",
    "salt",
    "token",
    "auth_token",
    "access_token",
    "refresh_token",
    "secret",
    "private_key",
}

GENERAL_COLLECTIONS = {
    "branches": ("branch", "branches", "sql_branches"),
    "projects": ("project", "projects", "sql_projects"),
    "personnel": ("personnel", "sql_personnel"),
    "location_devices": ("device", "fence_device", "sql_devices"),
    "video_devices": ("video_device",),
    "alarms": ("alarm_record", "sql_alarm_records", "sql_alarms"),
    "fences": ("fence", "project_region"),
    "grids": ("grid",),
    "teams": ("team", "teams", "sql_teams"),
    "attendance": ("attendance_record",),
    "work_types": ("work_types", "sql_work_types"),
    "responsibility_units": ("responsibility_unit",),
    "group_calls": ("group_calls", "voice_records"),
    "voice_calls": ("app_voice_call_rooms", "app_voice_call_records"),
    "system_logs": ("system_log",),
    "permissions": ("role_permissions",),
    "users": ("users",),
}

USER_ONLY_MODULES = {"users", "permissions", "system_logs"}

SCOPE_KWARGS = {
    "project_fields": ("project_id", "projectId", "id"),
    "grid_fields": ("grid_id", "gridId", "gridIds", "grid_ids", "grid"),
    "team_fields": ("team_id", "teamId", "team"),
    "branch_fields": ("branch_id", "branchId", "department_id"),
    "company_fields": ("company", "department", "dept", "branch_name"),
    "project_name_fields": ("project", "name", "project_name"),
    "team_name_fields": ("team", "workTeam", "work_team", "name"),
}

MODULE_KEYWORDS = {
    "branches": ["分公司", "公司", "branch"],
    "projects": ["项目", "工地", "工程", "project"],
    "devices": ["设备", "定位", "离线", "在线", "电量", "device", "rtk", "uwb", "gps"],
    "video_devices": ["视频", "摄像", "监控", "录像", "camera", "video"],
    "personnel": ["人员", "员工", "工人", "管理", "负责人", "班组", "姓名", "person", "worker"],
    "attendance": ["考勤", "进场", "出场", "在场", "签到", "attendance"],
    "alarms": ["告警", "报警", "预警", "隐患", "违规", "风险", "未处理", "已处理", "alarm", "violation"],
    "grids": ["网格", "区域", "grid"],
    "teams": ["班组", "队伍", "team"],
    "work_types": ["工种", "工作类型", "work"],
    "users": ["用户", "账号", "权限", "角色", "user", "account"],
}


def _jsonable(value):
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items() if str(k) not in SENSITIVE_KEYS}
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    return value


def _safe_doc(doc: dict, max_fields: int = 24) -> dict:
    result = {}
    for key, value in (doc or {}).items():
        if str(key) in SENSITIVE_KEYS:
            continue
        if len(result) >= max_fields:
            break
        result[str(key)] = _jsonable(value)
    return result


def _sample(items, limit=20):
    return [_safe_doc(item) for item in items[:limit]]


def _text(value) -> str:
    return str(value or "").strip()


def _detect_modules(question: str) -> set[str]:
    normalized = _text(question).lower()
    modules = {
        module
        for module, keywords in MODULE_KEYWORDS.items()
        if any(keyword.lower() in normalized for keyword in keywords)
    }
    if any(word in normalized for word in ["全部", "所有", "整体", "总览", "概览", "统计", "情况", "有哪些"]):
        modules.update(["branches", "projects", "devices", "personnel", "alarms", "grids"])
    if not modules:
        modules.update(["projects", "devices", "personnel", "alarms"])
    return modules


def _tokens(question: str) -> list[str]:
    raw_tokens = re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z0-9_-]{2,}", question or "")
    stop_words = {"今天", "昨天", "这个", "系统", "里面", "多少", "哪些", "什么", "查询", "情况", "统计"}
    return [token for token in raw_tokens if token not in stop_words][:12]


def _matches_tokens(item: dict, tokens: list[str]) -> bool:
    if not tokens:
        return False
    haystack = str(_safe_doc(item)).lower()
    return any(token.lower() in haystack for token in tokens)


def _counter(items, *fields):
    values = []
    for item in items:
        value = next((_text(item.get(field)) for field in fields if _text(item.get(field))), "未知")
        values.append(value)
    return dict(Counter(values))


def _parse_time(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, dict) and "$date" in value:
        value = value["$date"]
    if not value:
        return None
    raw = str(value).strip().replace("T", " ").replace("Z", "")
    if "." in raw:
        raw = raw.split(".", 1)[0]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw[:19], fmt)
        except ValueError:
            continue
    return None


def _latest_time(item: dict):
    for field in ("created_at", "create_time", "createdAt", "updated_at", "update_time", "updatedAt", "start_date", "startDate"):
        parsed = _parse_time(item.get(field))
        if parsed:
            return parsed
    return datetime.min


def _is_latest_project_question(question: str) -> bool:
    q = question or ""
    return any(word in q for word in ("最新", "最近", "新增", "新建")) and any(word in q for word in ("项目", "工地", "工程"))


def _project_direct_answer(question: str, projects: list[dict]) -> str | None:
    if not _is_latest_project_question(question):
        return None
    if not projects:
        return "系统中未查询到当前权限范围内的项目记录。"

    latest = sorted(projects, key=_latest_time, reverse=True)[0]
    fields = []
    name = latest.get("name") or latest.get("project") or latest.get("project_name") or "未命名项目"
    fields.append(f"最新新增的项目是：{name}")

    created = _latest_time(latest)
    if created != datetime.min:
        fields.append(f"时间：{created.strftime('%Y-%m-%d %H:%M:%S')}")
    if latest.get("id") not in (None, ""):
        fields.append(f"项目ID：{latest.get('id')}")
    if latest.get("branch_id") not in (None, ""):
        fields.append(f"所属分公司ID：{latest.get('branch_id')}")
    if latest.get("status"):
        fields.append(f"状态：{latest.get('status')}")
    if latest.get("manager"):
        fields.append(f"负责人：{latest.get('manager')}")

    return "；".join(fields) + f"。\n依据：projects 模块查询到 {len(projects)} 条当前权限范围内项目记录，并按创建/更新时间倒序取第一条。"


def _is_org_question(question: str) -> bool:
    q = question or ""
    return any(word in q for word in ("组织架构", "组织结构", "架构", "层级", "集团", "分公司")) and not any(
        word in q for word in ("视频", "设备", "告警", "报警", "考勤")
    )


def _load_named_collection(mongo_db, names, limit=500):
    collection_name = _find_existing_collection(mongo_db, names)
    if not collection_name:
        return []
    return _read_collection(mongo_db, collection_name, limit)


def _org_direct_answer(question: str, user: dict, mongo_db, branches: list[dict], projects: list[dict], personnel: list[dict]) -> str | None:
    if not _is_org_question(question):
        return None

    units = _apply_scope("responsibility_units", _load_named_collection(mongo_db, GENERAL_COLLECTIONS["responsibility_units"]), user)
    if not branches and not projects and not units and not personnel:
        return "系统中未查询到当前权限范围内的组织架构相关记录。"

    branch_by_id = {str(b.get("id")): b for b in branches}
    group_branches = [b for b in branches if str(b.get("name") or "").endswith("集团有限公司") or "集团" in str(b.get("name") or "")]
    child_branches = [b for b in branches if b not in group_branches]

    lines = ["当前系统中的组织架构如下："]
    if group_branches:
        for branch in group_branches:
            manager = branch.get("manager") or "未配置负责人"
            lines.append(f"1. 集团/总部：{branch.get('name')}，负责人：{manager}，状态：{branch.get('status') or '未知'}。")
    elif branches:
        lines.append("1. 集团/总部：当前权限范围内未单独配置集团记录。")

    if child_branches:
        lines.append("2. 分公司：")
        for branch in child_branches[:20]:
            manager = branch.get("manager") or "未配置负责人"
            lines.append(f"- {branch.get('name')}，负责人：{manager}，项目数：{sum(1 for p in projects if str(p.get('branch_id')) == str(branch.get('id')))}。")

    if projects:
        lines.append("3. 项目：")
        for project in projects[:30]:
            branch_name = branch_by_id.get(str(project.get("branch_id")), {}).get("name") or f"分公司ID {project.get('branch_id')}"
            manager = project.get("manager_name") or project.get("manager") or "未配置负责人"
            lines.append(f"- {project.get('name')}，所属：{branch_name}，负责人：{manager}，状态：{project.get('status') or '未知'}。")

    if units:
        type_names = {"division": "分部", "workshop": "工区/科室", "site": "网格/区域", "subproject": "班组/子项目"}
        lines.append("4. 责任单元：")
        for unit in sorted(units, key=lambda x: (int(x.get("level") or 0), str(x.get("unit_id") or "")))[:30]:
            unit_type = type_names.get(unit.get("type"), unit.get("type") or "未分类")
            parent = unit.get("parent_id") or "无"
            lines.append(f"- {unit.get('name')}（{unit_type}），上级ID：{parent}。")

    if personnel:
        lines.append(f"5. 人员：当前权限范围内人员记录 {len(personnel)} 条，可继续按负责人、班组、项目或姓名细查。")

    lines.append(f"依据：branch {len(branches)} 条、project {len(projects)} 条、responsibility_unit {len(units)} 条、personnel {len(personnel)} 条当前权限范围内记录。")
    return "\n".join(lines)


def _load_users(mongo_db, user):
    if not is_hq(user):
        return []
    for name in ("users", "user", "sql_users"):
        try:
            if name in mongo_db.list_collection_names():
                return list(mongo_db[name].find({}, {"_id": 0, "password": 0, "hashed_password": 0, "token": 0}).limit(100))
        except Exception:
            continue
    return []


def _find_existing_collection(mongo_db, names):
    try:
        existing = set(mongo_db.list_collection_names())
    except Exception:
        existing = set()
    for name in names:
        if name in existing:
            return name
    return None


def _read_collection(mongo_db, name, limit=300):
    projection = {key: 0 for key in SENSITIVE_KEYS}
    try:
        return list(mongo_db[name].find({}, projection).limit(limit))
    except Exception:
        return []


def _apply_scope(module: str, docs: list[dict], user: dict) -> list[dict]:
    if is_hq(user):
        return docs
    if module in USER_ONLY_MODULES:
        return []
    return [doc for doc in docs if in_scope(doc, user, **SCOPE_KWARGS)]


def _catalog_for_question(question: str, user: dict, mongo_db) -> dict:
    tokens = _tokens(question)
    catalog = {}
    matched = {}

    for module, collection_names in GENERAL_COLLECTIONS.items():
        collection_name = _find_existing_collection(mongo_db, collection_names)
        if not collection_name:
            continue

        docs = _apply_scope(module, _read_collection(mongo_db, collection_name), user)
        catalog[module] = {
            "collection": collection_name,
            "total": len(docs),
            "sample": _sample(docs, 8),
        }

        hits = [doc for doc in docs if _matches_tokens(doc, tokens)]
        if hits:
            matched[module] = {
                "collection": collection_name,
                "total": len(hits),
                "sample": _sample(hits, 12),
            }

    return {"catalog": catalog, "matched": matched}


def build_ai_query_context(question: str, user: dict, mongo_db) -> dict:
    branches, projects, devices, personnel, attendance, alarms, grids, teams, work_types = _load(mongo_db, user)
    users = _load_users(mongo_db, user)
    universal = _catalog_for_question(question, user, mongo_db)
    modules = _detect_modules(question)
    tokens = _tokens(question)

    datasets = {
        "branches": branches,
        "projects": projects,
        "devices": devices,
        "video_devices": [
            item for item in devices
            if "camera" in _text(item.get("device_type") or item.get("type")).lower()
            or "video" in _text(item.get("device_type") or item.get("type")).lower()
            or item.get("ip_address")
        ],
        "personnel": personnel,
        "attendance": attendance,
        "alarms": alarms,
        "grids": grids,
        "teams": teams,
        "work_types": work_types,
        "users": users,
    }

    result = {
        "query": question,
        "query_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "scope": {
            "username": user.get("username"),
            "permission_level": user.get("permission_level"),
            "department_id": user.get("department_id"),
            "project_id": user.get("project_id"),
            "grid_id": user.get("grid_id"),
            "team_id": user.get("team_id"),
        },
        "summary": {
            "branches": len(branches),
            "projects": len(projects),
            "devices": len(devices),
            "personnel": len(personnel),
            "attendance_records": len(attendance),
            "alarms": len(alarms),
            "grids": len(grids),
            "teams": len(teams),
            "work_types": len(work_types),
            "users": len(users),
            "queryable_modules": len(universal["catalog"]),
        },
        "data_catalog": universal["catalog"],
        "modules": {},
        "matched_records": {},
        "global_matched_records": universal["matched"],
        "evidence": [],
        "direct_answer": _project_direct_answer(question, projects)
        or _org_direct_answer(question, user, mongo_db, branches, projects, personnel),
    }

    for module in modules:
        items = datasets.get(module, [])
        module_data = {"total": len(items)}
        if module == "alarms":
            module_data.update({
                "by_status": _counter(items, "status"),
                "by_severity": _counter(items, "severity"),
                "by_type": _counter(items, "behavior", "behavior_code", "alarm_type"),
                "recent": _alarm_list(items, 20),
            })
        elif module == "devices":
            module_data.update({
                "by_status": _counter(items, "status"),
                "by_type": _counter(items, "device_type", "type"),
                "sample": _sample(items, 20),
            })
        elif module == "personnel":
            module_data.update({
                "by_status": _counter(items, "status"),
                "by_position": _counter(items, "position", "role"),
                "sample": _sample(items, 20),
            })
        elif module == "projects":
            module_data.update({
                "by_status": _counter(items, "status"),
                "sample": _sample(items, 30),
            })
        else:
            module_data["sample"] = _sample(items, 20)
        result["modules"][module] = module_data
        result["evidence"].append(f"{module}: 查询到 {len(items)} 条权限范围内记录")

    for module, items in datasets.items():
        matched = [item for item in items if _matches_tokens(item, tokens)]
        if matched:
            result["matched_records"][module] = {
                "total": len(matched),
                "sample": _sample(matched, 15),
            }

    return result
