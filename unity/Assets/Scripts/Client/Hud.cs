using System;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

/// <summary>
/// The screen's own layer (the web's glass panels and pill buttons): a canvas over the scene at a reference size of
/// 1600 × 1000, rounded white panels with a soft shadow, and spaced capital labels in Orbitron.
/// </summary>
public static class Hud
{
    public const float W = 1600, H = 1000;
    static Sprite rounded, soft, circle;

    /// <summary>A white disc (for round buttons, dots and portraits).</summary>
    public static Sprite Circle => circle ??= MakeRounded(128, 64, 0);

    /// <summary>A white rounded rectangle, 9-sliced so it stretches to any size with its corners kept.</summary>
    public static Sprite Rounded => rounded ??= MakeRounded(64, 22, 0);
    /// <summary>The same, blurred: a soft shadow to set under a panel.</summary>
    public static Sprite Soft => soft ??= MakeRounded(96, 22, 18);

    static Sprite MakeRounded(int size, float radius, float blur)
    {
        var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
        float pad = blur;
        for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                // Distance outside a rounded box inset by the blur.
                float px = x + 0.5f, py = y + 0.5f;
                float half = size / 2f - pad;
                float qx = Mathf.Abs(px - size / 2f) - half + radius, qy = Mathf.Abs(py - size / 2f) - half + radius;
                float d = Mathf.Sqrt(Mathf.Max(qx, 0) * Mathf.Max(qx, 0) + Mathf.Max(qy, 0) * Mathf.Max(qy, 0)) + Mathf.Min(Mathf.Max(qx, qy), 0) - radius;
                float a = blur > 0 ? Mathf.Clamp01(1 - (d + blur * 0.2f) / blur) : Mathf.Clamp01(0.5f - d);
                if (blur > 0) a = a * a;
                t.SetPixel(x, y, new Color(1, 1, 1, a));
            }
        t.Apply();
        float b = radius + pad + 1;
        return Sprite.Create(t, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100, 0, SpriteMeshType.FullRect, new Vector4(b, b, b, b));
    }

    /// <summary>A canvas measured in the web's CSS pixels at its layout size, phone first (see Css).</summary>
    public static Canvas CssCanvas(Camera cam, int order = 0)
    {
        var c = Canvas(cam, order);
        c.gameObject.AddComponent<CssScaler>();
        return c;
    }

    /// <summary>
    /// A layer drawn in a canvas of its own, over the rest at `order`: what animates every frame (a banner, a number
    /// rising, a flash) then has only itself batched again each frame, not the whole screen's canvas.
    /// </summary>
    public static RectTransform Own(RectTransform r, int order)
    {
        var c = r.gameObject.AddComponent<Canvas>();
        c.overrideSorting = true;
        c.sortingOrder = order;
        return r;
    }

    public static Canvas Canvas(Camera cam, int order = 0)
    {
        var go = new GameObject("Hud", typeof(RectTransform));
        var c = go.AddComponent<Canvas>();
        c.renderMode = RenderMode.ScreenSpaceCamera;
        c.worldCamera = cam;
        c.planeDistance = 1;
        c.sortingOrder = order;
        var s = go.AddComponent<CanvasScaler>();
        s.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        s.referenceResolution = new Vector2(W, H);
        s.matchWidthOrHeight = 0.5f;
        go.AddComponent<GraphicRaycaster>();
        if (Application.isPlaying && UnityEngine.Object.FindAnyObjectByType<EventSystem>() == null) new GameObject("Events", typeof(EventSystem), typeof(StandaloneInputModule));
        return c;
    }

    public static RectTransform Rect(Transform parent, string name)
    {
        var go = new GameObject(name, typeof(RectTransform));
        go.transform.SetParent(parent, false);
        return (RectTransform)go.transform;
    }

    /// <summary>Place a rect by an anchor (0–1 on each axis) and an offset and size in reference pixels.</summary>
    public static RectTransform At(RectTransform r, Vector2 anchor, Vector2 offset, Vector2 size)
    {
        r.anchorMin = r.anchorMax = anchor;
        r.pivot = anchor;
        r.anchoredPosition = offset;
        r.sizeDelta = size;
        return r;
    }

    public static RectTransform Fill(RectTransform r)
    {
        r.anchorMin = Vector2.zero;
        r.anchorMax = Vector2.one;
        r.offsetMin = r.offsetMax = Vector2.zero;
        return r;
    }

    /// <summary>A rounded panel (the web's .glass): white, a hairline of white round it, a soft shadow under it.</summary>
    public static Image Glass(Transform parent, string name, Color? color = null, bool shadow = true)
    {
        var r = Rect(parent, name);
        var img = r.gameObject.AddComponent<Image>();
        img.sprite = Rounded;
        img.type = Image.Type.Sliced;
        img.color = color ?? Look.Glass;
        // (Its shadow is a sibling drawn just before it: a child would be drawn over it.)
        if (shadow) r.gameObject.AddComponent<GlassShadow>();
        return img;
    }

    public static TextMeshProUGUI Label(Transform parent, string text, float size, Color color, bool display = true, int weight = 500, float spacing = 12, TextAlignmentOptions align = TextAlignmentOptions.Center)
    {
        var r = Rect(parent, "Label");
        var t = r.gameObject.AddComponent<TextMeshProUGUI>();
        Look.Style(t, size, color, display, weight, spacing, align);
        t.text = text;
        Fill(r);
        return t;
    }

    /// <summary>A pill button (the web's .btn): a glass capsule with its label in spaced capitals.</summary>
    public static Button Pill(Transform parent, string text, Action onClick, float size = 22, Color? bg = null, Color? ink = null)
    {
        var img = Glass(parent, text, bg ?? Look.GlassStrong);
        var b = img.gameObject.AddComponent<Button>();
        var colors = b.colors;
        colors.highlightedColor = new Color(0.96f, 0.97f, 1f);
        colors.pressedColor = new Color(0.88f, 0.9f, 0.95f);
        colors.disabledColor = new Color(1, 1, 1, 0.5f);
        b.colors = colors;
        b.onClick.AddListener(() => { Sound.Play("click"); onClick(); });
        Label(img.transform, text.ToUpperInvariant(), size, ink ?? Look.Ink, true, 500, 14);
        return b;
    }

    // ---- Drawn to the web's own measures (its CSS as laid out on a 1600 x 1000 page): a place by its top-left corner,
    // corners of a given radius, shadows as its box-shadow lists them, and its buttons ----

    /// <summary>A rect placed by its top-left corner in its parent, x right and y down (as the web's boxes are measured).</summary>
    public static RectTransform Place(RectTransform r, float x, float y, float w, float h) => At(r, new Vector2(0, 1), new Vector2(x, -y), new Vector2(w, h));

    /// <summary>
    /// The web's text-overflow: ellipsis: a line cut short with "…" when it runs out of width, never out of height (TMP
    /// cuts a line that overflows its box's height too, leaving it blank or a bare "…"): its box given a size more of
    /// room above and below, on the sides its alignment leaves free, so it stands where it did.
    /// </summary>
    public static TMP_Text Ellipsis(TMP_Text t)
    {
        t.overflowMode = TextOverflowModes.Ellipsis;
        float f = t.fontSize;
        // (Its vertical alignment, from the alignment's high bits: top 0x100, bottom 0x400. Its box's free edges moved
        // out, not its margins: TMP's ellipsis can recurse without end inside negative margins.)
        int v = (int)t.alignment & 0xFF00;
        var r = t.rectTransform;
        if (v != 0x400) r.offsetMin -= new Vector2(0, f);
        if (v != 0x100) r.offsetMax += new Vector2(0, f);
        return t;
    }

    /// <summary>An image given rounded corners of `radius` reference pixels (a pill when it is half its height).</summary>
    public static Image Corner(Image img, float radius)
    {
        img.sprite = Rounded;
        img.type = Image.Type.Sliced;
        // (The sprite's corner is 22 of its pixels: drawn smaller or larger to match.)
        img.pixelsPerUnitMultiplier = 22f / Mathf.Max(0.5f, radius);
        return img;
    }

    /// <summary>A rounded box in a colour, `radius` its corners.</summary>
    public static Image Box(Transform parent, string name, Color color, float radius)
    {
        var r = Rect(parent, name);
        var img = r.gameObject.AddComponent<Image>();
        img.color = color;
        img.raycastTarget = false;
        return Corner(img, radius);
    }

    /// <summary>One of a box's shadows as CSS gives it: its colour, offset, blur and spread (reference pixels).</summary>
    public struct Drop
    {
        public Color Color;
        public float X, Y, Blur, Spread;
        public Drop(Color color, float y, float blur, float spread = 0, float x = 0)
        {
            Color = color;
            Y = y;
            Blur = blur;
            Spread = spread;
            X = x;
        }
    }

    /// <summary>A box's shadows (box-shadow): drawn just under it, the first given on top; `radius` the box's corners.</summary>
    public static Shades Shadow(Graphic target, float radius, params Drop[] drops)
    {
        var s = target.gameObject.AddComponent<Shades>();
        s.Init(radius, drops);
        return s;
    }

    /// <summary>A colour from the web's rgba().</summary>
    public static Color Rgba(int r, int g, int b, float a = 1) => new Color(r / 255f, g / 255f, b / 255f, a);

    /// <summary>A label placed in its own box (top-left x, y; w by h), as the web measures its text's box.</summary>
    public static TextMeshProUGUI Text(Transform parent, string text, float x, float y, float w, float h, float size, Color color, bool display = true, int weight = 500, float spacing = 0, TextAlignmentOptions align = TextAlignmentOptions.Center)
    {
        var t = Label(parent, text, size, color, display, weight, spacing, align);
        Place(t.rectTransform, x, y, w, h);
        return t;
    }

    static Button Pressable(Image img, Action onClick)
    {
        var b = img.gameObject.AddComponent<Button>();
        img.raycastTarget = true;
        var colors = b.colors;
        colors.highlightedColor = new Color(0.97f, 0.98f, 1f);
        colors.pressedColor = new Color(0.9f, 0.91f, 0.95f);
        colors.disabledColor = new Color(1, 1, 1, 0.4f);
        b.colors = colors;
        b.onClick.AddListener(() => { Sound.Play("click"); onClick(); });
        return b;
    }

    /// <summary>
    /// The web's .btn (and .btn-small, .pill-btn): glass-strong, a white hairline, a soft shadow (0 2.9 14.5, 12%),
    /// its word in spaced capitals; `radius` 14.5, or half its height for a pill. Placed by the caller.
    /// </summary>
    public static Button Btn(Transform parent, string text, Action onClick, float size = 13, float radius = 14.5f, float spacing = 14, int weight = 500)
    {
        var img = Box(parent, text, Look.GlassStrong, radius);
        Shadow(img, radius, new Drop(Rgba(90, 90, 110, 0.12f), 2.9f, 14.5f));
        var b = Pressable(img, onClick);
        Label(img.transform, text.ToUpperInvariant(), size, Look.Ink, true, weight, spacing);
        return b;
    }

    /// <summary>
    /// The web's .btn-primary: white to #eeeff1 (drawn as their middle), a ring of the line colour and a wider soft
    /// shadow, its word bold; `radius` 14.5.
    /// </summary>
    public static Button Primary(Transform parent, string text, Action onClick, float size = 15.3f, float spacing = 14, float radius = 14.5f)
    {
        var img = Box(parent, text, Rgba(247, 247, 248), radius);
        Shadow(img, radius, new Drop(Look.Line, 0, 0, 1.4f), new Drop(Rgba(120, 124, 134, 0.22f), 8.7f, 29));
        var b = Pressable(img, onClick);
        Label(img.transform, text.ToUpperInvariant(), size, Look.Ink, true, 700, spacing);
        return b;
    }

    /// <summary>The web's .link-btn: its word in spaced capitals, ink-soft, underlined in a faint line; no box.</summary>
    public static Button Link(Transform parent, string text, Action onClick, float size = 13.9f, Color? ink = null)
    {
        var r = Rect(parent, text);
        var hit = r.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        var b = r.gameObject.AddComponent<Button>();
        b.targetGraphic = hit;
        b.onClick.AddListener(() => { Sound.Play("click"); onClick(); });
        var t = Label(r, text.ToUpperInvariant(), size, ink ?? Look.InkSoft, true, 400, 16);
        // (Its underline: a hairline 3 under the words, as wide as them.)
        var line = Rect(r, "Underline");
        At(line, new Vector2(0.5f, 0), new Vector2(0, 4), new Vector2(t.GetPreferredValues(t.text).x, 1.4f));
        var li = line.gameObject.AddComponent<Image>();
        li.color = Rgba(120, 128, 150, 0.35f);
        li.raycastTarget = false;
        return b;
    }

    /// <summary>The width the web gives a label of this text (its words, plus padding either side).</summary>
    public static float Wide(string text, float size, int weight, float spacing, float pad, bool display = true)
    {
        var probe = Label(null, text, size, Color.clear, display, weight, spacing);
        float w = probe.GetPreferredValues(text).x;
        Mats.Kill(probe.gameObject);
        return w + pad * 2;
    }

    /// <summary>A row of a sheet: its name, what it is set to (if it is a setting), and what tapping it does.</summary>
    public struct Row
    {
        public string Label, Value;
        public Action Act;
        public bool Strong;
        public Row(string label, Action act, string value = null, bool strong = false)
        {
            Label = label;
            Act = act;
            Value = value;
            Strong = strong;
        }
    }

    /// <summary>
    /// A sheet (app.ts sheetFrame with settings.ts settingsPanel), laid out in the web's CSS pixels whatever the scale
    /// of `parent`: over a veil of the page, a white card (.modal: min(380px, 92vw) across, corners 18, a faint ring
    /// and two soft shadows), its title (.bar-title: 11.2, spaced 0.28em, padded 14 44 10, a 44-wide hairline fading
    /// out either side at its foot), then its rows' list (.set-list: 72% white, corners 16, padded 4, 2 between, a ring
    /// and a soft shadow) padded clamp(10px, 3vh, 22px) by clamp(14px, 3vw, 28px); each row (.set-row) at least
    /// clamp(36px, 7vh, 46px) tall with a hairline above all but the first, its name (10.56, spaced 0.22em; bold when
    /// it is the choice the sheet is for; a line under it after a newline) 16 in, and its setting in a grey pill or a
    /// chevron (17.6, faint; #5f8fc4 for the choice) 12 from its right. Centred; a tap on the veil closes it.
    /// </summary>
    public static RectTransform Sheet(Transform parent, string title, Row[] rows, Action close)
    {
        // (In CSS pixels: undo the parent's own scale.)
        var css = Rect(parent, "Sheet");
        css.anchorMin = css.anchorMax = css.pivot = new Vector2(0.5f, 0.5f);
        float k = parent.localScale.x != 0 ? 1 / parent.localScale.x : 1;
        css.localScale = Vector3.one * k;
        float W = MenuKit.W, H = MenuKit.H;
        css.sizeDelta = new Vector2(W, H);
        var veil = Rect(css, "Veil");
        Fill(veil);
        var v = veil.gameObject.AddComponent<Image>();
        v.color = new Color(0.95f, 0.95f, 0.94f, 0.8f);
        veil.gameObject.AddComponent<Button>().onClick.AddListener(() => close());
        float w = Mathf.Min(380, 0.92f * W);
        float pv = MenuKit.Clamp(10, 3 * MenuKit.Vh, 22), ph = MenuKit.Clamp(14, 3 * MenuKit.Vw, 28);
        float minRow = MenuKit.Clamp(36, 7 * MenuKit.Vh, 46), nameH = MenuKit.LineH(10.56f), subH = MenuKit.LineH(10.56f, false);
        var heights = new float[rows.Length];
        for (int i = 0; i < rows.Length; i++) heights[i] = Mathf.Max(minRow, rows[i].Label.Contains("\n") ? nameH + 3 + subH : 0);
        float listH = 8 + 2 * (rows.Length - 1);
        foreach (var rh in heights) listH += rh;
        float titleH = 14 + MenuKit.LineH(11.2f) + 10, h = 1 + titleH + pv + listH + pv + 1;
        var card = Box(veil, "Card", Color.white, 18);
        Place(card.rectTransform, (W - w) / 2, (H - h) / 2, w, h);
        Shadow(card, 18, new Drop(Rgba(120, 124, 134, 0.08f), 0, 0, 1), new Drop(Rgba(80, 80, 100, 0.18f), 30, 80), new Drop(Rgba(80, 80, 100, 0.08f), 6, 18));
        card.raycastTarget = true;
        // (The card itself swallows taps, so only the veil closes.)
        card.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        // (Centred with the spacing after its last letter, as the browser centres it: half of it to the left.)
        MenuKit.Words(card.transform, title.ToUpperInvariant(), 1 + 44 - 0.14f * 11.2f, 1 + 14, w - 2 - 88, MenuKit.LineH(11.2f), 11.2f, Look.Ink, true, 500, 0.28f);
        var rule = Rect(card.transform, "Rule");
        Place(rule, (w - 44) / 2, 1 + titleH - 1, 44, 1);
        var ri = rule.gameObject.AddComponent<RawImage>();
        var rt = new Texture2D(16, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        for (int x = 0; x < 16; x++) rt.SetPixel(x, 0, new Color(120 / 255f, 124 / 255f, 134 / 255f, 0.45f * (1 - Mathf.Abs(x - 7.5f) / 7.5f)));
        rt.Apply();
        ri.texture = rt;
        ri.raycastTarget = false;
        float lw = w - 2 - 2 * ph;
        var list = Box(card.transform, "List", new Color(1, 1, 1, 0.72f), 16);
        Place(list.rectTransform, 1 + ph, 1 + titleH + pv, lw, listH);
        Shadow(list, 16, new Drop(Rgba(58, 66, 86, 0.08f), 0, 0, 1), new Drop(Rgba(40, 46, 70, 0.06f), 6, 18));
        float rowW = lw - 8, ry = 4;
        for (int i = 0; i < rows.Length; i++)
        {
            var row = rows[i];
            float rowH = heights[i];
            var r = Box(list.transform, row.Label, Color.white, 12);
            Place(r.rectTransform, 4, ry, rowW, rowH);
            r.raycastTarget = true;
            var b = r.gameObject.AddComponent<Button>();
            var colors = b.colors;
            // (Clear, and a faint blue under the pointer, as the web's row hover.)
            colors.normalColor = new Color(1, 1, 1, 0);
            colors.highlightedColor = Rgba(95, 143, 196, 0.08f);
            colors.pressedColor = Rgba(95, 143, 196, 0.14f);
            colors.selectedColor = new Color(1, 1, 1, 0);
            colors.disabledColor = new Color(1, 1, 1, 0);
            b.colors = colors;
            var act = row.Act;
            if (act != null) b.onClick.AddListener(() => { Sound.Play("click"); act(); });
            else b.interactable = false;
            float fade = act != null ? 1 : 0.45f;
            if (i > 0)
            {
                var line = Rect(list.transform, "Line");
                Place(line, 4, ry - 1, rowW, 1);
                var li = line.gameObject.AddComponent<Image>();
                li.color = Rgba(58, 66, 86, 0.06f);
                li.raycastTarget = false;
            }
            var parts = row.Label.Split('\n');
            float labelH = parts.Length > 1 ? nameH + 3 + subH : nameH;
            var l = MenuKit.Words(r.transform, parts[0].ToUpperInvariant(), 16, (rowH - labelH) / 2, rowW - 100, nameH, 10.56f, Look.Ink, true, row.Strong ? 600 : 400, 0.22f, TextAlignmentOptions.Left);
            l.alpha = fade;
            if (parts.Length > 1)
            {
                var sub = MenuKit.Words(r.transform, parts[1], 16, (rowH - labelH) / 2 + nameH + 3, rowW - 100, subH, 10.56f, Look.InkFaint, false, 400, 0.02f, TextAlignmentOptions.Left);
                sub.alpha = fade;
            }
            if (row.Value != null)
            {
                string val = row.Value.ToUpperInvariant();
                float vw = Mathf.Max(44, MenuKit.TextW(val, 9.6f, 500, 0.16f) + 0.16f * 9.6f + 20), vh = MenuKit.LineH(9.6f) + 8;
                var pill = Box(r.transform, "Value", Rgba(240, 242, 246), vh / 2);
                Place(pill.rectTransform, rowW - 12 - vw, (rowH - vh) / 2, vw, vh);
                pill.color = new Color(pill.color.r, pill.color.g, pill.color.b, fade);
                var vl = MenuKit.Fill(pill.transform, val, 9.6f, Look.InkSoft, true, 500, 0.16f);
                vl.alpha = fade;
            }
            else
            {
                // (.set-link i: 17.6, its line 22 tall, its right edge 12 in.)
                var chev = MenuKit.Words(r.transform, "›", rowW - 12 - 16, (rowH - 22) / 2, 16, 22, 17.6f, row.Strong ? Rgba(95, 143, 196) : Look.InkFaint, false, 400, 0, TextAlignmentOptions.Right);
                chev.alpha = fade;
            }
            ry += rowH + 2;
        }
        return css;
    }
}

