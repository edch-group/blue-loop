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
        var i = v.gameObject.AddComponent<Image>();
        // (No blur here: a touch more of the wash in its place.)
        i.color = soft ? new Color(244 / 255f, 244 / 255f, 242 / 255f, 0.62f) : new Color(240 / 255f, 240 / 255f, 238 / 255f, 0.72f);
        return v;
    }

    /// <summary>
    /// A modal (the web's .modal, campaign.ts modal): a white card 620 (CSS) across, rounded 18, softly shadowed, its
    /// title in spaced capitals with a hairline under it, its body under that (laid out from its top by `body`, which
    /// says how tall it is); the card as tall as they are, in the middle of the screen. Closable: × at the title's right.
    /// </summary>
    RectTransform Modal(string title, System.Func<RectTransform, float> body, float width = 620 * Z, Transform parent = null, System.Action close = null)
    {
        var v = Veil(parent ?? overlay, close != null);
        if (close != null) v.gameObject.AddComponent<Button>().onClick.AddListener(() => close());
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
        // (.modal-body: 22 above and below, 28 either side.)
        float padY = 22 * Z * 0.94f, padX = 28 * Z;
        var b = WebLook.Box(cr, "Body", padX, barH + padY, width - 2 * padX, 10);
        float h = body(b);
        b.sizeDelta = new Vector2(width - 2 * padX, h);
        float total = barH + padY + h + padY;
        cr.anchorMin = cr.anchorMax = cr.pivot = new Vector2(0.5f, 0.5f);
        cr.anchoredPosition = Vector2.zero;
        cr.sizeDelta = new Vector2(width, total);
        WebLook.Shadow(card, 30 * Z, 80 * Z, new Color(80 / 255f, 80 / 255f, 100 / 255f, 0.18f), 18 * Z, Z, new Color(120 / 255f, 124 / 255f, 134 / 255f, 0.08f));
        return v;
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
    static float SetList(RectTransform body, float y, params SetRow[] rows)
    {
        float w = Mathf.Min(380 * Z, body.sizeDelta.x), x = (body.sizeDelta.x - w) / 2, rowH = 46 * Z, pad = 4 * Z, gap = 2 * Z;
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
        raw.texture = Faces.Of(id, false);
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
    /// The run over (.run-over): no box, on the veil; YOU ARE DEAD large and widely spaced, a line in italics, the petals
    /// it banked; one card from the run to keep for the next, picked from a row of them; exit.
    /// </summary>
    void RunOver()
    {
        var v = Veil(overlay, true);
        float t0 = RevealFrom("over");
        var keepable = Campaign.KeepableCards(state);
        if (keepPick != null && !keepable.Contains(keepPick)) keepPick = null;
        float gap = 14 * Z, h2 = 60.3f * 1.26f, p = 24.4f * 1.2f, pet = 32, keepH = keepable.Count > 0 ? 20 + 8 * Z + 180 + 2 * 6 * Z : 0, exitH = 0.66f * 16 * Z * 1.25f + 2 * 9 * Z;
        float total = h2 + gap + p + gap + pet + (keepable.Count > 0 ? gap + keepH : 0) + gap + 10 * Z + exitH;
        float y = 500 - total / 2;
        var title = WebLook.Words(WebLook.Box(v, "Title", 0, y, 1600, h2), "YOU ARE DEAD", 60.3f, 0.32f, Look.Ink, true, 400);
        title.margin = new Vector4(0, 0, 0.32f * 60.3f, 0);
        RiseIn.On(title.rectTransform, t0, 0);
        y += h2 + gap;
        var said = WebLook.Words(WebLook.Box(v, "Said", 0, y, 1600, p), "The others will follow, soon enough…", 24.4f, 0, Look.InkSoft, false, 400);
        said.fontStyle = FontStyles.Italic;
        RiseIn.On(said.rectTransform, t0, 0.6f);
        y += p + gap;
        // (+ its petals, the petal after.)
        var petals = WebLook.Words(Hud.Rect(v, "Petals"), $"+ {state.Petals}", 25.5f, 0.08f, Look.Ink, true, 400, TextAlignmentOptions.Left);
        float pw = petals.GetPreferredValues(petals.text).x, rowW = pw + 6 * Z + 29;
        var pr = WebLook.Box(Hud.Rect(v, "Banked"), 800 - rowW / 2, y, rowW, pet);
        petals.transform.SetParent(pr, false);
        WebLook.Box(petals.rectTransform, 0, 0, pw + 4, pet);
        var mark = WebLook.Centred(pr, "Petal", pw + 6 * Z + 14.5f, pet / 2, 29, 29).gameObject.AddComponent<RawImage>();
        mark.texture = Resources.Load<Texture2D>("Icons/purse-petal");
        mark.raycastTarget = false;
        RiseIn.On(pr, t0, 1.3f);
        y += pet;
        if (keepable.Count > 0)
        {
            y += gap;
            var keep = WebLook.Box(v, "Keep", 0, y, 1600, keepH);
            WebLook.Words(WebLook.Box(keep, "Words", 0, 0, 1600, 20), "KEEP ONE CARD FOR YOUR NEXT RUN", 0.7f * 16 * Z, 0.18f, Look.InkSoft, true, 400);
            int n = keepable.Count;
            float cw = 88 * Z, cg = 8 * Z + 2 * 6 * Z * 0;
            float rw = n * cw + (n - 1) * cg;
            for (int i = 0; i < n; i++)
            {
                var id = keepable[i];
                CardPick(keep, id, new Vector2(800 - rw / 2 + i * (cw + cg), -(20 + 8 * Z + 6 * Z)), cw, keepPick == id, () => { Sound.Play("hover"); keepPick = keepPick == id ? null : id; Refresh(); }, new Vector2(0, 1));
            }
            RiseIn.On(keep, t0, 1.6f);
            y += keepH;
        }
        y += gap + 10 * Z;
        var exit = WebButton(v, keepPick != null ? $"keep {Cards.Def(keepPick).Name.ToLowerInvariant()} · exit" : "exit", NewRunFromHere, true, 800, y);
        RiseIn.On((RectTransform)exit.transform, t0, 1.8f);
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
        if (!lootOpen)
        {
            var cache = WebLook.Box(v, "Cache", 800 - 160, 500 - 178, 319, 355);
            var halo = WebLook.Centred(cache, "Halo", 160, 160, 436, 436).gameObject.AddComponent<RawImage>();
            halo.texture = CacheHalo();
            halo.raycastTarget = false;
            var art = WebLook.Box(cache, "Art", 0, 0, 319, 319).gameObject.AddComponent<RawImage>();
            art.texture = Resources.Load<Texture2D>("Icons/loot-cache");
            var tap = WebLook.Words(WebLook.Box(cache, "Tap", -100, 319 + 10 * Z, 519, 21), $"{(l.Found != null ? "FOUND" : l.Won ? "VICTORY" : "WHAT WAS SAVED")} · TAP TO OPEN", 0.72f * 16 * Z, 0.24f, Look.InkSoft, true, 400);
            tap.raycastTarget = false;
            cache.gameObject.AddComponent<Float>();
            art.gameObject.AddComponent<Button>().onClick.AddListener(() =>
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
        float lw = 112 * Z, lh = lw * 1.4f, gap = 34 * Z;
        var tiles = new List<System.Action<RectTransform>>();
        if (l.Materials > 0) tiles.Add(r => LootToken(r, "loot-materials", $"+{l.Materials}", lw));
        if (l.Petals > 0) tiles.Add(r => LootToken(r, "loot-petal", $"+{l.Petals}", lw));
        foreach (var rel in l.Relics ?? new List<Relic>()) tiles.Add(r => Token(r, "✧", rel.Name.ToLowerInvariant(), Heroes.RelicText(rel)));
        foreach (var id in l.Cards ?? new List<string>()) tiles.Add(r => { LootGlow(r, lw, lh, lw * 1.2f); CardPick(r, id, Vector2.zero, lw, false, null); });
        foreach (var id in l.Parts ?? new List<string>()) tiles.Add(r => LootPart(r, id, lw));
        int count = tiles.Count, split = count > 3 ? (count + 1) / 2 : count;
        int rows = count > split ? 2 : 1;
        float xpH = l.Xp > 0 ? 33 + 4 * Z + 4 * Z : 0, itemsH = 2 * 20 * Z + rows * lh + (rows - 1) * gap, takeH = 0.66f * 16 * Z * 1.25f + 2 * 9 * Z;
        float total = xpH + itemsH + 4 * Z + 6 * Z + takeH, y = 500 - total / 2;
        if (l.Xp > 0)
        {
            XpGauge(v, y, l.Xp, t0);
            y += xpH;
        }
        y += 20 * Z;
        int first = l.Xp > 0 ? 1 : 0;
        for (int i = 0; i < count; i++)
        {
            int row = i < split ? 0 : 1, j = row == 0 ? i : i - split, n = row == 0 ? split : count - split;
            float at = j - (n - 1) / 2f;
            float cx = 800 + at * (lw + gap) + (row == 1 ? lw * 0.3f : 0);
            float cy = y + row * (lh + gap) + lh / 2 + at * at * 7 * Z;
            var slot = WebLook.Centred(v, "Reward", cx, cy, lw, lh);
            slot.localRotation = Quaternion.Euler(0, 0, -((i % 2 == 1 ? 1 : -1) * (2 + i % 3)));
            tiles[i](slot);
            RiseIn.On(slot, t0, 0.45f + (i + first) * 0.42f);
        }
        y += itemsH - 20 * Z + 4 * Z + 6 * Z;
        var ok = WebButton(v, "take it", () => { lootOpen = false; Act(new CampaignAction { Type = "dismissLoot" }, "buy"); }, true, 800, y);
        WebLook.Box((RectTransform)ok.transform, 800 - (((RectTransform)ok.transform).sizeDelta.x) / 2, y, ((RectTransform)ok.transform).sizeDelta.x, takeH);
        RiseIn.On((RectTransform)ok.transform, t0, 0.45f + (count + first) * 0.42f + 0.2f);
    }

    /// <summary>The experience a loot brought (campaign.ts xpGauge): LEVEL and the level, its bar filling in gold, +XP.</summary>
    void XpGauge(RectTransform v, float y, int gained, float t0)
    {
        var meta = LoadMeta();
        var now = Meta.LevelFor(meta.Xp + Mathf.Max(0, (state.Xp ?? 0) - (state.XpBanked ?? 0)));
        var g = WebLook.Box(v, "Experience", 0, y, 1600, 33);
        var lv = WebLook.Words(Hud.Rect(g, "Level"), "LEVEL", 0.7f * 16 * Z, 0.12f, Look.InkSoft, true, 400, TextAlignmentOptions.Left);
        var n = WebLook.Words(Hud.Rect(g, "N"), now.Level.ToString(), 1.15f * 16 * Z, 0.12f, Look.Ink, true, 700, TextAlignmentOptions.Left);
        var gain = WebLook.Words(Hud.Rect(g, "Gain"), $"+{gained} XP", 0.8f * 16 * Z, 0.12f, WebLook.Hex("#9a7429"), true, 400, TextAlignmentOptions.Left);
        float lw = lv.GetPreferredValues(lv.text).x, nw = n.GetPreferredValues(n.text).x, gw = gain.GetPreferredValues(gain.text).x, bar = 260 * Z, gap = 12 * Z;
        float w = lw + 4 * Z + nw + gap + bar + gap + gw, x = 800 - w / 2;
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
        RiseIn.On(g, t0, 0.45f);
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
        float s = 128 * Z;
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

    static void Token(RectTransform r, string mark, string big, string small)
    {
        var m = Hud.Label(r, mark, 54, Gold, false, 400, 0, TextAlignmentOptions.Top);
        m.margin = new Vector4(0, 30, 0, 0);
        var b = Hud.Label(r, big.ToUpperInvariant(), 0.62f * 16 * Z, Look.Ink, true, 700, 12, TextAlignmentOptions.Top);
        b.textWrappingMode = TextWrappingModes.Normal;
        b.margin = new Vector4(8, 116, 8, 0);
        var s = Hud.Label(r, small, 0.72f * 16 * Z, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
        s.textWrappingMode = TextWrappingModes.Normal;
        s.margin = new Vector4(10, 150, 10, 0);
    }

    // ---- Choices ----

    /// <summary>A new card to choose (renderOverlay's card reward): the cards in a row, skip or confirm under them.</summary>
    void CardReward(CardReward reward)
    {
        if (cardPick != null && !reward.Options.Contains(cardPick)) cardPick = null;
        Modal($"★ {reward.Source.ToLowerInvariant()} · choose a new card", body =>
        {
            int n = reward.Options.Count;
            float cw = 155, gap = 10 * Z, bw = body.sizeDelta.x, rw = n * cw + (n - 1) * gap;
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
            float cw = 155, gap = 10 * Z, rw = offers.Count * cw + (offers.Count - 1) * gap;
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

    /// <summary>Aster's gift: one of the Seren's three emblems, each its mark, its name and what it does.</summary>
    void Emblems()
    {
        Modal("aster’s gift · choose an emblem", body =>
        {
            var list = state.EmblemChoice;
            float tw = 150 * Z * 0.8f, gap = 18 * Z, bw = body.sizeDelta.x, rw = list.Count * tw + (list.Count - 1) * gap;
            for (int i = 0; i < list.Count; i++)
            {
                int index = i;
                var rel = list[i];
                var r = WebLook.Box(body, rel.Name, (bw - rw) / 2 + i * (tw + gap), 8 * Z, tw, 240);
                var hit = r.gameObject.AddComponent<Image>();
                hit.color = new Color(1, 1, 1, 0);
                LootGlow(r, tw, 120, tw * 0.62f);
                Token(r, "✧", rel.Name.ToLowerInvariant(), Heroes.RelicText(rel));
                r.gameObject.AddComponent<Button>().onClick.AddListener(() => Act(new CampaignAction { Type = "chooseEmblem", Index = index }, "upgrade"));
            }
            return 8 * Z + 240 + 4 * Z;
        });
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
        float face = 140 * Z, gap = 12 * Z, kH = 0.66f * 16 * Z * 1.25f, nH = 2 * 16 * Z * 0.9f * 1.26f, lH = line != null ? 1.1f * 16 * Z * 1.5f : 0;
        float total = face + gap + kH + gap + nH + (line != null ? gap + lH : 0) + gap + 6 * Z + actionsH, y = 500 - total / 2;
        var f = Face(v, hero, 800, y + face / 2, face, WebLook.Hex("#1a1f2a"), (3 * Z, Color.white), (5 * Z, rust));
        var glow = WebLook.Rounded(f, "Glow", new Color(rust.r, rust.g, rust.b, 0.35f), 999);
        glow.sprite = Hud.Soft;
        glow.type = Image.Type.Sliced;
        glow.pixelsPerUnitMultiplier = 41f / (face / 2 + 40 * Z);
        Hud.Fill(glow.rectTransform);
        glow.rectTransform.offsetMin = new Vector2(-40 * Z, -40 * Z - 10 * Z);
        glow.rectTransform.offsetMax = new Vector2(40 * Z, 40 * Z - 10 * Z);
        glow.transform.SetAsFirstSibling();
        RiseIn.On(f, t0, 0);
        y += face + gap;
        WebLook.Words(WebLook.Box(v, "Kicker", 0, y, 1600, kH), kicker.ToUpperInvariant(), 0.66f * 16 * Z, 0.32f, rust, true, 400);
        y += kH + gap;
        WebLook.Words(WebLook.Box(v, "Name", 0, y, 1600, nH), Cards.Def(hero).Name.ToUpperInvariant(), 2 * 16 * Z * 0.9f, 0.24f, Look.Ink, true, 400);
        y += nH;
        if (line != null)
        {
            y += gap;
            var said = WebLook.Words(WebLook.Box(v, "Line", 800 - 17 * 1.1f * 16 * Z, y, 34 * 1.1f * 16 * Z, lH), $"“{line}”", 1.1f * 16 * Z, 0, Look.InkSoft, false, 400);
            said.fontStyle = FontStyles.Italic;
            said.textWrappingMode = TextWrappingModes.Normal;
            RiseIn.On(said.rectTransform, t0, 0.4f);
            y += lH;
        }
        y += gap + 6 * Z;
        var acts = WebLook.Box(v, "Actions", 0, y, 1600, actionsH);
        actions(acts, actionsH);
        RiseIn.On(acts, t0, 1);
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
    /// A scene with the ship in it (campaign.ts scene, .enc): its kind small and its title in spaced capitals at the top,
    /// over the ship; the talk at the foot, 720 (CSS) across: each line its speaker's face (the visitor's none, set in,
    /// in italics), their name small over their words; a note; the choices under them, coming in one after another.
    /// </summary>
    void ShipScene(string kicker, string title, List<(string who, string text)> lines, System.Action<RectTransform> actions, string note = null, Transform parent = null, System.Func<RectTransform, float, float> body = null, string visitor = null)
    {
        float from = RevealFrom(kicker + "|" + title + "|" + string.Join("|", lines.Select(l => l.who + ":" + l.text)));
        var v = Hud.Rect(parent ?? overlay, "Scene");
        Hud.Fill(v);
        v.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0);
        var head = WebLook.Box(v, "Head", 0, 14 * Z, 1600, 52);
        WebLook.Words(WebLook.Box(head, "Kicker", 0, 0, 1600, 14), kicker.ToUpperInvariant(), 0.5f * 16 * Z, 0.24f, Look.InkSoft, false, 400);
        WebLook.Words(WebLook.Box(head, "Title", 0, 17, 1600, 35), title.ToUpperInvariant(), 1.2f * 16 * Z, 0.2f, Look.Ink, true, 400);
        RiseIn.On(head, from, 0);
        const float W = 720 * Z, X = 800 - 720 * Z / 2;
        float fs = 0.98f * 16 * Z, lh = fs * 1.45f, textX = 44 * Z, textW = W - textX;
        // (From the foot up: the choices, the note, then the lines, the last nearest them.)
        float y = 1000 - 14 * Z;
        float actsH = 4 * Z + 0.66f * 16 * Z * 1.25f + 2 * 9 * Z;
        y -= actsH;
        var acts = WebLook.Box(v, "Actions", 0, y + 4 * Z, 1600, actsH - 4 * Z);
        actions(acts);
        RiseIn.On(acts, from, LineDelay(lines.Count(l => l.who != "found" && l.who != "damage")));
        if (note != null)
        {
            float nh = 0.72f * 16 * Z * 1.25f;
            y -= 10 * Z + nh;
            var n = WebLook.Words(WebLook.Box(v, "Note", X, y, W, nh), note, 0.72f * 16 * Z, 0.08f, Look.InkSoft, false, 400);
            RiseIn.On(n.rectTransform, from, 1.6f);
        }
        if (body != null)
        {
            // (What the scene offers, between its talk and its choices: laid out by `body`, which says how tall it is.)
            var mid = WebLook.Box(v, "Offers", X, 0, W, 10);
            float mh = body(mid, from);
            y -= 10 * Z + mh;
            WebLook.Box(mid, X, y, W, mh);
        }
        y -= 10 * Z;
        for (int i = lines.Count - 1; i >= 0; i--)
        {
            var (who, text) = lines[i];
            if (who == "found" || who == "damage")
            {
                // (What came of it, a part found or a slot wrecked: .enc-result, with the first line.)
                var part = who == "found" ? Parts.ShipPart(state.Encounter?.Part) : null;
                float rh = (part != null ? 84 * Z + 4 * Z : 0) + 0.78f * 16 * Z * 1.25f + 4 * Z + 0.78f * 16 * Z * 1.3f;
                y -= rh;
                var res = WebLook.Box(v, "Result", X, y, W, rh);
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
                RiseIn.On(res, from, 0.9f);
                y -= 10 * Z;
                continue;
            }
            bool them = who == "visitor";
            var p = WebLook.Words(Hud.Rect(v, "Words"), text, fs, 0, Look.Ink, false, 400, TextAlignmentOptions.TopLeft);
            p.textWrappingMode = TextWrappingModes.Normal;
            if (them) p.fontStyle = FontStyles.Italic;
            p.lineSpacing = (1.45f - 1.26f) * 100 / 1.26f;
            float ph = p.GetPreferredValues(text, textW, 0).y;
            float h = 0.48f * 16 * Z * 1.2f + 1 * Z + ph;
            y -= h;
            var line = WebLook.Box(v, "Line", X, y, W, h);
            p.transform.SetParent(line, false);
            var card = SpeakerCard(who);
            if (card != null) Face(line, card, 17 * Z, 17 * Z, 34 * Z, WebLook.Hex("#1a1f2a"));
            WebLook.Words(WebLook.Box(line, "Who", textX, 0, textW, 0.48f * 16 * Z * 1.2f), SpeakerName(who, visitor ?? title).ToUpperInvariant(), 0.48f * 16 * Z, 0.2f, Look.InkSoft, false, 400, TextAlignmentOptions.Left);
            WebLook.Box(p.rectTransform, textX, 0.48f * 16 * Z * 1.2f + 1 * Z, textW, ph + 2);
            RiseIn.On(line, from, LineDelay(i));
            y -= 8 * Z;
        }
    }

    /// <summary>
    /// A row of the web's buttons, centred, 10 (CSS) apart (primary or plain; held back, faded); and, if asked, the
    /// purse after them: the materials token and how many.
    /// </summary>
    void Buttons(RectTransform row, params (string label, bool primary, string why, System.Action act)[] bs) => Buttons(row, -1, bs);

    void Buttons(RectTransform row, int purse, params (string label, bool primary, string why, System.Action act)[] bs)
    {
        float h = row.sizeDelta.y, gap = 10 * Z;
        var made = new List<RectTransform>();
        float total = 0;
        foreach (var (label, primary, why, act) in bs)
        {
            var b = WebButton(row, label.Replace("⬢", "").ToLowerInvariant(), () => act(), primary, 0, 0, why == null);
            var r = (RectTransform)b.transform;
            made.Add(r);
            total += r.sizeDelta.x;
        }
        TextMeshProUGUI count = null;
        if (purse >= 0)
        {
            count = WebLook.Words(Hud.Rect(row, "Purse"), purse.ToString(), 0.8f * 16 * Z, 0, Look.InkSoft, false, 700, TextAlignmentOptions.Left);
            total += 20 + 4 * Z + count.GetPreferredValues(count.text).x;
        }
        total += gap * (made.Count - (purse >= 0 ? 0 : 1));
        float x = 800 - total / 2;
        foreach (var r in made)
        {
            WebLook.Box(r, x, (h - r.sizeDelta.y) / 2, r.sizeDelta.x, r.sizeDelta.y);
            x += r.sizeDelta.x + gap;
        }
        if (count != null)
        {
            var mark = WebLook.Centred(row, "Materials", x + 10, h / 2, 20, 20).gameObject.AddComponent<RawImage>();
            mark.texture = Resources.Load<Texture2D>("Icons/purse-materials");
            mark.raycastTarget = false;
            WebLook.Box(count.rectTransform, x + 20 + 4 * Z, 0, count.GetPreferredValues(count.text).x + 4, h);
        }
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
        if (e.Part != null) closing.Insert(0, ("found", ""));
        else if (e.Outcome == "bad" && e.Slot != null) closing.Insert(0, ("damage", ""));
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
        RiseIn.On(v, t0, 0);
        RiseIn.On(t.rectTransform, t0, 1.2f);
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
        foreach (var c in sheetRoot.Cast<Transform>().ToList()) if (c != null) Mats.Kill(c.gameObject);
    }

    void Ask(string title, string words, (string label, System.Action act) yes)
    {
        CloseSheet();
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
        Modal("settings", body =>
        {
            float h = SetList(body, 0,
                new SetRow("sound", () => { Sound.Muted = !Sound.Muted; Settings(); }, value: Sound.Muted ? "off" : "on"),
                new SetRow("music", Sound.Muted ? (System.Action)null : () => { Sound.MusicOn = !Sound.MusicOn; Settings(); }, value: Sound.MusicOn && !Sound.Muted ? "on" : "off"),
                new SetRow("ai speed", () => { BattleView.NextSpeed(); Settings(); }, value: BattleView.Speed),
                new SetRow("campaign log", Log),
                new SetRow("main menu", () => App.Instance.Menu("hub")));
            var note = WebLook.Words(WebLook.Box(body, "Note", 0, h + 12 * Z, body.sizeDelta.x, 0.7f * 16 * Z * 1.4f), "Your run is saved; continue it from the main menu.", 0.7f * 16 * Z, 0, Look.InkFaint, false, 400);
            note.raycastTarget = false;
            return h + 12 * Z + 0.7f * 16 * Z * 1.4f;
        }, 620 * Z, sheetRoot, CloseSheet);
    }

    /// <summary>The campaign's log (renderOverlay's log sheet): what has happened, a line each, the latest last.</summary>
    void Log()
    {
        CloseSheet();
        var lines = state.Log.Skip(Mathf.Max(0, state.Log.Count - 24)).Select(l => l.Text);
        Modal("campaign log", body =>
        {
            var t = WebLook.Words(body, string.Join("\n", lines), 0.8f * 16 * Z, 0, Look.InkSoft, false, 400, TextAlignmentOptions.TopLeft);
            t.textWrappingMode = TextWrappingModes.Normal;
            float h = Mathf.Min(620, t.GetPreferredValues(t.text, body.sizeDelta.x, 0).y);
            WebLook.Box(t.rectTransform, 0, 0, body.sizeDelta.x, h);
            t.overflowMode = TextOverflowModes.Truncate;
            return h;
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
