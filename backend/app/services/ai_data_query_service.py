from collections import Counter
from datetime import datetime, timedelta
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
    "personnel": ("personnel",),
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

USER_ONLY_MODULES = {"users", "permissions"}

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
    "system_logs": ["日志", "系统日志", "操作记录", "操作日志", "log"],
}

DATASET_REGISTRY = {
    "branches": {
        "label": "分公司",
        "collections": GENERAL_COLLECTIONS["branches"],
        "keywords": MODULE_KEYWORDS["branches"],
        "time_fields": ("updated_at", "created_at", "create_time"),
        "display_fields": ("name", "manager", "status", "id"),
        "stat_fields": ("status",),
        "scope": "standard",
    },
    "projects": {
        "label": "项目",
        "collections": GENERAL_COLLECTIONS["projects"],
        "keywords": MODULE_KEYWORDS["projects"],
        "time_fields": ("updated_at", "created_at", "create_time", "start_date"),
        "display_fields": ("name", "project_name", "manager", "status", "branch_id", "id"),
        "stat_fields": ("status", "branch_id"),
        "scope": "standard",
    },
    "devices": {
        "label": "定位设备",
        "collections": GENERAL_COLLECTIONS["location_devices"],
        "keywords": MODULE_KEYWORDS["devices"],
        "time_fields": ("updated_at", "created_at", "lastUpdate", "last_seen"),
        "display_fields": ("name", "device_name", "device_id", "status", "project", "grid", "team"),
        "stat_fields": ("status", "device_type", "type"),
        "scope": "standard",
    },
    "video_devices": {
        "label": "视频设备",
        "collections": GENERAL_COLLECTIONS["video_devices"],
        "keywords": MODULE_KEYWORDS["video_devices"],
        "time_fields": ("updated_at", "created_at", "lastUpdate"),
        "display_fields": ("name", "device_name", "camera_name", "status", "project", "grid"),
        "stat_fields": ("status", "device_type", "type"),
        "scope": "standard",
    },
    "personnel": {
        "label": "人员",
        "collections": GENERAL_COLLECTIONS["personnel"],
        "keywords": MODULE_KEYWORDS["personnel"],
        "time_fields": ("updated_at", "created_at", "entryDate", "addedDate"),
        "display_fields": ("name", "username", "employeeId", "role", "status", "project", "team", "workTeam"),
        "stat_fields": ("status", "role", "project", "team", "workTeam"),
        "scope": "standard",
    },
    "alarms": {
        "label": "告警",
        "collections": GENERAL_COLLECTIONS["alarms"],
        "keywords": MODULE_KEYWORDS["alarms"],
        "time_fields": ("time", "alarm_time", "created_at", "timestamp"),
        "display_fields": ("behavior", "alarm_type", "status", "severity", "person", "device", "project", "grid", "team"),
        "stat_fields": ("status", "severity", "behavior", "alarm_type"),
        "scope": "standard",
    },
    "grids": {
        "label": "网格",
        "collections": GENERAL_COLLECTIONS["grids"],
        "keywords": MODULE_KEYWORDS["grids"],
        "time_fields": ("updated_at", "created_at"),
        "display_fields": ("name", "grid_id", "status", "project_name", "project_id", "parent_name"),
        "stat_fields": ("status", "project_id"),
        "scope": "standard",
    },
    "teams": {
        "label": "工队",
        "collections": GENERAL_COLLECTIONS["teams"],
        "keywords": MODULE_KEYWORDS["teams"],
        "time_fields": ("updated_at", "created_at"),
        "display_fields": ("name", "team_name", "team_id", "project", "grid", "status"),
        "stat_fields": ("status", "project", "grid"),
        "scope": "standard",
    },
    "system_logs": {
        "label": "系统日志",
        "collections": GENERAL_COLLECTIONS["system_logs"],
        "keywords": MODULE_KEYWORDS["system_logs"],
        "time_fields": ("time", "created_at", "updated_at"),
        "display_fields": ("operator", "action", "target_type", "target_name", "details", "time"),
        "stat_fields": ("target_type", "action", "operator"),
        "scope": "system_logs",
    },
}

