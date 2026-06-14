import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRightLeft } from 'lucide-react';
import type { ResponsibilityUnit, UnitType } from '../../../../src/api/responsibilityUnitApi';

interface ChangeParentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (unitId: string, newParentId: string) => void;
  unit: ResponsibilityUnit | null;
  allUnits: ResponsibilityUnit[];
}

const parentTypeRules: Partial<Record<UnitType, UnitType[]>> = {
  project: ['branch'],
  safety_office: ['project'],
  grid: ['project'],
  team: ['grid'],
};

const canBeRoot = (unit: ResponsibilityUnit) => unit.type === 'branch';

const displayName = (unit: ResponsibilityUnit) => unit.name || unit.unit_id || '-';

const optionLabel = (unit: ResponsibilityUnit) => {
  const name = displayName(unit);
  return unit.unit_id && unit.unit_id !== name ? `${name} (${unit.unit_id})` : name;
};

export const ChangeParentModal: React.FC<ChangeParentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  unit,
  allUnits,
}) => {
  const [selectedParentId, setSelectedParentId] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedParentId(unit?.parent_id || '');
    }
  }, [isOpen, unit?.unit_id, unit?.parent_id]);

  const availableParents = useMemo(() => {
    if (!unit) return [];

    const allowedTypes = parentTypeRules[unit.type] || [];
    const currentUnitId = unit.unit_id || unit.id;
    const byId = new Map(allUnits.map((item) => [item.unit_id || item.id, item]));

    const isDescendant = (candidate: ResponsibilityUnit) => {
      let parentId = candidate.parent_id;
      while (parentId) {
        if (parentId === currentUnitId) return true;
        parentId = byId.get(parentId)?.parent_id;
      }
      return false;
    };

    return allUnits.filter((candidate) => {
      if ((candidate.unit_id || candidate.id) === currentUnitId) return false;
      if (!allowedTypes.includes(candidate.type)) return false;
      return !isDescendant(candidate);
    });
  }, [allUnits, unit]);

  if (!isOpen || !unit) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(unit.unit_id || unit.id, selectedParentId);
  };

  const noParentAllowed = canBeRoot(unit);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-xl w-[520px] border border-white/20 shadow-2xl">
        <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">变更上级</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-2 text-white/60 text-sm">
            当前单元：<span className="text-white">{displayName(unit)}</span>
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
              {noParentAllowed && (
                <option value="" className="bg-slate-800 text-white">
                  无上级（一级节点）
                </option>
              )}
              {!noParentAllowed && selectedParentId === '' && (
                <option value="" disabled className="bg-slate-800 text-white">
                  请选择上级节点
                </option>
              )}
              {availableParents.map((candidate) => (
                <option key={candidate.unit_id} value={candidate.unit_id} className="bg-slate-800 text-white">
                  {optionLabel(candidate)}
                </option>
              ))}
            </select>
            {availableParents.length === 0 && !noParentAllowed && (
              <p className="mt-2 text-sm text-yellow-300">
                没有可选上级，请先创建对应层级的上级节点。
              </p>
            )}
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
              disabled={!noParentAllowed && !selectedParentId}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:from-cyan-400 hover:to-blue-400 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowRightLeft size={16} />
              <span>确认变更</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
