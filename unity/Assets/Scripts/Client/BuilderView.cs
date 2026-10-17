using System.Collections.Generic;
using System.Linq;
using System.Text;
using BlueLoop.Engine;
using Newtonsoft.Json.Linq;
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
    string focus, dropOpen;
    bool filtersOpen;
    int pageAt;
    /// <summary>How big the pool's cards are ("sm", "md", "lg"), and the game mode the list shows: both remembered on this device.</summary>
    string grid, gm;
    /// <summary>A panel over the list: "import" a deck code, or "share" one (panelDeck); what's typed in it (a code, a note).</summary>
    string panel, panelDeck, codeText = "", noteText = "";
    RectTransform poolArea, pagerArea;

    /// <summary>A deck shared with the community (account.ts CommunityDeck).</summary>
    class CommunityDeck
    {
        public string Id, Name, Author, Note;
        public List<string> Cards = new List<string>();
        public int Saves;
        public bool Mine;
    }

    /// <summary>
    /// The community page, open or not (builder.ts community): how it's sorted ("popular", "new", "mine"), what it's
    /// searching for (and what's typed in its box), the decks it has (null: still loading), or why it has none.
    /// </summary>
    bool community;
    string csort = "popular", cq = "", cqText = "", cerror;
    List<CommunityDeck> cdecks;
    /// <summary>The shared deck the deck being edited was opened from (its save counts towards the deck).</summary>
    string fromCommunity;

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

    void Draw()
    {
        var old = new List<GameObject>();
        foreach (Transform c in root) old.Add(c.gameObject);
        foreach (var o in old) Mats.Kill(o);
        // (Cards show as they play in the deck's mode.)
        Modes.SetRulesMode(editing != null ? Modes.ModeOf(editing) : "lost");
        if (editing != null) Editor();
        else if (community) Community();
        else List();
        if (editing != null) Dialogs();
        if (panel != null) Panel();
    }

    // ---- The decks ----

    /// <summary>The deck lists' boxes across (.db-boxes --bw: clamp(88px, 30vh, 150px); on a short screen clamp(62px, 22vh, 92px)).</summary>
    public static float ListBw => K.Short ? K.Clamp(62, 22 * K.Vh, 92) : K.Clamp(88, 30 * K.Vh, 150);

    void List()
    {
        // The header (builder.ts's setup-top): back, DECKS, and community and import on the right (.db-head-actions:
        // .btn-small with its mark (14 across, 6 before its word), 30 tall, 8 apart). (Its gap to the list,
        // clamp(6px, 2vh, 14px), and no foot: the list runs to the screen's foot and scrolls.)
        float left = K.PadL, right = K.W - K.PadR, top = K.PadT;
        Header("DECKS", () => menu.Show("hub"));
        float iw = HeadButton("import", "db-upload", right, () => { panel = "import"; codeText = ""; Draw(); });
        // (The community is the server's: with none, a word that it's offline.)
        HeadButton("community", "db-people", right - iw - 8, () =>
        {
            if (Connection.Offline) { menu.Toast("Offline."); return; }
            community = true;
            csort = "popular";
            cq = cqText = "";
            LoadCommunity();
            Draw();
        });

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

    /// <summary>A page's header (builder.ts header, .setup-top 52 tall): ‹ back, and its title (.menu-heading) in the middle.</summary>
    void Header(string title, System.Action back)
    {
        float left = K.PadL, right = K.W - K.PadR, top = K.PadT;
        MenuView.BackButton(root, back, left, top + 13, false);
        float hf = K.Clamp(0.9f * K.Rem, 4 * K.Vh, 1.3f * K.Rem), hh = hf * 1.16f;
        K.Words(root, title, left, top + (52 - hh) / 2, right - left, hh, hf, Hud.Rgba(85, 90, 99), true, 500, 0.3f);
    }

    /// <summary>A header's button with its mark (.db-head-actions .btn-small: the mark 14 across, 11 in, 6 before its word), its right edge at `right`; returns its width.</summary>
    float HeadButton(string text, string icon, float right, System.Action act)
    {
        float w = K.BtnW(text, K.Kind.Small) + 20;
        var b = K.Btn(root, text, act, right - w, K.PadT + 11, K.Kind.Small, w, 30);
        b.GetComponentInChildren<TextMeshProUGUI>().margin = new Vector4(20, 0, 0, 0);
        Icon(b.transform, icon, new Vector2(0, 0.5f), new Vector2(18, 0), 14, Look.Ink);
        return w;
    }

    /// <summary>The list's column laid out from its top (into `content`; null only measures it); returns its height.</summary>
    float Lay(RectTransform content, float lx, float listW, List<Decks.Saved> mine, List<Decks.Saved> starters)
    {
        // (.db-modes: min(520px, the list) across, 70% white, corners 16, padded 4, 4 between; each mode padded 10 by
        // 14, corners 12, the picked one white and lifted: its picture 72 tall and 6 over (grey, the other), then 2
        // apart its name 12.48 spaced 0.24em (16 tall) and its line Exo 2 10.88 (13 tall).)
        float mw = Mathf.Min(520, listW), mh = 4 + 10 + 72 + 6 + 2 + 16 + 2 + 13 + 10 + 4;
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
                K.Words(bg.transform, Modes.GameModes[m].Name.ToUpperInvariant(), 14, 90, each - 28, 16, 12.48f, on ? Look.Ink : Look.InkSoft, true, 400, 0.24f);
                K.Words(bg.transform, Modes.GameModes[m].Blurb, 14, 108, each - 28, 13, 10.88f, Look.InkFaint, false, 400);
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
        float f = K.Big ? 8.96f : 8, h = note.Length > 0 ? 13 : f * 1.25f;
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
    /// 2.6vw, 28px) apart, padded 14 16 16 10), yours led by a new one, each its buttons (30 across, 5 apart, wrapping
    /// onto a row of their own past the box and its side) 6 under it; a row as tall as its tallest; returns where it
    /// ends (8 under it).
    /// </summary>
    float Boxes(RectTransform content, float lx, float listW, float y, List<Decks.Saved> decks, bool own)
    {
        int n = decks.Count + (own ? 1 : 0);
        float bw = ListBw, depth = bw * 0.08f, bh = bw / 0.72f, colGap = K.Clamp(16, 2.6f * K.Vw, 28), rowGap = K.Clamp(12, 3.5f * K.Vh, 22);
        float avail = listW - 26;
        int cols = Mathf.Max(1, Mathf.Min(n, Mathf.FloorToInt((avail + colGap) / (bw + colGap))));
        // (Each box's buttons: copy, and for your own share and delete too; the new deck's tile has none.)
        int Buttons(int i) => own && i == 0 ? 0 : own ? 3 : 1;
        int rows = (n + cols - 1) / cols;
        var rowH = new float[rows];
        for (int i = 0; i < n; i++) rowH[i / cols] = Mathf.Max(rowH[i / cols], depth + bh + ActionsH(Buttons(i), bw));
        float at = y + 14;
        for (int row = 0; row < rows; row++)
        {
            for (int col = 0; col < cols && row * cols + col < n && content != null; col++)
            {
                int i = row * cols + col;
                float x = lx + 10 + (avail - (cols * bw + (cols - 1) * colGap)) / 2 + col * (bw + colGap);
                if (own && i == 0) { NewTile(content, x, at + depth, bw); continue; }
                var d = decks[i - (own ? 1 : 0)];
                var buttons = new List<(string icon, string name, System.Action act, bool danger)>
                {
                    ("db-copy", "copy", () => { Open(d, null, Clip($"{d.Name} copy", 24)); Draw(); }, false),
                };
                if (own)
                {
                    buttons.Add(("db-share", "share", () => { panel = "share"; panelDeck = d.Id; noteText = ""; Draw(); }, false));
                    buttons.Add(("db-delete", "delete", () => { Decks.Delete(d.Id); Draw(); }, true));
                }
                // (Open it by tapping the box: a starter to look through, your own to edit.)
                DeckBox(content, x, at + depth, bw, d, () => { Open(d, own ? d.Id : null, d.Name); Draw(); }, buttons, own ? WishTag(d.Cards) : null);
            }
            at += rowH[row] + (row < rows - 1 ? rowGap : 0);
        }
        return at + 16 + 8;
    }

    /// <summary>How many of a box's round buttons fit on a row (.db-deck-actions: as wide as the box and its side).</summary>
    static int ActionsPerRow(float bw) => Mathf.Max(1, Mathf.FloorToInt((bw * 1.08f + 5) / 35));

    /// <summary>The room a box's `n` buttons take under it (6 down, rows of 30, 5 apart); none with none.</summary>
    static float ActionsH(int n, float bw)
    {
        if (n == 0) return 0;
        int per = ActionsPerRow(bw), rows = (n + per - 1) / per;
        return 6 + rows * 30 + (rows - 1) * 5;
    }

    /// <summary>A deck of your own that still needs cards you don't own: how many (else nothing).</summary>
    static string WishTag(List<string> cards)
    {
        int n = MissingCopies(cards).Sum(m => m.n);
        return n > 0 ? $"{n} to collect" : null;
    }

    /// <summary>The new deck's tile (.db-new-tile): a dashed place for a box, a slate plus (40 across) and its words in it.</summary>
    void NewTile(RectTransform parent, float x, float y, float bw)
    {
        float bh = bw / 0.72f;
        // (Its place: white at 0.45 inside a 1.5 px dashed edge, rgba(93, 106, 140, 0.45), corners of 10.)
        var box = Hud.Box(parent, "New deck", new Color(1, 1, 1, 0.001f), 10);
        Hud.Place(box.rectTransform, x, y, bw, bh);
        var edge = Hud.Rect(box.transform, "Dashed");
        Hud.Fill(edge);
        var ei = edge.gameObject.AddComponent<RawImage>();
        ei.texture = BoardArt.DashedBox(bw, bh, 10, new Color(1, 1, 1, 0.45f), Hud.Rgba(93, 106, 140, 0.45f), 1.5f);
        ei.raycastTarget = false;
        box.raycastTarget = true;
        box.gameObject.AddComponent<Button>().onClick.AddListener(() =>
        {
            Sound.Play("click");
            Open(new Decks.Saved { Name = "New deck", Cards = new List<string>(), Mode = gm }, null, "New deck");
            Draw();
        });
        // (Its plus, 40 across with its 25.6 "+", and its words (9.6, spaced 0.16em, 12 tall) 6 under it: the two
        // together in the tile's middle.)
        const float ps = 40;
        float py = (bh - (ps + 6 + 12)) / 2;
        var plus = Hud.Rect(box.transform, "Plus");
        Hud.Place(plus, (bw - ps) / 2, py, ps, ps);
        var pi = plus.gameObject.AddComponent<Image>();
        pi.sprite = Hud.Circle;
        pi.color = Hex("#5d6a8c");
        pi.raycastTarget = false;
        K.Fill(plus, "+", 25.6f, Color.white, false, 400).margin = new Vector4(0, 0, 0, 2);
        K.Words(box.transform, "NEW DECK", -10, py + ps + 6, bw + 20, 12, 9.6f, Look.InkSoft, true, 400, 0.16f);
    }

    /// <summary>
    /// A deck as a deck box (builder.ts deckBox): a little 3D box in its race's colour, its cover the hero of its most
    /// expensive Command card (its race's emblem if it has none), its name and races on the front, cards still to
    /// collect on a tag, its buttons (.deck-icon: round, 30 across, 5 apart) 6 beneath.
    /// </summary>
    void DeckBox(RectTransform parent, float x, float y, float bw, Decks.Saved d, System.Action open, List<(string icon, string name, System.Action act, bool danger)> buttons, string tagText)
    {
        var cell = DeckBoxMini(parent, x, y, d, false, open, bw, true);
        float bh = bw / 0.72f, depth = bw * 0.08f;
        if (DeckRules.DeckProblems(d.Cards, Modes.ModeOf(d)).Count > 0) cell.gameObject.AddComponent<CanvasGroup>().alpha = 0.7f;
        // Its tag (.deck-box-tag: cards still to collect, or how many of a shared deck's you own), 9% down the front:
        // white, round, 8.96 spaced 0.12em, padded 2 by 8.
        if (tagText != null)
        {
            string text = tagText.ToUpperInvariant();
            const float fs = 8.96f;
            float tw = K.TextW(text, fs, 400, 0.12f) + 16, th = fs * 1.25f + 4;
            var tag = Hud.Box(cell, "Tag", Color.white, th / 2);
            Hud.Place(tag.rectTransform, (bw - tw) / 2, bh * 0.09f, tw, th);
            Hud.Shadow(tag, th / 2, new Hud.Drop(Hud.Rgba(212, 149, 42, 0.55f), 0, 0, 1), new Hud.Drop(Hud.Rgba(60, 64, 80, 0.18f), 2, 6));
            K.Fill(tag.transform, text, fs, Hex("#a8641c"), true, 400, 0.12f);
        }
        // Its buttons, small and round, beneath (centred under the box and its side, a row at a time).
        int per = ActionsPerRow(bw);
        for (int i = 0; i < buttons.Count; i++)
        {
            var (icon, name, act, danger) = buttons[i];
            int row = i / per, inRow = Mathf.Min(per, buttons.Count - row * per);
            float bx = (bw + depth - (inRow * 30 + (inRow - 1) * 5)) / 2;
            var b = Hud.Rect(cell, name);
            Hud.Place(b, bx + (i % per) * 35, bh + 6 + row * 35, 30, 30);
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
        if (act != null) front.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); act(); });
        // (A deck box rustles like paper under a mouse: app.ts onHover.)
        front.raycastTarget = true;
        MenuHover.Rustle(front.gameObject);
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
            Hud.Ellipsis(nm);
            K.Words(front.transform, RacesLabel(d.Cards).ToUpperInvariant(), bw * 0.04f, contentBot - raceLH, bw * 0.92f, raceLH, raceF, new Color(1, 1, 1, 0.85f), false, 400, 0.2f);
        }
        else
        {
            var nm = K.Words(cell, d.Name.ToUpperInvariant(), -5, bh + 6, bw + 10, MiniLabel * 1.2f, MiniLabel, on ? Look.Ink : Look.InkFaint, true, 400, 0.1f);
            Hud.Ellipsis(nm);
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

    /// <summary>
    /// The page veiled and a modal over it (.overlay.overlay-soft &gt; .modal.db-confirm): white, corners 18, softly
    /// shadowed, swallowing taps (only its buttons close it), rising in. Laid out from its top-left; Finish sizes and
    /// centres it. (.overlay-soft: rgba(244, 244, 242, 0.45) over the page blurred 6.)
    /// </summary>
    RectTransform Modal()
    {
        var veil = Hud.Rect(root, "Veil");
        Hud.Fill(veil);
        veil.gameObject.AddComponent<Image>().color = new Color(244 / 255f, 244 / 255f, 242 / 255f, 0.45f);
        BackdropBlur.Blur(veil);
        veil.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        var card = Hud.Box(RiseIn.Modal(veil), "Card", Color.white, 18);
        Hud.Shadow(card, 18, new Hud.Drop(Hud.Rgba(120, 124, 134, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(80, 80, 100, 0.18f), 30, 80), new Hud.Drop(Hud.Rgba(80, 80, 100, 0.08f), 6, 18));
        card.raycastTarget = true;
        card.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        return card.rectTransform;
    }

    /// <summary>A modal `w` by `h`, in the middle of the page.</summary>
    static void Finish(RectTransform card, float w, float h) => Hud.Place(card, (K.W - w) / 2, (K.H - h) / 2, w, h);

    /// <summary>A modal's title (.db-confirm b: 12.8, spaced 0.16em, 16 tall), centred.</summary>
    static void Title(Transform card, string text, float x, float y, float w)
    {
        var t = K.Words(card, text.ToUpperInvariant(), x, y, w, 16, 12.8f, Look.Ink, true, 500, 0.16f);
        Hud.Ellipsis(t);
    }

    /// <summary>A paragraph (Exo 2, wrapping) at (x, y), `w` across; returns how tall it is.</summary>
    static float Para(Transform parent, string text, float x, float y, float w, float size, Color colour, TextAlignmentOptions align)
    {
        var t = K.Words(parent, text, x, y, w, size * 1.2f, size, colour, false, 400, 0, align);
        t.textWrappingMode = TextWrappingModes.Normal;
        float h = Mathf.Max(size * 1.2f, t.GetPreferredValues(text, w, 0).y);
        Hud.Place(t.rectTransform, x, y, w, h);
        return h;
    }

    /// <summary>
    /// A modal's buttons (.db-confirm-actions: 8 apart, centred in `w`, 34 tall): .btn (10.56, padded 16), the primary
    /// small one (.btn-primary.btn-small: 8.96 bold, padded 10), or .btn-danger (a .btn in red).
    /// </summary>
    static void Actions(Transform card, float y, float w, params (string text, int kind, System.Action act)[] buttons)
    {
        var widths = buttons.Select(b => b.kind == 1 ? K.BtnW(b.text, K.Kind.Primary, 8.96f, 0.14f, 10) : K.BtnW(b.text, K.Kind.Btn, 10.56f)).ToArray();
        float x = (w - (widths.Sum() + 8 * (buttons.Length - 1))) / 2;
        for (int i = 0; i < buttons.Length; i++)
        {
            var (text, kind, act) = buttons[i];
            var b = kind == 1
                ? K.Btn(card, text, act, x, y, K.Kind.Primary, widths[i], 34, 8.96f)
                : K.Btn(card, text, act, x, y, K.Kind.Btn, widths[i], 34, 10.56f);
            if (kind == 2) b.GetComponentInChildren<TextMeshProUGUI>().color = Hex("#b23c24");
            x += widths[i] + 8;
        }
    }

    /// <summary>
    /// A text box of a panel's (.db-panel textarea, .db-code; the community's search): #fbfcfe in a hairline of
    /// rgba(150, 164, 190, 0.5), corners `radius`, padded 8 by 10; `multiline` its words from the top, wrapping.
    /// </summary>
    static TMP_InputField Field(Transform parent, string text, float x, float y, float w, float h, int limit, bool multiline, string placeholder, float size, float radius = 10, float padX = 10, Color? fill = null)
    {
        var box = K.Inset(parent, "Input", fill ?? Hex("#fbfcfe"), Hud.Rgba(150, 164, 190, 0.5f), radius);
        Hud.Place(box.rectTransform, x, y, w, h);
        box.raycastTarget = true;
        var area = Hud.Rect(box.transform, "Text Area");
        Hud.Fill(area);
        area.offsetMin = new Vector2(1 + padX, multiline ? 9 : 1);
        area.offsetMax = new Vector2(-1 - padX, multiline ? -9 : -1);
        area.gameObject.AddComponent<RectMask2D>();
        var align = multiline ? TextAlignmentOptions.TopLeft : TextAlignmentOptions.Left;
        var hint = placeholder.Length > 0 ? K.Fill(area, placeholder, size, Look.InkFaint, false, 400, 0, align) : null;
        var t = K.Fill(area, text, size, Look.Ink, false, 400, 0, align);
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

    /// <summary>
    /// The panel over the deck list (builder.ts renderPanel, .db-panel: 440 across, padded 18 by 22, its parts 10
    /// apart): importing a deck code, or sharing one of your decks (its code, and the community).
    /// </summary>
    void Panel()
    {
        const float w = 440, x = 23, iw = w - 46;
        System.Action shut = () => { panel = null; Draw(); };
        if (panel == "import")
        {
            var card = Modal();
            float y = 19;
            Title(card, "import a deck", x, y, iw);
            y += 16 + 10;
            y += Para(card, "Paste a deck code (it starts with BL1-). The deck joins your decks; any cards you don't own yet show as still to collect.", x, y, iw, 11.84f, Look.InkSoft, TextAlignmentOptions.TopLeft) + 10;
            // (Three rows of the code's monospace 10.56.)
            var input = Field(card, codeText, x, y, iw, 54, 4000, true, "BL1-…", 10.56f);
            input.onValueChanged.AddListener(s => codeText = s);
            y += 54 + 10;
            Actions(card, y, w, ("cancel", 0, shut), ("import", 1, () =>
            {
                var got = DecodeDeck(codeText);
                if (got == null) { menu.Toast("Not a deck code"); return; }
                if (got.Value.cards.Count == 0) { menu.Toast("No playable cards in that deck"); return; }
                panel = null;
                KeepDeck(got.Value.name, got.Value.cards);
                Draw();
            }));
            Finish(card, w, y + 34 + 19);
            return;
        }
        var d = Decks.ById(panelDeck);
        if (d == null || d.Preset == true) { panel = null; return; }
        var why = ShareProblem(d);
        var c = Modal();
        float at = 19;
        Title(c, $"share {d.Name.ToLowerInvariant()}", x, at, iw);
        at += 16 + 10;
        at += Para(c, "Its deck code: anyone can paste it into their decks page to get this deck.", x, at, iw, 11.84f, Look.InkSoft, TextAlignmentOptions.TopLeft) + 10;
        // Its code (.db-code-row: the code read-only, copy 6 after it).
        var code = EncodeDeck(d.Name, d.Cards);
        float copyW = K.BtnW("copy", K.Kind.Small);
        var codeBox = Field(c, code, x, at, iw - 6 - copyW, 30, 4000, false, "", 10.56f);
        codeBox.readOnly = true;
        K.Btn(c, "copy", () => GUIUtility.systemCopyBuffer = code, x + iw - copyW, at + 1.5f, K.Kind.Small, copyW, 27);
        at += 30 + 10 + 6;
        // Sharing it with the community (.section-label, 6 more above it), or why it can't be.
        K.Words(c, "SHARE WITH THE COMMUNITY", x, at, iw, 10, 8, Look.InkSoft, true, 400, 0.3f, TextAlignmentOptions.Left);
        at += 10 + 10;
        if (why != null) at += Para(c, why, x, at, iw, 11.84f, Look.InkSoft, TextAlignmentOptions.TopLeft) + 10;
        else
        {
            var name = string.IsNullOrEmpty(Profile.Me.Name) ? "Commander" : Profile.Me.Name;
            at += Para(c, $"Anyone can find it on the community page and save a copy, credited to <b>{name}</b>.", x, at, iw, 11.84f, Look.InkSoft, TextAlignmentOptions.TopLeft) + 10;
            // (A note, two rows of 11.84.)
            var note = Field(c, noteText, x, at, iw, 46, 160, true, "A note: what it does, how to play it (optional)", 11.84f);
            note.onValueChanged.AddListener(s => noteText = s);
            at += 46 + 10;
        }
        if (why != null) Actions(c, at, w, ("close", 0, shut));
        else Actions(c, at, w, ("close", 0, shut), ("share", 1, () => Publish(d)));
        Finish(c, w, at + 34 + 19);
    }

    /// <summary>Why a deck can't be shared with the community (null if it can): unfinished, or a starter as it comes.</summary>
    static string ShareProblem(Decks.Saved d)
    {
        if (d.Preset == true) return "Starter decks can’t be shared.";
        var why = DeckRules.DeckProblems(d.Cards, Modes.ModeOf(d)).FirstOrDefault();
        if (why != null) return $"Finish the deck to share it: {why}";
        var key = CardsKey(d.Cards);
        if (Decks.Presets.Any(s => CardsKey(s.Cards) == key)) return "This is a starter deck as it comes: change it to make it your own, then share it.";
        return null;
    }

    /// <summary>Share a deck with the community (the server's: the same cards again update the one already shared).</summary>
    void Publish(Decks.Saved d)
    {
        var why = ShareProblem(d);
        if (why != null) { menu.Toast(why); return; }
        var name = string.IsNullOrEmpty(Profile.Me.Name) ? "Commander" : Profile.Me.Name;
        Net.Api("decks", "POST", new JObject { ["name"] = d.Name, ["cards"] = new JArray(d.Cards), ["note"] = noteText, ["author"] = name }, r =>
        {
            if (this == null) return;
            if (!r.Ok) { menu.Toast(r.Error); return; }
            panel = null;
            if (community) LoadCommunity();
            Draw();
        });
    }

    // ---- The community's decks: shared lists to look through and save, credited to who shared them ----

    /// <summary>Fetch the community's decks for the page as it's set (most saved, newest, or yours; matching the search).</summary>
    void LoadCommunity()
    {
        cdecks = null;
        cerror = null;
        string sort = csort, q = cq;
        var path = $"decks?sort={(sort == "new" ? "new" : "popular")}&q={System.Uri.EscapeDataString(q)}{(sort == "mine" ? "&mine=1" : "")}";
        Net.Api(path, "GET", null, r =>
        {
            if (this == null || !community || csort != sort || cq != q) return;
            cdecks = new List<CommunityDeck>();
            if (!r.Ok) cerror = r.Error;
            else if (r.Data["decks"] is JArray list)
                foreach (var e in list.OfType<JObject>())
                    cdecks.Add(new CommunityDeck
                    {
                        Id = (string)e["id"] ?? "",
                        Name = (string)e["name"] ?? "",
                        Author = (string)e["author"] ?? "",
                        Note = (string)e["note"] ?? "",
                        Cards = (e["cards"] as JArray)?.Select(x => (string)x).Where(x => x != null).ToList() ?? new List<string>(),
                        Saves = (int?)e["saves"] ?? 0,
                        Mine = (bool?)e["mine"] ?? false,
                    });
            if (editing == null && panel == null) Draw();
        });
    }

    /// <summary>
    /// The community page (builder.ts renderCommunity): its header, a bar (.db-community-bar, padded 6 16 0 10: the
    /// sorts as pills 6 apart, the picked one slate; the search (220 across, round) and its button on the right), a
    /// hint, and the decks as boxes (.db-cboxes: --bw clamp(96px, 28vh, 150px), clamp(28px, 4vw, 44px) by 28 apart),
    /// each with who shared it and how many saved it, its note, and save (and unshare, your own).
    /// </summary>
    void Community()
    {
        Header("COMMUNITY DECKS", () => { community = false; Draw(); });
        float left = K.PadL, right = K.W - K.PadR, top = K.PadT;
        float bodyTop = top + 52 + K.Clamp(6, 2 * K.Vh, 14), listW = Mathf.Min(980, right - left), lx = (left + right - listW) / 2;
        var tabs = new[] { ("popular", "most saved"), ("new", "newest"), ("mine", "shared by me") };
        float tx = lx + 10, by = bodyTop + 6;
        foreach (var (key, label) in tabs)
        {
            float tw = K.BtnW(label, K.Kind.Pill);
            var b = K.Btn(root, label, () => { csort = key; LoadCommunity(); Draw(); }, tx, by + 2.5f, K.Kind.Pill, tw, 23);
            if (csort == key)
            {
                ((Image)b.targetGraphic).color = Hex("#2f3a52");
                b.GetComponentInChildren<TextMeshProUGUI>().color = Color.white;
            }
            tx += tw + 6;
        }
        float sw = K.BtnW("search", K.Kind.Small), sx = lx + listW - 16 - sw;
        System.Action search = () => { cq = cqText.Trim(); LoadCommunity(); Draw(); };
        K.Btn(root, "search", search, sx, by + 0.5f, K.Kind.Small, sw, 27);
        float iw = Mathf.Min(220, 0.5f * K.W);
        var input = Field(root, cqText, sx - 6 - iw, by, iw, 28, 40, false, "search names and players", 11.84f, 14, 12, Color.white);
        input.onValueChanged.AddListener(s => cqText = s);
        input.onSubmit.AddListener(_ => search());

        // (Measured first, to size the scroller: laid out a second time into it.)
        float end = LayCommunity(null, lx, listW);
        var content = K.Scroller(root, "List", 0, by + 28, K.W, K.H - by - 28, end);
        LayCommunity(content, lx, listW);
    }

    /// <summary>The community page under its bar: the hint (8 under it), then what there is; returns its height.</summary>
    float LayCommunity(RectTransform content, float lx, float listW)
    {
        var parent = content != null ? (Transform)content : root;
        float y = 8;
        // (.db-chint: Exo 2 11.2, muted, 8 16 0 10 about it.)
        var hint = "Save a deck to keep it with your own. Cards you don't own yet show as still to collect: craft them with flux or find them in boosters, and the deck is yours to play.";
        float hh = Para(parent, hint, lx + 10, y, listW - 26, 11.2f, Look.InkFaint, TextAlignmentOptions.TopLeft);
        if (content == null) Mats.Kill(parent.GetChild(parent.childCount - 1).gameObject);
        y += hh;
        string words = cdecks == null ? "Loading…" : cerror ?? (cdecks.Count > 0 ? null
            : csort == "mine" ? "You haven’t shared a deck yet. Share one from your decks page."
            : cq.Length > 0 ? "No shared decks match that." : "No decks shared yet. Be the first: share one from your decks page.");
        if (words != null)
        {
            // (.muted.center-text: 12.8, a paragraph's 1em margin above it.)
            y += 8 + 12.8f;
            float ph = content != null ? Para(content, words, lx, y, listW, 12.8f, Look.InkFaint, TextAlignmentOptions.Top) : 16;
            return y + ph + 12.8f + Mathf.Max(18, K.SaB);
        }
        // The decks (.db-boxes.db-cboxes, padded 14 16 16 10).
        float bw = K.Clamp(96, 28 * K.Vh, 150), depth = bw * 0.08f, bh = bw / 0.72f, colGap = K.Clamp(28, 4 * K.Vw, 44);
        float avail = listW - 26;
        int cols = Mathf.Max(1, Mathf.Min(cdecks.Count, Mathf.FloorToInt((avail + colGap) / (bw + colGap))));
        float at = y + 8 + 14;
        for (int row = 0; row * cols < cdecks.Count; row++)
        {
            float rowH = 0;
            for (int col = 0; col < cols && row * cols + col < cdecks.Count; col++)
            {
                var deck = cdecks[row * cols + col];
                float x = lx + 10 + (avail - (cols * bw + (cols - 1) * colGap)) / 2 + col * (bw + colGap);
                rowH = Mathf.Max(rowH, CommunityBox(content, deck, x, at, bw));
            }
            at += rowH + 28;
        }
        return at - 28 + 16 + Mathf.Max(18, K.SaB);
    }

    /// <summary>
    /// A shared deck (.db-cdeck: its parts 6 apart): its box (tagged with how many of its cards you own), who shared
    /// it and how many saved it (.db-credit: 10.24, 20 more above it), its note (.db-cnote: 9.92), and save (and
    /// unshare, if it's yours) as pills. Returns its height (`content` null: only measures it).
    /// </summary>
    float CommunityBox(RectTransform content, CommunityDeck x, float left, float top, float bw)
    {
        float depth = bw * 0.08f, bh = bw / 0.72f, y = depth + bh + 6 + 20;
        int missing = MissingCopies(x.Cards).Sum(m => m.n);
        string tag = missing > 0 ? $"{x.Cards.Count - missing}/{x.Cards.Count} owned" : "all owned";
        if (content != null)
        {
            var d = new Decks.Saved { Id = x.Id, Name = x.Name, Cards = x.Cards };
            DeckBox(content, left, top + depth, bw, d, () =>
            {
                fromCommunity = x.Mine ? null : x.Id;
                Open(new Decks.Saved { Name = x.Name, Cards = x.Cards.ToList(), Mode = GuessMode(x.Cards) }, null, x.Name);
                Draw();
            }, new List<(string, string, System.Action, bool)>(), tag);
            // (Who shared it, bold in ink; ★ and how many saved it.)
            K.Words(content, $"<b><color={Html(Look.Ink)}>by {x.Author}</color></b>   ★ {x.Saves}", left - 30, top + y, bw + 60, 12.3f, 10.24f, Look.InkSoft, false, 400);
        }
        y += 12.3f + 6;
        if (x.Note.Length > 0)
        {
            float nh = content != null ? Para(content, x.Note, left, top + y, bw, 9.92f, Look.InkSoft, TextAlignmentOptions.Top) : MeasureNote(x.Note, bw);
            y += nh + 6;
        }
        if (content != null)
        {
            var pills = new List<(string, System.Action)> { ("save", () => SaveShared(x)) };
            if (x.Mine) pills.Add(("unshare", () => Unshare(x)));
            float total = pills.Sum(p => K.BtnW(p.Item1, K.Kind.Pill)) + 5 * (pills.Count - 1), px = left + (bw - total) / 2;
            foreach (var (label, act) in pills)
            {
                float pw = K.BtnW(label, K.Kind.Pill);
                K.Btn(content, label, act, px, top + y, K.Kind.Pill, pw, 23);
                px += pw + 5;
            }
        }
        return y + 23;
    }

    /// <summary>How tall a shared deck's note stands (9.92, wrapping in `w`).</summary>
    float MeasureNote(string note, float w)
    {
        float h = Para(root, note, 0, 0, w, 9.92f, Look.InkSoft, TextAlignmentOptions.Top);
        Mats.Kill(root.GetChild(root.childCount - 1).gameObject);
        return h;
    }

    /// <summary>Keep a shared deck among your own (counting the save, once per player), unless you have it already.</summary>
    void SaveShared(CommunityDeck x)
    {
        var key = CardsKey(x.Cards);
        if (Decks.Custom().Any(d => CardsKey(d.Cards) == key)) { menu.Toast("Already in your decks"); return; }
        CountSave(x.Id);
        x.Saves += x.Mine ? 0 : 1;
        KeepDeck(x.Name, x.Cards);
        Draw();
    }

    /// <summary>Count a save of a shared deck (once per player). Never in the way: a failure is dropped.</summary>
    static void CountSave(string id) => Net.Api("decks/save", "POST", new JObject { ["id"] = id }, _ => { });

    /// <summary>Take a deck you shared down (copies others saved stay theirs).</summary>
    void Unshare(CommunityDeck x) => Net.Api("decks/remove", "POST", new JObject { ["id"] = x.Id }, r =>
    {
        if (this == null) return;
        if (!r.Ok) { menu.Toast(r.Error); return; }
        cdecks?.Remove(x);
        Draw();
    });

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
    /// <summary>
    /// The view's card size (.db-pool --dbw: small clamp(70px, 9vw, 104px), medium clamp(108px, 14vw, 156px), large
    /// clamp(150px, 22vw, 230px)): it sets the pool's padding and row gap, and the count's size.
    /// </summary>
    float Dbw => grid == "sm" ? K.Clamp(70, 9 * K.Vw, 104) : grid == "lg" ? K.Clamp(150, 22 * K.Vw, 230) : K.Clamp(108, 14 * K.Vw, 156);
    /// <summary>
    /// The pool's padding (.db-editor .db-pool: max(10px, 11% of --dbw) on top for the jewels standing above the cards,
    /// 4 at the sides, max(18px, the safe area) at its foot), and its gaps (10 across, small cards 6; max(12px, 12% of
    /// --dbw) down).
    /// </summary>
    float PoolPadT => Mathf.Max(10, Dbw * 0.11f);
    static float PoolPadB => Mathf.Max(18, K.SaB);
    float ColGap => grid == "sm" ? 6 : 10;
    float RowGap => Mathf.Max(12, Dbw * 0.12f);
    /// <summary>A pool too short for its rows (the web's db-short: under 300 tall inside its padding, a phone on its side).</summary>
    bool ShortPool => PoolH - PoolPadT - PoolPadB < 300;
    /// <summary>The search's right edge (.db-search: up to 300 across, leaving the rest of the toolbar room).</summary>
    static float SearchR => PoolX + Mathf.Min(300, PoolW - 30 - 8 - 62 - 16);

    void Editor()
    {
        Toolbar();
        poolArea = Hud.Rect(root, "Pool");
        Hud.Place(poolArea, PoolX, PoolTop, PoolW, PoolH);
        // (A swipe across the pool turns its page, left to the next: builder.ts swipe.)
        Swipe.On(poolArea.gameObject, dx =>
        {
            int pages = Mathf.Max(1, Pages().Count);
            if (pages <= 1) return;
            int to = Mathf.Clamp(pageAt + (dx < 0 ? 1 : -1), 0, pages - 1);
            if (to == pageAt) return;
            Sound.Play("click");
            pageAt = to;
            RefreshPool();
        });
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
            // (.db-confirm: min(380px, 92vw) across (a modal's least), padded 18 by 22, its title, words and buttons 10
            // apart, centred.)
            float w = Mathf.Min(380, 92 * K.Vw), iw = w - 46;
            var card = Modal();
            Title(card, "leave without saving?", 23, 19, iw);
            float y = 19 + 16 + 10;
            y += Para(card, $"Your changes to {(string.IsNullOrEmpty(editing.Name) ? "this deck" : editing.Name)} will be lost.", 23, y, iw, 11.84f, Look.InkSoft, TextAlignmentOptions.Top) + 10;
            Actions(card, y, w, ("keep editing", 0, () => { confirmExit = false; Draw(); }), ("leave", 2, () => { confirmExit = false; editing = starter = null; Draw(); }));
            Finish(card, w, y + 34 + 19);
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
        // (.db-filter-btn: a hairline of #e6e8ee; open or set, #c9cfdd and its mark in ink; open, a soft ring 3 round it.)
        var edge = new Hud.Drop(filtersOpen || set > 0 ? Hex("#c9cfdd") : Hex("#e6e8ee"), 0, 0, 1);
        if (filtersOpen) Hud.Shadow(fb, 15, edge, new Hud.Drop(Hud.Rgba(150, 165, 200, 0.18f), 0, 0, 3));
        else Hud.Shadow(fb, 15, edge);
        fb.raycastTarget = true;
        fb.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); filtersOpen = !filtersOpen; dropOpen = null; Draw(); });
        Icon(fb.transform, "db-filter", new Vector2(0.5f, 0.5f), Vector2.zero, 15, filtersOpen || set > 0 ? Look.Ink : Look.InkSoft);
        if (set > 0)
        {
            // (.db-filter-n: how many are set, 7.2 on slate, at least 15 across, 5 past the button's corner, a white ring.)
            string n = set.ToString();
            float nw = Mathf.Max(15, K.TextW(n, 7.2f, 400) + 8);
            var dot = Hud.Box(fb.transform, "Set", Hex("#5d6a8c"), 7.5f);
            Hud.At(dot.rectTransform, new Vector2(1, 1), new Vector2(5, 5), new Vector2(nw, 15));
            Hud.Shadow(dot, 7.5f, new Hud.Drop(Color.white, 0, 0, 1.5f));
            K.Fill(dot.transform, n, 7.2f, Color.white, true, 400);
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
    /// under 300 tall inside its padding, a phone on its side), the cards sized to the pool's height for them (1.52 of
    /// their width a row, for the jewels standing above them), as many columns as then fit across.
    /// </summary>
    (int cols, int rows, float w, float h) Layout()
    {
        int rows = Mathf.Max(1, (grid == "sm" ? 3 : grid == "lg" ? 1 : 2) - (ShortPool ? 1 : 0));
        float gap = ColGap, width = PoolW - 8, height = PoolH - PoolPadT - PoolPadB;
        float w = Mathf.Floor((height - (rows - 1) * RowGap) / rows / 1.52f * 10) / 10;
        int cols = Mathf.Max(1, Mathf.FloorToInt((width + gap) / (w + gap)));
        if (cols * w + (cols - 1) * gap > width) w = Mathf.Floor((width - (cols - 1) * gap) / cols * 10) / 10;
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
        // (None: p.muted, Exo 2 12.8 in ink-faint at the pool's top left, inside its padding and a paragraph's 1em margin.)
        if (shown.Count == 0) K.Words(poolArea, "No cards match these filters.", 4, PoolPadT + 12.8f, PoolW - 8, 15.4f, 12.8f, Look.InkFaint, false, 400, 0, TextAlignmentOptions.TopLeft);
        int used = Mathf.Max(1, (shown.Count + cols - 1) / cols);
        float gap = ColGap, rowGap = RowGap;
        // (The page's cards in the middle of the pool inside its padding: .db-editor .db-pool's justify- and align-content.)
        float top = PoolPadT + (PoolH - PoolPadT - PoolPadB - (used * h + (used - 1) * rowGap)) / 2;
        float left = 4 + (PoolW - 8 - (cols * w + (cols - 1) * gap)) / 2;
        for (int i = 0; i < shown.Count; i++)
        {
            var c = shown[i];
            var at = new Vector2(left + (i % cols) * (w + gap), -top - (i / cols) * (h + rowGap));
            Tile(c, at, w, h);
        }
        Pager();
    }

    /// <summary>
    /// A card of the pool (.db-card): its face, as printed (its attack and stability jewels); in the deck, a ring of
    /// its kind's colour (75% on white), picked to craft, #9fb4ff (2 round it, a soft shadow under it); not owned,
    /// greyed under a pale veil. Its count (.db-have: copies in the deck of copies owned, 3.5% down and 4% in,
    /// max(6px, 4.5% of --dbw), padded 1 by 4; tap it to craft) and a corner to read it large (.db-zoom: 22 across, 5%
    /// in, as on a touch screen).
    /// </summary>
    void Tile(CardDef c, Vector2 at, float w, float h)
    {
        var id = c.Id;
        int n = Count(editing.Cards, id), have = Profile.Owned(id);
        var kc = Look.Kind.TryGetValue(ShownKind(c), out var kcol) ? kcol : Look.Ink;
        var cell = Hud.Rect(poolArea, id);
        Hud.At(cell, new Vector2(0, 1), at, new Vector2(w, h));
        var face = Hud.Rect(cell, "Face");
        Hud.Fill(face);
        var img = face.gameObject.AddComponent<RawImage>();
        // (.db-card > .card: a card on its own, as wide as its tile.)
        img.texture = Faces.Of(id, Faces.Look.Card, w);
        img.color = have > 0 ? Color.white : new Color(0.88f, 0.88f, 0.89f);
        if (focus == id || n > 0)
            Hud.Shadow(img, w * 0.06f, new Hud.Drop(focus == id ? Hex("#9fb4ff") : Mix(kc, 0.75f, Color.white), 0, 0, 2), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.15f), 5, 16));
        var b = face.gameObject.AddComponent<Button>();
        var colours = b.colors;
        colours.highlightedColor = new Color(0.97f, 0.97f, 1f);
        b.colors = colours;
        // (Read large by a right-click, or a press held on a touch screen: the tap that ends that adds nothing.)
        var press = CardPress.On(face.gameObject, () => menu.Zoom(id));
        b.onClick.AddListener(() => { if (!press.Swallow()) Add(id); });
        Printed(cell, id, w, true);
        if (have <= 0)
        {
            // (.db-card-locked: the card greyed and a veil of rgba(248, 248, 250, 0.55) over it.)
            var veil = Hud.Box(cell, "Locked", Hud.Rgba(248, 248, 250, 0.55f), w * 0.06f);
            Hud.Fill(veil.rectTransform);
        }
        // Copies in the deck of copies owned: tap to craft or break down.
        float fs = Mathf.Max(6, Dbw * 0.045f);
        var badgeText = $"{n}/{have}";
        float bw = K.TextW(badgeText, fs, 400, 0.04f) + 8, bh = fs * 1.2f + 2;
        var badge = Hud.Box(cell, "Have", n > 0 ? kc : new Color(1, 1, 1, 0.94f), bh / 2);
        Hud.Place(badge.rectTransform, w * 0.04f, h * 0.035f, bw, bh);
        Hud.Shadow(badge, bh / 2, n > 0 ? new Hud.Drop(Color.white, 0, 0, 2) : new Hud.Drop(Hud.Rgba(150, 160, 185, 0.35f), 0, 0, 1), new Hud.Drop(Hud.Rgba(80, 84, 100, n > 0 ? 0.2f : 0.18f), 1, 4));
        badge.raycastTarget = true;
        badge.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); focus = focus == id ? null : id; Draw(); });
        K.Fill(badge.transform, badgeText, fs, n > 0 ? Color.white : have > 0 ? Look.InkFaint : Hex("#6d6fd0"), true, 400, 0.04f);
        // Read it large (⤢: a stroke corner to corner, an arrowhead at each end). Shown with the pointer over the card
        // (0.15 s), and always on a touch screen, which has no hover (.db-zoom).
        // (In a layer of its own, so its shadow fades with it; faded out, it still takes a tap, as opacity 0 does.)
        var layer = Hud.Rect(cell, "Corner");
        Hud.Fill(layer);
        var fade = Fade.On(layer.gameObject, Hoverless);
        var zoom = Hud.Rect(layer, "Zoom");
        Hud.Place(zoom, w * 0.95f - 22, h * 0.05f, 22, 22);
        var zi = zoom.gameObject.AddComponent<Image>();
        zi.sprite = Hud.Circle;
        zi.color = new Color(1, 1, 1, 0.92f);
        Hud.Shadow(zi, 11, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.25f), 1, 4));
        zoom.gameObject.AddComponent<Button>().onClick.AddListener(() => menu.Zoom(id));
        // (The card rustles as the pointer comes onto it.)
        MenuHover.Rustle(face.gameObject, on => fade.Shown = on || Hoverless);
        MenuHover.On(zoom.gameObject, on => fade.Shown = on || Hoverless, null, null);
        Stroke(zoom, new Vector2(11, 11), 9.5f, 1, 45, Look.InkSoft);
        foreach (var (corner, dir) in new[] { (new Vector2(14.4f, 7.6f), 1), (new Vector2(7.6f, 14.4f), -1) })
        {
            // (Each head: two strokes 3.2 long from its tip, back along each axis.)
            Stroke(zoom, corner + new Vector2(-dir * 1.6f, 0), 3.2f, 1, 0, Look.InkSoft);
            Stroke(zoom, corner + new Vector2(0, dir * 1.6f), 3.2f, 1, 90, Look.InkSoft);
        }
    }

    /// <summary>A screen with no hover, a phone's or a tablet's (@media (hover: none)): the corners to read a card large always shown.</summary>
    static bool Hoverless => Application.isMobilePlatform;

    RectTransform peek;

    /// <summary>
    /// A deck row under a mouse (app.ts onHover, showPeek): its card shown large (--pw: 0.7 × min(420px, the page less
    /// 24), 0.714 of that across) left of the deck's panel, 14 off it, level with the row (kept 8 inside the page), what
    /// it carries explained to its left (.card-preview .kw-wrap: 220 across, 12 off, no taller than the card); easing
    /// in (0.12 s, from 95%). Taking no taps. `id` null: none.
    /// </summary>
    void Peek(string id, RectTransform row)
    {
        if (peek != null) Mats.Kill(peek.gameObject);
        peek = null;
        if (id == null || row == null || root == null) return;
        float pw = Mathf.Min(420, K.H - 24) * 0.7f * 0.714f, ph = pw * 1.4f;
        var c = new Vector3[4];
        row.GetWorldCorners(c);
        float mid = root.rect.yMax - (root.InverseTransformPoint(c[0]).y + root.InverseTransformPoint(c[1]).y) / 2;
        float x = Mathf.Max(8, K.W - K.PadR - SideW - pw - 14), y = Mathf.Max(8, Mathf.Min(K.H - ph - 8, mid - ph / 2));
        peek = Hud.Rect(root, "Peek");
        Hud.Place(peek, x, y, pw, ph);
        var g = peek.gameObject.AddComponent<CanvasGroup>();
        g.blocksRaycasts = false;
        g.interactable = false;
        var face = Hud.Rect(peek, "Card");
        Hud.Fill(face);
        var img = face.gameObject.AddComponent<RawImage>();
        img.texture = Faces.Of(id, false);
        img.raycastTarget = false;
        Printed(face, id, pw);
        var rows = Explain(id);
        if (rows.Count > 0)
        {
            var (panel, eh) = ExplainPanel(peek, rows, 220, ph, true);
            Hud.Place(panel, -12 - 220, 0, 220, eh);
        }
        peek.gameObject.AddComponent<PopIn>();
    }

    /// <summary>A straight stroke `length` long and `width` thick, its middle at (x, y) from its parent's top left, turned `degrees` (anticlockwise as drawn).</summary>
    static void Stroke(RectTransform parent, Vector2 mid, float length, float width, float degrees, Color colour)
    {
        var r = Hud.Rect(parent, "Stroke");
        r.anchorMin = r.anchorMax = new Vector2(0, 1);
        r.pivot = new Vector2(0.5f, 0.5f);
        r.anchoredPosition = new Vector2(mid.x, -mid.y);
        r.sizeDelta = new Vector2(length, width);
        r.localRotation = Quaternion.Euler(0, 0, degrees);
        var img = r.gameObject.AddComponent<Image>();
        img.color = colour;
        img.raycastTarget = false;
    }

    /// <summary>A card not in play's attack and stability jewels as printed (glyphs.ts stabilityBadge), on its face `w` wide.</summary>
    /// <remarks>`sized`: on a face baked for its width, the stones where the web sets them on a card that wide (Faces.At).</remarks>
    static void Printed(RectTransform face, string defId, float w, bool sized = false)
    {
        var def = Cards.Def(defId);
        if (!Game.Persists(defId) || Cards.IsBurst(def)) return;
        void Badge(Faces.Place at, string kind, int n)
        {
            var r = Hud.Rect(face, kind);
            Hud.Place(r, at.x * w, at.y * w, at.w * w, at.h * w);
            var img = r.gameObject.AddComponent<RawImage>();
            img.texture = Faces.Badge(kind, n);
            img.raycastTarget = false;
        }
        int atk = Game.BaseAttack(def);
        if (atk > 0) Badge(sized ? Faces.At("atk", w, false) : Faces.OnFace("atk"), "atk", atk);
        Badge(sized ? Faces.At("stab", w, false) : Faces.OnFace("stab"), "stab", Game.BaseHealth(defId));
    }

    /// <summary>
    /// The page buttons beneath the pool (.db-pager; none with a single page): back and on (30 across, round, white in
    /// a hairline of #e4e1dc, a chevron 12 across stroked 1.8; faded to 35% at either end), 10 apart, a dot for each
    /// page between them (7 across, 6 apart, #d6d3ce; the page shown in ink, a quarter larger), or, with 13 or more,
    /// its number (Exo 2 13.33, #8a8f99).
    /// </summary>
    void Pager()
    {
        int pages = Mathf.Max(1, Pages().Count);
        if (pages <= 1) return;
        bool dots = pages < 13;
        float mid = dots ? pages * 7 + (pages - 1) * 6 : K.TextW($"{pageAt + 1} / {pages}", 13.33f, 400, 0, false);
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
            if (!can) arrow.gameObject.AddComponent<CanvasGroup>().alpha = 0.35f;
            var ab = arrow.gameObject.AddComponent<Button>();
            ab.transition = Selectable.Transition.None;
            ab.interactable = can;
            ab.onClick.AddListener(() => { Sound.Play("click"); pageAt = Mathf.Clamp(pageAt + step, 0, pages - 1); RefreshPool(); });
            // (Its chevron: M7.5 2.5 4 6l3.5 3.5 in 12, the other way for on.)
            float k = 12f / 12, tipX = 15 + step * 2 * k;
            Stroke(arrow, new Vector2(tipX - step * 1.75f * k, 15 - 1.75f * k), 4.95f * k + 1.2f, 1.8f, step * -45, Look.Ink);
            Stroke(arrow, new Vector2(tipX - step * 1.75f * k, 15 + 1.75f * k), 4.95f * k + 1.2f, 1.8f, step * 45, Look.Ink);
        }
        if (!dots)
        {
            K.Words(pagerArea, $"{pageAt + 1} / {pages}", cx - mid / 2 - 4, 0, mid + 8, 30, 13.33f, Hex("#8a8f99"), false, 400);
            return;
        }
        for (int i = 0; i < pages; i++)
        {
            int to = i;
            bool on = i == pageAt;
            var dot = K.Hit(pagerArea, $"Page {i + 1}", () => { pageAt = to; RefreshPool(); }, false);
            Hud.Place((RectTransform)dot.transform, cx - mid / 2 + i * 13 - 3, 4, 13, 22);
            var mark = Hud.Rect(dot.transform, "Dot");
            Hud.At(mark, new Vector2(0.5f, 0.5f), Vector2.zero, on ? new Vector2(8.75f, 8.75f) : new Vector2(7, 7));
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
    void Craft(string id)
    {
        // (The server's to do, which keeps the collection: never without a connection.)
        if (Connection.Lost) { menu.Toast("Offline."); return; }
        EconomyCalls.Craft(id, Crafted);
    }

    /// <summary>Break a copy of a card down for flux (builder.ts db-break): starter cards can't be.</summary>
    void BreakDown(string id)
    {
        if (Connection.Lost) { menu.Toast("Offline."); return; }
        EconomyCalls.BreakDown(id, Crafted);
    }

    void Crafted(string why)
    {
        if (this == null) return;
        if (why != null) menu.Toast(why);
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
        bool dup = Decks.Custom().Any(x => x.Id != d.Id && CardsKey(x.Cards) == CardsKey(d.Cards));
        Decks.Save(d);
        // (Opened from a shared deck: its save counts towards it.)
        if (fromCommunity != null && !dup) CountSave(fromCommunity);
        fromCommunity = null;
        var shortBy = ToCollect(d.Cards);
        if (shortBy.Length > 0) menu.Toast(shortBy);
        editing = starter = null;
        Draw();
    }

    // ---- The deck: its name, its count, the craft panel, its cards, exit and save ----

    /// <summary>
    /// The deck's side (.db-deck-side): clamp(170px, 26vw, 290px) across down the right, max(12px, the safe area) off
    /// the foot; white at 70% in a white hairline, corners 14, padded 10, its parts 8 apart: its name (.db-name, 28
    /// tall) and mode chip, the count, the craft panel's place (8 apart even when empty), its cards (scrolling), exit
    /// and save.
    /// </summary>
    void Side()
    {
        var d = editing;
        float sw = SideW, sx = K.W - K.PadR - sw, sy = K.PadT, sh = K.H - sy - Mathf.Max(12, K.SaB);
        var side = Hud.Box(root, "Deck", new Color(1, 1, 1, 0.7f), 14);
        Hud.Place(side.rectTransform, sx, sy, sw, sh);
        Hud.Shadow(side, 14, new Hud.Drop(Color.white, 0, 0, 1), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.13f), 8, 30), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.07f), 2, 6));
        side.raycastTarget = true;
        float inner = sw - 22, x = 11, y = 11;
        // Its name (.db-name: white in a hairline of #eceae6, corners 8, 10.56 spaced 0.1em in capitals, centred), and
        // its mode (.db-mode-chip: #eef0f5, round, Exo 2 11 semibold, padded 3 by 9), 8 apart.
        string modeName = Modes.GameModes[Modes.ModeOf(d)].Name.ToLowerInvariant();
        float chipW = K.TextW(modeName, 11, 600, 0, false) + 18;
        var nameBox = Box(side.transform, d.Name, x, y, inner - chipW - 8, 28, 8, 24, "", 10.56f, true, 0.1f, true, Hex("#eceae6"));
        nameBox.textComponent.fontStyle |= FontStyles.UpperCase;
        nameBox.onValueChanged.AddListener(s => editing.Name = Clip(s, 24));
        var chip = Hud.Box(side.transform, "Mode", Hex("#eef0f5"), 9.5f);
        Hud.Place(chip.rectTransform, x + inner - chipW, y + (28 - 19) / 2f, chipW, 19);
        K.Fill(chip.transform, modeName, 11, Look.InkSoft, false, 600);
        y += 28 + 8;

        // The count of cards and of Heroes, against what it needs (.db-tally: Exo 2 10.56, centred; its numbers bold,
        // #3a9e6a when right, else #c0705f), under the cards still to collect and the flux they'd take, on a line of
        // their own (.db-tally-need: #a8641c semibold, 2 above the count).
        int commands = d.Cards.Count(id => Cards.Def(id).Kind == "command"), needHeroes = DeckRules.CommandCardsFor(d.Cards.Count);
        const string ok = "#3a9e6a", bad = "#c0705f";
        bool sizeOk = d.Cards.Count >= Balance.DeckSize && d.Cards.Count <= Balance.MaxDeckSize;
        var missing = MissingCopies(d.Cards);
        int need = missing.Sum(m => m.n);
        if (need > 0)
        {
            var collect = K.Words(side.transform, $"{need} to collect · ⟁{missing.Sum(m => m.n * Progression.CraftCost(m.id))}", x, y, inner, 13, 10.56f, Hex("#a8641c"), false, 600);
            Hud.Ellipsis(collect);
            y += 13 + 2;
        }
        var tally = K.Words(side.transform, $"<b><color={(sizeOk ? ok : bad)}>{d.Cards.Count}/{(d.Cards.Count > Balance.DeckSize ? Balance.MaxDeckSize : Balance.DeckSize)}</color></b> cards · <b><color={(commands == needHeroes ? ok : bad)}>{commands}/{needHeroes}</color></b> {(needHeroes == 1 ? "hero" : "heroes")}", x, y, inner, 13, 10.56f, Look.InkSoft, false, 400);
        Hud.Ellipsis(tally);
        y += 13 + 8;
        // (The craft panel's place: 8 more under it, open or not.)
        if (focus != null) y = FocusPanel(side.transform, focus, x, y, inner);
        y += 8;

        // The deck, card by card (.db-row: 28 tall, 2 apart, round, in the card's own colours with its picture), by
        // energy cost then name; then exit and save (.db-actions: 25 tall, at least 72 across, 6 apart).
        float actionsY = sh - 11 - 25;
        var rows = d.Cards.Distinct().Select(Cards.Def).OrderBy(CostOrder).ThenBy(c => c.Name, System.StringComparer.InvariantCultureIgnoreCase).ToList();
        float listH = rows.Count == 0 ? 4 + 76.4f + 4 : rows.Count * 30 - 2;
        var content = K.Scroller(side.transform, "Rows", x, y, inner, Mathf.Max(30, actionsY - 8 - y), listH);
        float ry = 0;
        foreach (var c in rows) { Row(content, c, ry, inner); ry += 30; }
        if (rows.Count == 0)
        {
            // (.db-rows-empty: a dashed box (1.5, #d6d3ce, corners 10), 4 off its neighbours, padded 18 by 12; Exo 2 12.8,
            // #8a8f99, its lines 1.5 apart.)
            var empty = Hud.Rect(content, "Empty");
            Hud.Place(empty, 0, 4, inner, 76.4f);
            var ei = empty.gameObject.AddComponent<RawImage>();
            ei.texture = BoardArt.DashedBox(inner, 76.4f, 10, new Color(1, 1, 1, 0), Hex("#d6d3ce"), 1.5f);
            ei.raycastTarget = false;
            var words = K.Words(empty, "No cards yet.\nTap a card to add it.", 12, 18, inner - 24, 38.4f, 12.8f, Hex("#8a8f99"), false, 400);
            words.lineSpacing = (1.5f - 1.2f) / 1.2f * 100;
        }
        System.Action exitAct = () =>
        {
            // Leave the deck: ask first if that would lose changes.
            if (Snap(editing) != openedSnap) confirmExit = true;
            else editing = starter = null;
            Draw();
        };
        float bw = Mathf.Max(72, K.TextW("SAVE", 9.28f, 700, 0.18f) + 30);
        K.Btn(side.transform, "save", Save, x + inner - bw, actionsY, K.Kind.Primary, bw, 25, 9.28f, 0.18f);
        var exit = K.Btn(side.transform, "exit", exitAct, x + inner - bw - 6 - bw, actionsY, K.Kind.Btn, bw, 25, 9.28f, 0.18f, ring: new Color(0.753f, 0.337f, 0.239f, 0.45f));
        var el = exit.GetComponentInChildren<TextMeshProUGUI>();
        el.color = Hex("#b23c24");
        el.font = Look.Display(700);
    }

    /// <summary>
    /// A row of the deck (.db-row: a pill 28 tall in the card's colours by its rarity (a white edge; stellar gold,
    /// anomaly violet), a ring of its kind's colour at 22%, padded 2 10 2 2, its parts 7 apart): its picture (22
    /// across), its name (clamp(8.96px, 2vh, 11.2px) semibold, spaced 0.06em), how many short (if any), how many, and a
    /// minus (tap: take one out). A card still to collect: its edge dashed amber, its picture greyed.
    /// </summary>
    void Row(RectTransform content, CardDef c, float y, float width)
    {
        int n = Count(editing.Cards, c.Id), shortBy = Mathf.Max(0, n - Profile.Owned(c.Id));
        var kc = Look.Kind.TryGetValue(ShownKind(c), out var kcol) ? kcol : Look.Ink;
        var rarity = c.Rarity ?? "dwarf";
        var fill = rarity == "stellar" ? Hex("#fcf5e6") : rarity == "anomaly" ? Hex("#f4eefc") : Hex("#f8f9fb");
        var edge = rarity == "stellar" ? Hud.Rgba(255, 214, 140, 0.9f) : rarity == "anomaly" ? Hud.Rgba(190, 160, 255, 0.85f) : Color.white;
        // (Its 1 px edge inside it; dashed amber for a card still to collect.)
        var row = shortBy > 0 ? Hud.Box(content, c.Id, fill, 14) : K.Inset(content, c.Id, fill, edge, 14);
        Hud.Place(row.rectTransform, 0, y, width, 28);
        Hud.Shadow(row, 14, new Hud.Drop(new Color(kc.r, kc.g, kc.b, 0.22f), 0, 0, 1), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.1f), 2, 6));
        if (shortBy > 0)
        {
            var dash = Hud.Rect(row.transform, "Edge");
            Hud.Fill(dash);
            var di = dash.gameObject.AddComponent<RawImage>();
            di.texture = BoardArt.DashedBox(width, 28, 14, new Color(1, 1, 1, 0), Hud.Rgba(212, 149, 42, 0.8f), 1);
            di.raycastTarget = false;
        }
        row.raycastTarget = true;
        var id = c.Id;
        var press = CardPress.On(row.gameObject, () => menu.Zoom(id));
        row.gameObject.AddComponent<Button>().onClick.AddListener(() => { if (!press.Swallow()) Remove(id); });
        // (Under a mouse, the card shown large beside the deck's panel, level with its row: app.ts onHover, showPeek.)
        MenuHover.Rustle(row.gameObject, on => Peek(on ? id : null, row.rectTransform));
        var art = Hud.Rect(row.transform, "Art");
        Hud.Place(art, 3, 3, 22, 22);
        var ring = art.gameObject.AddComponent<Image>();
        ring.sprite = Hud.Circle;
        ring.color = new Color(1, 1, 1, 0.6f);
        ring.raycastTarget = false;
        Portrait(art, id, 21);
        if (shortBy > 0) art.gameObject.AddComponent<CanvasGroup>().alpha = 0.7f;
        float fs = K.Clamp(8.96f, 2 * K.Vh, 11.2f);
        // (From its right: the minus 10 in, 7 to how many, 7 to how many short.)
        float minusW = K.TextW("−", fs, 400, 0, false), countW = K.TextW($"×{n}", fs, 700), needW = shortBy > 0 ? K.TextW($"need {shortBy}", fs * 0.8f, 400, 0.06f, false) : 0;
        float right = 11;
        var minus = K.Fill(row.transform, "−", fs, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Right);
        minus.margin = new Vector4(0, 0, right, 0);
        right += minusW + 7;
        var count = K.Fill(row.transform, $"×{n}", fs, Look.Ink, true, 700, 0, TextAlignmentOptions.Right);
        count.margin = new Vector4(0, 0, right, 0);
        right += countW + 7;
        if (shortBy > 0)
        {
            var needL = K.Fill(row.transform, $"need {shortBy}", fs * 0.8f, Hex("#a8641c"), false, 400, 0.06f, TextAlignmentOptions.Right);
            needL.margin = new Vector4(0, 0, right, 0);
            right += needW + 7;
        }
        var name = K.Fill(row.transform, c.Name.ToLowerInvariant(), fs, Look.Ink, true, 600, 0.06f, TextAlignmentOptions.Left);
        Hud.Ellipsis(name);
        name.margin = new Vector4(32, 0, right, 0);
    }

    /// <summary>
    /// Crafting (builder.ts renderFocus, .db-focus: #f6f7fb in an inset hairline of #e6e9f2, corners 14, padded 10 by
    /// 12, its parts 6 apart): its name (11.52 bold, spaced 0.1em) and close (a pill 23 tall), what you have, then
    /// craft and break down (.btn 26 tall, 8.96, padded 10; side by side when they fit, else each a row of its own;
    /// faded to 40% when they can't be done). Returns where it ends.
    /// </summary>
    float FocusPanel(Transform side, string id, float x, float y, float inner)
    {
        var def = Cards.Def(id);
        var me = Profile.Me;
        int have = Profile.Owned(id), cost = Progression.CraftCost(id), spare = Progression.Breakable(me.Collection, id);
        string line = $"owned {have} · a deck may hold {Campaign.CopyLimit(id)} · you have ⟁{me.Flux} flux";
        float w = inner - 24;
        string craftT = $"craft · ⟁{cost}", breakT = $"break down · +⟁{Progression.BreakdownValue(id)}";
        float cw = K.BtnW(craftT, K.Kind.Btn, 8.96f, 0.14f, 10), bwd = K.BtnW(breakT, K.Kind.Btn, 8.96f, 0.14f, 10);
        bool stack = cw + 6 + bwd > w;
        var panelBox = K.Inset(side, "Craft", Hex("#f6f7fb"), Hex("#e6e9f2"), 14);
        var t = panelBox.transform;
        float closeW = K.BtnW("close", K.Kind.Pill, 8.96f);
        var head = K.Words(t, def.Name.ToLowerInvariant(), 12, 10, w - closeW - 8, 23, 11.52f, Look.Ink, true, 700, 0.1f, TextAlignmentOptions.Left);
        Hud.Ellipsis(head);
        K.Btn(t, "close", () => { focus = null; Draw(); }, inner - 12 - closeW, 10, K.Kind.Pill, closeW, 23, 8.96f);
        float lineH = Para(t, line, 12, 39, w, 9.92f, Look.InkSoft, TextAlignmentOptions.TopLeft);
        float by = 39 + lineH + 6;
        var craft = K.Btn(t, craftT, () => Craft(id), 12, by, K.Kind.Btn, stack ? w : cw + (w - 6 - cw - bwd) / 2, 26, 8.96f);
        Usable(craft, me.Flux >= cost);
        float bx = stack ? 12 : 12 + cw + (w - 6 - cw - bwd) / 2 + 6;
        if (stack) by += 26 + 6;
        var brk = K.Btn(t, breakT, () => BreakDown(id), bx, by, K.Kind.Btn, stack ? w : bwd + (w - 6 - cw - bwd) / 2, 26, 8.96f);
        Usable(brk, spare > 0);
        float h = by + 26 + 10;
        Hud.Place(panelBox.rectTransform, x, y, inner, h);
        return y + h;
    }

    /// <summary>A button that can't be pressed now: faded to 40% (.btn:disabled).</summary>
    static void Usable(Button b, bool can)
    {
        b.interactable = can;
        if (can) return;
        b.transition = Selectable.Transition.None;
        b.gameObject.AddComponent<CanvasGroup>().alpha = 0.4f;
    }

    // ---- The filters popover: dropdowns of ticks, an order, two toggles ----

    /// <summary>
    /// The filters popover (.db-filters-pop): under its button, 6 below it (pulled back left only as far as keeps it
    /// 12 off the screen's edge), min(420px, 100vw - 32px) across, white at 97%, corners 16, padded 14; two columns 10
    /// apart of dropdowns (.db-drop-head: 34 tall, white in a hairline of #e6e8ee, corners 14, padded 5 12 6: what it
    /// filters, 7.2 spaced 0.16em, over what is ticked, 9.6 spaced 0.08em, a caret on the right), then the toggles and
    /// the foot (clear, done) as pills 30 tall (8.8 spaced 0.14em, padded 12), 6 apart. An open dropdown's rows hang 4
    /// under its head, over what is below.
    /// </summary>
    void FiltersPop()
    {
        var f = filters;
        bool core = Modes.ModeOf(editing) == "core";
        var races = new List<(string, string)> { ("deck", "this deck's races + neutral"), ("neutral", "neutral") };
        for (int i = 0; i < Races.RaceNames.Count; i++) if (!core || Modes.CoreRaces.Contains(i)) races.Add((i.ToString(), Races.RaceNames[i].ToLowerInvariant()));
        var kinds = Kinds.Select(k => (k, KindName[k])).ToList();
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
        float pw = Mathf.Min(420, K.W - 32), ph = 14 + 3 * 44 + 30 + 10 + 30 + 14, colW = (pw - 28 - 10) / 2;
        float px = Mathf.Min(SearchR + 8, K.W - 12 - pw), py = K.PadT + 30 + 6;
        var pop = Hud.Box(root, "Popover", new Color(1, 1, 1, 0.97f), 16);
        Hud.Place(pop.rectTransform, px, py, pw, ph);
        Hud.Shadow(pop, 16, new Hud.Drop(Color.white, 0, 0, 1), new Hud.Drop(Hud.Rgba(60, 66, 90, 0.22f), 14, 40));
        pop.raycastTarget = true;
        pop.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        var pt = pop.transform;
        int open = -1;
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
            float hx = 14 + (i % 2) * (colW + 10), hy = 14 + (i / 2) * 44;
            bool isOpen = dropOpen == dr.key;
            if (isOpen) open = i;
            var head = Hud.Box(pt, dr.key, Color.white, 14);
            Hud.Place(head.rectTransform, hx, hy, colW, 34);
            var ring = new Hud.Drop(isOpen ? Hex("#c9cfdd") : Hex("#e6e8ee"), 0, 0, 1);
            if (isOpen) Hud.Shadow(head, 14, ring, new Hud.Drop(Hud.Rgba(150, 165, 200, 0.18f), 0, 0, 3));
            else Hud.Shadow(head, 14, ring);
            head.raycastTarget = true;
            string key = dr.key;
            head.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); dropOpen = dropOpen == key ? null : key; Draw(); });
            K.Words(head.transform, dr.label.ToUpperInvariant(), 13, 6, colW - 26, 9, 7.2f, Look.InkFaint, true, 400, 0.16f, TextAlignmentOptions.Left);
            var val = K.Words(head.transform, summary.ToUpperInvariant(), 13, 15, colW - 26 - 6 - 10, 12, 9.6f, Look.Ink, true, 400, 0.08f, TextAlignmentOptions.Left);
            Hud.Ellipsis(val);
            // (Its caret: a chevron 7 on a side, stroked 1.5 in #8b93ad, pointing down; open, up and 3 lower.)
            float cx = colW - 16.5f, cy = isOpen ? 25 : 22, dy = isOpen ? -2.475f : 2.475f;
            Stroke(head.rectTransform, new Vector2(cx - 2.475f, cy + dy), 8.5f, 1.5f, isOpen ? 45 : -45, Hex("#8b93ad"));
            Stroke(head.rectTransform, new Vector2(cx + 2.475f, cy + dy), 8.5f, 1.5f, isOpen ? -45 : 45, Hex("#8b93ad"));
        }
        // The toggles (.pill-btn; on, .pill-on: white in a ring of rgba(111, 159, 216, 0.55) 2 wide).
        float tx = 14, ty = 14 + 3 * 44;
        foreach (var (key, label, on) in new[] { ("characters", "characters", f.Characters), ("inDeck", "in this deck", f.InDeck) })
        {
            var t = PopPill(pt, label, tx, ty, () =>
            {
                if (key == "characters") filters.Characters = !filters.Characters;
                else filters.InDeck = !filters.InDeck;
                pageAt = 0;
                Draw();
            });
            if (on)
            {
                ((Image)t.targetGraphic).color = Color.white;
                Hud.Shadow((Image)t.targetGraphic, 15, new Hud.Drop(Hud.Rgba(111, 159, 216, 0.55f), 0, 0, 2));
            }
            tx += ((RectTransform)t.transform).sizeDelta.x + 6;
        }
        // The foot: clear (with any set) and done, on the right.
        int set = f.Ticked.Count(kv => kv.Value.Count > 0) + (f.Sort != "cost" ? 1 : 0) + (f.Characters ? 1 : 0) + (f.InDeck ? 1 : 0);
        float fy = ty + 30 + 10, right = pw - 14 - K.BtnW("done", K.Kind.Pill, 8.8f, 0.14f, 12);
        PopPill(pt, "done", right, fy, () => { filtersOpen = false; dropOpen = null; Draw(); });
        if (set > 0) PopPill(pt, "clear", right - 6 - K.BtnW("clear", K.Kind.Pill, 8.8f, 0.14f, 12), fy, () => { var q = filters.Q; filters = new Filters { Q = q }; pageAt = 0; Draw(); });

        // The open dropdown's rows (.db-drop-list: white, corners 12, padded 4, 1 apart), each ticking on and off (the
        // order: one of them): its box (.db-check: 13 across, corners 4, a 1.5 edge of #b9c0d2; ticked, slate with a
        // white tick; the order's round, a white dot) 8 in, its words 8 after (9.28 spaced 0.08em, ink-soft; ticked, ink).
        if (open < 0) return;
        var od = drops[open];
        bool radio = od.key == "sort";
        float rowW = colW - 8, textW = rowW - 8 - 13 - 8 - 8;
        var heights = od.rows.Select(r => 12 + Mathf.Max(13, LinesH(r.Item2.ToUpperInvariant(), textW))).ToList();
        float lx = 14 + (open % 2) * (colW + 10), ly = 14 + (open / 2) * 44 + 34 + 4;
        var list = Hud.Box(pt, "List", Color.white, 12);
        Hud.Place(list.rectTransform, lx, ly, colW, 8 + heights.Sum() + (heights.Count - 1));
        Hud.Shadow(list, 12, new Hud.Drop(Hud.Rgba(150, 160, 185, 0.25f), 0, 0, 1), new Hud.Drop(Hud.Rgba(60, 66, 90, 0.2f), 10, 28));
        list.raycastTarget = true;
        list.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        float ry = 4;
        for (int i = 0; i < od.rows.Count; i++)
        {
            var (value, text) = od.rows[i];
            bool on = radio ? f.Sort == value : f.Ticked[od.key].Contains(value);
            float rh = heights[i];
            var r = Hud.Box(list.transform, value, new Color(1, 1, 1, 0.001f), 8);
            Hud.Place(r.rectTransform, 4, ry, rowW, rh);
            r.raycastTarget = true;
            var dkey = od.key;
            var rb = r.gameObject.AddComponent<Button>();
            var rc = rb.colors;
            rc.highlightedColor = Hex("#f3f5f9");
            rb.colors = rc;
            rb.onClick.AddListener(() =>
            {
                Sound.Play("click");
                if (radio) filters.Sort = value;
                else if (!filters.Ticked[dkey].Remove(value)) filters.Ticked[dkey].Add(value);
                pageAt = 0;
                Draw();
            });
            float rad = radio ? 6.5f : 4;
            var box = on ? Hud.Box(r.transform, "Check", Hex("#5d6a8c"), rad) : K.Inset(r.transform, "Check", Color.white, Hex("#b9c0d2"), rad, 1.5f);
            Hud.Place(box.rectTransform, 8, (rh - 13) / 2, 13, 13);
            if (on && radio)
            {
                var dot = Hud.Box(box.transform, "Dot", Color.white, 2.5f);
                Hud.Place(dot.rectTransform, 4, 4, 5, 5);
            }
            else if (on)
            {
                // (The tick: a 5 by 3 corner of 1.5 white strokes, turned -45°.)
                Stroke(box.rectTransform, new Vector2(4.73f, 7.27f), 3.75f, 1.5f, -45, Color.white);
                Stroke(box.rectTransform, new Vector2(7.56f, 7.27f), 5.75f, 1.5f, 45, Color.white);
            }
            var tl = K.Words(r.transform, text.ToUpperInvariant(), 29, 6, textW, rh - 12, 9.28f, on ? Look.Ink : Look.InkSoft, true, 400, 0.08f, TextAlignmentOptions.Left);
            tl.textWrappingMode = TextWrappingModes.Normal;
            ry += rh + 1;
        }
    }

    /// <summary>A pill of the popover's (.db-toolbar .pill-btn: 30 tall, 8.8 spaced 0.14em, padded 12) at (x, y).</summary>
    static Button PopPill(Transform parent, string text, float x, float y, System.Action act) =>
        K.Btn(parent, text, act, x, y, K.Kind.Pill, K.BtnW(text, K.Kind.Pill, 8.8f, 0.14f, 12), 30, 8.8f);

    /// <summary>How tall a dropdown row's words stand (9.28, wrapping in `w`: Orbitron's line 1.25 of its size).</summary>
    static float LinesH(string text, float w)
    {
        int lines = Mathf.Max(1, Mathf.CeilToInt(K.TextW(text, 9.28f, 400, 0.08f) / w - 0.001f));
        return lines * 9.28f * 1.25f;
    }

    // ---- A card read large ----

    [System.Serializable] class ExplainRow { public bool race; public string head, colour, body; public int icon; }

    static Dictionary<string, List<ExplainRow>> explains;

    /// <summary>What a card carries, explained (glyphs.ts, baked to Engine/explain): its race, its keywords.</summary>
    static List<ExplainRow> Explain(string defId)
    {
        explains ??= Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, List<ExplainRow>>>(Resources.Load<TextAsset>("Engine/explain").text);
        if (explains.TryGetValue(defId, out var rows)) return rows;
        var def = Cards.Def(defId);
        var baseId = def.FusedFrom?[0] ?? def.ArtOf ?? defId.Split('@')[0];
        return baseId != defId && explains.TryGetValue(baseId, out rows) ? rows : new List<ExplainRow>();
    }

    static Color CssColour(string rgb)
    {
        var m = System.Text.RegularExpressions.Regex.Matches(rgb ?? "", @"[\d.]+");
        if (m.Count < 3) return Look.Ink;
        return new Color(float.Parse(m[0].Value) / 255f, float.Parse(m[1].Value) / 255f, float.Parse(m[2].Value) / 255f, m.Count > 3 ? float.Parse(m[3].Value) : 1);
    }

    /// <summary>
    /// A card read large (app.ts renderZoom, .zoom-view): over the page blurred and veiled, the card (--pw: min(340px, 62% of the
    /// page's height, 80vw)) and beside it, 16 off, what it carries explained (.kw-list: at most 260 across, as tall
    /// as the card); under them, 10 down, "tap anywhere to close" (12.8, muted); all in the page's middle.
    /// </summary>
    public static RectTransform ZoomView(Transform parent, string zoomed, System.Action close)
    {
        var veil = Hud.Rect(parent, "Zoom");
        Hud.Fill(veil);
        // (.overlay-soft: rgba(244, 244, 242, 0.45) over the page blurred 6.)
        veil.gameObject.AddComponent<Image>().color = new Color(244 / 255f, 244 / 255f, 242 / 255f, 0.45f);
        BackdropBlur.Blur(veil);
        veil.gameObject.AddComponent<Button>().onClick.AddListener(() => close());
        float cw = Mathf.Min(340, 0.62f * K.H, 0.8f * K.W), ch = cw * 1.4f;
        var rows = Explain(zoomed);
        float ew = rows.Count > 0 ? Mathf.Min(260, K.W - cw - 16 - 24) : 0;
        float rowW = cw + (rows.Count > 0 ? 16 + ew : 0), left = (K.W - rowW) / 2, top = (K.H - (ch + 10 + 16)) / 2;
        var face = Hud.Rect(veil, "Card");
        Hud.Place(face, left, top, cw, ch);
        var img = face.gameObject.AddComponent<RawImage>();
        img.texture = Faces.Of(zoomed, false);
        img.raycastTarget = false;
        Printed(face, zoomed, cw);
        if (rows.Count > 0)
        {
            var (panel, ph) = ExplainPanel(veil, rows, ew, ch);
            Hud.Place(panel, left + cw + 16, top + (ch - ph) / 2, ew, ph);
        }
        K.Words(veil, "tap anywhere to close", 0, top + ch + 10, K.W, 16, 12.8f, Look.InkFaint, false, 400);
        // (The card rises in: rise, 0.2 s ease-out.)
        RiseIn.On(face, Time.time, 0, 0.2f, 10 / WebLook.Zoom, true);
        return veil;
    }

    /// <summary>The explanations' panel (.kw-list): white at 96%, corners 16, padded 12 by 14, rows 8 apart, `w` wide, at most `most` tall.</summary>
    /// <remarks>Beside a card held up to read (.card-preview .kw-list): padded 10 by 12, rows 6 apart, 12.48 and 10.88.</remarks>
    static (RectTransform, float) ExplainPanel(Transform parent, List<ExplainRow> rows, float w, float most, bool small = false)
    {
        float padX = small ? 12 : 14, padY = small ? 10 : 12, head = small ? 12.48f : 13.76f, bodySize = small ? 10.88f : 11.84f, between = small ? 6 : 8;
        float inner = w - 2 * padX;
        var p = Hud.Box(parent, "Explain", new Color(1, 1, 1, 0.96f), 16);
        var panel = (RectTransform)p.transform;
        Hud.Shadow(p, 16, new Hud.Drop(Hud.Rgba(70, 76, 100, 0.18f), 10, 30));
        float y = padY;
        for (int i = 0; i < rows.Count; i++)
        {
            var r = rows[i];
            if (i > 0) y += between;
            float x = padX;
            if (r.icon >= 0)
            {
                var ic = Hud.Rect(panel, "Mark");
                float s = head * 0.78f;
                Hud.Place(ic, x, y + (head * 1.35f - s) / 2 + head * 0.04f, s, s);
                var img = ic.gameObject.AddComponent<RawImage>();
                img.texture = Resources.Load<Texture2D>($"Icons/kw/k{r.icon}");
                img.raycastTarget = false;
                x += s + head * 0.25f;
            }
            var h = Hud.Rect(panel, "Head");
            var ht = h.gameObject.AddComponent<TextMeshProUGUI>();
            Look.Style(ht, head, CssColour(r.colour), false, 600, 2, TextAlignmentOptions.TopLeft);
            ht.text = r.head;
            Hud.Place(h, x, y, inner - (x - padX), head * 1.35f);
            y += head * 1.35f;
            if (!string.IsNullOrEmpty(r.body))
            {
                y += 2;
                var b = Hud.Rect(panel, "Body");
                var bt = b.gameObject.AddComponent<TextMeshProUGUI>();
                Look.Style(bt, bodySize, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
                bt.textWrappingMode = TextWrappingModes.Normal;
                bt.lineSpacing = (1.35f - 1.2f) * 100;
                bt.text = r.body;
                var size = bt.GetPreferredValues(r.body, inner, 0);
                Hud.Place(b, padX, y, inner, size.y);
                y += size.y;
            }
            if (r.race)
            {
                y += 8;
                var line = Hud.Box(panel, "Rule", new Color(120 / 255f, 126 / 255f, 140 / 255f, 0.18f), 0);
                Hud.Place((RectTransform)line.transform, padX, y, inner, 1);
                y += 1;
            }
        }
        float hgt = Mathf.Min(y + padY, most);
        // (Taller than the card: what runs over is cut, as the web's column scrolls.)
        p.gameObject.AddComponent<RectMask2D>();
        return (panel, hgt);
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

    /// <summary>A face of a deck box: four corners (in the box's own units from its bottom left), shaded from its foot to its top.</summary>
    static Facet Face(RectTransform box, string name, Vector2[] corners, Color foot, Color top)
    {
        var r = Hud.Rect(box, name);
        Hud.Fill(r);
        // (Its renderer added first: a graphic in a file not named for it is not given one in the editor, which never
        // plays, and the screenshots taken there failed on the deck boxes.)
        if (!r.TryGetComponent<CanvasRenderer>(out _)) r.gameObject.AddComponent<CanvasRenderer>();
        var f = r.gameObject.AddComponent<Facet>();
        f.Corners = corners;
        float mid = (corners.Min(c => c.y) + corners.Max(c => c.y)) / 2;
        for (int i = 0; i < 4; i++) f.Colours[i] = corners[i].y > mid ? top : foot;
        f.raycastTarget = false;
        return f;
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
