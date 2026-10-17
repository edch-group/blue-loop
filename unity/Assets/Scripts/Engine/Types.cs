using System.Collections.Generic;
using Newtonsoft.Json;

// The engine's data, field for field the TypeScript engine's (types.ts): a union there is one class here with every
// variant's fields (unset ones null), so a state or a card serialises to the same JSON on both sides.
namespace BlueLoop.Engine
{
    /// <summary>A number that grows with your tableau, added on top of an effect's base amount.</summary>
    public class Count
    {
        public string Of;
        public string Kind;
        /// <summary>A divisor (a relic's Starfall counts each rested card twice: 0.5).</summary>
        public double? Per;
        public int? Race;
        public string Sub;
        public string Planet;
        public int? Amount;
        public int? Times;
        public bool? Rival;
    }

    /// <summary>Only resolve an effect when this holds.</summary>
    public class Condition
    {
        public bool? Overheated;
        public string MinKind;
        public int? N;
        public int? MinCards;
        public int? MinRace;
        public string Sub;
        public string Planet;
        public bool? Vigil;
    }

    public class Effect
    {
        public string Type;
        public int? Amount;
        public string To;
        public Count Plus;
        public int? Max;
        public bool? Pierce;
        public string Kind;
        public int? MaxDefence;
        public bool? Neighbours;
        public bool? All;
        public bool? Self;
        public int? Times;
        public bool? Shields;
        public bool? Enemy;
        public int? OrDraw;
        public bool? Latest;
        /// <summary>'it' | 'best' (fortify), 'self' | 'rival' (orbit).</summary>
        public string Who;
        public bool? Guarded;
        public int? Side;
        public string DefId;
        public Condition If;
    }

    public class Passive
    {
        public string Type;
        public string Kind;
        public int? Race;
        public string Sub;
        public string Stat;
        public int? Amount;
        public bool? Others;
        public bool? OnTurnOnly;
        public string Planet;
        public string Field;
        public List<Effect> Effects;
        public List<int> Amounts;
    }

    public class TrapTrigger
    {
        public string On;
        public string Kind;
    }

    public class Trap
    {
        public TrapTrigger Trigger;
        public bool? Counter;
        public List<Effect> Effects;
        public bool? Deploy;
    }

    public class ReactEvent
    {
        public string On;
        public string DefId;
        public bool? FaceDown;
        public string AttackerUid;
        public string MineUid;
    }

    public class PendingMove
    {
        /// <summary>'play' | 'attack'.</summary>
        public string Kind;
        public Action Action;
        public string AttackerUid;
        public string TargetUid;
    }

    public class Reaction
    {
        public string PlayerId;
        public string EnemyId;
        public List<ReactEvent> Events;
        public PendingMove Pending;
        public bool Slot;
        public List<string> Hand;
        public string Redirect;
        public bool? Cancelled;
        public bool? Returned;
    }

    public class FuseBonus
    {
        public string Text;
        public List<Effect> OnPlay;
        public List<Effect> OnTurn;
        public List<Effect> OnDusk;
        public List<Passive> Passive;
        public int? Defence;
    }

    public class CardChoice
    {
        public string Id;
        public List<Effect> OnTurn;
    }

    public class BossAction
    {
        public string Name;
        public List<Effect> Effects;
        public string Say;
    }

    public class ActionCost
    {
        public int? Energy;
        public int? Stability;
        public bool? Sacrifice;
        public int? SelfHeat;
    }

    public class AbilityChoices
    {
        public string Kind;
        public int Times;
        public int? Amount;
    }

    public class HeroAbility
    {
        public string Id;
        public string Name;
        public string Text;
        public List<Effect> Effects;
        public int? Cost;
        public ActionCost Pay;
        public string Relic;
        public AbilityChoices Choices;
    }

    public class CardDef
    {
        public string ArtOf;
        public int? Ascended;
        public string Id;
        public string Name;
        public string Kind;
        public int? Race;
        public string Sub;
        public string Rarity;
        public bool? Character;
        public string Text;
        public List<Effect> OnPlay;
        public List<Effect> OnTurn;
        public List<Effect> OnDusk;
        public int? Attune;
        public bool? Darkspeed;
        public List<HeroAbility> Abilities;
        public int? Attack;
        public List<CardChoice> Choices;
        public List<Effect> OnLeave;
        public List<Effect> OnRecover;
        public Trap Trap;
        public bool? Lightspeed;
        public BossAction BossAction;
        public string OverlordPart;
        public int? Cost;
        public bool? SpendAll;
        public bool? Consume;
        public bool? Fusion;
        public FuseBonus Fuse;
        public bool? Token;
        public int? Defence;
        public int? Stability;
        public int? Health;
        public List<Passive> Passive;
        public List<string> FusedFrom;
    }

