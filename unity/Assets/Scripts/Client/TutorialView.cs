using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using K = MenuKit;

/// <summary>
/// The tutorial (puzzles.ts tutorialPage): the branch of lessons with Oriel at its root (the trunk, the core forking
/// into holding on and the four races, the Lost Races' crown above), and the lesson picked, waiting to begin.
/// </summary>
public class TutorialView : MonoBehaviour, MenuView.IRedraw
{
    /// <summary>Where each lesson sits on the branch, in a 100 × 64 box.</summary>
    static readonly Dictionary<string, Vector2> At = new Dictionary<string, Vector2>
    {
        ["sun"] = new Vector2(50, 50), ["energy"] = new Vector2(50, 42), ["guard"] = new Vector2(50, 34), ["breach"] = new Vector2(50, 26),
        ["shields"] = new Vector2(39, 23), ["cooling"] = new Vector2(29, 19), ["removal"] = new Vector2(19, 16), ["traps"] = new Vector2(9, 13),
        ["forge"] = new Vector2(61, 23), ["overheat"] = new Vector2(71, 19), ["growth"] = new Vector2(81, 16), ["heroes"] = new Vector2(91, 13),
        ["dusk"] = new Vector2(96, 7), ["darkspeed"] = new Vector2(50, 16), ["consume"] = new Vector2(39, 11), ["erode"] = new Vector2(61, 11),
        ["spend"] = new Vector2(28, 6), ["bulwark"] = new Vector2(72, 6), ["ahead"] = new Vector2(50, 4),
    };

    RectTransform root;
    MenuView menu;
    string picked;

    public static TutorialView Make(RectTransform parent, MenuView menu)
    {
        var r = Hud.Rect(parent, "Tutorial");
        Hud.Fill(r);
        var v = r.gameObject.AddComponent<TutorialView>();
        v.root = r;
        v.menu = menu;
        v.Draw();
        return v;
    }

    public void Redraw() => Draw();

    /// <summary>
    /// The page's frame (.menu-tutorial and .tut, shared with the challenges): padded max(14px, top) max(16px, right)
    /// max(12px, bottom) max(16px, left); back at its top left; its head centred (a line, 9.6 spaced 0.3em, over its
    /// name, clamp(19.2px, 5vh, 32px) spaced 0.4em); its foot at least 64 tall at the bottom, the picked one or a word
    /// in it; its rows 8 apart. Returns the box between head and foot: left, top, width, height.
    /// </summary>
    public static Rect Frame(RectTransform root, MenuView menu, string line, string title)
    {
        float l = Mathf.Max(16, K.SaL), t = Mathf.Max(14, K.SaT), r = K.W - Mathf.Max(16, K.SaR), b = K.H - Mathf.Max(12, K.SaB);
        float hf = K.Clamp(1.2f * K.Rem, 5 * K.Vh, 2 * K.Rem), lineH = K.LineH(9.6f), headH = lineH + 2 + K.LineH(hf);
        // (Centred with the spacing after their last letters, as the browser centres them: half of it to the left.)
        K.Words(root, line.ToUpperInvariant(), l - 0.15f * 9.6f, t, r - l, lineH, 9.6f, Look.InkFaint, true, 400, 0.3f);
        K.Words(root, title.ToUpperInvariant(), l - 0.2f * hf, t + lineH + 2, r - l, K.LineH(hf), hf, Look.Ink, true, 400, 0.4f);
        MenuView.BackButton(root, () => menu.Show("hub"), l, t);
        return new Rect(l, t + headH + 8, r - l, b - 64 - 8 - (t + headH + 8));
    }

