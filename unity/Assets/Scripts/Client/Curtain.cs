using System.Collections;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The paper drawn over the whole screen while one screen gives way to another (the run's map to one of its battles,
/// and back): it comes in over what is leaving, the next screen is made out of sight under it (the heavy work done
/// while nothing shows), and it lifts off the new one. While it is up, or lifting, the screens take no taps or keys.
/// Over everything (a canvas of its own, drawn after every camera), in the paper's colour.
/// </summary>
public class Curtain : MonoBehaviour
{
    /// <summary>How long the paper takes to come in over a screen, and to lift off the next (seconds).</summary>
    public const float In = 0.32f, Out = 0.45f;

    static Curtain live;
    CanvasGroup group;
    Image paper;
    int holds;

    /// <summary>A change of screens under way: the screens take no input.</summary>
    public static bool Busy => live != null && live.holds > 0;

    /// <summary>Whether the paper covers the screen whole.</summary>
    public static bool Covered => live != null && live.group.alpha >= 1;

    static Curtain Get()
    {
        if (live != null) return live;
        var go = new GameObject("Curtain", typeof(RectTransform));
        DontDestroyOnLoad(go);
        var c = go.AddComponent<Canvas>();
        c.renderMode = RenderMode.ScreenSpaceOverlay;
        c.sortingOrder = 32000;
        go.AddComponent<GraphicRaycaster>();
        live = go.AddComponent<Curtain>();
        live.group = go.AddComponent<CanvasGroup>();
        live.group.alpha = 0;
        live.group.blocksRaycasts = false;
        live.group.interactable = false;
        var r = Hud.Fill(Hud.Rect(go.transform, "Paper"));
        live.paper = r.gameObject.AddComponent<Image>();
        live.paper.color = Look.Paper;
        live.paper.raycastTarget = true;
        go.SetActive(false);
        return live;
    }

    /// <summary>A change of screens begins: input held (and the paper's taps caught) until Release.</summary>
    public static void Hold()
    {
        var c = Get();
        c.holds++;
        c.group.blocksRaycasts = true;
        Set(c.group.alpha);
    }

    public static void Release()
    {
        if (live == null) return;
        live.holds = Mathf.Max(0, live.holds - 1);
        if (live.holds == 0) live.group.blocksRaycasts = false;
        Set(live.group.alpha);
    }

    /// <summary>The paper over the screen at once (nothing to fade from: a screen made from nothing).</summary>
    public static void Cover() => Set(1);

    /// <summary>The paper comes in over the screen, eased, over `seconds`.</summary>
    public static IEnumerator Close(float seconds = In) => Fade(1, seconds);

    /// <summary>The paper lifts off the screen, eased, over `seconds`.</summary>
    public static IEnumerator Open(float seconds = Out) => Fade(0, seconds);

    static IEnumerator Fade(float to, float seconds)
    {
        var c = Get();
        float from = c.group.alpha;
        if (Mathf.Approximately(from, to)) { Set(to); yield break; }
        // (By the frame, each step at most a 30th of a second: a frame held up by the work under the paper never jumps
        // the fade, which plays out whole however the frames come.)
        for (float t = 0; t < seconds;)
        {
            t += Mathf.Min(Time.unscaledDeltaTime, 1 / 30f);
            float k = Mathf.Clamp01(t / seconds);
            k = k * k * (3 - 2 * k);
            Set(Mathf.Lerp(from, to, k));
            if (k < 1) yield return null;
        }
        Set(to);
    }

    static void Set(float a)
    {
        var c = Get();
        c.group.alpha = a;
        bool on = a > 0 || c.holds > 0;
        if (c.gameObject.activeSelf != on) c.gameObject.SetActive(on);
    }
}
