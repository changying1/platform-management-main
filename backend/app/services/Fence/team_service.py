from app.schemas.team_schema import TeamCreate, TeamUpdate
from app.core.data_scope import in_scope, merge_filters, project_ids_for_user, scope_filter, text, user_level
from app.core.database import get_compatible_mongo_db
from app.utils.logger import get_logger
from datetime import datetime

db = get_compatible_mongo_db("team")
teams_collection = db["team"]
fences_collection = db["fence"]
grids_collection = db["grid"]
project_collections = (db["project"], db["projects"], db["sql_projects"])

logger = get_logger("TeamService")


def _lookup_grid(grid_id: str) -> dict | None:
    grid_id = text(grid_id)
    if not grid_id:
        return None
    return grids_collection.find_one({
        "$or": [
            {"grid_id": grid_id},
            {"id": grid_id},
            {"unit_id": grid_id},
            {"name": grid_id},
        ]
    })


def _project_lookup_query(project_id: str) -> dict:
    project_id = text(project_id)
    values = [project_id]
    if project_id.isdigit():
        values.append(int(project_id))
    return {
        "$or": [
            {"id": {"$in": values}},
            {"project_id": {"$in": values}},
            {"unit_id": {"$in": values}},
            {"name": project_id},
            {"project_name": project_id},
        ]
    }


def _lookup_project(project_id: str) -> dict | None:
    project_id = text(project_id)
    if not project_id:
        return None
    for collection in project_collections:
        project = collection.find_one(_project_lookup_query(project_id))
        if project:
            return project
    return None


def _project_name(project: dict | None) -> str:
    if not project:
        return ""
    return text(project.get("name") or project.get("project_name"))


def _canonicalize_team_payload(payload: dict, *, existing: dict | None = None, require_project: bool = False) -> dict:
    effective = {**(existing or {}), **payload}
    project_id = text(effective.get("project_id"))
    grid_id = text(effective.get("grid_id"))

    grid = _lookup_grid(grid_id) if grid_id else None
    if grid_id and not grid:
        raise ValueError("所属网格不存在")

    grid_project_id = text(grid.get("project_id")) if grid else ""
    if grid and not grid_project_id:
        raise ValueError("所属网格未绑定项目，不能挂接工队")

    if project_id and grid_project_id and project_id != grid_project_id:
        raise ValueError("工队所属项目与网格所属项目不一致")
    if grid_project_id:
        project_id = grid_project_id

    if require_project and not project_id:
        raise ValueError("工队必须绑定所属项目")

    if project_id:
        payload["project_id"] = project_id
        project = _lookup_project(project_id)
        name = _project_name(project)
        if name:
            payload["project"] = name

    if grid_id:
        payload["grid_id"] = grid_id

    return payload


def _project_team_in_scope(team: dict | None, current_user: dict | None) -> bool:
    if not team or not current_user:
        return False

    project_ids = {text(value) for value in project_ids_for_user(current_user)}
    project_names = {text(current_user.get("project"))}
    project_names = {value for value in project_names if value}

    grid_id = text(team.get("grid_id"))
    grid_project_id = ""
    if grid_id:
        grid = _lookup_grid(grid_id)
        grid_project_id = text(grid.get("project_id")) if grid else ""

    team_project_id = text(team.get("project_id"))
    if team_project_id and grid_project_id and team_project_id != grid_project_id:
        return False

    if grid_project_id:
        if grid_project_id in project_ids:
            return True
        return False

    if team_project_id and team_project_id in project_ids:
        return True

    team_project_name = text(team.get("project"))
    if team_project_name and team_project_name in project_names:
        return True

    return False


def _team_in_scope(team: dict | None, current_user: dict | None) -> bool:
    if not current_user:
        return True
    if user_level(current_user) == "project_safety_admin":
        return _project_team_in_scope(team, current_user)
    return in_scope(
        team,
        current_user,
        project_fields=("project_id",),
        grid_fields=("grid_id",),
        team_fields=("team_id", "id"),
        branch_fields=(),
        company_fields=("company",),
        project_name_fields=("project",),
        team_name_fields=("name",),
    )


