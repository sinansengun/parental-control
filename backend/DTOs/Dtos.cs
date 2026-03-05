using System.ComponentModel.DataAnnotations;

namespace ParentalControl.Backend.DTOs;

// ── Auth ──────────────────────────────────────────────────────────────────────
public record RegisterRequest(
    [Required, EmailAddress] string Email,
    [Required, MinLength(6)] string Password,
    [Required]               string Name
);

public record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required]               string Password
);

public record AuthResponse(string Token, string Name, string Email);

// ── Device ────────────────────────────────────────────────────────────────────

/// <summary>
/// Used when registering a new device.
/// If <see cref="Token"/> is provided the backend will look up the existing
/// device and share it with the current user instead of creating a new one.
/// If <see cref="Token"/> is omitted a new device is created with an
/// auto-generated token.
/// </summary>
public record RegisterDeviceRequest(
    [Required] string   Name,
    string?             Token = null
);

public record DeviceResponse(int Id, string Name, string DeviceToken, DateTime RegisteredAt, long? LastActivityAt, bool IsShared = false, bool HasPIN = false, long? LastPinUsedAt = null);

/// <summary>Update device name and/or PIN from the dashboard.</summary>
public record UpdateDeviceRequest(
    string? Name,
    /// <summary>Set a new PIN (exactly 4 digits). Send null to leave unchanged.</summary>
    string? Pin,
    /// <summary>Set true to remove the existing PIN.</summary>
    bool ClearPin = false
);

// ── Agent payloads (from Android) ─────────────────────────────────────────────
public record LocationPayload(double Latitude, double Longitude, float Accuracy, long Timestamp);

public record CallLogPayload(string Number, string Name, int Type, long Date, long Duration);

public record SmsPayload(string Address, string Body, long Date, int Type);

public record WhatsAppPayload(
    string  AppPackage,
    string  AppName,
    string? AppIcon,
    string  Sender,
    string  Message,
    long    Timestamp
);

public record WhatsAppChatPayload(string Chat, string Sender, string Message, long Timestamp);

// ── Dashboard responses ───────────────────────────────────────────────────────
public record LocationDto(double Latitude, double Longitude, float Accuracy, long Timestamp);

public record CallLogDto(string Number, string Name, int Type, long Date, long Duration);

public record SmsDto(string Address, string Body, long Date, int Type);

public record WhatsAppDto(string AppPackage, string AppName, string? AppIcon, string Sender, string Message, long Timestamp);

public record WhatsAppChatDto(string Chat, string Sender, string Message, long Timestamp);

// ── Installed Apps ────────────────────────────────────────────────────────────
public record InstalledAppPayload(string PackageName, string AppName, string Version, long InstalledAt, string? IconBase64);

public record InstalledAppDto(string PackageName, string AppName, string Version, long InstalledAt, long LastSeenAt, string? IconBase64);

// ── Music ─────────────────────────────────────────────────────────────────────
public record MusicPlayPayload(
    [Required] string  AppPackage,
    [Required] string  TrackTitle,
    [Required] string  ArtistName,
               string? AlbumName,
               long?   DurationMs,
               string? AlbumArtBase64,
               long    Timestamp
);

public record MusicPlayDto(string AppPackage, string TrackTitle, string ArtistName, string? AlbumName, long? DurationMs, string? AlbumArt, long Timestamp);

// ── Browser History ───────────────────────────────────────────────────────────
public record BrowserHistoryPayload(
    [Required] string Url,
               string? Title,
    [Required] string Browser,
               string? IconBase64,
               long    Timestamp
);

public record BrowserHistoryDto(string Url, string Title, string Browser, string? IconBase64, long Timestamp);

// ── PIN (agent) ───────────────────────────────────────────────────────────────
/// <summary>Returned by GET /agent/device-status — tells the app whether a PIN is required.</summary>
public record DeviceStatusDto(bool HasPIN);

/// <summary>Body for POST /agent/verify-pin.</summary>
public record VerifyPinRequest([Required] string Pin);
