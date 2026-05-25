import threading
import uuid
from datetime import datetime, timedelta
from typing import Any

from pymongo import ReturnDocument

from app.core.database import get_mongo_collection
from app.services.jt808_service import jt808_manager
from app.utils.logger import get_logger

logger = get_logger("TtsQueue")

STATUS_QUEUED = "queued"
STATUS_SENDING = "sending"
STATUS_ACKED = "acked"
STATUS_RETRY_WAIT = "retry_wait"
STATUS_FAILED = "failed"

FINAL_STATUSES = {STATUS_ACKED, STATUS_FAILED}


def _utcnow() -> datetime:
    return datetime.utcnow()


def _get_collection():
    return get_mongo_collection("tts_message_job")


def _serialize_job(job: dict) -> dict:
    return {
        "id": str(job.get("_id")),
        "device_phone": job.get("device_phone", ""),
        "device_name": job.get("device_name"),
        "status": job.get("status", STATUS_QUEUED),
        "retry_count": int(job.get("retry_count", 0)),
        "max_retries": int(job.get("max_retries", 3)),
        "jt808_sequence": job.get("jt808_sequence"),
        "sent_at": job.get("sent_at"),
        "acked_at": job.get("acked_at"),
        "finished_at": job.get("finished_at"),
        "last_error": job.get("last_error"),
    }


