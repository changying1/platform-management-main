import React, { useState, useEffect, useRef } from 'react';
import { MenuKey } from '../types';
import { 
  FileText, 
  Search, 
  User, 
  Shield, 
  MapPin, 
  Video, 
  AlertTriangle,
  Settings,
  LogIn,
  X,
  ChevronDown,
  Check,
  Users,
  Building2,
  HardHat,
  Filter,
  Clock,
  Calendar,
  ExternalLink
} from 'lucide-react';

interface SystemLog {
  id: string;
  operator: string;
  action: string;
  targetType: 'fence' | 'project' | 'device' | 'person' | 'alarm' | 'permission' | 'system' | 'login';
  targetName: string;
  details: string;
  time: string;
  company?: string;
  project?: string;
  team?: string;
  extra?: Record<string, any>;
}

const mockLogs: SystemLog[] = [
  {
    id: '1',
    operator: '管理员',
    action: '创建围栏',
    targetType: 'fence',
    targetName: '基坑禁入区',
    details: '',
    time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    company: '中建一局',
    project: '西安地铁8号线',
    team: '土建一队',
    extra: {
      shape: '圆形',
      radius: 50,
      behavior: 'No Entry',
      severity: 'severe',
      scheduleStart: '2026-01-01',
      scheduleEnd: '2026-12-31'
    }
  },
  {
    id: '2',
    operator: '李四',
    action: '添加设备',
    targetType: 'device',
    targetName: '张工的安全帽',
    details: '',
    time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    company: '中建一局',
    project: '西安地铁8号线',
    team: '安装二队',
    extra: {
      holder: '张工',
      deviceId: '1001'
    }
  },
  {
    id: '3',
    operator: '王五',
    action: '处理告警',
    targetType: 'alarm',
    targetName: '非法闯入告警',
    details: '',
    time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    company: '中铁二局',
    project: '郑州地铁3号线',
    team: '安全队',
    extra: {
      alarmType: '越界告警',
      result: '误报',
      triggerBy: '张工安全帽'
    }
  },
  {
    id: '4',
    operator: '管理员',
    action: '删除围栏',
    targetType: 'fence',
    targetName: '办公区禁出区',
    details: '',
    time: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    company: '中建一局',
    project: '西安地铁8号线',
    team: '土建一队'
  },
  {
    id: '5',
    operator: '赵六',
    action: '登录系统',
    targetType: 'login',
    targetName: '登录成功',
    details: '',
    time: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
    company: '中铁二局',
    project: '郑州地铁3号线',
    team: '管理组',
    extra: {
      sessionId: 'SESS20260415001',
      userAgent: 'Chrome'
    }
  },
  {
    id: '6',
    operator: '孙七',
    action: '修改权限',
    targetType: 'permission',
    targetName: '李四权限变更',
    details: '',
    time: new Date(Date.now() - 240 * 60 * 1000).toISOString(),
    company: '中建一局',
    project: '西安地铁8号线',
    team: '管理组',
    extra: {
      targetUser: '李四',
      oldRole: '普通用户',
      newRole: '项目管理员'
    }
  },
  {
    id: '7',
    operator: '周八',
    action: '修改系统设置',
    targetType: 'system',
    targetName: '告警阈值调整',
    details: '',
    time: new Date(Date.now() - 300 * 60 * 1000).toISOString(),
    company: '中铁二局',
    project: '郑州地铁3号线',
    team: '技术组',
    extra: {
      setting: '越界告警延迟',
      oldValue: '5秒',
      newValue: '10秒'
    }
  },
  {
    id: '8',
    operator: '吴九',
    action: '添加人员',
    targetType: 'person',
    targetName: '新员工郑十',
    details: '',
    time: new Date(Date.now() - 360 * 60 * 1000).toISOString(),
    company: '中建一局',
    project: '西安地铁8号线',
    team: '人力资源',
    extra: {
      employeeId: '00256',
      position: '设备运维工程师',
      department: '设备管理部'
    }
  },
];

const actionIcons = {
  fence: <MapPin size={18} />,
  project: <FileText size={18} />,
  device: <Video size={18} />,
  person: <User size={18} />,
  alarm: <AlertTriangle size={18} />,
  permission: <Shield size={18} />,
  system: <Settings size={18} />,
  login: <LogIn size={18} />,
};

const actionColors = {
  fence: 'bg-blue-500/20 text-blue-400',
  project: 'bg-cyan-500/20 text-cyan-400',
  device: 'bg-green-500/20 text-green-400',
  person: 'bg-purple-500/20 text-purple-400',
  alarm: 'bg-orange-500/20 text-orange-400',
  permission: 'bg-red-500/20 text-red-400',
  system: 'bg-slate-500/20 text-slate-400',
  login: 'bg-emerald-500/20 text-emerald-400',
};



