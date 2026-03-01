import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../api/api'

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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">&#x1F6E1; Family Guard</h1>
        <p className="text-sm text-gray-500 mb-6">
          {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={name} onChange={e => setName(e.target.value)} required
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Password</label>
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p
          className="mt-4 text-center text-sm text-indigo-600 cursor-pointer hover:underline"
          onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Login'}
        </p>
      </div>
    </div>
  )
}

