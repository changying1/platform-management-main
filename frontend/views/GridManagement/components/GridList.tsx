import React from 'react';
import { Edit2, Trash2, Eye, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { Grid } from '../../../types';
import { levelNames } from '../../../src/api/gridApi';

interface GridListProps {
  grids: Grid[];
  onEdit: (grid: Grid) => void;
  onDelete: (gridId: string) => void;
  onView: (grid: Grid) => void;
}

const getStatusIcon = (status: Grid['status']) => {
  switch (status) {
    case 'normal':
      return <CheckCircle size={16} className="text-green-400" />;
    case 'warning':
      return <AlertTriangle size={16} className="text-yellow-400" />;
    case 'alarm':
      return <XCircle size={16} className="text-red-400" />;
    default:
      return null;
  }
};

const getStatusText = (status: Grid['status']) => {
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

const getStatusBgClass = (status: Grid['status']) => {
  switch (status) {
    case 'normal':
      return 'bg-green-500/10 text-green-400';
    case 'warning':
      return 'bg-yellow-500/10 text-yellow-400';
    case 'alarm':
      return 'bg-red-500/10 text-red-400';
    default:
      return 'bg-gray-500/10 text-gray-400';
  }
};

export const GridList: React.FC<GridListProps> = ({ grids, onEdit, onDelete, onView }) => {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-3 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">网格列表</h3>
        <p className="text-sm text-white/60">共 {grids.length} 个网格</p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-white/5">
              <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">网格编号</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">网格名称</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">层级</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">状态</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">面积</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">描述</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">操作</th>
            </tr>
          </thead>
          <tbody>
            {grids.map((grid) => (
              <tr 
                key={grid.id || grid.grid_id} 
                className="border-t border-white/5 hover:bg-white/5 transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="text-blue-400 font-bold text-sm">{grid.grid_id || grid.id}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-white font-medium">{grid.name || '-'}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 rounded text-xs bg-cyan-500/10 text-cyan-300">
                    {levelNames[grid.level] || grid.level}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(grid.status)}
                    <span className={`px-2 py-1 rounded text-xs ${getStatusBgClass(grid.status)}`}>
                      {getStatusText(grid.status)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-white/80">
                  {grid.area ? `${grid.area} m²` : '-'}
                </td>
                <td className="px-4 py-3 text-white/60 text-sm max-w-xs truncate">
                  {grid.description || '-'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onView(grid)}
                      className="p-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                      title="查看详情"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => onEdit(grid)}
                      className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                      title="编辑"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => onDelete(grid.id || grid.grid_id)}
                      className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {grids.length === 0 && (
          <div className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <span className="text-white/30 text-2xl">📋</span>
            </div>
            <p className="text-white/60">暂无网格数据</p>
          </div>
        )}
      </div>
    </div>
  );
};
