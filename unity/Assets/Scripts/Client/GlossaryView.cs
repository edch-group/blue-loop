using System.Collections.Generic;
using System.Globalization;
using System.Text;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using K = MenuKit;

/// <summary>
/// The glossary (app.ts renderGlossary, glossary.ts): its sections down a pane on the left, the chosen section's page
/// taking the rest, scrolling. Each page is set out here as the web sets it out (styles.css .gl-page and the rules under
/// it), from the sections' own words (glossary.ts glossarySections, baked by scripts/bake-glossary.mjs to
/// Resources/Glossary/glossary.json): its heading, its lines, its labelled pictures with their arrows, its lists of terms
/// and its steps, each keyword in its colour with its mark.
/// </summary>
public class GlossaryView : MonoBehaviour, MenuView.IRedraw
{
    // (The baked data: a section's blocks are h3, lead, fig, terms, steps and kw; a run of words is plain, bold (b), a
    // keyword (kw: as the page draws it, its size, weight, spacing in ems, face, capitals and mark) or a kind's dot.)
    class Run { public string text, kw, colour, icon, dot; public bool b, display, caps; public float size, weight, spacing; }
    class Row { public List<Run> dt, dd; }
    class Item { public string title; public List<Run> runs; }
    class Label { public string key, title, text, side; public int n; public float x, y; }
    class Block { public string t, text, title, fig; public List<Run> runs; public List<Row> rows; public List<Item> items; public List<Label> labels; }
    class Section { public string id, name; public List<Block> blocks; }
    class Shape { public float w, h; }
    class Data { public List<Section> sections; public Dictionary<string, Shape> figures; }

    static Data data;

    RectTransform root;
    MenuView menu;
    /// <summary>The section open (app.ts rulesTab): kept while the game runs.</summary>
    public static string Tab = "basics";

    static readonly Color Blue = Hud.Rgba(0x5f, 0x8f, 0xc4);
    static readonly Color Hairline = Hud.Rgba(58, 66, 86, 0.08f);

    public static GlossaryView Make(RectTransform parent, MenuView menu)
    {
        var r = Hud.Rect(parent, "Glossary");
        Hud.Fill(r);
        var v = r.gameObject.AddComponent<GlossaryView>();
        v.root = r;
        v.menu = menu;
        data ??= Newtonsoft.Json.JsonConvert.DeserializeObject<Data>(Resources.Load<TextAsset>("Glossary/glossary").text);
        v.Draw();
        return v;
    }

