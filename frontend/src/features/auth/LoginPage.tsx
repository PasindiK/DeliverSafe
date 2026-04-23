import { useState } from 'react'
import type { FormEvent } from 'react'
import { login, setStoredToken } from '../../services/authService'

interface LoginPageProps {
  onLoginSuccess: (user: { username: string; role: string }) => void
}

function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!username.trim() || !password) {
      setError('Username and password are required')
      return
    }

    try {
      setIsSubmitting(true)
      setError('')

      const result = await login(username.trim(), password)
      setStoredToken(result.token)
      onLoginSuccess(result.user)
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Login failed')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="dashboard-shell" style={{ maxWidth: 480, margin: '48px auto' }}>
      <section className="panel" style={{ padding: 24 }}>
        <p className="eyebrow">Authentication</p>
        <h1 style={{ marginTop: 8 }}>Sign in</h1>
        <p className="dashboard-subtitle" style={{ marginBottom: 16 }}>
          Use your dashboard credentials to access protected APIs.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <label className="filter-item" style={{ display: 'grid', gap: 6 }}>
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="filter-item" style={{ display: 'grid', gap: 6 }}>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error && (
            <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{error}</div>
          )}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default LoginPage