/// <summary>A glass panel's soft shadow: a sibling just under it, kept to its place and size, shown and gone with it.</summary>
[ExecuteAlways]
public class GlassShadow : MonoBehaviour
{
    RectTransform shadow;

    void Awake()
    {
        var go = new GameObject("Shadow", typeof(RectTransform));
        shadow = (RectTransform)go.transform;
        shadow.SetParent(transform.parent, false);
        shadow.SetSiblingIndex(transform.GetSiblingIndex());
        var si = go.AddComponent<Image>();
        si.sprite = Hud.Soft;
        si.type = Image.Type.Sliced;
        si.color = new Color(0.35f, 0.35f, 0.43f, 0.16f);
        si.raycastTarget = false;
        Follow();
    }

    void Follow()
    {
        if (shadow == null) return;
        var r = (RectTransform)transform;
        if (shadow.parent != r.parent) shadow.SetParent(r.parent, false);
        // (Just before the panel: moved down to the panel's place if after it, or up to the place before it.)
        int si = shadow.GetSiblingIndex(), pi = r.GetSiblingIndex();
        if (si > pi) shadow.SetSiblingIndex(pi);
        else if (si < pi - 1) shadow.SetSiblingIndex(pi - 1);
        shadow.anchorMin = r.anchorMin;
        shadow.anchorMax = r.anchorMax;
        shadow.pivot = r.pivot;
        shadow.offsetMin = r.offsetMin + new Vector2(-16, -22);
        shadow.offsetMax = r.offsetMax + new Vector2(16, 10);
        shadow.localScale = r.localScale;
    }

