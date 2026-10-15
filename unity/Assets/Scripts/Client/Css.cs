using UnityEngine;
using UnityEngine.UI;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

/// <summary>
/// The web's own units, for laying a screen out as the web does on any device, phone first (viewport.ts): a canvas
/// made with Hud.CssCanvas measures in the web's CSS pixels at the size the web lays its page out at. On a phone that
/// is the screen itself (932 × 430 on a big iPhone turned sideways); on a big screen the page is laid out smaller and
/// drawn larger (the web's body zoom: as many times 1100 × 660 as fit, at least 1, at most 1.75, in steps of 0.05), so
/// 1600 × 1000 lays out at 1103 × 690. Sizes from the web's CSS (vw, vh, clamp()) and its measured boxes carry over as
/// they are.
/// </summary>
public static class Css
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern float BlueLoopPixelRatio();
#endif

    /// <summary>The web's DESIGN size: bigger screens than this are drawn zoomed.</summary>
    public const float DesignW = 1100, DesignH = 660, MaxZoom = 1.75f;

    /// <summary>Screen pixels to a CSS pixel (the device's pixel ratio).</summary>
    public static float PixelRatio
    {
        get
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            return Mathf.Max(0.5f, BlueLoopPixelRatio());
#elif UNITY_IOS || UNITY_ANDROID
            // (A point or a dp to a CSS pixel, as a phone's browser has it.)
            return Screen.dpi > 0 ? Mathf.Max(1, Screen.dpi / (Application.platform == RuntimePlatform.IPhonePlayer ? 163f : 160f)) : 2;
#else
            return 1;
#endif
        }
    }

    /// <summary>The screen in CSS pixels, before any zoom.</summary>
    public static Vector2 Screen => new Vector2(UnityEngine.Screen.width, UnityEngine.Screen.height) / PixelRatio;

    /// <summary>How much bigger the page is drawn than it is laid out (viewport.ts zoom).</summary>
    public static float Zoom
    {
        get
        {
            var s = Screen;
            float z = Mathf.Max(1, Mathf.Min(MaxZoom, Mathf.Min(s.x / DesignW, s.y / DesignH)));
            return Mathf.Floor(z * 20) / 20;
        }
    }

    /// <summary>The page's own size, as it is laid out (the web's --app-w / --app-h): what vw and vh are of.</summary>
    public static Vector2 Size => Screen / Zoom;
    public static float Vw => Size.x / 100;
    public static float Vh => Size.y / 100;

    /// <summary>CSS clamp(min, value, max).</summary>
    public static float Clamp(float min, float value, float max) => Mathf.Max(min, Mathf.Min(value, max));

    /// <summary>
    /// The web's media queries, on the screen's own size as the browser has it (before the page's zoom): (max-height:
    /// h) and (max-width: w). A phone turned sideways is (max-height: 560px); the web's narrow rules (max-width: 960px).
    /// </summary>
    public static bool MaxHeight(float h) => Screen.y <= h;
    public static bool MaxWidth(float w) => Screen.x <= w;

    /// <summary>The safe area's insets (env(safe-area-inset-*)) in the page's own pixels: top, right, bottom, left.</summary>
    public static Vector4 SafeInsets
    {
        get
        {
            var i = Safe.Insets;
            var s = Size;
            return new Vector4(i.x * s.y, i.y * s.x, i.z * s.y, i.w * s.x);
        }
    }
}

/// <summary>A canvas measured in the web's CSS pixels (see Css): its scale kept to the screen's pixel ratio and zoom.</summary>
public class CssScaler : MonoBehaviour
{
    Canvas canvas;

    void Awake()
    {
        canvas = GetComponent<Canvas>();
        var s = GetComponent<CanvasScaler>();
        if (s != null) s.enabled = false;
        Apply();
    }

    void Update() => Apply();

    void Apply()
    {
        if (canvas == null) return;
        float f = Css.PixelRatio * Css.Zoom;
        if (!Mathf.Approximately(canvas.scaleFactor, f)) canvas.scaleFactor = f;
    }
}
