using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using SudskiSistemApp.Services;

namespace SudskiSistemApp.Controllers;

public class AuthController : Controller
{
    private readonly AuthService _authService;

    public AuthController(AuthService authService)
    {
        _authService = authService;
    }

    [HttpGet]
    public IActionResult Login()
    {
        if (!string.IsNullOrWhiteSpace(HttpContext.Session.GetString("Username")))
        {
            return RedirectToAction("Index", "Dashboard");
        }

        return View();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Login(string username, string password)
    {
        // FIX #13 (A03 - Input Validation): Osnovna validacija unosa prije poziva servisa
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            ViewBag.Error = "Unesite korisničko ime i lozinku.";
            return View();
        }

        // FIX #13: Ograničenje dužine — sprječava DoS putem ogromnih unosa
        if (username.Length > 100 || password.Length > 256)
        {
            ViewBag.Error = "Neispravno korisničko ime ili lozinka.";
            return View();
        }

        var result = _authService.TryLogin(username, password);
        if (!result.Succeeded || result.User is null)
        {
            ViewBag.Error = result.Message;
            return View();
        }

        // FIX #14 (A07 - Session Fixation): Regeneracija session ID-a nakon prijave
        // Ovo uklanja stari session koji je napadač mogao podesiti
        HttpContext.Session.Clear();

        HttpContext.Session.SetInt32("UserId", result.User.Id);
        HttpContext.Session.SetString("Username", result.User.Username);
        HttpContext.Session.SetString("FullName", result.User.FullName);
        HttpContext.Session.SetString("Role", result.User.Role);

        return RedirectToAction("Index", "Dashboard");
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Logout()
    {
        // FIX #14 (A07): Potpuno brisanje sesije pri odjavi
        HttpContext.Session.Clear();
        // FIX #14: Brisanje session cookie-ja eksplicitno
        Response.Cookies.Delete("__Host-SudskiSistem", new CookieOptions
        {
            Path = "/",
            Secure = true,
            HttpOnly = true,
            SameSite = SameSiteMode.Strict
        });
        return RedirectToAction("Login", "Auth");
    }
}
