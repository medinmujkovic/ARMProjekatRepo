using SudskiSistemApp.Data;

namespace SudskiSistemApp.Services;

/// <summary>
/// FIX #18 (A09 - Security Logging and Monitoring Failures):
/// Audit log servis za bilježenje sigurnosno relevantnih događaja.
/// OWASP A09 zahtijeva logovanje: neuspješnih prijava, pristupa kontroli, grešaka validacije.
/// </summary>
public class AuditLogService
{
    private readonly Database _database;
    private readonly ILogger<AuditLogService> _logger;

    public AuditLogService(Database database, ILogger<AuditLogService> logger)
    {
        _database = database;
        _logger = logger;
    }

    public void LogLoginAttempt(string username, bool succeeded, string? ipAddress)
    {
        string status = succeeded ? "SUCCESS" : "FAILURE";
        // Structured logging — ne logujemo lozinku ni hash
        _logger.LogInformation(
            "LOGIN_ATTEMPT | Status={Status} | Username={Username} | IP={IpAddress} | Time={Time}",
            status, Sanitize(username), ipAddress ?? "unknown", DateTime.UtcNow.ToString("O"));
    }

    public void LogAccountLockout(string username, string? ipAddress)
    {
        _logger.LogWarning(
            "ACCOUNT_LOCKOUT | Username={Username} | IP={IpAddress} | Time={Time}",
            Sanitize(username), ipAddress ?? "unknown", DateTime.UtcNow.ToString("O"));
    }

    public void LogAccessDenied(string username, string resource, string? ipAddress)
    {
        _logger.LogWarning(
            "ACCESS_DENIED | Username={Username} | Resource={Resource} | IP={IpAddress} | Time={Time}",
            Sanitize(username), resource, ipAddress ?? "unknown", DateTime.UtcNow.ToString("O"));
    }

    public void LogEvidenceUpload(string username, int caseId, string originalFileName, bool succeeded)
    {
        string status = succeeded ? "SUCCESS" : "FAILURE";
        _logger.LogInformation(
            "EVIDENCE_UPLOAD | Status={Status} | Username={Username} | CaseId={CaseId} | FileName={FileName} | Time={Time}",
            status, Sanitize(username), caseId, Sanitize(originalFileName), DateTime.UtcNow.ToString("O"));
    }

    public void LogCaseCreated(string username, string caseNumber)
    {
        _logger.LogInformation(
            "CASE_CREATED | Username={Username} | CaseNumber={CaseNumber} | Time={Time}",
            Sanitize(username), Sanitize(caseNumber), DateTime.UtcNow.ToString("O"));
    }

    /// <summary>Sanitizacija log unosa — sprječava log injection napade</summary>
    private static string Sanitize(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "(empty)";
        // Uklanjamo newline i carriage return koji bi omogućili log injection
        return value.Replace("\n", "\\n").Replace("\r", "\\r").Replace("\t", "\\t");
    }
}
