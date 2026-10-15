using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// Playing a card as the web plays it (app.ts Pending, startPlay, advancePlay, onClick): a card picked from your hand
/// asks for each choice it needs in turn (where it goes, or set face down as a trap; the card of yours it consumes or
/// replaces; the card it recalls or fuses onto; its option; the rival card it removes; the card of yours it works on;
/// where a card it moves goes; what it recovers; where its heat goes; the card it chills), and is played once it has
/// them all. Nothing is chosen for you. A Hero's ability is paid for and aimed the same way. Every tap on the board is
/// what the web's element under it would do (its data-act): CardAct, SlotAct and SunAct say what that is.
/// </summary>
public partial class BattleView
{
    /// <summary>A card being played (or a Hero's ability), and the choices made for it so far (app.ts Pending).</summary>
    class Pending
    {
        public string Uid;
        /// <summary>choice, enemy, ally, recover, aim, slot, host, shift, sacrifice, chill.</summary>
        public string Step;
        public string SacrificeUid, HostUid, AimUid, ChillUid, Choice, EnemyUid, AllyUid, RecoverUid;
        /// <summary>Your Hero's ability being paid for or aimed (Uid is the Hero): which one (SingAim: its singularity).</summary>
        public int? Ability;
        public int? Slot, ShiftTo;
        public bool FaceDown;
        /// <summary>Where it was dropped, dragged out of the hand: what that answers is taken as chosen.</summary>
        public Drop? Drop;
    }

    /// <summary>A pending aim that is the Hero's singularity's (not one of its abilities): app.ts SING_AIM.</summary>
    const int SingAim = -1;

    Pending pending;

    /// <summary>The card picked from your hand, waiting for its choices (not a Hero's ability being aimed).</summary>
    string picked => pending != null && pending.Ability == null ? pending.Uid : null;

    /// <summary>The trap slot's tag (SlotTag.Slot): your Lightspeed slot, right of your row.</summary>
    public const int TrapSlot = -2;

    /// <summary>Clicks are ignored until then (just after the stage's OK, so a tap can't land on the board beneath it).</summary>
    float clickShieldUntil;

    /// <summary>Whether it is day (not dawn's or dusk's effects still playing out): app.ts phase === 'day'.</summary>
    bool DayNow => Phase == "day" && Time.time >= dayFrom;

    /// <summary>app.ts dayUnderWay: cards are played by day; while a dawn or dusk plays out, only Lightspeed cards can be.</summary>
    bool DayUnderWay(string defId) => DayNow || Game.IsLightspeed(defId);

    bool DawnShiftWaiting => Dawn?.Kind == "shift";

    // ---- What each thing on the board does when tapped (its data-act and data-arg) ----

