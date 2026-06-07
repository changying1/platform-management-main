import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, Search, Trash2, UsersRound, X } from 'lucide-react';
import { API_BASE_URL, getAuthHeaders } from '../src/api/config';
import { gridApiClient } from '../src/api/gridApi';
import { hasStoredPermission } from '../src/utils/permissions';
import type { Grid } from '../types';

interface TeamItem {
  team_id: string;
  name: string;
  company?: string;
  project?: string;
  project_id?: string;
  grid_id?: string;
  color?: string;
  fence_ids?: string[];
}

interface ProjectOption {
  id: number;
  name: string;
  branch_name?: string;
}

const emptyForm = {
  name: '',
  project_id: '',
  grid_id: '',
  color: '#06b6d4',
};

const TeamManagement: React.FC = () => {
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [grids, setGrids] = useState<Grid[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamItem | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const canCreatePersonnel = hasStoredPermission('personnel.create');
  const canEditPersonnel = hasStoredPermission('personnel.edit');
  const canDeletePersonnel = hasStoredPermission('personnel.delete');

  const loadTeams = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/team/list`, { headers: getAuthHeaders() });
      const data = response.ok ? await response.json() : [];
      setTeams(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  const loadOptions = async () => {
    const [projectRes, gridList] = await Promise.all([
      fetch(`${API_BASE_URL}/projects/`, { headers: getAuthHeaders() }),
      gridApiClient.getGrids(),
    ]);
    const projectData = projectRes.ok ? await projectRes.json() : [];
    setProjects(Array.isArray(projectData) ? projectData : []);
    setGrids(gridList);
  };

  useEffect(() => {
    loadTeams();
    loadOptions().catch((error) => console.error('加载工队关联数据失败:', error));
  }, []);

  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === formData.project_id),
    [formData.project_id, projects]
  );

  const projectGrids = useMemo(
    () => grids.filter((grid) => !formData.project_id || String(grid.project_id) === formData.project_id),
    [formData.project_id, grids]
  );

  const filteredTeams = teams.filter((team) =>
    [team.name, team.project, team.company, team.team_id, team.grid_id]
      .some((value) => String(value || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const openCreate = () => {
    setEditingTeam(null);
    setFormData(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (team: TeamItem) => {
    setEditingTeam(team);
    const matchedProject = projects.find(
      (project) => String(project.id) === String(team.project_id || '') || project.name === team.project
    );
    setFormData({
      name: team.name || '',
      project_id: matchedProject ? String(matchedProject.id) : String(team.project_id || ''),
      grid_id: team.grid_id || '',
      color: team.color || '#06b6d4',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('请填写工队名称');
      return;
    }
    if (!formData.project_id) {
      alert('请选择所属项目');
      return;
    }

    const payload = {
      name: formData.name.trim(),
      color: formData.color,
      company: selectedProject?.branch_name || '',
      project: selectedProject?.name || '',
      project_id: formData.project_id,
      grid_id: formData.grid_id,
      fence_ids: [],
    };

    try {
      setSaving(true);
      const url = editingTeam
        ? `${API_BASE_URL}/team/update/${editingTeam.team_id}`
        : `${API_BASE_URL}/team/add`;
      const response = await fetch(url, {
        method: editingTeam ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await response.text());
      await loadTeams();
      setModalOpen(false);
      setEditingTeam(null);
      setFormData(emptyForm);
    } catch (error) {
      console.error(error);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (team: TeamItem) => {
    if (!window.confirm(`确定删除工队「${team.name}」吗？`)) return;
    const response = await fetch(`${API_BASE_URL}/team/delete/${team.team_id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      alert('删除失败');
      return;
    }
    await loadTeams();
  };

  const gridName = (gridId?: string) => grids.find((grid) => grid.grid_id === gridId || grid.id === gridId)?.name || '-';

  return (
    <div className="h-full overflow-auto rounded-lg border border-blue-400/30 bg-slate-900/65 p-4 backdrop-blur-md">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[180px] max-w-[280px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="搜索工队名称、项目、网格..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800/50 py-1.5 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/20 px-3 py-1.5 text-cyan-300">
          <UsersRound size={15} />
          <span className="text-sm">工队 {filteredTeams.length}</span>
        </div>
        {canCreatePersonnel && (
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg border border-cyan-500/50 bg-cyan-500/20 px-4 py-1.5 text-sm text-cyan-300 transition-colors hover:bg-cyan-500/30"
          type="button"
        >
          <Plus size={14} />
          新增工队
        </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-700/50 bg-slate-800/30">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-700/30">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">工队编号</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">工队/班组</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">所属项目</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">所属网格</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">所属单位</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">关联围栏</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">加载中...</td></tr>
            ) : filteredTeams.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">暂无工队数据</td></tr>
            ) : filteredTeams.map((team) => (
              <tr key={team.team_id} className="border-t border-slate-700/30 transition-colors hover:bg-slate-800/30">
                <td className="px-4 py-3 text-sm font-semibold text-blue-300">{team.team_id}</td>
                <td className="px-4 py-3 text-sm text-slate-100">{team.name}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{team.project || team.project_id || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{gridName(team.grid_id)}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{team.company || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{team.fence_ids?.length || 0}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {canEditPersonnel && (
                    <button
                      onClick={() => openEdit(team)}
                      className="rounded-lg bg-yellow-500/10 p-2 text-yellow-400 hover:bg-yellow-500/20"
                      title="编辑"
                      type="button"
                    >
                      <Edit2 size={15} />
                    </button>
                    )}
                    {canDeletePersonnel && (
                    <button
                      onClick={() => handleDelete(team)}
                      className="rounded-lg bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"
                      title="删除"
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-[520px] rounded-xl border border-white/20 bg-slate-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-4">
              <h3 className="text-lg font-bold text-white">{editingTeam ? '编辑工队' : '新增工队'}</h3>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">
                  工队名称 <span className="text-red-400">*</span>
                </label>
                <input
                  value={formData.name}
                  onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-white/40 focus:border-cyan-400 focus:outline-none"
                  placeholder="如 土建一队、隧道作业班组"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">
                  所属项目 <span className="text-red-400">*</span>
                </label>
                <select
                  value={formData.project_id}
                  onChange={(event) => setFormData((prev) => ({ ...prev, project_id: event.target.value, grid_id: '' }))}
                  className="w-full rounded-lg border border-white/20 bg-slate-700 px-4 py-2 text-white focus:border-cyan-400 focus:outline-none"
                >
                  <option value="" className="bg-slate-700 text-white">请选择项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id} className="bg-slate-700 text-white">
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">所属网格</label>
                <select
                  value={formData.grid_id}
                  onChange={(event) => setFormData((prev) => ({ ...prev, grid_id: event.target.value }))}
                  className="w-full rounded-lg border border-white/20 bg-slate-700 px-4 py-2 text-white focus:border-cyan-400 focus:outline-none"
                >
                  <option value="" className="bg-slate-700 text-white">暂不绑定网格</option>
                  {projectGrids.map((grid) => (
                    <option key={grid.grid_id || grid.id} value={grid.grid_id || grid.id} className="bg-slate-700 text-white">
                      {grid.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">标识颜色</label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(event) => setFormData((prev) => ({ ...prev, color: event.target.value }))}
                  className="h-10 w-20 rounded-lg border border-white/20 bg-white/10 p-1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg bg-white/10 px-4 py-2 text-white hover:bg-white/20"
                type="button"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamManagement;
