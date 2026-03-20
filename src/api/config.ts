// API 基地址：优先从 Vite env 读取；没有配置时使用相对路径（更适合 WebView/静态部署）。
// 例如：VITE_API_BASE=http://127.0.0.1:19082 或 https://your-host
export const API_BASE = import.meta.env.VITE_API_BASE || "";

export function api(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE) return cleanPath; // 形如 /api/v1/... 的相对请求
  return `${API_BASE}${cleanPath}`;
}