    public class CardInstance
    {
        public string Uid;
        public string DefId;
        public int? Growth;
        public int? Slot;
        public int? Stability;
        public int? Health;
        public int? MaxHealth;
        public int? Dented;
        public bool? Dimmed;
        public int? Charge;
        public int? AttackBonus;
        public int? Fortified;
        public int? SpentAttack;
        public int? Shields;
        public bool? Frozen;
        public int? Chill;
        public string ChilledBy;
        public int? Discount;
        public string EchoOf;
        public bool? Fresh;
        public List<string> Boons;
        public List<CardInstance> Fused;
        public string Choice;
        public int? Spent;
    }

    public class BattleModifiers
    {
        public int? StartingHeat;
        public int? MaxHealthDelta;
        public int? ShieldPerTurn;
        public int? HeatPerTurn;
        public int? CoolPerTurn;
        public int? WaveCardHeat;
        public int? ExtraDraw;
        public int? OpeningHand;
        public int? ExtraPlays;
        public int? AbundantDraw;
        public int? IndustrialPlays;
        public int? DeadCool;
        public int? Paradise;
        public int? GuardDefence;
        public int? Darkspeed;
    }

    public class TurnStats
    {
        public int HeatDealt;
        public int? Attacks;
        public int? EnergyTotal;
        public int? EnergyBase;
        public int? DawnEnergy;
        public int CardsPlayed;
        public int Cooled;
    }

    public class DawnChoice
    {
        public string Uid;
        public string Kind;
        public string Relic;
        public int? Amount;
    }

    public class RelicInPlay
    {
        public string Power;
        public int N;
        public string Name;
    }

    public class HeroBoons
    {
        public string Hero;
        public List<string> Boons;
    }

    public class HeroStats
    {
        public int Attack;
        public int Defence;
    }

    public class ShipRooms
    {
        public List<int> Defence;
        public List<int> Attack;
        public int Command;
        public List<List<string>> Boons;
    }

    public class Wounded
    {
        public CardInstance Card;
        public int Left;
    }

    public class BossState
    {
        public string Intent;
        public string Leader;
        /// <summary>Its own (the Overlord's) action recharging: how many more of its days before it is ready again
        /// (null: ready). Used, it recharges for two of its days and is ready on the third.</summary>
        public int? Charge;
    }

    public class Stung
    {
        public int Turn;
        public List<string> Ids;
    }

    public class BattleCondition
    {
        public string Name;
        public string Text;
        public string Short;
        public bool? Galaxy;
    }

    public class BattleSkill
    {
        public string Id;
        public string Name;
        public string Text;
        public string Hero;
        public List<Effect> Effects;
        public int Cost;
        public bool? Once;
        public string Relic;
        public AbilityChoices Choices;
        // In play.
        public bool? Spent;
        public int? UsedTurn;
    }

    public class PlayerState
    {
        public List<CardInstance> Wreck;
        public List<int> ClosedSlots;
        public List<DawnChoice> DawnChoices;
        public List<RelicInPlay> Relics;
        public string Id;
        public string Name;
        public bool IsAI;
        public string DeckName;
        public string Avatar;
        public int Heat;
        /// <summary>
        /// (The AI's look-ahead only: a fraction of heat it imagines kept off, as the TypeScript's sun may hold. Never
        /// saved, never in a real game.)
        /// </summary>
        [JsonIgnore] public double HeatShift;
        [JsonIgnore] public double HeatExact => Heat + HeatShift;
        public int Shields;
        public int? DeckSize;
        public HeroBoons HeroBoons;
        public string Hero;
        public HeroStats HeroStats;
        public ShipRooms Rooms;
        public Wounded Wounded;
        public List<CardInstance> Fallen;
        public Dictionary<int, int> SlotWear;
        public List<CardInstance> Deck;
        public List<CardInstance> Hand;
        public List<CardInstance> Tableau;
        public List<CardInstance> Discard;
        public CardInstance Lightspeed;
        public BossState Boss;
        public int? Banked;
        public int? ReactedDay;
        public bool Eliminated;
        public string TargetId;
        public int TurnsTaken;
        public int PlaysLeft;
        public int Orbit;
        public TurnStats Turn;
        public Stung Stung;
        public BattleModifiers Modifiers;
        public List<BattleCondition> Conditions;
        public List<BattleSkill> Skills;
        public int? AbilityTurn;
        public int? ExtraDay;
        public int? SkipDays;
    }

