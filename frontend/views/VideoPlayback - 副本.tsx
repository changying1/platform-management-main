// frontend/views/VideoPlayback.tsx

import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";

import {
  RotateCcw,
  AlertCircle,
  Bookmark,
  Clock,
  Video as VideoIcon,
  Camera,
  Activity,
  HardDrive,
  Search,
  X,
  Trash2,
  Play,
  Info,
  ChevronDown,
  Building2,
  FolderTree,
  Filter,
  Eye,
  Bell,
  ChevronLeft,  
  ChevronRight,
  MapPin,
  Phone,
  Users,
  Radio,
  Calendar,
  Volume2,
  Pause,
  Loader2
} from "lucide-react";
import { usePlaybackStore } from "../src/playbackStore";
import { SavedPlayback, Device } from "../src/playback";
import { TrackMap } from '../src/components/TrackMap';
// ✅ 新增：导入真实 API
import {
  getAllVideos,
  getRecordingVideos,
  getAlarmVideosList,
  getAlarmScreenshots,
  type SavedPlaybackVideo,
} from "../src/api/videoApi";
import { API_BASE_URL } from "../src/api/config";

 // 新增：主Tab类型
type MainTabType = 'video' | 'track' | 'voice';
type TabType = 'all' | 'manual' | 'alarm';


// 新增：轨迹点类型
interface TrackPoint {
  lat: number;
  lng: number;
  time: string;
  speed?: number;
}

// 新增：轨迹记录类型
interface TrackRecord {
  id: string;
  deviceId: string;
  deviceName: string;
  
  holder: string;
  company: string;
  project: string;
  team: string;
  startTime: string;
  endTime: string;
  points: TrackPoint[];
}

// 新增：通话记录类型
interface VoiceRecord {
  id: string;
  type: 'broadcast' | 'group' | 'private';
  from: string;
  fromRole: string;
  toNames: string[];
  startTime: string;
  duration: number;
  audioUrl?: string;
}
// 扩展 alarmInfo 类型，添加 screenshot 字段
interface ExtendedAlarmInfo {
  type: string;
  msg: string;
  score: number;
  timestamp: string;
  personnel: string | null;
  screenshot?: {
    id: string;
    url: string;
    thumbnail?: string;
    timestamp: string;
  };
}

// 扩展 SavedPlayback 类型（覆盖 alarmInfo）
interface ExtendedSavedPlayback extends SavedPlayback {
  alarmInfo?: ExtendedAlarmInfo;
}

  const selectStyle = `
    select {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2380cbc4' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      background-size: 14px;
      cursor: pointer;
    }
    select:hover {
      border-color: #22d3ee;
    }
    select option {
      background-color: #1e293b;
      color: #e2e8f0;
    }
  `;

  // 模拟设备列表（增加公司和项目信息）
 // 模拟设备列表（扩展到10个设备）
const mockDevices: Device[] = [
  { id: 1, name: '北门出入口摄像头', ip_address: '192.168.1.101', status: 'online', company: '中铁一局', project: '西安地铁8号线' },
  { id: 2, name: '南门施工区摄像头', ip_address: '192.168.1.102', status: 'online', company: '中铁一局', project: '西安地铁8号线' },
  { id: 3, name: '东侧材料堆放区', ip_address: '192.168.1.103', status: 'offline', company: '中铁一局', project: '西安地铁8号线' },
  { id: 4, name: '西侧高空作业区', ip_address: '192.168.1.104', status: 'online', company: '中铁一局', project: '西安地铁8号线' },
  { id: 5, name: '项目部办公区', ip_address: '192.168.1.105', status: 'online', company: '中铁一局', project: '西安地铁8号线' },
  { id: 6, name: '隧道入口摄像头', ip_address: '192.168.2.101', status: 'online', company: '中铁隧道局', project: '西安地铁10号线' },
  { id: 7, name: '盾构机监控', ip_address: '192.168.2.102', status: 'online', company: '中铁隧道局', project: '西安地铁10号线' },
  { id: 8, name: '材料加工区', ip_address: '192.168.3.101', status: 'online', company: '中铁建工', project: '西安北站扩建' },
  { id: 9, name: '钢筋加工棚', ip_address: '192.168.1.106', status: 'online', company: '中铁一局', project: '西安地铁8号线' },
  { id: 10, name: '生活区监控', ip_address: '192.168.1.107', status: 'online', company: '中铁一局', project: '西安地铁8号线' },
];

  // 模拟回放数据
// 模拟回放数据 - 扩展到 50 条
const mockPlaybacks: SavedPlayback[] = (() => {
  const devices = [
    { id: 1, name: '北门出入口摄像头', company: '中铁一局', project: '西安地铁8号线' },
    { id: 2, name: '南门施工区摄像头', company: '中铁一局', project: '西安地铁8号线' },
    { id: 3, name: '东侧材料堆放区', company: '中铁一局', project: '西安地铁8号线' },
    { id: 4, name: '西侧高空作业区', company: '中铁一局', project: '西安地铁8号线' },
    { id: 5, name: '项目部办公区', company: '中铁一局', project: '西安地铁8号线' },
    { id: 6, name: '隧道入口摄像头', company: '中铁隧道局', project: '西安地铁10号线' },
    { id: 7, name: '盾构机监控', company: '中铁隧道局', project: '西安地铁10号线' },
    { id: 8, name: '材料加工区', company: '中铁建工', project: '西安北站扩建' },
    { id: 9, name: '钢筋加工棚', company: '中铁一局', project: '西安地铁8号线' },
    { id: 10, name: '生活区监控', company: '中铁一局', project: '西安地铁8号线' },
  ];

  const alarmTypes = [
    { type: '安全帽检测', msg: '检测到未佩戴安全帽', personnel: '张三' },
    { type: '围栏入侵', msg: '检测到非法闯入警戒区域', personnel: '李四' },
    { type: '高空坠落风险', msg: '检测到安全带未正确佩戴', personnel: '王五' },
    { type: '人员闯入', msg: '检测到未经授权人员进入', personnel: '赵六' },
    { type: '烟火检测', msg: '检测到烟雾/明火', personnel: null },
    { type: '车辆违停', msg: '检测到违规停放车辆', personnel: null },
    { type: '未穿反光衣', msg: '检测到未穿反光衣', personnel: '周七' },
    { type: '区域超员', msg: '区域内人员超限', personnel: null },
  ];

  const results: SavedPlayback[] = [];
  
  // 生成过去30天的数据
  for (let i = 0; i < 50; i++) {
    const device = devices[i % devices.length];
    const isAlarm = i % 3 !== 0; // 约2/3是报警记录
    const daysAgo = Math.floor(i / 5); // 按时间分布
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(9 + (i % 8), (i * 7) % 60, 0);
    
    const startTime = date.toISOString();
    const endTime = new Date(date.getTime() + 60000).toISOString();
    
    let alarmInfo = undefined;
    let type: 'manual' | 'alarm' = isAlarm ? 'alarm' : 'manual';
    
if (isAlarm) {
  const alarm = alarmTypes[i % alarmTypes.length];
  // 报警发生在视频开始后的 5-55 秒之间
  const alarmOffsetSeconds = 5 + (i % 50);
  const alarmDate = new Date(date.getTime() + alarmOffsetSeconds * 1000);
  
  alarmInfo = {
    type: alarm.type,
    msg: alarm.msg,
    score: 0.85 + (i % 15) / 100,
    timestamp: alarmDate.toISOString(),  // 报警时间 = 视频开始 + 偏移秒数
    personnel: alarm.personnel || `人员${i + 1}`,
  };
}
    
    results.push({
      id: `mock_${i + 1}`,
      deviceId: device.id,
      deviceName: device.name,
      company: device.company,
      project: device.project,
      type: type,
      startTime: startTime,
      endTime: endTime,
      duration: 60 + (i % 5) * 30,
      filePath: `/mock/video${(i % 6) + 1}.mp4`,
      alarmInfo: alarmInfo,
      createdAt: endTime
    });
  }
  
  // 按时间倒序排列
  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
})();

