  import React, { useEffect, useMemo, useState } from "react";
  import ReactECharts from "echarts-for-react";
  import * as echarts from "echarts";
  import chinaJson from "../src/assets/china.json";
  import { ProjectMap } from '../src/components/ProjectMap';
  import { deviceApi, ApiDevice } from "../src/api/deviceApi";
  import { API_BASE_URL } from '../src/api/config';
  import { MenuKey } from '../types';
  import { Users, Shield, Cpu, Activity, MapPin, Bell, Calendar, Clock, Award, Building2, ClipboardList, Smartphone, TrendingUp, Briefcase, ExternalLink, Eye, ArrowRight    } from "lucide-react";// ------------------------------------------------------------------
  // 中国省份到高德/阿里云 DataV 的 Adcode (行政区划代码) 映射
  // ------------------------------------------------------------------
  const PROVINCE_ADCODE: Record<string, number> = {
    北京市: 110000,
    天津市: 120000,
    河北省: 130000,
    山西省: 140000,
    内蒙古自治区: 150000,
    辽宁省: 210000,
    吉林省: 220000,
    黑龙江省: 230000,
    上海市: 310000,
    江苏省: 320000,
    浙江省: 330000,
    安徽省: 340000,
    福建省: 350000,
    江西省: 360000,
    山东省: 370000,
    河南省: 410000,
    湖北省: 420000,
    湖南省: 430000,
    广东省: 440000,
    广西壮族自治区: 450000,
    海南省: 460000,
    重庆市: 500000,
    四川省: 510000,
    贵州省: 520000,
    云南省: 530000,
    西藏自治区: 540000,
    陕西省: 610000,
    甘肃省: 620000,
    青海省: 630000,
    宁夏回族自治区: 640000,
    新疆维吾尔自治区: 650000,
    台湾省: 710000,
    香港特别行政区: 810000,
    澳门特别行政区: 820000,
  };

  // 工具函数：清洗省份名字，尝试多种匹配
  function getProvinceAdcode(prov: string): number | null {
    if (PROVINCE_ADCODE[prov]) return PROVINCE_ADCODE[prov];
    const k = Object.keys(PROVINCE_ADCODE).find(
      (key) => key.startsWith(prov) || prov.startsWith(key)
    );
    return k ? PROVINCE_ADCODE[k] : null;
  }

  function normalizeArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  // 类型定义
  type BranchStatus = "正常" | "告警" | "离线";

  type Branch = {
    id: number;
    province: string;
    name: string;
    coord?: [number, number];
    address?: string;
    project?: string;
    manager?: string;
    phone?: string;
    deviceCount?: number;
    status?: BranchStatus;
    updatedAt?: string;
    remark?: string;
  };

  type ProjectSummary = {
    id: number;
    name: string;
    branch_id?: number;
    manager: string;
    status: string;
    deviceCount: number   ;
    userCount: number;
    fenceCount: number;
        teamCount?: number;
    workTypeCount?: number;
        center?: any;
    area_boundary?: any;
    zoom_level?: number;
    longitude?: number;
    latitude?: number;
    devices?: Array<{           // 添加这一块
        id: number;
        name: string;
        type: string;
        lng: number;
        lat: number;
        is_online: number;
    }>;
  };

  if (!echarts.getMap("china")) {
    echarts.registerMap("china", chinaJson as any);
  }

  // ------------------------------------------------------------------
  // 全局 CSS 注入（动画关键帧）
  // ------------------------------------------------------------------
  const STYLE_ID = "cyber-dashboard-keyframes";
  if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
    const styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = `
      @keyframes cyber-scan {
        0%   { transform: translateY(-100%); }
        100% { transform: translateY(200vh); }
      }
      @keyframes corner-pulse {
        0%, 100% { opacity: 0.5; }
        50%      { opacity: 1; }
      }
      @keyframes title-bar-glow {
        0%, 100% { opacity: 0.7; }
        50%      { opacity: 1; box-shadow: 0 0 12px #60a5fa; }
      }
      @keyframes status-dot {
        0%, 100% { box-shadow: 0 0 4px currentColor; }
        50%      { box-shadow: 0 0 12px currentColor, 0 0 24px currentColor; }
      }
      @keyframes marquee {
        0%   { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
      @keyframes fadeInUp {
        0%   { opacity: 0; transform: translateY(12px); }
        100% { opacity: 1; transform: translateY(0); }
      }
            @keyframes glow-pulse {
        0%, 100% { opacity: 0.3; filter: blur(8px); }
        50% { opacity: 0.8; filter: blur(12px); }
      }
      @keyframes icon-pulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 20px rgba(251, 191, 36, 0.2); }
        50% { transform: scale(1.05); box-shadow: 0 0 30px rgba(251, 191, 36, 0.5); }
      }
      @keyframes dot-pulse {
        0%, 100% { opacity: 0.5; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.2); }
      }
        @keyframes scrollAlerts {
      0% {
        transform: translateY(0);
      }
      100% {
        transform: translateY(-100%);
      }
    }
      .cyber-select:hover {
        border-color: rgba(96, 165, 250, 0.8) !important;
        box-shadow: 0 0 12px rgba(96, 165, 250, 0.4) !important;
      }
      .cyber-select option {
        background: #0f1d3d;
        color: #fff;
      }
      .cyber-alarm-card:hover {
        transform: translateX(4px);
        transition: transform 0.2s;
      }
    `;
    document.head.appendChild(styleEl);
  }

  // ------------------------------------------------------------------
  // CyberPanel 2.0 — 带呼吸角标 + 发光标题
  // ------------------------------------------------------------------
  function CyberPanel({
    title,
    children,
    style,
  }: {
    title: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
  }) {
    const cornerStyle = (
      pos: Record<string, number>
    ): React.CSSProperties => ({
      position: "absolute",
      width: 14,
      height: 14,
      pointerEvents: "none",
      animation: "corner-pulse 3s ease-in-out infinite",
      ...pos,
    });

    return (
      <div
        style={{
          position: "relative",
          background:
            "linear-gradient(135deg, rgba(16, 42, 94, 0.72) 0%, rgba(8, 28, 66, 0.6) 100%)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          boxShadow:
            "inset 0 0 30px rgba(59, 130, 246, 0.08), 0 4px 24px rgba(0,0,0,0.3)",
          backdropFilter: "blur(12px)",
          borderRadius: 4,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          ...style,
        }}
      >
        {/* 呼吸角标 */}
        <div
          style={{
            ...cornerStyle({ top: -1, left: -1 }),
            borderTop: "2px solid #60a5fa",
            borderLeft: "2px solid #60a5fa",
          }}
        />
        <div
          style={{
            ...cornerStyle({ top: -1, right: -1 }),
            borderTop: "2px solid #60a5fa",
            borderRight: "2px solid #60a5fa",
            animationDelay: "0.5s",
          }}
        />
        <div
          style={{
            ...cornerStyle({ bottom: -1, left: -1 }),
            borderBottom: "2px solid #60a5fa",
            borderLeft: "2px solid #60a5fa",
            animationDelay: "1s",
          }}
        />
        <div
          style={{
            ...cornerStyle({ bottom: -1, right: -1 }),
            borderBottom: "2px solid #60a5fa",
            borderRight: "2px solid #60a5fa",
            animationDelay: "1.5s",
          }}
        />

        {/* 标题栏 */}
        <div
          style={{
            background:
              "linear-gradient(90deg, rgba(59,130,246,0.25) 0%, rgba(59,130,246,0.05) 60%, transparent 100%)",
            padding: "0.5vh ",
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid rgba(59,130,246,0.15)",
          }}
        >
          <div
            style={{
              width: 3,
              height: 16,
              background: "linear-gradient(180deg, #60a5fa, #3b82f6)",
              marginRight: 10,
              borderRadius: 2,
              animation: "title-bar-glow 3s ease-in-out infinite",
            }}
          />
          <span
            style={{
              color: "#e0f2fe",
              fontSize:"2.5vh",
              fontWeight: 600,
              letterSpacing: 1.5,
              textShadow: "0 0 8px rgba(96,165,250,0.6)",
            }}
          >
            {title}
          </span>
        </div>

        {/* 内容 */}
        <div
          style={{
            flex: 1,
            position: "relative",
            padding: 14,
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // 发光数据数字组件
  // ------------------------------------------------------------------
  function GlowNumber({
    value,
    color = "#60a5fa",
    size = 28,
    style,
  }: {
    value: string | number;
    color?: string;
    size?: number;
    style?: React.CSSProperties;
  }) {
    return (
      <span
        style={{
          fontSize: size,
          fontWeight: 800,
          color,
          textShadow: `0 0 8px ${color}, 0 0 20px ${color}40, 0 0 40px ${color}20`,
          fontFamily: "'Orbitron', 'Consolas', monospace",
          letterSpacing: 2,
          ...style,
        }}
      >
        {value}
      </span>
    );
  }

  // 数字滚动动画组件
  function AnimatedNumber({ value, duration = 1000 }) {
    const [display, setDisplay] = useState(0);
    
    useEffect(() => {
      let start = 0;
      const step = (value / duration) * 16;
      const timer = setInterval(() => {
        start += step;
        if (start >= value) {
          setDisplay(value);
          clearInterval(timer);
        } else {
          setDisplay(Math.floor(start));
        }
      }, 16);
      return () => clearInterval(timer);
    }, [value, duration]);
    
    return <span>{display.toLocaleString()}</span>;
  }

  // ------------------------------------------------------------------
  // 实时时钟
  // ------------------------------------------------------------------
  function LiveClock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
      const t = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(t);
    }, []);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return (
      <span style={{ color: "#94a3b8", fontSize: "115.5vh", fontFamily: "monospace" }}>
        {now.getFullYear()}-{pad(now.getMonth() + 1)}-{pad(now.getDate())}{" "}
        {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
      </span>
    );
  }

  // ==================================================================
  // 主组件
  // ==================================================================
  interface DashboardProps {
    setActiveMenu: (key: MenuKey) => void;
    setManagementTab: (tab: 'project' | 'person' | 'camera' | 'location' | 'permission') => void;
  }

  export default function Dashboard({ setActiveMenu, setManagementTab }: DashboardProps) {
    const [workTypeStats, setWorkTypeStats] = useState([]);
    const [mapOffset, setMapOffset] = useState({ top: -30, left: 0 }); // 地图偏移量
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
      null
    );
    const [selectedFilterBranchId, setSelectedFilterBranchId] = useState<
      number | ""
    >("");
    const [branches, setBranches] = useState<Branch[]>([]);
    const [alarms, setAlarms] = useState<any[]>([]);
    const [dbDevices, setDbDevices] = useState<any[]>([]);

  // const alertItems = useMemo(() => {
  //   if (alarms.length === 0) return [];
  //   return [...alarms, ...alarms, ...alarms];  // 3 份 = 18 条
  // }, [alarms]);
    const [currentMapName, setCurrentMapName] = useState<string>("china");
    const [todayStats, setTodayStats] = useState({ today_in: 0, today_out: 0 });
  const [personnelStats, setPersonnelStats] = useState({ management: 0, technical: 0, construction: 0, security: 0 });
    const [jobStats, setJobStats] = useState([]);

    
    // 新增：工人总数
const [totalWorkers, setTotalWorkers] = useState(0);

    // 新增：告警统计
const [alarmStats, setAlarmStats] = useState({
    total: 0, high: 0, medium: 0, low: 0,
    pending: 0, resolved: 0, todayNew: 0, resolveRate: 0
});
// 新增：今日告警列表
const [todayAlarms, setTodayAlarms] = useState([]);
// 新增：设备分类统计
const [deviceStats, setDeviceStats] = useState({
    cameras: { online: 0, offline: 0, fault: 0 },
    locations: { online: 0, offline: 0, fault: 0 }
});
// 新增：安全生产天数
const [globalSafetyDays, setGlobalSafetyDays] = useState(0);
    
const [avgDuration, setAvgDuration] = useState(0);
  // 原有的固定的默认中心
  const selectedCenter = useMemo(() => [105, 35] as [number, number], []);

  // const [currentData.level, setcurrentData.level] = useState<'national' | 'headquarters' | 'project'>('national');
  // const [selectedProjectDetail, setSelectedProjectDetail] = useState<any>(null);

  // ========== 全景模式数据 ==========
  // const nationalData = {
    // name: "全国信息总览",
    // level: 'national',
    // branches: 5,
    // projects: 12,
    // devices: 486,
    // personnel: 3280,
    // projectsList: [
    //   { id: 1, name: "西安东站项目", branch: "总公司", progress: 75, manager: "王建国", deviceCount: 88, userCount: 420 },
    //   { id: 2, name: "北京地铁17号线", branch: "北京分公司", progress: 45, manager: "张立军", deviceCount: 45, userCount: 320 },
    //   { id: 3, name: "上海浦东机场联络线", branch: "上海分公司", progress: 60, manager: "陈明", deviceCount: 38, userCount: 295 },
    //   { id: 4, name: "广州白云站", branch: "广州分公司", progress: 30, manager: "李华", deviceCount: 52, userCount: 380 },
    //   { id: 5, name: "成都地铁18号线", branch: "成都分公司", progress: 20, manager: "刘强", deviceCount: 27, userCount: 210 },
    //   { id: 6, name: "深圳前海枢纽", branch: "深圳分公司", progress: 55, manager: "王芳", deviceCount: 41, userCount: 310 },
    //   { id: 7, name: "武汉光谷综合体", branch: "武汉分公司", progress: 40, manager: "赵刚", deviceCount: 35, userCount: 275 },
    //   { id: 8, name: "杭州西站", branch: "杭州分公司", progress: 70, manager: "孙丽", deviceCount: 48, userCount: 345 },
    //   { id: 9, name: "重庆东站", branch: "重庆分公司", progress: 25, manager: "周强", deviceCount: 32, userCount: 240 },
    //   { id: 10, name: "南京北站", branch: "南京分公司", progress: 35, manager: "吴敏", deviceCount: 28, userCount: 215 },
    //   { id: 11, name: "天津西站", branch: "天津分公司", progress: 50, manager: "郑涛", deviceCount: 30, userCount: 225 },
    //   { id: 12, name: "青岛胶东机场", branch: "青岛分公司", progress: 65, manager: "王磊", deviceCount: 22, userCount: 245 }
    // ],
    // alarms: { 
    //   total: 18, 
    //   high: 6, 
    //   medium: 7, 
    //   low: 5, 
    //   pending: 14, 
    //   resolved: 4,
    //   list: []
    // },
    // personnelStats: { total: 3280, todayIn: 486, todayOut: 324 },
    // devicesList: {
    //   cameraOnline: 164, cameraOffline: 18, cameraFault: 4,
    //   locationOnline: 148, locationOffline: 16, locationLowBattery: 8
    // },
    // avgProgress: 48,
    // safetyDays: 128
  // };

  // ========== 总公司数据 ==========
  // const headquartersData = {
  //   name: "西安总公司·信息总览",
  //   level: 'headquarters',
  //   branches: 1,
  //   projects: 3,
  //   devices: 156,
  //   personnel: 856,
  //   projectsList: [
  //     { id: 1, name: "西安东站项目", branch: "总公司", progress: 75, manager: "王建国", deviceCount: 88, userCount: 420 },
  //     { id: 2, name: "西安地铁8号线", branch: "总公司", progress: 45, manager: "李明", deviceCount: 42, userCount: 236 },
  //     { id: 3, name: "咸阳机场T5航站楼", branch: "总公司", progress: 30, manager: "张伟", deviceCount: 26, userCount: 200 }
  //   ],
  //   alarms: { 
  //     total: 5, 
  //     high: 2, 
  //     medium: 2, 
  //     low: 1, 
  //     pending: 4, 
  //     resolved: 1,
  //     list: [
  //       { id: 1, severity: "HIGH", type: "电子围栏告警", description: "人员越界", location: "西安东站项目", time: "15:30:22", status: "pending", branch_name: "总公司" },
  //       { id: 2, severity: "HIGH", type: "SOS告警", description: "工人紧急求助", location: "西安地铁8号线", time: "14:15:45", status: "pending", branch_name: "总公司" },
  //       { id: 3, severity: "MEDIUM", type: "设备离线", description: "摄像头离线", location: "西安东站项目", time: "13:20:15", status: "pending", branch_name: "总公司" },
  //       { id: 4, severity: "MEDIUM", type: "区域超员", description: "施工区人员超限", location: "咸阳机场T5航站楼", time: "11:45:30", status: "pending", branch_name: "总公司" },
  //       { id: 5, severity: "LOW", type: "设备预警", description: "传感器电量低", location: "西安地铁8号线", time: "10:30:12", status: "resolved", branch_name: "总公司" }
  //     ]
  //   },
  //   personnelStats: { total: 856, todayIn: 124, todayOut: 56 },
  //   devicesList: {
  //     cameraOnline: 62, cameraOffline: 4, cameraFault: 2,
  //     locationOnline: 48, locationOffline: 4, locationLowBattery: 3
  //   },
  //   avgProgress: 50,
  //   safetyDays: 365
  // };

  // ========== 项目级数据（西安东站）==========
  // const projectData = {
  //   name: "西安东站项目·详情",
  //   level: 'project',
  //   projectId: 1,
  //   projectName: "西安东站项目",
  //   manager: "王建国",
  //   branches: 1,
  //   projects: 1,
  //   devices: 88,
  //   personnel: 420,
  //   progress: 75,
  //   projectsList: [
  //     { id: 1, name: "西安东站项目", branch: "总公司", progress: 75, manager: "王建国", deviceCount: 88, userCount: 420 }
  //   ],
  //   alarms: { 
  //     total: 3, 
  //     high: 1, 
  //     medium: 1, 
  //     low: 1, 
  //     pending: 2, 
  //     resolved: 1,
  //     list: [
  //       { id: 1, severity: "HIGH", type: "电子围栏告警", description: "人员越界", location: "A区施工区", time: "15:30:22", status: "pending", branch_name: "西安东站项目" },
  //       { id: 2, severity: "MEDIUM", type: "设备离线", description: "摄像头离线", location: "B区出入口", time: "13:20:15", status: "pending", branch_name: "西安东站项目" },
  //       { id: 3, severity: "LOW", type: "设备预警", description: "传感器电量低", location: "C区仓库", time: "10:30:12", status: "resolved", branch_name: "西安东站项目" }
  //     ]
  //   },
  //   personnelStats: { 
  //     total: 420, 
  //     todayIn: 48, 
  //     todayOut: 12,
  //     departmentStats: {
  //       management: 28,
  //       technical: 85,
  //       construction: 287,
  //       security: 20
  //     }
  //   },
  //   devicesList: {
  //     cameraOnline: 42, cameraOffline: 8, cameraFault: 3,
  //     locationOnline: 33, locationOffline: 5, locationLowBattery: 2,
  //     sensorOnline: 28, sensorOffline: 3, sensorFault: 1
  //   },
  //   safetyDays: 128,
  //   completionRate: 75,
  //   scheduleStatus: "正常推进"
  // };

  // 根据当前选中的项目ID获取数据
  // const getCurrentData = () => {
  //   if (selectedProjectId && selectedProjectId === 1) {
  //     return projectData;
  //   }
  //   if (currentData.level === 'headquarters') {
  //     return headquartersData;
  //   }
  //   return nationalData;
  // };

  // const currentData = getCurrentData();
  //   // 监听项目选择，切换数据视图 - 👈 添加这个 useEffect
  //   useEffect(() => {
  //     if (selectedProjectId === 1) {
  //       setcurrentData.level('project');
  //     } else if (selectedFilterBranchId && branches.find(b => b.id === selectedFilterBranchId)?.name === "总公司") {
  //       setcurrentData.level('headquarters');
  //     } else {
  //       setcurrentData.level('national');
  //     }
  //   }, [selectedProjectId, selectedFilterBranchId, branches]);


  // 根据当前选中的视图，从后端返回的数据中计算
  const currentData = useMemo(() => {
    // 全景模式 - 未选择任何分公司
    if (!selectedFilterBranchId) {
      const totalDevices = dbDevices.length;
const totalPersonnel = Array.isArray(projects) ? projects.reduce((sum, p) => sum + (p.userCount || 0), 0) : 0;
const avgProgress = Array.isArray(projects) && projects.length 
    ? Math.round(projects.reduce((sum, p) => sum + (p.progress || 0), 0) / projects.length) 
    : 0;
      
      return {
        name: "全国信息总览",
        level: 'national',
        branches: branches.length,
        projects: projects.length,
        devices: totalDevices,
        personnel: totalWorkers,
        projectsList: projects,
        avgDuration: avgDuration,
        alarms: {
            total: alarmStats.total,
            high: alarmStats.high,
            medium: alarmStats.medium,
            low: alarmStats.low,
            pending: alarmStats.pending,
            resolved: alarmStats.resolved,
            todayNew: alarmStats.todayNew,
            resolveRate: alarmStats.resolveRate,
            list: todayAlarms
        },
personnelStats: {
    total: todayStats.today_in - todayStats.today_out,
    todayIn: todayStats.today_in,
    todayOut: todayStats.today_out,
    jobStats: jobStats
},
devicesList: {
    cameraOnline: deviceStats.cameras.online,
    cameraOffline: deviceStats.cameras.offline,
    cameraFault: deviceStats.cameras.fault,
    locationOnline: deviceStats.locations.online,
    locationOffline: deviceStats.locations.offline,
    locationLowBattery: deviceStats.locations.fault,
},

        avgProgress: avgProgress,
        ssafetyDays: globalSafetyDays,  
      };
    }
    
    // 分公司模式 - 选择了分公司但未选择具体项目
    if (selectedFilterBranchId && !selectedProjectId) {
      const branchProjects = projects.filter(p => p.branch_id === selectedFilterBranchId);
      const branchDevices = dbDevices.filter(d => d.branch_id === selectedFilterBranchId);
      const branchAlarms = alarms.filter(a => a.branch_id === selectedFilterBranchId);
      const selectedBranch = branches.find(b => b.id === selectedFilterBranchId);
const totalPersonnel = totalWorkers;  // 分公司模式依然用全局工人总数
const avgProgress = Array.isArray(branchProjects) && branchProjects.length 
    ? Math.round(branchProjects.reduce((sum, p) => sum + (p.progress || 0), 0) / branchProjects.length) 
    : 0;
      
      return {
        name: `${selectedBranch?.name || '分公司'}·信息总览`,
        level: 'headquarters',
        branches: branchProjects.length,
        projects: branchProjects.length,
        devices: branchDevices.length,
        personnel: branchProjects.reduce((sum, p) => sum + (p.userCount || 0), 0),
        projectsList: branchProjects,
        teamCount: branchProjects.reduce((sum, p) => sum + (p.teamCount || 0), 0),
        avgDuration: avgDuration, 
        alarms: {
            total: alarmStats.total,
            high: alarmStats.high,
            medium: alarmStats.medium,
            low: alarmStats.low,
            pending: alarmStats.pending,
            resolved: alarmStats.resolved,
            todayNew: alarmStats.todayNew,
            resolveRate: alarmStats.resolveRate,
            list: todayAlarms
        },
personnelStats: {
    total: todayStats.today_in - todayStats.today_out,
    todayIn: todayStats.today_in,
    todayOut: todayStats.today_out
},
devicesList: {
    cameraOnline: branchDevices.filter(d => d.is_online && ['bullet_camera', 'dome_camera', 'body_camera', 'drone'].includes(d.device_type)).length,
    cameraOffline: branchDevices.filter(d => !d.is_online && !d.is_fault && ['bullet_camera', 'dome_camera', 'body_camera', 'drone'].includes(d.device_type)).length,
    cameraFault: branchDevices.filter(d => d.is_fault && ['bullet_camera', 'dome_camera', 'body_camera', 'drone'].includes(d.device_type)).length,
    locationOnline: branchDevices.filter(d => d.is_online && ['rtk', 'uwb', 'gps_tag', 'gps_band', 'smart_helmet'].includes(d.device_type)).length,
    locationOffline: branchDevices.filter(d => !d.is_online && !d.is_fault && ['rtk', 'uwb', 'gps_tag', 'gps_band', 'smart_helmet'].includes(d.device_type)).length,
    locationLowBattery: branchDevices.filter(d => d.is_fault && ['rtk', 'uwb', 'gps_tag', 'gps_band', 'smart_helmet'].includes(d.device_type)).length,
},
        avgProgress: avgProgress,
        safetyDays: Math.min(...branchProjects.map(p => p.safetyDays).filter(d => d > 0)),
      };
    }
    
    // 项目模式 - 选择了具体项目
    if (selectedProjectId) {
      const project = projects.find(p => p.id === selectedProjectId);
      const projectDevices = dbDevices.filter(d => d.project_id === selectedProjectId);
      const projectAlarms = alarms.filter(a => a.project_id === selectedProjectId);
      
      return {
        name: `${project?.name || '项目'}·详情`,
        level: 'project',
        projectId: selectedProjectId,
        projectName: project?.name,
        manager: project?.manager,
        branches: 1,
        projects: 1,
        devices: projectDevices.length,
        personnel: project?.userCount || 0,
        progress: project?.progress || 0,
        teamCount: project?.teamCount || 0,  
        workTypeCount: project?.workTypeCount || 0, 
        projectsList: [project],
        alarms: {
            total: alarmStats.total,
            high: alarmStats.high,
            medium: alarmStats.medium,
            low: alarmStats.low,
            pending: alarmStats.pending,
            resolved: alarmStats.resolved,
            todayNew: alarmStats.todayNew,
            resolveRate: alarmStats.resolveRate,
            list: todayAlarms
        },
          personnelStats: {
            total: todayStats.today_in - todayStats.today_out, 
            todayIn: todayStats.today_in,
            todayOut: todayStats.today_out,
            departmentStats: personnelStats
          },

devicesList: {
    cameraOnline: projectDevices.filter(d => d.is_online && ['bullet_camera', 'dome_camera', 'body_camera', 'drone'].includes(d.device_type)).length,
    cameraOffline: projectDevices.filter(d => !d.is_online && !d.is_fault && ['bullet_camera', 'dome_camera', 'body_camera', 'drone'].includes(d.device_type)).length,
    cameraFault: projectDevices.filter(d => d.is_fault && ['bullet_camera', 'dome_camera', 'body_camera', 'drone'].includes(d.device_type)).length,
    locationOnline: projectDevices.filter(d => d.is_online && ['rtk', 'uwb', 'gps_tag', 'gps_band', 'smart_helmet'].includes(d.device_type)).length,
    locationOffline: projectDevices.filter(d => !d.is_online && !d.is_fault && ['rtk', 'uwb', 'gps_tag', 'gps_band', 'smart_helmet'].includes(d.device_type)).length,
    locationLowBattery: projectDevices.filter(d => d.is_fault && ['rtk', 'uwb', 'gps_tag', 'gps_band', 'smart_helmet'].includes(d.device_type)).length,
},
        safetyDays: 128,
        completionRate: project?.progress || 0,
        scheduleStatus: "正常推进"
      };
    }
    
    // 默认返回空数据（兜底）
    return {
      name: "加载中...",
      level: 'national',
      branches: 0,
      projects: 0,
      devices: 0,
      personnel: 0,
      projectsList: [],
      alarms: { total: 0, high: 0, medium: 0, low: 0, pending: 0, resolved: 0, list: [] },
      personnelStats: { total: 0, todayIn: 0, todayOut: 0 },
      devicesList: { 
        cameraOnline: 0, cameraOffline: 0, cameraFault: 0, 
        locationOnline: 0, locationOffline: 0, locationLowBattery: 0 
      },
      avgProgress: 0,
      safetyDays: 0
    };
  }, [selectedFilterBranchId, selectedProjectId, branches, projects, dbDevices, alarms, personnelStats, todayStats]);
    

    // ==================================================================
    // 省份地图动态加载与注册
    // ==================================================================

  useEffect(() => {
    (async () => {
      // 未选择分支/全景模式
      if (!selectedFilterBranchId) {
        setCurrentMapName("china");
        return;
      }

      // 获取当前选择的分支
      const currentBranch = branches.find((b) => b.id === selectedFilterBranchId);
      if (!currentBranch || !currentBranch.province) {
        setCurrentMapName("china");
        return;
      }

      const provName = currentBranch.province;
      const adcode = getProvinceAdcode(provName);

      // 找不到 Adcode 或默认在根，则仍然显示全国
      if (!adcode) {
        console.warn(`未找到省份 ${provName} 对应的 Adcode`);
        setCurrentMapName("china");
        return;
      }

      // 检查当前省份是否已经被 ECharts 注册过
      if (!echarts.getMap(provName)) {
        try {
          // 使用 Aliyun DataV 下载对应的 GeoJSON
          const res = await fetch(`https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`);
          if (res.ok) {
            const geoJson = await res.json();
            echarts.registerMap(provName, geoJson as any);
          } else {
            console.error(`Failed to fetch map for ${provName} (adcode ${adcode})`);
            setCurrentMapName("china");
            return;
          }
        } catch (e) {
          console.error(`无法加载 ${provName} 的地图数据`, e);
          setCurrentMapName("china");
          return;
        }
      }

      // 切换当前地图使用注册好的省份名
      setCurrentMapName(provName);
    })();
  }, [selectedFilterBranchId, branches]);

useEffect(() => {
    (async () => {
        try {
      const baseUrl = API_BASE_URL;
            
            // ========== 基础数据（保留）==========
            const [resProjects, resBranches] = await Promise.all([
                fetch(`${baseUrl}/api/dashboard/summary`),
                fetch(`${baseUrl}/api/dashboard/branches`),
            ]);
if (resProjects.ok) {
    const data = await resProjects.json();
  const projectList = normalizeArray<ProjectSummary>(data?.projects ?? data);
  setProjects(projectList);
  setTotalWorkers(
    typeof data?.totalWorkers === 'number'
      ? data.totalWorkers
      : projectList.reduce((sum, project) => sum + (project.userCount || 0), 0)
  );
  setAvgDuration(typeof data?.avgDuration === 'number' ? data.avgDuration : 0);
}
            if (resBranches.ok) {
                const data = await resBranches.json();
        setBranches(normalizeArray<Branch>(data));
            }
            
            // ========== 设备数据 ==========
            const resDevices = await fetch(`${baseUrl}/api/dashboard/devices`);
            if (resDevices.ok) {
                const devicesData = await resDevices.json();
              setDbDevices(normalizeArray<any>(devicesData));
            }
            
// ========== 告警统计 ==========
let alarmStatsUrl = `${baseUrl}/api/dashboard/alarms/statistics`;
if (selectedProjectId) {
    alarmStatsUrl = `${baseUrl}/api/dashboard/alarms/statistics?project_id=${selectedProjectId}`;
} else if (selectedFilterBranchId) {
    alarmStatsUrl = `${baseUrl}/api/dashboard/alarms/statistics?branch_id=${selectedFilterBranchId}`;
}
const resAlarmStats = await fetch(alarmStatsUrl);
if (resAlarmStats.ok) {
    const alarmStats = await resAlarmStats.json();
    setAlarmStats(alarmStats);
}
            
            // ========== 今日告警详情（右侧滚动列表）==========
// ========== 今日告警详情（根据筛选条件）==========
let alarmsUrl = `${baseUrl}/api/dashboard/alarms/today`;
if (selectedProjectId) {
    alarmsUrl = `${baseUrl}/api/dashboard/alarms/today?project_id=${selectedProjectId}`;
} else if (selectedFilterBranchId) {
    alarmsUrl = `${baseUrl}/api/dashboard/alarms/today?branch_id=${selectedFilterBranchId}`;
}
const resTodayAlarms = await fetch(alarmsUrl);
if (resTodayAlarms.ok) {
    const todayAlarms = await resTodayAlarms.json();
  setTodayAlarms(normalizeArray<any>(todayAlarms));
}
            
            // ========== 设备分类统计 ==========
            const resDeviceStats = await fetch(`${baseUrl}/api/dashboard/devices/statistics`);
            if (resDeviceStats.ok) {
                const deviceStats = await resDeviceStats.json();
                setDeviceStats(deviceStats);
            }
            
// ========== 今日考勤（支持分公司/项目筛选）==========
let attendanceUrl = `${baseUrl}/api/dashboard/attendance/today`;
if (selectedProjectId) {
    attendanceUrl = `${baseUrl}/api/dashboard/attendance/today?project_id=${selectedProjectId}`;
} else if (selectedFilterBranchId) {
    attendanceUrl = `${baseUrl}/api/dashboard/attendance/today?branch_id=${selectedFilterBranchId}`;
}

const resAttendance = await fetch(attendanceUrl);
if (resAttendance.ok) {
    const attendanceData = await resAttendance.json();
    setTodayStats({
        today_in: attendanceData.today_in || 0,
        today_out: attendanceData.today_out || 0
    });
}
            // ========== 人员构成 ==========
            const resPersonnelStats = await fetch(`${baseUrl}/api/dashboard/personnel/stats`);
            if (resPersonnelStats.ok) {
                const personnelStatsData = await resPersonnelStats.json();
                setPersonnelStats(personnelStatsData);
            }
            
            // ========== 安全生产天数 ==========
            const resSafetyDays = await fetch(`${baseUrl}/api/dashboard/safety-days`);
            if (resSafetyDays.ok) {
                const safetyData = await resSafetyDays.json();
                setGlobalSafetyDays(safetyData.safetyDays);
            }
            
            // ========== 项目工种构成（专业构成）==========
if (selectedProjectId) {
    const resWorkTypes = await fetch(`${baseUrl}/api/dashboard/project/work-types?project_id=${selectedProjectId}`);
    if (resWorkTypes.ok) {
        const data = await resWorkTypes.json();
    setWorkTypeStats(normalizeArray<any>(data));
    }
} else {
    setWorkTypeStats([]);
}
        } catch (e) {
            console.error("fetch failed:", e);
        }
    })();
}, [selectedProjectId, selectedFilterBranchId]);

      useEffect(() => {
      const updateViewportUnits = () => {
        const vh = window.innerHeight * 0.01;
        const vw = window.innerWidth * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        document.documentElement.style.setProperty('--vw', `${vw}px`);
      };

      updateViewportUnits();
      window.addEventListener('resize', updateViewportUnits);
      
      return () => window.removeEventListener('resize', updateViewportUnits);
    }, []); 

    const filteredProjects = useMemo(() => {
      if (!selectedFilterBranchId) return [];
      return projects.filter((p) => p.branch_id === selectedFilterBranchId);
    }, [projects, selectedFilterBranchId]);

    useEffect(() => {
      if (filteredProjects.length > 0) {
        if (!filteredProjects.find((p) => p.id === selectedProjectId)) {
          setSelectedProjectId(null); 
        }
            if (selectedProjectId === null) {
        // 保持 null，显示所有项目
      }
      } else {
        setSelectedProjectId(null);
      }
    }, [filteredProjects, selectedProjectId]);

    const currentProject = projects.find((p) => p.id === selectedProjectId);
      const isHQ = !selectedFilterBranchId;
      const isBranch = selectedFilterBranchId && !selectedProjectId;
      const isAllProjects = selectedFilterBranchId && selectedProjectId === null;
      const isProject = selectedProjectId !== null && selectedProjectId !== undefined && selectedProjectId !== ""; //分公司等级

    // ==================================================================
    // ECharts 配置
    // ==================================================================

    // 设备在线状态圆盘图配置
    const deviceStatusOption = useMemo(() => {
      const onlineCount = dbDevices.filter(d => d.is_online).length;
      const offlineCount = dbDevices.length - onlineCount;
      
      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          formatter: '{b}: {c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          left: 'right',
          top: 'middle',
          textStyle: { color: '#e0f2fe', fontSize: 10 },
          itemWidth: 10,
          itemHeight: 10
        },
        series: [
          {
            name: '设备状态',
            type: 'pie',
            radius: ['50%', '80%'],
            center: ['40%', '50%'],
            avoidLabelOverlap: false,
            label: {
              show: false,
              position: 'center'
            },
            emphasis: {
              label: {
                show: true,
                fontSize: '12',
                fontWeight: 'bold',
                color: '#fff',
                formatter: '{b}\n{c}'
              }
            },
            labelLine: {
              show: false
            },
            data: [
              { 
                value: onlineCount, 
                name: '在线',
                itemStyle: {
                  color: {
                    type: 'linear',
                    x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [{ offset: 0, color: '#10b981' }, { offset: 1, color: '#059669' }]
                  }
                }
              },
              { 
                value: offlineCount, 
                name: '离线',
                itemStyle: {
                  color: {
                    type: 'linear',
                    x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [{ offset: 0, color: '#64748b' }, { offset: 1, color: '#475569' }]
                  }
                }
              }
            ]
          }
        ]
      };
    }, [dbDevices]);

  const getCenterByProvince = (provinceName: string) => {
  const centers: Record<string, [number, number]> = {
    "北京市": [116.4, 40.15],
    "上海市": [121.48, 31.22],
    "广东省": [113.23, 23.16],
    "四川省": [104.06, 30.67],
  };
  return centers[provinceName] || [110, 34]; // 没有就返回全国中心点
  };

  // 省份地图配置
  const PROVINCE_MAP_CONFIG: Record<string, { center: [number, number]; zoom: number }> = {
    "北京市": { center: [116.4, 40.18], zoom: 1.05 },
    "上海市": { center: [121.48, 31.22], zoom: 1.1 },
    "广东省": { center: [113.23, 22.56], zoom: 1.12 },
    "四川省": { center: [104.06, 29.67], zoom: 1.08 },
    "江苏省": { center: [118.76, 32.04], zoom: 1.5 },
    "浙江省": { center: [120.15, 30.28], zoom: 1.5 },
    "山东省": { center: [117.0, 36.5], zoom: 1.4 },
    "河南省": { center: [113.5, 34.0], zoom: 1.4 },
    "湖北省": { center: [114.3, 30.6], zoom: 1.4 },
    "湖南省": { center: [112.9, 28.2], zoom: 1.4 },
    "河北省": { center: [114.5, 38.0], zoom: 1.4 },
    "陕西省": { center: [108.9, 35.25], zoom: 1.1 },
    "福建省": { center: [117.5, 25.5], zoom: 1.4 },
    "江西省": { center: [115.8, 27.5], zoom: 1.4 },
    "安徽省": { center: [117.2, 31.8], zoom: 1.4 },
    "广西壮族自治区": { center: [108.3, 23.8], zoom: 1.3 },
    "云南省": { center: [102.7, 25.0], zoom: 1.3 },
    "贵州省": { center: [106.7, 26.8], zoom: 1.4 },
    "甘肃省": { center: [103.8, 36.0], zoom: 1.3 },
    "黑龙江省": { center: [126.5, 46.5], zoom: 1.2 },
    "吉林省": { center: [125.3, 43.8], zoom: 1.3 },
    "辽宁省": { center: [122.5, 41.8], zoom: 1.3 },
    "内蒙古自治区": { center: [111.7, 44.0], zoom: 1.1 },
    "新疆维吾尔自治区": { center: [82.5, 40.5], zoom: 1.0 },
    "西藏自治区": { center: [88.5, 31.5], zoom: 1.0 },
    "宁夏回族自治区": { center: [106.2, 37.2], zoom: 1.4 },
    "青海省": { center: [96.0, 36.0], zoom: 1.1 },
    "海南省": { center: [109.5, 19.0], zoom: 1.3 },
    "天津市": { center: [117.2, 39.1], zoom: 1.5 },
    "重庆市": { center: [106.5, 29.5], zoom: 1.4 },
    "香港特别行政区": { center: [114.17, 22.27], zoom: 1.8 },
    "澳门特别行政区": { center: [113.54, 22.19], zoom: 1.8 },
    "台湾省": { center: [121.0, 23.5], zoom: 1.3 },
  };

  // 获取省份地图配置
  const getProvinceMapConfig = (provinceName: string) => {
    return PROVINCE_MAP_CONFIG[provinceName] || { center: [104, 35], zoom: 1.3 };
  };

  const mapOption = useMemo(() => {
const projectPoints = projects
  .filter((p) => {
    // 如果选择了分公司，只显示该分公司的项目
    if (selectedFilterBranchId) {
      return p.branch_id === selectedFilterBranchId && p.longitude && p.latitude;
    }
    return p.longitude && p.latitude;
  })
  .map((p) => ({
    id: p.id,
    name: p.name,
    value: [p.longitude, p.latitude, 1],
    status: p.status === 'active' ? '正常' : (p.status === 'warning' ? '告警' : '离线'),
  }));

    // 判断当前是否是省份地图
    const isProvince = currentMapName !== "china";

    const provinceConfig = getProvinceMapConfig(currentMapName);

    return {
      backgroundColor: "transparent",
  tooltip: {
  trigger: "item",
  backgroundColor: "rgba(8,20,46,0.9)",
  borderColor: "#3b82f6",
  textStyle: { 
    color: "#60a5fa",
    fontSize: 14,
    fontWeight: "bold",
  },
  formatter: (params: any) => {
    return `<div style="font-weight: bold;">${params.name}</div>`;
  },
  padding: [8, 14],
},
      geo: {
        map: currentMapName,
        roam: true,
      zoom: isProvince ? provinceConfig.zoom : 1.55,
        center: isProvince ? provinceConfig.center : [110, 34],
        
        itemStyle: {
          areaColor: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(59, 130, 246, 0.45)" },
            { offset: 0.5, color: "rgba(37, 99, 235, 0.35)" },
            { offset: 1, color: "rgba(30, 64, 175, 0.25)" },
          ]),
          borderColor: "rgba(96, 165, 250, 0.5)",
          borderWidth: 1,
          shadowColor: "rgba(59, 130, 246, 0.3)",
          shadowBlur: 15,
        },
        label: {
          show: false,
        },
        emphasis: {
          itemStyle: {
            areaColor: "rgba(59, 130, 246, 0.5)",
            borderColor: "#60a5fa",
            borderWidth: 2,
          },
          label: { 
            show: false,
            color: "#fff", 
            fontWeight: "bold" 
          },
        },
      },
      series: [
        {
          type: "effectScatter",
          coordinateSystem: "geo",
          rippleEffect: { scale: 5.0, brushType: "stroke", period: 4 },
          symbolSize: 10,
          itemStyle: {
            color: (params: any) => {
              if (params.data.status === "告警") return "#ef4444";
              if (params.data.status === "离线") return "#f59e0b";
              return "#10b981";
            },
            shadowBlur: 15,
            shadowColor: "rgba(59,130,246,0.6)",
          },
          label: {
            show: false,
            formatter: "{b}",
            position: "right",
            color: "#e0f2fe",
            fontSize: "2vh",
            textShadow: "0 0 6px rgba(59,130,246,0.8)",
          },
          data: projectPoints,
        },
      ],
    };
  }, [branches, selectedCenter, currentMapName]);

    const deviceOption = useMemo(() => {
      const total = currentProject
        ? currentProject.deviceCount
        : Math.max(1, projects.reduce((acc, p) => acc + p.deviceCount, 0));
      const onlineMock = Math.floor(total * 0.85);
      return {
        series: [
          {
            type: "gauge",
            startAngle: 180,
            endAngle: 0,
            min: 0,
            max: total || 100,
            splitNumber: 5,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: "#3b82f6" },
                { offset: 1, color: "#06b6d4" },
              ]),
              shadowColor: "rgba(59,130,246,0.6)",
              shadowBlur: 15,
            },
            progress: { show: true, width: 16, roundCap: true },
            pointer: { show: false },
            axisLine: {
              lineStyle: {
                width: 16,
                color: [[1, "rgba(59,130,246,0.08)"]],
                cap: "round",
              },
            },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { show: false },
            title: {
              show: true,
              offsetCenter: [0, "25%"],
              color: "#94a3b8",
              fontSize: 11,
            },
            detail: {
              valueAnimation: true,
              offsetCenter: [0, "-10%"],
              fontSize: 36,
              fontWeight: "bolder",
              color: "#60a5fa",
              fontFamily: "'Orbitron', 'Consolas', monospace",
              formatter: "{value}",
            },
            data: [{ value: onlineMock, name: "在线设备数" }],
          },
        ],
      };
    }, [currentProject, projects]);

    const fenceOption = useMemo(() => {
      const totalFences = currentProject
        ? currentProject.fenceCount
        : projects.reduce((acc, p) => acc + p.fenceCount, 0);
      const data = [
        { value: Math.ceil(totalFences * 0.4), name: "施工区" },
        { value: Math.ceil(totalFences * 0.3), name: "危险源" },
        {
          value:
            totalFences -
            Math.ceil(totalFences * 0.4) -
            Math.ceil(totalFences * 0.3),
          name: "办公区",
        },
      ];

      return {
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(8,20,46,0.9)",
          textStyle: { color: "#fff" },
        },
        legend: {
          top: "bottom",
          textStyle: { color: "#94a3b8", fontSize: 11 },
          icon: "circle",
          itemWidth: 8,
          itemGap: 16,
        },
        series: [
          {
            name: "区域占比",
            type: "pie",
            radius: ["45%", "72%"],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 6,
              borderColor: "rgba(8,20,46,0.5)",
              borderWidth: 2,
            },
            label: { show: false, position: "center" },
            emphasis: {
              label: {
                show: false,
                fontSize: 16,
                fontWeight: "bold",
                color: "#fff",
              },
              scaleSize: 6,
            },
            labelLine: { show: false },
            data: data,
            color: ["#3b82f6", "#10b981", "#f59e0b"],
          },
        ],
      };
    }, [currentProject, projects]);

    const userOption = useMemo(() => {
      const totalUsers = currentProject
        ? currentProject.userCount
        : projects.reduce((acc, p) => acc + p.userCount, 0);
      const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
      const mockTrend = Array.from({ length: 7 }, () =>
        Math.floor(totalUsers * (0.8 + Math.random() * 0.2))
      );

      return {
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(8,20,46,0.9)",
          textStyle: { color: "#fff" },
        },
        grid: { left: "3%", right: "4%", bottom: "5%", top: "15%", containLabel: true },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: days,
          axisLabel: { color: "#64748b", fontSize: 11 },
          axisLine: { lineStyle: { color: "#1e3a5f" } },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: "#64748b", fontSize: 11 },
          splitLine: { lineStyle: { color: "rgba(59,130,246,0.08)", type: "dashed" } },
        },
        series: [
          {
            name: "出勤人数",
            type: "line",
            smooth: true,
            lineStyle: {
              color: "#0ea5e9",
              width: 2.5,
              shadowColor: "rgba(14,165,233,0.5)",
              shadowBlur: 12,
            },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(14,165,233,0.35)" },
                { offset: 1, color: "rgba(14,165,233,0)" },
              ]),
            },
            symbolSize: 6,
            itemStyle: { color: "#0ea5e9", borderColor: "#fff", borderWidth: 2 },
            data: mockTrend,
          },
        ],
      };
    }, [currentProject, projects]);

    const healthOption = useMemo(() => {
      const normal = branches.filter(
        (b) => b.status === "正常" || !b.status
      ).length;
      const alert = branches.filter((b) => b.status === "告警").length;
      const offline = branches.filter((b) => b.status === "离线").length;

      return {
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(8,20,46,0.9)",
          textStyle: { color: "#fff" },
        },
        legend: {
          bottom: 0,
          textStyle: { color: "#94a3b8", fontSize: 11 },
          icon: "circle",
          itemWidth: 8,
          itemGap: 16,
        },
        series: [
          {
            name: "分支状态",
            type: "pie",
            radius: [20, 80],
            center: ["50%", "45%"],
            roseType: "area",
            itemStyle: { borderRadius: 6 },
            label: {
              show: true,
              color: "#94a3b8",
              fontSize: 11,
              formatter: "{b}\n{c}",
            },
            data: [
              {
                value: normal || 1,
                name: "正常",
                itemStyle: { color: "#10b981" },
              },
              { value: alert, name: "告警", itemStyle: { color: "#ef4444" } },
              { value: offline, name: "离线", itemStyle: { color: "#f59e0b" } },
            ],
          },
        ],
      };
    }, [branches]);

    // ==================================================================
    // 渲染
    // ==================================================================
    const sevColor = (s: string) =>
      s === "HIGH" ? "#ef4444" : s === "MEDIUM" ? "#f59e0b" : "#3b82f6";
    const sevBg = (s: string) =>
      s === "HIGH"
        ? "rgba(239,68,68,0.12)"
        : s === "MEDIUM"
          ? "rgba(245,158,11,0.12)"
          : "rgba(59,130,246,0.12)";

    return (
      <div style={S.page}>
        {/* ====== 背景层 ====== */}
        {/* 网格 */}
        <div style={S.gridBg} />
        {/* 中心径向光晕 */}
        <div style={S.radialGlow} />
        {/* 扫光动画 */}
        <div style={S.scanLine} />

        <div style={S.container}>
          {/* ====== 顶部筛选栏 ====== */}
          <div style={S.topBar}>
            {/* 左装饰线 */}
            <div style={S.decoLineLeft} />
            <div style={{ display: "flex", gap: 20, padding: "0 20px", alignItems: "center" }}>
              
              <div style={S.filterGroup}>
                <span style={S.filterLabel}>查看范围</span>
                <select
                  className="cyber-select"
                  style={S.selectBox}
                  value={selectedFilterBranchId || ""}
                  onChange={(e) => {
                    const newBranchId = e.target.value ? Number(e.target.value) : "";
                    setSelectedFilterBranchId(newBranchId);
                    setSelectedProjectId(null);  // ← 添加这行，切换到所有项目
                  }}
                >
                  {branches.length !== 1 && (
                    <option value="">-- 全景模式 --</option>
                  )}
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={S.divider} />

              <div style={S.filterGroup}>
                <span style={S.filterLabel}>当前查看项目</span>
                <select
                  className="cyber-select"
                  style={S.selectBox}
                  value={selectedProjectId || ""}
                  onChange={(e) => setSelectedProjectId(Number(e.target.value))}
                  disabled={!selectedFilterBranchId}
                >
                  {!selectedFilterBranchId ? (
                    <option value="">请先选择分公司</option>
                  ) : filteredProjects.length === 0 ? (
                    <option value="">暂无关联项目</option>
                      ) : (
                        <>
                          <option value="">所有项目</option>  {/* 添加这行 */}
                          {filteredProjects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
              </div>
            </div>
            {/* 右装饰线 */}
            <div style={S.decoLineRight} />
          </div>

          {/* ====== 三栏网格 ====== */}
          <div style={S.mainGrid}>
            {/* ---- 左侧栏 ---- */}
            <div style={{...S.sideCol, ...S.leftCol} }>
              {/* 安全生产天数卡片 */}

  <div style={{ marginBottom: "1%", flexShrink: 0 }}>
    <div style={S.safetyCardWrapper}>
      <div style={S.safetyCardGlow} />
      <div style={S.safetyCardInner}>
        <div style={S.safetyLabel}>安全生产第</div>
        <div style={S.safetyNumber}>
    <span style={S.safetyNumberValue}>{currentData.safetyDays || globalSafetyDays || 0}</span>
          <span style={S.safetyNumberUnit}>天</span>
        </div>
      </div>
    </div>
  </div>
              {/* 左上：项目概况 */}
  <CyberPanel title={currentData.name} style={{ flex: "0 0 auto", marginTop: 1,minHeight: "25vh"}}>  <div style={S.overviewWrapper}>
      
      {/* 核心指标区 - 大数字展示 */}
  <div style={S.coreStats}>
    <div style={S.coreStatItem}>
        <div style={S.coreStatIcon}><Users size={28} strokeWidth={1.5} color="#60a5fa" /></div>
        <div style={S.coreStatInfo}>
            <div style={S.coreStatValue}>
                {currentData.level === 'project' ? (currentData.teamCount || 0) : 
                 currentData.level === 'headquarters' ? currentData.projects : 
                 currentData.branches}
            </div>
            <div style={S.coreStatLabel}>
                {currentData.level === 'project' ? '工队' : 
                 currentData.level === 'headquarters' ? '项目' : '分公司'}
            </div>
        </div>
    </div>
    <div style={S.coreStatItem}>
        <div style={S.coreStatIcon}><Briefcase size={28} strokeWidth={1.5} color="#60a5fa" /></div>
        <div style={S.coreStatInfo}>
            <div style={S.coreStatValue}>
                {currentData.level === 'project' ? (currentData.workTypeCount || 0) : 
                 currentData.level === 'headquarters' ? currentData.teamCount : 
                 currentData.projects}
            </div>
            <div style={S.coreStatLabel}>
                {currentData.level === 'project' ? '专业' : 
                 currentData.level === 'headquarters' ? '工队' : '项目'}
            </div>
        </div>
    </div>
    <div style={S.coreStatItem}>
      <div style={S.coreStatIcon}><Smartphone size={28} strokeWidth={1.5} color="#60a5fa" /></div>
      <div style={S.coreStatInfo}>
        <div style={S.coreStatValue}>{currentData.devices}</div>
        <div style={S.coreStatLabel}>设备</div>
      </div>
    </div>
    <div style={S.coreStatItem}>
      <div style={S.coreStatIcon}><Users size={28} strokeWidth={1.5} color="#60a5fa" /></div>
      <div style={S.coreStatInfo}>
        <div style={S.coreStatValue}>{currentData.personnel}</div>
        <div style={S.coreStatLabel}>人员</div>
      </div>
    </div>
  </div>

      {/* 分割线
      <div style={S.dividerLine} /> */}






    </div>
  </CyberPanel>

            {/* 人员态势区 */}
              {/* 第一块：人员状况总览 (移除了内部的专业构成) */}
               <div style={{...S.sectionBlock,marginTop: "1vh" }}>
                <div style={S.sectionTitle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Users size={22} strokeWidth={1.5} color="#60a5fa" />
                    <span>人员状况总览</span>
                  </div>
                  <span onClick={() => { setManagementTab('person'); setActiveMenu(MenuKey.MANAGEMENT); }} style={{ ...S.sectionBadge, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                    详情查看
                    <ArrowRight size={12} strokeWidth={2} />
                  </span>
                </div>
                <div style={S.personStats}>
                  <div style={S.personItem}>
                    <div style={S.personLabel}>总在场</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <div style={S.personValue}>{currentData.personnelStats.total.toLocaleString()}</div>
                      <div style={S.personTrend}>人</div>
                    </div>
                  </div>
                  <div style={S.personItem}>
                    <div style={S.personLabel}>今日进场</div>
                    <div style={{ ...S.personValue, color: "#10b981" }}>+{currentData.personnelStats.todayIn}</div>
                  </div>
                  <div style={S.personItem}>
                    <div style={S.personLabel}>今日已离场</div>
                    <div style={{ ...S.personValue, color: "#f97316" }}>-{currentData.personnelStats.todayOut}</div>
                  </div>
                </div>
                {/* 注意：这里移除了原来的专业构成 div */}
              </div>

              {/* 第二块：新增的独立专业构成区 (仅在项目级显示) */}
{currentData.level === 'project' && (
    <div style={{...S.sectionBlock, marginTop: "1vh" }}>
        <div style={S.sectionTitle}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Briefcase size={22} strokeWidth={1.5} color="#60a5fa" />
                <span>专业构成</span>
            </div>
            <span onClick={() => { setManagementTab('person'); setActiveMenu(MenuKey.MANAGEMENT); }} style={{ ...S.sectionBadge, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                详情查看
                <ArrowRight size={12} strokeWidth={2} />
            </span>
        </div>
        <div style={S.personStats}>
            {workTypeStats.length > 0 ? (
                workTypeStats.map((item, index) => {
                    const colors = ["#f9fafa", "#10b981", "#d37528", "#4e22d2"];
                    return (
                        <div key={item.id} style={S.personItem}>
                            <div style={S.personLabel}>{item.work_type_name}</div>
                            <div style={{ ...S.personValue, color: colors[index % colors.length] }}>
                                {item.count}
                            </div>
                        </div>
                    );
                })
            ) : (
                <div style={{ textAlign: "center", width: "100%", color: "#64748b", padding: "10px" }}>
                    暂无专业数据
                </div>
            )}
        </div>
    </div>
)}

      {/* 项目进度区 */}
{/* 项目进度区 - 仅在非项目视角显示 */}
{currentData.level !== 'project' && (
  <div style={S.sectionBlock}>
    <div style={S.sectionTitle}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <TrendingUp size={22} strokeWidth={1.5} color="#60a5fa" />
        <span>项目状况总览</span>
      </div>
      <span onClick={() => { setManagementTab('project'); setActiveMenu(MenuKey.MANAGEMENT); }} style={{ ...S.sectionBadge, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
        详情查看
        <ArrowRight size={12} strokeWidth={2} />
      </span>
    </div>
    <div style={S.progressInfo}>
      <div style={S.progressLabel}>平均完成进度</div>
      <div style={S.progressPercentage}>
        {currentData.level === 'project' ? currentData.progress : currentData.avgProgress}%
      </div>
    </div>
    <div style={S.progressContainer}>
      <div style={{ 
        ...S.progressFill, 
        width: `${currentData.level === 'project' ? currentData.progress : currentData.avgProgress}%`,
        background: "linear-gradient(90deg, #3b82f6, #06b6d4)"
      }} />
    </div>
    <div style={S.projectMeta}>
      {/* <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Briefcase size={14} strokeWidth={1.5} color="#60a5fa" />
        <span>在建项目 {currentData.projectsList.length}个</span>
      </span> */}
      {currentData.level === 'project' && (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Award size={14} strokeWidth={1.5} color="#fbbf24" />
          <span>负责人: {currentData.manager}</span>
        </span>
      )}
{currentData.level !== 'project' && (
  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
    <Clock size={14} strokeWidth={1.5} color="#60a5fa" />
    <span>平均工期 {currentData.avgDuration || 0}天</span>
  </span>
)}
    </div>
  </div>
)}

  


      {/* 围栏态势区
      <div style={S.sectionBlock}>
        <div style={S.sectionTitle}>
          <span>🚧 围栏态势</span>
          <span style={S.sectionBadge}>电子围栏</span>
        </div>
        <div style={S.fenceStats}>
          <div style={S.fenceItem}>
            <div style={S.fenceLabel}>总围栏数</div>
            <div style={S.fenceValue}>{projects.reduce((a, p) => a + p.fenceCount, 0)}</div>
          </div>
          <div style={S.fenceItem}>
            <div style={S.fenceLabel}>活跃围栏</div>
            <div style={S.fenceValue}>{Math.floor(projects.reduce((a, p) => a + p.fenceCount, 0) * 0.85)}</div>
          </div>
          <div style={S.fenceItem}>
            <div style={S.fenceLabel}>今日告警</div>
            <div style={{ ...S.fenceValue, color: "#ef4444" }}>3</div>
          </div>
        </div>
      </div> */}
                {/* {currentProject ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                      height: "100%",
                      justifyContent: "center",
                      animation: "fadeInUp 0.5s ease-out",
                    }}
                  >
                    <GlowNumber
                      value={currentProject.name}
                      color="#60a5fa"
                      size={22}
                    />
                    <div style={S.infoRow}>
                      <span style={S.labelGray}>运营负责人</span>
                      <span style={{ color: "#e2e8f0", fontSize: 15 }}>
                        {currentProject.manager || "—"}
                      </span>
                    </div>
                    <div style={S.infoRow}>
                      <span style={S.labelGray}>项目状态</span>
                      <span
                        style={{
                          color:
                            currentProject.status === "active"
                              ? "#4ade80"
                              : "#f87171",
                          fontWeight: "bold",
                          background:
                            currentProject.status === "active"
                              ? "rgba(74, 222, 128, 0.1)"
                              : "rgba(248, 113, 113, 0.1)",
                          padding: "3px 10px",
                          borderRadius: 12,
                          border: currentProject.status === "active" ? "1px solid #4ade80" : "1px solid #f87171",
                          fontSize: 12,
                        }}
                      >
                        {currentProject.status === "active"
                          ? "● 进行中"
                          : currentProject.status}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={S.emptyText}>
                    全景模式 · 请选择分公司与具体项目
                  </div>
                )} */}
              {/* </CyberPanel> */}



              {/* 左下：围栏分类 */}
              {/* <CyberPanel title="区域电子围栏分类" style={{ flex: 1 }}>
                <ReactECharts
                  option={fenceOption}
                  style={{ width: "100%", height: "100%" }}
                />
              </CyberPanel> */}
            </div>

            {/* ---- 中间地图区 ---- */}
            <div style={S.centerCol}>
              {/* 地图悬浮标题
              <div style={S.mapTitle}>
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#10b981",
                    marginRight: 8,
                    animation: "status-dot 2s infinite",
                    color: "#10b981",
                  }}
                />
                全国项目分布
              </div> */}
              {/* 地图科技角标 */}
              <div style={{ ...S.mapCorner, top: 0, left: 0, borderTop: "2px solid rgba(96,165,250,0.4)", borderLeft: "2px solid rgba(96,165,250,0.4)" }} />
              <div style={{ ...S.mapCorner, top: 0, right: 0, borderTop: "2px solid rgba(96,165,250,0.4)", borderRight: "2px solid rgba(96,165,250,0.4)" }} />
              {/* <div style={{ ...S.mapCorner, bottom: 0, left: 0, borderBottom: "2px solid rgba(96,165,250,0.4)", borderLeft: "2px solid rgba(96,165,250,0.4)" }} /> */}
              <div style={{ 
                  ...S.mapCorner, 
                  bottom: "auto",     // 取消 bottom 定位
                  top: "95%",         // 用 top 来控制位置（数值越大越往下，越小越往上）
                  left: 0, 
                  borderBottom: "2px solid rgba(96,165,250,0.4)", 
                  borderLeft: "2px solid rgba(96,165,250,0.4)" 
                }} />
              {/* <div style={{ ...S.mapCorner, bottom: 0, right: 0, borderBottom: "2px solid rgba(96,165,250,0.4)", borderRight: "2px solid rgba(96,165,250,0.4)" }} /> */}
              <div style={{ 
                  ...S.mapCorner, 
                  bottom: "auto",     // 取消 bottom 定位
                  top: "95%",         // 和左下角保持一致
                  right: 0, 
                  borderBottom: "2px solid rgba(96,165,250,0.4)", 
                  borderRight: "2px solid rgba(96,165,250,0.4)" 
                }} />
{/* 根据视图显示不同地图 */}
{currentData.level === 'project' && currentProject ? (
  <>
        {console.log('传给 ProjectMap 的 devices:', currentProject?.devices)}
    <ProjectMap 
        project={{
            id: currentProject.id,
            name: currentProject.name,
           center: (() => {
    if (!currentProject.center) {
        // 没有 center，用 longitude/latitude
        return [currentProject.longitude, currentProject.latitude];
    }
    // 如果已经是数组，直接使用
    if (Array.isArray(currentProject.center)) {
        return currentProject.center;
    }
    // 如果是字符串，尝试解析
    try {
        return JSON.parse(currentProject.center);
    } catch {
        return [currentProject.longitude, currentProject.latitude];
    }
})(),
            zoom_level: 17,
            area_boundary: (() => {
    if (!currentProject.area_boundary) return [];
    if (Array.isArray(currentProject.area_boundary)) return currentProject.area_boundary;
    try { return JSON.parse(currentProject.area_boundary); } 
    catch { return []; }
})(),
devices: currentProject.devices || [], 
            deviceCount: currentProject.deviceCount
        }}
        height="100%"
    />
        </>
) : (
    <div style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
    }}>
        <ReactECharts
            option={mapOption}
            style={{ width: "100%", height: "100%" }}
            opts={{ renderer: 'canvas' }}
            notMerge
            lazyUpdate
        />
        {/* 右下角图例 */}
        <div style={{
            position: "absolute",
            bottom: "15%",
            right: "2%",
            background: "rgba(8, 20, 46, 0.85)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(96, 165, 250, 0.3)",
            borderRadius: "1vh",
            padding: "1vh 1.5vh",
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            gap: "0.8vh",
            fontSize: "1.8vh",
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1vh" }}>
                <span style={{ width: "1.2vh", height: "1.2vh", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 0.4vh #10b981" }}></span>
                <span style={{ color: "#e0f2fe" }}>正常施工项目</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "1vh" }}>
                <span style={{ width: "1.2vh", height: "1.2vh", borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 0.4vh #ef4444" }}></span>
                <span style={{ color: "#e0f2fe" }}>今日发生告警项目</span>
            </div>
        </div>
    </div>
)}

            </div>
            {/* ---- 右侧栏 ---- */}
            <div style={{ ...S.sideCol, ...S.rightCol }}>
              {/* 右上：实时预警 */}
  <CyberPanel title={currentData.level === 'project' ? `${currentData.projectName}·实时预警` : (currentData.level === 'national' ? "实时预警动态" : "总公司·实时预警动态")} style={{ width: "88%",height: "24vh", overflow: "hidden" }}>
<div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 8,
    position: "relative",
    paddingRight: 4,
    animation: (() => {
      const len = currentData.alarms.list?.length || 0;
      if (len <= 2) return "none";
      let speed = "240s";
      if (len <= 5) speed = "22s";
      else if (len <= 10) speed = "45s";
      else if (len <= 20) speed = "90s";
      else speed = "90s";
      return `scrollAlerts ${speed} linear infinite`;
    })(),
  }}
  onMouseEnter={(e) => {
    if ((currentData.alarms.list?.length || 0) > 2) {
      e.currentTarget.style.animationPlayState = "paused";
    }
  }}
  onMouseLeave={(e) => {
    if ((currentData.alarms.list?.length || 0) > 2) {
      e.currentTarget.style.animationPlayState = "running";
    }
  }}
>
      {currentData.alarms.list && currentData.alarms.list.length > 0 ? (
        currentData.alarms.list.map((a, idx) => (
  <div key={`${a.id}-${idx}`} 
    className="cyber-alarm-card"
    style={{
      background: sevBg(a.severity),
      border: "1px solid " + sevColor(a.severity) + "30",
      padding: "0.6vh 2vw",
      borderRadius: 6,
      display: "flex",
      flexDirection: "column",
      gap: "0.4vh",
      borderLeft: "3px solid " + sevColor(a.severity),
    }}
  >
    {/* 第一行：告警类型和时间 - 两端对齐 */}
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span
        style={{
          color: sevColor(a.severity),
          fontWeight: "bold",
          fontSize: 14,
        }}
      >
        [{a.alarm_type}]
      </span>
      <span style={{ color: "#d83d3d", fontSize: 14 }}>
        {a.timestamp?.split(" ")[1] || ""}
      </span>
    </div>
    
    {/* 第二行：描述和状态 - 两端对齐 */}
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <div
        style={{
          color: "#cbd5e1",
          fontSize: 14,
          lineHeight: 1.4,
          flex: 1,
        }}
      >
        {a.description} · {a.branch_name}
      </div>
      <span
        style={{
          fontSize: 14,
          color: a.status === "resolved" ? "#10b981" : "#f87171",
          background: a.status === "resolved" ? "rgba(16,185,129,0.1)" : "rgba(248,113,113,0.1)",
          border: a.status === "resolved" ? "1px solid #10b981" : "1px solid #f87171",
          padding: "2px 8px",
          borderRadius: 10,
          whiteSpace: "nowrap",
        }}
      >
        {a.status === "resolved" ? "已处理" : "未处理"}
      </span>
    </div>
  </div>
                    ))
                  ) : (
                    <div style={{ ...S.emptyText, color: "#10b981", marginTop: 50 }}>
                      当前暂无行为告警
                    </div>
                  )}
                </div>
              </CyberPanel>

              {/* 告警态势区 */}
  {/* 告警态势区 */}
  <div style={{ ...S.sectionBlock, width: "88%", marginRight: "auto", marginLeft: 0,marginTop: "0.7vh", height: "22vh", overflow: "hidden", padding: "1vh" }}>
  <div style={S.sectionTitle}>
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Bell size={22} strokeWidth={1.5} color="#ef4444" />
        <span>今日告警态势</span>
      </div>
      {/* 今日新增徽章 - 紧贴在标题后面 */}
      <span style={{ 
        background: "rgba(239,68,68,0.2)",
        color: "#ef4444",
        padding: "2px 10px",
        borderRadius: "20px",
        fontSize: "12px",
        fontWeight: "600",
        border: "1px solid rgba(239,68,68,0.3)",
        display: "flex",
        alignItems: "center",
        gap: "4px"
      }}>
        <span style={{ 
          display: "inline-block", 
          width: "6px", 
          height: "6px", 
          borderRadius: "50%", 
          background: "#ef4444",
          animation: "status-dot 2s infinite"
        }} />
        今日新增：{currentData.alarms.total}
      </span>
    </div>
    {/* 详情查看链接 - 放在最右侧 */}
    <span 
      onClick={() => setActiveMenu(MenuKey.ALARM)}
      style={{ 
        fontSize: "12px",
        padding: "2px 8px",
        borderRadius: "12px",
        background: "rgba(96,165,250,0.2)",
        color: "#90cdf4",
        cursor: "pointer",
        transition: "all 0.2s",
        display: "flex",
        alignItems: "center",
        gap: "4px"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(96,165,250,0.35)";
        e.currentTarget.style.transform = "translateX(2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(96,165,250,0.2)";
        e.currentTarget.style.transform = "translateX(0)";
      }}
    >
      详情查看
      <ArrowRight size={12} strokeWidth={2} />
    </span>
  </div>

    
    {/* 加一个居中包裹层 */}
  <div style={{ marginLeft: "0vw", width: "100%" }}>
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
      {/* 第一行：高危预警、一般违章、一般隐患 */}
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={S.alarmLabel}>高危预警</div>
        <div style={{ ...S.alarmValue, color: "#ef4444" }}>
          {currentData.alarms.high}
        </div>
      </div>
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={S.alarmLabel}>安全隐患</div>
        <div style={{ ...S.alarmValue, color: "#f59e0b" }}>
          {currentData.alarms.medium}
        </div>
      </div>
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={S.alarmLabel}>一般违章</div>
        <div style={{ ...S.alarmValue, color: "#3b82f6" }}>
          {currentData.alarms.low}
        </div>
      </div>
    </div>
  </div>

    {/* 第二行同样处理 */}
  <div style={{ marginLeft: "0vw", width: "calc(100% + 2vw)" }}>
    <div style={{ display: "flex", gap: "2%", justifyContent: "center", width: "90%" }}>
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={S.alarmLabel}>待处理</div>
        <div style={{ ...S.alarmValue, color: "#f97316" }}>
          {currentData.alarms.pending}
        </div>
      </div>
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={S.alarmLabel}>已处理</div>
        <div style={{ ...S.alarmValue, color: "#10b981" }}>
          {currentData.alarms.resolved}
        </div>
      </div>
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={S.alarmLabel}>处理率</div>
        <div style={{ ...S.alarmValue, color: "#60a5fa" }}>
          {currentData.alarms.total ? Math.round((currentData.alarms.resolved / currentData.alarms.total) * 100) : 0}%
        </div>
      </div>
    </div>
  </div>
  </div>

                {/* 设备健康区 */}
  {/* 设备健康区 - 完全复用告警态势的样式 */}
  <div style={{ ...S.sectionBlock, width: "88%", marginRight: "auto", marginLeft: 0,marginTop: "0.7vh", height: "22vh", overflow: "hidden", padding: "1vh" }}>
    <div style={S.sectionTitle}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Activity size={22} strokeWidth={1.5} color="#60a5fa" />
        <span>设备状况总览</span>
      </div>
  <span onClick={() => { setManagementTab('camera'); setActiveMenu(MenuKey.MANAGEMENT); }} style={{ ...S.sectionBadge, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
    设备管理
    <ArrowRight size={12} strokeWidth={2} />
  </span>
    </div>
    
    {/* 第一行：摄像头设备统计 - 完全复用告警态势的第一行布局 */}
  {/* 第一行：摄像头设备统计 - 完全复用告警态势的第一行布局 */}
  <div style={{ marginLeft: "0vw", width: "100%" }}>
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={{ ...S.alarmLabel, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
          摄像头在线
          <span onClick={() => window.open('/monitor/camera', '_blank')} 
          style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", opacity: 0.7, transition: "opacity 0.2s", position: "relative" }}
          
            onMouseEnter={(e) => {
      e.currentTarget.style.opacity = "1";
      // 创建并显示tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'custom-tooltip';
      tooltip.textContent = '查看实时监控';
      tooltip.style.cssText = `
        position: absolute;
        bottom: 120%;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 1000;
        pointer-events: none;
        backdrop-filter: blur(4px);
        border: 1px solid rgba(96,165,250,0.3);
      `;
      e.currentTarget.appendChild(tooltip);
    }}
    onClick={() => setActiveMenu(MenuKey.VIDEOPLAYBACK)}
    onMouseLeave={(e) => {
      e.currentTarget.style.opacity = "0.7";
      // 移除tooltip
      const tooltip = e.currentTarget.querySelector('.custom-tooltip');
      if (tooltip) tooltip.remove();
    }}
  >
            <Eye size={12} strokeWidth={2} color="#60a5fa" />
          </span>
        </div>
        <div style={{ ...S.alarmValue, color: "#10b981" }}>
          {currentData.devicesList.cameraOnline}
        </div>
      </div>
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={S.alarmLabel}>摄像头离线</div>
        <div style={{ ...S.alarmValue, color: "#f97316" }}>
          {currentData.devicesList.cameraOffline}
        </div>
      </div>
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={S.alarmLabel}>摄像头故障</div>
        <div style={{ ...S.alarmValue, color: "#ef4444" }}>
          {currentData.devicesList.cameraFault || 0}
        </div>
      </div>
    </div>
  </div>

    {/* 第二行：定位设备统计 - 完全复用告警态势的第二行布局 */}
  <div style={{ marginLeft: "0vw", width: "calc(100% + 2vw)" }}>
    <div style={{ display: "flex", gap: "2%", justifyContent: "center", width: "90%" }}>
      <div style={{ textAlign: "center", flex: 1 }}>
        {/* 使用 Eye 图标 */}
        <div style={{ ...S.alarmLabel, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
          定位设备在线
  <span 
    onClick={() => window.open('/monitor/camera', '_blank')}
    style={{ 
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      opacity: 0.7,
      transition: "opacity 0.2s",
      position: "relative",
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.opacity = "1";
      // 创建并显示tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'custom-tooltip';
      tooltip.textContent = '查看实时监控';
      tooltip.style.cssText = `
        position: absolute;
        bottom: 120%;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 1000;
        pointer-events: none;
        backdrop-filter: blur(4px);
        border: 1px solid rgba(96,165,250,0.3);
      `;
      e.currentTarget.appendChild(tooltip);
    }}
    onClick={() => setActiveMenu(MenuKey.FENCE)}
    onMouseLeave={(e) => {
      e.currentTarget.style.opacity = "0.7";
      // 移除tooltip
      const tooltip = e.currentTarget.querySelector('.custom-tooltip');
      if (tooltip) tooltip.remove();
    }}
  >
    <Eye size={12} strokeWidth={2} color="#60a5fa" />
  </span>
        </div>
        <div style={{ ...S.alarmValue, color: "#10b981" }}>
          {currentData.devicesList.locationOnline}
        </div>
      </div>
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={S.alarmLabel}>定位设备离线</div>
        <div style={{ ...S.alarmValue, color: "#f97316" }}>
          {currentData.devicesList.locationOffline}
        </div>
      </div>
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={S.alarmLabel}>定位设备故障</div>
        <div style={{ ...S.alarmValue, color: "#f59e0b" }}>
          {currentData.devicesList.locationLowBattery || 0}
        </div>
      </div>
    </div>
  </div>

  {/* 项目级显示传感器统计 */}
  {currentData.level === 'project' && currentData.devicesList.sensorOnline && (
    <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid rgba(59,130,246,0.2)" }}>
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6, textAlign: "center" }}>传感器设备</div>
      <div style={{ display: "flex", justifyContent: "space-around" }}>
        <div><span style={{ color: "#10b981" }}>在线</span><br/>{currentData.devicesList.sensorOnline}</div>
        <div><span style={{ color: "#f97316" }}>离线</span><br/>{currentData.devicesList.sensorOffline}</div>
        <div><span style={{ color: "#ef4444" }}>故障</span><br/>{currentData.devicesList.sensorFault}</div>
      </div>
    </div>
  )}
  </div>
              {/* 右中：人员管理
              <CyberPanel title="劳务人员管理" style={{ flex: 1 }}>
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 14,
                    textAlign: "right",
                    zIndex: 10,
                  }}
                >
                  <div style={{ color: "#64748b", fontSize: 11 }}>今日出勤</div>
                  <GlowNumber
                    value={
                      currentProject
                        ? currentProject.userCount
                        : projects.reduce((a, p) => a + p.userCount, 0)
                    }
                    color="#0ea5e9"
                    size={26}
                  />
                </div>
                <ReactECharts
                  option={userOption}
                  style={{ width: "100%", height: "100%" }}
                />
              </CyberPanel> */}

              {/* 右下：健康度 */}
              {/* <CyberPanel title="全网组织健康度" style={{ flex: 1 }}>
                <ReactECharts
                  option={healthOption}
                  style={{ width: "100%", height: "100%" }}
                />
              </CyberPanel> */}
            </div>
          </div>


        </div>
      </div>
    );
  }

  // ==================================================================
  // 样式（纯弹性比例布局，无固定尺寸，全屏无滚动条）
  // ==================================================================
  const S: Record<string, React.CSSProperties> = {
    page: {
      height: "100%",
      width: "100%",
      background: "linear-gradient(180deg, #041235 0%, #0b1f52 50%, #05143a 100%)",
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif",
      margin: 0,
      padding: 0,
    },
    gridBg: {
      position: "absolute",
      inset: 0,
      backgroundSize: "40px 40px",
      backgroundImage: "linear-gradient(to right, rgba(59,130,246,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(59,130,246,0.04) 1px, transparent 1px)",
      pointerEvents: "none",
      zIndex: 0,
    },
    radialGlow: {
      position: "absolute",
      top: "30%",
      left: "50%",
      width: "70vw",
      height: "70vh",
      transform: "translate(-50%, -50%)",
      background: "radial-gradient(ellipse, rgba(59,130,246,0.1) 0%, transparent 70%)",
      pointerEvents: "none",
      zIndex: 0,
    },
    scanLine: {
      position: "absolute",
      left: 0,
      width: "100%",
      height: 120,
      background: "linear-gradient(180deg, transparent 0%, rgba(59,130,246,0.04) 50%, transparent 100%)",
      animation: "cyber-scan 8s linear infinite",
      pointerEvents: "none",
      zIndex: 0,
    },
    // 最外层容器：垂直弹性布局（顶部1份 + 中间8份 + 底部1份）
    container: {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      // padding: "0 1.5%",
      gap: "1%",
      position: "relative",
      zIndex: 1,
      overflow: "hidden",
      boxSizing: "border-box", 
    },
    // 顶部筛选栏：占 1 份弹性高度
    topBar: {
      flex: 0.6,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(12, 35, 80, 0.75)",
      border: "1px solid rgba(96, 165, 250, 0.2)",
      boxShadow: "0 2px 20px rgba(59, 130, 246, 0.15), inset 0 -1px 0 rgba(96,165,250,0.1)",
      backdropFilter: "blur(12px)",
      borderRadius: 40,
      padding: "0 2%",
      zIndex: 50,
      position: "relative",
      // minHeight: "1vh",     // 从 50px 调低到 42px
      // height: "1vh", 
    },
    decoLineLeft: {
      flex: 1,
      height: 1,
      marginLeft: 12,
      background: "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.5) 100%)",
    },
    decoLineRight: {
      flex: 1,
      height: 1,
      marginRight: 12,
      background: "linear-gradient(90deg, rgba(96,165,250,0.5) 0%, transparent 100%)",
    },
    filterGroup: {
      display: "flex",
      alignItems: "center",
      gap: "0.8vw",
    },
    filterLabel: {
      color: "#93c5fd",
      fontSize: "2.8vh",
      fontWeight: 600,
      letterSpacing: 1,
    },
    selectBox: {
      background: "rgba(15, 35, 75, 0.9)",
      border: "1px solid rgba(59, 130, 246, 0.35)",
      color: "#e0f2fe",
      padding: "0vh 1vh",
      borderRadius: 6,
      outline: "none",
      cursor: "pointer",
      fontSize: "2vh",
    },
    divider: {
      width: 1,
      height: 20,
      background: "linear-gradient(180deg, transparent, rgba(96,165,250,0.5), transparent)",
    },
    // 主内容区：占 8 份弹性高度（核心区域）
    mainGrid: {
      flex: 8,
      display: "grid",  
      gridTemplateColumns: "22% 52% 26%",   //布局百分比‘
      gap: "1.5%",
      minHeight: 0,
      height: "100%",
      overflow: "hidden",
    },
    // 左右侧栏：弹性填满，无滚动
    sideCol: {
      display: "flex",
      flexDirection: "column",
      gap: "1.5%",
      height: "100%",
      overflow: "hidden",
      minHeight: 0,
      width: "100%", 
      maxWidth: "100%",
      margin: "0 0vh",
    },
leftCol: {
  marginLeft: "2vh",   // 左侧栏整体向右移动
    marginTop: "2vh",    // 左侧栏向下
},
rightCol: {
  marginLeft: "-2vh",  // 左侧栏向右推
    marginTop: "2vh",    // 左侧栏向下
},
    // 中间地图：100%填满，无滚动
    centerCol: {
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      display: "flex",
      alignItems: "stretch",
      justifyContent: "stretch",
    },
    mapTitle: {
      position: "absolute",
      top: 8,
      left: "50%",
      transform: "translateX(-50%)",
      color: "#93c5fd",
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: 3,
      textShadow: "0 0 10px rgba(96,165,250,0.5)",
      zIndex: 10,
      display: "flex",
      alignItems: "center",
    },
    mapCorner: {
      position: "absolute",
      width: 24,
      height: 24,
      pointerEvents: "none",
      zIndex: 10,
      animation: "corner-pulse 4s ease-in-out infinite",
    },
    // 底部状态栏：占 1 份弹性高度
    bottomBar: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 2%",
      borderTop: "1px solid rgba(59,130,246,0.2)",
      background: "rgba(12, 35, 80, 0.85)",
      backdropFilter: "blur(12px)",
      zIndex: 10,
      fontSize: "clamp(11px, 1.5vh, 14px)",
      minHeight: 0,
    },
    infoRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    labelGray: {
      color: "#64748b",
      fontSize: 13,
    },
    emptyText: {
      color: "#475569",
      textAlign: "center",
      marginTop: 40,
      fontSize: 13,
    },
    // 安全生产卡片
    safetyCardWrapper: {
      position: "relative",
      width: "100%",
      cursor: "pointer",
      transition: "all 0.3s ease",
    },
    safetyCardGlow: {
      position: "absolute",
      inset: -2,
      background: "linear-gradient(135deg, #fbbf24, #f59e0b, #fbbf24)",
      borderRadius: 24,
      opacity: 0.5,
      filter: "blur(8px)",
      animation: "glow-pulse 3s ease-in-out infinite",
    },
    safetyCardInner: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      // gap: "1.5vw",
      background: "linear-gradient(135deg, rgba(20, 40, 80, 0.95) 0%, rgba(10, 25, 55, 0.95) 100%)",
      backdropFilter: "blur(20px)",
      border: "1px solid rgba(251, 191, 36, 0.4)",
      borderRadius: 20,
      padding: "12px 20px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
    },
    safetyLabel: {
      fontSize: 25,
      fontWeight: 500,
      color: "#fbbf24",
      letterSpacing: 2,
      textTransform: "uppercase",
      opacity: 0.8,
    },
    safetyNumber: {
      display: "flex",
      alignItems: "center",
      gap: 4,
    },
    safetyNumberValue: {
      fontSize: "clamp(32px, 5.5vh, 68px)",
      fontWeight: 800,
      color: "#b70909",
      fontFamily: "'Microsoft YaHei', 'PingFang SC', 'Helvetica Neue', sans-serif",
      // textShadow: "0 0 20px #b70909",  
      lineHeight: 1,
    },
    safetyNumberUnit: {
      fontSize: 25,
      fontWeight: 500,
      color: "#fbbf24",
    },
    // 全国总览卡片内部样式
    overviewWrapper: {
      display: "flex",
      flexDirection: "column",
      gap: "1 %",
      height: "100%",
    },
    coreStats: {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: "4%",
      flex: 1,
    },
  coreStatItem: {
    display: "flex",
    alignItems: "center",
    gap: "10%",  // 改用百分比
    background: "rgba(59,130,246,0.08)",
    borderRadius: "1.2vh",  // 改用 vh
    padding: "1% 10%",  // 改用百分比，上下1%，左右2%
    border: "1px solid rgba(59,130,246,0.2)",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    cursor: "pointer",
    position: "relative",
    overflow: "hidden",
    "&:hover": {
      transform: "translateY(-4px)",
      background: "rgba(59,130,246,0.15)",
      borderColor: "rgba(96,165,250,0.6)",
      boxShadow: "0 8px 24px rgba(59,130,246,0.3)",
    },
    "&::after": {
      content: '""',
      position: "absolute",
      top: 0,
      left: "-100%",
      width: "100%",
      height: "100%",
      background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.2), transparent)",
      transition: "left 0.6s ease",
    },
    "&:hover::after": {
      left: "100%",
    },
  },
  coreStatIcon: {
    fontSize: "clamp(28px, 4vh, 36px)",
    // animation: "icon-pulse 3s ease-in-out infinite",
    // filter: "drop-shadow(0 0 8px rgba(6,182,212,0.7))",  // 青色光效
  },
  coreStatInfo: {
    display: "flex",
    flexDirection: "row",     // 改成水平排列
    alignItems: "baseline",   // 基线对齐
    gap: "8px",               // 间距
  },
  coreStatValue: {
    fontSize: "2.5vh",
    fontWeight: 800,

    fontFamily: "Arial, sans-serif",
    background: "linear-gradient(135deg, #fff, #60a5fa)",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
    textShadow: "0 0 20px rgba(96,165,250,0.3)",
  },
    coreStatLabel: {
        minWidth: 0,        
        whiteSpace: "nowrap", 
        color: "#cbd5e1",
        fontSize: "2.4vh", 
    },
    dividerLine: {
      height: 1,
      background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.6), transparent)",
      // margin: "1px 0",
    },
    sectionBlock: {
      background: "rgba(15, 35, 75, 0.5)",
      borderRadius: 12,
      padding: "2vh",
      border: "1px solid rgba(59,130,246,0.2)",
      // flex: 1,
      minHeight: "15vh",
      
    },
  sectionTitle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 16,
    fontWeight: 600,
    color: "#ffffff",
    marginBottom: 8,
    width: "100%", 
  },
    sectionBadge: {
      fontSize: 12,
      padding: "2px 8px",
      borderRadius: 12,
      background: "rgba(96,165,250,0.2)",
      color: "#90cdf4",
    },
    healthStats: {
      display: "flex",
      justifyContent: "space-around",
      marginBottom: 8,
    },
    healthItem: {
      textAlign: "center",
    },
    healthLabel: {
      fontSize: 11,
      color: "#cbd5e1",
      marginBottom: 4,
    },
    healthValue: {
      fontSize: "clamp(18px, 3.5vh, 24px)",
      fontWeight: 700,
      color: "#ffffff",
    },
    alarmStats: {
      display: "flex",
      justifyContent: "space-between",
        alignItems: "center",
      marginBottom: 8,
      width: "100%",  
    },
    alarmItem: {
    textAlign: "center",
    flex: 1,                         // 加这行，让每个 item 平均分配宽度
    display: "flex",
    flexDirection: "column",
    alignItems: "center",    

    },
    alarmLabel: {
      fontSize: 17,
      color: "#cbd5e1",
      marginBottom: 4,
      textAlign: "center",
    },
    alarmValue: {
      fontSize: 24,
      fontWeight: 700,
      color: "#ffffff",
      textAlign: "center",
    },
    personStats: {
      display: "flex",
      justifyContent: "space-around",
    },
    personItem: {
      textAlign: "center",
    },
    personLabel: {
      fontSize: 18,
      color: "#cbd5e1",
      marginBottom: 4,
    },
    personValue: {
      fontSize: 24,
      fontWeight: 700,
      color: "#ffffff",
    },
    personTrend: {
      fontSize: 12,
      color: "#cbd5e1",
    },
    fenceStats: {
      display: "flex",
      justifyContent: "space-around",
    },
    fenceItem: {
      textAlign: "center",
    },
    fenceLabel: {
      fontSize: 11,
      color: "#cbd5e1",
      marginBottom: 4,
    },
    fenceValue: {
      fontSize: 24,
      fontWeight: 700,
      color: "#ffffff",
    },
    progressContainer: {
      height: 6,
      background: "rgba(59,130,246,0.2)",
      borderRadius: 3,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      background: "linear-gradient(90deg, #10b981, #34d399)",
      borderRadius: 3,
      transition: "width 0.5s ease",
    },
    progressInfo: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    progressLabel: {
      fontSize: 18,
      color: "#cbd5e1",
    },
    progressPercentage: {
      fontSize: 20,
      fontWeight: 700,
      color: "#ffffff",
    },
    projectMeta: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: 10,
      fontSize: 12,
      color: "#cbd5e1",
    },
  };