    /// <summary>
    /// What a card does when tapped (app.ts renderCard's attrs), and how it looks for it (its state: card-choosable,
    /// card-picked, card-attacker, card-aiming, or nothing).
    /// </summary>
    (string act, string arg, string look) CardAct(PlayerState owner, CardInstance c, bool hand)
    {
        string act = "inspect", arg = null, look = null;
        var s = state;
        var p = pending;
        var me = Game.ActivePlayer(s);
        bool canAct = MyDay;
        if (hand)
        {
            // (While one card waits to be placed, tapping another plays that one instead.)
            if (canAct || touch) { act = "play"; arg = c.Uid; }
            // Discarding at the day's end: tapping a card marks it to go (again, to keep it).
            if (discarding != null) { act = "discard-pick"; arg = c.Uid; }
            // A Bargain waiting: the card in hand to make cheaper.
            if (Dawn?.Kind == "discount") { act = "dawn-ally"; arg = c.Uid; }
            if (p != null && c.Uid == p.Uid) look = "picked";
            if (Dawn?.Kind == "discount") look = "choosable";
            return (act, arg, look);
        }
        bool rivalSide = owner.Id != you, mineSide = owner.Id == you;
        var pendingDef = p != null ? me.Hand.FirstOrDefault(h => h.Uid == p.Uid)?.DefId : null;
        if (p != null && pendingDef != null && rivalSide && p.Step == "enemy" && Game.EnemyChoices(s, me, pendingDef, p.AimUid != "sun" ? p.AimUid : null).Any(x => x.Uid == c.Uid))
        { act = "choose-enemy"; arg = c.Uid; look = "choosable"; }
        if (p?.Step == "chill" && rivalSide && Game.ChillChoices(s, me).Any(x => x.Uid == c.Uid))
        { act = "choose-chill"; arg = c.Uid; look = "choosable"; }
        if (p?.Step == "aim" && rivalSide && Game.AimChoices(s, me).Cards.Any(x => x.Uid == c.Uid))
        { act = "choose-aim"; arg = c.Uid; look = "choosable"; }
        // (An attack being aimed, a card of yours readied: a rival card it can strike.)
        if (attacker != null && rivalSide && Game.AttackProblem(s, Me, attacker, c.Uid, true) == null)
        { act = "choose-aim"; arg = c.Uid; look = "choosable"; }
        // On your day, your cards with attack that have not acted yet: tap one, then what it attacks.
        if (p == null && canAct && mineSide && me.Id == you && c.Dimmed != true && Game.CardAttack(s, me, c) > 0)
        { act = "attack-start"; arg = c.Uid; look = "attacker"; }
        // Your Hero, with abilities, on your day: tap it for its abilities (and its attack) to pick from.
        if (p == null && attacker == null && canAct && mineSide && me.Id == you && c.Slot == Game.CommandSlot
            && ((c.Dimmed != true && Game.HeroAbilities(me, c, true).Count > 0) || Game.SingularityProblem(s, me) == null))
        { act = "hero-panel"; arg = c.Uid; look = "attacker"; }
        if ((attacker != null || p?.Ability != null) && mineSide && c.Uid == (attacker ?? p.Uid)) look = "aiming";
        // Paying for a card's Consume or a Hero's ability with a sacrifice: any other card of yours in play can be given up.
        if (p?.Step == "sacrifice" && mineSide && c.Slot != null && c.Slot != Game.CommandSlot && c.Uid != p.Uid)
        { act = "choose-sacrifice"; arg = c.Uid; look = "choosable"; }
        // Placing a recall card: the card it recalls can make way for it.
        if (p != null && pendingDef != null && mineSide && p.Step == "slot" && p.AllyUid == c.Uid && Game.AllyEffectKind(pendingDef) == "recall" && c.Slot != null)
        { act = "choose-slot"; arg = c.Slot.ToString(); look = "choosable"; }
        if (p != null && mineSide && p.Step == "ally") { act = "choose-ally"; arg = c.Uid; look = "choosable"; }
        // Shifting: the card chosen stands out; the others of its tableau (not its Hero) are where it can swap to.
        if (p?.Step == "shift" && pendingDef != null && (Game.ShiftEffect(pendingDef) == "mine") == mineSide)
        {
            var moved = Game.ShiftEffect(pendingDef) == "mine" ? p.AllyUid : p.EnemyUid;
            if (c.Uid == moved) look = "picked";
            else if (c.Slot != null && c.Slot != Game.CommandSlot) { act = "choose-shift"; arg = c.Slot.ToString(); look = "choosable"; }
            else act = null;
        }
        // Your dawn Recall: any other card of yours (not your Hero) back to hand.
        var d = Dawn;
        if (d?.Kind == "recall" && mineSide && c.Uid != d.Uid && c.Slot != null && c.Slot != Game.CommandSlot)
        { act = "dawn-recall"; arg = c.Uid; look = "choosable"; }
        // A relic's heat at any target: any rival card (or, from the middle of the board, their sun).
        if (d?.Kind == "aim" && rivalSide) { act = "dawn-aim"; arg = c.Uid; look = "choosable"; }
        // An emblem's ability: a card of yours to empower, steady or ward (your Hero too); a rival card to freeze, or to move.
        if ((d?.Kind == "empower" || d?.Kind == "renew" || d?.Kind == "ward") && mineSide && c.Slot != null && (d.Kind != "empower" || Game.Overdrivable(c, d.Amount ?? 1)))
        { act = "dawn-ally"; arg = c.Uid; look = "choosable"; }
        if (d?.Kind == "freeze" && rivalSide) { act = "dawn-aim"; arg = c.Uid; look = "choosable"; }
        // A Displace (a rival card), or your dawn Shift (a card of yours, not your Hero): a card to move, then a card
        // to swap with (or an empty slot).
        if (((d?.Kind == "displace" && rivalSide) || (DawnShiftWaiting && mineSide)) && c.Slot != null && c.Slot != Game.CommandSlot)
        {
            if (dawnPick == null) { act = "dawn-shift-card"; arg = c.Uid; look = "choosable"; }
            else if (c.Uid == dawnPick) { act = "dawn-shift-back"; arg = null; look = "picked"; }
            else { act = "dawn-shift-to"; arg = c.Slot.ToString(); look = "choosable"; }
        }
        if (p != null && mineSide && (p.Step == "host" || (p.Step == "slot" && pendingDef != null && Cards.Def(pendingDef).Fusion == true)) && Game.FusionHosts(owner).Any(h => h.Uid == c.Uid))
        { act = "choose-host"; arg = c.Uid; look = "choosable"; }
        return (act, arg, look);
    }

    /// <summary>A card, by its uid, wherever it is: its owner, itself, and whether it is in a hand.</summary>
    (PlayerState owner, CardInstance card, bool hand) Find(string uid)
    {
        foreach (var p in state.Players)
        {
            var t = p.Tableau.FirstOrDefault(c => c.Uid == uid);
            if (t != null) return (p, t, false);
            var h = p.Hand.FirstOrDefault(c => c.Uid == uid);
            if (h != null) return (p, h, true);
        }
        return (null, null, false);
    }

