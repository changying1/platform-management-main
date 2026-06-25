import React, { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { recognizeVideoTraffic } from '../api/videoApi';

const detectBackendUrl = (): string => {
  if ((import.meta as any).env?.VITE_API_BASE_URL) return (import.meta as any).env?.VITE_API_BASE_URL;
  if (window.location.port === '3000') return '';
  return `${window.location.protocol}//${window.location.host}`;
};

const API_BASE_URL = detectBackendUrl();
const CHINA_RAILWAY_LOGO = '/images/%E5%85%AC%E5%8F%B8logo.jpeg';
const MAX_RETRIES = 8;
const RETRY_DELAY_MS = 1200;
const TRAFFIC_OCR_FIRST_DELAY_MS = 10 * 1000;
const TRAFFIC_OCR_AUTO_INTERVAL_MS = 60 * 60 * 1000;

interface VideoPlayerProps {
  src: string;
  playType?: string;
  accessToken?: string;
  videoId?: number;
  onError?: (error: string) => void;
  showTrafficPanel?: boolean;
}

interface MonitoringSummary {
  weekly_quota_text?: string;
  weekly_used_text?: string;
  weekly_remaining_text?: string;
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

const ChinaRailwayLogoFallback: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <div className="absolute inset-0 z-20 flex items-center justify-center bg-white">
    <img
      src={CHINA_RAILWAY_LOGO}
      alt="China Railway logo"
      className="max-h-[70%] max-w-[70%] object-contain"
    />
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
      >
        重试
      </button>
    )}
  </div>
);

const hasRecognizedTraffic = (summary?: MonitoringSummary | null): boolean => {
  const text = summary?.weekly_used_text || '';
  return !!text && text !== '--' && text !== '等待识别' && text !== '识别中';
};

const normalizeTrafficSummary = (data: any, previous: MonitoringSummary | null): MonitoringSummary => {
  const next: MonitoringSummary = {
    weekly_used_text: data?.weekly_used_text,
    weekly_quota_text: data?.weekly_quota_text,
    weekly_remaining_text: data?.weekly_remaining_text,
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
  const text = summary?.traffic_text || summary?.weekly_used_text || '';
  return !!text && text !== '--';
};

const formatTrafficGb = (value: unknown): string => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return `${Math.max(0, numeric).toFixed(3).replace(/\.?0+$/, '')}GB`;
};

