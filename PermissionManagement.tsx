import React, { useState, useEffect } from 'react';
import { Shield, Save, RotateCcw, ChevronRight, ChevronDown, Search, X, Building2, FolderTree, Users } from 'lucide-react';

// ============================================
// 类型定义
// ============================================
interface Role {
  id: string;
  name: string;
  code: string;
  level: 'headquarters_admin' | 'branch_admin' | 'project_safety_admin' | 'team_admin';
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

// ============================================
// 静态数据
// ============================================
const roles: Role[] = [
  { id: '1', name: '系统管理员', code: 'headquarters_admin', level: 'headquarters_admin', description: '拥有所有系统权限' },
  { id: '2', name: '中铁一局管理员', code: 'branch_admin', level: 'branch_admin', company: '中铁一局', description: '中铁一局全权限' },
  { id: '3', name: '西安地铁8号线管理员', code: 'project_safety_admin', level: 'project_safety_admin', company: '中铁一局', project: '西安地铁8号线', description: '项目管理权限' },
  { id: '4', name: '土建工队管理员', code: 'team_admin', level: 'team_admin', company: '中铁一局', project: '西安地铁8号线', team: '土建工队', description: '土建工队管理' },
  { id: '5', name: '机电工队管理员', code: 'team_admin', level: 'team_admin', company: '中铁一局', project: '西安地铁8号线', team: '机电工队', description: '机电工队管理' },
  { id: '6', name: '安全工队管理员', code: 'team_admin', level: 'team_admin', company: '中铁一局', project: '西安地铁8号线', team: '安全工队', description: '安全工队管理' },
  { id: '7', name: '西安地铁10号线管理员', code: 'project_safety_admin', level: 'project_safety_admin', company: '中铁一局', project: '西安地铁10号线', description: '项目管理权限' },
  { id: '8', name: '中铁隧道局管理员', code: 'branch_admin', level: 'branch_admin', company: '中铁隧道局', description: '隧道局全权限' },
  { id: '9', name: '隧道工队管理员', code: 'team_admin', level: 'team_admin', company: '中铁隧道局', project: '西安地铁10号线', team: '隧道工队', description: '隧道工队管理' },
];

// 角色树形结构数据
const roleTreeData: RoleTreeNode[] = [
  {
    id: 'hq',
    name: '总部',
    type: 'company',
    children: [
      {
        id: 'hq-admin',
        name: '系统管理员',
        type: 'role',
        roleId: '1'
      }
    ]
  },
  {
    id: 'company1',
    name: '中铁一局',
    type: 'company',
    children: [
      {
        id: 'company1-admin',
        name: '分公司管理员',
        type: 'role',
        roleId: '2'
      },
      {
        id: 'project1',
        name: '西安地铁8号线',
        type: 'project',
        children: [
          {
            id: 'project1-admin',
            name: '项目管理员',
            type: 'role',
            roleId: '3'
          },
          {
            id: 'team1',
            name: '土建工队',
            type: 'team',
            children: [
              { id: 'team1-admin', name: '土建工队管理员', type: 'role', roleId: '4' }
            ]
          },
          {
            id: 'team2',
            name: '机电工队',
            type: 'team',
            children: [
              { id: 'team2-admin', name: '机电工队管理员', type: 'role', roleId: '5' }
            ]
          },
          {
            id: 'team3',
            name: '安全工队',
            type: 'team',
            children: [
              { id: 'team3-admin', name: '安全工队管理员', type: 'role', roleId: '6' }
            ]
          }
        ]
      },
      {
        id: 'project2',
        name: '西安地铁10号线',
        type: 'project',
        children: [
          {
            id: 'project2-admin',
            name: '项目管理员',
            type: 'role',
            roleId: '7'
          }
        ]
      }
    ]
  },
  {
    id: 'company2',
    name: '中铁隧道局',
    type: 'company',
    children: [
      {
        id: 'company2-admin',
        name: '分公司管理员',
        type: 'role',
        roleId: '8'
      },
      {
        id: 'project3',
        name: '西安地铁10号线',
        type: 'project',
        children: [
          {
            id: 'team4',
            name: '隧道工队',
            type: 'team',
            children: [
              { id: 'team4-admin', name: '隧道工队管理员', type: 'role', roleId: '9' }
            ]
          }
        ]
      }
    ]
  }
];

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

// 各角色默认权限
const defaultPermissions: Record<string, string[]> = {
  headquarters_admin: [
    'dashboard.view',
    'monitor.playback', 'monitor.track', 'monitor.voice', 'monitor.camera',
    'fence.view', 'fence.create', 'fence.edit', 'fence.delete',
    'device.view', 'device.create', 'device.edit', 'device.delete',
    'personnel.view', 'personnel.create', 'personnel.edit', 'personnel.delete',
    'alarm.view', 'alarm.handle',
    'system.role', 'system.log',
  ],
  branch_admin: [
    'dashboard.view',
    'monitor.playback', 'monitor.track', 'monitor.voice', 'monitor.camera',
    'fence.view', 'fence.create', 'fence.edit', 'fence.delete',
    'device.view', 'device.create', 'device.edit',
    'personnel.view', 'personnel.create', 'personnel.edit',
    'alarm.view', 'alarm.handle',
  ],
  project_safety_admin: [
    'dashboard.view',
    'monitor.playback', 'monitor.track', 'monitor.voice',
    'fence.view', 'fence.create',
    'device.view',
    'personnel.view',
    'alarm.view', 'alarm.handle',
  ],
  team_admin: [
    'dashboard.view',
    'monitor.playback',
    'personnel.view',
    'alarm.view',
  ],
};

// 颜色映射
const colorMap: Record<string, string> = {
  cyan: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400',
  purple: 'bg-purple-500/20 border-purple-500/30 text-purple-400',
  blue: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
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
}

const PermissionCard: React.FC<PermissionCardProps> = ({ module, checkedKeys, onCheck }) => {
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
            <label key={perm.code} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-700/50 transition-colors">
              <input
                type="checkbox"
                checked={isChecked}
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
  const [checkedPermissions, setCheckedPermissions] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [roleSearchKeyword, setRoleSearchKeyword] = useState('');
  const [permSearchKeyword, setPermSearchKeyword] = useState('');
  const [saving, setSaving] = useState(false);

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

  const filteredRoleTree = filterRoleTree(roleTreeData);

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
      const perms = defaultPermissions[selectedRole.level] || [];
      setCheckedPermissions(perms);
      setHasChanges(false);
    }
  }, [selectedRole]);

  // 处理勾选
  const handleCheck = (code: string, checked: boolean) => {
    setCheckedPermissions(prev => 
      checked ? [...prev, code] : prev.filter(c => c !== code)
    );
    setHasChanges(true);
  };

  // 保存权限
  const handleSave = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      console.log('保存权限:', {
        roleId: selectedRole.id,
        roleName: selectedRole.name,
        permissions: checkedPermissions
      });
      await new Promise(resolve => setTimeout(resolve, 500));
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
    if (selectedRole) {
      const perms = defaultPermissions[selectedRole.level] || [];
      setCheckedPermissions(perms);
      setHasChanges(false);
    }
  };

  const handleSelectRole = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
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
          {hasChanges && (
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
            disabled={saving || !selectedRole}
            className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? '保存中...' : '保存配置'}
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
            {filteredRoleTree.length > 0 ? (
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
                未找到匹配的角色
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
                  为「{selectedRole?.name || '请选择角色'}」分配模块权限
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
