from __future__ import annotations

import json
import os
import pickle
import queue
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path
from threading import Lock, current_thread
from typing import Any

from .model_registry import ModelConfig


class YoloProcessDetector:
    def __init__(self, model_path: Path, config: ModelConfig):
        self.model_path = Path(model_path)
        self.config = config
        self.last_timing: dict[str, Any] = {}
        self._lock = Lock()
        self._process: subprocess.Popen | None = None
        self._reader_thread: threading.Thread | None = None
        self._responses: queue.Queue = queue.Queue()
        self._request_id = 0

    def _timeout_seconds(self) -> float:
        try:
            return max(1.0, float(os.getenv("AI_YOLO_PROCESS_TIMEOUT_SECONDS", "10")))
        except ValueError:
            return 10.0

    def _backend_dir(self) -> Path:
        return Path(__file__).resolve().parents[3]

    def _start(self):
        if self._process is not None and self._process.poll() is None:
            return
        self._stop()
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        env["AI_YOLO_WORKER_HELLO"] = json.dumps({"algorithm_code": self.config.algorithm_code})
        self._process = subprocess.Popen(
            [sys.executable, "-m", "app.services.ai_runtime.yolo_worker"],
            cwd=str(self._backend_dir()),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=None,
            env=env,
            creationflags=0x08000000 if os.name == "nt" else 0,
        )
        self._responses = queue.Queue()
        self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True, name=f"yolo-reader-{self.config.algorithm_code}")
        self._reader_thread.start()
        ready = self._read_message(timeout=self._timeout_seconds())
        if not ready or not ready.get("ok"):
            self._stop()
            raise RuntimeError(f"YOLO worker failed to start: {ready}")

    def _stop(self):
        process = self._process
        self._process = None
        self._reader_thread = None
        if process is None:
            return
        try:
            if process.stdin and process.poll() is None:
                self._write_message({"op": "stop"}, process=process)
        except Exception:
            pass
        try:
            process.wait(timeout=1.0)
        except Exception:
            try:
                process.terminate()
            except Exception:
                pass

    def _write_message(self, message: dict, process: subprocess.Popen | None = None):
        process = process or self._process
        if process is None or process.stdin is None:
            raise RuntimeError("YOLO worker stdin is not available")
        payload = pickle.dumps(message, protocol=pickle.HIGHEST_PROTOCOL)
        process.stdin.write(struct.pack("!I", len(payload)))
        process.stdin.write(payload)
        process.stdin.flush()

    def _read_exact_from_worker(self, size: int) -> bytes:
        process = self._process
        if process is None or process.stdout is None:
            raise RuntimeError("YOLO worker stdout is not available")
        chunks = []
        remaining = size
        while remaining > 0:
            if process.poll() is not None:
                raise RuntimeError(f"YOLO worker exited with code {process.returncode}")
            chunk = process.stdout.read(remaining)
            if not chunk:
                raise RuntimeError("YOLO worker pipe closed")
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def _reader_loop(self):
        while self._process is not None:
            try:
                header = self._read_exact_from_worker(4)
                size = struct.unpack("!I", header)[0]
                payload = self._read_exact_from_worker(size)
                self._responses.put(pickle.loads(payload))
            except Exception as exc:
                self._responses.put({"ok": False, "error": str(exc)})
                break

    def _read_message(self, timeout: float) -> dict:
        try:
            return self._responses.get(timeout=timeout)
        except queue.Empty as exc:
            raise TimeoutError(f"YOLO worker timed out after {timeout:.1f}s") from exc

    def detect(self, frame: Any, **kwargs) -> list[dict]:
        wait_started_at = time.time()
        with self._lock:
            lock_acquired_at = time.time()
            self._start()
            self._request_id += 1
            request_id = self._request_id
            request_started_at = time.time()
            self._write_message({
                "op": "detect",
                "request_id": request_id,
                "frame": frame,
                "kwargs": kwargs,
            })
            response = self._read_message(timeout=self._timeout_seconds())
            response_at = time.time()

        timing = dict(response.get("timing") or {})
        timing.update({
            "process": "worker",
            "parent_thread": current_thread().name,
            "parent_lock_wait_ms": int((lock_acquired_at - wait_started_at) * 1000),
            "parent_round_trip_ms": int((response_at - request_started_at) * 1000),
            "worker_pid": self._process.pid if self._process is not None else None,
        })
        self.last_timing = timing
        if not response.get("ok"):
            raise RuntimeError(response.get("error") or "YOLO worker failed")
        return response.get("detections") or []

    def __del__(self):
        try:
            self._stop()
        except Exception:
            pass
