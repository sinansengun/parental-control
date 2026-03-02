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
        var raw = await db.Devices
            .Where(d => d.UserId == CurrentUserId)
            .Select(d => new
            {
                d.Id, d.Name, d.DeviceToken, d.RegisteredAt,
                LastLoc    = d.Locations    .Max(l => (long?)l.Timestamp),
                LastCall   = d.CallLogs     .Max(c => (long?)c.Date),
                LastSms    = d.SmsLogs      .Max(s => (long?)s.Date),
                LastWa     = d.WhatsAppMsgs .Max(w => (long?)w.Timestamp),
                LastWaChat = d.WhatsAppChats.Max(w => (long?)w.Timestamp),
            })
            .ToListAsync();

        var devices = raw.Select(d =>
        {
            var candidates = new[] { d.LastLoc, d.LastCall, d.LastSms, d.LastWa, d.LastWaChat }
                .Where(x => x.HasValue).Select(x => x!.Value).ToList();
            long? lastActivity = candidates.Count > 0 ? candidates.Max() : null;
            return new DeviceResponse(d.Id, d.Name, d.DeviceToken, d.RegisteredAt, lastActivity);
        }).ToList();

        return Ok(devices);
    }

    [HttpPost("devices")]
    public async Task<IActionResult> RegisterDevice([FromBody] RegisterDeviceRequest req)
    {
        var device = new Device { Name = req.Name, UserId = CurrentUserId };
        db.Devices.Add(device);
        await db.SaveChangesAsync();
        return Ok(new DeviceResponse(device.Id, device.Name, device.DeviceToken, device.RegisteredAt, null));
    }

    // ── Location ───────────────────────────────────────────────────────────────

    [HttpGet("devices/{deviceId:int}/locations")]
    public async Task<IActionResult> GetLocations(int deviceId, [FromQuery] int limit = 100)
    {
        if (!await OwnsDeviceAsync(deviceId)) return Forbid();

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
        if (!await OwnsDeviceAsync(deviceId)) return Forbid();

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
        if (!await OwnsDeviceAsync(deviceId)) return Forbid();

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
        if (!await OwnsDeviceAsync(deviceId)) return Forbid();

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
        if (!await OwnsDeviceAsync(deviceId)) return Forbid();

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
        if (!await OwnsDeviceAsync(deviceId)) return Forbid();

        var data = await db.WhatsAppChats
            .Where(w => w.DeviceId == deviceId)
            .OrderByDescending(w => w.Timestamp)
            .Take(limit)
            .Select(w => new WhatsAppChatDto(w.Chat, w.Sender, w.Message, w.Timestamp))
            .ToListAsync();

        return Ok(data);
    }

    // ── Helper ─────────────────────────────────────────────────────────────────
    private async Task<bool> OwnsDeviceAsync(int deviceId) =>
        await db.Devices.AnyAsync(d => d.Id == deviceId && d.UserId == CurrentUserId);

    // ── Installed Apps ─────────────────────────────────────────────────────────

    [HttpGet("devices/{deviceId:int}/apps")]
    public async Task<IActionResult> GetInstalledApps(int deviceId)
    {
        if (!await OwnsDeviceAsync(deviceId)) return Forbid();

        var data = await db.InstalledApps
            .Where(a => a.DeviceId == deviceId)
            .OrderBy(a => a.AppName)
            .Select(a => new InstalledAppDto(a.PackageName, a.AppName, a.Version, a.InstalledAt, a.LastSeenAt, a.IconBase64))
            .ToListAsync();

        return Ok(data);
    }
}