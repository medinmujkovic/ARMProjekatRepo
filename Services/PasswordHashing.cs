using System.Security.Cryptography;

namespace SudskiSistemApp.Services;

public static class PasswordHashing
{
    private const int SaltSize = 16;
    private const int KeySize = 32;
    // FIX #10 (A02 - Cryptographic Failures): Povećano na 310_000 iteracija
    // OWASP preporuka za PBKDF2-SHA256 u 2025/2026. godini
    private const int Iterations = 310_000;

    public static string HashPassword(string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(SaltSize);
        byte[] key = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, KeySize);
        return $"{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(key)}";
    }

    public static bool VerifyPassword(string password, string storedHash)
    {
        string[] parts = storedHash.Split('.', 3);
        if (parts.Length != 3 || !int.TryParse(parts[0], out int iterations))
        {
            return false;
        }

        byte[] salt = Convert.FromBase64String(parts[1]);
        byte[] expectedKey = Convert.FromBase64String(parts[2]);
        byte[] actualKey = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expectedKey.Length);
        // Konstantno-vremensko poređenje — zaštita od timing napada (A02)
        return CryptographicOperations.FixedTimeEquals(actualKey, expectedKey);
    }

    /// <summary>
    /// FIX #9 (A07 - Timing Attack): Lažna hash provjera za nepostojeće korisnike
    /// Osigurava jednako trajanje odgovora bez obzira da li korisnik postoji.
    /// </summary>
    public static void DummyVerify()
    {
        // Pohranjen dummy hash — ne može proci verifikaciju ali troši isti CPU čas
        const string dummyHash = "310000.AAAAAAAAAAAAAAAAAAAAAA==.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
        VerifyPassword("dummy_password_that_will_never_match", dummyHash);
    }
}
