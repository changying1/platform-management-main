import axios from 'axios';
import { API_BASE_URL } from './config';
import type { Grid, GridDetail, GridStats, GridPersonnel } from '../../types';

const gridApi = axios.create({
  baseURL: `${API_BASE_URL}/api/grids`,
});

const gridPersonnelApi = axios.create({
  baseURL: `${API_BASE_URL}/api/grid-personnel`,
});

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);

export const gridApiClient = {
  // 获取网格列表
  getGrids: async (level?: string, status?: string): Promise<Grid[]> => {
    const params: Record<string, any> = {};
    if (level) params.level = level;
    if (status) params.status = status;

    const response = await gridApi.get('/', { params });
    return asArray<Grid>(response.data);
  },

  // 获取网格详情
  getGridById: async (gridId: string): Promise<Grid> => {
    const response = await gridApi.get(`/${gridId}`);
    return response.data;
  },

  // 创建网格
  createGrid: async (data: Omit<Grid, 'id' | 'created_at' | 'updated_at'>): Promise<Grid> => {
    const response = await gridApi.post('/', data);
    return response.data;
  },

  // 更新网格
  updateGrid: async (gridId: string, data: Partial<Grid>): Promise<Grid> => {
    const response = await gridApi.put(`/${gridId}`, data);
    return response.data;
  },

  // 删除网格
  deleteGrid: async (gridId: string): Promise<void> => {
    await gridApi.delete(`/${gridId}`);
  },

  // 获取网格统计数据
  getGridStats: async (): Promise<GridStats> => {
    const response = await gridApi.get('/stats');
    return response.data;
  },
};

export const gridPersonnelApiClient = {
  // 获取责任人员列表
  getPersonnel: async (role?: string, department?: string): Promise<GridPersonnel[]> => {
    const params: Record<string, any> = {};
    if (role) params.role = role;
    if (department) params.department = department;

    const response = await gridPersonnelApi.get('/', { params });
    return asArray<GridPersonnel>(response.data);
  },

  // 获取责任人员详情
  getPersonnelById: async (personnelId: string): Promise<GridPersonnel> => {
    const response = await gridPersonnelApi.get(`/${personnelId}`);
    return response.data;
  },

  // 创建责任人员
  createPersonnel: async (data: Omit<GridPersonnel, 'id' | 'created_at' | 'updated_at'>): Promise<GridPersonnel> => {
    const response = await gridPersonnelApi.post('/', data);
    return response.data;
  },

  // 更新责任人员
  updatePersonnel: async (personnelId: string, data: Partial<GridPersonnel>): Promise<GridPersonnel> => {
    const response = await gridPersonnelApi.put(`/${personnelId}`, data);
    return response.data;
  },

  // 删除责任人员
  deletePersonnel: async (personnelId: string): Promise<void> => {
    await gridPersonnelApi.delete(`/${personnelId}`);
  },

  // 分配网格到责任人员
  assignGrid: async (personnelId: string, gridId: string): Promise<GridPersonnel> => {
    const response = await gridPersonnelApi.post(`/${personnelId}/assign-grid/${gridId}`);
    return response.data;
  },

  // 从责任人员移除网格
  removeGrid: async (personnelId: string, gridId: string): Promise<GridPersonnel> => {
    const response = await gridPersonnelApi.delete(`/${personnelId}/assign-grid/${gridId}`);
    return response.data;
  },
};

// 角色名称映射
export const roleNames: Record<string, string> = {
  grid_manager: '网格长',
  safety_manager: '安全员',
  technician: '技术员',
  inspector: '巡检员',
};

// 层级名称映射
export const levelNames: Record<string, string> = {
  project: '项目级',
  workshop: '工区级',
  team: '班组级',
  workface: '作业面',
};
