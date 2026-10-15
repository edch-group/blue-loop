using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

/// <summary>
/// The connection (account.ts isOffline): with none, the game plays on from this device (campaign, quickplay, decks,
/// tutorial, challenges); what needs the server (online play, the shop, crafting, the community's decks, signing in)
/// waits. In the browser, navigator.onLine and its online and offline events (BlueLoopMenu.jslib); elsewhere, whether
/// the device can reach a network. Also the fullscreen button's say (app.ts fullscreenButton).
/// </summary>
public static class Connection
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern int BlueLoopOnline();
    [DllImport("__Internal")] static extern int BlueLoopOnlineChanges();
    [DllImport("__Internal")] static extern int BlueLoopFullscreenOn();
    [DllImport("__Internal")] static extern int BlueLoopFullscreenOffered();
#endif

    /// <summary>No connection (the browser says it is offline).</summary>
    public static bool Lost
    {
        get
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            try { return BlueLoopOnline() == 0; }
            catch { return false; }
#else
            return Application.internetReachability == NetworkReachability.NotReachable;
#endif
        }
    }

    /// <summary>What needs the server can't be had: there is none here (opened ?offline, or none set), or no connection.</summary>
    public static bool Offline => !Net.Available || Lost;

    static bool? was;
#if UNITY_WEBGL && !UNITY_EDITOR
    static int heard = -1;
#endif

    /// <summary>Whether the connection has come or gone since last asked (the window's online and offline events).</summary>
    public static bool Changed()
    {
        bool now = Lost;
#if UNITY_WEBGL && !UNITY_EDITOR
        // (Counted by the window's own events: a loss and a return between two looks still counts.)
        int n;
        try { n = BlueLoopOnlineChanges(); }
        catch { n = 0; }
        bool changed = heard >= 0 && n != heard;
        heard = n;
#else
        bool changed = was != null && was.Value != now;
#endif
        was = now;
        return changed;
    }

    /// <summary>The page is fullscreen.</summary>
    public static bool FullscreenOn
    {
        get
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            try { return BlueLoopFullscreenOn() == 1; }
            catch { return Screen.fullScreen; }
#else
            return Screen.fullScreen;
#endif
        }
    }

    /// <summary>
    /// Whether the hub offers fullscreen: where the browser allows it, not in an installed app (fullscreen already;
    /// so never in the native app); while fullscreen, always, to leave it.
    /// </summary>
    public static bool FullscreenOffered
    {
        get
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            try { return BlueLoopFullscreenOffered() == 1; }
            catch { return true; }
#elif UNITY_ANDROID || UNITY_IOS
            return false;
#else
            return true;
#endif
        }
    }
}
