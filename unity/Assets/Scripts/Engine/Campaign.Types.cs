using System.Collections.Generic;

namespace BlueLoop.Engine
{
    // The campaign's state and actions (campaign.ts), field for field: a saved run reads into these and writes back
    // out the same. Unions are flattened (one class with every variant's fields).

    public class MapPlanet { public string Name; public string Tint; }

    public class GarrisonCard { public string Uid; public string DefId; public string Status; }

    public class NodeChallenge
    {
        public string Kind;
        public bool Hidden;
        public string From;
        public string Done;
        public string Lord;
        public string Rift;
    }

    public class StationUsed { public bool? Buy; public bool? Recycle; public bool? Fuse; public bool? Part; }

    /// <summary>An armoury (kind "armory": its stock, what's been done there) or a research station (kind "research").</summary>
    public class Station
    {
        public string Kind;
        public List<string> Cards;
        public StationUsed Used;
        public bool? Fuse;
        public List<string> Options;
        public string Project;
        public string TakenBy;
    }

    public class NodeYield { public int Materials; }
    public class NodeBonus { public int? Materials; }
    public class Cache { public string Kind; public int Amount; }

    public class CampaignNode
    {
        public string Id;
        public string Name;
        public double X;
        public double Y;
        public double? H;
        public List<MapPlanet> Planets;
        public string Owner;
        public List<string> Links;
        public int Fortification;
        public int Damage;
        public List<GarrisonCard> Garrison;
        public List<string> Hazard;
        public NodeYield Yield;
        public int Tier;
        public string Home;
        public bool? Heart;
        public NodeChallenge Challenge;
        public bool? Vanished;
        public bool? Prophet;
        public bool? Dream;
        public string Rival;
        public string Encounter;
        public int? SpinRing;
        public int? SpinSlot;
        public double? SpinStep;
        public int? Ring;
        public int? Stellaria;
        public bool? Dimmed;
        public bool? Collapsing;
        public bool? Collapsed;
        public int? StableUntil;
        public bool? Gate;
        public string Star;
        public Station Station;
        public int? Col;
        public double? Lane;
        public NodeBonus Bonus;
        public Cache Cache;
        public int? Vault;
        public bool? Ruined;
    }

    public class Ship
    {
        public ShipRooms Rooms;
        public List<ShipModule> Modules;
        public int Shields;
        public int Hull;
    }

    public class CampaignStats
    {
        public int Settled, Absorbed, Novas, Defences, RivalsTaken, BattlesWon, SwiftWins, ColdWins;
    }

    public class ActiveMission { public string Id; public int Base; }

    public class Affinity { public int? Primary; public double PrimaryBoost; public int? Secondary; public double SecondaryBoost; }

    public class Faction
    {
        public int? SunBonus;
        public string Id;
        public string Name;
        public bool IsAI;
        public int Race;
        public bool? Human;
        public Affinity Affinity;
        public int Materials;
        public Ship Ship;
        public string Hero;
        public List<string> Reserve;
        public List<ActiveMission> Missions;
        public List<string> MissionDeck;
        public CampaignStats Stats;
        public bool Eliminated;
        public bool? Lost;
        public Dictionary<string, HeroState> Heroes;
        public List<Item> Items;
        public List<Relic> Relics;
        public List<ShipModule> Modules;
        public ResearchState Research;
    }

    public class Army
    {
        public string Id;
        public string Owner;
        public string General;
        public string NodeId;
        public List<string> Deck;
        public int Damage;
        public bool Moved;
        public bool? Refit;
        public int? Steps;
        public string Lost;
    }

    public class BattleChallenge { public string Kind; public int Damage; }
    public class BattleStruggle { public string Hero; public int Damage; }
    public class BattleDream { public string Id; public int Damage; }
    public class BattleCrystal { public int Damage; }
    public class BattleEncounter { public string Kind; public int Stage; public int Price; }

    public class BattleContext
    {
        public string Attacker;
        public string Defender;
        public string FromId;
        public string NodeId;
        public string ArmyId;
        public string DefenderArmyId;
        public GameState Game;
        public BattleChallenge Challenge;
        public BattleStruggle Struggle;
        public BattleDream Dream;
        public BattleCrystal Crystal;
        public BattleEncounter Encounter;
    }

    public class CampaignLogEntry
    {
        public int Seq;
        public int Turn;
        public string Text;
        public List<string> At;
        public string Who;
    }

