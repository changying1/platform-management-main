import React, { useState } from 'react';
import { X, ArrowRightLeft } from 'lucide-react';
import type { ResponsibilityUnit } from '../../../../src/api/responsibilityUnitApi';

interface ChangeParentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (unitId: string, newParentId: string) => void;
  unit: ResponsibilityUnit | null;
  allUnits: ResponsibilityUnit[];
}

export const ChangeParentModal: React.FC<ChangeParentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  unit,
  allUnits,
}) => {
  const [selectedParentId, setSelectedParentId] = useState('');

  if (!isOpen || !unit) return null;

  // 过滤可选的上级：排除自己和自己的子节点（简化处理）
  const availableParents = allUnits.filter(
    (u) => u.unit_id !== unit.unit_id && u.unit_id !== unit.parent_id
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(unit.unit_id, selectedParentId || '');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl w-[400px] border border-white/20 shadow-2xl">
        {/* 头部 */}
        <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">变更上级</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-2 text-white/60 text-sm">
            当前单元：<span className="text-white">{unit.name}</span>（{unit.unit_id}）
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-white/80 mb-2">
              选择新上级
            </label>
            <select
              value={selectedParentId}
              onChange={(e) => setSelectedParentId(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="">无上级（设为一级）</option>
              {availableParents.map((u) => (
                <option key={u.unit_id} value={u.unit_id}>
                  {u.unit_id} - {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:from-cyan-400 hover:to-blue-400 transition-colors"
            >
              <ArrowRightLeft size={16} />
              <span>确认变更</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
