
const cleanAlarmDisplayText = (value?: string | null) => String(value || '')
  .replace(/[\uFF08(]\s*\d{1,3}(?:\.\d+)?\s*%\s*[\uFF09)]/g, '')
  .replace(/\bconfidence\s*[:\uFF1A]?\s*\d{1,3}(?:\.\d+)?\s*%?/gi, '')
  .replace(/\u7F6E\u4FE1\u5EA6\s*[:\uFF1A]?\s*\d{1,3}(?:\.\d+)?\s*%?/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim();
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
// 鉁?鏂板锛氬鍏ョ湡瀹?API
import {
  getAllVideos,
  getPlaybackPage,
  type SavedPlaybackVideo,
} from "../src/api/videoApi";
import { API_BASE_URL, getApiUrl, getAuthHeaders, withAuthTokenParam } from "../src/api/config";
import { getStoredScopeState, isHeadquartersScope, readStoredAuth } from "../src/utils/authScope";

// 鉁?杞ㄨ抗API閰嶇疆锛堜粠TrackPlayback.tsx杩佺Щ锛?
const TRACK_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:9000";

// 鉁?杞ㄨ抗璁惧绫诲瀷锛堥€傞厤MongoDB鏁版嵁缁撴瀯锛?
interface TrackDevice {
  _id?: { $oid?: string };
  device_id: string;
  name: string;
  holder?: string;           // 浜哄憳濮撳悕锛堥€傞厤鏁版嵁搴撳瓧娈碉級
  person_name?: string;      // 鍏煎鏃у瓧娈?
  lat?: number;
  lng?: number;
  company?: string;
  project?: string;
  team?: string;
  status?: string;
  holderPhone?: string;
  lastUpdate?: string;
  createdAt?: string;
  updatedAt?: string;
  trajectory?: TrajectoryPoint[];  // 杞ㄨ抗鐩存帴鍦ㄨ澶囨枃妗ｄ腑
  remark?: string;
  type?: string;
}

// 鉁?杞ㄨ抗鐐圭被鍨嬶紙浠嶵rackPlayback.tsx杩佺Щ锛?
interface TrajectoryPoint {
  lat: number;
  lng: number;
  timestamp: string;
  speed?: number;
  direction?: number;
}

 // 鏂板锛氫富Tab绫诲瀷
type MainTabType = 'video' | 'track' | 'voice';
type TabType = 'all' | 'manual' | 'alarm';


// 鏂板锛氳建杩圭偣绫诲瀷
interface TrackPoint {
  lat: number;
  lng: number;
  time: string;
  speed?: number;
}

// 鏂板锛氳建杩硅褰曠被鍨?
interface TrackRecord {
  id: string;
  deviceId: string;
  deviceName: string;

  holder: string;
  company: string;
  branch_id?: string;
  project: string;
  project_id?: string;
  grid?: string;
  team: string;
  startTime: string;
  endTime: string;
  points: TrackPoint[];
  pointCount?: number;
}

type TrackOrgNode = {
  id: string;
  name: string;
  projects: Array<{
    id: string;
    name: string;
    teams: string[];
  }>;
};

// 鏂板锛氶€氳瘽璁板綍绫诲瀷
interface VoiceRecord {
  id: string;
  type: 'broadcast' | 'group' | 'private';
  from: string;
  fromRole: string;
  toNames: string[];
  startTime: string;
  duration: number;
  audioUrl?: string;
  transcript?: string;
  batchId?: string | null;
  company?: string;
  project?: string;
  grid?: string;
  team?: string;
}

interface TtsQueueJob {
  id: string;
  device_phone: string;
  device_name?: string | null;
  status: string;
}

interface TtsBatchResponse {
  batch_id: string;
  text: string;
  request_source?: string | null;
  operator?: string | null;
  created_at: string;
  requested_count: number;
  jobs: TtsQueueJob[];
}

interface VoiceRecordResponse {
  id: number;
  type: 'broadcast' | 'group' | 'private';
  from: string;
  from_role: string;
  to_names: string[];
  transcript: string;
  audio_url: string;
  duration: number;
  created_at: string;
  batch_id?: string | null;
}

function isTtsBatchResponse(payload: unknown): payload is TtsBatchResponse {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<TtsBatchResponse>;
  return typeof candidate.batch_id === 'string' && Array.isArray(candidate.jobs);
}

function isTtsBatchResponseList(payload: unknown): payload is TtsBatchResponse[] {
  return Array.isArray(payload) && payload.every(isTtsBatchResponse);
}

function getVoiceRecordType(source?: string | null): VoiceRecord['type'] {
  return source === 'broadcast' ? 'broadcast' : 'group';
}

function createVoiceRecordFromBatch(batch: TtsBatchResponse): VoiceRecord {
  const jobs = Array.isArray(batch.jobs) ? batch.jobs : [];
  return {
    id: batch.batch_id,
    type: getVoiceRecordType(batch.request_source),
    from: batch.operator || '群组通话',
    fromRole: '语音转文本播报',
    toNames: jobs.map((job) => job.device_name || job.device_phone).filter(Boolean),
    startTime: batch.created_at,
    duration: Math.max(1, Math.ceil((batch.text || '').length / 4)),
    transcript: batch.text,
    batchId: batch.batch_id,
  };
}

function isVoiceRecordResponse(payload: unknown): payload is VoiceRecordResponse {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<VoiceRecordResponse>;
  return typeof candidate.id === 'number' && typeof candidate.audio_url === 'string';
}

function isVoiceRecordResponseList(payload: unknown): payload is VoiceRecordResponse[] {
  return Array.isArray(payload) && payload.every(isVoiceRecordResponse);
}

function createVoiceRecordFromResponse(record: VoiceRecordResponse): VoiceRecord {
  const audioUrl = record.audio_url.startsWith('http')
    ? record.audio_url
    : `${API_BASE_URL}${record.audio_url.startsWith('/') ? '' : '/'}${record.audio_url}`;

  return {
    id: String(record.id),
    type: record.type || 'group',
    from: record.from || '群组通话',
    fromRole: record.from_role || '语音通话',
    toNames: toTextArray(record.to_names),
    startTime: record.created_at,
    duration: Math.max(1, record.duration || 1),
    audioUrl,
    transcript: record.transcript,
    batchId: record.batch_id,
  };
}
// 鎵╁睍 alarmInfo 绫诲瀷锛屾坊鍔?screenshot 瀛楁
interface ExtendedAlarmInfo {
  type: string;
  msg: string;
  score: number;
  timestamp: string;
  personnel: string | null;
  screenshotUrl?: string;
  screenshot?: {
    id: string;
    url: string;
    thumbnail?: string;
    timestamp: string;
  };
}

// 鎵╁睍 SavedPlayback 绫诲瀷锛堣鐩?alarmInfo锛?
interface ExtendedSavedPlayback extends SavedPlayback {
  alarmInfo?: ExtendedAlarmInfo;
  thumbnail?: string;
  grid?: string;
  grid_id?: string;
  grid_name?: string;
  team?: string;
  team_id?: string;
  team_name?: string;
  holder?: string;
  deviceKey?: string;
  companyKey?: string;
  projectKey?: string;
  gridKey?: string;
  teamKey?: string;
  companyName?: string;
  projectName?: string;
  gridName?: string;
  teamName?: string;
  branch_id?: string;
  project_id?: string;
  alarmSecond?: number;
}

const asText = (value: unknown) => String(value ?? '').trim();

const firstText = (source: Record<string, any> | undefined | null, keys: string[]) => {
  if (!source) return '';
  for (const key of keys) {
    const value = asText(source[key]);
    if (value) return value;
  }
  return '';
};

const isInvalidOrgValue = (value: unknown) => {
  const text = asText(value);
  if (!text) return true;
  const normalized = text.toLowerCase();
  return ['?', '??', '???', 'null', 'undefined', 'unknown', '未知', '未匹配', '-', '--'].includes(normalized);
};

const cleanOrgValue = (value: unknown) => {
  const text = asText(value);
  return isInvalidOrgValue(text) ? '' : text;
};

const normalizeSearch = (value: unknown) => asText(value).toLowerCase();

const toTextArray = (value: unknown) =>
  Array.isArray(value) ? value.map(item => asText(item)).filter(Boolean) : [];

const toVideoUrl = (path: unknown) => {
  const rawPath = asText(path);
  if (!rawPath) return '';
  if (rawPath.startsWith('blob:') || rawPath.startsWith('data:')) {
    return rawPath;
  }

  if (
    rawPath.startsWith('/static/alarm_videos/') ||
    rawPath.startsWith('/static/alarms/') ||
    rawPath.startsWith('/static/alarm_screenshots/') ||
    rawPath.startsWith('/api/alarm_videos/') ||
    rawPath.startsWith('/api/alarm_screenshots/')
  ) {
    return getApiUrl(rawPath);
  }

  if (rawPath.startsWith('/static/')) {
    return withAuthTokenParam(getApiUrl(rawPath));
  }

  if (/^(https?:)?\/\//i.test(rawPath)) {
    return withAuthTokenParam(rawPath);
  }

  const url = `${API_BASE_URL}${rawPath.startsWith('/') ? '' : '/'}${rawPath}`;
  return withAuthTokenParam(url);
};

const withMediaCacheKey = (url: string, key?: unknown) => {
  const cacheKey = asText(key);
  if (!url || !cacheKey) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(cacheKey)}`;
};

const getScreenshotUrl = (shot: any) => {
  const rawPath =
    shot?.alarmInfo?.screenshot?.url ||
    shot?.alarmInfo?.screenshot?.thumbnail ||
    shot?.alarmInfo?.screenshotUrl ||
    shot?.web_path ||
    shot?.thumbnail_path ||
    shot?.thumbnail ||
    shot?.url ||
    '';

  return rawPath ? toVideoUrl(rawPath) : '';
};

const getPlaybackEventTime = (item: any) =>
  item?.event_at || item?.alarm_at || item?.start_time || item?.created_at || item?.updated_at || '';

const getDeviceCompany = (device: Partial<Device> | Record<string, any>) =>
  cleanOrgValue(firstText(device as Record<string, any>, ['company', 'companyName', 'branch_name']));

const getDeviceProject = (device: Partial<Device> | Record<string, any>) =>
  cleanOrgValue(firstText(device as Record<string, any>, ['project', 'projectName', 'project_name']));

const getDeviceGrid = (device: Partial<Device> | Record<string, any>) =>
  cleanOrgValue(firstText(device as Record<string, any>, ['grid', 'grid_name', 'gridName']));

const getDeviceTeam = (device: Partial<Device> | Record<string, any>) =>
  cleanOrgValue(firstText(device as Record<string, any>, ['team', 'team_name', 'teamName', 'workTeam', 'work_team']));

const playbackMatchesSearch = (playback: ExtendedSavedPlayback, keyword: string) => {
  const normalizedKeyword = normalizeSearch(keyword);
  if (!normalizedKeyword) return true;
  const alarmFields = playback.type === 'alarm'
    ? [playback.alarmInfo?.msg, playback.alarmInfo?.type, playback.alarmInfo?.personnel]
    : [];
  return [
    playback.deviceName,
    playback.holder,
    playback.companyName || playback.company,
    playback.projectName || playback.project,
    playback.gridName || playback.grid,
    playback.teamName || playback.team,
    ...alarmFields,
  ].some(field => normalizeSearch(field).includes(normalizedKeyword));
};

type VoiceSortField = 'from' | 'receiver' | 'category' | 'time' | 'kind';
type TrackSortField = 'type' | 'holder' | 'device' | 'coord' | 'description' | 'company' | 'project' | 'org' | 'time';
type SortDirection = 'asc' | 'desc';
interface VoiceSortState {
  field: VoiceSortField;
  direction: SortDirection;
}
interface TrackSortState {
  field: TrackSortField;
  direction: SortDirection;
}

const getDeviceMatchKeys = (device: Partial<Device> | Record<string, any>) => [
  firstText(device as Record<string, any>, ['id', 'device_id', 'deviceId']),
  firstText(device as Record<string, any>, ['name', 'device_name', 'deviceName']),
  firstText(device as Record<string, any>, ['phone_num', 'phoneNum', 'device_phone', 'devicePhone', 'holderPhone']),
]
  .flatMap((value) => {
    const normalized = normalizeSearch(value);
    const locatorMatch = normalized.match(/^定位器[-_ ]?(.+)$/);
    return locatorMatch ? [normalized, locatorMatch[1]] : [normalized];
  })
  .filter(Boolean);

const findReceiverDevice = (receiver: string, devices: Device[]) => {
  const normalized = normalizeSearch(receiver);
  const locatorMatch = normalized.match(/^定位器[-_ ]?(.+)$/);
  const receiverKeys = [normalized, locatorMatch?.[1]].filter(Boolean);

  return devices.find(device => {
    const deviceKeys = getDeviceMatchKeys(device as Record<string, any>);
    return receiverKeys.some(receiverKey =>
      deviceKeys.some(deviceKey => deviceKey === receiverKey)
    );
  });
};

const attachScopedVoiceOrg = (voice: VoiceRecord, devices: Device[], requireDeviceMatch = true): VoiceRecord | null => {
  const normalizedVoice = {
    ...voice,
    from: asText(voice.from) || '群组通话',
    fromRole: asText(voice.fromRole) || '语音通话',
    toNames: toTextArray(voice.toNames),
    startTime: asText(voice.startTime),
    duration: Math.max(1, Number(voice.duration) || 1),
  };
  const scopedReceivers = normalizedVoice.toNames
    .map(receiver => ({ receiver, device: findReceiverDevice(receiver, devices) }))
    .filter((item): item is { receiver: string; device: Device } => Boolean(item.device));

  if (scopedReceivers.length === 0) {
    return requireDeviceMatch ? null : normalizedVoice;
  }

  const matchedDevice = scopedReceivers[0].device;

  return {
    ...normalizedVoice,
    toNames: requireDeviceMatch ? scopedReceivers.map(item => item.receiver) : normalizedVoice.toNames,
    company: getDeviceCompany(matchedDevice),
    project: getDeviceProject(matchedDevice),
    grid: getDeviceGrid(matchedDevice),
    team: getDeviceTeam(matchedDevice),
  };
};

const getVoiceReceiverText = (voice: VoiceRecord) => toTextArray(voice.toNames).join(', ') || '';

const getVoiceSortValue = (voice: VoiceRecord, field: VoiceSortField) => {
  switch (field) {
    case 'from': return normalizeSearch(voice.from);
    case 'receiver': return normalizeSearch(getVoiceReceiverText(voice));
    case 'category': return voice.type || '';
    case 'kind': return voice.audioUrl ? `1-${voice.duration}` : '0-0';
    default: return parseVoiceDateTime(voice.startTime).getTime();
  }
};

const parseVoiceDateTime = (value: string) => {
  if (!value) return new Date(NaN);
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  return new Date(normalized);
};

const formatVoiceDateTime = (value: string) => {
  const date = parseVoiceDateTime(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const getTrackSortValue = (track: TrackRecord, field: TrackSortField) => {
  const points = Array.isArray(track.points) ? track.points : [];
  const firstPoint = points[0];
  switch (field) {
    case 'type': return '轨迹回放';
    case 'holder': return normalizeSearch(track.holder);
    case 'device': return normalizeSearch(`${track.deviceName} ${track.deviceId}`);
    case 'coord': return firstPoint ? Number(firstPoint.lat) * 1000 + Number(firstPoint.lng) : Number.NEGATIVE_INFINITY;
    case 'description': return normalizeSearch(`${track.holder} ${track.project}`);
    case 'company': return normalizeSearch(track.company);
    case 'project': return normalizeSearch(track.project);
    case 'org': return normalizeSearch(`${track.grid || ''} ${track.team || ''}`);
    default: {
      const time = new Date(track.startTime).getTime();
      return Number.isNaN(time) ? 0 : time;
    }
  }
};

const parseDateFilterStart = (value: string) => {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseDateFilterEnd = (value: string) => {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T23:59:59.999` : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const textValue = (value: unknown) => String(value ?? "").trim();

const buildScopeValues = (values: unknown[]) =>
  Array.from(new Set(values.map((value) => textValue(value)).filter(Boolean)));

const readProjectScope = () => {
  const auth = readStoredAuth();
  const storedScope = getStoredScopeState(auth);
  const branchScopeValues = buildScopeValues([
    localStorage.getItem("company"),
    localStorage.getItem("branch"),
    localStorage.getItem("department"),
    localStorage.getItem("branch_name"),
    localStorage.getItem("company_name"),
    auth.company,
    auth.branch,
    auth.branch_name,
    auth.companyName,
    auth.department,
    auth.department_name,
    auth.branchName,
  ]);
  const projectScopeValues = buildScopeValues([
    storedScope.projectName,
    storedScope.projectId,
    auth.project,
    auth.project_id,
    auth.project_name,
    auth.projectName,
  ]);

  return {
    ...storedScope,
    branchScopeValues,
    projectScopeValues,
  };
};

const scopeValueMatches = (value: unknown, candidates: unknown[]) => {
  const normalizedValue = textValue(value).toLowerCase();
  if (!normalizedValue) return false;

  return candidates.some((candidate) => textValue(candidate).toLowerCase() === normalizedValue);
};

const companyMatchesScope = (company: unknown, scope: ReturnType<typeof readProjectScope>) => {
  if (!scope.isBranchScope || scope.branchScopeValues.length === 0) return true;
  return scopeValueMatches(company, scope.branchScopeValues);
};

const branchIdMatchesScope = (branchId: unknown, scope: ReturnType<typeof readProjectScope>) => {
  if (!scope.isBranchScope) return true;
  const currentBranchId = textValue(scope.branchId);
  const normalizedBranchId = textValue(branchId);
  if (!currentBranchId || !normalizedBranchId) return false;
  return normalizedBranchId === currentBranchId || normalizedBranchId.replace(/^BRANCH-/i, "") === currentBranchId.replace(/^BRANCH-/i, "");
};

const projectIdMatchesScope = (projectId: unknown, scope: ReturnType<typeof readProjectScope>) => {
  const value = textValue(projectId);
  if (!value) return false;
  return scope.projectScopeValues.some((candidate) => {
    const target = textValue(candidate);
    return value === target || value.replace(/^PRJ-/i, "") === target.replace(/^PRJ-/i, "");
  });
};

const projectMatchesScope = (project: unknown, scope: ReturnType<typeof readProjectScope>) => {
  const value = textValue(project);
  if (!value) return false;
  return scope.projectScopeValues.some((candidate) => {
    const target = textValue(candidate);
    return value === target || value.replace(/^PRJ-/i, "") === target.replace(/^PRJ-/i, "");
  });
};

const trackProjectMatchesSelection = (track: Record<string, any>, selectedProject: string) => {
  if (selectedProject === 'all') return true;
  const projectName = textValue(getDeviceProject(track));
  const projectId = textValue(track.project_id);
  const normalizedSelected = textValue(selectedProject);
  if (!normalizedSelected) return true;
  return (
    projectName === normalizedSelected ||
    projectId === normalizedSelected ||
    projectId.replace(/^PRJ-/i, "") === normalizedSelected.replace(/^PRJ-/i, "")
  );
};

const trackBelongsToScope = (track: Record<string, any>, scope: ReturnType<typeof readProjectScope>) => {
  if (scope.isProjectScope) {
    return projectIdMatchesScope(track.project_id, scope) || projectMatchesScope(getDeviceProject(track), scope);
  }

  if (scope.isBranchScope) {
    return branchIdMatchesScope(track.branch_id, scope) || companyMatchesScope(getDeviceCompany(track), scope);
  }

  return true;
};

const buildTrackOrgTree = (items: Record<string, any>[]): TrackOrgNode[] => {
  const companyMap = new Map<string, { id: string; name: string; projects: Map<string, { id: string; name: string; teams: Set<string> }> }>();

  items.forEach((item) => {
    const companyId = getDeviceCompany(item);
    const projectId = getDeviceProject(item);
    const teamName = getDeviceTeam(item);

    if (!companyId || !projectId) return;

    if (!companyMap.has(companyId)) {
      companyMap.set(companyId, { id: companyId, name: companyId, projects: new Map() });
    }

    const company = companyMap.get(companyId)!;
    if (!company.projects.has(projectId)) {
      company.projects.set(projectId, { id: projectId, name: projectId, teams: new Set() });
    }

    if (teamName) {
      company.projects.get(projectId)!.teams.add(teamName);
    }
  });

  return Array.from(companyMap.values()).map((company) => ({
    id: company.id,
    name: company.name,
    projects: Array.from(company.projects.values()).map((project) => ({
      id: project.id,
      name: project.name,
      teams: Array.from(project.teams.values()),
    })),
  }));
};

const buildTrackOrgTreeFromDevices = (items: TrackDevice[], scope: ReturnType<typeof readProjectScope>): TrackOrgNode[] => {
  const scopedDevices = items.filter((item) => trackBelongsToScope(item as Record<string, any>, scope));
  return buildTrackOrgTree(scopedDevices as Record<string, any>[]);
};

const playbackMatchesProjectScope = (playback: ExtendedSavedPlayback, scope: ReturnType<typeof readProjectScope>) => {
  if (!scope.isProjectScope) return true;
  return [
    playback.project,
    playback.projectName,
    (playback as any).project_id,
    (playback as any).projectId,
  ].some((value) => projectMatchesScope(value, scope));
};

const isGlobalPermissionScope = () => isHeadquartersScope();

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

  // 妯℃嫙璁惧鍒楄〃锛堝鍔犲叕鍙稿拰椤圭洰淇℃伅锛?
 // 妯℃嫙璁惧鍒楄〃锛堟墿灞曞埌10涓澶囷級
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

  // 妯℃嫙鍥炴斁鏁版嵁
// 妯℃嫙鍥炴斁鏁版嵁 - 鎵╁睍鍒?50 条
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

  // 鐢熸垚杩囧幓30澶╃殑鏁版嵁
  for (let i = 0; i < 50; i++) {
    const device = devices[i % devices.length];
    const isAlarm = i % 3 !== 0; // 绾?/3鏄姤璀﹁褰?
    const daysAgo = Math.floor(i / 5); // 鎸夋椂闂村垎甯?
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(9 + (i % 8), (i * 7) % 60, 0);

    const startTime = date.toISOString();
    const endTime = new Date(date.getTime() + 60000).toISOString();

    let alarmInfo = undefined;
    let type: 'manual' | 'alarm' = isAlarm ? 'alarm' : 'manual';

if (isAlarm) {
  const alarm = alarmTypes[i % alarmTypes.length];
  // 鎶ヨ鍙戠敓鍦ㄨ棰戝紑濮嬪悗鐨?5-55 绉掍箣闂?
  const alarmOffsetSeconds = 5 + (i % 50);
  const alarmDate = new Date(date.getTime() + alarmOffsetSeconds * 1000);

  alarmInfo = {
    type: alarm.type,
    msg: alarm.msg,
    score: 0.85 + (i % 15) / 100,
    timestamp: alarmDate.toISOString(),  // 鎶ヨ鏃堕棿 = 瑙嗛寮€濮?+ 鍋忕Щ绉掓暟
    personnel: alarm.personnel || `浜哄憳${i + 1}`,
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

  // 鎸夋椂闂村€掑簭鎺掑垪
  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
})();

// 鏂板锛氭ā鎷熻建杩规暟鎹?
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

const getScopedMockTrackRecords = () => {
  if (!import.meta.env.DEV) return [];

  const scope = readProjectScope();
  if (scope.isHeadquartersScope) return mockTrackRecords;
  return mockTrackRecords.filter((record) => trackBelongsToScope(record, scope));
};


// 鏂板锛氭ā鎷熼€氳瘽璁板綍鏁版嵁
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

// 鏂板锛氭爲褰㈢瓫閫夋暟鎹紙鍏徃 -> 椤圭洰 -> 浣滀笟闃燂紝鏀寔缃戞牸鍖栧睘鎬э級
const companyTree = [
  {
    id: '中铁一局',
    name: '中铁一局',
    grids: [
      { id: 'grid_1', name: 'A区出入口', level: '区域', status: 'normal' },
      { id: 'grid_2', name: 'B区施工区', level: '区域', status: 'warning' },
      { id: 'grid_3', name: 'C区材料堆放', level: '区域', status: 'normal' },
    ],
    projects: [
      {
        id: '西安地铁8号线',
        name: '西安地铁8号线',
        grids: [
          { id: 'grid_8_1', name: '8号线-北门', level: '工点', status: 'normal' },
          { id: 'grid_8_2', name: '8号线-南门', level: '工点', status: 'normal' },
        ],
        teams: ['施工一组', '施工二组', '施工三组']
      }
    ]
  },
  {
    id: '中铁隧道局',
    name: '中铁隧道局',
    grids: [
      { id: 'grid_s1', name: '隧道进口', level: '工点', status: 'alarm' },
      { id: 'grid_s2', name: '盾构机区', level: '工点', status: 'normal' },
    ],
    projects: [
      {
        id: '西安地铁10号线',
        name: '西安地铁10号线',
        grids: [
          { id: 'grid_10_1', name: '10号线-隧道入口', level: '工点', status: 'normal' },
        ],
        teams: ['掘进班', '支护班', '运输班']
      }
    ]
  }
];

// 网格状态映射
const getGridStatusInfo = (status: string) => {
  switch (status) {
    case 'normal': return { text: '正常', color: 'text-green-400' };
    case 'warning': return { text: '预警', color: 'text-yellow-400' };
    case 'alarm': return { text: '报警', color: 'text-red-400' };
    default: return { text: '未知', color: 'text-slate-400' };
  }
};

export interface VideoPlayerRef {
  captureFrame: () => Promise<string>;
  seekTo: (seconds: number) => Promise<void>;
  getAlarmTimestamp: () => number;
}

const SimpleVideoPlayer = forwardRef<VideoPlayerRef, {
  src: string;
  deviceName: string;
  type?: 'manual' | 'alarm';
  playlist?: ExtendedSavedPlayback[];
  currentPlayback?: ExtendedSavedPlayback;
  onPlaybackChange?: (playback: ExtendedSavedPlayback) => void;
}>(
  ({ src, deviceName, type, playlist = [], currentPlayback, onPlaybackChange }, ref) => {
    // 鉁?鐩存帴浣跨敤浼犲叆鐨?src锛堝悗绔繑鍥炵殑鐪熷疄瑙嗛璺緞锛?
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
    const [loadError, setLoadError] = useState('');

    const getAlarmTimestamp = () => alarmTimestamp || 0;

    // 鉁?鍏ㄥ睆鍜孍SC閫€鍑虹洃鍚?
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

    // 鉁?涓婁竴涓?涓嬩竴涓棰戯紙浣跨敤鐪熷疄鎾斁鍒楄〃锛?
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

    // 鉁?淇涓嬭浇锛堣В鍐宠法鍩熼棶棰橈級
    const handleDownload = async () => {
      if (!currentPlayback || !videoUrl) return;

      try {
        // 鉁?鐢?fetch + blob 鐪熸涓嬭浇锛堣В鍐宠法鍩燂級
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
        console.error('涓嬭浇澶辫触:', e);
        // 鉁?闄嶇骇鏂规锛氬湪鏂版爣绛鹃〉鎵撳紑
        window.open(videoUrl, '_blank');
      }
    };

    // 鐩戝惉瑙嗛浜嬩欢
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      // 鉁?姣忔鎹㈣棰戦兘閲嶇疆鐘舵€侊紝骞跺姞杞界涓€甯т綔涓哄皝闈?
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setAlarmTimestamp(null);
      setLoadError('');
      video.load();

      const handleLoadedMetadata = () => {
        // 鉁?浣跨敤瑙嗛鐪熷疄鏃堕暱锛堝洓鑸嶄簲鍏ラ伩鍏嶅皬鏁帮級
        const realDuration = Math.round(video.duration);
        setDuration(realDuration);

        // 鉁?鍙湁鎶ヨ绫诲瀷鎵嶆樉绀虹孩鐐?
        // 浼樺厛绾э細currentPlayback.alarmSecond锛堢湡瀹炶绠楋級 > 鍥哄畾 10绉?> 涓嶆樉绀?
        if (type === 'alarm') {
          const realAlarmSecond = Number((currentPlayback as any)?.alarmSecond);
          const fallbackAlarmSecond = Math.min(30, Math.max(0, realDuration / 2));
          const nextAlarmSecond = Number.isFinite(realAlarmSecond)
            ? realAlarmSecond
            : fallbackAlarmSecond;
          setAlarmTimestamp(Math.max(0, Math.min(nextAlarmSecond, realDuration || fallbackAlarmSecond)));
        } else {
          setAlarmTimestamp(null);
        }
      };

      const handleSeeked = () => {
        // 鉁?灏侀潰甯у姞杞藉畬鎴愬悗锛岀‘淇濆垵濮嬬姸鎬佹槸鏆傚仠
        if (video.currentTime < 1) {
          video.pause();
        }
      };

      const handleTimeUpdate = () => setCurrentTime(video.currentTime);
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleError = (e: any) => {
        console.error('瑙嗛鍔犺浇閿欒:', e);
        console.error('瑙嗛URL:', videoUrl);
        setLoadError('视频加载失败，请检查文件或稍后重试');
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
    }, [videoUrl, type, currentPlayback]);

    // 鍊嶉€熼€夐」
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
        // 鉁?鐩存帴鐢ㄨ棰戝師鐢熺姸鎬侊紝閬垮厤 React 鐘舵€佷笉涓€鑷?
        if (videoRef.current.paused) {
          videoRef.current.play().catch(e => console.error('鎾斁澶辫触:', e));
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

    // 鎴浘鏂规硶
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
          console.error('鎴浘澶辫触:', err);
          resolve('');
        }
      });
    };

    // 璺宠浆鍒版寚瀹氱鏁?
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
          key={videoUrl}
          ref={videoRef}
          src={videoUrl}
          crossOrigin="anonymous"
          className="w-full h-full"
          style={{ objectFit: 'cover' }}
          controls={false}
          preload="metadata"
        />

        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center text-sm text-red-200">
            {loadError}
          </div>
        )}

        {/* 涓ぎ鎾斁/鏆傚仠鎸夐挳 */}
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

        {/* 宸︿晶涓婁竴涓寜閽?*/}
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

        {/* 鍙充晶涓嬩竴涓寜閽?*/}
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
            {/* 杩涘害条*/}
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
              {alarmTimestamp !== null && duration > 0 && (
                <div
                  className="absolute w-3 h-3 bg-red-500 rounded-full top-1/2 -translate-y-1/2 -translate-x-1/2 shadow-lg ring-2 ring-red-500/50 animate-pulse"
                  style={{ left: `${Math.max(0, Math.min(100, (alarmTimestamp / duration) * 100))}%` }}
                  title="报警发生时刻"
                />
              )}
            </div>

            <div className="flex items-center justify-between">
              {/* 宸﹁竟锛氭挱鏀炬帶鍒?*/}
              <div className="flex items-center gap-4">
                {/* 涓婁竴涓?*/}
                <button onClick={playPrevious} className="text-white hover:text-cyan-400 transition-colors">
                  <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                  </svg>
                </button>

                {/* 鎾斁/鏆傚仠 */}
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

                {/* 涓嬩竴涓?*/}
                <button onClick={playNext} className="text-white hover:text-cyan-400 transition-colors">
                  <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                  </svg>
                </button>

                {/* 鏃堕棿 */}
                <span className="text-white text-xl font-mono ml-1">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* 鍙宠竟锛氶煶閲忋€佸€嶉€熴€佷笅杞姐€佸叏灞?*/}
              <div className="flex items-center gap-9">
                {/* 闊抽噺 */}
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

                  {/* 闊抽噺婊戝潡 */}
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

                {/* 鍊嶉€?*/}
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

                {/* 涓嬭浇 */}
                <button onClick={handleDownload} className="text-white hover:text-cyan-400 transition-colors" title="下载视频">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
                  </svg>
                </button>

                {/* 鍏ㄥ睆 / 閫€鍑哄叏灞?*/}
                <button onClick={toggleFullscreen} className="text-white hover:text-cyan-400 transition-colors" title={isFullscreen ? "退出全屏(ESC)" : "全屏"}>
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
//     // 涓嶅悓璁惧瀵瑰簲鐨勪笉鍚屾祴璇曡棰?
//     const getVideoByDevice = (name: string) => {
//       const videoList: Record<string, string> = {
//         '鍖楅棬鍑哄叆鍙ｆ憚鍍忓ご': 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
//         '鍗楅棬鏂藉伐鍖烘憚鍍忓ご': 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
//         '瑗夸晶楂樼┖浣滀笟鍖?: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
//         '闅ч亾鍏ュ彛鎽勫儚澶?: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
//         '鐩炬瀯鏈虹洃鎺?: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
//         '鏉愭枡鍔犲伐鍖?: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
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


