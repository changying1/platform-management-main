import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import type { Grid, GridLevel } from '../../../types';
import { levelNames } from '../../../src/api/gridApi';

interface GridFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  editGrid?: Grid | null;
}

export const GridFormModal: React.FC<GridFormModalProps> = ({ isOpen, onClose, onSubmit, editGrid }) => {
  const [formData, setFormData] = useState({
    grid_id: '',
    name: '',
    level: 'workface' as GridLevel,
    parent_id: '',
    project_id: '',
    bounds_json: '',
    description: '',
  });

  useEffect(() => {
    if (editGrid) {
      setFormData({
        grid_id: editGrid.grid_id,
        name: editGrid.name,
        level: editGrid.level,
        parent_id: editGrid.parent_id?.toString() || '',
        project_id: editGrid.project_id?.toString() || '',
        bounds_json: editGrid.bounds_json,
        description: editGrid.description || '',
      });
    } else {
      setFormData({
        grid_id: '',
        name: '',
        level: 'workface',
        parent_id: '',
        project_id: '',
        bounds_json: '',
        description: '',
      });
    }
  }, [editGrid, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      parent_id: formData.parent_id ? formData.parent_id : null,
      project_id: formData.project_id ? formData.project_id : null,
    };
    onSubmit(submitData);
  };

  if (!isOpen) return null;

  const levels: GridLevel[] = ['project', 'workshop', 'team', 'workface'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl w-[500px] max-h-[85vh] overflow-hidden border border-white/20 shadow-2xl">
        {/* 头部 */}
        <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">
            {editGrid ? '编辑网格' : '新建网格'}
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
          {/* 网格编号 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/80 mb-2">
              网格编号 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="grid_id"
              value={formData.grid_id}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400"
              placeholder="请输入网格编号，如：GRID-001"
            />
          </div>

          {/* 网格名称 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/80 mb-2">
              网格名称 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400"
              placeholder="请输入网格名称"
            />
          </div>

          {/* 网格层级 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/80 mb-2">
              网格层级 <span className="text-red-400">*</span>
            </label>
            <select
              name="level"
              value={formData.level}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-white/20 text-white focus:outline-none focus:border-cyan-400"
            >
              {levels.map((level) => (
                <option key={level} value={level} className="bg-slate-700 text-white">
                  {levelNames[level] || level}
                </option>
              ))}
            </select>
          </div>

          {/* 上级网格 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/80 mb-2">
              上级网格编号
            </label>
            <input
              type="text"
              name="parent_id"
              value={formData.parent_id}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400"
              placeholder="可选，上级网格编号"
            />
          </div>

          {/* 所属项目 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/80 mb-2">
              所属项目编号
            </label>
            <input
              type="text"
              name="project_id"
              value={formData.project_id}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400"
              placeholder="可选，项目编号"
            />
          </div>

          {/* 地理边界 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/80 mb-2">
              地理边界 (JSON)
            </label>
            <textarea
              name="bounds_json"
              value={formData.bounds_json}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400 font-mono text-sm"
              placeholder='例如: "[[31.2304, 121.4737], [31.2306, 121.4739], ...]"'
            />
          </div>

          {/* 描述 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/80 mb-2">
              描述
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400"
              placeholder="请输入网格描述"
            />
          </div>
        </form>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 transition-colors flex items-center gap-2"
          >
            <Save size={16} />
            {editGrid ? '保存修改' : '创建网格'}
          </button>
        </div>
      </div>
    </div>
  );
};