    void OnRectTransformDimensionsChange() => Follow();

    void LateUpdate() => Follow();
    void OnEnable() { if (shadow != null) shadow.gameObject.SetActive(true); Follow(); }
    void OnDisable() { if (shadow != null) shadow.gameObject.SetActive(false); }
    void OnDestroy() { if (shadow != null) Mats.Kill(shadow.gameObject); }
}

/// <summary>
/// A box's shadows as the web's box-shadow lists them (Hud.Shadow): each a sibling just under it (a child would be
/// drawn over it), the first listed nearest; kept to its place, size and corners, shown and gone with it. A shadow
/// with no blur is a hard ring (its spread); one with blur, the soft sprite drawn wide enough to fade over the blur.
/// </summary>
[ExecuteAlways]
public class Shades : MonoBehaviour
{
    RectTransform[] layers = new RectTransform[0];
    Hud.Drop[] drops = new Hud.Drop[0];
    float radius;
    Graphic target;
    Material[] cut;

    public void Init(float radius, Hud.Drop[] given)
    {
        this.radius = radius;
        target = GetComponent<Graphic>();
        drops = given;
        layers = new RectTransform[given.Length];
        for (int i = 0; i < given.Length; i++)
        {
            var d = given[i];
            var go = new GameObject("Shade", typeof(RectTransform));
            var r = (RectTransform)go.transform;
            r.SetParent(transform.parent, false);
            var img = go.AddComponent<Image>();
            img.raycastTarget = false;
            img.color = d.Color;
            img.type = Image.Type.Sliced;
            if (d.Blur > 0)
            {
                // (The soft sprite fades over 14.4 of its pixels and reaches 18 beyond its box.)
                img.sprite = Hud.Soft;
                img.pixelsPerUnitMultiplier = 14.4f / d.Blur;
            }
            else
            {
                img.sprite = Hud.Rounded;
                img.pixelsPerUnitMultiplier = 22f / Mathf.Max(0.5f, radius + d.Spread);
            }
            layers[i] = r;
        }
        Follow();
    }

