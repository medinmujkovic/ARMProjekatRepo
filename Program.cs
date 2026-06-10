using SudskiSistemApp.Data;
using SudskiSistemApp.Services;

var builder = WebApplication.CreateBuilder(args);

// --- HTTPS KONFIGURACIJA ---
// Čita iz appsettings.json ili Environment varijabli (Kestrel:Certificates:Default:Path)
builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(8080, listenOptions =>
    {
        var certPath = builder.Configuration["Kestrel:Certificates:Default:Path"];
        var certPass = builder.Configuration["Kestrel:Certificates:Default:Password"];
        
        if (!string.IsNullOrEmpty(certPath) && File.Exists(certPath))
        {
            listenOptions.UseHttps(certPath, certPass);
            Console.WriteLine($"[INFO] HTTPS omogućen sa sertifikatom: {certPath}");
        }
    });
});

builder.Services.AddControllersWithViews();
builder.Services.AddDistributedMemoryCache();

// FIX #1: Session cookie
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.Cookie.Name = "__Host-SudskiSistem";
    options.Cookie.Path = "/";
});

// FIX #2: Anti-forgery token
builder.Services.AddAntiforgery(options =>
{
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.Name = "__Host-af";
    options.Cookie.Path = "/";
    options.HeaderName = "X-CSRF-TOKEN";
    options.SuppressXFrameOptionsHeader = false;
});

builder.Services.AddSingleton<Database>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<CourtCaseService>();
builder.Services.AddScoped<EvidenceService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var database = scope.ServiceProvider.GetRequiredService<Database>();
    database.Initialize();
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

// FIX #5: HTTPS obavezan
app.Use(async (context, next) =>
{
    if (!context.Request.IsHttps)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsync("HTTPS je obavezan za pristup aplikaciji.");
        return;
    }
    await next();
});

// FIX #3: Sigurnosni headeri
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["X-XSS-Protection"] = "1; mode=block";
    context.Response.Headers["Content-Security-Policy"] = 
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self';";
    context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";

    await next();
});

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseSession();

// FIX #4: Blokiranje pristupa Upload direktorijumu
app.Use(async (context, next) =>
{
    string path = context.Request.Path.Value ?? string.Empty;
    if (path.StartsWith("/UploadedEvidence", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.StatusCode = 403;
        return;
    }
    await next();
});

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Auth}/{action=Login}/{id?}");

app.Run();