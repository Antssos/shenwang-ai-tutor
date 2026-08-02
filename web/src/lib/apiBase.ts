// 固定 API 子域名完成前保留 Quick Tunnel 作为生产兜底；该地址只公开 BFF，不包含 Dify Key。
const productionApiBase = 'https://news-those-infant-richmond.trycloudflare.com'

export function apiBase() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()
  const value = configured || (import.meta.env.PROD ? productionApiBase : 'http://127.0.0.1:3000')
  if (!value) throw new Error('服务地址尚未配置，请联系项目维护人员。')
  return value.replace(/\/$/, '')
}