INTENT_KEYWORDS = {
    "latest": ("最近", "最新", "最后", "上一条", "刚刚", "最近更新", "最近汇总", "一条", "最新一条", "新增", "新建"),
    "count": ("多少", "几个", "几家", "几台", "几名", "几条", "几起", "几支", "数量", "共有", "总共", "总数", "统计"),
    "list": ("哪些", "列表", "列出", "明细", "详情", "所有"),
    "stats": ("按", "分布", "占比", "统计", "情况"),
}

CONTEXT_SCOPE_PHRASES = (
    "当前项目",
    "当前的项目",
    "本项目",
    "这个项目",
    "该项目",
    "所在项目",
    "当前工地",
    "当前的工地",
    "本工地",
    "这个工地",
    "该工地",
    "当前工程",
    "当前的工程",
    "本工程",
    "这个工程",
    "该工程",
    "当前范围",
    "权限范围",
)

MODULE_SCOPE_PHRASES = {
    "branches": ("当前分公司", "当前的分公司", "本分公司", "这个分公司", "该分公司", "所在分公司", "当前公司", "当前的公司", "本公司", "这个公司", "该公司", "所在公司"),
    "projects": CONTEXT_SCOPE_PHRASES,
    "grids": ("当前网格", "当前的网格", "本网格", "这个网格", "该网格", "所在网格", "当前区域", "当前的区域", "本区域", "该区域"),
    "teams": ("当前工队", "当前的工队", "本工队", "这个工队", "该工队", "当前班组", "当前的班组", "本班组", "该班组"),
}

OVERVIEW_KEYWORDS = ("全部", "所有", "整体", "总览", "概览", "统计", "情况", "有哪些")

MODULE_PRIORITY = {
    "system_logs": 10,
    "alarms": 20,
    "video_devices": 30,
    "devices": 40,
    "personnel": 50,
    "attendance": 60,
    "teams": 70,
    "grids": 80,
    "projects": 90,
    "branches": 100,
    "users": 110,
    "work_types": 120,
}

MODULE_TARGET_KEYWORDS = {
    "branches": ("分公司列表", "分公司数量", "几个分公司", "几家分公司", "多少分公司", "哪些分公司", "所有分公司", "子公司", "公司列表", "公司数量", "公司有哪些", "branch"),
    "projects": (
        "项目列表",
        "项目数量",
        "几个项目",
        "有几个项目",
        "多少项目",
        "多少个项目",
        "项目总数",
        "哪些项目",
        "所有项目",
        "项目有哪些",
        "项目明细",
        "项目状态",
        "工地列表",
        "工地数量",
        "工程列表",
        "工程数量",
        "project",
    ),
    "devices": ("定位设备", "定位器", "终端", "工牌", "手环", "设备数量", "几个设备", "几台设备", "多少设备", "在线设备", "离线设备", "设备", "rtk", "uwb", "gps", "device"),
    "video_devices": ("摄像头", "摄像机", "相机", "监控摄像", "视频设备", "录像机", "几个摄像头", "几台摄像头", "多少摄像头", "摄像", "监控", "视频", "camera", "video"),
    "personnel": ("人员", "员工", "工人", "管理人员", "负责人", "人员数量", "员工数量", "几个人员", "几名人员", "多少人员", "worker", "person"),
    "attendance": ("考勤", "进场", "出场", "在场", "签到", "attendance"),
    "alarms": ("告警", "报警", "预警", "隐患", "违规", "风险", "告警数量", "几个告警", "几条告警", "几起告警", "未处理", "已处理", "alarm", "violation"),
    "grids": ("网格", "区域", "网格数量", "几个网格", "多少网格", "哪些网格", "grid"),
    "teams": ("工队", "班组", "队伍", "工队数量", "几个工队", "几支工队", "多少工队", "哪些工队", "team"),
    "work_types": ("工种", "工作类型", "work"),
    "users": ("用户", "账号", "权限", "角色", "user", "account"),
    "system_logs": ("系统日志", "操作日志", "操作记录", "日志", "log"),
}

