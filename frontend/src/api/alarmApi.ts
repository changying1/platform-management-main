import axios from 'axios';

import { API_BASE_URL, attachAuthInterceptor, withAuthTokenParam } from './config';

const apiClient = attachAuthInterceptor(axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  }
}));

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
  video_name?: string;
  fence_id?: number;
  project_id?: number;
  branch_id?: number | string;
  branch_name?: string;
  company?: string;
  project_name?: string;
  project?: string;
  grid_id?: string;
  grid_name?: string;
  grid?: string;
  team_id?: string;
  team_name?: string;
  team?: string;
  trigger_person_id?: string;
  trigger_person_name?: string;
  personnel_id?: string;
  alarm_type: string;
  severity: string;
  description?: string;
  location?: string;
  status: string;
  alarm_time?: string;
  detection_time?: string;
  trigger_time?: string;
  snapshot_time?: string;
  image_time?: string;
  capture_time?: string;
  timestamp: string;
  created_at?: string;
  handled_at?: string;
  person_name?: string;
  person_label?: string;

  alarm_image_path?: string;
  image_url?: string;
  snapshot_url?: string;

  recording_path?: string;
  video_url?: string;
  clip_url?: string;
  recording_status?: string;
  recording_error?: string;
  error_message?: string;
  duration?: number;
  duration_seconds?: number;
  start_time?: string;
  end_time?: string;
  alarm_second?: number;
  personnel_name?: string;
  picture_url?: string;
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
  grid?: string;
  team?: string;
  extra?: Record<string, any>;
  time: string;
}

export interface AlarmStatsResponse {
  total: number;
  pending: number;
  fence: number;
  video: number;
}

export interface LogCreatePayload {
  operator: string;
  action: string;
  target_type: string;
  target_name: string;
  details?: string;
  company?: string;
  project?: string;
  grid?: string;
  team?: string;
  extra?: Record<string, any>;
}

const alarmFallbackClient = attachAuthInterceptor(axios.create({
  baseURL: 'http://127.0.0.1:9000',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
}));

const getWithBackendFallback = async <T>(path: string, config?: any) => {
  try {
    const response = await apiClient.get<T>(path, config);
    if (path === '/alarms/' && !Array.isArray(response.data)) {
      throw new Error('Alarm API returned non-array response');
    }
    return response;
  } catch (error) {
    if (API_BASE_URL && !API_BASE_URL.includes(':9000')) {
      const response = await alarmFallbackClient.get<T>(path, config);
      if (path === '/alarms/' && !Array.isArray(response.data)) {
        throw new Error('Fallback alarm API returned non-array response');
      }
      return response;
    }
    throw error;
  }
};

export const alarmApi = {
  getAlarms: async (projectId?: number, sourceType?: 'video' | 'fence' | string, limit: number = 500) => {
    const params: Record<string, any> = {};
    if (projectId !== undefined) params.project_id = projectId;
    if (sourceType) params.source_type = sourceType;
    params.limit = limit;
    const response = await getWithBackendFallback<AlarmResponse[]>('/alarms/', { params });
    return response.data;
  },
  getStats: async () => {
    const response = await getWithBackendFallback<AlarmStatsResponse>('/alarms/stats');
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
  exportLogsUrl: () => withAuthTokenParam(`${API_BASE_URL}/logs/export/csv`),
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
  return withAuthTokenParam(`${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`);
};
