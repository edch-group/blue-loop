using System.Collections.Generic;
using System.Linq;
using System.Text;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The deck builder and collection (builder.ts): first the decks, the game mode as a switch under the title, then your
/// decks (a new one first) and the starters to copy from, each a little box in its race's colour with its hero on the
/// front; a deck can be imported from a code, or its code shared. Open a deck and the whole card pool lies on the left,
/// a page at a time, searched and filtered, and the deck on the right: tap a card to put it in, a row to take one out,
/// a card's count to craft another copy with flux or break a spare one down. A deck saves once it is legal; a starter
/// changed saves as a copy of its own.
/// </summary>
public class BuilderView : MonoBehaviour
{
    public static readonly string[] Kinds = { "unit", "surge", "relic", "global", "command", "trap" };
    public static readonly Dictionary<string, string> KindName = new Dictionary<string, string>
    {
        ["unit"] = "Entity", ["surge"] = "Technology", ["command"] = "Hero", ["trap"] = "Trap", ["relic"] = "Relic", ["global"] = "Global",
    };
    static readonly string[] Rarities = { "dwarf", "stellar", "anomaly" };
    static readonly Dictionary<string, string> RarityName = new Dictionary<string, string> { ["dwarf"] = "White Dwarf", ["stellar"] = "Stellar", ["anomaly"] = "Anomaly", ["enigma"] = "Enigma" };
    static readonly Dictionary<string, int> RarityOrder = new Dictionary<string, int> { ["dwarf"] = 0, ["stellar"] = 1, ["anomaly"] = 2, ["enigma"] = 3 };
    /// <summary>FACTION_COLOUR: each race's colour (a deck box is its main race's).</summary>
    static readonly string[] FactionColour = { "#6f9fd8", "#d48a7c", "#c9a95e", "#a08bcb", "#5d5398", "#c7783e", "#8fa6c4", "#d9503a" };
    const string GridKey = "blue-loop:db-grid", ModeKey = "blue-loop:db-mode";

    /// <summary>The card view's filters: a search, any number of values ticked for each of race, type, rarity, cost and collection (none ticked lets everything through), an order and two toggles.</summary>
    class Filters
    {
        public string Q = "";
        public readonly Dictionary<string, HashSet<string>> Ticked = new Dictionary<string, HashSet<string>>
        {
            ["race"] = new HashSet<string>(), ["kind"] = new HashSet<string>(), ["rarity"] = new HashSet<string>(), ["cost"] = new HashSet<string>(), ["own"] = new HashSet<string>(),
        };
        public string Sort = "cost";
        public bool Characters, InDeck;
    }

    RectTransform root;
    MenuView menu;
    /// <summary>The deck open (null: the list of decks); opened from a starter, the starter as it was.</summary>
    Decks.Saved editing, starter;
    string openedSnap = "";
    bool confirmExit;
    Filters filters = new Filters();
    /// <summary>A card opened to craft or break down; the filters popover and which of its dropdowns is open; a card read large.</summary>
    string focus, dropOpen, zoomed;
    bool filtersOpen;
    int pageAt;
    /// <summary>How big the pool's cards are ("sm", "md", "lg"), and the game mode the list shows: both remembered on this device.</summary>
    string grid, gm;
    /// <summary>A panel over the list: "import" a deck code, or "share" one (panelDeck).</summary>
    string panel, panelDeck, codeText = "";
    RectTransform poolArea, pagerArea;

    public static BuilderView Make(RectTransform parent, MenuView menu, Decks.Saved editing = null)
    {
        var r = Hud.Rect(parent, "Builder");
        Hud.Fill(r);
        var v = r.gameObject.AddComponent<BuilderView>();
        v.root = r;
        v.menu = menu;
        var g = Store.Get(GridKey);
        v.grid = g == "sm" || g == "lg" ? g : "md";
        v.gm = Store.Get(ModeKey) == "lost" ? "lost" : "core";
        if (editing != null) v.Open(editing, editing.Preset == true ? null : editing.Id, editing.Name);
        v.Draw();
        return v;
    }

    public static string ShownKind(CardDef def)
    {
        if (def.Kind == "command" || def.Kind == "trap" || def.Kind == "relic" || def.Kind == "global") return def.Kind;
        return Cards.IsBurst(def) ? "surge" : "unit";
    }

    static Color Hex(string hex) => ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.grey;
    /// <summary>CSS color-mix(in srgb, a k, b).</summary>
    static Color Mix(Color a, float k, Color b) => Color.Lerp(b, a, k);
    static string Html(Color c) => "#" + ColorUtility.ToHtmlStringRGB(c);
    static string NewId() => "deck-" + Base36(System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    static string Base36(long n)
    {
        const string digits = "0123456789abcdefghijklmnopqrstuvwxyz";
        var sb = new StringBuilder();
        do { sb.Insert(0, digits[(int)(n % 36)]); n /= 36; } while (n > 0);
        return sb.ToString();
    }
    static string Clip(string s, int n) => s.Length > n ? s.Substring(0, n) : s;
    /// <summary>A deck's cards in any order (to compare), and the deck as it stands (its name too).</summary>
    static string CardsKey(IEnumerable<string> cards) => string.Join(",", cards.OrderBy(x => x, System.StringComparer.Ordinal));
    static string Snap(Decks.Saved d) => $"{d.Name.Trim()}|{CardsKey(d.Cards)}";
    /// <summary>Where a card falls in energy-cost order (X, spending all you have, last).</summary>
    static int CostOrder(CardDef c) => c.SpendAll == true ? 9 : Game.CardCost(c.Id);
    static int Count(List<string> cards, string id) => cards.Count(x => x == id);

    /// <summary>Open a deck: a copy to change (with `id`, saving over that deck; without, a new one).</summary>
    void Open(Decks.Saved src, string id, string name)
    {
        starter = src.Preset == true && id == null && name == src.Name ? src : null;
        editing = new Decks.Saved { Id = id ?? NewId(), Name = name, Cards = src.Cards.ToList(), Mode = Modes.ModeOf(src), Cover = src.Preset == true ? null : src.Cover };
        openedSnap = Snap(editing);
        confirmExit = false;
        filters = new Filters();
        focus = null;
        filtersOpen = false;
        pageAt = 0;
    }

    void Draw()
    {
        var old = new List<GameObject>();
        foreach (Transform c in root) old.Add(c.gameObject);
        foreach (var o in old) Mats.Kill(o);
        // (Cards show as they play in the deck's mode.)
        Modes.SetRulesMode(editing != null ? Modes.ModeOf(editing) : "lost");
        if (editing != null) Editor();
        else List();
        if (panel != null) Panel();
        if (zoomed != null) Zoom();
    }

    // ---- The decks ----

    void List()
    {
        var back = Hud.Pill(root, "‹ Back", () => menu.Show("hub"), 15);
        Hud.At((RectTransform)back.transform, new Vector2(0, 1), new Vector2(26, -30), new Vector2(110, 44));
        var title = Hud.Label(root, "DECKS", 26, new Color(0.333f, 0.353f, 0.388f), true, 500, 40, TextAlignmentOptions.Top);
        title.margin = new Vector4(0, 38, 0, 0);
        var imp = Hud.Pill(root, "Import", () => { panel = "import"; codeText = ""; Draw(); }, 14);
        Hud.At((RectTransform)imp.transform, new Vector2(1, 1), new Vector2(-26, -30), new Vector2(150, 44));
        imp.GetComponentInChildren<TextMeshProUGUI>().margin = new Vector4(30, 0, 0, 0);
        Icon(imp.transform, "db-upload", new Vector2(0, 0.5f), new Vector2(22, 0), 18, Look.InkSoft);

        // One column, top to bottom: the mode, your decks (a new one first), the starters.
        var view = Hud.Rect(root, "List");
        view.anchorMin = Vector2.zero;
        view.anchorMax = Vector2.one;
        view.offsetMin = Vector2.zero;
        view.offsetMax = new Vector2(0, -96);
        view.gameObject.AddComponent<RectMask2D>();
        var content = Hud.Rect(view, "Content");
        content.anchorMin = content.anchorMax = content.pivot = new Vector2(0.5f, 1);
        content.anchoredPosition = Vector2.zero;
        float y = -8;

        var modes = Hud.Glass(content, "Modes", new Color(1, 1, 1, 0.7f));
        Hud.At((RectTransform)modes.transform, new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(528, 150));
        for (int i = 0; i < 2; i++)
        {
            string m = i == 0 ? "core" : "lost";
            bool on = gm == m;
            var mb = Hud.Rect(modes.transform, m);
            Hud.At(mb, new Vector2(0, 1), new Vector2(4 + i * 262, -4), new Vector2(258, 142));
            var bg = mb.gameObject.AddComponent<Image>();
            bg.sprite = Hud.Rounded;
            bg.type = Image.Type.Sliced;
            bg.color = on ? Color.white : new Color(1, 1, 1, 0.001f);
            mb.gameObject.AddComponent<Button>().onClick.AddListener(() =>
            {
                Sound.Play("click");
                gm = m;
                Store.Set(ModeKey, m);
                Draw();
            });
            var art = Hud.Rect(mb, "Art");
            Hud.At(art, new Vector2(0.5f, 1), new Vector2(0, -10), new Vector2(232, 72));
            var ai = art.gameObject.AddComponent<RawImage>();
            ai.texture = Resources.Load<Texture2D>($"Icons/mode-{m}{(on ? "" : "-off")}");
            ai.raycastTarget = false;
            var mn = Hud.Label(mb, Modes.GameModes[m].Name.ToUpperInvariant(), 14, on ? Look.Ink : Look.InkSoft, true, 400, 30, TextAlignmentOptions.Top);
            mn.margin = new Vector4(0, 90, 0, 0);
            var blurb = Hud.Label(mb, Modes.GameModes[m].Blurb, 13, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Top);
            blurb.margin = new Vector4(0, 114, 0, 0);
        }
        y -= 150 + 34;

        y = Group(content, y, "YOUR DECKS", "");
        var mine = Decks.Custom().Where(d => Modes.ModeOf(d) == gm).ToList();
        var presets = Decks.Presets.Where(d => Modes.ModeOf(d) == gm).ToList();
        y = Boxes(content, y, mine, true);
        y -= 30;
        y = Group(content, y, "STARTERS", "COPY ONE TO MAKE IT YOUR OWN");
        y = Boxes(content, y, presets.Where(d => d.Mixed != true).Concat(presets.Where(d => d.Mixed == true)).ToList(), false);

        content.sizeDelta = new Vector2(800, -y + 24);
        var hit = content.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0.001f);
        var scroll = view.gameObject.AddComponent<ScrollRect>();
        scroll.viewport = view;
        scroll.content = content;
        scroll.horizontal = false;
        scroll.movementType = ScrollRect.MovementType.Clamped;
        scroll.scrollSensitivity = 40;
    }

