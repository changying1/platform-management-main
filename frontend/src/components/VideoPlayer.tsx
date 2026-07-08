import React, { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import flvjs from 'flv.js';
import { getDeviceRules, getVideoStreamUrl, PTZ_ACTIVITY_EVENT, recognizeVideoTraffic, startAIMonitoring } from '../api/videoApi';
import { getAuthHeaders } from '../api/config';
import { getAlarmDisplayLabel } from '../utils/alarmDisplay';

const detectBackendUrl = (): string => {
  if ((import.meta as any).env?.VITE_API_BASE_URL) return (import.meta as any).env?.VITE_API_BASE_URL;
  if (window.location.port === '3000') return '';
  return `${window.location.protocol}//${window.location.host}`;
};

const API_BASE_URL = detectBackendUrl();
const MAX_RETRIES = 8;
const RETRY_DELAY_MS = 1200;
const TRAFFIC_OCR_FIRST_DELAY_MS = 10 * 1000;
const TRAFFIC_OCR_AUTO_INTERVAL_MS = 60 * 60 * 1000;
let VIDEO_PLAYER_INSTANCE_SEQ = 0;

interface VideoPlayerProps {
  src: string;
  playType?: string;
  accessToken?: string;
  videoId?: number;
  deviceStatus?: string;
  onError?: (error: string) => void;
  showTrafficPanel?: boolean;
  trafficPanelVariant?: 'full' | 'compact';
}

interface MonitoringSummary {
  weekly_quota_text?: string;
  weekly_used_text?: string;
  weekly_remaining_text?: string;
  total_flow_display?: string;
  used_flow_display?: string;
  remaining_flow_display?: string;
  total_flow_value?: string | number | null;
  used_flow_value?: string | number | null;
  residual_flow_value?: string | number | null;
  traffic_display_unit?: string;
  total_flow_unit?: string;
  used_flow_unit?: string;
  residual_flow_unit?: string;
  remaining_flow_unit?: string;
  traffic?: {
    total?: { value?: string | number | null; unit?: string; raw?: unknown };
    used?: { value?: string | number | null; unit?: string; raw?: unknown };
    remaining?: { value?: string | number | null; unit?: string; raw?: unknown };
    display_unit?: string;
  };
  monthly_threshold_text?: string;
  estimated_remaining_text?: string;
  traffic_status?: string;
  traffic_text?: string;
  used_traffic_gb?: number | null;
  traffic_value?: number | null;
  last_traffic_ocr_time?: string | null;
  last_calculated_at?: string | null;
  main_status?: string;
  status_tags?: string[];
}

type ConnectionStatus = 'connecting' | 'connected' | 'error';

interface LivePersonTrack {
  track_id?: string;
  coords_norm?: number[];
  coords?: number[];
  personName?: string;
  personnel_id?: string;
  behaviorAlarms?: Array<{ label?: string; type?: string; level?: string; msg?: string }>;
  alarmLabels?: string[];
  alarmLevel?: string;
  misses?: number;
  score?: number;
  box_area?: number;
}

interface LiveTrackPayload {
  timestamp?: string | null;
  frame_epoch?: number | null;
  frame_epoch_ms?: number | null;
  detect_elapsed_ms?: number | null;
  frame_width?: number | null;
  frame_height?: number | null;
  tracks?: LivePersonTrack[];
  source?: string;
  age_ms?: number;
  video_box_delta_ms?: number;
  flv_playback_epoch_ms?: number;
  flv_playback_lag_ms?: number;
  flv_target_delay_ms?: number;
}

type VideoSyncMode = 'tracking' | 'realtime';
type StreamMode = 'auto' | 'flv' | 'ezopen';
const MAX_RENDERED_PERSON_TRACKS = 20;
const SAME_PERSON_IOU_THRESHOLD = 0.55;
const SAME_PERSON_CENTER_DISTANCE_THRESHOLD = 0.06;
const AI_BOX_SMOOTH_CENTER_ALPHA = 0.9;
const AI_BOX_SMOOTH_SIZE_ALPHA = 0.3;
const AI_BOX_SMOOTH_DEADBAND = 0.004;
const AI_BOX_SMOOTH_MAX_AGE_MS = 700;
const AI_BOX_RELINK_MAX_AGE_MS = 900;
const AI_BOX_RELINK_CENTER_DISTANCE = 0.18;
const ENABLE_SYNC_FRAME_FREEZE = false;
const AI_FRAME_DETECT_MIN_INTERVAL_MS = Number((import.meta as any).env?.VITE_AI_FRAME_DETECT_INTERVAL_MS || 350);
const AI_TRACK_POLL_INTERVAL_MS = Number((import.meta as any).env?.VITE_AI_TRACK_POLL_INTERVAL_MS || Math.max(250, Math.floor(AI_FRAME_DETECT_MIN_INTERVAL_MS / 2)));
const HTTP_FLV_DISABLED = false;
const MIN_RENDERABLE_BOX_SIZE = 0.01;
const MAX_RENDERABLE_BOX_SPAN = 0.995;
const MAX_RENDERABLE_BOX_AREA = 0.96;
const TRACK_PAYLOAD_CACHE_MAX_AGE_MS = 8000;
const TRACK_BOX_STALE_LIMIT_MS = 4000;
const TRACK_ALARM_LABEL_STALE_LIMIT_MS = 8000;
const AI_OVERLAY_REFRESH_EVENT = 'video-ai-overlay-refresh';
const lastTrackPayloadByVideo = new Map<string, LiveTrackPayload & { cached_at_ms?: number }>();

const stripCachedBehaviorLabels = (payload: LiveTrackPayload): LiveTrackPayload => payload;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const normalizeTrackCoords = (
  track: LivePersonTrack,
  payload?: Pick<LiveTrackPayload, 'frame_width' | 'frame_height'> | null,
): number[] | null => {
  const rawCoords = Array.isArray(track.coords_norm)
    ? track.coords_norm
    : Array.isArray(track.coords)
      ? track.coords
      : [];
  if (rawCoords.length < 4) return null;

  let [x1, y1, x2, y2] = rawCoords.slice(0, 4).map((value) => Number(value));
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;

  const frameWidth = Number(payload?.frame_width || 0);
  const frameHeight = Number(payload?.frame_height || 0);
  const looksLikePixels = Math.max(Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2)) > 1.5;
  if (looksLikePixels && frameWidth > 0 && frameHeight > 0) {
    x1 /= frameWidth;
    x2 /= frameWidth;
    y1 /= frameHeight;
    y2 /= frameHeight;
  }

  const left = clamp01(Math.min(x1, x2));
  const top = clamp01(Math.min(y1, y2));
  const right = clamp01(Math.max(x1, x2));
  const bottom = clamp01(Math.max(y1, y2));
  const width = right - left;
  const height = bottom - top;
  if (width < MIN_RENDERABLE_BOX_SIZE || height < MIN_RENDERABLE_BOX_SIZE) return null;
  if (width >= MAX_RENDERABLE_BOX_SPAN && height >= MAX_RENDERABLE_BOX_SPAN) {
    console.debug('[AIOverlay] drop nearly fullscreen box', { track, coords: [left, top, right, bottom], width, height });
    return null;
  }
  if (width * height >= MAX_RENDERABLE_BOX_AREA) {
    console.debug('[AIOverlay] drop oversized box', { track, coords: [left, top, right, bottom], area: width * height });
    return null;
  }
  return [left, top, right, bottom];
};
const FLV_SYNC_DELAY_MS = Number((import.meta as any).env?.VITE_FLV_SYNC_DELAY_MS || 1800);
const FLV_SYNC_TOLERANCE_MS = Number((import.meta as any).env?.VITE_FLV_SYNC_TOLERANCE_MS || 700);
const FLV_SYNC_HISTORY_MS = Number((import.meta as any).env?.VITE_FLV_SYNC_HISTORY_MS || 6000);
const FLV_MAX_DELAY_SECONDS = Number((import.meta as any).env?.VITE_FLV_MAX_DELAY_SECONDS || 4.5);
const FLV_MIN_DELAY_SECONDS = Number((import.meta as any).env?.VITE_FLV_MIN_DELAY_SECONDS || 1.0);
const FLV_DELAY_READY_TOLERANCE_SECONDS = 0.25;
const AI_BACKEND_TRACK_LOG_EVERY = 20;

const isHttpFlvStream = (stream?: { src?: string; playType?: string; source?: string } | null): boolean => {
  const playType = String(stream?.playType || '').toLowerCase();
  const src = String(stream?.src || '').toLowerCase();
  return stream?.source === 'flv' || playType === 'flv' || src.includes('.flv');
};

interface SyncedAiFrame {
  image: string;
  captureTime: number;
  responseAt: number;
}

const hasRecognizedTraffic = (summary?: MonitoringSummary | null): boolean => {
  const text = summary?.weekly_used_text || '';
  return !!text && text !== '--' && text !== '等待识别' && text !== '识别中';
};

const trafficUnit = (data: any, field: 'total' | 'used' | 'remaining'): string | undefined => {
  const flatUnitKey =
    field === 'total' ? 'total_flow_unit' : field === 'used' ? 'used_flow_unit' : 'residual_flow_unit';
  const aliasUnitKey = field === 'remaining' ? 'remaining_flow_unit' : flatUnitKey;
  return (
    data?.traffic?.[field]?.unit ||
    data?.[flatUnitKey] ||
    data?.[aliasUnitKey] ||
    data?.traffic_display_unit ||
    data?.traffic?.display_unit ||
    undefined
  );
};

const trafficValue = (data: any, field: 'total' | 'used' | 'remaining'): unknown => {
  if (field === 'total') return data?.traffic?.total?.value ?? data?.total_flow_value ?? data?.totalFlow ?? data?.total_flow;
  if (field === 'used') return data?.traffic?.used?.value ?? data?.used_flow_value ?? data?.usedFlow ?? data?.used_flow;
  return data?.traffic?.remaining?.value ?? data?.residual_flow_value ?? data?.residualFlow ?? data?.residual_flow ?? data?.remaining_flow;
};

const formatTrafficValue = (value: unknown, unit?: unknown): string => {
  if (value === null || value === undefined || value === '') return '--';
  const raw = String(value).trim();
  if (!raw) return '--';
  if (/[a-zA-Z\u4e00-\u9fa5]+$/.test(raw)) return raw;

  const numeric = Number(value);
  const unitText = String(unit || 'GB').trim();
  if (!Number.isFinite(numeric)) return `${raw}${unitText}`;
  return `${Math.max(0, numeric).toFixed(2).replace(/\.?0+$/, '')}${unitText}`;
};

const formatTrafficField = (data: any, field: 'total' | 'used' | 'remaining'): string => {
  const text = formatTrafficValue(trafficValue(data, field), trafficUnit(data, field));
  return text === '--' ? '' : text;
};

const normalizeTrafficSummary = (data: any, previous: MonitoringSummary | null): MonitoringSummary => {
  const next: MonitoringSummary = {
    weekly_used_text: data?.weekly_used_text,
    weekly_quota_text: data?.weekly_quota_text,
    weekly_remaining_text: data?.weekly_remaining_text,
    total_flow_display: data?.total_flow_display || formatTrafficField(data, 'total'),
    used_flow_display: data?.used_flow_display || formatTrafficField(data, 'used'),
    remaining_flow_display: data?.remaining_flow_display || formatTrafficField(data, 'remaining'),
    total_flow_value: trafficValue(data, 'total') as string | number | null,
    used_flow_value: trafficValue(data, 'used') as string | number | null,
    residual_flow_value: trafficValue(data, 'remaining') as string | number | null,
    traffic_display_unit: data?.traffic_display_unit || data?.traffic?.display_unit,
    total_flow_unit: trafficUnit(data, 'total'),
    used_flow_unit: trafficUnit(data, 'used'),
    residual_flow_unit: trafficUnit(data, 'remaining'),
    remaining_flow_unit: trafficUnit(data, 'remaining'),
    traffic: data?.traffic,
    monthly_threshold_text: data?.monthly_threshold_text,
    estimated_remaining_text: data?.estimated_remaining_text,
    traffic_status: data?.traffic_status,
    last_traffic_ocr_time: data?.last_traffic_ocr_time || data?.last_update_time || data?.last_calculated_at || null,
    last_calculated_at: data?.last_calculated_at || null,
    main_status: data?.main_status,
    status_tags: Array.isArray(data?.status_tags) ? data.status_tags : [],
  };

  if (!hasRecognizedTraffic(next) && hasRecognizedTraffic(previous)) {
    return {
      ...next,
      weekly_used_text: previous?.weekly_used_text,
      weekly_remaining_text: previous?.weekly_remaining_text,
      estimated_remaining_text: previous?.estimated_remaining_text,
      total_flow_display: previous?.total_flow_display,
      used_flow_display: previous?.used_flow_display,
      remaining_flow_display: previous?.remaining_flow_display,
      total_flow_value: previous?.total_flow_value,
      used_flow_value: previous?.used_flow_value,
      residual_flow_value: previous?.residual_flow_value,
      traffic_display_unit: previous?.traffic_display_unit,
      total_flow_unit: previous?.total_flow_unit,
      used_flow_unit: previous?.used_flow_unit,
      residual_flow_unit: previous?.residual_flow_unit,
      remaining_flow_unit: previous?.remaining_flow_unit,
      traffic: previous?.traffic,
      traffic_status: previous?.traffic_status || next.traffic_status,
      last_traffic_ocr_time: previous?.last_traffic_ocr_time || next.last_traffic_ocr_time,
    };
  }

  return next;
};

