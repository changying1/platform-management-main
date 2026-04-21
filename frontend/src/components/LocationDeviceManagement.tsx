// src/components/admin/LocationDeviceManagement.tsx
import React, { useState } from 'react';
import { Search, Plus, Edit2, Trash2, X, MapPin, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface LocationDevice {
  id: number;
  name: string;
  deviceId: string;
  type: 'uwb_band' | 'uwb_badge' | 'rtk_band' | 'rtk_badge' | 'wifi';
  company?: string;
  projectId: number;
  projectName?: string;
  team?: string;              // 所属工队
  holder?: string;
  holderPhone?: string;
  status: 'online' | 'offline' | 'fault';
  remark?: string;
}

export default function LocationDeviceManagement() {
const [devices, setDevices] = useState<LocationDevice[]>([
  { id: 1, name: 'UWB定位手环-001', deviceId: 'UWB001', type: 'uwb_band', company: '第一分公司', projectId: 1, projectName: '西安地铁8号线', team: '土建工队', holder: '张三', holderPhone: '13800138001', status: 'online' },
  { id: 2, name: 'UWB定位工牌-002', deviceId: 'UWB002', type: 'uwb_badge', company: '第一分公司', projectId: 1, projectName: '西安地铁8号线', team: '土建工队', holder: '李四', holderPhone: '13800138002', status: 'online' },
  { id: 3, name: 'RTK手环-003', deviceId: 'RTK001', type: 'rtk_band', company: '第二分公司', projectId: 2, projectName: '西安地铁10号线', team: '机电工队', holder: '王五', holderPhone: '13800138003', status: 'offline' },
  { id: 4, name: 'RTK工牌-004', deviceId: 'RTK002', type: 'rtk_badge', company: '第二分公司', projectId: 2, projectName: '西安地铁10号线', team: '安全工队', holder: '赵六', holderPhone: '13800138004', status: 'fault' },
  { id: 5, name: 'Wi-Fi定位服务器', deviceId: 'WIFI001', type: 'wifi', company: '第一分公司', projectId: 1, projectName: '西安地铁8号线', team: '机电工队', holder: '机房管理员', holderPhone: '13800138005', status: 'online' },
]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<LocationDevice | null>(null);
const [showUploadModal, setShowUploadModal] = useState(false);
const [uploadPreview, setUploadPreview] = useState<any[]>([]);
const [filterType, setFilterType] = useState<string>('all');
const [filterStatus, setFilterStatus] = useState<string>('all');
const [filterCompany, setFilterCompany] = useState<string>('all');
const [filterTeam, setFilterTeam] = useState<string>('all');
const types = ['all', ...new Set(devices.map(d => d.type))];
const statuses = ['all', 'online', 'offline', 'fault'];
const companies = ['all', ...new Set(devices.map(d => d.company).filter(Boolean))];
const teams = ['all', ...new Set(devices.map(d => d.team).filter(Boolean))];

const filteredData = devices.filter(d => {
  const matchesSearch = searchTerm === '' || 
    d.name.includes(searchTerm) || 
    d.deviceId.includes(searchTerm) ||
    d.team?.includes(searchTerm) ||
    d.holder?.includes(searchTerm);
  const matchesType = filterType === 'all' || d.type === filterType;
  const matchesStatus = filterStatus === 'all' || d.status === filterStatus;
  const matchesCompany = filterCompany === 'all' || d.company === filterCompany;
  const matchesTeam = filterTeam === 'all' || d.team === filterTeam;
  return matchesSearch && matchesType && matchesStatus && matchesCompany && matchesTeam;
});



const getTypeText = (type: string) => {
  const map: Record<string, string> = { 
    uwb_band: 'UWB手环', 
    uwb_badge: 'UWB工牌', 
    rtk_band: 'RTK手环', 
    rtk_badge: 'RTK工牌', 
    wifi: 'Wi-Fi定位'
  };
  return map[type] || type;
};

const getStatusStyle = (status: string) => {
  const styles: Record<string, string> = {
    online: 'bg-green-500/20 text-green-400 border-green-500/30',
    offline: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    fault: 'bg-red-500/20 text-red-400 border-red-500/30'
  };
  return styles[status] || styles.offline;
};

const getStatusText = (status: string) => {
  const map = { online: '在线', offline: '离线', fault: '故障' };
  return map[status as keyof typeof map] || status;
};

// 下载模板
const downloadTemplate = () => {
  const template = [
    ['设备名称', '设备ID', '类型', '分公司', '项目', '持有人', '持有人电话', '备注'],
    ['UWB手环-001', 'UWB001', 'UWB手环', '第一分公司', '西安地铁8号线', '张三', '13800138001', ''],
    ['RTK工牌-001', 'RTK001', 'RTK工牌', '第二分公司', '西安地铁10号线', '李四', '13800138002', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '定位设备模板');
  XLSX.writeFile(wb, '定位设备导入模板.xlsx');
};

// 解析Excel
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target?.result as ArrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
    const dataRows = rows.slice(1).filter((row: any) => row[0]);
    
    const typeMap: Record<string, any> = {
      'UWB手环': 'uwb_band', 'UWB工牌': 'uwb_badge',
      'RTK手环': 'rtk_band', 'RTK工牌': 'rtk_badge', 'Wi-Fi定位': 'wifi'
    };
    const projectMap: Record<string, { id: number, name: string }> = {
      '西安地铁8号线': { id: 1, name: '西安地铁8号线' },
      '西安地铁10号线': { id: 2, name: '西安地铁10号线' }
    };
    
    const parsedData = dataRows.map((row: any) => {
      const typeText = row[2]?.toString().trim() || '';
      const projectName = row[4]?.toString().trim() || '西安地铁8号线';
      return {
        name: row[0]?.toString().trim() || '',
        deviceId: row[1]?.toString().trim() || '',
        type: typeMap[typeText] || 'uwb_band',
        company: row[3]?.toString().trim() || '',
        projectId: projectMap[projectName]?.id || 1,
        projectName: projectMap[projectName]?.name || '西安地铁8号线',
        holder: row[5]?.toString().trim() || '',
        holderPhone: row[6]?.toString().trim() || '',
        remark: row[7]?.toString().trim() || '',
        isValid: !!(row[0] && row[1]),
        errorMsg: !row[0] ? '设备名称不能为空' : !row[1] ? '设备ID不能为空' : ''
      };
    });
    setUploadPreview(parsedData);
  };
  reader.readAsArrayBuffer(file);
};

// 确认导入
const confirmImport = () => {
  const validData = uploadPreview.filter(item => item.isValid);
  const newDevices = validData.map((item: any, idx: number) => ({
    id: Math.max(...devices.map(d => d.id), 0) + idx + 1,
    name: item.name,
    deviceId: item.deviceId,
    type: item.type,
    company: item.company,
    projectId: item.projectId,
    projectName: item.projectName,
    holder: item.holder,
    holderPhone: item.holderPhone,
    remark: item.remark,
    status: 'online' as const,
  }));
  setDevices([...devices, ...newDevices]);
  setShowUploadModal(false);
  setUploadPreview([]);
  alert(`成功导入 ${validData.length} 条`);
};

  return (
    <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-4 h-full overflow-auto">
<div className="flex items-center gap-3 mb-4 flex-wrap">
  <div className="relative flex-1 min-w-[180px]">
    <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
    <input
      type="text"
      placeholder="搜索名称、设备ID、持有人..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
    />
  </div>
  
  <select
    value={filterCompany}
    onChange={(e) => setFilterCompany(e.target.value)}
    className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400"
  >
    {companies.map(c => <option key={c} value={c}>{c === 'all' ? '全部公司' : c}</option>)}
  </select>
  
  <select
    value={filterTeam}
    onChange={(e) => setFilterTeam(e.target.value)}
    className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400"
  >
    {teams.map(t => <option key={t} value={t}>{t === 'all' ? '全部工队' : t}</option>)}
  </select>
  
  <select
    value={filterType}
    onChange={(e) => setFilterType(e.target.value)}
    className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400"
  >
    {types.map(t => <option key={t} value={t}>{t === 'all' ? '全部类型' : getTypeText(t)}</option>)}
  </select>
  
  <select
    value={filterStatus}
    onChange={(e) => setFilterStatus(e.target.value)}
    className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400"
  >
    {statuses.map(s => <option key={s} value={s}>{s === 'all' ? '全部状态' : getStatusText(s)}</option>)}
  </select>
  
  <button
    onClick={() => {
      setFilterCompany('all');
      setFilterTeam('all');
      setFilterType('all');
      setFilterStatus('all');
      setSearchTerm('');
    }}
    className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1.5"
  >
    重置
  </button>
  
  <button
    onClick={() => setShowUploadModal(true)}
    className="px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-1 text-sm"
  >
    <Upload size={14} /> 批量导入
  </button>
  
  <button
    onClick={downloadTemplate}
    className="px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-1 text-sm"
  >
    <Download size={14} /> 下载模板
  </button>
  
  <button
    onClick={() => {
      setEditingItem(null);
      setShowModal(true);
    }}
    className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-1 text-sm"
  >
    <Plus size={14} /> 添加装置
  </button>
</div>

      <div className="overflow-x-auto">
        <table className="w-full">
<thead className="border-b border-blue-400/20 bg-slate-800/50">
  <tr>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">设备名称</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">设备ID</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">类型</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">分公司</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">项目</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">工队</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">持有人</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">状态</th>
    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300">操作</th>
  </tr>
</thead>
          <tbody className="divide-y divide-slate-700">
{filteredData.map(device => (
  <tr key={device.id} className="hover:bg-slate-800/30 transition-colors">
    <td className="px-4 py-3 text-slate-300">{device.name}</td>
    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{device.deviceId}</td>
    <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">{getTypeText(device.type)}</span></td>
    <td className="px-4 py-3 text-slate-300">{device.company || '-'}</td>
    <td className="px-4 py-3 text-slate-300">{device.projectName || '-'}</td>
    <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">{device.team || '-'}</span></td>
    <td className="px-4 py-3"><div className="text-sm text-slate-300">{device.holder || '-'}</div>{device.holderPhone && <div className="text-xs text-slate-500">{device.holderPhone}</div>}</td>
    <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(device.status)}`}>{getStatusText(device.status)}</span></td>
    <td className="px-4 py-3 text-right">
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => { setEditingItem(device); setShowModal(true); }} className="p-1 hover:bg-cyan-500/20 rounded text-cyan-400"><Edit2 size={16} /></button>
        <button onClick={() => { if (confirm('确定删除吗？')) setDevices(devices.filter(d => d.id !== device.id)); }} className="p-1 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={16} /></button>
      </div>
    </td>
  </tr>
))}
          </tbody>
        </table>
      </div>

{showModal && (
  <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[550px] p-6 shadow-2xl max-h-[90vh] overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-slate-100">{editingItem ? '编辑定位装置' : '添加定位装置'}</h3>
        <button onClick={() => setShowModal(false)}><X size={20} /></button>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm text-slate-400 mb-1">设备名称 *</label><input type="text" value={editingItem?.name || ''} onChange={(e) => setEditingItem({ ...editingItem!, name: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm text-slate-400 mb-1">设备ID *</label><input type="text" value={editingItem?.deviceId || ''} onChange={(e) => setEditingItem({ ...editingItem!, deviceId: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm text-slate-400 mb-1">设备类型</label><select value={editingItem?.type || 'uwb_band'} onChange={(e) => setEditingItem({ ...editingItem!, type: e.target.value as any })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm"><option value="uwb_band">UWB手环</option><option value="uwb_badge">UWB工牌</option><option value="rtk_band">RTK手环</option><option value="rtk_badge">RTK工牌</option><option value="wifi">Wi-Fi定位</option></select></div>
          <div><label className="block text-sm text-slate-400 mb-1">所属分公司</label><input type="text" value={editingItem?.company || ''} onChange={(e) => setEditingItem({ ...editingItem!, company: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm text-slate-400 mb-1">所属项目</label><select value={editingItem?.projectId || 1} onChange={(e) => setEditingItem({ ...editingItem!, projectId: parseInt(e.target.value), projectName: e.target.options[e.target.selectedIndex].text })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm"><option value={1}>西安地铁8号线</option><option value={2}>西安地铁10号线</option></select></div>
          <div><label className="block text-sm text-slate-400 mb-1">所属工队</label><input type="text" value={editingItem?.team || ''} onChange={(e) => setEditingItem({ ...editingItem!, team: e.target.value })} placeholder="如：土建工队/机电工队" className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm text-slate-400 mb-1">状态</label><select value={editingItem?.status || 'online'} onChange={(e) => setEditingItem({ ...editingItem!, status: e.target.value as any })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm"><option value="online">在线</option><option value="offline">离线</option><option value="fault">故障</option></select></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm text-slate-400 mb-1">持有人</label><input type="text" value={editingItem?.holder || ''} onChange={(e) => setEditingItem({ ...editingItem!, holder: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm text-slate-400 mb-1">持有人电话</label><input type="tel" value={editingItem?.holderPhone || ''} onChange={(e) => setEditingItem({ ...editingItem!, holderPhone: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <div><label className="block text-sm text-slate-400 mb-1">备注</label><textarea rows={2} value={editingItem?.remark || ''} onChange={(e) => setEditingItem({ ...editingItem!, remark: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
      </div>
      <div className="flex gap-3 mt-8">
        <button onClick={() => { if (!editingItem?.name || !editingItem?.deviceId) { alert('请填写设备名称和设备ID'); return; } if (editingItem.id) { setDevices(devices.map(d => d.id === editingItem.id ? editingItem : d)); } else { const newId = Math.max(...devices.map(d => d.id), 0) + 1; setDevices([...devices, { ...editingItem, id: newId } as LocationDevice]); } setShowModal(false); setEditingItem(null); }} className="flex-1 bg-cyan-500 hover:bg-cyan-400 py-2 rounded text-sm font-bold text-slate-900">保存</button>
        <button onClick={() => { setShowModal(false); setEditingItem(null); }} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded text-sm text-slate-100">取消</button>
      </div>
    </div>
  </div>
)}

{/* 批量导入弹窗 */}
{showUploadModal && (
  <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[800px] p-6 shadow-2xl max-h-[80vh] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-100">批量导入定位设备</h3>
        <button onClick={() => setShowUploadModal(false)}><X size={20} /></button>
      </div>
      <div className="border border-dashed border-cyan-400/50 rounded-lg p-6 text-center mb-4">
        <Upload size={32} className="mx-auto text-cyan-400 mb-2" />
        <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-500/20 file:text-cyan-300" />
      </div>
      {uploadPreview.length > 0 && (
        <>
          <p className="text-sm mb-2">共 {uploadPreview.length} 条，有效 {uploadPreview.filter(i => i.isValid).length} 条</p>
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900"><tr>{['设备名称', '设备ID', '类型', '状态'].map(h => <th key={h} className="text-left py-2">{h}</th>)}</tr></thead>
              <tbody>
                {uploadPreview.map((item, idx) => (
                  <tr key={idx} className={!item.isValid ? 'bg-red-500/10' : ''}>
                    <td className="py-1">{item.name || '—'}</td>
                    <td className="py-1">{item.deviceId || '—'}</td>
                    <td className="py-1">{getTypeText(item.type)}</td>
                    <td className="py-1">{item.isValid ? '✓ 有效' : <span className="text-red-400">{item.errorMsg}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={confirmImport} className="mt-4 bg-cyan-500 hover:bg-cyan-400 py-2 rounded text-sm font-bold text-slate-900">确认导入</button>
        </>
      )}
    </div>
  </div>
)}
    </div>
  );
}