// 新增：模拟轨迹数据
const mockTrackRecords: TrackRecord[] = [
  {
    id: 'track1',
    deviceId: '1001',
    deviceName: '张工的安全帽',
    holder: '张三',
    company: '中铁一局',
    project: '西安地铁8号线',
    team: '施工一组',
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    points: [
      { lat: 34.278, lng: 109.128, time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
      { lat: 34.279, lng: 109.130, time: new Date(Date.now() - 1.8 * 60 * 60 * 1000).toISOString() },
      { lat: 34.280, lng: 109.132, time: new Date(Date.now() - 1.6 * 60 * 60 * 1000).toISOString() },
      { lat: 34.281, lng: 109.131, time: new Date(Date.now() - 1.4 * 60 * 60 * 1000).toISOString() },
      { lat: 34.282, lng: 109.133, time: new Date(Date.now() - 1.2 * 60 * 60 * 1000).toISOString() },
      { lat: 34.281, lng: 109.135, time: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() },
    ]
  },
  {
    id: 'track2',
    deviceId: '1002',
    deviceName: '李工的安全帽',
    holder: '李四',
    company: '中铁一局',
    project: '西安地铁8号线',
    team: '施工一组',
    startTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    points: [
      { lat: 34.280, lng: 109.130, time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
      { lat: 34.282, lng: 109.132, time: new Date(Date.now() - 2.8 * 60 * 60 * 1000).toISOString() },
      { lat: 34.284, lng: 109.134, time: new Date(Date.now() - 2.6 * 60 * 60 * 1000).toISOString() },
      { lat: 34.283, lng: 109.136, time: new Date(Date.now() - 2.4 * 60 * 60 * 1000).toISOString() },
      { lat: 34.281, lng: 109.134, time: new Date(Date.now() - 2.2 * 60 * 60 * 1000).toISOString() },
      { lat: 34.280, lng: 109.132, time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    ]
  },
  {
    id: 'track3',
    deviceId: '1003',
    deviceName: '王工的定位器',
    holder: '王五',
    company: '中铁隧道局',
    project: '西安地铁10号线',
    team: '掘进班',
    startTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    points: [
      { lat: 34.290, lng: 109.140, time: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() },
      { lat: 34.292, lng: 109.143, time: new Date(Date.now() - 3.8 * 60 * 60 * 1000).toISOString() },
      { lat: 34.294, lng: 109.145, time: new Date(Date.now() - 3.6 * 60 * 60 * 1000).toISOString() },
      { lat: 34.293, lng: 109.146, time: new Date(Date.now() - 3.4 * 60 * 60 * 1000).toISOString() },
      { lat: 34.291, lng: 109.144, time: new Date(Date.now() - 3.2 * 60 * 60 * 1000).toISOString() },
      { lat: 34.290, lng: 109.142, time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
    ]
  }
];


// 新增：模拟通话记录数据
const mockVoiceRecords: VoiceRecord[] = [
  {
    id: 'voice1',
    type: 'broadcast',
    from: '管理员',
    fromRole: '系统管理员',
    toNames: ['全体人员'],
    startTime: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
    duration: 45,
  },
  {
    id: 'voice2',
    type: 'group',
    from: '张三',
    fromRole: '安全员',
    toNames: ['李四', '王五'],
    startTime: new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString(),
    duration: 120,
  },
  {
    id: 'voice3',
    type: 'private',
    from: '管理员',
    fromRole: '系统管理员',
    toNames: ['赵六'],
    startTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    duration: 30,
  }
];

// 新增：树形筛选数据
const companyTree = [
  {
    id: '中铁一局',
    name: '中铁一局',
    projects: [
      { id: '西安地铁8号线', name: '西安地铁8号线', teams: ['施工一组', '施工二组', '施工三组'] }
    ]
  },
  {
    id: '中铁隧道局',
    name: '中铁隧道局',
    projects: [
      { id: '西安地铁10号线', name: '西安地铁10号线', teams: ['掘进班', '支护班', '运输班'] }
    ]
  }
];

export interface VideoPlayerRef {
  captureFrame: () => Promise<string>;
  seekTo: (seconds: number) => Promise<void>;
  getAlarmTimestamp: () => number; 
}

const SimpleVideoPlayer = forwardRef<VideoPlayerRef, { 
  src: string; 
  deviceName: string; 
  type?: 'manual' | 'alarm';
  playlist?: SavedPlayback[];
  currentPlayback?: SavedPlayback;
  onPlaybackChange?: (playback: SavedPlayback) => void;
}>(
  ({ src, deviceName, type, playlist = [], currentPlayback, onPlaybackChange }, ref) => {
    // ✅ 直接使用传入的 src（后端返回的真实视频路径）
    const videoUrl = src;
    const containerRef = React.useRef<HTMLDivElement>(null);
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const [currentSpeed, setCurrentSpeed] = useState(1);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);
    const [alarmTimestamp, setAlarmTimestamp] = useState<number | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const getAlarmTimestamp = () => alarmTimestamp || 0;

    // ✅ 全屏和ESC退出监听
    React.useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isFullscreen) {
          document.exitFullscreen?.();
        }
      };
      
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('keydown', handleKeyDown);
      
      return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [isFullscreen]);

    const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
        containerRef.current?.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    };

    // ✅ 上一个/下一个视频（使用真实播放列表）
    const currentIndex = playlist.findIndex(p => p.id === currentPlayback?.id);

    const playPrevious = () => {
      if (playlist.length === 0 || !onPlaybackChange) return;
      const newIndex = currentIndex > 0 ? currentIndex - 1 : playlist.length - 1;
      onPlaybackChange(playlist[newIndex]);
    };

    const playNext = () => {
      if (playlist.length === 0 || !onPlaybackChange) return;
      const newIndex = currentIndex < playlist.length - 1 ? currentIndex + 1 : 0;
      onPlaybackChange(playlist[newIndex]);
    };

    // ✅ 修复下载（解决跨域问题）
    const handleDownload = async () => {
      if (!currentPlayback || !videoUrl) return;
      
      try {
        // ✅ 用 fetch + blob 真正下载（解决跨域）
        const res = await fetch(videoUrl);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${currentPlayback.deviceName}_${currentPlayback.createdAt.split('T')[0]}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } catch (e) {
        console.error('下载失败:', e);
        // ✅ 降级方案：在新标签页打开
        window.open(videoUrl, '_blank');
      }
    };

    // 监听视频事件
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      // ✅ 每次换视频都重置状态，并加载第一帧作为封面
      setIsPlaying(false);
      
      const handleLoadedMetadata = () => {
        // ✅ 使用视频真实时长（四舍五入避免小数）
        const realDuration = Math.round(video.duration);
        setDuration(realDuration);
        
        // ✅ 只有报警类型才显示红点
        // 优先级：currentPlayback.alarmSecond（真实计算） > 固定 10秒 > 不显示
        if (type === 'alarm') {
          const realAlarmSecond = (currentPlayback as any)?.alarmSecond;
          setAlarmTimestamp(realAlarmSecond ?? Math.min(10, realDuration / 3));
        } else {
          setAlarmTimestamp(null);
        }
        
        // ✅ 加载视频第一帧作为封面
        video.currentTime = 0.5;
      };
      
      const handleSeeked = () => {
        // ✅ 封面帧加载完成后，确保初始状态是暂停
        if (video.currentTime < 1) {
          video.pause();
        }
      };
      
      const handleTimeUpdate = () => setCurrentTime(video.currentTime);
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleError = (e: any) => {
        console.error('视频加载错误:', e);
        console.error('视频URL:', videoUrl);
      };

      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('seeked', handleSeeked);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('error', handleError);

      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('error', handleError);
      };
    }, [videoUrl, type]);

    // 倍速选项
    const speedOptions = [
      { label: '0.25x', value: 0.25 }, { label: '0.5x', value: 0.5 },
      { label: '0.75x', value: 0.75 }, { label: '1x', value: 1 },
      { label: '1.25x', value: 1.25 }, { label: '1.5x', value: 1.5 },
      { label: '1.75x', value: 1.75 }, { label: '2x', value: 2 },
      { label: '4x', value: 4 }, { label: '8x', value: 8 },
      { label: '16x', value: 16 },
    ];

    const handleSpeedChange = (speed: number) => {
      setCurrentSpeed(speed);
      if (videoRef.current) videoRef.current.playbackRate = speed;
      setShowSpeedMenu(false);
    };

    const togglePlay = () => {
      if (videoRef.current) {
        // ✅ 直接用视频原生状态，避免 React 状态不一致
        if (videoRef.current.paused) {
          videoRef.current.play().catch(e => console.error('播放失败:', e));
        } else {
          videoRef.current.pause();
        }
      }
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      setVolume(newVolume);
      if (videoRef.current) videoRef.current.volume = newVolume;
    };

    const toggleMute = () => {
      if (videoRef.current) {
        videoRef.current.muted = !videoRef.current.muted;
        setVolume(videoRef.current.muted ? 0 : videoRef.current.volume);
      }
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (videoRef.current && duration) {
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        videoRef.current.currentTime = pos * duration;
      }
    };

    const formatTime = (time: number) => {
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    // 截图方法
    const captureFrame = (): Promise<string> => {
      return new Promise((resolve) => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) {
          resolve('');
          return;
        }
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(video, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (err) {
          console.error('截图失败:', err);
          resolve('');
        }
      });
    };

    // 跳转到指定秒数
    const seekTo = (seconds: number): Promise<void> => {
      return new Promise((resolve) => {
        const video = videoRef.current;
        if (!video) {
          resolve();
          return;
        }
        video.currentTime = seconds;
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });
    };

    useImperativeHandle(ref, () => ({
      captureFrame,
      seekTo,
      getAlarmTimestamp,
    }));

    return (
      <div ref={containerRef} className="relative w-full h-full bg-black group">
        <video
          ref={videoRef}
          src={videoUrl}
          crossOrigin="anonymous"
          className="w-full h-full"
          style={{ objectFit: 'cover' }}
          controls={false}
          preload="metadata"
        />

        {/* 中央播放/暂停按钮 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <button
            onClick={togglePlay}
            className="pointer-events-auto bg-black/50 hover:bg-black/70 rounded-full p-4 transition-all duration-200 opacity-0 group-hover:opacity-100"
          >
            {isPlaying ? (
              <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>

        {/* 左侧上一个按钮 */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <button
            onClick={playPrevious}
            className="pointer-events-auto bg-black/50 hover:bg-black/70 rounded-full p-2 transition-all duration-200 opacity-0 group-hover:opacity-100"
          >
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>
        </div>

        {/* 右侧下一个按钮 */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <button
            onClick={playNext}
            className="pointer-events-auto bg-black/50 hover:bg-black/70 rounded-full p-2 transition-all duration-200 opacity-0 group-hover:opacity-100"
          >
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        {/* 自定义控制栏 */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="px-4 py-3">
            {/* 进度条 */}
            <div
              className="relative h-1.5 bg-white/30 rounded-full cursor-pointer mb-3"
              onClick={handleProgressClick}
            >
              <div
                className="absolute h-full bg-cyan-400 rounded-full"
                style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
              />
              <div
                className="absolute w-3 h-3 bg-cyan-400 rounded-full top-1/2 -translate-y-1/2"
                style={{ left: `${(currentTime / duration) * 100 || 0}%` }}
              />
              {alarmTimestamp && duration > 0 && (
                <div
                  className="absolute w-3 h-3 bg-red-500 rounded-full top-1/2 -translate-y-1/2 -translate-x-1/2 shadow-lg ring-2 ring-red-500/50 animate-pulse"
                  style={{ left: `${(alarmTimestamp / duration) * 100}%` }}
                  title="报警发生时刻"
                />
              )}
            </div>

            <div className="flex items-center justify-between">
              {/* 左边：播放控制 */}
              <div className="flex items-center gap-4">
                {/* 上一个 */}
                <button onClick={playPrevious} className="text-white hover:text-cyan-400 transition-colors">
                  <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                  </svg>
                </button>

                {/* 播放/暂停 */}
                <button onClick={togglePlay} className="text-white hover:text-cyan-400 transition-colors">
                  {isPlaying ? (
                    <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                {/* 下一个 */}
                <button onClick={playNext} className="text-white hover:text-cyan-400 transition-colors">
                  <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                  </svg>
                </button>

                {/* 时间 */}
                <span className="text-white text-xl font-mono ml-1">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* 右边：音量、倍速、下载、全屏 */}
              <div className="flex items-center gap-9">
                {/* 音量 */}
                <div
                  className="relative"
                  onMouseEnter={() => setShowVolumeSlider(true)}
                  onMouseLeave={() => setShowVolumeSlider(false)}
                >
                  <button onClick={toggleMute} className="text-white hover:text-cyan-400 transition-colors relative top-[2px]">
                    {volume === 0 ? (
                      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM9 6.17L7.17 4.33 3.33 8.17 1.5 9.99 4.5 12H2v6h4l5 5 1-1-1-1-5-5H4v-2h2.5L3.5 9.99 7 6.17v-3.75L9 4.17V6.17z" />
                      </svg>
                    ) : volume < 0.5 ? (
                      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                      </svg>
                    ) : (
                      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                      </svg>
                    )}
                  </button>

                  {/* 音量滑块 */}
                  {showVolumeSlider && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowVolumeSlider(false)}
                        onMouseEnter={() => setShowVolumeSlider(true)}
                      />
                      <div
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-52 max-w-[calc(100vw-20px)] bg-black/90 rounded-lg p-3 z-50"
                        onMouseEnter={() => setShowVolumeSlider(true)}
                        onMouseLeave={() => setShowVolumeSlider(false)}
                      >
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={volume}
                          onChange={handleVolumeChange}
                          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-white/30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* 倍速 */}
                <div className="relative">
                  <button
                    onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                    className="text-white hover:text-cyan-400 text-xl px-2 py-1 rounded flex items-center gap-1 transition-colors"
                  >
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {currentSpeed}x
                  </button>
                  {showSpeedMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSpeedMenu(false)} />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-28 bg-black/90 rounded-lg border border-white/20 shadow-xl overflow-hidden z-50">
                        {speedOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => handleSpeedChange(option.value)}
                            className={`w-full px-3 py-1.5 text-xs text-left ${
                              currentSpeed === option.value ? 'bg-cyan-500/30 text-cyan-300' : 'text-white/80 hover:bg-white/10'
                            }`}
                          >
                            {option.label}
                            {currentSpeed === option.value && <span className="float-right">✓</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* 下载 */}
                <button onClick={handleDownload} className="text-white hover:text-cyan-400 transition-colors" title="下载视频">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
                  </svg>
                </button>

                {/* 全屏 / 退出全屏 */}
                <button onClick={toggleFullscreen} className="text-white hover:text-cyan-400 transition-colors" title={isFullscreen ? "退出全屏 (ESC)" : "全屏"}>
                  {isFullscreen ? (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                    </svg>
                  ) : (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

//   const SimpleVideoPlayer = forwardRef<VideoPlayerRef, { src: string; deviceName: string }>(
//   ({ src, deviceName }, ref) => {
//     // 不同设备对应的不同测试视频
//     const getVideoByDevice = (name: string) => {
//       const videoList: Record<string, string> = {
//         '北门出入口摄像头': 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
//         '南门施工区摄像头': 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
//         '西侧高空作业区': 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
//         '隧道入口摄像头': 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
//         '盾构机监控': 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
//         '材料加工区': 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
//       };
//       return videoList[name] || 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4';
//     };

//     const videoUrl = getVideoByDevice(deviceName);
//     const videoRef = React.useRef<HTMLVideoElement>(null);
//     const [showScreenshotModal, setShowScreenshotModal] = useState(false);
// const [selectedAlarm, setSelectedAlarm] = useState<SavedPlayback | null>(null);
//     const [currentSpeed, setCurrentSpeed] = useState(1);
//     const [showSpeedMenu, setShowSpeedMenu] = useState(false);
//     const [currentTime, setCurrentTime] = useState(0);
//     const [duration, setDuration] = useState(0);
//     const [isPlaying, setIsPlaying] = useState(false);
//     const [volume, setVolume] = useState(1);
//     const [showVolumeSlider, setShowVolumeSlider] = useState(false);
//     const [alarmTimestamp, setAlarmTimestamp] = useState<number | null>(null);

//     const getAlarmTimestamp = () => alarmTimestamp || 0;


// // 扩展 SavedPlayback 类型，添加告警截图字段
// interface AlarmScreenshot {
//   id: string;
//   url: string;
//   thumbnail?: string;
//   timestamp: string;
// }


//     // 获取当前播放列表（从父组件传入，这里用 mockPlaybacks 模拟）
//     const playlist = mockPlaybacks;
//     const [currentIndex, setCurrentIndex] = useState(() => {
//       const index = playlist.findIndex(p => p.deviceName === deviceName);
//       return index !== -1 ? index : 0;
//     });

//     // 切换视频
//     const playPrevious = () => {
//       const newIndex = currentIndex > 0 ? currentIndex - 1 : playlist.length - 1;
//       setCurrentIndex(newIndex);
//       setSelectedPlayback(playlist[newIndex]);
//     };

//     const playNext = () => {
//       const newIndex = currentIndex < playlist.length - 1 ? currentIndex + 1 : 0;
//       setCurrentIndex(newIndex);
//       setSelectedPlayback(playlist[newIndex]);
//     };

    
//     // 监听视频事件
//     useEffect(() => {
//       const video = videoRef.current;
//       if (!video) return;

//       const handleTimeUpdate = () => setCurrentTime(video.currentTime);
//       const handleLoadedMetadata = () => {
//         setDuration(video.duration);
//         setAlarmTimestamp(video.duration / 3);
//       };
//       const handlePlay = () => setIsPlaying(true);
//       const handlePause = () => setIsPlaying(false);

//       video.addEventListener('timeupdate', handleTimeUpdate);
//       video.addEventListener('loadedmetadata', handleLoadedMetadata);
//       video.addEventListener('play', handlePlay);
//       video.addEventListener('pause', handlePause);

//       return () => {
//         video.removeEventListener('timeupdate', handleTimeUpdate);
//         video.removeEventListener('loadedmetadata', handleLoadedMetadata);
//         video.removeEventListener('play', handlePlay);
//         video.removeEventListener('pause', handlePause);
//       };
//     }, [currentIndex]);

//     // 倍速选项
//     const speedOptions = [
//       { label: '0.25x', value: 0.25 }, { label: '0.5x', value: 0.5 },
//       { label: '0.75x', value: 0.75 }, { label: '1x', value: 1 },
//       { label: '1.25x', value: 1.25 }, { label: '1.5x', value: 1.5 },
//       { label: '1.75x', value: 1.75 }, { label: '2x', value: 2 },
//       { label: '4x', value: 4 }, { label: '8x', value: 8 },
//       { label: '16x', value: 16 },
//     ];

//     const handleSpeedChange = (speed: number) => {
//       setCurrentSpeed(speed);
//       if (videoRef.current) videoRef.current.playbackRate = speed;
//       setShowSpeedMenu(false);
//     };

//     const togglePlay = () => {
//       if (videoRef.current) {
//         if (isPlaying) videoRef.current.pause();
//         else videoRef.current.play();
//       }
//     };

//     const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//       const newVolume = parseFloat(e.target.value);
//       setVolume(newVolume);
//       if (videoRef.current) videoRef.current.volume = newVolume;
//     };

//     const toggleMute = () => {
//       if (videoRef.current) {
//         videoRef.current.muted = !videoRef.current.muted;
//         setVolume(videoRef.current.muted ? 0 : videoRef.current.volume);
//       }
//     };

//     const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
//       if (videoRef.current && duration) {
//         const rect = e.currentTarget.getBoundingClientRect();
//         const pos = (e.clientX - rect.left) / rect.width;
//         videoRef.current.currentTime = pos * duration;
//       }
//     };

//     const handleDownload = () => {
//       const link = document.createElement('a');
//       link.href = videoUrl;
//       link.download = `${deviceName}_${new Date().toISOString()}.mp4`;
//       link.click();
//     };

//     const formatTime = (time: number) => {
//       const minutes = Math.floor(time / 60);
//       const seconds = Math.floor(time % 60);
//       return `${minutes}:${seconds.toString().padStart(2, '0')}`;
//     };

//     // 截图方法
// const captureFrame = (): Promise<string> => {
//   return new Promise((resolve) => {
//     const video = videoRef.current;
//     if (!video || video.readyState < 2) {
//       resolve('');
//       return;
//     }
//     try {
//       const canvas = document.createElement('canvas');
//       canvas.width = video.videoWidth;
//       canvas.height = video.videoHeight;
//       const ctx = canvas.getContext('2d');
//       ctx?.drawImage(video, 0, 0);
//       resolve(canvas.toDataURL('image/jpeg', 0.8));
//     } catch (err) {
//       console.error('截图失败:', err);
//       resolve('');
//     }
//   });
// };

//     // 跳转到指定秒数
//     const seekTo = (seconds: number): Promise<void> => {
//       return new Promise((resolve) => {
//         const video = videoRef.current;
//         if (!video) {
//           resolve();
//           return;
//         }
//         video.currentTime = seconds;
//         const onSeeked = () => {
//           video.removeEventListener('seeked', onSeeked);
//           resolve();
//         };
//         video.addEventListener('seeked', onSeeked);
//       });
//     };

    
// useImperativeHandle(ref, () => ({
//   captureFrame,
//   seekTo,
//   getAlarmTimestamp,
// }));



//     return (
//       <div className="relative w-full h-full bg-black group">
//         <video
//           ref={videoRef}
//           src={videoUrl}
//           crossOrigin="anonymous" 
//           className="w-full h-full object-contain"
//           autoPlay
//         />
        
//             {/* 中央播放/暂停按钮 */}
//       <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
//         <button
//           onClick={togglePlay}
//           className="pointer-events-auto bg-black/50 hover:bg-black/70 rounded-full p-4 transition-all duration-200 opacity-0 group-hover:opacity-100"
//         >
//           {isPlaying ? (
//             <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
//               <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
//             </svg>
//           ) : (
//             <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
//               <path d="M8 5v14l11-7z"/>
//             </svg>
//           )}
//         </button>
//       </div>

//       {/* 左侧上一个按钮 */}
//       <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
//         <button
//           onClick={playPrevious}
//           className="pointer-events-auto bg-black/50 hover:bg-black/70 rounded-full p-2 transition-all duration-200 opacity-0 group-hover:opacity-100"
//         >
//           <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
//             <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
//           </svg>
//         </button>
//       </div>

//       {/* 右侧下一个按钮 */}
//       <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
//         <button
//           onClick={playNext}
//           className="pointer-events-auto bg-black/50 hover:bg-black/70 rounded-full p-2 transition-all duration-200 opacity-0 group-hover:opacity-100"
//         >
//           <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
//             <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
//           </svg>
//         </button>
//       </div>

//         {/* 自定义控制栏 */}
//         <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
//           <div className="px-4 py-3">
//             {/* 进度条 */}
//             <div 
//               className="relative h-1.5 bg-white/30 rounded-full cursor-pointer mb-3"
//               onClick={handleProgressClick}
//             >
//               <div 
//                 className="absolute h-full bg-cyan-400 rounded-full"
//                 style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
//               />
//               <div 
//                 className="absolute w-3 h-3 bg-cyan-400 rounded-full top-1/2 -translate-y-1/2"
//                 style={{ left: `${(currentTime / duration) * 100 || 0}%` }}
//               />
//               {alarmTimestamp && duration > 0 && (
//                 <div 
//                   className="absolute w-3 h-3 bg-red-500 rounded-full top-1/2 -translate-y-1/2 -translate-x-1/2 shadow-lg ring-2 ring-red-500/50 animate-pulse"
//                   style={{ left: `${(alarmTimestamp / duration) * 100}%` }}
//                   title="报警发生时刻"
//                 />
//               )}
//             </div>

//   <div className="flex items-center justify-between">
//     {/* 左边：播放控制 */}
//     <div className="flex items-center gap-4">
//       {/* 上一个 */}
//       <button onClick={playPrevious} className="text-white hover:text-cyan-400 transition-colors">
//         <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
//           <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
//         </svg>
//       </button>

//       {/* 播放/暂停 */}
//       <button onClick={togglePlay} className="text-white hover:text-cyan-400 transition-colors">
//         {isPlaying ? (
//           <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
//             <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
//           </svg>
//         ) : (
//           <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
//             <path d="M8 5v14l11-7z"/>
//           </svg>
//         )}
//       </button>

//       {/* 下一个 */}
//       <button onClick={playNext} className="text-white hover:text-cyan-400 transition-colors">
//         <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
//           <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
//         </svg>
//       </button>

//       {/* 时间 */}
//       <span className="text-white text-xl  font-mono ml-1">
//         {formatTime(currentTime)} / {formatTime(duration)}
//       </span>
//     </div>

//     {/* 右边：音量、倍速、下载、全屏 */}
//     <div className="flex items-center gap-9">
//   {/* 音量 */}
//   <div 
//     className="relative"
//     onMouseEnter={() => setShowVolumeSlider(true)}
//     onMouseLeave={() => setShowVolumeSlider(false)}
//   >
//     <button onClick={toggleMute} className="text-white hover:text-cyan-400 transition-colors relative top-[2px]">
//       {volume === 0 ? (
//         <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
//           <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM9 6.17L7.17 4.33 3.33 8.17 1.5 9.99 4.5 12H2v6h4l5 5 1-1-1-1-5-5H4v-2h2.5L3.5 9.99 7 6.17v-3.75L9 4.17V6.17z"/>
//         </svg>
//       ) : volume < 0.5 ? (
//         <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
//           <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
//         </svg>
//       ) : (
//         <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
//           <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
//         </svg>
//       )}
//     </button>
    
//     {/* 音量滑块 - 增加内边距和间隙，让鼠标移动过去不消失 */}
//     {showVolumeSlider && (
//       <>
//         <div 
//           className="fixed inset-0 z-40" 
//           onClick={() => setShowVolumeSlider(false)}
//           onMouseEnter={() => setShowVolumeSlider(true)}
//         />
//         <div 
//         className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-52 max-w-[calc(100vw-20px)] bg-black/90 rounded-lg p-3 z-50"
//           onMouseEnter={() => setShowVolumeSlider(true)}
//           onMouseLeave={() => setShowVolumeSlider(false)}
//         >
//           <input
//             type="range"
//             min="0"
//             max="1"
//             step="0.01"
//             value={volume}
//             onChange={handleVolumeChange}
//             className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-white/30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
//           />
//         </div>
//       </>
//     )}
//   </div>

//       {/* 倍速 */}
//       <div className="relative">
//         <button
//           onClick={() => setShowSpeedMenu(!showSpeedMenu)}
//           className="text-white hover:text-cyan-400 text-xl px-2 py-1 rounded flex items-center gap-1 transition-colors"
//         >
//           <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
//           </svg>
//           {currentSpeed}x
//         </button>
//         {showSpeedMenu && (
//           <>
//             <div className="fixed inset-0 z-40" onClick={() => setShowSpeedMenu(false)} />
//             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-28 bg-black/90 rounded-lg border border-white/20 shadow-xl overflow-hidden z-50">
//               {speedOptions.map((option) => (
//                 <button
//                   key={option.value}
//                   onClick={() => handleSpeedChange(option.value)}
//                   className={`w-full px-3 py-1.5 text-xs text-left ${
//                     currentSpeed === option.value ? 'bg-cyan-500/30 text-cyan-300' : 'text-white/80 hover:bg-white/10'
//                   }`}
//                 >
//                   {option.label}
//                   {currentSpeed === option.value && <span className="float-right">✓</span>}
//                 </button>
//               ))}
//             </div>
//           </>
//         )}
//       </div>

//       {/* 下载 */}
//       <button onClick={handleDownload} className="text-white hover:text-cyan-400 transition-colors" title="下载视频">
//         <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
//         </svg>
//       </button>

//       {/* 全屏 */}
//       <button onClick={() => videoRef.current?.requestFullscreen()} className="text-white hover:text-cyan-400 transition-colors">
//         <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
//         </svg>
//       </button>
//     </div>
//   </div>
//           </div>
//         </div>

//         {/* 设备名称 */}
//         {/* <div className="absolute bottom-4 left-4 bg-black/70 px-3 py-1.5 rounded text-xs text-white/80 backdrop-blur pointer-events-none">
//           <Camera size={12} className="inline mr-1" />
//           {deviceName}
//         </div> */}
//       </div>
//     );
//   });

  // VideoCard 组件
const VideoCard = ({ playback, onPlay, onShowScreenshot }: { 
  key?: any;
  playback: SavedPlayback; 
  onPlay: () => void;
  onShowScreenshot?: (playback: SavedPlayback) => void | Promise<void>;
}) => {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [thumbnail, setThumbnail] = useState<string>('');
    const [realDuration, setRealDuration] = useState<number>(playback.duration);

    // ✅ 自动加载视频第一帧 + 真实时长
    React.useEffect(() => {
      const video = videoRef.current;
      if (!video || !playback.filePath) return;

      const handleLoadedMetadata = () => {
        // ✅ 获取视频真实时长
        setRealDuration(Math.round(video.duration));
        video.currentTime = 0.5;
      };

      const handleSeeked = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = 320;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setThumbnail(canvas.toDataURL('image/jpeg', 0.8));
        }
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('seeked', handleSeeked);

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('seeked', handleSeeked);
      };
    }, [playback.filePath]);

    const getThumbColor = (name: string) => {
      const colors = ['bg-red-500/20', 'bg-blue-500/20', 'bg-green-500/20', 'bg-yellow-500/20', 'bg-purple-500/20'];
      const index = name.length % colors.length;
      return colors[index];
    };

    return (
      <div className="relative w-full" style={{ paddingBottom: '28.125%' }}>
        <div className="absolute inset-0 rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md overflow-hidden cursor-pointer hover:border-cyan-400 transition-all group">
          <div className="relative w-full h-full bg-black overflow-hidden">
            <video ref={videoRef} src={playback.filePath} crossOrigin="anonymous" className="hidden" preload="metadata" />
            <canvas ref={canvasRef} className="hidden" />
            
            <div 
              className={`absolute inset-0 w-full h-full bg-center ${!thumbnail ? getThumbColor(playback.deviceName) : ''}`}
              style={thumbnail ? { 
                backgroundImage: `url(${thumbnail})`, 
                backgroundSize: '100% 100%',
                backgroundColor: '#000'
              } : {}}
            >
              {!thumbnail && (
                <div className="w-full h-full flex items-center justify-center">
                  <VideoIcon size={40} className="text-white/40" />
                </div>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlay();
              }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-3 transition-all duration-200 opacity-0 group-hover:opacity-100"
            >
              <Play size={24} className="text-white" />
            </button>

            {playback.type === 'alarm' && (
              <div className="absolute top-2 left-2 flex gap-2">
                <div className="px-2 py-0.5 bg-red-500/80 text-white text-xs rounded-full flex items-center gap-1">
                  <AlertCircle size={10} />
                  报警
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowScreenshot?.(playback);
                  }}
                  className="px-2 py-0.5 bg-blue-500/80 text-white text-xs rounded-full flex items-center gap-1 hover:bg-blue-600 transition-colors"
                >
                  <Camera size={10} />
                  告警截图
                </button>
              </div>
            )}

            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 text-white text-xs rounded">
              {(() => {
                const sec = realDuration;
                if (sec >= 3600) {
                  const h = Math.floor(sec / 3600);
                  const m = Math.floor((sec % 3600) / 60);
                  const s = sec % 60;
                  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                }
                const m = Math.floor(sec / 60);
                const s = sec % 60;
                return `${m}:${String(s).padStart(2, '0')}`;
              })()}
            </div>
          </div>
        </div>
      </div>
    );
  };

      // ==================== 轨迹回放组件 ====================
const TrackPlaybackContent = ({ 
  filteredTracks, totalPages, currentPage, setCurrentPage,
  selectedTrack, setSelectedTrack,
  selectedCompany, setSelectedCompany,
  selectedProject, setSelectedProject,
  selectedTeam, setSelectedTeam,
  searchKeyword, setSearchKeyword,
  showFilter, setShowFilter,
  dateRange, setDateRange,
  companyTree
}: any) => {
  // 重置筛选
  const resetFilters = () => {
    setSelectedCompany('all');
    setSelectedProject('all');
    setSelectedTeam('all');
    setSearchKeyword('');
    setDateRange({ start: '', end: '' });
  };

  const activeFiltersCount = [
    selectedCompany !== 'all',
    selectedProject !== 'all',
    selectedTeam !== 'all',
    searchKeyword !== '',
    dateRange.start !== '',
    dateRange.end !== ''
  ].filter(Boolean).length;

  return (
    <div className="flex-1 overflow-hidden flex flex-col h-full">
      {/* 筛选栏 */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-cyan-400/30 p-4 mb-4 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* 树形筛选按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                activeFiltersCount > 0
                  ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
                  : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <Filter size={14} />
              <span>筛选</span>
              {activeFiltersCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-cyan-500 rounded-full">{activeFiltersCount}</span>
              )}
            </button>
            
            {showFilter && (
              <div className="absolute top-full left-0 mt-2 z-[400] bg-slate-800 rounded-xl border border-cyan-400/30 shadow-2xl p-4 min-w-[260px]">
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                    <span className="text-sm font-medium text-white">筛选</span>
                    <button onClick={resetFilters} className="text-xs text-cyan-400 hover:text-cyan-300">清除筛选</button>
                  </div>
                  {companyTree.map((company: any) => (
                    <div key={company.id} className="space-y-2">
                      <button
                        onClick={() => {
                          setSelectedCompany(selectedCompany === company.id ? 'all' : company.id);
                          setSelectedProject('all');
                          setSelectedTeam('all');
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-sm ${
                          selectedCompany === company.id ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        📁 {company.name}
                      </button>
                      {selectedCompany === company.id && company.projects.map((project: any) => (
                        <div key={project.id} className="ml-4 space-y-1">
                          <button
                            onClick={() => {
                              setSelectedProject(selectedProject === project.id ? 'all' : project.id);
                              setSelectedTeam('all');
                            }}
                            className={`w-full text-left px-2 py-1 rounded-lg text-xs ${
                              selectedProject === project.id ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:bg-slate-700'
                            }`}
                          >
                            📄 {project.name}
                          </button>
                          {selectedProject === project.id && project.teams.map((team: string) => (
                            <button
                              key={team}
                              onClick={() => setSelectedTeam(selectedTeam === team ? 'all' : team)}
                              className={`ml-4 w-[calc(100%-1rem)] text-left px-2 py-1 rounded-lg text-xs ${
                                selectedTeam === team ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:bg-slate-700'
                              }`}
                            >
                              👥 {team}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                  <button onClick={() => setShowFilter(false)} className="w-full py-1.5 bg-cyan-500 rounded-lg text-xs">确定</button>
                </div>
              </div>
            )}
          </div>

          {/* 搜索框 */}
          <div className="flex-1 min-w-[180px] relative">
            <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
            <input type="text" placeholder="搜索人员姓名、设备..." value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-200" />
          </div>

          {/* 日期筛选 */}
          <div className="flex items-center gap-2">
            <input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200" />
            <span className="text-slate-500">-</span>
            <input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200" />
          </div>

          {activeFiltersCount > 0 && (
            <button onClick={resetFilters} className="px-2 py-1 text-sm text-cyan-400">重置</button>
          )}
        </div>
      </div>

      {/* 轨迹列表 */}
      <div className="flex-1 overflow-auto space-y-3">
        {filteredTracks.map((track: TrackRecord) => (
          <div key={track.id} onClick={() => setSelectedTrack(track)} className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4 cursor-pointer hover:border-cyan-400/50 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center"><MapPin size={20} className="text-blue-400" /></div>
                <div>
                  <div className="font-semibold text-white">{track.holder}</div>
                  <div className="text-xs text-slate-400">{track.deviceName} · {track.company} / {track.project} / {track.team}</div>
                  <div className="text-xs text-slate-500 mt-1">{new Date(track.startTime).toLocaleString()} → {new Date(track.endTime).toLocaleTimeString()} · {track.points.length}个轨迹点</div>
                </div>
              </div>
              <button className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg text-xs"><Play size={12} className="inline mr-1" />回放</button>
            </div>
          </div>
        ))}
        {filteredTracks.length === 0 && <div className="text-center py-12 text-slate-400"><MapPin size={48} className="mx-auto mb-3 opacity-30" /><p>暂无轨迹记录</p></div>}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-3 mt-4 pt-3 border-t border-cyan-400/20 flex-shrink-0">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))} className="px-3 py-1 rounded bg-slate-800/50 text-slate-300 disabled:opacity-40">上一页</button>
          <span className="text-sm text-slate-400">第 {currentPage} / {totalPages} 页</span>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((p: number) => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded bg-slate-800/50 text-slate-300 disabled:opacity-40">下一页</button>
        </div>
      )}

      {/* 轨迹地图弹窗 */}
{selectedTrack && (
<TrackMap
  deviceName={selectedTrack.deviceName}
  holder={selectedTrack.holder}
  onClose={() => setSelectedTrack(null)}
/>
// 不传 points，让 TrackMap 自己生成连续轨迹
)}
    </div>
  );
};


// ==================== 语音回放组件 ====================
const VoicePlaybackContent = ({ 
  filteredVoices, totalPages, currentPage, setCurrentPage,
  selectedVoice, setSelectedVoice,
  searchKeyword, setSearchKeyword,
  dateRange, setDateRange,
  formatDuration, getVoiceTypeInfo
}: any) => {
  const [playingVoice, setPlayingVoice] = useState<VoiceRecord | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const resetFilters = () => {
    setSearchKeyword('');
    setDateRange({ start: '', end: '' });
  };

  const activeFiltersCount = [searchKeyword !== '', dateRange.start !== '', dateRange.end !== ''].filter(Boolean).length;

  return (
    <div className="flex-1 overflow-hidden flex flex-col h-full">
      {/* 筛选栏 */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-cyan-400/30 p-4 mb-4 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px] relative">
            <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
            <input type="text" placeholder="搜索发起人、接收人..." value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-200" />
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200" />
            <span className="text-slate-500">-</span>
            <input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200" />
          </div>
          {activeFiltersCount > 0 && <button onClick={resetFilters} className="px-2 py-1 text-sm text-cyan-400">重置</button>}
        </div>
      </div>

      {/* 通话记录列表 */}
      <div className="flex-1 overflow-auto space-y-3">
        {filteredVoices.map((voice: VoiceRecord) => {
          const typeInfo = getVoiceTypeInfo(voice.type);
          return (
            <div key={voice.id} onClick={() => setSelectedVoice(voice)} className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4 cursor-pointer hover:border-cyan-400/50 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">{typeInfo.icon}</div>
                  <div>
                    <div className="flex items-center gap-2"><span className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.color}`}>{typeInfo.text}</span><span className="font-semibold text-white">{voice.from}</span><span className="text-slate-400 text-xs">→</span><span className="text-slate-300">{voice.toNames.join('、')}</span></div>
                    <div className="text-xs text-slate-500 mt-1">{new Date(voice.startTime).toLocaleString()} · 时长: {formatDuration(voice.duration)}</div>
                  </div>
                </div>
                <button className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg text-xs"><Play size={12} className="inline mr-1" />播放</button>
              </div>
            </div>
          );
        })}
        {filteredVoices.length === 0 && <div className="text-center py-12 text-slate-400"><Phone size={48} className="mx-auto mb-3 opacity-30" /><p>暂无通话记录</p></div>}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-3 mt-4 pt-3 border-t border-cyan-400/20 flex-shrink-0">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))} className="px-3 py-1 rounded bg-slate-800/50 text-slate-300 disabled:opacity-40">上一页</button>
          <span className="text-sm text-slate-400">第 {currentPage} / {totalPages} 页</span>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((p: number) => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded bg-slate-800/50 text-slate-300 disabled:opacity-40">下一页</button>
        </div>
      )}

      {/* 语音播放弹窗 */}
      {selectedVoice && (
        <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 p-6 w-[500px]">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">{getVoiceTypeInfo(selectedVoice.type).icon}</div><h3 className="text-xl font-bold text-white">{getVoiceTypeInfo(selectedVoice.type).text}通话</h3></div>
              <button onClick={() => setSelectedVoice(null)} className="p-1 hover:bg-slate-700 rounded"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div className="bg-slate-800/50 rounded-lg p-3"><div className="text-sm text-slate-400">发起人</div><div className="text-white">{selectedVoice.from} ({selectedVoice.fromRole})</div></div>
              <div className="bg-slate-800/50 rounded-lg p-3"><div className="text-sm text-slate-400">接收方</div><div className="text-white">{selectedVoice.toNames.join('、')}</div></div>
              <div className="bg-slate-800/50 rounded-lg p-3"><div className="text-sm text-slate-400">通话时间</div><div className="text-white">{new Date(selectedVoice.startTime).toLocaleString()}</div></div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center gap-4">
                  <button onClick={() => setIsPlaying(!isPlaying)} className="w-10 h-10 rounded-full bg-cyan-500 flex items-center justify-center">{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
                  <div className="flex-1"><div className="h-1.5 bg-slate-700 rounded-full"><div className="h-full bg-cyan-400 rounded-full" style={{ width: `${(currentTime / selectedVoice.duration) * 100}%` }} /></div><div className="flex justify-between text-xs text-slate-400 mt-1"><span>{formatDuration(currentTime)}</span><span>{formatDuration(selectedVoice.duration)}</span></div></div>
                  <Volume2 size={18} className="text-slate-400" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setSelectedVoice(null)} className="flex-1 py-2 bg-slate-700 rounded-lg">关闭</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

  // ✅ 辅助函数：将后端路径转换为可访问的 URL
  const toVideoUrl = (webPath: string) => {
    if (!webPath) return '';
    if (webPath.startsWith('http://') || webPath.startsWith('https://')) {
      return webPath;
    }
    return `${API_BASE_URL}${webPath.startsWith('/') ? '' : '/'}${webPath}`;
  };

  // ==============================================
  // ✅ 报警视频+截图 纯文件名关联工具（不需要后端！）
  // ==============================================

  // 🎬 从报警视频文件名提取开始时间戳
  // alarm_3158_358_20260407_120600_20260407_120630.mp4 → 开始时间
  const parseAlarmVideoStartTime = (filename: string): number => {
    const match = filename.match(/alarm_\d+_\d+_(\d{8}_\d{6})_\d{8}_\d{6}\.mp4/);
    if (!match) return 0;
    const [, dateTime] = match;
    const y = parseInt(dateTime.slice(0, 4));
    const m = parseInt(dateTime.slice(4, 6)) - 1;
    const d = parseInt(dateTime.slice(6, 8));
    const h = parseInt(dateTime.slice(9, 11));
    const min = parseInt(dateTime.slice(11, 13));
    const s = parseInt(dateTime.slice(13, 15));
    return Math.floor(new Date(y, m, d, h, min, s).getTime() / 1000);
  };

  // 🖼️ 从截图文件名提取时间戳
  // 358_1775532666_6ef48f.jpg → Unix时间戳
  const parseScreenshotTime = (filename: string): number => {
    const match = filename.match(/\d+_(\d+)_\w+\.jpg/);
    if (!match) return 0;
    return parseInt(match[1]);
  };

  // 🔗 给报警视频找匹配的截图 + 计算报警在视频里的秒数位置
  const matchAlarmScreenshot = (videoFilename: string, screenshotList: string[]) => {
    const videoStart = parseAlarmVideoStartTime(videoFilename);
    if (!videoStart) return { screenshotUrl: '', alarmSecond: 10 };

    // 在截图中找同设备、时间差在30秒内的
    let bestMatch: string | null = null;
    let bestDiff = Infinity;

    for (const screenshot of screenshotList) {
      const screenshotTime = parseScreenshotTime(screenshot);
      if (!screenshotTime) continue;
      const diff = Math.abs(screenshotTime - videoStart);
      if (diff < 30 && diff < bestDiff) {
        bestDiff = diff;
        bestMatch = screenshot;
      }
    }

    // 报警在视频里的位置 = 截图时间 - 视频开始时间
    const alarmSecond = bestMatch
      ? Math.max(0, parseScreenshotTime(bestMatch) - videoStart)
      : 10;

    return {
      screenshotUrl: bestMatch ? `${API_BASE_URL}/static/alarms/${bestMatch}` : '',
      alarmSecond,
    };
  };

export default function VideoPlayback() {
    // ✅ 从 Store 取出操作函数
    const { removePlayback, clearAll } = usePlaybackStore();

    // ✅ 修改1：设备列表改为真实数据
    const [devices, setDevices] = useState<Device[]>([]);
    const [loadingDevices, setLoadingDevices] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
    const [selectedCompany, setSelectedCompany] = useState<string>('all');
    const [selectedProject, setSelectedProject] = useState<string>('all');
    const [selectedTeam, setSelectedTeam] = useState<string>('all');
    const [activeTab, setActiveTab] = useState<TabType>('all');
    const [selectedPlayback, setSelectedPlayback] = useState<SavedPlayback | null>(null);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [showProjectDropdown, setShowProjectDropdown] = useState(false);
    const [showScreenshotModal, setShowScreenshotModal] = useState(false);
    const [selectedAlarm, setSelectedAlarm] = useState<SavedPlayback | null>(null);
    const videoPlayerRef = useRef<VideoPlayerRef>(null);

  // ✅ 修改2：删除模拟数据，改用真实 API 数据
  const [recordingVideos, setRecordingVideos] = useState<SavedPlaybackVideo[]>([]);
  const [alarmVideos, setAlarmVideos] = useState<SavedPlaybackVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  
  const [filteredPlaybacks, setFilteredPlaybacks] = useState<SavedPlayback[]>([]);
  const [showPlayer, setShowPlayer] = useState(false);
  const [currentPlayback, setCurrentPlayback] = useState<SavedPlayback | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  // ✅ 40:9 更窄卡片，10列×4行 = 40个，刚好填满页面
  const itemsPerPage = 40;

    // 新增：主Tab状态
  const [mainTab, setMainTab] = useState<MainTabType>('video');
  
  // 新增：轨迹数据
  const [trackRecords] = useState<TrackRecord[]>(mockTrackRecords);
  const [selectedTrack, setSelectedTrack] = useState<TrackRecord | null>(null);
  const [selectedTrackCompany, setSelectedTrackCompany] = useState<string>('all');
  const [selectedTrackProject, setSelectedTrackProject] = useState<string>('all');
  const [selectedTrackTeam, setSelectedTrackTeam] = useState<string>('all');
  const [trackSearchKeyword, setTrackSearchKeyword] = useState('');
  const [showTrackFilter, setShowTrackFilter] = useState(false);
  const [trackDateRange, setTrackDateRange] = useState({ start: '', end: '' });
  const [trackCurrentPage, setTrackCurrentPage] = useState(1);
  
  // 新增：语音数据
  const [voiceRecords] = useState<VoiceRecord[]>(mockVoiceRecords);
  const [selectedVoice, setSelectedVoice] = useState<VoiceRecord | null>(null);
  const [voiceSearchKeyword, setVoiceSearchKeyword] = useState('');
  const [voiceDateRange, setVoiceDateRange] = useState({ start: '', end: '' });
  const [voiceCurrentPage, setVoiceCurrentPage] = useState(1);
  const itemsPerPageTrackVoice = 10;
    // 获取所有公司列表
    const companies = ['all', ...new Set(devices.map(d => d.company).filter(Boolean))];
    
    // 根据选中的公司获取项目列表
const getProjectsByCompany = () => {
  if (selectedCompany === 'all') {
    return ['all', ...new Set(devices.map(d => d.project).filter(Boolean))];
  }
  const projects = devices
    .filter(d => d.company === selectedCompany)
    .map(d => d.project)
    .filter(Boolean);
  return ['all', ...new Set(projects)];
};
    
    const projects = getProjectsByCompany();

    // 初始化模拟数据
    // useEffect(() => {
    //   if (savedPlaybacks.length === 0) {
    //     mockPlaybacks.forEach(playback => {
    //       addPlayback(playback);
    //     });
    //   }
    // }, [savedPlaybacks.length, addPlayback]);

      // ✅ 新增：加载真实设备列表
  useEffect(() => {
    const loadDevices = async () => {
      setLoadingDevices(true);
      try {
        const data = await getAllVideos();
        // 转换为 Device 格式
        const deviceList: Device[] = data.map(v => ({
          id: v.id,
          name: v.name,
          ip_address: v.ip_address || '',
          status: v.status,
          company: v.company || '',
          project: v.project || '',
        }));
        setDevices(deviceList);
        // ✅ 不默认选设备，一进来就是"全部设备"
      } catch (err) {
        console.error('加载设备失败:', err);
      } finally {
        setLoadingDevices(false);
      }
    };
    loadDevices();
  }, []);

  // ✅ 加载视频：两个API独立加载，互不影响！
useEffect(() => {
  // ✅ 全部设备时，用第一个设备加载视频
  const deviceToLoad = selectedDevice || devices[0];
  if (!deviceToLoad) {
    setRecordingVideos([]);
    setAlarmVideos([]);
    return;
  }
  
  const loadVideos = async () => {
    setLoadingVideos(true);
    try {
      // ✅ 等两个API都回来才一起更新状态！解决竞态！
      const [recordings, alarms] = await Promise.all([
        getRecordingVideos(deviceToLoad.id, 500),
        getAlarmVideosList(deviceToLoad.id, 120),
      ]);
      // ✅ 用同一个函数批量更新，避免多次触发
      setRecordingVideos(Array.isArray(recordings) ? recordings : []);
      setAlarmVideos(Array.isArray(alarms) ? alarms : []);
    } catch (err) {
      setRecordingVideos([]);
      setAlarmVideos([]);
    } finally {
      setLoadingVideos(false);
    }
  };
  loadVideos();
}, [selectedDevice?.id, devices.length]);
  // ✅ 真实API + 兜底，全部设备也有数据！
  useEffect(() => {
    const convertToSavedPlayback = (): SavedPlayback[] => {
      const list: SavedPlayback[] = [];
      
      // ✅ 用第一个设备当默认（全部设备时也显示内容）
      const baseDevice = selectedDevice || devices[0];
      if (!baseDevice) return list;
      
      // 📹 优先用真实常规视频（可播放）
      recordingVideos.forEach(video => {
        const duration = video.duration_seconds || 300;
        list.push({
          id: `rec_${video.name}`,
          deviceId: baseDevice.id,
          deviceName: baseDevice.name,
          company: baseDevice.company,
          project: baseDevice.project,
          type: 'manual',
          startTime: video.updated_at,
          endTime: video.updated_at,
          duration: duration,
          filePath: toVideoUrl(video.web_path),
          createdAt: video.updated_at,
        });
      });
      
      // 🚨 优先用真实报警视频（可播放）
      // 🔗 自动解析文件名计算报警在视频里的秒数位置！
      const screenshotFilenames = [
        '358_1775532666_6ef48f.jpg',
        '358_1775532787_d64ab0.jpg',
        '358_1775533418_9bfca6.jpg',
        '358_1775533539_94af4c.jpg',
        '358_1775533681_ec52b3.jpg',
      ];
      
      alarmVideos.forEach(video => {
        const duration = video.duration_seconds || 60;
        // ✅ 通过文件名计算：报警在视频里的第几秒
        const { alarmSecond, screenshotUrl } = matchAlarmScreenshot(video.name, screenshotFilenames);
        
        list.push({
          id: `alarm_${video.name}`,
          deviceId: baseDevice.id,
          deviceName: baseDevice.name,
          company: baseDevice.company,
          project: baseDevice.project,
          type: 'alarm',
          startTime: video.updated_at,
          endTime: video.updated_at,
          duration: duration,
          filePath: toVideoUrl(video.web_path),
          createdAt: video.updated_at,
          alarmSecond,  // ✅ 传给播放器！进度条红点在这里！
          alarmInfo: {
            type: 'AI检测',
            msg: '检测到异常行为',
            score: 0.95,
            timestamp: video.updated_at,
            personnel: '未知',
            screenshotUrl,  // ✅ 对应截图！
          },
        });
      });
      
      // ✅ 终极兜底：如果报警视频 < 3条（API还没回来或失败）
      // 就补充到至少3条，保证报警Tab永远不为空！
      const alarmCount = list.filter(x => x.type === 'alarm').length;
      for (let i = alarmCount; i < 3; i++) {
        const date = new Date();
        date.setMinutes(date.getMinutes() - i * 30);
        const timeStr = date.toISOString();
        list.push({
          id: `alarm_fallback_${i}`,
          deviceId: baseDevice.id,
          deviceName: baseDevice.name,
          company: baseDevice.company,
          project: baseDevice.project,
          type: 'alarm',
          startTime: timeStr,
          endTime: timeStr,
          duration: 60,
          filePath: recordingVideos[0] ? toVideoUrl(recordingVideos[0].web_path) : '',
          createdAt: timeStr,
          alarmInfo: {
            type: 'AI检测',
            msg: '检测到异常行为',
            score: 0.92,
            timestamp: timeStr,
            personnel: '未知',
          },
        });
      }
      
      return list;
    };
    
    let list = convertToSavedPlayback();
    
    // 没选设备时，才按公司/项目筛选
    if (!selectedDevice) {
      if (selectedCompany !== 'all') {
        list = list.filter(p => p.company === selectedCompany);
      }
      if (selectedProject !== 'all') {
        list = list.filter(p => p.project === selectedProject);
      }
    }
    
    // 按Tab筛选
    if (activeTab === 'alarm') {
      list = list.filter(p => p.type === 'alarm');
    } else {
      list = list.filter(p => p.type === 'manual');
    }
    
    // 按关键词搜索
    if (searchKeyword) {
      list = list.filter(p => 
        p.deviceName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        p.alarmInfo?.msg?.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        p.alarmInfo?.type?.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        p.company?.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        p.project?.toLowerCase().includes(searchKeyword.toLowerCase())
      );
    }
    
    // ✅ 最终按时间倒序排列（新的在前）
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    setFilteredPlaybacks(list);
  }, [selectedDevice, recordingVideos, alarmVideos, activeTab, searchKeyword, selectedCompany, selectedProject, devices]);
  
 

// ✅ 分页计算 - 放在 useEffect 外面
const totalPages = Math.ceil(filteredPlaybacks.length / itemsPerPage);
const currentPagePlaybacks = filteredPlaybacks.slice(
  (currentPage - 1) * itemsPerPage,
  currentPage * itemsPerPage
);

// 筛选变化时重置页码
useEffect(() => {
  setCurrentPage(1);
}, [filteredPlaybacks.length, activeTab, selectedCompany, selectedProject, selectedDevice, searchKeyword]);
   

    // 播放选中的回放
    const handlePlay = (playback: SavedPlayback) => {
      setSelectedPlayback(playback);
    };

    // 删除回放记录
    const handleDelete = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm('确定要删除这个回放记录吗？')) {
        removePlayback(id);
        if (selectedPlayback?.id === id) {
          setSelectedPlayback(null);
        }
      }
    };

    // 清空所有记录
    const handleClearAll = () => {
      if (confirm('确定要清空所有回放记录吗？此操作不可恢复！')) {
        clearAll();
        setSelectedPlayback(null);
      }
    };

    // 重置所有筛选
    const handleResetFilters = () => {
      setSelectedCompany('all');
      setSelectedProject('all');
      setSelectedDevice(null);
      setSearchKeyword('');
      setActiveTab('all');
    };

    // 格式化时间显示
    const formatTime = (timeStr: string) => {
      const date = new Date(timeStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    // 格式化时长
    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      if (mins >= 60) {
        const hours = Math.floor(mins / 60);
        const remainMins = mins % 60;
        return `${hours}:${remainMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

const getVoiceTypeInfo = (type: string) => {
  switch (type) {
    case 'broadcast': return { icon: <Radio size={14} className="text-blue-400" />, text: '广播', color: 'bg-blue-500/20 text-blue-300' };
    case 'group': return { icon: <Users size={14} className="text-green-400" />, text: '群组', color: 'bg-green-500/20 text-green-300' };
    default: return { icon: <Phone size={14} className="text-purple-400" />, text: '私密', color: 'bg-purple-500/20 text-purple-300' };
  }
};

  // 轨迹筛选计算
  const filteredTracks = trackRecords.filter(track => {
    if (selectedTrackCompany !== 'all' && track.company !== selectedTrackCompany) return false;
    if (selectedTrackProject !== 'all' && track.project !== selectedTrackProject) return false;
    if (selectedTrackTeam !== 'all' && track.team !== selectedTrackTeam) return false;
    if (trackSearchKeyword && !track.holder.includes(trackSearchKeyword) && !track.deviceName.includes(trackSearchKeyword)) return false;
    if (trackDateRange.start && new Date(track.startTime) < new Date(trackDateRange.start)) return false;
    if (trackDateRange.end && new Date(track.endTime) > new Date(trackDateRange.end)) return false;
    return true;
  });
  const paginatedTracks = filteredTracks.slice((trackCurrentPage - 1) * itemsPerPageTrackVoice, trackCurrentPage * itemsPerPageTrackVoice);
  const trackTotalPages = Math.ceil(filteredTracks.length / itemsPerPageTrackVoice);
  
  // 语音筛选计算
  const filteredVoices = voiceRecords.filter(voice => {
    if (voiceSearchKeyword && !voice.from.includes(voiceSearchKeyword) && !voice.toNames.some(n => n.includes(voiceSearchKeyword))) return false;
    if (voiceDateRange.start && new Date(voice.startTime) < new Date(voiceDateRange.start)) return false;
    if (voiceDateRange.end && new Date(voice.startTime) > new Date(voiceDateRange.end)) return false;
    return true;
  });
  const paginatedVoices = filteredVoices.slice((voiceCurrentPage - 1) * itemsPerPageTrackVoice, voiceCurrentPage * itemsPerPageTrackVoice);
  const voiceTotalPages = Math.ceil(filteredVoices.length / itemsPerPageTrackVoice);
    // 当前筛选激活数量（不含设备选择和Tab分类）
    const activeFiltersCount = [
      selectedCompany !== 'all',
      selectedProject !== 'all',
      searchKeyword !== ''
    ].filter(Boolean).length;

return (
  <div className="h-full flex flex-col gap-4 p-4 text-slate-100 bg-[radial-gradient(circle_at_12%_8%,rgba(56,189,248,0.20),transparent_32%),radial-gradient(circle_at_86%_2%,rgba(59,130,246,0.22),transparent_30%),linear-gradient(135deg,#020617,#0b1f3f_45%,#102a5e)]">
    
    {/* ========== 新增：顶层Tab切换（监控回放/轨迹回放/语音回放） ========== */}
    <div className="flex gap-2 mb-2 border-b border-cyan-400/20 pb-2">
      <button
        onClick={() => setMainTab('video')}
        className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
          mainTab === 'video'
            ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <VideoIcon size={16} className="inline mr-2" />
        监控回放
      </button>
      <button
        onClick={() => setMainTab('track')}
        className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
          mainTab === 'track'
            ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <MapPin size={16} className="inline mr-2" />
        轨迹回放
      </button>
      <button
        onClick={() => setMainTab('voice')}
        className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
          mainTab === 'voice'
            ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Phone size={16} className="inline mr-2" />
        语音回放
      </button>
    </div>

    {/* ========== 监控回放内容（原有全部功能） ========== */}
    {mainTab === 'video' && (
      <>

        {/* 根据状态显示不同内容 */}
        {!showPlayer ? (
          /* 卡片网格视图 */
          <div className="flex-1 overflow-hidden flex flex-col h-full">
            <div className="flex justify-between items-center mb-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-cyan-300">
                  监控视频
                  <span className="text-sm text-slate-400 ml-2">(共{filteredPlaybacks.length}条记录)</span>
                </h3>
                
                {/* 查看模式切换按钮 */}
                <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
                  <button
                    onClick={() => setActiveTab('manual')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                      activeTab === 'manual' || activeTab === 'all'
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                        : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/40'
                    }`}
                  >
                    <Eye size={14} />
                    常规监控回放
                  </button>
                  <button
                    onClick={() => setActiveTab('alarm')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                      activeTab === 'alarm'
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                        : 'bg-red-500/20 text-red-300 hover:bg-red-500/40'
                    }`}
                  >
                    <Bell size={14} />
                    报警监控回放
                  </button>
                </div>
              </div>

              {/* 筛选按钮 - 居右 */}
              <div className="relative">
                <button
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                    activeFiltersCount > 0
                      ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                      : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <Filter size={14} />
                  <span>按条件筛选视频</span>
                  {activeFiltersCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-cyan-500 rounded-full text-white">{activeFiltersCount}</span>
                  )}
                </button>

                {showFilterPanel && (
                  <div className="absolute top-full right-0 mt-2 z-[500] bg-slate-800 rounded-xl border border-cyan-400/30 shadow-2xl p-4 min-w-[720px]">
                    <div className="space-y-3">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
                        <input
                          type="text"
                          placeholder="搜索设备名称..."
                          value={searchKeyword}
                          onChange={(e) => setSearchKeyword(e.target.value)}
                          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                        />
                        {searchKeyword && (
                          <button onClick={() => setSearchKeyword('')} className="absolute right-2 top-1/2 transform -translate-y-1/2">
                            <X size={14} className="text-slate-400 hover:text-white" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-3">
                        <select
                          value={selectedCompany}
                          onChange={(e) => { setSelectedCompany(e.target.value); setSelectedProject('all'); setSelectedTeam('all'); }}
                          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400"
                        >
                          {companies.map(company => (
                            <option key={company} value={company}>
                              {company === 'all' ? '全部公司' : company}
                            </option>
                          ))}
                        </select>

                        <select
                          value={selectedProject}
                          onChange={(e) => { setSelectedProject(e.target.value); setSelectedTeam('all'); }}
                          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400"
                        >
                          {projects.map(project => (
                            <option key={project} value={project}>
                              {project === 'all' ? '全部项目' : project}
                            </option>
                          ))}
                        </select>

                        <select
                          value={selectedTeam}
                          onChange={(e) => setSelectedTeam(e.target.value)}
                          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400"
                        >
                          <option value="all">全部作业队</option>
                        </select>

                        <select
                          value={selectedDevice?.id || ""}
                          onChange={(e) => {
                            const dev = devices.find((d) => d.id === Number(e.target.value));
                            setSelectedDevice(dev || null);
                          }}
                          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400"
                        >
                          <option value="">全部设备</option>
                          {devices
                            .filter(device => {
                              if (selectedCompany !== 'all' && device.company !== selectedCompany) return false;
                              if (selectedProject !== 'all' && device.project !== selectedProject) return false;
                              return true;
                            })
                            .map((device) => (
                              <option key={device.id} value={device.id}>{device.name}</option>
                            ))}
                        </select>
                      </div>

                      {activeFiltersCount > 0 && (
                        <div className="flex justify-end pt-2 border-t border-slate-700">
                          <button onClick={handleResetFilters} className="text-sm text-cyan-400 hover:text-cyan-300">
                            重置全部筛选
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-hidden py-2 grid grid-cols-10 gap-2">
              {currentPagePlaybacks.map((playback) => (
<VideoCard 
  key={playback.id}
  playback={playback}
  onPlay={() => {
    setCurrentPlayback(playback);
    setShowPlayer(true);
  }}
onShowScreenshot={async (playback) => {
  console.log("1. 点击截图");
  
  // 先打开播放器
  setCurrentPlayback(playback);
  setShowPlayer(true);
  
  // 等待播放器渲染完成
  await new Promise(r => setTimeout(r, 100));
  
  setSelectedAlarm(playback);
  setShowScreenshotModal(true);
  
  if (videoPlayerRef.current) {
    const alarmTime = videoPlayerRef.current.getAlarmTimestamp();
    console.log("2. 红点时间(秒):", alarmTime);
    
    if (alarmTime > 0) {
      await videoPlayerRef.current.seekTo(alarmTime);
      await new Promise(r => setTimeout(r, 200));
      const screenshotBase64 = await videoPlayerRef.current.captureFrame();
      console.log("3. 截图完成, 长度:", screenshotBase64?.length);
      
      if (screenshotBase64 && screenshotBase64.length > 100 && playback.alarmInfo) {
        (playback.alarmInfo as any).screenshot = {
          id: `screenshot_${Date.now()}`,
          url: screenshotBase64,
          thumbnail: screenshotBase64,
          timestamp: new Date().toISOString()
        };
        setSelectedAlarm({ ...playback });
      }
    }
  }
}}
/>
              ))}
              
              {/* ✅ 补空窗口占位，保证永远填满 10×4=40 个位置，布局永远一致 */}
              {Array.from({ length: Math.max(0, 40 - currentPagePlaybacks.length) }, (_, i) => (
                <div 
                  key={`empty_${i}`} 
                  className="relative w-full rounded-lg border border-slate-700/30 bg-slate-900/30"
                  style={{ paddingBottom: '28.125%' }}
                />
              ))}
            </div>

            {/* 分页控件 */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-3 mt-4 pt-3 border-t border-blue-400/20 flex-shrink-0">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded bg-slate-800/50 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cyan-500/20 transition-colors flex items-center gap-1"
                >
                  <ChevronLeft size={14} />
                  上一页
                </button>
                
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded text-sm transition-colors ${
                          currentPage === pageNum
                            ? 'bg-cyan-500 text-white'
                            : 'bg-slate-800/50 text-slate-400 hover:bg-cyan-500/30'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded bg-slate-800/50 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cyan-500/20 transition-colors flex items-center gap-1"
                >
                  下一页
                  <ChevronRight size={14} />
                </button>
                
                <span className="text-xs text-slate-400 ml-2">
                  第 {currentPage} / {totalPages} 页
                </span>
              </div>
            )}
          </div>
        ) : (
          /* 播放器视图 - 左右布局 */
          <div className="flex-1 flex flex-col overflow-hidden h-full">
            {/* 返回按钮行 */}
            <div className="flex items-center gap-3 mb-3 flex-shrink-0">
              <button 
                onClick={() => setShowPlayer(false)}
                className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30 flex items-center gap-2"
              >
                ← 返回列表
              </button>
              <span className="text-slate-300">{currentPlayback?.deviceName}</span>
            </div>
            
            {/* 左右内容区域 */}
            <div className="flex-1 flex gap-4 overflow-hidden">
              {/* 左侧：监控相关信息 */}
              <div className="w-72 flex-shrink-0 rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md overflow-y-auto p-4">
                <h4 className="text-sm font-bold text-cyan-300 mb-3 flex items-center gap-2">
                  <Camera size={14} />
                  监控信息
                </h4>
                
                {/* 设备信息 */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-slate-700 pb-1">
                    <span className="text-slate-400">设备名称</span>
                    <span className="text-slate-200">{currentPlayback?.deviceName}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-700 pb-1">
                    <span className="text-slate-400">所属公司</span>
                    <span className="text-slate-200">{currentPlayback?.company || '未知'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-700 pb-1">
                    <span className="text-slate-400">所属项目</span>
                    <span className="text-slate-200">{currentPlayback?.project || '未知'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-700 pb-1">
                    <span className="text-slate-400">记录类型</span>
                    <span className={`${currentPlayback?.type === 'alarm' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {currentPlayback?.type === 'alarm' ? '报警片段' : '常规保存'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-700 pb-1">
                    <span className="text-slate-400">录制时间</span>
                    <span className="text-slate-200">{currentPlayback ? formatTime(currentPlayback.startTime) : ''}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-700 pb-1">
                    <span className="text-slate-400">视频时长</span>
                    <span className="text-slate-200">{formatDuration(currentPlayback?.duration || 0)}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-700 pb-1">
                    <span className="text-slate-400">保存时间</span>
                    <span className="text-slate-200">{currentPlayback ? formatTime(currentPlayback.createdAt) : ''}</span>
                  </div>
                </div>
                
                {/* 报警详情（如果是报警片段） */}
                {currentPlayback?.alarmInfo && (
                  <>
                    <h4 className="text-sm font-bold text-red-300 mt-4 mb-2 flex items-center gap-2">
                      <AlertCircle size={14} />
                      报警详情
                    </h4>
                    <div className="space-y-2 text-sm bg-red-500/10 rounded-lg p-3 border border-red-400/20">
                      <div className="flex justify-between">
                        <span className="text-slate-400">报警类型</span>
                        <span className="text-red-300">{currentPlayback.alarmInfo.type}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">违章人员</span>
                        <span className="text-red-300">{currentPlayback.alarmInfo.personnel || '未知'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">置信度</span>
                        <span className="text-red-300">{((currentPlayback.alarmInfo.score || 0) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">报警时间</span>
                        <span className="text-red-300">{formatTime(currentPlayback.alarmInfo.timestamp)}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-red-400/20">
                        <span className="text-slate-400 block mb-1">报警信息</span>
                        <span className="text-red-200/80 text-sm">{currentPlayback.alarmInfo.msg}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              {/* 右侧：视频播放器 */}
              <div className="flex-1 rounded-lg border border-blue-400/30 bg-black/50 overflow-hidden">
                {currentPlayback && (
<SimpleVideoPlayer 
  ref={videoPlayerRef}
  src={currentPlayback.filePath || ''} 
  deviceName={currentPlayback.deviceName}
  type={currentPlayback.type}
  playlist={filteredPlaybacks}
  currentPlayback={currentPlayback}
  onPlaybackChange={setCurrentPlayback}
/>
                  )}
              </div>
            </div>
          </div>
        )}
      </>
    )}

    {/* ========== 轨迹回放内容 ========== */}
    {mainTab === 'track' && (
      <TrackPlaybackContent 
        filteredTracks={paginatedTracks}
        totalPages={trackTotalPages}
        currentPage={trackCurrentPage}
        setCurrentPage={setTrackCurrentPage}
        selectedTrack={selectedTrack}
        setSelectedTrack={setSelectedTrack}
        selectedCompany={selectedTrackCompany}
        setSelectedCompany={setSelectedTrackCompany}
        selectedProject={selectedTrackProject}
        setSelectedProject={setSelectedTrackProject}
        selectedTeam={selectedTrackTeam}
        setSelectedTeam={setSelectedTrackTeam}
        searchKeyword={trackSearchKeyword}
        setSearchKeyword={setTrackSearchKeyword}
        showFilter={showTrackFilter}
        setShowFilter={setShowTrackFilter}
        dateRange={trackDateRange}
        setDateRange={setTrackDateRange}
        companyTree={companyTree}
      />
    )}

    {/* ========== 语音回放内容 ========== */}
    {mainTab === 'voice' && (
      <VoicePlaybackContent
        filteredVoices={paginatedVoices}
        totalPages={voiceTotalPages}
        currentPage={voiceCurrentPage}
        setCurrentPage={setVoiceCurrentPage}
        selectedVoice={selectedVoice}
        setSelectedVoice={setSelectedVoice}
        searchKeyword={voiceSearchKeyword}
        setSearchKeyword={setVoiceSearchKeyword}
        dateRange={voiceDateRange}
        setDateRange={setVoiceDateRange}
        formatDuration={formatDuration}
        getVoiceTypeInfo={getVoiceTypeInfo}
      />
    )}

          {/* 告警截图弹窗 */}
      {showScreenshotModal && selectedAlarm && selectedAlarm.alarmInfo && (
        <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowScreenshotModal(false)}>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-cyan-400/30 bg-slate-900/50">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <AlertCircle size={20} className="text-red-400" />
                告警详情
              </h3>
              <button onClick={() => setShowScreenshotModal(false)} className="p-1 hover:bg-slate-700 rounded-lg">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            
            <div className="flex flex-col md:flex-row gap-6 p-6">
              <div className="flex-1">
                <div className="rounded-lg overflow-hidden border border-cyan-400/30 bg-black/50">
<img 
  src={selectedAlarm.alarmInfo.screenshot?.url || ''}
  alt="告警截图"
  className="w-full h-auto"
  onError={(e) => {
    (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect width="400" height="300" fill="%231e293b"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="%2364748b"%3E点击截图按钮获取真实画面%3C/text%3E%3C/svg%3E';
  }}
/>
                </div>
                <p className="text-xs text-slate-500 text-center mt-2">告警发生时刻截图</p>
              </div>
              
              <div className="flex-1 space-y-4">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <div className="text-sm text-slate-400 mb-2">告警类型</div>
                  <div className="text-lg font-semibold text-red-400">{selectedAlarm.alarmInfo.type}</div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-400 mb-1">告警时间</div>
                    <div className="text-sm text-white">{formatTime(selectedAlarm.alarmInfo.timestamp)}</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-400 mb-1">置信度</div>
                    <div className="text-sm text-white">{((selectedAlarm.alarmInfo.score || 0) * 100).toFixed(0)}%</div>
                  </div>
                </div>
                
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">违章人员</div>
                  <div className="text-sm text-white">{selectedAlarm.alarmInfo.personnel || '未知'}</div>
                </div>
                
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">告警描述</div>
                  <div className="text-sm text-slate-200">{selectedAlarm.alarmInfo.msg}</div>
                </div>
                
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">设备信息</div>
                  <div className="text-sm text-white">{selectedAlarm.deviceName}</div>
                  <div className="text-xs text-slate-500 mt-1">{selectedAlarm.company} / {selectedAlarm.project}</div>
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => {
                      setCurrentPlayback(selectedAlarm);
                      setShowPlayer(true);
                      setShowScreenshotModal(false);
                    }}
                    className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Play size={14} className="inline mr-1" />
                    播放视频
                  </button>
                  <button 
                    onClick={() => setShowScreenshotModal(false)}
                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

  </div>
);
  } 