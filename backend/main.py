import os
import sys
import logging
import threading
import asyncio
import json
import subprocess
from contextlib import asynccontextmanager
from functools import lru_cache
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, WebSocket, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
import httpx

# 淇鍦?Windows 鐜涓嬮潰锛岀敱浜庡墠绔粍浠?鐗瑰埆鏄棰戠粍浠?鍒嗘璇锋眰(鏂偣缁紶MP4)鏃跺彇娑堟墍寮曞彂鐨勫簳灞傛姤閿欍€?
if sys.platform == 'win32':
    try:
        from asyncio.proactor_events import _ProactorBasePipeTransport
        _orig = _ProactorBasePipeTransport._call_connection_lost
        def _patch(self, exc):
            try:
                _orig(self, exc)
            except (ConnectionResetError, ConnectionAbortedError, OSError):
                pass
        _ProactorBasePipeTransport._call_connection_lost = _patch
    except Exception:
        pass

# 鍦ㄦā鍧楀鍏ラ樁娈靛姞杞?.env锛岄伩鍏嶄緷璧?__main__ 鍒嗘敮瀵艰嚧閰嶇疆澶辨晥
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

from app.core.database import engine, Base, SessionLocal, ensure_schema_compatibility
from app.services.video_service import DEFAULT_VIDEO_STORAGE_FOLDERS
from app.controllers import (
    admin_controller,
    device_controller,
    video_controller,
    fence_controller,
    team_controller,
    alarm_controller,
    call_controller,
    dashboard_controller,
    auth_controller,
    project_controller,
    backup_controller,
    personnel_controller,
    llm_controller,
    grid_controller,
    grid_personnel_controller,
    responsibility_unit_controller,
    log_controller,
    app_voice_call_controller,
    ai_algorithm_controller,
    permission_controller,
)
from app.utils.logger import get_logger
from app.core.security import current_user_from_token, get_current_user
from app.core.data_scope import in_scope
from app.core.database import get_mongo_collection
from app.core.ws_manager import register_alarm_client, set_main_event_loop, unregister_alarm_client
from app.services.video_service import VideoService
from app.services.jt808_service import jt808_manager
from app.services.device_location_history_service import device_location_history_service
from app.services.tts_queue_service import tts_queue_service
from app.services.Fence.fence_polling_service import fence_polling_service
from app.services.track_cleanup_service import track_cleanup_service

# --- 鏃ュ織閰嶇疆 ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(name)s | %(levelname)s | %(message)s'
)
logger = get_logger("Main")

# --- 鐢熷懡鍛ㄦ湡绠＄悊 (Lifespan) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 銆愬惎鍔ㄩ樁娈点€?
    set_main_event_loop(asyncio.get_running_loop())
    logger.info("Initializing system services...")
    device_location_history_service.ensure_indexes()
    
    # 1. 鍚姩 JT808 TCP 鏈嶅姟绾跨▼
    logger.info("Starting JT808 TCP service on port 8989...")
    jt_thread = threading.Thread(target=jt808_manager.start_server, daemon=True)
    jt_thread.start()
    
    # 2. 鍚姩 TTS 璇煶鎾姤闃熷垪 worker
    logger.info("Starting TTS queue worker...")
    tts_queue_service.start()
    
    # 3. 鍚姩鍥存爮妫€娴嬭疆璇㈡湇鍔?
    logger.info("Starting fence polling service...")
    fence_polling_service.start()
    
    # 4. 鍚姩杞ㄨ抗鏁版嵁娓呯悊鏈嶅姟
    logger.info("Starting track cleanup service...")
    track_cleanup_service.start()

    def restore_ai_monitors_after_startup():
        try:
            # Let the API finish booting before model loading and cloud snapshot calls begin.
            import time
            from app.services.ai_manager import ai_manager

            time.sleep(2)
            ai_manager.restore_configured_monitors()
        except Exception as e:
            logger.error(f"AI monitor restore failed: {e}", exc_info=True)

    logger.info("Scheduling AI monitor restore...")
    threading.Thread(target=restore_ai_monitors_after_startup, daemon=True).start()
    
    """
    # 2. 瑙嗛褰曞儚鐘舵€佽嚜妫€ (澧炲姞寮傚父淇濇姢)
    db = SessionLocal()
    try:
        logger.info("Checking video device recording status...")
        # 鍗充娇杩欓噷鎶ラ敊(姣斿鎽勫儚澶磋繛涓嶄笂)锛屼篃涓嶄細寮勬寕涓荤▼搴?
        VideoService().ensure_all_recordings(db)
        logger.info("Video recordings initialized.")
    except Exception as e:
        logger.error(f"Video Recording Check Failed: {e}. (System will continue to run)")
    finally:
        db.close()
    """
    
    yield
    
    # 銆愬叧闂樁娈点€?
    set_main_event_loop(None)
    logger.info("Shutting down services...")
    fence_polling_service.stop()
    track_cleanup_service.stop()
    jt808_manager.running = False
    tts_queue_service.stop()

