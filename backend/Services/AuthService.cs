using Microsoft.EntityFrameworkCore;
using ParentalControl.Backend.Data;
using ParentalControl.Backend.DTOs;
using ParentalControl.Backend.Models;
using ParentalControl.Backend.Security;

namespace ParentalControl.Backend.Services;

public class AuthService(AppDbContext db, JwtService jwt)
{
    public async Task<AuthResponse> RegisterAsync(RegisterRequest req)
    {
        if (await db.Users.AnyAsync(u => u.Email == req.Email))
            throw new InvalidOperationException("Email already in use.");

        var user = new User
        {
            Email        = req.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Name         = req.Name
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        return new AuthResponse(jwt.Generate(user), user.Name, user.Email);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest req)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == req.Email)
                   ?? throw new UnauthorizedAccessException("Invalid credentials.");

        if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid credentials.");

        return new AuthResponse(jwt.Generate(user), user.Name, user.Email);
    }
}
