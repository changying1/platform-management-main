from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.schemas.log_schema import LogCreate, LogOut
from app.utils.logger import get_logger
from app.core.database import get_mongo_collection, get_next_sequence
from datetime import datetime

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
            company=doc.get("company"),
            project=doc.get("project"),
            team=doc.get("team"),
            extra=doc.get("extra"),
            time=doc.get("time", datetime.now())
        )

    def create_log(self, db: Session, log_create: LogCreate) -> LogOut:
        try:
            collection = self._log_collection()
            
            log_id = get_next_sequence("system_log_id")
            
            log_doc = {
                "id": log_id,
                "operator": log_create.operator,
                "action": log_create.action,
                "target_type": log_create.target_type,
                "target_name": log_create.target_name,
                "details": log_create.details,
                "company": log_create.company,
                "project": log_create.project,
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
            
            logs = list(collection.find().sort("time", -1).skip(skip).limit(limit))
            
            return [self._mongo_log_to_out(log) for log in logs]
            
        except Exception as e:
            logger.error(f"Error getting logs: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to get logs: {str(e)}")

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