# --- App 鍒濆鍖?---
# Base.metadata.create_all(bind=engine)
ensure_schema_compatibility()
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 闈欐€佽祫婧?
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)

# 鍔ㄦ€佽棰戣闂矾鐢憋紙鏀寔鑷畾涔夊瓨鍌ㄨ矾寰勶級
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "system_config.json")
DEFAULT_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
STORAGE_PATHS_FILE = os.path.join(DEFAULT_STATIC_DIR, "storage_paths.json")

def get_storage_root():
    custom_path = None
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                custom_path = config.get('videoStoragePath')
        except:
            pass
    
    if custom_path:
        return custom_path
    return os.path.join(os.path.dirname(__file__), "static")

def get_configured_storage_roots():
    roots = []
    config_files = [STORAGE_PATHS_FILE]
    system_storage_paths_file = os.path.join(os.path.abspath(get_storage_root()), "storage_paths.json")
    if system_storage_paths_file not in config_files:
        config_files.append(system_storage_paths_file)

    for config_file in config_files:
        if not os.path.exists(config_file):
            continue
        try:
            with open(config_file, "r", encoding="utf-8-sig") as f:
                data = json.load(f)
            paths = data if isinstance(data, list) else data.get("paths", [])
            if isinstance(paths, list):
                for item in paths:
                    if not isinstance(item, dict) or not item.get("enabled", True):
                        continue
                    path = item.get("path")
                    abs_path = os.path.abspath(path) if path else ""
                    if abs_path and item.get("type", "mirror") in {"mirror", "primary"} and abs_path not in roots:
                        roots.append(abs_path)
        except Exception as e:
            logger.warning(f"Failed to load storage paths from {config_file}: {e}")

    primary = os.path.abspath(get_storage_root())
    if not roots:
        roots.append(primary)
    elif primary not in roots:
        roots.append(primary)

    default_static = os.path.abspath(DEFAULT_STATIC_DIR)
    if default_static not in roots:
        roots.append(default_static)

    return roots

def _safe_join(root: str, relative_path: str):
    normalized = os.path.normpath(relative_path).lstrip("\\/")
    full_path = os.path.abspath(os.path.join(root, normalized))
    root_abs = os.path.abspath(root)
    if full_path == root_abs or full_path.startswith(root_abs + os.sep):
        return full_path
    return None

def _get_ffprobe_path() -> str:
    ffmpeg_path = os.getenv(
        "FFMPEG_PATH",
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "ffmpeg-8.0.1-essentials_build",
            "bin",
            "ffmpeg.exe",
        ),
    )
    return os.path.join(os.path.dirname(ffmpeg_path), "ffprobe.exe")

@lru_cache(maxsize=2048)
def _is_playable_video_cached(file_path: str, size: int, mtime: float) -> bool:
    if size <= 0:
        return False

    ffprobe_path = _get_ffprobe_path()
    if not os.path.exists(ffprobe_path):
        return True

    try:
        result = subprocess.run(
            [
                ffprobe_path,
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_name",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path,
            ],
            capture_output=True,
            text=True,
            timeout=6,
        )
        return result.returncode == 0 and bool((result.stdout or "").strip())
    except Exception:
        return False

def _is_playable_video_file(file_path: str) -> bool:
    try:
        if not os.path.isfile(file_path):
            return False
        stat = os.stat(file_path)
        return _is_playable_video_cached(file_path, int(stat.st_size), float(stat.st_mtime))
    except Exception:
        return False

