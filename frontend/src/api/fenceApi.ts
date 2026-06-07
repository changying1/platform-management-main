import axios from 'axios';

import { API_BASE_URL, attachAuthInterceptor } from './config';

const apiClient = attachAuthInterceptor(axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  }
}));

export interface ProjectRegionCreatePayload {
  name: string;
  coordinates_json: string;
  remark: string | null;
}

export interface ProjectRegionResponse {
  id: number;
  name: string;
  coordinates_json: string;
  remark: string | null;
}

export interface FenceCreatePayload {
  name: string;
  project_region_id: number | null;
  shape: 'polygon' | 'circle';
  behavior: 'No Entry' | 'No Exit';
  coordinates_json: string;
  radius: number | null;
  effective_time: string;
  remark: string | null;
  alarm_type: 'high' | 'medium' | 'low';
  deviceIds?: string[];
}

export interface FenceResponse {
  id: number;
  name: string;
  project_region_id: number | null;
  shape: 'polygon' | 'circle';
  behavior: 'No Entry' | 'No Exit';
  coordinates_json: string;
  radius: number | null;
  effective_time: string;
  remark: string | null;
  alarm_type: 'high' | 'medium' | 'low';
  worker_count: number;
  is_active: number;
  deviceIds?: string[];
}

export const fenceApi = {
  // Project Regions
  getRegions: async () => {
    const response = await apiClient.get<ProjectRegionResponse[]>('/fence/regions');
    return response.data;
  },
  createRegion: async (region: ProjectRegionCreatePayload) => {
    const response = await apiClient.post<ProjectRegionResponse>('/fence/regions', region);
    return response.data;
  },
  updateRegion: async (id: string, region: Partial<ProjectRegionCreatePayload>) => {
    const response = await apiClient.put<ProjectRegionResponse>(`/fence/regions/${id}`, region);
    return response.data;
  },
  deleteRegion: async (id: string) => {
    const response = await apiClient.delete(`/fence/regions/${id}`);
    return response.data;
  },

  // Fences
  getFences: async () => {
    const response = await apiClient.get<FenceResponse[]>('/fence/');
    return response.data;
  },
  createFence: async (fence: FenceCreatePayload) => {
    const response = await apiClient.post<FenceResponse>('/fence/', fence);
    return response.data;
  },
  updateFence: async (id: string, fence: Partial<FenceCreatePayload>) => {
    const response = await apiClient.put<FenceResponse>(`/fence/${id}`, fence);
    return response.data;
  },
  deleteFence: async (id: string) => {
    const response = await apiClient.delete(`/fence/${id}`);
    return response.data;
  }
};
