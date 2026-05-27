import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import type { Grid } from '../../../types';
import { gridApiClient } from '../../../src/api/gridApi';

interface AssignGridModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (gridIds: string[]) => void;
  personnelId: string;
  currentGridIds: string[];
}

export const AssignGridModal: React.FC<AssignGridModalProps> = ({
  isOpen,
  onClose,
  onAssign,
  personnelId,
  currentGridIds,
}) => {
  const [grids, setGrids] = useState<Grid[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadGrids();
      setSelectedIds(currentGridIds || []);
    }
  }, [isOpen, currentGridIds]);

  const loadGrids = async () => {
    try {
      setLoading(true);
      const data = await gridApiClient.getGrids();
      setGrids(data);
    } catch (error) {
      console.error('加载网格列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleGrid = (gridId: string) => {
    setSelectedIds((prev) =>
      prev.includes(gridId)
        ? prev.filter((id) => id !== gridId)
        : [...prev, gridId]
    );
  };

  const handleSubmit = () => {
    onAssign(selectedIds);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl w-[500px] max-h-[70vh] overflow-hidden border border-white/20 shadow-2xl">
        <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">分配网格</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(70vh-140px)]">
          {loading ? (
            <p className="text-center text-white/60 py-4">加载中...</p>
          ) : grids.length === 0 ? (
            <p className="text-center text-white/60 py-4">暂无网格数据</p>
          ) : (
            <div className="space-y-2">
              {grids.map((grid) => {
                const isSelected = selectedIds.includes(grid.grid_id || grid.id);
                return (
                  <div
                    key={grid.grid_id || grid.id}
                    onClick={() => toggleGrid(grid.grid_id || grid.id)}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-cyan-500/20 border border-cyan-500/50'
                        : 'bg-white/5 border border-transparent hover:bg-white/10'
                    }`}
                  >
                    <div>
                      <p className="text-white font-medium">{grid.name}</p>
                      <p className="text-white/50 text-sm">{grid.grid_id}</p>
                    </div>
                    <div
                      className={`w-6 h-6 rounded border flex items-center justify-center ${
                        isSelected
                          ? 'bg-cyan-500 border-cyan-500'
                          : 'border-white/30'
                      }`}
                    >
                      {isSelected && <Check size={14} className="text-white" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 transition-colors flex items-center gap-2"
          >
            <Check size={16} />
            确认分配
          </button>
        </div>
      </div>
    </div>
  );
};