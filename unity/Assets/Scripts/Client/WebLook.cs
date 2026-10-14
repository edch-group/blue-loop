using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

/// <summary>
/// The web's own boxes, to its measures (styles.css, at the reference 1600 x 1000, where the page is drawn 1.45 times
/// its CSS size): a rounded box at a given corner radius, its box shadows, a gradient down it, its buttons (.btn and
/// .btn-primary) and words placed by their CSS boxes.
/// </summary>
public static class WebLook
{
    /// <summary>The web page's zoom at 1600 x 1000 (styles.css sizes are CSS pixels; drawn 1.45 times as large).</summary>
    public const float Zoom = 1.45f;

    /// <summary>A colour from the web's hex (#rrggbb), at an opacity.</summary>
    public static Color Hex(string hex, float alpha = 1)
    {
        ColorUtility.TryParseHtmlString(hex, out var c);
        c.a = alpha;
        return c;
    }

    /// <summary>A rect placed by its box on the 1600 x 1000 page (drawn pixels): its left, top, width and height.</summary>
    public static RectTransform Box(RectTransform r, float x, float y, float w, float h)
    {
        r.anchorMin = r.anchorMax = r.pivot = new Vector2(0, 1);
        r.anchoredPosition = new Vector2(x, -y);
        r.sizeDelta = new Vector2(w, h);
        return r;
    }

    /// <summary>A new rect placed by its box relative to its parent's top left.</summary>
    public static RectTransform Box(Transform parent, string name, float x, float y, float w, float h) => Box(Hud.Rect(parent, name), x, y, w, h);

    /// <summary>A rect centred on a point of the page (drawn pixels from its top left), at a size.</summary>
    public static RectTransform Centred(Transform parent, string name, float x, float y, float w, float h)
    {
        var r = Hud.Rect(parent, name);
        r.anchorMin = r.anchorMax = new Vector2(0, 1);
        r.pivot = new Vector2(0.5f, 0.5f);
        r.anchoredPosition = new Vector2(x, -y);
        r.sizeDelta = new Vector2(w, h);
        return r;
    }

    /// <summary>A rounded box (its border-radius in drawn pixels; 999 a disc), filled with a colour.</summary>
    public static Image Rounded(Transform parent, string name, Color colour, float radius)
    {
        var r = Hud.Rect(parent, name);
        var img = r.gameObject.AddComponent<Image>();
        Round(img, radius);
        img.color = colour;
        img.raycastTarget = false;
        return img;
    }

    /// <summary>An image made a rounded box at a corner radius (the shared sprite's corners are 22 across; 999 a disc).</summary>
    public static Image Round(Image img, float radius)
    {
        img.sprite = radius >= 999 ? Hud.Circle : Hud.Rounded;
        img.type = radius >= 999 ? Image.Type.Simple : Image.Type.Sliced;
        if (radius < 999) img.pixelsPerUnitMultiplier = 22f / Mathf.Max(0.5f, radius);
        return img;
    }

    /// <summary>
    /// A CSS box-shadow under a box (kept just under it, following it): offset down by `y`, blurred by `blur`, in a
    /// colour; and, if asked, a hairline ring round it (0 0 0 `ring`) in its own colour.
    /// </summary>
    public static WebShadow Shadow(Component box, float y, float blur, Color colour, float radius, float ring = 0, Color? ringColour = null)
    {
        var s = box.gameObject.AddComponent<WebShadow>();
        s.Y = y;
        s.Blur = blur;
        s.Colour = colour;
        s.Radius = radius;
        s.RingWidth = ring;
        s.RingColour = ringColour ?? Color.clear;
        return s;
    }

    /// <summary>Words in a box, as the web sets them: a size, letter-spacing in em, weight, colour and alignment.</summary>
    public static TextMeshProUGUI Words(Transform parent, string text, float size, float spacingEm, Color colour, bool display = true, int weight = 500, TextAlignmentOptions align = TextAlignmentOptions.Center)
        => Hud.Label(parent, text, size, colour, display, weight, spacingEm * 100, align);

