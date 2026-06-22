import React, { useState, useEffect, useRef } from 'react';
import { MenuKey } from '../types';
import { alarmApi, LogResponse } from '../src/api/alarmApi';
import { API_BASE_URL, getAuthHeaders } from '../src/api/config';
import { getStoredScopeState } from '../src/utils/authScope';
import { 
  FileText, 
  Search, 
  User, 
  Shield, 
  MapPin, 
  Video, 
  AlertTriangle,
  Settings,
  LogIn,
  X,
  ChevronDown,
  Check,
  Users,
  Building2,
  HardHat,
  Filter,
  Calendar,
  Download,
  ExternalLink,
  DatabaseBackup
} from 'lucide-react';

interface SystemLog {
  id: string | number;
  operator: string;
  action: string;
  targetType: 'fence' | 'project' | 'grid' | 'team' | 'device' | 'person' | 'alarm' | 'permission' | 'system' | 'login' | 'backup';
  targetName: string;
  details?: string;
  time: string;
  company?: string;
  project?: string;
  grid?: string;
  team?: string;
  extra?: Record<string, any>;
}

type OrgScopeOptions = {
  companies: string[];
  projects: string[];
  grids: string[];
  teams: string[];
};

type OrgNameLookup = Record<string, string>;
type SortDirection = 'asc' | 'desc';
type SystemLogSortField = 'type' | 'operator' | 'action' | 'targetName' | 'scope' | 'details' | 'time';
type SystemLogSortState = {
  field: SystemLogSortField;
  direction: SortDirection;
};

// 转换后端返回的数据格式
const transformLogResponse = (log: LogResponse): SystemLog => ({
  id: log.id,
  operator: log.operator,
  action: log.action,
  targetType: log.target_type as any,
  targetName: log.target_name,
  details: log.details,
  time: log.time,
  company: log.company,
  project: log.project,
  grid: log.grid,
  team: log.team,
  extra: log.extra
});

const actionIcons = {
  fence: <MapPin size={18} />,
  project: <FileText size={18} />,
  grid: <MapPin size={18} />,
  team: <Users size={18} />,
  device: <Video size={18} />,
  person: <User size={18} />,
  alarm: <AlertTriangle size={18} />,
  permission: <Shield size={18} />,
  system: <Settings size={18} />,
  login: <LogIn size={18} />,
  backup: <DatabaseBackup size={18} />,
};

const actionColors = {
  fence: 'bg-blue-500/20 text-blue-400',
  project: 'bg-cyan-500/20 text-cyan-400',
  grid: 'bg-teal-500/20 text-teal-400',
  team: 'bg-indigo-500/20 text-indigo-400',
  device: 'bg-green-500/20 text-green-400',
  person: 'bg-purple-500/20 text-purple-400',
  alarm: 'bg-orange-500/20 text-orange-400',
  permission: 'bg-red-500/20 text-red-400',
  system: 'bg-slate-500/20 text-slate-400',
  login: 'bg-emerald-500/20 text-emerald-400',
  backup: 'bg-yellow-500/20 text-yellow-400',
};



const typeLabels: Record<string, string> = {
  all: '全部',
  fence: '围栏',
  device: '设备',
  alarm: '告警',
  login: '登录',
  project: '项目',
  grid: '网格',
  team: '工队',
  person: '人员',
  permission: '权限',
  backup: '备份',
  system: '系统',
};

const HISTORICAL_FENCE_STORAGE_KEY = 'fence:historical-map-view';

const permissionLabelMap: Record<string, string> = {
  'dashboard.view': '查看仪表板',
  'monitor.playback': '监控回放',
  'monitor.track': '轨迹回放',
  'monitor.voice': '语音回放',
  'monitor.camera': '摄像头管理',
  'fence.view': '查看围栏',
  'fence.create': '创建围栏',
  'fence.edit': '编辑围栏',
  'fence.delete': '删除围栏',
  'device.view': '查看设备',
  'device.create': '添加设备',
  'device.edit': '编辑设备',
  'device.delete': '删除设备',
  'personnel.view': '查看人员',
  'personnel.create': '添加人员',
  'personnel.edit': '编辑人员',
  'personnel.delete': '删除人员',
  'alarm.view': '查看告警',
  'alarm.handle': '处理告警',
  'system.role': '权限管理',
  'system.log': '操作日志',
};

const fieldLabelMap: Record<string, string> = {
  permissions: '权限列表',
  role: '角色',
  name: '名称',
  username: '用户名',
  permissionLevel: '权限等级',
  permission_level: '权限等级',
  company: '所属公司',
  branch_id: '所属公司',
  project: '所属项目',
  project_id: '所属项目',
  projectName: '所属项目',
  grid: '所属网格',
  grid_id: '所属网格',
  team: '所属工队',
  team_id: '所属工队',
  parent_id: '上级单位',
  parent: '上级单位',
  parent_name: '上级单位',
  parentUnitName: '上级单位',
  parent_grid_name: '上级单位',
  parentGridName: '上级单位',
  id: '设备ID',
  device_id: '设备ID',
  device_name: '设备名称',
  device_serial: '设备序列号',
  serial_number: '序列号',
  device_code: '设备编码',
  phone_num: '机器码',
  holderPhone: '机器码',
  imei: 'IMEI',
  mac: 'MAC地址',
  device_type: '设备类型',
  type: '类型',
  platform_type: '平台类型',
  ip_address: 'IP地址',
  ip: 'IP地址',
  stream_url: '视频流地址',
  rtsp_url: 'RTSP地址',
  url: '地址',
  status: '状态',
  status_text: '状态',
  online_status: '在线状态',
  branch_name: '所属公司',
  project_name: '所属项目',
  grid_name: '所属网格',
  gridName: '所属网格',
  team_name: '所属工队',
  workTeam: '所属工队',
  work_team: '所属工队',
};

