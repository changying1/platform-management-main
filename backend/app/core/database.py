from sqlalchemy import create_engine
from sqlalchemy import inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm import declarative_base

from pymongo import MongoClient, ReturnDocument
from pymongo.database import Database
import os

Base = declarative_base()

import app.models.admin_user
import app.models.device
import app.models.video
import app.models.group_call
import app.models.fence
import app.models.alarm_records
import app.models.location_history


SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:123456@127.0.0.1:3306/company-management?charset=utf8mb4"


engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "smart_helmet_mongo")

mongo_client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=3000)
mongo_db: Database = mongo_client[MONGO_DB_NAME]
MONGO_COMPAT_DB_NAMES = list(dict.fromkeys([MONGO_DB_NAME, "platform", "smart_helmet_mongo"]))

def ensure_schema_compatibility():
    """Best-effort patch for legacy databases missing newly added columns."""
    required_columns = {
        "project_regions": {
            "project_id": "ALTER TABLE project_regions ADD COLUMN project_id INT NULL",
        },
        "alarm_records": {
            "project_id": "ALTER TABLE alarm_records ADD COLUMN project_id INT NULL",
        },
        "projects": {
            "description": "ALTER TABLE projects ADD COLUMN description TEXT NULL",
            "manager": "ALTER TABLE projects ADD COLUMN manager VARCHAR(100) NULL",
            "status": "ALTER TABLE projects ADD COLUMN status VARCHAR(20) NULL",
            "remark": "ALTER TABLE projects ADD COLUMN remark VARCHAR(255) NULL",
            "branch_id": "ALTER TABLE projects ADD COLUMN branch_id INT NULL",
        },
        "branches": {
            "province": "ALTER TABLE branches ADD COLUMN province VARCHAR(50) NULL",
            "lng": "ALTER TABLE branches ADD COLUMN lng DOUBLE NULL",
            "lat": "ALTER TABLE branches ADD COLUMN lat DOUBLE NULL",
            "address": "ALTER TABLE branches ADD COLUMN address VARCHAR(255) NULL",
            "project": "ALTER TABLE branches ADD COLUMN project VARCHAR(100) NULL",
            "manager": "ALTER TABLE branches ADD COLUMN manager VARCHAR(50) NULL",
            "phone": "ALTER TABLE branches ADD COLUMN phone VARCHAR(20) NULL",
            "device_count": "ALTER TABLE branches ADD COLUMN device_count INT NULL",
            "status": "ALTER TABLE branches ADD COLUMN status VARCHAR(20) NULL",
            "updated_at": "ALTER TABLE branches ADD COLUMN updated_at DATETIME NULL",
            "remark": "ALTER TABLE branches ADD COLUMN remark TEXT NULL",
        },
        "devices": {
            "ip_address": "ALTER TABLE devices ADD COLUMN ip_address VARCHAR(50) NULL"
        },
        "group_calls": {
            "member_ids": "ALTER TABLE group_calls ADD COLUMN member_ids TEXT NULL",
            "status": "ALTER TABLE group_calls ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'",
        },
        "video_devices": {
            "rtsp_url": "ALTER TABLE video_devices ADD COLUMN rtsp_url TEXT NULL",
            "stream_protocol": "ALTER TABLE video_devices ADD COLUMN stream_protocol VARCHAR(20) NULL",
            "platform_type": "ALTER TABLE video_devices ADD COLUMN platform_type VARCHAR(20) NULL",
            "access_source": "ALTER TABLE video_devices ADD COLUMN access_source VARCHAR(20) NULL",
            "ptz_source": "ALTER TABLE video_devices ADD COLUMN ptz_source VARCHAR(20) NULL",
            "device_serial": "ALTER TABLE video_devices ADD COLUMN device_serial VARCHAR(100) NULL",
            "channel_no": "ALTER TABLE video_devices ADD COLUMN channel_no INT NULL",
            "supports_ptz": "ALTER TABLE video_devices ADD COLUMN supports_ptz INT NOT NULL DEFAULT 1",
            "supports_preset": "ALTER TABLE video_devices ADD COLUMN supports_preset INT NOT NULL DEFAULT 1",
            "supports_cruise": "ALTER TABLE video_devices ADD COLUMN supports_cruise INT NOT NULL DEFAULT 1",
            "supports_zoom": "ALTER TABLE video_devices ADD COLUMN supports_zoom INT NOT NULL DEFAULT 1",
            "supports_focus": "ALTER TABLE video_devices ADD COLUMN supports_focus INT NOT NULL DEFAULT 0",
        },
    }

    with engine.begin() as conn:
        inspector = inspect(conn)
        existing_tables = set(inspector.get_table_names())

        for table_name, columns in required_columns.items():
            if table_name not in existing_tables:
                continue

            existing_columns = {c["name"] for c in inspector.get_columns(table_name)}
            for column_name, ddl in columns.items():
                if column_name in existing_columns:
                    continue
                conn.execute(text(ddl))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_mongo_db():
    return mongo_db


def get_compatible_mongo_db(collection_name: str | None = None):
    """
    Return the configured MongoDB database, or the first compatible legacy DB
    that already contains the requested collection.
    """
    if collection_name:
        existing_empty_db = None
        for db_name in MONGO_COMPAT_DB_NAMES:
            candidate = mongo_client[db_name]
            try:
                if collection_name in candidate.list_collection_names():
                    if existing_empty_db is None:
                        existing_empty_db = candidate
                    if candidate[collection_name].estimated_document_count() > 0:
                        return candidate
            except Exception:
                continue
        if existing_empty_db is not None:
            return existing_empty_db
    return mongo_db

def get_personnel_collection():
    return mongo_db["personnel"]

def get_device_collection():
    """MongoDB 定位设备集合，不是视频摄像头集合"""
    return mongo_db["device"]

def get_mongo_collection(collection_name: str, same_db_as: str | None = None):
    if same_db_as:
        return get_compatible_mongo_db(same_db_as)[collection_name]
    return get_compatible_mongo_db(collection_name)[collection_name]


def get_worker_collection():
    return get_mongo_collection("worker")

def get_personnel_collection():
    return get_mongo_collection("personnel")

def get_device_collection():
    """MongoDB 定位设备集合，不是视频摄像头集合"""
    return mongo_db["device"]

def get_video_device_collection():
    return get_mongo_collection("video_device")

def get_alarm_record_collection():
    return get_mongo_collection("alarm_record")

def get_tts_message_job_collection():
    """MongoDB TTS消息任务集合"""
    return mongo_db["tts_message_job"]

def get_next_sequence(name: str, db: Database | None = None) -> int:
    """
    预留自增序列生成器。
    如果后面需要把 alarm_record.id 做成数字流水号，可以启用 counters 集合。
    当前先保留接口，后面再决定是否真的使用。
    """
    target_db = db if db is not None else get_compatible_mongo_db("counters")
    counters = target_db["counters"]
    result = counters.find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(result["seq"])
