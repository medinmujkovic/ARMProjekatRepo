using System.Security.Cryptography;
using Microsoft.Data.Sqlite;
using SudskiSistemApp.Data;
using SudskiSistemApp.Models;

namespace SudskiSistemApp.Services;

public class EvidenceService
{
    private readonly Database _database;
    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;

    // FIX #5 (A03 - Injection / Path Traversal): Dozvoljeni MIME tipovi po ekstenziji
    private static readonly Dictionary<string, string[]> AllowedMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        { ".pdf",  new[] { "application/pdf" } },
        { ".png",  new[] { "image/png" } },
        { ".jpg",  new[] { "image/jpeg" } },
        { ".jpeg", new[] { "image/jpeg" } },
        { ".txt",  new[] { "text/plain" } },
        { ".docx", new[] { "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                           "application/octet-stream" } }
    };

    // FIX #5: Magic byte potpisi za validaciju stvarnog sadržaja fajla
    private static readonly Dictionary<string, byte[]> FileMagicBytes = new(StringComparer.OrdinalIgnoreCase)
    {
        { ".pdf",  new byte[] { 0x25, 0x50, 0x44, 0x46 } },          // %PDF
        { ".png",  new byte[] { 0x89, 0x50, 0x4E, 0x47 } },          // PNG header
        { ".jpg",  new byte[] { 0xFF, 0xD8, 0xFF } },                  // JPEG
        { ".jpeg", new byte[] { 0xFF, 0xD8, 0xFF } },                  // JPEG
        { ".docx", new byte[] { 0x50, 0x4B, 0x03, 0x04 } },          // ZIP/OOXML
        // .txt nema fiksan magic, provjera se preskače
    };

    public EvidenceService(Database database, IWebHostEnvironment environment, IConfiguration configuration)
    {
        _database = database;
        _environment = environment;
        _configuration = configuration;
    }

    public List<EvidenceFile> GetByCaseId(int caseId)
    {
        using var connection = _database.CreateConnection();
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = @"
SELECT Id, CourtCaseId, OriginalFileName, StoredFileName, ContentType, FileExtension, FileSizeBytes, Sha256Hash, UploadedAtUtc, UploadedBy
FROM EvidenceFiles
WHERE CourtCaseId = $caseId
ORDER BY UploadedAtUtc DESC;";
        command.Parameters.AddWithValue("$caseId", caseId);

        using var reader = command.ExecuteReader();
        var evidenceFiles = new List<EvidenceFile>();
        while (reader.Read())
        {
            evidenceFiles.Add(ReadEvidence(reader));
        }

        return evidenceFiles;
    }

    public EvidenceFile? GetById(int id)
    {
        using var connection = _database.CreateConnection();
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = @"
SELECT Id, CourtCaseId, OriginalFileName, StoredFileName, ContentType, FileExtension, FileSizeBytes, Sha256Hash, UploadedAtUtc, UploadedBy
FROM EvidenceFiles
WHERE Id = $id;";
        command.Parameters.AddWithValue("$id", id);

        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadEvidence(reader) : null;
    }

    public async Task<UploadResult> SaveEvidenceAsync(int caseId, IFormFile file, string uploadedBy)
    {
        if (file == null || file.Length == 0)
        {
            return UploadResult.Fail("Fajl nije odabran.");
        }

        long maxSizeBytes = _configuration.GetValue("Security:MaxUploadSizeMb", 10) * 1024L * 1024L;
        if (file.Length > maxSizeBytes)
        {
            return UploadResult.Fail("Fajl je prevelik. Maksimalna veličina je 10 MB.");
        }

        // FIX #5 (A03 - Injection): Sigurno čitanje ekstenzije — bez path traversal
        string originalFileName = Path.GetFileName(file.FileName);
        string extension = Path.GetExtension(originalFileName).ToLowerInvariant();

        string[] allowedExtensions = _configuration.GetSection("Security:AllowedExtensions").Get<string[]>()
            ?? new[] { ".pdf", ".png", ".jpg", ".jpeg", ".txt", ".docx" };

        if (!allowedExtensions.Contains(extension))
        {
            return UploadResult.Fail("Tip fajla nije dozvoljen za upload.");
        }

        // FIX #5 (A03): Validacija MIME tipa prijavljenog od browsera
        if (AllowedMimeTypes.TryGetValue(extension, out string[]? allowedMimes))
        {
            string declaredContentType = (file.ContentType ?? string.Empty).Split(';')[0].Trim().ToLowerInvariant();
            if (!allowedMimes.Contains(declaredContentType))
            {
                return UploadResult.Fail("Deklarirani tip fajla ne odgovara ekstenziji.");
            }
        }

        // FIX #5 (A03): Validacija magic bytes — provjera stvarnog sadržaja
        if (FileMagicBytes.TryGetValue(extension, out byte[]? magic))
        {
            byte[] header = new byte[magic.Length];
            using var peekStream = file.OpenReadStream();
            int bytesRead = await peekStream.ReadAsync(header.AsMemory(0, magic.Length));
            if (bytesRead < magic.Length || !header.AsSpan(0, magic.Length).SequenceEqual(magic))
            {
                return UploadResult.Fail("Sadržaj fajla ne odgovara deklariranoj ekstenziji.");
            }
        }

        string uploadDirectory = Path.Combine(_environment.ContentRootPath, "UploadedEvidence");
        Directory.CreateDirectory(uploadDirectory);

        // FIX #6 (A01 - Path Traversal): Pohrana SAMO UUID + ekstenzija, bez originalnog naziva
        string storedFileName = $"{Guid.NewGuid():N}{extension}";

        // FIX #6: Kanonizacija putanje — zaštita od path traversal napada
        string storedPath = Path.GetFullPath(Path.Combine(uploadDirectory, storedFileName));
        if (!storedPath.StartsWith(Path.GetFullPath(uploadDirectory), StringComparison.OrdinalIgnoreCase))
        {
            return UploadResult.Fail("Nevažeći naziv fajla.");
        }

        await using (var fileStream = File.Create(storedPath))
        {
            await file.CopyToAsync(fileStream);
        }

        string sha256Hash = await ComputeSha256Async(storedPath);

        using var connection = _database.CreateConnection();
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = @"
INSERT INTO EvidenceFiles (CourtCaseId, OriginalFileName, StoredFileName, ContentType, FileExtension, FileSizeBytes, Sha256Hash, UploadedAtUtc, UploadedBy)
VALUES ($caseId, $originalFileName, $storedFileName, $contentType, $fileExtension, $fileSizeBytes, $sha256Hash, $uploadedAtUtc, $uploadedBy);";
        command.Parameters.AddWithValue("$caseId", caseId);
        // Pohrana sanitiziranog originalnog naziva
        command.Parameters.AddWithValue("$originalFileName", originalFileName);
        command.Parameters.AddWithValue("$storedFileName", storedFileName);
        command.Parameters.AddWithValue("$contentType", file.ContentType ?? "application/octet-stream");
        command.Parameters.AddWithValue("$fileExtension", extension);
        command.Parameters.AddWithValue("$fileSizeBytes", file.Length);
        command.Parameters.AddWithValue("$sha256Hash", sha256Hash);
        command.Parameters.AddWithValue("$uploadedAtUtc", DateTime.UtcNow.ToString("O"));
        command.Parameters.AddWithValue("$uploadedBy", uploadedBy);
        command.ExecuteNonQuery();

        return UploadResult.Success("Digitalni dokaz je uspješno dodan i SHA-256 hash je izračunat.");
    }

    public async Task<VerificationResult> VerifyEvidenceAsync(int evidenceId, IFormFile file)
    {
        EvidenceFile? storedEvidence = GetById(evidenceId);
        if (storedEvidence is null)
        {
            return VerificationResult.Fail("Dokaz nije pronađen.");
        }

        if (file == null || file.Length == 0)
        {
            return VerificationResult.Fail("Odaberite fajl za provjeru.");
        }

        // FIX #7 (A01): Veličina verifikacionog fajla ne smije biti neograničena
        long maxSizeBytes = 50L * 1024L * 1024L; // 50 MB limit za verifikaciju
        if (file.Length > maxSizeBytes)
        {
            return VerificationResult.Fail("Fajl za provjeru je prevelik.");
        }

        string temporaryPath = Path.GetTempFileName();
        try
        {
            await using (var stream = File.Create(temporaryPath))
            {
                await file.CopyToAsync(stream);
            }

            string calculatedHash = await ComputeSha256Async(temporaryPath);
            bool valid = string.Equals(calculatedHash, storedEvidence.Sha256Hash, StringComparison.OrdinalIgnoreCase);

            // FIX #8 (A03 - Information Disclosure): U slučaju nepodudaranja NE prikazujemo
            // izračunati hash napadaču — samo generična poruka
            return valid
                ? VerificationResult.Success($"Integritet potvrđen. Hash vrijednost se poklapa: {calculatedHash}")
                : VerificationResult.Fail("Integritet nije potvrđen. Hashovi se ne podudaraju.");
        }
        finally
        {
            if (File.Exists(temporaryPath))
            {
                File.Delete(temporaryPath);
            }
        }
    }

    public int CountEvidence()
    {
        using var connection = _database.CreateConnection();
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM EvidenceFiles;";
        return Convert.ToInt32(command.ExecuteScalar());
    }

    private static async Task<string> ComputeSha256Async(string filePath)
    {
        await using FileStream stream = File.OpenRead(filePath);
        using var sha256 = SHA256.Create();
        byte[] hash = await sha256.ComputeHashAsync(stream);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static EvidenceFile ReadEvidence(SqliteDataReader reader)
    {
        return new EvidenceFile
        {
            Id = Convert.ToInt32(reader["Id"]),
            CourtCaseId = Convert.ToInt32(reader["CourtCaseId"]),
            OriginalFileName = Convert.ToString(reader["OriginalFileName"]) ?? string.Empty,
            StoredFileName = Convert.ToString(reader["StoredFileName"]) ?? string.Empty,
            ContentType = Convert.ToString(reader["ContentType"]) ?? string.Empty,
            FileExtension = Convert.ToString(reader["FileExtension"]) ?? string.Empty,
            FileSizeBytes = Convert.ToInt64(reader["FileSizeBytes"]),
            Sha256Hash = Convert.ToString(reader["Sha256Hash"]) ?? string.Empty,
            UploadedAtUtc = DateTime.TryParse(Convert.ToString(reader["UploadedAtUtc"]), out DateTime uploadedAt) ? uploadedAt : DateTime.UtcNow,
            UploadedBy = Convert.ToString(reader["UploadedBy"]) ?? string.Empty
        };
    }
}

public class UploadResult
{
    public bool Succeeded { get; private init; }
    public string Message { get; private init; } = string.Empty;

    public static UploadResult Success(string message) => new() { Succeeded = true, Message = message };
    public static UploadResult Fail(string message) => new() { Succeeded = false, Message = message };
}

public class VerificationResult
{
    public bool Succeeded { get; private init; }
    public string Message { get; private init; } = string.Empty;

    public static VerificationResult Success(string message) => new() { Succeeded = true, Message = message };
    public static VerificationResult Fail(string message) => new() { Succeeded = false, Message = message };
}