// // 鎵╁睍 SavedPlayback 绫诲瀷锛屾坊鍔犲憡璀︽埅鍥惧瓧娈?
// interface AlarmScreenshot {
//   id: string;
//   url: string;
//   thumbnail?: string;
//   timestamp: string;
// }


//     // 鑾峰彇褰撳墠鎾斁鍒楄〃锛堜粠鐖剁粍浠朵紶鍏ワ紝杩欓噷鐢?mockPlaybacks 妯℃嫙锛?
//     const playlist = mockPlaybacks;
//     const [currentIndex, setCurrentIndex] = useState(() => {
//       const index = playlist.findIndex(p => p.deviceName === deviceName);
//       return index !== -1 ? index : 0;
//     });

//     // 鍒囨崲瑙嗛
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


//     // 鐩戝惉瑙嗛浜嬩欢
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

//     // 鍊嶉€熼€夐」
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

//     // 鎴浘鏂规硶
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
//       console.error('鎴浘澶辫触:', err);
//       resolve('');
//     }
//   });
// };

//     // 璺宠浆鍒版寚瀹氱鏁?
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

//             {/* 涓ぎ鎾斁/鏆傚仠鎸夐挳 */}
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

//       {/* 宸︿晶涓婁竴涓寜閽?*/}
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

