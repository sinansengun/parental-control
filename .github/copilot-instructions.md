# Parental Control App - Copilot Instructions

## Project Overview
Monorepo parental control application with 3 components:
- **android-agent**: Kotlin Android app running on child's device
- **backend**: Spring Boot (Kotlin) REST API with JWT auth
- **dashboard**: React + TypeScript web panel for parents

## Tech Stack
- Android: Kotlin, Retrofit, WorkManager, Accessibility Service
- Backend: Spring Boot 3, Kotlin, Spring Security (JWT), Spring Data JPA, PostgreSQL
- Dashboard: React 18, TypeScript, Vite, Axios, Leaflet (maps), TailwindCSS

## Key Conventions
- Backend package: `com.parentalcontrol.backend`
- Android package: `com.parentalcontrol.agent`
- All API endpoints prefixed with `/api/v1`
- JWT token passed as `Authorization: Bearer <token>` header
- All timestamps stored as UTC epoch milliseconds

## WhatsApp Monitoring
Uses Android Accessibility Service (`WhatsAppAccessibilityService`) to read
notification content. This is transparent to the child (Android shows
"ParentalControl is using Accessibility") — compliant with Google Play policies
for parental control apps.
