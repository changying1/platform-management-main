import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import AMapLoader from '@amap/amap-jsapi-loader';

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || "ab3044412b12b8deb9da741c6739be1d";
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE || "65a74edbb64d47769637df170a5da117";
const OFFLINE_GAP_MS = 5 * 60 * 1000;

interface TrackPoint {
  lat: number;
  lng: number;
  time: string;
  speed?: number;
  status?: string;
  state?: string;
  online?: boolean;
  is_online?: boolean;
}

interface TrackMapProps {
  points?: TrackPoint[];
  deviceName: string;
  holder: string;
  onClose: () => void;
}

const generateContinuousTrackPoints = (): TrackPoint[] => {
  const points: TrackPoint[] = [];
  const currentLat = 34.2800;
  const currentLng = 109.1300;
  const startTime = new Date();
  startTime.setHours(7, 0, 0, 0);
  const endTime = new Date();
  endTime.setHours(19, 0, 0, 0);
  const totalSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
  const intervalSeconds = 5;
  const totalPoints = Math.floor(totalSeconds / intervalSeconds);
  const latRange = 0.012;
  const lngRange = 0.015;

  for (let i = 0; i <= totalPoints; i++) {
    const t = i / totalPoints;
    const angle = t * Math.PI * 4;
    const latOffset = Math.sin(angle) * latRange * (1 - Math.abs(t - 0.5) * 0.5);
    const lngOffset = Math.cos(angle * 0.8) * lngRange * (1 - Math.abs(t - 0.5) * 0.5);
    const hour = 7 + t * 12;
    const speedFactor = hour >= 12 && hour <= 13 ? 0.2 : hour >= 17 ? 0.6 : 1;
    const pointTime = new Date(startTime.getTime() + i * intervalSeconds * 1000);

    points.push({
      lat: currentLat + latOffset * speedFactor,
      lng: currentLng + lngOffset * speedFactor,
      time: pointTime.toISOString(),
      speed: 2 + Math.random() * 3,
    });
  }

  return points;
};

const getPointTime = (point: TrackPoint) => {
  const value = new Date(point.time).getTime();
  return Number.isNaN(value) ? 0 : value;
};

const isOfflinePoint = (point: TrackPoint) => {
  if (point.online === false || point.is_online === false) return true;
  const value = `${point.status || ''} ${point.state || ''}`.toLowerCase();
  return value.includes('offline') || value.includes('离线');
};

const sanitizeTrackPoints = (points: TrackPoint[]) => {
  return points
    .filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) && point.time)
    .map((point) => ({
      ...point,
      lat: Number(point.lat),
      lng: Number(point.lng),
      speed: point.speed === undefined ? undefined : Number(point.speed),
    }))
    .sort((a, b) => getPointTime(a) - getPointTime(b));
};

const splitTrackSegments = (points: TrackPoint[]) => {
  const segments: TrackPoint[][] = [];
  let current: TrackPoint[] = [];
  let previousOnlinePoint: TrackPoint | null = null;

  points.forEach((point) => {
    if (isOfflinePoint(point)) {
      if (current.length) segments.push(current);
      current = [];
      previousOnlinePoint = null;
      return;
    }

    const currentTime = getPointTime(point);
    const previousTime = previousOnlinePoint ? getPointTime(previousOnlinePoint) : 0;
    if (previousOnlinePoint && currentTime && previousTime && currentTime - previousTime > OFFLINE_GAP_MS) {
      if (current.length) segments.push(current);
      current = [];
    }

    current.push(point);
    previousOnlinePoint = point;
  });

  if (current.length) segments.push(current);
  return segments;
};

