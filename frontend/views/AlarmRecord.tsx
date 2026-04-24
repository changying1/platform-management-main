import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { alarmApi, toStaticUrl, type AlarmResponse } from '../src/api/alarmApi';
import { 
  Bell, 
  ShieldAlert, 
  Video, 
  MapPin, 
  User, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  Calendar,
  Search,
  X,
  Filter
} from 'lucide-react';

// 告警记录类型
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
  team?: string;
  snapshot?: string;
  videoPath?: string;
  fenceId?: string;
  fenceName?: string;
}

// 模拟围栏告警数据
const mockFenceAlarms: AlarmRecord[] = [
  {
    id: 'f1',
    type: 'fence',
    title: '非法闯入',
    description: '张工的安全帽进入基坑禁入区',
    time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    level: 'high',
    status: 'pending',
    location: '西安地铁8号线-基坑禁入区',
    deviceName: '张工的安全帽',
    deviceId: '1001',
    team: '土建工队',
    fenceId: '1',
    fenceName: '基坑禁入区'
  },
  {
    id: 'f2',
    type: 'fence',
    title: '非法越界',
    description: '李工的安全帽离开办公区',
    time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    level: 'medium',
    status: 'pending',
    location: '西安地铁8号线-办公区禁出区',
    deviceName: '李工的安全帽',
    deviceId: '1002',
    team: '机电工队',
    fenceId: '2',
    fenceName: '办公区禁出区'
  },
  {
    id: 'f3',
    type: 'fence',
    title: '非法闯入',
    description: '王工的定位器进入隧道施工区',
    time: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    level: 'high',
    status: 'resolved',
    location: '西安地铁10号线-隧道施工区',
    deviceName: '王工的定位器',
    deviceId: '1003',
    team: '隧道工队',
    fenceId: '3',
    fenceName: '隧道施工区'
  },
];

