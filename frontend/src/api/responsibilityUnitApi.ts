import axios from 'axios';
import { API_BASE_URL } from './config';

const unitApi = axios.create({
  baseURL: `${API_BASE_URL}/api/responsibility-units`,
});

export interface ResponsibilityUnit {
  id: string;
  unit_id: string;
  name: string;
  type: UnitType;
  parent_id?: string;
  level: number;
  is_under_construction: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type UnitType = 'division' | 'workshop' | 'site' | 'subproject';

export interface UnitTreeNode extends ResponsibilityUnit {
  children: UnitTreeNode[];
}

export const unitApiClient = {
  // 获取单元列表
  getUnits: async (unit_type?: string, parent_id?: string): Promise<ResponsibilityUnit[]> => {
    const params: Record<string, any> = {};
    if (unit_type) params.unit_type = unit_type;
    if (parent_id !== undefined) params.parent_id = parent_id;
    const response = await unitApi.get('/', { params });
    return response.data;
  },

  // 获取树形结构
  getTree: async (): Promise<UnitTreeNode[]> => {
    const response = await unitApi.get('/tree');
    return response.data;
  },

  // 获取单元详情
  getUnitById: async (unitId: string): Promise<ResponsibilityUnit> => {
    const response = await unitApi.get(`/${unitId}`);
    return response.data;
  },

  // 创建单元
  createUnit: async (data: Omit<ResponsibilityUnit, 'id' | 'created_at' | 'updated_at'>): Promise<ResponsibilityUnit> => {
    const response = await unitApi.post('/', data);
    return response.data;
  },

  // 更新单元
  updateUnit: async (unitId: string, data: Partial<ResponsibilityUnit>): Promise<ResponsibilityUnit> => {
    const response = await unitApi.put(`/${unitId}`, data);
    return response.data;
  },

  // 删除单元
  deleteUnit: async (unitId: string): Promise<void> => {
    await unitApi.delete(`/${unitId}`);
  },

  // 上移
  moveUp: async (unitId: string): Promise<ResponsibilityUnit> => {
    const response = await unitApi.post(`/${unitId}/move-up`);
    return response.data;
  },

  // 下移
  moveDown: async (unitId: string): Promise<ResponsibilityUnit> => {
    const response = await unitApi.post(`/${unitId}/move-down`);
    return response.data;
  },

  // 变更上级
  changeParent: async (unitId: string, newParentId: string): Promise<ResponsibilityUnit> => {
    const response = await unitApi.post(`/${unitId}/change-parent?new_parent_id=${newParentId}`);
    return response.data;
  },
};

// 类型名称映射
export const unitTypeNames: Record<string, string> = {
  division: '分部',
  workshop: '工区',
  site: '工点',
  subproject: '分部工程',
};
