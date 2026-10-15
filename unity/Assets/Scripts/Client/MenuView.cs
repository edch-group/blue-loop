using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The menu (app.ts renderMenu): the title page, the hub (the five ways to play, the shop, collection and glossary
/// along the top, you and your options in the corner), quickplay's setup (your deck and your rival's), the shop and
/// your profile.
/// </summary>
public class MenuView : MonoBehaviour
{
    Camera cam;
    Canvas canvas;
    RectTransform page;
    /// <summary>The page's layer pinned to the safe area's corners (the hub's links and corner buttons).</summary>
    RectTransform edges;
    string current;
    GameObject backdrop;
    CampaignBackdrop scene;
    // Quickplay's seats: whose deck, and whether the AI plays it.
    readonly string[] seatDeck = new string[2];
    readonly bool[] seatAI = { false, true };

    public static MenuView Make(Camera cam, string page)
    {
        var v = new GameObject("Menu").AddComponent<MenuView>();
        v.cam = cam;
        v.canvas = Hud.Canvas(cam);
        v.canvas.transform.SetParent(v.transform, false);
        v.Background();
        v.Show(page);
        Sound.Scene("voyage");
        return v;
    }

    /// <summary>The page's own light: white at the top, settling to paper and a soft grey at the foot.</summary>
    void Background()
    {
        backdrop = new GameObject("Backdrop", typeof(RectTransform));
        backdrop.transform.SetParent(canvas.transform, false);
        Hud.Fill((RectTransform)backdrop.transform);
        var bg = Hud.Rect(backdrop.transform, "Background");
        Hud.Fill(bg);
        var img = bg.gameObject.AddComponent<RawImage>();
        var t = new Texture2D(4, 64, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        for (int y = 0; y < 64; y++)
        {
            float k = y / 63f;
            var c = k > 0.45f ? Color.Lerp(Look.Paper, new Color(0.98f, 0.98f, 0.965f), (k - 0.45f) / 0.55f) : Color.Lerp(Look.Back, Look.Paper, k / 0.45f);
            for (int x = 0; x < 4; x++) t.SetPixel(x, y, c);
        }
        t.Apply();
        img.texture = t;
        img.raycastTarget = false;
        // The Stellari behind it all (art.ts petalBackdrop, backdrop.ts): its glow from the top, and its two rings of
        // petals, low and wide, turning slowly (one turn in three minutes; the inner ring at 0.6 of it). Framed as the
        // web frames it: its 1000 x 900 across the screen's width, its heart 752 down.
        // (In a frame of the page's own, scaled and centred as the page is, so the Stellari's heart stays under its title.)
        var stage = Hud.Rect(backdrop.transform, "Stage");
        Frame.Make(stage);
        var glow = Hud.Rect(stage, "Glow");
        var rings = Hud.Rect(glow, "Rings");
        Hud.At(glow, new Vector2(0.5f, 1), Vector2.zero, new Vector2(1600, 1440));
        var gi = glow.gameObject.AddComponent<RawImage>();
        gi.texture = Pictures.Load("Icons/mandala-glow");
        gi.raycastTarget = false;
        Hud.At(rings, new Vector2(0.5f, 1), new Vector2(0, -752), Vector2.zero);
        rings.pivot = new Vector2(0.5f, 0.5f);
        foreach (var layer in new[] { "outer", "inner" })
        {
            var r = Hud.Rect(rings, layer);
            Hud.At(r, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1088, 1088));
            r.pivot = new Vector2(0.5f, 0.5f);
            var ri = r.gameObject.AddComponent<RawImage>();
            ri.texture = Pictures.Load("Icons/mandala-" + layer);
            ri.raycastTarget = false;
            if (layer == "outer") outerRing = r;
            else innerRing = r;
        }
    }

    RectTransform outerRing, innerRing;
    float ringAngle;

    void TurnRings()
    {
        // (Clockwise, as the web turns it: two degrees a second.)
        ringAngle = (ringAngle + 2 * Time.deltaTime) % 1800;
        if (outerRing != null) outerRing.localRotation = Quaternion.Euler(0, 0, -ringAngle);
        if (innerRing != null) innerRing.localRotation = Quaternion.Euler(0, 0, -ringAngle * 0.6f);
    }

    /// <summary>
    /// The game's name as the title block draws it (app.ts: the pearl sun over BLUE LOOP), from its baked picture: the
    /// sun and the words placed and sized apart, as the title page and the hub each have them.
    /// </summary>
    void TitleBlock(float wordsY, float wordsWidth) => TitleBlock(page, wordsY, wordsWidth);

    public void TitleBlock(Transform parent, float wordsY, float wordsWidth)
    {
        // (The picture, 2752 x 1028: the sun and its glow above, the words in rows 800 to 925, 1116 across, both
        // centred; drawn whole, so the glow is never cut.)
        float k = wordsWidth / 1116f;
        var block = Hud.Rect(parent, "Title");
        Hud.At(block, new Vector2(0.5f, 1), new Vector2(0, -wordsY + 862 * k), new Vector2(2752 * k, 1028 * k));
        block.pivot = new Vector2(0.5f, 1);
        var bi = block.gameObject.AddComponent<RawImage>();
        bi.texture = Resources.Load<Texture2D>("Icons/title");
        bi.raycastTarget = false;
    }


    public void Show(string name)
    {
        if (page != null) Mats.Kill(page.gameObject);
        page = Hud.Rect(canvas.transform, name);
        // (Drawn whole on any screen, inside its safe area: see Frame.)
        edges = Frame.Make(page).Edges;
        current = name;
        // (The campaign's page over its own scene: the land, the ship on it.)
        bool campaign = name == "campaign" || name == "captain" || name == "hangar";
        backdrop.SetActive(!campaign);
        // (The skill tree lies on the page's own paper, without the hub's glow.)
        backdrop.transform.Find("Stage/Glow")?.gameObject.SetActive(name != "stellari");
        if (campaign && scene == null) scene = CampaignBackdrop.Make(cam, transform);
        if (!campaign && scene != null) { Mats.Kill(scene.gameObject); scene = null; }
        if (scene != null) scene.Focus(name == "captain" || name == "hangar" ? name : null);
        switch (name)
        {
            case "hub": Hub(); break;
            case "quickplay": Quickplay(); break;
            case "options": Options(); break;
            case "pickdeck": PickDeck(); break;
            case "collection": BuilderView.Make(page, this); break;
            case "shop": ShopView.Make(page, this); break;
            // (A starter open in the builder, as its screenshot shows it.)
            case "deck": BuilderView.Make(page, this, Decks.Presets[0]); break;
            case "glossary": GlossaryView.Make(page, this); break;
            case "online": OnlineView.Make(page, this); break;
            case "signin": AccountView.Make(page, this); break;
            case "tutorial": TutorialView.Make(page, this); break;
            case "challenges": ChallengesView.Make(page, this); break;
            case "campaign": CampaignMenu(); break;
            case "stellari": StellariView.Make(page, this); break;
            case "captain": CrewView.Make(page, this, scene); break;
            case "hangar": HangarView.Make(page, this, scene); break;
            default: Title(); break;
        }
    }

    static RawImage Picture(Transform parent, string resource, Vector2 anchor, Vector2 at, Vector2 size)
    {
        var r = Hud.Rect(parent, resource);
        Hud.At(r, anchor, at, size);
        var img = r.gameObject.AddComponent<RawImage>();
        img.texture = Resources.Load<Texture2D>(resource);
        img.raycastTarget = false;
        return img;
    }

    // ---- The title page: the logo and a start button ----

    void Title()
    {
        // (As the web's: the sun 190 across at 310 down, the words 815 across at 492; start, its primary button,
        // 261 by 61 at 612, its word 18.6 bold spaced 0.3em.)
        TitleBlock(492, 815);
        var start = Hud.Primary(page, "Start", Begin, 18.6f, 30);
        Hud.Place((RectTransform)start.transform, 669.5f, 612.5f, 261, 60.8f);
        Studio();
    }

    /// <summary>
    /// Start: on to the hub, or into the room an invite link named; first, where there is a server, signing in (everyone
    /// plays with an account) and naming yourself.
    /// </summary>
    void Begin()
    {
        var invite = Online.TakeInvite();
        if (AccountView.Needed)
        {
            AccountView.Begin();
            AccountView.ThenRoom = invite;
            Show("signin");
            return;
        }
        if (invite != null)
        {
            Show("online");
            Online.Go(invite);
            return;
        }
        Show("hub");
    }

    void Studio()
    {
        // (The web's .studio: 11.6 across, spaced 0.3em, ink-faint, its line 970 to 985 down.)
        Hud.Text(page, "CORONAL MASS GAMES", 0, 970.5f, 1600, 15, 11.6f, Look.InkFaint, true, 400, 30);
    }

    // ---- The hub ----

    void Hub()
    {
        // (As the web's hub: the sun 80 across at 276 down, the words 390 across at 362, the five ways under them.)
        TitleBlock(362, 390);
        // Shop, collection and glossary as plain links, top left (the web's .hub-link: its mark 31.9 across, then 10
        // on, its name in 14.8 bold spaced 0.2em; the links 26 in, their middles 51 down, 38.4 apart).
        var links = new[] { ("shop", "Shop"), ("collection", "Collection"), ("glossary", "Glossary") };
        float linkX = 26.1f;
        for (int i = 0; i < links.Length; i++)
        {
            var (icon, name) = links[i];
            float nameW = Hud.Wide(name.ToUpperInvariant(), 14.8f, 700, 20, 0);
            float linkW = 2.9f + 31.9f + 10.2f + nameW + 2.9f;
            var r = Hud.Rect(edges, name);
            Hud.Place(r, linkX, 29, linkW, 43.5f);
            linkX += linkW + 38.4f;
            var b = r.gameObject.AddComponent<Button>();
            var hit = r.gameObject.AddComponent<Image>();
            hit.color = new Color(1, 1, 1, 0);
            b.targetGraphic = hit;
            // (The shop needs the server, as online play does.)
            b.onClick.AddListener(() => { Sound.Play("click"); if (icon == "shop" && !Net.Available) Toast("Offline."); else Show(icon); });
            Picture(r, $"Icons/{icon}-small", new Vector2(0, 0.5f), new Vector2(2.9f, 0), new Vector2(31.9f, 31.9f));
            var t = Hud.Label(r, name.ToUpperInvariant(), 14.8f, Look.Ink, true, 700, 20, TextAlignmentOptions.Left);
            t.margin = new Vector4(45, 0, 0, 0);
        }
        // You, then options and full screen: white pills top right (the web's .hub-corner: 57 tall, 8 apart).
        Chip(edges, new Vector2(-180.9f, -17.4f));
        RoundButton(edges, new Vector2(-103.3f, -17.4f), "Icons/options-small", () => Show("options"));
        RoundButton(edges, new Vector2(-26.1f, -17.4f), Screen.fullScreen ? "Icons/hud-exit-fullscreen" : "Icons/hud-fullscreen", () => { Screen.fullScreen = !Screen.fullScreen; });

        // The five ways to play.
        var tiles = new[] { ("campaign", "A dying universe"), ("quickplay", "Quickplay"), ("online", "Online"), ("tutorial", "Tutorial"), ("challenges", "Challenges") };
        // (The web's .hub-card: 217.5 by 228.4, 246.5 apart, their tops 422.7 down; corners 23.2; its two shadows. Its
        // mark 60.9 across over its name (18.1 bold, spaced 0.2em), 17.4 between, the two centred in the card.)
        float w = 217.5f, h = 228.4f, step = 246.5f;
        for (int i = 0; i < tiles.Length; i++)
        {
            var (icon, name) = tiles[i];
            bool offline = icon == "online" && !Net.Available;
            var tile = Hud.Box(page, name, Hud.Rgba(250, 250, 249), 23.2f);
            Hud.Place((RectTransform)tile.transform, 198.3f + i * step, 422.7f, w, h);
            Hud.Shadow(tile, 23.2f, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.14f), 20.3f, 49.3f), new Hud.Drop(Hud.Rgba(80, 84, 100, 0.08f), 2.9f, 8.7f));
            tile.raycastTarget = true;
            var b = tile.gameObject.AddComponent<Button>();
            var colors = b.colors;
            colors.highlightedColor = new Color(0.99f, 0.99f, 1f);
            colors.pressedColor = new Color(0.95f, 0.96f, 0.98f);
            colors.disabledColor = new Color(1, 1, 1, 0.45f);
            b.colors = colors;
            // (Online play needs the server: without one its tile reads offline, faded.)
            b.interactable = !offline;
            string target = icon;
            b.onClick.AddListener(() =>
            {
                Sound.Play("click");
                if (target == "quickplay" || target == "tutorial" || target == "challenges" || target == "campaign" || target == "online") Show(target);
                else Soon(name);
            });
            string shown = (offline ? "offline" : name).ToUpperInvariant();
            // (Two lines when the name is wider than the card's inside.)
            bool twoLines = Hud.Wide(shown, 18.1f, 700, 20, 0) > w - 2 * 15.5f;
            float nameH = twoLines ? 44 : 22, top = (h - (60.9f + 17.4f + nameH)) / 2;
            var pic = Picture(tile.transform, $"Icons/{icon}", new Vector2(0.5f, 1), new Vector2(0, -top), new Vector2(60.9f, 60.9f));
            if (offline) pic.color = new Color(1, 1, 1, 0.45f);
            var t = Hud.Label(tile.transform, shown, 18.1f, Look.Ink, true, 700, 20);
            Hud.At(t.rectTransform, new Vector2(0.5f, 1), new Vector2(0, -(top + 60.9f + 17.4f)), new Vector2(w - 31, nameH));
            t.textWrappingMode = TextWrappingModes.Normal;
            t.lineSpacing = -6;
            if (offline) t.alpha = 0.45f;
            // (A run or a game against the AI left part way: continue it, a small button 11.6 under its card.)
            System.Action cont = target == "campaign" && CampaignView.HasSave ? () => App.Instance.Run(CampaignView.Saved())
                : target == "quickplay" && BattleView.HasSave ? () => App.Instance.Continue() : (System.Action)null;
            if (cont != null)
            {
                float cw = Hud.Wide("CONTINUE", 13, 500, 14, 15.5f);
                var c = Hud.Btn(page, "Continue", cont);
                Hud.Place((RectTransform)c.transform, 198.3f + i * step + (w - cw) / 2, 422.7f + h + 11.6f, cw, 38.3f);
            }
        }
        Studio();
    }

    // ---- Quickplay: the game mode, then two seats, each a deck and who plays it ----

    static readonly string[] BotNames = { "Unit Parhelion", "Kepler-9", "Null Vector", "Coronabot", "Tycho Engine", "Sentinel K4", "Orrery", "Halo Mk II", "Lagrange", "Umbra-7", "Perihelion", "Quasar Drone", "Brightwire", "Heliostat", "Ember Logic", "Cold Fusion" };
    readonly string[] seatBot = new string[2];
    const string PlayModeKey = "blue-loop:play-mode";
    /// <summary>The mode quickplay and online games are played in (the decks on offer are that mode's).</summary>
    public static string PlayMode => Store.Get(PlayModeKey) == "lost" ? "lost" : "core";
    /// <summary>Choosing a deck: for which seat, and the page to go back to.</summary>
    int pickSeat;
    string pickFrom = "quickplay";

    static string BotName(string not = null)
    {
        var pool = BotNames.Where(n => n != not).ToList();
        return pool[UnityEngine.Random.Range(0, pool.Count)];
    }

    /// <summary>The decks a seat can take in the mode played: its starters (as the battle plays them).</summary>
    static List<Decks.Saved> ModeDecks() => Decks.Presets.Where(d => d.Mixed != true && Modes.ModeOf(d) == PlayMode).ToList();

    /// <summary>A seat's deck, if it is one of the mode's (else that mode's starter for the seat).</summary>
    public Decks.Saved SeatDeck(int seat)
    {
        var decks = ModeDecks();
        return decks.FirstOrDefault(d => d.Name == seatDeck[seat]) ?? decks[seat % decks.Count];
    }

    void Quickplay()
    {
        ModePane("quickplay");
        SetupTop(page, "quickplay", () => Show("hub"), PaneW);
        // (The web's .seat-row: two seats 436.5 by 435, 26.1 apart, centred on the page beside the pane.)
        for (int seat = 0; seat < 2; seat++)
        {
            int s = seat;
            if (seatAI[s] && seatBot[s] == null) seatBot[s] = BotName(seatBot[1 - s]);
            string name = seatAI[s] ? seatBot[s] : s == 0 ? (string.IsNullOrEmpty(Profile.Me.Name) ? "Commander" : Profile.Me.Name) : "Player 2";
            var panel = SeatPanel(page, 541.9f + s * 462.5f, 283.8f, name, seatAI[s] ? "ai" : "human", () =>
            {
                seatAI[s] = !seatAI[s];
                if (seatAI[s]) seatBot[s] = BotName(seatBot[1 - s]);
                Show("quickplay");
            });
            SeatDecks(panel, s);
        }
        // Launch: the primary button, 232 by 52.9, its word spaced 0.24em, at the page's foot.
        var launch = Hud.Primary(page, "Launch", () =>
        {
            App.Instance.Battle(SeatDeck(0).Name, SeatDeck(1).Name);
        }, 15.3f, 24);
        Hud.Place((RectTransform)launch.transform, 875.4f, 909.7f, 232, 52.9f);
    }

    /// <summary>
    /// A seat (the web's .qp-seat) at (x, y), w by h: white fading to #f6f6f4, corners 23.2, two soft shadows; at its
    /// head its player's name (20.9, spaced 0.16em) and beside it who plays it, a small pill (`mode`), or a word on
    /// where they stand (`tag`, the web's .ready-tag: green once `tagOn`). No name: the bare seat.
    /// </summary>
    public RectTransform SeatPanel(Transform parent, float x, float y, string name, string mode, System.Action flip, string tag = null, bool tagOn = false, float w = 436.5f, float h = 435)
    {
        var panel = Hud.Box(parent, "Seat", Hud.Rgba(251, 251, 250), 23.2f);
        Hud.Place((RectTransform)panel.transform, x, y, w, h);
        Hud.Shadow(panel, 23.2f, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.12f), 17.4f, 43.5f), new Hud.Drop(Hud.Rgba(80, 84, 100, 0.07f), 2.9f, 8.7f));
        var r = (RectTransform)panel.transform;
        if (name == null) return r;
        string shown = name.ToUpperInvariant();
        float nameW = Mathf.Min(w - 200, Hud.Wide(shown, 20.9f, 400, 16, 0));
        float pillW = mode != null ? Hud.Wide(mode.ToUpperInvariant(), 11.6f, 500, 14, 15.2f) : tag != null ? Hud.Wide(tag.ToUpperInvariant(), 13, 400, 16, 14.5f) : 0;
        float all = nameW + (pillW > 0 ? 14.5f + pillW : 0), left = (w - all) / 2;
        var nl = Hud.Text(r, shown, left, 27, nameW + 2, 26, 20.9f, Look.Ink, true, 400, 16, TextAlignmentOptions.Left);
        nl.overflowMode = TextOverflowModes.Ellipsis;
        if (mode != null)
        {
            var b = Hud.Btn(r, mode, flip, 11.6f, 12.85f);
            Hud.Place((RectTransform)b.transform, left + nameW + 14.5f, 27.2f, pillW, 25.7f);
        }
        else if (tag != null)
        {
            var t = Hud.Box(r, "Tag", tagOn ? Hud.Rgba(102, 179, 133) : Hud.Rgba(120, 124, 134, 0.08f), 12.35f);
            Hud.Place((RectTransform)t.transform, left + nameW + 14.5f, 27.6f, pillW, 24.7f);
            if (tagOn) Hud.Shadow(t, 12.35f, new Hud.Drop(Hud.Rgba(110, 196, 146, 0.45f), 0, 17.4f));
            Hud.Label(t.transform, tag.ToUpperInvariant(), 13, tagOn ? Color.white : Look.InkFaint, true, 400, 16);
        }
        return r;
    }

    /// <summary>
    /// A seat's deck as a deck box (tap it to choose another; `bw` across, its top `y` down the seat) and, `linkY` down,
    /// every deck a tap away.
    /// </summary>
    public void SeatDecks(RectTransform panel, int seat, float y = 119.7f, float bw = 133.4f, float linkY = 379.3f)
    {
        System.Action pick = () => { pickSeat = seat; pickFrom = current; Show("pickdeck"); };
        float w = panel.sizeDelta.x;
        BuilderView.DeckBoxMini(panel, (w - bw) / 2, y, SeatDeck(seat), true, pick, bw);
        var link = Hud.Link(panel, "view decks", pick);
        Hud.Place((RectTransform)link.transform, (w - 132) / 2, linkY, 132, 28.6f);
    }

    public const float PaneW = 362.5f;

    /// <summary>
    /// The game mode in a pane down the left (glyphs.ts modeCards): frosted glass, a fine edge; at its top the way
    /// back, beneath it the two modes as full-height pictures (baked from the web: the picked one in colour with a
    /// white edge, the other grey), sharing the rest of the pane. Tapping one plays that mode.
    /// </summary>
    public void ModePane(string from, Transform parent = null)
    {
        var pane = Hud.Box(parent ?? page, "Modes", new Color(1, 1, 1, 0.62f), 0.5f);
        Hud.Place((RectTransform)pane.transform, 0, 0, PaneW, 1000);
        Hud.Shadow(pane, 0.5f, new Hud.Drop(Hud.Rgba(150, 156, 172, 0.22f), 0, 0, 0, 1.4f), new Hud.Drop(Hud.Rgba(60, 70, 100, 0.07f), 0, 49.3f, 0, 14.5f));
        pane.raycastTarget = true;
        // (Back from online play leaves its search too.)
        BackButton(pane.transform, () => { if (from == "online") Online.Leave(); Show("hub"); }, 26.1f, 20.3f, 310.3f);
        var split = Hud.Box(pane.transform, "Between", Hud.Rgba(150, 156, 172, 0.25f), 0.5f);
        Hud.Place((RectTransform)split.transform, 0, 78.9f, PaneW, 921.1f);
        foreach (var m in new[] { "core", "lost" })
        {
            bool on = PlayMode == m;
            var card = Hud.Rect(pane.transform, m);
            Hud.Place(card, 0, m == "core" ? 78.9f : 540.2f, PaneW, 459.8f);
            var art = card.gameObject.AddComponent<RawImage>();
            art.texture = Resources.Load<Texture2D>($"Icons/pane-{m}{(on ? "" : "-off")}");
            var b = card.gameObject.AddComponent<Button>();
            b.targetGraphic = art;
            b.transition = Selectable.Transition.None;
            b.onClick.AddListener(() =>
            {
                if (PlayMode == m) return;
                Sound.Play("click");
                Store.Set(PlayModeKey, m);
                Show(from);
            });
        }
    }

    /// <summary>
    /// Choosing a seat's deck (app.ts renderPickDeck): every deck of the mode played as a deck box, by kind; tap one to
    /// take it.
    /// </summary>
    void PickDeck()
    {
        SetupTop(page, "choose a deck", () => Show(pickFrom));
        var presets = Decks.Presets.Where(d => Modes.ModeOf(d) == PlayMode).ToList();
        float y = 128.6f;
        var groups = new List<(string, List<Decks.Saved>)> { ($"{Modes.GameModes[PlayMode].Name.ToLowerInvariant()}: race starters", presets.Where(d => d.Mixed != true).ToList()) };
        // (The mechanic starters mix races: the battle plays the race starters.)
        foreach (var (label, decks) in groups)
        {
            if (decks.Count == 0) continue;
            Hud.Text(page, label.ToUpperInvariant(), 89.5f, y, 1421, 16, 13, Look.InkSoft, true, 400, 30, TextAlignmentOptions.Left);
            // (The web's .db-boxes: boxes 217.5 across, 40.6 apart, five to a row, each row centred.)
            for (int i = 0; i < decks.Count; i++)
            {
                int row = i / 5, inRow = Mathf.Min(5, decks.Count - row * 5), col = i % 5;
                float x = 800 - (inRow * 217.5f + (inRow - 1) * 40.6f) / 2 + col * 258.1f;
                var d = decks[i];
                BuilderView.DeckBoxMini(page, x, y + 65.3f + row * 363, d, d.Name == SeatDeck(pickSeat).Name, () =>
                {
                    seatDeck[pickSeat] = d.Name;
                    Show(pickFrom);
                }, 217.5f, true);
            }
            y += 27.6f + ((decks.Count + 4) / 5) * 363 + 26.1f;
        }
    }

    RectTransform sheet;

    /// <summary>
    /// The campaign's menu (campaign.ts renderSetup): A DYING UNIVERSE, your Captain, the ship and the Stellari to build
    /// up between runs, and the run to begin (or the one under way to carry on).
    /// </summary>
    void CampaignMenu() => CampaignMenuPage.Make(page, this, scene);

    /// <summary>You, top right: your name and level, your stardust and flux (the hub's chip, on the pages off it too). Tap it for your profile.</summary>
    public void Chip(Transform parent) => Chip(parent, new Vector2(-26.1f, -26.5f));

    /// <summary>
    /// A round-ended white button (the web's .hub-options): 65.8 by 57.1, white at 92%, its soft shadow, its mark in
    /// the middle (the options' 29 across; a corner icon's picture, baked with its own margin, 50).
    /// </summary>
    Button RoundButton(Transform parent, Vector2 at, string icon, System.Action act)
    {
        var b = Hud.Box(parent, icon, new Color(1, 1, 1, 0.92f), 28.6f);
        Hud.At((RectTransform)b.transform, new Vector2(1, 1), at, new Vector2(65.8f, 57.1f));
        Hud.Shadow(b, 28.6f, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.12f), 5.8f, 20.3f));
        b.raycastTarget = true;
        var button = b.gameObject.AddComponent<Button>();
        button.onClick.AddListener(() => { Sound.Play("click"); act(); });
        float s = icon.Contains("hud-") ? 50 : 29;
        Picture(b.transform, icon, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(s, s));
        return button;
    }

    /// <summary>
    /// A player's picture (glyphs.ts playerAvatar): their account's card artwork in a circle on the dark of space, a
    /// white ring and a pale one round it. Placed by its top-left corner.
    /// </summary>
    public static RectTransform Avatar(Transform parent, float x, float y, float size)
    {
        var disc = Hud.Rect(parent, "Avatar");
        Hud.Place(disc, x, y, size, size);
        var di = disc.gameObject.AddComponent<Image>();
        di.sprite = Hud.Circle;
        di.color = Hud.Rgba(26, 28, 42);
        di.raycastTarget = false;
        Hud.Shadow(di, size / 2, new Hud.Drop(Color.white, 0, 0, size * 0.05f), new Hud.Drop(Hud.Rgba(223, 227, 236), 0, 0, size * 0.083f));
        var avatar = Account.Current?.Avatar;
        if (avatar != null)
        {
            disc.gameObject.AddComponent<Mask>().showMaskGraphic = true;
            var art = Hud.Rect(disc, "Art");
            Hud.Fill(art);
            var ai = art.gameObject.AddComponent<RawImage>();
            ai.texture = EngineData.Art(avatar);
            ai.raycastTarget = false;
        }
        return disc;
    }

    /// <summary>
    /// You (app.ts playerChip): a white pill (92%), your picture 43.5 across at its left, your name (14.4 bold, spaced
    /// 0.1em) over your level (12.8, ink-faint), then past a hairline your stardust and flux (13.9). As wide as its
    /// words; `at` its top-right corner.
    /// </summary>
    public void Chip(Transform parent, Vector2 at)
    {
        var me = Profile.Me;
        string name = (string.IsNullOrEmpty(me.Name) ? "Commander" : me.Name).ToUpperInvariant(), level = $"level {me.Level}";
        string dust = $"✦ {me.Stardust}", flux = $"⟁ {me.Flux}";
        float whoW = Mathf.Max(Hud.Wide(name, 14.4f, 700, 10, 0), Hud.Wide(level, 12.8f, 400, 8, 0, false));
        float dustW = Hud.Wide(dust, 13.9f, 400, 0, 0), fluxW = Hud.Wide(flux, 13.9f, 400, 0, 0);
        // (Its padding 5.8 left and 17.4 right, its parts 11.6 apart, the hairline 11.6 before the currencies.)
        float curX = 6.8f + 43.5f + 11.6f + whoW + 11.6f, w = curX + 11.6f + dustW + 11.6f + fluxW + 17.4f + 0.7f;
        var chip = Hud.Box(parent, "You", new Color(1, 1, 1, 0.92f), 28.6f);
        Hud.At((RectTransform)chip.transform, new Vector2(1, 1), at, new Vector2(w, 57.1f));
        Hud.Shadow(chip, 28.6f, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.12f), 5.8f, 20.3f));
        chip.raycastTarget = true;
        chip.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); ProfileView(); });
        Avatar(chip.transform, 6.8f, 6.8f, 43.5f);
        Hud.Text(chip.transform, name, 61.9f, 13.6f, whoW + 4, 15.8f, 14.4f, Look.Ink, true, 700, 10, TextAlignmentOptions.Left);
        Hud.Text(chip.transform, level, 61.9f, 29.4f, whoW + 4, 14, 12.8f, Look.InkFaint, false, 400, 8, TextAlignmentOptions.Left);
        var line = Hud.Rect(chip.transform, "Divider");
        Hud.Place(line, curX, 19.5f, 0.7f, 18);
        var li = line.gameObject.AddComponent<Image>();
        li.color = Hud.Rgba(236, 238, 243);
        li.raycastTarget = false;
        Hud.Text(chip.transform, dust, curX + 11.6f, 19.5f, dustW + 2, 18, 13.9f, Hud.Rgba(185, 133, 42), true, 400, 0, TextAlignmentOptions.Left);
        Hud.Text(chip.transform, flux, curX + 11.6f + dustW + 11.6f, 19.5f, fluxW + 2, 18, 13.9f, Hud.Rgba(109, 111, 208), true, 400, 0, TextAlignmentOptions.Left);
    }

    /// <summary>The web's small back button (.btn.btn-small "‹ back"): 92 by 38.3, placed by its top-left corner.</summary>
    public static Button BackButton(Transform parent, System.Action back, float x, float y, float w = 92.1f)
    {
        var b = Hud.Btn(parent, "‹ Back", back);
        Hud.Place((RectTransform)b.transform, x, y, w, 38.3f);
        return b;
    }

    /// <summary>
    /// Every setup page's header, the same everywhere (app.ts setupTop): back on the left, the page's name centred
    /// (30.2, spaced 0.3em, #555a63), you on the right; all three on a line 55 down. With the game modes' pane down
    /// the left (`pane` its width), back is the pane's and the name is centred over the rest of the page.
    /// </summary>
    public void SetupTop(Transform parent, string title, System.Action back, float pane = 0)
    {
        if (pane <= 0) BackButton(parent, back, 26.1f, 35.9f);
        float left = pane > 0 ? pane + 46.4f : 26.1f, right = 1573.9f;
        Hud.Text(parent, title.ToUpperInvariant(), left, 36.6f, right - left, 37, 30.2f, Hud.Rgba(85, 90, 99), true, 500, 30);
        Chip(parent, new Vector2(-26.1f, -26.5f));
    }

    RectTransform toast;
    float toastUntil;

    /// <summary>A word at the top of the screen for a few seconds (the web's toast): why something can't be done.</summary>
    public void Toast(string text)
    {
        if (toast != null) Mats.Kill(toast.gameObject);
        var box = Hud.Glass(canvas.transform, "Toast", Look.GlassStrong);
        box.raycastTarget = false;
        toast = (RectTransform)box.transform;
        var words = Hud.Label(toast, text, 19, Look.Ink, false, 500, 0);
        words.textWrappingMode = TextWrappingModes.Normal;
        words.margin = new Vector4(28, 8, 28, 8);
        float w = Mathf.Clamp(words.GetPreferredValues(text, 900, 0).x + 64, 240, 960);
        Hud.At(toast, new Vector2(0.5f, 1), new Vector2(0, -104), new Vector2(w, w >= 960 ? 92 : 62));
        toastUntil = Time.realtimeSinceStartup + 3.6f;
    }

    void Update()
    {
        TurnRings();
        // (The settings' flower: a turn in 90 seconds.)
        if (flower != null) flower.localRotation = Quaternion.Euler(0, 0, -(Time.time * 4) % 360);
        if (toast != null && Time.realtimeSinceStartup > toastUntil)
        {
            Mats.Kill(toast.gameObject);
            toast = null;
        }
        // (Over a page drawn after it.)
        else if (toast != null && toast.GetSiblingIndex() != toast.parent.childCount - 1) toast.SetAsLastSibling();
    }

    /// <summary>
    /// Your profile (app.ts renderProfileView): your name and record, then your level and experience, stardust, flux and
    /// rank. A tap off it closes it.
    /// </summary>
    void ProfileView()
    {
        if (sheet != null) Mats.Kill(sheet.gameObject);
        var p = Profile.Me;
        var view = Hud.Rect(page, "Profile");
        sheet = view;
        Hud.Fill(view);
        // (The web's soft overlay blurs the page under it as well; with no blur here, the veil is a little thicker.)
        view.gameObject.AddComponent<Image>().color = new Color(244 / 255f, 244 / 255f, 242 / 255f, 0.8f);
        System.Action shut = () => { Mats.Kill(view.gameObject); if (sheet == view) sheet = null; };
        view.gameObject.AddComponent<Button>().onClick.AddListener(() => shut());
        // (The web's .profile-view: 812 across, white, corners 26.1, a faint ring and two soft shadows; 32.9 in.)
        var card = Hud.Box(view, "Card", Color.white, 26.1f);
        Hud.Shadow(card, 26.1f, new Hud.Drop(Hud.Rgba(120, 124, 134, 0.08f), 0, 0, 1.4f), new Hud.Drop(Hud.Rgba(80, 80, 100, 0.18f), 43.5f, 116), new Hud.Drop(Hud.Rgba(80, 80, 100, 0.08f), 8.7f, 26.1f));
        card.raycastTarget = true;
        // (The card itself swallows taps, so only the veil closes.)
        card.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        // Its head: your picture, name and record, and close.
        Avatar(card.transform, 32.9f, 30, 66.7f);
        Hud.Text(card.transform, (string.IsNullOrEmpty(p.Name) ? "Commander" : p.Name).ToUpperInvariant(), 117, 39.2f, 549.6f, 29, 23.2f, Look.Ink, true, 500, 16, TextAlignmentOptions.Left);
        Hud.Text(card.transform, $"{p.Won} won of {p.Played} played", 117, 69.6f, 549.6f, 18, 15.3f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
        var close = Hud.Btn(card.transform, "Close", () => shut(), 13, 16.3f);
        Hud.Place((RectTransform)close.transform, 684, 47.1f, 95.2f, 32.5f);
        // Your level (and its experience), stardust, flux and rank, four boxes (177.9 by 95.1, 11.6 apart).
        int need = Progression.XpToNext(p.Level);
        var boxes = new[]
        {
            ("LEVEL", p.Level.ToString(), Look.Ink, $"{p.Xp} / {need} XP", (float)p.Xp / Mathf.Max(1, need)),
            ("STARDUST", $"<size=85%>✦</size> {p.Stardust}", Hud.Rgba(185, 133, 42), "", -1f),
            ("FLUX", $"<size=85%>⟁</size> {p.Flux}", Hud.Rgba(109, 111, 208), "", -1f),
            ("RANK", p.RankPoints == null ? "unranked" : Progression.RankName(p.RankPoints.Value).ToLowerInvariant(), Look.Ink, "", p.RankPoints == null ? -1f : Progression.RankOf(p.RankPoints.Value).Points / 100f),
        };
        for (int i = 0; i < boxes.Length; i++)
        {
            var (head, shown, ink, foot, bar) = boxes[i];
            // (Its inset hairline: the box in the line's colour, the box itself 1.4 inside it.)
            var edge = Hud.Box(card.transform, head, Hud.Rgba(236, 238, 243), 17.4f);
            Hud.Place((RectTransform)edge.transform, 32.9f + i * 189.4f, 117, 177.9f, 95.1f);
            var box = Hud.Box(edge.transform, "Inside", Hud.Rgba(247, 248, 251), 16);
            Hud.Fill((RectTransform)box.transform);
            ((RectTransform)box.transform).offsetMin = new Vector2(1.4f, 1.4f);
            ((RectTransform)box.transform).offsetMax = new Vector2(-1.4f, -1.4f);
            Hud.Text(edge.transform, head, 14.5f, 11.6f, 148.9f, 14, 11.6f, Look.InkFaint, false, 400, 12, TextAlignmentOptions.Left);
            Hud.Text(edge.transform, shown, 14.5f, 30, 148.9f, 25, 20.9f, ink, true, 500, 6, TextAlignmentOptions.Left);
            if (bar >= 0)
            {
                var track = Hud.Box(edge.transform, "Bar", Hud.Rgba(238, 240, 245), 2.9f);
                Hud.Place((RectTransform)track.transform, 14.5f, 59.4f, 148.9f, 5.8f);
                // (Its fill: the web's blue to violet.)
                var fill = Hud.Rect(track.transform, "Fill");
                Hud.Place(fill, 0, 0, 148.9f * Mathf.Clamp01(bar), 5.8f);
                var fi = fill.gameObject.AddComponent<RawImage>();
                fi.texture = Across(Hud.Rgba(159, 180, 255), Hud.Rgba(201, 164, 255));
                fi.raycastTarget = false;
            }
            if (foot.Length > 0) Hud.Text(edge.transform, foot, 14.5f, 69.5f, 148.9f, 14, 11.6f, Look.InkFaint, false, 400, 12, TextAlignmentOptions.Left);
        }
        // Your account (and deleting it), then changing your name and signing out: AccountView.ProfileRows.
        float h = AccountView.ProfileRows(card.transform, this, ProfileView, 232.4f);
        Hud.At((RectTransform)card.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(812, h));
    }

    /// <summary>A strip of colour from `a` on the left to `b` on the right (the web's linear-gradient(90deg)).</summary>
    public static Texture2D Across(Color a, Color b)
    {
        var t = new Texture2D(32, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        for (int x = 0; x < 32; x++) t.SetPixel(x, 0, Color.Lerp(a, b, x / 31f));
        t.Apply();
        return t;
    }

    /// <summary>
    /// Options (app.ts renderOptions): a setup page, its settings in one column (settings.ts settingsPanel): sound,
    /// music, the AI's speed and sharing game stats, the Stellari turning half out of the panel's foot.
    /// </summary>
    void Options()
    {
        SetupTop(page, "options", () => Show("hub"));
        bool share = Store.Get("blue-loop:share-stats") != "0";
        SettingsPanel(page, 524.5f, 262.1f, 551, new[]
        {
            new Hud.Row("sound", () => { Sound.Muted = !Sound.Muted; Show("options"); }, Sound.Muted ? "off" : "on"),
            new Hud.Row("music", Sound.Muted ? (System.Action)null : () => { Sound.MusicOn = !Sound.MusicOn; Show("options"); }, Sound.MusicOn && !Sound.Muted ? "on" : "off"),
            new Hud.Row("ai speed", () => { BattleView.NextSpeed(); Show("options"); }, BattleView.Speed),
            new Hud.Row("share game stats\nAll data is anonymous.", () => { Store.Set("blue-loop:share-stats", share ? "0" : "1"); Show("options"); }, share ? "on" : "off"),
        });
    }

    RectTransform flower;

    /// <summary>
    /// The web's settings panel at (x, y), `w` across: frosted white (55%), corners 31.9, a faint ring and a wide
    /// shadow; in it the rows' list (72% white, corners 23.2), each row 66.7 tall with a hairline above all but the
    /// first, its name (15.3, spaced 0.22em; a line under it in Exo 2 after a newline) left and its setting in a grey
    /// pill right; beneath the list the Stellari's flower, 340 across, its middle on the panel's foot, cut by it.
    /// </summary>
    void SettingsPanel(Transform parent, float x, float y, float w, Hud.Row[] rows)
    {
        float rowH = 66.7f, listH = 11.6f + rows.Length * rowH + (rows.Length - 1) * 2.9f, h = 20.3f + listH + 180;
        var panel = Hud.Box(parent, "Settings", new Color(1, 1, 1, 0.55f), 31.9f);
        Hud.Place((RectTransform)panel.transform, x, y, w, h);
        Hud.Shadow(panel, 31.9f, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1.4f), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.1f), 20.3f, 58));
        panel.gameObject.AddComponent<RectMask2D>();
        // The flower, turning (one turn in 90 seconds), under the list.
        var f = Hud.Rect(panel.transform, "Flower");
        Hud.At(f, new Vector2(0.5f, 0), Vector2.zero, new Vector2(380.8f, 380.8f));
        f.pivot = new Vector2(0.5f, 0.5f);
        var fi = f.gameObject.AddComponent<RawImage>();
        fi.texture = Resources.Load<Texture2D>("Icons/settings-flower");
        fi.color = new Color(1, 1, 1, 0.9f);
        fi.raycastTarget = false;
        flower = f;
        var list = Hud.Box(panel.transform, "List", new Color(1, 1, 1, 0.72f), 23.2f);
        Hud.Place((RectTransform)list.transform, 20.3f, 20.3f, w - 40.6f, listH);
        Hud.Shadow(list, 23.2f, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1.4f), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.06f), 8.7f, 26.1f));
        float rowW = w - 40.6f - 11.6f;
        for (int i = 0; i < rows.Length; i++)
        {
            var row = rows[i];
            var r = Hud.Box(list.transform, row.Label, Color.white, 17.4f);
            Hud.Place((RectTransform)r.transform, 5.8f, 5.8f + i * (rowH + 2.9f), rowW, rowH);
            r.raycastTarget = true;
            var b = r.gameObject.AddComponent<Button>();
            var colors = b.colors;
            // (Clear, and a faint blue under the pointer, as the web's row hover.)
            colors.normalColor = new Color(1, 1, 1, 0);
            colors.highlightedColor = Hud.Rgba(95, 143, 196, 0.08f);
            colors.pressedColor = Hud.Rgba(95, 143, 196, 0.14f);
            colors.selectedColor = new Color(1, 1, 1, 0);
            colors.disabledColor = new Color(1, 1, 1, 0);
            b.colors = colors;
            var act = row.Act;
            if (act != null) b.onClick.AddListener(() => { Sound.Play("click"); act(); });
            else b.interactable = false;
            float fade = act != null ? 1 : 0.45f;
            if (i > 0)
            {
                var line = Hud.Rect(list.transform, "Line");
                Hud.Place(line, 5.8f, 5.8f + i * (rowH + 2.9f) - 1.4f, rowW, 1.4f);
                var li = line.gameObject.AddComponent<Image>();
                li.color = Hud.Rgba(58, 66, 86, 0.06f);
                li.raycastTarget = false;
            }
            var parts = row.Label.Split('\n');
            var l = Hud.Text(r.transform, parts[0].ToUpperInvariant(), 23.2f, parts.Length > 1 ? 12.6f : 23.8f, rowW - 140, 19, 15.3f, Look.Ink, true, 400, 22, TextAlignmentOptions.Left);
            l.alpha = fade;
            if (parts.Length > 1)
            {
                var sub = Hud.Text(r.transform, parts[1], 23.2f, 36, rowW - 140, 18, 15.3f, Look.InkFaint, false, 400, 2, TextAlignmentOptions.Left);
                sub.alpha = fade;
            }
            if (row.Value != null)
            {
                string v = row.Value.ToUpperInvariant();
                float vw = Mathf.Max(63.8f, Hud.Wide(v, 13.9f, 500, 16, 14.5f));
                var pill = Hud.Box(r.transform, "Value", Hud.Rgba(240, 242, 246), 14.3f);
                Hud.Place((RectTransform)pill.transform, rowW - 17.4f - vw, (rowH - 28.6f) / 2, vw, 28.6f);
                pill.color = new Color(pill.color.r, pill.color.g, pill.color.b, fade);
                var vl = Hud.Label(pill.transform, v, 13.9f, Look.InkSoft, true, 500, 16);
                vl.alpha = fade;
            }
            else
            {
                var chev = Hud.Text(r.transform, "›", rowW - 40, 0, 22.6f, rowH, 25.5f, Look.InkFaint, false, 400, 0);
                chev.alpha = fade;
            }
        }
    }

    /// <summary>A page still to come: a word, for now.</summary>
    void Soon(string what)
    {
        var veil = Hud.Rect(page, "Soon");
        Hud.Fill(veil);
        var img = veil.gameObject.AddComponent<Image>();
        img.color = new Color(0.96f, 0.96f, 0.95f, 0.9f);
        veil.gameObject.AddComponent<Button>().onClick.AddListener(() => Mats.Kill(veil.gameObject));
        Hud.Label(veil, $"{what.ToUpperInvariant()}\n<size=50%><color=#737780>COMING TO THIS BUILD SOON · TAP TO GO BACK</color></size>", 40, Look.Ink, true, 500, 20);
    }
}
