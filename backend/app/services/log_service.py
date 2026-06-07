from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.schemas.log_schema import LogCreate, LogOut
from app.utils.logger import get_logger
from app.core.database import get_mongo_collection, get_next_sequence
from datetime import datetime
from datetime import timedelta
from app.utils.config_manager import (
    get_log_auto_clean_enabled,
    get_log_category_enabled,
    get_log_level_filter,
    get_log_retention_days,
)

logger = get_logger("LogService")

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
        if not get_log_auto_clean_enabled():
            return
        cutoff = datetime.now() - timedelta(days=get_log_retention_days())
        self._log_collection().delete_many({"time": {"$lt": cutoff}})

    def _level_query(self) -> dict:
        configured = get_log_level_filter()
        if configured == "error":
            return {"level": "error"}
        if configured == "warning":
            return {"level": {"$in": ["warning", "error"]}}
        return {}

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
                "extra": log_create.extra,
                "time": datetime.now()
            }
            
            result = collection.insert_one(log_doc)
            
            if not result.inserted_id:
                raise HTTPException(status_code=500, detail="Failed to create log")
            
            return self._mongo_log_to_out(log_doc)
            
        except Exception as e:
            logger.error(f"Error creating log: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to create log: {str(e)}")

    def get_logs(self, db: Session, skip: int = 0, limit: int = 100) -> list[LogOut]:
        try:
            collection = self._log_collection()
            self._cleanup_expired_logs()
            
            logs = list(collection.find(self._level_query()).sort("time", -1).skip(skip).limit(limit))
            
            return [self._mongo_log_to_out(log) for log in logs]
            
        except Exception as e:
            logger.error(f"Error getting logs: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to get logs: {str(e)}")

    def export_logs_csv(self, db: Session, skip: int = 0, limit: int = 10000) -> str:
        import csv
        import io

        logs = self.get_logs(db, skip=skip, limit=limit)
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

    def get_log_by_id(self, db: Session, log_id: int) -> LogOut:
        try:
            collection = self._log_collection()
            
            log = collection.find_one({"id": log_id})
            
            if not log:
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