    /// <summary>
    /// What an empty place does when tapped (app.ts renderTableau): a slot to move a card to, a slot to place the card
    /// picked in, or (yours) the Lightspeed slot to set it face down as a trap.
    /// </summary>
    (string act, string arg) SlotAct(bool mine, int slot)
    {
        if (state == null) return (null, null);
        if (slot == TrapSlot) return mine && TrapChoosable ? ("choose-slot", "ls") : (null, null);
        var word = SlotWord(mine, slot);
        if (word == null) return (null, null);
        if (dawnPick != null && (mine ? DawnShiftWaiting : Dawn?.Kind == "displace")) return ("dawn-shift-to", slot.ToString());
        return (word == "move here" ? "choose-shift" : "choose-slot", slot.ToString());
    }

    /// <summary>
    /// An empty slot open to what is being chosen (button.slot-choosable), and the word under its defence: "move here"
    /// (a card being moved: a dawn Shift, a Displace, a Shift card's) or "here" (the card picked, placed); null if not.
    /// </summary>
    public string SlotWord(bool mine, int slot)
    {
        if (state == null || slot < 0 || state.WinnerId != null) return null;
        var owner = mine ? state.Players.FirstOrDefault(p => p.Id == you) : Rival;
        if (owner == null || owner.Tableau.Any(c => c.Slot == slot) || Game.SlotClosed(owner, slot)) return null;
        // (A rival card being moved by a Displace: their slots are where it may go.)
        if (dawnPick != null && (mine ? DawnShiftWaiting : Dawn?.Kind == "displace")) return "move here";
        var p = pending;
        if (p?.Step == "shift")
        {
            var def = Game.ActivePlayer(state).Hand.FirstOrDefault(h => h.Uid == p.Uid)?.DefId;
            if (def != null && (Game.ShiftEffect(def) == "mine") == mine) return "move here";
        }
        // (The slot the card being played will take, once chosen, is only marked: not open to it again.)
        if (mine && p?.Step == "slot" && p.Slot != slot) return "here";
        return null;
    }

    /// <summary>Your Lightspeed slot open to the card picked: set it face down as a trap, for 1 more energy ("trap +1").</summary>
    public bool TrapChoosable
    {
        get
        {
            var p = pending;
            if (state == null || p?.Step != "slot" || p.Ability != null) return false;
            var me = state.Players.FirstOrDefault(x => x.Id == you);
            var card = Game.ActivePlayer(state).Hand.FirstOrDefault(h => h.Uid == p.Uid);
            return me != null && me.Lightspeed == null && card != null && Game.CanSetFaceDown(me, card.DefId);
        }
    }

    /// <summary>
    /// What a sun does when tapped (.vitals' data-act): their sun, aimed at (heat, an attack, a relic's heat); your own,
    /// cooled (a cooling card's other way).
    /// </summary>
    (string act, string arg) SunAct(string playerId)
    {
        var st = state;
        var me = Game.ActivePlayer(st);
        var p = pending;
        if (playerId != you)
        {
            var owner = st.Players.FirstOrDefault(x => x.Id == playerId);
            if (p?.Step == "aim" && Game.AimChoices(st, me).Sun) return ("choose-aim", "sun");
            if (attacker != null && Game.AimChoices(st, me, true).Sun) return ("choose-aim", "sun");
            if (Dawn?.Kind == "aim" && owner?.Boss == null) return ("dawn-aim-sun", null);
            return (null, null);
        }
        if (p?.Step == "chill") return ("choose-chill", "sun");
        return (null, null);
    }

    // ---- A tap ----

    /// <summary>
    /// A tap on something (app.ts onClick): a card being played puts itself back at a tap on anything that isn't its next
    /// step (a slot, the card it recalls or fuses onto, its target), another card in hand, or cancel.
    /// </summary>
    void Click(string act, string arg)
    {
        if ((pending != null || attacker != null) && act != "play" && act != "cancel" && act != "attack-start" && (act == null || !act.StartsWith("choose-")))
        {
            pending = null;
            attacker = null;
            Refresh();
            return;
        }
        Act(act, arg);
    }

