// types/fence.ts
export interface FenceData {
  id: string;
  name: string;
  company: string;
  project: string;
  type: "Circle" | "Polygon";
  behavior: "No Entry" | "No Exit";
  severity: "normal" | "risk" | "severe";
  schedule: {
    start: string;
    end: string;
  };
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
  name: string;
  lat: number;
  lng: number;
  company: string;
  project: string;
  status: "online" | "offline";
  holder: string;
  holderPhone?: string;
  lastUpdate: string;
}

export interface FenceFilter {
  company?: string;
  project?: string;
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