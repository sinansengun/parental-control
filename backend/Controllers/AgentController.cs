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

        db.CallLogs.AddRange(entries.Select(e => new CallLogEntry
        {
            DeviceId = device.Id,
            Number   = e.Number,
            Name     = e.Name,
            Type     = e.Type,
            Date     = e.Date,
            Duration = e.Duration
        }));
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── SMS ────────────────────────────────────────────────────────────────────
    [HttpPost("sms")]
    public async Task<IActionResult> PostSmsLogs([FromBody] List<SmsPayload> entries)
    {
        var device = await ResolveDeviceAsync();
        if (device is null) return Unauthorized();

        db.SmsLogs.AddRange(entries.Select(e => new SmsEntry
        {
            DeviceId = device.Id,
            Address  = e.Address,
            Body     = e.Body,
            Date     = e.Date,
            Type     = e.Type
        }));
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── WhatsApp ───────────────────────────────────────────────────────────────
    [HttpPost("whatsapp")]
    public async Task<IActionResult> PostWhatsApp([FromBody] WhatsAppPayload payload)
    {
        var device = await ResolveDeviceAsync();
        if (device is null) return Unauthorized();

        db.WhatsAppMsgs.Add(new WhatsAppMessage
        {
            DeviceId  = device.Id,
            Sender    = payload.Sender,
            Message   = payload.Message,
            Timestamp = payload.Timestamp
        });
        await db.SaveChangesAsync();
        return NoContent();
    }
}