const formatUpdateTime = (value?: string | null): string => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace('T', ' ').slice(0, 19);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const hasRecognizedTrafficValue = (summary?: MonitoringSummary | null): boolean => {
  const text = summary?.traffic_text || summary?.used_flow_display || summary?.weekly_used_text || '';
  return !!text && text !== '--';
};

const normalizeRecognizeTrafficSummary = (data: any, previous: MonitoringSummary | null): MonitoringSummary => {
  const trafficText =
    data?.used_flow_display ||
    formatTrafficField(data, 'used') ||
    data?.traffic_text ||
    data?.traffic_ocr_text ||
    data?.weekly_used_text ||
    (data?.used_traffic_gb === null || data?.used_traffic_gb === undefined ? '' : formatTrafficValue(data?.used_traffic_gb)) ||
    (data?.traffic_value === null || data?.traffic_value === undefined ? '' : formatTrafficValue(data?.traffic_value, data?.traffic_unit));

  return {
    ...previous,
    weekly_used_text: data?.weekly_used_text || trafficText,
    weekly_quota_text: data?.weekly_quota_text || previous?.weekly_quota_text,
    weekly_remaining_text: data?.weekly_remaining_text || previous?.weekly_remaining_text,
    total_flow_display: data?.total_flow_display || formatTrafficField(data, 'total') || previous?.total_flow_display,
    used_flow_display: data?.used_flow_display || formatTrafficField(data, 'used') || trafficText || previous?.used_flow_display,
    remaining_flow_display: data?.remaining_flow_display || formatTrafficField(data, 'remaining') || previous?.remaining_flow_display,
    total_flow_value: (trafficValue(data, 'total') as string | number | null) ?? previous?.total_flow_value,
    used_flow_value: (trafficValue(data, 'used') as string | number | null) ?? previous?.used_flow_value,
    residual_flow_value: (trafficValue(data, 'remaining') as string | number | null) ?? previous?.residual_flow_value,
    traffic_display_unit: data?.traffic_display_unit || data?.traffic?.display_unit || previous?.traffic_display_unit,
    total_flow_unit: trafficUnit(data, 'total') || previous?.total_flow_unit,
    used_flow_unit: trafficUnit(data, 'used') || data?.traffic_unit || previous?.used_flow_unit,
    residual_flow_unit: trafficUnit(data, 'remaining') || previous?.residual_flow_unit,
    remaining_flow_unit: trafficUnit(data, 'remaining') || previous?.remaining_flow_unit,
    traffic: data?.traffic || previous?.traffic,
    monthly_threshold_text: data?.monthly_threshold_text || previous?.monthly_threshold_text,
    estimated_remaining_text: data?.estimated_remaining_text || previous?.estimated_remaining_text,
    traffic_status: data?.traffic_status || previous?.traffic_status,
    traffic_text: trafficText,
    used_traffic_gb: data?.used_traffic_gb ?? previous?.used_traffic_gb ?? null,
    traffic_value: data?.traffic_value ?? previous?.traffic_value ?? null,
    last_traffic_ocr_time:
      data?.last_update_time ||
      data?.last_calculated_at ||
      data?.last_traffic_ocr_time ||
      previous?.last_traffic_ocr_time ||
      null,
    last_calculated_at: data?.last_calculated_at || data?.last_update_time || previous?.last_calculated_at || null,
    main_status: data?.main_status || previous?.main_status,
    status_tags: Array.isArray(data?.status_tags) ? data.status_tags : previous?.status_tags || [],
  };
};

const formatBackendLocalTime = (value?: string | null): string => {
  if (!value) return '--';
  const raw = String(value).trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = hasTimezone ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw.replace('T', ' ').slice(0, 19);
  return date.toLocaleString('zh-CN', { hour12: false });
};