COUNT_UNITS = {
    "branches": ("家", "分公司"),
    "projects": ("个", "项目"),
    "devices": ("台", "定位设备"),
    "video_devices": ("个", "摄像头"),
    "personnel": ("名", "人员"),
    "attendance": ("条", "考勤记录"),
    "alarms": ("条", "告警"),
    "grids": ("个", "网格"),
    "teams": ("支", "工队"),
    "work_types": ("个", "工种"),
    "users": ("个", "用户"),
    "system_logs": ("条", "系统日志"),
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


def _normalized_question(question: str) -> str:
    return _text(question).lower()


def _strip_scope_phrases(question: str) -> str:
    normalized = _normalized_question(question)
    for phrase in CONTEXT_SCOPE_PHRASES:
        normalized = normalized.replace(phrase.lower(), "")
    return normalized


def _strip_module_scope_phrases(question: str, module: str) -> str:
    normalized = _normalized_question(question)
    for phrase in MODULE_SCOPE_PHRASES.get(module, ()):
        normalized = normalized.replace(phrase.lower(), "")
    return normalized


def _contains_scope_phrase(question: str, module: str | None = None) -> bool:
    normalized = _normalized_question(question)
    phrases = MODULE_SCOPE_PHRASES.get(module, CONTEXT_SCOPE_PHRASES) if module else CONTEXT_SCOPE_PHRASES
    return any(phrase.lower() in normalized for phrase in phrases)


def _keyword_hits(text: str, keywords) -> list[str]:
    normalized = _text(text).lower()
    return [keyword for keyword in keywords if _text(keyword).lower() in normalized]


def _module_target_hits(question: str, module: str) -> list[str]:
    return _keyword_hits(_normalized_question(question), MODULE_TARGET_KEYWORDS.get(module, ()))


def _has_non_project_target(question: str) -> bool:
    return _has_other_module_target(question, "projects")


def _has_other_module_target(question: str, current_module: str) -> bool:
    return any(
        _module_target_hits(question, module)
        for module in DATASET_REGISTRY
        if module != current_module
    )


def _scope_only_target_hits(question: str, module: str, target_hits: list[str]) -> list[str]:
    scope_phrases = MODULE_SCOPE_PHRASES.get(module, ())
    return [
        hit for hit in target_hits
        if any(_text(hit).lower() in phrase.lower() for phrase in scope_phrases)
    ]


def _module_score(question: str, module: str) -> dict:
    normalized = _normalized_question(question)
    scope_stripped = _strip_module_scope_phrases(question, module)
    config = DATASET_REGISTRY.get(module, {})
    target_hits = _module_target_hits(question, module)
    keyword_text = scope_stripped if module in MODULE_SCOPE_PHRASES else normalized
    keyword_hits = _keyword_hits(keyword_text, config.get("keywords", ()))

    score = 0
    for keyword in target_hits:
        score += 12 + min(len(_text(keyword)), 4)
    score += len(keyword_hits) * 2

    # "当前项目/当前分公司/当前网格" describes the data scope. It should not make
    # the scope module outrank the actual target object, such as 摄像头、人员、设备、告警.
    if module in MODULE_SCOPE_PHRASES and _contains_scope_phrase(question, module):
        explicit_target_hits = [
            hit for hit in target_hits
            if hit not in _scope_only_target_hits(question, module, target_hits)
        ]
        if _has_other_module_target(question, module) and not explicit_target_hits:
            score = 0
            keyword_hits = []
        elif not target_hits and not keyword_hits:
            score = 4

    return {
        "module": module,
        "score": score,
        "target_hits": target_hits,
        "keyword_hits": keyword_hits,
    }


def _score_modules(question: str) -> list[dict]:
    scored = [_module_score(question, module) for module in DATASET_REGISTRY]
    return sorted(
        [item for item in scored if item["score"] > 0],
        key=lambda item: (-item["score"], MODULE_PRIORITY.get(item["module"], 999)),
    )


def _plan_confidence(scored: list[dict]) -> str:
    if not scored:
        return "low"
    top = scored[0]
    second_score = scored[1]["score"] if len(scored) > 1 else 0
    if top["target_hits"]:
        return "high"
    if top["score"] >= 6 and top["score"] - second_score >= 2:
        return "high"
    return "low"


def _detect_modules(question: str) -> set[str]:
    normalized = _normalized_question(question)
    scored = _score_modules(question)
    modules = {item["module"] for item in scored}
    if any(word in normalized for word in OVERVIEW_KEYWORDS):
        modules.update(["branches", "projects", "devices", "personnel", "alarms", "grids"])
    if not modules:
        modules.update(["projects", "devices", "personnel", "alarms"])
    return modules


def _tokens(question: str) -> list[str]:
    raw_tokens = re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z0-9_-]{2,}", question or "")
    stop_words = {
        "今天",
        "昨天",
        "这个",
        "系统",
        "里面",
        "多少",
        "几个",
        "几台",
        "哪些",
        "什么",
        "查询",
        "情况",
        "统计",
        "数量",
        *CONTEXT_SCOPE_PHRASES,
        *OVERVIEW_KEYWORDS,
    }
    for phrases in MODULE_SCOPE_PHRASES.values():
        stop_words.update(phrases)
    return [token for token in raw_tokens if token not in stop_words][:12]


