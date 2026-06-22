from fastapi import APIRouter, Depends, HTTPException, Response, Body
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.log_schema import LogOut, LogCreate
from app.services.log_service import LogService
from app.utils.config_manager import get_log_export_encoding

router = APIRouter(prefix="/logs", tags=["System Logs"])
service = LogService()


@router.get("/", response_model=list[LogOut])
def get_logs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    return service.get_logs(db, skip, limit, current_user=current_user)


@router.get("/export/csv")
def export_logs(skip: int = 0, limit: int = 10000, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    csv_text = service.export_logs_csv(db, skip=skip, limit=limit, current_user=current_user)
    encoding = get_log_export_encoding()
    content = csv_text.encode(encoding, errors="replace")
    filename = "system_logs.csv"
    return Response(
        content=content,
        media_type=f"text/csv; charset={encoding}",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{log_id}", response_model=LogOut)
def get_log(log_id: int, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    return service.get_log_by_id(db, log_id, current_user=current_user)


@router.post("/", response_model=LogOut)
def create_log(log: LogCreate, db: Session = Depends(get_db)):
    return service.create_log(db, log)


@router.post("/frontend-error")
def report_frontend_error(payload: dict = Body(...)):
    return {"success": service.report_frontend_error(payload)}
