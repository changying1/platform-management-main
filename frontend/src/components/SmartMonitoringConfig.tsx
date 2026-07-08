import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  Settings,
  X,
  Search,
  Camera,
  AlertCircle,
  Loader,
  CheckCircle,
  Play,
  StopCircle,
  Save,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Building2,
  Folder,
  FolderOpen,
  MapPin,
  Users,
} from 'lucide-react';
import {
  startAIMonitoring,
  stopAIMonitoring,
  updateDeviceRules,
  getDeviceRules,
  getAIRules,
  Video,
  AIRule,
} from '../api/videoApi';

interface SmartMonitoringConfigProps {
  devices: Video[];
  onClose?: () => void;
  onSuccess?: (selection?: { deviceIds: number[]; algoIds: string[] }) => void;
  embedded?: boolean;
  // ✅ 新增：初始选中的设备ID列表
  initialSelectedDeviceIds?: number[];
  // ✅ 新增：初始选中的算法ID列表
  initialSelectedAlgoIds?: string[];
}

interface DeviceFilter {
  company: string;
  project: string;
  grid: string;
  team: string;
  status: string;
  searchText: string;
}

interface BindingConfig {
  deviceIds: number[];
  algoIds: string[];
  autoStart: boolean;
}

interface AlgoItem {
  id: string;
  name: string;
  desc?: string;
  role?: string;
  category?: string;
  modelType?: string;
  modelPath?: string;
}

const aiDisplayName: Record<string, string> = {
  helmet: '安全帽检测',
  person: '人员检测',
  smoking: '吸烟检测',
  fire: '烟火检测',
  vest: '反光衣检测',
  phone: '打电话检测',
  face: '人脸识别追溯辅助',
};
aiDisplayName.call = '\u6253\u7535\u8bdd\u68c0\u6d4b';
aiDisplayName.calling = '\u6253\u7535\u8bdd\u68c0\u6d4b';
aiDisplayName.phone_call = '\u6253\u7535\u8bdd\u68c0\u6d4b';

const aiDisplayDesc: Record<string, string> = {
  helmet: '检测人员是否正确佩戴安全帽',
  person: '检测画面内人员出现',
  smoking: '检测人员吸烟行为',
  fire: '检测烟火风险',
  vest: '检测人员是否穿戴反光衣',
  phone: '检测人员打电话行为',
};

const splitRuleValue = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap(splitRuleValue);
  }
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(/[,，、\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
};

const normalizeRuleId = (value: unknown): string => {
  const text = String(value || '').trim();
  const normalized = text.toLowerCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    call: 'phone',
    calling: 'phone',
    phone_call: 'phone',
    reflective_vest: 'vest',
    reflection: 'vest',
    no_vest: 'vest',
    no_helmet: 'helmet',
    safehat: 'helmet',
    smoke: 'smoking',
    flame: 'fire',
  };
  return aliases[normalized] || normalized;
};

const getPersistedRuleIds = (source: unknown): string[] => {
  const record = source as Record<string, unknown>;
  const rawRules = [
    'ai_rules',
    'aiRules',
    'algo_rules',
    'algoRules',
    'rules',
    'algo_type',
    'algoType',
    'algos',
  ].flatMap(key => splitRuleValue(record?.[key]).map(normalizeRuleId));
  const seen = new Set<string>();
  return rawRules.filter(ruleId => {
    if (!ruleId || seen.has(ruleId)) return false;
    seen.add(ruleId);
    return true;
  });
};

const textOf = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map(textOf).filter(Boolean).join(' ');
  }
  return String(value).trim();
};

const firstText = (source: unknown, keys: string[]): string => {
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = textOf(record?.[key]);
    if (value) return value;
  }
  return '';
};

const normalizeText = (value: unknown): string => textOf(value).toLowerCase();

const getDeviceCompany = (device: Video) =>
  firstText(device, ['company', 'department', 'dept', 'branch_name', 'branchName']);

const getDeviceProject = (device: Video) =>
  firstText(device, ['project', 'project_name', 'projectName']);

const getDeviceGrid = (device: Video) =>
  firstText(device, ['grid', 'grid_name', 'gridName', 'grid_id', 'gridId']);

const getDeviceTeam = (device: Video) =>
  firstText(device, ['team', 'team_name', 'teamName', 'workTeam', 'work_team', 'team_id', 'teamId']);

const getDeviceResponsible = (device: Video) =>
  firstText(device, [
    'responsible_person_name',
    'responsiblePersonName',
    'responsible_person',
    'responsiblePerson',
    'holder_name',
    'holderName',
    'holder',
    'holder_id',
    'holderId',
    'manager_name',
    'managerName',
    'manager',
    'owner_name',
    'ownerName',
    'owner_id',
    'ownerId',
  ]);

