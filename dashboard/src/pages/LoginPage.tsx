import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../api/api'

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card: { background: '#fff', padding: 40, borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,.10)', width: 360 },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#1a1a2e' },
  sub:   { color: '#666', marginBottom: 24, fontSize: 14 },
  label: { display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: 14 },
  btn:   { width: '100%', padding: 12, background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  toggle:{ textAlign: 'center', marginTop: 16, color: '#4f46e5', cursor: 'pointer', fontSize: 13 },
  error: { color: '#dc2626', marginBottom: 12, fontSize: 13 }
}

export default function LoginPage() {
  const nav = useNavigate()
  const [mode,     setMode]     = useState<'login' | 'register'>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = mode === 'login'
        ? await login(email, password)
        : await register(email, password, name)
      localStorage.setItem('token', res.data.token)
      nav('/')
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.title}>🛡 Family Guard</div>
        <div style={styles.sub}>{mode === 'login' ? 'Sign in to your account' : 'Create a new account'}</div>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label style={styles.label}>Name</label>
              <input style={styles.input} value={name} onChange={e => setName(e.target.value)} required />
            </>
          )}
          <label style={styles.label}>Email</label>
          <input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <label style={styles.label}>Password</label>
          <input style={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        <div style={styles.toggle} onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Login'}
        </div>
      </div>
    </div>
  )
}
