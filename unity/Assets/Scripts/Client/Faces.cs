using System.Collections.Generic;
using BlueLoop.Engine;
using UnityEngine;

/// <summary>
/// The card faces baked from the web game (scripts/bake-cards.mjs: Resources/CardFaces/table and /face, and the sized
/// ones) and the badges a card in play wears (scripts/bake-badges.mjs: Resources/Badges, with where each sits on its card).
/// </summary>
public static class Faces
{
    [System.Serializable] public class Place { public float x, y, w, h; }
    [System.Serializable] public class Places { public Place atk, stab, def, guard; }

    static readonly Dictionary<string, Texture2D> cache = new Dictionary<string, Texture2D>();
    static Places places;

    static Texture2D Load(string path)
    {
        if (cache.TryGetValue(path, out var t)) return t;
        // (Its shape beside it: CardFaces/<variant>-alpha/<id>.)
        var slash = path.LastIndexOf('/');
        t = Pictures.Load(path, path.Substring(0, slash) + "-alpha" + path.Substring(slash));
        if (t != null)
        {
            t.wrapMode = TextureWrapMode.Clamp;
            t.anisoLevel = 4;
        }
        cache[path] = t;
        return t;
    }

    /// <summary>A card's face from one variant's folder; a built card (fused, marked, the Captain's or the crew's build) shows its base card's until it has one of its own.</summary>
    static Texture2D Face(string dir, string defId)
    {
        var t = Load(dir + defId);
        if (t != null) return t;
        var def = Cards.Def(defId);
        var baseId = def.FusedFrom?[0] ?? def.ArtOf ?? Builds.MarkOf(defId)?.baseId ?? defId.Split('@')[0];
        return baseId != defId ? Load(dir + baseId) : null;
    }

    /// <summary>
    /// A card's face, as it stands in play (`table`, 200 px) or magnified (`face`: .card-big, 300 px, for the inspector
    /// and the zoom).
    /// </summary>
    public static Texture2D Of(string defId, bool table) => Face(table ? "CardFaces/table/" : "CardFaces/face/", defId);

    /// <summary>Where a card is drawn, as the web gives each its own rules: in play, in the hand, or on its own (the stage's).</summary>
    public enum Look { Table, Hand, Card }

    // The sized faces (scripts/bake-cards.mjs VARIANTS, the same list): in play on a phone's board (its own rules) and a
    // desktop's, in the hand, and a card on its own; each as the web draws a card that many CSS px wide there.
    static readonly int[] TablePhone = { 56, 66, 78 }, TableDesk = { 84, 96 }, Hand = { 66, 79, 100, 124 }, Plain = { 88, 125, 250 };

    /// <summary>
    /// A card's face as the web draws it `css` CSS px wide in that place (its fonts and art have floors: a small card is
    /// no large one shrunk), from the baked size nearest it; without one, the old faces.
    /// </summary>
    public static Texture2D Of(string defId, Look look, float css)
    {
        var dir = Sized(look, css);
        return (dir != null ? Face(dir, defId) : null) ?? Of(defId, look == Look.Table);
    }

    /// <summary>The folder of the baked size nearest `css` for that place (a card in play: the phone's or the desktop's).</summary>
    static string Sized(Look look, float css)
    {
        if (css <= 0) return null;
        bool phone = look == Look.Table && BoardLayout.Current.Phone;
        var sizes = look == Look.Table ? (phone ? TablePhone : TableDesk) : look == Look.Hand ? Hand : Plain;
        int best = sizes[0];
        foreach (var w in sizes) if (Mathf.Abs(w - css) < Mathf.Abs(best - css)) best = w;
        return look == Look.Table ? $"CardFaces/table-{(phone ? "p" : "d")}{best}/" : look == Look.Hand ? $"CardFaces/hand-{best}/" : $"CardFaces/card-{best}/";
    }

    /// <summary>A badge for a value: "atk", "atk-dim", "stab", "stab-low", "def", "guard" (values 0–30).</summary>
    public static Texture2D Badge(string kind, int n) => Load($"Badges/{kind}-{Mathf.Clamp(n, 0, 30)}");

    /// <summary>
    /// A badge for a value on a card `css` CSS px wide: a defence shield on a card under 77 px is drawn at its floor (20 px,
    /// a Guard's 23, its number at its 8 px floor: larger for the shield than on a big card), as Badges/<kind>-s-<n>.
    /// </summary>
    public static Texture2D Badge(string kind, int n, float css)
    {
        if (css > 0 && css < 77 && (kind == "def" || kind == "guard"))
        {
            var t = Load($"Badges/{kind}-s-{Mathf.Clamp(n, 0, 30)}");
            if (t != null) return t;
        }
        return Badge(kind, n);
    }

    /// <summary>Where each badge sits on a table card 200 px wide (scripts/bake-badges.mjs), in card widths from its top left.</summary>
    public static Places Where => places ??= JsonUtility.FromJson<Places>(Resources.Load<TextAsset>("Badges/places").text);

    /// <summary>
    /// Where a badge sits on a card `css` CSS px wide, in card widths from its top left (it is 1.4 tall), as the web places
    /// it: attack and stability inside the card's bottom corners (.jewels-bl, .jewels-br: .035 of the card in from its
    /// padding edge, inside its 1 px border), their stones .27 of the card in play (.card.card-table .jewel) and
    /// max(9 px, .19) elsewhere (.jewel); the defence shield standing on the card's foot, 45% of it below (.stat-def-floor:
    /// max(20 px, .27) wide, a Guard's max(23 px, .31), 110 to 100 tall). `slot`: atk, stab, def or guard.
    /// </summary>
    public static Place At(string slot, float css, bool table)
    {
        float b = 1 / css, k = 1.4f;
        if (slot == "def" || slot == "guard")
        {
            float sw = slot == "guard" ? Mathf.Max(23 / css, 0.31f) : Mathf.Max(20 / css, 0.27f), sh = sw * 1.1f;
            return new Place { x = 0.5f - sw / 2, y = k - b - 0.55f * sh, w = sw, h = sh };
        }
        float j = table ? 0.27f : Mathf.Max(9 / css, 0.19f);
        return new Place { x = slot == "atk" ? b + 0.035f : 1 - b - 0.035f - j, y = k - b - 0.035f - j, w = j, h = j };
    }
}
