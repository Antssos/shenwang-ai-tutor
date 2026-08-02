import { useState } from 'react'
import { Link } from 'react-router-dom'

const CONSENT_KEY = 'wangxueban-cookie-consent'

export function CookieNotice() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(CONSENT_KEY))
  if (!visible) return null

  function choose(value: 'necessary' | 'accepted') {
    localStorage.setItem(CONSENT_KEY, value)
    setVisible(false)
  }

  return (
    <aside className="cookie-notice" aria-label="Cookie 使用说明">
      <span className="cookie-icon" aria-hidden="true">曲</span>
      <div>
        <strong>关于 Cookie 与本地存储</strong>
        <p>我们只使用必要信息维持登录状态，并按账号保存你的对话记录，不投放广告。</p>
        <Link to="/about#data-notice">查看完整说明</Link>
      </div>
      <div className="cookie-actions">
        <button type="button" className="button ghost" onClick={() => choose('necessary')}>仅使用必要项</button>
        <button type="button" className="button primary" onClick={() => choose('accepted')}>接受并继续</button>
      </div>
    </aside>
  )
}
