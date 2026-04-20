import React, { useState, useEffect } from 'react';
import { X, MapPin, Clock, Play, Navigation, ChevronDown } from 'lucide-react';

interface Device {
  device_id: string;
  name: string;
  holder: string;
  holderPhone?: string;
  lat?: number;
  lng?: number;
  status?: string;
}

interface TrajectoryPoint {
  lat: number;
  lng: number;
  timestamp: string;
  speed?: number;
  direction?: number;
}

interface TrajectoryResponse {
  device_id: string;
  trajectory: TrajectoryPoint[];
}

interface TrajectoryPlaybackProps {
  onSelectDevice: (deviceId: string, trajectory: TrajectoryPoint[]) => void;
  onClose: () => void;
}

export const TrajectoryPlayback: React.FC<TrajectoryPlaybackProps> = ({
  onSelectDevice,
  onClose,
}) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:9000';

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/device/devices`);
      if (!response.ok) {
        throw new Error('获取设备列表失败');
      }
      const data = await response.json();
      const devicesWithLocation = data.filter((d: Device) => d.lat && d.lng);
      setDevices(devicesWithLocation);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取设备列表失败');
      console.error('获取设备列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTrajectory = async (device: Device) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/device/${device.device_id}/trajectory?hours=${hours}`
      );
      if (!response.ok) {
        throw new Error('获取轨迹数据失败');
      }
      const data: TrajectoryResponse = await response.json();

      if (!data.trajectory || data.trajectory.length === 0) {
        setError(`设备 ${device.name} 在选定时间段内没有轨迹数据`);
        setLoading(false);
        return;
      }

      // 直接在当前地图上显示轨迹
      onSelectDevice(device.device_id, data.trajectory);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取轨迹数据失败');
      console.error('获取轨迹失败:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute top-24 right-4 z-30 bg-slate-900/95 backdrop-blur-xl border border-blue-400/30 rounded-xl shadow-2xl w-80">
      {/* 头部 */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Navigation size={16} className="text-blue-400" />
          <span className="text-sm font-semibold text-white">轨迹回放</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
          >
            <ChevronDown
              size={16}
              className={`transition-transform ${isExpanded ? '' : '-rotate-180'}`}
            />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* 时间选择 */}
          <div className="p-3 border-b border-slate-700">
            <div className="flex items-center gap-2 text-slate-300">
              <Clock size={14} className="text-cyan-400" />
              <span className="text-xs">时间范围：</span>
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="bg-slate-800 text-white rounded px-2 py-1 border border-slate-600 focus:border-cyan-400 focus:outline-none text-xs"
              >
                <option value={1}>最近1小时</option>
                <option value={6}>最近6小时</option>
                <option value={12}>最近12小时</option>
                <option value={24}>最近24小时</option>
              </select>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mx-3 mt-2 p-2 bg-red-500/20 border border-red-500/30 rounded text-xs text-red-400">
              {error}
            </div>
          )}

          {/* 设备列表 */}
          <div className="max-h-[300px] overflow-auto p-2">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-2"></div>
                <p className="text-xs">加载中...</p>
              </div>
            ) : devices.length === 0 ? (
              <div className="text-center py-6 text-slate-500">
                <MapPin size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-xs">暂无可用设备</p>
              </div>
            ) : (
              <div className="space-y-1">
                {devices.map((device) => (
                  <button
                    key={device.device_id}
                    onClick={() => loadTrajectory(device)}
                    className="w-full flex items-center justify-between p-2 bg-slate-800/50 hover:bg-slate-700 rounded-lg transition-all text-left"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-cyan-400" />
                      <div>
                        <div className="text-xs text-white font-medium">{device.name}</div>
                        <div className="text-[10px] text-slate-400">{device.holder}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          device.status === 'online' ? 'bg-green-400' : 'bg-slate-500'
                        }`}
                      />
                      <Play size={12} className="text-cyan-400" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 底部提示 */}
          <div className="p-2 border-t border-slate-700 bg-slate-800/30">
            <p className="text-[10px] text-slate-500 text-center">
              点击设备在当前地图播放轨迹
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default TrajectoryPlayback;
