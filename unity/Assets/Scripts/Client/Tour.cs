using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using K = MenuKit;

/// <summary>
/// A guided tour (tour.ts startTour): the oracle talking a screen through a step at a time while the part he talks
/// about is lit (the rest of the screen dimmed) and outlined. What is lit is the shape it really has on screen, traced
/// in its own plane (a slot on the tilted board lit as the trapezoid it appears as, a sun's place as the ellipse it
/// is), and traced again every 250 ms, so the light follows what moves. A step whose shapes aren't on screen is passed
/// over. Laid in a canvas in the web's CSS pixels (Hud.CssCanvas), over all of it, taking every tap.
/// </summary>
public class Tour : MonoBehaviour
{
    /// <summary>A step: its words, and the outlines of what it lights on the page (CSS px, from its top left), as they stand now (none given: it lights nothing).</summary>
    public class Step
    {
        public string Text;
        public System.Func<List<Vector2[]>> Shapes;
    }

    static Tour active;

    /// <summary>Whether a tour is showing (the game holds still meanwhile).</summary>
    public static bool Showing => active != null;

    /// <summary>
    /// Whether the tour has the keys this frame (tour.ts takes them first, in the capture phase, and stops them): while
    /// it shows, and on the frame a key of its closed it, so that key does nothing else (Escape opening the menu,
    /// Enter ending the day).
    /// </summary>
    public static bool HasKeys => active != null || Time.frameCount == closedFrame;
    static int closedFrame = -1;

    List<Step> steps;
    int at;
    System.Action onEnd;
    RectTransform root, bubble, bar;
    RawImage veil;
    TourLines lines;
    TextMeshProUGUI words;
    float traced = -1, dim = 0.58f, closedAt = -1, bubbleBorn;
    Vector2 bubbleFrom, bubbleTo;
    float bubbleMoved = -1;
    string drawnKey;
    Texture2D veilTex;

    /// <summary>
    /// Show a tour over `canvas` (a canvas in CSS pixels): its steps, its speaker's `face`; `onEnd` told when it closes.
    /// None while another shows (null then).
    /// </summary>
    public static Tour Show(Transform canvas, List<Step> steps, Texture face, System.Action onEnd = null)
    {
        if (active != null) return null;
        var r = Hud.Rect(canvas, "Tour");
        Hud.Fill(r);
        var t = r.gameObject.AddComponent<Tour>();
        active = t;
        t.root = r;
        t.steps = steps;
        t.onEnd = onEnd;
        t.Build(face);
        t.Draw();
        return t;
    }

    /// <summary>The tour's layer (.tour: inset 0, over all): the veil and its holes, the outlines, the bubble, the bar.</summary>
    void Build(Texture face)
    {
        var g = root.gameObject.AddComponent<CanvasGroup>();
        g.blocksRaycasts = true;
        // (The whole screen takes the taps: the game below holds still.)
        var hit = root.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        var v = Hud.Rect(root, "Veil");
        Hud.Fill(v);
        veil = v.gameObject.AddComponent<RawImage>();
        veil.raycastTarget = false;
        var l = Hud.Rect(root, "Lines");
        Hud.Fill(l);
        l.gameObject.AddComponent<CanvasRenderer>();
        lines = l.gameObject.AddComponent<TourLines>();
        lines.raycastTarget = false;

        // The bubble (.tour-bubble): min(300px, 100% - 32px) across, white, corners 18, padded 12 by 14, its face (34)
        // and its words (Exo 2 0.82rem, lines 1.4 apart, ink, 10 clear on the right) 12 apart; a shadow 0 10px 30px.
        var b = Hud.Box(root, "Bubble", Color.white, 18);
        Hud.Shadow(b, 18, new Hud.Drop(Hud.Rgba(20, 20, 50, 0.22f), 10, 30));
        bubble = b.rectTransform;
        var faceR = Hud.Rect(bubble, "Face");
        var fm = faceR.gameObject.AddComponent<Image>();
        fm.sprite = Hud.Circle;
        fm.raycastTarget = false;
        faceR.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var pic = Hud.Rect(faceR, "Picture");
        Hud.Fill(pic);
        var pi = pic.gameObject.AddComponent<RawImage>();
        pi.texture = face;
        pi.raycastTarget = false;
        words = K.Words(bubble, "", 0, 0, 10, 10, 0.82f * K.Rem, Look.Ink, false, 400, 0, TextAlignmentOptions.Left);
        words.textWrappingMode = TextWrappingModes.Normal;
        words.lineSpacing = (1.4f - 1.2f) * 100;
        words.raycastTarget = false;
        bubbleBorn = Time.unscaledTime;

        bar = Hud.Box(root, "Bar", Color.white, 22).rectTransform;
        Hud.Shadow(bar.GetComponent<Image>(), 22, new Hud.Drop(Hud.Rgba(20, 20, 50, 0.22f), 8, 24));
    }

