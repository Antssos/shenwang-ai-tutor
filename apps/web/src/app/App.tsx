import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AboutPage } from '../features/about/AboutPage'
import { AuthPage } from '../features/auth/AuthPage'
import { HomePage } from '../features/home/HomePage'
import { loadAccountSession, logoutUser } from '../lib/auth'

const ChatPage = lazy(() => import('../features/chat/ChatPage').then((module) => ({ default: module.ChatPage })))

function MarketingHeader({ username }: { username: string | null }) {
  return (
    <header className="marketing-header">
      <Link className="brand" to="/" aria-label="望学伴首页">
        <span className="brand-mark">望</span>
        <span className="brand-copy"><strong>望学伴</strong><small>安心提问，慢慢弄懂</small></span>
      </Link>
      <nav className="marketing-nav" aria-label="主要导航">
        <NavLink to="/" end>首页</NavLink>
        <a href="/#features">产品介绍</a>
        <NavLink to="/about">关于</NavLink>
      </nav>
      <div className="header-actions">
        {username ? (
          <Link className="button primary" to="/chat">进入对话</Link>
        ) : (
          <>
            <Link className="button text" to="/login">登录</Link>
            <Link className="button primary" to="/register">注册</Link>
          </>
        )}
      </div>
    </header>
  )
}

function App() {
  const [username, setUsername] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const location = useLocation()
  const chatRoute = location.pathname === '/chat'

  useEffect(() => {
    const controller = new AbortController()
    void loadAccountSession(controller.signal)
      .then((session) => setUsername(session.authenticated ? session.username : null))
      .catch(() => setUsername(null))
      .finally(() => setSessionReady(true))
    return () => controller.abort()
  }, [])

  async function logout() {
    await logoutUser().catch(() => undefined)
    setUsername(null)
  }

  if (!sessionReady) {
    return <main className="app-loading" aria-label="正在进入望学伴"><span className="brand-mark">望</span></main>
  }

  const routes = (
    <Routes>
      <Route path="/" element={<HomePage username={username} />} />
      <Route path="/login" element={<AuthPage mode="login" username={username} onAuthenticated={setUsername} />} />
      <Route path="/register" element={<AuthPage mode="register" username={username} onAuthenticated={setUsername} />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<Navigate to="/about#child-safety" replace />} />
      <Route
        path="/chat"
        element={username ? (
          <Suspense fallback={<main className="app-loading"><span className="brand-mark">望</span></main>}>
            <ChatPage username={username} onLogout={logout} />
          </Suspense>
        ) : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )

  if (chatRoute) return routes

  return (
    <div className="marketing-shell">
      <MarketingHeader username={username} />
      {routes}
      <footer className="marketing-footer">
        <Link className="brand compact" to="/"><span className="brand-mark">望</span><strong>望学伴</strong></Link>
        <span>申望儿童关爱服务中心 · AI 学习与陪伴助手</span>
        <div><Link to="/about">关于我们</Link><Link to="/about#data-notice">数据说明</Link></div>
      </footer>
    </div>
  )
}

export default App
