using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using K = MenuKit;

/// <summary>
/// The menu (app.ts renderMenu): the title page, the hub (the five ways to play, the shop, collection and glossary
/// along the top, you and your options in the corner), quickplay's setup (your deck and your rival's), the shop and
/// your profile. Laid out as the web lays them out, in its CSS pixels at its layout size (Hud.CssCanvas), its
/// responsive rules (vw, vh, clamp(), the safe area) worked out afresh whenever the screen changes size.
/// </summary>
public class MenuView : MonoBehaviour
{
    /// <summary>A page that can lay itself out again where it stands (keeping what is picked, typed and open).</summary>
    public interface IRedraw { void Redraw(); }

    Camera cam;
    Canvas canvas;
    RectTransform page;
    string current;
    GameObject backdrop;
    CampaignBackdrop scene;
    // Quickplay's seats: whose deck, and whether the AI plays it.
    readonly string[] seatDeck = new string[2];
    readonly bool[] seatAI = { false, true };
    // (The size and safe area the page was laid out for: a change lays it out again.)
    Vector2 laidSize;
    Vector4 laidInsets;
    bool profileOpen;

    public static MenuView Make(Camera cam, string page)
    {
        var v = new GameObject("Menu").AddComponent<MenuView>();
        v.cam = cam;
        v.canvas = Hud.CssCanvas(cam);
        v.canvas.transform.SetParent(v.transform, false);
        v.Background();
        v.Show(page);
        Sound.Scene("voyage");
        return v;
    }