    public void Redraw() => Draw();

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var f = menu.Setup(root, "glossary", () => menu.Show("hub"));
        var sections = data.sections;
        // (A section that is not one opens the first, as the web's.)
        if (!sections.Exists(s => s.id == Tab)) Tab = "basics";
        // (.glossary: the sections, 220 across (at least 150), then the page, clamp(12px, 2vw, 24px) apart, the body's
        // height.)
        float gap = K.Clamp(12, 2 * K.Vw, 24), navW = Mathf.Clamp(f.Right - f.Left - gap - 300, 150, 220);
        // The sections, down the left (.gl-nav: 72% white, corners 18, padded 6, 4 between, scrolling; each tab padded
        // 12 by 14, 10.24 spaced 0.22em; the one open white, lifted by a soft shadow).
        var nav = Hud.Box(root, "Sections", new Color(1, 1, 1, 0.72f), 18);
        Hud.Place(nav.rectTransform, f.Left, f.BodyTop, navW, f.BodyH);
        Hud.Shadow(nav, 18, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.06f), 6, 18));
        float tabH = 36;
        var tabs = K.Scroller(nav.transform, "Tabs", 0, 0, navW, f.BodyH, 12 + sections.Count * (tabH + 4) - 4);
        for (int i = 0; i < sections.Count; i++)
        {
            var s = sections[i];
            bool on = s.id == Tab;
            var img = Hud.Box(tabs, s.id, Color.white, 12);
            var r = img.rectTransform;
            Hud.Place(r, 6, 6 + i * (tabH + 4), navW - 12, tabH);
            if (on) Hud.Shadow(img, 12, new Hud.Drop(Hud.Rgba(40, 46, 70, 0.12f), 2, 10));
            img.raycastTarget = true;
            var b = r.gameObject.AddComponent<Button>();
            if (!on)
            {
                // (Clear, and a faint blue under the pointer, as the web's.)
                var colors = b.colors;
                colors.normalColor = new Color(1, 1, 1, 0);
                colors.highlightedColor = Hud.Rgba(95, 143, 196, 0.08f);
                colors.pressedColor = Hud.Rgba(95, 143, 196, 0.14f);
                colors.selectedColor = new Color(1, 1, 1, 0);
                b.colors = colors;
            }
            var id = s.id;
            b.onClick.AddListener(() => { Sound.Play("click"); Tab = id; Draw(); });
            var l = K.Fill(r, s.name.ToUpperInvariant(), 10.24f, on ? Look.Ink : Look.InkSoft, true, 400, 0.22f, TextAlignmentOptions.Left);
            l.margin = new Vector4(14, 0, 4, 0);
            Hud.Ellipsis(l);
        }
        // The section's page, scrolling inside its rounded panel (.gl-page: 60% white, corners 22, a faint ring and a
        // wide shadow, padded clamp(14px, 3vh, 26px), its padding scrolling with it).
        float px = f.Left + navW + gap, pw = f.Right - px;
        var frame = Hud.Box(root, "Page", new Color(1, 1, 1, 0.6f), 22);
        var fr = frame.rectTransform;
        Hud.Place(fr, px, f.BodyTop, pw, f.BodyH);
        Hud.Shadow(frame, 22, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.08f), 14, 40));
        frame.raycastTarget = true;
        var viewport = Hud.Rect(fr, "Viewport");
        Hud.Fill(viewport);
        var vm = viewport.gameObject.AddComponent<Image>();
        Hud.Corner(vm, 22);
        viewport.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var content = Hud.Rect(viewport, "Content");
        content.anchorMin = new Vector2(0, 1);
        content.anchorMax = new Vector2(1, 1);
        content.pivot = new Vector2(0.5f, 1);
        content.anchoredPosition = Vector2.zero;
        var hit = content.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0.001f);
        float pad = K.Clamp(14, 3 * K.Vh, 26);
        float h = Page(content, sections.Find(s => s.id == Tab), pad, pw - 2 * pad);
        content.sizeDelta = new Vector2(0, Mathf.Max(f.BodyH, h));
        var scroll = fr.gameObject.AddComponent<ScrollRect>();
        scroll.viewport = viewport;
        scroll.content = content;
        scroll.horizontal = false;
        scroll.movementType = ScrollRect.MovementType.Elastic;
        scroll.elasticity = 0.08f;
        scroll.scrollSensitivity = 24;
    }

    // ---- The page ----------------------------------------------------------------------------------------------

    /// <summary>
    /// A section's page (`w` across inside its padding `pad`), its blocks down it in the page's flow, each block's margin
    /// against the one before it the larger of the two (as the web's collapse): h3 0 0 6, .gl-lead 0 0 4, .gl-fig 22 0
    /// 26, .gl-terms 8 0 0, .gl-steps 14 0 6, .gl-kw 18 0 0. Its height, the padding under it and the last block's
    /// margin in it.
    /// </summary>
    float Page(RectTransform parent, Section s, float pad, float w)
    {
        float y = pad, after = 0;
        bool first = true;
        foreach (var b in s.blocks)
        {
            var (top, bottom) = b.t switch
            {
                "h3" => (0f, 6f),
                "lead" => (0f, 4f),
                "fig" => (22f, 26f),
                "terms" => (8f, 0f),
                "steps" => (14f, 6f),
                "kw" => (18f, 0f),
                _ => (0f, 0f),
            };
            y += first ? top : Mathf.Max(after, top);
            first = false;
            switch (b.t)
            {
                case "h3":
                    // (.gl-page h3: 16.8 capitals, spaced 0.28em, ink.)
                    y += Para(parent, Esc(b.text.ToUpperInvariant()), pad, y, w, 16.8f, K.LineH(16.8f), Look.Ink, true, 400, 0.28f).h;
                    break;
                case "lead":
                    // (.gl-lead: 14.72, 1.55 apart, soft ink, at most 64ch across; its bold words in ink.)
                    y += Words(parent, b.runs, pad, y, Mathf.Min(w, 64 * Ch(14.72f)), 14.72f, 1.55f * 14.72f, Look.InkSoft, 400);
                    break;
                case "terms":
                    y += Terms(parent, b.rows, pad, y, w);
                    break;
                case "kw":
                {
                    // (.gl-kw h4: 9.92 capitals, spaced 0.24em, faint; 8 over its terms.)
                    y += Para(parent, Esc(b.title.ToUpperInvariant()), pad, y, w, 9.92f, K.LineH(9.92f), Look.InkFaint, true, 400, 0.24f).h + 8;
                    y += Terms(parent, b.rows, pad, y, w);
                    break;
                }
                case "steps":
                    y += Steps(parent, b.items, pad, y, w);
                    break;
                case "fig":
                    y += Figure(parent, b, pad, y, w);
                    break;
            }
            after = bottom;
        }
        return y + after + pad;
    }

    /// <summary>
    /// Terms (.gl-terms): a row each, padded 11 by 2, a hairline over all but the first; the term (190 across, at least
    /// 120; 13.76 in ink at 600, its dot or mark and its words 6 apart, in the middle of the row's height) and what it
    /// means beside it, 18 on (13.76, 1.5 apart, soft ink, at most 70ch). On a screen 640 across or less, the term over
    /// what it means, 4 apart.
    /// </summary>
    float Terms(RectTransform parent, List<Row> rows, float x, float y, float w)
    {
        float y0 = y, inner = w - 4;
        bool stack = K.W <= 640;
        float dtW = stack ? inner : Mathf.Min(190, Mathf.Max(120, inner - 18)), ddX = stack ? 0 : dtW + 18, ddW = stack ? inner : inner - dtW - 18;
        for (int i = 0; i < rows.Count; i++)
        {
            var row = rows[i];
            if (i > 0)
            {
                Rule(parent, x, y, w);
                y += 1;
            }
            y += 11;
            // (The term: a dot, if it has one, then its words.)
            var dot = row.dt.Find(r => r.dot != null);
            float wordsX = dot != null ? 10 + 6 : 0;
            var dt = Words(parent, row.dt, x + 2 + wordsX, 0, dtW - wordsX, 13.76f, K.LineH(13.76f, false), Look.Ink, 600, out var dtText);
            float ddH;
            if (stack)
            {
                Place(dtText, x + 2 + wordsX, y);
                ddH = Words(parent, row.dd, x + 2, y + dt + 4, Mathf.Min(ddW, 70 * Ch(13.76f)), 13.76f, 1.5f * 13.76f, Look.InkSoft, 400);
                if (dot != null) Dot(parent, dot.dot, x + 2, y + (dt - 10) / 2);
                y += dt + 4 + ddH + 11;
                continue;
            }
            ddH = Words(parent, row.dd, x + 2 + ddX, y, Mathf.Min(ddW, 70 * Ch(13.76f)), 13.76f, 1.5f * 13.76f, Look.InkSoft, 400);
            float rowH = Mathf.Max(dt, ddH);
            // (dt: flex, its items in the middle of its height.)
            Place(dtText, x + 2 + wordsX, y + (rowH - dt) / 2);
            if (dot != null) Dot(parent, dot.dot, x + 2, y + (rowH - 10) / 2);
            y += rowH + 11;
        }
        return y - y0;
    }

    /// <summary>
    /// The day's steps (.gl-steps): a row each, padded 12 0, a hairline over all but the first; its number in a white
    /// disc 28 across (ringed in #5f8fc4 at 40%, 12.16 at 600 in #5f8fc4), then, 48 in, its name (10.24 capitals spaced
    /// 0.22em, ink) over its words (13.76, 1.55 apart, soft ink, at most 72ch; the keywords in them as its name is set).
    /// </summary>
    float Steps(RectTransform parent, List<Item> items, float x, float y, float w)
    {
        float y0 = y;
        for (int i = 0; i < items.Count; i++)
        {
            var it = items[i];
            if (i > 0)
            {
                Rule(parent, x, y, w);
                y += 1;
            }
            y += 12;
            var disc = Hud.Box(parent, "Step", Color.white, 14);
            Hud.Place(disc.rectTransform, x, y, 28, 28);
            Hud.Shadow(disc, 14, new Hud.Drop(Hud.Rgba(95, 143, 196, 0.4f), 0, 0, 1));
            K.Words(disc.transform, (i + 1).ToString(), 0, 0, 28, 28, 12.16f, Blue, false, 600);
            float tx = x + 34 + 14, tw = w - 48, nameH = K.LineH(10.24f);
            Para(parent, Esc(it.title.ToUpperInvariant()), tx, y, tw, 10.24f, nameH, Look.Ink, true, 400, 0.22f);
            float wordsH = Words(parent, it.runs, tx, y + nameH, Mathf.Min(tw, 72 * Ch(13.76f)), 13.76f, 1.55f * 13.76f, Look.InkSoft, 400);
            y += Mathf.Max(28, nameH + wordsH) + 12;
        }
        return y - y0;
    }

    // ---- The pictures -----------------------------------------------------------------------------------------

    /// <summary>
    /// A picture with its parts labelled (glossary.ts figure, laid out as layoutGlossaryFigures lays it out). Wide (the
    /// figure 620 across or more): its labels in two columns either side of it, each label as near its part's height
    /// as the others let it, an arrow from each to its part. Narrow: the picture, a number on each part, and the labels
    /// below as a numbered list. Its height.
    /// </summary>
    float Figure(RectTransform parent, Block b, float x, float y, float w)
    {
        var shape = data.figures[b.fig];
        var fig = Hud.Rect(parent, "Figure " + b.fig);
        Hud.Place(fig, x, y, w, 0);
        bool small = b.fig == "card" || b.fig == "sun";
        if (w < 620)
        {
            float nh = Narrow(fig, b, shape, w, small);
            Hud.Place(fig, x, y, w, nh);
            return nh;
        }
        // (.gl-fig: three columns clamp(28px, 4vw, 56px) apart, the labels' at least 140 (the card's and the sun's 150)
        // and 1fr each, the picture's 3fr (the row's 3.2fr; the card's at most 250, the sun's 240).)
        float gap = K.Clamp(28, 4 * K.Vw, 56), free = w - 2 * gap, side, mid;
        if (small)
        {
            float most = b.fig == "card" ? 250 : 240;
            mid = Mathf.Clamp(free - 2 * 150, 0, most);
            side = Mathf.Max(150, (free - mid) / 2);
        }
        else
        {
            float k = b.fig == "row" ? 3.2f : 3;
            side = free / (2 + k);
            mid = k * side;
            if (side < 140)
            {
                side = 140;
                mid = Mathf.Max(0, free - 2 * side);
            }
        }
        float shotX = side + gap, shotW = mid, shotH = mid * shape.h / shape.w, rightX = shotX + mid + gap;
        Shot(fig, b, shotX, 0, shotW, shotH, false);
        // The labels: each as near its part's height as it can be, none overlapping (10 apart), all inside the column;
        // pulled back up where they would run past the picture's foot, as far as the ones above allow. A column taller
        // than the picture makes the figure taller (the left first, then the right in what that leaves).
        float figH = shotH;
        var arrows = new List<(float x1, float y1, float x2, float y2, bool left)>();
        foreach (var sideKey in new[] { "l", "r" })
        {
            bool left = sideKey == "l";
            var labels = b.labels.FindAll(l => l.side == sideKey);
            var made = new List<(Label l, RectTransform r, float h)>();
            foreach (var l in labels)
            {
                var r = Hud.Rect(fig, "Label " + l.key);
                float h = LabelWords(r, l, side, left ? TextAlignmentOptions.TopRight : TextAlignmentOptions.TopLeft, 0);
                made.Add((l, r, h));
            }
            var tops = new float[made.Count];
            for (int i = 0; i < made.Count; i++)
                tops[i] = Mathf.Max(i > 0 ? tops[i - 1] + made[i - 1].h + 10 : 0, made[i].l.y / 100 * shotH - made[i].h / 2);
            float room = figH;
            for (int i = made.Count - 1; i >= 0; i--)
            {
                float limit = i == made.Count - 1 ? room - made[i].h : tops[i + 1] - 10 - made[i].h;
                float floor = i > 0 ? tops[i - 1] + made[i - 1].h + 10 : 0;
                tops[i] = Mathf.Max(floor, Mathf.Min(tops[i], limit));
            }
            for (int i = 0; i < made.Count; i++)
            {
                Hud.Place(made[i].r, left ? 0 : rightX, tops[i], side, made[i].h);
                var l = made[i].l;
                arrows.Add((left ? side + 6 : rightX - 6, tops[i] + Mathf.Min(made[i].h / 2, 9), shotX + l.x / 100 * shotW, l.y / 100 * shotH, left));
            }
            if (made.Count > 0) figH = Mathf.Max(figH, tops[made.Count - 1] + made[made.Count - 1].h);
        }
        Hud.Place(fig, x, y, w, figH);
        // The arrows, over it all (.gl-arrow: #5f8fc4 at 85%, 1.5 wide, round ends; a curve from the label's edge, 6 off
        // it, level with its first line, out and round to the part's middle, its head (.gl-arrows marker: 7 strokes
        // long, its tip 1 past the end) pointing on along it).
        var layer = Hud.Rect(fig, "Arrows");
        Hud.Fill(layer);
        var lines = layer.gameObject.AddComponent<UiLines>();
        var heads = Hud.Rect(fig, "Heads");
        Hud.Fill(heads);
        var tips = heads.gameObject.AddComponent<Heads>();
        var ink = new Color(Blue.r, Blue.g, Blue.b, 0.85f);
        tips.color = ink;
        tips.raycastTarget = false;
        Vector2 At(float px, float py) => new Vector2(px - w / 2, figH / 2 - py);
        foreach (var (x1, y1, x2, y2, left) in arrows)
        {
            float bend = Mathf.Max(30, Mathf.Abs(x2 - x1) * 0.45f);
            Vector2 p0 = At(x1, y1), p1 = At(x1 + (left ? bend : -bend), y1), p2 = At(x2 + (left ? -bend * 0.4f : bend * 0.4f), y2), p3 = At(x2, y2);
            var pts = new List<Vector2>();
            for (int i = 0; i <= 32; i++)
            {
                float t = i / 32f, u = 1 - t;
                pts.Add(u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3);
            }
            lines.Add(pts, ink, 1.5f);
            // (The head: M0 1 L9 5 L0 9 in a 10 box drawn 7 × 1.5 across, its point (8, 5) on the end, turned along it.)
            Vector2 dir = (p3 - p2).normalized, across = new Vector2(-dir.y, dir.x);
            float k = 7 * 1.5f / 10;
            Vector2 Head(float u, float v) => p3 + dir * (u - 8) * k - across * (v - 5) * k;
            tips.Add(Head(0, 1), Head(9, 5), Head(0, 9));
        }
        return figH;
    }

    /// <summary>
    /// A figure on a narrow page (.gl-fig-narrow): the picture across it (the card's and the sun's at most 260,
    /// centred), a number on each part; under it, 12 apart, the left column's labels then the right's (8 apart), each
    /// its number in a #5f8fc4 disc 20 across (10.56, white), its name and words 30 in.
    /// </summary>
    float Narrow(RectTransform fig, Block b, Shape shape, float w, bool small)
    {
        float shotW = small ? Mathf.Min(260, w) : w, shotH = shotW * shape.h / shape.w;
        Shot(fig, b, (w - shotW) / 2, 0, shotW, shotH, true);
        float y = shotH;
        foreach (var sideKey in new[] { "l", "r" })
        {
            y += 12;
            bool any = false;
            foreach (var l in b.labels.FindAll(x => x.side == sideKey))
            {
                if (any) y += 8;
                any = true;
                var r = Hud.Rect(fig, "Label " + l.key);
                float h = Mathf.Max(20, LabelWords(r, l, w - 30, TextAlignmentOptions.TopLeft, 30));
                Hud.Place(r, 0, y, w, h);
                var disc = Hud.Box(r, "Number", Blue, 10);
                Hud.Place(disc.rectTransform, 0, 0, 20, 20);
                K.Words(disc.transform, l.n.ToString(), 0, 0, 20, 20, 10.56f, Color.white, false, 400);
                y += h;
            }
        }
        return y;
    }

    /// <summary>
    /// The picture (.gl-shot img: corners 14, a faint ring and a soft shadow, #f4f4f6 under it) with a pin on each
    /// labelled part: a white dot 8 across ringed 2 in #5f8fc4 and glowing (narrow, a #5f8fc4 disc 18 across ringed 2
    /// in white, its number in it, 9.6 at 600, white).
    /// </summary>
    void Shot(RectTransform fig, Block b, float x, float y, float w, float h, bool narrow)
    {
        var box = Hud.Box(fig, "Shot", Hud.Rgba(0xf4, 0xf4, 0xf6), 14);
        Hud.Place(box.rectTransform, x, y, w, h);
        Hud.Shadow(box, 14, new Hud.Drop(Hairline, 0, 0, 1), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.12f), 10, 30));
        box.gameObject.AddComponent<Mask>().showMaskGraphic = true;
        var pic = Hud.Rect(box.transform, "Picture");
        Hud.Fill(pic);
        var raw = pic.gameObject.AddComponent<RawImage>();
        raw.texture = Resources.Load<Texture2D>("Glossary/" + b.fig);
        raw.raycastTarget = false;
        foreach (var l in b.labels)
        {
            float s = narrow ? 18 : 8, cx = x + l.x / 100 * w, cy = y + l.y / 100 * h;
            var pin = Hud.Box(fig, "Pin " + l.key, narrow ? Blue : Color.white, s / 2);
            Hud.Place(pin.rectTransform, cx - s / 2, cy - s / 2, s, s);
            if (narrow)
            {
                Hud.Shadow(pin, s / 2, new Hud.Drop(Color.white, 0, 0, 2));
                K.Words(pin.transform, l.n.ToString(), 0, 0, s, s, 9.6f, Color.white, false, 600);
            }
            else Hud.Shadow(pin, s / 2, new Hud.Drop(Blue, 0, 0, 2), new Hud.Drop(Hud.Rgba(95, 143, 196, 0.6f), 0, 8));
        }
    }

    /// <summary>
    /// A label's words in its box `w` across, from `x` (.gl-label: its name, 9.92 capitals spaced 0.2em in ink, over
    /// its words, 12.48 in soft ink, 2 apart, both 1.35 apart; no words, its name alone). Their height.
    /// </summary>
    float LabelWords(RectTransform r, Label l, float w, TextAlignmentOptions align, float x)
    {
        float nameH = Para(r, Esc(l.title.ToUpperInvariant()), x, 0, w, 9.92f, 1.35f * 9.92f, Look.Ink, true, 400, 0.2f, align).h;
        if (string.IsNullOrEmpty(l.text)) return nameH;
        return nameH + 2 + Para(r, Esc(l.text), x, nameH + 2, w, 12.48f, 1.35f * 12.48f, Look.InkSoft, false, 400, 0, align).h;
    }

    // ---- Words ------------------------------------------------------------------------------------------------

    /// <summary>A hairline across the page (border-top: 1px rgba(58, 66, 86, 0.08)).</summary>
    static void Rule(RectTransform parent, float x, float y, float w)
    {
        var line = Hud.Box(parent, "Rule", Hairline, 0);
        line.sprite = null;
        Hud.Place(line.rectTransform, x, y, w, 1);
    }

    /// <summary>A kind's dot (.rule-dot: 10 across, in its colour).</summary>
    static void Dot(RectTransform parent, string colour, float x, float y)
    {
        var d = Hud.Box(parent, "Dot", Hex(colour), 5);
        Hud.Place(d.rectTransform, x, y, 10, 10);
    }

    static void Place(TextMeshProUGUI t, float x, float y)
    {
        var r = t.rectTransform;
        Hud.Place(r, x, y, r.sizeDelta.x, r.sizeDelta.y);
    }

    /// <summary>The width of the face's "0" at a size (the web's ch).</summary>
    static float Ch(float size) => chs.TryGetValue(size, out var ch) ? ch : chs[size] = K.TextW("0", size, 400, 0, false);
    static readonly Dictionary<float, float> chs = new Dictionary<float, float>();

    static Color Hex(string hex) => ColorUtility.TryParseHtmlString(hex, out var c) ? c : Look.Ink;

    /// <summary>Words as TextMeshPro reads them: a "&lt;" kept as itself.</summary>
    static string Esc(string s) => s.Replace("<", "<noparse><</noparse>");

    /// <summary>A size as a TextMeshPro tag's value.</summary>
    static string F(float v) => v.ToString("0.###", CultureInfo.InvariantCulture);

    /// <summary>
    /// A paragraph: its words wrapped `w` across from (x, y), `lh` apart (the web's line-height: each line that tall,
    /// its words in its middle). The text and its height.
    /// </summary>
    static (TextMeshProUGUI t, float h) Para(RectTransform parent, string rich, float x, float y, float w, float size, float lh, Color colour, bool display, int weight, float em = 0, TextAlignmentOptions align = TextAlignmentOptions.TopLeft)
    {
        var t = K.Words(parent, rich, x, y, w, lh, size, colour, display, weight, em, align);
        t.textWrappingMode = TextWrappingModes.Normal;
        t.overflowMode = TextOverflowModes.Overflow;
        // (The face's own line, Orbitron's 1.254 of its size and Exo 2's 1.2, opened to the web's; its first line's
        // half of the difference over it.)
        float natural = (display ? 1.254f : 1.2f) * size;
        t.lineSpacing = (lh - natural) / size * 100;
        t.margin = new Vector4(0, (lh - natural) / 2, 0, 0);
        int lines = Lines(t);
        float h = Mathf.Max(1, lines) * lh;
        Hud.Place(t.rectTransform, x, y, w, h);
        return (t, h);
    }

    /// <summary>How many lines a text runs to as laid out.</summary>
    static int Lines(TextMeshProUGUI t)
    {
        t.ForceMeshUpdate();
        var info = t.textInfo;
        if (info != null && info.lineCount > 0) return info.lineCount;
        float one = t.GetPreferredValues("A", t.rectTransform.sizeDelta.x, 0).y;
        return Mathf.Max(1, Mathf.RoundToInt(t.GetPreferredValues(t.text, t.rectTransform.sizeDelta.x, 0).y / Mathf.Max(1, one)));
    }

    static float Words(RectTransform parent, List<Run> runs, float x, float y, float w, float size, float lh, Color colour, int weight) => Words(parent, runs, x, y, w, size, lh, colour, weight, out _);

    /// <summary>
    /// Runs of words (glyphs.ts keywordHtml, as the page draws them): plain words; bold ones in ink (.gl-lead b);
    /// each keyword in its colour (700, spaced 0.02em; a mark's 0, its mark 0.78em across and 0.08em before its words,
    /// 0.04em under the line) or, where the page sets it in the display face (.gl-steps b), drawn over room kept for it.
    /// A kind's dot is the term's own (Terms). Their height; `text`, the words.
    /// </summary>
    static float Words(RectTransform parent, List<Run> runs, float x, float y, float w, float size, float lh, Color colour, int weight, out TextMeshProUGUI text)
    {
        var sb = new StringBuilder();
        int at = 0;
        var marks = new List<(int at, Run run, float width)>();
        foreach (var r in runs)
        {
            if (r.dot != null) continue;
            if (r.kw == null)
            {
                sb.Append(r.b ? $"<b><color=#{ColorUtility.ToHtmlStringRGB(Look.Ink)}>{Esc(r.text)}</color></b>" : Esc(r.text));
                at += r.text.Length;
                continue;
            }
            string words = r.caps ? r.text.ToUpperInvariant() : r.text, col = r.colour;
            if (r.display)
            {
                // (Room kept for it, as wide as its words in their face, for Overlays to draw it in.)
                float ww = K.TextW(words, r.size, (int)r.weight, r.spacing) + r.spacing * r.size;
                sb.Append($"<nobr><mspace={F(ww / size)}em><alpha=#00>o<alpha=#FF></mspace></nobr>");
                marks.Add((at, r, ww));
                at += 1;
                continue;
            }
            sb.Append("<nobr><color=").Append(col).Append('>');
            if (r.icon != null)
            {
                sb.Append($"<mspace={F(0.86f * r.size / size)}em><alpha=#00>o<alpha=#FF></mspace>");
                marks.Add((at, r, 0.86f * r.size));
                at += 1;
            }
            string bold = r.weight >= 600 ? "<b>" : "", unbold = r.weight >= 600 ? "</b>" : "";
            sb.Append(bold);
            if (r.spacing != 0) sb.Append($"<cspace={F(r.spacing)}em>");
            sb.Append(Esc(words));
            if (r.spacing != 0) sb.Append("</cspace>");
            sb.Append(unbold).Append("</color></nobr>");
            at += words.Length;
        }
        var (t, h) = Para(parent, sb.ToString(), x, y, w, size, lh, colour, false, weight);
        text = t;
        if (marks.Count > 0) Overlays(t, marks);
        return h;
    }

    /// <summary>What is drawn over the room kept for it in a line: a keyword's mark (tinted its colour), or a keyword in the display face.</summary>
    static void Overlays(TextMeshProUGUI t, List<(int at, Run run, float width)> marks)
    {
        t.ForceMeshUpdate();
        var info = t.textInfo;
        foreach (var (at, run, width) in marks)
        {
            if (info == null || info.characterInfo == null || at >= info.characterCount) continue;
            var c = info.characterInfo[at];
            // (The room's left: its glyph sits in its middle.)
            float left = (c.bottomLeft.x + c.topRight.x) / 2 - width / 2;
            var r = Hud.Rect(t.rectTransform, run.icon ?? run.text);
            r.anchorMin = r.anchorMax = t.rectTransform.pivot;
            if (run.icon != null)
            {
                float s = 0.78f * run.size;
                r.pivot = Vector2.zero;
                r.anchoredPosition = new Vector2(left, c.baseLine - 0.04f * run.size);
                r.sizeDelta = new Vector2(s, s);
                var raw = r.gameObject.AddComponent<RawImage>();
                raw.texture = Resources.Load<Texture2D>("Icons/glossary/" + run.icon);
                raw.color = Hex(run.colour);
                raw.raycastTarget = false;
                continue;
            }
            // (Its words on the line's baseline: its own baseline, under its top, set on the line's.)
            r.pivot = new Vector2(0, 1);
            float lh = K.LineH(run.size);
            r.sizeDelta = new Vector2(width + 4, lh);
            var w = r.gameObject.AddComponent<TextMeshProUGUI>();
            Look.Style(w, run.size, Hex(run.colour), true, run.weight >= 600 ? 700 : run.weight <= 400 ? 400 : 500, run.spacing * 100, TextAlignmentOptions.TopLeft);
            w.text = run.caps ? run.text.ToUpperInvariant() : run.text;
            w.ForceMeshUpdate();
            var wi = w.textInfo;
            float under = wi != null && wi.characterCount > 0 ? -wi.characterInfo[0].baseLine : 1.011f * run.size;
            r.anchoredPosition = new Vector2(left, c.baseLine + under);
        }
    }

    /// <summary>The arrows' heads: filled triangles, given as their corners (from the middle of the box, y up).</summary>
    class Heads : MaskableGraphic
    {
        readonly List<Vector2> corners = new List<Vector2>();

        public void Add(Vector2 a, Vector2 b, Vector2 c)
        {
            corners.Add(a);
            corners.Add(b);
            corners.Add(c);
            SetVerticesDirty();
        }

        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            var o = rectTransform.rect.center;
            Color32 col = color;
            for (int i = 0; i + 2 < corners.Count; i += 3)
            {
                int n = vh.currentVertCount;
                for (int k = 0; k < 3; k++) vh.AddVert(corners[i + k] + o, col, Vector4.zero);
                vh.AddTriangle(n, n + 1, n + 2);
            }
        }
    }
}
