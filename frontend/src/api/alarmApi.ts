import axios from 'axios';

import { API_BASE_URL } from './config';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  }
});

export interface AlarmCreatePayload {
  device_id: string;
  fence_id?: number;
  alarm_type: string;
  severity: string;
  description: string;
  location?: string;
  status?: string;
}

export interface AlarmResponse {
  id: number;
  device_id: string;
  fence_id?: number;
  project_id?: number;
  alarm_type: string;
  severity: string;
  description: string;
  location?: string;
  status: string;
  timestamp: string;
  handled_at?: string;

  alarm_image_path?: string;

  recording_path?: string;
  recording_status?: string;
  recording_error?: string;
}

export const alarmApi = {
  getAlarms: async (projectId?: number) => {
    const params: Record<string, any> = {};
    if (projectId !== undefined) params.project_id = projectId;
    const response = await apiClient.get<AlarmResponse[]>('/alarms/', { params });
    return response.data;
  },
  createAlarm: async (alarm: AlarmCreatePayload) => {
    const response = await apiClient.post<AlarmResponse>('/alarms/', alarm);
    return response.data;
  },
  resolveAlarm: async (id: number) => {
    const response = await apiClient.put<AlarmResponse>(`/alarms/${id}`, { status: 'resolved' });
    return response.data;
  },
  updateAlarm: async (id: number, data: { status?: string; severity?: string; description?: string }) => {
    const response = await apiClient.put<AlarmResponse>(`/alarms/${id}`, data);
    return response.data;
  },
  deleteAlarm: async (id: number) => {
    const response = await apiClient.delete(`/alarms/${id}`);
    return response.data;
  }
};
export const toStaticUrl = (path?: string) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};
