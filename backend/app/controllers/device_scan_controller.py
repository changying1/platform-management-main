# -*- coding: utf-8 -*-
"""
设备扫描导入接口（方案 A）

注册后提供接口：
POST /video/devices/scan-import

main.py 中需要增加：

from app.controllers import device_scan_controller

app.include_router(device_scan_controller.router)
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user
from app.services.device_auto_import_service import device_auto_import_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/video/devices", tags=["Device Scan Import"])


@router.post("/scan-import")
def scan_import_video_devices(
    dry_run: bool = Query(False, description="只扫描不写入数据库，用于测试"),
    overwrite_sim: bool = Query(False, description="本地已有不同 sim_card_id 时是否覆盖，默认不覆盖"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    方案 A 扫描导入摄像头。

    执行逻辑：
    1. 拉萤石设备列表。
    2. 拉 Hikiot 流量卡列表。
    3. 用 Hikiot remark -> iccid 建立 SIM 映射。
    4. 以萤石 deviceSerial 为准写入本地 video_device。
    5. Hikiot remark 不在萤石列表中时，只返回 unmatched_remarks，不自动创建摄像头。
    """
    try:
        result = device_auto_import_service.scan_import(
            dry_run=dry_run,
            overwrite_sim=overwrite_sim,
        )
        result["operator"] = {
            "id": current_user.get("id"),
            "username": current_user.get("username"),
            "role": current_user.get("role"),
        }
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("设备扫描导入失败")
        raise HTTPException(
            status_code=500,
            detail=f"设备扫描导入失败：{exc}",
        ) from exc


@router.get("/scan-import/config-check")
def scan_import_config_check(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    检查方案 A 需要的环境变量是否已经配置。
    不返回 token 明文，只返回是否存在。
    """
    import os

    return {
        "success": True,
        "mode": "scheme_a",
        "ezviz": {
            "EZVIZ_BASE_URL": os.getenv("EZVIZ_BASE_URL", "https://open.ys7.com"),
            "EZVIZ_APP_KEY": bool(os.getenv("EZVIZ_APP_KEY")),
            "EZVIZ_APP_SECRET": bool(os.getenv("EZVIZ_APP_SECRET")),
        },
        "hikiot": {
            "HIKIOT_BASE_URL": os.getenv("HIKIOT_BASE_URL", os.getenv("HIKIOT_API_BASE_URL", "https://api.hikiot.com/api-saas/v1")),
            "HIKIOT_APP_NO": os.getenv("HIKIOT_APP_NO", "__UNI_3109F91"),
            "HIKIOT_TERMINAL": os.getenv("HIKIOT_TERMINAL", "2"),
            "HIKIOT_DEVICE_ID": bool(os.getenv("HIKIOT_DEVICE_ID") or os.getenv("HIKIOT_DEVICEID")),
            "HIKIOT_BEARER_TOKEN": bool(os.getenv("HIKIOT_BEARER_TOKEN")),
        },
        "operator": {
            "id": current_user.get("id"),
            "username": current_user.get("username"),
        },
    }
