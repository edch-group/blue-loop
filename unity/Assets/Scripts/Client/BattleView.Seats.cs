using System.Linq;
using BlueLoop.Engine;
using UnityEngine;

/// <summary>
/// Who the table is seen by (app.ts viewer, syncViewer, shownRival, needsHandoff): the view follows the human whose day
/// it is (two of you at one screen take turns at it; against the AI it stays yours; the AI against itself is watched
/// from whoever's day it is). At a hot seat, the hand is hidden between turns until the next player says they have the
/// screen ("pass to …", reveal hand).
/// </summary>
public partial class BattleView
{
    /// <summary>A new game's view: nobody followed yet, no hand revealed, no rival chosen (app.ts begin).</summary>
    void ResetViewer()
    {
        viewerId = null;
        revealedFor = null;
        viewRivalId = null;
    }

    /// <summary>
    /// app.ts syncViewer and viewer(): offline, a human's day brings the view to them; otherwise it stays with the most
    /// recent human, or the first, or (no human) is whoever's day it is. The board seen from there, the shown rival
    /// across it.
    /// </summary>
    void SyncViewer()
    {
        if (state == null || Board == null) return;
        if (!online && !Autoplay)
        {
            var active = Game.ActivePlayer(state);
            if (!active.IsAI) viewerId = active.Id;
            you = (state.Players.FirstOrDefault(p => p.Id == viewerId) ?? state.Players.FirstOrDefault(p => !p.IsAI) ?? active).Id;
        }
        Board.Reseat(you);
        Board.RivalId = Rival.Id;
    }

    /// <summary>Hot seat: hide the hand until the next human confirms they have the device (app.ts needsHandoff).</summary>
    bool NeedsHandoff()
    {
        if (online || state == null) return false;
        var p = Game.ActivePlayer(state);
        return !p.IsAI && state.Players.Count(x => !x.IsAI) > 1 && revealedFor != p.Id && state.WinnerId == null;
    }

    RectTransform handoff;
    string handoffFor;

    /// <summary>
    /// app.ts renderDock and renderOverlay at a hot seat: the hand hidden ("hand hidden" in its place, styles.css
    /// .hand-hidden: 0.6rem display capitals, spaced 0.3em, faint ink, centred in the hand), and over everything a sheet
    /// "pass to …" whose one row reveals the hand.
    /// </summary>
    void Handoff()
    {
        bool need = NeedsHandoff();
        string forId = need ? Game.ActivePlayer(state).Id : null;
        if (forId != handoffFor || (need && handoff == null))
        {
            if (handoff != null) Mats.Kill(handoff.gameObject);
            handoff = null;
            handoffFor = forId;
            // (No way out but revealing: the veil closes nothing.)
            if (need) handoff = Hud.Sheet(Layer, $"pass to {Game.ActivePlayer(state).Name.ToLowerInvariant()}", new[] { new Hud.Row("reveal hand", Reveal, null, true) }, () => { }, false);
        }
        if (handoff != null) handoff.SetAsLastSibling();
        if (chrome == null) return;
        var old = chrome.Find("Hand hidden");
        if (old != null) Mats.Kill(old.gameObject);
        if (!need) return;
        var l = BoardLayout.Current;
        var box = Hud.Rect(chrome, "Hand hidden");
        Hud.Place(box, l.HandLeft, l.HandTop, l.HandW, l.HandBottom - l.HandTop);
        var t = Hud.Label(box, "HAND HIDDEN", 9.6f, Look.InkFaint, true, 400, 30);
        t.raycastTarget = false;
    }

    /// <summary>
    /// app.ts 'reveal': the hand shown to the player whose day it is, dealt in from their deck, and their day announced.
    /// </summary>
    void Reveal()
    {
        if (state == null || !NeedsHandoff()) return;
        revealedFor = Game.ActivePlayer(state).Id;
        // (The hand can't be raised while it is being dealt: app.ts dealOpening.)
        Board.HandUp = false;
        Board.HandHover = null;
        Board.Redeal(state, this);
        Refresh();
        AnnounceTurn(0);
    }
}
