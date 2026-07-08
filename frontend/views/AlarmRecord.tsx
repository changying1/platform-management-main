import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { alarmApi, toStaticUrl, type AlarmResponse } from '../src/api/alarmApi';
import { getAlarmVideosList, type SavedPlaybackVideo } from '../src/api/videoApi';
import { withAuthTokenParam } from '../src/api/config';
import { formatAlarmDisplayTime, getAlarmDisplayTime, parseAlarmTimeValue } from '../src/utils/alarmTime';
import { getAlarmDisplayType, translateAlarmDisplayText as translateAlarmDisplayValue } from '../src/utils/alarmDisplay';
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
  ArrowUpDown,
  CheckSquare,
  Square
} from 'lucide-react';

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
const [searchKeyword, setSearchKeyword] = useState('');
const [startDate, setStartDate] = useState<string>('');
const [endDate, setEndDate] = useState<string>('');
const [showProcessModal, setShowProcessModal] = useState(false);
const [processingAlarm, setProcessingAlarm] = useState<AlarmRecord | null>(null);
const [processRemark, setProcessRemark] = useState('');
const [processError, setProcessError] = useState('');
const [isProcessingAlarm, setIsProcessingAlarm] = useState(false);
const [isBatchMode, setIsBatchMode] = useState(false);
const [selectedAlarmIds, setSelectedAlarmIds] = useState<Set<string>>(() => new Set());
const [batchProcessingAlarms, setBatchProcessingAlarms] = useState<AlarmRecord[]>([]);
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
  return !normalized || ['success', 'saved', 'completed', 'complete', 'done', 'ready'].includes(normalized);
};

const isPlaybackGeneratingStatus = (status?: string) =>
  ['pending', 'processing'].includes(String(status || '').toLowerCase());

const isPlaybackFailedStatus = (status?: string) =>
  ['failed', 'error'].includes(String(status || '').toLowerCase());

const getAlarmVideoNameValue = (source: Record<string, any> | SavedPlaybackVideo | undefined | null) => {
  if (!source) return '';
  const raw =
    (source as any).name ||
    (source as any).file_name ||
    getAlarmVideoPathValue(source);
  return String(raw || '').split(/[\\/]/).pop() || '';
};

const findAlarmPlaybackVideo = (list: SavedPlaybackVideo[], alarmId: string) => {
  const target = String(alarmId || '').trim();
  if (!target) return undefined;
  const alarmFilePrefix = `alarm_${target}_`;
  return list.find((item) => {
    if (String(item.alarm_id ?? '').trim() === target) return true;
    const name = getAlarmVideoNameValue(item);
    const path = getAlarmVideoPathValue(item);
    return name.includes(alarmFilePrefix) || path.includes(alarmFilePrefix);
  });
};

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
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes('offline') || text.includes('离线');
};

const translateAlarmDisplayText = (value: unknown, alarm?: any) => translateAlarmDisplayValue(value, alarm)
  .replace(/\bnohelmet\b/gi, '未佩戴安全帽')
  .replace(/\bno_helmet\b/gi, '未佩戴安全帽')
  .replace(/\bhelmet_missing\b/gi, '未佩戴安全帽')
  .replace(/\bhelmetmissing\b/gi, '未佩戴安全帽')
  .replace(/\bsmoking\b/gi, '吸烟')
  .replace(/\bphone\b/gi, '打电话')
  .replace(/\bfire\b/gi, '烟火')
  .replace(/\bflame\b/gi, '明火')
  .replace(/\bsmoke\b/gi, '发现烟雾')
  .replace(/\bnovest\b/gi, '未穿反光衣')
  .replace(/\bno_vest\b/gi, '未穿反光衣')
  .replace(/\breflective_vest_missing\b/gi, '未穿反光衣')
  .replace(/\breflectivevestmissing\b/gi, '未穿反光衣')
  .replace(/\bppe_violation\b/gi, alarm ? getAlarmDisplayType(alarm) : '\u9632\u62a4\u7528\u54c1\u7a7f\u6234\u5f02\u5e38')
  .replace(/\bunknown\b/gi, '未知异常')
  .replace(/\bpending\b/gi, '生成中')
  .replace(/\bgenerating\b/gi, '生成中')
  .replace(/\bwaiting\b/gi, '等待录像片段')
  .replace(/\bsaved\b/gi, '已生成')
  .replace(/\bno_video_segment\b/gi, '未找到可用录像片段')
  .replace(/\balarm_time_not_covered\b/gi, '录像未覆盖告警时刻')
  .replace(/\bvideo_failed\b/gi, '录像生成失败')
  .replace(/\bmissing_pre_and_post_segment\b/gi, '告警前后录像片段缺失')
  .replace(/\bmissing_pre_segment\b/gi, '告警前录像片段缺失')
  .replace(/\bmissing_post_segment\b/gi, '告警后录像片段缺失')
  .replace(/\bselected time range has no usable recording segments\b/gi, '所选时间段没有可用录像片段')
  .trim();

