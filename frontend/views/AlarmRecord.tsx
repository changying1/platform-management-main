﻿import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { alarmApi, toStaticUrl, type AlarmResponse } from '../src/api/alarmApi';
import { 
  Bell, 
  ShieldAlert, 
  Video, 
  MapPin, 
  User, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  Calendar,
  Search,
  X,
  Filter,
  ImageIcon
} from 'lucide-react';

// 告警记录类型
interface AlarmRecord {
  id: string;
  alarmCode: string;
  alarmType: string;
  type: 'fence' | 'video';
  title: string;
  description: string;
  time: string;
  level: 'high' | 'medium' | 'low';
  severityRaw: string;
  status: 'pending' | 'resolved' | 'ignored';
  location: string;
  deviceName: string;
  deviceId: string;
  personName: string;
  personnelId?: string;
  team?: string;
  snapshot?: string;
  videoPath?: string;
  durationSeconds?: number;
  startTime?: string;
  endTime?: string;
  alarmSecond?: number;
  recordingStatus?: string;
  recordingError?: string;
  fenceId?: string;
  fenceName?: string;
  projectId?: number;
}

type AlarmFilterTreeNode = {
  id: string;
  name: string;
  projects: Array<{ name: string; teams: string[] }>;
};

const formatVideoTime = (time: number) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const resolveAlarmSecond = (alarm: AlarmRecord, duration: number) => {
  if (Number.isFinite(alarm.alarmSecond)) {
    return Math.max(0, Math.min(alarm.alarmSecond || 0, duration || alarm.alarmSecond || 0));
  }

  const alarmTime = new Date(alarm.time).getTime();
  const startTime = new Date(alarm.startTime || '').getTime();
  if (!Number.isNaN(alarmTime) && !Number.isNaN(startTime)) {
    return Math.max(0, Math.min(Math.round((alarmTime - startTime) / 1000), duration || 30));
  }

  return duration > 0 ? Math.min(30, duration / 2) : 30;
};

