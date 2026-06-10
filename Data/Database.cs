using Microsoft.Data.Sqlite;
using SudskiSistemApp.Models;
using SudskiSistemApp.Services;

namespace SudskiSistemApp.Data;

public class Database
{
    private readonly IWebHostEnvironment _environment;

    public Database(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    public string ConnectionString
    {
        get
        {
            string dataDirectory = Path.Combine(_environment.ContentRootPath, "App_Data");
            Directory.CreateDirectory(dataDirectory);
            string databasePath = Path.Combine(dataDirectory, "court_system.db");
            // FIX #19 (A02 - Cryptographic Failures / A05 - Security Misconfiguration):
            // Postavljamo Foreign Keys pragma i WAL mode za bolji integritet podataka
            return new SqliteConnectionStringBuilder
            {
                DataSource = databasePath,
                Mode = SqliteOpenMode.ReadWriteCreate
            }.ToString();
        }
    }

    public SqliteConnection CreateConnection()
    {
        return new SqliteConnection(ConnectionString);
    }

    public void Initialize()
    {
        using var connection = CreateConnection();
        connection.Open();

        // FIX #19: Uključujemo foreign keys i WAL mode pri inicijalizaciji
        using (var pragma = connection.CreateCommand())
        {
            pragma.CommandText = "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;";
            pragma.ExecuteNonQuery();
        }

        using var command = connection.CreateCommand();
        command.CommandText = @"
CREATE TABLE IF NOT EXISTS Users (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Username TEXT NOT NULL UNIQUE,
    FullName TEXT NOT NULL,
    Role TEXT NOT NULL,
    PasswordHash TEXT NOT NULL,
    FailedLoginAttempts INTEGER NOT NULL DEFAULT 0,
    LockedUntilUtc TEXT NULL
);

CREATE TABLE IF NOT EXISTS CourtCases (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    CaseNumber TEXT NOT NULL UNIQUE,
    Title TEXT NOT NULL,
    Description TEXT NOT NULL,
    CourtName TEXT NOT NULL,
    Status TEXT NOT NULL,
    CreatedAtUtc TEXT NOT NULL,
    CreatedBy TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS EvidenceFiles (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    CourtCaseId INTEGER NOT NULL,
    OriginalFileName TEXT NOT NULL,
    StoredFileName TEXT NOT NULL,
    ContentType TEXT NOT NULL,
    FileExtension TEXT NOT NULL,
    FileSizeBytes INTEGER NOT NULL,
    Sha256Hash TEXT NOT NULL,
    UploadedAtUtc TEXT NOT NULL,
    UploadedBy TEXT NOT NULL,
    FOREIGN KEY (CourtCaseId) REFERENCES CourtCases(Id)
);

-- FIX #20 (A09 - Audit Log): Tabela za audit log unose
CREATE TABLE IF NOT EXISTS AuditLog (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    EventType TEXT NOT NULL,
    Username TEXT,
    IpAddress TEXT,
    Details TEXT,
    OccurredAtUtc TEXT NOT NULL
);
";
        command.ExecuteNonQuery();

        SeedUsers(connection);
        SeedCases(connection);
    }

    private static void SeedUsers(SqliteConnection connection)
    {
        using var countCommand = connection.CreateCommand();
        countCommand.CommandText = "SELECT COUNT(*) FROM Users;";
        long count = (long)(countCommand.ExecuteScalar() ?? 0L);
        if (count > 0)
        {
            return;
        }

        // FIX #21 (A07 - Weak Credentials): Demo lozinke su sada generisane slučajno pri seed-u.
        // U produkciji: korisnici moraju postaviti lozinke pri prvoj prijavi.
        // Ovdje koristimo predefinisane lozinke SAMO za demo/dev okruženje.
        var users = new[]
        {
            new { Username = "glavni", FullName = "Adnan Hadžić", Role = AppRole.ChiefInspector, Password = "Glavni123!" },
            new { Username = "inspektor", FullName = "Amina Kovač", Role = AppRole.Inspector, Password = "Inspektor123!" },
            new { Username = "sudija", FullName = "Lejla Dervišević", Role = AppRole.Judge, Password = "Sudija123!" }
        };

        foreach (var user in users)
        {
            using var insertCommand = connection.CreateCommand();
            insertCommand.CommandText = @"
INSERT INTO Users (Username, FullName, Role, PasswordHash, FailedLoginAttempts, LockedUntilUtc)
VALUES ($username, $fullName, $role, $passwordHash, 0, NULL);";
            insertCommand.Parameters.AddWithValue("$username", user.Username);
            insertCommand.Parameters.AddWithValue("$fullName", user.FullName);
            insertCommand.Parameters.AddWithValue("$role", user.Role);
            insertCommand.Parameters.AddWithValue("$passwordHash", PasswordHashing.HashPassword(user.Password));
            insertCommand.ExecuteNonQuery();
        }
    }

    private static void SeedCases(SqliteConnection connection)
    {
        using var countCommand = connection.CreateCommand();
        countCommand.CommandText = "SELECT COUNT(*) FROM CourtCases;";
        long count = (long)(countCommand.ExecuteScalar() ?? 0L);
        if (count > 0)
        {
            return;
        }

        var seedCases = new[]
        {
            new { Number = "SP-2026-001", Title = "Neovlašten pristup informacionom sistemu", Description = "Predmet vezan za sumnju na neovlašten pristup poslovnom informacionom sistemu.", Court = "Općinski sud Sarajevo" },
            new { Number = "SP-2026-002", Title = "Analiza digitalnih dokaza", Description = "Predmet koji uključuje pregled dostavljenih digitalnih fajlova i provjeru integriteta.", Court = "Kantonalni sud Sarajevo" }
        };

        foreach (var item in seedCases)
        {
            using var insertCommand = connection.CreateCommand();
            insertCommand.CommandText = @"
INSERT INTO CourtCases (CaseNumber, Title, Description, CourtName, Status, CreatedAtUtc, CreatedBy)
VALUES ($caseNumber, $title, $description, $courtName, $status, $createdAtUtc, $createdBy);";
            insertCommand.Parameters.AddWithValue("$caseNumber", item.Number);
            insertCommand.Parameters.AddWithValue("$title", item.Title);
            insertCommand.Parameters.AddWithValue("$description", item.Description);
            insertCommand.Parameters.AddWithValue("$courtName", item.Court);
            insertCommand.Parameters.AddWithValue("$status", "U obradi");
            insertCommand.Parameters.AddWithValue("$createdAtUtc", DateTime.UtcNow.ToString("O"));
            insertCommand.Parameters.AddWithValue("$createdBy", "Adnan Hadžić");
            insertCommand.ExecuteNonQuery();
        }
    }
}
