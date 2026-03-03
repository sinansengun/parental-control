using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using ParentalControl.Backend.Data;
using ParentalControl.Backend.Security;
using ParentalControl.Backend.Services;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// ── Database ──────────────────────────────────────────────────────────────────
// Railway provides DATABASE_URL; fall back to appsettings for local dev
var dbUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
string connStr;
if (!string.IsNullOrEmpty(dbUrl))
{
    // Convert postgresql://user:pass@host:port/db → Npgsql connection string
    var uri  = new Uri(dbUrl);
    var user = uri.UserInfo.Split(':');
    connStr  = $"Host={uri.Host};Port={uri.Port};Database={uri.AbsolutePath.TrimStart('/')};Username={user[0]};Password={user[1]};SSL Mode=Require;Trust Server Certificate=true";
}
else
{
    connStr = builder.Configuration.GetConnectionString("Default")!;
}
builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connStr));

// ── JWT Auth ──────────────────────────────────────────────────────────────────
var jwtKey = Environment.GetEnvironmentVariable("JWT_KEY")
          ?? builder.Configuration["Jwt:Key"]!;
builder.Services.AddSingleton<JwtService>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opts =>
    {
        opts.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = builder.Configuration["Jwt:Issuer"],
            ValidAudience            = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();

// ── Services ──────────────────────────────────────────────────────────────────
builder.Services.AddScoped<AuthService>();

// ── CORS ──────────────────────────────────────────────────────────────────────
var corsOrigins = Environment.GetEnvironmentVariable("CORS_ORIGINS");
builder.Services.AddCors(opts => opts.AddPolicy("DashboardPolicy", policy =>
{
    if (!string.IsNullOrEmpty(corsOrigins))
        policy.WithOrigins(corsOrigins.Split(','))
              .AllowAnyHeader().AllowAnyMethod();
    else
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader().AllowAnyMethod();
}));

// ── Controllers + Swagger ─────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Parental Control API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        In = ParameterLocation.Header,
        Description = "Enter JWT: Bearer {token}",
        Name = "Authorization",
        Type = SecuritySchemeType.ApiKey
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// ── Migrate on startup ────────────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("DashboardPolicy");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/healthz", () => Results.Ok(new { status = "ok" }));

app.Run();