    /// <summary>The steps with something of theirs on screen (or nothing to light), and each one's outlines now.</summary>
    List<(Step step, List<Vector2[]> polys)> Shown()
    {
        var list = new List<(Step, List<Vector2[]>)>();
        foreach (var s in steps)
        {
            var polys = s.Shapes != null ? (s.Shapes() ?? new List<Vector2[]>()).Where(p => p != null && p.Length >= 3).ToList() : new List<Vector2[]>();
            if (s.Shapes == null || polys.Count > 0) list.Add((s, polys));
        }
        return list;
    }

    void Draw()
    {
        if (closedAt >= 0) return;
        traced = Time.unscaledTime;
        var list = Shown();
        if (list.Count == 0) { Close(); return; }
        at = Mathf.Min(at, list.Count - 1);
        var (step, polys) = list[at];
        float W = K.W, H = K.H;
        // (The holes: each outline grown by the mask's stroke, 10 wide, so 5 out.)
        string key = string.Join(";", polys.Select(p => string.Join(",", p.Select(q => $"{Mathf.RoundToInt(q.x)} {Mathf.RoundToInt(q.y)}")))) + $"|{W}x{H}";
        if (key != drawnKey)
        {
            drawnKey = key;
            Veil(polys.Select(p => Grow(p, 5)).ToList(), W, H);
            lines.Outlines = polys;
        }
        // (Nothing lit: the screen dimmed less: .tour-open.)
        dim = polys.Count == 0 ? 0.4f : 0.58f;
        words.text = step.Text;
        Bar(list.Count);
        Place(polys.SelectMany(p => p).ToList(), W, H);
    }

    // ---- The veil: the screen dimmed (rgba(22, 24, 44, 0.58)), but for the holes ----