    /// <summary>What a tapped thing does (app.ts onClick's switch, for the board's acts).</summary>
    void Act(string act, string arg)
    {
        if (act == null || act == "inspect" || state == null) return;
        if (act == "cancel")
        {
            pending = null;
            attacker = null;
            discarding = null;
            Refresh();
            return;
        }
        if (!MyDay) return;
        // A move of yours still landing lands first: what it sets off (a relic's aim) comes before anything else.
        if (landing != null && (stage == null || !stage.Confirm)) FlushLanding();
        // Dawn and dusk play out by themselves: until it is day, only their own choices (a dawn recall, shift or aim)
        // and Lightspeed cards (a card from hand is refused by StartPlay unless it is one).
        if (!DayNow && !act.StartsWith("dawn-") && act != "play" && pending == null)
        {
            Sound.Play("blocked");
            return;
        }
        // A choice owed (a relic's aim, a dawn recall or shift): nothing else until it is made.
        if (Dawn != null && !act.StartsWith("dawn-"))
        {
            pending = null;
            attacker = null;
            if (heroPanel != null) heroPanel.gameObject.SetActive(false);
            Sound.Play("blocked");
            Refresh();
            return;
        }
        var p = pending;
        switch (act)
        {
            case "play":
                CloseSheet();
                StartPlay(arg);
                return;
            case "discard-pick":
            {
                if (discarding == null) return;
                int over = Over;
                if (discarding.Contains(arg)) discarding.Remove(arg);
                else
                {
                    discarding.Add(arg);
                    while (discarding.Count > over) discarding.RemoveAt(0);
                }
                Sound.Play("rustle");
                Refresh();
                return;
            }
            case "hero-panel":
                ShowHero();
                Sound.Play("hover");
                return;
            case "attack-start":
            {
                if (heroPanel != null) heroPanel.gameObject.SetActive(false);
                // On your day, a card of yours with attack that has not acted yet: choose what it attacks.
                if (attacker == arg) { attacker = null; Refresh(); return; }
                var why = Game.AttackProblem(state, Me, arg, null, false);
                if (why != null) { Say(why); return; }
                pending = null;
                attacker = arg;
                Sound.Play("hover");
                Refresh();
                return;
            }
            case "choose-option":
                if (p != null) p.Choice = arg;
                Advance();
                return;
            case "choose-enemy":
                if (p != null) p.EnemyUid = arg;
                Advance();
                return;
            case "choose-chill":
                if (p == null) return;
                p.ChillUid = arg;
                Advance();
                return;
            case "choose-aim":
            {
                if (attacker != null)
                {
                    var a = attacker;
                    attacker = null;
                    var target = arg == "sun" ? null : arg;
                    var why = Game.AttackProblem(state, Me, a, target, true);
                    if (why != null) { Say(why); Refresh(); return; }
                    Do(new EngineAction { Type = "attack", AttackerUid = a, TargetUid = target });
                    return;
                }
                if (p == null) return;
                if (p.Ability != null)
                {
                    pending = null;
                    Sound.Play("hero");
                    // (−1: the Hero's singularity, aimed.)
                    if (p.Ability == SingAim) { Do(new EngineAction { Type = "singularity", AimUid = arg == "sun" ? null : arg }); return; }
                    Do(new EngineAction { Type = "heroAbility", Index = p.Ability, AimUid = arg == "sun" ? null : arg, SacrificeUid = p.SacrificeUid });
                    return;
                }
                p.AimUid = arg;
                Advance();
                return;
            }
            case "choose-sacrifice":
            {
                if (p == null) return;
                p.SacrificeUid = arg;
                // (A Consume card being played: on to its next choice.)
                if (p.Ability == null) { Advance(); return; }
                // Then aim it, if it heats and there are rival cards to aim at; else it is used at once.
                var hero = Game.CommandCard(Me);
                if (hero != null && Game.AbilityAimable(hero.DefId, p.Ability.Value) && Game.AimChoices(state, Me).Cards.Count > 0)
                {
                    p.Step = "aim";
                    Sound.Play("hover");
                    Refresh();
                    return;
                }
                pending = null;
                Sound.Play("hero");
                Do(new EngineAction { Type = "heroAbility", Index = p.Ability, SacrificeUid = arg });
                return;
            }
            case "choose-ally":
                if (p != null) p.AllyUid = arg;
                Advance();
                return;
            case "choose-shift":
                if (p != null) p.ShiftTo = int.Parse(arg);
                Advance();
                return;
            case "choose-host":
                if (p != null) p.HostUid = arg;
                Advance();
                return;
            case "choose-recover":
                if (p != null) p.RecoverUid = arg;
                Advance();
                return;
            case "choose-slot":
                if (p != null)
                {
                    if (arg == "ls") p.FaceDown = true;
                    else p.Slot = int.Parse(arg);
                }
                Advance();
                return;
            case "dawn-shift-card":
                dawnPick = arg;
                Refresh();
                return;
            case "dawn-shift-back":
                dawnPick = null;
                Refresh();
                return;
            case "dawn-shift-to":
            {
                var uid = dawnPick;
                dawnPick = null;
                if (uid != null && Dawn?.Kind == "displace") { Do(new EngineAction { Type = "dawnChoice", EnemyUid = uid, ShiftTo = int.Parse(arg) }); return; }
                if (uid != null) Do(new EngineAction { Type = "dawnChoice", AllyUid = uid, ShiftTo = int.Parse(arg) });
                return;
            }
            case "dawn-aim":
                Do(new EngineAction { Type = "dawnChoice", EnemyUid = arg });
                return;
            case "dawn-aim-sun":
                Do(new EngineAction { Type = "dawnChoice" });
                return;
            case "dawn-recall":
            case "dawn-ally":
                dawnPick = null;
                Do(new EngineAction { Type = "dawnChoice", AllyUid = arg });
                return;
            case "dawn-shift-skip":
                dawnPick = null;
                Do(new EngineAction { Type = "dawnChoice" });
                return;
        }
    }

    // ---- Playing a card: collect any choices it needs, then play it ----

