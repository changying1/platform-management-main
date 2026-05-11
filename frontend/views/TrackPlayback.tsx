import React, { useState, useEffect, useMemo } from 'react';
import { Play, Pause, Square, Download } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// API配置
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:9000";

// 类型定义
interface Device {
  device_id: string;
  name: string;
  person_name?: string;
  lat?: number;
  lng?: number;
}

interface TrajectoryPoint {
  lat: number;
  lng: number;
  timestamp: string;
  speed?: number;
  direction?: number;
}

// Helper to calculate position based on progress 0-100
const getPositionAtProgress = (path: [number, number][], progress: number): [number, number] => {
  if (path.length < 2 || progress <= 0) return path[0];
  if (progress >= 100) return path[path.length - 1];

  // Calculate total length
  const totalLength = path.reduce((acc, curr, idx) => {
    if (idx === 0) return 0;
    return acc + L.latLng(curr).distanceTo(path[idx - 1]);
  }, 0);
  
  const targetDist = (progress / 100) * totalLength;
  
  let currentDist = 0;
  for (let i = 1; i < path.length; i++) {
    const segmentDist = L.latLng(path[i]).distanceTo(path[i - 1]);
    if (currentDist + segmentDist >= targetDist) {
      const ratio = (targetDist - currentDist) / segmentDist;
      const lat = path[i-1][0] + (path[i][0] - path[i-1][0]) * ratio;
      const lng = path[i-1][1] + (path[i][1] - path[i-1][1]) * ratio;
      return [lat, lng];
    }
    currentDist += segmentDist;
  }
  return path[path.length - 1];
};

