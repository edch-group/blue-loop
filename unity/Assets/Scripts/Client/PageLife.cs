using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

/// <summary>
/// The game going out of sight and coming back (the web's visibilitychange, pagehide and pageshow; an app sent to the
/// background, or quit): Sound sleeps and wakes on it (sound.ts sleep, wake), and Account sends what is waiting
/// (account.ts flush). In the browser, the page's own events (BlueLoopPage.jslib); elsewhere, the app's pause and quit.
/// Losing focus is only a moment's notice: changes waiting go to the account then too, as the page's pushes do when it
/// is left.
/// </summary>
public class PageLife : MonoBehaviour
{
    /// <summary>The game hidden (true) or shown again (false).</summary>
    public static event System.Action<bool> Hidden;
    /// <summary>The game being left (hidden, losing focus, quitting): time to send anything waiting.</summary>
    public static event System.Action Leaving;

    static PageLife instance;
    static bool hidden;

    /// <summary>Start listening (once; the first one asking).</summary>
    public static void Watch()
    {
        if (instance != null || !Application.isPlaying) return;
        var go = new GameObject("PageLife");
        DontDestroyOnLoad(go);
        instance = go.AddComponent<PageLife>();
#if UNITY_WEBGL && !UNITY_EDITOR
        BlueLoopOnPage(OnPage);
#endif
    }

    static void Set(bool now)
    {
        if (now) Leaving?.Invoke();
        if (now == hidden) return;
        hidden = now;
        Hidden?.Invoke(now);
    }

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern void BlueLoopOnPage(System.Action<int> cb);
    [DllImport("__Internal")] static extern void BlueLoopReplaceUrl(string url);
    [DllImport("__Internal")] static extern void BlueLoopSyncStore();

    [AOT.MonoPInvokeCallback(typeof(System.Action<int>))]
    static void OnPage(int isHidden) => Set(isHidden != 0);
#else
    void OnApplicationPause(bool paused) => Set(paused);
#endif

    void OnApplicationFocus(bool focused)
    {
        if (!focused) Leaving?.Invoke();
    }

    void OnApplicationQuit() => Leaving?.Invoke();

    /// <summary>The address in the browser's bar, rewritten in place (app.ts history.replaceState); nothing elsewhere.</summary>
    public static void ReplaceUrl(string url)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        BlueLoopReplaceUrl(url);
#endif
    }

    /// <summary>What the game keeps in its data folder, written through to the browser's storage (IndexedDB) so it outlives the page.</summary>
    public static void Persist()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        BlueLoopSyncStore();
#endif
    }
}
