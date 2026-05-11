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
from fastapi import FastAPI, WebSocket, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
import httpx

# 修复在 Windows 环境下面，由于前端组件(特别是视频组件)分段请求(断点续传MP4)时取消所引发的底层报错。
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

# 在模块导入阶段加载 .env，避免依赖 __main__ 分支导致配置失效
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
)
from app.utils.logger import get_logger
from app.core.ws_manager import alarm_clients, set_main_event_loop
from app.services.video_service import VideoService
from app.services.jt808_service import jt808_manager
from app.services.tts_queue_service import tts_queue_service

# --- 日志配置 ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(name)s | %(levelname)s | %(message)s'
)
logger = get_logger("Main")

# --- 生命周期管理 (Lifespan) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 【启动阶段】
    set_main_event_loop(asyncio.get_running_loop())
    logger.info("Initializing system services...")
    
    # 1. 启动 JT808 TCP 服务线程
    logger.info("Starting JT808 TCP service on port 8989...")
    jt_thread = threading.Thread(target=jt808_manager.start_server, daemon=True)
    jt_thread.start()
    
    # 2. 启动 TTS 语音播报队列 worker
    logger.info("Starting TTS queue worker...")
    tts_queue_service.start()
    """
    # 2. 视频录像状态自检 (增加异常保护)
    db = SessionLocal()
    try:
        logger.info("Checking video device recording status...")
        # 即使这里报错(比如摄像头连不上)，也不会弄挂主程序
        VideoService().ensure_all_recordings(db)
        logger.info("Video recordings initialized.")
    except Exception as e:
        logger.error(f"Video Recording Check Failed: {e}. (System will continue to run)")
    finally:
        db.close()
    """
    
    yield
    
    # 【关闭阶段】
    set_main_event_loop(None)
    logger.info("Shutting down services...")
    jt808_manager.running = False
    tts_queue_service.stop()

# --- App 初始化 ---
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

# 静态资源
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)

# 动态视频访问路由（支持自定义存储路径）
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

# 路由挂载
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

print("=" * 60)
print("✅ AI 助手服务已集成到主后端!")
print("📡 接口地址: http://localhost:9000/api/ai")
print("🔍 健康检查: http://localhost:9000/api/ai/health")
print("=" * 60)

# LLM_SERVICE_URL = "http://localhost:8888"  # 已集成，无需转发

# LLM 服务已集成到主后端，无需代理转发
# 原代理代码已注释，直接由 llm_controller 处理

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
        # 服务停止时 websocket 任务被取消，属于正常退出流程
        pass
    finally:
        if websocket in alarm_clients:
            alarm_clients.remove(websocket)

# --- 启动入口 ---
if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    port = int(os.getenv("BACKEND_PORT", 9000))
    
    try:
        uvicorn.run(app, host=host, port=port)
    except KeyboardInterrupt:
        print("\nShutdown by user.")
