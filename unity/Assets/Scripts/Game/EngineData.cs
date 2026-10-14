using BlueLoop.Engine;
using UnityEngine;

/// <summary>The engine's data (Resources/Engine: cards, decks, rules), loaded once.</summary>
public static class EngineData
{
    static bool loaded;

    public static void Ensure()
    {
        if (loaded) return;
        string Text(string name) => Resources.Load<TextAsset>("Engine/" + name).text;
        Cards.Load(Text("cards"), Text("decks"), Text("rules"), Text("builds"));
        Heroes.Load(Text("heroes"));
        Ascent.Load(Text("ascent"));
        World.Load(Text("world"));
        loaded = true;
    }

    static readonly System.Collections.Generic.Dictionary<string, Texture2D> art = new System.Collections.Generic.Dictionary<string, Texture2D>();

    /// <summary>A card's picture (its own, or its race's stand-in if it has none yet).</summary>
    public static Texture2D Art(string defId)
    {
        var def = Cards.Def(defId);
        var id = def.ArtOf ?? defId.Split('@')[0];
        if (art.TryGetValue(id, out var t)) return t;
        t = Resources.Load<Texture2D>("CardArt/" + id);
        art[id] = t;
        return t;
    }
}
