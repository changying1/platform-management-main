import React, { useState, useRef, useCallback, useEffect } from "react";
import { Search, Filter, Plus, MapPin, Users, AlertTriangle, Info, ChevronDown, X, Circle, Hexagon, Bug, MousePointer2, Navigation, Play, Pause, AlertCircle, ShieldAlert } from "lucide-react";
import { useFenceManager } from "./hooks/useFenceManager";
import { useFenceMap } from "./hooks/useFenceMap";
import { FenceSidebar } from "./components/FenceSidebar";
import { FenceDrawTool } from "./components/FenceDrawTool";
import { FenceRulePanel } from "./components/FenceRulePanel";
import { FenceAddModal } from "./components/FenceAddModal";
import { FenceFilterBar } from "./components/FenceFilterBar";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";
import { SuccessNotification } from "./components/SuccessNotification";

import { FenceData } from "./types";

type DrawTool = 'brush' | 'rectangle' | 'circle' | 'polygon';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:9000";

interface AlarmResponse {
  device_id?: string | number;
  fence_id?: string | number | null;
  alarm_type?: string;
  status?: string;
}

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
}

// 获取系统设置
const fetchSystemSettings = async (): Promise<SystemSettings> => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/settings`);
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

export default function FenceManagement() {
  const [editingFenceId, setEditingFenceId] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedFence, setSelectedFence] = useState<FenceData | null>(null);
  const [violationTypes, setViolationTypes] = useState<Record<string, "No Entry" | "No Exit" | null>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [pendingFenceData, setPendingFenceData] = useState<any>(null); 
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; fenceId: string | null }>({ show: false, fenceId: null });
  const [showSuccess, setShowSuccess] = useState(false);
  
  // 新增：WebSocket相关状态
  const [fenceAlarm, setFenceAlarm] = useState<FenceAlarm | null>(null);
  
  // 新增：系统设置状态（用于越界判定延迟）
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({ fenceGracePeriod: 0 });
  // 新增：延迟警报定时器引用
  const alarmTimersRef = useRef<Map<string, number>>(new Map());
  const alarmWsRef = useRef<WebSocket | null>(null);
  const alarmReconnectTimerRef = useRef<number | null>(null);
  const alarmCloseTimerRef = useRef<number | null>(null);
  // 新增：退出调试模式后的冷却期标志（用于延迟警报）
  const [coolingDown, setCoolingDown] = useState(false);
  // 新增：同步冷却期标志（解决React状态异步更新问题）
  const coolingDownRef = useRef(false);
  
  // 新增：初始化系统设置
  useEffect(() => {
    const loadSettings = async () => {
      const settings = await fetchSystemSettings();
      setSystemSettings(settings);
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
      return `${wsProtocol}//${apiUrl.host}/ws/alarm`;
    } catch {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${wsProtocol}//${window.location.hostname}:9000/ws/alarm`;
    }
  };

  const [showDrawToolbar, setShowDrawToolbar] = useState(false);
  const [activeDrawTool, setActiveDrawTool] = useState<DrawTool>('rectangle');
  const [showRulePanel, setShowRulePanel] = useState(false);
  const [tempShape, setTempShape] = useState<any>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);

  const {
    fences,
    teams,
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

  const [mouseLngLat, setMouseLngLat] = useState<[number, number] | null>(null);
  const [collectedPoints, setCollectedPoints] = useState<any[]>([]);
  const collectPollingRef = useRef<number | null>(null);
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
      const res = await fetch(`${API_BASE_URL}/fence/collect/points`);
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
      await fetch(`${API_BASE_URL}/fence/collect/points`, { method: "POST" });
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
      await fetch(`${API_BASE_URL}/fence/collect/points`, { method: "DELETE" });
    } catch (e) {
      console.error("结束围栏收集失败:", e);
    }
    setCollectedPoints([]);
  }, [stopCollectPolling]);

  useEffect(() => {
    return () => {
      stopCollectPolling();
      void fetch(`${API_BASE_URL}/fence/collect/points`, { method: "DELETE" }).catch(() => {});
    };
  }, [stopCollectPolling]);

  const {
    mapReady,
    mapRef, 
    setCenter,
    renderFences,
    renderDevices,
    renderDraft,
    bindClick,
    bindDrawEvents,
    setMapDraggable, 
  } = useFenceMap(mapContainerRef);

  const companies = ["all", ...new Set(fences.map(f => f.company).filter(Boolean))];
  const projects = filter.company && filter.company !== "all"
    ? ["all", ...new Set(fences.filter(f => f.company === filter.company).map(f => f.project))]
    : ["all", ...new Set(fences.map(f => f.project))];

