import React, { useState, useEffect  } from 'react';
import { Search, Plus, Edit2, Trash2, X, Save, Camera, Wrench, AlertCircle, MoreHorizontal } from 'lucide-react';
import { Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReactDOM from 'react-dom';
import { addCameraViaRTSP } from '../api/videoApi';
import { API_BASE_URL } from '../api/config';

interface Camera {
  id: number;
  name: string;
  deviceCode: string;
  channelNo?: number;          // 机器码/设备序列号
  location: string;
  company?: string;          // 所属分公司
  projectId: number;
  projectName?: string;
  team?: string;              // 所属工队
  admin?: string;            // 管理员
  adminPhone?: string;       // 管理员电话
  status: 'online' | 'offline' | 'fault' | 'maintaining';
  type: 'bullet' | 'dome' | 'bodycam' | 'drone' | 'thermal' | 'other';
  remark?: string;
  rtspUrl?: string;
  lastMaintenance?: string;  // 最后维修时间
  faultReason?: string;      // 故障原因
}

export default function CameraManagement() {
const [cameras, setCameras] = useState<Camera[]>([]);

const fetchCameras = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/devices`);
    const data = await response.json();
    const camerasData = data.map((device: any) => ({
      id: device.id,
      name: device.name,
      deviceCode: device.device_code,
      channelNo: 1,
      location: device.install_location || '',
      company: device.company,
      projectId: device.project_id || 1,
      projectName: device.project,
      team: device.team || '土建工队',
      status: device.status === 1 ? 'online' : 'offline',
      type: device.device_type,
      remark: device.remark,
      rtspUrl: device.rtsp_url
    }));
    if (camerasData.length > 0) {
      setCameras(camerasData);
    }
  } catch (error) {
    console.error('获取摄像头列表失败:', error);
  }
};

useEffect(() => {
  // 默认数据
  const defaultCameras = [
    { id: 1, name: '塔吊1号摄像头', deviceCode: 'CAM-001', channelNo: 1, location: '西塔塔吊', company: '第一分公司', projectId: 1, projectName: '地铁8号线', team: '土建工队', admin: '李工', adminPhone: '13900139001', status: 'online', type: 'dome', rtspUrl: '' },
    { id: 2, name: '大门出入口', deviceCode: 'CAM-002', channelNo: 2, location: '工地主入口', company: '第一分公司', projectId: 1, projectName: '地铁8号线', team: '安全工队', admin: '王工', adminPhone: '13900139002', status: 'online', type: 'bullet', rtspUrl: '' },
    { id: 3, name: '钢筋加工区', deviceCode: 'CAM-003', channelNo: 3, location: '钢筋棚', company: '第二分公司', projectId: 2, projectName: '商业综合体', team: '机电工队', admin: '张工', adminPhone: '13900139003', status: 'offline', type: 'bullet', rtspUrl: '' },
    { id: 4, name: '模板作业区', deviceCode: 'CAM-004', channelNo: 4, location: '东区模板场', company: '第二分公司', projectId: 2, projectName: '商业综合体', team: '土建工队', admin: '刘工', adminPhone: '13900139004', status: 'online', type: 'dome', rtspUrl: '' },
  ];
  setCameras(defaultCameras);
  fetchCameras();
}, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [repairCamera, setRepairCamera] = useState<Camera | null>(null);
  const [repairReason, setRepairReason] = useState('');
  const [editingItem, setEditingItem] = useState<Camera | null>(null);

  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterTeam, setFilterTeam] = useState<string>('all');

  const [showUploadModal, setShowUploadModal] = useState(false);
const [uploadPreview, setUploadPreview] = useState<any[]>([]);
  const types = ['all', ...new Set(cameras.map(c => c.type))];
  const statuses = ['all', 'online', 'offline', 'fault', 'maintaining'];
  const companies = ['all', ...new Set(cameras.map(c => c.company).filter(Boolean))];
  const teams = ['all', ...new Set(cameras.map(c => c.team).filter(Boolean))];

  const filteredData = cameras.filter(c => {
    const matchesSearch = searchTerm === '' || 
      c.name.includes(searchTerm) || 
      c.deviceCode.includes(searchTerm) ||
      c.team?.includes(searchTerm) ||
      c.location.includes(searchTerm);
    const matchesType = filterType === 'all' || c.type === filterType;
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    const matchesCompany = filterCompany === 'all' || c.company === filterCompany;
    const matchesTeam = filterTeam === 'all' || c.team === filterTeam;
    return matchesSearch && matchesType && matchesStatus && matchesCompany && matchesTeam;
  });

  const getStatusStyle = (status: string) => {
    const styles: Record<string, string> = {
      online: 'bg-green-500/20 text-green-400 border-green-500/30',
      offline: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      fault: 'bg-red-500/20 text-red-400 border-red-500/30',
      maintaining: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    };
    return styles[status] || styles.offline;
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = { 
      online: '在线', 
      offline: '离线', 
      fault: '故障', 
      maintaining: '维修中' 
    };
    return map[status] || status;
  };

  const getTypeText = (type: string) => {
    const map: Record<string, string> = { 
      bullet: '枪机摄像头', 
      dome: '球机摄像头', 
      bodycam: '执法记录仪', 
      drone: '无人机', 
      helmet: '智能安全帽',
      other: '其他'
    };
    return map[type] || type;
  };
// 下载模板
const downloadTemplate = () => {
  const template = [
    ['设备名称', '机器码', '通道号','类型', '位置', '分公司', '项目', '管理员', '管理员电话', '视频流地址'],
    ['示例摄像头', 'C6HN123456789', '1', '枪机', '北门', '第一分公司', '西安地铁8号线', '张三', '13800138001', 'rtmp://...'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '摄像头模板');
  XLSX.writeFile(wb, '摄像头导入模板.xlsx');
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
    const parsedData = dataRows.map((row: any) => ({
      name: row[0]?.toString().trim() || '',
      deviceCode: row[1]?.toString().trim() || '',
       channelNo: row[9] ? parseInt(row[9]) : 1, 
      type: row[2]?.toString().trim() || 'bullet',
      location: row[3]?.toString().trim() || '',
      company: row[4]?.toString().trim() || '',
      projectName: row[5]?.toString().trim() || '西安地铁8号线',
      admin: row[6]?.toString().trim() || '',
      adminPhone: row[7]?.toString().trim() || '',
      rtspUrl: row[8]?.toString().trim() || '',
      isValid: !!(row[0] && row[1]),
      errorMsg: !row[0] ? '设备名称不能为空' : !row[1] ? '机器码不能为空' : ''
    }));
    setUploadPreview(parsedData);
  };
  reader.readAsArrayBuffer(file);
};

// 确认导入
const confirmImport = () => {
  const validData = uploadPreview.filter(item => item.isValid);
  const newCameras = validData.map((item, idx) => ({
    id: Math.max(...cameras.map(c => c.id), 0) + idx + 1,
    name: item.name,
    deviceCode: item.deviceCode,
    type: item.type,
    location: item.location,
    company: item.company,
    projectId: item.projectName === '西安地铁10号线' ? 2 : 1,
    projectName: item.projectName,
    admin: item.admin,
    adminPhone: item.adminPhone,
    rtspUrl: item.rtspUrl,
    status: 'online' as const,
  }));
  setCameras([...cameras, ...newCameras]);
  setShowUploadModal(false);
  setUploadPreview([]);
  alert(`成功导入 ${validData.length} 条`);
};

  const handleRepair = (camera: Camera) => {
    setRepairCamera(camera);
    setRepairReason('');
    setShowRepairModal(true);
  };

  const confirmRepair = () => {
    if (repairCamera && repairReason) {
      setCameras(cameras.map(c => 
        c.id === repairCamera.id 
          ? { ...c, status: 'maintaining', faultReason: repairReason, lastMaintenance: new Date().toISOString().split('T')[0] }
          : c
      ));
      setShowRepairModal(false);
      setRepairCamera(null);
      setRepairReason('');
      alert('报修成功，设备状态已更新为"维修中"');
    } else {
      alert('请填写故障原因');
    }
  };

  return (
    <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-4 h-full overflow-auto">
      {/* 操作栏 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
          <input
            type="text"
            placeholder="搜索名称、机器码、位置..."
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
          {companies.map(company => (
            <option key={company} value={company}>
              {company === 'all' ? '全部公司' : company}
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
              {team === 'all' ? '全部工队' : team}
            </option>
          ))}
        </select>
        
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400"
        >
          {types.map(type => (
            <option key={type} value={type}>
              {type === 'all' ? '全部类型' : getTypeText(type)}
            </option>
          ))}
        </select>
        
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400"
        >
          {statuses.map(status => (
            <option key={status} value={status}>
              {status === 'all' ? '全部状态' : getStatusText(status)}
            </option>
          ))}
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
          onClick={() => { setEditingItem(null); setShowModal(true); }}
          className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-1 text-sm"
        >
          <Plus size={14} /> 添加摄像头
        </button>
      </div>

      {/* 筛选结果统计 */}
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-slate-400">
          共 <span className="text-cyan-400 font-bold">{filteredData.length}</span> 条记录
          {(filterCompany !== 'all' || filterTeam !== 'all' || filterType !== 'all' || filterStatus !== 'all' || searchTerm) && (
            <span className="ml-2 text-xs">(已筛选)</span>
          )}
        </p>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-blue-400/20 bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">设备名称</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">类型</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">机器码</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">位置</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">分公司</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">项目</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">工队</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">管理员</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">状态</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-300">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {filteredData.map(camera => (
              <tr key={camera.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 text-slate-300">{camera.name}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    {getTypeText(camera.type)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300 font-mono text-xs">{camera.deviceCode}</td>
                <td className="px-4 py-3 text-slate-300">{camera.location}</td>
                <td className="px-4 py-3 text-slate-300">{camera.company || '-'}</td>
                <td className="px-4 py-3 text-slate-300">{camera.projectName || '-'}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">{camera.team || '-'}</span></td>
                <td className="px-4 py-3">
                  <div className="text-sm text-slate-300">{camera.admin || '-'}</div>
                  {camera.adminPhone && <div className="text-xs text-slate-500">{camera.adminPhone}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(camera.status)}`}>
                    {getStatusText(camera.status)}
                  </span>
                  {camera.faultReason && camera.status === 'fault' && (
                    <div className="text-xs text-red-400 mt-1">{camera.faultReason}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button 
                      onClick={() => { setEditingItem(camera); setShowModal(true); }}
                      className="p-1 hover:bg-cyan-500/20 rounded text-cyan-400"
                      title="编辑"
                    >
                      <Edit2 size={16} />
                    </button>
                    {(camera.status === 'offline' || camera.status === 'fault') && (
                      <button 
                        onClick={() => handleRepair(camera)}
                        className="p-1 hover:bg-yellow-500/20 rounded text-yellow-400"
                        title="报修"
                      >
                        <Wrench size={16} />
                      </button>
                    )}
<button 
  onClick={async () => {
    if (confirm('确定删除该摄像头吗？')) {
      await fetch(`${API_BASE_URL}/api/devices/camera/${camera.id}`, {
        method: 'DELETE',
      });
      await fetchCameras();
    }
  }}
  className="..."
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
{showModal && ReactDOM.createPortal(
  <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[600px] p-6 shadow-2xl max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-100">
                {editingItem?.id ? '编辑摄像头' : '添加摄像头'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-200">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">设备名称 <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={editingItem?.name || ''}
                    onChange={(e) => setEditingItem({ ...editingItem!, name: e.target.value })}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                    placeholder="请输入设备名称"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">设备类型</label>
                  <select
                    value={editingItem?.type || 'bullet'}
                    onChange={(e) => setEditingItem({ ...editingItem!, type: e.target.value as Camera['type'] })}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="bullet">枪机</option>
                    <option value="dome">球机</option>
                    <option value="bodycam">执法记录仪</option>
                    <option value="drone">无人机</option>
                    <option value="helmet">安全帽</option>
                    <option value="other">其他</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">机器码/设备序列号 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={editingItem?.deviceCode || ''}
                  onChange={(e) => setEditingItem({ ...editingItem!, deviceCode: e.target.value })}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                  placeholder="萤石云设备序列号，如：C6HN123456789"
                />
                <p className="text-xs text-slate-500 mt-1">萤石云4G摄像头的设备序列号</p>
              </div>
              
              <div>
  <label className="block text-sm text-slate-400 mb-1">通道号</label>
  <input
    type="number"
    value={editingItem?.channelNo || 1}
    onChange={(e) => setEditingItem({ ...editingItem!, channelNo: parseInt(e.target.value) || 1 })}
    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
    placeholder="1"
  />
  <p className="text-xs text-slate-500 mt-1">萤石云设备通道号，默认为1</p>
</div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">安装位置</label>
                  <input
                    type="text"
                    value={editingItem?.location || ''}
                    onChange={(e) => setEditingItem({ ...editingItem!, location: e.target.value })}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                    placeholder="如：北门出入口"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">所属分公司</label>
                  <input
                    type="text"
                    value={editingItem?.company || ''}
                    onChange={(e) => setEditingItem({ ...editingItem!, company: e.target.value })}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                    placeholder="所属分公司"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">所属项目</label>
                  <select
                    value={editingItem?.projectId || 1}
                    onChange={(e) => setEditingItem({ ...editingItem!, projectId: parseInt(e.target.value), projectName: e.target.options[e.target.selectedIndex].text })}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                  >
                    <option value={1}>西安地铁8号线</option>
                    <option value={2}>西安地铁10号线</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">所属工队</label>
                  <input
                    type="text"
                    value={editingItem?.team || ''}
                    onChange={(e) => setEditingItem({ ...editingItem!, team: e.target.value })}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                    placeholder="如：土建工队/机电工队"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">状态</label>
                  <select
                    value={editingItem?.status || 'online'}
                    onChange={(e) => setEditingItem({ ...editingItem!, status: e.target.value as Camera['status'] })}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="online">在线</option>
                    <option value="offline">离线</option>
                    <option value="fault">故障</option>
                    <option value="maintaining">维修中</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">管理员</label>
                  <input
                    type="text"
                    value={editingItem?.admin || ''}
                    onChange={(e) => setEditingItem({ ...editingItem!, admin: e.target.value })}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                    placeholder="负责人姓名"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">管理员电话</label>
                  <input
                    type="tel"
                    value={editingItem?.adminPhone || ''}
                    onChange={(e) => setEditingItem({ ...editingItem!, adminPhone: e.target.value })}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                    placeholder="联系电话"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">视频流地址</label>
                <input
                  type="text"
                  value={editingItem?.rtspUrl || ''}
                  onChange={(e) => setEditingItem({ ...editingItem!, rtspUrl: e.target.value })}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                  placeholder="rtsp://ezopen://open.ys7.com/设备序列号/1"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">备注</label>
                <textarea
                  value={editingItem?.remark || ''}
                  onChange={(e) => setEditingItem({ ...editingItem!, remark: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                  placeholder="其他说明信息"
                />
              </div>
            </div>
            
<div className="flex gap-3 mt-8">
  <button 
    onClick={async () => {
      if (!editingItem?.name) {
        alert('请填写设备名称');
        return;
      }
      if (!editingItem?.deviceCode) {
        alert('请填写机器码');
        return;
      }
      
      try {
        const payload = {
          name: editingItem.name,
          deviceCode: editingItem.deviceCode,
          channelNo: editingItem.channelNo || 1,
          type: editingItem.type,
          location: editingItem.location,
          company: editingItem.company,
          projectName: editingItem.projectName,
          admin: editingItem.admin,
          adminPhone: editingItem.adminPhone,
          rtspUrl: `rtsp://ezopen://open.ys7.com/${editingItem.deviceCode}/${editingItem.channelNo || 1}`,
          status: editingItem.status,
          remark: editingItem.remark
        };
        
        if (editingItem.id) {
          // 更新
          await fetch(`${API_BASE_URL}/api/devices/camera/${editingItem.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } else {
          // 新增
          await fetch(`${API_BASE_URL}/api/devices/camera`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
        
        alert('保存成功');
        setShowModal(false);
        setEditingItem(null);
        await fetchCameras();
        // 可选：重新从后端获取列表
        // await fetchCameras();
      } catch (err) {
        alert('保存失败');
      }
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
        </div>,
        document.body
      )}

      {/* 报修弹窗 */}
      {showRepairModal && repairCamera && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[450px] p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-100">设备报修</h3>
              <button onClick={() => setShowRepairModal(false)} className="text-slate-400 hover:text-slate-200">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-sm text-slate-400">设备名称</p>
                <p className="text-slate-200 font-medium">{repairCamera.name}</p>
                <p className="text-xs text-slate-500 mt-1">机器码: {repairCamera.deviceCode}</p>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">故障原因 <span className="text-red-400">*</span></label>
                <textarea
                  value={repairReason}
                  onChange={(e) => setRepairReason(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                  placeholder="请描述故障现象..."
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button 
                onClick={confirmRepair}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 py-2 rounded text-sm font-bold text-slate-900"
              >
                提交报修
              </button>
              <button 
                onClick={() => setShowRepairModal(false)} 
                className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded text-sm text-slate-100"
              >
                取消
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    {/* 批量导入弹窗 */}
{showUploadModal && ReactDOM.createPortal(
  <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[800px] p-6 shadow-2xl max-h-[80vh] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-100">批量导入摄像头</h3>
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
              <thead><tr>{['设备名称','机器码','状态'].map(h => <th key={h} className="text-left">{h}</th>)}</tr></thead>
              <tbody>
                {uploadPreview.map((item, idx) => (
                  <tr key={idx} className={!item.isValid ? 'bg-red-500/10' : ''}>
                    <td>{item.name || '—'}</td>
                    <td>{item.deviceCode || '—'}</td>
                    <td>{item.isValid ? '✓ 有效' : <span className="text-red-400">{item.errorMsg}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={confirmImport} className="mt-4 bg-cyan-500 py-2 rounded">确认导入</button>
        </>
      )}
    </div>
  </div>,
  document.body
)}
    </div>
  );
}