def find_video_file_with_fallback(subdir: str, file_path: str):
    relative_path = os.path.join(subdir, file_path)
    for storage_root in get_configured_storage_roots():
        full_path = _safe_join(storage_root, relative_path)
        if full_path and _is_playable_video_file(full_path):
            return full_path
    return None

def _get_video_storage_folder(subdir: str) -> str:
    config_path = os.path.join(os.path.dirname(__file__), "system_config.json")
    configured = {}
    try:
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
            configured = config.get("videoStorageFolders") or {}
    except Exception:
        configured = {}

    default = DEFAULT_VIDEO_STORAGE_FOLDERS.get(subdir, subdir)
    name = str(configured.get(subdir, default) or "").strip().replace("\\", "/").strip("/")
    if not name or name in {".", ".."} or "/" in name or any(ch in name for ch in '<>:"|?*'):
        return default
    return name

def find_configured_video_file_with_fallback(subdir: str, file_path: str):
    configured_subdir = _get_video_storage_folder(subdir)
    full_path = find_video_file_with_fallback(configured_subdir, file_path)
    if full_path:
        return full_path
    if configured_subdir != subdir:
        return find_video_file_with_fallback(subdir, file_path)
    return None

def find_configured_static_file_with_fallback(subdirs: list[str], file_path: str, allowed_exts: tuple[str, ...]):
    configured_subdirs = []
    for subdir in subdirs:
        configured_subdirs.append(_get_video_storage_folder(subdir))
        configured_subdirs.append(subdir)
    return find_static_file_with_fallback(list(dict.fromkeys(configured_subdirs)), file_path, allowed_exts)

def find_static_file_with_fallback(subdirs: list[str], file_path: str, allowed_exts: tuple[str, ...]):
    lower_name = file_path.lower()
    if not lower_name.endswith(allowed_exts):
        return None

    for storage_root in get_configured_storage_roots():
        for subdir in subdirs:
            full_path = _safe_join(storage_root, os.path.join(subdir, file_path))
            if full_path and os.path.isfile(full_path):
                return full_path
    return None

