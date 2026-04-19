import { API_BASE_URL } from './config';

// --- 类型定义 ---

// 对应后端的 VideoOut schema (API 返回的数据)
export interface Video {
  id: number;
  name: string;
  company?: string;
  project?: string;
  ip_address?: string;
  port?: number;
  username?: string; // 补全：用于编辑回显
  password?: string; // 补全：用于编辑回显
  stream_url?: string; // 后端可能返回 null
  rtsp_url?: string;
  stream_protocol?: 'ezopen' | 'hls' | 'rtmp' | 'flv';
  platform_type?: 'onvif' | 'ezviz' | string;
  access_source?: 'local' | 'cloud' | string;
  ptz_source?: 'onvif' | 'ezviz' | string;
  device_serial?: string;
  channel_no?: number;
  supports_ptz?: number;
  supports_preset?: number;
  supports_cruise?: number;
  supports_zoom?: number;
  supports_focus?: number;
  weekly_quota_bytes?: number;
  sleeping?: boolean;
  privacy_enabled?: boolean;
  storage_abnormal?: boolean;
  low_battery?: boolean;
  weak_signal?: boolean;
  status: 'online' | 'offline';
  is_active: number;
  remark?: string;
  latitude?: number;
  longitude?: number;
}

// 对应后端的 VideoCreate schema (创建时提交的数据)
export interface VideoCreate {
  name: string;
  ip_address?: string;
  port?: number;      // 后端默认为 80
  username?: string;
  password?: string;
  stream_url?: string; // 改为可选，允许为空
  rtsp_url?: string;
  stream_protocol?: 'ezopen' | 'hls' | 'rtmp' | 'flv';
  platform_type?: 'onvif' | 'ezviz' | string;
  access_source?: 'local' | 'cloud' | string;
  ptz_source?: 'onvif' | 'ezviz' | string;
  device_serial?: string;
  channel_no?: number;
  weekly_quota_bytes?: number;
  sleeping?: boolean;
  privacy_enabled?: boolean;
  storage_abnormal?: boolean;
  low_battery?: boolean;
  weak_signal?: boolean;
  status?: 'online' | 'offline';
  remark?: string;
}

// 对应后端的 VideoUpdate schema (更新时提交的数据)
export interface VideoUpdate {
  name?: string;
  ip_address?: string;
  port?: number;
  username?: string;
  password?: string;
  stream_url?: string;
  rtsp_url?: string;
  stream_protocol?: 'ezopen' | 'hls' | 'rtmp' | 'flv';
  platform_type?: 'onvif' | 'ezviz' | string;
  access_source?: 'local' | 'cloud' | string;
  ptz_source?: 'onvif' | 'ezviz' | string;
  device_serial?: string;
  channel_no?: number;
  supports_ptz?: number;
  supports_preset?: number;
  supports_cruise?: number;
  supports_zoom?: number;
  supports_focus?: number;
  weekly_quota_bytes?: number;
  sleeping?: boolean;
  privacy_enabled?: boolean;
  storage_abnormal?: boolean;
  low_battery?: boolean;
  weak_signal?: boolean;
  status?: 'online' | 'offline';
  remark?: string;
  is_active?: number;
}

export interface StreamUrl {
  url: string;
  play_type: 'ezopen' | 'hls' | 'rtmp' | 'flv' | 'rtsp' | string;
  platform: 'ezviz' | 'onvif' | string;
  device_serial?: string;
  channel_no?: number;
  access_token?: string;
}

export interface AIRule {
  key: string;
  desc: string;
}

export interface PlaybackSavePayload {
  start_time: string;
  end_time: string;
}

export interface PlaybackSaveResponse {
  status: string;
  video_id: number;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  recording_path: string;
}

export interface RecordingSegment {
  name: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  size_bytes: number;
  web_path: string;
}

export interface SavedPlaybackVideo {
  name: string;
  size_bytes: number;
  duration_seconds?: number;
  updated_at: string;
  web_path: string;
}

