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

    /// <summary>The layers' size (the web's page, laid out, in drawn pixels) and its padding clear of the safe area.</summary>
    float PW => overlay.rect.width;
    float PH => overlay.rect.height;
    Vector4 Pad => overlay.GetComponent<RefLayer>().Pad;

    /// <summary>The screen changed size (or its safe area): all that is over the map laid out again, as the web lays its page out again.</summary>
    void Relayout()
    {
        if (state == null) return;
        Refresh();
        if (stationId != null) Station();
        else sheetNow?.Invoke();
    }

    /// <summary>
    /// The map's top bar (campaign.ts renderCampaign, .cmp-top): along the top inside the page's padding (clear of the
    /// safe area), its row as tall as its tallest; you at the left, your purse in the middle (on a narrow screen, after
    /// you), the settings at the right. On a phone turned sideways (max-height 560) the pill and its face are smaller.
    /// </summary>
    void Top()
    {
        const float Z = WebLook.Zoom;
        foreach (Transform c in top) Mats.Kill(c.gameObject);
        var me = Campaign.Player(state);
        var meta = LoadMeta();
        var pad = Pad;
        bool phone = Css.MaxHeight(560), narrow = Css.MaxWidth(960);
        // (.cmp-profile: 44 high, its face 36, padded 4 14 4 4; on a phone 38, 30 and 10. The settings, clamp(36, 8vh, 44).)
        float pillH = (phone ? 38 : 44) * Z, faceD = (phone ? 30 : 36) * Z, padR = (phone ? 10 : 14) * Z, whoMin = (phone ? 80 : 96) * Z;
        float navD = Css.Clamp(36 * Z, 8 * PH / 100, 44 * Z), rowH = Mathf.Max(pillH, navD);
        float x0 = pad.w, y0 = pad.x;
        // (The commander's experience in all: what is banked, and what this run has earned and not yet banked.)
        var level = Meta.LevelFor(meta.Xp + Mathf.Max(0, (state.Xp ?? 0) - (state.XpBanked ?? 0)));
        // You (campaign.ts renderProfile, .cmp-profile): a white pill, your face ringed in white and gold, your name and
        // level, and under them how far into it you are.
        var chip = WebLook.Rounded(top, "You", Look.GlassStrong, pillH / 2);
        chip.raycastTarget = true;
        string name = string.IsNullOrEmpty(Profile.Me.Name) ? "commander" : Profile.Me.Name.ToLowerInvariant();
        float whoX = (1 + 4) * Z + faceD + 8 * Z;
        var who = WebLook.Words(WebLook.Box(chip.transform, "Name", whoX, 0, 120 * Z, 12.4f * Z), name.ToUpperInvariant(), 0.66f * 16 * Z, 0.14f, Look.Ink, true, 500, TextAlignmentOptions.Left);
        float nameW = Mathf.Min(120 * Z, who.GetPreferredValues(who.text).x);
        var lv = WebLook.Words(WebLook.Box(chip.transform, "Level", whoX + nameW + 8 * Z, 0, 80 * Z, 10.4f * Z), $"LEVEL {level.Level}", 0.56f * 16 * Z, 0.14f, WebLook.Hex("#9a7429"), true, 400, TextAlignmentOptions.Left);
        float whoW = Mathf.Max(whoMin, nameW + 8 * Z + lv.GetPreferredValues(lv.text).x);
        float pillW = whoX + whoW + padR + 1 * Z;
        WebLook.Box(chip.rectTransform, x0, y0 + (rowH - pillH) / 2, pillW, pillH);
        WebLook.Shadow(chip, 8 * Z, 30 * Z, new Color(90 / 255f, 90 / 255f, 110 / 255f, 0.13f), pillH / 2);
        // (The name over the bar, 3 between: the two in the pill's middle.)
        // (The name's line 14 high, the level's 11 on its baseline; the level at its column's end (justify-self: end), so
        // a short name leaves it at the right of the min-width.)
        float whoH = 14 * Z + 3 * Z + 4 * Z, whoY = (pillH - whoH) / 2, lvW = lv.GetPreferredValues(lv.text).x + 0.14f * 0.56f * 16 * Z;
        // (Its box placed, not the words filling it: placing those again in the pill's own measures put them twice as far in.)
        WebLook.Box((RectTransform)who.transform.parent, whoX, whoY, 120 * Z, 14 * Z);
        // (Cut short with an ellipsis past 120 across: set once its box is where it stays, as Hud.Ellipsis gives it room.)
        Hud.Ellipsis(who);
        WebLook.Box((RectTransform)lv.transform.parent, whoX + whoW - lvW, whoY + 2 * Z, lvW + 4, 11 * Z);
        Face(chip.transform, me.Hero ?? Campaign.Flagship(state, state.PlayerId)?.General, 5 * Z + faceD / 2, pillH / 2, faceD, new Color32(0x1a, 0x1c, 0x2a, 255), (2 * Z, Color.white), (3 * Z, new Color(201 / 255f, 162 / 255f, 78 / 255f, 0.7f)));
        var bar = WebLook.Rounded(chip.transform, "Bar", new Color(150 / 255f, 156 / 255f, 172 / 255f, 0.25f), 2 * Z);
        WebLook.Box(bar.rectTransform, whoX, whoY + whoH - 4 * Z, whoW, 4 * Z);
        float into = Mathf.Clamp01((float)level.Into / Mathf.Max(1, (float)level.Need));
        if (into > 0)
        {
            var fill = WebLook.Rounded(bar.transform, "Fill", Color.white, 2 * Z);
            WebLook.Box(fill.rectTransform, 0, 0, whoW * into, 4 * Z);
            WebLook.Fade(fill, WebLook.Hex("#d9b45e"), WebLook.Hex("#f1d48a"), true);
        }
        // The story's word, under you (10 below your pill).
        var scene = OverlayUp() ? null : state.Story.Queue.FirstOrDefault();
        if (scene != null && Shown(scene).Count > 0) Story(scene, x0, y0 + (rowH - pillH) / 2 + pillH + 10 * Z);
        // Your purse (.cmp-purse), centred in the bar (on a narrow screen, 8 after you): your sun's heat (it starts the
        // next battle as the last left it), materials, petals; each its token (1.5em; the petal 1.3em) and its count.
        var f = Campaign.Flagship(state, state.PlayerId);
        int heat = f?.Damage ?? 0;
        var purse = Hud.Rect(top, "Purse");
        Hud.Fill(purse);
        float fs = (phone ? 0.66f : 0.78f) * 16 * Z, gap = narrow ? 8 * Z : Css.Clamp(8, 1.6f * PW / Z / 100, 18) * Z;
        var items = new (string icon, float size, string n)[]
        {
            ($"sun-{(heat > 0 ? "hot" : heat < 0 ? "cold" : "warm")}", 1.5f * fs, heat.ToString()),
            ("materials", 1.5f * fs, me.Materials.ToString()),
            ("petal", 1.3f * fs, state.Petals.ToString()),
        };
        var counts = new TextMeshProUGUI[items.Length];
        float total = 0;
        for (int i = 0; i < items.Length; i++)
        {
            // (Orbitron at 600 is drawn at 700 on the web: the nearest heavier weight it has.)
            counts[i] = WebLook.Words(Hud.Fill(Hud.Rect(purse, "Count")), items[i].n, fs, 0, Look.Ink, true, 700, TextAlignmentOptions.Left);
            total += items[i].size + 4 * Z + counts[i].GetPreferredValues(items[i].n).x + (i > 0 ? gap : 0);
        }
        float x = narrow ? x0 + pillW + 8 * Z : (x0 + PW - pad.y) / 2 - total / 2, mid = y0 + rowH / 2;
        for (int i = 0; i < items.Length; i++)
        {
            var (icon, size, n) = items[i];
            var mark = WebLook.Centred(purse, icon, x + size / 2, mid, size, size).gameObject.AddComponent<RawImage>();
            mark.texture = Resources.Load<Texture2D>($"Icons/purse-{icon}");
            mark.raycastTarget = false;
            x += size + 4 * Z;
            float w = counts[i].GetPreferredValues(n).x;
            WebLook.Box((RectTransform)counts[i].transform, x, mid - fs * 0.75f, w + 4, fs * 1.5f);
            x += w + gap;
        }
        // Your emblems (campaign.ts renderRelics, .cmp-relics): a column of badges 40 across, 10 apart, down the right of
        // the screen 16 in from its padding (and 4 more), centred on its height; each softly shadowed, bobbing 2 up and
        // down (cmp-token-float, 5s, every other half a beat behind). (Under the purse: it comes and goes with it.)
        var relics = me.Relics ?? new List<Relic>();
        float rd = 40 * Z, rgap = 10 * Z, colH = relics.Count * rd + Mathf.Max(0, relics.Count - 1) * rgap;
        for (int i = 0; i < relics.Count; i++)
        {
            var badge = WebLook.Box(purse, "Relic", PW - pad.y - 16 * Z - 4 * Z - rd, PH / 2 - colH / 2 + i * (rd + rgap), rd, rd).gameObject.AddComponent<RawImage>();
            badge.texture = RelicArt(relics[i]);
            badge.raycastTarget = false;
            WebLook.Shadow(badge, 3 * Z, 8 * Z, new Color(30 / 255f, 34 / 255f, 50 / 255f, 0.3f), rd / 2);
            var bob = badge.gameObject.AddComponent<Bob>();
            bob.Height = 2 * Z;
            bob.Period = 5;
            bob.Delay = i % 2 == 1 ? -2.5f : 0;
        }
        // Settings (.icon-btn): a white disc, its gear, at the bar's right.
        var gear = WebLook.Rounded(top, "Settings", Look.GlassStrong, 999);
        gear.raycastTarget = true;
        WebLook.Box(gear.rectTransform, PW - pad.y - navD, y0 + (rowH - navD) / 2, navD, navD);
        WebLook.Shadow(gear, 2 * Z, 10 * Z, new Color(90 / 255f, 90 / 255f, 110 / 255f, 0.12f), navD / 2);
        gear.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); Settings(); });
        var raw = WebLook.Centred(gear.transform, "Icon", navD / 2, navD / 2, navD * 50 / 64, navD * 50 / 64).gameObject.AddComponent<RawImage>();
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

    /// <summary>
    /// A scene's word (campaign.ts renderStory, .cmp-guide), under you: one line, never a conversation (its first); the
    /// speaker's portrait ringed in their colour, their name small over their words; × puts it away. Guidance, not a
    /// gate: the game goes on round it.
    /// </summary>
    void Story(StoryScene scene, float x0, float y0)
    {
        const float Z = WebLook.Zoom;
        var line = Shown(scene)[0];
        var sp = line.Speaker;
        var faction = state.Factions.FirstOrDefault(x => x.Id == sp?.Faction);
        // (The speaker's card by name, as cardDef: a built one, the captain's, made from its id.)
        string who = sp?.Kind == "oracle" ? BlueLoop.Engine.Story.OracleName : sp?.Kind ?? "";
        if (sp?.Card != null)
            try { who = Cards.Def(sp.Card).Name; }
            catch (System.Exception) { }
        var ring = faction != null ? ColourOf(faction.Id) : Hex(NeutralHex);
        var bubble = WebLook.Rounded(top, "Story", new Color(1, 1, 1, 0.92f), 18 * Z);
        bubble.raycastTarget = true;
        // (min(330, 100vw - 36) across, padded 10 and 12; the face 34 across, 12 to the words; the button 30 across,
        // 12 before it.)
        float bw = Mathf.Min(330 * Z, PW - 36 * Z);
        float textW = bw - 2 * 12 * Z - 34 * Z - 30 * Z - 2 * 12 * Z;
        var words = WebLook.Words(Hud.Fill(Hud.Rect(bubble.transform, "Words")), line.Text, 0.8f * 16 * Z, 0, Look.Ink, false, 400, TextAlignmentOptions.TopLeft);
        words.textWrappingMode = TextWrappingModes.Normal;
        // (.cmp-guide-text: line-height 1.4; the speaker's name over it 11 high (0.54rem Orbitron), 2 between.)
        words.lineSpacing = (1.4f - 1.26f) * 100 / 1.26f;
        float textH = words.GetPreferredValues(line.Text, textW, 0).y, whoH = 11 * Z;
        float bodyH = whoH + 2 * Z + textH;
        float h = Mathf.Max(34 * Z, bodyH) + 2 * 10 * Z;
        WebLook.Box(bubble.rectTransform, x0, y0, bw, h);
        WebLook.Shadow(bubble, 8 * Z, 24 * Z, new Color(40 / 255f, 46 / 255f, 70 / 255f, 0.12f), 18 * Z);
        Face(bubble.transform, sp?.Card, 12 * Z + 17 * Z, h / 2, 34 * Z, WebLook.Hex("#1a1f2a"), (2 * Z, ring));
        float left = 12 * Z + 34 * Z + 12 * Z, top0 = (h - bodyH) / 2;
        WebLook.Words(WebLook.Box(bubble.transform, "Who", left, top0, textW, whoH), who.ToUpperInvariant(), 0.54f * 16 * Z, 0.14f, Look.InkFaint, true, 400, TextAlignmentOptions.Left);
        WebLook.Box(words.rectTransform, left, top0 + whoH + 2 * Z, textW, textH + 4);
        var next = WebLook.Rounded(bubble.transform, "Next", WebLook.Hex("#f3f2f8"), 999);
        next.raycastTarget = true;
        var nr = next.rectTransform;
        nr.anchorMin = nr.anchorMax = nr.pivot = new Vector2(1, 0.5f);
        nr.anchoredPosition = new Vector2(-12 * Z, 0);
        nr.sizeDelta = new Vector2(30 * Z, 30 * Z);
        WebLook.Words(nr, "×", 1.05f * 16 * Z, 0, Look.Ink, false, 400);
        // (cmp-guide-in: from 6 above and unseen, 0.28s, eased out; a new run's first words wait for the flagship to fly
        // in (cmp-guide-arrive: 0.5s, 2.9s on; through the opening shot 0.9s on). Timed from when this line first showed.)
        string key = $"guide:{scene.Id}:{Shown(scene).Count}:{line.Text}";
        if (key != guideKey)
        {
            guideKey = key;
            guideAt = Time.time;
        }
        bool arrive = scene.Id == "intro" && fresh;
        RiseIn.On(bubble.rectTransform, guideAt, arrive ? (Cining ? 0.9f : 2.9f) : 0, arrive ? 0.5f : 0.28f, -6, true);
        next.gameObject.AddComponent<Button>().onClick.AddListener(() =>
        {
            Sound.Play("hover");
            storyLine = 0;
            state = Campaign.Apply(state, new CampaignAction { Type = "readStory" });
            Save(state);
            Refresh();
        });
    }

    /// <summary>The guide's line showing, and since when (so a redraw carries its coming in on).</summary>
    string guideKey;
    float guideAt;

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
            Modal($"{s.Boon.Source.ToLowerInvariant()} held", body => SetList(body, 0,
                new SetRow("+5 max health", () => Act(new CampaignAction { Type = "takeBoon", Pick = "health" }, "upgrade"), "for good", true),
                new SetRow("cool your sun by 6", () => Act(new CampaignAction { Type = "takeBoon", Pick = "cool" }, "upgrade"), "now", true)));
            return;
        }
        if (s.Battle != null) { OpenBattle(); return; }
        if (s.Conquest != null)
        {
            var n = Campaign.NodeById(s, s.Conquest.NodeId);
            Modal($"{n.Name.ToLowerInvariant()} has fallen", body => SetList(body, 0, new SetRow($"take it · ⬢+{n.Yield.Materials}", () => Act(new CampaignAction { Type = "conquer", Choice = "settle" }, "upgrade"), null, true)), 560 * Z);
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

    const float Z = WebLook.Zoom;

    /// <summary>The page veiled (.overlay): a pale wash over the map (the web blurs it too; soft, a little lighter).</summary>
    RectTransform Veil(Transform parent, bool soft = false)
    {
        var v = Hud.Rect(parent, "Veil");
        Hud.Fill(v);
        // (The wash reaches past the page's frame to the screen's edges, whatever its shape: see Frame.)
        var wash = Hud.Rect(v, "Wash");
        Hud.Fill(wash);
        wash.offsetMin = new Vector2(-4000, -4000);
        wash.offsetMax = new Vector2(4000, 4000);
        var i = wash.gameObject.AddComponent<Image>();
        // (No blur here: more of the wash in its place, as much as the web's wash and blur together leave of the map's
        // lines (measured: about a fifth of them showing through).)
        i.color = soft ? new Color(244 / 255f, 244 / 255f, 242 / 255f, 0.82f) : new Color(240 / 255f, 240 / 255f, 238 / 255f, 0.85f);
        return v;
    }

    /// <summary>
    /// A modal (the web's .modal, campaign.ts modal): a white card 620 (CSS) across (never more than 94vw, nor wider
    /// than the page inside its padding), rounded 18, softly shadowed, its title in spaced capitals with a hairline under
    /// it, its body under that (laid out from its top by `body`, which says how tall it is); the card as tall as they
    /// are, at most 94vh (its body scrolling past that), in the middle of the page inside its padding (clear of the
    /// safe area). Closable: × at the title's right.
    /// </summary>
    RectTransform Modal(string title, System.Func<RectTransform, float> body, float width = 620 * Z, Transform parent = null, System.Action close = null)
    {
        var v = Veil(parent ?? overlay, close != null);
        if (close != null) v.gameObject.AddComponent<Button>().onClick.AddListener(() => close());
        var pad = Pad;
        width = Mathf.Min(width, 0.94f * PW, PW - pad.y - pad.w);
        var card = WebLook.Rounded(v, "Card", Color.white, 18 * Z);
        card.raycastTarget = true;
        card.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        var cr = card.rectTransform;
        // (.bar-title: 14 above its words and 10 below; a 44 wide hairline at its foot.)
        float barH = 14 * Z + 0.7f * 16 * Z * 1.25f + 10 * Z;
        var t = WebLook.Words(WebLook.Box(cr, "Title", 0, 14 * Z, width, 0.7f * 16 * Z * 1.25f), title.ToUpperInvariant(), 0.7f * 16 * Z, 0.28f, Look.Ink, true, 500);
        // (Padded 44 either side; CSS letter-spacing trails the last letter too, so the words sit that much left.)
        t.margin = new Vector4(44 * Z, 0, 44 * Z + 0.28f * 0.7f * 16 * Z, 0);
        var rule = WebLook.Box(cr, "Rule", width / 2 - 22 * Z, barH - 1, 44 * Z, 1.4f).gameObject.AddComponent<RawImage>();
        rule.texture = Hairline();
        rule.color = new Color(120 / 255f, 124 / 255f, 134 / 255f, 0.45f);
        rule.raycastTarget = false;
        if (close != null)
        {
            var x = WebLook.Rounded(cr, "Close", new Color(1, 1, 1, 0), 999);
            x.raycastTarget = true;
            WebLook.Box(x.rectTransform, width - 12 * Z - 28 * Z, barH / 2 - 14 * Z, 28 * Z, 28 * Z);
            WebLook.Words(x.transform, "×", 1 * 16 * Z, 0, Look.InkSoft, false, 400);
            x.gameObject.AddComponent<Button>().onClick.AddListener(() => close());
        }
        // (.modal-body: clamp(10, 3vh, 22) above and below, clamp(14, 3vw, 28) either side.)
        float padY = Css.Clamp(10 * Z, 3 * Vh, 22 * Z), padX = Css.Clamp(14 * Z, 3 * Vw, 28 * Z);
        var b = WebLook.Box(cr, "Body", padX, barH + padY, width - 2 * padX, 10);
        float h = body(b);
        b.sizeDelta = new Vector2(width - 2 * padX, h);
        float total = barH + padY + h + padY, most = Mathf.Min(94 * Vh, PH - pad.x - pad.z);
        if (total > most)
        {
            // (Taller than the page allows: its body scrolls under its title.)
            var view = WebLook.Box(cr, "Scroll", 0, barH, width, most - barH);
            var content = StationKit.Scroller(view, padY + h + padY);
            b.SetParent(content, false);
            WebLook.Box(b, padX, padY, width - 2 * padX, h);
            total = most;
        }
        cr.anchorMin = cr.anchorMax = cr.pivot = new Vector2(0.5f, 0.5f);
        cr.anchoredPosition = new Vector2((pad.w - pad.y) / 2, (pad.z - pad.x) / 2);
        cr.sizeDelta = new Vector2(width, total);
        WebLook.Shadow(card, 30 * Z, 80 * Z, new Color(80 / 255f, 80 / 255f, 100 / 255f, 0.18f), 18 * Z, Z, new Color(120 / 255f, 124 / 255f, 134 / 255f, 0.08f));
        return v;
    }

    /// <summary>The web's --vh and --vw (a hundredth of the page as laid out), and its raw vh and vw (of the screen), in drawn pixels.</summary>
    float Vh => PH / 100;
    float Vw => PW / 100;
    static float RawVh => Css.Screen.y / 100 * Z;
    static float RawVw => Css.Screen.x / 100 * Z;

    /// <summary>Where a column of things `total` tall starts, in the middle of the page inside its padding (never above it).</summary>
    float Middle(float total)
    {
        var pad = Pad;
        return pad.x + Mathf.Max(0, (PH - pad.x - pad.z - total) / 2);
    }

    static Texture2D hairline;

    /// <summary>A hairline fading in from each end (the bar title's rule), white to tint.</summary>
    static Texture2D Hairline()
    {
        if (hairline != null) return hairline;
        hairline = new Texture2D(32, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        for (int x = 0; x < 32; x++) hairline.SetPixel(x, 0, new Color(1, 1, 1, 1 - Mathf.Abs(x + 0.5f - 16) / 16));
        hairline.Apply();
        return hairline;
    }

    /// <summary>A setting's row: its name (and a note under it), and either its value in a pill or a chevron.</summary>
    struct SetRow
    {
        public string Label, Note, Value;
        public bool Go;
        public System.Action Act;
        public SetRow(string label, System.Action act, string note = null, bool go = false, string value = null)
        {
            Label = label;
            Act = act;
            Note = note;
            Go = go;
            Value = value;
        }
    }

    /// <summary>
    /// Rows of choices as the settings' (settings.ts settingsPanel, .set-list): one column 380 (CSS) across in the middle,
    /// a panel of white glass, each row its words in spaced capitals (the choice the modal is for a little bolder, its
    /// chevron blue), a note under them, a hairline between rows; a row held back faded. Its height.
    /// </summary>
    float SetList(RectTransform body, float y, params SetRow[] rows)
    {
        // (.set-row: at least clamp(36, 7vh, 46) high.)
        float w = Mathf.Min(380 * Z, body.sizeDelta.x), x = (body.sizeDelta.x - w) / 2, rowH = Css.Clamp(36 * Z, 7 * Vh, 46 * Z), pad = 4 * Z, gap = 2 * Z;
        float h = 2 * pad + rows.Length * rowH + (rows.Length - 1) * gap;
        var list = WebLook.Rounded(body, "List", new Color(1, 1, 1, 0.72f), 16 * Z);
        WebLook.Box(list.rectTransform, x, y, w, h);
        WebLook.Shadow(list, 6 * Z, 18 * Z, new Color(40 / 255f, 46 / 255f, 70 / 255f, 0.06f), 16 * Z, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.08f));
        for (int i = 0; i < rows.Length; i++)
        {
            var row = rows[i];
            var r = WebLook.Rounded(list.transform, row.Label, new Color(1, 1, 1, 0), 12 * Z);
            r.raycastTarget = true;
            WebLook.Box(r.rectTransform, pad, pad + i * (rowH + gap), w - 2 * pad, rowH);
            if (i > 0)
            {
                var line = WebLook.Box(r.transform, "Line", 0, -1, w - 2 * pad, 1).gameObject.AddComponent<Image>();
                line.color = new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.06f);
                line.raycastTarget = false;
            }
            var b = r.gameObject.AddComponent<Button>();
            var colors = b.colors;
            colors.normalColor = new Color(1, 1, 1, 0);
            colors.highlightedColor = new Color(95 / 255f, 143 / 255f, 196 / 255f, 0.08f);
            colors.pressedColor = new Color(95 / 255f, 143 / 255f, 196 / 255f, 0.14f);
            colors.selectedColor = colors.normalColor;
            colors.disabledColor = new Color(1, 1, 1, 0);
            b.colors = colors;
            r.color = Color.white;
            var act = row.Act;
            if (act != null) b.onClick.AddListener(() => { Sound.Play("click"); act(); });
            else
            {
                b.interactable = false;
                r.gameObject.AddComponent<CanvasGroup>().alpha = 0.45f;
            }
            float fs = 0.66f * 16 * Z;
            var label = WebLook.Words(r.transform, row.Label.ToUpperInvariant(), fs, 0.22f, Look.Ink, true, row.Go ? 700 : 500, TextAlignmentOptions.Left);
            if (row.Note != null)
            {
                float lh = fs * 1.25f, nh = fs * 1.2f, top = (rowH - lh - 3 * Z - nh) / 2;
                WebLook.Box(label.rectTransform, 16 * Z, top, w - 80 * Z, lh);
                WebLook.Words(WebLook.Box(r.transform, "Note", 16 * Z, top + lh + 3 * Z, w - 80 * Z, nh), row.Note, fs, 0.02f, Look.InkFaint, false, row.Go ? 600 : 400, TextAlignmentOptions.Left);
            }
            else label.margin = new Vector4(16 * Z, 0, 60 * Z, 0);
            if (row.Label.Contains("⬢"))
            {
                // (Materials in its words: their mark, as the web's choiceRow carries it.)
                label.text = row.Label.ToUpperInvariant().Replace("⬢", InlineMark("materials"));
                RuleMarks(label, label.text, fs);
            }
            if (row.Value != null)
            {
                // (.opt-value: a grey pill, its value in spaced capitals.)
                var pill = WebLook.Rounded(r.transform, "Value", WebLook.Hex("#f0f2f6"), 999);
                var vt = WebLook.Words(pill.transform, row.Value.ToUpperInvariant(), 0.6f * 16 * Z, 0.16f, Look.InkSoft, true, 500);
                float pw = Mathf.Max(44 * Z, vt.GetPreferredValues(vt.text).x + 20 * Z), ph = 0.6f * 16 * Z * 1.25f + 8 * Z;
                pill.sprite = Hud.Rounded;
                pill.type = Image.Type.Sliced;
                pill.pixelsPerUnitMultiplier = 22f / (ph / 2);
                var pr = pill.rectTransform;
                pr.anchorMin = pr.anchorMax = pr.pivot = new Vector2(1, 0.5f);
                pr.anchoredPosition = new Vector2(-12 * Z, 0);
                pr.sizeDelta = new Vector2(pw, ph);
            }
            else
            {
                var chev = WebLook.Words(r.transform, "›", 1.1f * 16 * Z, 0, row.Go ? WebLook.Hex("#5f8fc4") : Look.InkFaint, false, 400, TextAlignmentOptions.Right);
                chev.margin = new Vector4(0, 0, 12 * Z, 4);
            }
        }
        return h;
    }

    /// <summary>A card to pick (.cmp-pick): its face at a width (its height 1.4 times); picked, ringed violet and glowing.</summary>
    static Button CardPick(Transform parent, string id, Vector2 at, float w, bool on, System.Action act, Vector2? anchor = null)
    {
        var r = Hud.Rect(parent, id);
        Hud.At(r, anchor ?? new Vector2(0.5f, 0.5f), at, new Vector2(w, w * 1.4f));
        if (on)
        {
            var glow = WebLook.Rounded(r, "Glow", new Color(138 / 255f, 111 / 255f, 224 / 255f, 0.45f), 8.56f + 18 * Z);
            glow.sprite = Hud.Soft;
            glow.pixelsPerUnitMultiplier = 41f / (18 * Z + 8.56f);
            Hud.Fill(glow.rectTransform);
            glow.rectTransform.offsetMin = -Vector2.one * 18 * Z;
            glow.rectTransform.offsetMax = Vector2.one * 18 * Z;
            var ring = WebLook.Rounded(r, "Ring", WebLook.Hex("#8a6fe0"), 8.56f + 2.5f * Z);
            Hud.Fill(ring.rectTransform);
            ring.rectTransform.offsetMin = -Vector2.one * 2.5f * Z;
            ring.rectTransform.offsetMax = Vector2.one * 2.5f * Z;
        }
        var face = Hud.Rect(r, "Face");
        Hud.Fill(face);
        var raw = face.gameObject.AddComponent<RawImage>();
        raw.texture = Faces.Of(id, Faces.Look.Card, w / Z);
        StationKit.Printed(face, id, w, true);
        var b = r.gameObject.AddComponent<Button>();
        b.targetGraphic = raw;
        if (act != null) b.onClick.AddListener(() => act());
        return b;
    }

    /// <summary>A web button (.btn or .btn-primary) as wide as its words, centred at a point of its parent (from its top left).</summary>
    static Button WebButton(Transform parent, string label, System.Action act, bool primary, float cx, float y, bool enabled = true)
    {
        float fs = 0.66f * 16 * Z;
        var b = WebLook.Button(parent, label, act, primary, fs, primary ? 0.14f : 0.14f);
        var t = b.GetComponentInChildren<TextMeshProUGUI>();
        float w = Mathf.Max(primary ? 140 * Z : 0, t.GetPreferredValues(t.text).x + 2 * 16 * Z), h = fs * 1.25f + 2 * 9 * Z;
        WebLook.Box((RectTransform)b.transform, cx - w / 2, y, w, h);
        b.interactable = enabled;
        if (!enabled) b.gameObject.AddComponent<CanvasGroup>().alpha = 0.4f;
        return b;
    }

    // ---- The run over ----

    /// <summary>
    /// The run over (.run-over): no box, on the veil, a column in the middle of the page 14 apart: YOU ARE DEAD large and
    /// widely spaced (clamp(1.6rem, 6vh, 2.6rem)), a line in italics, the petals it banked; one card from the run to keep
    /// for the next, picked from rows of them (wrapping within min(92vw, 900), scrolling past 42vh); exit.
    /// </summary>
    void RunOver()
    {
        var v = Veil(overlay, true);
        float t0 = RevealFrom("over");
        var keepable = Campaign.KeepableCards(state);
        if (keepPick != null && !keepable.Contains(keepPick)) keepPick = null;
        float h2s = Css.Clamp(1.6f * 16 * Z, 6 * RawVh, 2.6f * 16 * Z), ps = Css.Clamp(0.85f * 16 * Z, 3 * RawVh, 1.05f * 16 * Z);
        float gap = 14 * Z, h2 = h2s * 1.26f, p = ps * 1.2f, pet = 20 * Z, exitH = 0.66f * 16 * Z * 1.25f + 2 * 9 * Z;
        // (.run-keep-cards: 88 across, 8 apart, padded 6; as many to a row as min(92vw, 900) allows.)
        float cw = 88 * Z, cg = 8 * Z, smallH = 0.7f * 16 * Z * 1.25f;
        float keepW = Mathf.Min(92 * RawVw, 900 * Z, PW);
        int n = keepable.Count, cols = Mathf.Max(1, Mathf.Min(n, Mathf.FloorToInt((keepW - 12 * Z + cg) / (cw + cg))));
        int rowsN = n > 0 ? (n + cols - 1) / cols : 0;
        float cardsH = rowsN > 0 ? 12 * Z + rowsN * cw * 1.4f + (rowsN - 1) * cg : 0, areaH = Mathf.Min(cardsH, 42 * RawVh);
        float keepH = n > 0 ? smallH + 8 * Z + areaH : 0;
        float total = h2 + gap + p + gap + pet + (n > 0 ? gap + keepH : 0) + gap + 10 * Z + exitH;
        float y = Middle(total), mid = PW / 2;
        var title = WebLook.Words(WebLook.Box(v, "Title", 0, y, PW, h2), "YOU ARE DEAD", h2s, 0.32f, Look.Ink, true, 400);
        title.margin = new Vector4(0, 0, 0.32f * h2s, 0);
        RiseIn.On(title.rectTransform, t0, 0, 1.4f);
        y += h2 + gap;
        var said = WebLook.Words(WebLook.Box(v, "Said", 0, y, PW, p), "The others will follow, soon enough…", ps, 0, Look.InkSoft, false, 400);
        said.fontStyle = FontStyles.Italic;
        RiseIn.On(said.rectTransform, t0, 0.6f, 1.4f);
        y += p + gap;
        // (+ its petals, the petal after: 1.1rem, the petal 20 across, 6 between.)
        var petals = WebLook.Words(Hud.Fill(Hud.Rect(v, "Petals")), $"+ {state.Petals}", 1.1f * 16 * Z, 0.08f, Look.Ink, true, 400, TextAlignmentOptions.Left);
        float pw = petals.GetPreferredValues(petals.text).x, rowW = pw + 6 * Z + pet;
        var pr = WebLook.Box(Hud.Rect(v, "Banked"), mid - rowW / 2, y, rowW, pet);
        petals.transform.SetParent(pr, false);
        WebLook.Box(petals.rectTransform, 0, 0, pw + 4, pet);
        var mark = WebLook.Centred(pr, "Petal", pw + 6 * Z + pet / 2, pet / 2, pet, pet).gameObject.AddComponent<RawImage>();
        mark.texture = Resources.Load<Texture2D>("Icons/purse-petal");
        mark.raycastTarget = false;
        RiseIn.On(pr, t0, 1.3f, 1);
        y += pet;
        if (n > 0)
        {
            y += gap;
            var keep = WebLook.Box(v, "Keep", 0, y, PW, keepH);
            WebLook.Words(WebLook.Box(keep, "Words", 0, 0, PW, smallH), "KEEP ONE CARD FOR YOUR NEXT RUN", 0.7f * 16 * Z, 0.18f, Look.InkSoft, true, 400);
            float rw = cols * cw + (cols - 1) * cg;
            var area = WebLook.Box(keep, "Cards", mid - rw / 2 - 6 * Z, smallH + 8 * Z, rw + 12 * Z, areaH);
            var cards = cardsH > areaH + 0.5f ? StationKit.Scroller(area, cardsH) : area;
            for (int i = 0; i < n; i++)
            {
                var id = keepable[i];
                int row = i / cols, inRow = Mathf.Min(cols, n - row * cols);
                float x0 = 6 * Z + (rw - (inRow * cw + (inRow - 1) * cg)) / 2;
                CardPick(cards, id, new Vector2(x0 + (i % cols) * (cw + cg), -(6 * Z + row * (cw * 1.4f + cg))), cw, keepPick == id, () => { Sound.Play("hover"); keepPick = keepPick == id ? null : id; Refresh(); }, new Vector2(0, 1));
            }
            RiseIn.On(keep, t0, 1.6f, 1);
            y += keepH;
        }
        y += gap + 10 * Z;
        var exit = WebButton(v, keepPick != null ? $"keep {Cards.Def(keepPick).Name.ToLowerInvariant()} · exit" : "exit", NewRunFromHere, true, mid, y);
        RiseIn.On((RectTransform)exit.transform, t0, 1.8f, 0.8f);
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

    /// <summary>
    /// What the last battle brought (campaign.ts renderOverlay's loot): a sealed cache floating on a white halo, FOUND or
    /// VICTORY · TAP TO OPEN under it; tapped, it bursts open: the experience first, its bar filling, then every reward
    /// the same size (a card's) on a living white glow, tilted like treasure spilled out, a row bowed, one at a time;
    /// then TAKE IT.
    /// </summary>
    void Loot()
    {
        var l = state.Loot;
        var v = Veil(overlay, true);
        float mid = PW / 2;
        if (!lootOpen)
        {
            // (Its art min(220, 38vh) across, its halo min(300, 52vh) round it; the words 10 under it; the whole in the
            // middle of the page.)
            float art = Mathf.Min(220 * Z, 38 * RawVh), halo = Mathf.Min(300 * Z, 52 * RawVh), tapH = 0.72f * 16 * Z * 1.25f;
            float y0 = Middle(art + 10 * Z + tapH);
            var cache = WebLook.Box(v, "Cache", mid - art / 2, y0, art, art + 10 * Z + tapH);
            var ring = WebLook.Centred(cache, "Halo", art / 2, Mathf.Min(110 * Z, 19 * RawVh), halo, halo).gameObject.AddComponent<RawImage>();
            ring.texture = CacheHalo();
            ring.raycastTarget = false;
            var pic = WebLook.Box(cache, "Art", 0, 0, art, art).gameObject.AddComponent<RawImage>();
            pic.texture = Resources.Load<Texture2D>("Icons/loot-cache");
            var tap = WebLook.Words(WebLook.Box(cache, "Tap", art / 2 - 260 * Z, art + 10 * Z, 520 * Z, tapH), $"{(l.Found != null ? "FOUND" : l.Won ? "VICTORY" : "WHAT WAS SAVED")} · TAP TO OPEN", 0.72f * 16 * Z, 0.24f, Look.InkSoft, true, 400);
            tap.raycastTarget = false;
            cache.gameObject.AddComponent<Float>();
            pic.gameObject.AddComponent<Button>().onClick.AddListener(() =>
            {
                lootOpen = true;
                Sound.Play("cache-open");
                int n = new[] { l.Materials, l.Xp, l.Petals }.Count(x => x > 0) + (l.Relics?.Count ?? 0) + (l.Cards?.Count ?? 0) + (l.Parts?.Count ?? 0);
                for (int i = 0; i < n; i++) Sound.Play($"loot-{Mathf.Min(i, 5)}", 0.5f + i * 0.35f);
                Refresh();
            });
            return;
        }
        float t0 = RevealFrom("loot open");
        // (Burst open: a white flash swelling from the middle of the screen, rays turning out through it.)
        Burst.On(v, t0);
        // (Each reward a tile, and how many tiles across it is: an emblem's 1.5 (.loot-emblem), the rest 1.)
        var tiles = new List<System.Action<RectTransform, float>>();
        var wide = new List<float>();
        if (l.Materials > 0) { tiles.Add((r, w) => LootToken(r, "loot-materials", $"+{l.Materials}", w)); wide.Add(1); }
        if (l.Petals > 0) { tiles.Add((r, w) => LootToken(r, "loot-petal", $"+{l.Petals}", w)); wide.Add(1); }
        foreach (var rel in l.Relics ?? new List<Relic>()) { tiles.Add((r, w) => RelicTile(r, rel, w)); wide.Add(1.5f); }
        foreach (var id in l.Cards ?? new List<string>()) { tiles.Add((r, w) => { LootGlow(r, w, w * 1.4f, w * 1.2f); CardPick(r, id, Vector2.zero, w, false, null); }); wide.Add(1); }
        foreach (var id in l.Parts ?? new List<string>()) { tiles.Add((r, w) => LootPart(r, id, w)); wide.Add(1); }
        int count = tiles.Count, split = count > 3 ? (count + 1) / 2 : count;
        int rows = count > split ? 2 : 1, cols = split;
        // (.loot-items: --gap clamp(14, 3vw, 34); each tile min(112, what fits the columns across 92vw, what fits the rows
        // in 100vh less 190) across and 1.4 times as tall; padded 20 18, on a phone 10 14.)
        float gap = Css.Clamp(14 * Z, 3 * RawVw, 34 * Z);
        float lw = Mathf.Min(112 * Z, (92 * RawVw - (cols - 1) * gap) / cols, (100 * RawVh - 190 * Z - (rows - 1) * gap) / rows / 1.45f);
        float lh = lw * 1.4f, padY = (Css.MaxHeight(560) ? 10 : 20) * Z;
        float xpH = l.Xp > 0 ? 1.15f * 16 * Z * 1.26f + 4 * Z + 4 * Z : 0, itemsH = 2 * padY + rows * lh + (rows - 1) * gap, takeH = 0.66f * 16 * Z * 1.25f + 2 * 9 * Z;
        float total = xpH + itemsH + 4 * Z + 6 * Z + takeH, y = Middle(total);
        if (l.Xp > 0)
        {
            XpGauge(v, y, l.Xp, t0);
            y += xpH;
        }
        y += padY;
        int first = l.Xp > 0 ? 1 : 0;
        for (int i = 0; i < count; i++)
        {
            int row = i < split ? 0 : 1, j = row == 0 ? i : i - split, n = row == 0 ? split : count - split, from = row == 0 ? 0 : split;
            float at = j - (n - 1) / 2f;
            // (Its row's tiles side by side, gap apart, the row centred: each as wide as it is.)
            float rowW = 0, before = 0;
            for (int k = from; k < from + n; k++) rowW += wide[k] * lw + (k > from ? gap : 0);
            for (int k = from; k < i; k++) before += wide[k] * lw + gap;
            float cx = mid - rowW / 2 + before + wide[i] * lw / 2 + (row == 1 ? lw * 0.3f : 0);
            float cy = y + row * (lh + gap) + lh / 2 + at * at * 7 * Z;
            var slot = WebLook.Centred(v, "Reward", cx, cy, wide[i] * lw, lh);
            slot.localRotation = Quaternion.Euler(0, 0, -((i % 2 == 1 ? 1 : -1) * (2 + i % 3)));
            tiles[i](slot, lw);
            LootIn.On(slot, t0, 0.45f + (i + first) * 0.42f);
        }
        y += itemsH - padY + 4 * Z + 6 * Z;
        var ok = WebButton(v, "take it", () => { lootOpen = false; Act(new CampaignAction { Type = "dismissLoot" }, "buy"); }, true, mid, y);
        LootIn.On((RectTransform)ok.transform, t0, 0.45f + (count + first) * 0.42f + 0.2f, true);
    }

    /// <summary>The experience a loot brought (campaign.ts xpGauge): LEVEL and the level, its bar filling in gold, +XP.</summary>
    void XpGauge(RectTransform v, float y, int gained, float t0)
    {
        var meta = LoadMeta();
        var now = Meta.LevelFor(meta.Xp + Mathf.Max(0, (state.Xp ?? 0) - (state.XpBanked ?? 0)));
        var g = WebLook.Box(v, "Experience", 0, y, PW, 33);
        var lv = WebLook.Words(Hud.Fill(Hud.Rect(g, "Level")), "LEVEL", 0.7f * 16 * Z, 0.12f, Look.InkSoft, true, 400, TextAlignmentOptions.Left);
        var n = WebLook.Words(Hud.Fill(Hud.Rect(g, "N")), now.Level.ToString(), 1.15f * 16 * Z, 0.12f, Look.Ink, true, 700, TextAlignmentOptions.Left);
        var gain = WebLook.Words(Hud.Fill(Hud.Rect(g, "Gain")), $"+{gained} XP", 0.8f * 16 * Z, 0.12f, WebLook.Hex("#9a7429"), true, 400, TextAlignmentOptions.Left);
        float lw = lv.GetPreferredValues(lv.text).x, nw = n.GetPreferredValues(n.text).x, gw = gain.GetPreferredValues(gain.text).x, bar = 260 * Z, gap = 12 * Z;
        float w = lw + 4 * Z + nw + gap + bar + gap + gw, x = PW / 2 - w / 2;
        WebLook.Box(lv.rectTransform, x, 0, lw + 4, 33);
        WebLook.Box(n.rectTransform, x + lw + 4 * Z, 0, nw + 4, 33);
        var track = WebLook.Rounded(g, "Bar", new Color(150 / 255f, 156 / 255f, 172 / 255f, 0.22f), 5 * Z);
        WebLook.Box(track.rectTransform, x + lw + 4 * Z + nw + gap, (33 - 10 * Z) / 2, bar, 10 * Z);
        float into = Mathf.Clamp01((float)now.Into / Mathf.Max(1, (float)now.Need));
        if (into > 0)
        {
            var fill = WebLook.Rounded(track.transform, "Fill", Color.white, 5 * Z);
            WebLook.Box(fill.rectTransform, 0, 0, bar * into, 10 * Z);
            WebLook.Fade(fill, WebLook.Hex("#d9b45e"), WebLook.Hex("#f6dc94"), true);
        }
        WebLook.Box(gain.rectTransform, x + w - gw, 0, gw + 4, 33);
        LootIn.On(g, t0, 0.45f);
    }

    /// <summary>Materials or petals: their token on its glow and rays (baked from the page), the number under it.</summary>
    static void LootToken(RectTransform r, string icon, string big, float lw)
    {
        // (Its token 0.58 of the tile across, 6 above its number, the two in the tile's middle.)
        float token = lw * 0.58f, numH = 0.95f * 16 * Z * 1.25f, top = (lw * 1.4f - token - 6 * Z - numH) / 2;
        var art = WebLook.Centred(r, "Token", lw / 2, top + token / 2, token * 2.3f, token * 2.3f).gameObject.AddComponent<RawImage>();
        art.texture = Resources.Load<Texture2D>("Icons/" + icon);
        art.raycastTarget = false;
        WebLook.Words(WebLook.Box(r, "Count", 0, top + token + 6 * Z, lw, numH), big, 0.95f * 16 * Z, 0.08f, Look.Ink, true, 700);
    }

    /// <summary>The living white glow behind a reward (its ::before and rays), centred on it at a size.</summary>
    static void LootGlow(RectTransform r, float w, float h, float size)
    {
        var glow = WebLook.Centred(r, "Glow", w / 2, h / 2, size * 2.3f, size * 2.3f).gameObject.AddComponent<RawImage>();
        glow.texture = Resources.Load<Texture2D>("Icons/loot-glow");
        glow.raycastTarget = false;
    }

    /// <summary>A ship part found: its turning 3D view on the glow, its name under it.</summary>
    static void LootPart(RectTransform r, string id, float lw)
    {
        var p = Parts.ShipPart(id);
        float s = lw * 128 / 112;
        var glow = WebLook.Centred(r, "Glow", lw / 2, s / 2, s * 2.3f, s * 2.3f).gameObject.AddComponent<RawImage>();
        glow.texture = Resources.Load<Texture2D>("Icons/loot-glow");
        glow.raycastTarget = false;
        var art = WebLook.Centred(r, "Part", lw / 2, s / 2, s * 0.7f, s * 0.7f).gameObject.AddComponent<RawImage>();
        art.texture = p != null ? Resources.Load<Texture2D>($"Icons/part-{p.Kind}-{p.Rarity}") : null;
        art.raycastTarget = false;
        WebLook.Words(WebLook.Box(r, "Name", -lw * 0.25f, s + 6 * Z, lw * 1.5f, 33), p?.Name.ToLowerInvariant() ?? id, 1 * 16 * Z, 0, Look.Ink, false, 600);
    }

    static Texture2D cacheHalo;

    /// <summary>The cache's halo: white at its heart, a pale blue at half way, gone at its edge.</summary>
    static Texture2D CacheHalo()
    {
        if (cacheHalo != null) return cacheHalo;
        const int S = 128;
        cacheHalo = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float d = new Vector2(x + 0.5f - S / 2f, y + 0.5f - S / 2f).magnitude / (S / 2f);
                Color c = d < 0.5f ? Color.Lerp(Color.white, new Color(232 / 255f, 240 / 255f, 252 / 255f, 0.7f), d / 0.5f) : Color.Lerp(new Color(232 / 255f, 240 / 255f, 252 / 255f, 0.7f), new Color(214 / 255f, 226 / 255f, 246 / 255f, 0), Mathf.Clamp01((d - 0.5f) / 0.5f));
                cacheHalo.SetPixel(x, y, c);
            }
        cacheHalo.Apply();
        return cacheHalo;
    }

    /// <summary>
    /// A reward coming out of the cache (styles.css loot-in): from 18 lower, at 0.6 its size and unseen, springing to its
    /// place over 0.55s on cubic-bezier(.2, 1.4, .4, 1), `delay` after `start`; the take button (`plain`) over 0.4s, eased out.
    /// </summary>
    public class LootIn : MonoBehaviour
    {
        float from, delay;
        bool plain;
        Vector2 rest;
        CanvasGroup group;

        public static void On(RectTransform r, float start, float delay, bool plain = false)
        {
            var x = r.gameObject.AddComponent<LootIn>();
            x.from = start;
            x.delay = delay;
            x.plain = plain;
            x.rest = r.anchoredPosition;
            x.group = r.GetComponent<CanvasGroup>();
            if (x.group == null) x.group = r.gameObject.AddComponent<CanvasGroup>();
            x.Apply();
        }

        void Update() => Apply();

        void Apply()
        {
            float k = Application.isPlaying ? Mathf.Clamp01((Time.time - from - delay) / (plain ? 0.4f : 0.55f)) : 1;
            float e = plain ? Bezier(0, 0, 0.58f, 1, k) : Bezier(0.2f, 1.4f, 0.4f, 1, k);
            group.alpha = Mathf.Clamp01(e);
            var r = (RectTransform)transform;
            r.anchoredPosition = rest - new Vector2(0, 18 * Z * (1 - e));
            r.localScale = Vector3.one * Mathf.LerpUnclamped(0.6f, 1, e);
            if (k >= 1) enabled = false;
        }
    }

    /// <summary>A CSS cubic-bezier timing function at `x` (its y free to overshoot).</summary>
    static float Bezier(float x1, float y1, float x2, float y2, float x)
    {
        float t = x;
        for (int i = 0; i < 10; i++)
        {
            float u = 1 - t;
            float bx = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t - x;
            float dx = 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2);
            if (Mathf.Abs(dx) < 1e-5f) break;
            t = Mathf.Clamp01(t - bx / dx);
        }
        float v = 1 - t;
        return 3 * v * v * t * y1 + 3 * v * t * t * y2 + t * t * t;
    }

    /// <summary>
    /// The cache bursting open (styles.css .loot-burst): a white point in the middle of the screen (10 across, its
    /// gradient white to a pale blue, glowing 0 0 60 30) swelling from 0.2 to 60 times its size over 0.9s on
    /// cubic-bezier(.2, .8, .2, 1), whole for 60% of it, then gone; through it (::before, 9 times its size) rays every
    /// 18deg turning 40deg as they grow from 0.3 to 1.4 and fade, eased out.
    /// </summary>
    public class Burst : MonoBehaviour
    {
        float from;
        RectTransform flash, rays;
        RawImage flashImg, raysImg;
        static Texture2D flashTex, raysTex;

        public static void On(RectTransform veil, float start)
        {
            if (!Application.isPlaying || Time.time - start > 0.9f) return;
            var b = veil.gameObject.AddComponent<Burst>();
            b.from = start;
            b.flash = Hud.Rect(veil, "Burst");
            b.flash.anchorMin = b.flash.anchorMax = b.flash.pivot = new Vector2(0.5f, 0.5f);
            // (The point and its glow: 10 and 2 x (30 + 60) about it.)
            b.flash.sizeDelta = Vector2.one * 190 * Z;
            b.flashImg = b.flash.gameObject.AddComponent<RawImage>();
            b.flashImg.texture = FlashTex();
            b.flashImg.raycastTarget = false;
            b.rays = Hud.Rect(b.flash, "Rays");
            b.rays.anchorMin = b.rays.anchorMax = b.rays.pivot = new Vector2(0.5f, 0.5f);
            // (inset -400% of the 10 point: 90 across, inside the flash's 190.)
            b.rays.sizeDelta = Vector2.one * 90 * Z;
            b.raysImg = b.rays.gameObject.AddComponent<RawImage>();
            b.raysImg.texture = RaysTex();
            b.raysImg.raycastTarget = false;
            b.Update();
        }

        void Update()
        {
            float k = Mathf.Clamp01((Time.time - from) / 0.9f);
            float a = k < 0.6f ? 1 : 1 - Bezier(0.2f, 0.8f, 0.2f, 1, (k - 0.6f) / 0.4f);
            flash.localScale = Vector3.one * Mathf.Lerp(0.2f, 60, Bezier(0.2f, 0.8f, 0.2f, 1, k));
            flashImg.color = new Color(1, 1, 1, a);
            float r = Bezier(0, 0, 0.58f, 1, k);
            rays.localScale = Vector3.one * Mathf.Lerp(0.3f, 1.4f, r);
            rays.localRotation = Quaternion.Euler(0, 0, -40 * r);
            raysImg.color = new Color(1, 1, 1, a * (1 - r));
            if (k >= 1)
            {
                Destroy(flash.gameObject);
                Destroy(this);
            }
        }

        static Texture2D FlashTex()
        {
            if (flashTex != null) return flashTex;
            const int S = 128;
            flashTex = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var pale = new Color(226 / 255f, 236 / 255f, 252 / 255f, 0.75f);
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    // (In the web's pixels from the middle of its 190.)
                    float d = new Vector2(x + 0.5f - S / 2f, y + 0.5f - S / 2f).magnitude / S * 190;
                    // The glow (box-shadow 0 0 60 30 rgba(236, 243, 255, 0.7): the 10 point spread 30, blurred 60).
                    float g = 0.7f * 0.5f * Erfc((d - 35) / 30 / 1.4142f);
                    var c = new Color(236 / 255f, 243 / 255f, 255 / 255f, g);
                    // The point (radial-gradient over its 10, to its corner: white, pale at 40%, gone at 70%).
                    if (d < 5)
                    {
                        float f = d / 7.07f;
                        var p = f < 0.4f ? Color.Lerp(Color.white, pale, f / 0.4f) : Color.Lerp(pale, new Color(pale.r, pale.g, pale.b, 0), (f - 0.4f) / 0.3f);
                        if (f >= 0.7f) p = Color.clear;
                        c = new Color(Mathf.Lerp(c.r, p.r, p.a), Mathf.Lerp(c.g, p.g, p.a), Mathf.Lerp(c.b, p.b, p.a), p.a + c.a * (1 - p.a));
                    }
                    flashTex.SetPixel(x, y, c);
                }
            flashTex.Apply();
            return flashTex;
        }

        static float Erfc(float x)
        {
            // (Abramowitz and Stegun 7.1.26.)
            float z = Mathf.Abs(x), t = 1 / (1 + 0.3275911f * z);
            float r = t * (0.254829592f + t * (-0.284496736f + t * (1.421413741f + t * (-1.453152027f + t * 1.061405429f)))) * Mathf.Exp(-z * z);
            return x >= 0 ? r : 2 - r;
        }

        static Texture2D RaysTex()
        {
            if (raysTex != null) return raysTex;
            const int S = 256;
            raysTex = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float dx = x + 0.5f - S / 2f, dy = y + 0.5f - S / 2f;
                    // (repeating-conic-gradient: white 0.75 for 4deg of every 18; masked by a radial-gradient to the
                    // corner, whole to 20%, gone by 70%.)
                    float deg = Mathf.Repeat(Mathf.Atan2(dx, dy) * Mathf.Rad2Deg, 18);
                    float on = deg < 4 ? 0.75f : 0;
                    float f = new Vector2(dx, dy).magnitude / (S / 2f * 1.4142f);
                    float m = f < 0.2f ? 1 : Mathf.Clamp01(1 - (f - 0.2f) / 0.5f);
                    raysTex.SetPixel(x, y, new Color(1, 1, 1, on * m));
                }
            raysTex.Apply();
            return raysTex;
        }
    }

    /// <summary>A token bobbing (styles.css cmp-token-float: up `Height` half way through each `Period`, eased, from `Delay`).</summary>
    public class Bob : MonoBehaviour
    {
        public float Height, Period = 5, Delay;
        Vector2 rest;
        bool set;

        void Update()
        {
            var r = (RectTransform)transform;
            if (!set) { rest = r.anchoredPosition; set = true; }
            float k = Mathf.Repeat((Time.time - Delay) / Period, 1);
            // (ease-in-out to the top at half way and back.)
            float e = k < 0.5f ? Mathf.SmoothStep(0, 1, k * 2) : Mathf.SmoothStep(1, 0, k * 2 - 1);
            r.anchoredPosition = rest + new Vector2(0, Height * e);
        }
    }

    /// <summary>The sealed cache floating (styles.css loot-float: up and down over 3.2s).</summary>
    public class Float : MonoBehaviour
    {
        Vector2 rest;
        bool set;

        void Update()
        {
            var r = (RectTransform)transform;
            if (!set) { rest = r.anchoredPosition; set = true; }
            r.anchoredPosition = rest + new Vector2(0, 6 * Mathf.Sin(Time.time / 3.2f * Mathf.PI * 2));
        }
    }

    /// <summary>
    /// An emblem as a reward (.loot-tile.loot-emblem, its tile `r` 1.5 tiles across): from its top, 4 in, its badge 0.54
    /// of a tile across on its glow, then 6 apart its name in spaced bold capitals (0.62rem; on a phone 0.52rem) and what
    /// it does (0.72rem soft ink; 0.6rem), both line-height 1.3 and wrapped to the tile. How tall it all is.
    /// </summary>
    static float RelicTile(RectTransform r, Relic rel, float lw)
    {
        bool phone = Css.MaxHeight(560);
        float w = 1.5f * lw, d = 0.54f * lw, y = 4 * Z;
        var glow = WebLook.Centred(r, "Glow", w / 2, y + d / 2, d * 2.3f, d * 2.3f).gameObject.AddComponent<RawImage>();
        glow.texture = Resources.Load<Texture2D>("Icons/loot-glow");
        glow.raycastTarget = false;
        // (.loot-emblem .cmp-relic: its painted badge 0.08 of a tile in from the disc's edge, the disc finished as a
        // struck emblem; shadowed 0 3 8 rgba(30, 34, 50, 0.3).)
        var badge = WebLook.Centred(r, "Badge", w / 2, y + d / 2, d, d).gameObject.AddComponent<RawImage>();
        badge.texture = RelicArt(rel, true);
        badge.raycastTarget = false;
        WebLook.Shadow(badge, 3 * Z, 8 * Z, new Color(30 / 255f, 34 / 255f, 50 / 255f, 0.3f), d / 2);
        y += d + 6 * Z;
        float bs = (phone ? 0.52f : 0.62f) * 16 * Z, ss = (phone ? 0.6f : 0.72f) * 16 * Z;
        var b = WebLook.Words(WebLook.Box(r, "Name", 0, y, w, 10), rel.Name.ToUpperInvariant(), bs, 0.12f, Look.Ink, true, 700, TextAlignmentOptions.Top);
        b.textWrappingMode = TextWrappingModes.Normal;
        b.lineSpacing = (1.3f - 1.26f) * 100 / 1.26f;
        float bh = b.GetPreferredValues(b.text, w, 0).y;
        b.rectTransform.sizeDelta = new Vector2(w, bh + 2);
        y += bh + 6 * Z;
        var t = WebLook.Words(WebLook.Box(r, "What", 0, y, w, 10), Heroes.RelicText(rel), ss, 0, Look.InkSoft, false, 400, TextAlignmentOptions.Top);
        t.textWrappingMode = TextWrappingModes.Normal;
        t.lineSpacing = (1.3f - 1.26f) * 100 / 1.26f;
        float th = t.GetPreferredValues(t.text, w, 0).y;
        t.rectTransform.sizeDelta = new Vector2(w, th + 2);
        return y + th;
    }

    /// <summary>
    /// A relic's badge (relic-art.ts relicMark, .cmp-relic, baked from the page): its painted badge by its base name (its
    /// name without its quality word), or its kind's mark on dark enamel; in a loot's tile (`loot`), set in from its disc.
    /// </summary>
    public static Texture2D RelicArt(Relic rel, bool loot = false)
    {
        string name = rel?.Name ?? "";
        string slug = System.Text.RegularExpressions.Regex.Replace(name.Substring(name.IndexOf(' ') + 1).ToLowerInvariant().Replace("'", ""), "[^a-z0-9]+", "_").Trim('_');
        string pre = loot ? "loot-" : "";
        return Resources.Load<Texture2D>($"Relics/{pre}{slug}") ?? Resources.Load<Texture2D>($"Relics/{pre}glyph-{rel?.Slot}") ?? Resources.Load<Texture2D>($"Relics/{pre}glyph-weapon");
    }

    // ---- Choices ----

    /// <summary>A card to pick's width (.cmp-card: 107, on a phone 88).</summary>
    static float PickW => (Css.MaxHeight(560) ? 88 : 107) * Z;

    /// <summary>A new card to choose (renderOverlay's card reward): the cards in a row, skip or confirm under them.</summary>
    void CardReward(CardReward reward)
    {
        if (cardPick != null && !reward.Options.Contains(cardPick)) cardPick = null;
        Modal($"★ {reward.Source.ToLowerInvariant()} · choose a new card", body =>
        {
            int n = reward.Options.Count;
            float cw = PickW, gap = 10 * Z, bw = body.sizeDelta.x, rw = n * cw + (n - 1) * gap;
            for (int i = 0; i < n; i++)
            {
                var id = reward.Options[i];
                CardPick(body, id, new Vector2((bw - rw) / 2 + i * (cw + gap) + cw / 2 - bw / 2, 0), cw, cardPick == id, () => { Sound.Play("hover"); cardPick = cardPick == id ? null : id; Refresh(); }, new Vector2(0.5f, 1));
            }
            float y = cw * 1.4f + 10 * Z;
            var pick = cardPick;
            var skip = WebButton(body, "skip", () => { cardPick = null; Act(new CampaignAction { Type = "chooseCard", DefId = null }); }, false, 0, y);
            var ok = WebButton(body, "confirm", () => { cardPick = null; Act(new CampaignAction { Type = "chooseCard", DefId = pick }, "buy"); }, true, 0, y, pick != null);
            float sw = ((RectTransform)skip.transform).sizeDelta.x, ow = ((RectTransform)ok.transform).sizeDelta.x, all = sw + 8 * Z + ow;
            WebLook.Box((RectTransform)skip.transform, bw / 2 - all / 2, y, sw, ((RectTransform)skip.transform).sizeDelta.y);
            WebLook.Box((RectTransform)ok.transform, bw / 2 - all / 2 + sw + 8 * Z, y, ow, ((RectTransform)ok.transform).sizeDelta.y);
            return y + ((RectTransform)ok.transform).sizeDelta.y;
        });
    }

    /// <summary>A Dark Prophet's offer: his face, three of your cards as his mark would make them, each named; turn away.</summary>
    void Prophet()
    {
        Modal("the dark prophet", body =>
        {
            float bw = body.sizeDelta.x, y = 2 * Z;
            var art = EngineData.Art("dark_prophet");
            if (art != null)
            {
                var face = Face(body, "dark_prophet", bw / 2, y + 56 * Z, 112 * Z, WebLook.Hex("#1a1f2a"), (3 * Z, Color.white), (5 * Z, WebLook.Hex("#6b4fc8")));
                face.SetAsFirstSibling();
                y += 112 * Z + 8 * Z;
            }
            var offers = state.Prophet.Offers;
            float cw = PickW, gap = 10 * Z, rw = offers.Count * cw + (offers.Count - 1) * gap;
            for (int i = 0; i < offers.Count; i++)
            {
                int index = i;
                var o = offers[i];
                float x = (bw - rw) / 2 + i * (cw + gap);
                CardPick(body, Builds.MarkedId(o.Mark, o.Card), new Vector2(x + cw / 2 - bw / 2, -y), cw, false, () => Act(new CampaignAction { Type = "prophetPick", Index = index }, "upgrade"), new Vector2(0.5f, 1));
                var mark = WebLook.Words(WebLook.Box(body, "Mark", x - 20, y + cw * 1.4f + 6 * Z, cw + 40, 18), (Builds.D.NyxMarks.TryGetValue(o.Mark, out var m) ? m.Name : o.Mark).ToUpperInvariant(), 0.6f * 16 * Z, 0.14f, WebLook.Hex("#6b4fc8"), true, 500);
                mark.raycastTarget = false;
            }
            y += cw * 1.4f + 6 * Z + 18 + 10 * Z;
            var away = WebButton(body, "turn away", () => Act(new CampaignAction { Type = "prophetPick", Index = null }, "hover"), false, bw / 2, y);
            return y + ((RectTransform)away.transform).sizeDelta.y;
        });
    }

    /// <summary>
    /// Aster's gift (renderOverlay, .cmp-emblems): one of the Seren's three emblems, each a tile as a loot's emblem is
    /// (its tile min(150, 26vw), 1.5 of it across, at least 1.4 of it tall, 6 under its words), 18 apart and centred,
    /// padded 8 above and 4 below; the modal as wide as they need (within its 620 to 900, 94vw).
    /// </summary>
    void Emblems()
    {
        var list = state.EmblemChoice;
        float lw = Mathf.Min(150 * Z, 26 * RawVw), tw = 1.5f * lw, gap = 18 * Z, rw = list.Count * tw + (list.Count - 1) * gap;
        float padX = Css.Clamp(14 * Z, 3 * Vw, 28 * Z);
        Modal("aster’s gift · choose an emblem", body =>
        {
            float bw = body.sizeDelta.x, h = 1.4f * lw;
            // (Wrapping when the row is wider than the modal allows.)
            int per = Mathf.Max(1, Mathf.Min(list.Count, Mathf.FloorToInt((bw + gap) / (tw + gap))));
            var tiles = new List<RectTransform>();
            for (int i = 0; i < list.Count; i++)
            {
                int index = i;
                var rel = list[i];
                var r = WebLook.Box(body, rel.Name, 0, 0, tw, h);
                var hit = r.gameObject.AddComponent<Image>();
                hit.color = new Color(1, 1, 1, 0);
                h = Mathf.Max(h, RelicTile(r, rel, lw) + 6 * Z);
                r.gameObject.AddComponent<Button>().onClick.AddListener(() => Act(new CampaignAction { Type = "chooseEmblem", Index = index }, "upgrade"));
                tiles.Add(r);
            }
            int rows = (list.Count + per - 1) / per;
            for (int i = 0; i < tiles.Count; i++)
            {
                int row = i / per, inRow = Mathf.Min(per, list.Count - row * per), j = i % per;
                float rowW = inRow * tw + (inRow - 1) * gap;
                WebLook.Box(tiles[i], (bw - rowW) / 2 + j * (tw + gap), 8 * Z + row * (h + gap), tw, h);
            }
            return 8 * Z + rows * h + (rows - 1) * gap + 4 * Z;
        }, Mathf.Max(620 * Z, rw + 2 * padX + 2 * Z));
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

    /// <summary>
    /// A hero come to you (renderOverlay's .struggle): no box, on the veil; their face large in a ring of rust, the kind of
    /// moment small in rust capitals, their name large, their words in italics, and the choices under them.
    /// </summary>
    void Standoff(string kicker, string hero, string line, System.Action<RectTransform, float> actions, float actionsH)
    {
        var v = Veil(overlay, true);
        float t0 = RevealFrom(kicker + hero);
        var rust = WebLook.Hex("#c2401c");
        // (.struggle: 12 apart; the face clamp(88, 16vh, 140), the name clamp(1.3rem, 4.5vh, 2rem), the line
        // clamp(0.9rem, 2.6vh, 1.1rem) at most 34em across.)
        float face = Css.Clamp(88 * Z, 16 * RawVh, 140 * Z), ns = Css.Clamp(1.3f * 16 * Z, 4.5f * RawVh, 2 * 16 * Z), ls = Css.Clamp(0.9f * 16 * Z, 2.6f * RawVh, 1.1f * 16 * Z);
        float mid = PW / 2, lineW = Mathf.Min(34 * ls, PW - 2 * 24 * Z), gap = 12 * Z, kH = 0.66f * 16 * Z * 1.25f, nH = ns * 1.26f;
        TextMeshProUGUI said = null;
        float lH = 0;
        if (line != null)
        {
            said = WebLook.Words(Hud.Fill(Hud.Rect(v, "Line")), $"“{line}”", ls, 0, Look.InkSoft, false, 400);
            said.fontStyle = FontStyles.Italic;
            said.textWrappingMode = TextWrappingModes.Normal;
            said.lineSpacing = (1.5f - 1.2f) * 100 / 1.2f;
            lH = said.GetPreferredValues(said.text, lineW, 0).y;
        }
        // (.struggle: padded 24 all round, in place of the page's padding; the column in the middle of the screen.)
        float total = face + gap + kH + gap + nH + (line != null ? gap + lH : 0) + gap + 6 * Z + actionsH, y = Mathf.Max(24 * Z, (PH - total) / 2);
        var f = Face(v, hero, mid, y + face / 2, face, WebLook.Hex("#1a1f2a"), (3 * Z, Color.white), (5 * Z, rust));
        var glow = WebLook.Rounded(f, "Glow", new Color(rust.r, rust.g, rust.b, 0.35f), 999);
        glow.sprite = Hud.Soft;
        glow.type = Image.Type.Sliced;
        glow.pixelsPerUnitMultiplier = 41f / (face / 2 + 40 * Z);
        Hud.Fill(glow.rectTransform);
        glow.rectTransform.offsetMin = new Vector2(-40 * Z, -40 * Z - 10 * Z);
        glow.rectTransform.offsetMax = new Vector2(40 * Z, 40 * Z - 10 * Z);
        glow.transform.SetAsFirstSibling();
        RiseIn.On(f, t0, 0, 0.8f);
        y += face + gap;
        WebLook.Words(WebLook.Box(v, "Kicker", 0, y, PW, kH), kicker.ToUpperInvariant(), 0.66f * 16 * Z, 0.32f, rust, true, 400);
        y += kH + gap;
        WebLook.Words(WebLook.Box(v, "Name", 0, y, PW, nH), Cards.Def(hero).Name.ToUpperInvariant(), ns, 0.24f, Look.Ink, true, 400);
        y += nH;
        if (said != null)
        {
            y += gap;
            WebLook.Box(said.rectTransform, mid - lineW / 2, y, lineW, lH + 2);
            RiseIn.On(said.rectTransform, t0, 0.4f, 1);
            y += lH;
        }
        y += gap + 6 * Z;
        var acts = WebLook.Box(v, "Actions", 0, y, PW, actionsH);
        actions(acts, actionsH);
        RiseIn.On(acts, t0, 1, 0.8f);
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

    /// <summary>Who says a line of a scene, as the web names them: the visitor (the scene's title), the Captain, one of the crew.</summary>
    static string SpeakerName(string who, string title) => who == "visitor" ? title : who == "captain" ? "the captain" : Companions.All.FirstOrDefault(c => c.Id == who)?.Name ?? who;

    /// <summary>The face beside a line: the Captain's or a crew member's (the visitor's lines have none).</summary>
    static string SpeakerCard(string who) => who == "captain" ? Builds.CaptainId : who == "visitor" ? null : Companions.All.FirstOrDefault(c => c.Id == who)?.Card;

    /// <summary>
    /// A scene with the ship in it (campaign.ts scene, .enc): its kind small and its title in spaced capitals at the top
    /// (clear of the safe area), over the ship; the talk at the foot (clear of the safe area), min(720, 100% - 32)
    /// across: each line its speaker's face (the visitor's none, set in, in italics), their name small over their words;
    /// a note; the choices under them, coming in one after another. The talk at most 52% of the screen tall, scrolling
    /// past that, so the choices are always on the screen.
    /// </summary>
    void ShipScene(string kicker, string title, List<(string who, string text)> lines, System.Action<RectTransform> actions, string note = null, Transform parent = null, System.Func<RectTransform, float, float> body = null, string visitor = null)
    {
        float from = RevealFrom(kicker + "|" + title + "|" + string.Join("|", lines.Select(l => l.who + ":" + l.text)));
        var v = Hud.Rect(parent ?? overlay, "Scene");
        Hud.Fill(v);
        v.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0);
        var pad = Pad;
        // (.enc-head: max(14, the safe area) from the top; its title clamp(0.9rem, 2.6vh, 1.2rem).)
        float ts = Css.Clamp(0.9f * 16 * Z, 2.6f * RawVh, 1.2f * 16 * Z), kh = 0.5f * 16 * Z * 1.25f;
        var head = WebLook.Box(v, "Head", 0, Mathf.Max(14 * Z, pad.x), PW, kh + 2 * Z + ts * 1.26f);
        WebLook.Words(WebLook.Box(head, "Kicker", 0, 0, PW, kh), kicker.ToUpperInvariant(), 0.5f * 16 * Z, 0.24f, Look.InkSoft, false, 400);
        WebLook.Words(WebLook.Box(head, "Title", 0, kh + 2 * Z, PW, ts * 1.26f), title.ToUpperInvariant(), ts, 0.2f, Look.Ink, true, 400);
        RiseIn.On(head, from, 0, 0.8f);
        // (.enc-line p: clamp(0.82rem, 2.2vh, 0.98rem), 1.45 high; the words 44 in, past the face and its gap.)
        float W = Mathf.Min(720 * Z, PW - 32 * Z);
        float fs = Css.Clamp(0.82f * 16 * Z, 2.2f * RawVh, 0.98f * 16 * Z), textX = 44 * Z, textW = W - textX, whoH = 0.48f * 16 * Z * 1.2f;
        // The talk, top down (10 between its lines, what it offers, its note and its choices; 8 between lines).
        var talk = Hud.Rect(v, "Talk");
        float y = 0;
        var rising = new List<(RectTransform r, float delay)>();
        for (int i = 0; i < lines.Count; i++)
        {
            var (who, text) = lines[i];
            if (i > 0) y += who == "found" || who == "damage" ? 10 * Z : 8 * Z;
            if (who == "found" || who == "damage")
            {
                // (What came of it, a part found or a slot wrecked: .enc-result, with the first line.)
                var part = who == "found" ? Parts.ShipPart(state.Encounter?.Part) : null;
                float rh = (part != null ? 84 * Z + 4 * Z : 0) + 0.78f * 16 * Z * 1.25f + 4 * Z + 0.78f * 16 * Z * 1.3f;
                var res = WebLook.Box(talk, "Result", 0, y, W, rh);
                float ry = 0;
                if (part != null)
                {
                    var glow = WebLook.Centred(res, "Glow", W / 2, 42 * Z, 84 * Z * 2.3f, 84 * Z * 2.3f).gameObject.AddComponent<RawImage>();
                    glow.texture = Resources.Load<Texture2D>("Icons/loot-glow");
                    glow.raycastTarget = false;
                    var art = WebLook.Centred(res, "Part", W / 2, 42 * Z, 84 * Z * 0.8f, 84 * Z * 0.8f).gameObject.AddComponent<RawImage>();
                    art.texture = Resources.Load<Texture2D>($"Icons/part-{part.Kind}-{part.Rarity}");
                    art.raycastTarget = false;
                    ry = 84 * Z + 4 * Z;
                }
                string head2 = part != null ? part.Name : $"slot {(state.Encounter?.Slot ?? 0) + 1} wrecked", sub = part != null ? part.Text : "until a space station";
                WebLook.Words(WebLook.Box(res, "Name", 0, ry, W, 0.78f * 16 * Z * 1.25f), head2.ToUpperInvariant(), 0.78f * 16 * Z, 0.22f, Look.Ink, true, 400);
                WebLook.Words(WebLook.Box(res, "What", 0, ry + 0.78f * 16 * Z * 1.25f + 4 * Z, W, 0.78f * 16 * Z * 1.3f), sub, 0.78f * 16 * Z, 0, Look.InkSoft, false, 400);
                rising.Add((res, 0.9f));
                y += rh;
                continue;
            }
            bool them = who == "visitor";
            var line = Hud.Rect(talk, "Line");
            var p = WebLook.Words(Hud.Fill(Hud.Rect(line, "Words")), text, fs, 0, Look.Ink, false, 400, TextAlignmentOptions.TopLeft);
            p.textWrappingMode = TextWrappingModes.Normal;
            if (them) p.fontStyle = FontStyles.Italic;
            p.lineSpacing = (1.45f - 1.26f) * 100 / 1.26f;
            float ph = p.GetPreferredValues(text, textW, 0).y;
            float h = Mathf.Max(card(who) != null ? 34 * Z : 0, whoH + 1 * Z + ph);
            WebLook.Box(line, 0, y, W, h);
            var face = card(who);
            if (face != null) Face(line, face, 17 * Z, 17 * Z, 34 * Z, WebLook.Hex("#1a1f2a"));
            WebLook.Words(WebLook.Box(line, "Who", textX, 0, textW, whoH), SpeakerName(who, visitor ?? title).ToUpperInvariant(), 0.48f * 16 * Z, 0.2f, Look.InkSoft, false, 400, TextAlignmentOptions.Left);
            WebLook.Box(p.rectTransform, textX, whoH + 1 * Z, textW, ph + 2);
            rising.Add((line, LineDelay(i)));
            y += h;
        }
        if (body != null)
        {
            // (What the scene offers, between its talk and its choices: laid out by `body`, which says how tall it is.)
            var mid = WebLook.Box(talk, "Offers", 0, y + 10 * Z, W, 10);
            float mh = body(mid, from);
            WebLook.Box(mid, 0, y + 10 * Z, W, mh);
            y += 10 * Z + mh;
        }
        if (note != null)
        {
            float nh = 0.72f * 16 * Z * 1.25f;
            var n = WebLook.Words(WebLook.Box(talk, "Note", 0, y + 10 * Z, W, nh), note, 0.72f * 16 * Z, 0.08f, Look.InkSoft, false, 400);
            rising.Add((n.rectTransform, 1.6f));
            y += 10 * Z + nh;
        }
        // (.enc-acts: 4 above its buttons; they wrap onto more rows on a narrow screen.)
        float bh = 0.66f * 16 * Z * 1.25f + 2 * 9 * Z;
        var acts = WebLook.Box(talk, "Actions", 0, y + 10 * Z + 4 * Z, W, bh);
        actions(acts);
        float actsH = acts.sizeDelta.y;
        rising.Add((acts, LineDelay(lines.Count(l => l.who != "found" && l.who != "damage"))));
        y += 10 * Z + 4 * Z + actsH;
        // (At the foot, max(14, the safe area) up from it; at most 52% of the screen, scrolling past that.)
        float most = 0.52f * PH, shown = Mathf.Min(y, most), bottom = PH - Mathf.Max(14 * Z, pad.z);
        var box = WebLook.Box(v, "Foot", PW / 2 - W / 2, bottom - shown, W, shown);
        if (y > most + 0.5f)
        {
            var content = StationKit.Scroller(box, y);
            talk.SetParent(content, false);
        }
        else talk.SetParent(box, false);
        WebLook.Box(talk, 0, 0, W, y);
        foreach (var (r, delay) in rising) RiseIn.On(r, from, delay);

        string card(string who) => SpeakerCard(who);
    }

    /// <summary>
    /// A row of the web's buttons, centred, 10 (CSS) apart (primary or plain; held back, faded); and, if asked, the
    /// purse after them: the materials token and how many.
    /// </summary>
    void Buttons(RectTransform row, params (string label, bool primary, string why, System.Action act)[] bs) => Buttons(row, -1, bs);

    void Buttons(RectTransform row, int purse, params (string label, bool primary, string why, System.Action act)[] bs)
    {
        float gap = 10 * Z, rowW = row.sizeDelta.x;
        var items = new List<RectTransform>();
        foreach (var (label, primary, why, act) in bs)
        {
            var plain = label.Replace("⬢", "").ToLowerInvariant();
            var b = WebButton(row, plain, () => act(), primary, 0, 0, why == null);
            // (A price at its end: the materials' mark before the number, as the web's " · ⬢8" (campaign.ts encounter acts).)
            var price = System.Text.RegularExpressions.Regex.Match(plain, @"^(.*) · (\d+)$");
            if (price.Success)
            {
                var t = b.GetComponentInChildren<TextMeshProUGUI>();
                string words = $"{price.Groups[1].Value.ToUpperInvariant()} · {InlineMark("materials")}{price.Groups[2].Value}";
                t.text = words;
                var br = (RectTransform)b.transform;
                float fs = t.fontSize, bw = Mathf.Max(primary ? 140 * Z : 0, t.GetPreferredValues(words).x + 2 * 16 * Z);
                br.sizeDelta = new Vector2(bw, br.sizeDelta.y);
                RuleMarks(t, words, fs);
            }
            items.Add((RectTransform)b.transform);
        }
        if (purse >= 0)
        {
            // (.enc-purse: the materials token, 4, and how many.)
            var r = Hud.Rect(row, "Purse");
            var count = WebLook.Words(Hud.Fill(Hud.Rect(r, "Count")), purse.ToString(), 0.8f * 16 * Z, 0, Look.InkSoft, false, 400, TextAlignmentOptions.Left);
            float cw = count.GetPreferredValues(count.text).x;
            r.sizeDelta = new Vector2(14 * Z + 4 * Z + cw + 4, items.Count > 0 ? items[0].sizeDelta.y : 24 * Z);
            var mark = WebLook.Centred(r, "Materials", 7 * Z, r.sizeDelta.y / 2, 14 * Z, 14 * Z).gameObject.AddComponent<RawImage>();
            mark.texture = Resources.Load<Texture2D>("Icons/purse-materials");
            mark.raycastTarget = false;
            WebLook.Box(count.rectTransform, 18 * Z, 0, cw + 4, r.sizeDelta.y);
            items.Add(r);
        }
        // (display: flex; flex-wrap: wrap; justify-content: center; 10 apart each way.)
        var rows = new List<List<RectTransform>> { new List<RectTransform>() };
        float w = 0;
        foreach (var r in items)
        {
            var now = rows[rows.Count - 1];
            if (now.Count > 0 && w + gap + r.sizeDelta.x > rowW) { rows.Add(new List<RectTransform>()); w = 0; now = rows[rows.Count - 1]; }
            w += (now.Count > 0 ? gap : 0) + r.sizeDelta.x;
            now.Add(r);
        }
        float y = 0;
        foreach (var line in rows)
        {
            float lineW = line.Sum(r => r.sizeDelta.x) + gap * (line.Count - 1), lineH = line.Max(r => r.sizeDelta.y), x = (rowW - lineW) / 2;
            foreach (var r in line)
            {
                WebLook.Box(r, x, y + (lineH - r.sizeDelta.y) / 2, r.sizeDelta.x, r.sizeDelta.y);
                x += r.sizeDelta.x + gap;
            }
            y += lineH + gap;
        }
        row.sizeDelta = new Vector2(rowW, Mathf.Max(0, y - gap));
    }

    List<string> Crew() => (Campaign.Player(state).Reserve ?? new List<string>()).Where(id => id.StartsWith("companion_")).Select(id => id.Substring("companion_".Length)).ToList();

    void Joined(JoinedCompanion joined)
    {
        var c = Companions.All.FirstOrDefault(x => x.Id == joined.Id);
        string name = c?.Name ?? joined.Id;
        var lines = new List<(string, string)> { (joined.Id, joined.Line) };
        if (joined.Swap == true)
        {
            // (Three aboard already: one stands down for this run, or the new one waits ashore for another.)
            ShipScene("joins the crew", name, lines, row =>
            {
                var aboard = Crew().Where(x => x != joined.Id).ToList();
                var bs = aboard.Select(id => ($"{(Companions.All.FirstOrDefault(x => x.Id == id)?.Name ?? id).Split(' ')[0]} stands down", false, (string)null, (System.Action)(() => Act(new CampaignAction { Type = "crewSwap", Out = id }, "hover")))).ToList();
                bs.Add(($"{name.Split(' ')[0]} waits ashore", false, null, () => Act(new CampaignAction { Type = "crewSwap", Out = null }, "hover")));
                Buttons(row, bs.ToArray());
            }, $"only {Companions.ActiveCrew} fly at once · who stays ashore this run?");
            return;
        }
        ShipScene("joins the crew", name, lines, row => Buttons(row, ("welcome aboard", true, null, () => Act(new CampaignAction { Type = "joinedSeen" }, "hover"))), $"{(c?.Title ?? "").ToLowerInvariant()} · in your deck now");
    }

    void Encounter()
    {
        var e = state.Encounter;
        var me = Campaign.Player(state);
        string title = Encounters.VisitorName(e.Kind, e.Stage);
        string kicker = e.Kind == "hunters" ? "bounty hunters" : "encounter";
        if (e.Outcome == null)
        {
            var lines = Encounters.OpeningLines(e.Kind, e.Price, e.Stage, Crew()).Select(l => (l.Who, l.Text)).ToList();
            ShipScene(kicker, title, lines, row =>
            {
                var choices = Encounters.EncounterChoices(e.Kind, e.Price, e.Stage)
                    .Select(c => (c.Label, c.Id == "fight" || c.Id == "buy", Campaign.EncounterProblem(state, c.Id), (System.Action)(() => Act(new CampaignAction { Type = "encounter", Choice = c.Id }))))
                    .ToArray();
                Buttons(row, me.Materials, choices);
            });
            return;
        }
        var closing = Encounters.ClosingLines(e.Kind, e.Outcome, e.Stage, Crew()).Select(l => (l.Who, l.Text)).ToList();
        // (What came of it after what is said, before the choices, as the web puts its .enc-result.)
        if (e.Part != null) closing.Add(("found", ""));
        else if (e.Outcome == "bad" && e.Slot != null) closing.Add(("damage", ""));
        ShipScene(kicker, title, closing, row => Buttons(row, ("fly on", true, null, () => Act(new CampaignAction { Type = "encounter", Choice = "done" }))));
    }

    void Struggle()
    {
        var hero = state.Struggle.Hero;
        bool human = Campaign.Player(state).Human == true;
        float bh = 0.66f * 16 * Z * 1.25f + 2 * 9 * Z;
        Standoff("power struggle", hero, Campaign.StruggleLine(hero, human), (row, h) => Buttons(row, (human ? "fight for your ship" : "fight for your command", true, null, () => Act(new CampaignAction { Type = "struggle" }))), bh);
    }

    void Beaten()
    {
        var hero = state.Beaten.Hero;
        float bh = 0.66f * 16 * Z * 1.25f + 2 * 12 * Z + 0.66f * 16 * Z * 1.2f + 3 * Z;
        Standoff("beaten", hero, null, (row, h) => Buttons(row,
            ("recruit · joins your deck", true, null, () => Act(new CampaignAction { Type = "struggleChoice", Recruit = true }, "upgrade")),
            ("slay · for their hoard", false, null, () => Act(new CampaignAction { Type = "struggleChoice", Recruit = false }, "buy"))), bh);
    }

    /// <summary>A Dream of the Lost: the screen drifts into dark, with a line; then the dream begins by itself.</summary>
    void Dream()
    {
        bool spoils = state.Loot != null || state.CardRewards.Count > 0 || state.Conquest != null;
        if (spoils) return;
        // (.dream-fade: a dusk of violet at the middle darkening to near black, fading in over 3.6s; the line in spaced
        // lowercase, pale violet, coming in as it settles.)
        var v = Hud.Rect(overlay, "Dream");
        Hud.Fill(v);
        var dark = v.gameObject.AddComponent<RawImage>();
        dark.texture = DreamDark();
        var t = WebLook.Words(v, "you drift into a sorrowful slumber", 1.3f * 16 * Z * 0.78f, 0.32f, WebLook.Hex("#d9d4f0"), true, 400);
        t.margin = new Vector4(0, 0, 0.32f * 1.3f * 16 * Z * 0.78f, 0);
        float t0 = RevealFrom("dream");
        v.gameObject.AddComponent<CanvasGroup>();
        // (dream-in over 3.6s; the line (dream-line) in from a quarter of the way to seven tenths.)
        RiseIn.On(v, t0, 0, 3.6f);
        RiseIn.On(t.rectTransform, t0, 0.9f, 1.62f);
        if (!dreamStarting && Application.isPlaying)
        {
            dreamStarting = true;
            Invoke(nameof(BeginDream), 4.2f);
        }
    }

    static Texture2D dreamDark;

    /// <summary>The dream's dark: rgba(30, 26, 52, 0.55) at the middle (a little below it), rgba(6, 5, 12, 0.96) by 70% out.</summary>
    static Texture2D DreamDark()
    {
        if (dreamDark != null) return dreamDark;
        const int W = 128, H = 80;
        dreamDark = new Texture2D(W, H, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        Color a = new Color(30 / 255f, 26 / 255f, 52 / 255f, 0.55f), b = new Color(6 / 255f, 5 / 255f, 12 / 255f, 0.96f);
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++)
            {
                // (An ellipse to the farthest corner from its middle, 55% down.)
                float dx = (x + 0.5f) / W - 0.5f, dy = 1 - (y + 0.5f) / H - 0.55f;
                float d = Mathf.Sqrt(dx * dx / (0.5f * 0.5f * 2) + dy * dy / (0.55f * 0.55f * 2));
                dreamDark.SetPixel(x, y, Color.Lerp(a, b, Mathf.Clamp01(d / 0.7f)));
            }
        dreamDark.Apply();
        return dreamDark;
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
        sheetNow = null;
        foreach (var c in sheetRoot.Cast<Transform>().ToList()) if (c != null) Mats.Kill(c.gameObject);
    }

    /// <summary>The sheet open (to draw it again when the screen changes).</summary>
    System.Action sheetNow;

    void Ask(string title, string words, (string label, System.Action act) yes)
    {
        CloseSheet();
        sheetNow = () => Ask(title, words, yes);
        // (renderOverlay's rift sheet: the narrow modal, the choice it is for and its words under it, then stay.)
        Modal(title, body => SetList(body, 0, new SetRow(yes.label, () => { CloseSheet(); yes.act(); }, words, true), new SetRow("stay", CloseSheet)), 560 * Z, sheetRoot);
    }

    /// <summary>
    /// The settings (renderOverlay's settings sheet): the modal, its rows as the settings' (sound, music, the AI's
    /// speed, each its value in a pill; the log; the main menu), and a note that the run is kept.
    /// </summary>
    void Settings()
    {
        CloseSheet();
        sheetNow = Settings;
        Modal("settings", body =>
        {
            float h = SetList(body, 0,
                new SetRow("sound", () => { Sound.Muted = !Sound.Muted; Settings(); }, value: Sound.Muted ? "off" : "on"),
                new SetRow("music", Sound.Muted ? (System.Action)null : () => { Sound.MusicOn = !Sound.MusicOn; Settings(); }, value: Sound.MusicOn && !Sound.Muted ? "on" : "off"),
                new SetRow("ai speed", () => { BattleView.NextSpeed(); Settings(); }, value: BattleView.Speed),
                new SetRow("how the loop works", Help),
                new SetRow("main menu", () => App.Instance.Menu("hub")));
            var note = WebLook.Words(WebLook.Box(body, "Note", 0, h + 12 * Z, body.sizeDelta.x, 0.7f * 16 * Z * 1.4f), "Your run is saved; continue it from the main menu.", 0.7f * 16 * Z, 0, Look.InkFaint, false, 400);
            note.raycastTarget = false;
            return h + 12 * Z + 0.7f * 16 * Z * 1.4f;
        }, 620 * Z, sheetRoot, CloseSheet);
    }

    /// <summary>
    /// How the campaign works (renderOverlay's help sheet, opened from the settings' "how the loop works"): the wide
    /// modal (as wide as its words let it, 94vw at most), the materials' legend (.cmp-legend: the token 1.3em, 8 to its
    /// words, 0.78rem soft ink, 4 above and 2 below), then the rules (.rules: 0.86rem, line-height 1.55, a bullet each,
    /// 18 in, 6 between), the stations' and materials' marks in their lines.
    /// </summary>
    void Help()
    {
        CloseSheet();
        sheetNow = Help;
        var T = Campaign.T;
        string Star(string k) => Campaign.D.StarTypes.TryGetValue(k, out var st) ? $"<b>{st.Name}:</b> {st.Boon} {st.Cost}" : "";
        string Mark(string icon) => InlineMark(icon);
        var rules = new[]
        {
            $"<b>The loop:</b> each galaxy is a strip of systems, {T.Lanes} lanes wide, that you cross from the near end to the wormhole past the far end. Beat the wormhole's guardian, a Lost Overlord, to go through, into a harder galaxy (the universe is dying, galaxy by galaxy: each one you reach is younger, and burns hotter). An Overlord fights with its body already in play (limbs, gear, retainers) and takes one great action a day, its best for the board as it stands; the next is always shown, and changes as the board does. The run goes on until your flagship is lost.",
            $"<b>The collapse:</b> regional stability lasts {T.StabilityTurns} moves in the first universe, {T.StabilityStep} fewer in each one after (never under {T.StabilityMin}). Then the strip gives way from the near end, a whole column with every move, each marked (⚠) a move before. Whatever stands there is lost, your flagship too.",
            "<b>Every move is a turn.</b> Your flagship flies one route at a time, any way you like, back on itself too. Into a system you hold it simply moves; into a <b>find</b> (a derelict, a depot, an archive) it takes what is there with no fight; into any other, it fights. After each move the collapse comes on. Changing the deck or repairing costs no move. If your flagship has nowhere to go, time moves on by itself.",
            "<b>Win</b> a system and it is yours: it pays its materials once, your flagship moves in, and it counts for petals. Nothing pays by the move. Some worlds hold extra materials, taken with the system.",
            "<b>Stellari petals</b> are grabbed at every wormhole: a few for getting there, more for every share of the strip you conquered. They are banked at once and outlive the run. Spend them between runs on a stronger start, a tougher flagship, run perks, and new races. A race's later heroes are earned by conquering stars as it.",
            $"<b>Its deck</b> starts with {T.ArmySize} cards: your hero and your race's own, with a few neutral cards. It grows with every card you salvage or put in, and never drops below {T.ArmySize}.",
            "<b>Battles</b> are the card game, by its rules. Your hero is in your deck, played like any card. Each universe's <b>galaxy</b> (a black hole, a pulsar, a meteor shower, a nebula or dark matter) bends every battle fought in it.",
            $"{Mark("armory")} <b>Space stations</b> sell {T.ArmoryStock} cards each, every one only once. {Mark("research")} <b>Research stations</b> offer {T.ResearchOptions} upgrades each: pick one, free. Both are better deep in the strip. Bring your flagship to one to use it.",
            "A system with no flagship in it fights as a <b>garrison</b>: more cards, thicker walls and a bigger sun the further along the strip, and the further along the run.",
            $"<b>Stars</b> differ. {string.Join(" ", new[] { "red", "white", "brown", "neutron" }.Select(Star))}",
            $"Your sun carries its heat on as <b>damage</b> (it starts battles hotter). Repair it with {Mark("materials")} materials at a space station.",
        };
        Modal("how the campaign works", body =>
        {
            float W = body.sizeDelta.x, y = 4 * Z;
            // The legend: the materials' token and what they are for.
            float ls = 0.78f * 16 * Z, tok = 1.3f * ls;
            var legend = WebLook.Words(WebLook.Box(body, "Legend", tok + 8 * Z, y, W - tok - 8 * Z, 10), "<color=#3e424a><b>Materials</b></color> pay for everything. Earned: every system you take, finds and battles. Spent: cards at space stations, fusing cards and repairs.", ls, 0, Look.InkSoft, false, 400, TextAlignmentOptions.TopLeft);
            legend.textWrappingMode = TextWrappingModes.Normal;
            float lh = Mathf.Max(tok, legend.GetPreferredValues(legend.text, W - tok - 8 * Z, 0).y);
            legend.rectTransform.sizeDelta = new Vector2(W - tok - 8 * Z, lh + 2);
            var mt = WebLook.Box(body, "Token", 0, y, tok, tok).gameObject.AddComponent<RawImage>();
            mt.texture = Resources.Load<Texture2D>("Icons/materials");
            mt.raycastTarget = false;
            y += lh + 2 * Z;
            // The rules, a bullet each.
            float fs = 0.86f * 16 * Z, indent = 18 * Z, tw = W - indent;
            for (int i = 0; i < rules.Length; i++)
            {
                if (i > 0) y += 6 * Z;
                var t = WebLook.Words(WebLook.Box(body, "Rule", indent, y, tw, 10), rules[i], fs, 0, Look.Ink, false, 400, TextAlignmentOptions.TopLeft);
                t.textWrappingMode = TextWrappingModes.Normal;
                t.lineSpacing = (1.55f - 1.26f) * 100 / 1.26f;
                float h = t.GetPreferredValues(t.text, tw, 0).y;
                t.rectTransform.sizeDelta = new Vector2(tw, h + 2);
                WebLook.Words(WebLook.Box(body, "Bullet", indent - 14 * Z, y, 14 * Z, 1.55f * fs), "•", fs, 0, Look.Ink, false, 400, TextAlignmentOptions.Left);
                RuleMarks(t, rules[i], fs);
                y += Mathf.Max(h, 1.55f * fs);
            }
            return y;
        }, 900 * Z, sheetRoot, CloseSheet);
    }

    /// <summary>A mark in a line of words (the web's inline .cur): room kept for it, 1.15em and 0.18em after it (materials 1.3em), for RuleMarks to draw over.</summary>
    static string InlineMark(string icon) => $"<mspace={(icon == "materials" ? 0.74f : 0.665f).ToString(System.Globalization.CultureInfo.InvariantCulture)}em><alpha=#00>{icon[0]}{icon[0]}<alpha=#FF></mspace>";

    /// <summary>The marks kept room for in a line (InlineMark): each drawn over its room, on the line's baseline as the web's .cur sits.</summary>
    static void RuleMarks(TextMeshProUGUI t, string text, float fs)
    {
        var marks = new List<(int at, string icon, float size, float drop)>();
        foreach (var (icon, size, drop) in new[] { ("armory", 1.15f, 0.22f), ("research", 1.15f, 0.22f), ("materials", 1.3f, 0.3f) })
        {
            int i = text.IndexOf($"<alpha=#00>{icon[0]}{icon[0]}", System.StringComparison.Ordinal);
            if (i < 0) continue;
            // (Its place among the characters drawn: the words before it, their tags left out.)
            marks.Add((System.Text.RegularExpressions.Regex.Replace(text.Substring(0, i), "<[^>]+>", "").Length, icon, size * fs, drop * fs));
        }
        if (marks.Count == 0) return;
        t.ForceMeshUpdate();
        var info = t.textInfo;
        foreach (var (at, icon, size, drop) in marks)
        {
            if (info == null || info.characterInfo == null || at >= info.characterCount) continue;
            var c = info.characterInfo[at];
            var r = Hud.Rect(t.rectTransform, icon);
            r.anchorMin = r.anchorMax = t.rectTransform.pivot;
            r.pivot = new Vector2(0, 0);
            r.anchoredPosition = new Vector2(c.bottomLeft.x, c.baseLine - drop);
            r.sizeDelta = new Vector2(size, size);
            var raw = r.gameObject.AddComponent<RawImage>();
            raw.texture = Resources.Load<Texture2D>(icon == "materials" ? "Icons/materials" : $"Icons/station-{icon}");
            raw.raycastTarget = false;
        }
    }

    /// <summary>The campaign's log (renderOverlay's log sheet): what has happened, a line each, the latest last.</summary>
    void Log()
    {
        CloseSheet();
        sheetNow = Log;
        var lines = state.Log.Skip(Mathf.Max(0, state.Log.Count - 24)).Select(l => l.Text);
        Modal("campaign log", body =>
        {
            var t = WebLook.Words(body, string.Join("\n", lines), 0.8f * 16 * Z, 0, Look.InkSoft, false, 400, TextAlignmentOptions.TopLeft);
            t.textWrappingMode = TextWrappingModes.Normal;
            // (All of it: the modal's body scrolls past what the screen holds.)
            float h = t.GetPreferredValues(t.text, body.sizeDelta.x, 0).y;
            WebLook.Box(t.rectTransform, 0, 0, body.sizeDelta.x, h + 2);
            return h + 2;
        }, 620 * Z, sheetRoot, CloseSheet);
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
            var t = WebLook.Rounded(notes, "Toast", new Color(1, 1, 1, 0.86f), 12 * Z);
            WebLook.Shadow(t, 8 * Z, 22 * Z, new Color(40 / 255f, 46 / 255f, 70 / 255f, 0.12f), 12 * Z, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.08f));
            toastText = WebLook.Words(t.transform, "", 0.74f * 16 * Z, 0, Look.InkSoft, false, 400);
            toastText.textWrappingMode = TextWrappingModes.Normal;
            toastText.margin = new Vector4(16 * Z, 7 * Z, 16 * Z, 7 * Z);
        }
        toastText.text = text;
        var box = (RectTransform)toastText.transform.parent;
        float w = Mathf.Min(440 * Z, PW - 32 * Z, toastText.GetPreferredValues(text).x + 32 * Z + 2);
        float h = toastText.GetPreferredValues(text, w - 32 * Z, 0).y + 14 * Z;
        box.anchorMin = box.anchorMax = box.pivot = new Vector2(0.5f, 1);
        // (14 down, clear of the safe area.)
        box.anchoredPosition = new Vector2(0, -Mathf.Max(14 * Z, Pad.x));
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
        var v = Hud.Rect(notes, "Banner");
        Hud.Fill(v);
        var group = v.gameObject.AddComponent<CanvasGroup>();
        group.blocksRaycasts = false;
        group.alpha = 0;
        float mx = PW / 2, my = PH / 2;
        // (.turn-banner-glow: across the screen, min(46vh, 260) tall, in its middle.)
        var glow = WebLook.Centred(v, "Glow", mx, my, PW, Mathf.Min(46 * Vh, 260 * Z)).gameObject.AddComponent<RawImage>();
        glow.texture = BannerGlow();
        glow.raycastTarget = false;
        // (.turn-banner-text: clamp(1.6rem, 9vh, 3.4rem), spaced 0.5em; past 12 letters clamp(1.1rem, min(6.4vh, 4.2vw),
        // 2.6rem), spaced 0.34em. Under it, 6 apart, .turn-banner-sub: 0.6rem, spaced 0.4em; the two in the middle. No
        // line under them: the campaign's banners carry nothing more (.turn-banner-line comes only with a day's orbit).)
        bool longer = text.Length > 12;
        float size = longer ? Css.Clamp(1.1f * 16 * Z, Mathf.Min(6.4f * Vh, 4.2f * Vw), 2.6f * 16 * Z) : Css.Clamp(1.6f * 16 * Z, 9 * Vh, 3.4f * 16 * Z);
        float subS = 0.6f * 16 * Z, textH = size * 1.26f, subH = subS * 1.26f, top = my - (textH + 6 * Z + subH) / 2;
        var words = WebLook.Words(WebLook.Box(v, "Words", 0, top, PW, textH), text.ToUpperInvariant(), size, longer ? 0.34f : 0.5f, WebLook.Hex("#5b5f67"), true, 400);
        var under = WebLook.Words(WebLook.Box(v, "Sub", 0, top + textH + 6 * Z, PW, subH), sub.ToUpperInvariant(), subS, 0.4f, Look.InkSoft, true, 400);
        v.gameObject.AddComponent<BannerLife>().Set(group, words, under, null, longer ? 0.34f : 0.5f, longer ? 0.6f : 0.9f);
        Sound.Play("turn");
    }

    /// <summary>A run carried on from the menu (app.ts campaign-continue): CAMPAIGN, and the galaxy and turn under it, 120ms on.</summary>
    System.Collections.IEnumerator Announce()
    {
        yield return new WaitForSeconds(0.12f);
        if (state != null) Banner("campaign", $"galaxy {state.Universe} · turn {state.Turn}");
    }

    static Texture2D bannerGlow;

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

    /// <summary>
    /// A banner's two seconds (styles.css bannerLife, bannerText): in over the first 12%, held to 75%, out by the end;
    /// its words closing from 0.9em apart (a long one's from 0.6em); a line, if it has one, growing out from the middle;
    /// then gone.
    /// </summary>
    public class BannerLife : MonoBehaviour
    {
        CanvasGroup group;
        TMP_Text words, sub;
        RectTransform line;
        float spacing, t0;

        float from;

        /// <summary>Its parts, the words' spacing at rest (em) and as they come in (bannerText 0.9em; bannerTextLong 0.6em).</summary>
        public void Set(CanvasGroup g, TMP_Text w, TMP_Text s, RectTransform l, float em, float fromEm = 0.9f)
        {
            from = fromEm;
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
            words.characterSpacing = Mathf.Lerp(from, spacing, e) * 100;
            words.alpha = Mathf.Clamp01(k / 0.3f);
            float ks = Mathf.Clamp01((t - 0.1f) / 2);
            sub.characterSpacing = Mathf.Lerp(0.9f, 0.4f, 1 - Mathf.Pow(1 - ks, 3)) * 100;
            sub.alpha = Mathf.Clamp01(ks / 0.3f);
            float kl = Mathf.Clamp01((t - 0.2f) / 1.6f);
            if (line != null) line.localScale = new Vector3(1 - Mathf.Pow(1 - kl, 2), 1, 1);
        }
    }

    void HideToast()
    {
        if (toastText != null && Time.time >= toastUntil) toastText.transform.parent.gameObject.SetActive(false);
    }
}
