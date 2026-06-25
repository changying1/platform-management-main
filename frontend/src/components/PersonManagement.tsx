﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import React, { useEffect, useState } from 'react';
import { Search, Plus, Edit2, Trash2, X, Save, Loader, Users, Camera, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getAuthHeaders, withAuthTokenParam } from '../api/config';
import { hasStoredPermission } from '../utils/permissions';

interface Person {
  avatar?: string;
  faceFile?: File | null;
  id: string;
  name: string;
  employeeId: string;
  idCard?: string;
  workType?: string;
  workTeam?: string;
  team?: string;
  phone: string;
  entryDate?: string;
  status: 'employed' | 'on_leave' | 'resigned' | 'active' | 'inactive';
  emergencyContact?: string;
  company?: string;
  branchId?: string;
  projectId?: string;
  gridId?: string;
  teamId?: string;
  isResponsibilityPerson?: boolean;
  responsibilityLevel?: string;
  project?: string;
  role?: string;
  loginUsername?: string;
  loginPassword?: string;
  permissionLevel?: string;
  gridRole?: string;
  gridIds?: string[];
  responsibilityUnitId?: string;
}

const workerRoles = new Set(['Worker', 'worker', '工人', '作业人员', '普通员工']);

const roleOptions = [
  { value: 'Worker', label: '工人' },
  { value: 'HQ Manager', label: '总部管理员' },
  { value: 'Branch Admin', label: '分公司管理员' },
  { value: 'Project Manager', label: '项目管理员' },
  { value: 'Grid Admin', label: '网格管理员' },
  { value: 'Safety Officer', label: '安全员' },
  { value: 'Team Admin', label: '工队管理员' },
];

const permissionOptions = [
  { value: 'headquarters_admin', label: '总部管理员' },
  { value: 'branch_admin', label: '分公司管理员' },
  { value: 'project_safety_admin', label: '项目管理员' },
  { value: 'grid_admin', label: '网格管理员' },
  { value: 'team_admin', label: '工队管理员' },
];

const defaultPermissionByRole: Record<string, string> = {
  'HQ Manager': 'headquarters_admin',
  'Branch Admin': 'branch_admin',
  'Project Manager': 'project_safety_admin',
  'Grid Admin': 'grid_admin',
  'Safety Officer': 'project_safety_admin',
  'Team Admin': 'team_admin',
};

const validateManagementScope = (item: Person): string | null => {
  if (workerRoles.has(item.role || 'Worker')) return null;
  const level = item.permissionLevel || defaultPermissionByRole[item.role || ''] || 'project_safety_admin';
  const company = (item.company || '').trim();
  const project = (item.project || '').trim();
  const workTeam = (item.workTeam || '').trim();
  const team = (item.team || '').trim();

  if (level === 'headquarters_admin') return null;
  if (level === 'branch_admin' && !company) {
    return '分公司管理员必须绑定分公司';
  }
  if (level === 'project_safety_admin') {
    if (!company) return '项目级管理员必须绑定分公司';
    if (!project) return '项目级管理员必须绑定项目';
  }
  if (level === 'grid_admin') {
    if (!company) return '网格管理员必须绑定分公司';
    if (!project) return '网格管理员必须绑定项目';
    if (!item.gridId) return '网格管理员必须绑定网格';
  }
  if (level === 'team_admin') {
    if (!company) return '工队管理员必须绑定分公司';
    if (!project) return '工队管理员必须绑定项目';
    if (!workTeam && !team) return '工队管理员必须绑定工队或班组';
  }
  return null;
};

const permissionRank: Record<string, number> = {
  team_admin: 1,
  grid_admin: 2,
  project_safety_admin: 3,
  branch_admin: 4,
  headquarters_admin: 5,
};

const getCurrentPermissionLevel = () => {
  const level = localStorage.getItem('permission_level');
  if (level && permissionRank[level]) return level;
  try {
    const auth = JSON.parse(localStorage.getItem('auth') || '{}');
    if (auth?.permission_level && permissionRank[auth.permission_level]) {
      return auth.permission_level;
    }
  } catch {
    // Ignore invalid stored auth.
  }
  return 'headquarters_admin';
};

const canAssignPermission = (level: string) =>
  permissionRank[level] <= permissionRank[getCurrentPermissionLevel()];

const isManagerPerson = (person: Person) => {
  const level = person.permissionLevel || defaultPermissionByRole[person.role || ''] || '';
  return Boolean(person.isResponsibilityPerson || (level && level !== 'headquarters_admin' ? !workerRoles.has(person.role || 'Worker') || level !== '' : level === 'headquarters_admin'));
};

const firstAssignableManagerRole = () => {
  const preferredRoles = ['Branch Admin', 'Project Manager', 'Grid Admin', 'Team Admin', 'Safety Officer', 'HQ Manager'];
  return preferredRoles.find(role => canAssignPermission(defaultPermissionByRole[role] || 'team_admin')) || 'Project Manager';
};

const buildAuthHeaders = (json = true) => {
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    'X-Role': localStorage.getItem('role') || '',
    'X-Department-Id': localStorage.getItem('department_id') || '',
    'X-Username': localStorage.getItem('username') || '',
    'X-Permission-Level': localStorage.getItem('permission_level') || getCurrentPermissionLevel(),
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
};

