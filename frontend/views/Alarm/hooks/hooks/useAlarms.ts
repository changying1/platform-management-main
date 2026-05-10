import { useState, useEffect, useCallback, useMemo } from 'react';
import { alarmApi, AlarmResponse } from '@/src/api/alarmApi';
import { AlarmRecord, AlarmStatusFilter, AlarmLevelFilter } from '../types';

const ALARM_TYPE_LABEL_MAP: Record<string, string> = {
  VIDEO_DEVICE_OFFLINE: '视频设备离线',
  VIDEO_DEVICE_SLEEPING: '视频设备休眠',
  VIDEO_DEVICE_PRIVACY_ENABLED: '视频设备隐私模式开启',
  VIDEO_DEVICE_STORAGE_ABNORMAL: '视频设备存储异常',
  VIDEO_DEVICE_LOW_BATTERY: '视频设备低电量',
  VIDEO_DEVICE_WEAK_SIGNAL: '视频设备信号弱',
  VIDEO_TRAFFIC_LOW: '视频设备流量不足',
  fence_intrusion: '电子围栏入侵',
  fence_exit: '电子围栏越界',
  intrusion: '区域入侵',
  helmet_missing: '未佩戴安全帽',
  person_fall: '人员倒地',
};

const formatAlarmTypeLabel = (alarmType?: string) => {
  const raw = String(alarmType || '').trim();
  if (!raw) return '未知告警';
  if (ALARM_TYPE_LABEL_MAP[raw]) return ALARM_TYPE_LABEL_MAP[raw];

  const upperRaw = raw.toUpperCase();
  if (ALARM_TYPE_LABEL_MAP[upperRaw]) return ALARM_TYPE_LABEL_MAP[upperRaw];

  if (upperRaw.startsWith('VIDEO_DEVICE_')) {
    return '视频设备告警';
  }

  return raw;
};

