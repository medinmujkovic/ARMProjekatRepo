using SudskiSistemApp.Data;
using SudskiSistemApp.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();
builder.Services.AddDistributedMemoryCache();

// FIX #1 (A07 - Security Misconfiguration): Session cookie uvijek Secure, HttpOnly, SameSite=Strict
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    // FIX: SameAsRequest -> Always — cookie mora biti Secure bez obzira na okolinu
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.Cookie.Name = "__Host-SudskiSistem";
    options.Cookie.Path = "/";
});

// FIX #2 (A05 - Security Misconfiguration): Anti-forgery token konfiguracija
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
    // HSTS: min 1 godina, includeSubDomains
    //app.UseHsts();
}

// FIX #5 (A02/A05): Aplikacija ne smije servirati login niti druge stranice preko HTTP-a.
// Ako neko pokuša pristup preko nezaštićenog HTTP endpointa ili lokalnog MITM proxyja,
// zahtjev se odbija prije prikaza login forme.
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

// FIX #3 (A05 - Security Misconfiguration): Sigurnosni HTTP headeri
app.Use(async (context, next) =>
{
    // Sprječava clickjacking (A05)
    context.Response.Headers["X-Frame-Options"] = "DENY";
    // Sprječava MIME-type sniffing (A05)
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    // Kontrolira referrer informacije (A05)
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    // Sprječava XSS u starijim browserima (A03)
    context.Response.Headers["X-XSS-Protection"] = "1; mode=block";
    // Content Security Policy — blokira inline skripte i neodobrene izvore (A03)
    context.Response.Headers["Content-Security-Policy"] =
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self'; " +
        "img-src 'self' data:; " +
        "font-src 'self'; " +
        "frame-ancestors 'none'; " +
        "form-action 'self'; " +
        "base-uri 'self';";
    // Permissions Policy — onemogući nepotrebne browser API-je (A05)
    context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";

    await next();
});

//app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseSession();

// FIX #4 (A01 - Broken Access Control): Middleware koji blokira pristup Upload direktorijumu
app.Use(async (context, next) =>
{
    string path = context.Request.Path.Value ?? string.Empty;
    // UploadedEvidence direktorij ne smije biti direktno dostupan
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
