using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>A Hero's ultimate (singularities.ts).</summary>
    public class Singularity
    {
        public string Name;
        public string Charge;
        public int Need;
        public string Text;
        public List<Effect> Effects;
        public int? Price;
    }

    /// <summary>The rest the battle rules read as data (scripts/export-engine.ts's rules.json).</summary>
    public class RulesData
    {
        public List<string> BossIds = new List<string>();
        public Dictionary<string, Singularity> Singularities = new Dictionary<string, Singularity>();
        public Dictionary<string, Singularity> CaptainSingularities = new Dictionary<string, Singularity>();
        public Dictionary<string, string> CompanionCards = new Dictionary<string, string>();
        /// <summary>CARDS's ids, in order: the pool (no tokens, boons, Overlords' cards or Enigmas).</summary>
        public List<string> PoolIds = new List<string>();
    }

    /// <summary>A race's trait (races.ts).</summary>
    public class RaceTrait
    {
        public int Sturdy;
        public int Sting;
        public bool Ambush;
        public int Attune;
    }

    /// <summary>Cards as they play (cards.ts): by id, and what kind of card each is.</summary>
    public static class Cards
    {
        public static RulesData Rules = new RulesData();
        static HashSet<string> bossIds = new HashSet<string>();

        public static void LoadRules(string rulesJson)
        {
            Rules = Json.Read<RulesData>(rulesJson);
            bossIds = new HashSet<string>(Rules.BossIds);
        }

        /// <summary>Everything the engine reads, from the three data files' text.</summary>
        public static void Load(string cardsJson, string decksJson, string rulesJson)
        {
            CardData.Load(cardsJson, decksJson);
            LoadRules(rulesJson);
        }

        /// <summary>A card by id (fused, marked and built cards are made from their ids: see Builds).</summary>
        public static CardDef Def(string defId)
        {
            if (CardData.TryGet(defId, out var d)) return d;
            var built = Builds.Make(defId);
            if (built != null) return built;
            throw new System.Exception($"Unknown card: {defId}");
        }

        public static bool IsBossCard(string id) => bossIds.Contains(id);

        /// <summary>The cards in the pool and the rest with fixed ids (CARDS: not tokens, boons, Overlords' or Enigmas).</summary>
        public static IEnumerable<CardDef> Pool => Rules.PoolIds.Select(Def);

        /// <summary>A card that does nothing once it has been played: it resolves and goes, taking no slot.</summary>
        public static bool IsBurst(CardDef def)
        {
            if (def.Kind == "command" || def.Kind == "trap" || def.Kind == "relic" || def.Stability != null) return false;
            if ((def.Defence ?? 0) > 0 && def.Health != null) return false;
            return (def.OnTurn == null || def.OnTurn.Count == 0) && (def.OnDusk == null || def.OnDusk.Count == 0) && (def.Passive == null || def.Passive.Count == 0)
                && (def.Choices == null || def.Choices.Count == 0) && (def.Attune ?? 0) == 0 && (def.OnLeave == null || def.OnLeave.Count == 0) && (def.Attack ?? 0) == 0;
        }

        /// <summary>Darkspeed (the Nyxari): only cards that can act have it, those that attack and Heroes.</summary>
        public static bool HasDarkspeed(CardDef def) =>
            (def.Darkspeed.GetValueOrDefault() || (Races.Trait(def.Race)?.Ambush ?? false)) && def.Kind != "trap" && !IsBurst(def) && ((def.Attack ?? 0) > 0 || def.Kind == "command");
    }

    public static class Races
    {
        static readonly RaceTrait[] Traits =
        {
            null, null, new RaceTrait { Sting = 1 }, null, new RaceTrait { Ambush = true }, new RaceTrait { Sturdy = 2 }, new RaceTrait { Attune = 1 }, new RaceTrait { Sting = 1 },
        };

        public static RaceTrait Trait(int? race) => race == null || race < 0 || race >= Traits.Length ? null : Traits[race.Value];
    }

    /// <summary>Attunement (attunement.ts): an attuned card gains, at each dawn, the bonus of where its owner's orbit stands.</summary>
    public static class Attunement
    {
        static readonly string[] Planets = { "dead", "abundant", "industrial" };

        static List<Effect> Bonus(string planet)
        {
            switch (planet)
            {
                case "dead": return new List<Effect> { new Effect { Type = "shield", Amount = 1 } };
                case "abundant": return new List<Effect> { new Effect { Type = "draw", Amount = 1 } };
                default: return new List<Effect> { new Effect { Type = "heat", Amount = 1, To = "target" } };
            }
        }

        static int Length => Planets.Length * Balance.OrbitTurns;

        public static int Position(int orbit, bool eaten = false)
        {
            int n = Length;
            int pos = ((orbit % n) + n) % n;
            return eaten ? pos % Balance.OrbitTurns : pos;
        }

        public static List<Effect> Effects(int pos, int times = 1)
        {
            var planet = Planets[pos / Balance.OrbitTurns];
            return Bonus(planet).Select(e => times == 1 ? e : new Effect { Type = e.Type, Amount = e.Amount * times, To = e.To }).ToList();
        }
    }
}
