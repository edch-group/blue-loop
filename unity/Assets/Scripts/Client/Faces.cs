using System.Collections.Generic;
using BlueLoop.Engine;
using UnityEngine;

/// <summary>
/// The card faces baked from the web game (scripts/bake-cards.mjs: Resources/CardFaces/table and /face) and the badges
/// a card in play wears (scripts/bake-badges.mjs: Resources/Badges, with where each sits on its card).
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

    /// <summary>
    /// A card's face, as it stands in play (`table`) or in the hand and inspector (`face`). A built card (fused,
    /// marked, the Captain's or the crew's build) shows its base card's until it has a face of its own.
    /// </summary>
    public static Texture2D Of(string defId, bool table)
    {
        var dir = table ? "CardFaces/table/" : "CardFaces/face/";
        var t = Load(dir + defId);
        if (t != null) return t;
        var def = Cards.Def(defId);
        var baseId = def.FusedFrom?[0] ?? def.ArtOf ?? Builds.MarkOf(defId)?.baseId ?? defId.Split('@')[0];
        return baseId != defId ? Load(dir + baseId) : null;
    }

    /// <summary>A badge for a value: "atk", "atk-dim", "stab", "stab-low", "def", "guard" (values 0–30).</summary>
    public static Texture2D Badge(string kind, int n) => Load($"Badges/{kind}-{Mathf.Clamp(n, 0, 30)}");

    public static Places Where => places ??= JsonUtility.FromJson<Places>(Resources.Load<TextAsset>("Badges/places").text);
}