function AlarmPlaybackPlayer({ src, alarm }: { src: string; alarm: AlarmRecord }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(alarm.durationSeconds || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);

  const alarmSecond = resolveAlarmSecond(alarm, duration);
  const alarmPercent = duration > 0 ? Math.max(0, Math.min(100, (alarmSecond / duration) * 100)) : 0;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedMetadata = () => setDuration(Math.round(video.duration || alarm.durationSeconds || 0));
    const onTimeUpdate = () => setCurrentTime(video.currentTime || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [src, alarm.durationSeconds]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch((error) => console.error('播放失败:', error));
    } else {
      video.pause();
    }
  };

  const handleProgressClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    video.currentTime = ratio * duration;
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextVolume = Number(event.target.value);
    setVolume(nextVolume);
    if (videoRef.current) {
      videoRef.current.volume = nextVolume;
      videoRef.current.muted = nextVolume === 0;
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      containerRef.current?.requestFullscreen?.();
    }
  };

  return (
    <div ref={containerRef} className="relative bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        key={src}
        src={src}
        autoPlay
        controls={false}
        className="w-full max-h-[78vh] bg-black"
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-4 py-3">
        <div className="relative h-2 bg-white/30 rounded-full cursor-pointer mb-3" onClick={handleProgressClick}>
          <div className="absolute h-full bg-cyan-400 rounded-full" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
          <div className="absolute w-3 h-3 bg-cyan-400 rounded-full top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
          {duration > 0 && (
            <div
              className="absolute w-3 h-3 bg-red-500 rounded-full top-1/2 -translate-y-1/2 -translate-x-1/2 shadow-lg ring-2 ring-red-500/60"
              style={{ left: `${alarmPercent}%` }}
              title={`报警触发时刻 ${formatVideoTime(alarmSecond)}`}
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-4 text-white">
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm">
              {isPlaying ? '暂停' : '播放'}
            </button>
            <span className="font-mono text-sm">{formatVideoTime(currentTime)} / {formatVideoTime(duration)}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="w-28"
              aria-label="音量"
            />
            <button onClick={toggleFullscreen} className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm">
              全屏
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default function AlarmRecords() {
  const [activeTab, setActiveTab] = useState<'all' | 'fence' | 'video'>('all');
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [selectedAlarm, setSelectedAlarm] = useState<AlarmRecord | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
const [searchKeyword, setSearchKeyword] = useState('');
const [startDate, setStartDate] = useState<string>('');
const [endDate, setEndDate] = useState<string>('');
const [showDatePicker, setShowDatePicker] = useState(false); 
const [datePickerPos, setDatePickerPos] = useState<{ top: number; left: number } | null>(null);
const datePickerRef = useRef<HTMLDivElement>(null);
const [showProcessModal, setShowProcessModal] = useState(false);
const [processingAlarm, setProcessingAlarm] = useState<AlarmRecord | null>(null);
const [processRemark, setProcessRemark] = useState('');
const [previewImage, setPreviewImage] = useState<string | null>(null);
const [previewVideo, setPreviewVideo] = useState<string | null>(null);
const [selectedVideoAlarm, setSelectedVideoAlarm] = useState<AlarmRecord | null>(null);
const [processAction, setProcessAction] = useState<'resolved' | 'ignored'>('resolved');
const [showFilterTree, setShowFilterTree] = useState(false);
const [selectedCompany, setSelectedCompany] = useState<string>('all');
const [selectedProject, setSelectedProject] = useState<string>('all');
const [selectedTeam, setSelectedTeam] = useState<string>('all');
const [filterTreePos, setFilterTreePos] = useState<{ top: number; left: number } | null>(null);
const filterTreeRef = useRef<HTMLDivElement>(null);
const formatAlarmCodeDate = (timestamp?: string) => {
  const date = timestamp ? new Date(timestamp) : null;
  if (date && !Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
  const fallback = String(timestamp || '').slice(0, 10).replace(/-/g, '');
  return fallback || '00000000';
};

const getLevelFromSeverity = (severity?: string): AlarmRecord['level'] => {
  const normalized = String(severity || '').toLowerCase();
  if (['high', 'severe', 'critical', 'danger', '高危', '严重'].includes(normalized)) return 'high';
  if (['medium', 'warning', '一般', '中'].includes(normalized)) return 'medium';
  return 'low';
};

const normalizeSearchText = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[：:\s_-]+/g, '')
    .replace(/设备|device/g, '');

const mapAlarmFromApi = (item: AlarmResponse): AlarmRecord => {
  const rawItem = item as any;
  const sourceType = rawItem.source_type || '';
  const isFence =
    sourceType === 'fence' ||
    (!sourceType && item.fence_id !== undefined && item.fence_id !== null);

  const rawType = String(item.alarm_type || '');
  const title = rawType || (isFence ? '围栏告警' : '视频告警');
  const timestamp = item.timestamp || '';
  const alarmCode = `ALM-${formatAlarmCodeDate(timestamp)}-${item.id}`;

  const locationText =
    item.location && String(item.location).trim()
      ? String(item.location)
      : '未提供位置';

  const team = rawItem.team || rawItem.team_name || rawItem.work_team || '';
  const personName = rawItem.person_name || rawItem.personnel_name || rawItem.person_label || '未知';
  const personnelId =
    rawItem.personnel_id !== undefined && rawItem.personnel_id !== null
      ? String(rawItem.personnel_id)
      : undefined;
  const personText = [personName !== '未知' ? personName : '', personnelId].filter(Boolean).join(' / ');
  const deviceId =
    item.device_id !== undefined && item.device_id !== null
      ? String(item.device_id)
      : '';

  return {
    id: String(item.id),
    alarmCode,
    alarmType: rawType || title,
    type: isFence ? 'fence' : 'video',
    title,
    description: item.description || personText || title,
    time: timestamp,
    level: getLevelFromSeverity(item.severity),
    severityRaw: item.severity || '',
    status:
      item.status === 'pending' || item.status === 'resolved' || item.status === 'ignored'
        ? item.status
        : 'pending',
    location: locationText,
    deviceName: rawItem.device_name || rawItem.video_name || deviceId || '未知设备',
    deviceId,
    personName,
    personnelId,
    team: team || undefined,
    snapshot: toStaticUrl(item.alarm_image_path || item.image_url || item.snapshot_url || rawItem.picture_url),
    videoPath: toStaticUrl(item.recording_path || item.video_url || item.clip_url),
    durationSeconds: item.duration_seconds || item.duration || rawItem.video_duration || rawItem.clip_duration,
    startTime: rawItem.start_time || rawItem.recording_start_time,
    endTime: rawItem.end_time || rawItem.recording_end_time,
    alarmSecond: rawItem.alarm_second ?? rawItem.alarmSecond,
    recordingStatus: item.recording_status,
    recordingError: item.recording_error || item.error_message,
    fenceId:
      item.fence_id !== undefined && item.fence_id !== null
        ? String(item.fence_id)
        : undefined,
    fenceName: isFence ? locationText : undefined,
    projectId: rawItem.project_id,
  };
};
const loadAlarms = async () => {
  try {
    const sourceType = activeTab === 'all' ? undefined : activeTab;
    const data = await alarmApi.getAlarms(undefined, sourceType);
    const mapped = data
      .map(mapAlarmFromApi)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    setAlarms(mapped);
  } catch (error) {
    console.error('加载告警记录失败:', error);
    setAlarms([]);
  }
};

useEffect(() => {
  loadAlarms();
}, [activeTab]);

// 监听新告警事件
useEffect(() => {
  const handleAlarmAdded = async () => {
    await loadAlarms();
  };

  window.addEventListener('alarmAdded', handleAlarmAdded as EventListener);
  return () => window.removeEventListener('alarmAdded', handleAlarmAdded as EventListener);
}, [activeTab]);

  useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
      setShowDatePicker(false);
    }
  };
  if (showDatePicker) {
    document.addEventListener('mousedown', handleClickOutside);
  }
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [showDatePicker]);

useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (filterTreeRef.current && !filterTreeRef.current.contains(event.target as Node)) {
      setShowFilterTree(false);
    }
  };
  if (showFilterTree) {
    document.addEventListener('mousedown', handleClickOutside);
  }

  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [showFilterTree]);
  const clearDateFilter = () => {
  setStartDate('');
  setEndDate('');
};

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'medium': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  const getLevelText = (level: string) => {
    switch (level) {
      case 'high': return '严重';
      case 'medium': return '一般';
      default: return '提示';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-400';
      case 'resolved': return 'bg-green-500/20 text-green-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '待处理';
      case 'resolved': return '已处理';
      default: return '已忽略';
    }
  };
