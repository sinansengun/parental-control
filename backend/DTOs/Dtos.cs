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
public record RegisterDeviceRequest(
    [Required] string Name
);

public record DeviceResponse(int Id, string Name, string DeviceToken, DateTime RegisteredAt, long? LastActivityAt);

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
