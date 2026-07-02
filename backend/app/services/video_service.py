import json

import shutil



from sqlalchemy.orm import Session
from urllib.parse import urlparse

from typing import Optional, List, Dict, Any, Set, Tuple

from types import SimpleNamespace

from app.schemas.video_schema import VideoCreate, VideoUpdate, CameraCreateRequest
from app.core.data_scope import in_scope, scope_filter

from app.utils.logger import get_logger

import requests

import re

import os

import glob

import time

import threading

import subprocess

import signal

from datetime import datetime, timezone, timedelta

import logging

import sys

import hashlib

import base64

import uuid

from pathlib import Path

import cv2

from app.services.ai_runtime import detect_frame



VideoDevice = Any



RECORDING_PROCESSES = {}
RECORDING_ROLLOVER_LAST_AT: Dict[int, float] = {}
TEMP_BUFFER_PROCESSES = {}





# [閺冦儱绻旈崢瀣煑]

def suppress_verbose_logging():

    for logger_name in ["zeep", "urllib3", "onvif", "wsdl", "requests"]:

        logger = logging.getLogger(logger_name)

        logger.setLevel(logging.CRITICAL)

        logger.propagate = False





suppress_verbose_logging()

from pymongo.errors import PyMongoError, ServerSelectionTimeoutError

from app.core.database import (
    SessionLocal,
    describe_mongo_connection,
    get_video_device_collection,
    get_next_sequence,
    get_mongo_db,
    get_mongo_collection,
    is_mongo_available,
)
from app.core.ws_manager import push_alarm_threadsafe

try:

    import onvif

    from onvif import ONVIFCamera

except Exception:

    onvif = None

    ONVIFCamera = None



logger = get_logger("VideoService")



# --- 闁板秶鐤嗛柈銊ュ瀻 ---

NMS_HOST = "http://127.0.0.1:8001"

NMS_USER = "admin"

NMS_PASS = "123456"

NMS_MEDIA_ROOT = os.path.abspath(os.getenv("NMS_MEDIA_ROOT", r"C:\media"))



# --- 閸忋劌鐪紓鎾崇摠 ---

ONVIF_CLIENT_CACHE = {}



CAMERA_TIME_DRIFT_THRESHOLD_SECONDS = int(os.getenv("CAMERA_TIME_DRIFT_THRESHOLD_SECONDS", "120"))

CAMERA_TIME_SYNC_COOLDOWN_SECONDS = int(os.getenv("CAMERA_TIME_SYNC_COOLDOWN_SECONDS", "1800"))

CAMERA_TIMEZONE_TZ = os.getenv("CAMERA_TIMEZONE_TZ", "CST-8:00:00")

CAMERA_TIME_SYNC_CACHE: Dict[int, float] = {}



# [閺傛澘顤僝 閸忋劌鐪€涙鍚€閿涙氨鏁ゆ禍搴＄摠閸屻劍顒滈崷銊ㄧ箥鐞涘瞼娈?FFmpeg 鏉╂稓鈻?{stream_name: process_object}

FFMPEG_PROCESSES = {}

DEFAULT_VIDEO_STORAGE_FOLDERS = {
    "recordings": "recordings",
    "alarm_videos": "alarm_videos",
    "playback_videos": "playback_videos",
    "temp_cache": "temp_cache",
    "alarm_screenshots": "alarm_screenshots",
}

EZVIZ_TOKEN_CACHE: Dict[str, Any] = {"access_token": None, "expire_at": 0.0}

EZVIZ_TOKEN_LOCK = threading.Lock()

EZVIZ_PTZ_LAST_DIRECTION: Dict[int, int] = {}

EZVIZ_PTZ_LAST_STOP_AT: Dict[int, float] = {}



EZVIZ_BASE_URL = os.getenv("EZVIZ_BASE_URL", "https://open.ys7.com").rstrip("/")

EZVIZ_APP_KEY = os.getenv("EZVIZ_APP_KEY", "")

EZVIZ_APP_SECRET = os.getenv("EZVIZ_APP_SECRET", "")

DEFAULT_STREAM_PROTOCOL = os.getenv("VIDEO_DEFAULT_STREAM_PROTOCOL", "ezopen")



STREAM_PROTOCOL_MAP = {

    "ezopen": 1,

    "hls": 2,

    "rtmp": 3,

    "flv": 4,

}



EZVIZ_DIRECTION_MAP = {

    "up": 0,

    "down": 1,

    "left": 2,

    "right": 3,

    "zoom_in": 8,

    "zoom_out": 9,

}



TOKEN_ERROR_CODES = {"10002", "10029", "10030", "10031", "20002"}

DEFAULT_WEEKLY_QUOTA_GB = float(os.getenv("VIDEO_DEFAULT_WEEKLY_QUOTA_GB", "5"))

DEFAULT_WEEKLY_QUOTA_BYTES = int(DEFAULT_WEEKLY_QUOTA_GB * 1024 * 1024 * 1024)

TRAFFIC_ALERT_THRESHOLD_RATIO = float(os.getenv("VIDEO_TRAFFIC_ALERT_THRESHOLD_RATIO", "0.2"))
MONTHLY_TRAFFIC_THRESHOLD_GB = float(os.getenv("VIDEO_MONTHLY_TRAFFIC_THRESHOLD_GB", "30"))
TRAFFIC_RESERVED_GB = float(os.getenv("TRAFFIC_RESERVED_GB", os.getenv("VIDEO_TRAFFIC_SAFETY_BUFFER_GB", "2")))
TRAFFIC_SAFETY_BUFFER_GB = TRAFFIC_RESERVED_GB
TRAFFIC_ALARM_REMAINING_GB = float(os.getenv("VIDEO_TRAFFIC_ALARM_REMAINING_GB", "2"))
TRAFFIC_OCR_SNAPSHOT_TIMEOUT_SECONDS = float(os.getenv("VIDEO_TRAFFIC_OCR_SNAPSHOT_TIMEOUT_SECONDS", "8"))
TRAFFIC_OCR_ENGINE_TIMEOUT_SECONDS = float(os.getenv("VIDEO_TRAFFIC_OCR_ENGINE_TIMEOUT_SECONDS", "5"))
TRAFFIC_OCR_DEBUG_IMAGE_ENV = "TRAFFIC_OCR_DEBUG_IMAGE_PATH"
TESSERACT_CMD_ENV = "TESSERACT_CMD"
BYTES_PER_GB = 1024 * 1024 * 1024
HIKIOT_FLOW_CARD_PATH = "/flow/card/user/page"
HIKIOT_FLOW_CARD_TIMEOUT_SECONDS = 10
HIKIOT_DEFAULT_BASE_URL = "https://api.hikiot.com/api-saas/v1"
HIKIOT_DEFAULT_APP_NO = "__UNI__3109F91"
HIKIOT_DEFAULT_TERMINAL = "2"
HIKIOT_FALLBACK_BEARER_TOKEN = "1b3040c4-ce5e-4a45-93d8-255674e0fd62"
HIKIOT_DISPLAY_RESERVED_GB = float(os.getenv("HIKIOT_DISPLAY_RESERVED_GB", "0.5"))
HIKIOT_LOGIN_TIMEOUT_SECONDS = float(os.getenv("HIKIOT_LOGIN_TIMEOUT_SECONDS", "10"))
HIKIOT_TOKEN_CACHE: Dict[str, Any] = {"token": "", "expires_at": 0.0}
EZVIZ_STATUS_POLL_INTERVAL_SECONDS = max(30, int(os.getenv("EZVIZ_STATUS_POLL_INTERVAL_SECONDS", "60")))
# 杩戝疄鏃跺洖鏀句緷璧栫煭鍒嗘锛涘父鎬佸洖鏀剧敱鐙珛褰掓。閫昏緫瀹屾垚锛屼笉涓庡垎娈垫椂闀跨粦瀹氥€?
RECORD_SEGMENT_SECONDS = int(os.getenv("VIDEO_RECORD_SEGMENT_SECONDS", "30"))

RECORD_SEGMENT_SAFE_MARGIN_SECONDS = int(os.getenv("VIDEO_RECORD_SEGMENT_SAFE_MARGIN_SECONDS", "8"))
MIN_RECORD_SEGMENT_BYTES = int(os.getenv("VIDEO_MIN_RECORD_SEGMENT_BYTES", str(64 * 1024)))
RECORDING_LIST_FFPROBE_TIMEOUT_SECONDS = float(os.getenv("VIDEO_RECORDING_LIST_FFPROBE_TIMEOUT_SECONDS", "2"))
RECORDING_LIST_MAX_SECONDS = float(os.getenv("VIDEO_RECORDING_LIST_MAX_SECONDS", "6"))
ALARM_VIDEO_FFMPEG_TIMEOUT_SECONDS = float(os.getenv("ALARM_VIDEO_FFMPEG_TIMEOUT_SECONDS", "60"))
PLAYBACK_ARCHIVE_WINDOW_HOURS = max(1, int(os.getenv("PLAYBACK_ARCHIVE_WINDOW_HOURS", "3")))

PLAYBACK_ARCHIVE_LOOKBACK_HOURS = max(PLAYBACK_ARCHIVE_WINDOW_HOURS,

                                      int(os.getenv("PLAYBACK_ARCHIVE_LOOKBACK_HOURS", "24")))

PERIODIC_ARCHIVE_LAST_RUN_AT: Dict[int, float] = {}

EZVIZ_PRESET_UNSUPPORTED_DEVICES: Set[int] = set()

EZVIZ_PRESET_CACHE: Dict[int, list[dict]] = {}

CRUISE_TASKS: Dict[int, dict] = {}

CRUISE_TASKS_LOCK = threading.Lock()



class VideoService:
    _ezviz_status_worker_lock = threading.Lock()
    _ezviz_status_worker_started = False
    _playback_index_lock = threading.Lock()
    _playback_index_cache: dict[str, Any] = {"expires_at": 0.0, "recordings": [], "alarms": []}

    def __init__(self):

        self._cleanup_thread_running = True

        self._mirror_thread_running = True
        self._ezviz_status_thread_running = True
        self._mirror_processed = set()

        self._storage_paths = []

        self._storage_paths = self._load_storage_paths()

        self._cleanup_thread = threading.Thread(target=self._periodic_cleanup_worker, daemon=True)

        self._cleanup_thread.start()

        self._mirror_thread = threading.Thread(target=self._mirror_sync_worker, daemon=True)

        self._mirror_thread.start()
        self.start_ezviz_status_worker()

    def start_ezviz_status_worker(self):
        with VideoService._ezviz_status_worker_lock:
            if VideoService._ezviz_status_worker_started:
                return
            VideoService._ezviz_status_worker_started = True

        self._ezviz_status_thread = threading.Thread(target=self._ezviz_status_polling_worker, daemon=True)
        self._ezviz_status_thread.start()
        logger.info("EZVIZ device status polling worker started")

    def _configure_pytesseract(self, pytesseract_module: Any) -> None:
        configured_cmd = str(os.getenv(TESSERACT_CMD_ENV, "") or "").strip()
        candidates = [
            configured_cmd,
            shutil.which("tesseract") or "",
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]
        for candidate in candidates:
            if candidate and os.path.exists(candidate):
                pytesseract_module.pytesseract.tesseract_cmd = candidate
                return



    def _video_collection(self):

        return get_mongo_collection("video_device")


    def _get_video_doc_by_id(self, video_id: int | str) -> Optional[dict]:

        collection = self._video_collection()

        doc = collection.find_one({"$or": [{"id": str(video_id)}, {"id": int(video_id) if str(video_id).isdigit() else video_id}]})
        return self._enrich_video_org_scope(doc)

    @staticmethod
    def _scope_text(value: Any) -> str:
        return str(value or "").strip()

    @staticmethod
    def _is_placeholder_org_value(value: Any) -> bool:
        text = str(value or "").strip().lower()
        return text in {"", "0", "?", "??", "string", "null", "none", "undefined", "--", "全部项目", "全部公司"}

    def _find_standard_device_doc(self, video_doc: dict | None) -> Optional[dict]:
        if not video_doc:
            return None

        candidates = []
        for value in (video_doc.get("device_id"), video_doc.get("bound_device_id"), video_doc.get("standard_device_id")):
            text = self._scope_text(value)
            if not text:
                continue
            candidates.extend([
                {"id": text},
                {"device_id": text},
            ])
            if text.isdigit():
                numeric = int(text)
                candidates.extend([
                    {"id": numeric},
                    {"_id": numeric},
                    {"device_id": numeric},
                    {"device_id": text},
                ])

        if not candidates:
            return None

        try:
            return get_mongo_collection("device").find_one({"$or": candidates}, {"_id": 0})
        except Exception:
            return None

    def _find_project_doc(self, project_id: Any = None, project_name: Any = None) -> Optional[dict]:
        queries = []
        project_id_text = self._scope_text(project_id)
        if project_id_text:
            queries.append({"id": project_id_text})
            if project_id_text.isdigit():
                queries.extend([{"id": int(project_id_text)}, {"_id": int(project_id_text)}])

        project_name_text = self._scope_text(project_name)
        if project_name_text and not self._is_placeholder_org_value(project_name_text):
            queries.append({"name": project_name_text})

        if not queries:
            return None

        for collection_name in ("project", "projects", "sql_projects"):
            try:
                project = get_mongo_collection(collection_name).find_one({"$or": queries}, {"_id": 0})
            except Exception:
                project = None
            if project:
                return project
        return None

    def _find_branch_doc(self, branch_id: Any = None, branch_name: Any = None) -> Optional[dict]:
        queries = []
        branch_id_text = self._scope_text(branch_id)
        if branch_id_text and not self._is_placeholder_org_value(branch_id_text):
            queries.append({"id": branch_id_text})
            if branch_id_text.isdigit():
                queries.extend([{"id": int(branch_id_text)}, {"_id": int(branch_id_text)}])

        branch_name_text = self._scope_text(branch_name)
        if branch_name_text and not self._is_placeholder_org_value(branch_name_text):
            queries.append({"name": branch_name_text})

        if not queries:
            return None

        for collection_name in ("branch", "branches", "sql_branches"):
            try:
                branch = get_mongo_collection(collection_name).find_one({"$or": queries}, {"_id": 0})
            except Exception:
                branch = None
            if branch:
                return branch
        return None

    def _find_grid_doc(self, grid_id: Any = None, grid_name: Any = None) -> Optional[dict]:
        queries = []
        grid_id_text = self._scope_text(grid_id)
        if grid_id_text and not self._is_placeholder_org_value(grid_id_text):
            queries.extend([
                {"grid_id": grid_id_text},
                {"id": grid_id_text},
                {"unit_id": grid_id_text},
            ])

        grid_name_text = self._scope_text(grid_name)
        if grid_name_text and not self._is_placeholder_org_value(grid_name_text):
            queries.append({"name": grid_name_text})

        if not queries:
            return None

        try:
            return get_mongo_collection("grid").find_one({"$or": queries}, {"_id": 0})
        except Exception:
            return None

    def _canonicalize_video_org_payload(self, payload: dict) -> dict:
        payload = dict(payload or {})

        grid_id = self._scope_text(payload.get("grid_id"))
        grid_doc = self._find_grid_doc(grid_id, payload.get("grid"))
        if grid_id and not grid_doc:
            raise ValueError("鎵€灞炵綉鏍间笉瀛樺湪")

        if grid_doc:
            grid_project_id = self._scope_text(grid_doc.get("project_id"))
            if not grid_project_id:
                raise ValueError("鎵€灞炵綉鏍兼湭缁戝畾椤圭洰")
            requested_project_id = self._scope_text(payload.get("project_id"))
            if requested_project_id and not self._is_placeholder_org_value(requested_project_id) and requested_project_id != grid_project_id:
                raise ValueError("设备所属项目与网格所属项目不一致")
            payload["grid_id"] = self._scope_text(grid_doc.get("grid_id") or grid_doc.get("id") or grid_id)
            payload["grid"] = grid_doc.get("name") or payload.get("grid")
            payload["project_id"] = grid_project_id

        project_id = self._scope_text(payload.get("project_id"))
        project_name = self._scope_text(payload.get("project"))
        project_by_id = self._find_project_doc(project_id, None) if project_id and not self._is_placeholder_org_value(project_id) else None
        project_by_name = self._find_project_doc(None, project_name) if project_name and not self._is_placeholder_org_value(project_name) else None

        if project_by_id and project_by_name:
            id_from_id = self._scope_text(project_by_id.get("id") or project_by_id.get("project_id"))
            id_from_name = self._scope_text(project_by_name.get("id") or project_by_name.get("project_id"))
            if id_from_id and id_from_name and id_from_id != id_from_name:
                raise ValueError("设备所属项目ID与项目名称不一致")

        project_doc = project_by_id or project_by_name
        if project_id and not project_doc:
            raise ValueError("鎵€灞為」鐩笉瀛樺湪")

        if project_doc:
            canonical_project_id = self._scope_text(project_doc.get("id") or project_doc.get("project_id"))
            canonical_branch_id = self._scope_text(project_doc.get("branch_id"))
            if canonical_project_id:
                payload["project_id"] = canonical_project_id
            project_name = project_doc.get("name") or project_doc.get("project_name")
            if project_name:
                payload["project"] = project_name
            if canonical_branch_id:
                payload["branch_id"] = canonical_branch_id
                branch_doc = self._find_branch_doc(canonical_branch_id, None)
                if branch_doc:
                    payload["company"] = branch_doc.get("name")

        return payload

    def _enrich_video_org_scope(self, doc: dict | None) -> dict | None:
        if not doc:
            return doc

        enriched = dict(doc)
        standard_device = self._find_standard_device_doc(enriched)
        if standard_device:
            for field in ("branch_id", "project_id", "grid_id", "team_id"):
                if self._is_placeholder_org_value(enriched.get(field)) and not self._is_placeholder_org_value(standard_device.get(field)):
                    enriched[field] = standard_device.get(field)

            for target, sources in {
                "company": ("company", "department", "branch_name"),
                "project": ("project", "project_name"),
                "grid": ("grid", "grid_name"),
                "team": ("team", "workTeam", "work_team", "team_name"),
            }.items():
                if not self._is_placeholder_org_value(enriched.get(target)):
                    continue
                for source in sources:
                    if not self._is_placeholder_org_value(standard_device.get(source)):
                        enriched[target] = standard_device.get(source)
                        break

        grid_doc = self._find_grid_doc(enriched.get("grid_id"), enriched.get("grid"))
        if grid_doc:
            grid_project_id = self._scope_text(grid_doc.get("project_id"))
            if grid_project_id and not self._is_placeholder_org_value(grid_project_id):
                enriched["project_id"] = grid_project_id
            if self._is_placeholder_org_value(enriched.get("grid")):
                enriched["grid"] = grid_doc.get("name")

        project_doc = self._find_project_doc(enriched.get("project_id"), enriched.get("project"))
        if project_doc:
            project_name = project_doc.get("name") or project_doc.get("project_name")
            if project_name:
                enriched["project"] = project_name
            if self._is_placeholder_org_value(enriched.get("project_id")):
                enriched["project_id"] = project_doc.get("id")
            project_branch_id = self._scope_text(project_doc.get("branch_id"))
            if project_branch_id and not self._is_placeholder_org_value(project_branch_id):
                enriched["branch_id"] = project_branch_id

        branch_doc = self._find_branch_doc(enriched.get("branch_id"), enriched.get("company"))
        project_name = self._scope_text(enriched.get("project"))
        company_name = self._scope_text(enriched.get("company"))
        if branch_doc and (self._is_placeholder_org_value(company_name) or company_name == project_name or self._scope_text(branch_doc.get("name")) != company_name):
            enriched["company"] = branch_doc.get("name")

        return enriched

    def _scope_kwargs(self) -> dict:
        return {
            "project_fields": ("project_id",),
            "grid_fields": ("grid_id", "grid"),
            "team_fields": ("team_id",),
            "branch_fields": ("branch_id",),
            "company_fields": ("company", "department"),
            "project_name_fields": ("project",),
            "team_name_fields": ("team", "workTeam", "work_team"),
        }

    def video_in_scope(self, video_id: int | str, current_user: dict | None) -> bool:
        if current_user is None:
            return True
        return in_scope(self._get_video_doc_by_id(video_id), current_user, **self._scope_kwargs())
    

    def _alarm_collection(self):

        return get_mongo_db()["alarm_record"]



    def _find_pending_alarm_doc(self, device_id: int | str, alarm_type: str):

        return self._alarm_collection().find_one({

            "device_id": str(device_id),

            "alarm_type": alarm_type,

            "status": "pending",

        })



    def _create_monitoring_alarm_doc(

        self,

        device_id: int | str,

        alarm_type: str,

        severity: str,

        description: str,

        location: str | None,
        device_name: str | None = None,
    ):

        next_id = int(get_next_sequence("alarm_record_id"))

        payload = {

            "id": next_id,

            "device_id": str(device_id),
            "device_name": device_name or str(device_id),
            "fence_id": None,

            "project_id": None,

            "alarm_type": alarm_type,

            "severity": severity,

            "timestamp": datetime.utcnow(),

            "description": description,

            "status": "pending",

            "handled_at": None,

            "location": location,

            "recording_path": "",

            "recording_status": "pending",

            "recording_error": "",

            "alarm_image_path": "",

        }
        from app.services.alarm_service import AlarmService

        payload = AlarmService()._apply_org_snapshot_to_payload(payload)

        self._alarm_collection().insert_one(payload)

        return payload

    def _json_safe_value(self, value: Any) -> Any:
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, dict):
            return {str(k): self._json_safe_value(v) for k, v in value.items() if k != "_id"}
        if isinstance(value, list):
            return [self._json_safe_value(item) for item in value]
        return value

    def _build_monitoring_alarm_websocket_payload(self, alarm_doc: dict) -> dict:
        doc = dict(alarm_doc or {})
        doc.pop("_id", None)
        image_path = doc.get("alarm_image_path") or ""
        video_path = doc.get("recording_path") or ""
        recording_error = doc.get("recording_error") or ""
        payload = {
            "id": doc.get("id"),
            "device_id": str(doc.get("device_id")) if doc.get("device_id") is not None else "",
            "device_name": doc.get("device_name") or doc.get("location") or str(doc.get("device_id") or ""),
            "fence_id": doc.get("fence_id"),
            "project_id": doc.get("project_id"),
            "alarm_type": doc.get("alarm_type") or "VIDEO_DEVICE_STATUS",
            "severity": doc.get("severity") or "medium",
            "timestamp": doc.get("timestamp"),
            "description": doc.get("description") or "",
            "status": doc.get("status") or "pending",
            "handled_at": doc.get("handled_at"),
            "location": doc.get("location") or doc.get("device_name") or "",
            "recording_path": video_path,
            "recording_status": doc.get("recording_status") or "pending",
            "recording_error": recording_error,
            "alarm_image_path": image_path,
            "personnel_id": doc.get("personnel_id") or "",
            "person_name": doc.get("person_name") or "",
            "person": doc.get("person") or {},
            "image_url": image_path,
            "snapshot_url": image_path,
            "picture_url": image_path,
            "video_url": video_path,
            "clip_url": video_path,
            "duration": doc.get("duration"),
            "duration_seconds": doc.get("duration_seconds"),
            "video_duration": doc.get("video_duration"),
            "clip_duration": doc.get("clip_duration"),
            "start_time": doc.get("recording_start_time") or doc.get("start_time"),
            "end_time": doc.get("recording_end_time") or doc.get("end_time"),
            "error_message": recording_error,
        }
        return self._json_safe_value(payload)

    def _resolve_monitoring_alarm_doc(self, alarm_id: int | str):

        self._alarm_collection().update_one(

            {"id": int(alarm_id)},

            {

                "$set": {

                    "status": "resolved",

                    "handled_at": datetime.utcnow(),

                }

            }

        )



    def _get_video_runtime_by_id(self, video_id: int | str):

        doc = self._get_video_doc_by_id(video_id)

        if not doc:

            return None



        runtime_doc = dict(doc)

        runtime_doc.pop("_id", None)



        runtime_doc["id"] = int(runtime_doc["id"]) if str(runtime_doc.get("id", "")).isdigit() else runtime_doc.get("id")

        runtime_doc["port"] = runtime_doc.get("port", 80)

        runtime_doc["channel_no"] = runtime_doc.get("channel_no", 1)

        runtime_doc["supports_ptz"] = runtime_doc.get("supports_ptz", 1)

        runtime_doc["supports_preset"] = runtime_doc.get("supports_preset", 1)

        runtime_doc["supports_cruise"] = runtime_doc.get("supports_cruise", 1)

        runtime_doc["supports_zoom"] = runtime_doc.get("supports_zoom", 1)

        runtime_doc["supports_focus"] = runtime_doc.get("supports_focus", 0)

        runtime_doc["status"] = runtime_doc.get("status") or "offline"

        runtime_doc["is_active"] = runtime_doc.get("is_active", 1)

        runtime_doc["sleeping"] = runtime_doc.get("sleeping", False)

        runtime_doc["privacy_enabled"] = runtime_doc.get("privacy_enabled", False)

        runtime_doc["storage_abnormal"] = runtime_doc.get("storage_abnormal", False)

        runtime_doc["low_battery"] = runtime_doc.get("low_battery", False)

        runtime_doc["weak_signal"] = runtime_doc.get("weak_signal", False)

        runtime_doc["weekly_quota_bytes"] = runtime_doc.get("weekly_quota_bytes", DEFAULT_WEEKLY_QUOTA_BYTES)



        return SimpleNamespace(**runtime_doc)



    def _update_video_fields(self, video_id: int | str, updates: dict):

        clean_updates = {k: v for k, v in (updates or {}).items() if k != "_id"}

        if not clean_updates:

            return

        clean_updates["updatedAt"] = datetime.utcnow()

        self._video_collection().update_one(

            {"$or": [{"id": str(video_id)}, {"id": int(video_id) if str(video_id).isdigit() else video_id}]},
            {"$set": clean_updates}

        )



    def _prepare_video_payload(self, payload: dict) -> dict:

        payload = dict(payload or {})



        payload["stream_protocol"] = self._normalize_stream_protocol(payload.get("stream_protocol"))

        payload["platform_type"] = payload.get("platform_type") or "onvif"

        payload["access_source"] = payload.get("access_source") or "local"

        payload["ptz_source"] = payload.get("ptz_source") or "onvif"

        payload["sim_card_id"] = payload.get("sim_card_id")

        payload["channel_no"] = payload.get("channel_no") or 1

        payload["supports_ptz"] = payload.get("supports_ptz", 1)

        payload["supports_preset"] = payload.get("supports_preset", 1)

        payload["supports_cruise"] = payload.get("supports_cruise", 1)

        payload["supports_zoom"] = payload.get("supports_zoom", 1)

        payload["supports_focus"] = payload.get("supports_focus", 0)

        payload["status"] = payload.get("status") or "offline"

        payload["is_active"] = payload.get("is_active", 1)

        payload["company"] = payload.get("company")

        payload["project"] = payload.get("project")

        payload["sleeping"] = payload.get("sleeping", False)

        payload["privacy_enabled"] = payload.get("privacy_enabled", False)

        payload["storage_abnormal"] = payload.get("storage_abnormal", False)

        payload["low_battery"] = payload.get("low_battery", False)

        payload["weak_signal"] = payload.get("weak_signal", False)

        payload["weekly_quota_bytes"] = payload.get("weekly_quota_bytes", DEFAULT_WEEKLY_QUOTA_BYTES)



        return payload



    def _mongo_video_to_out(self, doc: dict) -> dict:

        if not doc:

            return {}

        holder_id = doc.get("holder_id") or doc.get("holder") or doc.get("owner_id")
        holder_name = doc.get("holder_name") or doc.get("responsible_person_name") or doc.get("manager_name")
        if holder_id and not holder_name:
            holder_name = self._resolve_person_name(holder_id)

        def as_text_or_none(value: Any) -> Optional[str]:
            if value in [None, ""]:
                return None
            return str(value)



        return {

            "id": str(doc.get("id", "")),

            "name": doc.get("name"),

            "ip_address": doc.get("ip_address"),

            "port": doc.get("port", 80),

            "username": doc.get("username"),

            "password": doc.get("password"),

            "stream_url": doc.get("stream_url"),

            "rtsp_url": doc.get("rtsp_url"),

            "stream_protocol": doc.get("stream_protocol"),

            "platform_type": doc.get("platform_type"),

            "access_source": doc.get("access_source"),

            "ptz_source": doc.get("ptz_source"),

            "device_serial": doc.get("device_serial"),
            "sim_card_id": as_text_or_none(doc.get("sim_card_id")),

            "channel_no": doc.get("channel_no", 1),

            "supports_ptz": doc.get("supports_ptz", 1),

            "supports_preset": doc.get("supports_preset", 1),

            "supports_cruise": doc.get("supports_cruise", 1),

            "supports_zoom": doc.get("supports_zoom", 1),

            "supports_focus": doc.get("supports_focus", 0),

            "latitude": doc.get("latitude"),

            "longitude": doc.get("longitude"),

            "status": doc.get("status"),
            "sleeping": doc.get("sleeping", False),
            "privacy_enabled": doc.get("privacy_enabled", False),
            "storage_abnormal": doc.get("storage_abnormal", False),
            "low_battery": doc.get("low_battery", False),
            "weak_signal": doc.get("weak_signal", False),
            "last_status_checked_at": doc.get("last_status_checked_at"),
            "last_status_error": doc.get("last_status_error"),
            "remark": doc.get("remark"),

            "is_active": doc.get("is_active", 1),

            "company": doc.get("company"),
            "branch_id": as_text_or_none(doc.get("branch_id")),

            "project": doc.get("project"),
            "project_id": as_text_or_none(doc.get("project_id")),

            "grid": as_text_or_none(doc.get("grid") or doc.get("grid_name") or doc.get("grid_id")),

            "grid_id": as_text_or_none(doc.get("grid_id")),

            "team": as_text_or_none(doc.get("team") or doc.get("workTeam") or doc.get("work_team") or doc.get("team_id") or doc.get("install_location")),

            "team_id": as_text_or_none(doc.get("team_id")),

            "device_type": as_text_or_none(doc.get("device_type") or doc.get("type")),

            "holder": as_text_or_none(doc.get("holder") or holder_name or holder_id),

            "holder_id": as_text_or_none(holder_id),

            "holder_name": as_text_or_none(holder_name),

            "responsible_person": as_text_or_none(doc.get("responsible_person") or doc.get("responsiblePerson") or holder_name or holder_id),

            "responsible_person_name": as_text_or_none(doc.get("responsible_person_name") or holder_name),

            "manager_name": as_text_or_none(doc.get("manager_name")),

        }

    def _resolve_person_name(self, person_ref: Any) -> str:
        person_key = str(person_ref or "").strip()
        if not person_key:
            return ""

        queries = [
            {"employeeId": person_key},
            {"employee_id": person_key},
            {"employee_code": person_key},
            {"username": person_key},
            {"name": person_key},
        ]
        if person_key.isdigit():
            queries.extend([
                {"id": int(person_key)},
                {"_id": int(person_key)},
            ])

        try:
            person = get_mongo_collection("personnel").find_one(
                {"$or": queries},
                {"_id": 0, "username": 1, "name": 1, "employeeId": 1, "employee_code": 1},
            )
        except Exception:
            return ""

        if not person:
            return ""

        return str(
            person.get("username")
            or person.get("name")
            or person.get("employeeId")
            or person.get("employee_code")
            or ""
        )

    

    def _mirror_sync_worker(self):

        while self._mirror_thread_running:

            try:

                self._sync_all_new_files()

            except Exception as e:

                logger.error(f"闂€婊冨剼閸氬本顒為幍顐ｅ伎婢惰精瑙? {e}")

            time.sleep(60)



    def _sync_all_new_files(self):

        if len(self._storage_paths) == 0:

            return



        primary_root = self._storage_paths[0]["path"]



        folders = self._get_video_storage_folders()
        for subdir in [folders["recordings"], folders["alarm_videos"], folders["alarm_screenshots"]]:

            root_dir = os.path.join(primary_root, subdir)

            if not os.path.exists(root_dir):

                continue



            for dirpath, _, filenames in os.walk(root_dir):

                for filename in filenames:

                    if not filename.lower().endswith((".mp4", ".jpg", ".jpeg", ".png")):

                        continue



                    filepath = os.path.join(dirpath, filename)

                    file_key = f"{filepath}_{os.path.getmtime(filepath)}"



                    if file_key in self._mirror_processed:

                        continue



                    if not self._is_segment_usable(filepath, min_age_seconds=120):

                        continue



                    rel_path = os.path.relpath(filepath, primary_root)

                    self._mirror_write_file(filepath, rel_path)

                    self._mirror_processed.add(file_key)



    def _mirror_write_file(self, source_file: str, relative_path: str):

        for sp in self._storage_paths:

            if not sp.get("enabled", True) or sp.get("type") == "primary":

                continue

            mirror_type = sp.get("type", "mirror")
            if mirror_type == "mirror" and not self._get_local_storage_roots_enabled():
                continue
            if mirror_type in {"oss", "cos", "s3"} and not self._get_cloud_storage_enabled():
                continue



            try:

                if mirror_type == "mirror":

                    target_path = os.path.join(sp["path"], relative_path)



                    if os.path.exists(target_path) and os.path.getsize(target_path) == os.path.getsize(source_file):

                        continue



                    os.makedirs(os.path.dirname(target_path), exist_ok=True)

                    shutil.copy2(source_file, target_path)

                    logger.info(f"閺堫剙婀撮梹婊冨剼鐎瑰本鍨? {sp['name']} -> {relative_path}")



                elif mirror_type == "oss":

                    self._upload_to_oss(sp, source_file, relative_path)



                elif mirror_type == "cos":

                    self._upload_to_cos(sp, source_file, relative_path)



                elif mirror_type == "s3":

                    self._upload_to_s3(sp, source_file, relative_path)



            except Exception as e:

                logger.error(f"闂€婊冨剼閸愭瑥鍙嗘径杈Е {sp.get('name')}: {e}")



    def _upload_to_oss(self, config: Dict, source_file: str, object_key: str):

        try:

            import oss2

            auth = oss2.Auth(config["access_key"], config["secret_key"])

            bucket = oss2.Bucket(auth, config["endpoint"], config["bucket"])

            bucket.put_object_from_file(object_key, source_file)

            logger.info(f"OSS 娑撳﹣绱剁€瑰本鍨? {config['name']} -> {object_key}")

        except Exception as e:

            logger.error(f"OSS 娑撳﹣绱舵径杈Е: {e}")



    def _upload_to_cos(self, config: Dict, source_file: str, object_key: str):

        try:

            from qcloud_cos import CosConfig, CosS3Client

            cos_config = CosConfig(

                Region=config["region"],

                SecretId=config["access_key"],

                SecretKey=config["secret_key"],

            )

            client = CosS3Client(cos_config)

            client.upload_file(config["bucket"], object_key, source_file)

            logger.info(f"COS 娑撳﹣绱剁€瑰本鍨? {config['name']} -> {object_key}")

        except Exception as e:

            logger.error(f"COS 娑撳﹣绱舵径杈Е: {e}")



    def _upload_to_s3(self, config: Dict, source_file: str, object_key: str):

        try:

            import boto3

            s3 = boto3.client(

                "s3",

                aws_access_key_id=config["access_key"],

                aws_secret_access_key=config["secret_key"],

                endpoint_url=config.get("endpoint"),

            )

            s3.upload_file(source_file, config["bucket"], object_key)

            logger.info(f"S3 娑撳﹣绱剁€瑰本鍨? {config['name']} -> {object_key}")

        except Exception as e:

            logger.error(f"S3 娑撳﹣绱舵径杈Е: {e}")



    def _load_storage_paths(self) -> List[Dict]:

        config_file = os.path.join(self._get_default_static_root(), "storage_paths.json")



        try:

            if not os.path.exists(config_file):

                with open(config_file, "w", encoding="utf-8") as f:

                    json.dump([], f, ensure_ascii=False, indent=2)

                return []



            with open(config_file, "r", encoding="utf-8-sig") as f:

                data = json.load(f)



            if isinstance(data, list):

                return data



            if isinstance(data, dict):

                paths = data.get("paths")

                if isinstance(paths, list):

                    return paths



            logger.warning(f"鐎涙ê鍋嶇捄顖氱窞闁板秶鐤嗛弽鐓庣础瀵倸鐖?瀹告煡鍣哥純顔昏礋缁屽搫鍨悰? {config_file}")

            return []

        except Exception as e:

            logger.error(f"閸旂姾娴囩€涙ê鍋嶇捄顖氱窞闁板秶鐤嗘径杈Е: {e}")

            return []



    def _save_storage_paths(self, paths: List[Dict]):

        config_files = [os.path.join(self._get_default_static_root(), "storage_paths.json")]

        for sp in paths:

            if sp.get("enabled", True) and sp.get("type", "mirror") in {"mirror", "primary"}:

                config_files.append(os.path.join(self._resolve_storage_path(sp["path"]), "storage_paths.json"))



        for config_file in dict.fromkeys(config_files):

            os.makedirs(os.path.dirname(config_file), exist_ok=True)

            with open(config_file, "w", encoding="utf-8") as f:

                json.dump(paths, f, ensure_ascii=False, indent=2)



        self._storage_paths = paths



    def get_storage_paths(self) -> List[Dict]:

        self._storage_paths = self._load_storage_paths()

        return self._storage_paths



    def add_storage_path(self, config: Dict) -> bool:

        self._refresh_storage_paths()

        path = config.get("path", "")

        name = config.get("name", "")

        mirror_type = config.get("type", "mirror")



        paths = self._storage_paths



        for sp in paths:

            if sp.get("path") == path:

                logger.warning(f"鐎涙ê鍋嶇捄顖氱窞瀹告彃鐡? {path}")

                return False



        if mirror_type == "mirror":

            try:

                os.makedirs(path, exist_ok=True)

                test_file = os.path.join(path, ".test_write")

                with open(test_file, "w", encoding="utf-8") as f:

                    f.write("test")

                os.remove(test_file)

            except Exception as e:

                logger.error(f"閺冪姵纭剁拋鍧楁６鐎涙ê鍋嶇捄顖氱窞 {path}: {e}")

                return False



        paths.append({

            "path": path,

            "name": name,

            "enabled": True,

            "type": mirror_type,

            "endpoint": config.get("endpoint"),

            "bucket": config.get("bucket"),

            "access_key": config.get("access_key"),

            "secret_key": config.get("secret_key"),

            "region": config.get("region"),

        })



        self._save_storage_paths(paths)

        logger.info(f"瀹稿弶鍧婇崝鐘茬杽閺冨爼鏆呴崓蹇撶摠? {name} ({mirror_type})")

        return True



    def delete_storage_path(self, index: int) -> bool:

        self._refresh_storage_paths()

        paths = self._storage_paths



        if 0 <= index < len(paths):

            removed = paths.pop(index)

            self._save_storage_paths(paths)

            logger.info(f"瀹告彃鍨归梽銈呯摠閸屻劏鐭? {removed.get('name')}")

            return True



        return False



    def set_primary_storage(self, index: int) -> bool:

        self._refresh_storage_paths()

        paths = self._storage_paths



        if 0 < index < len(paths):

            paths[0], paths[index] = paths[index], paths[0]

            self._save_storage_paths(paths)

            logger.info(f"娑撹鐡ㄩ崒銊ュ嚒閸掑洦宕? {paths[0].get('name')}")

            return True



        return False



    def _periodic_cleanup_worker(self):

        while self._cleanup_thread_running:

            try:
                # 妫€鏌ュ瓨鍌ㄧ┖闂村苟棰勮
                self.check_storage_space()
                
                # 娓呯悊杩囨湡鏂囦欢
                self.cleanup_expired_files()

            except Exception as e:

                logger.error(f"濞撳懐鎮婃潻鍥ㄦ埂閺傚洣娆㈡径杈Е: {e}")

            time.sleep(3600)



    def cleanup_expired_files(self):

        config = self._get_system_config()

        if not bool(config.get("storageAutoCleanup", True)):

            return

        cleanup_strategy = config.get("storageCleanupStrategy", "both")

        if cleanup_strategy not in ["age", "both"]:

            return

        now = datetime.now()



        video_retention_days = self._coerce_positive_float(config.get("videoRetentionDays", 15), 15, 1, 3650)

        alarm_video_retention_days = self._coerce_positive_float(config.get("alarmVideoRetentionDays", 90), 90, 1, 3650)

        alarm_screenshot_retention_days = self._coerce_positive_float(config.get("alarmScreenshotRetentionDays", 90), 90, 1, 3650)



        record_root = self._get_record_root()

        alarm_video_root = self._get_alarm_video_root()

        storage_root = self._get_storage_root()

        alarm_screenshot_root = os.path.join(storage_root, self._folder("alarm_screenshots"))



        count_cleaned = 0



        cleanup_targets = []
        for storage_root in self._get_enabled_local_storage_roots(include_default=True):
            cleanup_targets.extend([
                (os.path.join(storage_root, self._folder("recordings")), video_retention_days),
                (os.path.join(storage_root, self._folder("alarm_videos")), alarm_video_retention_days),
                (os.path.join(storage_root, "alarms"), alarm_screenshot_retention_days),
                (os.path.join(storage_root, self._folder("alarm_screenshots")), alarm_screenshot_retention_days),
            ])

        for root_dir, retention_days in dict.fromkeys(cleanup_targets):

            if not os.path.exists(root_dir):

                continue



            cutoff = now - timedelta(days=retention_days)



            for dirpath, _, filenames in os.walk(root_dir):

                for filename in filenames:

                    if not filename.lower().endswith((".mp4", ".jpg", ".jpeg", ".png")):

                        continue



                    filepath = os.path.join(dirpath, filename)



                    try:

                        mtime = datetime.fromtimestamp(os.path.getmtime(filepath))

                        if mtime < cutoff:

                            os.remove(filepath)

                            count_cleaned += 1

                    except Exception:

                        pass



        if count_cleaned > 0:

            logger.info(f"瀹稿弶绔?{count_cleaned} 娑擃亣绻冮張鐔风秿?閹搭亜娴橀弬鍥︽")



    def check_storage_space(self) -> Dict:
        # Check storage usage and return status.
        import shutil
        
        config = self._get_system_config()
        max_size_gb = config.get("storageMaxSizeGB", 500)
        warning_threshold = config.get("storageWarningThreshold", 80)
        critical_threshold = config.get("storageCriticalThreshold", 95)
        auto_cleanup = config.get("storageAutoCleanup", True)
        cleanup_strategy = config.get("storageCleanupStrategy", "both")
        
        results = []
        
        for storage_root in self._get_enabled_local_storage_roots(include_default=True):
            try:
                # 鑾峰彇纾佺洏浣跨敤鎯呭喌
                total, used, free = shutil.disk_usage(storage_root)
                usage_percent = (used / total) * 100 if total > 0 else 0
                
                # 璁＄畻瑙嗛瀛樺偍鐩綍澶у皬
                video_size = self._get_directory_size(storage_root)
                video_size_gb = video_size / (1024**3)
                
                # 鍒ゆ柇鏄惁瓒呰繃瀹归噺闄愬埗
                over_capacity = video_size_gb > max_size_gb
                
                # 纭畾鐘舵€?
                if usage_percent >= critical_threshold or over_capacity:
                    status = "critical"
                elif usage_percent >= warning_threshold:
                    status = "warning"
                else:
                    status = "normal"
                
                result = {
                    "path": storage_root,
                    "total_gb": total / (1024**3),
                    "used_gb": used / (1024**3),
                    "free_gb": free / (1024**3),
                    "usage_percent": round(usage_percent, 2),
                    "video_size_gb": round(video_size_gb, 2),
                    "max_size_gb": max_size_gb,
                    "over_capacity": over_capacity,
                    "status": status,
                }
                results.append(result)
                
                # 璁板綍鏃ュ織
                if status == "critical":
                    logger.error(f"瀛樺偍绌洪棿绱ф€? {storage_root} 浣跨敤鐜?{usage_percent:.1f}%, 瑙嗛鍗犵敤 {video_size_gb:.1f}GB")
                    if auto_cleanup and cleanup_strategy in ["space", "both"]:
                        self._emergency_cleanup(storage_root, max_size_gb)
                elif status == "warning":
                    logger.warning(f"瀛樺偍绌洪棿璀﹀憡: {storage_root} 浣跨敤鐜?{usage_percent:.1f}%, 瑙嗛鍗犵敤 {video_size_gb:.1f}GB")
                    
            except Exception as e:
                logger.error(f"妫€鏌ュ瓨鍌ㄧ┖闂村け璐?{storage_root}: {e}")
                
        return {
            "storages": results,
            "has_warning": any(r["status"] == "warning" for r in results),
            "has_critical": any(r["status"] == "critical" for r in results),
        }
    
    def _get_directory_size(self, path: str) -> int:
        # Calculate directory size.
        total = 0
        try:
            for dirpath, _, filenames in os.walk(path):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    if os.path.exists(fp):
                        total += os.path.getsize(fp)
        except Exception:
            pass
        return total
    
    def _emergency_cleanup(self, storage_root: str, target_size_gb: float):
        # Delete old media files until storage is under the target size.
        logger.warning(f"寮€濮嬬揣鎬ユ竻鐞? {storage_root}, 鐩爣澶у皬 {target_size_gb}GB")
        
        target_bytes = target_size_gb * 1024**3
        current_size = self._get_directory_size(storage_root)
        
        if current_size <= target_bytes:
            return
        
        # 鏀堕泦鎵€鏈夊彲鍒犻櫎鏂囦欢锛堟寜淇敼鏃堕棿鎺掑簭锛?
        files = []
        for dirpath, _, filenames in os.walk(storage_root):
            for f in filenames:
                if f.lower().endswith((".mp4", ".jpg", ".jpeg", ".png")):
                    fp = os.path.join(dirpath, f)
                    try:
                        mtime = os.path.getmtime(fp)
                        size = os.path.getsize(fp)
                        files.append((fp, mtime, size))
                    except Exception:
                        pass
        
        # 鎸夋椂闂存帓搴忥紙鍏堝垹鏃х殑锛?
        files.sort(key=lambda x: x[1])
        
        deleted_count = 0
        deleted_bytes = 0
        
        for filepath, _, filesize in files:
            if current_size - deleted_bytes <= target_bytes * 0.9:  # 娓呯悊鍒扮洰鏍囩殑90%
                break
                
            try:
                os.remove(filepath)
                deleted_bytes += filesize
                deleted_count += 1
            except Exception:
                pass
        
        logger.warning(f"绱ф€ユ竻鐞嗗畬鎴? 鍒犻櫎 {deleted_count} 涓枃浠? 閲婃斁 {deleted_bytes / (1024**3):.2f} GB")



    def _normalize_flag(self, value: Any) -> bool:

        if isinstance(value, bool):

            return value

        if value is None:

            return False

        if isinstance(value, (int, float)):

            return bool(value)

        return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}



    def _format_bytes(self, value: int) -> str:

        size = max(0, int(value or 0))

        units = ["B", "KB", "MB", "GB", "TB"]

        display = float(size)

        unit_index = 0

        while display >= 1024 and unit_index < len(units) - 1:

            display /= 1024

            unit_index += 1

        if unit_index == 0:

            return f"{int(display)}{units[unit_index]}"

        return f"{display:.2f}{units[unit_index]}"

    def _format_gb(self, value: Optional[float]) -> str:
        if value is None:
            return "--"
        return f"{max(0.0, float(value)):.2f}GB"

    def _traffic_unit_to_gb(self, value: float, unit: str) -> float:
        normalized_unit = str(unit or "").upper()
        if normalized_unit in {"T", "TB"}:
            return value * 1024
        if normalized_unit in {"M", "MB"}:
            return value / 1024
        return value

    def _integer_traffic_gb(self, value_gb: Any) -> int:
        try:
            return max(0, int(float(value_gb)))
        except (TypeError, ValueError, OverflowError):
            return 0

    def _format_traffic_candidate_text(self, value: float, unit: str) -> str:
        normalized_unit = str(unit or "").upper()
        if normalized_unit in {"G", "GB", "B"}:
            normalized_unit = "GB"
        elif normalized_unit in {"M", "MB"}:
            normalized_unit = "MB"
        elif normalized_unit in {"T", "TB"}:
            normalized_unit = "TB"
        value_text = f"{value:.6f}".rstrip("0").rstrip(".")
        return f"{value_text}{normalized_unit}"

    def _extract_traffic_ocr_candidates(self, ocr_text: str) -> list[dict]:
        raw_text = str(ocr_text or "")
        if not raw_text.strip():
            return []

        text = raw_text.upper()
        text = text.replace("O", "0").replace("L", "1").replace("I", "1")
        text = text.replace("G8", "GB").replace("M8", "MB").replace("T8", "TB")
        pattern = re.compile(r"(?<![A-Z])(\d+(?:[.,]\d+)?)(\s*)(TB|GB|MB|G|M|B)(?![A-Z])", re.IGNORECASE)
        text_len = max(1, len(text))
        candidates: list[dict] = []

        for match in pattern.finditer(text):
            raw_value = match.group(1)
            raw_unit = match.group(3).upper()
            raw_match = text[match.start():match.end()]

            try:
                value = float(raw_value.replace(",", "."))
            except (TypeError, ValueError):
                continue

            normalized_unit = raw_unit
            if normalized_unit == "B":
                normalized_unit = "GB"
            raw_value_gb = max(0.0, self._traffic_unit_to_gb(value, normalized_unit))
            integer_value_gb = self._integer_traffic_gb(raw_value_gb)
            value_gb = float(integer_value_gb)
            has_decimal = "." in raw_value or "," in raw_value
            position_ratio = match.start() / text_len
            following = text[match.end():match.end() + 12]

            excluded = False
            exclude_reason = ""
            if raw_unit == "G" and abs(value - 4.0) < 1e-9:
                excluded = True
                if re.match(r"\s*,\s*\d", following):
                    exclude_reason = "signal_4g_with_signal_number"
                else:
                    exclude_reason = "signal_4g"

            score = 0.0
            if normalized_unit in {"G", "GB"}:
                score += 40
                if has_decimal:
                    score += 120
                else:
                    score += 20
            elif normalized_unit in {"M", "MB"}:
                score += 10
                if has_decimal:
                    score += 20
            elif normalized_unit in {"T", "TB"}:
                score -= 20

            if 0 <= value_gb <= 100:
                score += 80
            else:
                score -= 180

            if position_ratio >= 0.5:
                score += 35
            score += min(25.0, position_ratio * 25.0)

            if excluded:
                score -= 1000

            candidates.append({
                "raw": raw_match.strip(),
                "text": f"{integer_value_gb}GB",
                "value": integer_value_gb,
                "unit": "GB",
                "raw_value_gb": raw_value_gb,
                "integer_value_gb": integer_value_gb,
                "value_gb": value_gb,
                "start": match.start(),
                "end": match.end(),
                "position_ratio": round(position_ratio, 4),
                "has_decimal": has_decimal,
                "excluded": excluded,
                "exclude_reason": exclude_reason,
                "score": round(score, 4),
            })

        candidates.sort(key=lambda item: item.get("score", 0), reverse=True)
        return candidates

    def _parse_traffic_ocr_text_with_candidates(self, ocr_text: str) -> tuple[Optional[tuple[float, str]], list[dict]]:
        candidates = self._extract_traffic_ocr_candidates(ocr_text)
        valid_candidates = [item for item in candidates if not item.get("excluded")]
        if not valid_candidates:
            return None, candidates

        best = valid_candidates[0]
        return (max(0.0, float(best["value_gb"])), str(best["text"])), candidates

    def _parse_traffic_ocr_text(self, ocr_text: str) -> Optional[tuple[float, str]]:
        parsed, _ = self._parse_traffic_ocr_text_with_candidates(ocr_text)
        return parsed

    def _format_hikiot_bearer(self, token: str) -> str:
        token = str(token or "").strip()
        if token and not token.lower().startswith("bearer "):
            return f"Bearer {token}"
        return token

    def _get_hikiot_static_token(self) -> str:
        return (
            os.getenv("HIKIOT_BEARER_TOKEN")
            or os.getenv("HIKIOT_AUTHORIZATION")
            or os.getenv("HIKIOT_AUTHORIZATION_BEARER")
            or os.getenv("HIKIOT_TOKEN")
            or os.getenv("HIKIOT_ACCESS_TOKEN")
            or HIKIOT_FALLBACK_BEARER_TOKEN
        ).strip()

    def _extract_hikiot_login_token(self, payload: Any) -> str:
        if not isinstance(payload, dict):
            return ""

        candidates = [
            payload.get("token"),
            payload.get("accessToken"),
            payload.get("access_token"),
            payload.get("authorization"),
        ]
        data = payload.get("data")
        if isinstance(data, dict):
            candidates.extend([
                data.get("token"),
                data.get("accessToken"),
                data.get("access_token"),
                data.get("authorization"),
            ])

        for candidate in candidates:
            token = str(candidate or "").strip()
            if token:
                return token
        return ""

    def _login_hikiot_token(self) -> str:
        login_url = str(os.getenv("HIKIOT_LOGIN_URL", "") or "").strip()
        username = str(os.getenv("HIKIOT_USERNAME", "") or "").strip()
        password = str(os.getenv("HIKIOT_PASSWORD", "") or "").strip()
        if not login_url:
            return ""
        if not username or not password:
            raise ValueError("Hikiot login is configured, but HIKIOT_USERNAME or HIKIOT_PASSWORD is empty")

        payload_text = str(os.getenv("HIKIOT_LOGIN_PAYLOAD_JSON", "") or "").strip()
        if payload_text:
            payload = json.loads(payload_text)
        else:
            username_field = str(os.getenv("HIKIOT_LOGIN_USERNAME_FIELD", "phone") or "phone").strip()
            password_field = str(os.getenv("HIKIOT_LOGIN_PASSWORD_FIELD", "password") or "password").strip()
            payload = {username_field: username, password_field: password}
            if username_field != "username":
                payload.setdefault("username", username)

        response = requests.post(
            login_url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0",
                "appNo": os.getenv("HIKIOT_APP_NO") or os.getenv("HIKIOT_APPNO") or HIKIOT_DEFAULT_APP_NO,
                "terminal": os.getenv("HIKIOT_TERMINAL") or HIKIOT_DEFAULT_TERMINAL,
                **json.loads(str(os.getenv("HIKIOT_LOGIN_HEADERS_JSON", "{}") or "{}")),
            },
            timeout=HIKIOT_LOGIN_TIMEOUT_SECONDS,
        )
        if response.status_code >= 400:
            error_text = (response.text or "").strip()
            raise requests.HTTPError(
                f"Hikiot login returned {response.status_code}: {error_text[:300]}",
                response=response,
            )

        token = self._extract_hikiot_login_token(response.json())
        if not token:
            raise ValueError("Hikiot login response does not contain token")

        try:
            ttl_seconds = max(60, int(float(os.getenv("HIKIOT_TOKEN_TTL_SECONDS", "1800"))))
        except (TypeError, ValueError):
            ttl_seconds = 1800

        HIKIOT_TOKEN_CACHE["token"] = token
        HIKIOT_TOKEN_CACHE["expires_at"] = time.time() + ttl_seconds
        return token

    def _get_hikiot_authorization(self, force_login: bool = False) -> str:
        login_configured = bool(str(os.getenv("HIKIOT_LOGIN_URL", "") or "").strip())
        cached_token = str(HIKIOT_TOKEN_CACHE.get("token") or "").strip()
        cached_expires_at = float(HIKIOT_TOKEN_CACHE.get("expires_at") or 0)
        if login_configured and not force_login and cached_token and cached_expires_at > time.time() + 30:
            return self._format_hikiot_bearer(cached_token)

        if login_configured and force_login:
            return self._format_hikiot_bearer(self._login_hikiot_token())

        static_token = self._get_hikiot_static_token()
        if static_token and not force_login:
            return self._format_hikiot_bearer(static_token)

        if login_configured:
            return self._format_hikiot_bearer(self._login_hikiot_token())

        return self._format_hikiot_bearer(static_token)

    def _get_hikiot_config(self, force_login: bool = False) -> tuple[str, str, str, str]:
        base_url = (
            os.getenv("HIKIOT_BASE_URL")
            or os.getenv("HIKIOT_API_BASE_URL")
            or os.getenv("HIKIOT_FLOW_CARD_BASE_URL")
            or HIKIOT_DEFAULT_BASE_URL
        ).rstrip("/")
        token = self._get_hikiot_authorization(force_login=force_login)
        app_no = (os.getenv("HIKIOT_APP_NO") or os.getenv("HIKIOT_APPNO") or HIKIOT_DEFAULT_APP_NO).strip()
        terminal = (os.getenv("HIKIOT_TERMINAL") or HIKIOT_DEFAULT_TERMINAL).strip()
        if not token:
            raise ValueError("Hikiot traffic API token is not configured")
        if not app_no:
            raise ValueError("Hikiot traffic API appNo is not configured")
        if not terminal:
            raise ValueError("Hikiot traffic API terminal is not configured")
        return base_url, token, app_no, terminal

    def _fetch_hikiot_flow_cards(self) -> list[dict]:
        response = None
        for attempt in range(2):
            base_url, authorization, app_no, terminal = self._get_hikiot_config(force_login=attempt > 0)
            url = f"{base_url}{HIKIOT_FLOW_CARD_PATH}"
            headers = {
                "User-Agent": "Mozilla/5.0",
                "Authorization": authorization,
                "appNo": app_no,
                "terminal": terminal,
            }
            response = requests.get(
                url,
                params={"page": 1, "size": 50, "groupId": 0},
                headers=headers,
                timeout=HIKIOT_FLOW_CARD_TIMEOUT_SECONDS,
            )
            if response.status_code != 401:
                break
            if not str(os.getenv("HIKIOT_LOGIN_URL", "") or "").strip():
                break

        if response is None:
            raise ValueError("Hikiot traffic API did not return response")
        if response.status_code >= 400:
            error_text = (response.text or "").strip()
            raise requests.HTTPError(
                f"Hikiot traffic API returned {response.status_code}: {error_text[:300]}",
                response=response,
            )
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        data = payload.get("data") if isinstance(payload, dict) else None
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ("records", "list", "items", "data", "rows"):
                value = data.get(key)
                if isinstance(value, list):
                    return value
        return []

    def _query_hikiot_flow_card(self, sim_card_id: str | None = None) -> tuple[dict, list[dict], str]:
        cards = self._fetch_hikiot_flow_cards()
        first_card = next((item for item in cards if isinstance(item, dict)), None)
        normalized_sim_card_id = self._normalize_card_match_value(sim_card_id)
        if not cards or not first_card:
            raise ValueError("Hikiot娴侀噺鎺ュ彛鏈繑鍥炲崱鏁版嵁")

        if normalized_sim_card_id:
            matched_card = self._match_hikiot_flow_card(normalized_sim_card_id, cards)
            if matched_card:
                return matched_card, cards, "Hikiot娴侀噺璇嗗埆鎴愬姛"
            logger.warning(
                "鏈尮閰嶅埌 SIM锛屽凡浣跨敤绗竴鏉?Hikiot 鍗℃暟鎹?sim_card_id=%s",
                normalized_sim_card_id,
            )
            return first_card, cards, "SIM not matched; using first Hikiot card"

        return first_card, cards, "Hikiot娴侀噺璇嗗埆鎴愬姛"

    def _normalize_card_match_value(self, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    def _match_hikiot_flow_card(self, sim_card_id: Any, cards: list[dict]) -> Optional[dict]:
        target = self._normalize_card_match_value(sim_card_id)
        if not target:
            return None
        match_fields = ("cardId", "cardNo", "cardNumber", "iccid", "msisdn", "simCardId", "sim_card_id", "id")
        for card in cards or []:
            if not isinstance(card, dict):
                continue
            for field in match_fields:
                if self._normalize_card_match_value(card.get(field)) == target:
                    return card
        candidate_keys = sorted({
            key
            for card in cards or []
            if isinstance(card, dict)
            for key in card.keys()
            if any(token in str(key).lower() for token in ("card", "iccid", "msisdn", "sim"))
        })
        if candidate_keys:
            masked_target = f"{target[:4]}***{target[-4:]}" if len(target) > 8 else "***"
            logger.warning(
                "Hikiot card not matched for sim_card_id=%s, candidate_keys=%s",
                masked_target,
                candidate_keys,
            )
        return None

    def _parse_hikiot_flow_value_gb(self, value: Any) -> Optional[float]:
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            text = str(value).strip()
            match = re.search(r"-?\d+(?:\.\d+)?", text)
            if not match:
                return None
            return float(match.group(0))

    def _normalize_hikiot_flow_unit(self, unit: Any) -> str:
        text = str(unit or "").strip().upper()
        if not text:
            return ""
        unit_aliases = {
            "K": "KB",
            "KB": "KB",
            "M": "MB",
            "MB": "MB",
            "G": "GB",
            "GB": "GB",
            "T": "TB",
            "TB": "TB",
        }
        return unit_aliases.get(text, text)

    def _hikiot_flow_value_to_gb(self, value: Optional[float], unit: str) -> Optional[float]:
        if value is None:
            return None
        normalized_unit = self._normalize_hikiot_flow_unit(unit) or "GB"
        if normalized_unit == "TB":
            return float(value) * 1024
        if normalized_unit == "MB":
            return float(value) / 1024
        if normalized_unit == "KB":
            return float(value) / (1024 * 1024)
        return float(value)

    def _extract_hikiot_flow_unit(self, card: dict, keys: tuple[str, ...]) -> str:
        if not isinstance(card, dict):
            return ""
        for key in keys:
            unit = self._normalize_hikiot_flow_unit(card.get(key))
            if unit:
                return unit
        return ""

    def _parse_hikiot_flow_item(
        self,
        card: dict,
        value_key: str,
        unit_keys: tuple[str, ...],
        default_unit: str = "",
    ) -> dict:
        raw = card.get(value_key) if isinstance(card, dict) else None
        unit = self._extract_hikiot_flow_unit(card, unit_keys)
        value_source = raw
        if isinstance(raw, dict):
            value_source = (
                raw.get("parsedValue")
                if raw.get("parsedValue") is not None
                else raw.get("value", raw.get("rawValue", raw.get("raw")))
            )
            unit = (
                self._normalize_hikiot_flow_unit(raw.get("unit"))
                or self._normalize_hikiot_flow_unit(raw.get("flowUnit"))
                or unit
            )

        value = self._parse_hikiot_flow_value_gb(value_source)
        if isinstance(value_source, str):
            match = re.search(r"-?\d+(?:\.\d+)?\s*([KMGT]?B|[KMGT])\b", value_source, re.IGNORECASE)
            if match:
                unit = self._normalize_hikiot_flow_unit(match.group(1)) or unit

        unit = unit or self._normalize_hikiot_flow_unit(default_unit) or "GB"
        return {
            "value": value,
            "unit": unit,
            "raw": raw,
            "value_gb": self._hikiot_flow_value_to_gb(value, unit),
        }

    def _extract_hikiot_total_flow_gb(self, card: dict) -> Optional[float]:
        total_flow = card.get("totalFlow") if isinstance(card, dict) else None
        if isinstance(total_flow, dict):
            return self._parse_hikiot_flow_value_gb(total_flow.get("parsedValue"))
        return self._parse_hikiot_flow_value_gb(total_flow)

    def _get_hikiot_card_no(self, card: dict, fallback: Any = None) -> str:
        for key in ("cardNo", "cardNumber", "cardId", "iccid", "msisdn", "simCardId", "sim_card_id", "id"):
            value = self._normalize_card_match_value(card.get(key) if isinstance(card, dict) else None)
            if value:
                return value
        return self._normalize_card_match_value(fallback)

    def _build_hikiot_traffic_summary_fields(
        self,
        *,
        used_gb: Optional[float],
        remaining_gb: Optional[float],
        total_gb: Optional[float],
        card_no: str,
        expired_at: Any,
        traffic: Optional[dict] = None,
    ) -> dict:
        traffic = traffic or {}
        traffic_total = traffic.get("total") or {"value": total_gb, "unit": "GB", "raw": total_gb}
        traffic_used = traffic.get("used") or {"value": used_gb, "unit": "GB", "raw": used_gb}
        traffic_remaining = traffic.get("remaining") or {"value": remaining_gb, "unit": "GB", "raw": remaining_gb}
        display_unit = traffic.get("display_unit") or traffic_used.get("unit") or traffic_total.get("unit") or traffic_remaining.get("unit") or "GB"
        total_flow_display = self._format_traffic_candidate_text(traffic_total.get("value"), traffic_total.get("unit")) if traffic_total.get("value") is not None else "--"
        used_flow_display = self._format_traffic_candidate_text(traffic_used.get("value"), traffic_used.get("unit")) if traffic_used.get("value") is not None else "--"
        remaining_flow_display = self._format_traffic_candidate_text(traffic_remaining.get("value"), traffic_remaining.get("unit")) if traffic_remaining.get("value") is not None else "--"
        display_remaining_gb = (
            max(0.0, float(remaining_gb) - HIKIOT_DISPLAY_RESERVED_GB)
            if remaining_gb is not None
            else None
        )
        weekly_quota_gb = float(total_gb) if total_gb is not None else 0.0
        weekly_used_gb = float(used_gb) if used_gb is not None else 0.0
        weekly_remaining_gb = display_remaining_gb if display_remaining_gb is not None else 0.0
        traffic_status = "unknown"
        if remaining_gb is not None:
            traffic_status = "alarm" if remaining_gb <= TRAFFIC_ALARM_REMAINING_GB else "normal"
        return {
            "traffic_source": "hikiot",
            "traffic_sim_card_id": card_no,
            "traffic_card_expired_at": expired_at,
            "traffic_ocr_text": "",
            "traffic_status": traffic_status,
            "traffic_limit_gb": total_gb,
            "monthly_threshold_gb": total_gb,
            "safety_buffer_gb": HIKIOT_DISPLAY_RESERVED_GB,
            "traffic_reserved_gb": HIKIOT_DISPLAY_RESERVED_GB,
            "alarm_threshold_gb": None,
            "used_gb": used_gb,
            "estimated_remaining_gb": display_remaining_gb,
            "remaining_gb": display_remaining_gb,
            "traffic_remaining_gb": remaining_gb,
            "traffic_total_gb": total_gb,
            "remaining_formula": "residualFlow - display_reserved_gb",
            "weekly_quota_bytes": int(weekly_quota_gb * BYTES_PER_GB),
            "weekly_used_bytes": int(weekly_used_gb * BYTES_PER_GB),
            "weekly_remaining_bytes": int(weekly_remaining_gb * BYTES_PER_GB),
            "weekly_quota_text": self._format_gb(total_gb) if total_gb is not None else "--",
            "weekly_used_text": self._format_gb(used_gb) if used_gb is not None else "--",
            "weekly_remaining_text": self._format_gb(display_remaining_gb) if display_remaining_gb is not None else "--",
            "monthly_threshold_text": self._format_gb(total_gb) if total_gb is not None else "--",
            "estimated_remaining_text": self._format_gb(display_remaining_gb) if display_remaining_gb is not None else "--",
            "traffic": {
                "total": traffic_total,
                "used": traffic_used,
                "remaining": traffic_remaining,
                "display_unit": display_unit,
            },
            "traffic_display_unit": display_unit,
            "total_flow_value": traffic_total.get("value"),
            "total_flow_unit": traffic_total.get("unit") or display_unit,
            "total_flow_raw": traffic_total.get("raw"),
            "total_flow_display": total_flow_display,
            "used_flow_value": traffic_used.get("value"),
            "used_flow_unit": traffic_used.get("unit") or display_unit,
            "used_flow_raw": traffic_used.get("raw"),
            "used_flow_display": used_flow_display,
            "residual_flow_value": traffic_remaining.get("value"),
            "residual_flow_unit": traffic_remaining.get("unit") or display_unit,
            "residual_flow_raw": traffic_remaining.get("raw"),
            "remaining_flow_unit": traffic_remaining.get("unit") or display_unit,
            "remaining_flow_display": remaining_flow_display,
        }

    def _refresh_hikiot_video_traffic(self, db: Session, video_id: int):
        db_video = self._get_video_runtime_by_id(video_id)
        if not db_video:
            return None

        sim_card_id = self._normalize_card_match_value(getattr(db_video, "sim_card_id", None))
        has_sim_card_id = bool(sim_card_id)

        try:
            card, cards, query_message = self._query_hikiot_flow_card(sim_card_id if has_sim_card_id else None)
        except ValueError as exc:
            return {"success": False, "message": str(exc)}
        except requests.RequestException as exc:
            return {"success": False, "message": f"Hikiot娴侀噺鎺ュ彛璇锋眰澶辫触: {exc}"}
        except Exception as exc:
            return {"success": False, "message": f"Hikiot娴侀噺鎺ュ彛鏌ヨ澶辫触: {exc}"}

        display_unit = self._extract_hikiot_flow_unit(card, ("flowUnit", "unit"))
        total_flow = self._parse_hikiot_flow_item(
            card,
            "totalFlow",
            ("totalFlowUnit", "total_flow_unit", "totalUnit", "total_unit", "flowUnit", "flow_unit", "unit"),
            display_unit,
        )
        used_flow = self._parse_hikiot_flow_item(
            card,
            "usedFlow",
            ("usedFlowUnit", "used_flow_unit", "usedUnit", "used_unit", "flowUnit", "flow_unit", "unit"),
            display_unit,
        )
        remaining_flow = self._parse_hikiot_flow_item(
            card,
            "residualFlow",
            (
                "residualFlowUnit",
                "residual_flow_unit",
                "residualUnit",
                "residual_unit",
                "remainingFlowUnit",
                "remaining_flow_unit",
                "remainingUnit",
                "remaining_unit",
                "flowUnit",
                "flow_unit",
                "unit",
            ),
            display_unit,
        )
        display_unit = display_unit or used_flow.get("unit") or total_flow.get("unit") or remaining_flow.get("unit") or "GB"
        traffic = {
            "total": {key: total_flow.get(key) for key in ("value", "unit", "raw")},
            "used": {key: used_flow.get(key) for key in ("value", "unit", "raw")},
            "remaining": {key: remaining_flow.get(key) for key in ("value", "unit", "raw")},
            "display_unit": display_unit,
        }
        used_gb = used_flow.get("value_gb")
        remaining_gb = remaining_flow.get("value_gb")
        total_gb = total_flow.get("value_gb")
        expired_at = card.get("expiredTimes")
        card_no = self._get_hikiot_card_no(card, sim_card_id if has_sim_card_id else None)
        now = datetime.utcnow()

        updates = {
            "traffic_used_gb": used_gb,
            "traffic_remaining_gb": remaining_gb,
            "traffic_total_gb": total_gb,
            "traffic_card_expired_at": expired_at,
            "traffic_source": "hikiot",
            "traffic_sim_card_id": card_no,
            "traffic_ocr_status": "hikiot",
            "traffic_ocr_updated_at": now,
        }
        self._update_video_fields(video_id, updates)

        refreshed = self._get_video_runtime_by_id(video_id) or db_video
        fields = self._build_hikiot_traffic_summary_fields(
            used_gb=used_gb,
            remaining_gb=remaining_gb,
            total_gb=total_gb,
            card_no=card_no,
            expired_at=expired_at,
            traffic=traffic,
        )
        status_summary = self._build_device_status_summary(db, refreshed)
        return {
            "success": True,
            "message": "Hikiot娴侀噺璇嗗埆鎴愬姛",
            "source": "hikiot",
            "device_id": refreshed.id,
            "device_name": getattr(refreshed, "name", None),
            "sim_card_id": sim_card_id if has_sim_card_id else card_no,
            "last_update_time": now,
            "update_time": now,
            "last_traffic_ocr_time": now,
            "last_calculated_at": now,
            "cycle_start_time": now.replace(day=1, hour=0, minute=0, second=0, microsecond=0),
            "cycle_end_time": now,
            **fields,
            **status_summary,
            "used_gb": used_gb,
            "remaining_gb": remaining_gb,
            "total_gb": total_gb,
            "expired_times": expired_at,
            "hikiot_message": query_message,
            "hikiot_card": {
                "cardId": card.get("cardId"),
                "cardNo": card.get("cardNo"),
                "cardNumber": card.get("cardNumber"),
                "iccid": card.get("iccid"),
                "msisdn": card.get("msisdn"),
                "simCardId": card.get("simCardId"),
                "sim_card_id": card.get("sim_card_id"),
                "id": card.get("id"),
            },
        }

    def _get_stored_traffic_usage_gb(self, db_video: VideoDevice) -> tuple[Optional[float], str, Optional[datetime]]:
        used_gb = getattr(db_video, "traffic_used_gb", None)
        ocr_text = str(getattr(db_video, "traffic_ocr_text", "") or "")
        updated_at = getattr(db_video, "traffic_ocr_updated_at", None)
        try:
            if used_gb is None:
                return None, ocr_text, updated_at
            return float(self._integer_traffic_gb(used_gb)), ocr_text, updated_at
        except (TypeError, ValueError):
            return None, ocr_text, updated_at

    def _is_suspicious_traffic_history(self, used_gb: Optional[float], threshold_gb: Optional[float] = None) -> bool:
        if used_gb is None:
            return False
        try:
            value = float(used_gb)
        except (TypeError, ValueError):
            return False

        threshold = float(threshold_gb or MONTHLY_TRAFFIC_THRESHOLD_GB)
        return value > 100 or value > threshold * 3

    def _build_traffic_summary_fields(self, used_gb: Optional[float], ocr_text: str = "") -> dict:
        threshold_gb = MONTHLY_TRAFFIC_THRESHOLD_GB
        traffic_reserved_gb = TRAFFIC_RESERVED_GB
        safety_buffer_gb = traffic_reserved_gb
        alarm_threshold_gb = max(0.0, threshold_gb - traffic_reserved_gb)
        remaining_formula = "traffic_limit_gb - used_gb - traffic_reserved_gb"

        if used_gb is None:
            return {
                "traffic_ocr_text": ocr_text,
                "traffic_status": "unknown",
                "traffic_limit_gb": threshold_gb,
                "monthly_threshold_gb": threshold_gb,
                "safety_buffer_gb": safety_buffer_gb,
                "traffic_reserved_gb": traffic_reserved_gb,
                "alarm_threshold_gb": alarm_threshold_gb,
                "used_gb": None,
                "estimated_remaining_gb": None,
                "remaining_gb": None,
                "traffic_remaining_gb": None,
                "remaining_formula": remaining_formula,
                "weekly_quota_bytes": int(threshold_gb * BYTES_PER_GB),
                "weekly_used_bytes": 0,
                "weekly_remaining_bytes": 0,
                "weekly_quota_text": self._format_gb(threshold_gb),
                "weekly_used_text": "识别中",
                "weekly_remaining_text": "--",
                "monthly_threshold_text": self._format_gb(threshold_gb),
                "estimated_remaining_text": "--",
            }

        integer_used_gb = float(self._integer_traffic_gb(used_gb))
        estimated_remaining_gb = max(0.0, threshold_gb - integer_used_gb - traffic_reserved_gb)
        display_remaining_gb = max(estimated_remaining_gb, 0.0)
        traffic_status = (
            "alarm"
            if integer_used_gb >= alarm_threshold_gb
            else "low"
            if estimated_remaining_gb < 3
            else "normal"
        )

        return {
            "traffic_ocr_text": ocr_text,
            "traffic_status": traffic_status,
            "traffic_limit_gb": threshold_gb,
            "monthly_threshold_gb": threshold_gb,
            "safety_buffer_gb": safety_buffer_gb,
            "traffic_reserved_gb": traffic_reserved_gb,
            "alarm_threshold_gb": alarm_threshold_gb,
            "used_gb": integer_used_gb,
            "estimated_remaining_gb": estimated_remaining_gb,
            "remaining_gb": estimated_remaining_gb,
            "traffic_remaining_gb": estimated_remaining_gb,
            "remaining_formula": remaining_formula,
            "weekly_quota_bytes": int(threshold_gb * BYTES_PER_GB),
            "weekly_used_bytes": int(integer_used_gb * BYTES_PER_GB),
            "weekly_remaining_bytes": int(display_remaining_gb * BYTES_PER_GB),
            "weekly_quota_text": self._format_gb(threshold_gb),
            "weekly_used_text": self._format_gb(integer_used_gb),
            "weekly_remaining_text": self._format_gb(display_remaining_gb),
            "monthly_threshold_text": self._format_gb(threshold_gb),
            "estimated_remaining_text": self._format_gb(display_remaining_gb),
        }

    def _get_week_cycle_bounds(self, reference: Optional[datetime] = None) -> Tuple[datetime, datetime]:

        now = reference or datetime.now()

        week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)

        return week_start, now



    def _get_weekly_quota_bytes(self, db_video: VideoDevice) -> int:

        quota = getattr(db_video, "weekly_quota_bytes", None)

        if isinstance(quota, int) and quota > 0:

            return quota

        if isinstance(quota, float) and quota > 0:

            return int(quota)

        return DEFAULT_WEEKLY_QUOTA_BYTES



    def _get_ezviz_device_traffic_bytes(self, db_video: VideoDevice, cycle_start: datetime, cycle_end: datetime) -> Optional[int]:

        device_serial = str(getattr(db_video, "device_serial", "") or "").strip()

        if not device_serial:

            return None



        channel_no = int(getattr(db_video, "channel_no", None) or 1)

        start_str = cycle_start.strftime("%Y-%m-%d %H:%M:%S")

        end_str = cycle_end.strftime("%Y-%m-%d %H:%M:%S")



        paths_and_payloads = [

            (

                "/api/lapp/device/traffic",

                {

                    "deviceSerial": device_serial,

                    "channelNo": channel_no,

                    "startTime": start_str,

                    "endTime": end_str,

                },

            ),

            (

                "/api/lapp/v2/device/traffic",

                {

                    "deviceSerial": device_serial,

                    "channelNo": channel_no,

                    "startTime": start_str,

                    "endTime": end_str,

                },

            ),

            (

                "/api/lapp/device/traffic/get",

                {

                    "deviceSerial": device_serial,

                    "channelNo": channel_no,

                    "beginTime": int(cycle_start.timestamp() * 1000),

                    "endTime": int(cycle_end.timestamp() * 1000),

                },

            ),

            (

                "/api/lapp/device/usage",

                {

                    "deviceSerial": device_serial,

                    "channelNo": channel_no,

                    "startTime": start_str,

                    "endTime": end_str,

                },

            ),

        ]



        for path, payload in paths_and_payloads:

            try:

                body = self._call_ezviz_api(path, payload, retry_on_token_error=True)

                data = body.get("data") or {}

                traffic_bytes = (

                    data.get("traffic")

                    or data.get("flowUsed")

                    or data.get("used")

                    or data.get("consumed")

                    or data.get("bytes")

                    or data.get("trafficBytes")

                )

                if traffic_bytes is not None:

                    return max(0, int(traffic_bytes))

            except Exception:

                continue

        return None

    def _normalize_ezviz_status_value(self, value: Any) -> Optional[str]:
        if value is None:
            return None

        raw = str(value).strip().lower()
        if raw in {"1", "online", "on", "true", "connected"}:
            return "online"
        if raw in {"0", "offline", "off", "false", "disconnected"}:
            return "offline"
        if raw in {"2", "sleep", "sleeping", "dormant", "standby"}:
            return "sleeping"
        return None

    def _extract_first_value(self, data: Any, keys: tuple[str, ...]) -> Any:
        if isinstance(data, dict):
            for key in keys:
                if key in data:
                    return data.get(key)
            for value in data.values():
                nested = self._extract_first_value(value, keys)
                if nested is not None:
                    return nested
        elif isinstance(data, list):
            for item in data:
                nested = self._extract_first_value(item, keys)
                if nested is not None:
                    return nested
        return None

    def _normalize_ezviz_problem_flag(self, value: Any, good_numbers: set[str] | None = None) -> bool:
        if value is None:
            return False
        raw = str(value).strip().lower()
        if good_numbers and raw in good_numbers:
            return False
        if raw in {"normal", "ok", "online", "good", "healthy", "available"}:
            return False
        if raw in {"abnormal", "error", "fault", "failed", "low", "weak", "unavailable"}:
            return True
        return self._normalize_flag(value)

    def _extract_ezviz_device_status_updates(self, body: dict) -> dict:
        data = body.get("data") if isinstance(body, dict) else body
        status = self._normalize_ezviz_status_value(
            self._extract_first_value(data, ("status", "deviceStatus", "online", "onlineStatus"))
        )
        sleeping_value = self._extract_first_value(data, ("sleeping", "sleepStatus", "sleepMode", "sleep", "isSleep"))
        sleeping = self._normalize_flag(sleeping_value)
        if sleeping:
            status = "sleeping"

        updates = {
            "last_status_checked_at": datetime.utcnow(),
            "last_status_error": "",
        }
        if sleeping_value is not None:
            updates["sleeping"] = sleeping
        if status:
            updates["status"] = status
            if status == "sleeping":
                updates["sleeping"] = True
            elif sleeping_value is None:
                updates["sleeping"] = False

        privacy_value = self._extract_first_value(data, ("privacy_enabled", "privacyStatus", "privacy", "isPrivacy", "isPrivacyEnabled"))
        if privacy_value is not None:
            updates["privacy_enabled"] = self._normalize_flag(privacy_value)

        storage_value = self._extract_first_value(data, ("storage_abnormal", "storageAbnormal", "sdStatus", "diskStatus", "storageStatus"))
        if storage_value is not None:
            updates["storage_abnormal"] = self._normalize_ezviz_problem_flag(storage_value, good_numbers={"0", "1"})

        battery_value = self._extract_first_value(data, ("low_battery", "lowBattery", "batteryLow", "isLowBattery"))
        if battery_value is not None:
            updates["low_battery"] = self._normalize_ezviz_problem_flag(battery_value)

        signal_value = self._extract_first_value(data, ("weak_signal", "weakSignal", "signalWeak", "isWeakSignal"))
        if signal_value is not None:
            updates["weak_signal"] = self._normalize_ezviz_problem_flag(signal_value, good_numbers={"0"})
        return updates

    def _refresh_ezviz_device_status(self, db_video: VideoDevice) -> bool:
        if not self._is_ezviz_access(db_video):
            return False

        device_serial = str(getattr(db_video, "device_serial", "") or "").strip()
        if not device_serial:
            return False

        channel_no = int(getattr(db_video, "channel_no", None) or 1)
        paths_and_payloads = [
            ("/api/lapp/device/status/get", {"deviceSerial": device_serial, "channelNo": channel_no}),
            ("/api/lapp/v2/device/status/get", {"deviceSerial": device_serial, "channelNo": channel_no}),
            ("/api/lapp/device/info", {"deviceSerial": device_serial}),
            ("/api/lapp/device/camera/list", {"deviceSerial": device_serial}),
        ]

        last_error = ""
        merged_updates = {
            "last_status_checked_at": datetime.utcnow(),
            "last_status_error": "",
        }
        succeeded = False
        for path, payload in paths_and_payloads:
            try:
                body = self._call_ezviz_api(path, payload, retry_on_token_error=True)
                merged_updates.update(self._extract_ezviz_device_status_updates(body))
                succeeded = True
            except Exception as exc:
                last_error = str(exc)
                continue

        if succeeded:
            self._update_video_fields(db_video.id, merged_updates)
            return True

        self._update_video_fields(db_video.id, {
            "last_status_checked_at": datetime.utcnow(),
            "last_status_error": last_error or "EZVIZ status refresh failed",
        })
        logger.warning(f"EZVIZ status refresh failed video_id={getattr(db_video, 'id', '')}: {last_error}")
        return False

    def _calculate_monitoring_usage(self, db_video: VideoDevice, cycle_start: datetime, cycle_end: datetime) -> tuple[int, int, int]:
        weekly_quota_bytes = self._get_weekly_quota_bytes(db_video)
        if self._is_ezviz_access(db_video):
            ezviz_traffic = self._get_ezviz_device_traffic_bytes(db_video, cycle_start, cycle_end)
            if ezviz_traffic is not None:
                weekly_used_bytes = ezviz_traffic
            else:
                weekly_used_bytes = self._collect_weekly_recording_usage_bytes(db_video.id, cycle_start, cycle_end)
        else:
            weekly_used_bytes = self._collect_weekly_recording_usage_bytes(db_video.id, cycle_start, cycle_end)

        weekly_remaining_bytes = max(0, weekly_quota_bytes - weekly_used_bytes)
        return weekly_quota_bytes, weekly_used_bytes, weekly_remaining_bytes

    def _ezviz_status_polling_worker(self):
        time.sleep(3)
        mongo_warning_logged = False
        while self._ezviz_status_thread_running:
            try:
                if not is_mongo_available(log_error=False):
                    if not mongo_warning_logged:
                        logger.warning(
                            "EZVIZ status polling paused because MongoDB is unavailable at %s. "
                            "Start MongoDB or update MONGO_URL/MONGO_DB_NAME.",
                            describe_mongo_connection(),
                        )
                        mongo_warning_logged = True
                    time.sleep(EZVIZ_STATUS_POLL_INTERVAL_SECONDS)
                    continue
                if mongo_warning_logged:
                    logger.info("MongoDB is available again; EZVIZ status polling resumed")
                    mongo_warning_logged = False

                query = {
                    "device_serial": {"$exists": True, "$nin": [None, ""]},
                    "$or": [
                        {"platform_type": "ezviz"},
                        {"access_source": "cloud"},
                    ],
                }
                docs = list(self._video_collection().find(query, {"_id": 0}))
                for doc in docs:
                    try:
                        db_video = self._get_video_runtime_by_id(doc.get("id"))
                        if not db_video:
                            continue
                        self._refresh_ezviz_device_status(db_video)
                        refreshed = self._get_video_runtime_by_id(db_video.id) or db_video
                        now = datetime.now()
                        cycle_start, cycle_end = self._get_week_cycle_bounds(now)
                        weekly_quota_bytes, weekly_used_bytes, weekly_remaining_bytes = self._calculate_monitoring_usage(
                            refreshed,
                            cycle_start,
                            cycle_end,
                        )
                        db = SessionLocal()
                        try:
                            status_summary = self._build_device_status_summary(db, refreshed)
                            self._sync_monitoring_alarms(
                                mongo_db=db,
                                db_video=refreshed,
                                status_summary=status_summary,
                                weekly_quota_bytes=weekly_quota_bytes,
                                weekly_used_bytes=weekly_used_bytes,
                                weekly_remaining_bytes=weekly_remaining_bytes,
                            )
                        finally:
                            db.close()
                    except Exception as exc:
                        logger.error(f"EZVIZ status polling failed for video_id={doc.get('id')}: {exc}")
            except (ServerSelectionTimeoutError, PyMongoError, OSError) as exc:
                if not mongo_warning_logged:
                    logger.warning(
                        "EZVIZ status polling paused because MongoDB is unavailable at %s: %s",
                        describe_mongo_connection(),
                        exc,
                    )
                    mongo_warning_logged = True
            except Exception as exc:
                logger.error(f"EZVIZ status polling worker loop failed: {exc}")
            time.sleep(EZVIZ_STATUS_POLL_INTERVAL_SECONDS)

    def _collect_weekly_recording_usage_bytes(self, video_id: int, cycle_start: datetime, cycle_end: datetime) -> int:

        device_root = os.path.join(self._get_record_root(), str(video_id))

        if not os.path.isdir(device_root):

            return 0



        total = 0

        for file_path in glob.glob(os.path.join(device_root, "*.mp4")):

            try:

                seg_start = self._parse_segment_start(file_path)

                if seg_start is None:

                    seg_start = datetime.fromtimestamp(os.path.getmtime(file_path))

                if seg_start < cycle_start or seg_start >= cycle_end:

                    continue

                total += int(os.path.getsize(file_path))

            except Exception:

                continue

        return total



    def _build_device_status_summary(self, mongo_db, db_video: VideoDevice) -> dict:

        raw_status = str(getattr(db_video, "status", "offline") or "offline").strip().lower()

        sleeping = self._normalize_flag(getattr(db_video, "sleeping", False))

        if sleeping:

            main_status = "sleeping"

        elif raw_status not in {"online", "offline", "sleeping"}:

            main_status = "offline"

        else:

            main_status = raw_status



        privacy_enabled = self._normalize_flag(getattr(db_video, "privacy_enabled", False))

        storage_abnormal = self._normalize_flag(getattr(db_video, "storage_abnormal", False))

        low_battery = self._normalize_flag(getattr(db_video, "low_battery", False))

        weak_signal = self._normalize_flag(getattr(db_video, "weak_signal", False))



        alarm_active = bool(

            self._alarm_collection().find_one({

                "device_id": str(db_video.id),

                "status": "pending",

            })

        )



        status_tags: list[str] = []

        if privacy_enabled:

            status_tags.append("privacy_enabled")

        if storage_abnormal:

            status_tags.append("storage_abnormal")

        if low_battery:

            status_tags.append("low_battery")

        if weak_signal:

            status_tags.append("weak_signal")

        if alarm_active:

            status_tags.append("alarm_active")



        is_fault = bool(storage_abnormal or low_battery or weak_signal or alarm_active or main_status == "offline")

        status_text_map = {

            "online": "在线",

            "offline": "离线",

            "sleeping": "休眠",

        }

        status_text_parts = [status_text_map.get(main_status, "离线")]

        tag_text_map = {

            "privacy_enabled": "隐私开启",
            "storage_abnormal": "鐎涙ê鍋嶅鍌氱埗",

            "low_battery": "低电量",
            "weak_signal": "信号弱",
            "alarm_active": "瀵倸鐖堕崨濠咁劅",
        }

        status_text_parts.extend(tag_text_map[tag] for tag in status_tags if tag in tag_text_map)



        return {

            "main_status": main_status,

            "privacy_enabled": privacy_enabled,

            "storage_abnormal": storage_abnormal,

            "low_battery": low_battery,

            "weak_signal": weak_signal,

            "sleeping": sleeping,

            "alarm_active": alarm_active,

            "status_tags": status_tags,

            "is_fault": is_fault,

            "status_text": " / ".join(status_text_parts),
        }



    def _sync_single_monitoring_alarm(

        self,

        db_video,

        alarm_type: str,

        severity: str,

        description: str,

        active: bool,

        mongo_db=None,

        db=None,

    ) -> bool:

        # Sync monitoring alarms from device status.

        device_id = str(db_video.id)

        pending_alarm = self._find_pending_alarm_doc(device_id, alarm_type)



        if active:

            if pending_alarm:

                return False

            alarm_doc = self._create_monitoring_alarm_doc(
                device_id=device_id,

                alarm_type=alarm_type,

                severity=severity,

                description=description,
                location=db_video.name or f"瑙嗛璁惧-{device_id}",
                device_name=db_video.name or f"Video-{device_id}",
            )
            push_alarm_threadsafe(self._build_monitoring_alarm_websocket_payload(alarm_doc))
            return True



        if pending_alarm:

            self._resolve_monitoring_alarm_doc(pending_alarm["id"])

            return True



        return False



    def _sync_monitoring_alarms(

        self,

        mongo_db,

        db_video: VideoDevice,

        status_summary: dict,

        weekly_quota_bytes: int,

        weekly_used_bytes: int,

        weekly_remaining_bytes: int,

    ) -> bool:

        # Sync monitoring alarms from device status.

        changed = False
        pending_offline_alarm = self._find_pending_alarm_doc(str(db_video.id), "VIDEO_DEVICE_OFFLINE")
        if pending_offline_alarm:
            self._resolve_monitoring_alarm_doc(pending_offline_alarm["id"])
            changed = True



        alarm_specs = [

            (

                "VIDEO_DEVICE_OFFLINE",

                "high",

                f"视频设备 {db_video.name} 离线",

                status_summary.get("main_status") == "offline",

            ),

            (

                "VIDEO_DEVICE_SLEEPING",

                "low",

                f"视频设备 {db_video.name} 处于待机/休眠",

                bool(status_summary.get("sleeping")),

            ),

            (

                "VIDEO_DEVICE_PRIVACY_ENABLED",

                "low",

                f"视频设备 {db_video.name} 开启隐私模式",

                bool(status_summary.get("privacy_enabled")),

            ),

            (

                "VIDEO_DEVICE_STORAGE_ABNORMAL",

                "high",

                f"视频设备 {db_video.name} 存储异常",

                bool(status_summary.get("storage_abnormal")),

            ),

            (

                "VIDEO_DEVICE_LOW_BATTERY",

                "medium",

                f"视频设备 {db_video.name} 低电量",

                bool(status_summary.get("low_battery")),

            ),

            (

                "VIDEO_DEVICE_WEAK_SIGNAL",

                "medium",

                f"视频设备 {db_video.name} 信号弱",

                bool(status_summary.get("weak_signal")),

            ),

        ]



        for alarm_type, severity, description, active in alarm_specs:
            if alarm_type == "VIDEO_DEVICE_OFFLINE":
                continue

            changed = self._sync_single_monitoring_alarm(

                mongo_db=mongo_db,

                db_video=db_video,

                alarm_type=alarm_type,

                severity=severity,

                description=description,

                active=active,

            ) or changed



        quota = max(0, int(weekly_quota_bytes or 0))

        remaining = max(0, int(weekly_remaining_bytes or 0))

        ratio = (remaining / quota) if quota > 0 else 0.0

        traffic_low_active = quota > 0 and ratio <= TRAFFIC_ALERT_THRESHOLD_RATIO

        traffic_desc = (
            f"瑙嗛璁惧 {db_video.name} 娴侀噺浣庝簬闃堝€? "
            f"鍓╀綑 {self._format_bytes(remaining)} / 鍛ㄩ搴?{self._format_bytes(quota)}; "
            f"鏈懆宸茬敤 {self._format_bytes(weekly_used_bytes)}"
        )

        changed = self._sync_single_monitoring_alarm(

            mongo_db=mongo_db,

            db_video=db_video,

            alarm_type="VIDEO_TRAFFIC_LOW",

            severity="medium",

            description=traffic_desc,

            active=traffic_low_active,

        ) or changed



        return changed



    def get_monitoring_summary(self, mongo_db, video_id: int):
        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            return None

        if self._is_ezviz_access(db_video):
            self._refresh_ezviz_device_status(db_video)
            db_video = self._get_video_runtime_by_id(video_id) or db_video

        now = datetime.now()

        cycle_start, cycle_end = self._get_week_cycle_bounds(now)
        weekly_quota_bytes, weekly_used_bytes, weekly_remaining_bytes = self._calculate_monitoring_usage(
            db_video,
            cycle_start,
            cycle_end,
        )
        status_summary = self._build_device_status_summary(mongo_db, db_video)
        has_alarm_changes = self._sync_monitoring_alarms(

            mongo_db,
            db_video=db_video,

            status_summary=status_summary,

            weekly_quota_bytes=weekly_quota_bytes,

            weekly_used_bytes=weekly_used_bytes,

            weekly_remaining_bytes=weekly_remaining_bytes,

        )

        status_summary = self._build_device_status_summary(mongo_db, db_video)


        return {

            "device_id": db_video.id,

            "device_name": db_video.name,

            "weekly_quota_bytes": weekly_quota_bytes,

            "weekly_used_bytes": weekly_used_bytes,

            "weekly_remaining_bytes": weekly_remaining_bytes,

            "weekly_quota_text": self._format_bytes(weekly_quota_bytes),

            "weekly_used_text": self._format_bytes(weekly_used_bytes),

            "weekly_remaining_text": self._format_bytes(weekly_remaining_bytes),

            "cycle_start_time": cycle_start,

            "cycle_end_time": cycle_end,

            "last_calculated_at": now,

            **status_summary,

        }

    def _sync_traffic_ocr_alarm(self, db: Session, db_video: VideoDevice, traffic_fields: dict) -> bool:
        used_gb = traffic_fields.get("weekly_used_bytes")
        used_gb = (float(used_gb) / BYTES_PER_GB) if used_gb is not None else None
        traffic_reserved_gb = float(traffic_fields.get("traffic_reserved_gb", TRAFFIC_RESERVED_GB) or TRAFFIC_RESERVED_GB)
        alarm_threshold_gb = float(
            traffic_fields.get(
                "alarm_threshold_gb",
                max(0.0, MONTHLY_TRAFFIC_THRESHOLD_GB - traffic_reserved_gb),
            )
        )
        active = used_gb is not None and float(used_gb) >= alarm_threshold_gb
        description = (
            f"摄像头流量不足预警：当前已使用流量达到 {alarm_threshold_gb:.0f}GB 报警阈值，"
            f"已使用 {traffic_fields.get('weekly_used_text') or '--'}，"
            f"流量阈值 {traffic_fields.get('monthly_threshold_text') or '30.00GB'}，"
            f"预留流量 {traffic_reserved_gb:.0f}GB，"
            f"估算剩余 {traffic_fields.get('estimated_remaining_text') or '--'}"
        )
        if active:
            month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            existing_this_month = self._alarm_collection().find_one({
                "device_id": str(db_video.id),
                "alarm_type": "VIDEO_TRAFFIC_LOW",
                "timestamp": {"$gte": month_start},
            })
            if existing_this_month:
                return False

        return self._sync_single_monitoring_alarm(
            db_video=db_video,
            alarm_type="VIDEO_TRAFFIC_LOW",
            severity="medium",
            description=description,
            active=active,
        )

    def report_traffic_ocr(self, db: Session, video_id: int, ocr_text: str, used_gb: Optional[float] = None):
        db_video = self._get_video_runtime_by_id(video_id)
        if not db_video:
            return None
        if getattr(db_video, "traffic_source", None) == "hikiot":
            now = datetime.utcnow()
            fields = self._build_hikiot_traffic_summary_fields(
                used_gb=self._parse_hikiot_flow_value_gb(getattr(db_video, "traffic_used_gb", None)),
                remaining_gb=self._parse_hikiot_flow_value_gb(getattr(db_video, "traffic_remaining_gb", None)),
                total_gb=self._parse_hikiot_flow_value_gb(getattr(db_video, "traffic_total_gb", None)),
                card_no=self._normalize_card_match_value(getattr(db_video, "traffic_sim_card_id", None)),
                expired_at=getattr(db_video, "traffic_card_expired_at", None),
            )
            return {
                "success": True,
                "message": "Hikiot traffic data already exists; OCR result not overwritten",
                "device_id": video_id,
                "last_update_time": getattr(db_video, "traffic_ocr_updated_at", None) or now,
                "last_calculated_at": now,
                **fields,
            }

        parsed, candidates = self._parse_traffic_ocr_text_with_candidates(ocr_text)
        normalized_ocr_text = str(ocr_text or "").strip()
        selected_candidate = next((item for item in candidates if not item.get("excluded")), None)
        raw_selected_traffic_value = None
        integer_selected_traffic_value = None
        if used_gb is None:
            if not parsed:
                now = datetime.utcnow()
                self._update_video_fields(video_id, {
                    "traffic_rejected_ocr_text": normalized_ocr_text,
                    "traffic_rejected_used_gb": None,
                    "traffic_ocr_status": "unrecognized",
                    "traffic_ocr_reject_reason": "鏈瘑鍒埌鍙俊娴侀噺璇绘暟",
                    "traffic_ocr_updated_at": now,
                })
                refreshed = self._get_video_runtime_by_id(video_id) or db_video
                current_used_gb, current_ocr_text, updated_at = self._get_stored_traffic_usage_gb(refreshed)
                fields = self._build_traffic_summary_fields(current_used_gb, current_ocr_text or normalized_ocr_text)
                return {
                    "success": False,
                    "message": "鏈瘑鍒埌鍙俊娴侀噺璇绘暟",
                    "last_update_time": updated_at,
                    "candidates": candidates,
                    "traffic_text": current_ocr_text or "",
                    "traffic_value": None,
                    "traffic_debug": {
                        "selected_traffic_value": None,
                        "raw_selected_traffic_value": None,
                        "integer_selected_traffic_value": None,
                        "traffic_limit_gb": fields.get("traffic_limit_gb"),
                        "used_gb": fields.get("used_gb"),
                        "traffic_reserved_gb": TRAFFIC_RESERVED_GB,
                        "alarm_threshold_gb": max(0.0, MONTHLY_TRAFFIC_THRESHOLD_GB - TRAFFIC_RESERVED_GB),
                        "estimated_remaining_gb": fields.get("estimated_remaining_gb"),
                        "remaining_formula": fields.get("remaining_formula"),
                        "historical_used_gb": current_used_gb,
                        "delta_gb": None,
                        "delta_allowed": False,
                        "ignored_reason": "鏈瘑鍒埌鍙俊娴侀噺璇绘暟",
                        "historical_value_suspicious": self._is_suspicious_traffic_history(current_used_gb),
                        "final_used_gb": current_used_gb,
                        "no_usable_candidate_reason": "no_trusted_traffic_reading",
                    },
                    **fields,
                }
            used_gb, normalized_ocr_text = parsed
            raw_selected_traffic_value = (
                selected_candidate.get("raw_value_gb")
                if selected_candidate and selected_candidate.get("raw_value_gb") is not None
                else used_gb
            )
        else:
            raw_selected_traffic_value = max(0.0, float(used_gb))
            if parsed:
                normalized_ocr_text = parsed[1]
                if selected_candidate and selected_candidate.get("raw_value_gb") is not None:
                    raw_selected_traffic_value = selected_candidate.get("raw_value_gb")
        integer_selected_traffic_value = self._integer_traffic_gb(raw_selected_traffic_value)
        used_gb = float(integer_selected_traffic_value)
        recognized_ocr_text = normalized_ocr_text

        now = datetime.utcnow()
        last_used_gb, _, last_updated_at = self._get_stored_traffic_usage_gb(db_video)
        last_month = getattr(db_video, "last_ocr_month", None)
        current_month = datetime.now().strftime("%Y-%m")
        is_new_month = last_month != current_month
        threshold_gb = MONTHLY_TRAFFIC_THRESHOLD_GB
        historical_used_gb = last_used_gb
        history_suspicious = self._is_suspicious_traffic_history(historical_used_gb, threshold_gb)

        is_valid = True
        invalid_reason = ""
        reset_suspicious_history = False
        delta_gb = None
        delta_allowed = True
        if history_suspicious and not is_new_month:
            reset_suspicious_history = True

        if not reset_suspicious_history:
            if last_used_gb is not None and not is_new_month:
                delta_gb = used_gb - float(last_used_gb)
                growth_gb = max(0.0, delta_gb)
                within_normal_delta = 0 <= used_gb <= threshold_gb and growth_gb <= 5
                if within_normal_delta:
                    is_valid = True
                    invalid_reason = ""
                elif used_gb > 100:
                    is_valid = False
                    invalid_reason = "traffic reading exceeds 100GB, ignored"
                elif used_gb > threshold_gb * 3:
                    is_valid = False
                    invalid_reason = "traffic reading exceeds monthly threshold x3, ignored"
                elif growth_gb > 5:
                    is_valid = False
                    invalid_reason = "single traffic growth exceeds 5GB, ignored"
                elif growth_gb > 0 and last_updated_at:
                    try:
                        elapsed_hours = max((now - last_updated_at).total_seconds() / 3600, 0.0)
                    except TypeError:
                        elapsed_hours = 0.0
                    if elapsed_hours > 0 and growth_gb / elapsed_hours > 10:
                        is_valid = False
                        invalid_reason = "traffic growth rate exceeds 10GB/hour, ignored"
            else:
                if used_gb > 100:
                    is_valid = False
                    invalid_reason = "traffic reading exceeds 100GB, ignored"
                elif used_gb > threshold_gb * 3:
                    is_valid = False
                    invalid_reason = "traffic reading exceeds monthly threshold x3, ignored"
            delta_allowed = is_valid

        traffic_debug = {
            "selected_traffic_value": used_gb,
            "raw_selected_traffic_value": raw_selected_traffic_value,
            "integer_selected_traffic_value": integer_selected_traffic_value,
            "traffic_reserved_gb": TRAFFIC_RESERVED_GB,
            "alarm_threshold_gb": max(0.0, threshold_gb - TRAFFIC_RESERVED_GB),
            "historical_used_gb": historical_used_gb,
            "delta_gb": delta_gb,
            "delta_allowed": delta_allowed,
            "ignored_reason": invalid_reason,
            "historical_value_suspicious": history_suspicious,
            "final_used_gb": used_gb if is_valid else last_used_gb,
        }

        if is_valid:
            self._update_video_fields(video_id, {
                "traffic_used_gb": used_gb,
                "traffic_ocr_text": normalized_ocr_text,
                "traffic_ocr_status": "recognized",
                "traffic_ocr_updated_at": now,
                "last_ocr_month": current_month,
            })
            db_video = self._get_video_runtime_by_id(video_id) or db_video
            used_for_summary = used_gb
            traffic_debug["final_used_gb"] = used_for_summary
        else:
            self._update_video_fields(video_id, {
                "traffic_rejected_ocr_text": normalized_ocr_text,
                "traffic_rejected_used_gb": used_gb,
                "traffic_ocr_status": "rejected",
                "traffic_ocr_reject_reason": invalid_reason,
                "traffic_ocr_updated_at": now,
            })
            db_video = self._get_video_runtime_by_id(video_id) or db_video
            used_for_summary, summary_ocr_text, _ = self._get_stored_traffic_usage_gb(db_video)
            traffic_debug["final_used_gb"] = used_for_summary

        fields = self._build_traffic_summary_fields(used_for_summary, normalized_ocr_text if is_valid else summary_ocr_text)
        traffic_debug.update({
            "traffic_limit_gb": fields.get("traffic_limit_gb"),
            "used_gb": fields.get("used_gb"),
            "traffic_reserved_gb": fields.get("traffic_reserved_gb"),
            "alarm_threshold_gb": fields.get("alarm_threshold_gb"),
            "estimated_remaining_gb": fields.get("estimated_remaining_gb"),
            "remaining_formula": fields.get("remaining_formula"),
        })
        try:
            self._sync_traffic_ocr_alarm(db, db_video, fields)
        except Exception as exc:
            logger.warning(
                "Traffic OCR alarm sync failed video_id=%s: %s",
                video_id,
                exc,
                exc_info=True,
            )
        message = "ok" if is_valid else invalid_reason
        if reset_suspicious_history:
            message = "历史流量统计异常，已使用当前OCR读数重置"

        logger.info(
            "Traffic OCR usage debug video_id=%s selected=%s historical=%s suspicious=%s final=%s",
            video_id,
            traffic_debug["selected_traffic_value"],
            traffic_debug["historical_used_gb"],
            traffic_debug["historical_value_suspicious"],
            traffic_debug["final_used_gb"],
        )

        return {
            **fields,
            "success": is_valid,
            "message": message,
            "alarm_triggered": fields["traffic_status"] == "alarm",
            "last_update_time": now,
            "candidates": candidates,
            "traffic_text": recognized_ocr_text,
            "traffic_value": used_gb,
            "traffic_debug": traffic_debug,
        }

    def get_traffic_status(self, db: Session, video_id: int):
        return self._refresh_hikiot_video_traffic(db, video_id)

    def recognize_video_traffic(self, db: Session, video_id: int):
        hikiot_result = self._refresh_hikiot_video_traffic(db, video_id)
        if hikiot_result is None:
            return {"success": False, "message": "设备不存在"}
        if bool(hikiot_result.get("success")):
            return hikiot_result
        hikiot_error = str(hikiot_result.get("message") or "")
        if "401" in hikiot_error or "invalid access token" in hikiot_error.lower():
            return {
                **hikiot_result,
                "source": "hikiot",
                "message": "Hikiot token 已失效，请更新 HIKIOT_BEARER_TOKEN 后重试",
                "hikiot_error": hikiot_error,
            }

        print(f"[TrafficOCR] recognize start video_id={video_id}")
        db_video = self._get_video_runtime_by_id(video_id)
        if not db_video:
            return {"success": False, "message": "设备不存在"}

        debug_dir = self._get_traffic_ocr_debug_dir()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]

        try:
            snapshot_path, method = self._capture_traffic_snapshot(db, db_video, debug_dir, timestamp)
            print(f"[TrafficOCR] snapshot method={method}")
            print(f"[TrafficOCR] snapshot saved path={snapshot_path}")
        except Exception as exc:
            reason = str(exc) or "鑾峰彇鎴浘澶辫触"
            print(f"[TrafficOCR] recognize failed reason={reason}")
            return {"success": False, "message": reason, "hikiot_error": hikiot_error}

        try:
            ocr_result = self._recognize_traffic_from_snapshot(
                snapshot_path=snapshot_path,
                video_id=video_id,
                debug_dir=debug_dir,
                timestamp=timestamp,
            )
        except Exception as exc:
            reason = str(exc) or "璇嗗埆澶辫触"
            print(f"[TrafficOCR] recognize failed reason={reason}")
            return {"success": False, "message": reason, "hikiot_error": hikiot_error}

        raw_text = str(ocr_result.get("raw_text") or "")
        traffic_text = str(ocr_result.get("traffic_text") or "")
        used_gb = ocr_result.get("used_gb")
        candidates = ocr_result.get("candidates") or []
        roi_path = str(ocr_result.get("roi_path") or "")
        debug_image = str(ocr_result.get("debug_image") or roi_path)

        result = self.report_traffic_ocr(db, video_id, traffic_text, used_gb)
        if not result:
            return {"success": False, "message": "设备不存在"}

        traffic_debug = dict(result.get("traffic_debug") or {})
        if hikiot_error:
            traffic_debug["hikiot_error"] = hikiot_error
        ocr_selected_candidate = next((item for item in candidates if not item.get("excluded")), None)
        if ocr_selected_candidate:
            raw_candidate_value = ocr_selected_candidate.get("raw_value_gb")
            integer_candidate_value = ocr_selected_candidate.get("integer_value_gb")
            if raw_candidate_value is not None:
                traffic_debug["raw_selected_traffic_value"] = raw_candidate_value
            if integer_candidate_value is not None:
                traffic_debug["integer_selected_traffic_value"] = integer_candidate_value
                traffic_debug["selected_traffic_value"] = float(integer_candidate_value)
        traffic_debug.update({
            "selected_source": ocr_result.get("selected_source"),
            "selected_preprocessing": ocr_result.get("selected_preprocessing"),
            "selected_candidate_raw": ocr_result.get("selected_candidate_raw"),
            "rejected_big_integer_candidates": ocr_result.get("rejected_big_integer_candidates") or [],
            "all_candidates_count": ocr_result.get("all_candidates_count", len(candidates)),
            "usable_candidates_count": ocr_result.get("usable_candidates_count", 0),
            "excluded_candidates_count": ocr_result.get("excluded_candidates_count", 0),
            "no_usable_candidate_reason": ocr_result.get("no_usable_candidate_reason") or "",
            "segmented_left_raw_text": ocr_result.get("segmented_left_raw_text") or "",
            "segmented_middle_raw_text": ocr_result.get("segmented_middle_raw_text") or "",
            "segmented_right_raw_text": ocr_result.get("segmented_right_raw_text") or "",
            "segmented_left_text": ocr_result.get("segmented_left_text") or "",
            "segmented_middle_text": ocr_result.get("segmented_middle_text") or "",
            "segmented_right_text": ocr_result.get("segmented_right_text") or "",
            "segmented_merged_text": ocr_result.get("segmented_merged_text") or "",
            "segmented_merge_method": ocr_result.get("segmented_merge_method") or "",
            "segmented_candidate_value": ocr_result.get("segmented_candidate_value"),
            "recognized_chars": ocr_result.get("recognized_chars") or [],
            "char_boxes": ocr_result.get("char_boxes") or [],
            "char_confidences": ocr_result.get("char_confidences") or [],
            "template_match_text": ocr_result.get("template_match_text") or "",
            "traffic_text": ocr_result.get("traffic_text") or traffic_text,
            "traffic_value": ocr_result.get("traffic_value"),
            "template_match_debug_images": ocr_result.get("template_match_debug_images") or {},
            "primary_roi_texts": ocr_result.get("primary_roi_texts") or [],
            "primary_roi_candidates": ocr_result.get("primary_roi_candidates") or [],
            "primary_roi_debug": ocr_result.get("primary_roi_debug") or [],
            "selected_roi_name": ocr_result.get("selected_roi_name") or "",
        })
        result["traffic_debug"] = traffic_debug

        traffic_value = None
        traffic_unit = ""
        value_match = re.search(r"(\d+(?:\.\d+)?)(TB|GB|MB)", traffic_text or "", re.IGNORECASE)
        if value_match:
            traffic_value = float(value_match.group(1))
            traffic_unit = value_match.group(2).upper()

        print("[TrafficOCR] update status success")
        return {
            **result,
            "success": bool(result.get("success", used_gb is not None)),
            "device_id": video_id,
            "raw_text": raw_text,
            "traffic_text": traffic_text,
            "traffic_value": traffic_value,
            "traffic_unit": traffic_unit,
            "used_traffic_gb": used_gb,
            "candidates": candidates,
            "debug_image": debug_image,
            "roi_path": roi_path,
            "precise_raw_text": ocr_result.get("precise_raw_text") or "",
            "precise_roi_path": ocr_result.get("precise_roi_path") or "",
            "ocr_variants": ocr_result.get("ocr_variants") or [],
            "selected_source": ocr_result.get("selected_source"),
            "selected_preprocessing": ocr_result.get("selected_preprocessing"),
            "selected_candidate_raw": ocr_result.get("selected_candidate_raw"),
            "rejected_big_integer_candidates": ocr_result.get("rejected_big_integer_candidates") or [],
            "all_candidates_count": ocr_result.get("all_candidates_count", len(candidates)),
            "usable_candidates_count": ocr_result.get("usable_candidates_count", 0),
            "excluded_candidates_count": ocr_result.get("excluded_candidates_count", 0),
            "no_usable_candidate_reason": ocr_result.get("no_usable_candidate_reason") or "",
            "traffic_limit_gb": result.get("monthly_threshold_gb"),
            "segmented_left_raw_text": ocr_result.get("segmented_left_raw_text") or "",
            "segmented_middle_raw_text": ocr_result.get("segmented_middle_raw_text") or "",
            "segmented_right_raw_text": ocr_result.get("segmented_right_raw_text") or "",
            "segmented_left_text": ocr_result.get("segmented_left_text") or "",
            "segmented_middle_text": ocr_result.get("segmented_middle_text") or "",
            "segmented_right_text": ocr_result.get("segmented_right_text") or "",
            "segmented_merged_text": ocr_result.get("segmented_merged_text") or "",
            "segmented_merge_method": ocr_result.get("segmented_merge_method") or "",
            "segmented_candidate_value": ocr_result.get("segmented_candidate_value"),
            "recognized_chars": ocr_result.get("recognized_chars") or [],
            "char_boxes": ocr_result.get("char_boxes") or [],
            "char_confidences": ocr_result.get("char_confidences") or [],
            "template_match_text": ocr_result.get("template_match_text") or "",
            "template_match_debug_images": ocr_result.get("template_match_debug_images") or {},
            "primary_roi_texts": ocr_result.get("primary_roi_texts") or [],
            "primary_roi_candidates": ocr_result.get("primary_roi_candidates") or [],
            "primary_roi_debug": ocr_result.get("primary_roi_debug") or [],
            "selected_roi_name": ocr_result.get("selected_roi_name") or "",
            "estimated_remaining_gb": result.get("estimated_remaining_gb"),
            "last_calculated_at": result.get("last_update_time") or result.get("last_calculated_at"),
        }

    def _get_traffic_ocr_debug_dir(self) -> str:
        root = Path(__file__).resolve().parents[2] / "runtime" / "traffic_ocr"
        root.mkdir(parents=True, exist_ok=True)
        return str(root)

    def _get_traffic_ocr_debug_image_path(self) -> str:
        raw_path = str(os.getenv(TRAFFIC_OCR_DEBUG_IMAGE_ENV, "") or "").strip().strip('"')
        if not raw_path:
            return ""
        path = Path(raw_path)
        if path.is_absolute():
            return str(path)
        return str((Path.cwd() / path).resolve())

    def _capture_traffic_snapshot(self, db: Session, db_video: VideoDevice, debug_dir: str, timestamp: str) -> tuple[str, str]:
        video_id = int(getattr(db_video, "id"))
        snapshot_path = os.path.join(debug_dir, f"snapshot_{video_id}_{timestamp}.jpg")

        debug_image_path = self._get_traffic_ocr_debug_image_path()
        if debug_image_path:
            if not os.path.exists(debug_image_path):
                raise ValueError("测试图片不存在")
            shutil.copyfile(debug_image_path, snapshot_path)
            print(f"[TrafficOCR] snapshot method=debug_image path={debug_image_path}")
            return snapshot_path, "debug_image"

        if self._is_ezviz_access(db_video):
            try:
                self._capture_ezviz_snapshot(db_video, snapshot_path)
                return snapshot_path, "ezviz"
            except Exception as exc:
                print(f"[TrafficOCR] ezviz snapshot failed video_id={video_id} reason={exc}")

        live_url = ""
        try:
            protocol = "hls" if self._is_ezviz_access(db_video) else None
            stream_info = self.get_stream_info(db, video_id, protocol=protocol)
            live_url = str((stream_info or {}).get("url") or "")
        except Exception as exc:
            print(f"[TrafficOCR] get stream url failed video_id={video_id} reason={exc}")

        if not live_url:
            live_url = str(getattr(db_video, "rtsp_url", "") or getattr(db_video, "stream_url", "") or "")
        if not live_url:
            raise ValueError("鐩存挱娴佷笉鍙敤")

        self._capture_ffmpeg_snapshot(live_url, snapshot_path)
        return snapshot_path, "ffmpeg"

    def _capture_ezviz_snapshot(self, db_video: VideoDevice, output_path: str) -> None:
        device_serial = str(getattr(db_video, "device_serial", "") or "").strip()
        channel_no = int(getattr(db_video, "channel_no", None) or 1)
        if not device_serial:
            raise ValueError("钀ょ煶璁惧缂哄皯 device_serial")

        payload = {"deviceSerial": device_serial, "channelNo": channel_no}
        body = None
        last_error = None
        for path in ["/api/lapp/device/capture", "/api/lapp/v2/device/capture"]:
            try:
                body = self._call_ezviz_api(path, payload)
                break
            except Exception as exc:
                last_error = exc

        if body is None:
            raise ValueError(f"钀ょ煶鎴浘澶辫触: {last_error}")

        data = body.get("data") or {}
        picture_url = (
            data.get("picUrl")
            or data.get("pictureUrl")
            or data.get("url")
            or data.get("imageUrl")
            or (data if isinstance(data, str) else "")
        )
        if not picture_url:
            raise ValueError("钀ょ煶鎴浘鎺ュ彛鏈繑鍥炲浘鐗囧湴鍧€")

        response = requests.get(str(picture_url), timeout=TRAFFIC_OCR_SNAPSHOT_TIMEOUT_SECONDS)
        response.raise_for_status()
        if not response.content:
            raise ValueError("钀ょ煶鎴浘涓虹┖")
        with open(output_path, "wb") as fh:
            fh.write(response.content)

    def _capture_ffmpeg_snapshot(self, live_url: str, output_path: str) -> None:
        ffmpeg_path = self._get_ffmpeg_path()
        command = [
            ffmpeg_path,
            "-y",
            "-loglevel",
            "error",
            "-rtsp_transport",
            "tcp",
            "-i",
            live_url,
            "-frames:v",
            "1",
            "-q:v",
            "2",
            output_path,
        ]
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=TRAFFIC_OCR_SNAPSHOT_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            raise ValueError("鑾峰彇鎴浘瓒呮椂")

        if result.returncode != 0:
            error = (result.stderr or result.stdout or "").strip()[-500:]
            raise ValueError(f"鑾峰彇鎴浘澶辫触: {error or 'ffmpeg 鎴浘澶辫触'}")
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise ValueError("鑾峰彇鎴浘澶辫触")

    def _recognize_traffic_from_snapshot(
        self,
        snapshot_path: str,
        video_id: int,
        debug_dir: str,
        timestamp: str,
    ) -> dict:
        try:
            import cv2
        except Exception as exc:
            raise ValueError(f"OpenCV dependency is not installed: {exc}")

        try:
            import numpy as np
        except Exception as exc:
            raise ValueError(f"NumPy dependency is not installed: {exc}")

        try:
            import pytesseract
            self._configure_pytesseract(pytesseract)
        except Exception:
            pytesseract = None

        image_bytes = np.fromfile(snapshot_path, dtype=np.uint8)
        image = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR) if image_bytes.size else None
        if image is None:
            raise ValueError("Snapshot image cannot be read")

        def write_image(image_path: str, image_data) -> bool:
            ext = os.path.splitext(image_path)[1] or ".jpg"
            ok, encoded = cv2.imencode(ext, image_data)
            if not ok:
                return False
            encoded.tofile(image_path)
            return True

        h, w = image.shape[:2]
        if self._get_traffic_ocr_debug_image_path():
            print(f"[TrafficOCR] frame.shape={image.shape}")

        x1 = max(0, min(w - 1, int(w * 0.20)))
        y1 = 0
        x2 = w
        y2 = max(y1 + 1, min(h, int(h * 0.25)))
        print(f"[TrafficOCR] crop top roi x1={x1} y1={y1} x2={x2} y2={y2}")

        roi = image[y1:y2, x1:x2]
        debug_static_dir = self._get_default_static_subdir("debug")
        roi_abs_path = os.path.join(debug_static_dir, "traffic_ocr_roi.jpg")
        write_image(roi_abs_path, roi)
        roi_path = self._to_backend_static_web_path(roi_abs_path)
        print(f"[TrafficOCR] roi saved path={roi_abs_path}")

        roi_h, roi_w = roi.shape[:2]
        px1 = max(0, min(roi_w - 1, int(roi_w * 0.35)))
        py1 = max(0, min(roi_h - 1, int(roi_h * 0.35)))
        px2 = max(px1 + 1, min(roi_w, int(roi_w * 0.70)))
        py2 = max(py1 + 1, min(roi_h, int(roi_h * 0.85)))
        precise_roi = roi[py1:py2, px1:px2]
        precise_abs_path = os.path.join(debug_static_dir, "traffic_ocr_roi_precise.jpg")
        write_image(precise_abs_path, precise_roi)
        precise_roi_path = self._to_backend_static_web_path(precise_abs_path)
        print(f"[TrafficOCR] precise roi saved path={precise_abs_path}")

        traffic_runtime = self._get_video_runtime_by_id(video_id)
        historical_used_gb, _, _ = self._get_stored_traffic_usage_gb(traffic_runtime) if traffic_runtime else (None, "", None)
        monthly_threshold_gb = MONTHLY_TRAFFIC_THRESHOLD_GB

        def has_left_text_region(gray_image) -> bool:
            if gray_image is None or gray_image.size == 0:
                return False
            h0, w0 = gray_image.shape[:2]
            left = gray_image[:, :max(1, int(w0 * 0.45))]
            dark_pixels = int(np.count_nonzero(left < 90))
            light_pixels = int(np.count_nonzero(left > 170))
            text_ratio = (dark_pixels + light_pixels) / max(1, left.size)
            return text_ratio > 0.015

        precise_gray = cv2.cvtColor(precise_roi, cv2.COLOR_BGR2GRAY)
        precise_left_has_text = has_left_text_region(precise_gray)

        def build_dual_mask(gray_image):
            dark_mask = gray_image < 90
            light_mask = gray_image > 170
            text_mask = np.logical_or(dark_mask, light_mask)
            output = np.full(gray_image.shape, 255, dtype=np.uint8)
            output[text_mask] = 0
            return output

        def save_debug_image(file_name: str, image_data) -> str:
            abs_path = os.path.join(debug_static_dir, file_name)
            write_image(abs_path, image_data)
            return self._to_backend_static_web_path(abs_path)

        def normalize_segment_text(raw_text: str, allowed_pattern: str) -> str:
            text = str(raw_text or "").upper()
            text = text.replace("O", "0").replace("L", "1").replace("I", "1")
            text = text.replace(",", ".")
            return "".join(re.findall(allowed_pattern, text))

        def normalize_primary_roi_text(raw_text: str) -> str:
            text = str(raw_text or "")
            text = re.sub(r"\s+", "", text).upper()
            text = text.replace("O", "0")
            text = text.replace("I", "1").replace("L", "1").replace("|", "1")
            text = text.replace("S", "5")
            text = text.replace(",", ".")
            text = re.sub(r"(?<=[0-9.])G8\b", "GB", text)
            text = re.sub(r"(?<=[0-9.])M8\b", "MB", text)
            text = re.sub(r"(?<=[0-9.])B8\b", "GB", text)
            return text

        def extract_primary_roi_candidates(raw_text: str, variant_name: str, roi_name: str, roi_priority: int) -> list[dict]:
            normalized = normalize_primary_roi_text(raw_text)
            pattern = re.compile(r"(\d+(?:\.\d+)?|\.\d+)\s*(GB|G|MB|M)", re.IGNORECASE)
            candidates: list[dict] = []
            communication_noise = bool(re.search(r"(?:^|[^0-9.])4G(?:[.,]?\d{2,4})", normalized))
            for match in pattern.finditer(normalized):
                value_text = match.group(1)
                unit = match.group(2).upper()
                compact_tail = normalized[match.start():match.end() + 8]
                if unit == "G" and value_text == "4":
                    if re.match(r"4G(?:[.,]?\d+)?", compact_tail):
                        continue
                try:
                    value = float(value_text if not value_text.startswith(".") else f"0{value_text}")
                except ValueError:
                    continue
                raw_value_gb = max(0.0, value / 1024 if unit in {"M", "MB"} else value)
                integer_value_gb = self._integer_traffic_gb(raw_value_gb)
                value_gb = float(integer_value_gb)
                has_decimal = "." in value_text
                within_threshold = 0 <= value_gb <= monthly_threshold_gb
                history_suspicious = self._is_suspicious_traffic_history(historical_used_gb, monthly_threshold_gb)
                historical_normal = historical_used_gb is not None and 0 <= float(historical_used_gb) <= monthly_threshold_gb
                near_history = (
                    not historical_normal
                    or history_suspicious
                    or value_gb - float(historical_used_gb) <= 5
                )
                score = 1000.0
                if unit in {"G", "GB"}:
                    score += 500
                if has_decimal:
                    score += 300
                if unit == "GB":
                    score += 80
                if variant_name in {"original_gray_4x", "light_enhanced"}:
                    score += 40
                score += max(0, 30 - roi_priority * 10)
                excluded_reasons: list[str] = []
                if roi_name != "primary_traffic_mid_right_exact" and communication_noise and 4 <= value_gb < 5:
                    excluded_reasons.append("communication_4g_noise")
                    score -= 1200
                if not within_threshold:
                    excluded_reasons.append("exceeds_monthly_threshold")
                    score -= 1000
                if not near_history:
                    excluded_reasons.append("candidate_delta_exceeds_5gb_from_history")
                    score -= 1000
                display_value = integer_value_gb
                display_unit = "GB"
                text = f"{integer_value_gb}GB"
                candidates.append({
                    "raw": match.group(0),
                    "normalized_raw_text": normalized,
                    "text": text,
                    "value": display_value,
                    "unit": display_unit,
                    "raw_value_gb": raw_value_gb,
                    "integer_value_gb": integer_value_gb,
                    "value_gb": value_gb,
                    "start": match.start(),
                    "end": match.end(),
                    "position_ratio": round(match.start() / max(1, len(normalized)), 4),
                    "has_decimal": has_decimal,
                    "excluded": bool(excluded_reasons),
                    "exclude_reason": ",".join(excluded_reasons),
                    "score": round(score, 4),
                    "source": "primary_roi",
                    "roi_name": roi_name,
                    "roi_priority": roi_priority,
                    "variant": variant_name,
                    "preprocessing": variant_name,
                    "trusted_decimal": has_decimal and unit in {"G", "GB"},
                })
            candidates.sort(
                key=lambda item: (
                    0 if item.get("excluded") else 1,
                    1 if str(item.get("unit")).upper() == "GB" else 0,
                    1 if item.get("has_decimal") else 0,
                    float(item.get("score", 0)),
                ),
                reverse=True,
            )
            return candidates

        def build_primary_roi_candidate() -> tuple[Optional[dict], dict]:
            debug_info = {
                "primary_roi_texts": [],
                "primary_roi_candidates": [],
                "selected_roi_name": "",
                "primary_roi_debug": [],
            }
            if pytesseract is None:
                return None, debug_info

            roi_specs = [
                ("primary_traffic_mid_right_exact", 0.50, 0.67, 0.00, 0.10),
                ("primary_traffic_mid_right_wide", 0.48, 0.70, 0.00, 0.12),
                ("primary_traffic_mid_right_extra", 0.46, 0.72, 0.00, 0.13),
            ]
            config = "--psm 7 --oem 3 -c tessedit_char_whitelist=0123456789.GBMbgm"
            all_candidates: list[dict] = []
            selected_by_priority: Optional[dict] = None
            for roi_priority, (roi_name, x1_ratio, x2_ratio, y1_ratio, y2_ratio) in enumerate(roi_specs):
                rx1 = max(0, min(w - 1, int(w * x1_ratio)))
                ry1 = max(0, min(h - 1, int(h * y1_ratio)))
                rx2 = max(rx1 + 1, min(w, int(w * x2_ratio)))
                ry2 = max(ry1 + 1, min(h, int(h * y2_ratio)))
                primary_roi = image[ry1:ry2, rx1:rx2]
                roi_path = save_debug_image(f"traffic_ocr_{roi_name}.jpg", primary_roi)

                gray = cv2.cvtColor(primary_roi, cv2.COLOR_BGR2GRAY)
                gray_4x = cv2.resize(gray, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
                _, light_mask = cv2.threshold(gray_4x, 165, 255, cv2.THRESH_BINARY)
                light_enhanced = cv2.bitwise_not(light_mask)
                inverted = cv2.bitwise_not(gray_4x)
                _, otsu = cv2.threshold(gray_4x, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
                dilated = cv2.dilate(otsu, dilate_kernel, iterations=1)
                variants = [
                    ("original_gray_4x", gray_4x),
                    ("light_enhanced", light_enhanced),
                    ("inverted", inverted),
                    ("otsu", otsu),
                    ("dilated", dilated),
                ]
                roi_debug = {
                    "roi_name": roi_name,
                    "x1_ratio": x1_ratio,
                    "x2_ratio": x2_ratio,
                    "y1_ratio": y1_ratio,
                    "y2_ratio": y2_ratio,
                    "path": roi_path,
                    "ocr_texts": [],
                    "candidates": [],
                    "selected_reason": "",
                }
                for variant_name, variant in variants:
                    variant_path = save_debug_image(f"traffic_ocr_{roi_name}_{variant_name}.jpg", variant)
                    try:
                        raw_text = pytesseract.image_to_string(
                            variant,
                            lang="eng",
                            config=config,
                            timeout=TRAFFIC_OCR_ENGINE_TIMEOUT_SECONDS,
                        )
                    except RuntimeError as exc:
                        if "timeout" in str(exc).lower():
                            raise ValueError("OCR timeout")
                        raise
                    raw_text = str(raw_text or "").strip()
                    normalized_text = normalize_primary_roi_text(raw_text)
                    text_debug = {
                        "roi_name": roi_name,
                        "variant": variant_name,
                        "raw_text": raw_text,
                        "normalized_text": normalized_text,
                        "path": variant_path,
                    }
                    roi_debug["ocr_texts"].append(text_debug)
                    debug_info["primary_roi_texts"].append(text_debug)
                    variant_candidates = extract_primary_roi_candidates(raw_text, variant_name, roi_name, roi_priority)
                    roi_debug["candidates"].extend(variant_candidates)
                    all_candidates.extend(variant_candidates)

                roi_debug["candidates"].sort(
                    key=lambda item: (
                        0 if item.get("excluded") else 1,
                        1 if str(item.get("unit")).upper() == "GB" else 0,
                        1 if item.get("has_decimal") else 0,
                        float(item.get("score", 0)),
                    ),
                    reverse=True,
                )
                usable_for_roi = [item for item in roi_debug["candidates"] if not item.get("excluded")]
                if usable_for_roi and selected_by_priority is None:
                    selected_by_priority = usable_for_roi[0]
                    roi_debug["selected_reason"] = "selected_first_usable_roi_by_priority"
                elif usable_for_roi:
                    roi_debug["selected_reason"] = "usable_but_lower_priority_roi"
                else:
                    excluded_reasons = sorted({
                        str(item.get("exclude_reason") or "")
                        for item in roi_debug["candidates"]
                        if item.get("exclude_reason")
                    })
                    roi_debug["selected_reason"] = ",".join(excluded_reasons) or "no_usable_candidate"
                debug_info["primary_roi_debug"].append(roi_debug)

            all_candidates.sort(
                key=lambda item: (
                    0 if item.get("excluded") else 1,
                    -int(item.get("roi_priority", 99)),
                    1 if str(item.get("unit")).upper() == "GB" else 0,
                    1 if item.get("has_decimal") else 0,
                    1 if item.get("source") == "primary_roi" else 0,
                    float(item.get("score", 0)),
                ),
                reverse=True,
            )
            debug_info["primary_roi_candidates"] = all_candidates
            if not selected_by_priority:
                return None, debug_info
            selected = selected_by_priority
            debug_info["selected_roi_name"] = str(selected.get("roi_name") or "")
            selected["score"] = round(float(selected.get("score", 0)) + 10000, 4)
            return selected, debug_info

        def build_template_match_candidate() -> tuple[Optional[dict], dict]:
            debug_info = {
                "selected_source": "template_match",
                "selected_preprocessing": "connected_components",
                "recognized_chars": [],
                "char_boxes": [],
                "char_confidences": [],
                "template_match_text": "",
                "traffic_text": "",
                "traffic_value": None,
                "template_match_debug_images": {},
            }
            if precise_roi is None or precise_roi.size == 0:
                return None, debug_info

            template_roi_path = save_debug_image("traffic_ocr_template_roi.jpg", precise_roi)
            enlarged = cv2.resize(precise_roi, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
            gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
            _, dark_mask = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
            _, light_mask = cv2.threshold(gray, 165, 255, cv2.THRESH_BINARY)
            dual_mask = cv2.bitwise_or(dark_mask, light_mask)
            close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            dual_mask = cv2.morphologyEx(dual_mask, cv2.MORPH_CLOSE, close_kernel, iterations=1)
            dual_mask = cv2.medianBlur(dual_mask, 3)
            dark_mask_path = save_debug_image("traffic_ocr_template_dark_mask.jpg", dark_mask)
            light_mask_path = save_debug_image("traffic_ocr_template_light_mask.jpg", light_mask)
            mask_path = save_debug_image("traffic_ocr_template_mask.jpg", dual_mask)
            debug_info["template_match_debug_images"].update({
                "roi": template_roi_path,
                "dark_mask": dark_mask_path,
                "light_mask": light_mask_path,
                "mask": mask_path,
            })

            num_labels, labels, stats, _centroids = cv2.connectedComponentsWithStats(dual_mask, 8)
            mask_h, mask_w = dual_mask.shape[:2]
            min_area = max(8, int(mask_h * mask_w * 0.00025))
            max_area = int(mask_h * mask_w * 0.35)
            raw_boxes: list[tuple[int, int, int, int]] = []
            for label_idx in range(1, num_labels):
                x = int(stats[label_idx, cv2.CC_STAT_LEFT])
                y = int(stats[label_idx, cv2.CC_STAT_TOP])
                bw = int(stats[label_idx, cv2.CC_STAT_WIDTH])
                bh = int(stats[label_idx, cv2.CC_STAT_HEIGHT])
                area = int(stats[label_idx, cv2.CC_STAT_AREA])
                if area < min_area or area > max_area:
                    continue
                if bh < max(4, int(mask_h * 0.12)) and bw > max(6, bh * 2):
                    continue
                if bw < 2 or bh < 2:
                    continue
                raw_boxes.append((x, y, bw, bh))

            raw_boxes.sort(key=lambda box: box[0])
            if not raw_boxes:
                return None, debug_info

            median_width = float(np.median([box[2] for box in raw_boxes])) if raw_boxes else 0.0

            def split_wide_box(box: tuple[int, int, int, int]) -> list[tuple[int, int, int, int]]:
                x, y, bw, bh = box
                if median_width <= 0 or bw < median_width * 1.8:
                    return [box]
                crop = dual_mask[y:y + bh, x:x + bw]
                projection = np.count_nonzero(crop, axis=0)
                gap_cols = np.where(projection <= max(1, int(bh * 0.03)))[0]
                if gap_cols.size == 0:
                    return [box]
                ranges: list[tuple[int, int]] = []
                start = 0
                for col in gap_cols:
                    if col - start >= max(2, int(median_width * 0.35)):
                        ranges.append((start, col))
                    start = int(col) + 1
                if bw - start >= max(2, int(median_width * 0.35)):
                    ranges.append((start, bw))
                split_boxes: list[tuple[int, int, int, int]] = []
                for sx1, sx2 in ranges:
                    sub = crop[:, sx1:sx2]
                    ys, xs = np.where(sub > 0)
                    if xs.size == 0 or ys.size == 0:
                        continue
                    nx = x + sx1 + int(xs.min())
                    ny = y + int(ys.min())
                    nw = int(xs.max() - xs.min() + 1)
                    nh = int(ys.max() - ys.min() + 1)
                    split_boxes.append((nx, ny, nw, nh))
                return split_boxes or [box]

            boxes: list[tuple[int, int, int, int]] = []
            for box in raw_boxes:
                boxes.extend(split_wide_box(box))
            boxes.sort(key=lambda box: box[0])

            component_debug = cv2.cvtColor(dual_mask, cv2.COLOR_GRAY2BGR)
            for idx, (x, y, bw, bh) in enumerate(boxes):
                cv2.rectangle(component_debug, (x, y), (x + bw, y + bh), (0, 0, 255), 1)
                cv2.putText(component_debug, str(idx), (x, max(10, y - 2)), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 255), 1)
            components_path = save_debug_image("traffic_ocr_template_components.jpg", component_debug)
            debug_info["template_match_debug_images"]["components"] = components_path

            normalized_size = (28, 42)

            def normalize_char_mask(mask_crop):
                if mask_crop is None or mask_crop.size == 0:
                    return np.zeros((normalized_size[1], normalized_size[0]), dtype=np.uint8)
                ys, xs = np.where(mask_crop > 0)
                if xs.size == 0 or ys.size == 0:
                    return np.zeros((normalized_size[1], normalized_size[0]), dtype=np.uint8)
                tight = mask_crop[int(ys.min()):int(ys.max()) + 1, int(xs.min()):int(xs.max()) + 1]
                target_w, target_h = normalized_size
                scale = min((target_w - 6) / max(1, tight.shape[1]), (target_h - 6) / max(1, tight.shape[0]))
                new_w = max(1, int(round(tight.shape[1] * scale)))
                new_h = max(1, int(round(tight.shape[0] * scale)))
                resized = cv2.resize(tight, (new_w, new_h), interpolation=cv2.INTER_AREA)
                canvas = np.zeros((target_h, target_w), dtype=np.uint8)
                xoff = (target_w - new_w) // 2
                yoff = (target_h - new_h) // 2
                canvas[yoff:yoff + new_h, xoff:xoff + new_w] = resized
                _, canvas = cv2.threshold(canvas, 80, 255, cv2.THRESH_BINARY)
                return canvas

            def render_template(char: str, font_scale: float, thickness: int = 2):
                target_w, target_h = normalized_size
                canvas = np.zeros((target_h, target_w), dtype=np.uint8)
                if char == ".":
                    cv2.circle(canvas, (target_w // 2, target_h - 7), 3, 255, -1)
                    return canvas
                (tw, th), baseline = cv2.getTextSize(char, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
                x = max(0, (target_w - tw) // 2)
                y = max(th + 1, (target_h + th) // 2 - baseline)
                cv2.putText(canvas, char, (x, y), cv2.FONT_HERSHEY_SIMPLEX, font_scale, 255, thickness, cv2.LINE_AA)
                _, canvas = cv2.threshold(canvas, 80, 255, cv2.THRESH_BINARY)
                return canvas

            template_chars = "0123456789.GB"
            templates = {
                char: [
                    render_template(char, 1.0, 2),
                    render_template(char, 0.9, 2),
                    render_template(char, 0.8, 1),
                ]
                for char in template_chars
            }

            def match_char(char_mask) -> tuple[str, float]:
                best_char = ""
                best_score = -1.0
                for char, variants in templates.items():
                    for template in variants:
                        score = float(cv2.matchTemplate(char_mask, template, cv2.TM_CCOEFF_NORMED)[0][0])
                        intersection = float(np.count_nonzero(cv2.bitwise_and(char_mask, template)))
                        union = float(np.count_nonzero(cv2.bitwise_or(char_mask, template)))
                        if union > 0:
                            score = (score + intersection / union) / 2.0
                        if score > best_score:
                            best_score = score
                            best_char = char
                return best_char, round(max(0.0, min(1.0, best_score)), 4)

            recognized_chars: list[str] = []
            char_boxes: list[dict] = []
            char_confidences: list[float] = []
            char_paths: list[str] = []
            for idx, (x, y, bw, bh) in enumerate(boxes):
                pad = 2
                x0 = max(0, x - pad)
                y0 = max(0, y - pad)
                x3 = min(mask_w, x + bw + pad)
                y3 = min(mask_h, y + bh + pad)
                char_crop = dual_mask[y0:y3, x0:x3]
                normalized_char = normalize_char_mask(char_crop)
                char_path = save_debug_image(f"traffic_char_{idx}.jpg", normalized_char)
                char, confidence = match_char(normalized_char)
                recognized_chars.append(char)
                char_confidences.append(confidence)
                char_paths.append(char_path)
                char_boxes.append({
                    "x": round(x / 4, 2),
                    "y": round(y / 4, 2),
                    "w": round(bw / 4, 2),
                    "h": round(bh / 4, 2),
                })

            template_text = "".join(recognized_chars).upper()
            template_text = template_text.replace("8B", "GB").replace("6B", "GB")
            debug_info.update({
                "recognized_chars": recognized_chars,
                "char_boxes": char_boxes,
                "char_confidences": char_confidences,
                "template_match_text": template_text,
            })
            debug_info["template_match_debug_images"]["chars"] = char_paths

            match = re.search(r"(\d+(?:\.\d+)?)\s*(GB|G)", template_text, re.IGNORECASE)
            if not match:
                return None, debug_info
            raw_value_gb = max(0.0, float(match.group(1)))
            integer_value_gb = self._integer_traffic_gb(raw_value_gb)
            value_gb = float(integer_value_gb)
            traffic_text = f"{integer_value_gb}GB"
            history_suspicious = self._is_suspicious_traffic_history(historical_used_gb, monthly_threshold_gb)
            historical_normal = historical_used_gb is not None and 0 <= float(historical_used_gb) <= monthly_threshold_gb
            confidence_ok = bool(char_confidences) and min(char_confidences) >= 0.08 and (sum(char_confidences) / len(char_confidences)) >= 0.18
            within_threshold = 0 <= value_gb <= monthly_threshold_gb
            near_history = (
                not historical_normal
                or history_suspicious
                or value_gb - float(historical_used_gb) <= 5
            )
            debug_info["traffic_text"] = traffic_text
            debug_info["traffic_value"] = value_gb
            if not confidence_ok or not within_threshold or not near_history:
                return None, debug_info

            candidate = {
                "raw": template_text,
                "text": traffic_text,
                "value": integer_value_gb,
                "unit": "GB",
                "raw_value_gb": raw_value_gb,
                "integer_value_gb": integer_value_gb,
                "value_gb": value_gb,
                "start": match.start(),
                "end": match.end(),
                "position_ratio": round(match.start() / max(1, len(template_text)), 4),
                "has_decimal": "." in match.group(1),
                "excluded": False,
                "exclude_reason": "",
                "score": round(10000 + sum(char_confidences) / max(1, len(char_confidences)) * 100, 4),
                "source": "template_match",
                "variant": "connected_components",
                "preprocessing": "connected_components",
                "trusted_decimal": "." in match.group(1),
                "recognized_chars": recognized_chars,
                "char_boxes": char_boxes,
                "char_confidences": char_confidences,
            }
            return candidate, debug_info

        def build_segmented_candidate() -> tuple[Optional[dict], dict]:
            debug_info = {
                "segmented_left_raw_text": "",
                "segmented_middle_raw_text": "",
                "segmented_right_raw_text": "",
                "segmented_left_text": "",
                "segmented_middle_text": "",
                "segmented_right_text": "",
                "segmented_merged_text": "",
                "segmented_merge_method": "",
                "segmented_candidate_value": None,
            }
            if pytesseract is None:
                return None, debug_info
            roi_height, roi_width = precise_roi.shape[:2]
            if roi_width <= 1 or roi_height <= 1:
                return None, debug_info

            left_roi = precise_roi[:, 0:max(1, int(roi_width * 0.62))]
            middle_roi = precise_roi[:, max(0, int(roi_width * 0.22)):max(1, int(roi_width * 0.50))]
            right_roi = precise_roi[:, max(0, int(roi_width * 0.18)):roi_width]
            save_debug_image("traffic_ocr_left_roi.jpg", left_roi)
            save_debug_image("traffic_ocr_middle_roi.jpg", middle_roi)
            save_debug_image("traffic_ocr_right_roi.jpg", right_roi)

            left_enlarged = cv2.resize(left_roi, None, fx=5, fy=5, interpolation=cv2.INTER_CUBIC)
            middle_enlarged = cv2.resize(middle_roi, None, fx=5, fy=5, interpolation=cv2.INTER_CUBIC)
            right_enlarged = cv2.resize(right_roi, None, fx=5, fy=5, interpolation=cv2.INTER_CUBIC)
            left_gray = cv2.cvtColor(left_enlarged, cv2.COLOR_BGR2GRAY)
            middle_gray = cv2.cvtColor(middle_enlarged, cv2.COLOR_BGR2GRAY)
            right_gray = cv2.cvtColor(right_enlarged, cv2.COLOR_BGR2GRAY)
            _, left_binary = cv2.threshold(left_gray, 90, 255, cv2.THRESH_BINARY)
            _, middle_binary = cv2.threshold(middle_gray, 90, 255, cv2.THRESH_BINARY)
            _, right_binary = cv2.threshold(right_gray, 170, 255, cv2.THRESH_BINARY_INV)
            save_debug_image("traffic_ocr_left_binary.jpg", left_binary)
            save_debug_image("traffic_ocr_middle_binary.jpg", middle_binary)
            save_debug_image("traffic_ocr_right_binary.jpg", right_binary)

            left_config = "--psm 7 -c tessedit_char_whitelist=0123456789."
            middle_config = "--psm 10 -c tessedit_char_whitelist=0123456789"
            right_config = "--psm 7 -c tessedit_char_whitelist=0123456789.GBgb"
            left_raw_parts: list[str] = []
            middle_raw_parts: list[str] = []
            right_raw_parts: list[str] = []
            left_texts: list[str] = []
            middle_texts: list[str] = []
            right_texts: list[str] = []

            for variant in [left_binary, left_gray]:
                raw_text = pytesseract.image_to_string(
                    variant,
                    lang="eng",
                    config=left_config,
                    timeout=TRAFFIC_OCR_ENGINE_TIMEOUT_SECONDS,
                )
                raw_text = str(raw_text or "").strip()
                if raw_text:
                    left_raw_parts.append(raw_text)
                normalized = normalize_segment_text(raw_text, r"[0-9.]")
                if normalized and normalized not in left_texts:
                    left_texts.append(normalized)

            middle_inverted_gray = cv2.bitwise_not(middle_gray)
            for variant in [middle_binary, middle_gray, middle_inverted_gray]:
                raw_text = pytesseract.image_to_string(
                    variant,
                    lang="eng",
                    config=middle_config,
                    timeout=TRAFFIC_OCR_ENGINE_TIMEOUT_SECONDS,
                )
                raw_text = str(raw_text or "").strip()
                if raw_text:
                    middle_raw_parts.append(raw_text)
                normalized = normalize_segment_text(raw_text, r"[0-9]")
                for digit in normalized:
                    if digit and digit not in middle_texts:
                        middle_texts.append(digit)

            right_inverted_gray = cv2.bitwise_not(right_gray)
            for variant in [right_binary, right_inverted_gray, right_gray]:
                raw_text = pytesseract.image_to_string(
                    variant,
                    lang="eng",
                    config=right_config,
                    timeout=TRAFFIC_OCR_ENGINE_TIMEOUT_SECONDS,
                )
                raw_text = str(raw_text or "").strip()
                if raw_text:
                    right_raw_parts.append(raw_text)
                normalized = normalize_segment_text(raw_text, r"[0-9.GB]")
                if normalized and normalized not in right_texts:
                    right_texts.append(normalized)

            debug_info["segmented_left_raw_text"] = "\n".join(left_raw_parts).strip()
            debug_info["segmented_middle_raw_text"] = "\n".join(middle_raw_parts).strip()
            debug_info["segmented_right_raw_text"] = "\n".join(right_raw_parts).strip()
            print(
                "[TrafficOCR] segmented raw left=%s middle=%s right=%s"
                % (
                    debug_info["segmented_left_raw_text"],
                    debug_info["segmented_middle_raw_text"],
                    debug_info["segmented_right_raw_text"],
                )
            )

            merged_options: list[tuple[str, float, str, str, str, str, int]] = []

            def add_merged_option(
                integer_part: str,
                decimal_part: str,
                left_text: str,
                middle_text: str,
                right_text: str,
                merge_method: str,
                priority: int,
            ):
                decimal_digits = re.sub(r"\D", "", str(decimal_part or ""))[:3]
                if not integer_part or not decimal_digits:
                    return
                merged_text = f"{integer_part}.{decimal_digits}GB"
                try:
                    value_gb = float(f"{integer_part}.{decimal_digits}")
                except ValueError:
                    return
                merged_options.append((
                    merged_text,
                    value_gb,
                    left_text,
                    middle_text,
                    right_text,
                    merge_method,
                    priority,
                ))

            for left_text in left_texts:
                left_match = re.search(r"^(\d{1,2})(?:\.(\d?))?$", left_text)
                if not left_match:
                    continue
                integer_part = left_match.group(1)
                left_decimal = left_match.group(2) or ""
                for right_text in right_texts:
                    right_match = re.search(r"(\d{1,4})(?:\.?)(?:GB|G|B)?$", right_text)
                    if not right_match:
                        continue
                    right_digits = right_match.group(1)

                    if len(right_digits) >= 3:
                        add_merged_option(
                            integer_part,
                            right_digits,
                            left_text,
                            "",
                            right_text,
                            "left_right_overlap",
                            90,
                        )

                    for middle_text in middle_texts:
                        if not middle_text:
                            continue
                        if right_digits.startswith(middle_text):
                            decimal_part = right_digits
                        else:
                            decimal_part = f"{middle_text}{right_digits}"
                        add_merged_option(
                            integer_part,
                            decimal_part,
                            left_text,
                            middle_text,
                            right_text,
                            "left_middle_right",
                            100,
                        )

                    if left_decimal and right_digits.startswith(left_decimal):
                        decimal_part = right_digits
                    else:
                        decimal_part = f"{left_decimal}{right_digits}"
                    add_merged_option(
                        integer_part,
                        decimal_part,
                        left_text,
                        "",
                        right_text,
                        "left_right",
                        50,
                    )

            history_suspicious = self._is_suspicious_traffic_history(historical_used_gb, monthly_threshold_gb)
            for merged_text, raw_value_gb, left_text, middle_text, right_text, merge_method, _priority in sorted(
                merged_options,
                key=lambda item: (
                    item[6],
                    len(re.search(r"\.(\d+)", item[0]).group(1)) if re.search(r"\.(\d+)", item[0]) else 0,
                    -abs(item[1] - float(historical_used_gb or item[1])),
                ),
                reverse=True,
            ):
                if merge_method == "left_right" and middle_texts and len(re.sub(r"\D", "", right_text)) < 3:
                    continue
                integer_value_gb = self._integer_traffic_gb(raw_value_gb)
                value_gb = float(integer_value_gb)
                debug_info["segmented_merged_text"] = merged_text
                debug_info["segmented_candidate_value"] = integer_value_gb
                debug_info["segmented_left_text"] = left_text
                debug_info["segmented_middle_text"] = middle_text
                debug_info["segmented_right_text"] = right_text
                debug_info["segmented_merge_method"] = merge_method
                within_threshold = 0 <= value_gb <= monthly_threshold_gb
                near_history = (
                    historical_used_gb is None
                    or history_suspicious
                    or abs(value_gb - float(historical_used_gb)) <= 5
                )
                if within_threshold and near_history:
                    candidate = {
                        "raw": f"{left_text}|{middle_text}|{right_text}",
                        "text": f"{integer_value_gb}GB",
                        "value": integer_value_gb,
                        "unit": "GB",
                        "raw_value_gb": raw_value_gb,
                        "integer_value_gb": integer_value_gb,
                        "value_gb": value_gb,
                        "start": 0,
                        "end": len(merged_text),
                        "position_ratio": 0,
                        "has_decimal": True,
                        "excluded": False,
                        "exclude_reason": "",
                        "score": 10000,
                        "source": "segmented_roi",
                        "variant": "split_merge",
                        "preprocessing": "split_merge",
                        "trusted_decimal": True,
                    }
                    return candidate, debug_info

            return None, debug_info

        def build_ocr_variants(source_image, source_name: str):
            enlarged = cv2.resize(source_image, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
            gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
            original_gray = cv2.cvtColor(source_image, cv2.COLOR_BGR2GRAY)
            original_resized = cv2.resize(original_gray, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
            _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            inverted = cv2.bitwise_not(otsu)
            _, dark_text_binary = cv2.threshold(gray, 90, 255, cv2.THRESH_BINARY)
            _, light_text_binary = cv2.threshold(gray, 170, 255, cv2.THRESH_BINARY_INV)
            dual_mask = build_dual_mask(gray)
            sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
            sharpened = cv2.filter2D(gray, -1, sharpen_kernel)
            adaptive = cv2.adaptiveThreshold(
                gray,
                255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY,
                31,
                5,
            )
            if source_name == "precise_roi":
                dual_mask_abs_path = os.path.join(debug_static_dir, "traffic_ocr_precise_roi_dual_mask.jpg")
                write_image(dual_mask_abs_path, dual_mask)
                return [
                    ("original_gray", original_gray),
                    ("original_resized", original_resized),
                    ("dual_mask", dual_mask),
                    ("dark_text_binary", dark_text_binary),
                    ("light_text_binary", light_text_binary),
                    ("adaptive", adaptive),
                    ("otsu", otsu),
                    ("invert", inverted),
                    ("sharpened", sharpened),
                ]
            return [
                ("original_gray", original_gray),
                ("original_resized", original_resized),
                ("enlarged", enlarged),
                ("otsu", otsu),
                ("invert", inverted),
                ("sharpened", sharpened),
                ("adaptive", adaptive),
            ]

        def run_ocr_for_source(source_name: str, source_image, config: str) -> tuple[str, list[dict], list[dict]]:
            if pytesseract is None:
                raise ValueError("OCR dependency is not installed")
            raw_text_parts: list[str] = []
            source_candidates: list[dict] = []
            source_variants: list[dict] = []

            def enrich_candidate(candidate: dict, variant_name: str) -> dict:
                enriched = dict(candidate)
                enriched["source"] = source_name
                enriched["variant"] = variant_name
                enriched["preprocessing"] = variant_name
                value_gb = float(enriched.get("value_gb", 0) or 0)
                has_decimal = bool(enriched.get("has_decimal"))
                unit = str(enriched.get("unit") or "").upper()
                trusted_decimal = (
                    source_name == "precise_roi"
                    and has_decimal
                    and unit in {"G", "GB"}
                    and variant_name in {"original_gray", "original_resized", "dual_mask"}
                )
                missing_left_part = (
                    source_name == "precise_roi"
                    and precise_left_has_text
                    and not has_decimal
                    and value_gb in {3.0, 73.0, 82.0, 873.0, 882.0}
                )
                historical_normal = (
                    historical_used_gb is not None
                    and 0 <= float(historical_used_gb) <= monthly_threshold_gb
                )
                history_suspicious = self._is_suspicious_traffic_history(historical_used_gb, monthly_threshold_gb)
                too_far_from_history = (
                    historical_used_gb is not None
                    and not history_suspicious
                    and abs(value_gb - float(historical_used_gb)) > 5
                )
                exclude_reasons: list[str] = []
                if trusted_decimal:
                    enriched["score"] = round(float(enriched.get("score", 0)) + 500, 4)
                    enriched["trusted_decimal"] = True
                if missing_left_part:
                    enriched["score"] = round(float(enriched.get("score", 0)) - 260, 4)
                    enriched["suspicious"] = True
                    enriched["suspicious_reason"] = "missing_left_decimal_part"
                if historical_normal and value_gb > monthly_threshold_gb and not trusted_decimal:
                    exclude_reasons.append("exceeds_monthly_threshold_without_trusted_decimal")
                if too_far_from_history:
                    exclude_reasons.append("candidate_delta_exceeds_5gb_from_history")
                if historical_normal and value_gb in {65.0, 73.0, 82.0, 93.0, 615.0, 873.0, 882.0, 6515.0} and not has_decimal:
                    exclude_reasons.append("known_missing_decimal_big_integer")
                if source_name == "full_top_roi" and unit in {"G", "GB"} and not has_decimal and value_gb in {65.0, 73.0, 82.0, 93.0, 615.0, 873.0, 882.0, 6515.0}:
                    exclude_reasons.append("full_top_roi_known_big_integer")
                if historical_normal and value_gb > monthly_threshold_gb:
                    enriched["score"] = round(float(enriched.get("score", 0)) - 420, 4)
                    enriched["suspicious"] = True
                    enriched["suspicious_reason"] = "exceeds_monthly_threshold_with_normal_history"
                if exclude_reasons:
                    enriched["excluded"] = True
                    enriched["exclude_reason"] = ",".join(dict.fromkeys(exclude_reasons))
                    enriched["score"] = round(float(enriched.get("score", 0)) - 2000, 4)
                return enriched

            for variant_name, variant in build_ocr_variants(source_image, source_name):
                variant_key = f"{source_name}:{variant_name}"
                variant_abs_path = os.path.join(debug_static_dir, f"traffic_ocr_{source_name}_{variant_name}.jpg")
                write_image(variant_abs_path, variant)
                variant_path = self._to_backend_static_web_path(variant_abs_path)

                try:
                    variant_config = config
                    if source_name == "precise_roi" and variant_name in {"original_gray", "original_resized", "dual_mask"}:
                        variant_config = "--psm 7 -c tessedit_char_whitelist=0123456789.GBgb"
                    raw_text = pytesseract.image_to_string(
                        variant,
                        lang="eng",
                        config=variant_config,
                        timeout=TRAFFIC_OCR_ENGINE_TIMEOUT_SECONDS,
                    )
                except RuntimeError as exc:
                    if "timeout" in str(exc).lower():
                        raise ValueError("OCR timeout")
                    raise

                raw_text = str(raw_text or "").strip()
                print(f"[TrafficOCR] ocr raw_text variant={variant_key}: {raw_text}")
                if raw_text:
                    raw_text_parts.append(raw_text)

                _, variant_candidates = self._parse_traffic_ocr_text_with_candidates(raw_text)
                enriched_candidates = []
                for candidate in variant_candidates:
                    enriched = enrich_candidate(candidate, variant_name)
                    enriched_candidates.append(enriched)
                    source_candidates.append(enriched)

                source_variants.append({
                    "source": source_name,
                    "variant": variant_name,
                    "path": variant_path,
                    "raw_text": raw_text,
                    "candidates": enriched_candidates,
                })

            combined_raw_text = "\n".join(raw_text_parts).strip()
            _, combined_candidates = self._parse_traffic_ocr_text_with_candidates(combined_raw_text)
            for candidate in combined_candidates:
                enriched = enrich_candidate(candidate, "combined")
                source_candidates.append(enriched)

            return combined_raw_text, source_candidates, source_variants

        precise_config = "--psm 6 -c tessedit_char_whitelist=0123456789.GBgb"
        top_config = "--psm 6 -c tessedit_char_whitelist=0123456789.,GBMTBgbmtb "
        primary_candidate, primary_debug = build_primary_roi_candidate()
        if primary_candidate:
            used_gb = max(0.0, float(primary_candidate["value_gb"]))
            traffic_text = str(primary_candidate["text"])
            raw_text = "\n".join(
                str(item.get("raw_text") or "")
                for item in primary_debug.get("primary_roi_texts", [])
                if item.get("raw_text")
            ).strip()
            print(f"[TrafficOCR] parsed traffic_text={traffic_text} used_gb={used_gb} source=primary_roi candidates={[primary_candidate]}")
            return {
                "raw_text": raw_text,
                "traffic_text": traffic_text,
                "used_gb": used_gb,
                "candidates": primary_debug.get("primary_roi_candidates") or [primary_candidate],
                "roi_path": roi_path,
                "debug_image": roi_path,
                "precise_raw_text": raw_text,
                "precise_roi_path": precise_roi_path,
                "ocr_variants": [],
                "selected_source": "primary_roi",
                "selected_preprocessing": str(primary_candidate.get("preprocessing") or ""),
                "selected_candidate_raw": primary_candidate.get("raw"),
                "traffic_value": used_gb,
                "rejected_big_integer_candidates": [],
                "all_candidates_count": len(primary_debug.get("primary_roi_candidates") or [primary_candidate]),
                "usable_candidates_count": len([
                    item for item in (primary_debug.get("primary_roi_candidates") or [primary_candidate])
                    if not item.get("excluded")
                ]),
                "excluded_candidates_count": len([
                    item for item in (primary_debug.get("primary_roi_candidates") or [])
                    if item.get("excluded")
                ]),
                "no_usable_candidate_reason": "",
                "segmented_left_raw_text": "",
                "segmented_middle_raw_text": "",
                "segmented_right_raw_text": "",
                "segmented_left_text": "",
                "segmented_middle_text": "",
                "segmented_right_text": "",
                "segmented_merged_text": "",
                "segmented_merge_method": "",
                "segmented_candidate_value": None,
                "recognized_chars": [],
                "char_boxes": [],
                "char_confidences": [],
                "template_match_text": "",
                **primary_debug,
            }
        segmented_candidate, segmented_debug = build_segmented_candidate()
        if segmented_candidate:
            used_gb = max(0.0, float(segmented_candidate["value_gb"]))
            traffic_text = str(segmented_candidate["text"])
            raw_text = "\n".join(
                part for part in [
                    segmented_debug.get("segmented_left_raw_text"),
                    segmented_debug.get("segmented_middle_raw_text"),
                    segmented_debug.get("segmented_right_raw_text"),
                    segmented_debug.get("segmented_merged_text"),
                ]
                if part
            ).strip()
            print(f"[TrafficOCR] parsed traffic_text={traffic_text} used_gb={used_gb} source=segmented_roi candidates={[segmented_candidate]}")
            return {
                "raw_text": raw_text,
                "traffic_text": traffic_text,
                "used_gb": used_gb,
                "candidates": [segmented_candidate],
                "roi_path": roi_path,
                "debug_image": roi_path,
                "precise_raw_text": raw_text,
                "precise_roi_path": precise_roi_path,
                "ocr_variants": [],
                "selected_source": "segmented_roi",
                "selected_preprocessing": "split_merge",
                "selected_candidate_raw": segmented_candidate.get("raw"),
                "rejected_big_integer_candidates": [],
                "all_candidates_count": 1,
                "usable_candidates_count": 1,
                "excluded_candidates_count": 0,
                "no_usable_candidate_reason": "",
                **primary_debug,
                **segmented_debug,
            }

        precise_raw_text, precise_candidates, precise_variants = run_ocr_for_source(
            "precise_roi",
            precise_roi,
            precise_config,
        )
        top_raw_text, top_candidates, top_variants = run_ocr_for_source(
            "full_top_roi",
            roi,
            top_config,
        )

        primary_candidates = primary_debug.get("primary_roi_candidates") or []
        all_candidates = primary_candidates + precise_candidates + top_candidates
        preprocessing_priority = {
            "original_gray": 100,
            "original_resized": 95,
            "dual_mask": 90,
            "dark_text_binary": 60,
            "light_text_binary": 55,
            "adaptive": 45,
            "otsu": 35,
            "invert": 30,
            "sharpened": 25,
            "combined": 10,
        }
        all_candidates.sort(
            key=lambda item: (
                0 if item.get("excluded") else 1,
                0 if item.get("suspicious") else 1,
                1 if item.get("source") == "precise_roi" else 0,
                1 if item.get("trusted_decimal") else 0,
                1 if item.get("has_decimal") else 0,
                preprocessing_priority.get(str(item.get("preprocessing") or item.get("variant") or ""), 0),
                float(item.get("score", 0)),
            ),
            reverse=True,
        )
        valid_precise = sorted(
            [item for item in precise_candidates if not item.get("excluded") and not item.get("suspicious")],
            key=lambda item: (
                1 if item.get("trusted_decimal") else 0,
                1 if item.get("has_decimal") else 0,
                preprocessing_priority.get(str(item.get("preprocessing") or item.get("variant") or ""), 0),
                float(item.get("score", 0)),
            ),
            reverse=True,
        )
        valid_top = sorted(
            [item for item in top_candidates if not item.get("excluded") and not item.get("suspicious")],
            key=lambda item: (
                1 if item.get("has_decimal") else 0,
                preprocessing_priority.get(str(item.get("preprocessing") or item.get("variant") or ""), 0),
                float(item.get("score", 0)),
            ),
            reverse=True,
        )
        selected = valid_precise[0] if valid_precise else (valid_top[0] if valid_top else None)
        selected_source = str(selected.get("source") or "") if selected else None
        selected_preprocessing = str(selected.get("preprocessing") or selected.get("variant") or "") if selected else None
        selected_candidate_raw = str(selected.get("raw") or "") if selected else None
        all_candidates_count = len(all_candidates)
        usable_candidates_count = len(valid_precise) + len(valid_top)
        excluded_candidates_count = len([
            item for item in all_candidates
            if item.get("excluded") or item.get("suspicious")
        ])
        no_usable_candidate_reason = "all_candidates_excluded" if all_candidates_count and not usable_candidates_count else ""
        rejected_big_integer_candidates = [
            {
                "raw": item.get("raw"),
                "text": item.get("text"),
                "value_gb": item.get("value_gb"),
                "source": item.get("source"),
                "preprocessing": item.get("preprocessing"),
                "exclude_reason": item.get("exclude_reason") or item.get("suspicious_reason") or "",
            }
            for item in all_candidates
            if (item.get("excluded") or item.get("suspicious"))
            and not item.get("has_decimal")
            and float(item.get("value_gb", 0) or 0) > monthly_threshold_gb
        ]
        if selected and selected.get("source") == "precise_roi" and selected.get("preprocessing") == "dual_mask":
            selected_source = "precise_roi_dual_mask"
        raw_text = "\n".join(part for part in [precise_raw_text, top_raw_text] if part).strip()

        if selected:
            used_gb = max(0.0, float(selected["value_gb"]))
            traffic_text = str(selected["text"])
            print(f"[TrafficOCR] parsed traffic_text={traffic_text} used_gb={used_gb} source={selected_source} candidates={all_candidates}")
            return {
                "raw_text": raw_text,
                "traffic_text": traffic_text,
                "used_gb": used_gb,
                "candidates": all_candidates,
                "roi_path": roi_path,
                "debug_image": roi_path,
                "precise_raw_text": precise_raw_text,
                "precise_roi_path": precise_roi_path,
                "ocr_variants": precise_variants + top_variants,
                "selected_source": selected_source,
                "selected_preprocessing": selected_preprocessing,
                "selected_candidate_raw": selected_candidate_raw,
                "rejected_big_integer_candidates": rejected_big_integer_candidates,
                "all_candidates_count": all_candidates_count,
                "usable_candidates_count": usable_candidates_count,
                "excluded_candidates_count": excluded_candidates_count,
                "no_usable_candidate_reason": no_usable_candidate_reason,
                **primary_debug,
                **segmented_debug,
            }

        template_candidate, template_debug = build_template_match_candidate()
        if template_candidate:
            used_gb = max(0.0, float(template_candidate["value_gb"]))
            traffic_text = str(template_candidate["text"])
            template_raw_text = str(template_debug.get("template_match_text") or "")
            template_candidates = all_candidates + [template_candidate]
            print(f"[TrafficOCR] parsed traffic_text={traffic_text} used_gb={used_gb} source=template_match candidates={template_candidates}")
            return {
                "raw_text": "\n".join(part for part in [raw_text, template_raw_text] if part).strip(),
                "traffic_text": traffic_text,
                "used_gb": used_gb,
                "candidates": template_candidates,
                "roi_path": roi_path,
                "debug_image": roi_path,
                "precise_raw_text": template_raw_text,
                "precise_roi_path": precise_roi_path,
                "ocr_variants": precise_variants + top_variants,
                "selected_source": "template_match",
                "selected_preprocessing": "connected_components",
                "selected_candidate_raw": template_candidate.get("raw"),
                "rejected_big_integer_candidates": rejected_big_integer_candidates,
                "all_candidates_count": len(template_candidates),
                "usable_candidates_count": usable_candidates_count + 1,
                "excluded_candidates_count": excluded_candidates_count,
                "no_usable_candidate_reason": "",
                **primary_debug,
                **segmented_debug,
                **template_debug,
            }

        raw_text = "\n".join([precise_raw_text, top_raw_text]).strip()
        print(f"[TrafficOCR] ocr raw_text={raw_text}")
        return {
            "raw_text": raw_text,
            "traffic_text": "",
            "used_gb": None,
            "candidates": all_candidates,
            "roi_path": roi_path,
            "debug_image": roi_path,
            "precise_raw_text": precise_raw_text,
            "precise_roi_path": precise_roi_path,
            "ocr_variants": precise_variants + top_variants,
            "selected_source": None,
            "selected_preprocessing": None,
            "selected_candidate_raw": None,
            "rejected_big_integer_candidates": rejected_big_integer_candidates,
            "all_candidates_count": all_candidates_count,
            "usable_candidates_count": usable_candidates_count,
            "excluded_candidates_count": excluded_candidates_count,
            "no_usable_candidate_reason": no_usable_candidate_reason or "no_traffic_candidates",
            **primary_debug,
            **segmented_debug,
        }

    def get_monitoring_summary(self, db: Session, video_id: int):
        db_video = self._get_video_runtime_by_id(video_id)
        if not db_video:
            return None

        if self._is_ezviz_access(db_video):
            self._refresh_ezviz_device_status(db_video)
            db_video = self._get_video_runtime_by_id(video_id) or db_video

        now = datetime.now()
        cycle_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        used_gb, ocr_text, traffic_updated_at = self._get_stored_traffic_usage_gb(db_video)
        if getattr(db_video, "traffic_source", None) == "hikiot":
            traffic_fields = self._build_hikiot_traffic_summary_fields(
                used_gb=self._parse_hikiot_flow_value_gb(getattr(db_video, "traffic_used_gb", None)),
                remaining_gb=self._parse_hikiot_flow_value_gb(getattr(db_video, "traffic_remaining_gb", None)),
                total_gb=self._parse_hikiot_flow_value_gb(getattr(db_video, "traffic_total_gb", None)),
                card_no=self._normalize_card_match_value(getattr(db_video, "traffic_sim_card_id", None)),
                expired_at=getattr(db_video, "traffic_card_expired_at", None),
            )
        else:
            traffic_fields = self._build_traffic_summary_fields(used_gb, ocr_text)
        status_summary = self._build_device_status_summary(db, db_video)
        self._sync_traffic_ocr_alarm(db, db_video, traffic_fields)
        status_summary = self._build_device_status_summary(db, db_video)

        return {
            "device_id": db_video.id,
            "device_name": db_video.name,
            "cycle_start_time": cycle_start,
            "cycle_end_time": now,
            "last_calculated_at": now,
            "last_traffic_ocr_time": traffic_updated_at,
            **traffic_fields,
            **status_summary,
        }

    def _get_ezviz_config(self) -> tuple[str, str, str]:

        # 鏉╂劘顢戦弮鎯邦嚢閸欐牜骞嗘晶鍐ㄥ綁闁?闁灝鍘ょ€电厧鍙嗛弮鑸垫簚鐎佃壈鍤ч柊宥囩枂閸婇棿璐熺粚?

        base_url = (os.getenv("EZVIZ_BASE_URL") or EZVIZ_BASE_URL or "https://open.ys7.com").rstrip("/")

        app_key = os.getenv("EZVIZ_APP_KEY") or EZVIZ_APP_KEY or ""

        app_secret = os.getenv("EZVIZ_APP_SECRET") or EZVIZ_APP_SECRET or ""

        return base_url, app_key, app_secret



    # -------------------------------------------------------------------------

    # 閺嶇绺?1: 閼惧嘲褰囨潻鐐村复

    # -------------------------------------------------------------------------

    def _get_onvif_service(self, db_video):

        global ONVIF_CLIENT_CACHE

        if not ONVIFCamera: raise ImportError("ONVIF library missing")



        if db_video.id in ONVIF_CLIENT_CACHE:

            try:

                cam = ONVIF_CLIENT_CACHE[db_video.id]

                return cam, cam.create_ptz_service(), cam.create_media_service()

            except Exception:

                if db_video.id in ONVIF_CLIENT_CACHE: del ONVIF_CLIENT_CACHE[db_video.id]



        logger.info(f"Connecting to {db_video.ip_address}...")



        try:

            base_dir = os.path.dirname(os.path.dirname(__file__))

            root_dir = os.path.dirname(base_dir)

            possible_paths = [

                os.path.join(root_dir, 'wsdl'),

                os.path.join(base_dir, 'wsdl'),

                os.path.join(os.getcwd(), 'wsdl')

            ]



            wsdl_path = None

            for p in possible_paths:

                if os.path.exists(p) and os.path.isdir(p):

                    wsdl_path = p

                    logger.info(f"Loaded local WSDL from: {p}")

                    break



            kwargs = {'no_cache': False}

            if wsdl_path:

                kwargs['wsdl_dir'] = wsdl_path



            camera = ONVIFCamera(

                db_video.ip_address, db_video.port or 80,

                db_video.username, db_video.password,

                **kwargs

            )



            ONVIF_CLIENT_CACHE[db_video.id] = camera

            return camera, camera.create_ptz_service(), camera.create_media_service()



        except Exception as e:

            logger.error(f"Connection Failed: {e}")

            raise ValueError(f"鏉╃偞甯存径杈Е: {e}")



    def _extract_onvif_datetime(self, value: Any, default_tz=timezone.utc) -> Optional[datetime]:

        if not value:

            return None



        if isinstance(value, dict):

            date_part = value.get("Date")

            time_part = value.get("Time")

        else:

            date_part = getattr(value, "Date", None)

            time_part = getattr(value, "Time", None)



        if not date_part or not time_part:

            return None



        try:

            year = int(date_part.get("Year") if isinstance(date_part, dict) else getattr(date_part, "Year"))

            month = int(date_part.get("Month") if isinstance(date_part, dict) else getattr(date_part, "Month"))

            day = int(date_part.get("Day") if isinstance(date_part, dict) else getattr(date_part, "Day"))

            hour = int(time_part.get("Hour") if isinstance(time_part, dict) else getattr(time_part, "Hour"))

            minute = int(time_part.get("Minute") if isinstance(time_part, dict) else getattr(time_part, "Minute"))

            second = int(time_part.get("Second") if isinstance(time_part, dict) else getattr(time_part, "Second"))

            return datetime(year, month, day, hour, minute, second, tzinfo=default_tz)

        except Exception:

            return None



    def _sync_camera_time_for_video(self, db_video: VideoDevice, force: bool = False) -> dict:

        if not db_video:

            return {"status": "error", "message": "Device not found"}



        if not db_video.ip_address or not db_video.username or not db_video.password:

            return {"status": "skipped", "message": "鐠佹儳顦紓鍝勭毌 ONVIF 鏉╃偞甯撮崣鍌涙殶"}



        now_ts = time.time()

        last_sync_ts = CAMERA_TIME_SYNC_CACHE.get(db_video.id)

        if (not force) and last_sync_ts and (now_ts - last_sync_ts < CAMERA_TIME_SYNC_COOLDOWN_SECONDS):

            return {

                "status": "skipped",

                "message": "Camera time sync cooldown",

                "next_sync_in_seconds": int(CAMERA_TIME_SYNC_COOLDOWN_SECONDS - (now_ts - last_sync_ts)),

            }



        try:

            camera, _, _ = self._get_onvif_service(db_video)

            devicemgmt = camera.create_devicemgmt_service()

            date_time_info = devicemgmt.GetSystemDateAndTime()

            system_date_time = getattr(date_time_info, "SystemDateAndTime", date_time_info)



            utc_dt = getattr(system_date_time, "UTCDateTime", None)

            local_dt = getattr(system_date_time, "LocalDateTime", None)



            camera_time_utc = self._extract_onvif_datetime(utc_dt, timezone.utc)

            if not camera_time_utc:

                local_time = self._extract_onvif_datetime(local_dt, datetime.now().astimezone().tzinfo or timezone.utc)

                if local_time:

                    camera_time_utc = local_time.astimezone(timezone.utc)



            now_utc = datetime.now(timezone.utc)

            drift_seconds = None

            if camera_time_utc:

                drift_seconds = abs((now_utc - camera_time_utc).total_seconds())



            if (not force) and drift_seconds is not None and drift_seconds < CAMERA_TIME_DRIFT_THRESHOLD_SECONDS:

                CAMERA_TIME_SYNC_CACHE[db_video.id] = now_ts

                return {

                    "status": "skipped",

                    "message": "Camera time drift is within threshold",

                    "drift_seconds": int(drift_seconds),

                }



            req = devicemgmt.create_type("SetSystemDateAndTime")

            req.DateTimeType = "Manual"

            req.DaylightSavings = False

            req.TimeZone = {"TZ": CAMERA_TIMEZONE_TZ}

            req.UTCDateTime = {

                "Time": {

                    "Hour": now_utc.hour,

                    "Minute": now_utc.minute,

                    "Second": now_utc.second,

                },

                "Date": {

                    "Year": now_utc.year,

                    "Month": now_utc.month,

                    "Day": now_utc.day,

                },

            }

            devicemgmt.SetSystemDateAndTime(req)



            CAMERA_TIME_SYNC_CACHE[db_video.id] = now_ts

            logger.info(

                "Camera time synced for video_id=%s drift=%s seconds",

                db_video.id,

                int(drift_seconds) if drift_seconds is not None else "unknown",

            )

            return {

                "status": "success",

                "message": "閹藉嫬鍎氭径瀛樻闂傛潙鍑￠崥灞绢劄",

                "drift_seconds_before_sync": int(drift_seconds) if drift_seconds is not None else None,

            }

        except Exception as e:

            logger.warning(f"Camera time sync skipped for video_id={db_video.id}: {e}")

            return {"status": "error", "message": f"閹藉嫬鍎氭径瀛樼墡閺冭泛銇? {e}"}



    def sync_camera_time_if_needed(self, mongo_db, video_id: int, force: bool = False) -> dict:
        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            return {"status": "error", "message": "Device not found"}

        return self._sync_camera_time_for_video(db_video, force=force)



    # -------------------------------------------------------------------------

    # 鏉堝懎濮? 閻㈢喐鍨?WS-Security Header (濡剝瀚?ODM 鐠併倛鐦?

    # -------------------------------------------------------------------------

    def _generate_wsse_header(self, username, password):

        nonce_raw = os.urandom(16)

        nonce_b64 = base64.b64encode(nonce_raw).decode('utf-8')

        created = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z')



        sha1 = hashlib.sha1()

        sha1.update(nonce_raw)

        sha1.update(created.encode('utf-8'))

        sha1.update(password.encode('utf-8'))

        digest = base64.b64encode(sha1.digest()).decode('utf-8')



        return (
            f'<s:Header>\n'
            f'    <Security s:mustUnderstand="1" xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">\n'
            f'        <UsernameToken>\n'
            f'            <Username>{username}</Username>\n'
            f'            <Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">{digest}</Password>\n'
            f'            <Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">{nonce_b64}</Nonce>\n'
            f'            <Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">{created}</Created>\n'
            f'        </UsernameToken>\n'
            f'    </Security>\n'
            f'</s:Header>'
        )



    # -------------------------------------------------------------------------

    # 閺嶇绺?2: 閸樼喎顫?SOAP 閸嬫粍顒?(ODMFix)

    # -------------------------------------------------------------------------

    def _send_raw_soap_stop(self, camera, ptz_service, profile_token, username, password):

        ptz_url = None

        if hasattr(ptz_service, 'binding') and hasattr(ptz_service.binding, 'options'):

            ptz_url = ptz_service.binding.options.get('address')

        if not ptz_url:

            ptz_url = camera.xaddrs.get('http://www.onvif.org/ver20/ptz/wsdl')



        if not ptz_url:

            logger.error("No PTZ URL found")

            return False



        security_header = self._generate_wsse_header(username, password)



        payloads = [
            (
                f'<?xml version="1.0" encoding="UTF-8"?>\n'
                f'<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">\n'
                f'  {security_header}\n'
                f'  <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n'
                f'    <Stop xmlns="http://www.onvif.org/ver20/ptz/wsdl">\n'
                f'      <ProfileToken>{profile_token}</ProfileToken>\n'
                f'      <PanTilt>true</PanTilt>\n'
                f'      <Zoom>true</Zoom>\n'
                f'    </Stop>\n'
                f'  </s:Body>\n'
                f'</s:Envelope>'
            ),
            (
                f'<?xml version="1.0" encoding="UTF-8"?>\n'
                f'<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">\n'
                f'  {security_header}\n'
                f'  <s:Body>\n'
                f'    <tptz:Stop>\n'
                f'      <tptz:ProfileToken>{profile_token}</tptz:ProfileToken>\n'
                f'      <tptz:PanTilt>true</tptz:PanTilt>\n'
                f'      <tptz:Zoom>true</tptz:Zoom>\n'
                f'    </tptz:Stop>\n'
                f'  </s:Body>\n'
                f'</s:Envelope>'
            ),
            (
                f'<?xml version="1.0" encoding="UTF-8"?>\n'
                f'<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">\n'
                f'  {security_header}\n'
                f'  <s:Body>\n'
                f'    <tptz:Stop>\n'
                f'      <tptz:ProfileToken>{profile_token}</tptz:ProfileToken>\n'
                f'      <tptz:PanTilt>1</tptz:PanTilt>\n'
                f'      <tptz:Zoom>1</tptz:Zoom>\n'
                f'    </tptz:Stop>\n'
                f'  </s:Body>\n'
                f'</s:Envelope>'
            ),
        ]



        headers = {

            'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.onvif.org/ver20/ptz/wsdl/Stop"'

        }



        for i, payload in enumerate(payloads):

            try:

                response = requests.post(ptz_url, data=payload, headers=headers, timeout=2)

                if 200 <= response.status_code < 300:

                    logger.info(f"Raw SOAP Variant {i} (Capture Match) SUCCESS")

                    return True

                else:

                    logger.warning(f"Raw SOAP Variant {i} Failed: {response.status_code}")

            except Exception as e:

                logger.error(f"Raw SOAP Variant {i} Error: {e}")

        return False



    def ptz_stop_move(self, mongo_db, video_id: int):
        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            raise ValueError("Device not found")



        if self._is_ezviz_ptz(db_video):

            return self._ezviz_ptz_stop(db_video)



        try:

            camera, ptz, media = self._get_onvif_service(db_video)

            token = self._get_profile_token(media)



            logger.info(f"STOPPING {db_video.name} using ODM Raw Mode...")



            if self._send_raw_soap_stop(camera, ptz, token, db_video.username, db_video.password):

                return {"status": "success", "message": "Stopped (ODM Mode)"}



            # 閸忔粌绨?

            try:

                space_uri = "http://www.onvif.org/ver10/tptz/PanTiltSpaces/VelocityGenericSpace"

                stop_req = {

                    'ProfileToken': token,

                    'Velocity': {'PanTilt': {'x': 0.0, 'y': 0.0, 'space': space_uri}}

                }

                ptz.ContinuousMove(stop_req)

                ptz.ContinuousMove(stop_req)

                logger.info("Stopped via ZeroVel Fallback")

                return {"status": "success", "message": "Stopped (ZeroVel)"}

            except Exception as e:

                logger.warning(f"ZeroVel Failed: {e}")



            if video_id in ONVIF_CLIENT_CACHE: del ONVIF_CLIENT_CACHE[video_id]

            raise ValueError("閹碘偓閺堝浠犲銏℃煙濞夋洖娼庢径杈Е")



        except Exception as e:

            if video_id in ONVIF_CLIENT_CACHE: del ONVIF_CLIENT_CACHE[video_id]

            logger.error(f"Stop Fatal Error: {e}")

            raise ValueError(f"閸嬫粍顒涙径杈Е: {e}")



    def ptz_start_move(self, mongo_db, video_id: int, direction: str, speed: float = 0.5):
        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            raise ValueError("Device not found")



        if self._is_ezviz_ptz(db_video):

            return self._ezviz_ptz_start(db_video, direction, speed)



        try:

            camera, ptz, media = self._get_onvif_service(db_video)

            token = self._get_profile_token(media)



            pan = speed if direction == 'right' else (-speed if direction == 'left' else 0.0)

            tilt = speed if direction == 'up' else (-speed if direction == 'down' else 0.0)

            zoom = speed if direction == 'zoom_in' else (-speed if direction == 'zoom_out' else 0.0)



            request = {

                'ProfileToken': token,

                'Velocity': {

                    'PanTilt': {'x': pan, 'y': tilt},

                    'Zoom': {'x': zoom}

                },

                'Timeout': 'PT5S'

            }

            ptz.ContinuousMove(request)

            return {"status": "success"}

        except Exception as e:

            if video_id in ONVIF_CLIENT_CACHE: del ONVIF_CLIENT_CACHE[video_id]

            raise ValueError(f"Start failed: {e}")



    def save_current_cruise_config(

        self,

        mongo_db,

        video_id: int,

        preset_tokens: list[str],

        dwell_seconds: float,

        rounds: Optional[int],

    ):

        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            raise ValueError("Device not found")



        if not preset_tokens or len(preset_tokens) < 2:

            raise ValueError("瀹嘎ゅ焻閼峰啿鐨棁鈧憰浣疯⒈娑擃亪顣╃純顔惧仯")



        available_items = self.list_presets(mongo_db, video_id)
        available = {str(item["token"]) for item in available_items if item.get("token")}

        if available:

            missing = [str(token) for token in preset_tokens if str(token) not in available]

            if missing:

                raise ValueError(f"以下预置点不存在: {', '.join(missing)}")



        self._update_video_fields(video_id, {

            "cruise_preset_tokens_json": json.dumps([str(x) for x in preset_tokens], ensure_ascii=False),

            "cruise_dwell_seconds": float(dwell_seconds or 8.0),

            "cruise_rounds": rounds,

        })



        return {

            "status": "success",

            "video_id": video_id,

            "preset_tokens": [str(x) for x in preset_tokens],

            "dwell_seconds": float(dwell_seconds or 8.0),

            "rounds": rounds,

        }



    def get_current_cruise_config(self, mongo_db, video_id: int):
        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            raise ValueError("Device not found")



        raw_json = getattr(db_video, "cruise_preset_tokens_json", None)

        dwell_seconds = float(getattr(db_video, "cruise_dwell_seconds", None) or 8.0)

        rounds = getattr(db_video, "cruise_rounds", None)



        preset_tokens: list[str] = []

        if raw_json:

            try:

                parsed = json.loads(raw_json)

                if isinstance(parsed, list):

                    preset_tokens = [str(x) for x in parsed if str(x).strip()]

            except Exception:

                preset_tokens = []



        return {

            "video_id": video_id,

            "preset_tokens": preset_tokens,

            "dwell_seconds": dwell_seconds,

            "rounds": rounds,

        }



    def start_current_cruise(self, mongo_db, video_id: int):
        config = self.get_current_cruise_config(mongo_db, video_id)
        preset_tokens = config.get("preset_tokens") or []

        dwell_seconds = float(config.get("dwell_seconds") or 8.0)

        rounds = config.get("rounds")



        if len(preset_tokens) < 2:

            raise ValueError("Current cruise config is empty or has too few presets")



        return self.start_cruise(

            db=mongo_db,
            video_id=video_id,

            preset_tokens=preset_tokens,

            dwell_seconds=dwell_seconds,

            rounds=rounds,

        )



    def _get_profile_token(self, media_service):

        profiles = media_service.GetProfiles()

        if not profiles: raise Exception("No profiles")

        return profiles[0].token



    def _get_direction_name(self, direction: str) -> str:

        return {

            'up': 'up',

            'down': 'down',

            'left': 'left',

            'right': 'right',

            'zoom_in': '閺€鎯с亣',

            'zoom_out': 'zoom_out',

        }.get(direction, direction)



    def _extract_ip_from_rtsp(self, rtsp_url: str) -> Optional[str]:

        try:

            parsed = urlparse(rtsp_url)

            return parsed.hostname

        except Exception:

            return None



    def _normalize_stream_protocol(self, protocol: Optional[str]) -> str:

        normalized = (protocol or DEFAULT_STREAM_PROTOCOL or "ezopen").strip().lower()

        return normalized if normalized in STREAM_PROTOCOL_MAP else "ezopen"



    def _resolve_access_source(self, db_video: VideoDevice) -> str:

        explicit_source = (getattr(db_video, "access_source", None) or "").strip().lower()

        if explicit_source in {"cloud", "local"}:

            return explicit_source



        platform = (getattr(db_video, "platform_type", None) or "").strip().lower()

        if platform == "ezviz":

            return "cloud"

        return "local"



    def _resolve_ptz_source(self, db_video: VideoDevice) -> str:

        explicit_source = (getattr(db_video, "ptz_source", None) or "").strip().lower()

        if explicit_source in {"ezviz", "onvif"}:

            return explicit_source



        platform = (getattr(db_video, "platform_type", None) or "").strip().lower()

        if platform == "ezviz":

            return "ezviz"

        return "onvif"



    def _is_ezviz_access(self, db_video: VideoDevice) -> bool:
        platform = (getattr(db_video, "platform_type", None) or "").strip().lower()
        source = (getattr(db_video, "access_source", None) or "").strip().lower()
        resolved_source = self._resolve_access_source(db_video)
        return (
            platform == "ezviz"
            or source == "cloud"
            or resolved_source == "cloud"
        ) and bool(getattr(db_video, "device_serial", None))



    def _is_ezviz_ptz(self, db_video: VideoDevice) -> bool:

        return self._resolve_ptz_source(db_video) == "ezviz" and bool(getattr(db_video, "device_serial", None))



    def _map_error_code(self, raw_code: Any, raw_message: str) -> tuple[str, str]:

        code_str = str(raw_code or "")

        msg = raw_message or "鐠嬪啰鏁ゆ径杈Е"

        msg_lower = msg.lower()



        if code_str in TOKEN_ERROR_CODES or "token" in msg_lower:

            return "TOKEN_EXPIRED", "Platform token expired, please retry later"

        if "offline" in msg_lower or "设备不在线" in msg or "设备离线" in msg:

            return "DEVICE_OFFLINE", "设备离线或不可达"

        if "ptz" in msg_lower and ("not" in msg_lower or "不支持" in msg):

            return "PTZ_NOT_SUPPORTED", "Device does not support cloud PTZ"

        if code_str == "60019" or "加密" in msg:

            return "VIDEO_ENCRYPTED", "Video encryption is enabled for the current protocol"

        return "UPSTREAM_ERROR", msg



    def _ensure_ezviz_credentials(self):

        _, app_key, app_secret = self._get_ezviz_config()

        if not app_key or not app_secret:

            raise ValueError("UPSTREAM_ERROR: 閺堫亪鍘ょ純顔挎偪?AppKey/AppSecret")



    def _request_ezviz_token(self) -> str:

        self._ensure_ezviz_credentials()

        base_url, app_key, app_secret = self._get_ezviz_config()

        url = f"{base_url}/api/lapp/token/get"

        payload = {"appKey": app_key, "appSecret": app_secret}

        resp = requests.post(url, data=payload, timeout=8)

        resp.raise_for_status()

        body = resp.json() if resp.content else {}



        code = str(body.get("code", ""))

        if code != "200":

            semantic_code, semantic_msg = self._map_error_code(code, str(body.get("msg", "get token failed")))

            raise ValueError(f"{semantic_code}: {semantic_msg}")



        data = body.get("data") or {}

        token = data.get("accessToken")

        expire_time = int(data.get("expireTime") or 0)

        if not token:

            raise ValueError("UPSTREAM_ERROR: get token failed")



        if expire_time <= 0:

            expire_at = time.time() + 6 * 24 * 3600

        elif expire_time > 10_000_000_000:

            expire_at = expire_time / 1000.0

        else:

            expire_at = float(expire_time)



        EZVIZ_TOKEN_CACHE["access_token"] = token

        EZVIZ_TOKEN_CACHE["expire_at"] = expire_at

        return token



    def _get_ezviz_token(self, force_refresh: bool = False) -> str:

        with EZVIZ_TOKEN_LOCK:

            token = EZVIZ_TOKEN_CACHE.get("access_token")

            expire_at = float(EZVIZ_TOKEN_CACHE.get("expire_at") or 0.0)

            now = time.time()

            if (not force_refresh) and token and expire_at - now > 120:

                return str(token)

            return self._request_ezviz_token()



    def get_ezviz_health(self) -> dict:

        _, app_key, app_secret = self._get_ezviz_config()

        try:

            token = self._get_ezviz_token(force_refresh=False)

            expire_at = float(EZVIZ_TOKEN_CACHE.get("expire_at") or 0.0)

            return {

                "status": "ok",

                "configured": bool(app_key and app_secret),

                "token_ready": bool(token),

                "token_expire_at": int(expire_at),

            }

        except Exception as e:

            return {

                "status": "error",

                "configured": bool(app_key and app_secret),

                "token_ready": False,

                "message": str(e),

            }



    def _call_ezviz_api(self, path: str, payload: dict, retry_on_token_error: bool = True) -> dict:

        token = self._get_ezviz_token(force_refresh=False)

        base_url, _, _ = self._get_ezviz_config()

        url = f"{base_url}{path}"

        request_payload = dict(payload)

        request_payload["accessToken"] = token



        resp = requests.post(url, data=request_payload, timeout=8)

        resp.raise_for_status()

        body = resp.json() if resp.content else {}

        code = str(body.get("code", ""))

        if code == "200":

            return body



        if retry_on_token_error and code in TOKEN_ERROR_CODES:

            token = self._get_ezviz_token(force_refresh=True)

            retry_payload = dict(payload)

            retry_payload["accessToken"] = token

            retry_resp = requests.post(url, data=retry_payload, timeout=8)

            retry_resp.raise_for_status()

            retry_body = retry_resp.json() if retry_resp.content else {}

            retry_code = str(retry_body.get("code", ""))

            if retry_code == "200":

                return retry_body

            semantic_code, semantic_msg = self._map_error_code(retry_code, str(retry_body.get("msg", "鐠嬪啰鏁ゆ径杈Е")))

            raise ValueError(f"{semantic_code}: {semantic_msg}")



        semantic_code, semantic_msg = self._map_error_code(code, str(body.get("msg", "鐠嬪啰鏁ゆ径杈Е")))

        raise ValueError(f"{semantic_code}: {semantic_msg}")



    def _get_stream_info_local(self, db_video: VideoDevice) -> dict:

        # 閹峰绁﹂崜宥嗗⒔鐞涘本瀵滈棁鈧弽鈩冩閿涙俺绉存潻鍥閸婂吋澧犻弨?娑撴梹婀侀崘宄板祱閺冨爼妫块柆鍨帳妫版垹绠掗崘娆掝啎婢?

        sync_result = self._sync_camera_time_for_video(db_video, force=False)

        if sync_result.get("status") == "error":

            logger.warning(f"Auto time sync failed for video_id={db_video.id}: {sync_result.get('message')}")



        # 閹虫帒鎯庨崝銊﹀腹濞翠緤绱拌ぐ鎾冲缁旑垵顕Ч鍌涙尡閺€鎯ф勾閸р偓閺?婵″倹甯瑰ù浣界箻缁嬪绗夌€涙ê婀崚娆掑殰閸斻劍濯虹挧?

        stream_name = str(db_video.id)

        entry = FFMPEG_PROCESSES.get(stream_name)

        is_running = False

        if entry is not None:

            try:

                is_running = entry.poll() is None

            except Exception:

                is_running = False



        if not is_running:

            rtsp_url = self._get_rtsp_url_for_device(db_video)

            if rtsp_url:

                self.start_ffmpeg_stream(rtsp_url, stream_name)



        # 閹峰绁﹂梼鑸殿唽妞ゅ搫鐢崑姘濞嗏€崇秿閸嶅繗鍤滈幇?绾喕绻氶垾婊嗩啎婢跺洤婀痪鎸庢閹镐胶鐢婚拃鐣屾磸閳?

        record_entry = RECORDING_PROCESSES.get(db_video.id)

        record_running = False

        if isinstance(record_entry, dict):

            record_proc = record_entry.get("process")

            if record_proc is not None:

                try:

                    record_running = record_proc.poll() is None

                except Exception:

                    record_running = False

        elif record_entry is not None:

            try:

                record_running = record_entry.poll() is None

            except Exception:

                record_running = False



        if not record_running:

            rtsp_url = self._get_rtsp_url_for_device(db_video)

            if rtsp_url:

                self.start_ffmpeg_recording(db_video.id, rtsp_url)



        url = db_video.stream_url or ""

        play_type = "flv"

        lowered = str(url).lower()

        if lowered.startswith("rtsp://"):

            play_type = "rtsp"

        elif lowered.endswith(".m3u8"):

            play_type = "hls"

        elif lowered.startswith("http") and ".flv" in lowered:

            play_type = "flv"



        return {

            "url": url,

            "play_type": play_type,

            "platform": "onvif",

            "device_serial": None,

            "channel_no": None,

            "access_token": None,

        }



    def _get_stream_info_ezviz(self, db_video: VideoDevice, protocol: Optional[str] = None) -> dict:

        protocol_name = self._normalize_stream_protocol(protocol or getattr(db_video, "stream_protocol", None))

        channel_no = int(getattr(db_video, "channel_no", None) or 1)

        device_serial = str(getattr(db_video, "device_serial", "") or "").strip()

        if not device_serial:

            raise ValueError("UPSTREAM_ERROR: 娴滄垼顔曟径鍥╁繁?device_serial")



        # ?瀵搫鍩楁担璺ㄦ暏 HLS 閼板奔绗?ezopen

        # if protocol_name == "ezopen":

        #     preferred_code = 2  # HLS

        # else:

        preferred_code = STREAM_PROTOCOL_MAP[protocol_name]

        strict_protocol = protocol is not None
        protocol_candidates = [preferred_code] if strict_protocol else [preferred_code] + [c for c in [1, 2, 3, 4] if c != preferred_code]

        # protocol_candidates = [preferred_code] + [c for c in [2, 4, 3, 1] if c != preferred_code]



        url = ""

        last_error: Optional[Exception] = None

        for protocol_code in protocol_candidates:

            payload = {

                "deviceSerial": device_serial,

                "channelNo": channel_no,

                "protocol": protocol_code,

                "expireTime": 3600,

            }



            body = None

            paths = ["/api/lapp/live/address/get", "/api/lapp/v2/live/address/get"]

            for path in paths:

                try:

                    body = self._call_ezviz_api(path, payload)

                    break

                except Exception as e:

                    last_error = e



            if body is None:

                continue



            data = body.get("data") or {}

            url = (

                    data.get("url")

                    or data.get("liveAddress")

                    or data.get("hls")

                    or data.get("rtmp")

                    or data.get("ezopen")

                    or ""

            )

            if url:

                break



        if not url:

            raise last_error or ValueError("UPSTREAM_ERROR: 楠炲啿褰撮張顏囩箲閸ョ偛褰查悽銊︽尡閺€鎯ф勾閸р偓")



        lower_url = str(url).lower()

        resolved_play_type = protocol_name

        if lower_url.startswith("ezopen://"):

            resolved_play_type = "ezopen"

        elif ".m3u8" in lower_url:

            resolved_play_type = "hls"

        elif lower_url.startswith("rtmp"):

            resolved_play_type = "rtmp"

        elif ".flv" in lower_url:

            resolved_play_type = "flv"

        if strict_protocol and resolved_play_type != protocol_name:

            raise ValueError(f"UPSTREAM_ERROR: requested {protocol_name} stream but EZVIZ returned {resolved_play_type}: {str(url)[:120]}")

        logger.info(
            "EZVIZ stream resolved video_id=%s requested_protocol=%s resolved_play_type=%s url_prefix=%s",
            getattr(db_video, "id", ""),
            protocol_name,
            resolved_play_type,
            str(url)[:96],
        )



        # ?閸忔娊鏁敍姘虫祮?ezopen ?HLS 閸︽澘娼?

        # if url and url.startswith("ezopen://"):

        #     url = f"https://open.ys7.com/v3/openlive/{device_serial}_1.m3u8"

        #     resolved_play_type = "hls"

        #     logger.info(f"Converted ezopen to HLS for device {device_serial}: {url}")



        # 娴滄垶绁﹂崷鐑樻珯娑旂喕顩﹂幐浣虹敾閽€鑺ユ拱閸︽澘鍨庡▓?娓氭稐澶嶉弮鍓佺处?鐢憡鈧礁娲栭弨鍙ュ▏閻?

        record_entry = RECORDING_PROCESSES.get(db_video.id)

        record_running = False

        if isinstance(record_entry, dict):

            record_proc = record_entry.get("process")

            if record_proc is not None:

                try:

                    record_running = record_proc.poll() is None

                except Exception:

                    record_running = False

        elif record_entry is not None:

            try:

                record_running = record_entry.poll() is None

            except Exception:

                record_running = False



        if not record_running:

            record_source = self._get_record_source_for_device(db_video)

            if record_source:

                self.start_ffmpeg_recording(db_video.id, record_source)



        return {

            "url": url,

            "play_type": resolved_play_type,

            "platform": "ezviz",

            "device_serial": device_serial,

            "channel_no": channel_no,

            "access_token": self._get_ezviz_token(force_refresh=False),

        }



    # def _get_stream_info_ezviz(self, db_video: VideoDevice) -> dict:

    #     protocol_name = self._normalize_stream_protocol(getattr(db_video, "stream_protocol", None))

    #     channel_no = int(getattr(db_video, "channel_no", None) or 1)

    #     device_serial = str(getattr(db_video, "device_serial", "") or "").strip()

    #     if not device_serial:

    #         raise ValueError("UPSTREAM_ERROR: 娴滄垼顔曟径鍥╁繁?device_serial")

    #

    #     if protocol_name == "ezopen":

    #         preferred_code = 2  # 瀵搫鍩楁担璺ㄦ暏 HLS 閼板奔绗?ezopen

    #     else:

    #         preferred_code = STREAM_PROTOCOL_MAP[protocol_name]

    #

    #     protocol_candidates = [preferred_code] + [c for c in [2, 4, 3, 1] if c != preferred_code]

    #

    #     # preferred_code = STREAM_PROTOCOL_MAP[protocol_name]

    #     # protocol_candidates = [preferred_code] + [c for c in [1, 2, 3, 4] if c != preferred_code]

    #

    #     url = ""

    #     last_error: Optional[Exception] = None

    #     for protocol_code in protocol_candidates:

    #         payload = {

    #             "deviceSerial": device_serial,

    #             "channelNo": channel_no,

    #             "protocol": protocol_code,

    #             "expireTime": 3600,

    #         }

    #

    #         body = None

    #         paths = ["/api/lapp/live/address/get", "/api/lapp/v2/live/address/get"]

    #         for path in paths:

    #             try:

    #                 body = self._call_ezviz_api(path, payload)

    #                 break

    #             except Exception as e:

    #                 last_error = e

    #

    #         if body is None:

    #             continue

    #

    #         data = body.get("data") or {}

    #         url = (

    #             data.get("url")

    #             or data.get("liveAddress")

    #             or data.get("hls")

    #             or data.get("rtmp")

    #             or data.get("ezopen")

    #             or ""

    #         )

    #         if url:

    #             break

    #

    #     if not url:

    #         raise last_error or ValueError("UPSTREAM_ERROR: 楠炲啿褰撮張顏囩箲閸ョ偛褰查悽銊︽尡閺€鎯ф勾閸р偓")

    #

    #     lower_url = str(url).lower()

    #     resolved_play_type = protocol_name

    #     if lower_url.startswith("ezopen://"):

    #         resolved_play_type = "ezopen"

    #     elif ".m3u8" in lower_url:

    #         resolved_play_type = "hls"

    #     elif lower_url.startswith("rtmp"):

    #         resolved_play_type = "rtmp"

    #     elif ".flv" in lower_url:

    #         resolved_play_type = "flv"

    #

    #     # 娴滄垶绁﹂崷鐑樻珯娑旂喕顩﹂幐浣虹敾閽€鑺ユ拱閸︽澘鍨庡▓?娓氭稐澶嶉弮鍓佺处?鐢憡鈧礁娲栭弨鍙ュ▏閻?

    #     record_entry = RECORDING_PROCESSES.get(db_video.id)

    #     record_running = False

    #     if isinstance(record_entry, dict):

    #         record_proc = record_entry.get("process")

    #         if record_proc is not None:

    #             try:

    #                 record_running = record_proc.poll() is None

    #             except Exception:

    #                 record_running = False

    #     elif record_entry is not None:

    #         try:

    #             record_running = record_entry.poll() is None

    #         except Exception:

    #             record_running = False

    #

    #     if not record_running:

    #         record_source = self._get_record_source_for_device(db_video)

    #         if record_source:

    #             self.start_ffmpeg_recording(db_video.id, record_source)

    #

    #     return {

    #         "url": url,

    #         "play_type": resolved_play_type,

    #         "platform": "ezviz",

    #         "device_serial": device_serial,

    #         "channel_no": channel_no,

    #         "access_token": self._get_ezviz_token(force_refresh=False),

    #     }



    def _ezviz_ptz_start(self, db_video: VideoDevice, direction: str, speed: float = 0.5):

        direction_code = EZVIZ_DIRECTION_MAP.get(direction)

        if direction_code is None:

            raise ValueError("PTZ_NOT_SUPPORTED: unsupported PTZ direction")



        payload = {

            "deviceSerial": db_video.device_serial,

            "channelNo": int(getattr(db_video, "channel_no", None) or 1),

            "direction": direction_code,

            "speed": max(1, min(8, int(round(float(speed) * 8)))),

        }

        try:

            self._call_ezviz_api("/api/lapp/device/ptz/start", payload)

        except Exception as first_error:

            # 閽€銈囩叾娴滄垵浼撻崣鎴犵秹缂佹粍濮堥崝銊ょ窗鐎佃壈鍤?start 鐡掑懏妞?閻厽娈忛柌宥堢槸娑撯偓濞嗏€冲讲閹绘劕宕岀粙鍐茬暰閹?

            logger.warning(f"EZVIZ PTZ start retry for video_id={db_video.id}: {first_error}")

            time.sleep(0.15)

            self._call_ezviz_api("/api/lapp/device/ptz/start", payload)

        EZVIZ_PTZ_LAST_DIRECTION[db_video.id] = direction_code

        return {"status": "success"}



    def _ezviz_ptz_stop(self, db_video: VideoDevice):

        now = time.time()

        last_stop_at = EZVIZ_PTZ_LAST_STOP_AT.get(db_video.id, 0.0)

        if now - last_stop_at < 0.2:

            return {"status": "skipped", "message": "duplicate stop suppressed"}

        EZVIZ_PTZ_LAST_STOP_AT[db_video.id] = now



        channel_no = int(getattr(db_video, "channel_no", None) or 1)

        base_payload = {

            "deviceSerial": db_video.device_serial,

            "channelNo": channel_no,

        }



        # 閸忓牆鐨剧拠鏇氱瑝?direction(閽€銈囩叾闁劌鍨庨張?stop 鐟曚焦鐪?serial+channel?

        try:

            self._call_ezviz_api("/api/lapp/device/ptz/stop", dict(base_payload))

            return {"status": "success"}

        except Exception as first_error:

            last_direction = EZVIZ_PTZ_LAST_DIRECTION.get(db_video.id)

            if last_direction is not None:

                payload_with_dir = dict(base_payload)

                payload_with_dir["direction"] = last_direction

                try:

                    self._call_ezviz_api("/api/lapp/device/ptz/stop", payload_with_dir)

                    return {"status": "success"}

                except Exception as second_error:

                    logger.warning(

                        f"EZVIZ PTZ stop failed video_id={db_video.id}, first={first_error}, second={second_error}"

                    )

                    raise ValueError(f"PTZ_STOP_FAILED: {second_error}")



            logger.warning(f"EZVIZ PTZ stop failed video_id={db_video.id}: {first_error}")

            raise ValueError(f"PTZ_STOP_FAILED: {first_error}")



    def get_stream_info(self, mongo_db, video_id: int, protocol: Optional[str] = None):
        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            return None



        if self._is_ezviz_access(db_video):

            return self._get_stream_info_ezviz(db_video, protocol=protocol)

        return self._get_stream_info_local(db_video)



    def _create_ptz_and_media(self, mongo_db, video_id: int):

        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            raise ValueError("Device not found")

        camera, ptz, media = self._get_onvif_service(db_video)

        token = self._get_profile_token(media)

        return db_video, camera, ptz, media, token



    def list_presets(self, mongo_db, video_id: int):
        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            raise ValueError("Device not found")



        if self._is_ezviz_ptz(db_video):

            try:

                payload = {

                    "deviceSerial": db_video.device_serial,

                    "channelNo": int(getattr(db_video, "channel_no", None) or 1),

                }

                body = None

                last_error = None

                for path in ["/api/lapp/device/preset/list", "/api/lapp/v2/device/preset/list"]:

                    try:

                        body = self._call_ezviz_api(path, payload)

                        break

                    except Exception as e:

                        last_error = e

                        body = None



                if body is None:

                    cached = EZVIZ_PRESET_CACHE.get(video_id, [])

                    if cached:

                        logger.warning(

                            f"EZVIZ list presets fallback to cache for video_id={video_id}: {last_error}"

                        )

                        return cached



                    if video_id in EZVIZ_PRESET_UNSUPPORTED_DEVICES:

                        return []



                    if "404" in str(last_error or ""):

                        EZVIZ_PRESET_UNSUPPORTED_DEVICES.add(video_id)

                        logger.info(f"EZVIZ presets unsupported for video_id={video_id}, skip preset polling")

                    else:

                        logger.warning(f"EZVIZ list presets failed for video_id={video_id}: {last_error}")

                    return []



                data = body.get("data") or []

                result = []

                for item in data:

                    token = str(item.get("index") or item.get("presetIndex") or item.get("token") or "")

                    if not token:

                        continue

                    result.append({

                        "token": token,

                        "name": str(item.get("name") or item.get("presetName") or f"Preset-{token}"),

                    })



                if result:

                    EZVIZ_PRESET_CACHE[video_id] = result

                return result

            except Exception as e:

                cached = EZVIZ_PRESET_CACHE.get(video_id, [])

                if cached:

                    logger.warning(f"EZVIZ list presets exception fallback cache video_id={video_id}: {e}")

                    return cached

                if "404" in str(e):

                    EZVIZ_PRESET_UNSUPPORTED_DEVICES.add(video_id)

                    logger.info(f"EZVIZ presets unsupported for video_id={video_id}, skip preset polling")

                else:

                    logger.warning(f"EZVIZ list presets failed for video_id={video_id}: {e}")

                return []



        try:

            _, _, ptz, _, token = self._create_ptz_and_media(mongo_db, video_id)
            presets = ptz.GetPresets({'ProfileToken': token})

        except Exception as e:

            # 某些摄像头不支持预置点，或当前连接暂时不可用；此处降级为空列表，避免前端持续出现 400

            logger.warning(f"GetPresets failed for video_id={video_id}: {e}")

            return []



        result = []

        for p in presets or []:

            result.append({

                "token": str(getattr(p, 'token', '') or ''),

                "name": str(getattr(p, 'Name', None) or getattr(p, 'name', None) or f"Preset-{getattr(p, 'token', '')}")

            })

        return result



    def set_preset(self, mongo_db, video_id: int, name: Optional[str] = None, preset_token: Optional[str] = None):
        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            raise ValueError("Device not found")



        # 閽€銈囩叾娴滄垼顔曟径鍥ь槱?

        if self._is_ezviz_ptz(db_video):

            payload = {

                "deviceSerial": db_video.device_serial,

                "channelNo": int(getattr(db_video, "channel_no", None) or 1),

            }

            if name:

                payload["name"] = name



            print("=" * 50)

            print("调用萤石云添加预置点")

            print(f"Payload: {payload}")

            # 修改：创建新预置点时不传 index(preset_token)

            # if preset_token:

            #     payload["index"] = preset_token

            body = self._call_ezviz_api("/api/lapp/device/preset/add", payload)



            print(f"萤石云响应: {body}")

            print(f"响应 code: {body.get('code')}")

            print(f"响应 msg: {body.get('msg')}")

            print(f"响应 data: {body.get('data')}")

            print("=" * 50)

            data = body.get("data") or {}

            token = str(data.get("index") or data.get("presetIndex") or "")

            created = {

                "token": token,

                "name": name or f"Preset-{token}",

            }

            if token:

                existing = EZVIZ_PRESET_CACHE.get(video_id, [])

                exists = any(str(item.get("token")) == token for item in existing)

                EZVIZ_PRESET_CACHE[video_id] = (

                    [created, *existing] if not exists else [created if str(item.get("token")) == token else item for item in existing]

                )

            if video_id in EZVIZ_PRESET_UNSUPPORTED_DEVICES:

                EZVIZ_PRESET_UNSUPPORTED_DEVICES.discard(video_id)

            return created



        # ONVIF 鐠佹儳顦径鍕倞

        _, _, ptz, _, token = self._create_ptz_and_media(mongo_db, video_id)


        # ?娣囶喗鏁奸敍姘灡瀵ゆ椽顣╃純顔惧仯閺冭泛褰?ProfileToken ?PresetName

        # 缂佹繂顕稉宥堫洣?PresetToken?

        req = {'ProfileToken': token}

        if name:

            req['PresetName'] = name



        # 删除下面这几行，创建新预置点不需要 PresetToken

        # if preset_token:

        #     req['PresetToken'] = preset_token



        try:

            # SetPreset 返回摄像头生成的 PresetToken

            created_token = ptz.SetPreset(req)



            # ?娣囶喗鏁奸敍姘扁€樻穱婵婄箲閸ョ偞婀侀弫鍫㈡畱 token

            if not created_token:

                raise ValueError("摄像头未返回预置点 token")



            return {

                "token": str(created_token),  # 只使用摄像头返回的 token

                "name": name or f"Preset-{created_token}"

            }

        except Exception as e:

            raise ValueError(f"创建预置点失败: {e}")

    # def set_preset(self, mongo_db, video_id: int, name: Optional[str] = None, preset_token: Optional[str] = None):
    #     db_video = db.query(VideoDevice).filter(VideoDevice.id == video_id).first()

    #     if not db_video:

    #         raise ValueError("Device not found")

    #

    #     if self._is_ezviz_ptz(db_video):

    #         payload = {

    #             "deviceSerial": db_video.device_serial,

    #             "channelNo": int(getattr(db_video, "channel_no", None) or 1),

    #         }

    #         if name:

    #             payload["name"] = name

    #         if preset_token:

    #             payload["index"] = preset_token

    #         body = self._call_ezviz_api("/api/lapp/device/preset/add", payload)

    #         data = body.get("data") or {}

    #         token = str(data.get("index") or data.get("presetIndex") or preset_token or "")

    #         return {

    #             "token": token,

    #             "name": name or f"Preset-{token}",

    #         }

    #

    #     _, _, ptz, _, token = self._create_ptz_and_media(db, video_id)

    #     req = {'ProfileToken': token}

    #     if name:

    #         req['PresetName'] = name

    #     if preset_token:

    #         req['PresetToken'] = preset_token

    #

    #     try:

    #         created_token = ptz.SetPreset(req)

    #         return {

    #             "token": str(created_token or preset_token or ''),

    #             "name": name or f"Preset-{created_token}"

    #         }

    #     except Exception as e:

    #         raise ValueError(f"閸掓稑缂撴０鍕枂閻愮懓銇? {e}")



    def goto_preset(self, mongo_db, video_id: int, preset_token: str, speed: float = 0.5):
        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            raise ValueError("Device not found")



        if self._is_ezviz_ptz(db_video):

            payload = {

                "deviceSerial": db_video.device_serial,

                "channelNo": int(getattr(db_video, "channel_no", None) or 1),

                "index": preset_token,

            }

            self._call_ezviz_api("/api/lapp/device/preset/move", payload)

            return {"status": "success"}



        _, _, ptz, _, token = self._create_ptz_and_media(mongo_db, video_id)
        req = {

            "ProfileToken": token,

            "PresetToken": preset_token,

            "Speed": {

                "PanTilt": {"x": speed, "y": speed},

                "Zoom": {"x": speed}

            }

        }

        try:

            ptz.GotoPreset(req)

            return {"status": "success"}

        except Exception as e:

            raise ValueError(f"调用预置点失败: {e}")



    def remove_preset(self, mongo_db, video_id: int, preset_token: str):
        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            raise ValueError("Device not found")



        if self._is_ezviz_ptz(db_video):

            payload = {

                "deviceSerial": db_video.device_serial,

                "channelNo": int(getattr(db_video, "channel_no", None) or 1),

                "index": preset_token,

            }

            self._call_ezviz_api("/api/lapp/device/preset/clear", payload)

            existing = EZVIZ_PRESET_CACHE.get(video_id, [])

            EZVIZ_PRESET_CACHE[video_id] = [item for item in existing if str(item.get("token")) != str(preset_token)]

            return {"status": "success"}



        _, _, ptz, _, token = self._create_ptz_and_media(mongo_db, video_id)
        req = {'ProfileToken': token, 'PresetToken': preset_token}

        try:

            ptz.RemovePreset(req)

            return {"status": "success"}

        except Exception as e:

            raise ValueError(f"删除预置点失败: {e}")



    def remove_presets_bulk(self, mongo_db, video_id: int, preset_tokens: list[str]):
        if not preset_tokens:

            raise ValueError("preset_tokens 不能为空")



        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            raise ValueError("Device not found")



        if self._is_ezviz_ptz(db_video):

            unique_tokens: list[str] = list(dict.fromkeys([str(t) for t in preset_tokens if str(t).strip()]))

            deleted_tokens: list[str] = []

            failed_tokens: list[str] = []

            for preset_token in unique_tokens:

                try:

                    self.remove_preset(mongo_db, video_id, preset_token)
                    deleted_tokens.append(preset_token)

                except Exception as e:

                    logger.warning(f"Bulk remove preset failed video_id={video_id}, token={preset_token}: {e}")

                    failed_tokens.append(preset_token)

            return {

                "total": len(unique_tokens),

                "deleted": len(deleted_tokens),

                "failed": len(failed_tokens),

                "deleted_tokens": deleted_tokens,

                "failed_tokens": failed_tokens,

            }



        _, _, ptz, _, token = self._create_ptz_and_media(mongo_db, video_id)
        unique_tokens: list[str] = list(dict.fromkeys([str(t) for t in preset_tokens if str(t).strip()]))

        if not unique_tokens:

            raise ValueError("濞屸剝婀侀張澶嬫櫏閻ㄥ嫰顣╃純顔惧仯 token")



        deleted_tokens: list[str] = []

        failed_tokens: list[str] = []



        for preset_token in unique_tokens:

            req = {'ProfileToken': token, 'PresetToken': preset_token}

            try:

                ptz.RemovePreset(req)

                deleted_tokens.append(preset_token)

            except Exception as e:

                logger.warning(f"Bulk remove preset failed video_id={video_id}, token={preset_token}: {e}")

                failed_tokens.append(preset_token)



        return {

            "total": len(unique_tokens),

            "deleted": len(deleted_tokens),

            "failed": len(failed_tokens),

            "deleted_tokens": deleted_tokens,

            "failed_tokens": failed_tokens,

        }



    def _cruise_worker(

        self,

        mongo_db,
        video_id: int,

        preset_tokens: list[str],

        dwell_seconds: float,

        rounds: Optional[int],

        stop_event: threading.Event,

    ):

        completed_rounds = 0
        current_index = 0



        try:

            while not stop_event.is_set():

                for idx, preset in enumerate(preset_tokens):

                    if stop_event.is_set():

                        return



                    with CRUISE_TASKS_LOCK:

                        task = CRUISE_TASKS.get(video_id)

                        if task:

                            task["current_index"] = idx

                            task["current_round"] = completed_rounds + 1



                    try:

                        self.goto_preset(mongo_db, video_id, preset)
                    except Exception as e:

                        logger.warning(f"瀹嘎ゅ焻鐠哄疇娴嗘径杈Е video_id={video_id}, preset={preset}: {e}")



                    current_index = idx

                    if stop_event.wait(timeout=dwell_seconds):

                        return



                completed_rounds += 1

                if rounds is not None and completed_rounds >= rounds:

                    return

        finally:

            pass
            with CRUISE_TASKS_LOCK:

                task = CRUISE_TASKS.get(video_id)

                if task and task.get("stop") is stop_event:

                    CRUISE_TASKS.pop(video_id, None)



    def start_cruise(

        self,

        mongo_db,

        video_id: int,

        preset_tokens: list[str],

        dwell_seconds: float = 8.0,

        rounds: Optional[int] = None,

    ):

        if len(preset_tokens) < 2:

            raise ValueError("瀹嘎ゅ焻閼峰啿鐨棁鈧憰浣疯⒈娑擃亪顣╃純顔惧仯")



        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            raise ValueError("Device not found")



        available_items = self.list_presets(mongo_db, video_id)
        available = {str(item["token"]) for item in available_items if item.get("token")}

        if available:

            missing = [str(token) for token in preset_tokens if str(token) not in available]

            if missing:

                raise ValueError(f"以下预置点不存在: {', '.join(missing)}")

        elif not self._is_ezviz_ptz(db_video):

            raise ValueError("No available presets found; create presets first")

        else:

            logger.warning(

                "EZVIZ preset list unavailable for video_id=%s, skip strict cruise validation",

                video_id,

            )



        self.stop_cruise(video_id)



        stop_event = threading.Event()

        thread = threading.Thread(

            target=self._cruise_worker,

            args=(mongo_db, video_id, [str(x) for x in preset_tokens], float(dwell_seconds or 8.0), rounds, stop_event),
            daemon=True,

        )



        with CRUISE_TASKS_LOCK:

            CRUISE_TASKS[video_id] = {

                "thread": thread,

                "stop": stop_event,

                "presets": [str(x) for x in preset_tokens],

                "dwell_seconds": float(dwell_seconds or 8.0),

                "rounds": rounds,

                "current_index": 0,

                "current_round": 0,

            }



        thread.start()

        return {

            "status": "success",

            "video_id": video_id,

            "running": True,

        }



    def stop_cruise(self, video_id: int):

        with CRUISE_TASKS_LOCK:

            task = CRUISE_TASKS.get(video_id)

            if not task:

                return {

                    "status": "idle",

                    "video_id": video_id,

                    "running": False,

                }



            stop_event = task.get("stop")

            if stop_event:

                stop_event.set()



            CRUISE_TASKS.pop(video_id, None)



        return {

            "status": "success",

            "video_id": video_id,

            "running": False,

        }



    def get_cruise_status(self, video_id: int):

        with CRUISE_TASKS_LOCK:

            task = CRUISE_TASKS.get(video_id)

            if not task:

                return {

                    "video_id": video_id,

                    "running": False,

                    "preset_tokens": [],

                    "dwell_seconds": None,

                    "rounds": None,

                    "current_index": None,

                    "current_round": None,

                }



            thread = task.get("thread")

            running = bool(thread and thread.is_alive())



            return {

                "video_id": video_id,

                "running": running,

                "preset_tokens": task.get("presets", []),

                "dwell_seconds": task.get("dwell_seconds", 8.0),

                "rounds": task.get("rounds"),

                "current_index": task.get("current_index"),

                "current_round": task.get("current_round"),

            }



    # -------------------------------------------------------------------------

    # 核心业务: 添加/删除/更新

    # -------------------------------------------------------------------------

    def add_camera_to_media_server(
        self,
        mongo_db,
        camera_data: CameraCreateRequest,
        scope_fields: dict | None = None,
    ):
        logger.info(f"Adding stream: {camera_data.name}")



        collection = self._video_collection()

        ip_address = camera_data.ip_address or self._extract_ip_from_rtsp(camera_data.rtsp_url) or ""

        port = camera_data.port or 80



        next_id = str(get_next_sequence("video_device_id"))



        payload = {

            "id": next_id,

            "name": camera_data.name,

            "ip_address": ip_address,

            "port": port,

            "username": camera_data.username,

            "password": camera_data.password,

            "stream_url": "",

            "rtsp_url": camera_data.rtsp_url,

            "stream_protocol": self._normalize_stream_protocol(camera_data.stream_protocol),

            "device_type": camera_data.device_type or "bullet",

            "platform_type": (camera_data.platform_type or "onvif"),

            "access_source": (camera_data.access_source or "local"),

            "ptz_source": (camera_data.ptz_source or "onvif"),

            "device_serial": camera_data.device_serial,
            "sim_card_id": camera_data.sim_card_id,

            "channel_no": camera_data.channel_no or 1,

            "supports_ptz": 1,

            "supports_preset": 1,

            "supports_cruise": 1,

            "supports_zoom": 1,

            "supports_focus": 0,

            "latitude": camera_data.latitude,

            "longitude": camera_data.longitude,
            "company": camera_data.company,
            "branch_id": camera_data.branch_id,
            "project": camera_data.project,
            "project_id": camera_data.project_id,
            "grid": camera_data.grid,
            "grid_id": camera_data.grid_id,
            "team": camera_data.team,
            "team_id": camera_data.team_id,

            "status": "online",

            "remark": camera_data.remark,

            "is_active": 1,

            "createdAt": datetime.utcnow(),

            "updatedAt": datetime.utcnow(),

            "sleeping": False,

            "privacy_enabled": False,

            "storage_abnormal": False,

            "low_battery": False,

            "weak_signal": False,

            "weekly_quota_bytes": DEFAULT_WEEKLY_QUOTA_BYTES,

        }

        for key, value in (scope_fields or {}).items():
            if payload.get(key) in [None, "", [], {}] and value not in [None, "", [], {}]:
                payload[key] = value



        collection.insert_one(payload)



        new_video = self._get_video_runtime_by_id(next_id)

        if not new_video:

            raise ValueError("Device was written to MongoDB but could not be read back")



        # 閺傛澘顤冪拋鎯ь槵閸氬骸鍘涚亸婵婄槸閸氬本顒為幗鍕剼婢跺瓨妞傞梻?闁灝鍘?OSD 閺冨爼妫块幐浣虹敾濠曞倻些

        sync_result = self._sync_camera_time_for_video(new_video, force=True)

        if sync_result.get("status") == "error":

            logger.warning(

                f"Initial camera time sync failed for video_id={new_video.id}: {sync_result.get('message')}"

            )



        stream_name = str(new_video.id)



        # 閸氼垰濮╅幒銊︾ウ楠炶埖娲块弬鐗堟尡閺€鎯ф勾閸р偓

        self.start_ffmpeg_stream(camera_data.rtsp_url, stream_name)

        flv_url = f"{NMS_HOST}/live/{stream_name}.flv"



        self._update_video_fields(next_id, {"stream_url": flv_url})



        updated_video = self._get_video_doc_by_id(next_id)

        self.start_ffmpeg_recording(new_video.id, camera_data.rtsp_url)



        return self._mongo_video_to_out(updated_video)



    def sync_hikvision_devices(self, mongo_db):

        # 瑜版挸澧犳い鍦窗?RTSP/ONVIF 閹靛濮╅幒銉ュ弳娑撹桨瀵?娣囨繄鏆€閸氬本顒為幒銉ュ經闁灝鍘ょ捄顖滄暠鐠嬪啰鏁ら弮鑸靛Г闁?

        logger.info("sync_hikvision_devices called - manual RTSP/ONVIF flow is used")

        return []



    def create_video(self, mongo_db, video_data: VideoCreate, scope_fields: dict | None = None):
        collection = self._video_collection()



        payload = self._prepare_video_payload(video_data.model_dump())
        for key, value in (scope_fields or {}).items():
            if payload.get(key) in [None, "", [], {}] and value not in [None, "", [], {}]:
                payload[key] = value
        payload = self._canonicalize_video_org_payload(payload)

        next_id = str(get_next_sequence("video_device_id"))

        payload["id"] = next_id

        payload["createdAt"] = datetime.utcnow()

        payload["updatedAt"] = datetime.utcnow()



        collection.insert_one(payload)

        created = collection.find_one({"id": next_id})

        return self._mongo_video_to_out(created)



    def get_videos(self, mongo_db, skip: int = 0, limit: int = 100, current_user: dict | None = None):
        collection = self._video_collection()

        docs = [self._enrich_video_org_scope(doc) for doc in collection.find({}, {"_id": 0})]
        docs = [doc for doc in docs if doc]
        if current_user:
            docs = [doc for doc in docs if in_scope(doc, current_user, **self._scope_kwargs())]

        docs.sort(key=lambda x: int(str(x.get("id", "0"))))

        docs = docs[max(0, int(skip)): max(0, int(skip)) + max(1, int(limit))]

        return [self._mongo_video_to_out(doc) for doc in docs]



    def update_video(self, mongo_db, video_id: int, video_data: VideoUpdate):
        collection = self._video_collection()

        video_id = str(video_id)



        existing = collection.find_one({"id": video_id})

        if not existing:

            return None



        update_payload = video_data.model_dump(exclude_unset=True)



        if "stream_protocol" in update_payload:

            update_payload["stream_protocol"] = self._normalize_stream_protocol(update_payload.get("stream_protocol"))



        if "platform_type" in update_payload and not update_payload.get("platform_type"):

            update_payload["platform_type"] = "onvif"

        if "access_source" in update_payload and not update_payload.get("access_source"):

            update_payload["access_source"] = "local"

        if "ptz_source" in update_payload and not update_payload.get("ptz_source"):

            update_payload["ptz_source"] = "onvif"

        if "channel_no" in update_payload and not update_payload.get("channel_no"):

            update_payload["channel_no"] = 1



        merged = self._canonicalize_video_org_payload({**existing, **update_payload})



        if merged.get("rtsp_url") and (not merged.get("stream_url") or "/live/" not in str(merged.get("stream_url"))):

            merged["stream_url"] = f"{NMS_HOST}/live/{video_id}.flv"



        merged["updatedAt"] = datetime.utcnow()



        collection.update_one(

            {"id": video_id},

            {"$set": {k: v for k, v in merged.items() if k != "_id"}}

        )



        updated = collection.find_one({"id": video_id})



        for key in (video_id, str(video_id), int(video_id) if str(video_id).isdigit() else None):

            if key is None:

                continue

            if key in ONVIF_CLIENT_CACHE:

                del ONVIF_CLIENT_CACHE[key]

            if key in EZVIZ_PTZ_LAST_DIRECTION:

                del EZVIZ_PTZ_LAST_DIRECTION[key]

            if key in EZVIZ_PTZ_LAST_STOP_AT:

                del EZVIZ_PTZ_LAST_STOP_AT[key]

            if key in CAMERA_TIME_SYNC_CACHE:

                del CAMERA_TIME_SYNC_CACHE[key]



        return self._mongo_video_to_out(updated)



    def delete_video(self, mongo_db, video_id: int):
        collection = self._video_collection()

        video_id = str(video_id)
        video_id_number = int(video_id) if video_id.isdigit() else video_id

        db_video = collection.find_one({"$or": [{"id": video_id}, {"id": video_id_number}]})

        if not db_video:

            return False



        stream_name = str(db_video.get("id"))

        self.stop_ffmpeg_stream(stream_name)

        self.stop_ffmpeg_recording(video_id)

        self.stop_cruise(video_id)



        collection.delete_one({"$or": [{"id": video_id}, {"id": video_id_number}]})



        for key in (video_id, str(video_id), int(video_id) if str(video_id).isdigit() else None):

            if key is None:

                continue

            if key in ONVIF_CLIENT_CACHE:

                del ONVIF_CLIENT_CACHE[key]

            if key in EZVIZ_PTZ_LAST_DIRECTION:

                del EZVIZ_PTZ_LAST_DIRECTION[key]

            if key in EZVIZ_PTZ_LAST_STOP_AT:

                del EZVIZ_PTZ_LAST_STOP_AT[key]

            if key in CAMERA_TIME_SYNC_CACHE:

                del CAMERA_TIME_SYNC_CACHE[key]



        return True



    def get_stream_url(self, mongo_db, video_id: int):

        stream_info = self.get_stream_info(mongo_db, video_id)
        if not stream_info:

            return None

        return stream_info.get("url")



    def ptz_move(self, mongo_db, video_id: int, direction: str, speed: float = 0.5, duration: float = 0.5):
        try:

            self.ptz_start_move(mongo_db, video_id, direction, speed)
            time.sleep(duration)

            self.ptz_stop_move(mongo_db, video_id)
            return {"status": "success"}

        except Exception as e:

            raise ValueError(f"Move error: {e}")



    def zoom_start_move(self, mongo_db, video_id: int, direction: str, speed: float = 0.5):
        if direction not in {"zoom_in", "zoom_out"}:

            raise ValueError("Invalid zoom direction. Use zoom_in or zoom_out")

        return self.ptz_start_move(mongo_db, video_id, direction, speed)


    def zoom_stop_move(self, mongo_db, video_id: int):
        return self.ptz_stop_move(mongo_db, video_id)


    def zoom_move(self, mongo_db, video_id: int, direction: str, speed: float = 0.5, duration: float = 0.5):
        if direction not in {"zoom_in", "zoom_out"}:

            raise ValueError("Invalid zoom direction. Use zoom_in or zoom_out")

        return self.ptz_move(mongo_db, video_id, direction, speed, duration)


    # -------------------------------------------------------------------------

    # [閺傛澘濮涢懗绲?V4 閺嬩線鈧喐甯?+ 鏉╂稓鈻肩粻锛勬倞

    # -------------------------------------------------------------------------

    def start_ffmpeg_stream(self, rtsp_url: str, stream_name: str):

        # Start an FFmpeg stream.

        # 婵″倹鐏夊鑼病鐎涙ê婀崥灞芥倳閹恒劍绁?閸忓牆浠犲銏℃＋閻?
        self.stop_ffmpeg_stream(stream_name)



        ffmpeg_path = self._get_ffmpeg_path()

        rtmp_url = f"rtmp://127.0.0.1:19350/live/{stream_name}"



        # V4 鐎瑰瞼绶ㄩ柊宥囩枂

        command = [

            ffmpeg_path, "-y",

            "-f", "rtsp", "-rtsp_transport", "tcp",

            "-user_agent", "LIVE555 Streaming Media v2013.02.11",

            "-fflags", "nobuffer", "-flags", "low_delay",

            "-strict", "experimental",

            "-analyzeduration", "100000", "-probesize", "100000",

            "-i", rtsp_url,

            "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",

            "-b:v", "4000k", "-maxrate", "6000k", "-bufsize", "1000k",

            "-pix_fmt", "yuv420p", "-g", "15",

            "-c:a", "aac", "-b:a", "64k", "-ar", "16000",

            "-flvflags", "no_duration_filesize",

            "-f", "flv", rtmp_url

        ]



        logger.info(f"Starting FFmpeg Stream for {stream_name}...")



        try:

            # [娣囶喗鏁奸崗鎶芥暛閻愮 闂呮劘妫?CMD 缁愭褰?

            startupinfo = None

            creationflags = 0



            if os.name == 'nt':

                # Windows 娑撳濞?CREATE_NO_WINDOW (0x08000000) 瑜拌绨抽梾鎰

                creationflags = 0x08000000



            process = subprocess.Popen(

                command,

                stdout=subprocess.DEVNULL,

                stderr=subprocess.DEVNULL,

                creationflags=creationflags

            )



            # [閺傛澘顤僝 鐎涙ê鍙嗛崗銊ョ湰鐎涙鍚€

            FFMPEG_PROCESSES[stream_name] = process

            logger.info(f"Stream {stream_name} started (PID: {process.pid})")



            return process

        except Exception as e:

            logger.error(f"FFmpeg start failed: {e}")

            return None



    def stop_ffmpeg_stream(self, stream_name: str):

        # Stop and clean up an FFmpeg stream.

        global FFMPEG_PROCESSES

        process = FFMPEG_PROCESSES.get(stream_name)



        if process:

            try:

                logger.info(f"Stopping FFmpeg for {stream_name} (PID: {process.pid})...")

                process.terminate()  # 鐏忔繆鐦〒鈺佹嫲閸忔娊妫?

                try:

                    process.wait(timeout=2)

                except subprocess.TimeoutExpired:

                    process.kill()  # 瀵搫鍩楅崗鎶芥４

                logger.info(f"Stream {stream_name} stopped.")

            except Exception as e:

                logger.error(f"Error stopping stream {stream_name}: {e}")

            finally:

                # 閺冪姾顔戞俊鍌欑秿娴犲骸鐡ч崗闀愯厬缁夊娅?

                if stream_name in FFMPEG_PROCESSES:

                    del FFMPEG_PROCESSES[stream_name]



    def _sanitize_stream_name(self, name: str) -> str:

        return name.replace(" ", "_").replace("/", "_").replace("\\", "_").lower()



    def _get_ffmpeg_path(self) -> str:

        return os.getenv(

            "FFMPEG_PATH",

            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "..",

                         "ffmpeg-8.0.1-essentials_build", "bin", "ffmpeg.exe")

        )



    def _get_ffprobe_path(self) -> str:

        ffmpeg_path = self._get_ffmpeg_path()

        ffprobe_path = os.path.join(os.path.dirname(ffmpeg_path), "ffprobe.exe")

        return ffprobe_path



    def _get_system_config(self) -> dict:

        config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "system_config.json")

        config = {}

        if os.path.exists(config_path):

            try:

                with open(config_path, 'r', encoding='utf-8') as f:

                    config = json.load(f)

            except:

                pass

        return config

    def _get_video_storage_type(self) -> str:
        storage_type = str(self._get_system_config().get("videoStorageType", "local") or "local").lower()
        if storage_type not in {"local", "cloud", "hybrid"}:
            return "local"
        return storage_type

    def _get_local_storage_roots_enabled(self) -> bool:
        return self._get_video_storage_type() in {"local", "hybrid"}

    def _get_cloud_storage_enabled(self) -> bool:
        return self._get_video_storage_type() in {"cloud", "hybrid"}

    def _coerce_positive_float(self, value, default: float, minimum: float, maximum: float | None = None) -> float:
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            numeric = default
        numeric = max(minimum, numeric)
        if maximum is not None:
            numeric = min(maximum, numeric)
        return numeric

    def _safe_storage_folder_name(self, value: Any, default: str) -> str:
        name = str(value or "").strip().replace("\\", "/").strip("/")
        if not name or name in {".", ".."} or "/" in name:
            return default
        if any(ch in name for ch in '<>:"|?*'):
            return default
        return name

    def _get_video_storage_folders(self) -> dict:
        configured = self._get_system_config().get("videoStorageFolders") or {}
        if not isinstance(configured, dict):
            configured = {}
        folders = {}
        for key, default in DEFAULT_VIDEO_STORAGE_FOLDERS.items():
            folders[key] = self._safe_storage_folder_name(configured.get(key), default)
        return folders

    def _folder(self, key: str) -> str:
        return self._get_video_storage_folders().get(key, DEFAULT_VIDEO_STORAGE_FOLDERS[key])



    def _resolve_storage_path(self, path: str) -> str:

        if os.path.isabs(path):

            return os.path.abspath(path)

        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

        project_root = os.path.dirname(backend_dir)

        return os.path.abspath(os.path.join(project_root, path))



    def _get_storage_root(self) -> str:

        local_storage_paths = [
            sp for sp in self._storage_paths
            if sp.get("enabled", True) and sp.get("type", "mirror") in {"mirror", "primary"}
        ]

        if self._get_local_storage_roots_enabled() and len(local_storage_paths) > 0:

            storage_root = self._resolve_storage_path(local_storage_paths[0]["path"])

        else:

            config = self._get_system_config()

            configured_path = config.get("videoStoragePath")

            if configured_path and self._get_local_storage_roots_enabled():

                storage_root = self._resolve_storage_path(configured_path)

            else:

                base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

                storage_root = os.path.join(base_dir, "static")

        

        os.makedirs(storage_root, exist_ok=True)

        return storage_root



    def _get_default_static_root(self) -> str:

        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

        static_root = os.path.join(base_dir, "static")

        os.makedirs(static_root, exist_ok=True)

        return static_root



    def _get_default_static_subdir(self, subdir: str) -> str:

        root = os.path.join(self._get_default_static_root(), subdir)

        os.makedirs(root, exist_ok=True)

        return root



    def _refresh_storage_paths(self) -> None:

        self._storage_paths = self._load_storage_paths()



    def _get_enabled_local_storage_roots(self, include_default: bool = True) -> list[str]:

        roots = []

        for sp in self._storage_paths:

            if sp.get("enabled", True) and sp.get("type", "mirror") in {"mirror", "primary"}:
                if not self._get_local_storage_roots_enabled():
                    continue

                path = sp.get("path")

                if path:

                    roots.append(self._resolve_storage_path(path))



        configured_path = self._get_system_config().get("videoStoragePath")

        if configured_path and self._get_local_storage_roots_enabled():

            roots.append(self._resolve_storage_path(configured_path))



        if include_default:

            roots.append(os.path.abspath(self._get_default_static_root()))



        return list(dict.fromkeys(roots))

    

    def _get_all_record_roots(self) -> list[str]:

        roots = []

        for storage_root in self._get_enabled_local_storage_roots():

            record_root = os.path.join(storage_root, self._folder("recordings"))

            os.makedirs(record_root, exist_ok=True)

            roots.append(record_root)



        return roots



    def _get_record_root(self) -> str:

        return self._get_all_record_roots()[0]



    def _get_local_record_root(self) -> str:

        return self._get_default_static_subdir(self._folder("recordings"))



    def _get_alarm_video_root(self) -> str:

        alarm_root = os.path.join(self._get_storage_root(), self._folder("alarm_videos"))

        os.makedirs(alarm_root, exist_ok=True)

        return alarm_root



    def _get_all_alarm_video_roots(self) -> list[str]:

        roots = []

        for storage_root in self._get_enabled_local_storage_roots():

            alarm_root = os.path.join(storage_root, self._folder("alarm_videos"))

            os.makedirs(alarm_root, exist_ok=True)

            roots.append(alarm_root)

        return roots



    def _get_playback_video_root(self) -> str:

        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

        playback_root = os.path.join(self._get_storage_root(), self._folder("playback_videos"))

        os.makedirs(playback_root, exist_ok=True)

        return playback_root



    def _get_temp_playback_root(self) -> str:

        temp_root = os.path.join(self._get_playback_video_root(), self._folder("temp_cache"))

        os.makedirs(temp_root, exist_ok=True)

        return temp_root

    def _get_alarm_temp_buffer_root(self, video_id: int | str | None = None) -> str:

        root = os.path.join(self._get_playback_video_root(), "alarm_temp_buffer")

        if video_id is not None:

            root = os.path.join(root, str(video_id))

        os.makedirs(root, exist_ok=True)

        return root



    def _get_rtsp_url_for_device(self, db_video: VideoDevice) -> Optional[str]:

        if (
            getattr(db_video, "rtsp_url", None)
            and str(db_video.rtsp_url).lower().startswith("rtsp://")
            and "ezopen://" not in str(db_video.rtsp_url).lower()
        ):

            return db_video.rtsp_url



        if (
            db_video.stream_url
            and str(db_video.stream_url).lower().startswith("rtsp://")
            and "ezopen://" not in str(db_video.stream_url).lower()
        ):

            return db_video.stream_url



        if db_video.ip_address and db_video.username and db_video.password:

            return f"rtsp://{db_video.username}:{db_video.password}@{db_video.ip_address}:554/Streaming/Channels/1"



        return None



    def _get_ezviz_recordable_url(self, db_video: VideoDevice) -> Optional[str]:

        # Return a recordable URL for cloud devices.

        device_serial = str(getattr(db_video, "device_serial", "") or "").strip()

        if not device_serial:

            return None



        channel_no = int(getattr(db_video, "channel_no", None) or 1)

        protocol_candidates = [4, 2, 3, 1]  # flv, hls, rtmp, ezopen

        paths = ["/api/lapp/live/address/get", "/api/lapp/v2/live/address/get"]



        for protocol_code in protocol_candidates:

            payload = {

                "deviceSerial": device_serial,

                "channelNo": channel_no,

                "protocol": protocol_code,

                "expireTime": 3600,

            }



            body = None

            for path in paths:

                try:

                    body = self._call_ezviz_api(path, payload)

                    break

                except Exception:

                    body = None



            if body is None:

                continue



            data = body.get("data") or {}

            url = (

                    data.get("url")

                    or data.get("liveAddress")

                    or data.get("flv")

                    or data.get("hls")

                    or data.get("rtmp")

                    or data.get("ezopen")

                    or ""

            )

            lower_url = str(url).lower()

            if not url:

                continue

            if lower_url.startswith("ezopen://"):

                continue

            if lower_url.startswith("http://") or lower_url.startswith("https://") or lower_url.startswith(

                    "rtmp://") or lower_url.startswith("rtsp://"):

                return str(url)



        return None



    def _get_record_source_for_device(self, db_video: VideoDevice) -> Optional[str]:

        if self._is_ezviz_access(db_video):

            ezviz_url = self._get_ezviz_recordable_url(db_video)

            if ezviz_url:

                return ezviz_url

        stream_url = str(getattr(db_video, "stream_url", "") or "").strip()

        stream_url_lower = stream_url.lower()

        if stream_url_lower.startswith(("http://", "https://", "rtmp://", "rtsp://")) and "ezopen://" not in stream_url_lower:

            return stream_url



        rtsp_url = self._get_rtsp_url_for_device(db_video)

        if rtsp_url:

            return rtsp_url



        return None



    def start_ffmpeg_recording(self, video_id: int, source_url: str):

        if not source_url:

            logger.warning(f"Recording start failed video_id={video_id}: source_url is empty")

            return None



        # 婵″倹鐏夐崥灞肩鐠侯垰缍嶉崓蹇氱箻缁嬪顒滈崷銊ㄧ箥鐞涘奔绗栧┃鎰勾閸р偓閺堫亜褰?娑撳秷顩﹂柌宥呮儙?

        existing = RECORDING_PROCESSES.get(video_id)

        if isinstance(existing, dict):

            existing_process = existing.get("process")

            existing_source = existing.get("source_url") or existing.get("rtsp_url")

            if existing_process and existing_process.poll() is None and existing_source == source_url:

                return existing_process

        elif existing is not None:

            try:

                if existing.poll() is None:

                    return existing

            except Exception:

                pass



        self.stop_ffmpeg_recording(video_id)



        ffmpeg_path = self._get_ffmpeg_path()

        record_root = self._get_record_root()

        device_root = os.path.join(record_root, str(video_id))

        os.makedirs(device_root, exist_ok=True)

        log_root = os.path.join(os.path.dirname(record_root), "logs")

        os.makedirs(log_root, exist_ok=True)

        log_path = os.path.join(log_root, f"recording_{video_id}.log")



        # 閻╁瓨甯撮崘娆忓煂鐠佹儳顦惄顔肩秿,闁灝鍘ら弮銉︽埂鐎涙劗娲拌ぐ鏇氱瑝鐎涙ê婀€?ffmpeg 閺冪姵纭堕拃鐣屾磸?

        segment_pattern = os.path.join(device_root, "%Y%m%d_%H%M%S.mp4")



        source_lower = str(source_url).lower()

        input_options: list[str] = []

        if source_lower.startswith("rtsp://"):

            input_options.extend(["-rtsp_transport", "tcp"])



        config = self._get_system_config()

        segment_minutes = self._coerce_positive_float(config.get('videoSegmentMinutes', 0.5), 0.5, 0.5, 60)

        segment_seconds = int(segment_minutes * 60)

        

        quality_params = {

            'high': ['-b:v', '4M', '-c:v', 'libx264'],

            'medium': ['-b:v', '2M', '-c:v', 'libx264'],

            'low': ['-b:v', '1M', '-c:v', 'libx265'],

        }

        video_quality = config.get('videoQuality', 'high')

        codec_params = quality_params.get(video_quality, quality_params['high'])



        command = [

            ffmpeg_path,

            "-y",

            *input_options,

            "-use_wallclock_as_timestamps", "1",

            "-i", source_url,

            "-map", "0:v:0",

            "-map", "0:a:0?",

            *codec_params,

            "-c:a", "aac",

            "-f", "segment",

            "-segment_time", str(segment_seconds),

            "-segment_atclocktime", "1",

            "-strftime", "1",

            "-reset_timestamps", "1",

            segment_pattern

        ]



        logger.info(f"Starting recording for video_id={video_id}")

        try:

            creationflags = 0x08000000 if os.name == "nt" else 0

            log_file = open(log_path, "a", encoding="utf-8")

            process = subprocess.Popen(

                command,

                stdout=subprocess.DEVNULL,

                stderr=log_file,

                creationflags=creationflags

            )



            time.sleep(1.5)

            if process.poll() is not None:

                logger.error(

                    f"瑜版洖鍎氭潻娑氣柤閸氼垰濮╅崥搴ｇ彌閸楁娊鈧偓?video_id={video_id}, returncode={process.returncode}, "

                    f"鐠囬攱鐓￠惇瀣）? {log_path}"

                )

                try:

                    log_file.close()

                except Exception:

                    pass

                return None



            RECORDING_PROCESSES[video_id] = {

                "process": process,

                "log_file": log_file,

                "source_url": source_url,

            }

            self.start_alarm_temp_buffer_recording(video_id, source_url)

            logger.info(f"瑜版洖鍎氭潻娑氣柤瀹告彃鎯?video_id={video_id}, pid={process.pid}, output={segment_pattern}")

            return process

        except Exception as e:

            logger.error(f"瑜版洖鍎氶崥顖氬З婢惰精瑙?video_id={video_id}: {e}")

            return None

    def start_alarm_temp_buffer_recording(self, video_id: int, source_url: str):

        if not source_url:

            return None

        existing = TEMP_BUFFER_PROCESSES.get(video_id) or TEMP_BUFFER_PROCESSES.get(str(video_id))

        if isinstance(existing, dict):

            existing_process = existing.get("process")

            existing_source = existing.get("source_url")

            if existing_process and existing_process.poll() is None and existing_source == source_url:

                return existing_process

        self.stop_alarm_temp_buffer_recording(video_id)

        ffmpeg_path = self._get_ffmpeg_path()

        if not os.path.exists(ffmpeg_path):

            return None

        buffer_root = self._get_alarm_temp_buffer_root(video_id)

        self._prune_alarm_temp_buffer(video_id)

        log_root = os.path.join(os.path.dirname(self._get_record_root()), "logs")

        os.makedirs(log_root, exist_ok=True)

        log_path = os.path.join(log_root, f"alarm_temp_buffer_{video_id}.log")

        source_lower = str(source_url).lower()

        input_options: list[str] = []

        if source_lower.startswith("rtsp://"):

            input_options.extend(["-rtsp_transport", "tcp"])

        try:

            segment_seconds = max(30, min(int(os.getenv("ALARM_VIDEO_TEMP_BUFFER_SEGMENT_SECONDS", "120")), 300))

        except (TypeError, ValueError):

            segment_seconds = 120

        segment_pattern = os.path.join(buffer_root, "%Y%m%d_%H%M%S.mp4")

        command = [
            ffmpeg_path,
            "-y",
            *input_options,
            "-use_wallclock_as_timestamps", "1",
            "-i", source_url,
            "-map", "0:v:0",
            "-map", "0:a:0?",
            "-c", "copy",
            "-f", "segment",
            "-segment_time", str(segment_seconds),
            "-segment_atclocktime", "1",
            "-strftime", "1",
            "-reset_timestamps", "1",
            segment_pattern,
        ]

        try:

            creationflags = 0x08000000 if os.name == "nt" else 0

            log_file = open(log_path, "a", encoding="utf-8")

            process = subprocess.Popen(
                command,
                stdout=subprocess.DEVNULL,
                stderr=log_file,
                creationflags=creationflags,
            )

            time.sleep(1.0)

            if process.poll() is not None:

                try:

                    log_file.close()

                except Exception:

                    pass

                return None

            TEMP_BUFFER_PROCESSES[video_id] = {
                "process": process,
                "log_file": log_file,
                "source_url": source_url,
            }

            logger.info("Alarm temp buffer started video_id=%s pid=%s output=%s", video_id, process.pid, segment_pattern)

            return process

        except Exception as exc:

            logger.warning("Alarm temp buffer start failed video_id=%s error=%s", video_id, exc)

            return None

    def stop_alarm_temp_buffer_recording(self, video_id: int):

        entry = TEMP_BUFFER_PROCESSES.get(video_id) or TEMP_BUFFER_PROCESSES.get(str(video_id))

        if not entry:

            return

        process = entry.get("process") if isinstance(entry, dict) else entry

        log_file = entry.get("log_file") if isinstance(entry, dict) else None

        try:

            process.terminate()

            try:

                process.wait(timeout=3)

            except subprocess.TimeoutExpired:

                process.kill()

        except Exception as exc:

            logger.warning("Alarm temp buffer stop failed video_id=%s error=%s", video_id, exc)

        finally:

            TEMP_BUFFER_PROCESSES.pop(video_id, None)

            TEMP_BUFFER_PROCESSES.pop(str(video_id), None)

            if log_file:

                try:

                    log_file.close()

                except Exception:

                    pass

    def _prune_alarm_temp_buffer(self, video_id: int | str):

        buffer_root = self._get_alarm_temp_buffer_root(video_id)

        try:

            keep_seconds = max(120, min(int(os.getenv("ALARM_VIDEO_TEMP_BUFFER_SECONDS", "120")), 900))

        except (TypeError, ValueError):

            keep_seconds = 120

        for file_path in glob.glob(os.path.join(buffer_root, "*.mp4")):

            try:

                if time.time() - os.path.getmtime(file_path) <= keep_seconds:

                    continue

                os.remove(file_path)

                thumbnail_path = f"{file_path}.jpg"

                if os.path.exists(thumbnail_path):

                    os.remove(thumbnail_path)

            except Exception:

                continue



    def stop_ffmpeg_recording(self, video_id: int):

        self.stop_alarm_temp_buffer_recording(video_id)

        entry = RECORDING_PROCESSES.get(video_id)

        if not entry:

            return



        process = entry["process"] if isinstance(entry, dict) else entry

        log_file = entry.get("log_file") if isinstance(entry, dict) else None



        try:

            process.terminate()

            try:

                process.wait(timeout=3)

            except subprocess.TimeoutExpired:

                process.kill()

        except Exception as e:

            logger.error(f"閸嬫粍顒涜ぐ鏇炲剼婢惰精瑙?video_id={video_id}: {e}")

        finally:

            RECORDING_PROCESSES.pop(video_id, None)

            if log_file:

                try:

                    log_file.close()

                except Exception:

                    pass

    def force_rollover_recording(self, video_id: int, cooldown_seconds: float = 10.0) -> bool:
        entry = RECORDING_PROCESSES.get(video_id) or RECORDING_PROCESSES.get(str(video_id))
        if not isinstance(entry, dict):
            return False

        source_url = entry.get("source_url") or entry.get("rtsp_url")
        process = entry.get("process")
        if not source_url or not process:
            return False

        try:
            if process.poll() is not None:
                return False
        except Exception:
            return False

        now = time.time()
        last_at = RECORDING_ROLLOVER_LAST_AT.get(int(video_id), 0.0)
        if now - last_at < max(1.0, float(cooldown_seconds)):
            return False

        RECORDING_ROLLOVER_LAST_AT[int(video_id)] = now
        logger.info("Force rolling recording segment for alarm video_id=%s", video_id)
        self.stop_ffmpeg_recording(video_id)
        restarted = self.start_ffmpeg_recording(video_id, source_url)
        return restarted is not None



    def _parse_segment_start(self, file_path: str) -> Optional[datetime]:

        name = os.path.basename(str(file_path))
        match = re.search(r"(20\d{6})_(\d{6})", name)
        if match:
            try:
                return datetime.strptime("".join(match.groups()), "%Y%m%d%H%M%S")
            except Exception:
                return None

        try:
            stem = os.path.splitext(name)[0]
            return datetime.strptime(stem, "%Y%m%d_%H%M%S")
        except Exception:
            return None

    @staticmethod
    def _parse_duration_text(value) -> Optional[float]:
        if value is None:
            return None

        text = str(value).strip()
        if not text or text.upper() == "N/A":
            return None

        try:
            duration = float(text)
            return duration if duration >= 0 else None
        except (TypeError, ValueError):
            pass

        duration_marker = "Duration:"
        if duration_marker in text:
            text = text.split(duration_marker, 1)[1].split(",", 1)[0].strip()

        parts = text.split(":")
        if len(parts) != 3:
            return None

        try:
            hours = float(parts[0])
            minutes = float(parts[1])
            seconds = float(parts[2])
        except (TypeError, ValueError):
            return None

        if hours < 0 or minutes < 0 or seconds < 0:
            return None
        return hours * 3600 + minutes * 60 + seconds


    def _probe_video_duration(self, file_path: str, timeout_seconds: float = 2.0) -> Optional[float]:
        ffprobe_path = self._get_ffprobe_path()
        if os.path.exists(ffprobe_path):
            cmd = [
                ffprobe_path,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path,
            ]
            try:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=timeout_seconds,
                )
            except subprocess.TimeoutExpired:
                logger.warning(
                    "ffprobe duration timeout file=%s timeout_seconds=%.1f",
                    file_path,
                    timeout_seconds,
                )
                return None
            if result.returncode == 0:
                try:
                    duration = float((result.stdout or "").strip())
                    if duration > 0:
                        return duration
                except Exception:
                    pass
            logger.warning(
                f"ffprobe duration failed file={file_path} returncode={result.returncode} "
                f"stderr={(result.stderr or '').strip()[-800:]}"
            )
            return None

        ffmpeg_path = self._get_ffmpeg_path()
        probe_cmd = [ffmpeg_path, "-hide_banner", "-i", file_path]
        try:
            result = subprocess.run(
                probe_cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired:
            logger.warning(
                "ffmpeg duration probe timeout file=%s timeout_seconds=%.1f",
                file_path,
                timeout_seconds,
            )
            return None
        duration = self._parse_duration_text((result.stderr or "") + "\n" + (result.stdout or ""))
        if duration and duration > 0:
            return duration

        logger.warning(
            f"video duration probe failed file={file_path} ffprobe_missing={ffprobe_path} "
            f"returncode={result.returncode} stderr={(result.stderr or '').strip()[-800:]}"
        )
        return None

    @staticmethod
    def _parse_duration_text(output: str) -> Optional[float]:
        match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", output or "")
        if not match:
            return None
        hours, minutes, seconds = match.groups()
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)

    def _probe_segment_duration_seconds(self, file_path: str) -> Optional[float]:
        return self._probe_video_duration(file_path, timeout_seconds=8.0)

    def _validate_recording_segment(
            self,
            file_path: str,
            min_age_seconds: int = 6,
            probe_timeout_seconds: float = 2.0,
            check_decode: bool = True,
            trace: Optional[dict] = None,
    ) -> tuple[bool, Optional[float], str]:
        try:
            if trace is not None:
                trace["ffprobe_called"] = False
                trace["decode_check_called"] = False

            if not os.path.exists(file_path):
                return False, None, "file_not_found"
            stat = os.stat(file_path)
            if stat.st_size <= 0:
                return False, None, "file_empty"
            if stat.st_size < MIN_RECORD_SEGMENT_BYTES:
                return False, None, f"file_too_small:{stat.st_size}"

            seg_start = self._parse_segment_start(file_path)
            if seg_start:
                if (datetime.now() - seg_start).total_seconds() < (
                        RECORD_SEGMENT_SECONDS + RECORD_SEGMENT_SAFE_MARGIN_SECONDS):
                    return False, None, "segment_still_writing"

            age = time.time() - stat.st_mtime
            if age < min_age_seconds:
                return False, None, "file_recently_modified"

            if trace is not None:
                trace["ffprobe_called"] = True
            duration = self._probe_video_duration(file_path, timeout_seconds=probe_timeout_seconds)
            if duration is None:
                return False, None, "duration_unreadable"
            if duration <= 0:
                return False, duration, f"duration_invalid:{duration}"

            if not check_decode:
                return True, duration, ""

            ffmpeg_path = self._get_ffmpeg_path()
            decode_check_cmd = [
                ffmpeg_path,
                "-v", "error",
                "-t", "1",
                "-i", file_path,
                "-an",
                "-f", "null",
                "-",
            ]
            if trace is not None:
                trace["decode_check_called"] = True
            try:
                decode_result = subprocess.run(
                    decode_check_cmd,
                    capture_output=True,
                    text=True,
                    timeout=probe_timeout_seconds,
                )
            except subprocess.TimeoutExpired:
                return False, duration, f"decode_timeout:{probe_timeout_seconds}"
            if decode_result.returncode != 0:
                return False, duration, f"decode_failed:{(decode_result.stderr or '').strip()[-300:]}"

            return True, duration, ""
        except Exception as exc:
            return False, None, f"validate_exception:{exc}"

    def _get_segment_end(
            self,
            file_path: str,
            seg_start: datetime,
            next_seg_start: Optional[datetime] = None,
    ) -> datetime:
        duration = self._probe_segment_duration_seconds(file_path)
        if duration:
            return seg_start + timedelta(seconds=duration)
        if next_seg_start and next_seg_start > seg_start:
            return next_seg_start
        return seg_start + timedelta(seconds=RECORD_SEGMENT_SECONDS)


    def _is_segment_usable(
            self,
            file_path: str,
            min_age_seconds: int = 6,
            has_newer_segment: bool = False,
            allow_probe_fallback: bool = False,
    ) -> bool:

        # Filter unfinished or corrupted segments.

        try:

            if not os.path.exists(file_path):

                return False



            # 瑜版洖鍎氶幐澶婃祼鐎规艾鍨庡▓鍨闂€鍨瀼閻?閼峰啿鐨粵澶婄窡娑撯偓娑擃亜鐣弫鏉戝瀻濞堥潧鎳嗛張鐔峰晙閸欏倷绗岄幏鍏煎复?

            # 闁灝鍘ら幎濠佺矝閸︺劌鍟撻崗銉よ厬閻ㄥ嫬缍嬮崜宥呭瀻濞堥潧濮?concat?

            seg_start = self._parse_segment_start(file_path)

            if seg_start:

                if (datetime.now() - seg_start).total_seconds() < (

                        RECORD_SEGMENT_SECONDS + RECORD_SEGMENT_SAFE_MARGIN_SECONDS):

                    if not has_newer_segment:

                        return False



            stat = os.stat(file_path)

            if stat.st_size < 64 * 1024:

                return False



            age = time.time() - stat.st_mtime

            if age < min_age_seconds:

                if not has_newer_segment:

                    return False



            ffprobe_path = self._get_ffprobe_path()

            if not os.path.exists(ffprobe_path):

                # 濞屸剝婀?ffprobe 閺冩儼鍤︾亸鎴滅箽鐠囦焦鏋冩禒鏈电瑝閺勵垪鈧粍顒滈崷銊ュ晸閸忋儮鈧繄濮?

                return True



            cmd = [

                ffprobe_path,

                "-v", "error",

                "-select_streams", "v:0",

                "-show_entries", "stream=codec_name",

                "-of", "default=noprint_wrappers=1:nokey=1",

                file_path,

            ]

            result = subprocess.run(cmd, capture_output=True, text=True)

            if not (result.returncode == 0 and bool((result.stdout or "").strip())):

                return bool(allow_probe_fallback)



            # 娴滃本顐奸弽锟犵崣閿涙艾鎻╅柅鐔恍?1 缁夋帟顫嬫０?鐏忚姤妫崜鏃堟珟閺勫孩妯夐幑鐔锋綎閸掑棙顔?

            ffmpeg_path = self._get_ffmpeg_path()

            decode_check_cmd = [

                ffmpeg_path,

                "-v", "error",

                "-t", "1",

                "-i", file_path,

                "-an",

                "-f", "null",

                "-",

            ]

            decode_result = subprocess.run(decode_check_cmd, capture_output=True, text=True)

            if decode_result.returncode == 0:

                return True

            return bool(allow_probe_fallback)

        except Exception:

            return False


    def _get_recording_thumbnail_path(self, file_path: str) -> Optional[str]:

        # Return a stable thumbnail path for a recording, generating it once if needed.

        try:

            if not os.path.isfile(file_path):

                return None

            if not self._is_segment_usable(file_path, min_age_seconds=1, allow_probe_fallback=False):

                return None

            thumbnail_path = f"{file_path}.jpg"

            if os.path.isfile(thumbnail_path) and os.path.getmtime(thumbnail_path) >= os.path.getmtime(file_path):

                return thumbnail_path

            ffmpeg_path = self._get_ffmpeg_path()

            if not os.path.exists(ffmpeg_path):

                return None

            temp_path = f"{thumbnail_path}.tmp.jpg"

            for seek_at in ("00:00:01", "00:00:00", "00:00:03", "00:00:05"):

                command = [

                    ffmpeg_path,

                    "-hide_banner",

                    "-loglevel",

                    "error",

                    "-y",

                    "-ss",

                    seek_at,

                    "-i",

                    file_path,

                    "-frames:v",

                    "1",

                    "-vf",

                    "scale=640:-1",

                    temp_path,

                ]

                result = subprocess.run(

                    command,

                    capture_output=True,

                    timeout=12,

                )

                if result.returncode == 0 and os.path.isfile(temp_path) and os.path.getsize(temp_path) > 0:

                    os.replace(temp_path, thumbnail_path)

                    return thumbnail_path

                if os.path.exists(temp_path):

                    os.remove(temp_path)

            logger.debug("Failed to generate recording thumbnail for %s", file_path)

        except Exception:

            return None

        return None



    def ensure_all_recordings(self, mongo_db):

        docs = list(self._video_collection().find({}, {"_id": 0}))

        videos = [self._get_video_runtime_by_id(doc.get("id")) for doc in docs]

        videos = [v for v in videos if v]



        for v in videos:

            video_id = int(v.id) if str(v.id).isdigit() else v.id

            entry = RECORDING_PROCESSES.get(video_id) or RECORDING_PROCESSES.get(str(video_id))



            should_start = True



            if isinstance(entry, dict):

                proc = entry.get("process")

                if proc is not None:

                    try:

                        if proc.poll() is None:

                            should_start = False

                        else:

                            logger.warning(

                                f"瑜版洖鍎氭潻娑氣柤瀹告煡鈧偓閸?閸戝棗顦柌宥呮儙 video_id={video_id}, returncode={proc.returncode}"

                            )

                            log_file = entry.get("log_file")

                            if log_file:

                                try:

                                    log_file.close()

                                except Exception:

                                    pass

                            RECORDING_PROCESSES.pop(video_id, None)

                            RECORDING_PROCESSES.pop(str(video_id), None)

                    except Exception as e:

                        logger.warning(f"濡偓閺屻儱缍嶉崓蹇氱箻缁嬪濮搁幀浣搞亼鐠?閸戝棗顦柌宥呮儙 video_id={video_id}: {e}")

                        RECORDING_PROCESSES.pop(video_id, None)

                        RECORDING_PROCESSES.pop(str(video_id), None)



            elif entry is not None:

                try:

                    if entry.poll() is None:

                        should_start = False

                    else:

                        logger.warning(

                            f"瑜版洖鍎氭潻娑氣柤瀹告煡鈧偓閸?閸戝棗顦柌宥呮儙 video_id={video_id}, returncode={entry.returncode}"

                        )

                        RECORDING_PROCESSES.pop(video_id, None)

                        RECORDING_PROCESSES.pop(str(video_id), None)

                except Exception as e:

                    logger.warning(f"濡偓閺屻儱缍嶉崓蹇氱箻缁嬪濮搁幀浣搞亼鐠?閸戝棗顦柌宥呮儙 video_id={video_id}: {e}")

                    RECORDING_PROCESSES.pop(video_id, None)

                    RECORDING_PROCESSES.pop(str(video_id), None)



            if not should_start:

                if isinstance(entry, dict):

                    source_url = entry.get("source_url") or entry.get("rtsp_url")

                    temp_entry = TEMP_BUFFER_PROCESSES.get(video_id) or TEMP_BUFFER_PROCESSES.get(str(video_id))

                    temp_process = temp_entry.get("process") if isinstance(temp_entry, dict) else temp_entry

                    temp_running = False

                    try:

                        temp_running = temp_process is not None and temp_process.poll() is None

                    except Exception:

                        temp_running = False

                    if source_url and not temp_running:

                        self.start_alarm_temp_buffer_recording(video_id, source_url)

                continue



            record_source = self._get_record_source_for_device(v)

            if record_source:

                logger.info(f"閸氼垰濮?闁插秴鎯庤ぐ鏇炲剼 video_id={video_id}, source={record_source}")

                self.start_ffmpeg_recording(video_id, record_source)

            else:

                logger.warning(f"Cannot start recording video_id={video_id}: source_url is empty")

    

    def restart_all_recordings(self, mongo_db):

        # 閸嬫粍顒涢幍鈧張澶嬵劀閸︺劌缍嶉崚鍓佹畱鏉╂稓鈻?

        for video_id in list(RECORDING_PROCESSES.keys()):

            self.stop_ffmpeg_recording(video_id)

        # 娴ｈ法鏁ら弬鎷岀熅瀵板嫰鍣搁弬鏉挎儙閸斻劍澧嶉張澶婄秿?

        self.ensure_all_recordings(mongo_db)


    def _parse_datetime_input(self, value: datetime | str) -> datetime:

        if isinstance(value, datetime):

            return value



        if not isinstance(value, str):

            raise ValueError("Invalid datetime format")



        raw = value.strip()

        if not raw:

            raise ValueError("时间参数不能为空")



        normalized = raw.replace(" ", "T")

        if normalized.endswith("Z"):

            normalized = normalized[:-1] + "+00:00"



        try:

            dt = datetime.fromisoformat(normalized)

        except ValueError:

            raise ValueError("閺冨爼妫块弽鐓庣础閺冪姵鏅?閺€?ISO 閺嶇厧绱?婵?2026-03-24T09:47:00")



        if dt.tzinfo is not None:

            dt = dt.astimezone().replace(tzinfo=None)

        return dt



    def _to_static_web_path(self, abs_file_path: str) -> str:

        abs_path = os.path.abspath(abs_file_path)

        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

        default_static = os.path.abspath(os.path.join(base_dir, "static"))

        roots = []

        for storage_path in self._storage_paths:

            if not storage_path.get("enabled", True):

                continue

            path = storage_path.get("path")

            if path and storage_path.get("type", "mirror") in {"mirror", "primary"}:

                roots.append(os.path.abspath(path))



        if default_static not in roots:

            roots.append(default_static)



        route_map = {

            self._folder("recordings"): "/api/videos",

            self._folder("alarm_videos"): "/api/alarm_videos",

            self._folder("playback_videos"): "/api/playback_videos",

            "alarms": "/api/alarm_screenshots",

            self._folder("alarm_screenshots"): "/api/alarm_screenshots",

        }



        for root in roots:

            try:

                rel_path = os.path.relpath(abs_path, root)

            except ValueError:

                continue



            if rel_path == "." or rel_path.startswith(".."):

                continue



            rel_web_path = rel_path.replace("\\", "/")

            first_part, _, rest = rel_web_path.partition("/")

            route_prefix = route_map.get(first_part)

            if route_prefix:

                return f"{route_prefix}/{rest}".rstrip("/")



            if root == default_static:

                return "/static/" + rel_web_path



        return "/static/" + os.path.relpath(abs_path, default_static).replace("\\", "/")

        

        # 婵″倹鐏夐崷銊╃帛?static 閻╊喖缍嶆稉??/static

        

        # 閸氾箑鍨?/api/videos 閸斻劍鈧浇鐭?

        # abs_file_path = 鐎涙ê鍋嶉弽鍦窗?recordings/鐠佹儳顦琁D/鐟欏棝顣?mp4

        # 閻╃顕捄顖氱窞闂団偓鐟曚礁骞?recordings 鏉╂瑤绔?



    def _to_backend_static_web_path(self, abs_file_path: str) -> str:

        abs_path = os.path.abspath(abs_file_path)

        default_static = os.path.abspath(self._get_default_static_root())

        try:

            rel_path = os.path.relpath(abs_path, default_static)

        except ValueError:

            return self._to_static_web_path(abs_file_path)

        if rel_path == "." or rel_path.startswith(".."):

            return self._to_static_web_path(abs_file_path)

        return "/static/" + rel_path.replace("\\", "/")



    def _collect_segments_for_timerange(
            self,
            video_id: int,
            start_dt: datetime,
            end_dt: datetime,
            strict_validation: bool = False,
            include_temp_buffer: bool = False,
    ) -> list[

        tuple[str, datetime, datetime]]:

        seen = set()

        candidates: list[tuple[str, datetime, datetime]] = []

        

        record_roots = self._get_all_record_roots()
        if include_temp_buffer:
            record_roots.append(self._get_alarm_temp_buffer_root())
            self._prune_alarm_temp_buffer(video_id)

        temp_buffer_base = os.path.normcase(os.path.abspath(self._get_alarm_temp_buffer_root()))

        for record_root in record_roots:

            is_temp_buffer_root = os.path.normcase(os.path.abspath(record_root)) == temp_buffer_base

            device_root = os.path.join(record_root, str(video_id))

            if not os.path.isdir(device_root):

                continue

            parsed_segments: list[tuple[str, datetime]] = []

            for seg_path in sorted(glob.glob(os.path.join(device_root, "*.mp4"))):

                seg_filename = os.path.basename(seg_path)

                if seg_filename in seen:

                    continue

                seg_start = self._parse_segment_start(seg_path)

                if not seg_start:

                    continue

                parsed_segments.append((seg_path, seg_start))

            parsed_segments.sort(key=lambda item: item[1])

            for index, (seg_path, seg_start) in enumerate(parsed_segments):

                seg_filename = os.path.basename(seg_path)
                next_seg_start = None

                for _, candidate_next_start in parsed_segments[index + 1:]:

                    if candidate_next_start > seg_start:

                        next_seg_start = candidate_next_start
                        break

                if is_temp_buffer_root and next_seg_start is None:

                    continue

                fallback_seg_end = (
                    next_seg_start
                    if next_seg_start and next_seg_start > seg_start
                    else seg_start + timedelta(seconds=RECORD_SEGMENT_SECONDS)
                )

                if not (fallback_seg_end > start_dt and seg_start < end_dt):

                    continue

                if strict_validation:
                    ok, duration_seconds, _reason = self._validate_recording_segment(
                        seg_path,
                        min_age_seconds=0 if next_seg_start is not None else 6,
                        probe_timeout_seconds=8.0,
                        check_decode=True,
                    )
                    if not ok or not duration_seconds:
                        continue
                    seg_end = seg_start + timedelta(seconds=duration_seconds)
                else:
                    seg_end = self._get_segment_end(seg_path, seg_start, next_seg_start)

                if not (seg_end > start_dt and seg_start < end_dt):

                    continue

                if not strict_validation and not self._is_segment_usable(
                    seg_path,
                    has_newer_segment=next_seg_start is not None,
                    allow_probe_fallback=True,
                ):

                    continue

                candidates.append((seg_path, seg_start, seg_end))

                seen.add(seg_filename)



        return candidates



    def _summarize_segment_collection_failure(self, video_id: int, start_dt: datetime, end_dt: datetime) -> str:

        parts = []

        try:

            for record_root in self._get_all_record_roots():

                device_root = os.path.join(record_root, str(video_id))

                if not os.path.isdir(device_root):

                    parts.append(f"{device_root}:missing")
                    continue

                files = sorted(glob.glob(os.path.join(device_root, "*.mp4")))
                parsed_count = 0
                overlap_count = 0
                usable_count = 0

                parsed_segments: list[tuple[str, datetime]] = []
                for seg_path in files:
                    seg_start = self._parse_segment_start(seg_path)
                    if seg_start:
                        parsed_count += 1
                        parsed_segments.append((seg_path, seg_start))

                parsed_segments.sort(key=lambda item: item[1])

                for index, (seg_path, seg_start) in enumerate(parsed_segments):
                    next_seg_start = None
                    for _, candidate_next_start in parsed_segments[index + 1:]:
                        if candidate_next_start > seg_start:
                            next_seg_start = candidate_next_start
                            break

                    fallback_seg_end = (
                        next_seg_start
                        if next_seg_start and next_seg_start > seg_start
                        else seg_start + timedelta(seconds=RECORD_SEGMENT_SECONDS)
                    )
                    if not (fallback_seg_end > start_dt and seg_start < end_dt):
                        continue

                    seg_end = self._get_segment_end(seg_path, seg_start, next_seg_start)
                    if not (seg_end > start_dt and seg_start < end_dt):
                        continue

                    overlap_count += 1
                    if self._is_segment_usable(
                            seg_path,
                            has_newer_segment=next_seg_start is not None,
                            allow_probe_fallback=True,
                    ):
                        usable_count += 1

                parts.append(
                    f"{device_root}:mp4={len(files)},parsed={parsed_count},overlap={overlap_count},usable={usable_count}"
                )

        except Exception as exc:

            parts.append(f"diagnostic_failed:{exc}")

        return "; ".join(parts)[:180]



    def _floor_to_archive_slot(self, dt: datetime) -> datetime:

        floored_hour = dt.hour - (dt.hour % PLAYBACK_ARCHIVE_WINDOW_HOURS)

        return dt.replace(hour=floored_hour, minute=0, second=0, microsecond=0)



    def _auto_archive_periodic_playback(self, video_id: int):

        now_ts = time.time()

        last_run_at = PERIODIC_ARCHIVE_LAST_RUN_AT.get(video_id, 0.0)

        if now_ts - last_run_at < 60:

            return

        PERIODIC_ARCHIVE_LAST_RUN_AT[video_id] = now_ts



        now = datetime.now()

        current_slot_start = self._floor_to_archive_slot(now)

        lookback_start = current_slot_start - timedelta(hours=PLAYBACK_ARCHIVE_LOOKBACK_HOURS)



        record_root = self._get_record_root()

        device_root = os.path.join(record_root, str(video_id))

        if not os.path.isdir(device_root):

            return



        periodic_slots: set[datetime] = set()

        for seg_path in glob.glob(os.path.join(device_root, "*.mp4")):

            seg_start = self._parse_segment_start(seg_path)

            if not seg_start:

                continue

            slot_start = self._floor_to_archive_slot(seg_start)

            if slot_start < lookback_start or slot_start >= current_slot_start:

                continue

            periodic_slots.add(slot_start)



        if not periodic_slots:

            return



        output_root = self._get_playback_video_root()

        for slot_start in sorted(periodic_slots):

            slot_end = slot_start + timedelta(hours=PLAYBACK_ARCHIVE_WINDOW_HOURS)

            existing_pattern = os.path.join(

                output_root,

                f"periodic_{PLAYBACK_ARCHIVE_WINDOW_HOURS}h_{slot_start.strftime('%Y%m%d_%H%M%S')}_{video_id}_{slot_start.strftime('%Y%m%d_%H%M%S')}_{slot_end.strftime('%Y%m%d_%H%M%S')}.mp4",

            )

            if os.path.exists(existing_pattern):

                continue



            try:

                self.save_playback_clip(

                    video_id,

                    slot_start,

                    slot_end,

                    output_type="playback",

                    filename_prefix=f"periodic_{PLAYBACK_ARCHIVE_WINDOW_HOURS}h_{slot_start.strftime('%Y%m%d_%H%M%S')}",

                )

            except Exception as e:

                logger.debug(

                    "periodic archive skip video_id=%s slot=%s reason=%s",

                    video_id,

                    slot_start.strftime("%Y-%m-%d %H:%M:%S"),

                    str(e),

                )



    def list_recording_segments(self, video_id: int, limit: int = 72):
        started_at = time.time()
        started_text = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        bounded_limit = max(1, min(int(limit or 72), 720))
        logger.info(
            "recordings list service start video_id=%s limit=%s bounded_limit=%s started_at=%s",
            video_id,
            limit,
            bounded_limit,
            started_text,
        )
        self._auto_archive_periodic_playback(video_id)
        seen = set()
        segments = []
        scanned_files = 0
        candidate_files: list[tuple[str, str]] = []

        for record_root in self._get_all_record_roots():
            device_root = os.path.join(record_root, str(video_id))
            logger.info("recordings list directory video_id=%s path=%s", video_id, device_root)
            if not os.path.isdir(device_root):
                logger.info("recordings list directory missing video_id=%s path=%s", video_id, device_root)
                continue

            files = sorted(glob.glob(os.path.join(device_root, "*.mp4")), reverse=True)
            scanned_files += len(files)
            logger.info(
                "recordings list directory scanned video_id=%s path=%s file_count=%s",
                video_id,
                device_root,
                len(files),
            )

            for seg_path in files:
                seg_filename = os.path.basename(seg_path)

                if seg_filename in seen:

                    continue
                seen.add(seg_filename)
                candidate_files.append((record_root, seg_path))
                if len(candidate_files) >= bounded_limit:
                    break

            if len(candidate_files) >= bounded_limit:
                break

        logger.info(
            "recordings list scan summary video_id=%s scanned_file_count=%s candidate_count=%s",
            video_id,
            scanned_files,
            len(candidate_files),
        )

        if not candidate_files:
            logger.info(
                "recordings list service done video_id=%s count=0 total_elapsed_ms=%.2f",
                video_id,
                (time.time() - started_at) * 1000,
            )
            return []

        for processed_count, (record_root, seg_path) in enumerate(candidate_files):
            if time.time() - started_at > RECORDING_LIST_MAX_SECONDS:
                logger.warning(
                    "recordings list time budget exceeded video_id=%s max_seconds=%.1f processed_count=%s result_count=%s",
                    video_id,
                    RECORDING_LIST_MAX_SECONDS,
                    processed_count,
                    len(segments),
                )
                break

            file_started_at = time.time()
            trace: dict[str, Any] = {}
            seg_filename = os.path.basename(seg_path)
            try:
                seg_start = self._parse_segment_start(seg_path)

                if not seg_start:
                    logger.info(
                        "recordings list file skipped video_id=%s file=%s elapsed_ms=%.2f ffprobe_called=%s reason=parse_start_failed",
                        video_id,
                        seg_path,
                        (time.time() - file_started_at) * 1000,
                        trace.get("ffprobe_called", False),
                    )
                    continue

                ok, duration_seconds, reason = self._validate_recording_segment(
                    seg_path,
                    probe_timeout_seconds=RECORDING_LIST_FFPROBE_TIMEOUT_SECONDS,
                    check_decode=False,
                    trace=trace,
                )
                if not ok or not duration_seconds:
                    logger.info(
                        "recordings list file skipped video_id=%s file=%s elapsed_ms=%.2f ffprobe_called=%s reason=%s",
                        video_id,
                        seg_path,
                        (time.time() - file_started_at) * 1000,
                        trace.get("ffprobe_called", False),
                        reason,
                    )
                    continue



                seg_end = self._get_segment_end(seg_path, seg_start)

                segments.append({

                    "name": seg_filename,

                    "start_time": seg_start.strftime("%Y-%m-%d %H:%M:%S"),

                    "end_time": seg_end.strftime("%Y-%m-%d %H:%M:%S"),

                    "duration_seconds": int(max(1, (seg_end - seg_start).total_seconds())),

                    "size_bytes": int(os.path.getsize(seg_path)),

                    "web_path": self._to_static_web_path(seg_path),

                    "source": os.path.basename(os.path.dirname(record_root))

                })
                logger.info(
                    "recordings list file processed video_id=%s file=%s elapsed_ms=%.2f ffprobe_called=%s duration_seconds=%s",
                    video_id,
                    seg_path,
                    (time.time() - file_started_at) * 1000,
                    trace.get("ffprobe_called", False),
                    int(duration_seconds),
                )
            except Exception as exc:
                logger.warning(
                    "recordings list file skipped video_id=%s file=%s elapsed_ms=%.2f ffprobe_called=%s reason=exception:%s",
                    video_id,
                    seg_path,
                    (time.time() - file_started_at) * 1000,
                    trace.get("ffprobe_called", False),
                    exc,
                )

        logger.info(
            "recordings list service done video_id=%s count=%s scanned_file_count=%s total_elapsed_ms=%.2f",
            video_id,
            len(segments),
            scanned_files,
            (time.time() - started_at) * 1000,
        )
        return segments



    def save_playback_clip(self, video_id: int, start_time: datetime | str, end_time: datetime | str,

                           output_type: str = "playback", filename_prefix: Optional[str] = None):

        start_dt = self._parse_datetime_input(start_time)

        end_dt = self._parse_datetime_input(end_time)

        if end_dt <= start_dt:

            raise ValueError("End time must be later than start time")



        segments = self._collect_segments_for_timerange(
            video_id,
            start_dt,
            end_dt,
            strict_validation=output_type == "alarm",
            include_temp_buffer=output_type == "alarm",
        )

        if not segments:
            diagnostic = self._summarize_segment_collection_failure(video_id, start_dt, end_dt)
            raise ValueError(
                "no_video_segment: selected time range has no usable recording segments; "
                f"video_id={video_id}; start={start_dt}; end={end_dt}; scan={diagnostic}"
            )

            raise ValueError("閹碘偓闁妞傞梻瀛橆唽濞屸剝婀侀崣顖滄暏瑜版洖鍎氶崚鍡橆唽")



        if output_type == "alarm":

            output_root = self._get_alarm_video_root()

        elif output_type == "temp":

            output_root = self._get_temp_playback_root()

        else:

            output_root = self._get_playback_video_root()

        os.makedirs(output_root, exist_ok=True)



        ffmpeg_path = self._get_ffmpeg_path()

        if not os.path.exists(ffmpeg_path):
            raise ValueError(f"video_failed: ffmpeg not found: {ffmpeg_path}")

            raise ValueError(f"閺堫亝澹?ffmpeg: {ffmpeg_path}")



        first_seg_start = segments[0][1]

        concat_list_path = os.path.join(output_root, f"_concat_{video_id}_{uuid.uuid4().hex}.txt")

        concat_output_path = os.path.join(output_root, f"_concat_{video_id}_{uuid.uuid4().hex}.mp4")



        safe_prefix = (filename_prefix or "playback").replace(" ", "_")

        final_name = f"{safe_prefix}_{video_id}_{start_dt.strftime('%Y%m%d_%H%M%S')}_{end_dt.strftime('%Y%m%d_%H%M%S')}.mp4"

        final_output_path = os.path.join(output_root, final_name)



        try:
            alarm_ffmpeg_timeout = ALARM_VIDEO_FFMPEG_TIMEOUT_SECONDS if output_type == "alarm" else None

            def _run_clip_ffmpeg(cmd: list[str], step_name: str):
                try:
                    return subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                        timeout=alarm_ffmpeg_timeout,
                    )
                except subprocess.TimeoutExpired as exc:
                    timeout_seconds = alarm_ffmpeg_timeout or 0
                    logger.error(
                        "Alarm video ffmpeg timeout video_id=%s step=%s timeout_seconds=%.1f start=%s end=%s",
                        video_id,
                        step_name,
                        timeout_seconds,
                        start_dt,
                        end_dt,
                    )
                    raise TimeoutError(
                        f"alarm video generation timeout: ffmpeg {step_name} exceeded {timeout_seconds:.0f}s"
                    ) from exc

            with open(concat_list_path, "w", encoding="utf-8") as f:

                for seg_path, _, _ in segments:

                    safe_seg_path = seg_path.replace("\\", "/").replace("'", "\\'")

                    f.write(f"file '{safe_seg_path}'\n")



            if output_type == "alarm":
                concat_cmd = [
                    ffmpeg_path,
                    "-y",
                    "-fflags", "+genpts",
                    "-f", "concat",
                    "-safe", "0",
                    "-i", concat_list_path,
                    "-c:v", "libx264",
                    "-preset", "ultrafast",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-movflags", "+faststart",
                    concat_output_path,
                ]
            else:
                concat_cmd = [

                    ffmpeg_path,

                    "-y",

                    "-f", "concat",

                    "-safe", "0",

                    "-i", concat_list_path,

                    "-c", "copy",

                    concat_output_path,

                ]

            concat_proc = _run_clip_ffmpeg(concat_cmd, "concat")

            if concat_proc.returncode != 0:

                concat_fallback_cmd = [

                    ffmpeg_path,

                    "-y",

                    "-f", "concat",

                    "-safe", "0",

                    "-i", concat_list_path,

                    "-c:v", "libx264",

                    "-preset", "ultrafast",

                    "-c:a", "aac",

                    concat_output_path,

                ]

                concat_fallback_proc = _run_clip_ffmpeg(concat_fallback_cmd, "concat fallback")

                if concat_fallback_proc.returncode != 0:
                    raise ValueError("video_failed: ffmpeg concat failed")

                    logger.error(

                        "Concat failed video_id=%s start=%s end=%s copy_err=%s reencode_err=%s",

                        video_id,

                        start_dt,

                        end_dt,

                        (concat_proc.stderr or "").strip()[-1200:],

                        (concat_fallback_proc.stderr or "").strip()[-1200:],

                    )

                    raise ValueError("瑜版洖鍎氶崚鍡橆唽閸氬牆鑻熸径杈Е")



            clip_offset = max(0.0, (start_dt - first_seg_start).total_seconds())

            clip_duration = max(1.0, (end_dt - start_dt).total_seconds())

            if output_type == "alarm":
                trim_cmd = [
                    ffmpeg_path,
                    "-y",
                    "-ss", f"{clip_offset:.3f}",
                    "-i", concat_output_path,
                    "-t", f"{clip_duration:.3f}",
                    "-c:v", "libx264",
                    "-preset", "ultrafast",
                    "-pix_fmt", "yuv420p",
                    "-force_key_frames", "expr:gte(t,n_forced*2)",
                    "-c:a", "aac",
                    "-movflags", "+faststart",
                    final_output_path,
                ]
            else:
                trim_cmd = [
                    ffmpeg_path,
                    "-y",
                    "-ss", f"{clip_offset:.3f}",
                    "-i", concat_output_path,
                    "-t", f"{clip_duration:.3f}",
                    "-c", "copy",
                    final_output_path,
                ]
            trim_proc = _run_clip_ffmpeg(trim_cmd, "trim")
            if trim_proc.returncode != 0:

                trim_fallback_cmd = [

                    ffmpeg_path,

                    "-y",

                    "-ss", f"{clip_offset:.3f}",

                    "-i", concat_output_path,

                    "-t", f"{clip_duration:.3f}",

                    "-c:v", "libx264",

                    "-preset", "ultrafast",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-movflags", "+faststart",
                    final_output_path,

                ]

                trim_fallback_proc = _run_clip_ffmpeg(trim_fallback_cmd, "trim fallback")

                if trim_fallback_proc.returncode != 0:
                    raise ValueError("video_failed: ffmpeg trim failed")



            if not os.path.exists(final_output_path):
                raise ValueError("video_failed: generated video file missing")
            final_size = os.path.getsize(final_output_path)
            if final_size < 64 * 1024:
                try:
                    os.remove(final_output_path)
                except Exception:
                    pass
                raise ValueError(f"video_failed: generated video file too small: {final_size}")

            actual_duration = self._probe_video_duration(final_output_path, timeout_seconds=8.0)
            if output_type == "alarm":
                valid_final, validated_duration, invalid_reason = self._validate_recording_segment(
                    final_output_path,
                    min_age_seconds=0,
                    probe_timeout_seconds=8.0,
                    check_decode=True,
                )
                if not valid_final:
                    try:
                        os.remove(final_output_path)
                    except Exception:
                        pass
                    raise ValueError(f"video_failed: generated alarm video invalid: {invalid_reason}")
                actual_duration = validated_duration or actual_duration
            elif actual_duration is None:
                raise ValueError("video_failed: generated video duration unreadable")

            expected_duration = clip_duration
            if output_type == "alarm" and actual_duration is not None and actual_duration < expected_duration:
                logger.warning(
                    "Alarm video shorter than target window video_id=%s actual_duration=%.2f expected_duration=%.2f start=%s end=%s",
                    video_id,
                    actual_duration,
                    expected_duration,
                    start_dt,
                    end_dt,
                )



            if output_type == "alarm":

                mirror_subdir = self._folder("alarm_videos")

                primary_root = self._get_alarm_video_root()

            elif output_type == "temp":

                mirror_subdir = os.path.join(self._folder("playback_videos"), self._folder("temp_cache"))

                primary_root = self._get_temp_playback_root()

            else:

                mirror_subdir = self._folder("playback_videos")

                primary_root = self._get_playback_video_root()



            rel_path = os.path.relpath(final_output_path, primary_root)

            mirror_rel_path = os.path.join(mirror_subdir, rel_path)

            self._mirror_write_file(final_output_path, mirror_rel_path)



            duration_value = float(actual_duration) if actual_duration else float((end_dt - start_dt).total_seconds())
            actual_start_dt = first_seg_start + timedelta(seconds=clip_offset)
            actual_end_dt = actual_start_dt + timedelta(seconds=duration_value)

            return {

                "status": "success",

                "video_id": video_id,

                "start_time": actual_start_dt.strftime("%Y-%m-%d %H:%M:%S"),

                "end_time": actual_end_dt.strftime("%Y-%m-%d %H:%M:%S"),

                "requested_start_time": start_dt.strftime("%Y-%m-%d %H:%M:%S"),

                "requested_end_time": end_dt.strftime("%Y-%m-%d %H:%M:%S"),

                "expected_duration": float(expected_duration),

                "actual_duration": duration_value,

                "duration_seconds": duration_value,

                "recording_path": self._to_static_web_path(final_output_path),

                "recording_full_path": final_output_path,

            }

        finally:

            for temp_file in [concat_list_path, concat_output_path]:

                try:

                    if os.path.exists(temp_file):

                        os.remove(temp_file)

                except Exception:

                    pass



    def save_temp_cache_until_now(self, video_id: int):

        now = datetime.now().replace(microsecond=0)

        current_slot_start = self._floor_to_archive_slot(now)



        if now <= current_slot_start:

            start_dt = current_slot_start - timedelta(hours=PLAYBACK_ARCHIVE_WINDOW_HOURS)

        else:

            start_dt = current_slot_start



        if now <= start_dt:

            raise ValueError("瑜版挸澧犻弮鍫曟？缁愭褰涢弮鐘插讲缂傛挸鐡ㄩ崘鍛啇")



        # 閼汇儱缍嬮崜宥囩崶閸欙絽鑻熼棃鐐扮矤鐠ч鍋ｇ亸鍗炵磻婵婀侀崚鍡橆唽(娓氬顩ч張宥呭閸掓碍浠径?,閸忎浇顔忔禒搴ｇ崶閸欙絽鍞撮張鈧弮鈺佸讲閻劌鍨庡▓闈涚磻婵鏁撻幋?

        available_segments = self._collect_segments_for_timerange(video_id, start_dt, now)

        if not available_segments:

            raise ValueError("瑜版挸澧犻弮鍫曟？缁愭褰涢弮鐘插讲缂傛挸鐡ㄩ崘鍛啇")

        effective_start_dt = max(start_dt, available_segments[0][1])



        result = self.save_playback_clip(

            video_id,

            effective_start_dt,

            now,

            output_type="temp",

            filename_prefix=f"tempcache_{effective_start_dt.strftime('%Y%m%d_%H%M%S')}",

        )

        self._prune_temp_cache_videos(video_id, keep_latest=3)

        result["cache_window_start"] = effective_start_dt.strftime("%Y-%m-%d %H:%M:%S")

        result["cache_window_end"] = now.strftime("%Y-%m-%d %H:%M:%S")

        result["archive_window_hours"] = PLAYBACK_ARCHIVE_WINDOW_HOURS

        return result



    def _prune_temp_cache_videos(self, video_id: int, keep_latest: int = 3):

        # Keep only the latest temporary cache videos per device.

        keep_latest = max(1, int(keep_latest))

        temp_root = self._get_temp_playback_root()

        if not os.path.isdir(temp_root):

            return



        matched_files: list[tuple[float, str]] = []

        pattern = os.path.join(temp_root, "*.mp4")

        for file_path in glob.glob(pattern):

            file_name = os.path.basename(file_path)

            if f"_{video_id}_" not in file_name and not file_name.startswith(f"{video_id}_"):

                continue

            try:

                mtime = os.path.getmtime(file_path)

                matched_files.append((mtime, file_path))

            except Exception:

                continue



        if len(matched_files) <= keep_latest:

            return



        matched_files.sort(key=lambda item: item[0], reverse=True)

        stale_files = matched_files[keep_latest:]



        for _, stale_path in stale_files:

            try:

                if os.path.exists(stale_path):

                    os.remove(stale_path)

            except Exception as e:

                logger.warning(f"Failed to prune temp cache file: {stale_path}, reason: {e}")



    def _parse_alarm_event_time(self, file_name: str) -> Optional[str]:
        match = re.search(r"(20\d{6})_(\d{6})", file_name)
        if match:
            try:
                event_dt = datetime.strptime("".join(match.groups()), "%Y%m%d%H%M%S")
                return event_dt.strftime("%Y-%m-%d %H:%M:%S")
            except ValueError:
                pass

        epoch_match = re.search(r"_(\d{10})(?:_|\\.)", file_name)
        if not epoch_match:
            return None

        try:
            event_dt = datetime.fromtimestamp(int(epoch_match.group(1)))
            return event_dt.strftime("%Y-%m-%d %H:%M:%S")
        except (OSError, ValueError):
            return None

    def _list_saved_videos(self, root_dir: str, video_id: int, limit: int = 120) -> list[dict]:

        if not os.path.isdir(root_dir):

            return []



        clips: list[dict] = []

        alarm_name_pattern = re.compile(
            r"^alarm_(?P<alarm_id>[^_]+)_(?P<device_id>[^_]+)_",
            re.IGNORECASE,
        )

        for file_path in sorted(glob.glob(os.path.join(root_dir, "**", "*.mp4"), recursive=True), reverse=True):

            file_name = os.path.basename(file_path)

            if f"_{video_id}_" not in file_name and not file_name.startswith(f"{video_id}_"):

                continue



            try:

                stat = os.stat(file_path)

                event_at = self._parse_alarm_event_time(file_name)
                alarm_match = alarm_name_pattern.match(file_name)
                alarm_doc = None
                try:
                    alarm_doc = get_mongo_collection("alarm_record").find_one(
                        {"recording_path": {"$regex": re.escape(file_name)}},
                        {"_id": 0},
                    )
                except Exception:
                    alarm_doc = None

                recording_start_time = alarm_doc.get("recording_start_time") if alarm_doc else None
                recording_end_time = alarm_doc.get("recording_end_time") if alarm_doc else None
                alarm_image_path = alarm_doc.get("alarm_image_path") if alarm_doc else ""
                alarm_time = (
                    alarm_doc.get("alarm_time")
                    or alarm_doc.get("timestamp")
                    or alarm_doc.get("created_at")
                    if alarm_doc
                    else None
                )
                if not alarm_time and alarm_image_path:
                    alarm_time = self._parse_alarm_event_time(os.path.basename(str(alarm_image_path)))

                clips.append(

                    {

                        "name": file_name,
                        "alarm_id": alarm_doc.get("id") if alarm_doc else (alarm_match.group("alarm_id") if alarm_match else ""),
                        "device_id": str(alarm_doc.get("device_id") if alarm_doc else (alarm_match.group("device_id") if alarm_match else video_id)),

                        "size_bytes": int(stat.st_size),

                        "updated_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                        "event_at": event_at or datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                        "start_time": recording_start_time or event_at or datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                        "end_time": recording_end_time or "",
                        "alarm_time": alarm_time or "",
                        "alarm_image_path": alarm_image_path,

                        "web_path": self._to_backend_static_web_path(file_path),

                    }

                )

            except Exception:

                continue



            if len(clips) >= max(1, min(limit, 500)):

                break



        return clips



    def list_saved_playback_videos(self, video_id: int, limit: int = 120) -> list[dict]:

        return self._list_saved_videos(self._get_playback_video_root(), video_id, limit)



    def list_saved_alarm_videos(self, video_id: int, limit: int = 120) -> list[dict]:

        return self.list_alarm_videos_direct(video_id, limit=limit, sort_order="desc")



    def list_temp_cache_videos(self, video_id: int, limit: int = 30) -> list[dict]:

        return self._list_saved_videos(self._get_temp_playback_root(), video_id, limit)



    def _get_alarm_screenshot_root(self) -> str:

        # Return alarm screenshot root.

        return self._get_default_static_subdir(self._folder("alarm_screenshots"))



    def _get_alarm_screenshot_roots(self) -> list[str]:

        roots = []

        for storage_root in self._get_enabled_local_storage_roots():

            for subdir in ("alarms", self._folder("alarm_screenshots")):

                root = os.path.join(storage_root, subdir)

                os.makedirs(root, exist_ok=True)

                roots.append(root)

        return list(dict.fromkeys(roots))



    def list_recording_videos_direct(self, video_id: int, limit: int = 120, sort_order: str = "desc") -> list[dict]:

        # List recorded video clips directly from storage.

        self._refresh_storage_paths()



        clips: list[dict] = []

        sort_reverse = sort_order.lower() == "desc"



        file_paths = []

        for record_root in self._get_all_record_roots():

            device_root = os.path.join(record_root, str(video_id))

            if os.path.isdir(device_root):

                file_paths.extend(glob.glob(os.path.join(device_root, "*.mp4")))



        for file_path in sorted(set(file_paths), reverse=sort_reverse):

            file_name = os.path.basename(file_path)

            

            try:

                if not self._is_segment_usable(file_path):

                    continue



                stat = os.stat(file_path)

                seg_start = self._parse_segment_start(file_path)

                updated_at = datetime.fromtimestamp(stat.st_mtime)

                if seg_start:

                    start_at = seg_start
                    end_at = self._get_segment_end(file_path, seg_start)
                else:
                    duration_seconds = self._probe_segment_duration_seconds(file_path) or RECORD_SEGMENT_SECONDS
                    start_at = updated_at - timedelta(seconds=duration_seconds)
                    end_at = updated_at

                duration_seconds = max(1, int(round((end_at - start_at).total_seconds())))



                clips.append({

                    "name": file_name,

                    "size_bytes": int(stat.st_size),

                    "start_time": start_at.strftime("%Y-%m-%d %H:%M:%S"),

                    "end_time": end_at.strftime("%Y-%m-%d %H:%M:%S"),

                    "created_at": updated_at.strftime("%Y-%m-%d %H:%M:%S"),

                    "updated_at": updated_at.strftime("%Y-%m-%d %H:%M:%S"),

                    "duration_seconds": duration_seconds,

                    "web_path": self._to_backend_static_web_path(file_path),

                    "thumbnail_path": self._to_backend_static_web_path(thumbnail_path) if (thumbnail_path := self._get_recording_thumbnail_path(file_path)) else "",

                    "duration_text": self._format_bytes(stat.st_size) if stat.st_size < 1024*1024 else f"{stat.st_size/(1024*1024):.2f}MB",

                })

            except Exception:

                continue



            if len(clips) >= max(1, min(limit, 500)):

                break



        return clips

    def _resolve_recording_web_path(self, video_id: int, web_path: str) -> str:
        raw = str(web_path or "").strip()
        if not raw:
            raise ValueError("web_path is empty")

        parsed = urlparse(raw)
        path = parsed.path or raw
        path = path.replace("\\", "/")
        filename = os.path.basename(path)
        if not filename.lower().endswith(".mp4"):
            raise ValueError("recording file must be an mp4")
        if ".boxed." in filename:
            raise ValueError("source recording is already boxed")

        candidates = []
        if os.path.isabs(raw) and os.path.isfile(raw):
            candidates.append(raw)

        static_prefix = "/static/"
        if path.startswith(static_prefix):
            rel = path[len(static_prefix):].lstrip("/")
            candidates.append(os.path.join(self._get_default_static_root(), rel.replace("/", os.sep)))

        api_prefix_map = {
            "/api/videos/": self._folder("recordings"),
            "/api/playback_videos/": self._folder("playback_videos"),
        }
        for prefix, folder in api_prefix_map.items():
            if path.startswith(prefix):
                rel = path[len(prefix):].lstrip("/")
                for root in self._get_enabled_local_storage_roots():
                    candidates.append(os.path.join(root, folder, rel.replace("/", os.sep)))

        for record_root in self._get_all_record_roots():
            candidates.append(os.path.join(record_root, str(video_id), filename))

        allowed_roots = [os.path.abspath(os.path.join(root, self._folder("recordings"))) for root in self._get_enabled_local_storage_roots()]
        allowed_roots.append(os.path.abspath(self._get_default_static_subdir(self._folder("recordings"))))

        for candidate in candidates:
            abs_candidate = os.path.abspath(candidate)
            if not os.path.isfile(abs_candidate):
                continue
            if not any(abs_candidate == root or abs_candidate.startswith(root + os.sep) for root in allowed_roots):
                continue
            if os.path.basename(os.path.dirname(abs_candidate)) != str(video_id):
                continue
            return abs_candidate

        raise FileNotFoundError(f"recording not found for video_id={video_id}: {web_path}")

    def _draw_person_detections_on_frame(self, frame, detections):
        boxes = []
        frame_h, frame_w = frame.shape[:2]
        for det in detections or []:
            bbox = det.get("bbox") or det.get("coords") or []
            if len(bbox) < 4:
                continue
            try:
                x1, y1, x2, y2 = [float(v) for v in bbox[:4]]
                confidence = float(det.get("confidence", 0.0) or 0.0)
            except Exception:
                continue
            boxes.append({
                "coords": [
                    int(max(0, min(frame_w - 1, x1))),
                    int(max(0, min(frame_h - 1, y1))),
                    int(max(0, min(frame_w - 1, x2))),
                    int(max(0, min(frame_h - 1, y2))),
                ],
                "frame_width": frame_w,
                "frame_height": frame_h,
                "label": f"person {confidence:.2f}",
                "alarm_type": "person",
            })

        if not boxes:
            return frame

        from app.services.ai_manager import ai_manager
        return ai_manager._draw_boxes_on_frame(frame, boxes)

    def generate_boxed_recording_video(
        self,
        video_id: int,
        web_path: str,
        algorithm: str = "person",
        frame_stride: int = 5,
        force: bool = False,
    ) -> dict:
        source_path = self._resolve_recording_web_path(video_id, web_path)
        if not self._is_segment_usable(source_path, min_age_seconds=1, allow_probe_fallback=True):
            raise ValueError("recording segment is not ready")

        base, ext = os.path.splitext(source_path)
        output_path = f"{base}.boxed{ext or '.mp4'}"
        if os.path.isfile(output_path) and not force and os.path.getmtime(output_path) >= os.path.getmtime(source_path):
            return {
                "source_path": self._to_backend_static_web_path(source_path),
                "boxed_path": self._to_backend_static_web_path(output_path),
                "cached": True,
            }

        stride = max(1, int(frame_stride or 1))
        cap = cv2.VideoCapture(source_path)
        if not cap.isOpened():
            raise ValueError("cannot open source recording")

        raw_tmp_path = f"{output_path}.raw.tmp.mp4"
        h264_tmp_path = f"{output_path}.h264.tmp.mp4"
        writer = None
        frames = 0
        detected_frames = 0
        started_at = time.time()
        last_detections = []
        try:
            fps = cap.get(cv2.CAP_PROP_FPS) or 25
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
            if width <= 0 or height <= 0:
                raise ValueError("invalid recording dimensions")

            writer = cv2.VideoWriter(raw_tmp_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
            if not writer.isOpened():
                raise ValueError("cannot open boxed temp writer")

            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if frames % stride == 0:
                    result = detect_frame(algorithm, frame, conf=float(os.getenv("BOXED_RECORDING_PERSON_CONF", "0.35")))
                    last_detections = result.get("detections") if isinstance(result, dict) else []
                    detected_frames += 1
                frame = self._draw_person_detections_on_frame(frame, last_detections)
                writer.write(frame)
                frames += 1

            if frames <= 0:
                raise ValueError("no frames written")

            writer.release()
            writer = None
            cap.release()

            ffmpeg_path = self._get_ffmpeg_path()
            transcode_cmd = [
                ffmpeg_path,
                "-y",
                "-i", raw_tmp_path,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-an",
                h264_tmp_path,
            ]
            transcode = subprocess.run(
                transcode_cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=float(os.getenv("BOXED_RECORDING_TRANSCODE_TIMEOUT_SECONDS", "300")),
            )
            if transcode.returncode != 0:
                raise ValueError(f"boxed recording transcode failed: {(transcode.stderr or '').strip()[-1000:]}")
            os.replace(h264_tmp_path, output_path)
            try:
                os.remove(raw_tmp_path)
            except Exception:
                pass
            try:
                self._mirror_write_file(
                    output_path,
                    os.path.relpath(output_path, self._get_storage_root()),
                )
            except Exception:
                pass

            return {
                "source_path": self._to_backend_static_web_path(source_path),
                "boxed_path": self._to_backend_static_web_path(output_path),
                "cached": False,
                "frames": frames,
                "detected_frames": detected_frames,
                "elapsed_ms": int((time.time() - started_at) * 1000),
            }
        finally:
            try:
                if writer is not None:
                    writer.release()
                if cap is not None:
                    cap.release()
                for temp_path in (raw_tmp_path, h264_tmp_path):
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
            except Exception:
                pass

    @staticmethod
    def _playback_text(value: Any) -> str:
        return str(value or "").strip()

    @staticmethod
    def _parse_playback_filter_time(value: Optional[str]) -> Optional[datetime]:
        raw = str(value or "").strip()
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None

    def _build_playback_file_index(self) -> tuple[list[dict], list[dict]]:
        now = time.time()
        cached = self._playback_index_cache
        if now < float(cached.get("expires_at") or 0):
            return cached["recordings"], cached["alarms"]

        with self._playback_index_lock:
            cached = self._playback_index_cache
            if now < float(cached.get("expires_at") or 0):
                return cached["recordings"], cached["alarms"]

            recordings: list[dict] = []
            alarms: list[dict] = []
            segment_seconds = RECORD_SEGMENT_SECONDS

            for root in self._get_all_record_roots():
                if not os.path.isdir(root):
                    continue
                for device_entry in os.scandir(root):
                    if not device_entry.is_dir():
                        continue
                    device_id = device_entry.name
                    try:
                        entries = os.scandir(device_entry.path)
                    except OSError:
                        continue
                    with entries:
                        video_entries = sorted(
                            [
                                entry
                                for entry in entries
                                if entry.is_file() and entry.name.lower().endswith(".mp4")
                            ],
                            key=lambda entry: entry.name,
                        )
                        for index, entry in enumerate(video_entries):
                            has_newer_segment = index < len(video_entries) - 1
                            try:
                                stat = entry.stat()
                            except OSError:
                                continue
                            if stat.st_size < 64 * 1024:
                                continue
                            if not self._is_segment_usable(
                                entry.path,
                                min_age_seconds=2,
                                has_newer_segment=has_newer_segment,
                                allow_probe_fallback=False,
                            ):
                                continue
                            started_at = self._parse_segment_start(entry.path)
                            if not started_at:
                                started_at = datetime.fromtimestamp(stat.st_mtime)
                            thumbnail_path = f"{entry.path}.jpg"
                            recordings.append({
                                "device_id": str(device_id),
                                "name": entry.name,
                                "file_path": entry.path,
                                "size_bytes": int(stat.st_size),
                                "start_at": started_at,
                                "end_at": started_at + timedelta(seconds=segment_seconds),
                                "updated_at": datetime.fromtimestamp(stat.st_mtime),
                                "web_path": self._to_backend_static_web_path(entry.path),
                                "thumbnail_path": self._to_backend_static_web_path(thumbnail_path)
                                if os.path.isfile(thumbnail_path)
                                else "",
                            })

            alarm_pattern = re.compile(
                r"^alarm_(?P<alarm_id>[^_]+)_(?P<device_id>[^_]+)_"
                r"(?P<start>\d{8}_\d{6})_(?P<end>\d{8}_\d{6})\.mp4$",
                re.IGNORECASE,
            )
            seen_alarm_paths: set[str] = set()
            for root in self._get_all_alarm_video_roots():
                if not os.path.isdir(root):
                    continue
                for dir_path, _, file_names in os.walk(root):
                    for file_name in file_names:
                        if not file_name.lower().endswith(".mp4"):
                            continue
                        file_path = os.path.join(dir_path, file_name)
                        normalized_path = os.path.normcase(os.path.abspath(file_path))
                        if normalized_path in seen_alarm_paths:
                            continue
                        seen_alarm_paths.add(normalized_path)
                        match = alarm_pattern.match(file_name)
                        if not match:
                            continue
                        try:
                            stat = os.stat(file_path)
                            started_at = datetime.strptime(match.group("start"), "%Y%m%d_%H%M%S")
                            ended_at = datetime.strptime(match.group("end"), "%Y%m%d_%H%M%S")
                        except (OSError, ValueError):
                            continue
                        alarms.append({
                            "alarm_id": match.group("alarm_id"),
                            "device_id": match.group("device_id"),
                            "name": file_name,
                            "size_bytes": int(stat.st_size),
                            "start_at": started_at,
                            "end_at": ended_at,
                            "updated_at": datetime.fromtimestamp(stat.st_mtime),
                            "web_path": self._to_backend_static_web_path(file_path),
                        })

            self._playback_index_cache = {
                "expires_at": time.time() + 10.0,
                "recordings": recordings,
                "alarms": alarms,
            }
            return recordings, alarms

    def query_playbacks(
        self,
        current_user: dict,
        media_type: str = "manual",
        page: int = 1,
        page_size: int = 40,
        device_id: Optional[str] = None,
        company: Optional[str] = None,
        project: Optional[str] = None,
        grid: Optional[str] = None,
        team: Optional[str] = None,
        keyword: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        sort_order: str = "desc",
    ) -> dict:
        docs = [self._enrich_video_org_scope(doc) for doc in self._video_collection().find({}, {"_id": 0})]
        docs = [
            doc for doc in docs
            if doc and in_scope(doc, current_user, **self._scope_kwargs())
        ]

        filters = {
            "company": self._playback_text(company),
            "project": self._playback_text(project),
            "grid": self._playback_text(grid),
            "team": self._playback_text(team),
        }
        requested_device = self._playback_text(device_id)
        keyword_text = self._playback_text(keyword).lower()

        def matches_device(doc: dict) -> bool:
            if requested_device and self._playback_text(doc.get("id")) != requested_device:
                return False
            values = {
                "company": self._playback_text(doc.get("company") or doc.get("department")),
                "project": self._playback_text(doc.get("project")),
                "grid": self._playback_text(doc.get("grid_name") or doc.get("grid")),
                "team": self._playback_text(doc.get("team_name") or doc.get("team") or doc.get("workTeam")),
            }
            if any(value and values[key] != value for key, value in filters.items()):
                return False
            if keyword_text:
                personnel_values = [
                    self._playback_text(doc.get("personnel_id")),
                    self._playback_text(doc.get("personnel_name")),
                    self._playback_text(doc.get("personName")),
                    self._playback_text(doc.get("worker_name")),
                    self._playback_text(doc.get("workerName")),
                    self._playback_text(doc.get("holder")),
                    self._playback_text(doc.get("holder_name")),
                    self._playback_text(doc.get("holderName")),
                    self._playback_text(doc.get("responsible_person")),
                    self._playback_text(doc.get("responsiblePerson")),
                    self._playback_text(doc.get("manager")),
                    self._playback_text(doc.get("contact")),
                ]
                haystack = " ".join([
                    self._playback_text(doc.get("name")),
                    self._playback_text(doc.get("id")),
                    *values.values(),
                    *personnel_values,
                ]).lower()
                if keyword_text not in haystack:
                    return False
            return True

        device_map = {
            self._playback_text(doc.get("id")): doc
            for doc in docs
            if matches_device(doc) and self._playback_text(doc.get("id"))
        }
        recordings, alarms = self._build_playback_file_index()
        source = alarms if media_type == "alarm" else recordings
        filter_start = self._parse_playback_filter_time(start_time)
        filter_end = self._parse_playback_filter_time(end_time)
        if filter_end and len(str(end_time or "").strip()) == 16:
            filter_end += timedelta(seconds=59, milliseconds=999)

        matched: list[dict] = []
        for item in source:
            doc = device_map.get(self._playback_text(item.get("device_id")))
            if not doc:
                continue
            item_start = item["start_at"]
            item_end = item["end_at"]
            if filter_start and item_end < filter_start:
                continue
            if filter_end and item_start > filter_end:
                continue
            matched.append({**item, "device": doc})

        matched.sort(key=lambda item: item["start_at"], reverse=str(sort_order or "desc").lower() != "asc")
        bounded_page_size = max(1, min(int(page_size), 100))
        bounded_page = max(1, int(page))
        total = len(matched)
        offset = (bounded_page - 1) * bounded_page_size
        page_items = matched[offset: offset + bounded_page_size]

        alarm_docs_by_id: dict[str, dict] = {}
        if media_type == "alarm":
            alarm_ids = {
                self._playback_text(item.get("alarm_id"))
                for item in page_items
                if self._playback_text(item.get("alarm_id"))
            }
            query_ids: list[Any] = []
            for alarm_id in alarm_ids:
                query_ids.append(alarm_id)
                if alarm_id.isdigit():
                    query_ids.append(int(alarm_id))
            if query_ids:
                try:
                    for alarm_doc in self._alarm_collection().find({"id": {"$in": query_ids}}, {"_id": 0}):
                        key = self._playback_text(alarm_doc.get("id"))
                        if key:
                            alarm_docs_by_id[key] = alarm_doc
                except Exception as exc:
                    logger.warning(f"Failed to merge alarm metadata for playbacks: {exc}")

        result_items = []
        for item in page_items:
            doc = item["device"]
            duration_seconds = max(1, int((item["end_at"] - item["start_at"]).total_seconds()))
            alarm_doc = alarm_docs_by_id.get(self._playback_text(item.get("alarm_id")), {})
            thumbnail_path = item.get("thumbnail_path") or ""
            if media_type != "alarm" and not thumbnail_path and item.get("file_path"):
                generated_thumbnail = self._get_recording_thumbnail_path(str(item.get("file_path")))
                if generated_thumbnail:
                    thumbnail_path = self._to_backend_static_web_path(generated_thumbnail)
            alarm_image_path = (
                alarm_doc.get("alarm_image_path")
                or alarm_doc.get("screenshot_path")
                or alarm_doc.get("thumbnail_path")
                or thumbnail_path
                or ""
            )
            result_item = {
                "alarm_id": item.get("alarm_id"),
                "device_id": self._playback_text(doc.get("id")),
                "device_name": doc.get("name") or "",
                "company": doc.get("company") or doc.get("department") or "",
                "project": doc.get("project") or "",
                "project_id": doc.get("project_id") or "",
                "grid": doc.get("grid_name") or doc.get("grid") or "",
                "grid_id": doc.get("grid_id") or "",
                "team": doc.get("team_name") or doc.get("team") or doc.get("workTeam") or "",
                "team_id": doc.get("team_id") or "",
                "name": item["name"],
                "size_bytes": item["size_bytes"],
                "duration_seconds": duration_seconds,
                "start_time": item["start_at"].strftime("%Y-%m-%d %H:%M:%S"),
                "end_time": item["end_at"].strftime("%Y-%m-%d %H:%M:%S"),
                "created_at": item["updated_at"].strftime("%Y-%m-%d %H:%M:%S"),
                "updated_at": item["updated_at"].strftime("%Y-%m-%d %H:%M:%S"),
                "web_path": item["web_path"],
                "thumbnail_path": thumbnail_path,
            }
            if media_type == "alarm":
                result_item.update({
                    "alarm_type": alarm_doc.get("alarm_type") or "",
                    "description": alarm_doc.get("description") or "",
                    "alarm_image_path": alarm_image_path,
                    "screenshot_path": alarm_doc.get("screenshot_path") or alarm_image_path,
                    "image_url": alarm_image_path,
                    "snapshot_url": alarm_image_path,
                    "picture_url": alarm_image_path,
                    "recording_status": alarm_doc.get("recording_status") or "",
                    "recording_error": alarm_doc.get("recording_error") or "",
                    "alarm_second": alarm_doc.get("alarm_second") or item.get("alarm_second") or 30,
                })
            result_items.append(result_item)

        return {
            "code": 0,
            "data": result_items,
            "total": total,
            "page": bounded_page,
            "page_size": bounded_page_size,
            "total_pages": (total + bounded_page_size - 1) // bounded_page_size,
        }



    def list_alarm_videos_direct(self, video_id: int, limit: int = 120, sort_order: str = "desc") -> list[dict]:

        # List alarm video clips directly from storage.

        self._refresh_storage_paths()
        max_limit = max(1, min(limit, 500))
        sort_reverse = sort_order.lower() != "asc"
        video_id_values = [str(video_id), video_id]

        def _stringify_dt(value):
            if isinstance(value, datetime):
                return value.strftime("%Y-%m-%d %H:%M:%S")
            if value is None:
                return ""
            return str(value)

        def _path_name(value: str) -> str:
            if not value:
                return ""
            parsed = urlparse(str(value))
            path = parsed.path or str(value)
            return os.path.basename(path.replace("\\", "/"))

        record_clips: list[dict] = []
        try:
            cursor = self._alarm_collection().find({
                "device_id": {"$in": video_id_values},
                "recording_path": {"$nin": [None, ""]},
            }).sort("timestamp", -1 if sort_reverse else 1).limit(max_limit)
            for doc in cursor:
                recording_path = doc.get("recording_path") or doc.get("web_path") or doc.get("url") or ""
                if not recording_path:
                    continue

                timestamp = doc.get("timestamp") or doc.get("created_at") or doc.get("updated_at")
                updated_at = _stringify_dt(timestamp)
                alarm_image_path = (
                    doc.get("alarm_image_path")
                    or doc.get("screenshot_path")
                    or doc.get("thumbnail_path")
                    or ""
                )
                name = _path_name(recording_path) or f"alarm_{doc.get('id') or doc.get('_id')}.mp4"

                record_clips.append({
                    "alarm_id": doc.get("id"),
                    "device_id": str(doc.get("device_id") or video_id),
                    "device_name": doc.get("device_name") or "",
                    "name": name,
                    "size_bytes": int(doc.get("size_bytes") or 0),
                    "duration_seconds": int(doc.get("duration_seconds") or 60),
                    "alarm_second": int(doc.get("alarm_second") or 30),
                    "updated_at": updated_at,
                    "start_time": _stringify_dt(doc.get("recording_start_time") or doc.get("start_time") or timestamp),
                    "end_time": _stringify_dt(doc.get("recording_end_time") or doc.get("end_time") or timestamp),
                    "web_path": recording_path,
                    "recording_path": recording_path,
                    "url": recording_path,
                    "alarm_image_path": alarm_image_path,
                    "screenshot_path": doc.get("screenshot_path") or alarm_image_path,
                    "thumbnail_path": doc.get("thumbnail_path") or alarm_image_path,
                    "alarm_type": doc.get("alarm_type") or "",
                    "description": doc.get("description") or "",
                    "recording_status": doc.get("recording_status") or "",
                })
        except Exception as exc:
            logger.warning(f"Failed to list alarm videos from alarm_record, fallback to files: {exc}")

        if record_clips:
            return record_clips

        clips = []

        for alarm_root in self._get_all_alarm_video_roots():

            clips.extend(self._list_saved_videos(alarm_root, video_id, limit))

        clips.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
        clips = clips[:max_limit]



        if sort_order.lower() == "asc":

            clips.reverse()

        return clips



    def list_alarm_screenshots(self, video_id: int, limit: int = 120, sort_order: str = "desc") -> list[dict]:

        # List alarm screenshots for a video device.

        self._refresh_storage_paths()

        screenshots: list[dict] = []

        sort_reverse = sort_order.lower() == "desc"

        video_id_str = str(video_id)

        screenshot_files = []

        for alarm_root in self._get_alarm_screenshot_roots():

            screenshot_files.extend(glob.glob(os.path.join(alarm_root, "*.jpg")))

        

        for file_path in sorted(screenshot_files, reverse=sort_reverse):

            file_name = os.path.basename(file_path)

            # 缁涙盯鈧灏柊宥堫嚉鐠佹儳顦惃鍕啞鐠€锔藉焻?(閺傚洣娆㈤崥宥嗙壐? 358_*.jpg)

            if not file_name.startswith(f"{video_id_str}_") and f"_{video_id_str}_" not in file_name:

                continue

            

            try:

                stat = os.stat(file_path)

                screenshots.append({

                    "name": file_name,

                    "size_bytes": int(stat.st_size),

                    "updated_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                    "event_at": self._parse_alarm_event_time(file_name) or datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),

                    "web_path": self._to_backend_static_web_path(file_path),

                    "thumbnail_path": self._to_backend_static_web_path(file_path),  # JPG閸欘垳娲块幒銉ф暏娴ｆ粎缂夐悾銉ユ禈

                })

            except Exception:

                continue



            if len(screenshots) >= max(1, min(limit, 500)):

                break



        return screenshots

    def batch_update_organization(self, mongo_db, company=None, project=None, grid=None, team=None, device_ids=None):
        # Batch update device organization fields.
        collection = self._video_collection()
        
        # 鏋勫缓鏇存柊鍐呭
        update_data = {}
        if company is not None:
            update_data["company"] = company
        if project is not None:
            update_data["project"] = project
        if grid is not None:
            update_data["grid"] = grid
        if team is not None:
            update_data["team"] = team
        
        if not update_data:
            return 0
        
        # 鏋勫缓鏌ヨ鏉′欢
        if device_ids:
            # 鍙洿鏂版寚瀹氱殑璁惧
            device_ids_str = [str(id) for id in device_ids]
            result = collection.update_many(
                {"id": {"$in": device_ids_str}},
                {"$set": update_data}
            )
        else:
            # 鏇存柊鎵€鏈夎澶?
            result = collection.update_many(
                {},
                {"$set": update_data}
            )
        
        return result.modified_count