const handleOpenProcessModal = (alarm: AlarmRecord, action: 'resolved' | 'ignored') => {
  setProcessingAlarm(alarm);
  setProcessAction(action);
  setProcessRemark('');
  setShowProcessModal(true);
};

const openAlarmVideo = (alarm: AlarmRecord) => {
  if (!alarm.videoPath) return;
  console.log('[ALARM_RECORD_BINDING]', {
    alarm_id: alarm.id,
    snapshot: alarm.snapshot || '',
    videoPath: alarm.videoPath,
    alarmSecond: alarm.alarmSecond,
  });
  setSelectedVideoAlarm(alarm);
  setPreviewVideo(alarm.videoPath);
};

const handleConfirmProcess = async () => {
  if (!processingAlarm) return;

  const currentUser = localStorage.getItem('username') || '未知用户';

  try {
    if (processAction === 'resolved') {
      await alarmApi.resolveAlarm(Number(processingAlarm.id), {
        handler: currentUser,
        remark: processRemark,
      });
    } else {
      await alarmApi.updateAlarm(Number(processingAlarm.id), {
        status: 'ignored',
        handler: currentUser,
        remark: processRemark,
      });
    }

    await loadAlarms();

    setShowProcessModal(false);
    setProcessingAlarm(null);
    setSelectedAlarm(null);
  } catch (error) {
    console.error('处理告警失败:', error);
  }
};

  const companyTree: AlarmFilterTreeNode[] = Array.from(
    alarms.reduce((map, alarm) => {
      const projectName =
        alarm.projectId !== undefined && alarm.projectId !== null
          ? `项目 ${alarm.projectId}`
          : '未分配项目';

      if (!map.has(projectName)) {
        map.set(projectName, {
          id: projectName,
          name: projectName,
          projects: [{ name: projectName, teams: [] as string[] }],
        });
      }

      if (alarm.team) {
        const entry = map.get(projectName)!;
        if (!entry.projects[0].teams.includes(alarm.team)) {
          entry.projects[0].teams.push(alarm.team);
        }
      }

      return map;
    }, new Map<string, AlarmFilterTreeNode>())
  ).map(([, value]) => value);

  const filteredAlarms = alarms.filter(alarm => {
    // 类型筛选
    if (activeTab !== 'all' && alarm.type !== activeTab) return false;
    // 状态筛选
    if (filterStatus !== 'all' && alarm.status !== filterStatus) return false;
    if (selectedCompany !== 'all') {
      const projectName =
        alarm.projectId !== undefined && alarm.projectId !== null
          ? `项目 ${alarm.projectId}`
          : '未分配项目';
      if (projectName !== selectedCompany) {
        return false;
      }
    }

    if (selectedProject !== 'all') {
      const projectName =
        alarm.projectId !== undefined && alarm.projectId !== null
          ? `项目 ${alarm.projectId}`
          : '未分配项目';
      if (projectName !== selectedProject) {
        return false;
      }
    }

    // 工队筛选
    if (selectedTeam !== 'all') {
      const searchableText = `${alarm.team || ''} ${alarm.description} ${alarm.location}`;
      if (!searchableText.includes(selectedTeam)) {
        return false;
      }
    }

    // 关键词搜索
    const keyword = normalizeSearchText(searchKeyword);
    if (keyword) {
      const statusText = getStatusText(alarm.status);
      const levelText = getLevelText(alarm.level);
      const searchableValues = [
        alarm.alarmCode,
        alarm.id,
        alarm.title,
        alarm.alarmType,
        alarm.description,
        alarm.deviceName,
        alarm.deviceId,
        alarm.location,
        alarm.personName,
        alarm.personnelId,
        alarm.team,
        statusText,
        levelText,
        alarm.time,
      ];
      const normalizedValues = searchableValues.map(normalizeSearchText);
      const matchesKeyword = normalizedValues.some(value => value.includes(keyword));
      const deviceLikeNumber = normalizeSearchText(searchKeyword).match(/^\d+$/)?.[0];
      const matchesNumeric =
        !!deviceLikeNumber &&
        (alarm.deviceId === deviceLikeNumber || alarm.id.includes(deviceLikeNumber));

      if (!matchesKeyword && !matchesNumeric) return false;
    }
    
    // 日期范围筛选
    const alarmDate = new Date(alarm.time);
    if (startDate && alarmDate < new Date(startDate)) return false;
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      if (alarmDate > endDateTime) return false;
    }
    return true;
  });

  const stats = {
    total: alarms.length,
    pending: alarms.filter(a => a.status === 'pending').length,
    fence: alarms.filter(a => a.type === 'fence').length,
    video: alarms.filter(a => a.type === 'video').length,
  };

  return (
    <div className="h-full overflow-auto p-6">
      {/* 标题 + 统计卡片 */}
      <div className="flex justify-between items-start mb-6">
        {/* 标题 */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Bell size={28} className="text-cyan-400" />
            告警记录
          </h1>
          <p className="text-slate-400 text-sm mt-1">查看和管理所有围栏告警及视频分析告警</p>
        </div>

        {/* 统计卡片 - 右上角紧凑布局 */}
        <div className="flex gap-3">
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-cyan-400/30 px-4 py-1.5 flex items-center gap-2">
            <Bell size={24} className="text-cyan-400" />
            <span className="text-slate-400 text-lg">总数</span>
            <span className="text-cyan-400 font-bold text-2xl">{stats.total}</span>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-yellow-400/30 px-4 py-1.5 flex items-center gap-2">
            <AlertTriangle size={24} className="text-yellow-400" />
            <span className="text-slate-400 text-lg">待处理</span>
            <span className="text-yellow-400 font-bold text-2xl">{stats.pending}</span>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-blue-400/30 px-4 py-1.5 flex items-center gap-2">
            <ShieldAlert size={24} className="text-blue-400" />
            <span className="text-slate-400 text-lg">围栏</span>
            <span className="text-blue-400 font-bold text-2xl">{stats.fence}</span>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-purple-400/30 px-4 py-1.5 flex items-center gap-2">
            <Video size={24} className="text-purple-400" />
            <span className="text-slate-400 text-lg">视频</span>
            <span className="text-purple-400 font-bold text-2xl">{stats.video}</span>
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-cyan-400/30 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Tab切换 */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'all'
                  ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setActiveTab('fence')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'fence'
                  ? 'bg-blue-500/30 text-blue-300 border border-blue-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldAlert size={14} />
              围栏告警
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'video'
                  ? 'bg-purple-500/30 text-purple-300 border border-purple-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Video size={14} />
              视频告警
            </button>
          </div>

          {/* 状态筛选 */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            <option value="all">全部状态</option>
            <option value="pending">待处理</option>
            <option value="resolved">已处理</option>
            <option value="ignored">已忽略</option>
          </select>
          {/* 树形筛选按钮 */}
<div className="relative">
<button
  onClick={(e) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setFilterTreePos({ top: rect.bottom + 8, left: rect.left });
    setShowFilterTree(!showFilterTree);
  }}
  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
      selectedCompany !== 'all' || selectedProject !== 'all'
        ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
        : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600'
    }`}
  >
    <Filter size={14} />
    <span>
      {selectedCompany !== 'all' && selectedProject !== 'all'
        ? `${selectedCompany} / ${selectedProject}`
        : selectedCompany !== 'all'
          ? selectedCompany
          : selectedProject !== 'all'
            ? selectedProject
            : '分公司/项目'}
    </span>
  </button>
  
{showFilterTree && filterTreePos && createPortal(
  <div 
    className="fixed z-[9999] bg-slate-800 rounded-xl border border-cyan-400/30 shadow-2xl p-4 min-w-[260px]"
    style={{ top: filterTreePos.top, left: filterTreePos.left }}
    ref={filterTreeRef}
  >
    <div className="space-y-3">
      <div className="flex justify-between items-center border-b border-slate-700 pb-2">
        <span className="text-sm font-medium text-white">筛选</span>
        <button
          onClick={() => {
            setSelectedCompany('all');
            setSelectedProject('all');
            setSelectedTeam('all');
            setShowFilterTree(false);
          }}
          className="text-xs text-cyan-400 hover:text-cyan-300"
        >
          清除筛选
        </button>
      </div>
      
      {companyTree.map(company => (
        <div key={company.id} className="space-y-2">
          <button
            onClick={() => {
              setSelectedCompany(selectedCompany === company.id ? 'all' : company.id);
              setSelectedProject('all');
              setSelectedTeam('all');
            }}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-all ${
              selectedCompany === company.id
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            📁 {company.name}
          </button>
          {selectedCompany === company.id && (
            <div className="ml-4 space-y-1 border-l border-cyan-400/30 pl-2">
              {company.projects.map((project: { name: string; teams: string[] }) => (
                <div key={project.name} className="space-y-1">
                  <button
                    onClick={() => {
                      setSelectedProject(selectedProject === project.name ? 'all' : project.name);
                      setSelectedTeam('all');
                    }}
                    className={`w-full text-left px-2 py-1 rounded-lg text-xs transition-all ${
                      selectedProject === project.name
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    📂 {project.name}
                  </button>
                  {selectedProject === project.name && (
                    <div className="ml-4 space-y-1 border-l border-cyan-400/30 pl-2">
                      {project.teams.map(team => (
                        <button
                          key={team}
                          onClick={() => setSelectedTeam(selectedTeam === team ? 'all' : team)}
                          className={`w-full text-left px-2 py-0.5 rounded-lg text-xs transition-all ${
                            selectedTeam === team
                              ? 'bg-orange-500/20 text-orange-300'
                              : 'text-slate-500 hover:bg-slate-700'
                          }`}
                        >
                          👥 {team}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      
      <div className="flex gap-2 pt-2 border-t border-slate-700">
        <button
          onClick={() => setShowFilterTree(false)}
          className="flex-1 py-1.5 bg-cyan-500 hover:bg-cyan-600 rounded-lg text-xs transition-all"
        >
          确定
        </button>
      </div>
    </div>
  </div>,
  document.body
)}
</div>

{/* 日期区间筛选 */}
<div className="relative">
<button
onClick={(e) => {
  const rect = (e.target as HTMLElement).getBoundingClientRect();
  // 让日期选择器左边和按钮左边对齐
  setDatePickerPos({ top: rect.bottom + 8, left: rect.left });
  setShowDatePicker(!showDatePicker);
}}
  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
      startDate || endDate
        ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
        : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600'
    }`}
  >
    <Calendar size={14} />
    <span>
      {startDate && endDate 
        ? `${startDate} ~ ${endDate}`
        : startDate 
          ? `≥ ${startDate}`
          : endDate 
            ? `≤ ${endDate}`
            : '按日期筛选'}
    </span>
  </button>
  
{/* 日期选择器 - 使用 Portal 渲染到 body */}
{showDatePicker && datePickerPos && createPortal(
  <div 
    className="fixed z-[9999] bg-slate-800 rounded-xl border border-cyan-400/30 shadow-2xl p-4 min-w-[280px]"
    style={{ 
      top: datePickerPos.top, 
      left: datePickerPos.left,
    }}
    ref={datePickerRef}
  >
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">开始日期</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">结束日期</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <button
          onClick={clearDateFilter}
          className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs transition-all"
        >
          清除
        </button>
        <button
          onClick={() => setShowDatePicker(false)}
          className="flex-1 py-1.5 bg-cyan-500 hover:bg-cyan-600 rounded-lg text-xs transition-all"
        >
          确定
        </button>
      </div>
    </div>
  </div>,
  document.body
)}
</div>

          {/* 搜索框 */}
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
            <input
              type="text"
              placeholder="搜索报警编号/设备/人员/位置/内容"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200"
            />
          </div>
        </div>
      </div>

      {/* 告警列表 - 表格型 */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-blue-400/20 bg-slate-800/50">
              <tr>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">报警编号</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">报警类型</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">等级</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">状态</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">人员</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">位置</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">设备</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">时间</th>
                <th className="px-4 py-3.5 text-right text-sm font-semibold text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredAlarms.map(alarm => (
                <tr 
                   key={alarm.id} 
                   onClick={() => setSelectedAlarm(alarm)}
                   className={`hover:bg-slate-800/30 cursor-pointer transition-colors ${
                     alarm.status === 'pending' ? 'bg-red-500/5' : ''
                   }`}
                 >
                   <td className="px-4 py-4">
                     <div className="text-sm text-cyan-300 font-medium">{alarm.alarmCode}</div>
                     <div className="text-xs text-slate-500 mt-1">ID: {alarm.id}</div>
                   </td>
                   <td className="px-4 py-4">
                     <div className="flex items-center gap-2">
                       <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                         alarm.type === 'fence' ? 'bg-blue-500/20' : 'bg-purple-500/20'
                       }`}>
                         {alarm.type === 'fence' ? (
                           <ShieldAlert size={15} className="text-blue-400" />
                         ) : (
                           <Video size={15} className="text-purple-400" />
                         )}
                       </div>
                       <div>
                         <div className="text-base text-white font-medium">{alarm.alarmType}</div>
                         <div className="text-sm text-slate-400 mt-1 max-w-[260px] truncate">{alarm.description}</div>
                       </div>
                     </div>
                   </td>
                   <td className="px-4 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full border ${getLevelColor(alarm.level)}`}>
                        {getLevelText(alarm.level)}
                      </span>
                   </td>
                   <td className="px-4 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full ${getStatusColor(alarm.status)}`}>
                        {getStatusText(alarm.status)}
                      </span>
                   </td>
                   <td className="px-4 py-4">
                     <div className="text-sm text-slate-300">{alarm.personName}</div>
                     {alarm.personnelId && <div className="text-xs text-slate-500 mt-1">ID: {alarm.personnelId}</div>}
                   </td>
                   <td className="px-4 py-4">
                     <div className="flex items-center gap-1 text-sm text-slate-300">
                       <MapPin size={14} className="text-slate-500" />
                       {alarm.location}
                     </div>
                   </td>
                   <td className="px-4 py-4">
                     <div className="flex items-center gap-1 text-sm text-slate-300">
                       <User size={14} className="text-slate-500" />
                       {alarm.deviceName}
                     </div>
                     <div className="text-xs text-slate-500 mt-1">设备ID: {alarm.deviceId || '-'}</div>
                   </td>
                   <td className="px-4 py-4">
                     <div className="flex items-center gap-1 text-sm text-slate-300">
                       <Clock size={14} className="text-slate-500" />
                       {new Date(alarm.time).toLocaleString()}
                     </div>
                   </td>
                   <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {alarm.snapshot && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(alarm.snapshot!);
                          }}
                          className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1"
                        >
                          <ImageIcon size={14} />
                          报警截图
                        </button>
                      )}

                      {alarm.videoPath && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openAlarmVideo(alarm);
                          }}
                          className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1"
                        >
                          <Video size={14} />
                          报警视频
                        </button>
                      )}

                      {alarm.status === 'pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenProcessModal(alarm, 'resolved');
                          }}
                          className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1"
                        >
                          <CheckCircle size={14} />
                          处理
                        </button>
                      )}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm(`确认删除 ${alarm.alarmCode}？`)) {
                            await alarmApi.deleteAlarm(Number(alarm.id));
                            await loadAlarms();
                          }
                        }}
                        className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-all"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                 </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAlarms.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Bell size={48} className="mx-auto mb-3 opacity-30" />
            <p>暂无告警记录</p>
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {selectedAlarm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedAlarm(null)}>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 shadow-2xl p-6 w-[500px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedAlarm.type === 'fence' ? 'bg-blue-500/20' : 'bg-purple-500/20'
                }`}>
                  {selectedAlarm.type === 'fence' ? (
                    <ShieldAlert size={20} className="text-blue-400" />
                  ) : (
                    <Video size={20} className="text-purple-400" />
                  )}
                </div>
                <h3 className="text-xl font-bold text-white">{selectedAlarm.title}</h3>
              </div>
              <button onClick={() => setSelectedAlarm(null)} className="p-1 hover:bg-slate-700 rounded">
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <span className="text-slate-400">报警编号：</span>
                  <span className="text-cyan-300 font-medium">{selectedAlarm.alarmCode}</span>
                </div>
                <div>
                  <span className="text-slate-400">告警类型：</span>
                  <span className="text-slate-200">{selectedAlarm.alarmType}</span>
                </div>
                <div>
                  <span className="text-slate-400">严重程度：</span>
                  <span className={`${getLevelColor(selectedAlarm.level)} px-2 py-0.5 rounded text-xs`}>
                    {getLevelText(selectedAlarm.level)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">处理状态：</span>
                  <span className={`${getStatusColor(selectedAlarm.status)} px-2 py-0.5 rounded text-xs`}>
                    {getStatusText(selectedAlarm.status)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">发生时间：</span>
                  <span className="text-slate-200">{new Date(selectedAlarm.time).toLocaleString()}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">发生位置：</span>
                  <span className="text-slate-200">{selectedAlarm.location}</span>
                </div>
                <div>
                  <span className="text-slate-400">设备：</span>
                  <span className="text-slate-200">{selectedAlarm.deviceName}</span>
                </div>
                <div>
                  <span className="text-slate-400">设备ID：</span>
                  <span className="text-slate-200">{selectedAlarm.deviceId || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">人员：</span>
                  <span className="text-slate-200">
                    {selectedAlarm.personName}
                    {selectedAlarm.personnelId ? ` / ${selectedAlarm.personnelId}` : ''}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">报警信息：</span>
                  <p className="text-slate-200 mt-1">{selectedAlarm.description}</p>
                </div>
                {selectedAlarm.recordingStatus && (
                  <div>
                    <span className="text-slate-400">录像状态：</span>
                    <span className="text-slate-200">{selectedAlarm.recordingStatus}</span>
                  </div>
                )}
                {selectedAlarm.recordingError && (
                  <div className="col-span-2">
                    <span className="text-slate-400">错误信息：</span>
                    <span className="text-red-300">{selectedAlarm.recordingError}</span>
                  </div>
                )}
                {selectedAlarm.snapshot && (
                  <div className="col-span-2">
                    <span className="text-slate-400">报警截图：</span>
                    <button
                      onClick={() => setPreviewImage(selectedAlarm.snapshot!)}
                      className="ml-2 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1"
                    >
                      <ImageIcon size={14} />
                      查看报警截图
                    </button>
                  </div>
                )}
                {selectedAlarm.videoPath && (
                  <div className="col-span-2">
                    <span className="text-slate-400">报警视频：</span>
                    <button
                      onClick={() => {
                        openAlarmVideo(selectedAlarm);
                      }}
                      className="ml-2 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1"
                    >
                      <Video size={14} />
                      查看报警视频
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              {selectedAlarm.status === 'pending' && (
 <button
  onClick={() => handleOpenProcessModal(selectedAlarm, 'resolved')}
  className="flex-1 py-2 bg-green-500 hover:bg-green-600 rounded-lg text-sm font-medium transition-all"
>
  已处理
</button>
              )}
              <button
                onClick={async () => {
                  if (window.confirm(`确认删除 ${selectedAlarm.alarmCode}？`)) {
                    await alarmApi.deleteAlarm(Number(selectedAlarm.id));
                    setSelectedAlarm(null);
                    await loadAlarms();
                  }
                }}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-all"
              >
                删除
              </button>
              <button onClick={() => setSelectedAlarm(null)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-all">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

    {/* 处理弹窗 */}
{showProcessModal && processingAlarm && (
  <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowProcessModal(false)}>
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 shadow-2xl p-6 w-[450px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <CheckCircle size={20} className="text-green-400" />
          处理告警
        </h3>
        <button onClick={() => setShowProcessModal(false)} className="p-1 hover:bg-slate-700 rounded">
          <X size={18} className="text-slate-400" />
        </button>
      </div>
      
      <div className="space-y-4">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-sm text-slate-400 mb-1">告警信息</div>
          <div className="text-white font-medium">{processingAlarm.title}</div>
          <div className="text-xs text-slate-400 mt-1">{processingAlarm.description}</div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">处理结果</label>
          <div className="flex gap-3">
            <button
              onClick={() => setProcessAction('resolved')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                processAction === 'resolved'
                  ? 'bg-green-500/30 text-green-400 border border-green-400/50'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
              }`}
            >
              ✓ 已处理
            </button>
            <button
              onClick={() => setProcessAction('ignored')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                processAction === 'ignored'
                  ? 'bg-red-500/30 text-red-400 border border-red-400/50'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
              }`}
            >
              ✗ 误报忽略
            </button>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">备注说明</label>
          <textarea
            value={processRemark}
            onChange={(e) => setProcessRemark(e.target.value)}
            placeholder="可填写处理措施、处分结果、情况说明等..."
            rows={4}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>
      </div>
      
      <div className="flex gap-3 mt-6">
        <button
          onClick={handleConfirmProcess}
          className="flex-1 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-lg text-sm font-medium transition-all"
        >
          确认处理
        </button>
        <button
          onClick={() => setShowProcessModal(false)}
          className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-all"
        >
          取消
        </button>
      </div>
    </div>
  </div>
)}
{/* 报警截图预览弹窗 */}
{previewImage && (
  <div
    className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    onClick={() => setPreviewImage(null)}
  >
    <div
      className="relative bg-slate-900 rounded-2xl border border-cyan-400/30 shadow-2xl p-4 max-w-[90vw] max-h-[90vh]"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => setPreviewImage(null)}
        className="absolute right-3 top-3 z-10 p-1.5 bg-black/50 hover:bg-black/70 rounded-lg"
      >
        <X size={18} className="text-white" />
      </button>

      <img
        src={previewImage}
        alt="报警截图"
        className="max-w-[85vw] max-h-[82vh] rounded-lg object-contain"
      />
    </div>
  </div>
)}

{previewVideo && (
  <div
    className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    onClick={() => {
      setPreviewVideo(null);
      setSelectedVideoAlarm(null);
    }}
  >
    <div
      className="relative bg-slate-900 rounded-2xl border border-cyan-400/30 shadow-2xl p-4 w-[900px] max-w-[92vw]"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          setPreviewVideo(null);
          setSelectedVideoAlarm(null);
        }}
        className="absolute right-3 top-3 z-10 p-1.5 bg-black/50 hover:bg-black/70 rounded-lg"
      >
        <X size={18} className="text-white" />
      </button>

      <div className="mb-3 pr-10">
        <div className="text-base font-semibold text-white">报警视频</div>
        {selectedVideoAlarm && (
          <div className="mt-1 text-xs text-slate-400 break-all">
            alarm_id={selectedVideoAlarm.id} snapshot={selectedVideoAlarm.snapshot || '-'} videoPath={selectedVideoAlarm.videoPath || '-'} alarmSecond={selectedVideoAlarm.alarmSecond ?? '-'}
          </div>
        )}
      </div>
      {selectedVideoAlarm && <AlarmPlaybackPlayer src={previewVideo} alarm={selectedVideoAlarm} />}
    </div>
  </div>
)}

    </div>
  );
}
