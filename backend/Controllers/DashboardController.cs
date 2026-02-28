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
        var devices = await db.Devices
            .Where(d => d.UserId == CurrentUserId)
            .Select(d => new DeviceResponse(d.Id, d.Name, d.DeviceToken, d.RegisteredAt))
            .ToListAsync();
        return Ok(devices);
    }

    [HttpPost("devices")]
    public async Task<IActionResult> RegisterDevice([FromBody] RegisterDeviceRequest req)
    {
        var device = new Device { Name = req.Name, UserId = CurrentUserId };
        db.Devices.Add(device);
        await db.SaveChangesAsync();
        return Ok(new DeviceResponse(device.Id, device.Name, device.DeviceToken, device.RegisteredAt));
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

    // ── WhatsApp ───────────────────────────────────────────────────────────────

    [HttpGet("devices/{deviceId:int}/whatsapp")]
    public async Task<IActionResult> GetWhatsApp(int deviceId, [FromQuery] int limit = 100)
    {
        if (!await OwnsDeviceAsync(deviceId)) return Forbid();

        var data = await db.WhatsAppMsgs
            .Where(w => w.DeviceId == deviceId)
            .OrderByDescending(w => w.Timestamp)
            .Take(limit)
            .Select(w => new WhatsAppDto(w.Sender, w.Message, w.Timestamp))
            .ToListAsync();

        return Ok(data);
    }

    // ── Helper ─────────────────────────────────────────────────────────────────
    private async Task<bool> OwnsDeviceAsync(int deviceId) =>
        await db.Devices.AnyAsync(d => d.Id == deviceId && d.UserId == CurrentUserId);
}
