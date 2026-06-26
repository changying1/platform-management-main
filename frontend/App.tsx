import React, { useState, useEffect,  useRef } from 'react';
import { FaWeixin } from 'react-icons/fa';
import {
  LayoutDashboard,
  Video,
  MapPin,
  Fence,
  AlertTriangle,
  Users,
  Bell,
  Settings,
  ChevronDown,
  User,
  Power,
  Sun,
  Cloud,
  CloudRain,
  Snowflake,
  KeyRound,
  Loader2,
  Briefcase,
  Clock,
  RotateCcw,
  MonitorCog,
  FileText, 
  Phone, 
  X,
  Grid3X3,
  Radio,
} from 'lucide-react';
import { MenuKey } from './types';
import Dashboard from './views/Dashboard';
import FenceManagement from './views/Fence';
import ProjectManagement from './views/Project/index';
import VideoCenter from './views/VideoCenter';

import SettingsView from './views/SettingsView';
import GroupCall from './views/GroupCall';
import AlarmRecord from './views/AlarmRecord';
import VideoPlayback from './views/VideoPlayback';
import ManagementPanel from './views/ManagementPanel';
import SystemLog from './views/SystemLog';
import GridManagement from './views/GridManagement';
import AIChatAssistant from './components/AIChatAssistant';
import { API_BASE_URL, getAuthHeaders, withAuthTokenParam } from './src/api/config';

type AlarmLevel = 'low' | 'medium' | 'high';

type AlarmRuntimeSettings = {
  alarmPopup: boolean;
  alarmSound: boolean;
  alarmSoundType: 'none' | 'standard' | 'emergency';
  alarmRepeatInterval: number;
  alarmAutoResolve?: boolean;
  alarmSevereFlash: boolean;
  alarmSevereUpgrade: 'sound' | 'voice' | 'call' | 'sms';
  alarmVolume: number;
};

type RuntimeAlarm = {
  type: string;
  message: string;
  deviceName: string;
  location: string;
  level: AlarmLevel;
};

type HeaderNotice = {
  id: string;
  type: 'alarm' | 'device' | 'system';
  title: string;
  message: string;
  time?: string;
  level: AlarmLevel;
  targetMenu?: MenuKey;
};

declare global {
  interface Window {
    showFenceAlarm?: (
      deviceName: string,
      violationType: string,
      fenceName: string,
      level?: 'low' | 'medium' | 'high',
      alarmTitle?: string
    ) => void;
    playAlarmSound?: (level?: AlarmLevel, loop?: boolean) => void;
    stopAlarmSound?: () => void;
  }
}

// --------------------
// 登录接口地址
// --------------------
const LOGIN_API = '/api/auth/login';
const SWITCHABLE_ACCOUNTS_API = '/api/auth/switchable-accounts';
const SWITCH_ACCOUNT_API = '/api/auth/switch';
const REMEMBER_USERNAME_KEY = 'remembered_username';

