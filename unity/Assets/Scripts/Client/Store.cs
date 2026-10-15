using System.IO;
using UnityEngine;

/// <summary>
/// What the game keeps on this device (the web's localStorage, key for key: "blue-loop:decks:v1" and the rest), each
/// key a file in the app's own data folder (in the browser, written through to its IndexedDB as each changes, as
/// localStorage keeps a change at once). An account syncs the same keys (account.ts); a desktop build's folder can sit
/// in Steam Cloud.
/// </summary>
public static class Store
{
    static string Dir => Path.Combine(Application.persistentDataPath, "store");
    static string FileOf(string key) => Path.Combine(Dir, key.Replace(':', '_') + ".json");

    public static string Get(string key)
    {
        try
        {
            var f = FileOf(key);
            return File.Exists(f) ? File.ReadAllText(f) : null;
        }
        catch
        {
            return null;
        }
    }

    public static void Set(string key, string value)
    {
        try
        {
            Directory.CreateDirectory(Dir);
            File.WriteAllText(FileOf(key), value);
            // (In the browser the folder lives in memory until written through to its storage: now, not at some later save.)
            PageLife.Persist();
        }
        catch
        {
            // Storage unavailable: kept for this session only.
        }
        // (Progress the account keeps goes to it shortly.)
        Account.Touched(key);
    }

    public static void Remove(string key)
    {
        try
        {
            var f = FileOf(key);
            if (File.Exists(f))
            {
                File.Delete(f);
                PageLife.Persist();
            }
        }
        catch
        {
            // ignore
        }
        Account.Touched(key);
    }

    public static T Read<T>(string key) where T : class
    {
        var raw = Get(key);
        if (raw == null) return null;
        try
        {
            return BlueLoop.Engine.Json.Read<T>(raw);
        }
        catch
        {
            return null;
        }
    }

    public static void Write(string key, object value) => Set(key, BlueLoop.Engine.Json.Write(value));
}
