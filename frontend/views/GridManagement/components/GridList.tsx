import React from 'react';
import { AlertTriangle, CheckCircle, Edit2, Eye, Trash2, XCircle } from 'lucide-react';
import type { Grid } from '../../../types';

interface GridListProps {
  grids: Grid[];
  onEdit: (grid: Grid) => void;
  onDelete: (gridId: string) => void;
  onView: (grid: Grid) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const getStatusIcon = (status: Grid['status']) => {
  switch (status || 'normal') {
    case 'normal':
      return <CheckCircle size={16} className="text-green-400" />;
    case 'warning':
      return <AlertTriangle size={16} className="text-yellow-400" />;
    case 'alarm':
      return <XCircle size={16} className="text-red-400" />;
    default:
      return <CheckCircle size={16} className="text-green-400" />;
  }
};

const getStatusText = (status: Grid['status']) => {
  switch (status || 'normal') {
    case 'normal':
      return '正常';
    case 'warning':
      return '预警';
    case 'alarm':
      return '报警';
    default:
      return status || '正常';
  }
};

const getStatusBgClass = (status: Grid['status']) => {
  switch (status || 'normal') {
    case 'normal':
      return 'bg-green-500/10 text-green-400';
    case 'warning':
      return 'bg-yellow-500/10 text-yellow-400';
    case 'alarm':
      return 'bg-red-500/10 text-red-400';
    default:
      return 'bg-green-500/10 text-green-400';
  }
};

const calculateArea = (boundsJson?: string) => {
  if (!boundsJson) return null;
  try {
    const points = JSON.parse(boundsJson);
    if (!Array.isArray(points) || points.length < 3) return null;
    const normalized = points.map((point: unknown) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const lat = Number(point[0]);
      const lng = Number(point[1]);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    });
    if (normalized.some((point) => !point)) return null;

    const validPoints = normalized as Array<{ lat: number; lng: number }>;
    const avgLat = validPoints.reduce((sum, point) => sum + point.lat, 0) / validPoints.length;
    const metersPerLat = 111_320;
    const metersPerLng = 111_320 * Math.cos((avgLat * Math.PI) / 180);
    const projected = validPoints.map((point) => ({
      x: point.lng * metersPerLng,
      y: point.lat * metersPerLat,
    }));
    const shoelace = projected.reduce((sum, point, index) => {
      const next = projected[(index + 1) % projected.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    return Math.abs(shoelace) / 2;
  } catch {
    return null;
  }
};

const formatArea = (grid: Grid) => {
  const area = typeof grid.area === 'number' && Number.isFinite(grid.area)
    ? grid.area
    : calculateArea(grid.bounds_json);
  if (!area || area <= 0) return '-';
  if (area >= 10000) return `${(area / 10000).toFixed(2)} ha`;
  return `${area.toFixed(2)} m2`;
};

export const GridList: React.FC<GridListProps> = ({ grids, onEdit, onDelete, onView, canEdit = false, canDelete = false }) => {
  return (
    <div className="overflow-hidden rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-3">
        <h3 className="text-lg font-bold text-white">网格列表</h3>
        <p className="text-sm text-white/60">共 {grids.length} 个网格</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-white/5">
              <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">网格编号</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">网格名称</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">所属项目</th>
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
                className="border-t border-white/5 transition-colors hover:bg-white/5"
              >
                <td className="px-4 py-3">
                  <span className="text-sm font-bold text-blue-400">{grid.grid_id || grid.id}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium text-white">{grid.name || '-'}</span>
                </td>
                <td className="px-4 py-3 text-white/70">{grid.project_id || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(grid.status)}
                    <span className={`rounded px-2 py-1 text-xs ${getStatusBgClass(grid.status)}`}>
                      {getStatusText(grid.status)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-white/80">{formatArea(grid)}</td>
                <td className="max-w-xs truncate px-4 py-3 text-sm text-white/60">{grid.description || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onView(grid)}
                      className="rounded-lg bg-blue-500/10 p-2 text-blue-400 transition-colors hover:bg-blue-500/20"
                      title="查看详情"
                      type="button"
                    >
                      <Eye size={16} />
                    </button>
                    {canEdit && (
                    <button
                      onClick={() => onEdit(grid)}
                      className="rounded-lg bg-yellow-500/10 p-2 text-yellow-400 transition-colors hover:bg-yellow-500/20"
                      title="编辑"
                      type="button"
                    >
                      <Edit2 size={16} />
                    </button>
                    )}
                    {canDelete && (
                    <button
                      onClick={() => onDelete(grid.id || grid.grid_id)}
                      className="rounded-lg bg-red-500/10 p-2 text-red-400 transition-colors hover:bg-red-500/20"
                      title="删除"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {grids.length === 0 && (
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
              <span className="text-2xl text-white/30">□</span>
            </div>
            <p className="text-white/60">暂无网格数据</p>
          </div>
        )}
      </div>
    </div>
  );
};
