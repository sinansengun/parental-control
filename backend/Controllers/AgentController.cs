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

    // ── Installed Apps ────────────────────────────────────────────────────
    [HttpPost("apps")]
    public async Task<IActionResult> PostInstalledApps([FromBody] List<InstalledAppPayload> entries)
    {
        var device = await ResolveDeviceAsync();
        if (device is null) return Unauthorized();

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Upsert: update existing, insert new
        var existingMap = await db.InstalledApps
            .Where(a => a.DeviceId == device.Id)
            .ToDictionaryAsync(a => a.PackageName);

        foreach (var e in entries)
        {
            if (existingMap.TryGetValue(e.PackageName, out var existing))
            {
                existing.AppName    = e.AppName;
                existing.Version    = e.Version;
                existing.LastSeenAt = now;
                if (e.IconBase64 is not null) existing.IconBase64 = e.IconBase64;
            }
            else
            {
                db.InstalledApps.Add(new InstalledApp
                {
                    DeviceId    = device.Id,
                    PackageName = e.PackageName,
                    AppName     = e.AppName,
                    Version     = e.Version,
                    InstalledAt = e.InstalledAt,
                    LastSeenAt  = now,
                    IconBase64  = e.IconBase64
                });
            }
        }

        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── Music ──────────────────────────────────────────────────────────────────
    [HttpPost("music")]
    public async Task<IActionResult> PostMusicPlay([FromBody] MusicPlayPayload payload)
    {
        var device = await ResolveDeviceAsync();
        if (device is null) return Unauthorized();

        // Deduplicate: skip if same track was already recorded within the last 10 s
        var cutoff = payload.Timestamp - 10_000;
        var exists = await db.MusicPlays.AnyAsync(m =>
            m.DeviceId   == device.Id &&
            m.TrackTitle == payload.TrackTitle &&
            m.ArtistName == payload.ArtistName &&
            m.Timestamp  >= cutoff);

        if (!exists)
        {
            db.MusicPlays.Add(new MusicPlay
            {
                DeviceId   = device.Id,
                AppPackage = payload.AppPackage,
                TrackTitle = payload.TrackTitle,
                ArtistName = payload.ArtistName,
                AlbumName  = payload.AlbumName,
                AlbumArt   = payload.AlbumArtBase64,
                DurationMs = payload.DurationMs,
                Timestamp  = payload.Timestamp
            });
            await db.SaveChangesAsync();
        }

        return NoContent();
    }

    // ── Browser History ─────────────────────────────────────────────────────────────────────────
    [HttpPost("browser")]
    public async Task<IActionResult> PostBrowserVisit([FromBody] BrowserHistoryPayload payload)
    {
        var device = await ResolveDeviceAsync();
        if (device is null) return Unauthorized();

        // Deduplicate: same URL within 30 seconds
        var cutoff = payload.Timestamp - 30_000;
        var existing = await db.BrowserHistory.FirstOrDefaultAsync(b =>
            b.DeviceId  == device.Id &&
            b.Url       == payload.Url &&
            b.Timestamp >= cutoff);

        if (existing is not null)
        {
            // Update icon if we now have one and the existing record doesn't
            if (existing.IconBase64 is null && payload.IconBase64 is not null)
            {
                existing.IconBase64 = payload.IconBase64;
                await db.SaveChangesAsync();
            }
        }
        else
        {
            db.BrowserHistory.Add(new BrowserVisit
            {
                DeviceId   = device.Id,
                Url        = payload.Url,
                Title      = payload.Title ?? string.Empty,
                Browser    = payload.Browser,
                IconBase64 = payload.IconBase64,
                Timestamp  = payload.Timestamp
            });
            await db.SaveChangesAsync();
        }

        return NoContent();
    }

    // ── PIN ────────────────────────────────────────────────────────────────────

    /// <summary>Returns whether this device has a PIN set. Used on app launch.</summary>
    [HttpGet("device-status")]
    public async Task<IActionResult> GetDeviceStatus()
    {
        var device = await ResolveDeviceAsync();
        if (device is null) return Unauthorized();
        return Ok(new DeviceStatusDto(device.PinHash != null));
    }

    /// <summary>Verifies the PIN entered by the user on app open.</summary>
    [HttpPost("verify-pin")]
    public async Task<IActionResult> VerifyPin([FromBody] VerifyPinRequest req)
    {
        var device = await ResolveDeviceAsync();
        if (device is null) return Unauthorized();

        // No PIN set → always passes
        if (device.PinHash is null) return Ok(new { verified = true });

        var ok = BCrypt.Net.BCrypt.Verify(req.Pin, device.PinHash);
        return ok ? Ok(new { verified = true }) : Unauthorized(new { message = "Incorrect PIN." });
    }
}
