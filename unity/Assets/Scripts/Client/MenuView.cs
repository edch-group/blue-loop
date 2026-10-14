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
        var glow = Hud.Rect(backdrop.transform, "Glow");
        Hud.At(glow, new Vector2(0.5f, 1), new Vector2(0, 200), new Vector2(1500, 900));
        var g = glow.gameObject.AddComponent<Image>();
        g.sprite = Hud.Soft;
        g.type = Image.Type.Sliced;
        g.color = new Color(1, 1, 1, 0.7f);
        g.raycastTarget = false;
    }

    public void Show(string name)
    {
        if (page != null) Mats.Kill(page.gameObject);
        page = Hud.Rect(canvas.transform, name);
        Hud.Fill(page);
        current = name;
        // (The campaign's page over its own scene: the land, the ship on it.)
        bool campaign = name == "campaign" || name == "captain" || name == "hangar";
        backdrop.SetActive(!campaign);
        // (The skill tree lies on the page's own paper, without the hub's glow.)
        backdrop.transform.Find("Glow")?.gameObject.SetActive(name != "stellari");
        if (campaign && scene == null) scene = CampaignBackdrop.Make(cam, transform);
        if (!campaign && scene != null) { Mats.Kill(scene.gameObject); scene = null; }
        if (scene != null) scene.Focus(name == "captain" || name == "hangar" ? name : null);
        switch (name)
        {
            case "hub": Hub(); break;
            case "quickplay": Quickplay(); break;
            case "collection": BuilderView.Make(page, this); break;
            case "shop": ShopView.Make(page, this); break;
            // (A starter open in the builder, as its screenshot shows it.)
            case "deck": BuilderView.Make(page, this, Decks.Presets[0]); break;
            case "glossary": GlossaryView.Make(page, this); break;
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
        Picture(page, "Icons/title", new Vector2(0.5f, 0.5f), new Vector2(0, 110), new Vector2(1376, 314));
        var start = Hud.Pill(page, "Start", () => Show("hub"), 28, Look.Ink, Color.white);
        Hud.At((RectTransform)start.transform, new Vector2(0.5f, 0.5f), new Vector2(0, -150), new Vector2(300, 84));
        Studio();
    }

    void Studio()
    {
        var foot = Hud.Label(page, "CORONAL MASS GAMES", 16, Look.InkFaint, true, 500, 30, TextAlignmentOptions.Bottom);
        foot.margin = new Vector4(0, 0, 0, 28);
    }

    // ---- The hub ----

    void Hub()
    {
        Picture(page, "Icons/title", new Vector2(0.5f, 1), new Vector2(0, -40), new Vector2(963, 220));
        // Shop, collection and glossary as plain links, top left.
        var links = new[] { ("shop", "Shop"), ("collection", "Collection"), ("glossary", "Glossary") };
        for (int i = 0; i < links.Length; i++)
        {
            var (icon, name) = links[i];
            var r = Hud.Rect(page, name);
            Hud.At(r, new Vector2(0, 1), new Vector2(36 + i * 190, -34), new Vector2(180, 54));
            var b = r.gameObject.AddComponent<Button>();
            var hit = r.gameObject.AddComponent<Image>();
            hit.color = new Color(1, 1, 1, 0);
            b.targetGraphic = hit;
            b.onClick.AddListener(() => Show(icon));
            Picture(r, $"Icons/{icon}-small", new Vector2(0, 0.5f), new Vector2(0, 0), new Vector2(40, 40));
            var t = Hud.Label(r, name.ToUpperInvariant(), 18, Look.InkSoft, true, 500, 12, TextAlignmentOptions.Left);
            t.margin = new Vector4(50, 0, 0, 0);
        }
        Chip(page);
        var opts = Hud.Glass(page, "Options", Look.GlassStrong);
        Hud.At((RectTransform)opts.transform, new Vector2(1, 1), new Vector2(-34, -26), new Vector2(84, 76));
        opts.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); Options(); });
        Picture(opts.transform, "Icons/options-small", new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(44, 44));

        // The five ways to play.
        var tiles = new[] { ("campaign", "A dying universe"), ("quickplay", "Quickplay"), ("online", "Online"), ("tutorial", "Tutorial"), ("challenges", "Challenges") };
        float w = 236, gap = 26;
        for (int i = 0; i < tiles.Length; i++)
        {
            var (icon, name) = tiles[i];
            var tile = Hud.Glass(page, name, Color.white);
            Hud.At((RectTransform)tile.transform, new Vector2(0.5f, 0.5f), new Vector2((i - 2) * (w + gap), -90), new Vector2(w, 220));
            var b = tile.gameObject.AddComponent<Button>();
            var colors = b.colors;
            colors.highlightedColor = new Color(0.97f, 0.98f, 1f);
            colors.pressedColor = new Color(0.93f, 0.94f, 0.97f);
            b.colors = colors;
            string target = icon;
            b.onClick.AddListener(() => { if (target == "quickplay" || target == "tutorial" || target == "challenges" || target == "campaign") Show(target); else Soon(name); });
            Picture(tile.transform, $"Icons/{icon}", new Vector2(0.5f, 0.5f), new Vector2(0, 26), new Vector2(84, 84));
            var t = Hud.Label(tile.transform, name.ToUpperInvariant(), 19, Look.Ink, true, 700, 18, TextAlignmentOptions.Bottom);
            t.margin = new Vector4(10, 0, 10, 44);
            t.textWrappingMode = TextWrappingModes.Normal;
            // (A run left part way: continue it, under its tile.)
            if (target == "campaign" && CampaignView.HasSave)
            {
                var cont = Hud.Pill(page, "Continue", () => App.Instance.Run(CampaignView.Saved()), 14);
                Hud.At((RectTransform)cont.transform, new Vector2(0.5f, 0.5f), new Vector2((i - 2) * (w + gap), -232), new Vector2(150, 44));
            }
            // (A game against the AI left part way: continue it, under its tile.)
            if (target == "quickplay" && BattleView.HasSave)
            {
                var cont = Hud.Pill(page, "Continue", () => App.Instance.Continue(), 14);
                Hud.At((RectTransform)cont.transform, new Vector2(0.5f, 0.5f), new Vector2((i - 2) * (w + gap), -232), new Vector2(150, 44));
            }
        }
        Studio();
    }

    // ---- Quickplay: two seats, each a deck and who plays it ----

    void Quickplay()
    {
        var head = Hud.Label(page, "QUICKPLAY", 34, Look.Ink, true, 500, 30, TextAlignmentOptions.Top);
        head.margin = new Vector4(0, 60, 0, 0);
        var back = Hud.Pill(page, "‹ Back", () => Show("hub"), 18);
        Hud.At((RectTransform)back.transform, new Vector2(0, 1), new Vector2(36, -40), new Vector2(150, 58));
        var decks = Decks.All().Where(d => d.Mixed != true).ToList();
        for (int seat = 0; seat < 2; seat++)
        {
            int s = seat;
            seatDeck[s] ??= decks[(s * 5 + 1) % decks.Count].Name;
            var panel = Hud.Glass(page, $"Seat {s}", Look.GlassStrong);
            Hud.At((RectTransform)panel.transform, new Vector2(0.5f, 0.5f), new Vector2((s - 0.5f) * 520, 10), new Vector2(460, 560));
            var name = Hud.Label(panel.transform, s == 0 ? (string.IsNullOrEmpty(Profile.Me.Name) ? "YOU" : Profile.Me.Name.ToUpperInvariant()) : "RIVAL", 24, Look.Ink, true, 500, 16, TextAlignmentOptions.Top);
            name.margin = new Vector4(0, 28, 0, 0);
            var who = Hud.Pill(panel.transform, seatAI[s] ? "AI" : "Human", () => { seatAI[s] = !seatAI[s]; Show("quickplay"); }, 16);
            Hud.At((RectTransform)who.transform, new Vector2(1, 1), new Vector2(-22, -20), new Vector2(120, 50));
            // The deck: its cover card, its name, and arrows to step through the decks.
            var deck = decks.FirstOrDefault(d => d.Name == seatDeck[s]) ?? decks[0];
            var cover = deck.Cover ?? deck.Cards.FirstOrDefault(id => Cards.Def(id).Kind == "command") ?? deck.Cards[0];
            var face = Hud.Rect(panel.transform, "Cover");
            Hud.At(face, new Vector2(0.5f, 0.5f), new Vector2(0, 10), new Vector2(230, 322));
            var raw = face.gameObject.AddComponent<RawImage>();
            raw.texture = Faces.Of(cover, false);
            raw.raycastTarget = false;
            var deckName = Hud.Label(panel.transform, deck.Name.ToUpperInvariant(), 20, Look.Ink, true, 500, 10, TextAlignmentOptions.Bottom);
            deckName.margin = new Vector4(20, 0, 20, 40);
            for (int dir = -1; dir <= 1; dir += 2)
            {
                int step = dir;
                var arrow = Hud.Pill(panel.transform, dir < 0 ? "‹" : "›", () =>
                {
                    int at = decks.FindIndex(d => d.Name == seatDeck[s]);
                    seatDeck[s] = decks[((at + step) % decks.Count + decks.Count) % decks.Count].Name;
                    Show("quickplay");
                }, 30);
                Hud.At((RectTransform)arrow.transform, new Vector2(0.5f, 0.5f), new Vector2(step * 175, 10), new Vector2(60, 60));
            }
        }
        var launch = Hud.Pill(page, "Launch", () => App.Instance.Battle(seatDeck[0], seatDeck[1]), 26, Look.Ink, Color.white);
        Hud.At((RectTransform)launch.transform, new Vector2(0.5f, 0), new Vector2(0, 40), new Vector2(300, 80));
    }

    RectTransform sheet;

    /// <summary>
    /// The campaign's menu (campaign.ts renderSetup): A DYING UNIVERSE, your Captain, the ship and the Stellari to build
    /// up between runs, and the run to begin (or the one under way to carry on).
    /// </summary>
    void CampaignMenu()
    {
        var back = Hud.Pill(page, "‹ Back", () => Show("hub"), 15);
        Hud.At((RectTransform)back.transform, new Vector2(0, 1), new Vector2(26, -36), new Vector2(92, 40));
        var title = Hud.Label(page, "A DYING UNIVERSE", 40, Look.Ink, true, 400, 40, TextAlignmentOptions.Top);
        title.margin = new Vector4(0, 34, 0, 0);
        var meta = CampaignView.LoadMeta();
        var level = Meta.LevelFor(meta.Xp);
        var sections = new[] { ("THE CAPTAIN", $"{Meta.PointsLeft(meta)} skill points"), ("THE SHIP", "fit parts"), ("THE STELLARI", $"{meta.Petals} petals") };
        for (int i = 0; i < sections.Length; i++)
        {
            var (name, sub) = sections[i];
            var r = Hud.Rect(page, name);
            Hud.At(r, new Vector2(0.5f, 0.5f), new Vector2(380 + (i == 1 ? 60 : 0), 190 - i * 190), new Vector2(360, 70));
            var dot = Hud.Rect(r, "Dot");
            Hud.At(dot, new Vector2(0, 0.5f), Vector2.zero, new Vector2(64, 64));
            var di = dot.gameObject.AddComponent<Image>();
            di.sprite = Hud.Circle;
            di.color = new Color(1, 1, 1, 0.8f);
            var l = Hud.Label(r, $"{name}\n<size=75%><color=#9aa0ac>{sub}</color></size>", 18, Look.InkSoft, true, 500, 20, TextAlignmentOptions.Left);
            l.margin = new Vector4(80, 0, 0, 0);
            r.gameObject.AddComponent<Button>().onClick.AddListener(() => { if (name == "THE STELLARI") Show("stellari"); else if (name == "THE CAPTAIN") Show("captain"); else Show("hangar"); });
        }
        var saved = CampaignView.Saved();
        var begin = Hud.Pill(page, saved != null ? "Continue run" : "Begin run", () => App.Instance.Run(saved ?? CampaignView.NewRun()), 18, Color.white);
        Hud.At((RectTransform)begin.transform, new Vector2(0.5f, 0), new Vector2(0, 40), new Vector2(290, 64));
        var lv = Hud.Label(page, $"COMMANDER · LEVEL {level.Level}", 13, Look.InkFaint, true, 500, 24, TextAlignmentOptions.Bottom);
        lv.margin = new Vector4(0, 0, 0, 116);
    }

    /// <summary>You, top right: your name and level, your stardust and flux (the hub's chip, on the pages off it too). Tap it for your profile.</summary>
    public void Chip(Transform parent) => Chip(parent, new Vector2(-136, -26));

    public void Chip(Transform parent, Vector2 at)
    {
        var me = Profile.Me;
        var chip = Hud.Glass(parent, "You", Look.GlassStrong);
        Hud.At((RectTransform)chip.transform, new Vector2(1, 1), at, new Vector2(330, 76));
        chip.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); ProfileView(); });
        var who = Hud.Label(chip.transform, $"<b>{(string.IsNullOrEmpty(me.Name) ? "Commander" : me.Name)}</b>\n<size=70%><color=#737780>LEVEL {me.Level}</color></size>", 22, Look.Ink, true, 500, 4, TextAlignmentOptions.Left);
        who.margin = new Vector4(24, 0, 0, 0);
        var cur = Hud.Label(chip.transform, $"✦ {me.Stardust}\n⟁ {me.Flux}", 18, Look.InkSoft, false, 500, 0, TextAlignmentOptions.Right);
        cur.margin = new Vector4(0, 0, 22, 0);
    }

    /// <summary>
    /// Every setup page's header, the same everywhere (app.ts setupTop): back on the left, the page's name centred, you
    /// on the right.
    /// </summary>
    public void SetupTop(Transform parent, string title, System.Action back)
    {
        var b = Hud.Pill(parent, "‹ Back", back, 15);
        Hud.At((RectTransform)b.transform, new Vector2(0, 1), new Vector2(26, -30), new Vector2(110, 44));
        var h = Hud.Label(parent, title.ToUpperInvariant(), 26, new Color(0.333f, 0.353f, 0.388f), true, 500, 40, TextAlignmentOptions.Top);
        h.margin = new Vector4(0, 38, 0, 0);
        Chip(parent, new Vector2(-26, -14));
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
        view.gameObject.AddComponent<Image>().color = new Color(0.95f, 0.95f, 0.94f, 0.8f);
        System.Action shut = () => { Mats.Kill(view.gameObject); if (sheet == view) sheet = null; };
        view.gameObject.AddComponent<Button>().onClick.AddListener(() => shut());
        var card = Hud.Glass(view, "Card", Color.white);
        Hud.At((RectTransform)card.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(620, 330));
        // (The card itself swallows taps, so only the veil closes.)
        card.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        var who = Hud.Label(card.transform, string.IsNullOrEmpty(p.Name) ? "Commander" : p.Name, 28, Look.Ink, true, 500, 4, TextAlignmentOptions.TopLeft);
        who.margin = new Vector4(34, 30, 140, 0);
        var record = Hud.Label(card.transform, $"{p.Won} won of {p.Played} played", 16, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
        record.margin = new Vector4(34, 74, 0, 0);
        var close = Hud.Pill(card.transform, "Close", () => shut(), 13);
        Hud.At((RectTransform)close.transform, new Vector2(1, 1), new Vector2(-28, -30), new Vector2(100, 40));
        int need = Progression.XpToNext(p.Level);
        var boxes = new[]
        {
            ("LEVEL", p.Level.ToString(), $"{p.Xp} / {need} xp", (float)p.Xp / Mathf.Max(1, need)),
            ("STARDUST", $"✦ {p.Stardust}", "", -1f),
            ("FLUX", $"⟁ {p.Flux}", "", -1f),
            ("RANK", p.RankPoints == null ? "unranked" : Progression.RankName(p.RankPoints.Value).ToLowerInvariant(), "", p.RankPoints == null ? -1f : Progression.RankOf(p.RankPoints.Value).Points / 100f),
        };
        for (int i = 0; i < boxes.Length; i++)
        {
            var (head, shown, foot, bar) = boxes[i];
            var box = Hud.Glass(card.transform, head, new Color(0.965f, 0.969f, 0.984f), false);
            Hud.At((RectTransform)box.transform, new Vector2(0, 0), new Vector2(34 + i * 141, 34), new Vector2(129, 150));
            var hl = Hud.Label(box.transform, head, 11, Look.InkFaint, true, 500, 16, TextAlignmentOptions.Top);
            hl.margin = new Vector4(0, 16, 0, 0);
            var vl = Hud.Label(box.transform, shown, shown.Length > 9 ? 15 : 24, Look.Ink, true, 500, 2);
            vl.textWrappingMode = TextWrappingModes.Normal;
            vl.margin = new Vector4(8, 0, 8, 0);
            if (bar >= 0)
            {
                var track = Hud.Rect(box.transform, "Bar");
                Hud.At(track, new Vector2(0.5f, 0), new Vector2(0, foot.Length > 0 ? 36 : 22), new Vector2(97, 5));
                var ti = track.gameObject.AddComponent<Image>();
                ti.sprite = Hud.Rounded;
                ti.type = Image.Type.Sliced;
                ti.color = new Color(0.88f, 0.89f, 0.92f);
                var fill = Hud.Rect(track, "Fill");
                Hud.At(fill, new Vector2(0, 0.5f), Vector2.zero, new Vector2(97 * Mathf.Clamp01(bar), 5));
                var fi = fill.gameObject.AddComponent<Image>();
                fi.sprite = Hud.Rounded;
                fi.type = Image.Type.Sliced;
                fi.color = Look.Pick;
            }
            if (foot.Length > 0)
            {
                var fl = Hud.Label(box.transform, foot, 12, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Bottom);
                fl.margin = new Vector4(0, 0, 0, 12);
            }
        }
    }

    /// <summary>Options (the web's options page): sound, music, the AI's speed.</summary>
    void Options()
    {
        if (sheet != null) Mats.Kill(sheet.gameObject);
        System.Action close = () => { if (sheet != null) Mats.Kill(sheet.gameObject); sheet = null; };
        sheet = Hud.Sheet(page, "options", new[]
        {
            new Hud.Row("sound", () => { Sound.Muted = !Sound.Muted; Options(); }, Sound.Muted ? "off" : "on"),
            new Hud.Row("music", Sound.Muted ? (System.Action)null : () => { Sound.MusicOn = !Sound.MusicOn; Options(); }, Sound.MusicOn && !Sound.Muted ? "on" : "off"),
            new Hud.Row("ai speed", () => { BattleView.NextSpeed(); Options(); }, BattleView.Speed),
        }, close);
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
