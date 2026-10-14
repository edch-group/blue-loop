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
    static string Words(string raw)
    {
        words ??= Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, string>>(Resources.Load<TextAsset>("Engine/words").text);
        if (raw == null) return "";
        return words.TryGetValue(raw, out var w) ? w : System.Text.RegularExpressions.Regex.Replace(raw, @"\{[^}]*\}", "").Trim();
    }

    static string ChargeWords(string kind, int n)
    {
        Words("");
        return words.TryGetValue($"charge:{kind}", out var w) ? w.Replace("{n}", n.ToString()) : $"{kind} {n}";
    }

    void ShowHero()
    {
        foreach (Transform c in heroPanel) Mats.Kill(c.gameObject);
        var hero = Game.CommandCard(Me);
        if (hero == null || !MyDay) return;
        heroPanel.gameObject.SetActive(true);
        Hud.Fill(heroPanel);
        // (A tap anywhere else puts it away.)
        var away = heroPanel.gameObject.GetComponent<Image>() ?? heroPanel.gameObject.AddComponent<Image>();
        away.color = new Color(1, 1, 1, 0.001f);
        var ab = heroPanel.gameObject.GetComponent<Button>() ?? heroPanel.gameObject.AddComponent<Button>();
        ab.onClick.RemoveAllListeners();
        ab.onClick.AddListener(() => heroPanel.gameObject.SetActive(false));

        var face = Hud.Rect(heroPanel, "Card");
        Hud.At(face, new Vector2(1, 0.5f), new Vector2(-40, 0), new Vector2(360, 504));
        var fi = face.gameObject.AddComponent<Image>();
        fi.sprite = Hud.Rounded;
        fi.type = Image.Type.Sliced;
        face.gameObject.AddComponent<Mask>().showMaskGraphic = true;
        var pic = Hud.Rect(face, "Face");
        Hud.Fill(pic);
        pic.gameObject.AddComponent<RawImage>().texture = Faces.Of(hero.DefId, false);

        // The pills, bottom up: attack, the abilities, the singularity on top.
        var pills = new List<(string name, string words, string pay, string mark, Color ring, bool off, System.Action act)>();
        var k = Singularities.Of(hero.DefId);
        if (k != null)
        {
            var why = Game.SingularityProblem(state, Me);
            pills.Add((k.Name, why != null ? $"{Mathf.Min(hero.Charge ?? 0, k.Need)}/{k.Need} · {ChargeWords(k.Charge, k.Need)}" : Words(k.Text), null, "✦", new Color(0.83f, 0.65f, 0.16f), why != null, Unleash));
        }
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
            if ((a.Cost ?? 0) > 0) pay.Insert(0, $"{a.Cost} energy");
            int index = i;
            pills.Add((a.Name, why ?? Words(a.Text), pay.Count > 0 ? string.Join(" · ", pay) : null, amount > 0 ? amount.ToString() : "•", new Color(0.83f, 0.65f, 0.16f), why != null, () => UseAbility(index)));
        }
        var aims = Game.AimChoices(state, Me, true);
        if (Game.CardAttack(state, Me, hero) > 0 && (aims.Sun || aims.Cards.Count > 0) && Game.AttackProblem(state, Me, hero.Uid, null, false) == null)
            pills.Add(("Attack", aims.Sun ? "A rival card or their sun." : "A rival card.", null, Game.CardAttack(state, Me, hero).ToString(), new Color(0.84f, 0.38f, 0.27f), false, () => { heroPanel.gameObject.SetActive(false); attacker = hero.Uid; Refresh(); }));
        for (int i = 0; i < pills.Count; i++)
        {
            var (name, said, pay, mark, ring, off, act) = pills[i];
            float y = -80 + (pills.Count - 1 - i) * 54;
            var edge = Hud.Rect(heroPanel, name + " edge");
            Hud.At(edge, new Vector2(1, 0.5f), new Vector2(-418 + 1.5f, y), new Vector2(261, 53));
            var ei = edge.gameObject.AddComponent<Image>();
            ei.sprite = Hud.Rounded;
            ei.type = Image.Type.Sliced;
            ei.color = off ? new Color(0.59f, 0.61f, 0.67f, 0.45f) : new Color(ring.r, ring.g, ring.b, 0.6f);
            ei.raycastTarget = false;
            var pill = Hud.Rect(heroPanel, name);
            Hud.At(pill, new Vector2(1, 0.5f), new Vector2(-418, y), new Vector2(258, 50));
            var pi = pill.gameObject.AddComponent<Image>();
            pi.sprite = Hud.Rounded;
            pi.type = Image.Type.Sliced;
            pi.color = new Color(1, 1, 1, 0.97f);
            var group = pill.gameObject.AddComponent<CanvasGroup>();
            group.alpha = off ? 0.6f : 1;
            edge.gameObject.AddComponent<CanvasGroup>().alpha = off ? 0.6f : 1;
            var b = pill.gameObject.AddComponent<Button>();
            var cb = b.colors;
            cb.highlightedColor = new Color(1f, 0.96f, 0.89f);
            b.colors = cb;
            if (!off) { var go = act; b.onClick.AddListener(() => { Sound.Play("click"); go(); }); }
            // Its mark: a ring with what it does, and how much.
            var m = Hud.Rect(pill, "Mark");
            Hud.At(m, new Vector2(0, 0.5f), new Vector2(10, 0), new Vector2(32, 32));
            var mi = m.gameObject.AddComponent<Image>();
            mi.sprite = Hud.Circle;
            mi.color = new Color(ring.r, ring.g, ring.b, 0.5f);
            mi.raycastTarget = false;
            var mf = Hud.Rect(m, "Fill");
            Hud.Fill(mf);
            mf.offsetMin = new Vector2(1.5f, 1.5f);
            mf.offsetMax = new Vector2(-1.5f, -1.5f);
            var mfi = mf.gameObject.AddComponent<Image>();
            mfi.sprite = Hud.Circle;
            mfi.raycastTarget = false;
            Hud.Label(mf, mark, 14, new Color(0.63f, 0.48f, 0.16f), mark != "✦", 500, 0);
            // Its name and costs, and what it does (or why not).
            var n = Hud.Label(pill, $"{name.ToUpperInvariant()}{(pay != null ? $"  <size=75%><color=#d0654b>{pay}</color></size>" : "")}", 14, Look.Ink, true, 500, 14, TextAlignmentOptions.TopLeft);
            n.margin = new Vector4(52, 7, 8, 0);
            var w = Hud.Label(pill, said, 13, Look.InkSoft, false, 400, 0, TextAlignmentOptions.BottomLeft);
            w.margin = new Vector4(52, 0, 8, 7);
            w.overflowMode = TextOverflowModes.Ellipsis;
        }
    }

    /// <summary>A Hero's ability: at once, or (aimed) tap what it strikes, as a card from hand is aimed.</summary>
    void UseAbility(int index)
    {
        heroPanel.gameObject.SetActive(false);
        var hero = Game.CommandCard(Me);
        if (hero == null) return;
        var opts = new List<EngineAction>();
        if (Game.AbilityAimable(hero.DefId, index))
        {
            var aim = Game.AimChoices(state, Me);
            if (aim.Sun) opts.Add(new EngineAction { Type = "heroAbility", Index = index });
            opts.AddRange((aim.Cards ?? new List<CardInstance>()).Select(c => new EngineAction { Type = "heroAbility", Index = index, AimUid = c.Uid }));
        }
        else opts.Add(new EngineAction { Type = "heroAbility", Index = index });
        Aim(hero.Uid, opts);
    }

    void Unleash()
    {
        heroPanel.gameObject.SetActive(false);
        var hero = Game.CommandCard(Me);
        if (hero == null) return;
        var aim = Game.AimChoices(state, Me);
        var opts = new List<EngineAction>();
        if (aim.Sun || (aim.Cards?.Count ?? 0) == 0) opts.Add(new EngineAction { Type = "singularity" });
        opts.AddRange((aim.Cards ?? new List<CardInstance>()).Select(c => new EngineAction { Type = "singularity", AimUid = c.Uid }));
        Aim(hero.Uid, opts);
    }

    /// <summary>One choice: done at once; more: the targets light up to be tapped (or their sun).</summary>
    void Aim(string heroUid, List<EngineAction> opts)
    {
        if (opts.Count == 0) { Say("Nothing to aim at."); return; }
        if (opts.Count == 1) { Do(opts[0]); return; }
        Clear();
        picked = heroUid;
        options = opts;
        Refresh();
    }
}
