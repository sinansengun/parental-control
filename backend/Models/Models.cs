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
    public ICollection<Device> Devices { get; set; } = [];
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
    public ICollection<LocationLog>     Locations    { get; set; } = [];
    public ICollection<CallLogEntry>    CallLogs     { get; set; } = [];
    public ICollection<SmsEntry>        SmsLogs      { get; set; } = [];
    public ICollection<WhatsAppMessage> WhatsAppMsgs { get; set; } = [];
    public ICollection<WhatsAppChatMsg> WhatsAppChats { get; set; } = [];
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
