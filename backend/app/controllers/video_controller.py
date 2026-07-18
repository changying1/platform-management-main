from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
import base64
import json
import numpy as np
from app.core.database import get_db
from app.core.data_scope import in_scope
from app.core.security import get_current_user
# 统一使用 video_schema 以匹配模块结构
from app.schemas.video_schema import (
    VideoCreate,
    VideoOut,
    VideoUpdate,
    CameraCreateRequest,
    PTZControlRequest,
    PresetCreateRequest,
    PresetGotoRequest,
    PTZPresetItem,
    CruiseStartRequest,
    PresetBulkDeleteRequest,
    PresetBulkDeleteResponse,
    StreamUrlResponse,
)
from app.services.video_service import VideoService
from app.utils.logger import get_logger
from app.services.audit_log_service import write_audit_log
import cv2
import time
import threading
import re
import os
from datetime import datetime
# --- 在现有的 import 语句下面添加 ---
from app.services.ai_manager import ai_manager
from app.services.ai_features.registry import list_rules
from app.services.ai_runtime.algorithm_catalog import list_algorithms

router = APIRouter(prefix="/video", tags=["Video Surveillance"])
service = VideoService()
logger = get_logger("VideoController")
_AI_TRACK_SCOPE_CACHE: dict[tuple, tuple[float, dict]] = {}
_AI_TRACK_SCOPE_CACHE_TTL_SECONDS = 2.0


def _ensure_zoom_direction(direction: str):
    if direction not in {"zoom_in", "zoom_out"}:
        raise HTTPException(status_code=400, detail="变焦方向仅支持 zoom_in 或 zoom_out")


# --- 放在 router 定义之前或之后都可以，只要在下面的接口用到它之前 ---
def _video_scope_kwargs() -> dict:
    return {
        "project_fields": ("project_id",),
        "grid_fields": ("grid_id", "grid"),
        "team_fields": ("team_id",),
        "branch_fields": ("branch_id",),
        "company_fields": ("company", "department"),
        "project_name_fields": ("project",),
        "team_name_fields": ("team", "workTeam", "work_team"),
    }


def _video_visible(video_doc: dict | None, current_user: dict) -> bool:
    return in_scope(video_doc, current_user, **_video_scope_kwargs())


def _require_video_scope(video_id: int | str, current_user: dict):
    video_doc = service._get_video_doc_by_id(video_id)
    if not _video_visible(video_doc, current_user):
        raise HTTPException(status_code=404, detail="Video device not found")
    return video_doc


def _track_scope_cache_key(video_id: int | str, current_user: dict) -> tuple:
    return (
        str(video_id),
        str(current_user.get("username") or current_user.get("id") or ""),
        str(current_user.get("permission_level") or ""),
        str(current_user.get("role") or ""),
        str(current_user.get("branch_id") or current_user.get("department_id") or ""),
        str(current_user.get("project_id") or current_user.get("project") or ""),
        str(current_user.get("grid_id") or ""),
        str(current_user.get("team_id") or current_user.get("team") or current_user.get("work_team") or ""),
    )


def _require_video_scope_cached(video_id: int | str, current_user: dict):
    key = _track_scope_cache_key(video_id, current_user)
    now = time.time()
    cached = _AI_TRACK_SCOPE_CACHE.get(key)
    if cached and cached[0] > now:
        return cached[1]
    video_doc = _require_video_scope(video_id, current_user)
    _AI_TRACK_SCOPE_CACHE[key] = (now + _AI_TRACK_SCOPE_CACHE_TTL_SECONDS, video_doc)
    return video_doc


def _default_scope_fields(current_user: dict) -> dict:
    return {
        "branch_id": current_user.get("branch_id") or current_user.get("department_id"),
        "project_id": current_user.get("project_id"),
        "grid_id": current_user.get("grid_id"),
        "team_id": current_user.get("team_id"),
        "company": current_user.get("company") or current_user.get("department"),
        "project": current_user.get("project"),
        "team": current_user.get("team") or current_user.get("work_team"),
    }


def _video_audit_snapshot(video_obj) -> dict:
    if not video_obj:
        return {}
    if isinstance(video_obj, dict):
        return dict(video_obj)
    if hasattr(video_obj, "model_dump"):
        return video_obj.model_dump()
    if hasattr(video_obj, "dict"):
        return video_obj.dict()
    return {
        key: value
        for key, value in vars(video_obj).items()
        if not key.startswith("_")
    }


def _video_audit_name(video_obj, fallback: str = "") -> str:
    snapshot = _video_audit_snapshot(video_obj)
    return str(
        snapshot.get("name")
        or snapshot.get("device_name")
        or snapshot.get("device_serial")
        or snapshot.get("id")
        or fallback
        or "unknown"
    )


def _video_status_action(before_status: str, after_status: str) -> str:
    before_status = str(before_status or "").strip().lower()
    after_status = str(after_status or "").strip().lower()
    if before_status == after_status:
        return "变更设备信息"
    if after_status == "maintaining":
        return "设备报修"
    if before_status == "maintaining":
        return "解除维修"
    return "变更设备状态"


class AIMonitorRequest(BaseModel):
    device_id: str
    rtsp_url: str | None = None
    algo_type: str = "helmet"


class AIFrameDetectRequest(BaseModel):
    image: str
    algo_type: str = "person,face"
    capture_time: float | None = None


