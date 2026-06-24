from typing import Iterable

from app.core.database import get_mongo_collection


ROLE_RANK = {
    "team_admin": 1,
    "grid_admin": 2,
    "project_safety_admin": 2,
    "branch_admin": 3,
    "headquarters_admin": 4,
}

LEVEL_TO_UNIT_TYPE = {
    "branch_admin": "branch",
    "project_safety_admin": "project",
    "grid_admin": "grid",
    "team_admin": "team",
}


def text(value) -> str:
    return str(value or "").strip()


def value_variants(value) -> list:
    raw = text(value)
    if not raw:
        return []
    variants = [raw]
    if raw.upper().startswith("BRANCH-"):
        suffix = raw.split("-", 1)[1]
        if suffix:
            variants.append(suffix)
            if suffix.isdigit():
                variants.append(int(suffix))
    if raw.isdigit():
        variants.append(int(raw))
    return list(dict.fromkeys(variants))


def is_hq(user: dict | None) -> bool:
    if not user:
        return False
    level = user.get("permission_level") or ""
    role = text(user.get("role")).upper()
    return level == "headquarters_admin" or role in {"HQ", "ADMIN"}


def user_level(user: dict | None) -> str:
    level = text((user or {}).get("permission_level")) or text((user or {}).get("responsibility_level"))
    return level or "project_safety_admin"


def _unit_id(doc: dict | None) -> str:
    if not doc:
        return ""
    return text(doc.get("unit_id") or doc.get("id") or doc.get("_id"))


def _unit_type(doc: dict | None) -> str:
    raw = text((doc or {}).get("type"))
    return {
        "division": "project",
        "workshop": "safety_office",
        "site": "grid",
        "subproject": "team",
    }.get(raw, raw)


def responsibility_unit_for_user(user: dict | None) -> dict | None:
    if not user:
        return None
    bound_id = text(
        user.get("responsibility_unit_id")
        or user.get("team_id")
        or user.get("grid_id")
        or user.get("project_id")
        or user.get("branch_id")
        or user.get("department_id")
    )
    level = user_level(user)
    expected_type = LEVEL_TO_UNIT_TYPE.get(level)
    collection = get_mongo_collection("responsibility_unit")

    queries = []
    if text(user.get("responsibility_unit_id")):
        queries.append({"unit_id": text(user.get("responsibility_unit_id"))})
    if bound_id:
        queries.append({"unit_id": bound_id})
        queries.append({"id": bound_id})
        if bound_id.isdigit():
            queries.append({"unit_id": int(bound_id)})
            queries.append({"id": int(bound_id)})
    name_by_type = {
        "branch": text(user.get("company") or user.get("department")),
        "project": text(user.get("project")),
        "grid": text(user.get("grid")),
        "team": text(user.get("team") or user.get("work_team")),
    }
    if expected_type and name_by_type.get(expected_type):
        queries.append({"type": expected_type, "name": name_by_type[expected_type]})

    for query in queries:
        doc = collection.find_one(query)
        if doc and (not expected_type or _unit_type(doc) == expected_type):
            return doc
    return None


def responsibility_descendant_ids(user: dict | None) -> dict[str, list[str]]:
    if user is not None:
        cache = user.setdefault("_scope_cache", {})
        if "responsibility_descendant_ids" in cache:
            return cache["responsibility_descendant_ids"]

    root = responsibility_unit_for_user(user)
    if not root:
        result = {"branch": [], "project": [], "grid": [], "team": []}
        if user is not None:
            user.setdefault("_scope_cache", {})["responsibility_descendant_ids"] = result
        return result

    collection = get_mongo_collection("responsibility_unit")
    pending = [_unit_id(root)]
    result = {"branch": [], "project": [], "grid": [], "team": []}
    seen = set()

    while pending:
        current_id = pending.pop(0)
        if current_id in seen:
            continue
        seen.add(current_id)
        doc = root if current_id == _unit_id(root) else collection.find_one({"unit_id": current_id})
        if doc:
            unit_type = _unit_type(doc)
            if unit_type in result:
                result[unit_type].append(_unit_id(doc))
                if unit_type == "project":
                    result[unit_type].extend(_normalize_list(doc.get("project_id")))
                elif unit_type == "grid":
                    result[unit_type].extend(_normalize_list(doc.get("grid_id")))
                elif unit_type == "team":
                    result[unit_type].extend(_normalize_list(doc.get("team_id")))
            pending.extend(_unit_id(child) for child in collection.find({"parent_id": current_id}, {"unit_id": 1}) if _unit_id(child))

    result = {key: list(dict.fromkeys(value)) for key, value in result.items()}
    if user is not None:
        user.setdefault("_scope_cache", {})["responsibility_descendant_ids"] = result
    return result


