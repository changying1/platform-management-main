import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Search, Filter, Plus, MapPin, Users, AlertTriangle, Info, ChevronDown, X, Circle, Hexagon, Bug, MousePointer2, Navigation, Play, Pause, AlertCircle, ShieldAlert } from "lucide-react";
import { hasStoredPermission } from "../../src/utils/permissions";
import { useFenceManager } from "./hooks/useFenceManager";
import { useFenceMap } from "./hooks/useFenceMap";
import { FenceSidebar } from "./components/FenceSidebar";
import { FenceDrawTool } from "./components/FenceDrawTool";
import { FenceRulePanel } from "./components/FenceRulePanel";
import { FenceAddModal } from "./components/FenceAddModal";
import { FenceFilterBar } from "./components/FenceFilterBar";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";
import { SuccessNotification } from "./components/SuccessNotification";
import { API_BASE_URL, getAuthHeaders, withAuthTokenParam } from "../../src/api/config";
import { toGridAreas, type GridArea } from "../../src/utils/gridAreas";
import { isHeadquartersScope, isProjectScope as isStoredProjectScope, readStoredAuth } from "../../src/utils/authScope";

import { FenceData, getFenceDeviceAlarmKeys } from "./types";

declare global {
  interface Window {
    AMap?: any;
  }
}

type DrawTool = 'brush' | 'rectangle' | 'circle' | 'polygon';
const HISTORICAL_FENCE_STORAGE_KEY = 'fence:historical-map-view';
const authFetch = (input: RequestInfo | URL, init: RequestInit = {}) =>
  fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...getAuthHeaders(),
    },
    credentials: "include",
  });

const text = (value: any) => String(value ?? "").trim();
const normalize = (value: any) => text(value).toLowerCase();
const hasFenceViolation = (
  device: { device_id?: any; device_code?: any; device_serial?: any; phone_num?: any; raw_id?: any },
  violationTypes: Record<string, any>
) => getFenceDeviceAlarmKeys(device as any).some((key) => Boolean(violationTypes[key]));

  interface FenceAlarm {
  id: number;
  device_id: string;
  fence_id: string;
  alarm_type: string;
  severity: string;
  timestamp: string;
  description: string;
  location: string;
  person_name: string;
}

// 系统设置接口
interface SystemSettings {
  fenceGracePeriod: number;
  alarmPopup?: boolean;
  alarmSound?: boolean;
  alarmSoundType?: "none" | "standard" | "emergency";
  alarmRepeatInterval?: number;
  alarmSevereFlash?: boolean;
}

const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  fenceGracePeriod: 3,
  alarmPopup: true,
  alarmSound: true,
  alarmSoundType: "standard",
  alarmRepeatInterval: 5,
  alarmSevereFlash: false,
};

type HistoricalFenceView = {
  logId?: string | number;
  logTime?: string;
  action?: string;
  targetName?: string;
  versionLabel?: string;
  fence: FenceData;
};

type StoredProjectScope = {
  isHeadquartersScope: boolean;
  isProjectScope: boolean;
  projectId: string;
};

const readStoredProjectScope = (): StoredProjectScope => {
  const auth = readStoredAuth();
  const projectId = text(localStorage.getItem("project_id") || auth.project_id);

  return {
    isHeadquartersScope: isHeadquartersScope(auth),
    isProjectScope: isStoredProjectScope(auth),
    projectId,
  };
};

const projectIdMatches = (left: any, right: any) => {
  const a = text(left);
  const b = text(right);
  if (!a || !b) return false;
  return a === b || a.replace(/^PRJ-/i, "") === b.replace(/^PRJ-/i, "");
};

const normalizeLatLngPoint = (value: any): [number, number] | null => {
  const raw = typeof value === "string" && value.trim()
    ? (() => {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    })()
    : value;

  if (Array.isArray(raw) && raw.length >= 2) {
    const first = Number(raw[0]);
    const second = Number(raw[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second) || (first === 0 && second === 0)) return null;
    if (first >= 3 && first <= 54 && second >= 73 && second <= 136) return [first, second];
    if (second >= 3 && second <= 54 && first >= 73 && first <= 136) return [second, first];
  }

  if (raw && typeof raw === "object") {
    const lat = Number(raw.lat ?? raw.latitude);
    const lng = Number(raw.lng ?? raw.lon ?? raw.longitude);
    return normalizeLatLngPoint([lat, lng]);
  }

  return null;
};

const projectSummaryPoint = (project: any): [number, number] | null =>
  normalizeLatLngPoint(project?.center) ||
  normalizeLatLngPoint([project?.latitude ?? project?.lat, project?.longitude ?? project?.lng]);

// 获取系统设置
const fetchSystemSettings = async (): Promise<SystemSettings> => {
  try {
      const response = await authFetch(`${API_BASE_URL}/admin/settings`);
    if (!response.ok) {
      console.warn("获取系统设置失败，使用默认值");
      return { fenceGracePeriod: 3 }; // 默认3秒延迟
    }
    const data = await response.json();
    return {
      fenceGracePeriod: data.fenceGracePeriod !== undefined ? data.fenceGracePeriod : 3
    };
  } catch (error) {
    console.warn("获取系统设置失败（后端未连接），使用默认值:", error);
    return { fenceGracePeriod: 3 }; // 默认3秒延迟
  }
};

const fetchFullSystemSettings = async (): Promise<SystemSettings> => {
  try {
    const response = await authFetch(`${API_BASE_URL}/admin/settings`);
    if (!response.ok) return DEFAULT_SYSTEM_SETTINGS;
    const data = await response.json();
    return {
      ...DEFAULT_SYSTEM_SETTINGS,
      fenceGracePeriod: data.fenceGracePeriod !== undefined ? data.fenceGracePeriod : DEFAULT_SYSTEM_SETTINGS.fenceGracePeriod,
      alarmPopup: data.alarmPopup !== undefined ? data.alarmPopup : DEFAULT_SYSTEM_SETTINGS.alarmPopup,
      alarmSound: data.alarmSound !== undefined ? data.alarmSound : DEFAULT_SYSTEM_SETTINGS.alarmSound,
      alarmSoundType: data.alarmSoundType || DEFAULT_SYSTEM_SETTINGS.alarmSoundType,
      alarmRepeatInterval: data.alarmRepeatInterval !== undefined ? data.alarmRepeatInterval : DEFAULT_SYSTEM_SETTINGS.alarmRepeatInterval,
      alarmSevereFlash: data.alarmSevereFlash !== undefined ? data.alarmSevereFlash : DEFAULT_SYSTEM_SETTINGS.alarmSevereFlash,
    };
  } catch (error) {
    console.warn("Failed to load full system settings, using defaults", error);
    return DEFAULT_SYSTEM_SETTINGS;
  }
};

const parseMaybeJson = (value: any) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const toLatLngPair = (value: any): [number, number] | null => {
  if (Array.isArray(value) && value.length >= 2) {
    const first = Number(value[0]);
    const second = Number(value[1]);
    if (Number.isFinite(first) && Number.isFinite(second)) return [first, second];
  }
  if (value && typeof value === "object") {
    const lat = Number(value.lat ?? value.latitude);
    const lng = Number(value.lng ?? value.lon ?? value.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  }
  return null;
};

const normalizeFenceSeverity = (value: any): FenceData["severity"] => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["severe", "high", "critical", "严重"].includes(raw)) return "severe";
  if (["risk", "medium", "warning", "风险", "中", "中等"].includes(raw)) return "risk";
  return "normal";
};

const fenceSeverityToAlarmLevel = (value: any): "low" | "medium" | "high" => {
  const severity = normalizeFenceSeverity(value);
  if (severity === "severe") return "high";
  if (severity === "risk") return "medium";
  return "low";
};

const normalizeHistoricalFence = (snapshot: any): FenceData | null => {
  if (!snapshot || typeof snapshot !== "object") return null;

  const geometry = snapshot.geometry || {};
  const coordinates = parseMaybeJson(snapshot.coordinates_json);
  const rawShape = String(snapshot.shape || snapshot.type || "").toLowerCase();
  const pointsSource = snapshot.points || geometry.points || (rawShape !== "circle" ? coordinates : null);
  const points = Array.isArray(pointsSource)
    ? pointsSource.map(toLatLngPair).filter(Boolean) as [number, number][]
    : [];
  const center = toLatLngPair(snapshot.center || geometry.center || (rawShape === "circle" ? coordinates : null));
  const isCircle = rawShape === "circle" || snapshot.type === "Circle";

  if (isCircle && !center) return null;
  if (!isCircle && points.length < 3) return null;

  return {
    id: String(snapshot.fence_id || snapshot.id || snapshot.mongo_id || `history-${Date.now()}`),
    name: String(snapshot.name || "历史围栏"),
    company: String(snapshot.company || ""),
    project: String(snapshot.project || ""),
    grid: String(snapshot.grid || snapshot.grid_name || ""),
    grid_name: String(snapshot.grid_name || snapshot.grid || ""),
    branch_id: snapshot.branch_id ?? null,
    project_id: snapshot.project_id ?? null,
    grid_id: snapshot.grid_id ?? null,
    team_id: snapshot.team_id ?? null,
    type: isCircle ? "Circle" : "Polygon",
    behavior: snapshot.behavior === "No Exit" ? "No Exit" : "No Entry",
    severity: normalizeFenceSeverity(snapshot.severity || snapshot.alarm_type),
    schedule: {
      start: String(snapshot.schedule?.start || snapshot.scheduleStart || snapshot.effective_time?.start || snapshot.createdAt || new Date().toISOString()),
      end: String(snapshot.schedule?.end || snapshot.scheduleEnd || snapshot.effective_time?.end || snapshot.updatedAt || new Date().toISOString()),
    },
    effective_time: typeof snapshot.effective_time === "string" ? snapshot.effective_time : "00:00-23:59",
    center: center || undefined,
    points: points.length > 0 ? points : undefined,
    radius: Number(snapshot.radius || geometry.radius || 100),
    isActive: snapshot.is_active ?? snapshot.isActive ?? false,
    createdAt: String(snapshot.createdAt || ""),
    updatedAt: String(snapshot.updatedAt || ""),
  };
};

