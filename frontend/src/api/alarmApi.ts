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
  device_name?: string;
  fence_id?: number;
  project_id?: number;
  alarm_type: string;
  severity: string;
  description?: string;
  location?: string;
  status: string;
  timestamp: string;
  handled_at?: string;
  person_name?: string;
  person_label?: string;

  alarm_image_path?: string;

  recording_path?: string;
  recording_status?: string;
  recording_error?: string;
  
  source_type?: string;  // 添加 source_type 字段用于区分围栏告警和视频告警
}

export interface LogResponse {
  id: number;
  operator: string;
  action: string;
  target_type: string;
  target_name: string;
  details?: string;
  company?: string;
  project?: string;
  team?: string;
  extra?: Record<string, any>;
  time: string;
}

export interface LogCreatePayload {
  operator: string;
  action: string;
  target_type: string;
  target_name: string;
  details?: string;
  company?: string;
  project?: string;
  team?: string;
  extra?: Record<string, any>;
}

export const alarmApi = {
  getAlarms: async (projectId?: number, sourceType?: 'video' | 'fence') => {
    const params: Record<string, any> = {};
    if (projectId !== undefined) params.project_id = projectId;
    if (sourceType) params.source_type = sourceType;
    const response = await apiClient.get<AlarmResponse[]>('/alarms/', { params });
    return response.data;
  },
  createAlarm: async (alarm: AlarmCreatePayload) => {
    const response = await apiClient.post<AlarmResponse>('/alarms/', alarm);
    return response.data;
  },
  resolveAlarm: async (id: number, data?: { handler?: string; remark?: string }) => {
    const payload = { status: 'resolved', ...data };
    const response = await apiClient.put<AlarmResponse>(`/alarms/${id}`, payload);
    return response.data;
  },
  updateAlarm: async (id: number, data: { status?: string; severity?: string; description?: string; handler?: string; remark?: string }) => {
    const response = await apiClient.put<AlarmResponse>(`/alarms/${id}`, data);
    return response.data;
  },
  deleteAlarm: async (id: number) => {
    const response = await apiClient.delete(`/alarms/${id}`);
    return response.data;
  },
  getLogs: async (skip: number = 0, limit: number = 100) => {
    const response = await apiClient.get<LogResponse[]>('/logs/', { params: { skip, limit } });
    return response.data;
  },
  getLog: async (id: number) => {
    const response = await apiClient.get<LogResponse>(`/logs/${id}`);
    return response.data;
  },
  createLog: async (log: LogCreatePayload) => {
    const response = await apiClient.post<LogResponse>('/logs/', log);
    return response.data;
  }
};
export const toStaticUrl = (path?: string) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};
