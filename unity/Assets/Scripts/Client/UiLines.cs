using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>Lines drawn on the canvas (the web's SVG paths): each a polyline with its own colour and width, dashed if asked, built of thin bars.</summary>
public class UiLines : MonoBehaviour
{
    /// <summary>A quadratic curve from a to b through the control point c, as points.</summary>
    public static List<Vector2> Curve(Vector2 a, Vector2 c, Vector2 b, int n = 16)
    {
        var pts = new List<Vector2>();
        for (int i = 0; i <= n; i++)
        {
            float t = i / (float)n;
            pts.Add((1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b);
        }
        return pts;
    }

    public void Add(List<Vector2> points, Color colour, float width, float dash = 0, float gap = 0)
    {
        float run = 0;
        for (int i = 1; i < points.Count; i++)
        {
            var a = points[i - 1];
            var b = points[i];
            float len = Vector2.Distance(a, b);
            if (len < 1e-3f) continue;
            if (dash <= 0) Bar(a, b, width, colour);
            else
            {
                // (Dashed: only the parts of the segment that fall in a dash.)
                float period = dash + gap, s = 0;
                while (s < len)
                {
                    float phase = (run + s) % period;
                    float step = phase < dash ? Mathf.Min(dash - phase, len - s) : Mathf.Min(period - phase, len - s);
                    if (phase < dash) Bar(Vector2.Lerp(a, b, s / len), Vector2.Lerp(a, b, (s + step) / len), width, colour);
                    s += Mathf.Max(step, 0.01f);
                }
            }
            run += len;
        }
    }

    void Bar(Vector2 a, Vector2 b, float w, Color c)
    {
        var r = Hud.Rect(transform, "Bar");
        r.anchorMin = r.anchorMax = new Vector2(0.5f, 0.5f);
        r.pivot = new Vector2(0.5f, 0.5f);
        r.anchoredPosition = (a + b) / 2;
        // (A little longer than the segment, so joints meet.)
        r.sizeDelta = new Vector2(Vector2.Distance(a, b) + w * 0.6f, w);
        r.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(b.y - a.y, b.x - a.x) * Mathf.Rad2Deg);
        var img = r.gameObject.AddComponent<Image>();
        img.color = c;
        img.raycastTarget = false;
    }
}