const typeLabels: Record<string, string> = {
  all: '全部',
  fence: '围栏',
  device: '设备',
  alarm: '告警',
  login: '登录',
  project: '项目',
  person: '人员',
  permission: '权限',
  system: '系统',
};

const generateLogDetails = (log: SystemLog): string => {
  const parts: string[] = [];
  
  switch (log.targetType) {
    case 'fence':
      if (log.action.includes('创建') || log.action.includes('添加')) {
        parts.push('新建电子围栏');
        if (log.extra?.shape) parts.push(log.extra.shape);
        if (log.extra?.radius) parts.push(`半径${log.extra.radius}米`);
        if (log.extra?.behavior) parts.push(log.extra.behavior === 'No Entry' ? '禁止进入' : '禁止离开');
        if (log.extra?.severity) parts.push(`等级: ${log.extra.severity === 'severe' ? '严重' : log.extra.severity === 'risk' ? '风险' : '一般'}`);
        if (log.extra?.scheduleStart && log.extra?.scheduleEnd) {
          parts.push(`生效: ${log.extra.scheduleStart.slice(0, 10)} ~ ${log.extra.scheduleEnd.slice(0, 10)}`);
        }
      } else if (log.action.includes('删除')) {
        parts.push('移除电子围栏');
        parts.push(`所有关联规则已清除`);
      } else if (log.action.includes('修改') || log.action.includes('编辑')) {
        parts.push('更新围栏配置');
        if (log.extra?.changes) parts.push(log.extra.changes);
      }
      break;
      
    case 'device':
      if (log.action.includes('添加') || log.action.includes('注册')) {
        parts.push('设备已绑定');
        if (log.extra?.holder) parts.push(`持有人: ${log.extra.holder}`);
        if (log.extra?.deviceId) parts.push(`设备ID: ${log.extra.deviceId}`);
      } else if (log.action.includes('删除') || log.action.includes('解绑')) {
        parts.push('设备已解绑');
        if (log.extra?.holder) parts.push(`原持有人: ${log.extra.holder}`);
      }
      break;
      
    case 'alarm':
      if (log.action.includes('处理')) {
        parts.push('告警已处置');
        if (log.extra?.alarmType) parts.push(`类型: ${log.extra.alarmType}`);
        if (log.extra?.result) parts.push(`结果: ${log.extra.result}`);
        if (log.extra?.triggerBy) parts.push(`触发设备: ${log.extra.triggerBy}`);
      }
      break;
      
    case 'login':
      parts.push('身份验证通过');
      if (log.extra?.sessionId) parts.push(`会话: ${log.extra.sessionId}`);
      if (log.extra?.userAgent) parts.push(`终端: ${log.extra.userAgent}`);
      break;
      
    case 'permission':
      parts.push('权限变更');
      if (log.extra?.targetUser) parts.push(`用户: ${log.extra.targetUser}`);
      if (log.extra?.oldRole) parts.push(`从 ${log.extra.oldRole}`);
      if (log.extra?.newRole) parts.push(`升级为 ${log.extra.newRole}`);
      break;
      
    case 'person':
      if (log.action.includes('添加')) {
        parts.push('人员入职');
        if (log.extra?.employeeId) parts.push(`工号: ${log.extra.employeeId}`);
        if (log.extra?.position) parts.push(`岗位: ${log.extra.position}`);
        if (log.extra?.department) parts.push(`部门: ${log.extra.department}`);
      }
      break;
      
    case 'system':
      parts.push('系统参数调整');
      if (log.extra?.setting) parts.push(log.extra.setting);
      if (log.extra?.oldValue) parts.push(`从 ${log.extra.oldValue}`);
      if (log.extra?.newValue) parts.push(`改为 ${log.extra.newValue}`);
      break;
  }
  
  return parts.length > 0 ? parts.join('，') : `${log.action} - ${log.targetName}`;
};

const getNavigateTarget = (targetType: string): MenuKey | null => {
  const map: Record<string, MenuKey> = {
    fence: MenuKey.FENCE,
    device: MenuKey.DASHBOARD,
    alarm: MenuKey.ALARM,
    project: MenuKey.MANAGEMENT,
    person: MenuKey.MANAGEMENT,
    video: MenuKey.VIDEO,
  };
  return map[targetType] || null;
};