export const useAlarms = () => {
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter States
  const [statusFilter, setStatusFilter] = useState<AlarmStatusFilter>('all');
  const [levelFilter, setLevelFilter] = useState<AlarmLevelFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState<number | undefined>(undefined);
  // Unsaved local state for alarm levels
  const [localLevels, setLocalLevels] = useState<Record<number, string>>({});

  const mapResponseToAlarm = (a: AlarmResponse): AlarmRecord => ({
    id: `ALM-${new Date(a.timestamp).getFullYear()}${String(new Date(a.timestamp).getMonth() + 1).padStart(2, '0')}${String(new Date(a.timestamp).getDate()).padStart(2, '0')}-${String(a.id).padStart(3, '0')}`,
    rawId: a.id,
    user: a.device_id,
    device: a.device_id,
    type: formatAlarmTypeLabel(a.alarm_type),
    time: new Date(a.timestamp).toLocaleString(),
    timestamp: a.timestamp,
    location: a.location || '未知位置',
    status: a.status as 'pending' | 'resolved',
    level: (a.severity?.toLowerCase() || 'medium') as 'high' | 'medium' | 'low',
    description: a.description,
    recordingPath: a.recording_path,
    recordingStatus: a.recording_status,
    recordingError: a.recording_error,
  });

  const fetchAlarms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await alarmApi.getAlarms(projectFilter);
      setAlarms(data.map(mapResponseToAlarm));
    } catch (error) {
      console.error("Failed to fetch alarms:", error);
    } finally {
      setLoading(false);
    }
  }, [projectFilter]);

  useEffect(() => {
    fetchAlarms();
    const interval = setInterval(fetchAlarms, 30000);
    return () => clearInterval(interval);
  }, [fetchAlarms]);

  const handleResolve = async (id: number) => {
    try {
      const finalLevel = localLevels[id];
      await alarmApi.updateAlarm(id, {
        status: 'resolved',
        ...(finalLevel && { severity: finalLevel })
      });

      setLocalLevels(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      fetchAlarms();
    } catch (error) {
      console.error("Failed to resolve alarm:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条报警记录吗？')) return;
    try {
      await alarmApi.deleteAlarm(id);
      fetchAlarms();
    } catch (error) {
      console.error("Failed to delete alarm:", error);
    }
  };

  const updateLevel = (id: number, level: string) => {
    setLocalLevels(prev => ({ ...prev, [id]: level }));
  };

  // ==================== 基础统计 ====================
  const stats = useMemo(() => ({
    total: alarms.length,
    pending: alarms.filter(a => a.status === 'pending').length,
    resolved: alarms.filter(a => a.status === 'resolved').length,
    high: alarms.filter(a => a.level === 'high').length,
  }), [alarms]);

  // ==================== 图表聚合数据 ====================

  // 报警趋势（近15天，按天聚合）
  const trendData = useMemo(() => {
    const days: { date: string; warning: number; alarm: number }[] = [];
    const now = new Date();
    for (let i = 14; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const dayAlarms = alarms.filter((a) => {
        const ts = new Date(a.timestamp);
        return ts >= dayStart && ts < dayEnd;
      });

      days.push({
        date: dateStr,
        warning: dayAlarms.filter((a) => a.level === 'medium' || a.level === 'low').length,
        alarm: dayAlarms.filter((a) => a.level === 'high').length,
      });
    }
    return days;
  }, [alarms]);

  // 报警类型分布
  const typeDistribution = useMemo(() => {
    const map = new Map<string, number>();
    alarms.forEach((a) => {
      map.set(a.type, (map.get(a.type) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [alarms]);

  // 报警级别分布
  const levelDistribution = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 };
    alarms.forEach((a) => {
      if (counts[a.level] !== undefined) counts[a.level]++;
    });
    return [
      { name: '高危', value: counts.high, color: '#ef4444' },
      { name: '警告', value: counts.medium, color: '#f59e0b' },
      { name: '提示', value: counts.low, color: '#3b82f6' },
    ];
  }, [alarms]);

  // 设备报警 TOP5
  const deviceTop5 = useMemo(() => {
    const map = new Map<string, number>();
    alarms.forEach((a) => {
      map.set(a.device, (map.get(a.device) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([device, count]) => ({ device, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [alarms]);

  // 处置率
  const resolveRate = useMemo(() => {
    if (alarms.length === 0) return 0;
    return (stats.resolved / alarms.length) * 100;
  }, [alarms, stats.resolved]);

  // 最新报警（用于实时播报）
  const latestAlarms = useMemo(() => {
    return [...alarms]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        type: a.type,
        device: a.device,
        time: a.time,
        level: a.level,
        location: a.location,
      }));
  }, [alarms]);

  // ==================== 过滤后的列表 ====================
  const filteredAlarms = useMemo(() => {
    return alarms.map(alarm => ({
      ...alarm,
      level: (localLevels[alarm.rawId] || alarm.level) as any
    })).filter(alarm => {
      const matchStatus = statusFilter === 'all' || alarm.status === statusFilter;
      const matchLevel = levelFilter === 'all' || alarm.level === levelFilter;
      const matchSearch = searchTerm === '' ||
        alarm.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alarm.device.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alarm.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alarm.type.toLowerCase().includes(searchTerm.toLowerCase());

      return matchStatus && matchLevel && matchSearch;
    });
  }, [alarms, statusFilter, levelFilter, searchTerm, localLevels]);

  return {
    alarms: filteredAlarms,
    allRawAlarms: alarms,
    loading,
    stats,
    // 图表数据
    chartData: {
      trend: trendData,
      typeDistribution,
      levelDistribution,
      deviceTop5,
      resolveRate,
      latestAlarms,
    },
    // 筛选状态
    statusFilter,
    setStatusFilter,
    levelFilter,
    setLevelFilter,
    searchTerm,
    setSearchTerm,
    projectFilter,
    setProjectFilter,
    actions: {
      resolve: handleResolve,
      delete: handleDelete,
      updateLevel,
      refresh: fetchAlarms
    }
  };
};
