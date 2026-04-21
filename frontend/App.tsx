import React, { useState, useEffect,  useRef } from 'react';
import { FaWeixin } from 'react-icons/fa';
import {
  LayoutDashboard,
  Video,
  MapPin,
  ShieldAlert,
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
} from 'lucide-react';
import { MenuKey } from './types';
import Dashboard from './views/Dashboard';
import FenceManagement from './views/Fence';
import ProjectManagement from './views/Project/index';
import VideoCenter from './views/VideoCenter';
import TrackPlayback from './views/TrackPlayback';
import SettingsView from './views/SettingsView';
import GroupCall from './views/GroupCall';
import AlarmRecord from './views/AlarmRecord';
import VideoPlayback from './views/VideoPlayback';
import ManagementPanel from './views/ManagementPanel';
import SystemLog from './views/SystemLog';
import AIChatAssistant from './components/AIChatAssistant';

// --------------------
// ✅ 登录接口地址（你后端真实路径）
// --------------------
const LOGIN_API = '/api/auth/login';

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
  department_id?: number | null;
  branch?: BranchInfo | null;
};

// --- Login Component ---
const LoginView = ({ onLogin }: { onLogin: () => void }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
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

  //     // ✅ 你后端登录不会返回 token，所以这里直接保存“身份信息”
  //     const role = (data.role || 'HQ').toUpperCase();
  //     const depId = data.department_id ?? null;

  //     // 保存一个总对象，Dashboard / 其它页面都可以直接读
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

  //     // 兼容你后续 Dashboard 读取（更简单）
  //     localStorage.setItem('role', role);
  //     localStorage.setItem('department_id', depId === null ? '' : String(depId));
  //     localStorage.setItem('username', data.username ?? username);

  //     // 标记已登录
  //     localStorage.setItem('logged_in', '1');

  //     onLogin();
  //   } catch (err) {
  //     console.error('login failed:', err);
  //     alert('登录失败：请确认账号密码是否正确，以及后端是否已启动（/api/auth/login）');
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);

  setTimeout(() => {
    if (username === 'admin' && password === '1') {
      localStorage.setItem('logged_in', '1');
      localStorage.setItem('role', 'HQ');
      localStorage.setItem('username', username);
      onLogin();
    } else {
      alert('账号或密码错误（默认 admin / 1）');
    }
    setLoading(false);
  }, 500);
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

      {/* 欢迎语 - 放在登录标签顶部 */}
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
      <input type="checkbox" className="w-4 h-4 rounded" />
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
        <span className="text-xs text-white/60">短信登录</span>
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
    // { key: MenuKey.TRACK, label: '轨迹回放', icon: MapPin },
    { key: MenuKey.FENCE, label: '电子围栏', icon: ShieldAlert },
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
        {/* 你可以放 logo/标题 */}
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

    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showPersonalModal, setShowPersonalModal] = useState(false); // 添加这一行
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
    {/* 左侧标题 - 左对齐 */}
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
    {/* 右侧内容：时间、通知、用户、退出 */}
    <div className="flex items-center gap-6">
      {/* 时间 */}
    <div 
      className="flex items-center gap-4 text-white font-mono bg-white/20 px-4 py-2 rounded-full border border-white/20"
      style={{ fontSize: '2.4vh' }}  
    >
      <span>{formatDate(currentTime)}</span>
      <span className="text-white/40">|</span>
      <span className="text-white font-bold w-24 text-center">{formatTime(currentTime)}</span>
    </div>


      {/* 通知图标 */}
      <div className="relative">
        <Bell size={20} className="text-white/80 hover:text-white cursor-pointer" />
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
      </div>

{/* 带下拉菜单的用户区域 */}
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

  {/* 下拉菜单 */}
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
    setShowPersonalModal(true);  // 打开弹窗
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

      {/* ✅ 个人信息弹窗 - 放在这里，header 标签后面 */}
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

