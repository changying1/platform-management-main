import React, { useState } from 'react';
import { Search, Plus, Edit2, Trash2, X, Save, Loader, Users, Camera, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Person {
  avatar?: string;
  id: number;
  name: string;
  employeeId: string;
  idCard?: string;           // 身份证号
  workType?: string;         // 工种
  workTeam?: string;         // 工队
  team?: string;             // 班组
  phone: string;
  entryDate?: string;        // 进场日期
  status: 'active' | 'inactive';
  emergencyContact?: string; // 紧急联系人
  company?: string;          // 所属分公司
  project?: string;          // 所属项目
}

// 详情信息展示组件
const InfoItem = ({ label, value }: { label: string; value?: string }) => (
  <div>
    <p className="text-xs text-slate-400 mb-1">{label}</p>
    <p className="text-sm text-slate-200">{value || '—'}</p>
  </div>
);

export default function PersonManagement() {
  const [showDetailModal, setShowDetailModal] = useState(false);  // 详情弹窗显示
const [viewingPerson, setViewingPerson] = useState<Person | null>(null);  // 查看的人员
const [persons, setPersons] = useState<Person[]>([
  { 
    id: 1, 
    name: '张三', 
    employeeId: '10001', 
    idCard: '41010119900307653X',
    workType: '木工', 
    workTeam: '土建工队',
    team: '木工一班', 
    phone: '13800138001', 
    entryDate: '2024-03-15',
    status: 'active',
    emergencyContact: '李桂花 13800138099',
    company: '第一分公司',
    project: '地铁1号线工程',
    avatar: '/avatars/zhangsan.png'
  },
  { 
    id: 2, 
    name: '李四', 
    employeeId: '10002', 
    idCard: '410101198512154321',
    workType: '钢筋工', 
    workTeam: '土建工队',
    team: '钢筋一班', 
    phone: '13800138002', 
    entryDate: '2024-03-20',
    status: 'active',
    emergencyContact: '王秀英 13800138088',
    company: '第二分公司',
    project: '商业综合体项目',
    avatar: '/avatars/lisi.jpeg'
  },
  { 
    id: 3, 
    name: '王五', 
    employeeId: '10003', 
    idCard: '410101199512206789',
    workType: '电工', 
    workTeam: '机电工队',
    team: '电工班', 
    phone: '13800138003', 
    entryDate: '2024-04-01',
    status: 'inactive',
    emergencyContact: '赵丽华 13800138077',
    company: '第一分公司',
    project: '地铁1号线工程',
    avatar: '/avatars/wangwu.jpg'
  },
  { 
    id: 4, 
    name: '赵六', 
    employeeId: '10004', 
    idCard: '410101199208153456',
    workType: '水暖工', 
    workTeam: '机电工队',
    team: '水暖班', 
    phone: '13800138004', 
    entryDate: '2024-04-10',
    status: 'active',
    emergencyContact: '孙大姐 13800138066',
    company: '第二分公司',
    project: '商业综合体项目',
    avatar: '/avatars/zhaoliu.jpg'
  },
]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState<string>('all');
const [filterProject, setFilterProject] = useState<string>('all');
const [filterWorkTeam, setFilterWorkTeam] = useState<string>('all');
const [filterWorkType, setFilterWorkType] = useState<string>('all');
const [filterTeam, setFilterTeam] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Person | null>(null);
  const [loading, setLoading] = useState(false);
const [showUploadModal, setShowUploadModal] = useState(false);
const [uploadData, setUploadData] = useState<any[]>([]);
const [uploadPreview, setUploadPreview] = useState<any[]>([]);



// 获取所有唯一的分公司
const companies = ['all', ...new Set(persons.map(p => p.company).filter(Boolean))];
// 获取所有唯一的项目
const projects = ['all', ...new Set(persons.map(p => p.project).filter(Boolean))];
// 获取所有唯一的工队
const workTeams = ['all', ...new Set(persons.map(p => p.workTeam).filter(Boolean))];
// 获取所有唯一的工种
const workTypes = ['all', ...new Set(persons.map(p => p.workType).filter(Boolean))];
// 获取所有唯一的班组
const teams = ['all', ...new Set(persons.map(p => p.team).filter(Boolean))];

// 筛选数据
const filteredData = persons.filter(p => {
  // 模糊搜索（姓名、工号、身份证号、电话）
  const matchesSearch = searchTerm === '' || 
    p.name.includes(searchTerm) || 
    p.employeeId.includes(searchTerm) ||
    p.workTeam?.includes(searchTerm) ||
    p.idCard?.includes(searchTerm) ||
    p.phone.includes(searchTerm);
  
  // 分类筛选
  const matchesCompany = filterCompany === 'all' || p.company === filterCompany;
  const matchesProject = filterProject === 'all' || p.project === filterProject;
  const matchesWorkTeam = filterWorkTeam === 'all' || p.workTeam === filterWorkTeam;
  const matchesWorkType = filterWorkType === 'all' || p.workType === filterWorkType;
  const matchesTeam = filterTeam === 'all' || p.team === filterTeam;
  
  return matchesSearch && matchesCompany && matchesProject && matchesWorkTeam && matchesWorkType && matchesTeam;
});

// 下载Excel模板
const downloadTemplate = () => {
  const template = [
    ['姓名', '工号', '身份证号', '分公司', '项目', '工种', '班组', '电话', '进场日期', '紧急联系人'],
    ['张三', '10001', '41010119900307653X', '第一分公司', '地铁1号线工程', '木工', '木工一班', '13800138001', '2024-03-15', '李桂花 13800138099'],
    ['李四', '10002', '410101198512154321', '第二分公司', '商业综合体项目', '钢筋工', '钢筋一班', '13800138002', '2024-03-20', '王秀英 13800138088'],
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '工人信息模板');
  XLSX.writeFile(wb, '工人信息导入模板.xlsx');
};
// 解析Excel文件
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target?.result as ArrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
    
    // 跳过表头，从第2行开始
    const dataRows = rows.slice(1).filter((row: any) => row[0] && row[0].toString().trim());
    
const parsedData = dataRows.map((row: any, index: number) => ({
  tempId: index,
  name: row[0]?.toString().trim() || '',
  employeeId: row[1]?.toString().trim() || '',
  idCard: row[2]?.toString().trim() || '',
  company: row[3]?.toString().trim() || '',
  project: row[4]?.toString().trim() || '',
  workType: row[5]?.toString().trim() || '',
  team: row[6]?.toString().trim() || '',
  phone: row[7]?.toString().trim() || '',
  entryDate: row[8]?.toString().trim() || '',
  emergencyContact: row[9]?.toString().trim() || '',
  status: 'active' as const,
  isValid: true,
  errorMsg: ''
}));
    
    // 验证数据
    const validatedData = parsedData.map((item: any) => {
      const errors = [];
      if (!item.name) errors.push('姓名不能为空');
      if (!item.employeeId) errors.push('工号不能为空');
      if (item.phone && !/^1[3-9]\d{9}$/.test(item.phone)) errors.push('手机号格式不正确');
      
      return {
        ...item,
        isValid: errors.length === 0,
        errorMsg: errors.join('、')
      };
    });
    
    setUploadPreview(validatedData);
    setUploadData(validatedData);
  };
  reader.readAsArrayBuffer(file);
};

// 确认导入
const confirmImport = () => {
  const validData = uploadPreview.filter(item => item.isValid);
  const newPersons = validData.map((item: any, index: number) => ({
    id: Math.max(...persons.map(p => p.id), 0) + index + 1,
    name: item.name,
    employeeId: item.employeeId,
    idCard: item.idCard,
    workType: item.workType,
    team: item.team,
    phone: item.phone,
    entryDate: item.entryDate,
    status: item.status,
    emergencyContact: item.emergencyContact,
    avatar: '',
  }));
  
  setPersons([...persons, ...newPersons]);
  setShowUploadModal(false);
  setUploadPreview([]);
  setUploadData([]);
  alert(`成功导入 ${validData.length} 条数据，失败 ${uploadPreview.length - validData.length} 条`);
};

  return (
    <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-4 h-full overflow-auto">
    
{/* 操作栏 */}
<div className="flex items-center gap-3 mb-4 flex-wrap">
  {/* 搜索框 */}
  <div className="relative flex-1 min-w-[180px]">
    <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
    <input
      type="text"
      placeholder="搜索姓名、工号、电话..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
    />
  </div>
  
  {/* 筛选下拉框 */}
  <select
    value={filterCompany}
    onChange={(e) => setFilterCompany(e.target.value)}
    className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400"
  >
    {companies.map(company => (
      <option key={company} value={company}>
        {company === 'all' ? '全部公司' : company}
      </option>
    ))}
  </select>
  
  <select
    value={filterProject}
    onChange={(e) => setFilterProject(e.target.value)}
    className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400"
  >
    {projects.map(project => (
      <option key={project} value={project}>
        {project === 'all' ? '全部项目' : project}
      </option>
    ))}
  </select>
  
  <select
    value={filterWorkTeam}
    onChange={(e) => setFilterWorkTeam(e.target.value)}
    className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400"
  >
    {workTeams.map(workTeam => (
      <option key={workTeam} value={workTeam}>
        {workTeam === 'all' ? '全部工队' : workTeam}
      </option>
    ))}
  </select>
  
  <select
    value={filterWorkType}
    onChange={(e) => setFilterWorkType(e.target.value)}
    className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400"
  >
    {workTypes.map(workType => (
      <option key={workType} value={workType}>
        {workType === 'all' ? '全部工种' : workType}
      </option>
    ))}
  </select>
  
  <select
    value={filterTeam}
    onChange={(e) => setFilterTeam(e.target.value)}
    className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400"
  >
    {teams.map(team => (
      <option key={team} value={team}>
        {team === 'all' ? '全部班组' : team}
      </option>
    ))}
  </select>
  
  {/* 重置按钮 */}
  <button
    onClick={() => {
      setFilterCompany('all');
      setFilterProject('all');
      setFilterWorkTeam('all');
      setFilterWorkType('all');
      setFilterTeam('all');
      setSearchTerm('');
    }}
    className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1.5"
  >
    重置
  </button>
  
  {/* 按钮组 */}
  <div className="flex gap-2">
    <button
      onClick={() => setShowUploadModal(true)}
      className="px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-1 text-sm"
    >
      <Upload size={14} />
      批量导入
    </button>
    <button
      onClick={downloadTemplate}
      className="px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-1 text-sm"
    >
      <Download size={14} />
      下载模板
    </button>
    <button
      onClick={() => {
        setEditingItem({
          id: 0,
          name: '',
          employeeId: '',
          idCard: '',
          company: '',
          project: '',
          workType: '',
          team: '',
          phone: '',
          entryDate: '',
          status: 'active',
          emergencyContact: '',
          avatar: '',
        });
        setShowModal(true);
      }}
      className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-1 text-sm"
    >
      <Plus size={14} />
      添加人员
    </button>
  </div>
</div>

{/* 筛选结果统计 */}
<div className="flex justify-between items-center mb-3">
  <p className="text-sm text-slate-400">
    共 <span className="text-cyan-400 font-bold">{filteredData.length}</span> 条记录
    {(filterCompany !== 'all' || filterProject !== 'all' || filterWorkTeam !== 'all' || filterWorkType !== 'all' || filterTeam !== 'all' || searchTerm) && (
      <span className="ml-2 text-xs">(已筛选)</span>
    )}
  </p>
</div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full">
<thead className="border-b border-blue-400/20 bg-slate-800/50">
  <tr>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">照片</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">姓名</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">工号</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">分公司</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">项目</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">工队</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">工种</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">班组</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">进场日期</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">电话</th>
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">状态</th>
    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300">操作</th>
  </tr>
</thead>
          <tbody className="divide-y divide-slate-700">
  {filteredData.map(person => (
    <tr key={person.id} className="hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3">
        <img 
          src={person.avatar || '/default-avatar.png'} 
          className="w-8 h-8 rounded-full object-cover cursor-pointer hover:ring-2 ring-cyan-400"
          onClick={() => {
            setViewingPerson(person);
            setShowDetailModal(true);
          }}
          alt={person.name}
        />
      </td>
      <td className="px-4 py-3 text-slate-300">{person.name}</td>
      <td className="px-4 py-3 text-slate-300">{person.employeeId}</td>
      <td className="px-4 py-3 text-slate-300">{person.company || '—'}</td>
      <td className="px-4 py-3 text-slate-300">{person.project || '—'}</td>
      <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">{person.workTeam || '—'}</span></td>
      <td className="px-4 py-3 text-slate-300">{person.workType || '—'}</td>
      <td className="px-4 py-3 text-slate-300">{person.team || '—'}</td>
      <td className="px-4 py-3 text-slate-300">{person.entryDate || '—'}</td>
      <td className="px-4 py-3 text-slate-300">{person.phone}</td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 text-xs rounded-full border ${
          person.status === 'active' 
            ? 'bg-green-500/20 text-green-400 border-green-500/30' 
            : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
        }`}>
          {person.status === 'active' ? '在场' : '退场'}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button 
            onClick={() => {
              setEditingItem(person);
              setShowModal(true);
            }}
            className="p-1 hover:bg-cyan-500/20 rounded text-cyan-400"
          >
            <Edit2 size={16} />
          </button>
          <button 
            onClick={() => {
              if (confirm('确定删除该人员吗？')) {
                setPersons(persons.filter(p => p.id !== person.id));
              }
            }}
            className="p-1 hover:bg-red-500/20 rounded text-red-400"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  ))}
</tbody>
        </table>
      </div>

{/* 添加/编辑弹窗 */}
{showModal && (
  <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[700px] p-6 shadow-2xl max-h-[90vh] overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-slate-100">
          {editingItem?.id ? '编辑工人信息' : '添加人员'}
        </h3>
        <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-200">
          <X size={20} />
        </button>
      </div>
      
      <div className="space-y-6">
        {/* 头像上传区域 */}
        <div className="flex justify-center">
          <div className="relative">
            <img 
              src={editingItem?.avatar || '/default-avatar.png'} 
              className="w-20 h-20 rounded-full object-cover border-2 border-cyan-400/50"
              alt="头像"
            />
            <label className="absolute bottom-0 right-0 p-1.5 bg-cyan-500 rounded-full hover:bg-cyan-400 cursor-pointer">
              <Camera size={12} className="text-white" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const imageUrl = URL.createObjectURL(file);
                    setEditingItem({ ...editingItem!, avatar: imageUrl });
                  }
                }}
              />
            </label>
          </div>
        </div>

        {/* 基本信息 - 每行3列 */}
{/* 基本信息 - 每行3列 */}
<div className="grid grid-cols-3 gap-4">
  <div>
    <label className="block text-sm text-slate-400 mb-1">姓名 <span className="text-red-400">*</span></label>
    <input
      type="text"
      value={editingItem?.name || ''}
      onChange={(e) => setEditingItem({ ...editingItem!, name: e.target.value })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      placeholder="请输入姓名"
    />
  </div>
  <div>
    <label className="block text-sm text-slate-400 mb-1">工号 <span className="text-red-400">*</span></label>
    <input
      type="text"
      value={editingItem?.employeeId || ''}
      onChange={(e) => setEditingItem({ ...editingItem!, employeeId: e.target.value })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      placeholder="请输入工号"
    />
  </div>
  <div>
    <label className="block text-sm text-slate-400 mb-1">身份证号</label>
    <input
      type="text"
      value={editingItem?.idCard || ''}
      onChange={(e) => setEditingItem({ ...editingItem!, idCard: e.target.value })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      placeholder="请输入身份证号"
    />
  </div>
</div>

<div className="grid grid-cols-3 gap-4">
  <div>
    <label className="block text-sm text-slate-400 mb-1">分公司</label>
    <input
      type="text"
      value={editingItem?.company || ''}
      onChange={(e) => setEditingItem({ ...editingItem!, company: e.target.value })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      placeholder="所属分公司"
    />
  </div>
  <div>
    <label className="block text-sm text-slate-400 mb-1">项目</label>
    <input
      type="text"
      value={editingItem?.project || ''}
      onChange={(e) => setEditingItem({ ...editingItem!, project: e.target.value })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      placeholder="所属项目"
    />
  </div>
  <div>
    <label className="block text-sm text-slate-400 mb-1">工队</label>
    <input
      type="text"
      value={editingItem?.workTeam || ''}
      onChange={(e) => setEditingItem({ ...editingItem!, workTeam: e.target.value })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      placeholder="如：土建工队/机电工队"
    />
  </div>
  <div>
    <label className="block text-sm text-slate-400 mb-1">工种</label>
    <input
      type="text"
      value={editingItem?.workType || ''}
      onChange={(e) => setEditingItem({ ...editingItem!, workType: e.target.value })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      placeholder="如：木工/钢筋工/电工"
    />
  </div>
</div>

<div className="grid grid-cols-3 gap-4">
  <div>
    <label className="block text-sm text-slate-400 mb-1">班组</label>
    <input
      type="text"
      value={editingItem?.team || ''}
      onChange={(e) => setEditingItem({ ...editingItem!, team: e.target.value })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      placeholder="所属班组"
    />
  </div>
  <div>
    <label className="block text-sm text-slate-400 mb-1">联系电话</label>
    <input
      type="tel"
      value={editingItem?.phone || ''}
      onChange={(e) => setEditingItem({ ...editingItem!, phone: e.target.value })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      placeholder="联系电话"
    />
  </div>
  <div>
    <label className="block text-sm text-slate-400 mb-1">进场日期</label>
    <input
      type="date"
      value={editingItem?.entryDate || ''}
      onChange={(e) => setEditingItem({ ...editingItem!, entryDate: e.target.value })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
    />
  </div>
</div>

<div className="grid grid-cols-3 gap-4">
  <div>
    <label className="block text-sm text-slate-400 mb-1">状态</label>
    <select
      value={editingItem?.status || 'active'}
      onChange={(e) => setEditingItem({ ...editingItem!, status: e.target.value as 'active' | 'inactive' })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
    >
      <option value="active">在场</option>
      <option value="inactive">退场</option>
    </select>
  </div>
  <div>
    <label className="block text-sm text-slate-400 mb-1">紧急联系人</label>
    <input
      type="text"
      value={editingItem?.emergencyContact || ''}
      onChange={(e) => setEditingItem({ ...editingItem!, emergencyContact: e.target.value })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      placeholder="姓名+电话"
    />
  </div>
</div>
      </div>
      
      <div className="flex gap-3 mt-8">
        <button 
          onClick={() => {
            if (!editingItem?.name || !editingItem?.employeeId) {
              alert('请填写姓名和工号');
              return;
            }
            
            if (editingItem.id) {
              setPersons(persons.map(p => p.id === editingItem.id ? editingItem : p));
            } else {
              const newId = Math.max(...persons.map(p => p.id), 0) + 1;
              setPersons([...persons, { ...editingItem, id: newId } as Person]);
            }
            setShowModal(false);
            setEditingItem(null);
          }}
          className="flex-1 bg-cyan-500 hover:bg-cyan-400 py-2 rounded text-sm font-bold text-slate-900"
        >
          保存
        </button>
        <button 
          onClick={() => {
            setShowModal(false);
            setEditingItem(null);
          }} 
          className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded text-sm text-slate-100"
        >
          取消
        </button>
      </div>
    </div>
  </div>
)}
      {/* 人员详情弹窗 */}
{showDetailModal && viewingPerson && (
  <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[600px] p-6 shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-slate-100">人员详情</h3>
        <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-200">
          <X size={20} />
        </button>
      </div>
      
      {/* 头像大图 */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          <img 
            src={viewingPerson.avatar || '/default-avatar.png'} 
            className="w-32 h-32 rounded-full object-cover border-4 border-cyan-400/50"
            alt={viewingPerson.name}
          />
          <button className="absolute bottom-0 right-0 p-1.5 bg-cyan-500 rounded-full hover:bg-cyan-400">
            <Camera size={16} className="text-white" />
          </button>
        </div>
      </div>
      
      {/* 信息网格 */}
<div className="grid grid-cols-2 gap-4 mb-6">
  <InfoItem label="姓名" value={viewingPerson.name} />
  <InfoItem label="工号" value={viewingPerson.employeeId} />
  <InfoItem label="身份证号" value={viewingPerson.idCard} />
  <InfoItem label="分公司" value={viewingPerson.company} />
  <InfoItem label="项目" value={viewingPerson.project} />
  <InfoItem label="工种" value={viewingPerson.workType} />
  <InfoItem label="班组" value={viewingPerson.team} />
  <InfoItem label="电话" value={viewingPerson.phone} />
  <InfoItem label="进场日期" value={viewingPerson.entryDate} />
  <InfoItem label="状态" value={viewingPerson.status === 'active' ? '在场' : '退场'} />
  <InfoItem label="紧急联系人" value={viewingPerson.emergencyContact} />
</div>
      
      <div className="flex gap-3">
        <button className="flex-1 bg-cyan-500 hover:bg-cyan-400 py-2 rounded text-sm font-bold text-slate-900">
          编辑信息
        </button>
        <button onClick={() => setShowDetailModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded text-sm text-slate-100">
          关闭
        </button>
      </div>
    </div>
  </div>
)}
{/* 批量导入弹窗 */}
{showUploadModal && (
  <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[900px] p-6 shadow-2xl max-h-[90vh] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-100">批量导入工人</h3>
        <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-200">
          <X size={20} />
        </button>
      </div>
      
      <div className="border border-dashed border-cyan-400/50 rounded-lg p-6 text-center mb-4">
        <Upload size={32} className="mx-auto text-cyan-400 mb-2" />
        <p className="text-sm text-slate-400 mb-2">点击或拖拽上传Excel文件</p>
        <p className="text-xs text-slate-500">支持 .xlsx, .xls 格式</p>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          className="mt-3 text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30"
        />
      </div>
      
      {uploadPreview.length > 0 && (
        <>
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-slate-300">
              预览数据（共 {uploadPreview.length} 条，有效 {uploadPreview.filter(i => i.isValid).length} 条）
            </p>
            <button
              onClick={confirmImport}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 rounded text-sm font-bold text-slate-900"
            >
              确认导入
            </button>
          </div>
          
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-700">
                <tr>
                  <th className="px-2 py-2 text-left text-xs text-slate-400">姓名</th>
                  <th className="px-2 py-2 text-left text-xs text-slate-400">工号</th>
                  <th className="px-2 py-2 text-left text-xs text-slate-400">身份证号</th>
                  <th className="px-2 py-2 text-left text-xs text-slate-400">工种</th>
                  <th className="px-2 py-2 text-left text-xs text-slate-400">班组</th>
                  <th className="px-2 py-2 text-left text-xs text-slate-400">电话</th>
                  <th className="px-2 py-2 text-left text-xs text-slate-400">进场日期</th>
                  <th className="px-2 py-2 text-left text-xs text-slate-400">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {uploadPreview.map((item, idx) => (
                  <tr key={idx} className={!item.isValid ? 'bg-red-500/10' : ''}>
                    <td className="px-2 py-1 text-slate-300">{item.name || '—'}</td>
                    <td className="px-2 py-1 text-slate-300">{item.employeeId || '—'}</td>
                    <td className="px-2 py-1 text-slate-300">{item.idCard || '—'}</td>
                    <td className="px-2 py-1 text-slate-300">{item.workType || '—'}</td>
                    <td className="px-2 py-1 text-slate-300">{item.team || '—'}</td>
                    <td className="px-2 py-1 text-slate-300">{item.phone || '—'}</td>
                    <td className="px-2 py-1 text-slate-300">{item.entryDate || '—'}</td>
                    <td className="px-2 py-1">
                      {!item.isValid && (
                        <span className="text-xs text-red-400">{item.errorMsg}</span>
                      )}
                      {item.isValid && (
                        <span className="text-xs text-green-400">✓ 有效</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  </div>
)}
    </div>
  );
}