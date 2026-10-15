using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// fx.ts Beam: an arc from one rectangle to another (or to the pointer), hairline where it leaves and widening towards
/// its head, in layers (a soft halo, a translucent body in the beam's colour, a white-hot core, a highlight along its
/// upper side) and a rounded diamond head; faded in from its source. Red for an attack, blue for cooling, white for
/// anything else. Drawn on a CSS canvas in the page's pixels (y down), as the web's SVG is.
/// </summary>
public class Beam : MaskableGraphic
{
    public enum Kind { Attack, Cool, Plain }

    struct Layer { public float scale, head, opacity; public int colour; public bool glow; }

    // BEAM_LAYERS, outside in, with their CSS (.bl-glow … .bl-core): each a ribbon and head, filled in its --l colour.
    static readonly Layer[] Layers =
    {
        new Layer { scale = 2.2f, head = 1.35f, opacity = 0.4f, colour = 0, glow = true },
        new Layer { scale = 1.15f, head = 1.08f, opacity = 0.6f, colour = 1 },
        new Layer { scale = 0.92f, head = 0.92f, opacity = 1f, colour = 2 },
        new Layer { scale = 0.62f, head = 0.7f, opacity = 0.9f, colour = 3 },
        new Layer { scale = 0.36f, head = 0.48f, opacity = 0.9f, colour = 4 },
        new Layer { scale = 0.16f, head = 0.26f, opacity = 1f, colour = 5 },
    };

    static readonly Dictionary<Kind, string[]> Colours = new Dictionary<Kind, string[]>
    {
        [Kind.Attack] = new[] { "#ff2a12", "#d41e12", "#ee3220", "#ff5a2e", "#ffb08a", "#fff4ec" },
        [Kind.Cool] = new[] { "#1e8cff", "#1564dc", "#2a88f2", "#4fb0ff", "#b4e2ff", "#f6fcff" },
        [Kind.Plain] = new[] { "#b9c6e4", "#8a97b6", "#a9b5cf", "#c9d3e8", "#edf1f9", "#ffffff" },
    };

    Kind kind;
    float bowShare;
    Rect from, to;
    float progress;
    bool shown;
    Color[] palette;

    /// <summary>A beam on a canvas laid out in the page's pixels (its top left the page's).</summary>
    public static Beam Make(Transform parent, Kind kind, float bowShare = 0.36f)
    {
        var r = Hud.Rect(parent, "Beam");
        r.anchorMin = Vector2.zero;
        r.anchorMax = Vector2.one;
        r.offsetMin = r.offsetMax = Vector2.zero;
        r.pivot = new Vector2(0, 1);
        var b = r.gameObject.AddComponent<Beam>();
        b.kind = kind;
        b.bowShare = bowShare;
        b.raycastTarget = false;
        b.palette = new Color[6];
        for (int i = 0; i < 6; i++) ColorUtility.TryParseHtmlString(Colours[kind][i], out b.palette[i]);
        return b;
    }

    /// <summary>Lay the beam from one rectangle to another (page pixels, y down), drawn out to `progress` of its length.</summary>
    public void Draw(Rect a, Rect b, float progress = 1)
    {
        from = a;
        to = b;
        this.progress = progress;
        shown = true;
        SetVerticesDirty();
    }

    /// <summary>To the pointer (pointerAim: a point two pixels across).</summary>
    public void To(Rect a, Vector2 at) => Draw(a, new Rect(at.x - 1, at.y - 1, 2, 2));

    public void Hide()
    {
        shown = false;
        SetVerticesDirty();
    }

    // ---- The geometry, as Beam.draw lays it ----

    Vector2 p0, c, p1;
    Vector2 At(float t)
    {
        float u = 1 - t;
        return u * u * p0 + 2 * u * t * c + t * t * p1;
    }

    static Vector2 Edge(Rect r, Vector2 o, Vector2 toward, float gap)
    {
        var d = toward - o;
        float len = d.magnitude;
        if (len == 0) return o;
        var u = d / len;
        float t = Mathf.Min(u.x != 0 ? r.width / 2 / Mathf.Abs(u.x) : float.PositiveInfinity, u.y != 0 ? r.height / 2 / Mathf.Abs(u.y) : float.PositiveInfinity);
        float k = Mathf.Min(t + gap, len * 0.9f);
        return o + u * k;
    }

    // The fade from the source (the mask's gradient: clear at the source, whole from 28% of the way to the head).
    Vector2 fadeA, fadeB;
    float Fade(Vector2 p)
    {
        var ab = fadeB - fadeA;
        float l2 = ab.sqrMagnitude;
        float t = l2 > 0 ? Vector2.Dot(p - fadeA, ab) / l2 : 1;
        return Mathf.Clamp01(t / 0.28f);
    }

