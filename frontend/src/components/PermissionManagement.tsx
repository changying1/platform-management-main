import React, { useState, useEffect } from 'react';
import { Shield, Save, RotateCcw, ChevronRight, ChevronDown, Search, X, Building2, FolderTree, Users } from 'lucide-react';

// ============================================
// 类型定义
// ============================================
interface Role {
  id: string;
  name: string;
  code: string;
  level: 'headquarters_admin' | 'branch_admin' | 'project_safety_admin' | 'grid_admin' | 'team_admin';
  company?: string;
  project?: string;
  team?: string;
  description: string;
}

interface PermissionNode {
  id: string;
  name: string;
  code: string;
  icon?: React.ReactNode;
  color?: string;
  children?: PermissionNode[];
}

interface RoleTreeNode {
  id: string;
  name: string;
  type: 'company' | 'project' | 'team' | 'role';
  children?: RoleTreeNode[];
  roleId?: string;
}

const permissionTree: PermissionNode[] = [
  {
    id: 'dashboard',
    name: '仪表板',
    code: 'dashboard',
    color: 'cyan',
    children: [
      { id: 'dashboard.view', name: '查看仪表板', code: 'dashboard.view' },
    ]
  },
  {
    id: 'monitor',
    name: '视频监控',
    code: 'monitor',
    color: 'purple',
    children: [
      { id: 'monitor.playback', name: '监控回放', code: 'monitor.playback' },
      { id: 'monitor.track', name: '轨迹回放', code: 'monitor.track' },
      { id: 'monitor.voice', name: '语音回放', code: 'monitor.voice' },
      { id: 'monitor.camera', name: '摄像头管理', code: 'monitor.camera' },
    ]
  },
  {
    id: 'fence',
    name: '电子围栏',
    code: 'fence',
    color: 'blue',
    children: [
      { id: 'fence.view', name: '查看围栏', code: 'fence.view' },
      { id: 'fence.create', name: '创建围栏', code: 'fence.create' },
      { id: 'fence.edit', name: '编辑围栏', code: 'fence.edit' },
      { id: 'fence.delete', name: '删除围栏', code: 'fence.delete' },
    ]
  },
  {
    id: 'device',
    name: '设备管理',
    code: 'device',
    color: 'green',
    children: [
      { id: 'device.view', name: '查看设备', code: 'device.view' },
      { id: 'device.create', name: '添加设备', code: 'device.create' },
      { id: 'device.edit', name: '编辑设备', code: 'device.edit' },
      { id: 'device.delete', name: '删除设备', code: 'device.delete' },
    ]
  },
  {
    id: 'grid',
    name: '网格管理',
    code: 'grid',
    color: 'cyan',
    children: [
      { id: 'grid.view', name: '查看网格', code: 'grid.view' },
      { id: 'grid.create', name: '添加网格', code: 'grid.create' },
      { id: 'grid.edit', name: '编辑网格', code: 'grid.edit' },
      { id: 'grid.delete', name: '删除网格', code: 'grid.delete' },
    ]
  },
  {
    id: 'team',
    name: '工队管理',
    code: 'team',
    color: 'teal',
    children: [
      { id: 'team.view', name: '查看工队', code: 'team.view' },
      { id: 'team.create', name: '添加工队', code: 'team.create' },
      { id: 'team.edit', name: '编辑工队', code: 'team.edit' },
      { id: 'team.delete', name: '删除工队', code: 'team.delete' },
    ]
  },
  {
    id: 'personnel',
    name: '人员管理',
    code: 'personnel',
    color: 'orange',
    children: [
      { id: 'personnel.view', name: '查看人员', code: 'personnel.view' },
      { id: 'personnel.create', name: '添加人员', code: 'personnel.create' },
      { id: 'personnel.edit', name: '编辑人员', code: 'personnel.edit' },
      { id: 'personnel.delete', name: '删除人员', code: 'personnel.delete' },
    ]
  },
  {
    id: 'alarm',
    name: '告警管理',
    code: 'alarm',
    color: 'red',
    children: [
      { id: 'alarm.view', name: '查看告警', code: 'alarm.view' },
      { id: 'alarm.handle', name: '处理告警', code: 'alarm.handle' },
    ]
  },
  {
    id: 'system',
    name: '系统管理',
    code: 'system',
    color: 'gray',
    children: [
      { id: 'system.role', name: '权限管理', code: 'system.role' },
      { id: 'system.log', name: '操作日志', code: 'system.log' },
    ]
  },
];

