from __future__ import annotations

from typing import Any, Optional

from app.repositories.device_registration_repository import DeviceRegistrationRepository
from app.schemas.device_registration_schema import (
    CameraRegistrationRequest,
    CameraRegistrationResponse,
    RegistrationStepResult,
)
from app.schemas.video_schema import VideoCreate
from app.services.device_registration.ezviz_registration_service import EzvizRegistrationService
from app.services.device_registration.hikiot_registration_service import HikiotRegistrationService
from app.services.video_service import VideoService
from app.utils.logger import get_logger


logger = get_logger("DeviceRegistrationService")


class DeviceRegistrationService:
    def __init__(
        self,
        video_service: VideoService | None = None,
        ezviz_service: EzvizRegistrationService | None = None,
        hikiot_service: HikiotRegistrationService | None = None,
        repository: DeviceRegistrationRepository | None = None,
    ):
        self.video_service = video_service or VideoService()
        self.ezviz_service = ezviz_service or EzvizRegistrationService(self.video_service)
        self.hikiot_service = hikiot_service or HikiotRegistrationService(self.video_service)
        self.repository = repository or DeviceRegistrationRepository()

    def _collection(self):
        return self.video_service._video_collection()

    @staticmethod
    def _video_id(created: Any) -> Optional[str]:
        if created is None:
            return None
        if isinstance(created, dict):
            value = created.get("id")
        elif hasattr(created, "id"):
            value = getattr(created, "id")
        elif hasattr(created, "model_dump"):
            value = created.model_dump().get("id")
        else:
            value = None
        return str(value) if value is not None else None

    def _serial_exists(self, device_serial: Optional[str]) -> bool:
        if not device_serial:
            return False
        return bool(self._collection().find_one({"device_serial": device_serial}, {"_id": 1}))

    def _sim_used_by_other(self, sim_card_id: Optional[str]) -> bool:
        if not sim_card_id:
            return False
        return bool(self._collection().find_one({"sim_card_id": sim_card_id}, {"_id": 1}))

    def _local_failed_response(self, message: str) -> CameraRegistrationResponse:
        return CameraRegistrationResponse(
            success=False,
            partial_success=False,
            local=RegistrationStepResult(status="failed", success=False, message=message),
            ezviz=RegistrationStepResult(
                status="skipped",
                success=False,
                message="本地保存失败，未执行萤石云注册",
            ),
            hikiot=RegistrationStepResult(
                status="skipped",
                success=False,
                message="本地保存失败，未执行海康注册",
            ),
        )

    def _build_video_create(self, request: CameraRegistrationRequest) -> VideoCreate:
        channel_no = request.channel_no or 1
        rtsp_url = (
            f"rtsp://ezopen://open.ys7.com/{request.device_serial}/{channel_no}"
            if request.device_serial
            else None
        )
        return VideoCreate(
            name=request.name,
            device_serial=request.device_serial,
            password=request.camera_password,
            sim_card_id=request.sim_card_id,
            channel_no=channel_no,
            device_type=request.device_type or "dome",
            status="offline",
            platform_type="ezviz",
            access_source="cloud",
            ptz_source="ezviz",
            stream_protocol="ezopen",
            rtsp_url=rtsp_url,
            remark=request.remark or request.location,
            company=request.company,
            branch_id=request.branch_id,
            project=request.project,
            project_id=request.project_id,
            grid=request.grid,
            grid_id=request.grid_id,
            team=request.team,
            team_id=request.team_id,
            username=request.username,
        )

    def create_and_register(
        self,
        mongo_db,
        request: CameraRegistrationRequest,
        scope_fields: dict | None = None,
    ) -> CameraRegistrationResponse:
        device_serial = request.device_serial
        sim_card_id = request.sim_card_id

        if self._serial_exists(device_serial):
            return self._local_failed_response("该设备序列号已存在于本地系统")
        if self._sim_used_by_other(sim_card_id):
            return self._local_failed_response("该 SIM 卡号已绑定其他摄像头")

        try:
            created = self.video_service.create_video(
                mongo_db,
                self._build_video_create(request),
                scope_fields=scope_fields,
            )
            video_id = self._video_id(created)
            local_result = RegistrationStepResult(status="success", success=True, message="本地保存成功")
        except Exception as exc:
            logger.warning("Local camera save failed serial=%s: %s", device_serial, exc)
            return self._local_failed_response(f"本地保存失败：{exc}")

        if device_serial:
            ezviz_result = self.ezviz_service.register_device(device_serial, request.camera_password or "")
        else:
            ezviz_result = RegistrationStepResult(
                status="skipped",
                success=True,
                message="未填写设备序列号，已跳过萤石云注册",
            )
        if sim_card_id:
            hikiot_result = self.hikiot_service.register_sim_card(iccid=sim_card_id, remark=device_serial or request.name)
        else:
            hikiot_result = RegistrationStepResult(
                status="skipped",
                success=True,
                message="未填写 SIM 卡号，已跳过海康流量卡注册",
            )

        external_failed = (not ezviz_result.success) or (hikiot_result.status == "failed")
        response = CameraRegistrationResponse(
            success=not external_failed,
            partial_success=external_failed,
            video_id=video_id,
            local=local_result,
            ezviz=ezviz_result,
            hikiot=hikiot_result,
        )

        try:
            self.repository.save_record(
                video_id=video_id,
                device_serial=device_serial or "",
                sim_card_id=sim_card_id,
                result=response,
            )
        except Exception:
            if response.local.message == "本地保存成功":
                response.local.message = "本地保存成功；注册结果记录写入失败"

        return response