def _normalize_list(value) -> list[str]:
    if isinstance(value, list):
        return [text(item) for item in value if text(item)]
    single = text(value)
    return [single] if single else []


def direct_grid_ids_for_user(user: dict) -> list[str]:
    ids = _normalize_list(user.get("grid_ids") or user.get("gridIds"))
    ids.extend(_normalize_list(user.get("grid_id")))
    return list(dict.fromkeys(ids))


def direct_team_ids_for_user(user: dict) -> list[str]:
    ids = _normalize_list(user.get("team_id"))
    return list(dict.fromkeys(ids))


def branch_ids_for_user(user: dict) -> list:
    cache = user.setdefault("_scope_cache", {})
    if "branch_ids" in cache:
        return cache["branch_ids"]

    values = []
    for key in ("department_id", "branch_id"):
        values.extend(value_variants(user.get(key)))
        raw = text(user.get(key))
        if raw:
            values.append(f"BRANCH-{raw}")
    values.extend(responsibility_descendant_ids(user).get("branch", []))
    result = list(dict.fromkeys(values))
    cache["branch_ids"] = result
    return result


def project_ids_for_user(user: dict) -> list[str]:
    cache = user.setdefault("_scope_cache", {})
    if "project_ids" in cache:
        return cache["project_ids"]

    ids = []
    explicit = text(user.get("project_id"))
    if explicit:
        ids.append(explicit)

    tree_ids = responsibility_descendant_ids(user).get("project", [])
    ids.extend(tree_ids)

    if ids:
        result = list(dict.fromkeys(ids))
        cache["project_ids"] = result
        return result

    level = user_level(user)
    project_name = text(user.get("project"))
    query = None
    if project_name:
        query = {"name": project_name}
    elif level == "branch_admin" and branch_ids_for_user(user):
        query = {"branch_id": {"$in": branch_ids_for_user(user)}}

    if not query:
        cache["project_ids"] = []
        return []

    ids = []
    for collection_name in ("project", "projects", "sql_projects"):
        for doc in get_mongo_collection(collection_name).find(query, {"id": 1}):
            if text(doc.get("id")):
                ids.append(text(doc.get("id")))
    result = list(dict.fromkeys(ids))
    cache["project_ids"] = result
    return result


def grid_ids_for_user(user: dict) -> list[str]:
    cache = user.setdefault("_scope_cache", {})
    if "grid_ids" in cache:
        return cache["grid_ids"]

    ids = direct_grid_ids_for_user(user)
    ids.extend(responsibility_descendant_ids(user).get("grid", []))

    project_ids = project_ids_for_user(user)
    if project_ids:
        for grid in get_mongo_collection("grid").find({"project_id": {"$in": project_ids}}, {"grid_id": 1}):
            if text(grid.get("grid_id")):
                ids.append(text(grid.get("grid_id")))
        for unit in get_mongo_collection("responsibility_unit").find(
            {"project_id": {"$in": project_ids}, "type": "grid"},
            {"unit_id": 1, "grid_id": 1},
        ):
            ids.extend(_normalize_list(unit.get("grid_id")))
            ids.extend(_normalize_list(unit.get("unit_id")))

    result = list(dict.fromkeys(ids))
    cache["grid_ids"] = result
    return result


def team_ids_for_user(user: dict) -> list[str]:
    cache = user.setdefault("_scope_cache", {})
    if "team_ids" in cache:
        return cache["team_ids"]

    ids = direct_team_ids_for_user(user)
    ids.extend(responsibility_descendant_ids(user).get("team", []))
    team_name = text(user.get("team") or user.get("work_team"))
    query = {}
    if ids:
        result = list(dict.fromkeys(ids))
        cache["team_ids"] = result
        return result
    if team_name:
        query["name"] = team_name
    else:
        grid_ids = grid_ids_for_user(user)
        if grid_ids:
            query["grid_id"] = {"$in": grid_ids}
        else:
            project_ids = project_ids_for_user(user)
            if project_ids:
                query["project_id"] = {"$in": project_ids}
    if not query:
        cache["team_ids"] = []
        return []

    for team in get_mongo_collection("team").find(query, {"team_id": 1, "id": 1}):
        team_id = text(team.get("team_id") or team.get("id"))
        if team_id:
            ids.append(team_id)
    result = list(dict.fromkeys(ids))
    cache["team_ids"] = result
    return result


def _field_in_any(fields: Iterable[str], values: list) -> list[dict]:
    if not values:
        return []
    expanded = []
    for value in values:
        expanded.extend(value_variants(value))
    expanded = list(dict.fromkeys(expanded))
    return [{field: {"$in": expanded}} for field in fields]