// 模拟视频告警数据
const mockVideoAlarms: AlarmRecord[] = [
  {
    id: 'v1',
    type: 'video',
    title: '未佩戴安全帽',
    description: '施工人员未佩戴安全帽',
    time: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    level: 'high',
    status: 'pending',
    location: '西安地铁8号线-基坑施工区',
    deviceName: '摄像头-基坑东侧',
    deviceId: 'cam001',
    team: '安全工队',
    snapshot: '/images/alarm-snapshot.jpg'
  },
  {
    id: 'v2',
    type: 'video',
    title: '区域入侵',
    description: '无关人员进入危险区域',
    time: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    level: 'high',
    status: 'pending',
    location: '隧道入口',
    deviceName: '摄像头-隧道口',
    deviceId: 'cam002',
  },
  {
    id: 'v3',
    type: 'video',
    title: '人员摔倒',
    description: '检测到人员异常倒地',
    time: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
    level: 'medium',
    status: 'resolved',
    location: '办公区走廊',
    deviceName: '摄像头-办公区',
    deviceId: 'cam003',
  },
];
// 模拟分公司、项目和工队数据
const companyTree = [
  {
    id: '中铁一局',
    name: '中铁一局',
    projects: [
      { name: '西安地铁8号线', teams: ['土建工队', '机电工队', '安全工队'] },
      { name: '西安地铁10号线', teams: ['土建工队', '机电工队'] }
    ]
  },
  {
    id: '中铁隧道局',
    name: '中铁隧道局',
    projects: [
      { name: '西安地铁10号线', teams: ['隧道工队', '安全工队'] }
    ]
  }
];
export default function AlarmRecords() {
  const [activeTab, setActiveTab] = useState<'all' | 'fence' | 'video'>('all');
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [selectedAlarm, setSelectedAlarm] = useState<AlarmRecord | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
const [searchKeyword, setSearchKeyword] = useState('');
const [startDate, setStartDate] = useState<string>('');
const [endDate, setEndDate] = useState<string>('');
const [showDatePicker, setShowDatePicker] = useState(false); 
const [datePickerPos, setDatePickerPos] = useState<{ top: number; left: number } | null>(null);
const datePickerRef = useRef<HTMLDivElement>(null);
const [showProcessModal, setShowProcessModal] = useState(false);
const [processingAlarm, setProcessingAlarm] = useState<AlarmRecord | null>(null);
const [processRemark, setProcessRemark] = useState('');
const [processAction, setProcessAction] = useState<'resolved' | 'ignored'>('resolved');
const [showFilterTree, setShowFilterTree] = useState(false);
const [selectedCompany, setSelectedCompany] = useState<string>('all');
const [selectedProject, setSelectedProject] = useState<string>('all');
const [selectedTeam, setSelectedTeam] = useState<string>('all');
const [filterTreePos, setFilterTreePos] = useState<{ top: number; left: number } | null>(null);
const filterTreeRef = useRef<HTMLDivElement>(null);
const mapAlarmFromApi = (item: AlarmResponse): AlarmRecord => {
  const isFence = item.fence_id !== undefined && item.fence_id !== null;

  const rawType = String(item.alarm_type || '');
  const title = rawType || (isFence ? '围栏告警' : '视频告警');

  const locationText =
    item.location && String(item.location).trim()
      ? String(item.location)
      : '未提供位置';

  const rawItem = item as any;
  const team = rawItem.team || rawItem.team_name || rawItem.work_team || '';

  return {
    id: String(item.id),
    type: isFence ? 'fence' : 'video',
    title,
    description: item.description || '',
    time: item.timestamp,
    level:
      item.severity === 'HIGH'
        ? 'high'
        : item.severity === 'MEDIUM'
          ? 'medium'
          : 'low',
    status:
      item.status === 'pending' || item.status === 'resolved' || item.status === 'ignored'
        ? item.status
        : 'pending',
    location: locationText,
    deviceName: rawItem.device_name || rawItem.video_name || `设备-${item.device_id}`,
    deviceId: String(item.device_id),
    team: team || undefined,
    snapshot: toStaticUrl(item.alarm_image_path),
    videoPath: toStaticUrl(item.recording_path),
    fenceId:
      item.fence_id !== undefined && item.fence_id !== null
        ? String(item.fence_id)
        : undefined,
    fenceName: isFence ? locationText : undefined,
  };
};
const loadAlarms = async () => {
  try {
    const projectId =
      selectedProject !== 'all' && /^\d+$/.test(selectedProject)
        ? Number(selectedProject)
        : undefined;

    const data = await alarmApi.getAlarms(projectId);
    const mapped = data
      .map(mapAlarmFromApi)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    setAlarms(mapped);
  } catch (error) {
    console.error('加载告警记录失败:', error);
    setAlarms([]);
  }
};

useEffect(() => {
  loadAlarms();
}, [selectedProject]);

// 监听新告警事件
useEffect(() => {
  const handleAlarmAdded = async () => {
    await loadAlarms();
  };

  window.addEventListener('alarmAdded', handleAlarmAdded as EventListener);
  return () => window.removeEventListener('alarmAdded', handleAlarmAdded as EventListener);
}, [selectedProject]);

  // useEffect(() => {
  //   // 合并围栏和视频告警数据
  //   const allAlarms = [...mockFenceAlarms, ...mockVideoAlarms].sort(
  //     (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  //   );
  //   setAlarms(allAlarms);
  // }, []);

  useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
      setShowDatePicker(false);
    }
  };
  if (showDatePicker) {
    document.addEventListener('mousedown', handleClickOutside);
  }
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [showDatePicker]);

useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (filterTreeRef.current && !filterTreeRef.current.contains(event.target as Node)) {
      setShowFilterTree(false);
    }
  };
  if (showFilterTree) {
    document.addEventListener('mousedown', handleClickOutside);
  }

  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [showFilterTree]);
  const clearDateFilter = () => {
  setStartDate('');
  setEndDate('');
};

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'medium': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  const getLevelText = (level: string) => {
    switch (level) {
      case 'high': return '严重';
      case 'medium': return '一般';
      default: return '提示';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-400';
      case 'resolved': return 'bg-green-500/20 text-green-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '待处理';
      case 'resolved': return '已处理';
      default: return '已忽略';
    }
  };