const formatTime = (timeStr: string) => {
  const date = new Date(timeStr);
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatDateTime = (timeStr: string) => {
  const date = new Date(timeStr);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const createPointInfoContent = (point: TrackPoint, index: number) => {
  return `
    <div style="min-width: 150px; color: #0f172a; font-size: 12px; line-height: 1.7;">
      <div style="font-weight: 700; margin-bottom: 2px;">轨迹点 ${index + 1}</div>
      <div>时间：${formatDateTime(point.time)}</div>
    </div>
  `;
};

export const TrackMap: React.FC<TrackMapProps> = ({
  points: propPoints,
  deviceName,
  holder,
  onClose,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const amapRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);

  const trackPoints = useMemo(() => {
    const rawPoints = propPoints && propPoints.length > 0 ? propPoints : generateContinuousTrackPoints();
    return sanitizeTrackPoints(rawPoints);
  }, [propPoints]);

  const trackSegments = useMemo(() => splitTrackSegments(trackPoints), [trackPoints]);
  const totalDuration = useMemo(() => {
    const start = trackPoints[0] ? getPointTime(trackPoints[0]) : 0;
    const end = trackPoints[trackPoints.length - 1] ? getPointTime(trackPoints[trackPoints.length - 1]) : 0;
    if (!start || !end || end <= start) return trackPoints.length * 5 / 60;
    return (end - start) / 60000;
  }, [trackPoints]);
  const progressPercent = trackPoints.length <= 1 ? 100 : (currentPointIndex / (trackPoints.length - 1)) * 100;
  const thumbLabelPercent = Math.max(4, Math.min(96, progressPercent));

  useEffect(() => {
    if (currentPointIndex > trackPoints.length - 1) {
      setCurrentPointIndex(Math.max(0, trackPoints.length - 1));
    }
  }, [currentPointIndex, trackPoints.length]);

  useEffect(() => {
    let cancelled = false;
    const initMap = async () => {
      if (!mapContainerRef.current || mapRef.current || trackPoints.length === 0) return;
      try {
        if (!(window as any)._AMapSecurityConfig) {
          (window as any)._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE };
        }
        const AMap = await AMapLoader.load({ key: AMAP_KEY, version: "2.0" });
        if (cancelled) return;

        amapRef.current = AMap;
        const centerLat = trackPoints.reduce((sum, point) => sum + point.lat, 0) / trackPoints.length;
        const centerLng = trackPoints.reduce((sum, point) => sum + point.lng, 0) / trackPoints.length;

        mapRef.current = new AMap.Map(mapContainerRef.current, {
          zoom: 16,
          zooms: [10, 18],
          center: [centerLng, centerLat],
          viewMode: "2D",
          layers: [
            new AMap.TileLayer.Satellite(),
            new AMap.TileLayer.RoadNet(),
          ],
        });

        setMapReady(true);
      } catch (error) {
        console.error("AMap init failed", error);
      }
    };

    initMap();
    return () => {
      cancelled = true;
      if (mapRef.current && mapRef.current.destroy) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !amapRef.current || trackPoints.length === 0) return;

    const AMap = amapRef.current;
    const map = mapRef.current;

    if ((map as any)._trackInfoWindow) {
      (map as any)._trackInfoWindow.close();
    }
    if ((map as any)._trackOverlays) {
      (map as any)._trackOverlays.forEach((overlay: any) => map.remove(overlay));
    }
    (map as any)._trackOverlays = [];

    const infoWindow = new AMap.InfoWindow({
      offset: new AMap.Pixel(0, -12),
      closeWhenClickMap: true,
    });
    (map as any)._trackInfoWindow = infoWindow;

    trackSegments.forEach((segment) => {
      if (segment.length < 2) return;
      const polyline = new AMap.Polyline({
        path: segment.map((point) => [point.lng, point.lat]),
        strokeColor: "#3b82f6",
        strokeWeight: 3,
        strokeOpacity: 0.85,
      });
      map.add(polyline);
      (map as any)._trackOverlays.push(polyline);
    });

    const startPoint = trackPoints[0];
    const startMarker = new AMap.Marker({
      position: [startPoint.lng, startPoint.lat],
      content: `<div style="width: 22px; height: 22px; background: #22c55e; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 10px; color: white; font-weight: bold;">始</div>`,
      offset: new AMap.Pixel(-11, -11),
      title: `起点 ${formatDateTime(startPoint.time)}`,
    });
    map.add(startMarker);
    (map as any)._trackOverlays.push(startMarker);

    const endPoint = trackPoints[trackPoints.length - 1];
    const endMarker = new AMap.Marker({
      position: [endPoint.lng, endPoint.lat],
      content: `<div style="width: 22px; height: 22px; background: #ef4444; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 10px; color: white; font-weight: bold;">终</div>`,
      offset: new AMap.Pixel(-11, -11),
      title: `终点 ${formatDateTime(endPoint.time)}`,
    });
    map.add(endMarker);
    (map as any)._trackOverlays.push(endMarker);

    const step = Math.max(1, Math.floor(trackPoints.length / 80));
    for (let i = 0; i < trackPoints.length; i += step) {
      const point = trackPoints[i];
      const marker = new AMap.Marker({
        position: [point.lng, point.lat],
        content: `<div style="width: 7px; height: 7px; background: #f59e0b; border-radius: 50%; border: 1px solid white; box-shadow: 0 0 7px rgba(245,158,11,.65);"></div>`,
        offset: new AMap.Pixel(-4, -4),
        title: formatDateTime(point.time),
      });
      marker.on('mouseover', () => {
        infoWindow.setContent(createPointInfoContent(point, i));
        infoWindow.open(map, [point.lng, point.lat]);
      });
      marker.on('mouseout', () => infoWindow.close());
      map.add(marker);
      (map as any)._trackOverlays.push(marker);
    }
  }, [mapReady, trackPoints, trackSegments]);

  useEffect(() => {
    if (isPlaying && trackPoints.length > 0) {
      timerRef.current = setInterval(() => {
        setCurrentPointIndex((prev) => {
          if (prev >= trackPoints.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / playSpeed);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, playSpeed, trackPoints.length]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !amapRef.current) return;

    const AMap = amapRef.current;
    const map = mapRef.current;

    if ((map as any)._movingMarker) {
      map.remove((map as any)._movingMarker);
    }

    const point = trackPoints[currentPointIndex];
    if (!point) return;

    const movingMarker = new AMap.Marker({
      position: [point.lng, point.lat],
      content: `<div style="width: 32px; height: 32px; background: #3b82f6; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; animation: pulse 1s infinite;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        </svg>
      </div>`,
      offset: new AMap.Pixel(-16, -32),
      title: formatDateTime(point.time),
    });
    map.add(movingMarker);
    (map as any)._movingMarker = movingMarker;
    map.setCenter([point.lng, point.lat], true);
  }, [currentPointIndex, mapReady, trackPoints]);

  const seekToIndex = (index: number) => {
    if (!trackPoints.length) return;
    setCurrentPointIndex(Math.max(0, Math.min(trackPoints.length - 1, index)));
  };

  const handleProgressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    seekToIndex(Number(event.target.value));
  };

  const currentPoint = trackPoints[currentPointIndex];

  return (
    <div className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-sm flex flex-col">
      <div className="flex justify-between items-center p-4 border-b border-cyan-400/30 bg-slate-900/50">
        <div>
          <h3 className="text-xl font-bold text-white">轨迹回放</h3>
          <p className="text-sm text-slate-400">{holder} - {deviceName}</p>
          <p className="text-xs text-slate-500">
            轨迹点: {trackPoints.length}个 | 分段: {trackSegments.length}段 | 时长: {totalDuration.toFixed(0)}分钟
          </p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg">
          <X size={20} className="text-slate-400" />
        </button>
      </div>

      <div ref={mapContainerRef} className="flex-1 w-full" />

      <div className="p-4 border-t border-cyan-400/30 bg-slate-900/50">
        <div className="mb-3">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>轨迹进度</span>
            <span>{trackPoints.length ? currentPointIndex + 1 : 0} / {trackPoints.length}</span>
          </div>
          <div className="relative flex h-6 items-center">
            <div className="absolute left-0 right-0 h-2 rounded-full bg-slate-700" />
            <div
              className="absolute left-0 h-2 rounded-full bg-cyan-500"
              style={{ width: `${progressPercent}%` }}
            />
            <input
              type="range"
              min={0}
              max={Math.max(0, trackPoints.length - 1)}
              step={1}
              value={currentPointIndex}
              onChange={handleProgressChange}
              onPointerDown={() => setIsPlaying(false)}
              disabled={trackPoints.length <= 1}
              className="relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-lg [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-cyan-400"
              aria-label="拖动轨迹进度"
            />
          </div>
          <div className="relative mt-1 h-5 text-xs text-slate-500">
            <span>{trackPoints[0] ? formatTime(trackPoints[0].time) : ''}</span>
            {currentPoint && (
              <span
                className="absolute top-0 -translate-x-1/2 text-cyan-200"
                style={{ left: `${thumbLabelPercent}%` }}
              >
                {formatTime(currentPoint.time)}
              </span>
            )}
            <span className="absolute right-0 top-0">{trackPoints[trackPoints.length - 1] ? formatTime(trackPoints[trackPoints.length - 1].time) : ''}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 text-white">
          <button onClick={() => seekToIndex(0)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">⏮</button>
          <button onClick={() => seekToIndex(currentPointIndex - 10)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">◀◀ 10点</button>
          <button onClick={() => seekToIndex(currentPointIndex - 1)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">◀ 1点</button>
          <button onClick={() => setIsPlaying(!isPlaying)} className={`px-5 py-2 rounded-full font-medium ${isPlaying ? 'bg-yellow-500' : 'bg-cyan-500'} text-white`}>
            {isPlaying ? '⏸ 暂停' : '▶ 播放'}
          </button>
          <button onClick={() => seekToIndex(currentPointIndex + 1)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">1点 ▶</button>
          <button onClick={() => seekToIndex(currentPointIndex + 10)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">10点 ▶▶</button>
          <button onClick={() => seekToIndex(trackPoints.length - 1)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">⏭</button>

          <select value={playSpeed} onChange={(e) => setPlaySpeed(Number(e.target.value))} className="px-2 py-1.5 bg-slate-700 rounded-lg text-sm">
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
            <option value={8}>8x</option>
            <option value={16}>16x</option>
            <option value={32}>32x</option>
          </select>
        </div>

        <div className="mt-3 text-center text-xs text-slate-400">
          {currentPoint && (
            <>当前时间: {formatDateTime(currentPoint.time)}</>
          )}
        </div>
      </div>
    </div>
  );
};
