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
    static Sprite rounded, soft;

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
        if (shadow)
        {
            var sh = Rect(r, "Shadow");
            Fill(sh);
            sh.offsetMin = new Vector2(-16, -22);
            sh.offsetMax = new Vector2(16, 10);
            var si = sh.gameObject.AddComponent<Image>();
            si.sprite = Soft;
            si.type = Image.Type.Sliced;
            si.color = new Color(0.35f, 0.35f, 0.43f, 0.16f);
            si.raycastTarget = false;
        }
        var img = r.gameObject.AddComponent<Image>();
        img.sprite = Rounded;
        img.type = Image.Type.Sliced;
        img.color = color ?? Look.Glass;
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
}