def _matches_tokens(item: dict, tokens: list[str]) -> bool:
    if not tokens:
        return False
    haystack = str(_safe_doc(item)).lower()
    return any(token.lower() in haystack for token in tokens)


def _detect_intent(question: str) -> str:
    q = question or ""
    if any(word in q for word in INTENT_KEYWORDS["latest"]):
        return "latest"
    if any(word in q for word in ("按", "分布", "占比")):
        return "stats"
    if any(word in q for word in INTENT_KEYWORDS["count"]):
        return "count"
    if any(word in q for word in INTENT_KEYWORDS["list"]):
        return "list"
    if any(word in q for word in INTENT_KEYWORDS["stats"]):
        return "stats"
    return "list"


def _plan_modules(question: str) -> list[str]:
    scored = _score_modules(question)
    hits = [item["module"] for item in scored]
    if hits:
        return hits[:3]
    detected = [module for module in _detect_modules(question) if module in DATASET_REGISTRY]
    return sorted(detected, key=lambda module: MODULE_PRIORITY.get(module, 999))[:3] or ["projects", "personnel", "alarms"]


def _build_ai_query_plan(question: str) -> dict:
    intent = _detect_intent(question)
    modules = _plan_modules(question)
    primary = modules[0]
    config = DATASET_REGISTRY[primary]
    scored = _score_modules(question)
    return {
        "question": question,
        "intent": intent,
        "modules": modules,
        "primary_module": primary,
        "confidence": _plan_confidence(scored),
        "scores": scored[:5],
        "time_fields": config.get("time_fields", ()),
        "display_fields": config.get("display_fields", ()),
        "stat_fields": config.get("stat_fields", ()),
        "limit": 1 if intent == "latest" else 20,
    }


def _item_time_by_fields(item: dict, fields) -> datetime:
    for field in fields:
        parsed = _parse_time(item.get(field))
        if parsed:
            return parsed
    return _latest_time(item)


def _filter_by_question_tokens(items: list[dict], tokens: list[str]) -> list[dict]:
    if not tokens:
        return items
    matched = [item for item in items if _matches_tokens(item, tokens)]
    return matched or items


def _display_record(record: dict, fields) -> str:
    parts = []
    for field in fields:
        value = record.get(field)
        text = _text(value)
        if text:
            parts.append(f"{field}：{text}")
    if parts:
        return "；".join(parts)
    safe = _safe_doc(record, 8)
    return "；".join(f"{key}：{value}" for key, value in safe.items() if _text(value)) or "无可展示字段"


def _format_plan_answer(plan: dict, module: str, items: list[dict], records: list[dict]) -> str | None:
    config = DATASET_REGISTRY[module]
    label = config["label"]
    intent = plan["intent"]
    if intent == "latest":
        if not records:
            return f"当前权限范围内没有查询到{label}记录。"
        record = records[0]
        time_value = _item_time_by_fields(record, config.get("time_fields", ()))
        time_text = time_value.strftime("%Y-%m-%d %H:%M:%S") if time_value != datetime.min else "未知时间"
        return (
            f"最新一条{label}记录是：{_display_record(record, config.get('display_fields', ())) }；时间：{time_text}。\n"
            f"依据：{module} 模块按时间倒序查询，当前权限范围内共 {len(items)} 条记录。"
        )
    if intent == "count":
        unit, display_label = COUNT_UNITS.get(module, ("条", label))
        return f"当前权限范围内共有 {len(records)} {unit}{display_label}。\n依据：{module} 模块查询结果。"
    if intent == "stats":
        fields = config.get("stat_fields", ())
        if not fields:
            return f"当前权限范围内共有 {len(records)} 条{label}记录，暂无可统计字段。\n依据：{module} 模块查询结果。"
        field = fields[0]
        counts = _counter(records, field)
        summary = "；".join(f"{key} {value} 条" for key, value in counts.items())
        return f"{label}按{field}统计：{summary or '无数据'}。\n依据：{module} 模块查询到 {len(records)} 条记录。"
    if not records:
        return f"当前权限范围内没有查询到匹配的{label}记录。"
    lines = [f"查询到 {len(records)} 条{label}记录，前 {min(len(records), plan['limit'])} 条如下："]
    for index, record in enumerate(records[: plan["limit"]], 1):
        lines.append(f"{index}. {_display_record(record, config.get('display_fields', ()))}")
    lines.append(f"依据：{module} 模块查询结果。")
    return "\n".join(lines)


