using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The Captain's page (campaign.ts renderCrew, renderHeroPanel, tierSheet): the Captain on the left (the menu's
/// scene, framed on him alone), and on the right his tree, laid out as circuitry: a spine trace up the middle from his
/// emblem, each upgrade a solder pad off it (its name and what it does beside it) on a trace bent at right angles,
/// each Astral Gate a chip on the spine between two tiers. A tap learns a pad (undo or clear takes it back while the
/// page is open); a learnt ability is carried or left behind, a lead led with or not, a singularity carried.
/// </summary>
public class CrewView : MonoBehaviour
{
    class Look_ { public string title, what, colour, owned; public bool on; }
    class Known { public string arg, title, what, colour, sub; public bool on; }

    RectTransform root;
    MenuView menu;
    readonly List<string> placed = new List<string>();
    readonly List<CaptainMeta> history = new List<CaptainMeta>();
    readonly List<CompanionMeta> compHistory = new List<CompanionMeta>();
    /// <summary>Whose tree is open: the Captain's (null) or one of the crew's.</summary>
    string tab;
    CampaignBackdrop scene;
    bool resetArmed;
    ScrollRect scroll;
    float keepScroll = -1;

    static readonly float[] Cols = { 40, 275, 545, 780 };
    const float Spine = 512, Row = 96, Head = 46, GateH = 110, RootH = 110, Top = 30;
    /// <summary>The sheet's width (its 1000 units across): the tree's column, 10 (CSS) in from each side.</summary>
    float SheetW => TreeW - 20 * Z;

    /// <summary>The page over its own (taken to fill the screen), laid out as the web lays it out at the screen's size, and again when that changes.</summary>
    public static CrewView Make(RectTransform parent, MenuView menu, CampaignBackdrop scene = null)
    {
        var layer = RefLayer.Make(parent, "Crew");
        var r = layer.Rect;
        var v = r.gameObject.AddComponent<CrewView>();
        v.root = r;
        v.layer = layer;
        v.menu = menu;
        v.scene = scene;
        layer.Changed = v.Draw;
        v.Draw();
        return v;
    }

    RefLayer layer;

    /// <summary>
    /// Where the page puts things (.up-shop.crew-panel): its padding (max(14, the safe area) at the top, on a short
    /// screen max(8, ...); max(18, ...) at the sides; max(10, ...) at the foot); its header (as tall as back) over its
    /// body, the left 40% of it who they are, the rest the tree.
    /// </summary>
    Vector4 PagePad
    {
        get
        {
            var sa = layer.Insets;
            return new Vector4(Mathf.Max((Css.MaxHeight(560) ? 8 : 14) * Z, sa.x), Mathf.Max(18 * Z, sa.y), Mathf.Max(10 * Z, sa.z), Mathf.Max(18 * Z, sa.w));
        }
    }
    // (The header (.crew-top) as tall as back (0.66rem words at 1.25, padded 8 above and below), or with the crew's
    // tabs, as tall as their bar; everything in it centred on it.)
    float headH = 30 * Z;
    float BodyTop => PagePad.x + headH;
    float BodyW => layer.W - PagePad.y - PagePad.w;
    float WhoW => BodyW * 0.4f;
    float TreeW => BodyW - WhoW;
    float TreeH => layer.H - BodyTop - PagePad.z;

    static Color Hex(string h) => ColorUtility.TryParseHtmlString(h, out var c) ? c : Look.InkSoft;

    const float Z = WebLook.Zoom;

    void Draw()
    {
        if (scroll != null) keepScroll = scroll.verticalNormalizedPosition;
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var meta = CampaignView.LoadMeta();
        var crew = Meta.CompanionsFound(meta);
        if (tab != null && !crew.Contains(tab)) tab = null;
        scene?.Focus(tab ?? "captain");
        headH = crew.Count > 0 ? Mathf.Max(30 * Z, 2 * 8 * Z + 0.58f * 16 * Z * 1.25f + 8 * Z) : 30 * Z;
        // The header (.crew-top): back, then undo, clear and the page's own tools, 6 apart.
        var back = WebLook.UpBack(root, () => menu.Show("campaign"), PagePad.w, PagePad.x + (headH - 42) / 2);
        x = PagePad.w + ((RectTransform)back.transform).sizeDelta.x + 6 * Z;
        if (placed.Count > 0)
        {
            Small("undo", Undo, Look.InkSoft);
            Small("clear", Clear, Look.InkSoft);
        }
        // A tab each: the Captain and each of the crew found, their points to spend beside them.
        if (crew.Count > 0) Tabs(meta, crew);
        if (tab == null) CaptainPage(meta);
        else CompanionPage(meta, tab);
    }

    float x;

    /// <summary>One of the header's tools (.up-plan-undo): small spaced capitals; a reset its price after it.</summary>
    void Small(string label, System.Action act, Color ink, bool petals = false)
    {
        var r = Hud.Rect(root, label);
        var t = WebLook.Words(r, label.ToUpperInvariant(), 0.56f * 16 * Z, 0.2f, ink, true, 500, TextAlignmentOptions.Left);
        float w = t.GetPreferredValues(t.text).x;
        if (petals)
        {
            var p = WebLook.Centred(r, "Petal", w + 6 * Z + 7, 21, 14, 14).gameObject.AddComponent<RawImage>();
            p.texture = Resources.Load<Texture2D>("Icons/purse-petal");
            p.raycastTarget = false;
            var n = WebLook.Words(WebLook.Box(r, "Price", w + 6 * Z + 16, 0, 40, 42), Meta.SkillResetPetals.ToString(), 0.56f * 16 * Z, 0.04f, ink, true, 500, TextAlignmentOptions.Left);
            w += 6 * Z + 16 + n.GetPreferredValues(n.text).x;
        }
        // (Unpadded: as wide as its words, 6 from the next.)
        WebLook.Box(r, x, PagePad.x + (headH - 42) / 2, w, 42);
        var hit = r.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        r.gameObject.AddComponent<Button>().onClick.AddListener(() => act());
        x += w + 6 * Z;
    }

