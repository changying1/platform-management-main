import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  FileText,
  Filter,
  LoaderCircle,
  MapPin,
  Mic,
  Phone,
  Radio,
  RefreshCw,
  Search,
  Send,
  Type,
  Users,
  Volume2,
  XCircle,
} from 'lucide-react';

import { getApiUrl, getAuthHeaders } from '../src/api/config';
import { deviceApi, type ApiDevice, type LocationDevice } from '../src/api/deviceApi';
import { unitApiClient, type UnitTreeNode } from '../src/api/responsibilityUnitApi';

type ActiveTab = 'tts' | 'records';
type SendMode = 'group' | 'broadcast';
type InputMode = 'text' | 'voice';
type RecordStatus = 'pending' | 'success' | 'partial' | 'failed';
type GroupCallStatus = 'ACTIVE' | 'ENDED';

interface Jt808Device extends ApiDevice {
  phone: string;
  company?: string;
  project?: string;
  grid?: string;
  team?: string;
}

interface CompanyFilterNode {
  id: string;
  name: string;
  projects: {
    id: string;
    name: string;
    grids: {
      id: string;
      name: string;
      teams: string[];
    }[];
  }[];
}

interface OrgLookup {
  branchNames: Map<string, string>;
  projectNames: Map<string, string>;
  gridNames: Map<string, string>;
  teamNames: Map<string, string>;
}

interface TtsQueueJob {
  id: string;
  device_phone: string;
  device_name?: string | null;
  status: string;
  retry_count: number;
  max_retries: number;
  jt808_sequence?: number | null;
  sent_at?: string | null;
  acked_at?: string | null;
  finished_at?: string | null;
  last_error?: string | null;
}

interface TtsBatchResponse {
  batch_id: string;
  text: string;
  request_source?: string | null;
  operator?: string | null;
  created_at: string;
  requested_count: number;
  queued_count: number;
  sending_count: number;
  acked_count: number;
  failed_count: number;
  retry_wait_count: number;
  jobs: TtsQueueJob[];
}

interface SendRecord {
  id: string;
  createdAt: string;
  mode: SendMode;
  text: string;
  result: TtsBatchResponse;
  targetNames: string[];
}

interface GroupCallSession {
  id: number;
  room_id: string;
  initiator_id: number;
  member_ids: number[];
  start_time: string;
  end_time?: string | null;
  status: GroupCallStatus;
}

const MAX_HISTORY = 30;
const BATCH_REFRESH_INTERVAL_MS = 1500;
const GROUP_CALL_REFRESH_INTERVAL_MS = 5000;
const SYSTEM_INITIATOR_ID = 0;

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: BrowserSpeechRecognitionResult;
  };
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

