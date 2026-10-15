using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Lines drawn on the canvas (the web's SVG paths): each a polyline with its own colour and width, dashed if asked,
/// stroked as SVG strokes them: one band with mitred joins and round caps (on each dash too), never laid over itself,
/// so a faint line stays evenly faint along its length.
/// </summary>
[RequireComponent(typeof(CanvasRenderer))]
public class UiLines : MaskableGraphic
{
    struct Stroke { public List<Vector2> Points; public Color Colour; public float Width; }

    readonly List<Stroke> strokes = new List<Stroke>();

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

    public void Add(List<Vector2> points, Color colour, float width, float dash = 0, float gap = 0)
    {
        raycastTarget = false;
        if (dash <= 0) strokes.Add(new Stroke { Points = new List<Vector2>(points), Colour = colour, Width = width });
        else
        {
            // (Dashed: each dash its own stroke along the path, from where it starts to where it ends.)
            float period = dash + gap, run = 0;
            List<Vector2> cur = null;
            for (int i = 1; i < points.Count; i++)
            {
                var a = points[i - 1];
                var b = points[i];
                float len = Vector2.Distance(a, b);
                if (len < 1e-3f) continue;
                float s = 0;
                while (s < len)
                {
                    float phase = (run + s) % period;
                    bool on = phase < dash;
                    float step = Mathf.Max(0.001f, on ? Mathf.Min(dash - phase, len - s) : Mathf.Min(period - phase, len - s));
                    if (on)
                    {
                        if (cur == null) cur = new List<Vector2> { Vector2.Lerp(a, b, s / len) };
                        cur.Add(Vector2.Lerp(a, b, (s + step) / len));
                    }
                    else if (cur != null)
                    {
                        strokes.Add(new Stroke { Points = cur, Colour = colour, Width = width });
                        cur = null;
                    }
                    s += step;
                }
                run += len;
            }
            if (cur != null) strokes.Add(new Stroke { Points = cur, Colour = colour, Width = width });
        }
        SetVerticesDirty();
    }

    protected override void OnPopulateMesh(VertexHelper vh)
    {
        vh.Clear();
        // (The points are given from the middle of the box.)
        var r = rectTransform.rect;
        var o = r.center;
        foreach (var s in strokes) Band(vh, s, o);
    }

    void Band(VertexHelper vh, Stroke s, Vector2 o)
    {
        var p = new List<Vector2>();
        foreach (var q in s.Points)
            if (p.Count == 0 || Vector2.Distance(p[p.Count - 1], q) > 1e-3f) p.Add(q + o);
        float h = s.Width / 2;
        Color32 c = s.Colour;
        if (p.Count < 2)
        {
            if (p.Count == 1) Cap(vh, p[0], Vector2.right, h, c, true);
            return;
        }
        // The band: two edges either side of the path, mitred at each joint.
        int start = vh.currentVertCount;
        for (int i = 0; i < p.Count; i++)
        {
            Vector2 n;
            float k = 1;
            if (i == 0) n = Normal(p[1] - p[0]);
            else if (i == p.Count - 1) n = Normal(p[i] - p[i - 1]);
            else
            {
                var n0 = Normal(p[i] - p[i - 1]);
                var n1 = Normal(p[i + 1] - p[i]);
                n = (n0 + n1).sqrMagnitude < 1e-6f ? n0 : (n0 + n1).normalized;
                k = 1 / Mathf.Max(0.25f, Vector2.Dot(n, n0));
            }
            vh.AddVert(p[i] + n * h * k, c, Vector4.zero);
            vh.AddVert(p[i] - n * h * k, c, Vector4.zero);
            if (i > 0)
            {
                int a = start + 2 * (i - 1);
                vh.AddTriangle(a, a + 2, a + 1);
                vh.AddTriangle(a + 1, a + 2, a + 3);
            }
        }
        // Round caps at the two ends, beyond them.
        Cap(vh, p[0], (p[0] - p[1]).normalized, h, c, false);
        Cap(vh, p[p.Count - 1], (p[p.Count - 1] - p[p.Count - 2]).normalized, h, c, false);
    }

    static Vector2 Normal(Vector2 d)
    {
        d.Normalize();
        return new Vector2(-d.y, d.x);
    }

    /// <summary>A half disc beyond the end at `at`, facing `dir` (or a whole one, a dot).</summary>
    static void Cap(VertexHelper vh, Vector2 at, Vector2 dir, float h, Color32 c, bool whole)
    {
        const int n = 8;
        int centre = vh.currentVertCount;
        vh.AddVert(at, c, Vector4.zero);
        float a0 = Mathf.Atan2(dir.y, dir.x) - (whole ? Mathf.PI : Mathf.PI / 2), span = whole ? 2 * Mathf.PI : Mathf.PI;
        int steps = whole ? 2 * n : n;
        for (int i = 0; i <= steps; i++)
        {
            float a = a0 + span * i / steps;
            vh.AddVert(at + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * h, c, Vector4.zero);
            if (i > 0) vh.AddTriangle(centre, centre + i, centre + i + 1);
        }
    }
}