    /// <summary>A card from your hand picked to be played (app.ts startPlay): refused, with a shake and a thud, if it can't be.</summary>
    void StartPlay(string uid, Drop? drop = null)
    {
        var me = Game.ActivePlayer(state);
        var card = me.Hand.FirstOrDefault(c => c.Uid == uid);
        if (card != null && !DayUnderWay(card.DefId)) return;
        // (The hand drops back down once a card is picked from it.)
        RaiseHand(false, null);
        // Tapping the card that is waiting to be placed puts it back.
        if (pending?.Uid == uid)
        {
            pending = null;
            Refresh();
            return;
        }
        if (card == null) return;
        // (A card that costs 0 can still be played with no energy left.)
        // (A card that can't be played now shakes its head, with the blocker's thud.)
        void Refuse()
        {
            Sound.Play("blocked");
            Board.View(uid)?.Refuse();
        }
        if (Game.HandCost(card, me) > me.PlaysLeft && !Game.CanSetFaceDown(me, card.DefId))
        {
            Say("Not enough energy");
            Refuse();
            return;
        }
        if (Cards.Def(card.DefId).Kind == "trap" && !Game.CanSetTrap(me))
        {
            Say("One trap at a time");
            Refuse();
            return;
        }
        var noRoom = Game.RoomProblem(me, card.DefId);
        if (noRoom != null && !Game.CanSetFaceDown(me, card.DefId))
        {
            Say(noRoom);
            Refuse();
            return;
        }
        attacker = null;
        pending = new Pending { Uid = uid, Step = "choice", Drop = drop, AimUid = drop?.Aim };
        Advance();
    }

    /// <summary>Ask for the next choice the pending card needs, or play it once it has them all (app.ts advancePlay).</summary>
    void Advance()
    {
        var p = pending;
        if (p == null || state == null) return;
        var s = state;
        var me = Game.ActivePlayer(s);
        var card = me.Hand.FirstOrDefault(c => c.Uid == p.Uid);
        if (card == null)
        {
            pending = null;
            Refresh();
            return;
        }
        var defId = card.DefId;
        var def = Cards.Def(defId);
        void Ask(string step)
        {
            p.Step = step;
            Refresh();
        }
        // A Lightspeed guard: set face down (its Lightspeed slot was chosen), or played as a Guard. It is placed like
        // any card, with the Lightspeed slot open too (or only that, if it can't be played as a Guard).
        // (Dragged onto your tableau: what the drop answers is taken as chosen.)
        var drop = p.Drop;
        var dropped = drop?.Uid != null ? me.Tableau.FirstOrDefault(c => c.Uid == drop.Value.Uid) : null;
        int? dropSlot = drop?.Slot ?? dropped?.Slot;
        if (drop?.Trap == true && Game.CanSetFaceDown(me, defId)) p.FaceDown = true;
        if (p.FaceDown) { Do(new EngineAction { Type = "playCard", CardUid = p.Uid, FaceDown = true }); return; }
        var free = Game.FreeSlots(me);
        if (dropSlot != null && p.Slot == null && free.Contains(dropSlot.Value)) p.Slot = dropSlot;
        if (Game.CanSetFaceDown(me, defId) && p.Slot == null) { Ask("slot"); return; }
        // A Consume card: first the card of yours it gives up (with no slot free, it takes that card's).
        // (Into a full tableau, any card first picks the card of yours it replaces, and takes its slot.)
        bool fusion = def.Fusion == true;
        bool consume = def.Consume == true;
        bool replacing = !p.FaceDown && !(fusion && Game.FusionHosts(me).Count > 0) && Game.Replaces(me, defId);
        if ((consume || replacing) && p.SacrificeUid == null) { Ask("sacrifice"); return; }
        if ((consume || replacing) && p.Slot == null && free.Count == 0) p.Slot = me.Tableau.FirstOrDefault(c => c.Uid == p.SacrificeUid)?.Slot;
        // First the card is placed, so what it does next is seen from where it will stand: a recall card first picks
        // the card it recalls (it may take its place), a Fusion card the card it fuses onto, and any other card its
        // slot. Even the last open slot is tapped to confirm (a mistapped card is never played outright).
        bool recall = Game.AllyEffectKind(defId) == "recall";
        // (A recall card dropped on a card it can recall recalls that one, and takes its place.)
        if (recall && dropped != null && p.AllyUid == null && Game.AllyChoices(me, defId).Any(c => c.Uid == dropped.Uid))
        {
            p.AllyUid = dropped.Uid;
            if (p.Slot == null && dropped.Slot != null) p.Slot = dropped.Slot;
        }
        if (recall && Game.AllyChoices(me, defId).Count > 0 && p.AllyUid == null) { Ask("ally"); return; }
        // A Fusion card is placed like any card, or fused onto a card in play: both are offered at once.
        var hosts = Game.FusionHosts(me);
        if (fusion && dropped != null && p.HostUid == null && p.Slot == null && hosts.Any(c => c.Uid == dropped.Uid)) p.HostUid = dropped.Uid;
        if (fusion && p.HostUid == null && p.Slot == null && (hosts.Count > 0 || free.Count > 0)) { Ask("slot"); return; }
        bool replaces = recall && p.AllyUid != null;
        if (Game.InSlots(defId) && p.HostUid == null && (free.Count > 0 || replaces) && p.Slot == null) { Ask("slot"); return; }
        // Then its abilities: an option, a rival card to remove, an ally, a card to recover, where its heat goes.
        if (Game.CardChoices(defId).Count > 0 && p.Choice == null) { Ask("choice"); return; }
        // (Offering and Rootbreak: first the card of yours they draw on, then the rival card.)
        var allyKind = Game.AllyEffectKind(defId);
        bool drawsOn = allyKind == "offer" || allyKind == "rootbreak";
        if (drawsOn && Game.AllyChoices(me, defId).Count > 0 && p.AllyUid == null) { Ask("ally"); return; }
        // (A card whose heat comes first (Void Bolt): where its heat goes, then the rival card it removes.)
        bool aimFirst = Game.HeatFirst(defId) && Game.Aimable(defId) && Game.AimChoices(s, me).Cards.Count > 0;
        if (aimFirst && p.AimUid == null) { Ask("aim"); return; }
        if (Game.EnemyChoices(s, me, defId, p.AimUid != "sun" ? p.AimUid : null).Count > 0 && p.EnemyUid == null)
        {
            // (Its target's tableau brought onto the table to choose from.)
            var target = Game.TargetOf(s, me);
            if (target != null) viewRivalId = target.Id;
            Ask("enemy");
            return;
        }
        if (Game.AllyChoices(me, defId).Count > 0 && p.AllyUid == null) { Ask("ally"); return; }
        // Shift: then the slot the card chosen moves into (in its own tableau).
        if (Game.ShiftEffect(defId) != null && (p.EnemyUid != null || p.AllyUid != null) && p.ShiftTo == null) { Ask("shift"); return; }
        if (Game.RecoverChoices(me, defId).Count > 0 && p.RecoverUid == null) { Ask("recover"); return; }
        // A card that heats, with rival cards on the table: where its heat goes (a card, or their sun).
        if (Game.Aimable(defId) && Game.AimChoices(s, me).Cards.Count > 0 && p.AimUid == null) { Ask("aim"); return; }
        // A card that cools, with a rival card that could attack: chill that card instead, or cool your sun.
        if (Game.Chillable(defId) && Game.ChillChoices(s, me).Count > 0 && p.ChillUid == null) { Ask("chill"); return; }
        Do(new EngineAction
        {
            Type = "playCard",
            CardUid = p.Uid,
            Choice = p.Choice,
            EnemyUid = p.EnemyUid,
            AllyUid = p.AllyUid,
            RecoverUid = p.RecoverUid,
            SlotIndex = p.Slot,
            ShiftTo = p.ShiftTo,
            AimUid = p.AimUid != null && p.AimUid != "sun" ? p.AimUid : null,
            ChillUid = p.ChillUid != null && p.ChillUid != "sun" ? p.ChillUid : null,
            HostUid = p.HostUid,
            SacrificeUid = p.SacrificeUid,
        });
    }

