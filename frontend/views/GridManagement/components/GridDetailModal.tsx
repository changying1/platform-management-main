import React from 'react';
import { AlertTriangle, Calendar, Cpu, X } from 'lucide-react';
import type { GridDetail } from '../../../types';

interface GridDetailModalProps {
  grid: GridDetail;
  isOpen: boolean;
  onClose: () => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'normal':
      return 'text-green-400 bg-green-500/10';
    case 'warning':
      return 'text-yellow-400 bg-yellow-500/10';
    case 'alarm':
      return 'text-red-400 bg-red-500/10';
    default:
      return 'text-gray-400 bg-gray-500/10';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'normal':
      return '正常';
    case 'warning':
      return '预警';
    case 'alarm':
      return '报警';
    default:
      return status;
  }
};

export const GridDetailModal: React.FC<GridDetailModalProps> = ({ grid, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="max-h-[80vh] w-[520px] overflow-hidden rounded-xl border border-white/20 bg-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-4">
          <div>
            <h3 className="text-xl font-bold text-white">{grid.name}</h3>
            <p className="text-sm text-white/60">所属项目：{grid.project_id || '-'}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[calc(80vh-80px)] overflow-y-auto p-6">
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle size={14} className="text-white/60" />
                <span className="text-xs text-white/60">状态</span>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${getStatusColor(grid.status)}`}>
                {getStatusText(grid.status)}
              </span>
            </div>

            <div className="rounded-lg bg-white/5 p-4">
              <span className="mb-2 block text-xs text-white/60">面积</span>
              <span className="font-medium text-white">{grid.area || '-'} m2</span>
            </div>
          </div>

          <div className="mb-6 rounded-lg bg-white/5 p-4">
            <span className="mb-2 block text-xs text-white/60">描述</span>
            <p className="text-white/80">{grid.description || '-'}</p>
          </div>

          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <Cpu size={16} className="text-green-400" />
              <span className="font-medium text-white">设备</span>
            </div>
            <div className="rounded-lg bg-white/5 p-4">
              {grid.devices && grid.devices.length > 0 ? (
                grid.devices.map((device) => (
                  <div key={device.id} className="flex items-center justify-between border-b border-white/5 py-2 last:border-0">
                    <div>
                      <span className="text-white">{device.name}</span>
                      <p className="text-xs text-white/50">{device.id}</p>
                    </div>
                    <span className="rounded bg-green-500/10 px-2 py-1 text-xs text-green-300">{device.type}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/50">暂无设备</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-white/50">
            <div className="flex items-center gap-1">
              <Calendar size={12} />
              <span>创建：{grid.created_at}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar size={12} />
              <span>更新：{grid.updated_at}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 px-4 py-2 text-white transition-colors hover:bg-white/20"
            type="button"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
