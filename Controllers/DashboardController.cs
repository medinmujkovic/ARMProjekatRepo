using Microsoft.AspNetCore.Mvc;
using SudskiSistemApp.Models;
using SudskiSistemApp.Services;

namespace SudskiSistemApp.Controllers;

public class DashboardController : ProtectedController
{
    private readonly CourtCaseService _caseService;
    private readonly EvidenceService _evidenceService;
    private readonly AuthService _authService;

    public DashboardController(CourtCaseService caseService, EvidenceService evidenceService, AuthService authService)
    {
        _caseService = caseService;
        _evidenceService = evidenceService;
        _authService = authService;
    }

    public IActionResult Index()
    {
        IActionResult? loginRedirect = RequireLogin();
        if (loginRedirect is not null)
        {
            return loginRedirect;
        }

        var model = new DashboardViewModel
        {
            TotalCases = _caseService.CountCases(),
            TotalEvidence = _evidenceService.CountEvidence(),
            TotalUsers = _authService.CountUsers(),
            RecentCases = _caseService.GetRecent(5)
        };

        return View(model);
    }
}