    void Follow()
    {
        var r = (RectTransform)transform;
        for (int i = 0; i < layers.Length; i++)
        {
            var s = layers[i];
            if (s == null) continue;
            if (s.parent != r.parent) s.SetParent(r.parent, false);
            var d = drops[i];
            float e = d.Spread + (d.Blur > 0 ? d.Blur * 1.25f : 0);
            s.anchorMin = r.anchorMin;
            s.anchorMax = r.anchorMax;
            s.pivot = r.pivot;
            s.offsetMin = r.offsetMin + new Vector2(d.X - e, -d.Y - e);
            s.offsetMax = r.offsetMax + new Vector2(d.X + e, -d.Y + e);
            s.localScale = r.localScale;
            s.localRotation = r.localRotation;
        }
        Cut(r);
        // (Just before the box, the first listed nearest it; moved only when out of place.)
        int at = r.GetSiblingIndex();
        bool inPlace = true;
        for (int i = 0; i < layers.Length; i++)
            if (layers[i] != null && layers[i].GetSiblingIndex() != at - 1 - i) inPlace = false;
        if (inPlace) return;
        for (int i = layers.Length - 1; i >= 0; i--)
        {
            if (layers[i] == null) continue;
            // (Moved to just before the box: one less when it comes from before it, as the box then shifts down.)
            int ti = r.GetSiblingIndex(), li = layers[i].GetSiblingIndex();
            layers[i].SetSiblingIndex(li < ti ? ti - 1 : ti);
        }
    }