    /// <summary>
    /// A web button (.btn, or .btn-primary), its words in spaced capitals. Plain: the strong glass, a soft shadow beneath
    /// (0 2px 10px). Primary: white down to #eeeff1, a fine grey ring and a deeper shadow (0 6px 20px), its words bold.
    /// </summary>
    public static UnityEngine.UI.Button Button(Transform parent, string text, System.Action act, bool primary, float fontSize, float spacingEm, float radius = 10 * Zoom)
    {
        var r = Hud.Rect(parent, text);
        var img = r.gameObject.AddComponent<Image>();
        Round(img, radius);
        img.color = primary ? Color.white : Look.GlassStrong;
        if (primary) Fade(img, Color.white, Hex("#eeeff1"));
        var b = r.gameObject.AddComponent<UnityEngine.UI.Button>();
        var colors = b.colors;
        colors.highlightedColor = Color.white;
        colors.pressedColor = new Color(0.94f, 0.94f, 0.96f);
        colors.disabledColor = new Color(1, 1, 1, 0.4f);
        b.colors = colors;
        b.onClick.AddListener(() => { Sound.Play("click"); act?.Invoke(); });
        var w = Words(r, text.ToUpperInvariant(), fontSize, spacingEm, Look.Ink, true, primary ? 700 : 500);
        // (CSS letter-spacing trails the last letter too: the words sit that much left of the middle.)
        w.margin = new Vector4(0, 0, spacingEm * fontSize, 0);
        // (Plain: 0 2px 10px rgba(90, 90, 110, 0.12). Primary: a 1px ring of the page's line, and 0 6px 20px.)
        var line = new Color(120 / 255f, 124 / 255f, 134 / 255f, 0.22f);
        if (primary) Shadow(r, 6 * Zoom, 20 * Zoom, line, radius, Zoom, line);
        else Shadow(r, 2 * Zoom, 10 * Zoom, new Color(90 / 255f, 90 / 255f, 110 / 255f, 0.12f), radius);
        return b;
    }

    /// <summary>
    /// A linear gradient down a rounded box (its top colour to its bottom; or, across, its left to its right), laid in
    /// it, held to its shape.
    /// </summary>
    public static RawImage Fade(Image box, Color from, Color to, bool across = false)
    {
        box.gameObject.AddComponent<Mask>().showMaskGraphic = true;
        var r = Hud.Rect(box.transform, "Gradient");
        Hud.Fill(r);
        var img = r.gameObject.AddComponent<RawImage>();
        // (Its two pixels' middles at the box's two ends: a straight blend between them.)
        img.uvRect = across ? new Rect(0.25f, 0, 0.5f, 1) : new Rect(0, 0.25f, 1, 0.5f);
        img.color = Color.white;
        img.raycastTarget = false;
        r.gameObject.AddComponent<FadeColours>().Set(img, from, to, across);
        return img;
    }

    /// <summary>A gradient's two colours, drawn into its own small texture.</summary>
    public class FadeColours : MonoBehaviour
    {
        Texture2D tex;

        public void Set(RawImage img, Color from, Color to, bool across)
        {
            tex = new Texture2D(across ? 2 : 1, across ? 1 : 2, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            // (Textures run up from their foot: down the box, its foot pixel first.)
            tex.SetPixels(across ? new[] { from, to } : new[] { to, from });
            tex.Apply();
            img.texture = tex;
        }

        void OnDestroy()
        {
            if (tex != null) Mats.Kill(tex);
        }
    }

    /// <summary>An option lifting a little under the pointer (the campaign menu's: its disc 1.1 times, its name inked).</summary>
    public class Lift : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler
    {
        public RectTransform Disc;
        public TMP_Text Name;
        public Color Rest, Over;