const relationNameFields: Record<string, string[]> = {
  branch_id: ['company', 'branch_name', 'branch', 'department'],
  project_id: ['project', 'project_name', 'projectName'],
  parent_id: ['parent_name', 'parent', 'parent_unit_name', 'parentUnitName', 'parent_grid_name', 'parentGridName'],
  grid_id: ['grid', 'grid_name', 'gridName', 'name'],
  team_id: ['team', 'team_name', 'teamName', 'workTeam', 'work_team'],
};

const lookupKey = (type: string, value: any) => `${type}:${String(value ?? '').trim()}`;

const permissionText = (value: unknown) => {
  if (!Array.isArray(value)) return '';
  const labels = value.map(item => permissionLabelMap[String(item)] || String(item));
  return labels.length ? labels.join('、') : '无';
};

const formatAuditValue = (value: any): string => {
  if (value === undefined || value === null || value === '') return '-';
  if (Array.isArray(value)) return permissionText(value) || value.map(item => String(item)).join('、');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const snapshotName = (snapshot: any, fields: string[] = []): string => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return '';
  for (const field of fields) {
    const text = firstText(snapshot[field]);
    if (text) return text;
  }
  return '';
};

const formatAuditChangeValue = (field: string, value: any, snapshot: any, orgNameLookup: OrgNameLookup = {}): string => {
  const name = snapshotName(snapshot, relationNameFields[field]);
  if (name) return name;
  const text = String(value ?? '').trim();
  if (text) {
    if (field === 'project_id' && orgNameLookup[lookupKey('project', text)]) return orgNameLookup[lookupKey('project', text)];
    if (field === 'parent_id' && orgNameLookup[lookupKey('unit', text)]) return orgNameLookup[lookupKey('unit', text)];
    if (field === 'branch_id' && orgNameLookup[lookupKey('branch', text)]) return orgNameLookup[lookupKey('branch', text)];
    if (field === 'grid_id' && orgNameLookup[lookupKey('grid', text)]) return orgNameLookup[lookupKey('grid', text)];
    if (field === 'team_id' && orgNameLookup[lookupKey('team', text)]) return orgNameLookup[lookupKey('team', text)];
  }
  return formatAuditValue(value);
};

const formatAuditChanges = (changes: any, before?: any, after?: any, orgNameLookup: OrgNameLookup = {}): string => {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return '';
  return Object.entries(changes)
    .map(([field, change]: [string, any]) => `${fieldLabelMap[field] || field}: ${formatAuditChangeValue(field, change?.old, before, orgNameLookup)} -> ${formatAuditChangeValue(field, change?.new, after, orgNameLookup)}`)
    .join('；');
};

const parseDetailsObject = (details?: string) => {
  const text = String(details || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Legacy logs can look like: permissions: ["a","b"].
  }

  const permissionMatch = text.match(/permissions\s*:\s*(\[[\s\S]*\])/i);
  if (permissionMatch) {
    try {
      return { permissions: JSON.parse(permissionMatch[1]) };
    } catch {
      return null;
    }
  }

  return null;
};

const formatRawLogDetails = (details?: string) => {
  const parsed = parseDetailsObject(details);
  if (!parsed || typeof parsed !== 'object') return firstText(details);
  const parts: string[] = [];

  Object.entries(parsed).forEach(([key, value]) => {
    const label = fieldLabelMap[key] || key;
    if (key === 'permissions') {
      parts.push(`${label}：${permissionText(value) || '无'}`);
    } else {
      parts.push(`${label}：${formatAuditValue(value)}`);
    }
  });

  return parts.join('；');
};

const firstText = (...values: any[]): string => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const changedText = (changes: any, ...fields: string[]): string => {
  if (!changes || typeof changes !== 'object') return '';
  for (const field of fields) {
    const item = changes[field];
    const text = firstText(item?.new, item?.old);
    if (text) return text;
  }
  return '';
};

const getLogScope = (log: SystemLog) => {
  const after = log.extra?.after || {};
  const before = log.extra?.before || {};
  const changes = log.extra?.changes || {};
  return {
    company: firstText(log.company, after.company, after.branch_name, after.department, before.company, before.branch_name, before.department, changedText(changes, 'company', 'branch_name', 'department')),
    project: firstText(log.project, after.project, after.project_name, before.project, before.project_name, changedText(changes, 'project', 'project_name')),
    grid: firstText(log.grid, after.grid, after.grid_name, after.gridName, after.grid_id, before.grid, before.grid_name, before.gridName, before.grid_id, changedText(changes, 'grid', 'grid_name', 'gridName', 'grid_id')),
    team: firstText(log.team, after.team, after.workTeam, after.work_team, before.team, before.workTeam, before.work_team, changedText(changes, 'team', 'workTeam', 'work_team')),
  };
};

const shortenText = (value: any, maxLength = 72): string => {
  const text = firstText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
};