const allPermissionCodes = permissionTree.flatMap(module => module.children?.map(child => child.code) || []);

const defaultPermissions: Record<string, string[]> = {
  headquarters_admin: [...allPermissionCodes],
  branch_admin: [...allPermissionCodes],
  project_safety_admin: [...allPermissionCodes],
  grid_admin: [...allPermissionCodes],
  team_admin: [...allPermissionCodes],
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const ROLE_RANK: Record<Role['level'], number> = {
  team_admin: 1,
  grid_admin: 2,
  project_safety_admin: 3,
  branch_admin: 4,
  headquarters_admin: 5,
};

const getCurrentPermissionLevel = (): Role['level'] => {
  const level = localStorage.getItem('permission_level') as Role['level'] | null;
  if (level && ROLE_RANK[level]) return level;
  try {
    const auth = JSON.parse(localStorage.getItem('auth') || '{}');
    if (auth?.permission_level && ROLE_RANK[auth.permission_level as Role['level']]) {
      return auth.permission_level;
    }
  } catch {
    // Ignore invalid stored auth.
  }
  return 'headquarters_admin';
};

const getAllowedLevels = (currentLevel: Role['level']) =>
  Object.keys(ROLE_RANK).filter(
    (level) => ROLE_RANK[level as Role['level']] <= ROLE_RANK[currentLevel]
  );

const buildAuthHeaders = () => ({
  'Content-Type': 'application/json',
  ...(localStorage.getItem('auth_token') ? {
    'X-Auth-Token': localStorage.getItem('auth_token') || '',
    Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
  } : {}),
  'X-Role': localStorage.getItem('role') || '',
  'X-Department-Id': localStorage.getItem('department_id') || '',
  'X-Username': localStorage.getItem('username') || '',
  'X-Permission-Level': localStorage.getItem('permission_level') || getCurrentPermissionLevel(),
});

const levelLabel: Partial<Record<Role['level'], string>> = {
  headquarters_admin: '总部管理员',
  branch_admin: '分公司管理员',
  project_safety_admin: '项目管理员',
  grid_admin: '网格管理员',
  team_admin: '工队管理员',
};

const getGroupName = (value: string | undefined, fallback: string) => {
  const trimmed = String(value || '').trim();
  return trimmed || fallback;
};

const addChild = (parent: RoleTreeNode, child: RoleTreeNode) => {
  parent.children = parent.children || [];
  parent.children.push(child);
};

const buildRoleTreeFromAccounts = (accountRoles: Role[]): RoleTreeNode[] => {
  const hq: RoleTreeNode = { id: 'hq', name: '总部', type: 'company', children: [] };
  const companyMap = new Map<string, RoleTreeNode>();
  const projectMap = new Map<string, RoleTreeNode>();
  const teamMap = new Map<string, RoleTreeNode>();

  const getCompanyNode = (company: string) => {
    const key = company || '未分配公司';
    if (!companyMap.has(key)) {
      companyMap.set(key, { id: `company-${key}`, name: key, type: 'company', children: [] });
    }
    return companyMap.get(key)!;
  };

  const getProjectNode = (companyNode: RoleTreeNode, company: string, project: string) => {
    const key = `${company || '未分配公司'}::${project || '未分配项目'}`;
    if (!projectMap.has(key)) {
      const node = { id: `project-${key}`, name: project || '未分配项目', type: 'project' as const, children: [] };
      projectMap.set(key, node);
      addChild(companyNode, node);
    }
    return projectMap.get(key)!;
  };

  const getTeamNode = (projectNode: RoleTreeNode, company: string, project: string, team: string) => {
    const key = `${company || '未分配公司'}::${project || '未分配项目'}::${team || '未分配工队'}`;
    if (!teamMap.has(key)) {
      const node = { id: `team-${key}`, name: team || '未分配工队', type: 'team' as const, children: [] };
      teamMap.set(key, node);
      addChild(projectNode, node);
    }
    return teamMap.get(key)!;
  };

  accountRoles.forEach((role) => {
    const roleNode: RoleTreeNode = {
      id: `role-${role.id}`,
      name: `${role.name}${role.name === role.code ? '' : `（${role.code}）`}`,
      type: 'role',
      roleId: role.id,
    };
    if (role.level === 'headquarters_admin') {
      addChild(hq, roleNode);
      return;
    }

    const company = getGroupName(role.company, '未分配公司');
    const companyNode = getCompanyNode(company);
    if (role.level === 'branch_admin') {
      addChild(companyNode, roleNode);
      return;
    }

    const project = getGroupName(role.project, '未分配项目');
    const projectNode = getProjectNode(companyNode, company, project);
    if (role.level === 'project_safety_admin') {
      addChild(projectNode, roleNode);
      return;
    }

    const team = getGroupName(role.team, '未分配工队');
    addChild(getTeamNode(projectNode, company, project, team), roleNode);
  });

  return [
    ...(hq.children?.length ? [hq] : []),
    ...Array.from(companyMap.values()),
  ];
};

// 颜色映射
const colorMap: Record<string, string> = {
  cyan: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400',
  purple: 'bg-purple-500/20 border-purple-500/30 text-purple-400',
  blue: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
  teal: 'bg-teal-500/20 border-teal-500/30 text-teal-400',
  green: 'bg-green-500/20 border-green-500/30 text-green-400',
  orange: 'bg-orange-500/20 border-orange-500/30 text-orange-400',
  red: 'bg-red-500/20 border-red-500/30 text-red-400',
  gray: 'bg-slate-500/20 border-slate-500/30 text-slate-400',
};

// ============================================
// 角色树组件
// ============================================
interface RoleTreeItemProps {
  node: RoleTreeNode;
  level: number;
  selectedRoleId: string | null;
  onSelect: (roleId: string) => void;
  searchKeyword: string;
}

const RoleTreeItem: React.FC<RoleTreeItemProps> = ({ node, level, selectedRoleId, onSelect, searchKeyword }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  
  const getIcon = () => {
    switch (node.type) {
      case 'company': return <Building2 size={14} className="text-cyan-400" />;
      case 'project': return <FolderTree size={14} className="text-blue-400" />;
      case 'team': return <Users size={14} className="text-orange-400" />;
      default: return <Shield size={14} className="text-green-400" />;
    }
  };

  const isSelected = node.roleId === selectedRoleId;
  const isRole = node.type === 'role';

  return (
    <div>
      <div 
        className={`flex items-center py-1.5 px-2 rounded cursor-pointer transition-all ${
          isRole && isSelected 
            ? 'bg-cyan-500/20 text-cyan-300' 
            : isRole 
              ? 'hover:bg-slate-700/50 text-slate-200' 
              : 'text-slate-400'
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => isRole && node.roleId && onSelect(node.roleId)}
      >
        {hasChildren && (
          <button 
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} 
            className="p-0.5 mr-1 hover:text-cyan-300"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        {!hasChildren && <div className="w-5" />}
        
        <span className="mr-2">{getIcon()}</span>
        <span className={`text-sm ${isRole ? 'font-medium' : ''}`}>
          {node.name}
        </span>
      </div>
      
      {hasChildren && expanded && (
        <div>
          {node.children!.map(child => (
            <RoleTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedRoleId={selectedRoleId}
              onSelect={onSelect}
              searchKeyword={searchKeyword}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// 权限分组卡片组件
// ============================================
interface PermissionCardProps {
  module: PermissionNode;
  checkedKeys: string[];
  onCheck: (code: string, checked: boolean) => void;
  readonly?: boolean;
}

const PermissionCard: React.FC<PermissionCardProps> = ({ module, checkedKeys, onCheck, readonly = false }) => {
  const colorClass = colorMap[module.color || 'gray'];
  
  return (
    <div className={`bg-slate-800/50 rounded-xl border ${colorClass.split(' ')[1]} overflow-hidden`}>
      {/* 模块头部 */}
      <div className={`px-4 py-3 border-b ${colorClass.split(' ')[1]} ${colorClass.split(' ')[0]}`}>
        <h4 className={`font-semibold text-sm ${colorClass.split(' ')[2]}`}>
          {module.name}
        </h4>
      </div>
      
      {/* 权限列表 */}
      <div className="p-3 space-y-2">
        {module.children?.map(perm => {
          const isChecked = checkedKeys.includes(perm.code);
          return (
            <label key={perm.code} className={`flex items-center gap-2 p-1.5 rounded transition-colors ${readonly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-slate-700/50'}`}>
              <input
                type="checkbox"
                checked={isChecked}
                disabled={readonly}
                onChange={(e) => onCheck(perm.code, e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
              />
              <span className="text-sm text-slate-200">{perm.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

// ============================================
// 主组件
// ============================================
export default function PermissionManagement() {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [accountRoles, setAccountRoles] = useState<Role[]>([]);
  const [roleTree, setRoleTree] = useState<RoleTreeNode[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [checkedPermissions, setCheckedPermissions] = useState<string[]>([]);
  const [savedPermissions, setSavedPermissions] = useState<Record<string, string[]>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [roleSearchKeyword, setRoleSearchKeyword] = useState('');
  const [permSearchKeyword, setPermSearchKeyword] = useState('');
  const [saving, setSaving] = useState(false);
  const currentPermissionLevel = getCurrentPermissionLevel();
  const allowedLevels = getAllowedLevels(currentPermissionLevel);
  const canUseRole = (role: Role) => allowedLevels.includes(role.level);
  const visibleRoles = accountRoles.filter(canUseRole);
  const selectedRoleReadonly = selectedRole?.level === 'headquarters_admin';

  // 筛选角色树
  const filterRoleTree = (nodes: RoleTreeNode[]): RoleTreeNode[] => {
    if (!roleSearchKeyword) return nodes;
    return nodes.reduce<RoleTreeNode[]>((acc, node) => {
      if (node.name.includes(roleSearchKeyword)) {
        acc.push(node);
      } else if (node.children) {
        const filtered = filterRoleTree(node.children);
        if (filtered.length > 0) {
          acc.push({ ...node, children: filtered });
        }
      }
      return acc;
    }, []);
  };

  const filterRoleTreeByLevel = (nodes: RoleTreeNode[]): RoleTreeNode[] => {
    return nodes.reduce<RoleTreeNode[]>((acc, node) => {
      if (node.type === 'role') {
        const role = accountRoles.find(r => r.id === node.roleId);
        if (role && canUseRole(role)) acc.push(node);
        return acc;
      }
      const children = node.children ? filterRoleTreeByLevel(node.children) : [];
      if (children.length > 0) {
        acc.push({ ...node, children });
      }
      return acc;
    }, []);
  };

  const filteredRoleTree = filterRoleTree(filterRoleTreeByLevel(roleTree));

  useEffect(() => {
    const loadPermissionAccounts = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/permissions/accounts`, {
          headers: buildAuthHeaders(),
        });
        if (!res.ok) {
          setAccountRoles([]);
          setRoleTree([]);
          return;
        }
        const data = await res.json();
        const nextRoles: Role[] = (Array.isArray(data) ? data : [])
          .filter(item => item?.id && item?.level && ROLE_RANK[item.level as Role['level']])
          .map(item => ({
            id: String(item.id),
            name: item.name || item.username || '未命名账号',
            code: item.username || String(item.id),
            level: item.level,
            company: item.company || '',
            project: item.project || '',
            team: item.team || '',
            description: item.description || levelLabel[item.level as Role['level']] || '',
          }));
        setAccountRoles(nextRoles);
        setRoleTree(buildRoleTreeFromAccounts(nextRoles));
      } catch (error) {
        console.error('加载账号列表失败:', error);
        setAccountRoles([]);
        setRoleTree([]);
      } finally {
        setLoadingAccounts(false);
      }
    };

    const loadRolePermissions = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/permissions/roles`, {
          headers: buildAuthHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        const next: Record<string, string[]> = {};
        for (const item of Array.isArray(data) ? data : []) {
          if (item.level && Array.isArray(item.permissions)) {
            next[item.level] = item.permissions;
          }
        }
        setSavedPermissions(next);
      } catch (error) {
        console.error('加载权限配置失败:', error);
      }
    };

    loadPermissionAccounts();
    loadRolePermissions();
  }, []);

  // 筛选权限模块
  const filteredPermissions = permSearchKeyword
    ? permissionTree.filter(m => 
        m.name.includes(permSearchKeyword) ||
        m.children?.some(c => c.name.includes(permSearchKeyword))
      ).map(m => ({
        ...m,
        children: m.children?.filter(c => c.name.includes(permSearchKeyword))
      }))
    : permissionTree;

  // 切换角色时加载权限
  useEffect(() => {
    if (selectedRole) {
      const perms = savedPermissions[selectedRole.level] || defaultPermissions[selectedRole.level] || [];
      setCheckedPermissions(perms);
      setHasChanges(false);
    }
  }, [selectedRole, savedPermissions]);

  // 处理勾选
  const handleCheck = (code: string, checked: boolean) => {
    if (selectedRoleReadonly) return;
    setCheckedPermissions(prev => 
      checked ? [...prev, code] : prev.filter(c => c !== code)
    );
    setHasChanges(true);
  };

  // 保存权限
  const handleSave = async () => {
    if (!selectedRole) return;
    if (selectedRoleReadonly) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/permissions/roles/${selectedRole.level}`, {
        method: 'PUT',
        headers: buildAuthHeaders(),
        body: JSON.stringify({ permissions: checkedPermissions }),
      });
      if (!res.ok) {
        throw new Error(`save permissions http ${res.status}`);
      }
      setSavedPermissions(prev => ({
        ...prev,
        [selectedRole.level]: checkedPermissions,
      }));
      setHasChanges(false);
      alert(`「${selectedRole.name}」权限配置已保存`);
    } catch (error) {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 重置权限
  const handleReset = () => {
    if (selectedRoleReadonly) return;
    if (selectedRole) {
      const perms = defaultPermissions[selectedRole.level] || [];
      setCheckedPermissions(perms);
      setHasChanges(false);
    }
  };

  const handleSelectRole = (roleId: string) => {
    const role = visibleRoles.find(r => r.id === roleId);
    if (role) setSelectedRole(role);
  };

  return (
    <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-4 h-full overflow-auto">
      
      {/* 标题栏 */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-cyan-400" />
          <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-blue-300">
            权限管理
          </h2>
        </div>
        <div className="flex gap-3">
          {hasChanges && !selectedRoleReadonly && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm flex items-center gap-2 transition-colors"
            >
              <RotateCcw size={14} />
              重置
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !selectedRole || selectedRoleReadonly}
            className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Save size={14} />
            {selectedRoleReadonly ? '内置全权限' : saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      {/* 双栏布局 */}
      <div className="flex gap-4 min-h-[550px]">
        
        {/* 左侧：角色树 + 搜索 */}
        <div className="w-72 bg-slate-800/30 rounded-xl border border-cyan-400/20 overflow-hidden flex-shrink-0 flex flex-col">
          <div className="p-3 border-b border-cyan-400/20 bg-slate-800/50">
            <h3 className="font-semibold text-cyan-300 text-sm mb-2">角色组织架构</h3>
            {/* 角色搜索 */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-cyan-400" />
              <input
                type="text"
                placeholder="搜索角色..."
                value={roleSearchKeyword}
                onChange={(e) => setRoleSearchKeyword(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
              {roleSearchKeyword && (
                <button 
                  onClick={() => setRoleSearchKeyword('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2"
                >
                  <X size={12} className="text-slate-400" />
                </button>
              )}
            </div>
          </div>
          
          {/* 角色树 */}
          <div className="flex-1 overflow-y-auto p-2">
            {loadingAccounts ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                正在加载数据库账号...
              </div>
            ) : filteredRoleTree.length > 0 ? (
              filteredRoleTree.map(node => (
                <RoleTreeItem
                  key={node.id}
                  node={node}
                  level={0}
                  selectedRoleId={selectedRole?.id || null}
                  onSelect={handleSelectRole}
                  searchKeyword={roleSearchKeyword}
                />
              ))
            ) : (
              <div className="text-center py-8 text-slate-500 text-xs">
                数据库中未找到可配置权限的管理员账号
              </div>
            )}
          </div>
          
          {/* 当前选中角色信息 */}
          {selectedRole && (
            <div className="p-3 border-t border-cyan-400/20 bg-slate-800/50">
              <div className="text-xs text-slate-400">当前角色</div>
              <div className="text-sm font-medium text-cyan-300 mt-0.5">{selectedRole.name}</div>
              <div className="text-xs text-slate-500 mt-1">{selectedRole.description}</div>
            </div>
          )}
        </div>

        {/* 右侧：权限分组卡片布局 */}
        <div className="flex-1 bg-slate-800/30 rounded-xl border border-cyan-400/20 overflow-hidden flex flex-col">
          
          {/* 头部 */}
          <div className="p-3 border-b border-cyan-400/20 bg-slate-800/50">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-cyan-300 text-sm">
                  权限配置
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedRoleReadonly
                    ? `「${selectedRole?.name}」是系统内置全权限，无需赋权`
                    : `为「${selectedRole?.name || '请选择角色'}」分配模块权限`}
                </p>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-cyan-400" />
                <input
                  type="text"
                  placeholder="搜索权限..."
                  value={permSearchKeyword}
                  onChange={(e) => setPermSearchKeyword(e.target.value)}
                  className="w-44 bg-slate-700/50 border border-slate-600 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
                {permSearchKeyword && (
                  <button 
                    onClick={() => setPermSearchKeyword('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2"
                  >
                    <X size={12} className="text-slate-400" />
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {/* 权限模块 - 网格布局 */}
          <div className="flex-1 overflow-y-auto p-4">
            {!selectedRole ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                <Shield size={48} className="mx-auto mb-3 opacity-30" />
                <p>请从左侧选择一个角色开始配置权限</p>
              </div>
            ) : filteredPermissions.length > 0 ? (
              <div className="grid grid-cols-4 gap-3">
                {filteredPermissions.map(module => (
                  <PermissionCard
                    key={module.id}
                    module={module}
                    checkedKeys={checkedPermissions}
                    onCheck={handleCheck}
                    readonly={selectedRoleReadonly}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 text-sm">
                未找到匹配的权限模块
              </div>
            )}
          </div>
          
          {/* 底部统计 */}
          <div className="p-3 border-t border-cyan-400/20 bg-slate-800/30 flex justify-between items-center">
            <span className="text-xs text-slate-400">
              已选择 <span className="text-cyan-400 font-bold">{checkedPermissions.length}</span> 项权限
            </span>
            <span className="text-xs text-slate-500">
              共 {permissionTree.reduce((acc, m) => acc + (m.children?.length || 0), 0)} 项系统权限
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
