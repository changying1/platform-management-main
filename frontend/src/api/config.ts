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
  const isLocalViteDevServer =
    import.meta.env.DEV &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
    window.location.port !== '' &&
    window.location.port !== '9000';
  const isViteDevPort = import.meta.env.DEV && /^30\d\d$/.test(window.location.port);
  const isDevServer = isLocalViteDevServer || isViteDevPort;
  if (isDevServer) {
    return '';
  }
  
  // 3. 其他情况（内网穿透/生产环境/静态文件），用当前访问域名的同端口
  // ✅ 这就是内网穿透远程访问的核心！
  return `${window.location.protocol}//${window.location.host}`;
};

export const API_BASE_URL = detectBackendBaseUrl();

export const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token') || '';
  const username = localStorage.getItem('username') || '';
  const role = localStorage.getItem('role') || '';
  const departmentId = localStorage.getItem('department_id') || '';
  const permissionLevel = localStorage.getItem('permission_level') || '';

  return {
    ...(token ? { 'X-Auth-Token': token, Authorization: `Bearer ${token}` } : {}),
    ...(username ? { 'X-Username': username } : {}),
    ...(role ? { 'X-Role': role } : {}),
    ...(departmentId ? { 'X-Department-Id': departmentId } : {}),
    ...(permissionLevel ? { 'X-Permission-Level': permissionLevel } : {}),
  };
};

export const attachAuthInterceptor = (client: any) => {
  client.interceptors.request.use((config: any) => ({
    ...config,
    headers: {
      ...(config.headers || {}),
      ...getAuthHeaders(),
    },
    withCredentials: true,
  }));
  return client;
};

export const getApiUrl = (path: string) => {
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
};

export const withAuthTokenParam = (url: string) => {
  const token = localStorage.getItem('auth_token') || '';
  if (!token || url.startsWith('data:') || url.startsWith('blob:')) return url;

  try {
    const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(url);
    const currentOrigin = window.location.origin;
    const parsed = new URL(url, currentOrigin);
    const apiBase = API_BASE_URL ? new URL(API_BASE_URL, currentOrigin) : new URL(currentOrigin);
    const isAllowedHost =
      !isAbsolute ||
      parsed.host === window.location.host ||
      parsed.host === apiBase.host ||
      (parsed.hostname === window.location.hostname && parsed.port === '9000');

    if (!isAllowedHost) return url;

    parsed.searchParams.set('token', token);
    return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }
};
