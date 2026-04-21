import React, { useState, useRef, useCallback, useEffect } from "react";
import { Search, Filter, Plus, MapPin, Users, AlertTriangle, Info, ChevronDown, X, Circle, Hexagon, Bug, MousePointer2, Navigation, Play, Pause } from "lucide-react";
import { useFenceManager } from "./hooks/useFenceManager";
import { useFenceMap } from "./hooks/useFenceMap";
import { FenceSidebar } from "./components/FenceSidebar";
import { FenceDrawTool } from "./components/FenceDrawTool";
import { FenceRulePanel } from "./components/FenceRulePanel";
import { FenceAddModal } from "./components/FenceAddModal";
import { FenceFilterBar } from "./components/FenceFilterBar";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";
import { SuccessNotification } from "./components/SuccessNotification";
import { TrajectoryPlayback } from "./components/TrajectoryPlayback";
import { FenceData, FenceDevice } from "./types";

type DrawTool = 'brush' | 'rectangle' | 'circle' | 'polygon';

interface TrajectoryPoint {
  lat: number;
  lng: number;
  timestamp: string;
  speed?: number;
  direction?: number;
}

interface AlarmRecord {
  id: string;
  type: 'fence' | 'video';
  title: string;
  description: string;
  time: string;
  level: 'high' | 'medium' | 'low';
  status: 'pending' | 'resolved' | 'ignored';
  location: string;
  deviceName: string;
  deviceId: string;
  snapshot?: string;
  fenceId?: string;
  fenceName?: string;
}

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
  const [alarmRecords, setAlarmRecords] = useState<AlarmRecord[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const [showDrawToolbar, setShowDrawToolbar] = useState(false);
  const [activeDrawTool, setActiveDrawTool] = useState<DrawTool>('rectangle');
  const [showRulePanel, setShowRulePanel] = useState(false);
  const [tempShape, setTempShape] = useState<any>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [showTrajectoryPlayback, setShowTrajectoryPlayback] = useState(false);
  const [playbackTrajectory, setPlaybackTrajectory] = useState<TrajectoryPoint[]>([]);
  const [playbackDeviceId, setPlaybackDeviceId] = useState<string | null>(null);
  const [hasAutoFit, setHasAutoFit] = useState(false);
  const [isPlayingTrajectory, setIsPlayingTrajectory] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [movingMarker, setMovingMarker] = useState<any>(null);

const saveAlarm = useCallback((device: FenceDevice, violation: { fence: FenceData; type: string }) => {
  const newAlarm: AlarmRecord = {
    id: `fence_${Date.now()}_${Math.random()}`,
    type: 'fence',
    title: violation.type === '非法闯入' ? '非法闯入' : '非法越界',
    description: `${device.name}${violation.type}${violation.fence.name}`,
    time: new Date().toISOString(),
    level: violation.fence.severity === 'severe' ? 'high' : violation.fence.severity === 'risk' ? 'medium' : 'low',
    status: 'pending',
    location: violation.fence.name,
    deviceName: device.name,
    deviceId: device.id,
    fenceId: violation.fence.id,
    fenceName: violation.fence.name
  };
  
  const existingAlarms = JSON.parse(localStorage.getItem('alarm_records') || '[]');
  existingAlarms.unshift(newAlarm);
  localStorage.setItem('alarm_records', JSON.stringify(existingAlarms.slice(0, 100)));
  
  window.dispatchEvent(new CustomEvent('alarmAdded', { detail: newAlarm }));
}, []);

  const {
    fences,
    teams,
    devices,
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
    checkViolations,
    getFenceColor,
    debugMode,
    setDebugMode,
    updateDevicePosition,
  } = useFenceManager();

  const [mouseLngLat, setMouseLngLat] = useState<[number, number] | null>(null);
  const [collectedPoints, setCollectedPoints] = useState<any[]>([]);
  const isBrushDrawingRef = useRef(false);
  const brushFinishedRef = useRef(false);
  const circleStartedRef = useRef(false);
  const rectStartedRef = useRef(false);

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
  
  const interval = setInterval(() => {
    const newViolationMap: Record<string, "No Entry" | "No Exit" | null> = {};
    
    devices.forEach(device => {
      const violations = checkViolations(device);
      if (violations.length > 0) {
        const violation = violations[0];
        newViolationMap[device.id] = violation.fence.behavior;
        
        if (violationTypes[device.id] !== violation.fence.behavior) {
          saveAlarm(device, violation);
          var level = violation.fence.severity === 'severe' ? 'high' : violation.fence.severity === 'risk' ? 'medium' : 'low';
          window.showFenceAlarm(device.name, violation.type, violation.fence.name, level);
        }
      }
    });
    
    setViolationTypes(newViolationMap);
  }, 1000);
  
  return () => clearInterval(interval);
}, [mapReady, devices, fences, checkViolations, violationTypes, saveAlarm]);

