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
        const float Z = WebLook.Zoom;
        foreach (Transform c in top) Mats.Kill(c.gameObject);
        var me = Campaign.Player(state);
        var meta = LoadMeta();
        // (The commander's experience in all: what is banked, and what this run has earned and not yet banked.)
        var level = Meta.LevelFor(meta.Xp + Mathf.Max(0, (state.Xp ?? 0) - (state.XpBanked ?? 0)));
        // You (campaign.ts renderProfile, .cmp-profile): a white pill, your face ringed in white and gold, your name and
        // level, and under them how far into it you are.
        var chip = WebLook.Rounded(top, "You", Look.GlassStrong, 32);
        chip.raycastTarget = true;
        WebLook.Box(chip.rectTransform, 17, 9, 314, 64);
        WebLook.Shadow(chip, 8 * Z, 30 * Z, new Color(90 / 255f, 90 / 255f, 110 / 255f, 0.13f), 32);
        Face(chip.transform, me.Hero ?? Campaign.Flagship(state, state.PlayerId)?.General, 7 + 26, 6 + 26, 52, new Color32(0x1a, 0x1c, 0x2a, 255), (2 * Z, Color.white), (3 * Z, new Color(201 / 255f, 162 / 255f, 78 / 255f, 0.7f)));
        string name = string.IsNullOrEmpty(Profile.Me.Name) ? "commander" : Profile.Me.Name.ToLowerInvariant();
        var who = WebLook.Words(WebLook.Box(chip.transform, "Name", 71, 17, 120 * Z, 19), name.ToUpperInvariant(), 0.66f * 16 * Z, 0.14f, Look.Ink, true, 500, TextAlignmentOptions.Left);
        who.overflowMode = TextOverflowModes.Ellipsis;
        float nameW = Mathf.Min(120 * Z, who.GetPreferredValues(who.text).x);
        WebLook.Words(WebLook.Box(chip.transform, "Level", 71 + nameW + 8 * Z, 19, 80, 16), $"LEVEL {level.Level}", 0.56f * 16 * Z, 0.14f, WebLook.Hex("#9a7429"), true, 400, TextAlignmentOptions.Left);
        var bar = WebLook.Rounded(chip.transform, "Bar", new Color(150 / 255f, 156 / 255f, 172 / 255f, 0.25f), 2 * Z);
        WebLook.Box(bar.rectTransform, 71, 40, 222, 6);
        float into = Mathf.Clamp01((float)level.Into / Mathf.Max(1, (float)level.Need));
        if (into > 0)
        {
            var fill = WebLook.Rounded(bar.transform, "Fill", Color.white, 2 * Z);
            WebLook.Box(fill.rectTransform, 0, 0, 222 * into, 6);
            WebLook.Fade(fill, WebLook.Hex("#d9b45e"), WebLook.Hex("#f1d48a"), true);
        }
        // The story's word, under you.
        var scene = OverlayUp() ? null : state.Story.Queue.FirstOrDefault();
        if (scene != null && Shown(scene).Count > 0) Story(scene);
        // Your purse (.cmp-purse), centred: your sun's heat (it starts the next battle as the last left it), materials,
        // petals; each its token and its count.
        var f = Campaign.Flagship(state, state.PlayerId);
        int heat = f?.Damage ?? 0;
        var purse = Hud.Rect(top, "Purse");
        Hud.Fill(purse);
        var items = new (string icon, float size, string n)[]
        {
            ($"sun-{(heat > 0 ? "hot" : heat < 0 ? "cold" : "warm")}", 27, heat.ToString()),
            ("materials", 27, me.Materials.ToString()),
            ("petal", 24, state.Petals.ToString()),
        };
        var counts = new TextMeshProUGUI[items.Length];
        float total = 0;
        for (int i = 0; i < items.Length; i++)
        {
            // (Orbitron at 600 is drawn at 700 on the web: the nearest heavier weight it has.)
            counts[i] = WebLook.Words(Hud.Rect(purse, "Count"), items[i].n, 0.78f * 16 * Z, 0, Look.Ink, true, 700, TextAlignmentOptions.Left);
            total += items[i].size + 4 * Z + counts[i].GetPreferredValues(items[i].n).x + (i > 0 ? 18 * Z : 0);
        }
        float x = 800 - total / 2;
        for (int i = 0; i < items.Length; i++)
        {
            var (icon, size, n) = items[i];
            var mark = WebLook.Centred(purse, icon, x + size / 2, 40.5f, size, size).gameObject.AddComponent<RawImage>();
            mark.texture = Resources.Load<Texture2D>($"Icons/purse-{icon}");
            mark.raycastTarget = false;
            x += size + 4 * Z;
            float w = counts[i].GetPreferredValues(n).x;
            WebLook.Box((RectTransform)counts[i].transform, x, 30, w + 4, 22);
            x += w + 18 * Z;
        }
        // Settings (.icon-btn): a white disc, its gear.
        var gear = WebLook.Rounded(top, "Settings", Look.GlassStrong, 999);
        gear.raycastTarget = true;
        WebLook.Box(gear.rectTransform, 1519, 9, 64, 64);
        WebLook.Shadow(gear, 2 * Z, 10 * Z, new Color(90 / 255f, 90 / 255f, 110 / 255f, 0.12f), 32);
        gear.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); Settings(); });
        var raw = WebLook.Centred(gear.transform, "Icon", 32, 32, 50, 50).gameObject.AddComponent<RawImage>();
        raw.texture = Resources.Load<Texture2D>("Icons/hud-settings");
        raw.raycastTarget = false;
    }

    /// <summary>
    /// A face in a circle (.cmp-portrait): a card's art on its dark disc, centred at a point of its parent (from its
    /// top left), ringed by box-shadow rings (each its outer reach and colour, innermost first).
    /// </summary>
    static RectTransform Face(Transform parent, string defId, float x, float y, float size, Color back, params (float reach, Color colour)[] rings)
    {
        var face = WebLook.Centred(parent, "Face", x, y, size, size);
        for (int i = rings.Length - 1; i >= 0; i--)
        {
            var ring = WebLook.Rounded(face, "Ring", rings[i].colour, 999);
            Hud.Fill(ring.rectTransform);
            ring.rectTransform.offsetMin = -Vector2.one * rings[i].reach;
            ring.rectTransform.offsetMax = Vector2.one * rings[i].reach;
        }
        var disc = WebLook.Rounded(face, "Disc", back, 999);
        Hud.Fill(disc.rectTransform);
        disc.gameObject.AddComponent<Mask>().showMaskGraphic = true;
        var pic = Hud.Rect(disc.transform, "Picture");
        Hud.Fill(pic);
        var raw = pic.gameObject.AddComponent<RawImage>();
        raw.texture = defId != null ? EngineData.Art(defId) : null;
        raw.enabled = raw.texture != null;
        raw.raycastTarget = false;
        return face;
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

    /// <summary>
    /// A scene's word (campaign.ts renderStory, .cmp-guide), under you: one line, never a conversation (its first); the
    /// speaker's portrait ringed in their colour, their name small over their words; × puts it away. Guidance, not a
    /// gate: the game goes on round it.
    /// </summary>
    void Story(StoryScene scene)
    {
        const float Z = WebLook.Zoom;
        var line = Shown(scene)[0];
        var sp = line.Speaker;
        var faction = state.Factions.FirstOrDefault(x => x.Id == sp?.Faction);
        string who = sp?.Card != null && CardData.TryGet(sp.Card, out var sd) ? sd.Name : sp?.Kind ?? "";
        var ring = faction != null ? ColourOf(faction.Id) : Hex(NeutralHex);
        var bubble = WebLook.Rounded(top, "Story", new Color(1, 1, 1, 0.92f), 18 * Z);
        bubble.raycastTarget = true;
        // (Padded 10 and 12; the face 34 across, 12 to the words; the button 30 across, 12 before it.)
        float textW = 479 - 2 * 12 * Z - 34 * Z - 30 * Z - 2 * 12 * Z;
        var words = WebLook.Words(Hud.Rect(bubble.transform, "Words"), line.Text, 0.8f * 16 * Z, 0, Look.Ink, false, 400, TextAlignmentOptions.TopLeft);
        words.textWrappingMode = TextWrappingModes.Normal;
        float textH = words.GetPreferredValues(line.Text, textW, 0).y;
        float bodyH = 16 + 2 * Z + textH;
        float h = Mathf.Max(34 * Z, bodyH) + 2 * 10 * Z;
        WebLook.Box(bubble.rectTransform, 17, 87, 479, h);
        WebLook.Shadow(bubble, 8 * Z, 24 * Z, new Color(40 / 255f, 46 / 255f, 70 / 255f, 0.12f), 18 * Z);
        Face(bubble.transform, sp?.Card, 12 * Z + 17 * Z, h / 2, 34 * Z, WebLook.Hex("#1a1f2a"), (2 * Z, ring));
        float left = 12 * Z + 34 * Z + 12 * Z, top0 = (h - bodyH) / 2;
        WebLook.Words(WebLook.Box(bubble.transform, "Who", left, top0, textW, 16), who.ToUpperInvariant(), 0.54f * 16 * Z, 0.14f, Look.InkFaint, true, 400, TextAlignmentOptions.Left);
        WebLook.Box(words.rectTransform, left, top0 + 16 + 2 * Z, textW, textH + 4);
        var next = WebLook.Rounded(bubble.transform, "Next", WebLook.Hex("#f3f2f8"), 999);
        next.raycastTarget = true;
        var nr = next.rectTransform;
        nr.anchorMin = nr.anchorMax = nr.pivot = new Vector2(1, 0.5f);
        nr.anchoredPosition = new Vector2(-12 * Z, 0);
        nr.sizeDelta = new Vector2(30 * Z, 30 * Z);
        WebLook.Words(nr, "×", 1.05f * 16 * Z, 0, Look.Ink, false, 400);
        next.gameObject.AddComponent<Button>().onClick.AddListener(() =>
        {
            Sound.Play("hover");
            storyLine = 0;
            state = Campaign.Apply(state, new CampaignAction { Type = "readStory" });
            Save(state);
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
        // A story scene up (a companion joining, an encounter): the ship and whoever is alongside, in 3D, over the map.
        bool joining = (s.Joined?.Count ?? 0) > 0 && s.CardRewards.Count == 0 && s.Winner == null && s.Boon == null && s.Battle == null && s.Conquest == null && s.Loot == null;
        bool meeting = !joining && s.Encounter != null && s.CardRewards.Count == 0 && s.Winner == null && s.Boon == null && s.Battle == null && s.Conquest == null && s.Loot == null;
        // (A research station's lab is a scene too: the lab come alongside.)
        bool lab = !joining && !meeting && LabUp();
        StoryShip(joining || meeting || lab, meeting ? Encounters.VisitorLook(s.Encounter.Kind).Ship : lab ? "lab" : null);
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

    CampaignBackdrop storyShip;

    /// <summary>The story scene's 3D (base3d.ts): the run's ship, its crew, and (an encounter) whoever comes alongside.</summary>
    void StoryShip(bool on, string visitor)
    {
        if (!on)
        {
            if (storyShip != null) { Mats.Kill(storyShip.gameObject); storyShip = null; }
            if (world != null) world.gameObject.SetActive(true);
            if (top != null) top.gameObject.SetActive(true);
            return;
        }
        if (storyShip == null) storyShip = CampaignBackdrop.Story(Cam, transform, ShipSpec(), Crew());
        // (The map put away under it.)
        world.gameObject.SetActive(false);
        top.gameObject.SetActive(false);
        storyShip.SetVisitor(visitor);
    }

    /// <summary>A scene (the web's scene overlay): who it is, their words a line at a time, and the choices under them.</summary>
    void Scene(string kicker, string title, List<(string who, string text)> lines, System.Action<RectTransform> actions, string portrait = null)
    {
        if (storyShip != null) { ShipScene(kicker, title, lines, actions); return; }
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

    /// <summary>
    /// When the scene showing first showed (its key: what it says), so its talk comes in from then, a redraw carrying
    /// on where it was.
    /// </summary>
    string revealKey;
    float revealAt;
    float RevealFrom(string key)
    {
        if (key != revealKey)
        {
            revealKey = key;
            revealAt = Time.time;
        }
        return revealAt;
    }

    /// <summary>A line of a scene's talk comes in after the one before (styles.css .enc-line: 0.9s, then 1.1s apart); its choices after the last.</summary>
    static float LineDelay(int i) => 0.9f + i * 1.1f;

    /// <summary>
    /// A scene with the ship in it (campaign.ts scene): its kind and title at the top, over the ship; the talk at the
    /// foot, each line its speaker's (the visitor's in italics, set in), the choices under them, coming in one after
    /// another.
    /// </summary>
    void ShipScene(string kicker, string title, List<(string who, string text)> lines, System.Action<RectTransform> actions)
    {
        float from = RevealFrom(kicker + "|" + title + "|" + string.Join("|", lines.Select(l => l.who + ":" + l.text)));
        var v = Hud.Rect(overlay, "Scene");
        Hud.Fill(v);
        v.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0);
        var k = Hud.Label(v, kicker.ToUpperInvariant(), 11, Look.InkSoft, true, 500, 30, TextAlignmentOptions.Top);
        k.margin = new Vector4(0, 18, 0, 0);
        var t = Hud.Label(v, title.ToUpperInvariant(), 22, Look.Ink, true, 400, 26, TextAlignmentOptions.Top);
        t.margin = new Vector4(0, 36, 0, 0);
        var talk = Hud.Rect(v, "Talk");
        Hud.At(talk, new Vector2(0.5f, 0), new Vector2(0, 18), new Vector2(720, 0));
        float y = 0;
        // (From the foot up: the choices, then the lines, the last nearest them.)
        var acts = Hud.Rect(talk, "Actions");
        Hud.At(acts, new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(900, 56));
        actions(acts);
        RiseIn.On(acts, from, LineDelay(lines.Count(l => l.who != "found" && l.who != "damage")));
        y += 66;
        for (int i = lines.Count - 1; i >= 0; i--)
        {
            var (who, text) = lines[i];
            bool them = who == title;
            var w = Hud.Label(talk, $"<size=62%><color=#737780>{who.ToUpperInvariant()}</color></size>\n{(them ? "<i>" : "")}{text}{(them ? "</i>" : "")}", 17, Look.Ink, false, 400, 0, TextAlignmentOptions.BottomLeft);
            w.textWrappingMode = TextWrappingModes.Normal;
            var r = w.rectTransform;
            r.anchorMin = r.anchorMax = new Vector2(0.5f, 0);
            r.pivot = new Vector2(0.5f, 0);
            float h = w.GetPreferredValues(w.text, them ? 676 : 720, 0).y;
            r.sizeDelta = new Vector2(them ? 676 : 720, h);
            r.anchoredPosition = new Vector2(them ? 22 : 0, y);
            // (What came of it, a part found or a slot wrecked, comes in with the first: styles.css .enc-result.)
            RiseIn.On(r, from, who == "found" || who == "damage" ? 0.9f : LineDelay(i));
            y += h + 10;
        }
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

    // ---- Sheets: a question, the settings ----

    void CloseSheet()
    {
        // (A station's screen goes with it: CampaignView.Stations.cs.)
        stationId = null;
        arLooking = null;
        foreach (var c in sheetRoot.Cast<Transform>().ToList()) if (c != null) Mats.Kill(c.gameObject);
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

    /// <summary>
    /// Why something can't be done (styles.css .toast): a slip of frosted glass at the top of the screen, sized to its
    /// words (at most 440 across), the reason in plain soft ink.
    /// </summary>
    void Toast(string text)
    {
        const float Z = WebLook.Zoom;
        if (toastText == null)
        {
            var t = WebLook.Rounded(hud.transform, "Toast", new Color(1, 1, 1, 0.86f), 12 * Z);
            WebLook.Shadow(t, 8 * Z, 22 * Z, new Color(40 / 255f, 46 / 255f, 70 / 255f, 0.12f), 12 * Z, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.08f));
            toastText = WebLook.Words(t.transform, "", 0.74f * 16 * Z, 0, Look.InkSoft, false, 400);
            toastText.textWrappingMode = TextWrappingModes.Normal;
            toastText.margin = new Vector4(16 * Z, 7 * Z, 16 * Z, 7 * Z);
        }
        toastText.text = text;
        var box = (RectTransform)toastText.transform.parent;
        float w = Mathf.Min(440 * Z, toastText.GetPreferredValues(text).x + 32 * Z + 2);
        float h = toastText.GetPreferredValues(text, w - 32 * Z, 0).y + 14 * Z;
        box.anchorMin = box.anchorMax = box.pivot = new Vector2(0.5f, 1);
        box.anchoredPosition = new Vector2(0, -14 * Z);
        box.sizeDelta = new Vector2(w, h);
        box.SetAsLastSibling();
        box.gameObject.SetActive(true);
        toastUntil = Time.time + 3.5f;
        Invoke(nameof(HideToast), 3.6f);
    }

    /// <summary>
    /// A banner over the map (app.ts showBanner, styles.css .turn-banner): its words large and widely spaced in the middle
    /// of the screen on a soft white glow, closing in as they come, a fine line growing under them and a word beneath;
    /// two seconds, and gone.
    /// </summary>
    void Banner(string text, string sub)
    {
        const float Z = WebLook.Zoom;
        var v = Hud.Rect(hud.transform, "Banner");
        Hud.Fill(v);
        var group = v.gameObject.AddComponent<CanvasGroup>();
        group.blocksRaycasts = false;
        group.alpha = 0;
        var glow = WebLook.Centred(v, "Glow", 800, 500, 1600, 260 * Z).gameObject.AddComponent<RawImage>();
        glow.texture = BannerGlow();
        glow.raycastTarget = false;
        var line = WebLook.Centred(v, "Line", 800, 500 + 2.4f * 16 * Z, 420 * Z, 1.5f).gameObject.AddComponent<RawImage>();
        line.texture = BannerLine();
        line.raycastTarget = false;
        bool longer = text.Length > 12;
        float size = (longer ? 2.6f : 3.4f) * 16 * Z;
        var words = WebLook.Words(WebLook.Centred(v, "Words", 800, 500 - 6, 1600, size * 1.4f), text.ToUpperInvariant(), size, longer ? 0.34f : 0.5f, WebLook.Hex("#5b5f67"), true, 400);
        var under = WebLook.Words(WebLook.Centred(v, "Sub", 800, 500 + size * 0.7f + 6 * Z, 1600, 24), sub.ToUpperInvariant(), 0.6f * 16 * Z, 0.4f, Look.InkSoft, true, 500);
        v.gameObject.AddComponent<BannerLife>().Set(group, words, under, line.rectTransform, longer ? 0.34f : 0.5f);
        Sound.Play("turn");
    }

    static Texture2D bannerGlow, bannerLine;

    /// <summary>The banner's glow: an ellipse of near-white, solid to 45% of the way out, gone by 75%.</summary>
    static Texture2D BannerGlow()
    {
        if (bannerGlow != null) return bannerGlow;
        bannerGlow = new Texture2D(128, 64, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        for (int y = 0; y < 64; y++)
            for (int x = 0; x < 128; x++)
            {
                // (radial-gradient(ellipse 72% 60%): its radii 72% of the half width and 60% of the half height.)
                float dx = (x + 0.5f - 64) / 64 / 0.72f, dy = (y + 0.5f - 32) / 32 / 0.6f, d = Mathf.Sqrt(dx * dx + dy * dy);
                float a = d < 0.45f ? Mathf.Lerp(0.99f, 0.92f, d / 0.45f) : d < 0.75f ? Mathf.Lerp(0.92f, 0, (d - 0.45f) / 0.3f) : 0;
                bannerGlow.SetPixel(x, y, new Color(250 / 255f, 250 / 255f, 248 / 255f, a));
            }
        bannerGlow.Apply();
        return bannerGlow;
    }

    /// <summary>The line under the banner's words: grey in the middle, fading out to each end.</summary>
    static Texture2D BannerLine()
    {
        if (bannerLine != null) return bannerLine;
        bannerLine = new Texture2D(64, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var grey = WebLook.Hex("#9ea1a8");
        for (int x = 0; x < 64; x++) bannerLine.SetPixel(x, 0, new Color(grey.r, grey.g, grey.b, 1 - Mathf.Abs(x + 0.5f - 32) / 32));
        bannerLine.Apply();
        return bannerLine;
    }

    /// <summary>
    /// A banner's two seconds (styles.css bannerLife, bannerText, bannerLine): in over the first 12%, held to 75%, out
    /// by the end; its words closing from 0.9em apart; the line growing out from the middle; then gone.
    /// </summary>
    public class BannerLife : MonoBehaviour
    {
        CanvasGroup group;
        TMP_Text words, sub;
        RectTransform line;
        float spacing, t0;

        public void Set(CanvasGroup g, TMP_Text w, TMP_Text s, RectTransform l, float em)
        {
            group = g;
            words = w;
            sub = s;
            line = l;
            spacing = em;
            t0 = Time.time;
            Update();
        }

        void Update()
        {
            float t = Time.time - t0, k = t / 2;
            if (k >= 1) { Mats.Kill(gameObject); return; }
            group.alpha = k < 0.12f ? k / 0.12f : k < 0.75f ? 1 : 1 - (k - 0.75f) / 0.25f;
            // (cubic-bezier(.2, .8, .2, 1): quick in, settling.)
            float e = 1 - Mathf.Pow(1 - k, 3);
            words.characterSpacing = Mathf.Lerp(0.9f, spacing, e) * 100;
            words.alpha = Mathf.Clamp01(k / 0.3f);
            float ks = Mathf.Clamp01((t - 0.1f) / 2);
            sub.characterSpacing = Mathf.Lerp(0.9f, 0.4f, 1 - Mathf.Pow(1 - ks, 3)) * 100;
            sub.alpha = Mathf.Clamp01(ks / 0.3f);
            float kl = Mathf.Clamp01((t - 0.2f) / 1.6f);
            line.localScale = new Vector3(1 - Mathf.Pow(1 - kl, 2), 1, 1);
        }
    }

    void HideToast()
    {
        if (toastText != null && Time.time >= toastUntil) toastText.transform.parent.gameObject.SetActive(false);
    }
}
