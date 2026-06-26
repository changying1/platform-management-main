import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { alarmApi, toStaticUrl, type AlarmResponse } from '../src/api/alarmApi';
import { getAlarmPlaybackVideos, type SavedPlaybackVideo } from '../src/api/videoApi';
import { withAuthTokenParam } from '../src/api/config';
import { formatAlarmDisplayTime, getAlarmDisplayTime, parseAlarmTimeValue } from '../src/utils/alarmTime';
import { hasStoredPermission } from '../src/utils/permissions';
import { getStoredScopeState } from '../src/utils/authScope';
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
  ImageIcon,
  ArrowDown,
  ArrowUp,
  ArrowUpDown
} from 'lucide-react';

const cleanAlarmDisplayText = (value?: string | null) => String(value || '')
  .replace(/[\uFF08(]\s*\d{1,3}(?:\.\d+)?\s*%\s*[\uFF09)]/g, '')
  .replace(/\bconfidence\s*[:\uFF1A]?\s*\d{1,3}(?:\.\d+)?\s*%?/gi, '')
  .replace(/\u7F6E\u4FE1\u5EA6\s*[:\uFF1A]?\s*\d{1,3}(?:\.\d+)?\s*%?/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

// 告警记录类型
interface AlarmRecord {
  id: string;
  alarmCode: string;
  alarmType: string;
  recordKey: string;
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
  personName?: string;
  personnelId?: string;
  branchName?: string;
  projectName?: string;
  gridName?: string;
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
  sourceType?: 'fence' | 'video';
}

type AlarmSortKey =
  | 'type'
  | 'situation'
  | 'level'
  | 'person'
  | 'device'
  | 'location'
  | 'branch'
  | 'project'
  | 'grid'
  | 'team'
  | 'status'
  | 'time';

type AlarmSortDirection = 'asc' | 'desc';

const parseAlarmTimestamp = parseAlarmTimeValue;

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

const formatAlarmTimestamp = (timestamp?: string) => {
  return formatAlarmDisplayTime(timestamp);
};

const parseAlarmFilterDateTime = (value: string) => {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeAlarmSearchText = (value: unknown) =>
  String(value ?? '').trim().toLowerCase();

export default function AlarmRecords() {
  const scopeState = getStoredScopeState();
  const [activeTab, setActiveTab] = useState<'all' | 'fence' | 'video'>('all');
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, fence: 0, video: 0 });
  const [selectedAlarm, setSelectedAlarm] = useState<AlarmRecord | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
// 获取默认日期范围（结束时间为当前时间，开始时间为空表示无限制）
const getDefaultDateRange = () => {
  const end = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    startDate: '',
    startTime: '',
    endDate: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
  };
};

const defaultDateRange = getDefaultDateRange();
const [searchKeyword, setSearchKeyword] = useState('');
const [startDate, setStartDate] = useState<string>(defaultDateRange.startDate);
const [startTime, setStartTime] = useState<string>(defaultDateRange.startTime);
const [endDate, setEndDate] = useState<string>(defaultDateRange.endDate);
const [endTime, setEndTime] = useState<string>(defaultDateRange.endTime);
const [showProcessModal, setShowProcessModal] = useState(false);
const [processingAlarm, setProcessingAlarm] = useState<AlarmRecord | null>(null);
const [processRemark, setProcessRemark] = useState('');
const [processError, setProcessError] = useState('');
const [isProcessingAlarm, setIsProcessingAlarm] = useState(false);
const [previewImage, setPreviewImage] = useState<string | null>(null);
const [previewVideo, setPreviewVideo] = useState<string | null>(null);
const [selectedVideoAlarm, setSelectedVideoAlarm] = useState<AlarmRecord | null>(null);
const [processAction, setProcessAction] = useState<'resolved' | 'ignored'>('resolved');
const canHandleAlarm = hasStoredPermission('alarm.handle');
const [selectedCompany, setSelectedCompany] = useState<string>('all');
const [selectedProject, setSelectedProject] = useState<string>('all');
const [selectedGrid, setSelectedGrid] = useState<string>('all');
const [selectedTeam, setSelectedTeam] = useState<string>('all');
const loadSeqRef = useRef(0);
const alarmLoadCountsRef = useRef({ raw: 0, normalized: 0 });

const formatAlarmCodeDate = (timestamp?: string) => {
  const date = timestamp ? parseAlarmTimestamp(timestamp) : null;
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

const normalizeAlarmStatus = (status?: string): AlarmRecord['status'] => {
  const normalized = String(status || '').toLowerCase();
  if (['resolved', 'processed', 'handled', 'done', 'closed', '已处理'].includes(normalized)) return 'resolved';
  if (['ignored', 'ignore', 'not_required', '已忽略'].includes(normalized)) return 'ignored';
  return 'pending';
};

const normalizeSearchText = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[：:\s_-]+/g, '')
    .replace(/设备|device/g, '');