def scope_filter(
    user: dict,
    *,
    project_fields: Iterable[str] = ("project_id",),
    grid_fields: Iterable[str] = ("grid_id",),
    team_fields: Iterable[str] = ("team_id",),
    branch_fields: Iterable[str] = ("branch_id",),
    company_fields: Iterable[str] = ("company", "department"),
    project_name_fields: Iterable[str] = ("project",),
    team_name_fields: Iterable[str] = ("team", "workTeam", "work_team"),
) -> dict:
    if is_hq(user):
        return {}

    level = user_level(user)
    clauses: list[dict] = []
    direct_grid_ids = direct_grid_ids_for_user(user)
    direct_team_ids = direct_team_ids_for_user(user)
    direct_team_name = text(user.get("team") or user.get("work_team"))

    # Explicit team binding is the narrowest scope.
    if direct_team_ids or (level == "team_admin" and direct_team_name):
        clauses.extend(_field_in_any(team_fields, direct_team_ids))
        clauses.extend(_field_in_any(team_name_fields, [direct_team_name] if direct_team_name else []))
        return clauses[0] if len(clauses) == 1 else {"$or": clauses} if clauses else {"_id": {"$exists": False}}

    # Grid/responsibility accounts with grid binding must not fall back to the
    # whole project just because their permission level is project_safety_admin.
    if direct_grid_ids and level in {"grid_admin"}:
        clauses.extend(_field_in_any(grid_fields, direct_grid_ids))
        clauses.extend(_field_in_any(team_fields, team_ids_for_user(user)))
        return clauses[0] if len(clauses) == 1 else {"$or": clauses} if clauses else {"_id": {"$exists": False}}

    if level == "branch_admin":
        branches = branch_ids_for_user(user)
        companies = [text(user.get("company") or user.get("department"))]
        clauses.extend(_field_in_any(branch_fields, branches))
        clauses.extend(_field_in_any(company_fields, [item for item in companies if item]))

        project_ids = project_ids_for_user(user)
        if project_ids:
            clauses.extend(_field_in_any(project_fields, project_ids))

    elif level == "project_safety_admin":
        project_ids = project_ids_for_user(user)
        project_name = text(user.get("project"))
        clauses.extend(_field_in_any(project_fields, project_ids))
        clauses.extend(_field_in_any(grid_fields, grid_ids_for_user(user)))
        clauses.extend(_field_in_any(team_fields, team_ids_for_user(user)))
        clauses.extend(_field_in_any(project_name_fields, [project_name] if project_name else []))

    elif level == "grid_admin":
        grid_ids = grid_ids_for_user(user)
        team_ids = team_ids_for_user(user)
        clauses.extend(_field_in_any(grid_fields, grid_ids))
        clauses.extend(_field_in_any(team_fields, team_ids))

    elif level == "team_admin":
        team_ids = team_ids_for_user(user)
        team_name = text(user.get("team") or user.get("work_team"))

        clauses.extend(_field_in_any(team_fields, team_ids))
        clauses.extend(_field_in_any(team_name_fields, [team_name] if team_name else []))

    else:
        return {"_id": {"$exists": False}}

    clauses = [clause for clause in clauses if clause]
    if not clauses:
        return {"_id": {"$exists": False}}
    return clauses[0] if len(clauses) == 1 else {"$or": clauses}


def merge_filters(*filters: dict | None) -> dict:
    clean = [item for item in filters if item]
    if not clean:
        return {}
    if len(clean) == 1:
        return clean[0]
    return {"$and": clean}


def _get_nested(doc: dict, field: str):
    current = doc
    for part in field.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _matches_field(value, condition) -> bool:
    if isinstance(condition, dict):
        if "$in" in condition:
            candidates = condition["$in"]
            if isinstance(value, list):
                return any(item in candidates or text(item) in [text(c) for c in candidates] for item in value)
            return value in candidates or text(value) in [text(c) for c in candidates]
        if "$exists" in condition:
            exists = value is not None
            return exists == bool(condition["$exists"])
    if isinstance(value, list):
        return condition in value or text(condition) in [text(item) for item in value]
    return value == condition or text(value) == text(condition)


def matches_query(doc: dict, query: dict) -> bool:
    for key, condition in query.items():
        if key == "$or":
            if not any(matches_query(doc, item) for item in condition):
                return False
            continue
        if key == "$and":
            if not all(matches_query(doc, item) for item in condition):
                return False
            continue
        if not _matches_field(_get_nested(doc, key), condition):
            return False
    return True


def in_scope(doc: dict | None, user: dict, **kwargs) -> bool:
    if not doc:
        return False
    if is_hq(user):
        return True

    query = scope_filter(user, **kwargs)
    if not query:
        return True
    if query == {"_id": {"$exists": False}}:
        return False
    return matches_query(doc, query)