useEffect(() => {
  const handleFenceAdded = () => {
    const newViolationMap: Record<string, "No Entry" | "No Exit" | null> = {};
    
    devices.forEach(device => {
      const violations = checkViolations(device);
      if (violations.length > 0) {
        const violation = violations[0];
        newViolationMap[device.id] = violation.fence.behavior;
        
        var level = violation.fence.severity === 'severe' ? 'high' : violation.fence.severity === 'risk' ? 'medium' : 'low';
        window.showFenceAlarm(device.name, violation.type, violation.fence.name, level);
      }
    });
    
    setViolationTypes(newViolationMap);
  };
  
  window.addEventListener('fenceAdded', handleFenceAdded);
  return () => window.removeEventListener('fenceAdded', handleFenceAdded);
}, [devices, checkViolations]);

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
  
  renderDevices(devices, violationTypes, new Set(), debugMode, (deviceId, latitude, longitude) => {
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

// 渲染轨迹回放
if (playbackTrajectory.length > 0 && mapRef.current) {
  const AMap = window.AMap;
  const map = mapRef.current;

  // 清除之前的轨迹
  if ((map as any)._trajectoryOverlays) {
    (map as any)._trajectoryOverlays.forEach((overlay: any) => map.remove(overlay));
  }
  (map as any)._trajectoryOverlays = [];

  const path = playbackTrajectory.map((p) => [p.lng, p.lat]);

  // 轨迹线
  const polyline = new AMap.Polyline({
    path: path,
    strokeColor: '#3b82f6',
    strokeWeight: 4,
    strokeOpacity: 0.8,
    showDir: true,
  });
  map.add(polyline);
  (map as any)._trajectoryOverlays.push(polyline);

  // 起点标记
  const startPoint = playbackTrajectory[0];
  const startMarker = new AMap.Marker({
    position: [startPoint.lng, startPoint.lat],
    content: `<div style="width: 24px; height: 24px; background: #22c55e; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; font-size: 12px; color: white; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">始</div>`,
    offset: new AMap.Pixel(-12, -12),
  });
  map.add(startMarker);
  (map as any)._trajectoryOverlays.push(startMarker);

  // 终点标记
  const endPoint = playbackTrajectory[playbackTrajectory.length - 1];
  const endMarker = new AMap.Marker({
    position: [endPoint.lng, endPoint.lat],
    content: `<div style="width: 24px; height: 24px; background: #ef4444; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; font-size: 12px; color: white; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">终</div>`,
    offset: new AMap.Pixel(-12, -12),
  });
  map.add(endMarker);
  (map as any)._trajectoryOverlays.push(endMarker);

  // 自适应视图 - 只在第一次加载时执行
  if (!hasAutoFit) {
    map.setFitView([polyline, startMarker, endMarker], false, [50, 50, 50, 50]);
    setHasAutoFit(true);
  }
}
}, [mapReady, fences, regions, selectedFence, tempPoints, tempCenter, devices, debugMode, updateDevicePosition, activeDrawTool, mouseLngLat, renderDraft, pendingFenceData, playbackTrajectory]);