const getDeviceSearchText = (device: Video) =>
  [
    device.id,
    device.name,
    getDeviceCompany(device),
    getDeviceProject(device),
    getDeviceGrid(device),
    getDeviceTeam(device),
    getDeviceResponsible(device),
    device.ip_address,
    device.device_serial,
    device.remark,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');

export default function SmartMonitoringConfig({ 
  devices, 
  onClose, 
  onSuccess,
  embedded = false,
  initialSelectedDeviceIds = [],
  initialSelectedAlgoIds = []
}: SmartMonitoringConfigProps) {
  
  const [algos, setAlgos] = useState<AlgoItem[]>([]);
  const [faceAssist, setFaceAssist] = useState<AlgoItem | null>(null);
  const [faceAssistEnabled, setFaceAssistEnabled] = useState(true);
  const [deviceRules, setDeviceRules] = useState<Map<number, string[]>>(new Map());
  const [filter, setFilter] = useState<DeviceFilter>({
    company: 'all',
    project: 'all',
    grid: 'all',
    team: 'all',
    status: 'all',
    searchText: '',
  });

  // 确保初始状态正确，防止意外修改
  useEffect(() => {
    // 只在组件挂载时检查初始状态
    if (filter.company !== 'all') {
      console.warn('Filter company was modified on mount:', filter.company);
    }
    
    // 检查设备数据中的公司值是否一致
    const companyValues = [...new Set(devices.map(d => d.company).filter(Boolean))];
    if (companyValues.length > 1) {
      console.warn('Multiple companies found in devices:', companyValues);
    }
  }, []); // 空依赖数组，只在挂载时执行一次
  
  const [selectedDevices, setSelectedDevices] = useState<Set<number>>(
    () => new Set(initialSelectedDeviceIds)
  );
  const [selectedAlgos, setSelectedAlgos] = useState<Set<string>>(
    () => new Set(initialSelectedAlgoIds)
  );
  
  const [autoStart, setAutoStart] = useState(true);
  const [configuring, setConfiguring] = useState(false);
  const [showTreeDropdown, setShowTreeDropdown] = useState(false);
  const [configResults, setConfigResults] = useState<Map<number, { success: boolean; message: string }>>(new Map());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['filter']));
  const [showPreview, setShowPreview] = useState(false);
  const [isAlgosLoaded, setIsAlgosLoaded] = useState(false); // ✅ 添加标记
  const [hasUserEditedAlgos, setHasUserEditedAlgos] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  // ✅ 只保留一个 fetchAIRules 调用
  useEffect(() => {
    fetchAIRules();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDeviceRules = async () => {
      if (devices.length === 0) {
        setDeviceRules(new Map());
        return;
      }

      const entries = await Promise.all(
        devices.map(async (device) => {
          const fallbackRules = getPersistedRuleIds(device);
          try {
            const rules = await getDeviceRules(device.id);
            return [device.id, rules.length > 0 ? rules : fallbackRules] as const;
          } catch {
            return [device.id, fallbackRules] as const;
          }
        })
      );

      if (!cancelled) {
        setDeviceRules(new Map(entries));
      }
    };

    loadDeviceRules();

    return () => {
      cancelled = true;
    };
  }, [devices]);

  // ✅ 当 algos 首次加载完成后，同步初始选中的算法
  useEffect(() => {
    if (algos.length > 0 && !isAlgosLoaded) {
      setIsAlgosLoaded(true);
      // 只同步一次，避免覆盖用户的选择
      if (initialSelectedAlgoIds.length > 0) {
        const validAlgoIds = initialSelectedAlgoIds.filter(id => 
          algos.some(algo => algo.id === id)
        );
        if (validAlgoIds.length > 0) {
          setSelectedAlgos(new Set(validAlgoIds));
        }
      }
    }
  }, [algos, initialSelectedAlgoIds, isAlgosLoaded]);
  
  // ✅ 当 props 变化时更新设备选择（但不覆盖已选中的）
  useEffect(() => {
    if (initialSelectedDeviceIds.length > 0) {
      setSelectedDevices(new Set(initialSelectedDeviceIds));
    }
  }, [initialSelectedDeviceIds]);

  useEffect(() => {
    if (
      hasUserEditedAlgos ||
      initialSelectedAlgoIds.length > 0 ||
      selectedDevices.size === 0 ||
      algos.length === 0 ||
      deviceRules.size === 0
    ) {
      return;
    }

    const behaviorIds = new Set(algos.map(algo => algo.id));
    const mergedRules = new Set<string>();
    selectedDevices.forEach(deviceId => {
      (deviceRules.get(deviceId) || []).forEach(ruleId => {
        if (behaviorIds.has(ruleId) && ruleId !== 'face' && ruleId !== 'person') {
          mergedRules.add(ruleId);
        }
      });
    });

    const next = Array.from(mergedRules);
    if (next.length === 0) {
      return;
    }

    setSelectedAlgos(prev => {
      if (prev.size === next.length && next.every(ruleId => prev.has(ruleId))) {
        return prev;
      }
      return new Set(next);
    });
  }, [selectedDevices, deviceRules, algos, hasUserEditedAlgos, initialSelectedAlgoIds]);

  // ✅ 删除重复的 useEffect（第 86 行附近的那个）

  const fetchAIRules = async () => {
    const defaultAlgos = [
      { id: "helmet", name: "安全帽检测", desc: "检测人员是否正确佩戴安全帽" },
      { id: "smoking", name: "吸烟检测", desc: "检测人员吸烟行为" },
      { id: "fire", name: "烟火检测", desc: "检测烟火风险" },
      { id: "vest", name: "反光衣检测", desc: "检测人员是否穿戴反光衣" },
      { id: "phone", name: "打电话检测", desc: "检测人员打电话行为" },
    ];
    
    setAlgos(defaultAlgos);
    
    try {
      const rules: AIRule[] = await getAIRules();
      if (rules && rules.length > 0) {
        const mapped = rules.map((rule) => ({
          id: rule.key,
          name: aiDisplayName[rule.key] || rule.desc || rule.key,
          desc: rule.role === 'auxiliary' ? '用于行为告警后的违规人员追溯' : (aiDisplayDesc[rule.key] || rule.desc),
          role: rule.role || 'behavior',
          category: rule.category || '',
          modelType: rule.model_type || '',
          modelPath: rule.model_path || '',
        }));
        const auxiliaryFace = mapped.find(rule => rule.id === 'face' || rule.role === 'auxiliary') || null;
        const behaviorRules = mapped.filter(rule => rule.id !== 'face' && rule.id !== 'person' && rule.role !== 'auxiliary');
        setFaceAssist(auxiliaryFace || {
          id: 'face',
          name: '人脸识别追溯辅助',
          desc: '跟随所有行为检测自动运行，用于违规人员追溯',
          role: 'auxiliary',
          category: '人员追溯辅助',
        });
        setAlgos(behaviorRules);
        setSelectedAlgos(prev => new Set(Array.from(prev).filter(id => id !== 'person' && behaviorRules.some(rule => rule.id === id))));
      }
    } catch (e) {
      console.log("后端AI规则暂不可用，使用默认列表");
      setFaceAssist({
        id: 'face',
        name: '人脸识别追溯辅助',
        desc: '跟随所有行为检测自动运行，用于违规人员追溯',
        role: 'auxiliary',
        category: '人员追溯辅助',
      });
    }
  };

  const companies = ['all', ...new Set(devices.map(getDeviceCompany).filter(Boolean))];
  
  const getProjectsByCompany = () => {
    if (filter.company === 'all') {
      return ['all', ...new Set(devices.map(getDeviceProject).filter(Boolean))];
    }
    const projects = devices
      .filter(d => getDeviceCompany(d) === filter.company)
      .map(getDeviceProject)
      .filter(Boolean);
    return ['all', ...new Set(projects)];
  };
  const projects = getProjectsByCompany();
  
  const getGridsByProject = () => {
    let filtered = devices;
    if (filter.company !== 'all') {
      filtered = filtered.filter(d => getDeviceCompany(d) === filter.company);
    }
    if (filter.project !== 'all') {
      filtered = filtered.filter(d => getDeviceProject(d) === filter.project);
    }
    const grids = filtered.map(getDeviceGrid).filter(Boolean);
    return ['all', ...new Set(grids)];
  };
  const grids = getGridsByProject();
  
  const getTeamsByGrid = () => {
    let filtered = devices;
    if (filter.company !== 'all') {
      filtered = filtered.filter(d => getDeviceCompany(d) === filter.company);
    }
    if (filter.project !== 'all') {
      filtered = filtered.filter(d => getDeviceProject(d) === filter.project);
    }
    if (filter.grid !== 'all') {
      filtered = filtered.filter(d => getDeviceGrid(d) === filter.grid);
    }
    const teams = filtered.map(getDeviceTeam).filter(Boolean);
    return ['all', ...new Set(teams)];
  };
  const teams = getTeamsByGrid();

  // 树形下拉菜单辅助函数
  const getProjectsByCompanyFilter = (company: string) => {
    const projects = devices
      .filter(d => getDeviceCompany(d) === company)
      .map(getDeviceProject)
      .filter(Boolean);
    return ['all', ...new Set(projects)];
  };

  const getGridsByCompanyFilter = (company: string) => {
    const grids = devices
      .filter(d => getDeviceCompany(d) === company)
      .map(getDeviceGrid)
      .filter(Boolean);
    return [...new Set(grids)];
  };

  const getGridsByProjectFilter = (company: string, project: string) => {
    const grids = devices
      .filter(d => getDeviceCompany(d) === company && getDeviceProject(d) === project)
      .map(getDeviceGrid)
      .filter(Boolean);
    return ['all', ...new Set(grids)];
  };

  const getTeamsByGridFilter = (company: string, project: string, grid: string) => {
    const teams = devices
      .filter(d => getDeviceCompany(d) === company && getDeviceProject(d) === project && getDeviceGrid(d) === grid)
      .map(getDeviceTeam)
      .filter(Boolean);
    return ['all', ...new Set(teams)];
  };

  const getGridStatus = (grid: string) => {
    // 模拟网格状态
    const statusMap: Record<string, 'normal' | 'warning'> = {
      'A区出入口': 'normal',
      'B区施工区': 'warning',
      'C区材料堆放': 'normal',
    };
    return statusMap[grid] || 'normal';
  };

  // 过滤设备
  const filteredDevices = devices.filter(device => {
    if (filter.company !== 'all' && getDeviceCompany(device) !== filter.company) return false;
    if (filter.project !== 'all' && getDeviceProject(device) !== filter.project) return false;
    if (filter.grid !== 'all' && getDeviceGrid(device) !== filter.grid) return false;
    if (filter.team !== 'all' && getDeviceTeam(device) !== filter.team) return false;
    if (filter.status !== 'all' && device.status !== filter.status) return false;
    if (filter.searchText && !getDeviceSearchText(device).includes(normalizeText(filter.searchText))) return false;
    return true;
  });

  const getDeviceRuleIds = (device: Video) => {
    const loadedRules = deviceRules.get(device.id);
    if (loadedRules) {
      const seenLoaded = new Set<string>();
      return loadedRules.map(normalizeRuleId).filter(ruleId => {
        if (!ruleId || ruleId === 'face' || ruleId === 'person' || seenLoaded.has(ruleId)) {
          return false;
        }
        seenLoaded.add(ruleId);
        return true;
      });
    }

    const rawRules = getPersistedRuleIds(device);
    const seen = new Set<string>();
    return rawRules.map(normalizeRuleId).filter(ruleId => {
      if (!ruleId || ruleId === 'face' || ruleId === 'person' || seen.has(ruleId)) {
        return false;
      }
      seen.add(ruleId);
      return true;
    });
  };

  const getRuleDisplayName = (ruleId: string) =>
    aiDisplayName[ruleId] || algos.find(algo => algo.id === ruleId)?.name || ruleId;

  const getDeviceRuleNames = (device: Video) =>
    getDeviceRuleIds(device).map(getRuleDisplayName);

  const selectedDeviceList = devices.filter(device => selectedDevices.has(device.id));
  const selectedAlgoNames = Array.from(selectedAlgos)
    .map(normalizeRuleId)
    .filter((id, index, list) => list.indexOf(id) === index)
    .filter(id => algos.some(algo => algo.id === id) && id !== 'face' && id !== 'person')
    .map(getRuleDisplayName);

  // 选择所有过滤后的设备
  const selectAllFiltered = () => {
    const newSelected = new Set(selectedDevices);
    filteredDevices.forEach(device => newSelected.add(device.id));
    setSelectedDevices(newSelected);
  };

  // 清空选择
  const clearSelection = () => {
    setSelectedDevices(new Set());
  };

  // 切换设备选择
  const toggleDevice = (deviceId: number) => {
    const newSelected = new Set(selectedDevices);
    if (newSelected.has(deviceId)) {
      newSelected.delete(deviceId);
    } else {
      newSelected.add(deviceId);
    }
    setSelectedDevices(newSelected);
    setHasPendingChanges(true);
  };

  // 切换算法选择
  const toggleAlgo = (algoId: string) => {
    if (algoId === 'face' || !algos.some(algo => algo.id === algoId)) return;
    setHasUserEditedAlgos(true);
    setHasPendingChanges(true);
    const newSelected = new Set(selectedAlgos);
    if (newSelected.has(algoId)) {
      newSelected.delete(algoId);
    } else {
      newSelected.add(algoId);
    }
    setSelectedAlgos(newSelected);
  };

  // 选择所有算法
  const selectAllAlgos = () => {
    setHasUserEditedAlgos(true);
    setHasPendingChanges(true);
    setSelectedAlgos(new Set(algos.map(a => a.id)));
  };

  // 清空算法选择
  const clearAllAlgos = () => {
    setHasUserEditedAlgos(true);
    setHasPendingChanges(true);
    setSelectedAlgos(new Set());
  };

  // 应用配置到选中的设备
  const applyConfiguration = async () => {
    if (selectedDevices.size === 0) {
      alert('请至少选择一个设备');
      return;
    }

    setConfiguring(true);
    setConfigResults(new Map());

    const deviceArray = Array.from(selectedDevices);
    const behaviorAlgoIds = new Set(algos.map(algo => algo.id));
    const algoList = Array.from(new Set(Array.from(selectedAlgos).map(normalizeRuleId)))
      .filter(id => behaviorAlgoIds.has(id) && id !== 'face' && id !== 'person');
    const runtimeAlgoList = faceAssistEnabled
      ? Array.from(new Set([...algoList, 'face']))
      : algoList;
    const algoString = runtimeAlgoList.length > 0 ? runtimeAlgoList.join(',') : (faceAssistEnabled ? 'person,face' : '');
    const shouldStartMonitoring = autoStart && Boolean(algoString);

    for (let i = 0; i < deviceArray.length; i++) {
      const deviceId = deviceArray[i];
      const device = devices.find(d => d.id === deviceId);
      
      if (!device) {
        setConfigResults(prev => new Map(prev).set(deviceId, {
          success: false,
          message: '设备不存在'
        }));
        continue;
      }

      const streamSource = (device.rtsp_url || device.stream_url || '').trim();
      const hasEzvizSerial = !!String(device.device_serial || '').trim();
      if (!streamSource && !hasEzvizSerial) {
        setConfigResults(prev => new Map(prev).set(deviceId, {
          success: false,
          message: '缺少可用流地址(rtsp/stream_url)，且未配置萤石设备序列号(device_serial)'
        }));
        continue;
      }

      try {
        const updatedRules = await updateDeviceRules(deviceId, algoList, { faceAssistEnabled });
        setDeviceRules(prev => {
          const next = new Map(prev);
          next.set(deviceId, updatedRules);
          return next;
        });

        // 先停止现有的监控
        let monitorStartError = '';
        try {
          await stopAIMonitoring(String(deviceId));

        // 启动新的监控；如果没有选择算法，则表示关闭 AI
        if (shouldStartMonitoring) {
          // 优先尝试一次性传入多算法；若后端不支持，再降级为逐个算法启动
          try {
            await startAIMonitoring(String(deviceId), streamSource, algoString);
          } catch (batchError: any) {
            const selectedAlgoList = runtimeAlgoList.length > 0 ? runtimeAlgoList : ['person', 'face'];
            if (selectedAlgoList.length <= 1) {
              throw batchError;
            }

            for (const algo of selectedAlgoList) {
              await startAIMonitoring(String(deviceId), streamSource, algo);
            }
          }
        }

        } catch (monitorError: any) {
          monitorStartError = monitorError?.message || 'AI monitoring start failed';
        }

        const resultMessage = monitorStartError
          ? `规则已保存，AI启动失败: ${monitorStartError}`
          : algoList.length > 0
          ? `已配置 ${algoList.length} 个AI功能`
          : '已关闭 AI 监控';

        setConfigResults(prev => new Map(prev).set(deviceId, {
          success: !monitorStartError,
          message: resultMessage
        }));
      } catch (error: any) {
        setConfigResults(prev => new Map(prev).set(deviceId, {
          success: false,
          message: error?.message || '配置失败'
        }));
      }

      // 显示进度（可选：添加延迟避免请求过快）
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setConfiguring(false);
    setHasPendingChanges(false);
    onSuccess?.({
      deviceIds: Array.from(selectedDevices),
      algoIds: algoList,
    });
    
    // 3秒后自动清除结果提示
    setTimeout(() => {
      setConfigResults(new Map());
    }, 5000);
  };

  // 统计信息
  const stats = {
    totalDevices: devices.length,
    filteredDevices: filteredDevices.length,
    selectedDevices: selectedDevices.size,
    selectedAlgos: Array.from(selectedAlgos).filter(id => algos.some(algo => algo.id === id)).length,
    configuredDevices: devices.filter(device => getDeviceRuleIds(device).length > 0).length,
  };

  const toggleGroup = (group: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(group)) {
      newExpanded.delete(group);
    } else {
      newExpanded.add(group);
    }
    setExpandedGroups(newExpanded);
  };

  return (
    <div className={embedded ? "h-full min-h-[640px]" : "fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"}>
      <div className={`bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl border border-cyan-500/30 shadow-2xl w-full flex flex-col overflow-hidden ${
        embedded ? 'h-full' : 'max-w-6xl max-h-[90vh]'
      }`}>
        
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-cyan-500/20 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <Shield className="text-cyan-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">智能监控配置</h2>
              <p className="text-sm text-slate-400">批量配置设备的AI监控功能</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 统计信息 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-1.5">
                <span className="text-xl font-bold text-cyan-400">{stats.totalDevices}</span>
                <span className="text-sm text-slate-400">总设备</span>
              </div>
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5">
                <span className="text-xl font-bold text-green-400">{stats.selectedDevices}</span>
                <span className="text-sm text-slate-400">已选设备</span>
              </div>
              <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-1.5">
                <span className="text-xl font-bold text-cyan-300">{stats.configuredDevices}</span>
                <span className="text-sm text-slate-400">已配置设备</span>
              </div>
              <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-1.5">
                <span className="text-xl font-bold text-purple-400">{stats.selectedAlgos}</span>
                <span className="text-sm text-slate-400">已选功能</span>
              </div>
            </div>
            
            {!embedded && onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div className="grid grid-cols-2 gap-6">
            
            {/* 左侧：设备筛选与选择 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                  <Camera size={18} className="text-cyan-400" />
                  设备选择
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllFiltered}
                    className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-300 rounded hover:bg-cyan-500/30 transition-colors"
                  >
                    全选筛选结果
                  </button>
                  <button
                    onClick={clearSelection}
                    className="text-xs px-2 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
                  >
                    清空选择
                  </button>
                </div>
              </div>

              {/* 筛选条件 */}
              <div className="bg-slate-800/30 rounded-lg border border-slate-700 p-3">
                <div className="flex items-center gap-2">
                  {/* 标题 */}
                  <div className="flex items-center gap-1.5 text-slate-300 font-medium text-sm shrink-0">
                    <Filter size={14} />
                    筛选条件
                  </div>

                  {/* 搜索框 */}
                  <div className="relative flex-1 max-w-xs">
                    <Search size={12} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="搜索设备、公司、项目、网格、工队或责任人..."
                      value={filter.searchText}
                      onChange={(e) => setFilter({ ...filter, searchText: e.target.value })}
                      className="w-full bg-slate-900/50 border border-slate-600 rounded-lg pl-7 pr-2 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  {/* 层级选择下拉按钮 */}
                  <div className="relative">
                    <button
                      onClick={() => setShowTreeDropdown(!showTreeDropdown)}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                    >
                      <Building2 size={14} />
                      {filter.company === 'all' ? '全部公司' : filter.company}
                      {filter.project !== 'all' && ` / ${filter.project}`}
                      {filter.grid !== 'all' && ` / ${filter.grid}`}
                      {filter.team !== 'all' && ` / ${filter.team}`}
                      <ChevronDown size={14} className={`transition-transform ${showTreeDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {/* 树形下拉菜单 */}
                    {showTreeDropdown && (
                      <div className="absolute top-full left-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 min-w-[200px] max-h-[300px] overflow-y-auto">
                        <div className="p-2">
                          {/* 全部公司选项 */}
                          <div
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors mb-1 ${
                              filter.company === 'all' ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-300 hover:bg-slate-800'
                            }`}
                            onClick={() => {
                              setFilter({ company: 'all', project: 'all', grid: 'all', team: 'all', status: filter.status, searchText: filter.searchText });
                              setShowTreeDropdown(false);
                            }}
                          >
                            <Building2 size={12} />
                            全部公司
                          </div>
                          {companies.filter(c => c !== 'all').map(company => (
                            <div key={company} className="mb-1">
                              <div
                                className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                                  filter.company === company ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-300 hover:bg-slate-800'
                                }`}
                                onClick={() => {
                                  setFilter({ ...filter, company, project: 'all', grid: 'all', team: 'all' });
                                }}
                              >
                                <Building2 size={12} />
                                {company}
                                <span className="text-slate-500 ml-auto">({getGridsByCompanyFilter(company).length}个网格)</span>
                              </div>
                              {/* 项目层级 */}
                              {filter.company === company && (
                                <div className="ml-4 mt-1">
                                  <div
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
                                      filter.project === 'all' && filter.company === company ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-400 hover:bg-slate-800'
                                    }`}
                                    onClick={() => {
                                      setFilter({ ...filter, project: 'all', grid: 'all', team: 'all' });
                                    }}
                                  >
                                    <Folder size={12} />
                                    全部项目
                                  </div>
                                  {getProjectsByCompanyFilter(company).filter(p => p !== 'all').map(project => (
                                    <div key={project} className="mb-1">
                                      <div
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
                                          filter.project === project ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-300 hover:bg-slate-800'
                                        }`}
                                        onClick={() => {
                                          setFilter({ ...filter, project, grid: 'all', team: 'all' });
                                        }}
                                      >
                                        <FolderOpen size={12} />
                                        {project}
                                      </div>
                                      {/* 网格层级 */}
                                      {filter.project === project && (
                                        <div className="ml-4 mt-1">
                                          <div
                                            className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
                                              filter.grid === 'all' && filter.project === project ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-400 hover:bg-slate-800'
                                            }`}
                                            onClick={() => {
                                              setFilter({ ...filter, grid: 'all', team: 'all' });
                                            }}
                                          >
                                            <MapPin size={12} />
                                            全部网格
                                          </div>
                                          {getGridsByProjectFilter(company, project).filter(g => g !== 'all').map(grid => (
                                            <div key={grid} className="mb-1">
                                              <div
                                                className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
                                                  filter.grid === grid ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-300 hover:bg-slate-800'
                                                }`}
                                                onClick={() => {
                                                  setFilter({ ...filter, grid, team: 'all' });
                                                }}
                                              >
                                                <MapPin size={12} className="text-cyan-400" />
                                                {grid}
                                                <span className="flex-1" />
                                                <span className={`w-2 h-2 rounded-full ${getGridStatus(grid) === 'normal' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                                                <span className="text-slate-500 ml-1">{getGridStatus(grid) === 'normal' ? '正常' : '预警'}</span>
                                              </div>
                                              {/* 工队层级 */}
                                              {filter.grid === grid && (
                                                <div className="ml-4 mt-1">
                                                  <div
                                                    className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
                                                      filter.team === 'all' && filter.grid === grid ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-400 hover:bg-slate-800'
                                                    }`}
                                                    onClick={() => {
                                                      setFilter({ ...filter, team: 'all' });
                                                    }}
                                                  >
                                                    <Users size={12} />
                                                    全部工队
                                                  </div>
                                                  {getTeamsByGridFilter(company, project, grid).filter(t => t !== 'all').map(team => (
                                                    <div
                                                      key={team}
                                                      className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
                                                        filter.team === team ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-300 hover:bg-slate-800'
                                                      }`}
                                                      onClick={() => {
                                                        setFilter({ ...filter, team });
                                                        setShowTreeDropdown(false);
                                                      }}
                                                    >
                                                      <Users size={12} className="text-green-400" />
                                                      {team}
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 状态选择 */}
                  <select
                    value={filter.status}
                    onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                    className="bg-slate-900/50 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 min-w-[70px]"
                  >
                    <option value="all">全部状态</option>
                    <option value="online">在线</option>
                    <option value="offline">离线</option>
                  </select>
                </div>
              </div>

              {/* 设备列表 */}
              <div className="bg-slate-800/30 rounded-lg border border-slate-700 overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  {filteredDevices.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                      <Camera size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">没有找到符合条件的设备</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-700">
                      {filteredDevices.map(device => (
                        <label
                          key={device.id}
                          className="flex items-center gap-3 p-3 hover:bg-slate-700/50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDevices.has(device.id)}
                            onChange={() => toggleDevice(device.id)}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${device.status === 'online' ? 'bg-green-500' : 'bg-slate-500'}`} />
                              <span className="text-sm font-medium text-slate-200 truncate">{device.name}</span>
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                              {getDeviceCompany(device) && `${getDeviceCompany(device)} / `}
                              {getDeviceProject(device) && `${getDeviceProject(device)} / `}
                              {getDeviceGrid(device) && `${getDeviceGrid(device)} / `}
                              {getDeviceTeam(device)}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-slate-500">已启用</span>
                              {getDeviceRuleNames(device).length > 0 ? (
                                getDeviceRuleNames(device).map(ruleName => (
                                  <span
                                    key={ruleName}
                                    className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[11px] leading-4 text-cyan-200"
                                  >
                                    {ruleName}
                                  </span>
                                ))
                              ) : (
                                <span className="rounded border border-slate-600 bg-slate-900/60 px-1.5 py-0.5 text-[11px] leading-4 text-slate-400">
                                  暂未开启
                                </span>
                              )}
                            </div>
                          </div>
                          {configResults.has(device.id) && (
                            <div className={`text-xs ${configResults.get(device.id)?.success ? 'text-green-400' : 'text-red-400'}`}>
                              {configResults.get(device.id)?.success ? (
                                <CheckCircle size={14} />
                              ) : (
                                <AlertCircle size={14} />
                              )}
                            </div>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 右侧：AI功能选择 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                  <Shield size={18} className="text-purple-400" />
                  AI行为功能选择
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllAlgos}
                    className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30 transition-colors"
                  >
                    全选功能
                  </button>
                  <button
                    onClick={clearAllAlgos}
                    className="text-xs px-2 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
                  >
                    清空功能
                  </button>
                </div>
              </div>

              {selectedDeviceList.length > 0 && (
                <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-200">已选设备当前配置</div>
                    <div className="text-xs text-slate-400">{selectedDeviceList.length} 台设备</div>
                  </div>
                  <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                    {selectedDeviceList.map(device => {
                      const currentRules = getDeviceRuleNames(device);
                      return (
                        <div
                          key={device.id}
                          className="rounded-md border border-slate-700/80 bg-slate-900/40 px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm text-slate-100">{device.name}</span>
                            <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] ${
                              currentRules.length > 0
                                ? 'bg-cyan-500/15 text-cyan-200'
                                : 'bg-slate-700 text-slate-300'
                            }`}>
                              {currentRules.length > 0 ? `${currentRules.length} 项已开启` : '未开启'}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {currentRules.length > 0 ? (
                              currentRules.map(ruleName => (
                                <span
                                  key={ruleName}
                                  className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[11px] text-cyan-200"
                                >
                                  {ruleName}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500">当前没有启用任何行为功能</span>
                            )}
                          </div>
                          {hasPendingChanges && (
                            <div className="mt-2 border-t border-slate-700/70 pt-2">
                              <div className="mb-1 text-[11px] text-amber-300">待应用配置</div>
                              <div className="flex flex-wrap gap-1.5">
                                {selectedAlgoNames.length > 0 ? (
                                  selectedAlgoNames.map(ruleName => (
                                    <span
                                      key={`pending-${ruleName}`}
                                      className="rounded border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-100"
                                    >
                                      {ruleName}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-amber-200/70">将关闭所有行为检测</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <label className={`block rounded-lg border p-4 cursor-pointer transition-colors ${
                faceAssistEnabled
                  ? 'bg-cyan-500/10 border-cyan-500/30'
                  : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
              }`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={faceAssistEnabled}
                    onChange={(event) => setFaceAssistEnabled(event.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  <div className="mt-0.5 rounded-md bg-cyan-500/20 p-1.5 text-cyan-300">
                    <Users size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">
                          人脸识别追溯辅助
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          不作为独立告警算法，开启后随行为检测运行，用于识别违规人员。
                        </div>
                      </div>
                      <span className={`shrink-0 rounded px-2 py-1 text-xs ${
                        faceAssist && faceAssistEnabled
                          ? 'bg-green-500/15 text-green-300 border border-green-500/30'
                          : 'bg-slate-700 text-slate-300 border border-slate-600'
                      }`}>
                        {faceAssist && faceAssistEnabled ? '已挂载' : '未挂载'}
                      </span>
                    </div>
                  </div>
                </div>
              </label>

              {/* AI功能网格 */}
              <div className="bg-slate-800/30 rounded-lg border border-slate-700 p-4">
                <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                  {algos.map(algo => (
                    <label
                      key={algo.id}
                      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                        selectedAlgos.has(algo.id)
                          ? 'bg-purple-500/20 border border-purple-500/50'
                          : 'bg-slate-900/50 border border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAlgos.has(algo.id)}
                        onChange={() => toggleAlgo(algo.id)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <ShieldCheck size={14} className={selectedAlgos.has(algo.id) ? 'text-purple-400' : 'text-slate-500'} />
                          <span className="text-sm font-medium text-slate-200">{algo.name}</span>
                        </div>
                        {algo.desc && (
                          <p className="text-xs text-slate-400 mt-1">{algo.desc}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 启动选项 */}
              <div className="bg-slate-800/30 rounded-lg border border-slate-700 p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoStart}
                    onChange={(e) => setAutoStart(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-200">配置后立即启动AI监控</div>
                    <div className="text-xs text-slate-400">勾选后，配置完成将自动开始AI检测</div>
                  </div>
                </label>
              </div>

              {/* 配置摘要 */}
              {selectedDevices.size > 0 && (
                <div className="bg-cyan-500/10 rounded-lg border border-cyan-500/30 p-4">
                  <div className="text-sm text-cyan-300 mb-2">配置摘要</div>
                  <div className="text-xs text-slate-300 space-y-1">
                    <p>• 将为 <span className="text-cyan-400 font-semibold">{selectedDevices.size}</span> 个设备配置 AI 监控</p>
                    <p>• 每个设备将启用 <span className="text-purple-400 font-semibold">{stats.selectedAlgos}</span> 个 AI 行为功能</p>
                    <p>• 将配置为: {selectedAlgoNames.length > 0 ? selectedAlgoNames.join('、') : '关闭所有行为检测'}</p>
                    <p>• 人脸识别追溯辅助: {faceAssistEnabled ? '已挂载' : '未挂载'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-between p-6 border-t border-slate-700 bg-slate-900/50">
          <div className="text-xs text-slate-400">
            {configuring && (
              <div className="flex items-center gap-2">
                <Loader size={14} className="animate-spin" />
                正在配置中，请稍候...
              </div>
            )}
          </div>
          <div className="flex gap-3">
            {!embedded && onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition-colors"
              >
                取消
              </button>
            )}
            <button
              onClick={applyConfiguration}
              disabled={configuring || selectedDevices.size === 0}
              className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {configuring ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
              {configuring ? '配置中...' : '应用配置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