    static float Group(RectTransform content, float y, string name, string note)
    {
        var l = Hud.Label(content, note.Length > 0 ? $"{name}  <color=#a6a9b0><size=80%>{note}</size></color>" : name, 13, Look.InkSoft, true, 500, 30, TextAlignmentOptions.Top);
        l.rectTransform.anchorMin = new Vector2(0, 1);
        l.rectTransform.anchorMax = new Vector2(1, 1);
        l.rectTransform.pivot = new Vector2(0.5f, 1);
        l.rectTransform.anchoredPosition = new Vector2(0, y);
        l.rectTransform.sizeDelta = new Vector2(0, 24);
        return y - 40;
    }

    const float BoxW = 150, BoxH = 208, Depth = 12;

    /// <summary>A grid of deck boxes, four to a row (yours led by a new one); returns where it ends.</summary>
    float Boxes(RectTransform content, float y, List<Decks.Saved> decks, bool own)
    {
        int n = decks.Count + (own ? 1 : 0);
        const float pitchX = BoxW + 28, pitchY = Depth + BoxH + 6 + 30 + 22;
        for (int i = 0; i < n; i++)
        {
            var at = new Vector2(-1.5f * pitchX + (i % 4) * pitchX, y - (i / 4) * pitchY);
            if (own && i == 0) { NewTile(content, at); continue; }
            var d = decks[i - (own ? 1 : 0)];
            var buttons = new List<(string icon, string name, System.Action act, bool danger)>
            {
                ("db-copy", "copy", () => { Open(d, null, Clip($"{d.Name} copy", 24)); Draw(); }, false),
            };
            if (own)
            {
                buttons.Add(("db-share", "share", () => { panel = "share"; panelDeck = d.Id; Draw(); }, false));
                buttons.Add(("db-delete", "delete", () => { Decks.Delete(d.Id); Draw(); }, true));
            }
            // (Open it by tapping the box: a starter to look through, your own to edit.)
            DeckBox(content, at, d, () => { Open(d, own ? d.Id : null, d.Name); Draw(); }, buttons);
        }
        return y - ((n + 3) / 4) * pitchY;
    }

    /// <summary>The new deck's tile: a dashed place for a box, a plus in it.</summary>
    void NewTile(RectTransform parent, Vector2 at)
    {
        var cell = Hud.Rect(parent, "New deck");
        Hud.At(cell, new Vector2(0.5f, 1), at, new Vector2(BoxW + Depth, Depth + BoxH));
        var box = Hud.Glass(cell, "Box", new Color(1, 1, 1, 0.45f), false);
        Hud.At((RectTransform)box.transform, new Vector2(0, 0), Vector2.zero, new Vector2(BoxW, BoxH));
        Outline(box.transform, new Color(0.365f, 0.416f, 0.549f, 0.45f), 1.5f);
        box.gameObject.AddComponent<Button>().onClick.AddListener(() =>
        {
            Sound.Play("click");
            Open(new Decks.Saved { Name = "New deck", Cards = new List<string>(), Mode = gm }, null, "New deck");
            Draw();
        });
        var plus = Hud.Rect(box.transform, "Plus");
        Hud.At(plus, new Vector2(0.5f, 0.5f), new Vector2(0, 16), new Vector2(46, 46));
        var pi = plus.gameObject.AddComponent<Image>();
        pi.sprite = Hud.Circle;
        pi.color = Hex("#5d6a8c");
        pi.raycastTarget = false;
        Hud.Label(plus, "+", 30, Color.white, false, 400, 0).margin = new Vector4(0, 0, 0, 4);
        var l = Hud.Label(box.transform, "NEW DECK", 11, Look.InkSoft, true, 400, 16);
        l.margin = new Vector4(0, 70, 0, 0);
    }

    /// <summary>
    /// A deck as a deck box (builder.ts deckBox): a little 3D box in its race's colour, its cover the hero of its most
    /// expensive Command card (its race's emblem if it has none), its name and races on the front, its buttons beneath.
    /// </summary>
    void DeckBox(RectTransform parent, Vector2 at, Decks.Saved d, System.Action open, List<(string icon, string name, System.Action act, bool danger)> buttons)
    {
        var cell = Hud.Rect(parent, d.Name);
        Hud.At(cell, new Vector2(0.5f, 1), at, new Vector2(BoxW + Depth, Depth + BoxH + 6 + 30));
        if (DeckRules.DeckProblems(d.Cards, Modes.ModeOf(d)).Count > 0) cell.gameObject.AddComponent<CanvasGroup>().alpha = 0.7f;
        var dc = DeckColour(d.Cards);
        var box = Hud.Rect(cell, "Box");
        Hud.At(box, new Vector2(0, 1), new Vector2(0, -Depth), new Vector2(BoxW, BoxH));
        // Its shadow, its lid and right side (slanted faces behind the front), then the front.
        var shade = Hud.Rect(box, "Shadow");
        Hud.Fill(shade);
        shade.offsetMin = new Vector2(-14, -30);
        shade.offsetMax = new Vector2(14, -2);
        var si = shade.gameObject.AddComponent<Image>();
        si.sprite = Hud.Soft;
        si.type = Image.Type.Sliced;
        si.color = new Color(0.16f, 0.17f, 0.24f, 0.3f);
        si.raycastTarget = false;
        Face(box, "Lid", new[] { new Vector2(0, BoxH), new Vector2(BoxW, BoxH), new Vector2(BoxW + Depth, BoxH + Depth), new Vector2(Depth, BoxH + Depth) },
            Mix(dc, 0.14f, Hex("#7a8498")), Mix(dc, 0.14f, Hex("#9aa3b5")));
        var side = Face(box, "Side", new[] { new Vector2(BoxW, 0), new Vector2(BoxW + Depth, Depth), new Vector2(BoxW + Depth, BoxH + Depth), new Vector2(BoxW, BoxH) },
            Mix(dc, 0.08f, Hex("#343a47")), Mix(dc, 0.12f, Hex("#434b5b")));
        side.Colours[1] = side.Colours[2] = Mix(dc, 0.08f, Hex("#343a47"));
        side.Colours[0] = side.Colours[3] = Mix(dc, 0.12f, Hex("#434b5b"));
        var front = Face(box, "Front", new[] { Vector2.zero, new Vector2(BoxW, 0), new Vector2(BoxW, BoxH), new Vector2(0, BoxH) },
            Mix(dc, 0.14f, Hex("#4b5466")), Mix(dc, 0.24f, Hex("#6b7588")));
        front.raycastTarget = true;
        var fb = front.gameObject.AddComponent<Button>();
        fb.onClick.AddListener(() => { Sound.Play("click"); open(); });
        // A band of its colour just under the lid, and a thin printed frame inside the edge.
        var band = Hud.Rect(front.transform, "Band");
        Hud.At(band, new Vector2(0.5f, 1), new Vector2(0, -BoxH * 0.022f), new Vector2(BoxW, Mathf.Max(1.5f, BoxH * 0.01f)));
        band.gameObject.AddComponent<Image>().color = Mix(dc, 0.75f, Color.white);
        var frame = Hud.Rect(front.transform, "Frame");
        Hud.Fill(frame);
        frame.offsetMin = new Vector2(BoxW * 0.045f, BoxW * 0.045f);
        frame.offsetMax = -frame.offsetMin;
        Outline(frame, new Color(1, 1, 1, 0.16f), 1);
        // The cover.
        float cs = BoxW * 0.72f;
        var cover = Hud.Rect(front.transform, "Cover");
        Hud.At(cover, new Vector2(0.5f, 1), new Vector2(0, -24), new Vector2(cs + 8, cs + 8));
        var ring = cover.gameObject.AddComponent<Image>();
        ring.sprite = Hud.Circle;
        ring.color = Mix(dc, 0.7f, Color.white);
        ring.raycastTarget = false;
        var inner = Hud.Rect(cover, "White");
        Hud.At(inner, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(cs + 6, cs + 6));
        var wi = inner.gameObject.AddComponent<Image>();
        wi.sprite = Hud.Circle;
        wi.color = new Color(1, 1, 1, 0.9f);
        wi.raycastTarget = false;
        var hero = d.Cover ?? CoverCard(d.Cards);
        int? race = Campaign.MainRace(d.Cards);
        if (hero != null) Portrait(cover, hero, cs);
        else
        {
            var em = Hud.Rect(cover, "Emblem");
            Hud.At(em, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(cs * 0.7f, cs * 0.7f));
            var ei = em.gameObject.AddComponent<RawImage>();
            ei.texture = Resources.Load<Texture2D>(race == null ? "Icons/collection-small" : $"Icons/faction-f{race.Value + 1}");
            ei.raycastTarget = false;
        }
        var nm = Hud.Label(front.transform, d.Name.ToUpperInvariant(), 11, Color.white, true, 500, 14, TextAlignmentOptions.Bottom);
        nm.textWrappingMode = TextWrappingModes.Normal;
        nm.margin = new Vector4(10, 0, 10, 36);
        var rl = Hud.Label(front.transform, RacesLabel(d.Cards).ToUpperInvariant(), 9, new Color(1, 1, 1, 0.85f), false, 500, 20, TextAlignmentOptions.Bottom);
        rl.margin = new Vector4(6, 0, 6, 18);
        // Cards still to collect, on a tag.
        int missing = MissingCopies(d.Cards).Sum(x => x.n);
        if (missing > 0)
        {
            var tag = Hud.Glass(front.transform, "Tag", Color.white, false);
            Hud.At((RectTransform)tag.transform, new Vector2(0.5f, 1), new Vector2(0, -BoxH * 0.09f), new Vector2(124, 22));
            Hud.Label(tag.transform, $"{missing} TO COLLECT", 9, Hex("#a8641c"), true, 500, 12);
        }
        // Its buttons, small and round, beneath.
        for (int i = 0; i < buttons.Count; i++)
        {
            var (icon, name, act, danger) = buttons[i];
            var b = Hud.Glass(cell, name, Color.white, false);
            Hud.At((RectTransform)b.transform, new Vector2(0, 0), new Vector2(BoxW / 2 - (buttons.Count * 36 - 6) / 2f + i * 36, 0), new Vector2(30, 30));
            b.sprite = Hud.Circle;
            b.type = Image.Type.Simple;
            var bb = b.gameObject.AddComponent<Button>();
            bb.onClick.AddListener(() => { Sound.Play("click"); act(); });
            Icon(b.transform, icon, new Vector2(0.5f, 0.5f), Vector2.zero, 16, danger ? Hex("#c0503a") : Look.InkSoft);
        }
    }

