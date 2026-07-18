from __future__ import annotations

import requests

from app.schemas.device_registration_schema import RegistrationStepResult
from app.services.video_service import VideoService
from app.utils.logger import get_logger


logger = get_logger("EzvizRegistrationService")


class EzvizRegistrationService:
    idempotent_messages = (
        "已经添加",
        "已添加",
        "当前账号",
        "already",
        "exist",
    )

    def __init__(self, video_service: VideoService | None = None):
        self.video_service = video_service or VideoService()

    def _friendly_error(self, error: Exception) -> str:
        text = str(error or "").strip()
        low = text.lower()
        if isinstance(error, requests.Timeout) or "timeout" in low or "timed out" in low:
            return "网络请求超时"
        if "appkey" in low or "appsecret" in low or "配置" in text:
            return "萤石云配置缺失"
        if "validate" in low or "验证码" in text or "密码" in text:
            return "摄像头密码错误"
        if "not exist" in low or "不存在" in text:
            return "设备序列号不存在"
        if "other" in low or "其他" in text or "被绑定" in text:
            return "设备被其他账号绑定"
        if "token" in low:
            return "Token 获取失败"
        return text or "上游服务异常"

    def register_device(self, device_serial: str, camera_password: str) -> RegistrationStepResult:
        payload = {
            "deviceSerial": device_serial,
            "validateCode": camera_password,
        }
        try:
            self.video_service._call_ezviz_api("/api/lapp/device/add", payload, retry_on_token_error=True)
            return RegistrationStepResult(
                status="success",
                success=True,
                message="萤石云注册成功",
            )
        except Exception as exc:
            message = str(exc or "")
            if any(item.lower() in message.lower() for item in self.idempotent_messages):
                return RegistrationStepResult(
                    status="success",
                    success=True,
                    message="萤石云注册成功：设备已在当前账号",
                )
            friendly = self._friendly_error(exc)
            logger.warning("EZVIZ registration failed serial=%s: %s", device_serial, friendly)
            return RegistrationStepResult(
                status="failed",
                success=False,
                message=f"萤石云注册失败：{friendly}",
            )
