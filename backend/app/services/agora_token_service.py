import os
from datetime import datetime, timedelta

from fastapi import HTTPException

from app.services.agora_access_token2 import build_rtc_token_with_uid


class AgoraTokenService:
    def __init__(self):
        self.app_id = os.getenv("AGORA_APP_ID", "").strip()
        self.app_certificate = os.getenv("AGORA_APP_CERTIFICATE", "").strip()
        self.expire_seconds = int(os.getenv("AGORA_TOKEN_EXPIRE_SECONDS", "3600"))

    def build_rtc_token(self, *, channel_name: str, uid: int) -> dict:
        if not self.app_id or not self.app_certificate:
            raise HTTPException(
                status_code=500,
                detail="Agora is not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE.",
            )

        token_expire = max(self.expire_seconds, 60)

        token = build_rtc_token_with_uid(
            self.app_id,
            self.app_certificate,
            channel_name,
            int(uid),
            token_expire,
        )
        if not token:
            raise HTTPException(
                status_code=500,
                detail="Agora token generation failed. Check AGORA_APP_ID and AGORA_APP_CERTIFICATE.",
            )

        return {
            "app_id": self.app_id,
            "token": token,
            "expire_at": datetime.utcnow() + timedelta(seconds=token_expire),
        }
