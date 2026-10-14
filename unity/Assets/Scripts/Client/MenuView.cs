using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The menu (app.ts renderMenu): the title page, the hub (the five ways to play, the shop, collection and glossary
/// along the top, you and your options in the corner), and quickplay's setup (your deck and your rival's).
/// </summary>
public class MenuView : MonoBehaviour
{
    Camera cam;
    Canvas canvas;
    RectTransform page;
    string current;
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
        var bg = Hud.Rect(canvas.transform, "Background");
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
        var glow = Hud.Rect(canvas.transform, "Glow");
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
        switch (name)
        {
            case "hub": Hub(); break;
            case "quickplay": Quickplay(); break;
            case "collection": BuilderView.Make(page, this); break;
            case "glossary": GlossaryView.Make(page, this); break;
            case "tutorial": TutorialView.Make(page, this); break;
            case "challenges": ChallengesView.Make(page, this); break;
            case "campaign": CampaignMenu(); break;
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
            b.onClick.AddListener(() => { if (icon == "collection" || icon == "glossary") Show(icon); else Soon(name); });
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
            r.gameObject.AddComponent<Button>().onClick.AddListener(() => Soon(name.ToLowerInvariant()));
        }
        var saved = CampaignView.Saved();
        var begin = Hud.Pill(page, saved != null ? "Continue run" : "Begin run", () => App.Instance.Run(saved ?? CampaignView.NewRun()), 18, Color.white);
        Hud.At((RectTransform)begin.transform, new Vector2(0.5f, 0), new Vector2(0, 40), new Vector2(290, 64));
        var lv = Hud.Label(page, $"COMMANDER · LEVEL {level.Level}", 13, Look.InkFaint, true, 500, 24, TextAlignmentOptions.Bottom);
        lv.margin = new Vector4(0, 0, 0, 116);
    }

    /// <summary>You, top right: your name and level, your stardust and flux (the hub's chip, on the pages off it too).</summary>
    public void Chip(Transform parent)
    {
        var me = Profile.Me;
        var chip = Hud.Glass(parent, "You", Look.GlassStrong);
        Hud.At((RectTransform)chip.transform, new Vector2(1, 1), new Vector2(-136, -26), new Vector2(330, 76));
        var who = Hud.Label(chip.transform, $"<b>{(string.IsNullOrEmpty(me.Name) ? "Commander" : me.Name)}</b>\n<size=70%><color=#737780>LEVEL {me.Level}</color></size>", 22, Look.Ink, true, 500, 4, TextAlignmentOptions.Left);
        who.margin = new Vector4(24, 0, 0, 0);
        var cur = Hud.Label(chip.transform, $"✦ {me.Stardust}\n⟁ {me.Flux}", 18, Look.InkSoft, false, 500, 0, TextAlignmentOptions.Right);
        cur.margin = new Vector4(0, 0, 22, 0);
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
