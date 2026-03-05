using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ParentalControl.Backend.Data;
using ParentalControl.Backend.DTOs;
using ParentalControl.Backend.Models;
using ParentalControl.Backend.Security;

namespace ParentalControl.Backend.Controllers;

/// <summary>Dashboard endpoints — require JWT (parent's token).</summary>
[ApiController]
[Route("api/v1/dashboard")]
[Authorize]
public class DashboardController(AppDbContext db) : ControllerBase
{
    private int CurrentUserId => JwtService.GetUserId(User);

    // ── Devices ────────────────────────────────────────────────────────────────

    [HttpGet("devices")]
    public async Task<IActionResult> GetDevices()
    {
        // Devices owned by this user
        var ownedQuery = db.Devices
            .Where(d => d.UserId == CurrentUserId)
            .Select(d => new { d.Id, d.Name, d.DeviceToken, d.RegisteredAt,
                LastLoc    = d.Locations    .Max(l => (long?)l.Timestamp),
                LastCall   = d.CallLogs     .Max(c => (long?)c.Date),
                LastSms    = d.SmsLogs      .Max(s => (long?)s.Date),
                LastWa     = d.WhatsAppMsgs .Max(w => (long?)w.Timestamp),
                LastWaChat = d.WhatsAppChats.Max(w => (long?)w.Timestamp),
                IsShared   = false,
                HasPIN     = d.PinHash != null });

        // Devices shared with this user
        var sharedQuery = db.DeviceShares
            .Where(s => s.UserId == CurrentUserId)
            .Select(s => new { s.Device.Id, s.Device.Name, s.Device.DeviceToken, s.Device.RegisteredAt,
                LastLoc    = s.Device.Locations    .Max(l => (long?)l.Timestamp),
                LastCall   = s.Device.CallLogs     .Max(c => (long?)c.Date),
                LastSms    = s.Device.SmsLogs      .Max(s2 => (long?)s2.Date),
                LastWa     = s.Device.WhatsAppMsgs .Max(w => (long?)w.Timestamp),
                LastWaChat = s.Device.WhatsAppChats.Max(w => (long?)w.Timestamp),
                IsShared   = true,
                HasPIN     = s.Device.PinHash != null });

        var raw = await ownedQuery.Union(sharedQuery).ToListAsync();

        var devices = raw.Select(d =>
        {
            var candidates = new[] { d.LastLoc, d.LastCall, d.LastSms, d.LastWa, d.LastWaChat }
                .Where(x => x.HasValue).Select(x => x!.Value).ToList();
            long? lastActivity = candidates.Count > 0 ? candidates.Max() : null;
            return new DeviceResponse(d.Id, d.Name, d.DeviceToken, d.RegisteredAt, lastActivity, d.IsShared, d.HasPIN);
        }).ToList();

        return Ok(devices);
    }

    /// <summary>
    /// Register a new device or link an existing device by token (family sharing).
    /// - If <c>req.Token</c> is provided: find device by that token and share it with the current user.
    /// - If <c>req.Token</c> is omitted: create a brand-new device with an auto-generated token.
    /// </summary>
    [HttpPost("devices")]
    public async Task<IActionResult> RegisterDevice([FromBody] RegisterDeviceRequest req)
    {
        if (!string.IsNullOrWhiteSpace(req.Token))
        {
            // ── Link existing device by token ──────────────────────────────────
            var existing = await db.Devices.FirstOrDefaultAsync(d => d.DeviceToken == req.Token);
            if (existing is null)
                return NotFound(new { message = "No device found with that token." });

            // Owner just gets the device back without a duplicate share
            if (existing.UserId == CurrentUserId)
                return Ok(new DeviceResponse(existing.Id, existing.Name, existing.DeviceToken, existing.RegisteredAt, null, false, existing.PinHash != null));

            // Check not already shared
            var alreadyShared = await db.DeviceShares
                .AnyAsync(s => s.DeviceId == existing.Id && s.UserId == CurrentUserId);
            if (!alreadyShared)
            {
                db.DeviceShares.Add(new DeviceShare { DeviceId = existing.Id, UserId = CurrentUserId });
                await db.SaveChangesAsync();
            }

            return Ok(new DeviceResponse(existing.Id, existing.Name, existing.DeviceToken, existing.RegisteredAt, null, true, existing.PinHash != null));
        }
        else
        {
            // ── Create new device with auto-generated token ────────────────────
            var device = new Device { Name = req.Name, UserId = CurrentUserId };
            db.Devices.Add(device);
            await db.SaveChangesAsync();
            return Ok(new DeviceResponse(device.Id, device.Name, device.DeviceToken, device.RegisteredAt, null, false, false));
        }
    }