const generateDeviceLogDetails = (log: SystemLog, orgNameLookup: OrgNameLookup = {}): string => {
  const extra = log.extra || {};
  const snapshot = extra.after || extra.before || extra;
  const changes = extra.changes || {};
  const scope = getLogScope(log);
  const fields: string[] = [];
  const add = (label: string, ...values: any[]) => {
    const value = firstText(...values);
    if (value) fields.push(`${label}: ${shortenText(value)}`);
  };

  const changeSummary = formatAuditChanges(changes, extra.before, extra.after, orgNameLookup);
  if (changeSummary) {
    const identity: string[] = [];
    const deviceName = firstText(snapshot.name, snapshot.device_name, log.targetName);
    const deviceId = firstText(snapshot.id, snapshot.device_id, extra.deviceId, changedText(changes, 'id', 'device_id'));
    if (deviceName) identity.push(`设备名称: ${shortenText(deviceName)}`);
    if (deviceId) identity.push(`设备ID: ${shortenText(deviceId)}`);
    identity.push(`变更内容: ${changeSummary}`);
    return identity.join('；');
  }

  add('设备名称', snapshot.name, snapshot.device_name, log.targetName);
  add('设备ID', snapshot.id, snapshot.device_id, extra.deviceId, changedText(changes, 'id', 'device_id'));
  add('序列号', snapshot.device_serial, snapshot.serial_number, snapshot.sn, snapshot.deviceCode, snapshot.device_code);
  add('机器码', snapshot.phone_num, snapshot.imei, snapshot.mac, snapshot.holderPhone);
  add('设备类型', snapshot.device_type, snapshot.type, snapshot.platform_type);
  add('IP', snapshot.ip_address, snapshot.ip);
  add('流地址', snapshot.stream_url, snapshot.rtsp_url, snapshot.url);
  add('所属公司', scope.company);
  add('所属项目', scope.project);
  add('所属网格', scope.grid);
  add('所属工队', scope.team);
  add('状态', snapshot.status, snapshot.status_text, snapshot.online_status);

  return fields.length > 0 ? fields.join('；') : `${log.action} - ${log.targetName}`;
};

const collectOrgScopeOptions = (nodes: any[]): OrgScopeOptions => {
  const result: OrgScopeOptions = { companies: [], projects: [], grids: [], teams: [] };
  const add = (key: keyof OrgScopeOptions, value: any) => {
    const text = firstText(value);
    if (text && !result[key].includes(text)) result[key].push(text);
  };
  const visit = (node: any) => {
    const type = String(node?.type || '').toLowerCase();
    if (type === 'branch' || type === 'company') add('companies', node.name);
    if (type === 'project') add('projects', node.name);
    if (type === 'grid') add('grids', node.name);
    if (type === 'team') add('teams', node.name);
    (node?.children || []).forEach(visit);
  };
  (Array.isArray(nodes) ? nodes : []).forEach(visit);
  return result;
};

const buildOrgNameLookup = (nodes: any[]): OrgNameLookup => {
  const lookup: OrgNameLookup = {};
  const add = (type: string, value: any, name: any) => {
    const keyValue = String(value ?? '').trim();
    const label = firstText(name);
    if (keyValue && label) lookup[lookupKey(type, keyValue)] = label;
  };
  const visit = (node: any) => {
    const type = String(node?.type || '').toLowerCase();
    const name = node?.name;
    add('unit', node?.id, name);
    add('unit', node?.unit_id, name);
    add('unit', node?._id, name);
    if (type === 'branch' || type === 'company') {
      add('branch', node?.id, name);
      add('branch', node?.unit_id, name);
    }
    if (type === 'project') {
      add('project', node?.id, name);
      add('project', node?.unit_id, name);
      add('project', node?.project_id, name);
    }
    if (type === 'grid') {
      add('grid', node?.id, name);
      add('grid', node?.unit_id, name);
      add('grid', node?.grid_id, name);
    }
    if (type === 'team') {
      add('team', node?.id, name);
      add('team', node?.unit_id, name);
      add('team', node?.team_id, name);
    }
    (node?.children || []).forEach(visit);
  };
  (Array.isArray(nodes) ? nodes : []).forEach(visit);
  return lookup;
};