export default function TrackPlayback() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  // 设备列表和选中设备
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  
  // 轨迹数据
  const [trajectory, setTrajectory] = useState<TrajectoryPoint[]>([]);
  
  // 搜索和筛选
  const [searchQuery, setSearchQuery] = useState('');
  // 默认日期范围：最近一年
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  
  // 加载状态
  const [loading, setLoading] = useState(false);

  // 过滤后的设备列表
  const filteredDevices = useMemo(() => {
    if (!searchQuery) return devices;
    const query = searchQuery.toLowerCase();
    return devices.filter(device => 
      device.name.toLowerCase().includes(query) ||
      device.device_id.toLowerCase().includes(query) ||
      (device.person_name && device.person_name.toLowerCase().includes(query))
    );
  }, [devices, searchQuery]);

  // 获取设备列表
  useEffect(() => {
    fetch(`${API_BASE_URL}/device/devices`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setDevices(data);
        } else if (data.devices) {
          setDevices(data.devices);
        }
      })
      .catch(err => console.error('Failed to fetch devices:', err));
  }, []);

  // 获取轨迹数据
  const fetchTrajectory = (deviceId: string, hours: number = 24) => {
    setLoading(true);
    fetch(`${API_BASE_URL}/device/${deviceId}/trajectory?hours=${hours}`)
      .then(res => res.json())
      .then(data => {
        if (data.trajectory) {
          setTrajectory(data.trajectory);
          setProgress(0);
          setIsPlaying(false);
        } else if (Array.isArray(data)) {
          setTrajectory(data);
          setProgress(0);
          setIsPlaying(false);
        }
      })
      .catch(err => {
        console.error('Failed to fetch trajectory:', err);
        setTrajectory([]);
      })
      .finally(() => setLoading(false));
  };

  // 选择设备时获取轨迹
  useEffect(() => {
    if (selectedDevice) {
      // 根据日期计算小时数
      let hours = 24;
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diff = Math.abs(end.getTime() - start.getTime());
        hours = Math.ceil(diff / (1000 * 60 * 60)) || 24;
      } else if (startDate) {
        const start = new Date(startDate);
        const end = new Date();
        const diff = Math.abs(end.getTime() - start.getTime());
        hours = Math.ceil(diff / (1000 * 60 * 60)) || 24;
      }
      fetchTrajectory(selectedDevice.device_id, hours);
    }
  }, [selectedDevice, startDate, endDate]);

  // 轨迹路径点
  const polylinePositions = useMemo(() => {
    return trajectory.map(point => [point.lat, point.lng] as [number, number]);
  }, [trajectory]);

  // 当前位置
  const currentPos = useMemo(() => {
    if (polylinePositions.length === 0) return [31.2324, 121.4757] as [number, number];
    return getPositionAtProgress(polylinePositions, progress);
  }, [polylinePositions, progress]);

  // 获取当前点信息
  const currentPointInfo = useMemo(() => {
    if (trajectory.length === 0) return null;
    const index = Math.floor((progress / 100) * (trajectory.length - 1));
    return trajectory[Math.min(index, trajectory.length - 1)];
  }, [trajectory, progress]);

  // 播放循环
  useEffect(() => {
    let interval: number;
    if (isPlaying && trajectory.length > 0) {
      interval = window.setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 100;
          }
          return prev + 0.5 * playbackSpeed;
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying, trajectory.length, playbackSpeed]);

  const handleStop = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  // 默认中心位置
  const mapCenter = useMemo(() => {
    if (polylinePositions.length > 0) {
      const latSum = polylinePositions.reduce((sum, pos) => sum + pos[0], 0);
      const lngSum = polylinePositions.reduce((sum, pos) => sum + pos[1], 0);
      return [latSum / polylinePositions.length, lngSum / polylinePositions.length] as [number, number];
    }
    return [31.2324, 121.4757] as [number, number];
  }, [polylinePositions]);

  return (
    <div
      className="h-full flex flex-col gap-4 p-4 text-white"
      style={{ background: 'linear-gradient(180deg, #0b66d1 0%, #0752b0 45%, #053a85 100%)' }}
    >
      {/* Controls Bar */}
      <div className="bg-blue-900 border border-blue-800 rounded-lg p-3 flex items-center justify-between">
         <div className="flex items-center gap-4">
            {/* 设备选择 */}
            <div className="flex items-center gap-2">
              <input 
                type="text"
                placeholder="输入设备名称/ID/人员姓名搜索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-blue-800 border border-blue-700 rounded px-3 py-1.5 text-sm text-blue-50 outline-none focus:border-blue-400 min-w-[300px]"
              />
              <select 
                value={selectedDevice?.device_id || ''}
                onChange={(e) => {
                  const device = devices.find(d => d.device_id === e.target.value);
                  setSelectedDevice(device || null);
                }}
                className="bg-blue-800 border border-blue-700 rounded px-3 py-1.5 text-sm text-blue-50 outline-none focus:border-blue-400 min-w-[200px]"
              >
                <option value="">请选择设备</option>
                {filteredDevices.map(device => (
                  <option key={device.device_id} value={device.device_id}>
                    {device.name} ({device.person_name || device.device_id})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="h-8 w-[1px] bg-blue-800/60 mx-2"></div>

            {/* 日期范围 */}
            <div className="flex items-center gap-2">
               <span className="text-blue-200 text-sm">日期:</span>
               <input 
                 type="date" 
                 value={startDate}
                 onChange={(e) => setStartDate(e.target.value)}
                 className="bg-blue-800 border border-blue-700 rounded px-2 py-1 text-sm text-blue-50" 
               />
               <span className="text-blue-400">-</span>
               <input 
                 type="date" 
                 value={endDate}
                 onChange={(e) => setEndDate(e.target.value)}
                 className="bg-blue-800 border border-blue-700 rounded px-2 py-1 text-sm text-blue-50" 
               />
            </div>
         </div>

         <button className="text-blue-100 text-sm hover:text-white flex items-center gap-1">
            <Download size={16} /> 导出Excel
         </button>
      </div>

      {/* Main Map */}
      <div className="flex-1 border border-blue-800 rounded-lg relative overflow-hidden" style={{ background: '#041836' }}>
        {/* 加载提示 */}
        {loading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="text-blue-200">加载中...</div>
          </div>
        )}
        
        <MapContainer center={mapCenter} zoom={polylinePositions.length > 0 ? 15 : 10} className="w-full h-full">
           <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
           />
           
           {/* 轨迹线 */}
           {polylinePositions.length > 0 && (
             <Polyline 
               positions={polylinePositions} 
               pathOptions={{ color: '#39b0ff', weight: 4 }} 
             />
           )}
           
           {/* 起点标记 */}
           {polylinePositions.length > 0 && (
             <Marker position={polylinePositions[0]}>
               <Popup>起点</Popup>
             </Marker>
           )}
           
           {/* 终点标记 */}
           {polylinePositions.length > 0 && (
             <Marker position={polylinePositions[polylinePositions.length - 1]}>
               <Popup>终点</Popup>
             </Marker>
           )}

           {/* Moving Marker */}
           {polylinePositions.length > 0 && (
             <Marker position={currentPos} zIndexOffset={100}>
               <Popup>
                  <div className="text-xs">
                    <div>设备: {selectedDevice?.name || '-'}</div>
                    <div>人员: {selectedDevice?.person_name || '-'}</div>
                    <div>时间: {currentPointInfo?.timestamp ? new Date(currentPointInfo.timestamp).toLocaleString() : '-'}</div>
                    <div>速度: {currentPointInfo?.speed || 0} km/h</div>
                  </div>
               </Popup>
             </Marker>
           )}
        </MapContainer>

        {/* Playback Controls Overlay */}
        <div className="absolute bottom-6 left-6 right-6 bg-blue-900/70 backdrop-blur border border-blue-800 p-4 rounded-lg z-[400] flex flex-col gap-2 shadow-lg text-blue-100">
           <div className="flex justify-between text-xs text-blue-200">
              <span>{trajectory.length > 0 ? (trajectory[0]?.timestamp ? new Date(trajectory[0].timestamp).toLocaleString() : '-') : '-'}</span>
              <span>{trajectory.length > 0 ? (trajectory[trajectory.length - 1]?.timestamp ? new Date(trajectory[trajectory.length - 1].timestamp).toLocaleString() : '-') : '-'}</span>
           </div>
           <input 
              type="range" 
              min="0" 
              max="100" 
              value={progress} 
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full h-1 bg-blue-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:rounded-full"
           />
           <div className="flex items-center justify-center gap-6 mt-2">
              <button 
                onClick={handleStop}
                className="text-blue-200 hover:text-white"
              >
                <Square size={16} />
              </button>
              <button 
                 onClick={() => setIsPlaying(!isPlaying)}
                 disabled={trajectory.length === 0}
                 className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-500 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                 {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-1" />}
              </button>
              <select 
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="bg-blue-800 text-xs text-blue-100 border border-blue-700 rounded px-1 py-0.5 outline-none"
              >
                 <option value={0.5}>0.5倍</option>
                 <option value={1}>1倍</option>
                 <option value={2}>2倍</option>
                 <option value={4}>4倍</option>
              </select>
           </div>
        </div>
      </div>

      {/* 统计信息 */}
      <div className="bg-blue-900/50 border border-blue-800 rounded-lg p-3 flex items-center justify-around">
        <div className="text-center">
          <div className="text-blue-300 text-xs">轨迹点数</div>
          <div className="text-white font-bold text-lg">{trajectory.length}</div>
        </div>
        <div className="h-8 w-[1px] bg-blue-800/60"></div>
        <div className="text-center">
          <div className="text-blue-300 text-xs">当前速度</div>
          <div className="text-white font-bold text-lg">{currentPointInfo?.speed || 0} km/h</div>
        </div>
        <div className="h-8 w-[1px] bg-blue-800/60"></div>
        <div className="text-center">
          <div className="text-blue-300 text-xs">播放进度</div>
          <div className="text-white font-bold text-lg">{Math.round(progress)}%</div>
        </div>
      </div>
    </div>
  );
}