def _counter(items, *fields):
    values = []
    for item in items:
        value = next((_text(item.get(field)) for field in fields if _text(item.get(field))), "未知")
        values.append(value)
    return dict(Counter(values))


def _mentions_video_device(question: str) -> bool:
    return bool(_module_target_hits(question, "video_devices"))


def _is_video_device_count_question(question: str) -> bool:
    q = question or ""
    asks_count = any(word in q for word in ("多少", "几个", "几台", "数量", "共有", "总共", "总数"))
    return _mentions_video_device(question) and asks_count


def _item_name(item: dict) -> str:
    return next(
        (
            _text(item.get(field))
            for field in ("name", "device_name", "camera_name", "device_code", "device_id", "id")
            if _text(item.get(field))
        ),
        "未命名设备",
    )


def _status_label(value) -> str:
    raw = _text(value).lower()
    return {
        "online": "在线",
        "offline": "离线",
        "fault": "故障",
        "active": "在线",
        "inactive": "离线",
        "1": "在线",
        "0": "离线",
    }.get(raw, _text(value) or "未知")


def _current_project_name(user: dict, projects: list[dict]) -> str:
    user_project_id = _text(user.get("project_id"))
    if user_project_id:
        for project in projects:
            project_ids = {
                _text(project.get("id")),
                _text(project.get("project_id")),
                _text(project.get("projectId")),
            }
            if user_project_id in project_ids:
                return _text(project.get("name") or project.get("project") or project.get("project_name"))
    return _text(user.get("project")) or "当前权限范围"


def _video_device_count_direct_answer(question: str, user: dict, projects: list[dict], video_devices: list[dict]) -> str | None:
    if not _is_video_device_count_question(question):
        return None

    by_status = _counter(video_devices, "status")
    project_name = _current_project_name(user, projects)
    lines = [f"{project_name}当前共有 {len(video_devices)} 个摄像头。"]
    if by_status:
        lines.append("按状态统计：" + "、".join(f"{_status_label(key)} {value} 个" for key, value in by_status.items()) + "。")
    if video_devices:
        sample_names = [_item_name(item) for item in video_devices[:8]]
        lines.append("摄像头示例：" + "、".join(sample_names) + (" 等。" if len(video_devices) > len(sample_names) else "。"))
    lines.append(f"依据：video_device 模块查询到 {len(video_devices)} 条当前权限范围内视频设备记录。")
    return "\n".join(lines)


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
    for field in ("time", "created_at", "create_time", "createdAt", "updated_at", "update_time", "updatedAt", "start_date", "startDate"):
        parsed = _parse_time(item.get(field))
        if parsed:
            return parsed
    return datetime.min


def _log_time(item: dict):
    return _parse_time(item.get("time")) or _latest_time(item)


def _format_log_line(log: dict, prefix: str = "最近一条系统日志") -> str:
    log_time = _log_time(log)
    time_text = log_time.strftime("%Y-%m-%d %H:%M:%S") if log_time != datetime.min else "未知时间"
    operator = _text(log.get("operator")) or "未知操作人"
    action = _text(log.get("action")) or "未知操作"
    target_type = _text(log.get("target_type")) or "未知类型"
    target_name = _text(log.get("target_name")) or "未知对象"
    details = _text(log.get("details"))
    scope = " / ".join(
        item for item in (
            _text(log.get("company")),
            _text(log.get("project")),
            _text(log.get("grid")),
            _text(log.get("team")),
        )
        if item
    )
    parts = [
        f"{prefix}是：{action}",
        f"操作对象：{target_name}",
        f"类型：{target_type}",
        f"操作人：{operator}",
        f"时间：{time_text}",
    ]
    if scope:
        parts.append(f"所属单位：{scope}")
    if details:
        parts.append(f"详情：{details}")
    return "；".join(parts) + "。"