def serve_video_file(full_path: str, request: Request):
    file_size = os.path.getsize(full_path)
    range_header = request.headers.get("range")
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": "video/mp4",
    }

    if not range_header:
        headers["Content-Length"] = str(file_size)
        return FileResponse(full_path, media_type="video/mp4", headers=headers)

    try:
        units, byte_range = range_header.split("=", 1)
        if units.strip().lower() != "bytes":
            raise ValueError("unsupported range unit")
        start_text, _, end_text = byte_range.partition("-")
        start = int(start_text) if start_text else 0
        end = int(end_text) if end_text else file_size - 1
        start = max(0, start)
        end = min(file_size - 1, end)
        if start > end:
            raise ValueError("invalid range")
    except Exception:
        return FileResponse(full_path, status_code=416, media_type="video/mp4", headers={
            "Content-Range": f"bytes */{file_size}",
            "Accept-Ranges": "bytes",
        })

    chunk_size = end - start + 1

    def iter_file():
        with open(full_path, "rb") as video_file:
            video_file.seek(start)
            remaining = chunk_size
            while remaining > 0:
                data = video_file.read(min(1024 * 1024, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers.update({
        "Content-Length": str(chunk_size),
        "Content-Range": f"bytes {start}-{end}/{file_size}",
    })
    return StreamingResponse(iter_file(), status_code=206, media_type="video/mp4", headers=headers)


def _extract_token_from_request(request: Request):
    authorization = request.headers.get("Authorization") or ""
    if authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1]
    return request.headers.get("X-Auth-Token") or request.query_params.get("token") or request.cookies.get("auth_token")


def _current_user_from_request(request: Request):
    user = current_user_from_token(_extract_token_from_request(request))
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


def _scope_kwargs() -> dict:
    return {
        "project_fields": ("project_id",),
        "grid_fields": ("grid_id", "grid"),
        "team_fields": ("team_id",),
        "branch_fields": ("branch_id",),
        "company_fields": ("company", "department"),
        "project_name_fields": ("project",),
        "team_name_fields": ("team", "workTeam", "work_team"),
    }


def _safe_int(value):
    try:
        return int(value)
    except Exception:
        return None


def _video_doc_for_path(file_path: str):
    parts = os.path.normpath(file_path).split(os.sep)
    candidates = []
    if parts:
        candidates.append(parts[0])

    filename = os.path.basename(file_path)
    for token in filename.replace(".", "_").split("_"):
        if token.isdigit():
            candidates.append(token)

    seen = set()
    collection = get_mongo_collection("video_device")
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        numeric = _safe_int(candidate)
        query_values = [candidate]
        if numeric is not None:
            query_values.append(numeric)
        doc = collection.find_one({"id": {"$in": query_values}})
        if doc:
            return VideoService()._enrich_video_org_scope(doc)
    return None


def _alarm_doc_for_path(file_path: str):
    normalized = "/" + os.path.normpath(file_path).replace("\\", "/").lstrip("/")
    filename = os.path.basename(normalized)
    clauses = [
        {"recording_path": {"$regex": filename}},
        {"video_clip_url": {"$regex": filename}},
        {"alarm_image_path": {"$regex": filename}},
        {"snapshot_url": {"$regex": filename}},
    ]
    return get_mongo_collection("alarm_record").find_one({"$or": clauses})


def _ensure_media_scope(kind: str, file_path: str, current_user: dict):
    docs = []

    if kind in {"alarm_video", "alarm_screenshot"}:
        alarm_doc = _alarm_doc_for_path(file_path)
        if alarm_doc:
            if in_scope(alarm_doc, current_user, **_scope_kwargs()):
                return
            raise HTTPException(status_code=404, detail="File not found")

    if kind in {"recording", "playback", "alarm_video", "alarm_screenshot"}:
        video_doc = _video_doc_for_path(file_path)
        if video_doc:
            docs.append(video_doc)

    if not docs or not any(in_scope(doc, current_user, **_scope_kwargs()) for doc in docs):
        raise HTTPException(status_code=404, detail="File not found")


def _ensure_person_face_scope(file_path: str, current_user: dict):
    normalized = os.path.basename(os.path.normpath(file_path))
    doc = get_mongo_collection("personnel").find_one({"faceImage": {"$regex": normalized}})
    if not doc or not in_scope(
        doc,
        current_user,
        project_fields=("projectId", "project_id"),
        grid_fields=("gridId", "grid_id", "gridIds", "grid_ids"),
        team_fields=("teamId", "team_id"),
        branch_fields=("branchId", "branch_id"),
        company_fields=("company", "dept", "department"),
        project_name_fields=("project",),
        team_name_fields=("team", "workTeam", "work_team"),
    ):
        raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/videos/{file_path:path}")
def serve_video(file_path: str, request: Request, current_user: dict = Depends(get_current_user)):
    _ensure_media_scope("recording", file_path, current_user)
    full_path = find_configured_video_file_with_fallback("recordings", file_path)
    if full_path:
        return serve_video_file(full_path, request)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/alarm_videos/{file_path:path}")
def serve_alarm_video(file_path: str, request: Request):
    full_path = find_configured_video_file_with_fallback("alarm_videos", file_path)
    if full_path:
        return serve_video_file(full_path, request)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/playback_videos/{file_path:path}")
def serve_playback_video(file_path: str, request: Request, current_user: dict = Depends(get_current_user)):
    _ensure_media_scope("playback", file_path, current_user)
    full_path = find_configured_video_file_with_fallback("playback_videos", file_path)
    if full_path:
        return serve_video_file(full_path, request)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/alarm_screenshots/{file_path:path}")
def serve_alarm_screenshot(file_path: str):
    full_path = find_configured_static_file_with_fallback(
        ["alarms", "alarm_screenshots"],
        file_path,
        (".jpg", ".jpeg", ".png", ".webp"),
    )
    if full_path:
        return FileResponse(full_path)
    raise HTTPException(status_code=404, detail="File not found")

# 璺敱鎸傝浇
@app.get("/static/alarms/{file_path:path}")
def serve_static_alarm_screenshot(file_path: str):
    full_path = find_configured_static_file_with_fallback(
        ["alarms", "alarm_screenshots"],
        file_path,
        (".jpg", ".jpeg", ".png", ".webp"),
    )
    if full_path:
        return FileResponse(full_path)
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/static/alarm_screenshots/{file_path:path}")
def serve_static_alarm_screenshot_alt(file_path: str):
    return serve_static_alarm_screenshot(file_path)


@app.get("/static/faces/{file_path:path}")
def serve_static_face(file_path: str, current_user: dict = Depends(get_current_user)):
    _ensure_person_face_scope(file_path, current_user)
    full_path = find_static_file_with_fallback(
        ["faces"],
        file_path,
        (".jpg", ".jpeg", ".png", ".webp"),
    )
    if full_path:
        return FileResponse(full_path)
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/static/recordings/{file_path:path}")
def serve_static_recording_video(file_path: str, request: Request):
    if file_path.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        full_path = find_configured_static_file_with_fallback(
            ["recordings"],
            file_path,
            (".jpg", ".jpeg", ".png", ".webp"),
        )
        if full_path:
            return FileResponse(full_path)
        raise HTTPException(status_code=404, detail="File not found")

    current_user = _current_user_from_request(request)
    _ensure_media_scope("recording", file_path, current_user)
    full_path = find_configured_video_file_with_fallback("recordings", file_path)
    if full_path:
        return serve_video_file(full_path, request)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/static/alarm_videos/{file_path:path}")
def serve_static_alarm_video(file_path: str, request: Request):
    full_path = find_configured_video_file_with_fallback("alarm_videos", file_path)
    if full_path:
        return serve_video_file(full_path, request)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/static/playback_videos/{file_path:path}")
def serve_static_playback_video(file_path: str, request: Request, current_user: dict = Depends(get_current_user)):
    _ensure_media_scope("playback", file_path, current_user)
    full_path = find_configured_video_file_with_fallback("playback_videos", file_path)
    if full_path:
        return serve_video_file(full_path, request)
    raise HTTPException(status_code=404, detail="File not found")

public_images_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "images")
if os.path.isdir(public_images_dir):
    app.mount("/images", StaticFiles(directory=public_images_dir), name="images")