// 轨迹播放动画
useEffect(() => {
  if (!isPlaying || !mapRef.current || playbackTrajectory.length === 0) return;

  const map = mapRef.current;
  const AMap = window.AMap;

  // 创建移动标记（如果不存在）
  if (!movingMarker && playbackTrajectory.length > 0) {
    const startPoint = playbackTrajectory[0];
    const marker = new AMap.Marker({
      position: [startPoint.lng, startPoint.lat],
      content: `<div style="width: 32px; height: 32px; background: #3b82f6; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.5); animation: pulse 1.5s infinite;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </div>`,
      offset: new AMap.Pixel(-16, -16),
    });
    map.add(marker);
    setMovingMarker(marker);
  }

  // 播放动画
  const interval = setInterval(() => {
    setCurrentPointIndex((prev) => {
      const next = prev + 1;
      if (next >= playbackTrajectory.length) {
        // 播放结束，回到起点
        setIsPlaying(false);
        if (movingMarker && playbackTrajectory.length > 0) {
          const startPoint = playbackTrajectory[0];
          movingMarker.setPosition([startPoint.lng, startPoint.lat]);
        }
        return 0;
      }

      // 更新标记位置
      const point = playbackTrajectory[next];
      if (movingMarker) {
        movingMarker.setPosition([point.lng, point.lat]);
      }

      return next;
    });
  }, 500); // 每500ms移动一个点

  return () => {
    clearInterval(interval);
  };
}, [isPlaying, playbackTrajectory, movingMarker]);

// 清理移动标记
useEffect(() => {
  return () => {
    if (movingMarker && mapRef.current) {
      mapRef.current.remove(movingMarker);
    }
  };
}, [movingMarker]);

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

{/* 轨迹播放控制按钮 */}
{isPlayingTrajectory && (
  <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
    {/* 播放/暂停按钮 */}
    <button
      onClick={() => {
        if (isPlaying) {
          setIsPlaying(false);
        } else {
          setIsPlaying(true);
        }
      }}
      className="bg-blue-500/90 hover:bg-blue-400 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 font-bold transition-all hover:scale-105"
    >
      {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      {isPlaying ? '暂停' : '播放'}
    </button>
    
    {/* 进度显示 */}
    {playbackTrajectory.length > 0 && (
      <div className="bg-slate-900/90 text-white px-3 py-2 rounded-full shadow-2xl text-sm">
        {currentPointIndex + 1} / {playbackTrajectory.length}
      </div>
    )}
    
    {/* 中止回放按钮 */}
    <button
      onClick={() => {
        setPlaybackTrajectory([]);
        setPlaybackDeviceId(null);
        setIsPlayingTrajectory(false);
        setIsPlaying(false);
        setCurrentPointIndex(0);
        setHasAutoFit(false);
        // 清除地图上的轨迹和移动标记
        if (mapRef.current) {
          const map = mapRef.current;
          if ((map as any)._trajectoryOverlays) {
            (map as any)._trajectoryOverlays.forEach((overlay: any) => map.remove(overlay));
            (map as any)._trajectoryOverlays = [];
          }
          if (movingMarker) {
            map.remove(movingMarker);
            setMovingMarker(null);
          }
        }
      }}
      className="bg-red-500/90 hover:bg-red-400 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 font-bold transition-all hover:scale-105"
    >
      <X size={18} />
      中止
    </button>
  </div>
)}
    
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
  onClick={() => setShowTrajectoryPlayback(true)}
  className="absolute bottom-6 left-[calc(50%+80px)] -translate-x-1/2 z-30 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 font-bold transition-all hover:scale-105 hover:shadow-blue-500/30"
>
  <Navigation size={20} />
  轨迹回放
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
    setShowAddModal(false);
    setPendingFenceData(null);
    setCollectedPoints([]);
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
    setCollectedPoints([]);
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
    const fetchPoints = async () => {
      try {
        const res = await fetch('/api/fence/collect/points');
        const data = await res.json();
        setCollectedPoints(data.points || []);
      } catch (e) {
        console.log('模拟收集点数据');
        setCollectedPoints([
          { holder: '张三', lat: 34.28, lng: 109.13, timestamp: new Date().toISOString() },
          { holder: '李四', lat: 34.285, lng: 109.135, timestamp: new Date().toISOString() },
        ]);
      }
    };
    fetchPoints();
    const interval = setInterval(fetchPoints, 3000);
    return () => clearInterval(interval);
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

{showTrajectoryPlayback && (
  <TrajectoryPlayback
    onSelectDevice={(deviceId, trajectory) => {
      // 清除之前的播放状态
      if (movingMarker && mapRef.current) {
        mapRef.current.remove(movingMarker);
        setMovingMarker(null);
      }
      setPlaybackDeviceId(deviceId);
      setPlaybackTrajectory(trajectory);
      setIsPlayingTrajectory(true);
      setIsPlaying(false);
      setCurrentPointIndex(0);
      setHasAutoFit(false);
    }}
    onClose={() => setShowTrajectoryPlayback(false)}
  />
)}
  </div>
  );
}
