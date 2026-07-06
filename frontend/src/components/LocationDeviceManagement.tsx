// src/components/admin/LocationDeviceManagement.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Edit2, Trash2, X, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { deviceApi, type LocationDevice } from '../api/deviceApi';
import { API_BASE_URL, getAuthHeaders } from '../api/config';
import { hasStoredPermission } from '../utils/permissions';

type DeviceStatus = 'online' | 'offline' | 'fault';

type UnitMaps = {
  branches: Record<string, string>;
  projects: Record<string, string>;
  grids: Record<string, string>;
  teams: Record<string, string>;
};

type OrgOption = {
  id: string;
  name: string;
  branch_id?: string;
  project_id?: string;
  grid_id?: string;
  company?: string;
  project?: string;
};

type OrgOptions = {
  branches: OrgOption[];
  projects: OrgOption[];
  grids: OrgOption[];
  teams: OrgOption[];
};

const emptyUnitMaps: UnitMaps = { branches: {}, projects: {}, grids: {}, teams: {} };
const emptyOrgOptions: OrgOptions = { branches: [], projects: [], grids: [], teams: [] };
const DEVICE_USE_NAMES = new Set(['定位基站', '基准站', '流动站', '基站', '移动站', '固定站']);

const emptyDevice: LocationDevice = {
  device_id: '',
  name: '',
  lat: 0,
  lng: 0,
  type: 'uwb_band',
  company: '',
  branch_id: '',
  project: '',
  project_id: '',
  grid: '',
  grid_id: '',
  team: '',
  team_id: '',
  personnel_id: '',
  install_location: '',
  holder: '',
  holderPhone: '',
  phone_num: '',
  status: 'offline',
  remark: '',
};

