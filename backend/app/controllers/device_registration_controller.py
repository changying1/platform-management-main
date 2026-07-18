from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.device_registration_schema import CameraRegistrationRequest, CameraRegistrationResponse
from app.services.audit_log_service import write_audit_log
from app.services.device_registration.device_registration_service import DeviceRegistrationService
from app.utils.logger import get_logger


router = APIRouter(prefix="/device-registration", tags=["Device Registration"])
service = DeviceRegistrationService()
logger = get_logger("DeviceRegistrationController")


def _default_scope_fields(current_user: dict) -> dict:
    return {
        "branch_id": current_user.get("branch_id") or current_user.get("department_id"),
        "project_id": current_user.get("project_id"),
        "grid_id": current_user.get("grid_id"),
        "team_id": current_user.get("team_id"),
        "company": current_user.get("company") or current_user.get("department"),
        "project": current_user.get("project"),
        "team": current_user.get("team") or current_user.get("work_team"),
    }


def _apply_default_scope(request: CameraRegistrationRequest, current_user: dict) -> CameraRegistrationRequest:
    data = request.model_dump()
    for key, value in _default_scope_fields(current_user).items():
        if data.get(key) in [None, ""] and value not in [None, ""]:
            data[key] = value
    return CameraRegistrationRequest(**data)


def _audit_after(result: CameraRegistrationResponse, request: CameraRegistrationRequest) -> dict:
    return {
        "video_id": result.video_id,
        "name": request.name,
        "device_serial": request.device_serial,
        "sim_card_id": request.sim_card_id,
        "local_status": result.local.status,
        "local_message": result.local.message,
        "ezviz_status": result.ezviz.status,
        "ezviz_message": result.ezviz.message,
        "hikiot_status": result.hikiot.status,
        "hikiot_message": result.hikiot.message,
    }


@router.post("/cameras", response_model=CameraRegistrationResponse)
def create_and_register_camera(
    request: CameraRegistrationRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    scoped_request = _apply_default_scope(request, current_user)
    result = service.create_and_register(
        db,
        scoped_request,
        scope_fields=_default_scope_fields(current_user),
    )

    write_audit_log(
        current_user=current_user,
        action="添加摄像头并注册外部平台",
        target_type="device",
        target_name=scoped_request.name or scoped_request.device_serial,
        after=_audit_after(result, scoped_request),
        details=(
            f"本地系统：{result.local.message}；"
            f"萤石云：{result.ezviz.message}；"
            f"海康流量卡：{result.hikiot.message}"
        ),
        company=scoped_request.company,
        project=scoped_request.project,
        grid=scoped_request.grid,
        team=scoped_request.team,
        level="warning" if result.partial_success or not result.success else "info",
    )

    if result.local.status == "failed":
        status_code = 400 if "已存在" in result.local.message or "已绑定" in result.local.message else 500
        raise HTTPException(status_code=status_code, detail=result.model_dump())

    return result
