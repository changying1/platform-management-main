import React, { useMemo, useState, useEffect, useRef } from "react";
import { X, MapPin, Clock, AlertTriangle, Check, Circle, Hexagon, Move, Users, ChevronDown, ChevronRight, X as XIcon, Info } from "lucide-react";
import { OrganizationTreeNode } from "../types";

interface OrgNode {
  id: string;
  name: string;
  type: "company" | "project" | "grid" | "team";
  unit_id?: string;
  sourceType?: string;
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
  initialData?: any;
  companies?: string[];
  projects?: string[];
  organizationTree?: OrganizationTreeNode[];
  collectedPoints?: any[];
  onStartCollectMode?: () => void;
  onEnterDrawMode?: () => void;
  onResetDraw?: () => void;
}

const normalizeFenceSeverity = (value: any): "normal" | "risk" | "severe" => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["severe", "high", "critical", "严重"].includes(raw)) return "severe";
  if (["risk", "medium", "warning", "风险", "中", "中等"].includes(raw)) return "risk";
  return "normal";
};

export const FenceAddModal: React.FC<FenceAddModalProps> = ({
  isOpen,
  onClose,
  onNext,
  onSaveFence,
  tempCenter,
  tempPoints,
  drawingMode,
  editingFenceId,
  initialData,
  companies = [],
  projects = [],
  organizationTree = [],
  collectedPoints = [],
  onStartCollectMode,
  onEnterDrawMode,
  onResetDraw,
}) => {
  const [buildMode, setBuildMode] = useState<"select" | "manual" | "collect">("select");
  const [step, setStep] = useState<"form" | "draw">("form");

  // 🎯 每次打开弹窗都重置到选择模式
  useEffect(() => {
    if (isOpen) {
      setBuildMode("select");
      if (!editingFenceId) setSelectedOrgs([]);
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
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const orgTreeData = useMemo<OrgNode[]>(() => {
    const toOrgType = (type: string): OrgNode["type"] | null => {
      const normalized = String(type || "").toLowerCase();
      if (normalized === "branch") return "company";
      if (normalized === "project") return "project";
      if (normalized === "grid") return "grid";
      if (normalized === "team") return "team";
      return null;
    };

    const convert = (node: OrganizationTreeNode): OrgNode | null => {
      const children = (node.children || []).map(convert).filter(Boolean) as OrgNode[];
      const type = toOrgType(node.type);
      if (!type) return null;
      return {
        id: String(node.unit_id || node.id),
        unit_id: String(node.unit_id || node.id),
        name: node.name,
        type,
        sourceType: String(node.type || ""),
        children,
      };
    };

    return organizationTree.map(convert).filter(Boolean) as OrgNode[];
  }, [organizationTree]);

  useEffect(() => {
    if (isOpen && orgTreeData.length > 0) {
      setExpandedNodes(new Set(orgTreeData.map(node => node.id)));
    }
  }, [isOpen, orgTreeData]);
  
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
            node.type === 'grid' ? 'bg-cyan-500/20 text-cyan-400' :
            'bg-green-500/20 text-green-400'
          }`}>
            {node.type === 'company' ? '分公司' : node.type === 'project' ? '项目' : node.type === 'grid' ? '网格' : '工队'}
          </span>
        </div>
        {hasChildren && isExpanded && node.children!.map(child => renderOrgNode(child, level + 1))}
      </div>
    );
  };
  
  const [formData, setFormData] = useState({
    name: "",
    behavior: "No Entry" as "No Entry" | "No Exit",
    shape: "polygon" as "brush" | "circle" | "polygon",
    radius: 50,
    startTime: "",
    endTime: "",
    description: "",
    severity: "normal" as "normal" | "risk" | "severe",
    selectedDeviceIds: [] as string[],
  });

  const getSelectedOrgPayload = () => {
    const first = (type: OrgNode["type"]) => selectedOrgs.find(org => org.type === type);
    const company = first("company");
    const project = first("project");
    const grid = first("grid");
    const team = first("team");
    return {
      company: company?.name || initialData?.company || "",
      project: project?.name || initialData?.project || "",
      grid: grid?.name || initialData?.grid || "",
      team: team?.name || initialData?.team || "",
      branch_id: company?.unit_id || company?.id || initialData?.branch_id || null,
      project_id: project?.unit_id || project?.id || initialData?.project_id || null,
      grid_id: grid?.unit_id || grid?.id || initialData?.grid_id || null,
      team_id: team?.unit_id || team?.id || initialData?.team_id || null,
      orgs: selectedOrgs.length > 0 ? selectedOrgs : (initialData?.orgs || []),
    };
  };

  // 重置表单
  useEffect(() => {
    if (isOpen) {
      setBuildMode("select");
      setStep("form");
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 7);
      endDate.setHours(23, 59, 59, 999);
      
      const getLocalDateTime = (date: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
      };
      
      setFormData(editingFenceId && initialData ? {
        name: initialData.name || "",
        company: initialData.company || "",
        project: initialData.project || "",
        behavior: initialData.behavior || "No Entry",
        shape: initialData.shape || "polygon",
        radius: initialData.radius || 50,
        startTime: initialData.startTime || getLocalDateTime(now),
        endTime: initialData.endTime || getLocalDateTime(endDate),
        severity: normalizeFenceSeverity(initialData.severity),
        description: initialData.description || "",
        selectedDeviceIds: initialData.selectedDeviceIds || [],
      } : {
        name: "",
        company: "",
        project: "",
        behavior: "No Entry",
        shape: "brush",
        radius: 50,
        startTime: getLocalDateTime(now),
        endTime: getLocalDateTime(endDate),
        severity: "normal",
        description: "",
        selectedDeviceIds: [],
      });
      setPosition({ x: window.innerWidth - 360, y: 100 });
    }
  }, [editingFenceId, initialData, isOpen]);

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
    if (formData.shape === "circle" && !tempCenter) {
      alert("请在地图上点击设置圆心");
      return;
    }
    if (formData.shape === "polygon" && tempPoints.length < 3) {
      alert("请至少添加3个顶点");
      return;
    }

    const shape = formData.shape === "circle" ? "circle" : "polygon";

    onSaveFence({
      ...formData,
      shape: shape,
      center: tempCenter,
      points: tempPoints,
      ...getSelectedOrgPayload(),
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
                setStep("draw");
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
                    <span className="text-slate-300">点击选择 分公司 / 项目 / 网格 / 工队</span>
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
                      {orgTreeData.length > 0 ? (
                        orgTreeData.map(node => renderOrgNode(node))
                      ) : (
                        <div className="px-3 py-6 text-sm text-slate-500 text-center">
                          暂无组织数据
                        </div>
                      )}
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
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'normal', label: '一般', color: 'blue' },
                    { value: 'risk', label: '风险', color: 'orange' },
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
                        backgroundColor: level.color === 'blue' ? 'rgba(59,130,246,0.2)' :
                          level.color === 'orange' ? 'rgba(249,115,22,0.2)' : 'rgba(239,68,68,0.2)',
                        borderColor: level.color === 'blue' ? 'rgb(96,165,250)' :
                          level.color === 'orange' ? 'rgb(251,146,60)' : 'rgb(248,113,113)',
                        color: level.color === 'blue' ? 'rgb(96,165,250)' :
                          level.color === 'orange' ? 'rgb(251,146,60)' : 'rgb(248,113,113)',
                      } : {}}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 有效日期范围 */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Clock size={14} className="text-cyan-400" />
                  有效日期范围
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                  <label className="block space-y-1.5">
                    <span className="block text-xs font-medium text-slate-400">有效期开始</span>
                    <input
                      type="datetime-local"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      aria-label="有效期开始时间"
                      className="w-full min-w-0 px-3 py-2.5 bg-slate-800/50 border border-cyan-400/30 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-400 transition-colors"
                    />
                  </label>
                  <div className="hidden h-[42px] items-center text-slate-500 sm:flex" aria-hidden="true">
                    至
                  </div>
                  <label className="block space-y-1.5">
                    <span className="block text-xs font-medium text-slate-400">有效期结束</span>
                    <input
                      type="datetime-local"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      aria-label="有效期结束时间"
                      className="w-full min-w-0 px-3 py-2.5 bg-slate-800/50 border border-cyan-400/30 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-400 transition-colors"
                    />
                  </label>
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
                    if (!formData.name || (!editingFenceId && selectedOrgs.length === 0)) {
                      alert("请填写围栏名称并选择至少一个绑定组织");
                      return;
                    }
                    if (!formData.startTime || !formData.endTime) {
                      showTopTip("请设置生效时间");
                      return;
                    }
                    if (new Date(formData.endTime).getTime() <= new Date(formData.startTime).getTime()) {
                      showTopTip("生效结束时间必须晚于开始时间");
                      return;
                    }

                    if (editingFenceId) {
                      onSaveFence({
                        ...formData,
                        ...getSelectedOrgPayload(),
                        center: tempCenter || initialData?.center,
                        points: tempPoints.length > 0 ? tempPoints : initialData?.points,
                      });
                      return;
                    }

                    if (buildMode === "collect") {
                      onSaveFence({
                        ...formData,
                        center: null,
                        points: collectedPoints.map((point) => [point.lat, point.lng]),
                        ...getSelectedOrgPayload(),
                      });
                      return;
                    }

                    setStep("draw");
                    onNext({
                      ...formData,
                      ...getSelectedOrgPayload(),
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
                  {tempCenter || (editingFenceId && initialData?.center) ? (
                    <><Check size={12} className="text-green-400" /> {tempCenter ? "圆心已设置" : "使用原有圆心"}</>
                  ) : (
                    <><div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" /> 等待设置圆心...</>
                  )}
                </div>
              ) : (
                <div className="text-cyan-300 text-xs">
                  {tempPoints.length > 0 ? (
                    <>已添加 {tempPoints.length} 个顶点{tempPoints.length >= 3 && <span className="ml-1 text-green-400">✓ 可完成</span>}</>
                  ) : editingFenceId && initialData?.points && initialData.points.length >= 3 ? (
                    <>使用原有图形（{initialData.points.length} 个顶点）</>
                  ) : (
                    <>已添加 {tempPoints.length} 个顶点{tempPoints.length >= 3 && <span className="ml-1 text-green-400">✓ 可完成</span>}</>
                  )}
                </div>
              )}
            </div>

            {editingFenceId && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mb-3">
                <div className="text-xs text-amber-300 flex items-center gap-1">
                  <Info size={12} className="text-amber-400" />
                  提示：点击下方"重置绘制"按钮可重新绘制围栏，否则将保留原有图形
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep("form")}
                className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs transition-colors"
              >
                返回修改
              </button>
              {editingFenceId && (
                <button
                  onClick={() => {
                    onResetDraw?.();
                    showTopTip("已重置，可重新绘制围栏");
                  }}
                  className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs transition-colors"
                >
                  重置绘制
                </button>
              )}
<button
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const hasValidShape = editingFenceId || 
      (formData.shape === "circle" && tempCenter) || 
      (formData.shape === "polygon" && tempPoints.length >= 3);
    
    if (!hasValidShape) {
      if (formData.shape === "circle") {
        showTopTip("请在地图上点击设置圆心");
      } else {
        showTopTip("请至少添加3个顶点");
      }
      return;
    }

    onSaveFence({
      ...formData,
      center: tempCenter || (editingFenceId && initialData?.center),
      points: tempPoints.length > 0 ? tempPoints : (editingFenceId && initialData?.points),
      ...getSelectedOrgPayload(),
    });
    onClose();
  }}
  className="flex-1 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-lg text-xs font-semibold transition-all"
>
  {editingFenceId ? "完成修改" : "完成创建"}
</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
