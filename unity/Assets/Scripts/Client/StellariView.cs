using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

/// <summary>
/// The Stellari's skill tree (campaign.ts renderShop): the flower at the foot of the sky, half of it below; a branch
/// off each of seven of its petals, each its own colour, its petal deepening the more is learnt; a tier a ring out,
/// the capstone last. A tap learns a point at once (undo or clear takes it back while the tree is open); reset takes
/// every point back for a few petals. Kinship's and Fellowship's first points ask which race first.
/// </summary>
public class StellariView : MonoBehaviour
{
    class Branch { public string g, title, colour; public float dir; }
    class SkillLook { public bool icon; public List<string> say, value; }
    class Looks { public List<Branch> branches; public Dictionary<string, SkillLook> skills; }

    static Looks looks;
    static Sprite ring, half;
    static Texture2D dash;
    const float Tip = 0.345f;
    static readonly float[] Reach = { 0, 0.46f, 0.7f, 0.94f };

    RectTransform root, sky;
    MenuView menu;
    readonly List<string> placed = new List<string>();
    string just, tipFor;
    bool resetArmed;
    (string skill, int? race)? aff;
    float R;
    readonly Dictionary<string, Vector2> pos = new Dictionary<string, Vector2>();

    /// <summary>The tree over its page (taken to fill the screen), laid out as the web lays it out at the screen's size, and again when that changes.</summary>
    public static StellariView Make(RectTransform parent, MenuView menu)
    {
        var layer = RefLayer.Make(parent, "Stellari");
        var r = layer.Rect;
        var v = r.gameObject.AddComponent<StellariView>();
        v.root = r;
        v.layer = layer;
        v.menu = menu;
        layer.Changed = v.Draw;
        v.Draw();
        return v;
    }

    RefLayer layer;

    /// <summary>
    /// The page's padding (.up-shop: max(14, the safe area) at the top, on a short screen max(8, ...); max(18, ...) at
    /// the sides; max(10, ...) at the foot), and so the sky (.up-sky: min(1100, the page) across, under the header).
    /// </summary>
    Vector4 Pad
    {
        get
        {
            var sa = layer.Insets;
            return new Vector4(Mathf.Max((Css.MaxHeight(560) ? 8 : 14) * Z, sa.x), Mathf.Max(18 * Z, sa.y), Mathf.Max(10 * Z, sa.z), Mathf.Max(18 * Z, sa.w));
        }
    }
    /// <summary>
    /// The title's size (clamp(1.6rem, 5.4vh, 2.6rem)), and the header's height: the title's line box (1.25 its size),
    /// 6 (on a short screen 2), the petals' row (the count's line box, 1.15rem at 1.25).
    /// </summary>
    float TitleSize => Css.Clamp(1.6f * 16 * Z, 5.4f * layer.H / 100, 2.6f * 16 * Z);
    float HeadH => TitleSize * 1.25f + (Css.MaxHeight(560) ? 2 : 6) * Z + RowH;
    const float RowH = 1.15f * 16 * Z * 1.25f;
    float SkyW => Mathf.Min(1100 * Z, layer.W - Pad.y - Pad.w);
    float SkyH => Mathf.Max(100, layer.H - Pad.x - HeadH - Pad.z);

    static Looks L => looks ??= Newtonsoft.Json.JsonConvert.DeserializeObject<Looks>(Resources.Load<TextAsset>("Engine/upgrades-look").text);

    static Color Hex(string h) => ColorUtility.TryParseHtmlString(h, out var c) ? c : new Color(0.44f, 0.62f, 0.85f);
    static Color Rgb(int v, float a = 1) => new Color(((v >> 16) & 255) / 255f, ((v >> 8) & 255) / 255f, (v & 255) / 255f, a);

