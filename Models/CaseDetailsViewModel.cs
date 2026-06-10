namespace SudskiSistemApp.Models;

public class CaseDetailsViewModel
{
    public CourtCase Case { get; set; } = new();
    public List<EvidenceFile> EvidenceFiles { get; set; } = new();
    public string? VerificationMessage { get; set; }
    public bool? VerificationSucceeded { get; set; }
}