//       {/* 鍙充晶涓嬩竴涓寜閽?*/}
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

//         {/* 鑷畾涔夋帶鍒舵爮 */}
//         <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
//           <div className="px-4 py-3">
//             {/* 杩涘害条*/}
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
//                   title="鎶ヨ鍙戠敓鏃跺埢"
//                 />
//               )}
//             </div>

//   <div className="flex items-center justify-between">
//     {/* 宸﹁竟锛氭挱鏀炬帶鍒?*/}
//     <div className="flex items-center gap-4">
//       {/* 涓婁竴涓?*/}
//       <button onClick={playPrevious} className="text-white hover:text-cyan-400 transition-colors">
//         <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
//           <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
//         </svg>
//       </button>

//       {/* 鎾斁/鏆傚仠 */}
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

//       {/* 涓嬩竴涓?*/}
//       <button onClick={playNext} className="text-white hover:text-cyan-400 transition-colors">
//         <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
//           <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
//         </svg>
//       </button>

//       {/* 鏃堕棿 */}
//       <span className="text-white text-xl  font-mono ml-1">
//         {formatTime(currentTime)} / {formatTime(duration)}
//       </span>
//     </div>

//     {/* 鍙宠竟锛氶煶閲忋€佸€嶉€熴€佷笅杞姐€佸叏灞?*/}
//     <div className="flex items-center gap-9">
//   {/* 闊抽噺 */}
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

//     {/* 闊抽噺婊戝潡 - 澧炲姞鍐呰竟璺濆拰闂撮殭锛岃榧犳爣绉诲姩杩囧幓涓嶆秷澶?*/}
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

//       {/* 鍊嶉€?*/}
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
//                   {currentSpeed === option.value && <span className="float-right">鉁?/span>}
//                 </button>
//               ))}
//             </div>
//           </>
//         )}
//       </div>

//       {/* 涓嬭浇 */}
//       <button onClick={handleDownload} className="text-white hover:text-cyan-400 transition-colors" title="涓嬭浇瑙嗛">
//         <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
//         </svg>
//       </button>

//       {/* 鍏ㄥ睆 */}
//       <button onClick={() => videoRef.current?.requestFullscreen()} className="text-white hover:text-cyan-400 transition-colors">
//         <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
//         </svg>
//       </button>
//     </div>
//   </div>
//           </div>
//         </div>

//         {/* 璁惧鍚嶇О */}
//         {/* <div className="absolute bottom-4 left-4 bg-black/70 px-3 py-1.5 rounded text-xs text-white/80 backdrop-blur pointer-events-none">
//           <Camera size={12} className="inline mr-1" />
//           {deviceName}
//         </div> */}
//       </div>
//     );
//   });

  // VideoCard 缁勪欢