const readHistoricalFenceView = (): HistoricalFenceView | null => {
  try {
    const raw = localStorage.getItem(HISTORICAL_FENCE_STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(HISTORICAL_FENCE_STORAGE_KEY);
    const payload = JSON.parse(raw);
    const fence = normalizeHistoricalFence(payload.snapshot);
    if (!fence) return null;
    return {
      logId: payload.logId,
      logTime: payload.logTime,
      action: payload.action,
      targetName: payload.targetName,
      versionLabel: payload.versionLabel,
      fence,
    };
  } catch {
    localStorage.removeItem(HISTORICAL_FENCE_STORAGE_KEY);
    return null;
  }
};

export default function FenceManagement() {
  const [editingFenceId, setEditingFenceId] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [gridAreas, setGridAreas] = useState<GridArea[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<any[]>([]);
  const canCreateFence = hasStoredPermission("fence.create");
  const canDeleteFence = hasStoredPermission("fence.delete");
  const [selectedFence, setSelectedFence] = useState<FenceData | null>(null);
  const [violationTypes, setViolationTypes] = useState<Record<string, "No Entry" | "No Exit" | null>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [pendingFenceData, setPendingFenceData] = useState<any>(null); 
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; fenceId: string | null }>({ show: false, fenceId: null });
  const [showSuccess, setShowSuccess] = useState(false);
  const [historicalFenceView, setHistoricalFenceView] = useState<HistoricalFenceView | null>(null);
  
  // 新增：WebSocket相关状态
  const [fenceAlarm, setFenceAlarm] = useState<FenceAlarm | null>(null);
  
  // 新增：系统设置状态（用于越界判定延迟）
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({ fenceGracePeriod: 0 });
  // 新增：延迟警报定时器引用
  const alarmTimersRef = useRef<Map<string, number>>(new Map());
  const alarmWsRef = useRef<WebSocket | null>(null);
  const alarmReconnectTimerRef = useRef<number | null>(null);
  const alarmCloseTimerRef = useRef<number | null>(null);
  const lastAlarmSoundAtRef = useRef<Record<string, number>>({});
  // 新增：退出调试模式后的冷却期标志（用于延迟警报）
  const [coolingDown, setCoolingDown] = useState(false);
  // 新增：同步冷却期标志（解决React状态异步更新问题）
  const coolingDownRef = useRef(false);
  
  // 新增：初始化系统设置
  useEffect(() => {
    const loadSettings = async () => {
      const settings = await fetchFullSystemSettings();
      setSystemSettings({ ...DEFAULT_SYSTEM_SETTINGS, ...settings });
    };
    loadSettings();
    
    // 定期刷新设置（可选）
    const interval = setInterval(loadSettings, 60000);
    return () => clearInterval(interval);
  }, []);
  
  // 获取围栏管理相关数据和方法新增：获取WebSocket URL
  const getAlarmWebSocketUrl = () => {
    try {
      const apiUrl = new URL(API_BASE_URL);
      const wsProtocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
      return withAuthTokenParam(`${wsProtocol}//${apiUrl.host}/ws/alarm`);
    } catch {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return withAuthTokenParam(`${wsProtocol}//${window.location.host}/ws/alarm`);
    }
  };

  const [showDrawToolbar, setShowDrawToolbar] = useState(false);
  const [activeDrawTool, setActiveDrawTool] = useState<DrawTool>('brush');
  const [showRulePanel, setShowRulePanel] = useState(false);
  const [tempShape, setTempShape] = useState<any>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);

  const {
    fences,
    filteredFences,
    teams,
    organizationTree,
    devices,
    filteredDevices,
    regions,
    stats,
    filter,
    setFilter,
    drawingMode,
    setDrawingMode,
    tempPoints,
    setTempPoints,
    tempCenter,
    setTempCenter,
    addFence,
    updateFence,
    deleteFence,
    getFenceColor,
    debugMode,
    setDebugMode,
    updateDevicePosition,
    saveDevicePosition,
  } = useFenceManager();
  
  // 新增：播放警报音效
  const playAlarmSound = () => {
    if (systemSettings.alarmSound === false || systemSettings.alarmSoundType === "none") return;
    const nowMs = Date.now();
    const repeatMs = Math.max(0, Number(systemSettings.alarmRepeatInterval || 0)) * 60 * 1000;
    const lastSoundAt = lastAlarmSoundAtRef.current.__global || 0;
    if (repeatMs > 0 && nowMs - lastSoundAt < repeatMs) return;
    lastAlarmSoundAtRef.current.__global = nowMs;
    // 创建简单的蜂鸣音（使用Web Audio API）
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioContext.currentTime;
      const isEmergency = systemSettings.alarmSoundType === "emergency";
      const repeatCount = isEmergency ? 6 : 4;
      const baseFrequency = isEmergency ? 1100 : 800;
      const gainValue = isEmergency ? 0.42 : 0.3;
      
      // 创建4个频率的警报音
      for (let i = 0; i < repeatCount; i++) {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        // 快速升降的频率
        osc.frequency.setValueAtTime(baseFrequency + i * 180, now + i * 0.15);
        osc.frequency.setValueAtTime(400 + i * 100, now + i * 0.15 + 0.1);
        
        gain.gain.setValueAtTime(gainValue, now + i * 0.15);
        gain.gain.setValueAtTime(0, now + i * 0.15 + 0.12);
        
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.12);
      }
    } catch (err) {
      console.warn("音频上下文创建失败:", err);
    }
  };

  const triggerFenceAlarm = useCallback((alarm: FenceAlarm) => {
    const alarmLevel = fenceSeverityToAlarmLevel(alarm.severity);
    const isSevere = alarmLevel === "high";
    const now = Date.now();
    const repeatMs = Math.max(0, Number(systemSettings.alarmRepeatInterval || 0)) * 60 * 1000;
    const soundKey = `${alarm.device_id}:${alarm.fence_id}:${alarm.alarm_type}`;
    const lastSoundAt = lastAlarmSoundAtRef.current[soundKey] || 0;

    if (systemSettings.alarmPopup !== false) {
      setFenceAlarm(alarm);
      if (alarmCloseTimerRef.current) {
        window.clearTimeout(alarmCloseTimerRef.current);
      }
      alarmCloseTimerRef.current = window.setTimeout(() => {
        setFenceAlarm(null);
      }, 3000);
    }

    if (repeatMs === 0 || now - lastSoundAt >= repeatMs) {
      playAlarmSound();
      lastAlarmSoundAtRef.current[soundKey] = now;
    }

    if (isSevere && systemSettings.alarmSevereFlash) {
      document.body.classList.add("severe-alarm-flash");
      window.setTimeout(() => document.body.classList.remove("severe-alarm-flash"), 3000);
    }
  }, [systemSettings, playAlarmSound]);

  const buildFenceAlarm = (data: any, deviceId: string): FenceAlarm => ({
    id: data.id,
    device_id: deviceId,
    fence_id: String(data.fence_id),
    alarm_type: data.alarm_type,
    severity: normalizeFenceSeverity(data.severity || data.alarm_type),
    timestamp: data.timestamp,
    description: data.description,
    location: data.location,
    person_name: data.person_name,
  });

  const [mouseLngLat, setMouseLngLat] = useState<[number, number] | null>(null);
  const [collectedPoints, setCollectedPoints] = useState<any[]>([]);
  const collectPollingRef = useRef<number | null>(null);
  const lastAutoFocusedKeywordRef = useRef("");
  const isBrushDrawingRef = useRef(false);
  const brushFinishedRef = useRef(false);
  const circleStartedRef = useRef(false);
  const rectStartedRef = useRef(false);

  const mergeCollectedPoints = useCallback((incomingPoints: any[]) => {
    setCollectedPoints((prev) => {
      const pointMap = new Map<string, any>();

      // 按坐标去重（精度保留6位小数）
      const getPointKey = (point: any) => {
        const lat = typeof point.lat === 'number' ? point.lat.toFixed(6) : String(point.lat);
        const lng = typeof point.lng === 'number' ? point.lng.toFixed(6) : String(point.lng);
        return `${lat},${lng}`;
      };

      prev.forEach((point) => {
        const key = getPointKey(point);
        pointMap.set(key, point);
      });

      incomingPoints.forEach((point) => {
        const key = getPointKey(point);
        const existing = pointMap.get(key);
        pointMap.set(key, existing ? { ...existing, ...point } : point);
      });

      return Array.from(pointMap.values());
    });
  }, []);

  const stopCollectPolling = useCallback(() => {
    if (collectPollingRef.current !== null) {
      window.clearInterval(collectPollingRef.current);
      collectPollingRef.current = null;
    }
  }, []);

  const fetchCollectedPoints = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/fence/collect/points`);
      if (!res.ok) return;
      const data = await res.json();
      mergeCollectedPoints(data.points || []);
    } catch (e) {
      console.error("获取收集点失败:", e);
    }
  }, [mergeCollectedPoints]);

  const startCollectMode = useCallback(async () => {
    stopCollectPolling();
    setCollectedPoints([]);

    try {
      await authFetch(`${API_BASE_URL}/fence/collect/points`, { method: "POST" });
    } catch (e) {
      console.error("启动围栏收集失败:", e);
    }

    await fetchCollectedPoints();
    collectPollingRef.current = window.setInterval(() => {
      void fetchCollectedPoints();
    }, 3000);
  }, [fetchCollectedPoints, stopCollectPolling]);

  const endCollectMode = useCallback(async () => {
    stopCollectPolling();
    try {
      await authFetch(`${API_BASE_URL}/fence/collect/points`, { method: "DELETE" });
    } catch (e) {
      console.error("结束围栏收集失败:", e);
    }
    setCollectedPoints([]);
  }, [stopCollectPolling]);

  useEffect(() => {
    return () => {
      stopCollectPolling();
      void authFetch(`${API_BASE_URL}/fence/collect/points`, { method: "DELETE" }).catch(() => {});
    };
  }, [stopCollectPolling]);

  const {
    mapReady,
    mapRef, 
    setCenter,
    renderFences,
    renderGridAreas,
    renderHistoricalFence,
    renderDevices,
    renderDraft,
    bindClick,
    bindDrawEvents,
    setMapDraggable, 
  } = useFenceMap(mapContainerRef);

  useEffect(() => {
    let stopped = false;
    const fetchGridAreas = async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/api/grids/`);
        if (!response.ok) return;
        const data = await response.json();
        if (!stopped) setGridAreas(toGridAreas(Array.isArray(data) ? data : []));
      } catch (error) {
        console.warn("Failed to load grid areas", error);
        if (!stopped) setGridAreas([]);
      }
    };

    fetchGridAreas();
    return () => {
      stopped = true;
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    const fetchProjectSummaries = async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/api/dashboard/summary`);
        if (!response.ok) return;
        const data = await response.json();
        if (!stopped) setProjectSummaries(Array.isArray(data) ? data : []);
      } catch (error) {
        console.warn("Failed to load project summaries", error);
        if (!stopped) setProjectSummaries([]);
      }
    };

    fetchProjectSummaries();
    return () => {
      stopped = true;
    };
  }, []);

  const currentProjectScope = useMemo(readStoredProjectScope, []);
  const scopedProjectNode = useMemo(() => {
    if (!currentProjectScope.isProjectScope || !currentProjectScope.projectId) return null;
    let found: (typeof organizationTree)[number] | null = null;
    const visit = (nodes: typeof organizationTree) => {
      for (const node of nodes) {
        if (
          normalize(node.type) === "project" &&
          (projectIdMatches(node.project_id, currentProjectScope.projectId) ||
            projectIdMatches(node.unit_id, currentProjectScope.projectId) ||
            projectIdMatches(node.id, currentProjectScope.projectId))
        ) {
          found = node;
          return;
        }
        visit(node.children || []);
        if (found) return;
      }
    };
    visit(organizationTree);
    return found;
  }, [currentProjectScope, organizationTree]);
  const scopedProjectFilterValue = scopedProjectNode?.name || currentProjectScope.projectId;
  const initialFocusProject = useMemo(() => {
    const summaryMatch = currentProjectScope.isProjectScope && currentProjectScope.projectId
      ? projectSummaries.find((project) =>
        projectIdMatches(project.id, currentProjectScope.projectId) ||
        projectIdMatches(project.projectId, currentProjectScope.projectId)
      )
      : projectSummaries[0];

    if (summaryMatch) {
      return {
        id: text(summaryMatch.id || summaryMatch.projectId),
        name: text(summaryMatch.name || summaryMatch.projectName),
        point: projectSummaryPoint(summaryMatch),
      };
    }

    if (scopedProjectNode) {
      return {
        id: currentProjectScope.projectId,
        name: scopedProjectNode.name,
        point: null,
      };
    }

    let firstProjectNode: (typeof organizationTree)[number] | null = null;
    const visit = (nodes: typeof organizationTree) => {
      for (const node of nodes) {
        if (normalize(node.type) === "project" && text(node.name)) {
          firstProjectNode = node;
          return;
        }
        visit(node.children || []);
        if (firstProjectNode) return;
      }
    };
    visit(organizationTree);

    if (firstProjectNode) {
      return {
        id: text(firstProjectNode.project_id || firstProjectNode.unit_id || firstProjectNode.id),
        name: text(firstProjectNode.name),
        point: null,
      };
    }

    const projectSource = [
      ...fences.map((item) => ({ id: text(item.project_id), name: text(item.project) })),
      ...devices.map((item: any) => ({ id: text(item.project_id), name: text(item.project) })),
      ...gridAreas.map((item: any) => ({ id: text(item.project_id), name: text(item.project) })),
    ].find((item) => item.id || item.name);

    return projectSource ? { ...projectSource, point: null } : null;
  }, [currentProjectScope.isProjectScope, currentProjectScope.projectId, devices, fences, gridAreas, organizationTree, projectSummaries, scopedProjectNode]);

  const filteredGridAreas = useMemo(() => {
    return gridAreas.filter((area) => {
      if (filter.project) {
        const projectKey = normalize(filter.project);
        const matchesProject =
          normalize(area.project_id) === projectKey ||
          normalize(area.project) === projectKey ||
          normalize(area.project_id).replace(/^prj-/, "") === projectKey.replace(/^prj-/, "");
        if (!matchesProject) return false;
      }
      if (filter.grid) {
        const gridKey = normalize(filter.grid);
        const matchesGrid =
          normalize(area.grid_id) === gridKey ||
          normalize(area.grid) === gridKey ||
          normalize(area.name) === gridKey;
        if (!matchesGrid) return false;
      }
      if (filter.keyword) {
        const keyword = normalize(filter.keyword);
        const matchesKeyword = [area.name, area.grid_id, area.project, area.project_id]
          .some((value) => normalize(value).includes(keyword));
        if (!matchesKeyword) return false;
      }
      return true;
    });
  }, [filter.grid, filter.keyword, filter.project, gridAreas]);

  useEffect(() => {
    const pendingHistoricalFence = readHistoricalFenceView();
    if (pendingHistoricalFence) {
      setHistoricalFenceView(pendingHistoricalFence);
      setSidebarCollapsed(true);
      setSelectedFence(null);
    }
  }, []);

  const companies = ["all", ...new Set(fences.map(f => f.company).filter(Boolean))];
  const organizationProjects = useMemo(() => {
    const names: string[] = [];
    const visit = (nodes: typeof organizationTree) => {
      nodes.forEach(node => {
        if (normalize(node.type) === "project" && text(node.name)) names.push(node.name);
        visit(node.children || []);
      });
    };
    visit(organizationTree);
    return names;
  }, [organizationTree]);
  const projects = filter.company && filter.company !== "all"
    ? ["all", ...new Set([
      ...fences.filter(f => f.company === filter.company).map(f => f.project),
      ...organizationProjects,
    ].filter(Boolean))]
    : ["all", ...new Set([...fences.map(f => f.project), ...organizationProjects].filter(Boolean))];
  const gridNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    const visit = (nodes: typeof organizationTree) => {
      nodes.forEach(node => {
        const nodeType = text(node.type).toLowerCase();
        if (nodeType === "grid") {
          [node.unit_id, node.grid_id, node.id].forEach(id => {
            const key = text(id);
            if (key) map.set(key, node.name);
          });
        }
        visit(node.children || []);
      });
    };
    visit(organizationTree);
    return map;
  }, [organizationTree]);
  const getGridName = React.useCallback((item: { grid?: string; grid_name?: string; grid_id?: string | number | null }) => {
    return text(item.grid_name || item.grid || gridNameById.get(text(item.grid_id)) || item.grid_id);
  }, [gridNameById]);

  const focusFence = useCallback((fence: FenceData) => {
    setSelectedFence(fence);
    if (fence.type === "Circle" && fence.center) {
      setCenter(fence.center);
      mapRef.current?.setZoom(18);
    } else if (fence.type === "Polygon" && fence.points && fence.points.length > 0) {
      const center = fence.points.reduce(
        (acc, p) => [acc[0] + p[0], acc[1] + p[1]],
        [0, 0]
      );
      const centerLat = center[0] / fence.points.length;
      const centerLng = center[1] / fence.points.length;
      setCenter([centerLat, centerLng]);
      mapRef.current?.setZoom(16);
    }
  }, [mapRef, setCenter]);

  const focusDevice = useCallback((device: any) => {
    const lat = Number(device.lat);
    const lng = Number(device.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return false;
    setSelectedFence(null);
    setCenter([lat, lng]);
    mapRef.current?.setZoom(19);
    return true;
  }, [mapRef, setCenter]);

  const initialProjectFocusedRef = useRef(false);
  const headquartersLocationAttemptedRef = useRef(false);

  useEffect(() => {
    if (
      !mapReady ||
      currentProjectScope.isProjectScope ||
      headquartersLocationAttemptedRef.current
    ) return;

    headquartersLocationAttemptedRef.current = true;

    const moveToCurrentLocation = (lat: number, lng: number) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setCenter([lat, lng]);
      mapRef.current?.setZoom(17);
      initialProjectFocusedRef.current = true;
    };

    const locateWithAmap = () => {
      const AMap = window.AMap;
      if (!AMap?.plugin) return;
      AMap.plugin("AMap.Geolocation", () => {
        const geolocation = new AMap.Geolocation({
          enableHighAccuracy: true,
          timeout: 10000,
          convert: true,
          noIpLocate: 0,
          noGeoLocation: 0,
        });
        geolocation.getCurrentPosition((status: string, result: any) => {
          const position = status === "complete" ? result?.position : null;
          if (position) {
            moveToCurrentLocation(Number(position.lat), Number(position.lng));
          } else {
            console.warn("高德定位失败，保留默认地图视角:", result);
          }
        });
      });
    };

    if (!navigator.geolocation || !window.isSecureContext) {
      locateWithAmap();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const AMap = window.AMap;
        if (AMap?.convertFrom) {
          AMap.convertFrom([coords.longitude, coords.latitude], "gps", (status: string, result: any) => {
            const location = status === "complete" ? result?.locations?.[0] : null;
            if (location) {
              moveToCurrentLocation(Number(location.lat), Number(location.lng));
            } else {
              moveToCurrentLocation(coords.latitude, coords.longitude);
            }
          });
          return;
        }
        moveToCurrentLocation(coords.latitude, coords.longitude);
      },
      (error) => {
        console.warn("浏览器定位失败，尝试高德定位:", error.message);
        locateWithAmap();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, [currentProjectScope.isProjectScope, mapReady, mapRef, setCenter]);

  useEffect(() => {
    if (
      !mapReady ||
      !currentProjectScope.isProjectScope ||
      initialProjectFocusedRef.current ||
      !initialFocusProject
    ) return;

    if (currentProjectScope.isProjectScope && scopedProjectFilterValue && (filter.project !== scopedProjectFilterValue || filter.grid)) {
      setFilter({ ...filter, project: scopedProjectFilterValue, grid: undefined });
    }

    const targetPoint = initialFocusProject.point;

    if (targetPoint) {
      setCenter(targetPoint);
      mapRef.current?.setZoom(17);
      initialProjectFocusedRef.current = true;
    }
  }, [
    currentProjectScope,
    filter,
    initialFocusProject,
    mapReady,
    mapRef,
    scopedProjectFilterValue,
    setCenter,
    setFilter,
  ]);

  const gridSources = [
    ...fences.filter(f => (!filter.company || f.company === filter.company) && (!filter.project || text(f.project) === text(filter.project) || projectIdMatches(f.project_id, filter.project))),
    ...devices.filter((d: any) => (!filter.company || d.company === filter.company) && (!filter.project || text(d.project) === text(filter.project) || projectIdMatches(d.project_id, filter.project))),
  ];
  const grids = ["all", ...new Set(gridSources.map(getGridName).filter(Boolean))];

  useEffect(() => {
    if (!mapReady) return;
    const keyword = text(filter.keyword);
    if (!keyword) {
      lastAutoFocusedKeywordRef.current = "";
      return;
    }
    const normalizedKeyword = normalize(keyword);
    const focusKey = `${normalizedKeyword}:${filteredDevices.length}:${filteredFences.length}`;
    if (lastAutoFocusedKeywordRef.current === focusKey) return;

    const matchedDevice = filteredDevices.find((device) =>
      [device.name, device.device_id, device.holder, device.company, device.project, getGridName(device)]
        .some((field) => normalize(field).includes(normalizedKeyword))
    );
    if (matchedDevice && focusDevice(matchedDevice)) {
      lastAutoFocusedKeywordRef.current = focusKey;
      return;
    }

    const matchedFence = filteredFences.find((fence) =>
      [fence.name, fence.company, fence.project, getGridName(fence)]
        .some((field) => normalize(field).includes(normalizedKeyword))
    );
    if (matchedFence) {
      focusFence(matchedFence);
      lastAutoFocusedKeywordRef.current = focusKey;
    }
  }, [filter.keyword, filteredDevices, filteredFences, focusDevice, focusFence, getGridName, mapReady]);

const fetchPendingFenceAlarms = useCallback(async () => {
  try {
    const res = await authFetch(`${API_BASE_URL}/alarms/fence/pending-devices`);
    if (res.status === 404) {
      setViolationTypes({});
      return;
    }
    if (!res.ok) return;

    const data = await res.json();
    setViolationTypes(data && typeof data === "object" ? data : {});
  } catch (e) {
    console.error("同步围栏告警状态失败:", e);
  }
}, []);

const fenceStats = React.useMemo(() => {
  const violatingDevices = new Set<string>();
  filteredDevices.forEach((device) => {
    if (hasFenceViolation(device, violationTypes)) {
      violatingDevices.add(String(device.device_id));
    }
  });

  return {
    ...stats,
    totalDevices: filteredDevices.length,
    onlineDevices: filteredDevices.filter((device) => device.status === "online").length,
    violations: violatingDevices.size,
  };
}, [filteredDevices, stats, violationTypes]);

useEffect(() => {
  void fetchPendingFenceAlarms();
  const handleAlarmStatusChanged = () => {
    void fetchPendingFenceAlarms();
  };
  window.addEventListener("alarmStatusChanged", handleAlarmStatusChanged);
  const timer = window.setInterval(() => {
    void fetchPendingFenceAlarms();
  }, 10000);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener("alarmStatusChanged", handleAlarmStatusChanged);
  };
}, [fetchPendingFenceAlarms]);

// 新增：WebSocket连接逻辑
useEffect(() => {
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
        console.log("围栏报警WebSocket已连接:", wsUrl);
      };

      ws.onmessage = (event) => {
        let data: any;
        try {
          data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        } catch {
          return;
        }

        // 检查是否为围栏报警
        if (data.device_id && data.fence_id && (data.alarm_type?.includes("电子围栏") || data.description?.includes("电子围栏"))) {
          const deviceId = String(data.device_id);
          const violationType = data.alarm_type?.includes("闯入") ? "No Entry" : "No Exit";
          
          // 更新违规设备状态
          setViolationTypes(prev => ({
            ...prev,
            [deviceId]: violationType
          }));

          // 如果在冷却期内（刚退出调试模式），延迟显示警报
          if (coolingDownRef.current) {
            const gracePeriod = systemSettings.fenceGracePeriod || 3;
            console.log(`[WebSocket警报] 设备 ${deviceId} 收到警报，冷却期内，延迟${gracePeriod}秒后触发`);
            
            // 如果已有定时器，先清除
            const existingTimer = alarmTimersRef.current.get(deviceId);
            if (existingTimer) {
              clearTimeout(existingTimer);
            }
            
            // 设置延迟警报定时器
            const timerId = window.setTimeout(() => {
              // 延迟后检查设备是否仍然越界
              // 由于 violationTypes 是状态，我们需要通过闭包捕获当前值
              console.log(`[WebSocket警报] 设备 ${deviceId} 延迟${gracePeriod}秒后触发警报`);
              
              // 显示报警弹窗
              triggerFenceAlarm({
                id: data.id,
                device_id: deviceId,
                fence_id: String(data.fence_id),
                alarm_type: data.alarm_type,
                severity: data.severity,
                timestamp: data.timestamp,
                description: data.description,
                location: data.location,
                person_name: data.person_name
              });

              // 播放警报音效

              // 3秒后自动关闭弹窗
              if (alarmCloseTimerRef.current) {
                window.clearTimeout(alarmCloseTimerRef.current);
              }
              alarmCloseTimerRef.current = window.setTimeout(() => {
                setFenceAlarm(null);
              }, 3000);
              
              // 清除定时器引用
              alarmTimersRef.current.delete(deviceId);
            }, gracePeriod * 1000);
            
            // 保存定时器引用
            alarmTimersRef.current.set(deviceId, timerId);
          } else {
            // 正常模式：立即显示警报
            console.log(`[WebSocket警报] 设备 ${deviceId} 收到警报，非冷却期，立即触发`);
            // 显示报警弹窗
            triggerFenceAlarm({
              id: data.id,
              device_id: deviceId,
              fence_id: String(data.fence_id),
              alarm_type: data.alarm_type,
              severity: data.severity,
              timestamp: data.timestamp,
              description: data.description,
              location: data.location,
              person_name: data.person_name
            });

            // 播放警报音效

            // 3秒后自动关闭弹窗
            if (alarmCloseTimerRef.current) {
              window.clearTimeout(alarmCloseTimerRef.current);
            }
            alarmCloseTimerRef.current = window.setTimeout(() => {
              setFenceAlarm(null);
            }, 3000);
          }
        }
      };

      ws.onerror = (err) => {
        console.error("围栏报警WebSocket错误:", err);
      };

      ws.onclose = () => {
        console.log("围栏报警连接关闭，准备重连");
        if (disposed) return;
        if (alarmReconnectTimerRef.current) {
          window.clearTimeout(alarmReconnectTimerRef.current);
        }
        alarmReconnectTimerRef.current = window.setTimeout(connect, 2000);
      };
    } catch (err) {
      console.error("围栏报警WebSocket连接初始化失败:", err);
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

    if (alarmWsRef.current) {
      alarmWsRef.current.close();
      alarmWsRef.current = null;
    }
  };
}, []);

const resetDrawing = () => {
  setDrawingMode("none");
  setTempPoints([]);
  setTempCenter(null);
  setPendingFenceData(null);
  setEditingFenceId(null);
  setShowDrawToolbar(false);
  setShowRulePanel(false);
  setActiveDrawTool('pointer');
  setTempShape({});
  setIsDrawing(false);
  
  // 🔒 重置所有工具状态！
  isBrushDrawingRef.current = false;
  brushFinishedRef.current = false;
  circleStartedRef.current = false;
  rectStartedRef.current = false;
  
  // 退出绘制模式，恢复地图拖拽
  if (mapRef.current) {
    mapRef.current.setStatus({ dragMap: true });
    mapRef.current.setDefaultCursor('grab');
  }
};

const handleToolChange = (tool: DrawTool) => {
  // 🎯 已经在绘制中就直接切换工具，否则先走双模式选择
  if (!showDrawToolbar) {
    setShowAddModal(true);
    return;
  }
  
  // ✏️ 正在绘制中：直接切工具！
  setActiveDrawTool(tool);
  setTempPoints([]);
  setTempCenter(null);
  setTempShape({});
  setDragStart(null);
  setIsDrawing(false);
  isBrushDrawingRef.current = false;
  brushFinishedRef.current = false;
  circleStartedRef.current = false;
  rectStartedRef.current = false;
  
  if (mapRef.current) {
    if (tool === 'polygon') {
      mapRef.current.setStatus({ dragMap: true, zoomEnable: true });
      mapRef.current.setDefaultCursor('pointer');
    } else {
      setTimeout(() => {
        mapRef.current!.setStatus({ 
          dragMap: false, 
          zoomEnable: true,
          doubleClickZoom: false,
          keyboardEnable: false,
          animateEnable: false
        });
      }, 0);
      mapRef.current.setDefaultCursor('crosshair');
    }
  }
};

const handleDrawComplete = () => {
  setShowRulePanel(true);
  setShowDrawToolbar(false);
};

const handleClearDraw = () => {
  setTempPoints([]);
  setTempShape({});
};

const handleSaveFenceWithRules = (ruleData: any) => {
  const shape = ruleData.shape === 'circle' ? 'circle' : 'polygon';
  const fenceData = {
    id: Date.now().toString(),
    name: ruleData.name,
    company: ruleData.company || "",
    project: ruleData.project || "",
    grid: ruleData.grid || "",
    team: ruleData.team || "",
    workTeam: ruleData.team || ruleData.workTeam || "",
    branch_id: ruleData.branch_id || null,
    project_id: ruleData.project_id || null,
    grid_id: ruleData.grid_id || null,
    team_id: ruleData.team_id || null,
    orgs: ruleData.orgs || [],
    description: ruleData.description,
    behavior: ruleData.behavior,
    severity: ruleData.severity,
    type: shape === 'circle' ? 'Circle' : 'Polygon',
    shape: shape,
    center: ruleData.center,
    points: ruleData.points,
    radius: ruleData.radius || 100,
    schedule: {
      start: ruleData.startTime + ":00",
      end: ruleData.endTime + ":00",
    },
    deviceIds: [],
    workerCount: 0,
  };
  
  if (editingFenceId) {
    updateFence(editingFenceId, fenceData);
    setEditingFenceId(null);
  } else {
    addFence(fenceData);
  }
  resetDrawing();
  setShowSuccess(true);
  setTimeout(() => setShowSuccess(false), 3000);
};

const handleDeleteClick = (id: string, e: React.MouseEvent) => {
  e.stopPropagation();
  setDeleteConfirm({ show: true, fenceId: id });
};

const confirmDelete = () => {
  if (deleteConfirm.fenceId) {
    deleteFence(deleteConfirm.fenceId);
  }
  setDeleteConfirm({ show: false, fenceId: null });
};

const handleSaveFenceAfterDraw = () => {
  if (!pendingFenceData) return;
  
  if (drawingMode === "circle" && tempCenter) {
    const fenceData = {
      id: Date.now().toString(),
      name: pendingFenceData.name,
      company: pendingFenceData.company || "",
      project: pendingFenceData.project || "",
      grid: pendingFenceData.grid || "",
      team: pendingFenceData.team || "",
      branch_id: pendingFenceData.branch_id || null,
      project_id: pendingFenceData.project_id || null,
      grid_id: pendingFenceData.grid_id || null,
      team_id: pendingFenceData.team_id || null,
      orgs: pendingFenceData.orgs || [],
      description: pendingFenceData.description,
      behavior: pendingFenceData.behavior,
      severity: pendingFenceData.severity,
      shape: "circle",
      center: tempCenter,
      points: pendingFenceData.points,
      radius: pendingFenceData.radius,
      schedule: {
        start: pendingFenceData.startTime + ":00",
        end: pendingFenceData.endTime + ":00",
      },
      deviceIds: [],
      workerCount: 0,
    };
    
    if (editingFenceId) {
      updateFence(editingFenceId, fenceData);
      setEditingFenceId(null);
    } else {
      addFence(fenceData);
    }
    resetDrawing();
    setShowAddModal(false);
    setPendingFenceData(null);
    setShowSuccess(true);
  } else if (drawingMode === "polygon" && tempPoints.length >= 3) {
    const fenceData = {
      id: Date.now().toString(),
      name: pendingFenceData.name,
      company: pendingFenceData.company || "",
      project: pendingFenceData.project || "",
      grid: pendingFenceData.grid || "",
      team: pendingFenceData.team || "",
      branch_id: pendingFenceData.branch_id || null,
      project_id: pendingFenceData.project_id || null,
      grid_id: pendingFenceData.grid_id || null,
      team_id: pendingFenceData.team_id || null,
      orgs: pendingFenceData.orgs || [],
      description: pendingFenceData.description,
      behavior: pendingFenceData.behavior,
      severity: pendingFenceData.severity,
      shape: "polygon",
      center: pendingFenceData.center,
      points: tempPoints,
      radius: pendingFenceData.radius,
      schedule: {
        start: pendingFenceData.startTime + ":00",
        end: pendingFenceData.endTime + ":00",
      },
      deviceIds: [],
      workerCount: 0,
    };
    
    if (editingFenceId) {
      updateFence(editingFenceId, fenceData);
      setEditingFenceId(null);
    } else {
      addFence(fenceData);
    }
    resetDrawing();
    setShowAddModal(false);
    setPendingFenceData(null);
    setShowSuccess(true);
  }
};

useEffect(() => {
  if (!mapReady) return;
  renderGridAreas(filteredGridAreas, drawingMode !== "none");
}, [drawingMode, filteredGridAreas, mapReady, renderGridAreas]);

useEffect(() => {
  if (!mapReady) return;
  
renderFences(
  filteredFences, 
  regions, 
  selectedFence?.id, 
  undefined, 
  drawingMode !== "none", 
  (region) => {},
  getFenceColor
);
}, [mapReady, filteredFences, regions, selectedFence?.id, drawingMode, renderFences]);

useEffect(() => {
  if (!mapReady) return;
renderHistoricalFence(
  historicalFenceView?.fence || null,
  historicalFenceView?.versionLabel
);
}, [mapReady, historicalFenceView, renderHistoricalFence]);
  
useEffect(() => {
  if (!mapReady) return;
  renderDevices(filteredDevices, violationTypes, new Set(), debugMode, (deviceId, latitude, longitude) => {
    updateDevicePosition(deviceId, latitude, longitude);
  });
}, [mapReady, filteredDevices, violationTypes, debugMode, updateDevicePosition, renderDevices]);

useEffect(() => {
  if (!mapReady) return;
renderDraft(
  activeDrawTool,
  tempPoints,
  tempCenter,
  pendingFenceData?.radius || 50,
  // 🔒 画笔工具绝对不传鼠标！只有多边形才需要跟随线！
  activeDrawTool === 'polygon' ? mouseLngLat : null,
  activeDrawTool === 'brush' && isDrawing
);
}, [mapReady, tempPoints, tempCenter, activeDrawTool, mouseLngLat, renderDraft, pendingFenceData, isDrawing]);

// 监听debugMode变化，退出调试模式时保存设备位置
const [prevDebugMode, setPrevDebugMode] = useState(false);

useEffect(() => {
  // 当debugMode从true变为false时，保存所有手动调整过的设备位置并处理延迟警报
  if (prevDebugMode && !debugMode) {
    // 获取所有设备（包含手动调整后的位置）
    filteredDevices.forEach(async (device) => {
      // 保存每个设备的当前位置
      await saveDevicePosition(device.device_id, device.lat, device.lng);
    });
    
    // 设置冷却期标志（退出调试模式后进入延迟警报模式）
    setCoolingDown(true);
    coolingDownRef.current = true;  // 同步更新ref
    console.log("[调试模式] 退出调试模式，冷却期开始，coolingDownRef.current =", coolingDownRef.current);
    
    // 处理越界设备的延迟警报
    handleDelayedAlarmsOnExitDebug();
    
    // 冷却期结束后恢复正常警报
    const gracePeriod = systemSettings.fenceGracePeriod || 3;
    setTimeout(() => {
      setCoolingDown(false);
      coolingDownRef.current = false;  // 同步更新ref
    }, gracePeriod * 1000);
  }
  // 更新前一个debugMode状态
  setPrevDebugMode(debugMode);
}, [debugMode, filteredDevices, saveDevicePosition, prevDebugMode, systemSettings.fenceGracePeriod]);

// 退出调试模式时处理延迟警报
const handleDelayedAlarmsOnExitDebug = () => {
  const gracePeriod = systemSettings.fenceGracePeriod;
  
  // 如果没有设置延迟，直接触发警报
  if (gracePeriod <= 0) {
    return;
  }
  
  // 查找当前越界的设备
  const violationDevices = filteredDevices.filter(device => {
    const violation = getFenceDeviceAlarmKeys(device)
      .map((key) => violationTypes[key])
      .find(Boolean);
    return violation === "No Entry" || violation === "No Exit";
  });
  
  // 为每个越界设备设置延迟警报
  violationDevices.forEach(device => {
    const timerId = window.setTimeout(() => {
      // 延迟后再次检查设备是否仍然越界
      const currentViolation = getFenceDeviceAlarmKeys(device)
        .map((key) => violationTypes[key])
        .find(Boolean);
      if (currentViolation === "No Entry" || currentViolation === "No Exit") {
        // 设备仍然越界，触发警报
        console.log(`设备 ${device.device_id} 越界${currentViolation === "No Entry" ? "进入" : "离开"}警报（延迟${gracePeriod}秒后触发）`);
        // 这里可以添加触发警报的逻辑
      } else {
        // 设备已回到围栏内，取消警报
        console.log(`设备 ${device.device_id} 已回到围栏内，取消警报`);
      }
      // 清除定时器引用
      alarmTimersRef.current.delete(device.device_id);
    }, gracePeriod * 1000);
    
    // 保存定时器引用以便后续取消
    alarmTimersRef.current.set(device.device_id, timerId);
  });
};

// 组件卸载时清除所有定时器
useEffect(() => {
  return () => {
    alarmTimersRef.current.forEach(timerId => {
      clearTimeout(timerId);
    });
    alarmTimersRef.current.clear();
  };
}, []);

useEffect(() => {
  if (!showDrawToolbar || !mapReady || !mapRef.current) return;
  
  const map = mapRef.current;
  
  // 禁用地图拖拽
  map.setStatus({ dragEnable: false, zoomEnable: true });
  map.setDefaultCursor('crosshair');
  
// 多边形：点击添加顶点 + 鼠标跟随线
if (activeDrawTool === 'polygon') {
  const handleClick = (e: any) => {
    const lat = e.lnglat.getLat();
    const lng = e.lnglat.getLng();
    setTempPoints(prev => [...prev, [lat, lng]]);
  };
  
  // 鼠标移动时更新跟随线位置
  const handleMouseMove = (e: any) => {
    const lat = e.lnglat.getLat();
    const lng = e.lnglat.getLng();
    setMouseLngLat([lat, lng]);
  };
  
  map.on('click', handleClick);
  map.on('mousemove', handleMouseMove);
  
  return () => {
    map.off('click', handleClick);
    map.off('mousemove', handleMouseMove);
    map.setStatus({ dragEnable: true });
    map.setDefaultCursor('');
  };
}
  
// ⭕ 圆形：固定圆心！只调整半径
if (activeDrawTool === 'circle') {
  let circleCenter: [number, number] | null = null;
  
  const onClick = (e: any) => {
    const lat = e.lnglat.getLat();
    const lng = e.lnglat.getLng();
    
    // 🔴 第1次点击：固定圆心！
    if (!circleStartedRef.current) {
      circleCenter = [lat, lng];
      setTempCenter(circleCenter);
      // 初始化半径为默认值
      const initialRadius = 100;
      setTempShape({ center: circleCenter, radius: initialRadius });
      setPendingFenceData(prev => ({ ...prev, radius: initialRadius }));
      circleStartedRef.current = true;
      map.setDefaultCursor('cell');
    } 
    // 🔴 第2次点击：确定半径，结束！
    else {
      circleStartedRef.current = false;
      map.setDefaultCursor('crosshair');
    }
  };
  
  const onMouseMove = (e: any) => {
    if (!circleStartedRef.current || !circleCenter) return;
    const current = [e.lnglat.getLat(), e.lnglat.getLng()];
    
    // 🎯 圆心不动！只调整半径大小
    const dx = (current[1] - circleCenter[1]) * 111000;
    const dy = (current[0] - circleCenter[0]) * 111000;
    const radius = Math.max(5, Math.sqrt(dx * dx + dy * dy));
    
    setPendingFenceData(prev => ({ ...prev, radius }));
    setTempShape(prev => ({ ...prev, radius }));
    renderDraft('circle', [], circleCenter, radius, null);
  };
  
  map.on('click', onClick);
  map.on('mousemove', onMouseMove);
  
  return () => {
    map.off('click', onClick);
    map.off('mousemove', onMouseMove);
    map.setStatus({ dragEnable: true });
    map.setDefaultCursor('');
  };
}
  
// 🟦 矩形：鼠标永远在对角上！不会被挡住！
if (activeDrawTool === 'rectangle') {
  let rectStart: [number, number] | null = null;
  
  const onClick = (e: any) => {
    const lat = e.lnglat.getLat();
    const lng = e.lnglat.getLng();
    
    // 🟦 第1次点击：第一个角
    if (!rectStartedRef.current) {
      rectStart = [lat, lng];
      setTempPoints([rectStart]);
      rectStartedRef.current = true;
      map.setDefaultCursor('cell');
    } 
    // 🟦 第2次点击：确定对角，结束！
    else {
      const [x1, y1] = rectStart!;
      const [x2, y2] = [lat, lng];
      // 计算矩形的四个角
      const rectanglePoints = [
        [x1, y1],  // 第一个角
        [x1, y2],  // 左上角
        [x2, y2],  // 第二个角
        [x2, y1],  // 右下角
        [x1, y1]   // 回到第一个角，闭合路径
      ];
      setTempPoints(rectanglePoints);
      rectStartedRef.current = false;
      map.setDefaultCursor('crosshair');
    }
  };
  
  const onMouseMove = (e: any) => {
    if (!rectStartedRef.current || !rectStart) return;
    const current = [e.lnglat.getLat(), e.lnglat.getLng()];
    renderDraft('rectangle', [rectStart, current], null, 0, null);
  };
  
  map.on('click', onClick);
  map.on('mousemove', onMouseMove);
  
  return () => {
    map.off('click', onClick);
    map.off('mousemove', onMouseMove);
    map.setStatus({ dragEnable: true });
    map.setDefaultCursor('');
  };
// ✏️ 画笔：标准画图软件模式，按住拖动绘制，松开自动闭合
} else if (activeDrawTool === 'brush') {
  
  const onMouseDown = (e: any) => {
    if (isBrushDrawingRef.current) {
      return;
    }
    isBrushDrawingRef.current = true;
    brushFinishedRef.current = false;
    setIsDrawing(true);
    setTempPoints([[e.lnglat.getLat(), e.lnglat.getLng()]]);
    map.setDefaultCursor('cell');
  };
  
  const onMouseMove = (e: any) => {
    if (!isBrushDrawingRef.current || brushFinishedRef.current) return;
    const lat = e.lnglat.getLat();
    const lng = e.lnglat.getLng();
    setTempPoints(prev => {
      const last = prev[prev.length - 1];
      if (last && Math.hypot(last[0] - lat, last[1] - lng) < 0.00001) {
        return prev;
      }
      const newPoints = [...prev, [lat, lng]];
      renderDraft(activeDrawTool, newPoints, null, 0, null, true);
      return newPoints;
    });
  };

  const onMouseUp = (e?: any) => {
    if (!isBrushDrawingRef.current) return;
    if (e?.lnglat) {
      const lat = e.lnglat.getLat();
      const lng = e.lnglat.getLng();
      setTempPoints(prev => {
        const last = prev[prev.length - 1];
        if (last && Math.hypot(last[0] - lat, last[1] - lng) < 0.00001) {
          return prev;
        }
        const newPoints = [...prev, [lat, lng]];
        renderDraft(activeDrawTool, newPoints, null, 0, null, false);
        return newPoints;
      });
    }
    isBrushDrawingRef.current = false;
    brushFinishedRef.current = true;
    setIsDrawing(false);
    map.setDefaultCursor('crosshair');
  };
  
  map.on('mousedown', onMouseDown);
  map.on('mousemove', onMouseMove);
  map.on('mouseup', onMouseUp);
  window.addEventListener('mouseup', onMouseUp);
  
  return () => {
    map.off('mousedown', onMouseDown);
    map.off('mousemove', onMouseMove);
    map.off('mouseup', onMouseUp);
    window.removeEventListener('mouseup', onMouseUp);
    setIsDrawing(false);
    map.setStatus({ dragEnable: true });
    map.setDefaultCursor('');
  };
}
  
  return () => {
    map.setStatus({ dragEnable: true });
    map.setDefaultCursor('');
  };
}, [showDrawToolbar, activeDrawTool, mapReady, mapRef, setTempPoints, setTempCenter, setPendingFenceData, renderDraft]);

useEffect(() => {
  if (!mapReady) return;
  if (drawingMode === "none") return;
  
  const handleMapClick = (lat: number, lng: number) => {
    if (drawingMode === "circle") {
      setTempCenter([lat, lng]);
      setTimeout(() => {
        handleSaveFenceAfterDraw();
      }, 100);
    } else if (drawingMode === "polygon") {
      setTempPoints(prev => [...prev, [lat, lng]]);
    }
  };
  
  const handler = (e: any) => {
    const lat = e.lnglat.getLat();
    const lng = e.lnglat.getLng();
    handleMapClick(lat, lng);
  };
  
  mapRef.current.on('click', handler);
  
  return () => {
    if (mapRef.current) {
      mapRef.current.off('click', handler);
      mapRef.current.setStatus({
        dragEnable: true,
        zoomEnable: true,
        doubleClickZoom: true,
      });
    }
  };
}, [mapReady, drawingMode]);

// 📍 渲染收集的定位点 + 脉冲动画标记
useEffect(() => {
  if (!mapReady || collectedPoints.length === 0) return;
  
  const map = mapRef.current;
  const AMap = window.AMap;
  if (!map || !AMap) return;
  
  const collectMarkers: any[] = [];
  
  const coords = collectedPoints.map(p => [p.lng, p.lat]);
  
  // 1. 凸包填充区域
  if (coords.length >= 3) {
    const polygon = new AMap.Polygon({
      path: coords,
      strokeColor: "#ec4899",
      strokeWeight: 2,
      strokeOpacity: 0.6,
      fillColor: "url(#gradient1)",
      fillOpacity: 0.25,
      clickable: false,
      bubble: true,
    });
    map.add(polygon);
    collectMarkers.push(polygon);
  }
  
  // 2. 连接线（发光紫粉渐变）
  if (coords.length >= 2) {
    const line = new AMap.Polyline({
      path: coords,
      strokeColor: "#ec4899",
      strokeWeight: 5,
      strokeOpacity: 0.9,
      lineJoin: "round",
      lineCap: "round",
      clickable: false,
      bubble: true,
    });
    map.add(line);
    collectMarkers.push(line);
    
    const glowLine = new AMap.Polyline({
      path: coords,
      strokeColor: "#a855f7",
      strokeWeight: 12,
      strokeOpacity: 0.15,
      lineJoin: "round",
      lineCap: "round",
      clickable: false,
      bubble: true,
    });
    map.add(glowLine);
    collectMarkers.push(glowLine);
  }
  
  // 3. 每个点：脉冲动画 + 编号
  collectedPoints.forEach((p, i) => {
    const pulseMarker = new AMap.Marker({
      position: [p.lng, p.lat],
      content: `
        <div style="position: relative;">
          <div style="
            position: absolute;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(236, 72, 153, 0.4) 0%, transparent 70%);
            left: -20px;
            top: -20px;
            animation: pulse 1.5s ease-out infinite;
            transform-origin: center;
          "></div>
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f43f5e 100%);
            border: 3px solid white;
            box-shadow: 0 0 0 4px rgba(236, 72, 153, 0.3), 0 8px 20px rgba(236, 72, 153, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 900;
            color: white;
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
            position: relative;
            z-index: 2;
          ">${i + 1}</div>
        </div>
        <style>
          @keyframes pulse {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(2); opacity: 0; }
          }
        </style>
      `,
      offset: new AMap.Pixel(-16, -16),
      zIndex: 500 + i,
      clickable: false,
    });
    map.add(pulseMarker);
    collectMarkers.push(pulseMarker);
    
    const nameTag = new AMap.Marker({
      position: [p.lng, p.lat],
      content: `
        <div style="
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.95), rgba(236, 72, 153, 0.95));
          color: white;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(168, 85, 247, 0.4);
          white-space: nowrap;
          backdrop-filter: blur(8px);
        ">📍 ${p.holder || '现场人员'}</div>
      `,
      offset: new AMap.Pixel(22, -8),
      zIndex: 400,
      clickable: false,
    });
    map.add(nameTag);
    collectMarkers.push(nameTag);
  });
  
  return () => {
    collectMarkers.forEach(m => map.remove(m));
  };
}, [mapReady, collectedPoints]);

const handlePolygonComplete = () => {
  if (tempPoints.length >= 3) {
    handleSaveFenceAfterDraw();
  }
};

const handleCancelDraw = () => {
  resetDrawing();
};

const handleFenceFormSubmit = (data: any) => {
  const shape = data.shape === "circle" ? "circle" : "polygon";
  
  if (editingFenceId) {
    updateFence(editingFenceId, {
      name: data.name,
      company: data.company,
      project: data.project,
      description: data.description,
      behavior: data.behavior,
      severity: data.severity,
      type: shape === "circle" ? "Circle" : "Polygon",
      shape: shape,
      center: data.center,
      points: data.points,
      radius: data.radius,
      schedule: {
        start: data.startTime + ":00",
        end: data.endTime + ":00",
      },
    });
    setEditingFenceId(null);
    alert("围栏更新成功！");
  } else {
    setPendingFenceData({ ...data, shape: shape });
  }
  
  setShowAddModal(false);
  resetDrawing();
};

const handleEditFence = (fence: FenceData) => {
  setEditingFenceId(fence.id);
  
  setPendingFenceData({
    name: fence.name,
    company: fence.company,
    project: fence.project,
    description: fence.description || "",
    behavior: fence.behavior,
    severity: fence.severity,
    shape: fence.type === "Circle" ? "circle" : "polygon",
    radius: fence.radius || 50,
    center: fence.center || null,
    points: fence.points || [],
    startTime: fence.schedule.start.slice(0, 16),
    endTime: fence.schedule.end.slice(0, 16),
  });
  
  if (fence.type === "Circle") {
    setDrawingMode("circle");
    setTempCenter(fence.center || null);
  } else {
    setDrawingMode("polygon");
    setTempPoints(fence.points || []);
  }
  
  setShowAddModal(true);
};

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(56,189,248,0.20),transparent_32%),radial-gradient(circle_at_86%_2%,rgba(59,130,246,0.22),transparent_30%),linear-gradient(135deg,#020617,#0b1f3f_45%,#102a5e)] relative">
      {/* 新增：围栏报警弹窗 */}
      {fenceAlarm && systemSettings.alarmPopup !== false && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setFenceAlarm(null)} />
          <div className="relative bg-gradient-to-br from-red-900 to-red-700 border-2 border-red-500 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 animate-in fade-in slide-in-from-bottom-10">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className={`w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg ${systemSettings.alarmSevereFlash ? "animate-pulse" : ""}`}>
                  <ShieldAlert size={32} className="text-white" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-2">围栏报警</h3>
                <div className="space-y-2 text-red-100">
                  <p className="text-lg font-medium">{fenceAlarm.alarm_type}</p>
                  <p>设备: {fenceAlarm.device_id}</p>
                  <p>围栏: {fenceAlarm.fence_id}</p>
                  <p>人员: {fenceAlarm.person_name}</p>
                  <p>位置: {fenceAlarm.location}</p>
                  <p className="text-sm text-red-300 mt-2">{new Date(fenceAlarm.timestamp).toLocaleString()}</p>
                </div>
              </div>
              <button 
                onClick={() => setFenceAlarm(null)}
                className="text-white hover:text-red-200 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setFenceAlarm(null)}
                className="bg-white text-red-700 font-bold px-6 py-2 rounded-lg hover:bg-red-100 transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
      <FenceFilterBar 
        filter={filter}
        setFilter={setFilter}
        companies={companies}
        projects={projects}
        grids={grids}
        showCompanyFilter={currentProjectScope.isHeadquartersScope}
      />

<div className="flex-1 m-4 mt-2 rounded-lg overflow-hidden border border-blue-400/30 shadow-xl relative z-0">
  <div className="absolute top-4 left-4 z-10 w-96">
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400 z-10" />
      <input
        type="text"
        id="place-search"
        placeholder="搜索地点..."
        className="w-full bg-slate-800/90 backdrop-blur-sm border border-cyan-400/40 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30 transition-all shadow-xl"
        autoComplete="off"
      />
    </div>
  </div>

  <div ref={mapContainerRef} className="w-full h-full" />

  {historicalFenceView && (
    <div className="absolute top-4 right-4 z-20 max-w-md rounded-lg border border-amber-300/50 bg-slate-950/90 p-4 shadow-2xl backdrop-blur-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
            <MapPin size={16} />
            正在查看历史围栏
          </div>
          <div className="mt-1 text-base font-semibold text-white">{historicalFenceView.fence.name}</div>
          <div className="mt-1 text-xs text-slate-400">
            {historicalFenceView.versionLabel || "历史版本"}
            {historicalFenceView.logTime ? ` · ${new Date(historicalFenceView.logTime).toLocaleString()}` : ""}
          </div>
        </div>
        <button
          onClick={() => setHistoricalFenceView(null)}
          className="rounded p-1 text-slate-400 transition-all hover:bg-slate-800 hover:text-amber-200"
          title="关闭历史围栏"
        >
          <X size={18} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
        <span>形状：{historicalFenceView.fence.type === "Circle" ? "圆形" : "多边形"}</span>
        <span>规则：{historicalFenceView.fence.behavior === "No Entry" ? "禁止进入" : "禁止离开"}</span>
        <span>单位：{historicalFenceView.fence.company || "-"}</span>
        <span>项目：{historicalFenceView.fence.project || "-"}</span>
      </div>
    </div>
  )}
</div>

<div className="absolute bottom-24 right-4 z-20 bg-slate-900/90 backdrop-blur-md border border-cyan-400/30 rounded-lg p-3 min-w-[180px] shadow-2xl">
  <div className="text-xs text-cyan-400 mb-2 font-bold">图例说明</div>
  <div className="space-y-2 text-xs">
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full" style={{ background: "#3b82f6" }} />
      <span className="text-slate-300">一般围栏（生效中）</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full" style={{ background: "#f97316" }} />
      <span className="text-slate-300">风险围栏（生效中）</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full" style={{ background: "#ef4444" }} />
      <span className="text-slate-300">严重围栏（生效中）</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full" style={{ background: "#64748b" }} />
      <span className="text-slate-300">未激活/已过期围栏</span>
    </div>
    <div className="border-t border-cyan-400/30 my-1"></div>
    <div className="flex items-center gap-2">
      <div className="w-5 h-5">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#22c55e" stroke="#fff" stroke-width="1"/>
        </svg>
      </div>
      <span className="text-slate-300">在线设备</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-5 h-5 relative">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#ef4444" stroke="#fff" stroke-width="1"/>
        </svg>
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border border-white text-[8px] flex items-center justify-center text-white font-bold">!</div>
      </div>
      <span className="text-slate-300">违规设备</span>
    </div>
  </div>
</div>

{/* 📍 收集顶点实时状态面板 */}
{collectedPoints.length > 0 && (
  <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/30 p-4 min-w-[280px]">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center animate-pulse">
          📍
        </div>
        <div>
          <div className="font-bold text-sm text-slate-200">正在收集边界顶点</div>
          <div className="text-[10px] text-slate-500">现场人员GPS实时上报</div>
        </div>
      </div>
      <div className={`px-3 py-1 rounded-full text-xs font-bold ${
        collectedPoints.length >= 3 
          ? 'bg-green-500/20 text-green-400' 
          : 'bg-yellow-500/20 text-yellow-400'
      }`}>
        {collectedPoints.length}/3 点
      </div>
    </div>
    
    <div className="space-y-1.5 mb-3 max-h-[120px] overflow-y-auto">
      {collectedPoints.map((p, i) => (
        <div key={i} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-2 py-1.5">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-[10px] font-bold text-white">
              {i + 1}
            </span>
            <span className="text-xs text-slate-300">{p.holder || '现场人员'}</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            {p.lat?.toFixed(4)}, {p.lng?.toFixed(4)}
          </span>
        </div>
      ))}
    </div>
    
    {canCreateFence && collectedPoints.length >= 3 && (
      <button
        onClick={() => setShowAddModal(true)}
        className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 rounded-xl text-xs font-bold transition-all"
      >
        ✓ 继续设置围栏属性
      </button>
    )}
  </div>
)}

{canCreateFence && (
<button
  onClick={() => {
    setShowAddModal(true);
    setSidebarCollapsed(true);
  }}
  className="absolute bottom-6 left-[calc(50%-80px)] -translate-x-1/2 z-30 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-900 px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 font-bold transition-all hover:scale-105 hover:shadow-cyan-500/30"
>
  <Plus size={20} />
  设置新围栏
</button>
)}

<button
  onClick={() => setDebugMode(!debugMode)}
  className={`absolute bottom-6 right-6 z-30 px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 font-bold transition-all border-2 ${
    debugMode 
      ? "bg-amber-500 hover:bg-amber-400 text-slate-900 border-amber-300 animate-pulse" 
      : "bg-slate-800/80 hover:bg-slate-700 text-cyan-400 border-cyan-400/50 backdrop-blur-md"
  }`}
>
  {debugMode ? <MousePointer2 size={20} /> : <Bug size={20} />}
  {debugMode ? "退出调试" : "设备调试"}
</button>

{debugMode && (
  <div className="absolute top-24 right-4 z-20 bg-amber-500/90 backdrop-blur-md border border-amber-300 rounded-lg p-3 shadow-2xl animate-in fade-in slide-in-from-right-5">
    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm mb-1">
      <Bug size={16} />
      调试模式已开启
    </div>
    <div className="text-xs text-slate-800">
      您可以点击并拖动地图上的设备图标运行位置漂移测试。
    </div>
  </div>
)}

      <div className="absolute left-0 top-16 bottom-0 z-20">
        <FenceSidebar
          fences={filteredFences}
          teams={teams}
          organizationTree={organizationTree}
          devices={filteredDevices}
          stats={fenceStats}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onSelectFence={(fence) => {
            focusFence(fence);
          }}
          onSelectDevice={(device) => {
            focusDevice(device);
          }}
          onNavigateToLocation={(lat, lng, zoom) => {
            setCenter([lat, lng]);
            if (zoom) {
              mapRef.current?.setZoom(zoom);
            }
          }}
          onEditFence={handleEditFence}
          onDeleteFence={handleDeleteClick}
          canDeleteFence={canDeleteFence}
          violationTypes={violationTypes}
          selectedFence={selectedFence}
          searchKeyword={filter.keyword}
        />
      </div>

<FenceAddModal
  isOpen={showAddModal}
  onClose={() => {
    void endCollectMode();
    setShowAddModal(false);
    setPendingFenceData(null);
    setEditingFenceId(null);
  }}
  initialData={pendingFenceData}
  onNext={(data) => {
    setPendingFenceData(data);
    if (data.shape === "circle") {
      setDrawingMode("circle");
    } else if (data.shape === "polygon") {
      setDrawingMode("polygon");
      setTempPoints([]);
    }
  }}
  onSaveFence={(data) => {
    let finalPoints = data.points;
    let finalCenter = data.center;
    let finalShape = data.shape === "circle" ? "Circle" : "Polygon";

    if (collectedPoints.length >= 3) {
      finalShape = "Polygon";
      finalPoints = collectedPoints.map(p => [p.lat, p.lng]);
    }

    if (data.shape === "device") {
      finalShape = "Polygon";
      const selectedCoords = data.selectedDeviceIds
        .map(id => devices.find(d => d.id === id))
        .filter(d => d && d.lat && d.lng)
        .map(d => [d.lat, d.lng] as [number, number]);
      
      if (selectedCoords.length < 3) {
        alert("选中的某些设备当前没有有效的 GPS 坐标，无法构成围栏。");
        return;
      }
      finalPoints = selectedCoords;
    }

    const newFence = {
      id: Date.now().toString(),
      name: data.name,
      company: data.company || "",
      project: data.project || "",
      grid: data.grid || "",
      team: data.team || "",
      branch_id: data.branch_id || null,
      project_id: data.project_id || null,
      grid_id: data.grid_id || null,
      team_id: data.team_id || null,
      orgs: data.orgs || [],
      description: data.description,
      behavior: data.behavior,
      severity: data.severity,
      shape: finalShape === "Circle" ? "circle" : "polygon",
      center: finalCenter,
      points: finalPoints,
      radius: data.radius,
      type: finalShape,
      schedule: {
        start: data.startTime + ":00",
        end: data.endTime + ":00",
      },
      deviceIds: [],
      workerCount: 0,
    };
    if (editingFenceId) {
      updateFence(editingFenceId, newFence);
      setEditingFenceId(null);
    } else {
      addFence(newFence);
    }
    resetDrawing();
    void endCollectMode();
    setShowAddModal(false);
    setShowSuccess(true);
  }}
  tempCenter={tempCenter}
  tempPoints={tempPoints}
  drawingMode={drawingMode}
  editingFenceId={editingFenceId}
  companies={companies.filter(c => c !== "all")}
  projects={projects.filter(p => p !== "all")}
  organizationTree={organizationTree}
  devices={devices}
  collectedPoints={collectedPoints}
  onStartCollectMode={() => {
    void startCollectMode();
  }}
  onEnterDrawMode={() => {
    // 🎯 进入手动绘制模式！初始化所有工具状态
    setShowAddModal(false);
    setShowDrawToolbar(true);
    
    // 初始化工具状态
    setTempPoints([]);
    setTempCenter(null);
    setIsDrawing(false);
    isBrushDrawingRef.current = false;
    brushFinishedRef.current = false;
    circleStartedRef.current = false;
    rectStartedRef.current = false;
  }}
  onResetDraw={() => {
    setTempCenter(null);
    setTempPoints([]);
  }}
/>

<FenceDrawTool
  showToolbar={showDrawToolbar}
  activeTool={activeDrawTool}
  onToolChange={handleToolChange}
  onComplete={handleDrawComplete}
  onCancel={resetDrawing}
  onClear={handleClearDraw}
  tempPoints={tempPoints}
  tempShape={tempShape}
  isDragging={isDrawing}
  hasStarted={!!tempCenter || tempPoints.length > 0}
/>

<FenceRulePanel
  show={showRulePanel}
  activeTool={activeDrawTool}
  tempPoints={tempPoints}
  tempShape={tempShape}
  organizationTree={organizationTree}
  onSave={handleSaveFenceWithRules}
  onCancel={resetDrawing}
  onBackToDraw={() => {
    setShowRulePanel(false);
    setShowDrawToolbar(true);
  }}
/>

<DeleteConfirmModal 
  isOpen={deleteConfirm.show}
  onClose={() => setDeleteConfirm({ show: false, fenceId: null })}
  onConfirm={confirmDelete}
/>

<SuccessNotification 
  show={showSuccess}
  onClose={() => setShowSuccess(false)}
/>
  </div>
  );
}
