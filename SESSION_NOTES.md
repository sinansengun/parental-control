# Session Notes — 1 Mart 2026

## Tamamlananlar ✅

### android-agent/ (Kotlin)
- `AndroidManifest.xml` — izinler, servisler, receiver
- `MainActivity.kt` — açılışta token kontrolü; token yoksa → SetupActivity, varsa ana ekran
- `SetupActivity.kt` — token giriş ekranı (ilk açılış)
- `TokenStore.kt` — DataStore ile kalıcı token saklama (cachedToken in-memory cache)
- `service/LocationTrackingService.kt` — GPS foreground service (her 60s)
- `service/WhatsAppAccessibilityService.kt` — WhatsApp bildirim okuma
- `service/SyncWorker.kt` — arama + SMS logu 15 dakikada bir sync + açılışta anlık sync
- `service/BootReceiver.kt` — cihaz açılınca token yükle + servisleri yeniden başlat
- `network/ApiClient.kt` — Retrofit + OkHttp (TokenStore.cachedToken ile X-Device-Token header)
- `network/ApiService.kt` — tüm endpoint tanımları + Response<Unit> dönüş tipi (204 uyumlu)
- `app/build.gradle.kts`, `settings.gradle.kts`
- `gradle.properties` — android.useAndroidX=true, android.enableJetifier=true
- `res/xml/accessibility_service_config.xml`
- `res/xml/network_security_config.xml` — 10.0.2.2 için cleartext HTTP izni
- `res/layout/activity_main.xml` — ana izleme ekranı
- `res/layout/activity_setup.xml` — token giriş ekranı
- `res/values/strings.xml`
- AGP 8.9.0 + Gradle 8.11.1 + Kotlin 2.1.0 + compileSdk 35

### altyapı
- `docker-compose.yml` — PostgreSQL 16 container (port 5432, db: parentalcontrol, user: postgres, pw: changeme)
- EF Core migration (`Initial`) oluşturuldu ve uygulandı
- Backend .NET 10 hedefine yükseltildi (net10.0, EF Core 9.0.2, Npgsql 9.0.3)
- dotnet-ef 10.0.3 global tool kurulu

### backend/ (ASP.NET Core, C#)
- `backend.csproj` — EF Core 8, Npgsql, JWT Bearer, BCrypt, Swagger
- `Program.cs` — DI, JWT auth, CORS, Swagger, EF migrate on startup
- `appsettings.json` — PostgreSQL bağlantısı, JWT config
- `Models/Models.cs` — User, Device, LocationLog, CallLogEntry, SmsEntry, WhatsAppMessage
- `Data/AppDbContext.cs` — EF Core DbContext
- `DTOs/Dtos.cs` — request/response record'ları
- `Security/JwtService.cs` — token üretme, UserId çıkarma
- `Services/AuthService.cs` — register + login (BCrypt)
- `Controllers/AuthController.cs` — POST /auth/register, /auth/login
- `Controllers/AgentController.cs` — X-Device-Token auth (Android → API)
- `Controllers/DashboardController.cs` — JWT auth, tüm ebeveyn endpointleri
- `Properties/launchSettings.json`

### dashboard/ (React 18 + TypeScript + Vite)
- `package.json`, `tsconfig.json`, `vite.config.ts`
- `src/main.tsx`, `src/App.tsx` — router kurulumu
- `src/api/api.ts` — Axios client + tüm API fonksiyonları
- `src/pages/LoginPage.tsx` — kayıt / giriş formu
- `src/pages/Dashboard.tsx` — cihaz listesi, cihaz ekleme
- `src/pages/DevicePage.tsx` — harita (Leaflet), arama, SMS, WhatsApp tabları

## Yapılacaklar 📋

### Kısa vadeli
- [x] Android: UI layout XML dosyaları (`activity_main.xml`, `activity_setup.xml`)
- [x] Android: `TokenStore` → DataStore entegrasyonu (kalıcı token saklama)
- [x] Android: Cihaz kayıt akışı (ilk açılışta token girişi ekranı — SetupActivity)
- [x] Backend: EF Core migration oluşturma (`dotnet ef migrations add Initial`)
- [ ] Backend: Duplicate veri kontrolü (aynı arama/SMS iki kez gönderilmesin)
- [ ] Dashboard: Tailwind CSS ekle (şu an inline style)
- [ ] Dashboard: Real-time güncelleme (polling veya WebSocket/SignalR)
- [ ] Dashboard: Geo-fence (bölge uyarısı) sayfası

### Orta vadeli
- [ ] Push bildirim (çocuk belirli bölge dışına çıkınca ebeveyne Firebase FCM)
- [ ] Uygulama kullanım süresi (UsageStatsManager)
- [ ] Ekran süresi limiti (Device Policy Manager veya Accessibility ile)
- [ ] Multi-child desteği (birden fazla cihaz yönetimi — mevcut mimaride zaten var)

## Çalıştırma Notları
- Backend: `cd backend && dotnet run` → http://localhost:8080 (Swagger: /swagger)
- Dashboard: `cd dashboard && npm run dev` → http://localhost:5173
- DB: `docker compose up -d` → PostgreSQL localhost:5432 (db: parentalcontrol, user: postgres, pw: changeme)
- Android: Android Studio ile `android-agent/` klasörünü aç, emülatör API 34+
- Emülatör BASE_URL: `http://10.0.2.2:8080/api/v1/` (build.gradle.kts'de tanımlı)
- Cihaz token üretmek için: Swagger → POST /auth/login → JWT al → POST /dashboard/devices → deviceToken kopyala
- `appsettings.json` içinde JWT key ve DB parolası production'da değiştirilmeli
