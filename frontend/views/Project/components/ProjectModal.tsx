import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ProjectFormData, User, Device, Region, Branch, Team } from '../types';
import { getApiUrl, getAuthHeaders } from '@/src/api/config';

interface ProjectModalProps {
  isEdit?: boolean;
  initialData?: ProjectFormData;
  onClose: () => void;
  onSuccess: () => void;
}

const formatApiError = (status: number, payload: unknown): string => {
  if (!payload) return `HTTP ${status}`;
  if (typeof payload === 'string') return payload || `HTTP ${status}`;

  if (typeof payload === 'object') {
    const data = payload as { detail?: unknown; message?: unknown; error?: unknown };
    const detail = data.detail ?? data.message ?? data.error;

    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (!item || typeof item !== 'object') return String(item);
          const errorItem = item as { loc?: unknown[]; msg?: string };
          const field = Array.isArray(errorItem.loc) ? errorItem.loc.join('.') : '';
          return field ? `${field}: ${errorItem.msg || '校验失败'}` : errorItem.msg || JSON.stringify(item);
        })
        .join('\n');
    }

    if (detail) return typeof detail === 'string' ? detail : JSON.stringify(detail);
    return JSON.stringify(payload);
  }

  return `HTTP ${status}`;
};

const readApiError = async (res: Response): Promise<string> => {
  const contentType = res.headers.get('content-type') || '';
  try {
    const payload = contentType.includes('application/json') ? await res.json() : await res.text();
    return formatApiError(res.status, payload);
  } catch {
    return `HTTP ${res.status} ${res.statusText}`;
  }
};

const asArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const data = value as { data?: unknown; list?: unknown; items?: unknown; records?: unknown; devices?: unknown };
    const nested = data.data ?? data.list ?? data.items ?? data.records ?? data.devices;
    if (Array.isArray(nested)) return nested as T[];
  }
  return [];
};

const hasBrokenName = (value?: string | null) => {
  const text = String(value || '').trim();
  return text.length > 0 && /^[?\s\-()0-9]+$/.test(text);
};

const isTestAccount = (user: User) => {
  const label = `${user.full_name || ''} ${user.username || ''}`.toLowerCase();
  return /\b(test|dup|qa|demo|mock|dummy)\b/.test(label) || label.includes('test-') || label.includes('dup-');
};

const normalizeUsers = (users: User[], project: Pick<ProjectFormData, 'name' | 'branch_id'> & { id?: number }) => {
  const seen = new Set<string>();
  const projectId = String(project.id || '').trim();
  const projectName = String(project.name || '').trim();
  const branchId = String(project.branch_id || '').trim();

  return users.filter((user) => {
    const id = String(user.id || '').trim();
    const username = String(user.username || '').trim();
    const fullName = String(user.full_name || '').trim();
    const key = (username || fullName || id).toLowerCase();
    const level = String(user.permission_level || '').toLowerCase();
    const role = String(user.role || '').toUpperCase();
    const userProjectId = String(user.project_id || '').trim();
    const userProjectName = String(user.project || '').trim();
    const userBranchId = String(user.branch_id || user.department_id || '').trim();

    if (!key || seen.has(key)) return false;
    seen.add(key);

    if (hasBrokenName(fullName || username)) return false;
    if (isTestAccount(user)) return false;
    if (level === 'headquarters_admin' || level === 'branch_admin' || role === 'HQ' || role === 'ADMIN' || role === 'BRANCH') return false;

    if (userProjectId || userProjectName) {
      return Boolean(
        (projectId && userProjectId === projectId) ||
        (projectName && userProjectName === projectName),
      );
    }

    if (projectId || projectName) return false;

    if (branchId && userBranchId && userBranchId !== branchId) return false;

    return Boolean(branchId && userBranchId);
  });
};