    /// <summary>
    /// A seat's deck as a small deck box (app.ts deckBoxMini, quickplay's and online's): `bw` across (the web's 133.4),
    /// its button's top-left at (x, y); the front 0.72 as wide as tall, its lid and right side `bw` × 0.08 deep, the
    /// cover (68% across) in its middle with a ring of its colour; picked (`on`), lifted 7.25 in a soft slate halo with
    /// a tick on its front, else faded to 72%; its name beneath (12.1, spaced 0.1em). `act` null: not a button.
    /// </summary>
    public static RectTransform DeckBoxMini(RectTransform parent, float x, float y, Decks.Saved d, bool on, System.Action act, float bw = 133.4f, bool big = false)
    {
        float bh = bw / 0.72f, depth = bw * 0.08f, lift = on ? 7.25f : 0;
        var cell = Hud.Rect(parent, d.Name);
        Hud.Place(cell, x, y, bw, bh + 8.7f + 15);
        var dc = DeckColour(d.Cards);
        var box = Hud.Rect(cell, "Box");
        Hud.Place(box, 0, -lift, bw, bh);
        if (!on && !big) box.gameObject.AddComponent<CanvasGroup>().alpha = 0.72f;
        // Its lid and right side (slanted faces behind the front: the lid sheared right, the side up), then the front.
        Face(box, "Lid", new[] { new Vector2(0, bh), new Vector2(bw, bh), new Vector2(bw + depth, bh + depth), new Vector2(depth, bh + depth) },
            Mix(dc, 0.14f, Hex("#7a8498")), Mix(dc, 0.14f, Hex("#9aa3b5")));
        var side = Face(box, "Side", new[] { new Vector2(bw, 0), new Vector2(bw + depth, depth), new Vector2(bw + depth, bh + depth), new Vector2(bw, bh) }, Color.white, Color.white);
        side.Colours[0] = side.Colours[3] = Mix(dc, 0.12f, Hex("#434b5b"));
        side.Colours[1] = side.Colours[2] = Mix(dc, 0.08f, Hex("#343a47"));
        // (The front's slate, lit from its top left and darker at its foot: the web's 160° gradient, its highlight
        // and its inset shade, at its four corners.)
        Color c1 = Mix(dc, 0.24f, Hex("#6b7588")), c2 = Mix(dc, 0.14f, Hex("#4b5466"));
        var front = Face(box, "Front", new[] { Vector2.zero, new Vector2(bw, 0), new Vector2(bw, bh), new Vector2(0, bh) }, Color.white, Color.white);
        front.Colours[3] = Color.Lerp(c1, Color.white, 0.12f);
        front.Colours[2] = Color.Lerp(Color.Lerp(c1, c2, 0.3f), Color.white, 0.06f);
        front.Colours[0] = Color.Lerp(c2, Hex("#141822"), 0.12f);
        front.Colours[1] = Color.Lerp(c2, Hex("#141822"), 0.14f);
        var drop = new Hud.Drop(Hud.Rgba(40, 44, 60, 0.25f), 20.3f, 34.8f);
        // (Picked: the halo round it too.)
        if (on) Hud.Shadow(front, 4, drop, new Hud.Drop(Hud.Rgba(93, 106, 140, 0.28f), 0, 7.25f, 1.4f));
        else Hud.Shadow(front, 4, drop);
        Outline(front.transform, Mix(dc, 0.25f, Hex("#7a8498")), 1);
        if (act != null)
        {
            front.raycastTarget = true;
            front.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); act(); });
        }
        // A band of its colour just under the lid, and a thin printed frame 6% inside the edge.
        var band = Hud.Rect(front.transform, "Band");
        Hud.Place(band, 0, bh * 0.022f, bw, bh * 0.01f);
        band.gameObject.AddComponent<Image>().color = Mix(dc, 0.75f, Color.white);
        var frame = Hud.Rect(front.transform, "Frame");
        Hud.Fill(frame);
        frame.offsetMin = new Vector2(bw * 0.06f, bh * 0.06f);
        frame.offsetMax = -frame.offsetMin;
        Outline(frame, new Color(1, 1, 1, 0.16f), 1);
        // The cover: white under it, a ring of its colour, a shadow.
        // (A big box, as the deck lists show it, has its cover higher, its name and races under it on the front.)
        float cs = bw * (big ? 0.72f : 0.68f);
        var cover = Hud.Rect(front.transform, "Cover");
        Hud.At(cover, new Vector2(0.5f, 1), new Vector2(0, -(big ? 0.424f : 0.5f) * bh), new Vector2(cs, cs));
        cover.pivot = new Vector2(0.5f, 0.5f);
        var ci = cover.gameObject.AddComponent<Image>();
        ci.sprite = Hud.Circle;
        ci.color = Color.white;
        ci.raycastTarget = false;
        Hud.Shadow(ci, cs / 2, new Hud.Drop(Mix(dc, 0.6f, Color.white), 0, 0, 2.2f), new Hud.Drop(Hud.Rgba(20, 24, 34, 0.4f), 4.3f, 11.6f));
        var hero = d.Cover ?? CoverCard(d.Cards);
        int? race = Campaign.MainRace(d.Cards);
        if (hero != null) Portrait(cover, hero, cs);
        else
        {
            var em = Hud.Rect(cover, "Emblem");
            Hud.At(em, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(cs * 0.7f, cs * 0.7f));
            var ei = em.gameObject.AddComponent<RawImage>();
            ei.texture = Resources.Load<Texture2D>(race == null ? "Icons/collection-small" : $"Icons/faction-f{race.Value + 1}");
            ei.raycastTarget = false;
        }
        if (on)
        {
            // (The tick: the app's ticked box, larger: 17% of the box across, 6% down and 7% in from its right.)
            float t = Mathf.Max(21.75f, bw * 0.17f);
            var tick = Hud.Box(front.transform, "Tick", Hex("#5d6a8c"), t * 0.28f);
            Hud.Place((RectTransform)tick.transform, bw * 0.93f - t, bh * 0.06f, t, t);
            Hud.Shadow(tick, t * 0.28f, new Hud.Drop(new Color(1, 1, 1, 0.7f), 0, 0, 1.4f));
            Hud.Label(tick.transform, "✓", t * 0.72f, Color.white, false, 600, 0);
        }
        if (big)
        {
            var nm = Hud.Text(front.transform, d.Name.ToUpperInvariant(), bw * 0.08f, bh * 0.83f - 11, bw * 0.84f, 22, 16.7f, Color.white, true, 500, 14);
            nm.textWrappingMode = TextWrappingModes.Normal;
            Hud.Text(front.transform, RacesLabel(d.Cards).ToUpperInvariant(), bw * 0.05f, bh * 0.9f - 8, bw * 0.9f, 16, 13.5f, new Color(1, 1, 1, 0.85f), false, 500, 20);
        }
        else Hud.Text(cell, d.Name.ToUpperInvariant(), -10, bh + 8.7f, bw + 20, 15, 12.1f, on ? Look.Ink : Look.InkFaint, true, 400, 10);
        return cell;
    }

    /// <summary>A deck's cover: its most expensive Command card (by energy, then rarity, then name), if it has one (cover.ts).</summary>
    static string CoverCard(List<string> cards) => cards.Distinct().Select(Cards.Def).Where(c => c.Kind == "command")
        .OrderByDescending(c => Game.CardCost(c.Id)).ThenByDescending(c => Progression.CraftCost(c.Id)).ThenBy(c => c.Name, System.StringComparer.InvariantCultureIgnoreCase)
        .FirstOrDefault()?.Id;

    /// <summary>A deck box's colour: that of the race most of its cards are from, else grey.</summary>
    static Color DeckColour(List<string> cards)
    {
        var race = Campaign.MainRace(cards);
        return race != null && race.Value < FactionColour.Length ? Hex(FactionColour[race.Value]) : Hex("#9aa0ac");
    }

    /// <summary>What a deck's cards are, in a word or two: the races they come from (most first), or neutral.</summary>
    static string RacesLabel(List<string> cards)
    {
        var order = new List<int>();
        var counts = new Dictionary<int, int>();
        foreach (var id in cards)
        {
            var r = Cards.Def(id).Race;
            if (r == null) continue;
            if (!counts.ContainsKey(r.Value)) { counts[r.Value] = 0; order.Add(r.Value); }
            counts[r.Value]++;
        }
        var races = order.OrderByDescending(r => counts[r]).Select(r => Races.RaceNames[r].ToLowerInvariant()).ToList();
        if (races.Count == 0) return "neutral";
        return races.Count > 2 ? $"{races[0]} · {races[1]} +{races.Count - 2}" : string.Join(" · ", races);
    }

    /// <summary>The copies a deck needs that the player doesn't own yet (decks.ts missingCopies).</summary>
    static List<(string id, int n)> MissingCopies(List<string> cards) =>
        cards.GroupBy(x => x).Select(g => (g.Key, g.Count() - Profile.Owned(g.Key))).Where(x => x.Item2 > 0).ToList();

    /// <summary>What a deck still needs before you can play it: the cards to collect, and the flux crafting them would take.</summary>
    static string ToCollect(List<string> cards)
    {
        var missing = MissingCopies(cards);
        if (missing.Count == 0) return "";
        int n = missing.Sum(x => x.n), flux = missing.Sum(x => x.n * Progression.CraftCost(x.id));
        return $"{n} card{(n == 1 ? "" : "s")} still to collect before you can play it (⟁{flux} to craft them all; you have ⟁{Profile.Me.Flux}).";
    }

    /// <summary>A deck from elsewhere (a code) has no mode: Core if its cards are all Core's.</summary>
    static string GuessMode(List<string> cards) => DeckRules.DeckProblems(cards, "core").Any(p => p.Contains("Lost Races") || p.Contains("too much")) ? "lost" : "core";

    /// <summary>A deck from a code kept among your own: what it still needs said, if anything.</summary>
    void KeepDeck(string name, List<string> cards)
    {
        var key = CardsKey(cards);
        if (Decks.Custom().Any(x => CardsKey(x.Cards) == key))
        {
            menu.Toast("Already in your decks");
            return;
        }
        var mode = GuessMode(cards);
        Decks.Save(new Decks.Saved { Id = NewId(), Name = name.Length > 0 ? Clip(name, 24) : "Imported deck", Cards = cards.ToList(), Mode = mode });
        var shortBy = ToCollect(cards);
        var why = DeckRules.DeckProblems(cards, mode).FirstOrDefault();
        // (Only what is wrong is said: a deck ready to play just appears among yours.)
        if (shortBy.Length > 0 || why != null) menu.Toast(shortBy.Length > 0 ? shortBy : $"Not finished yet: {why}");
    }

    // ---- Panels over the list: import a deck code, or share one ----

    void Panel()
    {
        var shared = panel == "share" ? Decks.ById(panelDeck) : null;
        if (panel == "share" && (shared == null || shared.Preset == true)) { panel = null; return; }
        var card = Modal(panel == "import" ? 250 : 236);
        System.Action shut = () => { panel = null; Draw(); };
        if (panel == "import")
        {
            ModalText(card, "IMPORT A DECK", "Paste a deck code (it starts with BL1-). The deck joins your decks; any cards you don't own yet show as still to collect.");
            var input = MakeInput(card, codeText, new Vector2(0, -112), new Vector2(400, 64), 4000, true, "BL1-…");
            input.onValueChanged.AddListener(s => codeText = s);
            var paste = Hud.Pill(card, "Paste", () => { codeText = GUIUtility.systemCopyBuffer ?? ""; Draw(); }, 12);
            Hud.At((RectTransform)paste.transform, new Vector2(0.5f, 0), new Vector2(-150, 22), new Vector2(110, 40));
            var cancel = Hud.Pill(card, "Cancel", shut, 12);
            Hud.At((RectTransform)cancel.transform, new Vector2(0.5f, 0), new Vector2(-24, 22), new Vector2(120, 40));
            var go = Hud.Pill(card, "Import", () =>
            {
                var got = DecodeDeck(codeText);
                if (got == null) { menu.Toast("Not a deck code"); return; }
                if (got.Value.cards.Count == 0) { menu.Toast("No playable cards in that deck"); return; }
                panel = null;
                KeepDeck(got.Value.name, got.Value.cards);
                Draw();
            }, 12, Look.Ink, Color.white);
            Hud.At((RectTransform)go.transform, new Vector2(0.5f, 0), new Vector2(120, 22), new Vector2(120, 40));
        }
        else
        {
            ModalText(card, $"SHARE {shared.Name.ToUpperInvariant()}", "Its deck code: anyone can paste it into their decks page to get this deck.");
            var code = EncodeDeck(shared.Name, shared.Cards);
            var input = MakeInput(card, code, new Vector2(-58, -112), new Vector2(284, 48), 4000, false, "");
            input.readOnly = true;
            var copy = Hud.Pill(card, "Copy", () => { GUIUtility.systemCopyBuffer = code; menu.Toast("Copied"); }, 12);
            Hud.At((RectTransform)copy.transform, new Vector2(0.5f, 1), new Vector2(150, -116), new Vector2(100, 40));
            var close = Hud.Pill(card, "Close", shut, 12);
            Hud.At((RectTransform)close.transform, new Vector2(0.5f, 0), new Vector2(0, 22), new Vector2(120, 40));
        }
    }

    /// <summary>A small modal (the web's .db-confirm) over a veil: its card, which swallows taps.</summary>
    Transform Modal(float height)
    {
        var veil = Hud.Rect(root, "Veil");
        Hud.Fill(veil);
        veil.gameObject.AddComponent<Image>().color = new Color(0.95f, 0.95f, 0.94f, 0.8f);
        var card = Hud.Glass(veil, "Card", Color.white);
        Hud.At((RectTransform)card.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(460, height));
        card.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        return card.transform;
    }

    static void ModalText(Transform card, string head, string body)
    {
        var h = Hud.Label(card, head, 15, Look.Ink, true, 500, 22, TextAlignmentOptions.Top);
        h.margin = new Vector4(20, 22, 20, 0);
        var p = Hud.Label(card, body, 15, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
        p.textWrappingMode = TextWrappingModes.Normal;
        p.margin = new Vector4(30, 52, 30, 0);
    }

    // ---- Deck codes (deckcode.ts): "BL1-" then the deck's name and cards as URL-safe base64 of JSON ----

    const string CodePrefix = "BL1-";

    class CodeData
    {
        public object N;
        public List<object> C;
    }

    static string JsonString(string s)
    {
        var sb = new StringBuilder("\"");
        foreach (var ch in s)
        {
            if (ch == '"') sb.Append("\\\"");
            else if (ch == '\\') sb.Append("\\\\");
            else if (ch == '\n') sb.Append("\\n");
            else if (ch == '\r') sb.Append("\\r");
            else if (ch == '\t') sb.Append("\\t");
            else if (ch < 0x20) sb.Append("\\u").Append(((int)ch).ToString("x4"));
            else sb.Append(ch);
        }
        return sb.Append('"').ToString();
    }

    public static string EncodeDeck(string name, List<string> cards)
    {
        var order = new List<string>();
        var counts = new Dictionary<string, int>();
        foreach (var id in cards)
        {
            if (!counts.ContainsKey(id)) { counts[id] = 0; order.Add(id); }
            counts[id]++;
        }
        var entries = new List<string>();
        foreach (var each in order) entries.Add(JsonString(counts[each] == 1 ? each : each + "*" + counts[each]));
        var json = "{\"n\":" + JsonString(Clip(name, 24)) + ",\"c\":[" + string.Join(",", entries) + "]}";
        return CodePrefix + System.Convert.ToBase64String(Encoding.UTF8.GetBytes(json)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    /// <summary>A deck code read back: its name and cards (ids this game doesn't know left out). Null if it isn't one.</summary>
    public static (string name, List<string> cards)? DecodeDeck(string code)
    {
        var text = new string((code ?? "").Where(ch => !char.IsWhiteSpace(ch)).ToArray());
        if (!text.StartsWith(CodePrefix)) return null;
        try
        {
            var b64 = text.Substring(CodePrefix.Length).Replace('-', '+').Replace('_', '/');
            b64 += new string('=', (4 - b64.Length % 4) % 4);
            var raw = Json.Read<CodeData>(Encoding.UTF8.GetString(System.Convert.FromBase64String(b64)));
            if (raw?.C == null) return null;
            var playable = new HashSet<string>(Cards.Pool.Select(c => c.Id));
            var cards = new List<string>();
            foreach (var entry in raw.C.Take(200))
            {
                if (!(entry is string s)) continue;
                var parts = s.Split('*');
                int times = parts.Length > 1 && int.TryParse(parts[1], out var k) ? k : 1;
                times = Mathf.Clamp(times, 1, 4);
                if (!playable.Contains(parts[0])) continue;
                for (int i = 0; i < times; i++) cards.Add(parts[0]);
            }
            var name = raw.N is string ns ? Clip(new string(ns.Where(ch => ch >= 0x20 && ch != 0x7f).ToArray()).Trim(), 24) : "";
            return (name.Length > 0 ? name : "Imported deck", cards);
        }
        catch
        {
            return null;
        }
    }

    // ---- A deck open: the card pool on the left, the deck on the right ----

    const float SideW = 380, Margin = 24, PoolTop = 84, PoolFoot = 64;
    float PoolW => Hud.W - Margin * 2 - SideW - 16;
    float PoolH => Hud.H - PoolTop - PoolFoot;

    void Editor()
    {
        Toolbar();
        poolArea = Hud.Rect(root, "Pool");
        Hud.At(poolArea, new Vector2(0, 1), new Vector2(Margin, -PoolTop), new Vector2(PoolW, PoolH));
        pagerArea = Hud.Rect(root, "Pager");
        Hud.At(pagerArea, new Vector2(0, 0), new Vector2(Margin, 10), new Vector2(PoolW, 48));
        Pool();
        Side();
        if (filtersOpen) FiltersPop();
        if (confirmExit)
        {
            var card = Modal(196);
            ModalText(card, "LEAVE WITHOUT SAVING?", $"Your changes to {(string.IsNullOrWhiteSpace(editing.Name) ? "this deck" : editing.Name)} will be lost.");
            var keep = Hud.Pill(card, "Keep editing", () => { confirmExit = false; Draw(); }, 12);
            Hud.At((RectTransform)keep.transform, new Vector2(0.5f, 0), new Vector2(-84, 24), new Vector2(160, 42));
            var leave = Hud.Pill(card, "Leave", () => { confirmExit = false; editing = starter = null; Draw(); }, 12, Hex("#fbeeea"), Hex("#b23c24"));
            Hud.At((RectTransform)leave.transform, new Vector2(0.5f, 0), new Vector2(84, 24), new Vector2(140, 42));
        }
    }

    /// <summary>The toolbar: the search, the filters button (with how many are set), the card sizes.</summary>
    void Toolbar()
    {
        var search = MakeInput(root, filters.Q, Vector2.zero, new Vector2(300, 46), 40, false, "search cards");
        var sr = (RectTransform)search.transform;
        Hud.At(sr, new Vector2(0, 1), new Vector2(Margin, -24), new Vector2(300, 46));
        search.onValueChanged.AddListener(s =>
        {
            filters.Q = Clip(s, 40);
            pageAt = 0;
            RefreshPool();
        });
        int set = filters.Ticked.Count(kv => kv.Value.Count > 0) + (filters.Sort != "cost" ? 1 : 0) + (filters.Characters ? 1 : 0) + (filters.InDeck ? 1 : 0);
        var fb = Hud.Glass(root, "Filters", Color.white, false);
        Hud.At((RectTransform)fb.transform, new Vector2(0, 1), new Vector2(Margin + 310, -24), new Vector2(54, 46));
        Outline(fb.transform, filtersOpen || set > 0 ? Hex("#c9cfdd") : new Color(0.9f, 0.9f, 0.92f), 1);
        fb.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); filtersOpen = !filtersOpen; dropOpen = null; Draw(); });
        Icon(fb.transform, "db-filter", new Vector2(0.5f, 0.5f), Vector2.zero, 20, filtersOpen || set > 0 ? Look.Ink : Look.InkSoft);
        if (set > 0)
        {
            var dot = Hud.Rect(fb.transform, "Set");
            Hud.At(dot, new Vector2(1, 1), new Vector2(6, 6), new Vector2(20, 20));
            var di = dot.gameObject.AddComponent<Image>();
            di.sprite = Hud.Circle;
            di.color = Hex("#5d6a8c");
            Hud.Label(dot, set.ToString(), 11, Color.white, true, 700, 0);
        }
        // The card sizes: many small, some medium, a few large.
        var seg = Hud.Glass(root, "Sizes", new Color(1, 1, 1, 0.7f), false);
        Hud.At((RectTransform)seg.transform, new Vector2(0, 1), new Vector2(Margin + PoolW - 132, -26), new Vector2(132, 42));
        var sizes = new[] { "sm", "md", "lg" };
        for (int i = 0; i < 3; i++)
        {
            string g = sizes[i];
            bool on = grid == g;
            var b = Hud.Glass(seg.transform, g, on ? Color.white : new Color(1, 1, 1, 0.001f), false);
            Hud.At((RectTransform)b.transform, new Vector2(0, 0.5f), new Vector2(3 + i * 42, 0), new Vector2(42, 36));
            b.gameObject.AddComponent<Button>().onClick.AddListener(() =>
            {
                Sound.Play("click");
                // (The card leading the page shown stays in view, the pages cut afresh.)
                var first = PageCards().FirstOrDefault();
                grid = g;
                Store.Set(GridKey, g);
                if (first != null) pageAt = Mathf.Max(0, Pages().FindIndex(p => p.Any(c => c.Id == first.Id)));
                Draw();
            });
            Icon(b.transform, $"db-grid-{g}", new Vector2(0.5f, 0.5f), Vector2.zero, 16, on ? Look.Ink : Look.InkSoft);
        }
    }

    // ---- The pool: the cards the filters let through, a page at a time ----

    static readonly Dictionary<string, string> searchIndex = new Dictionary<string, string>();

    /// <summary>Text as searched: lower case, every run of anything but letters and digits a single space.</summary>
    static string Normal(string t)
    {
        var sb = new StringBuilder(" ");
        bool gap = true;
        foreach (var ch in (t ?? "").ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch)) { sb.Append(ch); gap = false; }
            else if (!gap) { sb.Append(' '); gap = true; }
        }
        var s = sb.ToString().TrimEnd();
        return s + " ";
    }

    /// <summary>Every word on a card, for the search: its name, its text, its type, race and sub-race, its race's trait, its rarity.</summary>
    static string SearchText(CardDef c)
    {
        if (searchIndex.TryGetValue(c.Id, out var s)) return s;
        var sub = !string.IsNullOrEmpty(c.Sub) && Races.Subraces != null && Races.Subraces.TryGetValue(c.Sub, out var sr) ? sr.Name : "";
        var trait = c.Race != null ? Races.RaceTrait(c.Race)?.Bonus ?? "" : "";
        s = Normal(string.Join(" ", c.Name, c.Text ?? "", KindName[ShownKind(c)], c.Race != null ? Races.RaceNames[c.Race.Value] : "neutral", sub, trait, RarityName[c.Rarity ?? "dwarf"]));
        searchIndex[c.Id] = s;
        return s;
    }

    static string CostGroup(CardDef c) => c.SpendAll == true ? "x" : Mathf.Min(4, Game.CardCost(c.Id)).ToString();

    /// <summary>The cards the filters let through, in the chosen order.</summary>
    List<CardDef> Filtered()
    {
        var f = filters;
        var terms = Normal(f.Q).Split(' ').Where(t => t.Length > 0).ToList();
        var inDeck = new HashSet<string>(editing.Cards);
        var deckRaces = new HashSet<int>(editing.Cards.Select(id => Cards.Def(id).Race).Where(r => r != null).Select(r => r.Value));
        int flux = Profile.Me.Flux;
        bool core = Modes.ModeOf(editing) == "core";
        var list = Cards.Pool.Where(c =>
        {
            if (core && !Modes.InMode(c, "core")) return false;
            if (terms.Count > 0 && !terms.All(t => SearchText(c).Contains(t))) return false;
            var race = c.Race == null ? "neutral" : c.Race.Value.ToString();
            var races = f.Ticked["race"];
            if (races.Count > 0 && !races.Contains(race) && !(races.Contains("deck") && (c.Race == null || deckRaces.Contains(c.Race.Value)))) return false;
            if (f.Ticked["kind"].Count > 0 && !f.Ticked["kind"].Contains(ShownKind(c))) return false;
            if (f.Ticked["rarity"].Count > 0 && !f.Ticked["rarity"].Contains(c.Rarity ?? "dwarf")) return false;
            if (f.Ticked["cost"].Count > 0 && !f.Ticked["cost"].Contains(CostGroup(c))) return false;
            var own = f.Ticked["own"];
            if (own.Count > 0)
            {
                int have = Profile.Owned(c.Id);
                bool ok = (own.Contains("owned") && have > 0) || (own.Contains("missing") && have == 0) || (own.Contains("craftable") && have < Campaign.CopyLimit(c.Id) && Progression.CraftCost(c.Id) <= flux);
                if (!ok) return false;
            }
            if (f.Characters && c.Character != true) return false;
            if (f.InDeck && !inDeck.Contains(c.Id)) return false;
            return true;
        }).ToList();
        // (A fixed order: cards never move in the grid as the deck changes.)
        var byName = System.StringComparer.InvariantCultureIgnoreCase;
        switch (f.Sort)
        {
            case "race": return list.OrderBy(c => c.Race ?? 9).ToList();
            case "name": return list.OrderBy(c => c.Name, byName).ToList();
            case "type": return list.OrderBy(c => System.Array.IndexOf(Kinds, ShownKind(c))).ThenBy(c => c.Name, byName).ToList();
            case "rarity": return list.OrderByDescending(c => RarityOrder.TryGetValue(c.Rarity ?? "dwarf", out var ro) ? ro : 0).ThenBy(c => c.Name, byName).ToList();
            default: return list.OrderBy(CostOrder).ThenBy(c => c.Name, byName).ToList();
        }
    }

    /// <summary>
    /// The pool's layout (builder.ts sizePool): a set number of rows (small 3, medium 2, large 1), the cards sized to the
    /// pool's height for them, as many columns as then fit across.
    /// </summary>
    (int cols, int rows, float w, float h) Layout()
    {
        int rows = grid == "sm" ? 3 : grid == "lg" ? 1 : 2;
        const float gap = 10;
        float w = Mathf.Floor((PoolH - (rows - 1) * gap) / rows / 1.52f * 10) / 10;
        int cols = Mathf.Max(1, Mathf.FloorToInt((PoolW + gap) / (w + gap)));
        if (cols * w + (cols - 1) * gap > PoolW) w = Mathf.Floor((PoolW - (cols - 1) * gap) / cols * 10) / 10;
        return (cols, rows, w, w * 1.4f);
    }

    List<List<CardDef>> Pages()
    {
        var (cols, rows, _, _) = Layout();
        int per = cols * rows;
        var all = Filtered();
        var pages = new List<List<CardDef>>();
        for (int i = 0; i < all.Count; i += per) pages.Add(all.Skip(i).Take(per).ToList());
        return pages;
    }

    List<CardDef> PageCards()
    {
        var pages = Pages();
        pageAt = Mathf.Clamp(pageAt, 0, Mathf.Max(0, pages.Count - 1));
        return pages.Count == 0 ? new List<CardDef>() : pages[pageAt];
    }

    /// <summary>After the search changes: the pool and its pager drawn afresh (the rest of the page stays as it is).</summary>
    void RefreshPool()
    {
        foreach (var area in new[] { poolArea, pagerArea })
        {
            if (area == null) continue;
            var old = new List<GameObject>();
            foreach (Transform c in area) old.Add(c.gameObject);
            foreach (var o in old) Mats.Kill(o);
        }
        Pool();
    }

    void Pool()
    {
        var (cols, rows, w, h) = Layout();
        var shown = PageCards();
        if (shown.Count == 0)
        {
            Hud.Label(poolArea, "No cards match these filters.", 17, Look.InkSoft, false, 400, 0);
        }
        int used = Mathf.Max(1, (shown.Count + cols - 1) / cols);
        float top = (PoolH - (used * h + (used - 1) * 10)) / 2;
        for (int i = 0; i < shown.Count; i++)
        {
            var c = shown[i];
            var at = new Vector2(4 + (i % cols) * (w + 10), -top - (i / cols) * (h + 10));
            Tile(c, at, w, h);
        }
        Pager();
    }

    /// <summary>A card of the pool: its face, its count (in the deck of owned: tap it to craft), a corner to read it large.</summary>
    void Tile(CardDef c, Vector2 at, float w, float h)
    {
        var id = c.Id;
        int n = Count(editing.Cards, id), have = Profile.Owned(id);
        var kc = Look.Kind.TryGetValue(ShownKind(c), out var kcol) ? kcol : Look.Ink;
        var cell = Hud.Rect(poolArea, id);
        Hud.At(cell, new Vector2(0, 1), at, new Vector2(w, h));
        if (focus == id || n > 0)
        {
            var ring = Hud.Rect(cell, "Ring");
            Hud.Fill(ring);
            float o = focus == id ? 4 : 2;
            ring.offsetMin = new Vector2(-o, -o);
            ring.offsetMax = new Vector2(o, o);
            var ri = ring.gameObject.AddComponent<Image>();
            ri.sprite = Hud.Rounded;
            ri.type = Image.Type.Sliced;
            ri.pixelsPerUnitMultiplier = 2.4f;
            ri.color = focus == id ? Hex("#9fb4ff") : new Color(kc.r, kc.g, kc.b, 0.75f);
            ri.raycastTarget = false;
        }
        var face = Hud.Rect(cell, "Face");
        Hud.Fill(face);
        var img = face.gameObject.AddComponent<RawImage>();
        img.texture = Faces.Of(id, false);
        img.color = have > 0 ? Color.white : new Color(0.6f, 0.6f, 0.6f, 0.45f);
        var b = face.gameObject.AddComponent<Button>();
        var colours = b.colors;
        colours.highlightedColor = new Color(0.97f, 0.97f, 1f);
        b.colors = colours;
        b.onClick.AddListener(() => Add(id));
        // Copies in the deck of copies owned: tap to craft or break down.
        float fs = Mathf.Max(11, w * 0.075f);
        var badgeText = $"{n}/{have}";
        var badge = Hud.Glass(cell, "Have", n > 0 ? kc : new Color(1, 1, 1, 0.94f), false);
        Hud.At((RectTransform)badge.transform, new Vector2(0, 1), new Vector2(w * 0.04f, -h * 0.035f), new Vector2(fs * (badgeText.Length * 0.85f + 1.6f), fs * 1.9f));
        badge.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); focus = focus == id ? null : id; Draw(); });
        Hud.Label(badge.transform, badgeText, fs, n > 0 ? Color.white : have > 0 ? Look.InkFaint : Hex("#6d6fd0"), true, 500, 4);
        // Read it large.
        var zoom = Hud.Glass(cell, "Zoom", new Color(1, 1, 1, 0.9f), false);
        zoom.sprite = Hud.Circle;
        zoom.type = Image.Type.Simple;
        float zs = Mathf.Max(24, w * 0.14f);
        Hud.At((RectTransform)zoom.transform, new Vector2(1, 1), new Vector2(-w * 0.04f, -h * 0.03f), new Vector2(zs, zs));
        zoom.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("hover"); zoomed = id; Draw(); });
        Hud.Label(zoom.transform, "+", zs * 0.7f, Look.InkSoft, false, 500, 0).margin = new Vector4(0, 0, 0, zs * 0.08f);
    }

    /// <summary>The page buttons beneath the pool (none with a single page): back, a dot for each page (or its number, with many), on.</summary>
    void Pager()
    {
        int pages = Mathf.Max(1, Pages().Count);
        if (pages <= 1) return;
        bool dots = pages < 13;
        float mid = dots ? pages * 15 : 70;
        for (int dir = -1; dir <= 1; dir += 2)
        {
            int step = dir;
            bool can = step < 0 ? pageAt > 0 : pageAt < pages - 1;
            var arrow = Hud.Glass(pagerArea, step < 0 ? "Prev" : "Next", Color.white, false);
            arrow.sprite = Hud.Circle;
            arrow.type = Image.Type.Simple;
            Hud.At((RectTransform)arrow.transform, new Vector2(0.5f, 0.5f), new Vector2(step * (mid / 2 + 30), 0), new Vector2(40, 40));
            var ab = arrow.gameObject.AddComponent<Button>();
            ab.interactable = can;
            ab.onClick.AddListener(() => { Sound.Play("click"); pageAt = Mathf.Clamp(pageAt + step, 0, pages - 1); RefreshPool(); });
            Hud.Label(arrow.transform, step < 0 ? "‹" : "›", 26, can ? Look.Ink : new Color(0.24f, 0.26f, 0.29f, 0.35f), false, 500, 0).margin = new Vector4(step < 0 ? 0 : 3, 0, step < 0 ? 3 : 0, 5);
        }
        if (!dots)
        {
            Hud.Label(pagerArea, $"{pageAt + 1} / {pages}", 16, Look.InkSoft, false, 500, 0);
            return;
        }
        for (int i = 0; i < pages; i++)
        {
            int to = i;
            bool on = i == pageAt;
            var dot = Hud.Rect(pagerArea, $"Page {i + 1}");
            Hud.At(dot, new Vector2(0.5f, 0.5f), new Vector2((i - (pages - 1) / 2f) * 15, 0), new Vector2(14, 22));
            var hit = dot.gameObject.AddComponent<Image>();
            hit.color = new Color(1, 1, 1, 0.001f);
            dot.gameObject.AddComponent<Button>().onClick.AddListener(() => { pageAt = to; RefreshPool(); });
            var mark = Hud.Rect(dot, "Dot");
            Hud.At(mark, new Vector2(0.5f, 0.5f), Vector2.zero, on ? new Vector2(10, 10) : new Vector2(8, 8));
            var mi = mark.gameObject.AddComponent<Image>();
            mi.sprite = Hud.Circle;
            mi.color = on ? Look.Ink : Hex("#d6d3ce");
            mi.raycastTarget = false;
        }
    }

    // ---- Putting cards in and taking them out, crafting and breaking down ----

    void Add(string id)
    {
        var d = editing;
        int copies = Count(d.Cards, id), limit = Campaign.CopyLimit(id);
        int commands = d.Cards.Count(x => Cards.Def(x).Kind == "command");
        // A card you don't own (or not enough copies of): offer to craft it.
        if (copies >= Profile.Owned(id) && copies < limit)
        {
            focus = id;
            menu.Toast(Profile.Owned(id) > 0 ? "Craft another to add it" : "Not owned yet");
        }
        else if (d.Cards.Count >= Balance.MaxDeckSize) menu.Toast($"{Balance.MaxDeckSize} cards max");
        else if (copies >= limit) menu.Toast(limit == 1 ? "Anomaly: one per deck" : $"{Balance.MaxCopies} copies max");
        else if (Cards.Def(id).Kind == "command" && commands >= DeckRules.CommandCardsFor(Balance.MaxDeckSize)) menu.Toast($"One Hero per {Balance.CardsPerCommand} cards");
        else
        {
            d.Cards.Add(id);
            Sound.Play("click");
        }
        Draw();
    }

    void Remove(string id)
    {
        int i = editing.Cards.LastIndexOf(id);
        if (i >= 0) editing.Cards.RemoveAt(i);
        Sound.Play("click");
        Draw();
    }

    /// <summary>Craft a copy of a card with flux (builder.ts db-craft): asked of the server, or made here with no server (EconomyCalls).</summary>
    void Craft(string id) => EconomyCalls.Craft(id, why => Crafted(why, "upgrade"));

    /// <summary>Break a copy of a card down for flux (builder.ts db-break): starter cards can't be.</summary>
    void BreakDown(string id) => EconomyCalls.BreakDown(id, why => Crafted(why, "crack"));

    void Crafted(string why, string sound)
    {
        if (this == null) return;
        if (why != null) menu.Toast(why);
        else Sound.Play(sound);
        Draw();
    }

    void Save()
    {
        var d = editing;
        var problems = DeckRules.DeckProblems(d.Cards, Modes.ModeOf(d));
        if (problems.Count > 0)
        {
            Sound.Play("error");
            menu.Toast(problems[0]);
            return;
        }
        d.Name = d.Name.Trim().Length > 0 ? d.Name.Trim() : "Unnamed deck";
        var st = starter;
        bool changed = st == null || d.Name != st.Name || CardsKey(d.Cards) != CardsKey(st.Cards);
        if (st != null && !changed)
        {
            // Nothing to keep: the starter is still there as it was.
            editing = starter = null;
            Draw();
            return;
        }
        if (st != null && d.Name == st.Name) d.Name = Clip($"{st.Name} copy", 24);
        Decks.Save(d);
        var shortBy = ToCollect(d.Cards);
        if (shortBy.Length > 0) menu.Toast(shortBy);
        editing = starter = null;
        Draw();
    }

    // ---- The deck: its name, its count, the craft panel, its cards, exit and save ----

    void Side()
    {
        var d = editing;
        var side = Hud.Glass(root, "Deck", new Color(1, 1, 1, 0.7f));
        var sr = (RectTransform)side.transform;
        sr.anchorMin = new Vector2(1, 0);
        sr.anchorMax = new Vector2(1, 1);
        sr.pivot = new Vector2(1, 0.5f);
        sr.offsetMin = new Vector2(-Margin - SideW, Margin);
        sr.offsetMax = new Vector2(-Margin, -Margin);
        float inner = SideW - 24;
        var nameBox = MakeInput(side.transform, d.Name, Vector2.zero, new Vector2(inner - 110, 46), 24, false, "");
        Hud.At((RectTransform)nameBox.transform, new Vector2(0, 1), new Vector2(12, -12), new Vector2(inner - 110, 46));
        nameBox.onValueChanged.AddListener(s => editing.Name = Clip(s, 24));
        var chip = Hud.Glass(side.transform, "Mode", Hex("#eef0f5"), false);
        Hud.At((RectTransform)chip.transform, new Vector2(1, 1), new Vector2(-12, -21), new Vector2(98, 28));
        Hud.Label(chip.transform, Modes.GameModes[Modes.ModeOf(d)].Name.ToLowerInvariant(), 12, Look.InkSoft, false, 600, 0);

        // The count of cards and of Heroes, against what it needs.
        int commands = d.Cards.Count(id => Cards.Def(id).Kind == "command"), needHeroes = DeckRules.CommandCardsFor(d.Cards.Count);
        string ok = Html(Look.Good), bad = "#c0705f";
        bool sizeOk = d.Cards.Count >= Balance.DeckSize && d.Cards.Count <= Balance.MaxDeckSize;
        var missing = MissingCopies(d.Cards);
        int need = missing.Sum(x => x.n);
        var collect = need > 0 ? $"<color=#a8641c>{need} to collect · ⟁{missing.Sum(x => x.n * Progression.CraftCost(x.id))}</color>   " : "";
        var tally = Hud.Label(side.transform, $"{collect}<color={(sizeOk ? ok : bad)}>{d.Cards.Count}/{(d.Cards.Count > Balance.DeckSize ? Balance.MaxDeckSize : Balance.DeckSize)}</color> cards · <color={(commands == needHeroes ? ok : bad)}>{commands}/{needHeroes}</color> {(needHeroes == 1 ? "hero" : "heroes")}", 15, Look.InkSoft, false, 500, 0, TextAlignmentOptions.Top);
        tally.margin = new Vector4(0, 68, 0, 0);
        float y = -98;
        if (focus != null) y = FocusPanel(side.transform, focus, y, inner);

        // The deck, card by card: a slim row in the card's own colours with its picture, by energy cost then name.
        var view = Hud.Rect(side.transform, "Rows");
        view.anchorMin = new Vector2(0, 0);
        view.anchorMax = new Vector2(1, 1);
        view.offsetMin = new Vector2(8, 70);
        view.offsetMax = new Vector2(-8, y);
        view.gameObject.AddComponent<RectMask2D>();
        var content = Hud.Rect(view, "Content");
        content.anchorMin = new Vector2(0, 1);
        content.anchorMax = new Vector2(1, 1);
        content.pivot = new Vector2(0.5f, 1);
        content.anchoredPosition = Vector2.zero;
        var rows = d.Cards.Distinct().Select(Cards.Def).OrderBy(CostOrder).ThenBy(c => c.Name, System.StringComparer.InvariantCultureIgnoreCase).ToList();
        float ry = -4;
        foreach (var c in rows) { Row(content, c, ry, inner - 8); ry -= 37; }
        if (rows.Count == 0)
        {
            var empty = Hud.Glass(content, "Empty", new Color(1, 1, 1, 0.001f), false);
            Hud.At((RectTransform)empty.transform, new Vector2(0.5f, 1), new Vector2(0, -6), new Vector2(inner - 16, 90));
            Outline(empty.transform, Hex("#d6d3ce"), 1.5f);
            Hud.Label(empty.transform, "No cards yet.\nTap a card to add it.", 15, Hex("#8a8f99"), false, 400, 0).lineSpacing = 10;
            ry = -100;
        }
        content.sizeDelta = new Vector2(0, -ry + 6);
        var hit = content.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0.001f);
        var scroll = view.gameObject.AddComponent<ScrollRect>();
        scroll.viewport = view;
        scroll.content = content;
        scroll.horizontal = false;
        scroll.movementType = ScrollRect.MovementType.Clamped;
        scroll.scrollSensitivity = 30;

        var exit = Hud.Pill(side.transform, "Exit", () =>
        {
            // Leave the deck: ask first if that would lose changes.
            if (Snap(editing) != openedSnap) confirmExit = true;
            else editing = starter = null;
            Draw();
        }, 13, Color.white, Hex("#b23c24"));
        Hud.At((RectTransform)exit.transform, new Vector2(1, 0), new Vector2(-150, 14), new Vector2(110, 44));
        Outline(exit.transform, new Color(0.753f, 0.337f, 0.239f, 0.45f), 1);
        var save = Hud.Pill(side.transform, "Save", Save, 13, Look.Ink, Color.white);
        Hud.At((RectTransform)save.transform, new Vector2(1, 0), new Vector2(-14, 14), new Vector2(126, 44));
    }

    /// <summary>A row of the deck: its picture, its name, how many short (if any), how many, and a minus (tap: take one out).</summary>
    void Row(RectTransform content, CardDef c, float y, float width)
    {
        int n = Count(editing.Cards, c.Id), shortBy = Mathf.Max(0, n - Profile.Owned(c.Id));
        var kc = Look.Kind.TryGetValue(ShownKind(c), out var kcol) ? kcol : Look.Ink;
        var rarity = c.Rarity ?? "dwarf";
        var row = Hud.Rect(content, c.Id);
        Hud.At(row, new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(width, 34));
        var edge = row.gameObject.AddComponent<Image>();
        edge.sprite = Hud.Rounded;
        edge.type = Image.Type.Sliced;
        edge.color = new Color(kc.r, kc.g, kc.b, 0.3f);
        var bg = Hud.Rect(row, "Body");
        Hud.Fill(bg);
        bg.offsetMin = new Vector2(1, 1);
        bg.offsetMax = new Vector2(-1, -1);
        var bi = bg.gameObject.AddComponent<Image>();
        bi.sprite = Hud.Rounded;
        bi.type = Image.Type.Sliced;
        bi.color = rarity == "stellar" ? Hex("#fcf5e6") : rarity == "anomaly" ? Hex("#f4eefc") : Hex("#f8f9fb");
        bi.raycastTarget = false;
        var id = c.Id;
        row.gameObject.AddComponent<Button>().onClick.AddListener(() => Remove(id));
        var art = Hud.Rect(row, "Art");
        Hud.At(art, new Vector2(0, 0.5f), new Vector2(3, 0), new Vector2(28, 28));
        var ring = art.gameObject.AddComponent<Image>();
        ring.sprite = Hud.Circle;
        ring.color = new Color(1, 1, 1, 0.7f);
        ring.raycastTarget = false;
        Portrait(art, id, 26);
        var name = Hud.Label(row, c.Name.ToLowerInvariant(), 13, Look.Ink, true, 500, 4, TextAlignmentOptions.Left);
        name.overflowMode = TextOverflowModes.Ellipsis;
        name.margin = new Vector4(40, 0, shortBy > 0 ? 116 : 56, 0);
        var count = Hud.Label(row, $"×{n}", 13, Look.Ink, true, 500, 0, TextAlignmentOptions.Right);
        count.margin = new Vector4(0, 0, 30, 0);
        var minus = Hud.Label(row, "−", 16, Look.InkFaint, false, 500, 0, TextAlignmentOptions.Right);
        minus.margin = new Vector4(0, 0, 12, 0);
        if (shortBy > 0)
        {
            var needL = Hud.Label(row, $"need {shortBy}", 12, Hex("#a8641c"), false, 500, 0, TextAlignmentOptions.Right);
            needL.margin = new Vector4(0, 0, 62, 0);
        }
    }

    /// <summary>Crafting (builder.ts renderFocus): make another copy with flux, or break a spare one down for half its cost.</summary>
    float FocusPanel(Transform side, string id, float y, float inner)
    {
        var def = Cards.Def(id);
        var me = Profile.Me;
        int have = Profile.Owned(id), cost = Progression.CraftCost(id), spare = Progression.Breakable(me.Collection, id);
        var panelBox = Hud.Glass(side, "Craft", Hex("#f6f7fb"), false);
        Hud.At((RectTransform)panelBox.transform, new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(inner, 124));
        Outline(panelBox.transform, Hex("#e6e9f2"), 1);
        var head = Hud.Label(panelBox.transform, def.Name.ToLowerInvariant(), 14, Look.Ink, true, 500, 6, TextAlignmentOptions.TopLeft);
        head.margin = new Vector4(14, 14, 100, 0);
        head.overflowMode = TextOverflowModes.Ellipsis;
        var close = Hud.Pill(panelBox.transform, "Close", () => { focus = null; Draw(); }, 11);
        Hud.At((RectTransform)close.transform, new Vector2(1, 1), new Vector2(-10, -8), new Vector2(84, 32));
        var line = Hud.Label(panelBox.transform, $"owned {have} · a deck may hold {Campaign.CopyLimit(id)} · you have ⟁{me.Flux} flux", 13, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
        line.margin = new Vector4(14, 46, 10, 0);
        line.textWrappingMode = TextWrappingModes.Normal;
        float bw = (inner - 34) / 2;
        var craft = Hud.Pill(panelBox.transform, $"Craft · ⟁{cost}", () => Craft(id), 11);
        Hud.At((RectTransform)craft.transform, new Vector2(0, 0), new Vector2(12, 12), new Vector2(bw, 38));
        craft.interactable = me.Flux >= cost;
        var brk = Hud.Pill(panelBox.transform, $"Break down · +⟁{Progression.BreakdownValue(id)}", () => BreakDown(id), 11);
        Hud.At((RectTransform)brk.transform, new Vector2(1, 0), new Vector2(-12, 12), new Vector2(bw, 38));
        brk.interactable = spare > 0;
        return y - 132;
    }

    // ---- The filters popover: dropdowns of ticks, an order, two toggles ----

    void FiltersPop()
    {
        var f = filters;
        bool core = Modes.ModeOf(editing) == "core";
        var races = new List<(string, string)> { ("deck", "this deck's races + neutral"), ("neutral", "neutral") };
        for (int i = 0; i < Races.RaceNames.Count; i++) if (!core || Modes.CoreRaces.Contains(i)) races.Add((i.ToString(), Races.RaceNames[i].ToLowerInvariant()));
        var kinds = Kinds.Select(k => (k, KindName[k].ToLowerInvariant())).ToList();
        var rarities = Rarities.Select(r => (r, RarityName[r].ToLowerInvariant())).ToList();
        var costs = new List<(string, string)> { ("0", "free"), ("1", "1 energy"), ("2", "2 energy"), ("3", "3 energy"), ("4", "4 or more"), ("x", "X (all you have)") };
        var owns = new List<(string, string)> { ("owned", "owned"), ("missing", "not owned"), ("craftable", "craftable now") };
        var sorts = new List<(string, string)> { ("cost", "by cost"), ("race", "by race"), ("name", "by name"), ("type", "by type"), ("rarity", "by rarity") };
        var drops = new List<(string key, string label, List<(string, string)> rows, string none)>
        {
            ("race", "race", races, "every race"), ("kind", "type", kinds, "every type"), ("cost", "cost", costs, "any cost"),
            ("rarity", "rarity", rarities, "every rarity"), ("own", "collection", owns, "all cards"), ("sort", "order", sorts, ""),
        };
        // (A tap off the popover shuts it.)
        var off = Hud.Rect(root, "Off");
        Hud.Fill(off);
        off.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0.001f);
        off.gameObject.AddComponent<Button>().onClick.AddListener(() => { filtersOpen = false; dropOpen = null; Draw(); });
        const float pw = 540, dh = 56;
        float ph = 16 + 3 * (dh + 10) + 46 + 52;
        var pop = Hud.Glass(root, "Popover", new Color(1, 1, 1, 0.97f));
        Hud.At((RectTransform)pop.transform, new Vector2(0, 1), new Vector2(Margin + 310, -78), new Vector2(pw, ph));
        pop.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        RectTransform openHead = null;
        (string key, string label, List<(string, string)> rows, string none) openDrop = default;
        for (int i = 0; i < drops.Count; i++)
        {
            var dr = drops[i];
            string summary;
            if (dr.key == "sort") summary = sorts.First(s => s.Item1 == f.Sort).Item2;
            else
            {
                var on = dr.rows.Where(r => f.Ticked[dr.key].Contains(r.Item1)).Select(r => r.Item2).ToList();
                summary = on.Count == 0 ? dr.none : on.Count == 1 ? on[0] : $"{on.Count} picked";
            }
            var headBox = Hud.Glass(pop.transform, dr.key, Color.white, false);
            var hr = (RectTransform)headBox.transform;
            Hud.At(hr, new Vector2(0, 1), new Vector2(16 + (i % 2) * ((pw - 42) / 2 + 10), -16 - (i / 2) * (dh + 10)), new Vector2((pw - 42) / 2, dh));
            bool isOpen = dropOpen == dr.key;
            Outline(headBox.transform, isOpen ? Hex("#c9cfdd") : Hex("#e4e6ec"), 1);
            string key = dr.key;
            headBox.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); dropOpen = dropOpen == key ? null : key; Draw(); });
            var sl = Hud.Label(headBox.transform, dr.label.ToUpperInvariant(), 10, Look.InkFaint, true, 500, 16, TextAlignmentOptions.TopLeft);
            sl.margin = new Vector4(14, 8, 0, 0);
            var vl = Hud.Label(headBox.transform, summary.ToUpperInvariant(), 12, Look.Ink, true, 500, 8, TextAlignmentOptions.BottomLeft);
            vl.margin = new Vector4(14, 0, 34, 10);
            vl.overflowMode = TextOverflowModes.Ellipsis;
            // (Its caret: a chevron turned down, or up while open.)
            var caretAt = Hud.Rect(headBox.transform, "Caret");
            Hud.At(caretAt, new Vector2(1, 0.5f), new Vector2(-12, 0), new Vector2(18, 18));
            caretAt.localRotation = Quaternion.Euler(0, 0, isOpen ? 90 : -90);
            Hud.Label(caretAt, "›", 20, Hex("#8b93ad"), false, 500, 0).margin = new Vector4(0, 0, 0, 3);
            if (isOpen) { openHead = hr; openDrop = dr; }
        }
        float ty = -16 - 3 * (dh + 10) - 4;
        var toggles = new[] { ("characters", "characters", f.Characters), ("inDeck", "in this deck", f.InDeck) };
        for (int i = 0; i < toggles.Length; i++)
        {
            var (key, label, on) = toggles[i];
            var t = Hud.Pill(pop.transform, label, () =>
            {
                if (key == "characters") filters.Characters = !filters.Characters;
                else filters.InDeck = !filters.InDeck;
                pageAt = 0;
                Draw();
            }, 11, on ? Look.Ink : Look.GlassStrong, on ? Color.white : Look.InkSoft);
            Hud.At((RectTransform)t.transform, new Vector2(0, 1), new Vector2(16 + i * 170, ty), new Vector2(160, 38));
        }
        int set = f.Ticked.Count(kv => kv.Value.Count > 0) + (f.Sort != "cost" ? 1 : 0) + (f.Characters ? 1 : 0) + (f.InDeck ? 1 : 0);
        if (set > 0)
        {
            var clear = Hud.Pill(pop.transform, "Clear", () => { var q = filters.Q; filters = new Filters { Q = q }; pageAt = 0; Draw(); }, 11);
            Hud.At((RectTransform)clear.transform, new Vector2(1, 0), new Vector2(-122, 14), new Vector2(100, 38));
        }
        var done = Hud.Pill(pop.transform, "Done", () => { filtersOpen = false; dropOpen = null; Draw(); }, 11);
        Hud.At((RectTransform)done.transform, new Vector2(1, 0), new Vector2(-14, 14), new Vector2(100, 38));

        // The open dropdown's rows, over everything under it: each ticks on and off (the order: one of them).
        if (openHead == null) return;
        var list = Hud.Glass(pop.transform, "List", Color.white);
        var lr = (RectTransform)list.transform;
        float rowH = 36;
        Hud.At(lr, new Vector2(0, 1), openHead.anchoredPosition + new Vector2(0, -dh - 4), new Vector2(openHead.sizeDelta.x, openDrop.rows.Count * rowH + 12));
        list.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        bool radio = openDrop.key == "sort";
        for (int i = 0; i < openDrop.rows.Count; i++)
        {
            var (value, text) = openDrop.rows[i];
            bool on = radio ? f.Sort == value : f.Ticked[openDrop.key].Contains(value);
            var r = Hud.Rect(lr, value);
            Hud.At(r, new Vector2(0, 1), new Vector2(6, -6 - i * rowH), new Vector2(openHead.sizeDelta.x - 12, rowH));
            var ri = r.gameObject.AddComponent<Image>();
            ri.sprite = Hud.Rounded;
            ri.type = Image.Type.Sliced;
            ri.color = new Color(1, 1, 1, 0.001f);
            var dkey = openDrop.key;
            var rb = r.gameObject.AddComponent<Button>();
            var rc = rb.colors;
            rc.highlightedColor = new Color(0.95f, 0.96f, 0.98f, 1);
            rb.colors = rc;
            rb.onClick.AddListener(() =>
            {
                Sound.Play("click");
                if (radio) filters.Sort = value;
                else if (!filters.Ticked[dkey].Remove(value)) filters.Ticked[dkey].Add(value);
                pageAt = 0;
                Draw();
            });
            var box = Hud.Rect(r, "Check");
            Hud.At(box, new Vector2(0, 0.5f), new Vector2(10, 0), new Vector2(16, 16));
            var bxi = box.gameObject.AddComponent<Image>();
            bxi.sprite = radio ? Hud.Circle : Hud.Rounded;
            bxi.type = radio ? Image.Type.Simple : Image.Type.Sliced;
            bxi.pixelsPerUnitMultiplier = radio ? 1 : 5;
            bxi.color = on ? Hex("#5d6a8c") : Hex("#b9c0d2");
            bxi.raycastTarget = false;
            if (!on)
            {
                var hole = Hud.Rect(box, "In");
                Hud.Fill(hole);
                hole.offsetMin = new Vector2(1.5f, 1.5f);
                hole.offsetMax = new Vector2(-1.5f, -1.5f);
                var hi = hole.gameObject.AddComponent<Image>();
                hi.sprite = bxi.sprite;
                hi.type = bxi.type;
                hi.pixelsPerUnitMultiplier = bxi.pixelsPerUnitMultiplier;
                hi.color = Color.white;
                hi.raycastTarget = false;
            }
            else Hud.Label(box, "✓", 12, Color.white, false, 600, 0);
            var tl = Hud.Label(r, text, 15, on ? Look.Ink : Look.InkSoft, false, 500, 0, TextAlignmentOptions.Left);
            tl.margin = new Vector4(36, 0, 6, 0);
        }
    }

    // ---- A card read large ----

    void Zoom()
    {
        var veil = Hud.Rect(root, "Zoom");
        Hud.Fill(veil);
        veil.gameObject.AddComponent<Image>().color = new Color(0.95f, 0.95f, 0.94f, 0.85f);
        veil.gameObject.AddComponent<Button>().onClick.AddListener(() => { zoomed = null; Draw(); });
        var face = Hud.Rect(veil, "Card");
        Hud.At(face, new Vector2(0.5f, 0.5f), new Vector2(0, 20), new Vector2(480, 672));
        var img = face.gameObject.AddComponent<RawImage>();
        img.texture = Faces.Of(zoomed, false);
        img.raycastTarget = false;
        var hint = Hud.Label(veil, "tap anywhere to close", 14, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Bottom);
        hint.margin = new Vector4(0, 0, 0, 40);
    }

    // ---- Pieces ----

    /// <summary>A card's picture in a circle (a deck's cover, a row's), cropped square from its middle.</summary>
    static void Portrait(RectTransform parent, string defId, float size)
    {
        var mask = Hud.Rect(parent, "Portrait");
        Hud.At(mask, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size, size));
        var mi = mask.gameObject.AddComponent<Image>();
        mi.sprite = Hud.Circle;
        mi.raycastTarget = false;
        mask.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var pic = Hud.Rect(mask, "Art");
        Hud.Fill(pic);
        var raw = pic.gameObject.AddComponent<RawImage>();
        var tex = EngineData.Art(defId);
        raw.texture = tex;
        raw.raycastTarget = false;
        if (tex != null && tex.height > 0)
        {
            float k = (float)tex.height / tex.width;
            raw.uvRect = k < 1 ? new Rect((1 - k) / 2, 0, k, 1) : new Rect(0, (1 - 1 / k) / 2, 1, 1 / k);
        }
    }

    /// <summary>One of the builder's baked marks (Icons/db-…, white), tinted.</summary>
    static void Icon(Transform parent, string name, Vector2 anchor, Vector2 at, float size, Color tint)
    {
        var r = Hud.Rect(parent, name);
        Hud.At(r, anchor, at, new Vector2(size, size));
        if (anchor.x == 0) r.pivot = new Vector2(0.5f, 0.5f);
        var img = r.gameObject.AddComponent<RawImage>();
        img.texture = Resources.Load<Texture2D>($"Icons/{name}");
        img.color = tint;
        img.raycastTarget = false;
    }

    static Sprite ring;

    /// <summary>A rounded ring a pixel wide (the glass panels' corners), 9-sliced: a panel's hairline edge.</summary>
    static Sprite Ring => ring ??= MakeRing();

    static Sprite MakeRing()
    {
        const int size = 64;
        const float radius = 22;
        var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
        for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float half = size / 2f;
                float qx = Mathf.Abs(x + 0.5f - half) - half + radius, qy = Mathf.Abs(y + 0.5f - half) - half + radius;
                float d = Mathf.Sqrt(Mathf.Max(qx, 0) * Mathf.Max(qx, 0) + Mathf.Max(qy, 0) * Mathf.Max(qy, 0)) + Mathf.Min(Mathf.Max(qx, qy), 0) - radius;
                t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(1 - Mathf.Abs(d + 0.5f))));
            }
        t.Apply();
        float b = radius + 1;
        return Sprite.Create(t, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100, 0, SpriteMeshType.FullRect, new Vector4(b, b, b, b));
    }

    /// <summary>A hairline round a panel, just outside its edge (drawn over the panel, under what is on it).</summary>
    static void Outline(Transform panel, Color colour, float width)
    {
        var edge = Hud.Rect(panel, "Edge");
        Hud.Fill(edge);
        edge.offsetMin = new Vector2(-width, -width);
        edge.offsetMax = new Vector2(width, width);
        edge.SetAsFirstSibling();
        var img = edge.gameObject.AddComponent<Image>();
        img.sprite = Ring;
        img.type = Image.Type.Sliced;
        img.pixelsPerUnitMultiplier = 1 / Mathf.Max(0.5f, width);
        img.color = colour;
        img.raycastTarget = false;
    }

    /// <summary>A face of a deck box: four corners (in the box's own units from its bottom left), shaded from its foot to its top.</summary>
    static Facet Face(RectTransform box, string name, Vector2[] corners, Color foot, Color top)
    {
        var r = Hud.Rect(box, name);
        Hud.Fill(r);
        var f = r.gameObject.AddComponent<Facet>();
        f.Corners = corners;
        float mid = (corners.Min(c => c.y) + corners.Max(c => c.y)) / 2;
        for (int i = 0; i < 4; i++) f.Colours[i] = corners[i].y > mid ? top : foot;
        f.raycastTarget = false;
        return f;
    }

    static TMP_InputField MakeInput(Transform parent, string text, Vector2 at, Vector2 size, int limit, bool multiline, string placeholder)
    {
        var box = Hud.Glass(parent, "Input", Color.white, false);
        Hud.At((RectTransform)box.transform, new Vector2(0.5f, 1), at, size);
        Outline(box.transform, Hex("#e4e1dc"), 1);
        var area = Hud.Rect(box.transform, "Text Area");
        Hud.Fill(area);
        area.offsetMin = new Vector2(16, 6);
        area.offsetMax = new Vector2(-16, -6);
        area.gameObject.AddComponent<RectMask2D>();
        TextMeshProUGUI hint = null;
        if (placeholder.Length > 0)
        {
            hint = Hud.Label(area, placeholder, 16, Look.InkFaint, false, 400, 0, multiline ? TextAlignmentOptions.TopLeft : TextAlignmentOptions.Left);
        }
        var t = Hud.Label(area, text, 16, Look.Ink, false, 500, 0, multiline ? TextAlignmentOptions.TopLeft : TextAlignmentOptions.Left);
        t.richText = false;
        if (multiline) t.textWrappingMode = TextWrappingModes.Normal;
        var input = box.gameObject.AddComponent<TMP_InputField>();
        input.textViewport = area;
        input.textComponent = t;
        if (hint != null) input.placeholder = hint;
        input.characterLimit = limit;
        input.richText = false;
        if (multiline) input.lineType = TMP_InputField.LineType.MultiLineNewline;
        input.text = text;
        return input;
    }
}

/// <summary>A flat four-cornered face, each corner its own colour (a deck box's lid, side and front).</summary>
public class Facet : MaskableGraphic
{
    public Vector2[] Corners = new Vector2[4];
    public Color[] Colours = { Color.white, Color.white, Color.white, Color.white };

    protected override void OnPopulateMesh(VertexHelper vh)
    {
        vh.Clear();
        var r = rectTransform.rect;
        for (int i = 0; i < 4; i++)
        {
            var v = UIVertex.simpleVert;
            v.position = new Vector3(r.xMin + Corners[i].x, r.yMin + Corners[i].y, 0);
            v.color = (Color32)(Colours[i] * color);
            vh.AddVert(v);
        }
        vh.AddTriangle(0, 1, 2);
        vh.AddTriangle(0, 2, 3);
    }
}
