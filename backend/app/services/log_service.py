from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.schemas.log_schema import LogCreate, LogOut
from app.utils.logger import get_logger
from app.core.database import get_mongo_collection, get_next_sequence
from app.core.data_scope import (
    branch_ids_for_user,
    grid_ids_for_user,
    is_hq,
    matches_query,
    project_ids_for_user,
    team_ids_for_user,
    text,
    user_level,
    value_variants,
)
from datetime import datetime
from datetime import timedelta
from app.utils.config_manager import (
    get_log_auto_clean_enabled,
    get_log_auto_compress_enabled,
    get_log_category_enabled,
    get_log_diff_enabled,
    get_log_error_report_enabled,
    get_log_level_filter,
    get_log_retention_days,
)

logger = get_logger("LogService")

ROLE_RANK = {
    "team_admin": 1,
    "grid_admin": 2,
    "project_safety_admin": 3,
    "branch_admin": 4,
    "headquarters_admin": 5,
}

class LogService:
    def _log_collection(self):
        return get_mongo_collection("system_log", same_db_as="fence")

    def _mongo_log_to_out(self, doc: dict) -> LogOut:
        return LogOut(
            id=doc.get("id"),
            operator=doc.get("operator"),
            action=doc.get("action"),
            target_type=doc.get("target_type"),
            target_name=doc.get("target_name"),
            details=doc.get("details"),
            level=doc.get("level") or "info",
            company=doc.get("company"),
            project=doc.get("project"),
            grid=doc.get("grid"),
            team=doc.get("team"),
            extra=doc.get("extra"),
            time=doc.get("time", datetime.now())
        )

    def _normalize_level(self, level: str | None, action: str | None = None) -> str:
        value = str(level or "").lower()
        if value in {"error", "warning", "info"}:
            return value
        text = str(action or "")
        if "失败" in text or "异常" in text or "错误" in text:
            return "error"
        if "告警" in text or "删除" in text:
            return "warning"
        return "info"

    def _cleanup_expired_logs(self):
        if get_log_auto_compress_enabled():
            self._compress_old_logs()
        if not get_log_auto_clean_enabled():
            return
        cutoff = datetime.now() - timedelta(days=get_log_retention_days())
        self._log_collection().delete_many({"time": {"$lt": cutoff}})

    def _compress_old_logs(self):
        import csv
        import os
        import zipfile

        cutoff = datetime.now() - timedelta(days=7)
        docs = list(self._log_collection().find({"time": {"$lt": cutoff}, "compressed": {"$ne": True}}).limit(5000))
        if not docs:
            return
        archive_dir = os.path.join(os.getcwd(), "storage", "log_archives")
        os.makedirs(archive_dir, exist_ok=True)
        archive_path = os.path.join(archive_dir, f"system_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip")
        csv_name = "system_logs.csv"
        temp_csv = os.path.join(archive_dir, csv_name)
        with open(temp_csv, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["id", "time", "level", "target_type", "operator", "action", "target_name", "details"])
            for doc in docs:
                writer.writerow([
                    doc.get("id"),
                    doc.get("time"),
                    doc.get("level"),
                    doc.get("target_type"),
                    doc.get("operator"),
                    doc.get("action"),
                    doc.get("target_name"),
                    doc.get("details") or "",
                ])
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(temp_csv, arcname=csv_name)
        try:
            os.remove(temp_csv)
        except OSError:
            pass
        self._log_collection().update_many(
            {"_id": {"$in": [doc["_id"] for doc in docs]}},
            {"$set": {"compressed": True, "archive_path": archive_path}},
        )

    def _level_query(self) -> dict:
        configured = get_log_level_filter()
        if configured == "error":
            return {"level": "error"}
        if configured == "warning":
            return {"level": {"$in": ["warning", "error"]}}
        return {}

    def _values(self, *values) -> list:
        result = []
        for value in values:
            if isinstance(value, list):
                for item in value:
                    result.extend(value_variants(item))
                    if text(item):
                        result.append(text(item))
            else:
                result.extend(value_variants(value))
                if text(value):
                    result.append(text(value))
        return list(dict.fromkeys([item for item in result if text(item)]))

    def _operator_scope_query(self, current_user: dict) -> dict | None:
        current_level = user_level(current_user)
        current_rank = ROLE_RANK.get(current_level, 0)
        visible_operators = []
        for account in get_mongo_collection("users").find({}, {"_id": 0}):
            target_level = self._account_level(account)
            target_rank = ROLE_RANK.get(target_level, 0)
            if target_rank > current_rank:
                continue
            if self._account_in_scope(account, current_user):
                visible_operators.extend(
                    self._values(
                        account.get("username"),
                        account.get("full_name"),
                        account.get("name"),
                    )
                )
        if not visible_operators:
            return None
        return {"operator": {"$in": visible_operators}}

    def _account_level(self, account: dict) -> str:
        permission_level = text(account.get("permission_level"))
        if permission_level:
            return permission_level
        responsibility_level = text(account.get("responsibility_level") or account.get("responsibilityLevel"))
        mapped = {
            "branch": "branch_admin",
            "project": "project_safety_admin",
            "grid": "grid_admin",
            "team": "team_admin",
        }.get(responsibility_level)
        if mapped:
            return mapped
        role = text(account.get("role")).upper()
        if role in {"HQ", "ADMIN", "HEADQUARTERS_ADMIN"} or account.get("username") == "admin":
            return "headquarters_admin"
        if role in {"BRANCH", "BRANCH_ADMIN"}:
            return "branch_admin"
        if role in {"PROJECT", "PROJECT_SAFETY_ADMIN"}:
            return "project_safety_admin"
        if role in {"GRID", "GRID_ADMIN"}:
            return "grid_admin"
        if role in {"TEAM", "TEAM_ADMIN"}:
            return "team_admin"
        return "project_safety_admin"

    def _account_in_scope(self, account: dict, current_user: dict) -> bool:
        if text(account.get("username")) == text(current_user.get("username")):
            return True
        level = user_level(current_user)
        branch_values = self._values(account.get("department_id"), account.get("branch_id"))
        account_companies = self._values(account.get("company"), account.get("department"))
        current_companies = self._values(current_user.get("company"), current_user.get("department"))
        branch_match = bool(set(branch_values).intersection(self._values(*branch_ids_for_user(current_user)))) or bool(
            set(account_companies).intersection(current_companies)
        )

        if level == "branch_admin":
            return branch_match

        project_match = bool(set(self._values(account.get("project_id"))).intersection(self._values(*project_ids_for_user(current_user)))) or bool(
            set(self._values(account.get("project"))).intersection(self._values(current_user.get("project")))
        )
        if level == "project_safety_admin":
            return branch_match and project_match

        grid_match = bool(set(self._values(account.get("grid_id"), account.get("grid_ids"))).intersection(self._values(*grid_ids_for_user(current_user))))
        if level == "grid_admin":
            return branch_match and project_match and grid_match

        team_match = bool(set(self._values(account.get("team_id"))).intersection(self._values(*team_ids_for_user(current_user)))) or bool(
            set(self._values(account.get("team"), account.get("work_team"))).intersection(self._values(current_user.get("team"), current_user.get("work_team")))
        )
        if level == "team_admin":
            return branch_match and project_match and team_match

        return False

    def _scope_query(self, current_user: dict | None) -> dict:
        if not current_user or is_hq(current_user):
            return {}

        operator_query = self._operator_scope_query(current_user)
        if not operator_query:
            return {"_id": {"$exists": False}}

        clauses = []
        branch_values = self._values(*branch_ids_for_user(current_user))
        company_values = self._values(current_user.get("company"), current_user.get("department"))
        project_values = self._values(*project_ids_for_user(current_user), current_user.get("project"))
        grid_values = self._values(*grid_ids_for_user(current_user), current_user.get("grid_id"))
        team_values = self._values(*team_ids_for_user(current_user), current_user.get("team"), current_user.get("work_team"))

        if branch_values:
            clauses.extend([
                {"branch_id": {"$in": branch_values}},
                {"department_id": {"$in": branch_values}},
                {"extra.branch_id": {"$in": branch_values}},
                {"extra.after.branch_id": {"$in": branch_values}},
                {"extra.before.branch_id": {"$in": branch_values}},
            ])
        if company_values:
            clauses.extend([
                {"company": {"$in": company_values}},
                {"extra.company": {"$in": company_values}},
                {"extra.after.company": {"$in": company_values}},
                {"extra.before.company": {"$in": company_values}},
                {"extra.after.department": {"$in": company_values}},
                {"extra.before.department": {"$in": company_values}},
            ])
        if project_values:
            clauses.extend([
                {"project": {"$in": project_values}},
                {"project_id": {"$in": project_values}},
                {"extra.project": {"$in": project_values}},
                {"extra.project_id": {"$in": project_values}},
                {"extra.after.project": {"$in": project_values}},
                {"extra.before.project": {"$in": project_values}},
                {"extra.after.project_id": {"$in": project_values}},
                {"extra.before.project_id": {"$in": project_values}},
            ])
        if grid_values:
            clauses.extend([
                {"grid": {"$in": grid_values}},
                {"grid_id": {"$in": grid_values}},
                {"extra.grid": {"$in": grid_values}},
                {"extra.grid_id": {"$in": grid_values}},
                {"extra.after.grid_id": {"$in": grid_values}},
                {"extra.before.grid_id": {"$in": grid_values}},
            ])
        if team_values:
            clauses.extend([
                {"team": {"$in": team_values}},
                {"team_id": {"$in": team_values}},
                {"extra.team": {"$in": team_values}},
                {"extra.team_id": {"$in": team_values}},
                {"extra.after.team_id": {"$in": team_values}},
                {"extra.before.team_id": {"$in": team_values}},
                {"extra.after.team": {"$in": team_values}},
                {"extra.before.team": {"$in": team_values}},
                {"extra.after.work_team": {"$in": team_values}},
                {"extra.before.work_team": {"$in": team_values}},
            ])

        if not clauses:
            return operator_query

        return {"$and": [operator_query, {"$or": clauses + [operator_query]}]}

    def _query_for_user(self, current_user: dict | None) -> dict:
        filters = [self._level_query()]
        scope_query = self._scope_query(current_user)
        if scope_query:
            filters.append(scope_query)
        filters = [item for item in filters if item]
        if not filters:
            return {}
        if len(filters) == 1:
            return filters[0]
        return {"$and": filters}

    def create_log(self, db: Session, log_create: LogCreate) -> LogOut:
        try:
            collection = self._log_collection()
            target_type = str(log_create.target_type or "").lower()
            if not get_log_category_enabled(target_type):
                return LogOut(
                    id=0,
                    operator=log_create.operator,
                    action=log_create.action,
                    target_type=log_create.target_type,
                    target_name=log_create.target_name,
                    details=log_create.details,
                    level=self._normalize_level(log_create.level, log_create.action),
                    company=log_create.company,
                    project=log_create.project,
                    grid=log_create.grid,
                    team=log_create.team,
                    extra=log_create.extra,
                    time=datetime.now(),
                )
            
            log_id = get_next_sequence("system_log_id")
            level = self._normalize_level(log_create.level, log_create.action)
            
            log_doc = {
                "id": log_id,
                "operator": log_create.operator,
                "action": log_create.action,
                "target_type": log_create.target_type,
                "target_name": log_create.target_name,
                "details": log_create.details,
                "level": level,
                "company": log_create.company,
                "project": log_create.project,
                "grid": log_create.grid,
                "team": log_create.team,
                "extra": log_create.extra if get_log_diff_enabled() else self._strip_diff_extra(log_create.extra),
                "time": datetime.now()
            }
            
            result = collection.insert_one(log_doc)
            
            if not result.inserted_id:
                raise HTTPException(status_code=500, detail="Failed to create log")
            
            return self._mongo_log_to_out(log_doc)
            
        except Exception as e:
            logger.error(f"Error creating log: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to create log: {str(e)}")

    def _strip_diff_extra(self, extra):
        if not isinstance(extra, dict):
            return extra
        return {k: v for k, v in extra.items() if k not in {"before", "after", "diff", "changes"}}

    def report_frontend_error(self, payload: dict) -> bool:
        if not get_log_error_report_enabled():
            return False
        collection = self._log_collection()
        log_id = get_next_sequence("system_log_id")
        doc = {
            "id": log_id,
            "operator": payload.get("operator") or "frontend",
            "action": "前端异常自动上报",
            "target_type": "system",
            "target_name": payload.get("source") or "frontend",
            "details": payload.get("message") or payload.get("error") or "",
            "level": "error",
            "extra": payload,
            "time": datetime.now(),
        }
        collection.insert_one(doc)
        return True

    def get_logs(self, db: Session, skip: int = 0, limit: int = 100, current_user: dict | None = None) -> list[LogOut]:
        try:
            collection = self._log_collection()
            self._cleanup_expired_logs()

            logs = list(collection.find(self._query_for_user(current_user)).sort("time", -1).skip(skip).limit(limit))
            
            return [self._mongo_log_to_out(log) for log in logs]
            
        except Exception as e:
            logger.error(f"Error getting logs: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to get logs: {str(e)}")

    def export_logs_csv(self, db: Session, skip: int = 0, limit: int = 10000, current_user: dict | None = None) -> str:
        import csv
        import io

        logs = self.get_logs(db, skip=skip, limit=limit, current_user=current_user)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "时间", "级别", "分类", "操作人", "动作", "对象", "详情", "公司", "项目", "网格", "班组"])
        for log in logs:
            writer.writerow([
                log.id,
                log.time.isoformat() if hasattr(log.time, "isoformat") else log.time,
                log.level,
                log.target_type,
                log.operator,
                log.action,
                log.target_name,
                log.details or "",
                log.company or "",
                log.project or "",
                log.grid or "",
                log.team or "",
            ])
        return output.getvalue()

    def get_log_by_id(self, db: Session, log_id: int, current_user: dict | None = None) -> LogOut:
        try:
            collection = self._log_collection()
            
            log = collection.find_one({"id": log_id})
            
            if not log:
                raise HTTPException(status_code=404, detail="Log not found")
            query = self._query_for_user(current_user)
            if query and not matches_query(log, query):
                raise HTTPException(status_code=404, detail="Log not found")
            
            return self._mongo_log_to_out(log)
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting log by id: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to get log: {str(e)}")

_log_service_instance = LogService()

def get_log_service() -> LogService:
    return _log_service_instance