    /// <summary>The veil drawn afresh at half the page's pixels, its holes' edges smoothed (each row sampled four times down, the edges' share across).</summary>
    void Veil(List<Vector2[]> holes, float W, float H)
    {
        int w = Mathf.Max(1, Mathf.CeilToInt(W / 2)), h = Mathf.Max(1, Mathf.CeilToInt(H / 2));
        if (veilTex == null || veilTex.width != w || veilTex.height != h)
        {
            if (veilTex != null) Destroy(veilTex);
            veilTex = new Texture2D(w, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            veil.texture = veilTex;
        }
        var px = new Color32[w * h];
        var cover = new float[w];
        var xs = new List<float>();
        for (int j = 0; j < h; j++)
        {
            System.Array.Clear(cover, 0, w);
            for (int sub = 0; sub < 4; sub++)
            {
                // (Texture rows from the foot up; the page's y down.)
                float y = (h - 1 - j + (sub + 0.5f) / 4) * 2;
                foreach (var poly in holes)
                {
                    xs.Clear();
                    for (int k = 0; k < poly.Length; k++)
                    {
                        var a = poly[k];
                        var b = poly[(k + 1) % poly.Length];
                        if ((a.y <= y) == (b.y <= y)) continue;
                        xs.Add(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
                    }
                    xs.Sort();
                    for (int k = 0; k + 1 < xs.Count; k += 2)
                    {
                        // (The span in texels, its two ends covered in part.)
                        float x0 = xs[k] / 2, x1 = xs[k + 1] / 2;
                        int i0 = Mathf.Max(0, Mathf.FloorToInt(x0)), i1 = Mathf.Min(w - 1, Mathf.FloorToInt(x1));
                        for (int i = i0; i <= i1; i++)
                        {
                            float c = Mathf.Clamp01(Mathf.Min(i + 1, x1) - Mathf.Max(i, x0));
                            cover[i] = Mathf.Min(4, cover[i] + c);
                        }
                    }
                }
            }
            for (int i = 0; i < w; i++) px[j * w + i] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(255 * (1 - Mathf.Clamp01(cover[i] / 4))));
        }
        veilTex.SetPixels32(px);
        veilTex.Apply();
    }

    /// <summary>An outline grown `by` outward (each point along its corner's outward normal).</summary>
    static Vector2[] Grow(Vector2[] p, float by)
    {
        int n = p.Length;
        float area = 0;
        for (int i = 0; i < n; i++) area += p[i].x * p[(i + 1) % n].y - p[(i + 1) % n].x * p[i].y;
        // (y down: a positive area runs clockwise on screen; the outward normal is to the left of the way round.)
        float side = area > 0 ? -1 : 1;
        var o = new Vector2[n];
        for (int i = 0; i < n; i++)
        {
            var d0 = (p[i] - p[(i - 1 + n) % n]).normalized;
            var d1 = (p[(i + 1) % n] - p[i]).normalized;
            var nrm = new Vector2(d0.y + d1.y, -(d0.x + d1.x));
            o[i] = p[i] + (nrm.sqrMagnitude > 1e-6f ? nrm.normalized : Vector2.zero) * by * side;
        }
        return o;
    }

    // ---- The bar (.tour-bar): back, the steps as dots, next (or done, or ok), skip; along the top middle ----

    string barKey;

    void Bar(int count)
    {
        // (Made again only when the step or the steps shown change: a button is never pulled from under a press.)
        string key = $"{count}:{at}:{K.W}:{K.SaT}";
        if (key == barKey) return;
        barKey = key;
        foreach (Transform c in bar) Mats.Kill(c.gameObject);
        // (Its buttons 32 tall, at least 32 across, round; 10 apart, padded 6 8 6 10.)
        string next = (at == count - 1 ? (count == 1 ? "ok" : "done") : "next").ToUpperInvariant();
        float nextF = 0.66f * K.Rem, nextW = Mathf.Max(32, K.TextW(next, nextF, 400, 0.24f) + 0.24f * nextF + 36);
        float dotsW = count < 2 ? 0 : count * 5 + (count - 1) * 5;
        float w = 10 + 32 + 10 + dotsW + 10 + nextW + 10 + 32 + 8, h = 6 + 32 + 6;
        Hud.Place(bar, (K.W - w) / 2, Mathf.Max(12, K.SaT), w, h);
        float x = 10;
        // Back: hidden (keeping its place) on the first step.
        var back = Round(bar, "‹", x, 1.1f * K.Rem, Look.InkSoft, () => Go(-1));
        back.gameObject.SetActive(at > 0);
        x += 32 + 10;
        for (int i = 0; i < count && count >= 2; i++)
        {
            var d = Hud.Box(bar, "Dot", i == at ? Hud.Rgba(111, 95, 192) : i < at ? Hud.Rgba(201, 194, 234) : Hud.Rgba(226, 224, 234), 2.5f);
            Hud.Place(d.rectTransform, x + i * 10, 6 + 16 - 2.5f, 5, 5);
        }
        x += dotsW + 10;
        // Next (.tour-next): white on #6f5fc0, its word 0.66rem spaced 0.24em, padded 0 18; #5d4fb0 under a mouse.
        var nb = Hud.Box(bar, "Next", Hud.Rgba(111, 95, 192), 16);
        Hud.Place(nb.rectTransform, x, 6, nextW, 32);
        nb.raycastTarget = true;
        nb.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); Go(1); });
        K.Fill(nb.transform, next, nextF, Color.white, true, 400, 0.24f);
        MenuHover.On(nb.gameObject, on => nb.color = on ? Hud.Rgba(93, 79, 176) : Hud.Rgba(111, 95, 192), null, null);
        x += nextW + 10;
        // Skip (×, ink-faint 0.95rem): only this tour's words.
        Round(bar, "×", x, 0.95f * K.Rem, Look.InkFaint, Close);
    }

    /// <summary>A round button of the bar's (32 across, clear; #f3f2f8 and ink under a mouse), its mark in Exo 2.</summary>
    static Image Round(RectTransform bar, string mark, float x, float size, Color ink, System.Action act)
    {
        var b = Hud.Box(bar, mark, new Color(1, 1, 1, 0), 16);
        Hud.Place(b.rectTransform, x, 6, 32, 32);
        b.raycastTarget = true;
        b.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); act(); });
        var t = K.Fill(b.transform, mark, size, ink, false, 400);
        MenuHover.On(b.gameObject, on => { b.color = on ? Hud.Rgba(243, 242, 248) : new Color(1, 1, 1, 0); t.color = on ? Look.Ink : ink; }, null, null);
        return b;
    }

    // ---- The bubble beside what is lit ----

    /// <summary>
    /// The bubble placed (tour.ts place): below what is lit if there's room (18 off), else above, else to a side, else
    /// near the foot; nothing lit, in the middle. Kept 8 inside the page, and below the bar (64 down at least). It glides
    /// to a new place (0.3 s, cubic-bezier(.2, .8, .2, 1)); new, it rises 8 into place (0.3 s, ease-out).
    /// </summary>
    void Place(List<Vector2> pts, float W, float H)
    {
        float bw = Mathf.Min(300, W - 32);
        float textW = bw - 28 - 34 - 12 - 10;
        float fs = 0.82f * K.Rem;
        float th = Mathf.Max(fs * 1.4f, words.GetPreferredValues(words.text, textW, 0).y);
        float bh = Mathf.Max(34, th) + 24;
        Hud.Place((RectTransform)bubble.Find("Face"), 14, (bh - 34) / 2, 34, 34);
        Hud.Place(words.rectTransform, 14 + 34 + 12, (bh - th) / 2, textW, th);
        const float gap = 18;
        float x = (W - bw) / 2, y = (H - bh) / 2;
        if (pts.Count > 0)
        {
            float l = pts.Min(p => p.x), r = pts.Max(p => p.x), t = pts.Min(p => p.y), b = pts.Max(p => p.y), mid = (l + r) / 2;
            if (b + gap + bh <= H - 8) { x = mid - bw / 2; y = b + gap; }
            else if (t - gap - bh >= 8) { x = mid - bw / 2; y = t - gap - bh; }
            else if (r + gap + bw <= W - 8) { x = r + gap; y = (t + b) / 2 - bh / 2; }
            else if (l - gap - bw >= 8) { x = l - gap - bw; y = (t + b) / 2 - bh / 2; }
            else { x = (W - bw) / 2; y = Mathf.Max(8, H - bh - 24); }
        }
        var to = new Vector2(Mathf.Round(Mathf.Max(8, Mathf.Min(W - bw - 8, x))), Mathf.Round(Mathf.Max(64, Mathf.Min(H - bh - 8, y))));
        bubble.sizeDelta = new Vector2(bw, bh);
        if (bubbleMoved < 0) { bubbleFrom = bubbleTo = to; bubbleMoved = 0; }
        else if (to != bubbleTo)
        {
            bubbleFrom = BubbleAt();
            bubbleTo = to;
            bubbleMoved = Time.unscaledTime;
        }
        Hud.Place(bubble, BubbleAt().x, BubbleAt().y, bw, bh);
    }

    Vector2 BubbleAt()
    {
        float k = bubbleMoved <= 0 ? 1 : MenuView.Bezier(0.2f, 0.8f, 0.2f, 1, Mathf.Clamp01((Time.unscaledTime - bubbleMoved) / 0.3f));
        var p = Vector2.Lerp(bubbleFrom, bubbleTo, k);
        // (Its way in: from 8 below.)
        float rise = 1 - MenuView.Bezier(0, 0, 0.58f, 1, Mathf.Clamp01((Time.unscaledTime - bubbleBorn) / 0.3f));
        return p + new Vector2(0, 8 * rise);
    }

    // ---- Going through it ----

    void Go(int by)
    {
        int n = Shown().Count;
        if (at + by >= n) { closedFrame = Time.frameCount; Close(); return; }
        at = Mathf.Max(0, at + by);
        Draw();
    }

    /// <summary>Close the tour (finished or not): it fades away (0.25 s), taking no more taps.</summary>
    public void Close()
    {
        if (closedAt >= 0) return;
        closedAt = Time.unscaledTime;
        if (active == this) active = null;
        root.GetComponent<CanvasGroup>().blocksRaycasts = false;
        onEnd?.Invoke();
    }

    void Update()
    {
        if (closedAt >= 0)
        {
            float k = Mathf.Clamp01((Time.unscaledTime - closedAt) / 0.25f);
            root.GetComponent<CanvasGroup>().alpha = 1 - k;
            if (k >= 1) Mats.Kill(gameObject);
            return;
        }
        // Enter, Space or → on; ← back; Escape closes.
        if (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter) || Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.RightArrow)) Go(1);
        else if (Input.GetKeyDown(KeyCode.LeftArrow)) Go(-1);
        else if (Input.GetKeyDown(KeyCode.Escape)) { closedFrame = Time.frameCount; Close(); }
        if (closedAt >= 0) return;
        // (Over all of the screen, whatever is laid on it after: z-index 9500.)
        if (transform.GetSiblingIndex() != transform.parent.childCount - 1) transform.SetAsLastSibling();
        // (Things on the board move, cards land, the page resizes: the outlines follow.)
        if (Time.unscaledTime - traced >= 0.25f) Draw();
        // (The dim eases to its depth: 0.3 s.)
        var c = new Color(22 / 255f, 24 / 255f, 44 / 255f, Mathf.MoveTowards(veil.color.a, dim, Time.unscaledDeltaTime / 0.3f * 0.18f));
        veil.color = c;
        var p = BubbleAt();
        Hud.Place(bubble, p.x, p.y, bubble.sizeDelta.x, bubble.sizeDelta.y);
    }

    void Start() => veil.color = new Color(22 / 255f, 24 / 255f, 44 / 255f, dim);

    void OnDestroy()
    {
        if (active == this) active = null;
        if (veilTex != null) Destroy(veilTex);
    }
}

