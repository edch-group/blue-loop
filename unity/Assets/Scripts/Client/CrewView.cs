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
    bool resetArmed;
    ScrollRect scroll;
    float keepScroll = -1;

    static readonly float[] Cols = { 40, 275, 545, 780 };
    const float Spine = 512, Row = 96, Head = 46, GateH = 110, RootH = 110, Top = 30, SheetW = 900;

    public static CrewView Make(RectTransform parent, MenuView menu)
    {
        var r = Hud.Rect(parent, "Crew");
        Hud.Fill(r);
        var v = r.gameObject.AddComponent<CrewView>();
        v.root = r;
        v.menu = menu;
        v.Draw();
        return v;
    }

    static Color Hex(string h) => ColorUtility.TryParseHtmlString(h, out var c) ? c : Look.InkSoft;

    void Draw()
    {
        if (scroll != null) keepScroll = scroll.verticalNormalizedPosition;
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var meta = CampaignView.LoadMeta();
        var c0 = Meta.CaptainMeta(meta);
        int left = Meta.PointsLeft(meta);
        // The header: back, undo, clear, reset.
        var back = Hud.Pill(root, "‹ Back", () => menu.Show("campaign"), 15);
        Hud.At((RectTransform)back.transform, new Vector2(0, 1), new Vector2(26, -26), new Vector2(110, 44));
        float x = 150;
        void Small(string label, System.Action act, Color ink)
        {
            var r = Hud.Rect(root, label);
            Hud.At(r, new Vector2(0, 1), new Vector2(x, -26), new Vector2(18 + label.Length * 11, 44));
            var hit = r.gameObject.AddComponent<Image>();
            hit.color = new Color(1, 1, 1, 0);
            r.gameObject.AddComponent<Button>().onClick.AddListener(() => act());
            Hud.Label(r, label.ToUpperInvariant(), 13, ink, true, 500, 20);
            x += 30 + label.Length * 11;
        }
        if (placed.Count > 0)
        {
            Small("undo", Undo, Look.InkSoft);
            Small("clear", Clear, Look.InkSoft);
        }
        if (Meta.CaptainPointsSpent(meta) > 0) Small(resetArmed ? $"confirm reset · {Meta.SkillResetPetals} petals" : $"reset · {Meta.SkillResetPetals} petals", Reset, resetArmed ? Look.Danger : Look.InkSoft);
        // Who: the Captain's title (by the gates passed), the points to spend, the level.
        var who = Hud.Rect(root, "Who");
        Hud.At(who, new Vector2(0, 1), new Vector2(0, -90), new Vector2(Hud.W * 0.4f, 120));
        var title = (Ascent.CaptainTitles.ElementAtOrDefault(c0.Gates ?? 0) ?? "The Captain").ToUpperInvariant();
        var h = Hud.Label(who, title, 34, Look.Ink, true, 400, 45, TextAlignmentOptions.Top);
        h.raycastTarget = false;
        var xp = Hud.Label(who, $"<b>{left}</b>  <size=60%><color=#9aa0ac>SKILL POINT{(left == 1 ? "" : "S")} · LEVEL {Meta.LevelFor(meta.Xp).Level}</color></size>", 22, Look.Ink, true, 500, 6, TextAlignmentOptions.Top);
        xp.margin = new Vector4(0, 56, 0, 0);
        xp.raycastTarget = false;
        Tree(meta, c0, left);
    }

    // ---- What each pad is ----

    string Pay(string id)
    {
        var a = Captain.CaptainAbility(id).Ability;
        var parts = new List<string>();
        if ((a.Cost ?? 0) > 0) parts.Add($"{a.Cost} energy");
        if ((a.Pay?.Stability ?? 0) > 0) parts.Add($"−{a.Pay.Stability} stability");
        if ((a.Pay?.SelfHeat ?? 0) > 0) parts.Add($"{a.Pay.SelfHeat} heat to your sun");
        return string.Join(", ", parts);
    }

    static string SingWords(Singularity k) => $"{k.Name} · {BattleView.ChargeWords(k.Charge, k.Need)}: {BattleView.Words(k.Text)}";

    Look_ Describe(AscentNode x, bool owned, CaptainMeta c, CaptainGifts g)
    {
        bool full = c.Equipped.Count(a => g.Abilities.Contains(a)) >= g.SlotCount;
        if (x.Give.Ability != null)
        {
            var a = Captain.CaptainAbility(x.Give.Ability).Ability;
            bool on = c.Equipped.Contains(x.Give.Ability);
            var pay = Pay(x.Give.Ability);
            return new Look_ { title = a.Name.ToLowerInvariant(), what = (pay != "" ? pay + ": " : "") + BattleView.Words(a.Text), colour = "#4fae9b", on = owned && on, owned = owned ? (on ? "carried" : full ? "slots full" : "tap to carry") : "" };
        }
        if (x.Give.Lead != null)
        {
            var l = Captain.CaptainLead(x.Give.Lead);
            bool on = c.Lead == x.Give.Lead;
            return new Look_ { title = l.Name.ToLowerInvariant(), what = "leads: " + BattleView.Words(l.Text), colour = "#c98a4b", on = owned && on, owned = owned ? (on ? "leading" : "tap to lead") : "" };
        }
        if (x.Give.Sing != null)
        {
            var k = Cards.Rules.CaptainSingularities[x.Give.Sing];
            bool on = (c.Sing ?? "wall") == x.Give.Sing;
            return new Look_ { title = k.Name.ToLowerInvariant(), what = SingWords(k), colour = "#6f8fd8", on = owned && on, owned = owned ? (on ? "carried" : "tap to carry") : "" };
        }
        var colour = (x.Give.Attack ?? 0) > 0 ? "#d9644a" : (x.Give.Stability ?? 0) > 0 ? "#d8a53c" : (x.Give.Cheaper ?? 0) > 0 ? "#5cae7c" : "#8a93a8";
        return new Look_ { title = x.Name, what = "", colour = colour, owned = "" };
    }

    // ---- The sheet: the tiers from the foot up, the gates between them, the spine ----

    void Tree(MetaState meta, CaptainMeta c, int left)
    {
        var g = Meta.CaptainGifts(meta);
        var a = new AscentState { Nodes = c.Nodes ?? new List<string>(), Gates = c.Gates ?? 0 };
        var tree = Ascent.CaptainTree;
        var wall = Cards.Rules.CaptainSingularities["wall"];
        var brace = Captain.CaptainAbility(Captain.CaptainStartAbility).Ability;
        bool wallOn = (c.Sing ?? "wall") == "wall", braceOn = c.Equipped.Contains(Captain.CaptainStartAbility);
        var known = new List<Known>
        {
            new Known { arg = "start:brace", title = brace.Name.ToLowerInvariant(), what = BattleView.Words(brace.Text), colour = "#4fae9b", on = braceOn, sub = braceOn ? "carried" : "tap to carry" },
            new Known { arg = "start:wall", title = wall.Name.ToLowerInvariant(), what = SingWords(wall), colour = "#6f8fd8", on = wallOn, sub = wallOn ? "carried" : "tap to carry" },
        };
        var names = Ascent.CaptainTitles.Select(t => t.Replace("The ", "").ToLowerInvariant()).ToList();
        string[] roman = { "I", "II", "III", "IV" };
        int Rows(int n) => Mathf.Max(1, (n + Cols.Length - 1) / Cols.Length);
        var tiers = Enumerable.Range(1, Ascent.Tiers).Select(t => tree.Where(n => n.Tier == t).ToList()).ToList();
        float H = Top + RootH + Rows(known.Count) * Row + tiers.Sum(l => Head + Rows(l.Count) * Row) + (Ascent.Tiers - 1) * GateH + 30;

        // The scroller: the right 60% of the page, below the header.
        var view = Hud.Rect(root, "Tree");
        view.anchorMin = new Vector2(0.4f, 0);
        view.anchorMax = new Vector2(1, 1);
        view.offsetMin = new Vector2(0, 0);
        view.offsetMax = new Vector2(-20, -84);
        view.gameObject.AddComponent<RectMask2D>();
        var hit = view.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        var sheet = Hud.Rect(view, "Sheet");
        sheet.anchorMin = new Vector2(0.5f, 1);
        sheet.anchorMax = new Vector2(0.5f, 1);
        sheet.pivot = new Vector2(0.5f, 1);
        sheet.sizeDelta = new Vector2(SheetW, H);
        scroll = view.gameObject.AddComponent<ScrollRect>();
        scroll.content = sheet;
        scroll.horizontal = false;
        scroll.movementType = ScrollRect.MovementType.Clamped;
        scroll.scrollSensitivity = 40;
        var lines = Hud.Rect(sheet, "Lines");
        Hud.Fill(lines);
        var pads = Hud.Rect(sheet, "Pads");
        Hud.Fill(pads);

        // (Sheet units: 1000 across, y down from its top, in pixels.)
        Vector2 P(float sx, float sy) => new Vector2(sx / 1000f * SheetW, -sy);
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
        void Via(float vx, float vy, bool lit)
        {
            var r = Hud.Rect(lines, "Via");
            r.anchorMin = r.anchorMax = new Vector2(0, 1);
            r.pivot = new Vector2(0.5f, 0.5f);
            r.anchoredPosition = P(vx, vy);
            r.sizeDelta = new Vector2(8, 8);
            var img = r.gameObject.AddComponent<Image>();
            img.sprite = Hud.Circle;
            img.color = lit ? new Color32(0x4a, 0x52, 0x68, 255) : new Color32(0xb4, 0xbb, 0xcc, 255);
            img.raycastTarget = false;
        }
        Color Trace(bool lit) => lit ? new Color(74 / 255f, 82 / 255f, 104 / 255f, 0.75f) : new Color(120 / 255f, 132 / 255f, 160 / 255f, 0.38f);

        float y = H - RootH;
        float rootY = y + 50;
        void Place(List<(string colour, bool lit, System.Action<float, float> make)> items)
        {
            int n = Rows(items.Count);
            for (int k = 0; k < items.Count; k++)
            {
                int r = k / Cols.Length, cc = k % Cols.Length;
                float py = y - Row * (n - r) + 28, px = Cols[cc];
                float by = py + 52;
                var col = Trace(items[k].lit);
                Seg(px, py, px, by, col, 2);
                Seg(px, by, Spine, by, col, 2);
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
            // The tier's name and its picks, across the spine at its foot.
            var tl = Hud.Rect(pads, "Tier " + tier);
            tl.anchorMin = tl.anchorMax = new Vector2(0.5f, 1);
            tl.pivot = new Vector2(0.5f, 0.5f);
            tl.anchoredPosition = new Vector2(0, -(y - 30));
            tl.sizeDelta = new Vector2(320, 26);
            var tb = tl.gameObject.AddComponent<Image>();
            tb.sprite = Hud.Rounded;
            tb.type = Image.Type.Sliced;
            tb.color = Look.Paper;
            var tt = Hud.Label(tl, $"{roman[tier - 1]} · {(names.ElementAtOrDefault(tier - 1) ?? "").ToUpperInvariant()}   {Ascent.TierPicksTaken(tree, a, tier)}/{Ascent.TierPicks}", 12, tier == a.Gates + 1 ? Look.Ink : Look.InkSoft, true, 400, 26);
            tt.alpha = reached ? 1 : 0.5f;
            y -= Head;
            Place(tiers[tier - 1].Select(n =>
            {
                bool owned = a.Nodes.Contains(n.Id);
                var look = Describe(n, owned, c, g);
                var why = owned ? null : Ascent.AscentProblem(tree, a, n.Id, left);
                bool plan = owned && placed.Contains(n.Id);
                var sub = owned ? (look.owned != "" ? look.owned : "learnt") : why != null ? why.TrimEnd('.').ToLowerInvariant() : "1 point";
                return (look.colour, owned, (System.Action<float, float>)((px, py) => Pad(pads, P(px, py), look.title, look.what, sub, Hex(look.colour), owned, !owned && why == null, look.on, !owned && why != null, !reached, n.Id, plan)));
            }).ToList());
            spineTo.Add((y, reached));
            if (tier < Ascent.Tiers)
            {
                // The Astral Gate: a chip on the spine; passed, it glows gold.
                bool passed = a.Gates >= tier;
                var why = passed ? null : a.Gates == tier - 1 ? Ascent.AscentProblem(tree, a, "gate", left) : "Reach the tier below first.";
                Gate(pads, P(Spine, y - GateH / 2), passed, why);
                y -= GateH;
                spineTo.Add((y, passed));
            }
        }
        // The spine: from the emblem up, lit as far as the Captain has climbed.
        float from = rootY - 30;
        foreach (var (sy, lit) in spineTo)
        {
            Seg(Spine, from, Spine, sy, Trace(lit), 3.5f);
            from = sy;
        }
        Seg(Spine, from, Spine, Top, Trace(false), 3.5f);
        // The emblem's socket at the foot.
        var socket = Hud.Rect(pads, "Root");
        socket.anchorMin = socket.anchorMax = new Vector2(0, 1);
        socket.pivot = new Vector2(0.5f, 0.5f);
        socket.anchoredPosition = P(Spine, rootY);
        socket.sizeDelta = new Vector2(40, 40);
        var si = socket.gameObject.AddComponent<Image>();
        si.sprite = Hud.Circle;
        si.color = new Color32(0x35, 0x3b, 0x4c, 255);
        var core = Hud.Rect(socket, "Core");
        Hud.At(core, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(22, 22));
        var ci = core.gameObject.AddComponent<Image>();
        ci.sprite = Hud.Circle;
        ci.color = new Color32(0xf4, 0xdc, 0x8a, 255);
        Canvas.ForceUpdateCanvases();
        // (It opens on the tier the Captain stands in: from the foot, unless it was scrolled.)
        scroll.verticalNormalizedPosition = keepScroll >= 0 ? keepScroll : 0;
    }

    void Pad(RectTransform parent, Vector2 at, string title, string what, string sub, Color colour, bool owned, bool afford, bool on, bool locked, bool ahead, string arg, bool planned = false)
    {
        var r = Hud.Rect(parent, title);
        r.anchorMin = r.anchorMax = new Vector2(0, 1);
        r.pivot = new Vector2(0, 1);
        r.anchoredPosition = at + new Vector2(-9, 9);
        r.sizeDelta = new Vector2(SheetW * 0.21f, 84);
        var hit = r.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        if (!string.IsNullOrEmpty(arg)) r.gameObject.AddComponent<Button>().onClick.AddListener(() => Pick(arg));
        // The solder: pale, or (to learn now) washed in its colour, or (learnt) its colour, glowing; carried, ringed.
        var solder = Hud.Rect(r, "Solder");
        Hud.At(solder, new Vector2(0, 1), Vector2.zero, new Vector2(18, 18));
        if (owned || on)
        {
            var glow = Hud.Rect(solder, "Glow");
            Hud.Fill(glow);
            glow.offsetMin = new Vector2(on ? -9 : -6, on ? -9 : -6);
            glow.offsetMax = -glow.offsetMin;
            var gi = glow.gameObject.AddComponent<Image>();
            gi.sprite = Hud.Soft;
            var gc = colour;
            gc.a = 0.5f;
            gi.color = gc;
            gi.raycastTarget = false;
        }
        var ring = solder.gameObject.AddComponent<Image>();
        ring.sprite = Hud.Circle;
        ring.color = owned || afford ? colour : new Color32(0x9c, 0xa5, 0xbb, 255);
        ring.raycastTarget = false;
        var fill = Hud.Rect(solder, "Fill");
        Hud.Fill(fill);
        fill.offsetMin = new Vector2(1.5f, 1.5f);
        fill.offsetMax = new Vector2(-1.5f, -1.5f);
        var fi = fill.gameObject.AddComponent<Image>();
        fi.sprite = Hud.Circle;
        fi.color = owned ? colour : afford ? Color.Lerp(colour, Color.white, 0.55f) : new Color32(0xc4, 0xcc, 0xdb, 255);
        fi.raycastTarget = false;
        var dot = Hud.Rect(solder, "Dot");
        Hud.At(dot, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(owned ? 5 : 6, owned ? 5 : 6));
        var di = dot.gameObject.AddComponent<Image>();
        di.sprite = Hud.Circle;
        di.color = owned ? Color.white : new Color32(0xf4, 0xf6, 0xfa, 255);
        di.raycastTarget = false;
        if (planned) solder.localScale = Vector3.one * 1.15f;
        // Its name, what it does, and where it stands.
        var name = Hud.Label(r, title.ToUpperInvariant(), 11, Look.Ink, true, 400, 16, TextAlignmentOptions.TopLeft);
        name.margin = new Vector4(28, 1, 0, 0);
        var body = Hud.Label(r, $"{(what != "" ? $"<color=#5b6170>{what}</color>\n" : "")}<size=90%><color=#{(afford ? "3a7a55" : "737780")}>{sub}</color></size>", 12, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
        body.textWrappingMode = TextWrappingModes.Normal;
        body.margin = new Vector4(28, 17, 0, 0);
        foreach (var t in new[] { name, body })
        {
            t.raycastTarget = false;
            t.alpha = locked || ahead ? 0.5f : 1;
        }
    }

    void Gate(RectTransform parent, Vector2 at, bool passed, string why)
    {
        bool open = !passed && why == null;
        var r = Hud.Rect(parent, "Gate");
        r.anchorMin = r.anchorMax = new Vector2(0, 1);
        r.pivot = new Vector2(0, 0.5f);
        r.anchoredPosition = at + new Vector2(-22, 0);
        r.sizeDelta = new Vector2(360, 50);
        var hit = r.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        if (open) r.gameObject.AddComponent<Button>().onClick.AddListener(() => Pick("gate"));
        // The chip: dark, three pins above and three below; open, lit blue; passed, gold.
        var chip = Hud.Rect(r, "Chip");
        Hud.At(chip, new Vector2(0, 0.5f), Vector2.zero, new Vector2(44, 30));
        var ci = chip.gameObject.AddComponent<Image>();
        ci.sprite = Hud.Rounded;
        ci.type = Image.Type.Sliced;
        ci.color = new Color32(0x40, 0x47, 0x5a, 255);
        Color pin = passed ? new Color32(0xe2, 0xc2, 0x6a, 255) : open ? new Color32(0x8f, 0xb0, 0xff, 255) : new Color32(0xa9, 0xb2, 0xc6, 255);
        for (int i = 0; i < 6; i++)
        {
            var p = Hud.Rect(chip, "Pin");
            Hud.At(p, new Vector2(0, i < 3 ? 1 : 0), new Vector2(7 + (i % 3) * 13, i < 3 ? 6 : -6), new Vector2(4, 6));
            p.gameObject.AddComponent<Image>().color = pin;
        }
        var eye = Hud.Rect(chip, "Eye");
        Hud.At(eye, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(10, 10));
        var ei = eye.gameObject.AddComponent<Image>();
        ei.sprite = Hud.Circle;
        ei.color = passed ? new Color32(0xf4, 0xdc, 0x8a, 255) : open ? new Color32(0x8f, 0xb0, 0xff, 255) : new Color32(0x7d, 0x86, 0x9e, 255);
        var gift = Ascent.Gate;
        var sub = passed ? "passed" : $"+{gift.Attack} attack · +{gift.Stability * 2} stability · costs {gift.Cost} more · {(why != null ? why.TrimEnd('.').ToLowerInvariant() : "1 point")}";
        var t = Hud.Label(r, "ASTRAL GATE", 11, open ? new Color32(0x3d, 0x5a, 0xa8, 255) : Look.Ink, true, 400, 16, TextAlignmentOptions.TopLeft);
        t.margin = new Vector4(58, 6, 0, 0);
        t.raycastTarget = false;
        var w = Hud.Label(r, sub, 12, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
        w.textWrappingMode = TextWrappingModes.Normal;
        w.margin = new Vector4(58, 22, 0, 0);
        w.raycastTarget = false;
    }

    // ---- Learning, carrying, undoing ----

    void Pick(string arg)
    {
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

    void Undo()
    {
        if (history.Count == 0) return;
        var snap = history[history.Count - 1];
        history.RemoveAt(history.Count - 1);
        placed.RemoveAt(placed.Count - 1);
        Restore(snap);
    }

    void Clear()
    {
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
