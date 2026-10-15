using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// What the board reads of the choosing to mark its cards, slots and suns (app.ts renderTableau, renderCard): what heat
/// being aimed would leave of each card it could hit, the card a staged card is aimed at, a sun that can be chosen, a
/// card in hand too costly or made cheaper, a side out of the game, and the marks a campaign's rooms and boons set.
/// </summary>
public partial class BattleView
{
    object previewFor;
    readonly Dictionary<string, (int def, int hp)> previews = new Dictionary<string, (int, int)>();

    /// <summary>
    /// app.ts renderTableau's preview: an attack, a card's heat or a Hero's ability being aimed, what it would leave of a
    /// rival card it could hit (its defence and stability), worked out by making the move on a copy of the game (with the
    /// rival's face-down card left out, so the preview gives nothing away). None: nothing aimed at it, or it can't be told.
    /// </summary>
    public (int def, int hp)? Preview(string uid)
    {
        var st = state;
        var p = pending;
        if (st == null || st.WinnerId != null || (attacker == null && p?.Step != "aim")) return null;
        var key = (st, attacker, p, p?.Step, p?.Slot, p?.Choice, p?.EnemyUid, p?.AllyUid, p?.RecoverUid, p?.ShiftTo, p?.HostUid, p?.SacrificeUid, p?.Ability);
        if (!Equals(previewFor, key))
        {
            previewFor = key;
            previews.Clear();
            var me = Game.ActivePlayer(st);
            var rival = st.Players.FirstOrDefault(x => x.Id != me.Id);
            EngineAction Move(string aim) =>
                attacker != null ? new EngineAction { Type = "attack", AttackerUid = attacker, TargetUid = aim }
                : p.Ability == SingAim ? new EngineAction { Type = "singularity", AimUid = aim }
                : p.Ability != null ? new EngineAction { Type = "heroAbility", Index = p.Ability, AimUid = aim, SacrificeUid = p.SacrificeUid }
                : new EngineAction { Type = "playCard", CardUid = p.Uid, Choice = p.Choice, EnemyUid = p.EnemyUid, AllyUid = p.AllyUid, RecoverUid = p.RecoverUid, SlotIndex = p.Slot, ShiftTo = p.ShiftTo, AimUid = aim, HostUid = p.HostUid };
            foreach (var c in Game.AimChoices(st, me, attacker != null).Cards)
            {
                try
                {
                    var g = Game.Clone(st);
                    foreach (var pl in g.Players) if (pl.Id != me.Id) pl.Lightspeed = null;
                    var after = Game.Apply(g, Move(c.Uid));
                    var owner = after.Players.FirstOrDefault(x => x.Tableau.Any(t => t.Uid == c.Uid) || x.Id == rival?.Id);
                    var left = owner?.Tableau.FirstOrDefault(x => x.Uid == c.Uid);
                    previews[c.Uid] = left != null ? (Game.CardDefence(owner, left), left.Health ?? 0) : (0, 0);
                }
                catch (System.Exception)
                {
                    // (A preview that can't be worked out is simply not shown.)
                }
            }
        }
        return previews.TryGetValue(uid, out var v) ? v : ((int, int)?)null;
    }

    /// <summary>A card in play that can be chosen now (.card-choosable): its preview shows while the pointer is on it.</summary>
    public bool Choosable(PlayerState owner, CardInstance c) => state != null && state.WinnerId == null && owner.Tableau.Contains(c) && CardAct(owner, c, false).look == "choosable";

    /// <summary>What a staged card waiting to be read is aimed at (.card-targeted: a ring round that card's edge).</summary>
    public string StageTarget => stage != null && stage.Confirm ? stage.Target : null;

    /// <summary>A sun that can be chosen now (.vitals-choosable): theirs aimed at, or yours cooled.</summary>
    public bool SunChoosable(string playerId) => state != null && state.WinnerId == null && !Autoplay && SunAct(playerId).act != null;

    /// <summary>
    /// On your day, a card in hand that costs more energy than you have left (.card-pricey), unless it is picked or
    /// otherwise chosen, or the day's end is being chosen for.
    /// </summary>
    public bool Pricey(PlayerState owner, CardInstance c)
    {
        if (state == null || state.WinnerId != null || discarding != null || !owner.Hand.Contains(c)) return false;
        var me = Game.ActivePlayer(state);
        return MyDay && me.Id == you && owner.Id == you && CardAct(owner, c, true).look == null && Game.HandCost(c, me) > me.PlaysLeft;
    }

    /// <summary>
    /// A card in hand made cheaper (.card-discount): all its cost, with a Zero-Point Core in play (the player whose day it
    /// is); else a Bargain's. 0: none.
    /// </summary>
    public int Discount(CardInstance c)
    {
        var me = state != null ? Game.ActivePlayer(state) : null;
        if (me != null && Game.HasPower(me, "freeCards") && Game.CardCost(c.DefId) > 0) return Game.CardCost(c.DefId);
        return c.Discount ?? 0;
    }

    /// <summary>A side out of the game (.tableau-dead), once its sun's explosion has played out (app.ts shownDead).</summary>
    public bool ShownDead(PlayerState p) => p.Eliminated && !(dyingUntil.TryGetValue(p.Id, out var until) && until > Time.time);

    /// <summary>
    /// app.ts roomMarks and boonMarks: a campaign ship's room's guns on the card standing in it (or, `module`, on its
    /// empty slot with the room's module's boons), and a card's own boons, one mark a kind (their amounts summed).
    /// Each a mark's name and amount.
    /// </summary>
    public List<(string kind, int n)> RoomMarks(PlayerState p, int slot, bool module, List<string> boons = null)
    {
        var o = new List<(string, int)>();
        var r = p.Rooms;
        if (r != null && slot >= 0)
        {
            int guns = r.Attack != null && slot < r.Attack.Count ? r.Attack[slot] : 0;
            if (guns > 0) o.Add(("guns", guns));
            if (module && r.Boons != null && slot < r.Boons.Count && r.Boons[slot] != null) o.AddRange(BoonMarks(r.Boons[slot]));
        }
        if (boons != null) o.AddRange(BoonMarks(boons));
        return o;
    }

    static IEnumerable<(string, int)> BoonMarks(List<string> boons)
    {
        foreach (var g in boons.GroupBy(b => b))
        {
            var kind = System.Text.RegularExpressions.Regex.Replace(g.Key.StartsWith("boon_") ? g.Key.Substring(5) : g.Key, @"_\d+$", "");
            var m = System.Text.RegularExpressions.Regex.Match(g.Key, @"_(\d+)$");
            yield return (MarkOf(kind), (m.Success ? int.Parse(m.Groups[1].Value) : 0) * g.Count());
        }
    }
}