    /// <summary>
    /// The foot (.tut-foot, 64 tall, centred): the one picked (.tut-pick: a line (8.32 spaced 0.24em) over its name
    /// (16 spaced 0.24em) over what it is (Exo 2 12.48), begin beside them, 18 on), or a word (.tut-hint: 9.92 spaced
    /// 0.24em, faint).
    /// </summary>
    public static void Foot(RectTransform root, string small, string name, string what, string go, System.Action begin, string hint)
    {
        float l = Mathf.Max(16, K.SaL), r = K.W - Mathf.Max(16, K.SaR), top = K.H - Mathf.Max(12, K.SaB) - 64, cx = (l + r) / 2;
        if (name == null)
        {
            K.Words(root, hint.ToUpperInvariant(), l - 0.12f * 9.92f, top + (64 - K.LineH(9.92f)) / 2, r - l, K.LineH(9.92f), 9.92f, Look.InkFaint, true, 400, 0.24f);
            return;
        }
        small = small.ToUpperInvariant();
        name = name.ToUpperInvariant();
        // (Its column as wide as its widest line, the spacing after the last letters counted; its lines 10, 20 and 15
        // tall, 2 apart; begin centred beside them.)
        float colW = Mathf.Max(K.TextW(small, 8.32f, 400, 0.24f) + 0.24f * 8.32f, K.TextW(name, 16, 400, 0.24f) + 0.24f * 16, K.TextW(what, 12.48f, 400, 0, false)) + 1;
        float bw = K.BtnW(go, K.Kind.Primary), x = cx - (colW + 18 + bw) / 2;
        float sh = K.LineH(8.32f), nh = K.LineH(16), wh = K.LineH(12.48f, false);
        float colH = sh + 2 + nh + 2 + wh, y = top + (64 - colH) / 2;
        K.Words(root, small, x, y, colW, sh, 8.32f, Look.InkFaint, true, 400, 0.24f, TextAlignmentOptions.Left);
        K.Words(root, name, x, y + sh + 2, colW, nh, 16, Look.Ink, true, 400, 0.24f, TextAlignmentOptions.Left);
        K.Words(root, what, x, y + sh + 2 + nh + 2, colW, wh, 12.48f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
        float bh = K.Measure(K.Kind.Primary).h;
        K.Btn(root, go, begin, x + colW + 18, top + (64 - bh) / 2, K.Kind.Primary, bw);
    }

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var done = Puzzles.LessonsDone;
        bool coreDone = Lessons.CoreLessons.All(done.Contains);
        var box = Frame(root, menu, "with oriel", "tutorial");
        // The branch (.tut-tree: clamp(10px, 4vh, 30px) under the head, at most 1.2 times the screen's height across,
        // centred; as tall as the row left it, running under the foot as the web's does). A lesson's point is its x%
        // across and y/64 down it.
        float mt = K.Clamp(10, 4 * K.Vh, 30), tw = Mathf.Min(box.width, 1.2f * Css.Screen.y), tx = box.x + (box.width - tw) / 2, ty = box.y + mt, th = box.height;
        System.Func<float, float, Vector2> map = (x, y) => new Vector2(tx + x / 100 * tw - K.W / 2, K.H / 2 - (ty + y / 64 * th));
        System.Func<string, Vector2> pt = id => { var p = At.TryGetValue(id, out var a) ? a : new Vector2(50, 50); return map(p.x, p.y); };

        // The links: each lesson to those before it (the crown from the trunk's top, once the core is done); a curve
        // through a point a unit above the lower end, as the web's path (2 wide; lit, gold and 3; open, dashed 4 5).
        var linesRect = Hud.Rect(root, "Links");
        Hud.Fill(linesRect);
        var lines = linesRect.gameObject.AddComponent<UiLines>();
        var gold = Hud.Rgba(214, 178, 94);
        lines.Add(new List<Vector2> { map(50, 59), pt("sun") }, gold, 3);
        foreach (var l in Lessons.All)
            foreach (var a in l.After)
            {
                var from = a == "core" ? At["breach"] : At.TryGetValue(a, out var fa) ? fa : new Vector2(50, 50);
                var to = At.TryGetValue(l.Id, out var ta) ? ta : new Vector2(50, 50);
                bool lit = done.Contains(l.Id), open = Lessons.LessonOpen(l.Id, done);
                var pts = UiLines.Curve(map(from.x, from.y), map((from.x + to.x) / 2, Mathf.Max(from.y, to.y) - 1), map(to.x, to.y));
                if (lit) lines.Add(pts, gold, 3);
                else if (open) lines.Add(pts, Hud.Rgba(95, 143, 196, 0.45f), 2, 4, 5);
                else if (a == "core") lines.Add(pts, Hud.Rgba(58, 66, 86, 0.16f), 2, 2, 6);
                else lines.Add(pts, Hud.Rgba(58, 66, 86, 0.16f), 2);
            }

        // The lessons (.tut-node): each a dot (clamp(26px, 6.4vh, 42px), its number 11.52) over its name
        // (clamp(8px, 1.7vh, 10.56px), spaced 0.16em), 4 apart, the two centred on its point.
        float d0 = K.Clamp(26, 6.4f * K.Vh, 42), nf = K.Clamp(8, 1.7f * K.Vh, 10.56f), nodeH = d0 + 4 + K.LineH(nf);
        for (int i = 0; i < Lessons.All.Count; i++)
        {
            var l = Lessons.All[i];
            bool isDone = done.Contains(l.Id), open = Lessons.LessonOpen(l.Id, done), on = picked == l.Id;
            var p = pt(l.Id);
            var node = Hud.Rect(root, l.Id);
            Hud.At(node, new Vector2(0.5f, 0.5f), p, new Vector2(160, nodeH));
            var group = node.gameObject.AddComponent<CanvasGroup>();
            bool locked = !open && !isDone;
            group.alpha = locked ? 0.5f : 1;
            // (Picked, the dot grows by 18% in a dark ring.)
            float d = on ? d0 * 1.18f : d0;
            var dot = Hud.Rect(node, "Dot");
            Hud.At(dot, new Vector2(0.5f, 1), new Vector2(0, -d0 / 2), new Vector2(d, d));
            dot.pivot = new Vector2(0.5f, 0.5f);
            var di = dot.gameObject.AddComponent<Image>();
            di.sprite = isDone ? DoneDot : Hud.Circle;
            di.color = l.Track == "advanced" && locked ? Hud.Rgba(236, 238, 243) : Color.white;
            if (locked)
            {
                // (The web fades the node as one, so its ring and shadow never show through the dot: the dot drawn
                // whole, as its white halfway over the paper, and its number at half.)
                var whole = dot.gameObject.AddComponent<CanvasGroup>();
                whole.ignoreParentGroups = true;
                whole.blocksRaycasts = false;
                di.color = Color.Lerp(di.color, Look.Paper, 0.5f);
            }
            var ring = on ? new Hud.Drop(Hud.Rgba(58, 66, 86), 0, 0, 3)
                : isDone ? new Hud.Drop(Hud.Rgba(150, 110, 30, 0.5f), 0, 0, 1)
                : open ? new Hud.Drop(Hud.Rgba(95, 143, 196), 0, 0, 2)
                : new Hud.Drop(Hud.Rgba(58, 66, 86, 0.2f), 0, 0, 1);
            Hud.Shadow(di, d / 2, ring);
            // (Its soft shadow drawn as the browser blurs a disc's: see Glow.)
            var glow = on ? new Hud.Drop(Hud.Rgba(40, 46, 70, 0.25f), 6, 18)
                : isDone ? new Hud.Drop(Hud.Rgba(230, 190, 90, 0.5f), 0, 14)
                : open ? new Hud.Drop(Hud.Rgba(95, 143, 196, 0.5f), 0, 16)
                : new Hud.Drop(Hud.Rgba(40, 46, 70, 0.1f), 4, 12);
            var halo = Glow(node, dot, d, glow);
            // (tutPulse: an open lesson's glow swelling and settling, 2.4 s.)
            if (open && !isDone && !on) dot.gameObject.AddComponent<Pulse>().Set(halo, dot, d);
            var ink = isDone ? Hud.Rgba(106, 74, 18) : open ? Look.Ink : Look.InkSoft;
            if (locked) ink.a *= 0.5f;
            K.Fill(dot, isDone ? "✓" : (i + 1).ToString(), 11.52f, ink, true, 400);
            K.Words(node, l.Name.ToUpperInvariant(), 0, d0 + 4, 160, K.LineH(nf), nf, Look.InkSoft, true, 400, 0.16f);
            if (open || isDone)
            {
                var id = l.Id;
                var b = dot.gameObject.AddComponent<Button>();
                b.targetGraphic = di;
                b.onClick.AddListener(() => { Sound.Play("hover"); picked = picked == id ? null : id; Draw(); });
            }
        }

        // Oriel, at the root (.tut-root: clamp(40px, 9vh, 60px), a white ring and a soft shadow).
        float os = K.Clamp(40, 9 * K.Vh, 60);
        var oriel = Hud.Rect(root, "Oriel");
        Hud.At(oriel, new Vector2(0.5f, 0.5f), map(50, 59), new Vector2(os, os));
        var face = oriel.gameObject.AddComponent<Image>();
        face.sprite = Hud.Circle;
        Hud.Shadow(face, os / 2, new Hud.Drop(Color.white, 0, 0, 2), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.25f), 6, 18));
        oriel.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var pic = Hud.Rect(oriel, "Picture");
        Hud.Fill(pic);
        var raw = pic.gameObject.AddComponent<RawImage>();
        raw.texture = Resources.Load<Texture2D>("Portraits/oriel");

        // The lesson picked, waiting to begin, or Oriel's word.
        var lesson = picked != null ? Lessons.LessonById(picked) : null;
        var hint = coreDone ? "The lost races await, above." : done.Count > 0 ? "The lost races open once the core is learnt." : "Walk with me. Start at the root.";
        if (lesson != null)
        {
            var id = lesson.Id;
            Foot(root, lesson.Track == "core" ? "core" : "the lost races", lesson.Name, lesson.Teaches, done.Contains(lesson.Id) ? "again" : "begin", () => App.Instance.Puzzle("lesson", id), null);
        }
        else Foot(root, null, null, null, null, null, hint);
    }

    static Sprite doneDot;

    /// <summary>.tut-done .tut-dot: radial-gradient(circle at 40% 35%, #fff6d8, #e7c26a 70%, #b98a2c), in a circle.</summary>
    static Sprite DoneDot
    {
        get
        {
            if (doneDot != null) return doneDot;
            const int n = 128;
            var t = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[n * n];
            Color a = Hud.Rgba(255, 246, 216), b = Hud.Rgba(231, 194, 106), c = Hud.Rgba(185, 138, 44);
            // (A circle reaching the farthest corner from its centre.)
            float reach = Mathf.Sqrt(0.6f * 0.6f + 0.65f * 0.65f);
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float u = (x + 0.5f) / n, v = 1 - (y + 0.5f) / n;
                    float g = Mathf.Sqrt((u - 0.4f) * (u - 0.4f) + (v - 0.35f) * (v - 0.35f)) / reach;
                    var col = g <= 0.7f ? Color.Lerp(a, b, g / 0.7f) : Color.Lerp(b, c, (g - 0.7f) / 0.3f);
                    float r = Mathf.Sqrt((u - 0.5f) * (u - 0.5f) + (v - 0.5f) * (v - 0.5f)) * n;
                    col.a = Mathf.Clamp01(n / 2f - r + 0.5f);
                    px[y * n + x] = col;
                }
            t.SetPixels32(px);
            t.Apply();
            return doneDot = Sprite.Create(t, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f));
        }
    }

    /// <summary>
    /// A disc's soft shadow (box-shadow 0 y blur colour), `d` across, under `dot` in `parent`: the disc blurred as the
    /// browser blurs it (a Gaussian of half the blur), its picture worked out for the disc's size and the blur.
    /// </summary>
    static RawImage Glow(RectTransform parent, RectTransform dot, float d, Hud.Drop g)
    {
        var r = Hud.Rect(parent, "Glow");
        r.SetSiblingIndex(0);
        var img = r.gameObject.AddComponent<RawImage>();
        img.raycastTarget = false;
        Shape(img, dot, d, g);
        return img;
    }

    static void Shape(RawImage img, RectTransform dot, float d, Hud.Drop g)
    {
        float reach = d / 2 + 1.5f * g.Blur;
        var r = img.rectTransform;
        r.anchorMin = r.anchorMax = dot.anchorMin;
        r.pivot = new Vector2(0.5f, 0.5f);
        r.anchoredPosition = dot.anchoredPosition + new Vector2(g.X, -g.Y);
        r.sizeDelta = new Vector2(2 * reach, 2 * reach);
        img.texture = GlowTexture(d / 2, g.Blur);
        img.color = g.Color;
    }

    static readonly Dictionary<int, Texture2D> glows = new Dictionary<int, Texture2D>();

    /// <summary>A disc of radius `rad` blurred by `blur` (σ = blur / 2), white, its alpha the shadow's, out to 1.5 blurs.</summary>
    static Texture2D GlowTexture(float rad, float blur)
    {
        int key = Mathf.RoundToInt(rad * 4) * 1000 + Mathf.RoundToInt(blur * 4);
        if (glows.TryGetValue(key, out var have)) return have;
        const int N = 96;
        float reach = rad + 1.5f * blur, sigma = Mathf.Max(0.5f, blur / 2);
        var t = new Texture2D(N, N, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
        var px = new Color32[N * N];
        for (int y = 0; y < N; y++)
            for (int x = 0; x < N; x++)
            {
                float u = ((x + 0.5f) / N * 2 - 1) * reach, v = ((y + 0.5f) / N * 2 - 1) * reach;
                float dist = Mathf.Sqrt(u * u + v * v) - rad;
                px[y * N + x] = new Color(1, 1, 1, 0.5f * Erfc(dist / (sigma * 1.41421f)));
            }
        t.SetPixels32(px);
        t.Apply();
        return glows[key] = t;
    }

    /// <summary>The complementary error function (Numerical Recipes' erfcc, to 1.2e-7).</summary>
    static float Erfc(float x)
    {
        float z = Mathf.Abs(x), t = 1 / (1 + 0.5f * z);
        float r = t * Mathf.Exp(-z * z - 1.26551223f + t * (1.00002368f + t * (0.37409196f + t * (0.09678418f + t * (-0.18628806f + t * (0.27886807f + t * (-1.13520398f + t * (1.48851587f + t * (-0.82215223f + t * 0.17087277f)))))))));
        return x >= 0 ? r : 2 - r;
    }

    /// <summary>@keyframes tutPulse: the glow from 16 (at half) to 26 (at three quarters) at the middle and back, eased, every 2.4 s.</summary>
    class Pulse : MonoBehaviour
    {
        RawImage halo;
        RectTransform dot;
        float d;
        int shown = -1;
        public void Set(RawImage h, RectTransform at, float size) { halo = h; dot = at; d = size; }
        void Update()
        {
            if (halo == null) return;
            float x = Time.time % 2.4f / 1.2f, u = x < 1 ? x : 2 - x;
            float k = u * u * (3 - 2 * u);
            // (The blur in whole pixels, so each look is worked out once.)
            int blur = Mathf.RoundToInt(Mathf.Lerp(16, 26, k));
            if (blur != shown) { shown = blur; Shape(halo, dot, d, new Hud.Drop(Hud.Rgba(95, 143, 196, 0.5f), 0, blur)); }
            halo.color = Hud.Rgba(95, 143, 196, Mathf.Lerp(0.5f, 0.75f, k));
        }
    }
}
