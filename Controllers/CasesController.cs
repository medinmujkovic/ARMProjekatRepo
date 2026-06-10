using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using SudskiSistemApp.Models;
using SudskiSistemApp.Services;

namespace SudskiSistemApp.Controllers;

public class CasesController : ProtectedController
{
    private readonly CourtCaseService _caseService;
    private readonly EvidenceService _evidenceService;

    // FIX #11 (A01 - Broken Access Control): Maksimalna dužina input polja
    private const int MaxCaseNumberLength = 50;
    private const int MaxTitleLength = 200;
    private const int MaxDescriptionLength = 2000;
    private const int MaxCourtNameLength = 200;

    public CasesController(CourtCaseService caseService, EvidenceService evidenceService)
    {
        _caseService = caseService;
        _evidenceService = evidenceService;
    }

    public IActionResult Index()
    {
        IActionResult? loginRedirect = RequireLogin();
        if (loginRedirect is not null)
        {
            return loginRedirect;
        }

        ViewBag.CanCreateCase = AppRole.CanCreateCase(CurrentRole);
        return View(_caseService.GetAll());
    }

    [HttpGet]
    public IActionResult Create()
    {
        IActionResult? loginRedirect = RequireLogin();
        if (loginRedirect is not null)
        {
            return loginRedirect;
        }

        if (!AppRole.CanCreateCase(CurrentRole))
        {
            return Forbid();
        }

        return View();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Create(string caseNumber, string title, string description, string courtName)
    {
        IActionResult? loginRedirect = RequireLogin();
        if (loginRedirect is not null)
        {
            return loginRedirect;
        }

        if (!AppRole.CanCreateCase(CurrentRole))
        {
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(caseNumber) || string.IsNullOrWhiteSpace(title) ||
            string.IsNullOrWhiteSpace(description) || string.IsNullOrWhiteSpace(courtName))
        {
            ViewBag.Error = "Sva polja su obavezna.";
            return View();
        }

        // FIX #11 (A03 - Input Validation): Provjera maksimalne dužine unosa
        if (caseNumber.Length > MaxCaseNumberLength || title.Length > MaxTitleLength ||
            description.Length > MaxDescriptionLength || courtName.Length > MaxCourtNameLength)
        {
            ViewBag.Error = "Jedan ili više unosa prelaze dozvoljenu dužinu.";
            return View();
        }

        try
        {
            _caseService.Create(caseNumber, title, description, courtName,
                CurrentFullName ?? CurrentUsername ?? "Nepoznat korisnik");
            TempData["Success"] = "Sudski predmet je uspješno kreiran.";
            return RedirectToAction(nameof(Index));
        }
        catch (SqliteException)
        {
            ViewBag.Error = "Broj predmeta već postoji u sistemu.";
            return View();
        }
    }

    public IActionResult Details(int id)
    {
        IActionResult? loginRedirect = RequireLogin();
        if (loginRedirect is not null)
        {
            return loginRedirect;
        }

        // FIX #12 (A01 - IDOR): Provjera da je id pozitivan cijeli broj
        if (id <= 0)
        {
            return BadRequest();
        }

        CourtCase? courtCase = _caseService.GetById(id);
        if (courtCase is null)
        {
            return NotFound();
        }

        ViewBag.CanUploadEvidence = AppRole.CanUploadEvidence(CurrentRole);
        var model = new CaseDetailsViewModel
        {
            Case = courtCase,
            EvidenceFiles = _evidenceService.GetByCaseId(id)
        };

        if (TempData["VerificationMessage"] is string message)
        {
            model.VerificationMessage = message;
            model.VerificationSucceeded = string.Equals(Convert.ToString(TempData["VerificationSucceeded"]), "true", StringComparison.OrdinalIgnoreCase);
        }

        return View(model);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UploadEvidence(int caseId, IFormFile evidenceFile)
    {
        IActionResult? loginRedirect = RequireLogin();
        if (loginRedirect is not null)
        {
            return loginRedirect;
        }

        if (!AppRole.CanUploadEvidence(CurrentRole))
        {
            return Forbid();
        }

        // FIX #12 (A01 - IDOR): Provjera da predmet postoji prije uploada
        if (caseId <= 0)
        {
            return BadRequest();
        }

        CourtCase? courtCase = _caseService.GetById(caseId);
        if (courtCase is null)
        {
            return NotFound();
        }

        var result = await _evidenceService.SaveEvidenceAsync(caseId, evidenceFile,
            CurrentFullName ?? CurrentUsername ?? "Nepoznat korisnik");
        TempData[result.Succeeded ? "Success" : "Error"] = result.Message;
        return RedirectToAction(nameof(Details), new { id = caseId });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> VerifyEvidence(int caseId, int evidenceId, IFormFile verificationFile)
    {
        IActionResult? loginRedirect = RequireLogin();
        if (loginRedirect is not null)
        {
            return loginRedirect;
        }

        // FIX #12 (A01 - IDOR): Provjera da dokaz pripada navedenom predmetu
        if (caseId <= 0 || evidenceId <= 0)
        {
            return BadRequest();
        }

        var evidence = _evidenceService.GetById(evidenceId);
        if (evidence is null || evidence.CourtCaseId != caseId)
        {
            // FIX #12: Ne otkrivamo razlog odbijanja — sprječava IDOR istraživanje
            return NotFound();
        }

        var result = await _evidenceService.VerifyEvidenceAsync(evidenceId, verificationFile);
        TempData["VerificationMessage"] = result.Message;
        TempData["VerificationSucceeded"] = result.Succeeded ? "true" : "false";
        return RedirectToAction(nameof(Details), new { id = caseId });
    }
}
