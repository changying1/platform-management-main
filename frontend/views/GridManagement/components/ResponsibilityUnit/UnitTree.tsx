import React, { useState } from 'react';
import { ChevronRight, ChevronDown, ArrowUp, ArrowDown, Edit2, Trash2, FolderTree } from 'lucide-react';
import type { UnitTreeNode } from '../../../../src/api/responsibilityUnitApi';
import { unitTypeNames } from '../../../../src/api/responsibilityUnitApi';

interface UnitTreeProps {
  units: UnitTreeNode[];
  onEdit: (unit: UnitTreeNode) => void;
  onDelete: (unitId: string) => void;
  onMoveUp: (unitId: string) => void;
  onMoveDown: (unitId: string) => void;
  onChangeParent: (unit: UnitTreeNode) => void;
}

const TreeRow: React.FC<{
  unit: UnitTreeNode;
  depth: number;
  onEdit: (unit: UnitTreeNode) => void;
  onDelete: (unitId: string) => void;
  onMoveUp: (unitId: string) => void;
  onMoveDown: (unitId: string) => void;
  onChangeParent: (unit: UnitTreeNode) => void;
}> = ({ unit, depth, onEdit, onDelete, onMoveUp, onMoveDown, onChangeParent }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = unit.children && unit.children.length > 0;
  const indent = depth * 24;

  return (
    <>
      <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center" style={{ paddingLeft: `${indent}px` }}>
            {hasChildren ? (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mr-2 p-0.5 rounded hover:bg-white/10 text-white/60"
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="mr-2 w-[18px]" />
            )}
            <span className="text-blue-400 font-bold text-sm">{unit.unit_id}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className="text-white font-medium">{unit.name}</span>
        </td>
        <td className="px-4 py-3">
          <span className="px-2 py-1 rounded text-xs bg-cyan-500/10 text-cyan-300">
            {unitTypeNames[unit.type] || unit.type}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`text-sm ${unit.is_under_construction ? 'text-green-400' : 'text-white/40'}`}>
            {unit.is_under_construction ? '是' : '—'}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onMoveUp(unit.unit_id)}
              className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
            >
              上移
            </button>
            <button
              onClick={() => onMoveDown(unit.unit_id)}
              className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
            >
              下移
            </button>
            <button
              onClick={() => onChangeParent(unit)}
              className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
            >
              变更上级
            </button>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(unit)}
              className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
              title="编辑"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={() => onDelete(unit.unit_id)}
              className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              title="删除"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && hasChildren &&
        unit.children.map((child) => (
          <TreeRow
            key={child.unit_id}
            unit={child}
            depth={depth + 1}
            onEdit={onEdit}
            onDelete={onDelete}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onChangeParent={onChangeParent}
          />
        ))}
    </>
  );
};

export const UnitTree: React.FC<UnitTreeProps> = ({
  units,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onChangeParent,
}) => {
  if (units.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
          <FolderTree size={32} className="text-white/30" />
        </div>
        <p className="text-white/60">暂无责任单元数据</p>
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="bg-white/5">
          <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">编号</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">基础单元</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">类型</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">是否在建</th>
          <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">移动</th>
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
          />
        ))}
      </tbody>
    </table>
  );
};
