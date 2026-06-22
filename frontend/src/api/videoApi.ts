import { API_BASE_URL, getApiUrl, getAuthHeaders, withAuthTokenParam } from './config';

const authFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  Object.entries(getAuthHeaders()).forEach(([key, value]) => {
    if (value && !headers.has(key)) {
      headers.set(key, value);
    }
  });
  return fetch(input, {
    ...init,
    headers,
    credentials: init.credentials || 'include',
  });
};

export async function recognizeVideoTraffic(videoId: string | number): Promise<any> {
  const response = await authFetch(`${API_BASE_URL}/video/${videoId}/traffic/recognize`, {
    method: 'POST',
  });
  let data: any = null;
  try {
    data = await response.json();
  } catch {}
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || 'Failed to recognize traffic');
  }
  return data;
}

const writeDeviceAuditLog = async (payload: {
  action: string;
  target_name: string;
  details?: string;
  company?: string;
  project?: string;
  grid?: string;
  team?: string;
  extra?: Record<string, any>;
}) => {
  try {
    await authFetch(`${API_BASE_URL}/logs/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operator: localStorage.getItem('username') || localStorage.getItem('userName') || 'admin',
        target_type: 'device',
        ...payload,
      }),
    });
  } catch (error) {
    console.warn('写入设备操作日志失败:', error);
  }
};

// ✅ 🔥 内网穿透终极解决方案！每次调用都实时检测！
// 不管本地开发还是远程内网穿透，100% 正确！
const getApiBase = (): string => {
  const isLocalViteDevServer =
    import.meta.env.DEV &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
    window.location.port !== '' &&
    window.location.port !== '9000';
  const isViteDevPort = import.meta.env.DEV && /^30\d\d$/.test(window.location.port);
  if (isLocalViteDevServer || isViteDevPort) return '';
  return `${window.location.protocol}//${window.location.host}`;
};

// ✅ 内网穿透适配：视频流/视频文件只用相对路径！
const fixStreamUrl = (url: string): string => {
  if (!url) return url;
  
  let path = url;
  
  // 🔥 本地文件只留相对路径！外部公网URL（萤石云等）保持不变！
  const needProcess = path.includes('/static/') || path.includes('/video/stream') || path.includes(':9000');
  
  if (needProcess) {
    // 去掉所有域名，只留相对路径！浏览器自己会拼！
    path = path.replace(/https?:\/\/[^\/]+/g, '');
    console.log('📹 视频流URL适配:', { original: url, final: path });
  }
  
  return path;
};

// --- 类型定义 ---

// 对应后端的 VideoOut schema (API 返回的数据)
export interface Video {
  id: number;
  name: string;
  company?: string;
  branch_id?: string;
  project?: string;
  project_id?: string;
  grid?: string;
  grid_id?: string;
  grid_name?: string;
  team?: string;
  team_id?: string;
  team_name?: string;
  workTeam?: string;
  work_team?: string;
  device_type?: string;
  type?: string;
  holder?: string;
  holder_id?: string;
  holder_name?: string;
  responsible_person?: string;
  responsiblePerson?: string;
  responsible_person_name?: string;
  manager?: string;
  manager_name?: string;
  ip_address?: string;
  port?: number;
  username?: string; // 补全：用于编辑回显
  password?: string; // 补全：用于编辑回显
  stream_url?: string; // 后端可能返回 null
  rtsp_url?: string;
  stream_protocol?: 'ezopen' | 'hls' | 'rtmp' | 'flv';
  device_type?: string;
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

export interface KeyboardSwitchRequest {
  status: string;
  pending: boolean;
  request_id: number;
  video_id: number | null;
  created_at: number;
  consumed: boolean;
}

export async function getKeyboardSwitchRequest(): Promise<KeyboardSwitchRequest | null> {
  try {
    const response = await fetch('http://127.0.0.1:52382/keyboard/switch-request', {
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

export async function acknowledgeKeyboardSwitchRequest(requestId: number): Promise<void> {
  try {
    await fetch('http://127.0.0.1:52382/keyboard/switch-request/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId }),
    });
  } catch {
    // Keyboard bridge may be closed; this should not block the video page.
  }
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
  device_type?: string;
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
  company?: string;
  branch_id?: string;
  project?: string;
  project_id?: string;
  grid?: string;
  grid_id?: string;
  team?: string;
  team_id?: string;
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
  company?: string;
  branch_id?: string;
  project?: string;
  project_id?: string;
  grid?: string;
  grid_id?: string;
  team?: string;
  team_id?: string;
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
  enabled?: boolean;
  reason?: string;
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
  alarm_id?: number | string;
  device_id?: string;
  device_name?: string;
  name: string;
  size_bytes: number;
  duration_seconds?: number;
  start_time?: string;
  end_time?: string;
  created_at?: string;
  updated_at: string;
  web_path: string;
  recording_path?: string;
  url?: string;
  alarm_image_path?: string;
  screenshot_path?: string;
  thumbnail_path?: string;
  thumbnail?: string;
  alarm_type?: string;
  description?: string;
  recording_status?: string;
  alarm_second?: number;
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
  traffic_limit_gb?: number;
  monthly_threshold_gb?: number;
  safety_buffer_gb?: number;
  traffic_reserved_gb?: number;
  alarm_threshold_gb?: number;
  used_gb?: number | null;
  estimated_remaining_gb?: number | null;
  remaining_gb?: number | null;
  traffic_remaining_gb?: number | null;
  remaining_formula?: string;
  monthly_threshold_text?: string;
  estimated_remaining_text?: string;
  traffic_status?: 'normal' | 'low' | 'alarm' | 'unknown' | string;
  traffic_ocr_text?: string;
  last_traffic_ocr_time?: string | null;
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
  const base = getApiBase();
  const url = `${base}/video/?limit=5000`;
  console.log('📡 请求视频设备列表:', url, '当前域名:', window.location.host, 'port:', window.location.port);
  
  const response = await authFetch(url);
  if (!response.ok) throw new Error(`Failed to fetch videos: ${response.status}`);
  
  const videos = await response.json();
  console.log('✅ 视频设备列表:', videos.length, '条', videos);
  
  // ✅ 修复视频流URL，支持内网穿透
  return videos.map((v: Video) => {
    if (v.stream_url) v.stream_url = fixStreamUrl(v.stream_url);
    if (v.rtsp_url) v.rtsp_url = fixStreamUrl(v.rtsp_url);
    return v;
  });
}

/** 创建新的视频设备 */
export async function createVideo(videoData: VideoCreate): Promise<Video> {
  const response = await authFetch(`${API_BASE_URL}/video/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(videoData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create video');
  }
  const created = await response.json();
  await writeDeviceAuditLog({
    action: '添加设备',
    target_name: created.name || videoData.name || `视频设备 ${created.id || ''}`,
    details: `添加设备 - ${created.name || videoData.name || created.id || ''}`,
    company: created.company || videoData.company,
    project: created.project || videoData.project,
    grid: (created as any).grid || (videoData as any).grid,
    team: created.team || videoData.team,
    extra: { deviceId: created.id, after: created },
  });
  return created;
}

/** 更新视频设备信息 (补充缺失的方法) */
export async function updateVideo(id: number, videoData: VideoUpdate): Promise<Video> {
  const response = await authFetch(`${API_BASE_URL}/video/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(videoData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update video');
  }
  const updated = await response.json();
  await writeDeviceAuditLog({
    action: '变更设备信息',
    target_name: updated.name || videoData.name || `视频设备 ${id}`,
    details: `变更设备信息 - ${updated.name || videoData.name || id}`,
    company: updated.company || videoData.company,
    project: updated.project || videoData.project,
    grid: (updated as any).grid || (videoData as any).grid,
    team: updated.team || videoData.team,
    extra: { deviceId: id, after: updated },
  });
  return updated;
}

/** 控制摄像头云台方向 */
export async function ptzControl(
  videoId: number,
  direction: PTZDirection,
  speed: number = 0.5,
  duration: number = 0.5
): Promise<{ status: string }> {
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}`, {
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
export async function deleteVideo(
  videoId: number,
  context: { name?: string; company?: string; project?: string; grid?: string; team?: string } = {}
): Promise<{ status: string }> {
  const response = await authFetch(`${API_BASE_URL}/video/${videoId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete video');
  }
  const result = await response.json();
  await writeDeviceAuditLog({
    action: '删除设备',
    target_name: context.name || `视频设备 ${videoId}`,
    details: `删除设备 - ${context.name || videoId}`,
    company: context.company,
    project: context.project,
    grid: context.grid,
    team: context.team,
    extra: { deviceId: videoId, before: context },
  });
  return result;
}

export async function getVideoMonitoringSummaries(): Promise<VideoMonitoringSummary[]> {
  const response = await authFetch(`${API_BASE_URL}/video/monitoring`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to fetch video monitoring summaries');
  return response.json();
}

export async function getVideoMonitoringSummary(videoId: number): Promise<VideoMonitoringSummary> {
  const response = await authFetch(`${API_BASE_URL}/video/monitoring/${videoId}`, { cache: 'no-store' });
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
      const response = await authFetch(`${API_BASE_URL}/video/stream/${videoId}`, { cache: 'no-store' });
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
  const response = await authFetch(`${API_BASE_URL}/video/sync`, {
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
  device_type?: string;
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
  const response = await authFetch(`${API_BASE_URL}/video/add_camera`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cameraData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to add camera via RTSP');
  }
  const created = await response.json();
  await writeDeviceAuditLog({
    action: '添加设备',
    target_name: created.name || cameraData.name || `视频设备 ${created.id || ''}`,
    details: `添加设备 - ${created.name || cameraData.name || created.id || ''}`,
    company: created.company || (cameraData as any).company,
    project: created.project || (cameraData as any).project,
    grid: (created as any).grid || (cameraData as any).grid,
    team: created.team || (cameraData as any).team,
    extra: { deviceId: created.id, after: created },
  });
  return created;
}
/** 持续云台移动-开始（按下时调用） */
export async function ptzStartControl(
  videoId: number,
  direction: PTZDirection,
  speed: number = 0.5,
): Promise<{ status: string }> {
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/start`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/stop`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/zoom/${videoId}`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/zoom/${videoId}/start`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/zoom/${videoId}/stop`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/presets`);
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
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/presets`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/presets/${encodeURIComponent(presetToken)}/goto`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/presets/${encodeURIComponent(presetToken)}`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/presets/bulk-delete`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/cruise/start`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/cruise/stop`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/cruise/status`);
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
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/cruise/current`);
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
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/cruise/current`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/ptz/${videoId}/cruise/start-current`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/${videoId}/playback/save`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/${videoId}/recordings?limit=${limit}`);
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
  const response = await authFetch(`${API_BASE_URL}/video/${videoId}/playback/temp-cache`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/${videoId}/playback/videos?limit=${limit}`);
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
  const response = await authFetch(`${API_BASE_URL}/video/${videoId}/playback/temp/videos?limit=${limit}`);
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
  const response = await authFetch(`${API_BASE_URL}/video/${videoId}/alarm/videos?limit=${limit}`);
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
  const response = await authFetch(`${API_BASE_URL}/video/ai/start`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/ai/stop?device_id=${encodeURIComponent(deviceId)}`, {
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
  const response = await authFetch(`${API_BASE_URL}/video/${deviceId}/rules`);
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
  const response = await authFetch(`${API_BASE_URL}/video/${deviceId}/rules`, {
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
  // Prefer the runtime registry endpoint so UI stays aligned with backend ai_features.
  const urls = [`${API_BASE_URL}/api/ai/algorithms`, 'http://127.0.0.1:9000/api/ai/algorithms'];
  let result: any = null;
  let lastError = 'Failed to load AI rules';

  for (const url of urls) {
    try {
      const response = await authFetch(url);
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
    .filter((item: any) => item?.key && item?.enabled === true)
    .map((item: any) => ({
      key: String(item.key),
      desc: String(item.desc || item.key),
      enabled: Boolean(item.enabled),
      reason: String(item.reason || ''),
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
  const base = getApiBase();
  const response = await authFetch(
    `${base}/video/${videoId}/alarms/videos?limit=${limit}&sort=${sort}`
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
  
  let list: SavedPlaybackVideo[] = [];
  // ✅ 处理 {code: 0, data: [...]} 格式
  if (result.code === 0 && Array.isArray(result.data)) {
    list = result.data;
  } else if (Array.isArray(result)) {
    list = result;
  }
  
  // ✅ 内网穿透：替换所有文件路径里的 localhost
  return list.map(v => fixPlaybackUrl(v));
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
  const base = getApiBase();
  const response = await authFetch(
    `${base}/video/${videoId}/recordings/direct?limit=${limit}&sort=${sort}`
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
  
  let list: SavedPlaybackVideo[] = [];
  // ✅ 处理 {code: 0, data: [...]} 格式
  if (result.code === 0 && Array.isArray(result.data)) {
    list = result.data;
  } else if (Array.isArray(result)) {
    list = result;
  }
  
  // ✅ 内网穿透：替换所有文件路径里的 localhost
  return list.map(v => fixPlaybackUrl(v));
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
  const base = getApiBase();
  const response = await authFetch(
    `${base}/video/${videoId}/alarms/screenshots?limit=${limit}&sort=${sort}`
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
  
  let list: SavedPlaybackVideo[] = [];
  // ✅ 处理 {code: 0, data: [...]} 格式
  if (result.code === 0 && Array.isArray(result.data)) {
    list = result.data;
  } else if (Array.isArray(result)) {
    list = result;
  }
  
  // ✅ 内网穿透：替换所有文件路径里的 localhost
  return list.map(v => fixPlaybackUrl(v));
}

// ✅ 内网穿透终极解决方案！只用相对路径！
// ✅ HTTPS/HTTP 都兼容！浏览器自动适配！
const fixPlaybackUrl = (v: any): any => {
  if (!v) return v;
  
  console.log('🎬 后端原始数据:', v);
  
  // 🔥 只要相对路径 /static/... 就行！
  // 浏览器自己会用当前页面的协议 + 域名 + 端口
  const processValue = (value: any): any => {
    if (typeof value === 'string') {
      if (value.includes('/static/') || value.includes('/api/videos/') || value.includes('/api/alarm_videos/') || value.includes('/api/alarm_screenshots/') || value.includes('/api/playback_videos/')) {
        let path = value;
        // 去掉所有域名，只留相对路径！100% 兼容！
        path = path.replace(/https?:\/\/[^\/]+/g, '');
        const finalUrl = withAuthTokenParam(getApiUrl(path));
        console.log(`媒体路径适配: ${value} -> ${finalUrl}`);
        return finalUrl;
      }
    } else if (Array.isArray(value)) {
      return value.map(processValue);
    } else if (typeof value === 'object' && value !== null) {
      const result: any = {};
      for (const key of Object.keys(value)) {
        result[key] = processValue(value[key]);
      }
      return result;
    }
    return value;
  };
  
  return processValue(v);
};

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