/// <summary>
/// The tour's outlines (.tour-glow, .tour-line): each a soft glow (#b9a6ff, 9 wide and blurred 4, at 65%, breathing to
/// 14 wide at 25% and back every 1.6 s, eased in and out) under a white line 2.4 wide, round at its joints.
/// </summary>
[RequireComponent(typeof(CanvasRenderer))]
public class TourLines : MaskableGraphic
{
    List<Vector2[]> outlines = new List<Vector2[]>();

    /// <summary>The outlines, in the page's CSS pixels from its top left.</summary>
    public List<Vector2[]> Outlines
    {
        set { outlines = value ?? new List<Vector2[]>(); SetVerticesDirty(); }
    }

    void Update()
    {
        if (outlines.Count > 0) SetVerticesDirty();
    }

    protected override void OnPopulateMesh(VertexHelper vh)
    {
        vh.Clear();
        var r = rectTransform.rect;
        // (tour-pulse: 1.6 s each way, ease-in-out.)
        float t = Time.unscaledTime / 1.6f, tri = t % 2 < 1 ? t % 1 : 1 - t % 1;
        float k = MenuView.Bezier(0.42f, 0, 0.58f, 1, tri);
        float glowW = Mathf.Lerp(9, 14, k), glowA = Mathf.Lerp(0.65f, 0.25f, k);
        // (A stroke blurred by 4: its middle as strong as the blur leaves it, fading out 8 beyond each side.)
        float core = Erf(glowW / 2 / (4 * 1.41421f));
        Color glow = new Color(185 / 255f, 166 / 255f, 255 / 255f, glowA * core), clear = new Color(185 / 255f, 166 / 255f, 255 / 255f, 0);
        foreach (var o in outlines)
        {
            var pts = o.Select(p => new Vector2(r.xMin + p.x, r.yMax - p.y)).ToArray();
            float h = glowW / 2;
            Band(vh, pts, new[] { -(h + 8), -Mathf.Max(0, h - 4), Mathf.Max(0, h - 4), h + 8 }, new[] { clear, glow, glow, clear });
        }
        Color white = Color.white, none = new Color(1, 1, 1, 0);
        foreach (var o in outlines)
        {
            var pts = o.Select(p => new Vector2(r.xMin + p.x, r.yMax - p.y)).ToArray();
            Band(vh, pts, new[] { -1.7f, -0.7f, 0.7f, 1.7f }, new[] { none, white, white, none });
        }
    }

