namespace SudskiSistemApp.Models;

public class CourtCase
{
    public int Id { get; set; }
    public string CaseNumber { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string CourtName { get; set; } = string.Empty;
    public string Status { get; set; } = "U obradi";
    public DateTime CreatedAtUtc { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
}
