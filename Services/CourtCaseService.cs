using Microsoft.Data.Sqlite;
using SudskiSistemApp.Data;
using SudskiSistemApp.Models;

namespace SudskiSistemApp.Services;

public class CourtCaseService
{
    private readonly Database _database;

    public CourtCaseService(Database database)
    {
        _database = database;
    }

    public List<CourtCase> GetAll()
    {
        using var connection = _database.CreateConnection();
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = @"
SELECT Id, CaseNumber, Title, Description, CourtName, Status, CreatedAtUtc, CreatedBy
FROM CourtCases
ORDER BY CreatedAtUtc DESC;";

        using var reader = command.ExecuteReader();
        var cases = new List<CourtCase>();
        while (reader.Read())
        {
            cases.Add(ReadCase(reader));
        }

        return cases;
    }

    public List<CourtCase> GetRecent(int count)
    {
        using var connection = _database.CreateConnection();
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = @"
SELECT Id, CaseNumber, Title, Description, CourtName, Status, CreatedAtUtc, CreatedBy
FROM CourtCases
ORDER BY CreatedAtUtc DESC
LIMIT $count;";
        command.Parameters.AddWithValue("$count", count);

        using var reader = command.ExecuteReader();
        var cases = new List<CourtCase>();
        while (reader.Read())
        {
            cases.Add(ReadCase(reader));
        }

        return cases;
    }

    public CourtCase? GetById(int id)
    {
        using var connection = _database.CreateConnection();
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = @"
SELECT Id, CaseNumber, Title, Description, CourtName, Status, CreatedAtUtc, CreatedBy
FROM CourtCases
WHERE Id = $id;";
        command.Parameters.AddWithValue("$id", id);

        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadCase(reader) : null;
    }

    public void Create(string caseNumber, string title, string description, string courtName, string createdBy)
    {
        using var connection = _database.CreateConnection();
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = @"
INSERT INTO CourtCases (CaseNumber, Title, Description, CourtName, Status, CreatedAtUtc, CreatedBy)
VALUES ($caseNumber, $title, $description, $courtName, $status, $createdAtUtc, $createdBy);";
        command.Parameters.AddWithValue("$caseNumber", caseNumber.Trim());
        command.Parameters.AddWithValue("$title", title.Trim());
        command.Parameters.AddWithValue("$description", description.Trim());
        command.Parameters.AddWithValue("$courtName", courtName.Trim());
        command.Parameters.AddWithValue("$status", "U obradi");
        command.Parameters.AddWithValue("$createdAtUtc", DateTime.UtcNow.ToString("O"));
        command.Parameters.AddWithValue("$createdBy", createdBy);
        command.ExecuteNonQuery();
    }

    public int CountCases()
    {
        using var connection = _database.CreateConnection();
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM CourtCases;";
        return Convert.ToInt32(command.ExecuteScalar());
    }

    private static CourtCase ReadCase(SqliteDataReader reader)
    {
        return new CourtCase
        {
            Id = Convert.ToInt32(reader["Id"]),
            CaseNumber = Convert.ToString(reader["CaseNumber"]) ?? string.Empty,
            Title = Convert.ToString(reader["Title"]) ?? string.Empty,
            Description = Convert.ToString(reader["Description"]) ?? string.Empty,
            CourtName = Convert.ToString(reader["CourtName"]) ?? string.Empty,
            Status = Convert.ToString(reader["Status"]) ?? string.Empty,
            CreatedAtUtc = DateTime.TryParse(Convert.ToString(reader["CreatedAtUtc"]), out DateTime createdAt) ? createdAt : DateTime.UtcNow,
            CreatedBy = Convert.ToString(reader["CreatedBy"]) ?? string.Empty
        };
    }
}