const handleOpenProcessModal = (alarm: AlarmRecord, action: 'resolved' | 'ignored') => {
  setProcessingAlarm(alarm);
  setProcessAction(action);
  setProcessRemark('');
  setShowProcessModal(true);
};

const handleConfirmProcess = async () => {
  if (!processingAlarm) return;

  try {
    if (processAction === 'resolved') {
      await alarmApi.resolveAlarm(Number(processingAlarm.id));
    } else {
      await alarmApi.updateAlarm(Number(processingAlarm.id), { status: 'ignored' });
    }

    await loadAlarms();

    setShowProcessModal(false);
    setProcessingAlarm(null);
    setSelectedAlarm(null);
  } catch (error) {
    console.error('处理告警失败:', error);
  }
};

  const filteredAlarms = alarms.filter(alarm => {
    // 类型筛选
    if (activeTab !== 'all' && alarm.type !== activeTab) return false;
    // 状态筛选
    if (filterStatus !== 'all' && alarm.status !== filterStatus) return false;
    // 分公司筛选：优先兼容后端字段，其次用位置/描述做低风险前端判断
    if (selectedCompany !== 'all') {
      const searchableText = `${alarm.location} ${alarm.description} ${alarm.deviceName} ${alarm.team || ''}`;

      if (selectedCompany === '中铁一局') {
        if (!searchableText.includes('中铁一局') && !searchableText.includes('8号线')) {
          return false;
        }
      } else if (selectedCompany === '中铁隧道局') {
        if (!searchableText.includes('中铁隧道局') && !searchableText.includes('10号线') && !searchableText.includes('隧道')) {
          return false;
        }
      }
    }

    // 项目筛选：当前 selectedProject 是项目名称，不传给后端，只在前端筛选
    if (selectedProject !== 'all') {
      const searchableText = `${alarm.location} ${alarm.description} ${alarm.deviceName}`;
      if (!searchableText.includes(selectedProject)) {
        return false;
      }
    }

    // 工队筛选
    if (selectedTeam !== 'all') {
      const searchableText = `${alarm.team || ''} ${alarm.description} ${alarm.location}`;
      if (!searchableText.includes(selectedTeam)) {
        return false;
      }
    }

    // 关键词搜索
    if (searchKeyword && 
    !alarm.title.includes(searchKeyword) && 
    !alarm.description.includes(searchKeyword) &&
    !alarm.deviceName.includes(searchKeyword) &&
    !alarm.location.includes(searchKeyword)
) return false;
    
    // 日期范围筛选
    const alarmDate = new Date(alarm.time);
    if (startDate && alarmDate < new Date(startDate)) return false;
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      if (alarmDate > endDateTime) return false;
    }
    return true;
  });

  const stats = {
    total: alarms.length,
    pending: alarms.filter(a => a.status === 'pending').length,
    fence: alarms.filter(a => a.type === 'fence').length,
    video: alarms.filter(a => a.type === 'video').length,
  };

  return (
    <div className="h-full overflow-auto p-6">
      {/* 标题 + 统计卡片 */}
      <div className="flex justify-between items-start mb-6">
        {/* 标题 */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Bell size={28} className="text-cyan-400" />
            告警记录
          </h1>
          <p className="text-slate-400 text-sm mt-1">查看和管理所有围栏告警及视频分析告警</p>
        </div>

        {/* 统计卡片 - 右上角紧凑布局 */}
        <div className="flex gap-3">
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-cyan-400/30 px-4 py-2.5 flex items-center gap-2">
            <Bell size={16} className="text-cyan-400" />
            <span className="text-slate-400 text-sm">总数</span>
            <span className="text-cyan-400 font-bold text-base">{stats.total}</span>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-yellow-400/30 px-4 py-2.5 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-400" />
            <span className="text-slate-400 text-sm">待处理</span>
            <span className="text-yellow-400 font-bold text-base">{stats.pending}</span>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-blue-400/30 px-4 py-2.5 flex items-center gap-2">
            <ShieldAlert size={16} className="text-blue-400" />
            <span className="text-slate-400 text-sm">围栏</span>
            <span className="text-blue-400 font-bold text-base">{stats.fence}</span>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-purple-400/30 px-4 py-2.5 flex items-center gap-2">
            <Video size={16} className="text-purple-400" />
            <span className="text-slate-400 text-sm">视频</span>
            <span className="text-purple-400 font-bold text-base">{stats.video}</span>
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-cyan-400/30 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Tab切换 */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'all'
                  ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setActiveTab('fence')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'fence'
                  ? 'bg-blue-500/30 text-blue-300 border border-blue-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldAlert size={14} />
              围栏告警
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'video'
                  ? 'bg-purple-500/30 text-purple-300 border border-purple-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Video size={14} />
              视频告警
            </button>
          </div>

          {/* 状态筛选 */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            <option value="all">全部状态</option>
            <option value="pending">待处理</option>
            <option value="resolved">已处理</option>
          </select>
          {/* 树形筛选按钮 */}
<div className="relative">
<button
  onClick={(e) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setFilterTreePos({ top: rect.bottom + 8, left: rect.left });
    setShowFilterTree(!showFilterTree);
  }}
  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
      selectedCompany !== 'all' || selectedProject !== 'all'
        ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
        : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600'
    }`}
  >
    <Filter size={14} />
    <span>
      {selectedCompany !== 'all' && selectedProject !== 'all'
        ? `${selectedCompany} / ${selectedProject}`
        : selectedCompany !== 'all'
          ? selectedCompany
          : selectedProject !== 'all'
            ? selectedProject
            : '分公司/项目'}
    </span>
  </button>
  
{showFilterTree && filterTreePos && createPortal(
  <div 
    className="fixed z-[9999] bg-slate-800 rounded-xl border border-cyan-400/30 shadow-2xl p-4 min-w-[260px]"
    style={{ top: filterTreePos.top, left: filterTreePos.left }}
    ref={filterTreeRef}
  >
    <div className="space-y-3">
      <div className="flex justify-between items-center border-b border-slate-700 pb-2">
        <span className="text-sm font-medium text-white">筛选</span>
        <button
          onClick={() => {
            setSelectedCompany('all');
            setSelectedProject('all');
            setSelectedTeam('all');
            setShowFilterTree(false);
          }}
          className="text-xs text-cyan-400 hover:text-cyan-300"
        >
          清除筛选
        </button>
      </div>
      
      {companyTree.map(company => (
        <div key={company.id} className="space-y-2">
          <button
            onClick={() => {
              setSelectedCompany(selectedCompany === company.id ? 'all' : company.id);
              setSelectedProject('all');
              setSelectedTeam('all');
            }}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-all ${
              selectedCompany === company.id
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            📁 {company.name}
          </button>
          {selectedCompany === company.id && (
            <div className="ml-4 space-y-1 border-l border-cyan-400/30 pl-2">
              {company.projects.map((project: { name: string; teams: string[] }) => (
                <div key={project.name} className="space-y-1">
                  <button
                    onClick={() => {
                      setSelectedProject(selectedProject === project.name ? 'all' : project.name);
                      setSelectedTeam('all');
                    }}
                    className={`w-full text-left px-2 py-1 rounded-lg text-xs transition-all ${
                      selectedProject === project.name
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    📂 {project.name}
                  </button>
                  {selectedProject === project.name && (
                    <div className="ml-4 space-y-1 border-l border-cyan-400/30 pl-2">
                      {project.teams.map(team => (
                        <button
                          key={team}
                          onClick={() => setSelectedTeam(selectedTeam === team ? 'all' : team)}
                          className={`w-full text-left px-2 py-0.5 rounded-lg text-xs transition-all ${
                            selectedTeam === team
                              ? 'bg-orange-500/20 text-orange-300'
                              : 'text-slate-500 hover:bg-slate-700'
                          }`}
                        >
                          👥 {team}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      
      <div className="flex gap-2 pt-2 border-t border-slate-700">
        <button
          onClick={() => setShowFilterTree(false)}
          className="flex-1 py-1.5 bg-cyan-500 hover:bg-cyan-600 rounded-lg text-xs transition-all"
        >
          确定
        </button>
      </div>
    </div>
  </div>,
  document.body
)}
</div>

{/* 日期区间筛选 */}
<div className="relative">
<button
onClick={(e) => {
  const rect = (e.target as HTMLElement).getBoundingClientRect();
  // 让日期选择器左边和按钮左边对齐
  setDatePickerPos({ top: rect.bottom + 8, left: rect.left });
  setShowDatePicker(!showDatePicker);
}}
  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
      startDate || endDate
        ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
        : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600'
    }`}
  >
    <Calendar size={14} />
    <span>
      {startDate && endDate 
        ? `${startDate} ~ ${endDate}`
        : startDate 
          ? `≥ ${startDate}`
          : endDate 
            ? `≤ ${endDate}`
            : '按日期筛选'}
    </span>
  </button>
  
{/* 日期选择器 - 使用 Portal 渲染到 body */}
{showDatePicker && datePickerPos && createPortal(
  <div 
    className="fixed z-[9999] bg-slate-800 rounded-xl border border-cyan-400/30 shadow-2xl p-4 min-w-[280px]"
    style={{ 
      top: datePickerPos.top, 
      left: datePickerPos.left,
    }}
    ref={datePickerRef}
  >
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">开始日期</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">结束日期</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <button
          onClick={clearDateFilter}
          className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs transition-all"
        >
          清除
        </button>
        <button
          onClick={() => setShowDatePicker(false)}
          className="flex-1 py-1.5 bg-cyan-500 hover:bg-cyan-600 rounded-lg text-xs transition-all"
        >
          确定
        </button>
      </div>
    </div>
  </div>,
  document.body
)}
</div>

          {/* 搜索框 */}
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
            <input
              type="text"
              placeholder="搜索告警内容..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200"
            />
          </div>
        </div>
      </div>

      {/* 告警列表 - 表格型 */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-blue-400/20 bg-slate-800/50">
              <tr>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">类型</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">告警名称</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">等级</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">状态</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">工队</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">位置</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">设备</th>
                <th className="px-4 py-3.5 text-left text-sm font-semibold text-slate-300">时间</th>
                <th className="px-4 py-3.5 text-right text-sm font-semibold text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredAlarms.map(alarm => (
                <tr 
                   key={alarm.id} 
                   onClick={() => setSelectedAlarm(alarm)}
                   className={`hover:bg-slate-800/30 cursor-pointer transition-colors ${
                     alarm.status === 'pending' ? 'bg-red-500/5' : ''
                   }`}
                 >
                   <td className="px-4 py-4">
                     <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                       alarm.type === 'fence' ? 'bg-blue-500/20' : 'bg-purple-500/20'
                     }`}>
                       {alarm.type === 'fence' ? (
                         <ShieldAlert size={16} className="text-blue-400" />
                       ) : (
                         <Video size={16} className="text-purple-400" />
                       )}
                     </div>
                   </td>
                   <td className="px-4 py-4">
                     <div className="text-base text-white font-medium">{alarm.title}</div>
                     <div className="text-sm text-slate-400 mt-1">{alarm.description}</div>
                   </td>
                   <td className="px-4 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full border ${getLevelColor(alarm.level)}`}>
                        {getLevelText(alarm.level)}
                      </span>
                   </td>
                   <td className="px-4 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full ${getStatusColor(alarm.status)}`}>
                        {getStatusText(alarm.status)}
                      </span>
                   </td>
                   <td className="px-4 py-4">
                     <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                       {alarm.team || '-'}
                     </span>
                   </td>
                   <td className="px-4 py-4">
                     <div className="flex items-center gap-1 text-sm text-slate-300">
                       <MapPin size={14} className="text-slate-500" />
                       {alarm.location}
                     </div>
                   </td>
                   <td className="px-4 py-4">
                     <div className="flex items-center gap-1 text-sm text-slate-300">
                       <User size={14} className="text-slate-500" />
                       {alarm.deviceName}
                     </div>
                   </td>
                   <td className="px-4 py-4">
                     <div className="flex items-center gap-1 text-sm text-slate-300">
                       <Clock size={14} className="text-slate-500" />
                       {new Date(alarm.time).toLocaleString()}
                     </div>
                   </td>
                   <td className="px-4 py-4 text-right">
                     {alarm.status === 'pending' && (
                       <button
                         onClick={(e) => { e.stopPropagation(); handleOpenProcessModal(alarm, 'resolved'); }}
                         className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1"
                       >
                         <CheckCircle size={14} />
                         处理
                       </button>
                     )}
                   </td>
                 </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAlarms.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Bell size={48} className="mx-auto mb-3 opacity-30" />
            <p>暂无告警记录</p>
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {selectedAlarm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedAlarm(null)}>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 shadow-2xl p-6 w-[500px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedAlarm.type === 'fence' ? 'bg-blue-500/20' : 'bg-purple-500/20'
                }`}>
                  {selectedAlarm.type === 'fence' ? (
                    <ShieldAlert size={20} className="text-blue-400" />
                  ) : (
                    <Video size={20} className="text-purple-400" />
                  )}
                </div>
                <h3 className="text-xl font-bold text-white">{selectedAlarm.title}</h3>
              </div>
              <button onClick={() => setSelectedAlarm(null)} className="p-1 hover:bg-slate-700 rounded">
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400">告警类型：</span>
                  <span className="text-slate-200">{selectedAlarm.type === 'fence' ? '电子围栏' : '视频分析'}</span>
                </div>
                <div>
                  <span className="text-slate-400">严重程度：</span>
                  <span className={`${getLevelColor(selectedAlarm.level)} px-2 py-0.5 rounded text-xs`}>
                    {getLevelText(selectedAlarm.level)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">处理状态：</span>
                  <span className={`${getStatusColor(selectedAlarm.status)} px-2 py-0.5 rounded text-xs`}>
                    {getStatusText(selectedAlarm.status)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">发生时间：</span>
                  <span className="text-slate-200">{new Date(selectedAlarm.time).toLocaleString()}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">发生位置：</span>
                  <span className="text-slate-200">{selectedAlarm.location}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">设备名称：</span>
                  <span className="text-slate-200">{selectedAlarm.deviceName}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">详细信息：</span>
                  <p className="text-slate-200 mt-1">{selectedAlarm.description}</p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              {selectedAlarm.status === 'pending' && (
 <button
  onClick={() => handleOpenProcessModal(selectedAlarm, 'resolved')}
  className="flex-1 py-2 bg-green-500 hover:bg-green-600 rounded-lg text-sm font-medium transition-all"
>
  已处理
</button>
              )}
              <button onClick={() => setSelectedAlarm(null)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-all">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

    {/* 处理弹窗 */}
{showProcessModal && processingAlarm && (
  <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowProcessModal(false)}>
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 shadow-2xl p-6 w-[450px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <CheckCircle size={20} className="text-green-400" />
          处理告警
        </h3>
        <button onClick={() => setShowProcessModal(false)} className="p-1 hover:bg-slate-700 rounded">
          <X size={18} className="text-slate-400" />
        </button>
      </div>
      
      <div className="space-y-4">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-sm text-slate-400 mb-1">告警信息</div>
          <div className="text-white font-medium">{processingAlarm.title}</div>
          <div className="text-xs text-slate-400 mt-1">{processingAlarm.description}</div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">处理结果</label>
          <div className="flex gap-3">
            <button
              onClick={() => setProcessAction('resolved')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                processAction === 'resolved'
                  ? 'bg-green-500/30 text-green-400 border border-green-400/50'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
              }`}
            >
              ✓ 已处理
            </button>
            <button
              onClick={() => setProcessAction('ignored')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                processAction === 'ignored'
                  ? 'bg-red-500/30 text-red-400 border border-red-400/50'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
              }`}
            >
              ✗ 误报忽略
            </button>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">备注说明</label>
          <textarea
            value={processRemark}
            onChange={(e) => setProcessRemark(e.target.value)}
            placeholder="可填写处理措施、处分结果、情况说明等..."
            rows={4}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>
      </div>
      
      <div className="flex gap-3 mt-6">
        <button
          onClick={handleConfirmProcess}
          className="flex-1 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-lg text-sm font-medium transition-all"
        >
          确认处理
        </button>
        <button
          onClick={() => setShowProcessModal(false)}
          className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-all"
        >
          取消
        </button>
      </div>
    </div>
  </div>
)}

    </div>
  );
}