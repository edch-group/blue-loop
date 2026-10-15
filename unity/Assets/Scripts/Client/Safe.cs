using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

/// <summary>
/// The screen's safe area (clear of a phone's notch, its rounded corners and its home bar), as the web's
/// env(safe-area-inset-*): each side's inset as a fraction of the screen. In the browser it is read from the page's CSS
/// (Unity's own Screen.safeArea is the whole canvas there); elsewhere from Screen.safeArea.
/// </summary>
public static class Safe
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern string BlueLoopSafeInsets();
#endif
    static int frame = -1;
    static Vector4 insets;

    /// <summary>Top, right, bottom and left insets, each a fraction of the screen's height or width.</summary>
    public static Vector4 Insets
    {
        get
        {
            if (frame == Time.frameCount) return insets;
            frame = Time.frameCount;
#if UNITY_WEBGL && !UNITY_EDITOR
            var parts = (BlueLoopSafeInsets() ?? "").Split(',');
            float F(int i) => parts.Length > i && float.TryParse(parts[i], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var v) ? Mathf.Clamp(v, 0, 0.4f) : 0;
            insets = new Vector4(F(0), F(1), F(2), F(3));
#else
            var a = Screen.safeArea;
            float w = Mathf.Max(1, Screen.width), h = Mathf.Max(1, Screen.height);
            insets = new Vector4((h - a.yMax) / h, (w - a.xMax) / w, a.yMin / h, a.xMin / w);
#endif
            return insets;
        }
    }
}

/// <summary>
/// A page laid out at the web's 1600 × 1000 reference, drawn whole on any screen: scaled to fit the safe area and
/// centred in it (on a wide phone the page keeps its proportions, the backdrop filling round it; on a short screen
/// nothing falls off the foot). Its `Edges`, a layer of the same scale spanning the whole safe area, holds what the web
/// pins to the screen's corners (the hub's links and its corner buttons).
/// </summary>
public class Frame : MonoBehaviour
{
    public RectTransform Edges;
    RectTransform me, canvas;
    Vector2 lastSize;
    Vector4 lastInsets;

    public static Frame Make(RectTransform page, bool edges = true)
    {
        var f = page.gameObject.AddComponent<Frame>();
        f.me = page;
        f.canvas = (RectTransform)page.parent;
        page.anchorMin = page.anchorMax = page.pivot = new Vector2(0.5f, 0.5f);
        page.sizeDelta = new Vector2(Hud.W, Hud.H);
        if (edges)
        {
            f.Edges = Hud.Rect(page, "Edges");
            f.Edges.anchorMin = f.Edges.anchorMax = f.Edges.pivot = new Vector2(0.5f, 0.5f);
        }
        f.Fit();
        return f;
    }

    void LateUpdate() => Fit();

    void Fit()
    {
        if (canvas == null) return;
        var size = canvas.rect.size;
        var ins = Safe.Insets;
        if (size == lastSize && ins == lastInsets) return;
        lastSize = size;
        lastInsets = ins;
        float top = ins.x * size.y, right = ins.y * size.x, bottom = ins.z * size.y, left = ins.w * size.x;
        float w = Mathf.Max(1, size.x - left - right), h = Mathf.Max(1, size.y - top - bottom);
        float s = Mathf.Min(w / Hud.W, h / Hud.H);
        me.localScale = new Vector3(s, s, 1);
        me.anchoredPosition = new Vector2((left - right) / 2, (bottom - top) / 2);
        if (Edges == null) return;
        Edges.anchoredPosition = Vector2.zero;
        Edges.sizeDelta = new Vector2(w / s, h / s);
    }
}
