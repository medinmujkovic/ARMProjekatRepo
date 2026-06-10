using Microsoft.Data.Sqlite;
using SudskiSistemApp.Data;
using SudskiSistemApp.Models;

namespace SudskiSistemApp.Services;

public class AuthService
{
    private readonly Database _database;
    private readonly IConfiguration _configuration;

    public AuthService(Database database, IConfiguration configuration)
    {
        _database = database;
        _configuration = configuration;
    }

    public AppUser? FindByUsername(string username)
    {
        using var connection = _database.CreateConnection();
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = @"
SELECT Id, Username, FullName, Role, PasswordHash, FailedLoginAttempts, LockedUntilUtc
FROM Users
WHERE Username = $username;";
        command.Parameters.AddWithValue("$username", username.Trim());

        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        return ReadUser(reader);
    }

    public LoginResult TryLogin(string username, string password)
    {
        // FIX #9 (A07 - Identification Failures): Konstanta poruka greške
        // Ista poruka za nepostojećeg korisnika i pogrešnu lozinku — sprječava username enumeration
        const string genericError = "Neispravno korisničko ime ili lozinka.";

        AppUser? user = FindByUsername(username);
        if (user is null)
        {
            // FIX #9: Simuliramo hash provjeru i za nepostojeće korisnike (timing attack zaštita)
            PasswordHashing.DummyVerify();
            return LoginResult.Fail(genericError);
        }

        if (user.LockedUntilUtc.HasValue && user.LockedUntilUtc.Value > DateTime.UtcNow)
        {
            // FIX #9: Ne otkrivamo tačno koliko minuta ostaje — generičana poruka
            return LoginResult.Fail("Nalog je privremeno zaključan. Pokušajte ponovo kasnije.");
        }

        bool passwordValid = PasswordHashing.VerifyPassword(password, user.PasswordHash);
        if (!passwordValid)
        {
            RegisterFailedAttempt(user);
            return LoginResult.Fail(genericError);
        }

        ResetFailedAttempts(user.Id);
        return LoginResult.Success(user);
    }

    private void RegisterFailedAttempt(AppUser user)
    {
        int maxAttempts = _configuration.GetValue("Security:MaxFailedLoginAttempts", 5);
        int lockoutMinutes = _configuration.GetValue("Security:LockoutMinutes", 15);
        int nextAttempts = user.FailedLoginAttempts + 1;
        DateTime? lockedUntil = nextAttempts >= maxAttempts ? DateTime.UtcNow.AddMinutes(lockoutMinutes) : null;

        using var connection = _database.CreateConnection();
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = @"
UPDATE Users
SET FailedLoginAttempts = $attempts,
    LockedUntilUtc = $lockedUntil
WHERE Id = $id;";
        command.Parameters.AddWithValue("$attempts", nextAttempts);
        command.Parameters.AddWithValue("$lockedUntil", lockedUntil?.ToString("O") ?? (object)DBNull.Value);
        command.Parameters.AddWithValue("$id", user.Id);
        command.ExecuteNonQuery();
    }

    private void ResetFailedAttempts(int userId)
    {
        using var connection = _database.CreateConnection();
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = @"
UPDATE Users
SET FailedLoginAttempts = 0,
    LockedUntilUtc = NULL
WHERE Id = $id;";
        command.Parameters.AddWithValue("$id", userId);
        command.ExecuteNonQuery();
    }

    public int CountUsers()
    {
        using var connection = _database.CreateConnection();
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM Users;";
        return Convert.ToInt32(command.ExecuteScalar());
    }

    private static AppUser ReadUser(SqliteDataReader reader)
    {
        string? lockedUntilText = reader["LockedUntilUtc"] as string;
        return new AppUser
        {
            Id = Convert.ToInt32(reader["Id"]),
            Username = Convert.ToString(reader["Username"]) ?? string.Empty,
            FullName = Convert.ToString(reader["FullName"]) ?? string.Empty,
            Role = Convert.ToString(reader["Role"]) ?? string.Empty,
            PasswordHash = Convert.ToString(reader["PasswordHash"]) ?? string.Empty,
            FailedLoginAttempts = Convert.ToInt32(reader["FailedLoginAttempts"]),
            LockedUntilUtc = DateTime.TryParse(lockedUntilText, out DateTime lockedDate) ? lockedDate : null
        };
    }
}

public class LoginResult
{
    public bool Succeeded { get; private init; }
    public string Message { get; private init; } = string.Empty;
    public AppUser? User { get; private init; }

    public static LoginResult Success(AppUser user) => new() { Succeeded = true, User = user };
    public static LoginResult Fail(string message) => new() { Succeeded = false, Message = message };
}