    public class LogEntry
    {
        public int Seq;
        public int Turn;
        public string Text;
    }

    public class SunAt
    {
        public int Heat;
        public int Shields;
        public bool Eliminated;
    }

    public class TurnPulse
    {
        public string Uid;
        public string Source;
        public string To;
        public string Kind;
        public int Amount;
        public Dictionary<string, SunAt> Suns;
        public string ToCard;
        public bool? Together;
    }

    public class Challenge
    {
        public string Kind;
        public int? Days;
        public List<string> Spawn;
        public int? Per;
        public int Broken;
        public string Goal;
    }

    public class LastDusk
    {
        public string PlayerId;
        public bool Acted;
    }

    public class Sprung
    {
        public string OwnerId;
        public string DefId;
        public string EnemyId;
        public string Against;
        public string Trigger;
    }

    public class Struck
    {
        public string AttackerUid;
        public string TargetUid;
    }

    public class Acts
    {
        public int Damage;
        public int Support;
        public int Kills;
        public int Sun;
        public int Dawns;
    }

    public class GameState : IRngState
    {
        public int Version = 7;
        public int RngState { get; set; }
        public int UidCounter;
        public int TurnNumber;
        public int Round;
        public int ActivePlayerIndex;
        public List<PlayerState> Players = new List<PlayerState>();
        public string WinnerId;
        public string ConcededBy;
        public List<LogEntry> Log = new List<LogEntry>();
        public List<TurnPulse> TurnPulses;
        public bool? KeepPulses;
        public Reaction Reaction;
        public bool? NoReactions;
        public Dictionary<string, Acts> Acts;
        public Challenge Challenge;
        public bool? VaultOpened;
        public LastDusk LastDusk;
        public List<Sprung> Sprung;
        public Struck Struck;
        public bool? Campaign;
        public string Mode;
    }

    public class GameOpening
    {
        public int? Shields;
        public int? Draw;
    }

    public class PlayerSetup
    {
        public string Name;
        public bool IsAI;
        public List<string> Deck;
        public string DeckName;
        public string Avatar;
        public int? HeatDelta;
        public HeroBoons HeroBoons;
        public List<RelicInPlay> Relics;
        public GameOpening Opening;
        public List<string> Tableau;
        public bool? Boss;
        public int? BossHealth;
        public string BossLeader;
        public string Lightspeed;
        public BattleModifiers Modifiers;
        public List<BattleCondition> Conditions;
        public List<BattleSkill> Skills;
        public string Hero;
        public ShipRooms Rooms;
        public List<int> ClosedSlots;
        public HeroStats HeroStats;
    }

    public class GameSetup
    {
        public Challenge Challenge;
        public int Seed;
        public List<PlayerSetup> Players;
        public bool? Campaign;
        public string Mode;
    }

    public class ReactPlay
    {
        public int? Slot;
        public string AimUid;
        public string EnemyUid;
        public string AllyUid;
        public string Choice;
    }

    public class DuskShift
    {
        public string Uid;
        public int To;
    }

    /// <summary>A move (every variant of types.ts's Action, its `type` saying which).</summary>
    public class Action
    {
        public string Type;
        // playCard
        public string CardUid;
        public string HostUid;
        /// <summary>playCard: the slot (an int); react: spring the face-down trap (a bool). As JSON gives it.</summary>
        public object Slot;
        [JsonIgnore] public int? SlotIndex { get => Slot is bool || Slot == null ? (int?)null : System.Convert.ToInt32(Slot); set => Slot = value; }
        [JsonIgnore] public bool SlotTrap { get => Slot is bool b && b; set => Slot = value ? (object)true : null; }
        public bool? FaceDown;
        public string Choice;
        public string EnemyUid;
        public string AllyUid;
        public int? ShiftTo;
        public string RecoverUid;
        public string AimUid;
        public string ChillUid;
        public string SacrificeUid;
        // setTarget
        public string TargetId;
        // endTurn
        public List<string> Discard;
        public DuskShift DuskShift;
        // heroSkill / heroAbility
        public int? Index;
        // attack
        public string AttackerUid;
        public string TargetUid;
        // concede
        public string PlayerId;
        // react
        public ReactPlay Play;
    }

    public class GameError : System.Exception
    {
        public GameError(string message) : base(message) { }
    }
}
