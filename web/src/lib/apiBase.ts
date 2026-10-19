export function apiBase() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()
  const value = configured || (import.meta.env.PROD ? '' : 'http://127.0.0.1:3000')
  if (!value) throw new Error('服务地址尚未配置，请联系项目维护人员。')
  return value.replace(/\/$/, '')
}
