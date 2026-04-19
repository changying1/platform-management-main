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
} from 'lucide-react';
import {
  startAIMonitoring,
  stopAIMonitoring,
  updateDeviceRules,
  getAIRules,
  Video,
  AIRule,
} from '../api/videoApi';

interface SmartMonitoringConfigProps {
  devices: Video[];
  onClose: () => void;
  onSuccess?: () => void;
  // ✅ 新增：初始选中的设备ID列表
  initialSelectedDeviceIds?: number[];
  // ✅ 新增：初始选中的算法ID列表
  initialSelectedAlgoIds?: string[];
}

interface DeviceFilter {
  company: string;
  project: string;
  status: string;
  searchText: string;
}

interface BindingConfig {
  deviceIds: number[];
  algoIds: string[];
  autoStart: boolean;
}

export default function SmartMonitoringConfig({ 
  devices, 
  onClose, 
  onSuccess,
  initialSelectedDeviceIds = [],
  initialSelectedAlgoIds = []
}: SmartMonitoringConfigProps) {
  
  const [algos, setAlgos] = useState<Array<{ id: string; name: string; desc?: string }>>([]);
  const [filter, setFilter] = useState<DeviceFilter>({
    company: 'all',
    project: 'all',
    status: 'all',
    searchText: '',
  });
  
  const [selectedDevices, setSelectedDevices] = useState<Set<number>>(
    () => new Set(initialSelectedDeviceIds)
  );
  const [selectedAlgos, setSelectedAlgos] = useState<Set<string>>(
    () => new Set(initialSelectedAlgoIds)
  );
  
  const [autoStart, setAutoStart] = useState(true);
  const [configuring, setConfiguring] = useState(false);
  const [configResults, setConfigResults] = useState<Map<number, { success: boolean; message: string }>>(new Map());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['filter']));
  const [showPreview, setShowPreview] = useState(false);
  const [isAlgosLoaded, setIsAlgosLoaded] = useState(false); // ✅ 添加标记

  // ✅ 只保留一个 fetchAIRules 调用
  useEffect(() => {
    fetchAIRules();
  }, []);

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

  // ✅ 删除重复的 useEffect（第 86 行附近的那个）

  const fetchAIRules = async () => {
    const defaultAlgos = [
      { id: "helmet", name: "安全帽检测", desc: "检测安全帽佩戴情况" },
      { id: "smoking", name: "抽烟检测", desc: "检测人员抽烟行为" },
      { id: "face_recognition", name: "人脸识别", desc: "识别并比对人员身份" },
      { id: "signage", name: "现场标识类", desc: "识别现场安全标识" },
      { id: "supervisor_count", name: "现场监督人数统计", desc: "统计监督人员数量" },
      { id: "ladder_angle", name: "梯子角度类", desc: "检测梯子使用角度" },
      { id: "hole_curb", name: "孔口挡坎违规类", desc: "检测孔口挡坎合规性" },
      { id: "unauthorized_person", name: "围栏入侵管理类", desc: "检测非法入侵" },
    ];
    
    setAlgos(defaultAlgos);
    
    try {
      const rules: AIRule[] = await getAIRules();
      if (rules && rules.length > 0) {
        const mapped = rules.map((rule) => ({
          id: rule.key,
          name: rule.desc || rule.key,
          desc: rule.desc,
        }));
        setAlgos(mapped);
      }
    } catch (e) {
      console.log("后端AI规则暂不可用，使用默认列表");
    }
  };

  const companies = ['all', ...new Set(devices.map(d => d.company).filter(Boolean))];
  const getProjectsByCompany = () => {
    if (filter.company === 'all') {
      return ['all', ...new Set(devices.map(d => d.project).filter(Boolean))];
    }
    const projects = devices
      .filter(d => d.company === filter.company)
      .map(d => d.project)
      .filter(Boolean);
    return ['all', ...new Set(projects)];
  };
  const projects = getProjectsByCompany();

  // 过滤设备
  const filteredDevices = devices.filter(device => {
    if (filter.company !== 'all' && device.company !== filter.company) return false;
    if (filter.project !== 'all' && device.project !== filter.project) return false;
    if (filter.status !== 'all' && device.status !== filter.status) return false;
    if (filter.searchText && !device.name.toLowerCase().includes(filter.searchText.toLowerCase()) &&
        !device.ip_address?.includes(filter.searchText)) return false;
    return true;
  });

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
  };

  // 切换算法选择
  const toggleAlgo = (algoId: string) => {
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
    setSelectedAlgos(new Set(algos.map(a => a.id)));
  };

  // 清空算法选择
  const clearAllAlgos = () => {
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
    const algoString = Array.from(selectedAlgos).join(',');
    const algoList = Array.from(selectedAlgos);
    const shouldStartMonitoring = autoStart && algoList.length > 0;

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
      if (!streamSource) {
        setConfigResults(prev => new Map(prev).set(deviceId, {
          success: false,
          message: '缺少可用流地址(rtsp/stream_url)'
        }));
        continue;
      }

      try {
        await updateDeviceRules(deviceId, algoList);

        // 先停止现有的监控
        await stopAIMonitoring(String(deviceId));

        // 启动新的监控；如果没有选择算法，则表示关闭 AI
        if (shouldStartMonitoring) {
          // 优先尝试一次性传入多算法；若后端不支持，再降级为逐个算法启动
          try {
            await startAIMonitoring(String(deviceId), streamSource, algoString);
          } catch (batchError: any) {
            const selectedAlgoList = Array.from(selectedAlgos);
            if (selectedAlgoList.length <= 1) {
              throw batchError;
            }

            for (const algo of selectedAlgoList) {
              await startAIMonitoring(String(deviceId), streamSource, algo);
            }
          }
        }

        const resultMessage = algoList.length > 0
          ? `已配置 ${algoList.length} 个AI功能`
          : '已关闭 AI 监控';

        setConfigResults(prev => new Map(prev).set(deviceId, {
          success: true,
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
    if (onSuccess) onSuccess();
    
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
    selectedAlgos: selectedAlgos.size,
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
    <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl border border-cyan-500/30 shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        
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
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* 统计卡片 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="text-2xl font-bold text-cyan-400">{stats.totalDevices}</div>
              <div className="text-sm text-slate-400">总设备数</div>
            </div>
            {/* <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="text-2xl font-bold text-blue-400">{stats.filteredDevices}</div>
              <div className="text-sm text-slate-400">筛选后设备</div>
            </div> */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="text-2xl font-bold text-green-400">{stats.selectedDevices}</div>
              <div className="text-sm text-slate-400">已选设备</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="text-2xl font-bold text-purple-400">{stats.selectedAlgos}</div>
              <div className="text-sm text-slate-400">已选功能</div>
            </div>
          </div>

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
              <div className="bg-slate-800/30 rounded-lg border border-slate-700 p-4 space-y-3">
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleGroup('filter')}
                >
                  <div className="flex items-center gap-2 text-slate-300 font-medium">
                    <Filter size={14} />
                    筛选条件
                  </div>
                  {expandedGroups.has('filter') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
                
                {expandedGroups.has('filter') && (
                  <div className="space-y-3 pt-2">
                    {/* 搜索框 */}
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="搜索设备名称或IP..."
                        value={filter.searchText}
                        onChange={(e) => setFilter({ ...filter, searchText: e.target.value })}
                        className="w-full bg-slate-900/50 border border-slate-600 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <select
                        value={filter.company}
                        onChange={(e) => setFilter({ ...filter, company: e.target.value, project: 'all' })}
                        className="bg-slate-900/50 border border-slate-600 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                      >
                        {companies.map(c => (
                          <option key={c} value={c}>{c === 'all' ? '全部公司' : c}</option>
                        ))}
                      </select>

                      <select
                        value={filter.project}
                        onChange={(e) => setFilter({ ...filter, project: e.target.value })}
                        className="bg-slate-900/50 border border-slate-600 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                      >
                        {projects.map(p => (
                          <option key={p} value={p}>{p === 'all' ? '全部项目' : p}</option>
                        ))}
                      </select>

                      <select
                        value={filter.status}
                        onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                        className="bg-slate-900/50 border border-slate-600 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                      >
                        <option value="all">全部状态</option>
                        <option value="online">在线</option>
                        <option value="offline">离线</option>
                      </select>
                    </div>
                  </div>
                )}
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
                              {device.company && `${device.company} / `}{device.project}
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
                  AI功能选择
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
              {selectedDevices.size > 0 && selectedAlgos.size > 0 && (
                <div className="bg-cyan-500/10 rounded-lg border border-cyan-500/30 p-4">
                  <div className="text-sm text-cyan-300 mb-2">配置摘要</div>
                  <div className="text-xs text-slate-300 space-y-1">
                    <p>• 将为 <span className="text-cyan-400 font-semibold">{selectedDevices.size}</span> 个设备配置 AI 监控</p>
                    <p>• 每个设备将启用 <span className="text-purple-400 font-semibold">{selectedAlgos.size}</span> 个 AI 功能</p>
                    <p>• 功能列表: {Array.from(selectedAlgos).map(id => algos.find(a => a.id === id)?.name).join(', ')}</p>
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
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition-colors"
            >
              取消
            </button>
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