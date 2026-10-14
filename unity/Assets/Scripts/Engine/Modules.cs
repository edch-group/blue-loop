using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>A module fitted in one of the flagship's rooms (modules.ts).</summary>
    public class ShipModule
    {
        public string Id;
        public string Name;
        public string Kind;
        public string Rarity;
        /// <summary>Boons on the card standing in its room.</summary>
        public List<string> Boons;
        public string Text;
    }

    /// <summary>A kind of module: its name, and what it puts on the card in its room by quality.</summary>
    public class ModuleDef
    {
        public string Name;
        public System.Func<int, List<string>> Boons;
        public System.Func<int, string> Text;
    }

    /// <summary>
    /// Ship modules (modules.ts): items fitted into the flagship's rooms, one to a room. In battle, whichever card
    /// stands in a room carries its module's boons, the way a hero's card carries their gear. Each module is one of a
    /// kind: fitted in one room, it is in no other. They are found after battles won, better the deeper the system lies.
    /// </summary>
    public static class Modules
    {
        static readonly Dictionary<string, int> Step = new Dictionary<string, int> { ["dwarf"] = 1, ["stellar"] = 2, ["anomaly"] = 3 };
        static readonly Dictionary<string, string> Quality = new Dictionary<string, string> { ["dwarf"] = "Worn", ["stellar"] = "Bright", ["anomaly"] = "Starforged" };

        static List<string> L(params string[] b) => b.ToList();
        static ModuleDef M(string name, System.Func<int, List<string>> boons, System.Func<int, string> text) => new ModuleDef { Name = name, Boons = boons, Text = text };

        /// <summary>
        /// Each kind: its name, and what it puts on the card in its room by quality (1 worn, 2 bright, 3 starforged).
        /// (MODULES: named for its values here, as a member can't share its class's name.)
        /// </summary>
        public static readonly Dictionary<string, ModuleDef> ModuleDefs = new Dictionary<string, ModuleDef>
        {
            ["coolant"] = M("Coolant Loop", n => L(Boons.Boon("cool", n)), n => $"At each dawn, cools your sun by {n}."),
            ["emitter"] = M("Shield Emitter", n => L(Boons.Boon("shield", n)), n => $"At each dawn, raises {n} shield{(n == 1 ? "" : "s")}."),
            ["targeting"] = M("Targeting Array", n => L(Boons.Boon("pierce", n)), n => $"At each dawn, {n} heat to your rival's sun, through shields."),
            ["autoloader"] = M("Autoloader", n => L(Boons.Boon("playheat", n + 1)), n => $"As a card is played into this room: {n + 1} heat."),
            ["plating"] = M("Ablative Plating", n => L(Boons.Boon("sturdy", n)), n => $"The card in this room has +{n} defence (Sturdy)."),
            ["drones"] = M("Repair Drones", n => L(Boons.Boon("repair", n)), n => $"At each dawn, mends {n} worn defence."),
            ["projector"] = M("Bulwark Projector", n => L(Boons.Boon("bulwark", n)), n => $"Its neighbours have +{n} defence (Bulwark)."),
            ["decoy"] = M("Decoy Beacon", n => n > 1 ? L(Boons.Boon("guard"), Boons.Boon("sturdy", n - 1)) : L(Boons.Boon("guard")), n => $"The card in this room must be attacked first (Guard){(n > 1 ? $", with +{n - 1} defence" : "")}."),
            ["lances"] = M("Overcharged Lances", n => L(Boons.Boon("heat", n)), n => $"At each dawn, {n} heat to your rival's sun."),
        };

        public static readonly List<string> ModuleKinds = ModuleDefs.Keys.ToList();

        /// <summary>A module of a kind and quality.</summary>
        public static ShipModule MakeModule(string id, string kind, string rarity)
        {
            var m = ModuleDefs[kind];
            var n = Step[rarity];
            return new ShipModule { Id = id, Name = $"{Quality[rarity]} {m.Name}", Kind = kind, Rarity = rarity, Boons = m.Boons(n), Text = m.Text(n) };
        }

        /// <summary>How strong a module is, for the AI's choosing.</summary>
        public static int ModuleValue(ShipModule m) => Step[m.Rarity] * 10;
    }
}
