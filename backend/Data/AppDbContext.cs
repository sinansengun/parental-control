using Microsoft.EntityFrameworkCore;
using ParentalControl.Backend.Models;

namespace ParentalControl.Backend.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User>            Users         => Set<User>();
    public DbSet<Device>          Devices       => Set<Device>();
    public DbSet<LocationLog>     Locations     => Set<LocationLog>();
    public DbSet<CallLogEntry>    CallLogs      => Set<CallLogEntry>();
    public DbSet<SmsEntry>        SmsLogs       => Set<SmsEntry>();
    public DbSet<WhatsAppMessage> WhatsAppMsgs  => Set<WhatsAppMessage>();
    public DbSet<WhatsAppChatMsg> WhatsAppChats => Set<WhatsAppChatMsg>();
    public DbSet<InstalledApp>    InstalledApps => Set<InstalledApp>();
    public DbSet<DeviceShare>     DeviceShares  => Set<DeviceShare>();
    public DbSet<MusicPlay>       MusicPlays    => Set<MusicPlay>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<User>().HasIndex(u => u.Email).IsUnique();
        mb.Entity<Device>().HasIndex(d => d.DeviceToken).IsUnique();
        mb.Entity<InstalledApp>().HasIndex(a => new { a.DeviceId, a.PackageName }).IsUnique();

        mb.Entity<Device>()
            .HasOne(d => d.User)
            .WithMany(u => u.Devices)
            .HasForeignKey(d => d.UserId);

        mb.Entity<DeviceShare>()
            .HasIndex(s => new { s.DeviceId, s.UserId }).IsUnique();

        mb.Entity<DeviceShare>()
            .HasOne(s => s.Device)
            .WithMany(d => d.Shares)
            .HasForeignKey(s => s.DeviceId)
            .OnDelete(DeleteBehavior.Cascade);

        mb.Entity<DeviceShare>()
            .HasOne(s => s.User)
            .WithMany(u => u.Shares)
            .HasForeignKey(s => s.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        foreach (var nav in new[] {
            mb.Entity<LocationLog>(),
            mb.Entity<CallLogEntry>() as dynamic,
            mb.Entity<SmsEntry>(),
            mb.Entity<WhatsAppMessage>()
        })
        {
            // cascade delete when device is removed
        }
    }
}
