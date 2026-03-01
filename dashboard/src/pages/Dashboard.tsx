import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDevices, registerDevice, Device } from '../api/api'

export default function Dashboard() {
  const nav = useNavigate()
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<number | null>(null)

  useEffect(() => {
    getDevices()
      .then(r => setDevices(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const copyToken = (e: React.MouseEvent, deviceId: number, token: string) => {
    e.stopPropagation()
    navigator.clipboard.writeText(token).then(() => {
      setCopied(deviceId)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const addDevice = async () => {
    const name = prompt('Device name (e.g. "Ali\'s Phone"):')
    if (!name) return
    const res = await registerDevice(name)
    setDevices(prev => [...prev, res.data])
    alert(`Device token (copy to Android agent):\n\n${res.data.deviceToken}`)
  }

  const logout = () => { localStorage.removeItem('token'); nav('/login') }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">&#x1F6E1; Family Guard</h1>
        <div className="flex gap-2">
          <button
            onClick={addDevice}
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
            No devices yet. Click "+ Add Device" to register a child's device.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {devices.map(d => (
            <div
              key={d.id}
              onClick={() => nav(`/device/${d.id}`)}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all"
            >
              <p className="font-semibold text-gray-800 mb-3">&#x1F4F1; {d.name}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 truncate flex-1 font-mono">{d.deviceToken}</span>
                <button
                  onClick={(e) => copyToken(e, d.id, d.deviceToken)}
                  className={`flex-shrink-0 px-2 py-1 text-xs rounded-md font-medium transition-colors ${
                    copied === d.id
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {copied === d.id ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Registered {new Date(d.registeredAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