interface VoiceRecording {
  blob: Blob;
  startedAt: string;
  duration: number;
  mimeType: string;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function getPhoneFromDevice(device: Partial<ApiDevice> & Partial<LocationDevice>) {
  const phoneNum = typeof device.phone_num === 'string' ? device.phone_num.trim() : '';
  if (phoneNum) {
    return phoneNum;
  }
  const holderPhone = typeof device.holderPhone === 'string' ? device.holderPhone.trim() : '';
  if (holderPhone) {
    return holderPhone;
  }
  const streamPhone = typeof device.stream_url === 'string' ? device.stream_url.trim() : '';
  return streamPhone || String(device.id || device.device_id || '').trim();
}

const textValue = (value?: string | number | null) => String(value || '').trim();

function getUnitKeys(unit: UnitTreeNode) {
  return [unit.unit_id, unit.id, unit.project_id, unit.grid_id, unit.team_id].map(textValue).filter(Boolean);
}

function collectOrgLookups(nodes: UnitTreeNode[]): OrgLookup {
  const lookup: OrgLookup = {
    branchNames: new Map(),
    projectNames: new Map(),
    gridNames: new Map(),
    teamNames: new Map(),
  };

  const visit = (node: UnitTreeNode) => {
    const keys = getUnitKeys(node);
    const target =
      node.type === 'branch' ? lookup.branchNames :
      node.type === 'project' ? lookup.projectNames :
      node.type === 'grid' ? lookup.gridNames :
      node.type === 'team' ? lookup.teamNames :
      null;

    if (target) {
      keys.forEach((key) => target.set(key, node.name));
      target.set(node.name, node.name);
    }

    (node.children || []).forEach(visit);
  };

  nodes.forEach(visit);
  return lookup;
}

function resolveOrgName(value: string | undefined, map: Map<string, string>) {
  const raw = textValue(value);
  if (!raw) return '';
  return map.get(raw) || raw;
}

function toJt808Device(device: LocationDevice, orgLookup?: OrgLookup): Jt808Device {
  const rawDevice = device as LocationDevice & {
    grid_name?: string;
    gridName?: string;
    team_name?: string;
    teamName?: string;
    workTeam?: string;
    work_team?: string;
  };
  const phone = getPhoneFromDevice(device);
  const status = String(device.status || '').toLowerCase();

  return {
    id: String(device.device_id || phone),
    device_name: device.name || phone,
    device_type: device.type || 'JT808',
    ip_address: '',
    port: 0,
    is_online: status === 'online',
    stream_url: phone,
    last_latitude: typeof device.lat === 'number' ? device.lat : null,
    last_longitude: typeof device.lng === 'number' ? device.lng : null,
    phone,
    company: resolveOrgName(device.company || device.branch_id, orgLookup?.branchNames || new Map()),
    project: resolveOrgName(device.project || device.project_id, orgLookup?.projectNames || new Map()),
    grid: resolveOrgName(rawDevice.grid || rawDevice.grid_name || rawDevice.gridName || device.grid_id, orgLookup?.gridNames || new Map()),
    team: resolveOrgName(rawDevice.team || rawDevice.team_name || rawDevice.teamName || rawDevice.workTeam || rawDevice.work_team || device.team_id, orgLookup?.teamNames || new Map()),
  };
}

function isOrgType(node: UnitTreeNode, types: string[]) {
  return types.includes(String(node.type || ''));
}

function buildCompanyTreeFromOrg(nodes: UnitTreeNode[], devices: Jt808Device[]): CompanyFilterNode[] {
  const ensureCountedGrids = new Set<string>();
  const deviceGridCounts = new Map<string, number>();
  const unassignedByProject = new Map<string, number>();
  const projectNameSet = new Set<string>();

  const countGrid = (gridName: string) =>
    devices.filter((device) => textValue(device.grid) === gridName).length;

  const attachUnassignedDevices = () => {
    devices.forEach((device) => {
      const project = textValue(device.project);
      if (!project || !projectNameSet.has(project)) return;
      if (device.grid && ensureCountedGrids.has(textValue(device.grid))) return;
      unassignedByProject.set(project, (unassignedByProject.get(project) || 0) + 1);
    });
  };

  const getTeamNames = (grid: UnitTreeNode) =>
    (grid.children || [])
      .filter((child) => isOrgType(child, ['team']))
      .map((team) => team.name)
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

  const buildProject = (project: UnitTreeNode) => {
    projectNameSet.add(project.name);
    const grids = (project.children || [])
      .filter((child) => isOrgType(child, ['grid']))
      .map((grid) => {
        ensureCountedGrids.add(grid.name);
        const count = countGrid(grid.name);
        deviceGridCounts.set(grid.name, count);
        return {
          id: grid.name,
          name: grid.name,
          teams: getTeamNames(grid),
        };
      });

    return {
      id: project.name,
      name: project.name,
      grids,
    };
  };

  const companies = nodes
    .filter((node) => isOrgType(node, ['branch']))
    .map((company) => ({
      id: company.name,
      name: company.name,
      projects: (company.children || [])
        .filter((child) => isOrgType(child, ['project']))
        .map(buildProject)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

  attachUnassignedDevices();

  companies.forEach((company) => {
    company.projects.forEach((project) => {
      if ((unassignedByProject.get(project.name) || 0) > 0) {
        project.grids.push({ id: '未分配网格', name: '未分配网格', teams: [] });
      }
    });
  });

  return companies;
}

function buildCompanyTree(devices: Jt808Device[], orgTree: UnitTreeNode[] = []): CompanyFilterNode[] {
  if (orgTree.length > 0) {
    return buildCompanyTreeFromOrg(orgTree, devices);
  }

  const companyMap = new Map<string, Map<string, Map<string, Set<string>>>>();

  devices.forEach((device) => {
    const company = String(device.company || '').trim();
    if (!company) {
      return;
    }

    const project = String(device.project || '').trim();
    const grid = String(device.grid || '').trim();
    const team = String(device.team || '').trim();
    if (!companyMap.has(company)) {
      companyMap.set(company, new Map());
    }

    const projectMap = companyMap.get(company)!;
    const projectKey = project || '未分配项目';
    if (!projectMap.has(projectKey)) {
      projectMap.set(projectKey, new Map());
    }
    const gridMap = projectMap.get(projectKey)!;
    const gridKey = grid || '未分配网格';
    if (!gridMap.has(gridKey)) {
      gridMap.set(gridKey, new Set());
    }
    if (team) {
      gridMap.get(gridKey)!.add(team);
    }
  });

  return Array.from(companyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'))
    .map(([company, projects]) => ({
      id: company,
      name: company,
      projects: Array.from(projects.entries())
        .sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'))
        .map(([project, grids]) => ({
          id: project,
          name: project,
          grids: Array.from(grids.entries())
            .sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'))
            .map(([grid, teams]) => ({
              id: grid,
              name: grid,
              teams: Array.from(teams).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
            })),
        })),
    }));
}

function isBatchResponse(payload: unknown): payload is TtsBatchResponse {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<TtsBatchResponse>;
  return typeof candidate.batch_id === 'string' && Array.isArray(candidate.jobs);
}

function isBatchResponseList(payload: unknown): payload is TtsBatchResponse[] {
  return Array.isArray(payload) && payload.every(isBatchResponse);
}

function createSendRecordFromBatch(batch: TtsBatchResponse): SendRecord {
  const targetNames = batch.jobs.map((job) => job.device_name || job.device_phone);

  return {
    id: batch.batch_id,
    createdAt: batch.created_at,
    mode: batch.request_source === 'broadcast' ? 'broadcast' : 'group',
    text: batch.text,
    result: batch,
    targetNames,
  };
}

function getPendingCount(result: TtsBatchResponse) {
  return result.queued_count + result.sending_count + result.retry_wait_count;
}

function isBatchTerminal(result: TtsBatchResponse) {
  return getPendingCount(result) === 0;
}

function getRecordStatus(result: TtsBatchResponse): RecordStatus {
  if (result.requested_count > 0 && result.acked_count === result.requested_count) {
    return 'success';
  }
  if (result.requested_count > 0 && result.failed_count === result.requested_count) {
    return 'failed';
  }
  if (getPendingCount(result) === result.requested_count) {
    return 'pending';
  }
  if (result.acked_count > 0 || result.failed_count > 0) {
    return 'partial';
  }
  return 'pending';
}

function getCurrentOperatorName() {
  try {
    const auth = JSON.parse(localStorage.getItem('auth') || '{}') || {};
    return (
      auth.full_name ||
      auth.name ||
      auth.username ||
      localStorage.getItem('username') ||
      '当前用户'
    );
  } catch {
    return localStorage.getItem('username') || '当前用户';
  }
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function isGroupCallSession(payload: unknown): payload is GroupCallSession {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<GroupCallSession>;
  return typeof candidate.id === 'number' && typeof candidate.room_id === 'string';
}

function getGroupCallStatusMeta(status: GroupCallStatus) {
  if (status === 'ACTIVE') {
    return {
      label: '进行中',
      className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30',
    };
  }

  return {
    label: '已结束',
    className: 'bg-slate-700/60 text-slate-200 border border-slate-600/40',
  };
}

function summarizeError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string') {
    return detail;
  }
  if (detail && typeof detail === 'object') {
    const result = detail as Partial<TtsBatchResponse> & { message?: string };
    if (typeof result.message === 'string') {
      return result.message;
    }
    if (typeof result.failed_count === 'number' && typeof result.requested_count === 'number') {
      return `发送失败，${result.failed_count}/${result.requested_count} 台设备未成功接收`;
    }
  }

  return fallback;
}

function getJobStatusMeta(job: TtsQueueJob) {
  switch (job.status) {
    case 'acked':
      return {
        label: '已确认',
        message: '终端已确认接收并处理播报',
        className: 'border-emerald-400/20 bg-emerald-500/10',
        textClassName: 'text-emerald-200',
        icon: <CheckCircle2 size={16} className="text-emerald-300" />,
      };
    case 'failed':
      return {
        label: '失败',
        message: job.last_error || '发送失败',
        className: 'border-red-400/20 bg-red-500/10',
        textClassName: 'text-red-200',
        icon: <XCircle size={16} className="text-red-300" />,
      };
    case 'sending':
      return {
        label: '发送中',
        message: '指令已下发，等待终端 ACK',
        className: 'border-cyan-400/20 bg-cyan-500/10',
        textClassName: 'text-cyan-200',
        icon: <LoaderCircle size={16} className="animate-spin text-cyan-300" />,
      };
    case 'retry_wait':
      return {
        label: '重试中',
        message: job.last_error
          ? `${job.last_error}，等待重试 (${job.retry_count}/${job.max_retries})`
          : `等待重试 (${job.retry_count}/${job.max_retries})`,
        className: 'border-amber-400/20 bg-amber-500/10',
        textClassName: 'text-amber-200',
        icon: <RefreshCw size={16} className="text-amber-300" />,
      };
    case 'queued':
    default:
      return {
        label: '已入队',
        message: '任务已创建，等待后台发送',
        className: 'border-slate-700 bg-slate-950/60',
        textClassName: 'text-slate-300',
        icon: <LoaderCircle size={16} className="animate-spin text-slate-300" />,
      };
  }
}

export default function GroupCall() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tts');
  const [sendMode, setSendMode] = useState<SendMode>('group');
  const [devices, setDevices] = useState<Jt808Device[]>([]);
  const [organizationTree, setOrganizationTree] = useState<UnitTreeNode[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedGrid, setSelectedGrid] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [expandedGrid, setExpandedGrid] = useState<string | null>(null);
  const [ttsText, setTtsText] = useState('');
  const [sendRecords, setSendRecords] = useState<SendRecord[]>([]);
  const [latestResult, setLatestResult] = useState<TtsBatchResponse | null>(null);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [loadingError, setLoadingError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [groupCalls, setGroupCalls] = useState<GroupCallSession[]>([]);
  const [loadingGroupCalls, setLoadingGroupCalls] = useState(false);
  const [groupCallError, setGroupCallError] = useState('');
  const [startingCall, setStartingCall] = useState(false);
  const [endingCallId, setEndingCallId] = useState<number | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const voiceRecordingRef = useRef<VoiceRecording | null>(null);

  const loadDeviceCandidates = async () => {
    try {
      const primaryDevices = await deviceApi.getLocationDevices();
      if (primaryDevices.length > 0) {
        return primaryDevices;
      }
      return await deviceApi.getLocationCompatibleDevices();
    } catch {
      return await deviceApi.getLocationCompatibleDevices();
    }
  };

  const loadDevices = async () => {
    setLoadingDevices(true);
    setLoadingError('');

    try {
      const [response, orgTree] = await Promise.all([
        loadDeviceCandidates(),
        unitApiClient.getTree().catch(() => [] as UnitTreeNode[]),
      ]);
      const orgLookup = collectOrgLookups(orgTree);
      const jt808Devices = response
        .map((device) => toJt808Device(device, orgLookup))
        .filter((device) => device.phone)
        .sort((a, b) => {
          if (a.is_online !== b.is_online) {
            return a.is_online ? -1 : 1;
          }
          return a.device_name.localeCompare(b.device_name, 'zh-CN');
        });

      setOrganizationTree(orgTree);
      setDevices(jt808Devices);
      setSelectedPhones((prev) => prev.filter((phone) => jt808Devices.some((device) => device.phone === phone)));
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载终端设备失败';
      setLoadingError(message);
    } finally {
      setLoadingDevices(false);
    }
  };

  const loadTtsHistory = async () => {
    try {
      const response = await fetch(getApiUrl(`/call/tts/batches?limit=${MAX_HISTORY}`), {
        headers: getAuthHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isBatchResponseList(payload)) {
        throw new Error(summarizeError(payload, '加载播报历史失败'));
      }

      setSendRecords(payload.map(createSendRecordFromBatch));
      setLatestResult((current) => current ?? payload[0] ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载播报历史失败';
      setSendError(message);
    }
  };

  useEffect(() => {
    loadDevices();
    loadTtsHistory();
  }, []);

  useEffect(() => {
    loadGroupCalls();
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadGroupCalls(false).catch(() => undefined);
    }, GROUP_CALL_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  const resetFilters = () => {
    setSelectedCompany('all');
    setSelectedProject('all');
    setSelectedGrid('all');
    setSelectedTeam('all');
    setSearchKeyword('');
    setExpandedCompany(null);
    setExpandedProject(null);
    setExpandedGrid(null);
    setShowFilter(false);
  };

  const activeFiltersCount = [
    selectedCompany !== 'all',
    selectedProject !== 'all',
    selectedGrid !== 'all',
    selectedTeam !== 'all',
    searchKeyword !== ''
  ].filter(Boolean).length;

  const companyTree = React.useMemo(() => buildCompanyTree(devices, organizationTree), [devices, organizationTree]);

  const filteredDevices = devices.filter((device) => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (keyword) {
      const searchable = [
        device.device_name,
        device.phone,
        device.id,
        device.device_type,
        device.company,
        device.project,
        device.grid,
        device.team,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!searchable.includes(keyword)) {
        return false;
      }
    }

    if (selectedCompany !== 'all') {
      if (device.company !== selectedCompany) {
        return false;
      }
    }

    if (selectedProject !== 'all') {
      const project = String(device.project || '').trim() || '未分配项目';
      if (project !== selectedProject) {
        return false;
      }
    }

    if (selectedGrid !== 'all') {
      const grid = String(device.grid || '').trim() || '未分配网格';
      if (grid !== selectedGrid) {
        return false;
      }
    }

    if (selectedTeam !== 'all') {
      if (device.team !== selectedTeam) {
        return false;
      }
    }

    return true;
  });

  const selectedDevices = devices.filter((device) => selectedPhones.includes(device.phone));
  const onlineDevices = devices.filter((device) => device.is_online);
  const targetDevices = sendMode === 'broadcast' ? onlineDevices : selectedDevices;
  const targetPhones = targetDevices.map((device) => device.phone);
  const activeGroupCalls = groupCalls.filter((call) => call.status === 'ACTIVE');

  const loadGroupCalls = async (showSpinner = true) => {
    if (showSpinner) {
      setLoadingGroupCalls(true);
    }
    setGroupCallError('');

    try {
      const response = await fetch(getApiUrl('/call?limit=20'), {
        headers: getAuthHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !Array.isArray(payload) || !payload.every(isGroupCallSession)) {
        throw new Error(summarizeError(payload, '加载群组通话会话失败'));
      }
      setGroupCalls(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载群组通话会话失败';
      setGroupCallError(message);
    } finally {
      if (showSpinner) {
        setLoadingGroupCalls(false);
      }
    }
  };

  const togglePhoneSelection = (phone: string) => {
    setSelectedPhones((prev) =>
      prev.includes(phone) ? prev.filter((item) => item !== phone) : [...prev, phone]
    );
  };

  const selectAllOnline = () => {
    setSelectedPhones(onlineDevices.map((device) => device.phone));
  };

  const clearSelection = () => {
    setSelectedPhones([]);
  };

  const startGroupCall = async () => {
    if (selectedDevices.length === 0) {
      setGroupCallError('请至少选择一台终端设备后再发起群组通话');
      return;
    }

    setStartingCall(true);
    setGroupCallError('');

    try {
      const memberIds = selectedDevices
        .map((device) => Number(device.id))
        .filter((id) => Number.isFinite(id));

      if (memberIds.length === 0) {
        throw new Error('当前选中的终端缺少可用的数字 ID，无法创建群组通话');
      }

      const response = await fetch(getApiUrl('/call/initiate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          initiator_id: SYSTEM_INITIATOR_ID,
          member_ids: memberIds,
        }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isGroupCallSession(payload)) {
        throw new Error(summarizeError(payload, '发起群组通话失败'));
      }

      setGroupCalls((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)].slice(0, 20));
    } catch (error) {
      const message = error instanceof Error ? error.message : '发起群组通话失败';
      setGroupCallError(message);
    } finally {
      setStartingCall(false);
    }
  };

  const endGroupCall = async (callId: number) => {
    setEndingCallId(callId);
    setGroupCallError('');

    try {
      const response = await fetch(getApiUrl(`/call/${callId}/end`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isGroupCallSession(payload)) {
        throw new Error(summarizeError(payload, '结束群组通话失败'));
      }

      setGroupCalls((prev) => prev.map((item) => (item.id === payload.id ? payload : item)));
    } catch (error) {
      const message = error instanceof Error ? error.message : '结束群组通话失败';
      setGroupCallError(message);
    } finally {
      setEndingCallId(null);
    }
  };

  const getSupportedAudioMimeType = () => {
    if (typeof MediaRecorder === 'undefined') {
      return '';
    }

    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('当前浏览器不支持录音保存，请使用 Chrome 或 Edge 浏览器。');
    }

    mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedAudioMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    audioChunksRef.current = [];
    recordingStartedAtRef.current = Date.now();
    voiceRecordingRef.current = null;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const chunks = audioChunksRef.current;
      const startedAt = recordingStartedAtRef.current ?? Date.now();
      const resolvedMimeType = recorder.mimeType || mimeType || 'audio/webm';

      if (chunks.length > 0) {
        voiceRecordingRef.current = {
          blob: new Blob(chunks, { type: resolvedMimeType }),
          startedAt: new Date(startedAt).toISOString(),
          duration: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
          mimeType: resolvedMimeType,
        };
      }

      stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
      recordingStartedAtRef.current = null;
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
  };

  const stopVoiceRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return voiceRecordingRef.current;
    }

    return new Promise<VoiceRecording | null>((resolve) => {
      const originalOnStop = recorder.onstop;
      recorder.onstop = (event) => {
        originalOnStop?.call(recorder, event);
        resolve(voiceRecordingRef.current);
      };
      recorder.stop();
    });
  };

  const stopVoiceRecognition = async () => {
    recognitionRef.current?.stop();
    return stopVoiceRecording();
  };

  const startVoiceRecognition = async () => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setSendError('当前浏览器不支持语音识别，请使用 Chrome 或 Edge 浏览器，或改用文本播报。');
      return;
    }

    setSendError('');
    setInterimTranscript('');
    recognitionRef.current?.abort();

    try {
      await startVoiceRecording();
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法启动录音保存';
      setSendError(message);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim() ?? '';
        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText) {
        setTtsText((current) => [current.trim(), finalText].filter(Boolean).join(current.trim() ? '\n' : ''));
      }
      setInterimTranscript(interimText);
    };

    recognition.onerror = (event) => {
      const error = event.error || event.message || '语音识别失败';
      setSendError(`语音识别失败: ${error}`);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setInterimTranscript('');
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法启动语音识别';
      setSendError(message);
      recognitionRef.current = null;
      setListening(false);
      stopVoiceRecording().catch(() => undefined);
    }
  };

  const applyBatchUpdate = (batch: TtsBatchResponse) => {
    setLatestResult(batch);
    setSendRecords((prev) =>
      prev.map((record) =>
        record.result.batch_id === batch.batch_id
          ? {
              ...record,
              createdAt: batch.created_at,
              text: batch.text,
              result: batch,
            }
          : record
      )
    );
  };

  const fetchBatchStatus = async (batchId: string) => {
    const response = await fetch(getApiUrl(`/call/tts/batch/${batchId}`), {
      headers: getAuthHeaders(),
    });
    const payload = (await response.json().catch(() => null)) as TtsBatchResponse | { detail?: unknown } | null;
    if (!response.ok || !isBatchResponse(payload)) {
      throw new Error(summarizeError(payload, '获取播报回执失败'));
    }
    applyBatchUpdate(payload);
    return payload;
  };

  const uploadVoiceRecord = async (
    batch: TtsBatchResponse,
    recording: VoiceRecording,
    transcript: string
  ) => {
    const extension = recording.mimeType.includes('ogg')
      ? 'ogg'
      : recording.mimeType.includes('mp4')
        ? 'm4a'
        : 'webm';
    const formData = new FormData();

    formData.append('audio', recording.blob, `group-call-${batch.batch_id}.${extension}`);
    formData.append('transcript', transcript);
    formData.append('record_type', sendMode);
    formData.append('to_names', JSON.stringify(targetDevices.map((device) => device.device_name || device.phone)));
    formData.append('target_phones', JSON.stringify(targetPhones));
    formData.append('duration', String(recording.duration));
    formData.append('batch_id', batch.batch_id);
    formData.append('operator', getCurrentOperatorName());

    const response = await fetch(getApiUrl('/call/voice-records'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(summarizeError(payload, '保存语音回放失败'));
    }
  };

  const sendTts = async () => {
    let voiceRecording: VoiceRecording | null = null;
    if (inputMode === 'voice') {
      voiceRecording = await stopVoiceRecognition();
    }

    const text = ttsText.trim();
    if (!text) {
      setSendError('请输入要播报的文本');
      return;
    }

    if (targetPhones.length === 0) {
      setSendError(sendMode === 'broadcast' ? '当前没有在线终端设备可广播' : '请至少选择一台终端设备');
      return;
    }

    setSending(true);
    setSendError('');

    try {
      const response = await fetch(getApiUrl('/call/tts/send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          text,
          target_phones: targetPhones,
          request_source: sendMode,
          operator: getCurrentOperatorName(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as TtsBatchResponse | { detail?: unknown } | null;
      if (!response.ok || !isBatchResponse(payload)) {
        throw new Error(summarizeError(payload, '文本播报发送失败'));
      }

      const result = payload;
      if (inputMode === 'voice' && voiceRecording?.blob.size) {
        await uploadVoiceRecord(result, voiceRecording, text);
        voiceRecordingRef.current = null;
      }
      applyBatchUpdate(result);
      setSendRecords((prev) => [
        {
          id: result.batch_id,
          createdAt: result.created_at,
          mode: sendMode,
          text: result.text,
          result,
          targetNames: targetDevices.map((device) => device.device_name || device.phone),
        },
        ...prev,
      ].slice(0, MAX_HISTORY));

      setTtsText('');

      await loadDevices();
    } catch (error) {
      const message = error instanceof Error ? error.message : '文本播报发送失败';
      setSendError(message);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!latestResult || isBatchTerminal(latestResult)) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      fetchBatchStatus(latestResult.batch_id).catch((error) => {
        console.error('获取 TTS 批次状态失败:', error);
      });
    }, BATCH_REFRESH_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [latestResult]);

  const pendingRecordCount = sendRecords.filter((record) => getRecordStatus(record.result) === 'pending').length;
  const successRecordCount = sendRecords.filter((record) => getRecordStatus(record.result) === 'success').length;
  const partialRecordCount = sendRecords.filter((record) => getRecordStatus(record.result) === 'partial').length;
  const failedRecordCount = sendRecords.filter((record) => getRecordStatus(record.result) === 'failed').length;

  return (
    <div className="h-full overflow-hidden flex flex-col px-4 pb-4 pt-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-5">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
                <Phone size={28} className="text-cyan-400" />
                群组通话
              </h1>
              <p className="mt-0.5 text-sm text-slate-400">
                支持发起群组通话会话，并向终端设备下发 JT808 文本播报。
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('tts')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === 'tts'
                    ? 'border border-cyan-400/50 bg-cyan-500/30 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Volume2 size={16} className="mr-1.5 inline" />
                信息播报
              </button>
              <button
                onClick={() => setActiveTab('records')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === 'records'
                    ? 'border border-cyan-400/50 bg-cyan-500/30 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText size={16} className="mr-1.5 inline" />
                发送记录
              </button>
            </div>
          </div>

        <div className="flex gap-2 text-sm">
          <div className="rounded-lg border border-cyan-400/30 bg-slate-900/50 px-3 py-2 text-slate-200">
            <div className="text-xs text-slate-400">终端设备</div>
            <div className="mt-0.5 text-lg font-semibold text-white">{devices.length}</div>
          </div>
          <div className="rounded-lg border border-emerald-400/30 bg-slate-900/50 px-3 py-2 text-slate-200">
            <div className="text-xs text-slate-400">在线设备</div>
            <div className="mt-0.5 text-lg font-semibold text-emerald-300">{onlineDevices.length}</div>
          </div>
          <div className="rounded-lg border border-amber-400/30 bg-slate-900/50 px-3 py-2 text-slate-200">
            <div className="text-xs text-slate-400">已选设备</div>
            <div className="mt-0.5 text-lg font-semibold text-amber-300">{selectedDevices.length}</div>
          </div>
          <div className="rounded-lg border border-rose-400/30 bg-slate-900/50 px-3 py-2 text-slate-200">
            <div className="text-xs text-slate-400">活动通话</div>
            <div className="mt-0.5 text-lg font-semibold text-rose-300">{activeGroupCalls.length}</div>
          </div>
        </div>
      </div>

      {activeTab === 'tts' ? (
        <div className="flex-1 flex gap-4 overflow-hidden">
          <section className="w-72 flex-shrink-0 flex flex-col rounded-xl border border-cyan-400/25 bg-slate-900/50 p-4 backdrop-blur-sm shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">终端设备选择</h2>
                  <p className="text-xs text-slate-400">选择要播报的终端。</p>
                </div>
                <button
                  onClick={loadDevices}
                  disabled={loadingDevices}
                  className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200 transition-all hover:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw size={14} className={loadingDevices ? 'animate-spin' : ''} />
                    刷新
                  </span>
                </button>
              </div>

              <div className="mb-3">
                <div className="flex gap-2 items-center">
                  <div>
                    <button
                      onClick={() => {
                        setShowFilter(!showFilter);
                        if (!showFilter && selectedCompany !== 'all') {
                          setExpandedCompany(selectedCompany);
                        }
                        if (!showFilter && selectedProject !== 'all') {
                          setExpandedProject(selectedProject);
                        }
                        if (!showFilter && selectedGrid !== 'all') {
                          setExpandedGrid(selectedGrid);
                        }
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
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
                  </div>

                  <button
                    onClick={selectAllOnline}
                    className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300 transition-all hover:bg-emerald-500/25 whitespace-nowrap"
                  >
                    全选在线
                  </button>
                  <button
                    onClick={clearSelection}
                    className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300 transition-all hover:bg-slate-700 whitespace-nowrap"
                  >
                    清空已选
                  </button>
                </div>

                {showFilter && (
                  <div className="mt-3 rounded-xl border border-cyan-400/30 bg-slate-800/95 p-3 shadow-2xl">
                    <div className="mb-3 flex items-center justify-between border-b border-slate-700 pb-2">
                      <span className="text-sm font-medium text-white">筛选条件</span>
                      <button onClick={resetFilters} className="text-xs text-cyan-400 hover:text-cyan-300">清除筛选</button>
                    </div>

                    <div className="relative mb-3">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                      <input
                        type="text"
                        value={searchKeyword}
                        onChange={(event) => setSearchKeyword(event.target.value)}
                        placeholder="搜索设备名称、手机号、ID"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900/50 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none transition-all focus:border-cyan-400/50"
                      />
                    </div>

                    <div className="max-h-[42vh] space-y-1 overflow-y-auto pr-1">
                      {companyTree.map((company: CompanyFilterNode) => {
                        const companyOpen = expandedCompany === company.id;
                        const companySelected = selectedCompany === company.id;
                        return (
                          <div key={company.id}>
                            <button
                              onClick={() => {
                                const nextOpen = companyOpen ? null : company.id;
                                setExpandedCompany(nextOpen);
                                setExpandedProject(null);
                                setExpandedGrid(null);
                                setSelectedCompany(companySelected ? 'all' : company.id);
                                setSelectedProject('all');
                                setSelectedGrid('all');
                                setSelectedTeam('all');
                              }}
                              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-all ${
                                companySelected ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {companyOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                              <span className="min-w-0 flex-1 truncate">公司 {company.name}</span>
                              <span className="text-xs text-slate-500">{company.projects.length}</span>
                            </button>

                            {companyOpen && (
                              <div className="ml-4 mt-1 space-y-1 border-l border-slate-700 pl-2">
                                {company.projects.map((project) => {
                                  const projectOpen = expandedProject === project.id;
                                  const projectSelected = selectedProject === project.id;
                                  return (
                                    <div key={project.id}>
                                      <button
                                        onClick={() => {
                                          setExpandedProject(projectOpen ? null : project.id);
                                          setExpandedGrid(null);
                                          setSelectedCompany(company.id);
                                          setSelectedProject(projectSelected ? 'all' : project.id);
                                          setSelectedGrid('all');
                                          setSelectedTeam('all');
                                        }}
                                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-all ${
                                          projectSelected ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:bg-slate-700'
                                        }`}
                                      >
                                        {projectOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                        <span className="min-w-0 flex-1 truncate">项目 {project.name}</span>
                                        <span className="text-[11px] text-slate-500">{project.grids.length}</span>
                                      </button>

                                      {projectOpen && project.grids.length > 0 && (
                                        <div className="ml-4 mt-1 space-y-1 border-l border-slate-700 pl-2">
                                          {project.grids.map((grid) => {
                                            const gridOpen = expandedGrid === grid.id;
                                            const gridSelected = selectedGrid === grid.id;
                                            return (
                                              <div key={grid.id}>
                                                <button
                                                  onClick={() => {
                                                    setExpandedGrid(gridOpen ? null : grid.id);
                                                    setSelectedCompany(company.id);
                                                    setSelectedProject(project.id);
                                                    setSelectedGrid(gridSelected ? 'all' : grid.id);
                                                    setSelectedTeam('all');
                                                  }}
                                                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-all ${
                                                    gridSelected ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:bg-slate-700'
                                                  }`}
                                                >
                                                  {gridOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                  <span className="min-w-0 flex-1 truncate">网格 {grid.name}</span>
                                                  <span className="text-[11px] text-slate-600">{grid.teams.length}</span>
                                                </button>

                                                {gridOpen && grid.teams.length > 0 && (
                                                  <div className="ml-4 mt-1 space-y-1 border-l border-slate-700 pl-2">
                                                    {grid.teams.map((team: string) => (
                                                      <button
                                                        key={team}
                                                        onClick={() => {
                                                          setSelectedCompany(company.id);
                                                          setSelectedProject(project.id);
                                                          setSelectedGrid(grid.id);
                                                          setSelectedTeam(selectedTeam === team ? 'all' : team);
                                                        }}
                                                        className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition-all ${
                                                          selectedTeam === team ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:bg-slate-700'
                                                        }`}
                                                      >
                                                        工队 {team}
                                                      </button>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <button onClick={() => setShowFilter(false)} className="mt-3 w-full rounded-lg bg-cyan-500 py-1.5 text-xs text-white transition-all hover:bg-cyan-400">确定</button>
                  </div>
                )}
              </div>

              {loadingError ? (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{loadingError}</span>
                </div>
              ) : null}

              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {loadingDevices && devices.length === 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-5 text-sm text-slate-400">
                  <LoaderCircle size={18} className="animate-spin" />
                  正在加载设备...
                </div>
              ) : null}

              {!loadingDevices && filteredDevices.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-5 text-center text-sm text-slate-400">
                  当前没有匹配的终端设备
                </div>
              ) : null}

              {filteredDevices.map((device) => {
                const selected = selectedPhones.includes(device.phone);
                return (
                  <button
                    key={device.phone}
                    type="button"
                    onClick={() => togglePhoneSelection(device.phone)}
                    className={`w-full rounded-lg border p-3 text-left transition-all ${
                      selected
                        ? 'border-cyan-400/60 bg-cyan-500/15'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-white">
                          <Users size={15} className="text-cyan-300" />
                          {device.device_name || device.phone}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400">终端号: {device.phone}</div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          device.is_online
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-slate-700/60 text-slate-300'
                        }`}
                      >
                        {device.is_online ? '在线' : '离线'}
                      </span>
                    </div>

                    <div className="space-y-0.5 text-xs text-slate-400">
                      <div>ID: {device.id}</div>
                      <div>类型: {device.device_type || 'JT808'}</div>
                      {typeof device.last_longitude === 'number' && typeof device.last_latitude === 'number' ? (
                        <div className="flex items-center gap-1 text-slate-300">
                          <MapPin size={12} className="text-cyan-300" />
                          {device.last_longitude.toFixed(6)}, {device.last_latitude.toFixed(6)}
                        </div>
                      ) : null}
                    </div>

                    {selected ? (
                      <div className="mt-2 flex items-center gap-2 text-xs text-cyan-300">
                        <CheckCircle2 size={14} />
                        已加入本次播报
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

           <section className="flex-1 flex flex-col rounded-xl border border-cyan-400/25 bg-slate-900/50 p-4 backdrop-blur-sm shadow-xl overflow-hidden">
            <div className="mb-3 rounded-xl border border-rose-400/20 bg-slate-950/50 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">群组通话会话</h2>
                  <p className="text-xs text-slate-400">创建会话并追踪状态。</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadGroupCalls()}
                    disabled={loadingGroupCalls}
                    className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 transition-all hover:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      <RefreshCw size={14} className={loadingGroupCalls ? 'animate-spin' : ''} />
                      刷新会话
                    </span>
                  </button>
                  <button
                    onClick={startGroupCall}
                    disabled={startingCall || selectedDevices.length === 0}
                    className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      {startingCall ? <LoaderCircle size={14} className="animate-spin" /> : <Phone size={14} />}
                      {startingCall ? '发起中...' : '发起群组通话'}
                    </span>
                  </button>
                </div>
              </div>

              {groupCallError ? (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{groupCallError}</span>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {groupCalls.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-4 text-xs text-slate-400 md:col-span-2 xl:col-span-3">
                    暂时还没有群组通话会话，选择设备后可以直接发起。
                  </div>
                ) : (
                  groupCalls.map((call) => {
                    const statusMeta = getGroupCallStatusMeta(call.status);
                    return (
                      <div key={call.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">房间 {call.room_id}</div>
                            <div className="mt-0.5 text-xs text-slate-400">会话 #{call.id}</div>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-xs ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </div>
                        <div className="space-y-0.5 text-xs text-slate-300">
                          <div>发起时间: {formatDateTime(call.start_time)}</div>
                          <div>成员数量: {call.member_ids.length}</div>
                          <div>发起人 ID: {call.initiator_id}</div>
                          {call.end_time ? <div>结束时间: {formatDateTime(call.end_time)}</div> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {call.member_ids.slice(0, 6).map((memberId) => (
                            <span
                              key={`${call.id}-${memberId}`}
                              className="rounded-full border border-slate-700 bg-slate-800/80 px-2 py-1 text-xs text-slate-300"
                            >
                              成员 {memberId}
                            </span>
                          ))}
                          {call.member_ids.length > 6 ? (
                            <span className="rounded-full border border-slate-700 bg-slate-800/80 px-2 py-1 text-xs text-slate-400">
                              +{call.member_ids.length - 6}
                            </span>
                          ) : null}
                        </div>
                        {call.status === 'ACTIVE' ? (
                          <button
                            onClick={() => endGroupCall(call.id)}
                            disabled={endingCallId === call.id}
                            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition-all hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {endingCallId === call.id ? <LoaderCircle size={14} className="animate-spin" /> : <Phone size={14} />}
                            {endingCallId === call.id ? '结束中...' : '结束通话'}
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mb-2 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-white">播报控制台</h2>
                <p className="mb-0 text-xs text-slate-400">定向播报或全体广播。</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setSendMode('group')}
                  className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                    sendMode === 'group'
                      ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300'
                      : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Users size={15} />
                    定向播报
                  </span>
                </button>
                <button
                  onClick={() => setSendMode('broadcast')}
                  className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                    sendMode === 'broadcast'
                      ? 'border-blue-400/60 bg-blue-500/20 text-blue-300'
                      : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Radio size={15} />
                    全体广播
                  </span>
                </button>
              </div>
            </div>

              <div className="mb-3 flex min-h-[168px] rounded-xl border border-slate-700 bg-slate-950/70">
                <div className="flex w-12 shrink-0 flex-col border-r border-slate-700">
                  <button
                    onClick={() => {
                      stopVoiceRecognition();
                      setInputMode('text');
                    }}
                    className={`flex flex-1 items-center justify-center rounded-tl-xl text-sm font-medium transition-all ${
                      inputMode === 'text'
                        ? 'bg-cyan-500/15 text-cyan-300'
                        : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                    }`}
                    title="文本输入"
                  >
                    <Type size={20} />
                  </button>
                  <button
                    onClick={() => setInputMode('voice')}
                    className={`flex flex-1 items-center justify-center rounded-bl-xl text-sm font-medium transition-all ${
                      inputMode === 'voice'
                        ? 'bg-cyan-500/15 text-cyan-300'
                        : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                    }`}
                    title="语音输入"
                  >
                    <Mic size={20} />
                  </button>
                </div>

                <div className="relative flex-1">
                  {inputMode === 'text' ? (
                    <textarea
                      value={ttsText}
                      onChange={(event) => setTtsText(event.target.value)}
                      rows={6}
                      placeholder="请输入要下发到设备端播报的文本，例如：请前往 2 号通道进行集合点检。"
                      className="h-full min-h-[168px] w-full resize-none bg-transparent px-4 py-3 pb-16 pr-44 text-sm text-slate-100 outline-none transition-all placeholder:text-slate-500 focus:ring-0"
                    />
                  ) : (
                    <div className="relative h-full min-h-[168px] p-4">
                      <div className="h-24 overflow-y-auto whitespace-pre-wrap pr-40 text-sm text-slate-100">
                        {ttsText || '点击下方按钮开始语音识别，识别结果会显示在这里。'}
                      </div>

                      <div className="absolute bottom-14 left-4 right-44">
                        {interimTranscript ? (
                          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                            正在识别: {interimTranscript}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400">
                            点击开始识别后讲话，识别完成的内容会自动追加到播报文本中。
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-3 right-3 flex gap-2">
                  {inputMode === 'voice' && (
                    <button
                      onClick={listening ? stopVoiceRecognition : startVoiceRecognition}
                      className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                        listening
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-cyan-500 text-white hover:bg-cyan-600'
                      }`}
                    >
                      {listening ? <LoaderCircle size={16} className="animate-spin" /> : <Mic size={16} />}
                      {listening ? '停止识别' : '开始识别'}
                    </button>
                  )}

                  <button
                    onClick={sendTts}
                    disabled={sending}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
                    {sending ? '发送中...' : inputMode === 'voice' ? '发送语音播报' : '发送文本播报'}
                  </button>
                  </div>
                </div>
              </div>

              <div className="mb-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <div className="mb-1.5 text-sm font-medium text-slate-200">已选择播报目标</div>
                {targetDevices.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {targetDevices.map((device) => (
                      <span
                        key={`${sendMode}-${device.phone}`}
                        className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs text-slate-200"
                      >
                        {device.device_name || device.phone}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">当前还没有可发送的目标设备。</div>
                )}
              </div>

              {sendError ? (
                <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{sendError}</span>
                </div>
              ) : null}


            <hr className="my-2 border-slate-700/50" />

            <div className="flex min-h-0 flex-col">
              <div className="mb-2 flex items-center justify-between gap-3 flex-shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-white">接收回执</h2>
                </div>
                {latestResult ? (
                  <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-xs text-cyan-300">
                    请求 {latestResult.requested_count} 台
                  </span>
                ) : null}
              </div>

              <div className="min-h-0 overflow-y-auto pr-1">
                {!latestResult ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-5 text-center text-sm text-slate-400">
                    发送后，这里会显示设备接收结果。
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                        <div className="text-xs text-slate-400">请求设备</div>
                        <div className="mt-1 text-xl font-semibold text-white">{latestResult.requested_count}</div>
                      </div>
                      <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                        <div className="text-xs text-slate-300">待处理</div>
                        <div className="mt-1 text-xl font-semibold text-slate-100">{getPendingCount(latestResult)}</div>
                      </div>
                      <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3">
                        <div className="text-xs text-emerald-200">已确认</div>
                        <div className="mt-1 text-xl font-semibold text-emerald-300">{latestResult.acked_count}</div>
                      </div>
                      <div className="rounded-lg border border-red-400/20 bg-red-500/10 p-3">
                        <div className="text-xs text-red-200">失败</div>
                        <div className="mt-1 text-xl font-semibold text-red-300">{latestResult.failed_count}</div>
                      </div>
                      <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3">
                        <div className="text-xs text-amber-200">重试中</div>
                        <div className="mt-1 text-xl font-semibold text-amber-300">{latestResult.retry_wait_count}</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {latestResult.jobs.map((job) => {
                        const meta = getJobStatusMeta(job);
                        return (
                          <div key={`${latestResult.batch_id}-${job.id}`} className={`rounded-xl border px-4 py-3 ${meta.className}`}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-base font-semibold text-white">{job.device_name || job.device_phone}</div>
                                <div className="mt-1 text-sm text-slate-300">终端号: {job.device_phone}</div>
                              </div>
                              <div className="flex items-center gap-2 text-base">
                                {meta.icon}
                                <span className={meta.textClassName}>{meta.label}</span>
                              </div>
                            </div>
                            <div className={`mt-3 text-sm ${meta.textClassName}`}>{meta.message}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-cyan-400/25 bg-slate-900/50 p-4">
              <div className="text-sm text-slate-400">总发送次数</div>
              <div className="mt-2 text-3xl font-semibold text-white">{sendRecords.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
              <div className="text-sm text-slate-400">处理中</div>
              <div className="mt-2 text-3xl font-semibold text-slate-100">{pendingRecordCount}</div>
            </div>
            <div className="rounded-2xl border border-emerald-400/25 bg-slate-900/50 p-4">
              <div className="text-sm text-slate-400">全部成功</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-300">{successRecordCount}</div>
            </div>
            <div className="rounded-2xl border border-amber-400/25 bg-slate-900/50 p-4">
              <div className="text-sm text-slate-400">部分成功</div>
              <div className="mt-2 text-3xl font-semibold text-amber-300">{partialRecordCount}</div>
            </div>
            <div className="rounded-2xl border border-red-400/25 bg-slate-900/50 p-4">
              <div className="text-sm text-slate-400">全部失败</div>
              <div className="mt-2 text-3xl font-semibold text-red-300">{failedRecordCount}</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {sendRecords.length === 0 ? (
              <div className="rounded-2xl border border-cyan-400/25 bg-slate-900/50 px-6 py-14 text-center text-slate-400">
                还没有发送记录，先去“文本播报”页发一次试试。
              </div>
            ) : (
              <div className="space-y-4">
                {sendRecords.map((record) => {
                  const status = getRecordStatus(record.result);
                  return (
                    <div
                      key={record.id}
                      className="rounded-2xl border border-cyan-400/20 bg-slate-900/50 p-5 backdrop-blur-sm"
                    >
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-semibold text-white">
                              {record.mode === 'broadcast' ? '全体广播' : '定向播报'}
                            </span>
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] ${
                                status === 'success'
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : status === 'pending'
                                    ? 'bg-slate-700/60 text-slate-200'
                                    : status === 'partial'
                                      ? 'bg-amber-500/15 text-amber-300'
                                      : 'bg-red-500/15 text-red-300'
                              }`}
                            >
                              {status === 'success'
                                ? '成功'
                                : status === 'pending'
                                  ? '处理中'
                                  : status === 'partial'
                                    ? '部分成功'
                                    : '失败'}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-400">{formatDateTime(record.createdAt)}</div>
                        </div>

                        <div className="text-right text-sm text-slate-300">
                          <div>已确认 {record.result.acked_count}</div>
                          <div>处理中 {getPendingCount(record.result)}</div>
                          <div>失败 {record.result.failed_count}</div>
                        </div>
                      </div>

                      <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
                        {record.text}
                      </div>

                      <div className="mb-4 flex flex-wrap gap-2">
                        {record.targetNames.map((name) => (
                          <span
                            key={`${record.id}-${name}`}
                            className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs text-slate-300"
                          >
                            {name}
                          </span>
                        ))}
                      </div>

                      <div className="space-y-2">
                        {record.result.jobs.map((job) => {
                          const meta = getJobStatusMeta(job);
                          return (
                            <div
                              key={`${record.id}-${job.id}`}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm"
                            >
                              <div className="text-slate-200">
                                {job.device_name || job.device_phone}
                                <span className="ml-2 text-xs text-slate-500">{job.device_phone}</span>
                              </div>
                              <div className={meta.textClassName}>{meta.message}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
        </div>
      )}
    </div>
  );
}