const readStoredPermissions = (): string[] => {
  try {
    const raw = localStorage.getItem('permissions');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readStoredAuth = () => {
  try {
    return JSON.parse(localStorage.getItem('auth') || '{}') || {};
  } catch {
    return {};
  }
};

const hasPermission = (permissions: string[], code: string) => {
  return permissions.includes(code);
};

const readPermissionLevel = () => {
  const stored = localStorage.getItem('permission_level') || '';
  if (stored) return stored;
  return readStoredAuth()?.permission_level || '';
};

const permissionLevelLabels: Record<string, string> = {
  headquarters_admin: '总部管理员',
  branch_admin: '分公司管理员',
  project_safety_admin: '项目管理员',
  grid_admin: '网格管理员',
  team_admin: '工队管理员',
};

const getPermissionLevelLabel = (level: string, role: string) => {
  const normalizedLevel = String(level || '').trim();
  const normalizedRole = String(role || '').trim().toUpperCase();
  if (normalizedLevel && permissionLevelLabels[normalizedLevel]) return permissionLevelLabels[normalizedLevel];
  if (normalizedRole === 'HQ' || normalizedRole === 'ADMIN' || normalizedRole === 'HEADQUARTERS_ADMIN') return '总部管理员';
  if (normalizedRole === 'BRANCH' || normalizedRole === 'BRANCH_ADMIN') return '分公司管理员';
  if (normalizedRole === 'PROJECT' || normalizedRole === 'PROJECT_SAFETY_ADMIN') return '项目管理员';
  if (normalizedRole === 'GRID' || normalizedRole === 'GRID_ADMIN') return '网格管理员';
  if (normalizedRole === 'TEAM' || normalizedRole === 'TEAM_ADMIN') return '工队管理员';
  return '普通账号';
};

const cleanOrgText = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text && !['??', 'undefined', 'null', '-'].includes(text) ? text : '';
};

const isHeadquartersAccount = (level: string, role: string) =>
  level === 'headquarters_admin' || role === 'HQ' || role === 'ADMIN';

const getCompanyDisplayName = (company: unknown, level: string, role: string) => {
  const text = cleanOrgText(company);
  if (text) return text;
  return isHeadquartersAccount(level, role) ? '总公司' : '';
};

const readCurrentUser = () => {
  const auth = readStoredAuth();
  const role = String(localStorage.getItem('role') || auth.role || '').toUpperCase();
  const permissionLevel = String(localStorage.getItem('permission_level') || auth.permission_level || '');
  const username = String(localStorage.getItem('username') || auth.username || '');
  const displayName = String(auth.full_name || username || '未登录账号');
  const company = getCompanyDisplayName(
    localStorage.getItem('company') ||
    auth.company ||
    auth.department ||
    auth.branch?.name,
    permissionLevel,
    role
  );
  const project = cleanOrgText(localStorage.getItem('project') || auth.project || auth.branch?.project);
  return {
    username,
    displayName,
    company,
    project,
    role,
    permissionLevel,
    levelLabel: getPermissionLevelLabel(permissionLevel, role),
  };
};

const canUseMainMenu = (level: string, key: MenuKey) => {
  const isHq = level === 'headquarters_admin' || !level;
  if (isHq) return true;
  if (key === MenuKey.SYSTEM_LOG || key === MenuKey.SETTINGS) {
    return level === 'branch_admin' || level === 'project_safety_admin';
  }
  return true;
};

type BranchInfo = {
  id: number;
  province?: string;
  name?: string;
  coord?: [number, number] | null;
  address?: string | null;
  project?: string | null;
  manager?: string | null;
  phone?: string | null;
  deviceCount?: number;
  status?: string;
  updatedAt?: string | null;
  remark?: string | null;
};

type LoginResp = {
  userId?: number;
  username?: string;
  full_name?: string;
  role?: string; // HQ / BRANCH
  token?: string;
  permission_level?: string | null;
  permissions?: string[];
  department_id?: number | null;
  company?: string | null;
  project?: string | null;
  project_id?: number | string | null;
  branch?: BranchInfo | null;
  must_change_password?: boolean;
  password_expired?: boolean;
};

type SwitchableAccount = {
  id?: string;
  username: string;
  name?: string;
  role?: string;
  level?: string;
  company?: string;
  project?: string;
  description?: string;
};

type LoginNotice = {
  title: string;
  message: string;
  tone: 'warning' | 'error';
};

const storeLoginSession = (data: LoginResp, fallbackUsername: string) => {
  const role = (data.role || 'HQ').toUpperCase();
  const depId = data.department_id ?? null;

  localStorage.setItem(
    'auth',
    JSON.stringify({
      userId: data.userId ?? null,
      username: data.username ?? fallbackUsername,
      full_name: data.full_name ?? null,
      role,
      permission_level: data.permission_level ?? null,
      permissions: data.permissions ?? [],
      department_id: depId,
      company: data.company ?? '',
      project: data.project ?? '',
      project_id: data.project_id ?? '',
      branch: data.branch ?? null,
      must_change_password: data.must_change_password ?? false,
      password_expired: data.password_expired ?? false,
    })
  );

  localStorage.setItem('role', role);
  localStorage.setItem('auth_token', data.token ?? '');
  localStorage.setItem('permission_level', data.permission_level ?? '');
  localStorage.setItem('permissions', JSON.stringify(data.permissions ?? []));
  localStorage.setItem('department_id', depId === null ? '' : String(depId));
  localStorage.setItem('company', data.company ?? data.branch?.name ?? '');
  localStorage.setItem('project', data.project ?? '');
  localStorage.setItem('project_id', data.project_id === null || data.project_id === undefined ? '' : String(data.project_id));
  localStorage.setItem('username', data.username ?? fallbackUsername);
  localStorage.setItem('logged_in', '1');
};

const getLocalDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shouldShowPasswordNoticeToday = (loginName: string) => {
  const normalizedName = loginName || 'unknown';
  const key = `password_change_notice:${normalizedName}`;
  const today = getLocalDateKey();
  if (localStorage.getItem(key) === today) return false;
  localStorage.setItem(key, today);
  return true;
};

const SystemNoticeModal = ({
  notice,
  onClose,
}: {
  notice: LoginNotice | null;
  onClose: () => void;
}) => {
  if (!notice) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-cyan-400/30 bg-slate-900/95 shadow-2xl shadow-cyan-950/40">
        <div className="flex items-start gap-3 border-b border-white/10 px-5 py-4">
          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            notice.tone === 'error' ? 'bg-red-500/15 text-red-300' : 'bg-amber-400/15 text-amber-300'
          }`}>
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white">{notice.title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-300">{notice.message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="关闭提示"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex justify-end px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-cyan-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-400"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Login Component ---
const LoginView = ({ onLogin }: { onLogin: (data: LoginResp, loginName: string) => void }) => {
  const [username, setUsername] = useState(() => localStorage.getItem(REMEMBER_USERNAME_KEY) || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberUsername, setRememberUsername] = useState(() => Boolean(localStorage.getItem(REMEMBER_USERNAME_KEY)));
  const [notice, setNotice] = useState<LoginNotice | null>(null);
  // const handleSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault();
  //   setLoading(true);

  //   try {
  //     const res = await fetch(LOGIN_API, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ username, password }),
  //     });

  //     if (!res.ok) {
  //       throw new Error(`login http ${res.status}`);
  //     }

  //     const data: LoginResp = await res.json();

  //     // 鉁?浣犲悗绔櫥褰曚笉浼氳繑鍥?token锛屾墍浠ヨ繖閲岀洿鎺ヤ繚瀛樷€滆韩浠戒俊鎭€?
  //     const role = (data.role || 'HQ').toUpperCase();
  //     const depId = data.department_id ?? null;

  //     // 淇濆瓨涓€涓€诲璞★紝Dashboard / 鍏跺畠椤甸潰閮藉彲浠ョ洿鎺ヨ
  //     localStorage.setItem(
  //       'auth',
  //       JSON.stringify({
  //         userId: data.userId ?? null,
  //         username: data.username ?? username,
  //         full_name: data.full_name ?? null,
  //         role,
  //         department_id: depId,
  //         branch: data.branch ?? null,
  //       })
  //     );

  //     // 鍏煎浣犲悗缁?Dashboard 璇诲彇锛堟洿绠€鍗曪級
  //     localStorage.setItem('role', role);
  //     localStorage.setItem('department_id', depId === null ? '' : String(depId));
  //     localStorage.setItem('username', data.username ?? username);

  //     // 鏍囪宸茬櫥褰?
  //     localStorage.setItem('logged_in', '1');

  //     onLogin();
  //   } catch (err) {
  //     console.error('login failed:', err);
  //     alert('鐧诲綍澶辫触锛氳纭璐﹀彿瀵嗙爜鏄惁姝ｇ‘锛屼互鍙婂悗绔槸鍚﹀凡鍚姩锛?api/auth/login锛?);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(LOGIN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.message || `login http ${res.status}`);
      }

      const loginName = username.trim();
      if (rememberUsername && loginName) {
        localStorage.setItem(REMEMBER_USERNAME_KEY, data.username || loginName);
      } else {
        localStorage.removeItem(REMEMBER_USERNAME_KEY);
      }

      storeLoginSession(data, loginName);
      onLogin(data, loginName);
    } catch (err) {
      console.error('login failed:', err);
      const message = err instanceof Error && !err.message.startsWith('login http')
        ? err.message
        : 'Login failed. Please check account/password and backend status.';
      setNotice({
        title: '登录失败',
        message,
        tone: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    // <div className="h-screen w-screen flex items-center justify-center" style={{ background: 'linear-gradient(180deg, #0b4db3 0%, #0a3f99 42%, #0a2f73 100%)' }}>
      <div 
      className="h-screen w-screen flex items-center justify-center relative"
      style={{ 
        backgroundImage: 'url("/images/登录页面背景图.png")',
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
>
    <SystemNoticeModal notice={notice} onClose={() => setNotice(null)} />

    <div className="absolute top-[80px] left-0 right-0 text-center z-10">
      <div className="flex items-center justify-center gap-4">
        {/* Logo */}
        <div className="w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 flex items-center justify-center">
          <span className="text-white font-bold text-3xl"><img src="/images/logo.jpeg" className="w-20 h-12 md:w-28 md:h-16 lg:w-36 lg:h-20" /></span>
        </div>
        {/* 大标题 */}
        <h1 className="text-4xl font-bold text-white drop-shadow-2xl">xxxx公司智能安全管理系统</h1>
      </div>
    </div>

    <div className="absolute top-[220px] left-1/2 transform -translate-x-1/2 w-[450px] rounded-2xl shadow-2xl border border-white/20 bg-black/40 backdrop-blur-md p-8 animate-in fade-in zoom-in duration-500">

      {/* 欢迎语 */}
      <p className="text-white/70 text-xl text-center font-bold mb-6">你好，欢迎登录！</p>

 <form onSubmit={handleSubmit} className="space-y-5">
  <div className="space-y-2">
    <label className="text-base font-bold text-white/70 tracking-wider ml-1">账号</label>
    <div className="relative group">
      <User className="absolute left-3 top-3 text-white/50" size={20} />
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="w-full bg-white/10 border border-white/20 rounded-lg py-3 pl-10 pr-4 text-white"
        placeholder="请输入账号"
      />
    </div>
  </div>

  <div className="space-y-2">
    <label className="text-base font-bold text-white/70 tracking-wider ml-1">密码</label>
    <div className="relative group">
      <KeyRound className="absolute left-3 top-3 text-white/50" size={20} />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full bg-white/10 border border-white/20 rounded-lg py-3 pl-10 pr-4 text-white"
        placeholder="请输入密码"
      />
    </div>
  </div>

  <div className="flex flex-col gap-3">
    <label className="flex items-center gap-2 cursor-pointer justify-end">
      <input
        type="checkbox"
        checked={rememberUsername}
        onChange={(e) => setRememberUsername(e.target.checked)}
        className="w-4 h-4 rounded"
      />
      <span className="text-sm text-white/70">记住账号</span>
    </label>
    <button
      type="submit"
      disabled={loading}
      className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-2 px-6 rounded-lg"
    >
      {loading ? "登录中..." : "登录"}
    </button>
  </div>

  <div className="pt-2">
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-white/20"></div>
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-black/40 px-3 text-white/50">其他登录方式</span>
      </div>
    </div>

    <div className="flex justify-center gap-8 mt-4">
      <button type="button" className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
          <FaWeixin size={20} color="#07C160" />
        </div>
        <span className="text-xs text-white/60">微信登录</span>
      </button>
      <button type="button" className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
            <polyline points="22,7 12,13 2,7"></polyline>
          </svg>
        </div>
        <span className="text-xs text-white/60">邮箱登录</span>
      </button>
    </div>
  </div>
</form>

      {/* <div className="mt-6 pt-4 border-t border-white/20 text-center text-xs text-white/40">
        © 2024 智能安全系统 V2.0
      </div> */}
    </div>
  </div>
);
};

// --- Sidebar Component ---
const Sidebar = ({
  activeMenu,
  setActiveMenu,
}: {
  activeMenu: MenuKey;
  setActiveMenu: (key: MenuKey) => void;
}) => {
  const menuItems = [
    { key: MenuKey.DASHBOARD, label: '现场管理', icon: LayoutDashboard },
    { key: MenuKey.VIDEO, label: '视频中心', icon: Video },
    { key: MenuKey.VIDEO_PLAYBACK, label: '视频回放', icon: Video },
    { key: MenuKey.TRACK_PLAYBACK, label: '轨迹回放', icon: MapPin },
    { key: MenuKey.VOICE_PLAYBACK, label: '通信回放', icon: Radio },
    { key: MenuKey.FENCE, label: '电子围栏', icon: Fence },
    { key: MenuKey.PROJECT, label: '项目管理', icon: Briefcase },
    { key: MenuKey.GROUP_CALL, label: '群组通话', icon: Users },
    { key: MenuKey.ALARM, label: '报警记录', icon: Bell },
    { key: MenuKey.SETTINGS, label: '管理员设置', icon: Settings },
  ];

  return (
    <div
      className="w-64 h-full flex flex-col relative z-20"
      style={{
        background: 'linear-gradient(180deg, #0b4db3 0%, #0a3f99 42%, #0a2f73 100%)',
      }}
    >
      <div className="p-4 flex items-center justify-center border-b border-white/10">
        {/* 浣犲彲浠ユ斁 logo/鏍囬 */}
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {menuItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveMenu(item.key)}
            className={`w-full flex items-center gap-3 px-6 py-4 text-sm transition-all duration-200 border-l-4
              ${activeMenu === item.key
                ? 'text-white bg-white/20 border-white font-semibold'
                : 'text-blue-100 hover:text-white hover:bg-white/10 border-transparent'
              }`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 text-xs text-white/70 text-center border-t border-white/10">
        现场安全系统 V2.0
      </div>
    </div>
  );
};

// --- Header Component ---
const Header = ({ onLogout }: { onLogout: () => void }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(true);
  const currentUser = readCurrentUser();

    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showPersonalModal, setShowPersonalModal] = useState(false); // 娣诲姞杩欎竴琛?
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Clock Timer
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Weather Fetcher (Open-Meteo API)
    // Coordinates: Shanghai (31.2304, 121.4737)
    const fetchWeather = async () => {
      try {
        setIsLoadingWeather(true);
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=31.2304&longitude=121.4737&current=temperature_2m,weather_code&timezone=Asia%2FShanghai'
        );
        const data = await res.json();

        if (data.current) {
          setWeather({
            temp: Math.round(data.current.temperature_2m),
            code: data.current.weather_code,
          });
        }
      } catch (error) {
        console.error('Failed to fetch weather data:', error);
      } finally {
        setIsLoadingWeather(false);
      }
    };

    fetchWeather();
    // Refresh weather every 15 minutes
    const weatherTimer = setInterval(fetchWeather, 15 * 60 * 1000);

    return () => {
      clearInterval(timer);
      clearInterval(weatherTimer);
    };
  }, []);

  useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
      setShowUserMenu(false);
    }
  };
  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, []);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  };

  const getWeatherIcon = (code: number) => {
    // WMO Weather interpretation codes
    if (code === 0 || code === 1) return <Sun size={16} className="text-yellow-300" />;
    if (code >= 2 && code <= 3) return <Cloud size={16} className="text-white/80" />;
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
      return <CloudRain size={16} className="text-blue-200" />;
    if (code >= 71 && code <= 77) return <Snowflake size={16} className="text-cyan-100" />;
    // Default fallback
    return <Cloud size={16} className="text-white/80" />;
  };

 return (
  <>
  <header
    className="h-16 flex items-center justify-between px-6 relative z-20"
    style={{
      background: 'linear-gradient(180deg, #0b4db3 0%, #0a3f99 42%, #0a2f73 100%)',
    }}
  >
    {/* 左侧标题 */}
<div className="flex items-center gap-4">
  <img 
    src="/images/logo.jpeg" 
    className="w-28 h-16 object-contain" 
    alt="logo" 
  />
  <h1 className="text-3xl font-bold text-white drop-shadow-lg tracking-wider">
    xxxx公司智能安全管理系统
  </h1>
</div>    
    {/* 鍙充晶鍐呭锛氭椂闂淬€侀€氱煡銆佺敤鎴枫€侀€€鍑?*/}
    <div className="flex items-center gap-6">
      {/* 鏃堕棿 */}
    <div 
      className="flex items-center gap-4 text-white font-mono bg-white/20 px-4 py-2 rounded-full border border-white/20"
      style={{ fontSize: '2.4vh' }}  
    >
      <span>{formatDate(currentTime)}</span>
      <span className="text-white/40">|</span>
      <span className="text-white font-bold w-24 text-center">{formatTime(currentTime)}</span>
    </div>


      {/* 閫氱煡鍥炬爣 */}
      <div className="relative">
        <Bell size={20} className="text-white/80 hover:text-white cursor-pointer" />
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
      </div>

{/* 甯︿笅鎷夎彍鍗曠殑鐢ㄦ埛鍖哄煙 */}
<div className="relative" ref={userMenuRef}>
  <div 
    className="flex items-center gap-2 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors group"
    onClick={() => setShowUserMenu(!showUserMenu)}
  >
    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border border-white/20 group-hover:border-white/40">
      <User size={16} className="text-white" />
    </div>
    <div className="flex flex-col items-end">
      <span className="text-xs text-white">管理员</span>
      <span className="text-[10px] text-white/70">系统管理员</span>
    </div>
    <ChevronDown size={14} className={`text-white/70 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
  </div>

  {/* 涓嬫媺鑿滃崟 */}
  {showUserMenu && (
    <div className="absolute right-0 mt-2 w-48 bg-slate-800/95 backdrop-blur-md rounded-lg shadow-xl border border-white/20 overflow-hidden z-50">
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
            <User size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">管理员</p>
            <p className="text-xs text-white/50">admin@yixian.com</p>
          </div>
        </div>
      </div>
      

      
      <div className="py-2">
<button 
  onClick={() => {
    setShowUserMenu(false);
    setShowPersonalModal(true);
  }}
  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
>
  <User size={14} className="text-cyan-400" />
  <span>个人信息</span>
</button>
        
        <button 
          onClick={() => {
            setShowUserMenu(false);
            alert('账号切换功能开发中');
          }}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
        >
          <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
          </svg>
          <span>账号切换</span>
        </button>
      </div>
      
      <div className="border-t border-white/10"></div>
      
      <button 
        onClick={() => {
          setShowUserMenu(false);
          onLogout();
        }}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Power size={14} />
        <span>退出登录</span>
      </button>
    </div>
  )}
</div>
    </div>
  </header>

      {/* 鉁?涓汉淇℃伅寮圭獥 - 鏀惧湪杩欓噷锛宧eader 鏍囩鍚庨潰 */}
    {showPersonalModal && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-slate-800 rounded-lg w-96 p-6 border border-cyan-400/30 shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-white">个人信息</h3>
            <button onClick={() => setShowPersonalModal(false)} className="text-white/60 hover:text-white">
              <X size={20} />
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-white/10">
              <span className="text-white/60">所属公司：</span>
              <span className="text-cyan-300 font-semibold">中铁一局集团电务公司</span>
            </div>
            <div className="flex justify-between py-2 border-b border-white/10">
              <span className="text-white/60">权限等级：</span>
              <span className="text-yellow-400 font-semibold">1级（超级管理员）</span>
            </div>
            <div className="flex justify-between py-2 border-b border-white/10">
              <span className="text-white/60">用户名：</span>
              <span className="text-white">admin</span>
            </div>
          </div>
          <button 
            onClick={() => setShowPersonalModal(false)}
            className="w-full mt-4 py-2 bg-cyan-500 hover:bg-cyan-400 rounded text-white font-bold"
          >
            关闭
          </button>
        </div>
      </div>
    )}
  </>
);
};