    static IEnumerable<MetaUpgrade> Skills => Meta.MetaUpgrades.Where(u => u.Group != "unlock");

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var meta = CampaignView.LoadMeta();
        Header(meta);
        // The sky (.up-sky, under the header, to the page's foot padding): the Stellari's heart 40 (CSS) up from its foot.
        sky = Hud.Rect(root, "Sky");
        Hud.At(sky, new Vector2(0.5f, 0), new Vector2(0, Pad.z), new Vector2(SkyW, SkyH));
        // (The branch alone, as large as the sky lets it be: R the rows' scale, G the gap between skills across a row;
        // styles.css's, in CSS pixels: on a big screen (min-width 900, min-height 700) the branch grows to fill the
        // sky, else the capstone's row 1.3 R above the heart, the names clear of the screen's edges.)
        bool big = !Css.MaxWidth(899.9f) && !Css.MaxHeight(699.9f);
        R = (big ? Mathf.Clamp((SkyH / Z - 150) / 1.16f, 96, 620) : Mathf.Clamp((SkyH / Z - 72) / 1.3f, 96, 210)) * Z;
        G = (big ? Mathf.Clamp((0.5f * SkyW / Z - 220) * 0.9f, 128, 380) : Mathf.Clamp((0.5f * SkyW / Z - 150) * 0.95f, 128, 240)) * Z;
        Layout();
        Flower(meta);
        Lines(meta);
        nodeLooks.Clear();
        foreach (var u in Skills.Where(u => u.Group == Shown.g)) Node(meta, u);
        Spin();
        Search();
        if (aff != null) Affinity(meta);
    }

    const float Z = WebLook.Zoom;

    /// <summary>A point of the sky (pixels from the heart, y down as the web's) on the canvas.</summary>
    static Vector2 At(Vector2 p) => new Vector2(p.x, 40 * Z - p.y);

    // The branch shown, and how far the flower is turned to bring its petal straight up (degrees, the web's: clockwise).
    static int branch;
    static float turnGoal = 90, turnNow = 90;
    float G;
    RectTransform wheel;
    Branch Shown => L.branches[branch % L.branches.Count];

    static Vector2 Place(float deg, float k)
    {
        float r = deg * Mathf.Deg2Rad;
        return new Vector2(k * Mathf.Cos(r), k * Mathf.Sin(r));
    }

    /// <summary>
    /// The branch shown laid out in rows straight up from its petal (once the flower has turned it upright): a tier a
    /// row, its skills spread across, each named to its right.
    /// </summary>
    void Layout()
    {
        pos.Clear();
        var own = Skills.Where(u => u.Group == Shown.g).ToList();
        for (int tier = 1; tier <= 3; tier++)
        {
            var row = own.Where(u => (u.Tier ?? 1) == tier).ToList();
            for (int i = 0; i < row.Count; i++)
            {
                float sx = i - (row.Count - 1) / 2f, sy = -(Tip + 0.2f + 0.375f * (tier - 1));
                pos[row[i].Id] = new Vector2(sx * G, sy * R);
            }
        }
    }

    /// <summary>The flower turned on to the next branch (or back), the branch's petal brought straight up.</summary>
    void Turn(int step)
    {
        branch = (branch + step + L.branches.Count) % L.branches.Count;
        float want = 270 - Shown.dir;
        // (Turning the way the arrow points: on to the right, the flower turns anticlockwise.)
        float t = turnGoal - step;
        while ((((t - want) % 360) + 360) % 360 > 0.01f) t -= step;
        turnGoal = t;
        tipFor = null;
        Sound.Play("hover");
        Draw();
    }

    void Update()
    {
        if (wheel == null) return;
        turnNow = Mathf.MoveTowards(turnNow, turnGoal, Time.deltaTime * Mathf.Max(90, Mathf.Abs(turnGoal - turnNow) * 6));
        wheel.localRotation = Quaternion.Euler(0, 0, -turnNow);
    }

    /// <summary>The arrows, at the foot: the branch's name between them, in its colour.</summary>
    void Spin()
    {
        // (.up-spin: as wide as the longest branch's name, whichever is shown, so the arrows never move; 40 across,
        // 14 from the name, 10 up from the foot.)
        var nav = Hud.Rect(root, "Spin");
        var name = WebLook.Words(nav, Shown.title.ToUpperInvariant(), 0.62f * 16 * Z, 0.24f, Color.Lerp(Hex(Shown.colour), Look.Ink, 0.3f));
        name.margin = new Vector4(0, 0, 0.24f * 0.62f * 16 * Z, 0);
        float widest = L.branches.Max(b => name.GetPreferredValues(b.title.ToUpperInvariant()).x);
        // (max(10, the safe area) up from the sky's foot, itself the page's foot padding up.)
        Hud.At(nav, new Vector2(0.5f, 0), new Vector2(0, Pad.z + Mathf.Max(10 * Z, layer.Insets.z)), new Vector2(widest + 2 * (40 + 14) * Z, 40 * Z));
        for (int d = -1; d <= 1; d += 2)
        {
            int step = d;
            var bi = WebLook.Rounded(nav, d < 0 ? "Back" : "On", new Color(1, 1, 1, 0.85f), 999);
            Hud.At(bi.rectTransform, new Vector2(d < 0 ? 0 : 1, 0.5f), Vector2.zero, new Vector2(40 * Z, 40 * Z));
            bi.raycastTarget = true;
            WebLook.Shadow(bi, 4 * Z, 12 * Z, new Color(40 / 255f, 46 / 255f, 70 / 255f, 0.1f), 999, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.1f));
            bi.gameObject.AddComponent<Button>().onClick.AddListener(() => Turn(step));
            var arrow = WebLook.Words(bi.transform, d < 0 ? "‹" : "›", 1.4f * 16 * Z, 0, Look.InkSoft, false, 400);
            arrow.margin = new Vector4(0, 0, 0, 3);
        }
        name.raycastTarget = false;
    }

    // ---- The header: back, undo, clear, reset; the title and the petals ----

    void Header(MetaState meta)
    {
        // (.up-head: back, then undo, clear and reset in small spaced capitals, 14 apart; the title in the middle, the
        // petals under it; the search at the right.)
        var pad = Pad;
        var back = WebLook.UpBack(root, () => menu.Show("campaign"), pad.w, pad.x);
        float x = pad.w + ((RectTransform)back.transform).sizeDelta.x + 14 * Z;
        void Small(string label, System.Action act, Color ink, bool petals = false)
        {
            var r = Hud.Rect(root, label);
            var t = WebLook.Words(r, label.ToUpperInvariant(), 0.56f * 16 * Z, 0.2f, ink, true, 500, TextAlignmentOptions.Left);
            float w = t.GetPreferredValues(t.text).x;
            if (petals)
            {
                // (Its price after it: the petal and how many.)
                var p = WebLook.Centred(r, "Petal", w + 6 * Z + 7, 21, 14, 14).gameObject.AddComponent<RawImage>();
                p.texture = Resources.Load<Texture2D>("Icons/purse-petal");
                p.raycastTarget = false;
                var n = WebLook.Words(WebLook.Box(r, "Price", w + 6 * Z + 16, 0, 40, 42), Meta.SkillResetPetals.ToString(), 0.56f * 16 * Z, 0.04f, ink, true, 500, TextAlignmentOptions.Left);
                w += 6 * Z + 16 + n.GetPreferredValues(n.text).x;
            }
            WebLook.Box(r, x, pad.x, w, 42);
            var hit = r.gameObject.AddComponent<Image>();
            hit.color = new Color(1, 1, 1, 0);
            r.gameObject.AddComponent<Button>().onClick.AddListener(() => act());
            x += w + 14 * Z;
        }
        if (placed.Count > 0)
        {
            Small("undo", () => Undo(1), Look.InkSoft);
            Small("clear", () => Undo(placed.Count), Look.InkSoft);
        }
        if (Meta.TreePetalsSpent(meta) > 0) Small(resetArmed ? "confirm reset" : "reset", Reset, resetArmed ? Look.Ink : Look.InkSoft, true);
        // (.up-title-big: SKILLS at clamp(1.6rem, 5.4vh, 2.6rem) across 0.5em, its petals 6 under it (on a short screen
        // 2): the petal, how many, PETALS small.)
        float ts = TitleSize, W = layer.W, py = pad.x + ts * 1.25f + (Css.MaxHeight(560) ? 2 : 6) * Z;
        var title = WebLook.Words(WebLook.Box(root, "Title", 0, pad.x - ts * 0.05f, W, ts * 1.26f), "SKILLS", ts, 0.5f, Look.Ink, true, 400);
        // (Its text-indent as wide as the letter-spacing trailing its last letter: the words centred as they are.)
        var count = WebLook.Words(Hud.Fill(Hud.Rect(root, "Petals")), meta.Petals.ToString(), 1.15f * 16 * Z, 0, Look.Ink, true, 500, TextAlignmentOptions.Left);
        var unit = WebLook.Words(Hud.Fill(Hud.Rect(root, "Unit")), "PETALS", 0.56f * 16 * Z, 0.22f, Look.InkFaint, true, 400, TextAlignmentOptions.Left);
        float cw = count.GetPreferredValues(count.text).x, uw = unit.GetPreferredValues(unit.text).x;
        float rowW = 28 + 6 * Z + cw + 10 * Z + uw, x0 = W / 2 - rowW / 2;
        var pi = WebLook.Centred(root, "Petal", x0 + 14, py + RowH / 2, 28, 28).gameObject.AddComponent<RawImage>();
        pi.texture = Resources.Load<Texture2D>("Icons/purse-petal");
        pi.raycastTarget = false;
        // (The count and PETALS centred on the row, each in its own line box.)
        float unitH = 0.56f * 16 * Z * 1.25f;
        WebLook.Box((RectTransform)count.transform, x0 + 28 + 6 * Z, py, cw + 4, RowH);
        WebLook.Box((RectTransform)unit.transform, x0 + 28 + 6 * Z + cw + 10 * Z, py + (RowH - unitH) / 2, uw + 8, unitH);
    }

    // ---- The search: skills whose name or words match lit, the rest dimmed ----

    static string search = "";
    readonly List<(CanvasGroup group, string words)> nodeLooks = new List<(CanvasGroup, string)>();

    /// <summary>
    /// The search (.up-search) at the top right: a capsule of white glass ringed by a fine line, a lens and SEARCH in
    /// faint capitals; typing dims every skill whose name and words don't hold it (straight on the page: no redraw).
    /// </summary>
    void Search()
    {
        var box = WebLook.Rounded(root, "Search", new Color(1, 1, 1, 0.75f), 999);
        box.sprite = Hud.Rounded;
        box.type = Image.Type.Sliced;
        box.pixelsPerUnitMultiplier = 22f / (14 * Z);
        box.raycastTarget = true;
        // (At the header's right: its words clamp(90, 14vw, 170) across, 44 more for its lens and padding.)
        float sw = (Css.Clamp(90, 14 * Css.Screen.x / 100, 170) + 44) * Z;
        WebLook.Box(box.rectTransform, layer.W - Pad.y - sw, Pad.x, sw, 28 * Z);
        WebLook.Shadow(box, 0, 0, Color.clear, 14 * Z, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.14f));
        var lens = WebLook.Centred(box.transform, "Lens", 19 * Z, 14 * Z, 14 * Z, 14 * Z).gameObject.AddComponent<RawImage>();
        lens.texture = Lens();
        lens.color = Look.InkFaint;
        lens.raycastTarget = false;
        var area = WebLook.Box(box.transform, "Text", 46, 0, sw - 63, 28 * Z);
        area.gameObject.AddComponent<RectMask2D>();
        var hint = WebLook.Words(area, "SEARCH", 0.66f * 16 * Z, 0.14f, Look.InkFaint, true, 500, TextAlignmentOptions.Left);
        var text = WebLook.Words(area, "", 0.66f * 16 * Z, 0.14f, Look.Ink, true, 500, TextAlignmentOptions.Left);
        text.richText = false;
        text.fontStyle = FontStyles.UpperCase;
        var field = box.gameObject.AddComponent<TMP_InputField>();
        field.textViewport = area;
        field.richText = false;
        field.textComponent = text;
        field.placeholder = hint;
        field.text = search;
        field.onValueChanged.AddListener(v => { search = v; Dim(); });
        Dim();
    }

    /// <summary>The skills shown lit or dimmed by the search (none: all as they are).</summary>
    void Dim()
    {
        string term = search.Trim().ToLowerInvariant();
        foreach (var (group, words) in nodeLooks)
            if (group != null) group.alpha = term.Length == 0 || words.Contains(term) ? 1 : 0.18f;
    }

    static Texture2D lens;

    /// <summary>The search's lens (its 24-square SVG: a circle 6.5 round (10.5, 10.5), a handle to (20.5, 20.5)), white to tint.</summary>
    static Texture2D Lens()
    {
        if (lens != null) return lens;
        const int S = 48;
        lens = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        float k = S / 24f, w = 1.6f * k / 2;
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                var p = new Vector2((x + 0.5f) / k, 24 - (y + 0.5f) / k);
                float ring = Mathf.Abs((p - new Vector2(10.5f, 10.5f)).magnitude - 6.5f) * k;
                var a = new Vector2(15.5f, 15.5f);
                var d = new Vector2(5, 5);
                float t = Mathf.Clamp01(Vector2.Dot(p - a, d) / d.sqrMagnitude);
                float handle = (p - (a + d * t)).magnitude * k;
                lens.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(w - Mathf.Min(ring, handle) + 0.5f)));
            }
        lens.Apply();
        return lens;
    }

    // ---- The flower, its petals filling in their branches' colours ----

    void Flower(MetaState meta)
    {
        // (The flower 0.9 R across, its petals' tips 0.345 R out.)
        float F = R * 0.9f;
        tipK = R;
        wheel = Hud.Rect(sky, "Wheel");
        wheel.anchorMin = wheel.anchorMax = new Vector2(0.5f, 0);
        wheel.pivot = new Vector2(0.5f, 0.5f);
        wheel.anchoredPosition = At(Vector2.zero);
        wheel.sizeDelta = Vector2.zero;
        wheel.localRotation = Quaternion.Euler(0, 0, -turnNow);
        // Each branch's petal: its outer lobe washed in the branch's colour, deeper the more of it is learnt.
        foreach (var br in L.branches)
        {
            var own = Skills.Where(u => u.Group == br.g).ToList();
            int got = own.Sum(u => Mathf.Min(Meta.LevelOf(meta, u.Id), u.Max)), all = own.Sum(u => u.Max);
            float f = all > 0 ? (float)got / all : 0;
            if (f <= 0) continue;
            float deg = Mathf.Round(br.dir / 30) * 30;
            var lobe = Hud.Rect(wheel, "Petal " + br.g);
            lobe.anchorMin = lobe.anchorMax = new Vector2(0.5f, 0.5f);
            lobe.pivot = new Vector2(0.5f, 0);
            lobe.anchoredPosition = Vector2.zero;
            // (The flower's petals: ellipses 95 by 330 round its heart, in a flower 860 across.)
            lobe.sizeDelta = new Vector2(F * 190 / 860f, F * 330 / 860f);
            // (Pointing its way: web degrees run clockwise from the right, y down.)
            lobe.localRotation = Quaternion.Euler(0, 0, -(deg - 270));
            var img = lobe.gameObject.AddComponent<Image>();
            img.sprite = HalfEllipse;
            var c = Hex(br.colour);
            c.a = 0.06f + 0.26f * f;
            img.color = c;
            img.raycastTarget = false;
        }
        var fl = Hud.Rect(wheel, "Flower");
        fl.anchorMin = fl.anchorMax = new Vector2(0.5f, 0.5f);
        fl.pivot = new Vector2(0.5f, 0.5f);
        fl.anchoredPosition = Vector2.zero;
        fl.sizeDelta = new Vector2(F, F);
        var raw = fl.gameObject.AddComponent<RawImage>();
        raw.texture = Pictures.Load("Icons/up-flower");
        raw.raycastTarget = false;
    }

    // ---- The stems and links: dashed until learnt ----

    float tipK;

    void Lines(MetaState meta)
    {
        // A stem up from the petal's tip to each first skill: across beneath the row and up, when there are two or more.
        var firsts = Skills.Where(u => u.Group == Shown.g && (u.Tier ?? 1) == 1).ToList();
        var tip = new Vector2(0, -Tip * tipK);
        var mid = new Vector2(0, -(Tip + 0.07f) * R);
        foreach (var u in firsts)
        {
            bool lit = Meta.LevelOf(meta, u.Id) > 0;
            var to = pos[u.Id];
            if (firsts.Count > 1)
            {
                var under = new Vector2(to.x, mid.y);
                if (u == firsts[0]) Line(tip, mid, lit);
                Line(mid, under, lit);
                Line(under, to, lit);
            }
            else Line(tip, to, lit);
        }
        foreach (var u in Skills.Where(u => u.Group == Shown.g))
            foreach (var r in u.Requires ?? new List<MetaRequirement>())
                if (pos.ContainsKey(r.Id)) Line(pos[r.Id], pos[u.Id], Meta.LevelOf(meta, u.Id) > 0);
    }

    void Line(Vector2 a, Vector2 b, bool lit)
    {
        Vector2 p = At(a), q = At(b), d = q - p;
        var r = Hud.Rect(sky, "Line");
        r.anchorMin = r.anchorMax = new Vector2(0.5f, 0);
        r.pivot = new Vector2(0, 0.5f);
        r.anchoredPosition = p;
        r.sizeDelta = new Vector2(d.magnitude, 1.2f * Z);
        r.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
        var img = r.gameObject.AddComponent<RawImage>();
        img.raycastTarget = false;
        // (Learnt: solid, in the branch's colour at three quarters; else dashed pale grey.)
        if (lit) { img.texture = Texture2D.whiteTexture; var c = Hex(Shown.colour); img.color = new Color(c.r, c.g, c.b, 0.75f); }
        else
        {
            img.texture = Dash;
            img.uvRect = new Rect(0, 0, d.magnitude / 7f, 1);
            img.color = Rgb(0xcfd3db);
        }
    }

    // ---- A skill: a disc, its mark, a ring of its levels ----

    void Node(MetaState meta, MetaUpgrade u)
    {
        int tier = u.Tier ?? 1;
        int level = Mathf.Min(Meta.LevelOf(meta, u.Id), u.Max);
        int had = Mathf.Max(0, level - placed.Count(x => x == u.Id));
        bool maxed = level >= u.Max, open = Meta.UpgradeOpen(meta, u.Id);
        string why = maxed ? null : Meta.BuyUpgradeProblem(meta, u.Id);
        L.skills.TryGetValue(u.Id, out var look);
        string vals = look != null ? look.say[Mathf.Max(level, 1) - 1] : u.Text;
        // (A skill in the tree, styles.css .up-tree: no disc, a mote of light in its branch's colour, brighter and
        // wider the more is learnt; a fine ring of its levels round it; one to take now, a dashed ring turning slowly
        // round it; a capstone larger, a faint ring inside it. Not yet open: grey and faded.)
        var bc = Hex(L.branches.FirstOrDefault(b => b.g == u.Group)?.colour ?? "#8d93a8");
        // (A skill with no points in it yet (none learnt, none placed) is not lit: a grey glimmer, its colour coming with
        // its first point.)
        var mc = level > 0 ? bc : Rgb(0xaab0bf);
        float lv = (float)level / Mathf.Max(1, u.Max);
        // (On a short screen a size down: 24, a capstone 32.)
        float size = (tier == 3 ? 40 : 30) * Z * (Css.MaxHeight(560) ? 0.8f : 1);
        var n = Hud.Rect(sky, u.Id);
        n.anchorMin = n.anchorMax = new Vector2(0.5f, 0);
        n.pivot = new Vector2(0.5f, 0.5f);
        n.anchoredPosition = At(pos[u.Id]);
        n.sizeDelta = new Vector2(size, size);
        var group = n.gameObject.AddComponent<CanvasGroup>();
        nodeLooks.Add((group, $"{u.Name} {vals}".ToLowerInvariant()));
        var disc = n.gameObject.AddComponent<Image>();
        disc.sprite = Hud.Circle;
        disc.color = new Color(1, 1, 1, 0);
        if (tier == 3)
        {
            // (1 wide, 14% in: its box drawn so the ring's circle falls there.)
            float d = size * 0.72f;
            Picture(n, "Inner", ThinRing(Z * 44 / d), d * 48 / 44, new Color(bc.r, bc.g, bc.b, 0.22f));
        }
        // The mote: its halo spilling out, its light, breathing.
        var mote = Hud.Rect(n, "Mote");
        Hud.At(mote, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.one * size * 0.5f);
        var halo = Picture(mote, "Halo", null, size * 0.5f * (1 + 2 * (0.4f + 0.3f * lv)), Color.white);
        halo.texture = Glow(mc, 0.14f + 0.22f * lv);
        var core = Picture(mote, "Light", null, size * 0.5f * 1.6f, Color.white);
        core.texture = Mote(mc, lv);
        var breathe = mote.gameObject.AddComponent<Breathe>();
        breathe.Phase = nodeLooks.Count % 3 == 0 ? 1.4f : nodeLooks.Count % 3 == 1 ? 2.8f : 0;
        breathe.Faded = open ? 1 : 0.45f;
        breathe.Still = !open;
        // Its ring: a segment a level, out near the disc's edge (92% of it), 3.4 wide (of 48): learnt in its colour (90%
        // to white), placed this visit paler (55%), still to learn a grey track; not yet open, fainter still.
        float ringD = size * 0.92f;
        float C = 2 * Mathf.PI * 22, g = u.Max > 1 ? 7 : 0;
        for (int i = 0; i < u.Max; i++)
        {
            var seg = Hud.Rect(n, "Level " + i);
            Hud.At(seg, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(ringD, ringD));
            var img = seg.gameObject.AddComponent<Image>();
            img.sprite = ThinRing(3.4f);
            img.type = Image.Type.Filled;
            img.fillMethod = Image.FillMethod.Radial360;
            img.fillOrigin = (int)Image.Origin360.Top;
            img.fillClockwise = true;
            img.fillAmount = (C / u.Max - g) / C;
            img.rectTransform.localRotation = Quaternion.Euler(0, 0, -(i * 360f / u.Max + g / C * 180));
            img.color = !open ? new Color(170 / 255f, 176 / 255f, 191 / 255f, 0.2f) : i < had ? Color.Lerp(Color.white, bc, 0.9f) : i < level ? Color.Lerp(Color.white, bc, 0.55f) : new Color(150 / 255f, 156 / 255f, 172 / 255f, 0.32f);
            img.raycastTarget = false;
        }
        // (One to take now: the dashed ring, 8 out (12 round a capstone), turning once in 28 seconds.)
        if (why == null && !maxed && level == 0)
        {
            var ring = Picture(n, "Ready", Dashed(), size + (tier == 3 ? 24 : 16) * Z, Color.Lerp(Rgb(0x8d93a8), bc, 0.8f));
            ring.gameObject.AddComponent<Turning>();
        }
        if (level > had)
        {
            // (.up-node-plus: a small pill in the branch's colour, its top at the disc's, just right of its middle.)
            var plus = WebLook.Rounded(n, "Plus", bc, 999);
            var t = WebLook.Words(plus.transform, $"+{level - had}", 0.55f * 16 * Z, 0, Color.white, true, 400);
            float pw = t.GetPreferredValues(t.text).x + 10 * Z;
            plus.sprite = Hud.Rounded;
            plus.type = Image.Type.Sliced;
            plus.pixelsPerUnitMultiplier = 22f / (0.55f * 16 * Z * 0.75f);
            WebLook.Box(plus.rectTransform, size / 2 + 6 * Z, 0, pw, 0.55f * 16 * Z * 1.5f);
        }
        // Its name to its right, and what it gives (.up-mobile .up-node b): on a wash of the page's paper.
        float lw = Mathf.Min(160, G / Z - 34) * Z, inner2 = lw - 12 * Z;
        var words = Hud.Rect(n, "Words");
        var wash = words.gameObject.AddComponent<Image>();
        WebLook.Round(wash, 10 * Z);
        wash.color = new Color(Look.Paper.r, Look.Paper.g, Look.Paper.b, 0.8f);
        wash.raycastTarget = false;
        WebLook.Shadow(wash, 0, 10 * Z, new Color(Look.Paper.r, Look.Paper.g, Look.Paper.b, 0.8f), 10 * Z);
        var nm = WebLook.Words(words, u.Name.ToUpperInvariant(), 0.5f * 16 * Z, tier == 3 ? 0.2f : 0.14f, open ? Look.InkSoft : Rgb(0xb9bdc8), true, tier == 3 ? 700 : 500, TextAlignmentOptions.TopLeft);
        nm.textWrappingMode = TextWrappingModes.Normal;
        var say = WebLook.Words(words, vals, 0.6f * 16 * Z, 0, open ? Look.InkFaint : Rgb(0xc8ccd6), false, 400, TextAlignmentOptions.TopLeft);
        say.textWrappingMode = TextWrappingModes.Normal;
        float nh = nm.GetPreferredValues(nm.text, inner2, 0).y, sh = say.GetPreferredValues(vals, inner2, 0).y;
        float wh = nh + 2 * Z + sh + 6 * Z;
        words.anchorMin = words.anchorMax = new Vector2(1, 0.5f);
        words.pivot = new Vector2(0, 0.5f);
        words.anchoredPosition = new Vector2(4 * Z, 0);
        words.sizeDelta = new Vector2(lw, wh);
        WebLook.Box((RectTransform)nm.transform, 6 * Z, 3 * Z, inner2, nh + 2);
        WebLook.Box((RectTransform)say.transform, 6 * Z, 3 * Z + nh + 2 * Z, inner2, sh + 2);
        nm.raycastTarget = say.raycastTarget = false;
        var b = n.gameObject.AddComponent<Button>();
        b.transition = Selectable.Transition.None;
        var id = u.Id;
        b.onClick.AddListener(() => Pick(id));
        // (Under the pointer, the mote swells.)
        var hover = n.gameObject.AddComponent<EventTrigger>();
        var enter = new EventTrigger.Entry { eventID = EventTriggerType.PointerEnter };
        enter.callback.AddListener(_ => breathe.Over = true);
        hover.triggers.Add(enter);
        var exit = new EventTrigger.Entry { eventID = EventTriggerType.PointerExit };
        exit.callback.AddListener(_ => breathe.Over = false);
        hover.triggers.Add(exit);
    }

    /// <summary>A picture centred in its parent at a size (a texture or a sprite's), tinted.</summary>
    static RawImage Picture(RectTransform parent, string name, Sprite sprite, float size, Color tint)
    {
        var r = Hud.Rect(parent, name);
        Hud.At(r, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size, size));
        var raw = r.gameObject.AddComponent<RawImage>();
        if (sprite != null) raw.texture = sprite.texture;
        raw.color = tint;
        raw.raycastTarget = false;
        return raw;
    }

    /// <summary>A mote breathing (styles.css up-mote-breathe: 1 to 1.08 across, 0.92 to whole, over 4.2s); under the pointer, swollen.</summary>
    public class Breathe : MonoBehaviour
    {
        public float Phase, Faded = 1;
        public bool Still, Over;
        CanvasGroup g;
        float over;

        void Update()
        {
            if (g == null) g = gameObject.AddComponent<CanvasGroup>();
            float k = Still ? 0 : 0.5f - 0.5f * Mathf.Cos((Time.time + Phase) / 4.2f * Mathf.PI * 2);
            over = Mathf.MoveTowards(over, Over ? 1 : 0, Time.deltaTime * 6);
            transform.localScale = Vector3.one * (1 + 0.08f * k) * (1 + 0.18f * over);
            g.alpha = Faded * (Still ? 1 : 0.92f + 0.08f * k);
            g.blocksRaycasts = false;
        }
    }

    /// <summary>The ready ring turning: once in 28 seconds.</summary>
    public class Turning : MonoBehaviour
    {
        void Update() => transform.localRotation = Quaternion.Euler(0, 0, -Time.time / 28 * 360);
    }

    static readonly Dictionary<string, Texture2D> lights = new Dictionary<string, Texture2D>();

    /// <summary>
    /// A mote's light (styles.css .up-mote), in a box 1.6 times the mote's for its glow: white at its heart, then its
    /// colour washed with white, then its colour fading out by 70% of the way to its box's corner; a soft glow round it.
    /// </summary>
    static Texture2D Mote(Color c, float lv)
    {
        string key = $"mote {ColorUtility.ToHtmlStringRGB(c)} {lv:0.00}";
        if (lights.TryGetValue(key, out var t)) return t;
        const int S = 64;
        t = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        float s0 = 0.10f + 0.08f * lv, s1 = 0.22f + 0.10f * lv, s2 = 0.42f + 0.10f * lv;
        var wash = Color.Lerp(Color.white, c, 0.55f);
        float glowR = (3 + 7 * lv) / 11f;
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                // (In the mote's own measure: its edge at 1, the gradient's line its corner, 1.414 out.)
                float d = new Vector2(x + 0.5f - S / 2f, y + 0.5f - S / 2f).magnitude / (S / 2f) * 1.6f;
                float u = d / 1.4142f;
                Color col;
                if (u <= s0) col = Color.white;
                else if (u <= s1) col = Color.Lerp(Color.white, wash, (u - s0) / (s1 - s0));
                else if (u <= s2) col = Color.Lerp(wash, new Color(c.r, c.g, c.b, 0.3f + 0.4f * lv), (u - s1) / (s2 - s1));
                else if (u <= 0.7f) col = Color.Lerp(new Color(c.r, c.g, c.b, 0.3f + 0.4f * lv), new Color(c.r, c.g, c.b, 0), (u - s2) / (0.7f - s2));
                else col = new Color(c.r, c.g, c.b, 0);
                // (Cut round at its edge; past it, its drop-shadow's soft glow.)
                if (d > 1) col.a = 0;
                float glow = 0.7f * 0.35f * Mathf.Clamp01(1 - (d - 0.6f) / Mathf.Max(0.2f, glowR));
                float a = col.a + glow * (1 - col.a);
                var rgb = a > 0 ? (new Color(col.r, col.g, col.b) * col.a + new Color(c.r, c.g, c.b) * glow * (1 - col.a)) / a : new Color(c.r, c.g, c.b);
                t.SetPixel(x, y, new Color(rgb.r, rgb.g, rgb.b, a));
            }
        t.Apply();
        return lights[key] = t;
    }

    /// <summary>A mote's wide faint halo (its ::after): its colour at an opacity, fading out by the edge.</summary>
    static Texture2D Glow(Color c, float a)
    {
        string key = $"glow {ColorUtility.ToHtmlStringRGB(c)} {a:0.00}";
        if (lights.TryGetValue(key, out var t)) return t;
        const int S = 64;
        t = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float d = new Vector2(x + 0.5f - S / 2f, y + 0.5f - S / 2f).magnitude / (S / 2f);
                t.SetPixel(x, y, new Color(c.r, c.g, c.b, a * Mathf.Clamp01(1 - d / 0.99f)));
            }
        t.Apply();
        return lights[key] = t;
    }

    static readonly Dictionary<float, Sprite> thin = new Dictionary<float, Sprite>();

    /// <summary>A fine white ring, its stroke `w` of a 48 square (a circle 22 round its middle).</summary>
    static Sprite ThinRing(float w)
    {
        if (thin.TryGetValue(w, out var s)) return s;
        const int S = 128;
        var t = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        float rad = 22f / 48 * S, px = w / 48 * S;
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float d = Mathf.Abs(new Vector2(x + 0.5f - S / 2f, y + 0.5f - S / 2f).magnitude - rad);
                t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(px / 2 - d + 0.5f)));
            }
        t.Apply();
        return thin[w] = Sprite.Create(t, new Rect(0, 0, S, S), new Vector2(0.5f, 0.5f));
    }

    static Sprite dashed;

    /// <summary>A dashed white ring (a 1.5 dashed border round a circle), to tint and turn.</summary>
    static Sprite Dashed()
    {
        if (dashed != null) return dashed;
        const int S = 160;
        var t = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        float w = 2.2f / 67 * S, rad = S / 2f - w / 2 - 1;
        int dashes = 14;
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                var p = new Vector2(x + 0.5f - S / 2f, y + 0.5f - S / 2f);
                float d = Mathf.Abs(p.magnitude - rad);
                float ang = (Mathf.Atan2(p.y, p.x) / (Mathf.PI * 2) + 1) % 1 * dashes;
                float f = ang - Mathf.Floor(ang);
                float on = Mathf.Clamp01(Mathf.Min(f, 0.62f - f) * rad * Mathf.PI * 2 / dashes + 0.5f);
                t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(w / 2 - d + 0.5f) * on));
            }
        t.Apply();
        return dashed = Sprite.Create(t, new Rect(0, 0, S, S), new Vector2(0.5f, 0.5f));
    }

    // ---- Its tip: its name, what it gives now, what the next point makes it, its price ----

    GameObject tip;

    void ShowTip(MetaState meta, string id)
    {
        if (tip != null) Mats.Kill(tip);
        var u = Meta.MetaUpgrade(id);
        if (u == null || !pos.ContainsKey(id)) return;
        int level = Mathf.Min(Meta.LevelOf(meta, id), u.Max);
        bool maxed = level >= u.Max;
        L.skills.TryGetValue(id, out var look);
        string vals = look != null ? look.say[Mathf.Max(level, 1) - 1] : u.Text;
        var next = new List<string>();
        if (look != null && look.icon && level > 0 && !maxed) next.Add("Next: " + look.value[level]);
        if (!maxed) next.Add($"{Meta.PointCost(u)} petals");
        var why = maxed ? null : Meta.BuyUpgradeProblem(meta, id);
        var p = At(pos[id]);
        var panel = Hud.Glass(sky, "Tip", Look.GlassStrong);
        tip = panel.gameObject;
        var r = (RectTransform)panel.transform;
        r.anchorMin = r.anchorMax = new Vector2(0.5f, 0);
        // (Beside it, on the side with room.)
        bool left = p.x > 0;
        r.pivot = new Vector2(left ? 1 : 0, 0.5f);
        r.anchoredPosition = p + new Vector2(left ? -34 : 34, 0);
        r.sizeDelta = new Vector2(300, 118);
        var t = Hud.Label(panel.transform, $"<b>{u.Name.ToUpperInvariant()}</b>\n<size=80%>{vals}</size>\n<size=62%><color=#9aa0ac>{string.Join(" · ", next).ToUpperInvariant()}</color>{(why != null && !maxed ? $"\n<color=#b0b5c0>{why}</color>" : "")}</size>", 15, Look.Ink, true, 500, 4, TextAlignmentOptions.Left);
        t.textWrappingMode = TextWrappingModes.Normal;
        t.margin = new Vector4(18, 10, 18, 10);
        t.raycastTarget = false;
        panel.raycastTarget = false;
    }

    // ---- Learning, undoing, resetting ----

    void Pick(string id)
    {
        var meta = CampaignView.LoadMeta();
        tipFor = id;
        // (Kinship's or Fellowship's first point: its race picked first.)
        bool affinity = id == Meta.AffinitySkill["primary"] || id == Meta.AffinitySkill["secondary"];
        if (affinity && Meta.LevelOf(meta, id) == 0 && Meta.BuyUpgradeProblem(meta, id) == null)
        {
            aff = (id, null);
            Sound.Play("hover");
            Draw();
            return;
        }
        var why = Meta.BuyUpgradeProblem(meta, id);
        if (why != null)
        {
            Sound.Play("error");
            Draw();
            return;
        }
        // (A battery charging up, higher with each point already in it.)
        Sound.Play("charge-" + Mathf.Clamp(Meta.LevelOf(meta, id), 0, 3));
        CampaignView.SaveMeta(Meta.BuyUpgrade(meta, id));
        placed.Add(id);
        just = id;
        resetArmed = false;
        Draw();
    }

    void Undo(int n)
    {
        var meta = CampaignView.LoadMeta();
        for (int i = 0; i < n && placed.Count > 0; i++)
        {
            meta = Meta.RefundUpgrade(meta, placed[placed.Count - 1]);
            placed.RemoveAt(placed.Count - 1);
        }
        CampaignView.SaveMeta(meta);
        just = null;
        Sound.Play("hover");
        Draw();
    }

    void Reset()
    {
        var meta = CampaignView.LoadMeta();
        var why = Meta.ResetSkillsProblem(meta);
        if (why != null) { resetArmed = false; Sound.Play("error"); Draw(); return; }
        if (!resetArmed) { resetArmed = true; Sound.Play("hover"); Draw(); return; }
        resetArmed = false;
        CampaignView.SaveMeta(Meta.ResetSkills(meta));
        placed.Clear();
        just = null;
        Sound.Play("upgrade");
        Draw();
    }

    // ---- Kinship's or Fellowship's first point: which race ----

    void Affinity(MetaState meta)
    {
        var (skill, race) = aff.Value;
        bool primary = skill == Meta.AffinitySkill["primary"];
        int? other = primary ? meta.Affinity?.Secondary : meta.Affinity?.Primary;
        // (.aff-pop-wrap: the page washed in its paper at 0.55, the popover in the middle; a tap outside cancels.)
        var veil = Hud.Rect(root, "Affinity");
        Hud.Fill(veil);
        var vi = veil.gameObject.AddComponent<Image>();
        vi.color = new Color(251 / 255f, 251 / 255f, 252 / 255f, 0.55f);
        veil.gameObject.AddComponent<Button>().onClick.AddListener(() => { aff = null; Draw(); });
        var u = Meta.MetaUpgrade(skill);
        var why = Meta.BuyUpgradeProblem(meta, skill);
        bool can = race != null && why == null;
        // (.aff-race: 84 across, padded 10 6 8, 5 between its emblem (40), its name (0.5rem) and, taken by the other
        // skill, which (0.58rem); all as tall as the tallest.)
        bool anyTaken = Modes.CoreRaces.Any(r => other == r);
        float raceW = 84 * Z, raceH = (10 + 40 + 5 + 0.5f * 16 * 1.25f + (anyTaken ? 5 + 0.58f * 16 * 1.25f : 0) + 8) * Z;
        float racesW = Modes.CoreRaces.Length * raceW + (Modes.CoreRaces.Length - 1) * 10 * Z;
        // (.aff-pop: padded 18 20 16, its rows 12 apart: the name (0.8rem), the question (0.82rem, 4 up), the races, the
        // buttons (34).)
        float h4 = 0.8f * 16 * Z * 1.25f, pH = 0.82f * 16 * Z * 1.25f, btnH = (0.66f * 16 * 1.25f + 2 * 9 + 2) * Z;
        float popW = racesW + 2 * 20 * Z, popH = 18 * Z + h4 + 12 * Z - 4 * Z + pH + 12 * Z + raceH + 12 * Z + btnH + 16 * Z;
        var pop = WebLook.Rounded(veil, "Pop", Color.white, 18 * Z);
        pop.raycastTarget = true;
        Hud.At(pop.rectTransform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(popW, popH));
        WebLook.Shadow(pop, 14 * Z, 40 * Z, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.18f), 18 * Z, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.1f));
        pop.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        float y = 18 * Z;
        WebLook.Words(WebLook.Box(pop.transform, "Name", 0, y, popW, h4), u.Name.ToUpperInvariant(), 0.8f * 16 * Z, 0.3f, Look.Ink, true, 500).margin = new Vector4(0.3f * 0.8f * 16 * Z, 0, 0, 0);
        y += h4 + 12 * Z - 4 * Z;
        WebLook.Words(WebLook.Box(pop.transform, "Ask", 0, y, popW, pH), primary ? "Which race do you favour?" : "And which race besides?", 0.82f * 16 * Z, 0, Look.InkSoft, false, 400);
        y += pH + 12 * Z;
        for (int i = 0; i < Modes.CoreRaces.Length; i++)
        {
            int r = Modes.CoreRaces[i];
            bool taken = other == r, on = race == r;
            var cell = WebLook.Rounded(pop.transform, "Race " + r, on ? Color.white : WebLook.Hex("#f6f7fa"), 14 * Z);
            cell.raycastTarget = true;
            WebLook.Box(cell.rectTransform, 20 * Z + i * (raceW + 10 * Z), y, raceW, raceH);
            var rc = WebLook.Hex(BuilderFactionColour(r));
            if (on) WebLook.Shadow(cell, 4 * Z, 12 * Z, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.12f), 14 * Z, 2 * Z, rc);
            else WebLook.Shadow(cell, 0, 0, Color.clear, 14 * Z, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.08f));
            var b = cell.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            b.interactable = !taken;
            b.onClick.AddListener(() => { aff = (skill, r); Sound.Play("hover"); Draw(); });
            if (taken) cell.gameObject.AddComponent<CanvasGroup>().alpha = 0.4f;
            // Its emblem: the race's mark (32) on a white disc (40) ringed faintly.
            var disc = WebLook.Rounded(cell.transform, "Emblem", Color.white, 999);
            WebLook.Box(disc.rectTransform, (raceW - 40 * Z) / 2, 10 * Z, 40 * Z, 40 * Z);
            WebLook.Shadow(disc, 0, 0, Color.clear, 999, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.12f));
            var ei = WebLook.Box(disc.transform, "Mark", 4 * Z, 4 * Z, 32 * Z, 32 * Z).gameObject.AddComponent<RawImage>();
            ei.texture = Resources.Load<Texture2D>($"Icons/faction-f{r + 1}");
            ei.raycastTarget = false;
            float ty = 10 * Z + 40 * Z + 5 * Z;
            WebLook.Words(WebLook.Box(cell.transform, "Name", 0, ty, raceW, 0.5f * 16 * Z * 1.25f), Races.RaceNames[r].ToUpperInvariant(), 0.5f * 16 * Z, 0.16f, Look.Ink, true, 500).raycastTarget = false;
            if (taken)
                WebLook.Words(WebLook.Box(cell.transform, "Taken", 0, ty + 0.5f * 16 * Z * 1.25f + 5 * Z, raceW, 0.58f * 16 * Z * 1.25f), primary ? "fellowship" : "kinship", 0.58f * 16 * Z, 0, Look.InkFaint, false, 400).raycastTarget = false;
        }
        y += raceH + 12 * Z;
        // The buttons (.aff-acts, 10 apart, in the middle): cancel (.btn), and confirm with its price (.btn-primary, the
        // petal and how many 4 apart after its words); faded to 0.4 until a race is picked.
        float fs = 0.66f * 16 * Z;
        var cancel = WebLook.Button(pop.transform, "cancel", () => { aff = null; Draw(); }, false, fs, 0.14f);
        var ct = cancel.GetComponentInChildren<TextMeshProUGUI>();
        float cw = ct.GetPreferredValues(ct.text).x + 2 * 16 * Z + 2 * Z;
        var ok = WebLook.Button(pop.transform, "", () =>
        {
            var m = CampaignView.LoadMeta();
            if (aff?.race == null || Meta.BuyUpgradeProblem(m, skill) != null) { Sound.Play("error"); return; }
            m = Meta.SetAffinity(Meta.BuyUpgrade(m, skill), primary ? "primary" : "secondary", aff.Value.race);
            CampaignView.SaveMeta(m);
            placed.Add(skill);
            just = skill;
            aff = null;
            Sound.Play("upgrade");
            Draw();
        }, true, fs, 0.14f);
        ok.interactable = can;
        // (Faded whole, words and all, by the group below; not twice over by the button's own tint.)
        var okColours = ok.colors;
        okColours.disabledColor = Color.white;
        ok.colors = okColours;
        var okT = ok.GetComponentInChildren<TextMeshProUGUI>();
        okT.text = "CONFIRM ·";
        okT.alignment = TextAlignmentOptions.Left;
        var price = WebLook.Words(ok.transform, Meta.PriceOf(u, 0).ToString(), fs, 0.14f, Look.Ink, true, 700, TextAlignmentOptions.Left);
        float w1 = okT.GetPreferredValues(okT.text).x + 0.14f * fs, w2 = price.GetPreferredValues(price.text).x + 0.14f * fs;
        float okW = 2 * 16 * Z + 2 * Z + w1 + 4 * Z + fs + 4 * Z + w2;
        WebLook.Box(okT.rectTransform, 17 * Z, 0, w1 + 4, btnH);
        okT.margin = Vector4.zero;
        var petal = WebLook.Box(ok.transform, "Petal", 17 * Z + w1 + 4 * Z, (btnH - fs) / 2, fs, fs).gameObject.AddComponent<RawImage>();
        petal.texture = Resources.Load<Texture2D>("Icons/purse-petal");
        petal.raycastTarget = false;
        WebLook.Box(price.rectTransform, 17 * Z + w1 + 4 * Z + fs + 4 * Z, 0, w2 + 4, btnH);
        float bx = (popW - (cw + 10 * Z + okW)) / 2;
        WebLook.Box((RectTransform)cancel.transform, bx, y, cw, btnH);
        WebLook.Box((RectTransform)ok.transform, bx + cw + 10 * Z, y, okW, btnH);
        if (!can) ok.gameObject.AddComponent<CanvasGroup>().alpha = 0.4f;
    }

    /// <summary>A race's colour (factions.ts FACTION_COLOUR).</summary>
    static string BuilderFactionColour(int r) => r >= 0 && r < FactionColours.Length ? FactionColours[r] : "#8a93a6";
    static readonly string[] FactionColours = { "#6f9fd8", "#d48a7c", "#c9a95e", "#a08bcb", "#5d5398", "#c7783e", "#8fa6c4", "#d9503a" };

    // ---- Sprites: a ring (a level's arc), half an ellipse (a petal's lobe), a dash ----

    static Sprite Ring
    {
        get
        {
            if (ring != null) return ring;
            const int S = 128;
            var t = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            float rad = 22f / 24 * S / 2, w = 2.4f / 48 * S;
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float d = Mathf.Abs(new Vector2(x + 0.5f - S / 2f, y + 0.5f - S / 2f).magnitude - rad);
                    t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(w / 2 - d + 0.5f)));
                }
            t.Apply();
            return ring = Sprite.Create(t, new Rect(0, 0, S, S), new Vector2(0.5f, 0.5f));
        }
    }

    static Sprite HalfEllipse
    {
        get
        {
            if (half != null) return half;
            const int W = 64, H = 256;
            var t = new Texture2D(W, H, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    float u = (x + 0.5f) / W * 2 - 1, v = (y + 0.5f) / H;
                    float e = Mathf.Sqrt(u * u + v * v);
                    t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01((1 - e) * 60)));
                }
            t.Apply();
            return half = Sprite.Create(t, new Rect(0, 0, W, H), new Vector2(0.5f, 0));
        }
    }

    static Texture2D Dash
    {
        get
        {
            if (dash != null) return dash;
            dash = new Texture2D(8, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Point };
            for (int x = 0; x < 8; x++) dash.SetPixel(x, 0, new Color(1, 1, 1, x < 4 ? 1 : 0));
            dash.Apply();
            return dash;
        }
    }
}
