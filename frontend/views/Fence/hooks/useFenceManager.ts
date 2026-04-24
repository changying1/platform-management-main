// hooks/useFenceManager.ts
// 围栏 + 设备 数据管理 —— 全部从后端获取，前端不再持有任何模拟数据
import { useState, useEffect, useCallback } from "react";
import { FenceData, FenceDevice, ProjectRegionData, FenceFilter, WorkTeamData } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:9000";

// 颜色配置
const severityColors = {
  general: "#3b82f6",   // 蓝色 - 一般
  risk: "#f97316",      // 橙色 - 风险
  severe: "#ef4444",    // 红色 - 严重
};

// 获取围栏颜色
export const getFenceColor = (severity: string): string => {
  return severityColors[severity as keyof typeof severityColors] || "#3b82f6";
};

export const useFenceManager = () => {
  const [fences, setFences] = useState<FenceData[]>([]);
  const [teams, setTeams] = useState<WorkTeamData[]>([]);
  const [devices, setDevices] = useState<FenceDevice[]>([]);
  const [regions, setRegions] = useState<ProjectRegionData[]>([]);
  const [filter, setFilter] = useState<FenceFilter>({});
  const [drawingMode, setDrawingMode] = useState<"none" | "circle" | "polygon">("none");
  const [tempPoints, setTempPoints] = useState<[number, number][]>([]);
  const [tempCenter, setTempCenter] = useState<[number, number] | null>(null);
  const [pendingFenceData, setPendingFenceData] = useState<any>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [manualPositions, setManualPositions] = useState<Record<string, { lat: number; lng: number; originalLat: number; originalLng: number }>>({});

  // ============================
  //  初始化：从后端拉取围栏 + 区域
  // ============================
  const fetchFences = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/fence/list`);
      if (!res.ok) return;
      const data = await res.json();
      setFences(data);
    } catch (err) {
      console.error("拉取围栏数据失败:", err);
    }
  }, []);

  const fetchRegions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/fence/regions`);
      if (!res.ok) return;
      const data = await res.json();
      setRegions(data);
    } catch (err) {
      console.error("拉取区域数据失败:", err);
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/fence/teams`);
      if (!res.ok) return;
      const data = await res.json();
      setTeams(data);
    } catch (err) {
      console.error("拉取作业队数据失败:", err);
    }
  }, []);

  // 首次加载围栏和区域
  useEffect(() => {
    fetchFences();
    fetchRegions();
    fetchTeams();
  }, [fetchFences, fetchRegions, fetchTeams]);

  // ============================
  //  轮询：从后端拉取设备列表（含实时坐标）
  // ============================
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await fetch(`${API_BASE}/device/devices`);
        if (!res.ok) return;
        const data: FenceDevice[] = await res.json();

        // 自动清理已经发生改变的模拟位置
        setManualPositions(prev => {
          const next = { ...prev };
          let changed = false;
          Object.keys(next).forEach(id => {
            const backendDev = data.find(d => d.device_id === id);
            if (backendDev) {
              // 如果后端传来的数据与我们记录的"移动前坐标"不同，说明后端真实上报了新数据
              if (backendDev.lat !== next[id].originalLat || backendDev.lng !== next[id].originalLng) {
                delete next[id];
                changed = true;
              }
            }
          });
          return changed ? next : prev;
        });

        setDevices(data);
      } catch (err) {
        console.error("拉取设备数据失败:", err);
      }
    };

    fetchDevices();
    const timer = setInterval(fetchDevices, 500);
    return () => clearInterval(timer);
  }, []);

  // ============================
  //  过滤
  // ============================
  const filteredFences = fences.filter(fence => {
    if (filter.company && fence.company !== filter.company) return false;
    if (filter.project && fence.project !== filter.project) return false;
    if (filter.severity && fence.severity !== filter.severity) return false;
    if (filter.keyword) {
      const keyword = filter.keyword.toLowerCase();
      return fence.name.toLowerCase().includes(keyword) ||
             fence.company.toLowerCase().includes(keyword) ||
             fence.project.toLowerCase().includes(keyword);
    }
    return true;
  });

  const filteredDevices = devices.map(device => {
    const manual = manualPositions[device.device_id];
    if (manual) {
      return { ...device, lat: manual.lat, lng: manual.lng };
    }
    return device;
  }).filter(device => {
    if (filter.company && device.company !== filter.company) return false;
    if (filter.project && device.project !== filter.project) return false;
    if (filter.keyword) {
      const keyword = filter.keyword.toLowerCase();
      return device.name.toLowerCase().includes(keyword) ||
             device.holder.toLowerCase().includes(keyword) ||
             device.company.toLowerCase().includes(keyword) ||
             device.project.toLowerCase().includes(keyword);
    }
    return true;
  });

  const updateDevicePosition = useCallback((deviceId: string, lat: number, lng: number) => {
    setManualPositions(prev => {
      const originalDevice = devices.find(d => d.device_id === deviceId);
      return {
        ...prev,
        [deviceId]: {
          lat,
          lng,
          originalLat: originalDevice?.lat || lat,
          originalLng: originalDevice?.lng || lng,
        }
      };
    });
  }, [devices]);

  // 统计数据
  const stats = {
    totalFences: fences.length,
    activeFences: fences.filter(f => {
      const now = new Date();
      const start = new Date(f.schedule.start);
      const end = new Date(f.schedule.end);
      return now >= start && now <= end;
    }).length,
    totalDevices: devices.length,
    onlineDevices: devices.filter(d => d.status === "online").length,
    violations: 0,
  };

  // ============================
  //  围栏操作 —— 调后端接口
  // ============================
  const addFence = useCallback(async (fenceData: any) => {
    try {
      const payload = {
        name: fenceData.name,
        company: fenceData.company,
        project: fenceData.project,
        shape: fenceData.shape || (fenceData.type === "Circle" ? "circle" : "polygon"),
        behavior: fenceData.behavior,
        severity: fenceData.severity,
        schedule: fenceData.schedule || {
          start: fenceData.startTime || new Date().toISOString(),
          end: fenceData.endTime || new Date().toISOString(),
        },
        center: fenceData.center,
        radius: fenceData.radius,
        points: fenceData.points,
      };

      const res = await fetch(`${API_BASE}/fence/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error("创建围栏失败:", await res.text());
        return null;
      }

      const newFence = await res.json();
      // 刷新围栏列表
      await fetchFences();
      window.dispatchEvent(new CustomEvent("fenceAdded", { detail: newFence }));
      return newFence;
    } catch (err) {
      console.error("创建围栏异常:", err);
      return null;
    }
  }, [fetchFences]);

  const updateFence = useCallback((id: string, updates: Partial<FenceData>) => {
    // 暂时在前端本地更新（后端可以后续补 PUT 接口）
    setFences(prev => prev.map(fence =>
      fence.id === id
        ? { ...fence, ...updates, updatedAt: new Date().toISOString() }
        : fence
    ));
  }, []);

  const deleteFence = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/fence/delete/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        console.error("删除围栏失败:", await res.text());
        return;
      }
      // 刷新围栏列表
      await fetchFences();
    } catch (err) {
      console.error("删除围栏异常:", err);
    }
  }, [fetchFences]);

  // ============================
  //  违规检测（纯前端计算）
  // ============================
  const checkViolations = useCallback((device: FenceDevice) => {
    const violations: { fence: FenceData; type: string }[] = [];

    fences.forEach(fence => {
      // 只检查同项目围栏
      if (fence.company !== device.company || fence.project !== device.project) return;

      // 检查围栏是否生效
      const now = new Date();
      const start = new Date(fence.schedule.start);
      const end = new Date(fence.schedule.end);
      const isActive = now >= start && now <= end;
      if (!isActive) return;

      // 检查位置是否在围栏内
      let inside = false;
      if (fence.type === "Circle" && fence.center) {
        const distance = Math.sqrt(
          Math.pow(device.lat - fence.center[0], 2) +
          Math.pow(device.lng - fence.center[1], 2)
        ) * 111000;
        inside = distance <= (fence.radius || 0);
      } else if (fence.type === "Polygon" && fence.points) {
        inside = isPointInPolygon([device.lat, device.lng], fence.points);
      }

      // 根据行为判断违规
      if (fence.behavior === "No Entry" && inside) {
        violations.push({ fence, type: "非法闯入" });
      } else if (fence.behavior === "No Exit" && !inside) {
        violations.push({ fence, type: "非法越界" });
      }
    });

    return violations;
  }, [fences]);

  // 点是否在多边形内
  const isPointInPolygon = (point: [number, number], polygon: [number, number][]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = ((yi > point[1]) != (yj > point[1])) &&
        (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const resetDrawing = useCallback(() => {
    setDrawingMode("none");
    setTempPoints([]);
    setTempCenter(null);
    setPendingFenceData(null);
  }, []);

  const startDrawing = useCallback((mode: "circle" | "polygon", formData: any) => {
    setPendingFenceData(formData);
    setDrawingMode(mode);
  }, []);

  return {
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
  };
};