    /// <summary>A closed band round `p`: a ring at each offset across it (each its colour), joined round the way.</summary>
    static void Band(VertexHelper vh, Vector2[] p, float[] offs, Color[] cols)
    {
        int n = p.Length, m = offs.Length, start = vh.currentVertCount;
        for (int i = 0; i < n; i++)
        {
            var d0 = (p[i] - p[(i - 1 + n) % n]).normalized;
            var d1 = (p[(i + 1) % n] - p[i]).normalized;
            var n0 = new Vector2(-d0.y, d0.x);
            var nn = new Vector2(-(d0.y + d1.y), d0.x + d1.x);
            nn = nn.sqrMagnitude < 1e-6f ? n0 : nn.normalized;
            // (Mitred, but never far: a sharp corner is kept round-ish.)
            float mk = 1 / Mathf.Max(0.5f, Vector2.Dot(nn, n0));
            for (int j = 0; j < m; j++) vh.AddVert(p[i] + nn * offs[j] * mk, cols[j], Vector4.zero);
        }
        for (int i = 0; i < n; i++)
        {
            int a = start + i * m, b = start + ((i + 1) % n) * m;
            for (int j = 0; j + 1 < m; j++)
            {
                vh.AddTriangle(a + j, b + j, b + j + 1);
                vh.AddTriangle(a + j, b + j + 1, a + j + 1);
            }
        }
    }

    /// <summary>The error function (Abramowitz and Stegun 7.1.26).</summary>
    static float Erf(float x)
    {
        float t = 1 / (1 + 0.3275911f * x);
        return 1 - (((((1.061405429f * t - 1.453152027f) * t) + 1.421413741f) * t - 0.284496736f) * t + 0.254829592f) * t * Mathf.Exp(-x * x);
    }
}
