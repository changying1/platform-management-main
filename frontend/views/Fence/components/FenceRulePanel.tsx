import React, { useEffect, useMemo, useState } from "react";
import { X, Clock, Shield, Building2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { OrganizationTreeNode } from "../types";

type DrawTool = "pointer" | "brush" | "line" | "lasso" | "rectangle" | "circle" | "polygon";
type OrgType = "company" | "project" | "grid" | "team";

interface OrgNode {
  id: string;
  unit_id?: string;
  name: string;
  type: OrgType;
  children?: OrgNode[];
}

interface FenceRulePanelProps {
  show: boolean;
  activeTool: DrawTool;
  tempPoints: [number, number][];
  tempShape: any;
  organizationTree?: OrganizationTreeNode[];
  onSave: (data: any) => void;
  onCancel: () => void;
  onBackToDraw: () => void;
}

const getLocalDateTime = (date: Date) => {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getDefaultTimeRange = () => {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return { start: getLocalDateTime(start), end: getLocalDateTime(end) };
};

const toOrgType = (type: string): OrgType | null => {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "branch") return "company";
  if (normalized === "project") return "project";
  if (normalized === "grid") return "grid";
  if (normalized === "team") return "team";
  return null;
};

export const FenceRulePanel: React.FC<FenceRulePanelProps> = ({
  show,
  activeTool,
  tempPoints,
  tempShape,
  organizationTree = [],
  onSave,
  onCancel,
  onBackToDraw,
}) => {
  const timeRange = useMemo(getDefaultTimeRange, []);
  const [formData, setFormData] = useState({
    name: "",
    behavior: "No Exit" as "No Entry" | "No Exit",
    severity: "normal" as "normal" | "risk" | "severe",
    startTime: timeRange.start,
    endTime: timeRange.end,
    description: "",
  });
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [selectedOrgs, setSelectedOrgs] = useState<OrgNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<string[]>([]);

  const treeData = useMemo<OrgNode[]>(() => {
    const convert = (node: OrganizationTreeNode): OrgNode | null => {
      const type = toOrgType(node.type);
      const children = (node.children || []).map(convert).filter(Boolean) as OrgNode[];
      if (!type) return null;
      return {
        id: String(node.unit_id || node.id),
        unit_id: String(node.unit_id || node.id),
        name: node.name,
        type,
        children,
      };
    };
    return organizationTree.map(convert).filter(Boolean) as OrgNode[];
  }, [organizationTree]);

  useEffect(() => {
    if (show && treeData.length > 0) {
      setExpandedNodes(treeData.map(node => node.id));
    }
  }, [show, treeData]);

  if (!show) return null;

  const toggleExpand = (id: string) => {
    setExpandedNodes(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const toggleSelect = (node: OrgNode) => {
    setSelectedOrgs(prev => prev.some(item => item.id === node.id)
      ? prev.filter(item => item.id !== node.id)
      : [...prev, node]);
  };

  const getSelectedOrgPayload = () => {
    const first = (type: OrgType) => selectedOrgs.find(org => org.type === type);
    const company = first("company");
    const project = first("project");
    const grid = first("grid");
    const team = first("team");
    return {
      company: company?.name || "",
      project: project?.name || "",
      grid: grid?.name || "",
      team: team?.name || "",
      branch_id: company?.unit_id || company?.id || null,
      project_id: project?.unit_id || project?.id || null,
      grid_id: grid?.unit_id || grid?.id || null,
      team_id: team?.unit_id || team?.id || null,
      orgs: selectedOrgs,
    };
  };

  const renderOrgNode = (node: OrgNode, level: number) => {
    const isSelected = selectedOrgs.some(item => item.id === node.id);
    const isExpanded = expandedNodes.includes(node.id);
    const hasChildren = !!node.children?.length;
    const typeLabel = node.type === "company" ? "分公司" : node.type === "project" ? "项目" : node.type === "grid" ? "网格" : "工队";
    const typeClass = node.type === "company" ? "bg-blue-500/20 text-blue-400" :
      node.type === "project" ? "bg-purple-500/20 text-purple-400" :
      node.type === "grid" ? "bg-cyan-500/20 text-cyan-400" :
      "bg-green-500/20 text-green-400";

    return (
      <div key={node.id}>
        <div
          className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 hover:bg-slate-700 ${isSelected ? "bg-cyan-500/20 text-cyan-300" : "text-white"}`}
          style={{ paddingLeft: `${12 + level * 16}px` }}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) toggleExpand(node.id);
            }}
            className="w-4 h-4 flex items-center justify-center text-slate-500"
          >
            {hasChildren ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
          </button>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(node)}
            className="w-4 h-4 accent-cyan-500"
          />
          <span>{node.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto ${typeClass}`}>{typeLabel}</span>
        </div>
        {hasChildren && isExpanded && node.children!.map(child => renderOrgNode(child, level + 1))}
      </div>
    );
  };

  const shapeNames: Record<string, string> = {
    circle: "圆形",
    rectangle: "矩形",
    polygon: "多边形",
    brush: "自由绘制",
    line: "线形",
    lasso: "套索区域",
  };

  const handleSubmit = () => {
    if (!formData.name || selectedOrgs.length === 0) {
      alert("请输入围栏名称并选择至少一个绑定组织");
      return;
    }
    onSave({
      ...formData,
      ...getSelectedOrgPayload(),
      shape: activeTool,
      points: tempPoints,
      center: tempShape?.center,
      radius: tempShape?.radius || 100,
    });
  };

  return (
    <div className="absolute top-24 right-4 z-50 w-[360px] bg-slate-900/95 backdrop-blur-xl border border-cyan-400/40 rounded-2xl shadow-2xl overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-b border-cyan-400/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-cyan-300">设置围栏规则</h3>
            <p className="text-xs text-slate-400 mt-0.5">已绘制：{shapeNames[activeTool] || "自定义形状"}</p>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors">
            <X size={16} className="text-red-400" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-h-[45vh] overflow-y-auto">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">围栏名称 *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="请输入围栏名称"
            className="w-full px-4 py-2.5 bg-slate-800/50 border border-cyan-400/30 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
          />
        </div>

        <div className="space-y-3 relative">
          <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
            <Building2 size={14} className="text-cyan-400" />
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
                  <span key={org.id} className="bg-cyan-500/20 text-cyan-300 text-xs px-2 py-0.5 rounded-full">{org.name}</span>
                ))}
                {selectedOrgs.length > 3 && <span className="text-slate-400 text-xs">+{selectedOrgs.length - 3}</span>}
              </div>
            )}
          </div>
          {orgDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOrgDropdownOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-cyan-400/30 rounded-lg shadow-2xl z-20 max-h-[320px] overflow-y-auto py-1">
                {treeData.length > 0 ? treeData.map(node => renderOrgNode(node, 0)) : (
                  <div className="px-3 py-6 text-sm text-slate-500 text-center">暂无组织数据</div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
            <Shield size={14} className="text-cyan-400" />
            出入规则
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setFormData({ ...formData, behavior: "No Exit" })} className={`py-2.5 px-3 rounded-lg border transition-all ${formData.behavior === "No Exit" ? "bg-cyan-500/30 border-cyan-400 text-cyan-300" : "bg-slate-800/30 border-slate-600 text-slate-400"}`}>禁止外出</button>
            <button onClick={() => setFormData({ ...formData, behavior: "No Entry" })} className={`py-2.5 px-3 rounded-lg border transition-all ${formData.behavior === "No Entry" ? "bg-cyan-500/30 border-cyan-400 text-cyan-300" : "bg-slate-800/30 border-slate-600 text-slate-400"}`}>禁止进入</button>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
            <AlertTriangle size={14} className="text-cyan-400" />
            告警等级
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: "normal", label: "一般" },
              { value: "risk", label: "风险" },
              { value: "severe", label: "严重" },
            ].map(level => (
              <button key={level.value} onClick={() => setFormData({ ...formData, severity: level.value as any })} className={`py-2 rounded-lg border transition-all text-sm ${formData.severity === level.value ? "bg-cyan-500/30 border-cyan-400 text-cyan-300" : "bg-slate-800/30 border-slate-600 text-slate-400"}`}>{level.label}</button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
            <Clock size={14} className="text-cyan-400" />
            生效时间段
          </label>
          <input type="datetime-local" value={formData.startTime} onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} className="w-full px-4 py-2.5 bg-slate-800/50 border border-cyan-400/30 rounded-lg text-slate-200" />
          <input type="datetime-local" value={formData.endTime} onChange={(e) => setFormData({ ...formData, endTime: e.target.value })} className="w-full px-4 py-2.5 bg-slate-800/50 border border-cyan-400/30 rounded-lg text-slate-200" />
        </div>
      </div>

      <div className="px-5 py-4 border-t border-cyan-400/30 bg-slate-900/50">
        <div className="flex gap-3">
          <button onClick={onBackToDraw} className="flex-1 py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors">返回绘制</button>
          <button onClick={handleSubmit} className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white rounded-lg transition-all font-medium">保存围栏</button>
        </div>
      </div>
    </div>
  );
};
