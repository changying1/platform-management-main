# -*- coding: utf-8 -*-
"""
设备扫描导入服务（方案 A）

方案 A 固定规则：
1. 萤石开放平台负责提供真实摄像头列表。
2. Hikiot 只负责提供 SIM 卡列表。
3. Hikiot.remark 作为摄像头序列号，用来匹配萤石 deviceSerial。
4. Hikiot.iccid 作为 SIM 卡号。
5. 只有萤石设备列表中存在的 deviceSerial 才允许自动新增到本地 video_device。
6. Hikiot remark 在萤石中不存在时，只返回 unmatched_remark，不自动创建摄像头。

需要的 .env 配置：

EZVIZ_BASE_URL=https://open.ys7.com
EZVIZ_APP_KEY=你的萤石AppKey
EZVIZ_APP_SECRET=你的萤石AppSecret

HIKIOT_BASE_URL=https://api.hikiot.com/api-saas/v1
HIKIOT_APP_NO=__UNI_3109F91
HIKIOT_TERMINAL=2
HIKIOT_BEARER_TOKEN=从网页 Request Headers 复制的 Bearer 后面的 token

可选：
HIKIOT_DEVICE_ID=网页 Request Headers 里的 Deviceid
HIKIOT_CARD_GROUP_ID=0
HIKIOT_PAGE_SIZE=50
EZVIZ_PAGE_SIZE=50
DEVICE_SCAN_TIMEOUT_SECONDS=20
"""

from __future__ import annotations

import os
import json
import time
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import httpx
from pymongo.collection import Collection

from app.core.database import get_next_sequence, get_video_device_collection

logger = logging.getLogger(__name__)