// 璇︽儏淇℃伅灞曠ず缁勪欢
const InfoItem = ({ label, value }: { label: string; value?: string }) => (
  <div>
    <p className="text-xs text-slate-400 mb-1">{label}</p>
    <p className="text-sm text-slate-200">{value || '-'}</p>
  </div>
);

// 鉁?鍐呯綉绌块€忔櫤鑳介€傞厤锛?
const detectBackendUrl = (): string => {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  const isLocalViteDevServer =
    import.meta.env.DEV &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
    window.location.port !== '' &&
    window.location.port !== '9000';
  const isViteDevPort = import.meta.env.DEV && /^30\d\d$/.test(window.location.port);
  if (isLocalViteDevServer || isViteDevPort) return '';
  return `${window.location.protocol}//${window.location.host}`;
};
const API_BASE = detectBackendUrl();

interface BranchOption { id: number | string; name: string }
interface ProjectOption { id: number | string; name: string; branch_id?: number | string; branch_name?: string }
interface GridOption { id?: string; grid_id: string; name: string; project_id?: string | number }
interface TeamOption { team_id: string; name: string; project_id?: string; project?: string; grid_id?: string; company?: string }

const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzBmYTdhYyIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE4IiBmaWxsPSIjZmZmZmZmIi8+PGNpcmNsZSBjeD0iNTAiIGN5PSI4NSIgcj0iMzAiIGZpbGw9IiNmZmZmZmYiLz48L3N2Zz4=';
const personStatusOptions = [
  { value: 'employed', label: '在职' },
  { value: 'on_leave', label: '休假' },
  { value: 'resigned', label: '离职' },
] as const;
const normalizePersonStatus = (status?: string) => {
  if (status === 'active') return 'employed';
  if (status === 'inactive') return 'resigned';
  if (status === 'on_leave' || status === 'resigned') return status;
  return 'employed';
};
const personStatusLabel = (status?: string) => {
  const normalized = normalizePersonStatus(status);
  return personStatusOptions.find(option => option.value === normalized)?.label || '在职';
};

const getImageUrl = (url: string | undefined | null): string => {
  if (!url || url === '') return DEFAULT_AVATAR;
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('/')) return withAuthTokenParam(`${API_BASE}${url}`);
  return withAuthTokenParam(`${API_BASE}/static/faces/${url}`);
};

const mapApiToPerson = (item: any): Person => ({
  id: item.id,
  name: item.username || item.name || '',
  employeeId: item.employeeId || '',
  idCard: item.idCard || '',
  workType: item.workType || '',
  workTeam: item.workTeam || '',
  team: item.team || '',
  phone: item.phone || '',
  entryDate: item.entryDate || item.addedDate || '',
  status: normalizePersonStatus(item.status),
  emergencyContact: item.emergencyContact || '',
  company: item.company || '',
  branchId: item.branchId || item.branch_id || '',
  projectId: item.projectId || item.project_id || '',
  gridId: item.gridId || item.grid_id || '',
  teamId: item.teamId || item.team_id || '',
  isResponsibilityPerson: Boolean(item.isResponsibilityPerson || item.is_responsibility_person),
  responsibilityLevel: item.responsibilityLevel || item.responsibility_level || '',
  project: item.project || '',
  avatar: item.faceImage || item.avatar || '',
  role: item.role || 'Worker',
  loginUsername: item.loginUsername || '',
  permissionLevel: item.permissionLevel || '',
  gridRole: item.gridRole || '',
  gridIds: Array.isArray(item.gridIds) ? item.gridIds : [],
  responsibilityUnitId: item.responsibilityUnitId || '',
});