    /// <summary>Update device name and/or PIN. Only the owner can do this.</summary>
    [HttpPatch("devices/{id:int}")]
    public async Task<IActionResult> UpdateDevice(int id, [FromBody] UpdateDeviceRequest req)
    {
        var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == id && d.UserId == CurrentUserId);
        if (device is null) return NotFound(new { message = "Device not found or access denied." });

        if (!string.IsNullOrWhiteSpace(req.Name))
            device.Name = req.Name.Trim();

        if (req.ClearPin)
        {
            device.PinHash = null;
        }
        else if (!string.IsNullOrWhiteSpace(req.Pin))
        {
            if (req.Pin.Length < 4 || req.Pin.Length > 8 || !req.Pin.All(char.IsDigit))
                return BadRequest(new { message = "PIN must be 4-8 digits." });
            device.PinHash = BCrypt.Net.BCrypt.HashPassword(req.Pin);
        }

        await db.SaveChangesAsync();
        return Ok(new DeviceResponse(device.Id, device.Name, device.DeviceToken, device.RegisteredAt, null, false, device.PinHash != null));
    }

    // ── Location ───────────────────────────────────────────────────────────────

    [HttpGet("devices/{deviceId:int}/locations")]
    public async Task<IActionResult> GetLocations(int deviceId, [FromQuery] int limit = 100)
    {
        if (!await CanAccessDeviceAsync(deviceId)) return Forbid();

        var data = await db.Locations
            .Where(l => l.DeviceId == deviceId)
            .OrderByDescending(l => l.Timestamp)
            .Take(limit)
            .Select(l => new LocationDto(l.Latitude, l.Longitude, l.Accuracy, l.Timestamp))
            .ToListAsync();

        return Ok(data);
    }

    [HttpGet("devices/{deviceId:int}/location/latest")]
    public async Task<IActionResult> GetLatestLocation(int deviceId)
    {
        if (!await CanAccessDeviceAsync(deviceId)) return Forbid();

        var loc = await db.Locations
            .Where(l => l.DeviceId == deviceId)
            .OrderByDescending(l => l.Timestamp)
            .Select(l => new LocationDto(l.Latitude, l.Longitude, l.Accuracy, l.Timestamp))
            .FirstOrDefaultAsync();

        return loc is null ? NotFound() : Ok(loc);
    }

    // ── Call Logs ──────────────────────────────────────────────────────────────

    [HttpGet("devices/{deviceId:int}/calls")]
    public async Task<IActionResult> GetCallLogs(int deviceId, [FromQuery] int limit = 100)
    {
        if (!await CanAccessDeviceAsync(deviceId)) return Forbid();

        var data = await db.CallLogs
            .Where(c => c.DeviceId == deviceId)
            .OrderByDescending(c => c.Date)
            .Take(limit)
            .Select(c => new CallLogDto(c.Number, c.Name, c.Type, c.Date, c.Duration))
            .ToListAsync();

        return Ok(data);
    }

    // ── SMS ────────────────────────────────────────────────────────────────────

    [HttpGet("devices/{deviceId:int}/sms")]
    public async Task<IActionResult> GetSmsLogs(int deviceId, [FromQuery] int limit = 100)
    {
        if (!await CanAccessDeviceAsync(deviceId)) return Forbid();

        var data = await db.SmsLogs
            .Where(s => s.DeviceId == deviceId)
            .OrderByDescending(s => s.Date)
            .Take(limit)
            .Select(s => new SmsDto(s.Address, s.Body, s.Date, s.Type))
            .ToListAsync();

        return Ok(data);
    }

    // ── WhatsApp notifications ─────────────────────────────────────────────────

    [HttpGet("devices/{deviceId:int}/whatsapp")]
    public async Task<IActionResult> GetWhatsApp(int deviceId, [FromQuery] int limit = 100)
    {
        if (!await CanAccessDeviceAsync(deviceId)) return Forbid();

        var data = await db.WhatsAppMsgs
            .Where(w => w.DeviceId == deviceId)
            .OrderByDescending(w => w.Timestamp)
            .Take(limit)
            .Select(w => new WhatsAppDto(w.AppPackage, w.AppName, w.AppIcon == "" ? null : w.AppIcon, w.Sender, w.Message, w.Timestamp))
            .ToListAsync();

        return Ok(data);
    }

    // ── WhatsApp chats (accessibility) ─────────────────────────────────────────

    [HttpGet("devices/{deviceId:int}/whatsapp/chats")]
    public async Task<IActionResult> GetWhatsAppChats(int deviceId, [FromQuery] int limit = 200)
    {
        if (!await CanAccessDeviceAsync(deviceId)) return Forbid();

        var data = await db.WhatsAppChats
            .Where(w => w.DeviceId == deviceId)
            .OrderByDescending(w => w.Timestamp)
            .Take(limit)
            .Select(w => new WhatsAppChatDto(w.Chat, w.Sender, w.Message, w.Timestamp))
            .ToListAsync();

        return Ok(data);
    }

    // ── Helper ─────────────────────────────────────────────────────────────────
    /// <summary>Returns true if the current user owns or has a share for this device.</summary>
    private async Task<bool> CanAccessDeviceAsync(int deviceId) =>
        await db.Devices.AnyAsync(d => d.Id == deviceId && d.UserId == CurrentUserId)
        || await db.DeviceShares.AnyAsync(s => s.DeviceId == deviceId && s.UserId == CurrentUserId);

    // ── Installed Apps ─────────────────────────────────────────────────────────

    [HttpGet("devices/{deviceId:int}/apps")]
    public async Task<IActionResult> GetInstalledApps(int deviceId)
    {
        if (!await CanAccessDeviceAsync(deviceId)) return Forbid();

        var data = await db.InstalledApps
            .Where(a => a.DeviceId == deviceId)
            .OrderBy(a => a.AppName)
            .Select(a => new InstalledAppDto(a.PackageName, a.AppName, a.Version, a.InstalledAt, a.LastSeenAt, a.IconBase64))
            .ToListAsync();

        return Ok(data);
    }

    // ── Browser History ──────────────────────────────────────────────────────

    [HttpGet("devices/{deviceId:int}/browser")]
    public async Task<IActionResult> GetBrowserHistory(int deviceId, [FromQuery] int limit = 200)
    {
        if (!await CanAccessDeviceAsync(deviceId)) return Forbid();

        var data = await db.BrowserHistory
            .Where(b => b.DeviceId == deviceId)
            .OrderByDescending(b => b.Timestamp)
            .Take(limit)
            .Select(b => new BrowserHistoryDto(b.Url, b.Title, b.Browser, b.IconBase64, b.Timestamp))
            .ToListAsync();

        return Ok(data);
    }

    // ── Music ──────────────────────────────────────────────────────────────────

    [HttpGet("devices/{deviceId:int}/music")]
    public async Task<IActionResult> GetMusicHistory(int deviceId, [FromQuery] int limit = 200)
    {
        if (!await CanAccessDeviceAsync(deviceId)) return Forbid();

        var data = await db.MusicPlays
            .Where(m => m.DeviceId == deviceId)
            .OrderByDescending(m => m.Timestamp)
            .Take(limit)
            .Select(m => new MusicPlayDto(m.AppPackage, m.TrackTitle, m.ArtistName, m.AlbumName, m.DurationMs, m.AlbumArt, m.Timestamp))
            .ToListAsync();

        return Ok(data);
    }
}
