from pymongo import MongoClient
from app.schemas.team_schema import TeamCreate, TeamUpdate
from app.utils.logger import get_logger
from datetime import datetime

client = MongoClient("mongodb://localhost:27017/")
db = client["platform"]
teams_collection = db["team"]
fences_collection = db["fence"]

logger = get_logger("TeamService")


class TeamService:
    def get_teams(self):
        """获取所有作业队"""
        teams = []
        for team in teams_collection.find():
            team["team_id"] = team.pop("id", None) or team.get("team_id")
            teams.append(team)
        return teams

    def get_team_by_id(self, team_id: str):
        """根据team_id获取作业队"""
        team = teams_collection.find_one({"team_id": team_id})
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
            "fence_ids": team_data.fence_ids or [],
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat()
        }

        result = teams_collection.insert_one(new_team)
        new_team["_id"] = str(result.inserted_id)

        logger.info(f"Created team: {new_team['name']} ({team_id})")
        return new_team

    def update_team(self, team_id: str, team_data: TeamUpdate):
        """更新作业队"""
        update_data = {}
        if team_data.name is not None:
            update_data["name"] = team_data.name
        if team_data.color is not None:
            update_data["color"] = team_data.color
        if team_data.company is not None:
            update_data["company"] = team_data.company
        if team_data.project is not None:
            update_data["project"] = team_data.project
        if team_data.fence_ids is not None:
            update_data["fence_ids"] = team_data.fence_ids

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

    def delete_team(self, team_id: str):
        """删除作业队"""
        result = teams_collection.delete_one({"team_id": team_id})
        logger.info(f"Deleted team: {team_id}")
        return result.deleted_count > 0

    def add_fence_to_team(self, team_id: str, fence_id: str):
        """添加围栏到作业队"""
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

    def remove_fence_from_team(self, team_id: str, fence_id: str):
        """从作业队移除围栏"""
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

    def get_teams_with_fences(self):
        """获取所有作业队及其关联的围栏详情"""
        teams = self.get_teams()
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