// --- Main App Component ---
export default function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>(MenuKey.DASHBOARD);
  const [managementTab, setManagementTab] = useState<'project' | 'person' | 'camera' | 'location' | 'permission'>('person');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // ✅ 启动时如果本地有 logged_in 或 auth，认为已登录（不再依赖 access_token）
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
    localStorage.removeItem('department_id');
    localStorage.removeItem('username');
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return <LoginView onLogin={() => setIsLoggedIn(true)} />;
  }

  const renderContent = () => {
    switch (activeMenu) {
      case MenuKey.DASHBOARD:
        return <Dashboard setActiveMenu={setActiveMenu} setManagementTab={setManagementTab} />;
      case MenuKey.VIDEO:
        return <VideoCenter />;
      case MenuKey.VIDEOPLAYBACK:      
      return <VideoPlayback />;  
      case MenuKey.FENCE:
        return <FenceManagement />;
      case MenuKey.PROJECT:
        return <ProjectManagement />;
      case MenuKey.TRACK:
        return <TrackPlayback />;
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
      default:
        return <Dashboard />;
    }
  };

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

          <Header onLogout={logout} />
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
  <button onClick={() => setActiveMenu(MenuKey.DASHBOARD)} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg ${activeMenu === MenuKey.DASHBOARD ? 'text-blue-400 bg-white/10' : 'text-white/60'}`}>
    <LayoutDashboard size={24} />
    <span className="text-xs">主页</span>
  </button>
  <button onClick={() => setActiveMenu(MenuKey.VIDEO)} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg ${activeMenu === MenuKey.VIDEO ? 'text-blue-400 bg-white/10' : 'text-white/60'}`}>
    <Video size={24} />
    <span className="text-xs">监控中心</span>
  </button>

  <button onClick={() => setActiveMenu(MenuKey.FENCE)} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg ${activeMenu === MenuKey.FENCE ? 'text-blue-400 bg-white/10' : 'text-white/60'}`}>
    <MapPin size={24} />
    <span className="text-xs">电子围栏</span>
  </button>
      <button onClick={() => setActiveMenu(MenuKey.GROUP_CALL)} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg ${activeMenu === MenuKey.GROUP_CALL ? 'text-blue-400 bg-white/10' : 'text-white/60'}`}>
    <Phone size={24} />
    <span className="text-xs">群组通话</span>
  </button>
      <button onClick={() => setActiveMenu(MenuKey.VIDEOPLAYBACK)} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg ${activeMenu === MenuKey.VIDEOPLAYBACK ? 'text-blue-400 bg-white/10' : 'text-white/60'}`}>
    <RotateCcw  size={24} />
    <span className="text-xs">信息回放</span>
  </button>

  <button onClick={() => setActiveMenu(MenuKey.ALARM)} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg ${activeMenu === MenuKey.ALARM ? 'text-blue-400 bg-white/10' : 'text-white/60'}`}>
  <Bell size={24} />
  <span className="text-xs">告警记录</span>
</button>

  <button onClick={() => setActiveMenu(MenuKey.MANAGEMENT)} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg ${activeMenu === MenuKey.MANAGEMENT ? 'text-blue-400 bg-white/10' : 'text-white/60'}`}>
              <MonitorCog size={24} />
              <span className="text-xs">信息管理</span>
            </button>

  <button onClick={() => setActiveMenu(MenuKey.SYSTEM_LOG)} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg ${activeMenu === MenuKey.SYSTEM_LOG ? 'text-blue-400 bg-white/10' : 'text-white/60'}`}>
    <FileText size={24} />
    <span className="text-xs">系统日志</span>
  </button>
  
  <button onClick={() => setActiveMenu(MenuKey.SETTINGS)} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg ${activeMenu === MenuKey.SETTINGS ? 'text-blue-400 bg-white/10' : 'text-white/60'}`}>
    <Settings size={24} />
    <span className="text-xs">系统设置</span>
  </button>
</div>


          
        </div>
      </div>
      <AIChatAssistant />
    </div>
  );
}
