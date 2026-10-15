using System.Collections.Generic;
using System.Linq;
using System.Text;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using K = MenuKit;

/// <summary>
/// The deck builder and collection (builder.ts): first the decks, the game mode as a switch under the title, then your
/// decks (a new one first) and the starters to copy from, each a little box in its race's colour with its hero on the
/// front; a deck can be imported from a code, or its code shared. Open a deck and the whole card pool lies on the left,
/// a page at a time, searched and filtered, and the deck on the right: tap a card to put it in, a row to take one out,
/// a card's count to craft another copy with flux or break a spare one down. A deck saves once it is legal; a starter
/// changed saves as a copy of its own.
/// </summary>
public class BuilderView : MonoBehaviour, MenuView.IRedraw
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

    public void Redraw() => Draw();

    /// <summary>The layer the small panels are drawn on, in the old reference units (MenuKit.RefLayer).</summary>
    RectTransform layer;

    void Draw()
    {
        var old = new List<GameObject>();
        foreach (Transform c in root) old.Add(c.gameObject);
        foreach (var o in old) Mats.Kill(o);
        // (Cards show as they play in the deck's mode.)
        Modes.SetRulesMode(editing != null ? Modes.ModeOf(editing) : "lost");
        if (editing != null) Editor();
        else List();
        layer = K.RefLayer(root);
        if (editing != null) Dialogs();
        if (panel != null) Panel();
        if (zoomed != null) Zoom();
    }

    // ---- The decks ----

    /// <summary>The deck lists' boxes across (.db-boxes --bw: clamp(88px, 30vh, 150px); on a short screen clamp(62px, 22vh, 92px)).</summary>
    public static float ListBw => K.Short ? K.Clamp(62, 22 * K.Vh, 92) : K.Clamp(88, 30 * K.Vh, 150);

    void List()
    {
        // The header (builder.ts's setup-top): back, DECKS, and import on the right where the chip would be (.btn-small
        // with its mark, 30 tall). (Its gap to the list, clamp(6px, 2vh, 14px), and no foot: the list runs to the
        // screen's foot and scrolls.)
        float left = K.PadL, right = K.W - K.PadR, top = K.PadT;
        MenuView.BackButton(root, () => menu.Show("hub"), left, top + 13);
        float hf = K.Clamp(0.9f * K.Rem, 4 * K.Vh, 1.3f * K.Rem), hh = hf * 1.16f;
        K.Words(root, "DECKS", left, top + (52 - hh) / 2, right - left, hh, hf, Hud.Rgba(85, 90, 99), true, 500, 0.3f);
        float iw = K.BtnW("import", K.Kind.Small) + 23;
        var imp = K.Btn(root, "import", () => { panel = "import"; codeText = ""; Draw(); }, right - iw, top + 11, K.Kind.Small, iw, 30);
        imp.GetComponentInChildren<TextMeshProUGUI>().margin = new Vector4(23, 0, 0, 0);
        Icon(imp.transform, "db-upload", new Vector2(0, 0.5f), new Vector2(17, 0), 15, Look.Ink);

        // One column, top to bottom (.db-list: at most 980 across, its parts 8 apart): the mode, your decks (a new one
        // first), the starters.
        float bodyTop = top + 52 + K.Clamp(6, 2 * K.Vh, 14), listW = Mathf.Min(980, right - left), lx = (left + right - listW) / 2;
        var mine = Decks.Custom().Where(d => Modes.ModeOf(d) == gm).ToList();
        var presets = Decks.Presets.Where(d => Modes.ModeOf(d) == gm).ToList();
        var starters = presets.Where(d => d.Mixed != true).Concat(presets.Where(d => d.Mixed == true)).ToList();
        // (Measured first, to size the scroller: laid out a second time into it.)
        float end = Lay(null, lx, listW, mine, starters);
        var content = K.Scroller(root, "List", 0, bodyTop, K.W, K.H - bodyTop, end);
        Lay(content, lx, listW, mine, starters);
    }

    /// <summary>The list's column laid out from its top (into `content`; null only measures it); returns its height.</summary>
    float Lay(RectTransform content, float lx, float listW, List<Decks.Saved> mine, List<Decks.Saved> starters)
    {
        // (.db-modes: min(520px, the list) across, 70% white, corners 16, padded 4, 4 between; each mode padded 10 by
        // 14, corners 12, the picked one white and lifted: its picture 72 tall (grey, the other), its name 12.48
        // spaced 0.24em, its line Exo 2 10.88.)
        float mw = Mathf.Min(520, listW), mh = 4 + 10 + 72 + 6 + 15 + 2 + 13 + 10 + 4;
        if (content != null)
        {
            var modes = Hud.Box(content, "Modes", new Color(1, 1, 1, 0.7f), 16);
            Hud.Place(modes.rectTransform, lx + (listW - mw) / 2, 0, mw, mh);
            Hud.Shadow(modes, 16, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.06f), 6, 18));
            float each = (mw - 12) / 2;
            for (int i = 0; i < 2; i++)
            {
                string m = i == 0 ? "core" : "lost";
                bool on = gm == m;
                var bg = Hud.Box(modes.transform, m, on ? Color.white : new Color(1, 1, 1, 0), 12);
                Hud.Place(bg.rectTransform, 4 + i * (each + 4), 4, each, mh - 8);
                if (on) Hud.Shadow(bg, 12, new Hud.Drop(Hud.Rgba(40, 46, 70, 0.12f), 2, 10));
                bg.raycastTarget = true;
                bg.gameObject.AddComponent<Button>().onClick.AddListener(() =>
                {
                    Sound.Play("click");
                    gm = m;
                    Store.Set(ModeKey, m);
                    Draw();
                });
                var art = Hud.Rect(bg.transform, "Art");
                Hud.Place(art, 14, 10, each - 28, 72);
                var mask = art.gameObject.AddComponent<Image>();
                Hud.Corner(mask, 9);
                art.gameObject.AddComponent<Mask>().showMaskGraphic = false;
                var pic = Hud.Rect(art, "Picture");
                Hud.Fill(pic);
                var ai = pic.gameObject.AddComponent<RawImage>();
                ai.texture = Resources.Load<Texture2D>($"Icons/mode-{m}{(on ? "" : "-off")}");
                ai.raycastTarget = false;
                // (Cover: its picture cut to the box's shape about its middle.)
                float want = (each - 28) / 72f, have = 464f / 144f;
                ai.uvRect = want > have ? new Rect(0, (1 - have / want) / 2, 1, have / want) : new Rect((1 - want / have) / 2, 0, want / have, 1);
                K.Words(bg.transform, Modes.GameModes[m].Name.ToUpperInvariant(), 14, 88, each - 28, 15, 12.48f, on ? Look.Ink : Look.InkSoft, true, 400, 0.24f);
                K.Words(bg.transform, Modes.GameModes[m].Blurb, 14, 105, each - 28, 13, 10.88f, Look.InkFaint, false, 400);
            }
        }
        float y = mh + 8;
        y = Group(content, lx, listW, y, "YOUR DECKS", "");
        y = Boxes(content, lx, listW, y, mine, true);
        y = Group(content, lx, listW, y, "STARTERS", "copy one to make it your own");
        y = Boxes(content, lx, listW, y, starters, false);
        return y - 8 + Mathf.Max(18, K.SaB);
    }

    /// <summary>
    /// A group's label (.section-label.db-group: 8, or 8.96 on a big screen, spaced 0.3em, centred; clamp(22px, 6vh,
    /// 48px) above it), a quiet note after it (Exo 2 11.2, 8 on); returns where its boxes begin (8 under it).
    /// </summary>
    static float Group(RectTransform content, float lx, float listW, float y, string name, string note)
    {
        y += K.Clamp(22, 6 * K.Vh, 48);
        float f = K.Big ? 8.96f : 8, h = note.Length > 0 ? 13 : K.LineH(f);
        if (content != null)
        {
            float nw = K.TextW(name, f, 400, 0.3f), tw = note.Length > 0 ? K.TextW(note, 11.2f, 400, 0, false) : 0, gap = note.Length > 0 ? 8 : 0;
            float x = lx + (listW - (nw + gap + tw)) / 2;
            K.Words(content, name, x, y, nw + 2, h, f, Look.InkSoft, true, 400, 0.3f, TextAlignmentOptions.Left);
            if (note.Length > 0) K.Words(content, note, x + nw + gap, y, tw + 2, h, 11.2f, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Left);
        }
        return y + h + 8;
    }

    /// <summary>
    /// A grid of deck boxes (.db-boxes: --bw across, as many as fit, centred; clamp(12px, 3.5vh, 22px) by clamp(16px,
    /// 2.6vw, 28px) apart, padded 14 16 16 10), yours led by a new one, each its buttons (30 across, 5 apart) 6 under
    /// it; returns where it ends (8 under it).
    /// </summary>
    float Boxes(RectTransform content, float lx, float listW, float y, List<Decks.Saved> decks, bool own)
    {
        int n = decks.Count + (own ? 1 : 0);
        float bw = ListBw, depth = bw * 0.08f, bh = bw / 0.72f, colGap = K.Clamp(16, 2.6f * K.Vw, 28), rowGap = K.Clamp(12, 3.5f * K.Vh, 22);
        float avail = listW - 26;
        int cols = Mathf.Max(1, Mathf.Min(n, Mathf.FloorToInt((avail + colGap) / (bw + colGap))));
        float rowH = own && decks.Count == 0 ? depth + bh : depth + bh + 6 + 30;
        float top = y + 14;
        int rows = (n + cols - 1) / cols;
        if (content != null)
            for (int i = 0; i < n; i++)
            {
                int row = i / cols, col = i % cols;
                float x = lx + 10 + (avail - (cols * bw + (cols - 1) * colGap)) / 2 + col * (bw + colGap);
                float at = top + row * (rowH + rowGap) + depth;
                if (own && i == 0) { NewTile(content, x, at, bw); continue; }
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
                DeckBox(content, x, at, bw, d, () => { Open(d, own ? d.Id : null, d.Name); Draw(); }, buttons);
            }
        return top + rows * rowH + (rows - 1) * rowGap + 16 + 8;
    }

    /// <summary>The new deck's tile (.db-new-tile): a dashed place for a box, a slate plus (40 across) and its words in it.</summary>
    void NewTile(RectTransform parent, float x, float y, float bw)
    {
        float bh = bw / 0.72f;
        var box = Hud.Box(parent, "New deck", Hud.Rgba(93, 106, 140, 0.45f), 10);
        Hud.Place(box.rectTransform, x, y, bw, bh);
        // (Its dashed edge, drawn as a hairline of the dashes' colour round the pale inside.)
        var inside = Hud.Box(box.transform, "Inside", Color.white, 9);
        Hud.Fill(inside.rectTransform);
        inside.rectTransform.offsetMin = new Vector2(1, 1);
        inside.rectTransform.offsetMax = new Vector2(-1, -1);
        inside.color = new Color(0.98f, 0.98f, 0.98f, 1);
        box.raycastTarget = true;
        box.gameObject.AddComponent<Button>().onClick.AddListener(() =>
        {
            Sound.Play("click");
            Open(new Decks.Saved { Name = "New deck", Cards = new List<string>(), Mode = gm }, null, "New deck");
            Draw();
        });
        float ps = Mathf.Min(40, bw * 0.47f);
        var plus = Hud.Rect(box.transform, "Plus");
        Hud.Place(plus, (bw - ps) / 2, bh / 2 - ps * 0.78f, ps, ps);
        var pi = plus.gameObject.AddComponent<Image>();
        pi.sprite = Hud.Circle;
        pi.color = Hex("#5d6a8c");
        pi.raycastTarget = false;
        K.Fill(plus, "+", ps * 0.64f, Color.white, false, 400).margin = new Vector4(0, 0, 0, ps * 0.06f);
        K.Words(box.transform, "NEW DECK", 0, bh / 2 + ps * 0.37f, bw, 11, 9.6f, Look.InkSoft, true, 400, 0.16f);
    }

    /// <summary>
    /// A deck as a deck box (builder.ts deckBox): a little 3D box in its race's colour, its cover the hero of its most
    /// expensive Command card (its race's emblem if it has none), its name and races on the front, cards still to
    /// collect on a tag, its buttons (.deck-icon: round, 30 across, 5 apart) 6 beneath.
    /// </summary>
    void DeckBox(RectTransform parent, float x, float y, float bw, Decks.Saved d, System.Action open, List<(string icon, string name, System.Action act, bool danger)> buttons)
    {
        var cell = DeckBoxMini(parent, x, y, d, false, open, bw, true);
        float bh = bw / 0.72f, depth = bw * 0.08f;
        if (DeckRules.DeckProblems(d.Cards, Modes.ModeOf(d)).Count > 0) cell.gameObject.AddComponent<CanvasGroup>().alpha = 0.7f;
        // Cards still to collect, on a tag 9% down the front.
        int missing = MissingCopies(d.Cards).Sum(x2 => x2.n);
        if (missing > 0)
        {
            string text = $"{missing} TO COLLECT";
            float fs = Mathf.Max(7, bw * 0.06f), tw = K.TextW(text, fs, 400, 0.12f) + 16;
            var tag = Hud.Box(cell, "Tag", Color.white, 7);
            Hud.Place(tag.rectTransform, (bw - tw) / 2, bh * 0.09f, tw, fs * 1.6f);
            Hud.Shadow(tag, 7, new Hud.Drop(Hud.Rgba(212, 149, 42, 0.55f), 0, 0, 1), new Hud.Drop(Hud.Rgba(60, 64, 80, 0.18f), 2, 6));
            K.Fill(tag.transform, text, fs, Hex("#a8641c"), true, 400, 0.12f);
        }
        // Its buttons, small and round, beneath (centred under the box and its side).
        float bx = (bw + depth - (buttons.Count * 30 + (buttons.Count - 1) * 5)) / 2;
        for (int i = 0; i < buttons.Count; i++)
        {
            var (icon, name, act, danger) = buttons[i];
            var b = Hud.Rect(cell, name);
            Hud.Place(b, bx + i * 35, bh + 6, 30, 30);
            var bi = b.gameObject.AddComponent<Image>();
            bi.sprite = Hud.Circle;
            Hud.Shadow(bi, 15, new Hud.Drop(Hud.Rgba(150, 156, 172, 0.25f), 0, 0, 1), new Hud.Drop(Hud.Rgba(60, 70, 100, 0.1f), 2, 6));
            var bb = b.gameObject.AddComponent<Button>();
            bb.onClick.AddListener(() => { Sound.Play("click"); act(); });
            Icon(b, icon, new Vector2(0.5f, 0.5f), Vector2.zero, 15, danger ? Hex("#c0503a") : Look.InkSoft);
        }
    }

    /// <summary>A small deck box's whole height (.lobby-deck): the box, 6, and its name.</summary>
    public static float MiniH(float bw) => bw / 0.72f + 6 + MiniLabel * 1.2f;
    static float MiniLabel => K.Clamp(6.4f, 1.5f * K.Vh, 8.32f);

    /// <summary>
    /// A deck as a deck box (app.ts deckBoxMini, quickplay's and online's; `big`, the deck lists' deckBox): `bw` across,
    /// its button's top-left at (x, y); the front 0.72 as wide as tall, its lid and right side `bw` × 0.08 deep. A
    /// small box has its cover (68% across) in its middle with a ring of its colour and its name beneath it (clamp(6.4px,
    /// 1.5vh, 8.32px), spaced 0.1em); a big one its cover (72% of the front inside its padding) higher, ringed white and
    /// in its colour, its name (clamp(8px, 2.1vh, 11.52px), spaced 0.14em) and races (Exo 2 clamp(7.2px, 1.7vh,
    /// 9.28px)) at the front's foot. Picked (`on`), lifted 5 in a soft slate halo with a tick on its front (17% across,
    /// at least 15); a small one not picked faded to 72%. `act` null: not a button.
    /// </summary>
    public static RectTransform DeckBoxMini(RectTransform parent, float x, float y, Decks.Saved d, bool on, System.Action act, float bw, bool big = false)
    {
        float bh = bw / 0.72f, depth = bw * 0.08f, lift = on ? 5 : 0;
        var cell = Hud.Rect(parent, d.Name);
        Hud.Place(cell, x, y, bw, big ? bh : MiniH(bw));
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
        var drop = new Hud.Drop(Hud.Rgba(40, 44, 60, 0.25f), 14, 24);
        // (Its hairline edge, in its colour, drawn as a ring just round it; picked, the halo round it too.)
        var edge = new Hud.Drop(Mix(dc, 0.25f, Hex("#7a8498")), 0, 0, 1);
        if (on) Hud.Shadow(front, 2, edge, drop, new Hud.Drop(Hud.Rgba(93, 106, 140, 0.28f), 0, 5, 1));
        else Hud.Shadow(front, 2, edge, drop);
        if (act != null)
        {
            front.raycastTarget = true;
            front.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); act(); });
        }
        // A band of its colour just under the lid, and a thin printed frame inside the edge (6%; a big box's 4.5%).
        var band = Hud.Rect(front.transform, "Band");
        Hud.Place(band, 0, bh * 0.022f, bw, bh * 0.01f);
        band.gameObject.AddComponent<Image>().color = Mix(dc, 0.75f, Color.white);
        var frame = Hud.Rect(front.transform, "Frame");
        Hud.Fill(frame);
        float fi = big ? 0.045f : 0.06f;
        frame.offsetMin = new Vector2(bw * fi, bh * fi);
        frame.offsetMax = -frame.offsetMin;
        Lines(frame, new Color(1, 1, 1, 0.16f), 1);
        // The cover: white under it, a ring of its colour, a shadow.
        float cs, coverMid;
        float nameF = K.Clamp(8, 2.1f * K.Vh, 11.52f), raceF = K.Clamp(7.2f, 1.7f * K.Vh, 9.28f);
        float contentTop = 1 + 0.14f * bw, contentBot = bh - 1 - 0.09f * bw, nameLH = nameF * 1.25f, raceLH = raceF * 1.2f;
        if (big)
        {
            float inner = 0.84f * bw - 2;
            cs = 0.72f * inner;
            float rowsH = 0.08f * inner + nameLH + 2 + raceLH + 2;
            coverMid = contentTop + (contentBot - contentTop - rowsH) / 2;
        }
        else
        {
            cs = bw * 0.68f;
            coverMid = bh / 2;
        }
        var cover = Hud.Rect(front.transform, "Cover");
        Hud.At(cover, new Vector2(0.5f, 1), new Vector2(0, -coverMid), new Vector2(cs, cs));
        cover.pivot = new Vector2(0.5f, 0.5f);
        var ci = cover.gameObject.AddComponent<Image>();
        ci.sprite = Hud.Circle;
        ci.color = Color.white;
        ci.raycastTarget = false;
        // (A big box's cover has a white ring inside its coloured one.)
        if (big) Hud.Shadow(ci, cs / 2, new Hud.Drop(new Color(1, 1, 1, 0.9f), 0, 0, 3), new Hud.Drop(Mix(dc, 0.7f, Color.white), 0, 0, 4), new Hud.Drop(Hud.Rgba(30, 34, 44, 0.3f), 6, 14));
        else Hud.Shadow(ci, cs / 2, new Hud.Drop(Mix(dc, 0.6f, Color.white), 0, 0, 1.5f), new Hud.Drop(Hud.Rgba(20, 24, 34, 0.4f), 3, 8));
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
            // (The tick: the app's ticked box, larger: 17% of the box across (at least 15), 6% down and 7% in from its right.)
            float t = Mathf.Max(15, bw * 0.17f);
            var tick = Hud.Box(front.transform, "Tick", Hex("#5d6a8c"), t * 0.28f);
            Hud.Place(tick.rectTransform, bw * 0.93f - t, bh * 0.06f, t, t);
            Hud.Shadow(tick, t * 0.28f, new Hud.Drop(new Color(1, 1, 1, 0.7f), 0, 0, 1));
            K.Fill(tick.transform, "✓", t * 0.62f, Color.white, false, 600);
        }
        if (big)
        {
            var nm = K.Words(front.transform, d.Name.ToUpperInvariant(), bw * 0.08f, contentBot - raceLH - 2 - nameLH, bw * 0.84f, nameLH, nameF, Color.white, true, 500, 0.14f);
            nm.overflowMode = TextOverflowModes.Ellipsis;
            K.Words(front.transform, RacesLabel(d.Cards).ToUpperInvariant(), bw * 0.04f, contentBot - raceLH, bw * 0.92f, raceLH, raceF, new Color(1, 1, 1, 0.85f), false, 400, 0.2f);
        }
        else
        {
            var nm = K.Words(cell, d.Name.ToUpperInvariant(), -5, bh + 6, bw + 10, MiniLabel * 1.2f, MiniLabel, on ? Look.Ink : Look.InkFaint, true, 400, 0.1f);
            nm.overflowMode = TextOverflowModes.Ellipsis;
        }
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
        var veil = Hud.Rect(layer, "Veil");
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

    // (.db-editor, the whole page: padded as a setup page at its top and sides, none at its foot; the pool's side and
    // the deck's (clamp(170px, 26vw, 290px) across) clamp(8px, 1.6vw, 16px) apart. The pool's side: the toolbar (30
    // tall), the pool, the pager (30 and its padding, 4 above and max(16px, the safe area + 10) below), 8 apart.)
    static float SideW => K.Clamp(170, 26 * K.Vw, 290);
    static float PoolX => K.PadL;
    static float PoolTop => K.PadT + 30 + 8;
    static float PoolW => K.W - K.PadL - K.PadR - SideW - K.Clamp(8, 1.6f * K.Vw, 16);
    static float PagerH => 34 + Mathf.Max(16, K.SaB + 10);
    static float PoolH => K.H - PoolTop - 8 - PagerH;
    /// <summary>A pool too short for its rows (the web's db-short: under 300 tall inside its padding and the scrollbar's room).</summary>
    static bool ShortPool => PoolH - 2 - Mathf.Max(18, K.SaB) - 6 < 300;
    /// <summary>The search's right edge (.db-search: up to 300 across, leaving the rest of the toolbar room).</summary>
    static float SearchR => PoolX + Mathf.Min(300, PoolW - 30 - 8 - 62 - 16);

    void Editor()
    {
        Toolbar();
        poolArea = Hud.Rect(root, "Pool");
        Hud.Place(poolArea, PoolX, PoolTop, PoolW, PoolH);
        pagerArea = Hud.Rect(root, "Pager");
        Hud.Place(pagerArea, PoolX, K.H - PagerH + 4, PoolW, 30);
        Pool();
        Side();
    }

    /// <summary>What lies over the editor: the filters popover, and leaving without saving.</summary>
    void Dialogs()
    {
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

    /// <summary>
    /// A text box of the builder's (.db-search, .db-name): white, a hairline, its words on the left (or centred), at
    /// (x, y), w by h; corners `radius`.
    /// </summary>
    static TMP_InputField Box(Transform parent, string text, float x, float y, float w, float h, float radius, int limit, string placeholder, float size, bool display, float em, bool centre, Color edge)
    {
        var box = Hud.Box(parent, "Input", Color.white, radius);
        Hud.Place(box.rectTransform, x, y, w, h);
        Hud.Shadow(box, radius, new Hud.Drop(edge, 0, 0, 1));
        box.raycastTarget = true;
        var area = Hud.Rect(box.transform, "Text Area");
        Hud.Fill(area);
        area.offsetMin = new Vector2(centre ? 8 : 12, 1);
        area.offsetMax = new Vector2(centre ? -8 : -12, -1);
        area.gameObject.AddComponent<RectMask2D>();
        var align = centre ? TextAlignmentOptions.Center : TextAlignmentOptions.Left;
        var hint = placeholder.Length > 0 ? K.Fill(area, placeholder, size, Look.InkFaint, display, 400, em, align) : null;
        var t = K.Fill(area, text, size, Look.Ink, display, 400, em, align);
        t.richText = false;
        var input = box.gameObject.AddComponent<TMP_InputField>();
        input.textViewport = area;
        input.textComponent = t;
        if (hint != null) input.placeholder = hint;
        input.characterLimit = limit;
        input.richText = false;
        input.text = text;
        return input;
    }

    /// <summary>
    /// The toolbar (.db-toolbar, 30 tall): the search (Exo 2 12, round), the filters button (30 across, round, with how
    /// many are set), and at the pool's right the card sizes (.db-seg: 62 by 30; on a short pool the medium size steps
    /// aside, the large one standing for it).
    /// </summary>
    void Toolbar()
    {
        float top = K.PadT;
        var search = Box(root, filters.Q, PoolX, top, SearchR - PoolX, 30, 15, 40, "search cards", 12, false, 0, false, Hex("#e6e8ee"));
        search.onValueChanged.AddListener(s =>
        {
            filters.Q = Clip(s, 40);
            pageAt = 0;
            RefreshPool();
        });
        int set = filters.Ticked.Count(kv => kv.Value.Count > 0) + (filters.Sort != "cost" ? 1 : 0) + (filters.Characters ? 1 : 0) + (filters.InDeck ? 1 : 0);
        var fb = Hud.Box(root, "Filters", Color.white, 15);
        Hud.Place(fb.rectTransform, SearchR + 8, top, 30, 30);
        Hud.Shadow(fb, 15, new Hud.Drop(filtersOpen || set > 0 ? Hex("#c9cfdd") : Hex("#e6e8ee"), 0, 0, 1));
        fb.raycastTarget = true;
        fb.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); filtersOpen = !filtersOpen; dropOpen = null; Draw(); });
        Icon(fb.transform, "db-filter", new Vector2(0.5f, 0.5f), Vector2.zero, 15, filtersOpen || set > 0 ? Look.Ink : Look.InkSoft);
        if (set > 0)
        {
            var dot = Hud.Rect(fb.transform, "Set");
            Hud.At(dot, new Vector2(1, 1), new Vector2(4, 4), new Vector2(14, 14));
            var di = dot.gameObject.AddComponent<Image>();
            di.sprite = Hud.Circle;
            di.color = Hex("#5d6a8c");
            K.Fill(dot, set.ToString(), 8, Color.white, true, 700);
        }
        // The card sizes: many small, some medium, a few large.
        bool shortPool = ShortPool;
        var sizes = shortPool ? new[] { "sm", "lg" } : new[] { "sm", "md", "lg" };
        float segW = 4 + sizes.Length * 28 + (sizes.Length - 1) * 2;
        var seg = K.Inset(root, "Sizes", new Color(1, 1, 1, 0.7f), Hud.Rgba(150, 160, 185, 0.3f), 15);
        Hud.Place(seg.rectTransform, PoolX + PoolW - segW, top, segW, 30);
        for (int i = 0; i < sizes.Length; i++)
        {
            string g = sizes[i];
            bool on = grid == g || (shortPool && g == "lg" && grid == "md");
            var b = Hud.Box(seg.transform, g, on ? Color.white : new Color(1, 1, 1, 0.001f), 13);
            Hud.Place(b.rectTransform, 2 + i * 30, 2, 28, 26);
            if (on) Hud.Shadow(b, 13, new Hud.Drop(Hud.Rgba(70, 76, 100, 0.2f), 1, 4));
            b.raycastTarget = true;
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
            Icon(b.transform, $"db-grid-{g}", new Vector2(0.5f, 0.5f), Vector2.zero, 14, on ? Look.Ink : Look.InkSoft);
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
    /// The pool's layout (builder.ts sizePool): a set number of rows (small 3, medium 2, large 1; a row fewer on a pool
    /// under 300 tall, a phone on its side), the cards sized to the pool's height for them, as many columns as then fit
    /// across, 10 apart.
    /// </summary>
    (int cols, int rows, float w, float h) Layout()
    {
        int rows = Mathf.Max(1, (grid == "sm" ? 3 : grid == "lg" ? 1 : 2) - (ShortPool ? 1 : 0));
        const float gap = 10;
        float w = Mathf.Floor((PoolH - 2 - Mathf.Max(18, K.SaB) - (rows - 1) * gap) / rows / 1.52f * 10) / 10;
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
        if (shown.Count == 0) K.Fill(poolArea, "No cards match these filters.", 12, Look.InkSoft, false, 400);
        int used = Mathf.Max(1, (shown.Count + cols - 1) / cols);
        // (The page's cards centred in the pool, as the web's grid stands in it.)
        float top = (PoolH - (used * h + (used - 1) * 10)) / 2, left = (PoolW - (cols * w + (cols - 1) * 10)) / 2;
        for (int i = 0; i < shown.Count; i++)
        {
            var c = shown[i];
            var at = new Vector2(left + (i % cols) * (w + 10), -top - (i / cols) * (h + 10));
            Tile(c, at, w, h);
        }
        Pager();
    }

    /// <summary>
    /// A card of the pool: its face, its count (in the deck of owned, .db-have: a pill 3.5% down and 4% in, its words
    /// max(9px, 6.5% of the card); tap it to craft), a corner to read it large (.db-zoom: 22 across, 5% in).
    /// </summary>
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
            float o = focus == id ? 3 : 2;
            ring.offsetMin = new Vector2(-o, -o);
            ring.offsetMax = new Vector2(o, o);
            var ri = ring.gameObject.AddComponent<Image>();
            Hud.Corner(ri, w * 0.06f + o);
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
        float fs = Mathf.Max(9, w * 0.065f);
        var badgeText = $"{n}/{have}";
        float bw = K.TextW(badgeText, fs, 400, 0.06f) + 16, bh = fs * 1.2f + 4;
        var badge = Hud.Box(cell, "Have", n > 0 ? kc : new Color(1, 1, 1, 0.94f), bh / 2);
        Hud.Place(badge.rectTransform, w * 0.04f, h * 0.035f, bw, bh);
        Hud.Shadow(badge, bh / 2, n > 0 ? new Hud.Drop(Color.white, 0, 0, 2) : new Hud.Drop(Hud.Rgba(150, 160, 185, 0.35f), 0, 0, 1), new Hud.Drop(Hud.Rgba(80, 84, 100, 0.18f), 1, 4));
        badge.raycastTarget = true;
        badge.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); focus = focus == id ? null : id; Draw(); });
        K.Fill(badge.transform, badgeText, fs, n > 0 ? Color.white : have > 0 ? Look.InkFaint : Hex("#6d6fd0"), true, 400, 0.06f);
        // Read it large.
        var zoom = Hud.Rect(cell, "Zoom");
        Hud.Place(zoom, w * 0.95f - 22, h * 0.05f, 22, 22);
        var zi = zoom.gameObject.AddComponent<Image>();
        zi.sprite = Hud.Circle;
        zi.color = new Color(1, 1, 1, 0.92f);
        Hud.Shadow(zi, 11, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.25f), 1, 4));
        zoom.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("hover"); zoomed = id; Draw(); });
        K.Fill(zoom, "+", 15, Look.InkSoft, false, 500).margin = new Vector4(0, 0, 0, 1.5f);
    }

    /// <summary>
    /// The page buttons beneath the pool (.db-pager; none with a single page): back and on (30 across, round, a hairline
    /// of #e4e1dc), 10 apart, a dot for each page between them (or, with many, its number, Exo 2 13.33).
    /// </summary>
    void Pager()
    {
        int pages = Mathf.Max(1, Pages().Count);
        if (pages <= 1) return;
        bool dots = pages < 13;
        float mid = dots ? pages * 12 - 4 : K.TextW($"{pageAt + 1} / {pages}", 13.33f, 400, 0, false);
        float cx = PoolW / 2;
        for (int dir = -1; dir <= 1; dir += 2)
        {
            int step = dir;
            bool can = step < 0 ? pageAt > 0 : pageAt < pages - 1;
            var arrow = Hud.Rect(pagerArea, step < 0 ? "Prev" : "Next");
            Hud.Place(arrow, cx + step * (mid / 2 + 10 + 15) - 15, 0, 30, 30);
            var ai = arrow.gameObject.AddComponent<Image>();
            ai.sprite = Hud.Circle;
            Hud.Shadow(ai, 15, new Hud.Drop(Hex("#e4e1dc"), 0, 0, 1));
            var ab = arrow.gameObject.AddComponent<Button>();
            ab.interactable = can;
            ab.onClick.AddListener(() => { Sound.Play("click"); pageAt = Mathf.Clamp(pageAt + step, 0, pages - 1); RefreshPool(); });
            K.Fill(arrow, step < 0 ? "‹" : "›", 18, can ? Look.Ink : new Color(0.24f, 0.26f, 0.29f, 0.35f), false, 500).margin = new Vector4(step < 0 ? 0 : 2, 0, step < 0 ? 2 : 0, 3);
        }
        if (!dots)
        {
            K.Words(pagerArea, $"{pageAt + 1} / {pages}", cx - mid / 2 - 4, 0, mid + 8, 30, 13.33f, Look.InkSoft, false, 400);
            return;
        }
        for (int i = 0; i < pages; i++)
        {
            int to = i;
            bool on = i == pageAt;
            var dot = K.Hit(pagerArea, $"Page {i + 1}", () => { pageAt = to; RefreshPool(); }, false);
            Hud.Place((RectTransform)dot.transform, cx - mid / 2 + i * 12 - 2, 4, 12, 22);
            var mark = Hud.Rect(dot.transform, "Dot");
            Hud.At(mark, new Vector2(0.5f, 0.5f), Vector2.zero, on ? new Vector2(8, 8) : new Vector2(6, 6));
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

    /// <summary>
    /// The deck's side (.db-deck-side): clamp(170px, 26vw, 290px) across down the right, max(12px, the safe area) off
    /// the foot; white at 70%, corners 14, padded 10, its parts 8 apart: its name (.db-name, 26 tall) and mode chip,
    /// the count, the craft panel, its cards (scrolling), exit and save.
    /// </summary>
    void Side()
    {
        var d = editing;
        float sw = SideW, sx = K.W - K.PadR - sw, sy = K.PadT, sh = K.H - sy - Mathf.Max(12, K.SaB);
        var side = Hud.Box(root, "Deck", new Color(1, 1, 1, 0.7f), 14);
        Hud.Place(side.rectTransform, sx, sy, sw, sh);
        Hud.Shadow(side, 14, new Hud.Drop(Hud.Rgba(90, 90, 110, 0.13f), 8, 30), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.07f), 2, 6));
        side.raycastTarget = true;
        float inner = sw - 22, x = 11, y = 11;
        string modeName = Modes.GameModes[Modes.ModeOf(d)].Name.ToLowerInvariant();
        float chipW = K.TextW(modeName, 11, 600, 0, false) + 18;
        var nameBox = Box(side.transform, d.Name, x, y, inner - chipW - 8, 26, 8, 24, "", 10.56f, true, 0.1f, true, Hex("#eceae6"));
        nameBox.onValueChanged.AddListener(s => editing.Name = Clip(s, 24));
        var chip = Hud.Box(side.transform, "Mode", Hex("#eef0f5"), 9.5f);
        Hud.Place(chip.rectTransform, x + inner - chipW, y + 3.5f, chipW, 19);
        K.Fill(chip.transform, modeName, 11, Look.InkSoft, false, 600);
        y += 26 + 8;

        // The count of cards and of Heroes, against what it needs (.db-tally: Exo 2 10.56).
        int commands = d.Cards.Count(id => Cards.Def(id).Kind == "command"), needHeroes = DeckRules.CommandCardsFor(d.Cards.Count);
        string ok = Html(Look.Good), bad = "#c0705f";
        bool sizeOk = d.Cards.Count >= Balance.DeckSize && d.Cards.Count <= Balance.MaxDeckSize;
        var missing = MissingCopies(d.Cards);
        int need = missing.Sum(m => m.n);
        var collect = need > 0 ? $"<color=#a8641c>{need} to collect · ⟁{missing.Sum(m => m.n * Progression.CraftCost(m.id))}</color>   " : "";
        var tally = K.Words(side.transform, $"{collect}<b><color={(sizeOk ? ok : bad)}>{d.Cards.Count}/{(d.Cards.Count > Balance.DeckSize ? Balance.MaxDeckSize : Balance.DeckSize)}</color></b> cards · <b><color={(commands == needHeroes ? ok : bad)}>{commands}/{needHeroes}</color></b> {(needHeroes == 1 ? "hero" : "heroes")}", x, y, inner, 12, 10.56f, Look.InkSoft, false, 400);
        tally.overflowMode = TextOverflowModes.Ellipsis;
        y += 12 + 8;
        if (focus != null) y = FocusPanel(side.transform, focus, x, y, inner) + 8;

        // The deck, card by card (.db-row: 28 tall, 2 apart, round, in the card's own colours with its picture), by
        // energy cost then name; then exit and save (.db-actions: 25 tall, at least 72 across, 6 apart).
        float actionsY = sh - 11 - 25;
        var rows = d.Cards.Distinct().Select(Cards.Def).OrderBy(CostOrder).ThenBy(c => c.Name, System.StringComparer.InvariantCultureIgnoreCase).ToList();
        float listH = rows.Count == 0 ? 8 + 76.4f : rows.Count * 30;
        var content = K.Scroller(side.transform, "Rows", x, y, inner, Mathf.Max(30, actionsY - 8 - y), listH);
        float ry = 0;
        foreach (var c in rows) { Row(content, c, ry, inner); ry += 30; }
        if (rows.Count == 0)
        {
            var empty = Hud.Box(content, "Empty", Hex("#d6d3ce"), 10);
            Hud.Place(empty.rectTransform, 0, 4, inner, 76.4f);
            var hole = Hud.Box(empty.transform, "Inside", new Color(0.985f, 0.985f, 0.98f), 9);
            Hud.Fill(hole.rectTransform);
            hole.rectTransform.offsetMin = new Vector2(1.5f, 1.5f);
            hole.rectTransform.offsetMax = new Vector2(-1.5f, -1.5f);
            var words = K.Fill(empty.transform, "No cards yet. Tap a card to add it.", 12.8f, Hex("#8a8f99"), false, 400);
            words.textWrappingMode = TextWrappingModes.Normal;
            words.margin = new Vector4(12, 0, 12, 0);
        }
        System.Action exitAct = () =>
        {
            // Leave the deck: ask first if that would lose changes.
            if (Snap(editing) != openedSnap) confirmExit = true;
            else editing = starter = null;
            Draw();
        };
        float bw = Mathf.Max(72, K.TextW("SAVE", 9.28f, 700, 0.18f) + 30);
        var save = K.Btn(side.transform, "save", Save, x + inner - bw, actionsY, K.Kind.Primary, bw, 25, 9.28f, 0.18f);
        var exit = K.Btn(side.transform, "exit", exitAct, x + inner - bw - 6 - bw, actionsY, K.Kind.Btn, bw, 25, 9.28f, 0.18f, ring: new Color(0.753f, 0.337f, 0.239f, 0.45f));
        var el = exit.GetComponentInChildren<TextMeshProUGUI>();
        el.color = Hex("#b23c24");
        el.font = Look.Display(700);
    }

    /// <summary>A row of the deck: its picture (22 across), its name, how many short (if any), how many, and a minus (tap: take one out).</summary>
    void Row(RectTransform content, CardDef c, float y, float width)
    {
        int n = Count(editing.Cards, c.Id), shortBy = Mathf.Max(0, n - Profile.Owned(c.Id));
        var kc = Look.Kind.TryGetValue(ShownKind(c), out var kcol) ? kcol : Look.Ink;
        var rarity = c.Rarity ?? "dwarf";
        var row = Hud.Box(content, c.Id, rarity == "stellar" ? Hex("#fcf5e6") : rarity == "anomaly" ? Hex("#f4eefc") : Hex("#f8f9fb"), 14);
        Hud.Place(row.rectTransform, 0, y, width, 28);
        Hud.Shadow(row, 14, new Hud.Drop(new Color(kc.r, kc.g, kc.b, 0.22f), 0, 0, 1), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.1f), 2, 6));
        row.raycastTarget = true;
        var id = c.Id;
        row.gameObject.AddComponent<Button>().onClick.AddListener(() => Remove(id));
        var art = Hud.Rect(row.transform, "Art");
        Hud.Place(art, 3, 3, 22, 22);
        var ring = art.gameObject.AddComponent<Image>();
        ring.sprite = Hud.Circle;
        ring.color = new Color(1, 1, 1, 0.7f);
        ring.raycastTarget = false;
        Portrait(art, id, 21);
        float fs = K.Clamp(8.96f, 2 * K.Vh, 11.2f);
        var name = K.Fill(row.transform, c.Name.ToLowerInvariant(), fs, Look.Ink, true, 700, 0.06f, TextAlignmentOptions.Left);
        name.overflowMode = TextOverflowModes.Ellipsis;
        name.margin = new Vector4(32, 0, shortBy > 0 ? 82 : 40, 0);
        var count = K.Fill(row.transform, $"×{n}", 8.96f, Look.Ink, true, 700, 0, TextAlignmentOptions.Right);
        count.margin = new Vector4(0, 0, 22, 0);
        var minus = K.Fill(row.transform, "−", 11, Look.InkFaint, false, 500, 0, TextAlignmentOptions.Right);
        minus.margin = new Vector4(0, 0, 10, 0);
        if (shortBy > 0)
        {
            var needL = K.Fill(row.transform, $"need {shortBy}", 8.5f, Hex("#a8641c"), false, 500, 0, TextAlignmentOptions.Right);
            needL.margin = new Vector4(0, 0, 42, 0);
        }
    }

    /// <summary>
    /// Crafting (builder.ts renderFocus, .db-focus: #f6f7fb, corners 14, padded 10 by 12, 6 between): make another copy
    /// with flux, or break a spare one down for half its cost. Returns where it ends.
    /// </summary>
    float FocusPanel(Transform side, string id, float x, float y, float inner)
    {
        var def = Cards.Def(id);
        var me = Profile.Me;
        int have = Profile.Owned(id), cost = Progression.CraftCost(id), spare = Progression.Breakable(me.Collection, id);
        string line = $"owned {have} · a deck may hold {Campaign.CopyLimit(id)} · you have ⟁{me.Flux} flux";
        var probe = K.Words(side, line, x + 12, 0, inner - 24, 12, 9.92f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
        probe.textWrappingMode = TextWrappingModes.Normal;
        float lineH = probe.GetPreferredValues(line, inner - 24, 0).y, h = 10 + 22 + 6 + lineH + 6 + 26 + 10;
        var panelBox = K.Inset(side, "Craft", Hex("#f6f7fb"), Hex("#e6e9f2"), 14);
        Hud.Place(panelBox.rectTransform, x, y, inner, h);
        var t = panelBox.transform;
        float closeW = K.BtnW("close", K.Kind.Pill, 8.96f);
        var head = K.Words(t, def.Name.ToLowerInvariant(), 12, 10, inner - 24 - closeW - 8, 22, 11.52f, Look.Ink, true, 500, 0.1f, TextAlignmentOptions.Left);
        head.overflowMode = TextOverflowModes.Ellipsis;
        K.Btn(t, "close", () => { focus = null; Draw(); }, inner - 12 - closeW, 10, K.Kind.Pill, closeW, 22, 8.96f);
        probe.transform.SetParent(t, false);
        Hud.Place(probe.rectTransform, 12, 38, inner - 24, lineH);
        float bw = (inner - 24 - 6) / 2;
        var craft = K.Btn(t, $"craft · ⟁{cost}", () => Craft(id), 12, 44 + lineH, K.Kind.Btn, bw, 26, 8.96f, 0.1f);
        craft.interactable = me.Flux >= cost;
        var brk = K.Btn(t, $"break down · +⟁{Progression.BreakdownValue(id)}", () => BreakDown(id), 12 + bw + 6, 44 + lineH, K.Kind.Btn, bw, 26, 8.96f, 0.1f);
        brk.interactable = spare > 0;
        return y + h;
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
        var off = Hud.Rect(layer, "Off");
        Hud.Fill(off);
        off.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0.001f);
        off.gameObject.AddComponent<Button>().onClick.AddListener(() => { filtersOpen = false; dropOpen = null; Draw(); });
        const float pw = 540, dh = 56;
        float ph = 16 + 3 * (dh + 10) + 46 + 52;
        var pop = Hud.Glass(layer, "Popover", new Color(1, 1, 1, 0.97f));
        // (On the reference layer: under the filters button, kept on the page.)
        float popX = Mathf.Clamp(SearchR + 8, K.PadL, K.W - K.PadR - pw / WebLook.Zoom) * WebLook.Zoom;
        Hud.At((RectTransform)pop.transform, new Vector2(0, 1), new Vector2(popX, -(K.PadT + 36) * WebLook.Zoom), new Vector2(pw, ph));
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

    /// <summary>A card read large, over a veil (the web's .zoom-view): as tall as the page allows (at most 463), a word under it.</summary>
    void Zoom()
    {
        var veil = Hud.Rect(root, "Zoom");
        Hud.Fill(veil);
        veil.gameObject.AddComponent<Image>().color = new Color(0.95f, 0.95f, 0.94f, 0.85f);
        veil.gameObject.AddComponent<Button>().onClick.AddListener(() => { zoomed = null; Draw(); });
        float ch = Mathf.Min(463, K.H - Mathf.Max(6, K.SaT) - Mathf.Max(6, K.SaB) - 48), cw = ch / 1.4f;
        var face = Hud.Rect(veil, "Card");
        Hud.Place(face, (K.W - cw) / 2, Mathf.Max(6, K.SaT) + 12, cw, ch);
        var img = face.gameObject.AddComponent<RawImage>();
        img.texture = Faces.Of(zoomed, false);
        img.raycastTarget = false;
        K.Words(veil, "tap anywhere to close", 0, Mathf.Max(6, K.SaT) + 12 + ch + 10, K.W, 16, 12.8f, Look.InkFaint, false, 400);
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
    /// <summary>A square frame of hairlines just inside a rect (a deck box's printed frame).</summary>
    static void Lines(RectTransform r, Color colour, float width)
    {
        var sides = new[] { (new Vector2(0, 1), new Vector2(1, 1)), (new Vector2(0, 0), new Vector2(1, 0)), (new Vector2(0, 0), new Vector2(0, 1)), (new Vector2(1, 0), new Vector2(1, 1)) };
        for (int i = 0; i < 4; i++)
        {
            var (a, b) = sides[i];
            var line = Hud.Rect(r, "Line");
            line.anchorMin = a;
            line.anchorMax = b;
            line.pivot = new Vector2(a.x == b.x ? a.x : 0.5f, a.y == b.y ? a.y : 0.5f);
            line.anchoredPosition = Vector2.zero;
            line.sizeDelta = i < 2 ? new Vector2(0, width) : new Vector2(width, 0);
            var img = line.gameObject.AddComponent<Image>();
            img.color = colour;
            img.raycastTarget = false;
        }
    }

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
