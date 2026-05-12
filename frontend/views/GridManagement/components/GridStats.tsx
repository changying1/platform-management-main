import React from 'react';
import { Grid3X3, CheckCircle, AlertTriangle, XCircle, TrendingUp } from 'lucide-react';
import type { GridStats } from '../../../types';

interface GridStatsProps {
  stats: GridStats;
}

export const GridStatsCard: React.FC<GridStatsProps> = ({ stats }) => {
  const statItems = [
    {
      label: '网格总数',
      value: stats.total_count,
      icon: Grid3X3,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: '正常网格',
      value: stats.normal_count,
      icon: CheckCircle,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      label: '预警网格',
      value: stats.warning_count,
      icon: AlertTriangle,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
    },
    {
      label: '报警网格',
      value: stats.alarm_count,
      icon: XCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        {statItems.map((item) => (
          <div
            key={item.label}
            className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-4"
          >
            <div className={`w-10 h-10 rounded-lg ${item.bgColor} flex items-center justify-center mb-3`}>
              <item.icon size={20} className={item.color} />
            </div>
            <p className="text-2xl font-bold text-white mb-1">{item.value}</p>
            <p className="text-sm text-white/60">{item.label}</p>
          </div>
        ))}
      </div>

      {/* 隐患排行 */}
      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={18} className="text-orange-400" />
          <h3 className="text-lg font-bold text-white">网格隐患排行</h3>
        </div>
        
        <div className="space-y-3">
          {stats.danger_rank.map((item, index) => (
            <div
              key={item.grid_id}
              className="flex items-center justify-between bg-white/5 rounded-lg p-3"
            >
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0 ? 'bg-yellow-500 text-black' :
                  index === 1 ? 'bg-gray-400 text-black' :
                  'bg-orange-600 text-white'
                }`}>
                  {index + 1}
                </div>
                <span className="text-white">{item.grid_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-orange-400 font-bold">{item.danger_count}</span>
                <span className="text-white/50 text-sm">个隐患</span>
              </div>
            </div>
          ))}
          
          {stats.danger_rank.length === 0 && (
            <p className="text-center text-white/50 py-4">暂无隐患数据</p>
          )}
        </div>
      </div>
    </div>
  );
};
