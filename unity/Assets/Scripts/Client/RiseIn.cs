using UnityEngine;

/// <summary>
/// A part of the page fading and rising in, after a wait (styles.css run-over-in: from transparent and 8px low, over
/// 0.6s, eased; held hidden till it begins), as a scene's lines come one after another. Timed from a moment given, so a
/// page drawn again carries on where it was; out of play (the editor's pictures), shown as it ends.
/// </summary>
public class RiseIn : MonoBehaviour
{
    const float Rise = 8, Length = 0.6f;
    float from, delay, alpha = -1;
    Vector2 rest;
    CanvasGroup group;

    /// <summary>Have `r` fade and rise in `delay` seconds after `start` (a Time.time).</summary>
    public static void On(RectTransform r, float start, float delay)
    {
        var x = r.gameObject.AddComponent<RiseIn>();
        x.from = start;
        x.delay = delay;
        x.rest = r.anchoredPosition;
        x.group = r.GetComponent<CanvasGroup>();
        if (x.group == null) x.group = r.gameObject.AddComponent<CanvasGroup>();
        x.Apply();
    }

    void Update() => Apply();

    void Apply()
    {
        // (Any fading of its own, kept: it rises in to that.)
        if (alpha < 0) alpha = group.alpha;
        float k = Application.isPlaying ? Mathf.Clamp01((Time.time - from - delay) / Length) : 1;
        float e = Ease(k);
        group.alpha = alpha * e;
        ((RectTransform)transform).anchoredPosition = rest - new Vector2(0, Rise * (1 - e));
        if (k >= 1) enabled = false;
    }

    /// <summary>CSS's `ease` (cubic-bezier(0.25, 0.1, 0.25, 1)) at k.</summary>
    static float Ease(float k)
    {
        if (k <= 0) return 0;
        if (k >= 1) return 1;
        // (Solve the curve's x for its parameter, by Newton's method, then read its y.)
        float t = k;
        for (int i = 0; i < 6; i++)
        {
            float x = Bez(t, 0.25f, 0.25f) - k;
            float dx = DBez(t, 0.25f, 0.25f);
            if (Mathf.Abs(dx) < 1e-5f) break;
            t = Mathf.Clamp01(t - x / dx);
        }
        return Bez(t, 0.1f, 1);
    }

    static float Bez(float t, float a, float b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
    static float DBez(float t, float a, float b) => 3 * (1 - t) * (1 - t) * a + 6 * (1 - t) * t * (b - a) + 3 * t * t * (1 - b);
}