    static Shader shadeShader;

    /// <summary>
    /// CSS paints a box's shadow only outside it: under a box you can see through (its colour, or what holds it, less
    /// than whole), its shadows are cut away (BlueLoop/UiShade), so it shows what is behind it and not its own shadow.
    /// </summary>
    void Cut(RectTransform r)
    {
        if (target == null) return;
        var cr = target.GetComponent<CanvasRenderer>();
        bool see = cut != null || target.color.a < 0.999f || (cr != null && cr.GetInheritedAlpha() < 0.999f);
        if (!see) return;
        var canvas = target.canvas;
        if (canvas == null) return;
        if (cut == null)
        {
            shadeShader ??= Shader.Find("BlueLoop/UiShade");
            if (shadeShader == null) return;
            cut = new Material[layers.Length];
            for (int i = 0; i < layers.Length; i++)
            {
                if (layers[i] == null) continue;
                cut[i] = new Material(shadeShader);
                layers[i].GetComponent<Image>().material = cut[i];
            }
        }
        // (The box in its canvas's own space, where the canvas's vertices are.)
        var corners = new Vector3[4];
        r.GetWorldCorners(corners);
        var ct = canvas.transform;
        Vector2 a = ct.InverseTransformPoint(corners[0]), b = ct.InverseTransformPoint(corners[2]);
        var box = new Vector4((a.x + b.x) / 2, (a.y + b.y) / 2, Mathf.Abs(b.x - a.x) / 2, Mathf.Abs(b.y - a.y) / 2);
        float k = r.rect.width > 0 ? Mathf.Abs(b.x - a.x) / r.rect.width : 1;
        foreach (var m in cut)
        {
            if (m == null) continue;
            m.SetVector("_Box", box);
            m.SetFloat("_BoxRadius", radius * k);
        }
    }