const normalizeDevices = (devices: any[]): Device[] => {
  const seen = new Set<string>();

  return devices
    .map((device) => {
      const id = String(device.id || device.device_id || device.device_code || device.raw_id || '').trim();
      const name = String(device.device_name || device.name || device.device_id || device.device_code || id).trim();
      const status = String(device.status || '').toLowerCase();

      return {
        id,
        device_name: name,
        device_type: String(device.device_type || device.type || ''),
        is_online: Boolean(device.is_online) || status === 'online',
      };
    })
    .filter((device) => {
      if (!device.id || seen.has(device.id)) return false;
      seen.add(device.id);
      return Boolean(device.device_name);
    });
};

const matchesCurrentProject = (
  item: any,
  project: Pick<ProjectFormData, 'name'> & { id?: number | string },
  projectNameFields: string[] = ['project', 'project_name'],
) => {
  const projectId = String(project.id || '').trim();
  const projectName = String(project.name || '').trim();
  const itemProjectId = String(item.project_id || item.projectId || '').trim();
  const itemProjectName = projectNameFields
    .map((field) => String(item[field] || '').trim())
    .find(Boolean) || '';

  if (!itemProjectId && !itemProjectName) return false;
  return Boolean(
    (projectId && itemProjectId === projectId) ||
    (projectName && itemProjectName === projectName),
  );
};

