using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    public static partial class Game
    {
        /// <summary>What a card played (or a trap that sprang) was aimed at, and what it answers.</summary>
        class PlayContext
        {
            public string EnemyUid, ChillUid, AimUid, AllyUid, RecoverUid;
            public int? ShiftTo;
            public PlayerState Against;
            public ReactEvent Event;
            public Reaction Reaction;
            /// <summary>A Lost Overlord's blow (one of its parts' actions): a Guard draws it in (see BlowGuard).</summary>
            public bool Blow;

            public static PlayContext From(Action a) => a == null ? new PlayContext() : new PlayContext { EnemyUid = a.EnemyUid, ChillUid = a.ChillUid, AimUid = a.AimUid, AllyUid = a.AllyUid, RecoverUid = a.RecoverUid, ShiftTo = a.ShiftTo };
        }

        static void DrawCards(GameState state, PlayerState p, int count)
        {
            if (p.Boss != null) return;
            for (int i = 0; i < count; i++)
            {
                if (p.Deck.Count == 0 && p.Discard.Count == 0) return;
                if (p.Deck.Count == 0 && p.Discard.Count > 0)
                {
                    Reshuffle(state, p);
                    if (p.Eliminated) return;
                }
                CardInstance card = null;
                if (p.Deck.Count > 0) { card = p.Deck[p.Deck.Count - 1]; p.Deck.RemoveAt(p.Deck.Count - 1); }
                if (card != null)
                {
                    p.Hand.Add(card);
                    Charge(state, p, "draws");
                }
                else
                {
                    Log(state, $"{p.Name}'s deck is empty: the strain heats their sun by {Balance.FatigueHeat}.");
                    ApplyHeat(state, p, Balance.FatigueHeat, null, false, null, false, "the strain of an empty deck");
                    if (p.Eliminated) return;
                }
            }
        }

        public static void ToWreck(PlayerState p, params CardInstance[] cards)
        {
            (p.Wreck ??= new List<CardInstance>()).AddRange(cards);
        }

        static void SalvageWreck(GameState state, PlayerState p)
        {
            for (int i = 0; i < Balance.WreckPerDawn; i++)
            {
                if (p.Wreck == null || p.Wreck.Count == 0) return;
                var card = p.Wreck[0];
                p.Wreck.RemoveAt(0);
                p.Discard.Add(card);
                Log(state, $"{p.Name}'s {Cards.Def(card.DefId).Name} comes back from the wreckage to their reserves.");
            }
        }

        static void Reshuffle(GameState state, PlayerState p)
        {
            p.Deck = Rng.Shuffle(state, p.Discard);
            p.Discard = new List<CardInstance>();
            Log(state, $"{p.Name} shuffles their reserves back into their deck.");
            Charge(state, p, "recycles");
            int recycle = Relics.N(p.Relics, "recycle");
            if (recycle != 0) RelicAim(state, p, recycle, "recycle");
        }

        static CardInstance FindCard(PlayerState p, string uid) =>
            p.Tableau.Concat(p.Hand).Concat(p.Discard).Concat(p.Wreck ?? new List<CardInstance>()).Concat(p.Deck).Concat(p.Lightspeed != null ? new[] { p.Lightspeed } : new CardInstance[0]).FirstOrDefault(c => c.Uid == uid);

        static PlayerState unleashing;

        static void Charge(GameState state, PlayerState p, string kind, int n = 1)
        {
            if (p == null || n <= 0 || unleashing == p) return;
            var hero = CommandCard(p);
            var k = hero != null ? Singularities.Of(hero.DefId) : null;
            if (hero == null || k == null || k.Charge != kind) return;
            int was = hero.Charge ?? 0;
            if (was >= k.Need) return;
            hero.Charge = Math.Min(k.Need, was + n);
            if (hero.Charge >= k.Need) Log(state, $"{p.Name}'s {Cards.Def(hero.DefId).Name}: {k.Name} is charged.");
        }

        public static string SingularityProblem(GameState state, PlayerState p)
        {
            var hero = CommandCard(p);
            var k = hero != null ? Singularities.Of(hero.DefId) : null;
            if (hero == null || k == null) return "No singularity";
            if (ActivePlayer(state).Id != p.Id || state.WinnerId != null) return "Not your day";
            if ((hero.Charge ?? 0) < k.Need) return $"Charging {hero.Charge ?? 0}/{k.Need}";
            return null;
        }

        static void Credit(GameState state, PlayerState who, string uid, string kind, int n)
        {
            if (who == null || string.IsNullOrEmpty(uid) || n <= 0) return;
            var c = FindCard(who, uid);
            var id = c != null ? Companions.Of(c.DefId) : null;
            if (id == null) return;
            state.Acts ??= new Dictionary<string, Acts>();
            if (!state.Acts.TryGetValue(id, out var acts)) state.Acts[id] = acts = new Acts();
            switch (kind)
            {
                case "damage": acts.Damage += n; break;
                case "support": acts.Support += n; break;
                case "kills": acts.Kills += n; break;
                case "sun": acts.Sun += n; break;
                case "dawns": acts.Dawns += n; break;
            }
        }

        static int ApplyHeat(GameState state, PlayerState target, int amount, PlayerState source, bool retaliation = false, string cardUid = null, bool pierce = false, string why = null)
        {
            if (target.Eliminated || amount <= 0) return 0;
            bool enemy = source != null && source.Id != target.Id;
            if (target.Boss != null)
            {
                if (!enemy) return 0;
                int held = pierce ? 0 : Math.Min(target.Shields, amount);
                target.Shields -= held;
                if (held > 0) Log(state, $"{target.Name}'s shields absorb {held}.");
                var leader = target.Tableau.FirstOrDefault(c => c.Uid == target.Boss.Leader);
                if (leader != null && source != null && amount > held) StrikeCard(state, target, leader, amount - held, source, false, cardUid ?? "", false, true);
                return 0;
            }
            int blocked = enemy ? Math.Min(pierce ? (int)Math.Floor(target.Shields * Balance.PierceShieldShare) : target.Shields, amount) : 0;
            target.Shields -= blocked;
            int applied = amount - blocked;
            target.Heat = Math.Max(Balance.MinHeat, target.Heat + applied);
            if (enemy)
            {
                source.Turn.HeatDealt += amount;
                Credit(state, source, cardUid, "damage", amount);
                Credit(state, source, cardUid, "sun", applied);
                Charge(state, source, "heat", amount);
                Charge(state, target, "absorbed", blocked);
                Charge(state, target, "sunHit", applied);
            }
            else Charge(state, target, "burn", applied);
            Charge(state, target, "struck", applied);
            var byCard = !string.IsNullOrEmpty(cardUid) && source != null ? FindCard(source, cardUid) : null;
            var from = why ?? (byCard != null && source != null ? $"{source.Name}'s {Cards.Def(byCard.DefId).Name}" : null);
            var From = from != null ? Cap(from) : "";
            if (tally != null)
            {
                var at = TallySun(target);
                at.Applied += applied;
                at.Blocked += blocked;
                at.To = target.Heat;
            }
            else if (blocked > 0) Log(state, from != null ? $"{From} {(target.Shields != 0 ? "hits" : "breaks")} {target.Name}'s shields (−{blocked})." : $"{target.Name}'s shields absorb {blocked} heat.");
            if (tally == null && applied > 0) Log(state, from != null ? $"{From} heats {target.Name}'s sun to {target.Heat} (+{applied})." : $"{target.Name}'s sun heats to {target.Heat} (+{applied}).");
            if (target.Heat >= SupernovaThreshold(target)) Supernova(state, target);
            if (enemy && blocked > 0 && !retaliation && !target.Eliminated) ShieldsAnswer(state, target, source, cardUid);
            return applied;
        }

        static void ShieldsAnswer(GameState state, PlayerState target, PlayerState source, string cardUid)
        {
            int Sum(string type) => Passives(target).Sum(x => x.passive.Type == type ? (x.passive.Amount ?? 0) : 0);
            int sting = 0;
            int soothe = Sum("absorbCool");
            var key = cardUid ?? source.Id;
            if (target.Stung?.Turn != state.TurnNumber) target.Stung = new Stung { Turn = state.TurnNumber, Ids = new List<string>() };
            if ((sting > 0 || soothe > 0) && !target.Stung.Ids.Contains(key))
            {
                target.Stung.Ids.Add(key);
                if (soothe > 0) Cool(state, target, soothe, $"{target.Name}'s Soothe");
            }
        }

        static void Cool(GameState state, PlayerState p, int amount, string why = null)
        {
            int before = p.Heat;
            p.Heat = Math.Max(Balance.MinHeat, p.Heat - amount);
            p.Turn.Cooled += before - p.Heat;
            Charge(state, p, "cooled", before - p.Heat);
            if (tally != null && p.Heat != before)
            {
                var at = TallySun(p);
                at.Cooled += before - p.Heat;
                at.To = p.Heat;
            }
            else if (p.Heat != before) Log(state, why != null ? $"{Cap(why)} cools {p.Name}'s sun to {p.Heat} (−{before - p.Heat})." : $"{p.Name}'s sun cools to {p.Heat} (−{before - p.Heat}).");
        }

        static void Supernova(GameState state, PlayerState p, bool decide = true)
        {
            if (p.Eliminated) return;
            if (tally != null) FlushTally(state);
            if (SurvivalDream(state) && p == state.Players[1])
            {
                p.Heat = Math.Min(p.Heat, SupernovaThreshold(p) - 1);
                return;
            }
            if (HasPower(p, "unburning"))
            {
                p.Heat = Math.Min(p.Heat, SupernovaThreshold(p) - 1);
                Log(state, $"{p.Name}'s sun will not burn out: The Unburning holds it at {p.Heat}.");
                return;
            }
            p.Eliminated = true;
            Log(state, $"☀ {p.Name}'s sun goes SUPERNOVA!");
            p.Discard.AddRange(p.Tableau);
            if (p.Lightspeed != null) p.Discard.Add(p.Lightspeed);
            p.Tableau = new List<CardInstance>();
            p.Lightspeed = null;
            var alive = state.Players.Where(o => !o.Eliminated).ToList();
            if (decide && alive.Count == 1)
            {
                state.WinnerId = alive[0].Id;
                Log(state, $"{alive[0].Name} wins the Blue Loop!");
            }
        }

        static bool KindMatches(CardInstance c, string kind) => Returnable(c) && (kind == null || DefHasRole(Cards.Def(c.DefId), kind));

        /// <summary>A blow on a card: its shields, then its defence (worn), then its stability; at 0 it burns away.</summary>
        static void StrikeCard(GameState state, PlayerState owner, CardInstance victim, int amount, PlayerState source, bool pierce, string cardUid, bool sting = false, bool heat = false)
        {
            var by = !string.IsNullOrEmpty(cardUid) ? FindCard(source, cardUid) : null;
            var fromText = by != null ? $" from {source.Name}'s {Cards.Def(by.DefId).Name}" : sting ? " (a sting)" : "";
            if (Tidewall(owner) && heat && !pierce)
            {
                int blocked = Math.Min(owner.Shields, amount);
                owner.Shields -= blocked;
                Charge(state, owner, "absorbed", blocked);
                if (blocked > 0)
                {
                    Log(state, $"{owner.Name}'s Tidewall shields absorb {blocked}{fromText}.");
                    if (!sting) ShieldsAnswer(state, owner, source, cardUid);
                }
                amount -= blocked;
            }
            if (amount <= 0 || !owner.Tableau.Contains(victim)) return;
            if ((victim.Shields ?? 0) != 0 && !pierce)
            {
                int held = Math.Min(victim.Shields.Value, amount);
                victim.Shields -= held;
                if (victim.Shields == 0) victim.Shields = null;
                amount -= held;
                Log(state, $"{owner.Name}'s {Cards.Def(victim.DefId).Name}'s shields absorb {held}{fromText}.");
                if (amount <= 0) return;
            }
            int turned = pierce || sting ? 0 : Math.Min(amount, CardDefence(owner, victim));
            if (turned > 0)
            {
                victim.Dented = (victim.Dented ?? 0) + turned;
                Log(state, $"{owner.Name}'s {Cards.Def(victim.DefId).Name} takes {turned} on its defence{fromText} (defence {CardDefence(owner, victim)} left).");
            }
            amount -= turned;
            Credit(state, source, cardUid, "damage", turned + Math.Max(0, amount));
            Charge(state, owner, "turned", turned);
            Charge(state, owner, "struck", turned + Math.Max(0, amount));
            if (amount <= 0) return;
            Charge(state, owner, "wounds", Math.Min(amount, victim.Health ?? 0));
            victim.Health = Math.Max(0, (victim.Health ?? 0) - amount);
            Log(state, $"{owner.Name}'s {Cards.Def(victim.DefId).Name} takes {amount}{(turned > 0 ? "" : fromText)} (health {victim.Health}).");
            if (victim.Health <= 0)
            {
                Log(state, $"{owner.Name}'s {Cards.Def(victim.DefId).Name} burns away.");
                if (source != owner) Credit(state, source, cardUid, "kills", 1);
                Charge(state, owner, "lost");
                if (source != owner) Charge(state, source, "kills");
                LeaveTableau(state, owner, victim);
                int bounty = source != owner ? Relics.N(source.Relics, "bounty") : 0;
                if (bounty != 0 && !source.Eliminated)
                {
                    Cool(state, source, bounty, Relics.Of(source.Relics, "bounty").Name);
                    NotePulse(state, source, null, "cool", source, bounty);
                }
            }
        }

        static void RelicAim(GameState state, PlayerState p, int amount, string power)
        {
            var relic = Relics.Of(p.Relics, power);
            if (relic == null || amount <= 0 || state.WinnerId != null || p.Eliminated || TargetOf(state, p) == null) return;
            var rival = TargetOf(state, p);
            if (rival.Tableau.Count == 0 && rival.Boss == null)
            {
                NotePulse(state, p, null, "heat", rival, amount);
                ApplyHeat(state, rival, amount, p, false, null, false, $"{p.Name}'s {relic.Name}");
                return;
            }
            Log(state, $"{p.Name}'s {relic.Name}: {amount} heat to any target.");
            (p.DawnChoices ??= new List<DawnChoice>()).Add(new DawnChoice { Uid = $"relic:{relic.Name}", Kind = "aim", Relic = relic.Name, Amount = amount });
        }

        static void RelicSear(GameState state, PlayerState p)
        {
            int n = Relics.N(p.Relics, "sear");
            var rival = TargetOf(state, p);
            if (n == 0 || rival == null) return;
            var victim = Sorted(rival.Tableau.Where(c => !(rival.Boss != null && c.Uid == rival.Boss.Leader)), (a, b) => CardAttack(state, rival, b) - CardAttack(state, rival, a)).FirstOrDefault();
            if (victim == null || CardAttack(state, rival, victim) <= 0) return;
            Log(state, $"{p.Name}'s {Relics.Of(p.Relics, "sear").Name} sears {rival.Name}'s {Cards.Def(victim.DefId).Name} for {n}.");
            NotePulse(state, p, null, "heat", rival, n, victim.Uid);
            StrikeCard(state, rival, victim, n, p, false, "", false, true);
        }

        static string GiftCard(GameState state, PlayerState p, int n)
        {
            int? race = !string.IsNullOrEmpty(p.Hero) ? Cards.Def(p.Hero).Race : null;
            var rarities = n >= 3 ? new[] { "dwarf", "stellar", "anomaly" } : n == 2 ? new[] { "dwarf", "stellar" } : new[] { "dwarf" };
            var pool = Cards.Pool.Where(c => c.Race == race && race != null && rarities.Contains(c.Rarity ?? "dwarf") && c.Kind != "command" && c.Kind != "global" && c.Fusion != true && !Cards.IsBossCard(c.Id) && !c.Id.StartsWith("boon_") && (state.Mode != "core" || Modes.InCore(c))).ToList();
            return pool.Count > 0 ? pool[Rng.Int(state, pool.Count)].Id : null;
        }

        static void ResolveEffects(GameState state, PlayerState p, CardInstance card, List<Effect> effects, string when, PlayContext ctx = null)
        {
            ctx ??= new PlayContext();
            foreach (var e in effects ?? new List<Effect>())
            {
                if (state.WinnerId != null || p.Eliminated) return;
                if (!ConditionMet(p, e.If, state, card)) continue;
                switch (e.Type)
                {
                    case "heat":
                    {
                        int amount = EffectAmount(state, p, card, e, when);
                        if (amount <= 0) break;
                        var main = ctx.Against != null && !ctx.Against.Eliminated ? ctx.Against : TargetOf(state, p);
                        if (main == null) break;
                        var aimed = when == "play" && ctx.Against == null && main == TargetOf(state, p) ? AimedCard(state, p, ctx.AimUid) : null;
                        // (A Lost Overlord's blow at the sun: a Guard steps in front of it.)
                        var victim = aimed ?? (ctx.Blow ? BlowGuard(state, main) : null);
                        if (state.WinnerId != null || p.Eliminated) break;
                        if (victim != null)
                        {
                            StrikeCard(state, main, victim, amount, p, e.Pierce == true, card.Uid, false, true);
                            if (aimed == null && when == "turn") NotePulse(state, p, card, "heat", main, amount, victim.Uid);
                            break;
                        }
                        ApplyHeat(state, main, amount, p, false, card.Uid, e.Pierce == true, $"{p.Name}'s {Cards.Def(card.DefId).Name}");
                        if (when == "turn") NotePulse(state, p, card, "heat", main, amount);
                        break;
                    }
                    case "selfHeat":
                        ApplyHeat(state, p, e.Amount ?? 0, null, false, null, false, $"{p.Name}'s {Cards.Def(card.DefId).Name}");
                        if (when == "turn") NotePulse(state, p, card, "selfHeat", p, e.Amount ?? 0);
                        break;
                    case "cool":
                    {
                        int amount = EffectAmount(state, p, card, e, when);
                        var chilled = when == "play" && !string.IsNullOrEmpty(ctx.ChillUid) ? state.Players.FirstOrDefault(o => o.Id != p.Id && o.Tableau.Any(c => c.Uid == ctx.ChillUid)) : null;
                        var victim = chilled?.Tableau.FirstOrDefault(c => c.Uid == ctx.ChillUid);
                        if (amount > 0 && chilled != null && victim != null)
                        {
                            victim.Chill = (victim.Chill ?? 0) + amount;
                            victim.ChilledBy = p.Id;
                            Log(state, $"{p.Name}'s {Cards.Def(card.DefId).Name} chills {chilled.Name}'s {Cards.Def(victim.DefId).Name} (attack −{amount} until {p.Name}'s next day).");
                            break;
                        }
                        if (amount > 0)
                        {
                            Credit(state, p, card.Uid, "support", Math.Min(amount, p.Heat - Balance.MinHeat));
                            Cool(state, p, amount, $"{p.Name}'s {Cards.Def(card.DefId).Name}");
                            if (when == "turn") NotePulse(state, p, card, "cool", p, amount);
                        }
                        break;
                    }
                    case "shield":
                    {
                        int amount = EffectAmount(state, p, card, e, when);
                        if (amount > 0)
                        {
                            Credit(state, p, card.Uid, "support", amount);
                            Charge(state, p, "shields", amount);
                            p.Shields += amount;
                            if (tally != null && tally.Owner == p) tally.Shields += amount;
                            else Log(state, $"{p.Name} raises {amount} shield{(amount == 1 ? "" : "s")}.");
                            if (when == "turn") NotePulse(state, p, card, "shield", p, amount);
                        }
                        break;
                    }
                    case "draw":
                    {
                        int n = (e.Amount ?? 0) + (e.Plus != null ? CountOf(p, card, e.Plus, state) : 0);
                        DrawCards(state, p, n);
                        if (when == "turn") NotePulse(state, p, card, "draw", p, n);
                        break;
                    }
                    case "orbit":
                    {
                        var who = e.Who == "rival" ? (ctx.Against != null && !ctx.Against.Eliminated ? ctx.Against : TargetOf(state, p)) : p;
                        if (who != null) MoveOrbit(state, who, e.Amount ?? 0);
                        break;
                    }
                    case "growOthers":
                        foreach (var other in p.Tableau.ToList()) if (other.Uid != card.Uid) Grow(p, other);
                        break;
                    case "grow":
                        Grow(p, card, e.Max);
                        break;
                    case "plant":
                        Plant(state, p, e.Amount ?? 0);
                        break;
                    case "swapSuns":
                    {
                        var t = ctx.Against != null && !ctx.Against.Eliminated ? ctx.Against : TargetOf(state, p);
                        if (t == null || t.Boss != null)
                        {
                            Cool(state, p, p.Heat - Balance.MinHeat, $"{p.Name}'s {Cards.Def(card.DefId).Name}");
                            break;
                        }
                        int mine = p.Heat;
                        p.Heat = t.Heat;
                        t.Heat = mine;
                        Log(state, $"{p.Name}'s {Cards.Def(card.DefId).Name}: the suns change places ({p.Name} {p.Heat}, {t.Name} {t.Heat}).");
                        if (t.Heat >= SupernovaThreshold(t)) Supernova(state, t);
                        if (state.WinnerId == null && p.Heat >= SupernovaThreshold(p)) Supernova(state, p);
                        break;
                    }
                    case "skipDay":
                    {
                        var t = ctx.Against != null && !ctx.Against.Eliminated ? ctx.Against : TargetOf(state, p);
                        if (t == null) break;
                        t.SkipDays = (t.SkipDays ?? 0) + 1;
                        Log(state, $"{p.Name}'s {Cards.Def(card.DefId).Name}: {t.Name}'s next day will never come.");
                        break;
                    }
                    case "doubleAttack":
                    {
                        int now = CardAttack(state, p, card);
                        if (now <= 0) break;
                        card.AttackBonus = Math.Min(99, (card.AttackBonus ?? 0) + now);
                        Log(state, $"{p.Name}'s {Cards.Def(card.DefId).Name} doubles: attack {CardAttack(state, p, card)}.");
                        break;
                    }
                    case "steal":
                    {
                        var t = ctx.Against ?? TargetOf(state, p);
                        var victim = t?.Tableau.FirstOrDefault(c => c.Uid == ctx.EnemyUid && CanReach(t, c, e));
                        if (t == null || victim == null || t.Eliminated) break;
                        t.Tableau = t.Tableau.Where(c => c != victim).ToList();
                        int wear = Math.Min(victim.Dented ?? 0, SlotDefence(victim.Slot));
                        if (wear > 0 && victim.Slot != null) (t.SlotWear ??= new Dictionary<int, int>())[victim.Slot.Value] = wear;
                        victim.Boons = null; victim.Dented = null; victim.Shields = null; victim.Frozen = null; victim.Fortified = null; victim.SpentAttack = null;
                        victim.Dimmed = null; victim.Fresh = null; victim.MaxHealth = null; victim.Chill = null; victim.ChilledBy = null;
                        victim.Slot = null;
                        var open = FreeSlots(p);
                        int? slot = SlotsBySafety().Where(i => open.Contains(i)).Select(i => (int?)i).FirstOrDefault();
                        if (slot != null)
                        {
                            var health = victim.Health;
                            Place(p, victim, slot.Value);
                            if (health != null) victim.Health = Math.Min(victim.Health ?? health.Value, Math.Max(1, health.Value));
                            Log(state, $"{p.Name} takes {t.Name}'s {Cards.Def(victim.DefId).Name}: it serves them now.");
                        }
                        else if (Cards.Def(victim.DefId).Token == true)
                            Log(state, $"{p.Name} takes {t.Name}'s {Cards.Def(victim.DefId).Name}, and it fades with nowhere to stand.");
                        else
                        {
                            victim.Health = null;
                            p.Hand.Add(victim);
                            Log(state, $"{p.Name} takes {t.Name}'s {Cards.Def(victim.DefId).Name} into their hand.");
                        }
                        foreach (var (watcher, passive) in Passives(t))
                            if (passive.Type == "allyLeaves" && t.Tableau.Contains(watcher) && state.WinnerId == null) ResolveEffects(state, t, watcher, passive.Effects, "leave");
                        break;
                    }
                    case "destroy":
                    case "bounce":
                    {
                        var t = ctx.Against ?? TargetOf(state, p);
                        var victim = t?.Tableau.FirstOrDefault(c => c.Uid == ctx.EnemyUid && CanReach(t, c, e));
                        if (t == null || victim == null) break;
                        if (state.WinnerId != null || t.Eliminated) break;
                        if (e.Type == "bounce")
                        {
                            Log(state, $"{p.Name} returns {t.Name}'s {Cards.Def(victim.DefId).Name} to their hand.");
                            LeaveTableau(state, t, victim, "hand");
                            break;
                        }
                        if (DestroyImmune(victim.DefId))
                        {
                            int n = e.MaxDefence ?? 1;
                            Log(state, $"{t.Name}'s {Cards.Def(victim.DefId).Name} can't be destroyed: it takes {n} damage.");
                            NotePulse(state, p, card, "heat", t, n, victim.Uid);
                            victim.Health = Math.Max(0, (victim.Health ?? 0) - n);
                            if (victim.Health <= 0) Sweep(state, t, victim);
                            break;
                        }
                        var around = e.Neighbours == true ? Neighbours(t, victim).Where(x => !DestroyImmune(x.DefId) && t.Boss?.Leader != x.Uid).ToList() : new List<CardInstance>();
                        Log(state, $"{p.Name} destroys {t.Name}'s {Cards.Def(victim.DefId).Name}.");
                        LeaveTableau(state, t, victim);
                        foreach (var x in around)
                        {
                            if (state.WinnerId != null || t.Eliminated || !t.Tableau.Contains(x)) continue;
                            Log(state, $"{t.Name}'s {Cards.Def(x.DefId).Name} is flung back to their hand.");
                            LeaveTableau(state, t, x, "hand");
                        }
                        break;
                    }
                    case "erode":
                    {
                        var t = ctx.Against ?? TargetOf(state, p);
                        if (t == null) break;
                        var hit = e.All == true ? t.Tableau.ToList() : t.Tableau.Where(c => c.Uid == ctx.EnemyUid).ToList();
                        if (hit.Count == 0) break;
                        foreach (var c in hit)
                        {
                            if (state.WinnerId != null || t.Eliminated || !t.Tableau.Contains(c)) continue;
                            if (Cards.Def(c.DefId).Kind == "command") continue;
                            c.Health = Math.Max(0, (c.Health ?? 0) - (e.Amount ?? 0));
                            Log(state, $"{t.Name}'s {Cards.Def(c.DefId).Name} loses {e.Amount} stability.");
                            if (c.Health <= 0) Sweep(state, t, c);
                        }
                        break;
                    }
                    case "restore":
                    {
                        var mine = e.Self == true ? p.Tableau.Where(c => c.Uid == card.Uid).ToList() : e.All == true ? p.Tableau.Where(c => c.Uid != card.Uid).ToList() : p.Tableau.Where(c => c.Uid == ctx.AllyUid).ToList();
                        foreach (var c in mine)
                        {
                            if (Cards.Def(c.DefId).Kind == "relic") continue;
                            int was = c.Health ?? 0;
                            Mend(state, p, c, e.Amount ?? 0);
                            Credit(state, p, card.Uid, "support", (c.Health ?? 0) - was);
                        }
                        break;
                    }
                    case "repair":
                        Repair(state, p, e.Amount ?? 0);
                        break;
                    case "offer":
                    {
                        var giver = p.Tableau.FirstOrDefault(c => c.Uid == ctx.AllyUid && c.Uid != card.Uid);
                        var t = ctx.Against ?? TargetOf(state, p);
                        var victim = t?.Tableau.FirstOrDefault(c => c.Uid == ctx.EnemyUid);
                        if (giver == null || t == null || victim == null) break;
                        int given = CardAttack(state, p, giver);
                        if (given <= 0) break;
                        giver.SpentAttack = (giver.SpentAttack ?? 0) + given;
                        int n = given * (e.Times ?? 1);
                        Log(state, $"{p.Name}'s {Cards.Def(giver.DefId).Name} offers its attack: {t.Name}'s {Cards.Def(victim.DefId).Name} loses {n} stability.");
                        if (state.WinnerId != null || t.Eliminated || !t.Tableau.Contains(victim)) break;
                        victim.Health = Math.Max(0, (victim.Health ?? 0) - n);
                        if (victim.Health <= 0) Sweep(state, t, victim);
                        break;
                    }
                    case "rootbreak":
                    {
                        var root = p.Tableau.FirstOrDefault(c => c.Uid == ctx.AllyUid);
                        var t = ctx.Against ?? TargetOf(state, p);
                        int n = (root?.Growth ?? 0) * (e.Times ?? 1);
                        if (t == null || n <= 0) break;
                        if (e.Shields == true)
                        {
                            int brokenShields = Math.Min(n, t.Shields);
                            t.Shields -= brokenShields;
                            Log(state, $"{p.Name}'s roots split {t.Name}'s shields: {brokenShields} broken.");
                            break;
                        }
                        var victim = t.Tableau.FirstOrDefault(c => c.Uid == ctx.EnemyUid);
                        if (victim == null) break;
                        int broken = Math.Min(n, CardDefence(t, victim));
                        victim.Dented = (victim.Dented ?? 0) + broken;
                        Log(state, $"{p.Name}'s roots split {t.Name}'s {Cards.Def(victim.DefId).Name}: {broken} defence broken.");
                        break;
                    }
                    case "empower":
                    {
                        var chosen = p.Tableau.FirstOrDefault(c => c.Uid == ctx.AllyUid && c.Uid != card.Uid);
                        if (chosen == null) break;
                        chosen.AttackBonus = (chosen.AttackBonus ?? 0) + (e.Amount ?? 0);
                        Log(state, $"{p.Name}'s {Cards.Def(chosen.DefId).Name} is chosen: +{e.Amount} attack.");
                        break;
                    }
                    case "shift":
                    {
                        var owner = e.Enemy == true ? (ctx.Against ?? TargetOf(state, p)) : p;
                        var moved = owner?.Tableau.FirstOrDefault(c => c.Uid == (e.Enemy == true ? ctx.EnemyUid : ctx.AllyUid) && c.Slot != CommandSlot);
                        var to = ctx.ShiftTo;
                        if (owner == null || moved == null || to == null || to == moved.Slot || to < 0 || to >= Balance.TableauSlots || SlotClosed(owner, to.Value)) break;
                        var other = owner.Tableau.FirstOrDefault(c => c.Slot == to);
                        if (other != null) other.Slot = moved.Slot;
                        moved.Slot = to;
                        Log(state, other != null ? $"{owner.Name}'s {Cards.Def(moved.DefId).Name} and {Cards.Def(other.DefId).Name} swap places." : $"{owner.Name}'s {Cards.Def(moved.DefId).Name} shifts to slot {to + 1}.");
                        break;
                    }
                    case "recall":
                    {
                        var back = p.Tableau.FirstOrDefault(c => c.Uid == ctx.AllyUid && c.Uid != card.Uid && Returnable(c));
                        if (back != null)
                        {
                            Log(state, $"{p.Name} returns {Cards.Def(back.DefId).Name} to their hand.");
                            LeaveTableau(state, p, back, "hand");
                        }
                        break;
                    }
                    case "recover":
                    {
                        if (e.Latest == true && p.Wreck != null && p.Wreck.Count > 0)
                        {
                            int w = -1;
                            for (int k = 0; k < p.Wreck.Count; k++) if (Returnable(p.Wreck[k]) && KindMatches(p.Wreck[k], e.Kind)) w = k;
                            if (w >= 0)
                            {
                                var back = p.Wreck[w];
                                p.Wreck.RemoveAt(w);
                                p.Hand.Add(back);
                                Log(state, $"{p.Name} recovers {Cards.Def(back.DefId).Name} from the wreckage.");
                                ResolveEffects(state, p, back, Cards.Def(back.DefId).OnRecover, "recover");
                                break;
                            }
                        }
                        int latest = -1;
                        if (e.Latest == true) for (int k = 0; k < p.Discard.Count; k++) if (Returnable(p.Discard[k]) && KindMatches(p.Discard[k], e.Kind)) latest = k;
                        int i = e.Latest == true ? latest : p.Discard.FindIndex(c => c.Uid == ctx.RecoverUid && KindMatches(c, e.Kind));
                        if (i < 0)
                        {
                            if ((e.OrDraw ?? 0) != 0 && !p.Discard.Any(c => KindMatches(c, e.Kind)))
                            {
                                Log(state, $"{p.Name} has nothing to recover, and draws instead.");
                                DrawCards(state, p, e.OrDraw.Value);
                            }
                            break;
                        }
                        var got = p.Discard[i];
                        p.Discard.RemoveAt(i);
                        p.Hand.Add(got);
                        Log(state, $"{p.Name} recovers {Cards.Def(got.DefId).Name} from their reserves.");
                        ResolveEffects(state, p, got, Cards.Def(got.DefId).OnRecover, "recover");
                        break;
                    }
                    case "plays":
                        if (ActivePlayer(state).Id == p.Id)
                        {
                            int amt = e.Amount ?? 0;
                            if (when == "turn") p.Turn.DawnEnergy = (p.Turn.DawnEnergy ?? 0) + amt;
                            else
                            {
                                p.PlaysLeft += amt;
                                p.Turn.EnergyTotal = (p.Turn.EnergyTotal ?? p.PlaysLeft - amt) + amt;
                            }
                            Log(state, $"{p.Name} gains {e.Amount} energy today.");
                        }
                        break;
                    case "hitBack":
                    {
                        var enemy = ctx.Against;
                        var attacker = enemy?.Tableau.FirstOrDefault(c => c.Uid == ctx.Event?.AttackerUid);
                        if (enemy == null || attacker == null) break;
                        Log(state, $"{p.Name}'s {Cards.Def(card.DefId).Name} strikes {enemy.Name}'s {Cards.Def(attacker.DefId).Name} for {e.Amount}.");
                        StrikeCard(state, enemy, attacker, e.Amount ?? 0, p, false, card.Uid, false, true);
                        break;
                    }
                    case "returnIt":
                    {
                        var enemy = ctx.Against;
                        var r = ctx.Reaction;
                        if (enemy == null || r == null) break;
                        if (r.Pending.Kind == "play")
                        {
                            r.Cancelled = r.Returned = true;
                            break;
                        }
                        var attacker = enemy.Tableau.FirstOrDefault(c => c.Uid == r.Pending.AttackerUid);
                        if (attacker != null && attacker.Slot != CommandSlot)
                        {
                            Log(state, $"{p.Name}'s {Cards.Def(card.DefId).Name} sends {enemy.Name}'s {Cards.Def(attacker.DefId).Name} back to their hand.");
                            LeaveTableau(state, enemy, attacker, "hand");
                        }
                        break;
                    }
                    case "fortify":
                    {
                        var mine = e.Who == "it" ? p.Tableau.FirstOrDefault(c => c.Uid == ctx.Event?.MineUid) : Sorted(p.Tableau, (a, b) => CardDefence(p, b) - CardDefence(p, a)).FirstOrDefault();
                        if (mine == null) break;
                        mine.Fortified = (mine.Fortified ?? 0) + (e.Amount ?? 0);
                        bool guard = IsGuard(p, mine);
                        Log(state, $"{p.Name}'s {Cards.Def(mine.DefId).Name} gains {e.Amount} defence and stands Guard until their next dawn.");
                        if (guard && ctx.Reaction != null) ctx.Reaction.Redirect = mine.Uid;
                        break;
                    }
                    case "shiftMine":
                    {
                        var mine = p.Tableau.FirstOrDefault(c => c.Uid == ctx.Event?.MineUid && c.Slot != CommandSlot);
                        var toList = Sorted(FreeSlots(p).Where(i => i != CommandSlot), (a, b) => SlotDefence(b) - SlotDefence(a));
                        if (mine == null || toList.Count == 0 || SlotDefence(toList[0]) <= SlotDefence(mine.Slot)) break;
                        mine.Slot = toList[0];
                        Log(state, $"{p.Name}'s {Cards.Def(mine.DefId).Name} shifts to slot {toList[0] + 1}, out of harm's way.");
                        break;
                    }
                    case "blast":
                    {
                        var t = ctx.Against ?? TargetOf(state, p);
                        if (t == null) break;
                        var slotted = t.Tableau.Where(c => c.Slot != CommandSlot || t.Boss != null).ToList();
                        var main = slotted.FirstOrDefault(c => c.Uid == ctx.AimUid) ?? StrikeHits(state, t, new Effect { Type = "strikeBest", Amount = e.Amount }).FirstOrDefault();
                        if (main == null)
                        {
                            ApplyHeat(state, t, e.Amount ?? 0, p, false, card.Uid, false, $"{p.Name}'s {Cards.Def(card.DefId).Name}");
                            NotePulse(state, p, card, "heat", t, e.Amount ?? 0);
                            break;
                        }
                        var beside = main.Slot == CommandSlot ? new List<CardInstance>() : t.Tableau.Where(c => c.Slot != CommandSlot && Math.Abs((c.Slot ?? -9) - (main.Slot ?? -9)) == 1).ToList();
                        StrikeCard(state, t, main, e.Amount ?? 0, p, false, card.Uid, false, true);
                        NotePulse(state, p, card, "heat", t, e.Amount ?? 0, main.Uid);
                        foreach (var c in beside)
                        {
                            if (state.WinnerId != null || t.Eliminated || !t.Tableau.Contains(c)) continue;
                            StrikeCard(state, t, c, e.Side ?? 0, p, false, card.Uid, false, true);
                            NotePulse(state, p, card, "heat", t, e.Side ?? 0, c.Uid);
                            var last = state.TurnPulses != null && state.TurnPulses.Count > 0 ? state.TurnPulses[state.TurnPulses.Count - 1] : null;
                            if (last != null) last.Together = true;
                        }
                        break;
                    }
                    case "strikeBest":
                    case "strikeAll":
                    {
                        var t = ctx.Against ?? TargetOf(state, p);
                        if (t == null) break;
                        var hit = StrikeHits(state, t, e, ctx.Blow);
                        if (hit.Count == 0 && ((e.Type == "strikeBest" && e.Guarded == true) || Cards.Def(card.DefId).BossAction != null))
                        {
                            ApplyHeat(state, t, e.Amount ?? 0, p, false, card.Uid, false, $"{p.Name}'s {Cards.Def(card.DefId).Name}");
                            NotePulse(state, p, card, "heat", t, e.Amount ?? 0);
                            break;
                        }
                        foreach (var c in hit)
                        {
                            if (state.WinnerId != null || t.Eliminated || !t.Tableau.Contains(c)) continue;
                            StrikeCard(state, t, c, e.Amount ?? 0, p, false, card.Uid, false, true);
                            NotePulse(state, p, card, "heat", t, e.Amount ?? 0, c.Uid);
                            var last = state.TurnPulses != null && state.TurnPulses.Count > 0 ? state.TurnPulses[state.TurnPulses.Count - 1] : null;
                            if (last != null && e.Type == "strikeAll" && c != hit[0]) last.Together = true;
                        }
                        break;
                    }
                    case "devour":
                    {
                        var t = ctx.Against ?? TargetOf(state, p);
                        var victim = t != null ? DevourVictim(t, ctx.Blow) : null;
                        if (t == null) break;
                        if (victim == null)
                        {
                            if (Cards.Def(card.DefId).BossAction != null)
                            {
                                ApplyHeat(state, t, DevourSunHeat, p, false, card.Uid, false, $"{p.Name}'s {Cards.Def(card.DefId).Name}");
                                NotePulse(state, p, card, "heat", t, DevourSunHeat);
                            }
                            break;
                        }
                        Log(state, $"{p.Name}'s {Cards.Def(card.DefId).Name} devours {t.Name}'s {Cards.Def(victim.DefId).Name}.");
                        NotePulse(state, p, card, "heat", t, 1, victim.Uid);
                        LeaveTableau(state, t, victim);
                        break;
                    }
                    case "summon":
                    {
                        var open = SlotsBySafety().Where(i => FreeSlots(p).Contains(i) && i != CommandSlot).Take(e.Amount ?? 0).ToList();
                        foreach (var slot in open) Place(p, NewCard(state, e.DefId), slot);
                        if (open.Count > 0) Log(state, $"{p.Name} calls {open.Count} {Cards.Def(e.DefId).Name}{(open.Count == 1 ? "" : "s")} into play.");
                        break;
                    }
                    case "halt":
                        if (ctx.Against != null && ctx.Against.PlaysLeft > 0)
                        {
                            ctx.Against.PlaysLeft = 0;
                            Log(state, $"{ctx.Against.Name} may play no more cards today.");
                        }
                        break;
                }
            }
        }

        static void Mend(GameState state, PlayerState p, CardInstance c, int amount)
        {
            int full = Math.Max(BaseHealth(c.DefId), c.MaxHealth ?? 0);
            int was = c.Health ?? 0;
            c.Health = Math.Min(full, was + amount);
            Charge(state, p, "mends", c.Health.Value - was);
            if (c.Health > was) Log(state, $"{p.Name}'s {Cards.Def(c.DefId).Name} steadies (stability {c.Health}).");
        }

        static void Sweep(GameState state, PlayerState owner, CardInstance card)
        {
            Log(state, $"{owner.Name}'s {Cards.Def(card.DefId).Name} fades into their wreckage.");
            LeaveTableau(state, owner, card, "discard");
        }

        static void LeaveTableau(GameState state, PlayerState owner, CardInstance card, string to = "discard")
        {
            owner.Tableau = owner.Tableau.Where(c => c.Uid != card.Uid).ToList();
            Charge(state, owner, "departures");
            if (owner.Boss != null && state.Challenge?.Kind == "mine" && card.DefId == "antimatter_crystal") state.Challenge.Broken += 1;
            if (card.DefId.StartsWith("reliquary_obelisk") && state.VaultOpened != true)
            {
                state.VaultOpened = true;
                Log(state, "The Reliquary Obelisk breaks open: its emblems are free.");
            }
            if (owner.Boss?.Leader == card.Uid && !owner.Eliminated)
            {
                Log(state, $"☠ {owner.Name} falls!");
                owner.Eliminated = true;
                var alive = state.Players.Where(o => !o.Eliminated).ToList();
                if (alive.Count == 1)
                {
                    state.WinnerId = alive[0].Id;
                    Log(state, $"{alive[0].Name} wins the Blue Loop!");
                }
            }
            int wear = Math.Min(card.Dented ?? 0, SlotDefence(card.Slot));
            if (wear > 0 && card.Slot != null) (owner.SlotWear ??= new Dictionary<int, int>())[card.Slot.Value] = wear;
            card.Growth = null;
            card.Slot = null;
            card.Boons = null;
            card.Dented = null;
            card.Stability = null;
            card.MaxHealth = null;
            card.Health = null;
            card.Choice = null;
            card.Spent = null;
            card.Shields = null;
            card.Frozen = null;
            card.Charge = null;
            // (What it did today goes with it: back in play it comes in as any card does, dimmed or, with Darkspeed, ready.)
            card.Dimmed = null;
            card.Fresh = null;
            card.SpentAttack = null;
            card.Fortified = null;
            card.Chill = null;
            card.ChilledBy = null;
            var leaving = Cards.Def(card.DefId);
            if (card.EchoOf != null)
            {
                card.DefId = card.EchoOf;
                card.EchoOf = null;
            }
            if (Cards.Def(card.DefId).Token == true) { }
            else if (to == "deck") owner.Deck.Insert(Rng.Int(state, owner.Deck.Count + 1), card);
            else if (to == "hand") owner.Hand.Add(card);
            else ToWreck(owner, card);
            ResolveEffects(state, owner, card, leaving.OnLeave, "leave");
            var fused = card.Fused ?? new List<CardInstance>();
            card.Fused = null;
            foreach (var f in fused)
            {
                ToWreck(owner, f);
                if (state.WinnerId == null && !owner.Eliminated) ResolveEffects(state, owner, card, Cards.Def(f.DefId).OnLeave, "leave");
            }
            foreach (var (watcher, passive) in Passives(owner))
                if (passive.Type == "allyLeaves" && owner.Tableau.Contains(watcher)) ResolveEffects(state, owner, watcher, passive.Effects, "leave");
        }

        static void NotePulse(GameState state, PlayerState source, CardInstance card, string kind, PlayerState to, int amount, string toCard = null)
        {
            if (state.TurnPulses == null || (amount <= 0 && kind != "start")) return;
            var suns = state.Players.ToDictionary(x => x.Id, x => new SunAt { Heat = x.Heat, Shields = x.Shields, Eliminated = x.Eliminated });
            state.TurnPulses.Add(new TurnPulse { Uid = card?.Uid, Source = source.Id, To = to.Id, Kind = kind, Amount = amount, Suns = suns, ToCard = string.IsNullOrEmpty(toCard) ? null : toCard });
        }

        static void RegionalInstability(GameState state, PlayerState roundStarter)
        {
            int n = InstabilityHeat(state);
            if (n <= 0) return;
            var living = state.Players.Where(x => !x.Eliminated).ToList();
            Log(state, $"Regional instability heats every sun by {n}.");
            foreach (var x in living) x.Heat = Math.Max(Balance.MinHeat, x.Heat + n);
            foreach (var x in living) if (HasPower(x, "unburning")) x.Heat = Math.Min(x.Heat, SupernovaThreshold(x) - 1);
            var over = living.Where(x => x.Heat >= SupernovaThreshold(x)).ToList();
            if (over.Count > 0 && over.Count == living.Count)
            {
                foreach (var x in over) Supernova(state, x, false);
                state.WinnerId = Draw;
                Log(state, "Every sun goes supernova together: a draw.");
            }
            else foreach (var x in over) Supernova(state, x);
            for (int i = 0; i < living.Count; i++)
            {
                NotePulse(state, roundStarter, null, "unstable", living[i], n);
                var last = state.TurnPulses != null && state.TurnPulses.Count > 0 ? state.TurnPulses[state.TurnPulses.Count - 1] : null;
                if (last != null && i > 0) last.Together = true;
            }
            foreach (var x in living) WaveHitsCards(state, x, roundStarter);
        }

        static void WaveHitsCards(GameState state, PlayerState x, PlayerState source)
        {
            int n = x.Modifiers?.WaveCardHeat ?? 0;
            if (n <= 0 || state.WinnerId != null || x.Eliminated) return;
            var hit = x.Tableau.Where(c => Cards.Def(c.DefId).Kind != "command").ToList();
            if (hit.Count == 0) return;
            Log(state, $"The heat wave sears {x.Name}'s cards.");
            foreach (var c in hit)
            {
                if (state.WinnerId != null || x.Eliminated || !x.Tableau.Contains(c)) continue;
                StrikeCard(state, x, c, n, x, false, "", false, true);
                NotePulse(state, source, null, "unstable", x, n, c.Uid);
                var last = state.TurnPulses != null && state.TurnPulses.Count > 0 ? state.TurnPulses[state.TurnPulses.Count - 1] : null;
                if (last != null) last.Together = true;
            }
        }

        static void Grow(PlayerState p, CardInstance card, int? max = null, bool spread = true)
        {
            if (Cards.Def(card.DefId).Kind == "command") return;
            int limit = max ?? Balance.MaxGrowth;
            if ((card.Growth ?? 0) >= limit) return;
            card.Growth = (card.Growth ?? 0) + 1;
            if (Balance.GrowthHealth != 0) card.Health = (card.Health ?? 0) + Balance.GrowthHealth;
            if (spread && CardPassives(card).Any(x => x.Type == "catalyst"))
                foreach (var other in p.Tableau.ToList()) if (other.Uid != card.Uid) Grow(p, other, null, false);
        }

        static void Plant(GameState state, PlayerState p, int n)
        {
            int planted = 0;
            for (int i = 0; i < n; i++)
            {
                var open = FreeSlots(p);
                if (open.Count == 0) break;
                int slot = Sorted(open, (a, b) => SlotDefence(a) - SlotDefence(b) != 0 ? SlotDefence(a) - SlotDefence(b) : a - b)[0];
                Place(p, NewCard(state, "sapling"), slot);
                planted++;
            }
            if (planted != 0) Log(state, $"{p.Name} plants {planted} Sapling{(planted == 1 ? "" : "s")}.");
        }

        static void MendDefences(GameState state, PlayerState p)
        {
            if (Balance.DefenceMend <= 0) return;
        }

        static void Repair(GameState state, PlayerState p, int amount)
        {
            int left = amount;
            while (left > 0)
            {
                var worst = Sorted(p.Tableau.Where(c => (c.Dented ?? 0) > 0), (a, b) => (b.Dented ?? 0) - (a.Dented ?? 0)).FirstOrDefault();
                if (worst == null) break;
                worst.Dented -= 1;
                if (worst.Dented == 0) worst.Dented = null;
                left -= 1;
            }
            // (Object.keys: array-index keys first, ascending, then the rest (the Hero slot's, -1) as they were added.)
            foreach (var slot in (p.SlotWear?.Keys ?? Enumerable.Empty<int>()).OrderBy(k => k < 0 ? 1 : 0).ThenBy(k => k < 0 ? 0 : k).ToList())
            {
                if (left <= 0) break;
                int by = Math.Min(left, p.SlotWear[slot]);
                p.SlotWear[slot] -= by;
                left -= by;
                if (p.SlotWear[slot] == 0) p.SlotWear.Remove(slot);
            }
            if (left < amount)
            {
                Charge(state, p, "mends", amount - left);
                if (tally != null && tally.Owner == p) tally.Repaired += amount - left;
                else Log(state, $"{p.Name} repairs {amount - left} defence.");
            }
        }

        static List<CardInstance> StrikeHits(GameState state, PlayerState t, Effect e, bool blow = false)
        {
            if (e.Type == "strikeAll") return t.Tableau.ToList();
            // (A guarded strike, or a Lost Overlord's blow: a Guard draws it in.)
            var pool = (e.Guarded == true || blow) && Guards(t).Count > 0 ? Guards(t) : t.Tableau;
            return Sorted(pool, (a, b) =>
            {
                int d = CardAttack(state, t, b) - CardAttack(state, t, a);
                return d != 0 ? d : (b.Health ?? 0) - (a.Health ?? 0);
            }).Take(1).ToList();
        }

        /// <summary>What a Devour eats: the weakest card it can take (never a Lost Overlord's own body, nor an entrenched
        /// one); a Lost Overlord's, a Guard first, if it can take one.</summary>
        static CardInstance DevourVictim(PlayerState t, bool blow = false)
        {
            var can = t.Tableau.Where(c => c.Uid != t.Boss?.Leader && !DestroyImmune(c.DefId)).ToList();
            var guarding = blow ? can.Where(c => IsGuard(t, c)).ToList() : new List<CardInstance>();
            return Sorted(guarding.Count > 0 ? guarding : can, (a, b) => (a.Health ?? 0) - (b.Health ?? 0)).FirstOrDefault();
        }

        /// <summary>The Guard a Lost Overlord's blow at the sun strikes instead: the one a single-target blow would pick
        /// among them (most attack, then most stability). None with no Guard in play.</summary>
        static CardInstance BlowGuard(GameState state, PlayerState t) =>
            Guards(t).Count > 0 ? StrikeHits(state, t, new Effect { Type = "strikeBest", Amount = 0 }, true).FirstOrDefault() : null;
    }
}