const generateLogDetails = (log: SystemLog, orgNameLookup: OrgNameLookup = {}): string => {
  if (log.targetType === 'device') {
    return generateDeviceLogDetails(log, orgNameLookup);
  }

  if (log.targetType === 'person' && log.action.includes('删除')) {
    const snapshot = log.extra?.before || log.extra || {};
    const parts = ['已删除人员'];
    const personName = firstText(snapshot.name, snapshot.username, log.targetName);
    const employeeId = firstText(snapshot.employeeId, snapshot.employee_id);
    const project = firstText(snapshot.project, snapshot.projectName, snapshot.project_name, log.project);
    const team = firstText(snapshot.team, snapshot.workTeam, snapshot.work_team, log.team);
    if (personName) parts.push(`人员: ${personName}`);
    if (employeeId) parts.push(`工号: ${employeeId}`);
    if (project) parts.push(`所属项目: ${project}`);
    if (team) parts.push(`所属工队: ${team}`);
    return parts.join('；');
  }

  const auditSummary = formatAuditChanges(log.extra?.changes, log.extra?.before, log.extra?.after, orgNameLookup);
  if (auditSummary) return `变更内容: ${auditSummary}`;

  const parts: string[] = [];
  
  switch (log.targetType) {
    case 'fence':
      if (log.action.includes('创建') || log.action.includes('添加')) {
        parts.push('新建电子围栏');
        if (log.extra?.shape) parts.push(log.extra.shape);
        if (log.extra?.radius) parts.push(`半径${log.extra.radius}米`);
        if (log.extra?.behavior) parts.push(log.extra.behavior === 'No Entry' ? '禁止进入' : '禁止离开');
        if (log.extra?.severity) parts.push(`等级: ${log.extra.severity === 'severe' ? '严重' : log.extra.severity === 'risk' ? '风险' : '一般'}`);
        if (log.extra?.scheduleStart && log.extra?.scheduleEnd) {
          parts.push(`生效: ${log.extra.scheduleStart.slice(0, 10)} ~ ${log.extra.scheduleEnd.slice(0, 10)}`);
        }
      } else if (log.action.includes('删除') || getDeletedFenceBackup(log)) {
        parts.push('移除电子围栏');
        if (getDeletedFenceBackup(log)) parts.push('已保存删除前围栏备份');
        parts.push(`所有关联规则已清除`);
      } else if (log.action.includes('修改') || log.action.includes('编辑')) {
        parts.push('更新围栏配置');
        if (log.extra?.changes) parts.push(log.extra.changes);
      }
      break;
      
    case 'device':
      if (log.action.includes('添加') || log.action.includes('注册')) {
        parts.push('设备已绑定');
        if (log.extra?.holder) parts.push(`持有人: ${log.extra.holder}`);
        if (log.extra?.deviceId) parts.push(`设备ID: ${log.extra.deviceId}`);
      } else if (log.action.includes('删除') || log.action.includes('解绑')) {
        parts.push('设备已解绑');
        if (log.extra?.holder) parts.push(`原持有人: ${log.extra.holder}`);
      }
      break;
      
    case 'alarm':
      if (log.action.includes('处理')) {
        parts.push('告警已处置');
        if (log.extra?.alarmType) parts.push(`类型: ${log.extra.alarmType}`);
        if (log.extra?.result) parts.push(`结果: ${log.extra.result}`);
        if (log.extra?.triggerBy) parts.push(`触发设备: ${log.extra.triggerBy}`);
      }
      break;
      
    case 'login':
      parts.push('身份验证通过');
      if (log.extra?.sessionId) parts.push(`会话: ${log.extra.sessionId}`);
      if (log.extra?.userAgent) parts.push(`终端: ${log.extra.userAgent}`);
      break;
      
    case 'permission':
      parts.push('权限变更');
      {
        const permissionDetails = formatRawLogDetails(log.details);
        if (permissionDetails) parts.push(permissionDetails);
      }
      if (log.extra?.targetUser) parts.push(`用户: ${log.extra.targetUser}`);
      if (log.extra?.oldRole) parts.push(`从 ${log.extra.oldRole}`);
      if (log.extra?.newRole) parts.push(`升级为 ${log.extra.newRole}`);
      break;
      
    case 'person':
      if (log.action.includes('添加')) {
        parts.push('人员入职');
        if (log.extra?.employeeId) parts.push(`工号: ${log.extra.employeeId}`);
        if (log.extra?.position) parts.push(`岗位: ${log.extra.position}`);
        if (log.extra?.department) parts.push(`部门: ${log.extra.department}`);
      }
      break;
      
    case 'system':
      parts.push('系统参数调整');
      if (log.extra?.setting) parts.push(log.extra.setting);
      if (log.extra?.oldValue) parts.push(`从 ${log.extra.oldValue}`);
      if (log.extra?.newValue) parts.push(`改为 ${log.extra.newValue}`);
      break;
  }
  
  const formattedDetails = formatRawLogDetails(log.details);
  return parts.length > 0 ? parts.join('，') : (formattedDetails || `${log.action} - ${log.targetName}`);
};

const getDeletedFenceBackup = (log: SystemLog): Record<string, any> | null => {
  const backup = log.extra?.deleted_fence_backup;
  return backup && typeof backup === 'object' && !Array.isArray(backup) ? backup : null;
};

const parsePossibleJson = (value: any) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const hasFenceGeometry = (snapshot: Record<string, any> | null) => {
  if (!snapshot) return false;
  const geometry = snapshot.geometry || {};
  const coordinates = parsePossibleJson(snapshot.coordinates_json);
  return Boolean(
    snapshot.center ||
    (Array.isArray(snapshot.points) && snapshot.points.length > 0) ||
    geometry.center ||
    (Array.isArray(geometry.points) && geometry.points.length > 0) ||
    (Array.isArray(coordinates) && coordinates.length > 0)
  );
};

const getFenceSnapshotForMap = (log: SystemLog): { snapshot: Record<string, any>; versionLabel: string } | null => {
  if (log.targetType !== 'fence' || !log.extra) return null;

  const candidates = [
    { snapshot: log.extra.deleted_fence_backup, versionLabel: '删除前备份' },
    { snapshot: log.extra.before, versionLabel: '变更前版本' },
    { snapshot: log.extra.after, versionLabel: '变更后版本' },
    { snapshot: log.extra, versionLabel: '日志记录版本' },
  ];

  for (const item of candidates) {
    if (item.snapshot && typeof item.snapshot === 'object' && !Array.isArray(item.snapshot) && hasFenceGeometry(item.snapshot)) {
      return item as { snapshot: Record<string, any>; versionLabel: string };
    }
  }

  return null;
};

const formatFenceShape = (shape?: string) => {
  if (shape === 'circle') return '圆形';
  if (shape === 'polygon') return '多边形';
  return shape || '-';
};

const formatFenceBehavior = (behavior?: string) => {
  if (behavior === 'No Entry') return '禁止进入';
  if (behavior === 'No Exit') return '禁止离开';
  return behavior || '-';
};

const formatFenceSeverity = (severity?: string) => {
  if (severity === 'severe') return '严重';
  if (severity === 'risk') return '风险';
  if (severity === 'medium') return '中等';
  return severity || '-';
};