const normalizeRecognizeTrafficSummary = (data: any, previous: MonitoringSummary | null): MonitoringSummary => {
  const trafficText =
    data?.traffic_text ||
    data?.traffic_ocr_text ||
    data?.weekly_used_text ||
    formatTrafficGb(data?.used_traffic_gb ?? data?.traffic_value);

  return {
    ...previous,
    weekly_used_text: data?.weekly_used_text || trafficText,
    weekly_quota_text: data?.weekly_quota_text || previous?.weekly_quota_text,
    weekly_remaining_text: data?.weekly_remaining_text || previous?.weekly_remaining_text,
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

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, playType, accessToken, videoId, onError, showTrafficPanel = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const flvRef = useRef<any>(null);
  const ezRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trafficOcrFirstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trafficOcrIntervalTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const initRef = useRef<(() => void) | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [monitoringSummary, setMonitoringSummary] = useState<MonitoringSummary | null>(null);
  const monitoringSummaryRef = useRef<MonitoringSummary | null>(null);
  const [trafficOcrStatus, setTrafficOcrStatus] = useState('等待识别');
  const [trafficRecognizing, setTrafficRecognizing] = useState(false);
  const trafficRecognizingRef = useRef(false);

  const clearRetryTimer = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
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
  }, [trafficRecognizing, videoId]);

  const autoRecognizeTraffic = useCallback(async () => {
    if (!videoId || trafficRecognizingRef.current) {
      console.info('[Traffic] auto recognize skipped', { videoId, reason: !videoId ? 'empty videoId' : 'recognizing' });
      return;
    }

    trafficRecognizingRef.current = true;
    setTrafficRecognizing(true);
    console.info('[Traffic] auto recognize start', { videoId });

    try {
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
  }, [videoId]);

  const cleanupPlayer = useCallback(() => {
    clearRetryTimer();
    console.info('[VideoPlayer] player destroy', { videoId, src, playType });

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
  }, [clearRetryTimer, playType, src, videoId]);

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
    if (!src) return;
    console.info('[VideoPlayer] player init start', { videoId, src, playType });
    cleanupPlayer();

    const normalizedPlayType = String(playType || '').toLowerCase();
    const isEzopen = src.startsWith('ezopen://') || normalizedPlayType === 'ezopen';
    const isHls = src.includes('.m3u8') || normalizedPlayType === 'hls';

    if (isEzopen) {
      if (!accessToken) {
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
              url: src,
              accessToken,
              autoplay: true,
              muted: true,
              handleSuccess: () => {
                retryCountRef.current = 0;
                setConnectionStatus('connected');
                console.info('[VideoPlayer] player init success', { videoId, src, playType });
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
      console.info('[VideoPlayer] player init success', { videoId, src, playType });
    };
    videoEl.onerror = () => {
      console.error('[VideoPlayer] player error', videoEl.error);
      scheduleRetry('video 标签播放失败');
    };

    if (isHls) {
      if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        console.info('[VideoPlayer] player set src', { videoId, src, playType });
        videoEl.src = src;
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
          console.info('[VideoPlayer] player set src', { videoId, src, playType });
          hls.loadSource(src);
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

    const flvjs = (window as any).flvjs;
    if (flvjs?.isSupported?.()) {
      try {
        const flvPlayer = flvjs.createPlayer(
          {
            type: 'flv',
            url: src,
            isLive: true,
            hasAudio: false,
            hasVideo: true,
          },
          {
            enableWorker: true,
            stashInitialSize: 128,
          }
        );
        flvRef.current = flvPlayer;
        flvPlayer.attachMediaElement(videoEl);
        flvPlayer.load();
        flvPlayer.play().catch(() => {});
        flvPlayer.on('error', () => {
          console.error('[VideoPlayer] player error', { videoId, src, playType });
          scheduleRetry('FLV 播放失败');
        });
        flvPlayer.on('statistics_info', () => {
          retryCountRef.current = 0;
          setConnectionStatus('connected');
          console.info('[VideoPlayer] player init success', { videoId, src, playType });
        });
        return;
      } catch (error) {
        console.error('flv.js 初始化失败', error);
      }
    }

    console.info('[VideoPlayer] player set src', { videoId, src, playType });
    videoEl.src = src;
    videoEl.play().catch(() => {});
  }, [accessToken, cleanupPlayer, onError, playType, scheduleRetry, src, videoId]);

  initRef.current = initPlayer;

  useEffect(() => {
    if (!src) {
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
  }, [videoId, src, playType]);

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

  const showNativeVideo = !(src.startsWith('ezopen://') || String(playType || '').toLowerCase() === 'ezopen');
  const shouldShowLogoFallback =
    connectionStatus === 'error' ||
    monitoringSummary?.main_status === 'offline' ||
    monitoringSummary?.status_tags?.includes('VIDEO_DEVICE_OFFLINE');

  const hasCachedTraffic = hasRecognizedTrafficValue(monitoringSummary);
  const usedText = hasCachedTraffic ? (monitoringSummary?.traffic_text || monitoringSummary?.weekly_used_text) : '等待识别';
  const thresholdText = monitoringSummary?.monthly_threshold_text || monitoringSummary?.weekly_quota_text || '30.00GB';
  const remainingText = monitoringSummary?.estimated_remaining_text || monitoringSummary?.weekly_remaining_text || '--';
  const updateTimeText = formatBackendLocalTime(monitoringSummary?.last_traffic_ocr_time);
  const isTrafficAlarm = monitoringSummary?.traffic_status === 'alarm';

  return (
    <div className="w-full h-full bg-black rounded-lg overflow-hidden relative">
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

      {showTrafficPanel && (
        <div
          className={`absolute bottom-4 right-4 z-10 rounded-md px-4 py-3 text-sm text-slate-100 min-w-[320px] shadow-lg border ${
            isTrafficAlarm ? 'bg-rose-950/85 border-rose-300/50' : 'bg-slate-900/82 border-cyan-200/25'
          }`}
        >
          {isTrafficAlarm && <div className="mb-2 text-[13px] font-bold text-rose-100">流量不足</div>}
          <div className="flex items-center justify-between gap-8">
            <span className="text-slate-200">已使用流量</span>
            <span className="text-base font-bold text-cyan-100">{usedText}</span>
          </div>
          <div className="flex items-center justify-between gap-8 mt-2">
            <span className="text-slate-200">流量阈值</span>
            <span className="text-base font-bold text-white">{thresholdText}</span>
          </div>
          <div className="flex items-center justify-between gap-8 mt-2">
            <span className="text-slate-200">估算剩余流量</span>
            <span className="text-base font-bold text-white">{remainingText}</span>
          </div>
          <div className="flex items-center justify-between gap-8 mt-2 text-xs">
            <span className="text-slate-300">更新时间</span>
            <span className="font-semibold text-slate-100">{updateTimeText}</span>
          </div>
          <div className="mt-2 border-t border-white/10 pt-2 text-xs text-slate-300">
            识别状态：{trafficOcrStatus}
          </div>
          <button
            type="button"
            onClick={handleRecognizeTraffic}
            disabled={!videoId || trafficRecognizing}
            className="mt-3 w-full rounded bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
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
      {shouldShowLogoFallback && (
        <ChinaRailwayLogoFallback
          onRetry={
            connectionStatus === 'error'
              ? () => {
                  retryCountRef.current = 0;
                  setConnectionStatus('connecting');
                  initPlayer();
                }
              : undefined
          }
        />
      )}
    </div>
  );
};

export default VideoPlayer;