    /// <summary>
    /// The tabs (.crew-tabs), in the middle of the header: a capsule of white, a tab each (the Captain, then each of the
    /// crew found), the one open white and ringed; a dark badge of the points each has to spend.
    /// </summary>
    void Tabs(MetaState meta, List<string> crew)
    {
        var ids = new List<string> { null };
        ids.AddRange(crew);
        float font = 0.58f * 16 * Z, pad = 16 * Z, gap = 7 * Z, badgeH = 16 * Z;
        var bar = WebLook.Rounded(root, "Tabs", new Color(1, 1, 1, 0.92f), 999);
        bar.sprite = Hud.Rounded;
        bar.type = Image.Type.Sliced;
        var labels = new List<(TextMeshProUGUI t, float w, int pts)>();
        float total = 4 * Z;
        foreach (var id in ids)
        {
            string name = id == null ? "CAPTAIN" : Companions.CompanionDef(id).Name.Split(' ')[0].ToUpperInvariant();
            int pts = id == null ? Meta.PointsLeft(meta) : Meta.CompanionPoints(meta, id);
            var t = WebLook.Words(Hud.Fill(Hud.Rect(bar.transform, "Name")), name, font, 0.24f, id == tab ? Look.Ink : Look.InkFaint, true, 500, TextAlignmentOptions.Left);
            float w = 2 * pad + t.GetPreferredValues(name).x + (pts > 0 ? gap + Mathf.Max(badgeH, 8 * Z + 9 * pts.ToString().Length) : 0);
            labels.Add((t, w, pts));
            total += w + 4 * Z;
        }
        float h = 2 * 8 * Z + font * 1.25f, barH = h + 8 * Z;
        bar.pixelsPerUnitMultiplier = 22f / (barH / 2);
        var br = bar.rectTransform;
        br.anchorMin = br.anchorMax = br.pivot = new Vector2(0.5f, 1);
        br.anchoredPosition = new Vector2(0, -(PagePad.x + (headH - barH) / 2));
        br.sizeDelta = new Vector2(total, barH);
        WebLook.Shadow(bar, 4 * Z, 12 * Z, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.06f), barH / 2, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.1f));
        float at = 4 * Z;
        for (int i = 0; i < ids.Count; i++)
        {
            var id = ids[i];
            var (t, w, pts) = labels[i];
            bool on = id == tab;
            var cell = WebLook.Rounded(bar.transform, "Tab", on ? Color.white : new Color(1, 1, 1, 0), 999);
            cell.sprite = Hud.Rounded;
            cell.type = Image.Type.Sliced;
            cell.pixelsPerUnitMultiplier = 22f / (h / 2);
            cell.raycastTarget = true;
            WebLook.Box(cell.rectTransform, at, 4 * Z, w, h);
            if (on) WebLook.Shadow(cell, 3 * Z, 8 * Z, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.1f), h / 2, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.16f));
            t.transform.SetParent(cell.transform, false);
            WebLook.Box((RectTransform)t.transform, pad, 0, w, h);
            if (pts > 0)
            {
                string n = pts.ToString();
                float bw = Mathf.Max(badgeH, 8 * Z + 9 * n.Length);
                var badge = WebLook.Rounded(cell.transform, "Points", WebLook.Hex("#3a4256"), badgeH / 2);
                WebLook.Box(badge.rectTransform, w - pad - bw, (h - badgeH) / 2, bw, badgeH);
                WebLook.Words(badge.transform, n, 0.52f * 16 * Z, 0, Color.white, true, 500);
            }
            cell.gameObject.AddComponent<Button>().onClick.AddListener(() =>
            {
                tab = id;
                placed.Clear();
                history.Clear();
                compHistory.Clear();
                keepScroll = -1;
                scroll = null;
                Sound.Play("hover");
                Draw();
            });
            at += w + 4 * Z;
        }
    }

    /// <summary>
    /// Who, on the left (.crew-who): their title (by the gates passed) large and widely spaced, then the points to spend
    /// beside the gold chevrons and the level small after; a companion's note on how they learn under that.
    /// </summary>
    void Who(string title, int points, string level, string note = null)
    {
        // (.crew-who: clamp(6, 3vh, 28) down from the header; its title clamp(1.3rem, 5vh, 2.4rem).)
        float W = WhoW, X = PagePad.w, fs = Css.Clamp(1.3f * 16 * Z, 5 * layer.H / 100, 2.4f * 16 * Z), top = BodyTop + Css.Clamp(6 * Z, 3 * layer.H / 100, 28 * Z);
        var h = WebLook.Words(Hud.Fill(Hud.Rect(root, "Title")), title.ToUpperInvariant(), fs, 0.45f, Look.Ink, true, 400, TextAlignmentOptions.Top);
        h.textWrappingMode = TextWrappingModes.Normal;
        // (Its text-indent as wide as the letter-spacing trailing its last letter: the words centred as they are.)
        // (Its lines each 1.25 its size, as CSS sets them.)
        float one = Mathf.Max(1, h.GetPreferredValues("A").y), th = Mathf.Max(1, Mathf.Round(h.GetPreferredValues(h.text, W - 0.45f * fs, 0).y / one)) * fs * 1.25f;
        WebLook.Box(h.rectTransform, X, top, W, th + 4);
        float y = top + th + 6 * Z;
        var count = WebLook.Words(Hud.Fill(Hud.Rect(root, "Points")), points.ToString(), 1.15f * 16 * Z, 0, Look.Ink, true, 500, TextAlignmentOptions.Left);
        var small = WebLook.Words(Hud.Fill(Hud.Rect(root, "Level")), level.ToUpperInvariant(), 0.56f * 16 * Z, 0.22f, Look.InkFaint, true, 400, TextAlignmentOptions.Left);
        float cw = count.GetPreferredValues(count.text).x, sw = small.GetPreferredValues(small.text).x;
        float rowW = 28 + 6 * Z + cw + 10 * Z + sw, x0 = X + W / 2 - rowW / 2;
        // (.up-xp: a row as tall as the count's line box (1.15rem at 1.25), the mark, count and words centred on it.)
        float rowH = 1.15f * 16 * Z * 1.25f, smallH = 0.56f * 16 * Z * 1.25f;
        XpMark(root, x0, y + (rowH - 28) / 2, 28);
        WebLook.Box((RectTransform)count.transform, x0 + 28 + 6 * Z, y, cw + 4, rowH);
        WebLook.Box((RectTransform)small.transform, x0 + 28 + 6 * Z + cw + 10 * Z, y + (rowH - smallH) / 2, sw + 8, smallH);
        if (note != null)
        {
            var n = WebLook.Words(Hud.Fill(Hud.Rect(root, "Learns")), note.ToLowerInvariant(), 0.7f * 16 * Z, 0.06f, WebLook.Hex("#7d8496"), false, 400, TextAlignmentOptions.Top);
            n.textWrappingMode = TextWrappingModes.Normal;
            float nw = Mathf.Min(W, 34 * 0.55f * 0.7f * 16 * Z);
            WebLook.Box(n.rectTransform, X + (W - nw) / 2, y + rowH + 6 * Z, nw, 80);
        }
    }

    /// <summary>Experience's mark (campaign.ts XP_MARK): two gold chevrons rising, in a square at a point of the page.</summary>
    static void XpMark(Transform parent, float x, float y, float size)
    {
        var r = WebLook.Box(parent, "Experience", x, y, size, size);
        var lines = r.gameObject.AddComponent<UiLines>();
        float k = size / 20;
        Vector2 P(float px, float py) => new Vector2((px - 10) * k, (10 - py) * k);
        var gold = WebLook.Hex("#b8953f");
        lines.Add(new List<Vector2> { P(4.6f, 10.2f), P(10, 5), P(15.4f, 10.2f) }, gold, 2.1f * k);
        lines.Add(new List<Vector2> { P(4.6f, 15.2f), P(10, 10), P(15.4f, 15.2f) }, gold, 2.1f * k);
    }

    void CaptainPage(MetaState meta)
    {
        var c = Meta.CaptainMeta(meta);
        int left = Meta.PointsLeft(meta);
        if (Meta.CaptainPointsSpent(meta) > 0) Small(resetArmed ? "confirm reset" : "reset", Reset, resetArmed ? Look.Ink : Look.InkSoft, true);
        Who(Ascent.CaptainTitles.ElementAtOrDefault(c.Gates ?? 0) ?? "The Captain", left, $"skill point{(left == 1 ? "" : "s")} · level {Meta.LevelFor(meta.Xp).Level}");
        var g = Meta.CaptainGifts(meta);
        var a = new AscentState { Nodes = c.Nodes ?? new List<string>(), Gates = c.Gates ?? 0 };
        var wall = Cards.Rules.CaptainSingularities["wall"];
        var brace = Captain.CaptainAbility(Captain.CaptainStartAbility).Ability;
        bool wallOn = (c.Sing ?? "wall") == "wall", braceOn = c.Equipped.Contains(Captain.CaptainStartAbility);
        var known = new List<Known>
        {
            new Known { arg = "start:brace", title = brace.Name.ToLowerInvariant(), what = brace.Text, colour = "#4fae9b", on = braceOn, sub = braceOn ? "carried" : "tap to carry" },
            new Known { arg = "start:wall", title = wall.Name.ToLowerInvariant(), what = SingWords(wall), colour = "#6f8fd8", on = wallOn, sub = wallOn ? "carried" : "tap to carry" },
        };
        var names = Ascent.CaptainTitles.Select(t => t.Replace("The ", "").ToLowerInvariant()).ToList();
        Tree(Ascent.CaptainTree, a, left, names, (n, owned) => Describe(n, owned, c, g), known);
    }

    /// <summary>
    /// A companion's tree: their stats, each a path, and what they can learn; laid out as the Captain's is. Experience
    /// comes only from what they do in battle. Aboard for the next run, or ashore (only so many fly at once).
    /// </summary>
    void CompanionPage(MetaState meta, string id)
    {
        var d = Companions.CompanionDef(id);
        var a = Meta.CompanionTree(meta, id);
        int left = Meta.CompanionPoints(meta, id);
        var crew = Meta.ActiveCrew(meta);
        bool aboard = crew.Contains(id), full = !aboard && crew.Count >= Companions.ActiveCrew;
        if (Meta.CompanionsFound(meta).Count > Companions.ActiveCrew || !aboard)
            Small(aboard ? "aboard" : full ? $"ashore · {Companions.ActiveCrew} aboard" : "ashore · send aboard", () =>
            {
                if (full) { Sound.Play("error"); return; }
                CampaignView.SaveMeta(Meta.SetCrewAboard(CampaignView.LoadMeta(), id, !aboard));
                Sound.Play("hover");
                Draw();
            }, aboard ? Look.Ink : Look.InkSoft);
        var lv = Companions.CompanionLevel(meta.Companions[id].Xp);
        var title = d.Titles.ElementAtOrDefault(a.Gates) ?? d.Name;
        var parts = title.Split(new[] { ", " }, System.StringSplitOptions.None);
        Who(parts.Length > 1 ? parts[1] : title, left, $"skill point{(left == 1 ? "" : "s")} · level {lv.Level} · {lv.Into}/{lv.Need}", d.LearnsText);
        var first = d.Traits.First(k => k.Id == d.Start);
        var known = new List<Known> { new Known { arg = "", title = first.Name.ToLowerInvariant(), what = first.Text, colour = "#4fae9b", on = true, sub = "known" } };
        var names = d.Titles.Select(t => { var p = t.Split(new[] { ", " }, System.StringSplitOptions.None); return (p.Length > 1 ? p[1] : t).ToLowerInvariant(); }).ToList();
        Tree(Ascent.CompanionTrees[id], a, left, names, (n, owned) =>
        {
            var tr = n.Give.Trait != null ? d.Traits.FirstOrDefault(k => k.Id == n.Give.Trait) : null;
            return tr != null ? new Look_ { title = tr.Name.ToLowerInvariant(), what = tr.Text, colour = "#4fae9b", owned = "" } : StatLook(n);
        }, known);
    }

    // ---- What each pad is ----

    string Pay(string id)
    {
        var a = Captain.CaptainAbility(id).Ability;
        var parts = new List<string>();
        if ((a.Cost ?? 0) > 0) parts.Add($"{a.Cost} energy");
        if ((a.Pay?.Stability ?? 0) > 0) parts.Add($"−{a.Pay.Stability} stability");
        if ((a.Pay?.SelfHeat ?? 0) > 0) parts.Add($"{{heat:{a.Pay.SelfHeat}}} to your sun");
        return string.Join(", ", parts);
    }

    /// <summary>A singularity as its card text has it (singularities.ts singularityLine): its name, what charges it, what it does.</summary>
    static string SingWords(Singularity k) => $"{{sing:{k.Name}}}{BattleView.ChargeWords(k.Charge, k.Need)}: {k.Text}";

    Look_ Describe(AscentNode x, bool owned, CaptainMeta c, CaptainGifts g)
    {
        bool full = c.Equipped.Count(a => g.Abilities.Contains(a)) >= g.SlotCount;
        if (x.Give.Ability != null)
        {
            var a = Captain.CaptainAbility(x.Give.Ability).Ability;
            bool on = c.Equipped.Contains(x.Give.Ability);
            var pay = Pay(x.Give.Ability);
            return new Look_ { title = a.Name.ToLowerInvariant(), what = (pay != "" ? pay + ": " : "") + a.Text, colour = "#4fae9b", on = owned && on, owned = owned ? (on ? "carried" : full ? "slots full" : "tap to carry") : "" };
        }
        if (x.Give.Lead != null)
        {
            var l = Captain.CaptainLead(x.Give.Lead);
            bool on = c.Lead == x.Give.Lead;
            return new Look_ { title = l.Name.ToLowerInvariant(), what = "leads: " + l.Text, colour = "#c98a4b", on = owned && on, owned = owned ? (on ? "leading" : "tap to lead") : "" };
        }
        if (x.Give.Sing != null)
        {
            var k = Cards.Rules.CaptainSingularities[x.Give.Sing];
            bool on = (c.Sing ?? "wall") == x.Give.Sing;
            return new Look_ { title = k.Name.ToLowerInvariant(), what = SingWords(k), colour = "#6f8fd8", on = owned && on, owned = owned ? (on ? "carried" : "tap to carry") : "" };
        }
        return StatLook(x);
    }

    static Look_ StatLook(AscentNode x)
    {
        var colour = (x.Give.Attack ?? 0) > 0 ? "#d9644a" : (x.Give.Stability ?? 0) > 0 ? "#d8a53c" : (x.Give.Cheaper ?? 0) > 0 ? "#5cae7c" : "#8a93a8";
        return new Look_ { title = x.Name, what = "", colour = colour, owned = "" };
    }

    // ---- The sheet: the tiers from the foot up, the gates between them, the spine ----

    void Tree(List<AscentNode> tree, AscentState a, int left, List<string> names, System.Func<AscentNode, bool, Look_> describe, List<Known> known)
    {
        string[] roman = { "I", "II", "III", "IV" };
        int Rows(int n) => Mathf.Max(1, (n + Cols.Length - 1) / Cols.Length);
        var tiers = Enumerable.Range(1, Ascent.Tiers).Select(t => tree.Where(n => n.Tier == t).ToList()).ToList();
        float H = Top + RootH + Rows(known.Count) * Row + tiers.Sum(l => Head + Rows(l.Count) * Row) + (Ascent.Tiers - 1) * GateH + 30;

        // The scroller (.crew-tree): the right 60% of the page under the header, the sheet in it 10 in from each side;
        // across, the sheet's 1000 units its width; down, its units CSS pixels (drawn 1.45 times).
        var view = WebLook.Box(root, "Tree", PagePad.w + WhoW, BodyTop, TreeW, TreeH);
        view.gameObject.AddComponent<RectMask2D>();
        var hit = view.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        var sheet = Hud.Rect(view, "Sheet");
        sheet.anchorMin = new Vector2(0.5f, 1);
        sheet.anchorMax = new Vector2(0.5f, 1);
        sheet.pivot = new Vector2(0.5f, 1);
        sheet.sizeDelta = new Vector2(SheetW, H * Z);
        scroll = view.gameObject.AddComponent<ScrollRect>();
        scroll.content = sheet;
        scroll.horizontal = false;
        scroll.movementType = ScrollRect.MovementType.Clamped;
        scroll.scrollSensitivity = 40;
        // The board: the cards' faint circuit traces (a tile 340 across), faded out toward each side.
        var board = Hud.Rect(sheet, "Board");
        Hud.Fill(board);
        var bi = board.gameObject.AddComponent<RawImage>();
        bi.texture = Resources.Load<Texture2D>("Icons/circuit-dwarf");
        bi.uvRect = new Rect(0, 0, SheetW / (340 * Z), H * Z / (340 * Z));
        bi.color = new Color(1, 1, 1, 0.35f);
        bi.raycastTarget = false;
        for (int side = 0; side < 2; side++)
        {
            var fade = Hud.Rect(sheet, "Edge");
            fade.anchorMin = new Vector2(side, 0);
            fade.anchorMax = new Vector2(side, 1);
            fade.pivot = new Vector2(side, 0.5f);
            fade.sizeDelta = new Vector2(SheetW * 0.12f, 0);
            fade.anchoredPosition = Vector2.zero;
            var fi = fade.gameObject.AddComponent<RawImage>();
            fi.texture = EdgeFade(side == 0);
            fi.color = Look.Paper;
            fi.raycastTarget = false;
        }
        var lines = Hud.Rect(sheet, "Lines");
        Hud.Fill(lines);
        var pads = Hud.Rect(sheet, "Pads");
        Hud.Fill(pads);

        Vector2 P(float sx, float sy) => new Vector2(sx / 1000f * SheetW, -sy * Z);
        void Seg(float x0, float y0, float x1, float y1, Color col, float w)
        {
            var r = Hud.Rect(lines, "Trace");
            r.anchorMin = r.anchorMax = new Vector2(0, 1);
            Vector2 p = P(x0, y0), q = P(x1, y1);
            r.pivot = new Vector2(0.5f, 0.5f);
            r.anchoredPosition = (p + q) / 2;
            var d = q - p;
            r.sizeDelta = new Vector2(Mathf.Abs(d.x) + w, Mathf.Abs(d.y) + w);
            var img = r.gameObject.AddComponent<Image>();
            img.color = col;
            img.raycastTarget = false;
        }
        // (A via: r 3.4 of the sheet's units, stretched as the sheet is, 0.9 across and 1.45 down; ringed.)
        void Via(float vx, float vy, bool lit)
        {
            var r = Hud.Rect(lines, "Via");
            r.anchorMin = r.anchorMax = new Vector2(0, 1);
            r.pivot = new Vector2(0.5f, 0.5f);
            r.anchoredPosition = P(vx, vy);
            r.sizeDelta = new Vector2(6.8f * SheetW / 1000 + 1.5f * Z, 6.8f * Z + 1.5f * Z);
            var ring = r.gameObject.AddComponent<Image>();
            ring.sprite = Hud.Circle;
            ring.color = lit ? WebLook.Hex("#4a5268") : new Color(120 / 255f, 132 / 255f, 160 / 255f, 0.5f);
            ring.raycastTarget = false;
            var fill = Hud.Rect(r, "Fill");
            Hud.Fill(fill);
            fill.offsetMin = Vector2.one * 1.5f * Z / 2;
            fill.offsetMax = -Vector2.one * 1.5f * Z / 2;
            var fi = fill.gameObject.AddComponent<Image>();
            fi.sprite = Hud.Circle;
            fi.color = lit ? WebLook.Hex("#4a5268") : WebLook.Hex("#f4f6fa");
            fi.raycastTarget = false;
        }
        Color Trace(bool lit, bool spine = false) => lit ? new Color(74 / 255f, 82 / 255f, 104 / 255f, 0.75f) : new Color(120 / 255f, 132 / 255f, 160 / 255f, spine ? 0.3f : 0.38f);

        float y = H - RootH;
        float rootY = y + 50;
        float current = -1;
        void Place(List<(string colour, bool lit, System.Action<float, float> make)> items)
        {
            int n = Rows(items.Count);
            for (int k = 0; k < items.Count; k++)
            {
                int r = k / Cols.Length, cc = k % Cols.Length;
                float py = y - Row * (n - r) + 28, px = Cols[cc];
                float by = py + 52;
                var col = Trace(items[k].lit);
                Seg(px, py, px, by, col, 2 * Z);
                Seg(px, by, Spine, by, col, 2 * Z);
                Via(px, by, items[k].lit);
                Via(Spine, by, items[k].lit);
                items[k].make(px, py);
            }
            y -= n * Row;
        }
        var spineTo = new List<(float y, bool lit)>();
        Place(known.Select(k => (k.colour, true, (System.Action<float, float>)((px, py) => Pad(pads, P(px, py), k.title, k.what, k.sub, Hex(k.colour), true, false, k.on, false, false, k.arg)))).ToList());
        spineTo.Add((y, true));
        for (int tier = 1; tier <= Ascent.Tiers; tier++)
        {
            bool reached = tier <= a.Gates + 1;
            // The tier's name and its picks (.cx-tier): silkscreen lettering across the middle of the sheet at its foot.
            var tl = WebLook.Rounded(pads, "Tier " + tier, WebLook.Hex("#eef1f6"), 4 * Z);
            var tt = WebLook.Words(tl.transform, $"{roman[tier - 1]} · {(names.ElementAtOrDefault(tier - 1) ?? "").ToUpperInvariant()}", 0.62f * 16 * Z, 0.26f, tier == a.Gates + 1 ? Look.Ink : Look.InkSoft, true, 400, TextAlignmentOptions.Left);
            var tp = WebLook.Words(tl.transform, $"{Ascent.TierPicksTaken(tree, a, tier)}/{Ascent.TierPicks}", 0.64f * 16 * Z, 0, Look.InkSoft, false, 400, TextAlignmentOptions.Left);
            float bw = tt.GetPreferredValues(tt.text).x, pw = tp.GetPreferredValues(tp.text).x;
            float lw = 10 * Z + bw + 10 * Z + pw + 10 * Z;
            var tr = tl.rectTransform;
            tr.anchorMin = tr.anchorMax = new Vector2(0.5f, 1);
            tr.pivot = new Vector2(0.5f, 1);
            tr.anchoredPosition = new Vector2(0, -(y - 30) * Z);
            tr.sizeDelta = new Vector2(lw, 24);
            WebLook.Box(tt.rectTransform, 10 * Z, 0, bw + 4, 24);
            WebLook.Box(tp.rectTransform, 10 * Z + bw + 10 * Z, 0, pw + 4, 24);
            if (!reached) tl.gameObject.AddComponent<CanvasGroup>().alpha = 0.5f;
            if (tier == a.Gates + 1) current = (y - 30) * Z + 12;
            y -= Head;
            Place(tiers[tier - 1].Select(n =>
            {
                bool owned = a.Nodes.Contains(n.Id);
                var look = describe(n, owned);
                var why = owned ? null : Ascent.AscentProblem(tree, a, n.Id, left);
                bool plan = owned && placed.Contains(n.Id);
                var sub = owned ? (look.owned != "" ? look.owned : "learnt") : why != null ? why.TrimEnd('.').ToLowerInvariant() : "1 point";
                return (look.colour, owned, (System.Action<float, float>)((px, py) => Pad(pads, P(px, py), look.title, look.what, sub, Hex(look.colour), owned, !owned && why == null, look.on, !owned && why != null, !reached, n.Id, plan)));
            }).ToList());
            spineTo.Add((y, reached));
            if (tier < Ascent.Tiers)
            {
                // The Astral Gate: a chip in the middle of the sheet; passed, it glows gold.
                bool passed = a.Gates >= tier;
                var why = passed ? null : a.Gates == tier - 1 ? Ascent.AscentProblem(tree, a, "gate", left) : "Reach the tier below first.";
                Gate(pads, new Vector2(SheetW / 2, -(y - GateH / 2) * Z), passed, why);
                y -= GateH;
                spineTo.Add((y, passed));
            }
        }
        // The spine: from the emblem up, lit as far as the character has climbed.
        float from = rootY - 30;
        foreach (var (sy, lit) in spineTo)
        {
            Seg(Spine, from, Spine, sy, Trace(lit, true), 3.5f * Z);
            from = sy;
        }
        Seg(Spine, from, Spine, Top, Trace(false, true), 3.5f * Z);
        Root(pads, new Vector2(SheetW / 2, -rootY * Z));
        Canvas.ForceUpdateCanvases();
        // (It opens on the tier the character stands in, that tier's name in the middle; then where it was scrolled.)
        float range = H * Z - TreeH;
        float want = current < 0 ? range : Mathf.Clamp(current - TreeH / 2f, 0, range);
        scroll.verticalNormalizedPosition = keepScroll >= 0 ? keepScroll : range > 0 ? 1 - want / range : 0;
    }

    static readonly Texture2D[] edges = new Texture2D[2];

    /// <summary>The board's fade at an edge: the page's paper, whole at the edge, gone 12% in.</summary>
    static Texture2D EdgeFade(bool leftSide)
    {
        int i = leftSide ? 0 : 1;
        if (edges[i] != null) return edges[i];
        var t = new Texture2D(32, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        for (int px = 0; px < 32; px++)
        {
            float k = (px + 0.5f) / 32;
            t.SetPixel(px, 0, new Color(1, 1, 1, leftSide ? 1 - k : k));
        }
        t.Apply();
        return edges[i] = t;
    }

    /// <summary>The emblem's socket where the spine begins (.cx-root): a dark disc, a gold heart ringed gold, glowing.</summary>
    static void Root(RectTransform parent, Vector2 at)
    {
        var socket = Hud.Rect(parent, "Root");
        socket.anchorMin = socket.anchorMax = new Vector2(0, 1);
        socket.pivot = new Vector2(0.5f, 0.5f);
        socket.anchoredPosition = at;
        socket.sizeDelta = Vector2.one * 40 * Z;
        var glow = Disc(socket, "Glow", 40 * Z + 2 * 18 * Z, new Color(226 / 255f, 194 / 255f, 106 / 255f, 0.6f), true);
        Disc(socket, "Ring", 40 * Z + 2 * 2 * Z, WebLook.Hex("#d8b65a"));
        Disc(socket, "Disc", 40 * Z, WebLook.Hex("#353b4c"));
        Disc(socket, "Rim", 2 * 11.5f * Z, WebLook.Hex("#d8b65a"));
        Disc(socket, "Heart", 2 * 8.5f * Z, WebLook.Hex("#f4dc8a"));
        glow.raycastTarget = false;
    }

    /// <summary>A disc (or a soft glow) centred in its parent, at a size.</summary>
    static Image Disc(RectTransform parent, string name, float size, Color colour, bool soft = false)
    {
        var r = Hud.Rect(parent, name);
        Hud.At(r, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size, size));
        var img = r.gameObject.AddComponent<Image>();
        img.sprite = soft ? Hud.Soft : Hud.Circle;
        if (soft)
        {
            img.type = Image.Type.Sliced;
            img.pixelsPerUnitMultiplier = 41f / (size / 2);
        }
        img.color = colour;
        img.raycastTarget = false;
        return img;
    }

    /// <summary>
    /// An upgrade (.cx-pad): its solder ring at the corner (pale; washed in its colour, to learn now; its colour and
    /// glowing, learnt; ringed white and its colour, carried), its name, what it does and where it stands beside it.
    /// </summary>
    void Pad(RectTransform parent, Vector2 at, string title, string what, string sub, Color colour, bool owned, bool afford, bool on, bool locked, bool ahead, string arg, bool planned = false)
    {
        float solderD = 18 * Z, labelX = solderD + 10 * Z, w = SheetW * 0.21f;
        var r = Hud.Rect(parent, title);
        r.anchorMin = r.anchorMax = new Vector2(0, 1);
        r.pivot = new Vector2(0, 1);
        r.anchoredPosition = at + new Vector2(-9 * Z, 9 * Z);
        var hit = r.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        if (!string.IsNullOrEmpty(arg)) r.gameObject.AddComponent<Button>().onClick.AddListener(() => Pick(arg));
        var solder = WebLook.Box(r, "Solder", 0, 0, solderD, solderD);
        var s = solder;
        if (owned || on) Disc(s, "Glow", solderD + 2 * (on ? 14 : 10) * Z, new Color(colour.r, colour.g, colour.b, 0.7f), true);
        if (on)
        {
            Disc(s, "Ring", solderD + 2 * 4 * Z, colour);
            Disc(s, "White", solderD + 2 * 2.5f * Z, Color.white);
        }
        else Disc(s, "Ring", solderD + 2 * 1.5f * Z, owned || afford ? colour : new Color(120 / 255f, 132 / 255f, 160 / 255f, 0.6f));
        Disc(s, "Fill", solderD, owned ? colour : afford ? Color.Lerp(Color.white, colour, 0.45f) : WebLook.Hex("#c4ccdb"));
        Disc(s, "Dot", 2 * (owned ? 2.75f : 3.25f) * Z, owned || afford ? Color.white : WebLook.Hex("#f4f6fa"));
        if (planned) solder.gameObject.AddComponent<WebLook.Pulse>();
        // Its name, what it does, and where it stands.
        float textW = w - labelX;
        var words = WebLook.Box(r, "Words", labelX, 1 * Z, textW, 100);
        var group = words.gameObject.AddComponent<CanvasGroup>();
        group.alpha = locked || ahead ? 0.5f : 1;
        group.blocksRaycasts = false;
        float y = 0;
        var name = WebLook.Words(words, title.ToUpperInvariant(), 0.64f * 16 * Z, 0.16f, Look.Ink, true, 400, TextAlignmentOptions.TopLeft);
        name.textWrappingMode = TextWrappingModes.Normal;
        float nh = name.GetPreferredValues(name.text, textW, 0).y;
        WebLook.Box(name.rectTransform, 0, y, textW, nh + 2);
        y += nh + 1 * Z;
        if (what != "")
        {
            var body = WebLook.Box(words, "What", 0, y, textW, 10);
            float bh = What(body, what, textW, Look.InkSoft);
            body.sizeDelta = new Vector2(textW, bh);
            y += bh + 1 * Z;
        }
        var small = WebLook.Words(words, sub, 0.6f * 16 * Z, 0.06f, afford ? WebLook.Hex("#3a7a55") : Look.InkSoft, false, 400, TextAlignmentOptions.TopLeft);
        small.textWrappingMode = TextWrappingModes.Normal;
        float sh = small.GetPreferredValues(sub, textW, 0).y;
        WebLook.Box(small.rectTransform, 0, y, textW, sh + 2);
        y += sh;
        r.sizeDelta = new Vector2(w, Mathf.Max(solderD, y + 1 * Z));
    }

    /// <summary>
    /// The Astral Gate (.cx-gate): a dark chip, three pins above and three below, its eye in the middle (open, lit blue;
    /// passed, gold); what passing it gives beside it.
    /// </summary>
    void Gate(RectTransform parent, Vector2 at, bool passed, string why)
    {
        bool open = !passed && why == null;
        float cw = 44 * Z, ch = 30 * Z;
        var r = Hud.Rect(parent, "Gate");
        r.anchorMin = r.anchorMax = new Vector2(0, 1);
        r.pivot = new Vector2(0, 0.5f);
        r.anchoredPosition = at + new Vector2(-22 * Z, 0);
        r.sizeDelta = new Vector2(cw + 14 * Z + 300 * Z, Mathf.Max(ch, 60));
        var hit = r.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        if (open) r.gameObject.AddComponent<Button>().onClick.AddListener(() => Pick("gate"));
        var chip = WebLook.Rounded(r, "Chip", Color.white, 4 * Z);
        chip.rectTransform.anchorMin = chip.rectTransform.anchorMax = chip.rectTransform.pivot = new Vector2(0, 0.5f);
        chip.rectTransform.anchoredPosition = Vector2.zero;
        chip.rectTransform.sizeDelta = new Vector2(cw, ch);
        WebLook.Fade(chip, WebLook.Hex("#4a5268"), WebLook.Hex("#353b4c"));
        WebLook.Shadow(chip, 2 * Z, 6 * Z, new Color(30 / 255f, 36 / 255f, 52 / 255f, 0.3f), 4 * Z, Z, WebLook.Hex("#2a2f3d"));
        Color pin = passed ? WebLook.Hex("#e2c26a") : open ? WebLook.Hex("#8fb0ff") : WebLook.Hex("#a9b2c6");
        for (int i = 0; i < 6; i++)
        {
            var p = WebLook.Rounded(r, "Pin", pin, Z);
            float px = (7 + (i % 3) * 13) * Z, py = i < 3 ? -ch / 2 - 6 * Z : ch / 2;
            p.rectTransform.anchorMin = p.rectTransform.anchorMax = p.rectTransform.pivot = new Vector2(0, 0.5f);
            p.rectTransform.anchoredPosition = new Vector2(px, -(py + 3 * Z));
            p.rectTransform.sizeDelta = new Vector2(4 * Z, 6 * Z);
            p.transform.SetSiblingIndex(0);
        }
        var eyeAt = Hud.Rect(chip.transform, "Eye");
        Hud.At(eyeAt, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.one * 10 * Z);
        if (open || passed) Disc(eyeAt, "Glow", 10 * Z + 2 * 10 * Z, passed ? WebLook.Hex("#e2c26a") : WebLook.Hex("#6f8fd8"), true);
        Disc(eyeAt, "Eye", 10 * Z, passed ? WebLook.Hex("#f4dc8a") : open ? WebLook.Hex("#8fb0ff") : WebLook.Hex("#7d869e"));
        var gift = Ascent.Gate;
        var sub = passed ? "passed" : $"+{gift.Attack} attack · +{gift.Stability * 2} stability · costs {gift.Cost} more · {(why != null ? why.TrimEnd('.').ToLowerInvariant() : "1 point")}";
        float lx = cw + 14 * Z, lw = 300 * Z;
        var label = WebLook.Box(r, "Words", lx, 0, lw, 60);
        label.anchorMin = label.anchorMax = label.pivot = new Vector2(0, 0.5f);
        label.anchoredPosition = new Vector2(lx, 0);
        var group = label.gameObject.AddComponent<CanvasGroup>();
        group.alpha = !passed && !open ? 0.5f : 1;
        group.blocksRaycasts = false;
        var t = WebLook.Words(label, "ASTRAL GATE", 0.64f * 16 * Z, 0.16f, open ? WebLook.Hex("#3d5aa8") : passed ? WebLook.Hex("#9a7a2a") : Look.Ink, true, 400, TextAlignmentOptions.TopLeft);
        var w = WebLook.Words(label, sub, 0.6f * 16 * Z, 0.06f, Look.InkSoft, false, 400, TextAlignmentOptions.TopLeft);
        w.textWrappingMode = TextWrappingModes.Normal;
        float th = t.GetPreferredValues(t.text).y, wh = w.GetPreferredValues(sub, lw, 0).y;
        float h = 1 * Z + th + 1 * Z + wh;
        label.sizeDelta = new Vector2(lw, h);
        WebLook.Box(t.rectTransform, 0, 1 * Z, lw, th + 2);
        WebLook.Box(w.rectTransform, 0, 1 * Z + th + 1 * Z, lw, wh + 2);
    }

    // ---- What an upgrade does, set as the web sets card text (glyphs.ts cardTextHtml, in .cx-label .hp-what) ----

    /// <summary>A run of what it does: plain words, or a keyword (its words, its symbol, its energy dots).</summary>
    class Piece { public string text, icon; public bool kw; public int dots; }

    /// <summary>Each keyword's name as a card reads it (keywords.ts KEYWORDS).</summary>
    static readonly Dictionary<string, string> KwNames = new Dictionary<string, string>
    {
        ["dawn"] = "dawn", ["dusk"] = "dusk", ["vigil"] = "vigil", ["heat"] = "heat", ["splash"] = "splash", ["pierce"] = "pierce", ["cool"] = "cool",
        ["shield"] = "shields", ["guard"] = "guard", ["sturdy"] = "sturdy", ["repair"] = "repair", ["bulwark"] = "bulwark", ["resonance"] = "resonance",
        ["forge"] = "forge", ["brittle"] = "brittle", ["anchor"] = "anchor", ["offering"] = "offering", ["rootbreak"] = "rootbreak", ["erode"] = "erode",
        ["decay"] = "decay", ["restore"] = "restore", ["renew"] = "renew", ["recover"] = "recover", ["consume"] = "consume", ["chosen"] = "chosen",
        ["recall"] = "recall", ["shift"] = "shift", ["displace"] = "displace", ["destroy"] = "destroy", ["eject"] = "eject", ["sting"] = "sting",
        ["attack"] = "attack", ["dimmed"] = "dimmed", ["soothe"] = "soothe", ["fusion"] = "fusion", ["plant"] = "plant", ["catalyst"] = "catalyst",
        ["tidewall"] = "tidewall", ["hold"] = "hold", ["thermosiphon"] = "thermosiphon", ["overheated"] = "overheated", ["grows"] = "grow",
        ["plays"] = "industry", ["spend"] = "spend all", ["energy"] = "gain", ["darkspeed"] = "darkspeed", ["cost"] = "energy",
        ["abilities"] = "each turn, one of:", ["abundance"] = "abundance", ["orbit"] = "orbit", ["act"] = "act", ["sing"] = "singularity",
        ["lightspeed"] = "lightspeed", ["trap"] = "trap", ["global"] = "global",
    };

    /// <summary>A keyword's words (keywords.ts rawLabel): its name, and its value as the card says it.</summary>
    static string KwLabel(string id, string value)
    {
        if (!KwNames.TryGetValue(id, out var name)) return value ?? id;
        if (string.IsNullOrEmpty(value)) return name;
        if (id == "grows") return $"{name} 1 (max {value})";
        if (id == "plays" || id == "abundance") return $"{name} +{value}";
        if (id == "attune") return value == "1" ? name : $"{name} ×{value}";
        if (id == "energy") return $"gain {value} energy";
        if (id == "cost") return $"({value} energy)";
        if (id == "resonance" || id == "bulwark" || id == "forge" || id == "sting" || id == "soothe" || id == "restore" || id == "renew" || id == "erode" || id == "decay")
            return $"{name} {value.Split('/')[0]}";
        return $"{name} {value}";
    }

    static readonly System.Text.RegularExpressions.Regex Token = new System.Text.RegularExpressions.Regex(@"\{([a-z]+)(?::([^}]+))?\}");

    /// <summary>
    /// What it does (.cx-label .hp-what, from its card text): plain words in the body face (0.68rem, lines 1.3, soft
    /// ink); each keyword as .cx-label b sets it, spaced capitals of the display face (0.64rem, 0.16em) in ink, never
    /// broken across lines: heat, cool, shields and repair as their symbol (11 square) and number, energy gained as GAIN
    /// and a green dot each; each sentence a paragraph of its own (0.55em between, the last full stop dropped); a
    /// singularity a block of its own under a rule, its name (✦ NAME) on a line of its own. Laid out `width` across;
    /// its height returned.
    /// </summary>
    float What(RectTransform parent, string raw, float width, Color ink)
    {
        float fs = 0.68f * 16 * Z, ks = 0.64f * 16 * Z, lineH = fs * 1.3f, iconS = 11 * Z;
        // The parts, as textParts makes them; each sentence's full stop a paragraph (the very last one dropped).
        var parts = new List<(string text, string kw, string value)>();
        int last = 0;
        foreach (System.Text.RegularExpressions.Match m in Token.Matches(raw))
        {
            if (m.Index > last) parts.Add((raw.Substring(last, m.Index - last), null, null));
            parts.Add((null, m.Groups[1].Value, m.Groups[2].Success ? m.Groups[2].Value : null));
            last = m.Index + m.Length;
        }
        if (last < raw.Length) parts.Add((raw.Substring(last), null, null));
        // (Atoms: what can't be broken across a line (words, a keyword and what is written hard against it), a space
        // between each two; null marks a paragraph's end; a string alone, a singularity's name.)
        var flow = new List<object>();
        var atom = new List<Piece>();
        void Close() { if (atom.Count > 0) flow.Add(atom); atom = new List<Piece>(); }
        for (int i = 0; i < parts.Count; i++)
        {
            var (text, kw, value) = parts[i];
            if (text != null)
            {
                var t = System.Text.RegularExpressions.Regex.Replace(text, @"\.(\s+|$)", mm =>
                    mm.Groups[1].Value.Length > 0 || (mm.Index + 1 == text.Length && i < parts.Count - 1) ? "\u0001" : "");
                var paras = t.Split('\u0001');
                for (int p = 0; p < paras.Length; p++)
                {
                    if (p > 0) { Close(); flow.Add(null); }
                    var words = paras[p].Split(' ');
                    for (int w = 0; w < words.Length; w++)
                    {
                        if (w > 0) Close();
                        if (words[w].Length > 0) atom.Add(new Piece { text = words[w] });
                    }
                }
                continue;
            }
            if (kw == "sing") { Close(); flow.Add("✦ " + (value ?? "").ToUpperInvariant()); continue; }
            // (An unknown token reads as its value; an ability's opening mark shows nothing.)
            if (!KwNames.ContainsKey(kw)) { atom.Add(new Piece { text = value ?? kw }); continue; }
            if (kw == "act") continue;
            if (kw == "energy" && value != null) atom.Add(new Piece { kw = true, text = "GAIN", dots = Mathf.Max(1, int.TryParse(value, out var e) ? e : 1) });
            else if (kw == "cost" && value != null) atom.Add(new Piece { kw = true, text = "", dots = Mathf.Max(1, int.TryParse(value, out var e2) ? e2 : 1) });
            else if (kw == "heat" || kw == "cool" || kw == "shield" || kw == "repair") atom.Add(new Piece { kw = true, icon = kw, text = value ?? "" });
            else atom.Add(new Piece { kw = true, text = KwLabel(kw, value).ToUpperInvariant() });
        }
        Close();
        // Measured in each face (the display face's letter-spacing trailing its last letter too, as CSS spaces it).
        var bodyM = WebLook.Words(parent, "", fs, 0, ink, false, 400, TextAlignmentOptions.Left);
        var kwM = WebLook.Words(parent, "", ks, 0.16f, Look.Ink, true, 400, TextAlignmentOptions.Left);
        float space = bodyM.GetPreferredValues("a a").x - bodyM.GetPreferredValues("aa").x;
        float Wide(Piece p)
        {
            if (!p.kw) return bodyM.GetPreferredValues(p.text).x;
            float w = p.text.Length > 0 ? kwM.GetPreferredValues(p.text).x + 0.16f * ks : 0;
            if (p.icon != null) w += iconS + 0.08f * ks;
            if (p.dots > 0) w += (p.text.Length > 0 ? 0.3f * ks : 0) + p.dots * 0.72f * ks + (p.dots - 1) * 0.18f * ks;
            return w;
        }
        float x = 0, y = 0;
        void EndLine() { if (x > 0) { y += lineH; x = 0; } }
        foreach (var f in flow)
        {
            if (f == null) { EndLine(); y += 0.55f * fs; continue; }
            if (f is string sing)
            {
                // (.card-sing: 0.3em down, a rule in its ink, 0.3em more; its name a block of its own.)
                EndLine();
                y += 0.3f * fs;
                var rule = WebLook.Box(parent, "Rule", 0, y, width, Z).gameObject.AddComponent<Image>();
                rule.color = ink;
                rule.raycastTarget = false;
                y += Z + 0.3f * fs;
                var nm = WebLook.Words(parent, sing, ks, 0.16f, Look.Ink, true, 400, TextAlignmentOptions.TopLeft);
                nm.textWrappingMode = TextWrappingModes.Normal;
                float nh = nm.GetPreferredValues(sing, width, 0).y;
                WebLook.Box(nm.rectTransform, 0, y, width, nh + 2);
                y += nh;
                continue;
            }
            var pieces = (List<Piece>)f;
            float aw = pieces.Sum(Wide);
            if (x > 0 && x + space + aw > width) EndLine();
            else if (x > 0) x += space;
            foreach (var p in pieces)
            {
                float pw = Wide(p), px = x;
                if (p.icon != null)
                {
                    var ic = WebLook.Box(parent, "Symbol", px, y + (lineH - iconS) / 2 + 0.04f * ks, iconS, iconS).gameObject.AddComponent<RawImage>();
                    ic.texture = Symbol(p.icon);
                    ic.color = Look.Ink;
                    ic.raycastTarget = false;
                    px += iconS + 0.08f * ks;
                }
                if (p.text.Length > 0)
                {
                    var t = p.kw ? WebLook.Words(parent, p.text, ks, 0.16f, Look.Ink, true, 400, TextAlignmentOptions.Left) : WebLook.Words(parent, p.text, fs, 0, ink, false, 400, TextAlignmentOptions.Left);
                    t.textWrappingMode = TextWrappingModes.NoWrap;
                    t.raycastTarget = false;
                    float tw = p.kw ? kwM_Width(t) : t.GetPreferredValues(p.text).x;
                    WebLook.Box(t.rectTransform, px, y, tw + 4, lineH);
                    px += tw;
                }
                for (int d = 0; d < p.dots; d++)
                {
                    // (.gain-dots: each 0.72em, green ringed white, 0.18em apart, 0.3em after GAIN.)
                    float ds = 0.72f * ks;
                    if (d == 0 && p.text.Length > 0) px += 0.3f * ks;
                    var dot = WebLook.Rounded(parent, "Dot", Color.white, 999);
                    WebLook.Box(dot.rectTransform, px, y + (lineH - ds) / 2 + 0.05f * ks, ds, ds);
                    var green = WebLook.Rounded(dot.transform, "Green", WebLook.Hex("#7cc79a"), 999);
                    Hud.Fill(green.rectTransform);
                    green.rectTransform.offsetMin = Vector2.one * 0.1f * ks;
                    green.rectTransform.offsetMax = -Vector2.one * 0.1f * ks;
                    px += ds + 0.18f * ks;
                }
                x += pw;
            }
        }
        EndLine();
        Mats.Kill(bodyM.gameObject);
        Mats.Kill(kwM.gameObject);
        return y;
    }

    /// <summary>A display-face keyword's width as CSS lays it: its letters, and the spacing trailing its last.</summary>
    static float kwM_Width(TextMeshProUGUI t) => t.GetPreferredValues(t.text).x + 0.16f * t.fontSize;

    static readonly Dictionary<string, Texture2D> symbols = new Dictionary<string, Texture2D>();

    /// <summary>
    /// A keyword's symbol (glyphs.ts SYMBOL_SVG, its 12-square drawn in lines 2.1 wide, round at their ends), white to
    /// tint: heat two chevrons up, cool two down, shields a hexagon washed at 0.22 (its line 1.6) round a smaller one
    /// (0.9), repair a wrench.
    /// </summary>
    static Texture2D Symbol(string id)
    {
        if (symbols.TryGetValue(id, out var have)) return have;
        const int S = 64;
        const float K = S / 12f;
        var strokes = new List<(Vector2[] pts, float w)>();
        Vector2[] fill = null;
        Vector2[] V(params float[] xy) { var v = new Vector2[xy.Length / 2]; for (int i = 0; i < v.Length; i++) v[i] = new Vector2(xy[2 * i], xy[2 * i + 1]); return v; }
        if (id == "heat") { strokes.Add((V(2, 6.5f, 6, 2.5f, 10, 6.5f), 2.1f)); strokes.Add((V(2, 10.5f, 6, 6.5f, 10, 10.5f), 2.1f)); }
        else if (id == "cool") { strokes.Add((V(2, 1.5f, 6, 5.5f, 10, 1.5f), 2.1f)); strokes.Add((V(2, 5.5f, 6, 9.5f, 10, 5.5f), 2.1f)); }
        else if (id == "shield")
        {
            fill = V(6, 1.2f, 10.2f, 3.6f, 10.2f, 8.4f, 6, 10.8f, 1.8f, 8.4f, 1.8f, 3.6f, 6, 1.2f);
            strokes.Add((fill, 1.6f));
            strokes.Add((V(6, 3.9f, 7.8f, 4.95f, 7.8f, 7.05f, 6, 8.1f, 4.2f, 7.05f, 4.2f, 4.95f, 6, 3.9f), 0.9f));
        }
        else
            strokes.Add((V(8.40f, 1.40f, 7.89f, 1.36f, 7.39f, 1.42f, 6.91f, 1.59f, 6.48f, 1.86f, 6.11f, 2.21f, 5.83f, 2.63f, 5.64f, 3.10f, 5.55f, 3.60f, 5.57f, 4.11f,
                5.70f, 4.60f, 1.60f, 8.70f, 1.29f, 9.24f, 1.29f, 9.86f, 1.60f, 10.40f, 2.14f, 10.71f, 2.76f, 10.71f, 3.30f, 10.40f, 7.40f, 6.30f, 7.89f, 6.43f,
                8.40f, 6.45f, 8.90f, 6.36f, 9.37f, 6.17f, 9.79f, 5.89f, 10.14f, 5.52f, 10.41f, 5.09f, 10.58f, 4.61f, 10.64f, 4.11f, 10.60f, 3.60f, 9.00f, 5.20f,
                7.50f, 4.50f, 6.80f, 3.00f, 8.40f, 1.40f), 2.1f));
        var t = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        for (int py = 0; py < S; py++)
            for (int px = 0; px < S; px++)
            {
                // (In the SVG's units, y down.)
                var p = new Vector2((px + 0.5f) / K, (S - py - 0.5f) / K);
                float a = 0;
                foreach (var (pts, w) in strokes)
                    for (int i = 1; i < pts.Length; i++)
                    {
                        Vector2 s0 = pts[i - 1], d = pts[i] - s0;
                        float k = Mathf.Clamp01(Vector2.Dot(p - s0, d) / Mathf.Max(1e-6f, d.sqrMagnitude));
                        float dist = (p - (s0 + d * k)).magnitude * K;
                        a = Mathf.Max(a, Mathf.Clamp01(w * K / 2 - dist + 0.5f));
                    }
                if (fill != null)
                {
                    bool inside = false;
                    for (int i = 0, j = fill.Length - 1; i < fill.Length; j = i++)
                        if ((fill[i].y > p.y) != (fill[j].y > p.y) && p.x < (fill[j].x - fill[i].x) * (p.y - fill[i].y) / (fill[j].y - fill[i].y) + fill[i].x) inside = !inside;
                    if (inside) a = Mathf.Max(a, 0.22f);
                }
                t.SetPixel(px, py, new Color(1, 1, 1, a));
            }
        t.Apply();
        return symbols[id] = t;
    }

    // ---- Learning, carrying, undoing ----

    void Pick(string arg)
    {
        if (tab != null) { CompanionPick(arg); return; }
        var meta = CampaignView.LoadMeta();
        var c = Meta.CaptainMeta(meta);
        var g = Meta.CaptainGifts(meta);
        var node = Ascent.CaptainTree.FirstOrDefault(x => x.Id == arg);
        bool has = node != null && (c.Nodes ?? new List<string>()).Contains(node.Id);
        var ability = arg == "start:brace" ? Captain.CaptainStartAbility : has ? node.Give.Ability : null;
        if (ability != null)
        {
            if (!c.Equipped.Contains(ability) && c.Equipped.Count(a => g.Abilities.Contains(a)) >= g.SlotCount) { Sound.Play("error"); return; }
            CampaignView.SaveMeta(Meta.EquipCaptainAbility(meta, ability));
            Sound.Play("hover");
            Draw();
            return;
        }
        var sing = arg == "start:wall" ? "wall" : has ? node.Give.Sing : null;
        if (sing != null)
        {
            CampaignView.SaveMeta(Meta.SetCaptainSingularity(meta, sing));
            Sound.Play("hover");
            Draw();
            return;
        }
        var lead = has ? node.Give.Lead : null;
        if (lead != null)
        {
            CampaignView.SaveMeta(Meta.SetCaptainLead(meta, c.Lead == lead ? null : lead));
            Sound.Play("hover");
            Draw();
            return;
        }
        if (arg.StartsWith("start:") || has) return;
        var buy = arg == "gate" ? new CaptainBuy { Kind = "gate" } : new CaptainBuy { Kind = "node", Id = arg };
        if (Meta.CaptainBuyProblem(meta, buy) != null) { Sound.Play("error"); return; }
        history.Add(c);
        placed.Add(arg);
        Sound.Play(arg == "gate" ? "upgrade" : "charge-" + Mathf.Clamp(placed.Count - 1, 0, 3));
        CampaignView.SaveMeta(Meta.BuyCaptain(meta, buy));
        resetArmed = false;
        Draw();
    }

    /// <summary>As on the Captain's tree: a tap learns it there and then, or passes the Astral Gate.</summary>
    void CompanionPick(string arg)
    {
        var meta = CampaignView.LoadMeta();
        if (meta.Companions == null || !meta.Companions.TryGetValue(tab, out var c) || c == null) return;
        if (arg != "gate" && Meta.CompanionTree(meta, tab).Nodes.Contains(arg)) return;
        if (Meta.CompanionProblem(meta, tab, arg) != null) { Sound.Play("error"); return; }
        compHistory.Add(Clone(c));
        placed.Add(arg);
        CampaignView.SaveMeta(Meta.BuyCompanion(meta, tab, arg));
        Sound.Play(arg == "gate" ? "upgrade" : "charge-" + Mathf.Clamp(placed.Count - 1, 0, 3));
        Draw();
    }

    static CompanionMeta Clone(CompanionMeta c) => new CompanionMeta { Xp = c.Xp, Nodes = c.Nodes != null ? new List<string>(c.Nodes) : null, Gates = c.Gates };

    void CompanionRestore(CompanionMeta snap)
    {
        var meta = CampaignView.LoadMeta();
        if (meta.Companions != null && snap != null) meta.Companions[tab] = snap;
        CampaignView.SaveMeta(meta);
        Sound.Play("hover");
        Draw();
    }

    void Undo()
    {
        if (tab != null)
        {
            if (compHistory.Count == 0) return;
            var cs = compHistory[compHistory.Count - 1];
            compHistory.RemoveAt(compHistory.Count - 1);
            placed.RemoveAt(placed.Count - 1);
            CompanionRestore(cs);
            return;
        }
        if (history.Count == 0) return;
        var snap = history[history.Count - 1];
        history.RemoveAt(history.Count - 1);
        placed.RemoveAt(placed.Count - 1);
        Restore(snap);
    }

    void Clear()
    {
        if (tab != null)
        {
            if (compHistory.Count == 0) return;
            var cs = compHistory[0];
            compHistory.Clear();
            placed.Clear();
            CompanionRestore(cs);
            return;
        }
        if (history.Count == 0) return;
        var snap = history[0];
        history.Clear();
        placed.Clear();
        Restore(snap);
    }

    void Restore(CaptainMeta snap)
    {
        var meta = CampaignView.LoadMeta();
        meta.Captain = snap;
        CampaignView.SaveMeta(meta);
        Sound.Play("hover");
        Draw();
    }

    void Reset()
    {
        var meta = CampaignView.LoadMeta();
        if (Meta.ResetCaptainProblem(meta) != null) { resetArmed = false; Sound.Play("error"); Draw(); return; }
        if (!resetArmed) { resetArmed = true; Sound.Play("hover"); Draw(); return; }
        resetArmed = false;
        placed.Clear();
        history.Clear();
        CampaignView.SaveMeta(Meta.ResetCaptain(meta));
        Sound.Play("upgrade");
        Draw();
    }
}
