import axios from 'axios';
import { API_BASE_URL, attachAuthInterceptor } from './config';

const unitApi = attachAuthInterceptor(axios.create({
  baseURL: `${API_BASE_URL}/api/responsibility-units`,
}));

export type UnitType = 'branch' | 'project' | 'safety_office' | 'grid' | 'team' | 'personnel' | 'division' | 'workshop' | 'site' | 'subproject';

export interface ResponsibilityUnit {
  id: string;
  unit_id: string;
  name: string;
  type: UnitType;
  parent_id?: string;
  project_id?: string;
  grid_id?: string;
  team_id?: string;
  personnel_id?: string;
  responsible_person_id?: string;
  responsible_person_name?: string;
  safety_office_role?: string;
  level: number;
  is_under_construction: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface UnitTreeNode extends ResponsibilityUnit {
  children: UnitTreeNode[];
}

const hiddenUnitTypes = new Set(['personnel', 'safety_office', 'division', 'workshop', 'site', 'subproject']);

const hideLegacyUnits = <T extends ResponsibilityUnit>(items: T[]): T[] =>
  items
    .filter((item) => !hiddenUnitTypes.has(item.type))
    .map((item) => ({
      ...item,
      children: 'children' in item && Array.isArray((item as UnitTreeNode).children)
        ? hideLegacyUnits((item as UnitTreeNode).children)
        : undefined,
    })) as T[];

export const unitApiClient = {
  getUnits: async (unit_type?: string, parent_id?: string): Promise<ResponsibilityUnit[]> => {
    const params: Record<string, any> = {};
    if (unit_type) params.unit_type = unit_type;
    if (parent_id !== undefined) params.parent_id = parent_id;
    const response = await unitApi.get('/', { params });
    return Array.isArray(response.data) ? hideLegacyUnits(response.data) : [];
  },

  getTree: async (): Promise<UnitTreeNode[]> => {
    const response = await unitApi.get('/tree');
    return Array.isArray(response.data) ? hideLegacyUnits(response.data) : [];
  },

  getUnitById: async (unitId: string): Promise<ResponsibilityUnit> => {
    const response = await unitApi.get(`/${unitId}`);
    return response.data;
  },

  createUnit: async (data: Omit<ResponsibilityUnit, 'id' | 'created_at' | 'updated_at'>): Promise<ResponsibilityUnit> => {
    const response = await unitApi.post('/', data);
    return response.data;
  },

  updateUnit: async (unitId: string, data: Partial<ResponsibilityUnit>): Promise<ResponsibilityUnit> => {
    const response = await unitApi.put(`/${unitId}`, data);
    return response.data;
  },

  deleteUnit: async (unitId: string): Promise<void> => {
    await unitApi.delete(`/${unitId}`);
  },

  moveUp: async (unitId: string): Promise<ResponsibilityUnit> => {
    const response = await unitApi.post(`/${unitId}/move-up`);
    return response.data;
  },

  moveDown: async (unitId: string): Promise<ResponsibilityUnit> => {
    const response = await unitApi.post(`/${unitId}/move-down`);
    return response.data;
  },

  changeParent: async (unitId: string, newParentId: string): Promise<ResponsibilityUnit> => {
    const response = await unitApi.post(`/${unitId}/change-parent`, null, {
      params: { new_parent_id: newParentId },
    });
    return response.data;
  },
};

export const unitTypeNames: Record<UnitType, string> = {
  branch: '分公司',
  project: '项目部',
  safety_office: '项目安监办',
  grid: '责任单元/网格',
  team: '作业队伍/班组',
  personnel: '作业人员',
  division: '项目部',
  workshop: '项目安监办',
  site: '责任单元/网格',
  subproject: '作业队伍/班组',
};
