from __future__ import annotations

import math
import os
import re
from io import BytesIO
from typing import Any
from urllib.parse import urljoin

import requests
from openpyxl import Workbook

from app.schemas.device_registration_schema import RegistrationStepResult
from app.services.device_registration.hikiot_auth_service import HikiotAuthService
from app.services.video_service import VideoService
from app.utils.logger import get_logger


logger = get_logger("HikiotRegistrationService")

DEFAULT_HIKIOT_BASE_URL = "https://api.hikiot.com"
DEFAULT_IMPORT_PATH = "/api-saas/v1/flow/card/user/import"
DEFAULT_REMARK_PATH = "/api-saas/v1/flow/card/user/update-remark"
DEFAULT_PAGE_PATH = "/api-saas/v1/flow/card/user/page"
DEFAULT_FLOW_APPNO = "__UNI__3109F91"
DEFAULT_TERMINAL = "2"
EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def normalize_iccid(value: str | None) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def mask_iccid(value: str | None) -> str:
    digits = normalize_iccid(value)
    if not digits:
        return ""
    return f"***{digits[-6:]}"


def build_import_excel(iccid: str, remark: str) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "物卡导入"
    sheet.append(["*卡号", "备注"])
    sheet.append([iccid, remark])

    stream = BytesIO()
    workbook.save(stream)
    stream.seek(0)
    return stream.getvalue()


