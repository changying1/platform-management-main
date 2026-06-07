import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, X } from 'lucide-react';
import { API_BASE_URL, getAuthHeaders } from '../../../../src/api/config';
import type { ResponsibilityUnit, UnitType } from '../../../../src/api/responsibilityUnitApi';
import { unitTypeNames } from '../../../../src/api/responsibilityUnitApi';

interface UnitFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  editUnit?: ResponsibilityUnit | null;
  parentUnit?: { unit_id: string; name: string; type?: string; project_id?: string } | null;
  allUnits?: ResponsibilityUnit[];
}

interface ProjectOption { id: number | string; name: string }
interface GridOption { grid_id: string; name: string; project_id?: string }
interface TeamOption { team_id: string; name: string; project?: string }
interface PersonnelOption { id: string; username: string; project?: string; team?: string; workTeam?: string }

const unitTypes: UnitType[] = ['project', 'safety_office', 'grid', 'team'];
const inputClass = 'w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-cyan-400 disabled:opacity-50';

const EMPTY_FORM = {
  unit_id: '',
  name: '',
  type: 'project' as UnitType,
  parent_id: '',
  project_id: '',
  grid_id: '',
  team_id: '',
  personnel_id: '',
  responsible_person_id: '',
  safety_office_role: '',
  is_under_construction: true,
};

const nextTypeByParent: Record<string, UnitType> = {
  project: 'safety_office',
  safety_office: 'grid',
  grid: 'team',
  team: 'personnel',
};

const allowedParentType: Record<string, string> = {
  safety_office: 'project',
  grid: 'safety_office',
  team: 'grid',
  personnel: 'team',
};