class TeamService:
    def get_teams(self, current_user: dict = None):
        """获取所有作业队"""
        teams = []
        filter_query = {}
        use_post_filter = current_user and user_level(current_user) == "project_safety_admin"
        if current_user and not use_post_filter:
            filter_query = scope_filter(
                current_user,
                project_fields=("project_id",),
                grid_fields=("grid_id",),
                team_fields=("team_id", "id"),
                branch_fields=(),
                company_fields=("company",),
                project_name_fields=("project",),
                team_name_fields=("name",),
            )

        for team in teams_collection.find(filter_query):
            if use_post_filter and not _project_team_in_scope(team, current_user):
                continue
            team["team_id"] = team.pop("id", None) or team.get("team_id")
            teams.append(team)
        return teams

    def get_team_by_id(self, team_id: str, current_user: dict = None):
        """根据team_id获取作业队"""
        team = teams_collection.find_one({"team_id": team_id})
        if current_user and not _team_in_scope(team, current_user):
            return None
        if team:
            team["team_id"] = team.pop("id", None) or team.get("team_id")
        return team

    def create_team(self, team_data: TeamCreate):
        """创建作业队"""
        team_id = f"team_{int(datetime.now().timestamp() * 1000)}"
        new_team = {
            "team_id": team_id,
            "name": team_data.name,
            "color": team_data.color,
            "company": team_data.company or "",
            "project": team_data.project or "",
            "project_id": team_data.project_id or "",
            "grid_id": team_data.grid_id or "",
            "fence_ids": team_data.fence_ids or [],
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat()
        }

        new_team = _canonicalize_team_payload(new_team, require_project=True)

        result = teams_collection.insert_one(new_team)
        new_team["_id"] = str(result.inserted_id)

        logger.info(f"Created team: {new_team['name']} ({team_id})")
        return new_team

    def update_team(self, team_id: str, team_data: TeamUpdate, current_user: dict = None):
        """更新作业队"""
        existing = teams_collection.find_one({"team_id": team_id})
        if current_user and not _team_in_scope(existing, current_user):
            return None

        update_data = {}
        if team_data.name is not None:
            update_data["name"] = team_data.name
        if team_data.color is not None:
            update_data["color"] = team_data.color
        if team_data.company is not None:
            update_data["company"] = team_data.company
        if team_data.project is not None:
            update_data["project"] = team_data.project
        if team_data.project_id is not None:
            update_data["project_id"] = team_data.project_id
        if team_data.grid_id is not None:
            update_data["grid_id"] = team_data.grid_id
        if team_data.fence_ids is not None:
            update_data["fence_ids"] = team_data.fence_ids

        update_data = _canonicalize_team_payload(update_data, existing=existing)
        update_data["updatedAt"] = datetime.now().isoformat()

        teams_collection.update_one(
            {"team_id": team_id},
            {"$set": update_data}
        )

        updated_team = teams_collection.find_one({"team_id": team_id})
        if updated_team:
            updated_team["team_id"] = updated_team.pop("id", None) or updated_team.get("team_id")

        logger.info(f"Updated team: {team_id}")
        return updated_team

    def delete_team(self, team_id: str, current_user: dict = None):
        """删除作业队"""
        existing = teams_collection.find_one({"team_id": team_id})
        if current_user and not _team_in_scope(existing, current_user):
            return False

        result = teams_collection.delete_one({"team_id": team_id})
        logger.info(f"Deleted team: {team_id}")
        return result.deleted_count > 0

    def add_fence_to_team(self, team_id: str, fence_id: str, current_user: dict = None):
        """添加围栏到作业队"""
        existing = teams_collection.find_one({"team_id": team_id})
        if current_user and not _team_in_scope(existing, current_user):
            return None

        teams_collection.update_one(
            {"team_id": team_id},
            {
                "$addToSet": {"fence_ids": fence_id},
                "$set": {"updatedAt": datetime.now().isoformat()}
            }
        )
        updated_team = teams_collection.find_one({"team_id": team_id})
        if updated_team:
            updated_team["team_id"] = updated_team.pop("id", None) or updated_team.get("team_id")
        logger.info(f"Added fence {fence_id} to team {team_id}")
        return updated_team

    def remove_fence_from_team(self, team_id: str, fence_id: str, current_user: dict = None):
        """从作业队移除围栏"""
        existing = teams_collection.find_one({"team_id": team_id})
        if current_user and not _team_in_scope(existing, current_user):
            return None

        teams_collection.update_one(
            {"team_id": team_id},
            {
                "$pull": {"fence_ids": fence_id},
                "$set": {"updatedAt": datetime.now().isoformat()}
            }
        )
        updated_team = teams_collection.find_one({"team_id": team_id})
        if updated_team:
            updated_team["team_id"] = updated_team.pop("id", None) or updated_team.get("team_id")
        logger.info(f"Removed fence {fence_id} from team {team_id}")
        return updated_team

    def get_teams_with_fences(self, current_user: dict = None):
        """获取所有作业队及其关联的围栏详情"""
        teams = self.get_teams(current_user=current_user)
        result = []

        for team in teams:
            fence_ids = team.get("fence_ids", [])
            fences = []

            for fence_id in fence_ids:
                fence = fences_collection.find_one({"fence_id": fence_id})
                if fence:
                    fence_item = {
                        "id": fence.get("fence_id"),
                        "name": fence.get("name"),
                        "company": fence.get("company"),
                        "project": fence.get("project"),
                        "type": fence.get("shape", "").capitalize(),
                        "behavior": fence.get("behavior"),
                        "severity": fence.get("severity"),
                        "schedule": fence.get("schedule"),
                        "center": fence.get("geometry", {}).get("center"),
                        "radius": fence.get("geometry", {}).get("radius"),
                        "points": fence.get("geometry", {}).get("points"),
                        "createdAt": fence.get("createdAt"),
                        "updatedAt": fence.get("updatedAt")
                    }
                    fences.append(fence_item)

            team["fences"] = fences
            result.append(team)

        return result


team_service = TeamService()