class HikiotRegistrationService:
    timeout_seconds = float(os.getenv("HIKIOT_CARD_REGISTER_TIMEOUT_SECONDS", "15"))
    page_size = int(os.getenv("HIKIOT_CARD_PAGE_SIZE", os.getenv("HIKIOT_PAGE_SIZE", "50")))
    max_pages = int(os.getenv("HIKIOT_CARD_MAX_PAGES", "20"))

    def __init__(self, video_service: VideoService | None = None, auth_service: HikiotAuthService | None = None):
        self.video_service = video_service or VideoService()
        self.auth_service = auth_service or HikiotAuthService()

    def register_sim_card(self, iccid: str | None, remark: str) -> RegistrationStepResult:
        logger.info("Hikiot register_sim_card start")
        normalized_iccid = normalize_iccid(iccid)
        device_serial = str(remark or "").strip()
        if not normalized_iccid:
            return RegistrationStepResult(
                status="skipped",
                success=True,
                message="未填写 SIM 卡号，已跳过海康流量卡注册",
            )
        if not self._is_reasonable_iccid(normalized_iccid):
            return RegistrationStepResult(
                status="failed",
                success=False,
                message="海康流量卡注册失败：SIM 卡号长度不合理",
            )
        if not device_serial:
            return RegistrationStepResult(
                status="failed",
                success=False,
                message="海康流量卡注册失败：缺少摄像头序列号备注",
            )

        try:
            excel_bytes = build_import_excel(normalized_iccid, device_serial)
        except Exception as exc:
            logger.warning("Build Hikiot import excel failed iccid=%s: %s", mask_iccid(normalized_iccid), exc)
            return RegistrationStepResult(
                status="failed",
                success=False,
                message=f"生成海康导入文件失败：{exc}",
            )

        try:
            import_result = self.import_card(normalized_iccid, device_serial, excel_bytes)
            if not import_result["success"] and not import_result["already_exists"]:
                return RegistrationStepResult(
                    status="failed",
                    success=False,
                    message=f"海康导入卡号失败：{import_result['message']}",
                )

            remark_result = self.update_remark(normalized_iccid, device_serial)
            if not remark_result["success"]:
                return RegistrationStepResult(
                    status="failed",
                    success=False,
                    message=f"海康修改备注失败：{remark_result['message']}",
                )

            card = self.find_card(normalized_iccid)
            if not card:
                return RegistrationStepResult(
                    status="failed",
                    success=False,
                    message="海康导入成功但查询不到目标卡号",
                )

            card_remark = self._extract_card_remark(card)
            if card_remark != device_serial:
                return RegistrationStepResult(
                    status="failed",
                    success=False,
                    message="海康卡号存在但备注与设备序列号不一致",
                )

            if import_result["already_exists"]:
                message = "海康流量卡已存在，备注已更新并验证成功"
            else:
                message = "海康流量卡注册成功"
            return RegistrationStepResult(status="success", success=True, message=message)
        except requests.Timeout:
            return RegistrationStepResult(status="failed", success=False, message="海康导入接口请求超时")
        except ValueError as exc:
            return RegistrationStepResult(status="failed", success=False, message=str(exc))
        except Exception as exc:
            logger.warning("Hikiot registration failed iccid=%s: %s", mask_iccid(normalized_iccid), exc)
            return RegistrationStepResult(status="failed", success=False, message=f"海康流量卡注册失败：{exc}")

    def import_card(self, iccid: str, remark: str, excel_bytes: bytes | None = None) -> dict[str, Any]:
        url = self._resolve_url("HIKIOT_CARD_IMPORT_URL", "HIKIOT_CARD_IMPORT_PATH", DEFAULT_IMPORT_PATH)
        headers = self._build_headers(content_type=None)
        files = {
            "file": (
                "物卡导入.xlsx",
                excel_bytes if excel_bytes is not None else build_import_excel(iccid, remark),
                EXCEL_MIME,
            )
        }
        response = requests.post(url, headers=headers, files=files, timeout=self.timeout_seconds)
        if response.status_code == 401:
            response = requests.post(
                url,
                headers=self._build_headers(content_type=None, force_refresh=True),
                files=files,
                timeout=self.timeout_seconds,
            )
        body = self._response_json(response, "导入响应 JSON 无法解析")
        return self.parse_import_response(response.status_code, body, iccid)

    def update_remark(self, iccid: str, remark: str) -> dict[str, Any]:
        url = self._resolve_url("HIKIOT_CARD_REMARK_URL", "HIKIOT_CARD_REMARK_PATH", DEFAULT_REMARK_PATH)
        response = requests.post(
            url,
            headers=self._build_headers(content_type="application/json"),
            json={"iccid": iccid, "remark": remark},
            timeout=self.timeout_seconds,
        )
        if response.status_code == 401:
            response = requests.post(
                url,
                headers=self._build_headers(content_type="application/json", force_refresh=True),
                json={"iccid": iccid, "remark": remark},
                timeout=self.timeout_seconds,
            )
        body = self._response_json(response, "修改备注响应 JSON 无法解析")
        return self.parse_remark_response(response.status_code, body)

    def find_card(self, iccid: str) -> dict[str, Any] | None:
        url = self._resolve_url("HIKIOT_CARD_PAGE_URL", "HIKIOT_CARD_PAGE_PATH", DEFAULT_PAGE_PATH)
        max_pages = max(1, self.max_pages)
        page_size = max(1, self.page_size)

        for page in range(1, max_pages + 1):
            response = requests.get(
                url,
                headers=self._build_headers(content_type=None),
                params={"page": page, "size": page_size, "groupId": 0},
                timeout=self.timeout_seconds,
            )
            if response.status_code == 401:
                response = requests.get(
                    url,
                    headers=self._build_headers(content_type=None, force_refresh=True),
                    params={"page": page, "size": page_size, "groupId": 0},
                    timeout=self.timeout_seconds,
                )
            body = self._response_json(response, "查询卡号列表响应 JSON 无法解析")
            if response.status_code != 200:
                raise ValueError(f"查询卡号列表失败：HTTP {response.status_code}")
            if str(body.get("code")) not in {"0", "200"}:
                raise ValueError(f"查询卡号列表失败：{self._extract_message(body)}")

            records = self._extract_records(body)
            for card in records:
                if normalize_iccid(self._extract_card_iccid(card)) == iccid:
                    return card

            if not self._has_next_page(body, page, page_size, len(records)):
                break

        return None

    @staticmethod
    def parse_import_response(http_status: int, body: dict[str, Any], iccid: str) -> dict[str, Any]:
        message = HikiotRegistrationService._extract_message(body)
        if http_status != 200:
            return {"success": False, "already_exists": False, "message": f"HTTP {http_status}: {message}"}

        data = body.get("data") if isinstance(body.get("data"), dict) else {}
        success_list = data.get("successDataList") if isinstance(data, dict) else []
        error_list = data.get("errorDataList") if isinstance(data, dict) else []
        success_count = HikiotRegistrationService._int_value(data.get("successCount")) if isinstance(data, dict) else 0
        error_count = HikiotRegistrationService._int_value(data.get("errorCount")) if isinstance(data, dict) else 0
        found_success = HikiotRegistrationService._list_contains_iccid(success_list, iccid)

        if body.get("code") == 0 and success_count >= 1 and error_count == 0 and found_success:
            return {"success": True, "already_exists": False, "message": "导入卡号成功"}

        error_reason = HikiotRegistrationService._extract_error_reason(error_list) or message
        if HikiotRegistrationService._is_already_exists_text(error_reason):
            return {"success": False, "already_exists": True, "message": error_reason}

        if error_count > 0:
            return {"success": False, "already_exists": False, "message": error_reason}

        if body.get("code") != 0:
            return {"success": False, "already_exists": False, "message": message}

        return {"success": False, "already_exists": False, "message": "导入业务失败：未找到当前 ICCID 的成功记录"}

    @staticmethod
    def parse_remark_response(http_status: int, body: dict[str, Any]) -> dict[str, Any]:
        message = HikiotRegistrationService._extract_message(body)
        if http_status != 200:
            return {"success": False, "message": f"HTTP {http_status}: {message}"}
        if body.get("code") == 0 and body.get("data") is True:
            return {"success": True, "message": "修改备注成功"}
        return {"success": False, "message": message}

    def _build_headers(self, *, content_type: str | None, force_refresh: bool = False) -> dict[str, str]:
        if not self._has_auth_config():
            raise ValueError("海康鉴权缺失：请配置 HIKIOT_BEARER_TOKEN 或 HIKIOT_LOGIN_URL")

        if force_refresh:
            self.auth_service.clear_token()
        token = self.auth_service.get_token(force_refresh=force_refresh)
        if token:
            return self._build_headers_with_authorization(
                authorization=self._format_authorization(token),
                app_no="",
                terminal="",
                content_type=content_type,
            )

        try:
            _, authorization, app_no, terminal = self.video_service._get_hikiot_config()
        except Exception as exc:
            raise ValueError(f"海康鉴权缺失：{exc}") from exc

        if token:
            authorization = self._format_authorization(token)

        headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Authorization": authorization,
            "Origin": "https://www.hikiot.com",
            "Referer": "https://www.hikiot.com/",
            "User-Agent": "Mozilla/5.0",
            "Appno": os.getenv("HIKIOT_FLOW_APPNO") or os.getenv("HIKIOT_APP_NO") or os.getenv("HIKIOT_APPNO") or app_no or DEFAULT_FLOW_APPNO,
            "Terminal": os.getenv("HIKIOT_TERMINAL") or terminal or DEFAULT_TERMINAL,
        }
        autherm = str(os.getenv("HIKIOT_AUTHERM", "") or "").strip()
        deviceid = str(os.getenv("HIKIOT_DEVICEID", os.getenv("HIKIOT_DEVICE_ID", "")) or "").strip()
        if autherm:
            headers["Autherm"] = autherm
        if deviceid:
            headers["Deviceid"] = deviceid
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    @staticmethod
    def _format_authorization(token: str) -> str:
        token = str(token or "").strip()
        if token.lower().startswith("bearer "):
            return token
        return f"Bearer {token}"

    @staticmethod
    def _build_headers_with_authorization(
        *,
        authorization: str,
        app_no: str,
        terminal: str,
        content_type: str | None,
    ) -> dict[str, str]:
        headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Authorization": authorization,
            "Origin": "https://www.hikiot.com",
            "Referer": "https://www.hikiot.com/",
            "User-Agent": "Mozilla/5.0",
            "Appno": os.getenv("HIKIOT_FLOW_APPNO") or os.getenv("HIKIOT_APP_NO") or os.getenv("HIKIOT_APPNO") or app_no or DEFAULT_FLOW_APPNO,
            "Terminal": os.getenv("HIKIOT_TERMINAL") or terminal or DEFAULT_TERMINAL,
        }
        autherm = str(os.getenv("HIKIOT_AUTHERM", "") or "").strip()
        deviceid = str(os.getenv("HIKIOT_DEVICEID", os.getenv("HIKIOT_DEVICE_ID", "")) or "").strip()
        if autherm:
            headers["Autherm"] = autherm
        if deviceid:
            headers["Deviceid"] = deviceid
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    @staticmethod
    def _has_auth_config() -> bool:
        if str(os.getenv("HIKIOT_LOGIN_URL", "") or "").strip():
            return True
        return any(
            str(os.getenv(name, "") or "").strip()
            for name in (
                "HIKIOT_BEARER_TOKEN",
                "HIKIOT_AUTHORIZATION",
                "HIKIOT_AUTHORIZATION_BEARER",
                "HIKIOT_TOKEN",
                "HIKIOT_ACCESS_TOKEN",
            )
        )

    @staticmethod
    def _is_reasonable_iccid(iccid: str) -> bool:
        return 18 <= len(iccid) <= 22

    @staticmethod
    def _response_json(response: requests.Response, parse_error_message: str) -> dict[str, Any]:
        try:
            body = response.json()
        except ValueError as exc:
            raise ValueError(parse_error_message) from exc
        if not isinstance(body, dict):
            raise ValueError(parse_error_message)
        return body

    @staticmethod
    def _resolve_url(url_env: str, path_env: str, default_path: str) -> str:
        configured_url = str(os.getenv(url_env, "") or "").strip()
        if configured_url:
            return configured_url

        path = str(os.getenv(path_env, "") or "").strip() or default_path
        base = (
            os.getenv("HIKIOT_BASE_URL")
            or os.getenv("HIKIOT_API_BASE_URL")
            or os.getenv("HIKIOT_FLOW_CARD_BASE_URL")
            or DEFAULT_HIKIOT_BASE_URL
        ).strip().rstrip("/")
        if base.endswith("/api-saas/v1") and path.startswith("/api-saas/v1/"):
            base = base[: -len("/api-saas/v1")]
        return urljoin(base.rstrip("/") + "/", path.lstrip("/"))

    @staticmethod
    def _extract_records(body: dict[str, Any]) -> list[dict[str, Any]]:
        data = body.get("data")
        candidates: list[Any] = []
        if isinstance(data, dict):
            candidates.extend([
                data.get("records"),
                data.get("list"),
                data.get("rows"),
                data.get("data"),
            ])
        candidates.extend([body.get("records"), body.get("list"), body.get("rows")])
        for candidate in candidates:
            if isinstance(candidate, list):
                return [item for item in candidate if isinstance(item, dict)]
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
        return []

    @staticmethod
    def _has_next_page(body: dict[str, Any], page: int, page_size: int, record_count: int) -> bool:
        data = body.get("data") if isinstance(body.get("data"), dict) else {}
        pages = HikiotRegistrationService._int_value(data.get("pages") or data.get("totalPage") or data.get("totalPages"))
        if pages:
            return page < pages

        total = HikiotRegistrationService._int_value(data.get("total") or data.get("totalCount"))
        if total:
            return page < int(math.ceil(total / page_size))

        return record_count >= page_size

    @staticmethod
    def _extract_card_iccid(card: dict[str, Any]) -> str:
        for key in ("iccid", "cardNo", "card_no", "simCardId", "sim_card_id"):
            value = card.get(key)
            if value:
                return str(value)
        nested = card.get("data")
        if isinstance(nested, dict):
            return HikiotRegistrationService._extract_card_iccid(nested)
        return ""

    @staticmethod
    def _extract_card_remark(card: dict[str, Any]) -> str:
        for key in ("remark", "remarks", "memo", "name"):
            value = card.get(key)
            if value is not None:
                return str(value).strip()
        nested = card.get("data")
        if isinstance(nested, dict):
            return HikiotRegistrationService._extract_card_remark(nested)
        return ""

    @staticmethod
    def _list_contains_iccid(items: Any, iccid: str) -> bool:
        if not isinstance(items, list):
            return False
        for item in items:
            if isinstance(item, dict) and normalize_iccid(HikiotRegistrationService._extract_card_iccid(item)) == iccid:
                return True
        return False

    @staticmethod
    def _extract_message(body: dict[str, Any]) -> str:
        return str(body.get("msg") or body.get("message") or "上游服务异常").strip()

    @staticmethod
    def _extract_error_reason(error_list: Any) -> str:
        if not isinstance(error_list, list) or not error_list:
            return ""
        reasons: list[str] = []
        for item in error_list:
            if isinstance(item, dict):
                for key in ("errorMsg", "errorMessage", "message", "msg", "reason"):
                    value = item.get(key)
                    if value:
                        reasons.append(str(value))
                        break
                else:
                    reasons.append(str(item))
            else:
                reasons.append(str(item))
        return "；".join(reasons)

    @staticmethod
    def _is_already_exists_text(text: str) -> bool:
        lowered = str(text or "").lower()
        return any(token in lowered for token in ("已存在", "已经存在", "重复", "exist", "already"))

    @staticmethod
    def _int_value(value: Any) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0