    protected override void OnPopulateMesh(VertexHelper vh)
    {
        vh.Clear();
        if (!shown) return;
        var a = from.center;
        var b = to.center;
        var d = b - a;
        float len = d.magnitude;
        if (len < 0.001f) len = 1;
        float bow = Mathf.Min(200, len * bowShare);
        // Bow upwards-ish (to the left of the direction of travel), and a little higher, as an arc thrown.
        c = new Vector2((a.x + b.x) / 2 - d.y / len * bow, (a.y + b.y) / 2 + d.x / len * bow - bow * 0.35f);
        p0 = Edge(from, a, c, 5);
        p1 = Edge(to, b, c, 4);
        float end = Mathf.Max(0.02f, progress);
        var h = At(end);
        fadeA = p0;
        fadeB = h;
        float W = Mathf.Max(5, Mathf.Min(8, len / 45));
        var h0 = At(Mathf.Max(0, end - 0.02f));
        float ang = Mathf.Atan2(h.y - h0.y, h.x - h0.x);
        float cos = Mathf.Cos(ang), sin = Mathf.Sin(ang);
        float HL = W * 2.6f;
        foreach (var l in Layers)
        {
            // (Its blur: 3 for the halo, 0.55 for the rest, a feathered edge as wide.)
            float blur = l.glow ? 3f : 0.55f;
            var col = palette[l.colour];
            col.a = l.opacity;
            Ribbon(vh, end, W, l.scale, 0, false, col, blur);
            Head(vh, h, cos, sin, HL, W, l.head, col, blur);
        }
        // A highlight along the upper side of the tube, where the light catches it.
        Ribbon(vh, end, W, 0.12f, 0.2f, true, new Color(1, 1, 1, 0.55f), 0.55f);
    }

    /// <summary>A ribbon along the arc, `scale` of the beam's width, pushed `shift` widths aside (`fade`: narrowing at its end).</summary>
    void Ribbon(VertexHelper vh, float end, float W, float scale, float shift, bool fade, Color col, float blur)
    {
        const int n = 30;
        float f = blur * 1.5f;
        int start = vh.currentVertCount;
        for (int i = 0; i <= n; i++)
        {
            float t = (float)i / n * end;
            var p = At(t);
            var q = At(Mathf.Min(1, t + 0.01f));
            var dir = q - p;
            float tl = dir.magnitude;
            if (tl == 0) tl = 1;
            var nrm = new Vector2(-dir.y / tl, dir.x / tl);
            // Fine at the start, swelling towards the head (eased, so most of the width comes late).
            float full = (0.15f + 0.85f * Mathf.Pow((float)i / n, 1.3f)) * W * (fade ? Mathf.Min(1, (n - i) / 6f) : 1);
            float w = full * scale * 0.5f, o = full * shift;
            // (Blurred: its edge feathered over the blur, and a line narrower than the blur fainter for it.)
            float peak = Mathf.Clamp01(w * 2 / (2 * f) + 0.15f);
            float inner = Mathf.Max(0, w - f / 2), outer = w + f / 2;
            float k = Fade(p);
            var mid = p + nrm * o;
            Vert(vh, mid + nrm * outer, col, 0);
            Vert(vh, mid + nrm * inner, col, peak * k);
            Vert(vh, mid - nrm * inner, col, peak * k);
            Vert(vh, mid - nrm * outer, col, 0);
        }
        for (int i = 0; i < n; i++)
        {
            int r0 = start + i * 4, r1 = r0 + 4;
            for (int s = 0; s < 3; s++)
            {
                vh.AddTriangle(r0 + s, r1 + s, r1 + s + 1);
                vh.AddTriangle(r0 + s, r1 + s + 1, r0 + s + 1);
            }
        }
    }

    /// <summary>The arrowhead, `k` of its full size: a diamond, its widest points well forward, its back drawn out along the line.</summary>
    void Head(VertexHelper vh, Vector2 h, float cos, float sin, float HL, float W, float k, Color col, float blur)
    {
        float l = HL * k, w = W * 1.15f * k;
        Vector2 Pt(float fwd, float side) => new Vector2(h.x + cos * fwd - sin * side, h.y + sin * fwd + cos * side);
        var tip = Pt(l * 0.55f, 0);
        var back = Pt(-l * 0.45f, 0);
        var left = Pt(-l * 0.02f, w);
        var right = Pt(-l * 0.02f, -w);
        var outline = new List<Vector2>();
        void Quad(Vector2 a, Vector2 ctl, Vector2 b)
        {
            for (int i = 0; i < 8; i++)
            {
                float t = i / 8f, u = 1 - t;
                outline.Add(u * u * a + 2 * u * t * ctl + t * t * b);
            }
        }
        Quad(tip, Pt(l * 0.2f, w * 0.62f), left);
        Quad(left, Pt(-l * 0.2f, w * 0.55f), back);
        Quad(back, Pt(-l * 0.2f, -w * 0.55f), right);
        Quad(right, Pt(l * 0.2f, -w * 0.62f), tip);
        var centre = Pt(l * 0.05f, 0);
        float f = blur * 1.5f;
        float peak = Mathf.Clamp01(w / f + 0.15f);
        int start = vh.currentVertCount;
        Vert(vh, centre, col, peak * Fade(centre));
        foreach (var p in outline)
        {
            var dir = p - centre;
            float m = dir.magnitude;
            var u = m > 0 ? dir / m : Vector2.zero;
            float k2 = Fade(p);
            Vert(vh, centre + u * Mathf.Max(0, m - f / 2), col, peak * k2);
            Vert(vh, centre + u * (m + f / 2), col, 0);
        }
        int n = outline.Count;
        for (int i = 0; i < n; i++)
        {
            int a = start + 1 + i * 2, b = start + 1 + ((i + 1) % n) * 2;
            vh.AddTriangle(start, a, b);
            vh.AddTriangle(a, a + 1, b + 1);
            vh.AddTriangle(a, b + 1, b);
        }
    }

    static void Vert(VertexHelper vh, Vector2 page, Color col, float alpha)
    {
        var c = col;
        c.a *= alpha;
        // (The page's y runs down; the canvas's up, from its top left.)
        vh.AddVert(new Vector3(page.x, -page.y, 0), c, Vector2.zero);
    }
}