        public void OnPointerEnter(PointerEventData e)
        {
            if (Disc != null) Disc.localScale = Vector3.one * 1.1f;
            if (Name != null) Name.color = Over;
        }

        public void OnPointerExit(PointerEventData e)
        {
            if (Disc != null) Disc.localScale = Vector3.one;
            if (Name != null) Name.color = Rest;
        }
    }
}

/// <summary>
/// A box's CSS shadows, kept under it (siblings just before it, following its place, size and whether it shows): a
/// soft shadow offset down and blurred, and a hairline ring round it.
/// </summary>
[ExecuteAlways]
public class WebShadow : MonoBehaviour
{
    public float Y, Blur, Radius = 14.5f, RingWidth;
    public Color Colour, RingColour;
    Image shadow, ring;

    void Start() => Follow();
    void LateUpdate() => Follow();
    void OnEnable() => Follow();
    void OnDisable()
    {
        if (shadow != null) shadow.gameObject.SetActive(false);
        if (ring != null) ring.gameObject.SetActive(false);
    }
    void OnDestroy()
    {
        if (shadow != null) Mats.Kill(shadow.gameObject);
        if (ring != null) Mats.Kill(ring.gameObject);
    }

    void Follow()
    {
        var r = (RectTransform)transform;
        if (r.parent == null) return;
        if (shadow == null && Colour.a > 0)
        {
            shadow = Make("shadow");
            shadow.sprite = Hud.Soft;
            shadow.type = Image.Type.Sliced;
            // (The soft sprite's edge sits 18 of its pixels inside it, fading over the next 14: scaled so the box's
            // edge falls `blur` inside the shadow's. A CSS blur is half its colour there; this nearer two thirds.)
            shadow.pixelsPerUnitMultiplier = 18f / Mathf.Max(1, Blur);
            shadow.color = new Color(Colour.r, Colour.g, Colour.b, Colour.a * 0.8f);
        }
        if (ring == null && RingWidth > 0)
        {
            ring = Make("ring");
            WebLook.Round(ring, Radius + RingWidth);
            ring.color = RingColour;
        }
        bool on = r.gameObject.activeInHierarchy && enabled;
        // (Faded with its box when its box fades as a group.)
        var group = GetComponent<CanvasGroup>();
        float fade = group != null ? group.alpha : 1;
        if (shadow != null) shadow.color = new Color(Colour.r, Colour.g, Colour.b, Colour.a * 0.8f * fade);
        if (ring != null) ring.color = new Color(RingColour.r, RingColour.g, RingColour.b, RingColour.a * fade);
        foreach (var img in new[] { shadow, ring })
        {
            if (img == null) continue;
            var s = img.rectTransform;
            if (s.parent != r.parent) s.SetParent(r.parent, false);
            // (Just before the box: the shadow, then the ring.)
            int want = r.GetSiblingIndex() - (img == shadow && ring != null ? 2 : 1);
            int at = s.GetSiblingIndex();
            if (at > r.GetSiblingIndex()) s.SetSiblingIndex(r.GetSiblingIndex());
            else if (at < want) s.SetSiblingIndex(want);
            if (s.gameObject.activeSelf != on) s.gameObject.SetActive(on);
            float grow = img == shadow ? Blur : RingWidth;
            float dy = img == shadow ? -Y : 0;
            s.anchorMin = r.anchorMin;
            s.anchorMax = r.anchorMax;
            s.pivot = r.pivot;
            s.offsetMin = r.offsetMin + new Vector2(-grow, -grow + dy);
            s.offsetMax = r.offsetMax + new Vector2(grow, grow + dy);
            s.localScale = r.localScale;
            s.localRotation = r.localRotation;
        }
    }

    Image Make(string what)
    {
        var go = new GameObject(name + " " + what, typeof(RectTransform));
        go.transform.SetParent(transform.parent, false);
        go.transform.SetSiblingIndex(transform.GetSiblingIndex());
        var img = go.AddComponent<Image>();
        img.raycastTarget = false;
        return img;
    }
}
