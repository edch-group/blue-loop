using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// What shows over the map (campaign.ts renderCampaign, renderOverlay): along the top, you and your purse and the
/// settings, with the story's word under you; over the map, whatever waits on you, one thing at a time.
/// </summary>
public partial class CampaignView
{
    static readonly Color Gold = new Color(0.78f, 0.6f, 0.24f);

    // ---- Along the top ----

    void Top()
    {
        foreach (Transform c in top) Mats.Kill(c.gameObject);
        var me = Campaign.Player(state);
        var meta = LoadMeta();
        var level = Meta.LevelFor(meta.Xp);
        // You: your portrait, COMMANDER and your level, and how far into it.
        var chip = Hud.Glass(top, "You", Color.white);
        Hud.At((RectTransform)chip.transform, new Vector2(0, 1), new Vector2(18, -10), new Vector2(312, 62));
        Portrait(chip.transform, me.Hero ?? Campaign.Flagship(state, state.PlayerId)?.General, new Vector2(6, 0), 50);
        var who = Hud.Label(chip.transform, $"COMMANDER  <color=#{ColorUtility.ToHtmlStringRGB(Gold)}><size=85%>LEVEL {level.Level}</size></color>", 15, Look.Ink, true, 500, 14, TextAlignmentOptions.TopLeft);
        who.margin = new Vector4(66, 12, 0, 0);
        var bar = Hud.Rect(chip.transform, "Bar");
        Hud.At(bar, new Vector2(0, 0), new Vector2(66, 14), new Vector2(222, 4));
        var bi = bar.gameObject.AddComponent<Image>();
        bi.sprite = Hud.Rounded;
        bi.type = Image.Type.Sliced;
        bi.color = new Color(0.88f, 0.89f, 0.92f);
        var fill = Hud.Rect(bar, "Fill");
        fill.anchorMin = Vector2.zero;
        fill.anchorMax = new Vector2(Mathf.Clamp01((float)(level.Into / Mathf.Max(1, (float)level.Need))), 1);
        fill.offsetMin = fill.offsetMax = Vector2.zero;
        var fi = fill.gameObject.AddComponent<Image>();
        fi.sprite = Hud.Rounded;
        fi.type = Image.Type.Sliced;
        fi.color = Gold;
        // The story's word, under you.
        var scene = OverlayUp() ? null : state.Story.Queue.FirstOrDefault();
        if (scene != null && Shown(scene).Count > 0) Story(scene);
        // Your purse: your sun's heat (it starts the next battle as the last left it), materials, petals.
        var f = Campaign.Flagship(state, state.PlayerId);
        int heat = f?.Damage ?? 0;
        var purse = Hud.Rect(top, "Purse");
        Hud.At(purse, new Vector2(0.5f, 1), new Vector2(0, -22), new Vector2(300, 40));
        Purse(purse, 0, "☀", heat > 0 ? new Color(0.9f, 0.45f, 0.2f) : heat < 0 ? new Color(0.35f, 0.6f, 0.9f) : new Color(0.85f, 0.62f, 0.25f), heat.ToString());
        Purse(purse, 1, "⬢", new Color(0.62f, 0.45f, 0.2f), me.Materials.ToString());
        Purse(purse, 2, "◆", new Color(0.55f, 0.65f, 0.9f), state.Petals.ToString());
        // Settings.
        var gear = Hud.Glass(top, "Settings", Color.white);
        Hud.At((RectTransform)gear.transform, new Vector2(1, 1), new Vector2(-18, -10), new Vector2(63, 63));
        gear.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); Settings(); });
        var ic = Hud.Rect(gear.transform, "Icon");
        Hud.Fill(ic);
        var raw = ic.gameObject.AddComponent<RawImage>();
        raw.texture = Resources.Load<Texture2D>("Icons/hud-settings");
        raw.raycastTarget = false;
    }

    static void Purse(RectTransform purse, int i, string mark, Color c, string n)
    {
        var r = Hud.Rect(purse, "Token");
        Hud.At(r, new Vector2(0, 0.5f), new Vector2(i * 100, 0), new Vector2(96, 40));
        var dot = Hud.Rect(r, "Mark");
        Hud.At(dot, new Vector2(0, 0.5f), Vector2.zero, new Vector2(28, 28));
        var di = dot.gameObject.AddComponent<Image>();
        di.sprite = Hud.Circle;
        di.color = new Color(0.12f, 0.13f, 0.2f);
        Hud.Label(dot, mark, 15, c, false, 600, 0);
        var t = Hud.Label(r, n, 18, Look.Ink, true, 500, 4, TextAlignmentOptions.Left);
        t.margin = new Vector4(36, 0, 0, 0);
    }

    /// <summary>A card's portrait in a circle (a hero, a speaker).</summary>
    static void Portrait(Transform parent, string defId, Vector2 at, float size)
    {
        var face = Hud.Rect(parent, "Portrait");
        Hud.At(face, new Vector2(0, 0.5f), at, new Vector2(size, size));
        var ring = face.gameObject.AddComponent<Image>();
        ring.sprite = Hud.Circle;
        ring.color = new Color(0.82f, 0.68f, 0.38f);
        var inner = Hud.Rect(face, "Inner");
        Hud.Fill(inner);
        inner.offsetMin = new Vector2(2, 2);
        inner.offsetMax = new Vector2(-2, -2);
        inner.gameObject.AddComponent<Image>().sprite = Hud.Circle;
        inner.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var pic = Hud.Rect(inner, "Picture");
        Hud.Fill(pic);
        var raw = pic.gameObject.AddComponent<RawImage>();
        raw.texture = defId != null ? EngineData.Art(defId) : null;
        raw.raycastTarget = false;
    }

    /// <summary>A scene's word, a line at a time: who says it (their portrait and name), what they say, and on.</summary>
    void Story(StoryScene scene)
    {
        var lines = Shown(scene);
        storyLine = Mathf.Clamp(storyLine, 0, lines.Count - 1);
        var line = lines[storyLine];
        var bubble = Hud.Glass(top, "Story", Color.white);
        var br = (RectTransform)bubble.transform;
        var t = Hud.Label(br, line.Text, 16, Look.Ink, false, 400, 0, TextAlignmentOptions.TopLeft);
        t.textWrappingMode = TextWrappingModes.Normal;
        t.margin = new Vector4(82, 32, 66, 14);
        var size = t.GetPreferredValues(line.Text, 476 - 148, 0);
        Hud.At(br, new Vector2(0, 1), new Vector2(18, -86), new Vector2(476, Mathf.Max(100, size.y + 50)));
        Portrait(br, line.Speaker?.Card, new Vector2(16, 0), 54);
        string who = line.Speaker?.Card != null && CardData.TryGet(line.Speaker.Card, out var sd) ? sd.Name : line.Speaker?.Kind ?? "";
        var k = Hud.Label(br, who.ToUpperInvariant(), 11, Look.InkFaint, true, 500, 22, TextAlignmentOptions.TopLeft);
        k.margin = new Vector4(82, 14, 0, 0);
        var next = Hud.Rect(br, "Next");
        Hud.At(next, new Vector2(1, 0.5f), new Vector2(-14, 0), new Vector2(40, 40));
        var ni = next.gameObject.AddComponent<Image>();
        ni.sprite = Hud.Circle;
        ni.color = new Color(0.94f, 0.94f, 0.96f);
        Hud.Label(next, storyLine < lines.Count - 1 ? "›" : "×", 20, Look.InkSoft, false, 400, 0);
        next.gameObject.AddComponent<Button>().onClick.AddListener(() =>
        {
            Sound.Play("hover");
            if (storyLine < lines.Count - 1) storyLine++;
            else
            {
                storyLine = 0;
                state = Campaign.Apply(state, new CampaignAction { Type = "readStory" });
                Save(state);
            }
            Refresh();
        });
    }

    // ---- Over the map: whatever waits on you ----

    bool OverlayUp() => state.Winner != null || state.Boon != null || state.Battle != null || state.Conquest != null || state.Loot != null
        || (state.Joined?.Count ?? 0) > 0 || state.Encounter != null || state.Struggle != null || state.Beaten != null || state.Dream != null
        || state.Prophet != null || (state.EmblemChoice?.Count ?? 0) > 0 || state.CardRewards.Count > 0;

    bool lootOpen;
    string cardPick, keepPick;
    bool dreamStarting;

    void Overlays()
    {
        foreach (Transform c in overlay) Mats.Kill(c.gameObject);
        var s = state;
        if (s.Winner != null) { RunOver(); return; }
        if (s.Boon != null && s.Battle == null)
        {
            Modal($"{s.Boon.Source.ToLowerInvariant()} held", body => Rows(body, ("+5 max health", "for good", () => Act(new CampaignAction { Type = "takeBoon", Pick = "health" }, "upgrade")), ("cool your sun by 6", "now", () => Act(new CampaignAction { Type = "takeBoon", Pick = "cool" }, "upgrade"))));
            return;
        }
        if (s.Battle != null) { OpenBattle(); return; }
        if (s.Conquest != null)
        {
            var n = Campaign.NodeById(s, s.Conquest.NodeId);
            Modal($"{n.Name.ToLowerInvariant()} has fallen", body => Rows(body, ($"take it · ⬢+{n.Yield.Materials}", null, () => Act(new CampaignAction { Type = "conquer", Choice = "settle" }, "upgrade"))));
            return;
        }
        if (s.Loot != null) { Loot(); return; }
        var joined = s.Joined?.FirstOrDefault();
        if (joined != null && s.CardRewards.Count == 0) { Joined(joined); return; }
        if (s.Encounter != null && s.CardRewards.Count == 0) { Encounter(); return; }
        if (s.Struggle != null && s.CardRewards.Count == 0) { Struggle(); return; }
        if (s.Beaten != null && s.CardRewards.Count == 0) { Beaten(); return; }
        if (s.Dream != null && s.Struggle == null && s.Beaten == null) { Dream(); return; }
        if (s.Prophet != null) { Prophet(); return; }
        if ((s.EmblemChoice?.Count ?? 0) > 0) { Emblems(); return; }
        var reward = s.CardRewards.FirstOrDefault();
        if (reward != null) { CardReward(reward); return; }
    }

    /// <summary>A move from an overlay: made, its sound, and everything shown afresh.</summary>
    void Act(CampaignAction a, string sound = null)
    {
        if (Apply(a) && sound != null) Sound.Play(sound);
        Map();
        Refresh();
    }

    // ---- Building blocks: a veil, a white card, its title, rows of choices, cards to pick ----

    RectTransform Veil(Transform parent)
    {
        var v = Hud.Rect(parent, "Veil");
        Hud.Fill(v);
        var i = v.gameObject.AddComponent<Image>();
        i.color = new Color(0.95f, 0.95f, 0.94f, 0.82f);
        return v;
    }

    /// <summary>A modal (the web's .modal): a white card with its title in spaced capitals, its body under it.</summary>
    RectTransform Modal(string title, System.Action<RectTransform> body, float width = 760, float height = 420, Transform parent = null)
    {
        var v = Veil(parent ?? overlay);
        var card = Hud.Glass(v, "Card", Color.white);
        var cr = (RectTransform)card.transform;
        Hud.At(cr, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(width, height));
        var t = Hud.Label(cr, title.ToUpperInvariant(), 18, Look.Ink, true, 500, 30, TextAlignmentOptions.Top);
        t.margin = new Vector4(24, 26, 24, 0);
        var rule = Hud.Rect(cr, "Rule");
        Hud.At(rule, new Vector2(0.5f, 1), new Vector2(0, -60), new Vector2(60, 2));
        rule.gameObject.AddComponent<Image>().color = new Color(0.55f, 0.57f, 0.63f, 0.6f);
        var b = Hud.Rect(cr, "Body");
        Hud.Fill(b);
        b.offsetMin = new Vector2(24, 24);
        b.offsetMax = new Vector2(-24, -80);
        body(b);
        return v;
    }

    /// <summary>Rows of choices (the web's settings panel of choice rows): each its words, a note, a chevron.</summary>
    static void Rows(RectTransform body, params (string label, string note, System.Action act)[] rows)
    {
        for (int i = 0; i < rows.Length; i++)
        {
            var (label, note, act) = rows[i];
            var r = Hud.Glass(body, label, Color.white, false);
            var rr = (RectTransform)r.transform;
            Hud.At(rr, new Vector2(0.5f, 1), new Vector2(0, -i * 72), new Vector2(Mathf.Min(520, body.rect.width > 0 ? body.rect.width : 520), 64));
            r.color = new Color(0.975f, 0.975f, 0.98f);
            var b = r.gameObject.AddComponent<Button>();
            if (act != null) b.onClick.AddListener(() => { Sound.Play("click"); act(); });
            else b.interactable = false;
            var l = Hud.Label(rr, label.ToUpperInvariant(), 15, Look.Ink, true, 600, 22, TextAlignmentOptions.Left);
            l.margin = new Vector4(26, 0, 0, note != null ? 16 : 0);
            if (note != null)
            {
                var n = Hud.Label(rr, note, 13, Look.InkSoft, false, 400, 0, TextAlignmentOptions.BottomLeft);
                n.margin = new Vector4(26, 0, 0, 10);
            }
            var chev = Hud.Label(rr, "›", 22, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Right);
            chev.margin = new Vector4(0, 0, 22, 4);
        }
    }

    /// <summary>A card's face, tappable, at a size (its width; its height 1.4 times).</summary>
    static Button CardPick(Transform parent, string id, Vector2 at, float w, bool on, System.Action act, Vector2? anchor = null)
    {
        var r = Hud.Rect(parent, id);
        Hud.At(r, anchor ?? new Vector2(0.5f, 0.5f), at, new Vector2(w, w * 1.4f));
        if (on)
        {
            var ring = Hud.Rect(r, "Ring");
            Hud.Fill(ring);
            ring.offsetMin = new Vector2(-5, -5);
            ring.offsetMax = new Vector2(5, 5);
            var ri = ring.gameObject.AddComponent<Image>();
            ri.sprite = Hud.Rounded;
            ri.type = Image.Type.Sliced;
            ri.color = Look.Ink;
        }
        var face = Hud.Rect(r, "Face");
        Hud.Fill(face);
        var raw = face.gameObject.AddComponent<RawImage>();
        raw.texture = Faces.Of(id, false);
        var b = r.gameObject.AddComponent<Button>();
        b.targetGraphic = raw;
        if (act != null) b.onClick.AddListener(() => act());
        return b;
    }

    // ---- The run over ----

    void RunOver()
    {
        var v = Veil(overlay);
        var title = Hud.Label(v, "YOU ARE DEAD", 44, Look.Ink, true, 400, 40, TextAlignmentOptions.Top);
        title.margin = new Vector4(0, 140, 0, 0);
        var said = Hud.Label(v, "The others will follow, soon enough…", 18, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
        said.margin = new Vector4(0, 210, 0, 0);
        var petals = Hud.Label(v, $"+ {state.Petals} ◆", 20, new Color(0.45f, 0.55f, 0.85f), true, 500, 10, TextAlignmentOptions.Top);
        petals.margin = new Vector4(0, 250, 0, 0);
        var keepable = Campaign.KeepableCards(state);
        if (keepPick != null && !keepable.Contains(keepPick)) keepPick = null;
        if (keepable.Count > 0)
        {
            var k = Hud.Label(v, "KEEP ONE CARD FOR YOUR NEXT RUN", 12, Look.InkFaint, true, 500, 24, TextAlignmentOptions.Top);
            k.margin = new Vector4(0, 310, 0, 0);
            int n = Mathf.Min(keepable.Count, 7);
            for (int i = 0; i < n; i++)
            {
                var id = keepable[i];
                CardPick(v, id, new Vector2((i - (n - 1) / 2f) * 150, -40), 136, keepPick == id, () => { Sound.Play("hover"); keepPick = keepPick == id ? null : id; Refresh(); });
            }
        }
        var exit = Hud.Pill(v, keepPick != null ? $"Keep {Cards.Def(keepPick).Name} · exit" : "Exit", NewRunFromHere, 17, Look.Ink, Color.white);
        Hud.At((RectTransform)exit.transform, new Vector2(0.5f, 0), new Vector2(0, 80), new Vector2(360, 60));
    }

    /// <summary>The run over: the card picked to keep goes with the account into the next run; off to the campaign's menu.</summary>
    void NewRunFromHere()
    {
        var meta = LoadMeta();
        meta.Kept = keepPick != null && Campaign.KeepableCards(state).Contains(keepPick) ? keepPick : null;
        SaveMeta(meta);
        Save(null);
        App.Instance.Menu("campaign");
    }

    // ---- Loot: a sealed cache, tapped open, its rewards out one at a time ----

    void Loot()
    {
        var l = state.Loot;
        var v = Veil(overlay);
        if (!lootOpen)
        {
            var cache = Hud.Rect(v, "Cache");
            Hud.At(cache, new Vector2(0.5f, 0.5f), new Vector2(0, 30), new Vector2(220, 220));
            var halo = cache.gameObject.AddComponent<Image>();
            halo.sprite = Hud.Soft;
            halo.type = Image.Type.Sliced;
            halo.color = new Color(1f, 0.85f, 0.45f, 0.7f);
            var box = Hud.Rect(cache, "Box");
            Hud.At(box, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(110, 110));
            var bi = box.gameObject.AddComponent<Image>();
            bi.sprite = Hud.Rounded;
            bi.type = Image.Type.Sliced;
            bi.color = new Color(0.32f, 0.3f, 0.36f);
            Hud.Label(box, "⬢", 46, Gold, false, 400, 0);
            cache.gameObject.AddComponent<Button>().onClick.AddListener(() =>
            {
                lootOpen = true;
                Sound.Play("cache-open");
                int n = new[] { l.Materials, l.Xp, l.Petals }.Count(x => x > 0) + (l.Relics?.Count ?? 0) + (l.Cards?.Count ?? 0);
                for (int i = 0; i < n; i++) Sound.Play($"loot-{Mathf.Min(i, 5)}", 0.5f + i * 0.35f);
                Refresh();
            });
            var tap = Hud.Label(v, $"{(l.Found != null ? "FOUND" : l.Won ? "VICTORY" : "WHAT WAS SAVED")} · TAP TO OPEN", 14, Look.InkSoft, true, 500, 24, TextAlignmentOptions.Center);
            tap.margin = new Vector4(0, 280, 0, 0);
            return;
        }
        // Every reward the same size, on a gold glow: materials, experience and petals, emblems, cards, ship parts.
        var tiles = new List<System.Action<RectTransform>>();
        if (l.Materials > 0) tiles.Add(r => Token(r, "⬢", $"+{l.Materials}", "materials"));
        if (l.Xp > 0) tiles.Add(r => Token(r, "✦", $"+{l.Xp}", "experience"));
        if (l.Petals > 0) tiles.Add(r => Token(r, "◆", $"+{l.Petals}", "petals"));
        foreach (var rel in l.Relics ?? new List<Relic>()) tiles.Add(r => Token(r, "✧", rel.Name.ToLowerInvariant(), Heroes.RelicText(rel)));
        foreach (var id in l.Cards ?? new List<string>()) tiles.Add(r => CardPick(r, id, Vector2.zero, 150, false, null));
        foreach (var id in l.Parts ?? new List<string>()) tiles.Add(r => Token(r, "⚙", Parts.ShipPart(id)?.Name.ToLowerInvariant() ?? id, "ship part"));
        int count = tiles.Count;
        for (int i = 0; i < count; i++)
        {
            var slot = Hud.Rect(v, "Reward");
            Hud.At(slot, new Vector2(0.5f, 0.5f), new Vector2((i - (count - 1) / 2f) * 190, 40), new Vector2(170, 230));
            var glow = slot.gameObject.AddComponent<Image>();
            glow.sprite = Hud.Soft;
            glow.type = Image.Type.Sliced;
            glow.color = new Color(1f, 0.86f, 0.5f, 0.45f);
            glow.raycastTarget = false;
            tiles[i](slot);
        }
        var ok = Hud.Pill(v, "Take it", () => { lootOpen = false; Act(new CampaignAction { Type = "dismissLoot" }, "buy"); }, 17, Look.Ink, Color.white);
        Hud.At((RectTransform)ok.transform, new Vector2(0.5f, 0), new Vector2(0, 120), new Vector2(240, 60));
    }

    static void Token(RectTransform r, string mark, string big, string small)
    {
        var m = Hud.Label(r, mark, 54, Gold, false, 400, 0, TextAlignmentOptions.Top);
        m.margin = new Vector4(0, 30, 0, 0);
        var b = Hud.Label(r, big.ToUpperInvariant(), 17, Look.Ink, true, 600, 10, TextAlignmentOptions.Top);
        b.textWrappingMode = TextWrappingModes.Normal;
        b.margin = new Vector4(8, 116, 8, 0);
        var s = Hud.Label(r, small, 12, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
        s.textWrappingMode = TextWrappingModes.Normal;
        s.margin = new Vector4(10, 150, 10, 0);
    }

    // ---- Choices ----

    void CardReward(CardReward reward)
    {
        if (cardPick != null && !reward.Options.Contains(cardPick)) cardPick = null;
        Modal($"★ {reward.Source.ToLowerInvariant()} · choose a new card", body =>
        {
            int n = reward.Options.Count;
            for (int i = 0; i < n; i++)
            {
                var id = reward.Options[i];
                CardPick(body, id, new Vector2((i - (n - 1) / 2f) * 200, 30), 180, cardPick == id, () => { Sound.Play("hover"); cardPick = cardPick == id ? null : id; Refresh(); });
            }
            var skip = Hud.Pill(body, "Skip", () => { cardPick = null; Act(new CampaignAction { Type = "chooseCard", DefId = null }); }, 16);
            Hud.At((RectTransform)skip.transform, new Vector2(0.5f, 0), new Vector2(-110, 0), new Vector2(190, 54));
            var pick = cardPick;
            var ok = Hud.Pill(body, "Confirm", () => { cardPick = null; Act(new CampaignAction { Type = "chooseCard", DefId = pick }, "buy"); }, 16, Look.Ink, Color.white);
            ok.interactable = pick != null;
            Hud.At((RectTransform)ok.transform, new Vector2(0.5f, 0), new Vector2(110, 0), new Vector2(190, 54));
        }, 900, 470);
    }

    void Prophet()
    {
        Modal("the dark prophet", body =>
        {
            var offers = state.Prophet.Offers;
            for (int i = 0; i < offers.Count; i++)
            {
                int index = i;
                var o = offers[i];
                CardPick(body, Builds.MarkedId(o.Mark, o.Card), new Vector2((i - (offers.Count - 1) / 2f) * 200, 40), 170, false, () => Act(new CampaignAction { Type = "prophetPick", Index = index }, "upgrade"));
                var mark = Hud.Label(body, Builds.D.NyxMarks.TryGetValue(o.Mark, out var m) ? m.Name.ToLowerInvariant() : o.Mark, 13, Look.InkSoft, false, 500, 0, TextAlignmentOptions.Bottom);
                mark.rectTransform.anchorMin = mark.rectTransform.anchorMax = new Vector2(0.5f, 0);
                mark.rectTransform.sizeDelta = new Vector2(180, 24);
                mark.rectTransform.anchoredPosition = new Vector2((i - (offers.Count - 1) / 2f) * 200, 76);
            }
            var away = Hud.Pill(body, "Turn away", () => Act(new CampaignAction { Type = "prophetPick", Index = null }, "hover"), 16);
            Hud.At((RectTransform)away.transform, new Vector2(0.5f, 0), Vector2.zero, new Vector2(200, 52));
        }, 820, 480);
    }

    void Emblems()
    {
        Modal("aster’s gift · choose an emblem", body =>
        {
            var list = state.EmblemChoice;
            for (int i = 0; i < list.Count; i++)
            {
                int index = i;
                var rel = list[i];
                var r = Hud.Glass(body, rel.Name, Color.white);
                var rr = (RectTransform)r.transform;
                Hud.At(rr, new Vector2(0.5f, 0.5f), new Vector2((i - (list.Count - 1) / 2f) * 230, 0), new Vector2(210, 220));
                Token(rr, "✧", rel.Name.ToLowerInvariant(), Heroes.RelicText(rel));
                r.gameObject.AddComponent<Button>().onClick.AddListener(() => Act(new CampaignAction { Type = "chooseEmblem", Index = index }, "upgrade"));
            }
        }, 800, 380);
    }

    // ---- Scenes: a companion joining, an encounter, a power struggle, a rival beaten, a dream ----

    /// <summary>A scene (the web's scene overlay): who it is, their words a line at a time, and the choices under them.</summary>
    void Scene(string kicker, string title, List<(string who, string text)> lines, System.Action<RectTransform> actions, string portrait = null)
    {
        var v = Veil(overlay);
        if (portrait != null) Portrait(v, portrait, new Vector2(800 - 60, 210), 120);
        var k = Hud.Label(v, kicker.ToUpperInvariant(), 13, Look.InkFaint, true, 500, 30, TextAlignmentOptions.Top);
        k.margin = new Vector4(0, 300, 0, 0);
        var t = Hud.Label(v, title.ToUpperInvariant(), 34, Look.Ink, true, 400, 34, TextAlignmentOptions.Top);
        t.margin = new Vector4(0, 326, 0, 0);
        float y = -390;
        foreach (var (who, text) in lines)
        {
            var w = Hud.Label(v, $"<size=70%><color=#8a8f99>{who.ToUpperInvariant()}</color></size>\n“{text}”", 18, Look.Ink, false, 400, 0, TextAlignmentOptions.Top);
            w.textWrappingMode = TextWrappingModes.Normal;
            w.rectTransform.anchorMin = w.rectTransform.anchorMax = new Vector2(0.5f, 1);
            w.rectTransform.pivot = new Vector2(0.5f, 1);
            w.rectTransform.sizeDelta = new Vector2(760, 80);
            w.rectTransform.anchoredPosition = new Vector2(0, y);
            y -= 84;
        }
        var acts = Hud.Rect(v, "Actions");
        Hud.At(acts, new Vector2(0.5f, 1), new Vector2(0, y - 10), new Vector2(900, 60));
        actions(acts);
    }

    static void Buttons(RectTransform row, params (string label, bool primary, string why, System.Action act)[] bs)
    {
        float w = 230, gap = 16, total = bs.Length * w + (bs.Length - 1) * gap;
        for (int i = 0; i < bs.Length; i++)
        {
            var (label, primary, why, act) = bs[i];
            var b = Hud.Pill(row, label, () => act(), 15, primary ? Look.Ink : Color.white, primary ? Color.white : Look.Ink);
            b.interactable = why == null;
            Hud.At((RectTransform)b.transform, new Vector2(0.5f, 0.5f), new Vector2(-total / 2 + w / 2 + i * (w + gap), 0), new Vector2(w, 54));
        }
    }

    List<string> Crew() => (Campaign.Player(state).Reserve ?? new List<string>()).Where(id => id.StartsWith("companion_")).Select(id => id.Substring("companion_".Length)).ToList();

    void Joined(JoinedCompanion joined)
    {
        var c = Companions.All.FirstOrDefault(x => x.Id == joined.Id);
        string name = c?.Name ?? joined.Id;
        Scene("joins the crew", name, new List<(string, string)> { (name, joined.Line) }, row =>
        {
            if (joined.Swap == true)
            {
                var aboard = Crew().Where(x => x != joined.Id).ToList();
                var bs = aboard.Select(id => ($"{(Companions.All.FirstOrDefault(x => x.Id == id)?.Name ?? id).Split(' ')[0]} stays ashore", false, (string)null, (System.Action)(() => Act(new CampaignAction { Type = "crewSwap", Out = id }, "hover")))).ToList();
                bs.Add(($"{name.Split(' ')[0]} waits ashore", false, null, () => Act(new CampaignAction { Type = "crewSwap", Out = null }, "hover")));
                Buttons(row, bs.ToArray());
            }
            else Buttons(row, ("Welcome aboard", true, null, () => Act(new CampaignAction { Type = "joinedSeen" }, "hover")));
        }, c?.Card);
    }

    void Encounter()
    {
        var e = state.Encounter;
        var me = Campaign.Player(state);
        string title = Encounters.VisitorName(e.Kind, e.Stage);
        string kicker = e.Kind == "hunters" ? "bounty hunters" : "encounter";
        if (e.Outcome == null)
        {
            var lines = Encounters.OpeningLines(e.Kind, e.Price, e.Stage, Crew()).Select(l => (l.Who == "visitor" ? title : l.Who, l.Text)).ToList();
            Scene(kicker, title, lines, row =>
            {
                var choices = Encounters.EncounterChoices(e.Kind, e.Price, e.Stage)
                    .Select(c => (System.Text.RegularExpressions.Regex.Replace(c.Label, @" · (\d+)$", " · ⬢$1"), c.Id == "fight" || c.Id == "buy", Campaign.EncounterProblem(state, c.Id), (System.Action)(() => Act(new CampaignAction { Type = "encounter", Choice = c.Id }))))
                    .ToArray();
                Buttons(row, choices);
                var purse = Hud.Label(row, $"⬢ {me.Materials}", 15, Look.InkSoft, false, 500, 0, TextAlignmentOptions.Right);
                purse.margin = new Vector4(0, 0, -130, 0);
            });
            return;
        }
        var closing = Encounters.ClosingLines(e.Kind, e.Outcome, e.Stage, Crew()).Select(l => (l.Who == "visitor" ? title : l.Who, l.Text)).ToList();
        if (e.Part != null) closing.Add(("found", $"{Parts.ShipPart(e.Part)?.Name}: {Parts.ShipPart(e.Part)?.Text}"));
        else if (e.Outcome == "bad" && e.Slot != null) closing.Add(("damage", $"Slot {e.Slot + 1} wrecked, until a space station."));
        Scene(kicker, title, closing, row => Buttons(row, ("Fly on", true, null, () => Act(new CampaignAction { Type = "encounter", Choice = "done" }))));
    }

    void Struggle()
    {
        var hero = state.Struggle.Hero;
        bool human = Campaign.Player(state).Human == true;
        Scene("power struggle", Cards.Def(hero).Name, new List<(string, string)> { (Cards.Def(hero).Name, Campaign.StruggleLine(hero, human)) },
            row => Buttons(row, (human ? "Fight for your ship" : "Fight for your command", true, null, () => Act(new CampaignAction { Type = "struggle" }))), hero);
    }

    void Beaten()
    {
        var hero = state.Beaten.Hero;
        Scene("beaten", Cards.Def(hero).Name, new List<(string, string)>(), row => Buttons(row,
            ("Recruit · joins your deck", true, null, () => Act(new CampaignAction { Type = "struggleChoice", Recruit = true }, "upgrade")),
            ("Slay · for their hoard", false, null, () => Act(new CampaignAction { Type = "struggleChoice", Recruit = false }, "buy"))), hero);
    }

    /// <summary>A Dream of the Lost: the screen drifts into dark, with a line; then the dream begins by itself.</summary>
    void Dream()
    {
        bool spoils = state.Loot != null || state.CardRewards.Count > 0 || state.Conquest != null;
        if (spoils) return;
        var v = Veil(overlay);
        v.GetComponent<Image>().color = new Color(0.06f, 0.07f, 0.12f, 0.88f);
        var t = Hud.Label(v, "you drift into a sorrowful slumber", 22, new Color(0.85f, 0.87f, 0.95f), false, 400, 0);
        t.fontStyle = FontStyles.Italic;
        if (!dreamStarting && Application.isPlaying)
        {
            dreamStarting = true;
            Invoke(nameof(BeginDream), 4.2f);
        }
    }

    void BeginDream()
    {
        dreamStarting = false;
        if (state.Dream != null && state.Struggle == null) Act(new CampaignAction { Type = "dream" });
    }

    // ---- Stations ----

    /// <summary>A space station (its armoury): what it has to sell, each with its price, bought into your deck.</summary>
    void Armory(string nodeId)
    {
        CloseSheet();
        var n = Campaign.NodeById(state, nodeId);
        var me = Campaign.Player(state);
        var stock = n.Station?.Cards ?? new List<string>();
        var v = Modal($"{n.Name.ToLowerInvariant()} · space station", body =>
        {
            int count = Mathf.Min(stock.Count, 5);
            for (int i = 0; i < count; i++)
            {
                int index = i;
                var id = stock[i];
                var why = Campaign.BuyProblem(state, me, n, i);
                var b = CardPick(body, id, new Vector2((i - (count - 1) / 2f) * 176, 40), 160, false, () => { if (Apply(new CampaignAction { Type = "buyCard", NodeId = nodeId, Index = index })) Sound.Play("buy"); Armory(nodeId); Refresh(); });
                b.interactable = why == null;
                var price = Hud.Label(body, $"⬢ {Campaign.BuyPrice(state, me, id)}", 15, why == null ? Look.Ink : Look.InkFaint, true, 500, 4, TextAlignmentOptions.Bottom);
                price.rectTransform.anchorMin = price.rectTransform.anchorMax = new Vector2(0.5f, 0);
                price.rectTransform.sizeDelta = new Vector2(160, 24);
                price.rectTransform.anchoredPosition = new Vector2((i - (count - 1) / 2f) * 176, 64);
            }
            var purse = Hud.Label(body, $"⬢ {me.Materials}", 16, Look.InkSoft, true, 500, 4, TextAlignmentOptions.BottomLeft);
            purse.margin = new Vector4(10, 0, 0, 14);
            var leave = Hud.Pill(body, "Leave", CloseSheet, 16);
            Hud.At((RectTransform)leave.transform, new Vector2(0.5f, 0), Vector2.zero, new Vector2(190, 52));
        }, 960, 500, sheetRoot);
    }

    /// <summary>A research station: its experiments, each a big gain at a big cost; one taken.</summary>
    void Lab(string nodeId)
    {
        CloseSheet();
        var n = Campaign.NodeById(state, nodeId);
        var me = Campaign.Player(state);
        var st = n.Station;
        Modal($"{n.Name.ToLowerInvariant()} · research", body =>
        {
            var opts = (st.Options ?? new List<string>()).Where(id => !Research.RetiredResearch.Contains(id)).ToList();
            for (int i = 0; i < opts.Count; i++)
            {
                var id = opts[i];
                var p = Research.All.FirstOrDefault(x => x.Id == id);
                if (p == null) continue;
                var why = st.TakenBy != null ? (st.Project == id ? "chosen" : "gone") : Campaign.ResearchProblem(state, me, n, id);
                var r = Hud.Glass(body, id, Color.white);
                var rr = (RectTransform)r.transform;
                Hud.At(rr, new Vector2(0.5f, 1), new Vector2((i - (opts.Count - 1) / 2f) * 270, 0), new Vector2(250, 250));
                var name = Hud.Label(rr, p.Name.ToUpperInvariant(), 15, Look.Ink, true, 600, 14, TextAlignmentOptions.Top);
                name.textWrappingMode = TextWrappingModes.Normal;
                name.margin = new Vector4(14, 16, 14, 0);
                var t = Hud.Label(rr, p.Text, 14, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
                t.textWrappingMode = TextWrappingModes.Normal;
                t.margin = new Vector4(14, 64, 14, 0);
                var b = r.gameObject.AddComponent<Button>();
                b.interactable = why == null;
                b.onClick.AddListener(() => { if (Apply(new CampaignAction { Type = "research", NodeId = nodeId, ProjectId = id })) Sound.Play("upgrade"); CloseSheet(); Refresh(); });
                if (why != null)
                {
                    var w = Hud.Label(rr, why, 12, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Bottom);
                    w.textWrappingMode = TextWrappingModes.Normal;
                    w.margin = new Vector4(14, 0, 14, 12);
                }
            }
            var leave = Hud.Pill(body, "Leave", CloseSheet, 16);
            Hud.At((RectTransform)leave.transform, new Vector2(0.5f, 0), Vector2.zero, new Vector2(190, 52));
        }, 900, 440, sheetRoot);
    }

    // ---- Sheets: a question, the settings ----

    void CloseSheet()
    {
        foreach (Transform c in sheetRoot) Mats.Kill(c.gameObject);
    }

    void Ask(string title, string words, (string label, System.Action act) yes)
    {
        CloseSheet();
        Hud.Sheet(sheetRoot, title, new[] { new Hud.Row(yes.label, () => { CloseSheet(); yes.act(); }, null, true), new Hud.Row("stay", CloseSheet) }, CloseSheet);
    }

    void Settings()
    {
        CloseSheet();
        Hud.Sheet(sheetRoot, "settings", new[]
        {
            new Hud.Row("sound", () => { Sound.Muted = !Sound.Muted; Settings(); }, Sound.Muted ? "off" : "on"),
            new Hud.Row("music", Sound.Muted ? (System.Action)null : () => { Sound.MusicOn = !Sound.MusicOn; Settings(); }, Sound.MusicOn && !Sound.Muted ? "on" : "off"),
            new Hud.Row("ai speed", () => { BattleView.NextSpeed(); Settings(); }, BattleView.Speed),
            new Hud.Row("campaign log", Log),
            new Hud.Row("leave · the run is kept", () => App.Instance.Menu("hub")),
        }, CloseSheet);
    }

    void Log()
    {
        CloseSheet();
        var lines = state.Log.Skip(Mathf.Max(0, state.Log.Count - 18)).Select(l => l.Text);
        Modal("campaign log", body =>
        {
            var t = Hud.Label(body, string.Join("\n", lines), 14, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
            t.textWrappingMode = TextWrappingModes.Normal;
            t.margin = new Vector4(10, 0, 10, 60);
            var close = Hud.Pill(body, "Close", CloseSheet, 16);
            Hud.At((RectTransform)close.transform, new Vector2(0.5f, 0), Vector2.zero, new Vector2(170, 50));
        }, 760, 640, sheetRoot);
    }

    float toastUntil;
    TextMeshProUGUI toastText;

    void Toast(string text)
    {
        if (toastText == null)
        {
            var t = Hud.Glass(hud.transform, "Toast", Look.GlassStrong, false);
            Hud.At((RectTransform)t.transform, new Vector2(0.5f, 0), new Vector2(0, 40), new Vector2(760, 60));
            toastText = Hud.Label(t.transform, "", 17, Look.Ink, false, 500, 0);
        }
        toastText.text = text;
        toastText.transform.parent.gameObject.SetActive(true);
        toastUntil = Time.time + 3.5f;
        Invoke(nameof(HideToast), 3.6f);
    }

    void HideToast()
    {
        if (toastText != null && Time.time >= toastUntil) toastText.transform.parent.gameObject.SetActive(false);
    }
}
