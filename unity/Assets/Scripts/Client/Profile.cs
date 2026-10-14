using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;

/// <summary>
/// The player on this device (profile.ts): their name, and a copy of their account's economy (level, experience,
/// stardust, flux, collection, rank), which only the server changes.
/// </summary>
public class Profile
{
    public string Id;
    public string Name = "";
    public bool? SignedIn;
    public int Level = 1;
    public int Xp;
    public int Stardust;
    public int Flux;
    public Dictionary<string, int> Collection = new Dictionary<string, int>();
    public int? RankPoints;
    public int Played;
    public int Won;

    const string Key = "blue-loop:profile:v1";
    static Profile cached;

    public static Profile Me
    {
        get
        {
            if (cached != null) return cached;
            var p = Store.Read<Profile>(Key);
            if (p == null || string.IsNullOrEmpty(p.Id) || p.Collection == null)
            {
                var r = new System.Random();
                p = new Profile { Id = new string(Enumerable.Range(0, 24).Select(_ => "abcdefghijklmnopqrstuvwxyz0123456789"[r.Next(36)]).ToArray()), Stardust = Progression.BoosterPrice, Collection = Progression.StarterGrant() };
            }
            p.Name ??= "";
            // Every card is unlocked: a saved collection is topped up to the full set.
            foreach (var kv in Progression.StarterGrant()) p.Collection[kv.Key] = System.Math.Max(p.Collection.TryGetValue(kv.Key, out var n) ? n : 0, kv.Value);
            cached = p;
            Save();
            return p;
        }
    }

    public static void Save()
    {
        if (cached != null) Store.Write(Key, cached);
    }

    public static int Owned(string id) => Me.Collection.TryGetValue(id, out var n) ? n : 0;

    /// <summary>Set the name the player goes by.</summary>
    public static void SignIn(string name)
    {
        var p = Me;
        var clean = new string((name ?? "").Where(c => char.IsLetterOrDigit(c) || " '’.-".Contains(c)).ToArray()).Trim();
        p.Name = clean.Length > 18 ? clean.Substring(0, 18) : clean.Length == 0 ? "Commander" : clean;
        p.SignedIn = true;
        Save();
    }
}

/// <summary>The decks on offer (decks.ts): the starter decks, then the player's own.</summary>
public static class Decks
{
    public class Saved : DeckList
    {
        public string Id;
        public bool? Preset;
    }

    const string Key = "blue-loop:decks:v1";
    const string HideKey = "blue-loop:hide-starters";

    public static List<Saved> Presets => CardData.Decks.Select((d, i) => new Saved { Name = d.Name, Cards = d.Cards, Mixed = d.Mixed, Cover = d.Cover, Mode = d.Mode, Id = $"preset-{i}", Preset = true }).ToList();

    public static List<Saved> Custom() => (Store.Read<List<Saved>>(Key) ?? new List<Saved>()).Where(d => d?.Cards != null).ToList();

    static void Write(List<Saved> decks) => Store.Write(Key, decks);

    /// <summary>Every deck on offer: the presets first, then the player's own that they hold the cards for.</summary>
    public static List<Saved> All() => Presets.Concat(Custom().Where(d => Progression.OwnsDeck(Profile.Me.Collection, d.Cards))).ToList();

    public static Saved ById(string id) => Presets.Concat(Custom()).FirstOrDefault(d => d.Id == id);

    public static void Save(Saved deck)
    {
        var list = Custom().Where(d => d.Id != deck.Id).ToList();
        deck.Preset = null;
        list.Add(deck);
        Write(list);
    }

    public static void Delete(string id) => Write(Custom().Where(d => d.Id != id).ToList());

    public static bool StartersHidden
    {
        get => Store.Get(HideKey) == "1";
        set => Store.Set(HideKey, value ? "1" : "0");
    }
}
