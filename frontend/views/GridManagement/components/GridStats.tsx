import React from 'react';
import { Grid3X3, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import type { GridStats } from '../../../types';

interface GridStatsProps {
  stats: GridStats;
}

export const GridStatsCard: React.FC<GridStatsProps> = ({ stats }) => {
  const safeStats = stats || ({} as GridStats);
  const totalCount = safeStats.total_count ?? (safeStats as any).total ?? 0;
  const normalCount = safeStats.normal_count ?? (safeStats as any).normal ?? 0;
  const warningCount = safeStats.warning_count ?? (safeStats as any).warning ?? 0;
  const alarmCount = safeStats.alarm_count ?? (safeStats as any).alarm ?? 0;

  const statItems = [
    {
      label: '网格总数',
      value: totalCount,
      icon: Grid3X3,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: '正常网格',
      value: normalCount,
      icon: CheckCircle,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      label: '预警网格',
      value: warningCount,
      icon: AlertTriangle,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
    },
    {
      label: '报警网格',
      value: alarmCount,
      icon: XCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
    },
  ];

  return (
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
  );
};