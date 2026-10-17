using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    public static partial class Game
    {
        static void StartTurn(GameState state)
        {
            var p = ActivePlayer(state);
            var dream = state.Challenge?.Kind == "dream" ? state.Challenge : null;
            if (dream != null && state.WinnerId == null)
            {
                var dreamer = state.Players[0];
                var rival = state.Players[1];
                if (dream.Goal == "win" && p == rival && dreamer.TurnsTaken >= (dream.Days ?? 1))
                {
                    Log(state, "The dream slips away: the day is over.");
                    dreamer.Eliminated = true;
                    state.WinnerId = rival.Id;
                    return;
                }
                if (dream.Goal == "survive" && p == dreamer && dreamer.TurnsTaken >= 1)
                {
                    Log(state, "The night is lived through: the dream holds.");
                    rival.Eliminated = true;
                    state.WinnerId = dreamer.Id;
                    return;
                }
            }
            if (state.KeepPulses != true) state.TurnPulses = new List<TurnPulse>();
            state.KeepPulses = null;
            p.TurnsTaken += 1;
            p.Banked = null;
            foreach (var c in p.Tableau)
            {
                c.Fortified = null;
                c.Dimmed = null;
                c.Fresh = null;
                c.SpentAttack = null;
            }
            foreach (var o in state.Players)
                foreach (var c in o.Tableau)
                    if (c.ChilledBy == p.Id)
                    {
                        c.Chill = null;
                        c.ChilledBy = null;
                    }
            p.Turn = EmptyTurn();
            Log(state, $"— Day {state.TurnNumber}: {p.Name}.");
            Charge(state, p, "dawns");
            if (IsOverheated(p)) Charge(state, p, "hotDawns");
            MendDefences(state, p);

            bool keep = Passives(p).Any(x => x.passive.Type == "keepShields");
            if (!(state.Campaign == true && p.TurnsTaken == 1)) p.Shields = keep ? Math.Min(p.Shields, Balance.MaxKeptShields) : 0;
            foreach (var c in p.Tableau) c.Shields = null;

            if (p.TurnsTaken > 1)
            {
                var before = CurrentPlanet(p);
                p.Orbit = (p.Orbit + 1) % OrbitLength;
                Charge(state, p, "orbit");
                if (CurrentPlanet(p) != before) Log(state, $"The {CurrentPlanet(p)} planet swings round to face {p.Name}'s sun.");
            }
            SalvageWreck(state, p);
            foreach (var c in p.Tableau) Credit(state, p, c.Uid, "dawns", 1);
            int abundance = CurrentPlanet(p, state) == "abundant" ? Balance.AbundantDraw + (p.Modifiers?.AbundantDraw ?? 0) : 0;
            if (p.TurnsTaken > 1) DrawCards(state, p, Balance.DrawPerTurn + (p.Modifiers?.ExtraDraw ?? 0) + abundance);
            if (state.WinnerId != null) return;
            if (p.Eliminated) { PassOn(state); return; }

            NotePulse(state, p, null, "start", p, 0);
            if (state.Players.FirstOrDefault(x => !x.Eliminated) == p && p.ExtraDay != state.TurnNumber) RegionalInstability(state, p);
            if (state.WinnerId != null) return;
            if (p.Eliminated) { PassOn(state); return; }
            var m = p.Modifiers;
            if ((m?.HeatPerTurn ?? 0) != 0)
            {
                ApplyHeat(state, p, m.HeatPerTurn.Value, null, false, null, false, "this battlefield");
                NotePulse(state, p, null, "unstable", p, m.HeatPerTurn.Value);
                WaveHitsCards(state, p, p);
            }
            if ((m?.CoolPerTurn ?? 0) != 0)
            {
                Cool(state, p, m.CoolPerTurn.Value, "this battlefield");
                NotePulse(state, p, null, "cool", p, m.CoolPerTurn.Value);
            }
            if ((m?.ShieldPerTurn ?? 0) != 0)
            {
                p.Shields += m.ShieldPerTurn.Value;
                NotePulse(state, p, null, "shield", p, m.ShieldPerTurn.Value);
            }
            if (FieldActive(state, "solarStorm"))
            {
                Log(state, $"Solar Storm batters {p.Name}.");
                ApplyHeat(state, p, 1, null, false, null, false, "Solar Storm");
                NotePulse(state, p, ActiveGlobal(state)?.Card, "unstable", p, 1);
            }
            if (FieldActive(state, "iceAge"))
            {
                Cool(state, p, 1, "Ice Age");
                NotePulse(state, p, ActiveGlobal(state)?.Card, "cool", p, 1);
            }
            Dawn(state, p);
            if (p.Boss != null && state.Challenge != null && state.WinnerId == null) ChallengeDay(state, p);
            if (p.Boss != null && state.WinnerId == null && !p.Eliminated) BossAct(state, p);
        }

        static void Dawn(GameState state, PlayerState p)
        {
            BeginTally(state, "dawn", p);
            try
            {
                DawnResolve(state, p);
            }
            finally
            {
                FlushTally(state);
            }
            p.PlaysLeft = PlaysAllowed(state, p) + (p.Turn.DawnEnergy ?? 0);
            p.Turn.EnergyTotal = p.PlaysLeft;
            p.Turn.EnergyBase = Math.Min(p.PlaysLeft, Math.Min(p.TurnsTaken, Balance.MaxPlays));
            if (p.Eliminated) PassOn(state);
        }

        static void DawnResolve(GameState state, PlayerState p)
        {
            p.DawnChoices = p.DawnChoices?.Where(c => c.Kind == "aim").ToList();
            if (p.DawnChoices == null || p.DawnChoices.Count == 0) p.DawnChoices = null;
            bool hushed = Silenced(state, p);
            if (hushed && p.Tableau.Any(c => DawnEffects(c, p, state).Count > 0)) Log(state, $"Null Edict: {p.Name}'s cards stay silent at dawn.");
            foreach (var card in hushed ? new List<CardInstance>() : p.Tableau.ToList())
            {
                if (state.WinnerId != null || p.Eliminated) break;
                if (!p.Tableau.Contains(card)) continue;
                var effects = DawnEffects(card, p, state);
                bool Waits(Effect e) => (e.Type == "shift" && e.Enemy != true) || e.Type == "recall";
                ResolveEffects(state, p, card, effects.Where(e => !Waits(e)).ToList(), "turn");
                foreach (var e in effects.Where(Waits))
                {
                    var kind = e.Type == "recall" ? "recall" : "shift";
                    bool could = kind == "recall" ? p.Tableau.Any(c => c.Uid != card.Uid && Returnable(c)) : p.Tableau.Any(c => c.Slot != CommandSlot);
                    if (could) (p.DawnChoices ??= new List<DawnChoice>()).Add(new DawnChoice { Uid = card.Uid, Kind = kind });
                }
            }
            bool deadFacing = CurrentPlanet(p, state) == "dead" && !PlanetsEaten(state, p);
            int paradise = Relics.N(p.Relics, "paradise") + (p.Modifiers?.Paradise ?? 0);
            if (paradise != 0 && deadFacing)
            {
                Log(state, $"The paradise planet faces {p.Name}'s sun: renew {paradise}.");
                foreach (var c in p.Tableau.ToList()) if (Cards.Def(c.DefId).Kind != "relic") Mend(state, p, c, paradise);
            }
            int deadCool = p.Modifiers?.DeadCool ?? 0;
            if (deadCool != 0 && deadFacing)
            {
                Cool(state, p, deadCool, "the cold dead planet");
                NotePulse(state, p, null, "cool", p, deadCool);
            }
            RelicSear(state, p);
            if (state.WinnerId != null || p.Eliminated) return;
            int mendBy = Relics.N(p.Relics, "mend");
            if (mendBy != 0)
            {
                Log(state, $"{p.Name}'s {Relics.Of(p.Relics, "mend").Name}: dawn repair {mendBy}.");
                Repair(state, p, mendBy, true);
            }
            int gift = Relics.N(p.Relics, "gift");
            var given = gift != 0 ? GiftCard(state, p, gift) : null;
            if (given != null)
            {
                p.Hand.Add(NewCard(state, given));
                Log(state, $"{p.Name}'s {Relics.Of(p.Relics, "gift").Name} gives them {Cards.Def(given).Name}.");
            }
            foreach (var r in p.Relics ?? new List<RelicInPlay>())
            {
                var def = Relics.Powers[r.Power];
                if (def.Kind != "daily" || (p.Skills?.Any(k => k.Relic == r.Name) ?? false)) continue;
                (p.Skills ??= new List<BattleSkill>()).Add(new BattleSkill { Id = $"relic-{r.Name}", Name = r.Name, Text = def.Text(r.N), Hero = CommandCard(p)?.DefId ?? "", Effects = def.Effects(r.N), Cost = 0, Once = false, Relic = r.Name, Choices = def.Choices?.Invoke(r.N) });
            }
            foreach (var card in p.Tableau.ToList()) if (Anchored(p, card) && Cards.Def(card.DefId).Kind != "relic") Mend(state, p, card, 1);
        }

        static void Dusk(GameState state, PlayerState p)
        {
            var cards = p.Tableau.Where(c => c.Fresh != true && DuskEffects(c).Any(e => ConditionMet(p, e.If, state, c))).ToList();
            state.LastDusk = new LastDusk { PlayerId = p.Id, Acted = false };
            if (cards.Count == 0) return;
            if (Silenced(state, p))
            {
                Log(state, $"Null Edict: {p.Name}'s cards stay silent at dusk.");
                return;
            }
            state.LastDusk.Acted = true;
            NotePulse(state, p, null, "start", p, 0);
            BeginTally(state, "dusk", p);
            try
            {
                foreach (var card in cards)
                {
                    if (state.WinnerId != null || p.Eliminated) break;
                    if (!p.Tableau.Contains(card) || card.Fresh == true) continue;
                    ResolveEffects(state, p, card, DuskEffects(card), "turn");
                }
            }
            finally
            {
                FlushTally(state);
            }
        }

        /// <summary>The most cards a player may hold after dusk (a Grasp emblem holds more, and Deep holds, from the skill tree).</summary>
        public static int MaxHand(PlayerState p) => Balance.MaxHand + Relics.N(p.Relics, "grasp") + (p.Modifiers?.HandSize ?? 0);

        static void TrimHand(GameState state, PlayerState p, List<string> picked = null)
        {
            picked ??= new List<string>();
            int over = p.Hand.Count - MaxHand(p);
            if (over <= 0) return;
            var chosen = picked.Distinct().Select(uid => p.Hand.FirstOrDefault(c => c.Uid == uid)).Where(c => c != null).Take(over).ToList();
            bool keepHero = CommandCard(p) == null;
            var rest = Sorted(p.Hand.Where(c => !chosen.Contains(c)), (a, b) =>
            {
                int d = (keepHero && Cards.Def(a.DefId).Kind == "command" ? 1 : 0) - (keepHero && Cards.Def(b.DefId).Kind == "command" ? 1 : 0);
                return d != 0 ? d : CardCost(b.DefId) - CardCost(a.DefId);
            });
            var outCards = chosen.Concat(rest.Take(over - chosen.Count)).ToList();
            p.Hand = p.Hand.Where(c => !outCards.Contains(c)).ToList();
            ToWreck(p, outCards.ToArray());
            Log(state, $"{p.Name} holds more than {MaxHand(p)} cards and discards {string.Join(", ", outCards.Select(c => Cards.Def(c.DefId).Name))}.");
        }

        static void PassOn(GameState state)
        {
            if (state.WinnerId == null) AdvanceTurn(state);
        }

        static void AdvanceTurn(GameState state)
        {
            if (state.WinnerId != null) return;
            for (;;)
            {
                state.ActivePlayerIndex = (state.ActivePlayerIndex + 1) % state.Players.Count;
                if (state.ActivePlayerIndex == 0) state.Round += 1;
                var q = ActivePlayer(state);
                if (q.Eliminated) continue;
                if ((q.SkipDays ?? 0) != 0)
                {
                    q.SkipDays -= 1;
                    if (q.SkipDays == 0) q.SkipDays = null;
                    state.TurnNumber += 1;
                    Log(state, $"— {q.Name}'s day never comes: the clock stands still.");
                    continue;
                }
                break;
            }
            state.TurnNumber += 1;
            StartTurn(state);
        }

        static bool SecondDawn(GameState state, PlayerState p)
        {
            if (state.WinnerId != null || !HasPower(p, "secondDawn") || p.ExtraDay == state.TurnNumber || state.Challenge?.Kind == "dream") return false;
            state.TurnNumber += 1;
            p.ExtraDay = state.TurnNumber;
            Log(state, $"The Second Dawn: {p.Name}'s day breaks again.");
            StartTurn(state);
            return true;
        }

        static List<PlayerState> OthersInOrder(GameState state, PlayerState p)
        {
            int n = state.Players.Count;
            int seat = SeatOf(state, p);
            return Enumerable.Range(0, n - 1).Select(k => state.Players[(seat + k + 1) % n]).Where(o => !o.Eliminated).ToList();
        }

        static void ChallengeDay(GameState state, PlayerState p)
        {
            var c = state.Challenge;
            if (c.Days != null)
            {
                c.Days -= 1;
                if (c.Days <= 0)
                {
                    var them = state.Players.FirstOrDefault(x => x != p && !x.Eliminated);
                    if (c.Kind == "crystal")
                    {
                        Log(state, "The crystal holds.");
                        if (them != null) them.Eliminated = true;
                        state.WinnerId = p.Id;
                        return;
                    }
                    Log(state, c.Kind == "mine" ? $"The mine seals itself: {c.Broken} crystal{(c.Broken == 1 ? "" : "s")} broken." : $"{them?.Name ?? "The challenger"} holds the line: the storm is spent.");
                    p.Eliminated = true;
                    state.WinnerId = them?.Id;
                    return;
                }
            }
            if (c.Spawn == null || c.Spawn.Count == 0) return;
            var open = SlotsBySafety().Where(i => FreeSlots(p).Contains(i) && i != CommandSlot).Take(c.Per ?? 99).ToList();
            for (int i = 0; i < open.Count; i++) Place(p, NewCard(state, c.Spawn[i % c.Spawn.Count]), open[i]);
            if (open.Count > 0) Log(state, c.Kind == "mine" ? $"{open.Count} more crystal{(open.Count == 1 ? "" : "s")} grow{(open.Count == 1 ? "s" : "")} in the mine." : $"A wave: {open.Count} more come out of the cold.");
        }

        public class Aim { public int Sun; public List<(string uid, int heat)> Cards = new List<(string, int)>(); }

        public static Aim BossAim(GameState state, PlayerState p)
        {
            var intent = BossIntent(p);
            return intent != null ? PartAim(state, p, intent.Value.card) : new Aim();
        }

        public static Aim PartAim(GameState state, PlayerState p, CardInstance part)
        {
            var o = new Aim();
            var t = TargetOf(state, p);
            var action = Cards.Def(part.DefId).BossAction;
            if (action == null || t == null) return o;
            void Add(string uid, int heat)
            {
                int i = o.Cards.FindIndex(x => x.uid == uid);
                if (i >= 0) o.Cards[i] = (uid, o.Cards[i].heat + heat);
                else o.Cards.Add((uid, heat));
            }
            foreach (var e in action.Effects)
            {
                if (e.Type == "heat" && e.To == "target")
                {
                    // (A Guard steps in front of the sun.)
                    var g = BlowGuard(state, t);
                    if (g != null) Add(g.Uid, e.Amount ?? 0);
                    else o.Sun += e.Amount ?? 0;
                }
                else if (e.Type == "strikeBest" || e.Type == "strikeAll")
                {
                    var hit = StrikeHits(state, t, e, true);
                    if (hit.Count > 0) foreach (var c in hit) Add(c.Uid, e.Amount ?? 0);
                    else o.Sun += e.Amount ?? 0;
                }
                else if (e.Type == "devour")
                {
                    var v = DevourVictim(t, true);
                    if (v != null) Add(v.Uid, 0);
                    else o.Sun += DevourSunHeat;
                }
            }
            return o;
        }

        static double BossActionScore(GameState state, PlayerState p, CardInstance part)
        {
            var t = TargetOf(state, p);
            var action = Cards.Def(part.DefId).BossAction;
            if (t == null || action == null) return 0;
            var aim = PartAim(state, p, part);
            double score = 0;
            int minions = BossMinions(p).Sum(m => PartAim(state, p, m).Sun);
            int through = Math.Max(0, aim.Sun + minions - t.Shields) - Math.Max(0, minions - t.Shields);
            if (aim.Sun > 0 && t.Heat + Math.Max(0, aim.Sun + minions - t.Shields) >= SupernovaThreshold(t)) score += 1000;
            score += through * (1 + (double)Math.Max(0, t.Heat) / Math.Max(1, SupernovaThreshold(t)));
            foreach (var (uid, heat) in aim.Cards)
            {
                var c = t.Tableau.FirstOrDefault(x => x.Uid == uid);
                if (c == null) continue;
                int worth = CardCost(c.DefId) + CardAttack(state, t, c) + 1;
                if (heat == 0)
                {
                    score += worth * 1.5 + 3;
                    continue;
                }
                int lasts = (c.Shields ?? 0) + CardDefence(t, c) + (c.Health ?? 0);
                score += Math.Min(heat, lasts) * 0.9 + (heat >= lasts ? worth * 1.5 : 0);
            }
            foreach (var e in action.Effects)
            {
                if (e.Type == "shield") score += (e.Amount ?? 0) * 0.5;
                else if (e.Type == "restore") score += p.Tableau.Sum(c => Math.Min(e.Amount ?? 0, Math.Max(0, (c.MaxHealth ?? c.Health ?? 0) - (c.Health ?? 0)))) * 0.7;
                else if (e.Type == "summon") score += Math.Min(e.Amount ?? 0, FreeSlots(p).Count(i => i != CommandSlot)) * 2;
            }
            return score;
        }

        /// <summary>How many of a Lost Overlord's days its own action (the Overlord's, on its Hero card) recharges once
        /// used: ready again on the third (game.ts BOSS_RECHARGE).</summary>
        public const int BossRecharge = 2;

        /// <summary>Days more a Lost Overlord's own action takes against its rivals (the most any of them has: Flagship's pride).</summary>
        public static int OverlordSlow(GameState state, PlayerState p) =>
            state.Players.Aggregate(0, (n, q) => q == p || q.Boss != null ? n : Math.Max(n, q.Modifiers?.OverlordSlow ?? 0));

        /// <summary>Whether a part's action is the Overlord's own: once used, it recharges.</summary>
        public static bool Recharges(CardInstance c) => Cards.Def(c.DefId).OverlordPart == "overlord";

        /// <summary>Whether a part's action is recharging, not to be chosen yet.</summary>
        public static bool Charging(PlayerState p, CardInstance c) => Recharges(c) && (p.Boss?.Charge ?? 0) > 0;

        /// <summary>A Lost Overlord's next action, chosen for the board as it stands: its best, the first in its turn
        /// order on a tie, never its own action while that recharges (with nothing else to act, none).</summary>
        public static void ChooseBossIntent(GameState state, PlayerState p)
        {
            if (p.Boss == null) return;
            CardInstance best = null;
            double top = double.NegativeInfinity;
            foreach (var c in BossOrder(p).Where(c => !Charging(p, c)))
            {
                double v = BossActionScore(state, p, c);
                if (v > top) { best = c; top = v; }
            }
            p.Boss.Intent = best?.Uid;
        }

        static void RechooseBossIntents(GameState state)
        {
            if (state.WinnerId != null) return;
            foreach (var p in state.Players) if (p.Boss != null && !p.Eliminated) ChooseBossIntent(state, p);
        }

        static readonly HashSet<string> BodyParts = new HashSet<string> { "overlord", "body", "gear", "lost lord", "vault" };

        static bool ActsAlone(CardInstance c) => Cards.Def(c.DefId).BossAction != null && !BodyParts.Contains(Cards.Def(c.DefId).OverlordPart ?? "");

        public static List<CardInstance> BossMinions(PlayerState p) => Sorted(p.Tableau.Where(ActsAlone), (a, b) => (a.Slot ?? 0) - (b.Slot ?? 0));

        public static List<CardInstance> BossOrder(PlayerState p) =>
            Sorted(p.Tableau.Where(c => Cards.Def(c.DefId).BossAction != null && !ActsAlone(c)), (a, b) => (a.Slot == CommandSlot ? 99 : a.Slot ?? 0) - (b.Slot == CommandSlot ? 99 : b.Slot ?? 0));

        public static (CardInstance card, string name)? BossIntent(PlayerState p)
        {
            var card = p.Boss?.Intent != null ? p.Tableau.FirstOrDefault(c => c.Uid == p.Boss.Intent) : null;
            var a = card != null ? Cards.Def(card.DefId).BossAction : null;
            return card != null && a != null ? (card, a.Name) : ((CardInstance, string)?)null;
        }

        static void BossAct(GameState state, PlayerState p)
        {
            var intent = BossIntent(p);
            bool used = intent != null && Recharges(intent.Value.card);
            if (intent != null)
            {
                var a = Cards.Def(intent.Value.card.DefId).BossAction;
                Log(state, $"⚔ {p.Name}: {a.Name}!");
                ResolveEffects(state, p, intent.Value.card, a.Effects, "turn", new PlayContext { Blow = true });
            }
            else
            {
                var own = BossOrder(p).FirstOrDefault(c => Charging(p, c));
                if (own != null) Log(state, $"{p.Name} gathers itself: its {Cards.Def(own.DefId).BossAction.Name} is still charging.");
                else if (p.Boss?.Leader != null) Log(state, $"{p.Name} reaches for a part it no longer has, and staggers.");
            }
            // Its own action, used, recharges; else it comes a day nearer ready.
            if (p.Boss != null)
            {
                if (used) p.Boss.Charge = BossRecharge + OverlordSlow(state, p);
                else if (p.Boss.Charge != null && p.Boss.Charge > 0)
                {
                    p.Boss.Charge -= 1;
                    if (p.Boss.Charge <= 0) p.Boss.Charge = null;
                }
            }
            foreach (var m in BossMinions(p))
            {
                if (state.WinnerId != null || p.Eliminated || !p.Tableau.Contains(m)) continue;
                var a = Cards.Def(m.DefId).BossAction;
                Log(state, $"⚔ {p.Name}'s {Cards.Def(m.DefId).Name}: {a.Name}!");
                ResolveEffects(state, p, m, a.Effects, "turn", new PlayContext { Blow = true });
            }
            if (state.WinnerId != null || p.Eliminated || p.Boss == null) return;
            ChooseBossIntent(state, p);
        }

        // ---- Dreams of the Lost: a set position ----

        public class DreamCard { public string Id; public int Slot; public int? Health; public bool? Dimmed; }
        public class DreamSide { public int Heat; public int Max; public int? Shields; public List<DreamCard> Cards; }
        public class DreamSpec { public string Id; public int Tier; public string Goal; public int? Days; public int Race; public int Energy; public List<string> Hand; public DreamSide Me; public DreamSide Foe; }

        public static GameState CreateDream(DreamSpec spec, int seed, string name, string foeName, string mode = null)
        {
            var challenge = new Challenge { Kind = "dream", Goal = spec.Goal, Broken = 0 };
            if (spec.Days != null && spec.Days > 1) challenge.Days = spec.Days;
            var state = Create(new GameSetup
            {
                Seed = seed,
                Campaign = true,
                Mode = mode,
                Challenge = challenge,
                Players = new List<PlayerSetup>
                {
                    new PlayerSetup { Name = name, IsAI = false, Deck = new List<string>(), Modifiers = new BattleModifiers { MaxHealthDelta = spec.Me.Max - Balance.SupernovaAt } },
                    new PlayerSetup { Name = foeName, IsAI = true, Deck = new List<string>(), Modifiers = new BattleModifiers { MaxHealthDelta = spec.Foe.Max - Balance.SupernovaAt } },
                },
            });
            foreach (var (p, side) in new[] { (state.Players[0], spec.Me), (state.Players[1], spec.Foe) })
            {
                p.Heat = side.Heat;
                p.Shields = side.Shields ?? 0;
                p.Tableau = new List<CardInstance>();
                p.Deck = new List<CardInstance>();
                p.Discard = new List<CardInstance>();
                p.Wreck = new List<CardInstance>();
                p.Hand = new List<CardInstance>();
                foreach (var c in side.Cards)
                {
                    var card = NewCard(state, c.Id);
                    Place(p, card, c.Slot);
                    if (c.Health != null) card.Health = c.Health;
                    if (c.Dimmed == true) card.Dimmed = true;
                }
            }
            var me = state.Players[0];
            me.Hand = spec.Hand.Select(id => NewCard(state, id)).ToList();
            me.PlaysLeft = spec.Energy;
            state.Log = new List<LogEntry>();
            Log(state, spec.Goal == "win" ? (spec.Days != null && spec.Days > 1 ? $"A dream: win within {spec.Days} days." : "A dream: win before this day ends.") : "A dream: live through your rival's next day.");
            return state;
        }
    }
}