export default function LocationDeviceManagement() {
  const [devices, setDevices] = useState<LocationDevice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [formData, setFormData] = useState<LocationDevice>(emptyDevice);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<Array<LocationDevice & { isValid: boolean; errorMsg: string }>>([]);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [loading, setLoading] = useState(false);
  const [unitMaps, setUnitMaps] = useState<UnitMaps>(emptyUnitMaps);
  const [orgOptions, setOrgOptions] = useState<OrgOptions>(emptyOrgOptions);
  const canCreateDevice = hasStoredPermission('device.create');
  const canEditDevice = hasStoredPermission('device.edit');
  const canDeleteDevice = hasStoredPermission('device.delete');

  const text = (value: unknown) => String(value ?? '').trim();
  const firstText = (item: any, keys: string[]) => {
    for (const key of keys) {
      const value = text(item?.[key]);
      if (value) return value;
    }
    return '';
  };
  const normalizeOptions = (items: any[], idKeys: string[], nameKeys: string[]): OrgOption[] => {
    const seen = new Set<string>();
    return (Array.isArray(items) ? items : []).map(item => {
      const id = firstText(item, idKeys);
      const name = firstText(item, nameKeys);
      if (!id && !name) return null;
      return {
        id: id || name,
        name: name || id,
        branch_id: firstText(item, ['branch_id', 'branchId', 'company_id', 'companyId']),
        project_id: firstText(item, ['project_id', 'projectId']),
        grid_id: firstText(item, ['grid_id', 'gridId']),
        company: firstText(item, ['company', 'branch_name', 'branchName']),
        project: firstText(item, ['project', 'project_name', 'projectName']),
      };
    }).filter((option): option is OrgOption => {
      if (!option) return false;
      const key = `${option.id}|${option.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const mergeOptions = (...groups: OrgOption[][]) => {
    const seen = new Set<string>();
    return groups.flat().filter(option => {
      const key = `${option.id}|${option.name}`;
      if (!option.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const selectValue = (options: OrgOption[], id?: string, name?: string) => {
    const rawId = text(id);
    if (rawId && options.some(option => option.id === rawId)) return rawId;
    const rawName = text(name);
    return options.find(option => option.name === rawName)?.id || '';
  };
  const inputClass = 'w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-400 disabled:opacity-60';
  const labelClass = 'block text-sm font-medium text-slate-200 mb-1.5';

  const loadUnitMaps = async () => {
    try {
      const res = await fetch('/api/dashboard/overview', { cache: 'no-store', headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const branches: Record<string, string> = {};
      const projects: Record<string, string> = {};
      (data.branches || []).forEach((item: any) => {
        if (item?.id !== undefined && item?.name) branches[String(item.id)] = item.name;
      });
      (data.projects || []).forEach((item: any) => {
        if (item?.id !== undefined && item?.name) projects[String(item.id)] = item.name;
      });
      setUnitMaps(prev => ({ ...prev, branches, projects }));
    } catch (error) {
      console.error('加载单位名称失败', error);
    }
  };

  const loadOrgOptions = async () => {
    try {
      const headers = getAuthHeaders();
      const [branchRes, projectRes, gridRes, teamRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/dashboard/branches`, { headers }),
        fetch(`${API_BASE_URL}/projects/`, { headers }),
        fetch(`${API_BASE_URL}/api/grids/`, { headers }),
        fetch(`${API_BASE_URL}/team/list`, { headers }),
      ]);
      const branches = branchRes.ok ? await branchRes.json() : [];
      const projects = projectRes.ok ? await projectRes.json() : [];
      const grids = gridRes.ok ? await gridRes.json() : [];
      const teams = teamRes.ok ? await teamRes.json() : [];
      setOrgOptions({
        branches: normalizeOptions(branches, ['id', 'branch_id', 'branchId'], ['name', 'branch_name', 'branchName']),
        projects: normalizeOptions(projects, ['id', 'project_id', 'projectId'], ['name', 'project_name', 'projectName']),
        grids: normalizeOptions(grids, ['grid_id', 'gridId', 'id', 'unit_id'], ['name', 'grid_name', 'gridName']),
        teams: normalizeOptions(teams, ['team_id', 'teamId', 'id', 'unit_id'], ['name', 'team_name', 'teamName']),
      });
    } catch (error) {
      console.error('加载组织筛选选项失败', error);
    }
  };

  const loadDevices = async () => {
    setLoading(true);
    try {
      loadUnitMaps();
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
    loadOrgOptions();
  }, []);

  const isRawId = (value?: string) => !!value && /^\d+$/.test(String(value).trim());
  const resolveUnitName = (value: string | undefined, id: string | undefined, map: Record<string, string>) => {
    const raw = (value || '').trim();
    const resolvedById = id ? map[String(id)] : '';
    if (resolvedById) return resolvedById;
    if (isRawId(raw) && map[String(raw)]) return map[String(raw)];
    return raw;
  };

  const getMachineCode = (device: LocationDevice) => device.phone_num || '';
  const getDeviceUse = (device: LocationDevice) => {
    const explicit = (device.install_location || '').trim();
    if (explicit) return explicit;
    const team = (device.team || '').trim();
    return DEVICE_USE_NAMES.has(team) ? team : '';
  };
  const getDisplayCompany = (device: LocationDevice) => resolveUnitName(device.company, device.branch_id, unitMaps.branches);
  const getDisplayProject = (device: LocationDevice) => resolveUnitName(device.project, device.project_id, unitMaps.projects);
  const getDisplayGrid = (device: LocationDevice) => resolveUnitName(device.grid, device.grid_id, unitMaps.grids);
  const getDisplayTeam = (device: LocationDevice) => {
    const team = resolveUnitName(device.team, device.team_id, unitMaps.teams);
    return DEVICE_USE_NAMES.has(team) ? '' : team;
  };

  const types = useMemo(() => ['all', ...new Set(devices.map(d => d.type || '').filter(Boolean))], [devices]);
  const companies = useMemo(() => ['all', ...new Set(devices.map(d => getDisplayCompany(d)).filter(Boolean))], [devices, unitMaps]);
  const teams = useMemo(() => ['all', ...new Set(devices.map(d => getDisplayTeam(d)).filter(Boolean))], [devices, unitMaps]);
  const statuses = ['all', 'online', 'offline', 'fault'];

  const branchSelectOptions = useMemo(() => mergeOptions(
    orgOptions.branches,
    devices.map(d => ({ id: text(d.branch_id) || getDisplayCompany(d), name: getDisplayCompany(d) })).filter(option => option.name)
  ), [devices, orgOptions.branches, unitMaps]);
  const projectSelectOptions = useMemo(() => {
    const all = mergeOptions(
      orgOptions.projects,
      devices.map(d => ({
        id: text(d.project_id) || getDisplayProject(d),
        name: getDisplayProject(d),
        branch_id: text(d.branch_id),
        company: getDisplayCompany(d),
      })).filter(option => option.name)
    );
    return formData.branch_id
      ? all.filter(option => !option.branch_id || option.branch_id === formData.branch_id || option.company === formData.company)
      : all;
  }, [devices, formData.branch_id, formData.company, orgOptions.projects, unitMaps]);
  const gridSelectOptions = useMemo(() => {
    const all = mergeOptions(
      orgOptions.grids,
      devices.map(d => ({
        id: text(d.grid_id) || getDisplayGrid(d),
        name: getDisplayGrid(d),
        project_id: text(d.project_id),
        project: getDisplayProject(d),
      })).filter(option => option.name)
    );
    return formData.project_id
      ? all.filter(option => !option.project_id || option.project_id === formData.project_id || option.project === formData.project)
      : all;
  }, [devices, formData.project, formData.project_id, orgOptions.grids, unitMaps]);
  const teamSelectOptions = useMemo(() => {
    const all = mergeOptions(
      orgOptions.teams,
      devices.map(d => ({
        id: text(d.team_id) || getDisplayTeam(d),
        name: getDisplayTeam(d),
        project_id: text(d.project_id),
        grid_id: text(d.grid_id),
        project: getDisplayProject(d),
      })).filter(option => option.name)
    );
    return formData.grid_id || formData.project_id
      ? all.filter(option =>
        (!option.grid_id && !option.project_id) ||
        (!!formData.grid_id && option.grid_id === formData.grid_id) ||
        (!!formData.project_id && option.project_id === formData.project_id) ||
        option.project === formData.project
      )
      : all;
  }, [devices, formData.grid_id, formData.project, formData.project_id, orgOptions.teams, unitMaps]);

  const getTypeText = (type: string) => {
    const map: Record<string, string> = {
      uwb_band: 'UWB手环',
      uwb_badge: 'UWB工牌',
      rtk_band: 'RTK手环',
      rtk_badge: 'RTK工牌',
      rtk: 'RTK',
      uwb: 'UWB',
      gps_tag: 'GPS工牌',
      gps_band: 'GPS手环',
      smart_helmet: '智能安全帽',
      location: '定位设备',
      gateway: '网关',
      jt808: 'JT808',
      wifi: 'Wi-Fi定位',
    };
    return map[type] || type;
  };

  const getDeviceTypeLabel = (device: LocationDevice) => {
    const base = getTypeText(device.type || '');
    const deviceUse = getDeviceUse(device);
    return deviceUse ? `${base} / ${deviceUse}` : base;
  };

  const displayRows = useMemo(() => devices.map((device) => ({
    device,
    companyName: getDisplayCompany(device),
    projectName: getDisplayProject(device),
    gridName: getDisplayGrid(device),
    teamName: getDisplayTeam(device),
    machineCode: getMachineCode(device),
    typeLabel: getDeviceTypeLabel(device),
  })), [devices, unitMaps]);

  const filteredData = useMemo(() => displayRows.filter(({ device: d, companyName, projectName, gridName, teamName, machineCode }) => {
    const matchesSearch = searchTerm === '' ||
      d.name.includes(searchTerm) ||
      d.device_id.includes(searchTerm) ||
      machineCode.includes(searchTerm) ||
      companyName.includes(searchTerm) ||
      projectName.includes(searchTerm) ||
      gridName.includes(searchTerm) ||
      teamName.includes(searchTerm) ||
      d.holder?.includes(searchTerm);
    return matchesSearch &&
      (filterType === 'all' || d.type === filterType) &&
      (filterStatus === 'all' || d.status === filterStatus) &&
      (filterCompany === 'all' || companyName === filterCompany) &&
      (filterTeam === 'all' || teamName === filterTeam);
  }), [displayRows, filterCompany, filterStatus, filterTeam, filterType, searchTerm]);

  const getStatusStyle = (status: string) => {
    const styles: Record<string, string> = {
      online: 'bg-green-500/20 text-green-400 border-green-500/30',
      offline: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      fault: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return styles[status] || styles.offline;
  };
  const getStatusText = (status: string) => ({ online: '在线', offline: '离线', fault: '故障' }[status] || status);

  const updateForm = (patch: Partial<LocationDevice>) => setFormData(prev => ({ ...prev, ...patch }));
  const chooseBranch = (id: string) => {
    const option = branchSelectOptions.find(item => item.id === id);
    updateForm({
      company: option?.name || '',
      branch_id: option?.id || '',
      project: '',
      project_id: '',
      grid: '',
      grid_id: '',
      team: '',
      team_id: '',
    });
  };
  const chooseProject = (id: string) => {
    const option = projectSelectOptions.find(item => item.id === id);
    updateForm({
      project: option?.name || '',
      project_id: option?.id || '',
      grid: '',
      grid_id: '',
      team: '',
      team_id: '',
    });
  };
  const chooseGrid = (id: string) => {
    const option = gridSelectOptions.find(item => item.id === id);
    updateForm({
      grid: option?.name || '',
      grid_id: option?.id || '',
      team: '',
      team_id: '',
    });
  };
  const chooseTeam = (id: string) => {
    const option = teamSelectOptions.find(item => item.id === id);
    updateForm({
      team: option?.name || '',
      team_id: option?.id || '',
    });
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
    const machineCode = (formData.phone_num || '').trim();
    if (!formData.name.trim() || !formData.device_id.trim() || !machineCode || !formData.company.trim() || !formData.project.trim()) {
      alert('请填写设备名称、设备ID、唯一机器码(phone_num)、分公司和项目');
      return;
    }

    const payload: LocationDevice = {
      ...formData,
      lat: formData.lat ?? 0,
      lng: formData.lng ?? 0,
      phone_num: machineCode,
      holderPhone: formData.holderPhone || '',
      grid: formData.grid || '',
      grid_id: formData.grid_id || '',
      team: formData.team || '',
      team_id: formData.team_id || '',
      install_location: formData.install_location || '',
      personnel_id: formData.personnel_id || '',
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
    } catch (error: any) {
      console.error('保存定位装置失败', error);
      alert(error?.response?.data?.detail || '保存定位装置失败，请检查设备ID或唯一机器码是否重复');
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
      ['设备名称', '设备ID', '唯一机器码(phone_num)', '类型', '分公司', '分公司ID', '项目', '项目ID', '网格', '网格ID', '工队', '工队ID', '持有人', '持有人电话', '设备用途', '备注'],
      ['UWB手环-001', 'UWB001', 'MACHINE001', 'UWB手环', '集团有限公司', '1', '西安东站项目', '1', '桥梁二网格', 'GRID-007', '土建工队', '', '张三', '13800138001', '定位基站', ''],
      ['RTK工牌-001', 'RTK001', 'MACHINE002', 'RTK工牌', '集团有限公司', '1', '西安东站项目', '1', '', '', '', '', '李四', '13800138002', '流动站', ''],
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
        const phone_num = row[2]?.toString().trim() || '';
        const typeText = row[3]?.toString().trim() || '';
        return {
          ...emptyDevice,
          name,
          device_id,
          phone_num,
          holderPhone: row[13]?.toString().trim() || '',
          type: typeMap[typeText] || 'uwb_band',
          company: row[4]?.toString().trim() || '',
          branch_id: row[5]?.toString().trim() || '',
          project: row[6]?.toString().trim() || '',
          project_id: row[7]?.toString().trim() || '',
          grid: row[8]?.toString().trim() || '',
          grid_id: row[9]?.toString().trim() || '',
          team: row[10]?.toString().trim() || '',
          team_id: row[11]?.toString().trim() || '',
          holder: row[12]?.toString().trim() || '',
          install_location: row[14]?.toString().trim() || '',
          remark: row[15]?.toString().trim() || '',
          status: 'offline' as DeviceStatus,
          isValid: !!(name && device_id && phone_num),
          errorMsg: !name ? '设备名称不能为空' : !device_id ? '设备ID不能为空' : !phone_num ? '唯一机器码不能为空' : '',
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
    } catch (error: any) {
      console.error('导入定位装置失败', error);
      alert(error?.response?.data?.detail || '导入失败，请检查设备ID或唯一机器码是否重复');
    }
  };

  return (
    <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-4 h-full overflow-auto">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
          <input type="text" placeholder="搜索名称、设备ID、机器码、持有人..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400" />
        </div>
        <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-400">
          {companies.map(c => <option key={c} value={c}>{c === 'all' ? '全部分公司' : c}</option>)}
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
        <button onClick={() => { setFilterCompany('all'); setFilterTeam('all'); setFilterType('all'); setFilterStatus('all'); setSearchTerm(''); }} className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1.5">重置</button>
        {canCreateDevice && <button onClick={() => setShowUploadModal(true)} className="px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-1 text-sm"><Upload size={14} /> 批量导入</button>}
        <button onClick={downloadTemplate} className="px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-1 text-sm"><Download size={14} /> 下载模板</button>
        {canCreateDevice && <button onClick={openCreateModal} className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-1 text-sm"><Plus size={14} /> 添加装置</button>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-blue-400/20 bg-slate-800/50">
            <tr>
              {['设备名称', '设备ID', '类型/用途', '分公司', '项目', '网格', '工队', '持有人', '持有人电话', '机器码', '状态', '操作'].map((h, index) => (
                <th key={h} className={`px-4 py-3 text-xs font-semibold text-slate-300 ${index === 11 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {loading && <tr><td colSpan={12} className="px-4 py-6 text-center text-slate-400">加载中...</td></tr>}
            {!loading && filteredData.length === 0 && <tr><td colSpan={12} className="px-4 py-6 text-center text-slate-400">暂无数据</td></tr>}
            {filteredData.map(({ device, companyName, projectName, gridName, teamName, machineCode, typeLabel }) => (
              <tr key={device.device_id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 text-slate-300">{device.name}</td>
                <td className="px-4 py-3 text-slate-300 font-mono text-xs">{device.device_id}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">{typeLabel}</span></td>
                <td className="px-4 py-3 text-slate-300">{companyName || '-'}</td>
                <td className="px-4 py-3 text-slate-300">{projectName || '-'}</td>
                <td className="px-4 py-3 text-slate-300">{gridName || '-'}</td>
                <td className="px-4 py-3 text-slate-300">{teamName || '-'}</td>
                <td className="px-4 py-3 text-slate-300">{device.holder || '-'}</td>
                <td className="px-4 py-3 text-slate-300">{device.holderPhone || '-'}</td>
                <td className="px-4 py-3 text-slate-300 font-mono text-xs">{machineCode || '-'}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(device.status)}`}>{getStatusText(device.status)}</span></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canEditDevice && <button onClick={() => openEditModal(device)} className="p-1 hover:bg-cyan-500/20 rounded text-cyan-400"><Edit2 size={16} /></button>}
                    {canDeleteDevice && <button onClick={() => deleteDevice(device.device_id)} className="p-1 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={16} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && createPortal(
        <div className="fixed inset-0 z-[1000] overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="mx-auto my-4 max-h-[calc(100vh-32px)] w-full max-w-[620px] overflow-auto rounded-lg border border-cyan-300/30 bg-slate-900 p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-100">{editingDeviceId ? '编辑定位装置' : '添加定位装置'}</h3>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelClass}>设备名称 *</label><input type="text" value={formData.name} onChange={(e) => updateForm({ name: e.target.value })} className={inputClass} /></div>
                <div><label className={labelClass}>设备ID *</label><input type="text" disabled={!!editingDeviceId} value={formData.device_id} onChange={(e) => updateForm({ device_id: e.target.value })} className={`${inputClass} font-mono`} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelClass}>设备类型</label><select value={formData.type || 'uwb_band'} onChange={(e) => updateForm({ type: e.target.value })} className={inputClass}><option value="rtk">RTK</option><option value="uwb">UWB</option><option value="gps_tag">GPS工牌</option><option value="gps_band">GPS手环</option><option value="smart_helmet">智能安全帽</option><option value="uwb_band">UWB手环</option><option value="uwb_badge">UWB工牌</option><option value="rtk_band">RTK手环</option><option value="rtk_badge">RTK工牌</option><option value="wifi">Wi-Fi定位</option></select></div>
                <div><label className={labelClass}>设备用途</label><input type="text" value={formData.install_location || ''} onChange={(e) => updateForm({ install_location: e.target.value })} placeholder="如：定位基站、流动站" className={inputClass} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>所属分公司 *</label>
                  <select value={selectValue(branchSelectOptions, formData.branch_id, formData.company)} onChange={(e) => chooseBranch(e.target.value)} className={inputClass}>
                    <option value="">请选择分公司</option>
                    {branchSelectOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>所属项目 *</label>
                  <select value={selectValue(projectSelectOptions, formData.project_id, formData.project)} onChange={(e) => chooseProject(e.target.value)} className={inputClass}>
                    <option value="">请选择项目</option>
                    {projectSelectOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>网格</label>
                  <select value={selectValue(gridSelectOptions, formData.grid_id, formData.grid)} onChange={(e) => chooseGrid(e.target.value)} className={inputClass}>
                    <option value="">请选择网格</option>
                    {gridSelectOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>所属工队</label>
                  <select value={selectValue(teamSelectOptions, formData.team_id, formData.team)} onChange={(e) => chooseTeam(e.target.value)} className={inputClass}>
                    <option value="">请选择工队</option>
                    {teamSelectOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className={labelClass}>持有人</label><input type="text" value={formData.holder} onChange={(e) => updateForm({ holder: e.target.value })} className={inputClass} /></div>
                <div><label className={labelClass}>持有人电话</label><input type="tel" value={formData.holderPhone || ''} onChange={(e) => updateForm({ holderPhone: e.target.value })} className={inputClass} /></div>
                <div><label className={labelClass}>状态</label><select value={formData.status} onChange={(e) => updateForm({ status: e.target.value as DeviceStatus })} className={inputClass}><option value="online">在线</option><option value="offline">离线</option><option value="fault">故障</option></select></div>
              </div>
              <div><label className={labelClass}>唯一机器码(phone_num) *</label><input type="text" value={formData.phone_num || ''} onChange={(e) => updateForm({ phone_num: e.target.value })} className={`${inputClass} font-mono`} /></div>
              <div><label className={labelClass}>备注</label><textarea rows={2} value={formData.remark || ''} onChange={(e) => updateForm({ remark: e.target.value })} className={inputClass} /></div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={saveDevice} className="flex-1 bg-cyan-500 hover:bg-cyan-400 py-2 rounded text-sm font-bold text-slate-900">保存</button>
              <button onClick={() => { setShowModal(false); setEditingDeviceId(null); }} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded text-sm text-slate-100">取消</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showUploadModal && createPortal(
        <div className="fixed inset-0 z-[1000] overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="mx-auto my-4 max-h-[calc(100vh-32px)] w-full max-w-[800px] overflow-hidden rounded-lg border border-cyan-300/30 bg-slate-900 p-6 shadow-2xl flex flex-col">
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
                    <thead className="sticky top-0 bg-slate-900"><tr>{['设备名称', '设备ID', '唯一机器码', '类型/用途', '状态'].map(h => <th key={h} className="text-left py-2">{h}</th>)}</tr></thead>
                    <tbody>
                      {uploadPreview.map((item, idx) => (
                        <tr key={idx} className={!item.isValid ? 'bg-red-500/10' : ''}>
                          <td className="py-1">{item.name || '-'}</td>
                          <td className="py-1">{item.device_id || '-'}</td>
                          <td className="py-1">{getMachineCode(item) || '-'}</td>
                          <td className="py-1">{getDeviceTypeLabel(item)}</td>
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
        </div>,
        document.body
      )}
    </div>
  );
}

