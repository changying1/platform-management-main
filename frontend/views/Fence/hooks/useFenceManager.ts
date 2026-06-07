// hooks/useFenceManager.ts
// 围栏 + 设备 数据管理 —— 全部从后端获取，前端不再持有任何模拟数据
import { useMemo, useState, useEffect, useCallback } from "react";
import { FenceData, FenceDevice, ProjectRegionData, FenceFilter, WorkTeamData, OrganizationTreeNode } from "../types";
import { getAuthHeaders } from "../../../src/api/config";

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
  const [organizationTree, setOrganizationTree] = useState<OrganizationTreeNode[]>([]);
  const [devices, setDevices] = useState<FenceDevice[]>([]);
  const [regions, setRegions] = useState<ProjectRegionData[]>([]);
  const [filter, setFilter] = useState<FenceFilter>({});
  const [drawingMode, setDrawingMode] = useState<"none" | "circle" | "polygon">("none");
  const [tempPoints, setTempPoints] = useState<[number, number][]>([]);
  const [tempCenter, setTempCenter] = useState<[number, number] | null>(null);
  const [pendingFenceData, setPendingFenceData] = useState<any>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [manualPositions, setManualPositions] = useState<Record<string, { lat: number; lng: number; originalLat: number; originalLng: number }>>({});

  const text = (value: any) => String(value ?? "").trim();
  const normalize = (value: any) => text(value).toLowerCase();

  const gridNameById = useMemo(() => {
    const map = new Map<string, string>();

    const visit = (nodes: OrganizationTreeNode[]) => {
      nodes.forEach(node => {
        const nodeType = normalize(node.type);
        if (nodeType === "grid" || nodeType === "safety_office") {
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

  const getGridName = useCallback((item: { grid?: string; grid_name?: string; grid_id?: string | number | null }) => {
    return text(item.grid_name || item.grid || gridNameById.get(text(item.grid_id)) || item.grid_id);
  }, [gridNameById]);

  const sameGrid = useCallback((item: { grid?: string; grid_name?: string; grid_id?: string | number | null }, selectedGrid: string) => {
    const selected = text(selectedGrid);
    if (!selected) return true;
    return text(item.grid_id) === selected || getGridName(item) === selected;
  }, [getGridName]);

  const matchesKeyword = useCallback((fields: any[], keyword: string) => {
    const normalizedKeyword = normalize(keyword);
    return fields.some(field => normalize(field).includes(normalizedKeyword));
  }, []);

  // ============================
  //  初始化：从后端拉取围栏 + 区域
  // ============================
  const fetchFences = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/fence/list`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setFences(data);
    } catch (err) {
      console.error("拉取围栏数据失败:", err);
    }
  }, []);

  const fetchRegions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/fence/regions`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setRegions(data);
    } catch (err) {
      console.error("拉取区域数据失败:", err);
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/fence/teams`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setTeams(data);
    } catch (err) {
      console.error("拉取作业队数据失败:", err);
    }
  }, []);

  const fetchOrganizationTree = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/responsibility-units/tree`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setOrganizationTree(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("拉取责任组织树失败:", err);
    }
  }, []);

  // 首次加载围栏和区域
  useEffect(() => {
    fetchFences();
    fetchRegions();
    fetchTeams();
    fetchOrganizationTree();
  }, [fetchFences, fetchRegions, fetchTeams, fetchOrganizationTree]);

  // ============================
  //  轮询：从后端拉取设备列表（含实时坐标）
  // ============================
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await fetch(`${API_BASE}/device/devices`, { headers: getAuthHeaders(), credentials: "include" });
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
    const timer = setInterval(fetchDevices, 3000);
    return () => clearInterval(timer);
  }, []);

  // ============================
  //  过滤
  // ============================
  const filteredFences = fences.filter(fence => {
    if (filter.company && fence.company !== filter.company) return false;
    if (filter.project && fence.project !== filter.project) return false;
    if (filter.grid && !sameGrid(fence, filter.grid)) return false;
    if (filter.severity && fence.severity !== filter.severity) return false;
    if (filter.keyword) {
      const relatedDevices = devices.filter(device =>
        (fence.grid_id && text(device.grid_id) === text(fence.grid_id)) ||
        (fence.company && device.company === fence.company && fence.project && device.project === fence.project)
      );
      return matchesKeyword([
        fence.company,
        fence.project,
        getGridName(fence),
        fence.name,
        ...relatedDevices.flatMap(device => [device.name, device.device_id]),
      ], filter.keyword);
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
    if (filter.grid && !sameGrid(device, filter.grid)) return false;
    if (filter.keyword) {
      return matchesKeyword([
        device.company,
        device.project,
        getGridName(device),
        device.name,
        device.device_id,
        device.holder,
      ], filter.keyword);
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

  // 保存设备位置到数据库
  const saveDevicePosition = useCallback(async (deviceId: string, lat: number, lng: number) => {
    try {
      const res = await fetch(`${API_BASE}/device/update-position`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ device_id: deviceId, lat, lng }),
      });

      if (!res.ok) {
        console.error("保存设备位置失败:", await res.text());
        return false;
      }

      return true;
    } catch (err) {
      console.error("保存设备位置异常:", err);
      return false;
    }
  }, []);

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
        grid: fenceData.grid,
        team: fenceData.team,
        branch_id: fenceData.branch_id,
        project_id: fenceData.project_id,
        grid_id: fenceData.grid_id,
        team_id: fenceData.team_id,
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
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error("创建围栏失败:", await res.text());
        return null;
      }

      const newFence = await res.json();
      // 刷新围栏列表
      await fetchFences();
      return newFence;
    } catch (err) {
      console.error("创建围栏异常:", err);
      return null;
    }
  }, [fetchFences]);

  const updateFence = useCallback(async (id: string, updates: Partial<FenceData>) => {
    try {
      const res = await fetch(`${API_BASE}/fence/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        console.error("Update fence failed:", await res.text());
        return null;
      }

      const updatedFence = await res.json();
      await fetchFences();
      return updatedFence;
    } catch (err) {
      console.error("Update fence error:", err);
      return null;
    }
  }, [fetchFences]);

  const deleteFence = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/fence/delete/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
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
  };
};