def _is_latest_log_question(question: str) -> bool:
    q = question or ""
    has_log = any(word in q for word in ("日志", "系统日志", "操作记录", "操作日志", "log"))
    asks_latest = any(word in q for word in ("最近", "最新", "最后", "上一条", "刚刚", "最近更新", "最近汇总", "汇总", "一条", "一条日志", "最近记录"))
    return has_log and asks_latest


def _system_log_direct_answer(question: str, logs: list[dict]) -> str | None:
    if not _is_latest_log_question(question):
        return None
    if not logs:
        return "系统中未查询到当前权限范围内的系统日志记录。"
    latest = sorted(logs, key=_log_time, reverse=True)[0]
    return _format_log_line(latest) + f"\n依据：system_log 模块查询到 {len(logs)} 条当前权限范围内日志记录，并按操作时间倒序取第一条。"


def _question_days(question: str) -> int | None:
    q = question or ""
    if any(word in q for word in ("近七日", "近7日", "近七天", "近7天", "最近七日", "最近7天", "最近一周", "本周")):
        return 7
    if any(word in q for word in ("今日", "今天", "当天")):
        return 1
    match = re.search(r"近\s*(\d+)\s*[日天]", q)
    if match:
        try:
            return max(1, int(match.group(1)))
        except ValueError:
            return None
    return None


def _is_alarm_count_question(question: str) -> bool:
    q = question or ""
    has_alarm = any(word in q for word in ("违规", "告警", "报警", "预警", "隐患", "风险"))
    asks_count = any(word in q for word in ("多少", "几个", "数量", "总数", "共有", "几起", "几条"))
    return has_alarm and asks_count


def _alarm_time(item: dict) -> datetime:
    for field in ("time", "timestamp", "alarm_time", "created_at", "createdAt"):
        parsed = _parse_time(item.get(field))
        if parsed:
            return parsed
    return datetime.min


def _alarm_count_direct_answer(question: str, alarms: list[dict]) -> str | None:
    if not _is_alarm_count_question(question):
        return None
    days = _question_days(question)
    scoped = alarms
    time_label = "当前权限范围内"
    if days:
        cutoff = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        if days > 1:
            cutoff = cutoff - timedelta(days=days - 1)
        scoped = [alarm for alarm in alarms if _alarm_time(alarm) >= cutoff]
        time_label = f"近{days}日"
    by_status = _counter(scoped, "status")
    by_type = _counter(scoped, "behavior", "behavior_code", "alarm_type")
    lines = [f"{time_label}违规/告警共有 {len(scoped)} 起。"]
    if by_status:
        lines.append("按状态：" + "；".join(f"{key} {value} 起" for key, value in by_status.items()))
    if by_type:
        lines.append("按类型：" + "；".join(f"{key} {value} 起" for key, value in by_type.items()))
    lines.append(f"依据：alarm_record 模块当前权限范围内共 {len(alarms)} 条记录。")
    return "\n".join(lines)


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


def _is_project_count_question(question: str) -> bool:
    if _has_non_project_target(question):
        return False
    q = _strip_scope_phrases(question)
    has_project = any(word in q for word in ("项目", "工地", "工程"))
    asks_count = any(word in q for word in ("多少", "几个", "数量", "共有", "总共", "总数"))
    return has_project and asks_count


def _project_count_direct_answer(question: str, projects: list[dict]) -> str | None:
    if not _is_project_count_question(question):
        return None

    by_status = _counter(projects, "status")
    active_count = sum(
        1 for project in projects
        if str(project.get("status") or "").lower() in {"active", "ongoing", "normal", "running", "在建", "进行中"}
    )
    lines = [f"当前权限范围内共有 {len(projects)} 个项目。"]
    if by_status:
        lines.append("按状态统计：" + "、".join(f"{key} {value} 个" for key, value in by_status.items()) + "。")
    if active_count:
        lines.append(f"其中在建/启用项目约 {active_count} 个。")
    sample_names = [
        project.get("name") or project.get("project") or project.get("project_name")
        for project in projects[:10]
    ]
    sample_names = [name for name in sample_names if name]
    if sample_names:
        lines.append("项目示例：" + "、".join(sample_names) + (" 等。" if len(projects) > len(sample_names) else "。"))
    lines.append(f"依据：project 模块查询到 {len(projects)} 条当前权限范围内项目记录。")
    return "\n".join(lines)


