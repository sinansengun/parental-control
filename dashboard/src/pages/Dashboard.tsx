import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDevices, registerDevice, updateDevice, Device } from '../api/api'

// ── Edit-device modal ─────────────────────────────────────────────────────
interface EditDeviceModalProps {
  device: Device
  onClose: () => void
  onSaved: (updated: Device) => void
}

function EditDeviceModal({ device, onClose, onSaved }: EditDeviceModalProps) {
  const [name, setName]         = useState(device.name)
  const [pin, setPin]           = useState('')
  const [clearPin, setClearPin] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Device name is required.'); return }
    if (pin && (!/^\d{4}$/.test(pin))) { setError('PIN must be exactly 4 digits.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await updateDevice(device.id, name.trim(), pin || undefined, clearPin)
      onSaved(res.data)
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-900 mb-5">⚙️ Edit Device</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Device name</label>
            <input
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              App-open PIN
              {device.hasPIN && <span className="ml-2 text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">Set</span>}
            </label>
            <input
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setClearPin(false) }}
              placeholder={device.hasPIN ? 'Enter new 4-digit PIN…' : '4 digits (optional)'}
              inputMode="numeric"
              maxLength={4}
              disabled={clearPin}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-40"
            />
            <p className="text-xs text-gray-400 mt-1">Child must enter this 4-digit PIN every time the app opens.</p>
          </div>

          {device.hasPIN && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={clearPin}
                onChange={e => { setClearPin(e.target.checked); if (e.target.checked) setPin('') }}
                className="rounded border-gray-300 text-red-500 focus:ring-red-400"
              />
              <span className="text-sm text-red-600">Remove PIN (no lock on app open)</span>
            </label>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Add-device modal ──────────────────────────────────────────────────────────────
interface AddDeviceModalProps {
  onClose: () => void
  onAdded: (device: Device) => void
}

function AddDeviceModal({ onClose, onAdded }: AddDeviceModalProps) {
  const [name, setName]       = useState('')
  const [token, setToken]     = useState('')
  const [pin, setPin]         = useState('')
  const [mode, setMode]       = useState<'new' | 'link'>('new')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Device name is required.'); return }
    if (mode === 'link' && !token.trim()) { setError('Paste the device token to link.'); return }
    if (mode === 'new' && pin && !/^\d{4}$/.test(pin)) { setError('PIN must be exactly 4 digits.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await registerDevice(name.trim(), mode === 'link' ? token.trim() : undefined)
      // Set PIN if provided (new device only)
      if (mode === 'new' && pin) {
        try { await updateDevice(res.data.id, undefined, pin) } catch {}
        onAdded({ ...res.data, hasPIN: true })
      } else {
        onAdded(res.data)
      }
      onClose()
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Something went wrong.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-900 mb-4">📱 Add Device</h2>

        {/* Mode tabs */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-5">
          <button
            type="button"
            onClick={() => { setMode('new') }}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'new' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            New Device
          </button>
          <button
            type="button"
            onClick={() => { setMode('link'); setPin('') }}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'link' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Link by Token
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Device name
            </label>
            <input
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={mode === 'link' ? "e.g. Ali's Phone (local label)" : "e.g. Ali's Phone"}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {mode === 'new' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  App-open PIN <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="4-digit PIN…"
                  inputMode="numeric"
                  maxLength={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <p className="text-xs text-gray-400 mt-1">Child must enter this PIN every time the app opens.</p>
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                A unique device token will be generated automatically. Copy it to the Android agent after creation.
              </p>
            </>
          )}

          {mode === 'link' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Device token
              </label>
              <input
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Paste token from another account…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <p className="text-xs text-gray-500 mt-1">
                The device will be shared with your account (family sharing).
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {loading ? 'Adding…' : mode === 'link' ? 'Link Device' : 'Create Device'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const nav = useNavigate()
  const [devices, setDevices]         = useState<Device[]>([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [copied, setCopied]           = useState<number | null>(null)
  const [showModal, setShowModal]     = useState(false)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)

  useEffect(() => { loadDevices() }, [])

  const loadDevices = () => {
    setRefreshing(true)
    getDevices()
      .then(r => setDevices(r.data))
      .catch(() => {})
      .finally(() => { setLoading(false); setRefreshing(false) })
  }

  const copyToken = (e: React.MouseEvent, deviceId: number, token: string) => {
    e.stopPropagation()
    navigator.clipboard.writeText(token).then(() => {
      setCopied(deviceId)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const handleDeviceAdded = (device: Device) => {
    setDevices(prev => {
      // If already present (owner re-linked own device), replace; otherwise append
      const exists = prev.find(d => d.id === device.id)
      return exists ? prev.map(d => d.id === device.id ? device : d) : [...prev, device]
    })
    if (!device.isShared) {
      alert(`Device token (copy to Android agent):\n\n${device.deviceToken}`)
    }
  }

  const handleDeviceSaved = (updated: Device) => {
    setDevices(prev => prev.map(d => d.id === updated.id ? updated : d))
  }

  const logout = () => { localStorage.removeItem('token'); nav('/login') }

  return (
    <div className="min-h-screen bg-gray-50">
      {showModal && (
        <AddDeviceModal
          onClose={() => setShowModal(false)}
          onAdded={handleDeviceAdded}
        />
      )}
      {editingDevice && (
        <EditDeviceModal
          device={editingDevice}
          onClose={() => setEditingDevice(null)}
          onSaved={handleDeviceSaved}
        />
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">🛡️ Family Guard</h1>
        <div className="flex gap-2">
          <button
            onClick={loadDevices}
            disabled={refreshing}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            + Add Device
          </button>
          <button
            onClick={logout}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="p-6">
        {loading && <p className="text-center text-gray-400 mt-20">Loading...</p>}
        {!loading && devices.length === 0 && (
          <p className="text-center text-gray-400 mt-20">
            No devices yet. Click "+ Add Device" to register or link a child's device.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {devices.map(d => (
            <div
              key={d.id}
              onClick={() => nav(`/device/${d.id}`)}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-gray-800">📱 {d.name}</p>
                <div className="flex items-center gap-1.5">
                  {d.hasPIN && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium" title="PIN protected">🔒</span>
                  )}
                  {d.isShared && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">Shared</span>
                  )}
                  {!d.isShared && (
                    <button
                      onClick={e => { e.stopPropagation(); setEditingDevice(d) }}
                      className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700 font-medium transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 truncate flex-1 font-mono">{d.deviceToken}</span>
                <button
                  onClick={(e) => copyToken(e, d.id, d.deviceToken)}
                  title={copied === d.id ? 'Copied!' : 'Copy token'}
                  className={`flex-shrink-0 px-2 py-0.5 text-xs rounded-full font-medium transition-colors ${
                    copied === d.id
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700'
                  }`}
                >
                  {copied === d.id ? '✓' : '⧉'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                <span className="font-semibold text-gray-600">Registered</span> {new Date(d.registeredAt).toLocaleDateString()}
              </p>
              {d.lastActivityAt
                ? <p className="text-xs text-gray-400 mt-1">
                    <span className="font-semibold text-gray-600">Last activity</span> {new Date(d.lastActivityAt).toLocaleString()}
                  </p>
                : <p className="text-xs text-gray-400 mt-1"><span className="font-semibold text-gray-600">Last activity</span> —</p>
              }
              {d.hasPIN && (
                <p className="text-xs text-gray-400 mt-1">
                  <span className="font-semibold text-gray-600">Last PIN used</span>{' '}
                  {d.lastPinUsedAt ? new Date(d.lastPinUsedAt).toLocaleString() : '—'}
                </p>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
