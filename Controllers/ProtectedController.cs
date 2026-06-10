using Microsoft.AspNetCore.Mvc;

namespace SudskiSistemApp.Controllers;

public abstract class ProtectedController : Controller
{
    protected string? CurrentUsername => HttpContext.Session.GetString("Username");
    protected string? CurrentFullName => HttpContext.Session.GetString("FullName");
    protected string? CurrentRole => HttpContext.Session.GetString("Role");

    protected bool IsAuthenticated => !string.IsNullOrWhiteSpace(CurrentUsername);

    protected IActionResult? RequireLogin()
    {
        if (!IsAuthenticated)
        {
            return RedirectToAction("Login", "Auth");
        }

        ViewBag.CurrentUsername = CurrentUsername;
        ViewBag.CurrentFullName = CurrentFullName;
        ViewBag.CurrentRole = CurrentRole;
        return null;
    }
}
