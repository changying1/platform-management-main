  import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
  import ReactDOM from 'react-dom';
  import Hls from 'hls.js';
  import {
    Search,
    Plus,
    Trash2,
    MonitorPlay,
    Maximize2,
    X,
    Camera,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Grid3x3,
    Grid2x2,
    LayoutGrid,
    Loader,
    Settings,
    Save,
    Edit2,
    Play, 
    // --- ✅ 新增图标（已合并，无重复）---
    Shield,
    ShieldAlert,
    ShieldCheck,
    
  } from "lucide-react";

  import VideoPlayer from "../src/components/VideoPlayer";
  import PTZControlPanel from "../src/components/PTZControlPanel";
  import SmartMonitoringConfig from "../src/components/SmartMonitoringConfig"; 
  import {
    getAllVideos,
    deleteVideo,
    getVideoStreamUrl,
    addCameraViaRTSP,
    updateVideo,
    ptzControl,
    Video,
    VideoCreate,
    VideoUpdate,
    // --- ✅ 新增 API（已合并，无重复）---
    startAIMonitoring,
    stopAIMonitoring,
    getAIRules,
    savePlaybackClip,
    AIRule,
    StreamUrl,
  } from "../src/api/videoApi";
  import { API_BASE_URL } from "../src/api/config";

  const getAlarmWebSocketUrl = () => {
    try {
      const apiUrl = new URL(API_BASE_URL);
      const wsProtocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
      return `${wsProtocol}//${apiUrl.host}/ws/alarm`;
    } catch {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${wsProtocol}//${window.location.hostname}:9000/ws/alarm`;
    }
  };

  const formatWorkDuration = (seconds?: number) => {
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
      return "--";
    }

    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  type VideoWithWorkDuration = Video & {
    // total_work_seconds?: number;
    // total_work_duration_seconds?: number;
    uptime_seconds?: number;
    runtime_seconds?: number;
  };

  const WORK_DURATION_STORAGE_KEY = "video_center_work_duration_by_device";

  const getVideoWorkDurationSeconds = (video?: Video | null) => {
    if (!video) return undefined;

    const source = video as VideoWithWorkDuration;
    const candidates = [
      // source.total_work_seconds,
      // source.total_work_duration_seconds,
      source.uptime_seconds,
      source.runtime_seconds,
    ];

    for (const val of candidates) {
      if (typeof val === "number" && Number.isFinite(val) && val >= 0) {
        return Math.floor(val);
      }
    }

    return undefined;
  };

  const loadWorkDurationMap = (): Record<number, number> => {
    if (typeof window === "undefined") return {};

    try {
      const raw = window.localStorage.getItem(WORK_DURATION_STORAGE_KEY);
      if (!raw) return {};

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return {};

      const result: Record<number, number> = {};
      for (const [idStr, val] of Object.entries(parsed)) {
        const id = Number(idStr);
        const seconds = Number(val);
        if (Number.isInteger(id) && Number.isFinite(seconds) && seconds >= 0) {
          result[id] = Math.floor(seconds);
        }
      }
      return result;
    } catch {
      return {};
    }
  };

  const VIDEO_CENTER_STYLE_ID = "video-center-cyber-style";
  if (typeof document !== "undefined" && !document.getElementById(VIDEO_CENTER_STYLE_ID)) {
    const styleEl = document.createElement("style");
    styleEl.id = VIDEO_CENTER_STYLE_ID;
    styleEl.textContent = `
      @keyframes vc-pulse {
        0%, 100% { opacity: 0.55; box-shadow: 0 0 6px rgba(96, 165, 250, 0.55); }
        50% { opacity: 1; box-shadow: 0 0 16px rgba(96, 165, 250, 0.95); }
      }
      @keyframes vc-scan {
        0% { transform: translateY(-140%); }
        100% { transform: translateY(220%); }
      }
      .vc-scrollbar::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      .vc-scrollbar::-webkit-scrollbar-track {
        background: rgba(15, 23, 42, 0.3);
      }
      .vc-scrollbar::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, #38bdf8, #2563eb);
        border-radius: 999px;
      }
    `;
    document.head.appendChild(styleEl);
  }

  function CyberPanel({
    title,
    icon,
    actions,
    children,
    className = "",
  }: {
    title: string;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <div
        className={`relative rounded-md border border-blue-400/30 bg-slate-900/65 backdrop-blur-md shadow-[inset_0_0_30px_rgba(59,130,246,0.12),0_8px_28px_rgba(2,6,23,0.6)] overflow-hidden ${className}`}
      >
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{
          background: "linear-gradient(180deg, rgba(148,163,184,0) 0%, rgba(14,116,144,0.14) 45%, rgba(148,163,184,0) 100%)",
          animation: "vc-scan 6s linear infinite",
        }} />

        <div className="absolute -top-px -left-px h-3 w-3 border-l-2 border-t-2 border-cyan-300" />
        <div className="absolute -top-px -right-px h-3 w-3 border-r-2 border-t-2 border-cyan-300" />
        <div className="absolute -bottom-px -left-px h-3 w-3 border-l-2 border-b-2 border-cyan-300" />
        <div className="absolute -bottom-px -right-px h-3 w-3 border-r-2 border-b-2 border-cyan-300" />

        <div className="relative z-10 flex items-center justify-between border-b border-blue-400/20 bg-gradient-to-r from-blue-500/20 via-blue-300/5 to-transparent px-4 py-2.5">
          <div className="flex items-center gap-2 text-sky-100 font-semibold tracking-[0.12em] text-sm">
            <span className="h-2 w-2 rounded-full bg-cyan-300" style={{ animation: "vc-pulse 2.2s ease-in-out infinite" }} />
            {icon}
            <span>{title}</span>
          </div>
          {actions}
        </div>

        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  // DeviceCard 组件
  const DeviceCard = ({ device, previewStream, isLoading, error, onLoadPreview, onPlay }: { 
    device: Video; 
    previewStream?: string; 
    isLoading?: boolean; 
    error?: string; 
    onLoadPreview: () => void; 
    onPlay: () => void;
  }) => {
    return (
      <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md overflow-hidden cursor-pointer hover:border-cyan-400 transition-all group">
        <div className="relative aspect-video bg-black/50 overflow-hidden">
          {previewStream ? (
            <VideoPlayer src={previewStream} />
          ) : isLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader className="animate-spin text-cyan-400" size={32} />
            </div>
          ) : error ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <span className="text-xs text-rose-300">{error}</span>
              <button onClick={onLoadPreview} className="px-2 py-1 bg-cyan-500 text-white text-xs rounded">重试</button>
            </div>
          ) : (
            <button onClick={onLoadPreview} className="w-full h-full flex items-center justify-center">
              <Camera size={32} className="text-slate-500" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="bg-cyan-500/80 rounded-full p-3">
              <Play size={24} className="text-white" />
            </div>
          </button>
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded text-xs text-white flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${device.status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
            {device.name}
          </div>
        </div>
        <div className="p-2">
          <div className="text-xs text-slate-400 truncate">{device.ip_address}:{device.port}</div>
          {device.remark && <div className="text-xs text-slate-500 truncate">{device.remark}</div>}
        </div>
      </div>
    );
  };

  const getDeviceRules = async (deviceId: number) => {
      const res = await fetch(`${API_BASE_URL}/video/${deviceId}/rules`);
      if (!res.ok) {
        let msg = '获取设备算法配置失败';
        try {
          const err = await res.json();
          msg = err?.detail || err?.message || msg;
        } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      return data.rules || [];
  };

  const updateDeviceRules = async (deviceId: number, rules: string[]) => {
      const res = await fetch(`${API_BASE_URL}/video/${deviceId}/rules`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rules })
      });

      if (!res.ok) {
        let msg = '更新设备算法配置失败';
        try {
          const err = await res.json();
          msg = err?.detail || err?.message || msg;
        } catch {}
        throw new Error(msg);
      }

      return res.json();
  };

  export default function VideoCenter() {
    type AlarmBox = {
      type: string;
      msg: string;
      score: number;
      coords: [number, number, number, number];
      track_id: number;
    };

    // --- 状态管理 ---
    const [showSmartConfig, setShowSmartConfig] = useState(false);
    
    const [activeAlgos, setActiveAlgos] = useState<string[]>([]); 
    const [algos, setAlgos] = useState<Array<{ id: string; name: string }>>([
      { id: "helmet", name: "安全帽类" },
      { id: "signage", name: "现场标识类" },
      { id: "supervisor_count", name: "现场监督人数统计" },
      { id: "ladder_angle", name: "梯子角度类" },
      { id: "hole_curb", name: "孔口挡坎违规类" },
      { id: "unauthorized_person", name: "围栏入侵管理类" },
    ]);
    const [devices, setDevices] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [maximizedVideo, setMaximizedVideo] = useState<Video | null>(null);
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [streamInfo, setStreamInfo] = useState<StreamUrl | null>(null);  // ✅ 新增

    // --- ✅ 新增 AI 监控状态 ---
    const [isAIEnabled, setIsAIEnabled] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);

    // --- ✅ 新增：警报弹窗状态 ---
    const [alarmAlert, setAlarmAlert] = useState<{
      type: string;
      msg: string;
      score: number;
      timestamp: number;
    } | null>(null);
    const [alarmBoxes, setAlarmBoxes] = useState<AlarmBox[]>([]);

    // --- 分页与网格状态 ---
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(9);
    const gridOptions = [1, 4, 9, 16, 25];
    
    const [previewStreams, setPreviewStreams] = useState<Record<number, StreamUrl>>({});
    const [previewLoading, setPreviewLoading] = useState<Record<number, boolean>>({});
    const [previewErrors, setPreviewErrors] = useState<Record<number, string>>({});
    const [workDurationByDevice, setWorkDurationByDevice] = useState<Record<number, number>>(loadWorkDurationMap);
    const [gridCols, setGridCols] = useState(3);
    const [showPlayer, setShowPlayer] = useState(false);
    const [currentDevice, setCurrentDevice] = useState<Video | null>(null);
    const [fullScreenStreamLoading, setFullScreenStreamLoading] = useState(false);
    const [fullScreenStreamError, setFullScreenStreamError] = useState<string | null>(null);

    const handlePlayerError = useCallback((msg: string) => {
      setFullScreenStreamError(msg);
    }, []);

    const handlePTZSuccess = useCallback((msg: string) => {
      console.log(msg);
    }, []);

    const handlePTZError = useCallback((err: string) => {
      console.error(err);
    }, []);

    const [selectedDevices, setSelectedDevices] = useState<number[]>([]);
    const [showDeviceSelector, setShowDeviceSelector] = useState(false);
    const [selectedCompany, setSelectedCompany] = useState<string>('all');
    const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedDeviceType, setSelectedDeviceType] = useState('all');

    // --- 弹窗与表单状态 ---
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState<Video | null>(null);
    const [editingDevice, setEditingDevice] = useState<Video | null>(null);
    const [playbackStartTime, setPlaybackStartTime] = useState("");
    const [playbackEndTime, setPlaybackEndTime] = useState("");
    const [playbackSaving, setPlaybackSaving] = useState(false);
    const [playbackSavedPath, setPlaybackSavedPath] = useState<string | null>(null);
    const alarmWsRef = useRef<WebSocket | null>(null);
    const alarmReconnectTimerRef = useRef<number | null>(null);
    const alarmCloseTimerRef = useRef<number | null>(null);
    const alarmBoxesClearTimerRef = useRef<number | null>(null);
    const aiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // const [companies, setCompanies] = useState<string[]>(['all']);
  // const [projects, setProjects] = useState<string[]>(['all']);
  // ✅ 硬编码公司列表（仅用于下拉菜单筛选）
  const hardcodedCompanies = [
      '集团有限公司',
      '北京分公司',
      '上海分公司',
      '广州分公司',
      '成都分公司',
      '武汉分公司',
      '沈阳分公司',
      '南京分公司',
      '深圳分公司',
      '重庆分公司'
  ];

  // ✅ 硬编码项目列表（仅用于下拉菜单筛选）
  const hardcodedProjects = [
      '西安东站项目',
      '西安地铁8号线',
      '咸阳机场T5航站楼',
      '北京地铁17号线',
      '北京丰台站改造',
      '上海浦东机场联络线',
      '上海轨道交通市域线',
      '广州白云站',
      '广湛高铁广州段',
      '成都地铁18号线',
      '天府站综合交通枢纽',
      '武汉光谷综合体',
      '武汉地铁12号线',
      '沈阳地铁4号线',
      '沈阳北站改造',
      '南京北站',
      '南京地铁11号线',
      '深圳前海枢纽',
      '深圳地铁13号线',
      '重庆东站',
      '重庆轨道交通27号线'
  ];

  const [companies, setCompanies] = useState<string[]>(['all', ...hardcodedCompanies]);
  const [projects, setProjects] = useState<string[]>(['all', ...hardcodedProjects]);

    const [newDeviceForm, setNewDeviceForm] = useState<VideoCreate>({
      name: "",
      ip_address: "",
      port: 80,
      username: "",
      password: "",
      stream_url: "",
      status: "offline",
      remark: "",
    });

    const [editDeviceForm, setEditDeviceForm] = useState<VideoUpdate>({
      name: "",
      ip_address: "",
      port: 80,
      username: "",
      password: "",
      stream_url: "",
      status: "offline",
      remark: "",
    });

    const currentWorkDurationSeconds = maximizedVideo
      ? workDurationByDevice[maximizedVideo.id] ?? getVideoWorkDurationSeconds(maximizedVideo)
      : undefined;

    useEffect(() => {
      if (!devices.length) return;

      setWorkDurationByDevice((prev) => {
        const next = { ...prev };
        let changed = false;

        for (const device of devices) {
          const backendSeconds = getVideoWorkDurationSeconds(device);
          if (typeof backendSeconds === "number") {
            const localSeconds = next[device.id];
            if (typeof localSeconds !== "number" || backendSeconds > localSeconds) {
              next[device.id] = backendSeconds;
              changed = true;
            }
          } else if (typeof next[device.id] !== "number") {
            next[device.id] = 0;
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }, [devices]);

    useEffect(() => {
      const timer = window.setInterval(() => {
        setWorkDurationByDevice((prev) => {
          if (!devices.length) return prev;

          const next = { ...prev };
          let changed = false;

          for (const device of devices) {
            if (typeof next[device.id] !== "number") {
              next[device.id] = getVideoWorkDurationSeconds(device) ?? 0;
              changed = true;
            }

            const isWorking =
              device.status === "online" ||
              (!!maximizedVideo && maximizedVideo.id === device.id && !!streamUrl);

            if (isWorking) {
              next[device.id] += 1;
              changed = true;
            }
          }

          return changed ? next : prev;
        });
      }, 1000);

      return () => window.clearInterval(timer);
    }, [devices, maximizedVideo, streamUrl]);

    useEffect(() => {
      try {
        window.localStorage.setItem(WORK_DURATION_STORAGE_KEY, JSON.stringify(workDurationByDevice));
      } catch {
        // ignore localStorage write failures
      }
    }, [workDurationByDevice]);

    // --- ✅ 新增：切换摄像头时重置 AI 状态 ---
useEffect(() => {
  // 根据当前设备的 activeAlgos 来决定
  setIsAIEnabled(activeAlgos.length > 0);
}, [maximizedVideo, activeAlgos]);

    useEffect(() => {
      if (!maximizedVideo) {
        setPlaybackSavedPath(null);
        return;
      }

      const toInputValue = (d: Date) => {
        const pad = (v: number) => String(v).padStart(2, "0");
        const year = d.getFullYear();
        const month = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
        const hour = pad(d.getHours());
        const minute = pad(d.getMinutes());
        return `${year}-${month}-${day}T${hour}:${minute}`;
      };

      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      setPlaybackStartTime(toInputValue(tenMinutesAgo));
      setPlaybackEndTime(toInputValue(now));
      setPlaybackSavedPath(null);
    }, [maximizedVideo]);

    // --- ✅ 改进：AI 开关处理逻辑 ---

    // 1. 处理单个功能的开启/关闭
  const handleSingleAI = async (type: string) => {
      if (!maximizedVideo || !type) return;

      const newAlgos = activeAlgos.includes(type)
          ? activeAlgos.filter(t => t !== type)
          : [...activeAlgos, type];

      try {
        setAiLoading(true);
        await updateDeviceRules(maximizedVideo.id, newAlgos);
        setActiveAlgos(newAlgos);
              setIsAIEnabled(newAlgos.length > 0);
      } catch (err: any) {
        alert(err?.message || '算法配置失败');
      } finally {
        setAiLoading(false);
      }
  };


    // 2. 处理一键全开启/全关闭
  const handleToggleAll = async (enable: boolean) => {
      if (!maximizedVideo) return;

      const newAlgos = enable ? algos.map(a => a.id) : [];

      try {
        setAiLoading(true);
        await updateDeviceRules(maximizedVideo.id, newAlgos);
        setActiveAlgos(newAlgos);
      } catch (err: any) {
        alert(err?.message || '算法配置失败');
      } finally {
        setAiLoading(false);
      }
  };

    // --- 初始化加载 ---
    useEffect(() => {
      // fetchDevices();
      fetchAIRules();
    }, []);

    // ✅ 新增：播放警报音效
    const playAlarmSound = () => {
      // 创建简单的蜂鸣音（使用Web Audio API）
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const now = audioContext.currentTime;
        
        // 创建4个频率的警报音
        for (let i = 0; i < 4; i++) {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          
          osc.connect(gain);
          gain.connect(audioContext.destination);
          
          // 快速升降的频率
          osc.frequency.setValueAtTime(800 + i * 200, now + i * 0.15);
          osc.frequency.setValueAtTime(400 + i * 100, now + i * 0.15 + 0.1);
          
          gain.gain.setValueAtTime(0.3, now + i * 0.15);
          gain.gain.setValueAtTime(0, now + i * 0.15 + 0.12);
          
          osc.start(now + i * 0.15);
          osc.stop(now + i * 0.15 + 0.12);
        }
      } catch (err) {
        console.warn("音频上下文创建失败:", err);
      }
    };

    const fetchAIRules = async () => {
      try {
        const rules: AIRule[] = await getAIRules();
        if (!rules.length) return;

        const mapped = rules.map((rule) => ({
          id: rule.key,
          name: rule.desc || rule.key,
        }));

        setAlgos(mapped);
      } catch (e) {
        console.warn("AI 规则加载失败，使用本地兜底列表", e);
      }
    };

    const normalizeSingleAlarmBox = (raw: any, fallback: any): AlarmBox | null => {
      if (!raw || typeof raw !== "object") return null;

      let coordsSource =
        raw.coords ||
        raw.bbox ||
        raw.xyxy ||
        raw.box ||
        (raw.rect && [raw.rect.left, raw.rect.top, raw.rect.right, raw.rect.bottom]);

      if (!Array.isArray(coordsSource) || coordsSource.length < 4) {
        const x1 = Number(raw.x1 ?? raw.left ?? raw.x ?? 0);
        const y1 = Number(raw.y1 ?? raw.top ?? raw.y ?? 0);
        const x2 = Number(raw.x2 ?? raw.right ?? (Number(raw.w) ? x1 + Number(raw.w) : 0));
        const y2 = Number(raw.y2 ?? raw.bottom ?? (Number(raw.h) ? y1 + Number(raw.h) : 0));
        coordsSource = [x1, y1, x2, y2];
      }

      const numericCoords = coordsSource.map((v: any) => Number(v)).filter(Number.isFinite);
      if (numericCoords.length < 4) return null;

      let x1 = numericCoords[0];
      let y1 = numericCoords[1];
      let x2 = numericCoords[2];
      let y2 = numericCoords[3];

      if (x2 < x1) [x1, x2] = [x2, x1];
      if (y2 < y1) [y1, y2] = [y2, y1];

      return {
        type: raw.type || fallback?.type || "未知警报",
        msg: raw.msg || fallback?.msg || "检测到异常",
        score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : Number(fallback?.score) || 0,
        coords: [x1, y1, x2, y2],
        track_id: Number(raw.track_id ?? fallback?.track_id ?? 0),
      };
    };

    const normalizeAlarmBoxes = (data: any): AlarmBox[] => {
      if (!data || typeof data !== "object") return [];

      const candidates = [
        data.boxes,
        data.data?.boxes,
        data.payload?.boxes,
        data.detail?.boxes,
        data.result?.boxes,
        data.event?.boxes,
      ];

      for (const candidate of candidates) {
        if (!Array.isArray(candidate) || candidate.length === 0) continue;
        const normalized = candidate
          .map((box: any) => normalizeSingleAlarmBox(box, data))
          .filter((box: AlarmBox | null): box is AlarmBox => Boolean(box));
        if (normalized.length > 0) return normalized;
      }

      const flatBox = normalizeSingleAlarmBox(data, data);
      if (flatBox) return [flatBox];

      return [];
    };

    const parseAlarmPayload = (raw: any): { boxes: AlarmBox[]; alarmLike: any } => {
      const alarmLike = (raw?.data && typeof raw.data === "object" ? raw.data : raw) || {};
      const boxes = normalizeAlarmBoxes(raw);
      return { boxes, alarmLike };
    };

  useEffect(() => {
    // ✅ 关键：只有当 AI 监控开启时才连接 WebSocket
    if (!isAIEnabled) {
      if (alarmReconnectTimerRef.current) {
        window.clearTimeout(alarmReconnectTimerRef.current);
        alarmReconnectTimerRef.current = null;
      }
      if (alarmCloseTimerRef.current) {
        window.clearTimeout(alarmCloseTimerRef.current);
        alarmCloseTimerRef.current = null;
      }
      if (alarmBoxesClearTimerRef.current) {
        window.clearTimeout(alarmBoxesClearTimerRef.current);
        alarmBoxesClearTimerRef.current = null;
      }
      if (alarmWsRef.current) {
        alarmWsRef.current.close();
        alarmWsRef.current = null;
      }
      return;
    }

    const wsUrl = getAlarmWebSocketUrl();
    let disposed = false;

    const connect = () => {
      if (disposed) return;

      try {
        if (alarmWsRef.current) {
          alarmWsRef.current.close();
          alarmWsRef.current = null;
        }

        const ws = new WebSocket(wsUrl);
        alarmWsRef.current = ws;

        ws.onopen = () => {
          console.log("AI报警WebSocket已连接:", wsUrl);
        };

        ws.onmessage = (event) => {
          let data: any;
          try {
            data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          } catch {
            return;
          }

          const { boxes, alarmLike } = parseAlarmPayload(data);

          // 人脸识别：只画框显示 5 秒，不弹窗、不响声
          if (alarmLike?.face_recognition && boxes.length) {
            setAlarmBoxes(boxes);
            if (alarmBoxesClearTimerRef.current) {
              window.clearTimeout(alarmBoxesClearTimerRef.current);
            }
            alarmBoxesClearTimerRef.current = window.setTimeout(() => {
              setAlarmBoxes([]);
            }, 5000);
            return;
          }

          const isAlarm = Boolean(
            boxes.length ||
              alarmLike?.alarm ||
              alarmLike?.is_alarm ||
              alarmLike?.alert ||
              alarmLike?.msg ||
              alarmLike?.type
          );
          if (!isAlarm) return;

          if (boxes.length) {
            setAlarmBoxes(boxes);

            if (alarmBoxesClearTimerRef.current) {
              window.clearTimeout(alarmBoxesClearTimerRef.current);
            }
            alarmBoxesClearTimerRef.current = window.setTimeout(() => {
              setAlarmBoxes([]);
            }, 4200);
          }

          const firstBox = boxes[0];
          setAlarmAlert({
            type: firstBox?.type || alarmLike?.type || "未知警报",
            msg: firstBox?.msg || alarmLike?.msg || "检测到异常",
            score: Number(firstBox?.score ?? alarmLike?.score ?? 0) || 0,
            timestamp: Date.now(),
          });

          playAlarmSound();

          if (alarmCloseTimerRef.current) {
            window.clearTimeout(alarmCloseTimerRef.current);
          }
          alarmCloseTimerRef.current = window.setTimeout(() => {
            setAlarmAlert(null);
          }, 3000);
        };

        ws.onerror = (err) => {
          console.error("AI WebSocket错误:", err);
        };

        ws.onclose = () => {
          console.log("AI报警连接关闭，准备重连");
          if (disposed) return;
          if (alarmReconnectTimerRef.current) {
            window.clearTimeout(alarmReconnectTimerRef.current);
          }
          alarmReconnectTimerRef.current = window.setTimeout(connect, 2000);
        };
      } catch (err) {
        console.error("AI WebSocket连接初始化失败:", err);
      }
    };

    connect();

    return () => {
      disposed = true;

      if (alarmReconnectTimerRef.current) {
        window.clearTimeout(alarmReconnectTimerRef.current);
        alarmReconnectTimerRef.current = null;
      }
      if (alarmCloseTimerRef.current) {
        window.clearTimeout(alarmCloseTimerRef.current);
        alarmCloseTimerRef.current = null;
      }
      if (alarmBoxesClearTimerRef.current) {
        window.clearTimeout(alarmBoxesClearTimerRef.current);
        alarmBoxesClearTimerRef.current = null;
      }

      if (alarmWsRef.current) {
        alarmWsRef.current.close();
        alarmWsRef.current = null;
      }
    };
  }, [isAIEnabled, maximizedVideo?.id]);  // ✅ 依赖项加上 isAIEnabled 和 maximizedVideo?.id


    const formatLocalDateTimeForApi = (date: Date) => {
      const pad = (v: number) => String(v).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

  // const fetchDevices = async () => {
  //   try {
  //     setLoading(true);
      
  //     // 生成 50+ 个模拟设备数据
  //     const companies = ['中铁一局', '中铁隧道局', '中铁建工', '中铁电气化局', '中铁北京工程局', '中铁上海工程局', '中铁广州工程局'];
  //     const projects = {
  //       '中铁一局': ['西安地铁8号线', '西安地铁10号线', '西安地铁15号线', '西安北站枢纽', '西安东站'],
  //       '中铁隧道局': ['西安地铁10号线', '秦岭隧道项目', '引汉济渭工程'],
  //       '中铁建工': ['西安北站扩建', '西安南站新建', '西安东站站房'],
  //       '中铁电气化局': ['西安地铁8号线供电系统', '西安地铁10号线接触网'],
  //       '中铁北京工程局': ['西延高铁项目', '西康高铁项目'],
  //       '中铁上海工程局': ['西安地铁15号线土建', '西安高新区综合管廊'],
  //       '中铁广州工程局': ['西安地铁8号线车站装修', '西安北站配套工程'],
  //     };
      
  //     const locations = [
  //       '北门出入口', '南门施工区', '西侧高空作业区', '东侧材料堆放区', '隧道入口', '隧道中段', '隧道出口',
  //       '钢筋加工棚', '混凝土搅拌站', '办公区入口', '生活区', '塔吊顶部', '基坑底部', '栈桥', '配电室',
  //       '仓库', '车辆冲洗台', '地磅', '安全教育区', '样板展示区', '顶板作业区', '中板作业区', '底板作业区',
  //       '盾构始发井', '盾构接收井', '联络通道', '风井', '变电所', '信号机房', '站台层', '站厅层', '设备层'
  //     ];
      
  //     const mockData: Video[] = [];
  //     let id = 1;
      
  //     // 生成 55 个设备
  //     for (let i = 0; i < 55; i++) {
  //       const company = companies[i % companies.length];
  //       const companyProjects = projects[company as keyof typeof projects] || ['常规项目'];
  //       const project = companyProjects[i % companyProjects.length];
  //       const location = locations[i % locations.length];
  //       const areaCode = 100 + Math.floor(i / 10);
  //       const deviceNum = String(i + 1).padStart(2, '0');
  //       const isOnline = i % 7 !== 0; // 约 1/7 的设备离线
        
  //       mockData.push({
  //         id: id++,
  //         name: `${location}摄像头${deviceNum}`,
  //         ip_address: `192.168.${Math.floor(i / 10) + 1}.${(i % 254) + 1}`,
  //         port: 80,
  //         status: isOnline ? 'online' : 'offline',
  //         is_active: isOnline ? 1 : 0,  // ✅ 添加 is_active 属性，1=在线，0=离线
  //         company: company,
  //         project: project,
  //         rtsp_url: 'rtsp://rtspstream:39pr0v@windy-archer-fox.streamlock.net:554/axis-media/media.amp',
  //         remark: `${company} - ${project} - ${location}点位`,
  //         username: i % 3 === 0 ? 'admin' : '',
  //         password: i % 3 === 0 ? '123456' : '',
  //         created_at: new Date().toISOString(),
  //         updated_at: new Date().toISOString(),
  //       } as Video);
  //     }
      
  //     // 额外添加几个特殊命名的设备
  //     const extraDevices = [
  //       { name: '全景鹰眼摄像头', location: '制高点', company: '中铁一局', project: '智慧工地总控' },
  //       { name: 'AI智能识别摄像头', location: '主通道', company: '中铁隧道局', project: '西安地铁10号线' },
  //       { name: '热成像摄像头', location: '配电室', company: '中铁电气化局', project: '西安地铁8号线供电系统' },
  //       { name: '移动布控球', location: '流动巡检', company: '中铁建工', project: '西安北站扩建' },
  //       { name: '执法记录仪', location: '安全巡查', company: '中铁一局', project: '西安地铁8号线' },
  //     ];
      
  //     extraDevices.forEach((device, idx) => {
  //       mockData.push({
  //         id: id++,
  //         name: device.name,
  //         ip_address: `192.168.100.${idx + 1}`,
  //         port: 80,
  //         status: 'online',
  //         is_active: 1,  // ✅ 添加 is_active 属性
  //         company: device.company,
  //         project: device.project,
  //         rtsp_url: 'rtsp://rtspstream:39pr0v@windy-archer-fox.streamlock.net:554/axis-media/media.amp',
  //         remark: `${device.location} - ${device.project}`,
  //         username: '',
  //         password: '',
  //         created_at: new Date().toISOString(),
  //         updated_at: new Date().toISOString(),
  //       } as Video);
  //     });
      
  //     console.log(`✅ 已生成 ${mockData.length} 个模拟设备`);
  //     setDevices(mockData);
  //     setError(null);
  //   } catch (e: any) {
  //     setError("无法加载设备。请确认后端服务已启动。");
  //     console.error(e);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

    // --- 逻辑处理 ---
    
  // const fetchDevices = async () => {
  //     try {
  //         setLoading(true);
  //         const res = await fetch('/api/devices');
  //         console.log('响应状态:', res.status);
  //         const data = await res.json();
  //         console.log('获取到的数据条数:', data.length);
  //         console.log('前3条数据:', data.slice(0, 3));
  //         setDevices(data);
          
  //         const companySet = new Set(data.map((d: any) => d.company).filter(Boolean));
  //         const projectSet = new Set(data.map((d: any) => d.project).filter(Boolean));
  //         console.log('公司列表:', companySet);
  //         console.log('项目列表:', projectSet);
  //         setCompanies(['all', ...Array.from(companySet)]);
  //         setProjects(['all', ...Array.from(projectSet)]);
  //     } catch (e) {
  //         console.error('fetchDevices错误:', e);
  //     } finally {
  //         setLoading(false);
  //     }
  // };


  const fetchDevices = async () => {
      try {
          setLoading(true);
          const data = await getAllVideos();
          
          // 根据设备名称绑定公司和项目
          const devicesWithMapping = data.map(device => {
              let company = '';
              let project = '';
              
              const name = device.name || '';
              
              // 西安东站相关（带"东站"的）
              if (name.includes('东站')) {
                  company = '集团有限公司';
                  project = '西安东站项目';
              }
              // 西安地铁8号线
              else if (name.includes('地铁8号线') || name.includes('8号线')) {
                  company = '集团有限公司';
                  project = '西安地铁8号线';
              }
              // 咸阳机场T5
              else if (name.includes('咸阳机场') || name.includes('T5')) {
                  company = '集团有限公司';
                  project = '咸阳机场T5航站楼';
              }
              // 北京地铁17号线
              else if (name.includes('北京地铁17号线')) {
                  company = '北京分公司';
                  project = '北京地铁17号线';
              }
              // 北京丰台站改造
              else if (name.includes('丰台站')) {
                  company = '北京分公司';
                  project = '北京丰台站改造';
              }
              // 上海浦东机场联络线
              else if (name.includes('浦东机场')) {
                  company = '上海分公司';
                  project = '上海浦东机场联络线';
              }
              // 上海轨道交通市域线
              else if (name.includes('市域线')) {
                  company = '上海分公司';
                  project = '上海轨道交通市域线';
              }
              // 广州白云站
              else if (name.includes('白云站')) {
                  company = '广州分公司';
                  project = '广州白云站';
              }
              // 广湛高铁
              else if (name.includes('广湛')) {
                  company = '广州分公司';
                  project = '广湛高铁广州段';
              }
              // 成都地铁18号线
              else if (name.includes('成都地铁18号线')) {
                  company = '成都分公司';
                  project = '成都地铁18号线';
              }
              // 天府站
              else if (name.includes('天府站')) {
                  company = '成都分公司';
                  project = '天府站综合交通枢纽';
              }
              // 武汉光谷
              else if (name.includes('光谷')) {
                  company = '武汉分公司';
                  project = '武汉光谷综合体';
              }
              // 武汉地铁12号线
              else if (name.includes('武汉地铁12号线')) {
                  company = '武汉分公司';
                  project = '武汉地铁12号线';
              }
              // 沈阳地铁4号线
              else if (name.includes('沈阳地铁4号线')) {
                  company = '沈阳分公司';
                  project = '沈阳地铁4号线';
              }
              // 沈阳北站
              else if (name.includes('沈阳北站')) {
                  company = '沈阳分公司';
                  project = '沈阳北站改造';
              }
              // 南京北站
              else if (name.includes('南京北站')) {
                  company = '南京分公司';
                  project = '南京北站';
              }
              // 南京地铁11号线
              else if (name.includes('南京地铁11号线')) {
                  company = '南京分公司';
                  project = '南京地铁11号线';
              }
              // 深圳前海
              else if (name.includes('前海')) {
                  company = '深圳分公司';
                  project = '深圳前海枢纽';
              }
              // 深圳地铁13号线
              else if (name.includes('深圳地铁13号线')) {
                  company = '深圳分公司';
                  project = '深圳地铁13号线';
              }
              // 重庆东站
              else if (name.includes('重庆东站')) {
                  company = '重庆分公司';
                  project = '重庆东站';
              }
              // 重庆轨道交通27号线
              else if (name.includes('重庆27号线')) {
                  company = '重庆分公司';
                  project = '重庆轨道交通27号线';
              }
              // 随机绑定（未匹配到的设备）
              else {
                  // 随机选择公司
                  const companyList = [
                      '集团有限公司', '北京分公司', '上海分公司', '广州分公司',
                      '成都分公司', '武汉分公司', '沈阳分公司', '南京分公司', '深圳分公司', '重庆分公司'
                  ];
                  const randomCompany = companyList[Math.floor(Math.random() * companyList.length)];
                  company = randomCompany;
                  
                  // 根据随机公司分配对应项目
                  const projectMap: Record<string, string[]> = {
                      '集团有限公司': ['西安东站项目', '西安地铁8号线', '咸阳机场T5航站楼'],
                      '北京分公司': ['北京地铁17号线', '北京丰台站改造'],
                      '上海分公司': ['上海浦东机场联络线', '上海轨道交通市域线'],
                      '广州分公司': ['广州白云站', '广湛高铁广州段'],
                      '成都分公司': ['成都地铁18号线', '天府站综合交通枢纽'],
                      '武汉分公司': ['武汉光谷综合体', '武汉地铁12号线'],
                      '沈阳分公司': ['沈阳地铁4号线', '沈阳北站改造'],
                      '南京分公司': ['南京北站', '南京地铁11号线'],
                      '深圳分公司': ['深圳前海枢纽', '深圳地铁13号线'],
                      '重庆分公司': ['重庆东站', '重庆轨道交通27号线'],
                  };
                  const projectsForCompany = projectMap[randomCompany] || ['西安东站项目'];
                  project = projectsForCompany[Math.floor(Math.random() * projectsForCompany.length)];
              }
              
              return {
                  ...device,
                  company: company,
                  project: project
              };
          });
          
          setDevices(devicesWithMapping);
          setError(null);
      } catch (e: any) {
          console.error('fetchDevices错误:', e);
          setError("无法加载设备。请确认后端服务已启动。");
      } finally {
          setLoading(false);
      }
  };
  // const fetchDevices = async () => {
  //     try {
  //         setLoading(true);
  //         const data = await getAllVideos();  // ✅ 使用 API 函数
  //         console.log('数据条数:', data.length);
  //         setDevices(data);
  //         setError(null);
  //     } catch (e: any) {
  //         console.error('fetchDevices错误:', e);
  //         setError("无法加载设备。请确认后端服务已启动。");
  //     } finally {
  //         setLoading(false);
  //     }
  // };
  // const fetchDevices = async () => {
  //     try {
  //         setLoading(true);
  //         const res = await fetch('http://localhost:3001/api/devices');
  //         console.log('状态:', res.status);
  //         const data = await res.json();
  //         console.log('数据条数:', data.length);
  //         setDevices(data);
          
  //         // 添加这两行：提取公司、项目列表
  //         const companySet = new Set(data.map((d: any) => d.company).filter(Boolean));
  //         const projectSet = new Set(data.map((d: any) => d.project).filter(Boolean));
  //         companySet.delete('all');
  // companySet.delete('所有公司');

  // projectSet.delete('所有项目');
  //         setCompanies(['all', ...Array.from(companySet)]);
  //         setProjects(['all', ...Array.from(projectSet)]);
          
  //         console.log('公司列表:', Array.from(companySet));
  //         console.log('项目列表:', Array.from(projectSet));
  //     } catch (e) {
  //         console.error(e);
  //     } finally {
  //         setLoading(false);
  //     }
  // };
  useEffect(() => {
      fetchDevices();
  }, []);

    const handleSearch = (val: string) => {
      setSearchTerm(val);
      setCurrentPage(1);
    };

    // 获取所有公司列表
    // const companies = ['all', ...new Set(devices.map(d => d.company).filter(Boolean))];

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
    // const projects = getProjectsByCompany();

    // 过滤后的设备列表（用于网格显示）
  const filteredDevicesForGrid = useMemo(() => {
    return devices.filter((device) => {
      if (selectedDevices.length > 0 && !selectedDevices.includes(device.id)) return false;
      if (selectedCompany !== 'all' && device.company !== selectedCompany) return false;
      if (selectedProject !== 'all' && device.project !== selectedProject) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return device.name.toLowerCase().includes(term) ||
              device.company?.toLowerCase().includes(term) ||
              device.project?.toLowerCase().includes(term) ||
              device.ip_address?.includes(searchTerm) ||
              device.remark?.toLowerCase().includes(term) ||
              String(device.id).includes(searchTerm);
      }

      return true;
    });
  }, [devices, searchTerm, selectedCompany, selectedDevices, selectedProject]);

  const totalPages = Math.ceil(filteredDevicesForGrid.length / itemsPerPage);
  const paginatedDevices = useMemo(() => {
    return filteredDevicesForGrid.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [currentPage, filteredDevicesForGrid, itemsPerPage]);
  const actualCount = paginatedDevices.length;
  const cols = actualCount > 0 ? Math.ceil(Math.sqrt(actualCount)) : 1;

    // const handleShowStream = async (device: Video) => {
    //   try {
    //     let url = previewStreams[device.id];
    //     if (!url) {
    //       const data = await getVideoStreamUrl(device.id);
    //       url = data.url;
    //       setPreviewStreams((prev) => ({ ...prev, [device.id]: url }));
    //     }
    //     setStreamUrl(url);
    //     setMaximizedVideo(device);
    //   } catch (err: any) {
    //     alert(`获取视频流失败: ${err.message}`);
    //   }
    // };
  // 找到原代码里的这个函数，全部删掉，换成下面的
  const withTimeout = async <T,>(promise: Promise<T>, ms: number, timeoutMsg: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(timeoutMsg)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const handleShowStream = async (device: Video) => {
    // 1. 先直接打开全屏
    setMaximizedVideo(device);
    setStreamUrl(null);
    setStreamInfo(null);
    setFullScreenStreamError(null);
    setFullScreenStreamLoading(true);

    try {
      const rulesPromise = withTimeout(getDeviceRules(device.id), 5000, '加载算法配置超时').catch((err) => {
        console.warn('加载算法配置失败，继续拉流:', err);
        return [] as string[];
      });
      const streamPromise = withTimeout(getVideoStreamUrl(device.id, { forceRefresh: true }), 10000, '获取视频流地址超时');

      const [rules, streamData] = await Promise.all([rulesPromise, streamPromise]);

      setActiveAlgos(Array.isArray(rules) ? rules : []);
      if (!streamData?.url) {
        throw new Error('后端未返回可用视频流地址');
      }

      setPreviewStreams((prev) => ({ ...prev, [device.id]: streamData }));
      setStreamInfo(streamData);
      setStreamUrl(streamData.url);
    } catch (err: any) {
      const msg = err?.message || '流加载失败';
      console.error('全屏流加载失败:', msg);
      setFullScreenStreamError(msg);
      setStreamUrl(null);
      setStreamInfo(null);
    } finally {
      setFullScreenStreamLoading(false);
    }
  };


  const previewStreamsRef = useRef<Record<number, StreamUrl>>({});
  const previewLoadingRef = useRef<Record<number, boolean>>({});
  const previewErrorsRef = useRef<Record<number, string>>({});

  useEffect(() => {
    previewStreamsRef.current = previewStreams;
  }, [previewStreams]);

  useEffect(() => {
    previewLoadingRef.current = previewLoading;
  }, [previewLoading]);

  useEffect(() => {
    previewErrorsRef.current = previewErrors;
  }, [previewErrors]);

  const loadPreviewStream = useCallback(async (device: Video, force = false) => {
    if (!device) {
      return;
    }

    if (!force) {
      if (previewStreamsRef.current[device.id] || previewLoadingRef.current[device.id] || previewErrorsRef.current[device.id]) {
        return;
      }
    }

    setPreviewLoading((prev) => ({ ...prev, [device.id]: true }));
    try {
      const data = await getVideoStreamUrl(device.id);
      setPreviewStreams((prev) => ({ ...prev, [device.id]: data }));
      setPreviewErrors((prev) => ({ ...prev, [device.id]: "" }));
    } catch (err: any) {
      setPreviewErrors((prev) => ({
        ...prev,
        [device.id]: err?.message || "加载失败",
      }));
    } finally {
      setPreviewLoading((prev) => ({ ...prev, [device.id]: false }));
    }
  }, []);

  const refreshDeviceRules = useCallback(async (deviceId: number) => {
    try {
      const rules = await getDeviceRules(deviceId);
      setActiveAlgos(Array.isArray(rules) ? rules : []);
      setIsAIEnabled(Array.isArray(rules) ? rules.length > 0 : false);
    } catch (err) {
      console.warn(`刷新设备规则失败（device_id=${deviceId}）:`, err);
      setActiveAlgos([]);
      setIsAIEnabled(false);
    }
  }, []);

    useEffect(() => {
      paginatedDevices.forEach((device) => {
        if (device) {
          loadPreviewStream(device);
        }
      });
    }, [loadPreviewStream, paginatedDevices]);

    const handleVideoDoubleClick = async (device: Video) => {
      await handleShowStream(device);
    };

  const handleAddDevice = async () => {
    const isEzviz = (newDeviceForm.platform_type || "onvif") === "ezviz";
    
    if (!newDeviceForm.name) {
      alert("请填写必填字段：设备名称");
      return;
    }
    
    // 萤石设备检查
    if (isEzviz) {
      if (!newDeviceForm.device_serial) {
        alert("萤石设备请填写设备序列号");
        return;
      }
    } else {
      // 本地设备检查
      if (!newDeviceForm.stream_url) {
        alert("本地设备请填写流地址");
        return;
      }
    }

    const payload = {
      name: newDeviceForm.name,
      rtsp_url: isEzviz ? undefined : newDeviceForm.stream_url,
      ip_address: newDeviceForm.ip_address || undefined,
      port: newDeviceForm.port || 80,
      username: newDeviceForm.username,
      password: newDeviceForm.password,
      remark: newDeviceForm.remark,
      // 萤石云字段
      platform_type: isEzviz ? "ezviz" : "onvif",
      access_source: isEzviz ? "cloud" : "local",
      ptz_source: isEzviz ? "ezviz" : "onvif",
      device_serial: isEzviz ? newDeviceForm.device_serial : undefined,
      channel_no: isEzviz ? (newDeviceForm.channel_no || 1) : 1,
      stream_protocol: isEzviz ? "ezopen" : "flv",
    };

    try {
      const newDevice = await addCameraViaRTSP(payload);
      setDevices([newDevice, ...devices]);
      setShowAddModal(false);
      // 重置表单...
    } catch (err: any) {
      alert(`添加失败: ${err.message}`);
    }
  };
    const handleEditClick = (device: Video, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingDevice(device);
      setEditDeviceForm({
        name: device.name,
        ip_address: device.ip_address,
        port: device.port,
        username: device.username || "",
        password: device.password || "",
        stream_url: device.rtsp_url || "",
        status: device.status,
        remark: device.remark || "",
      });
      setShowEditModal(true);
    };

    const handleUpdateDevice = async () => {
      if (!editingDevice) return;
      if (!editDeviceForm.name || !editDeviceForm.stream_url) {
        alert("请填写必填字段：设备名称和流地址");
        return;
      }

      try {
        const updatedDevice = await updateVideo(editingDevice.id, {
          ...editDeviceForm,
          rtsp_url: editDeviceForm.stream_url,
          stream_url: undefined,
        });
        setDevices(
          devices.map((d) => (d.id === editingDevice.id ? updatedDevice : d))
        );
        setShowEditModal(false);
        setEditingDevice(null);
      } catch (err: any) {
        alert(`更新失败: ${err.message}`);
      }
    };

    const handleDelete = async (id: number, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm(`确定删除设备 ID: ${id} 吗？`)) {
        try {
          await deleteVideo(id);
          setDevices((prev) => prev.filter((d) => d.id !== id));
        } catch (err: any) {
          alert(`删除失败: ${err.message}`);
        }
      }
    };

    const handleSavePlayback = async () => {
      if (!maximizedVideo) {
        alert("请先选择摄像头");
        return;
      }

      if (!playbackStartTime || !playbackEndTime) {
        alert("请先选择开始和结束时间");
        return;
      }

      const startDate = new Date(playbackStartTime);
      const endDate = new Date(playbackEndTime);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        alert("时间格式无效");
        return;
      }

      if (endDate <= startDate) {
        alert("结束时间必须大于开始时间");
        return;
      }

      try {
        setPlaybackSaving(true);
        const resp = await savePlaybackClip(maximizedVideo.id, {
          start_time: formatLocalDateTimeForApi(startDate),
          end_time: formatLocalDateTimeForApi(endDate),
        });
        setPlaybackSavedPath(resp.recording_path);
        alert("回放保存成功");
      } catch (e: any) {
        alert(`回放保存失败: ${e?.message || "未知错误"}`);
      } finally {
        setPlaybackSaving(false);
      }
    };



      const drawBoxes = useCallback((boxes: AlarmBox[]) => {
        const canvas = aiCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const container = canvas.parentElement;
        const videoEl = container?.querySelector("video") as HTMLVideoElement | null;

        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const rawVideoW = videoEl?.videoWidth || 0;
        const rawVideoH = videoEl?.videoHeight || 0;

        // 视频元数据未就绪时，依据告警坐标范围做自适应缩放，避免框被画到可视区外
        const maxCoordX = boxes.reduce((m, b) => Math.max(m, b.coords[0], b.coords[2]), 0);
        const maxCoordY = boxes.reduce((m, b) => Math.max(m, b.coords[1], b.coords[3]), 0);
        const inferredSourceW = Math.max(canvas.width, maxCoordX + 1);
        const inferredSourceH = Math.max(canvas.height, maxCoordY + 1);

        let renderX = 0;
        let renderY = 0;
        let renderW = canvas.width;
        let renderH = canvas.height;

        if (rawVideoW > 0 && rawVideoH > 0) {
          const videoAspect = rawVideoW / rawVideoH;
          const canvasAspect = canvas.width / canvas.height;

          if (videoAspect > canvasAspect) {
            renderW = canvas.width;
            renderH = canvas.width / videoAspect;
            renderY = (canvas.height - renderH) / 2;
          } else {
            renderH = canvas.height;
            renderW = canvas.height * videoAspect;
            renderX = (canvas.width - renderW) / 2;
          }
        }

        boxes.forEach((box) => {
          const coords = Array.isArray(box?.coords) ? box.coords : null;
          if (!coords || coords.length < 4) return;

          let [x1, y1, x2, y2] = coords.map((v: any) => Number(v));
          if (![x1, y1, x2, y2].every(Number.isFinite)) return;

          const isNormalized = x2 <= 1.5 && y2 <= 1.5 && x1 >= 0 && y1 >= 0;
          if (isNormalized) {
            x1 *= rawVideoW || 1;
            y1 *= rawVideoH || 1;
            x2 *= rawVideoW || 1;
            y2 *= rawVideoH || 1;
          }

          const sourceW = rawVideoW || inferredSourceW;
          const sourceH = rawVideoH || inferredSourceH;
          const scaleX = renderW / sourceW;
          const scaleY = renderH / sourceH;

          const drawX = renderX + x1 * scaleX;
          const drawY = renderY + y1 * scaleY;
          const drawW = Math.max(2, (x2 - x1) * scaleX);
          const drawH = Math.max(2, (y2 - y1) * scaleY);

          const id = Number(box.track_id || 0);
          const color = `hsl(${(id * 50) % 360}, 80%, 50%)`;
          const label = `${box.msg || box.type || "报警"} #${id}`;

          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(drawX, drawY, drawW, drawH);

          ctx.font = "14px Arial";
          const textWidth = ctx.measureText(label).width;
          const tagW = Math.min(Math.max(textWidth + 12, 90), 280);
          const tagH = 22;
          const tagX = Math.max(0, Math.min(drawX, canvas.width - tagW));
          const tagY = Math.max(0, drawY - tagH - 2);

          ctx.fillStyle = color;
          ctx.fillRect(tagX, tagY, tagW, tagH);
          ctx.fillStyle = "white";
          ctx.fillText(label, tagX + 6, tagY + 15);
        });
      }, []);

  useEffect(() => {
    if (!maximizedVideo || !streamUrl || !alarmBoxes.length) {
      const canvas = aiCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const redraw = () => drawBoxes(alarmBoxes);
    redraw();

    // 初始几秒重复重绘，覆盖视频元数据异步加载导致的坐标偏移
    const warmupTimer = window.setInterval(redraw, 400);
    const stopWarmupTimer = window.setTimeout(() => {
      window.clearInterval(warmupTimer);
    }, 3000);

    const resizeHandler = () => redraw();
    window.addEventListener("resize", resizeHandler);

    return () => {
      window.removeEventListener("resize", resizeHandler);
      window.clearInterval(warmupTimer);
      window.clearTimeout(stopWarmupTimer);
    };
  }, [alarmBoxes, drawBoxes, maximizedVideo, streamUrl]);

    if (loading)
      return (
        <div className="h-full flex items-center justify-center text-blue-500">
          <Loader className="animate-spin" size={48} />
        </div>
      );

  return (
      <div className="h-full flex flex-col gap-4 p-4 text-slate-100 bg-[radial-gradient(circle_at_12%_8%,rgba(56,189,248,0.20),transparent_32%),radial-gradient(circle_at_86%_2%,rgba(59,130,246,0.22),transparent_30%),linear-gradient(135deg,#020617,#0b1f3f_45%,#102a5e)]">
        
        {/* 顶部筛选栏 */}
        <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-3 shadow-xl">
          <div className="flex items-center gap-2 flex-wrap">
            {/* 搜索框 */}
            <div className="flex-1 min-w-[140px]">
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-cyan-400" />
                <input
                  type="text"
                  placeholder="搜索设备..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-md pl-7 pr-7 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

  {/* 公司筛选 */}
  <select
      value={selectedCompany}
      onChange={(e) => setSelectedCompany(e.target.value)}
      className="w-32 bg-slate-800/50 border border-slate-700 rounded-md px-2 py-1.5 text-sm"
  >
      {companies.map(c => (
          <option key={c} value={c}>
              {c === 'all' ? '所有公司' : c}
          </option>
      ))}
  </select>

  {/* 项目筛选 */}
  <select
      value={selectedProject}
      onChange={(e) => setSelectedProject(e.target.value)}
      className="w-32 bg-slate-800/50 border border-slate-700 rounded-md px-2 py-1.5 text-sm"
  >
      {projects.map(p => (
      <option key={p} value={p}>
          {p === 'all' ? '所有项目' : p}
      </option>
  ))}
  </select>

  {/* 设备类型筛选 */}
  <select
      value={selectedDeviceType}
      onChange={(e) => setSelectedDeviceType(e.target.value)}
      className="w-32 bg-slate-800/50 border border-slate-700 rounded-md px-2 py-1.5 text-sm"
  >
      <option value="all">所有设备类型</option>
      <option value="bullet_camera">枪机</option>
      <option value="dome_camera">球机</option>
      <option value="body_camera">执法记录仪</option>
      <option value="drone">无人机</option>
  </select>

  {/* 自定义设备选择按钮 */}
  <div className="relative">
  <button
      onClick={() => setShowDeviceSelector(!showDeviceSelector)}
      className="device-selector-btn px-3 py-1.5 text-sm bg-cyan-500/20 text-cyan-300 rounded-md hover:bg-cyan-500/30 flex items-center gap-2"
  >
      <Camera size={14} />
      选择设备 ({selectedDevices.length}/{devices.length})
  </button>
  </div>

  {showDeviceSelector && ReactDOM.createPortal(
      <div 
          className="fixed bg-slate-800 border border-slate-700 rounded-md shadow-xl z-[9999] w-64 max-h-96 overflow-y-auto p-2"
          style={{
              top: (() => {
                  const btn = document.querySelector('.device-selector-btn');
                  if (btn) {
                      const rect = btn.getBoundingClientRect();
                      return rect.bottom + 4;
                  }
                  return 100;
              })(),
              left: (() => {
                  const btn = document.querySelector('.device-selector-btn');
                  if (btn) {
                      const rect = btn.getBoundingClientRect();
                      return rect.left;
                  }
                  return 20;
              })()
          }}
      >
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-700">
              <span className="text-xs text-slate-400">选择要显示的摄像头</span>
              <div className="flex gap-2">
                  <button onClick={() => setSelectedDevices(devices.map(d => d.id))} className="text-xs text-cyan-400">全选</button>
                  <button onClick={() => setSelectedDevices([])} className="text-xs text-slate-400">清空</button>
              </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
              {devices.map(device => (
                  <label key={device.id} className="flex items-center gap-2 p-2 hover:bg-slate-700 rounded cursor-pointer">
                      <input
                          type="checkbox"
                          checked={selectedDevices.includes(device.id)}
                          onChange={(e) => {
                              if (e.target.checked) {
                                  setSelectedDevices([...selectedDevices, device.id]);
                              } else {
                                  setSelectedDevices(selectedDevices.filter(id => id !== device.id));
                              }
                          }}
                          className="rounded"
                      />
                      <span className="text-sm text-slate-200">{device.name}</span>
                      <span className={`text-xs ${device.status === 'online' ? 'text-green-400' : 'text-slate-500'}`}>
                          {device.status === 'online' ? '●' : '○'}
                      </span>
                  </label>
              ))}
          </div>
      </div>,
      document.body
  )}

            {/* ✅ 智能监控配置按钮 - 放在这里 */}
            <button
              onClick={async () => {
                if (maximizedVideo) {
                  await refreshDeviceRules(maximizedVideo.id);
                }
                setShowSmartConfig(true);
              }}
              className="px-3 py-1.5 text-sm bg-purple-500/20 text-purple-300 rounded-md hover:bg-purple-500/30 flex items-center gap-2"
            >
              <Shield size={14} />
              智能监控配置
            </button>

            {/* 重置筛选 */}
            {(selectedCompany !== 'all' || selectedProject !== 'all' || selectedDevices.length > 0 || searchTerm) && (
              <button
                onClick={() => {
                  setSelectedCompany('all');
                  setSelectedProject('all');
                  setSelectedDevices([]);
                  setSearchTerm('');
                }}
                className="px-2 py-1.5 text-sm text-cyan-400 hover:text-cyan-300"
              >
                重置
              </button>
            )}
          </div>
        </div>

        {/* 卡片网格视图 */}
        <div className="flex-1 overflow-hidden flex flex-col h-full">
          <div className="flex justify-between items-center mb-3 flex-shrink-0">
            <h3 className="text-lg font-bold text-cyan-300">
              监控设备 
              <span className="text-sm text-slate-400 ml-2">(共{filteredDevicesForGrid.length}个设备)</span>
            </h3>
            <div className="flex gap-2 items-center">
    <label className="text-xs text-slate-300 font-medium">每页视窗数：</label>
    <div className="flex gap-1">
      {gridOptions.map(count => (
        <button
          key={count}
          onClick={() => { setItemsPerPage(count); setCurrentPage(1); }}
          className={`w-8 h-6 text-xs rounded transition-all ${
            itemsPerPage === count
              ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
              : 'border border-blue-300/30 bg-slate-950/65 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          {count}
        </button>
      ))}
    </div>
    <span className="text-xs text-slate-400">个</span>
  </div>
          </div>
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: "1rem",
    }}
    className="flex-1"
  >
    {paginatedDevices.map((device) => (
      <div
        key={device.id}
        className="relative group overflow-hidden rounded-md border border-blue-300/20 bg-slate-900/55 shadow-[inset_0_0_18px_rgba(14,165,233,0.08),0_6px_14px_rgba(2,6,23,.5)] hover:border-cyan-300/45 transition-colors"
      >
        <div
          className="relative w-full pt-[56.25%] bg-black"
          onDoubleClick={() => handleVideoDoubleClick(device)}
        >
          <div className="absolute inset-0">
  {previewStreams[device.id] ? (
    <VideoPlayer
      key={previewStreams[device.id].url}
      src={previewStreams[device.id].url}
      playType={previewStreams[device.id].play_type}
      accessToken={previewStreams[device.id].access_token}
    />
            ) : previewLoading[device.id] ? (
              <div className="h-full w-full flex items-center justify-center text-slate-300 text-sm">
                正在加载视频流...
              </div>
            ) : previewErrors[device.id] ? (
              <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-xs text-rose-300">
                <span>{previewErrors[device.id]}</span>
                <button
                  className="px-3 py-1 bg-rose-500 text-white rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadPreviewStream(device, true);
                  }}
                >
                  重试
                </button>
              </div>
            ) : (
              <button
                className="h-full w-full flex items-center justify-center text-slate-300 text-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  loadPreviewStream(device, true);
                }}
              >
                点击加载预览
              </button>
            )}
          </div>
        </div>
  <div className="absolute bottom-2 right-2 flex items-center gap-2 z-10">
    <span className={`w-2 h-2 rounded-full ${device.status === "online" ? "bg-green-500 animate-pulse" : "bg-slate-500"}`} />
    <span className="text-base bg-slate-900/75 backdrop-blur px-5 py-2 rounded text-slate-100 border border-cyan-300/20 shadow-sm">
      {device.name}
    </span>
  </div>
        <div className="absolute bottom-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            onClick={() => handleShowStream(device)}
            className="p-1.5 bg-cyan-500 hover:bg-cyan-400 rounded text-slate-900 shadow-lg transition-all"
            title="全屏播放"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
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

        {/* 原有的添加设备弹窗 - 完整保留 */}
        {showAddModal && (
          <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[500px] p-6 shadow-2xl text-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2 text-slate-100">
                  <Settings size={18} className="text-cyan-300" /> 添加监控设备
                </h3>
                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-200 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">设备名称 <span className="text-red-500">*</span></label>
                  <input className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={newDeviceForm.name} onChange={(e) => setNewDeviceForm({ ...newDeviceForm, name: e.target.value })} placeholder="例如：北门入口摄像头" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">IP 地址</label>
                  <input className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={newDeviceForm.ip_address} onChange={(e) => setNewDeviceForm({ ...newDeviceForm, ip_address: e.target.value })} placeholder="192.168.1.100" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">端口</label>
                  <input type="number" className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={newDeviceForm.port} onChange={(e) => setNewDeviceForm({ ...newDeviceForm, port: parseInt(e.target.value) || 80 })} placeholder="80" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">用户名</label>
                  <input className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={newDeviceForm.username || ""} onChange={(e) => setNewDeviceForm({ ...newDeviceForm, username: e.target.value })} placeholder="请输入登录账号" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">密码</label>
                  <input type="password" className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={newDeviceForm.password || ""} onChange={(e) => setNewDeviceForm({ ...newDeviceForm, password: e.target.value })} placeholder="******" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">流地址（RTSP/HLS）</label>
                  <input className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={newDeviceForm.stream_url || ""} onChange={(e) => setNewDeviceForm({ ...newDeviceForm, stream_url: e.target.value })} placeholder="示例：rtsp://账号:密码@192.168.1.100:554/..." />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">备注</label>
                  <input className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={newDeviceForm.remark || ""} onChange={(e) => setNewDeviceForm({ ...newDeviceForm, remark: e.target.value })} placeholder="位置描述或其他信息" />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={handleAddDevice} className="flex-1 bg-cyan-500 hover:bg-cyan-400 py-2 rounded text-sm font-bold text-slate-900 transition-colors shadow-md">保存配置</button>
                <button onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded text-sm text-slate-100 transition-colors">取消</button>
              </div>
            </div>
          </div>
        )}

        {/* 原有的编辑设备弹窗 - 完整保留 */}
        {showEditModal && (
          <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[500px] p-6 shadow-2xl text-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2 text-slate-100"><Settings size={18} className="text-cyan-300" /> 编辑监控设备</h3>
                <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-200 transition-colors"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">设备名称 <span className="text-red-500">*</span></label>
                  <input className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={editDeviceForm.name} onChange={(e) => setEditDeviceForm({ ...editDeviceForm, name: e.target.value })} placeholder="例如：北门入口摄像头" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">IP 地址</label>
                  <input className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={editDeviceForm.ip_address} onChange={(e) => setEditDeviceForm({ ...editDeviceForm, ip_address: e.target.value })} placeholder="192.168.1.100" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">端口</label>
                  <input type="number" className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={editDeviceForm.port} onChange={(e) => setEditDeviceForm({ ...editDeviceForm, port: parseInt(e.target.value) || 80 })} placeholder="80" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">用户名</label>
                  <input className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={editDeviceForm.username || ""} onChange={(e) => setEditDeviceForm({ ...editDeviceForm, username: e.target.value })} placeholder="请输入登录账号" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">密码</label>
                  <input type="password" className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={editDeviceForm.password || ""} onChange={(e) => setEditDeviceForm({ ...editDeviceForm, password: e.target.value })} placeholder="******" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">流地址（RTSP/HLS）</label>
                  <input className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={editDeviceForm.stream_url || ""} onChange={(e) => setEditDeviceForm({ ...editDeviceForm, stream_url: e.target.value })} placeholder="示例：rtsp://账号:密码@192.168.1.100:554/..." />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">备注</label>
                  <input className="w-full bg-slate-950/60 border border-blue-300/30 rounded p-2 text-sm focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30 outline-none text-slate-100" value={editDeviceForm.remark || ""} onChange={(e) => setEditDeviceForm({ ...editDeviceForm, remark: e.target.value })} placeholder="位置描述或其他信息" />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={handleUpdateDevice} className="flex-1 bg-cyan-500 hover:bg-cyan-400 py-2 rounded text-sm font-bold text-slate-900 transition-colors shadow-md">更新配置</button>
                <button onClick={() => setShowEditModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded text-sm text-slate-100 transition-colors">取消</button>
              </div>
            </div>
          </div>
        )}

{showSmartConfig && (
  <SmartMonitoringConfig
    devices={devices}
    onClose={() => setShowSmartConfig(false)}
    onSuccess={() => {
      if (maximizedVideo) {
        refreshDeviceRules(maximizedVideo.id);
      }
      setShowSmartConfig(false);
    }}
    initialSelectedDeviceIds={maximizedVideo ? [maximizedVideo.id] : []}
    initialSelectedAlgoIds={activeAlgos}  // ✅ 传入当前已配置的算法
  />
)}

        {/* 原有的全屏播放弹窗 - 完整保留 */}
        {maximizedVideo && (
          <div className="fixed inset-0 z-[200] bg-[radial-gradient(circle_at_15%_8%,rgba(34,211,238,.15),transparent_35%),linear-gradient(140deg,#020617,#0b1f3f_50%,#102a5e)] flex flex-col p-4 gap-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-3 text-slate-100">
                {maximizedVideo.name}
                <span className="text-sm font-mono font-normal text-slate-300 bg-slate-900/75 px-2 rounded border border-blue-300/20">{maximizedVideo.ip_address}</span>
              </h2>
              <button onClick={() => { setMaximizedVideo(null); setStreamUrl(null); setStreamInfo(null); }} className="p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <div className="flex-1 flex gap-4 min-h-0">
              <div className="flex-1 flex flex-col bg-slate-900/65 rounded-lg border border-blue-300/25 overflow-hidden">
                {streamUrl ? (
                  <>
                    <div className="p-3 bg-blue-500/12 border-b border-blue-300/25 text-sm text-cyan-100">
                      <div className="flex items-center gap-2 font-semibold"><MonitorPlay size={18} /> 流信息</div>
                      <code className="mt-2 block text-xs bg-slate-950/70 p-2 rounded border border-blue-300/25 break-all text-slate-200 max-h-20 overflow-auto vc-scrollbar">{streamUrl}</code>
                    </div>
                    <div className="flex-1 flex items-center justify-center bg-black relative min-h-0">
                      <div className="relative w-full h-full bg-slate-900" 
                      onDoubleClick={() => { setMaximizedVideo(null); setStreamUrl(null);setStreamInfo(null);  }}
                      >
                        
                        <VideoPlayer
    src={streamUrl}
    playType={streamInfo?.play_type}
    accessToken={streamInfo?.access_token}
    videoId={maximizedVideo?.id}
    onError={handlePlayerError}
  />
                        <canvas id="aiCanvas" ref={aiCanvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
                      <div className="absolute top-28 left-16 z-20 pointer-events-none flex flex-col gap-1.5 max-w-[45vw] text-black text-3xl font-bold leading-8 ">
                          <div className="truncate">{maximizedVideo.name || ""}</div>
                          <div className="truncate">{maximizedVideo.remark?.trim() || ""}</div>
                          <div className="truncate">累计工作时长：{formatWorkDuration(currentWorkDurationSeconds)}</div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : fullScreenStreamLoading ? (
                  <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-300">
                    <Loader className="animate-spin text-cyan-300" size={48} />
                    <div className="text-sm">正在获取视频流，请稍候...</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-300">
                    <AlertCircle className="text-rose-300" size={28} />
                    <div className="text-sm">{fullScreenStreamError || '暂无可用视频流'}</div>
                    <button
                      onClick={() => maximizedVideo && handleShowStream(maximizedVideo)}
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 rounded text-slate-900 text-sm font-semibold"
                    >
                      重新拉流
                    </button>
                  </div>
                )}
              </div>
              {/* {streamUrl && ( */}
                <div className="w-80 flex flex-col gap-3 h-full">
                  {/* AI 智脑控制先注释掉 */}
                  <div className="bg-slate-900/75 rounded-lg border border-blue-300/2 5 overflow-y-auto shadow-lg flex-1 vc-scrollbar">
                    <PTZControlPanel video={maximizedVideo} onSuccess={handlePTZSuccess} onError={handlePTZError} />
                  </div>
                  {/* <div className="bg-slate-900/75 rounded-lg border border-blue-300/25 p-4 shadow-lg shrink-0"> */}
                    {/* <div className="flex items-center gap-2 mb-3 text-slate-100 font-semibold"><Save size={16} className="text-cyan-300" /> 回放保存</div>
                    <div className="space-y-3">
                      <div><label className="text-xs text-slate-300 block mb-1">开始时间</label><input type="datetime-local" value={playbackStartTime} onChange={(e) => setPlaybackStartTime(e.target.value)} className="w-full bg-slate-950/65 border border-blue-300/25 rounded p-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-400/30" /></div>
                      <div><label className="text-xs text-slate-300 block mb-1">结束时间</label><input type="datetime-local" value={playbackEndTime} onChange={(e) => setPlaybackEndTime(e.target.value)} className="w-full bg-slate-950/65 border border-blue-300/25 rounded p-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-400/30" /></div>
                      <button onClick={handleSavePlayback} disabled={playbackSaving} className="w-full py-2 rounded bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-slate-900 text-sm font-bold transition-colors flex items-center justify-center gap-2">{playbackSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}{playbackSaving ? "保存中..." : "保存当前回放时段"}</button>
                      {playbackSavedPath && (<div className="text-[11px] text-emerald-200 break-all bg-emerald-500/10 border border-emerald-400/20 rounded p-2">已保存: {playbackSavedPath}</div>)}
                    </div> */}
                  {/* </div> */}
                </div>
              {/* )} */}
            </div>
          </div>
        )}
      </div>
    );}