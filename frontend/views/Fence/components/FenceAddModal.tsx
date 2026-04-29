import React, { useState, useEffect, useRef } from "react";
import { X, MapPin, Clock, AlertTriangle, Check, Circle, Hexagon, Move, Users, ChevronDown, ChevronRight, X as XIcon } from "lucide-react";

interface OrgNode {
  id: string;
  name: string;
  type: "company" | "project" | "team";
  children?: OrgNode[];
}

interface FenceAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNext: (data: any) => void;
  onSaveFence: (data: any) => void;
  tempCenter: [number, number] | null;
  tempPoints: [number, number][];
  drawingMode: "circle" | "polygon" | null;
  editingFenceId?: string | null;
  companies?: string[];
  projects?: string[];
  collectedPoints?: any[];
  onStartCollectMode?: () => void;
  onEnterDrawMode?: () => void;
}

const mockOrgData: OrgNode[] = [
  {
    id: "company-1",
    name: "第一分公司",
    type: "company",
    children: [
      { id: "proj-1-1", name: "西安地铁15号线", type: "project", children: [
        { id: "team-1-1-1", name: "土方作业队", type: "team" },
        { id: "team-1-1-2", name: "钢筋班组", type: "team" },
        { id: "team-1-1-3", name: "起重作业队", type: "team" },
      ]},
      { id: "proj-1-2", name: "曲江智慧园区", type: "project", children: [
        { id: "team-1-2-1", name: "机电安装队", type: "team" },
        { id: "team-1-2-2", name: "消防班组", type: "team" },
      ]},
    ]
  },
  {
    id: "company-2",
    name: "第二分公司",
    type: "company",
    children: [
      { id: "proj-2-1", name: "成都天府机场", type: "project", children: [
        { id: "team-2-1-1", name: "航站楼作业队", type: "team" },
        { id: "team-2-1-2", name: "跑道施工队", type: "team" },
      ]},
    ]
  },
];