const stringifyBackupValue = (value: any) => {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

const getNavigateTarget = (targetType: string): MenuKey | null => {
  const map: Record<string, MenuKey> = {
    fence: MenuKey.FENCE,
    device: MenuKey.MANAGEMENT,
    alarm: MenuKey.ALARM,
    project: MenuKey.MANAGEMENT,
    grid: MenuKey.MANAGEMENT,
    team: MenuKey.MANAGEMENT,
    person: MenuKey.MANAGEMENT,
    video: MenuKey.VIDEO,
  };
  return map[targetType] || null;
};

const getTargetLabel = (targetType: string): string => {
  const map: Record<string, string> = {
    fence: '查看围栏',
    device: '查看设备',
    alarm: '查看告警',
    project: '查看项目',
    grid: '查看网格',
    team: '查看工队',
    person: '人员管理',
  };
  return map[targetType] || '';
};

const compareLogValues = (aValue: string | number, bValue: string | number) => {
  if (typeof aValue === 'number' && typeof bValue === 'number') {
    return aValue - bValue;
  }
  return String(aValue || '').localeCompare(String(bValue || ''), 'zh-CN', { numeric: true, sensitivity: 'base' });
};

interface SystemLogProps {
  onNavigate?: (menuKey: MenuKey) => void;
}

export default function SystemLog({ onNavigate }: SystemLogProps) {
  const scopeState = getStoredScopeState();
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [orgScopeOptions, setOrgScopeOptions] = useState<OrgScopeOptions>({ companies: [], projects: [], grids: [], teams: [] });
  const [orgNameLookup, setOrgNameLookup] = useState<OrgNameLookup>({});
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);
  const selectedFenceBackup = selectedLog ? getDeletedFenceBackup(selectedLog) : null;
  
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedGrid, setSelectedGrid] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [showSearchHint, setShowSearchHint] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortState, setSortState] = useState<SystemLogSortState>({ field: 'time', direction: 'desc' });

  const viewHistoricalFenceOnMap = (log: SystemLog) => {
    const mapSnapshot = getFenceSnapshotForMap(log);
    if (!mapSnapshot || !onNavigate) return;

    localStorage.setItem(HISTORICAL_FENCE_STORAGE_KEY, JSON.stringify({
      logId: log.id,
      logTime: log.time,
      action: log.action,
      targetName: log.targetName,
      versionLabel: mapSnapshot.versionLabel,
      snapshot: mapSnapshot.snapshot,
    }));
    setSelectedLog(null);
    onNavigate(MenuKey.FENCE);
  };

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const logsFromApi = await alarmApi.getLogs();
        const sortedLogs = logsFromApi.map(transformLogResponse).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        setLogs(sortedLogs);
      } catch (error) {
        console.error('Failed to fetch logs:', error);
        // 如果API失败，显示空日志
        setLogs([]);
      }
    };

    const fetchOrgScopeOptions = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/responsibility-units/tree`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        setOrgScopeOptions(collectOrgScopeOptions(data));
        setOrgNameLookup(buildOrgNameLookup(data));
      } catch (error) {
        console.error('Failed to fetch organization scope options:', error);
      }
    };
    
    fetchLogs();
    fetchOrgScopeOptions();
    setSelectedCompany('all');
    setSelectedProject('all');
    setSelectedGrid('all');
    setSelectedTeam('all');
    setFilterType('all');
    setStartDate('');
    setEndDate('');
  }, []);

  const logScope = (log: SystemLog) => getLogScope(log);
  const uniqueOptions = (values: string[]) => ['all', ...new Set(values.filter(Boolean))];
  const companyScopedLogs = logs.filter(log => selectedCompany === 'all' || logScope(log).company === selectedCompany);
  const projectScopedLogs = companyScopedLogs.filter(log => selectedProject === 'all' || logScope(log).project === selectedProject);
  const gridScopedLogs = projectScopedLogs.filter(log => selectedGrid === 'all' || logScope(log).grid === selectedGrid);
  const companies = uniqueOptions(logs.map(l => logScope(l).company));
  const projects = uniqueOptions(companyScopedLogs.map(l => logScope(l).project));
  const grids = uniqueOptions(projectScopedLogs.map(l => logScope(l).grid));
  const teams = uniqueOptions(gridScopedLogs.map(l => logScope(l).team));

  useEffect(() => {
    if (selectedProject !== 'all' && !projects.includes(selectedProject)) {
      setSelectedProject('all');
      setSelectedGrid('all');
      setSelectedTeam('all');
    }
  }, [projects, selectedProject]);

  useEffect(() => {
    if (selectedGrid !== 'all' && !grids.includes(selectedGrid)) {
      setSelectedGrid('all');
      setSelectedTeam('all');
    }
  }, [grids, selectedGrid]);

  useEffect(() => {
    if (selectedTeam !== 'all' && !teams.includes(selectedTeam)) {
      setSelectedTeam('all');
    }
  }, [teams, selectedTeam]);

  const rangeFilteredLogs = logs.filter(log => {
    const scope = logScope(log);
    if (selectedCompany !== 'all' && scope.company !== selectedCompany) return false;
    if (selectedProject !== 'all' && scope.project !== selectedProject) return false;
    if (selectedGrid !== 'all' && scope.grid !== selectedGrid) return false;
    if (selectedTeam !== 'all' && scope.team !== selectedTeam) return false;
    return true;
  });

  const dateRangeFilteredLogs = rangeFilteredLogs.filter(log => {
    const logTime = new Date(log.time);
    if (startDate && logTime < new Date(startDate)) return false;
    if (endDate && logTime > new Date(endDate + ' 23:59:59')) return false;
    return true;
  });

  const stats = {
    total: dateRangeFilteredLogs.length,
    fence: dateRangeFilteredLogs.filter(l => l.targetType === 'fence').length,
    device: dateRangeFilteredLogs.filter(l => l.targetType === 'device').length,
    alarm: dateRangeFilteredLogs.filter(l => l.targetType === 'alarm').length,
    login: dateRangeFilteredLogs.filter(l => l.targetType === 'login').length,
    project: dateRangeFilteredLogs.filter(l => l.targetType === 'project').length,
    grid: dateRangeFilteredLogs.filter(l => l.targetType === 'grid').length,
    team: dateRangeFilteredLogs.filter(l => l.targetType === 'team').length,
    person: dateRangeFilteredLogs.filter(l => l.targetType === 'person').length,
    permission: dateRangeFilteredLogs.filter(l => l.targetType === 'permission').length,
    backup: dateRangeFilteredLogs.filter(l => l.targetType === 'backup').length,
    system: dateRangeFilteredLogs.filter(l => l.targetType === 'system').length,
  };

  const typeFilteredLogs = filterType === 'all' 
    ? dateRangeFilteredLogs 
    : dateRangeFilteredLogs.filter(log => log.targetType === filterType);

  const filteredLogs = typeFilteredLogs.filter(log => {
    if (searchKeyword) {
      const lowerKeyword = searchKeyword.toLowerCase();
      const autoDetails = generateLogDetails(log, orgNameLookup).toLowerCase();
      return (
        log.operator.toLowerCase().includes(lowerKeyword) ||
        log.action.toLowerCase().includes(lowerKeyword) ||
        log.targetName.toLowerCase().includes(lowerKeyword) ||
        autoDetails.includes(lowerKeyword) ||
        (log.company && log.company.toLowerCase().includes(lowerKeyword)) ||
        (log.project && log.project.toLowerCase().includes(lowerKeyword)) ||
        (log.team && log.team.toLowerCase().includes(lowerKeyword))
      );
    }
    return true;
  });

  const getSortValue = (log: SystemLog, field: SystemLogSortField): string | number => {
    const scope = logScope(log);
    switch (field) {
      case 'type':
        return typeLabels[log.targetType] || log.targetType;
      case 'operator':
        return log.operator || '';
      case 'action':
        return log.action || '';
      case 'targetName':
        return log.targetName || '';
      case 'scope':
        return [scope.company, scope.project, scope.grid, scope.team].filter(Boolean).join('/');
      case 'details':
        return generateLogDetails(log, orgNameLookup);
      case 'time':
        return new Date(log.time).getTime() || 0;
      default:
        return '';
    }
  };

  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const result = compareLogValues(getSortValue(a, sortState.field), getSortValue(b, sortState.field));
    return sortState.direction === 'asc' ? result : -result;
  });

  const renderSortHeader = (field: SystemLogSortField, label: string, className = 'px-4 py-3 text-left text-sm font-medium text-slate-400') => {
    const active = sortState.field === field;
    const nextDirection: SortDirection = active && sortState.direction === 'asc' ? 'desc' : 'asc';
    return (
      <th className={className}>
        <button
          type="button"
          onClick={() => setSortState({ field, direction: nextDirection })}
          className={`inline-flex items-center gap-1 transition-colors hover:text-cyan-300 ${active ? 'text-cyan-300' : ''}`}
          title={`点击按${label}排序`}
        >
          <span>{label}</span>
          <span className="text-xs">{active ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
        </button>
      </th>
    );
  };

  const typeStyles: Record<string, string> = {
    all: 'bg-cyan-500/40 text-white font-bold border-2 border-cyan-400 shadow-lg shadow-cyan-500/20',
    fence: 'bg-blue-500/20 text-blue-400 border border-blue-400/30',
    device: 'bg-green-500/20 text-green-400 border border-green-400/30',
    alarm: 'bg-orange-500/20 text-orange-400 border border-orange-400/30',
    login: 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30',
    project: 'bg-cyan-600/20 text-cyan-500 border border-cyan-500/30',
    grid: 'bg-teal-500/20 text-teal-400 border border-teal-400/30',
    team: 'bg-indigo-500/20 text-indigo-400 border border-indigo-400/30',
    person: 'bg-purple-500/20 text-purple-400 border border-purple-400/30',
    permission: 'bg-red-500/20 text-red-400 border border-red-400/30',
    backup: 'bg-yellow-500/20 text-yellow-400 border border-yellow-400/30',
    system: 'bg-slate-500/20 text-slate-400 border border-slate-400/30',
  };

  const searchHints = [
    { icon: <User size={16} />, text: '人员、单位、操作类型、详情内容' },
  ];

  const getFilterSummary = () => {
    const parts = [];
    if (selectedCompany !== 'all') parts.push(selectedCompany);
    if (selectedProject !== 'all') parts.push(selectedProject);
    if (selectedGrid !== 'all') parts.push(selectedGrid);
    if (selectedTeam !== 'all') parts.push(selectedTeam);
    return parts.length > 0 ? parts.join(' / ') : '全部范围';
  };

  return (
    <div className="h-full overflow-auto p-6">
      {/* 标题栏 + 所有筛选控件放同一行 */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        {/* 左侧：标题 + 类型筛选标签 + 日期筛选 */}
        <div className="flex items-center gap-8">
          <h1 className="text-4xl font-bold text-white flex items-center gap-2">
            <FileText size={32} className="text-cyan-400" />
            系统日志
          </h1>
          
          {/* 类型筛选标签 */}
          <div className="flex items-center gap-2">
            {Object.entries(typeLabels).map(([type, label]) => {
              const count = type === 'all' ? stats.total : stats[type as keyof typeof stats];
              const isActive = filterType === type;
              
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-4 py-2 rounded-full text-base transition-all flex items-center gap-2 ${
                    isActive ? typeStyles[type] : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{label}</span>
                  <span className={`text-base ${isActive ? 'opacity-80' : ''}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* 日期时间筛选 */}
          <div className="flex items-center gap-2 ml-4">
            <Calendar size={20} className="text-cyan-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
            />
            <span className="text-slate-400">至</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-cyan-400 transition-all"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* 右侧：树形筛选 + 搜索框 */}
        <div className="flex items-center gap-4">
          <a
            href={alarmApi.exportLogsUrl()}
            className="flex items-center gap-2 px-5 py-3 bg-slate-800/80 border border-slate-700 rounded-lg text-base text-slate-200 hover:bg-slate-700/80 transition-all"
          >
            <Download size={18} className="text-cyan-400" />
            <span>导出日志</span>
          </a>
          <div className="flex items-center gap-2">
            {scopeState.showCompanyFilter && (
              <select
                value={selectedCompany}
                onChange={(event) => {
                  setSelectedCompany(event.target.value);
                  setSelectedProject('all');
                  setSelectedGrid('all');
                  setSelectedTeam('all');
                }}
                className="h-11 min-w-[120px] rounded-lg border border-slate-700 bg-slate-800/80 px-3 text-base text-slate-200 outline-none hover:border-cyan-400/40"
              >
                {companies.map(c => <option key={c} value={c}>{c === 'all' ? '所有公司' : c}</option>)}
              </select>
            )}
            {scopeState.showProjectFilter && (
              <select
                value={selectedProject}
                onChange={(event) => {
                  setSelectedProject(event.target.value);
                  setSelectedGrid('all');
                  setSelectedTeam('all');
                }}
                className="h-11 min-w-[120px] rounded-lg border border-slate-700 bg-slate-800/80 px-3 text-base text-slate-200 outline-none hover:border-cyan-400/40"
              >
                {projects.map(p => <option key={p} value={p}>{p === 'all' ? '所有项目' : p}</option>)}
              </select>
            )}
            <select
              value={selectedGrid}
              onChange={(event) => {
                setSelectedGrid(event.target.value);
                setSelectedTeam('all');
              }}
              className="h-11 min-w-[120px] rounded-lg border border-slate-700 bg-slate-800/80 px-3 text-base text-slate-200 outline-none hover:border-cyan-400/40"
            >
              {grids.map(g => <option key={g} value={g}>{g === 'all' ? '所有网格' : g}</option>)}
            </select>
            <select
              value={selectedTeam}
              onChange={(event) => setSelectedTeam(event.target.value)}
              className="h-11 min-w-[120px] rounded-lg border border-slate-700 bg-slate-800/80 px-3 text-base text-slate-200 outline-none hover:border-cyan-400/40"
            >
              {teams.map(t => <option key={t} value={t}>{t === 'all' ? '所有工队' : t}</option>)}
            </select>
            {(selectedCompany !== 'all' || selectedProject !== 'all' || selectedGrid !== 'all' || selectedTeam !== 'all') && (
              <button
                onClick={() => {
                  setSelectedCompany('all');
                  setSelectedProject('all');
                  setSelectedGrid('all');
                  setSelectedTeam('all');
                }}
                className="h-11 px-3 rounded-lg text-base text-cyan-300 hover:bg-cyan-500/10"
              >
                重置
              </button>
            )}
          </div>

          {/* 搜索框 */}
          <div className="relative w-80">
            <Search size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-cyan-400" />
            <input
              type="text"
              placeholder="搜索..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onFocus={() => setShowSearchHint(true)}
              onBlur={() => setTimeout(() => setShowSearchHint(false), 200)}
              className="w-full bg-slate-800/80 border border-slate-700 rounded-lg pl-12 pr-5 py-3 text-base text-slate-200"
            />
            
            {showSearchHint && (
              <div className="absolute right-0 top-full mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 p-4">
                {searchHints.map((hint, i) => (
                  <div key={i} className="flex items-center gap-2 py-2">
                    <span className="text-cyan-400">{hint.icon}</span>
                    <span className="text-base text-slate-300">{hint.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 筛选状态提示 */}
      {filterType !== 'all' && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-slate-400 text-lg">当前筛选：</span>
          <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-lg">
            {typeLabels[filterType]} ({filteredLogs.length} 条)
          </span>
          <button 
            onClick={() => setFilterType('all')}
            className="text-base text-slate-500 hover:text-cyan-400 underline"
          >
            点击显示全部
          </button>
        </div>
      )}

      {/* 日志表格 */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-700/50">
              {renderSortHeader('type', '类型')}
              {renderSortHeader('operator', '操作人员')}
              {renderSortHeader('action', '操作行为')}
              {renderSortHeader('targetName', '操作对象')}
              {renderSortHeader('scope', '所属单位')}
              {renderSortHeader('details', '详情')}
              {renderSortHeader('time', '操作时间')}
            </tr>
          </thead>
          <tbody>
            {sortedLogs.map((log, index) => (
              <tr 
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className={`border-b border-slate-700/30 cursor-pointer transition-all hover:bg-slate-800/50 ${
                  index % 2 === 0 ? 'bg-slate-800/20' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm ${actionColors[log.targetType]}`}>
                    {actionIcons[log.targetType]}
                    {typeLabels[log.targetType]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-base font-medium text-white">{log.operator}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-base text-slate-300">{log.action}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-base text-slate-400">{log.targetName}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    {(() => {
                      const scope = logScope(log);
                      const projectTeam = [scope.project, scope.team].filter(Boolean).join(' · ');
                      return (
                        <>
                          <span className="text-sm text-slate-300">{scope.company || '-'}</span>
                          {scope.grid && <span className="text-xs text-slate-500">网格：{scope.grid}</span>}
                          {projectTeam && <span className="text-xs text-slate-500">{projectTeam}</span>}
                        </>
                      );
                    })()}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span className="text-sm text-slate-500 max-w-md whitespace-normal break-words leading-5 flex-1" title={generateLogDetails(log, orgNameLookup)}>
                      {generateLogDetails(log, orgNameLookup)}
                    </span>
                    {onNavigate && getFenceSnapshotForMap(log) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          viewHistoricalFenceOnMap(log);
                        }}
                        className="flex-shrink-0 p-1 hover:bg-amber-500/20 rounded text-amber-300 hover:text-amber-200 transition-all"
                        title="在地图上查看历史围栏"
                      >
                        <MapPin size={14} />
                      </button>
                    )}
                    {onNavigate && getNavigateTarget(log.targetType) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const target = getNavigateTarget(log.targetType);
                          if (target) onNavigate(target);
                        }}
                        className="flex-shrink-0 p-1 hover:bg-cyan-500/20 rounded text-cyan-400 hover:text-cyan-300 transition-all"
                        title={getTargetLabel(log.targetType)}
                        aria-label={getTargetLabel(log.targetType)}
                      >
                        <ExternalLink size={14} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-500">
                    {new Date(log.time).toLocaleString()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredLogs.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <FileText size={56} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg">暂无日志记录</p>
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {selectedLog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 shadow-2xl p-6 w-[760px] max-w-[90vw] max-h-[86vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${actionColors[selectedLog.targetType]}`}>
                  {actionIcons[selectedLog.targetType]}
                </div>
                <h3 className="text-2xl font-bold text-white">日志详情</h3>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-slate-700 rounded">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            
            <div className="space-y-3 text-base">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400">操作人员：</span>
                  <span className="text-slate-200">{selectedLog.operator}</span>
                </div>
                <div>
                  <span className="text-slate-400">操作类型：</span>
                  <span className="text-slate-200">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-slate-400">操作对象：</span>
                  <span className="text-slate-200">{selectedLog.targetName}</span>
                </div>
                <div>
                  <span className="text-slate-400">操作时间：</span>
                  <span className="text-slate-200">{new Date(selectedLog.time).toLocaleString()}</span>
                </div>
                {selectedLog.company && (
                  <div>
                    <span className="text-slate-400">所属公司：</span>
                    <span className="text-slate-200">{selectedLog.company}</span>
                  </div>
                )}
                {selectedLog.project && (
                  <div>
                    <span className="text-slate-400">所属项目：</span>
                    <span className="text-slate-200">{selectedLog.project}</span>
                  </div>
                )}
                {selectedLog.grid && (
                  <div>
                    <span className="text-slate-400">所属网格：</span>
                    <span className="text-slate-200">{selectedLog.grid}</span>
                  </div>
                )}
                {selectedLog.team && (
                  <div>
                    <span className="text-slate-400">所属工队：</span>
                    <span className="text-slate-200">{selectedLog.team}</span>
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-slate-400">详细信息：</span>
                  <p className="text-slate-200 mt-1">{generateLogDetails(selectedLog)}</p>
                </div>
                {selectedFenceBackup && (
                  <div className="col-span-2 mt-2 rounded-lg border border-cyan-400/20 bg-slate-950/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-cyan-300">删除前围栏备份</span>
                      <span className="text-xs text-slate-500">日志留存</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <span className="text-slate-500">围栏名称：</span>
                        <span className="text-slate-200">{stringifyBackupValue(selectedFenceBackup.name)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">围栏ID：</span>
                        <span className="text-slate-200">{stringifyBackupValue(selectedFenceBackup.fence_id || selectedFenceBackup.id)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">形状：</span>
                        <span className="text-slate-200">{formatFenceShape(selectedFenceBackup.shape)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">规则：</span>
                        <span className="text-slate-200">{formatFenceBehavior(selectedFenceBackup.behavior)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">等级：</span>
                        <span className="text-slate-200">{formatFenceSeverity(selectedFenceBackup.severity || selectedFenceBackup.alarm_type)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">状态：</span>
                        <span className="text-slate-200">{selectedFenceBackup.is_active === false ? '停用' : '启用'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">所属公司：</span>
                        <span className="text-slate-200">{stringifyBackupValue(selectedFenceBackup.company)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">所属项目：</span>
                        <span className="text-slate-200">{stringifyBackupValue(selectedFenceBackup.project)}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-500">生效时间：</span>
                        <span className="text-slate-200">{stringifyBackupValue(selectedFenceBackup.schedule?.start)} 至 {stringifyBackupValue(selectedFenceBackup.schedule?.end)}</span>
                      </div>
                    </div>
                    <pre className="mt-3 max-h-44 overflow-auto rounded border border-slate-700/70 bg-slate-950/70 p-3 text-xs leading-relaxed text-slate-300">
                      {stringifyBackupValue(selectedFenceBackup.geometry || selectedFenceBackup.coordinates_json || selectedFenceBackup)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              {onNavigate && selectedLog && getFenceSnapshotForMap(selectedLog) && (
                <button
                  onClick={() => viewHistoricalFenceOnMap(selectedLog)}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 rounded-lg text-lg font-medium text-slate-950 transition-all flex items-center justify-center gap-2"
                >
                  <MapPin size={18} />
                  查看历史围栏
                </button>
              )}
              {onNavigate && selectedLog && getNavigateTarget(selectedLog.targetType) && (
                <button
                  onClick={() => {
                    const target = getNavigateTarget(selectedLog.targetType);
                    if (target) {
                      setSelectedLog(null);
                      onNavigate(target);
                    }
                  }}
                  className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-lg font-medium transition-all flex items-center justify-center gap-2"
                >
                  <ExternalLink size={18} />
                  {getTargetLabel(selectedLog.targetType)}
                </button>
              )}
              <button onClick={() => setSelectedLog(null)} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-lg font-medium transition-all">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