    /// <summary>The campaign's own pages, still laid out at the 1600 × 1000 reference and fitted whole (Frame).</summary>
    /// <summary>The campaign's own pages: each lays itself out again as the screen changes (its RefLayer).</summary>
    static bool Legacy(string name) => name == "campaign" || name == "stellari" || name == "captain" || name == "hangar";

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
        // petals, turning slowly (one turn in three minutes; the inner ring at 0.6 of it). Framed as the web frames it
        // (its viewBox 0 -300 1000 900, sliced to cover the page from its top, centred across): see FrameStage.
        stage = Hud.Rect(backdrop.transform, "Stage");
        var glow = Hud.Rect(stage, "Glow");
        var rings = Hud.Rect(glow, "Rings");
        glow.anchorMin = glow.anchorMax = glow.pivot = new Vector2(0.5f, 1);
        var gi = glow.gameObject.AddComponent<RawImage>();
        gi.texture = Pictures.Load("Icons/mandala-glow");
        gi.raycastTarget = false;
        rings.anchorMin = rings.anchorMax = new Vector2(0.5f, 1);
        rings.pivot = new Vector2(0.5f, 0.5f);
        foreach (var layer in new[] { "outer", "inner" })
        {
            var r = Hud.Rect(rings, layer);
            Hud.Fill(r);
            r.pivot = new Vector2(0.5f, 0.5f);
            var ri = r.gameObject.AddComponent<RawImage>();
            ri.texture = Pictures.Load("Icons/mandala-" + layer);
            ri.raycastTarget = false;
            if (layer == "outer") outerRing = r;
            else innerRing = r;
        }
        FrameStage();
    }

    RectTransform stage, outerRing, innerRing;
    float ringAngle;

    /// <summary>
    /// The Stellari framed to the page (xMidYMin slice of the web's 1000 × 900 view): s the larger of the page's width
    /// over 1000 and its height over 900; the glow the whole view, from the top; the rings (680 of its units across)
    /// turning on its heart, 470 units down.
    /// </summary>
    void FrameStage()
    {
        if (stage == null) return;
        float s = Mathf.Max(K.W / 1000f, K.H / 900f);
        Hud.Fill(stage);
        var glow = (RectTransform)stage.GetChild(0);
        glow.anchoredPosition = Vector2.zero;
        glow.sizeDelta = new Vector2(1000 * s, 900 * s);
        var rings = (RectTransform)glow.GetChild(0);
        rings.anchoredPosition = new Vector2(0, -470 * s);
        rings.sizeDelta = new Vector2(680 * s, 680 * s);
    }

    void TurnRings()
    {
        // (Clockwise, as the web turns it: two degrees a second.)
        ringAngle = (ringAngle + 2 * Time.deltaTime) % 1800;
        if (outerRing != null) outerRing.localRotation = Quaternion.Euler(0, 0, -ringAngle);
        if (innerRing != null) innerRing.localRotation = Quaternion.Euler(0, 0, -ringAngle * 0.6f);
    }

    // ---- The title block (app.ts titleBlock): the pearl sun over BLUE LOOP ----

    /// <summary>The title block's measures: the sun, the words' size, the gap between them, its whole height.</summary>
    public struct TitleSize { public float Sun, Font, Gap, WordsH, H; }

    /// <summary>The title page's block (.menu-title), or the small one the hub and signing in have (.title-small).</summary>
    public static TitleSize TitleMeasures(bool small)
    {
        var t = new TitleSize();
        if (small)
        {
            t.Sun = Mathf.Min(54, 11 * K.Vh);
            t.Font = K.Clamp(1.1f * K.Rem, 5 * K.Vh, 1.8f * K.Rem);
            t.Gap = K.Clamp(6, 2 * K.Vh, 14);
            t.WordsH = t.Font * 1.16f;
            t.H = t.Sun + t.Gap + t.WordsH;
        }
        else
        {
            t.Sun = Mathf.Min(130, 26 * K.Vh);
            t.Font = K.Clamp(1.4f * K.Rem, Mathf.Min(10 * K.Vh, 6.6f * K.Vw), 3.8f * K.Rem);
            t.Gap = 22;
            t.WordsH = t.Font * 1.16f;
            t.H = t.Sun + 22 + t.WordsH + 6;
        }
        return t;
    }

    /// <summary>The title block, its top at `y`, centred on `cx`; returns its measures.</summary>
    public static TitleSize TitleBlock(Transform parent, float cx, float y, bool small)
    {
        var t = TitleMeasures(small);
        K.SunAt(parent, cx - t.Sun / 2, y, t.Sun);
        // (The words spaced 0.32em, #555a63.)
        K.Words(parent, "BLUE LOOP", cx - 400, y + t.Sun + t.Gap, 800, t.WordsH, t.Font, Hud.Rgba(85, 90, 99), true, 400, 0.32f);
        return t;
    }

    public void Show(string name)
    {
        if (page != null) Mats.Kill(page.gameObject);
        sheet = null;
        profileOpen = false;
        page = Hud.Rect(canvas.transform, name);
        Hud.Fill(page);
        current = name;
        laidSize = Css.Size;
        laidInsets = Css.SafeInsets;
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

    /// <summary>The screen changed size (turned, resized): the page laid out again for it.</summary>
    void Relayout()
    {
        laidSize = Css.Size;
        laidInsets = Css.SafeInsets;
        FrameStage();
        if (page == null || Legacy(current)) return;
        // (Your profile, open over it, opens again over the new layout.)
        bool open = sheet != null && profileOpen;
        var keeps = page.GetComponentsInChildren<MonoBehaviour>().OfType<IRedraw>().FirstOrDefault();
        if (keeps != null) keeps.Redraw();
        else Show(current);
        if (open)
        {
            profileOpen = true;
            ProfileView();
        }
    }

    static RawImage Picture(Transform parent, string resource, float x, float y, float w, float h)
    {
        var r = Hud.Rect(parent, resource);
        Hud.Place(r, x, y, w, h);
        var img = r.gameObject.AddComponent<RawImage>();
        img.texture = Resources.Load<Texture2D>(resource);
        img.raycastTarget = false;
        return img;
    }

    /// <summary>The middle of the page across, inside the menu's padding (max(12px, the safe area) either side).</summary>
    static float MidX => (Mathf.Max(12, K.SaL) + K.W - Mathf.Max(12, K.SaR)) / 2;

    // ---- The title page: the logo and a start button ----

    void Title()
    {
        // (.menu-stack: the block, then start (.menu-start: at least 180 across, 12.8 bold spaced 0.3em, padded 12 by
        // 28), clamp(18px, 6vh, 40px) apart; centred in the page above its foot's 12vh.)
        var t = TitleMeasures(false);
        float gap = K.Clamp(18, 6 * K.Vh, 40), bh = K.LineH(12.8f) + 26;
        float top = Mathf.Max(6, K.SaT), stack = t.H + gap + bh;
        float y = top + (K.H - top - 12 * K.Vh - stack) / 2;
        TitleBlock(page, MidX, y, false);
        float bw = Mathf.Max(180, K.TextW("START", 12.8f, 700, 0.3f) + 58);
        K.Btn(page, "Start", Begin, MidX - bw / 2, y + t.H + gap, K.Kind.Primary, bw, bh, 12.8f, 0.3f);
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
        // (The web's .studio: 8 across, spaced 0.3em, ink-faint, max(10px, the safe area) off the foot.)
        K.Words(page, "CORONAL MASS GAMES", 0, K.H - Mathf.Max(10, K.SaB) - 9, K.W, 9, 8, Look.InkFaint, true, 400, 0.3f);
    }

    // ---- The hub ----

    void Hub()
    {
        // Shop, collection and glossary as plain links, top left (.hub-links: max(12px, top) down, max(18px, left)
        // in, 46 tall, clamp(14px, 2.4vw, 28px) apart; each its mark 22 across, 7 on, its name 10.24 bold spaced 0.2em).
        float top = Mathf.Max(12, K.SaT);
        var links = new[] { ("shop", "Shop"), ("collection", "Collection"), ("glossary", "Glossary") };
        float linkX = Mathf.Max(18, K.SaL), linkGap = K.Clamp(14, 2.4f * K.Vw, 28);
        foreach (var (icon, name) in links)
        {
            float nameW = K.TextW(name.ToUpperInvariant(), 10.24f, 700, 0.2f);
            float linkW = 2 + 22 + 7 + nameW + 2;
            var b = K.Hit(page, name, null);
            Hud.Place((RectTransform)b.transform, linkX, top + 8, linkW, 30);
            linkX += linkW + linkGap;
            string to = icon;
            // (The shop needs the server, as online play does.)
            b.onClick.AddListener(() => { Sound.Play("click"); if (to == "shop" && !Net.Available) Toast("Offline."); else Show(to); });
            Picture(b.transform, $"Icons/{icon}-small", 2, 4, 22, 22);
            K.Words(b.transform, name.ToUpperInvariant(), 31, 0, nameW + 4, 30, 10.24f, Look.Ink, true, 700, 0.2f, TextAlignmentOptions.Left);
        }
        // You, then options and full screen: white pills top right (.hub-corner: max(18px, right) in, 8 apart; each
        // button 46 by 40, its mark 20 across).
        float right = K.W - Mathf.Max(18, K.SaR);
        RoundButton(page, right - 46, top, Screen.fullScreen ? "Icons/hud-exit-fullscreen" : "Icons/hud-fullscreen", () => { Screen.fullScreen = !Screen.fullScreen; });
        RoundButton(page, right - 100, top, "Icons/options-small", () => Show("options"));
        Chip(page, right - 108, top);

        // The title and the five ways to play, centred above the foot's 12vh (.hub: tiles --ht across, clamp(84px,
        // min(30vh, 15vw), 150px), 1.05 as tall, clamp(10px, 2vw, 20px) apart; clamp(10px, 3.5vh, 26px) under the title).
        var tiles = new[] { ("campaign", "A dying universe"), ("quickplay", "Quickplay"), ("online", "Online"), ("tutorial", "Tutorial"), ("challenges", "Challenges") };
        var t = TitleMeasures(true);
        float ht = K.Clamp(84, Mathf.Min(30 * K.Vh, 15 * K.Vw), 150), cardH = ht * 1.05f, gapX = K.Clamp(10, 2 * K.Vw, 20);
        bool anyCont = CampaignView.HasSave || BattleView.HasSave;
        float colH = cardH + (anyCont ? 8 + 26 : 0), gap = K.Clamp(10, 3.5f * K.Vh, 26);
        float padT = Mathf.Max(6, K.SaT), stack = t.H + gap + colH;
        float y = padT + (K.H - padT - 12 * K.Vh - stack) / 2;
        TitleBlock(page, MidX, y, true);
        float cardY = y + t.H + gap, x0 = MidX - (5 * ht + 4 * gapX) / 2;
        // (.hub-card: its mark clamp(26px, 8vh, 42px) over its name, clamp(8.96px, 2.3vh, 12.48px) bold spaced 0.2em,
        // clamp(6px, 2vh, 12px) between, centred in the card; corners 16; two soft shadows.)
        float iconS = K.Clamp(26, 8 * K.Vh, 42), inner = K.Clamp(6, 2 * K.Vh, 12), nameF = K.Clamp(8.96f, 2.3f * K.Vh, 12.48f);
        for (int i = 0; i < tiles.Length; i++)
        {
            var (key, name) = tiles[i];
            bool offline = key == "online" && !Net.Available;
            float x = x0 + i * (ht + gapX);
            var tile = Hud.Box(page, name, Hud.Rgba(250, 250, 249), 16);
            Hud.Place(tile.rectTransform, x, cardY, ht, cardH);
            Hud.Shadow(tile, 16, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.14f), 14, 34), new Hud.Drop(Hud.Rgba(80, 84, 100, 0.08f), 2, 6));
            tile.raycastTarget = true;
            var b = tile.gameObject.AddComponent<Button>();
            var colors = b.colors;
            colors.highlightedColor = new Color(0.99f, 0.99f, 1f);
            colors.pressedColor = new Color(0.95f, 0.96f, 0.98f);
            colors.disabledColor = new Color(1, 1, 1, 0.45f);
            b.colors = colors;
            // (Online play needs the server: without one its tile reads offline, faded.)
            b.interactable = !offline;
            string target = key;
            b.onClick.AddListener(() => { Sound.Play("click"); Show(target); });
            string shown = (offline ? "offline" : name).ToUpperInvariant();
            // (Two lines when the name is wider than the card's inside.)
            float innerW = ht - 22;
            bool twoLines = K.TextW(shown, nameF, 700, 0.2f) > innerW;
            float nameH = nameF * 1.11f * (twoLines ? 2 : 1), top2 = (cardH - (iconS + inner + nameH)) / 2;
            var pic = Picture(tile.transform, $"Icons/{key}", (ht - iconS) / 2, top2, iconS, iconS);
            if (offline) pic.color = new Color(1, 1, 1, 0.45f);
            var label = K.Words(tile.transform, shown, 11, top2 + iconS + inner, innerW, nameH, nameF, Look.Ink, true, 700, 0.2f);
            label.textWrappingMode = TextWrappingModes.Normal;
            label.lineSpacing = -8;
            if (offline) label.alpha = 0.45f;
            // (A run or a game against the AI left part way: continue it, a small button 8 under its card.)
            System.Action cont = target == "campaign" && CampaignView.HasSave ? () => App.Instance.Run(CampaignView.Saved())
                : target == "quickplay" && BattleView.HasSave ? () => App.Instance.Continue() : (System.Action)null;
            if (cont != null)
            {
                float cw = K.BtnW("continue", K.Kind.Small);
                K.Btn(page, "continue", cont, x + (ht - cw) / 2, cardY + cardH + 8, K.Kind.Small, cw);
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
        // (The page beside the pane; launch at its foot: the primary button, at least 160 across, padded 11 by 24,
        // spaced 0.24em.)
        float launchH = K.LineH(10.56f) + 24;
        var f = Setup(page, "quickplay", () => Show("hub"), true, launchH);
        // (.seat-row: two seats, at most 620 across together and 300 tall, clamp(8px, 1.8vw, 18px) apart, centred.)
        float rowW = Mathf.Min(f.Right - f.Left, 620), rowH = Mathf.Min(f.BodyH, 300), gap = K.Clamp(8, 1.8f * K.Vw, 18);
        float sw = (rowW - gap) / 2, sx = (f.Left + f.Right - rowW) / 2, sy = f.BodyTop + (f.BodyH - rowH) / 2;
        for (int seat = 0; seat < 2; seat++)
        {
            int s = seat;
            if (seatAI[s] && seatBot[s] == null) seatBot[s] = BotName(seatBot[1 - s]);
            string name = seatAI[s] ? seatBot[s] : s == 0 ? (string.IsNullOrEmpty(Profile.Me.Name) ? "Commander" : Profile.Me.Name) : "Player 2";
            Seat(page, sx + s * (sw + gap), sy, sw, rowH, name, seatAI[s] ? "ai" : "human", () =>
            {
                seatAI[s] = !seatAI[s];
                if (seatAI[s]) seatBot[s] = BotName(seatBot[1 - s]);
                Show("quickplay");
            }, null, false, s);
        }
        float lw = Mathf.Max(160, K.BtnW("launch", K.Kind.Primary, 10.56f, 0.24f, 24));
        K.Btn(page, "launch", () => App.Instance.Battle(SeatDeck(0).Name, SeatDeck(1).Name), (f.Left + f.Right - lw) / 2, f.FootTop + (f.FootH - f.FootPad - launchH) / 2, K.Kind.Primary, lw, launchH, 10.56f, 0.24f);
    }

    /// <summary>A seat's panel (.qp-seat): white fading to #f6f6f4, corners 16, two soft shadows. Placed by its top-left corner.</summary>
    public static Image SeatBox(Transform parent, float x, float y, float w, float h)
    {
        var panel = Hud.Box(parent, "Seat", Hud.Rgba(251, 251, 250), 16);
        Hud.Place(panel.rectTransform, x, y, w, h);
        Hud.Shadow(panel, 16, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.12f), 12, 30), new Hud.Drop(Hud.Rgba(80, 84, 100, 0.07f), 2, 6));
        return panel;
    }

    /// <summary>
    /// A seat (.qp-seat) at (x, y), w by h: at its head the player's name (clamp(10.56px, 2.8vh, 14.4px), spaced
    /// 0.16em) and beside it who plays it, a small pill (`mode`), or a word on where they stand (`tag`, the web's
    /// .ready-tag: green once `tagOn`); in its middle the seat's deck as a deck box (`seat`; or `deck`, not a button),
    /// --bw across (`bw`, else clamp(46px, 19vh, 92px)); at its foot every deck a tap away (or `foot`, quiet words).
    /// Its rows clamp(6px, 2vh, 14px) apart inside padding of clamp(10px, 3vh, 18px) by clamp(10px, 2vw, 18px).
    /// </summary>
    public RectTransform Seat(Transform parent, float x, float y, float w, float h, string name, string mode, System.Action flip, string tag, bool tagOn, int seat, float bw = 0, Decks.Saved deck = null, string foot = null)
    {
        var panel = SeatBox(parent, x, y, w, h);
        var r = panel.rectTransform;
        float pv = K.Clamp(10, 3 * K.Vh, 18) + 1, ph = K.Clamp(10, 2 * K.Vw, 18) + 1, gap = K.Clamp(6, 2 * K.Vh, 14);
        // Its head: the name, then its pill or tag, 10 apart, centred together.
        string shown = name.ToUpperInvariant();
        float nameF = K.Clamp(10.56f, 2.8f * K.Vh, 14.4f);
        float pillW = mode != null ? K.BtnW(mode, K.Kind.Pill, 8, 0.14f, 10) : tag != null ? K.BtnW(tag, K.Kind.Pill, 8.96f, 0.16f, 10) - 2 : 0;
        float pillH = mode != null ? 17 : tag != null ? K.LineH(8.96f) + 6 : 0;
        float headH = Mathf.Max(K.LineH(nameF) * 1.04f, pillH);
        float nameW = Mathf.Min(w - 2 * ph - (pillW > 0 ? pillW + 10 : 0), K.TextW(shown, nameF, 400, 0.16f) + 2);
        float all = nameW + (pillW > 0 ? 10 + pillW : 0), left = (w - all) / 2;
        var nl = K.Words(r, shown, left, pv, nameW, headH, nameF, Look.Ink, true, 400, 0.16f, TextAlignmentOptions.Left);
        nl.overflowMode = TextOverflowModes.Ellipsis;
        if (mode != null) K.Btn(r, mode, flip, left + nameW + 10, pv + (headH - pillH) / 2, K.Kind.Pill, pillW, pillH, 8, 0.14f);
        else if (tag != null)
        {
            var t = Hud.Box(r, "Tag", tagOn ? Hud.Rgba(102, 179, 133) : Hud.Rgba(120, 124, 134, 0.08f), pillH / 2);
            Hud.Place(t.rectTransform, left + nameW + 10, pv + (headH - pillH) / 2, pillW, pillH);
            if (tagOn) Hud.Shadow(t, pillH / 2, new Hud.Drop(Hud.Rgba(110, 196, 146, 0.45f), 0, 12));
            K.Fill(t.transform, tag.ToUpperInvariant(), 8.96f, tagOn ? Color.white : Look.InkFaint, true, 400, 0.16f);
        }
        // Its foot: every deck a tap away (.link-btn .qp-all), or quiet words.
        float footH = 19, footY = h - pv - footH;
        if (foot != null) K.Words(r, foot, 0, footY, w, footH, 12.8f, Look.InkFaint, false, 400);
        else if (seat >= 0)
        {
            System.Action pick = () => { pickSeat = seat; pickFrom = current; Show("pickdeck"); };
            float lw = K.TextW("VIEW DECKS", 9.6f, 400, 0.16f) + 4;
            K.Link(r, "view decks", pick, (w - lw) / 2, footY);
        }
        // Its middle: the deck, as a box (.qp-decks: --bw * 0.12 above it), centred between head and foot.
        if (bw <= 0) bw = K.Clamp(46, 19 * K.Vh, 92);
        var d = deck ?? (seat >= 0 ? SeatDeck(seat) : null);
        if (d != null)
        {
            // (.lobby-deck: the box, and its name 6 under it: clamp(0.4rem, 1.5vh, 0.52rem), spaced 0.1em, in ink.)
            float nameSize = K.Clamp(6.4f, 1.5f * K.Vh, 8.32f), nameH = K.LineH(nameSize);
            float boxH = BuilderView.MiniH(bw), midTop = pv + headH + gap, midH = footY - gap - midTop;
            float groupH = boxH + 6 + nameH;
            float by = midTop + (midH - groupH - bw * 0.12f) / 2 + bw * 0.12f;
            System.Action act = deck == null && seat >= 0 ? () => { pickSeat = seat; pickFrom = current; Show("pickdeck"); } : (System.Action)null;
            BuilderView.DeckBoxMini(r, (w - bw) / 2, by, d, true, act, bw);
            var dn = K.Words(r, d.Name.ToUpperInvariant(), (w - (bw + 10)) / 2, by + boxH + 6, bw + 10, nameH, nameSize, Look.Ink, true, 400, 0.1f);
            dn.overflowMode = TextOverflowModes.Ellipsis;
        }
        return r;
    }

    /// <summary>
    /// A mode's picture over its card, `w` by `h` (glyphs.ts modeArt): the Core's painting covering it about its middle;
    /// the Lost Races' painting of four panels as four tiles, two by two, 1 px apart on #0b0d16, each panel as wide as
    /// its tile, 22% down (background-size: 400% auto; background-position-y: 22%). Not picked, it is grey and dim
    /// (filter: grayscale(1) brightness(0.55), baked beside it).
    /// </summary>
    public static void ModeArt(RectTransform card, string m, bool on, float w, float h)
    {
        var tex = Pictures.Load($"CardArt/mode/{m}{(on ? "" : "-off")}");
        float tw = tex != null ? tex.width : m == "core" ? 640 : 1024, th = tex != null ? tex.height : m == "core" ? 400 : 572;
        if (m == "core")
        {
            var art = Hud.Rect(card, "Art");
            Hud.Fill(art);
            var ai = art.gameObject.AddComponent<RawImage>();
            ai.texture = tex;
            ai.raycastTarget = false;
            // (object-fit: cover, about its middle.)
            float aspect = tw / th, want = w / Mathf.Max(1, h);
            if (want > aspect) { float k = aspect / want; ai.uvRect = new Rect(0, (1 - k) / 2, 1, k); }
            else { float k = want / aspect; ai.uvRect = new Rect((1 - k) / 2, 0, k, 1); }
            return;
        }
        var back = Hud.Box(card, "Quads", Hud.Rgba(11, 13, 22), 0);
        Hud.Fill(back.rectTransform);
        float qw = (w - 1) / 2, qh = (h - 1) / 2;
        for (int i = 0; i < 4; i++)
        {
            var q = Hud.Rect(back.transform, $"Quad {i}");
            Hud.Place(q, (i % 2) * (qw + 1), (i / 2) * (qh + 1), qw, qh);
            q.gameObject.AddComponent<RectMask2D>();
            // (Each panel a quarter of the painting, as wide as its tile; 22% of what overhangs kept above.)
            float ph = qw * th / (tw / 4);
            var art = Hud.Rect(q, "Panel");
            float y = (qh - ph) * 0.22f;
            Hud.Place(art, 0, y, qw, ph);
            var ai = art.gameObject.AddComponent<RawImage>();
            ai.texture = tex;
            ai.uvRect = new Rect(i / 4f, 0, 0.25f, 1);
            ai.raycastTarget = false;
        }
    }

    /// <summary>The pane's width (.mode-cards --pw: clamp(190px, 17vw, 250px), the vw the screen's own).</summary>
    public static float PaneW => K.Clamp(190, 0.17f * Css.Screen.x, 250);

    /// <summary>
    /// The game mode in a pane down the left (glyphs.ts modeCards): frosted glass and a fine edge, as wide as --pw and
    /// the safe area; at its top the way back (max(14px, the safe area) down, 18 in), beneath it the two modes as
    /// full-height pictures sharing the rest of the pane, a hairline between; each its name and line over a shade at its
    /// foot, the picked one in colour with a white edge, the other grey. Tapping one plays that mode.
    /// </summary>
    public void ModePane(string from, Transform parent = null)
    {
        float pw = PaneW, sa = K.SaL, w = pw + sa;
        var pane = Hud.Box(parent ?? page, "Modes", new Color(1, 1, 1, 0.62f), 0.5f);
        Hud.Place(pane.rectTransform, 0, 0, w, K.H);
        Hud.Shadow(pane, 0.5f, new Hud.Drop(Hud.Rgba(150, 156, 172, 0.22f), 0, 0, 0, 1), new Hud.Drop(Hud.Rgba(60, 70, 100, 0.07f), 0, 34, 0, 10));
        pane.raycastTarget = true;
        float top = Mathf.Max(14, K.SaT);
        // (Back from online play leaves its search too.)
        K.Btn(pane.transform, "‹ back", () => { if (from == "online") Online.Leave(); Show("hub"); }, sa + 18, top, K.Kind.Small, pw - 36);
        float cardsTop = top + 26 + 14, cardH = (K.H - cardsTop - 1) / 2;
        var split = Hud.Box(pane.transform, "Between", Hud.Rgba(150, 156, 172, 0.25f), 0.5f);
        Hud.Place(split.rectTransform, sa, cardsTop, pw, K.H - cardsTop);
        foreach (var m in new[] { "core", "lost" })
        {
            bool on = PlayMode == m;
            var card = Hud.Rect(pane.transform, m);
            Hud.Place(card, sa, m == "core" ? cardsTop : cardsTop + cardH + 1, pw, cardH);
            card.gameObject.AddComponent<RectMask2D>();
            ModeArt(card, m, on, pw, cardH);
            // Its words over a shade at its foot (.mode-card-text: padded 36 16 14; the name 14.4 spaced 0.16em, the
            // line Exo 2 11.2).
            var gm = Modes.GameModes[m];
            float lineH = 11.2f * 1.3f, blurbW = pw - 32;
            var probe = K.Words(card, gm.Blurb, 16, 0, blurbW, 40, 11.2f, Color.white, false, 400, 0, TextAlignmentOptions.TopLeft);
            probe.textWrappingMode = TextWrappingModes.Normal;
            float blurbH = Mathf.Max(lineH, probe.GetPreferredValues(gm.Blurb, blurbW, 0).y);
            float textH = 36 + 16.6f + 3 + blurbH + 14;
            var shade = Hud.Rect(card, "Shade");
            Hud.Place(shade, 0, cardH - textH, pw, textH);
            var si = shade.gameObject.AddComponent<RawImage>();
            si.texture = K.Down(new Color(12 / 255f, 14 / 255f, 24 / 255f, 0), new Color(12 / 255f, 14 / 255f, 24 / 255f, 0.82f));
            si.raycastTarget = false;
            shade.SetAsLastSibling();
            K.Words(card, gm.Name.ToUpperInvariant(), 16, cardH - textH + 36, blurbW, 16.6f, 14.4f, on ? Color.white : new Color(1, 1, 1, 0.6f), true, 500, 0.16f, TextAlignmentOptions.Left);
            Hud.Place(probe.rectTransform, 16, cardH - 14 - blurbH, blurbW, blurbH);
            probe.color = new Color(1, 1, 1, on ? 0.85f : 0.5f);
            probe.transform.SetAsLastSibling();
            if (on)
            {
                // (Its white edge on the left, and a faint ring.)
                var edge = Hud.Rect(card, "Edge");
                Hud.Place(edge, 0, 0, 3, cardH);
                edge.gameObject.AddComponent<Image>().color = Color.white;
            }
            var hit = card.gameObject.AddComponent<Image>();
            hit.color = new Color(1, 1, 1, 0.001f);
            var b = card.gameObject.AddComponent<Button>();
            b.targetGraphic = hit;
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
    /// take it. (.db-list: at most 980 across, centred, scrolling under the header to the screen's foot.)
    /// </summary>
    void PickDeck()
    {
        var f = Setup(page, "choose a deck", () => Show(pickFrom), false, -1);
        var presets = Decks.Presets.Where(d => Modes.ModeOf(d) == PlayMode && d.Mixed != true).ToList();
        float listW = Mathf.Min(980, f.Right - f.Left), lx = (f.Left + f.Right - listW) / 2;
        float bw = BuilderView.ListBw, colGap = K.Clamp(16, 2.6f * K.Vw, 28), rowGap = K.Clamp(12, 3.5f * K.Vh, 22);
        float avail = listW - 26;
        int cols = Mathf.Max(1, Mathf.Min(presets.Count, Mathf.FloorToInt((avail + colGap) / (bw + colGap))));
        float labelF = K.Big ? 8.96f : 8, boxH = bw / 0.72f + bw * 0.08f;
        int rows = (presets.Count + cols - 1) / cols;
        float contentH = 4 + K.LineH(labelF) + 8 + 14 + rows * boxH + (rows - 1) * rowGap + 16 + 8 + Mathf.Max(18, K.SaB);
        var content = K.Scroller(page, "List", 0, f.BodyTop, K.W, K.H - f.BodyTop, contentH);
        K.Words(content, $"{Modes.GameModes[PlayMode].Name.ToLowerInvariant()}: race starters".ToUpperInvariant(), lx, 4, listW, K.LineH(labelF), labelF, Look.InkSoft, true, 400, 0.3f, TextAlignmentOptions.Left);
        float top = 4 + K.LineH(labelF) + 8 + 14;
        for (int i = 0; i < presets.Count; i++)
        {
            int row = i / cols, col = i % cols, inRow = Mathf.Min(cols, presets.Count - row * cols);
            float x = lx + 10 + (avail - (cols * bw + (cols - 1) * colGap)) / 2 + col * (bw + colGap);
            var d = presets[i];
            BuilderView.DeckBoxMini(content, x, top + row * (boxH + rowGap) + bw * 0.08f, d, d.Name == SeatDeck(pickSeat).Name, () =>
            {
                seatDeck[pickSeat] = d.Name;
                Show(pickFrom);
            }, bw, true);
        }
    }

    RectTransform sheet;

    /// <summary>
    /// The campaign's menu (campaign.ts renderSetup): A DYING UNIVERSE, your Captain, the ship and the Stellari to build
    /// up between runs, and the run to begin (or the one under way to carry on).
    /// </summary>
    void CampaignMenu() => CampaignMenuPage.Make(page, this, scene);

    /// <summary>
    /// A round-ended white button (.hub-options): 46 by 40, white at 92%, its soft shadow (0 4 14), its mark in the
    /// middle (the options' 20 across; a corner icon's picture, baked with its own margin, 34).
    /// </summary>
    Button RoundButton(Transform parent, float x, float y, string icon, System.Action act)
    {
        var b = Hud.Box(parent, icon, new Color(1, 1, 1, 0.92f), 20);
        Hud.Place(b.rectTransform, x, y, 46, 40);
        Hud.Shadow(b, 20, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.12f), 4, 14));
        b.raycastTarget = true;
        var button = b.gameObject.AddComponent<Button>();
        button.onClick.AddListener(() => { Sound.Play("click"); act(); });
        float s = icon.Contains("hud-") ? 34 : 20;
        Picture(b.transform, icon, (46 - s) / 2, (40 - s) / 2, s, s);
        return button;
    }

    /// <summary>
    /// A player's picture (glyphs.ts playerAvatar): their account's card artwork in a circle on the dark of space, a
    /// white ring (1.5) and a pale one (2.5) round it. Placed by its top-left corner.
    /// </summary>
    public static RectTransform Avatar(Transform parent, float x, float y, float size)
    {
        var disc = Hud.Rect(parent, "Avatar");
        Hud.Place(disc, x, y, size, size);
        var di = disc.gameObject.AddComponent<Image>();
        di.sprite = Hud.Circle;
        di.color = Hud.Rgba(26, 28, 42);
        di.raycastTarget = false;
        Hud.Shadow(di, size / 2, new Hud.Drop(Color.white, 0, 0, 1.5f), new Hud.Drop(Hud.Rgba(223, 227, 236), 0, 0, 2.5f));
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

    /// <summary>The chip's width (see Chip).</summary>
    public static float ChipW()
    {
        var me = Profile.Me;
        string name = (string.IsNullOrEmpty(me.Name) ? "Commander" : me.Name).ToUpperInvariant();
        float whoW = Mathf.Max(K.TextW(name, 9.92f, 700, 0.1f), K.TextW($"level {me.Level}", 8.8f, 400, 0.08f, false));
        return 1 + 4 + 30 + 8 + whoW + 8 + 1 + 8 + K.TextW($"✦ {me.Stardust}", 9.6f, 400) + 8 + K.TextW($"⟁ {me.Flux}", 9.6f, 400) + 12 + 1;
    }

    /// <summary>
    /// You (app.ts playerChip): a white pill (92%) 40 tall, your picture 30 across at its left, your name (9.92 bold,
    /// spaced 0.1em) over your level (Exo 2 8.8, ink-faint), then past a hairline your stardust and flux (9.6), 8 apart;
    /// as wide as its words; `right` its right edge, `y` its top. Tap it for your profile.
    /// </summary>
    public void Chip(Transform parent, float right, float y)
    {
        var me = Profile.Me;
        string name = (string.IsNullOrEmpty(me.Name) ? "Commander" : me.Name).ToUpperInvariant(), level = $"level {me.Level}";
        string dust = $"✦ {me.Stardust}", flux = $"⟁ {me.Flux}";
        float whoW = Mathf.Max(K.TextW(name, 9.92f, 700, 0.1f), K.TextW(level, 8.8f, 400, 0.08f, false));
        float dustW = K.TextW(dust, 9.6f, 400), fluxW = K.TextW(flux, 9.6f, 400);
        float curX = 1 + 4 + 30 + 8 + whoW + 8, w = ChipW();
        var chip = Hud.Box(parent, "You", new Color(1, 1, 1, 0.92f), 20);
        Hud.Place(chip.rectTransform, right - w, y, w, 40);
        Hud.Shadow(chip, 20, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.12f), 4, 14));
        chip.raycastTarget = true;
        chip.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); profileOpen = true; ProfileView(); });
        Avatar(chip.transform, 5, 5, 30);
        K.Words(chip.transform, name, 43, 9.7f, whoW + 4, 10.9f, 9.92f, Look.Ink, true, 700, 0.1f, TextAlignmentOptions.Left);
        K.Words(chip.transform, level, 43, 20.6f, whoW + 4, 9.7f, 8.8f, Look.InkFaint, false, 400, 0.08f, TextAlignmentOptions.Left);
        var line = Hud.Rect(chip.transform, "Divider");
        Hud.Place(line, curX, 13, 1, 14);
        var li = line.gameObject.AddComponent<Image>();
        li.color = Hud.Rgba(236, 238, 243);
        li.raycastTarget = false;
        K.Words(chip.transform, dust, curX + 9, 14, dustW + 2, 12, 9.6f, Hud.Rgba(185, 133, 42), true, 400, 0, TextAlignmentOptions.Left);
        K.Words(chip.transform, flux, curX + 9 + dustW + 8, 14, fluxW + 2, 12, 9.6f, Hud.Rgba(109, 111, 208), true, 400, 0, TextAlignmentOptions.Left);
    }

    /// <summary>The web's small back button (.btn.btn-small "‹ back"), placed by its top-left corner.</summary>
    public static Button BackButton(Transform parent, System.Action back, float x, float y) => K.Btn(parent, "‹ back", back, x, y, K.Kind.Small);

    /// <summary>A setup page's frame, as the web's grid lays it out: its edges, its body's top and height, its foot.</summary>
    public struct Frame2
    {
        public float Left, Right, Top, BodyTop, BodyH, FootTop, FootH, FootPad;
    }

    /// <summary>
    /// A setup page (.menu.setup-page): padded max(12px, top) max(18px, right) max(12px, bottom) max(18px, left) (with
    /// the game modes' pane, its left the pane's width and 32 more); its header (setupTop, 52 tall: back on the left,
    /// the page's name centred, clamp(14.4px, 4vh, 20.8px) spaced 0.3em #555a63, you on the right), its body, and its
    /// foot (at least 44 tall: its tallest part and clamp(4px, 2vh, 16px) under it), clamp(8px, 3vh, 22px) apart.
    /// `foot` the foot's tallest part (0 for none; below 0, no foot at all: the body runs to the screen's foot).
    /// </summary>
    /// <summary>Setup's `foot` for a foot taking no room at all (min-height 0, no padding).</summary>
    public const float Footless = -2;

    public Frame2 Setup(Transform parent, string title, System.Action back, bool pane = false, float foot = 0, bool chip = true)
    {
        var f = new Frame2();
        f.Left = pane ? PaneW + K.SaL + 32 : K.PadL;
        f.Right = K.W - K.PadR;
        f.Top = K.PadT;
        if (!pane) BackButton(parent, back, f.Left, f.Top + 13);
        float hf = K.Clamp(0.9f * K.Rem, 4 * K.Vh, 1.3f * K.Rem), hh = hf * 1.16f;
        K.Words(parent, title.ToUpperInvariant(), f.Left, f.Top + (52 - hh) / 2, f.Right - f.Left, hh, hf, Hud.Rgba(85, 90, 99), true, 500, 0.3f);
        if (chip) Chip(parent, f.Right, f.Top + 6);
        float gap = K.Clamp(8, 3 * K.Vh, 22);
        f.BodyTop = f.Top + 52 + gap;
        if (foot <= Footless)
        {
            // (A foot with nothing in it and no height: the body to the page's padding, less the gap.)
            f.FootTop = K.H - K.PadB;
            f.BodyH = f.FootTop - gap - f.BodyTop;
            return f;
        }
        if (foot < 0)
        {
            f.FootTop = f.FootH = K.H;
            f.BodyH = K.H - f.BodyTop;
            return f;
        }
        f.FootPad = K.Clamp(4, 2 * K.Vh, 16);
        f.FootH = Mathf.Max(44, foot + f.FootPad);
        f.FootTop = K.H - K.PadB - f.FootH;
        f.BodyH = f.FootTop - gap - f.BodyTop;
        return f;
    }

    /// <summary>The same header alone, for pages built round it (online play in a room, the shop, the glossary).</summary>
    public Frame2 SetupTop(Transform parent, string title, System.Action back, bool pane = false, float foot = 0) => Setup(parent, title, back, pane, foot);

    RectTransform toast;
    float toastUntil;

    /// <summary>
    /// A word at the top of the screen for a few seconds (the web's .toast): white at 86%, corners 12, padded 7 by 16,
    /// Exo 2 11.84 ink-soft, at most min(440px, 100vw - 32px) across; calc(--pad-t + 8px) down.
    /// </summary>
    public void Toast(string text)
    {
        if (toast != null) Mats.Kill(toast.gameObject);
        var box = Hud.Box(canvas.transform, "Toast", new Color(1, 1, 1, 0.86f), 12);
        Hud.Shadow(box, 12, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.12f), 8, 22));
        toast = box.rectTransform;
        float max = Mathf.Min(440, K.W - 32) - 32;
        var words = K.Fill(toast, text, 11.84f, Look.InkSoft, false, 400);
        words.textWrappingMode = TextWrappingModes.Normal;
        var size = words.GetPreferredValues(text, max, 0);
        float w = Mathf.Min(max, size.x + 2) + 32, h = size.y + 14;
        Hud.Place(toast, (K.W - w) / 2, Mathf.Max(6, K.SaT) + 8, w, h);
        toastUntil = Time.realtimeSinceStartup + 3.6f;
    }

    void Update()
    {
        TurnRings();
        if (Css.Size != laidSize || Css.SafeInsets != laidInsets) Relayout();
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
    /// rank, your account, and changing your name or signing out. A tap off it closes it.
    /// (.profile-view: min(560px, the page less 24) across, padded clamp(12px, 3vh, 20px) by clamp(14px, 2.4vw, 22px),
    /// its rows clamp(8px, 2.4vh, 14px) apart; centred, scrolling if it runs over the page.)
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
        System.Action shut = () => { profileOpen = false; Mats.Kill(view.gameObject); if (sheet == view) sheet = null; };
        view.gameObject.AddComponent<Button>().onClick.AddListener(() => shut());
        float padL = Mathf.Max(12, K.SaL), padR = Mathf.Max(12, K.SaR), padT = Mathf.Max(6, K.SaT), padB = Mathf.Max(6, K.SaB);
        float w = Mathf.Min(560, K.W - padL - padR - 24);
        float pv = K.Clamp(12, 3 * K.Vh, 20), ph = K.Clamp(14, 2.4f * K.Vw, 22), gap = K.Clamp(8, 2.4f * K.Vh, 14);
        float inner = w - 2 * ph - 2;
        var card = Hud.Box(view, "Card", Color.white, 18);
        Hud.Shadow(card, 18, new Hud.Drop(Hud.Rgba(120, 124, 134, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(80, 80, 100, 0.18f), 30, 80), new Hud.Drop(Hud.Rgba(80, 80, 100, 0.08f), 6, 18));
        card.raycastTarget = true;
        // (The card itself swallows taps, so only the veil closes.)
        card.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        float maxH = K.H - padT - padB - 24;
        var body = K.Scroller(card.transform, "Body", 0, 0, w, maxH, maxH);
        float x = 1 + ph, y = 1 + pv;
        // Its head (.pv-head): your picture (clamp(34px, 10vh, 46px)), name (clamp(12.8px, 3vh, 16px), spaced 0.16em)
        // and record (Exo 2 10.56, ink-soft), and close, 12 apart.
        float av = K.Clamp(34, 10 * K.Vh, 46), nf = K.Clamp(12.8f, 3 * K.Vh, 16);
        Avatar(body, x, y, av);
        float closeW = K.BtnW("close", K.Kind.Pill, 8.96f);
        float whoX = x + av + 12, whoW = inner - av - 12 - 12 - closeW, whoH = nf * 1.16f + 1 + 12.4f;
        var nm = K.Words(body, (string.IsNullOrEmpty(p.Name) ? "Commander" : p.Name).ToUpperInvariant(), whoX, y + (av - whoH) / 2, whoW, nf * 1.16f, nf, Look.Ink, true, 500, 0.16f, TextAlignmentOptions.Left);
        nm.overflowMode = TextOverflowModes.Ellipsis;
        K.Words(body, $"{p.Won} won of {p.Played} played", whoX, y + (av - whoH) / 2 + nf * 1.16f + 1, whoW, 12.4f, 10.56f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
        K.Btn(body, "close", () => shut(), x + inner - closeW, y + (av - 22) / 2, K.Kind.Pill, closeW, 22, 8.96f);
        y += av + gap;
        // Level (and its experience), stardust, flux and rank (.pv-grid: four boxes 8 apart, #f7f8fb, corners 12, an
        // inset hairline; padded 8 by 10; its name Exo 2 8 spaced 0.12em, its value clamp(11.2px, 2.6vh, 14.4px)).
        int need = Progression.XpToNext(p.Level);
        float bf = K.Clamp(11.2f, 2.6f * K.Vh, 14.4f), bwid = (inner - 24) / 4, bh = 8 + 9 + 3 + bf * 1.2f + 3 + 4 + 3 + 9 + 8;
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
            var edge = K.Inset(body, head, Hud.Rgba(247, 248, 251), Hud.Rgba(236, 238, 243), 12);
            Hud.Place(edge.rectTransform, x + i * (bwid + 8), y, bwid, bh);
            float iw = bwid - 20;
            K.Words(edge.transform, head, 10, 8, iw, 9, 8, Look.InkFaint, false, 400, 0.12f, TextAlignmentOptions.Left);
            var v = K.Words(edge.transform, shown.ToUpperInvariant().Replace("<SIZE=85%>", "<size=85%>").Replace("</SIZE>", "</size>"), 10, 20, iw, bf * 1.2f, bf, ink, true, 500, 0.06f, TextAlignmentOptions.Left);
            v.overflowMode = TextOverflowModes.Ellipsis;
            if (bar >= 0)
            {
                var track = Hud.Box(edge.transform, "Bar", Hud.Rgba(238, 240, 245), 2);
                Hud.Place(track.rectTransform, 10, 23 + bf * 1.2f, iw, 4);
                // (Its fill: the web's blue to violet.)
                var fill = Hud.Rect(track.transform, "Fill");
                Hud.Place(fill, 0, 0, iw * Mathf.Clamp01(bar), 4);
                var fi = fill.gameObject.AddComponent<RawImage>();
                fi.texture = Across(Hud.Rgba(159, 180, 255), Hud.Rgba(201, 164, 255));
                fi.raycastTarget = false;
            }
            if (foot.Length > 0) K.Words(edge.transform, foot, 10, 30 + bf * 1.2f, iw, 9, 8, Look.InkFaint, false, 400, 0.12f, TextAlignmentOptions.Left);
        }
        y += bh + gap;
        // Your account (and deleting it), then changing your name and signing out: AccountView.ProfileRows.
        y = AccountView.ProfileRows(body, this, ProfileView, x, y, inner, gap);
        float h = Mathf.Min(maxH, y + pv + 1);
        body.sizeDelta = new Vector2(0, Mathf.Max(h, y + pv + 1));
        Hud.Place(((RectTransform)body.parent), 0, 0, w, h);
        Hud.Place(card.rectTransform, padL + (K.W - padL - padR - w) / 2, padT + (K.H - padT - padB - h) / 2, w, h);
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
        var f = Setup(page, "options", () => Show("hub"));
        bool share = Store.Get("blue-loop:share-stats") != "0";
        SettingsPanel(page, f, new[]
        {
            new Hud.Row("sound", () => { Sound.Muted = !Sound.Muted; Show("options"); }, Sound.Muted ? "off" : "on"),
            new Hud.Row("music", Sound.Muted ? (System.Action)null : () => { Sound.MusicOn = !Sound.MusicOn; Show("options"); }, Sound.MusicOn && !Sound.Muted ? "on" : "off"),
            new Hud.Row("ai speed", () => { BattleView.NextSpeed(); Show("options"); }, BattleView.Speed),
            new Hud.Row("share game stats\nAll data is anonymous.", () => { Store.Set("blue-loop:share-stats", share ? "0" : "1"); Show("options"); }, share ? "on" : "off"),
        });
    }

    RectTransform flower;

    /// <summary>
    /// The web's settings panel (.menu-options .settings-panel), centred in the page's body: min(380px, the body)
    /// across, white at 55%, corners 22, a faint ring and a wide shadow; padded 14, and clamp(80px, 18vh, 130px) at its
    /// foot. In it the rows' list (.set-list: 72% white, corners 16, padded 4, 2 between), each row at least
    /// clamp(36px, 7vh, 46px) tall with a hairline above all but the first, its name (10.56, spaced 0.22em; a line
    /// under it in Exo 2 after a newline) left and its setting in a grey pill right; the Stellari's flower
    /// (clamp(150px, 34vh, 240px)) centred on the panel's foot, cut by it.
    /// </summary>
    void SettingsPanel(Transform parent, Frame2 f, Hud.Row[] rows)
    {
        float w = Mathf.Min(380, f.Right - f.Left), minRow = K.Clamp(36, 7 * K.Vh, 46), foot = K.Clamp(80, 18 * K.Vh, 130);
        var heights = rows.Select(r => Mathf.Max(minRow, r.Label.Contains("\n") ? 12 + 3 + 12 + 4 : 0)).ToArray();
        float listH = 8 + heights.Sum() + (rows.Length - 1) * 2, h = 14 + listH + foot;
        float x = (f.Left + f.Right - w) / 2, y = f.BodyTop + (f.BodyH - h) / 2;
        var panel = Hud.Box(parent, "Settings", new Color(1, 1, 1, 0.55f), 22);
        Hud.Place(panel.rectTransform, x, y, w, h);
        Hud.Shadow(panel, 22, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.1f), 14, 40));
        panel.gameObject.AddComponent<RectMask2D>();
        // The flower, turning (one turn in 90 seconds), under the list.
        float fs = K.Clamp(150, 34 * K.Vh, 240);
        var fl = Hud.Rect(panel.transform, "Flower");
        Hud.At(fl, new Vector2(0.5f, 0), Vector2.zero, new Vector2(fs, fs));
        fl.pivot = new Vector2(0.5f, 0.5f);
        var fi = fl.gameObject.AddComponent<RawImage>();
        fi.texture = Resources.Load<Texture2D>("Icons/settings-flower");
        fi.color = new Color(1, 1, 1, 0.9f);
        fi.raycastTarget = false;
        flower = fl;
        var list = Hud.Box(panel.transform, "List", new Color(1, 1, 1, 0.72f), 16);
        Hud.Place(list.rectTransform, 14, 14, w - 28, listH);
        Hud.Shadow(list, 16, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.06f), 6, 18));
        float rowW = w - 28 - 8, ry = 4;
        for (int i = 0; i < rows.Length; i++)
        {
            var row = rows[i];
            float rowH = heights[i];
            var r = Hud.Box(list.transform, row.Label, Color.white, 12);
            Hud.Place(r.rectTransform, 4, ry, rowW, rowH);
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
                Hud.Place(line, 4, ry - 1, rowW, 1);
                var li = line.gameObject.AddComponent<Image>();
                li.color = Hud.Rgba(58, 66, 86, 0.06f);
                li.raycastTarget = false;
            }
            var parts = row.Label.Split('\n');
            float labelH = parts.Length > 1 ? 27 : 12;
            var l = K.Words(r.transform, parts[0].ToUpperInvariant(), 16, (rowH - labelH) / 2, rowW - 100, 12, 10.56f, Look.Ink, true, 400, 0.22f, TextAlignmentOptions.Left);
            l.alpha = fade;
            if (parts.Length > 1)
            {
                var sub = K.Words(r.transform, parts[1], 16, (rowH - labelH) / 2 + 15, rowW - 100, 12, 10.56f, Look.InkFaint, false, 400, 0.02f, TextAlignmentOptions.Left);
                sub.alpha = fade;
            }
            if (row.Value != null)
            {
                string v = row.Value.ToUpperInvariant();
                float vw = Mathf.Max(44, K.TextW(v, 9.6f, 500, 0.16f) + 20);
                var pill = Hud.Box(r.transform, "Value", Hud.Rgba(240, 242, 246), 9.5f);
                Hud.Place(pill.rectTransform, rowW - 12 - vw, (rowH - 19) / 2, vw, 19);
                pill.color = new Color(pill.color.r, pill.color.g, pill.color.b, fade);
                var vl = K.Fill(pill.transform, v, 9.6f, Look.InkSoft, true, 500, 0.16f);
                vl.alpha = fade;
            }
            else
            {
                var chev = K.Words(r.transform, "›", rowW - 28, 0, 16, rowH, 17.6f, Look.InkFaint, false, 400);
                chev.alpha = fade;
            }
            ry += rowH + 2;
        }
    }
}