const AppHeader = ({
  onLogout,
  onSwitchAccount,
  onNavigate,
}: {
  onLogout: () => void;
  onSwitchAccount: (username: string) => Promise<void>;
  onNavigate: (key: MenuKey) => void;
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNoticePanel, setShowNoticePanel] = useState(false);
  const [notices, setNotices] = useState<HeaderNotice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const hiddenNoticeIdsRef = useRef<Set<string>>(new Set());
  const [showPersonalModal, setShowPersonalModal] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [switchableAccounts, setSwitchableAccounts] = useState<SwitchableAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [hasLoadedAccounts, setHasLoadedAccounts] = useState(false);
  const [switchingUsername, setSwitchingUsername] = useState('');
  const [switchError, setSwitchError] = useState('');
  const userMenuRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const currentUser = readCurrentUser();
  const resetAccountLoad = () => {
    setHasLoadedAccounts(false);
    setSwitchableAccounts([]);
    setSwitchError('');
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
        setShowAccountSwitcher(false);
      }
      if (noticeRef.current && !noticeRef.current.contains(event.target as Node)) {
        setShowNoticePanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadNotices = async () => {
    setNoticesLoading(true);
    try {
      const [alarmsResult, devicesResult, storageResult] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/alarms/?limit=20`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        }).then((res) => (res.ok ? res.json() : [])),
        fetch(`${API_BASE_URL}/video/?limit=5000`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        }).then((res) => (res.ok ? res.json() : [])),
        fetch(`${API_BASE_URL}/video/storage/status`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        }).then((res) => (res.ok ? res.json() : null)),
      ]);

      const alarmItems = alarmsResult.status === 'fulfilled' && Array.isArray(alarmsResult.value)
        ? alarmsResult.value
        : [];
      const deviceItems = devicesResult.status === 'fulfilled' && Array.isArray(devicesResult.value)
        ? devicesResult.value
        : [];
      const storageStatus = storageResult.status === 'fulfilled'
        ? ((storageResult.value as any)?.data || storageResult.value)
        : null;

      const pendingAlarmNotices: HeaderNotice[] = alarmItems
        .filter((alarm: any) => {
          const alarmText = [
            alarm.alarm_type,
            alarm.type,
            alarm.description,
            alarm.alarm_content,
            alarm.message,
          ].join(' ').toLowerCase();
          return String(alarm.status || '').toLowerCase() !== 'resolved'
            && !alarmText.includes('offline')
            && !alarmText.includes('离线');
        })
        .slice(0, 8)
        .map((alarm: any) => {
          const severity = String(alarm.severity || alarm.level || '').toLowerCase();
          const level: AlarmLevel = severity.includes('high') || severity.includes('severe') ? 'high' : severity.includes('low') ? 'low' : 'medium';
          return {
            id: `alarm_${alarm.id || alarm.timestamp || Math.random()}`,
            type: 'alarm',
            title: alarm.alarm_type || alarm.type || '待处理告警',
            message: alarm.description || alarm.location || alarm.device_name || '有新的告警待处理',
            time: alarm.timestamp,
            level,
            targetMenu: MenuKey.ALARM,
          };
        });

      const abnormalDeviceNotices: HeaderNotice[] = deviceItems
        .filter((device: any) => {
          const status = String(device.status || '').toLowerCase();
          return status === 'fault' || device.is_fault || device.low_battery || device.storage_abnormal || device.weak_signal;
        })
        .slice(0, 8)
        .map((device: any) => {
          const status = String(device.status || '').toLowerCase();
          const reason = device.low_battery
            ? '低电量'
            : device.storage_abnormal
              ? '存储异常'
              : device.weak_signal
                ? '信号弱'
                : status === 'fault' || device.is_fault
                  ? '设备故障'
                  : '设备离线';
          return {
            id: `device_${device.id || device.name}`,
            type: 'device',
            title: reason,
            message: device.name || device.device_name || '未知设备',
            level: reason === '设备离线' || reason === '设备故障' ? 'medium' : 'low',
            targetMenu: MenuKey.MANAGEMENT,
          };
        });

      const storageNotices: HeaderNotice[] = Array.isArray(storageStatus?.storages)
        ? storageStatus.storages
          .filter((storage: any) => storage.status === 'warning' || storage.status === 'critical')
          .map((storage: any, index: number) => ({
            id: `storage_${storage.path || index}_${storage.status}`,
            type: 'system',
            title: storage.status === 'critical' ? '录像存储空间紧急' : '录像存储空间警告',
            message: `${storage.path || '录像存储路径'} · 磁盘使用率 ${storage.usage_percent}% · 数据 ${storage.video_size_gb}GB / 限额 ${storage.max_size_gb}GB`,
            level: storage.status === 'critical' ? 'high' : 'medium',
            targetMenu: MenuKey.SETTINGS,
          }))
        : [];

      setNotices(
        [...storageNotices, ...pendingAlarmNotices, ...abnormalDeviceNotices]
          .filter((notice) => !hiddenNoticeIdsRef.current.has(notice.id))
      );
    } catch (error) {
      console.warn('load notices failed:', error);
      setNotices([]);
    } finally {
      setNoticesLoading(false);
    }
  };

  useEffect(() => {
    loadNotices();
    const timer = window.setInterval(loadNotices, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const handleNoticeClick = (notice: HeaderNotice) => {
    hiddenNoticeIdsRef.current.add(notice.id);
    setNotices((current) => current.filter((item) => item.id !== notice.id));
    if (notice.targetMenu) onNavigate(notice.targetMenu);
    setShowNoticePanel(false);
  };

  useEffect(() => {
    if (!showUserMenu || !showAccountSwitcher || hasLoadedAccounts || isLoadingAccounts) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    let disposed = false;

    const loadAccounts = async () => {
      setIsLoadingAccounts(true);
      setSwitchError('');
      try {
        const res = await fetch(SWITCHABLE_ACCOUNTS_API, {
          headers: getAuthHeaders(),
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`switchable accounts http ${res.status}`);
        }
        const data = await res.json();
        if (!disposed) {
          setSwitchableAccounts(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('load switchable accounts failed:', err);
        if (!disposed) {
          const isAbort = err instanceof DOMException && err.name === 'AbortError';
          setSwitchError(isAbort ? '账号列表加载超时，请重试' : '账号列表加载失败，请确认后端已启动且登录未过期');
        }
      } finally {
        window.clearTimeout(timeout);
        if (!disposed) {
          setIsLoadingAccounts(false);
          setHasLoadedAccounts(true);
        }
      }
    };

    loadAccounts();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [hasLoadedAccounts, showAccountSwitcher, showUserMenu]);

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);

  const formatTime = (date: Date) =>
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);

  const handleSwitchAccount = async (account: SwitchableAccount) => {
    if (!account.username || account.username === currentUser.username || switchingUsername) {
      return;
    }

    setSwitchingUsername(account.username);
    setSwitchError('');
    try {
      await onSwitchAccount(account.username);
      setShowUserMenu(false);
      setShowAccountSwitcher(false);
    } catch (err) {
      console.error('switch account failed:', err);
      setSwitchError('切换失败，请确认该账号可用且在当前账号权限范围内');
    } finally {
      setSwitchingUsername('');
    }
  };

  return (
    <>
      <header
        className="h-16 flex items-center justify-between px-6 relative z-20"
        style={{ background: 'linear-gradient(180deg, #0b4db3 0%, #0a3f99 42%, #0a2f73 100%)' }}
      >
        <div className="flex items-center gap-4">
          <img src="/images/logo.jpeg" className="w-28 h-16 object-contain" alt="logo" />
          <h1 className="text-3xl font-bold text-white drop-shadow-lg tracking-wider">
            xxxx公司智能安全管理系统
          </h1>
        </div>

        <div className="flex items-center gap-6">
          <div
            className="flex items-center gap-4 text-white font-mono bg-white/20 px-4 py-2 rounded-full border border-white/20"
            style={{ fontSize: '2.4vh' }}
          >
            <span>{formatDate(currentTime)}</span>
            <span className="text-white/40">|</span>
            <span className="text-white font-bold w-24 text-center">{formatTime(currentTime)}</span>
          </div>

          <div className="relative" ref={noticeRef}>
            <button
              type="button"
              onClick={() => setShowNoticePanel((value) => !value)}
              className="relative rounded-lg p-2 hover:bg-white/10 transition-colors"
              title="通知中心"
            >
              <Bell size={20} className="text-white/80 hover:text-white" />
              {notices.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-[10px] leading-5 text-white text-center shadow-lg shadow-red-500/40">
                  {notices.length > 99 ? '99+' : notices.length}
                </span>
              )}
            </button>
            {showNoticePanel && (
              <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-cyan-400/30 bg-slate-900/95 shadow-2xl backdrop-blur-md z-[10001]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-white">通知中心</div>
                    <div className="text-xs text-white/45">存储预警、待处理告警与设备异常</div>
                  </div>
                  <button
                    type="button"
                    onClick={loadNotices}
                    className="text-xs text-cyan-300 hover:text-cyan-100"
                  >
                    刷新
                  </button>
                </div>
                <div className="max-h-96 overflow-auto p-2">
                  {noticesLoading && notices.length === 0 ? (
                    <div className="flex items-center gap-2 px-3 py-6 text-sm text-white/60">
                      <Loader2 size={16} className="animate-spin text-cyan-300" />
                      正在加载通知
                    </div>
                  ) : notices.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-white/55">暂无待处理通知</div>
                  ) : (
                    notices.map((notice) => (
                      <button
                        key={notice.id}
                        type="button"
                        onClick={() => handleNoticeClick(notice)}
                        className="mb-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:border-cyan-300/40 hover:bg-cyan-500/10"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className={`text-sm font-semibold ${
                              notice.level === 'high' ? 'text-red-300' : notice.level === 'medium' ? 'text-amber-300' : 'text-cyan-300'
                            }`}>
                              {notice.type === 'alarm' ? '告警' : notice.type === 'device' ? '设备' : '系统'} · {notice.title}
                            </div>
                            <div className="mt-1 truncate text-xs text-white/75">{notice.message}</div>
                          </div>
                          {notice.time && <div className="shrink-0 text-[11px] text-white/40">{String(notice.time).slice(5, 16)}</div>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              className="flex items-center gap-2 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors group"
              onClick={() => setShowUserMenu((value) => !value)}
            >
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border border-white/20 group-hover:border-white/40">
                <User size={16} className="text-white" />
              </div>
              <div className="flex flex-col items-end max-w-40">
                <span className="text-xs text-white truncate max-w-full">{currentUser.displayName}</span>
                <span className="text-[10px] text-white/70 truncate max-w-full">{currentUser.levelLabel}</span>
              </div>
              <ChevronDown
                size={14}
                className={`text-white/70 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`}
              />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-800/95 backdrop-blur-md rounded-lg shadow-xl border border-white/20 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
                      <User size={18} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{currentUser.displayName}</p>
                      <p className="text-xs text-white/50 truncate">{currentUser.username || currentUser.levelLabel}</p>
                    </div>
                  </div>
                </div>

                <div className="py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowPersonalModal(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                  >
                    <User size={14} className="text-cyan-400" />
                    <span>个人信息</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAccountSwitcher((value) => {
                        const next = !value;
                        if (next && !hasLoadedAccounts) {
                          setSwitchError('');
                        }
                        return next;
                      });
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                  >
                    <KeyRound size={14} className="text-yellow-400" />
                    <span>切换账号</span>
                    <ChevronDown
                      size={12}
                      className={`ml-auto text-white/40 transition-transform ${showAccountSwitcher ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {showAccountSwitcher && (
                    <div className="mx-3 my-2 rounded-md border border-white/10 bg-black/20 overflow-hidden">
                      {isLoadingAccounts ? (
                        <div className="flex items-center gap-2 px-3 py-3 text-xs text-white/60">
                          <Loader2 size={14} className="animate-spin text-cyan-300" />
                          <span>正在加载可切换账号...</span>
                        </div>
                      ) : switchError ? (
                        <div className="px-3 py-3 text-xs text-red-300">
                          <div>{switchError}</div>
                          <button
                            type="button"
                            onClick={resetAccountLoad}
                            className="mt-2 text-cyan-300 hover:text-cyan-100"
                          >
                            重新加载
                          </button>
                        </div>
                      ) : switchableAccounts.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-white/50">暂无可切换账号</div>
                      ) : (
                        <div className="max-h-64 overflow-auto py-1">
                          {switchableAccounts.map((account) => {
                            const companyLabel = getCompanyDisplayName(account.company, account.level || '', account.role || '');
                            const projectLabel = cleanOrgText(account.project);
                            const levelLabel =
                              getPermissionLevelLabel(account.level || '', account.role || '') === '普通账号'
                                ? projectLabel
                                  ? '项目管理员'
                                  : companyLabel
                                    ? '分公司管理员'
                                    : '普通账号'
                                : getPermissionLevelLabel(account.level || '', account.role || '');
                            const isCurrent = account.username === currentUser.username;
                            const isSwitching = switchingUsername === account.username;
                            return (
                              <button
                                key={account.id || account.username}
                                type="button"
                                disabled={isCurrent || !!switchingUsername}
                                onClick={() => handleSwitchAccount(account)}
                                className={`w-full flex items-start gap-3 px-3 py-2 text-left transition-colors ${
                                  isCurrent
                                    ? 'cursor-default bg-cyan-500/10 text-cyan-200'
                                    : 'text-white/80 hover:bg-white/10 disabled:opacity-60'
                                }`}
                              >
                                <div className="mt-0.5 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                                  {isSwitching ? <Loader2 size={13} className="animate-spin" /> : <User size={13} />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium truncate">{account.name || account.username}</span>
                                    {isCurrent && <span className="text-[10px] text-cyan-300 shrink-0">当前</span>}
                                  </div>
                                  <div className="text-[11px] text-white/50 truncate">{account.username}</div>
                                  <div className="text-[11px] text-white/60 truncate">{levelLabel}</div>
                                  {(companyLabel || projectLabel) && (
                                    <div className="text-[11px] text-white/40 truncate">
                                      {[companyLabel, projectLabel].filter(Boolean).join(' / ')}
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {switchError && switchableAccounts.length > 0 && (
                        <div className="border-t border-red-400/20 px-3 py-2 text-[11px] text-red-300">
                          {switchError}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-white/10" />
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Power size={14} />
                    <span>退出登录</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {showPersonalModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-lg w-96 p-6 border border-cyan-400/30 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">个人信息</h3>
              <button onClick={() => setShowPersonalModal(false)} className="text-white/60 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between gap-4 py-2 border-b border-white/10">
                <span className="text-white/60">账号名：</span>
                <span className="text-white truncate">{currentUser.username || '-'}</span>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-white/10">
                <span className="text-white/60">显示名：</span>
                <span className="text-cyan-300 font-semibold truncate">{currentUser.displayName}</span>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-white/10">
                <span className="text-white/60">账号等级：</span>
                <span className="text-yellow-400 font-semibold truncate">{currentUser.levelLabel}</span>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-white/10">
                <span className="text-white/60">所属公司：</span>
                <span className="text-white truncate">{currentUser.company || '-'}</span>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-white/10">
                <span className="text-white/60">绑定项目：</span>
                <span className="text-white truncate">{currentUser.project || '-'}</span>
              </div>
            </div>
            <button
              onClick={() => setShowPersonalModal(false)}
              className="w-full mt-4 py-2 bg-cyan-500 hover:bg-cyan-400 rounded text-white font-bold"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  );
};

const getGlobalAlarmWebSocketUrl = () => {
  const addToken = (url: string) => withAuthTokenParam(url);
  try {
    const apiUrl = new URL(API_BASE_URL);
    const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return addToken(`${wsProtocol}//${apiUrl.host}/ws/alarm`);
  } catch {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return addToken(`${wsProtocol}//${window.location.hostname}:9000/ws/alarm`);
  }
};

const defaultAlarmRuntimeSettings: AlarmRuntimeSettings = {
  alarmPopup: true,
  alarmSound: true,
  alarmSoundType: 'standard',
  alarmRepeatInterval: 5,
  alarmAutoResolve: false,
  alarmSevereFlash: true,
  alarmSevereUpgrade: 'sound',
  alarmVolume: 30,
};

const readAlarmRuntimeSettings = (): AlarmRuntimeSettings => {
  try {
    const parsed = JSON.parse(localStorage.getItem('systemSettings') || '{}') || {};
    return {
      ...defaultAlarmRuntimeSettings,
      ...parsed,
      alarmRepeatInterval: Math.max(1, Number(parsed.alarmRepeatInterval ?? defaultAlarmRuntimeSettings.alarmRepeatInterval)),
      alarmVolume: Math.min(100, Math.max(0, Number(parsed.alarmVolume ?? defaultAlarmRuntimeSettings.alarmVolume))),
    };
  } catch {
    return defaultAlarmRuntimeSettings;
  }
};

const getAlarmLevel = (severity?: unknown): AlarmLevel => {
  const normalized = String(severity || '').toLowerCase();
  if (normalized === 'high' || normalized === 'severe' || normalized === 'critical') return 'high';
  if (normalized === 'low') return 'low';
  return 'medium';
};

const normalizeRealtimeAlarm = (raw: any): RuntimeAlarm | null => {
  const payload = (raw?.data && typeof raw.data === 'object' ? raw.data : raw) || {};
  const boxes = Array.isArray(payload.alarm_boxes)
    ? payload.alarm_boxes
    : Array.isArray(payload.boxes)
      ? payload.boxes
      : [];
  const firstBox = boxes[0] || {};

  const type = String(firstBox.type || payload.type || payload.alarm_type || '').trim();
  const message = String(firstBox.msg || payload.msg || payload.description || type || '').trim();
  const deviceName = String(payload.device_name || payload.device_id || '报警设备').trim();
  const location = String(payload.fence_name || payload.location || '系统报警').trim();
  const level = getAlarmLevel(payload.severity || payload.level || firstBox.severity);

  if (!type && !message && !payload.alarm && !payload.id && boxes.length === 0) {
    return null;
  }

  return {
    type: type || '报警',
    message: message || '检测到报警事件',
    deviceName,
    location,
    level,
  };
};

// --- Main App Component ---
export default function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>(MenuKey.DASHBOARD);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [runtimeAlarm, setRuntimeAlarm] = useState<RuntimeAlarm | null>(null);
  const [systemNotice, setSystemNotice] = useState<LoginNotice | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const alarmSoundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAlarmAtRef = useRef<Record<string, number>>({});
  const permissions = readStoredPermissions();
  const permissionLevel = readPermissionLevel();
  
  // 鏍规嵁鐢ㄦ埛鏉冮檺璁剧疆绠＄悊涓績榛樿tab锛氶珮鏉冮檺鏄剧ず椤圭洰绠＄悊锛屼綆鏉冮檺鏄剧ず缃戞牸绠＄悊
  const role = localStorage.getItem('role') || 'HQ';
  const defaultManagementTab = 'responsibility';
  const [managementTab, setManagementTab] = useState<'project' | 'responsibility' | 'grid' | 'team' | 'person' | 'camera' | 'location' | 'permission'>(defaultManagementTab);
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 鉁?鍚姩鏃跺鏋滄湰鍦版湁 logged_in 鎴?auth锛岃涓哄凡鐧诲綍锛堜笉鍐嶄緷璧?access_token锛?
  // useEffect(() => {
  //   const ok = localStorage.getItem('logged_in');
  //   const auth = localStorage.getItem('auth');
  //   if (ok === '1' || (auth && auth.length > 0)) {
  //     setIsLoggedIn(true);
  //   }
  // }, []);

  const logout = () => {
    localStorage.removeItem('logged_in');
    localStorage.removeItem('auth');
    localStorage.removeItem('role');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('permission_level');
    localStorage.removeItem('permissions');
    localStorage.removeItem('department_id');
    localStorage.removeItem('company');
    localStorage.removeItem('project');
    localStorage.removeItem('project_id');
    localStorage.removeItem('username');
    setSessionVersion((version) => version + 1);
    setIsLoggedIn(false);
  };

  const switchAccount = async (username: string) => {
    const res = await fetch(SWITCH_ACCOUNT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      credentials: 'include',
      body: JSON.stringify({ username }),
    });

    if (!res.ok) {
      throw new Error(`switch account http ${res.status}`);
    }

    const data: LoginResp = await res.json();
    storeLoginSession(data, username);
    if ((data.password_expired || data.must_change_password) && shouldShowPasswordNoticeToday(data.username || username)) {
      setSystemNotice({
        title: data.password_expired ? '密码已过期' : '请修改初始密码',
        message: data.password_expired
          ? '当前账号密码已过期。为保障系统安全，请登录后尽快修改密码。'
          : '当前账号仍在使用初始密码。为保障系统安全，请登录后尽快修改密码。',
        tone: 'warning',
      });
    }
    setActiveMenu(MenuKey.DASHBOARD);
    setSessionVersion((version) => version + 1);
    setIsLoggedIn(true);
  };

  const stopAlarmSound = () => {
    if (alarmSoundTimerRef.current) {
      clearInterval(alarmSoundTimerRef.current);
      alarmSoundTimerRef.current = null;
    }
  };

  const beepOnce = (level: AlarmLevel, settings: AlarmRuntimeSettings) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = audioContextRef.current || new AudioCtx();
      audioContextRef.current = ctx;
      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const emergency = settings.alarmSoundType === 'emergency';
      oscillator.type = emergency || level === 'high' ? 'square' : 'sine';
      oscillator.frequency.setValueAtTime(level === 'high' ? 880 : level === 'medium' ? 660 : 520, now);
      gain.gain.setValueAtTime((settings.alarmVolume / 100) * (level === 'high' ? 0.26 : 0.18), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (emergency ? 0.42 : 0.28));
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + (emergency ? 0.42 : 0.28));
    } catch {
      // Browser audio can be blocked until user interaction; keep alarm UI working.
    }
  };

  const playConfiguredAlarmSound = (level: AlarmLevel, loop = false) => {
    const settings = readAlarmRuntimeSettings();
    stopAlarmSound();
    if (!settings.alarmSound || settings.alarmSoundType === 'none' || settings.alarmVolume <= 0) return;

    beepOnce(level, settings);
    if (loop) {
      alarmSoundTimerRef.current = setInterval(() => beepOnce(level, settings), settings.alarmRepeatInterval * 60 * 1000);
    }
  };

  const showConfiguredAlarm = (deviceName: string, violationType: string, fenceName: string, level: AlarmLevel = 'medium', alarmTitle = '实时告警') => {
    const settings = readAlarmRuntimeSettings();
    const alarm = { deviceName, message: violationType, location: fenceName, level, type: alarmTitle };

    if (settings.alarmPopup) {
      setRuntimeAlarm(alarm);
      if (alarmCloseTimerRef.current) clearTimeout(alarmCloseTimerRef.current);
      alarmCloseTimerRef.current = setTimeout(() => setRuntimeAlarm(null), settings.alarmAutoResolve ? 30000 : 8000);
    }

    if (level === 'high' && settings.alarmSevereUpgrade !== 'sound') {
      if (settings.alarmSevereUpgrade === 'voice' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(`严重告警：${deviceName}：${violationType}`));
      } else {
        console.info(`严重告警升级策略: ${settings.alarmSevereUpgrade}`, alarm);
      }
    }

    playConfiguredAlarmSound(level, level === 'high' || settings.alarmSoundType === 'emergency');
  };

  useEffect(() => {
    window.playAlarmSound = playConfiguredAlarmSound;
    window.stopAlarmSound = stopAlarmSound;
    window.showFenceAlarm = showConfiguredAlarm;

    return () => {
      stopAlarmSound();
      if (alarmCloseTimerRef.current) clearTimeout(alarmCloseTimerRef.current);
      if (window.playAlarmSound === playConfiguredAlarmSound) window.playAlarmSound = undefined;
      if (window.stopAlarmSound === stopAlarmSound) window.stopAlarmSound = undefined;
      if (window.showFenceAlarm === showConfiguredAlarm) window.showFenceAlarm = undefined;
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    const connect = () => {
      if (disposed) return;

      try {
        ws = new WebSocket(getGlobalAlarmWebSocketUrl());

        ws.onmessage = (event) => {
          let data: any = null;
          try {
            data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          } catch {
            return;
          }

          window.dispatchEvent(new CustomEvent('realtime-alarm', { detail: data }));

          const alarm = normalizeRealtimeAlarm(data);
          if (!alarm) return;

          const settings = readAlarmRuntimeSettings();
          const alarmKey = `${alarm.type}|${alarm.deviceName}|${alarm.message}`;
          const now = Date.now();
          const repeatMs = settings.alarmRepeatInterval * 60 * 1000;
          if (lastAlarmAtRef.current[alarmKey] && now - lastAlarmAtRef.current[alarmKey] < repeatMs) {
            return;
          }
          lastAlarmAtRef.current[alarmKey] = now;

          showConfiguredAlarm(
            alarm.deviceName,
            alarm.message,
            alarm.location,
            alarm.level,
            alarm.type
          );
        };

        ws.onclose = () => {
          if (disposed) return;
          reconnectTimer = setTimeout(connect, 2000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        reconnectTimer = setTimeout(connect, 2000);
      }
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      ws?.close();
    };
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return <LoginView onLogin={(data, loginName) => {
      if ((data.password_expired || data.must_change_password) && shouldShowPasswordNoticeToday(data.username || loginName)) {
        setSystemNotice({
          title: data.password_expired ? '密码已过期' : '请修改初始密码',
          message: data.password_expired
            ? '当前账号密码已过期。为保障系统安全，请登录后尽快修改密码。'
            : '当前账号仍在使用初始密码。为保障系统安全，请登录后尽快修改密码。',
          tone: 'warning',
        });
      }
      setSessionVersion((version) => version + 1);
      setIsLoggedIn(true);
    }} />;
  }

  const renderContent = () => {
    switch (activeMenu) {
      case MenuKey.DASHBOARD:
        return <Dashboard key={sessionVersion} setActiveMenu={setActiveMenu} setManagementTab={setManagementTab} />;
      case MenuKey.VIDEO:
        return <VideoCenter />;
      case MenuKey.VIDEO_PLAYBACK:
        return <VideoPlayback key="video_playback" initialTab="video" />;
      case MenuKey.TRACK_PLAYBACK:
        return <VideoPlayback key="track_playback" initialTab="track" />;
      case MenuKey.VOICE_PLAYBACK:
        return <VideoPlayback key="voice_playback" initialTab="voice" />;
      case MenuKey.FENCE:
        return <FenceManagement />;
      case MenuKey.PROJECT:
        return <ProjectManagement />;
      case MenuKey.SETTINGS:
        return <SettingsView />;
      case MenuKey.GROUP_CALL:
        return <GroupCall />;
      case MenuKey.ALARM:
        return <AlarmRecord />;
      case MenuKey.MANAGEMENT: 
        return <ManagementPanel defaultTab={managementTab} />;
      case MenuKey.SYSTEM_LOG:
        return <SystemLog onNavigate={setActiveMenu} />;
      case MenuKey.GRID:
        return <GridManagement />;
      default:
        return <Dashboard key={sessionVersion} />;
    }
  };

  const navItems = [
    { key: MenuKey.DASHBOARD, label: '主页', icon: LayoutDashboard, permission: 'dashboard.view' },
    { key: MenuKey.VIDEO, label: '监控中心', icon: Video, permission: 'monitor.camera' },
    { key: MenuKey.FENCE, label: '电子围栏', icon: Fence, permission: 'fence.view' },
    { key: MenuKey.GROUP_CALL, label: '群组通话', icon: Phone, permission: 'monitor.voice' },
    { key: MenuKey.VIDEO_PLAYBACK, label: '视频回放', icon: RotateCcw, permission: 'monitor.playback' },
    { key: MenuKey.TRACK_PLAYBACK, label: '轨迹回放', icon: MapPin, permission: 'monitor.track' },
    { key: MenuKey.VOICE_PLAYBACK, label: '通信回放', icon: Radio, permission: 'monitor.voice' },
    { key: MenuKey.ALARM, label: '告警记录', icon: Bell, permission: 'alarm.view' },
    { key: MenuKey.MANAGEMENT, label: '管理中心', icon: MonitorCog, permission: 'personnel.view' },
    { key: MenuKey.SYSTEM_LOG, label: '系统日志', icon: FileText, permission: 'system.log' },
    { key: MenuKey.SETTINGS, label: '系统设置', icon: Settings, permission: 'system.role' },
  ].filter(item => {
    const levelAllows = canUseMainMenu(permissionLevel, item.key);
    const isHeadquarters = permissionLevel === 'headquarters_admin' || !permissionLevel;
    return (isHeadquarters || hasPermission(permissions, item.permission)) && levelAllows;
  });

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #0b4db3 0%, #0a3f99 42%, #0a2f73 100%)',
      }}
    >
      <div className="relative z-10 flex w-full h-full">
        {/* <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} /> */}
        <div
          className="flex-1 flex flex-col h-full overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #0b4db3 0%, #0a3f99 42%, #0a2f73 100%)',
          }}
        >

          <AppHeader key={sessionVersion} onLogout={logout} onSwitchAccount={switchAccount} onNavigate={setActiveMenu} />
          {/* <main className="flex-1 overflow-hidden relative bg-transparent pb-70"> */}
            {/* Decorative HUD Elements */}
            {/* <div className="absolute top-0 left-0 w-32 h-32 border-t-2 border-l-2 border-blue-400/20 rounded-tl-3xl pointer-events-none"></div> */}
            {/* <div className="absolute bottom-0 right-0 w-32 h-32 border-b-2 border-r-2 border-blue-400/20 rounded-br-3xl pointer-events-none"></div> */}

            <main className="flex-1 overflow-hidden relative bg-transparent">
                <div className="h-full overflow-auto">
                  {/* Decorative HUD Elements */}
                  {/* <div className="absolute top-0 left-0 w-32 h-32 border-t-2 border-l-2 border-blue-400/20 rounded-tl-3xl pointer-events-none"></div> */}
                  {/* <div className="absolute bottom-0 right-0 w-32 h-32 border-b-2 border-r-2 border-blue-400/20 rounded-br-3xl pointer-events-none"></div> */}
                  
                  {renderContent()}
                </div>
              </main>

            <div className="flex justify-center gap-8 py-3 px-6 bg-black/60 backdrop-blur-lg border-t">
              {navItems.map(item => (
                <button
                  key={item.key}
                  onClick={() => setActiveMenu(item.key)}
                  className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg ${activeMenu === item.key ? 'text-blue-400 bg-white/10' : 'text-white/60'}`}
                >
                  <item.icon size={24} />
                  <span className="text-xs">{item.label}</span>
                </button>
              ))}
            </div>


          
        </div>
      </div>
      {runtimeAlarm && readAlarmRuntimeSettings().alarmPopup && (
        <div
          className={`fixed right-6 top-20 z-[10000] w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border bg-slate-950/95 p-4 shadow-2xl backdrop-blur ${
            runtimeAlarm.level === 'high'
              ? `border-red-400/70 shadow-red-500/25 ${readAlarmRuntimeSettings().alarmSevereFlash ? 'animate-pulse' : ''}`
              : runtimeAlarm.level === 'medium'
                ? 'border-amber-400/60 shadow-amber-500/20'
                : 'border-cyan-400/60 shadow-cyan-500/20'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">{runtimeAlarm.type}</div>
              <div className="mt-1 text-xs text-slate-400">{runtimeAlarm.deviceName} / {runtimeAlarm.location}</div>
            </div>
            <button
              onClick={() => {
                setRuntimeAlarm(null);
                stopAlarmSound();
              }}
              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <div className={`mt-3 text-sm ${runtimeAlarm.level === 'high' ? 'text-red-100' : runtimeAlarm.level === 'medium' ? 'text-amber-100' : 'text-cyan-100'}`}>
            {runtimeAlarm.message}
          </div>
        </div>
      )}
      <SystemNoticeModal notice={systemNotice} onClose={() => setSystemNotice(null)} />
      <AIChatAssistant />
    </div>
  );
}
