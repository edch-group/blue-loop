using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

/// <summary>
/// The menus' pieces in the web's own units (on a canvas made with Hud.CssCanvas: a unit is a CSS pixel at the page's
/// layout size, see Css): its rem, the page's padding clear of the safe area, its words measured and set as the web
/// sets them (letter-spacing in em), and its buttons (.btn, .btn-small, .btn-primary, .pill-btn, .link-btn) at their
/// CSS sizes, placed by their top-left corner.
/// </summary>
public static class MenuKit
{
    public const float Rem = 16;
    public static float W => Css.Size.x;
    public static float H => Css.Size.y;
    public static float Vw => Css.Vw;
    public static float Vh => Css.Vh;
    public static float Clamp(float min, float v, float max) => Css.Clamp(min, v, max);

    /// <summary>The web's media queries, which measure the screen itself (before its zoom): a big screen (landscape, at
    /// least 1000 by 600), and a short one (at most 560 tall: a phone on its side).</summary>
    public static bool Big => Css.Screen.x >= 1000 && Css.Screen.y >= 600;
    public static bool Short => Css.Screen.y <= 560;

    /// <summary>The safe area's insets (the web's --sa-t, --sa-r, --sa-b, --sa-l).</summary>
    public static float SaT => Css.SafeInsets.x;
    public static float SaR => Css.SafeInsets.y;
    public static float SaB => Css.SafeInsets.z;
    public static float SaL => Css.SafeInsets.w;

    /// <summary>A setup page's padding (styles.css .setup-page): max(12px, top), max(18px, right), max(12px, bottom), max(18px, left).</summary>
    public static float PadT => Mathf.Max(12, SaT);
    public static float PadR => Mathf.Max(18, SaR);
    public static float PadB => Mathf.Max(12, SaB);
    public static float PadL => Mathf.Max(18, SaL);

    /// <summary>Orbitron comes in 400, 500 and 700: the web's 600 is drawn at 700 (as a browser fakes it).</summary>
    static int Weight(int weight, bool display) => display ? (weight >= 600 ? 700 : weight <= 400 ? 400 : 500) : weight;

    /// <summary>The width of a line of words as the web sets it (its letter-spacing `em` of its size).</summary>
    public static float TextW(string text, float size, int weight = 500, float em = 0, bool display = true) => Hud.Wide(text, size, Weight(weight, display), em * 100, 0, display);

    /// <summary>Words in their own box (top-left x, y; w by h), letter-spacing `em` of their size.</summary>
    public static TextMeshProUGUI Words(Transform parent, string text, float x, float y, float w, float h, float size, Color color, bool display = true, int weight = 500, float em = 0, TextAlignmentOptions align = TextAlignmentOptions.Center)
        => Hud.Text(parent, text, x, y, w, h, size, color, display, Weight(weight, display), em * 100, align);

    /// <summary>Words filling their parent.</summary>
    public static TextMeshProUGUI Fill(Transform parent, string text, float size, Color color, bool display = true, int weight = 500, float em = 0, TextAlignmentOptions align = TextAlignmentOptions.Center)
        => Hud.Label(parent, text, size, color, display, Weight(weight, display), em * 100, align);

    /// <summary>A line's height in the web's fonts (its normal line height: Orbitron 1.12 of its size, Exo 2 1.2).</summary>
    public static float LineH(float size, bool display = true) => size * (display ? 1.12f : 1.2f);

    /// <summary>A rect placed by its top-left corner (x right, y down) in its parent.</summary>
    public static RectTransform Place(Component c, float x, float y, float w, float h) => Hud.Place((RectTransform)c.transform, x, y, w, h);

    /// <summary>An invisible box that takes taps (the web's plain button), its act on a tap.</summary>
    public static Button Hit(Transform parent, string name, System.Action act, bool sound = true)
    {
        var r = Hud.Rect(parent, name);
        var img = r.gameObject.AddComponent<Image>();
        img.color = new Color(1, 1, 1, 0);
        var b = r.gameObject.AddComponent<Button>();
        b.targetGraphic = img;
        b.transition = Selectable.Transition.None;
        if (act != null) b.onClick.AddListener(() => { if (sound) Sound.Play("click"); act(); });
        return b;
    }

