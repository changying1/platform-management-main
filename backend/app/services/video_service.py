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



VideoDevice = Any



RECORDING_PROCESSES = {}





# [鏃ュ織鍘嬪埗]

def suppress_verbose_logging():

    for logger_name in ["zeep", "urllib3", "onvif", "wsdl", "requests"]:

        logger = logging.getLogger(logger_name)

        logger.setLevel(logging.CRITICAL)

        logger.propagate = False





suppress_verbose_logging()

from app.core.database import SessionLocal, get_video_device_collection, get_next_sequence, get_mongo_db, get_mongo_collection
from app.core.ws_manager import push_alarm_threadsafe

try:

    import onvif

    from onvif import ONVIFCamera

except Exception:

    onvif = None

    ONVIFCamera = None



logger = get_logger("VideoService")



# --- 閰嶇疆閮ㄥ垎 ---

NMS_HOST = "http://127.0.0.1:8001"

NMS_USER = "admin"

NMS_PASS = "123456"

NMS_MEDIA_ROOT = os.path.abspath(os.getenv("NMS_MEDIA_ROOT", r"C:\media"))



# --- 鍏ㄥ眬缂撳瓨 ---

ONVIF_CLIENT_CACHE = {}



CAMERA_TIME_DRIFT_THRESHOLD_SECONDS = int(os.getenv("CAMERA_TIME_DRIFT_THRESHOLD_SECONDS", "120"))

CAMERA_TIME_SYNC_COOLDOWN_SECONDS = int(os.getenv("CAMERA_TIME_SYNC_COOLDOWN_SECONDS", "1800"))

CAMERA_TIMEZONE_TZ = os.getenv("CAMERA_TIMEZONE_TZ", "CST-8:00:00")

CAMERA_TIME_SYNC_CACHE: Dict[int, float] = {}



# [鏂板] 鍏ㄥ眬瀛楀吀锛氱敤浜庡瓨鍌ㄦ鍦ㄨ繍琛岀殑 FFmpeg 杩涚▼ {stream_name: process_object}

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
TRAFFIC_SAFETY_BUFFER_GB = float(os.getenv("VIDEO_TRAFFIC_SAFETY_BUFFER_GB", "1"))
TRAFFIC_ALARM_REMAINING_GB = float(os.getenv("VIDEO_TRAFFIC_ALARM_REMAINING_GB", "1"))
TRAFFIC_OCR_SNAPSHOT_TIMEOUT_SECONDS = float(os.getenv("VIDEO_TRAFFIC_OCR_SNAPSHOT_TIMEOUT_SECONDS", "8"))
TRAFFIC_OCR_ENGINE_TIMEOUT_SECONDS = float(os.getenv("VIDEO_TRAFFIC_OCR_ENGINE_TIMEOUT_SECONDS", "5"))
TRAFFIC_OCR_DEBUG_IMAGE_ENV = "TRAFFIC_OCR_DEBUG_IMAGE_PATH"
BYTES_PER_GB = 1024 * 1024 * 1024
EZVIZ_STATUS_POLL_INTERVAL_SECONDS = max(30, int(os.getenv("EZVIZ_STATUS_POLL_INTERVAL_SECONDS", "60")))
# 近实时回放依赖短分段；常态回放由独立归档逻辑完成，不与分段时长绑定。
RECORD_SEGMENT_SECONDS = int(os.getenv("VIDEO_RECORD_SEGMENT_SECONDS", "30"))