export default function PersonManagement() {
  const [showDetailModal, setShowDetailModal] = useState(false);  // 璇︽儏寮圭獥鏄剧ず
const SQL_PERSONNEL: Person[] = [
  { id: '1', name: '张建国', employeeId: 'HQ-ADMIN-001', phone: '13900000001', workType: '管理人员', workTeam: '总公司', company: '总公司', project: '总部', status: 'active', entryDate: '2024-01-01' },
  { id: '2', name: '王振国', employeeId: 'BR-ADMIN-001', phone: '13900001001', workType: '管理人员', workTeam: '第一分公司', company: '第一分公司', project: '西安东站', status: 'active', entryDate: '2024-01-01' },
  { id: '3', name: '李志远', employeeId: 'BR-ADMIN-002', phone: '13900001002', workType: '管理人员', workTeam: '第二分公司', company: '第二分公司', project: '西安地铁8号线', status: 'active', entryDate: '2024-01-01' },
  { id: '4', name: '陈明德', employeeId: 'BR-ADMIN-003', phone: '13900001003', workType: '管理人员', workTeam: '第三分公司', company: '第三分公司', project: '咸阳机场', status: 'active', entryDate: '2024-01-01' },
  { id: '5', name: '刘伟强', employeeId: 'BR-ADMIN-004', phone: '13900001004', workType: '管理人员', workTeam: '第四分公司', company: '第四分公司', project: '北京地铁17号线', status: 'active', entryDate: '2024-01-01' },
  { id: '6', name: '李明', employeeId: 'PJ-ADMIN-001', phone: '13900002001', workType: '安全管理员', workTeam: '土建工队', company: '默认分公司', project: '默认项目', status: 'active', entryDate: '2024-02-01' },
  { id: '7', name: '王磊', employeeId: 'PJ-ADMIN-002', phone: '13900002002', workType: '安全管理员', workTeam: '机电工队', company: '默认分公司', project: '默认项目', status: 'active', entryDate: '2024-02-01' },
  { id: '8', name: '张伟', employeeId: 'XA-WK-001', phone: '13800101001', workType: '土建工', workTeam: '土建工队', company: '默认分公司', project: '默认项目', team: '木工班', status: 'active', entryDate: '2024-02-15' },
  { id: '9', name: '王强', employeeId: 'XA-WK-002', phone: '13800101002', workType: '土建工', workTeam: '土建工队', company: '默认分公司', project: '默认项目', team: '钢筋班', status: 'active', entryDate: '2024-02-15' },
  { id: '10', name: '李磊', employeeId: 'XA-WK-003', phone: '13800101003', workType: '土建工', workTeam: '土建工队', company: '默认分公司', project: '默认项目', team: '混凝土班', status: 'active', entryDate: '2024-02-15' },
  { id: '11', name: '赵勇', employeeId: 'XA-WK-004', phone: '13800101004', workType: '架子工', workTeam: '土建工队', company: '默认分公司', project: '默认项目', team: '架子班', status: 'active', entryDate: '2024-02-15' },
  { id: '12', name: '刘杰', employeeId: 'XA-WK-005', phone: '13800101005', workType: '电工', workTeam: '机电工队', company: '默认分公司', project: '默认项目', team: '电工班', status: 'active', entryDate: '2024-02-15' },
  { id: '13', name: '陈涛', employeeId: 'XA-WK-006', phone: '13800101006', workType: '焊工', workTeam: '机电工队', company: '默认分公司', project: '默认项目', team: '焊工班', status: 'active', entryDate: '2024-02-15' },
  { id: '14', name: '周明', employeeId: 'XA-WK-007', phone: '13800101007', workType: '起重工', workTeam: '起重工队', company: '默认分公司', project: '默认项目', team: '起重班', status: 'active', entryDate: '2024-02-15' },
  { id: '15', name: '吴刚', employeeId: 'XA-WK-008', phone: '13800101008', workType: '信号工', workTeam: '信号工队', company: '默认分公司', project: '默认项目', team: '信号班', status: 'active', entryDate: '2024-02-15' },
  { id: '16', name: '郑伟', employeeId: 'XA-WK-009', phone: '13800101009', workType: '测量工', workTeam: '测量工队', company: '默认分公司', project: '默认项目', team: '测量班', status: 'active', entryDate: '2024-02-15' },
  { id: '17', name: '孙鹏', employeeId: 'XA-WK-010', phone: '13800101010', workType: '试验工', workTeam: '试验室', company: '默认分公司', project: '默认项目', team: '试验班', status: 'active', entryDate: '2024-02-15' },
  { id: '18', name: '刘木匠', employeeId: 'XA-WK-011', phone: '13800101011', workType: '木工', workTeam: '土建工队', company: '默认分公司', project: '默认项目', team: '木工班', status: 'active', entryDate: '2024-02-20' },
  { id: '19', name: '陈木匠', employeeId: 'XA-WK-012', phone: '13800101012', workType: '木工', workTeam: '土建工队', company: '默认分公司', project: '默认项目', team: '木工班', status: 'active', entryDate: '2024-02-20' },
  { id: '20', name: '王木匠', employeeId: 'XA-WK-013', phone: '13800101013', workType: '木工', workTeam: '土建工队', company: '默认分公司', project: '默认项目', team: '木工班', status: 'active', entryDate: '2024-02-20' },
  { id: '21', name: '张电工', employeeId: 'XA-WK-020', phone: '13800101020', workType: '电工', workTeam: '机电工队', company: '默认分公司', project: '默认项目', team: '电工班', status: 'active', entryDate: '2024-03-01' },
  { id: '22', name: '刘架子', employeeId: 'XA-WK-023', phone: '13800101023', workType: '架子工', workTeam: '土建工队', company: '默认分公司', project: '默认项目', team: '架子班', status: 'active', entryDate: '2024-03-05' },
  { id: '23', name: '张焊工', employeeId: 'XA-WK-026', phone: '13800101026', workType: '焊工', workTeam: '机电工队', company: '默认分公司', project: '默认项目', team: '焊工班', status: 'active', entryDate: '2024-03-10' },
  { id: '24', name: '王信号', employeeId: 'XA-WK-032', phone: '13800101032', workType: '信号工', workTeam: '信号工队', company: '默认分公司', project: '默认项目', team: '信号班', status: 'active', entryDate: '2024-03-20' },
  { id: '25', name: '郭铁柱', employeeId: 'XA-WK-041', phone: '13800101041', workType: '钢筋工', workTeam: '土建工队', company: '默认分公司', project: '默认项目', team: '钢筋班', status: 'active', entryDate: '2024-02-16' },
  { id: '26', name: '唐铁牛', employeeId: 'XA-WK-042', phone: '13800101042', workType: '钢筋工', workTeam: '土建工队', company: '默认分公司', project: '默认项目', team: '钢筋班', status: 'active', entryDate: '2024-02-16' },
];

const [viewingPerson, setViewingPerson] = useState<Person | null>(null);
const [persons, setPersons] = useState<Person[]>(SQL_PERSONNEL);

  const [searchTerm, setSearchTerm] = useState('');
const [filterCompany, setFilterCompany] = useState<string>('all');
const [filterProject, setFilterProject] = useState<string>('all');
const [filterWorkTeam, setFilterWorkTeam] = useState<string>('all');
const [filterWorkType, setFilterWorkType] = useState<string>('all');
const [filterTeam, setFilterTeam] = useState<string>('all');
const [personView, setPersonView] = useState<'general' | 'manager'>('general');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Person | null>(null);
  const [loading, setLoading] = useState(false);
const [showUploadModal, setShowUploadModal] = useState(false);
const [uploadData, setUploadData] = useState<any[]>([]);
const [uploadPreview, setUploadPreview] = useState<any[]>([]);
const canCreatePersonnel = hasStoredPermission('personnel.create');
const canEditPersonnel = hasStoredPermission('personnel.edit');
const canDeletePersonnel = hasStoredPermission('personnel.delete');
const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
const [gridOptions, setGridOptions] = useState<GridOption[]>([]);
const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);

