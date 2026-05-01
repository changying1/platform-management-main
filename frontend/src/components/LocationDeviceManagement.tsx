// src/components/admin/LocationDeviceManagement.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Edit2, Trash2, X, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { deviceApi, type LocationDevice } from '../api/deviceApi';

type DeviceStatus = 'online' | 'offline' | 'fault';

const emptyDevice: LocationDevice = {
  device_id: '',
  name: '',
  lat: 0,
  lng: 0,
  type: 'uwb_band',
  company: '',
  project: '西安地铁8号线',
  team: '',
  holder: '',
  holderPhone: '',
  status: 'offline',
  remark: '',
};

const projectOptions = ['西安地铁8号线', '西安地铁10号线'];

export default function LocationDeviceManagement() {
  const [devices, setDevices] = useState<LocationDevice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [formData, setFormData] = useState<LocationDevice>(emptyDevice);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<Array<LocationDevice & { isValid: boolean; errorMsg: string }>>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  const loadDevices = async () => {
    setLoading(true);
    try {
      const data = await deviceApi.getLocationDevices();
      setDevices(data);
    } catch (error) {
      console.error('加载定位装置失败', error);
      alert('加载定位装置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const types = useMemo(() => ['all', ...new Set(devices.map(d => d.type || '').filter(Boolean))], [devices]);
  const statuses = ['all', 'online', 'offline', 'fault'];
  const companies = useMemo(() => ['all', ...new Set(devices.map(d => d.company).filter(Boolean))], [devices]);
  const teams = useMemo(() => ['all', ...new Set(devices.map(d => d.team).filter(Boolean))], [devices]);

  const filteredData = devices.filter(d => {
    const matchesSearch = searchTerm === '' ||
      d.name.includes(searchTerm) ||
      d.device_id.includes(searchTerm) ||
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
      wifi: 'Wi-Fi定位',
    };
    return map[type] || type;
  };

  const getStatusStyle = (status: string) => {
    const styles: Record<string, string> = {
      online: 'bg-green-500/20 text-green-400 border-green-500/30',
      offline: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      fault: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return styles[status] || styles.offline;
  };

  const getStatusText = (status: string) => {
    const map = { online: '在线', offline: '离线', fault: '故障' };
    return map[status as keyof typeof map] || status;
  };

  const updateForm = (patch: Partial<LocationDevice>) => {
    setFormData(prev => ({ ...prev, ...patch }));
  };

  const openCreateModal = () => {
    setEditingDeviceId(null);
    setFormData(emptyDevice);
    setShowModal(true);
  };

  const openEditModal = (device: LocationDevice) => {
    setEditingDeviceId(device.device_id);
    setFormData({ ...emptyDevice, ...device });
    setShowModal(true);
  };

  const saveDevice = async () => {
    if (!formData.name.trim() || !formData.device_id.trim()) {
      alert('请填写设备名称和设备ID');
      return;
    }

    const payload: LocationDevice = {
      ...formData,
      lat: formData.lat ?? 0,
      lng: formData.lng ?? 0,
      company: formData.company || '',
      project: formData.project || '',
      holder: formData.holder || '',
      holderPhone: formData.holderPhone || '',
      team: formData.team || '',
      remark: formData.remark || '',
      status: formData.status || 'offline',
    };

    try {
      if (editingDeviceId) {
        const updated = await deviceApi.updateLocationDevice(editingDeviceId, payload);
        setDevices(prev => prev.map(item => item.device_id === editingDeviceId ? updated : item));
      } else {
        const created = await deviceApi.addLocationDevice(payload);
        setDevices(prev => [...prev, created]);
      }
      setShowModal(false);
      setEditingDeviceId(null);
      setFormData(emptyDevice);
    } catch (error) {
      console.error('保存定位装置失败', error);
      alert('保存定位装置失败，请检查设备ID是否重复或后端服务是否正常');
    }
  };

  const deleteDevice = async (deviceId: string) => {
    if (!confirm('确定删除吗？')) return;
    try {
      await deviceApi.deleteLocationDevice(deviceId);
      setDevices(prev => prev.filter(d => d.device_id !== deviceId));
    } catch (error) {
      console.error('删除定位装置失败', error);
      alert('删除定位装置失败');
    }
  };

  const downloadTemplate = () => {
    const template = [
      ['设备名称', '设备ID', '类型', '分公司', '项目', '工队', '持有人', '持有人电话', '备注'],
      ['UWB手环-001', 'UWB001', 'UWB手环', '第一分公司', '西安地铁8号线', '土建工队', '张三', '13800138001', ''],
      ['RTK工牌-001', 'RTK001', 'RTK工牌', '第二分公司', '西安地铁10号线', '机电工队', '李四', '13800138002', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '定位设备模板');
    XLSX.writeFile(wb, '定位设备导入模板.xlsx');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[];
      const dataRows = rows.slice(1).filter((row: any) => row[0]);

      const typeMap: Record<string, string> = {
        UWB手环: 'uwb_band',
        UWB工牌: 'uwb_badge',
        RTK手环: 'rtk_band',
        RTK工牌: 'rtk_badge',
        'Wi-Fi定位': 'wifi',
      };

      const parsedData = dataRows.map((row: any) => {
        const name = row[0]?.toString().trim() || '';
        const device_id = row[1]?.toString().trim() || '';
        const typeText = row[2]?.toString().trim() || '';
        return {
          ...emptyDevice,
          name,
          device_id,
          type: typeMap[typeText] || 'uwb_band',
          company: row[3]?.toString().trim() || '',
          project: row[4]?.toString().trim() || '西安地铁8号线',
          team: row[5]?.toString().trim() || '',
          holder: row[6]?.toString().trim() || '',
          holderPhone: row[7]?.toString().trim() || '',
          remark: row[8]?.toString().trim() || '',
          status: 'offline',
          isValid: !!(name && device_id),
          errorMsg: !name ? '设备名称不能为空' : !device_id ? '设备ID不能为空' : '',
        };
      });
      setUploadPreview(parsedData);
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmImport = async () => {
    const validData = uploadPreview.filter(item => item.isValid);
    try {
      await Promise.all(validData.map(({ isValid, errorMsg, ...item }) => deviceApi.addLocationDevice(item)));
      setShowUploadModal(false);
      setUploadPreview([]);
      await loadDevices();
      alert(`成功导入 ${validData.length} 条`);
    } catch (error) {
      console.error('导入定位装置失败', error);
      alert('导入失败，请检查设备ID是否重复或后端服务是否正常');
    }
  };

  return (
    <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-4 h-full overflow-auto">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
          <input type="text" placeholder="搜索名称、设备ID、持有人..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400" />
        </div>

        <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400">
          {companies.map(c => <option key={c} value={c}>{c === 'all' ? '全部公司' : c}</option>)}
        </select>

        <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)} className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400">
          {teams.map(t => <option key={t} value={t}>{t === 'all' ? '全部工队' : t}</option>)}
        </select>

        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400">
          {types.map(t => <option key={t} value={t}>{t === 'all' ? '全部类型' : getTypeText(t)}</option>)}
        </select>

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400">
          {statuses.map(s => <option key={s} value={s}>{s === 'all' ? '全部状态' : getStatusText(s)}</option>)}
        </select>

        <button onClick={() => { setFilterCompany('all'); setFilterTeam('all'); setFilterType('all'); setFilterStatus('all'); setSearchTerm(''); }} className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1.5">
          重置
        </button>

        <button onClick={() => setShowUploadModal(true)} className="px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-1 text-sm">
          <Upload size={14} /> 批量导入
        </button>

        <button onClick={downloadTemplate} className="px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-1 text-sm">
          <Download size={14} /> 下载模板
        </button>

        <button onClick={openCreateModal} className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-1 text-sm">
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
            {loading && <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-400">加载中...</td></tr>}
            {!loading && filteredData.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-400">暂无数据</td></tr>}
            {filteredData.map(device => (
              <tr key={device.device_id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 text-slate-300">{device.name}</td>
                <td className="px-4 py-3 text-slate-300 font-mono text-xs">{device.device_id}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">{getTypeText(device.type || '')}</span></td>
                <td className="px-4 py-3 text-slate-300">{device.company || '-'}</td>
                <td className="px-4 py-3 text-slate-300">{device.project || '-'}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">{device.team || '-'}</span></td>
                <td className="px-4 py-3"><div className="text-sm text-slate-300">{device.holder || '-'}</div>{device.holderPhone && <div className="text-xs text-slate-500">{device.holderPhone}</div>}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(device.status)}`}>{getStatusText(device.status)}</span></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEditModal(device)} className="p-1 hover:bg-cyan-500/20 rounded text-cyan-400"><Edit2 size={16} /></button>
                    <button onClick={() => deleteDevice(device.device_id)} className="p-1 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={16} /></button>
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
              <h3 className="text-lg font-bold text-slate-100">{editingDeviceId ? '编辑定位装置' : '添加定位装置'}</h3>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm text-slate-400 mb-1">设备名称 *</label><input type="text" value={formData.name} onChange={(e) => updateForm({ name: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm text-slate-400 mb-1">设备ID *</label><input type="text" disabled={!!editingDeviceId} value={formData.device_id} onChange={(e) => updateForm({ device_id: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono disabled:opacity-60" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm text-slate-400 mb-1">设备类型</label><select value={formData.type || 'uwb_band'} onChange={(e) => updateForm({ type: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm"><option value="uwb_band">UWB手环</option><option value="uwb_badge">UWB工牌</option><option value="rtk_band">RTK手环</option><option value="rtk_badge">RTK工牌</option><option value="wifi">Wi-Fi定位</option></select></div>
                <div><label className="block text-sm text-slate-400 mb-1">所属分公司</label><input type="text" value={formData.company} onChange={(e) => updateForm({ company: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm text-slate-400 mb-1">所属项目</label><select value={formData.project} onChange={(e) => updateForm({ project: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm">{projectOptions.map(project => <option key={project} value={project}>{project}</option>)}</select></div>
                <div><label className="block text-sm text-slate-400 mb-1">所属工队</label><input type="text" value={formData.team || ''} onChange={(e) => updateForm({ team: e.target.value })} placeholder="如：土建工队/机电工队" className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm text-slate-400 mb-1">状态</label><select value={formData.status} onChange={(e) => updateForm({ status: e.target.value as DeviceStatus })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm"><option value="online">在线</option><option value="offline">离线</option><option value="fault">故障</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm text-slate-400 mb-1">持有人</label><input type="text" value={formData.holder} onChange={(e) => updateForm({ holder: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm text-slate-400 mb-1">持有人电话</label><input type="tel" value={formData.holderPhone || ''} onChange={(e) => updateForm({ holderPhone: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-sm text-slate-400 mb-1">备注</label><textarea rows={2} value={formData.remark || ''} onChange={(e) => updateForm({ remark: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={saveDevice} className="flex-1 bg-cyan-500 hover:bg-cyan-400 py-2 rounded text-sm font-bold text-slate-900">保存</button>
              <button onClick={() => { setShowModal(false); setEditingDeviceId(null); }} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded text-sm text-slate-100">取消</button>
            </div>
          </div>
        </div>
      )}

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
                          <td className="py-1">{item.device_id || '—'}</td>
                          <td className="py-1">{getTypeText(item.type || '')}</td>
                          <td className="py-1">{item.isValid ? '有效' : <span className="text-red-400">{item.errorMsg}</span>}</td>
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
