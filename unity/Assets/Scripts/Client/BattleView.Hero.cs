using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// Your Hero, tapped on your day (app.ts heroPicks): its card large on the right, and to its left a pill for each thing
/// it can do: its singularity first (charged, to unleash; charging, how far it has to go), its abilities (each its
/// mark, its name, its costs, what it does or why not today), and its attack.
/// </summary>
public partial class BattleView
{
    static Dictionary<string, string> words;
    internal static string Words(string raw)
    {
        words ??= Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, string>>(Resources.Load<TextAsset>("Engine/words").text);
        if (raw == null) return "";
        return words.TryGetValue(raw, out var w) ? w : System.Text.RegularExpressions.Regex.Replace(raw, @"\{[^}]*\}", "").Trim();
    }

    internal static string ChargeWords(string kind, int n)
    {
        Words("");
        return words.TryGetValue($"charge:{kind}", out var w) ? w.Replace("{n}", n.ToString()) : $"{kind} {n}";
    }

    /// <summary>effectMark's symbol for an effect (or a boon's kind), as baked to Icons/hero/.</summary>
    static string MarkOf(string raw)
    {
        var kind = raw != null && raw.StartsWith("open") ? raw.Substring(4) : raw ?? "";
        switch (kind)
        {
            case "heat": case "pierce": case "playheat": return "heat";
            case "cool": case "playcool": return "cool";
            case "shield": case "playshield": return "shield";
            case "draw": case "playdraw": case "recall": case "recover": return "draw";
            case "plays": case "energy": return "energy";
            case "sturdy": case "bulwark": case "guard": case "tidewall": case "taunt": return "sturdy";
            case "repair": case "restore": return "repair";
            case "stability": return "stability";
            case "walls": case "guns": case "plant": return kind;
            default: return "star";
        }
    }

    class Pick
    {
        public string Name, Words, Mark, Count, Pay;
        public int Cost;
        public bool Off, Attack, Sing, Relic;
        public System.Action Act;
    }