const extractErrorMessage = (error: unknown, fallback: string): string => {
  const err = error as any;
  if (err?.message) return String(err.message);
  if (err?.detail) return String(err.detail);
  return fallback;
};

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  playType,
  accessToken,
  videoId,
  deviceStatus,
  onError,
  showTrafficPanel = true,
  trafficPanelVariant = 'full',
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const flvRef = useRef<any>(null);
  const ezRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trafficOcrFirstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trafficOcrIntervalTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveTrackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveTrackCacheRef = useRef<Record<string, { track: LivePersonTrack; lastSeen: number }>>({});
  const renderedTrackCacheRef = useRef<Record<string, { coords: number[]; lastSeen: number; stableKey: string }>>({});
  const frameDetectBusyRef = useRef(false);
  const frameDetectInflightRef = useRef(0);
  const frameDetectRequestSeqRef = useRef(0);
  const frameDetectLatestAppliedSeqRef = useRef(0);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameDetectFailCountRef = useRef(0);
  const frameDetectLogCountRef = useRef(0);
  const frameDetectLastStartedAtRef = useRef(0);
  const backendTrackLogCountRef = useRef(0);
  const aiBenchmarkLogKeyRef = useRef('');
  const playerInitLogKeyRef = useRef('');
  const backendAiStreamKeyRef = useRef('');
  const deviceRulesRef = useRef<string[]>([]);
  const playerInstanceIdRef = useRef(`vp_${++VIDEO_PLAYER_INSTANCE_SEQ}`);
  const rootVisibleRef = useRef(true);
  const lastAiSyncLogAtRef = useRef(0);
  const flvTrackHistoryRef = useRef<Array<LiveTrackPayload & { receivedAt: number; frameEpochMs: number }>>([]);
  const flvClockRef = useRef<{ liveEdgeSeconds: number; liveEdgeEpochMs: number; currentTimeSeconds: number; bufferedLagMs: number } | null>(null);
  const flvDelaySamplesRef = useRef<number[]>([]);
  const flvDelayPrimedRef = useRef(false);
  const flvBackendZeroTrackCountRef = useRef(0);
  const flvFallbackLastStartedAtRef = useRef(0);
  const syncedFrameLayerRef = useRef<HTMLImageElement | null>(null);
  const ptzRealtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncModeRef = useRef<VideoSyncMode>('tracking');
  const initRef = useRef<(() => void) | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [monitoringSummary, setMonitoringSummary] = useState<MonitoringSummary | null>(null);
  const monitoringSummaryRef = useRef<MonitoringSummary | null>(null);
  const [liveTracks, setLiveTracks] = useState<LiveTrackPayload | null>(null);
  const [syncedFlvTracks, setSyncedFlvTracks] = useState<LiveTrackPayload | null>(null);
  const [syncMode, setSyncMode] = useState<VideoSyncMode>('tracking');
  const [streamMode, setStreamMode] = useState<StreamMode>('auto');
  const [activeStream, setActiveStream] = useState<{ src: string; playType?: string; accessToken?: string; source: 'primary' | 'flv' }>(() => ({
    src,
    playType,
    accessToken,
    source: 'primary',
  }));
  const [streamSwitchStatus, setStreamSwitchStatus] = useState('');
  const [syncedAiFrame, setSyncedAiFrame] = useState<SyncedAiFrame | null>(null);
  const [overlayRect, setOverlayRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [trafficOcrStatus, setTrafficOcrStatus] = useState('等待识别');
  const [trafficRecognizing, setTrafficRecognizing] = useState(false);
  const trafficRecognizingRef = useRef(false);

  const clearRetryTimer = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const resetAiOverlay = useCallback(() => {
    liveTrackCacheRef.current = {};
    renderedTrackCacheRef.current = {};
    flvTrackHistoryRef.current = [];
    setLiveTracks(null);
    setSyncedFlvTracks(null);
    setSyncedAiFrame(null);
  }, []);

  const logPlayerInitSuccess = useCallback((stream: { src: string; playType?: string }, eventName = 'playing') => {
    const key = `${videoId || ''}:${stream.playType || ''}:${stream.src}`;
    if (playerInitLogKeyRef.current === key) return;
    playerInitLogKeyRef.current = key;
    console.info('[VideoPlayer] player init success', {
      videoId,
      src: stream.src,
      playType: stream.playType,
      eventName,
    });
  }, [videoId]);

  const getFrontendFrameAlgoType = useCallback(() => {
    const rules = Array.isArray(deviceRulesRef.current) ? deviceRulesRef.current : [];
    return Array.from(new Set(['person', ...rules.map((rule) => String(rule || '').trim()).filter(Boolean)])).join(',');
  }, []);

  const clearTrafficOcrTimers = useCallback(() => {
    if (trafficOcrFirstTimer.current) {
      clearTimeout(trafficOcrFirstTimer.current);
      trafficOcrFirstTimer.current = null;
    }
    if (trafficOcrIntervalTimer.current) {
      clearInterval(trafficOcrIntervalTimer.current);
      trafficOcrIntervalTimer.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    deviceRulesRef.current = [];
    if (!videoId) return;
    getDeviceRules(Number(videoId))
      .then((rules) => {
        if (cancelled) return;
        deviceRulesRef.current = Array.isArray(rules) ? rules.map((rule) => String(rule || '').trim()).filter(Boolean) : [];
      })
      .catch((error) => {
        if (!cancelled) {
          deviceRulesRef.current = [];
          console.warn('[VideoPlayer] failed to preload device AI rules', { videoId, error });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const restoreCachedTrackPayload = useCallback(() => {
    if (!videoId) return false;
    const cached = lastTrackPayloadByVideo.get(String(videoId));
    const cachedAt = Number(cached?.cached_at_ms || 0);
    if (!cached || !cachedAt || Date.now() - cachedAt > TRACK_PAYLOAD_CACHE_MAX_AGE_MS) {
      return false;
    }
    const payload = stripCachedBehaviorLabels({
      ...cached,
      stale: true,
      age_ms: Number(cached.age_ms || 0) + (Date.now() - cachedAt),
    });
    setLiveTracks(payload);
    if (isHttpFlvStream(activeStream)) {
      setSyncedFlvTracks(payload);
    }
    return true;
  }, [activeStream, videoId]);

  const applyLiveTrackPayload = useCallback((data: LiveTrackPayload & { stale?: boolean }) => {
    const timestamp = data?.timestamp ? new Date(data.timestamp).getTime() : 0;
    const now = Date.now();
    if (videoId && Array.isArray(data?.tracks) && data.tracks.length > 0) {
      lastTrackPayloadByVideo.set(String(videoId), { ...data, cached_at_ms: now });
    }
    const trackRect = (track: LivePersonTrack) => {
      const coords = normalizeTrackCoords(track, data) || [];
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = coords;
      return { x1, y1, x2, y2, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
    };
    const trackIou = (a: LivePersonTrack, b: LivePersonTrack) => {
      const ar = trackRect(a);
      const br = trackRect(b);
      const ix1 = Math.max(ar.x1, br.x1);
      const iy1 = Math.max(ar.y1, br.y1);
      const ix2 = Math.min(ar.x2, br.x2);
      const iy2 = Math.min(ar.y2, br.y2);
      const intersection = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
      const union = ar.w * ar.h + br.w * br.h - intersection;
      return union > 0 ? intersection / union : 0;
    };
    const centerDistance = (a: LivePersonTrack, b: LivePersonTrack) => {
      const ar = trackRect(a);
      const br = trackRect(b);
      const acx = (ar.x1 + ar.x2) / 2;
      const acy = (ar.y1 + ar.y2) / 2;
      const bcx = (br.x1 + br.x2) / 2;
      const bcy = (br.y1 + br.y2) / 2;
      return Math.hypot(acx - bcx, acy - bcy);
    };
    const selectRenderableTracks = (tracks: LivePersonTrack[]) => {
      const candidates = tracks
        .filter((track) => Number(track.misses || 0) === 0)
        .map((track, index) => {
          const coords = normalizeTrackCoords(track, data);
          if (!coords) return null;
          const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = coords;
          const area = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
          return { track: { ...track, coords_norm: coords }, index, area, score: Number(track.score || 0) };
        })
        .filter((candidate): candidate is { track: LivePersonTrack; index: number; area: number; score: number } => Boolean(candidate));
      if (!candidates.length) return [];
      candidates.sort((a, b) => b.score - a.score || b.area - a.area || a.index - b.index);
      const kept: LivePersonTrack[] = [];
      candidates.forEach((candidate) => {
        const duplicate = kept.some((existing) => (
          trackIou(candidate.track, existing) >= SAME_PERSON_IOU_THRESHOLD ||
          centerDistance(candidate.track, existing) <= SAME_PERSON_CENTER_DISTANCE_THRESHOLD
        ));
        if (!duplicate) kept.push(candidate.track);
      });
      return kept.slice(0, MAX_RENDERED_PERSON_TRACKS);
    };
    const smoothRenderableTracks = (tracks: LivePersonTrack[]) => {
      const nowMs = Date.now();
      const nextCache: Record<string, { coords: number[]; lastSeen: number; stableKey: string }> = {};
      const usedPreviousKeys = new Set<string>();
      const coordsCenterDistance = (a: number[], b: number[]) => {
        if (a.length < 4 || b.length < 4) return Number.POSITIVE_INFINITY;
        const acx = (a[0] + a[2]) / 2;
        const acy = (a[1] + a[3]) / 2;
        const bcx = (b[0] + b[2]) / 2;
        const bcy = (b[1] + b[3]) / 2;
        return Math.hypot(acx - bcx, acy - bcy);
      };
      const smoothed = tracks.map((track, index) => {
        const coords = normalizeTrackCoords(track, data);
        if (!coords) return track;

        const rawKey = String(track.track_id || track.personnel_id || `person_${index + 1}`);
        let key = rawKey;
        let previous = renderedTrackCacheRef.current[key];
        if (!previous || nowMs - previous.lastSeen > AI_BOX_SMOOTH_MAX_AGE_MS || previous.coords.length < 4) {
          const relink = Object.entries(renderedTrackCacheRef.current)
            .filter(([previousKey, value]) => (
              !usedPreviousKeys.has(previousKey) &&
              nowMs - value.lastSeen <= AI_BOX_RELINK_MAX_AGE_MS &&
              value.coords.length >= 4
            ))
            .map(([previousKey, value]) => ({
              previousKey,
              value,
              distance: coordsCenterDistance(coords, value.coords),
            }))
            .sort((a, b) => a.distance - b.distance)[0];
          if (relink && relink.distance <= AI_BOX_RELINK_CENTER_DISTANCE) {
            key = relink.previousKey;
            previous = relink.value;
          }
        }
        if (!previous || nowMs - previous.lastSeen > AI_BOX_SMOOTH_MAX_AGE_MS || previous.coords.length < 4) {
          nextCache[key] = { coords, lastSeen: nowMs, stableKey: key };
          usedPreviousKeys.add(key);
          return { ...track, track_id: key, coords_norm: coords };
        }

        const pcx = (previous.coords[0] + previous.coords[2]) / 2;
        const pcy = (previous.coords[1] + previous.coords[3]) / 2;
        const pw = Math.max(0.001, previous.coords[2] - previous.coords[0]);
        const ph = Math.max(0.001, previous.coords[3] - previous.coords[1]);
        const dcx = (coords[0] + coords[2]) / 2;
        const dcy = (coords[1] + coords[3]) / 2;
        const dw = Math.max(0.001, coords[2] - coords[0]);
        const dh = Math.max(0.001, coords[3] - coords[1]);
        const movement = Math.max(
          Math.abs(dcx - pcx),
          Math.abs(dcy - pcy),
          Math.abs(dw - pw),
          Math.abs(dh - ph),
        );
        if (movement < AI_BOX_SMOOTH_DEADBAND) {
          nextCache[key] = { coords: previous.coords, lastSeen: nowMs, stableKey: key };
          usedPreviousKeys.add(key);
          return { ...track, track_id: key, coords_norm: previous.coords };
        }

        const nextCx = pcx + (dcx - pcx) * AI_BOX_SMOOTH_CENTER_ALPHA;
        const nextCy = pcy + (dcy - pcy) * AI_BOX_SMOOTH_CENTER_ALPHA;
        const nextW = pw + (dw - pw) * AI_BOX_SMOOTH_SIZE_ALPHA;
        const nextH = ph + (dh - ph) * AI_BOX_SMOOTH_SIZE_ALPHA;
        const nextCoords = [
          Math.max(0, Math.min(1, nextCx - nextW / 2)),
          Math.max(0, Math.min(1, nextCy - nextH / 2)),
          Math.max(0, Math.min(1, nextCx + nextW / 2)),
          Math.max(0, Math.min(1, nextCy + nextH / 2)),
        ];
        nextCache[key] = { coords: nextCoords, lastSeen: nowMs, stableKey: key };
        usedPreviousKeys.add(key);
        return { ...track, track_id: key, coords_norm: nextCoords };
      });

      Object.entries(renderedTrackCacheRef.current).forEach(([key, value]) => {
        if (!nextCache[key] && nowMs - value.lastSeen <= AI_BOX_SMOOTH_MAX_AGE_MS) {
          nextCache[key] = value;
        }
      });
      renderedTrackCacheRef.current = nextCache;
      return smoothed;
    };
    const incomingTracks = Array.isArray(data?.tracks) ? data.tracks : [];
    if (data?.source === 'frontend_frame') {
      const renderableTracks = smoothRenderableTracks(selectRenderableTracks(incomingTracks));
      if (renderableTracks.length <= 0 && videoId) {
        const cached = lastTrackPayloadByVideo.get(String(videoId));
        const cachedAt = Number(cached?.cached_at_ms || 0);
        const cachedTracks = Array.isArray(cached?.tracks) ? cached.tracks : [];
        if (cached && cachedAt && cachedTracks.length > 0 && now - cachedAt <= TRACK_PAYLOAD_CACHE_MAX_AGE_MS) {
          setLiveTracks(stripCachedBehaviorLabels({
            ...cached,
            timestamp: data?.timestamp || cached.timestamp || new Date(now).toISOString(),
            source: 'frontend_frame',
            stale: false,
            age_ms: now - cachedAt,
          }));
          return;
        }
      }
      liveTrackCacheRef.current = {};
      setLiveTracks({
        ...data,
        timestamp: new Date(now).toISOString(),
        stale: false,
        tracks: renderableTracks,
      });
      return;
    }
    const payloadAgeMs = Number(data?.age_ms ?? (timestamp ? now - timestamp : 0));
    if (data?.stale || payloadAgeMs > TRACK_BOX_STALE_LIMIT_MS) {
      liveTrackCacheRef.current = {};
      renderedTrackCacheRef.current = {};
      setLiveTracks({ ...data, tracks: [] });
      return;
    }
    const renderableTracks = smoothRenderableTracks(selectRenderableTracks(incomingTracks));
    const cache: Record<string, { track: LivePersonTrack; lastSeen: number }> = {};
    if (renderableTracks.length > 0) {
      renderableTracks.forEach((track, index) => {
        const key = String(track.track_id || track.personnel_id || `person_${index + 1}`);
        cache[key] = { track: { ...track, track_id: key }, lastSeen: now };
      });
    } else {
      Object.entries(liveTrackCacheRef.current).forEach(([key, item]) => {
        if (now - item.lastSeen <= 1000) {
          cache[key] = item;
        }
      });
    }

    const keepAliveMs = 1000;
    const aliveEntries = Object.entries(cache).filter(([, item]) => now - item.lastSeen <= keepAliveMs);
    liveTrackCacheRef.current = Object.fromEntries(aliveEntries);
    setLiveTracks({
      ...data,
      timestamp: data?.timestamp || new Date(now).toISOString(),
      tracks: aliveEntries.map(([, item]) => item.track),
    });
  }, []);

  const switchToRealtimeControl = useCallback((action?: string) => {
    syncModeRef.current = 'realtime';
    setSyncMode('realtime');
    liveTrackCacheRef.current = {};
    renderedTrackCacheRef.current = {};
    setLiveTracks(null);
    setSyncedAiFrame(null);
    if (ptzRealtimeTimerRef.current) {
      clearTimeout(ptzRealtimeTimerRef.current);
    }
    ptzRealtimeTimerRef.current = setTimeout(() => {
      syncModeRef.current = 'tracking';
      setSyncMode('tracking');
    }, 10000);
    console.info('[VideoPlayer] realtime PTZ mode active', { videoId, action });
  }, [videoId]);

  useEffect(() => {
    syncModeRef.current = syncMode;
  }, [syncMode]);

  useEffect(() => {
    const handlePtzActivity = (event: Event) => {
      const detail = (event as CustomEvent<{ videoId?: number; action?: string }>).detail || {};
      if (videoId && detail.videoId && Number(detail.videoId) !== Number(videoId)) return;
      switchToRealtimeControl(detail.action);
    };

    window.addEventListener(PTZ_ACTIVITY_EVENT, handlePtzActivity as EventListener);
    return () => {
      window.removeEventListener(PTZ_ACTIVITY_EVENT, handlePtzActivity as EventListener);
      if (ptzRealtimeTimerRef.current) {
        clearTimeout(ptzRealtimeTimerRef.current);
        ptzRealtimeTimerRef.current = null;
      }
    };
  }, [switchToRealtimeControl, videoId]);

  const scoreCanvasContent = useCallback((canvas: HTMLCanvasElement): number => {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || !canvas.width || !canvas.height) return 0;
      const sampleW = Math.min(80, canvas.width);
      const sampleH = Math.min(45, canvas.height);
      const sample = document.createElement('canvas');
      sample.width = sampleW;
      sample.height = sampleH;
      const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
      if (!sampleCtx) return 0;
      sampleCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
      const data = sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
      let score = 0;
      for (let i = 0; i < data.length; i += 4) {
        const brightness = data[i] + data[i + 1] + data[i + 2];
        if (brightness > 24) score += 1;
      }
      return score / Math.max(1, data.length / 4);
    } catch {
      return 0;
    }
  }, []);

  const waitForNextPaint = useCallback(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }), []);

  const captureCurrentVideoFrame = useCallback(async (): Promise<string | null> => {
    const candidates: Array<{ type: 'video' | 'canvas'; width: number; height: number; dataUrl: string; score: number }> = [];
    const maxWidth = 640;
    const canvas = frameCanvasRef.current || document.createElement('canvas');
    frameCanvasRef.current = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return null;
    }

    try {
      const root = rootRef.current;
      const rootRect = root?.getBoundingClientRect();
      const intersectsRoot = (el: Element) => {
        if (!rootRect || !rootRect.width || !rootRect.height) return true;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
          rect.right >= rootRect.left &&
          rect.left <= rootRect.right &&
          rect.bottom >= rootRect.top &&
          rect.top <= rootRect.bottom;
      };

      const scopedVideos = Array.from(root?.querySelectorAll('video') || []) as HTMLVideoElement[];
      const pageVideos = Array.from(document.querySelectorAll('video')).filter(intersectsRoot) as HTMLVideoElement[];
      const videos = Array.from(new Set([videoRef.current, ...scopedVideos, ...pageVideos].filter(Boolean))) as HTMLVideoElement[];
      videos.forEach((videoEl) => {
        if (!videoEl.videoWidth || !videoEl.videoHeight || videoEl.readyState < 2) return;
        const ratio = Math.min(1, maxWidth / videoEl.videoWidth);
        const width = Math.max(1, Math.round(videoEl.videoWidth * ratio));
        const height = Math.max(1, Math.round(videoEl.videoHeight * ratio));
        try {
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(videoEl, 0, 0, width, height);
          candidates.push({ type: 'video', width, height, dataUrl: canvas.toDataURL('image/jpeg', 0.72), score: scoreCanvasContent(canvas) });
        } catch {
          // Cross-origin or protected media can fail canvas extraction.
        }
      });

      const scopedCanvases = Array.from(root?.querySelectorAll('canvas') || []) as HTMLCanvasElement[];
      const pageCanvases = Array.from(document.querySelectorAll('canvas')).filter(intersectsRoot) as HTMLCanvasElement[];
      const canvases = Array.from(new Set([...scopedCanvases, ...pageCanvases]));
      canvases.forEach((sourceCanvas) => {
        if (!sourceCanvas.width || !sourceCanvas.height) return;
        const ratio = Math.min(1, maxWidth / sourceCanvas.width);
        const width = Math.max(1, Math.round(sourceCanvas.width * ratio));
        const height = Math.max(1, Math.round(sourceCanvas.height * ratio));
        try {
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(sourceCanvas, 0, 0, width, height);
          candidates.push({ type: 'canvas', width, height, dataUrl: canvas.toDataURL('image/jpeg', 0.72), score: scoreCanvasContent(canvas) });
        } catch {
          // Ignore unreadable canvases.
        }
      });
    } finally {
      // Capture reads directly from video/canvas elements; keep the synced image visible to avoid flicker.
    }

    const best = candidates.sort((a, b) => b.score - a.score)[0];
    if (!best || best.score < 0.02) {
      frameDetectFailCountRef.current += 1;
      if (frameDetectFailCountRef.current === 1 || frameDetectFailCountRef.current % 10 === 0) {
        console.warn('[AIFrame] no usable current-frame candidate', {
          videoId,
          candidateCount: candidates.length,
          bestScore: best?.score,
          rootCanvases: rootRef.current?.querySelectorAll('canvas').length || 0,
          pageCanvases: document.querySelectorAll('canvas').length,
          rootVideos: rootRef.current?.querySelectorAll('video').length || 0,
          pageVideos: document.querySelectorAll('video').length,
          candidates: candidates.map((item) => ({ type: item.type, width: item.width, height: item.height, score: item.score })).slice(0, 8),
        });
      }
      return null;
    }
    frameDetectLogCountRef.current += 1;
    if (frameDetectLogCountRef.current === 1 || frameDetectLogCountRef.current % 20 === 0) {
      console.info('[AIFrame] captured current frame', {
        videoId,
        type: best.type,
        width: best.width,
        height: best.height,
        score: best.score,
        candidates: candidates.map((item) => ({ type: item.type, width: item.width, height: item.height, score: item.score })),
      });
    }
    return best.dataUrl;
  }, [scoreCanvasContent, videoId]);

  const fetchBackendTracks = useCallback(async () => {
    if (!videoId) {
      liveTrackCacheRef.current = {};
      setLiveTracks(null);
      return;
    }
    if (document.visibilityState === 'hidden') return;
    try {
      const requestStartedAt = Date.now();
      const res = await fetch(`${API_BASE_URL}/video/ai/tracks/${videoId}`, {
        cache: 'no-store',
        headers: getAuthHeaders(),
      });
      const responseAt = Date.now();
      if (!res.ok) return;
      const data = await res.json();
      backendTrackLogCountRef.current += 1;
      const trackCount = Array.isArray(data?.tracks) ? data.tracks.length : 0;
      const shouldLogBackendTracks =
        backendTrackLogCountRef.current === 1 ||
        backendTrackLogCountRef.current % AI_BACKEND_TRACK_LOG_EVERY === 0 ||
        trackCount > 0;
      const frameEpochMsForLog = Number(data?.frame_epoch_ms || (data?.frame_epoch ? Number(data.frame_epoch) * 1000 : 0));
      const playbackEpochMsForLog = Date.now() - FLV_SYNC_DELAY_MS;
      const videoToBoxDeltaMsForLog = Number.isFinite(frameEpochMsForLog) && frameEpochMsForLog > 0 && Number.isFinite(playbackEpochMsForLog || 0)
        ? Math.round((playbackEpochMsForLog || 0) - frameEpochMsForLog)
        : undefined;
      if (data?.timing) {
        const detectorTiming = data.timing?.person_debug?.detector_timing || {};
        console.info('[AI_TIMING]', {
          videoId,
          tracks: trackCount,
          backendAgeMs: data?.age_ms,
          frameAgeMs: Number.isFinite(frameEpochMsForLog) && frameEpochMsForLog > 0 ? Math.max(0, Math.round(responseAt - frameEpochMsForLog)) : undefined,
          videoToBoxDeltaMs: videoToBoxDeltaMsForLog,
          flvBufferedLagMs: flvClockRef.current?.bufferedLagMs,
          flvTargetDelayMs: FLV_SYNC_DELAY_MS,
          targetPlaybackEpochMs: playbackEpochMsForLog ? Math.round(playbackEpochMsForLog) : undefined,
          detectElapsedMs: data?.detect_elapsed_ms,
          timingFrameAgeMs: data.timing?.frame_age_ms,
          personMs: data.timing?.person_ms,
          trackUpdateMs: data.timing?.track_update_ms,
          faceMs: data.timing?.face_ms,
          activeRules: data?.active_rules,
          actualActiveAlgos: data.timing?.active_algos,
          monitorMode: data?.monitor_mode,
          personScopedMs: data.timing?.person_scoped_ms,
          personScopedAlgos: data.timing?.person_scoped_algos,
          personScopedExpected: data.timing?.person_scoped_expected,
          personScopedRoiCount: data.timing?.person_scoped_roi_count,
          personScopedPending: data.timing?.person_scoped_pending,
          detectionResults: data.timing?.detection_results,
          yoloTotalMs: detectorTiming?.total_ms,
          yoloLockWaitMs: detectorTiming?.lock_wait_ms,
          yoloBenchmarkOverheadMs: detectorTiming?.benchmark_overhead_ms,
          yoloModelCallMs: detectorTiming?.model_call_ms,
          yoloCudaSyncMs: detectorTiming?.cuda_sync_ms,
          yoloInferMs: detectorTiming?.infer_ms,
          speedPreprocessMs: detectorTiming?.speed_preprocess_ms,
          speedInferenceMs: detectorTiming?.speed_inference_ms,
          speedPostprocessMs: detectorTiming?.speed_postprocess_ms,
          device: detectorTiming?.device,
          half: detectorTiming?.half,
          process: detectorTiming?.process,
          workerPid: detectorTiming?.worker_pid,
          parentRoundTripMs: detectorTiming?.parent_round_trip_ms,
          thread: detectorTiming?.thread,
          track: detectorTiming?.track,
          tracker: detectorTiming?.tracker,
          imgsz: detectorTiming?.imgsz,
          frameShape: detectorTiming?.frame_shape,
          frameDtype: detectorTiming?.frame_dtype,
          frameContiguous: detectorTiming?.frame_contiguous,
          raw: data.timing?.person_debug?.raw,
          kept: data.timing?.person_debug?.kept,
          roundTripMs: responseAt - requestStartedAt,
        });
        if (detectorTiming?.benchmark) {
          const benchmarkLogKey = JSON.stringify(detectorTiming.benchmark);
          if (aiBenchmarkLogKeyRef.current !== benchmarkLogKey) {
            aiBenchmarkLogKeyRef.current = benchmarkLogKey;
            console.info('[AI_YOLO_BENCHMARK]', detectorTiming.benchmark);
          }
        }
      }
      if (shouldLogBackendTracks) {
        console.info('[AIFrame] backend tracks response', {
          videoId,
          tracks: trackCount,
          source: data?.source || 'backend_stream',
          backendAgeMs: data?.age_ms,
          stale: data?.stale,
          requestStartedAt: new Date(requestStartedAt).toLocaleTimeString(),
          responseAt: new Date(responseAt).toLocaleTimeString(),
          roundTripMs: responseAt - requestStartedAt,
          frameEpochMs: Number.isFinite(frameEpochMsForLog) && frameEpochMsForLog > 0 ? Math.round(frameEpochMsForLog) : undefined,
          frameAgeMs: Number.isFinite(frameEpochMsForLog) && frameEpochMsForLog > 0 ? Math.max(0, Math.round(responseAt - frameEpochMsForLog)) : undefined,
          videoToBoxDeltaMs: videoToBoxDeltaMsForLog,
          flvBufferedLagMs: flvClockRef.current?.bufferedLagMs,
          flvTargetDelayMs: FLV_SYNC_DELAY_MS,
          detectStartedAt: data?.detect_started_epoch ? new Date(Number(data.detect_started_epoch) * 1000).toLocaleTimeString() : undefined,
          detectFinishedAt: data?.detect_finished_epoch ? new Date(Number(data.detect_finished_epoch) * 1000).toLocaleTimeString() : undefined,
          detectElapsedMs: data?.detect_elapsed_ms,
          activeRules: data?.active_rules,
          actualActiveAlgos: data?.timing?.active_algos,
          monitorMode: data?.monitor_mode,
          personScopedAlgos: data?.timing?.person_scoped_algos,
          personScopedExpected: data?.timing?.person_scoped_expected,
          personScopedRoiCount: data?.timing?.person_scoped_roi_count,
          personScopedPending: data?.timing?.person_scoped_pending,
          detectionResults: data?.timing?.detection_results,
          frameWidth: data?.frame_width,
          frameHeight: data?.frame_height,
          timestamp: data?.timestamp,
        });
      }
      if (Number(data?.age_ms || 0) > TRACK_ALARM_LABEL_STALE_LIMIT_MS && shouldLogBackendTracks) {
        console.warn('[AIFrame] backend tracks stale; dropped', {
          videoId,
          backendAgeMs: data?.age_ms,
          tracks: trackCount,
        });
      }
      if (isHttpFlvStream(activeStream)) {
        let payloadForRender = data;
        let payloadTrackCount = trackCount;
        let usingCachedTrackPayload = false;
        if (trackCount <= 0) {
          flvBackendZeroTrackCountRef.current += 1;
        } else {
          flvBackendZeroTrackCountRef.current = 0;
        }
        const shouldFallbackToDisplayedFrame =
          trackCount <= 0 &&
          flvBackendZeroTrackCountRef.current >= 2 &&
          frameDetectInflightRef.current <= 0 &&
          Date.now() - flvFallbackLastStartedAtRef.current >= 900;
        if (shouldFallbackToDisplayedFrame) {
          flvFallbackLastStartedAtRef.current = Date.now();
          frameDetectInflightRef.current += 1;
          try {
            const image = await captureCurrentVideoFrame();
            if (image) {
              const captureTime = Date.now();
              const fallbackStartedAt = Date.now();
              const fallbackRes = await fetch(`${API_BASE_URL}/video/ai/frame/${videoId}`, {
                method: 'POST',
                cache: 'no-store',
                headers: {
                  ...getAuthHeaders(),
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  image,
                  algo_type: getFrontendFrameAlgoType(),
                  capture_time: captureTime,
                }),
              });
              if (fallbackRes.ok) {
                const fallbackData = await fallbackRes.json();
                const fallbackTrackCount = Array.isArray(fallbackData?.tracks) ? fallbackData.tracks.length : 0;
                console.info('[AIFrame] FLV displayed-frame fallback', {
                  videoId,
                  backendTracks: trackCount,
                  fallbackTracks: fallbackTrackCount,
                  roundTripMs: Date.now() - fallbackStartedAt,
                });
                if (fallbackTrackCount > 0) {
                  payloadForRender = {
                    ...fallbackData,
                    source: 'frontend_frame',
                    frame_epoch_ms: Date.now(),
                    age_ms: 0,
                  };
                  payloadTrackCount = fallbackTrackCount;
                  flvBackendZeroTrackCountRef.current = 0;
                }
              }
            }
          } catch (fallbackError) {
            console.warn('[AIFrame] FLV displayed-frame fallback failed', { videoId, fallbackError });
          } finally {
            frameDetectInflightRef.current = Math.max(0, frameDetectInflightRef.current - 1);
          }
        }
        if (payloadTrackCount <= 0) {
          const cached = videoId ? lastTrackPayloadByVideo.get(String(videoId)) : null;
          const cachedAt = Number(cached?.cached_at_ms || 0);
          const cachedTracks = Array.isArray(cached?.tracks) ? cached.tracks : [];
          if (cached && cachedAt && cachedTracks.length > 0 && Date.now() - cachedAt <= TRACK_PAYLOAD_CACHE_MAX_AGE_MS) {
            payloadForRender = stripCachedBehaviorLabels({
              ...cached,
              age_ms: Date.now() - cachedAt,
            });
            payloadTrackCount = cachedTracks.length;
            usingCachedTrackPayload = true;
          }
        }
        const frameEpochMs = Number(data?.frame_epoch_ms || (data?.frame_epoch ? Number(data.frame_epoch) * 1000 : 0));
        const receivedAt = Date.now();
        if (payloadTrackCount > 0 && !usingCachedTrackPayload) {
          lastTrackPayloadByVideo.set(String(videoId), { ...payloadForRender, cached_at_ms: receivedAt });
        }
        const latestFlvPayload = {
          ...payloadForRender,
          frame_epoch_ms: Number.isFinite(frameEpochMs) && frameEpochMs > 0 ? frameEpochMs : receivedAt,
          age_ms: 0,
        };
        setLiveTracks(latestFlvPayload);
        if (Number.isFinite(frameEpochMs) && frameEpochMs > 0) {
          flvTrackHistoryRef.current = [
            ...flvTrackHistoryRef.current.filter((item) => receivedAt - item.frameEpochMs <= FLV_SYNC_HISTORY_MS),
            { ...data, receivedAt, frameEpochMs },
          ].slice(-80);
          const detectElapsed = Number(data?.detect_elapsed_ms || 0);
          if (detectElapsed > 0 && Number.isFinite(detectElapsed)) {
            flvDelaySamplesRef.current = [...flvDelaySamplesRef.current, detectElapsed].slice(-30);
          }
        }
        setSyncedFlvTracks(latestFlvPayload);
        return;
      }
      applyLiveTrackPayload(data);
    } catch {
      // Keep the current frame briefly; the stale timestamp check will clear it.
    }
  }, [activeStream, applyLiveTrackPayload, captureCurrentVideoFrame, getFrontendFrameAlgoType, videoId]);

  const fetchLiveTracks = useCallback(async () => {
    if (!videoId) return;
    if (document.visibilityState === 'hidden') return;
    if (syncModeRef.current === 'realtime') return;
    const maxInflight = 1;
    if (frameDetectInflightRef.current >= maxInflight) return;
    const now = Date.now();
    if (now - frameDetectLastStartedAtRef.current < AI_FRAME_DETECT_MIN_INTERVAL_MS) return;
    frameDetectLastStartedAtRef.current = now;
    frameDetectBusyRef.current = true;
    frameDetectInflightRef.current += 1;
    const requestSeq = frameDetectRequestSeqRef.current + 1;
    frameDetectRequestSeqRef.current = requestSeq;
    try {
      const image = await captureCurrentVideoFrame();
      if (!image) {
        frameDetectFailCountRef.current += 1;
        if (frameDetectFailCountRef.current === 1 || frameDetectFailCountRef.current % 20 === 0) {
          console.warn('[VideoPlayer] current-frame capture unavailable; keep last synced AI frame', { videoId });
        }
        await fetchBackendTracks();
        return;
      }
      const captureTime = Date.now();
      const requestStartedAt = Date.now();
      const res = await fetch(`${API_BASE_URL}/video/ai/frame/${videoId}`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image,
          algo_type: getFrontendFrameAlgoType(),
          capture_time: captureTime,
        }),
      });
      const responseAt = Date.now();
      if (!res.ok) {
        console.warn('[AIFrame] detect request failed; keep last synced AI frame', { videoId, status: res.status });
        return;
      }
      frameDetectFailCountRef.current = 0;
      const data = await res.json();
      if (requestSeq < frameDetectLatestAppliedSeqRef.current || syncModeRef.current === 'realtime') {
        console.warn('[AIFrame] stale detect response dropped', {
          videoId,
          requestSeq,
          latestAppliedSeq: frameDetectLatestAppliedSeqRef.current,
          responseAgeMs: Date.now() - captureTime,
          roundTripMs: responseAt - requestStartedAt,
        });
        return;
      }
      const trackCount = Array.isArray(data?.tracks) ? data.tracks.length : 0;
      const detectorTiming = data?.timing?.person_debug?.detector_timing || data?.person_debug?.detector_timing || {};
      if (detectorTiming?.benchmark) {
        const benchmarkLogKey = JSON.stringify(detectorTiming.benchmark);
        if (aiBenchmarkLogKeyRef.current !== benchmarkLogKey) {
          aiBenchmarkLogKeyRef.current = benchmarkLogKey;
          console.info('[AI_YOLO_BENCHMARK]', detectorTiming.benchmark);
        }
      }
      if (detectorTiming && Object.keys(detectorTiming).length > 0) {
        console.info('[AI_TIMING]', {
          videoId,
          tracks: trackCount,
          backendAgeMs: data?.age_ms,
          detectElapsedMs: data?.detect_elapsed_ms,
          serverElapsedMs: data?.server_elapsed_ms,
          yoloTotalMs: detectorTiming?.total_ms,
          yoloLockWaitMs: detectorTiming?.lock_wait_ms,
          yoloBenchmarkOverheadMs: detectorTiming?.benchmark_overhead_ms,
          yoloModelCallMs: detectorTiming?.model_call_ms,
          yoloCudaSyncMs: detectorTiming?.cuda_sync_ms,
          yoloInferMs: detectorTiming?.infer_ms,
          speedPreprocessMs: detectorTiming?.speed_preprocess_ms,
          speedInferenceMs: detectorTiming?.speed_inference_ms,
          speedPostprocessMs: detectorTiming?.speed_postprocess_ms,
          device: detectorTiming?.device,
          half: detectorTiming?.half,
          process: detectorTiming?.process,
          workerPid: detectorTiming?.worker_pid,
          parentRoundTripMs: detectorTiming?.parent_round_trip_ms,
          track: detectorTiming?.track,
          imgsz: detectorTiming?.imgsz,
          frameShape: detectorTiming?.frame_shape,
          frameDtype: detectorTiming?.frame_dtype,
          frameContiguous: detectorTiming?.frame_contiguous,
          raw: data?.person_debug?.raw || data?.timing?.person_debug?.raw,
          kept: data?.person_debug?.kept || data?.timing?.person_debug?.kept,
          roundTripMs: responseAt - requestStartedAt,
        });
      }
      console.info('[AIFrame] detect response', {
        videoId,
        tracks: trackCount,
        source: data?.source,
        backendAgeMs: data?.age_ms,
        captureTime: new Date(captureTime).toLocaleTimeString(),
        requestStartedAt: new Date(requestStartedAt).toLocaleTimeString(),
        responseAt: new Date(responseAt).toLocaleTimeString(),
        roundTripMs: responseAt - requestStartedAt,
        serverReceivedAt: data?.server_received_at,
        serverFinishedAt: data?.server_finished_at,
        decodeElapsedMs: data?.decode_elapsed_ms,
        detectElapsedMs: data?.detect_elapsed_ms,
        serverElapsedMs: data?.server_elapsed_ms,
        debugFrameUrl: data?.debug_frame_url,
        cacheHit: data?.cache_hit,
        cacheReason: data?.cache_reason,
        personDebug: data?.person_debug,
      });
      if (data?.cache_hit && trackCount <= 0) {
        return;
      }
      if (trackCount <= 0) {
        console.warn('[AIFrame] no frontend-frame tracks; apply synced frame without boxes', {
          videoId,
          debugFrameUrl: data?.debug_frame_url,
        });
      }
      frameDetectLatestAppliedSeqRef.current = requestSeq;
      applyLiveTrackPayload(data);
      if (isHttpFlvStream(activeStream)) {
        flvTrackHistoryRef.current = [];
        setSyncedFlvTracks({
          ...data,
          frame_epoch_ms: responseAt,
          age_ms: 0,
        });
      }
      setSyncedAiFrame({ image, captureTime, responseAt });
    } catch (error) {
      frameDetectFailCountRef.current += 1;
      console.warn('[VideoPlayer] current-frame detection failed; keep last synced AI frame', { videoId, error });
    } finally {
      frameDetectInflightRef.current = Math.max(0, frameDetectInflightRef.current - 1);
      frameDetectBusyRef.current = frameDetectInflightRef.current > 0;
    }
  }, [activeStream, applyLiveTrackPayload, captureCurrentVideoFrame, fetchBackendTracks, getFrontendFrameAlgoType, videoId]);

  const fetchTrafficStatus = useCallback(async () => {
    if (!videoId) {
      console.info('[Traffic] skip GET status: empty videoId');
      monitoringSummaryRef.current = null;
      setMonitoringSummary(null);
      return null;
    }

    const url = `${API_BASE_URL}/video/${videoId}/traffic/status`;
    console.info('[Traffic] GET status start', { videoId, url });
    try {
      const res = await fetch(url, { cache: 'no-store' });
      console.info('[Traffic] GET status response', { videoId, ok: res.ok, status: res.status });
      if (!res.ok) {
        setTrafficOcrStatus((current) => (hasRecognizedTraffic(monitoringSummaryRef.current) ? current : '状态获取失败'));
        return null;
      }

      const data = await res.json();
      let normalized: MonitoringSummary | null = null;
      setMonitoringSummary((previous) => {
        normalized = normalizeTrafficSummary(data, previous);
        monitoringSummaryRef.current = normalized;
        return normalized;
      });
      if (hasRecognizedTraffic(normalized)) {
        setTrafficOcrStatus('已缓存');
      }
      return normalized;
    } catch (error) {
      console.error('[Traffic] GET status failed', error);
      setTrafficOcrStatus((current) => (hasRecognizedTraffic(monitoringSummaryRef.current) ? current : '状态获取失败'));
      return null;
    }
  }, [videoId]);

  const handleRecognizeTraffic = useCallback(async () => {
    if (!videoId || trafficRecognizing || trafficRecognizingRef.current) return;

    trafficRecognizingRef.current = true;
    setTrafficRecognizing(true);
    setTrafficOcrStatus('后端识别中');
    console.info('[Traffic] recognize start', { videoId });

    try {
      setTrafficOcrStatus('正在刷新流量状态');
      const statusSummary = await fetchTrafficStatus();
      if (hasRecognizedTrafficValue(statusSummary)) {
        setTrafficOcrStatus('已通过接口获取');
        return;
      }
      setTrafficOcrStatus('后端识别中');
      const result: any = await recognizeVideoTraffic(videoId);
      if (result?.success === false) {
        throw new Error(result?.message || '识别失败');
      }
      console.info('[Traffic] recognize success', { videoId, result });
      const normalized = normalizeRecognizeTrafficSummary(result, monitoringSummaryRef.current);
      monitoringSummaryRef.current = normalized;
      setMonitoringSummary(normalized);
      setTrafficOcrStatus('识别完成');
    } catch (error) {
      const message = extractErrorMessage(error, '识别失败');
      console.error('[Traffic] recognize failed', { videoId, error });
      setTrafficOcrStatus(message);
    } finally {
      trafficRecognizingRef.current = false;
      setTrafficRecognizing(false);
    }
  }, [fetchTrafficStatus, trafficRecognizing, videoId]);

  const autoRecognizeTraffic = useCallback(async () => {
    if (!videoId || trafficRecognizingRef.current) {
      console.info('[Traffic] auto recognize skipped', { videoId, reason: !videoId ? 'empty videoId' : 'recognizing' });
      return;
    }

    trafficRecognizingRef.current = true;
    setTrafficRecognizing(true);
    console.info('[Traffic] auto recognize start', { videoId });

    try {
      const statusSummary = await fetchTrafficStatus();
      if (hasRecognizedTrafficValue(statusSummary)) {
        console.info('[Traffic] auto status refresh success', { videoId });
        return;
      }
      const result: any = await recognizeVideoTraffic(videoId);
      if (result?.success === false) {
        throw new Error(result?.message || 'traffic recognize failed');
      }
      console.info('[Traffic] auto recognize success', { videoId, result });
      const normalized = normalizeRecognizeTrafficSummary(result, monitoringSummaryRef.current);
      monitoringSummaryRef.current = normalized;
      setMonitoringSummary(normalized);
    } catch (error) {
      console.warn('[Traffic] auto recognize failed', { videoId, error });
    } finally {
      trafficRecognizingRef.current = false;
      setTrafficRecognizing(false);
    }
  }, [fetchTrafficStatus, videoId]);

  const ensureBackendFlvAiMonitoring = useCallback(async () => {
    if (!videoId || !isHttpFlvStream(activeStream)) return;
    const flvUrl = String(activeStream.src || '').trim();
    if (!flvUrl) return;

    try {
      let rules: string[] = [];
      try {
        rules = await getDeviceRules(Number(videoId));
        deviceRulesRef.current = Array.isArray(rules) ? rules.map((rule) => String(rule || '').trim()).filter(Boolean) : [];
      } catch (rulesError) {
        console.warn('[VideoPlayer] failed to load device AI rules; fallback to person tracking', { videoId, rulesError });
      }
      const aiRules = Array.from(new Set(['person', ...rules.map((rule) => String(rule || '').trim()).filter(Boolean)]));
      const algoType = aiRules.join(',');
      const streamKey = `${videoId}:${flvUrl}:${algoType}`;
      if (backendAiStreamKeyRef.current === streamKey) return;
      backendAiStreamKeyRef.current = streamKey;

      await startAIMonitoring(String(videoId), flvUrl, algoType);
      console.info('[VideoPlayer] backend FLV AI monitoring started', {
        videoId,
        algoType,
        urlPrefix: flvUrl.slice(0, 96),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (message.includes('已在运行') || message.includes('already')) {
        console.info('[VideoPlayer] backend AI monitoring already running; keep configured rules', { videoId });
        return;
      }
      backendAiStreamKeyRef.current = '';
      console.warn('[VideoPlayer] backend FLV AI monitoring start failed', { videoId, error });
    }
  }, [activeStream, videoId]);

  useEffect(() => {
    if (!isHttpFlvStream(activeStream)) return;
    ensureBackendFlvAiMonitoring();
  }, [activeStream, ensureBackendFlvAiMonitoring]);

  useEffect(() => {
    let cancelled = false;

    const applyPrimaryStream = (message = '') => {
      if (cancelled) return;
      resetAiOverlay();
      setActiveStream({ src, playType, accessToken, source: 'primary' });
      setStreamSwitchStatus(message);
    };

    if (!src) {
      applyPrimaryStream('');
      return () => {
        cancelled = true;
      };
    }

    if (streamMode === 'ezopen') {
      applyPrimaryStream('当前使用 ezopen 兜底流');
      return () => {
        cancelled = true;
      };
    }

    if (!HTTP_FLV_DISABLED && (streamMode === 'flv' || streamMode === 'auto')) {
      if (!videoId) {
        applyPrimaryStream(streamMode === 'flv' ? '缺少设备 ID，无法获取 HTTP-FLV' : '');
        return () => {
          cancelled = true;
        };
      }

      setStreamSwitchStatus(streamMode === 'auto' ? '正在尝试 HTTP-FLV' : '正在切换 HTTP-FLV');
      getVideoStreamUrl(videoId, { forceRefresh: true, protocol: 'flv' })
        .then((stream) => {
          if (cancelled) return;
          const flvUrl = String(stream?.url || '').trim();
          if (!flvUrl) throw new Error('empty flv url');
          console.info('[VideoPlayer] HTTP-FLV stream resolved', {
            videoId,
            playType: stream?.play_type,
            urlPrefix: flvUrl.slice(0, 96),
            isHttps: flvUrl.startsWith('https://'),
          });
          resetAiOverlay();
          setActiveStream({
            src: flvUrl,
            playType: stream?.play_type || 'flv',
            accessToken: stream?.access_token,
            source: 'flv',
          });
          setStreamSwitchStatus('当前使用 HTTP-FLV');
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn('[VideoPlayer] HTTP-FLV stream unavailable; fallback primary stream', { videoId, error });
          applyPrimaryStream(streamMode === 'auto' ? 'HTTP-FLV 不可用，已回到 ezopen' : 'HTTP-FLV 获取失败');
        });

      return () => {
        cancelled = true;
      };
    }

    applyPrimaryStream('');
    return () => {
      cancelled = true;
    };
  }, [accessToken, playType, resetAiOverlay, src, streamMode, videoId]);

  const cleanupPlayer = useCallback(() => {
    clearRetryTimer();
    console.info('[VideoPlayer] player destroy', { videoId, src: activeStream.src, playType: activeStream.playType, streamMode, activeSource: activeStream.source });

    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    if (flvRef.current) {
      try {
        flvRef.current.destroy();
      } catch {}
      flvRef.current = null;
    }

    if (ezRef.current) {
      try {
        ezRef.current.destroy();
      } catch {}
      ezRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
  }, [activeStream.playType, activeStream.source, activeStream.src, clearRetryTimer, streamMode, videoId]);

  const scheduleRetry = useCallback(
    (reason: string) => {
      if (retryCountRef.current >= MAX_RETRIES) {
        setConnectionStatus('error');
        onError?.(`视频流连接失败：${reason}`);
        return;
      }

      retryCountRef.current += 1;
      setConnectionStatus('connecting');
      clearRetryTimer();
      retryTimeoutRef.current = setTimeout(() => {
        if (!src) return;
        setConnectionStatus('connecting');
        initRef.current?.();
      }, RETRY_DELAY_MS);
    },
    [clearRetryTimer, onError, src]
  );

  const initPlayer = useCallback(() => {
    const currentSrc = activeStream.src;
    const currentPlayType = activeStream.playType;
    const currentAccessToken = activeStream.accessToken ?? accessToken;
    if (!currentSrc) return;
    console.info('[VideoPlayer] player init start', { videoId, src: currentSrc, playType: currentPlayType, streamMode, activeSource: activeStream.source });
    cleanupPlayer();

    const normalizedPlayType = String(currentPlayType || '').toLowerCase();
    const isEzopen = currentSrc.startsWith('ezopen://') || normalizedPlayType === 'ezopen';
    const isHls = currentSrc.includes('.m3u8') || normalizedPlayType === 'hls';

    if (isEzopen) {
      if (!currentAccessToken) {
        setConnectionStatus('error');
        onError?.('缺少萤石 accessToken，无法播放 ezopen 流');
        return;
      }
      if (!containerRef.current) {
        setConnectionStatus('error');
        onError?.('播放器容器不存在');
        return;
      }

      const containerId = `ezplayer_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      containerRef.current.id = containerId;

      import('ezuikit-js')
        .then(({ EZUIKitPlayer }) => {
          try {
            ezRef.current = new EZUIKitPlayer({
              id: containerId,
              url: currentSrc,
              accessToken: currentAccessToken,
              autoplay: true,
              muted: true,
              handleSuccess: () => {
                retryCountRef.current = 0;
                setConnectionStatus('connected');
                logPlayerInitSuccess({ src: currentSrc, playType: currentPlayType }, 'ezopen-success');
              },
              handleError: (err: any) => {
                console.error('[VideoPlayer] player error', err);
                scheduleRetry('ezopen 播放失败');
              },
            });
          } catch (error) {
            console.error('EZUIKit 初始化失败', error);
            scheduleRetry('EZUIKit 初始化失败');
          }
        })
        .catch((error) => {
          console.error('ezuikit-js 加载失败:', error);
          scheduleRetry('EZUIKit SDK 加载失败');
        });
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) {
      setConnectionStatus('error');
      onError?.('video 元素不存在');
      return;
    }

    videoEl.onplaying = () => {
      retryCountRef.current = 0;
      setConnectionStatus('connected');
      logPlayerInitSuccess({ src: currentSrc, playType: currentPlayType });
    };
    videoEl.onerror = () => {
      console.error('[VideoPlayer] player error', videoEl.error);
      scheduleRetry('video 标签播放失败');
    };

    if (isHls) {
      if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        console.info('[VideoPlayer] player set src', { videoId, src: currentSrc, playType: currentPlayType });
        videoEl.src = currentSrc;
        videoEl.play().catch(() => {});
        return;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hlsRef.current = hls;
        hls.attachMedia(videoEl);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          console.info('[VideoPlayer] player set src', { videoId, src: currentSrc, playType: currentPlayType });
          hls.loadSource(currentSrc);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoEl.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data?.fatal) {
            console.error('[VideoPlayer] player error', data);
            scheduleRetry('HLS 解析失败');
          }
        });
        return;
      }

      setConnectionStatus('error');
      onError?.('当前浏览器不支持 HLS 播放');
      return;
    }

    if (flvjs?.isSupported?.()) {
      try {
        let flvReadyLogged = false;
        const markFlvReady = (eventName: string, detail?: unknown) => {
          retryCountRef.current = 0;
          setConnectionStatus('connected');
          setStreamSwitchStatus((current) => (current.startsWith('HTTP-FLV') ? current : '当前使用 HTTP-FLV'));
          if (flvReadyLogged && eventName === 'statistics_info') return;
          flvReadyLogged = true;
          console.info('[VideoPlayer] FLV ready', { videoId, eventName, detail, src: currentSrc, playType: currentPlayType });
        };
        videoEl.onloadeddata = () => markFlvReady('loadeddata', { videoWidth: videoEl.videoWidth, videoHeight: videoEl.videoHeight });
        videoEl.oncanplay = () => markFlvReady('canplay', { readyState: videoEl.readyState });
        videoEl.onwaiting = () => console.warn('[VideoPlayer] FLV video waiting', { videoId, readyState: videoEl.readyState, networkState: videoEl.networkState });
        videoEl.onstalled = () => console.warn('[VideoPlayer] FLV video stalled', { videoId, readyState: videoEl.readyState, networkState: videoEl.networkState });
        const flvPlayer = flvjs.createPlayer(
          {
            type: 'flv',
            url: currentSrc,
            isLive: true,
            hasAudio: false,
            hasVideo: true,
          },
          {
            enableWorker: false,
            enableStashBuffer: false,
            stashInitialSize: 64,
            lazyLoad: false,
            autoCleanupSourceBuffer: true,
          }
        );
        flvRef.current = flvPlayer;
        flvPlayer.attachMediaElement(videoEl);
        flvPlayer.on(flvjs.Events.ERROR, (errorType: unknown, errorDetail: unknown, errorInfo: unknown) => {
          console.error('[VideoPlayer] FLV error', { videoId, errorType, errorDetail, errorInfo, src: currentSrc, playType: currentPlayType, streamMode });
        });
        flvPlayer.on(flvjs.Events.MEDIA_INFO, (info: unknown) => console.info('[VideoPlayer] FLV media_info', { videoId, info }));
        flvPlayer.on(flvjs.Events.METADATA_ARRIVED, (metadata: unknown) => console.info('[VideoPlayer] FLV metadata_arrived', { videoId, metadata }));
        flvPlayer.on(flvjs.Events.SCRIPTDATA_ARRIVED, (data: unknown) => console.info('[VideoPlayer] FLV scriptdata_arrived', { videoId, data }));
        flvPlayer.on(flvjs.Events.STATISTICS_INFO, () => markFlvReady('statistics_info'));
        console.info('[VideoPlayer] FLV load start', { videoId, src: currentSrc, playType: currentPlayType });
        flvPlayer.load();
        flvPlayer.play().then(() => {
          console.info('[VideoPlayer] FLV play promise resolved', { videoId });
        }).catch((error: unknown) => {
          console.warn('[VideoPlayer] FLV play promise rejected', { videoId, error });
        });
        flvPlayer.on('error', () => {
          console.error('[VideoPlayer] player error', { videoId, src: currentSrc, playType: currentPlayType, streamMode });
          scheduleRetry('FLV 播放失败');
        });
        flvPlayer.on('statistics_info', () => {
          retryCountRef.current = 0;
          setConnectionStatus('connected');
          logPlayerInitSuccess({ src: currentSrc, playType: currentPlayType }, 'statistics_info');
        });
        return;
      } catch (error) {
        console.error('flv.js 初始化失败', error);
      }
    }

    console.info('[VideoPlayer] player set src', { videoId, src: currentSrc, playType: currentPlayType });
    videoEl.src = currentSrc;
    videoEl.play().catch(() => {});
  }, [accessToken, activeStream, cleanupPlayer, logPlayerInitSuccess, onError, playType, scheduleRetry, src, streamMode, videoId]);

  initRef.current = initPlayer;

  useEffect(() => {
    resetAiOverlay();
    restoreCachedTrackPayload();
  }, [activeStream.src, resetAiOverlay, restoreCachedTrackPayload]);

  useEffect(() => {
    if (String(deviceStatus || '').toLowerCase() === 'offline') {
      cleanupPlayer();
      setConnectionStatus('error');
      return;
    }

    if (!activeStream.src) {
      cleanupPlayer();
      setConnectionStatus('error');
      return;
    }

    retryCountRef.current = 0;
    setConnectionStatus('connecting');
    initPlayer();

    return () => {
      cleanupPlayer();
    };
  }, [activeStream.src, activeStream.playType, cleanupPlayer, deviceStatus, initPlayer, videoId]);

  useEffect(() => {
    fetchTrafficStatus();
  }, [fetchTrafficStatus]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      rootVisibleRef.current = true;
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      rootVisibleRef.current = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0.05);
    }, { threshold: [0, 0.05] });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    clearTrafficOcrTimers();
    if (!videoId) return;

    trafficOcrFirstTimer.current = setTimeout(() => {
      autoRecognizeTraffic();
    }, TRAFFIC_OCR_FIRST_DELAY_MS);

    trafficOcrIntervalTimer.current = setInterval(() => {
      autoRecognizeTraffic();
    }, TRAFFIC_OCR_AUTO_INTERVAL_MS);

    return () => {
      clearTrafficOcrTimers();
    };
  }, [autoRecognizeTraffic, clearTrafficOcrTimers, videoId]);

  useEffect(() => {
    if (liveTrackTimerRef.current) {
      clearInterval(liveTrackTimerRef.current);
      liveTrackTimerRef.current = null;
    }
    liveTrackCacheRef.current = {};
    renderedTrackCacheRef.current = {};
    if (!restoreCachedTrackPayload()) {
      setLiveTracks(null);
    }
    setSyncedAiFrame(null);
    syncModeRef.current = 'tracking';
    setSyncMode('tracking');
    if (ptzRealtimeTimerRef.current) {
      clearTimeout(ptzRealtimeTimerRef.current);
      ptzRealtimeTimerRef.current = null;
    }
    if (!videoId) return;

    fetchLiveTracks();
    const quickTrackTimers = [120, 360, 800].map((delay) => window.setTimeout(fetchLiveTracks, delay));
    liveTrackTimerRef.current = setInterval(fetchLiveTracks, Math.max(25, AI_TRACK_POLL_INTERVAL_MS));
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLiveTracks();
      }
    };
    const handleAiOverlayRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ videoId?: number }>).detail || {};
      if (detail.videoId && Number(detail.videoId) !== Number(videoId)) return;
      rootVisibleRef.current = true;
      syncModeRef.current = 'tracking';
      setSyncMode('tracking');
      fetchLiveTracks();
      window.setTimeout(fetchLiveTracks, 150);
      window.setTimeout(fetchLiveTracks, 500);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener(AI_OVERLAY_REFRESH_EVENT, handleAiOverlayRefresh as EventListener);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener(AI_OVERLAY_REFRESH_EVENT, handleAiOverlayRefresh as EventListener);
      quickTrackTimers.forEach((timer) => window.clearTimeout(timer));
      if (liveTrackTimerRef.current) {
        clearInterval(liveTrackTimerRef.current);
        liveTrackTimerRef.current = null;
      }
      liveTrackCacheRef.current = {};
      renderedTrackCacheRef.current = {};
    };
  }, [fetchLiveTracks, restoreCachedTrackPayload, videoId]);

  useEffect(() => {
    if (!isHttpFlvStream(activeStream)) {
      flvTrackHistoryRef.current = [];
      flvDelaySamplesRef.current = [];
      flvDelayPrimedRef.current = false;
      setSyncedFlvTracks(null);
      return;
    }
    flvDelayPrimedRef.current = false;

    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const videoEl = videoRef.current;
      if (!videoEl || !videoEl.buffered?.length) return;

      const samples = [...flvDelaySamplesRef.current].sort((a, b) => a - b);
      const p95 = samples.length ? samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))] : FLV_SYNC_DELAY_MS;
      const targetDelayMs = Math.max(FLV_SYNC_DELAY_MS, p95 + 350);
      const targetDelaySeconds = Math.max(FLV_MIN_DELAY_SECONDS, Math.min(FLV_MAX_DELAY_SECONDS, targetDelayMs / 1000));

      const liveEdge = videoEl.buffered.end(videoEl.buffered.length - 1);
      const lag = liveEdge - videoEl.currentTime;
      flvClockRef.current = {
        liveEdgeSeconds: liveEdge,
        liveEdgeEpochMs: Date.now(),
        currentTimeSeconds: videoEl.currentTime,
        bufferedLagMs: Math.max(0, Math.round(lag * 1000)),
      };
      if (!flvDelayPrimedRef.current && lag < targetDelaySeconds - FLV_DELAY_READY_TOLERANCE_SECONDS) {
        if (!videoEl.paused) {
          videoEl.pause();
        }
        return;
      }

      if (!flvDelayPrimedRef.current) {
        flvDelayPrimedRef.current = true;
        if (videoEl.paused) {
          videoEl.play().catch(() => {});
        }
      }

      if (lag > targetDelaySeconds + 2.0) {
        try {
          videoEl.currentTime = Math.max(0, liveEdge - targetDelaySeconds);
        } catch {}
      } else if (videoEl.paused) {
        videoEl.play().catch(() => {});
      }
    }, 500);

    return () => clearInterval(timer);
  }, [activeStream]);

  useEffect(() => {
    if (!isHttpFlvStream(activeStream)) return;

    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      const samples = [...flvDelaySamplesRef.current].sort((a, b) => a - b);
      const p95 = samples.length ? samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))] : FLV_SYNC_DELAY_MS;
      const targetDelayMs = Math.max(FLV_SYNC_DELAY_MS, p95 + 350);
      const displayEpochMs = now - targetDelayMs;

      const history = flvTrackHistoryRef.current.filter((item) => now - item.frameEpochMs <= FLV_SYNC_HISTORY_MS);
      flvTrackHistoryRef.current = history;
      if (history.length < 2) {
        setSyncedFlvTracks((current) => {
          const currentFrameMs = Number(current?.frame_epoch_ms || 0);
          return currentFrameMs && now - currentFrameMs <= TRACK_PAYLOAD_CACHE_MAX_AGE_MS
            ? stripCachedBehaviorLabels({ ...current, age_ms: now - currentFrameMs })
            : null;
        });
        return;
      }
      const best = history
        .map((item) => ({ item, distance: Math.abs(item.frameEpochMs - displayEpochMs) }))
        .sort((a, b) => a.distance - b.distance)[0];

      if (!best || best.distance > FLV_SYNC_TOLERANCE_MS) {
        const latest = history[history.length - 1];
        if (latest && now - latest.frameEpochMs <= TRACK_PAYLOAD_CACHE_MAX_AGE_MS) {
          setSyncedFlvTracks(stripCachedBehaviorLabels({
            ...latest,
            age_ms: now - latest.frameEpochMs,
            video_box_delta_ms: Math.round(displayEpochMs - latest.frameEpochMs),
            flv_playback_epoch_ms: Math.round(displayEpochMs),
            flv_playback_lag_ms: flvClockRef.current?.bufferedLagMs,
            flv_target_delay_ms: Math.round(targetDelayMs),
          }));
          return;
        }
        setSyncedFlvTracks((current) => current);
        return;
      }

      if (now - lastAiSyncLogAtRef.current >= 500) {
        lastAiSyncLogAtRef.current = now;
        console.info('[AI_SYNC]', {
          videoId,
          playerInstanceId: playerInstanceIdRef.current,
          visible: rootVisibleRef.current,
          videoToBoxDeltaMs: Math.round(displayEpochMs - best.item.frameEpochMs),
          matchedFrameDistanceMs: Math.round(best.distance),
          flvBufferedLagMs: flvClockRef.current?.bufferedLagMs,
          flvTargetDelayMs: Math.round(targetDelayMs),
          playbackEpochMs: Math.round(displayEpochMs),
          boxFrameEpochMs: Math.round(best.item.frameEpochMs),
          flvCurrentTime: flvClockRef.current?.currentTimeSeconds,
          flvLiveEdge: flvClockRef.current?.liveEdgeSeconds,
          historySize: history.length,
        });
      }
      setSyncedFlvTracks({
        ...best.item,
        age_ms: best.distance,
        video_box_delta_ms: Math.round(displayEpochMs - best.item.frameEpochMs),
        flv_playback_epoch_ms: Math.round(displayEpochMs),
        flv_playback_lag_ms: flvClockRef.current?.bufferedLagMs,
        flv_target_delay_ms: Math.round(targetDelayMs),
      });
    }, 80);

    return () => clearInterval(timer);
  }, [activeStream]);

  useEffect(() => {
    const updateOverlayRect = () => {
      const root = rootRef.current;
      if (!root) return;
      const bounds = root.getBoundingClientRect();
      const width = bounds.width || 0;
      const height = bounds.height || 0;
      if (!width || !height) {
        setOverlayRect({ left: 0, top: 0, width: 0, height: 0 });
        return;
      }

      const fillsContainer = isHttpFlvStream(activeStream) || src.startsWith('ezopen://') || String(playType || '').toLowerCase() === 'ezopen';
      if (fillsContainer) {
        setOverlayRect({ left: 0, top: 0, width, height });
        return;
      }

      const renderTracks = isHttpFlvStream(activeStream) ? syncedFlvTracks : liveTracks;
      const frameWidth = Number(renderTracks?.frame_width || 0);
      const frameHeight = Number(renderTracks?.frame_height || 0);
      const frameAspect = frameWidth > 0 && frameHeight > 0 ? frameWidth / frameHeight : width / height;
      const containerAspect = width / height;

      let videoWidth = width;
      let videoHeight = height;
      let left = 0;
      let top = 0;

      if (containerAspect > frameAspect) {
        videoHeight = height;
        videoWidth = height * frameAspect;
        left = (width - videoWidth) / 2;
      } else {
        videoWidth = width;
        videoHeight = width / frameAspect;
        top = (height - videoHeight) / 2;
      }

      setOverlayRect({ left, top, width: videoWidth, height: videoHeight });
    };

    updateOverlayRect();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateOverlayRect) : null;
    if (observer && rootRef.current) observer.observe(rootRef.current);
    window.addEventListener('resize', updateOverlayRect);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateOverlayRect);
    };
  }, [activeStream, liveTracks?.frame_width, liveTracks?.frame_height, playType, src, syncedFlvTracks?.frame_width, syncedFlvTracks?.frame_height]);

  const showNativeVideo = !(activeStream.src.startsWith('ezopen://') || String(activeStream.playType || '').toLowerCase() === 'ezopen');
  const isDeviceOffline =
    String(deviceStatus || '').toLowerCase() === 'offline' ||
    monitoringSummary?.main_status === 'offline' ||
    monitoringSummary?.status_tags?.includes('VIDEO_DEVICE_OFFLINE');

  const hasCachedTraffic = hasRecognizedTrafficValue(monitoringSummary);
  const usedText = hasCachedTraffic
    ? (monitoringSummary?.used_flow_display || monitoringSummary?.traffic_text || monitoringSummary?.weekly_used_text)
    : '等待识别';
  const thresholdText =
    monitoringSummary?.total_flow_display ||
    (monitoringSummary?.total_flow_value === null || monitoringSummary?.total_flow_value === undefined
      ? ''
      : formatTrafficValue(monitoringSummary?.total_flow_value, monitoringSummary?.total_flow_unit || monitoringSummary?.traffic_display_unit)) ||
    monitoringSummary?.monthly_threshold_text ||
    monitoringSummary?.weekly_quota_text ||
    (monitoringSummary?.traffic_value === null || monitoringSummary?.traffic_value === undefined
      ? ''
      : formatTrafficValue(monitoringSummary?.traffic_value, monitoringSummary?.total_flow_unit || monitoringSummary?.traffic_display_unit)) ||
    formatTrafficValue(30);
  const remainingText =
    monitoringSummary?.remaining_flow_display ||
    (monitoringSummary?.residual_flow_value === null || monitoringSummary?.residual_flow_value === undefined
      ? ''
      : formatTrafficValue(
          monitoringSummary?.residual_flow_value,
          monitoringSummary?.residual_flow_unit || monitoringSummary?.remaining_flow_unit || monitoringSummary?.traffic_display_unit,
        )) ||
    monitoringSummary?.estimated_remaining_text ||
    monitoringSummary?.weekly_remaining_text ||
    '--';
  const updateTimeText = formatBackendLocalTime(monitoringSummary?.last_traffic_ocr_time);
  const isTrafficAlarm = monitoringSummary?.traffic_status === 'alarm';
  const isRealtimeControlMode = syncMode === 'realtime';
  const renderTrackPayload = isHttpFlvStream(activeStream) ? (syncedFlvTracks || liveTracks) : liveTracks;
  const tracksToRender = !isRealtimeControlMode && Array.isArray(renderTrackPayload?.tracks)
    ? renderTrackPayload.tracks
        .map((track) => {
          const coords = normalizeTrackCoords(track, renderTrackPayload);
          return coords ? { ...track, coords_norm: coords } : null;
        })
        .filter((track): track is LivePersonTrack => Boolean(track))
    : [];
  const overlayBoxStyle = (track: LivePersonTrack): React.CSSProperties => {
    const coords = normalizeTrackCoords(track, renderTrackPayload) || [0, 0, 0, 0];
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = coords;
    return {
      left: `${x1 * 100}%`,
      top: `${y1 * 100}%`,
      width: `${Math.max(0, x2 - x1) * 100}%`,
      height: `${Math.max(0, y2 - y1) * 100}%`,
      transition: 'left 80ms linear, top 80ms linear, width 100ms ease-out, height 100ms ease-out, opacity 80ms ease',
    };
  };
  const overlayLabelStyle = (coords: number[], index: number): React.CSSProperties => {
    const [x1 = 0, y1 = 0, x2 = 0] = coords;
    const vertical = Math.max(2, Math.min(86, y1 * 100 + index * 4));
    if (x2 <= 0.72) {
      return {
        left: `${Math.min(96, x2 * 100 + 2)}%`,
        top: `${vertical}%`,
        maxWidth: `${Math.max(16, Math.min(30, (0.98 - x2) * 100 - 2))}%`,
      };
    }
    if (x1 >= 0.28) {
      return {
        right: `${Math.min(96, (1 - x1) * 100 + 2)}%`,
        top: `${vertical}%`,
        maxWidth: `${Math.max(16, Math.min(30, x1 * 100 - 2))}%`,
      };
    }
    return {
      left: '2%',
      top: `${Math.max(2, y1 * 100 - 10 + index * 4)}%`,
      maxWidth: '30%',
    };
  };
  const getTrackAlarmLabels = (track: LivePersonTrack): string[] => {
    if (renderTrackPayload?.stale || Number(renderTrackPayload?.age_ms || 0) > TRACK_ALARM_LABEL_STALE_LIMIT_MS) {
      return [];
    }
    const labels = new Map<string, string>();
    const addLabel = (value: unknown) => {
      const text = normalizeLabel(value);
      if (!text) return;
      const compact = text.toLowerCase().replace(/[\s_\-:：|]+/g, '');
      let key = compact;
      let display = text;
      if (compact.includes('phone') || compact.includes('call') || text.includes('打电话')) {
        key = 'phone';
        display = '打电话';
      } else if (text.includes('反光衣') || compact.includes('vest') || compact.includes('reflective')) {
        key = 'vest';
        display = text.includes('缺失') || text.includes('未穿') ? text : '反光衣缺失';
      } else if (text.includes('安全帽') || compact.includes('helmet')) {
        key = 'helmet';
        display = text.includes('缺失') || text.includes('未戴') ? text : '安全帽缺失';
      }
      labels.set(key, display);
    };
    const normalizeLabel = (value: unknown) => {
      const text = String(value || '').trim();
      return getAlarmDisplayLabel(text) || text;
    };
    if (Array.isArray(track.alarmLabels)) {
      track.alarmLabels.forEach(addLabel);
    }
    if (Array.isArray(track.behaviorAlarms)) {
      track.behaviorAlarms.forEach((alarm) => {
        addLabel(alarm?.label || alarm?.type);
      });
    }
    return Array.from(labels.values()).slice(0, 3);
  };

  if (isDeviceOffline) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-white p-4">
        <img
          src="/images/公司logo.jpeg"
          alt="公司 Logo"
          className="block h-auto max-h-[76%] w-auto max-w-[76%] object-contain"
        />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="w-full h-full bg-black rounded-lg overflow-hidden relative">
      <div ref={containerRef} className="w-full h-full absolute inset-0" />
      {showNativeVideo && (
        <video
          ref={videoRef}
          className="w-full h-full object-fill absolute inset-0"
          muted
          autoPlay
          playsInline
          controls={false}
        />
      )}

      {ENABLE_SYNC_FRAME_FREEZE && !isRealtimeControlMode && syncedAiFrame && (
        <img
          ref={syncedFrameLayerRef}
          src={syncedAiFrame.image}
          alt=""
          className="pointer-events-none absolute z-[50] object-fill"
          style={{
            left: overlayRect.left,
            top: overlayRect.top,
            width: overlayRect.width,
            height: overlayRect.height,
          }}
        />
      )}

      {tracksToRender.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[8]">
          <div
            className="absolute"
            style={{
              left: overlayRect.left,
              top: overlayRect.top,
              width: overlayRect.width,
              height: overlayRect.height,
            }}
          >
            {tracksToRender.map((track, index) => {
              const alarmLabels = getTrackAlarmLabels(track);
              const hasAlarm = alarmLabels.length > 0;
              const coords = normalizeTrackCoords(track, renderTrackPayload) || [0, 0, 0, 0];
              const displayLabel = hasAlarm
                ? `${track.personName || '未知人员'} | 异常：${alarmLabels.join('、')}`
                : track.personName || '未知人员';
              const label = track.personName || '未知人员';
              return (
                <div
                  key={`${track.track_id || index}`}
                  className={`absolute rounded-sm border-2 ${
                    hasAlarm
                      ? 'border-red-500 shadow-[0_0_0_1px_rgba(127,29,29,0.9),0_0_14px_rgba(248,113,113,0.65)]'
                      : 'border-cyan-300 shadow-[0_0_0_1px_rgba(8,47,73,0.85),0_0_12px_rgba(34,211,238,0.55)]'
                  }`}
                  style={overlayBoxStyle(track)}
                />
              );
            })}
            {tracksToRender.map((track, index) => {
              const alarmLabels = getTrackAlarmLabels(track);
              const hasAlarm = alarmLabels.length > 0;
              const coords = normalizeTrackCoords(track, renderTrackPayload) || [0, 0, 0, 0];
              const displayLabel = hasAlarm
                ? `${track.personName || '未知人员'} | 异常：${alarmLabels.join('、')}`
                : track.personName || '未知人员';
              return (
                <span
                  key={`label-${track.track_id || index}`}
                  className={`absolute rounded-sm px-2 py-1 text-[12px] font-semibold leading-tight shadow-lg ${
                    hasAlarm ? 'bg-red-500 text-white' : 'bg-cyan-400 text-slate-950'
                  }`}
                  style={overlayLabelStyle(coords, index)}
                  title={displayLabel}
                >
                  {displayLabel}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="absolute top-2 right-2 flex items-center gap-2 bg-black/60 px-3 py-1 rounded text-xs z-10">
        <div
          className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected'
              ? 'bg-green-500 animate-pulse'
              : connectionStatus === 'connecting'
              ? 'bg-yellow-500 animate-pulse'
              : 'bg-red-500'
          }`}
        />
        <span className="text-white">
          {connectionStatus === 'connected'
            ? '直播中'
            : connectionStatus === 'connecting'
            ? `连接中${retryCountRef.current > 0 ? ` (${retryCountRef.current}/${MAX_RETRIES})` : '...'}`
            : '连接失败'}
        </span>
      </div>

      <div className="absolute left-2 bottom-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-2 rounded bg-black/65 px-2 py-1 text-[11px] text-white">
        <span className="text-cyan-100">流</span>
        {(['auto', 'flv', 'ezopen'] as StreamMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              retryCountRef.current = 0;
              setStreamMode(mode);
              setConnectionStatus('connecting');
            }}
            className={`rounded px-2 py-0.5 transition ${
              streamMode === mode ? 'bg-cyan-500 text-slate-950' : 'bg-white/12 text-slate-100 hover:bg-white/20'
            }`}
          >
            {mode === 'auto' ? '自动' : mode === 'flv' ? 'HTTP-FLV' : 'ezopen'}
          </button>
        ))}
        <span className="truncate text-slate-300">
          {streamSwitchStatus || (activeStream.source === 'flv' ? '当前 HTTP-FLV' : '当前 ezopen')}
        </span>
      </div>

      {showTrafficPanel && trafficPanelVariant === 'compact' && (
        <div
          className={`absolute bottom-2 right-2 z-10 max-w-[46%] rounded px-2.5 py-2 text-[10px] leading-tight shadow-lg border ${
            isTrafficAlarm ? 'bg-rose-950/85 border-rose-300/50 text-rose-50' : 'bg-slate-950/72 border-cyan-200/25 text-slate-100'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-300">已用</span>
            <span className="font-bold text-cyan-100">{usedText}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-slate-300">剩余</span>
            <span className="font-semibold text-white">{remainingText}</span>
          </div>
          <div className="mt-1 truncate border-t border-white/10 pt-1 text-[9px] text-slate-300">
            {updateTimeText !== '--' ? updateTimeText : trafficOcrStatus}
          </div>
        </div>
      )}

      {showTrafficPanel && trafficPanelVariant === 'full' && (
        <div
          className={`absolute bottom-5 right-5 z-10 rounded-md px-8 py-6 text-[17px] text-slate-100 min-w-[560px] max-w-[min(92vw,640px)] shadow-2xl border ${
            isTrafficAlarm ? 'bg-rose-950/85 border-rose-300/50' : 'bg-slate-900/82 border-cyan-200/25'
          }`}
        >
          {isTrafficAlarm && <div className="mb-4 text-[18px] font-bold text-rose-100">流量不足</div>}
          <div className="flex items-center justify-between gap-14">
            <span className="text-slate-200">已使用流量</span>
            <span className="text-3xl font-bold text-cyan-100">{usedText}</span>
          </div>
          <div className="flex items-center justify-between gap-14 mt-4">
            <span className="text-slate-200">流量阈值</span>
            <span className="text-2xl font-bold text-white">{thresholdText}</span>
          </div>
          <div className="flex items-center justify-between gap-14 mt-4">
            <span className="text-slate-200">估算剩余流量</span>
            <span className="text-2xl font-bold text-white">{remainingText}</span>
          </div>
          <div className="flex items-center justify-between gap-14 mt-4 text-sm">
            <span className="text-slate-300">更新时间</span>
            <span className="font-semibold text-slate-100">{updateTimeText}</span>
          </div>
          <div className="mt-4 border-t border-white/10 pt-4 text-sm text-slate-300">
            识别状态：{trafficOcrStatus}
          </div>
          <button
            type="button"
            onClick={handleRecognizeTraffic}
            disabled={!videoId || trafficRecognizing}
            className="mt-5 w-full rounded bg-cyan-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          >
            {trafficRecognizing ? '后端识别中...' : '识别流量'}
          </button>
        </div>
      )}

      {connectionStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center text-white p-6">
            <div className="text-lg font-semibold mb-2">视频流连接失败</div>
            <div className="text-sm text-gray-300 mb-4">请检查摄像头是否在线，或稍后重试</div>
            <button
              type="button"
              onClick={() => {
                retryCountRef.current = 0;
                setConnectionStatus('connecting');
                initPlayer();
              }}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded text-white"
            >
              重新连接
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
