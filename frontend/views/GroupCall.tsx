import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
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

import { getApiUrl } from '../src/api/config';
import { deviceApi, type ApiDevice } from '../src/api/deviceApi';

type ActiveTab = 'tts' | 'records';
type SendMode = 'group' | 'broadcast';
type InputMode = 'text' | 'voice';
type RecordStatus = 'pending' | 'success' | 'partial' | 'failed';
type GroupCallStatus = 'ACTIVE' | 'ENDED';

interface Jt808Device extends ApiDevice {
  phone: string;
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

function isJt808Device(device: ApiDevice) {
  const type = String(device.device_type || '').toUpperCase();
  return type === 'JT808' || type.includes('JT808');
}

function getPhoneFromDevice(device: ApiDevice) {
  const streamPhone = typeof device.stream_url === 'string' ? device.stream_url.trim() : '';
  return streamPhone || String(device.id || '').trim();
}

function isBatchResponse(payload: unknown): payload is TtsBatchResponse {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<TtsBatchResponse>;
  return typeof candidate.batch_id === 'string' && Array.isArray(candidate.jobs);
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
      { id: '深圳地铁14号线', name: '深圳地铁14号线', teams: ['盾构一组', '盾构二组'] },
      { id: '广州地铁18号线', name: '广州地铁18号线', teams: ['土建一队', '土建二队'] }
    ]
  },
];

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
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
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

  const loadDevices = async () => {
    setLoadingDevices(true);
    setLoadingError('');

    try {
      const response = await deviceApi.getAllDevices();
      const jt808Devices = response
        .filter(isJt808Device)
        .map((device) => ({
          ...device,
          phone: getPhoneFromDevice(device),
        }))
        .filter((device) => device.phone)
        .sort((a, b) => {
          if (a.is_online !== b.is_online) {
            return a.is_online ? -1 : 1;
          }
          return a.device_name.localeCompare(b.device_name, 'zh-CN');
        });

      setDevices(jt808Devices);
      setSelectedPhones((prev) => prev.filter((phone) => jt808Devices.some((device) => device.phone === phone)));
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载终端设备失败';
      setLoadingError(message);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    loadGroupCalls();
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
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
    setSelectedTeam('all');
    setSearchKeyword('');
    setShowFilter(false);
  };

  const activeFiltersCount = [
    selectedCompany !== 'all',
    selectedProject !== 'all',
    selectedTeam !== 'all',
    searchKeyword !== ''
  ].filter(Boolean).length;

  const filteredDevices = devices.filter((device) => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (keyword) {
      const searchable = [device.device_name, device.phone, device.id, device.device_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!searchable.includes(keyword)) {
        return false;
      }
    }

    if (selectedCompany !== 'all') {
      const company = companyTree.find(c => c.id === selectedCompany);
      if (company) {
        if (selectedProject !== 'all') {
          const project = company.projects.find((p: any) => p.id === selectedProject);
          if (project) {
            if (selectedTeam !== 'all') {
              const deviceName = (device.device_name || '').toLowerCase();
              if (!deviceName.includes(selectedTeam.toLowerCase())) {
                return false;
              }
            }
            const deviceName = (device.device_name || '').toLowerCase();
            if (!deviceName.includes(project.name.toLowerCase())) {
              return false;
            }
          }
        }
        const deviceName = (device.device_name || '').toLowerCase();
        if (!deviceName.includes(company.name.toLowerCase())) {
          return false;
        }
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
      const response = await fetch(getApiUrl('/call?limit=20'));
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

  const stopVoiceRecognition = () => {
    recognitionRef.current?.stop();
  };

  const startVoiceRecognition = () => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setSendError('当前浏览器不支持语音识别，请使用 Chrome 或 Edge 浏览器，或改用文本播报。');
      return;
    }

    setSendError('');
    setInterimTranscript('');
    recognitionRef.current?.abort();

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
    const response = await fetch(getApiUrl(`/call/tts/batch/${batchId}`));
    const payload = (await response.json().catch(() => null)) as TtsBatchResponse | { detail?: unknown } | null;
    if (!response.ok || !isBatchResponse(payload)) {
      throw new Error(summarizeError(payload, '获取播报回执失败'));
    }
    applyBatchUpdate(payload);
    return payload;
  };

  const sendTts = async () => {
    if (inputMode === 'voice') {
      stopVoiceRecognition();
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
        },
        body: JSON.stringify({
          text,
          target_phones: targetPhones,
        }),
      });

      const payload = (await response.json().catch(() => null)) as TtsBatchResponse | { detail?: unknown } | null;
      if (!response.ok || !isBatchResponse(payload)) {
        throw new Error(summarizeError(payload, '文本播报发送失败'));
      }

      const result = payload;
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
    <div className="h-full overflow-hidden flex flex-col p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-8">
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
                <Phone size={36} className="text-cyan-400" />
                群组通话
              </h1>
              <p className="mt-1 text-base text-slate-400">
                支持发起群组通话会话，并向终端设备下发 JT808 文本播报。
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('tts')}
                className={`rounded-lg px-6 py-3 text-lg font-medium transition-all ${
                  activeTab === 'tts'
                    ? 'border border-cyan-400/50 bg-cyan-500/30 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Volume2 size={20} className="mr-2 inline" />
                信息播报
              </button>
              <button
                onClick={() => setActiveTab('records')}
                className={`rounded-lg px-6 py-3 text-lg font-medium transition-all ${
                  activeTab === 'records'
                    ? 'border border-cyan-400/50 bg-cyan-500/30 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText size={20} className="mr-2 inline" />
                发送记录
              </button>
            </div>
          </div>

        <div className="flex gap-3 text-sm">
          <div className="rounded-xl border border-cyan-400/30 bg-slate-900/50 px-4 py-3 text-slate-200">
            <div className="text-slate-400">终端设备</div>
            <div className="mt-1 text-xl font-semibold text-white">{devices.length}</div>
          </div>
          <div className="rounded-xl border border-emerald-400/30 bg-slate-900/50 px-4 py-3 text-slate-200">
            <div className="text-slate-400">在线设备</div>
            <div className="mt-1 text-xl font-semibold text-emerald-300">{onlineDevices.length}</div>
          </div>
          <div className="rounded-xl border border-amber-400/30 bg-slate-900/50 px-4 py-3 text-slate-200">
            <div className="text-slate-400">已选设备</div>
            <div className="mt-1 text-xl font-semibold text-amber-300">{selectedDevices.length}</div>
          </div>
          <div className="rounded-xl border border-rose-400/30 bg-slate-900/50 px-4 py-3 text-slate-200">
            <div className="text-slate-400">活动通话</div>
            <div className="mt-1 text-xl font-semibold text-rose-300">{activeGroupCalls.length}</div>
          </div>
        </div>
      </div>

      {activeTab === 'tts' ? (
        <div className="flex-1 flex gap-6 overflow-hidden">
          <section className="w-80 flex-shrink-0 flex flex-col rounded-2xl border border-cyan-400/25 bg-slate-900/50 p-5 backdrop-blur-sm shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">终端设备选择</h2>
                  <p className="text-sm text-slate-400">从设备列表中选择要播报的终端。</p>
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

              <div className="mb-4 relative">
                <div className="flex gap-2 items-center">
                  <div className="relative">
                    <button
                      onClick={() => setShowFilter(!showFilter)}
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
                    
                    {showFilter && (
                      <div className="absolute top-full left-0 mt-2 z-[400] bg-slate-800 rounded-xl border border-cyan-400/30 shadow-2xl p-4 min-w-[300px]">
                        <div className="space-y-3">
                          <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                            <span className="text-sm font-medium text-white">筛选条件</span>
                            <button onClick={resetFilters} className="text-xs text-cyan-400 hover:text-cyan-300">清除筛选</button>
                          </div>
                          
                          <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                            <input
                              type="text"
                              value={searchKeyword}
                              onChange={(event) => setSearchKeyword(event.target.value)}
                              placeholder="模糊搜索设备名称、手机号、ID"
                              className="w-full rounded-lg border border-slate-700 bg-slate-900/50 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none transition-all focus:border-cyan-400/50"
                            />
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
                                公司 {company.name}
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
                                    项目 {project.name}
                                  </button>
                                  {selectedProject === project.id && project.teams.map((team: string) => (
                                    <button
                                      key={team}
                                      onClick={() => setSelectedTeam(selectedTeam === team ? 'all' : team)}
                                      className={`ml-4 w-[calc(100%-1rem)] text-left px-2 py-1 rounded-lg text-xs ${
                                        selectedTeam === team ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:bg-slate-700'
                                      }`}
                                    >
                                      班组 {team}
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
              </div>

              {loadingError ? (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-base text-red-200">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{loadingError}</span>
                </div>
              ) : null}

              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {loadingDevices && devices.length === 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-8 text-base text-slate-400">
                  <LoaderCircle size={18} className="animate-spin" />
                  正在加载设备...
                </div>
              ) : null}

              {!loadingDevices && filteredDevices.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-8 text-center text-base text-slate-400">
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
                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                      selected
                        ? 'border-cyan-400/60 bg-cyan-500/15'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-base font-semibold text-white">
                          <Users size={15} className="text-cyan-300" />
                          {device.device_name || device.phone}
                        </div>
                        <div className="mt-1 text-sm text-slate-400">终端号: {device.phone}</div>
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

                    <div className="space-y-1 text-sm text-slate-400">
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
                      <div className="mt-3 flex items-center gap-2 text-sm text-cyan-300">
                        <CheckCircle2 size={14} />
                        已加入本次播报
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

           <section className="flex-1 flex flex-col rounded-2xl border border-cyan-400/25 bg-slate-900/50 p-6 backdrop-blur-sm shadow-xl overflow-hidden">
            <div className="mb-4 rounded-2xl border border-rose-400/20 bg-slate-950/50 p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">群组通话会话</h2>
                  <p className="text-sm text-slate-400">基于当前已选终端创建会话，方便追踪发起时间和结束状态。</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadGroupCalls()}
                    disabled={loadingGroupCalls}
                    className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm text-slate-200 transition-all hover:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      <RefreshCw size={14} className={loadingGroupCalls ? 'animate-spin' : ''} />
                      刷新会话
                    </span>
                  </button>
                  <button
                    onClick={startGroupCall}
                    disabled={startingCall || selectedDevices.length === 0}
                    className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      {startingCall ? <LoaderCircle size={14} className="animate-spin" /> : <Phone size={14} />}
                      {startingCall ? '发起中...' : '发起群组通话'}
                    </span>
                  </button>
                </div>
              </div>

              {groupCallError ? (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{groupCallError}</span>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groupCalls.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-8 text-sm text-slate-400 md:col-span-2 xl:col-span-3">
                    暂时还没有群组通话会话，选择设备后可以直接发起。
                  </div>
                ) : (
                  groupCalls.map((call) => {
                    const statusMeta = getGroupCallStatusMeta(call.status);
                    return (
                      <div key={call.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-white">房间 {call.room_id}</div>
                            <div className="mt-1 text-xs text-slate-400">会话 #{call.id}</div>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-xs ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm text-slate-300">
                          <div>发起时间: {formatDateTime(call.start_time)}</div>
                          <div>成员数量: {call.member_ids.length}</div>
                          <div>发起人 ID: {call.initiator_id}</div>
                          {call.end_time ? <div>结束时间: {formatDateTime(call.end_time)}</div> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
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
                            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 transition-all hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
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

            <div className="mb-3 flex flex-wrap items-start justify-between gap-4 flex-shrink-0">
              <div>
                <h2 className="text-xl font-semibold text-white">播报控制台</h2>
                <p className="mb-0 text-base text-slate-400">支持向选定终端设备定向播报，或对当前所有在线设备进行广播。</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSendMode('group')}
                  className={`rounded-xl border px-4 py-3 text-base transition-all ${
                    sendMode === 'group'
                      ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300'
                      : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Users size={18} />
                    定向播报
                  </span>
                </button>
                <button
                  onClick={() => setSendMode('broadcast')}
                  className={`rounded-xl border px-4 py-3 text-base transition-all ${
                    sendMode === 'broadcast'
                      ? 'border-blue-400/60 bg-blue-500/20 text-blue-300'
                      : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Radio size={18} />
                    全体广播
                  </span>
                </button>
              </div>
            </div>

              <div className="relative mb-4 flex flex-1">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => {
                      stopVoiceRecognition();
                      setInputMode('text');
                    }}
                    className={`w-12 flex-1 rounded-l-xl flex items-center justify-center text-sm font-medium transition-all ${
                      inputMode === 'text'
                        ? 'bg-slate-950/70 border border-r-0 border-slate-700 text-cyan-300 -mr-px'
                        : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                    }`}
                    title="文本输入"
                  >
                    <Type size={20} />
                  </button>
                  <button
                    onClick={() => setInputMode('voice')}
                    className={`w-12 flex-1 rounded-l-xl flex items-center justify-center text-sm font-medium transition-all ${
                      inputMode === 'voice'
                        ? 'bg-slate-950/70 border border-r-0 border-slate-700 text-cyan-300 -mr-px'
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
                          rows={8}
                      placeholder="请输入要下发到设备端播报的文本，例如：请前往 2 号通道进行集合点检。"
                      className="h-full min-h-[160px] max-h-[160px] w-full rounded-2xl rounded-l-none border border-slate-700 bg-slate-950/70 px-4 py-3 pr-44 pb-14 text-base text-slate-100 outline-none transition-all focus:border-cyan-400/50 resize-none overflow-y-auto"
                    />
                  ) : (
                    <div className="h-full min-h-[160px] max-h-[160px] rounded-2xl rounded-l-none border border-slate-700 bg-slate-950/70 p-4 pr-44 relative">
                      <div className="h-24 mb-3 text-base text-slate-100 overflow-y-auto whitespace-pre-wrap">
                        {ttsText || '点击下方按钮开始语音识别，识别结果会显示在这里。'}
                      </div>

                      <div className="absolute bottom-12 left-4 right-44">
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

                  <div className="absolute right-3 bottom-3 flex gap-2">
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

              <div className="mb-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-2 text-base font-medium text-slate-200">已选择播报目标</div>
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
                  <div className="text-base text-slate-400">当前还没有可发送的目标设备。</div>
                )}
              </div>

              {sendError ? (
                <div className="mb-2 flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-base text-red-200">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{sendError}</span>
                </div>
              ) : null}


            <hr className="my-2 border-slate-700/50" />

            <div className="flex flex-col">
              <div className="mb-2 flex items-center justify-between gap-3 flex-shrink-0">
                <div>
                  <h2 className="text-xl font-semibold text-white">接收回执</h2>
                </div>
                {latestResult ? (
                  <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-sm text-cyan-300">
                    请求 {latestResult.requested_count} 台
                  </span>
                ) : null}
              </div>

              <div className="pr-1">
                {!latestResult ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-10 text-center text-base text-slate-400">
                    发送后，这里会显示设备接收结果。
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="text-sm text-slate-400">请求设备</div>
                        <div className="mt-2 text-2xl font-semibold text-white">{latestResult.requested_count}</div>
                      </div>
                      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                        <div className="text-sm text-slate-300">待处理</div>
                        <div className="mt-2 text-2xl font-semibold text-slate-100">{getPendingCount(latestResult)}</div>
                      </div>
                      <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                        <div className="text-sm text-emerald-200">已确认</div>
                        <div className="mt-2 text-2xl font-semibold text-emerald-300">{latestResult.acked_count}</div>
                      </div>
                      <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4">
                        <div className="text-sm text-red-200">失败</div>
                        <div className="mt-2 text-2xl font-semibold text-red-300">{latestResult.failed_count}</div>
                      </div>
                      <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4">
                        <div className="text-sm text-amber-200">重试中</div>
                        <div className="mt-2 text-2xl font-semibold text-amber-300">{latestResult.retry_wait_count}</div>
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