const fetchPendingFenceAlarms = useCallback(async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/alarms/?skip=0&limit=500`);
    if (!res.ok) return;

    const alarms: AlarmResponse[] = await res.json();
    const next: Record<string, "No Entry" | "No Exit" | null> = {};

    alarms.forEach((alarm) => {
      const status = String(alarm.status || "").toLowerCase();
      const alarmType = String(alarm.alarm_type || "");
      const isPending = status !== "resolved" && status !== "ignored";
      const isFenceAlarm = alarm.fence_id !== undefined && alarm.fence_id !== null || alarmType.includes("电子围栏");
      const deviceId = alarm.device_id !== undefined && alarm.device_id !== null ? String(alarm.device_id) : "";

      if (!isPending || !isFenceAlarm || !deviceId) return;
      next[deviceId] = "No Entry";
    });

    setViolationTypes(next);
  } catch (e) {
    console.error("同步围栏告警状态失败:", e);
  }
}, []);

useEffect(() => {
  void fetchPendingFenceAlarms();
  const timer = window.setInterval(() => {
    void fetchPendingFenceAlarms();
  }, 10000);

  return () => window.clearInterval(timer);
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
              setFenceAlarm({
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
              playAlarmSound();

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
            setFenceAlarm({
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
            playAlarmSound();

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
  const newFence = {
    id: Date.now().toString(),
    name: ruleData.name,
    company: ruleData.company,
    project: ruleData.project,
    workTeam: ruleData.workTeam,
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
  
  addFence(newFence);
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
    const newFence = {
      id: Date.now().toString(),
      name: pendingFenceData.name,
      company: pendingFenceData.company,
      project: pendingFenceData.project,
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
    
    addFence(newFence);
    resetDrawing();
    setShowAddModal(false);
    setPendingFenceData(null);
    setShowSuccess(true);
  } else if (drawingMode === "polygon" && tempPoints.length >= 3) {
    const newFence = {
      id: Date.now().toString(),
      name: pendingFenceData.name,
      company: pendingFenceData.company,
      project: pendingFenceData.project,
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
    
    addFence(newFence);
    resetDrawing();
    setShowAddModal(false);
    setPendingFenceData(null);
    setShowSuccess(true);
  }
};

useEffect(() => {
  if (!mapReady) return;
  
renderFences(
  fences, 
  regions, 
  selectedFence?.id, 
  undefined, 
  drawingMode !== "none", 
  (region) => {},
  getFenceColor
);
  
  renderDevices(filteredDevices, violationTypes, new Set(), debugMode, (deviceId, latitude, longitude) => {
    updateDevicePosition(deviceId, latitude, longitude);
  });

renderDraft(
  activeDrawTool,
  tempPoints,
  tempCenter,
  pendingFenceData?.radius || 50,
  // 🔒 画笔工具绝对不传鼠标！只有多边形才需要跟随线！
  activeDrawTool === 'polygon' ? mouseLngLat : null
);
}, [mapReady, fences, regions, selectedFence, tempPoints, tempCenter, filteredDevices, violationTypes, debugMode, updateDevicePosition, activeDrawTool, mouseLngLat, renderDraft, pendingFenceData]);

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
    const violation = violationTypes[device.device_id];
    return violation === "No Entry" || violation === "No Exit";
  });
  
  // 为每个越界设备设置延迟警报
  violationDevices.forEach(device => {
    const timerId = window.setTimeout(() => {
      // 延迟后再次检查设备是否仍然越界
      const currentViolation = violationTypes[device.device_id];
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
// ✏️ 画笔：标准画图软件模式！点击 = 落笔/抬笔
} else if (activeDrawTool === 'brush') {
  
  const onClick = (e: any) => {
    // ✨ 第一次点击：落笔
    if (!isBrushDrawingRef.current) {
      isBrushDrawingRef.current = true;
      brushFinishedRef.current = false;
      setTempPoints([[e.lnglat.getLat(), e.lnglat.getLng()]]);
      map.setDefaultCursor('cell');  // 光标变画笔状
    } 
    // ✨ 第二次点击：抬笔，结束！
    else {
      isBrushDrawingRef.current = false;
      brushFinishedRef.current = true;
      map.setDefaultCursor('crosshair');
    }
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
      renderDraft(activeDrawTool, newPoints, null, 0, null);
      return newPoints;
    });
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
      {fenceAlarm && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setFenceAlarm(null)} />
          <div className="relative bg-gradient-to-br from-red-900 to-red-700 border-2 border-red-500 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 animate-in fade-in slide-in-from-bottom-10">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg animate-pulse">
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
    
    {collectedPoints.length >= 3 && (
      <button
        onClick={() => setShowAddModal(true)}
        className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 rounded-xl text-xs font-bold transition-all"
      >
        ✓ 继续设置围栏属性
      </button>
    )}
  </div>
)}

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
          fences={fences}
          teams={teams}
          devices={devices}
          stats={stats}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onSelectFence={(fence) => {
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
          }}
          onEditFence={handleEditFence}
          onDeleteFence={handleDeleteClick}
          violationTypes={violationTypes}
          selectedFence={selectedFence}
        />
      </div>

<FenceAddModal
  isOpen={showAddModal}
  onClose={() => {
    void endCollectMode();
    setShowAddModal(false);
    setPendingFenceData(null);
  }}
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
    addFence(newFence);
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
