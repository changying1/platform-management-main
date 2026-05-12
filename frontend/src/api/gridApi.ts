import axios from 'axios';
import { API_BASE_URL } from './config';
import type { Grid, GridDetail, GridStats, GridPersonnel } from '../../types';

const gridApi = axios.create({
  baseURL: `${API_BASE_URL}/api/grids`,
});

export const gridApiClient = {
  // 获取网格列表
  getGrids: async (projectId?: number, level?: string): Promise<Grid[]> => {
    const params: Record<string, any> = {};
    if (projectId) params.project_id = projectId;
    if (level) params.level = level;
    
    const response = await gridApi.get('/', { params });
    return response.data;
  },

  // 获取网格详情
  getGridDetail: async (gridId: number): Promise<GridDetail> => {
    const response = await gridApi.get(`/${gridId}`);
    return response.data;
  },

  // 创建网格
  createGrid: async (data: Omit<Grid, 'id' | 'created_at' | 'updated_at'>): Promise<Grid> => {
    const response = await gridApi.post('/', data);
    return response.data;
  },

  // 更新网格
  updateGrid: async (gridId: number, data: Partial<Grid>): Promise<Grid> => {
    const response = await gridApi.put(`/${gridId}`, data);
    return response.data;
  },

  // 删除网格
  deleteGrid: async (gridId: number): Promise<void> => {
    await gridApi.delete(`/${gridId}`);
  },

  // 获取网格统计数据
  getGridStats: async (projectId?: number): Promise<GridStats> => {
    const params: Record<string, any> = {};
    if (projectId) params.project_id = projectId;
    
    const response = await gridApi.get('/stats', { params });
    return response.data;
  },

  // 获取网格人员列表
  getGridPersonnel: async (gridId: number): Promise<GridPersonnel[]> => {
    const response = await gridApi.get(`/${gridId}/personnel`);
    return response.data;
  },

  // 分配人员到网格
  assignPersonnel: async (gridId: number, personnelId: number, role: string): Promise<void> => {
    await gridApi.post(`/${gridId}/personnel`, {
      personnel_id: personnelId,
      role,
    });
  },

  // 从网格移除人员
  removePersonnel: async (gridId: number, personnelId: number): Promise<void> => {
    await gridApi.delete(`/${gridId}/personnel/${personnelId}`);
  },

  // 获取网格设备列表
  getGridDevices: async (gridId: number): Promise<any[]> => {
    const response = await gridApi.get(`/${gridId}/devices`);
    return response.data;
  },
};

// 模拟数据（用于前端演示）
export const mockGrids: Grid[] = [
  {
    id: 1,
    name: '盾构作业区A',
    level: 'workface',
    parent_id: 10,
    project_id: 1,
    bounds_json: '[[31.2304, 121.4737], [31.2306, 121.4739], [31.2308, 121.4735], [31.2306, 121.4733]]',
    area: 2500,
    description: '盾构机作业区域，主要负责隧道开挖',
    status: 'normal',
    created_at: '2024-01-15 09:00:00',
    updated_at: '2024-01-20 14:30:00',
  },
  {
    id: 2,
    name: '桥梁施工区',
    level: 'workshop',
    parent_id: null,
    project_id: 1,
    bounds_json: '[[31.2310, 121.4740], [31.2315, 121.4745], [31.2312, 121.4750], [31.2308, 121.4745]]',
    area: 5000,
    description: '桥梁主体施工区域',
    status: 'warning',
    created_at: '2024-01-10 08:00:00',
    updated_at: '2024-01-19 16:00:00',
  },
  {
    id: 3,
    name: '隧道进口区',
    level: 'workface',
    parent_id: 2,
    project_id: 1,
    bounds_json: '[[31.2295, 121.4720], [31.2298, 121.4725], [31.2302, 121.4722], [31.2299, 121.4718]]',
    area: 1500,
    description: '隧道进口施工区域',
    status: 'alarm',
    created_at: '2024-01-08 07:30:00',
    updated_at: '2024-01-20 10:15:00',
  },
  {
    id: 4,
    name: '材料堆放区',
    level: 'workface',
    parent_id: 2,
    project_id: 1,
    bounds_json: '[[31.2320, 121.4750], [31.2325, 121.4755], [31.2322, 121.4760], [31.2318, 121.4755]]',
    area: 3000,
    description: '钢筋、水泥等建筑材料堆放区域',
    status: 'normal',
    created_at: '2024-01-12 10:00:00',
    updated_at: '2024-01-18 09:00:00',
  },
  {
    id: 5,
    name: '箱梁预制区',
    level: 'workshop',
    parent_id: null,
    project_id: 1,
    bounds_json: '[[31.2330, 121.4760], [31.2338, 121.4770], [31.2335, 121.4775], [31.2328, 121.4765]]',
    area: 8000,
    description: '箱梁预制生产区域',
    status: 'normal',
    created_at: '2024-01-05 06:00:00',
    updated_at: '2024-01-17 11:30:00',
  },
  {
    id: 6,
    name: '桩基施工区',
    level: 'workface',
    parent_id: 2,
    project_id: 1,
    bounds_json: '[[31.2300, 121.4745], [31.2303, 121.4750], [31.2306, 121.4748], [31.2304, 121.4743]]',
    area: 2000,
    description: '桥梁桩基施工区域',
    status: 'normal',
    created_at: '2024-01-11 08:30:00',
    updated_at: '2024-01-19 14:00:00',
  },
];

export const mockGridStats: GridStats = {
  total_count: 6,
  normal_count: 4,
  warning_count: 1,
  alarm_count: 1,
  danger_rank: [
    { grid_id: 3, grid_name: '隧道进口区', danger_count: 5 },
    { grid_id: 2, grid_name: '桥梁施工区', danger_count: 3 },
    { grid_id: 1, grid_name: '盾构作业区A', danger_count: 2 },
  ],
};

export const mockPersonnelList = [
  { id: 1, name: '张三', role: 'grid_manager' },
  { id: 2, name: '李四', role: 'safety_manager' },
  { id: 3, name: '王五', role: 'technician' },
  { id: 4, name: '赵六', role: 'inspector' },
  { id: 5, name: '钱七', role: 'safety_manager' },
  { id: 6, name: '孙八', role: 'technician' },
];

export const mockDeviceList = [
  { id: 'CAM-001', name: '摄像头-001', type: 'camera' },
  { id: 'GPS-002', name: '定位器-002', type: 'gps' },
  { id: 'SEN-003', name: '传感器-003', type: 'sensor' },
  { id: 'CAM-004', name: '摄像头-004', type: 'camera' },
];

export const roleNames: Record<string, string> = {
  grid_manager: '网格长',
  safety_manager: '安全员',
  technician: '技术员',
  inspector: '巡检员',
};

export const levelNames: Record<string, string> = {
  project: '项目级',
  workshop: '工区级',
  team: '班组级',
  workface: '作业面',
};
