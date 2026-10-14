using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    public static partial class Game
    {
        static PlayerState PlayerById(GameState state, string id) => state.Players.First(x => x.Id == id);

        static Action Copy(Action a) => (Action)typeof(Action).GetMethod("MemberwiseClone", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic).Invoke(a, null);

        public static bool TriggerMatches(TrapTrigger t, ReactEvent ev)
        {
            if (t.On != ev.On) return false;
            if (t.On != "enemyPlays" || t.Kind == null) return true;
            return ev.FaceDown == true ? t.Kind == "trap" : ev.DefId != null && DefHasRole(Cards.Def(ev.DefId), t.Kind);
        }

        public static int ReactCost(string defId) => CardCost(defId);

        public class ReactOptions { public bool Slot; public List<string> Hand; }

        public static ReactOptions ReactOptionsFor(GameState state, PlayerState o, List<ReactEvent> events)
        {
            var none = new ReactOptions { Slot = false, Hand = new List<string>() };
            if (o.Eliminated) return none;
            var mine = events.Where(ev => ev.MineUid == null || o.Tableau.Any(c => c.Uid == ev.MineUid)).ToList();
            if (mine.Count == 0) return none;
            bool Springs(string defId)
            {
                var t = Cards.Def(defId).Trap;
                if (t == null || !mine.Any(ev => TriggerMatches(t.Trigger, ev))) return false;
                return t.Deploy != true || FreeSlots(o).Any(i => i != CommandSlot);
            }
            bool slot = o.Lightspeed != null && Springs(o.Lightspeed.DefId);
            var hand = o.ReactedDay == state.TurnNumber ? new List<string>() : o.Hand.Where(c => IsLightspeed(c.DefId) && ReactCost(c.DefId) <= (o.Banked ?? 0) && HasRoomFor(o, c.DefId)).Select(c => c.Uid).ToList();
            return new ReactOptions { Slot = slot, Hand = hand };
        }

        static bool WouldAnswer(GameState state, PlayerState mover, List<ReactEvent> events) =>
            OthersInOrder(state, mover).Any(o =>
            {
                var k = ReactOptionsFor(state, o, events);
                return k.Slot || k.Hand.Count > 0;
            });

        static bool OpenReaction(GameState state, PlayerState mover, List<ReactEvent> events, PendingMove pending)
        {
            foreach (var o in OthersInOrder(state, mover))
            {
                var k = ReactOptionsFor(state, o, events);
                if (!k.Slot && k.Hand.Count == 0) continue;
                state.Reaction = new Reaction { PlayerId = o.Id, EnemyId = mover.Id, Events = events, Pending = pending, Slot = k.Slot, Hand = k.Hand };
                if (k.Slot) React(state, new Action { Type = "react", Slot = true });
                return true;
            }
            return false;
        }

        static bool holdResume;

        /// <summary>A Lightspeed answer as it lands, before the move it answered goes on.</summary>
        public static GameState AnswerShown(GameState prev, Action action)
        {
            holdResume = true;
            try
            {
                return Apply(prev, action);
            }
            finally
            {
                holdResume = false;
            }
        }

        static void React(GameState state, Action action)
        {
            var r = state.Reaction;
            if (r == null) throw new GameError("There is nothing to answer.");
            var o = PlayerById(state, r.PlayerId);
            var enemy = PlayerById(state, r.EnemyId);
            if (action.SlotTrap) SpringTrap(state, r, o, enemy);
            else if (action.CardUid != null) PlayInReply(state, r, o, enemy, action);
            else
            {
                state.Reaction = null;
                Resume(state, r);
                return;
            }
            if (state.WinnerId != null || enemy.Eliminated)
            {
                state.Reaction = null;
                if (enemy.Eliminated && ActivePlayer(state) == enemy) PassOn(state);
                return;
            }
            if (r.Cancelled == true)
            {
                state.Reaction = null;
                CancelPending(state, enemy, r);
                return;
            }
            var more = ReactOptionsFor(state, o, r.Events);
            if (more.Slot || more.Hand.Count > 0)
            {
                r.Slot = more.Slot;
                r.Hand = more.Hand;
                return;
            }
            state.Reaction = null;
            if (!holdResume) Resume(state, r);
        }

        static void SpringTrap(GameState state, Reaction r, PlayerState o, PlayerState enemy)
        {
            if (!r.Slot || o.Lightspeed == null) throw new GameError("Your face-down trap does not answer this.");
            var card = o.Lightspeed;
            o.Lightspeed = null;
            var def = Cards.Def(card.DefId);
            var t = def.Trap;
            var ev = r.Events.FirstOrDefault(x => TriggerMatches(t.Trigger, x)) ?? r.Events[0];
            var cause = ev.DefId ?? (ev.AttackerUid != null ? enemy.Tableau.FirstOrDefault(c => c.Uid == ev.AttackerUid)?.DefId : null);
            Log(state, $"⚡ Trap! {o.Name} springs {def.Name}{(cause != null ? $" in answer to {enemy.Name}'s {Cards.Def(cause).Name}" : "")}.");
            (state.Sprung ??= new List<Sprung>()).Add(new Sprung { OwnerId = o.Id, DefId = card.DefId, Against = cause, EnemyId = enemy.Id, Trigger = t.Trigger.On });
            Charge(state, o, "traps");
            if (t.Deploy == true)
            {
                int slot = SlotsBySafety().First(i => FreeSlots(o).Contains(i) && i != CommandSlot);
                Place(o, card, slot);
                r.Redirect = card.Uid;
                Log(state, $"{o.Name}'s {def.Name} lands in their tableau, and takes the attack.");
            }
            else ToWreck(o, card);
            ResolveEffects(state, o, card, t.Effects, "spring", new PlayContext { Against = enemy, Event = ev, Reaction = r });
            if (t.Counter == true) r.Cancelled = true;
        }

        static void PlayInReply(GameState state, Reaction r, PlayerState o, PlayerState enemy, Action action)
        {
            if (!r.Hand.Contains(action.CardUid)) throw new GameError("That card cannot be played in reply.");
            var card = o.Hand.First(c => c.Uid == action.CardUid);
            var def = Cards.Def(card.DefId);
            int cost = ReactCost(card.DefId);
            if ((o.Banked ?? 0) < cost) throw new GameError("Not enough banked energy");
            var ev = r.Events[0];
            var attacker = ev.AttackerUid != null && enemy.Tableau.Any(c => c.Uid == ev.AttackerUid) ? ev.AttackerUid : null;
            var play = new Action { Type = "playCard", CardUid = card.Uid, AimUid = attacker };
            if (action.Play != null)
            {
                // ({ aimUid: attacker, ...action.play }: what the play names, over the default aim.)
                if (action.Play.Slot != null) play.SlotIndex = action.Play.Slot;
                if (action.Play.AimUid != null) play.AimUid = action.Play.AimUid;
                if (action.Play.EnemyUid != null) play.EnemyUid = action.Play.EnemyUid;
                if (action.Play.AllyUid != null) play.AllyUid = action.Play.AllyUid;
                if (action.Play.Choice != null) play.Choice = action.Play.Choice;
            }
            Log(state, $"⚡ Lightspeed! {o.Name} plays {def.Name} in reply.");
            int day = o.PlaysLeft;
            o.PlaysLeft = o.Banked ?? 0;
            try
            {
                PlayCard(state, o, play, true);
            }
            finally
            {
                o.Banked = o.PlaysLeft;
                o.PlaysLeft = day;
            }
            o.ReactedDay = state.TurnNumber;
            var cause = ev.DefId ?? (attacker != null ? enemy.Tableau.FirstOrDefault(c => c.Uid == attacker)?.DefId : null);
            (state.Sprung ??= new List<Sprung>()).Add(new Sprung { OwnerId = o.Id, DefId = card.DefId, Against = cause, EnemyId = enemy.Id, Trigger = ev.On });
            var placed = o.Tableau.FirstOrDefault(c => c.Uid == card.Uid);
            if (placed != null && r.Pending.Kind == "attack" && IsGuard(o, placed)) r.Redirect = placed.Uid;
        }

        static void CancelPending(GameState state, PlayerState enemy, Reaction r)
        {
            if (r.Pending.Kind == "play")
            {
                var action = r.Pending.Action;
                var card = enemy.Hand.FirstOrDefault(c => c.Uid == action.CardUid);
                if (card == null) return;
                var def = Cards.Def(card.DefId);
                enemy.PlaysLeft = Math.Max(0, enemy.PlaysLeft - PlayCost(def.Id, def.Kind == "trap" || action.FaceDown == true));
                enemy.Turn.CardsPlayed += 1;
                if (r.Returned == true)
                {
                    Log(state, $"{enemy.Name}'s {def.Name} goes back to their hand.");
                    return;
                }
                enemy.Hand = enemy.Hand.Where(c => c != card).ToList();
                ToWreck(enemy, card);
                Log(state, $"{(action.FaceDown == true || def.Kind == "trap" ? "The face-down card" : def.Name)} is cancelled.");
                return;
            }
            var attacker = enemy.Tableau.FirstOrDefault(c => c.Uid == r.Pending.AttackerUid);
            if (attacker != null) attacker.Dimmed = true;
            Log(state, $"{enemy.Name}'s attack is called off.");
        }

        static void Resume(GameState state, Reaction r)
        {
            var enemy = PlayerById(state, r.EnemyId);
            var o = PlayerById(state, r.PlayerId);
            string GuardTo() => r.Redirect != null && o.Tableau.Any(c => c.Uid == r.Redirect && IsGuard(o, c)) ? r.Redirect : Sorted(Guards(o), (a, b) => CardDefence(o, b) - CardDefence(o, a)).FirstOrDefault()?.Uid;
            if (r.Pending.Kind == "attack")
            {
                var attacker = enemy.Tableau.FirstOrDefault(c => c.Uid == r.Pending.AttackerUid);
                if (attacker == null)
                {
                    Log(state, $"{enemy.Name}'s attack never comes.");
                    return;
                }
                var target = r.Pending.TargetUid;
                if (r.Redirect != null && o.Tableau.Any(c => c.Uid == r.Redirect)) target = r.Redirect;
                if (AttackProblem(state, enemy, attacker.Uid, target, true) != null) target = GuardTo();
                if (target != null && !o.Tableau.Any(c => c.Uid == target)) target = null;
                if (AttackProblem(state, enemy, attacker.Uid, target, true) != null)
                {
                    Log(state, $"{enemy.Name}'s {Cards.Def(attacker.DefId).Name} finds nothing to strike.");
                    attacker.Dimmed = true;
                    return;
                }
                Attack(state, enemy, attacker, target);
                if (enemy.Eliminated) PassOn(state);
                return;
            }
            var action = Copy(r.Pending.Action);
            if (action.AimUid != null)
            {
                var aimable = AimChoices(state, enemy).Cards;
                if (r.Redirect != null && aimable.Any(c => c.Uid == r.Redirect)) action.AimUid = r.Redirect;
                else if (!aimable.Any(c => c.Uid == action.AimUid)) action.AimUid = null;
            }
            var trial = Clone(state);
            try
            {
                PlayCard(trial, PlayerById(trial, enemy.Id), action, true);
                Become(state, trial);
                // (As Object.assign leaves it: `enemy` is still the player as it was before the trial.)
            }
            catch (GameError)
            {
                var card = enemy.Hand.FirstOrDefault(c => c.Uid == action.CardUid);
                if (card != null)
                {
                    var def = Cards.Def(card.DefId);
                    enemy.Hand = enemy.Hand.Where(c => c != card).ToList();
                    ToWreck(enemy, card);
                    enemy.PlaysLeft = Math.Max(0, enemy.PlaysLeft - PlayCost(def.Id, def.Kind == "trap" || action.FaceDown == true));
                    Log(state, $"{enemy.Name}'s {def.Name} fizzles: what it aimed at is out of reach.");
                }
            }
            if (enemy.Eliminated) PassOn(state);
        }

        /// <summary>Object.assign(state, trial): the state takes on every field of the trial.</summary>
        static void Become(GameState state, GameState trial)
        {
            foreach (var f in typeof(GameState).GetFields()) f.SetValue(state, f.GetValue(trial));
            foreach (var pr in typeof(GameState).GetProperties()) if (pr.CanWrite) pr.SetValue(state, pr.GetValue(trial));
        }

        static void PlayCard(GameState state, PlayerState p, Action action, bool answered = false)
        {
            var card = p.Hand.FirstOrDefault(c => c.Uid == action.CardUid);
            if (card == null) throw new GameError("That card is not in your hand.");
            var def = Cards.Def(card.DefId);
            bool asTrap = def.Kind == "trap" || (action.FaceDown == true && DualTrap(def.Id));
            if (!answered && state.NoReactions != true)
            {
                var events = new List<ReactEvent> { asTrap ? new ReactEvent { On = "enemyPlays", FaceDown = true } : new ReactEvent { On = "enemyPlays", DefId = def.Id } };
                var aimed = asTrap ? null : action.EnemyUid ?? action.AimUid;
                if (aimed != null) events.Add(new ReactEvent { On = "targeted", DefId = def.Id, MineUid = aimed });
                if (WouldAnswer(state, p, events))
                {
                    var trial = Clone(state);
                    PlayCard(trial, ActivePlayer(trial), action, true);
                    if (OpenReaction(state, p, events, new PendingMove { Kind = "play", Action = action })) return;
                }
            }
            int cost = HasPower(p, "freeCards") ? 0 : Math.Max(0, PlayCost(def.Id, asTrap) - (card.Discount ?? 0));
            if (p.PlaysLeft < cost) throw new GameError(p.PlaysLeft <= 0 ? "You have no energy left today." : $"{def.Name} costs {cost} energy: you have {p.PlaysLeft} left today.");
            if (asTrap && !CanSetTrap(p)) throw new GameError("One trap at a time");
            if (def.Consume == true && !asTrap)
            {
                var chosen = action.SacrificeUid != null ? Consumable(p).FirstOrDefault(c => c.Uid == action.SacrificeUid) : null;
                if (action.SacrificeUid != null && chosen == null) throw new GameError("Consume one of your own cards in play (not your Hero).");
                var victim = chosen ?? SacrificeOf(p);
                if (victim == null) throw new GameError($"{def.Name} needs another of your cards in play to consume.");
                Log(state, $"{p.Name}'s {def.Name} consumes {Cards.Def(victim.DefId).Name}.");
                Charge(state, p, "sacrifices");
                LeaveTableau(state, p, victim);
                if (state.WinnerId != null || p.Eliminated) return;
            }
            bool fusing = def.Fusion == true && !asTrap && action.HostUid != null;
            if (!asTrap && !fusing && Replaces(p, def.Id))
            {
                var chosen = action.SacrificeUid != null ? Consumable(p).FirstOrDefault(c => c.Uid == action.SacrificeUid) : null;
                if (action.SacrificeUid != null && chosen == null) throw new GameError("Replace one of your own cards in play (not your Hero).");
                var old = chosen ?? SacrificeOf(p);
                Log(state, $"{p.Name}'s {def.Name} replaces {Cards.Def(old.DefId).Name}.");
                if (action.SlotIndex == null || action.SlotIndex == old.Slot)
                {
                    action = Copy(action);
                    action.SlotIndex = old.Slot;
                }
                LeaveTableau(state, p, old);
                if (state.WinnerId != null || p.Eliminated) return;
            }
            bool slotted = InSlots(def.Id) && !asTrap && !fusing;

            var choices = CardChoices(def.Id);
            if (choices.Count > 0 && !choices.Contains(action.Choice ?? "")) throw new GameError("Choose one of its options.");
            var target = TargetOf(state, p);
            var foes = EnemyChoices(state, p, def.Id, action.AimUid);
            if (foes.Count > 0 && !foes.Any(c => c.Uid == action.EnemyUid)) throw new GameError($"Choose a card in {target?.Name ?? "your rival"}'s tableau.");
            if (action.EnemyUid != null && EnemyEffect(def.Id) != null && !foes.Any(c => c.Uid == action.EnemyUid)) throw new GameError("That card is out of its reach.");
            var recalled = AllyEffectKind(def.Id) == "recall" ? p.Tableau.FirstOrDefault(c => c.Uid == action.AllyUid && Returnable(c) && c.Slot != CommandSlot) : null;
            bool swap = slotted && (TableauFull(p) ? RecallsInto(p, def.Id) : recalled != null && action.SlotIndex == recalled.Slot);
            var free = FreeSlots(p);
            if (slotted && !swap && action.SlotIndex != null && !free.Contains(action.SlotIndex.Value)) throw new GameError("Choose an empty slot.");
            var allies = AllyChoices(p, def.Id);
            if (NeedsAlly(def.Id) && allies.Count == 0) throw new GameError(AllyEffectKind(def.Id) == "offer" ? "It needs an undimmed allied card with attack." : "It needs a card of yours that has grown.");
            if (allies.Count > 0 && !allies.Any(c => c.Uid == action.AllyUid)) throw new GameError("Choose a card of yours.");
            var host = fusing ? FusionHosts(p).FirstOrDefault(c => c.Uid == action.HostUid) : null;
            if (fusing && host == null) throw new GameError("Choose a card of yours in play to fuse it onto.");
            var recovers = RecoverChoices(p, def.Id);
            if (recovers.Count > 0 && !recovers.Any(c => c.Uid == action.RecoverUid)) throw new GameError("Choose a card in your reserves to recover.");

            var shifts = ShiftEffect(def.Id);
            var shifted = shifts == "rival" ? target?.Tableau.FirstOrDefault(c => c.Uid == action.EnemyUid) : shifts == "mine" ? p.Tableau.FirstOrDefault(c => c.Uid == action.AllyUid) : null;
            if (shifted != null && (action.ShiftTo == null || !ShiftSlots(shifted, shifts == "rival" ? target : p).Contains(action.ShiftTo.Value))) throw new GameError("Choose a slot to move it into.");

            if (action.AimUid != null && Aimable(def.Id) && !AimChoices(state, p).Cards.Any(c => c.Uid == action.AimUid)) throw new GameError("Pick a rival card or their sun");
            if (action.ChillUid != null && (!Chillable(def.Id) || !ChillChoices(state, p).Any(c => c.Uid == action.ChillUid))) throw new GameError("Pick a rival card with attack, or your sun");

            p.Hand = p.Hand.Where(c => c.Uid != card.Uid).ToList();
            card.Discount = null;
            int spend = def.SpendAll == true ? p.PlaysLeft : cost;
            if (def.SpendAll == true) card.Spent = spend;
            p.PlaysLeft -= spend;
            p.Turn.CardsPlayed += 1;
            Charge(state, p, "energy", spend);
            Charge(state, p, "plays");
            if (!asTrap && def.Kind == "attack") Charge(state, p, "playsAttack");
            if (!asTrap && def.Kind == "defence") Charge(state, p, "playsDefence");
            if (!asTrap && def.Kind == "growth") Charge(state, p, "playsGrowth");
            Log(state, asTrap ? $"{p.Name} sets a trap face down." : $"{p.Name} plays {def.Name}.");
            int harvest = Relics.N(p.Relics, "harvest");
            if (harvest != 0 && p.Turn.CardsPlayed == 3)
            {
                Log(state, $"{p.Name}'s {Relics.Of(p.Relics, "harvest").Name}: draw {harvest}.");
                DrawCards(state, p, harvest);
                if (state.WinnerId != null || p.Eliminated) return;
            }

            if (asTrap)
            {
                p.Lightspeed = card;
                return;
            }
            if (def.Kind == "global")
            {
                var old = ActiveGlobal(state);
                if (old != null)
                {
                    Log(state, $"{def.Name} replaces {Cards.Def(old.Card.DefId).Name}.");
                    LeaveTableau(state, old.Owner, old.Card);
                    if (state.WinnerId != null || p.Eliminated) return;
                }
            }
            if (def.Kind == "command")
            {
                var old = CommandCard(p);
                if (old != null)
                {
                    Log(state, $"{def.Name} replaces {Cards.Def(old.DefId).Name}.");
                    LeaveTableau(state, p, old);
                    if (state.WinnerId != null || p.Eliminated)
                    {
                        ToWreck(p, card);
                        return;
                    }
                }
                action = Copy(action);
                action.SlotIndex = CommandSlot;
            }
            if (swap)
            {
                var back = p.Tableau.FirstOrDefault(c => c.Uid == action.AllyUid);
                if (back != null)
                {
                    Log(state, $"{p.Name} returns {Cards.Def(back.DefId).Name} to their hand.");
                    var at = back.Slot;
                    LeaveTableau(state, p, back, "hand");
                    if (state.WinnerId != null || p.Eliminated)
                    {
                        ToWreck(p, card);
                        return;
                    }
                    action = Copy(action);
                    action.SlotIndex = at;
                }
            }
            if (host != null)
            {
                (host.Fused ??= new List<CardInstance>()).Add(card);
                Log(state, $"{p.Name} fuses {def.Name} onto {Cards.Def(host.DefId).Name}.");
                ResolveEffects(state, p, host, FusedDef(def.Id).OnPlay, "play", PlayContext.From(action));
                return;
            }
            if (Cards.IsBurst(def))
            {
                ResolveEffects(state, p, card, def.OnPlay, "play", PlayContext.From(action));
                if (!p.Discard.Contains(card) && !(p.Wreck?.Contains(card) ?? false)) ToWreck(p, card);
                return;
            }
            var open = FreeSlots(p);
            int? slot = def.Kind == "command" ? CommandSlot : action.SlotIndex != null && open.Contains(action.SlotIndex.Value) ? action.SlotIndex : SlotsBySafety().Where(i => open.Contains(i)).Select(i => (int?)i).FirstOrDefault();
            if (slot == null)
            {
                ToWreck(p, card);
                return;
            }
            Place(p, card, slot.Value);
            if (!Cards.HasDarkspeed(Cards.Def(card.DefId)) && !((p.Modifiers?.Darkspeed ?? 0) != 0 && (Cards.Def(card.DefId).Attack ?? 0) > 0)) card.Dimmed = card.Fresh = true;
            if (choices.Count > 0)
            {
                card.Choice = action.Choice;
                Log(state, $"{p.Name} chooses: {ChoiceLabel(action.Choice)}.");
            }
            ResolveEffects(state, p, card, def.OnPlay, "play", PlayContext.From(action));
            foreach (var b in (card.Boons ?? new List<string>()).ToList())
                if (state.WinnerId == null && !p.Eliminated && Cards.Def(b).OnPlay != null) ResolveEffects(state, p, card, Cards.Def(b).OnPlay, "play");
            int echo = Relics.N(p.Relics, "echo");
            if (echo != 0 && slot != CommandSlot && def.Token != true && def.Kind != "command" && p.Tableau.Contains(card) && state.WinnerId == null && Rng.Int(state, 100) < echo)
            {
                var heroes = EchoHeroes();
                var hero = heroes[Rng.Int(state, heroes.Count)];
                if (hero != null)
                {
                    card.EchoOf = card.DefId;
                    card.DefId = hero.Id;
                    card.Health = BaseHealth(hero.Id);
                    card.MaxHealth = null;
                    Log(state, $"{p.Name}'s {Relics.Of(p.Relics, "echo").Name}: {def.Name} stands as {hero.Name}.");
                }
            }
        }

        public static string ChoiceLabel(string id)
        {
            var m = System.Text.RegularExpressions.Regex.Match(id ?? "", "^([a-z]+)(\\d+)$");
            return m.Success ? $"{m.Groups[1].Value} {m.Groups[2].Value}" : id;
        }

        /// <summary>Apply an action and return the new state (the input is never changed).</summary>
        public static GameState Apply(GameState prev, Action action)
        {
            if (prev.WinnerId != null) throw new GameError("The game is over.");
            var state = Clone(prev);
            state.TurnPulses = null;
            state.Sprung = null;
            state.Struck = null;
            var p = ActivePlayer(state);
            if (state.Reaction != null && action.Type != "react" && action.Type != "concede") throw new GameError($"Waiting on {PlayerById(state, state.Reaction.PlayerId).Name}'s answer.");
            if (p.DawnChoices != null && p.DawnChoices.Count > 0 && action.Type != "dawnChoice" && action.Type != "concede") throw new GameError($"Your dawn {p.DawnChoices[0].Kind} comes first: choose a card, or let it be.");
            switch (action.Type)
            {
                case "react":
                    React(state, action);
                    break;
                case "dawnChoice":
                    DawnChoiceMade(state, p, action);
                    break;
                case "concede":
                {
                    var quitter = state.Players.FirstOrDefault(o => o.Id == action.PlayerId);
                    if (quitter == null || quitter.Eliminated) throw new GameError("That player is not in the game.");
                    quitter.Eliminated = true;
                    state.ConcededBy = quitter.Id;
                    state.Reaction = null;
                    Log(state, $"{quitter.Name} concedes.");
                    var alive = state.Players.Where(o => !o.Eliminated).ToList();
                    if (alive.Count == 1)
                    {
                        state.WinnerId = alive[0].Id;
                        Log(state, $"{alive[0].Name} wins the Blue Loop!");
                    }
                    else if (quitter == p) AdvanceTurn(state);
                    break;
                }
                case "playCard":
                    PlayCard(state, p, action);
                    if (p.Eliminated) PassOn(state);
                    break;
                case "setTarget":
                {
                    var t = state.Players.FirstOrDefault(o => o.Id == action.TargetId);
                    if (t == null || t.Eliminated || t.Id == p.Id) throw new GameError("Choose a living rival to target.");
                    p.TargetId = t.Id;
                    break;
                }
                case "endTurn":
                    if (action.DuskShift != null)
                    {
                        var relic = Relics.Of(p.Relics, "duskShift");
                        var moved = p.Tableau.FirstOrDefault(c => c.Uid == action.DuskShift.Uid && c.Slot != CommandSlot);
                        int to = action.DuskShift.To;
                        if (relic == null) throw new GameError("Only a Dusk Shift emblem moves a card as the day ends.");
                        if (moved == null || to == moved.Slot || to < 0 || to >= Balance.TableauSlots || SlotClosed(p, to)) throw new GameError("Move one of your cards (not your Hero) to another of your slots.");
                        Log(state, $"{p.Name}'s {relic.Name}: dusk shift.");
                        ResolveEffects(state, p, new CardInstance { Uid = $"relic:{relic.Name}", DefId = "circular_refraction" }, new List<Effect> { new Effect { Type = "shift" } }, "turn", new PlayContext { AllyUid = moved.Uid, ShiftTo = to });
                    }
                    state.TurnPulses = new List<TurnPulse>();
                    Dusk(state, p);
                    foreach (var c in p.Tableau) c.Frozen = null;
                    if (p.Eliminated)
                    {
                        PassOn(state);
                        break;
                    }
                    TrimHand(state, p, action.Discard);
                    p.Banked = Math.Max(0, p.PlaysLeft);
                    state.KeepPulses = true;
                    if (!SecondDawn(state, p)) AdvanceTurn(state);
                    break;
                case "attack":
                {
                    var why = AttackProblem(state, p, action.AttackerUid, action.TargetUid, true);
                    if (why != null) throw new GameError(why);
                    var events = new List<ReactEvent> { action.TargetUid != null ? new ReactEvent { On = "cardAttacked", AttackerUid = action.AttackerUid, MineUid = action.TargetUid } : new ReactEvent { On = "sunAttacked", AttackerUid = action.AttackerUid } };
                    if (state.NoReactions != true && OpenReaction(state, p, events, new PendingMove { Kind = "attack", AttackerUid = action.AttackerUid, TargetUid = action.TargetUid })) break;
                    Attack(state, p, p.Tableau.First(c => c.Uid == action.AttackerUid), action.TargetUid);
                    if (p.Eliminated) PassOn(state);
                    break;
                }
                case "heroAbility":
                {
                    int index = action.Index ?? 0;
                    var why = HeroAbilityProblem(state, p, index);
                    if (why != null) throw new GameError(why);
                    var hero = CommandCard(p);
                    var k = HeroAbilities(p, hero, true)[index];
                    p.PlaysLeft -= k.Cost ?? 0;
                    Charge(state, p, "energy", k.Cost ?? 0);
                    Charge(state, p, "abilities");
                    if ((k.Pay?.Stability ?? 0) != 0) hero.Health = (hero.Health ?? 0) - k.Pay.Stability.Value;
                    var chosen = action.SacrificeUid != null ? p.Tableau.FirstOrDefault(c => c.Uid == action.SacrificeUid && c.Slot != CommandSlot) : null;
                    if (action.SacrificeUid != null && chosen == null) throw new GameError("Sacrifice one of your own cards in play (not your Hero).");
                    var victim = k.Pay?.Sacrifice == true ? chosen ?? SacrificeOf(p) : null;
                    if (victim != null)
                    {
                        Log(state, $"{p.Name} sacrifices {Cards.Def(victim.DefId).Name}.");
                        Charge(state, p, "sacrifices");
                        LeaveTableau(state, p, victim);
                    }
                    if ((k.Pay?.SelfHeat ?? 0) != 0) ResolveEffects(state, p, hero, new List<Effect> { new Effect { Type = "selfHeat", Amount = k.Pay.SelfHeat } }, "play");
                    p.AbilityTurn = state.TurnNumber;
                    hero.Dimmed = true;
                    if (action.AimUid != null && !AimChoices(state, p).Cards.Any(c => c.Uid == action.AimUid)) throw new GameError("Pick a rival card or their sun");
                    Log(state, $"{p.Name}'s {Cards.Def(hero.DefId).Name}: {k.Name}.");
                    ResolveEffects(state, p, hero, k.Effects, "play", new PlayContext { AimUid = action.AimUid });
                    if (k.Choices != null && ChoiceOpen(state, p, k.Choices.Kind, k.Choices.Amount ?? 1))
                        for (int i = 0; i < k.Choices.Times; i++)
                            (p.DawnChoices ??= new List<DawnChoice>()).Add(new DawnChoice { Uid = $"relic:{k.Relic ?? k.Name}", Kind = k.Choices.Kind, Relic = k.Name, Amount = (k.Choices.Amount ?? 0) != 0 ? k.Choices.Amount : null });
                    if (p.Eliminated) PassOn(state);
                    break;
                }
                case "singularity":
                {
                    var why = SingularityProblem(state, p);
                    if (why != null) throw new GameError(why);
                    var hero = CommandCard(p);
                    var k = Singularities.Of(hero.DefId);
                    hero.Charge = 0;
                    Log(state, $"✦ {p.Name}'s {Cards.Def(hero.DefId).Name} unleashes {k.Name}!");
                    if (action.AimUid != null && !(TargetOf(state, p)?.Tableau.Any(c => c.Uid == action.AimUid) ?? false)) throw new GameError("Pick a rival card");
                    unleashing = p;
                    try
                    {
                        ResolveEffects(state, p, hero, k.Effects, "play", new PlayContext { AimUid = action.AimUid });
                    }
                    finally
                    {
                        unleashing = null;
                    }
                    if (p.Eliminated) PassOn(state);
                    break;
                }
                case "heroSkill":
                {
                    int index = action.Index ?? 0;
                    var why = HeroSkillProblem(state, p, index);
                    if (why != null) throw new GameError(why);
                    var k = p.Skills[index];
                    p.PlaysLeft -= k.Cost;
                    if (k.Once == true) k.Spent = true;
                    else k.UsedTurn = state.TurnNumber;
                    Log(state, k.Relic != null ? $"{p.Name} calls on the {k.Relic}." : $"{p.Name} calls on {Cards.Def(k.Hero).Name}: {k.Name}.");
                    ResolveEffects(state, p, new CardInstance { Uid = $"skill-{k.Id}", DefId = k.Hero }, k.Effects, "play");
                    bool could = k.Choices?.Kind == "shift" ? p.Tableau.Any(c => c.Slot != CommandSlot) : p.Tableau.Any(Returnable);
                    for (int i = 0; i < (k.Choices?.Times ?? 0); i++)
                        if (could) (p.DawnChoices ??= new List<DawnChoice>()).Add(new DawnChoice { Uid = $"relic:{k.Relic ?? k.Name}", Kind = k.Choices.Kind, Relic = k.Relic ?? k.Name });
                    if (p.Eliminated) PassOn(state);
                    break;
                }
                case "reclaim":
                {
                    int n = Relics.N(p.Relics, "reclaim");
                    int i = p.Discard.FindIndex(c => c.Uid == action.CardUid);
                    if (n == 0) throw new GameError("Only a Reclaim emblem takes cards back from your reserves.");
                    if (i < 0) throw new GameError("That card is not in your reserves.");
                    if (p.PlaysLeft < n) throw new GameError($"Taking a card back costs {n} energy.");
                    var card = p.Discard[i];
                    p.Discard.RemoveAt(i);
                    p.PlaysLeft -= n;
                    p.Hand.Add(card);
                    Log(state, $"{p.Name}'s {Relics.Of(p.Relics, "reclaim").Name} takes {Cards.Def(card.DefId).Name} back from the reserves.");
                    break;
                }
            }
            RechooseBossIntents(state);
            return state;
        }

        static void DawnChoiceMade(GameState state, PlayerState p, Action action)
        {
            if (p.DawnChoices == null || p.DawnChoices.Count == 0) throw new GameError("There is no dawn choice to make.");
            var next = p.DawnChoices[0];
            p.DawnChoices.RemoveAt(0);
            if (p.DawnChoices.Count == 0) p.DawnChoices = null;
            var source = p.Tableau.FirstOrDefault(c => c.Uid == next.Uid) ?? new CardInstance { Uid = next.Uid, DefId = "circular_refraction" };
            var name = next.Relic ?? Cards.Def(source.DefId).Name;
            if (next.Kind == "aim")
            {
                var rival = TargetOf(state, p);
                var victim = rival?.Tableau.FirstOrDefault(c => c.Uid == action.EnemyUid);
                if (rival == null) return;
                if (action.EnemyUid != null && victim == null) throw new GameError("Pick a rival card or their sun");
                int n = next.Amount ?? 0;
                if (victim != null)
                {
                    Log(state, $"{p.Name}'s {name} strikes {rival.Name}'s {Cards.Def(victim.DefId).Name} for {n}.");
                    NotePulse(state, p, null, "heat", rival, n, victim.Uid);
                    StrikeCard(state, rival, victim, n, p, false, "", false, true);
                }
                else
                {
                    NotePulse(state, p, null, "heat", rival, n);
                    ApplyHeat(state, rival, n, p, false, null, false, $"{p.Name}'s {name}");
                }
                if (p.Eliminated) PassOn(state);
                return;
            }
            if (next.Kind == "freeze" || next.Kind == "displace")
            {
                var rival = TargetOf(state, p);
                if (rival == null || action.EnemyUid == null)
                {
                    Log(state, $"{p.Name} lets {name} pass.");
                    return;
                }
                var victim = rival.Tableau.FirstOrDefault(c => c.Uid == action.EnemyUid && (next.Kind == "freeze" || c.Slot != CommandSlot));
                if (victim == null) throw new GameError("Choose a card in your rival's tableau.");
                if (next.Kind == "freeze")
                {
                    victim.Frozen = true;
                    Log(state, $"{p.Name}'s {name}: {rival.Name}'s {Cards.Def(victim.DefId).Name} is frozen.");
                    return;
                }
                var to = action.ShiftTo;
                if (to == null || to == victim.Slot || to < 0 || to >= Balance.TableauSlots || SlotClosed(rival, to.Value)) throw new GameError("Move it to another of your rival's slots.");
                Log(state, $"{p.Name}'s {name}: {rival.Name}'s {Cards.Def(victim.DefId).Name} is moved.");
                ResolveEffects(state, p, source, new List<Effect> { new Effect { Type = "shift", Enemy = true } }, "turn", new PlayContext { EnemyUid = victim.Uid, ShiftTo = to });
                return;
            }
            if (action.AllyUid == null)
            {
                Log(state, next.Kind == "recall" || next.Kind == "shift" ? $"{p.Name} lets {name}'s {(next.Relic != null && next.Kind == "recall" ? "" : "dawn ")}{next.Kind} pass." : $"{p.Name} lets {name} pass.");
                return;
            }
            if (next.Kind == "discount")
            {
                var held = p.Hand.FirstOrDefault(c => c.Uid == action.AllyUid);
                if (held == null) throw new GameError("Choose a card in your hand.");
                held.Discount = (held.Discount ?? 0) + (next.Amount ?? 1);
                Log(state, $"{p.Name}'s {name}: {Cards.Def(held.DefId).Name} costs {HandCost(held)} now.");
                return;
            }
            if (next.Kind == "empower" || next.Kind == "renew" || next.Kind == "ward")
            {
                var mine = p.Tableau.FirstOrDefault(c => c.Uid == action.AllyUid);
                if (mine == null) throw new GameError("Choose one of your cards in play.");
                int n = next.Amount ?? 1;
                if (next.Kind == "empower")
                {
                    if (!Overdrivable(mine, n)) throw new GameError($"Choose a card with more than {n} stability.");
                    mine.AttackBonus = (mine.AttackBonus ?? 0) + n;
                    mine.Health = (mine.Health ?? 0) - n;
                    Log(state, $"{p.Name}'s {name}: {Cards.Def(mine.DefId).Name} gains +{n} attack and loses {n} stability (stability {mine.Health}).");
                }
                else if (next.Kind == "ward")
                {
                    mine.Shields = (mine.Shields ?? 0) + n;
                    Log(state, $"{p.Name}'s {name}: {Cards.Def(mine.DefId).Name} gains {n} shields.");
                    NotePulse(state, p, null, "shield", p, n, mine.Uid);
                }
                else
                {
                    mine.Health = (mine.Health ?? 0) + n;
                    mine.MaxHealth = Math.Max(Math.Max(mine.MaxHealth ?? 0, BaseHealth(mine.DefId)), mine.Health.Value);
                    Log(state, $"{p.Name}'s {name}: {Cards.Def(mine.DefId).Name} gains {n} stability (stability {mine.Health}).");
                }
                return;
            }
            if (next.Kind == "recall")
            {
                var back = p.Tableau.FirstOrDefault(c => c.Uid == action.AllyUid && c.Uid != source.Uid && Returnable(c));
                if (back == null) throw new GameError("Return one of your other cards in play (not your Hero) to your hand.");
                ResolveEffects(state, p, source, new List<Effect> { new Effect { Type = "recall" } }, "turn", new PlayContext { AllyUid = back.Uid });
                return;
            }
            var moved = p.Tableau.FirstOrDefault(c => c.Uid == action.AllyUid && c.Slot != CommandSlot);
            var dest = action.ShiftTo;
            if (moved == null || dest == null || dest == moved.Slot || dest < 0 || dest >= Balance.TableauSlots || SlotClosed(p, dest.Value)) throw new GameError("Move one of your cards (not your Hero) to another of your slots.");
            Log(state, $"{p.Name}'s {name}: dawn shift.");
            ResolveEffects(state, p, source, new List<Effect> { new Effect { Type = "shift" } }, "turn", new PlayContext { AllyUid = moved.Uid, ShiftTo = dest });
        }

        /// <summary>
        /// Why a card can't attack this target now (null if it can). `aimed` false: whether it can attack at all
        /// (targetUid undefined); true: at targetUid (null, the rival's sun).
        /// </summary>
        public static string AttackProblem(GameState state, PlayerState p, string attackerUid, string targetUid, bool aimed)
        {
            var card = p.Tableau.FirstOrDefault(c => c.Uid == attackerUid);
            if (card == null) return "That card is not in play.";
            if (ActivePlayer(state).Id != p.Id) return "Not your day";
            if (CardAttack(state, p, card) <= 0) return "No attack";
            if (card.Dimmed == true) return "Dimmed until your next day";
            if (card.Frozen == true) return "Frozen today";
            var aims = AimChoices(state, p, true);
            if (!aimed) return null;
            if (targetUid == null && !aims.Sun && SurvivalDream(state)) return "Survive: their sun is off limits";
            if (targetUid == null) return aims.Sun ? null : TargetOf(state, p)?.Boss != null && Guards(TargetOf(state, p)).Count == 0 ? "Strike its body" : "Attack the Guard";
            return aims.Cards.Any(c => c.Uid == targetUid) ? null : aims.Sun ? "Pick a rival card or their sun" : "Attack the Guard";
        }

        static void Attack(GameState state, PlayerState p, CardInstance card, string targetUid)
        {
            p.Turn.Attacks = (p.Turn.Attacks ?? 0) + 1;
            Charge(state, p, "attacks");
            state.Struck = new Struck { AttackerUid = card.Uid, TargetUid = targetUid };
            Strike(state, p, card, targetUid);
            int flurry = Relics.N(p.Relics, "flurry");
            if (flurry != 0 && p.Turn.Attacks == 3 && state.WinnerId == null && !p.Eliminated) RelicAim(state, p, flurry, "flurry");
        }

        static void Strike(GameState state, PlayerState p, CardInstance card, string targetUid)
        {
            var rival = TargetOf(state, p);
            if (rival == null) return;
            int amount = CardAttack(state, p, card);
            var name = Cards.Def(card.DefId).Name;
            card.Dimmed = true;
            if (targetUid == null)
            {
                Log(state, $"{p.Name}'s {name} attacks {rival.Name}'s sun for {amount}.");
                ApplyHeat(state, rival, amount, p, false, card.Uid, false, $"{p.Name}'s {name}'s attack");
                int leech = Relics.N(p.Relics, "leech");
                if (leech != 0 && !p.Eliminated && state.WinnerId == null)
                {
                    Cool(state, p, leech, Relics.Of(p.Relics, "leech").Name);
                    NotePulse(state, p, null, "cool", p, leech);
                }
                return;
            }
            var victim = rival.Tableau.FirstOrDefault(c => c.Uid == targetUid);
            if (victim == null || state.WinnerId != null || p.Eliminated) return;
            int back = CounterDamage(state, rival, victim);
            Log(state, $"{p.Name}'s {name} attacks {rival.Name}'s {Cards.Def(victim.DefId).Name} for {amount}.");
            var beside = Relics.N(p.Relics, "splash") != 0 && victim.Slot != CommandSlot ? rival.Tableau.Where(c => c.Slot != CommandSlot && Math.Abs((c.Slot ?? -9) - (victim.Slot ?? -9)) == 1).ToList() : new List<CardInstance>();
            StrikeCard(state, rival, victim, amount, p, false, card.Uid);
            foreach (var c in beside)
            {
                if (state.WinnerId != null || !rival.Tableau.Contains(c)) continue;
                int n = Relics.N(p.Relics, "splash");
                Log(state, $"{p.Name}'s {Relics.Of(p.Relics, "splash").Name} splashes {Cards.Def(c.DefId).Name} for {n}.");
                NotePulse(state, p, null, "heat", rival, n, c.Uid);
                StrikeCard(state, rival, c, n, p, false, "", false, true);
            }
            if (back > 0 && p.Tableau.Contains(card))
            {
                int atk = CardAttack(state, rival, victim), sting = back - atk;
                int own = Math.Max(0, CardSturdy(card));
                int absorbed = Math.Min(Math.Min(Math.Max(0, atk), own), CardDefence(p, card));
                if (absorbed > 0) card.Dented = (card.Dented ?? 0) + absorbed;
                card.Health = Math.Max(0, (card.Health ?? 0) - (back - absorbed));
                var from = string.Join(" and ", new[] { atk > 0 ? $"its attack {atk}" : "", sting > 0 ? $"Sting {sting}" : "" }.Where(s => s != ""));
                Log(state, $"{Cards.Def(victim.DefId).Name} hits back for {from}: {name} takes {back}{(absorbed != 0 ? $" ({absorbed} on its own defence)" : "")} (health {card.Health}).");
                if (card.Health <= 0)
                {
                    Log(state, $"{p.Name}'s {name} burns away.");
                    LeaveTableau(state, p, card);
                }
            }
        }

        public static string HeroAbilityProblem(GameState state, PlayerState p, int index)
        {
            var hero = CommandCard(p);
            var list = hero != null ? HeroAbilities(p, hero, true) : null;
            var k = list != null && index >= 0 && index < list.Count ? list[index] : null;
            if (hero == null || k == null) return "No Hero leads your tableau.";
            if (k.Choices != null && !ChoiceOpen(state, p, k.Choices.Kind, k.Choices.Amount ?? 1)) return $"{k.Name} has nothing to choose.";
            if (ActivePlayer(state).Id != p.Id) return "Not your day";
            if (hero.Dimmed == true) return p.AbilityTurn == state.TurnNumber ? "Used today" : "Dimmed until your next day";
            if ((k.Cost ?? 0) > p.PlaysLeft) return "Not enough energy";
            if ((k.Pay?.Stability ?? 0) != 0 && (hero.Health ?? 0) <= k.Pay.Stability) return "Not enough stability";
            if (k.Pay?.Sacrifice == true && SacrificeOf(p) == null) return "Nothing to sacrifice";
            if ((k.Pay?.SelfHeat ?? 0) != 0 && p.Heat + k.Pay.SelfHeat >= SupernovaThreshold(p)) return "Your sun would burn out";
            return null;
        }

        public static string HeroSkillProblem(GameState state, PlayerState p, int index)
        {
            var k = p.Skills != null && index >= 0 && index < p.Skills.Count ? p.Skills[index] : null;
            if (k == null) return "No such skill.";
            if (ActivePlayer(state).Id != p.Id) return "Not your day";
            if (k.Spent == true) return "Used this battle";
            if (k.Once != true && k.UsedTurn == state.TurnNumber) return "Used today";
            if (k.Cost > p.PlaysLeft) return "Not enough energy";
            return null;
        }
    }
}
