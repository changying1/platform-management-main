/**
 * API Configuration - 内网穿透终极解决方案！
 * 
 * 智能判断，自动适配所有访问方式：
 * ✅ 本地 localhost:3000 开发模式 → 走 Vite 代理到 9000
 * ✅ 内网穿透域名（如 www.rfbmbxhq1.nyat.app:43862）→ 自动用当前域名同端口
 * ✅ 直接打开静态 html 文件 → 自动用当前域名的 9000 端口
 */

const detectBackendBaseUrl = (): string => {
  // 1. 环境变量优先级最高
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // 2. 如果是通过 Vite dev server 访问的端口不是 9000，用相对路径走代理
  const isDevServer = window.location.port === '3000';
  if (isDevServer) {
    return '';
  }
  
  // 3. 其他情况（内网穿透/生产环境/静态文件），用当前访问域名的同端口
  // ✅ 这就是内网穿透远程访问的核心！
  return `${window.location.protocol}//${window.location.host}`;
};

export const API_BASE_URL = detectBackendBaseUrl();

export const getApiUrl = (path: string) => {
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
};