    static Button Pressable(Image img, System.Action act)
    {
        var b = img.gameObject.AddComponent<Button>();
        img.raycastTarget = true;
        var colors = b.colors;
        colors.highlightedColor = new Color(0.97f, 0.98f, 1f);
        colors.pressedColor = new Color(0.9f, 0.91f, 0.95f);
        colors.disabledColor = new Color(1, 1, 1, 0.4f);
        b.colors = colors;
        if (act != null) b.onClick.AddListener(() => { Sound.Play("click"); act(); });
        return b;
    }

    /// <summary>A button's kind: .btn, .btn-small, .pill-btn, .btn-primary (and the setup foot's wide primary).</summary>
    public enum Kind { Btn, Small, Pill, Primary }

    /// <summary>A button's size as the web gives it: its word's size, its padding across and down, its height.</summary>
    public static (float size, float padX, float h, float radius) Measure(Kind kind) => kind switch
    {
        Kind.Small => (0.56f * Rem, 10, 26, 10),
        Kind.Pill => (0.56f * Rem, 11, 22, 11),
        Kind.Primary => (0.66f * Rem, 16, 32, 10),
        _ => (0.66f * Rem, 16, 32, 10),
    };

    /// <summary>A button's width: its word, its padding, its hairline.</summary>
    public static float BtnW(string text, Kind kind, float? size = null, float em = 0.14f, float? padX = null)
    {
        var m = Measure(kind);
        return TextW(text.ToUpperInvariant(), size ?? m.size, kind == Kind.Primary ? 700 : 500, em) + 2 * (padX ?? m.padX) + 2;
    }

    /// <summary>
    /// A web button at (x, y), w by h (0: as the web sizes it), its word in spaced capitals: .btn and .pill-btn the
    /// strong glass, a white hairline and a soft shadow (0 2 10, 12%); .btn-primary white to #eeeff1 (drawn as their
    /// middle), a ring of the line colour and a wider shadow (0 6 20), its word bold. Its width comes back too.
    /// </summary>
    public static Button Btn(Transform parent, string text, System.Action act, float x, float y, Kind kind = Kind.Btn, float w = 0, float h = 0, float? size = null, float em = 0.14f, float? radius = null, Color? ring = null)
    {
        var m = Measure(kind);
        float fs = size ?? m.size;
        if (w <= 0) w = BtnW(text, kind, fs, em);
        if (h <= 0) h = m.h;
        float rad = radius ?? (kind == Kind.Pill ? h / 2 : m.radius);
        bool primary = kind == Kind.Primary;
        var img = Hud.Box(parent, text, primary ? Hud.Rgba(247, 247, 248) : Look.GlassStrong, rad);
        Hud.Place(img.rectTransform, x, y, w, h);
        if (primary || ring != null) Hud.Shadow(img, rad, new Hud.Drop(ring ?? Look.Line, 0, 0, 1), new Hud.Drop(Hud.Rgba(120, 124, 134, 0.22f), 6, 20));
        else Hud.Shadow(img, rad, new Hud.Drop(Hud.Rgba(90, 90, 110, 0.12f), 2, 10));
        var b = Pressable(img, act);
        Fill(img.transform, text.ToUpperInvariant(), fs, Look.Ink, true, primary ? 700 : 500, em);
        return b;
    }

    /// <summary>The web's .link-btn at (x, y): its word in spaced capitals (9.6, 0.16em), ink-soft, a faint underline 3 under it. Its width comes back.</summary>
    public static float Link(Transform parent, string text, System.Action act, float x, float y, float size = 0.6f * Rem, Color? ink = null, bool fromRight = false)
    {
        string t = text.ToUpperInvariant();
        float tw = TextW(t, size, 400, 0.16f), w = tw + 4, h = LineH(size) + 8;
        var b = Hit(parent, text, act);
        Hud.Place((RectTransform)b.transform, fromRight ? x - w : x, y, w, h);
        Fill(b.transform, t, size, ink ?? Look.InkSoft, true, 400, 0.16f);
        var line = Hud.Rect(b.transform, "Underline");
        Hud.Place(line, 2, h / 2 + size * 0.4f + 3, tw, 1);
        var li = line.gameObject.AddComponent<Image>();
        li.color = Hud.Rgba(120, 128, 150, 0.35f);
        li.raycastTarget = false;
        return w;
    }

