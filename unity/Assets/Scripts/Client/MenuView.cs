using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
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
    // (The size and safe area the page was laid out for: a change lays it out again.)
    Vector2 laidSize;
    Vector4 laidInsets;
    bool profileOpen;

    /// <summary>The menu on screen (there is one at a time).</summary>
    public static MenuView Live { get; private set; }

    public static MenuView Make(Camera cam, string page)
    {
        var v = new GameObject("Menu").AddComponent<MenuView>();
        Live = v;
        v.cam = cam;
        v.canvas = Hud.CssCanvas(cam);
        v.canvas.transform.SetParent(v.transform, false);
        v.Background();
        Account.Replaced += v.Replaced;
        string room = null;
        if (page == "title" && !opened) page = v.Opening(out room);
        opened = true;
        v.Show(page);
        // (Into the room once its page is up: your deck as it shows it.)
        if (room != null) Online.Go(room);
        Sound.Scene("voyage");
        return v;
    }

    void OnDestroy()
    {
        // (Another screen now: the menu, come back to, rises in. A menu that has already taken over keeps its own.)
        if (Live == this)
        {
            Live = null;
            if (shownPage != null) shownPage = "elsewhere";
        }
        Account.Replaced -= Replaced;
    }

    static bool opened;

    /// <summary>Menu pages the game comes back to when it reads the account's progress again (app.ts RESUMABLE).</summary>
    static readonly string[] Resumable = { "hub", "quickplay", "options", "collection", "shop" };

    void Replaced() => Reload();

    /// <summary>
    /// Another device's newer progress taken up (account.ts onProgressReplaced, checkIn): the web reloads the page to
    /// read it, coming back to the menu page you were on if it is one to come back to (and you are signed in; the shop,
    /// without a connection, the hub), else to the title page. So here: the menu read again from the start, the
    /// session's choices (quickplay's seats, the pages' picks) forgotten as a reload forgets them.
    /// </summary>
    public void Reload()
    {
        if (this == null || page == null) return;
        string to = System.Array.IndexOf(Resumable, current) >= 0 && !AccountView.Needed ? current : "title";
        seatAI = null;
        GlossaryView.Tab = "basics";
        TutorialView.Picked = null;
        ChallengesView.Picked = null;
        ShopView.Forget();
        shownPage = null;
        Show(to);
    }

    /// <summary>
    /// The game opened (app.ts start): at the title page; or, from a password-reset link (?reset=TOKEN), at choosing a
    /// new password; or, from an invite link (?room=CODE), straight into the room's lobby (signed in, or back to a seat
    /// this device holds in it), else signing in first and then on into it.
    /// </summary>
    string Opening(out string room)
    {
        room = null;
        string first = "title";
        var reset = AccountView.TakeReset();
        if (reset != null)
        {
            AccountView.Reset(reset);
            first = "signin";
        }
        var invite = Online.TakeInvite();
        if (invite == null) return first;
        if (!AccountView.Needed || Online.HasSeat(invite))
        {
            room = invite;
            return "online";
        }
        AccountView.Begin();
        AccountView.ThenRoom = invite;
        return "signin";
    }

    /// <summary>The campaign's own pages, still laid out at the 1600 × 1000 reference and fitted whole (Frame).</summary>
    /// <summary>The campaign's own pages: each lays itself out again as the screen changes (its RefLayer).</summary>
    static bool Legacy(string name) => name == "campaign" || name == "stellari" || name == "captain" || name == "hangar";

    /// <summary>The page's own light (styles.css body's background), and the Stellari over it (backdrop.ts).</summary>
    void Background()
    {
        backdrop = new GameObject("Backdrop", typeof(RectTransform));
        backdrop.transform.SetParent(canvas.transform, false);
        Hud.Fill((RectTransform)backdrop.transform);
        var bg = Hud.Rect(backdrop.transform, "Background");
        Hud.Fill(bg);
        page0 = bg.gameObject.AddComponent<RawImage>();
        page0.raycastTarget = false;
        // The Stellari behind it all (art.ts petalBackdrop, backdrop.ts): its two rings of petals, turning slowly (one
        // turn in three minutes; the inner ring the other way, at 0.6 of it), and its glow from the top laid over them
        // (the web's third layer, drawn last). Framed as the web frames it (its viewBox 0 -300 1000 900, sliced to cover
        // the page from its top, centred across): see FrameStage.
        stage = Hud.Rect(backdrop.transform, "Stage");
        var rings = Hud.Rect(stage, "Rings");
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
        var glow = Hud.Rect(stage, "Glow");
        glow.anchorMin = glow.anchorMax = glow.pivot = new Vector2(0.5f, 1);
        var gi = glow.gameObject.AddComponent<RawImage>();
        gi.texture = GlowTexture();
        gi.raycastTarget = false;
        FrameStage();
    }

    RectTransform stage, outerRing, innerRing;
    RawImage page0;
    Vector2 page0Size;
    float ringAngle;

    /// <summary>
    /// The Stellari framed to the page (xMidYMin slice of the web's 1000 × 900 view): s the larger of the page's width
    /// over 1000 and its height over 900; the glow the whole view, from the top; the rings (680 of its units across)
    /// turning on its heart, 470 units down. The page's light drawn afresh for its size.
    /// </summary>
    void FrameStage()
    {
        if (stage == null) return;
        if (page0 != null && page0Size != new Vector2(K.W, K.H))
        {
            page0Size = new Vector2(K.W, K.H);
            if (page0.texture != null) Destroy(page0.texture);
            page0.texture = PageLight(K.W, K.H);
        }
        float s = Mathf.Max(K.W / 1000f, K.H / 900f);
        Hud.Fill(stage);
        var rings = (RectTransform)stage.Find("Rings");
        rings.anchoredPosition = new Vector2(0, -470 * s);
        rings.sizeDelta = new Vector2(680 * s, 680 * s);
        var glow = (RectTransform)stage.Find("Glow");
        glow.anchoredPosition = Vector2.zero;
        glow.sizeDelta = new Vector2(1000 * s, 900 * s);
    }

    /// <summary>
    /// The page's light, w by h (styles.css body): a white glow from the top middle (an ellipse 70% by 60% of the page:
    /// white, 60% at 0.4 of the way, gone at 0.75) over a soft grey from below (an ellipse 120% by 90% about 110% down:
    /// #dedcd8, gone at 0.6) over #faf9f6 at the top, the paper (#f3f2ee) 55% down, #e0dfdb at the foot.
    /// </summary>
    static Texture2D PageLight(float w, float h)
    {
        const int N = 128;
        var t = new Texture2D(N, N, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
        var px = new Color32[N * N];
        Color top = Hud.Rgba(250, 249, 246), paper = Hud.Rgba(243, 242, 238), foot = Hud.Rgba(224, 223, 219), grey = Hud.Rgba(222, 220, 216);
        for (int j = 0; j < N; j++)
        {
            // (Row 0 the page's foot; each texel taken at its middle.)
            float y = (1 - (j + 0.5f) / N) * h, k = y / h;
            Color c = k < 0.55f ? Color.Lerp(top, paper, k / 0.55f) : Color.Lerp(paper, foot, (k - 0.55f) / 0.45f);
            for (int i = 0; i < N; i++)
            {
                float dx = (i + 0.5f) / N * w - w / 2;
                float t2 = Mathf.Sqrt(Sq(dx / (1.2f * w)) + Sq((y - 1.1f * h) / (0.9f * h)));
                Color o = Color.Lerp(c, grey, Mathf.Clamp01(1 - t2 / 0.6f));
                float t1 = Mathf.Sqrt(Sq(dx / (0.7f * w)) + Sq(y / (0.6f * h)));
                float a1 = t1 < 0.4f ? Mathf.Lerp(1, 0.6f, t1 / 0.4f) : Mathf.Lerp(0.6f, 0, (t1 - 0.4f) / 0.35f);
                o = Color.Lerp(o, Color.white, Mathf.Clamp01(a1));
                o.a = 1;
                px[j * N + i] = o;
            }
        }
        t.SetPixels32(px);
        t.Apply();
        return t;
    }

    static float Sq(float v) => v * v;
    static Texture2D glowTex;

    /// <summary>
    /// The Stellari's glow over its petals (art.ts petalBackdrop #glow) across its whole 1000 × 900 view: a circle of 520
    /// about its heart (500, 170), filled from the top of its box (500, -350) out to 728 (70% of it): white, then
    /// #fbfaf6 at 80% by 0.4 of the way, to nothing at its end.
    /// </summary>
    static Texture2D GlowTexture()
    {
        if (glowTex != null) return glowTex;
        const int W = 500, H = 450;
        const float U = 1000f / W;
        var t = new Texture2D(W, H, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
        var px = new Color32[W * H];
        Color warm = Hud.Rgba(251, 250, 246);
        for (int j = 0; j < H; j++)
        {
            float y = 600 - (j + 0.5f) * U;
            for (int i = 0; i < W; i++)
            {
                float x = (i + 0.5f) * U;
                float cover = Mathf.Clamp01((520 - Mathf.Sqrt(Sq(x - 500) + Sq(y - 170))) / U + 0.5f);
                float g = Mathf.Sqrt(Sq(x - 500) + Sq(y + 350)) / 728f;
                Color c;
                float a;
                if (g < 0.4f)
                {
                    // (Between the stops in premultiplied colour, as the browser draws it.)
                    float k = g / 0.4f;
                    a = Mathf.Lerp(1, 0.8f, k);
                    c = Color.Lerp(Color.white, warm * 0.8f, k) / a;
                }
                else
                {
                    a = Mathf.Lerp(0.8f, 0, Mathf.Clamp01((g - 0.4f) / 0.6f));
                    c = warm;
                }
                c.a = a * cover;
                px[j * W + i] = c;
            }
        }
        t.SetPixels32(px);
        t.Apply();
        return glowTex = t;
    }

    void TurnRings()
    {
        // (The outer ring clockwise, as the web turns it, two degrees a second; the inner the other way, at 0.6 of it.)
        ringAngle = (ringAngle + 2 * Time.deltaTime) % 1800;
        // (A burst's turn eased along; a finished one folded into the angle: backdrop.ts frame.)
        float extra = 0;
        for (int i = bursts.Count - 1; i >= 0; i--)
        {
            float t = (Time.time - bursts[i]) / BurstLength;
            if (t >= 1)
            {
                ringAngle = (ringAngle + BurstTurn) % 1800;
                bursts.RemoveAt(i);
                continue;
            }
            extra += BurstTurn * (0.5f - Mathf.Cos(Mathf.PI * Mathf.Max(0, t)) / 2);
        }
        float a = ringAngle + extra;
        if (outerRing != null) outerRing.localRotation = Quaternion.Euler(0, 0, -a);
        if (innerRing != null) innerRing.localRotation = Quaternion.Euler(0, 0, a * 0.6f);
    }

    /// <summary>The Stellari's bursts of speed under way (when each began): 30° more over 1.8 s, eased in and out (backdrop.ts spin).</summary>
    readonly List<float> bursts = new List<float>();
    const float BurstTurn = 30, BurstLength = 1.8f;

    /// <summary>The Stellari spins faster for a moment (at most three bursts at once, so a flurry does not whirl it).</summary>
    void Spin()
    {
        if (bursts.Count < 3) bursts.Add(Time.time);
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
            t.WordsH = K.LineH(t.Font);
            t.H = t.Sun + t.Gap + t.WordsH;
        }
        else
        {
            t.Sun = Mathf.Min(130, 26 * K.Vh);
            t.Font = K.Clamp(1.4f * K.Rem, Mathf.Min(10 * K.Vh, 6.6f * K.Vw), 3.8f * K.Rem);
            t.Gap = 22;
            t.WordsH = K.LineH(t.Font);
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
        // (The shop needs the server: without a connection, the hub instead.)
        if (name == "shop" && Connection.Offline) name = "hub";
        // (The Stellari's tree opened from the campaign's menu (campaign.ts cmp-shop): its scene kept, the camera gliding
        // down to the Stellari on the horizon, the menu's options fading; the tree coming in over it once it is there.)
        bool glide = name == "stellari" && scene != null;
        if (page != null && !(glide && CampaignMenuPage.FadeOut(page))) Mats.Kill(page.gameObject);
        sheet = null;
        profileOpen = false;
        leaving = false;
        tweens.Clear();
        parts.Clear();
        framed = null;
        CloseZoom();
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
        if (!campaign && !glide && scene != null) { Mats.Kill(scene.gameObject); scene = null; }
        if (scene != null) scene.Focus(name == "captain" || name == "hangar" ? name : glide ? "research" : null);
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
        if (glide) CampaignMenuPage.TreeIn(page, backdrop);
        // (A new page rises in; the campaign's own pages are its screen's, not the menu's.)
        else if (shownPage != null && name != shownPage && !Legacy(name)) Enter();
        shownPage = name;
    }

    /// <summary>The page's own light and the Stellari over it (laid over the campaign's scene as it fades in).</summary>
    public GameObject Backdrop => backdrop;

    /// <summary>The page drawn again where it stands (what it shows has changed: the connection, your picture).</summary>
    public void Redraw() => Relayout();

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
        // (Its parts come and go one by one: the block, start, the studio's name.)
        int mark = page.childCount;
        TitleBlock(page, MidX, y, false);
        PartFrom(mark);
        float bw = Mathf.Max(180, K.TextW("START", 12.8f, 700, 0.3f) + 58);
        mark = page.childCount;
        K.Btn(page, "Start", () => Nav(Begin), MidX - bw / 2, y + t.H + gap, K.Kind.Primary, bw, bh, 12.8f, 0.3f);
        PartFrom(mark);
        Studio();
    }

    /// <summary>
    /// Start: on to the hub, or into the room an invite link named; first, where there is a server, signing in (everyone
    /// plays with an account) and naming yourself.
    /// </summary>
    void Begin()
    {
        var invite = Online.TakeInvite();
        // (Back to your seat in the room after a reload, straight away: app.ts, signed in or holding a seat.)
        if (AccountView.Needed && !(invite != null && Online.HasSeat(invite)))
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
        // (Centred with the spacing after its last letter, as the browser centres it: half of it to the left.)
        int mark = page.childCount;
        K.Words(page, "CORONAL MASS GAMES", -0.15f * 8, K.H - Mathf.Max(10, K.SaB) - K.LineH(8), K.W, K.LineH(8), 8, Look.InkFaint, true, 400, 0.3f);
        PartFrom(mark);
    }

    // ---- The hub ----

    /// <summary>The fullscreen button's mark as it was drawn (it follows fullscreen as it changes: app.ts fullscreenchange).</summary>
    bool drawnFullscreen;

    void Hub()
    {
        bool offline = Connection.Offline;
        // Shop, collection and glossary as plain links, top left (.hub-links: max(12px, top) down, max(18px, left)
        // in, 46 tall, clamp(14px, 2.4vw, 28px) apart; each its mark 22 across, 7 on, its name 10.24 bold spaced 0.2em).
        float top = Mathf.Max(12, K.SaT);
        var links = new[] { ("shop", "Shop"), ("collection", "Collection"), ("glossary", "Glossary") };
        float linkX = Mathf.Max(18, K.SaL), linkGap = K.Clamp(14, 2.4f * K.Vw, 28);
        int mark = page.childCount;
        foreach (var (icon, name) in links)
        {
            // (The browser counts the spacing after the last letter too.)
            float nameW = K.TextW(name.ToUpperInvariant(), 10.24f, 700, 0.2f) + 0.2f * 10.24f;
            float linkW = 2 + 22 + 7 + nameW + 2;
            var b = K.Hit(page, name, null);
            Hud.Place((RectTransform)b.transform, linkX, top + 8, linkW, 30);
            linkX += linkW + linkGap;
            string to = icon;
            b.onClick.AddListener(() => { Sound.Play("click"); Nav(() => Go(to)); });
            // (The shop needs the server, as online play does: without it (.hub-offline) faded to 45%, taking no taps.)
            if (to == "shop" && offline)
            {
                b.interactable = false;
                b.gameObject.AddComponent<CanvasGroup>().alpha = 0.45f;
            }
            Picture(b.transform, $"Icons/{icon}-small", 2, 4, 22, 22);
            var word = K.Words(b.transform, name.ToUpperInvariant(), 31, 0, nameW + 4, 30, 10.24f, Look.Ink, true, 700, 0.2f, TextAlignmentOptions.Left);
            // (Under a mouse, its name in the blue of the marks: .hub-link:hover.)
            if (b.interactable) MenuHover.On(b.gameObject, on => word.color = on ? Hud.Rgba(63, 111, 168) : Look.Ink);
        }
        PartFrom(mark);
        // You, then options and full screen (where the browser offers it): white pills top right (.hub-corner:
        // max(18px, right) in, 8 apart; each button 46 by 40, its mark 20 across).
        float right = K.W - Mathf.Max(18, K.SaR);
        mark = page.childCount;
        drawnFullscreen = Connection.FullscreenOn;
        if (Connection.FullscreenOffered)
        {
            RoundButton(page, right - 46, top, drawnFullscreen ? "Icons/hud-exit-fullscreen" : "Icons/hud-fullscreen", () => { Screen.fullScreen = !Connection.FullscreenOn; });
            right -= 46 + 8;
        }
        RoundButton(page, right - 46, top, "Icons/options-small", () => Nav(() => Show("options")));
        Chip(page, right - 46 - 8, top);
        PartFrom(mark);

        // The title and the five ways to play, centred above the foot's 12vh (.hub: tiles --ht across, clamp(84px,
        // min(30vh, 15vw), 150px), 1.05 as tall, clamp(10px, 2vw, 20px) apart; clamp(10px, 3.5vh, 26px) under the title).
        var tiles = new[] { ("campaign", "A dying universe"), ("quickplay", "Quickplay"), ("online", "Online"), ("tutorial", "Tutorial"), ("challenges", "Challenges") };
        var t = TitleMeasures(true);
        float ht = K.Clamp(84, Mathf.Min(30 * K.Vh, 15 * K.Vw), 150), cardH = ht * 1.05f, gapX = K.Clamp(10, 2 * K.Vw, 20);
        bool anyCont = CampaignView.HasSave || BattleView.HasSave;
        float colH = cardH + (anyCont ? 8 + 26 : 0), gap = K.Clamp(10, 3.5f * K.Vh, 26);
        float padT = Mathf.Max(6, K.SaT), stack = t.H + gap + colH;
        float y = padT + (K.H - padT - 12 * K.Vh - stack) / 2;
        mark = page.childCount;
        TitleBlock(page, MidX, y, true);
        PartFrom(mark);
        float cardY = y + t.H + gap, x0 = MidX - (5 * ht + 4 * gapX) / 2;
        // (.hub-card: its mark clamp(26px, 8vh, 42px) over its name, clamp(8.96px, 2.3vh, 12.48px) bold spaced 0.2em,
        // clamp(6px, 2vh, 12px) between, centred in the card; corners 16; two soft shadows.)
        float iconS = K.Clamp(26, 8 * K.Vh, 42), inner = K.Clamp(6, 2 * K.Vh, 12), nameF = K.Clamp(8.96f, 2.3f * K.Vh, 12.48f);
        for (int i = 0; i < tiles.Length; i++)
        {
            var (key, name) = tiles[i];
            bool off = key == "online" && offline;
            float x = x0 + i * (ht + gapX);
            // (Each tile and its continue come and go as one: .hub-col.)
            mark = page.childCount;
            // (Offline, the tile, its shadows and all fade to 45% as one: .hub-offline's opacity.)
            Transform under = page;
            if (off)
            {
                var col = Hud.Rect(page, "Faded");
                Hud.Fill(col);
                var fade = col.gameObject.AddComponent<CanvasGroup>();
                fade.alpha = 0.45f;
                under = col;
            }
            // (.hub-card: white fading to #f5f5f3 down it, in a white hairline.)
            var tile = Hud.Box(under, name, Color.white, 16);
            Hud.Place(tile.rectTransform, x, cardY, ht, cardH);
            var shades = Hud.Shadow(tile, 16, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.14f), 14, 34), new Hud.Drop(Hud.Rgba(80, 84, 100, 0.08f), 2, 6));
            tile.raycastTarget = true;
            var shade = Hud.Box(tile.transform, "Fill", Color.white, 15);
            Hud.Fill(shade.rectTransform);
            shade.rectTransform.offsetMin = new Vector2(1, 1);
            shade.rectTransform.offsetMax = new Vector2(-1, -1);
            shade.raycastTarget = false;
            shade.gameObject.AddComponent<Mask>().showMaskGraphic = false;
            var grad = Hud.Rect(shade.transform, "Gradient");
            Hud.Fill(grad);
            var gi = grad.gameObject.AddComponent<RawImage>();
            gi.texture = K.Down(Color.white, Hud.Rgba(245, 245, 243));
            gi.raycastTarget = false;
            var b = tile.gameObject.AddComponent<Button>();
            // (No tint: under a mouse its shadow deepens and its contents lift; pressed, it shrinks a little.)
            b.transition = Selectable.Transition.None;
            // (Online play needs the server: without it, its tile reads offline, faded, and takes no taps.)
            b.interactable = !off;
            string target = key;
            b.onClick.AddListener(() => { Sound.Play("click"); Nav(() => Go(target)); });
            string shown = (off ? "offline" : name).ToUpperInvariant();
            // (Two lines when the name is wider than the card's inside.)
            float innerW = ht - 22;
            bool twoLines = K.TextW(shown, nameF, 700, 0.2f) > innerW;
            float nameH = K.LineH(nameF) * (twoLines ? 2 : 1), top2 = (cardH - (iconS + inner + nameH)) / 2;
            var contents = Hud.Rect(tile.transform, "Contents");
            Hud.Fill(contents);
            Picture(contents, $"Icons/{key}", (ht - iconS) / 2, top2, iconS, iconS);
            var label = K.Words(contents, shown, 11, top2 + iconS + inner, innerW, nameH, nameF, Look.Ink, true, 700, 0.2f);
            label.textWrappingMode = TextWrappingModes.Normal;
            label.lineSpacing = -8;
            if (!off) HubCard(tile, shades, contents);
            // (A run or a game against the AI left part way: continue it, a small button 8 under its card.)
            System.Action cont = target == "campaign" && CampaignView.HasSave ? () => App.Instance.Run(CampaignView.Saved())
                : target == "quickplay" && BattleView.HasSave ? () => App.Instance.Continue() : (System.Action)null;
            if (cont != null)
            {
                float cw = K.BtnW("continue", K.Kind.Small);
                var cb = K.Btn(page, "continue", () => Nav(cont), x + (ht - cw) / 2, cardY + cardH + 8, K.Kind.Small, cw);
                MenuHover.On(cb.gameObject, null);
            }
            PartFrom(mark, true);
        }
        Studio();
    }

    /// <summary>On to a menu page (app.ts menu-page): online play and the shop need the server, and say so without a connection.</summary>
    public void Go(string to)
    {
        if ((to == "online" || to == "shop") && Connection.Offline) { Toast("Offline."); return; }
        Show(to);
    }

    /// <summary>
    /// A hub tile's feel (.hub-card): under a mouse, its shadow deepens (0 20px 40px at 18%) and its contents lift 3
    /// (0.18 s, ease); pressed, it shrinks to 0.98; and it chimes softly as the pointer comes onto it.
    /// </summary>
    static void HubCard(Image tile, Shades shades, RectTransform contents)
    {
        var feel = tile.gameObject.AddComponent<HubFeel>();
        feel.Shades = shades;
        feel.Contents = contents;
        MenuHover.On(tile.gameObject, on => feel.Over = on, down => feel.Down = down);
    }

    // ---- Quickplay: the game mode, then two seats, each a deck and who plays it ----

    static readonly string[] BotNames = { "Unit Parhelion", "Kepler-9", "Null Vector", "Coronabot", "Tycho Engine", "Sentinel K4", "Orrery", "Halo Mk II", "Lagrange", "Umbra-7", "Perihelion", "Quasar Drone", "Brightwire", "Heliostat", "Ember Logic", "Cold Fusion" };

    /// <summary>
    /// Quickplay's seats (app.ts seats), kept while the game runs: whether the AI plays it, its deck (by id: the seat's
    /// last played, else a starter), a second human's name, and the bot's name the AI plays under (each picked at random).
    /// </summary>
    static bool[] seatAI;
    static string[] seatDeck, seatName, seatBot;

    static void Seats()
    {
        if (seatAI != null) return;
        var presets = Decks.Presets;
        seatAI = new[] { false, true };
        seatDeck = new[] { LastDeck(0) ?? presets[0].Id, LastDeck(1) ?? presets[1 % presets.Count].Id };
        seatName = new[] { string.IsNullOrEmpty(Profile.Me.Name) ? "Commander" : Profile.Me.Name, "Player 2" };
        seatBot = new[] { BotName(), BotName() };
    }

    /// <summary>Each quickplay seat's last played deck (blue-loop:recent-decks, app.ts lastDeck), if it still exists.</summary>
    const string RecentKey = "blue-loop:recent-decks";

    static string LastDeck(int seat)
    {
        try
        {
            var all = Newtonsoft.Json.Linq.JObject.Parse(Store.Get(RecentKey) ?? "{}");
            var id = all[seat.ToString()] is Newtonsoft.Json.Linq.JArray list && list.Count > 0 ? (string)list[0] : null;
            return id != null && Decks.ById(id) != null ? id : null;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>A seat's deck, played: the one it starts with next time (app.ts noteRecentDeck).</summary>
    static void NoteRecentDeck(int seat, string deckId)
    {
        Newtonsoft.Json.Linq.JObject all;
        try { all = Newtonsoft.Json.Linq.JObject.Parse(Store.Get(RecentKey) ?? "{}"); }
        catch { all = new Newtonsoft.Json.Linq.JObject(); }
        all[seat.ToString()] = new Newtonsoft.Json.Linq.JArray(deckId);
        Store.Set(RecentKey, all.ToString(Newtonsoft.Json.Formatting.None));
    }

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

    /// <summary>A seat's deck, if it is one for the mode played (a starter or one of yours), else that mode's starter for the seat (app.ts seatDeck).</summary>
    public Decks.Saved SeatDeck(int seat)
    {
        Seats();
        var d = Decks.ById(seatDeck[seat]);
        if (d != null && Modes.ModeOf(d) == PlayMode) return d;
        var starters = Decks.Presets.Where(x => x.Mixed != true && Modes.ModeOf(x) == PlayMode).ToList();
        return starters[seat % starters.Count];
    }

    /// <summary>
    /// Launch (app.ts newGame): each seat as set, a human under their name (you under yours; a name with profanity in it
    /// plays as "Player n"), the AI under its bot's; each seat's deck noted as its last played.
    /// </summary>
    void Launch()
    {
        var players = new List<PlayerSetup>();
        for (int i = 0; i < 2; i++)
        {
            var deck = SeatDeck(i);
            NoteRecentDeck(i, deck.Id);
            string typed = seatAI[i] ? seatBot[i] : i == 0 ? (string.IsNullOrEmpty(Profile.Me.Name) ? seatName[i] : Profile.Me.Name) : seatName[i];
            string name = (AccountView.Profane(typed) ? $"Player {i + 1}" : typed ?? "").Trim();
            if (name.Length == 0) name = "Unnamed";
            // (Your own picture is your account's; anyone else's is dealt by their name.)
            string avatar = (!seatAI[i] && i == 0 ? Account.Current?.Avatar : null) ?? PictureFor(name);
            players.Add(new PlayerSetup { Name = name, IsAI = seatAI[i], Deck = deck.Cards.ToList(), DeckName = deck.Name, Avatar = avatar });
        }
        App.Instance.Battle(players, PlayMode);
    }

    /// <summary>A picture for a name (glyphs.ts pictureFor): a card's, the same for the same name.</summary>
    static string PictureFor(string name)
    {
        var pool = CardData.All.Where(c => c.Token != true).ToList();
        if (pool.Count == 0) return null;
        uint h = 0;
        foreach (char ch in name.ToLowerInvariant()) h = unchecked(h * 31 + ch);
        return pool[(int)(h % (uint)pool.Count)].Id;
    }

    void Quickplay()
    {
        Seats();
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
            // (Only a second human types a name: you play as yourself, and the AI as its bot.)
            string name = seatAI[s] ? seatBot[s] : s == 0 ? (string.IsNullOrEmpty(Profile.Me.Name) ? seatName[0] : Profile.Me.Name) : seatName[s];
            Seat(page, sx + s * (sw + gap), sy, sw, rowH, name, seatAI[s] ? "ai" : "human", () =>
            {
                seatAI[s] = !seatAI[s];
                if (seatAI[s]) seatBot[s] = BotName(seatBot[1 - s]);
                Show("quickplay");
            }, null, false, s, typed: !seatAI[s] && s > 0 ? v => seatName[s] = v : (System.Action<string>)null);
        }
        float lw = Mathf.Max(160, K.BtnW("launch", K.Kind.Primary, 10.56f, 0.24f, 24));
        K.Btn(page, "launch", () => Leave(Launch), (f.Left + f.Right - lw) / 2, f.FootTop + (f.FootH - f.FootPad - launchH) / 2, K.Kind.Primary, lw, launchH, 10.56f, 0.24f);
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
    /// `typed`: a second human's seat, its name a box to type in (.qp-head input), told of each change.
    /// </summary>
    public RectTransform Seat(Transform parent, float x, float y, float w, float h, string name, string mode, System.Action flip, string tag, bool tagOn, int seat, float bw = 0, Decks.Saved deck = null, string foot = null, System.Action<string> typed = null)
    {
        var panel = SeatBox(parent, x, y, w, h);
        var r = panel.rectTransform;
        float pv = K.Clamp(10, 3 * K.Vh, 18) + 1, ph = K.Clamp(10, 2 * K.Vw, 18) + 1, gap = K.Clamp(6, 2 * K.Vh, 14);
        // Its head: the name, then its pill or tag, 10 apart, centred together.
        string shown = name.ToUpperInvariant();
        float nameF = K.Clamp(10.56f, 2.8f * K.Vh, 14.4f);
        float pillW = mode != null ? K.BtnW(mode, K.Kind.Pill, 8, 0.14f, 10) : tag != null ? K.BtnW(tag, K.Kind.Pill, 8.96f, 0.16f, 10) - 2 : 0;
        float pillH = mode != null ? K.LineH(8) + 8 : tag != null ? K.LineH(8.96f) + 6 : 0;
        // (The name box: Exo 2 at 1rem on its line, padded 6 by 8, in its hairline: 33 tall.)
        float boxH = K.LineH(K.Rem, false) + 12 + 2;
        float headH = Mathf.Max(typed != null ? boxH : K.LineH(nameF), pillH);
        float room = w - 2 * ph - (pillW > 0 ? pillW + 10 : 0);
        // (The box grows to the room the pill leaves it, to at most 220.)
        float nameW = typed != null ? Mathf.Min(220, room) : Mathf.Min(room, K.TextW(shown, nameF, 400, 0.16f) + 2);
        float all = nameW + (pillW > 0 ? 10 + pillW : 0), left = (w - all) / 2;
        if (typed != null) NameBox(r, name, left, pv + (headH - boxH) / 2, nameW, boxH, typed);
        else Hud.Ellipsis(K.Words(r, shown, left, pv, nameW, headH, nameF, Look.Ink, true, 400, 0.16f, TextAlignmentOptions.Left));
        if (mode != null) K.Btn(r, mode, flip, left + nameW + 10, pv + (headH - pillH) / 2, K.Kind.Pill, pillW, pillH, 8, 0.14f);
        else if (tag != null)
        {
            var t = Hud.Box(r, "Tag", tagOn ? Hud.Rgba(102, 179, 133) : Hud.Rgba(120, 124, 134, 0.08f), pillH / 2);
            Hud.Place(t.rectTransform, left + nameW + 10, pv + (headH - pillH) / 2, pillW, pillH);
            if (tagOn) Hud.Shadow(t, pillH / 2, new Hud.Drop(Hud.Rgba(110, 196, 146, 0.45f), 0, 12));
            K.Fill(t.transform, tag.ToUpperInvariant(), 8.96f, tagOn ? Color.white : Look.InkFaint, true, 400, 0.16f);
        }
        // Its foot: every deck a tap away (.link-btn .qp-all), or quiet words.
        float footH = K.LineH(9.6f) + 8, footY = h - pv - footH;
        if (foot != null) K.Words(r, foot, 0, footY, w, footH, 12.8f, Look.InkFaint, false, 400);
        else if (seat >= 0)
        {
            System.Action pick = () => { pickSeat = seat; pickFrom = current; Show("pickdeck"); };
            float lw = K.TextW("VIEW DECKS", 9.6f, 400, 0.16f) + 0.16f * 9.6f + 4;
            K.Link(r, "view decks", pick, (w - lw) / 2, footY);
        }
        // Its middle: the deck, as a box (.qp-decks: --bw * 0.12 above it), centred between head and foot.
        if (bw <= 0) bw = K.Clamp(46, 19 * K.Vh, 92);
        var d = deck ?? (seat >= 0 ? SeatDeck(seat) : null);
        if (d != null)
        {
            // (.lobby-deck: the box, and its name 6 under it, as the deck's mini box draws them.)
            float midTop = pv + headH + gap, midH = footY - gap - midTop;
            float groupH = BuilderView.MiniH(bw);
            float by = midTop + (midH - groupH - bw * 0.12f) / 2 + bw * 0.12f;
            System.Action act = deck == null && seat >= 0 ? () => { pickSeat = seat; pickFrom = current; Show("pickdeck"); } : (System.Action)null;
            BuilderView.DeckBoxMini(r, (w - bw) / 2, by, d, true, act, bw);
        }
        return r;
    }

    /// <summary>
    /// A seat's name to type (.qp-head input): white at 80% in a hairline of #eceae6, corners 8, a faint shade inside
    /// its top (inset 0 1px 3px rgba(90, 90, 110, 0.1)); its words Exo 2 at 1rem in ink, centred, padded 6 by 8; at
    /// most 18 letters. Placed by its top-left corner.
    /// </summary>
    static TMP_InputField NameBox(Transform parent, string text, float x, float y, float w, float h, System.Action<string> typed)
    {
        var edge = K.Inset(parent, "Name", new Color(1, 1, 1, 0.8f), Hud.Rgba(236, 234, 230), 8);
        Hud.Place(edge.rectTransform, x, y, w, h);
        edge.raycastTarget = true;
        var inside = (RectTransform)edge.transform.GetChild(0);
        inside.gameObject.AddComponent<RectMask2D>();
        var shade = Hud.Rect(inside, "Shade");
        Hud.Place(shade, 0, 0, w - 2, 4);
        var si = shade.gameObject.AddComponent<RawImage>();
        si.texture = K.Down(Hud.Rgba(90, 90, 110, 0.1f), new Color(90 / 255f, 90 / 255f, 110 / 255f, 0));
        si.raycastTarget = false;
        var area = Hud.Rect(edge.transform, "Text Area");
        Hud.Fill(area);
        area.offsetMin = new Vector2(9, 1);
        area.offsetMax = new Vector2(-9, -1);
        area.gameObject.AddComponent<RectMask2D>();
        var t = K.Fill(area, text ?? "", K.Rem, Look.Ink, false, 400);
        t.richText = false;
        var input = edge.gameObject.AddComponent<TMP_InputField>();
        input.textViewport = area;
        input.textComponent = t;
        input.characterLimit = 18;
        input.richText = false;
        input.text = text ?? "";
        input.onValueChanged.AddListener(v => typed(v));
        return input;
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
        K.Btn(pane.transform, "‹ back", () => Nav(() => { if (from == "online") Online.Leave(); Show("hub"); }), sa + 18, top, K.Kind.Small, pw - 36);
        float cardsTop = top + K.Measure(K.Kind.Small).h + 14, cardH = (K.H - cardsTop - 1) / 2;
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
            // (Its lines 1.3 of its size apart, as the web sets them: Exo 2's own are 1.2.)
            int lines = Mathf.Max(1, Mathf.RoundToInt(probe.GetPreferredValues(gm.Blurb, blurbW, 0).y / (11.2f * 1.2f)));
            probe.lineSpacing = (1.3f - 1.2f) * 100;
            float blurbH = lines * lineH;
            float textH = 36 + K.LineH(14.4f) + 3 + blurbH + 14;
            var shade = Hud.Rect(card, "Shade");
            Hud.Place(shade, 0, cardH - textH, pw, textH);
            var si = shade.gameObject.AddComponent<RawImage>();
            si.texture = K.Down(new Color(12 / 255f, 14 / 255f, 24 / 255f, 0), new Color(12 / 255f, 14 / 255f, 24 / 255f, 0.82f));
            si.raycastTarget = false;
            shade.SetAsLastSibling();
            K.Words(card, gm.Name.ToUpperInvariant(), 16, cardH - textH + 36, blurbW, K.LineH(14.4f), 14.4f, on ? Color.white : new Color(1, 1, 1, 0.6f), true, 500, 0.16f, TextAlignmentOptions.Left);
            Hud.Place(probe.rectTransform, 16, cardH - 14 - blurbH, blurbW, blurbH);
            probe.color = new Color(1, 1, 1, on ? 0.85f : 0.5f);
            probe.transform.SetAsLastSibling();
            if (on)
            {
                // (Its white edge on the left, and a faint ring: inset 0 0 0 1px rgba(255, 255, 255, 0.35).)
                foreach (var (rx, ry, rw, rh) in new[] { (0f, 0f, pw, 1f), (0f, cardH - 1, pw, 1f), (0f, 1f, 1f, cardH - 2), (pw - 1, 1f, 1f, cardH - 2) })
                {
                    var side = Hud.Rect(card, "Ring");
                    Hud.Place(side, rx, ry, rw, rh);
                    var si2 = side.gameObject.AddComponent<Image>();
                    si2.color = new Color(1, 1, 1, 0.35f);
                    si2.raycastTarget = false;
                }
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
                // (Each seat keeps its deck if it is of the new mode, else takes that mode's starter for it.)
                Seats();
                for (int i = 0; i < 2; i++) seatDeck[i] = SeatDeck(i).Id;
                Show(from);
            });
        }
    }

    /// <summary>
    /// Choosing a seat's deck (app.ts renderPickDeck): every deck of the mode played as a deck box, by kind; tap one to
    /// take it; the starters, then (with any) your own decks of the mode, one not finished yet greyed and not to be taken
    /// (.db-deck-bad 70%, [aria-disabled] 45%). (.db-list: at most 980 across, centred, scrolling under the header to
    /// the screen's foot; its parts 8 apart, a label 4 below what is above it.)
    /// </summary>
    void PickDeck()
    {
        Seats();
        var f = Setup(page, "choose a deck", () => Show(pickFrom), false, -1, nav: false);
        var presets = Decks.Presets.Where(d => Modes.ModeOf(d) == PlayMode).ToList();
        var mine = Decks.Custom().Where(d => Modes.ModeOf(d) == PlayMode).ToList();
        var groups = new List<(string label, List<Decks.Saved> decks)> { ($"{Modes.GameModes[PlayMode].Name.ToLowerInvariant()}: race starters", presets.Where(d => d.Mixed != true).ToList()) };
        if (presets.Any(d => d.Mixed == true)) groups.Add(("mechanic starters", presets.Where(d => d.Mixed == true).ToList()));
        if (mine.Count > 0) groups.Add(("your decks", mine));
        float listW = Mathf.Min(980, f.Right - f.Left), lx = (f.Left + f.Right - listW) / 2;
        float bw = BuilderView.ListBw, colGap = K.Clamp(16, 2.6f * K.Vw, 28), rowGap = K.Clamp(12, 3.5f * K.Vh, 22);
        float avail = listW - 26;
        float labelF = K.Big ? 8.96f : 8, boxH = bw / 0.72f + bw * 0.08f;
        string current = seatDeck[pickSeat];
        // (Measured first, to size the scroller; then laid out into it.)
        float Lay(RectTransform content)
        {
            float y = 0;
            foreach (var (label, decks) in groups)
            {
                y += 4;
                if (content != null) K.Words(content, label.ToUpperInvariant(), lx, y, listW, K.LineH(labelF), labelF, Look.InkSoft, true, 400, 0.3f, TextAlignmentOptions.Left);
                y += K.LineH(labelF) + 8 + 14;
                int cols = Mathf.Max(1, Mathf.Min(decks.Count, Mathf.FloorToInt((avail + colGap) / (bw + colGap))));
                int rows = (decks.Count + cols - 1) / cols;
                for (int i = 0; i < decks.Count && content != null; i++)
                {
                    int row = i / cols, col = i % cols;
                    float x = lx + 10 + (avail - (cols * bw + (cols - 1) * colGap)) / 2 + col * (bw + colGap);
                    var d = decks[i];
                    bool legal = DeckRules.DeckProblems(d.Cards, Modes.ModeOf(d)).Count == 0;
                    var box = BuilderView.DeckBoxMini(content, x, y + row * (boxH + rowGap) + bw * 0.08f, d, d.Id == current, legal ? () =>
                    {
                        seatDeck[pickSeat] = d.Id;
                        Show(pickFrom);
                    } : (System.Action)null, bw, true);
                    if (!legal) box.gameObject.AddComponent<CanvasGroup>().alpha = 0.7f * 0.45f;
                }
                y += rows * boxH + (rows - 1) * rowGap + 16 + 8;
            }
            return y + Mathf.Max(18, K.SaB);
        }
        var list = K.Scroller(page, "List", 0, f.BodyTop, K.W, K.H - f.BodyTop, Lay(null));
        Lay(list);
    }

    RectTransform sheet;

    /// <summary>
    /// The campaign's menu (campaign.ts renderSetup): A DYING UNIVERSE, your Captain, the ship and the Stellari to build
    /// up between runs, and the run to begin (or the one under way to carry on).
    /// </summary>
    void CampaignMenu() => CampaignMenuPage.Make(page, this, scene);

    /// <summary>
    /// A round-ended white button (.hub-options): 46 by 40, white at 92%, its soft shadow (0 4 14), its mark in the
    /// middle: the options' 20 across in the button's #5f8fc4; the fullscreen mark (.log-icon, in ink) its picture
    /// baked with its own margin, 40.
    /// </summary>
    Button RoundButton(Transform parent, float x, float y, string icon, System.Action act)
    {
        var b = Hud.Box(parent, icon, new Color(1, 1, 1, 0.92f), 20);
        Hud.Place(b.rectTransform, x, y, 46, 40);
        var shades = Hud.Shadow(b, 20, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.12f), 4, 14));
        b.raycastTarget = true;
        var button = b.gameObject.AddComponent<Button>();
        button.onClick.AddListener(() => { Sound.Play("click"); act(); });
        // (Under a mouse, its shadow deepens: 0 6px 18px at 18%.)
        MenuHover.On(b.gameObject, on => shades.Set(0, on ? new Hud.Drop(Hud.Rgba(80, 84, 100, 0.18f), 6, 18) : new Hud.Drop(Hud.Rgba(80, 84, 100, 0.12f), 4, 14)));
        // (The fullscreen mark is .log-icon's, 20 across here: its baked picture holds it at half its width.)
        float s = icon.Contains("hud-") ? 40 : 20;
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
        var shades = Hud.Shadow(chip, 20, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.12f), 4, 14));
        chip.raycastTarget = true;
        chip.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); profileOpen = true; ProfileView(); });
        // (Under a mouse, its shadow deepens: 0 6px 18px at 18%; and it chimes softly.)
        MenuHover.On(chip.gameObject, on => shades.Set(0, on ? new Hud.Drop(Hud.Rgba(80, 84, 100, 0.18f), 6, 18) : new Hud.Drop(Hud.Rgba(80, 84, 100, 0.12f), 4, 14)));
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

    /// <summary>
    /// The web's small back button (.btn.btn-small "‹ back"), placed by its top-left corner. `nav`: back to another
    /// menu page (data-act menu-page), the page played out first (Leave); not so a builder's or a deck pick's own back.
    /// </summary>
    public static Button BackButton(Transform parent, System.Action back, float x, float y, bool nav = true) => K.Btn(parent, "‹ back", nav ? () => Nav(back) : back, x, y, K.Kind.Small);

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

    public Frame2 Setup(Transform parent, string title, System.Action back, bool pane = false, float foot = 0, bool chip = true, bool nav = true)
    {
        // (Kept, for the page's parts to come and go by: its header, body and foot (enterMenu).)
        var f = SetupFrame(parent, title, back, pane, foot, chip, nav);
        framed = f;
        return f;
    }

    /// <summary>The setup page's frame last laid out for the page shown (none: it has none).</summary>
    Frame2? framed;

    Frame2 SetupFrame(Transform parent, string title, System.Action back, bool pane, float foot, bool chip, bool nav)
    {
        var f = new Frame2();
        f.Left = pane ? PaneW + K.SaL + 32 : K.PadL;
        f.Right = K.W - K.PadR;
        f.Top = K.PadT;
        if (!pane) BackButton(parent, back, f.Left, f.Top + 13, nav);
        float hf = K.Clamp(0.9f * K.Rem, 4 * K.Vh, 1.3f * K.Rem), hh = K.LineH(hf);
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
    CanvasGroup toastFade;
    float toastBorn;

    /// <summary>
    /// A word at the top of the screen for a few seconds (the web's .toast): white at 86%, corners 12, padded 7 by 16,
    /// Exo 2 11.84 ink-soft, its lines 1.35 apart, centred, at most min(440px, 100vw - 32px) across; calc(--pad-t + 8px)
    /// down. It drops in from 10 above as it shows (0.22 s), and after 2.6 s rises and fades away (0.3 s).
    /// </summary>
    public void Toast(string text)
    {
        if (toast != null) Mats.Kill(toast.gameObject);
        toast = Hud.Rect(canvas.transform, "Toast");
        Hud.Fill(toast);
        toastFade = toast.gameObject.AddComponent<CanvasGroup>();
        toastFade.blocksRaycasts = false;
        var box = Hud.Box(toast, "Slip", new Color(1, 1, 1, 0.86f), 12);
        Hud.Shadow(box, 12, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.12f), 8, 22));
        float max = Mathf.Min(440, K.W - 32) - 32;
        var words = K.Fill(box.transform, text, 11.84f, Look.InkSoft, false, 400);
        words.textWrappingMode = TextWrappingModes.Normal;
        words.lineSpacing = (1.35f - 1.2f) * 100;
        var size = words.GetPreferredValues(text, max, 0);
        int lines = Mathf.Max(1, Mathf.RoundToInt(size.y / (11.84f * 1.35f)));
        float w = Mathf.Min(max, size.x + 2) + 32, h = lines * 11.84f * 1.35f + 14;
        Hud.Place(box.rectTransform, (K.W - w) / 2, Mathf.Max(6, K.SaT) + 8, w, h);
        toastBorn = Time.realtimeSinceStartup;
        AnimateToast();
    }

    /// <summary>The toast's way in (toastIn, ease-out) and, after its time, out (.toast-out, ease).</summary>
    void AnimateToast()
    {
        float t = Time.realtimeSinceStartup - toastBorn, k;
        if (t < 2.6f)
        {
            float u = Mathf.Clamp01(t / 0.22f);
            k = 1 - (1 - u) * (1 - u) * (1 - u);
        }
        else
        {
            float u = Mathf.Clamp01((t - 2.6f) / 0.3f);
            k = 1 - u * u * (3 - 2 * u);
        }
        toastFade.alpha = k;
        toast.anchoredPosition = new Vector2(0, 10 * (1 - k));
    }

    // ---- Coming and going (app.ts leaveMenu, enterMenu, MENU_NAV) ----

    /// <summary>The menu page last shown (across menus: another screen in between counts as a change).</summary>
    static string shownPage;
    /// <summary>A page is playing out (Leave): further ways out wait.</summary>
    bool leaving;
    /// <summary>The page's parts as laid out, each what comes and goes together (PartFrom), and whether it is a hub column.</summary>
    readonly List<(List<Transform> items, bool col)> parts = new List<(List<Transform>, bool)>();

    /// <summary>What has been laid on the page since `mark` (its child count then) comes and goes as one part (`col`: a hub tile's column).</summary>
    public void PartFrom(int mark, bool col = false) => PartFrom(page, mark, col);

    /// <summary>These come and go as one part of the page.</summary>
    public void Part(List<Transform> items)
    {
        if (items.Count > 0) parts.Add((items, false));
    }

    /// <summary>As PartFrom, for what was laid in `parent` (a view's own layer over the page).</summary>
    public void PartFrom(Transform parent, int mark, bool col = false)
    {
        var items = new List<Transform>();
        for (int i = mark; i < parent.childCount; i++) items.Add(parent.GetChild(i));
        if (items.Count > 0) parts.Add((items, col));
    }

    /// <summary>
    /// The page's parts, in order, as the web's menuParts finds them: the parts laid out as such (the title page's,
    /// the hub's: its links, its corner, the title, each tile's column, the studio's name); on a setup page, the game
    /// modes' pane, its header, its body and its foot; else the page as one. (A box's shadows go with it.)
    /// </summary>
    List<(List<Transform> items, bool col)> PageParts()
    {
        var found = new List<(List<Transform>, bool)>();
        foreach (var p in parts) if (p.items.Any(t => t != null)) found.Add(p);
        if (found.Count > 0) return found;
        // (A view drawn in a layer of its own over the page: its parts are that layer's.)
        Transform root = page;
        if (root.childCount == 1) root = root.GetChild(0);
        if (framed == null)
        {
            var all = new List<Transform>();
            foreach (Transform c in root) all.Add(c);
            if (all.Count > 0) found.Add((all, false));
            return found;
        }
        var f = framed.Value;
        var pane = new List<Transform>();
        var top = new List<Transform>();
        var body = new List<Transform>();
        var foot = new List<Transform>();
        var shades = new List<Transform>();
        foreach (Transform c in root)
        {
            // (Shadows are laid just before their box: they go where it goes.)
            if (c.name == "Shade" && c.GetComponent<Shades>() == null) { shades.Add(c); continue; }
            var into = c.name == "Modes" ? pane : Band(c, f) < 0 ? top : Band(c, f) > 0 ? foot : body;
            into.AddRange(shades);
            into.Add(c);
            shades.Clear();
        }
        foreach (var part in new[] { pane, top, body, foot }) if (part.Count > 0) found.Add((part, false));
        return found;
    }

    /// <summary>Where on a setup page a thing stands by its middle: its header (-1), its body (0), or its foot (1).</summary>
    int Band(Transform t, Frame2 f)
    {
        if (!(t is RectTransform r)) return 0;
        var corners = new Vector3[4];
        r.GetWorldCorners(corners);
        float mid = (page.InverseTransformPoint(corners[0]).y + page.InverseTransformPoint(corners[1]).y) / 2;
        float y = page.rect.yMax - mid;
        return y < f.BodyTop ? -1 : f.FootTop < K.H && y >= f.FootTop ? 1 : 0;
    }

    /// <summary>
    /// Leave the page for another (a menu button that leads somewhere: MENU_NAV), then `then`: the button pressed lifts
    /// 34 and fades (0.3 s, a quick rise that eases off; a hub tile with its column), the rest of the page drifts up 14
    /// after it, a part at a time (0.26 s, each 15 ms after the last, at most 60), and the Stellari spins faster.
    /// </summary>
    public void Leave(System.Action then)
    {
        if (leaving) return;
        leaving = true;
        Spin();
        Spin();
        var all = PageParts();
        var pressed = EventSystem.current != null ? EventSystem.current.currentSelectedGameObject : null;
        var hit = pressed != null && pressed.transform.IsChildOf(page) ? pressed.transform : null;
        if (hit != null)
        {
            var col = all.FirstOrDefault(p => p.col && p.items.Any(t => t != null && hit.IsChildOf(t)));
            foreach (var t in col.items ?? WithShades(hit)) Tween(t, 0, -34, 1, 0, 0.3f, 0, 0.1f, 0.75f, 0.3f, 1, true);
        }
        for (int i = 0; i < all.Count; i++)
        {
            if (hit != null && all[i].items.Any(t => t != null && hit.IsChildOf(t))) continue;
            foreach (var t in all[i].items) Tween(t, 0, -14, 1, 0, 0.26f, Mathf.Min(0.06f, i * 0.015f), 0.1f, 0.75f, 0.3f, 1, true);
        }
        StartCoroutine(Then(then));
    }

    System.Collections.IEnumerator Then(System.Action then)
    {
        var was = page;
        yield return new WaitForSeconds(0.3f);
        leaving = false;
        then();
        // (Nowhere to go after all, the page stays: back as it was.)
        if (this != null && page == was) Settle();
    }

    /// <summary>Go on by `then` with the menu's page played out first (Leave); with no menu showing, at once.</summary>
    public static void Nav(System.Action then)
    {
        if (Live != null) Live.Leave(then);
        else then();
    }

    /// <summary>A new page rises gently into place, a part at a time (0.42 s each, 45 ms apart, from 16 below and clear).</summary>
    void Enter()
    {
        var all = PageParts();
        for (int i = 0; i < all.Count; i++)
            foreach (var t in all[i].items) Tween(t, 16, 0, 0, 1, 0.42f, i * 0.045f, 0.2f, 0.8f, 0.2f, 1, false);
    }

    /// <summary>A thing with the shadows laid just before it.</summary>
    static List<Transform> WithShades(Transform t)
    {
        var list = new List<Transform> { t };
        var parent = t.parent;
        for (int i = t.GetSiblingIndex() - 1; i >= 0 && parent.GetChild(i).name == "Shade" && parent.GetChild(i).GetComponent<Shades>() == null; i--) list.Add(parent.GetChild(i));
        return list;
    }

    /// <summary>One thing moving: from `fromY` to `toY` down (CSS px) and from `fromA` to `toA` of its own opacity, over `length` after `delay`, on a cubic-bezier; `hold` it at its end (else back at rest).</summary>
    class Motion
    {
        public RectTransform R;
        public CanvasGroup G;
        public Vector2 Rest;
        public float Alpha, FromY, ToY, FromA, ToA, Start, Length, X1, Y1, X2, Y2;
        public bool Hold, Shadow;
    }

    readonly List<Motion> tweens = new List<Motion>();

    void Tween(Transform t, float fromY, float toY, float fromA, float toA, float length, float delay, float x1, float y1, float x2, float y2, bool hold)
    {
        if (!(t is RectTransform r)) return;
        // (A thing already moving keeps its place at rest.)
        var old = tweens.Find(m => m.R == r);
        if (old != null) tweens.Remove(old);
        var g = r.GetComponent<CanvasGroup>() ?? r.gameObject.AddComponent<CanvasGroup>();
        var m = new Motion
        {
            R = r, G = g, Rest = old?.Rest ?? r.anchoredPosition, Alpha = old?.Alpha ?? g.alpha, FromY = fromY, ToY = toY, FromA = fromA, ToA = toA,
            Start = Time.time + delay, Length = length, X1 = x1, Y1 = y1, X2 = x2, Y2 = y2, Hold = hold,
            // (A box's shadow layer is placed by its box: only faded.)
            Shadow = r.name == "Shade" && r.GetComponent<Shades>() == null,
        };
        tweens.Add(m);
        Step(m);
    }

    /// <summary>A motion at this moment (before it starts, held at its start: fill backwards); whether it has ended.</summary>
    bool Step(Motion m)
    {
        if (m.R == null) return true;
        float k = Mathf.Clamp01((Time.time - m.Start) / m.Length);
        float e = Bezier(m.X1, m.Y1, m.X2, m.Y2, k);
        float y = Mathf.Lerp(m.FromY, m.ToY, e);
        if (!m.Shadow) m.R.anchoredPosition = m.Rest - new Vector2(0, y);
        m.G.alpha = m.Alpha * Mathf.Lerp(m.FromA, m.ToA, e);
        if (k < 1 || m.Hold) return false;
        if (!m.Shadow) m.R.anchoredPosition = m.Rest;
        m.G.alpha = m.Alpha;
        return true;
    }

    /// <summary>Every motion stopped, each thing back at rest.</summary>
    void Settle()
    {
        foreach (var m in tweens)
        {
            if (m.R == null) continue;
            if (!m.Shadow) m.R.anchoredPosition = m.Rest;
            m.G.alpha = m.Alpha;
        }
        tweens.Clear();
    }

    /// <summary>A CSS cubic-bezier timing function at `x`.</summary>
    public static float Bezier(float x1, float y1, float x2, float y2, float x)
    {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
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

    // ---- A card read large over the menus (app.ts zoom, renderZoom) ----

    RectTransform zoomView;

    /// <summary>Read a card large over the page (a right-click or a long press on it, or its ⤢): tap anywhere to close.</summary>
    public void Zoom(string defId)
    {
        CloseZoom();
        Sound.Play("hover");
        zoomView = BuilderView.ZoomView(canvas.transform, defId, CloseZoom);
    }

    public void CloseZoom()
    {
        if (zoomView != null) Mats.Kill(zoomView.gameObject);
        zoomView = null;
    }

    /// <summary>
    /// Escape (app.ts onKey; a phone's back button too): closes a card read large; at the hub, with nothing open, brings
    /// up the options.
    /// </summary>
    void Escape()
    {
        if (zoomView != null) { CloseZoom(); return; }
        if (current == "hub" && !profileOpen && !leaving) Show("options");
    }

    void Update()
    {
        TurnRings();
        if (Css.Size != laidSize || Css.SafeInsets != laidInsets) Relayout();
        for (int i = tweens.Count - 1; i >= 0; i--) if (Step(tweens[i])) tweens.RemoveAt(i);
        if (Input.GetKeyDown(KeyCode.Escape)) Escape();
        // The connection lost or back: what needs it (online play, the shop) shows as offline, or not (an open shop
        // gives way to the hub).
        if (Connection.Changed() && !Legacy(current) && !leaving)
        {
            if (current == "shop" && Connection.Offline) Show("hub");
            else Relayout();
        }
        // (The fullscreen button's mark follows fullscreen as it changes: by the button, Escape or the browser.)
        if (current == "hub" && !leaving && Connection.FullscreenOn != drawnFullscreen) Relayout();
        // (The settings' flower: a turn in 90 seconds.)
        if (flower != null) flower.localRotation = Quaternion.Euler(0, 0, -(Time.time * 4) % 360);
        if (toast != null && Time.realtimeSinceStartup > toastBorn + 2.9f)
        {
            Mats.Kill(toast.gameObject);
            toast = null;
        }
        else if (toast != null)
        {
            AnimateToast();
            // (Over a page drawn after it.)
            if (toast.GetSiblingIndex() != toast.parent.childCount - 1) toast.SetAsLastSibling();
        }
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
        float whoX = x + av + 12, whoW = inner - av - 12 - 12 - closeW, whoH = K.LineH(nf) + 1 + K.LineH(10.56f, false);
        var nm = K.Words(body, (string.IsNullOrEmpty(p.Name) ? "Commander" : p.Name).ToUpperInvariant(), whoX, y + (av - whoH) / 2, whoW, K.LineH(nf), nf, Look.Ink, true, 500, 0.16f, TextAlignmentOptions.Left);
        Hud.Ellipsis(nm);
        K.Words(body, $"{p.Won} won of {p.Played} played", whoX, y + (av - whoH) / 2 + K.LineH(nf) + 1, whoW, K.LineH(10.56f, false), 10.56f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
        K.Btn(body, "close", () => shut(), x + inner - closeW, y + (av - 23) / 2, K.Kind.Pill, closeW, 23, 8.96f);
        y += av + gap;
        // Level (and its experience), stardust, flux and rank (.pv-grid: four boxes 8 apart, #f7f8fb, corners 12, an
        // inset hairline; padded 8 by 10; its name Exo 2 8 spaced 0.12em, its value clamp(11.2px, 2.6vh, 14.4px)).
        int need = Progression.XpToNext(p.Level);
        float bf = K.Clamp(11.2f, 2.6f * K.Vh, 14.4f), bwid = (inner - 24) / 4, bh = 8 + 10 + 3 + bf * 1.2f + 3 + 4 + 3 + 10 + 8;
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
            K.Words(edge.transform, head, 10, 8, iw, 10, 8, Look.InkFaint, false, 400, 0.12f, TextAlignmentOptions.Left);
            var v = K.Words(edge.transform, shown.ToUpperInvariant().Replace("<SIZE=85%>", "<size=85%>").Replace("</SIZE>", "</size>"), 10, 21, iw, bf * 1.2f, bf, ink, true, 500, 0.06f, TextAlignmentOptions.Left);
            Hud.Ellipsis(v);
            if (bar >= 0)
            {
                var track = Hud.Box(edge.transform, "Bar", Hud.Rgba(238, 240, 245), 2);
                Hud.Place(track.rectTransform, 10, 24 + bf * 1.2f, iw, 4);
                // (Its fill: the web's blue to violet.)
                var fill = Hud.Rect(track.transform, "Fill");
                Hud.Place(fill, 0, 0, iw * Mathf.Clamp01(bar), 4);
                var fi = fill.gameObject.AddComponent<RawImage>();
                fi.texture = Across(Hud.Rgba(159, 180, 255), Hud.Rgba(201, 164, 255));
                fi.raycastTarget = false;
            }
            if (foot.Length > 0) K.Words(edge.transform, foot, 10, 31 + bf * 1.2f, iw, 10, 8, Look.InkFaint, false, 400, 0.12f, TextAlignmentOptions.Left);
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
        // (A label of two lines: its name, 3, the line under it: 14 + 3 + 13.)
        var heights = rows.Select(r => Mathf.Max(minRow, r.Label.Contains("\n") ? K.LineH(10.56f) + 3 + K.LineH(10.56f, false) : 0)).ToArray();
        float listH = 8 + heights.Sum() + (rows.Length - 1) * 2, h = 14 + listH + foot;
        float x = (f.Left + f.Right - w) / 2, y = f.BodyTop + (f.BodyH - h) / 2;
        var panel = Hud.Box(parent, "Settings", new Color(1, 1, 1, 0.55f), 22);
        Hud.Place(panel.rectTransform, x, y, w, h);
        Hud.Shadow(panel, 22, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.1f), 14, 40));
        panel.gameObject.AddComponent<RectMask2D>();
        // The flower, turning (one turn in 90 seconds), under the list.
        float fs = K.Clamp(150, 34 * K.Vh, 240);
        var fl = Hud.Rect(panel.transform, "Flower");
        // (Its picture baked with a margin of 6% each side for its shadows.)
        Hud.At(fl, new Vector2(0.5f, 0), Vector2.zero, new Vector2(fs * 1.12f, fs * 1.12f));
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
            float nameH = K.LineH(10.56f), subH = K.LineH(10.56f, false), labelH = parts.Length > 1 ? nameH + 3 + subH : nameH;
            var l = K.Words(r.transform, parts[0].ToUpperInvariant(), 16, (rowH - labelH) / 2, rowW - 100, nameH, 10.56f, Look.Ink, true, 400, 0.22f, TextAlignmentOptions.Left);
            l.alpha = fade;
            if (parts.Length > 1)
            {
                var sub = K.Words(r.transform, parts[1], 16, (rowH - labelH) / 2 + nameH + 3, rowW - 100, subH, 10.56f, Look.InkFaint, false, 400, 0.02f, TextAlignmentOptions.Left);
                sub.alpha = fade;
            }
            if (row.Value != null)
            {
                string v = row.Value.ToUpperInvariant();
                // (.opt-value: at least 44 across, padded 4 by 10; its spacing after the last letter counted.)
                float vw = Mathf.Max(44, K.TextW(v, 9.6f, 500, 0.16f) + 0.16f * 9.6f + 20), vh = K.LineH(9.6f) + 8;
                var pill = Hud.Box(r.transform, "Value", Hud.Rgba(240, 242, 246), vh / 2);
                Hud.Place(pill.rectTransform, rowW - 12 - vw, (rowH - vh) / 2, vw, vh);
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