export interface TempCacheSaveResponse extends PlaybackSaveResponse {
  cache_window_start: string;
  cache_window_end: string;
  archive_window_hours: number;
}

export type PTZDirection = 'up' | 'down' | 'left' | 'right' | 'zoom_in' | 'zoom_out';
export type ZoomDirection = 'zoom_in' | 'zoom_out';

export interface PTZPresetItem {
  token: string;
  name: string;
}

export interface CruiseStatus {
  running: boolean;
  preset_tokens?: string[];
  dwell_seconds?: number;
  rounds?: number | null;
}

export interface PresetBulkDeleteResponse {
  total: number;
  deleted: number;
  failed: number;
  deleted_tokens: string[];
  failed_tokens: string[];
}

export interface VideoMonitoringSummary {
  device_id: number;
  device_name: string;
  device_serial?: string | null;
  weekly_quota_bytes: number;
  weekly_used_bytes: number;
  weekly_remaining_bytes: number;
  weekly_quota_text: string;
  weekly_used_text: string;
  weekly_remaining_text: string;
  cycle_start_time: string;
  cycle_end_time: string;
  last_calculated_at: string;
  main_status: 'online' | 'offline' | 'sleeping' | string;
  privacy_enabled: boolean;
  storage_abnormal: boolean;
  low_battery: boolean;
  weak_signal: boolean;
  sleeping: boolean;
  alarm_active: boolean;
  status_tags: string[];
  is_fault: boolean;
  status_text: string;
}

// --- API 方法 ---

/** 获取所有视频设备列表 */
export async function getAllVideos(): Promise<Video[]> {
  const response = await fetch(`${API_BASE_URL}/video/`);
  if (!response.ok) throw new Error('Failed to fetch videos');
  return response.json();
}

/** 创建新的视频设备 */
export async function createVideo(videoData: VideoCreate): Promise<Video> {
  const response = await fetch(`${API_BASE_URL}/video/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(videoData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create video');
  }
  return response.json();
}

/** 更新视频设备信息 (补充缺失的方法) */
export async function updateVideo(id: number, videoData: VideoUpdate): Promise<Video> {
  const response = await fetch(`${API_BASE_URL}/video/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(videoData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update video');
  }
  return response.json();
}

/** 控制摄像头云台方向 */
export async function ptzControl(
  videoId: number,
  direction: PTZDirection,
  speed: number = 0.5,
  duration: number = 0.5
): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction, speed, duration }),
  });
  if (!response.ok) {
    let msg = 'Failed to control PTZ';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

/** 删除指定的视频设备 */
export async function deleteVideo(videoId: number): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete video');
  }
  return response.json();
}

