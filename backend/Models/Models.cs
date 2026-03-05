using System.ComponentModel.DataAnnotations;

namespace ParentalControl.Backend.Models;

public class User
{
    public int Id { get; set; }

    [Required, MaxLength(100)]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string PasswordHash { get; set; } = string.Empty;

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ICollection<Device>      Devices { get; set; } = [];
    public ICollection<DeviceShare> Shares  { get; set; } = [];
}

public class Device
{
    public int Id { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Secret token the Android agent uses (sent as X-Device-Token header)</summary>
    [Required]
    public string DeviceToken { get; set; } = Guid.NewGuid().ToString();

    public DateTime RegisteredAt { get; set; } = DateTime.UtcNow;

    public int UserId { get; set; }
    public User User { get; set; } = null!;

    // Navigation
    public ICollection<LocationLog>     Locations     { get; set; } = [];
    public ICollection<CallLogEntry>    CallLogs      { get; set; } = [];
    public ICollection<SmsEntry>        SmsLogs       { get; set; } = [];
    public ICollection<WhatsAppMessage> WhatsAppMsgs  { get; set; } = [];
    public ICollection<WhatsAppChatMsg> WhatsAppChats { get; set; } = [];
    public ICollection<InstalledApp>    InstalledApps { get; set; } = [];
    public ICollection<DeviceShare>     Shares        { get; set; } = [];
    public ICollection<MusicPlay>       MusicPlays    { get; set; } = [];
    public ICollection<BrowserVisit>    BrowserHistory { get; set; } = [];
}

/// <summary>
/// Allows a device to be shared with additional user accounts (family sharing).
/// The original owner is stored in Device.UserId; extra viewers go here.
/// </summary>
public class DeviceShare
{
    public int Id       { get; set; }
    public int DeviceId { get; set; }
    public Device Device { get; set; } = null!;

    public int UserId   { get; set; }
    public User User    { get; set; } = null!;

    public DateTime SharedAt { get; set; } = DateTime.UtcNow;
}

public class LocationLog
{
    public long   Id        { get; set; }
    public double Latitude  { get; set; }
    public double Longitude { get; set; }
    public float  Accuracy  { get; set; }
    public long   Timestamp { get; set; }  // UTC epoch ms

    public int    DeviceId  { get; set; }
    public Device Device    { get; set; } = null!;
}

public class CallLogEntry
{
    public long   Id       { get; set; }
    public string Number   { get; set; } = string.Empty;
    public string Name     { get; set; } = string.Empty;
    /// <summary>1=Incoming 2=Outgoing 3=Missed</summary>
    public int    Type     { get; set; }
    public long   Date     { get; set; }  // UTC epoch ms
    public long   Duration { get; set; }  // seconds

    public int    DeviceId { get; set; }
    public Device Device   { get; set; } = null!;
}

public class SmsEntry
{
    public long   Id      { get; set; }
    public string Address { get; set; } = string.Empty;
    public string Body    { get; set; } = string.Empty;
    public long   Date    { get; set; }  // UTC epoch ms
    /// <summary>1=Inbox 2=Sent</summary>
    public int    Type    { get; set; }

    public int    DeviceId { get; set; }
    public Device Device   { get; set; } = null!;
}

public class WhatsAppMessage
{
    public long   Id         { get; set; }
    public string AppPackage { get; set; } = string.Empty;
    public string AppName    { get; set; } = string.Empty;
    /// <summary>Base64-encoded 48x48 PNG icon, may be empty.</summary>
    public string AppIcon    { get; set; } = string.Empty;
    public string Sender     { get; set; } = string.Empty;
    public string Message    { get; set; } = string.Empty;
    public long   Timestamp  { get; set; }  // UTC epoch ms

    public int    DeviceId   { get; set; }
    public Device Device     { get; set; } = null!;
}

/// <summary>Actual chat messages read via Accessibility Service</summary>
public class WhatsAppChatMsg
{
    public long   Id        { get; set; }
    /// <summary>Contact name (1:1) or group name</summary>
    public string Chat      { get; set; } = string.Empty;
    /// <summary>Who sent this message within the chat</summary>
    public string Sender    { get; set; } = string.Empty;
    public string Message   { get; set; } = string.Empty;
    public long   Timestamp { get; set; }  // UTC epoch ms

    public int    DeviceId  { get; set; }
    public Device Device    { get; set; } = null!;
}

/// <summary>Snapshot of installed apps on the device (upserted on each sync)</summary>
public class InstalledApp
{
    public long   Id          { get; set; }
    /// <summary>e.g. com.instagram.android</summary>
    public string PackageName { get; set; } = string.Empty;
    public string AppName     { get; set; } = string.Empty;
    /// <summary>Version string from PackageInfo, e.g. "1.2.3"</summary>
    public string Version     { get; set; } = string.Empty;
    /// <summary>UTC epoch ms of first install reported by PackageInfo</summary>
    public long   InstalledAt { get; set; }
    /// <summary>Timestamp when this record was last synced</summary>
    public long    LastSeenAt  { get; set; }
    /// <summary>App icon as Base64-encoded PNG (48x48), may be null</summary>
    public string? IconBase64  { get; set; }

    public int     DeviceId    { get; set; }
    public Device Device      { get; set; } = null!;
}

/// <summary>A URL the child visited in a browser (captured via Accessibility Service)</summary>
public class BrowserVisit
{
    public long   Id        { get; set; }
    public string Url       { get; set; } = string.Empty;
    public string Title     { get; set; } = string.Empty;
    public string Browser   { get; set; } = string.Empty;
    /// <summary>Browser app icon as Base64-encoded PNG (48x48), may be null.</summary>
    public string? IconBase64 { get; set; }
    public long   Timestamp { get; set; }

    public int    DeviceId  { get; set; }
    public Device Device    { get; set; } = null!;
}

/// <summary>A track the child started playing (Spotify, YouTube Music, etc.)</summary>
public class MusicPlay
{
    public long    Id         { get; set; }
    public string  AppPackage { get; set; } = string.Empty;
    public string  TrackTitle { get; set; } = string.Empty;
    public string  ArtistName { get; set; } = string.Empty;
    public string? AlbumName  { get; set; }
    /// <summary>96x96 JPEG encoded as base64, may be null.</summary>
    public string? AlbumArt   { get; set; }
    /// <summary>Track duration in milliseconds, if available.</summary>
    public long?   DurationMs { get; set; }
    public long    Timestamp  { get; set; }  // UTC epoch ms — when playback started

    public int     DeviceId   { get; set; }
    public Device  Device     { get; set; } = null!;
}
