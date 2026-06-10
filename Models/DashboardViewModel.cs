namespace SudskiSistemApp.Models;

public class DashboardViewModel
{
    public int TotalCases { get; set; }
    public int TotalEvidence { get; set; }
    public int TotalUsers { get; set; }
    public int VerifiedEvidence => TotalEvidence;
    public List<CourtCase> RecentCases { get; set; } = new();
}
