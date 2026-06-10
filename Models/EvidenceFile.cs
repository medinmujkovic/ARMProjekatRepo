namespace SudskiSistemApp.Models;

public class EvidenceFile
{
    public int Id { get; set; }
    public int CourtCaseId { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string StoredFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public string FileExtension { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public string Sha256Hash { get; set; } = string.Empty;
    public DateTime UploadedAtUtc { get; set; }
    public string UploadedBy { get; set; } = string.Empty;
}