export async function getVideoMonitoringSummaries(): Promise<VideoMonitoringSummary[]> {
  const response = await fetch(`${API_BASE_URL}/video/monitoring`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to fetch video monitoring summaries');
  return response.json();
}

export async function getVideoMonitoringSummary(videoId: number): Promise<VideoMonitoringSummary> {
  const response = await fetch(`${API_BASE_URL}/video/monitoring/${videoId}`, { cache: 'no-store' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch video monitoring summary');
  }
  return response.json();
}

// --- 前端流媒体地址缓存机制 ---
// 防止短时间内重复请求导致萤石云并发数超限

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresIn: number; // 缓存有效期（毫秒）
}

interface GetVideoStreamOptions {
  forceRefresh?: boolean;
}

const STREAM_URL_FRONTEND_CACHE: Map<number, CacheEntry<StreamUrl>> = new Map();
const STREAM_URL_REQUEST_LOCKS: Map<number, Promise<StreamUrl>> = new Map();
const STREAM_URL_CACHE_TTL_DEFAULT_MS = 55 * 60 * 1000;
const STREAM_URL_CACHE_TTL_EZVIZ_MS = 30 * 1000;
const ENABLE_STREAM_URL_FRONTEND_CACHE = false;

function getStreamUrlCacheTtl(data: StreamUrl): number {
  const playType = String(data.play_type || '').toLowerCase();
  const platform = String(data.platform || '').toLowerCase();
  const url = String(data.url || '').toLowerCase();
  const isEzviz = platform === 'ezviz' || playType === 'ezopen' || url.startsWith('ezopen://') || !!data.access_token;
  return isEzviz ? STREAM_URL_CACHE_TTL_EZVIZ_MS : STREAM_URL_CACHE_TTL_DEFAULT_MS;
}

export function clearVideoStreamUrlCache(videoId?: number): void {
  if (typeof videoId === 'number') {
    STREAM_URL_FRONTEND_CACHE.delete(videoId);
    return;
  }
  STREAM_URL_FRONTEND_CACHE.clear();
}

/** 获取指定设备的视频流地址（带前端缓存） */
export async function getVideoStreamUrl(videoId: number, options: GetVideoStreamOptions = {}): Promise<StreamUrl> {
  const now = Date.now();
  const forceRefresh = !!options.forceRefresh;

  if (!ENABLE_STREAM_URL_FRONTEND_CACHE || forceRefresh) {
    STREAM_URL_FRONTEND_CACHE.delete(videoId);
  }
  
  // 1. 检查前端缓存是否有效
  const cached = STREAM_URL_FRONTEND_CACHE.get(videoId);
  if (ENABLE_STREAM_URL_FRONTEND_CACHE && !forceRefresh && cached && cached.timestamp + cached.expiresIn > now) {
    console.log(`[缓存命中] 视频流地址 video_id=${videoId}`);
    return cached.data;
  }
  
  // 2. 如果有进行中的请求，返回该 Promise，避免并发重复请求
  if (ENABLE_STREAM_URL_FRONTEND_CACHE && !forceRefresh && STREAM_URL_REQUEST_LOCKS.has(videoId)) {
    console.log(`[请求中] 等待视频流请求完成 video_id=${videoId}`);
    return STREAM_URL_REQUEST_LOCKS.get(videoId)!;
  }
  
  // 3. 发起新请求并使用锁防止并发
  const requestPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/video/stream/${videoId}`, { cache: 'no-store' });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to get stream URL');
      }
      const data = await response.json();
      const expiresIn = getStreamUrlCacheTtl(data);
      
      // 4. 可选缓存结果（当前默认禁用，强制每次取最新地址）
      if (ENABLE_STREAM_URL_FRONTEND_CACHE) {
        STREAM_URL_FRONTEND_CACHE.set(videoId, {
          data,
          timestamp: Date.now(),
          expiresIn,
        });
        console.log(`[缓存保存] 视频流地址已缓存 video_id=${videoId}, 有效期=${Math.round(expiresIn / 1000)}秒`);
      } else {
        console.log(`[实时拉流] video_id=${videoId}`);
      }
      return data;
    } finally {
      // 5. 移除锁，允许后续请求
      STREAM_URL_REQUEST_LOCKS.delete(videoId);
    }
  })();
  
  STREAM_URL_REQUEST_LOCKS.set(videoId, requestPromise);
  return requestPromise;
}

/** 同步设备列表 (补充缺失的方法) */
export async function syncDevices(): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/video/sync`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to sync devices');
  }
  return response.json();
}

