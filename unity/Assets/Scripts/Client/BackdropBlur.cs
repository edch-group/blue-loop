using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// What is behind an overlay, blurred (CSS backdrop-filter: blur(...); BackdropBlur.shader): the screen as drawn so far,
/// taken where the image is and blurred live, so what moves behind it (the board, the map) still moves, softened.
/// The overlay's first image, so its wash and all it shows come over the blur.
/// </summary>
public class BackdropBlur : MonoBehaviour
{
    /// <summary>styles.css .overlay (and .overlay-soft, .overlay-inspect): backdrop-filter: blur(6px).</summary>
    public const float Overlay = 6;

    float blur;
    Material mat;

    /// <summary>
    /// The page behind `parent` blurred by `cssBlur` CSS pixels, over the whole screen (the web's .overlay is fixed,
    /// inset 0: whatever frame `parent` sits in, the blur reaches the screen's edges): its first child.
    /// </summary>
    public static RawImage Blur(Transform parent, float cssBlur = Overlay)
    {
        var r = Hud.Rect(parent, "Backdrop");
        Hud.Fill(r);
        r.offsetMin = new Vector2(-4000, -4000);
        r.offsetMax = new Vector2(4000, 4000);
        r.SetAsFirstSibling();
        var img = r.gameObject.AddComponent<RawImage>();
        img.raycastTarget = false;
        // (An overlay that is its own wash would draw it under its children, the blur among them: its wash moved to
        // a child just over the blur, the overlay itself left clear, still taking taps.)
        var own = parent.GetComponent<Image>();
        if (own != null && own.sprite == null && own.color.a > 0)
        {
            var w = Hud.Rect(parent, "Wash");
            Hud.Fill(w);
            w.SetSiblingIndex(1);
            var wi = w.gameObject.AddComponent<Image>();
            wi.color = own.color;
            wi.raycastTarget = false;
            own.color = new Color(1, 1, 1, 0);
        }
        r.gameObject.AddComponent<BackdropBlur>().Init(img, cssBlur);
        return img;
    }

    void Init(Graphic g, float cssBlur)
    {
        blur = cssBlur;
        mat = Mats.Make("BackdropBlur");
        g.material = mat;
        Apply();
    }

    void Update() => Apply();

    void Apply()
    {
        if (mat == null) return;
        mat.SetFloat("_Blur", blur);
        // (A CSS pixel in the screen's pixels: the device's ratio and the page's zoom, as the canvases are scaled.)
        mat.SetFloat("_Px", Css.PixelRatio * Css.Zoom);
    }

    void OnDestroy() => Mats.Kill(mat);
}
