import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { loginUser, registerUser } from '../../lib/auth'

interface AuthPageProps {
  mode: 'login' | 'register'
  username: string | null
  onAuthenticated: (username: string) => void
}

export function AuthPage({ mode, username, onAuthenticated }: AuthPageProps) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (username) return <Navigate to="/chat" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const authenticated = mode === 'register'
        ? await registerUser(name, password, inviteCode)
        : await loginUser(name, password)
      onAuthenticated(authenticated)
      navigate('/chat', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '暂时无法完成，请稍后再试。')
    } finally {
      setSubmitting(false)
    }
  }

  const registering = mode === 'register'
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Link className="brand compact" to="/">
          <span className="brand-mark">望</span>
          <strong>望学伴</strong>
        </Link>
        <p className="hero-kicker">{registering ? '创建你的账号' : '欢迎回来'}</p>
        <h1>{registering ? '把好奇心，装进自己的学习空间。' : '继续上次没有聊完的话题。'}</h1>
        <p className="auth-sync-note">多端同步 · 云端记录</p>
        <div className="auth-decoration" aria-hidden="true"><span>学</span><span>问</span><span>想</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="hero-kicker">{registering ? '注册' : '登录'}</p>
          <h2>{registering ? '第一次来到望学伴' : '进入你的学习空间'}</h2>
          <form onSubmit={handleSubmit}>
            <label htmlFor="username">用户名</label>
            <input id="username" value={name} onChange={(event) => setName(event.target.value)} autoComplete="username" placeholder="2–20 个字符" required />
            <label htmlFor="password">密码</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={registering ? 'new-password' : 'current-password'} placeholder="至少 8 个字符" minLength={8} required />
            {registering && (
              <>
                <label htmlFor="invite-code">邀请码</label>
                <input id="invite-code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="请输入项目邀请码" required />
              </>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button primary submit" type="submit" disabled={submitting}>
              {submitting ? '请稍候…' : registering ? '注册并进入对话' : '登录'}
            </button>
          </form>
          <p className="auth-switch">
            {registering ? '已经有账号？' : '还没有账号？'}
            <Link to={registering ? '/login' : '/register'}>{registering ? '直接登录' : '使用邀请码注册'}</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