    // ---- What the board waits on you for, said in its middle ----

    /// <summary>
    /// The mid-board hint while a card or an attack waits on a choice (app.ts renderMidHint's last part): what to do,
    /// with "cancel" under it. Null when there is nothing to say (an option or a card to recover is asked in a view of
    /// its own).
    /// </summary>
    string PendingAsk()
    {
        var s = state;
        var me = Game.ActivePlayer(s);
        var p = pending;
        // (No sun to strike: a Guard stands, or, in a survival dream, their sun is off limits and any card will do.)
        if (attacker != null)
        {
            var a = me.Tableau.FirstOrDefault(c => c.Uid == attacker);
            if (a == null) return null;
            bool guarded = !Game.AimChoices(s, me, true).Sun && !Game.SurvivalDream(s);
            return guarded ? "attack a guard" : $"attack with {Cards.Def(a.DefId).Name.ToLowerInvariant()}";
        }
        if (p == null || p.Step == "choice" || p.Step == "recover") return null;
        var card = me.Hand.FirstOrDefault(c => c.Uid == p.Uid) ?? (p.Ability != null ? me.Tableau.FirstOrDefault(c => c.Uid == p.Uid) : null);
        if (card == null) return null;
        switch (p.Step)
        {
            case "aim": return "aim heat";
            case "chill": return "chill or cool";
            case "sacrifice": return p.Ability != null ? "sacrifice a card" : Cards.Def(card.DefId).Consume == true ? "consume a card" : "replace a card";
            case "enemy":
                switch (Game.EnemyEffectKind(card.DefId) ?? "destroy")
                {
                    case "bounce": return "return a card";
                    case "erode": return "erode a card";
                    case "shift": return "move a card";
                    case "offer": return "strike a card";
                    case "steal": return "take a card";
                    case "rootbreak": return "split a card";
                    default: return "destroy a card";
                }
            case "ally":
                switch (Game.AllyEffectKind(card.DefId) ?? "restore")
                {
                    case "recall": return "recall a card";
                    case "empower": return "choose a card";
                    case "offer": return "offer a card’s attack";
                    case "rootbreak": return "choose a grown card";
                    case "shift": return "choose a card";
                    default: return "restore a card";
                }
            case "host": return "fuse onto a card";
            case "shift": return "choose where it moves";
            case "slot": return Cards.Def(card.DefId).Fusion == true && Game.FusionHosts(me).Count > 0 ? "place it, or fuse it onto a card" : "place it";
        }
        return null;
    }

