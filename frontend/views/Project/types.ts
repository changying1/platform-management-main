export interface User {
  id: number;
  username: string;
  full_name?: string;
  role?: string;
  permission_level?: string;
  department_id?: number | string | null;
  branch_id?: number | string | null;
  project?: string;
  project_id?: string;
  team?: string;
  work_team?: string;
}

export interface Device {
  id: string;
  device_name: string;
  device_type: string;
  is_online: boolean;
}

export interface Region {
  id: number | string;
  name: string;
  coordinates_json: string;
  remark?: string;
}

export interface Team {
  id?: string;
  team_id: string;
  name: string;
  project?: string;
  project_id?: string | number | null;
  grid_id?: string;
  color?: string;
  company?: string;
}

export interface Grid {
  id?: string;
  grid_id: string;
  name: string;
  project_id?: string | number | null;
  project?: string;
  project_name?: string;
  status?: string;
  area?: number;
}

export interface Branch {
  id: number;
  name: string;
  province?: string;
  city?: string;
  status?: string;
}

export interface ProjectListItem {
  id: number;
  name: string;
  description?: string;
  manager?: string;
  status: string;
  remark?: string;
  branch_id?: number;
  branch_name?: string;
  user_count: number;
  device_count: number;
  region_count: number;
  grid_count?: number;
  team_count?: number;
  fence_count: number;
  alarm_count: number;
}

export interface ProjectDetail {
  id: number;
  name: string;
  description?: string;
  manager?: string;
  status: string;
  remark?: string;
  branch_id?: number;
  grid_ids?: string[];
  team_ids?: string[];
  users: User[];
  devices: Device[];
  regions: Region[];
}

export interface Fence {
  id: number;
  name: string;
  region_name: string;
  region_id: number;
  shape: string;
  behavior: string;
  alarm_type: string;
  is_active: number;
  worker_count: number;
}

export interface ProjectFormData {
  name: string;
  description: string;
  manager: string;
  status: string;
  remark: string;
  branch_id?: number;
  user_ids: number[];
  device_ids: string[];
  region_ids: number[];
  grid_ids: string[];
  team_ids: string[];
}
