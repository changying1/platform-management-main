import { deviceApi } from './deviceApi';
import { alarmApi } from './alarmApi';
import { gridApiClient } from './gridApi';
import { getAllVideos } from './videoApi';
import axios from 'axios';
import { API_BASE_URL } from './config';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
});

export interface SystemData {
  timestamp: string;
  devices: {
    total: number;
    online: number;
    offline: number;
    byCompany: Record<string, { total: number; online: number }>;
    byProject: Record<string, { total: number; online: number }>;
  };
  alarms: {
    total: number;
    pending: number;
    resolved: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    recent: Array<{
      id: number;
      type: string;
      severity: string;
      description: string;
      timestamp: string;
    }>;
  };
  grids: {
    total: number;
    normal: number;
    warning: number;
    alarm: number;
    byLevel: Record<string, number>;
  };
  videos: {
    total: number;
    recording: number;
    alarm: number;
  };
  branches: {
    total: number;
    byStatus: Record<string, number>;
    branches: Array<{
      id: number;
      name: string;
      province: string;
      status: string;
      deviceCount: number;
    }>;
  };
  violations: {
    total: number;
    todayCount: number;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    byBehavior: Record<string, number>;
    byProject: Record<string, number>;
    todayViolations: Array<{
      id: number;
      behavior: string;
      severity: string;
      person: string;
      location: string;
      time: string;
    }>;
  };
  personnel: {
    total: number;
    byBranch: Record<string, number>;
    byPosition: Record<string, number>;
    byStatus: Record<string, number>;
    byLevel: Record<string, number>;
    managers: Array<{
      id: number;
      name: string;
      position: string;
      branch: string;
      branch_id: number;
      phone: string;
      level: string;
      status: string;
    }>;
    branchManagers: Record<string, Array<{
      id: number;
      name: string;
      position: string;
      branch: string;
      branch_id: number;
      phone: string;
      level: string;
      status: string;
    }>>;
    branches: Record<number, string>;
  };
  projects: {
    total: number;
    list: Array<{
      id: number;
      name: string;
      branch_id: number;
      status: string;
    }>;
    byBranch: Record<string, number>;
  };
  workTypes: {
    total: number;
    list: Array<{
      id: number;
      name: string;
      code: string;
    }>;
  };
  users: {
    total: number;
    list: Array<{
      id: number;
      username: string;
      real_name: string;
      role: string;
    }>;
  };
  videoDevices: {
    total: number;
    byStatus: Record<string, number>;
  };
}

