# 🛡 Family Guard — Parental Control App

A full-stack parental control application with transparent monitoring (child is aware the app is installed).

## Architecture

```
parental-control/
├── android-agent/   ← Kotlin Android app (child's device)
├── backend/         ← ASP.NET Core 8 REST API (.NET)
└── dashboard/       ← React 18 + TypeScript web panel (parent)
```

## Features

| Feature | How |
|---|---|
| GPS location (real-time + history) | Android foreground service → API |
| Call log | WorkManager periodic sync → API |
| SMS log | WorkManager periodic sync → API |
| WhatsApp messages | Accessibility Service → API |
| Interactive map with route | Leaflet + OpenStreetMap |
| JWT authentication | BCrypt passwords, HS256 tokens |

---

## 🚀 Getting Started

### Prerequisites

| Tool | Minimum version |
|---|---|
| .NET SDK | 8.0 |
| Node.js | 16+ |
| PostgreSQL | 14+ |
| Android Studio | Hedgehog |

---

### 1. Database

```sql
CREATE DATABASE parentalcontrol;
```

Update `backend/appsettings.json`:
```json
"ConnectionStrings": {
  "Default": "Host=localhost;Port=5432;Database=parentalcontrol;Username=postgres;Password=YOUR_PASSWORD"
}
```

> ⚠️ Also change `Jwt:Key` to a strong 32+ char secret before deploying.

---

### 2. Backend

```bash
cd backend
dotnet run
```

API runs on `http://localhost:8080`  
Swagger UI: `http://localhost:8080/swagger`

EF Core migrations are applied automatically on first startup.

---

### 3. Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Opens on `http://localhost:5173`

---

### 4. Android Agent

1. Open `android-agent/` in Android Studio.
2. Edit `app/build.gradle.kts` → set `BASE_URL` to your backend IP (e.g. `http://192.168.1.x:8080/api/v1/`).
3. Build & install on the child's device.
4. Register a device from the parent dashboard → copy the **Device Token**.
5. Paste the token into `TokenStore.deviceToken` in `ApiClient.kt` (or enter it in the app UI — extend `MainActivity` as needed).
6. Grant all permissions and enable Accessibility in phone settings.

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | — | Register parent account |
| POST | `/api/v1/auth/login` | — | Login, get JWT |
| GET  | `/api/v1/dashboard/devices` | JWT | List devices |
| POST | `/api/v1/dashboard/devices` | JWT | Register device |
| GET  | `/api/v1/dashboard/devices/{id}/location/latest` | JWT | Latest GPS |
| GET  | `/api/v1/dashboard/devices/{id}/locations` | JWT | Location history |
| GET  | `/api/v1/dashboard/devices/{id}/calls` | JWT | Call logs |
| GET  | `/api/v1/dashboard/devices/{id}/sms` | JWT | SMS logs |
| GET  | `/api/v1/dashboard/devices/{id}/whatsapp` | JWT | WhatsApp messages |
| POST | `/api/v1/agent/location` | X-Device-Token | Agent: send location |
| POST | `/api/v1/agent/calls` | X-Device-Token | Agent: send call log |
| POST | `/api/v1/agent/sms` | X-Device-Token | Agent: send SMS log |
| POST | `/api/v1/agent/whatsapp` | X-Device-Token | Agent: send WhatsApp msg |

---

## Legal Notice

This application is designed for **transparent parental monitoring** where the child is aware the app is installed. Using this software to monitor someone without their knowledge may be illegal. Always ensure compliance with local laws.
