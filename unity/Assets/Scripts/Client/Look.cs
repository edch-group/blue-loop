using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;

/// <summary>
/// The game's look (styles.css): its colours and its two typefaces, Orbitron for titles, labels and numbers and Exo 2
/// for body text, as TextMeshPro fonts made from the bundled files.
/// </summary>
public static class Look
{
    static Color C(string hex) => ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.magenta;

    public static readonly Color Paper = C("#f3f2ee");
    public static readonly Color Ink = C("#3e424a");
    public static readonly Color InkSoft = C("#737780");
    public static readonly Color InkFaint = C("#a6a9b0");
    public static readonly Color Line = new Color(120 / 255f, 124 / 255f, 134 / 255f, 0.22f);
    public static readonly Color Glass = C("#f7f7f5");
    public static readonly Color GlassStrong = C("#fcfcfb");
    public static readonly Color Gold = C("#b99b5a");
    public static readonly Color Danger = C("#c98a86");
    public static readonly Color Back = C("#e0dfdb");
    public static readonly Color Heat = C("#e0553a");
    public static readonly Color Cool = C("#3f93dc");
    public static readonly Color Good = C("#3a9e6a");
    public static readonly Color Pick = C("#4f86c6");
    public static readonly Color Aim = C("#d8452b");

    /// <summary>KIND_COLOUR: each kind of card's colour.</summary>
    public static readonly Dictionary<string, Color> Kind = new Dictionary<string, Color>
    {
        ["unit"] = C("#4f7fbf"), ["surge"] = C("#e07a3a"), ["attack"] = C("#e0553a"), ["defence"] = C("#3f93dc"), ["growth"] = C("#3a9e6a"),
        ["global"] = C("#9265d6"), ["command"] = C("#8b909b"), ["trap"] = C("#4b4fb0"), ["relic"] = C("#1fa6a0"),
    };

    static readonly Dictionary<string, TMP_FontAsset> fonts = new Dictionary<string, TMP_FontAsset>();

    static TMP_FontAsset Font(string file)
    {
        if (fonts.TryGetValue(file, out var f)) return f;
        var ttf = Resources.Load<Font>("Fonts/" + file);
        // (Atlases that grow into more pages as glyphs are added, so a long page of words never runs out of room.)
        f = ttf != null ? TMP_FontAsset.CreateFontAsset(ttf, 90, 9, UnityEngine.TextCore.LowLevel.GlyphRenderMode.SDFAA, 2048, 2048, AtlasPopulationMode.Dynamic, true) : null;
        if (f != null)
        {
            f.name = file;
            // (The usual characters drawn into the atlas at once, so it is not redrawn under text already laid out.)
            f.TryAddCharacters(" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~·–—‘’“”…×−‹›→", out _);
        }
        fonts[file] = f;
        // (Signs the game's faces lack, ✦ ⟁ ✓ × and the like, from small fallback faces.)
        if (f != null && !file.StartsWith("Symbols"))
            f.fallbackFontAssetTable = new List<TMP_FontAsset> { Font("Symbols"), Font("Symbols2") }.FindAll(x => x != null);
        return f;
    }

    /// <summary>Orbitron at a weight (it has 400, 500 and 700; another weight gets the one a browser would pick).</summary>
    public static TMP_FontAsset Display(int weight = 500) => Font($"Orbitron-{Nearest(weight, 400, 500, 700)}") ?? Font("Orbitron-500");
    /// <summary>Exo 2 at a weight (it has 400, 500 and 600; another weight gets the one a browser would pick).</summary>
    public static TMP_FontAsset Body(int weight = 400) => Font($"Exo2-{Nearest(weight, 400, 500, 600)}") ?? Font("Exo2-400");

    /// <summary>
    /// The weight a face has that stands in for one it lacks (CSS font matching: above 500, the next heavier, else the
    /// nearest lighter; at 400 or 500, the other of the two, then lighter, then heavier; below 400, lighter, then heavier).
    /// Never a weight without a font file. Orbitron 600 had none, and its texts were left with no font: one measured
    /// before it had woken (under a parent not active: the "choosable" look of a slot worn by a blow, drawn as an attack
    /// destroys the card in it) fell back to a font asset TextMeshPro could not read, which threw a NullReferenceException
    /// (Material.HasProperty, in ReadFontAssetDefinition) and left that asset's lookup half built: the next such text then
    /// threw a MethodAccessException (IEqualityComparer&lt;UInt32&gt;.GetHashCode on whatever type now lay there) or
    /// halted the game (memory access out of bounds). Online play's attacks.
    /// </summary>
    static int Nearest(int weight, params int[] have)
    {
        if (System.Array.IndexOf(have, weight) >= 0) return weight;
        var heavier = have.Where(w => w > weight).OrderBy(w => w);
        var lighter = have.Where(w => w < weight).OrderByDescending(w => w);
        var order = weight > 500 ? heavier.Concat(lighter)
            : weight >= 400 ? have.Where(w => w > weight && w <= 500).Concat(lighter).Concat(heavier.Where(w => w > 500))
            : lighter.Concat(heavier);
        return order.First();
    }

    /// <summary>Text set in the game's style: Orbitron, upper case and spaced (as the web's labels), or Exo 2.</summary>
    public static T Style<T>(T t, float size, Color color, bool display = true, int weight = 500, float spacing = 0, TextAlignmentOptions align = TextAlignmentOptions.Center) where T : TMP_Text
    {
        t.font = display ? Display(weight) : Body(weight);
        t.fontSize = size;
        t.color = color;
        t.characterSpacing = spacing;
        t.alignment = align;
        t.textWrappingMode = TextWrappingModes.NoWrap;
        t.richText = true;
        t.raycastTarget = false;
        return t;
    }
}
