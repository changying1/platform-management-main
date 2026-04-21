// components/FenceSidebar.tsx
import React, { useState } from "react";
import { 
  Trash2, 
  Edit, 
  Shield, 
  Users, 
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Info,
  X
} from "lucide-react";
import { FenceData, WorkTeamData } from "../types";

interface SidebarProps {
  fences: FenceData[];
  teams?: WorkTeamData[];
  devices: any[];
  selectedFence: FenceData | null;
  onSelectFence: (f: FenceData) => void;
  onEditFence: (f: FenceData) => void;
  onDeleteFence: (id: string, e: React.MouseEvent) => void;
  stats?: {
    totalFences: number;
    totalDevices: number;
    onlineDevices: number;
    violations: number;
  };
  collapsed?: boolean;           // 新增
  onToggleCollapse?: () => void;
  violationTypes?: Record<string, any>;
  
}

export const FenceSidebar: React.FC<SidebarProps> = ({ 
  fences, 
  teams = [], 
  devices, 
  stats, 
  collapsed, 
  onToggleCollapse, 
  onSelectFence, 
  onEditFence, 
  onDeleteFence, 
  violationTypes = {},
  selectedFence,
}) => {
  const [activeTab, setActiveTab] = useState<"fence" | "device">("fence");
  const [selectedDetail, setSelectedDetail] = useState<{ type: 'fence' | 'device'; data: any } | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<string[]>(["team1", "team2", "team3"]);

  const toggleTeam = (teamId: string) => {
    setExpandedTeams(prev => 
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    );
  };

if (collapsed) {
  return (
    <button
      onClick={onToggleCollapse}
      className="absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-slate-900/90 backdrop-blur-md border border-cyan-400/30 rounded-r-lg py-3 px-2 hover:bg-cyan-500/20 transition-all flex items-center gap-2"
    >
      <ChevronRight size={32} className="text-cyan-400" />  {/* 16 → 20 */}
      <span className="text-cyan-300 text-base">围栏管理</span>
    </button>
  );
}

  return (
    <div className="w-80 h-full bg-slate-900/90 backdrop-blur-md border-r border-cyan-400/20 flex flex-col shadow-xl z-10 relative">
      {/* 收起按钮 */}
      <button
onClick={onToggleCollapse}         
className="absolute -right-8 top-1/2 -translate-y-1/2 z-30 bg-slate-900/90 backdrop-blur-md border border-cyan-400/30 rounded-r-lg p-1.5 hover:bg-cyan-500/20 transition-all"
      >
        <ChevronLeft size={16} className="text-cyan-400" />
      </button>

{/* 头部 */}
<div className="px-4 py-3 border-b border-cyan-400/20">
  <h1 className="text-base font-semibold text-cyan-300 flex items-center gap-2">
    <Shield size={16} />
    围栏及定位信息
  </h1>
</div>

      {/* 统计卡片 - 紧凑一行 */}
      {stats && (
        <div className="px-4 py-2 border-b border-cyan-400/20 bg-cyan-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-xs text-slate-400">围栏</span>
                <span className="ml-1 text-base font-bold text-cyan-300">{stats.totalFences}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400">设备</span>
                <span className="ml-1 text-base font-bold text-cyan-300">{stats.totalDevices}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400">违规</span>
                <span className="ml-1 text-base font-bold text-red-400">{stats.violations}</span>
              </div>
            </div>
            <div className="text-sm text-green-400 font-medium">
              {stats.onlineDevices} 在线
            </div>
          </div>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex p-2 gap-1 border-b border-cyan-400/20">
        <button
          onClick={() => setActiveTab("fence")}
          className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "fence"
              ? "bg-cyan-500/30 text-cyan-300"
              : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"
          }`}
        >
          <Shield size={14} />
          作业队
        </button>
        <button
          onClick={() => setActiveTab("device")}
          className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "device"
              ? "bg-cyan-500/30 text-cyan-300"
              : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"
          }`}
        >
          <Users size={14} />
          设备列表
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {activeTab === "fence" ? (
          teams.length > 0 ? (
            <div className="space-y-4">
              {teams.map(team => (
                <div key={team.id} className="space-y-1">
                  <div 
                    onClick={() => toggleTeam(team.id)}
                    className="px-2 py-1.5 flex items-center justify-between bg-slate-800/60 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800/80 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <Users size={14} className={team.color} />
                      <span className={`text-sm font-bold ${team.color}`}>{team.name}</span>
                      <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full">
                        {team.fences.length}
                      </span>
                    </div>
                    <ChevronDown 
                      size={14} 
                      className={`text-slate-500 transition-transform duration-200 ${expandedTeams.includes(team.id) ? "rotate-180" : ""}`} 
                    />
                  </div>
                  
                  {expandedTeams.includes(team.id) && (
                    <div className="pl-2 space-y-1.5 border-l border-slate-700/30 ml-3 mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      {team.fences.length > 0 ? (
                        team.fences.map(fence => (
                          <div
                            key={fence.id}
                            onClick={() => onSelectFence(fence)}
                            className={`p-2 rounded-lg border cursor-pointer transition-all ${
                              selectedFence?.id === fence.id
                                ? "bg-cyan-500/15 border-cyan-400/50"
                                : "bg-slate-800/30 border-slate-700/50 hover:border-cyan-400/30"
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <h3 className="font-medium text-slate-200 text-sm truncate">{fence.name}</h3>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                    fence.behavior === "No Entry" 
                                      ? "bg-red-500/20 text-red-300" 
                                      : "bg-cyan-500/20 text-cyan-300"
                                  }`}>
                                    {fence.behavior === "No Entry" ? "禁入" : "禁出"}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {fence.company}/{fence.project}
                                </div>
                              </div>
                              <div className="flex gap-0.5 ml-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedDetail({ type: 'fence', data: fence }); }}
                                  className="p-1 text-slate-400 hover:text-cyan-300 rounded"
                                  title="查看详情"
                                >
                                  <Info size={12} />
                                </button>
                                <button
                                  onClick={(e) => onDeleteFence(fence.id, e)}
                                  className="p-1 text-slate-400 hover:text-red-300 rounded"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-500 py-2 pl-2">暂无围栏</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            fences.map(fence => (
              <div
                key={fence.id}
                onClick={() => onSelectFence(fence)}
                className={`p-2 rounded-lg border cursor-pointer transition-all ${
                  selectedFence?.id === fence.id
                    ? "bg-cyan-500/15 border-cyan-400/50"
                    : "bg-slate-800/30 border-slate-700/50 hover:border-cyan-400/30"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <h3 className="font-medium text-slate-200 text-sm truncate">{fence.name}</h3>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        fence.behavior === "No Entry" 
                          ? "bg-red-500/20 text-red-300" 
                          : "bg-cyan-500/20 text-cyan-300"
                      }`}>
                        {fence.behavior === "No Entry" ? "禁入" : "禁出"}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {fence.company}/{fence.project}
                    </div>
                  </div>
                  <div className="flex gap-0.5 ml-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedDetail({ type: 'fence', data: fence }); }}
                      className="p-1 text-slate-400 hover:text-cyan-300 rounded"
                      title="查看详情"
                    >
                      <Info size={12} />
                    </button>
                    <button
                      onClick={(e) => onDeleteFence(fence.id, e)}
                      className="p-1 text-slate-400 hover:text-red-300 rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )
) : (
  // 先把违规设备排前面
[...devices].sort((a, b) => {
  const aViolate = !!violationTypes?.[a.id];
  const bViolate = !!violationTypes?.[b.id];
  return bViolate - aViolate; // 违规 = 1，排在前面
}).map(device => (
  <div
    key={device.id}
    className="p-2 rounded-lg bg-slate-800/30 border border-slate-700/50"
  >
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <div className="font-medium text-slate-200 text-sm">{device.name}</div>
          {/* 违规标记 */}
          {violationTypes?.[device.id] && (
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" title="违规中"></span>
          )}
        </div>
        <div className="text-[10px] text-slate-400">{device.holder}</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSelectedDetail({ type: 'device', data: device })}
          className="p-1 text-slate-400 hover:text-cyan-300 rounded"
          title="查看详情"
        >
          <Info size={12} />
        </button>
        <div className={`w-1.5 h-1.5 rounded-full ${device.status === "online" ? "bg-green-500" : "bg-slate-500"}`} />
      </div>
    </div>
  </div>
))

)}
      </div>

            {/* 详情弹窗 */}
 {selectedDetail && (
  <div className="fixed inset-0 z-[300] flex items-center justify-center pointer-events-none">
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 shadow-2xl p-6 w-[420px] max-w-[90vw] pointer-events-auto" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-cyan-300">
          {selectedDetail.type === 'fence' ? '围栏详情' : '设备详情'}
        </h3>
        <button onClick={() => setSelectedDetail(null)} className="p-1 hover:bg-slate-700 rounded">
          <X size={18} className="text-slate-400" />
        </button>
      </div>
            
            {selectedDetail.type === 'fence' ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">围栏名称：</span>
                  <span className="text-slate-200 font-medium">{selectedDetail.data.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">所属公司：</span>
                  <span className="text-slate-200">{selectedDetail.data.company}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">所属项目：</span>
                  <span className="text-slate-200">{selectedDetail.data.project}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">围栏类型：</span>
                  <span className="text-slate-200">{selectedDetail.data.type === 'Circle' ? '圆形' : '多边形'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">触发行为：</span>
                  <span className="text-slate-200">{selectedDetail.data.behavior === 'No Entry' ? '禁止进入' : '禁止离开'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">严重程度：</span>
                  <span className="text-slate-200">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      selectedDetail.data.severity === 'severe' ? 'bg-red-500/20 text-red-400' :
                      selectedDetail.data.severity === 'risk' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {selectedDetail.data.severity === 'severe' ? '严重' : selectedDetail.data.severity === 'risk' ? '风险' : '一般'}
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">生效开始：</span>
                  <span className="text-slate-200 text-sm">
                    {selectedDetail.data.schedule?.start ? new Date(selectedDetail.data.schedule.start).toLocaleString() : '永久生效'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">生效结束：</span>
                  <span className="text-slate-200 text-sm">
                    {selectedDetail.data.schedule?.end ? new Date(selectedDetail.data.schedule.end).toLocaleString() : '永久生效'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">创建时间：</span>
                  <span className="text-slate-200 text-sm">
                    {new Date(selectedDetail.data.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">更新时间：</span>
                  <span className="text-slate-200 text-sm">
                    {new Date(selectedDetail.data.updatedAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">设备名称：</span>
                  <span className="text-slate-200 font-medium">{selectedDetail.data.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">持有人：</span>
                  <span className="text-slate-200">{selectedDetail.data.holder}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">联系电话：</span>
                  <span className="text-slate-200">{selectedDetail.data.holderPhone || '--'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">所属公司：</span>
                  <span className="text-slate-200">{selectedDetail.data.company}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">所属项目：</span>
                  <span className="text-slate-200">{selectedDetail.data.project}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">状态：</span>
                  <span className={`${selectedDetail.data.status === 'online' ? 'text-green-400' : 'text-slate-500'}`}>
                    {selectedDetail.data.status === 'online' ? '● 在线' : '○ 离线'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">位置坐标：</span>
                  <span className="text-slate-200 text-xs">经度: {selectedDetail.data.lng}, 纬度: {selectedDetail.data.lat}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-400">最后更新：</span>
                  <span className="text-slate-200 text-xs">{new Date(selectedDetail.data.lastUpdate).toLocaleString()}</span>
                </div>
              </div>
            )}
            
 <div className="flex gap-3 mt-6">
        <button onClick={() => setSelectedDetail(null)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-all">
          关闭
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
};