def _is_org_question(question: str) -> bool:
    q = question or ""
    if any(word in q for word in ("多少", "几个", "几家", "数量", "总数")) and not any(
        word in q for word in ("组织架构", "组织结构", "架构", "层级")
    ):
        return False
    return any(word in q for word in ("组织架构", "组织结构", "架构", "层级", "集团", "分公司")) and not any(
        word in q for word in ("视频", "设备", "告警", "报警", "考勤")
    )


def _load_named_collection(mongo_db, names, limit=500):
    collection_name = _find_existing_collection(mongo_db, names)
    if not collection_name:
        return []
    return _read_collection(mongo_db, collection_name, limit)


def _load_registered_dataset(module: str, user: dict, mongo_db, preloaded: dict | None = None) -> list[dict]:
    if preloaded and module in preloaded:
        return preloaded[module]
    config = DATASET_REGISTRY.get(module)
    if not config:
        return []
    docs = _load_named_collection(mongo_db, config["collections"], limit=1000)
    return _apply_scope(module, docs, user)


def _execute_ai_query_plan(question: str, user: dict, mongo_db, preloaded: dict | None = None) -> dict:
    plan = _build_ai_query_plan(question)
    tokens = _tokens(question)
    module_results = {}
    direct_answer = None

    for module in plan["modules"]:
        config = DATASET_REGISTRY.get(module)
        if not config:
            continue
        items = _load_registered_dataset(module, user, mongo_db, preloaded)
        filtered = items if plan["intent"] in {"count", "stats"} else _filter_by_question_tokens(items, tokens)
        if plan["intent"] == "latest":
            filtered = sorted(
                filtered,
                key=lambda item: _item_time_by_fields(item, config.get("time_fields", ())),
                reverse=True,
            )
        records = filtered[: plan["limit"]]
        module_results[module] = {
            "total": len(items),
            "matched": len(filtered),
            "records": _sample(records, plan["limit"]),
        }
        if module == plan["primary_module"] and plan.get("confidence") == "high":
            direct_answer = _format_plan_answer(plan, module, items, filtered)

    return {
        "plan": plan,
        "module_results": module_results,
        "direct_answer": direct_answer,
    }


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


def _is_project_team_violation_question(question: str) -> bool:
    q = question or ""
    has_project = any(word in q for word in ("当前项目", "项目", "工地", "工程"))
    has_team = any(word in q for word in ("工队", "队伍", "班组", "施工队", "作业队"))
    has_violation = any(word in q for word in ("违规", "违章", "告警", "报警", "风险", "隐患"))
    return has_project and has_team and has_violation


def _project_identity(project: dict) -> set[str]:
    values = set()
    for field in ("id", "project_id", "projectId", "name", "project", "project_name"):
        value = _text(project.get(field))
        if value:
            values.add(value)
    return values


def _belongs_to_project(item: dict, project: dict) -> bool:
    project_values = _project_identity(project)
    if not project_values:
        return False
    for field in ("project_id", "projectId", "project", "project_name", "name"):
        if _text(item.get(field)) in project_values:
            return True
    return False


def _item_team_name(item: dict) -> str:
    return next(
        (
            _text(item.get(field))
            for field in ("team_name", "team", "workTeam", "work_team", "team_id", "teamId", "unit_name", "name")
            if _text(item.get(field))
        ),
        "未分配工队",
    )