class TtsQueueService:
    def __init__(self):
        self._worker_thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()

    def start(self):
        if self._worker_thread and self._worker_thread.is_alive():
            return

        self._stop_event.clear()
        self._wake_event.clear()
        self._worker_thread = threading.Thread(target=self._run_worker, daemon=True)
        self._worker_thread.start()
        logger.info("TTS queue worker started")

    def stop(self):
        self._stop_event.set()
        self._wake_event.set()

        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=3)

        logger.info("TTS queue worker stopped")

    def enqueue_batch(
        self,
        *,
        text: str,
        target_phones: list[str],
        priority: int = 100,
        max_retries: int = 3,
        request_source: str = "group_call",
        operator: str | None = None,
    ) -> dict[str, Any]:
        normalized_text = text.strip()

        unique_phones: list[str] = []
        seen = set()

        for phone in target_phones:
            normalized_phone = str(phone).strip()
            if normalized_phone and normalized_phone not in seen:
                unique_phones.append(normalized_phone)
                seen.add(normalized_phone)

        batch_id = uuid.uuid4().hex[:16]
        now = _utcnow()

        docs = []
        for phone in unique_phones:
            device = jt808_manager.ensure_device_exists(phone)

            docs.append({
                "batch_id": batch_id,
                "device_phone": phone,
                "device_name": device.get("device_name"),
                "text": normalized_text,
                "status": STATUS_QUEUED,
                "priority": priority,
                "retry_count": 0,
                "max_retries": max_retries,
                "next_retry_at": now,
                "request_source": request_source,
                "operator": operator,
                "jt808_sequence": None,
                "sent_at": None,
                "acked_at": None,
                "finished_at": None,
                "last_error": None,
                "created_at": now,
                "updated_at": now,
            })

        collection = _get_collection()

        if docs:
            collection.insert_many(docs)

        logger.info(f"TTS batch {batch_id} queued for {len(unique_phones)} device(s)")
        self._wake_event.set()

        return self.get_batch(batch_id)

    def get_batch(self, batch_id: str) -> dict[str, Any]:
        collection = _get_collection()
        jobs = list(
            collection
            .find({"batch_id": batch_id})
            .sort("created_at", 1)
        )

        if not jobs:
            return {
                "batch_id": batch_id,
                "text": "",
                "request_source": None,
                "operator": None,
                "created_at": _utcnow(),
                "requested_count": 0,
                "queued_count": 0,
                "sending_count": 0,
                "acked_count": 0,
                "failed_count": 0,
                "retry_wait_count": 0,
                "jobs": [],
            }

        return self._build_batch_response(jobs)

    def list_batches(self, limit: int = 20) -> list[dict[str, Any]]:
        collection = _get_collection()

        pipeline = [
            {
                "$group": {
                    "_id": "$batch_id",
                    "created_at": {"$max": "$created_at"},
                }
            },
            {"$sort": {"created_at": -1}},
            {"$limit": limit},
        ]

        rows = list(collection.aggregate(pipeline))
        batch_ids = [row["_id"] for row in rows]

        return [self.get_batch(batch_id) for batch_id in batch_ids]

    def _run_worker(self):
        while not self._stop_event.is_set():
            try:
                processed = self._process_next_job()
                if processed:
                    continue
            except Exception as exc:
                logger.error(f"TTS worker loop error: {exc}")

            self._wake_event.wait(timeout=1.0)
            self._wake_event.clear()

    def _process_next_job(self) -> bool:
        collection = _get_collection()
        now = _utcnow()

        job = collection.find_one_and_update(
            {
                "status": {"$in": [STATUS_QUEUED, STATUS_RETRY_WAIT]},
                "next_retry_at": {"$lte": now},
            },
            {
                "$set": {
                    "status": STATUS_SENDING,
                    "sent_at": now,
                    "updated_at": now,
                }
            },
            sort=[
                ("priority", -1),
                ("created_at", 1),
                ("_id", 1),
            ],
            return_document=ReturnDocument.AFTER,
        )

        if not job:
            return False

        self._deliver_job(job["_id"])
        return True

    def _deliver_job(self, job_id):
        collection = _get_collection()

        job = collection.find_one({"_id": job_id})
        if not job:
            return

        result = jt808_manager.send_tts(
            job.get("device_phone"),
            job.get("text"),
            await_ack=True,
            ack_timeout=5.0,
        )

        now = _utcnow()
        update_data = {
            "jt808_sequence": result.get("sequence"),
            "updated_at": now,
        }

        if result.get("success"):
            update_data.update({
                "status": STATUS_ACKED,
                "acked_at": now,
                "finished_at": now,
                "last_error": None,
            })

            collection.update_one(
                {"_id": job_id},
                {"$set": update_data}
            )

            logger.info(f"TTS job {job_id} acked by {job.get('device_phone')}")
            return

        retry_count = int(job.get("retry_count", 0)) + 1
        last_error = str(result.get("message") or "Unknown send error")

        update_data["retry_count"] = retry_count
        update_data["last_error"] = last_error

        temp_job = {
            **job,
            "retry_count": retry_count,
            "last_error": last_error,
        }

        if self._should_retry(temp_job):
            update_data.update({
                "status": STATUS_RETRY_WAIT,
                "next_retry_at": now + timedelta(
                    seconds=self._next_retry_delay(retry_count)
                ),
            })

            collection.update_one(
                {"_id": job_id},
                {"$set": update_data}
            )

            logger.warning(
                f"TTS job {job_id} retry scheduled for {job.get('device_phone')}, "
                f"retry={retry_count}, error={last_error}"
            )

            self._wake_event.set()
        else:
            update_data.update({
                "status": STATUS_FAILED,
                "finished_at": now,
            })

            collection.update_one(
                {"_id": job_id},
                {"$set": update_data}
            )

            logger.error(
                f"TTS job {job_id} failed for {job.get('device_phone')}: {last_error}"
            )

    def _should_retry(self, job: dict) -> bool:
        retry_count = int(job.get("retry_count", 0))
        max_retries = int(job.get("max_retries", 3))

        if retry_count > max_retries:
            return False

        permanent_markers = [
            "Text cannot be empty",
            "Text contains characters outside GBK encoding",
            "Text exceeds the JT808 1024-byte limit",
        ]

        last_error = job.get("last_error") or ""
        return not any(marker in last_error for marker in permanent_markers)

    def _next_retry_delay(self, retry_count: int) -> int:
        schedule = [3, 5, 10, 15, 30]
        index = min(max(retry_count - 1, 0), len(schedule) - 1)
        return schedule[index]

    def _build_batch_response(self, jobs: list[dict]) -> dict[str, Any]:
        first_job = min(
            jobs,
            key=lambda item: item.get("created_at") or _utcnow()
        )

        queued_count = sum(
            1 for item in jobs
            if item.get("status") == STATUS_QUEUED
        )
        sending_count = sum(
            1 for item in jobs
            if item.get("status") == STATUS_SENDING
        )
        acked_count = sum(
            1 for item in jobs
            if item.get("status") == STATUS_ACKED
        )
        failed_count = sum(
            1 for item in jobs
            if item.get("status") == STATUS_FAILED
        )
        retry_wait_count = sum(
            1 for item in jobs
            if item.get("status") == STATUS_RETRY_WAIT
        )

        return {
            "batch_id": first_job.get("batch_id"),
            "text": first_job.get("text", ""),
            "request_source": first_job.get("request_source"),
            "operator": first_job.get("operator"),
            "created_at": first_job.get("created_at") or _utcnow(),
            "requested_count": len(jobs),
            "queued_count": queued_count,
            "sending_count": sending_count,
            "acked_count": acked_count,
            "failed_count": failed_count,
            "retry_wait_count": retry_wait_count,
            "jobs": [_serialize_job(item) for item in jobs],
        }


tts_queue_service = TtsQueueService()
