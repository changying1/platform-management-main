import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import type { ResponsibilityUnit, UnitType } from '../../../../src/api/responsibilityUnitApi';
import { unitTypeNames } from '../../../../src/api/responsibilityUnitApi';

interface UnitFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  editUnit?: ResponsibilityUnit | null;
  parentUnit?: { unit_id: string; name: string } | null;
}

export const UnitFormModal: React.FC<UnitFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editUnit,
  parentUnit,
}) => {
  const [formData, setFormData] = useState({
    unit_id: '',
    name: '',
    type: 'division' as UnitType,
    parent_id: '',
    is_under_construction: true,
  });

  useEffect(() => {
    if (editUnit) {
      setFormData({
        unit_id: editUnit.unit_id,
        name: editUnit.name,
        type: editUnit.type,
        parent_id: editUnit.parent_id || '',
        is_under_construction: editUnit.is_under_construction,
      });
    } else if (parentUnit) {
      setFormData({
        unit_id: '',
        name: '',
        type: 'division',
        parent_id: parentUnit.unit_id,
        is_under_construction: true,
      });
    } else {
      setFormData({
        unit_id: '',
        name: '',
        type: 'division',
        parent_id: '',
        is_under_construction: true,
      });
    }
  }, [editUnit, parentUnit, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      parent_id: formData.parent_id || null,
    };
    onSubmit(submitData);
  };

  if (!isOpen) return null;

  const types: UnitType[] = ['division', 'workshop', 'site', 'subproject'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl w-[500px] max-h-[85vh] overflow-hidden border border-white/20 shadow-2xl">
        {/* 头部 */}
        <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">
            {editUnit ? '编辑责任单元' : parentUnit ? `新建下级（${parentUnit.name}）` : '新建一级责任单元'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(85vh-140px)]">
          {/* 单元编号 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/80 mb-2">
              单元编号 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="unit_id"
              value={formData.unit_id}
              onChange={handleChange}
              required
              disabled={!!editUnit}
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400 disabled:opacity-50"
              placeholder="如：UNIT-001"
            />
          </div>

          {/* 单元名称 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/80 mb-2">
              单元名称 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400"
              placeholder="请输入单元名称"
            />
          </div>

          {/* 单元类型 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/80 mb-2">
              单元类型 <span className="text-red-400">*</span>
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-cyan-400"
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {unitTypeNames[type] || type}
                </option>
              ))}
            </select>
          </div>

          {/* 上级单元 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/80 mb-2">
              上级单元编号
            </label>
            <input
              type="text"
              name="parent_id"
              value={formData.parent_id}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400"
              placeholder="可选，上级单元编号"
            />
          </div>

          {/* 是否在建 */}
          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="is_under_construction"
                checked={formData.is_under_construction}
                onChange={handleChange}
                className="w-4 h-4 rounded border-white/20 bg-white/10 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-white/80 text-sm">是否在建</span>
            </label>
          </div>

          {/* 按钮 */}
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
              <Save size={16} />
              <span>{editUnit ? '保存' : '创建'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