    /// <summary>
    /// Your Hero, tapped on your day (app.ts renderHeroPanel, .stage.stage-hero): in the stage's place, its card, and to
    /// its left (12 px off) its picks, each a pill: its singularity first (charged, a blazing dark pill to unleash it;
    /// charging, how far it has to go), its abilities (a mark with what it does and how much, its name, its energy and
    /// other costs, what it does or why not today), and its attack. A tap anywhere else puts them away, and goes on to do
    /// what it does there (EmblemsTick); a tap on the Hero again only puts them away (app.ts 'hero-panel' toggles).
    /// </summary>
    void ShowHero()
    {
        foreach (Transform c in heroPanel) Mats.Kill(c.gameObject);
        var hero = Game.CommandCard(Me);
        if (hero == null || !MyDay) return;
        // (This very press put them away: the Hero tapped again.)
        if (heroShutPress == press) return;
        relicPanel = null;
        emblemsKey = null;
        Sound.Play("hover");
        if (heroPanel.parent != hud.transform) heroPanel.SetParent(hud.transform, false);
        heroPanel.SetAsLastSibling();
        heroPanel.gameObject.SetActive(true);
        Hud.Fill(heroPanel);
        heroPanel.localScale = Vector3.one;

        var picks = new List<Pick>();
        var k = Singularities.Of(hero.DefId);
        if (k != null)
        {
            var why = Game.SingularityProblem(state, Me);
            picks.Add(new Pick { Name = k.Name, Words = why != null ? $"{Mathf.Min(hero.Charge ?? 0, k.Need)}/{k.Need} · {ChargeWords(k.Charge, k.Need)}" : Words(k.Text), Off = why != null, Sing = true, Act = Unleash });
        }
        var choiceMark = new Dictionary<string, string> { ["empower"] = "guns", ["renew"] = "stability", ["aim"] = "heat", ["ward"] = "shield", ["freeze"] = "cool", ["displace"] = "star" };
        var abilities = Game.HeroAbilities(Me, hero, true);
        for (int i = 0; i < abilities.Count; i++)
        {
            var a = abilities[i];
            var why = Game.HeroAbilityProblem(state, Me, i);
            var e = a.Effects?.FirstOrDefault();
            int amount = e?.Amount ?? (a.Choices != null ? (a.Choices.Amount ?? 0) * (a.Choices.Kind == "aim" ? a.Choices.Times : 1) : 0);
            var pay = new List<string>();
            if ((a.Pay?.Stability ?? 0) > 0) pay.Add($"−{a.Pay.Stability} stability");
            if (a.Pay?.Sacrifice == true) pay.Add("sacrifice a card");
            if ((a.Pay?.SelfHeat ?? 0) > 0) pay.Add($"{a.Pay.SelfHeat} heat to your sun");
            int index = i;
            string mark = e != null ? MarkOf(e.Type) : a.Choices != null && choiceMark.TryGetValue(a.Choices.Kind ?? "", out var cm) ? MarkOf(cm) : "star";
            picks.Add(new Pick { Name = a.Name, Words = why ?? Words(a.Text), Mark = mark, Count = amount > 0 ? amount.ToString() : null, Cost = a.Cost ?? 0, Pay = pay.Count > 0 ? string.Join(" · ", pay) : null, Off = why != null, Relic = a.Relic != null, Act = () => UseAbility(index) });
        }
        var aims = Game.AimChoices(state, Me, true);
        if (hero.Dimmed != true && Game.CardAttack(state, Me, hero) > 0 && (aims.Sun || aims.Cards.Count > 0))
            picks.Add(new Pick { Name = "attack", Words = aims.Sun ? "A rival card or their sun." : "A rival card.", Mark = "attack", Count = Game.CardAttack(state, Me, hero).ToString(), Attack = true, Act = () => { heroPanel.gameObject.SetActive(false); attacker = hero.Uid; Refresh(); } });

        var l = BoardLayout.Current;
        float scw = Mathf.Min(250, 50 * l.Vh), ch = scw * 1.4f;
        const float nameSize = 9.92f, wordSize = 10.88f, paySize = 10.56f, colMax = 240;
        // (Measured: each pill as wide as its widest line, the column as wide as its widest pill, at most 240.)
        var probe = Hud.Rect(hud.transform, "Probe");
        var pt = probe.gameObject.AddComponent<TextMeshProUGUI>();
        float Measure(string t, float size, bool display, int weight, float spacing)
        {
            Look.Style(pt, size, Look.Ink, display, weight, spacing, TextAlignmentOptions.Left);
            return pt.GetPreferredValues(t).x;
        }
        float NameRow(Pick p) => Measure(p.Name.ToUpperInvariant(), nameSize, true, 600, 12)
            + (p.Cost > 0 ? 6 + p.Cost * 6 + (p.Cost - 1) * 2 : 0)
            + (p.Pay != null ? 6 + Measure(p.Pay, paySize, false, 600, 2) + 12 : 0);
        float colW = Mathf.Min(colMax, picks.Count == 0 ? 0 : picks.Max(p => 3 + 26 + 8 + Mathf.Max(NameRow(p), Measure(p.Words, wordSize, false, 400, 0)) + 12));
        float textW = colW - (3 + 26 + 8 + 12);
        Look.Style(pt, wordSize, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
        pt.textWrappingMode = TextWrappingModes.Normal;
        var heights = picks.Select(p => 3 + Mathf.Max(26, nameSize * 1.2f + pt.GetPreferredValues(p.Words, textW, 0).y) + 3).ToList();
        Destroy(probe.gameObject);
        float colH = heights.Sum() + 5 * Mathf.Max(0, picks.Count - 1);
        float right = l.W - (l.PadR + 16), total = colW + 12 + scw, h = Mathf.Max(ch, colH);
        float left = right - total, top = l.H / 2 - h / 2;

        var face = Hud.Rect(heroPanel, "Card");
        Hud.Place(face, left + colW + 12, top + (h - ch) / 2, scw, ch);
        var raw = face.gameObject.AddComponent<RawImage>();
        raw.texture = Faces.Of(hero.DefId, Faces.Look.Card, scw);
        Faces.Follow(raw);
        raw.raycastTarget = false;
        WebLook.Shadow(raw, 24, 50, new Color(70 / 255f, 70 / 255f, 90 / 255f, 0.28f), scw * 0.08f, 2, Color.white);
        Printed(face, hero.DefId, scw, true);

        float y = top + (h - colH) / 2;
        for (int i = 0; i < picks.Count; i++)
        {
            var p = picks[i];
            float ph = heights[i];
            bool dark = p.Sing && !p.Off;
            var pill = Hud.Box(heroPanel, p.Name, dark ? Hud.Rgba(37, 44, 70) : new Color(1, 1, 1, 0.97f), ph / 2);
            var pr = (RectTransform)pill.transform;
            Hud.Place(pr, left, y, colW, ph);
            // (Its ring and shadow: gold; the attack's red; a singularity charged, pale blue light; one not today, grey.)
            if (p.Off) WebLook.Shadow(pill, 4, 10, new Color(70 / 255f, 70 / 255f, 90 / 255f, 0.1f), ph / 2, 1, new Color(150 / 255f, 156 / 255f, 170 / 255f, 0.45f));
            else if (dark) WebLook.Shadow(pill, 0, 14, new Color(150 / 255f, 190 / 255f, 250 / 255f, 0.55f), ph / 2, 1, new Color(150 / 255f, 190 / 255f, 250 / 255f, 0.6f));
            else WebLook.Shadow(pill, 6, 16, new Color(70 / 255f, 70 / 255f, 90 / 255f, 0.18f), ph / 2, 1.5f, p.Attack ? new Color(214 / 255f, 96 / 255f, 70 / 255f, 0.6f) : new Color(212 / 255f, 165 / 255f, 42 / 255f, 0.6f));
            var group = pill.gameObject.AddComponent<CanvasGroup>();
            group.alpha = p.Off ? 0.6f : 1;
            // (Every pill is the picks' own: a tap on one not usable today does not put them away.)
            pill.raycastTarget = true;
            if (!p.Off)
            {
                var b = pill.gameObject.AddComponent<Button>();
                var cb = b.colors;
                cb.highlightedColor = dark ? new Color(1.1f, 1.1f, 1.2f) : new Color(1f, 0.965f, 0.886f);
                b.colors = cb;
                var go = p.Act;
                b.onClick.AddListener(() => { Sound.Play("click"); go(); });
            }
            // Its mark (26 across, 3 in), and its count on it.
            float my = (ph - 26) / 2;
            if (p.Sing)
            {
                Hud.Text(pr, "✦", 3, my, 26, 26, 19.6f, p.Off ? Hud.Rgba(130, 146, 180) : Hud.Rgba(156, 196, 255), false, 400, 0);
            }
            else
            {
                var m = Hud.Rect(pr, "Mark");
                Hud.Place(m, 3 - 4, my - 4, 34, 34);
                var mi = m.gameObject.AddComponent<RawImage>();
                mi.texture = Resources.Load<Texture2D>($"Icons/hero/{p.Mark}");
                mi.raycastTarget = false;
                if (p.Count != null)
                {
                    var c = Hud.Box(pr, "Count", Color.white, 7.5f);
                    float cw = Mathf.Max(15, Hud.Wide(p.Count, 9.92f, 500, 0, 4, true));
                    Hud.Place((RectTransform)c.transform, 3 + 26 + 4 - cw, my + 26 + 3 - 15, cw, 15);
                    WebLook.Shadow(c, 1, 3, new Color(70 / 255f, 70 / 255f, 90 / 255f, 0.25f), 7.5f);
                    Hud.Label(c.transform, p.Count, 9.92f, Look.Ink, true, 500, 0);
                }
            }
            // Its name (with its energy and other costs), and what it does or why not.
            float tx = 3 + 26 + 8;
            var ink = dark ? Hud.Rgba(238, 243, 255) : Look.Ink;
            var nameT = Hud.Text(pr, p.Name.ToUpperInvariant(), tx, 3, textW, nameSize * 1.2f, nameSize, ink, true, 600, 12, TextAlignmentOptions.MidlineLeft);
            float nx = tx + nameT.GetPreferredValues(p.Name.ToUpperInvariant()).x + 6;
            for (int d = 0; d < p.Cost; d++)
            {
                var dot = Hud.Rect(pr, "Energy");
                Hud.Place(dot, nx + d * 8, 3 + (nameSize * 1.2f - 6) / 2, 6, 6);
                var di = dot.gameObject.AddComponent<Image>();
                di.sprite = Hud.Circle;
                di.color = Hud.Rgba(108, 194, 142);
                di.raycastTarget = false;
            }
            if (p.Cost > 0) nx += p.Cost * 8 - 2 + 6;
            if (p.Pay != null)
            {
                float pw = Hud.Wide(p.Pay, paySize, 600, 2, 6, false) + 2;
                var tag = Hud.Box(pr, "Pay", Hud.Rgba(200, 85, 61), 999);
                Hud.Place((RectTransform)tag.transform, nx, 3 + (nameSize * 1.2f - (paySize * 1.2f + 2)) / 2, pw, paySize * 1.2f + 2);
                Hud.Label(tag.transform, p.Pay, paySize, Color.white, false, 600, 2);
            }
            var wordsT = Hud.Text(pr, p.Words, tx, 3 + nameSize * 1.2f, textW, ph - 6 - nameSize * 1.2f, wordSize, p.Off ? Hud.Rgba(176, 86, 63) : dark ? Hud.Rgba(198, 210, 234) : Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
            wordsT.textWrappingMode = TextWrappingModes.Normal;
            y += ph + 5;
        }
        stageKey = null;
        if (stagePane != null) Destroy(stagePane.gameObject);
    }

    /// <summary>
    /// A Hero's ability (app.ts hero-ability): paid for with a sacrifice, first the card of yours to give up; one that
    /// heats, with rival cards on the table, aimed (a card, or their sun); else used at once.
    /// </summary>
    void UseAbility(int index)
    {
        var why = Game.HeroAbilityProblem(state, Me, index);
        if (why != null) { Say(why); return; }
        heroPanel.gameObject.SetActive(false);
        var hero = Game.CommandCard(Me);
        if (hero == null) return;
        if (Game.HeroAbilities(Me, hero, true)[index].Pay?.Sacrifice == true)
        {
            pending = new Pending { Uid = hero.Uid, Step = "sacrifice", Ability = index };
            Sound.Play("hover");
            Refresh();
            return;
        }
        if (Game.AbilityAimable(hero.DefId, index) && Game.AimChoices(state, Me).Cards.Count > 0)
        {
            pending = new Pending { Uid = hero.Uid, Step = "aim", Ability = index };
            Sound.Play("hover");
            Refresh();
            return;
        }
        Sound.Play("hero");
        Do(new EngineAction { Type = "heroAbility", Index = index });
    }

    /// <summary>The Hero's singularity (app.ts singularity): one that blasts a card, with rival cards on the table, aimed first.</summary>
    void Unleash()
    {
        var why = Game.SingularityProblem(state, Me);
        if (why != null) { Say(why); return; }
        heroPanel.gameObject.SetActive(false);
        var hero = Game.CommandCard(Me);
        if (hero == null) return;
        if ((Singularities.Of(hero.DefId)?.Effects ?? new List<Effect>()).Any(e => e.Type == "blast") && Game.AimChoices(state, Me).Cards.Count > 0)
        {
            pending = new Pending { Uid = hero.Uid, Step = "aim", Ability = SingAim };
            Sound.Play("hover");
            Refresh();
            return;
        }
        Sound.Play("hero");
        Do(new EngineAction { Type = "singularity" });
    }
}