    // ---- The choices asked in a view of their own: an option, a card to recover ----

    RectTransform choiceView;
    string choiceKey;

    /// <summary>
    /// app.ts renderOverlay's pending part: a card's option (.overlay.overlay-inspect .choice-view: "choose one", the card
    /// magnified, cancel), or a card to recover from your discard pile (renderRecoverChoice: .overlay.overlay-soft over a
    /// .modal.modal-wide, its title the card's name · "choose a card to recover", the cards to pick from, cancel).
    /// </summary>
    void ShowChoice()
    {
        var p = pending;
        var card = p != null && p.Ability == null && state != null ? Me.Hand.FirstOrDefault(c => c.Uid == p.Uid) : null;
        string step = card != null && (p.Step == "recover" || p.Step == "choice") && MyDay ? p.Step : null;
        var l = BoardLayout.Current;
        string key = step != null ? $"{step}|{card.Uid}|{l.W}x{l.H}" : null;
        if (key == choiceKey) return;
        choiceKey = key;
        if (choiceView != null) Destroy(choiceView.gameObject);
        choiceView = null;
        if (key == null) return;
        choiceView = Hud.Rect(hud.transform, "Choice");
        Hud.Fill(choiceView);
        choiceView.SetAsLastSibling();
        // (The overlay: a tap on it, outside what it shows, cancels.)
        var veil = choiceView.gameObject.AddComponent<Image>();
        veil.color = step == "choice" ? new Color(246 / 255f, 246 / 255f, 244 / 255f, 0.8f) : new Color(244 / 255f, 244 / 255f, 242 / 255f, 0.45f);
        var vb = choiceView.gameObject.AddComponent<Button>();
        vb.transition = Selectable.Transition.None;
        vb.onClick.AddListener(() => Act("cancel", null));
        if (step == "recover") RecoverChoice(card, l);
        else OptionChoice(card, l);
    }