    public class Loot
    {
        public bool Won;
        public int Materials;
        /// <summary>The Captain's experience, and each companion's (those who earnt any).</summary>
        public int Xp;
        public Dictionary<string, int> CrewXp;
        public int Petals;
        public List<Relic> Relics;
        public List<string> Cards;
        public List<string> Parts;
        public string Found;
        /// <summary>The wormhole's Overlord beaten: the galaxy cleared, and its cache the rarer one (an Anomaly emblem always in it).</summary>
        public bool? Cleared;
    }

    public class CampaignStory { public List<StoryScene> Queue; public List<string> Told; }
    public class CampaignRift { public string Kind; }
    public class ProphetOffer { public string Card; public string Mark; }
    public class ProphetWaiting { public string NodeId; public List<ProphetOffer> Offers; }
    public class StruggleWaiting { public string NodeId; public string Hero; public bool? Ambush; }
    public class BeatenHero { public string NodeId; public string Hero; }
    public class EncounterPlaying
    {
        public string NodeId;
        public string Kind;
        public int Price;
        public int Stage;
        public string Outcome;
        public string Part;
        public int? Slot;
    }
    public class JoinedCompanion { public string Id; public string Line; public bool? Swap; }
    public class DreamWaiting { public string NodeId; public string Id; }
    public class ConquestWaiting { public string NodeId; public string ArmyId; }
    public class CardReward { public string Source; public List<string> Options; public string ToDeck; public string Take; }
    public class BoonWaiting { public string Source; }

    public class CampaignState : IRngState
    {
        public int Version;
        public string Mode;
        public int Universe;
        public int UniverseStart;
        public int CollapseCol;
        public int Conquered;
        public int Petals;
        public int PetalsBanked;
        public int? StarsTaken;
        public int? StarsBanked;
        public string KeptIn;
        public List<string> FallenDeck;
        public List<string> StartDeck;
        public int? Xp;
        public int? XpBanked;
        public RunBonuses Run;
        public int RngState { get; set; }
        public int UidCounter;
        public int LogSeq;
        public int Turn;
        public string PlayerId;
        public List<Faction> Factions;
        public List<CampaignNode> Nodes;
        public List<Army> Armies;
        public CampaignStory Story;
        public string Galaxy;
        public string Overlord;
        public string Layout;
        public string Terrain;
        public CampaignRift Rift;
        public int? Spin;
        public Dictionary<int, int> RingSpins;
        public ProphetWaiting Prophet;
        public List<Relic> EmblemChoice;
        public StruggleWaiting Struggle;
        public BeatenHero Beaten;
        public EncounterPlaying Encounter;
        public List<JoinedCompanion> Joined;
        public int? WreckedSlot;
        public int? Hunted;
        public int? HuntedBanked;
        public List<string> Slain;
        public List<string> PartsFound;
        public int? PartsBanked;
        public List<string> Freed;
        public int? FreedBanked;
        public Dictionary<string, int> CompanionXp;
        public int? Spared;
        public int? SparedBanked;
        public bool? Crystal;
        public DreamWaiting Dream;
        public BattleContext Battle;
        public ConquestWaiting Conquest;
        public List<CardReward> CardRewards;
        public int? FrostLevel;
        public List<string> LordsWon;
        public BoonWaiting Boon;
        public Loot Loot;
        public string Phase;
        public List<string> AiQueue;
        public bool? AiStepwise;
        public string Winner;
        public List<CampaignLogEntry> Log;
    }

    public class CampaignSetup
    {
        public int Seed;
        public string PlayerName;
        public int? Race;
        public int? Rivals;
        public string Hero;
        public RunBonuses Run;
        public string Captain;
    }

    /// <summary>Everything the player can do on the map (a flattened union: Type says which).</summary>
    public class CampaignAction
    {
        public string Type;
        public string ArmyId;
        public string ToId;
        public string NodeId;
        public string DefId;
        public string A;
        public string B;
        public string ProjectId;
        public bool? All;
        public GameState Game;
        public bool? Auto;
        /// <summary>finishBattle's salvage: unset (owed as a choice), null (none taken: SalvageNone) or a card.</summary>
        public string Salvage;
        public bool? SalvageNone;
        public string Pick;
        public string Choice;
        public int? Index;
        public bool? IndexNone;
        public int? FuseA;
        public int? FuseB;
        public int? Slot;
        public int? ReserveIndex;
        public bool? Stepwise;
        public bool? Recruit;
        public string Out;
        public string PartId;
        public string PartSlot;
    }
}