const normalizeGrids = (grids: any[]): Region[] => {
  const seen = new Set<string>();

  return grids
    .map((grid) => {
      const rawId = String(grid.id || grid.grid_id || '').trim();

      return {
        id: rawId,
        name: String(grid.name || grid.grid_id || rawId).trim(),
        coordinates_json: grid.bounds_json || '',
        remark: grid.description || '',
      };
    })
    .filter((grid) => {
      const key = String(grid.id || grid.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return Boolean(grid.name);
    });
};

const normalizeTeams = (teams: any[]): Team[] => {
  const seen = new Set<string>();

  return teams
    .map((team) => ({
      team_id: String(team.team_id || team.id || '').trim(),
      name: String(team.name || team.team_id || team.id || '').trim(),
      project_id: String(team.project_id || '').trim(),
      grid_id: String(team.grid_id || '').trim(),
    }))
    .filter((team) => {
      const key = team.team_id || team.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return Boolean(team.name);
    });
};

export function ProjectModal({ isEdit = false, initialData, onClose, onSuccess }: ProjectModalProps) {
  const [formData, setFormData] = useState<ProjectFormData>(
    initialData || {
      name: '',
      description: '',
      manager: '',
      status: 'active',
      remark: '',
      user_ids: [],
      device_ids: [],
      region_ids: [],
      grid_ids: [],
      team_ids: [],
    }
  );

  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [availableRegions, setAvailableRegions] = useState<Region[]>([]);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 加载可选的用户、设备、区域、分公司
    const headers = getAuthHeaders();
    Promise.all([
      fetch(getApiUrl('/admin/users'), { headers }).then((r) => r.json()).catch(() => []),
      fetch(getApiUrl('/device/list'), { headers }).then((r) => r.json()).catch(() => []),
      fetch(getApiUrl('/api/grids/'), { headers }).then((r) => r.json()).catch(() => []),
      fetch(getApiUrl('/team/list'), { headers }).then((r) => r.json()).catch(() => []),
      // fix: dashboard controller uses /api/dashboard prefix
      fetch(getApiUrl('/api/dashboard/branches'), { headers }).then((r) => r.json()).catch(() => []),
    ]).then(([users, devices, grids, teams, branches]) => {
      const projectContext = {
        ...formData,
        id: (initialData as any)?.id,
      };
      setAvailableUsers(normalizeUsers(asArray<User>(users), {
        ...projectContext,
      }));
      setAvailableDevices(normalizeDevices(asArray<any>(devices).filter((device) => matchesCurrentProject(device, projectContext))));
      setAvailableRegions(normalizeGrids(asArray<any>(grids).filter((grid) => matchesCurrentProject(grid, projectContext, []))));
      setAvailableTeams(normalizeTeams(asArray<any>(teams).filter((team) => matchesCurrentProject(team, projectContext))));
      // fix: ensure branches is an array to avoid map error
      setAvailableBranches(Array.isArray(branches) ? branches : []);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = isEdit ? getApiUrl(`/projects/${(initialData as any).id}`) : getApiUrl('/projects/');
      const method = isEdit ? 'PUT' : 'POST';
      const payload = {
        ...formData,
        branch_id: formData.branch_id || undefined,
        user_ids: formData.user_ids.filter((id) => Number.isFinite(id)),
        device_ids: formData.device_ids.filter(Boolean),
        region_ids: formData.region_ids.filter((id) => Number.isFinite(id)),
        grid_ids: formData.grid_ids.filter(Boolean),
        team_ids: formData.team_ids.filter(Boolean),
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await readApiError(res));
      onSuccess();
    } catch (error) {
      console.error('Error saving project:', error);
      const message = error instanceof Error ? error.message : String(error);
      alert(`${isEdit ? '更新失败' : '创建失败'}\n\n原因：${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">{isEdit ? '编辑项目' : '新建项目'}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {/* 基本信息 */}
            <div>
              <label className="block text-white font-semibold mb-2">
                项目名称 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                placeholder="请输入项目名称"
              />
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">项目描述</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                placeholder="请输入项目描述"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white font-semibold mb-2">项目经理</label>
                <input
                  type="text"
                  value={formData.manager}
                  onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                  placeholder="请输入项目经理"
                />
              </div>

              <div>
                <label className="block text-white font-semibold mb-2">项目状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="active">进行中</option>
                  <option value="completed">已完成</option>
                  <option value="paused">已暂停</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-white font-semibold mb-2">所属分公司</label>
              <select
                value={formData.branch_id || ''}
                onChange={(e) => setFormData({ ...formData, branch_id: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">无 (直属总部)</option>
                {availableBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 关联选择 */}
            <div>
              <label className="block text-white font-semibold mb-2">项目人员</label>
              <select
                multiple
                value={formData.user_ids.map(String)}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (opt: HTMLOptionElement) =>
                    Number(opt.value)
                  ).filter((id) => Number.isFinite(id));
                  setFormData({ ...formData, user_ids: selected });
                }}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                size={5}
              >
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.username} ({user.username})
                  </option>
                ))}
              </select>
              <p className="text-gray-400 text-xs mt-1">按住 Ctrl/Cmd 可多选</p>
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">项目设备</label>
              <select
                multiple
                value={formData.device_ids}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (opt: HTMLOptionElement) => opt.value);
                  setFormData({ ...formData, device_ids: selected });
                }}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                size={5}
              >
                {availableDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.device_name} ({device.id}) - {device.is_online ? '在线' : '离线'}
                  </option>
                ))}
              </select>
              <p className="text-gray-400 text-xs mt-1">按住 Ctrl/Cmd 可多选</p>
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">项目网格</label>
              <select
                multiple
                value={formData.grid_ids}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (opt: HTMLOptionElement) => opt.value);
                  setFormData({ ...formData, grid_ids: selected });
                }}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                size={5}
              >
                {availableRegions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
              <p className="text-gray-400 text-xs mt-1">按住 Ctrl/Cmd 可多选</p>
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">项目工队</label>
              <select
                multiple
                value={formData.team_ids}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (opt: HTMLOptionElement) => opt.value);
                  setFormData({ ...formData, team_ids: selected });
                }}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                size={5}
              >
                {availableTeams.map((team) => (
                  <option key={team.team_id} value={team.team_id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <p className="text-gray-400 text-xs mt-1">按住 Ctrl/Cmd 可多选</p>
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">备注</label>
              <textarea
                value={formData.remark}
                onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                placeholder="请输入备注"
                rows={2}
              />
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <Loader2 className="animate-spin" size={16} />}
              {isEdit ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