const VideoCard = ({ playback, onPlay, onShowScreenshot }: {
  key?: any;
  playback: ExtendedSavedPlayback;
  onPlay: () => void;
  onShowScreenshot?: (playback: ExtendedSavedPlayback) => void | Promise<void>;
}) => {
    const [thumbnail, setThumbnail] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [previewReady, setPreviewReady] = useState(false);
    const [loadError, setLoadError] = useState(false);

    React.useEffect(() => {
      setPreviewReady(false);
      const existingScreenshot = playback.type === 'alarm'
        ? playback.alarmInfo?.screenshotUrl ||
          playback.alarmInfo?.screenshot?.url ||
          playback.alarmInfo?.screenshot?.thumbnail
        : playback.thumbnail || '';

      if (existingScreenshot) {
        setThumbnail(existingScreenshot);
        setIsLoading(false);
        setLoadError(false);
        return;
      }

      setThumbnail('');
      setIsLoading(false);
      setLoadError(!playback.filePath);
    }, [playback.filePath, playback.type, playback.alarmInfo]);

    const getThumbColor = (name: string) => {
      const colors = ['bg-red-500/20', 'bg-blue-500/20', 'bg-green-500/20', 'bg-yellow-500/20', 'bg-purple-500/20'];
      const index = name.length % colors.length;
      return colors[index];
    };

    // 鐢熸垚澶囩敤灏侀潰棰滆壊娓愬彉
    const getGradientBackground = (name: string) => {
      const gradients = [
        'linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%)',
        'linear-gradient(135deg, #3a1c71 0%, #d76d77 100%)',
        'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      ];
      const index = name.length % gradients.length;
      return gradients[index];
    };

    const parseCardDateTime = (value?: string) => {
      if (!value) return null;
      const date = new Date(String(value).replace(' ', 'T'));
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const formatCardDate = (value?: string) => {
      const date = parseCardDateTime(value);
      if (!date) return String(value || '').slice(0, 10);
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-');
    };

    const formatCardTime = (value?: string) => {
      const date = parseCardDateTime(value);
      if (!date) return String(value || '').slice(11, 19);
      return [
        String(date.getHours()).padStart(2, '0'),
        String(date.getMinutes()).padStart(2, '0'),
        String(date.getSeconds()).padStart(2, '0'),
      ].join(':');
    };

    const startDateLabel = formatCardDate(playback.startTime);
    const endDateLabel = formatCardDate(playback.endTime);
    const dateRangeLabel =
      startDateLabel === endDateLabel ? startDateLabel : `${startDateLabel}/${endDateLabel}`;
    const timeRangeLabel = `${formatCardTime(playback.startTime)}-${formatCardTime(playback.endTime)}`;

    return (
      <div className="relative w-full" style={{ paddingBottom: '28.125%' }}>
        <div className="absolute inset-0 rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md overflow-hidden cursor-pointer hover:border-cyan-400 transition-all group">
          <div className="relative w-full h-full bg-black overflow-hidden">
            <div
              className={`absolute inset-0 w-full h-full bg-center ${!thumbnail ? getThumbColor(playback.deviceName) : ''}`}
              style={thumbnail ? {
                backgroundImage: `url(${thumbnail})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundColor: '#000'
              } : {
                background: getGradientBackground(playback.deviceName || '')
              }}
            >
              {/* 鍔犺浇涓姸鎬?*/}
              {isLoading && (
                <div className="w-full h-full flex items-center justify-center bg-black/50">
                  <Loader2 size={32} className="text-cyan-400 animate-spin" />
                </div>
              )}

              {/* 鏃犵缉鐣ュ浘涓旀湭鍔犺浇鏃舵樉绀哄浘鏍?*/}
              {!thumbnail && !previewReady && !loadError && (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <VideoIcon size={40} className="text-white/60 mb-2" />
                  <span className="text-white/40 text-xs">{playback.deviceName || '视频'}</span>
                </div>
              )}

              {/* 鍔犺浇澶辫触鎻愮ず */}
              {loadError && !thumbnail && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-black/50">
                  <AlertCircle size={32} className="text-red-400 mb-2" />
                  <span className="text-white/60 text-xs">视频加载失败</span>
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

            <div className="absolute left-2 top-2 max-w-[72%] rounded bg-black/65 px-2 py-1 text-[11px] leading-none text-white/90 backdrop-blur-sm flex items-center gap-1 pointer-events-none">
              <Camera size={11} className="shrink-0 text-cyan-200" />
              <span className="truncate">{playback.deviceName || `设备 ${playback.deviceId || ''}`}</span>
            </div>

            {playback.type === 'alarm' && (
              <div className="absolute top-8 left-2 flex gap-2">
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
                  报警截图
                </button>
              </div>
            )}

            <div className="absolute bottom-1.5 left-2 max-w-[75%] rounded bg-black/65 px-1.5 py-1 text-[10px] leading-[12px] text-white/90 backdrop-blur-sm pointer-events-none">
              <div className="truncate text-cyan-100">{dateRangeLabel}</div>
              <div className="truncate">{timeRangeLabel}</div>
            </div>

            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 text-white text-xs rounded">
              {(() => {
                const sec = Math.max(0, Math.round(Number(playback.duration) || 0));
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

class PlaybackErrorBoundary extends React.Component<
  { children: React.ReactNode; title: string },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || '页面数据异常' };
  }

  componentDidCatch(error: Error) {
    console.error('Playback render failed:', error);
  }

  componentDidUpdate(prevProps: { title: string }) {
    if (prevProps.title !== this.props.title && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 rounded-xl border border-red-400/30 bg-red-500/10 p-6 text-red-100">
          <div className="text-lg font-semibold">{this.props.title}加载异常</div>
          <div className="mt-2 text-sm text-red-100/80">{this.state.message}</div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="mt-4 rounded-lg bg-red-400/20 px-4 py-2 text-sm text-red-50 hover:bg-red-400/30"
          >
            重新渲染
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

      // ==================== 杞ㄨ抗鍥炴斁缁勪欢 ====================
const TrackPlaybackContent = ({
  filteredTracks, totalPages, currentPage, setCurrentPage,
  selectedTrack, setSelectedTrack,
  selectedCompany, setSelectedCompany,
  selectedProject, setSelectedProject,
  selectedTeam, setSelectedTeam,
  searchKeyword, setSearchKeyword,
  showFilter, setShowFilter,
  dateRange, setDateRange,
  companyTree,
  sortState, setSortState
}: any) => {
  const tracks = Array.isArray(filteredTracks) ? filteredTracks : [];
  const companies = Array.isArray(companyTree) ? companyTree : [];
  const resetFilters = () => {
    setSelectedCompany('all');
    setSelectedProject('all');
    setSelectedTeam('all');
    setSearchKeyword('');
  };

  const activeFiltersCount = [selectedCompany !== 'all', selectedProject !== 'all', selectedTeam !== 'all', searchKeyword !== ''].filter(Boolean).length;
  const selectedCompanyNode = companies.find((company: any) => company.id === selectedCompany);
  const projectOptions = selectedCompany === 'all' ? companies.flatMap((company: any) => company.projects || []) : (selectedCompanyNode?.projects || []);
  const teamOptions = projectOptions.filter((project: any) => selectedProject === 'all' || project.id === selectedProject).flatMap((project: any) => project.teams || []);
  const formatTrackDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '-';
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const formatTrackTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const formatTrackDuration = (start: string, end: string) => {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) return '-';
    const minutes = Math.max(1, Math.round((endTime - startTime) / 60000));
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}小时${rest}分钟` : `${hours}小时`;
  };
  const formatCoord = (point?: TrackPoint) => {
    if (!point) return '-';
    return `${Number(point.lat).toFixed(6)}, ${Number(point.lng).toFixed(6)}`;
  };
  const renderTrackSortHeader = (field: TrackSortField, label: string, align: 'left' | 'right' = 'left') => {
    const active = sortState.field === field;
    const nextDirection: SortDirection = active && sortState.direction === 'asc' ? 'desc' : 'asc';
    return (
      <button
        type="button"
        onClick={() => setSortState({ field, direction: nextDirection })}
        className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end text-right' : 'text-left'} ${active ? 'text-cyan-300' : 'text-white/70 hover:text-white'}`}
      >
        <span>{label}</span>
        <span className="text-xs">{active ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    );
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col h-full">
      <div className="relative z-20 mb-4 flex-shrink-0 rounded-xl border border-cyan-400/30 bg-slate-900/50 p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[300px] flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
            <input type="text" placeholder="搜索人员、设备..." value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-200" />
          </div>
          <div className="relative z-30">
            <button onClick={() => setShowFilter(!showFilter)} className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${showFilter || activeFiltersCount > 0 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
              <Filter size={14} />
              <span>筛选</span>
              {activeFiltersCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs bg-cyan-500 rounded-full">{activeFiltersCount}</span>}
            </button>
            {showFilter && (
              <div className="absolute top-full left-0 mt-2 w-[420px] max-h-[420px] overflow-y-auto bg-slate-900 border border-cyan-400/30 rounded-xl shadow-2xl z-[520] p-3">
                <div className="flex justify-between items-center border-b border-slate-700 pb-2 mb-3">
                  <span className="text-sm font-medium text-white">筛选</span>
                  <button onClick={resetFilters} className="text-xs text-cyan-400 hover:text-cyan-300">清除筛选</button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {readProjectScope().showCompanyFilter && (
                    <select value={selectedCompany} onChange={(e) => { setSelectedCompany(e.target.value); setSelectedProject('all'); setSelectedTeam('all'); }} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200">
                      <option value="all">所有公司</option>
                      {companies.map((company: any) => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </select>
                  )}
                  {readProjectScope().showProjectFilter && (
                    <select value={selectedProject} onChange={(e) => { setSelectedProject(e.target.value); setSelectedTeam('all'); }} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200">
                      <option value="all">所有项目</option>
                      {projectOptions.map((project: any) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                  )}
                  <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200">
                    <option value="all">所有工队</option>
                    {teamOptions.map((team: string) => <option key={team} value={team}>{team}</option>)}
                  </select>
                  <button onClick={() => setShowFilter(false)} className="w-full py-1.5 bg-cyan-500 rounded-lg text-xs text-slate-950 font-semibold">确定</button>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 开始日期 */}
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200"
            />
            {/* 开始时间 */}
            <input
              type="time"
              step="60"
              value={dateRange.startTime}
              onChange={(e) => setDateRange({ ...dateRange, startTime: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200 w-[90px]"
            />
            <span className="text-slate-500">-</span>
            {/* 结束日期 */}
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200"
            />
            {/* 结束时间 */}
            <input
              type="time"
              step="60"
              value={dateRange.endTime}
              onChange={(e) => setDateRange({ ...dateRange, endTime: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200 w-[90px]"
            />
          </div>
          {activeFiltersCount > 0 && <button onClick={resetFilters} className="px-2 py-1 text-sm text-cyan-400">重置</button>}
        </div>
      </div>
      <div className="relative z-0 flex-1 overflow-auto">
        <div className="min-w-[1420px] overflow-hidden rounded-lg border border-white/10 bg-slate-950/35 shadow-[0_18px_46px_rgba(2,8,23,0.36)] backdrop-blur-sm">
          <div className="grid grid-cols-[110px_210px_160px_230px_210px_170px_170px_140px_230px_110px] items-center gap-4 border-b border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold text-white/70">
            <div>{renderTrackSortHeader('type', '类型')}</div>
            <div>{renderTrackSortHeader('holder', '轨迹对象')}</div>
            <div>{renderTrackSortHeader('device', '定位设备')}</div>
            <div>{renderTrackSortHeader('coord', '起点坐标')}</div>
            <div>{renderTrackSortHeader('description', '情况描述')}</div>
            <div>{renderTrackSortHeader('company', '分公司')}</div>
            <div>{renderTrackSortHeader('project', '项目')}</div>
            <div>{renderTrackSortHeader('org', '网格/工队')}</div>
            <div>{renderTrackSortHeader('time', '轨迹时间')}</div>
            <div className="text-right text-white/70">操作</div>
          </div>
          <div className="divide-y divide-white/5">
            {tracks.map((track: TrackRecord) => {
              const points = Array.isArray(track.points) ? track.points : [];
              const holder = asText(track.holder) || '-';
              const deviceName = asText(track.deviceName) || '-';
              const company = asText(track.company) || '-';
              const project = asText(track.project) || '-';
              const grid = asText(track.grid) || '-';
              const team = asText(track.team) || '-';
              const safeTrack = { ...track, holder, deviceName, points };
              return (
                <div key={track.id} onClick={() => setSelectedTrack(safeTrack)} className="group grid grid-cols-[110px_210px_160px_230px_210px_170px_170px_140px_230px_110px] items-center gap-4 bg-slate-950/20 px-4 py-4 text-sm transition-all hover:bg-slate-800/55">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-400/10 px-2.5 py-1 font-semibold text-blue-200 ring-1 ring-blue-300/20">
                      <MapPin size={13} />
                      轨迹回放
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-50">{holder}</div>
                    <div className="mt-1 truncate text-xs text-slate-400">工号/设备归属: {asText(track.deviceId) || '-'}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-slate-100" title={deviceName}>{deviceName}</div>
                    <div className="mt-1 text-xs text-cyan-300/70">{track.pointCount ?? points.length} 个轨迹点</div>
                  </div>
                  <div className="font-mono text-xs text-slate-300">{formatCoord(points[0])}</div>
                  <div className="min-w-0">
                    <div className="truncate text-slate-200" title={`${holder} 在 ${project} 的轨迹回放`}>{holder} 在 {project} 的轨迹回放</div>
                    <div className="mt-1 text-xs text-slate-500">持续 {formatTrackDuration(track.startTime, track.endTime)}</div>
                  </div>
                  <div className="truncate text-slate-300" title={company}>{company}</div>
                  <div className="truncate text-slate-300" title={project}>{project}</div>
                  <div className="min-w-0">
                    <div className="truncate text-slate-300" title={grid}>{grid}</div>
                    <div className="mt-1 truncate text-xs text-slate-500" title={team}>{team}</div>
                  </div>
                  <div className="text-slate-300">
                    <div>{formatTrackDateTime(track.startTime)}</div>
                    <div className="mt-1 text-xs text-slate-500">至 {formatTrackTime(track.endTime)}</div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedTrack(safeTrack);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-200 transition-all hover:border-cyan-300/40 hover:bg-cyan-400/20"
                    >
                      <Play size={13} />
                      回放
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {tracks.length === 0 && <div className="text-center py-12 text-slate-400"><MapPin size={48} className="mx-auto mb-3 opacity-30" /><p>暂无轨迹记录</p></div>}
      </div>
      {totalPages > 1 && (
        <div className="flex justify-center gap-3 mt-4 pt-3 border-t border-cyan-400/20 flex-shrink-0">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))} className="px-3 py-1 rounded bg-slate-800/50 text-slate-300 disabled:opacity-40">上一页</button>
          <span className="text-sm text-slate-400">第 {currentPage} / {totalPages} 页</span>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((p: number) => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded bg-slate-800/50 text-slate-300 disabled:opacity-40">下一页</button>
        </div>
      )}
      {selectedTrack && <TrackMap points={Array.isArray(selectedTrack.points) ? selectedTrack.points : []} deviceName={asText(selectedTrack.deviceName)} holder={asText(selectedTrack.holder)} onClose={() => setSelectedTrack(null)} />}
    </div>
  );
};
const VoicePlaybackContent = ({
  filteredVoices, totalPages, currentPage, setCurrentPage,
  selectedVoice, setSelectedVoice,
  searchKeyword, setSearchKeyword,
  dateRange, setDateRange,
  formatDuration, getVoiceTypeInfo,
  voiceRecordsError,
  selectedCompany, setSelectedCompany,
  selectedProject, setSelectedProject,
  selectedGrid, setSelectedGrid,
  selectedTeam, setSelectedTeam,
  voiceOrgTree,
  sortState, setSortState
}: any) => {
  const voices = Array.isArray(filteredVoices) ? filteredVoices : [];
  const orgTree = Array.isArray(voiceOrgTree) ? voiceOrgTree : [];
  const selectedVoiceNames = selectedVoice ? toTextArray(selectedVoice.toNames) : [];
  const resetFilters = () => {
    setSelectedCompany('all');
    setSelectedProject('all');
    setSelectedGrid('all');
    setSelectedTeam('all');
    setSearchKeyword('');
    const defaultRange = getDefaultVoiceDateRange();
    setDateRange({
      startDate: defaultRange.startDate,
      startTime: defaultRange.startTime,
      endDate: defaultRange.endDate,
      endTime: defaultRange.endTime
    });
  };

  const activeFiltersCount = [
    selectedCompany !== 'all',
    selectedProject !== 'all',
    selectedGrid !== 'all',
    selectedTeam !== 'all',
    searchKeyword !== '',
    dateRange.startDate !== '',
    dateRange.startTime !== '',
    dateRange.endDate !== '',
    dateRange.endTime !== ''
  ].filter(Boolean).length;
  const selectedHasAudio = Boolean(selectedVoice?.audioUrl);
  const projectOptions = selectedCompany === 'all'
    ? orgTree.flatMap((company: any) => Array.isArray(company.projects) ? company.projects : [])
    : (orgTree.find((company: any) => company.id === selectedCompany)?.projects || []);
  const gridOptions = projectOptions
    .filter((project: any) => selectedProject === 'all' || project.id === selectedProject)
    .flatMap((project: any) => project.grids || []);
  const teamOptions = gridOptions
    .filter((grid: any) => selectedGrid === 'all' || grid.id === selectedGrid)
    .flatMap((grid: any) => grid.teams || []);
  const renderSortHeader = (field: VoiceSortField, label: string, align: 'left' | 'right' = 'left') => {
    const active = sortState.field === field;
    const nextDirection: SortDirection = active && sortState.direction === 'asc' ? 'desc' : 'asc';
    return (
      <button
        type="button"
        onClick={() => setSortState({ field, direction: nextDirection })}
        className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end text-right' : 'text-left'} ${active ? 'text-cyan-300' : 'text-white/70 hover:text-white'}`}
      >
        <span>{label}</span>
        <span className="text-xs">{active ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    );
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col h-full">
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-cyan-400/30 p-4 mb-4 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[320px] flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
            <input type="text" placeholder="搜索来源、接收对象..." value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-200" />
          </div>
          <div className="flex items-center gap-2">
            {/* 开始日期 */}
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200"
            />
            {/* 开始时间 */}
            <input
              type="time"
              step="60"
              value={dateRange.startTime}
              onChange={(e) => setDateRange({ ...dateRange, startTime: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200 w-[90px]"
            />
            <span className="text-slate-500">-</span>
            {/* 结束日期 */}
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200"
            />
            {/* 结束时间 */}
            <input
              type="time"
              step="60"
              value={dateRange.endTime}
              onChange={(e) => setDateRange({ ...dateRange, endTime: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200 w-[90px]"
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {readProjectScope().showCompanyFilter && (
              <select value={selectedCompany} onChange={(event) => { setSelectedCompany(event.target.value); setSelectedProject('all'); setSelectedGrid('all'); setSelectedTeam('all'); }} className="h-9 min-w-[140px] rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 outline-none hover:border-cyan-400/40">
                <option value="all">所有公司</option>
                {orgTree.map((company: any) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            )}
            {readProjectScope().showProjectFilter && (
              <select value={selectedProject} onChange={(event) => { setSelectedProject(event.target.value); setSelectedGrid('all'); setSelectedTeam('all'); }} className="h-9 min-w-[140px] rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 outline-none hover:border-cyan-400/40">
                <option value="all">所有项目</option>
                {projectOptions.map((project: any) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            )}
            <select value={selectedGrid} onChange={(event) => { setSelectedGrid(event.target.value); setSelectedTeam('all'); }} className="h-9 min-w-[140px] rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 outline-none hover:border-cyan-400/40">
              <option value="all">所有网格</option>
              {gridOptions.map((grid: any) => <option key={grid.id} value={grid.id}>{grid.name}</option>)}
            </select>
            <select value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)} className="h-9 min-w-[140px] rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 outline-none hover:border-cyan-400/40">
              <option value="all">所有工队</option>
              {teamOptions.map((team: any) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
            {activeFiltersCount > 0 && <button onClick={resetFilters} className="px-2 py-1 text-sm text-cyan-400">重置</button>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {voiceRecordsError ? <div className="mb-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{voiceRecordsError}</div> : null}
        <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/35 shadow-[0_18px_46px_rgba(2,8,23,0.36)] backdrop-blur-sm">
          <div className="grid grid-cols-[190px_minmax(360px,1fr)_170px_240px_230px] items-center gap-5 border-b border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/70">
            <div>{renderSortHeader('from', '发起人')}</div>
            <div>{renderSortHeader('receiver', '接收对象')}</div>
            <div>{renderSortHeader('category', '通话类别')}</div>
            <div>{renderSortHeader('time', '播报时间')}</div>
            <div className="text-right">{renderSortHeader('kind', '播报类型 / 操作', 'right')}</div>
          </div>
          <div className="divide-y divide-white/5">
            {voices.map((voice: VoiceRecord) => {
              const typeInfo = getVoiceTypeInfo(voice.type);
              const hasAudio = Boolean(voice.audioUrl);
              const toNames = toTextArray(voice.toNames);
              const receiverText = toNames.join(', ');
              const receiverSummary = toNames.length > 2
                ? `${toNames.slice(0, 2).join(', ')} 等 ${toNames.length} 人`
                : (receiverText || '-');
              return (
                <div key={voice.id} onClick={() => setSelectedVoice(voice)} className="group grid grid-cols-[190px_minmax(360px,1fr)_170px_240px_230px] items-center gap-5 bg-slate-950/20 px-5 py-4 cursor-pointer transition-all hover:bg-slate-800/55">
                  <div className="min-w-0"><div className="truncate text-base font-semibold text-slate-50">{asText(voice.from) || '-'}</div></div>
                  <div className="min-w-0">
                    <div className="truncate text-base text-slate-100" title={receiverText}>{receiverSummary}</div>
                    {toNames.length > 2 ? <div className="mt-1.5 text-sm text-cyan-300/75">点击查看全部接收对象</div> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-cyan-300">{typeInfo.icon}</div>
                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-sm text-slate-300">{typeInfo.text}</span>
                  </div>
                  <div className="text-sm text-slate-300">{formatVoiceDateTime(voice.startTime)}</div>
                  <div className="flex items-center justify-end gap-3">
                    <div className="text-right">
                      <span className={`inline-flex min-w-[60px] justify-center rounded-md px-3 py-1 text-sm font-semibold ring-1 ${hasAudio ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-300/20' : 'bg-sky-400/10 text-sky-300 ring-sky-300/20'}`}>{hasAudio ? '语音' : '文字'}</span>
                      {hasAudio ? <div className="mt-1.5 text-sm text-slate-500">{formatDuration(voice.duration)}</div> : null}
                    </div>
                    <button className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-slate-200 transition-all hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-cyan-100">{hasAudio ? <Volume2 size={14} /> : <Info size={14} />}{hasAudio ? '听录音' : '查看文字'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {voices.length === 0 && <div className="text-center py-12 text-slate-400"><Phone size={48} className="mx-auto mb-3 opacity-30" /><p>暂无通话记录</p></div>}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-3 mt-4 pt-3 border-t border-cyan-400/20 flex-shrink-0">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))} className="px-3 py-1 rounded bg-slate-800/50 text-slate-300 disabled:opacity-40">上一页</button>
          <span className="text-sm text-slate-400">第 {currentPage} / {totalPages} 页</span>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((p: number) => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded bg-slate-800/50 text-slate-300 disabled:opacity-40">下一页</button>
        </div>
      )}

      {selectedVoice && (
        <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 p-6 w-[500px]">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">{getVoiceTypeInfo(selectedVoice.type).icon}</div><h3 className="text-xl font-bold text-white">{selectedHasAudio ? '语音播报记录' : '文本播报记录'}</h3></div>
              <button onClick={() => setSelectedVoice(null)} className="p-1 hover:bg-slate-700 rounded"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div className="bg-slate-800/50 rounded-lg p-3"><div className="text-sm text-slate-400">发起人</div><div className="text-white">{selectedVoice.from} ({selectedVoice.fromRole})</div></div>
              <div className="bg-slate-800/50 rounded-lg p-3"><div className="text-sm text-slate-400">接收方</div><div className="text-white">{selectedVoiceNames.join(', ') || '-'}</div></div>
              <div className="bg-slate-800/50 rounded-lg p-3"><div className="text-sm text-slate-400">播报时间</div><div className="text-white">{formatVoiceDateTime(selectedVoice.startTime)}</div></div>
              {selectedVoice.batchId ? <div className="bg-slate-800/50 rounded-lg p-3"><div className="text-sm text-slate-400">记录编号</div><div className="break-all text-white">{selectedVoice.batchId}</div></div> : null}
              {selectedVoice.transcript ? <div className="bg-slate-800/50 rounded-lg p-3"><div className="text-sm text-slate-400">{selectedHasAudio ? '语音转文字' : '播报文字'}</div><div className="mt-1 whitespace-pre-wrap text-white">{selectedVoice.transcript}</div></div> : null}
              {selectedHasAudio ? <div className="bg-slate-800/50 rounded-lg p-3"><div className="mb-2 text-sm text-slate-400">录音回放</div><audio controls src={selectedVoice.audioUrl} className="w-full" /></div> : <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">这是文本播报记录，只保存下发文字，不包含录音文件。</div>}
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setSelectedVoice(null)} className="flex-1 py-2 bg-slate-700 rounded-lg">关闭</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

interface VideoPlaybackProps {
  initialTab?: 'video' | 'track' | 'voice';
}

export default function VideoPlayback({ initialTab }: VideoPlaybackProps) {
    // 鉁?浠?Store 鍙栧嚭鎿嶄綔鍑芥暟
    const { removePlayback, clearAll } = usePlaybackStore();
    const projectScope = readProjectScope();

    // 鉁?淇敼1锛氳澶囧垪琛ㄦ敼涓虹湡瀹炴暟鎹?
    const [devices, setDevices] = useState<Device[]>([]);
    const [loadingDevices, setLoadingDevices] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
    const [selectedCompany, setSelectedCompany] = useState<string>('all');
    const [selectedProject, setSelectedProject] = useState<string>(
      projectScope.isProjectScope && projectScope.projectValue ? projectScope.projectValue : 'all'
    );
    const [selectedTeam, setSelectedTeam] = useState<string>('all');
    const [selectedGrid, setSelectedGrid] = useState<string>('all');
    const [selectedGridLevel, setSelectedGridLevel] = useState<string>('all');
    const [activeTab, setActiveTab] = useState<TabType>('all');
    const [searchKeyword, setSearchKeyword] = useState('');
    const [videoStartDate, setVideoStartDate] = useState('');
    const [videoStartClock, setVideoStartClock] = useState('00:00');
    const [videoEndDate, setVideoEndDate] = useState('');
    const [videoEndClock, setVideoEndClock] = useState('23:59');
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [showProjectDropdown, setShowProjectDropdown] = useState(false);
    const [showGridDropdown, setShowGridDropdown] = useState(false);
    const [showTeamDropdown, setShowTeamDropdown] = useState(false);
    const [showScreenshotModal, setShowScreenshotModal] = useState(false);
    const [selectedPlayback, setSelectedPlayback] = useState<ExtendedSavedPlayback | null>(null);
    const videoPlayerRef = useRef<VideoPlayerRef>(null);
    const videoFiltersRef = useRef<HTMLDivElement | null>(null);

  // 鉁?淇敼2锛氬垹闄ゆā鎷熸暟鎹紝鏀圭敤鐪熷疄 API 鏁版嵁
  const [recordingVideos, setRecordingVideos] = useState<SavedPlaybackVideo[]>([]);
  const [alarmVideos, setAlarmVideos] = useState<SavedPlaybackVideo[]>([]);
  const [alarmScreenshots, setAlarmScreenshots] = useState<SavedPlaybackVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [selectedAlarm, setSelectedAlarm] = useState<ExtendedSavedPlayback | null>(null);
  const [filteredPlaybacks, setFilteredPlaybacks] = useState<ExtendedSavedPlayback[]>([]);
  const [currentPlayback, setCurrentPlayback] = useState<ExtendedSavedPlayback | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [playbackTotal, setPlaybackTotal] = useState(0);
  const [playbackTotalPages, setPlaybackTotalPages] = useState(0);
  // 鉁?40:9 鏇寸獎鍗＄墖锛?0鍒椕?琛?= 40涓紝鍒氬ソ濉弧椤甸潰
  const itemsPerPage = 40;

    // 鏂板锛氫富Tab鐘舵€?
  const [mainTab, setMainTab] = useState<MainTabType>(initialTab || 'video');

  // 鏂板锛氳建杩规暟鎹紙浠嶵rackPlayback.tsx杩佺ЩAPI閫昏緫锛?
  const [trackDevices, setTrackDevices] = useState<TrackDevice[]>([]);
  const [trackRecords, setTrackRecords] = useState<TrackRecord[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [selectedTrackDevice, setSelectedTrackDevice] = useState<TrackDevice | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<TrackRecord | null>(null);
  const [selectedTrackCompany, setSelectedTrackCompany] = useState<string>('all');
  const [selectedTrackProject, setSelectedTrackProject] = useState<string>('all');
  const [selectedTrackTeam, setSelectedTrackTeam] = useState<string>('all');
  const [trackSearchKeyword, setTrackSearchKeyword] = useState('');
  const [showTrackFilter, setShowTrackFilter] = useState(false);
  const [trackSortState, setTrackSortState] = useState<TrackSortState>({ field: 'time', direction: 'desc' });
const getTrackRetentionDaysFromLocal = () => {
  try {
    const settings = JSON.parse(localStorage.getItem('systemSettings') || '{}');
    const days = Number(settings?.trackRetentionDays);
    return Number.isFinite(days) && days > 0 ? days : 30;
  } catch {
    return 30;
  }
};

const getDefaultTrackDateRange = () => {
  const end = new Date();
  const toDateTimeLocalValue = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  return {
    start: '', // 开始时间为空表示无限制
    end: toDateTimeLocalValue(end),
  };
};
const [trackDateRange, setTrackDateRange] = useState(getDefaultTrackDateRange());
  const [trackRetentionDays, setTrackRetentionDays] = useState(getTrackRetentionDaysFromLocal());
  const [trackCurrentPage, setTrackCurrentPage] = useState(1);
  const buildTrackRecord = (device: TrackDevice, deviceData: TrackDevice, hours: number): TrackRecord | null => {
    const sourceTrajectory = Array.isArray(deviceData?.trajectory) ? deviceData.trajectory : [];
    if (!sourceTrajectory.length) return null;
    const resolvedDeviceId = String((deviceData as any).device_id || (deviceData as any).device_code || (device as any).device_id || (device as any).device_code || '');

    let trajectory: TrajectoryPoint[] = sourceTrajectory.filter(point =>
      Number.isFinite(Number(point?.lat)) &&
      Number.isFinite(Number(point?.lng)) &&
      Boolean(point?.timestamp)
    );
    if (hours > 0) {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hours);
      trajectory = trajectory.filter(p => new Date(p.timestamp) >= cutoffTime);
    }

    if (trajectory.length === 0) return null;

    return {
      id: `track_${resolvedDeviceId}_${trajectory[0]?.timestamp || Date.now()}`,
      deviceId: resolvedDeviceId,
      deviceName: deviceData.name || device.name || '未知设备',
      holder: deviceData.holder || deviceData.person_name || device.holder || '未知人员',
      company: deviceData.company || device.company || '',
      branch_id: firstText(deviceData as Record<string, any>, ['branch_id']) || firstText(device as Record<string, any>, ['branch_id']),
      project: deviceData.project || device.project || '',
      project_id: firstText(deviceData as Record<string, any>, ['project_id']) || firstText(device as Record<string, any>, ['project_id']),
      grid: firstText(deviceData as Record<string, any>, ['grid', 'grid_name', 'gridName', 'grid_id']) || firstText(device as Record<string, any>, ['grid', 'grid_name', 'gridName', 'grid_id']),
      team: deviceData.team || device.team || '',
      startTime: trajectory[0]?.timestamp || new Date().toISOString(),
      endTime: trajectory[trajectory.length - 1]?.timestamp || new Date().toISOString(),
      points: trajectory.map(p => ({
        lat: Number(p.lat),
        lng: Number(p.lng),
        time: p.timestamp,
        speed: Number(p.speed) || 0,
      })),
    };
  };

  // 鏂板锛氳闊虫暟鎹?
  const [voiceRecords, setVoiceRecords] = useState<VoiceRecord[]>([]);
  const [voiceRecordsError, setVoiceRecordsError] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceRecord | null>(null);
  const [voiceScopeDevices, setVoiceScopeDevices] = useState<Device[]>([]);
  const [voiceSearchKeyword, setVoiceSearchKeyword] = useState('');
  // 通信回放日期和时间分开（结束时间为当前时间，开始时间为空表示无限制）
  const getDefaultVoiceDateRange = () => {
    const end = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return {
      startDate: '',
      startTime: '',
      endDate: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
      endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
    };
  };
  const defaultVoiceDateRange = getDefaultVoiceDateRange();
  const [voiceDateRange, setVoiceDateRange] = useState({
    startDate: defaultVoiceDateRange.startDate,
    startTime: defaultVoiceDateRange.startTime,
    endDate: defaultVoiceDateRange.endDate,
    endTime: defaultVoiceDateRange.endTime
  });
  const [selectedVoiceCompany, setSelectedVoiceCompany] = useState<string>('all');
  const [selectedVoiceProject, setSelectedVoiceProject] = useState<string>('all');
  const [selectedVoiceGrid, setSelectedVoiceGrid] = useState<string>('all');
  const [selectedVoiceTeam, setSelectedVoiceTeam] = useState<string>('all');
  const [voiceSortState, setVoiceSortState] = useState<VoiceSortState>({ field: 'time', direction: 'desc' });
  const [voiceCurrentPage, setVoiceCurrentPage] = useState(1);
  const itemsPerPageTrackVoice = 10;
  const lastTrackFetchKeyRef = useRef('');
  const activeTrackFetchRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const closeVideoDropdowns = () => {
      setShowCompanyDropdown(false);
      setShowProjectDropdown(false);
      setShowGridDropdown(false);
      setShowTeamDropdown(false);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && videoFiltersRef.current?.contains(target)) return;
      closeVideoDropdowns();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeVideoDropdowns();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadTrackRetentionDays = async () => {
      try {
        const response = await fetch(getApiUrl('/admin/settings'), {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        const settings = await response.json().catch(() => null);
        const days = Number(settings?.trackRetentionDays);

        if (!cancelled && response.ok && Number.isFinite(days) && days > 0) {
          setTrackRetentionDays(days);
        }
      } catch (error) {
        console.warn('鍔犺浇杞ㄨ抗淇濆瓨澶╂暟澶辫触锛屼娇鐢ㄦ湰鍦伴粯璁ゅ€?', error);
      }
    };

    loadTrackRetentionDays();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadVoiceScopeDevices = async () => {
      try {
        const response = await fetch(`${TRACK_API_BASE_URL}/device/devices`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        const payload = await response.json().catch(() => null);
        const deviceList = Array.isArray(payload) ? payload : (payload?.devices || []);
        const normalizedDevices: Device[] = deviceList.map((item: any) => ({
          id: item.id || item.raw_id || item.device_id || item.device_code || item.phone_num || item.holderPhone,
          name: item.name || item.device_name || item.deviceName || item.device_id || '',
          ip_address: item.ip_address || '',
          status: item.status || '',
          company: getDeviceCompany(item),
          project: getDeviceProject(item),
          grid: getDeviceGrid(item),
          grid_id: item.grid_id || '',
          grid_name: item.grid_name || item.grid || '',
          team: getDeviceTeam(item),
          team_id: item.team_id || '',
          team_name: item.team_name || item.team || item.workTeam || item.work_team || '',
          device_id: item.device_id,
          device_code: item.device_code,
          phone_num: item.phone_num,
          holderPhone: item.holderPhone,
        } as Device));

        if (!cancelled) {
          setVoiceScopeDevices(normalizedDevices);
        }
      } catch (error) {
        console.error('加载通信记录设备范围失败:', error);
        if (!cancelled) {
          setVoiceScopeDevices([]);
        }
      }
    };

    loadVoiceScopeDevices();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadVoiceRecords = async () => {
      try {
        const [voiceResponse, textResponse] = await Promise.all([
          fetch(getApiUrl('/call/voice-records?limit=100'), {
            headers: getAuthHeaders(),
            credentials: 'include',
          }),
          fetch(getApiUrl('/call/tts/batches?limit=100'), {
            headers: getAuthHeaders(),
            credentials: 'include',
          }),
        ]);
        const voicePayload = (await voiceResponse.json().catch(() => null)) as unknown;
        const textPayload = (await textResponse.json().catch(() => null)) as unknown;

        if (!voiceResponse.ok || !isVoiceRecordResponseList(voicePayload)) {
          throw new Error('鍔犺浇閫氫俊鍥炴斁澶辫触');
        }

        if (!textResponse.ok || !isTtsBatchResponseList(textPayload)) {
          throw new Error('閸旂姾娴囬柅姘繆閸ョ偞鏂佹径杈Е');
        }

        const audioRecords = voicePayload.map(createVoiceRecordFromResponse);
        const audioBatchIds = new Set(audioRecords.map((record) => record.batchId).filter(Boolean));
        const textRecords = textPayload
          .filter((batch) => !audioBatchIds.has(batch.batch_id))
          .map(createVoiceRecordFromBatch);

        const requireVoiceDeviceMatch = !isGlobalPermissionScope();
        const scopedRecords = [...audioRecords, ...textRecords]
          .map(record => attachScopedVoiceOrg(record, voiceScopeDevices, requireVoiceDeviceMatch))
          .filter((record): record is VoiceRecord => Boolean(record));

        setVoiceRecords(
          scopedRecords.sort(
            (a, b) => parseVoiceDateTime(b.startTime).getTime() - parseVoiceDateTime(a.startTime).getTime()
          )
        );
        setVoiceRecordsError('');
      } catch (error) {
        const message = error instanceof Error ? error.message : '鍔犺浇閫氫俊鍥炴斁澶辫触';
        setVoiceRecordsError(message);
      }
    };

    loadVoiceRecords();
  }, [voiceScopeDevices]);

  useEffect(() => {
    if (!projectScope.isProjectScope || !projectScope.projectValue) return;
    if (selectedProject !== projectScope.projectValue) {
      setSelectedProject(projectScope.projectValue);
      setSelectedGrid('all');
      setSelectedTeam('all');
    }
    setShowCompanyDropdown(false);
    setShowProjectDropdown(false);
  }, [projectScope.isProjectScope, projectScope.projectValue, selectedProject]);

  useEffect(() => {
    if (!projectScope.isProjectScope || !projectScope.projectValue) return;
    if (selectedTrackProject !== projectScope.projectValue) {
      setSelectedTrackProject(projectScope.projectValue);
      setSelectedTrackTeam('all');
    }
    setSelectedTrackCompany('all');
  }, [projectScope.isProjectScope, projectScope.projectValue, selectedTrackProject]);
    // 鑾峰彇鎵€鏈夊叕鍙稿垪琛?
    const companies = ['all', ...new Set(devices.map(d => d.company).filter(Boolean))];

    // 鏍规嵁閫変腑鐨勫叕鍙歌幏鍙栭」鐩垪琛?
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
    const playbackFilterSources = [...devices, ...filteredPlaybacks];
    const companiesForFilter = ['all', ...new Set(playbackFilterSources.map(getDeviceCompany).filter(Boolean))];
  useEffect(() => {
    if (selectedCompany !== 'all' && !companiesForFilter.includes(selectedCompany)) {
      setSelectedCompany('all');
    }
  }, [selectedCompany, companiesForFilter.join('|')]);
  const projectsForFilter = ['all', ...new Set(playbackFilterSources
    .filter(item => selectedCompany === 'all' || getDeviceCompany(item) === selectedCompany)
    .map(getDeviceProject)
    .filter(Boolean))];
    const gridsForFilter = ['all', ...new Set(playbackFilterSources
    .filter(item => selectedCompany === 'all' || getDeviceCompany(item) === selectedCompany)
    .filter(item => selectedProject === 'all' || getDeviceProject(item) === selectedProject || (projectScope.isProjectScope && projectMatchesScope(getDeviceProject(item), projectScope)))
    .map(getDeviceGrid)
    .filter(Boolean))];
  const teamsForFilter = ['all', ...new Set(playbackFilterSources
    .filter(item => selectedCompany === 'all' || getDeviceCompany(item) === selectedCompany)
    .filter(item => selectedProject === 'all' || getDeviceProject(item) === selectedProject || (projectScope.isProjectScope && projectMatchesScope(getDeviceProject(item), projectScope)))
    .filter(item => selectedGrid === 'all' || getDeviceGrid(item) === selectedGrid)
    .map(getDeviceTeam)
    .filter(Boolean))];
    const selectedGridLabel = selectedGrid === 'all' ? '' : gridsForFilter.find(grid => grid === selectedGrid) || selectedGrid;

    // 鍒濆鍖栨ā鎷熸暟鎹?
    // useEffect(() => {
    //   if (savedPlaybacks.length === 0) {
    //     mockPlaybacks.forEach(playback => {
    //       addPlayback(playback);
    //     });
    //   }
    // }, [savedPlaybacks.length, addPlayback]);

      // 鉁?鏂板锛氬姞杞界湡瀹炶澶囧垪琛?
  useEffect(() => {
    const loadDevices = async () => {
      setLoadingDevices(true);
      try {
        const data = await getAllVideos();
        // 杞崲涓?Device 鏍煎紡
        const deviceList: Device[] = data.map(v => ({
          id: v.id,
          name: v.name,
          ip_address: v.ip_address || '',
          status: v.status,
          company: getDeviceCompany(v),
          project: getDeviceProject(v),
          grid: getDeviceGrid(v),
          grid_id: v.grid_id || '',
          grid_name: v.grid_name || v.grid || '',
          team: getDeviceTeam(v),
          team_id: v.team_id || '',
          team_name: v.team_name || v.team || v.workTeam || v.work_team || '',
        }));
        setDevices(deviceList);
        // 鉁?涓嶉粯璁ら€夎澶囷紝涓€杩涙潵灏辨槸"鍏ㄩ儴璁惧"
      } catch (err) {
        console.error('鍔犺浇璁惧澶辫触:', err);
      } finally {
        setLoadingDevices(false);
      }
    };
    loadDevices();
  }, []);

  // 鉁?鍔犺浇瑙嗛锛氫袱涓狝PI鐙珛鍔犺浇锛屼簰涓嶅奖鍝嶏紒
useEffect(() => {
  let cancelled = false;
  const isAlarmTab = activeTab === 'alarm';
  const startTimeFilter = videoStartDate ? `${videoStartDate}T${videoStartClock || '00:00'}` : '';
  const endTimeFilter = videoEndDate ? `${videoEndDate}T${videoEndClock || '23:59'}` : '';
  const timer = window.setTimeout(async () => {
    setLoadingVideos(true);
    try {
      const result = await getPlaybackPage({
        mediaType: isAlarmTab ? 'alarm' : 'manual',
        page: currentPage,
        pageSize: itemsPerPage,
        deviceId: selectedDevice?.id,
        company: selectedCompany,
        project: selectedProject,
        grid: selectedGrid,
        team: selectedTeam,
        keyword: searchKeyword,
        startTime: startTimeFilter,
        endTime: endTimeFilter,
      });
      if (cancelled) return;
      if (isAlarmTab) {
        setAlarmVideos(result.data);
        setRecordingVideos([]);
      } else {
        setRecordingVideos(result.data);
        setAlarmVideos([]);
      }
      setAlarmScreenshots([]);
      setPlaybackTotal(result.total);
      setPlaybackTotalPages(result.total_pages);
    } catch (error) {
      if (!cancelled) {
        console.error('加载回放分页失败:', error);
        setRecordingVideos([]);
        setAlarmVideos([]);
        setAlarmScreenshots([]);
        setPlaybackTotal(0);
        setPlaybackTotalPages(0);
      }
    } finally {
      if (!cancelled) {
        setLoadingVideos(false);
      }
    }
  }, 200);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}, [
  activeTab,
  currentPage,
  selectedDevice?.id,
  selectedCompany,
  selectedProject,
  selectedGrid,
  selectedTeam,
  searchKeyword,
  videoStartDate,
  videoStartClock,
  videoEndDate,
  videoEndClock,
]);

// 鉁?杞ㄨ抗API璋冪敤锛堜粠TrackPlayback.tsx杩佺Щ锛?
// 鑾峰彇杞ㄨ抗璁惧鍒楄〃
useEffect(() => {
  const fetchTrackDevices = async () => {
    if (mainTab !== 'track') return;
    if (trackDevices.length > 0) return;
    try {
      const res = await fetch(`${TRACK_API_BASE_URL}/device/devices`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      const deviceList: TrackDevice[] = Array.isArray(data) ? data : (data.devices || []);
      setTrackDevices(deviceList);
      // 榛樿閫夋嫨绗竴涓澶?
      if (deviceList.length > 0 && !selectedTrackDevice) {
        setSelectedTrackDevice(deviceList[0]);
      }
    } catch (err) {
      console.error('鑾峰彇杞ㄨ抗璁惧澶辫触:', err);
      setTrackDevices([]);
    }
  };
  fetchTrackDevices();
}, [mainTab, trackDevices.length]);

// 鉁?鑾峰彇鎵€鏈夎澶囩殑杞ㄨ抗鏁版嵁锛堢湡姝ｅ悜鍚庣API璇锋眰鏁版嵁锛?
const fetchAllTrajectories = async (hours: number = 24, signal?: AbortSignal) => {
  setLoadingTracks(true);
  try {
    const params = new URLSearchParams({ hours: String(hours) });
    if (trackDateRange.start) params.set('start_time', new Date(trackDateRange.start).toISOString());
    if (trackDateRange.end) params.set('end_time', new Date(trackDateRange.end).toISOString());
    const res = await fetch(`${TRACK_API_BASE_URL}/device/trajectories/summary?${params.toString()}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const devicesWithTrajectory: any[] = Array.isArray(data) ? data : (data.devices || []);
    const deviceById = new Map<string, TrackDevice>();
    trackDevices.forEach(device => {
      const primaryId = String((device as any).device_id || '');
      const code = String((device as any).device_code || '');
      if (primaryId) deviceById.set(primaryId, device);
      if (code) deviceById.set(code, device);
    });
    const trackRecords = devicesWithTrajectory.map((summary) => {
      const lookupId = String(summary.device_id || summary.device_code || '');
      const device = deviceById.get(lookupId) || summary;
      const startPoint = summary.start_point;
      const points = startPoint && Number.isFinite(Number(startPoint.lat)) && Number.isFinite(Number(startPoint.lng))
        ? [{
            lat: Number(startPoint.lat),
            lng: Number(startPoint.lng),
            time: startPoint.timestamp || summary.start_time,
            speed: Number(startPoint.speed) || 0,
          }]
        : [];
      return {
        id: `track_${lookupId}_${summary.start_time || Date.now()}`,
        deviceId: lookupId,
        deviceName: summary.device_name || device.name || '未知设备',
        holder: summary.holder || device.holder || '未知人员',
        company: summary.company || device.company || '',
        branch_id: String(summary.branch_id || device.branch_id || ''),
        project: summary.project || device.project || '',
        project_id: String(summary.project_id || device.project_id || ''),
        grid: summary.grid || device.grid || device.grid_name || '',
        team: summary.team || device.team || '',
        startTime: summary.start_time,
        endTime: summary.end_time,
        points,
        pointCount: Number(summary.point_count) || 0,
      } as TrackRecord;
    }).filter((record) => record.deviceId && record.startTime && record.endTime);

    if (!signal?.aborted) {
      setTrackRecords(trackRecords);
    }
  } catch (err) {
    if (signal?.aborted) return;
    console.error('获取轨迹失败:', err);
    setTrackRecords([]);
  } finally {
    if (!signal?.aborted) setLoadingTracks(false);
  }
};
// 设备列表或日期范围变化时获取轨迹
useEffect(() => {
  if (mainTab !== 'track') {
    activeTrackFetchRef.current?.abort();
    activeTrackFetchRef.current = null;
    setLoadingTracks(false);
    return;
  }

  let hours = 24;
  if (trackDateRange.start && trackDateRange.end) {
    const start = new Date(trackDateRange.start);
    const end = new Date(trackDateRange.end);
    const diff = Math.abs(end.getTime() - start.getTime());
    hours = Math.ceil(diff / (1000 * 60 * 60)) || 24;
  } else if (trackDateRange.start) {
    const start = new Date(trackDateRange.start);
    const end = new Date();
    const diff = Math.abs(end.getTime() - start.getTime());
    hours = Math.ceil(diff / (1000 * 60 * 60)) || 24;
  }
  hours = Math.min(hours, Math.max(24, Math.ceil(trackRetentionDays * 24)));

  const deviceKey = trackDevices.map(device => device.device_id).join(',');
  const fetchKey = `${deviceKey}|${trackDateRange.start}|${trackDateRange.end}|${hours}`;
  if (lastTrackFetchKeyRef.current === fetchKey) return;
  lastTrackFetchKeyRef.current = fetchKey;

  activeTrackFetchRef.current?.abort();
  const controller = new AbortController();
  activeTrackFetchRef.current = controller;
  fetchAllTrajectories(hours, controller.signal).catch(error => {
    if (!controller.signal.aborted) {
      console.error('获取轨迹失败:', error);
    }
  });

  return undefined;
}, [mainTab, trackDevices, trackDateRange.start, trackDateRange.end, trackRetentionDays]);

  const openTrackPlayback = async (track: TrackRecord | null) => {
    if (!track) {
      setSelectedTrack(null);
      return;
    }
    setLoadingTracks(true);
    try {
      const params = new URLSearchParams({
        hours: String(Math.min(24 * 90, Math.max(1, trackRetentionDays * 24))),
        start_time: track.startTime,
        end_time: track.endTime,
      });
      const response = await fetch(
        `${TRACK_API_BASE_URL}/device/trajectories/${encodeURIComponent(track.deviceId)}/points?${params.toString()}`,
        {
          headers: getAuthHeaders(),
          credentials: 'include',
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const points = (Array.isArray(payload?.points) ? payload.points : [])
        .filter((point: any) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)))
        .map((point: any) => ({
          lat: Number(point.lat),
          lng: Number(point.lng),
          time: point.timestamp || point.time,
          speed: Number(point.speed) || 0,
        }));
      setSelectedTrack({ ...track, points, pointCount: points.length });
    } catch (error) {
      console.error('加载轨迹点失败:', error);
      setSelectedTrack({ ...track, points: [] });
    } finally {
      setLoadingTracks(false);
    }
  };
  // 鉁?鐪熷疄API + 鍏滃簳锛屽叏閮ㄨ澶囦篃鏈夋暟鎹紒
  useEffect(() => {
    const convertToSavedPlayback = (): ExtendedSavedPlayback[] => {
      const list: ExtendedSavedPlayback[] = [];

      // 鉁?鐢ㄧ涓€涓澶囧綋榛樿锛堝叏閮ㄨ澶囨椂涔熸樉绀哄唴瀹癸級
      const getPlaybackDevice = (video: SavedPlaybackVideo) => {
        const attached = (video as any).__device as Device | undefined;
        if (attached) return attached;
        const matched = devices.find(device => String(device.id) === String(video.device_id || ''));
        if (matched) return matched;
        return {
          id: Number(video.device_id || 0),
          name: video.device_name || video.name || '未知设备',
          ip_address: '',
          status: '',
          company: video.company || '',
          project: video.project || '',
          project_id: video.project_id || '',
          grid: video.grid || '',
          grid_id: video.grid_id || '',
          grid_name: video.grid || '',
          team: video.team || '',
          team_id: video.team_id || '',
          team_name: video.team || '',
        } as Device;
      };

      const createBasePlayback = (video: SavedPlaybackVideo) => {
        const baseDevice = getPlaybackDevice(video);
        const companyName = getDeviceCompany(baseDevice);
        const projectName = getDeviceProject(baseDevice);
        const gridName = getDeviceGrid(baseDevice);
        const teamName = getDeviceTeam(baseDevice);

        return {
          deviceId: baseDevice?.id || 0,
          deviceName: baseDevice?.name || video.name || '未知设备',
          company: companyName,
          project: projectName,
          project_id: baseDevice?.project_id || '',
          grid: gridName,
          grid_id: baseDevice?.grid_id || '',
          grid_name: baseDevice?.grid_name || gridName,
          team: teamName,
          team_id: baseDevice?.team_id || '',
          team_name: baseDevice?.team_name || teamName,
          companyName,
          projectName,
          gridName,
          teamName,
          companyKey: companyName,
          projectKey: projectName,
          gridKey: gridName,
          teamKey: teamName,
          deviceKey: String(baseDevice?.id || ''),
        };
      };

      const getMatchedScreenshot = (video: SavedPlaybackVideo) => {
        const screenshots = alarmScreenshots as any[];

        if (!screenshots || screenshots.length === 0) {
          return null;
        }

        const videoTime = new Date(getPlaybackEventTime(video)).getTime();
        let best: any = null;
        let bestDiff = Number.POSITIVE_INFINITY;

        for (const shot of screenshots) {
          const shotTime = new Date(getPlaybackEventTime(shot)).getTime();

          if (Number.isNaN(videoTime) || Number.isNaN(shotTime)) {
            continue;
          }

          const diff = Math.abs(shotTime - videoTime);

          if (diff < bestDiff) {
            best = shot;
            bestDiff = diff;
          }
        }

        if (best && bestDiff <= 5 * 60 * 1000) {
          return best;
        }

        return screenshots[0] || null;
      };

      // 馃摴 浼樺厛鐢ㄧ湡瀹炲父瑙勮棰戯紙鍙挱鏀撅級
      recordingVideos.forEach(video => {
        const duration = video.duration_seconds || 300;
        const startTime = video.start_time || getPlaybackEventTime(video);
        const endTime = video.end_time || video.updated_at || getPlaybackEventTime(video);
        const createdAt = video.created_at || getPlaybackEventTime(video);
        const basePlayback = createBasePlayback(video);
        list.push({
          id: `rec_${video.name}`,
          ...basePlayback,
          type: 'manual',
          startTime,
          endTime,
          duration: duration,
          filePath: toVideoUrl(video.web_path),
          thumbnail: video.thumbnail_path || video.thumbnail ? toVideoUrl(video.thumbnail_path || video.thumbnail) : '',
          createdAt,
        });
      });

      // 馃毃 浼樺厛鐢ㄧ湡瀹炴姤璀﹁棰戯紙鍙挱鏀撅級
      // 馃敆 鑷姩瑙ｆ瀽鏂囦欢鍚嶈绠楁姤璀﹀湪瑙嗛閲岀殑绉掓暟浣嶇疆锛?

      alarmVideos.forEach(video => {
        const duration = video.duration_seconds || 60;
        const startTime = video.start_time || getPlaybackEventTime(video);
        const endTime = video.end_time || video.updated_at || getPlaybackEventTime(video);
        const createdAt = video.created_at || getPlaybackEventTime(video);
        const basePlayback = createBasePlayback(video);

        // 鉁?閫氳繃鏂囦欢鍚嶈绠楋細鎶ヨ鍦ㄨ棰戦噷鐨勭鍑犵
        const matchedScreenshot = (() => {
          const screenshots = alarmScreenshots as any[];


          if (!screenshots || screenshots.length === 0) {
            return null;
          }

          const videoTime = new Date(getPlaybackEventTime(video)).getTime();

          let best: any = null;
          let bestDiff = Number.POSITIVE_INFINITY;

          for (const shot of screenshots) {
            const shotTime = new Date(getPlaybackEventTime(shot)).getTime();

            if (Number.isNaN(videoTime) || Number.isNaN(shotTime)) {
              continue;
            }

            const diff = Math.abs(shotTime - videoTime);
            if (diff < bestDiff) {
              best = shot;
              bestDiff = diff;
            }
          }


          // 鍏佽 5 鍒嗛挓鍐呭尮閰嶏紱濡傛灉娌℃湁鍚堥€傛椂闂达紝涔熷厹搴曞彇鏈€鏂颁竴寮?
          if (best && bestDiff <= 5 * 60 * 1000) {

            return best;
          }

          return null;
        })();

        const screenshotRawPath =
          video.alarm_image_path ||
          video.screenshot_path ||
          video.thumbnail_path ||
          video.thumbnail ||
          matchedScreenshot?.web_path ||
          matchedScreenshot?.thumbnail_path ||
          matchedScreenshot?.thumbnail ||
          matchedScreenshot?.url ||
          '';

        const screenshotUrl = screenshotRawPath
          ? withMediaCacheKey(toVideoUrl(screenshotRawPath), matchedScreenshot?.updated_at || matchedScreenshot?.name)
          : '';


        const alarmSecond = (() => {
          const explicitAlarmSecond = Number(video.alarm_second);
          if (Number.isFinite(explicitAlarmSecond)) {
            return Math.max(0, Math.min(duration - 1, explicitAlarmSecond));
          }

          const videoStartTime = new Date(startTime).getTime();
          const alarmTime = new Date((video as any).alarm_time || '').getTime();

          if (!Number.isNaN(videoStartTime) && !Number.isNaN(alarmTime)) {
            return Math.max(0, Math.min(duration - 1, Math.round((alarmTime - videoStartTime) / 1000)));
          }

          if (!matchedScreenshot) return 10;

          const videoTime = new Date(getPlaybackEventTime(video)).getTime();
          const shotTime = new Date(getPlaybackEventTime(matchedScreenshot)).getTime();

          if (Number.isNaN(videoTime) || Number.isNaN(shotTime)) {
            return 10;
          }

          return Math.max(0, Math.min(duration - 1, Math.round((shotTime - videoTime) / 1000)));
        })();

        list.push({
          id: `alarm_${video.alarm_id || video.name}`,
          ...basePlayback,
          type: 'alarm',
          startTime,
          endTime,
          duration: duration,
          filePath: withMediaCacheKey(toVideoUrl(video.web_path), video.updated_at || video.name),
          createdAt,
          alarmSecond,  // 鉁?浼犵粰鎾斁鍣紒杩涘害鏉＄孩鐐瑰湪杩欓噷锛?
          alarmInfo: {
              type: 'AI检测',
              msg: '检测到异常行为',
            score: 0.95,
            timestamp: startTime,
              personnel: '未知',
            screenshotUrl,
            screenshot: screenshotUrl
              ? {
                  id: String(video.alarm_id || video.name),
                  url: screenshotUrl,
                  thumbnail: screenshotUrl,

                  timestamp: getPlaybackEventTime(matchedScreenshot) || getPlaybackEventTime(video),

                }
              : undefined,
          },
        });
      });

      // 鉁?缁堟瀬鍏滃簳锛氬鏋滄姤璀﹁棰?< 3鏉★紙API杩樻病鍥炴潵鎴栧け璐ワ級
      // 灏辫ˉ鍏呭埌鑷冲皯3鏉★紝淇濊瘉鎶ヨTab姘歌繙涓嶄负绌猴紒


      return list;
    };

    let list = convertToSavedPlayback();

    // 鎸塗ab绛涢€?
    if (activeTab === 'alarm') {
      list = list.filter(p => p.type === 'alarm');
    } else {
      list = list.filter(p => p.type === 'manual');
    }

    // 鉁?鏈€缁堟寜鏃堕棿鍊掑簭鎺掑垪锛堟柊鐨勫湪鍓嶏級
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setFilteredPlaybacks(list);
  }, [selectedDevice, recordingVideos, alarmVideos, alarmScreenshots, activeTab, devices]);


// 鉁?鍒嗛〉璁＄畻 - 鏀惧湪 useEffect 澶栭潰
const totalPages = playbackTotalPages;
const currentPagePlaybacks = filteredPlaybacks;

// 绛涢€夊彉鍖栨椂閲嶇疆椤电爜
useEffect(() => {
  setCurrentPage(1);
}, [activeTab, selectedCompany, selectedProject, selectedGrid, selectedTeam, selectedDevice, searchKeyword, videoStartDate, videoStartClock, videoEndDate, videoEndClock]);


    // 鎾斁閫変腑鐨勫洖鏀?
    const handlePlay = (playback: ExtendedSavedPlayback) => {
      setSelectedPlayback(playback);
    };

    // 鍒犻櫎鍥炴斁璁板綍
    const handleDelete = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm('确定要删除这个回放记录吗？')) {
        removePlayback(id);
        if (selectedPlayback?.id === id) {
          setSelectedPlayback(null);
        }
      }
    };

    // 娓呯┖鎵€鏈夎褰?
    const handleClearAll = () => {
      if (confirm('确定要清空所有回放记录吗？此操作不可恢复。')) {
        clearAll();
        setSelectedPlayback(null);
      }
    };

    // 鏍煎紡鍖栨椂闂存樉绀?
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

    // 鏍煎紡鍖栨椂闀?
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

const enrichAlarmWithScreenshot = (playback: ExtendedSavedPlayback | null): ExtendedSavedPlayback | null => {
  if (!playback || playback.type !== 'alarm') return playback;

  const currentUrl = getScreenshotUrl(playback);
  if (currentUrl) return playback;

  const sameDeviceShots = (alarmScreenshots as any[]).filter((shot) => {
    const shotDevice = String(shot.__device?.id || shot.video_id || shot.device_id || '').trim();
    const playbackDevice = String(playback.deviceId || playback.deviceKey || '').trim();
    return !playbackDevice || !shotDevice || shotDevice === playbackDevice;
  });

  if (sameDeviceShots.length === 0) return playback;

  const playbackTime = new Date(playback.alarmInfo?.timestamp || playback.startTime || playback.createdAt).getTime();
  let bestShot = sameDeviceShots[0];
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const shot of sameDeviceShots) {
    const shotTime = new Date(getPlaybackEventTime(shot)).getTime();
    if (Number.isNaN(playbackTime) || Number.isNaN(shotTime)) continue;
    const diff = Math.abs(shotTime - playbackTime);
    if (diff < bestDiff) {
      bestShot = shot;
      bestDiff = diff;
    }
  }

  const rawPath = bestShot?.web_path || bestShot?.thumbnail_path || bestShot?.thumbnail || bestShot?.url || '';
  const screenshotUrl = rawPath ? withMediaCacheKey(toVideoUrl(rawPath), bestShot?.updated_at || bestShot?.name) : '';
  if (!screenshotUrl) return playback;

  return {
    ...playback,
    alarmInfo: {
      ...(playback.alarmInfo || {
        type: 'AI检测',
        msg: '检测到异常行为',
        score: 0.95,
        timestamp: playback.startTime,
        personnel: '未知',
      }),
      screenshotUrl,
      screenshot: {
        id: bestShot.name || bestShot.id || playback.id,
        url: screenshotUrl,
        thumbnail: screenshotUrl,
        timestamp: getPlaybackEventTime(bestShot) || playback.alarmInfo?.timestamp || playback.startTime,
      },
    },
  };
};

  // 杞ㄨ抗绛涢€夎绠?
  const scopedTrackRecords = trackRecords.filter((track) => trackBelongsToScope(track, projectScope));
  const trackOrgTree = buildTrackOrgTreeFromDevices(trackDevices, projectScope);

  useEffect(() => {
    const companyOptions = trackOrgTree.map((company) => company.id);
    if (selectedTrackCompany !== 'all' && !companyOptions.includes(selectedTrackCompany)) {
      setSelectedTrackCompany('all');
    }
  }, [selectedTrackCompany, trackOrgTree]);

  useEffect(() => {
    const projectOptions = (selectedTrackCompany === 'all'
      ? trackOrgTree.flatMap((company) => company.projects || [])
      : (trackOrgTree.find((company) => company.id === selectedTrackCompany)?.projects || [])
    ).map((project) => project.id);

    if (selectedTrackProject !== 'all' && !projectOptions.includes(selectedTrackProject)) {
      setSelectedTrackProject('all');
    }
  }, [selectedTrackCompany, selectedTrackProject, trackOrgTree]);

  useEffect(() => {
    const projectOptions = selectedTrackCompany === 'all'
      ? trackOrgTree.flatMap((company) => company.projects || [])
      : (trackOrgTree.find((company) => company.id === selectedTrackCompany)?.projects || []);
    const teamOptions = projectOptions
      .filter((project) => selectedTrackProject === 'all' || project.id === selectedTrackProject)
      .flatMap((project) => project.teams || []);

    if (selectedTrackTeam !== 'all' && !teamOptions.includes(selectedTrackTeam)) {
      setSelectedTrackTeam('all');
    }
  }, [selectedTrackCompany, selectedTrackProject, selectedTrackTeam, trackOrgTree]);

  const filteredTracks = scopedTrackRecords.filter(track => {
    const holder = asText(track.holder);
    const deviceName = asText(track.deviceName);
    if (selectedTrackCompany !== 'all' && asText(track.company) !== selectedTrackCompany) return false;
    if (!trackProjectMatchesSelection(track, selectedTrackProject)) return false;
    if (selectedTrackTeam !== 'all' && asText(track.team) !== selectedTrackTeam) return false;
    if (trackSearchKeyword && !holder.includes(trackSearchKeyword) && !deviceName.includes(trackSearchKeyword)) return false;
    const trackStart = new Date(track.startTime).getTime();
    const trackEnd = new Date(track.endTime).getTime();
    if (trackDateRange.start && trackEnd < new Date(trackDateRange.start).getTime()) return false;
    if (trackDateRange.end && trackStart > new Date(trackDateRange.end).getTime()) return false;
    return true;
  }).sort((a, b) => {
    const aValue = getTrackSortValue(a, trackSortState.field);
    const bValue = getTrackSortValue(b, trackSortState.field);
    const direction = trackSortState.direction === 'asc' ? 1 : -1;

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return (aValue - bValue) * direction;
    }

    return String(aValue).localeCompare(String(bValue), 'zh-CN') * direction;
  });
  const paginatedTracks = filteredTracks.slice((trackCurrentPage - 1) * itemsPerPageTrackVoice, trackCurrentPage * itemsPerPageTrackVoice);
  const trackTotalPages = Math.ceil(filteredTracks.length / itemsPerPageTrackVoice);

  // 璇煶绛涢€夎绠?
  const voiceOrgTree = (() => {
    const companyMap = new Map<string, any>();

    voiceRecords.forEach((voice) => {
      if (!voice.company) return;
      const companyId = voice.company;
      const projectId = voice.project || '未匹配项目';
      const gridId = voice.grid || '未匹配网格';
      const teamId = voice.team || '未匹配工队';

      if (!companyMap.has(companyId)) {
        companyMap.set(companyId, { id: companyId, name: companyId, count: 0, projects: new Map<string, any>() });
      }
      const company = companyMap.get(companyId);
      company.count += 1;

      if (!company.projects.has(projectId)) {
        company.projects.set(projectId, { id: projectId, name: projectId, count: 0, grids: new Map<string, any>() });
      }
      const project = company.projects.get(projectId);
      project.count += 1;

      if (!project.grids.has(gridId)) {
        project.grids.set(gridId, { id: gridId, name: gridId, count: 0, teams: new Map<string, any>() });
      }
      const grid = project.grids.get(gridId);
      grid.count += 1;

      if (!grid.teams.has(teamId)) {
        grid.teams.set(teamId, { id: teamId, name: teamId, count: 0 });
      }
      grid.teams.get(teamId).count += 1;
    });

    return Array.from(companyMap.values()).map((company) => ({
      ...company,
      projects: Array.from(company.projects.values()).map((project: any) => ({
        ...project,
        grids: Array.from(project.grids.values()).map((grid: any) => ({
          ...grid,
          teams: Array.from(grid.teams.values()),
        })),
      })),
    }));
  })();

  const filteredVoices = voiceRecords.filter(voice => {
    const voiceTime = parseVoiceDateTime(voice.startTime);
    const filterStart = voiceDateRange.startDate ? new Date(`${voiceDateRange.startDate}T${voiceDateRange.startTime || '00:00'}:00`) : null;
    const filterEnd = voiceDateRange.endDate ? new Date(`${voiceDateRange.endDate}T${voiceDateRange.endTime || '23:59'}:59`) : null;
    if (selectedVoiceCompany !== 'all' && voice.company !== selectedVoiceCompany) return false;
    if (selectedVoiceProject !== 'all' && voice.project !== selectedVoiceProject) return false;
    if (selectedVoiceGrid !== 'all' && (voice.grid || '未匹配网格') !== selectedVoiceGrid) return false;
    if (selectedVoiceTeam !== 'all' && (voice.team || '未匹配工队') !== selectedVoiceTeam) return false;
    const from = asText(voice.from);
    const toNames = toTextArray(voice.toNames);
    if (voiceSearchKeyword && !from.includes(voiceSearchKeyword) && !toNames.some(n => n.includes(voiceSearchKeyword))) return false;
    if (filterStart && voiceTime < filterStart) return false;
    if (filterEnd && voiceTime > filterEnd) return false;
    return true;
  }).sort((a, b) => {
    const aValue = getVoiceSortValue(a, voiceSortState.field);
    const bValue = getVoiceSortValue(b, voiceSortState.field);
    const direction = voiceSortState.direction === 'asc' ? 1 : -1;

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return (aValue - bValue) * direction;
    }

    return String(aValue).localeCompare(String(bValue), 'zh-CN') * direction;
  });
  const paginatedVoices = filteredVoices.slice((voiceCurrentPage - 1) * itemsPerPageTrackVoice, voiceCurrentPage * itemsPerPageTrackVoice);
  const voiceTotalPages = Math.ceil(filteredVoices.length / itemsPerPageTrackVoice);

return (
  <div className="h-full flex flex-col gap-4 p-4 text-slate-100 bg-[radial-gradient(circle_at_12%_8%,rgba(56,189,248,0.20),transparent_32%),radial-gradient(circle_at_86%_2%,rgba(59,130,246,0.22),transparent_30%),linear-gradient(135deg,#020617,#0b1f3f_45%,#102a5e)]">

    {/* ========== 鐩戞帶鍥炴斁鍐呭锛堝師鏈夊叏閮ㄥ姛鑳斤級 ========== */}
    {mainTab === 'video' && (
      <>

        {/* 鏍规嵁鐘舵€佹樉绀轰笉鍚屽唴瀹?*/}
        {!showPlayer ? (
          /* 鍗＄墖缃戞牸瑙嗗浘 */
          <div className="flex-1 overflow-hidden flex flex-col h-full">
            <div className="flex justify-between items-center mb-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-cyan-300">
                  监控视频
                  <span className="text-sm text-slate-400 ml-2">（共 {playbackTotal} 条记录）</span>
                  {loadingVideos && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-cyan-300">
                      <Loader2 size={12} className="animate-spin" />
                      加载中
                    </span>
                  )}
                </h3>

                {/* 鏌ョ湅妯″紡鍒囨崲鎸夐挳 */}
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

                {/* 鍥哄畾绛涢€夋爮锛氭爲鐘剁粨鏋勶紙鍏徃 -> 椤圭洰/缃戞牸 -> 浣滀笟闃?璁惧锛?*/}
                <div ref={videoFiltersRef} className="flex items-center gap-2 flex-1 ml-4">
                  {/* 鎼滅储妗?*/}
                  <div className="relative w-[320px]">
                    <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
                    <input
                      type="text"
                      placeholder="搜索设备/人员/事件/公司/项目/网格/工队"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                    {searchKeyword && (
                      <button onClick={() => setSearchKeyword('')} className="absolute right-2 top-1/2 transform -translate-y-1/2">
                        <X size={14} className="text-slate-400 hover:text-white" />
                      </button>
                    )}
                  </div>

                  {(projectScope.showCompanyFilter || projectScope.showProjectFilter) && (
                    <>
                      {projectScope.showCompanyFilter && (
                        <div className="relative">
                          <button
                            onClick={() => { setShowCompanyDropdown(!showCompanyDropdown); setShowProjectDropdown(false); setShowGridDropdown(false); setShowTeamDropdown(false); }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                              selectedCompany !== 'all' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800/80 border border-slate-700 text-slate-300 hover:border-slate-600'
                            }`}
                          >
                            <Building2 size={14} />
                            <span>{selectedCompany === 'all' ? '所有公司' : selectedCompany}</span>
                            <ChevronDown size={12} />
                          </button>
                          {showCompanyDropdown && (
                            <div className="absolute top-full left-0 mt-1 z-[500] bg-slate-800 rounded-xl border border-cyan-400/30 shadow-2xl p-2 min-w-[200px] max-h-[300px] overflow-y-auto">
                              <button
                                onClick={() => { setSelectedCompany('all'); setSelectedProject('all'); setSelectedGrid('all'); setSelectedTeam('all'); setShowCompanyDropdown(false); }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedCompany === 'all' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-300 hover:bg-slate-700'}`}
                              >
                                所有公司
                              </button>
                              {companiesForFilter.filter(company => company !== 'all').map((company: string) => (
                                <div key={company}>
                                  <button
                                    onClick={() => { setSelectedCompany(selectedCompany === company ? 'all' : company); setSelectedProject('all'); setSelectedGrid('all'); setSelectedTeam('all'); }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${
                                      selectedCompany === company ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-300 hover:bg-slate-700'
                                    }`}
                                  >
                                    <span>{company}</span>
                                    <span className="text-xs text-slate-500">{playbackFilterSources.filter(item => getDeviceCompany(item) === company).length}</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {projectScope.showProjectFilter && (
                        <div className="relative">
                          <button
                            onClick={() => { setShowProjectDropdown(!showProjectDropdown); setShowCompanyDropdown(false); setShowGridDropdown(false); setShowTeamDropdown(false); }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                              selectedProject !== 'all' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800/80 border border-slate-700 text-slate-300 hover:border-slate-600'
                            }`}
                          >
                            <FolderTree size={14} />
                            <span>{selectedProject === 'all' ? '所有项目' : selectedProject}</span>
                            <ChevronDown size={12} />
                          </button>
                          {showProjectDropdown && (
                            <div className="absolute top-full left-0 mt-1 z-[500] bg-slate-800 rounded-xl border border-cyan-400/30 shadow-2xl p-2 min-w-[200px] max-h-[300px] overflow-y-auto">
                              <button
                                onClick={() => { setSelectedProject('all'); setSelectedGrid('all'); setSelectedTeam('all'); setShowProjectDropdown(false); }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedProject === 'all' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-300 hover:bg-slate-700'}`}
                              >
                                所有项目
                              </button>
                              {projectsForFilter.filter(project => project !== 'all').map((project: string) => (
                                <div key={project}>
                                  <button
                                    onClick={() => { setSelectedProject(selectedProject === project ? 'all' : project); setSelectedGrid('all'); setSelectedTeam('all'); }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${
                                      selectedProject === project ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-300 hover:bg-slate-700'
                                    }`}
                                  >
                                    <span>{project}</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  <div className="relative">
                    <button
                      onClick={() => { setShowGridDropdown(!showGridDropdown); setShowCompanyDropdown(false); setShowProjectDropdown(false); setShowTeamDropdown(false); }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                        selectedGrid !== 'all' ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50' : 'bg-slate-800/80 border border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <MapPin size={14} />
                      <span>{selectedGrid === 'all' ? '全部网格' : selectedGrid}</span>
                      <ChevronDown size={12} />
                    </button>
                    {showGridDropdown && (
                      <div className="absolute top-full left-0 mt-1 z-[500] bg-slate-800 rounded-xl border border-cyan-400/30 shadow-2xl p-2 min-w-[220px] max-h-[300px] overflow-y-auto">
                        {gridsForFilter.map((grid: string) => (
                          <button
                            key={grid}
                            onClick={() => { setSelectedGrid(grid); setSelectedTeam('all'); setShowGridDropdown(false); }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedGrid === grid ? 'bg-blue-500/20 text-blue-300' : 'text-slate-300 hover:bg-slate-700'}`}
                          >
                            {grid === 'all' ? '全部网格' : grid}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      onClick={() => { setShowTeamDropdown(!showTeamDropdown); setShowCompanyDropdown(false); setShowProjectDropdown(false); setShowGridDropdown(false); }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                        selectedTeam !== 'all' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800/80 border border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <Users size={14} />
                      <span>{selectedTeam === 'all' ? '全部工队' : selectedTeam}</span>
                      <ChevronDown size={12} />
                    </button>
                    {showTeamDropdown && (
                      <div className="absolute top-full left-0 mt-1 z-[500] bg-slate-800 rounded-xl border border-cyan-400/30 shadow-2xl p-2 min-w-[220px] max-h-[300px] overflow-y-auto">
                        {teamsForFilter.map((team: string) => (
                          <button
                            key={team}
                            onClick={() => { setSelectedTeam(team); setShowTeamDropdown(false); }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedTeam === team ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-300 hover:bg-slate-700'}`}
                          >
                            {team === 'all' ? '全部工队' : team}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={videoStartDate}
                      max={videoEndDate || undefined}
                      onChange={(event) => setVideoStartDate(event.target.value)}
                      className="h-8 w-[126px] rounded-lg border border-slate-700 bg-slate-800/80 px-2 text-xs text-slate-200 outline-none focus:border-cyan-400"
                      title="开始日期"
                      aria-label="开始日期"
                    />
                    <input
                      type="time"
                      step="60"
                      value={videoStartClock}
                      onChange={(event) => setVideoStartClock(event.target.value)}
                      className="h-8 w-[88px] rounded-lg border border-slate-700 bg-slate-800/80 px-2 text-xs text-slate-200 outline-none focus:border-cyan-400"
                      title="开始时间"
                      aria-label="开始时间"
                    />
                    <span className="text-xs text-slate-500">至</span>
                    <input
                      type="date"
                      value={videoEndDate}
                      min={videoStartDate || undefined}
                      onChange={(event) => setVideoEndDate(event.target.value)}
                      className="h-8 w-[126px] rounded-lg border border-slate-700 bg-slate-800/80 px-2 text-xs text-slate-200 outline-none focus:border-cyan-400"
                      title="结束日期"
                      aria-label="结束日期"
                    />
                    <input
                      type="time"
                      step="60"
                      value={videoEndClock}
                      onChange={(event) => setVideoEndClock(event.target.value)}
                      className="h-8 w-[88px] rounded-lg border border-slate-700 bg-slate-800/80 px-2 text-xs text-slate-200 outline-none focus:border-cyan-400"
                      title="结束时间"
                      aria-label="结束时间"
                    />
                    {(videoStartDate || videoEndDate) && (
                      <button
                        type="button"
                        onClick={() => {
                          setVideoStartDate('');
                          setVideoStartClock('00:00');
                          setVideoEndDate('');
                          setVideoEndClock('23:59');
                        }}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 text-slate-400 transition-colors hover:border-cyan-400/50 hover:text-cyan-300"
                        title="清除时间筛选"
                        aria-label="清除时间筛选"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

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
  console.log("1. 鐐瑰嚮鎴浘");

  // 鍏堟墦寮€鎾斁鍣?
  setCurrentPlayback(playback);
  setShowPlayer(true);

  // 绛夊緟鎾斁鍣ㄦ覆鏌撳畬鎴?
  await new Promise(r => setTimeout(r, 100));

  setSelectedAlarm(enrichAlarmWithScreenshot(playback));
  setShowScreenshotModal(true);

  if (videoPlayerRef.current) {
    const alarmTime = videoPlayerRef.current.getAlarmTimestamp();
    console.log("2. 绾㈢偣鏃堕棿(绉?:", alarmTime);

    if (alarmTime > 0) {
      await videoPlayerRef.current.seekTo(alarmTime);
      await new Promise(r => setTimeout(r, 200));
      const screenshotBase64 = await videoPlayerRef.current.captureFrame();
      console.log("3. 鎴浘瀹屾垚, 闀垮害:", screenshotBase64?.length);

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

              {/* 鉁?琛ョ┖绐楀彛鍗犱綅锛屼繚璇佹案杩滃～婊?10脳4=40 涓綅缃紝甯冨眬姘歌繙涓€鑷?*/}
              {Array.from({ length: Math.max(0, 40 - currentPagePlaybacks.length) }, (_, i) => (
                <div
                  key={`empty_${i}`}
                  className="relative w-full rounded-lg border border-slate-700/30 bg-slate-900/30"
                  style={{ paddingBottom: '28.125%' }}
                />
              ))}
            </div>

            {/* 鍒嗛〉鎺т欢 */}
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
          /* 鎾斁鍣ㄨ鍥?- 宸﹀彸甯冨眬 */
          <div className="flex-1 flex flex-col overflow-hidden h-full">
            {/* 杩斿洖鎸夐挳琛?*/}
            <div className="flex items-center gap-3 mb-3 flex-shrink-0">
              <button
                onClick={() => setShowPlayer(false)}
                className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30 flex items-center gap-2"
              >
                返回列表
              </button>
              <span className="text-slate-300">{currentPlayback?.deviceName}</span>
            </div>

            {/* 宸﹀彸鍐呭鍖哄煙 */}
            <div className="flex-1 flex gap-4 overflow-hidden">
              {/* 宸︿晶锛氱洃鎺х浉鍏充俊鎭?*/}
              <div className="w-72 flex-shrink-0 rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md overflow-y-auto p-4">
                <h4 className="text-sm font-bold text-cyan-300 mb-3 flex items-center gap-2">
                  <Camera size={14} />
                  监控信息
                </h4>

                {/* 璁惧淇℃伅 */}
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

                {/* 鎶ヨ璇︽儏锛堝鏋滄槸鎶ヨ鐗囨锛?*/}
                {currentPlayback?.type === 'alarm' && currentPlayback?.alarmInfo && (
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
                        <span className="text-slate-400">违规人员</span>
                        <span className="text-red-300">{currentPlayback.alarmInfo.personnel || '未知'}</span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400">报警时间</span>
                        <span className="text-red-300">{formatTime(currentPlayback.alarmInfo.timestamp)}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-red-400/20">
                        <span className="text-slate-400 block mb-1">报警信息</span>
                        <span className="text-red-200/80 text-sm">{cleanAlarmDisplayText(currentPlayback.alarmInfo.msg)}</span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-red-400/20">
                        <button
                          onClick={() => {
                            setSelectedAlarm(enrichAlarmWithScreenshot(currentPlayback));
                            setShowScreenshotModal(true);
                          }}
                          className="w-full px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg text-sm font-medium transition-all inline-flex items-center justify-center gap-2"
                        >
                          <Camera size={15} />
                          查看报警截图
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 鍙充晶锛氳棰戞挱鏀惧櫒 */}
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

    {/* ========== 杞ㄨ抗鍥炴斁鍐呭 ========== */}
    {mainTab === 'track' && (
      <PlaybackErrorBoundary title="轨迹回放">
      <TrackPlaybackContent
        filteredTracks={paginatedTracks}
        totalPages={trackTotalPages}
        currentPage={trackCurrentPage}
        setCurrentPage={setTrackCurrentPage}
        selectedTrack={selectedTrack}
        setSelectedTrack={openTrackPlayback}
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
        companyTree={trackOrgTree}
        sortState={trackSortState}
        setSortState={setTrackSortState}
      />
      </PlaybackErrorBoundary>
    )}

    {/* ========== 璇煶鍥炴斁鍐呭 ========== */}
    {mainTab === 'voice' && (
      <PlaybackErrorBoundary title="通话回放">
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
        voiceRecordsError={voiceRecordsError}
        selectedCompany={selectedVoiceCompany}
        setSelectedCompany={setSelectedVoiceCompany}
        selectedProject={selectedVoiceProject}
        setSelectedProject={setSelectedVoiceProject}
        selectedGrid={selectedVoiceGrid}
        setSelectedGrid={setSelectedVoiceGrid}
        selectedTeam={selectedVoiceTeam}
        setSelectedTeam={setSelectedVoiceTeam}
        voiceOrgTree={voiceOrgTree}
        sortState={voiceSortState}
        setSortState={setVoiceSortState}
      />
      </PlaybackErrorBoundary>
    )}

          {/* 鍛婅鎴浘寮圭獥 */}
      {showScreenshotModal && selectedAlarm && selectedAlarm.alarmInfo && (
        <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowScreenshotModal(false)}>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-cyan-400/30 bg-slate-900/50">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <AlertCircle size={20} className="text-red-400" />
                报警详情
              </h3>
              <button onClick={() => setShowScreenshotModal(false)} className="p-1 hover:bg-slate-700 rounded-lg">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-6 p-6">
              <div className="flex-1">
                <div className="rounded-lg overflow-hidden border border-cyan-400/30 bg-black/50">
{getScreenshotUrl(selectedAlarm) ? (
  <img
    src={getScreenshotUrl(selectedAlarm)}
    alt="报警截图"
    className="w-full max-h-[420px] object-contain rounded-lg border border-cyan-400/30"
  />
) : (
  <div className="w-full h-[220px] flex items-center justify-center rounded-lg border border-yellow-400/30 bg-yellow-500/10 text-yellow-200 text-sm">
    当前报警未匹配到截图
  </div>
)}
                </div>
                <p className="text-xs text-slate-500 text-center mt-2">报警发生时刻截图</p>
              </div>

              <div className="flex-1 space-y-4">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <div className="text-sm text-slate-400 mb-2">报警类型</div>
                  <div className="text-lg font-semibold text-red-400">{selectedAlarm.alarmInfo.type}</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-400 mb-1">报警时间</div>
                    <div className="text-sm text-white">{formatTime(selectedAlarm.alarmInfo.timestamp)}</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">

                  </div>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">违规人员</div>
                  <div className="text-sm text-white">{selectedAlarm.alarmInfo.personnel || '未知'}</div>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">报警描述</div>
                  <div className="text-sm text-slate-200">{cleanAlarmDisplayText(selectedAlarm.alarmInfo.msg)}</div>
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
