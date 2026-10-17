using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace BlueLoop.Engine
{
    public static partial class Campaign
    {
        // ---- Turns ----

        static void NewTurn(CampaignState s)
        {
            s.Turn += 1;
            DarkenBehind(s);
            s.Phase = "player";
            foreach (var a in s.Armies)
            {
                a.Moved = false;
                a.Refit = false;
                a.Steps = 0;
                int mend = ArmyBonusOf(s, a).Mend;
                if (mend != 0 && a.Damage != 0) a.Damage = Math.Max(0, a.Damage - mend);
            }
            foreach (var n in s.Nodes.ToList()) if (n.Collapsing == true) Collapse(s, n);
            if (s.Winner == null) CheckVictory(s);
            if (s.Winner != null) return;
            if (RegionalStability(s) <= 0) MarkCollapses(s);
            else if (RegionalStability(s) <= 2) Tell(s, Story.InstabilityScene());
            var p = Player(s);
            int left = RegionalStability(s);
            int cols = T.Columns + 1 - s.CollapseCol;
            Clog(s, $"— Turn {s.Turn}. {(left > 0 ? $"Regional stability: {left} turn{(left == 1 ? "" : "s")}." : $"The strip is collapsing: {p.Name} has {cols} column{(cols == 1 ? "" : "s")} left.")}");
        }

        static void EndFactionTurn(CampaignState s, Faction f)
        {
            foreach (var n in s.Nodes) n.Hazard = n.Hazard.Where(id => id != f.Id).ToList();
        }

        static void Stabilise(CampaignState s, Faction f, CampaignNode n)
        {
            f.Materials -= T.StabiliseCost;
            n.StableUntil = s.Turn + T.StabiliseTurns + 1;
            Clog(s, $"{f.Name} stabilises {n.Name}. It holds for {T.StabiliseTurns} more turns.", n.Id, f.Id);
        }

        static void SpendMaterials(Faction f, int amount)
        {
            if (f.Materials < amount) throw new GameError("Not enough materials");
            f.Materials -= amount;
        }

        /// <summary>The side of the current battle the player is on (0 = attacker), or null.</summary>
        public static int? PlayerSeat(CampaignState s)
        {
            if (s.Battle == null) return null;
            if (s.Battle.Attacker == s.PlayerId) return 0;
            if (s.Battle.Defender == s.PlayerId) return 1;
            return null;
        }

        /// <summary>An action as the TypeScript engine writes it (JSON), read into a CampaignAction: its fields' shapes depend on its type.</summary>
        public static CampaignAction ActionFrom(JObject j)
        {
            var a = new CampaignAction { Type = (string)j["type"] };
            string Str(string k) => j[k] == null || j[k].Type == JTokenType.Null ? null : (string)j[k];
            int? Int(string k) => j[k] == null || j[k].Type == JTokenType.Null ? (int?)null : (int)j[k];
            bool? Bool(string k) => j[k] == null || j[k].Type == JTokenType.Null ? (bool?)null : (bool)j[k];
            a.ArmyId = Str("armyId");
            a.ToId = Str("toId");
            a.NodeId = Str("nodeId");
            a.DefId = Str("defId");
            a.ProjectId = Str("projectId");
            a.All = Bool("all");
            a.Auto = Bool("auto");
            a.Pick = Str("pick");
            a.Choice = Str("choice");
            a.Stepwise = Bool("stepwise");
            a.Recruit = Bool("recruit");
            a.Out = Str("out");
            a.PartId = Str("partId");
            a.ReserveIndex = Int("reserveIndex");
            if (j["game"] != null) a.Game = j["game"].ToObject<GameState>(Newtonsoft.Json.JsonSerializer.Create(Json.Settings));
            if (j.ContainsKey("salvage"))
            {
                a.Salvage = Str("salvage");
                a.SalvageNone = a.Salvage == null;
            }
            if (j.ContainsKey("index"))
            {
                a.Index = Int("index");
                a.IndexNone = a.Index == null;
            }
            if (a.Type == "fuse")
            {
                a.FuseA = Int("a");
                a.FuseB = Int("b");
            }
            else
            {
                a.A = Str("a");
                a.B = Str("b");
            }
            if (a.Type == "swapPart") a.PartSlot = Str("slot");
            else a.Slot = Int("slot");
            return a;
        }

        static readonly string[] DuringEncounter = { "encounter", "joinedSeen", "crewSwap", "chooseCard", "dismissLoot", "finishBattle", "aiStep", "petalsBanked" };
        static readonly string[] DuringRewards = { "chooseCard", "finishBattle", "conquer", "aiStep", "dismissLoot" };

        /// <summary>The campaign's reducer: a new state with the action applied (the old one untouched).</summary>
        public static CampaignState Apply(CampaignState prev, CampaignAction action)
        {
            if (prev.Winner != null && action.Type != "readStory" && action.Type != "petalsBanked") throw new GameError("The run is over.");
            var s = Json.Clone(prev);
            if (action.Type == "readStory")
            {
                if (s.Story.Queue.Count > 0) s.Story.Queue.RemoveAt(0);
                return s;
            }
            if (action.Type == "petalsBanked")
            {
                s.PetalsBanked = s.Petals;
                s.XpBanked = s.Xp ?? 0;
                s.StarsBanked = s.StarsTaken ?? 0;
                s.PartsBanked = s.PartsFound?.Count ?? 0;
                s.FreedBanked = s.Freed?.Count ?? 0;
                s.SparedBanked = s.Spared ?? 0;
                s.HuntedBanked = s.Hunted ?? 0;
                s.CompanionXp = new Dictionary<string, int>();
                return s;
            }
            var f = Player(s);
            if (s.Battle != null && action.Type != "finishBattle") throw new GameError("Finish the battle first.");
            if (s.Phase == "ai" && action.Type != "finishBattle" && action.Type != "chooseCard" && action.Type != "aiStep") throw new GameError("Wait for the other factions to finish their turns.");
            if (s.Conquest != null && action.Type != "conquer") throw new GameError("Decide the fate of the conquered system first.");
            if (s.Encounter != null && s.Battle == null && !DuringEncounter.Contains(action.Type)) throw new GameError("Someone is alongside: answer them first.");
            if (s.CardRewards.Count > 0 && !DuringRewards.Contains(action.Type)) throw new GameError("Choose your card first");

            switch (action.Type)
            {
                case "move":
                {
                    var army = ArmyById(s, action.ArmyId);
                    if (army.Owner != f.Id) throw new GameError("That army is not yours.");
                    MoveArmy(s, army, action.ToId);
                    break;
                }
                case "deckAdd":
                {
                    var army = ArmyById(s, action.ArmyId);
                    if (army.Owner != f.Id) throw new GameError("That army is not yours.");
                    var problem = DeckAddProblem(f, army, action.DefId);
                    if (problem != null) throw new GameError(problem);
                    f.Reserve.RemoveAt(f.Reserve.IndexOf(action.DefId));
                    army.Deck.Add(action.DefId);
                    break;
                }
                case "deckRemove":
                {
                    var army = ArmyById(s, action.ArmyId);
                    if (army.Owner != f.Id) throw new GameError("That army is not yours.");
                    var problem = DeckRemoveProblem(army, action.DefId);
                    if (problem != null) throw new GameError(problem);
                    army.Deck.RemoveAt(army.Deck.LastIndexOf(action.DefId));
                    f.Reserve.Add(action.DefId);
                    break;
                }
                case "recycle":
                {
                    if (action.NodeId != null)
                    {
                        var n = NodeById(s, action.NodeId);
                        var why = RecycleProblem(s, f, n, action.DefId);
                        if (why != null) throw new GameError(why);
                        var army = Flagship(s, f.Id);
                        army.Deck.RemoveAt(army.Deck.LastIndexOf(action.DefId));
                        (n.Station.Used ??= new StationUsed()).Recycle = true;
                        int value = RecycleValue(action.DefId);
                        f.Materials += value;
                        Clog(s, $"{f.Name} recycles {Cards.Def(action.DefId).Name} for {value} materials.", n.Id, f.Id);
                        break;
                    }
                    int i = f.Reserve.IndexOf(action.DefId);
                    if (i < 0) throw new GameError($"{Cards.Def(action.DefId).Name} is not in your reserve.");
                    f.Reserve.RemoveAt(i);
                    int v = RecycleValue(action.DefId);
                    f.Materials += v;
                    Clog(s, $"{f.Name} recycles {Cards.Def(action.DefId).Name} for {v} materials.");
                    break;
                }
                case "research":
                    TakeResearch(s, f, NodeById(s, action.NodeId), action.ProjectId);
                    break;
                case "stabilise":
                {
                    var n = NodeById(s, action.NodeId);
                    var problem = StabiliseProblem(f, n);
                    if (problem != null) throw new GameError(problem);
                    Stabilise(s, f, n);
                    break;
                }
                case "healArmy":
                {
                    var army = ArmyById(s, action.ArmyId);
                    if (army.Owner != f.Id) throw new GameError("That army is not yours.");
                    if (NodeById(s, army.NodeId).Station?.Kind != "armory") throw new GameError("Your flagship can only be repaired at a space station.");
                    if (army.Damage <= 0) throw new GameError($"{Cards.Def(army.General).Name}'s army is not damaged.");
                    SpendMaterials(f, T.ArmyHealCost);
                    army.Damage -= 1;
                    while (action.All == true && army.Damage > 0 && f.Materials >= T.ArmyHealCost)
                    {
                        f.Materials -= T.ArmyHealCost;
                        army.Damage -= 1;
                    }
                    break;
                }
                case "finishBattle":
                {
                    if (s.Battle == null) throw new GameError("There is no battle to finish.");
                    var before = LootMark(s);
                    var game = action.Auto == true ? SimulateBattle(action.Game) : action.Game;
                    var mine = game.Players.FirstOrDefault(p => !p.IsAI);
                    int universe = s.Universe;
                    ResolveBattle(s, game, action.Salvage, action.SalvageNone == true);
                    var loot = LootSince(s, before, mine != null && game.WinnerId == mine.Id);
                    // (The Overlord beaten, the flagship through its wormhole: the galaxy cleared.)
                    if (loot.Won && s.Universe != universe) loot.Cleared = true;
                    s.Loot = AnyLoot(loot) ? loot : null;
                    break;
                }
                case "dismissLoot":
                    s.Loot = null;
                    break;
                case "takeBoon":
                {
                    if (s.Boon == null) throw new GameError("There is nothing to choose.");
                    var army = Flagship(s, s.PlayerId);
                    if (action.Pick == "health")
                    {
                        f.SunBonus = (f.SunBonus ?? 0) + 5;
                        Clog(s, $"{f.Name}'s sun is tempered by the cold: +5 max health, for good.");
                    }
                    else if (army != null)
                    {
                        army.Damage = Math.Max(Balance.MinHeat, army.Damage - 6);
                        Clog(s, $"{f.Name}'s sun drinks in the cold: cooled by 6.");
                    }
                    s.Boon = null;
                    break;
                }
                case "prophetPick":
                {
                    if (s.Prophet == null) throw new GameError("There is no prophet waiting.");
                    ProphetOffer offer = action.Index == null ? null : action.Index.Value >= 0 && action.Index.Value < s.Prophet.Offers.Count ? s.Prophet.Offers[action.Index.Value] : null;
                    var army = Flagship(s, s.PlayerId);
                    if (action.Index != null && offer == null) throw new GameError("That is not one of the offers.");
                    if (offer != null && army != null)
                    {
                        int i = army.Deck.IndexOf(offer.Card);
                        if (i >= 0)
                        {
                            army.Deck[i] = Builds.MarkedId(offer.Mark, offer.Card);
                            Clog(s, $"The Dark Prophet marks {Cards.Def(offer.Card).Name}: {Builds.D.NyxMarks[offer.Mark].Name}, for good.", s.Prophet.NodeId, f.Id);
                        }
                    }
                    else Clog(s, "The Dark Prophet is turned away.", s.Prophet.NodeId, f.Id);
                    s.Prophet = null;
                    break;
                }
                case "struggle":
                    if (s.Struggle == null) throw new GameError("No one has come for your command.");
                    StartStruggle(s);
                    break;
                case "encounter":
                    ChooseEncounter(s, action.Choice);
                    break;
                case "crewSwap":
                    CrewSwap(s, action.Out);
                    break;
                case "joinedSeen":
                    if (s.Joined?.FirstOrDefault()?.Swap == true) throw new GameError("Choose who flies first.");
                    s.Joined = s.Joined?.Skip(1).ToList();
                    if ((s.Joined?.Count ?? 0) == 0) s.Joined = null;
                    break;
                case "swapPart":
                {
                    var n = NodeById(s, action.NodeId);
                    var why = SwapPartProblem(s, f, n, action.PartSlot, action.PartId);
                    if (why != null) throw new GameError(why);
                    var fitted = new Dictionary<string, string>(s.Run?.Ship?.Fitted ?? new Dictionary<string, string>());
                    if (action.PartId == null) fitted.Remove(action.PartSlot);
                    else
                    {
                        foreach (var k in fitted.Keys.ToList()) if (fitted[k] == action.PartId) fitted.Remove(k);
                        fitted[action.PartSlot] = action.PartId;
                    }
                    var run = s.Run != null ? Json.Clone(s.Run) : Meta.RunBonuses(null);
                    run.Ship = Parts.ShipFit(fitted);
                    s.Run = run;
                    if (n.Station?.Kind == "armory") (n.Station.Used ??= new StationUsed()).Part = true;
                    Clog(s, action.PartId != null ? $"{f.Name} fits {Parts.ShipPart(action.PartId).Name} at {n.Name}." : $"{f.Name} strips a part at {n.Name}.", n.Id, f.Id);
                    MeetEngineer(s, n);
                    break;
                }
                case "struggleChoice":
                {
                    if (s.Beaten == null) throw new GameError("There is no one to decide on.");
                    var before = LootMark(s);
                    DecideBeaten(s, action.Recruit == true);
                    var loot = LootSince(s, before, true);
                    if (action.Recruit != true && (loot.Materials != 0 || loot.Petals != 0 || (loot.Parts?.Count ?? 0) > 0)) s.Loot = loot;
                    break;
                }
                case "dream":
                    if (s.Dream == null) throw new GameError("There is no dream.");
                    if (s.Struggle != null) throw new GameError("Your command is contested first.");
                    StartDream(s);
                    break;
                case "chooseEmblem":
                {
                    var pick = action.Index != null && s.EmblemChoice != null && action.Index.Value >= 0 && action.Index.Value < s.EmblemChoice.Count ? s.EmblemChoice[action.Index.Value] : null;
                    if (pick == null) throw new GameError("There is no emblem to choose.");
                    (f.Relics ??= new List<Relic>()).Add(pick);
                    Clog(s, $"{f.Name} takes {pick.Name}.", (string)null, f.Id);
                    s.EmblemChoice = null;
                    break;
                }
                case "conquer":
                {
                    if (s.Conquest == null) throw new GameError("There is nothing to decide.");
                    var n = NodeById(s, s.Conquest.NodeId);
                    var army = s.Armies.FirstOrDefault(a => a.Id == s.Conquest.ArmyId);
                    s.Conquest = null;
                    Conquer(s, f, n, army);
                    break;
                }
                case "chooseCard":
                {
                    var reward = s.CardRewards.FirstOrDefault() ?? throw new GameError("No card to choose.");
                    if (action.DefId != null && !reward.Options.Contains(action.DefId)) throw new GameError("That card is not on offer.");
                    s.CardRewards.RemoveAt(0);
                    if (action.DefId != null && reward.ToDeck != null) TakeSalvage(s, f, s.Armies.FirstOrDefault(a => a.Id == reward.ToDeck), action.DefId, reward.Take ?? "salvages");
                    else if (action.DefId != null)
                    {
                        Clog(s, $"{f.Name} takes {Cards.Def(action.DefId).Name}.");
                        GainCard(s, f, action.DefId);
                    }
                    break;
                }
                case "buyCard":
                    BuyCard(s, f, NodeById(s, action.NodeId), action.Index ?? -1);
                    break;
                case "fuse":
                {
                    int ia = action.FuseA ?? -1, ib = action.FuseB ?? -1;
                    var a = ia >= 0 && ia < f.Reserve.Count ? f.Reserve[ia] : null;
                    var b = ib >= 0 && ib < f.Reserve.Count ? f.Reserve[ib] : null;
                    if (a == null || b == null || ia == ib) throw new GameError("Choose two different cards from your reserve.");
                    var problem = FusionProblem(a, b);
                    if (problem != null) throw new GameError(problem);
                    SpendMaterials(f, FusionCost(a, b));
                    foreach (var i in new[] { ia, ib }.OrderByDescending(x => x)) f.Reserve.RemoveAt(i);
                    var id = Builds.FusedId(a, b);
                    f.Reserve.Add(id);
                    Clog(s, $"{f.Name} fuses {Cards.Def(a).Name} and {Cards.Def(b).Name} into {Cards.Def(id).Name}.");
                    break;
                }
                case "fuseDeck":
                {
                    var n = NodeById(s, action.NodeId);
                    var why = FuseProblem(s, f, n, action.A, action.B);
                    if (why != null) throw new GameError(why);
                    var army = Flagship(s, f.Id);
                    SpendMaterials(f, FusionCost(action.A, action.B));
                    foreach (var x in new[] { action.A, action.B }) army.Deck.RemoveAt(army.Deck.LastIndexOf(x));
                    var id = Builds.FusedId(action.A, action.B);
                    army.Deck.Add(id);
                    (n.Station.Used ??= new StationUsed()).Fuse = true;
                    Clog(s, $"{f.Name} fuses {Cards.Def(action.A).Name} and {Cards.Def(action.B).Name} into {Cards.Def(id).Name}.", n.Id, f.Id);
                    break;
                }
                case "deckSwap":
                {
                    var army = ArmyById(s, action.ArmyId);
                    if (army.Owner != f.Id) throw new GameError("That army is not yours.");
                    int slot = action.Slot ?? -1, ri = action.ReserveIndex ?? -1;
                    var problem = DeckSwapProblem(f, army, slot, ri);
                    if (problem != null) throw new GameError(problem);
                    var o = army.Deck[slot];
                    army.Deck[slot] = f.Reserve[ri];
                    f.Reserve[ri] = o;
                    break;
                }
                case "endTurn":
                    EndFactionTurn(s, f);
                    TurnTime(s);
                    s.AiQueue = new List<string>();
                    s.AiStepwise = null;
                    NewTurn(s);
                    break;
                case "aiStep":
                    throw new GameError("It is your turn.");
            }
            NoticeStory(s);
            return s;
        }
    }
}
