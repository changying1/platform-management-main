// types/fence.ts
export interface FenceData {
  id: string;
  name: string;
  company: string;
  project: string;
  grid?: string;
  grid_name?: string;
  description?: string;
  branch_id?: string | number | null;
  project_id?: string | number | null;
  grid_id?: string | number | null;
  team_id?: string | number | null;
  type: "Circle" | "Polygon";
  behavior: "No Entry" | "No Exit";
  severity: "normal" | "risk" | "severe";
  schedule: {
    start: string;
    end: string;
  };
  effective_time?: string;
  center?: [number, number];
  radius?: number;
  points?: [number, number][];
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRegionData {
  id: string;
  name: string;
  company: string;
  project: string;
  points: [number, number][];
}

export interface FenceDevice {
  device_id: string;
  device_code?: string | number | null;
  device_serial?: string | number | null;
  phone_num?: string | number | null;
  raw_id?: string | number | null;
  name: string;
  lat: number;
  lng: number;
  company: string;
  project: string;
  grid?: string;
  grid_name?: string;
  grid_id?: string | number | null;
  status: "online" | "offline";
  holder: string;
  holderPhone?: string;
  lastUpdate: string;
}

export const getFenceDeviceAlarmKeys = (device: FenceDevice): string[] => {
  const keys = [
    device.device_id,
    device.device_code,
    device.device_serial,
    device.phone_num,
    device.raw_id,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  return Array.from(new Set(keys));
};

export interface FenceFilter {
  company?: string;
  project?: string;
  grid?: string;
  keyword?: string;
  severity?: string;
  status?: string;
}

export interface WorkTeamData {
  id: string;
  name: string;
  color: string;
  fences: FenceData[];
}

export interface OrganizationTreeNode {
  id: string;
  unit_id: string;
  name: string;
  type: "branch" | "project" | "safety_office" | "grid" | "team" | "personnel" | string;
  parent_id?: string | null;
  project_id?: string | number | null;
  grid_id?: string | number | null;
  team_id?: string | number | null;
  children?: OrganizationTreeNode[];
  fences?: FenceData[];
  devices?: FenceDevice[];
  fenceCount?: number;
}
