// src/components/admin/ProjectManagement.tsx
import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, X, FolderTree, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Project {
  id: number;
  name: string;
  company: string;           // 所属分公司
  team: string;              // 所属工队
  manager: string;           // 项目经理
  managerPhone?: string;     // 经理电话
  contact?: string;          // 管理人员
  contactPhone?: string;     // 管理人员电话
  startDate: string;
  endDate?: string;
  status: 'ongoing' | 'completed' | 'suspended';
  address: string;
}

const SQL_PROJECTS: Project[] = [
  { id: 1, name: '西安东站项目', company: '第一分公司', team: '土建工队', manager: '李明', managerPhone: '13900002001', contact: '李明', contactPhone: '13900002001', startDate: '2026-04-05', status: 'ongoing', address: '西安市雁塔区' },
  { id: 2, name: '西安地铁8号线', company: '第一分公司', team: '土建工队', manager: '王磊', managerPhone: '13900002002', contact: '王磊', contactPhone: '13900002002', startDate: '2026-04-05', status: 'ongoing', address: '西安市未央区' },
  { id: 3, name: '咸阳机场T5航站楼', company: '第一分公司', team: '机电工队', manager: '张强', managerPhone: '13900002003', contact: '张强', contactPhone: '13900002003', startDate: '2026-04-05', status: 'ongoing', address: '咸阳市渭城区' },
  { id: 4, name: '北京地铁17号线', company: '第二分公司', team: '土建工队', manager: '刘洋', managerPhone: '13900002004', contact: '刘洋', contactPhone: '13900002004', startDate: '2026-04-05', status: 'ongoing', address: '北京市朝阳区' },
  { id: 5, name: '北京丰台站改造', company: '第二分公司', team: '装修工队', manager: '陈浩', managerPhone: '13900002005', contact: '陈浩', contactPhone: '13900002005', startDate: '2026-04-05', status: 'ongoing', address: '北京市丰台区' },
  { id: 6, name: '上海浦东机场联络线', company: '第三分公司', team: '土建工队', manager: '赵鹏', managerPhone: '13900002006', contact: '赵鹏', contactPhone: '13900002006', startDate: '2026-04-05', status: 'ongoing', address: '上海市浦东新区' },
  { id: 7, name: '上海轨道交通市域线', company: '第三分公司', team: '机电工队', manager: '周涛', managerPhone: '13900002007', contact: '周涛', contactPhone: '13900002007', startDate: '2026-04-05', status: 'suspended', address: '上海市闵行区' },
  { id: 8, name: '广州白云站', company: '第四分公司', team: '土建工队', manager: '吴刚', managerPhone: '13900002008', contact: '吴刚', contactPhone: '13900002008', startDate: '2026-04-05', status: 'ongoing', address: '广州市白云区' },
  { id: 9, name: '广湛高铁广州段', company: '第四分公司', team: '土建工队', manager: '郑伟', managerPhone: '13900002009', contact: '郑伟', contactPhone: '13900002009', startDate: '2026-04-05', status: 'ongoing', address: '广州市番禺区' },
  { id: 10, name: '成都地铁18号线', company: '第五分公司', team: '土建工队', manager: '孙鹏', managerPhone: '13900002010', contact: '孙鹏', contactPhone: '13900002010', startDate: '2026-04-05', status: 'ongoing', address: '成都市武侯区' },
  { id: 11, name: '天府站综合交通枢纽', company: '第五分公司', team: '土建工队', manager: '黄鑫', managerPhone: '13900002011', contact: '黄鑫', contactPhone: '13900002011', startDate: '2026-04-05', status: 'suspended', address: '成都市天府新区' },
  { id: 12, name: '武汉光谷综合体', company: '第六分公司', team: '装修工队', manager: '林峰', managerPhone: '13900002012', contact: '林峰', contactPhone: '13900002012', startDate: '2026-04-05', status: 'ongoing', address: '武汉市东湖高新区' },
  { id: 13, name: '武汉地铁12号线', company: '第六分公司', team: '土建工队', manager: '郭强', managerPhone: '13900002013', contact: '郭强', contactPhone: '13900002013', startDate: '2026-04-05', status: 'ongoing', address: '武汉市武昌区' },
  { id: 14, name: '沈阳地铁4号线', company: '第七分公司', team: '土建工队', manager: '唐勇', managerPhone: '13900002014', contact: '唐勇', contactPhone: '13900002014', startDate: '2026-04-05', status: 'ongoing', address: '沈阳市和平区' },
  { id: 15, name: '沈阳北站改造', company: '第七分公司', team: '土建工队', manager: '冯磊', managerPhone: '13900002015', contact: '冯磊', contactPhone: '13900002015', startDate: '2026-04-05', status: 'ongoing', address: '沈阳市沈河区' },
  { id: 16, name: '南京北站', company: '第八分公司', team: '土建工队', manager: '韩涛', managerPhone: '13900002016', contact: '韩涛', contactPhone: '13900002016', startDate: '2026-04-05', status: 'ongoing', address: '南京市浦口区' },
  { id: 17, name: '南京地铁11号线', company: '第八分公司', team: '土建工队', manager: '曹阳', managerPhone: '13900002017', contact: '曹阳', contactPhone: '13900002017', startDate: '2026-04-05', status: 'ongoing', address: '南京市江北新区' },
  { id: 18, name: '深圳前海枢纽', company: '第九分公司', team: '土建工队', manager: '彭博', managerPhone: '13900002018', contact: '彭博', contactPhone: '13900002018', startDate: '2026-04-05', status: 'ongoing', address: '深圳市前海新区' },
  { id: 19, name: '深圳地铁13号线', company: '第九分公司', team: '土建工队', manager: '曾伟', managerPhone: '13900002019', contact: '曾伟', contactPhone: '13900002019', startDate: '2026-04-05', status: 'ongoing', address: '深圳市南山区' },
  { id: 20, name: '重庆东站', company: '第十分公司', team: '土建工队', manager: '肖勇', managerPhone: '13900002020', contact: '肖勇', contactPhone: '13900002020', startDate: '2026-04-05', status: 'ongoing', address: '重庆市南岸区' },
  { id: 21, name: '重庆轨道交通27号线', company: '第十分公司', team: '土建工队', manager: '董强', managerPhone: '13900002021', contact: '董强', contactPhone: '13900002021', startDate: '2026-04-05', status: 'ongoing', address: '重庆市沙坪坝区' },
];

