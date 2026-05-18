import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

// ✅ 内网穿透智能适配！
const detectBackendUrl = (): string => {
  if ((import.meta as any).env?.VITE_API_BASE_URL) return (import.meta as any).env?.VITE_API_BASE_URL;
  if (window.location.port === '3000') return '';
  return `${window.location.protocol}//${window.location.host}`;
};
const API_BASE_URL = detectBackendUrl();

interface VideoPlayerProps {
  src: string;
  playType?: string;
  accessToken?: string;
  videoId?: number;
  onError?: (error: string) => void;
}

interface MonitoringSummary {
  weekly_quota_text?: string;
  weekly_used_text?: string;
  weekly_remaining_text?: string;
  main_status?: string;
  status_tags?: string[];
}

type ConnectionStatus = 'connecting' | 'connected' | 'error';

const MAX_RETRIES = 8;
const RETRY_DELAY_MS = 1200;
const CHINA_RAILWAY_LOGO = '/images/%E5%85%AC%E5%8F%B8logo.jpeg';

const ChinaRailwayLogoFallback: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <div className="absolute inset-0 z-20 grid h-full w-full place-items-center bg-white">
    <div className="absolute inset-0 bg-white p-8">
      <img
        src={CHINA_RAILWAY_LOGO}
        alt="China Railway logo"
        className="absolute block h-auto max-h-[70%] w-auto max-w-[70%] object-contain"
        style={{ left: '50%', top: '38%', transform: 'translate(-50%, -50%)' }}
      />
    </div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
      >
        Retry
      </button>
    )}
  </div>
);

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, playType, accessToken, videoId, onError }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const flvRef = useRef<any>(null);
  const ezRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [monitoringSummary, setMonitoringSummary] = useState<MonitoringSummary | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const fetchMonitoringSummary = useCallback(async () => {
    if (!videoId) {
      setMonitoringSummary(null);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/video/${videoId}/monitoring-summary`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setMonitoringSummary({
        weekly_used_text: data?.weekly_used_text,
        weekly_quota_text: data?.weekly_quota_text,
        weekly_remaining_text: data?.weekly_remaining_text,
        main_status: data?.main_status,
        status_tags: Array.isArray(data?.status_tags) ? data.status_tags : [],
      });
    } catch {
      // ignore
    }
  }, [videoId]);

  const cleanupPlayer = useCallback(() => {
    clearRetryTimer();

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

    setMonitoringSummary(null);

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
  }, [clearRetryTimer]);

  const scheduleRetry = useCallback((reason: string) => {
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
      // 通过重置状态触发 useEffect 重建播放器
      setConnectionStatus('connecting');
      initRef.current?.();
    }, RETRY_DELAY_MS);
  }, [clearRetryTimer, onError, src]);

  const initRef = useRef<(() => void) | null>(null);

  const initPlayer = useCallback(() => {
    if (!src) return;
    cleanupPlayer();

    const isEzopen = src.startsWith('ezopen://') || String(playType || '').toLowerCase() === 'ezopen';
    const isHls = src.includes('.m3u8') || String(playType || '').toLowerCase() === 'hls';

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
                fetchMonitoringSummary();
              },
              handleError: (err: any) => {
                console.error('EZUIKit error:', err);
                scheduleRetry('ezopen 播放失败');
              },
            });
          } catch (e) {
            console.error('EZUIKit 初始化失败:', e);
            scheduleRetry('EZUIKit 初始化失败');
          }
        })
        .catch((e) => {
          console.error('ezuikit-js 加载失败:', e);
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
      fetchMonitoringSummary();
    };
    videoEl.onerror = () => {
      scheduleRetry('video 标签播放失败');
    };

    if (isHls) {
      if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
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
          hls.loadSource(src);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoEl.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data?.fatal) {
            scheduleRetry('HLS 解析失败');
          }
        });
        return;
      }

      setConnectionStatus('error');
      onError?.('当前浏览器不支持 HLS 播放');
      return;
    }

    // flv / 其他协议优先走 flv.js，失败则回退原生播放
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
          scheduleRetry('FLV 播放失败');
        });
        flvPlayer.on('statistics_info', () => {
          retryCountRef.current = 0;
          setConnectionStatus('connected');
        });
        return;
      } catch (e) {
        console.error('flv.js 初始化失败:', e);
      }
    }

    videoEl.src = src;
    videoEl.play().catch(() => {});
  }, [accessToken, cleanupPlayer, fetchMonitoringSummary, onError, playType, scheduleRetry, src]);

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
  }, [src, playType, accessToken, initPlayer, cleanupPlayer]);

  const showNativeVideo = !(src.startsWith('ezopen://') || String(playType || '').toLowerCase() === 'ezopen');
  const shouldShowLogoFallback =
    connectionStatus === 'error' ||
    monitoringSummary?.main_status === 'offline' ||
    monitoringSummary?.status_tags?.includes('VIDEO_DEVICE_OFFLINE');

  useEffect(() => {
    if (!videoId) return;
    fetchMonitoringSummary();
    const timer = setInterval(fetchMonitoringSummary, 10000);
    return () => clearInterval(timer);
  }, [videoId, fetchMonitoringSummary]);

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

      <div className="absolute bottom-2 right-2 z-10 bg-black/60 border border-cyan-300/20 rounded px-3 py-2 text-[11px] text-slate-100 min-w-[220px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-300">已使用流量</span>
          <span className="font-semibold text-cyan-200">{monitoringSummary?.weekly_used_text || '--'}</span>
        </div>
        <div className="flex items-center justify-between gap-3 mt-1">
          <span className="text-slate-300">流量阈值</span>
          <span className="font-semibold">{monitoringSummary?.weekly_quota_text || '--'}</span>
        </div>
        <div className="flex items-center justify-between gap-3 mt-1">
          <span className="text-slate-300">剩余流量</span>
          <span className="font-semibold">{monitoringSummary?.weekly_remaining_text || '--'}</span>
        </div>
      </div>

      {connectionStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center text-white p-6">
            <div className="text-lg font-semibold mb-2">视频流连接失败</div>
            <div className="text-sm text-gray-300 mb-4">请检查摄像头是否在线，或稍后重试</div>
            <button
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