const fetchPersons = async () => {
  try {
    setLoading(true);
    const res = await fetch(`${API_BASE}/api/personnel/`, {
      headers: buildAuthHeaders(false),
    });
    if (res.ok) {
      const data = await res.json();
      const apiData = Array.isArray(data) ? data : data.value || data.data || [];
      if (apiData.length > 1) {
        setPersons(apiData.map(mapApiToPerson));
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  fetchPersons();
  const loadOrgOptions = async () => {
    try {
      const [branchRes, projectRes, gridRes, teamRes] = await Promise.all([
        fetch(`${API_BASE}/api/dashboard/branches`, { headers: buildAuthHeaders(false) }),
        fetch(`${API_BASE}/projects/`, { headers: buildAuthHeaders(false) }),
        fetch(`${API_BASE}/api/grids/`, { headers: buildAuthHeaders(false) }),
        fetch(`${API_BASE}/team/list`, { headers: buildAuthHeaders(false) }),
      ]);
      const branches = branchRes.ok ? await branchRes.json() : [];
      const projectsData = projectRes.ok ? await projectRes.json() : [];
      const gridsData = gridRes.ok ? await gridRes.json() : [];
      const teamsData = teamRes.ok ? await teamRes.json() : [];
      setBranchOptions(Array.isArray(branches) ? branches : []);
      setProjectOptions(Array.isArray(projectsData) ? projectsData : []);
      setGridOptions(Array.isArray(gridsData) ? gridsData : []);
      setTeamOptions(Array.isArray(teamsData) ? teamsData : []);
    } catch (error) {
      console.error('鍔犺浇缁勭粐褰掑睘閫夐」澶辫触:', error);
    }
  };
  loadOrgOptions();
}, []);


const managerCount = persons.filter(isManagerPerson).length;
const generalCount = persons.length - managerCount;
const viewPersons = persons.filter(person => personView === 'manager' ? isManagerPerson(person) : !isManagerPerson(person));

// 鑾峰彇鎵€鏈夊敮涓€鐨勫垎鍏徃
const companies = ['all', ...new Set(viewPersons.map(p => p.company).filter(Boolean))];
// 鑾峰彇鎵€鏈夊敮涓€鐨勯」鐩?
const projects = ['all', ...new Set(viewPersons.map(p => p.project).filter(Boolean))];
// 鑾峰彇鎵€鏈夊敮涓€鐨勫伐闃?
const workTeams = ['all', ...new Set(viewPersons.map(p => p.workTeam).filter(Boolean))];
// 鑾峰彇鎵€鏈夊敮涓€鐨勫伐绉?
const workTypes = ['all', ...new Set(viewPersons.map(p => p.workType).filter(Boolean))];
// 鑾峰彇鎵€鏈夊敮涓€鐨勭彮缁?
const teams = ['all', ...new Set(viewPersons.map(p => p.team).filter(Boolean))];

const selectedProjectOptions = projectOptions.filter(project =>
  !editingItem?.branchId || String(project.branch_id || '') === String(editingItem.branchId)
);
const selectedGridOptions = gridOptions.filter(grid =>
  !editingItem?.projectId || String(grid.project_id || '') === String(editingItem.projectId)
);
const selectedTeamOptions = teamOptions.filter(team =>
  (!editingItem?.projectId || String(team.project_id || '') === String(editingItem.projectId) || team.project === editingItem.project) &&
  (!editingItem?.gridId || String(team.grid_id || '') === String(editingItem.gridId))
);
const responsibilityTargetLevel = editingItem?.teamId
  ? 'team'
  : editingItem?.gridId
    ? 'grid'
    : editingItem?.projectId
      ? 'project'
      : editingItem?.branchId
        ? 'branch'
        : '';
const responsibilityTargetName = {
  branch: '分公司',
  project: '项目',
  grid: '网格',
  team: '工队',
}[responsibilityTargetLevel] || '';

// 绛涢€夋暟鎹?
const filteredData = viewPersons.filter(p => {
  // 妯＄硦鎼滅储锛堝鍚嶃€佸伐鍙枫€佽韩浠借瘉鍙枫€佺數璇濓級
  const matchesSearch = searchTerm === '' || 
    p.name.includes(searchTerm) || 
    p.employeeId.includes(searchTerm) ||
    p.workTeam?.includes(searchTerm) ||
    p.idCard?.includes(searchTerm) ||
    p.phone.includes(searchTerm);
  
  // 鍒嗙被绛涢€?
  const matchesCompany = filterCompany === 'all' || p.company === filterCompany;
  const matchesProject = filterProject === 'all' || p.project === filterProject;
  const matchesWorkTeam = filterWorkTeam === 'all' || p.workTeam === filterWorkTeam;
  const matchesWorkType = filterWorkType === 'all' || p.workType === filterWorkType;
  const matchesTeam = filterTeam === 'all' || p.team === filterTeam;
  
  return matchesSearch && matchesCompany && matchesProject && matchesWorkTeam && matchesWorkType && matchesTeam;
});

// 涓嬭浇Excel妯℃澘
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
// 瑙ｆ瀽Excel鏂囦欢
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target?.result as ArrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
    
    // 璺宠繃琛ㄥご锛屼粠绗?琛屽紑濮?
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
  status: 'employed' as const,
  isValid: true,
  errorMsg: ''
}));
    
    // 楠岃瘉鏁版嵁
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

