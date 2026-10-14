using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>Lines drawn on the canvas (the web's SVG paths): each a polyline with its own colour and width, dashed if asked.</summary>
public class UiLines : MaskableGraphic
{
    public struct Line
    {
        public List<Vector2> Points;
        public Color Colour;
        public float Width, Dash, Gap;
    }

    readonly List<Line> lines = new List<Line>();

    public void Add(List<Vector2> points, Color colour, float width, float dash = 0, float gap = 0)
    {
        lines.Add(new Line { Points = points, Colour = colour, Width = width, Dash = dash, Gap = gap });
        SetVerticesDirty();
    }

    /// <summary>A quadratic curve from a to b through the control point c, as points.</summary>
    public static List<Vector2> Curve(Vector2 a, Vector2 c, Vector2 b, int n = 24)
    {
        var pts = new List<Vector2>();
        for (int i = 0; i <= n; i++)
        {
            float t = i / (float)n;
            pts.Add((1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b);
        }
        return pts;
    }

    protected override void OnPopulateMesh(VertexHelper vh)
    {
        vh.Clear();
        foreach (var l in lines)
        {
            float run = 0;
            for (int i = 1; i < l.Points.Count; i++)
            {
                var a = l.Points[i - 1];
                var b = l.Points[i];
                float len = Vector2.Distance(a, b);
                if (len < 1e-4f) continue;
                if (l.Dash > 0)
                {
                    // (Dashed: only the parts of the segment that fall in a dash.)
                    float period = l.Dash + l.Gap, s = 0;
                    while (s < len)
                    {
                        float phase = (run + s) % period;
                        float step = phase < l.Dash ? Mathf.Min(l.Dash - phase, len - s) : Mathf.Min(period - phase, len - s);
                        if (phase < l.Dash) Quad(vh, Vector2.Lerp(a, b, s / len), Vector2.Lerp(a, b, (s + step) / len), l.Width, l.Colour);
                        s += step;
                    }
                }
                else Quad(vh, a, b, l.Width, l.Colour);
                run += len;
            }
        }
    }

    static void Quad(VertexHelper vh, Vector2 a, Vector2 b, float w, Color c)
    {
        var d = (b - a).normalized;
        var n = new Vector2(-d.y, d.x) * w / 2;
        // (A little past each end, so joints meet.)
        a -= d * w * 0.3f;
        b += d * w * 0.3f;
        int k = vh.currentVertCount;
        vh.AddVert(a + n, c, Vector2.zero);
        vh.AddVert(b + n, c, Vector2.zero);
        vh.AddVert(b - n, c, Vector2.zero);
        vh.AddVert(a - n, c, Vector2.zero);
        vh.AddTriangle(k, k + 1, k + 2);
        vh.AddTriangle(k, k + 2, k + 3);
    }
}
