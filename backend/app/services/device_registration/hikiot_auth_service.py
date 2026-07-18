from __future__ import annotations

import json
import os
import time
from typing import Any

import requests

from app.utils.logger import get_logger


logger = get_logger("HikiotAuthService")

DEFAULT_LOGIN_TIMEOUT_SECONDS = 10.0
DEFAULT_TOKEN_TTL_SECONDS = 1800


class HikiotAuthService:
    def __init__(self):
        self._token = ""
        self._expires_at = 0.0

    def get_token(self, *, force_refresh: bool = False) -> str:
        logger.info("Hikiot auth get_token called")
        if not force_refresh and self._token and self._expires_at > time.time() + 30:
            return self._token

        token = self._login()
        if token:
            self._token = token
            self._expires_at = time.time() + self._token_ttl_seconds()
            logger.info("Hikiot token refreshed")
        return token

    def clear_token(self) -> None:
        self._token = ""
        self._expires_at = 0.0

    def _login(self) -> str:
        login_url = str(os.getenv("HIKIOT_LOGIN_URL", "") or "").strip()
        if not login_url:
            return ""

        try:
            logger.info("Hikiot login request start")
            response = requests.post(
                login_url,
                json=self._login_payload(),
                headers=self._login_headers(),
                timeout=self._login_timeout_seconds(),
            )
            if response.status_code >= 400:
                raise requests.HTTPError(f"HTTP {response.status_code}", response=response)

            body = response.json()
            if not isinstance(body, dict):
                raise ValueError("login response is not a JSON object")

            token = self._extract_token(body)
            if not token:
                raise ValueError("login response does not contain token")

            logger.info("Hikiot login success")
            return token
        except Exception as exc:
            logger.warning("Hikiot login failed: %s", exc)
            return ""

    @staticmethod
    def _login_payload() -> dict[str, Any]:
        payload_text = str(os.getenv("HIKIOT_LOGIN_PAYLOAD_JSON", "") or "").strip()
        if not payload_text:
            return {}

        payload = json.loads(payload_text)
        if not isinstance(payload, dict):
            raise ValueError("HIKIOT_LOGIN_PAYLOAD_JSON must be a JSON object")
        return payload

    @staticmethod
    def _login_headers() -> dict[str, str]:
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
        }
        headers_text = str(os.getenv("HIKIOT_LOGIN_HEADERS_JSON", "") or "").strip()
        if headers_text:
            configured_headers = json.loads(headers_text)
            if not isinstance(configured_headers, dict):
                raise ValueError("HIKIOT_LOGIN_HEADERS_JSON must be a JSON object")
            headers.update({str(key): str(value) for key, value in configured_headers.items()})
        return headers

    @staticmethod
    def _extract_token(payload: dict[str, Any]) -> str:
        candidates: list[Any] = [
            payload.get("token"),
            payload.get("accessToken"),
            payload.get("bearer"),
        ]
        data = payload.get("data")
        if isinstance(data, dict):
            candidates.extend([data.get("token"), data.get("accessToken"), data.get("bearer")])

        for candidate in candidates:
            token = str(candidate or "").strip()
            if token:
                return token
        return ""

    @staticmethod
    def _login_timeout_seconds() -> float:
        try:
            return float(os.getenv("HIKIOT_LOGIN_TIMEOUT_SECONDS", str(DEFAULT_LOGIN_TIMEOUT_SECONDS)))
        except (TypeError, ValueError):
            return DEFAULT_LOGIN_TIMEOUT_SECONDS

    @staticmethod
    def _token_ttl_seconds() -> int:
        try:
            return max(1, int(float(os.getenv("HIKIOT_TOKEN_TTL_SECONDS", str(DEFAULT_TOKEN_TTL_SECONDS)))))
        except (TypeError, ValueError):
            return DEFAULT_TOKEN_TTL_SECONDS