/** 通过 RTSP 地址动态添加摄像头（由 Node Media Server 拉流转码） */
export async function addCameraViaRTSP(cameraData: {
  name: string;
  rtsp_url: string;
  ip_address?: string;
  port?: number;
  username?: string;
  password?: string;
  latitude?: number;
  longitude?: number;
  remark?: string;
  stream_protocol?: 'ezopen' | 'hls' | 'rtmp' | 'flv';
  platform_type?: 'onvif' | 'ezviz' | string;
  access_source?: 'local' | 'cloud' | string;
  ptz_source?: 'onvif' | 'ezviz' | string;
  device_serial?: string;
  channel_no?: number;
  weekly_quota_bytes?: number;
  sleeping?: boolean;
  privacy_enabled?: boolean;
  storage_abnormal?: boolean;
  low_battery?: boolean;
  weak_signal?: boolean;
}): Promise<Video> {
  const response = await fetch(`${API_BASE_URL}/video/add_camera`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cameraData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to add camera via RTSP');
  }
  return response.json();
}
/** 持续云台移动-开始（按下时调用） */
export async function ptzStartControl(
  videoId: number,
  direction: PTZDirection,
  speed: number = 0.5,
): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction, speed, duration: 1 }),
  });
  if (!response.ok) {
    let msg = 'Failed to start PTZ';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

/** 持续云台移动-停止（松开时调用） */
export async function ptzStopControl(videoId: number): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/stop`, {
    method: 'POST',
  });
  if (!response.ok) {
    let msg = 'Failed to stop PTZ';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

/** 变焦单次控制 */
export async function zoomControl(
  videoId: number,
  direction: ZoomDirection,
  speed: number = 0.5,
  duration: number = 0.5
): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/zoom/${videoId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction, speed, duration }),
  });
  if (!response.ok) {
    let msg = 'Failed to control zoom';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

/** 变焦开始（按下时调用） */
export async function zoomStartControl(
  videoId: number,
  direction: ZoomDirection,
  speed: number = 0.5,
): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/zoom/${videoId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction, speed, duration: 1 }),
  });
  if (!response.ok) {
    let msg = 'Failed to start zoom';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

/** 变焦停止（松开时调用） */
export async function zoomStopControl(videoId: number): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/zoom/${videoId}/stop`, {
    method: 'POST',
  });
  if (!response.ok) {
    let msg = 'Failed to stop zoom';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function getPresets(videoId: number): Promise<PTZPresetItem[]> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/presets`);
  if (!response.ok) {
    let msg = 'Failed to fetch presets';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function createPreset(videoId: number, payload: { name?: string; token?: string }): Promise<PTZPresetItem> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/presets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let msg = 'Failed to create preset';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function gotoPreset(videoId: number, presetToken: string, speed: number = 0.5): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/presets/${encodeURIComponent(presetToken)}/goto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speed }),
  });
  if (!response.ok) {
    let msg = 'Failed to goto preset';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function deletePreset(videoId: number, presetToken: string): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/presets/${encodeURIComponent(presetToken)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    let msg = 'Failed to delete preset';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function deletePresetsBulk(videoId: number, presetTokens: string[]): Promise<PresetBulkDeleteResponse> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/presets/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preset_tokens: presetTokens }),
  });
  if (!response.ok) {
    let msg = 'Failed to bulk delete presets';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function startCruise(videoId: number, payload: {
  preset_tokens: string[];
  dwell_seconds?: number;
  rounds?: number | null;
}): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/cruise/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let msg = 'Failed to start cruise';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function stopCruise(videoId: number): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/cruise/stop`, {
    method: 'POST',
  });
  if (!response.ok) {
    let msg = 'Failed to stop cruise';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function getCruiseStatus(videoId: number): Promise<CruiseStatus> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/cruise/status`);
  if (!response.ok) {
    let msg = 'Failed to fetch cruise status';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export interface CruiseConfig {
  video_id: number;
  preset_tokens: string[];
  dwell_seconds: number;
  rounds: number | null;
}

export async function getCurrentCruiseConfig(videoId: number): Promise<CruiseConfig> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/cruise/current`);
  if (!response.ok) {
    let msg = 'Failed to fetch cruise config';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function saveCurrentCruiseConfig(
  videoId: number,
  config: {
    preset_tokens: string[];
    dwell_seconds: number;
    rounds: number | null;
  }
): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/cruise/current`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    let msg = 'Failed to save cruise config';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function startCurrentCruise(videoId: number): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/video/ptz/${videoId}/cruise/start-current`, {
    method: 'POST',
  });
  if (!response.ok) {
    let msg = 'Failed to start cruise with current config';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

/**
 * @deprecated 仅历史兼容。视频中心已移除回放保存能力，请使用独立视频回放页。
 */
export async function savePlaybackClip(
  videoId: number,
  payload: PlaybackSavePayload
): Promise<PlaybackSaveResponse> {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}/playback/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let msg = 'Failed to save playback clip';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }

  return response.json();
}