    void RecoverChoice(CardInstance card, BoardLayout l)
    {
        var choices = Game.RecoverChoices(Me, card.DefId).AsEnumerable().Reverse().ToList();
        // (.choose-grid .card: 107 × 150, on a phone 90 × 126; .pile-grid: wrapped, 10 apart, centred, 4 down.)
        float cw = l.Phone ? 90 : 107, chh = cw * 1.4f, gap = 10;
        float pv = Css.Clamp(10, 3 * l.Vh, 22), ph = Css.Clamp(14, 3 * l.Vw, 28);
        // (.modal.modal-wide: as wide as its cards in a row, at least min(620px, 94vw), at most min(900px, 94vw).)
        float natural = choices.Count * cw + Mathf.Max(0, choices.Count - 1) * gap + 2 * ph + 2;
        float w = Mathf.Clamp(natural, Mathf.Min(620, 0.94f * l.W), Mathf.Min(900, 0.94f * l.W));
        float inner = w - 2 - 2 * ph;
        int perRow = Mathf.Max(1, Mathf.FloorToInt((inner + gap) / (cw + gap)));
        int rows = Mathf.CeilToInt(choices.Count / (float)perRow);
        float gridH = 4 + rows * chh + Mathf.Max(0, rows - 1) * gap;
        float titleH = 14 + MenuKit.LineH(11.2f) + 10, cancelH = 11 * 2 + MenuKit.LineH(8.96f) + 1;
        float most = 0.94f * l.H;
        float bodyH = Mathf.Min(pv * 2 + gridH, most - 2 - titleH - cancelH);
        float h = 2 + titleH + bodyH + cancelH;
        var modal = Hud.Box(choiceView, "Modal", Color.white, 18);
        Hud.Place(modal.rectTransform, (l.W - w) / 2, (l.H - h) / 2, w, h);
        Hud.Shadow(modal, 18, new Hud.Drop(Hud.Rgba(120, 124, 134, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(80, 80, 100, 0.18f), 30, 80), new Hud.Drop(Hud.Rgba(80, 80, 100, 0.08f), 6, 18));
        modal.raycastTarget = true;
        modal.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        // (.bar-title: 11.2, spaced 0.28em, padded 14 44 10.)
        string title = $"{Cards.Def(card.DefId).Name.ToLowerInvariant()} · choose a card to recover";
        MenuKit.Words(modal.transform, title.ToUpperInvariant(), 1 + 44, 1 + 14, w - 2 - 88, MenuKit.LineH(11.2f), 11.2f, Look.Ink, true, 500, 0.28f);
        // The cards, each lit to be chosen (.card-choosable).
        var body = MenuKit.Scroller(modal.transform, "Body", 1, 1 + titleH, w - 2, bodyH, pv * 2 + gridH);
        for (int i = 0; i < choices.Count; i++)
        {
            int row = i / perRow, col = i % perRow;
            int inRow = Mathf.Min(perRow, choices.Count - row * perRow);
            float rowW = inRow * cw + (inRow - 1) * gap;
            float x = (w - 2 - rowW) / 2 + col * (cw + gap), y = pv + 4 + row * (chh + gap);
            var c = choices[i];
            // (Its coral ring under its white one: 0 0 0 2px #fff, 0 0 0 4px rgba(208, 101, 75, .55).)
            var ring = Hud.Rect(body, "Ring");
            Hud.Place(ring, x - 4, y - 4, cw + 8, chh + 8);
            var ri = ring.gameObject.AddComponent<Image>();
            ri.sprite = Hud.Rounded;
            ri.type = Image.Type.Sliced;
            ri.color = Hud.Rgba(208, 101, 75, 0.55f);
            ri.raycastTarget = false;
            Corners(ri, cw * 0.08f + 4);
            var face = Hud.Rect(body, "Card");
            Hud.Place(face, x, y, cw, chh);
            var img = face.gameObject.AddComponent<RawImage>();
            img.texture = Faces.Of(c.DefId, Faces.Look.Card, cw);
            WebLook.Shadow(img, 6, 18, Hud.Rgba(80, 84, 100, 0.16f), cw * 0.08f, 2, Color.white);
            Printed(face, c.DefId, cw, true);
            var b = face.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            var uid = c.Uid;
            b.onClick.AddListener(() => Act("choose-recover", uid));
        }
        // (.modal-cancel: the whole width, 11 padded, 0.56rem spaced 0.24em, soft ink, a hairline over it.)
        var cancel = Hud.Rect(modal.transform, "Cancel");
        Hud.Place(cancel, 1, h - 1 - cancelH, w - 2, cancelH);
        var ci = cancel.gameObject.AddComponent<Image>();
        ci.color = new Color(1, 1, 1, 0.001f);
        var line = Hud.Rect(cancel, "Line");
        Hud.Place(line, 0, 0, w - 2, 1);
        var li = line.gameObject.AddComponent<Image>();
        li.color = Hud.Rgba(120, 124, 134, 0.12f);
        li.raycastTarget = false;
        MenuKit.Words(cancel, "CANCEL", 0, 1 + 11, w - 2, MenuKit.LineH(8.96f), 8.96f, Look.InkSoft, true, 400, 0.24f);
        var cb = cancel.gameObject.AddComponent<Button>();
        cb.transition = Selectable.Transition.None;
        cb.onClick.AddListener(() => { Sound.Play("click"); Act("cancel", null); });
    }

    /// <summary>
    /// A card's option (.choice-view: "choose one" in a white pill, the card magnified at min(300px, 60vh), cancel; 14
    /// apart). (No card in the game has options now, the Heroes' choice of dawn effect having become their abilities:
    /// each option is a pill under the card.)
    /// </summary>
    void OptionChoice(CardInstance card, BoardLayout l)
    {
        var ids = Game.CardChoices(card.DefId);
        float pw = Mathf.Min(300, 60 * l.Vh), ch = pw * 1.4f;
        float hintH = MenuKit.LineH(9.92f) + 12, btnH = MenuKit.LineH(10.56f) + 18 + 2, optH = btnH;
        float h = hintH + 14 + ch + 14 + ids.Count * (optH + 6) + btnH;
        float top = (l.H - h) / 2, y = top;
        float hw = Hud.Wide("CHOOSE ONE", 9.92f, 400, 20, 16) + 2;
        var hint = Hud.Box(choiceView, "Hint", Color.white, hintH / 2);
        Hud.Place(hint.rectTransform, (l.W - hw) / 2, y, hw, hintH);
        Hud.Shadow(hint, hintH / 2, new Hud.Drop(Hud.Rgba(90, 90, 110, 0.12f), 2, 10));
        Hud.Label(hint.transform, "CHOOSE ONE", 9.92f, Look.InkSoft, true, 400, 20);
        y += hintH + 14;
        var face = Hud.Rect(choiceView, "Card");
        Hud.Place(face, (l.W - pw) / 2, y, pw, ch);
        var img = face.gameObject.AddComponent<RawImage>();
        img.texture = Faces.Of(card.DefId, false);
        img.raycastTarget = false;
        WebLook.Shadow(img, 26, 60, new Color(70 / 255f, 70 / 255f, 90 / 255f, 0.3f), pw * 0.08f, 2, Color.white);
        y += ch + 14;
        foreach (var id in ids)
        {
            var opt = id;
            float ow = Hud.Wide(id.ToUpperInvariant(), 10.56f, 600, 14, 16) + 2;
            var b = Hud.Btn(choiceView, id, () => Act("choose-option", opt), 10.56f, 10);
            Hud.Place((RectTransform)b.transform, (l.W - ow) / 2, y, ow, optH);
            y += optH + 6;
        }
        float cw = Hud.Wide("CANCEL", 10.56f, 500, 14, 16) + 2;
        var cancel = Hud.Btn(choiceView, "cancel", () => Act("cancel", null), 10.56f, 10);
        Hud.Place((RectTransform)cancel.transform, (l.W - cw) / 2, y, cw, btnH);
    }
}
