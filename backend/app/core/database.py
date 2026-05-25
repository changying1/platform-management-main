import os

from pymongo import MongoClient, ReturnDocument
from pymongo.database import Database

try:
    from sqlalchemy.orm import declarative_base
except Exception:
    declarative_base = None


Base = declarative_base() if declarative_base else object
engine = None
SQLALCHEMY_DATABASE_URL = ""


class MongoSessionCompat:
    """Small compatibility wrapper for code paths that still call SessionLocal()."""

    def __init__(self, db: Database):
        self.mongo_db = db

    def close(self):
        return None

    def get_bind(self):
        return None


def SessionLocal():
    return MongoSessionCompat(mongo_db)


MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "smart_helmet_mongo")

mongo_client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=3000)
mongo_db: Database = mongo_client[MONGO_DB_NAME]
MONGO_COMPAT_DB_NAMES = list(dict.fromkeys([MONGO_DB_NAME, "platform", "smart_helmet_mongo"]))


def ensure_schema_compatibility():
    """MongoDB does not need SQL schema compatibility checks."""
    return None


def get_db():
    """Compatibility dependency for routes that used to accept a SQL session."""
    yield mongo_db


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


def get_mongo_collection(collection_name: str, same_db_as: str | None = None):
    if same_db_as:
        return get_compatible_mongo_db(same_db_as)[collection_name]
    return get_compatible_mongo_db(collection_name)[collection_name]


def get_worker_collection():
    return get_mongo_collection("worker")


def get_personnel_collection():
    return get_mongo_collection("personnel")


def get_device_collection():
    """MongoDB positioning device collection, not the video camera collection."""
    return get_mongo_collection("device")


def get_video_device_collection():
    return get_mongo_collection("video_device")


def get_alarm_record_collection():
    return get_mongo_collection("alarm_record")


def get_tts_message_job_collection():
    return get_mongo_collection("tts_message_job")


def get_next_sequence(name: str, db: Database | None = None) -> int:
    target_db = db if db is not None else get_compatible_mongo_db("counters")
    counters = target_db["counters"]
    result = counters.find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(result["seq"])