export const systemDataService = {
  async getSystemData(): Promise<SystemData> {
    try {
      const [devices, alarms, grids, videos, fullData] = await Promise.all([
        deviceApi.getAllDevices().catch(() => []),
        alarmApi.getAlarms().catch(() => []),
        gridApiClient.getGrids().catch(() => []),
        getAllVideos().catch(() => []),
        apiClient.get('/api/dashboard/ai/full-data').then(res => res.data).catch(() => ({ 
          branches: { total: 0, list: [], byStatus: {} },
          projects: { total: 0, list: [], byBranch: {} },
          personnel: { total: 0, managers: [], byLevel: {}, byBranch: {} },
          devices: { total: 0, online: 0, offline: 0, byType: {} },
          alarms: { total: 0, pending: 0, resolved: 0, bySeverity: {} },
          violations: { total: 0, byBehavior: {}, bySeverity: {}, recent: [] },
          video_devices: { total: 0, byStatus: {} },
          work_types: { total: 0, list: [] },
          users: { total: 0, list: [] }
        })),
      ]);

      const deviceData = this.processDevices(devices);
      const alarmData = this.processAlarms(alarms);
      const gridData = this.processGrids(grids);
      const videoData = this.processVideos(videos);

      return {
        timestamp: new Date().toISOString(),
        devices: deviceData,
        alarms: alarmData,
        grids: gridData,
        videos: videoData,
        branches: fullData.branches || { total: 0, byStatus: {}, branches: [] },
        violations: fullData.violations || { total: 0, todayCount: 0, bySeverity: {}, byStatus: {}, byBehavior: {}, byProject: {}, todayViolations: [] },
        personnel: fullData.personnel || { total: 0, byBranch: {}, byPosition: {}, byStatus: {}, byLevel: {}, managers: [], branchManagers: {}, branches: {} },
        projects: fullData.projects || { total: 0, list: [], byBranch: {} },
        workTypes: fullData.work_types || { total: 0, list: [] },
        users: fullData.users || { total: 0, list: [] },
        videoDevices: fullData.video_devices || { total: 0, byStatus: {} },
      };
    } catch (error) {
      console.error('获取系统数据失败:', error);
      return this.getEmptySystemData();
    }
  },

  processDevices(devices: any[]) {
    const total = devices.length;
    const online = devices.filter((d: any) => d.is_online).length;
    const offline = total - online;

    const byCompany: Record<string, { total: number; online: number }> = {};
    const byProject: Record<string, { total: number; online: number }> = {};

    devices.forEach((device: any) => {
      const company = device.company || '未知';
      const project = device.project || '未知';

      if (!byCompany[company]) {
        byCompany[company] = { total: 0, online: 0 };
      }
      byCompany[company].total++;
      if (device.is_online) byCompany[company].online++;

      if (!byProject[project]) {
        byProject[project] = { total: 0, online: 0 };
      }
      byProject[project].total++;
      if (device.is_online) byProject[project].online++;
    });

    return { total, online, offline, byCompany, byProject };
  },

  processAlarms(alarms: any[]) {
    const total = alarms.length;
    const pending = alarms.filter((a: any) => a.status === 'pending').length;
    const resolved = alarms.filter((a: any) => a.status === 'resolved').length;

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    alarms.forEach((alarm: any) => {
      const type = alarm.alarm_type || '未知';
      const severity = alarm.severity || '未知';

      byType[type] = (byType[type] || 0) + 1;
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    });

    const recent = alarms
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
      .map((alarm: any) => ({
        id: alarm.id,
        type: alarm.alarm_type,
        severity: alarm.severity,
        description: alarm.description,
        timestamp: alarm.timestamp,
      }));

    return { total, pending, resolved, byType, bySeverity, recent };
  },

  processGrids(grids: any[]) {
    const total = grids.length;
    const normal = grids.filter((g: any) => g.status === 'normal').length;
    const warning = grids.filter((g: any) => g.status === 'warning').length;
    const alarm = grids.filter((g: any) => g.status === 'alarm').length;

    const byLevel: Record<string, number> = {};

    grids.forEach((grid: any) => {
      const level = grid.level || '未知';
      byLevel[level] = (byLevel[level] || 0) + 1;
    });

    return { total, normal, warning, alarm, byLevel };
  },

  processVideos(videos: any[]) {
    const total = videos.length;
    const recording = videos.filter((v: any) => v.type === 'manual').length;
    const alarm = videos.filter((v: any) => v.type === 'alarm').length;

    return { total, recording, alarm };
  },

  getEmptySystemData(): SystemData {
    return {
      timestamp: new Date().toISOString(),
      devices: {
        total: 0,
        online: 0,
        offline: 0,
        byCompany: {},
        byProject: {},
      },
      alarms: {
        total: 0,
        pending: 0,
        resolved: 0,
        byType: {},
        bySeverity: {},
        recent: [],
      },
      grids: {
        total: 0,
        normal: 0,
        warning: 0,
        alarm: 0,
        byLevel: {},
      },
      videos: {
        total: 0,
        recording: 0,
        alarm: 0,
      },
      branches: {
        total: 0,
        byStatus: {},
        branches: [],
      },
      violations: {
        total: 0,
        todayCount: 0,
        bySeverity: {},
        byStatus: {},
        byBehavior: {},
        byProject: {},
        todayViolations: [],
      },
      personnel: {
        total: 0,
        byBranch: {},
        byPosition: {},
        byStatus: {},
        byLevel: {},
        managers: [],
        branchManagers: {},
        branches: {},
      },
      projects: {
        total: 0,
        list: [],
        byBranch: {},
      },
      workTypes: {
        total: 0,
        list: [],
      },
      users: {
        total: 0,
        list: [],
      },
      videoDevices: {
        total: 0,
        byStatus: {},
      },
    };
  },
};