/**
 * @deprecated 仅历史兼容。视频中心已移除分段回放能力，请使用独立视频回放页。
 */
export async function getRecordingSegments(
  videoId: number,
  limit: number = 72
): Promise<RecordingSegment[]> {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}/recordings?limit=${limit}`);
  if (!response.ok) {
    let msg = 'Failed to get recording segments';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function triggerTempPlaybackCache(videoId: number): Promise<TempCacheSaveResponse> {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}/playback/temp-cache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: true }),
  });

  if (!response.ok) {
    let msg = 'Failed to save temp playback cache';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }

  return response.json();
}

export async function getSavedPlaybackVideos(
  videoId: number,
  limit: number = 120
): Promise<SavedPlaybackVideo[]> {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}/playback/videos?limit=${limit}`);
  if (!response.ok) {
    let msg = 'Failed to get saved playback videos';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function getTempPlaybackVideos(
  videoId: number,
  limit: number = 30
): Promise<SavedPlaybackVideo[]> {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}/playback/temp/videos?limit=${limit}`);
  if (!response.ok) {
    let msg = 'Failed to get temp playback videos';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function getAlarmPlaybackVideos(
  videoId: number,
  limit: number = 120
): Promise<SavedPlaybackVideo[]> {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}/alarm/videos?limit=${limit}`);
  if (!response.ok) {
    let msg = 'Failed to get alarm videos';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}

// --- 新增：AI 监控控制接口 ---

// 开启指定设备的 AI 监控
// --- 找到 frontend/src/api/videoApi.ts 文件，在末尾添加以下内容 ---

// 1. 开启 AI 监控
export const startAIMonitoring = async (deviceId: string, rtspUrl: string, algoType: string = "helmet,smoking") => {
  const response = await fetch(`${API_BASE_URL}/video/ai/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_id: deviceId, rtsp_url: rtspUrl, algo_type: algoType }),
  });

  if (!response.ok) {
    let msg = 'Failed to start AI monitoring';
    try {
      const err = await response.json();
      msg = err.detail || err.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  if (data?.code && Number(data.code) !== 200) {
    throw new Error(data?.message || 'Failed to start AI monitoring');
  }
  return data;
};

// 2. 停止 AI 监控
export const stopAIMonitoring = async (deviceId: string) => {
  const response = await fetch(`${API_BASE_URL}/video/ai/stop?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'POST',
  });

  if (!response.ok) {
    let msg = 'Failed to stop AI monitoring';
    try {
      const err = await response.json();
      msg = err.detail || err.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  if (data?.code && Number(data.code) !== 200) {
    throw new Error(data?.message || 'Failed to stop AI monitoring');
  }
  return data;
};

export const getDeviceRules = async (deviceId: number): Promise<string[]> => {
  const response = await fetch(`${API_BASE_URL}/video/${deviceId}/rules`);
  if (!response.ok) {
    let msg = 'Failed to get device rules';
    try {
      const err = await response.json();
      msg = err.detail || err.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  return Array.isArray(data?.rules) ? data.rules : [];
};

export const updateDeviceRules = async (deviceId: number, rules: string[]): Promise<string[]> => {
  const response = await fetch(`${API_BASE_URL}/video/${deviceId}/rules`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rules }),
  });

  if (!response.ok) {
    let msg = 'Failed to update device rules';
    try {
      const err = await response.json();
      msg = err.detail || err.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  return Array.isArray(data?.rules) ? data.rules : [];
};

export const getAIRules = async (): Promise<AIRule[]> => {
  // Keep compatibility with existing project setup where backend may run on 9000.
  const urls = [`${API_BASE_URL}/video/ai/rules`, 'http://127.0.0.1:9000/video/ai/rules'];
  let result: any = null;
  let lastError = 'Failed to load AI rules';

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        try {
          const err = await response.json();
          lastError = err.detail || err.message || lastError;
        } catch {}
        continue;
      }
      result = await response.json();
      break;
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
  }

  if (!result) {
    throw new Error(lastError);
  }

  const list = Array.isArray(result?.data) ? result.data : [];

  return list
    .filter((item: any) => item?.key)
    .map((item: any) => ({
      key: String(item.key),
      desc: String(item.desc || item.key),
    }));
};
/**
 * 获取设备的报警视频列表（用于"报警监控回放"）
 * 从 alarm_videos 目录读取
 */
