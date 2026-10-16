using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>
    /// The AI (ai.ts), ported line for line: it weighs every move it could make by the state it leaves, and plays the
    /// best. Kept in step with the TypeScript AI by the recorded games (the same move chosen at every turn).
    /// </summary>
    public static class AI
    {
        public static double Horizon = 2.5, FinishRatio = 0.75, LeaderGap = 0.25, ActionValue = 2.5, EnergyHand = 4;
        public static double IncomingWeight = 0.8, LethalWeight = 30, RivalBoard = 0.45;
        public static bool Combos = true, EnergyContention = true;
        public static double LightspeedValue = 3, ColdHope = 1, HeroDays = 2.5, RiskPer = 0.25;
        const double RiskMax = 0.5;
        const double PlanetDead = 0, PlanetAbundant = 0.9, PlanetIndustrial = 1.3;
        const int OrbitHorizon = 4;
        const double SlotCost = 0.35;
        const int SlotDays = 2;
        public const double SingularityThreatValue = 5, SingularityHopeValue = 3;
        public const double ChillShare = 0.15, ChillSure = 0.8;

        static Dictionary<string, int> chargeFloor;

        static bool RunsCold(PlayerState p) =>
            p.Tableau.Any(c => (Cards.Def(c.DefId).OnTurn ?? new List<Effect>()).Concat(Cards.Def(c.DefId).OnPlay ?? new List<Effect>()).Any(e => e.Plus != null && e.Plus.Of == "cold" && e.Plus.Rival != true));

        static double VigilWorth(GameState state, PlayerState p, CardInstance card)
        {
            if (card == null || card.Fresh == true) return 0;
            double v = 0;
            foreach (var e in Game.DuskEffects(card))
            {
                if (e.If == null || e.If.Vigil == null) continue;
                if (e.Type == "heat") v += Game.EffectAmount(state, p, card, e, "turn");
                else if (e.Type == "cool") v += Game.EffectAmount(state, p, card, e, "turn") * (p.HeatExact > 0 ? 0.9 : 0.35);
                else if (e.Type == "shield") v += Game.EffectAmount(state, p, card, e, "turn") * 0.45;
                else if (e.Type == "draw") v += (e.Amount ?? 0) * 0.7;
                else if (e.Type == "grow" || e.Type == "growOthers") v += 0.5;
            }
            return v;
        }

        static double CardValue(GameState state, PlayerState p, CardInstance card)
        {
            var def = Cards.Def(card.DefId);
            int foes = Math.Max(1, Game.LivingOpponents(state, p).Count);
            double perTurn = 0;
            if (def.Rarity == "enigma" && ((def.Passive?.Count ?? 0) > 0 || (def.OnTurn?.Count ?? 0) > 0)) perTurn += 6;
            foreach (var e in Game.DawnEffects(card, p, state).Concat(Game.DuskEffects(card)))
            {
                if (!Game.ConditionMet(p, e.If, state) && !(e.If != null && e.If.MinKind != null)) continue;
                double scale = Game.ConditionMet(p, e.If, state) ? 1 : 0.4;
                switch (e.Type)
                {
                    case "heat":
                        perTurn += scale * Math.Max(Game.EffectAmount(state, p, card, e, "turn"), e.Plus?.Of == "growth" ? 2 : e.Plus?.Of == "cold" ? ColdHope * (e.Plus.Times ?? 1) : 0);
                        break;
                    case "cool":
                        perTurn += scale * Game.EffectAmount(state, p, card, e, "turn") * (p.HeatExact > 0 || RunsCold(p) ? 0.9 : 0.35);
                        break;
                    case "shield":
                        perTurn += scale * Math.Max(Game.EffectAmount(state, p, card, e, "turn"), e.Plus?.Of == "cold" ? ColdHope * (e.Plus.Times ?? 1) : 0) * 0.45;
                        break;
                    case "draw":
                        perTurn += scale * (e.Amount ?? 0) * 0.7;
                        break;
                    case "repair":
                    {
                        int worn = p.Tableau.Sum(c => c.Dented ?? 0);
                        perTurn += scale * Math.Min(e.Amount ?? 0, Math.Max(0.5, worn)) * 0.35;
                        break;
                    }
                    case "plays":
                        perTurn += scale * (e.Amount ?? 0) * ActionValue * Math.Min(1, Math.Max(0.2, (p.Hand.Count - 1) / EnergyHand));
                        break;
                    case "selfHeat":
                        perTurn -= SelfHeatCost(p, e.Amount ?? 0);
                        break;
                    case "grow":
                        perTurn += 0.3;
                        break;
                    case "orbit":
                    {
                        var who = e.Who == "rival" ? Game.TargetOf(state, p) : p;
                        if (who != null) perTurn += (e.Who == "rival" ? -0.6 : 1) * scale * (OrbitOutlook(who, e.Amount ?? 0) - OrbitOutlook(who)) * 0.5;
                        break;
                    }
                }
            }
            foreach (var ps in Game.CardPassives(card))
            {
                switch (ps.Type)
                {
                    case "kindBonus":
                    {
                        var stat = ps.Stat ?? "heat";
                        bool Fits(string id) => (ps.Kind == null || Cards.Def(id).Kind == ps.Kind) && (ps.Race == null || Cards.Def(id).Race == ps.Race);
                        int matching = p.Tableau.Count(c => c.Uid != card.Uid && Fits(c.DefId) && (Cards.Def(c.DefId).OnTurn ?? new List<Effect>()).Any(e => e.Type == stat));
                        int coming = p.Hand.Count(c => Fits(c.DefId));
                        perTurn += (ps.Amount ?? 0) * (matching + 0.5 + 0.25 * coming) * (stat == "heat" ? 1 : stat == "cool" ? 0.7 : 0.45);
                        break;
                    }
                    case "extraPlay": perTurn += 1.4 * (ps.Amount ?? 0) * (ps.Planet != null ? 0.4 : 1); break;
                    case "keepShields": perTurn += 0.4 + p.Shields * 0.1; break;
                    case "tidewall": perTurn += 0.2 + Math.Min(p.Shields, 4) * 0.06 * Math.Max(0, p.Tableau.Count - 1); break;
                    case "retaliate": perTurn += 0.6 * foes; break;
                    case "taunt":
                        if (EnergyContention) perTurn += 0.3 + 0.25 * Math.Max(0, p.Tableau.Count(c => c.Uid != card.Uid && Cards.Def(c.DefId).Kind != "command"));
                        break;
                    case "field": perTurn += 0.2; break;
                    case "adjacent": perTurn += 0.3 * ps.Amounts[0]; break;
                    case "guard": perTurn += 0.25 * ps.Amounts[0]; break;
                    case "anchor": perTurn += 0.5; break;
                    case "eatPlanets": perTurn += 1.1 * foes; break;
                }
            }
            if ((def.OnLeave?.Count ?? 0) > 0) perTurn += 0.35;
            if ((def.Attack ?? 0) > 0) perTurn += 0.8 * Game.CardAttack(state, p, card);
            double PayValue(HeroAbility k) => ((k.Pay?.Stability ?? 0) * 0.5 + (k.Pay?.Sacrifice == true ? 1 : 0) + (k.Pay?.SelfHeat ?? 0) * 0.3) * ActionValue;
            if ((def.Abilities?.Count ?? 0) > 0) perTurn += 0.8 * def.Abilities.Select(k => AbilityValue(p, k.Effects) - (k.Cost ?? 0) * ActionValue * 0.6 - PayValue(k)).Max();
            double turns = def.Kind == "command" ? Horizon + HeroDays : Horizon + 1;
            double frozen = card.Frozen == true && (def.Attack ?? 0) > 0 ? 0.8 * Game.CardAttack(state, p, card) : 0;
            return perTurn * turns * (0.8 + 0.05 * (Game.CardDefence(p, card) + (card.Shields ?? 0)) + 0.02 * (card.Health ?? 0)) * (1 - RemovalRisk(state, p, card)) - frozen;
        }

        static double RemovalRisk(GameState state, PlayerState p, CardInstance card)
        {
            var rival = Game.TargetOf(state, p);
            if (rival == null || RiskPer <= 0) return 0;
            int defence = Game.CardDefence(p, card);
            int seen = 0;
            foreach (var c in rival.Discard.Concat(rival.Wreck ?? new List<CardInstance>()).Concat(rival.Tableau))
            {
                var def = Cards.Def(c.DefId);
                foreach (var e in (def.OnPlay ?? new List<Effect>()).Concat((def.Abilities ?? new List<HeroAbility>()).SelectMany(k => k.Effects ?? new List<Effect>())))
                {
                    if ((e.Type == "destroy" || e.Type == "bounce") && (e.MaxDefence == null || e.MaxDefence >= defence) && (e.Type != "destroy" || e.Kind == null || e.Kind == Cards.Def(card.DefId).Kind))
                    {
                        seen++;
                        break;
                    }
                }
            }
            return Math.Min(RiskMax, seen * RiskPer);
        }

        static double SelfHeatCost(PlayerState p, int amount)
        {
            double room = Game.SupernovaThreshold(p) - p.HeatExact;
            if (amount >= room) return 100;
            double b = amount * (Game.IsOverheated(p) ? 1.1 : 0.7);
            return room - amount <= 3 ? b * 3 : b;
        }

        static double AbilityValue(PlayerState p, List<Effect> effects)
        {
            double v = 0;
            foreach (var e in effects ?? new List<Effect>())
            {
                int amount = e.Amount ?? 0;
                switch (e.Type)
                {
                    case "heat":
                        v += amount + (e.Plus?.Of == "shields" ? Math.Min(e.Max ?? 9, (int)Math.Floor(p.Shields / (e.Plus.Per ?? 1))) : 0) + (e.Pierce == true ? 0.5 : 0);
                        break;
                    case "cool": v += amount * (p.HeatExact > 0 || RunsCold(p) ? 0.9 : 0.35); break;
                    case "shield": v += amount * 0.45; break;
                    case "draw": v += amount * 0.7; break;
                    case "plays": v += amount * ActionValue * Math.Min(1, Math.Max(0.2, (p.Hand.Count - 1) / EnergyHand)); break;
                    case "selfHeat": v -= SelfHeatCost(p, amount); break;
                    case "restore": v += e.Self == true ? 0.35 * amount : e.All == true ? 0.3 * amount * Math.Max(1, p.Tableau.Count - 1) : 0.4 * amount; break;
                    case "plant": v += 0.5 * amount; break;
                    case "recover": v += p.Discard.Count > 0 ? 0.9 : 0.5; break;
                    case "orbit": v += (OrbitOutlook(p, amount) - OrbitOutlook(p)) * 0.5; break;
                }
            }
            return v;
        }

        static double PlanetValue(string planet) => planet == "abundant" ? PlanetAbundant : planet == "industrial" ? PlanetIndustrial : PlanetDead;

        static double OrbitOutlook(PlayerState p, int shift = 0)
        {
            double v = 0;
            for (int k = 1; k <= OrbitHorizon; k++) v += PlanetValue(Game.PlanetAt(p.Orbit + shift + k)) * (1 - (k - 1) * 0.15);
            return v;
        }

        static double TableauValue(GameState state, PlayerState p)
        {
            double sum = 0;
            foreach (var c in p.Tableau) sum = sum + CardValue(state, p, c) - (Cards.Def(c.DefId).Kind == "command" ? 0 : SlotCost * SlotDays);
            return sum;
        }

        public static double Evaluate(GameState state, string meId)
        {
            var me = state.Players.First(p => p.Id == meId);
            if (state.WinnerId == meId) return 1e6;
            if (Game.IsDraw(state)) return -5e5;
            if (me.Eliminated) return -1e6;
            double score = 0;
            foreach (var o in state.Players)
            {
                if (o.Id == meId) continue;
                if (o.Eliminated) score += 16;
                else
                {
                    var leader = o.Boss?.Leader != null ? o.Tableau.FirstOrDefault(c => c.Uid == o.Boss.Leader) : null;
                    double danger = leader != null ? 1 - (double)(leader.Health ?? 0) / Math.Max(1, leader.MaxHealth ?? Game.BaseHealth(leader.DefId)) : (double)Math.Max(0, o.HeatExact) / Game.SupernovaThreshold(o);
                    score += 12 * danger + 5 * danger * danger - RivalBoard * TableauValue(state, o) - 0.6 * OrbitOutlook(o) - SingularityThreat(o);
                }
            }
            double incoming = 0;
            foreach (var o in state.Players)
            {
                if (o.Id == meId || o.Eliminated || Game.TargetOf(state, o)?.Id != meId) continue;
                int attacks = o.Tableau.Sum(c => Game.CardAttack(state, o, c));
                incoming = incoming + Game.Forecast(state, o).Heat + 0.7 * attacks;
            }
            double landing = Math.Max(0, incoming - me.Shields);
            double coming = landing * IncomingWeight;
            double mine = Math.Max(0, me.HeatExact + coming) / Game.SupernovaThreshold(me);
            score -= 12 * mine + 10 * mine * mine;
            double lethal = LethalMargin(state, me);
            if (lethal >= 0) score -= LethalWeight + 3 * lethal;
            score += TableauValue(state, me) + OrbitOutlook(me) + SingularityHope(me) + 0.8 * me.Hand.Count + 0.3 * me.Shields + (me.Lightspeed != null ? LightspeedValue : 0);
            bool ready = me.Hand.Any(c => Cards.Def(c.DefId).Lightspeed == true && Game.ReactCost(c.DefId) <= (Game.ActivePlayer(state).Id == me.Id ? me.PlaysLeft : me.Banked ?? 0));
            if (ready) score += LightspeedValue * 0.6;
            return score;
        }

        static double SingularityThreat(PlayerState o)
        {
            var hero = Game.CommandCard(o);
            var k = hero != null ? Singularities.Of(hero.DefId) : null;
            if (hero == null || k == null) return 0;
            double was = chargeFloor != null && chargeFloor.TryGetValue(hero.Uid, out var w) ? w : double.PositiveInfinity;
            double f = Math.Min(1, Math.Min(hero.Charge ?? 0, was) / k.Need);
            return SingularityThreatValue * (0.25 + 0.75 * f * f) + (f >= 1 ? 2 : 0);
        }

        static double SingularityHope(PlayerState me)
        {
            var hero = Game.CommandCard(me);
            var k = hero != null ? Singularities.Of(hero.DefId) : null;
            if (hero == null || k == null) return 0;
            double f = Math.Min(1, (double)(hero.Charge ?? 0) / k.Need);
            return SingularityHopeValue * f;
        }

        static double LethalMargin(GameState state, PlayerState me)
        {
            if (me.Boss != null) return double.NegativeInfinity;
            int soak = Game.Guards(me).Sum(c => Game.CardDefence(me, c) + (c.Health ?? 0));
            int heat = 0;
            foreach (var o in state.Players)
            {
                if (o.Id == me.Id || o.Eliminated || Game.TargetOf(state, o)?.Id != me.Id) continue;
                heat += Game.Forecast(state, o).Heat;
                int attacks = o.Tableau.Sum(c => Game.CardAttack(state, o, c));
                int through = Math.Max(0, attacks - soak);
                soak = Math.Max(0, soak - attacks);
                heat += through;
            }
            return me.HeatExact + Math.Max(0, heat - me.Shields) - Game.SupernovaThreshold(me);
        }

        static Action Play(string cardUid) => new Action { Type = "playCard", CardUid = cardUid };

        static List<T> Opt<T>(List<T> list) => list.Count > 0 ? list : new List<T> { default };

        /// <summary>Every way to play one card now.</summary>
        static List<Action> CandidatePlays(GameState state, PlayerState me)
        {
            var plays = new List<Action>();
            var seen = new HashSet<string>();
            foreach (var card in me.Hand)
            {
                if (seen.Contains(card.DefId)) continue;
                seen.Add(card.DefId);
                if (Game.CanSetFaceDown(me, card.DefId)) plays.Add(new Action { Type = "playCard", CardUid = card.Uid, FaceDown = true });
                if (Cards.Def(card.DefId).Kind == "trap" && !Game.CanSetTrap(me)) continue;
                if (Game.HandCost(card, me) > me.PlaysLeft) continue;
                var choices = Opt(Game.CardChoices(card.DefId));
                if (!Game.HasRoomFor(me, card.DefId)) continue;
                var slots = Game.NeedsSlot(me, card.DefId) ? Game.FreeSlots(me).Select(s => (int?)s).ToList() : new List<int?> { null };
                var hosts = new List<string> { null };
                if (Cards.Def(card.DefId).Fusion == true) hosts.AddRange(Game.FusionHosts(me).Select(c => c.Uid));
                // (A Map of defId → uid: in the order each defId first came, with the last uid of each.)
                var recoverMap = new List<KeyValuePair<string, string>>();
                foreach (var c in Game.RecoverChoices(me, card.DefId))
                {
                    int at = recoverMap.FindIndex(kv => kv.Key == c.DefId);
                    if (at >= 0) recoverMap[at] = new KeyValuePair<string, string>(c.DefId, c.Uid);
                    else recoverMap.Add(new KeyValuePair<string, string>(c.DefId, c.Uid));
                }
                var recovers = Opt(recoverMap.Select(kv => kv.Value).ToList());
                var allies = Opt(Game.AllyChoices(me, card.DefId).Select(c => c.Uid).ToList());
                var aim = Game.Aimable(card.DefId) ? Game.AimChoices(state, me) : new Game.AimOptions { Sun = true, Cards = new List<CardInstance>() };
                var aims = new List<string>();
                if (aim.Sun) aims.Add(null);
                aims.AddRange(aim.Cards.Select(c => c.Uid));
                if (aims.Count == 0) aims.Add(null);
                var foeSet = new List<string>();
                foreach (var a in aims) foreach (var c in Game.EnemyChoices(state, me, card.DefId, a)) if (!foeSet.Contains(c.Uid)) foeSet.Add(c.Uid);
                var foes = Opt(foeSet);
                var chills = Game.Chillable(card.DefId) ? Game.ChillChoices(state, me).Select(c => c.Uid).ToList() : new List<string>();
                bool recalls = Game.AllyEffectKind(card.DefId) == "recall" && Game.InSlots(card.DefId);
                foreach (var choice in choices)
                    foreach (var enemyUid in foes)
                        foreach (var allyUid in allies)
                        {
                            var back = recalls ? me.Tableau.FirstOrDefault(c => c.Uid == allyUid) : null;
                            var here = back != null && back.Slot != null && !slots.Contains(back.Slot) ? slots.Concat(new[] { back.Slot }).ToList() : slots;
                            var shifts = Game.ShiftEffect(card.DefId);
                            var moved = shifts == "mine" ? me.Tableau.FirstOrDefault(c => c.Uid == allyUid) : shifts == "rival" ? state.Players.SelectMany(pl => pl.Tableau).FirstOrDefault(c => c.Uid == enemyUid) : null;
                            var tos = moved != null ? Game.ShiftSlots(moved, shifts == "mine" ? me : state.Players.FirstOrDefault(pl => pl.Tableau.Contains(moved))).Select(s => (int?)s).ToList() : new List<int?> { null };
                            foreach (var slot in here)
                                foreach (var recoverUid in recovers)
                                    foreach (var aimUid in aims)
                                        foreach (var hostUid in hosts)
                                            foreach (var shiftTo in tos)
                                                if (hostUid == null || slot == here[0])
                                                    plays.Add(new Action { Type = "playCard", CardUid = card.Uid, Choice = choice, EnemyUid = enemyUid, SlotIndex = slot, AllyUid = allyUid, RecoverUid = recoverUid, AimUid = aimUid, HostUid = hostUid, ShiftTo = shiftTo });
                            foreach (var chillUid in chills)
                                plays.Add(new Action { Type = "playCard", CardUid = card.Uid, Choice = choice, EnemyUid = enemyUid, SlotIndex = here[0], AllyUid = allyUid, RecoverUid = recovers[0], AimUid = aims[0], ChillUid = chillUid, ShiftTo = tos[0] });
                        }
            }
            return plays;
        }

        static PlayerState BestTarget(GameState state, PlayerState me)
        {
            var foes = Game.LivingOpponents(state, me);
            int n = state.Players.Count;
            int seat = Game.SeatOf(state, me);
            var left = Game.Sorted(foes, (a, b) => ((Game.SeatOf(state, a) - seat + n) % n) - ((Game.SeatOf(state, b) - seat + n) % n)).FirstOrDefault();
            double Ratio(PlayerState o) => (double)o.HeatExact / Game.SupernovaThreshold(o);
            var nearest = Game.Sorted(foes, (a, b) => Game.Sign(Ratio(b) - Ratio(a))).FirstOrDefault();
            if (nearest != null && Ratio(nearest) >= FinishRatio && Ratio(nearest) > Ratio(left)) return nearest;
            if (foes.Count > 1)
            {
                var leader = Game.Sorted(foes, (a, b) => Game.Sign(Ratio(a) - Ratio(b))).First();
                if (Ratio(left) - Ratio(leader) >= LeaderGap) return leader;
            }
            return left;
        }

        static int? AiSkill(GameState state, PlayerState me)
        {
            var rival = Game.TargetOf(state, me);
            double mine = (double)Math.Max(0, me.HeatExact) / Game.SupernovaThreshold(me);
            double theirs = rival != null ? (double)Math.Max(0, rival.HeatExact) / Game.SupernovaThreshold(rival) : 0;
            var skills = me.Skills ?? new List<BattleSkill>();
            for (int i = 0; i < skills.Count; i++)
            {
                var k = skills[i];
                if (Game.HeroSkillProblem(state, me, i) != null) continue;
                bool guards = k.Effects.Any(e => e.Type == "cool" || e.Type == "shield");
                bool strikes = k.Effects.Any(e => e.Type == "heat" || e.Type == "draw");
                if (guards && mine >= 0.55) return i;
                if (strikes && (k.Once != true || theirs >= 0.5 || state.Round >= 6)) return i;
                if (k.Effects.Any(e => e.Type == "strikeAll") && (rival?.Tableau.Count ?? 0) >= 3) return i;
                int worn = me.Tableau.Sum(c => Math.Max(0, (c.MaxHealth ?? Game.BaseHealth(c.DefId)) - (c.Health ?? 0)));
                if (k.Effects.Any(e => e.Type == "restore") && worn >= 4) return i;
                if (k.Effects.Any(e => e.Type == "plays") && me.Hand.Count >= 3 && (k.Once != true || state.Round >= 3)) return i;
            }
            return null;
        }

        static GameState TryApply(GameState s, Action a)
        {
            try { return Game.Apply(s, a); }
            catch (Exception) { return null; }
        }

        static Action ChooseReaction(GameState state)
        {
            var r = state.Reaction;
            GameState Settle(GameState s)
            {
                var t = s;
                for (int i = 0; i < 3 && t.Reaction != null; i++) t = Game.Apply(t, new Action { Type = "react" });
                return t;
            }
            var pass = new Action { Type = "react" };
            var best = pass;
            double score = Evaluate(Settle(Game.Apply(state, pass)), r.PlayerId);
            var options = new List<Action>();
            if (r.Slot) options.Add(new Action { Type = "react", Slot = true });
            options.AddRange(r.Hand.Select(uid => new Action { Type = "react", CardUid = uid }));
            foreach (var a in options)
            {
                try
                {
                    double v = Evaluate(Settle(Game.Apply(state, a)), r.PlayerId) - LightspeedValue * 0.5;
                    if (v > score) { score = v; best = a; }
                }
                catch (Exception) { }
            }
            return best;
        }

        static List<Action> AbilityMoves(GameState state, PlayerState me)
        {
            var hero = Game.CommandCard(me);
            if (hero == null) return new List<Action>();
            var aimAt = Game.AimChoices(state, me).Cards.Select(c => c.Uid).ToList();
            var k = Singularities.Of(hero.DefId);
            bool blasts = k != null && k.Effects.Any(e => e.Type == "blast");
            var moves = new List<Action>();
            if (Game.SingularityProblem(state, me) == null)
            {
                moves.Add(new Action { Type = "singularity" });
                if (blasts) moves.AddRange(aimAt.Select(uid => new Action { Type = "singularity", AimUid = uid }));
            }
            var abilities = Game.HeroAbilities(me, hero, true);
            for (int index = 0; index < abilities.Count; index++)
            {
                if (Game.HeroAbilityProblem(state, me, index) != null) continue;
                moves.Add(new Action { Type = "heroAbility", Index = index });
                if (Game.AbilityAimable(hero.DefId, index)) moves.AddRange(aimAt.Select(uid => new Action { Type = "heroAbility", Index = index, AimUid = uid }));
            }
            return moves;
        }

        /// <summary>Every move a side could make now, but its Hero's abilities and ending the day (a dream's solver searches these).</summary>
        public static List<Action> MovesNow(GameState state)
        {
            var me = Game.ActivePlayer(state);
            var attacks = new List<Action>();
            var targets = Game.AimChoices(state, me, true);
            foreach (var c in me.Tableau)
            {
                if (c.Dimmed == true || c.Frozen == true || (c.SpentAttack ?? 0) != 0 || Game.CardAttack(state, me, c) <= 0) continue;
                if (targets.Sun) attacks.Add(new Action { Type = "attack", AttackerUid = c.Uid, TargetUid = null });
                foreach (var t in targets.Cards) attacks.Add(new Action { Type = "attack", AttackerUid = c.Uid, TargetUid = t.Uid });
            }
            return attacks.Concat(AbilityMoves(state, me)).Concat(CandidatePlays(state, me).Where(a => !(a.Type == "playCard" && a.ChillUid != null))).ToList();
        }

        /// <summary>The AI's next move for the side whose move it is.</summary>
        public static Action Choose(GameState state)
        {
            if (state.Reaction != null) return ChooseReaction(state);
            var me = Game.ActivePlayer(state);
            if (me.Boss != null) return new Action { Type = "endTurn" };
            if (me.DawnChoices != null && me.DawnChoices.Count > 0) return DawnPick(state, me);
            var focus = BestTarget(state, me);
            if (focus != null && Game.TargetOf(state, me)?.Id != focus.Id) return new Action { Type = "setTarget", TargetId = focus.Id };
            var skill = AiSkill(state, me);
            if (skill != null) return new Action { Type = "heroSkill", Index = skill };
            var hero = Game.CommandCard(me);
            var abilities = AbilityMoves(state, me);
            var attacks = new List<Action>();
            var targets = Game.AimChoices(state, me, true);
            foreach (var c in me.Tableau)
            {
                if (c.Dimmed == true || c.Frozen == true || Game.CardAttack(state, me, c) <= 0) continue;
                if (targets.Sun) attacks.Add(new Action { Type = "attack", AttackerUid = c.Uid, TargetUid = null });
                foreach (var t in targets.Cards) attacks.Add(new Action { Type = "attack", AttackerUid = c.Uid, TargetUid = t.Uid });
            }
            if (abilities.Count == 0 && attacks.Count == 0 && !me.Hand.Any(c => Game.HandCost(c, me) <= me.PlaysLeft)) return new Action { Type = "endTurn" };

            var view = Game.Clone(state);
            view.NoReactions = true;
            foreach (var p in view.Players) if (p.Id != me.Id) p.Lightspeed = null;
            double baseline = Evaluate(view, me.Id);
            var kill = LethalLine(view, me.Id, 0, new int[1]);
            if (kill != null) return kill;
            Action bestAction = null;
            double bestScore = 0;
            double bestRaw = double.NegativeInfinity;
            chargeFloor = new Dictionary<string, int>();
            foreach (var p in view.Players.Where(p => p.Id != me.Id))
            {
                var h = Game.CommandCard(p);
                if (h != null) chargeFloor[h.Uid] = h.Charge ?? 0;
            }
            foreach (var action in attacks.Concat(abilities).Concat(CandidatePlays(view, me)))
            {
                GameState next;
                double chillBonus = 0;
                try
                {
                    next = SettleChoices(Game.Apply(view, action), me.Id);
                    if (action.Type == "playCard" && action.ChillUid != null)
                    {
                        var kept = ChillWorth(view, next, me.Id, action);
                        chillBonus = ChillShare * Math.Max(0, Evaluate(next, me.Id) - Evaluate(kept, me.Id));
                        next = kept;
                    }
                }
                catch (Exception)
                {
                    continue;
                }
                var played = action.Type == "playCard" ? me.Hand.FirstOrDefault(c => c.Uid == action.CardUid) : null;
                int abilityCost = action.Type == "heroAbility" && hero != null ? Game.HeroAbilities(me, hero, true)[action.Index ?? 0].Cost ?? 0 : 0;
                int extra = played != null ? (Cards.Def(played.DefId).SpendAll == true ? me.PlaysLeft : Game.CardCost(played.DefId)) - 1 : abilityCost;
                if (EnergyContention && extra > 0)
                {
                    int leftAfter = me.PlaysLeft - (played != null ? (Cards.Def(played.DefId).SpendAll == true ? me.PlaysLeft : Game.CardCost(played.DefId)) : abilityCost);
                    int wanted = me.Hand.Where(c => c.Uid != played?.Uid && Game.CardCost(c.DefId) > 0 && Game.CardCost(c.DefId) <= me.PlaysLeft && Game.HasRoomFor(me, c.DefId)).Sum(c => Game.CardCost(c.DefId));
                    extra = Math.Min(extra, Math.Max(0, wanted - leftAfter));
                }
                var after = next.Players.First(p => p.Id == me.Id);
                int spent = played != null ? (Cards.Def(played.DefId).SpendAll == true ? me.PlaysLeft : Game.CardCost(played.DefId)) : abilityCost;
                int gained = after.PlaysLeft - (me.PlaysLeft - spent);
                double ramp = gained > 0 ? gained * ActionValue * Math.Min(1, (double)after.Hand.Count(c => Game.CardCost(c.DefId) <= after.PlaysLeft && Game.CardCost(c.DefId) > 0) / gained) : 0;
                double vigil = action.Type == "attack" ? VigilWorth(view, me, me.Tableau.FirstOrDefault(c => c.Uid == action.AttackerUid)) : 0;
                double unleash = action.Type == "singularity" ? SingularityHopeValue : 0;
                double raw = Evaluate(next, me.Id) + ramp - vigil + unleash + chillBonus;
                double replacing = played != null && action.Type == "playCard" && action.FaceDown != true && action.HostUid == null && Game.Replaces(me, played.DefId) ? ActionValue : 0;
                double score = raw - extra * ActionValue - replacing;
                bestRaw = Math.Max(bestRaw, raw);
                if (bestAction == null || score > bestScore) { bestAction = action; bestScore = score; }
            }
            var combo = Combos ? RemovalCombo(view, me, attacks) : null;
            if (combo != null && bestAction != null)
            {
                double plain = bestScore;
                try
                {
                    var s1 = Game.Apply(view, bestAction);
                    var p1 = s1.Players.First(x => x.Id == me.Id);
                    if (Game.ActivePlayer(s1).Id == me.Id)
                        foreach (var play in CandidatePlays(s1, p1))
                        {
                            if (play.Type != "playCard" || play.EnemyUid == null) continue;
                            var card = p1.Hand.FirstOrDefault(c => c.Uid == play.CardUid);
                            if (card == null) continue;
                            plain = Math.Max(plain, Evaluate(Game.Apply(s1, play), me.Id) - (Game.CardCost(card.DefId) - 1) * ActionValue);
                        }
                }
                catch (Exception) { }
                if (combo.Value.score > plain + 0.5)
                {
                    chargeFloor = null;
                    return combo.Value.action;
                }
            }
            chargeFloor = null;
            if (bestAction == null || (EnergyContention ? bestRaw : bestScore) < baseline - 1.5) return new Action { Type = "endTurn" };
            return bestAction;
        }

        static GameState ChillWorth(GameState view, GameState chilled, string meId, Action action)
        {
            var uid = action.ChillUid;
            var owner = view.Players.FirstOrDefault(p => p.Tableau.Any(c => c.Uid == uid));
            var before = owner?.Tableau.FirstOrDefault(c => c.Uid == uid);
            var after = chilled.Players.SelectMany(p => p.Tableau).FirstOrDefault(c => c.Uid == uid);
            int amount = (after?.Chill ?? 0) - (before?.Chill ?? 0);
            double kept = owner != null && before != null && before.Frozen != true ? ChillSure * Math.Min(amount, Game.CardAttack(view, owner, before)) : 0;
            var plainAction = (Action)Json.Clone(action);
            plainAction.ChillUid = null;
            var plain = SettleChoices(Game.Apply(view, plainAction), meId);
            var me = plain.Players.First(p => p.Id == meId);
            var was = view.Players.First(p => p.Id == meId);
            // (A fraction kept off: the sun's heat as the TypeScript's would read, `was.heat - kept`.)
            me.Heat = was.Heat;
            me.HeatShift = was.HeatShift - kept;
            return plain;
        }

        static Action LethalLine(GameState s, string meId, int depth, int[] seen, int from = 0)
        {
            if (depth > 6 || seen[0] > 400) return null;
            var me = s.Players.First(p => p.Id == meId);
            if (Game.ActivePlayer(s).Id != meId) return null;
            if (depth == 0)
            {
                var rival = Game.TargetOf(s, me);
                if (rival == null) return null;
                if (rival.Boss == null)
                {
                    int attacksSum = me.Tableau.Sum(c => c.Dimmed == true || c.Frozen == true ? 0 : Math.Max(0, Game.CardAttack(s, me, c)));
                    int abilitiesAllowance = AbilityMoves(s, me).Count > 0 ? 12 : 0;
                    if (rival.HeatExact + attacksSum * 2 + abilitiesAllowance + 3 < Game.SupernovaThreshold(rival)) return null;
                }
                var g = s;
                Action first = null;
                foreach (var c in me.Tableau)
                {
                    var gm = g.Players.First(p => p.Id == meId);
                    if (c.Dimmed == true || c.Frozen == true || Game.CardAttack(g, gm, c) <= 0 || !Game.AimChoices(g, gm, true).Sun) continue;
                    var a = new Action { Type = "attack", AttackerUid = c.Uid, TargetUid = null };
                    try
                    {
                        g = Game.Apply(g, a);
                    }
                    catch (Exception)
                    {
                        continue;
                    }
                    seen[0]++;
                    first ??= a;
                    if (g.WinnerId == meId) return first;
                    if (g.WinnerId != null || Game.ActivePlayer(g).Id != meId) break;
                }
            }
            var targets = Game.AimChoices(s, me, true);
            var moves = new List<Action>();
            for (int i = 0; i < me.Tableau.Count; i++)
            {
                var c = me.Tableau[i];
                if (i < from || c.Dimmed == true || c.Frozen == true || Game.CardAttack(s, me, c) <= 0) continue;
                if (targets.Sun) moves.Add(new Action { Type = "attack", AttackerUid = c.Uid, TargetUid = null });
                foreach (var t in targets.Cards) moves.Add(new Action { Type = "attack", AttackerUid = c.Uid, TargetUid = t.Uid });
            }
            moves.AddRange(AbilityMoves(s, me));
            foreach (var a in moves)
            {
                seen[0]++;
                GameState next;
                try
                {
                    next = Game.Apply(s, a);
                }
                catch (Exception)
                {
                    continue;
                }
                if (next.WinnerId == meId) return a;
                if (next.WinnerId != null) continue;
                int at = a.Type == "attack" ? me.Tableau.FindIndex(c => c.Uid == a.AttackerUid) + 1 : from;
                if (LethalLine(next, meId, depth + 1, seen, at) != null) return a;
            }
            return null;
        }

        static (Action action, double score)? RemovalCombo(GameState view, PlayerState me, List<Action> attacks)
        {
            if (!me.Hand.Any(c => Game.EnemyChoices(view, me, c.DefId).Count > 0 || (Cards.Def(c.DefId).OnPlay ?? new List<Effect>()).Any(e => e.Type == "destroy" || e.Type == "bounce"))) return null;
            var onCards = attacks.Where(a => a.Type == "attack" && a.TargetUid != null).ToList();
            if (onCards.Count == 0) return null;
            double? Finish(GameState s, string uid)
            {
                var p = s.Players.First(x => x.Id == me.Id);
                if (Game.ActivePlayer(s).Id != me.Id) return null;
                double? top = null;
                foreach (var play in CandidatePlays(s, p))
                {
                    if (play.Type != "playCard" || play.EnemyUid != uid) continue;
                    var card = p.Hand.FirstOrDefault(c => c.Uid == play.CardUid);
                    var after = TryApply(s, play);
                    if (card == null || after == null) continue;
                    double sc = Evaluate(after, me.Id) - (Game.CardCost(card.DefId) - 1) * ActionValue;
                    if (top == null || sc > top) top = sc;
                }
                return top;
            }
            (Action action, double score)? best = null;
            foreach (var a1 in onCards)
            {
                var s1 = TryApply(view, a1);
                if (s1 == null) continue;
                var uid = a1.TargetUid;
                var sc = Finish(s1, uid);
                if (sc == null)
                {
                    var p1 = s1.Players.First(x => x.Id == me.Id);
                    foreach (var a2 in onCards)
                    {
                        if (a2.AttackerUid == a1.AttackerUid || a2.TargetUid != uid || (p1.Tableau.FirstOrDefault(c => c.Uid == a2.AttackerUid)?.Dimmed ?? false)) continue;
                        var s2 = TryApply(s1, a2);
                        if (s2 == null) continue;
                        var sc2 = Finish(s2, uid);
                        if (sc2 != null && (sc == null || sc2 > sc)) sc = sc2;
                    }
                }
                if (sc != null && (best == null || sc > best.Value.score)) best = (a1, sc.Value);
            }
            return best;
        }

        static Action DawnPick(GameState state, PlayerState me)
        {
            var dawn = me.DawnChoices[0];
            if (dawn.Kind == "discount")
            {
                var dear = Game.Sorted(me.Hand, (a, b) => Game.HandCost(b, me) - Game.HandCost(a, me)).FirstOrDefault();
                return dear != null ? new Action { Type = "dawnChoice", AllyUid = dear.Uid } : new Action { Type = "dawnChoice" };
            }
            var rival = Game.TargetOf(state, me);
            var options = new List<Action>();
            if (dawn.Kind == "aim" || dawn.Kind == "freeze")
                foreach (var c in rival?.Tableau ?? new List<CardInstance>()) options.Add(new Action { Type = "dawnChoice", EnemyUid = c.Uid });
            else if (dawn.Kind == "displace")
            {
                foreach (var c in rival?.Tableau ?? new List<CardInstance>())
                {
                    if (c.Slot == Game.CommandSlot) continue;
                    for (int to = 0; to < Balance.TableauSlots; to++) if (to != c.Slot && !(rival != null && Game.SlotClosed(rival, to))) options.Add(new Action { Type = "dawnChoice", EnemyUid = c.Uid, ShiftTo = to });
                }
            }
            else if (dawn.Kind == "empower" || dawn.Kind == "renew" || dawn.Kind == "ward")
            {
                foreach (var c in me.Tableau) if (dawn.Kind != "empower" || Game.Overdrivable(c, dawn.Amount ?? 1)) options.Add(new Action { Type = "dawnChoice", AllyUid = c.Uid });
            }
            else
                foreach (var c in me.Tableau)
                {
                    if (c.Slot == Game.CommandSlot) continue;
                    if (dawn.Kind != "shift") options.Add(new Action { Type = "dawnChoice", AllyUid = c.Uid });
                    else for (int to = 0; to < Balance.TableauSlots; to++) if (to != c.Slot && !Game.SlotClosed(me, to)) options.Add(new Action { Type = "dawnChoice", AllyUid = c.Uid, ShiftTo = to });
                }
            var best = new Action { Type = "dawnChoice" };
            double score = Evaluate(Game.Apply(state, best), me.Id) + (dawn.Kind == "aim" ? 0 : 0.05);
            foreach (var a in options)
            {
                try
                {
                    double v = Evaluate(Game.Apply(state, a), me.Id);
                    if (v > score) { score = v; best = a; }
                }
                catch (Exception) { }
            }
            return best;
        }

        // ---- For a player's own moves (the battle screen): the AI's judgement lent to a human's choice ----

        /// <summary>Every way the active side could play this card from hand now.</summary>
        public static List<Action> PlaysFor(GameState state, string cardUid) =>
            CandidatePlays(state, Game.ActivePlayer(state)).Where(a => a.CardUid == cardUid && a.ChillUid == null && a.FaceDown != true).ToList();

        /// <summary>Of these moves, the one the AI thinks leaves the side moving best off (null if none can be made).</summary>
        public static Action BestOf(GameState state, IEnumerable<Action> options)
        {
            var me = Game.ActivePlayer(state);
            var view = Game.Clone(state);
            view.NoReactions = true;
            foreach (var p in view.Players) if (p.Id != me.Id) p.Lightspeed = null;
            Action best = null;
            double top = double.NegativeInfinity;
            foreach (var a in options)
            {
                GameState next;
                try { next = SettleChoices(Game.Apply(view, a), me.Id); }
                catch (Exception) { continue; }
                double v = Evaluate(next, me.Id);
                if (best == null || v > top) { best = a; top = v; }
            }
            return best;
        }

        /// <summary>The answer the AI would give to the first dawn choice waiting on the side moving.</summary>
        public static Action DawnChoiceFor(GameState state) => DawnPick(state, Game.ActivePlayer(state));

        static GameState SettleChoices(GameState state, string id)
        {
            var s = state;
            for (int i = 0; i < 6; i++)
            {
                var me = Game.ActivePlayer(s);
                if (me.Id != id || me.DawnChoices == null || me.DawnChoices.Count == 0) break;
                s = Game.Apply(s, DawnPick(s, me));
            }
            return s;
        }
    }
}
