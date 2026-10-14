using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The deck builder and collection (builder.ts): every card in pages, filtered by race, kind and rarity; tap one to
/// put it in the deck (as many as it may hold), tap it in the deck's list to take it out. The deck's problems show
/// as it is built; a legal deck can be saved under a name.
/// </summary>
public class BuilderView : MonoBehaviour
{
    public static readonly string[] Kinds = { "unit", "surge", "relic", "global", "command", "trap" };
    public static readonly Dictionary<string, string> KindName = new Dictionary<string, string>
    {
        ["unit"] = "Entity", ["surge"] = "Technology", ["command"] = "Hero", ["trap"] = "Trap", ["relic"] = "Relic", ["global"] = "Global",
    };
    static readonly string[] Rarities = { "dwarf", "stellar", "anomaly" };
    static readonly Dictionary<string, string> RarityName = new Dictionary<string, string> { ["dwarf"] = "White dwarf", ["stellar"] = "Stellar", ["anomaly"] = "Anomaly" };
    const int PerPage = 10;

    RectTransform root;
    MenuView menu;
    readonly List<string> deck = new List<string>();
    string deckName = "New deck", deckId;
    int? race;
    string kind, rarity;
    int pageAt;

    public static BuilderView Make(RectTransform parent, MenuView menu, Decks.Saved editing = null)
    {
        var r = Hud.Rect(parent, "Builder");
        Hud.Fill(r);
        var v = r.gameObject.AddComponent<BuilderView>();
        v.root = r;
        v.menu = menu;
        if (editing != null)
        {
            v.deck.AddRange(editing.Cards);
            v.deckName = editing.Name;
            v.deckId = editing.Preset == true ? null : editing.Id;
        }
        v.Draw();
        return v;
    }

    public static string ShownKind(CardDef def)
    {
        if (def.Kind == "command" || def.Kind == "trap" || def.Kind == "relic" || def.Kind == "global") return def.Kind;
        return Cards.IsBurst(def) ? "surge" : "unit";
    }

