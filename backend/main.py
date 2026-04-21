import os
import sys
import logging
import threading
import asyncio
from contextlib import asynccontextmanager
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
)
from app.utils.logger import get_logger
from app.core.ws_manager import alarm_clients, set_main_event_loop
from app.services.video_service import VideoService
from app.services.jt808_service import jt808_manager

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

    yield
    
    # 【关闭阶段】
    set_main_event_loop(None)
    logger.info("Shutting down services...")
    jt808_manager.running = False

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
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# 动态视频访问路由（支持自定义存储路径）
import json
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "system_config.json")

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

@app.get("/api/videos/{file_path:path}")
def serve_video(file_path: str):
    storage_root = get_storage_root()
    full_path = os.path.join(storage_root, "recordings", file_path)
    if os.path.exists(full_path) and os.path.isfile(full_path):
        return FileResponse(full_path)
    return {"error": "File not found"}

@app.get("/api/alarm_videos/{file_path:path}")
def serve_alarm_video(file_path: str):
    storage_root = get_storage_root()
    full_path = os.path.join(storage_root, "alarm_videos", file_path)
    if os.path.exists(full_path) and os.path.isfile(full_path):
        return FileResponse(full_path)
    return {"error": "File not found"}

# 路由挂载
app.include_router(admin_controller.router)
app.include_router(device_controller.router)
app.include_router(video_controller.router)
app.include_router(fence_controller.router)
app.include_router(team_controller.router)
app.include_router(alarm_controller.router)
app.include_router(call_controller.router)
app.include_router(dashboard_controller.router)
app.include_router(auth_controller.router)
app.include_router(project_controller.router)
app.include_router(backup_controller.router)

LLM_SERVICE_URL = "http://localhost:8888"

@app.api_route("/api/ai/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_llm_service(request: Request, path: str):
    """将 /api/ai/* 请求转发到 LLM 服务"""
    timeout = httpx.Timeout(60.0, connect=10.0)
    
    async with httpx.AsyncClient(timeout=timeout) as client:
        url = f"{LLM_SERVICE_URL}/{path}"
        
        try:
            query_params = dict(request.query_params)
            
            if request.method == "POST" and request.headers.get("content-type", "").startswith("multipart/form-data"):
                form = await request.form()
                files = {}
                data = {}
                for key, value in form.items():
                    if hasattr(value, 'file') and value.file:
                        files[key] = (value.filename, await value.read(), value.content_type)
                    else:
                        data[key] = value
                
                response = await client.request(
                    method=request.method,
                    url=url,
                    params=query_params,
                    files=files if files else None,
                    data=data if data else None,
                )
            else:
                body = await request.body()
                response = await client.request(
                    method=request.method,
                    url=url,
                    params=query_params,
                    content=body,
                    headers={key: value for key, value in request.headers.items() if key.lower() not in ["host", "content-length"]},
                )
            
            return StreamingResponse(
                response.aiter_bytes(),
                status_code=response.status_code,
                headers=dict(response.headers),
            )
            
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="LLM 服务未启动，请先启动 LargeLanguageModel/main.py")

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