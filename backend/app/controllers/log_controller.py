from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.log_schema import LogOut, LogCreate
from app.services.log_service import LogService

router = APIRouter(prefix="/logs", tags=["System Logs"])
service = LogService()


@router.get("/", response_model=list[LogOut])
def get_logs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return service.get_logs(db, skip, limit)


@router.get("/{log_id}", response_model=LogOut)
def get_log(log_id: int, db: Session = Depends(get_db)):
    return service.get_log_by_id(db, log_id)


@router.post("/", response_model=LogOut)
def create_log(log: LogCreate, db: Session = Depends(get_db)):
    return service.create_log(db, log)
