import React, { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Edit2, FolderTree, Trash2 } from 'lucide-react';
import type { UnitTreeNode } from '../../../../src/api/responsibilityUnitApi';
import { unitTypeNames } from '../../../../src/api/responsibilityUnitApi';

interface UnitTreeProps {
  units: UnitTreeNode[];
  onEdit: (unit: UnitTreeNode) => void;
  onDelete: (unit: UnitTreeNode) => void;
  onMoveUp: (unitId: string) => void;
  onMoveDown: (unitId: string) => void;
  onChangeParent: (unit: UnitTreeNode) => void;
  onCreateChild: (unit: UnitTreeNode) => void;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

const relatedId = (unit: UnitTreeNode) => {
  if (unit.type === 'branch') return unit.name || '-';
  if (unit.type === 'grid') return unit.grid_id || '-';
  if (unit.type === 'team') return unit.team_id || '-';
  if (unit.type === 'personnel') return unit.personnel_id || '-';
  return unit.project_id || '-';
};

const responsibilityLevelLabel: Record<string, string> = {
  branch: '分公司',
  project: '项目',
  grid: '网格',
  team: '工队',
};

const displayUnitName = (unit: UnitTreeNode) =>
  (unit.name || '').replace(/（(branch|project|grid|team)责任人员）|\((branch|project|grid|team)责任人员\)/g, (_match, cnKey, enKey) => {
    const key = cnKey || enKey;
    return `（${responsibilityLevelLabel[key] || key}责任人员）`;
  });

const extractPersonName = (name?: string) => (name || '').replace(/（.*?）|\(.*?\)/g, '').trim();

const displayCode = (unit: UnitTreeNode) => {
  if (unit.unit_id?.startsWith('RESP-PERSON-')) {
    return '-';
  }
  return unit.unit_id || '-';
};

const TreeRow: React.FC<{
  unit: UnitTreeNode;
  depth: number;
  onEdit: (unit: UnitTreeNode) => void;
  onDelete: (unit: UnitTreeNode) => void;
  onMoveUp: (unitId: string) => void;
  onMoveDown: (unitId: string) => void;
  onChangeParent: (unit: UnitTreeNode) => void;
  onCreateChild: (unit: UnitTreeNode) => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  parentName?: string;
}> = ({ unit, depth, onEdit, onDelete, onMoveUp, onMoveDown, onChangeParent, onCreateChild, canCreate, canEdit, canDelete, parentName }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = unit.children && unit.children.length > 0;

  return (
    <>
      <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center" style={{ paddingLeft: `${depth * 24}px` }}>
            {hasChildren ? (
              <button onClick={() => setExpanded(!expanded)} className="mr-2 p-0.5 rounded hover:bg-white/10 text-white/60">
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="mr-2 w-[18px]" />
            )}
            <span className="truncate text-blue-400 font-bold text-sm">{displayUnitName(unit) || displayCode(unit)}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className="px-2 py-1 rounded text-xs bg-cyan-500/10 text-cyan-300">
            {unitTypeNames[unit.type] || unit.type}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-white/60">{parentName || '-'}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {canEdit && <button onClick={() => onMoveUp(unit.unit_id)} className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors" title="上移">
              <ArrowUp size={14} />
            </button>}
            {canEdit && <button onClick={() => onMoveDown(unit.unit_id)} className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors" title="下移">
              <ArrowDown size={14} />
            </button>}
            {canEdit && <button onClick={() => onChangeParent(unit)} className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors">
              改上级
            </button>}
            {canCreate && unit.type !== 'personnel' && (
              <button onClick={() => onCreateChild(unit)} className="px-2 py-1 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded transition-colors">
                新下级
              </button>
            )}
            {canEdit && <button onClick={() => onEdit(unit)} className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors" title="编辑">
              <Edit2 size={14} />
            </button>}
            {canDelete && <button onClick={() => onDelete(unit)} className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors" title="删除">
              <Trash2 size={14} />
            </button>}
          </div>
        </td>
      </tr>
      {expanded && hasChildren && unit.children.map((child) => (
        <TreeRow
          key={child.unit_id}
          unit={child}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onChangeParent={onChangeParent}
          onCreateChild={onCreateChild}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          parentName={displayUnitName(unit) || displayCode(unit)}
        />
      ))}
    </>
  );
};

export const UnitTree: React.FC<UnitTreeProps> = ({ units, onEdit, onDelete, onMoveUp, onMoveDown, onChangeParent, onCreateChild, canCreate = false, canEdit = false, canDelete = false }) => {
  if (units.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
          <FolderTree size={24} className="text-white/30" />
        </div>
        <p className="text-white/60">暂无责任体系数据</p>
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="bg-white/5">
          <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">组织节点</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">类型</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">上级节点</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">操作</th>
        </tr>
      </thead>
      <tbody>
        {units.map((unit) => (
          <TreeRow
            key={unit.unit_id}
            unit={unit}
            depth={0}
            onEdit={onEdit}
            onDelete={onDelete}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onChangeParent={onChangeParent}
            onCreateChild={onCreateChild}
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        ))}
      </tbody>
    </table>
  );
};