export const UnitFormModal: React.FC<UnitFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editUnit,
  parentUnit,
  allUnits = [],
}) => {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [grids, setGrids] = useState<GridOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [personnel, setPersonnel] = useState<PersonnelOption[]>([]);
  const [selectedProjectKey, setSelectedProjectKey] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const headers = getAuthHeaders();
    Promise.all([
      fetch(`${API_BASE_URL}/projects`, { headers }).then((response) => (response.ok ? response.json() : [])),
      fetch(`${API_BASE_URL}/api/grids/`, { headers }).then((response) => (response.ok ? response.json() : [])),
      fetch(`${API_BASE_URL}/team/list`, { headers }).then((response) => (response.ok ? response.json() : [])),
      fetch(`${API_BASE_URL}/api/personnel/`, { headers }).then((response) => (response.ok ? response.json() : [])),
    ])
      .then(([projectData, gridData, teamData, personnelData]) => {
        setProjects(Array.isArray(projectData) ? projectData : []);
        setGrids(Array.isArray(gridData) ? gridData : []);
        setTeams(Array.isArray(teamData) ? teamData : []);
        setPersonnel(Array.isArray(personnelData) ? personnelData : []);
      })
      .catch(() => {
        setProjects([]);
        setGrids([]);
        setTeams([]);
        setPersonnel([]);
      });
  }, [isOpen]);

  useEffect(() => {
    if (editUnit) {
      setFormData({
        unit_id: editUnit.unit_id,
        name: editUnit.name,
        type: editUnit.type,
        parent_id: editUnit.parent_id || '',
        project_id: editUnit.project_id || '',
        grid_id: editUnit.grid_id || '',
        team_id: editUnit.team_id || '',
        personnel_id: editUnit.personnel_id || '',
        responsible_person_id: editUnit.responsible_person_id || '',
        safety_office_role: editUnit.safety_office_role || '',
        is_under_construction: editUnit.is_under_construction,
      });
      setSelectedProjectKey(editUnit.project_id || '');
      return;
    }

    const nextType = parentUnit ? nextTypeByParent[parentUnit.type || ''] || 'safety_office' : 'project';
    setFormData({
      ...EMPTY_FORM,
      type: nextType,
      parent_id: parentUnit?.unit_id || '',
      project_id: parentUnit?.project_id || (parentUnit?.type === 'project' ? parentUnit.unit_id.replace(/^PRJ-/, '') : ''),
    });
    setSelectedProjectKey('');
  }, [editUnit, parentUnit, isOpen]);

  const parentOptions = useMemo(() => {
    if (formData.type === 'project') return [];
    const requiredParentType = allowedParentType[formData.type];
    return allUnits.filter((unit) => unit.type === requiredParentType);
  }, [allUnits, formData.type]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (event.target as HTMLInputElement).checked : value,
    }));
  };

  const handleProjectSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const key = event.target.value;
    const project = projects.find((item) => String(item.id) === key);
    setSelectedProjectKey(key);
    setFormData((prev) => ({
      ...prev,
      unit_id: project ? `PRJ-${project.id}` : '',
      name: project ? `${project.name}项目部` : '',
      project_id: project ? String(project.id) : '',
      parent_id: '',
      type: 'project',
    }));
  };

  const handleParentSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const parentId = event.target.value;
    const parent = allUnits.find((unit) => unit.unit_id === parentId);
    const inheritedProjectId = parent?.project_id || (parent?.type === 'project' ? parent.unit_id.replace(/^PRJ-/, '') : '');
    setFormData((prev) => ({
      ...prev,
      parent_id: parentId,
      project_id: inheritedProjectId || prev.project_id,
    }));
  };

  const handleGridSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const gridId = event.target.value;
    const grid = grids.find((item) => item.grid_id === gridId);
    setFormData((prev) => ({
      ...prev,
      grid_id: gridId,
      unit_id: grid ? `GRID-${grid.grid_id}` : '',
      name: grid?.name || '',
      project_id: grid?.project_id || prev.project_id,
    }));
  };

  const handleTeamSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const teamId = event.target.value;
    const team = teams.find((item) => item.team_id === teamId);
    setFormData((prev) => ({
      ...prev,
      team_id: teamId,
      unit_id: team ? `TEAM-${team.team_id}` : '',
      name: team?.name || '',
    }));
  };

  const handlePersonnelSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const personnelId = event.target.value;
    const person = personnel.find((item) => item.id === personnelId);
    setFormData((prev) => ({
      ...prev,
      personnel_id: personnelId,
      unit_id: person ? `P-${person.id}` : '',
      name: person?.username || '',
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const effectiveParentId = parentUnit?.unit_id || formData.parent_id;
    if (formData.type === 'project' && !formData.project_id.trim()) {
      alert('项目部必须选择已有项目');
      return;
    }
    if (formData.type !== 'project' && !effectiveParentId) {
      alert('项目以下节点必须选择上级节点');
      return;
    }
    if (formData.type === 'safety_office' && !formData.safety_office_role.trim()) {
      alert('安监办节点必须填写岗位角色');
      return;
    }
    if (formData.type === 'grid' && !formData.grid_id.trim()) {
      alert('责任单元/网格节点必须选择网格');
      return;
    }
    if (formData.type === 'team' && !formData.team_id.trim()) {
      alert('班组节点必须选择班组');
      return;
    }
    if (formData.type === 'personnel' && !formData.personnel_id.trim()) {
      alert('人员节点必须选择人员');
      return;
    }

    onSubmit({
      ...formData,
      parent_id: effectiveParentId || null,
      project_id: formData.project_id || null,
      grid_id: formData.grid_id || null,
      team_id: formData.team_id || null,
      personnel_id: formData.personnel_id || null,
      responsible_person_id: formData.responsible_person_id || null,
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-[640px] max-h-[92vh] overflow-hidden border border-white/20 shadow-2xl">
        <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">
            {editUnit ? '编辑责任节点' : parentUnit ? `新建下级：${parentUnit.name}` : '新建项目责任体系'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(92vh-88px)]">
          <div className="grid grid-cols-2 gap-4">
            <Field label="节点类型" required>
              <input value={unitTypeNames[formData.type] || formData.type} disabled className={inputClass} />
            </Field>
            <Field label="节点编号" required>
              <input value={formData.unit_id} disabled className={inputClass} placeholder="选择后自动生成" />
            </Field>
          </div>

          {formData.type === 'project' && (
            <Field label="关联项目" required>
              <select value={selectedProjectKey} onChange={handleProjectSelect} className={inputClass} disabled={!!editUnit}>
                <option value="" className="bg-slate-800 text-white">请选择已有项目</option>
                {projects.map((project) => (
                  <option key={String(project.id)} value={String(project.id)} className="bg-slate-800 text-white">
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {formData.type !== 'project' && (
            <Field label="所属上级" required>
              {parentUnit ? (
                <input value={`${parentUnit.name}（${unitTypeNames[parentUnit.type as UnitType] || parentUnit.type || ''}）`} disabled className={inputClass} />
              ) : (
                <select name="parent_id" value={formData.parent_id} onChange={handleParentSelect} className={inputClass}>
                  <option value="" className="bg-slate-800 text-white">请选择所属上级</option>
                  {parentOptions.map((unit) => (
                    <option key={unit.unit_id} value={unit.unit_id} className="bg-slate-800 text-white">
                      {unit.name}（{unitTypeNames[unit.type] || unit.type}）
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          {formData.type === 'grid' && (
            <Field label="关联网格" required>
              <select value={formData.grid_id} onChange={handleGridSelect} className={inputClass}>
                <option value="" className="bg-slate-800 text-white">请选择网格</option>
                {grids.map((grid) => (
                  <option key={grid.grid_id} value={grid.grid_id} className="bg-slate-800 text-white">
                    {grid.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {formData.type === 'team' && (
            <Field label="关联班组" required>
              <select value={formData.team_id} onChange={handleTeamSelect} className={inputClass}>
                <option value="" className="bg-slate-800 text-white">请选择班组</option>
                {teams.map((team) => (
                  <option key={team.team_id} value={team.team_id} className="bg-slate-800 text-white">
                    {team.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {formData.type === 'personnel' && (
            <Field label="绑定人员" required>
              <select value={formData.personnel_id} onChange={handlePersonnelSelect} className={inputClass}>
                <option value="" className="bg-slate-800 text-white">请选择人员</option>
                {personnel.map((person) => (
                  <option key={person.id} value={person.id} className="bg-slate-800 text-white">
                    {person.username}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="节点名称" required>
            <input value={formData.name} disabled={formData.type !== 'safety_office'} onChange={handleChange} name="name" required className={inputClass} placeholder="选择对象后自动带出" />
          </Field>

          <div className="grid grid-cols-1 gap-4">
            <Field label="所属项目ID">
              <input value={formData.project_id} disabled className={inputClass} placeholder="由项目或上级节点自动带出" />
            </Field>
          </div>

          {formData.type === 'safety_office' && (
            <Field label="安监办岗位" required>
              <input name="safety_office_role" value={formData.safety_office_role} onChange={handleChange} className={inputClass} placeholder="主任、常务副主任、副主任、安监专务" />
            </Field>
          )}

          <label className="flex items-center gap-2 cursor-pointer mb-6">
            <input type="checkbox" name="is_under_construction" checked={formData.is_under_construction} onChange={handleChange} className="w-4 h-4 rounded border-white/20 bg-white/10 text-cyan-500 focus:ring-cyan-500" />
            <span className="text-white/80 text-sm">纳入施工期责任监管</span>
          </label>

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">取消</button>
            <button type="submit" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:from-cyan-400 hover:to-blue-400 transition-colors">
              <Save size={16} />
              <span>{editUnit ? '保存' : '创建'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-white/80 mb-2">
      {label} {required && <span className="text-red-400">*</span>}
    </label>
    {children}
  </div>
);