    /// <summary>A rounded box with a hairline inside its edge (CSS inset 0 0 0 1px): the edge colour, the box `inset` within it.</summary>
    public static Image Inset(Transform parent, string name, Color fill, Color edge, float radius, float width = 1)
    {
        var e = Hud.Box(parent, name, edge, radius);
        var inside = Hud.Box(e.transform, "Inside", fill, Mathf.Max(0.5f, radius - width));
        Hud.Fill(inside.rectTransform);
        inside.rectTransform.offsetMin = new Vector2(width, width);
        inside.rectTransform.offsetMax = new Vector2(-width, -width);
        return e;
    }

    /// <summary>
    /// A layer over the whole page in the old reference units (the web's CSS pixels drawn 1.45 times, as at 1600 × 1000):
    /// for the few small panels still laid out in them (the deck builder's popover and its dialogs), drawn at the web's
    /// own size. Anchors and offsets inside it are as on the old 1600 × 1000 canvas, its corners the page's.
    /// </summary>
    public static RectTransform RefLayer(Transform parent, string name = "Layer")
    {
        var r = Hud.Rect(parent, name);
        r.anchorMin = r.anchorMax = r.pivot = new Vector2(0.5f, 0.5f);
        r.sizeDelta = Css.Size * WebLook.Zoom;
        r.localScale = Vector3.one / WebLook.Zoom;
        return r;
    }

    /// <summary>A strip of colour from `a` at its top to `b` at its foot (a linear-gradient(180deg)).</summary>
    public static Texture2D Down(Color a, Color b, int n = 32)
    {
        var t = new Texture2D(1, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        for (int y = 0; y < n; y++) t.SetPixel(0, y, Color.Lerp(b, a, y / (n - 1f)));
        t.Apply();
        return t;
    }

    /// <summary>A scrolling column (overflow-y: auto): a masked view at (x, y), w by h, and its content (h tall) to fill.</summary>
    public static RectTransform Scroller(Transform parent, string name, float x, float y, float w, float h, float contentH, bool mask = true)
    {
        var view = Hud.Rect(parent, name);
        Hud.Place(view, x, y, w, h);
        if (mask) view.gameObject.AddComponent<RectMask2D>();
        var content = Hud.Rect(view, "Content");
        content.anchorMin = new Vector2(0, 1);
        content.anchorMax = new Vector2(1, 1);
        content.pivot = new Vector2(0.5f, 1);
        content.anchoredPosition = Vector2.zero;
        content.sizeDelta = new Vector2(0, Mathf.Max(h, contentH));
        var hit = content.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0.001f);
        var scroll = view.gameObject.AddComponent<ScrollRect>();
        scroll.viewport = view;
        scroll.content = content;
        scroll.horizontal = false;
        scroll.movementType = ScrollRect.MovementType.Elastic;
        scroll.elasticity = 0.08f;
        scroll.scrollSensitivity = 24;
        return content;
    }

    /// <summary>The sun at (x, y), `size` across (its halo spilling round it, never taking taps).</summary>
    public static RawImage SunAt(Transform parent, float x, float y, float size)
    {
        // (The web's own sun, baked with its glow (Icons/title-sun: 1200 square, the disc 260 across at its middle).)
        float s = size * 1200 / 260f;
        var r = Hud.Rect(parent, "Sun");
        Hud.Place(r, x + size / 2 - s / 2, y + size / 2 - s / 2, s, s);
        var img = r.gameObject.AddComponent<RawImage>();
        img.texture = Resources.Load<Texture2D>("Icons/title-sun");
        img.raycastTarget = false;
        return img;
    }
}