class BoxedRecordingRequest(BaseModel):
    web_path: str
    algorithm: str = "person"
    frame_stride: int = 5
    force: bool = False


class DeviceRulesUpdateRequest(BaseModel):
    rules: list[str] = []
    face_assist_enabled: bool | None = None


def _split_device_rule_value(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        result = []
        for item in value:
            result.extend(_split_device_rule_value(item))
        return result
    return [item.strip() for item in re.split(r"[,，、\s]+", str(value)) if item.strip()]


def _get_persisted_device_rules(video_id: int | str) -> list[str]:
    db_video = service._get_video_runtime_by_id(video_id)
    if not db_video:
        return []
    seen = set()
    result = []
    for key in ("ai_rules", "algo_rules", "rules", "algo_type", "algos"):
        for rule in _split_device_rule_value(getattr(db_video, key, None)):
            if rule not in seen:
                seen.add(rule)
                result.append(rule)
    return result


def _is_ai_decodable_stream_url(url: str | None) -> bool:
    lowered = str(url or "").strip().lower()
    if not lowered or "ezopen://" in lowered:
        return False
    return lowered.startswith(("rtsp://", "http://", "https://", "rtmp://"))


def _resolve_ai_stream_url(db, device_id: str, db_video, requested_url: str) -> tuple[str, str]:
    if _is_ai_decodable_stream_url(requested_url):
        return requested_url.strip(), "request"

    if not db_video or not getattr(db_video, "device_serial", None) or not device_id.isdigit():
        return "", ""

    attempts: list[str] = []
    for protocol in ("flv", "hls", "rtmp", "ezopen"):
        try:
            stream_info = service.get_stream_info(db, int(device_id), protocol=protocol) or {}
            stream_url = str(stream_info.get("url") or "").strip()
            play_type = str(stream_info.get("play_type") or protocol or "").strip()
            attempts.append(f"{protocol}:{play_type}:{stream_url[:24]}")
            if _is_ai_decodable_stream_url(stream_url):
                logger.info(
                    "Resolved EZVIZ AI stream device_id=%s protocol=%s play_type=%s",
                    device_id,
                    protocol,
                    play_type,
                )
                return stream_url, protocol
        except Exception as exc:
            attempts.append(f"{protocol}:error:{exc}")

    logger.warning(
        "No decodable EZVIZ AI stream for device_id=%s attempts=%s",
        device_id,
        " | ".join(attempts),
    )
    return "", ""


class PlaybackSaveRequest(BaseModel):
    start_time: str
    end_time: str


class TempCacheTriggerRequest(BaseModel):
    force: bool = True


class TrafficOcrRequest(BaseModel):
    ocr_text: str = ""
    used_gb: float | None = None
    source: str = "video_osd"
    capture_time: str | None = None

@router.post("/ai/start")
async def start_ai(req: AIMonitorRequest, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """开启 AI 监控"""
    device_id = str(req.device_id or "").strip()
    if not device_id:
        raise HTTPException(status_code=400, detail="device_id 不能为空")

    _require_video_scope(device_id, current_user)
    db_video = None
    rtsp_url = (req.rtsp_url or "").strip()

    if device_id.isdigit():
        db_video = service._get_video_runtime_by_id(device_id)
        if not rtsp_url and db_video:
            candidate = str(
                getattr(db_video, "rtsp_url", "")
                or getattr(db_video, "stream_url", "")
                or ""
            ).strip()
            if candidate.lower().startswith("rtsp://"):
                rtsp_url = candidate

    ai_stream_url, ai_stream_source = _resolve_ai_stream_url(db, device_id, db_video, rtsp_url)
    rtsp_url_lower = (ai_stream_url or rtsp_url).lower()
    stream_protocol = str(getattr(db_video, "stream_protocol", "") or "").lower() if db_video else ""
    platform_type = str(getattr(db_video, "platform_type", "") or "").lower() if db_video else ""
    access_source = str(getattr(db_video, "access_source", "") or "").lower() if db_video else ""
    has_ezviz_serial = bool(db_video and getattr(db_video, "device_serial", None))
    is_ezviz_pseudo_rtsp = "ezopen" in str(rtsp_url or "").lower() or "ezopen" in rtsp_url_lower
    is_ezviz_cloud = has_ezviz_serial and (
        platform_type == "ezviz"
        or stream_protocol == "ezopen"
        or access_source == "cloud"
        or is_ezviz_pseudo_rtsp
    )
    has_valid_rtsp = rtsp_url_lower.startswith("rtsp://") and "ezopen://" not in rtsp_url_lower
    has_decodable_stream = _is_ai_decodable_stream_url(ai_stream_url)

    print(
        f"[ALARM_API_START_REQ] device_id={device_id} has_valid_rtsp={has_valid_rtsp} "
        f"has_decodable_stream={has_decodable_stream} ai_stream_source={ai_stream_source or '-'} "
        f"is_ezviz_cloud={is_ezviz_cloud} is_ezviz_pseudo_rtsp={is_ezviz_pseudo_rtsp} "
        f"algo_type={str(req.algo_type or '').strip() or 'helmet'}"
    )

    if (not has_decodable_stream) and (not is_ezviz_cloud):
        print(
            f"[ALARM_API_START_REJECTED] device_id={device_id} reason=missing_rtsp_and_non_ezviz"
        )
        raise HTTPException(
            status_code=400,
            detail="缺少有效 RTSP，且当前设备非萤石云设备，无法启动AI检测"
        )

    algo_type = str(req.algo_type or "").strip() or "helmet"
    was_running = device_id in ai_manager.active_monitors
    success = ai_manager.start_monitoring(device_id, ai_stream_url if has_decodable_stream else "", algo_type)

    if success:
        print(f"[ALARM_API_START_OK] device_id={device_id} algo_type={algo_type}")
        return {"code": 200, "message": f"AI监控已启动: {algo_type}"}
    if was_running and device_id in ai_manager.active_monitors:
        print(f"[ALARM_API_START_REUSED] device_id={device_id} algo_type={algo_type}")
        return {
            "code": 200,
            "message": f"AI monitor already running; rules updated: {algo_type}",
            "reused": True,
        }
    else:
        print(f"[ALARM_API_START_FAILED] device_id={device_id} reason=already_running_or_start_failed")
        raise HTTPException(status_code=400, detail="启动失败或已在运行")

@router.get("/ai/rules")
def get_ai_rules(current_user: dict = Depends(get_current_user)):
    """获取当前可用 AI 规则列表。"""
    catalog_items = list_algorithms()
    rules = list_rules()
    
    allowed_keys = [
        "helmet",
        "smoking",
        "phone",
        "person_distance",
        "signage",
        "behavior",
        "supervisor_count",
        "ladder_angle",
        "hole_curb",
        "unauthorized_person",
        "firefighting_equipment_v2"
    ]
    
    display_names = {
        "helmet": "安全帽检测",
        "smoking": "抽烟检测",
        "phone": "打电话检测",
        "person_distance": "多人作业人员间距检测",
        "signage": "现场标识类",
        "behavior": "作业行为类",
        "supervisor_count": "现场监督人数统计",
        "ladder_angle": "梯子角度类",
        "hole_curb": "孔口挡坎违规类",
        "unauthorized_person": "围栏入侵管理类",
        "firefighting_equipment_v2": "动火消防器材V2"
    }
    
    result = []
    for key in allowed_keys:
        if key in rules:
            result.append({
                "key": key,
                "desc": display_names.get(key, rules[key].desc)
            })

    seen = {item.get("key") for item in result if isinstance(item, dict)}
    catalog_iter = catalog_items.values() if isinstance(catalog_items, dict) else (catalog_items or [])
    for item in catalog_iter:
        if not isinstance(item, dict):
            continue
        key = item.get("key") or item.get("id") or item.get("code")
        if not key or key in seen:
            continue
        result.append({
            "key": key,
            "desc": item.get("desc") or item.get("name") or key,
        })
        seen.add(key)
            
    return {
        "code": 0,
        "data": result
    }


@router.get("/ai/tracks/{video_id}")
def get_ai_person_tracks(video_id: int, current_user: dict = Depends(get_current_user)):
    """Return the latest person tracking boxes for the live video overlay."""
    _require_video_scope_cached(video_id, current_user)
    return ai_manager.get_latest_person_tracks(video_id)


@router.post("/ai/frame/{video_id}")
def detect_ai_frame(video_id: int, body: AIFrameDetectRequest, current_user: dict = Depends(get_current_user)):
    """Detect the exact frame captured from the currently displayed player."""
    request_started_at = datetime.now()
    _require_video_scope(video_id, current_user)
    image_text = str(body.image or "")
    if "," in image_text and image_text.lower().startswith("data:"):
        image_text = image_text.split(",", 1)[1]
    try:
        raw = base64.b64decode(image_text, validate=False)
        arr = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid frame image: {exc}")
    if frame is None:
        raise HTTPException(status_code=400, detail="invalid frame image")
    debug_frame_url = ""
    if os.getenv("AI_FRAME_DEBUG_IMAGE", "0") == "1":
        debug_dir = os.path.join(os.getcwd(), "static", "debug_ai_frames")
        os.makedirs(debug_dir, exist_ok=True)
        debug_filename = f"frontend_frame_{video_id}.jpg"
        debug_path = os.path.join(debug_dir, debug_filename)
        cv2.imwrite(debug_path, frame)
        debug_frame_url = f"/static/debug_ai_frames/{debug_filename}"
    detect_started_at = datetime.now()
    payload = ai_manager.detect_frontend_frame(video_id, frame, body.algo_type)
    finished_at = datetime.now()
    payload["tracks"] = [track for track in (payload.get("tracks") or []) if int(track.get("misses", 0) or 0) == 0]
    payload["source"] = "frontend_frame"
    payload["timestamp"] = finished_at.isoformat()
    payload["age_ms"] = 0
    payload["stale"] = False
    payload["capture_time"] = body.capture_time
    payload["server_received_at"] = request_started_at.isoformat()
    payload["server_detect_started_at"] = detect_started_at.isoformat()
    payload["server_finished_at"] = finished_at.isoformat()
    payload["decode_elapsed_ms"] = int((detect_started_at - request_started_at).total_seconds() * 1000)
    payload["detect_elapsed_ms"] = int((finished_at - detect_started_at).total_seconds() * 1000)
    payload["server_elapsed_ms"] = int((finished_at - request_started_at).total_seconds() * 1000)
    payload["debug_frame_url"] = debug_frame_url
    metadata_path = service.append_ai_detection_metadata(video_id, payload, body.capture_time)
    if metadata_path:
        payload["metadata_saved"] = True
    print(
        f"[AI_FRAME_DETECT] video_id={video_id} frame={frame.shape[1]}x{frame.shape[0]} "
        f"tracks={len(payload.get('tracks') or [])} elapsed_ms={payload['server_elapsed_ms']}"
    )
    return payload


@router.post("/add_camera", response_model=VideoOut)
def add_camera_dynamically(camera: CameraCreateRequest, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """
    Dynamically adds a new camera by commanding the media server
    and then creating a record in the database.
    """
    request_body = camera.model_dump(exclude_none=False) if hasattr(camera, "model_dump") else camera.dict()
    logger.info("POST /video/add_camera request body: %s", json.dumps(request_body, ensure_ascii=False, default=str))
    try:
        created = service.add_camera_to_media_server(db, camera, scope_fields=_default_scope_fields(current_user))
        snapshot = _video_audit_snapshot(created)
        write_audit_log(
            current_user=current_user,
            action="添加设备",
            target_type="device",
            target_name=_video_audit_name(snapshot),
            after=snapshot,
            company=snapshot.get("company"),
            project=snapshot.get("project"),
            grid=snapshot.get("grid") or snapshot.get("grid_name") or snapshot.get("grid_id"),
            team=snapshot.get("team"),
        )
        return created
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/", response_model=List[VideoOut])
def read_videos(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取所有视频设备列表"""
    username = current_user.get("username") if isinstance(current_user, dict) else ""
    logger.info("[VIDEO_LIST_START] user={} limit={} offset={}", username, limit, skip)
    try:
        videos = service.get_videos(db, skip=skip, limit=limit, current_user=current_user)
        result = [VideoOut.model_validate(video) for video in videos]
        json_size = len(
            json.dumps(
                [item.model_dump(mode="json") for item in result],
                ensure_ascii=False,
                default=str,
            ).encode("utf-8")
        )
        logger.info("[VIDEO_LIST_SUCCESS] count={} json_size_bytes={}", len(result), json_size)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "[VIDEO_LIST_EXCEPTION] offset={} limit={} user={} error={}",
            skip,
            limit,
            username,
            e,
        )
        raise HTTPException(status_code=500, detail="获取摄像头列表失败，请查看后端日志")


@router.get("/playbacks/query")
def query_playbacks(
    media_type: str = Query("manual", pattern="^(manual|alarm)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(40, ge=1, le=100),
    device_id: Optional[str] = None,
    company: Optional[str] = None,
    project: Optional[str] = None,
    grid: Optional[str] = None,
    team: Optional[str] = None,
    keyword: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    current_user: dict = Depends(get_current_user),
):
    """统一查询当前用户可见的回放记录，服务端完成筛选、排序和分页。"""
    return service.query_playbacks(
        current_user=current_user,
        media_type=media_type,
        page=page,
        page_size=page_size,
        device_id=device_id,
        company=company,
        project=project,
        grid=grid,
        team=team,
        keyword=keyword,
        start_time=start_time,
        end_time=end_time,
        sort_order=sort_order,
    )


@router.post("/", response_model=VideoOut)
def create_video(video: VideoCreate, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """手动创建/添加视频设备"""
    try:
        created = service.create_video(db, video, scope_fields=_default_scope_fields(current_user))
        snapshot = _video_audit_snapshot(created)
        write_audit_log(
            current_user=current_user,
            action="添加设备",
            target_type="device",
            target_name=_video_audit_name(snapshot),
            after=snapshot,
            company=snapshot.get("company"),
            project=snapshot.get("project"),
            grid=snapshot.get("grid") or snapshot.get("grid_name") or snapshot.get("grid_id"),
            team=snapshot.get("team"),
        )
        return created
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # 添加通用异常捕获，防止任何未预料的错误（如数据库连接失败、模型字段不匹配等）导致服务器崩溃并返回HTML
        # 在生产环境中，应该使用更精细的日志记录
        print(f"An unexpected error occurred: {e}") # 临时用于调试
        raise HTTPException(status_code=500, detail="An internal server error occurred while creating the video.")

@router.get("/{video_id}/rules")
def get_device_rules(video_id: int, current_user: dict = Depends(get_current_user)):
    """获取设备已配置的算法规则"""
    _require_video_scope(video_id, current_user)
    rules = ai_manager.get_device_rules(str(video_id))
    if not rules:
        rules = _get_persisted_device_rules(video_id)
        if rules:
            ai_manager.set_device_rules(str(video_id), rules)
    return {"rules": rules}


@router.put("/{video_id}/rules")
def update_device_rules(video_id: int, body: DeviceRulesUpdateRequest, current_user: dict = Depends(get_current_user)):
    """更新设备算法规则；若设备正在监控则热更新"""
    _require_video_scope(video_id, current_user)
    requested_rules = list(body.rules or [])
    if body.face_assist_enabled and "face" not in requested_rules:
        requested_rules.append("face")
    if body.face_assist_enabled is False:
        requested_rules = [rule for rule in requested_rules if rule != "face"]
    rules = ai_manager.set_device_rules(str(video_id), requested_rules)
    service._update_video_fields(video_id, {"ai_rules": ",".join(rules)})

    monitor = ai_manager.active_monitors.get(str(video_id))
    if monitor:
        # 热更新运行中监控线程读取到的规则字符串
        ai_manager.device_rules[str(video_id)] = ",".join(rules)

    return {"status": "ok", "rules": rules}

@router.put("/{video_id}", response_model=VideoOut)
def update_video(video_id: int, video: VideoUpdate, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """更新视频设备信息"""
    before = _require_video_scope(video_id, current_user)
    before_snapshot = _video_audit_snapshot(before)
    try:
        updated_video = service.update_video(db, video_id, video)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated_video:
        raise HTTPException(status_code=404, detail="Video device not found")
    snapshot = _video_audit_snapshot(updated_video)
    before_status = str(before_snapshot.get("status") or "")
    after_status = str(snapshot.get("status") or "")
    action = _video_status_action(before_status, after_status)
    if before_status != after_status:
        details = "device status changed from %s to %s" % (before_status or "-", after_status or "-")
    else:
        details = ""
    write_audit_log(
        current_user=current_user,
        action=action,
        target_type="device",
        target_name=_video_audit_name(snapshot, str(video_id)),
        details=details,
        before=before_snapshot,
        after=snapshot,
        company=snapshot.get("company"),
        project=snapshot.get("project"),
        grid=snapshot.get("grid") or snapshot.get("grid_name") or snapshot.get("grid_id"),
        team=snapshot.get("team"),
    )
    return updated_video
    details = f"设备状态由 {before_status or '-'} 变更为 {after_status or '-'}" if before_status != after_status else ""
    write_audit_log(
        current_user=current_user,
        action="变更设备信息",
        target_type="device",
        target_name=_video_audit_name(snapshot, str(video_id)),
        before=before_snapshot,
        after=snapshot,
        company=snapshot.get("company"),
        project=snapshot.get("project"),
        grid=snapshot.get("grid") or snapshot.get("grid_name") or snapshot.get("grid_id"),
        team=snapshot.get("team"),
    )
    return updated_video

@router.delete("/{video_id}")
def delete_video(video_id: int, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """删除视频设备"""
    before = _require_video_scope(video_id, current_user)
    before_snapshot = _video_audit_snapshot(before)
    success = service.delete_video(db, video_id)
    if not success:
        raise HTTPException(status_code=404, detail="Video device not found")
    write_audit_log(
        current_user=current_user,
        action="删除设备",
        target_type="device",
        target_name=_video_audit_name(before_snapshot, str(video_id)),
        before=before_snapshot,
        company=before_snapshot.get("company"),
        project=before_snapshot.get("project"),
        grid=before_snapshot.get("grid") or before_snapshot.get("grid_name") or before_snapshot.get("grid_id"),
        team=before_snapshot.get("team"),
        level="warning",
    )
    return {"status": "success"}

class BatchUpdateOrgRequest(BaseModel):
    """批量更新设备组织架构的请求模型"""
    company: Optional[str] = None
    project: Optional[str] = None
    grid: Optional[str] = None
    team: Optional[str] = None
    device_ids: Optional[List[int]] = None  # 可选：指定设备ID列表，为空则更新所有设备

@router.put("/batch/org", response_model=dict)
def batch_update_organization(
    request: BatchUpdateOrgRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """批量更新设备组织架构信息"""
    updated_count = service.batch_update_organization(
        db,
        company=request.company,
        project=request.project,
        grid=request.grid,
        team=request.team,
        device_ids=request.device_ids
    )
    return {"status": "success", "updated_count": updated_count}

@router.post("/sync")
def sync_devices(db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """从海康威视等平台同步设备列表"""
    service.sync_hikvision_devices(db)
    return {"message": "Sync started"}


@router.get("/ezviz/health")
def get_ezviz_health(current_user: dict = Depends(get_current_user)):
    """萤石云配置与 token 健康检查"""
    return service.get_ezviz_health()


@router.get("/stream/{video_id}", response_model=StreamUrlResponse)
def get_video_stream(
    video_id: int,
    protocol: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        _require_video_scope(video_id, current_user)
        info = service.get_stream_info(db, video_id, protocol=protocol)  # ← 调用 service 层方法
        if not info or not info.get("url"):
            raise HTTPException(status_code=404, detail="Stream URL not found or device offline")
        return info
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"UPSTREAM_ERROR: 获取播放地址失败: {e}")
# @router.get("/stream/{video_id}", response_model=StreamUrlResponse)
# def get_video_stream(video_id: int, db: Session = Depends(get_db)):
#     """获取指定设备的流媒体地址"""
#     try:
#         info = service.get_stream_info(db, video_id)
#         if not info or not info.get("url"):
#             raise HTTPException(status_code=404, detail="Stream URL not found or device offline")
#         return info
#     except HTTPException:
#         raise
#     except ValueError as e:
#         # 透传 service 层语义码前缀，前端可直接展示/分流处理。
#         raise HTTPException(status_code=400, detail=str(e))
#     except Exception as e:
#         raise HTTPException(status_code=502, detail=f"UPSTREAM_ERROR: 获取播放地址失败: {e}")


@router.post("/{video_id}/playback/save")
def save_playback_clip(video_id: int, body: PlaybackSaveRequest, current_user: dict = Depends(get_current_user)):
    """保存指定时间段的回放视频"""
    try:
        _require_video_scope(video_id, current_user)
        return service.save_playback_clip(video_id, body.start_time, body.end_time, output_type="playback", filename_prefix="playback")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"回放保存失败: {e}")


@router.get("/{video_id}/recordings")
def list_recording_segments(video_id: int, limit: int = 72, current_user: dict = Depends(get_current_user)):
    started_at = time.time()
    started_text = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    logger.info(
        "recordings list controller start video_id=%s limit=%s started_at=%s",
        video_id,
        limit,
        started_text,
    )
    """获取设备录像分段列表（默认最近72段）"""
    try:
        _require_video_scope(video_id, current_user)
        result = service.list_recording_segments(video_id, limit)
        logger.info(
            "recordings list controller done video_id=%s limit=%s count=%s elapsed_ms=%.2f",
            video_id,
            limit,
            len(result) if isinstance(result, list) else "unknown",
            (time.time() - started_at) * 1000,
        )
        return result
    except Exception as e:
        logger.exception(
            "recordings list controller failed video_id=%s limit=%s elapsed_ms=%.2f",
            video_id,
            limit,
            (time.time() - started_at) * 1000,
        )
        raise HTTPException(status_code=500, detail=f"获取录像分段失败: {e}")


@router.post("/{video_id}/playback/temp-cache")
def save_temp_cache_clip(video_id: int, body: TempCacheTriggerRequest, current_user: dict = Depends(get_current_user)):
    """触发从上一个归档时间节点到当前时刻的临时回放缓存"""
    try:
        _require_video_scope(video_id, current_user)
        return service.save_temp_cache_until_now(video_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"临时缓存生成失败: {e}")


@router.get("/{video_id}/playback/videos")
def list_saved_playback_videos(video_id: int, limit: int = 120, current_user: dict = Depends(get_current_user)):
    """获取已保存的常态回放视频列表"""
    try:
        _require_video_scope(video_id, current_user)
        return service.list_saved_playback_videos(video_id, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取常态回放列表失败: {e}")


@router.get("/{video_id}/monitoring-summary")
def get_monitoring_summary(video_id: int, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """获取设备流量监测摘要（已使用/阈值/剩余）"""
    try:
        _require_video_scope(video_id, current_user)
        summary = service.get_monitoring_summary(db, video_id)
        if not summary:
            raise HTTPException(status_code=404, detail="设备不存在")
        return summary
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取流量监测摘要失败: {e}")


@router.post("/{video_id}/traffic/ocr")
def report_traffic_ocr(video_id: int, body: TrafficOcrRequest, db=Depends(get_db)):
    """上报从视频顶部 OSD OCR 识别出的本月已使用流量。"""
    try:
        result = service.report_traffic_ocr(db, video_id, body.ocr_text, body.used_gb)
        if not result:
            raise HTTPException(status_code=404, detail="设备不存在")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上报 OCR 流量识别结果失败: {e}")


@router.post("/{video_id}/traffic/recognize")
def recognize_traffic(video_id: int, db=Depends(get_db)):
    """后端截图并识别视频画面中的流量读数。"""
    try:
        return service.recognize_video_traffic(db, video_id)
    except Exception as e:
        logger.exception("traffic recognize failed video_id=%s", video_id)
        return {"success": False, "message": str(e) or "识别失败"}


@router.get("/{video_id}/traffic/status")
def get_traffic_status(video_id: int, db=Depends(get_db)):
    """获取摄像头 SIM 卡估算剩余流量状态。"""
    try:
        result = service.get_traffic_status(db, video_id)
        if not result:
            raise HTTPException(status_code=404, detail="设备不存在")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取流量状态失败: {e}")


@router.get("/{video_id}/playback/temp/videos")
def list_temp_cache_videos(video_id: int, limit: int = 30, current_user: dict = Depends(get_current_user)):
    """获取临时缓存回放视频列表"""
    try:
        _require_video_scope(video_id, current_user)
        return service.list_temp_cache_videos(video_id, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取临时回放列表失败: {e}")


@router.get("/{video_id}/alarm/videos")
def list_saved_alarm_videos(video_id: int, limit: int = 120, current_user: dict = Depends(get_current_user)):
    """获取报警回放视频列表"""
    try:
        _require_video_scope(video_id, current_user)
        return service.list_saved_alarm_videos(video_id, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取报警回放列表失败: {e}")


@router.post("/time/sync/{video_id}")
def sync_camera_time(
    video_id: int,
    force: bool = True,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """手动触发摄像头时间同步（默认强制同步）"""
    _require_video_scope(video_id, current_user)
    result = service.sync_camera_time_if_needed(db, video_id, force=force)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "摄像头校时失败"))
    return result


def _mjpeg_frame_generator(rtsp_url: str):
    cap = cv2.VideoCapture(rtsp_url)
    if not cap.isOpened():
        # 延时重试几次，避免瞬时失败
        for _ in range(5):
            time.sleep(0.3)
            cap.open(rtsp_url)
            if cap.isOpened():
                break
    if not cap.isOpened():
        # 生成一个空白帧作为错误提示
        img = (255 * (1 - 0)).astype('uint8') if False else None
        # 无法打开时直接结束生成器
        return

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.05)
                continue
            # 可按需缩放，减少带宽/CPU
            # frame = cv2.resize(frame, (960, 540))
            ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if not ret:
                continue
            jpg_bytes = buffer.tobytes()
            yield (b"--frame\r\n"
                   b"Content-Type: image/jpeg\r\n\r\n" + jpg_bytes + b"\r\n")
            time.sleep(0.03)  # ~30fps 限速，防止过载
    finally:
        cap.release()


@router.get("/mjpeg/{video_id}")
def get_video_mjpeg(video_id: int, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """
    提供简易 MJPEG 实时预览流（multipart/x-mixed-replace）。
    适合快速演示，但占用 CPU，生产建议接入 MediaMTX/ZLMediaKit 或 HLS/WebRTC。
    """
    _require_video_scope(video_id, current_user)
    url = service.get_stream_url(db, video_id)
    if not url:
        raise HTTPException(status_code=404, detail="Stream URL not found or device offline")
    return StreamingResponse(_mjpeg_frame_generator(url), media_type="multipart/x-mixed-replace; boundary=frame")

@router.post("/ptz/{video_id}")
def ptz_control(
    video_id: int,
    body: PTZControlRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """云台控制接口，前端发送方向和速度，然后通过 ONVIF 控制摄像头"""
    try:
        _require_video_scope(video_id, current_user)
        # 添加日志
        import logging
        logger_temp = logging.getLogger("ptz_control")
        logger_temp.info(f"收到PTZ请求 - video_id: {video_id}, direction: {body.direction}, direction.value: {body.direction.value}, speed: {body.speed}, duration: {body.duration}")
        
        service.ptz_move(db, video_id, body.direction.value, body.speed or 0.5, body.duration or 0.5)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PTZ 控制失败: {e}")

@router.post("/ptz/{video_id}/start")
def ptz_start(
    video_id: int,
    body: PTZControlRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """云台持续移动（按下开始），前端按键按下时调用"""
    try:
        _require_video_scope(video_id, current_user)
        service.ptz_start_move(db, video_id, body.direction.value, body.speed or 0.5)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PTZ 启动失败: {e}")


@router.post("/ptz/{video_id}/stop")
def ptz_stop(video_id: int, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """云台停止移动（松开停止），前端按键松开时调用"""
    try:
        _require_video_scope(video_id, current_user)
        service.ptz_stop_move(db, video_id)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PTZ 停止失败: {e}")


@router.post("/zoom/{video_id}")
def zoom_control(
    video_id: int,
    body: PTZControlRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """变焦单次控制接口"""
    try:
        _require_video_scope(video_id, current_user)
        direction = body.direction.value
        _ensure_zoom_direction(direction)
        service.zoom_move(db, video_id, direction, body.speed or 0.5, body.duration or 0.5)
        return {"status": "ok"}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"变焦控制失败: {e}")


@router.post("/zoom/{video_id}/start")
def zoom_start(
    video_id: int,
    body: PTZControlRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """变焦持续控制开始（按下开始）"""
    try:
        _require_video_scope(video_id, current_user)
        direction = body.direction.value
        _ensure_zoom_direction(direction)
        service.zoom_start_move(db, video_id, direction, body.speed or 0.5)
        return {"status": "ok"}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"变焦启动失败: {e}")


@router.post("/zoom/{video_id}/stop")
def zoom_stop(video_id: int, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """变焦持续控制停止（松开停止）"""
    try:
        _require_video_scope(video_id, current_user)
        service.zoom_stop_move(db, video_id)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"变焦停止失败: {e}")


@router.get("/ptz/{video_id}/presets", response_model=list[PTZPresetItem])
def get_presets(video_id: int, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """获取摄像头预置点列表"""
    try:
        _require_video_scope(video_id, current_user)
        return service.list_presets(db, video_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取预置点失败: {e}")


@router.post("/ptz/{video_id}/presets", response_model=PTZPresetItem)
def create_preset(
    video_id: int,
    body: PresetCreateRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """保存当前云台位置为预置点"""
    try:
        _require_video_scope(video_id, current_user)
        return service.set_preset(db, video_id, body.name, body.token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建预置点失败: {e}")


@router.post("/ptz/{video_id}/presets/{preset_token}/goto")
def goto_preset(
    video_id: int,
    preset_token: str,
    body: PresetGotoRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """跳转到指定预置点"""
    try:
        _require_video_scope(video_id, current_user)
        return service.goto_preset(db, video_id, preset_token, body.speed or 0.5)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"预置点跳转失败: {e}")


@router.delete("/ptz/{video_id}/presets/{preset_token}")
def delete_preset(
    video_id: int,
    preset_token: str,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """删除预置点"""
    try:
        _require_video_scope(video_id, current_user)
        return service.remove_preset(db, video_id, preset_token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除预置点失败: {e}")


@router.post("/ptz/{video_id}/presets/bulk-delete", response_model=PresetBulkDeleteResponse)
def bulk_delete_presets(
    video_id: int,
    body: PresetBulkDeleteRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """批量删除预置点（减少前端逐条 DELETE 导致的 CORS 预检刷屏）"""
    try:
        _require_video_scope(video_id, current_user)
        return service.remove_presets_bulk(db, video_id, body.preset_tokens)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"批量删除预置点失败: {e}")


@router.post("/ptz/{video_id}/cruise/start")
def start_cruise(
    video_id: int,
    body: CruiseStartRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """启动常规巡航（按预置点列表轮巡）"""
    try:
        _require_video_scope(video_id, current_user)
        return service.start_cruise(db, video_id, body.preset_tokens, body.dwell_seconds or 8.0, body.rounds)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"启动巡航失败: {e}")


@router.post("/ptz/{video_id}/cruise/stop")
def stop_cruise(video_id: int, current_user: dict = Depends(get_current_user)):
    """停止常规巡航"""
    try:
        _require_video_scope(video_id, current_user)
        return service.stop_cruise(video_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"停止巡航失败: {e}")


@router.get("/ptz/{video_id}/cruise/status")
def cruise_status(video_id: int, current_user: dict = Depends(get_current_user)):
    """获取巡航状态"""
    try:
        _require_video_scope(video_id, current_user)
        return service.get_cruise_status(video_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取巡航状态失败: {e}")


@router.post("/ptz/{video_id}/cruise/start-current")
def start_current_cruise(video_id: int, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """使用当前保存的配置启动巡航"""
    try:
        _require_video_scope(video_id, current_user)
        return service.start_current_cruise(db, video_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"启动当前巡航失败: {e}")


@router.put("/ptz/{video_id}/cruise/current")
def save_current_cruise(
    video_id: int,
    body: CruiseStartRequest,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """保存当前巡航配置"""
    try:
        _require_video_scope(video_id, current_user)
        return service.save_current_cruise_config(
            db,
            video_id,
            body.preset_tokens,
            body.dwell_seconds or 8.0,
            body.rounds,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存当前巡航配置失败: {e}")


@router.get("/ptz/{video_id}/cruise/current")
def get_current_cruise(video_id: int, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """获取当前巡航配置"""
    try:
        _require_video_scope(video_id, current_user)
        return service.get_current_cruise_config(db, video_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取当前巡航配置失败: {e}")


@router.post("/ai/stop")
async def stop_ai(device_id: str, current_user: dict = Depends(get_current_user)):
    """停止 AI 监控"""
    _require_video_scope(device_id, current_user)
    success = ai_manager.stop_monitoring(device_id)
    if success:
        return {"code": 200, "message": "AI监控已停止"}
    else:
        # 幂等语义：未运行也返回成功，便于前端先 stop 再 start。
        return {"code": 200, "message": "AI监控未运行，已跳过停止"}


@router.get("/{video_id}/recordings/direct")
def list_recording_videos(
    video_id: int,
    limit: int = 120,
    sort: str = "desc",
    current_user: dict = Depends(get_current_user),
):
    """获取设备的常规录制视频列表（用于"常规监控回放"）"""
    try:
        _require_video_scope(video_id, current_user)
        videos = service.list_recording_videos_direct(video_id, limit=limit, sort_order=sort)
        return {"code": 0, "data": videos, "total": len(videos)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取录制视频列表失败: {e}")


@router.get("/{video_id}/recordings/metadata")
def get_recording_metadata(
    video_id: int,
    web_path: str = Query(...),
    max_hold_ms: int = Query(500, ge=100, le=2000),
    current_user: dict = Depends(get_current_user),
):
    """Return timestamped AI metadata for a recorded raw video segment."""
    try:
        _require_video_scope(video_id, current_user)
        return service.get_recording_ai_metadata(video_id, web_path, max_hold_ms=max_hold_ms)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"get recording AI metadata failed: {e}")


@router.post("/{video_id}/recordings/boxed")
def generate_boxed_recording(
    video_id: int,
    body: BoxedRecordingRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate a boxed copy of a regular recording without modifying the source file."""
    try:
        _require_video_scope(video_id, current_user)
        result = service.generate_boxed_recording_video(
            video_id=video_id,
            web_path=body.web_path,
            algorithm=body.algorithm or "person",
            frame_stride=max(1, min(int(body.frame_stride or 5), 60)),
            force=bool(body.force),
        )
        return {"code": 0, "data": result}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("generate boxed recording failed video_id=%s", video_id)
        raise HTTPException(status_code=500, detail=f"生成带框录像失败: {e}")


@router.get("/{video_id}/alarms/videos")
def list_alarm_videos_for_device(
    video_id: int,
    limit: int = 120,
    sort: str = "desc",
    current_user: dict = Depends(get_current_user),
):
    """获取设备的报警视频列表（用于"报警监控回放"）"""
    try:
        _require_video_scope(video_id, current_user)
        videos = service.list_alarm_videos_direct(video_id, limit=limit, sort_order=sort)
        return {"code": 0, "data": videos, "total": len(videos)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取报警视频列表失败: {e}")


@router.get("/{video_id}/alarms/screenshots")
def list_alarm_screenshots_for_device(
    video_id: int,
    limit: int = 120,
    sort: str = "desc",
    current_user: dict = Depends(get_current_user),
):
    """获取设备的告警截图列表（用于"告警截图"）"""
    try:
        _require_video_scope(video_id, current_user)
        screenshots = service.list_alarm_screenshots(video_id, limit=limit, sort_order=sort)
        return {"code": 0, "data": screenshots, "total": len(screenshots)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取告警截图列表失败: {e}")


@router.get("/storage/status")
def get_storage_status(current_user: dict = Depends(get_current_user)):
    """获取存储空间使用情况"""
    try:
        status = service.check_storage_space()
        return {"code": 0, "data": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取存储状态失败: {e}")


@router.post("/storage/cleanup")
def trigger_storage_cleanup(current_user: dict = Depends(get_current_user)):
    """手动触发存储清理"""
    try:
        service.cleanup_expired_files()
        status = service.check_storage_space()
        return {"code": 0, "message": "清理完成", "data": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清理失败: {e}")
