import React, { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import flvjs from 'flv.js';
import { getVideoStreamUrl, PTZ_ACTIVITY_EVENT, recognizeVideoTraffic } from '../api/videoApi';
import { getAuthHeaders } from '../api/config';

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
  personName?: string;
  personnel_id?: string;
  misses?: number;
  score?: number;
}

interface LiveTrackPayload {
  timestamp?: string | null;
  frame_width?: number | null;
  frame_height?: number | null;
  tracks?: LivePersonTrack[];
  source?: string;
  age_ms?: number;
}

type VideoSyncMode = 'tracking' | 'realtime';
type StreamMode = 'auto' | 'flv' | 'ezopen';
const MAX_RENDERED_PERSON_TRACKS = 8;
const SAME_PERSON_IOU_THRESHOLD = 0.45;
const SAME_PERSON_CENTER_DISTANCE_THRESHOLD = 0.12;
const ENABLE_SYNC_FRAME_FREEZE = (import.meta as any).env?.VITE_ENABLE_SYNC_FRAME_FREEZE === '1';

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
  const frameDetectBusyRef = useRef(false);
  const frameDetectInflightRef = useRef(0);
  const frameDetectRequestSeqRef = useRef(0);
  const frameDetectLatestAppliedSeqRef = useRef(0);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameDetectFailCountRef = useRef(0);
  const frameDetectLogCountRef = useRef(0);
  const backendTrackLogCountRef = useRef(0);
  const syncedFrameLayerRef = useRef<HTMLImageElement | null>(null);
  const ptzRealtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncModeRef = useRef<VideoSyncMode>('tracking');
  const initRef = useRef<(() => void) | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [monitoringSummary, setMonitoringSummary] = useState<MonitoringSummary | null>(null);
  const monitoringSummaryRef = useRef<MonitoringSummary | null>(null);
  const [liveTracks, setLiveTracks] = useState<LiveTrackPayload | null>(null);
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
    setLiveTracks(null);
    setSyncedAiFrame(null);
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

  const applyLiveTrackPayload = useCallback((data: LiveTrackPayload & { stale?: boolean }) => {
    const timestamp = data?.timestamp ? new Date(data.timestamp).getTime() : 0;
    const now = Date.now();
    const trackRect = (track: LivePersonTrack) => {
      const coords = Array.isArray(track.coords_norm) ? track.coords_norm : [];
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = coords.map((value) => Math.max(0, Math.min(1, Number(value) || 0)));
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
          const coords = Array.isArray(track.coords_norm) ? track.coords_norm : [];
          const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = coords.map((value) => Math.max(0, Math.min(1, Number(value) || 0)));
          const area = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
          return { track, index, area, score: Number(track.score || 0) };
        });
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
    const incomingTracks = Array.isArray(data?.tracks) ? data.tracks : [];
    if (data?.source === 'frontend_frame') {
      const renderableTracks = selectRenderableTracks(incomingTracks);
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
    const staleLimitMs = 1200;
    if (data?.stale || payloadAgeMs > staleLimitMs) {
      liveTrackCacheRef.current = {};
      setLiveTracks({ ...data, tracks: [] });
      return;
    }
    const primaryTrack = selectRenderableTracks(incomingTracks)[0];
    const cache: Record<string, { track: LivePersonTrack; lastSeen: number }> = {};
    if (primaryTrack) {
      const key = String(primaryTrack.track_id || primaryTrack.personnel_id || 'person_1');
      cache[key] = { track: { ...primaryTrack, track_id: primaryTrack.track_id || key }, lastSeen: now };
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
    const syncedLayer = syncedFrameLayerRef.current;
    const previousVisibility = syncedLayer?.style.visibility || '';
    if (syncedLayer) {
      syncedLayer.style.visibility = 'hidden';
      await waitForNextPaint();
    }

    const candidates: Array<{ type: 'video' | 'canvas'; width: number; height: number; dataUrl: string; score: number }> = [];
    const maxWidth = 640;
    const canvas = frameCanvasRef.current || document.createElement('canvas');
    frameCanvasRef.current = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      if (syncedLayer) syncedLayer.style.visibility = previousVisibility;
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
      if (syncedLayer) syncedLayer.style.visibility = previousVisibility;
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
  }, [scoreCanvasContent, videoId, waitForNextPaint]);

  const fetchBackendTracks = useCallback(async () => {
    if (!videoId) {
      liveTrackCacheRef.current = {};
      setLiveTracks(null);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/video/ai/tracks/${videoId}`, {
        cache: 'no-store',
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      backendTrackLogCountRef.current += 1;
      if (backendTrackLogCountRef.current === 1 || backendTrackLogCountRef.current % 20 === 0) {
        console.info('[AIFrame] backend tracks response', {
          videoId,
          backendAgeMs: data?.age_ms,
          stale: data?.stale,
          tracks: Array.isArray(data?.tracks) ? data.tracks.length : 0,
          timestamp: data?.timestamp,
        });
      }
      if (Number(data?.age_ms || 0) > 1200) {
        console.warn('[AIFrame] backend tracks stale; dropped', {
          videoId,
          backendAgeMs: data?.age_ms,
          tracks: Array.isArray(data?.tracks) ? data.tracks.length : 0,
        });
      }
      applyLiveTrackPayload(data);
    } catch {
      // Keep the current frame briefly; the stale timestamp check will clear it.
    }
  }, [applyLiveTrackPayload, videoId]);

  const fetchLiveTracks = useCallback(async () => {
    if (!videoId) return;
    if (syncModeRef.current === 'realtime') return;
    const maxInflight = 1;
    if (frameDetectInflightRef.current >= maxInflight) return;
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
          algo_type: 'person',
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
        personDebug: data?.person_debug,
      });
      if (trackCount <= 0) {
        console.warn('[AIFrame] no frontend-frame tracks; apply synced frame without boxes', {
          videoId,
          debugFrameUrl: data?.debug_frame_url,
        });
      }
      frameDetectLatestAppliedSeqRef.current = requestSeq;
      applyLiveTrackPayload(data);
      setSyncedAiFrame({ image, captureTime, responseAt });
    } catch (error) {
      frameDetectFailCountRef.current += 1;
      console.warn('[VideoPlayer] current-frame detection failed; keep last synced AI frame', { videoId, error });
    } finally {
      frameDetectInflightRef.current = Math.max(0, frameDetectInflightRef.current - 1);
      frameDetectBusyRef.current = frameDetectInflightRef.current > 0;
    }
  }, [applyLiveTrackPayload, captureCurrentVideoFrame, fetchBackendTracks, videoId]);

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

    if (streamMode === 'flv' || streamMode === 'auto') {
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
                console.info('[VideoPlayer] player init success', { videoId, src: currentSrc, playType: currentPlayType });
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
      console.info('[VideoPlayer] player init success', { videoId, src: currentSrc, playType: currentPlayType });
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
        const markFlvReady = (eventName: string, detail?: unknown) => {
          retryCountRef.current = 0;
          setConnectionStatus('connected');
          setStreamSwitchStatus(`HTTP-FLV ${eventName}`);
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
            enableStashBuffer: true,
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
        flvPlayer.on(flvjs.Events.STATISTICS_INFO, (stats: unknown) => markFlvReady('statistics_info', stats));
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
          console.info('[VideoPlayer] player init success', { videoId, src: currentSrc, playType: currentPlayType });
        });
        return;
      } catch (error) {
        console.error('flv.js 初始化失败', error);
      }
    }

    console.info('[VideoPlayer] player set src', { videoId, src: currentSrc, playType: currentPlayType });
    videoEl.src = currentSrc;
    videoEl.play().catch(() => {});
  }, [accessToken, activeStream, cleanupPlayer, onError, playType, scheduleRetry, src, streamMode, videoId]);

  initRef.current = initPlayer;

  useEffect(() => {
    resetAiOverlay();
  }, [activeStream.src, resetAiOverlay]);

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
    setLiveTracks(null);
    setSyncedAiFrame(null);
    syncModeRef.current = 'tracking';
    setSyncMode('tracking');
    if (ptzRealtimeTimerRef.current) {
      clearTimeout(ptzRealtimeTimerRef.current);
      ptzRealtimeTimerRef.current = null;
    }
    if (!videoId) return;

    fetchLiveTracks();
    liveTrackTimerRef.current = setInterval(fetchLiveTracks, 150);

    return () => {
      if (liveTrackTimerRef.current) {
        clearInterval(liveTrackTimerRef.current);
        liveTrackTimerRef.current = null;
      }
      liveTrackCacheRef.current = {};
    };
  }, [fetchLiveTracks, videoId]);

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

      const isEzopenPlayer = src.startsWith('ezopen://') || String(playType || '').toLowerCase() === 'ezopen';
      if (isEzopenPlayer) {
        setOverlayRect({ left: 0, top: 0, width, height });
        return;
      }

      const frameWidth = Number(liveTracks?.frame_width || 0);
      const frameHeight = Number(liveTracks?.frame_height || 0);
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
  }, [liveTracks?.frame_width, liveTracks?.frame_height, playType, src]);

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
  const tracksToRender = !isRealtimeControlMode && Array.isArray(liveTracks?.tracks) ? liveTracks.tracks : [];
  const overlayBoxStyle = (track: LivePersonTrack): React.CSSProperties => {
    const coords = Array.isArray(track.coords_norm) ? track.coords_norm : [];
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = coords.map((value) => Math.max(0, Math.min(1, Number(value) || 0)));
    return {
      left: `${x1 * 100}%`,
      top: `${y1 * 100}%`,
      width: `${Math.max(0, x2 - x1) * 100}%`,
      height: `${Math.max(0, y2 - y1) * 100}%`,
      transition: 'left 40ms linear, top 40ms linear, width 40ms linear, height 40ms linear, opacity 80ms ease',
    };
  };

  if (isDeviceOffline) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-white p-4">
        <img
          src="/images/logo.jpeg"
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
          className="w-full h-full object-contain absolute inset-0"
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
          className="pointer-events-none absolute inset-0 z-[6] h-full w-full object-fill"
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
              const label = track.personName || track.track_id || `person_${index + 1}`;
              return (
                <div
                  key={`${track.track_id || index}`}
                  className="absolute rounded-sm border-2 border-cyan-300 shadow-[0_0_0_1px_rgba(8,47,73,0.85),0_0_12px_rgba(34,211,238,0.55)]"
                  style={overlayBoxStyle(track)}
                >
                  <span className="absolute left-0 top-0 -translate-y-full rounded-t-sm bg-cyan-400 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-slate-950">
                    {label}
                  </span>
                </div>
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