const getAlarmVideoPathValue = (source: Record<string, any> | SavedPlaybackVideo | undefined | null) => {
  if (!source) return '';
  return String(
    (source as any).recording_path ||
    (source as any).video_url ||
    (source as any).clip_url ||
    (source as any).web_path ||
    (source as any).url ||
    ''
  ).trim();
};

const resolveAlarmVideoUrl = (path?: string) => {
  const rawPath = String(path || '').trim();
  if (!rawPath) return '';
  if (rawPath.startsWith('data:') || rawPath.startsWith('blob:')) return rawPath;
  if (/^https?:\/\//i.test(rawPath)) return withAuthTokenParam(rawPath);
  return toStaticUrl(rawPath);
};

const isPlaybackReadyStatus = (status?: string) => {
  const normalized = String(status || '').toLowerCase();
  return !normalized || ['success', 'completed', 'complete', 'done', 'ready'].includes(normalized);
};

const isPlaybackGeneratingStatus = (status?: string) =>
  ['pending', 'processing'].includes(String(status || '').toLowerCase());

const isPlaybackFailedStatus = (status?: string) =>
  ['failed', 'error'].includes(String(status || '').toLowerCase());

const findAlarmPlaybackVideo = (list: SavedPlaybackVideo[], alarmId: string) =>
  list.find((item) => String(item.alarm_id ?? '') === String(alarmId));

const [sortConfig, setSortConfig] = useState<{ key: AlarmSortKey; direction: AlarmSortDirection }>({
  key: 'time',
  direction: 'desc',
});
const getAlarmSourceType = (item: AlarmResponse): 'fence' | 'video' => {
  const rawItem = item as any;
  const sourceType = String(rawItem.source_type || '').toLowerCase();
  const alarmSource = String(rawItem.alarm_source || '').toLowerCase();
  const alarmType = String(item.alarm_type || '');
  const description = String(item.description || '');

  return sourceType === 'fence' ||
    alarmSource === 'fence' ||
    item.fence_id !== undefined && item.fence_id !== null ||
    alarmType.includes('围栏') ||
    description.includes('围栏')
    ? 'fence'
    : 'video';
};

const isOfflineAlarm = (item: AlarmResponse) => {
  const rawItem = item as any;
  const text = [
    item.alarm_type,
    rawItem.type,
    item.description,
    rawItem.alarm_content,
    rawItem.message,
  ].join(' ').toLowerCase();
  return text.includes('offline') || text.includes('离线');
};

const mapAlarmFromApi = (item: AlarmResponse): AlarmRecord => {
  const rawItem = item as any;
  const sourceType = getAlarmSourceType(item);
  const isFence = sourceType === 'fence';

  const rawType = String(item.alarm_type || '');
  const title = rawType || (isFence ? '围栏告警' : '视频告警');
  const timestamp = getAlarmDisplayTime(rawItem);
  const alarmCode = `ALM-${formatAlarmCodeDate(timestamp)}-${item.id}`;

  const locationText =
    item.location && String(item.location).trim()
      ? String(item.location)
      : '未提供位置';

  const branchName = rawItem.branch_name || rawItem.company || rawItem.department || '';
  const projectName = rawItem.project_name || rawItem.project || '';
  const gridName = rawItem.grid_name || rawItem.grid || '';
  const team = rawItem.team_name || rawItem.team || rawItem.work_team || rawItem.workTeam || '';
  const personName = rawItem.trigger_person_name || rawItem.person_name || rawItem.personnel_name || rawItem.captured_person_name || rawItem.bound_person_name || rawItem.person_label || '未知';
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
    recordKey: [
      sourceType,
      item.id,
      timestamp,
      item.fence_id ?? '',
      rawItem._id ?? '',
    ].join('-'),
    type: isFence ? 'fence' : 'video',
    title,
    description: item.description || personText || title,
    time: timestamp,
    level: getLevelFromSeverity(item.severity),
    severityRaw: item.severity || '',
    status: normalizeAlarmStatus(item.status),
    location: locationText,
    deviceName: rawItem.device_name || rawItem.video_name || deviceId || '未知设备',
    deviceId,
    personName,
    personnelId,
    branchName: branchName || undefined,
    projectName: projectName || undefined,
    gridName: gridName || undefined,
    team: team || undefined,
    snapshot: toStaticUrl(item.alarm_image_path || item.image_url || item.snapshot_url || rawItem.picture_url),
    videoPath: resolveAlarmVideoUrl(getAlarmVideoPathValue(rawItem)),
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
    sourceType,
  };
};
const loadAlarms = async () => {
  const requestSeq = ++loadSeqRef.current;
  const requestedTab = activeTab;
  try {
    const data = await alarmApi.getAlarms(undefined, undefined, 500);
    if (requestSeq !== loadSeqRef.current || requestedTab !== activeTab) return;
    const mapped = data
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead className="border-b border-blue-400/20 bg-slate-800/50">
              <tr>
                {renderSortHeader('type', '类型', 'w-[8%] px-3 py-3 text-left text-sm font-semibold text-slate-300')}
                {renderSortHeader('situation', '情况描述', 'w-[14%] px-3 py-3 text-left text-sm font-semibold text-slate-300')}
                {renderSortHeader('level', '等级', 'w-[5%] px-3 py-3 text-left text-sm font-semibold text-slate-300')}
                {renderSortHeader('person', '告警对象', 'w-[8%] px-3 py-3 text-left text-sm font-semibold text-slate-300')}
                {renderSortHeader('device', '告警设备', 'w-[13%] px-3 py-3 text-left text-sm font-semibold text-slate-300')}
                {renderSortHeader('location', '告警地点', 'w-[7%] px-3 py-3 text-left text-sm font-semibold text-slate-300')}
                {renderSortHeader('branch', '分公司', 'w-[8%] px-3 py-3 text-left text-sm font-semibold text-slate-300')}
                {renderSortHeader('project', '项目', 'w-[8%] px-3 py-3 text-left text-sm font-semibold text-slate-300')}
                {renderSortHeader('grid', '网格', 'w-[5%] px-3 py-3 text-left text-sm font-semibold text-slate-300')}
                {renderSortHeader('team', '工队', 'w-[5%] px-3 py-3 text-left text-sm font-semibold text-slate-300')}
                {renderSortHeader('status', '处置', 'w-[5%] px-3 py-3 text-left text-sm font-semibold text-slate-300')}
                {renderSortHeader('time', '告警时间', 'w-[6%] px-3 py-3 text-left text-sm font-semibold text-slate-300')}
                <th className="w-[11%] px-3 py-3 text-right text-sm font-semibold text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {sortedAlarms.map(alarm => (
                <tr
                   key={alarm.recordKey}
                   onClick={() => setSelectedAlarm(alarm)}
                   className={`hover:bg-slate-800/30 cursor-pointer transition-colors ${
                     alarm.status === 'pending' ? 'bg-red-500/5' : ''
                   }`}
                 >
                   <td className="px-3 py-3 align-top">
                     <div className="flex items-center gap-2 min-w-0">
                       <div className={`w-8 h-8 rounded-lg flex shrink-0 items-center justify-center ${
                         alarm.type === 'fence' ? 'bg-blue-500/20' : 'bg-purple-500/20'
                       }`}>
                         {alarm.type === 'fence' ? (
                           <ShieldAlert size={16} className="text-blue-400" />
                         ) : (
                           <Video size={16} className="text-purple-400" />
                         )}
                       </div>
                       <span className="truncate text-base font-semibold text-white" title={getAlarmTypeText(alarm)}>
                         {getAlarmTypeText(alarm)}
                       </span>
                     </div>
                   </td>
                   <td className="px-3 py-3 align-top">
                     <div
                       className="text-base leading-7 text-slate-300 overflow-hidden"
                       style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                       title={getSituationText(alarm)}
                     >
                       {getSituationText(alarm)}
                     </div>
                   </td>
                   <td className="px-3 py-3 align-top">
                      <span className={`text-sm px-2.5 py-1 rounded-full border ${getLevelColor(alarm.level)}`}>
                        {getLevelText(alarm.level)}
                      </span>
                   </td>
                   <td className="px-3 py-3 align-top">
                     <div className="truncate text-base leading-7 text-slate-200" title={getAlarmPersonText(alarm)}>
                       {getAlarmPersonText(alarm)}
                     </div>
                   </td>
                   <td className="px-3 py-3 align-top">
                     <div className="truncate text-base leading-7 text-slate-200" title={getAlarmDeviceText(alarm)}>
                       {getAlarmDeviceText(alarm)}
                     </div>
                     <div className="text-xs text-slate-500 mt-1">设备ID: {alarm.deviceId || '-'}</div>
                   </td>
                   <td className="px-3 py-3 align-top">
                     <div className="truncate text-base leading-7 text-slate-200" title={getAlarmLocationText(alarm)}>
                       {getAlarmLocationText(alarm)}
                     </div>
                   </td>
                   <td className="px-3 py-3 align-top">
                     <div className="truncate text-base leading-7 text-slate-200" title={alarm.branchName || '-'}>
                       {alarm.branchName || '-'}
                     </div>
                   </td>
                   <td className="px-3 py-3 align-top">
                     <div className="truncate text-base leading-7 text-slate-200" title={alarm.projectName || (alarm.projectId ? `项目 ${alarm.projectId}` : '-')}>
                       {alarm.projectName || (alarm.projectId ? `项目 ${alarm.projectId}` : '-')}
                     </div>
                   </td>
                   <td className="px-3 py-3 align-top">
                     <div className="truncate text-base leading-7 text-slate-200" title={alarm.gridName || '-'}>
                       {alarm.gridName || '-'}
                     </div>
                   </td>
                   <td className="px-3 py-3 align-top">
                     <div className="truncate text-base leading-7 text-slate-200" title={alarm.team || '-'}>
                       {alarm.team || '-'}
                     </div>
                   </td>
                   <td className="px-3 py-3 align-top">
                     <span className={`text-sm px-2.5 py-1 rounded-full ${getStatusColor(alarm.status)}`}>
                       {getStatusText(alarm.status)}
                     </span>
                   </td>
                   <td className="px-3 py-3 align-top">
                     <div className="flex items-start gap-1 text-sm text-slate-300">
                       <Clock size={14} className="mt-0.5 shrink-0 text-slate-500" />
                       <span className="leading-5">{formatAlarmTimestamp(alarm.time)}</span>
                     </div>
                   </td>
                   <td className="px-3 py-3 text-right align-top">
                    <div className="flex flex-row flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                      {alarm.snapshot && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(alarm.snapshot!);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-400 transition-all hover:bg-blue-500/30"
                        >
                          <ImageIcon size={14} />
                          截图
                        </button>
                      )}

                      {alarm.type === 'video' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openAlarmVideo(alarm);
                          }}
                          disabled={isPlaybackGeneratingStatus(alarm.recordingStatus)}
                          title={isPlaybackGeneratingStatus(alarm.recordingStatus) ? '告警回放生成中' : '查看告警回放'}
                          className="inline-flex items-center gap-1 rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-300 transition-all hover:bg-purple-500/30 disabled:cursor-not-allowed disabled:bg-slate-700/40 disabled:text-slate-500"
                        >
                          <Video size={14} />
                          {isPlaybackGeneratingStatus(alarm.recordingStatus) ? '生成中' : '告警回放'}
                        </button>
                      )}

                      {canHandleAlarm && alarm.status === 'pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenProcessModal(alarm, 'resolved');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 transition-all hover:bg-green-500/30"
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
                        className="inline-flex items-center rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-all hover:bg-red-500/30"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
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
                  <span className="text-slate-200">{formatAlarmTimestamp(selectedAlarm.time)}</span>
                </div>
                <div>
                  <span className="text-slate-400">所属分公司：</span>
                  <span className="text-slate-200">{selectedAlarm.branchName || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400">所属项目：</span>
                  <span className="text-slate-200">{selectedAlarm.projectName || (selectedAlarm.projectId ? `项目 ${selectedAlarm.projectId}` : '-')}</span>
                </div>
                <div>
                  <span className="text-slate-400">所属网格：</span>
                  <span className="text-slate-200">{selectedAlarm.gridName || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400">所属工队：</span>
                  <span className="text-slate-200">{selectedAlarm.team || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">触发人员：</span>
                  <span className="text-slate-200">{selectedAlarm.personName || '-'}</span>
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
                  <p className="text-slate-200 mt-1">{cleanAlarmDisplayText(selectedAlarm.description)}</p>
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
                {selectedAlarm.type === 'video' && (
                  <div className="col-span-2">
                    <span className="text-slate-400">告警回放：</span>
                    <button
                      onClick={() => {
                        openAlarmVideo(selectedAlarm);
                      }}
                      disabled={isPlaybackGeneratingStatus(selectedAlarm.recordingStatus)}
                      title={isPlaybackGeneratingStatus(selectedAlarm.recordingStatus) ? '告警回放生成中' : '查看告警回放'}
                      className="ml-2 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 disabled:bg-slate-700/40 disabled:text-slate-500 disabled:cursor-not-allowed text-purple-300 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1"
                    >
                      <Video size={14} />
                      {isPlaybackGeneratingStatus(selectedAlarm.recordingStatus) ? '告警回放生成中' : '查看告警回放'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              {canHandleAlarm && selectedAlarm.status === 'pending' && (
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
{canHandleAlarm && showProcessModal && processingAlarm && (
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
          <div className="text-xs text-slate-400 mt-1">{cleanAlarmDisplayText(processingAlarm.description)}</div>
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
        {processError && (
          <div className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {processError}
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={handleConfirmProcess}
          disabled={isProcessingAlarm}
          className="flex-1 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-slate-600 disabled:to-slate-600 disabled:text-slate-300 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all"
        >
          {isProcessingAlarm ? '处理中...' : '确认处理'}
        </button>
        <button
          onClick={() => setShowProcessModal(false)}
          disabled={isProcessingAlarm}
          className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/60 disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all"
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
        <div className="text-base font-semibold text-white">告警回放</div>
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
