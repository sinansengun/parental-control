import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDevices, registerDevice, Device } from '../api/api'

const s: Record<string, React.CSSProperties> = {
  page:    { minHeight: '100vh', padding: 32 },
  header:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  title:   { fontSize: 22, fontWeight: 700 },
  btn:     { padding: '8px 18px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  logoutBtn: { padding: '8px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  grid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 },
  card:    { background: '#fff', padding: 20, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,.08)', cursor: 'pointer' },
  dname:   { fontWeight: 700, marginBottom: 8 },
  token:   { fontSize: 11, color: '#888', wordBreak: 'break-all' },
  msg:     { color: '#888', marginTop: 40, textAlign: 'center' }
}

export default function Dashboard() {
  const nav = useNavigate()
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDevices()
      .then(r => setDevices(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const addDevice = async () => {
    const name = prompt('Device name (e.g. "Ali\'s Phone"):')
    if (!name) return
    const res = await registerDevice(name)
    setDevices(prev => [...prev, res.data])
    alert(`Device token (copy to Android agent):\n\n${res.data.deviceToken}`)
  }

  const logout = () => { localStorage.removeItem('token'); nav('/login') }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>🛡 Family Guard — Devices</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn} onClick={addDevice}>+ Add Device</button>
          <button style={s.logoutBtn} onClick={logout}>Logout</button>
        </div>
      </div>

      {loading && <p style={s.msg}>Loading...</p>}
      {!loading && devices.length === 0 && (
        <p style={s.msg}>No devices yet. Click "+ Add Device" to register a child's device.</p>
      )}

      <div style={s.grid}>
        {devices.map(d => (
          <div key={d.id} style={s.card} onClick={() => nav(`/device/${d.id}`)}>
            <div style={s.dname}>📱 {d.name}</div>
            <div style={s.token}>Token: {d.deviceToken}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
