using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ParentalControl.Backend.Data;
using ParentalControl.Backend.DTOs;
using ParentalControl.Backend.Models;

namespace ParentalControl.Backend.Controllers;

/// <summary>
/// Endpoints called by the Android agent using X-Device-Token header.
/// No JWT required — agent authenticates with its unique device token.
/// </summary>
[ApiController]
[Route("api/v1/agent")]
public class AgentController(AppDbContext db) : ControllerBase
{
    private async Task<Device?> ResolveDeviceAsync()
    {
        var token = Request.Headers["X-Device-Token"].FirstOrDefault();
        if (string.IsNullOrEmpty(token)) return null;
        return await db.Devices.FirstOrDefaultAsync(d => d.DeviceToken == token);
    }

    // ── Location ───────────────────────────────────────────────────────────────
    [HttpPost("location")]
    public async Task<IActionResult> PostLocation([FromBody] LocationPayload payload)
    {
        var device = await ResolveDeviceAsync();
        if (device is null) return Unauthorized();

        db.Locations.Add(new LocationLog
        {
            DeviceId  = device.Id,
            Latitude  = payload.Latitude,
            Longitude = payload.Longitude,
            Accuracy  = payload.Accuracy,
            Timestamp = payload.Timestamp
        });
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── Call Logs ──────────────────────────────────────────────────────────────
    [HttpPost("calls")]
    public async Task<IActionResult> PostCallLogs([FromBody] List<CallLogPayload> entries)
    {
        var device = await ResolveDeviceAsync();
        if (device is null) return Unauthorized();

        // Deduplicate: skip entries whose (Number, Date) already exist for this device
        var incomingDates = entries.Select(e => e.Date).Distinct().ToList();
        var existingDates = await db.CallLogs
            .Where(c => c.DeviceId == device.Id && incomingDates.Contains(c.Date))
            .Select(c => c.Date)
            .ToHashSetAsync();

        var newEntries = entries
            .Where(e => !existingDates.Contains(e.Date))
            .Select(e => new CallLogEntry
            {
                DeviceId = device.Id,
                Number   = e.Number,
                Name     = e.Name,
                Type     = e.Type,
                Date     = e.Date,
                Duration = e.Duration
            }).ToList();

        if (newEntries.Count > 0)
        {
            db.CallLogs.AddRange(newEntries);
            await db.SaveChangesAsync();
        }
        return NoContent();
    }

    // ── SMS ────────────────────────────────────────────────────────────────────
    [HttpPost("sms")]
    public async Task<IActionResult> PostSmsLogs([FromBody] List<SmsPayload> entries)
    {
        var device = await ResolveDeviceAsync();
        if (device is null) return Unauthorized();

        // Deduplicate: skip entries whose (Address, Date) already exist for this device
        var incomingDates = entries.Select(e => e.Date).Distinct().ToList();
        var existingDates = await db.SmsLogs
            .Where(s => s.DeviceId == device.Id && incomingDates.Contains(s.Date))
            .Select(s => s.Date)
            .ToHashSetAsync();

        var newEntries = entries
            .Where(e => !existingDates.Contains(e.Date))
            .Select(e => new SmsEntry
            {
                DeviceId = device.Id,
                Address  = e.Address,
                Body     = e.Body,
                Date     = e.Date,
                Type     = e.Type
            }).ToList();

        if (newEntries.Count > 0)
        {
            db.SmsLogs.AddRange(newEntries);
            await db.SaveChangesAsync();
        }
        return NoContent();
    }

    // ── WhatsApp ───────────────────────────────────────────────────────────────
    [HttpPost("whatsapp")]
    public async Task<IActionResult> PostWhatsApp([FromBody] WhatsAppPayload payload)
    {
        var device = await ResolveDeviceAsync();
        if (device is null) return Unauthorized();

        // Deduplicate: skip if same sender+timestamp already exists
        var exists = await db.WhatsAppMsgs.AnyAsync(w =>
            w.DeviceId  == device.Id &&
            w.Sender    == payload.Sender &&
            w.Timestamp == payload.Timestamp);

        if (!exists)
        {
            db.WhatsAppMsgs.Add(new WhatsAppMessage
            {
                DeviceId   = device.Id,
                AppPackage = payload.AppPackage,
                AppName    = payload.AppName,
                AppIcon    = payload.AppIcon ?? string.Empty,
                Sender     = payload.Sender,
                Message    = payload.Message,
                Timestamp  = payload.Timestamp
            });
            await db.SaveChangesAsync();
        }
        return NoContent();
    }

    // ── WhatsApp Chat (Accessibility) ────────────────────────────────────
    [HttpPost("whatsapp/chat")]
    public async Task<IActionResult> PostWhatsAppChat([FromBody] WhatsAppChatPayload payload)
    {
        var device = await ResolveDeviceAsync();
        if (device is null) return Unauthorized();

        // Deduplicate: same chat+sender+message within 60 seconds
        var window = payload.Timestamp - 60_000;
        var exists = await db.WhatsAppChats.AnyAsync(w =>
            w.DeviceId == device.Id &&
            w.Chat     == payload.Chat &&
            w.Sender   == payload.Sender &&
            w.Message  == payload.Message &&
            w.Timestamp >= window);

        if (!exists)
        {
            db.WhatsAppChats.Add(new WhatsAppChatMsg
            {
                DeviceId  = device.Id,
                Chat      = payload.Chat,
                Sender    = payload.Sender,
                Message   = payload.Message,
                Timestamp = payload.Timestamp
            });
            await db.SaveChangesAsync();
        }
        return NoContent();
    }
}