class DeviceAutoImportService:
    """按照方案 A 扫描萤石设备，并用 Hikiot 流量卡备注匹配 SIM 卡号。"""

    def __init__(self) -> None:
        self.ezviz_base_url = os.getenv("EZVIZ_BASE_URL", "https://open.ys7.com").rstrip("/")
        self.ezviz_app_key = (os.getenv("EZVIZ_APP_KEY") or "").strip()
        self.ezviz_app_secret = (os.getenv("EZVIZ_APP_SECRET") or "").strip()
        self.ezviz_page_size = int(os.getenv("EZVIZ_PAGE_SIZE", "50") or "50")

        self.hikiot_base_url = os.getenv(
            "HIKIOT_BASE_URL",
            os.getenv("HIKIOT_API_BASE_URL", "https://api.hikiot.com/api-saas/v1"),
        ).rstrip("/")
        self.hikiot_bearer_token = (os.getenv("HIKIOT_BEARER_TOKEN") or "").strip()
        self.hikiot_login_url = (os.getenv("HIKIOT_LOGIN_URL") or "").strip()
        self.hikiot_username = (os.getenv("HIKIOT_USERNAME") or "").strip()
        self.hikiot_password = (os.getenv("HIKIOT_PASSWORD") or "").strip()
        self.hikiot_login_payload_json = (os.getenv("HIKIOT_LOGIN_PAYLOAD_JSON") or "").strip()
        self.hikiot_login_headers_json = (os.getenv("HIKIOT_LOGIN_HEADERS_JSON") or "").strip()
        self.hikiot_login_username_field = (os.getenv("HIKIOT_LOGIN_USERNAME_FIELD") or "username").strip()
        self.hikiot_login_password_field = (os.getenv("HIKIOT_LOGIN_PASSWORD_FIELD") or "password").strip()
        self.hikiot_token_ttl_seconds = int(os.getenv("HIKIOT_TOKEN_TTL_SECONDS", "1800") or "1800")
        self._hikiot_runtime_token: Optional[str] = None
        self._hikiot_token_expire_at: float = 0.0
        self.hikiot_app_no = (os.getenv("HIKIOT_APP_NO") or "__UNI_3109F91").strip()
        self.hikiot_terminal = (os.getenv("HIKIOT_TERMINAL") or "2").strip()
        self.hikiot_device_id = (os.getenv("HIKIOT_DEVICE_ID") or os.getenv("HIKIOT_DEVICEID") or "").strip()
        self.hikiot_group_id = os.getenv("HIKIOT_CARD_GROUP_ID", "0")
        self.hikiot_page_size = int(os.getenv("HIKIOT_PAGE_SIZE", "50") or "50")

        self.timeout = float(os.getenv("DEVICE_SCAN_TIMEOUT_SECONDS", "20") or "20")
        self._ezviz_token: Optional[str] = None
        self._ezviz_token_expire_at: float = 0.0

    # ------------------------------------------------------------------
    # 对外入口
    # ------------------------------------------------------------------
    def scan_import(self, *, dry_run: bool = False, overwrite_sim: bool = False) -> Dict[str, Any]:
        """
        执行方案 A 扫描导入。

        dry_run=True 时只返回将要执行的结果，不写数据库。
        overwrite_sim=True 时允许用 Hikiot 新 SIM 覆盖本地已有不同 SIM；默认不覆盖，返回冲突。
        """
        started_at = datetime.now()

        ezviz_devices = self.fetch_all_ezviz_devices()
        hikiot_cards = self.fetch_all_hikiot_cards()

        sim_map, duplicate_remarks, invalid_cards = self._build_sim_map(hikiot_cards)
        ezviz_serial_set = {
            self._normalize_serial(self._get_ezviz_serial(device))
            for device in ezviz_devices
            if self._normalize_serial(self._get_ezviz_serial(device))
        }

        unmatched_remarks = []
        for remark, card in sim_map.items():
            if remark not in ezviz_serial_set:
                unmatched_remarks.append(
                    {
                        "remark": remark,
                        "iccid": card.get("iccid"),
                        "reason": "hikiot_remark_not_found_in_ezviz",
                    }
                )

        collection = get_video_device_collection()
        now = datetime.now()
        items: List[Dict[str, Any]] = []

        imported = 0
        skipped_existing = 0
        sim_matched = 0
        sim_missing = 0
        sim_updated_existing = 0
        conflicts = 0

        for ezviz_device in ezviz_devices:
            serial = self._normalize_serial(self._get_ezviz_serial(ezviz_device))
            if not serial:
                items.append(
                    {
                        "device_serial": "",
                        "device_name": self._get_ezviz_name(ezviz_device),
                        "sim_card_id": "",
                        "status": "invalid_ezviz_device",
                        "reason": "missing_device_serial",
                    }
                )
                continue

            card = sim_map.get(serial)
            sim_card_id = str(card.get("iccid") or "").strip() if card else ""
            if sim_card_id:
                sim_matched += 1
            else:
                sim_missing += 1

            existing = self._find_video_device_by_serial(collection, serial)
            if existing:
                skipped_existing += 1
                result = self._handle_existing_device(
                    collection=collection,
                    existing=existing,
                    serial=serial,
                    ezviz_device=ezviz_device,
                    sim_card_id=sim_card_id,
                    card=card,
                    now=now,
                    dry_run=dry_run,
                    overwrite_sim=overwrite_sim,
                )
                if result["status"] == "existing_sim_updated":
                    sim_updated_existing += 1
                elif result["status"] == "existing_sim_conflict":
                    conflicts += 1
                items.append(result)
                continue

            result = self._handle_new_device(
                collection=collection,
                serial=serial,
                ezviz_device=ezviz_device,
                sim_card_id=sim_card_id,
                card=card,
                now=now,
                dry_run=dry_run,
            )
            imported += 1
            items.append(result)

        finished_at = datetime.now()
        return {
            "success": True,
            "message": "扫描完成" if not dry_run else "扫描完成，dry_run 未写入数据库",
            "mode": "scheme_a",
            "dry_run": dry_run,
            "ezviz_total": len(ezviz_devices),
            "hikiot_card_total": len(hikiot_cards),
            "imported": imported,
            "skipped_existing": skipped_existing,
            "sim_matched": sim_matched,
            "sim_missing": sim_missing,
            "sim_updated_existing": sim_updated_existing,
            "conflicts": conflicts + len(duplicate_remarks),
            "duplicate_remarks": duplicate_remarks,
            "invalid_hikiot_cards": invalid_cards,
            "unmatched_remarks": unmatched_remarks,
            "items": items,
            "started_at": started_at.strftime("%Y-%m-%d %H:%M:%S"),
            "finished_at": finished_at.strftime("%Y-%m-%d %H:%M:%S"),
        }

    # ------------------------------------------------------------------
    # 萤石开放平台
    # ------------------------------------------------------------------
    def fetch_all_ezviz_devices(self) -> List[Dict[str, Any]]:
        if not self.ezviz_app_key or not self.ezviz_app_secret:
            raise RuntimeError("缺少 EZVIZ_APP_KEY 或 EZVIZ_APP_SECRET，请先在 .env 中配置萤石开放平台参数")

        access_token = self._get_ezviz_access_token()
        page_start = 0
        all_devices: List[Dict[str, Any]] = []

        while True:
            payload = {
                "accessToken": access_token,
                "pageStart": page_start,
                "pageSize": self.ezviz_page_size,
            }
            data = self._post_ezviz("/api/lapp/device/list", payload)
            devices = data.get("data") or []
            if not isinstance(devices, list):
                devices = []

            all_devices.extend(devices)

            # 萤石一般返回 page 对象；没有 page 时按返回数量判断是否继续。
            page = data.get("page") or {}
            total = int(page.get("total") or 0) if isinstance(page, dict) else 0
            if total > 0:
                if len(all_devices) >= total:
                    break
            if len(devices) < self.ezviz_page_size:
                break

            page_start += 1

        return all_devices

    def _get_ezviz_access_token(self) -> str:
        now = time.time()
        if self._ezviz_token and self._ezviz_token_expire_at - 60 > now:
            return self._ezviz_token

        payload = {
            "appKey": self.ezviz_app_key,
            "appSecret": self.ezviz_app_secret,
        }
        data = self._post_ezviz("/api/lapp/token/get", payload)
        token_data = data.get("data") or {}
        token = str(token_data.get("accessToken") or "").strip()
        if not token:
            raise RuntimeError(f"萤石 accessToken 获取失败：{data}")

        expire_time = token_data.get("expireTime")
        # 萤石 expireTime 通常是毫秒时间戳。
        try:
            expire_at = float(expire_time) / 1000.0
        except Exception:
            expire_at = now + 3600

        self._ezviz_token = token
        self._ezviz_token_expire_at = expire_at
        return token

    def _post_ezviz(self, path: str, data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.ezviz_base_url}{path}"
        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(url, data=data)
        response.raise_for_status()
        body = response.json()

        code = str(body.get("code", ""))
        if code not in {"200", "0"}:
            raise RuntimeError(f"萤石接口调用失败 path={path}, response={body}")
        return body

    # ------------------------------------------------------------------
    # Hikiot 流量卡平台
    # ------------------------------------------------------------------
    def fetch_all_hikiot_cards(self) -> List[Dict[str, Any]]:
        """拉取 Hikiot 流量卡列表。

        优先使用当前内存 token / .env 里的 HIKIOT_BEARER_TOKEN；
        如果接口返回 401 或业务返回未授权，再尝试用 HIKIOT_LOGIN_URL 自动登录刷新 token 并重试一次。
        """
        page = 1
        all_cards: List[Dict[str, Any]] = []

        while True:
            body = self._request_hikiot_card_page(page=page, force_login=False)

            cards = body.get("data") or []
            if not isinstance(cards, list):
                cards = []
            all_cards.extend(cards)

            count = int(body.get("count") or 0)
            if count > 0:
                if len(all_cards) >= count:
                    break
            if len(cards) < self.hikiot_page_size:
                break

            page += 1

        return all_cards

    def _request_hikiot_card_page(self, *, page: int, force_login: bool = False) -> Dict[str, Any]:
        url = f"{self.hikiot_base_url}/flow/card/user/page"
        params = {
            "page": page,
            "size": self.hikiot_page_size,
            "groupId": self.hikiot_group_id,
        }

        token = self._get_hikiot_token(force_login=force_login)
        headers = self._build_hikiot_headers(token)

        with httpx.Client(timeout=self.timeout) as client:
            response = client.get(url, params=params, headers=headers)

        if response.status_code == 401 and not force_login:
            logger.info("Hikiot token returned 401, trying automatic login once")
            return self._request_hikiot_card_page(page=page, force_login=True)

        if response.status_code == 401:
            raise RuntimeError("Hikiot token 已过期或无权限，且自动登录后仍然 401。请检查 HIKIOT_LOGIN_URL / USERNAME / PASSWORD / LOGIN_HEADERS。")

        response.raise_for_status()
        body = response.json()

        if self._is_hikiot_auth_failed(body) and not force_login:
            logger.info("Hikiot business response indicates auth failure, trying automatic login once")
            return self._request_hikiot_card_page(page=page, force_login=True)

        if body.get("code") not in {0, "0"}:
            raise RuntimeError(f"Hikiot 流量卡接口调用失败：{body}")

        return body

    @staticmethod
    def _is_hikiot_auth_failed(body: Dict[str, Any]) -> bool:
        code = str(body.get("code", "")).strip().lower()
        msg = str(body.get("msg") or body.get("message") or "").strip().lower()
        return (
            code in {"401", "403", "100401", "100403", "unauthorized"}
            or "token" in msg and ("过期" in msg or "无效" in msg or "invalid" in msg or "expired" in msg)
            or "未登录" in msg
            or "unauthorized" in msg
        )

    def _get_hikiot_token(self, *, force_login: bool = False) -> str:
        now = time.time()

        if not force_login and self._hikiot_runtime_token and self._hikiot_token_expire_at - 30 > now:
            return self._hikiot_runtime_token

        if not force_login and self.hikiot_bearer_token:
            token = self._strip_bearer_prefix(self.hikiot_bearer_token)
            self._hikiot_runtime_token = token
            # 手动 token 不知道准确过期时间，给一个较短内存缓存；接口失败时仍会强制登录重试。
            self._hikiot_token_expire_at = now + min(self.hikiot_token_ttl_seconds, 300)
            return token

        return self._login_hikiot_and_get_token()

    def _login_hikiot_and_get_token(self) -> str:
        if not self.hikiot_login_url:
            raise RuntimeError("缺少 HIKIOT_LOGIN_URL，无法自动登录 Hikiot；请重新复制 HIKIOT_BEARER_TOKEN 或补充登录接口配置")

        payload = self._build_hikiot_login_payload()
        headers = self._build_hikiot_login_headers()

        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(self.hikiot_login_url, json=payload, headers=headers)

        response.raise_for_status()
        body = response.json()
        if body.get("code") not in {0, "0", 200, "200"}:
            raise RuntimeError(f"Hikiot 自动登录失败：{body}")

        token = self._extract_hikiot_token(body)
        if not token:
            raise RuntimeError(f"Hikiot 自动登录成功但没有解析到 token，请检查登录响应字段：{body}")

        token = self._strip_bearer_prefix(token)
        self._hikiot_runtime_token = token
        self._hikiot_token_expire_at = time.time() + max(60, self.hikiot_token_ttl_seconds)
        logger.info("Hikiot automatic login succeeded")
        return token

    def _build_hikiot_login_payload(self) -> Dict[str, Any]:
        if self.hikiot_login_payload_json:
            try:
                payload = json.loads(self.hikiot_login_payload_json)
                if isinstance(payload, dict):
                    return payload
            except Exception as exc:
                raise RuntimeError(f"HIKIOT_LOGIN_PAYLOAD_JSON 不是合法 JSON：{exc}") from exc

        if not self.hikiot_username or not self.hikiot_password:
            raise RuntimeError("缺少 HIKIOT_USERNAME 或 HIKIOT_PASSWORD，无法自动登录 Hikiot")

        return {
            self.hikiot_login_username_field: self.hikiot_username,
            self.hikiot_login_password_field: self.hikiot_password,
            "isAuto": False,
        }

    def _build_hikiot_login_headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",
            "Origin": "https://www.hikiot.com",
            "Referer": "https://www.hikiot.com/",
        }

        if self.hikiot_login_headers_json:
            try:
                extra = json.loads(self.hikiot_login_headers_json)
                if isinstance(extra, dict):
                    headers.update({str(k): str(v) for k, v in extra.items() if v is not None})
            except Exception as exc:
                raise RuntimeError(f"HIKIOT_LOGIN_HEADERS_JSON 不是合法 JSON：{exc}") from exc

        if self.hikiot_device_id and "Deviceid" not in headers and "deviceid" not in headers:
            headers["Deviceid"] = self.hikiot_device_id
        if self.hikiot_terminal and "Terminal" not in headers:
            headers["Terminal"] = self.hikiot_terminal
        if self.hikiot_app_no and "Appno" not in headers:
            headers["Appno"] = self.hikiot_app_no

        return headers

    def _extract_hikiot_token(self, body: Dict[str, Any]) -> str:
        candidates: List[Any] = []

        def collect(obj: Any) -> None:
            if isinstance(obj, dict):
                for key in [
                    "token",
                    "accessToken",
                    "access_token",
                    "bearerToken",
                    "bearer_token",
                    "authorization",
                    "Authorization",
                    "satoken",
                    "saToken",
                ]:
                    if obj.get(key):
                        candidates.append(obj.get(key))
                for value in obj.values():
                    if isinstance(value, (dict, list)):
                        collect(value)
            elif isinstance(obj, list):
                for item in obj:
                    collect(item)

        collect(body)

        for value in candidates:
            token = str(value or "").strip()
            if token:
                return token
        return ""

    @staticmethod
    def _strip_bearer_prefix(token: str) -> str:
        token = str(token or "").strip()
        if token.lower().startswith("bearer "):
            return token.split(" ", 1)[1].strip()
        return token

    def _build_hikiot_headers(self, token: str) -> Dict[str, str]:
        token = self._strip_bearer_prefix(token)
        if not token:
            raise RuntimeError("Hikiot token 为空，无法请求流量卡接口")

        headers = {
            "Authorization": f"Bearer {token}",
            "Appno": self.hikiot_app_no,
            "Terminal": self.hikiot_terminal,
            "Accept": "application/json, text/plain, */*",
        }
        if self.hikiot_device_id:
            headers["Deviceid"] = self.hikiot_device_id
        return headers

    # ------------------------------------------------------------------
    # MongoDB 写入
    # ------------------------------------------------------------------
    def _handle_existing_device(
        self,
        *,
        collection: Collection,
        existing: Dict[str, Any],
        serial: str,
        ezviz_device: Dict[str, Any],
        sim_card_id: str,
        card: Optional[Dict[str, Any]],
        now: datetime,
        dry_run: bool,
        overwrite_sim: bool,
    ) -> Dict[str, Any]:
        current_sim = str(existing.get("sim_card_id") or existing.get("simCardId") or "").strip()
        base_item = {
            "device_serial": serial,
            "device_name": self._get_ezviz_name(ezviz_device),
            "sim_card_id": sim_card_id,
            "existing_id": existing.get("id"),
        }

        if not sim_card_id:
            return {
                **base_item,
                "status": "existing",
                "reason": "device_exists_but_no_matching_sim",
            }

        if not current_sim:
            update_doc = {
                "sim_card_id": sim_card_id,
                "updatedAt": now,
                "hikiot_card": self._compact_hikiot_card(card),
            }
            if not dry_run:
                collection.update_one({"_id": existing["_id"]}, {"$set": update_doc})
            return {
                **base_item,
                "status": "existing_sim_updated",
                "old_sim_card_id": current_sim,
                "new_sim_card_id": sim_card_id,
            }

        if current_sim == sim_card_id:
            return {
                **base_item,
                "status": "existing",
                "reason": "device_and_sim_already_exist",
            }

        if overwrite_sim:
            update_doc = {
                "sim_card_id": sim_card_id,
                "updatedAt": now,
                "hikiot_card": self._compact_hikiot_card(card),
            }
            if not dry_run:
                collection.update_one({"_id": existing["_id"]}, {"$set": update_doc})
            return {
                **base_item,
                "status": "existing_sim_overwritten",
                "old_sim_card_id": current_sim,
                "new_sim_card_id": sim_card_id,
            }

        return {
            **base_item,
            "status": "existing_sim_conflict",
            "reason": "local_sim_card_id_differs_from_hikiot",
            "local_sim_card_id": current_sim,
            "hikiot_sim_card_id": sim_card_id,
        }

    def _handle_new_device(
        self,
        *,
        collection: Collection,
        serial: str,
        ezviz_device: Dict[str, Any],
        sim_card_id: str,
        card: Optional[Dict[str, Any]],
        now: datetime,
        dry_run: bool,
    ) -> Dict[str, Any]:
        device_doc = self._build_video_device_doc(
            serial=serial,
            ezviz_device=ezviz_device,
            sim_card_id=sim_card_id,
            card=card,
            now=now,
        )

        if not dry_run:
            collection.insert_one(device_doc)

        return {
            "device_serial": serial,
            "device_name": device_doc.get("name"),
            "sim_card_id": sim_card_id,
            "status": "imported",
            "new_id": device_doc.get("id"),
        }

    def _build_video_device_doc(
        self,
        *,
        serial: str,
        ezviz_device: Dict[str, Any],
        sim_card_id: str,
        card: Optional[Dict[str, Any]],
        now: datetime,
    ) -> Dict[str, Any]:
        # 方案 A 需求：新增导入的摄像头在本地数据库中统一命名为“新摄像头”。
        # 萤石原始设备名称仍保存在 ezviz_device 字段中，返回结果里也会保留原始 device_name 便于核对。
        name = "新摄像头"
        device_id = get_next_sequence("video_device")

        status = ezviz_device.get("status")
        if status is None:
            status = ezviz_device.get("deviceStatus")

        return {
            "id": device_id,
            "name": name,
            "device_serial": serial,
            "deviceSerial": serial,
            "ezviz_serial": serial,
            "serial_number": serial,
            "sim_card_id": sim_card_id,
            "platform_type": "ezviz",
            "access_source": "cloud",
            "ptz_source": "ezviz",
            "stream_protocol": "ezopen",
            "channel_no": int(ezviz_device.get("channelNo") or ezviz_device.get("channel_no") or 1),
            "status": status if status is not None else 1,
            "is_active": 1,
            "createdAt": now,
            "updatedAt": now,
            "remark": "方案A扫描导入：萤石设备 + Hikiot SIM 匹配",
            "device_type": ezviz_device.get("deviceType") or ezviz_device.get("model") or "camera",
            "ezviz_device": self._compact_ezviz_device(ezviz_device),
            "hikiot_card": self._compact_hikiot_card(card),
        }

    def _find_video_device_by_serial(self, collection: Collection, serial: str) -> Optional[Dict[str, Any]]:
        return collection.find_one(
            {
                "$or": [
                    {"device_serial": serial},
                    {"deviceSerial": serial},
                    {"ezviz_serial": serial},
                    {"serial_number": serial},
                ]
            }
        )

    # ------------------------------------------------------------------
    # 数据整理与校验
    # ------------------------------------------------------------------
    def _build_sim_map(
        self,
        cards: List[Dict[str, Any]],
    ) -> Tuple[Dict[str, Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        sim_map: Dict[str, Dict[str, Any]] = {}
        duplicates: List[Dict[str, Any]] = []
        invalid_cards: List[Dict[str, Any]] = []

        for card in cards:
            remark = self._normalize_serial(card.get("remark"))
            iccid = str(card.get("iccid") or "").strip()

            if not remark or not iccid:
                invalid_cards.append(
                    {
                        "remark": card.get("remark"),
                        "iccid": card.get("iccid"),
                        "reason": "missing_remark_or_iccid",
                    }
                )
                continue

            if remark in sim_map:
                duplicates.append(
                    {
                        "remark": remark,
                        "iccid_list": [sim_map[remark].get("iccid"), iccid],
                        "reason": "duplicate_hikiot_remark",
                    }
                )
                # 冲突 remark 不参与自动绑定，避免绑定错 SIM。
                sim_map.pop(remark, None)
                continue

            sim_map[remark] = card

        return sim_map, duplicates, invalid_cards

    @staticmethod
    def _normalize_serial(value: Any) -> str:
        return str(value or "").strip().upper()

    @staticmethod
    def _get_ezviz_serial(device: Dict[str, Any]) -> str:
        return str(
            device.get("deviceSerial")
            or device.get("device_serial")
            or device.get("serial")
            or device.get("serialNo")
            or ""
        ).strip()

    @staticmethod
    def _get_ezviz_name(device: Dict[str, Any]) -> str:
        return str(
            device.get("deviceName")
            or device.get("device_name")
            or device.get("name")
            or device.get("model")
            or ""
        ).strip()

    @staticmethod
    def _compact_ezviz_device(device: Dict[str, Any]) -> Dict[str, Any]:
        keys = [
            "deviceSerial",
            "deviceName",
            "deviceType",
            "model",
            "status",
            "deviceStatus",
            "defence",
            "isEncrypt",
        ]
        return {key: device.get(key) for key in keys if key in device}

    @staticmethod
    def _compact_hikiot_card(card: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not card:
            return {}
        keys = [
            "iccid",
            "remark",
            "supplier",
            "channel",
            "totalFlow",
            "totalFlowUnit",
            "usedFlow",
            "usedFlowUnit",
            "residualFlow",
            "residualFlowUnit",
            "expiredTimes",
            "lastBuyPackageExpiredTimes",
            "effectExpiredTimes",
            "effectTotalFlow",
            "effectTotalFlowUnit",
            "effectResidualFlow",
            "effectResidualFlowUnit",
        ]
        return {key: card.get(key) for key in keys if key in card}


device_auto_import_service = DeviceAutoImportService()
