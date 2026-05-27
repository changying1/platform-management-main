import os
import sys
import logging
import threading
import asyncio
import json
import re
import subprocess
from contextlib import asynccontextmanager
from functools import lru_cache
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, Request, HTTPException
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
)
from app.utils.logger import get_logger
from app.core.ws_manager import alarm_clients, set_main_event_loop
from app.services.video_service import VideoService
from app.services.jt808_service import jt808_manager
from app.services.tts_queue_service import tts_queue_service
import keyboard_ptz_bridge as keyboard_bridge
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
    
    # 5. 瑙嗛褰曞儚鐘舵€佽嚜妫€ (澧炲姞寮傚父淇濇姢)
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

def _get_ffmpeg_path() -> str:
    return os.getenv(
        "FFMPEG_PATH",
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "ffmpeg-8.0.1-essentials_build",
            "bin",
            "ffmpeg.exe",
        ),
    )

def _parse_duration_text(text: str):
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text or "")
    if not match:
        return None
    return int(match.group(1)) * 3600 + int(match.group(2)) * 60 + float(match.group(3))

@lru_cache(maxsize=2048)
def _is_playable_video_cached(file_path: str, size: int, mtime: float) -> bool:
    if size <= 0:
        return False

    ffprobe_path = _get_ffprobe_path()
    try:
        if os.path.exists(ffprobe_path):
            result = subprocess.run(
                [
                    ffprobe_path,
                    "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    file_path,
                ],
                capture_output=True,
                text=True,
                timeout=6,
            )
            if result.returncode == 0:
                try:
                    return float((result.stdout or "").strip()) > 0
                except Exception:
                    return False
            return False

        ffmpeg_path = _get_ffmpeg_path()
        result = subprocess.run(
            [ffmpeg_path, "-hide_banner", "-i", file_path],
            capture_output=True,
            text=True,
            timeout=6,
        )
        duration = _parse_duration_text((result.stderr or "") + "\n" + (result.stdout or ""))
        return bool(duration and duration > 0)
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

@app.get("/api/videos/{file_path:path}")
def serve_video(file_path: str):
    full_path = find_video_file_with_fallback("recordings", file_path)
    if full_path:
        return FileResponse(full_path)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/alarm_videos/{file_path:path}")
def serve_alarm_video(file_path: str):
    full_path = find_video_file_with_fallback("alarm_videos", file_path)
    if full_path:
        return FileResponse(full_path)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/playback_videos/{file_path:path}")
def serve_playback_video(file_path: str):
    full_path = find_video_file_with_fallback("playback_videos", file_path)
    if full_path:
        return FileResponse(full_path)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/alarm_screenshots/{file_path:path}")
def serve_alarm_screenshot(file_path: str):
    full_path = find_static_file_with_fallback(
        ["alarms", "alarm_screenshots"],
        file_path,
        (".jpg", ".jpeg", ".png", ".webp"),
    )
    if full_path:
        return FileResponse(full_path)
    raise HTTPException(status_code=404, detail="File not found")

# 璺敱鎸傝浇
@app.get("/static/recordings/{file_path:path}")
def serve_static_recording_video(file_path: str):
    full_path = find_video_file_with_fallback("recordings", file_path)
    if full_path:
        return FileResponse(full_path)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/static/alarm_videos/{file_path:path}")
def serve_static_alarm_video(file_path: str):
    full_path = find_video_file_with_fallback("alarm_videos", file_path)
    if full_path:
        return FileResponse(full_path)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/static/playback_videos/{file_path:path}")
def serve_static_playback_video(file_path: str):
    full_path = find_video_file_with_fallback("playback_videos", file_path)
    if full_path:
        return FileResponse(full_path)
    raise HTTPException(status_code=404, detail="File not found")

app.mount("/static", StaticFiles(directory=static_dir), name="static")

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

print("=" * 60)
print("AI 助手服务已集成到主后端")
print("接口地址: http://localhost:9000/api/ai")
print("健康检查: http://localhost:9000/api/ai/health")
print("=" * 60)

@app.post("/api/keyboard-test/begin")
def keyboard_test_begin():
    """Simulate pressing the preset-set key: begin entering a camera id."""
    keyboard_bridge.begin_device_id_input()
    return {"status": "ok", "step": "begin"}


@app.post("/api/keyboard-test/digit/{digit}")
def keyboard_test_digit(digit: int):
    """Simulate pressing one numeric key while entering a camera id."""
    if digit < 0 or digit > 9:
        raise HTTPException(status_code=400, detail="digit must be 0-9")
    keyboard_bridge.append_device_id_digit(digit)
    return {"status": "ok", "step": "digit", "digit": digit}


@app.post("/api/keyboard-test/finish")
def keyboard_test_finish():
    """Simulate pressing the preset-call key: finish camera id input."""
    keyboard_bridge.finish_device_id_input(enforce_timeout=False)
    return {"status": "ok", "step": "finish"}


@app.post("/api/keyboard-test/confirm")
def keyboard_test_confirm():
    """Simulate pressing the preset-clear key: publish the camera switch request."""
    keyboard_bridge.confirm_device_switch()
    return keyboard_bridge.get_device_switch_request_payload()


@app.get("/api/keyboard-test/switch-request")
def keyboard_test_switch_request():
    """Read the simulated keyboard camera switch request."""
    return keyboard_bridge.get_device_switch_request_payload()

# LLM_SERVICE_URL = "http://localhost:8888"  # 宸查泦鎴愶紝鏃犻渶杞彂

# LLM 鏈嶅姟宸查泦鎴愬埌涓诲悗绔紝鏃犻渶浠ｇ悊杞彂
# 鍘熶唬鐞嗕唬鐮佸凡娉ㄩ噴锛岀洿鎺ョ敱 llm_controller 澶勭悊

@app.get("/")
def root():
    return {"status": "running", "message": "Smart Helmet Platform API"}

# --- WebSocket ---
@app.websocket("/ws/alarm")
async def alarm_ws(websocket: WebSocket):
    await websocket.accept()
    alarm_clients.append(websocket)
    try:
        while True:
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        # 鏈嶅姟鍋滄鏃?websocket 浠诲姟琚彇娑堬紝灞炰簬姝ｅ父閫€鍑烘祦绋?
        pass
    finally:
        if websocket in alarm_clients:
            alarm_clients.remove(websocket)

# --- 鍚姩鍏ュ彛 ---
if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    port = int(os.getenv("BACKEND_PORT", 9000))
    
    try:
        uvicorn.run(app, host=host, port=port)
    except KeyboardInterrupt:
        print("\nShutdown by user.")