    /// <summary>One of the shadows changed (as a CSS animation changes it).</summary>
    public void Set(int i, Hud.Drop d)
    {
        if (i >= layers.Length || layers[i] == null) return;
        drops[i] = d;
        var img = layers[i].GetComponent<Image>();
        img.color = d.Color;
        if (d.Blur > 0) img.pixelsPerUnitMultiplier = 14.4f / d.Blur;
        lastSibling = -1;
        Follow();
    }

    void OnRectTransformDimensionsChange() => Follow();

    // (Where the box stood when its shades last followed it: unmoved, they are left alone, not set again every frame.)
    Vector2 lastMin, lastMax, lastPivot, lastOffMin, lastOffMax;
    Vector3 lastScale, lastWorld;
    Quaternion lastRot;
    int lastSibling = -1;
    Transform lastParent;

    void LateUpdate()
    {
        var r = (RectTransform)transform;
        var world = cut != null ? r.position : Vector3.zero;
        if (r.anchorMin == lastMin && r.anchorMax == lastMax && r.pivot == lastPivot && r.offsetMin == lastOffMin && r.offsetMax == lastOffMax
            && r.localScale == lastScale && r.localRotation == lastRot && r.GetSiblingIndex() == lastSibling && r.parent == lastParent && world == lastWorld)
            return;
        lastMin = r.anchorMin;
        lastMax = r.anchorMax;
        lastPivot = r.pivot;
        lastOffMin = r.offsetMin;
        lastOffMax = r.offsetMax;
        lastScale = r.localScale;
        lastRot = r.localRotation;
        lastParent = r.parent;
        lastWorld = world;
        Follow();
        lastSibling = r.GetSiblingIndex();
    }

    void OnEnable() { foreach (var s in layers) if (s != null) s.gameObject.SetActive(true); lastSibling = -1; Follow(); }
    void OnDisable() { foreach (var s in layers) if (s != null) s.gameObject.SetActive(false); }
    void OnDestroy()
    {
        foreach (var s in layers) if (s != null) Mats.Kill(s.gameObject);
        if (cut != null) foreach (var m in cut) if (m != null) Mats.Kill(m);
    }
}