    List<CardDef> Shown() => Cards.Pool
        .Where(c => race == null ? true : race == -1 ? c.Race == null : c.Race == race)
        .Where(c => kind == null || ShownKind(c) == kind)
        .Where(c => rarity == null || (c.Rarity ?? "dwarf") == rarity)
        .OrderBy(c => Game.CardCost(c.Id)).ThenBy(c => c.Name, System.StringComparer.Ordinal)
        .ToList();

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var back = Hud.Pill(root, "‹ Back", () => menu.Show("hub"), 18);
        Hud.At((RectTransform)back.transform, new Vector2(0, 1), new Vector2(36, -30), new Vector2(150, 56));
        Filters();
        Grid();
        Side();
    }

    // ---- Filters: race, kind, rarity ----

    void Filters()
    {
        var bar = Hud.Rect(root, "Filters");
        Hud.At(bar, new Vector2(0, 1), new Vector2(200, -30), new Vector2(1000, 56));
        var options = new List<(string label, bool on, System.Action act)>();
        options.Add(("All", race == null && kind == null && rarity == null, () => { race = null; kind = null; rarity = null; }));
        var names = Races.RaceNames;
        for (int r = 0; r < names.Count; r++)
        {
            int rr = r;
            options.Add((names[r], race == r, () => race = race == rr ? (int?)null : rr));
        }
        options.Add(("Neutral", race == -1, () => race = race == -1 ? (int?)null : -1));
        float x = 0;
        foreach (var (label, on, act) in options)
        {
            float w = 18 + label.Length * 11.5f;
            var b = Hud.Pill(bar, label, () => { act(); pageAt = 0; Draw(); }, 14, on ? Look.Ink : Look.GlassStrong, on ? Color.white : Look.InkSoft);
            Hud.At((RectTransform)b.transform, new Vector2(0, 0.5f), new Vector2(x, 0), new Vector2(w, 44));
            x += w + 8;
        }
        var row2 = Hud.Rect(root, "Kinds");
        Hud.At(row2, new Vector2(0, 1), new Vector2(200, -92), new Vector2(1000, 50));
        x = 0;
        foreach (var k in Kinds.Concat(Rarities))
        {
            bool isKind = Kinds.Contains(k);
            var label = isKind ? KindName[k] : RarityName[k];
            bool on = isKind ? kind == k : rarity == k;
            float w = 18 + label.Length * 10.5f;
            var kk = k;
            var b = Hud.Pill(row2, label, () =>
            {
                if (isKind) kind = kind == kk ? null : kk;
                else rarity = rarity == kk ? null : kk;
                pageAt = 0;
                Draw();
            }, 13, on ? Look.Ink : Look.GlassStrong, on ? Color.white : Look.InkSoft);
            Hud.At((RectTransform)b.transform, new Vector2(0, 0.5f), new Vector2(x, 0), new Vector2(w, 40));
            x += w + 8;
        }
    }

    // ---- The cards: a page of them, how many of each are in the deck ----

    void Grid()
    {
        var shown = Shown();
        int pages = Mathf.Max(1, (shown.Count + PerPage - 1) / PerPage);
        pageAt = Mathf.Clamp(pageAt, 0, pages - 1);
        var area = Hud.Rect(root, "Grid");
        Hud.At(area, new Vector2(0, 0), new Vector2(40, 90), new Vector2(1100, 740));
        float cw = 200, ch = 280, gx = 216, gy = 312;
        var page = shown.Skip(pageAt * PerPage).Take(PerPage).ToList();
        for (int i = 0; i < page.Count; i++)
        {
            var c = page[i];
            var cell = Hud.Rect(area, c.Id);
            Hud.At(cell, new Vector2(0, 1), new Vector2(10 + (i % 5) * gx, -10 - (i / 5) * gy), new Vector2(cw, ch));
            var img = cell.gameObject.AddComponent<RawImage>();
            img.texture = Faces.Of(c.Id, false);
            int inDeck = deck.Count(x => x == c.Id);
            int limit = Campaign.CopyLimit(c.Id);
            img.color = inDeck >= limit ? new Color(1, 1, 1, 0.55f) : Color.white;
            var b = cell.gameObject.AddComponent<Button>();
            var id = c.Id;
            b.onClick.AddListener(() => Add(id));
            if (inDeck > 0)
            {
                var tag = Hud.Glass(cell, "In deck", Look.Ink, false);
                Hud.At((RectTransform)tag.transform, new Vector2(1, 1), new Vector2(-6, 8), new Vector2(58, 34));
                Hud.Label(tag.transform, $"{inDeck}/{limit}", 15, Color.white, true, 500, 4);
            }
        }
        var label = Hud.Label(root, $"PAGE {pageAt + 1} / {pages}   ·   {shown.Count} CARDS", 16, Look.InkSoft, true, 500, 14, TextAlignmentOptions.BottomLeft);
        label.margin = new Vector4(60, 0, 0, 40);
        for (int dir = -1; dir <= 1; dir += 2)
        {
            int step = dir;
            var arrow = Hud.Pill(root, dir < 0 ? "‹" : "›", () => { pageAt = Mathf.Clamp(pageAt + step, 0, pages - 1); Draw(); }, 30);
            Hud.At((RectTransform)arrow.transform, new Vector2(0, 0), new Vector2(dir < 0 ? 480 : 560, 28), new Vector2(64, 56));
        }
    }

    void Add(string id)
    {
        if (deck.Count(x => x == id) >= Campaign.CopyLimit(id)) return;
        if (deck.Count >= Balance.MaxDeckSize) return;
        deck.Add(id);
        Draw();
    }

    void Remove(string id)
    {
        deck.Remove(id);
        Draw();
    }

    // ---- The deck: its name, its cards by cost, its problems, save ----

    void Side()
    {
        var side = Hud.Glass(root, "Deck", Look.GlassStrong);
        Hud.At((RectTransform)side.transform, new Vector2(1, 0.5f), new Vector2(-30, -10), new Vector2(390, 900));
        var input = MakeInput(side.transform, deckName);
        input.onValueChanged.AddListener(s => deckName = s);
        int heroes = deck.Count(id => Cards.Def(id).Kind == "command");
        var tally = Hud.Label(side.transform, $"{deck.Count} CARDS · {heroes} HEROES", 15, Look.InkSoft, true, 500, 12, TextAlignmentOptions.Top);
        tally.margin = new Vector4(0, 90, 0, 0);
        // Each card once, with its count, cheapest first: tap to take one out.
        var rows = deck.Distinct().OrderBy(id => Game.CardCost(id)).ThenBy(id => Cards.Def(id).Name, System.StringComparer.Ordinal).ToList();
        float y = -128;
        foreach (var id in rows.Take(22))
        {
            var row = Hud.Rect(side.transform, id);
            Hud.At(row, new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(350, 30));
            var hit = row.gameObject.AddComponent<Image>();
            hit.color = new Color(1, 1, 1, 0);
            var copy = id;
            row.gameObject.AddComponent<Button>().onClick.AddListener(() => Remove(copy));
            var def = Cards.Def(id);
            var kc = Look.Kind.TryGetValue(ShownKind(def), out var k) ? k : Look.Ink;
            var t = Hud.Label(row, $"<color=#{ColorUtility.ToHtmlStringRGB(Look.Gold)}>{Game.CardCost(id)}</color>  <color=#{ColorUtility.ToHtmlStringRGB(kc)}>●</color> {def.Name}", 17, Look.Ink, false, 500, 0, TextAlignmentOptions.Left);
            var n = Hud.Label(row, $"×{deck.Count(x => x == id)}", 17, Look.InkSoft, false, 600, 0, TextAlignmentOptions.Right);
            y -= 31;
        }
        if (rows.Count > 22) Hud.Label(side.transform, $"and {rows.Count - 22} more…", 15, Look.InkSoft, false, 500, 0, TextAlignmentOptions.Bottom).margin = new Vector4(0, 0, 0, 200);
        var problems = DeckRules.DeckProblems(deck);
        var why = Hud.Label(side.transform, problems.Count == 0 ? "<color=#3a9e6a>READY TO PLAY</color>" : problems[0], 15, problems.Count == 0 ? Look.Good : Look.Danger, problems.Count == 0, 500, problems.Count == 0 ? 12 : 0, TextAlignmentOptions.Bottom);
        why.textWrappingMode = TextWrappingModes.Normal;
        why.margin = new Vector4(24, 0, 24, 112);
        var save = Hud.Pill(side.transform, "Save deck", Save, 20, problems.Count == 0 ? Look.Ink : Look.GlassStrong, problems.Count == 0 ? Color.white : Look.InkFaint);
        save.interactable = problems.Count == 0;
        Hud.At((RectTransform)save.transform, new Vector2(0.5f, 0), new Vector2(0, 26), new Vector2(330, 70));
    }

    static TMP_InputField MakeInput(Transform parent, string text)
    {
        var box = Hud.Glass(parent, "Name", Color.white, false);
        Hud.At((RectTransform)box.transform, new Vector2(0.5f, 1), new Vector2(0, -22), new Vector2(350, 58));
        var area = Hud.Rect(box.transform, "Text Area");
        Hud.Fill(area);
        area.offsetMin = new Vector2(18, 6);
        area.offsetMax = new Vector2(-18, -6);
        area.gameObject.AddComponent<RectMask2D>();
        var t = Hud.Label(area, text, 22, Look.Ink, true, 500, 6, TextAlignmentOptions.Left);
        var input = box.gameObject.AddComponent<TMP_InputField>();
        input.textViewport = area;
        input.textComponent = t;
        input.characterLimit = 24;
        input.text = text;
        return input;
    }

    void Save()
    {
        if (DeckRules.DeckProblems(deck).Count > 0) return;
        deckId ??= "deck-" + System.Guid.NewGuid().ToString("N").Substring(0, 10);
        Decks.Save(new Decks.Saved { Id = deckId, Name = string.IsNullOrWhiteSpace(deckName) ? "New deck" : deckName.Trim(), Cards = deck.ToList(), Mode = "lost" });
        menu.Show("hub");
    }
}
