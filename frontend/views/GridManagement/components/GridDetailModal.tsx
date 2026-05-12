import React from 'react';
import { X, Users, Cpu, AlertTriangle, Calendar } from 'lucide-react';
import type { GridDetail } from '../../../types';
import { roleNames, levelNames, mockPersonnelList, mockDeviceList } from '../../../src/api/gridApi';

interface GridDetailModalProps {
  grid: GridDetail;
  isOpen: boolean;
  onClose: () => void;
}

export const GridDetailModal: React.FC<GridDetailModalProps> = ({ grid, isOpen, onClose }) => {
  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl w-[500px] max-h-[80vh] overflow-hidden border border-white/20 shadow-2xl">
        {/* 头部 */}
        <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">{grid.name}</h3>
            <p className="text-sm text-white/60">{levelNames[grid.level] || grid.level}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-white/60" />
                <span className="text-xs text-white/60">状态</span>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(grid.status)}`}>
                {getStatusText(grid.status)}
              </span>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-white/60">面积</span>
              </div>
              <span className="text-white font-medium">{grid.area || '-'} m²</span>
            </div>
          </div>

          {/* 描述 */}
          <div className="bg-white/5 rounded-lg p-4 mb-6">
            <span className="text-xs text-white/60 mb-2 block">描述</span>
            <p className="text-white/80">{grid.description || '-'}</p>
          </div>

          {/* 责任人列表 */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-cyan-400" />
              <span className="text-white font-medium">责任人</span>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              {mockPersonnelList.slice(0, 3).map((person) => (
                <div key={person.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
                      <span className="text-white text-sm font-medium">{person.name.charAt(0)}</span>
                    </div>
                    <span className="text-white">{person.name}</span>
                  </div>
                  <span className="px-2 py-1 rounded text-xs bg-cyan-500/10 text-cyan-300">
                    {roleNames[person.role] || person.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 设备列表 */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Cpu size={16} className="text-green-400" />
              <span className="text-white font-medium">设备</span>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              {mockDeviceList.slice(0, 3).map((device) => (
                <div key={device.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div>
                    <span className="text-white">{device.name}</span>
                    <p className="text-xs text-white/50">{device.id}</p>
                  </div>
                  <span className="px-2 py-1 rounded text-xs bg-green-500/10 text-green-300">
                    {device.type === 'camera' ? '摄像头' : device.type === 'gps' ? '定位器' : '传感器'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 更新时间 */}
          <div className="flex items-center gap-4 text-xs text-white/50">
            <div className="flex items-center gap-1">
              <Calendar size={12} />
              <span>创建: {grid.created_at}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar size={12} />
              <span>更新: {grid.updated_at}</span>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
