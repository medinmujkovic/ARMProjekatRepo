namespace SudskiSistemApp.Models;

public static class AppRole
{
    public const string ChiefInspector = "Glavni inspektor";
    public const string Inspector = "Inspektor";
    public const string Judge = "Sudija";

    public static bool CanCreateCase(string? role) => role == ChiefInspector;
    public static bool CanUploadEvidence(string? role) => role == ChiefInspector || role == Inspector;
}