app.include_router(admin_controller.router)
app.include_router(personnel_controller.router)
app.include_router(device_controller.router)
app.include_router(device_controller.db_router)
app.include_router(video_controller.router)
app.include_router(fence_controller.router)
app.include_router(team_controller.router)
app.include_router(alarm_controller.router)
app.include_router(call_controller.router)
app.include_router(dashboard_controller.router)
app.include_router(auth_controller.router)
app.include_router(project_controller.router)
app.include_router(backup_controller.router)
app.include_router(llm_controller.router)
app.include_router(grid_controller.router)
app.include_router(grid_personnel_controller.router)
app.include_router(responsibility_unit_controller.router)
app.include_router(log_controller.router)
app.include_router(app_voice_call_controller.router)
app.include_router(app_voice_call_controller.ws_router)
app.include_router(ai_algorithm_controller.router)
app.include_router(permission_controller.router)

logger.info("AI assistant service integrated into backend")
logger.info("AI API: http://localhost:9000/api/ai")
logger.info("AI health check: http://localhost:9000/api/ai/health")

# LLM_SERVICE_URL = "http://localhost:8888"  # 宸查泦鎴愶紝鏃犻渶杞彂

# LLM 鏈嶅姟宸查泦鎴愬埌涓诲悗绔紝鏃犻渶浠ｇ悊杞彂
# 鍘熶唬鐞嗕唬鐮佸凡娉ㄩ噴锛岀洿鎺ョ敱 llm_controller 澶勭悊

@app.get("/")
def root():
    return {"status": "running", "message": "Smart Helmet Platform API"}

# --- WebSocket ---
@app.websocket("/ws/alarm")
async def alarm_ws(websocket: WebSocket):
    token = (
        websocket.query_params.get("token")
        or websocket.cookies.get("auth_token")
        or websocket.headers.get("X-Auth-Token")
    )
    current_user = current_user_from_token(token)
    if not current_user:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    register_alarm_client(websocket, current_user)
    try:
        while True:
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        # 鏈嶅姟鍋滄鏃?websocket 浠诲姟琚彇娑堬紝灞炰簬姝ｅ父閫€鍑烘祦绋?
        pass
    finally:
        unregister_alarm_client(websocket)

# --- 鍚姩鍏ュ彛 ---
if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    port = int(os.getenv("BACKEND_PORT", 9000))
    
    try:
        uvicorn.run(app, host=host, port=port)
    except KeyboardInterrupt:
        print("\nShutdown by user.")