const mapAlarmFromApi = (item: AlarmResponse): AlarmRecord => {
  const rawItem = item as any;
  const sourceType = getAlarmSourceType(item);
  const isFence = sourceType === 'fence';

  const rawType = String(item.alarm_type || '');
  const title = getAlarmDisplayType(rawItem) || translateAlarmDisplayText(rawType, rawItem) || (isFence ? '\u56f4\u680f\u544a\u8b66' : '\u89c6\u9891\u544a\u8b66');
  const timestamp = getAlarmDisplayTime(rawItem);
  const alarmCode = `ALM-${formatAlarmCodeDate(timestamp)}-${item.id}`;

  const locationText =
    item.location && String(item.location).trim()
      ? String(item.location)
      : '未提供位置';

  const boxPerson = Array.isArray(rawItem.alarm_boxes)
    ? rawItem.alarm_boxes.find((box: any) =>
        box && (
          box.personName ||
          box.person_name ||
          box.trigger_person_name ||
          box.person?.username ||
          box.person?.name
        )
      )
    : null;
  const personName =
    rawItem.trigger_person_name ||
    rawItem.person_name ||
    rawItem.personnel_name ||
    rawItem.captured_person_name ||
    rawItem.bound_person_name ||
    rawItem.person_label ||
    boxPerson?.personName ||
    boxPerson?.person_name ||
    boxPerson?.trigger_person_name ||
    boxPerson?.person?.username ||
    boxPerson?.person?.name ||
    '未知';
  const personnelId =
    rawItem.personnel_id !== undefined && rawItem.personnel_id !== null
      ? String(rawItem.personnel_id)
      : rawItem.trigger_person_id !== undefined && rawItem.trigger_person_id !== null
        ? String(rawItem.trigger_person_id)
        : boxPerson?.personnel_id !== undefined && boxPerson?.personnel_id !== null
          ? String(boxPerson.personnel_id)
          : boxPerson?.trigger_person_id !== undefined && boxPerson?.trigger_person_id !== null
            ? String(boxPerson.trigger_person_id)
            : boxPerson?.person?.id !== undefined && boxPerson?.person?.id !== null
              ? String(boxPerson.person.id)
      : undefined;
  const hasRecognizedPerson = Boolean(
    personnelId ||
    (
      personName &&
      !['未知', '未知人员', '未识别', '-', ''].includes(String(personName).trim())
    )
  );
  const branchName = hasRecognizedPerson
    ? (rawItem.person_branch_name || rawItem.person_company || rawItem.branch_name || rawItem.company || rawItem.department || '')
    : (rawItem.branch_name || rawItem.company || rawItem.department || '');
  const projectName = hasRecognizedPerson
    ? (rawItem.person_project_name || rawItem.person_project || rawItem.project_name || rawItem.project || '')
    : (rawItem.project_name || rawItem.project || '');
  const gridName = hasRecognizedPerson
    ? (rawItem.person_grid_name || rawItem.person_grid || rawItem.grid_name || rawItem.grid || '')
    : (rawItem.grid_name || rawItem.grid || '');
  const team = hasRecognizedPerson
    ? (rawItem.person_team_name || rawItem.person_team || rawItem.team_name || rawItem.team || rawItem.work_team || rawItem.workTeam || '')
    : (rawItem.team_name || rawItem.team || rawItem.work_team || rawItem.workTeam || '');
  const personText = [personName !== '未知' ? personName : '', personnelId].filter(Boolean).join(' / ');
  const deviceId =
    item.device_id !== undefined && item.device_id !== null
      ? String(item.device_id)
      : '';

  return {
    id: String(item.id),
    alarmCode,
    alarmType: title,
    recordKey: [
      sourceType,
      item.id,
      timestamp,
      item.fence_id ?? '',
      rawItem._id ?? '',
    ].join('-'),
    type: isFence ? 'fence' : 'video',
    title,
    description: translateAlarmDisplayText(item.description, rawItem) || personText || title,
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
    recordingError: translateAlarmDisplayText(item.recording_error || item.error_message, rawItem),
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
      .filter((item) => !isOfflineAlarm(item))
      .filter((item) => requestedTab === 'all' || getAlarmSourceType(item) === requestedTab)
      .map(mapAlarmFromApi)
      .sort((a, b) => parseAlarmTimestamp(b.time).getTime() - parseAlarmTimestamp(a.time).getTime());

    alarmLoadCountsRef.current = { raw: data.length, normalized: mapped.length };
    setAlarms(mapped);
    setStats({
      total: mapped.length,
      pending: mapped.filter((alarm) => alarm.status === 'pending').length,
      fence: mapped.filter((alarm) => alarm.sourceType === 'fence').length,
      video: mapped.filter((alarm) => alarm.sourceType === 'video').length,
    });
    console.log('[AlarmRecord] raw=', data.length, 'normalized=', mapped.length);
  } catch (error) {
    console.error('加载告警记录失败:', error);
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

  const getAlarmTypeText = (alarm: AlarmRecord) => {
    const raw = String(alarm.title || '').trim();
    if (raw && raw !== '围栏告警' && raw !== '视频告警') return raw;
    return alarm.type === 'fence' ? '电子围栏闯入' : '视频识别告警';
  };

  const getSituationText = (alarm: AlarmRecord) => {
    const description = String(alarm.description || '').trim();
    if (description && description !== alarm.title) return description;
    const target = alarm.deviceName || alarm.personName || '未知对象';
    const location = alarm.location && alarm.location !== '未提供位置' ? alarm.location : '';
    return [target, location].filter(Boolean).join(' ');
  };

  const getAlarmDeviceText = (alarm: AlarmRecord) =>
    alarm.deviceName || '-';

  const getAlarmPersonText = (alarm: AlarmRecord) => alarm.personName || '-';

  const getAlarmLocationText = (alarm: AlarmRecord) =>
    alarm.type === 'fence' && alarm.location && alarm.location !== '未提供位置' ? alarm.location : '-';

  const displayValue = (value?: string | number | null) => {
    const text = String(value ?? '').trim();
    if (!text || ['-', 'string', 'null', 'undefined', '未知', '未提供位置'].includes(text)) return '-';
    if (/^未分配/.test(text)) return '-';
    return text;
  };

  const getDefaultSortDirection = (key: AlarmSortKey): AlarmSortDirection => key === 'time' ? 'desc' : 'asc';

  const handleSort = (key: AlarmSortKey) => {
    setSortConfig(current => {
      if (current.key !== key) return { key, direction: getDefaultSortDirection(key) };
      return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const getSortValue = (alarm: AlarmRecord, key: AlarmSortKey) => {
    const levelOrder = { high: 3, medium: 2, low: 1 };
    const statusOrder = { pending: 3, resolved: 2, ignored: 1 };
    switch (key) {
      case 'type': return getAlarmTypeText(alarm);
      case 'situation': return getSituationText(alarm);
      case 'level': return levelOrder[alarm.level] || 0;
      case 'person': return getAlarmPersonText(alarm);
      case 'device': return getAlarmDeviceText(alarm);
      case 'location': return getAlarmLocationText(alarm);
      case 'branch': return alarm.branchName || '-';
      case 'project': return alarm.projectName || (alarm.projectId ? `项目 ${alarm.projectId}` : '-');
      case 'grid': return alarm.gridName || '-';
      case 'team': return alarm.team || '-';
      case 'status': return statusOrder[alarm.status] || 0;
      case 'time': return parseAlarmTimestamp(alarm.time).getTime() || 0;
      default: return '';
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
  setBatchProcessingAlarms([]);
  setProcessAction(action);
  setProcessRemark('');
  setProcessError('');
  setShowProcessModal(true);
};

const handleOpenBatchProcessModal = (action: 'resolved' | 'ignored' = 'resolved') => {
  const targets = sortedAlarms.filter((alarm) => selectedAlarmIds.has(alarm.id) && alarm.status === 'pending');
  if (targets.length === 0) {
    alert('请先选择需要处理的待处理告警');
    return;
  }
  setProcessingAlarm(null);
  setBatchProcessingAlarms(targets);
  setProcessAction(action);
  setProcessRemark('');
  setProcessError('');
  setShowProcessModal(true);
};

const openAlarmVideo = async (alarm: AlarmRecord) => {
  if (isPlaybackGeneratingStatus(alarm.recordingStatus)) {
    alert('告警回放生成中');
    return;
  }

  if (isPlaybackFailedStatus(alarm.recordingStatus)) {
    alert(alarm.recordingError || '暂未找到该告警回放视频');
    return;
  }

  let videoPath = alarm.videoPath;

  if (!videoPath && isPlaybackReadyStatus(alarm.recordingStatus)) {
    const deviceId = Number(alarm.deviceId);
    if (!Number.isFinite(deviceId) || deviceId <= 0) {
      alert('暂未找到该告警回放视频');
      return;
    }

    try {
      const videos = await getAlarmVideosList(deviceId, 500);
      const matchedVideo = findAlarmPlaybackVideo(videos, alarm.id);
      videoPath = resolveAlarmVideoUrl(getAlarmVideoPathValue(matchedVideo));
    } catch (error) {
      console.error('查询告警回放失败:', error);
      alert('暂未找到该告警回放视频');
      return;
    }
  }

  if (!videoPath) {
    alert('暂未找到该告警回放视频');
    return;
  }

  const playableAlarm = { ...alarm, videoPath };
  console.log('[ALARM_RECORD_BINDING]', {
    alarm_id: alarm.id,
    snapshot: alarm.snapshot || '',
    videoPath,
    alarmSecond: alarm.alarmSecond,
  });
  setSelectedVideoAlarm(playableAlarm);
  setPreviewVideo(videoPath);
  setAlarms((current) =>
    current.map((item) => item.id === alarm.id ? { ...item, videoPath } : item)
  );
  setSelectedAlarm((current) =>
    current?.id === alarm.id ? { ...current, videoPath } : current
  );
};

const handleConfirmProcess = async () => {
  const targets = batchProcessingAlarms.length > 0
    ? batchProcessingAlarms
    : processingAlarm
      ? [processingAlarm]
      : [];
  if (targets.length === 0 || isProcessingAlarm) return;

  const currentUser = localStorage.getItem('username') || '未知用户';

  try {
    setIsProcessingAlarm(true);
    setProcessError('');
    await Promise.all(targets.map((alarm) => (
      processAction === 'resolved'
        ? alarmApi.resolveAlarm(Number(alarm.id), {
            handler: currentUser,
            remark: processRemark,
          })
        : alarmApi.updateAlarm(Number(alarm.id), {
            status: 'ignored',
            handler: currentUser,
            remark: processRemark,
          })
    )));

    await loadAlarms();
    targets.forEach((alarm) => {
      window.dispatchEvent(new CustomEvent('alarmStatusChanged', {
        detail: {
          alarmId: alarm.id,
          deviceId: alarm.deviceId,
          sourceType: alarm.sourceType,
          status: processAction,
        },
      }));
    });

    setShowProcessModal(false);
    setProcessingAlarm(null);
    setBatchProcessingAlarms([]);
    setSelectedAlarmIds(new Set());
    setIsBatchMode(false);
    setSelectedAlarm(null);
  } catch (error) {
    console.error('处理告警失败:', error);
    setProcessError('处理失败，请检查后端服务或当前账号权限后重试。');
  } finally {
    setIsProcessingAlarm(false);
  }
};

  const getAlarmCompanyName = (alarm: AlarmRecord) => alarm.branchName || '未分配分公司';
  const getAlarmProjectName = (alarm: AlarmRecord) =>
    alarm.projectName ||
    (alarm.projectId !== undefined && alarm.projectId !== null
      ? `项目 ${alarm.projectId}`
      : '未分配项目');
  const getAlarmGridName = (alarm: AlarmRecord) => alarm.gridName || '未分配网格';
  const getAlarmTeamName = (alarm: AlarmRecord) => alarm.team || '未分配工队';
  const alarmMatchesKeyword = (alarm: AlarmRecord, keyword: string) => {
    const terms = normalizeAlarmSearchText(keyword).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;

    const haystack = [
      alarm.title,
      alarm.description,
      alarm.level,
      alarm.status,
      alarm.type,
      alarm.sourceType,
      alarm.deviceName,
      alarm.deviceId,
      alarm.location,
      alarm.fenceId,
      alarm.fenceName,
      alarm.projectId,
      getAlarmCompanyName(alarm),
      getAlarmProjectName(alarm),
      getAlarmGridName(alarm),
      getAlarmTeamName(alarm),
      alarm.personName,
      getAlarmPersonText(alarm),
      getAlarmDeviceText(alarm),
      getAlarmLocationText(alarm),
      getSituationText(alarm),
      getAlarmTypeText(alarm),
    ].map(normalizeAlarmSearchText).join(' ');

    return terms.every((term) => haystack.includes(term));
  };

  const companyOptions = Array.from(new Set(alarms.map(getAlarmCompanyName))).filter(Boolean);
  const projectOptions = Array.from(new Set(
    alarms
      .filter((alarm) => selectedCompany === 'all' || getAlarmCompanyName(alarm) === selectedCompany)
      .map(getAlarmProjectName)
  )).filter(Boolean);
  const gridOptions = Array.from(new Set(
    alarms
      .filter((alarm) => selectedCompany === 'all' || getAlarmCompanyName(alarm) === selectedCompany)
      .filter((alarm) => selectedProject === 'all' || getAlarmProjectName(alarm) === selectedProject)
      .map(getAlarmGridName)
  )).filter(Boolean);
  const teamOptions = Array.from(new Set(
    alarms
      .filter((alarm) => selectedCompany === 'all' || getAlarmCompanyName(alarm) === selectedCompany)
      .filter((alarm) => selectedProject === 'all' || getAlarmProjectName(alarm) === selectedProject)
      .filter((alarm) => selectedGrid === 'all' || getAlarmGridName(alarm) === selectedGrid)
      .map(getAlarmTeamName)
  )).filter(Boolean);

  const filteredAlarms = alarms.filter(alarm => {
    // 类型筛选
    if (activeTab !== 'all' && alarm.sourceType !== activeTab) return false;
    // 状态筛选
    if (filterStatus !== 'all' && alarm.status !== filterStatus) return false;
    if (selectedCompany !== 'all') {
      const companyName = getAlarmCompanyName(alarm);
      if (companyName !== selectedCompany) {
        return false;
      }
    }

    if (selectedProject !== 'all') {
      const projectName = getAlarmProjectName(alarm);
      if (projectName !== selectedProject) {
        return false;
      }
    }

    if (selectedGrid !== 'all') {
      if (getAlarmGridName(alarm) !== selectedGrid) {
        return false;
      }
    }

    // 工队筛选
    if (selectedTeam !== 'all') {
      if (getAlarmTeamName(alarm) !== selectedTeam) {
        return false;
      }
    }

    // 关键词搜索
    if (!alarmMatchesKeyword(alarm, searchKeyword)) return false;

    // 日期范围筛选
    const alarmDate = parseAlarmTimestamp(alarm.time);
    const filterStart = parseAlarmFilterDateTime(startDate);
    const filterEnd = parseAlarmFilterDateTime(endDate);
    if (filterStart && alarmDate < filterStart) return false;
    if (filterEnd && alarmDate > filterEnd) return false;
    return true;
  });

  useEffect(() => {
    console.log(
      '[AlarmRecord] raw=',
      alarmLoadCountsRef.current.raw,
      'normalized=',
      alarmLoadCountsRef.current.normalized,
      'filtered=',
      filteredAlarms.length
    );
  }, [filteredAlarms.length]);

  const sortedAlarms = [...filteredAlarms].sort((a, b) => {
    const aValue = getSortValue(a, sortConfig.key);
    const bValue = getSortValue(b, sortConfig.key);
    let result = 0;
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      result = aValue - bValue;
    } else {
      result = String(aValue).localeCompare(String(bValue), 'zh-CN', {
        numeric: true,
        sensitivity: 'base',
      });
    }
    return sortConfig.direction === 'asc' ? result : -result;
  });

  useEffect(() => {
    setSelectedAlarmIds((current) => {
      const validIds = new Set(alarms.filter((alarm) => alarm.status === 'pending').map((alarm) => alarm.id));
      const next = new Set(Array.from(current).filter((id) => validIds.has(id)));
      if (next.size === current.size) return current;
      return next;
    });
  }, [alarms]);

  const pendingSortedAlarms = sortedAlarms.filter((alarm) => alarm.status === 'pending');
  const selectedBatchAlarms = sortedAlarms.filter((alarm) => selectedAlarmIds.has(alarm.id) && alarm.status === 'pending');
  const isAllBatchSelected = pendingSortedAlarms.length > 0 &&
    pendingSortedAlarms.every((alarm) => selectedAlarmIds.has(alarm.id));

  const toggleBatchMode = () => {
    setIsBatchMode((current) => {
      const next = !current;
      if (!next) {
        setSelectedAlarmIds(new Set());
      }
      return next;
    });
  };

  const toggleAlarmSelection = (alarm: AlarmRecord) => {
    if (alarm.status !== 'pending') return;
    setSelectedAlarmIds((current) => {
      const next = new Set(current);
      if (next.has(alarm.id)) {
        next.delete(alarm.id);
      } else {
        next.add(alarm.id);
      }
      return next;
    });
  };

  const toggleSelectAllBatchAlarms = () => {
    setSelectedAlarmIds((current) => {
      const next = new Set(current);
      if (isAllBatchSelected) {
        pendingSortedAlarms.forEach((alarm) => next.delete(alarm.id));
      } else {
        pendingSortedAlarms.forEach((alarm) => next.add(alarm.id));
      }
      return next;
    });
  };

  const sortOptions: { key: AlarmSortKey; label: string }[] = [
    { key: 'time', label: '告警时间' },
    { key: 'level', label: '严重等级' },
    { key: 'status', label: '处理状态' },
    { key: 'type', label: '告警类型' },
    { key: 'device', label: '告警设备' },
    { key: 'project', label: '项目' },
    { key: 'team', label: '工队' },
  ];

  return (
    <div className="h-full overflow-auto p-6 pb-28 xl:pr-24">
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
          {/* 四级单位筛选 */}
          <div className="flex flex-wrap items-center gap-2">
            {scopeState.showCompanyFilter && (
              <select
                value={selectedCompany}
                onChange={(e) => {
                  setSelectedCompany(e.target.value);
                  setSelectedProject('all');
                  setSelectedGrid('all');
                  setSelectedTeam('all');
                }}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 min-w-[130px]"
              >
                <option value="all">所有分公司</option>
                {companyOptions.map((company) => <option key={company} value={company}>{company}</option>)}
              </select>
            )}
            {scopeState.showProjectFilter && (
              <select
                value={selectedProject}
                onChange={(e) => {
                  setSelectedProject(e.target.value);
                  setSelectedGrid('all');
                  setSelectedTeam('all');
                }}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 min-w-[130px]"
              >
                <option value="all">所有项目</option>
                {projectOptions.map((project) => <option key={project} value={project}>{project}</option>)}
              </select>
            )}
            <select
              value={selectedGrid}
              onChange={(e) => {
                setSelectedGrid(e.target.value);
                setSelectedTeam('all');
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 min-w-[130px]"
            >
              <option value="all">所有网格</option>
              {gridOptions.map((grid) => <option key={grid} value={grid}>{grid}</option>)}
            </select>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 min-w-[130px]"
            >
              <option value="all">所有工队</option>
              {teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
            </select>
          </div>

{/* 时间范围筛选 */}
<div className="flex items-center gap-2">
  <Calendar size={14} className="text-slate-400" />
  <input
    type="datetime-local"
    step="60"
    value={startDate}
    onChange={(e) => setStartDate(e.target.value)}
    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
  />
  <span className="text-slate-500">-</span>
  <input
    type="datetime-local"
    step="60"
    value={endDate}
    onChange={(e) => setEndDate(e.target.value)}
    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
  />
  {(startDate || endDate) && (
    <button onClick={clearDateFilter} className="px-2 py-1 text-sm text-cyan-400">清除</button>
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
          {canHandleAlarm && (
            <div className="flex items-center gap-2">
              {isBatchMode && (
                <>
                  <button
                    type="button"
                    onClick={toggleSelectAllBatchAlarms}
                    disabled={pendingSortedAlarms.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition-all hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:text-slate-500"
                  >
                    {isAllBatchSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenBatchProcessModal('resolved')}
                    disabled={selectedBatchAlarms.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-500/20 px-3 py-2 text-sm font-medium text-green-300 transition-all hover:bg-green-500/30 disabled:cursor-not-allowed disabled:bg-slate-700/40 disabled:text-slate-500"
                  >
                    <CheckCircle size={15} />
                    确定处理{selectedBatchAlarms.length > 0 ? `(${selectedBatchAlarms.length})` : ''}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={toggleBatchMode}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  isBatchMode
                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    : 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'
                }`}
              >
                {isBatchMode ? '取消批量' : '批量处理'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 告警列表 - 卡片型 */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-400/20 bg-slate-800/50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Filter size={15} className="text-cyan-400" />
            <span>共 {filteredAlarms.length} 条</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">排序</span>
            {sortOptions.map(({ key, label }) => {
              const active = sortConfig.key === key;
              const Icon = active ? (sortConfig.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSort(key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-300'
                      : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200'
                  }`}
                  title={`点击按${label}排序`}
                >
                  {label}
                  <Icon size={13} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 p-4 pb-8">
          {sortedAlarms.map(alarm => {
            const typeText = displayValue(getAlarmTypeText(alarm));
            const situationText = displayValue(getSituationText(alarm));
            const personText = displayValue(getAlarmPersonText(alarm));
            const deviceName = displayValue(alarm.deviceName);
            const locationText = displayValue(alarm.location && alarm.location !== '未提供位置' ? alarm.location : getAlarmLocationText(alarm));
            const companyText = displayValue(alarm.branchName);
            const projectText = displayValue(alarm.projectName || (alarm.projectId ? `项目 ${alarm.projectId}` : ''));
            const gridText = displayValue(alarm.gridName);
            const teamText = displayValue(alarm.team);
            const isSelectedForBatch = selectedAlarmIds.has(alarm.id);
            const isSelectableForBatch = alarm.status === 'pending';

            return (
              <article
                key={alarm.recordKey}
                onClick={() => {
                  if (isBatchMode) {
                    toggleAlarmSelection(alarm);
                    return;
                  }
                  setSelectedAlarm(alarm);
                }}
                className={`group cursor-pointer rounded-lg border px-4 py-3 transition-all hover:border-cyan-400/35 hover:bg-slate-800/45 ${
                  isSelectedForBatch
                    ? 'border-cyan-400/60 bg-cyan-500/10'
                    : alarm.status === 'pending'
                    ? 'border-red-400/20 bg-red-500/5'
                    : 'border-slate-700/70 bg-slate-950/25'
                }`}
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                  {isBatchMode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAlarmSelection(alarm);
                      }}
                      disabled={!isSelectableForBatch}
                      title={isSelectableForBatch ? '选择此告警' : '仅待处理告警可批量处理'}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all ${
                        isSelectedForBatch
                          ? 'border-cyan-400 bg-cyan-500/25 text-cyan-200'
                          : isSelectableForBatch
                            ? 'border-slate-600 bg-slate-900/60 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200'
                            : 'cursor-not-allowed border-slate-700 bg-slate-800/50 text-slate-600'
                      }`}
                    >
                      {isSelectedForBatch ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                  )}
                  <div className="flex min-w-0 items-center gap-3 xl:w-[230px] xl:shrink-0">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                      alarm.type === 'fence' ? 'bg-blue-500/20' : 'bg-purple-500/20'
                    }`}>
                      {alarm.type === 'fence' ? (
                        <ShieldAlert size={24} className="text-blue-400" />
                      ) : (
                        <Video size={24} className="text-purple-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[17px] font-bold leading-tight text-white" title={typeText}>
                        {typeText}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${getLevelColor(alarm.level)}`}>
                          {getLevelText(alarm.level)}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${getStatusColor(alarm.status)}`}>
                          {getStatusText(alarm.status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2 text-[15px] text-slate-300 2xl:flex-nowrap">
                    <div className="contents">
                      <div className="flex min-w-[220px] flex-[1.25_1_260px] items-center gap-1.5 text-slate-200" title={situationText}>
                        <span className="text-sm font-semibold text-slate-400">情况：</span>
                        <span className="truncate font-medium">{situationText}</span>
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-[3_1_760px] items-center gap-x-5 overflow-hidden whitespace-nowrap">
                      <span className="inline-flex min-w-[112px] flex-1 items-center gap-1.5">
                        <User size={15} className="shrink-0 text-cyan-400" />
                        <span className="shrink-0 text-sm font-semibold text-slate-300">违规人员</span>
                        <b className="truncate font-medium text-white" title={personText}>{personText}</b>
                      </span>
                      <span className="inline-flex min-w-[128px] flex-1 items-center gap-1.5">
                        <Video size={15} className="shrink-0 text-purple-400" />
                        <span className="shrink-0 text-sm font-semibold text-slate-300">设备</span>
                        <b className="truncate font-medium text-white" title={deviceName}>{deviceName}</b>
                      </span>
                      <span className="inline-flex min-w-[96px] flex-1 items-center gap-1.5">
                        <MapPin size={15} className="text-slate-500" />
                        <span className="shrink-0 text-sm font-semibold text-slate-300">地点</span>
                        <b className="truncate font-medium text-slate-100" title={locationText}>{locationText}</b>
                      </span>
                      <span className="inline-flex min-w-[112px] flex-1 items-center gap-1.5">
                        <span className="shrink-0 text-sm font-semibold text-slate-300">分公司</span>
                        <b className="truncate font-medium text-slate-100" title={companyText}>{companyText}</b>
                      </span>
                      <span className="inline-flex min-w-[96px] flex-1 items-center gap-1.5">
                        <span className="shrink-0 text-sm font-semibold text-slate-300">项目</span>
                        <b className="truncate font-medium text-slate-100" title={projectText}>{projectText}</b>
                      </span>
                      <span className="inline-flex min-w-[88px] flex-1 items-center gap-1.5">
                        <span className="shrink-0 text-sm font-semibold text-slate-300">网格</span>
                        <b className="truncate font-medium text-slate-100" title={gridText}>{gridText}</b>
                      </span>
                      <span className="inline-flex min-w-[80px] flex-1 items-center gap-1.5">
                        <span className="shrink-0 text-sm font-semibold text-slate-300">工队</span>
                        <b className="truncate font-medium text-slate-100" title={teamText}>{teamText}</b>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:max-w-[390px] xl:shrink-0 xl:justify-end">
                    <div className="flex items-center gap-1 text-sm text-slate-400 xl:w-full xl:justify-end">
                      <Clock size={15} className="text-slate-500" />
                      <span>{formatAlarmTimestamp(alarm.time)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      {alarm.snapshot && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(alarm.snapshot!);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-500/20 px-3 py-1.5 text-[13px] font-medium text-blue-400 transition-all hover:bg-blue-500/30"
                        >
                          <ImageIcon size={15} />
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
                          className="inline-flex items-center gap-1 rounded-lg bg-purple-500/20 px-3 py-1.5 text-[13px] font-medium text-purple-300 transition-all hover:bg-purple-500/30 disabled:cursor-not-allowed disabled:bg-slate-700/40 disabled:text-slate-500"
                        >
                          <Video size={15} />
                          {isPlaybackGeneratingStatus(alarm.recordingStatus) ? '生成中' : '告警回放'}
                        </button>
                      )}

                      {canHandleAlarm && alarm.status === 'pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenProcessModal(alarm, 'resolved');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-500/20 px-3 py-1.5 text-[13px] font-medium text-green-400 transition-all hover:bg-green-500/30"
                        >
                          <CheckCircle size={15} />
                          处理
                        </button>
                      )}

                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm(`确认隐藏 ${alarm.alarmCode}？隐藏后可在日志中查看快照详情`)) {
                            await alarmApi.hideAlarm(Number(alarm.id));
                            await loadAlarms();
                          }
                        }}
                        className="inline-flex items-center rounded-lg bg-slate-500/20 px-3 py-1.5 text-[13px] font-medium text-slate-300 transition-all hover:bg-slate-500/30"
                      >
                        隐藏
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
                <div className="col-span-2">
                  <span className="text-slate-400">违规人员：</span>
                  <span className="text-slate-200">
                    {selectedAlarm.personName}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">报警信息：</span>
                  <p className="text-slate-200 mt-1">{selectedAlarm.description}</p>
                </div>
                {selectedAlarm.recordingStatus && (
                  <div>
                    <span className="text-slate-400">录像状态：</span>
                    <span className="text-slate-200">{translateAlarmDisplayText(selectedAlarm.recordingStatus)}</span>
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
                  if (window.confirm(`确认隐藏 ${selectedAlarm.alarmCode}？隐藏后可在日志中查看快照详情`)) {
                    await alarmApi.hideAlarm(Number(selectedAlarm.id));
                    setSelectedAlarm(null);
                    await loadAlarms();
                  }
                }}
                className="flex-1 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm font-medium transition-all"
              >
                隐藏
              </button>
              <button onClick={() => setSelectedAlarm(null)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-all">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

    {/* 处理弹窗 */}
{canHandleAlarm && showProcessModal && (processingAlarm || batchProcessingAlarms.length > 0) && (
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
          <div className="text-sm text-slate-400 mb-1">
            {batchProcessingAlarms.length > 0 ? '批量处理信息' : '告警信息'}
          </div>
          {batchProcessingAlarms.length > 0 ? (
            <>
              <div className="text-white font-medium">已选择 {batchProcessingAlarms.length} 条待处理告警</div>
              <div className="mt-2 max-h-20 overflow-auto text-xs text-slate-400">
                {batchProcessingAlarms.slice(0, 5).map((alarm) => (
                  <div key={alarm.id} className="truncate">{alarm.alarmCode} · {alarm.title}</div>
                ))}
                {batchProcessingAlarms.length > 5 && (
                  <div>还有 {batchProcessingAlarms.length - 5} 条...</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="text-white font-medium">{processingAlarm?.title}</div>
              <div className="text-xs text-slate-400 mt-1">{processingAlarm?.description}</div>
            </>
          )}
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
          {isProcessingAlarm
            ? '处理中...'
            : batchProcessingAlarms.length > 0
              ? `确认处理(${batchProcessingAlarms.length})`
              : '确认处理'}
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