export async function getAlarmVideosList(
  videoId: number,
  limit: number = 120,
  sort: string = "desc"
): Promise<SavedPlaybackVideo[]> {
  const response = await fetch(
    `${API_BASE_URL}/video/${videoId}/alarms/videos?limit=${limit}&sort=${sort}`
  );
  if (!response.ok) {
    let msg = 'Failed to get alarm videos';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  const result = await response.json();
  // ✅ 处理 {code: 0, data: [...]} 格式
  if (result.code === 0 && Array.isArray(result.data)) {
    return result.data;
  }
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}
/**
 * 获取设备的常规录制视频列表（用于"常规监控回放"）
 * 直接从 recordings/{device_id} 目录读取
 */
export async function getRecordingVideos(
  videoId: number,
  limit: number = 120,
  sort: string = "desc"
): Promise<SavedPlaybackVideo[]> {
  const response = await fetch(
    `${API_BASE_URL}/video/${videoId}/recordings/direct?limit=${limit}&sort=${sort}`
  );
  if (!response.ok) {
    let msg = 'Failed to get recording videos';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  const result = await response.json();
  // ✅ 处理 {code: 0, data: [...]} 格式
  if (result.code === 0 && Array.isArray(result.data)) {
    return result.data;
  }
  // 兼容直接返回数组的情况
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}
/**
 * 获取设备的报警截图列表
 * 从 alarm_screenshots 目录读取
 */
export async function getAlarmScreenshots(
  videoId: number,
  limit: number = 120,
  sort: string = "desc"
): Promise<SavedPlaybackVideo[]> {
  const response = await fetch(
    `${API_BASE_URL}/video/${videoId}/alarms/screenshots?limit=${limit}&sort=${sort}`
  );
  if (!response.ok) {
    let msg = 'Failed to get alarm screenshots';
    try {
      const err = await response.json();
      msg = err.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  const result = await response.json();
  // ✅ 处理 {code: 0, data: [...]} 格式
  if (result.code === 0 && Array.isArray(result.data)) {
    return result.data;
  }
  // 兼容直接返回数组的情况
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}

/**
 * 同步当前控制目标摄像头给 keyboard 程序
 * 当前端用户选中某台摄像头进入主控状态时调用
 */
export async function setKeyboardTarget(videoId: number) {
  // 先尝试主端口，再 fallback 到键盘服务端口
  const urls = [
    `http://127.0.0.1:52382/keyboard/target`,
    `${API_BASE_URL}/keyboard/target`,
  ];
  
  let lastError = 'Failed to set keyboard target';
  
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ video_id: videoId }),
      });
      
      if (res.ok) {
        const data = await res.json();
        return data;
      }
      
      try {
        const err = await res.json();
        lastError = err.detail || err.message || lastError;
      } catch {}
    } catch (e: any) {
      console.log(`键盘服务 ${url} 未启动，跳过:`, e.message);
      // 键盘服务未启动不报错，不影响核心功能
      return { success: true, message: '键盘服务未启动，已跳过同步' };
    }
  }
  
  // 不抛出错误，只返回警告
  console.log('键盘目标同步失败（不影响主功能）:', lastError);
  return { success: true, message: '键盘服务未启动，跳过同步' };
}