def _alarm_project_team_answer(project: dict, teams: list[dict], alarms: list[dict]) -> str:
    project_name = project.get("name") or project.get("project") or project.get("project_name") or f"项目{project.get('id')}"
    project_teams = [team for team in teams if _belongs_to_project(team, project)]
    project_alarms = [alarm for alarm in alarms if _belongs_to_project(alarm, project)]
    team_names = sorted({name for team in project_teams if (name := _item_team_name(team)) and name != "未分配工队"})

    alarm_team_counter = Counter(_item_team_name(alarm) for alarm in project_alarms)
    if not team_names:
        team_names = sorted(name for name in alarm_team_counter if name != "未分配工队")

    lines = [
        f"当前项目「{project_name}」共有 {len(team_names)} 个工队，违规/告警共 {len(project_alarms)} 起。"
    ]
    if team_names:
        lines.append("工队：" + "、".join(team_names[:20]) + (" 等" if len(team_names) > 20 else ""))
    if alarm_team_counter:
        top = "、".join(f"{name} {count} 起" for name, count in alarm_team_counter.most_common(10))
        lines.append(f"按工队统计：{top}。")
    lines.append(f"依据：project 1 条、team {len(project_teams)} 条、alarm_record {len(project_alarms)} 条当前权限范围内记录。")
    return "\n".join(lines)


def _project_team_violation_direct_answer(question: str, user: dict, projects: list[dict], teams: list[dict], alarms: list[dict]) -> str | None:
    if not _is_project_team_violation_question(question):
        return None
    if not projects:
        return "当前权限范围内没有查询到项目记录，因此无法统计项目工队和违规数量。"

    user_project_id = _text(user.get("project_id"))
    current_project = None
    if user_project_id:
        current_project = next((project for project in projects if user_project_id in _project_identity(project)), None)

    if current_project:
        return _alarm_project_team_answer(current_project, teams, alarms)

    total_teams = sorted({_item_team_name(team) for team in teams if _item_team_name(team) != "未分配工队"})
    lines = [f"当前权限范围内共有 {len(projects)} 个项目、{len(total_teams)} 个工队，违规/告警共 {len(alarms)} 起。"]
    for project in projects[:20]:
        project_name = project.get("name") or project.get("project") or project.get("project_name") or f"项目{project.get('id')}"
        p_team_names = {
            _item_team_name(team)
            for team in teams
            if _belongs_to_project(team, project) and _item_team_name(team) != "未分配工队"
        }
        p_alarm_count = sum(1 for alarm in alarms if _belongs_to_project(alarm, project))
        lines.append(f"- {project_name}：工队 {len(p_team_names)} 个，违规/告警 {p_alarm_count} 起")
    lines.append(f"依据：project {len(projects)} 条、team {len(teams)} 条、alarm_record {len(alarms)} 条当前权限范围内记录。")
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
    if module == "system_logs":
        return [
            doc for doc in docs
            if in_scope(
                doc,
                user,
                project_fields=("project_id", "project"),
                grid_fields=("grid_id", "grid"),
                team_fields=("team_id", "team"),
                branch_fields=("branch_id",),
                company_fields=("company", "department", "dept"),
                project_name_fields=("project",),
                team_name_fields=("team",),
            )
        ]
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
    system_logs = _apply_scope("system_logs", _load_named_collection(mongo_db, GENERAL_COLLECTIONS["system_logs"], limit=1000), user)
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
        "system_logs": system_logs,
    }
    generic_query = _execute_ai_query_plan(question, user, mongo_db, datasets)

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
        "video_devices": len(datasets["video_devices"]),
        "personnel": len(personnel),
            "attendance_records": len(attendance),
            "alarms": len(alarms),
            "grids": len(grids),
            "teams": len(teams),
            "work_types": len(work_types),
            "users": len(users),
            "system_logs": len(system_logs),
            "queryable_modules": len(universal["catalog"]),
        },
        "data_catalog": universal["catalog"],
        "modules": {},
        "matched_records": {},
        "global_matched_records": universal["matched"],
        "evidence": [],
        "ai_query_plan": generic_query["plan"],
        "ai_query_results": generic_query["module_results"],
        "direct_answer": _system_log_direct_answer(question, system_logs)
        or _video_device_count_direct_answer(question, user, projects, datasets["video_devices"])
        or _alarm_count_direct_answer(question, alarms)
        or _project_team_violation_direct_answer(question, user, projects, teams, alarms)
        or generic_query.get("direct_answer")
        or _project_count_direct_answer(question, projects)
        or _project_direct_answer(question, projects)
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
        elif module in {"devices", "video_devices"}:
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
        elif module == "system_logs":
            recent_logs = sorted(items, key=_log_time, reverse=True)[:20]
            module_data.update({
                "by_type": _counter(items, "target_type"),
                "by_action": _counter(items, "action"),
                "recent": [_safe_doc(log) for log in recent_logs],
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