const getTargetLabel = (targetType: string): string => {
  const map: Record<string, string> = {
    fence: '查看围栏',
    device: '查看设备',
    alarm: '查看告警',
    project: '查看项目',
    person: '人员管理',
  };
  return map[targetType] || '';
};

interface SystemLogProps {
  onNavigate?: (menuKey: MenuKey) => void;
}

export default function SystemLog({ onNavigate }: SystemLogProps) {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);
  
  const [showTreeFilter, setShowTreeFilter] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [showSearchHint, setShowSearchHint] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const treeFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sortedLogs = [...mockLogs].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    setLogs(sortedLogs);
    setSelectedCompany('all');
    setSelectedProject('all');
    setSelectedTeam('all');
    setFilterType('all');
    setStartDate('');
    setEndDate('');
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (treeFilterRef.current && !treeFilterRef.current.contains(event.target as Node)) {
        setShowTreeFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const companies = ['all', ...new Set(logs.map(l => l.company).filter(Boolean))];
  const projects = selectedCompany === 'all' 
    ? ['all', ...new Set(logs.map(l => l.project).filter(Boolean))]
    : ['all', ...new Set(logs.filter(l => l.company === selectedCompany).map(l => l.project).filter(Boolean))];
  const teams = selectedProject === 'all'
    ? ['all', ...new Set(logs.map(l => l.team).filter(Boolean))]
    : ['all', ...new Set(logs.filter(l => l.project === selectedProject).map(l => l.team).filter(Boolean))];

  const rangeFilteredLogs = logs.filter(log => {
    if (selectedCompany !== 'all' && log.company !== selectedCompany) return false;
    if (selectedProject !== 'all' && log.project !== selectedProject) return false;
    if (selectedTeam !== 'all' && log.team !== selectedTeam) return false;
    return true;
  });

  const dateRangeFilteredLogs = rangeFilteredLogs.filter(log => {
    const logTime = new Date(log.time);
    if (startDate && logTime < new Date(startDate)) return false;
    if (endDate && logTime > new Date(endDate + ' 23:59:59')) return false;
    return true;
  });

  const stats = {
    total: dateRangeFilteredLogs.length,
    fence: dateRangeFilteredLogs.filter(l => l.targetType === 'fence').length,
    device: dateRangeFilteredLogs.filter(l => l.targetType === 'device').length,
    alarm: dateRangeFilteredLogs.filter(l => l.targetType === 'alarm').length,
    login: dateRangeFilteredLogs.filter(l => l.targetType === 'login').length,
    project: dateRangeFilteredLogs.filter(l => l.targetType === 'project').length,
    person: dateRangeFilteredLogs.filter(l => l.targetType === 'person').length,
    permission: dateRangeFilteredLogs.filter(l => l.targetType === 'permission').length,
    system: dateRangeFilteredLogs.filter(l => l.targetType === 'system').length,
  };

  const typeFilteredLogs = filterType === 'all' 
    ? dateRangeFilteredLogs 
    : dateRangeFilteredLogs.filter(log => log.targetType === filterType);

  const filteredLogs = typeFilteredLogs.filter(log => {
    if (searchKeyword) {
      const lowerKeyword = searchKeyword.toLowerCase();
      const autoDetails = generateLogDetails(log).toLowerCase();
      return (
        log.operator.toLowerCase().includes(lowerKeyword) ||
        log.action.toLowerCase().includes(lowerKeyword) ||
        log.targetName.toLowerCase().includes(lowerKeyword) ||
        autoDetails.includes(lowerKeyword) ||
        (log.company && log.company.toLowerCase().includes(lowerKeyword)) ||
        (log.project && log.project.toLowerCase().includes(lowerKeyword)) ||
        (log.team && log.team.toLowerCase().includes(lowerKeyword))
      );
    }
    return true;
  });

  const typeStyles: Record<string, string> = {
    all: 'bg-cyan-500/40 text-white font-bold border-2 border-cyan-400 shadow-lg shadow-cyan-500/20',
    fence: 'bg-blue-500/20 text-blue-400 border border-blue-400/30',
    device: 'bg-green-500/20 text-green-400 border border-green-400/30',
    alarm: 'bg-orange-500/20 text-orange-400 border border-orange-400/30',
    login: 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30',
    project: 'bg-cyan-600/20 text-cyan-500 border border-cyan-500/30',
    person: 'bg-purple-500/20 text-purple-400 border border-purple-400/30',
    permission: 'bg-red-500/20 text-red-400 border border-red-400/30',
    system: 'bg-slate-500/20 text-slate-400 border border-slate-400/30',
  };

  const searchHints = [
    { icon: <User size={16} />, text: '人员、单位、操作类型、详情内容' },
  ];

  const getFilterSummary = () => {
    const parts = [];
    if (selectedCompany !== 'all') parts.push(selectedCompany);
    if (selectedProject !== 'all') parts.push(selectedProject);
    if (selectedTeam !== 'all') parts.push(selectedTeam);
    return parts.length > 0 ? parts.join(' / ') : '全部范围';
  };

  return (
    <div className="h-full overflow-auto p-6">
      {/* 标题栏 + 所有筛选控件放同一行 */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        {/* 左侧：标题 + 类型筛选标签 + 日期筛选 */}
        <div className="flex items-center gap-8">
          <h1 className="text-4xl font-bold text-white flex items-center gap-2">
            <FileText size={32} className="text-cyan-400" />
            系统日志
          </h1>
          
          {/* 类型筛选标签 */}
          <div className="flex items-center gap-2">
            {Object.entries(typeLabels).map(([type, label]) => {
              const count = type === 'all' ? stats.total : stats[type as keyof typeof stats];
              const isActive = filterType === type;
              
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-4 py-2 rounded-full text-base transition-all flex items-center gap-2 ${
                    isActive ? typeStyles[type] : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{label}</span>
                  <span className={`text-base ${isActive ? 'opacity-80' : ''}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* 日期时间筛选 */}
          <div className="flex items-center gap-2 ml-4">
            <Calendar size={20} className="text-cyan-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
            />
            <span className="text-slate-400">至</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-cyan-400 transition-all"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* 右侧：树形筛选 + 搜索框 */}
        <div className="flex items-center gap-4">
          {/* 树形筛选下拉 */}
          <div className="relative" ref={treeFilterRef}>
            <button
              onClick={() => setShowTreeFilter(!showTreeFilter)}
              className="flex items-center gap-2 px-5 py-3 bg-slate-800/80 border border-slate-700 rounded-lg text-base text-slate-200 hover:bg-slate-700/80 transition-all"
            >
              <Filter size={18} className="text-cyan-400" />
              <span>{getFilterSummary()}</span>
              <ChevronDown size={18} className={`transition-transform ${showTreeFilter ? 'rotate-180' : ''}`} />
            </button>

            {showTreeFilter && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-4 border-b border-slate-700">
                  <div className="text-base text-slate-400">选择筛选范围</div>
                </div>
                
                <div className="p-2">
                  <div className="flex items-center gap-2 px-3 py-2 text-base text-slate-400">
                    <Building2 size={16} /> 所属公司
                  </div>
                  {companies.map(c => (
                    <button
                      key={c}
                      onClick={() => { setSelectedCompany(c); setSelectedProject('all'); setSelectedTeam('all'); }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded text-base transition-all ${
                        selectedCompany === c 
                          ? 'bg-cyan-500/20 text-cyan-400' 
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{c === 'all' ? '全部公司' : c}</span>
                      {selectedCompany === c && <Check size={16} />}
                    </button>
                  ))}
                </div>

                <div className="p-2 border-t border-slate-700/50">
                  <div className="flex items-center gap-2 px-3 py-2 text-base text-slate-400">
                    <FileText size={16} /> 所属项目
                  </div>
                  {projects.map(p => (
                    <button
                      key={p}
                      onClick={() => { setSelectedProject(p); setSelectedTeam('all'); }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded text-base transition-all pl-8 ${
                        selectedProject === p 
                          ? 'bg-cyan-500/20 text-cyan-400' 
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{p === 'all' ? '全部项目' : p}</span>
                      {selectedProject === p && <Check size={16} />}
                    </button>
                  ))}
                </div>

                <div className="p-2 border-t border-slate-700/50">
                  <div className="flex items-center gap-2 px-3 py-2 text-base text-slate-400">
                    <Users size={16} /> 所属工队
                  </div>
                  {teams.map(t => (
                    <button
                      key={t}
                      onClick={() => setSelectedTeam(t)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded text-base transition-all pl-12 ${
                        selectedTeam === t 
                          ? 'bg-cyan-500/20 text-cyan-400' 
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{t === 'all' ? '全部工队' : t}</span>
                      {selectedTeam === t && <Check size={16} />}
                    </button>
                  ))}
                </div>

                <div className="p-4 border-t border-slate-700 flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedCompany('all');
                      setSelectedProject('all');
                      setSelectedTeam('all');
                    }}
                    className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-base transition-all"
                  >
                    重置
                  </button>
                  <button
                    onClick={() => setShowTreeFilter(false)}
                    className="flex-1 py-2.5 bg-cyan-500/30 text-cyan-400 hover:bg-cyan-500/40 rounded-lg text-base transition-all"
                  >
                    确定
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 搜索框 */}
          <div className="relative w-80">
            <Search size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-cyan-400" />
            <input
              type="text"
              placeholder="搜索..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onFocus={() => setShowSearchHint(true)}
              onBlur={() => setTimeout(() => setShowSearchHint(false), 200)}
              className="w-full bg-slate-800/80 border border-slate-700 rounded-lg pl-12 pr-5 py-3 text-base text-slate-200"
            />
            
            {showSearchHint && (
              <div className="absolute right-0 top-full mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 p-4">
                {searchHints.map((hint, i) => (
                  <div key={i} className="flex items-center gap-2 py-2">
                    <span className="text-cyan-400">{hint.icon}</span>
                    <span className="text-base text-slate-300">{hint.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 筛选状态提示 */}
      {filterType !== 'all' && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-slate-400 text-lg">当前筛选：</span>
          <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-lg">
            {typeLabels[filterType]} ({filteredLogs.length} 条)
          </span>
          <button 
            onClick={() => setFilterType('all')}
            className="text-base text-slate-500 hover:text-cyan-400 underline"
          >
            点击显示全部
          </button>
        </div>
      )}

      {/* 日志表格 */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-700/50">
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">类型</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">操作人员</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">操作行为</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">操作对象</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">所属单位</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">详情</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                <Clock size={16} className="inline mr-1" />
                操作时间
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log, index) => (
              <tr 
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className={`border-b border-slate-700/30 cursor-pointer transition-all hover:bg-slate-800/50 ${
                  index % 2 === 0 ? 'bg-slate-800/20' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm ${actionColors[log.targetType]}`}>
                    {actionIcons[log.targetType]}
                    {typeLabels[log.targetType]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-base font-medium text-white">{log.operator}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-base text-slate-300">{log.action}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-base text-slate-400">{log.targetName}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-slate-300">{log.company}</span>
                    <span className="text-xs text-slate-500">{log.project} · {log.team}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500 max-w-sm truncate flex-1" title={generateLogDetails(log)}>
                      {generateLogDetails(log)}
                    </span>
                    {onNavigate && getNavigateTarget(log.targetType) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const target = getNavigateTarget(log.targetType);
                          if (target) onNavigate(target);
                        }}
                        className="flex-shrink-0 p-1 hover:bg-cyan-500/20 rounded text-cyan-400 hover:text-cyan-300 transition-all"
                        title={getTargetLabel(log.targetType)}
                      >
                        <ExternalLink size={14} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-500">
                    {new Date(log.time).toLocaleString()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredLogs.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <FileText size={56} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg">暂无日志记录</p>
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {selectedLog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 shadow-2xl p-6 w-[600px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${actionColors[selectedLog.targetType]}`}>
                  {actionIcons[selectedLog.targetType]}
                </div>
                <h3 className="text-2xl font-bold text-white">日志详情</h3>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-slate-700 rounded">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            
            <div className="space-y-3 text-base">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400">操作人员：</span>
                  <span className="text-slate-200">{selectedLog.operator}</span>
                </div>
                <div>
                  <span className="text-slate-400">操作类型：</span>
                  <span className="text-slate-200">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-slate-400">操作对象：</span>
                  <span className="text-slate-200">{selectedLog.targetName}</span>
                </div>
                <div>
                  <span className="text-slate-400">操作时间：</span>
                  <span className="text-slate-200">{new Date(selectedLog.time).toLocaleString()}</span>
                </div>
                {selectedLog.company && (
                  <div>
                    <span className="text-slate-400">所属公司：</span>
                    <span className="text-slate-200">{selectedLog.company}</span>
                  </div>
                )}
                {selectedLog.project && (
                  <div>
                    <span className="text-slate-400">所属项目：</span>
                    <span className="text-slate-200">{selectedLog.project}</span>
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-slate-400">详细信息：</span>
                  <p className="text-slate-200 mt-1">{generateLogDetails(selectedLog)}</p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              {onNavigate && selectedLog && getNavigateTarget(selectedLog.targetType) && (
                <button
                  onClick={() => {
                    const target = getNavigateTarget(selectedLog.targetType);
                    if (target) {
                      setSelectedLog(null);
                      onNavigate(target);
                    }
                  }}
                  className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-lg font-medium transition-all flex items-center justify-center gap-2"
                >
                  <ExternalLink size={18} />
                  {getTargetLabel(selectedLog.targetType)}
                </button>
              )}
              <button onClick={() => setSelectedLog(null)} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-lg font-medium transition-all">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
