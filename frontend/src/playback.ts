// frontend/types/playback.ts

export interface SavedPlayback {
  id: string;
  deviceId: number;
  deviceName: string;
  company?: string;      // ✅ 添加
  project?: string;   
  grid?: string;
  grid_id?: string;
  grid_name?: string;
  team?: string;
  team_id?: string;
  team_name?: string;
  type: 'manual' | 'alarm';
  startTime: string;
  endTime: string;
  duration: number;
  filePath?: string;
  alarmInfo?: {
    type: string;
    msg: string;
    score: number;
    timestamp: string;
    personnel?: string | null;
  };
  createdAt: string;
}

export interface Device {
  id: number;
  name: string;
  ip_address?: string;
  status?: string;
  company?: string;
  project?: string;
  grid?: string;
  grid_id?: string;
  grid_name?: string;
  team?: string;
  team_id?: string;
  team_name?: string;
}