// 纭瀵煎叆
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
    
{/* 鎿嶄綔鏍?*/}
<div className="flex items-center gap-3 mb-4 flex-wrap">
  {/* 鎼滅储妗?*/}
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
  
  <div className="flex rounded-lg border border-slate-700 bg-slate-800/50 p-0.5">
    {[
      { value: 'general' as const, label: '一般人员', count: generalCount },
      { value: 'manager' as const, label: '管理人员', count: managerCount },
    ].map(option => (
      <button
        key={option.value}
        type="button"
        onClick={() => {
          setPersonView(option.value);
          setFilterCompany('all');
          setFilterProject('all');
          setFilterWorkTeam('all');
          setFilterWorkType('all');
          setFilterTeam('all');
        }}
        className={
          'px-3 py-1.5 text-sm rounded-md transition-colors ' +
          (personView === option.value
            ? 'bg-cyan-500/25 text-cyan-200'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50')
        }
      >
        {option.label} <span className="text-xs opacity-80">{option.count}</span>
      </button>
    ))}
  </div>

  {/* 绛涢€変笅鎷夋 */}
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
  
  {/* 重置鎸夐挳 */}
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
  
  {/* 鎸夐挳缁?*/}
  <div className="flex gap-2">
    {canCreatePersonnel && (
    <button
      onClick={() => setShowUploadModal(true)}
      className="px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-1 text-sm"
    >
      <Upload size={14} />
      批量导入
    </button>
    )}
    <button
      onClick={downloadTemplate}
      className="px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-1 text-sm"
    >
      <Download size={14} />
      下载模板
    </button>
    {canCreatePersonnel && (
    <button
      onClick={() => {
        const managerRole = personView === 'manager' ? firstAssignableManagerRole() : 'Worker';
        setEditingItem({
          id: '',
          name: '',
          employeeId: '',
          idCard: '',
          company: '',
          branchId: '',
          projectId: '',
          gridId: '',
          teamId: '',
          isResponsibilityPerson: false,
          responsibilityLevel: '',
          project: '',
          workType: '',
          workTeam: '',
          team: '',
          phone: '',
          entryDate: '',
          status: 'employed',
          emergencyContact: '',
          avatar: '',
          faceFile: null,
          role: managerRole,
          loginUsername: '',
          loginPassword: '',
          permissionLevel: defaultPermissionByRole[managerRole] || '',
          gridRole: '',
          gridIds: [],
          responsibilityUnitId: '',
        });
        setShowModal(true);
      }}
      className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-1 text-sm"
    >
      <Plus size={14} />
      {personView === 'manager' ? '添加管理人员' : '添加人员'}
    </button>
    )}
  </div>
</div>

{/* 筛选结果统计*/}
<div className="flex justify-between items-center mb-3">
  <p className="text-sm text-slate-400">
    {personView === 'manager' ? '管理人员' : '一般人员'}共 <span className="text-cyan-400 font-bold">{filteredData.length}</span> 条记录
    {(filterCompany !== 'all' || filterProject !== 'all' || filterWorkTeam !== 'all' || filterWorkType !== 'all' || filterTeam !== 'all' || searchTerm) && (
      <span className="ml-2 text-xs">（已筛选）</span>
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
          src={getImageUrl(person.avatar)}
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
      <td className="px-4 py-3 text-slate-300">{person.company || '-'}</td>
      <td className="px-4 py-3 text-slate-300">{person.project || '-'}</td>
      <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">{person.workTeam || '-'}</span></td>
      <td className="px-4 py-3 text-slate-300">{person.workType || '-'}</td>
      <td className="px-4 py-3 text-slate-300">{person.team || '-'}</td>
      <td className="px-4 py-3 text-slate-300">{person.entryDate || '-'}</td>
      <td className="px-4 py-3 text-slate-300">{person.phone}</td>
      <td className="px-4 py-3">
        <span
          className={
            'px-2 py-0.5 text-xs rounded-full border ' +
            (normalizePersonStatus(person.status) === 'employed'
              ? 'bg-green-500/20 text-green-400 border-green-500/30'
              : 'bg-slate-500/20 text-slate-400 border-slate-500/30')
          }
        >
          {personStatusLabel(person.status)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {canEditPersonnel && (
          <button 
            onClick={() => {
              setEditingItem(person);
              setShowModal(true);
            }}
            className="p-1 hover:bg-cyan-500/20 rounded text-cyan-400"
          >
            <Edit2 size={16} />
          </button>
          )}
          {canDeletePersonnel && (
          <button 
            onClick={async () => {
              if (!confirm('确定删除该人员吗？')) return;

              try {
                const res = await fetch(API_BASE + '/api/personnel/' + person.id, {
                  method: 'DELETE',
                  headers: buildAuthHeaders(false),
                });

                if (!res.ok) {
                  throw new Error('删除失败');
                }

                setPersons(persons.filter(p => p.id !== person.id));
              } catch (error) {
                console.error(error);
                alert('删除人员失败');
              }
            }}
            className="p-1 hover:bg-red-500/20 rounded text-red-400"
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
      </div>

{/* 添加/编辑弹窗 */}
{showModal && (
  <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[700px] p-6 shadow-2xl max-h-[90vh] overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-slate-100">
          {editingItem?.id ? '编辑人员信息' : '添加人员'}
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
              src={editingItem?.avatar || DEFAULT_AVATAR}
              className="w-20 h-20 rounded-full object-cover border-2 border-cyan-400/50"
              alt="头像"
            />
            <label 
              htmlFor="avatar-file-input"
              className="absolute bottom-0 right-0 p-1.5 bg-cyan-500 rounded-full hover:bg-cyan-400 cursor-pointer z-50"
            >
              <Camera size={12} className="text-white" />
            </label>
            <input
              id="avatar-file-input"
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const imageUrl = URL.createObjectURL(file);
                  setEditingItem({ ...editingItem!, avatar: imageUrl, faceFile: file });
                }
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* 基本信息*/}
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

<div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
  <div className="mb-3 text-sm font-semibold text-cyan-200">穿透式组织归属</div>
  <div className="grid grid-cols-4 gap-4">
    <div>
      <label className="block text-sm text-slate-400 mb-1">分公司</label>
      <select
        value={editingItem?.branchId || ''}
        onChange={(e) => {
          const branch = branchOptions.find(item => String(item.id) === e.target.value);
          setEditingItem({ ...editingItem!, branchId: e.target.value, company: branch?.name || '', projectId: '', project: '', gridId: '', teamId: '', workTeam: '', isResponsibilityPerson: false, responsibilityLevel: '' });
        }}
        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      >
        <option value="">请选择分公司</option>
        {branchOptions.map(branch => <option key={String(branch.id)} value={String(branch.id)}>{branch.name}</option>)}
      </select>
    </div>
    <div>
      <label className="block text-sm text-slate-400 mb-1">项目</label>
      <select
        value={editingItem?.projectId || ''}
        onChange={(e) => {
          const project = projectOptions.find(item => String(item.id) === e.target.value);
          setEditingItem({ ...editingItem!, projectId: e.target.value, project: project?.name || '', gridId: '', teamId: '', workTeam: '', isResponsibilityPerson: false, responsibilityLevel: '' });
        }}
        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      >
        <option value="">请选择项目</option>
        {selectedProjectOptions.map(project => <option key={String(project.id)} value={String(project.id)}>{project.name}</option>)}
      </select>
    </div>
    <div>
      <label className="block text-sm text-slate-400 mb-1">网格</label>
      <select
        value={editingItem?.gridId || ''}
        onChange={(e) => setEditingItem({ ...editingItem!, gridId: e.target.value, teamId: '', workTeam: '', isResponsibilityPerson: false, responsibilityLevel: '' })}
        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      >
        <option value="">不选择网格</option>
        {selectedGridOptions.map(grid => <option key={grid.grid_id || grid.id} value={grid.grid_id || grid.id}>{grid.name}</option>)}
      </select>
    </div>
    <div>
      <label className="block text-sm text-slate-400 mb-1">工队</label>
      <select
        value={editingItem?.teamId || ''}
        onChange={(e) => {
          const team = teamOptions.find(item => item.team_id === e.target.value);
          setEditingItem({ ...editingItem!, teamId: e.target.value, workTeam: team?.name || '', isResponsibilityPerson: false, responsibilityLevel: '' });
        }}
        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      >
        <option value="">不属于工队</option>
        {selectedTeamOptions.map(team => <option key={team.team_id} value={team.team_id}>{team.name}</option>)}
      </select>
    </div>
  </div>
  <div className="mt-3 grid grid-cols-2 gap-4">
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
  </div>
  {responsibilityTargetLevel && !editingItem?.teamId && (
    <label className="mt-3 flex items-center gap-2 text-sm text-cyan-100">
      <input
        type="checkbox"
        checked={Boolean(editingItem?.isResponsibilityPerson)}
        onChange={(e) => setEditingItem({ ...editingItem!, isResponsibilityPerson: e.target.checked, responsibilityLevel: e.target.checked ? responsibilityTargetLevel : '' })}
        className="h-4 w-4 accent-cyan-500"
      />
      是否为{responsibilityTargetName}责任人员
    </label>
  )}
  <div className="mt-3 grid grid-cols-4 gap-4">
    <div>
      <label className="block text-sm text-slate-400 mb-1">身份</label>
      <select
        value={editingItem?.role || 'Worker'}
        onChange={(e) => {
          const nextRole = e.target.value;
          setEditingItem({
            ...editingItem!,
            role: nextRole,
            permissionLevel: workerRoles.has(nextRole) ? '' : defaultPermissionByRole[nextRole] || 'project_safety_admin',
          });
        }}
        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      >
        {roleOptions
          .filter(option => option.value === 'Worker' || canAssignPermission(defaultPermissionByRole[option.value] || 'team_admin'))
          .map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
      </select>
    </div>
    <div>
      <label className="block text-sm text-slate-400 mb-1">权限等级</label>
      <div className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 min-h-[38px]">
        {editingItem?.isResponsibilityPerson
          ? responsibilityTargetLevel === 'branch'
            ? '分公司管理员'
            : responsibilityTargetLevel === 'grid'
              ? '网格管理员'
            : responsibilityTargetLevel === 'team'
              ? '工队管理员'
              : '项目安全管理员'
          : '作业人员'}
      </div>
    </div>
    {(!workerRoles.has(editingItem?.role || 'Worker') || Boolean(editingItem?.isResponsibilityPerson)) && (
      <>
        <div>
          <label className="block text-sm text-slate-400 mb-1">登录账号 <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={editingItem?.loginUsername || ''}
            onChange={(e) => setEditingItem({ ...editingItem!, loginUsername: e.target.value })}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            placeholder="用于系统登录"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">登录密码 <span className="text-red-400">*</span></label>
          <input
            type="password"
            value={editingItem?.loginPassword || ''}
            onChange={(e) => setEditingItem({ ...editingItem!, loginPassword: e.target.value })}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            placeholder={editingItem?.id ? '留空则不修改' : '请输入登录密码'}
          />
        </div>
      </>
    )}
  </div>
</div>

<div className="hidden">
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
      value={normalizePersonStatus(editingItem?.status)}
      onChange={(e) => setEditingItem({ ...editingItem!, status: e.target.value as Person['status'] })}
      className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
    >
      {personStatusOptions.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
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
          onClick={async () => {
            if (!editingItem?.name || !editingItem?.employeeId) {
              alert('请填写姓名和工号');
              return;
            }
            const responsibilityPermission = editingItem.isResponsibilityPerson
              ? responsibilityTargetLevel === 'branch'
                ? 'branch_admin'
                : responsibilityTargetLevel === 'grid'
                  ? 'grid_admin'
                : responsibilityTargetLevel === 'team'
                  ? 'team_admin'
                  : 'project_safety_admin'
              : '';
            const effectivePermissionLevel =
              responsibilityPermission
              || editingItem.permissionLevel
              || defaultPermissionByRole[editingItem.role || '']
              || '';
            const needsProjectScope = !['headquarters_admin', 'branch_admin'].includes(effectivePermissionLevel);

            if (!editingItem.branchId && effectivePermissionLevel !== 'headquarters_admin') {
              alert('请选择该人员所属的分公司');
              return;
            }
            if (needsProjectScope && !editingItem.projectId) {
              alert('请选择该人员所属的项目');
              return;
            }
            if (!editingItem.teamId && !editingItem.isResponsibilityPerson) {
              alert('未选择工队时，必须勾选对应层级责任人员');
              return;
            }
            const createsLoginAccount = !workerRoles.has(editingItem.role || 'Worker') || Boolean(editingItem.isResponsibilityPerson);
            if (createsLoginAccount && (!editingItem.loginUsername || (!editingItem.id && !editingItem.loginPassword))) {
              alert('管理/责任人员必须填写登录账号和登录密码');
              return;
            }

            const scopeError = validateManagementScope(editingItem);
            if (scopeError) {
              alert(scopeError);
              return;
            }

            try {
              setLoading(true);

              const payload = {
                username: editingItem.name,
                dept: editingItem.workTeam || editingItem.company || '',
                phone: editingItem.phone || '',
                role: editingItem.isResponsibilityPerson && workerRoles.has(editingItem.role || 'Worker') ? 'Safety Officer' : (editingItem.role || 'Worker'),
                parentId: null,
                loginUsername: editingItem.loginUsername || '',
                loginPassword: editingItem.loginPassword || '',
                permissionLevel: responsibilityPermission || editingItem.permissionLevel || defaultPermissionByRole[editingItem.role || ''] || '',

                employeeId: editingItem.employeeId,
                idCard: editingItem.idCard || '',
                company: editingItem.company || '',
                branchId: editingItem.branchId || '',
                projectId: editingItem.projectId || '',
                gridId: editingItem.gridId || '',
                teamId: editingItem.teamId || '',
                isResponsibilityPerson: Boolean(editingItem.isResponsibilityPerson),
                responsibilityLevel: editingItem.isResponsibilityPerson ? (editingItem.responsibilityLevel || responsibilityTargetLevel) : '',
                project: editingItem.project || '',
                workType: editingItem.workType || '',
                workTeam: editingItem.workTeam || '',
                team: editingItem.team || '',
                gridRole: editingItem.gridRole || '',
                gridIds: editingItem.gridIds || [],
                responsibilityUnitId: editingItem.responsibilityUnitId || '',
                entryDate: editingItem.entryDate || '',
                status: normalizePersonStatus(editingItem.status),
                emergencyContact: editingItem.emergencyContact || '',
              };

              let saved: any;

              if (editingItem.id) {
                const res = await fetch(API_BASE + '/api/personnel/' + editingItem.id, {
                  method: 'PUT',
                  headers: buildAuthHeaders(),
                  body: JSON.stringify(payload),
                });

                if (!res.ok) {
                  throw new Error('更新人员失败');
                }

                saved = await res.json();
              } else {
                const res = await fetch(API_BASE + '/api/personnel/', {
                  method: 'POST',
                  headers: buildAuthHeaders(),
                  body: JSON.stringify(payload),
                });

                if (!res.ok) {
                  throw new Error('新增人员失败');
                }

                saved = await res.json();
              }

              if (editingItem.faceFile) {
                const formData = new FormData();
                formData.append('file', editingItem.faceFile);

                const uploadRes = await fetch(API_BASE + '/api/personnel/' + saved.id + '/face', {
                  method: 'POST',
                  headers: buildAuthHeaders(false),
                  body: formData,
                });

                if (!uploadRes.ok) {
                  throw new Error('人员已保存，但头像上传失败');
                }

                saved = await uploadRes.json();
              }

              const savedPerson = mapApiToPerson(saved);

              setPersons(prev => {
                const exists = prev.some(p => p.id === savedPerson.id);
                if (exists) {
                  return prev.map(p => p.id === savedPerson.id ? savedPerson : p);
                }
                return [...prev, savedPerson];
              });

              setShowModal(false);
              setEditingItem(null);
            } catch (error) {
              console.error(error);
              alert(error instanceof Error ? error.message : '保存失败');
            } finally {
              setLoading(false);
            }
          }}
          className="flex-1 bg-cyan-500 hover:bg-cyan-400 py-2 rounded text-sm font-bold text-slate-900"
        >
          保存
        </button>
        {canEditPersonnel && (
        <button 
          onClick={() => {
            setShowModal(false);
            setEditingItem(null);
          }} 
          className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded text-sm text-slate-100"
        >
          取消
        </button>
        )}
      </div>
    </div>
  </div>
)}
      {/* 人员详情寮圭獥 */}
{showDetailModal && viewingPerson && (
  <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[600px] p-6 shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-slate-100">人员详情</h3>
        <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-200">
          <X size={20} />
        </button>
      </div>
      
      {/* 头像澶у浘 */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          <img 
            src={viewingPerson.avatar || DEFAULT_AVATAR}
            className="w-32 h-32 rounded-full object-cover border-4 border-cyan-400/50"
            alt={viewingPerson.name}
          />
          <label 
            htmlFor="detail-avatar-input"
            className="absolute bottom-0 right-0 p-1.5 bg-cyan-500 rounded-full hover:bg-cyan-400 cursor-pointer z-50"
          >
            <Camera size={16} className="text-white" />
          </label>
          <input
            id="detail-avatar-input"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                const imageUrl = URL.createObjectURL(file);
                const updatedPerson = { ...viewingPerson, avatar: imageUrl };
                setViewingPerson(updatedPerson);
                setPersons(persons.map(p => p.id === viewingPerson.id ? updatedPerson : p));
                try {
                  const formData = new FormData();
                  formData.append('file', file);
                  const uploadRes = await fetch(API_BASE + '/api/personnel/' + viewingPerson.id + '/face', {
                    method: 'POST',
                    headers: buildAuthHeaders(false),
                    body: formData,
                  });
                  if (!uploadRes.ok) throw new Error('头像上传失败');
                  const saved = mapApiToPerson(await uploadRes.json());
                  setViewingPerson(saved);
                  setPersons(prev => prev.map(p => p.id === saved.id ? saved : p));
                } catch (error) {
                  console.error(error);
                  alert(error instanceof Error ? error.message : '头像上传失败');
                  setViewingPerson(viewingPerson);
                  setPersons(prev => prev.map(p => p.id === viewingPerson.id ? viewingPerson : p));
                }
              }
              e.target.value = '';
            }}
          />
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
  <InfoItem label="状态" value={personStatusLabel(viewingPerson.status)} />
  <InfoItem label="紧急联系人" value={viewingPerson.emergencyContact} />
</div>
      
      <div className="flex gap-3">
        <button 
          onClick={() => {
            setEditingItem(viewingPerson);
            setShowDetailModal(false);
            setShowModal(true);
          }}
          className="flex-1 bg-cyan-500 hover:bg-cyan-400 py-2 rounded text-sm font-bold text-slate-900"
        >
          编辑信息
        </button>
        <button onClick={() => setShowDetailModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded text-sm text-slate-100">
          关闭
        </button>
      </div>
    </div>
  </div>
)}
{/* 批量导入寮圭獥 */}
{showUploadModal && (
  <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-[900px] p-6 shadow-2xl max-h-[90vh] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-100">批量导入人员</h3>
        <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-200">
          <X size={20} />
        </button>
      </div>
      
      <div className="border border-dashed border-cyan-400/50 rounded-lg p-6 text-center mb-4">
        <Upload size={32} className="mx-auto text-cyan-400 mb-2" />
        <p className="text-sm text-slate-400 mb-2">点击或拖拽上传 Excel 文件</p>
        <p className="text-xs text-slate-500">支持 .xlsx、.xls 格式</p>
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
              纭瀵煎叆
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
                    <td className="px-2 py-1 text-slate-300">{item.name || '-'}</td>
                    <td className="px-2 py-1 text-slate-300">{item.employeeId || '-'}</td>
                    <td className="px-2 py-1 text-slate-300">{item.idCard || '-'}</td>
                    <td className="px-2 py-1 text-slate-300">{item.workType || '-'}</td>
                    <td className="px-2 py-1 text-slate-300">{item.team || '-'}</td>
                    <td className="px-2 py-1 text-slate-300">{item.phone || '-'}</td>
                    <td className="px-2 py-1 text-slate-300">{item.entryDate || '-'}</td>
                    <td className="px-2 py-1">
                      {!item.isValid && (
                        <span className="text-xs text-red-400">{item.errorMsg}</span>
                      )}
                      {item.isValid && (
                        <span className="text-xs text-green-400">鉁?鏈夋晥</span>
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



