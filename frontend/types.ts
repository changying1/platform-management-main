export enum MenuKey {
  DASHBOARD = 'dashboard',
  VIDEO = 'video',
  VIDEOPLAYBACK = 'videoplayback',
  TRACK = 'track',
  FENCE = 'fence',
  GROUP_CALL = 'group_call',
  ALARM = 'alarm',
  DEVICE = 'device',
  SETTINGS = 'settings',
  MANAGEMENT = 'management', 
  SYSTEM_LOG = 'system_log',
  GRID = 'grid', // 网格化管理
}

export interface HelmetDevice {
  id: string;
  name: string;
  department: string;
  status: 'online' | 'offline';
  battery: number;
  signal: number; // 0-100
  lastActive: string;
}

export interface Fence {
  id: string;
  name: string;
  type: 'Circle' | 'Polygon';
  behavior: 'No Entry' | 'No Exit';
  radius?: number; // for Circle
  alarmCount: number;
  startTime: string;
  endTime: string;
  address?: string;
}

export interface AlarmRecord {
  id: string;
  deviceId: string;
  type: string; // SOS, Fence, Low Battery
  timestamp: string;
  status: 'resolved' | 'pending';
}

// ==================== 网格化管理类型 ====================
export type GridLevel = 'project' | 'workshop' | 'team' | 'workface';

export type GridRole = 'grid_manager' | 'safety_manager' | 'technician' | 'inspector';

export interface Grid {
  id: string;
  grid_id: string;
  name: string;
  level: GridLevel;
  parent_id?: string;
  project_id?: string;
  bounds_json: string; // 地理边界坐标 JSON
  area?: number; // 面积（平方米）
  description?: string;
  status: 'normal' | 'warning' | 'alarm';
  created_at: string;
  updated_at: string;
}

export interface GridPersonnel {
  grid_id: number;
  personnel_id: number;
  role: GridRole;
  start_time?: string;
  end_time?: string;
}

export interface GridStats {
  total_count: number;
  normal_count: number;
  warning_count: number;
  alarm_count: number;
  danger_rank: Array<{
    grid_id: number;
    grid_name: string;
    danger_count: number;
  }>;
}

export interface GridDetail extends Grid {
  personnel: Array<{
    id: number;
    name: string;
    role: GridRole;
    role_name: string;
    phone: string;
    department: string;
  }>;
  devices: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  alarm_count: number;
  danger_count: number;
}