// ✅ 内网穿透智能适配！
const detectBackendUrl = (): string => {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  if (window.location.port === '3000') return '';
  return `${window.location.protocol}//${window.location.host}`;
};
const API_BASE = detectBackendUrl();

export default function ProjectManagement() {
const [projects, setProjects] = useState<Project[]>(SQL_PROJECTS);
const [loading, setLoading] = useState(false);

const fetchProjects = async () => {
  try {
    setLoading(true);
    const res = await fetch(`${API_BASE}/projects/`);
    if (res.ok) {
      const data = await res.json();
      const apiData = Array.isArray(data) ? data : data.value || data.data || [];
      if (apiData.length > 1) {
        const mappedProjects: Project[] = apiData.map((p: any) => ({
          id: p.id,
          name: p.project_name || p.name || '',
          company: '默认分公司',
          team: '土建工队',
          manager: p.manager_name || p.manager || '',
          managerPhone: '',
          contact: p.manager_name || '',
          contactPhone: '',
          startDate: p.created_at?.split('T')[0] || p.start_date || '2024-01-01',
          status: p.status === 'active' ? 'ongoing' : p.status === 'completed' ? 'completed' : 'suspended',
          address: p.address || '',
        }));
        setProjects(mappedProjects);
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  fetchProjects();
}, []);
const [showUploadModal, setShowUploadModal] = useState(false);
const [uploadPreview, setUploadPreview] = useState<any[]>([]);
const [filterCompany, setFilterCompany] = useState<string>('all');
const [filterTeam, setFilterTeam] = useState<string>('all');
const [filterStatus, setFilterStatus] = useState<string>('all');

const companies = ['all', ...new Set(projects.map(p => p.company))];
const teams = ['all', ...new Set(projects.map(p => p.team))];
const statuses = ['all', 'ongoing', 'completed', 'suspended'];
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Project | null>(null);

const filteredData = projects.filter(p => {
  const matchesSearch = searchTerm === '' || 
    p.name.includes(searchTerm) || 
    p.company.includes(searchTerm) ||
    p.team.includes(searchTerm) ||
    p.manager.includes(searchTerm) ||
    p.contact?.includes(searchTerm);
  const matchesCompany = filterCompany === 'all' || p.company === filterCompany;
  const matchesTeam = filterTeam === 'all' || p.team === filterTeam;
  const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
  return matchesSearch && matchesCompany && matchesTeam && matchesStatus;
});

  const getStatusStyle = (status: string) => {
    if (status === 'ongoing') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (status === 'completed') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  };

  const getStatusText = (status: string) => {
    const map = { ongoing: '进行中', completed: '已完成', suspended: '暂停' };
    return map[status as keyof typeof map] || status;
  };

  // 下载模板
const downloadTemplate = () => {
  const template = [
    ['项目名称', '所属分公司', '项目经理', '经理电话', '管理人员', '管理人员电话', '开工日期', '地址', '状态'],
    ['西安地铁8号线', '第一分公司', '张经理', '13900139001', '李主管', '13900139002', '2024-01-01', '西安市雁塔区', '进行中'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '项目模板');
  XLSX.writeFile(wb, '项目导入模板.xlsx');
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
    
    const statusMap: Record<string, any> = { '进行中': 'ongoing', '已完成': 'completed', '暂停': 'suspended' };
    
    const parsedData = dataRows.map((row: any) => ({
      name: row[0]?.toString().trim() || '',
      company: row[1]?.toString().trim() || '',
      manager: row[2]?.toString().trim() || '',
      managerPhone: row[3]?.toString().trim() || '',
      contact: row[4]?.toString().trim() || '',
      contactPhone: row[5]?.toString().trim() || '',
      startDate: row[6]?.toString().trim() || '',
      address: row[7]?.toString().trim() || '',
      status: statusMap[row[8]?.toString().trim()] || 'ongoing',
      isValid: !!row[0],
      errorMsg: !row[0] ? '项目名称不能为空' : ''
    }));
    setUploadPreview(parsedData);
  };
  reader.readAsArrayBuffer(file);
};

// 确认导入
const confirmImport = () => {
  const validData = uploadPreview.filter(item => item.isValid);
  const newProjects = validData.map((item: any, idx: number) => ({
    id: Math.max(...projects.map(p => p.id), 0) + idx + 1,
    ...item,
  }));
  setProjects([...projects, ...newProjects]);
  setShowUploadModal(false);
  setUploadPreview([]);
  alert(`成功导入 ${validData.length} 条`);
};
  return (
    <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-4 h-full overflow-auto">
<div className="flex items-center gap-3 mb-4 flex-wrap">
  <div className="relative flex-1 min-w-[180px]">
    <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
    <input type="text" placeholder="搜索项目、分公司、经理..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm" />
  </div>
  
  <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm">
    {companies.map(c => <option key={c} value={c}>{c === 'all' ? '全部公司' : c}</option>)}
  </select>
  
  <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)} className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm">
    {teams.map(t => <option key={t} value={t}>{t === 'all' ? '全部工队' : t}</option>)}
  </select>
  
  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm">
    {statuses.map(s => <option key={s} value={s}>{s === 'all' ? '全部状态' : getStatusText(s)}</option>)}
  </select>
  
  <button onClick={() => { setFilterCompany('all'); setFilterStatus('all'); setSearchTerm(''); }} className="text-xs text-cyan-400">重置</button>
  
  <button onClick={() => setShowUploadModal(true)} className="px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg flex items-center gap-1 text-sm"><Upload size={14} />批量导入</button>
  <button onClick={downloadTemplate} className="px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg flex items-center gap-1 text-sm"><Download size={14} />下载模板</button>
  <button onClick={() => { setEditingItem(null); setShowModal(true); }} className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg flex items-center gap-1 text-sm"><Plus size={14} />添加项目</button>
</div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-blue-400/20 bg-slate-800/50">
            <tr>
<th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">项目名称</th>
<th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">分公司</th>
<th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">工队</th>
<th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">项目经理</th>
<th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">管理人员</th>
<th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">开工日期</th>
<th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">地址</th>
<th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">状态</th>
<th className="px-4 py-3 text-right text-xs font-semibold text-slate-300">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
{filteredData.map(project => (
  <tr key={project.id} className="hover:bg-slate-800/30 transition-colors">
    <td className="px-4 py-3 text-slate-300">{project.name}</td>
    <td className="px-4 py-3 text-slate-300">{project.company}</td>
    <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">{project.team}</span></td>
    <td className="px-4 py-3"><div>{project.manager}</div>{project.managerPhone && <div className="text-xs text-slate-500">{project.managerPhone}</div>}</td>
    <td className="px-4 py-3"><div>{project.contact || '-'}</div>{project.contactPhone && <div className="text-xs text-slate-500">{project.contactPhone}</div>}</td>
    <td className="px-4 py-3 text-slate-300">{project.startDate}</td>
    <td className="px-4 py-3 text-slate-300">{project.address}</td>
    <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(project.status)}`}>{getStatusText(project.status)}</span></td>
    <td className="px-4 py-3 text-right">...</td>
  </tr>
))}
          </tbody>
        </table>
      </div>

{showModal && (
  <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[600px] p-6 shadow-2xl max-h-[90vh] overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-slate-100">{editingItem ? '编辑项目' : '添加项目'}</h3>
        <button onClick={() => setShowModal(false)}><X size={20} /></button>
      </div>
      <div className="space-y-4">
        <div><label className="block text-sm text-slate-400 mb-1">项目名称 *</label><input type="text" value={editingItem?.name || ''} onChange={(e) => setEditingItem({ ...editingItem!, name: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm text-slate-400 mb-1">所属分公司</label><input type="text" value={editingItem?.company || ''} onChange={(e) => setEditingItem({ ...editingItem!, company: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm text-slate-400 mb-1">所属工队</label><input type="text" value={editingItem?.team || ''} onChange={(e) => setEditingItem({ ...editingItem!, team: e.target.value })} placeholder="如：土建工队、机电工队" className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm text-slate-400 mb-1">状态</label><select value={editingItem?.status || 'ongoing'} onChange={(e) => setEditingItem({ ...editingItem!, status: e.target.value as any })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm"><option value="ongoing">进行中</option><option value="completed">已完成</option><option value="suspended">暂停</option></select></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm text-slate-400 mb-1">项目经理</label><input type="text" value={editingItem?.manager || ''} onChange={(e) => setEditingItem({ ...editingItem!, manager: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm text-slate-400 mb-1">经理电话</label><input type="tel" value={editingItem?.managerPhone || ''} onChange={(e) => setEditingItem({ ...editingItem!, managerPhone: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm text-slate-400 mb-1">管理人员</label><input type="text" value={editingItem?.contact || ''} onChange={(e) => setEditingItem({ ...editingItem!, contact: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm text-slate-400 mb-1">管理人员电话</label><input type="tel" value={editingItem?.contactPhone || ''} onChange={(e) => setEditingItem({ ...editingItem!, contactPhone: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm text-slate-400 mb-1">开工日期</label><input type="date" value={editingItem?.startDate || ''} onChange={(e) => setEditingItem({ ...editingItem!, startDate: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm text-slate-400 mb-1">地址</label><input type="text" value={editingItem?.address || ''} onChange={(e) => setEditingItem({ ...editingItem!, address: e.target.value })} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm" /></div>
        </div>
      </div>
      <div className="flex gap-3 mt-8">
        <button onClick={() => { if (!editingItem?.name) { alert('请填写项目名称'); return; } if (editingItem.id) { setProjects(projects.map(p => p.id === editingItem.id ? editingItem : p)); } else { const newId = Math.max(...projects.map(p => p.id), 0) + 1; setProjects([...projects, { ...editingItem, id: newId } as Project]); } setShowModal(false); setEditingItem(null); }} className="flex-1 bg-cyan-500 hover:bg-cyan-400 py-2 rounded text-sm font-bold text-slate-900">保存</button>
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
        <h3 className="text-lg font-bold text-slate-100">批量导入项目</h3>
        <button onClick={() => setShowUploadModal(false)}><X size={20} /></button>
      </div>
      <div className="border border-dashed border-cyan-400/50 rounded-lg p-6 text-center mb-4">
        <Upload size={32} className="mx-auto text-cyan-400 mb-2" />
        <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} />
      </div>
      {uploadPreview.length > 0 && (
        <>
          <p className="text-sm mb-2">共 {uploadPreview.length} 条，有效 {uploadPreview.filter(i => i.isValid).length} 条</p>
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead>...</thead>
              <tbody>
                {uploadPreview.map((item, idx) => (
                  <tr key={idx} className={!item.isValid ? 'bg-red-500/10' : ''}>
                    <td className="py-1">{item.name || '—'}</td>
                    <td className="py-1">{item.company || '—'}</td>
                    <td className="py-1">{item.isValid ? '✓ 有效' : <span className="text-red-400">{item.errorMsg}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={confirmImport} className="mt-4 bg-cyan-500 py-2 rounded">确认导入</button>
        </>
      )}
    </div>
  </div>
)}
    </div>
  );
}