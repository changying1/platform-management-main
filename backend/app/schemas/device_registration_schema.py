from typing import Literal, Optional
import re

from pydantic import BaseModel, Field, field_validator, model_validator


RegistrationStatus = Literal[
    "pending",
    "success",
    "failed",
    "skipped",
]


def _strip_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class CameraRegistrationRequest(BaseModel):
    name: str = Field(..., min_length=1)
    device_serial: Optional[str] = None
    camera_password: Optional[str] = None
    sim_card_id: Optional[str] = None
    channel_no: int = Field(default=1, ge=1)

    device_type: Optional[str] = "dome"
    status: Optional[str] = "offline"
    remark: Optional[str] = None
    location: Optional[str] = None

    company: Optional[str] = None
    branch_id: Optional[str] = None
    project: Optional[str] = None
    project_id: Optional[str] = None
    grid: Optional[str] = None
    grid_id: Optional[str] = None
    team: Optional[str] = None
    team_id: Optional[str] = None

    username: Optional[str] = None

    @field_validator("name")
    @classmethod
    def strip_required(cls, value: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise ValueError("字段不能为空")
        return text

    @field_validator(
        "device_type",
        "status",
        "remark",
        "location",
        "company",
        "branch_id",
        "project",
        "project_id",
        "grid",
        "grid_id",
        "team",
        "team_id",
        "username",
        "device_serial",
        "camera_password",
        mode="before",
    )
    @classmethod
    def strip_optional(cls, value: Optional[str]) -> Optional[str]:
        return _strip_text(value)

    @field_validator("sim_card_id", mode="before")
    @classmethod
    def normalize_sim_card_id(cls, value: Optional[str]) -> Optional[str]:
        text = _strip_text(value)
        if not text:
            return None
        digits = re.sub(r"\D+", "", text)
        return digits or None

    @model_validator(mode="after")
    def validate_registration_inputs(self):
        if not self.device_serial and not self.sim_card_id:
            raise ValueError("设备序列号和 SIM 卡号至少填写一项")
        if self.device_serial and not self.camera_password:
            raise ValueError("填写设备序列号时必须填写摄像头密码")
        return self


class RegistrationStepResult(BaseModel):
    status: RegistrationStatus
    success: bool
    message: str


class CameraRegistrationResponse(BaseModel):
    success: bool
    partial_success: bool
    video_id: Optional[str] = None

    local: RegistrationStepResult
    ezviz: RegistrationStepResult
    hikiot: RegistrationStepResult
