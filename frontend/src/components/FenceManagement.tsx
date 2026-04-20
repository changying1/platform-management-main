// src/components/admin/FenceManagement.tsx
import React, { useState } from 'react';
import { Search, Plus, Edit2, Trash2, X, Fence, Map } from 'lucide-react';

interface ElectronicFence {
  id: number;
  name: string;
  projectId: number;
  projectName?: string;
  type: 'round' | 'polygon' | 'line';
  coordinates: string;
  alarmType: 'entry' | 'exit' | 'both';
  status: 'active' | 'inactive';
}

export default function FenceManagement() {
  const [fences, setFences] = useState<ElectronicFence[]>([
    { id: 1, name: '北门电子围栏', projectId: 1, projectName: '西安地铁8号线', type: 'polygon', coordinates: '...', alarmType: 'both', status: 'active' },
    { id: 2, name: '危险区域围栏', projectId: 1, projectName: '西安地铁8号线', type: 'round', coordinates: '...', alarmType: 'entry', status: 'active' },
  ]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ElectronicFence | null>(null);

  const filteredData = fences.filter(f => 
    f.name.includes(searchTerm) || (f.projectName && f.projectName.includes(searchTerm))
  );

  const getStatusStyle = (status: string) => {
    return status === 'active' 
      ? 'bg-green-500/20 text-green-400 border-green-500/30' 
      : 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  const getStatusText = (status: string) => status === 'active' ? '启用' : '禁用';

  const getTypeText = (type: string) => {
    const map = { round: '圆形', polygon: '多边形', line: '线形' };
    return map[type as keyof typeof map] || type;
  };

  const getAlarmTypeText = (alarmType: string) => {
    const map = { entry: '进入报警', exit: '离开报警', both: '双向报警' };
    return map[alarmType as keyof typeof map] || alarmType;
  };

  return (
    <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-4 h-full overflow-auto">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
          <input
            type="text"
            placeholder="搜索围栏..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>
        <button
          onClick={() => { setEditingItem(null); setShowModal(true); }}
          className="px-4 py-2 bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-2 text-sm"
        >
          <Plus size={16} /> 添加电子围栏
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-blue-400/20 bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">围栏名称</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">所属项目</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">类型</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">告警类型</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">坐标范围</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">状态</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {filteredData.map(fence => (
              <tr key={fence.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 text-slate-300">{fence.name}</td>
                <td className="px-4 py-3 text-slate-300">{fence.projectName || '-'}</td>
                <td className="px-4 py-3 text-slate-300">{getTypeText(fence.type)}</td>
                <td className="px-4 py-3 text-slate-300">{getAlarmTypeText(fence.alarmType)}</td>
                <td className="px-4 py-3 text-slate-300">
                  <span className="text-xs text-cyan-400 cursor-pointer hover:underline" onClick={() => alert('地图坐标查看功能待完善')}>
                    查看坐标
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(fence.status)}`}>
                    {getStatusText(fence.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-1 hover:bg-cyan-500/20 rounded text-cyan-400"><Edit2 size={16} /></button>
                    <button className="p-1 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[500px] p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-100">{editingItem ? '编辑电子围栏' : '添加电子围栏'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-slate-400 text-center py-8">表单功能待完善（后续接入地图）</p>
            </div>
            <div className="flex gap-3 mt-8">
              <button className="flex-1 bg-cyan-500 hover:bg-cyan-400 py-2 rounded text-sm font-bold text-slate-900">保存</button>
              <button onClick={() => setShowModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded text-sm text-slate-100">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