export const FenceAddModal: React.FC<FenceAddModalProps> = ({
  isOpen,
  onClose,
  onNext,
  onSaveFence,
  tempCenter,
  tempPoints,
  drawingMode,
  editingFenceId,
  companies = [],
  projects = [],
  collectedPoints = [],
  onStartCollectMode,
  onEnterDrawMode,
}) => {
  const [buildMode, setBuildMode] = useState<"select" | "manual" | "collect">("select");
  const [step, setStep] = useState<"form" | "draw">("form");

  // 🎯 每次打开弹窗都重置到选择模式
  useEffect(() => {
    if (isOpen) {
      setBuildMode("select");
      setSelectedOrgs([]);
      setOrgDropdownOpen(false);
    }
  }, [isOpen]);
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  
  // 🏢 组织架构多选
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [selectedOrgs, setSelectedOrgs] = useState<OrgNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["company-1", "company-2"]));
  
  const toggleNode = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  
  const toggleSelectOrg = (node: OrgNode) => {
    const exists = selectedOrgs.find(o => o.id === node.id);
    if (exists) {
      setSelectedOrgs(selectedOrgs.filter(o => o.id !== node.id));
    } else {
      setSelectedOrgs([...selectedOrgs, node]);
    }
  };
  
  const removeOrg = (node: OrgNode) => {
    setSelectedOrgs(selectedOrgs.filter(o => o.id !== node.id));
  };
  
  const renderOrgNode = (node: OrgNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedOrgs.some(o => o.id === node.id);
    
    return (
      <div key={node.id}>
        <div 
          className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-700/50 rounded transition-colors ${
            isSelected ? 'bg-cyan-500/20 text-cyan-300' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }} className="p-0.5 hover:bg-slate-600 rounded">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-[22px]" />
          )}
          <input 
            type="checkbox" 
            checked={isSelected}
            onChange={() => toggleSelectOrg(node)}
            className="w-4 h-4 accent-cyan-500"
          />
          <span className="text-sm">{node.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto ${
            node.type === 'company' ? 'bg-blue-500/20 text-blue-400' :
            node.type === 'project' ? 'bg-purple-500/20 text-purple-400' :
            'bg-green-500/20 text-green-400'
          }`}>
            {node.type === 'company' ? '分公司' : node.type === 'project' ? '项目' : '作业队'}
          </span>
        </div>
        {hasChildren && isExpanded && node.children!.map(child => renderOrgNode(child, level + 1))}
      </div>
    );
  };
  
  const [formData, setFormData] = useState({
    name: "",
    behavior: "No Entry" as "No Entry" | "No Exit",
    shape: "polygon" as "circle" | "polygon",
    radius: 50,
    startTime: "",
    endTime: "",
    description: "",
    severity: "medium" as "low" | "medium" | "high" | "severe",
    selectedDeviceIds: [] as string[],
  });

  // 重置表单
  useEffect(() => {
    if (isOpen) {
      setBuildMode("select");
      setStep("form");
      setFormData({
        name: "",
        company: "",
        project: "",
        behavior: "No Entry",
        shape: "polygon",
        radius: 50,
        startTime: new Date().toISOString().slice(0, 16),
        endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
        severity: "general",
        description: "",
      });
      setPosition({ x: window.innerWidth - 360, y: 100 });
    }
  }, [isOpen]);

  // 拖拽逻辑
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: Math.min(Math.max(e.clientX - dragStart.x, 10), window.innerWidth - 360),
        y: Math.min(Math.max(e.clientY - dragStart.y, 10), window.innerHeight - 400),
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

// 删除整个 handleNext 函数（大约第 130-180 行），然后替换成：

// 显示顶部红色提示的函数
const showTopTip = (message: string) => {
  const tip = document.createElement('div');
  tip.className = 'fixed top-72 left-1/2 transform -translate-x-1/2 z-[200] bg-red-500/90 backdrop-blur-sm text-white px-5 py-2.5 rounded-full shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-5 duration-200';
  tip.innerHTML = `
    <div class="flex items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>${message}</span>
    </div>
  `;
  document.body.appendChild(tip);
  setTimeout(() => {
    tip.classList.add('opacity-0', 'transition-opacity', 'duration-200');
    setTimeout(() => tip.remove(), 200);
  }, 2000);
};

// 然后找到表单部分里的"下一步"按钮（大约在第 460 行），替换成：

  const handleSave = () => {
      console.log("FenceAddModal handleSave 被调用", formData);

    if (formData.shape === "circle" && !tempCenter) {
      alert("请在地图上点击设置圆心");
      return;
    }
    if (formData.shape === "polygon" && tempPoints.length < 3) {
      alert("请至少添加3个顶点");
      return;
    }

    const shape = formData.shape === "circle" ? "circle" : "polygon";

    onSave({
      ...formData,
      shape: shape,
      center: tempCenter,
      points: tempPoints,
      orgs: selectedOrgs,
    });
    onClose();
  };

  if (!isOpen) return null;

  // 🎯 模式选择：全屏居中，大字醒目！
  if (buildMode === "select") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border-2 border-slate-700 shadow-2xl w-[500px] overflow-hidden">
          <div className="text-center p-8 pb-4">
            <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 mb-2">
              选择围栏创建方式
            </h2>
            <p className="text-sm text-slate-400">请选择围栏顶点来源方式</p>
          </div>
          
          <div className="p-6 pt-2 space-y-4">
            <div
              onClick={() => {
                onEnterDrawMode?.();
              }}
              className="p-6 bg-slate-800/60 hover:bg-slate-800 rounded-2xl border-2 border-slate-700 hover:border-cyan-400 cursor-pointer transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/30 transition-all group-hover:scale-110">
                  <MapPin size={32} className="text-cyan-400" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-xl text-slate-200">手动绘制围栏</div>
                  <div className="text-sm text-slate-400 mt-1">圆形、矩形、画笔、多边形随心画</div>
                </div>
              </div>
            </div>

            <div
              onClick={() => {
                setBuildMode("collect");
                onStartCollectMode?.();
              }}
              className="p-6 bg-slate-800/60 hover:bg-slate-800 rounded-2xl border-2 border-slate-700 hover:border-purple-400 cursor-pointer transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-all group-hover:scale-110">
                  <Users size={32} className="text-purple-400" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-xl text-slate-200">收集定位构建</div>
                  <div className="text-sm text-slate-400 mt-1">现场人员跑边界，GPS实时上报顶点</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-6 pt-0">
            <button
              onClick={onClose}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-semibold text-slate-300 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 悬浮窗 */}
      <div
        ref={modalRef}
        className="fixed z-50 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 shadow-2xl w-[380px] overflow-hidden"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
      >
        {/* 可拖拽的头部 */}
        <div 
          className="drag-handle bg-slate-900/95 border-b border-cyan-400/30 p-4 flex justify-between items-center cursor-move select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <Move size={16} className="text-cyan-400" />
            <h2 className="font-bold text-base bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-blue-300">
              {buildMode === "collect" && step !== "form" ? "📍 收集定位顶点" :
               step === "form" ? (editingFenceId ? "编辑电子围栏" : "新建电子围栏") : "绘制围栏区域"}
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {buildMode === "collect" && step !== "form" ? (
          // 📍 收集定位模式
          <div className="p-4 space-y-3">
            <div className="bg-slate-800/50 rounded-xl p-3 flex justify-between items-center">
              <span className="text-sm text-slate-300 font-medium">已收集顶点</span>
              <span className={`text-lg font-black ${collectedPoints.length >= 3 ? "text-green-400" : "text-yellow-400"}`}>
                {collectedPoints.length} 个
              </span>
            </div>

            <div className="max-h-[280px] overflow-y-auto space-y-2">
              {collectedPoints.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">
                  <div className="mb-3 text-3xl">🕒</div>
                  等待现场人员上报顶点...
                </div>
              ) : (
                collectedPoints.map((p, i) => (
                  <div key={i} className="bg-slate-800/50 rounded-xl p-3 text-sm flex justify-between items-center">
                    <div>
                      <span className="text-cyan-300 font-bold">#{i + 1}</span>
                      <span className="text-slate-300 ml-2 font-medium">{p.holder || "现场人员"}</span>
                    </div>
                    <div className="text-slate-500 text-xs font-mono">
                      {p.lat?.toFixed(4)}, {p.lng?.toFixed(4)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-700">
              {collectedPoints.length >= 3 ? (
                <button
                  onClick={() => setStep("form")}
                  className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 rounded-xl text-sm font-bold transition-all"
                >
                  ✓ 设置围栏属性并生成
                </button>
              ) : (
                <div className="text-center text-yellow-400 text-sm py-3 font-medium">
                  还需要 {3 - collectedPoints.length} 个顶点才能生成围栏
                </div>
              )}
              
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setBuildMode("select")}
                  className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm transition-colors"
                >
                  返回选择
                </button>
              </div>
            </div>
          </div>
        ) : step === "form" ? (
          // 🎯 表单部分 - 与手动绘制面板保持一致
          <>
            {/* 头部 */}
            <div className="px-5 py-3 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-b border-cyan-400/30">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-cyan-300">设置围栏规则</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {buildMode === "collect" ? `已收集: ${collectedPoints.length} 个顶点` : `已绘制: ${formData.shape === 'circle' ? '圆形' : '多边形'}`}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
                >
                  <X size={16} className="text-red-400" />
                </button>
              </div>
            </div>

            {/* 表单内容 */}
            <div className="p-4 space-y-3 max-h-[45vh] overflow-y-auto">
              {/* 围栏名称 */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  围栏名称 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入围栏名称"
                  className="w-full px-4 py-2.5 bg-slate-800/50 border border-cyan-400/30 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                />
              </div>

              {/* 绑定组织 */}
              <div className="space-y-3 relative">
                <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Users size={14} className="text-cyan-400" />
                  绑定组织（可多选）*
                </label>
                
                <div
                  onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                  className="w-full px-4 py-2.5 bg-slate-800/50 border border-cyan-400/30 rounded-lg cursor-pointer hover:border-cyan-400 transition-colors min-h-[48px]"
                >
                  {selectedOrgs.length === 0 ? (
                    <span className="text-slate-300">点击选择 分公司 / 项目 / 作业队</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {selectedOrgs.slice(0, 3).map(org => (
                        <span key={org.id} className="bg-cyan-500/20 text-cyan-300 text-xs px-2 py-0.5 rounded-full">
                          {org.name}
                        </span>
                      ))}
                      {selectedOrgs.length > 3 && (
                        <span className="text-slate-400 text-xs">+{selectedOrgs.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
                
                {orgDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setOrgDropdownOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-cyan-400/30 rounded-lg shadow-2xl z-20 max-h-[320px] overflow-y-auto py-1">
                      {/* 分公司 */}
                      <div className="px-2 py-1.5 text-[10px] text-slate-500 font-bold bg-slate-800/50 sticky top-0 uppercase tracking-wider">
                        ─── 分公司 ───
                      </div>
                      {["第一分公司", "第二分公司", "第三分公司"].map(name => {
                        const isSel = selectedOrgs.some(o => o.name === name);
                        return (
                          <div 
                            key={name}
                            onClick={() => {
                              if (isSel) setSelectedOrgs(selectedOrgs.filter(o => o.name !== name));
                              else setSelectedOrgs([...selectedOrgs, { id: name, name, type: 'company' }]);
                            }}
                            className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
                              isSel ? 'bg-cyan-500/20 text-cyan-300' : 'hover:bg-slate-800'
                            }`}
                          >
                            <span className="w-4 h-4 rounded border flex items-center justify-center text-xs">
                              {isSel && '✓'}
                            </span>
                            {name}
                          </div>
                        );
                      })}
                      
                      {/* 项目 */}
                      <div className="px-2 py-1.5 text-[10px] text-slate-500 font-bold bg-slate-800/50 sticky top-0 uppercase tracking-wider">
                        ─── 项目 ───
                      </div>
                      {["西安地铁15号线", "曲江智慧园区", "成都天府机场"].map(name => {
                        const isSel = selectedOrgs.some(o => o.name === name);
                        return (
                          <div 
                            key={name}
                            onClick={() => {
                              if (isSel) setSelectedOrgs(selectedOrgs.filter(o => o.name !== name));
                              else setSelectedOrgs([...selectedOrgs, { id: name, name, type: 'project' }]);
                            }}
                            className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
                              isSel ? 'bg-cyan-500/20 text-cyan-300' : 'hover:bg-slate-800'
                            }`}
                          >
                            <span className="w-4 h-4 rounded border flex items-center justify-center text-xs">
                              {isSel && '✓'}
                            </span>
                            {name}
                          </div>
                        );
                      })}
                      
                      {/* 作业队 */}
                      <div className="px-2 py-1.5 text-[10px] text-slate-500 font-bold bg-slate-800/50 sticky top-0 uppercase tracking-wider">
                        ─── 作业队 ───
                      </div>
                      {["土方作业队", "钢筋班组", "起重作业队", "机电安装队", "消防班组"].map(name => {
                        const isSel = selectedOrgs.some(o => o.name === name);
                        return (
                          <div 
                            key={name}
                            onClick={() => {
                              if (isSel) setSelectedOrgs(selectedOrgs.filter(o => o.name !== name));
                              else setSelectedOrgs([...selectedOrgs, { id: name, name, type: 'team' }]);
                            }}
                            className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
                              isSel ? 'bg-cyan-500/20 text-cyan-300' : 'hover:bg-slate-800'
                            }`}
                          >
                            <span className="w-4 h-4 rounded border flex items-center justify-center text-xs">
                              {isSel && '✓'}
                            </span>
                            {name}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* 出入规则 */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-cyan-400" />
                  出入规则
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormData({ ...formData, behavior: 'No Exit' })}
                    className={`py-2.5 px-3 rounded-lg border transition-all flex items-center justify-center gap-2 ${
                      formData.behavior === 'No Exit'
                        ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300'
                        : 'bg-slate-800/30 border-slate-600 text-slate-400 hover:border-cyan-400/50'
                    }`}
                  >
                    禁止外出
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, behavior: 'No Entry' })}
                    className={`py-2.5 px-3 rounded-lg border transition-all flex items-center justify-center gap-2 ${
                      formData.behavior === 'No Entry'
                        ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300'
                        : 'bg-slate-800/30 border-slate-600 text-slate-400 hover:border-cyan-400/50'
                    }`}
                  >
                    禁止进入
                  </button>
                </div>
              </div>

              {/* 严重程度 */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-cyan-400" />
                  严重程度
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'low', label: '低', color: 'green' },
                    { value: 'medium', label: '中', color: 'yellow' },
                    { value: 'high', label: '高', color: 'orange' },
                    { value: 'severe', label: '严重', color: 'red' },
                  ].map((level) => (
                    <button
                      key={level.value}
                      onClick={() => setFormData({ ...formData, severity: level.value as any })}
                      className={`py-2 rounded-lg border transition-all text-sm ${
                        formData.severity === level.value
                          ? `bg-${level.color}-500/30 border-${level.color}-400 text-${level.color}-300`
                          : 'bg-slate-800/30 border-slate-600 text-slate-400'
                      }`}
                      style={formData.severity === level.value ? {
                        backgroundColor: level.color === 'green' ? 'rgba(34,197,94,0.2)' :
                          level.color === 'yellow' ? 'rgba(234,179,8,0.2)' :
                          level.color === 'orange' ? 'rgba(249,115,22,0.2)' : 'rgba(239,68,68,0.2)',
                        borderColor: level.color === 'green' ? 'rgb(74,222,128)' :
                          level.color === 'yellow' ? 'rgb(250,204,21)' :
                          level.color === 'orange' ? 'rgb(251,146,60)' : 'rgb(248,113,113)',
                        color: level.color === 'green' ? 'rgb(74,222,128)' :
                          level.color === 'yellow' ? 'rgb(250,204,21)' :
                          level.color === 'orange' ? 'rgb(251,146,60)' : 'rgb(248,113,113)',
                      } : {}}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 生效时间段 */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Clock size={14} className="text-cyan-400" />
                  生效时间段
                </label>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm w-12">开始</span>
                    <input
                      type="datetime-local"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-cyan-400/30 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-400 transition-colors"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm w-12">结束</span>
                    <input
                      type="datetime-local"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-cyan-400/30 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-400 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-5 py-4 border-t border-cyan-400/30 bg-slate-900/50">
              <div className="flex gap-3">
                <button
                  onClick={() => buildMode === "collect" ? setBuildMode("select") : setStep("draw")}
                  className="flex-1 py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  返回绘制
                </button>
                <button
                  onClick={() => {
                    if (!formData.name || selectedOrgs.length === 0) {
                      alert("请填写围栏名称并选择至少一个绑定组织");
                      return;
                    }
                    if (!formData.startTime || !formData.endTime) {
                      showTopTip("请设置生效时间");
                      return;
                    }

                    if (buildMode === "collect") {
                      onSaveFence({
                        ...formData,
                        center: null,
                        points: collectedPoints.map((point) => [point.lat, point.lng]),
                        orgs: selectedOrgs,
                      });
                      return;
                    }

                    setStep("draw");
                    onNext({
                      ...formData,
                      center: null,
                      points: [],
                    });
                  }}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white rounded-lg transition-all flex items-center justify-center gap-2 font-medium shadow-lg shadow-cyan-500/20"
                >
                  保存围栏
                </button>
              </div>
            </div>
          </>
        ) : (
          // 绘制指引部分
          <div className="p-3">
            {/* <div className="bg-cyan-500/10 rounded-lg p-2 mb-2 border border-cyan-400/30">
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-cyan-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-cyan-300 font-semibold text-xs mb-1">绘制指引</h3>
                  {formData.shape === "circle" ? (
                    <ul className="text-xs text-slate-300 space-y-0.5">
                      <li>• 点击地图设置圆心</li>
                      <li>• 半径: {formData.radius}米</li>
                    </ul>
                  ) : (
                    <ul className="text-xs text-slate-300 space-y-0.5">
                      <li>• 点击地图添加顶点</li>
                      <li>• 需要 {tempPoints.length}/3 个顶点</li>
                    </ul>
                  )}
                </div>
              </div>
            </div> */}

            <div className="bg-slate-800/50 rounded-lg p-2 mb-2">
              <div className="text-xs text-slate-400 mb-1">当前状态：</div>
              {formData.shape === "circle" ? (
                <div className="text-cyan-300 text-xs flex items-center gap-1">
                  {tempCenter ? (
                    <><Check size={12} className="text-green-400" /> 圆心已设置</>
                  ) : (
                    <><div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" /> 等待设置圆心...</>
                  )}
                </div>
              ) : (
                <div className="text-cyan-300 text-xs">
                  已添加 {tempPoints.length} 个顶点
                  {tempPoints.length >= 3 && <span className="ml-1 text-green-400">✓ 可完成</span>}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep("form")}
                className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs transition-colors"
              >
                返回修改
              </button>
<button
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (formData.shape === "circle" && !tempCenter) {
      showTopTip("请在地图上点击设置圆心");
      return;
    }
    if (formData.shape === "polygon" && tempPoints.length < 3) {
      showTopTip("请至少添加3个顶点");
      return;
    }

onSaveFence({
  ...formData,
  center: tempCenter,
  points: tempPoints,
});
console.log("传递的 startTime:", formData.startTime);
console.log("传递的 endTime:", formData.endTime);
    onClose();
  }}
  className="flex-1 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-lg text-xs font-semibold transition-all"
>
  完成创建
</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
