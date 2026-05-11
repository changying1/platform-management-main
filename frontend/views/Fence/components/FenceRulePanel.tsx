import React, { useState } from "react";
import { X, Clock, Shield, Building2, AlertTriangle, Save } from "lucide-react";

type DrawTool = 'pointer' | 'brush' | 'line' | 'lasso' | 'rectangle' | 'circle' | 'polygon';

interface FenceRulePanelProps {
  show: boolean;
  activeTool: DrawTool;
  tempPoints: [number, number][];
  tempShape: any;
  onSave: (data: any) => void;
  onCancel: () => void;
  onBackToDraw: () => void;
}

export const FenceRulePanel: React.FC<FenceRulePanelProps> = ({
  show,
  activeTool,
  tempPoints,
  tempShape,
  onSave,
  onCancel,
  onBackToDraw,
}) => {
  const getTodayDateTime = () => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return {
      start: start.toISOString().slice(0, 16),
      end: end.toISOString().slice(0, 16),
    };
  };

  const [formData, setFormData] = useState(() => {
    const { start, end } = getTodayDateTime();
    return {
      name: '',
      behavior: 'No Exit' as 'No Entry' | 'No Exit',
      severity: 'medium' as 'low' | 'medium' | 'high' | 'severe',
      startTime: start,
      endTime: end,
      description: '',
    };
  });

  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [selectedOrgs, setSelectedOrgs] = useState<any[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<string[]>(['company1', 'company2']);

  const treeData = [
    {
      id: 'company1',
      name: '第一分公司',
      type: 'company',
      children: [
        {
          id: 'project1',
          name: '西安地铁15号线',
          type: 'project',
          children: [
            { id: 'team1', name: '土方作业队', type: 'team' },
            { id: 'team2', name: '钢筋班组', type: 'team' },
            { id: 'team3', name: '起重作业队', type: 'team' },
          ]
        },
        {
          id: 'project2',
          name: '曲江智慧园区',
          type: 'project',
          children: [
            { id: 'team4', name: '机电安装队', type: 'team' },
            { id: 'team5', name: '消防班组', type: 'team' },
          ]
        }
      ]
    },
    {
      id: 'company2',
      name: '第二分公司',
      type: 'company',
      children: [
        {
          id: 'project3',
          name: '成都天府机场',
          type: 'project',
          children: [
            { id: 'team6', name: '土建作业队', type: 'team' },
            { id: 'team7', name: '焊接班组', type: 'team' },
          ]
        }
      ]
    },
    {
      id: 'company3',
      name: '第三分公司',
      type: 'company',
      children: []
    }
  ];

  const toggleExpand = (id: string) => {
    setExpandedNodes(prev => 
      prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id]
    );
  };

  const toggleSelect = (node: any) => {
    const isSel = selectedOrgs.some(o => o.id === node.id);
    if (isSel) {
      setSelectedOrgs(selectedOrgs.filter(o => o.id !== node.id));
    } else {
      setSelectedOrgs([...selectedOrgs, { id: node.id, name: node.name, type: node.type }]);
    }
  };

  const renderOrgNode = (node: any, level: number) => {
    const isSelected = selectedOrgs.some(o => o.id === node.id);
    const isExpanded = expandedNodes.includes(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const indent = level * 16;

    return (
      <div key={node.id}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            if ((e.target as HTMLElement).closest('.arrow')) {
              hasChildren && toggleExpand(node.id);
            } else {
              toggleSelect(node);
            }
          }}
          className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 hover:bg-slate-700 ${
            isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'text-white'
          }`}
          style={{ paddingLeft: `${12 + indent}px` }}
        >
          <span className="arrow w-4 h-4 flex items-center justify-center text-slate-500">
            {hasChildren && (isExpanded ? '▼' : '▶')}
          </span>
          <span className="w-4 h-4 rounded border flex items-center justify-center text-xs">
            {isSelected && '✓'}
          </span>
          <span>{node.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto ${
            node.type === 'company' ? 'bg-blue-500/20 text-blue-400' :
            node.type === 'project' ? 'bg-purple-500/20 text-purple-400' :
            'bg-green-500/20 text-green-400'
          }`}>
            {node.type === 'company' ? '公司' : node.type === 'project' ? '项目' : '作业队'}
          </span>
        </div>
        {hasChildren && isExpanded && node.children.map((child: any) => renderOrgNode(child, level + 1))}
      </div>
    );
  };

  if (!show) return null;

  const shapeNames: Record<string, string> = {
    circle: '圆形',
    rectangle: '矩形',
    polygon: '多边形',
    brush: '自由绘制',
    line: '线形',
    lasso: '套索区域',
  };

  const handleSubmit = () => {
    if (!formData.name || selectedOrgs.length === 0) {
      alert('请输入围栏名称并选择至少一个绑定组织');
      return;
    }

    const fenceData = {
      ...formData,
      orgs: selectedOrgs,
      shape: activeTool,
      points: tempPoints,
      center: tempShape?.center,
      radius: tempShape?.radius || 100,
    };
    onSave(fenceData);
  };

  return (
    <div className="absolute top-24 right-4 z-50 w-[360px] bg-slate-900/95 backdrop-blur-xl border border-cyan-400/40 rounded-2xl shadow-2xl overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-b border-cyan-400/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-cyan-300">设置围栏规则</h3>
            <p className="text-xs text-slate-400 mt-0.5">已绘制: {shapeNames[activeTool] || '自定义形状'}</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
          >
            <X size={16} className="text-red-400" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-h-[45vh] overflow-y-auto">
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
                {treeData.map(company => renderOrgNode(company, 0))}
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

        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
            <AlertTriangle size={14} className="text-cyan-400" />
            告警等级（仅三级）
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'general', label: '低', color: 'blue' },
              { value: 'risk', label: '中', color: 'orange' },
              { value: 'severe', label: '高', color: 'red' },
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

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            备注说明
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="输入围栏相关说明..."
            rows={3}
            className="w-full px-4 py-2.5 bg-slate-800/50 border border-cyan-400/30 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors resize-none"
          />
        </div>
      </div>

      <div className="px-5 py-4 border-t border-cyan-400/30 bg-slate-900/50">
        <div className="flex gap-3">
          <button
            onClick={onBackToDraw}
            className="flex-1 py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            返回绘制
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white rounded-lg transition-all flex items-center justify-center gap-2 font-medium shadow-lg shadow-cyan-500/20"
          >
            <Save size={16} />
            保存围栏
          </button>
        </div>
      </div>
    </div>
  );
};