RECORD_SEGMENT_SAFE_MARGIN_SECONDS = int(os.getenv("VIDEO_RECORD_SEGMENT_SAFE_MARGIN_SECONDS", "8"))
MIN_RECORD_SEGMENT_BYTES = int(os.getenv("VIDEO_MIN_RECORD_SEGMENT_BYTES", str(64 * 1024)))
RECORDING_LIST_FFPROBE_TIMEOUT_SECONDS = float(os.getenv("VIDEO_RECORDING_LIST_FFPROBE_TIMEOUT_SECONDS", "2"))
RECORDING_LIST_MAX_SECONDS = float(os.getenv("VIDEO_RECORDING_LIST_MAX_SECONDS", "6"))
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



    def _video_collection(self):

        return get_mongo_collection("video_device")


    def _get_video_doc_by_id(self, video_id: int | str) -> Optional[dict]:

        collection = self._video_collection()

        return collection.find_one({"$or": [{"id": str(video_id)}, {"id": int(video_id) if str(video_id).isdigit() else video_id}]})

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

                logger.error(f"闀滃儚鍚屾鎵弿澶辫触: {e}")

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

                    logger.info(f"鏈湴闀滃儚瀹屾垚: {sp['name']} -> {relative_path}")



                elif mirror_type == "oss":

                    self._upload_to_oss(sp, source_file, relative_path)



                elif mirror_type == "cos":

                    self._upload_to_cos(sp, source_file, relative_path)



                elif mirror_type == "s3":

                    self._upload_to_s3(sp, source_file, relative_path)



            except Exception as e:

                logger.error(f"闀滃儚鍐欏叆澶辫触 {sp.get('name')}: {e}")



    def _upload_to_oss(self, config: Dict, source_file: str, object_key: str):

        try:

            import oss2

            auth = oss2.Auth(config["access_key"], config["secret_key"])

            bucket = oss2.Bucket(auth, config["endpoint"], config["bucket"])

            bucket.put_object_from_file(object_key, source_file)

            logger.info(f"OSS 涓婁紶瀹屾垚: {config['name']} -> {object_key}")

        except Exception as e:

            logger.error(f"OSS 涓婁紶澶辫触: {e}")



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

            logger.info(f"COS 涓婁紶瀹屾垚: {config['name']} -> {object_key}")

        except Exception as e:

            logger.error(f"COS 涓婁紶澶辫触: {e}")



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

            logger.info(f"S3 涓婁紶瀹屾垚: {config['name']} -> {object_key}")

        except Exception as e:

            logger.error(f"S3 涓婁紶澶辫触: {e}")



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



            logger.warning(f"瀛樺偍璺緞閰嶇疆鏍煎紡寮傚父,宸查噸缃负绌哄垪琛? {config_file}")

            return []

        except Exception as e:

            logger.error(f"鍔犺浇瀛樺偍璺緞閰嶇疆澶辫触: {e}")

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

                logger.warning(f"瀛樺偍璺緞宸插瓨? {path}")

                return False



        if mirror_type == "mirror":

            try:

                os.makedirs(path, exist_ok=True)

                test_file = os.path.join(path, ".test_write")

                with open(test_file, "w", encoding="utf-8") as f:

                    f.write("test")

                os.remove(test_file)

            except Exception as e:

                logger.error(f"鏃犳硶璁块棶瀛樺偍璺緞 {path}: {e}")

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

        logger.info(f"宸叉坊鍔犲疄鏃堕暅鍍忓瓨? {name} ({mirror_type})")

        return True



    def delete_storage_path(self, index: int) -> bool:

        self._refresh_storage_paths()

        paths = self._storage_paths



        if 0 <= index < len(paths):

            removed = paths.pop(index)

            self._save_storage_paths(paths)

            logger.info(f"宸插垹闄ゅ瓨鍌ㄨ矾? {removed.get('name')}")

            return True



        return False



    def set_primary_storage(self, index: int) -> bool:

        self._refresh_storage_paths()

        paths = self._storage_paths



        if 0 < index < len(paths):

            paths[0], paths[index] = paths[index], paths[0]

            self._save_storage_paths(paths)

            logger.info(f"涓诲瓨鍌ㄥ凡鍒囨崲? {paths[0].get('name')}")

            return True



        return False



    def _periodic_cleanup_worker(self):

        while self._cleanup_thread_running:

            try:
                # 检查存储空间并预警
                self.check_storage_space()
                
                # 清理过期文件
                self.cleanup_expired_files()

            except Exception as e:

                logger.error(f"娓呯悊杩囨湡鏂囦欢澶辫触: {e}")

            time.sleep(3600)



    def cleanup_expired_files(self):

        config = self._get_system_config()

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

            logger.info(f"宸叉竻?{count_cleaned} 涓繃鏈熷綍?鎴浘鏂囦欢")



    def check_storage_space(self) -> Dict:
        """检查存储空间使用情况并返回状态"""
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
                # 获取磁盘使用情况
                total, used, free = shutil.disk_usage(storage_root)
                usage_percent = (used / total) * 100 if total > 0 else 0
                
                # 计算视频存储目录大小
                video_size = self._get_directory_size(storage_root)
                video_size_gb = video_size / (1024**3)
                
                # 判断是否超过容量限制
                over_capacity = video_size_gb > max_size_gb
                
                # 确定状态
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
                
                # 记录日志
                if status == "critical":
                    logger.error(f"存储空间紧急: {storage_root} 使用率 {usage_percent:.1f}%, 视频占用 {video_size_gb:.1f}GB")
                    if auto_cleanup and cleanup_strategy in ["space", "both"]:
                        self._emergency_cleanup(storage_root, max_size_gb)
                elif status == "warning":
                    logger.warning(f"存储空间警告: {storage_root} 使用率 {usage_percent:.1f}%, 视频占用 {video_size_gb:.1f}GB")
                    
            except Exception as e:
                logger.error(f"检查存储空间失败 {storage_root}: {e}")
                
        return {
            "storages": results,
            "has_warning": any(r["status"] == "warning" for r in results),
            "has_critical": any(r["status"] == "critical" for r in results),
        }
    
    def _get_directory_size(self, path: str) -> int:
        """计算目录总大小"""
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
        """紧急清理：按文件时间删除旧文件直到低于目标大小"""
        logger.warning(f"开始紧急清理: {storage_root}, 目标大小 {target_size_gb}GB")
        
        target_bytes = target_size_gb * 1024**3
        current_size = self._get_directory_size(storage_root)
        
        if current_size <= target_bytes:
            return
        
        # 收集所有可删除文件（按修改时间排序）
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
        
        # 按时间排序（先删旧的）
        files.sort(key=lambda x: x[1])
        
        deleted_count = 0
        deleted_bytes = 0
        
        for filepath, _, filesize in files:
            if current_size - deleted_bytes <= target_bytes * 0.9:  # 清理到目标的90%
                break
                
            try:
                os.remove(filepath)
                deleted_bytes += filesize
                deleted_count += 1
            except Exception:
                pass
        
        logger.warning(f"紧急清理完成: 删除 {deleted_count} 个文件, 释放 {deleted_bytes / (1024**3):.2f} GB")



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
            value_gb = self._traffic_unit_to_gb(value, normalized_unit)
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
                "text": self._format_traffic_candidate_text(value, normalized_unit),
                "value": value,
                "unit": "GB" if normalized_unit in {"G", "GB"} else normalized_unit,
                "value_gb": max(0.0, value_gb),
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

    def _get_stored_traffic_usage_gb(self, db_video: VideoDevice) -> tuple[Optional[float], str, Optional[datetime]]:
        used_gb = getattr(db_video, "traffic_used_gb", None)
        ocr_text = str(getattr(db_video, "traffic_ocr_text", "") or "")
        updated_at = getattr(db_video, "traffic_ocr_updated_at", None)
        try:
            if used_gb is None:
                return None, ocr_text, updated_at
            return max(0.0, float(used_gb)), ocr_text, updated_at
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
        safety_buffer_gb = TRAFFIC_SAFETY_BUFFER_GB

        if used_gb is None:
            return {
                "traffic_ocr_text": ocr_text,
                "traffic_status": "unknown",
                "monthly_threshold_gb": threshold_gb,
                "safety_buffer_gb": safety_buffer_gb,
                "estimated_remaining_gb": None,
                "weekly_quota_bytes": int(threshold_gb * BYTES_PER_GB),
                "weekly_used_bytes": 0,
                "weekly_remaining_bytes": 0,
                "weekly_quota_text": self._format_gb(threshold_gb),
                "weekly_used_text": "识别中",
                "weekly_remaining_text": "--",
                "monthly_threshold_text": self._format_gb(threshold_gb),
                "estimated_remaining_text": "--",
            }

        estimated_remaining_gb = threshold_gb - float(used_gb) - safety_buffer_gb
        display_remaining_gb = max(estimated_remaining_gb, 0.0)
        traffic_status = (
            "alarm"
            if estimated_remaining_gb < TRAFFIC_ALARM_REMAINING_GB
            else "low"
            if estimated_remaining_gb < 3
            else "normal"
        )

        return {
            "traffic_ocr_text": ocr_text,
            "traffic_status": traffic_status,
            "monthly_threshold_gb": threshold_gb,
            "safety_buffer_gb": safety_buffer_gb,
            "estimated_remaining_gb": estimated_remaining_gb,
            "weekly_quota_bytes": int(threshold_gb * BYTES_PER_GB),
            "weekly_used_bytes": int(float(used_gb) * BYTES_PER_GB),
            "weekly_remaining_bytes": int(display_remaining_gb * BYTES_PER_GB),
            "weekly_quota_text": self._format_gb(threshold_gb),
            "weekly_used_text": self._format_gb(float(used_gb)),
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
        while self._ezviz_status_thread_running:
            try:
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
                                db=db,
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

            "online": "鍦ㄧ嚎",

            "offline": "绂荤嚎",

            "sleeping": "寰呮満/浼戠湢",

        }

        status_text_parts = [status_text_map.get(main_status, "绂荤嚎")]

        tag_text_map = {

            "privacy_enabled": "隐私开启",
            "storage_abnormal": "瀛樺偍寮傚父",

            "low_battery": "低电量",
            "weak_signal": "信号弱",
            "alarm_active": "寮傚父鍛婅",
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

        mongo_db,

        db_video,

        alarm_type: str,

        severity: str,

        description: str,

        active: bool,

    ) -> bool:

        """Sync monitoring alarms from device status."""

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
                location=db_video.name or f"视频设备-{device_id}",
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

        """Sync monitoring alarms from device status."""

        changed = False



        alarm_specs = [

            (

                "VIDEO_DEVICE_OFFLINE",

                "high",

                f"瑙嗛璁惧 {db_video.name} 绂荤嚎",

                status_summary.get("main_status") == "offline",

            ),

            (

                "VIDEO_DEVICE_SLEEPING",

                "low",

                f"瑙嗛璁惧 {db_video.name} 澶勪簬寰呮満/浼戠湢",

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

                f"瑙嗛璁惧 {db_video.name} 瀛樺偍寮傚父",

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

            changed = self._sync_single_monitoring_alarm(

                db=db,

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
            f"视频设备 {db_video.name} 流量低于阈值; "
            f"剩余 {self._format_bytes(remaining)} / 周额度 {self._format_bytes(quota)}; "
            f"本周已用 {self._format_bytes(weekly_used_bytes)}"
        )

        changed = self._sync_single_monitoring_alarm(

            db=db,

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
        used_gb = traffic_fields.get("estimated_remaining_gb")
        active = used_gb is not None and float(used_gb) < TRAFFIC_ALARM_REMAINING_GB
        description = (
            f"摄像头流量不足预警：当前估算剩余流量已低于 {TRAFFIC_ALARM_REMAINING_GB:.0f}GB，"
            f"已使用 {traffic_fields.get('weekly_used_text') or '--'}，"
            f"流量阈值 {traffic_fields.get('monthly_threshold_text') or '30.00GB'}，"
            f"保护余量 {TRAFFIC_SAFETY_BUFFER_GB:.0f}GB，"
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
            db=db,
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

        parsed, candidates = self._parse_traffic_ocr_text_with_candidates(ocr_text)
        normalized_ocr_text = str(ocr_text or "").strip()
        if used_gb is None:
            if not parsed:
                self._update_video_fields(video_id, {
                    "traffic_ocr_text": normalized_ocr_text,
                    "traffic_ocr_status": "unrecognized",
                    "traffic_ocr_updated_at": datetime.utcnow(),
                })
                refreshed = self._get_video_runtime_by_id(video_id) or db_video
                current_used_gb, current_ocr_text, updated_at = self._get_stored_traffic_usage_gb(refreshed)
                fields = self._build_traffic_summary_fields(current_used_gb, current_ocr_text or normalized_ocr_text)
                return {
                    "success": False,
                    "message": "未识别到合法流量读数",
                    "last_update_time": updated_at,
                    "candidates": candidates,
                    **fields,
                }
            used_gb, normalized_ocr_text = parsed
        else:
            used_gb = max(0.0, float(used_gb))
            if parsed:
                normalized_ocr_text = parsed[1]

        now = datetime.utcnow()
        last_used_gb, _, _ = self._get_stored_traffic_usage_gb(db_video)
        last_month = getattr(db_video, "last_ocr_month", None)
        current_month = datetime.now().strftime("%Y-%m")
        is_new_month = last_month != current_month
        threshold_gb = MONTHLY_TRAFFIC_THRESHOLD_GB
        historical_used_gb = last_used_gb
        history_suspicious = self._is_suspicious_traffic_history(historical_used_gb, threshold_gb)

        is_valid = True
        invalid_reason = ""
        reset_suspicious_history = False
        if history_suspicious and not is_new_month:
            reset_suspicious_history = True
        elif last_used_gb is not None and not is_new_month:
            if last_used_gb > 0 and used_gb > last_used_gb * 5:
                is_valid = False
                invalid_reason = "读数异常增大，已忽略"
            elif used_gb + 0.05 < last_used_gb:
                is_valid = False
                invalid_reason = "本月读数异常下降，已忽略"

        traffic_debug = {
            "selected_traffic_value": used_gb,
            "historical_used_gb": historical_used_gb,
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
            used_for_summary, normalized_ocr_text, _ = self._get_stored_traffic_usage_gb(db_video)
            traffic_debug["final_used_gb"] = used_for_summary

        fields = self._build_traffic_summary_fields(used_for_summary, normalized_ocr_text)
        self._sync_traffic_ocr_alarm(db, db_video, fields)
        message = "ok" if is_valid else invalid_reason
        if reset_suspicious_history:
            message = "历史流量统计异常，已使用当前OCR读数重置。"

        logger.info(
            "Traffic OCR usage debug video_id=%s selected=%s historical=%s suspicious=%s final=%s",
            video_id,
            traffic_debug["selected_traffic_value"],
            traffic_debug["historical_used_gb"],
            traffic_debug["historical_value_suspicious"],
            traffic_debug["final_used_gb"],
        )

        return {
            "success": is_valid,
            "message": message,
            "alarm_triggered": fields["traffic_status"] == "alarm",
            "last_update_time": now,
            "candidates": candidates,
            "traffic_debug": traffic_debug,
            **fields,
        }

    def get_traffic_status(self, db: Session, video_id: int):
        return self.get_monitoring_summary(db, video_id)

    def recognize_video_traffic(self, db: Session, video_id: int):
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
            reason = str(exc) or "获取截图失败"
            print(f"[TrafficOCR] recognize failed reason={reason}")
            return {"success": False, "message": reason}

        try:
            raw_text, traffic_text, used_gb, candidates, roi_path, debug_image = self._recognize_traffic_from_snapshot(
                snapshot_path=snapshot_path,
                video_id=video_id,
                debug_dir=debug_dir,
                timestamp=timestamp,
            )
        except Exception as exc:
            reason = str(exc) or "识别失败"
            print(f"[TrafficOCR] recognize failed reason={reason}")
            return {"success": False, "message": reason}

        result = self.report_traffic_ocr(db, video_id, traffic_text, used_gb)
        if not result:
            return {"success": False, "message": "设备不存在"}

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
            "traffic_limit_gb": result.get("monthly_threshold_gb"),
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
            raise ValueError("直播流不可用")

        self._capture_ffmpeg_snapshot(live_url, snapshot_path)
        return snapshot_path, "ffmpeg"

    def _capture_ezviz_snapshot(self, db_video: VideoDevice, output_path: str) -> None:
        device_serial = str(getattr(db_video, "device_serial", "") or "").strip()
        channel_no = int(getattr(db_video, "channel_no", None) or 1)
        if not device_serial:
            raise ValueError("萤石设备缺少 device_serial")

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
            raise ValueError(f"萤石截图失败: {last_error}")

        data = body.get("data") or {}
        picture_url = (
            data.get("picUrl")
            or data.get("pictureUrl")
            or data.get("url")
            or data.get("imageUrl")
            or (data if isinstance(data, str) else "")
        )
        if not picture_url:
            raise ValueError("萤石截图接口未返回图片地址")

        response = requests.get(str(picture_url), timeout=TRAFFIC_OCR_SNAPSHOT_TIMEOUT_SECONDS)
        response.raise_for_status()
        if not response.content:
            raise ValueError("萤石截图为空")
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
            raise ValueError("获取截图超时")

        if result.returncode != 0:
            error = (result.stderr or result.stdout or "").strip()[-500:]
            raise ValueError(f"获取截图失败: {error or 'ffmpeg 截图失败'}")
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise ValueError("获取截图失败")

    def _recognize_traffic_from_snapshot(
        self,
        snapshot_path: str,
        video_id: int,
        debug_dir: str,
        timestamp: str,
    ) -> tuple[str, str, Optional[float], list[dict], str, str]:
        try:
            import cv2
        except Exception as exc:
            raise ValueError(f"OpenCV 依赖未安装: {exc}")

        try:
            import pytesseract
        except Exception:
            raise ValueError("OCR依赖未安装")

        image = cv2.imread(snapshot_path)
        if image is None:
            raise ValueError("截图文件无法读取")

        h, w = image.shape[:2]
        if self._get_traffic_ocr_debug_image_path():
            print(f"[TrafficOCR] frame.shape={image.shape}")

        x1 = max(0, min(w - 1, int(w * 0.20)))
        y1 = 0
        x2 = w
        y2 = max(y1 + 1, min(h, int(h * 0.25)))
        print(f"[TrafficOCR] crop top roi x1={x1} y1={y1} x2={x2} y2={y2}")

        roi = image[y1:y2, x1:x2]
        resized = cv2.resize(roi, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        debug_static_dir = self._get_default_static_subdir("debug")
        roi_abs_path = os.path.join(debug_static_dir, "traffic_ocr_roi.jpg")
        cv2.imwrite(roi_abs_path, binary)
        roi_path = self._to_backend_static_web_path(roi_abs_path)
        print(f"[TrafficOCR] roi saved path={roi_abs_path}")

        raw_text_parts = []
        variants = [binary, cv2.bitwise_not(binary)]

        for variant_idx, variant in enumerate(variants):
            try:
                raw_text = pytesseract.image_to_string(
                    variant,
                    lang="eng",
                    config="--psm 6 -c tessedit_char_whitelist=0123456789.,GBMTBgbmtb ",
                    timeout=TRAFFIC_OCR_ENGINE_TIMEOUT_SECONDS,
                )
            except RuntimeError as exc:
                if "timeout" in str(exc).lower():
                    raise ValueError("识别超时")
                raise

            raw_text = str(raw_text or "").strip()
            print(f"[TrafficOCR] ocr raw_text variant={variant_idx}: {raw_text}")
            if raw_text:
                raw_text_parts.append(raw_text)

            parsed, candidates = self._parse_traffic_ocr_text_with_candidates(raw_text)
            if parsed:
                used_gb, traffic_text = parsed
                print(f"[TrafficOCR] parsed traffic_text={traffic_text} used_gb={used_gb} candidates={candidates}")
                return raw_text, traffic_text, used_gb, candidates, roi_path, roi_path

        raw_text = "\n".join(raw_text_parts).strip()
        print(f"[TrafficOCR] ocr raw_text={raw_text}")
        parsed, candidates = self._parse_traffic_ocr_text_with_candidates(raw_text)
        if parsed:
            used_gb, traffic_text = parsed
            print(f"[TrafficOCR] parsed combined traffic_text={traffic_text} used_gb={used_gb} candidates={candidates}")
            return raw_text, traffic_text, used_gb, candidates, roi_path, roi_path
        return raw_text, "", None, candidates, roi_path, roi_path

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

        # 杩愯鏃惰鍙栫幆澧冨彉閲?閬垮厤瀵煎叆鏃舵満瀵艰嚧閰嶇疆鍊间负绌?

        base_url = (os.getenv("EZVIZ_BASE_URL") or EZVIZ_BASE_URL or "https://open.ys7.com").rstrip("/")

        app_key = os.getenv("EZVIZ_APP_KEY") or EZVIZ_APP_KEY or ""

        app_secret = os.getenv("EZVIZ_APP_SECRET") or EZVIZ_APP_SECRET or ""

        return base_url, app_key, app_secret



    # -------------------------------------------------------------------------

    # 鏍稿績 1: 鑾峰彇杩炴帴

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

            raise ValueError(f"杩炴帴澶辫触: {e}")



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

            return {"status": "skipped", "message": "璁惧缂哄皯 ONVIF 杩炴帴鍙傛暟"}



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

                "message": "鎽勫儚澶存椂闂村凡鍚屾",

                "drift_seconds_before_sync": int(drift_seconds) if drift_seconds is not None else None,

            }

        except Exception as e:

            logger.warning(f"Camera time sync skipped for video_id={db_video.id}: {e}")

            return {"status": "error", "message": f"鎽勫儚澶存牎鏃跺け? {e}"}



    def sync_camera_time_if_needed(self, mongo_db, video_id: int, force: bool = False) -> dict:
        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            return {"status": "error", "message": "Device not found"}

        return self._sync_camera_time_for_video(db_video, force=force)



    # -------------------------------------------------------------------------

    # 杈呭姪: 鐢熸垚 WS-Security Header (妯℃嫙 ODM 璁よ瘉)

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



        return f"""<s:Header>

    <Security s:mustUnderstand="1" xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">

        <UsernameToken>

            <Username>{username}</Username>

            <Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">{digest}</Password>

            <Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">{nonce_b64}</Nonce>

            <Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">{created}</Created>

        </UsernameToken>

    </Security>

</s:Header>"""



    # -------------------------------------------------------------------------

    # 鏍稿績 2: 鍘熷 SOAP 鍋滄 (ODMFix)

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

            # 鏂规 0: Wireshark 鎶撳寘澶嶅埢

            f"""<?xml version="1.0" encoding="UTF-8"?>

<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">

  {security_header}

  <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">

    <Stop xmlns="http://www.onvif.org/ver20/ptz/wsdl">

      <ProfileToken>{profile_token}</ProfileToken>

      <PanTilt>true</PanTilt>

            <Zoom>true</Zoom>

    </Stop>

  </s:Body>

</s:Envelope>""",

            # 鏂规 A: 澶囩敤

            f"""<?xml version="1.0" encoding="UTF-8"?>

<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">

  {security_header}

  <s:Body>

    <tptz:Stop>

      <tptz:ProfileToken>{profile_token}</tptz:ProfileToken>

      <tptz:PanTilt>true</tptz:PanTilt>

      <tptz:Zoom>true</tptz:Zoom>

    </tptz:Stop>

  </s:Body>

</s:Envelope>""",

            # 鏂规 B: 澶囩敤

            f"""<?xml version="1.0" encoding="UTF-8"?>

<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">

  {security_header}

  <s:Body>

    <tptz:Stop>

      <tptz:ProfileToken>{profile_token}</tptz:ProfileToken>

      <tptz:PanTilt>1</tptz:PanTilt>

      <tptz:Zoom>1</tptz:Zoom>

    </tptz:Stop>

  </s:Body>

</s:Envelope>"""

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



            # 鍏滃簳

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

            raise ValueError("鎵€鏈夊仠姝㈡柟娉曞潎澶辫触")



        except Exception as e:

            if video_id in ONVIF_CLIENT_CACHE: del ONVIF_CLIENT_CACHE[video_id]

            logger.error(f"Stop Fatal Error: {e}")

            raise ValueError(f"鍋滄澶辫触: {e}")



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

            raise ValueError("宸¤埅鑷冲皯闇€瑕佷袱涓缃偣")



        available_items = self.list_presets(mongo_db, video_id)
        available = {str(item["token"]) for item in available_items if item.get("token")}

        if available:

            missing = [str(token) for token in preset_tokens if str(token) not in available]

            if missing:

                raise ValueError(f"浠ヤ笅棰勭疆鐐逛笉瀛樺湪: {', '.join(missing)}")



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

            'zoom_in': '鏀惧ぇ',

            'zoom_out': '缂╁皬',

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

        msg = raw_message or "璋冪敤澶辫触"

        msg_lower = msg.lower()



        if code_str in TOKEN_ERROR_CODES or "token" in msg_lower:

            return "TOKEN_EXPIRED", "Platform token expired, please retry later"

        if "offline" in msg_lower or "设备不在线" in msg or "设备离线" in msg:

            return "DEVICE_OFFLINE", "璁惧绂荤嚎鎴栦笉鍙揪"

        if "ptz" in msg_lower and ("not" in msg_lower or "不支持" in msg):

            return "PTZ_NOT_SUPPORTED", "Device does not support cloud PTZ"

        if code_str == "60019" or "鍔犲瘑" in msg:

            return "VIDEO_ENCRYPTED", "Video encryption is enabled for the current protocol"

        return "UPSTREAM_ERROR", msg



    def _ensure_ezviz_credentials(self):

        _, app_key, app_secret = self._get_ezviz_config()

        if not app_key or not app_secret:

            raise ValueError("UPSTREAM_ERROR: 鏈厤缃悿?AppKey/AppSecret")



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

            semantic_code, semantic_msg = self._map_error_code(code, str(body.get("msg", "鑾峰彇 token 澶辫触")))

            raise ValueError(f"{semantic_code}: {semantic_msg}")



        data = body.get("data") or {}

        token = data.get("accessToken")

        expire_time = int(data.get("expireTime") or 0)

        if not token:

            raise ValueError("UPSTREAM_ERROR: 鑾峰彇 token 澶辫触")



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

            semantic_code, semantic_msg = self._map_error_code(retry_code, str(retry_body.get("msg", "璋冪敤澶辫触")))

            raise ValueError(f"{semantic_code}: {semantic_msg}")



        semantic_code, semantic_msg = self._map_error_code(code, str(body.get("msg", "璋冪敤澶辫触")))

        raise ValueError(f"{semantic_code}: {semantic_msg}")



    def _get_stream_info_local(self, db_video: VideoDevice) -> dict:

        # 鎷夋祦鍓嶆墽琛屾寜闇€鏍℃椂锛氳秴杩囬槇鍊兼墠鏀?涓旀湁鍐峰嵈鏃堕棿閬垮厤棰戠箒鍐欒澶?

        sync_result = self._sync_camera_time_for_video(db_video, force=False)

        if sync_result.get("status") == "error":

            logger.warning(f"Auto time sync failed for video_id={db_video.id}: {sync_result.get('message')}")



        # 鎳掑惎鍔ㄦ帹娴侊細褰撳墠绔姹傛挱鏀惧湴鍧€鏃?濡傛帹娴佽繘绋嬩笉瀛樺湪鍒欒嚜鍔ㄦ媺璧?

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



        # 鎷夋祦闃舵椤哄甫鍋氫竴娆″綍鍍忚嚜鎰?纭繚鈥滆澶囧湪绾挎椂鎸佺画钀界洏鈥?

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

            raise ValueError("UPSTREAM_ERROR: 浜戣澶囩己?device_serial")



        # ?寮哄埗浣跨敤 HLS 鑰屼笉?ezopen

        # if protocol_name == "ezopen":

        #     preferred_code = 2  # HLS

        # else:

        preferred_code = STREAM_PROTOCOL_MAP[protocol_name]

        protocol_candidates = [preferred_code] + [c for c in [1, 2, 3, 4] if c != preferred_code]

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

            raise last_error or ValueError("UPSTREAM_ERROR: 骞冲彴鏈繑鍥炲彲鐢ㄦ挱鏀惧湴鍧€")



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



        # ?鍏抽敭锛氳浆?ezopen ?HLS 鍦板潃

        # if url and url.startswith("ezopen://"):

        #     url = f"https://open.ys7.com/v3/openlive/{device_serial}_1.m3u8"

        #     resolved_play_type = "hls"

        #     logger.info(f"Converted ezopen to HLS for device {device_serial}: {url}")



        # 浜戞祦鍦烘櫙涔熻鎸佺画钀芥湰鍦板垎娈?渚涗复鏃剁紦?甯告€佸洖鏀句娇鐢?

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

    #         raise ValueError("UPSTREAM_ERROR: 浜戣澶囩己?device_serial")

    #

    #     if protocol_name == "ezopen":

    #         preferred_code = 2  # 寮哄埗浣跨敤 HLS 鑰屼笉?ezopen

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

    #         raise last_error or ValueError("UPSTREAM_ERROR: 骞冲彴鏈繑鍥炲彲鐢ㄦ挱鏀惧湴鍧€")

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

    #     # 浜戞祦鍦烘櫙涔熻鎸佺画钀芥湰鍦板垎娈?渚涗复鏃剁紦?甯告€佸洖鏀句娇鐢?

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

            raise ValueError("PTZ_NOT_SUPPORTED: 涓嶆敮鎸佺殑 PTZ 鏂瑰悜")



        payload = {

            "deviceSerial": db_video.device_serial,

            "channelNo": int(getattr(db_video, "channel_no", None) or 1),

            "direction": direction_code,

            "speed": max(1, min(8, int(round(float(speed) * 8)))),

        }

        try:

            self._call_ezviz_api("/api/lapp/device/ptz/start", payload)

        except Exception as first_error:

            # 钀ょ煶浜戝伓鍙戠綉缁滄姈鍔ㄤ細瀵艰嚧 start 瓒呮椂,鐭殏閲嶈瘯涓€娆″彲鎻愬崌绋冲畾鎬?

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



        # 鍏堝皾璇曚笉?direction(钀ょ煶閮ㄥ垎鏈?stop 瑕佹眰?serial+channel?

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

            # 鏌愪簺鎽勫儚澶翠笉鏀寔棰勭疆鐐?鎴栧綋鍓嶈繛鎺ユ殏鏃朵笉鍙敤;姝ゅ闄嶇骇涓虹┖鍒楄〃,閬垮厤鍓嶇鎸佺画鍑虹幇 400?

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



        # 钀ょ煶浜戣澶囧?

        if self._is_ezviz_ptz(db_video):

            payload = {

                "deviceSerial": db_video.device_serial,

                "channelNo": int(getattr(db_video, "channel_no", None) or 1),

            }

            if name:

                payload["name"] = name



            print("=" * 50)

            print("璋冪敤钀ょ煶浜戞坊鍔犻缃偣")

            print(f"Payload: {payload}")

            # ?淇敼锛氬垱寤烘柊棰勭疆鐐规椂涓嶄紶 index(preset_token?

            # if preset_token:

            #     payload["index"] = preset_token

            body = self._call_ezviz_api("/api/lapp/device/preset/add", payload)



            print(f"钀ょ煶浜戝搷? {body}")

            print(f"鍝嶅簲 code: {body.get('code')}")

            print(f"鍝嶅簲 msg: {body.get('msg')}")

            print(f"鍝嶅簲 data: {body.get('data')}")

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



        # ONVIF 璁惧澶勭悊

        _, _, ptz, _, token = self._create_ptz_and_media(mongo_db, video_id)


        # ?淇敼锛氬垱寤洪缃偣鏃跺彧?ProfileToken ?PresetName

        # 缁濆涓嶈?PresetToken?

        req = {'ProfileToken': token}

        if name:

            req['PresetName'] = name



        # ?鍒犻櫎涓嬮潰杩欏嚑琛?鍒涘缓鏂伴缃偣涓嶈兘?PresetToken

        # if preset_token:

        #     req['PresetToken'] = preset_token



        try:

            # SetPreset 杩斿洖鎽勫儚澶寸敓鎴愮殑 PresetToken

            created_token = ptz.SetPreset(req)



            # ?淇敼锛氱‘淇濊繑鍥炴湁鏁堢殑 token

            if not created_token:

                raise ValueError("鎽勫儚澶存湭杩斿洖棰勭疆?token")



            return {

                "token": str(created_token),  # 鍙娇鐢ㄦ憚鍍忓ご杩斿洖?token

                "name": name or f"Preset-{created_token}"

            }

        except Exception as e:

            raise ValueError(f"鍒涘缓棰勭疆鐐瑰け? {e}")

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

    #         raise ValueError(f"鍒涘缓棰勭疆鐐瑰け? {e}")



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

            raise ValueError(f"璋冪敤棰勭疆鐐瑰け? {e}")



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

            raise ValueError(f"鍒犻櫎棰勭疆鐐瑰け? {e}")



    def remove_presets_bulk(self, mongo_db, video_id: int, preset_tokens: list[str]):
        if not preset_tokens:

            raise ValueError("preset_tokens 涓嶈兘涓虹┖")



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

            raise ValueError("娌℃湁鏈夋晥鐨勯缃偣 token")



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

                        logger.warning(f"宸¤埅璺宠浆澶辫触 video_id={video_id}, preset={preset}: {e}")



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

            raise ValueError("宸¤埅鑷冲皯闇€瑕佷袱涓缃偣")



        db_video = self._get_video_runtime_by_id(video_id)

        if not db_video:

            raise ValueError("Device not found")



        available_items = self.list_presets(mongo_db, video_id)
        available = {str(item["token"]) for item in available_items if item.get("token")}

        if available:

            missing = [str(token) for token in preset_tokens if str(token) not in available]

            if missing:

                raise ValueError(f"浠ヤ笅棰勭疆鐐逛笉瀛樺湪: {', '.join(missing)}")

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

    # 鏍稿績涓氬姟: 娣诲姞/鍒犻櫎/鏇存柊

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

            "platform_type": (camera_data.platform_type or "onvif"),

            "access_source": (camera_data.access_source or "local"),

            "ptz_source": (camera_data.ptz_source or "onvif"),

            "device_serial": camera_data.device_serial,

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



        # 鏂板璁惧鍚庡厛灏濊瘯鍚屾鎽勫儚澶存椂闂?閬垮厤 OSD 鏃堕棿鎸佺画婕傜Щ

        sync_result = self._sync_camera_time_for_video(new_video, force=True)

        if sync_result.get("status") == "error":

            logger.warning(

                f"Initial camera time sync failed for video_id={new_video.id}: {sync_result.get('message')}"

            )



        stream_name = str(new_video.id)



        # 鍚姩鎺ㄦ祦骞舵洿鏂版挱鏀惧湴鍧€

        self.start_ffmpeg_stream(camera_data.rtsp_url, stream_name)

        flv_url = f"{NMS_HOST}/live/{stream_name}.flv"



        self._update_video_fields(next_id, {"stream_url": flv_url})



        updated_video = self._get_video_doc_by_id(next_id)

        self.start_ffmpeg_recording(new_video.id, camera_data.rtsp_url)



        return self._mongo_video_to_out(updated_video)



    def sync_hikvision_devices(self, mongo_db):

        # 褰撳墠椤圭洰?RTSP/ONVIF 鎵嬪姩鎺ュ叆涓轰富,淇濈暀鍚屾鎺ュ彛閬垮厤璺敱璋冪敤鏃舵姤閿?

        logger.info("sync_hikvision_devices called - manual RTSP/ONVIF flow is used")

        return []



    def create_video(self, mongo_db, video_data: VideoCreate, scope_fields: dict | None = None):
        collection = self._video_collection()



        payload = self._prepare_video_payload(video_data.model_dump())
        for key, value in (scope_fields or {}).items():
            if payload.get(key) in [None, "", [], {}] and value not in [None, "", [], {}]:
                payload[key] = value

        next_id = str(get_next_sequence("video_device_id"))

        payload["id"] = next_id

        payload["createdAt"] = datetime.utcnow()

        payload["updatedAt"] = datetime.utcnow()



        collection.insert_one(payload)

        created = collection.find_one({"id": next_id})

        return self._mongo_video_to_out(created)



    def get_videos(self, mongo_db, skip: int = 0, limit: int = 100, current_user: dict | None = None):
        collection = self._video_collection()

        query = scope_filter(current_user, **self._scope_kwargs()) if current_user else {}
        docs = list(collection.find(query, {"_id": 0}))

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



        merged = {**existing, **update_payload}



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



        db_video = collection.find_one({"id": video_id})

        if not db_video:

            return False



        stream_name = str(db_video.get("id"))

        self.stop_ffmpeg_stream(stream_name)

        self.stop_ffmpeg_recording(video_id)

        self.stop_cruise(video_id)



        collection.delete_one({"id": video_id})



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

    # [鏂板姛鑳絔 V4 鏋侀€熸帹?+ 杩涚▼绠＄悊

    # -------------------------------------------------------------------------

    def start_ffmpeg_stream(self, rtsp_url: str, stream_name: str):

        """

        鍚姩 FFmpeg 鎺ㄦ祦 (闅愯棌绐楀彛 + 鍏ㄥ眬绠＄悊)

        """

        # 濡傛灉宸茬粡瀛樺湪鍚屽悕鎺ㄦ祦,鍏堝仠姝㈡棫鐨?
        self.stop_ffmpeg_stream(stream_name)



        ffmpeg_path = self._get_ffmpeg_path()

        rtmp_url = f"rtmp://127.0.0.1:19350/live/{stream_name}"



        # V4 瀹岀編閰嶇疆

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

            # [淇敼鍏抽敭鐐筣 闅愯棌 CMD 绐楀彛

            startupinfo = None

            creationflags = 0



            if os.name == 'nt':

                # Windows 涓嬩娇?CREATE_NO_WINDOW (0x08000000) 褰诲簳闅愯棌

                creationflags = 0x08000000



            process = subprocess.Popen(

                command,

                stdout=subprocess.DEVNULL,

                stderr=subprocess.DEVNULL,

                creationflags=creationflags

            )



            # [鏂板] 瀛樺叆鍏ㄥ眬瀛楀吀

            FFMPEG_PROCESSES[stream_name] = process

            logger.info(f"Stream {stream_name} started (PID: {process.pid})")



            return process

        except Exception as e:

            logger.error(f"FFmpeg start failed: {e}")

            return None



    def stop_ffmpeg_stream(self, stream_name: str):

        """

        [鏂板] 鍋滄骞舵竻?FFmpeg 杩涚▼

        """

        global FFMPEG_PROCESSES

        process = FFMPEG_PROCESSES.get(stream_name)



        if process:

            try:

                logger.info(f"Stopping FFmpeg for {stream_name} (PID: {process.pid})...")

                process.terminate()  # 灏濊瘯娓╁拰鍏抽棴

                try:

                    process.wait(timeout=2)

                except subprocess.TimeoutExpired:

                    process.kill()  # 寮哄埗鍏抽棴

                logger.info(f"Stream {stream_name} stopped.")

            except Exception as e:

                logger.error(f"Error stopping stream {stream_name}: {e}")

            finally:

                # 鏃犺濡備綍浠庡瓧鍏镐腑绉婚櫎

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



    def _get_rtsp_url_for_device(self, db_video: VideoDevice) -> Optional[str]:

        if getattr(db_video, "rtsp_url", None) and str(db_video.rtsp_url).lower().startswith("rtsp://"):

            return db_video.rtsp_url



        if db_video.stream_url and str(db_video.stream_url).lower().startswith("rtsp://"):

            return db_video.stream_url



        if db_video.ip_address and db_video.username and db_video.password:

            return f"rtsp://{db_video.username}:{db_video.password}@{db_video.ip_address}:554/Streaming/Channels/1"



        return None



    def _get_ezviz_recordable_url(self, db_video: VideoDevice) -> Optional[str]:

        """Return a recordable URL for cloud devices."""

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



        rtsp_url = self._get_rtsp_url_for_device(db_video)

        if rtsp_url:

            return rtsp_url



        return None



    def start_ffmpeg_recording(self, video_id: int, source_url: str):

        if not source_url:

            logger.warning(f"褰曞儚鍚姩澶辫触,video_id={video_id} 缂哄皯鍙綍鍒跺湴鍧€")

            return None



        # 濡傛灉鍚屼竴璺綍鍍忚繘绋嬫鍦ㄨ繍琛屼笖婧愬湴鍧€鏈彉,涓嶈閲嶅惎?

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



        # 鐩存帴鍐欏埌璁惧鐩綍,閬垮厤鏃ユ湡瀛愮洰褰曚笉瀛樺湪瀵?ffmpeg 鏃犳硶钀界洏?

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

                    f"褰曞儚杩涚▼鍚姩鍚庣珛鍗抽€€?video_id={video_id}, returncode={process.returncode}, "

                    f"璇锋煡鐪嬫棩? {log_path}"

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

            logger.info(f"褰曞儚杩涚▼宸插惎?video_id={video_id}, pid={process.pid}, output={segment_pattern}")

            return process

        except Exception as e:

            logger.error(f"褰曞儚鍚姩澶辫触 video_id={video_id}: {e}")

            return None



    def stop_ffmpeg_recording(self, video_id: int):

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

            logger.error(f"鍋滄褰曞儚澶辫触 video_id={video_id}: {e}")

        finally:

            RECORDING_PROCESSES.pop(video_id, None)

            if log_file:

                try:

                    log_file.close()

                except Exception:

                    pass



    def _parse_segment_start(self, file_path: str) -> Optional[datetime]:

        try:

            name = os.path.basename(file_path).replace(".mp4", "")

            return datetime.strptime(name, "%Y%m%d_%H%M%S")

        except Exception:

            return None


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
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds)
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
            result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=timeout_seconds)
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
                        self._get_record_segment_seconds() + RECORD_SEGMENT_SAFE_MARGIN_SECONDS):
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

    def _get_segment_end(self, file_path: str, seg_start: datetime) -> datetime:
        duration = self._probe_segment_duration_seconds(file_path)
        if duration:
            return seg_start + timedelta(seconds=duration)
        return seg_start + timedelta(seconds=RECORD_SEGMENT_SECONDS)


    def _is_segment_usable(self, file_path: str, min_age_seconds: int = 6) -> bool:

        """Filter unfinished or corrupted segments."""

        try:

            if not os.path.exists(file_path):

                return False



            # 褰曞儚鎸夊浐瀹氬垎娈垫椂闀垮垏鐗?鑷冲皯绛夊緟涓€涓畬鏁村垎娈靛懆鏈熷啀鍙備笌鎷兼帴?

            # 閬垮厤鎶婁粛鍦ㄥ啓鍏ヤ腑鐨勫綋鍓嶅垎娈靛姞?concat?

            seg_start = self._parse_segment_start(file_path)

            if seg_start:

                if (datetime.now() - seg_start).total_seconds() < (

                        RECORD_SEGMENT_SECONDS + RECORD_SEGMENT_SAFE_MARGIN_SECONDS):

                    return False



            stat = os.stat(file_path)

            if stat.st_size < 64 * 1024:

                return False



            age = time.time() - stat.st_mtime

            if age < min_age_seconds:

                return False



            ffprobe_path = self._get_ffprobe_path()

            if not os.path.exists(ffprobe_path):

                # 娌℃湁 ffprobe 鏃惰嚦灏戜繚璇佹枃浠朵笉鏄€滄鍦ㄥ啓鍏モ€濈姸?

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

                return False



            # 浜屾鏍￠獙锛氬揩閫熻В?1 绉掕棰?灏芥棭鍓旈櫎鏄庢樉鎹熷潖鍒嗘

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

            return decode_result.returncode == 0

        except Exception:

            return False



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

                                f"褰曞儚杩涚▼宸查€€鍑?鍑嗗閲嶅惎 video_id={video_id}, returncode={proc.returncode}"

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

                        logger.warning(f"妫€鏌ュ綍鍍忚繘绋嬬姸鎬佸け璐?鍑嗗閲嶅惎 video_id={video_id}: {e}")

                        RECORDING_PROCESSES.pop(video_id, None)

                        RECORDING_PROCESSES.pop(str(video_id), None)



            elif entry is not None:

                try:

                    if entry.poll() is None:

                        should_start = False

                    else:

                        logger.warning(

                            f"褰曞儚杩涚▼宸查€€鍑?鍑嗗閲嶅惎 video_id={video_id}, returncode={entry.returncode}"

                        )

                        RECORDING_PROCESSES.pop(video_id, None)

                        RECORDING_PROCESSES.pop(str(video_id), None)

                except Exception as e:

                    logger.warning(f"妫€鏌ュ綍鍍忚繘绋嬬姸鎬佸け璐?鍑嗗閲嶅惎 video_id={video_id}: {e}")

                    RECORDING_PROCESSES.pop(video_id, None)

                    RECORDING_PROCESSES.pop(str(video_id), None)



            if not should_start:

                continue



            record_source = self._get_record_source_for_device(v)

            if record_source:

                logger.info(f"鍚姩/閲嶅惎褰曞儚 video_id={video_id}, source={record_source}")

                self.start_ffmpeg_recording(video_id, record_source)

            else:

                logger.warning(f"鏃犳硶鍚姩褰曞儚,video_id={video_id} 缂哄皯鍙綍鍒跺湴鍧€")

    

    def restart_all_recordings(self, mongo_db):

        # 鍋滄鎵€鏈夋鍦ㄥ綍鍒剁殑杩涚▼

        for video_id in list(RECORDING_PROCESSES.keys()):

            self.stop_ffmpeg_recording(video_id)

        # 浣跨敤鏂拌矾寰勯噸鏂板惎鍔ㄦ墍鏈夊綍?

        self.ensure_all_recordings(mongo_db)


    def _parse_datetime_input(self, value: datetime | str) -> datetime:

        if isinstance(value, datetime):

            return value



        if not isinstance(value, str):

            raise ValueError("Invalid datetime format")



        raw = value.strip()

        if not raw:

            raise ValueError("鏃堕棿鍙傛暟涓嶈兘涓虹┖")



        normalized = raw.replace(" ", "T")

        if normalized.endswith("Z"):

            normalized = normalized[:-1] + "+00:00"



        try:

            dt = datetime.fromisoformat(normalized)

        except ValueError:

            raise ValueError("鏃堕棿鏍煎紡鏃犳晥,鏀?ISO 鏍煎紡,濡?2026-03-24T09:47:00")



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

        

        # 濡傛灉鍦ㄩ粯?static 鐩綍涓??/static

        

        # 鍚﹀垯?/api/videos 鍔ㄦ€佽矾?

        # abs_file_path = 瀛樺偍鏍圭洰?recordings/璁惧ID/瑙嗛.mp4

        # 鐩稿璺緞闇€瑕佸幓?recordings 杩欎竴?



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



    def _collect_segments_for_timerange(self, video_id: int, start_dt: datetime, end_dt: datetime) -> list[

        tuple[str, datetime, datetime]]:

        seen = set()

        candidates: list[tuple[str, datetime, datetime]] = []

        

        for record_root in self._get_all_record_roots():

            device_root = os.path.join(record_root, str(video_id))

            if not os.path.isdir(device_root):

                continue



            for seg_path in sorted(glob.glob(os.path.join(device_root, "*.mp4"))):

                seg_filename = os.path.basename(seg_path)

                if seg_filename in seen:

                    continue

                    

                seg_start = self._parse_segment_start(seg_path)

                if not seg_start:

                    continue



                seg_end = self._get_segment_end(seg_path, seg_start)

                if seg_end <= start_dt or seg_start >= end_dt:

                    continue

                if not self._is_segment_usable(seg_path):

                    continue



                candidates.append((seg_path, seg_start, seg_end))

                seen.add(seg_filename)



        return candidates



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



        segments = self._collect_segments_for_timerange(video_id, start_dt, end_dt)

        if not segments:

            raise ValueError("鎵€閫夋椂闂存娌℃湁鍙敤褰曞儚鍒嗘")



        if output_type == "alarm":

            output_root = self._get_alarm_video_root()

        elif output_type == "temp":

            output_root = self._get_temp_playback_root()

        else:

            output_root = self._get_playback_video_root()

        os.makedirs(output_root, exist_ok=True)



        ffmpeg_path = self._get_ffmpeg_path()

        if not os.path.exists(ffmpeg_path):

            raise ValueError(f"鏈壘?ffmpeg: {ffmpeg_path}")



        first_seg_start = segments[0][1]

        concat_list_path = os.path.join(output_root, f"_concat_{video_id}_{uuid.uuid4().hex}.txt")

        concat_output_path = os.path.join(output_root, f"_concat_{video_id}_{uuid.uuid4().hex}.mp4")



        safe_prefix = (filename_prefix or "playback").replace(" ", "_")

        final_name = f"{safe_prefix}_{video_id}_{start_dt.strftime('%Y%m%d_%H%M%S')}_{end_dt.strftime('%Y%m%d_%H%M%S')}.mp4"

        final_output_path = os.path.join(output_root, final_name)



        try:

            with open(concat_list_path, "w", encoding="utf-8") as f:

                for seg_path, _, _ in segments:

                    safe_seg_path = seg_path.replace("\\", "/").replace("'", "\\'")

                    f.write(f"file '{safe_seg_path}'\n")



            concat_cmd = [

                ffmpeg_path,

                "-y",

                "-f", "concat",

                "-safe", "0",

                "-i", concat_list_path,

                "-c", "copy",

                concat_output_path,

            ]

            concat_proc = subprocess.run(

                concat_cmd,

                capture_output=True,

                text=True,

                encoding="utf-8",

                errors="replace",

            )

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

                concat_fallback_proc = subprocess.run(

                    concat_fallback_cmd,

                    capture_output=True,

                    text=True,

                    encoding="utf-8",

                    errors="replace",

                )

                if concat_fallback_proc.returncode != 0:

                    logger.error(

                        "Concat failed video_id=%s start=%s end=%s copy_err=%s reencode_err=%s",

                        video_id,

                        start_dt,

                        end_dt,

                        (concat_proc.stderr or "").strip()[-1200:],

                        (concat_fallback_proc.stderr or "").strip()[-1200:],

                    )

                    raise ValueError("褰曞儚鍒嗘鍚堝苟澶辫触")



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
            trim_proc = subprocess.run(
                trim_cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
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

                trim_fallback_proc = subprocess.run(

                    trim_fallback_cmd,

                    capture_output=True,

                    text=True,

                    encoding="utf-8",

                    errors="replace",

                )

                if trim_fallback_proc.returncode != 0:

                    raise ValueError("褰曞儚瑁佸壀澶辫触")



            if not os.path.exists(final_output_path) or os.path.getsize(final_output_path) == 0:

                raise ValueError("Generated video file is empty")



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



            return {

                "status": "success",

                "video_id": video_id,

                "start_time": start_dt.strftime("%Y-%m-%d %H:%M:%S"),

                "end_time": end_dt.strftime("%Y-%m-%d %H:%M:%S"),

                "duration_seconds": int((end_dt - start_dt).total_seconds()),

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

            raise ValueError("褰撳墠鏃堕棿绐楀彛鏃犲彲缂撳瓨鍐呭")



        # 鑻ュ綋鍓嶇獥鍙ｅ苟闈炰粠璧风偣灏卞紑濮嬫湁鍒嗘(渚嬪鏈嶅姟鍒氭仮澶?,鍏佽浠庣獥鍙ｅ唴鏈€鏃╁彲鐢ㄥ垎娈靛紑濮嬬敓鎴?

        available_segments = self._collect_segments_for_timerange(video_id, start_dt, now)

        if not available_segments:

            raise ValueError("褰撳墠鏃堕棿绐楀彛鏃犲彲缂撳瓨鍐呭")

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

        """Keep only the latest temporary cache videos per device."""

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



    def _list_saved_videos(self, root_dir: str, video_id: int, limit: int = 120) -> list[dict]:

        if not os.path.isdir(root_dir):

            return []



        clips: list[dict] = []

        for file_path in sorted(glob.glob(os.path.join(root_dir, "*.mp4")), reverse=True):

            file_name = os.path.basename(file_path)

            if f"_{video_id}_" not in file_name and not file_name.startswith(f"{video_id}_"):

                continue



            try:

                stat = os.stat(file_path)

                clips.append(

                    {

                        "name": file_name,

                        "size_bytes": int(stat.st_size),

                        "updated_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),

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

        return self._list_saved_videos(self._get_alarm_video_root(), video_id, limit)



    def list_temp_cache_videos(self, video_id: int, limit: int = 30) -> list[dict]:

        return self._list_saved_videos(self._get_temp_playback_root(), video_id, limit)



    def _get_alarm_screenshot_root(self) -> str:

        """Return alarm screenshot root."""

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

        """

        鑾峰彇鎸囧畾瑙嗛璁惧鐨勫綍鍒惰棰戝垪琛?鐩存帴浠庡綍鍒剁洰褰?

        鐢ㄤ簬"甯歌鐩戞帶鍥炴斁"

        """

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

                    updated_at = seg_start



                clips.append({

                    "name": file_name,

                    "size_bytes": int(stat.st_size),

                    "updated_at": updated_at.strftime("%Y-%m-%d %H:%M:%S"),

                    "web_path": self._to_backend_static_web_path(file_path),

                    "duration_text": self._format_bytes(stat.st_size) if stat.st_size < 1024*1024 else f"{stat.st_size/(1024*1024):.2f}MB",

                })

            except Exception:

                continue



            if len(clips) >= max(1, min(limit, 500)):

                break



        return clips



    def list_alarm_videos_direct(self, video_id: int, limit: int = 120, sort_order: str = "desc") -> list[dict]:

        """

        鑾峰彇鎸囧畾瑙嗛璁惧鐨勬姤璀﹀綍鍒惰棰戝垪琛?



        浼樺厛鐩存帴璇诲彇 static/alarm_videos 涓敱 save_playback_clip 鐢熸垚鐨勬姤璀﹁棰?

        鑻ュ巻鍙叉暟鎹皻鏈惤鐩樺埌璇ョ洰褰?鍒欏洖閫€鍒版棫閫昏緫锛氶€氳繃 static/alarms 鐨勬埅鍥惧拰

        static/recordings 鐨勫父瑙勫綍鍍忓弽鎺ㄦ姤璀﹁棰?

        鐢ㄤ簬"鎶ヨ鐩戞帶鍥炴斁"

        """

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

        """

        鑾峰彇鎸囧畾瑙嗛璁惧鐨勫憡璀︽埅鍥惧垪?

        鐢ㄤ簬"鍛婅鎴浘"

        """

        self._refresh_storage_paths()

        screenshots: list[dict] = []

        sort_reverse = sort_order.lower() == "desc"

        video_id_str = str(video_id)

        screenshot_files = []

        for alarm_root in self._get_alarm_screenshot_roots():

            screenshot_files.extend(glob.glob(os.path.join(alarm_root, "*.jpg")))

        

        for file_path in sorted(screenshot_files, reverse=sort_reverse):

            file_name = os.path.basename(file_path)

            # 绛涢€夊尮閰嶈璁惧鐨勫憡璀︽埅?(鏂囦欢鍚嶆牸? 358_*.jpg)

            if not file_name.startswith(f"{video_id_str}_") and f"_{video_id_str}_" not in file_name:

                continue

            

            try:

                stat = os.stat(file_path)

                screenshots.append({

                    "name": file_name,

                    "size_bytes": int(stat.st_size),

                    "updated_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),

                    "web_path": self._to_backend_static_web_path(file_path),

                    "thumbnail_path": self._to_backend_static_web_path(file_path),  # JPG鍙洿鎺ョ敤浣滅缉鐣ュ浘

                })

            except Exception:

                continue



            if len(screenshots) >= max(1, min(limit, 500)):

                break



        return screenshots

    def batch_update_organization(self, mongo_db, company=None, project=None, grid=None, team=None, device_ids=None):
        """批量更新设备的组织架构信息"""
        collection = self._video_collection()
        
        # 构建更新内容
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
        
        # 构建查询条件
        if device_ids:
            # 只更新指定的设备
            device_ids_str = [str(id) for id in device_ids]
            result = collection.update_many(
                {"id": {"$in": device_ids_str}},
                {"$set": update_data}
            )
        else:
            # 更新所有设备
            result = collection.update_many(
                {},
                {"$set": update_data}
            )
        
        return result.modified_count




