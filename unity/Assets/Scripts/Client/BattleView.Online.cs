using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// An online battle (app.ts onRemoteState): the room (Online) makes the moves. Yours go to it instead of being played
/// here (Do), and each new state it sends is shown with the sounds of the move that made it. The rival's card just
/// played waits on the stage until you have read it (OK), as the room asks, and lands then; while they read yours, you
/// wait.
/// </summary>
public partial class BattleView
{
    /// <summary>Played online: moves go to the room, which sends back each new state.</summary>
    bool online;
    /// <summary>A move sent, its answer not yet back (so a second tap doesn't send it twice).</summary>
    float sentAt = -10;
    RectTransform onlineLayer;
    const string AutoConfirmKey = "blue-loop:auto-confirm";

    /// <summary>An online game, as the room sent it, seen as `viewer` (your player's id in it).</summary>
    public void LoadOnline(GameState s, string viewer)
    {
        online = true;
        you = viewer;
        Load(s);
        OnlineChanged();
    }

    /// <summary>
    /// You can't act now: your rival is still reading the card you played, the connection is down, or your last move's
    /// answer is on its way.
    /// </summary>
    bool OnlineHeld => online && (Online.WaitFor == "rival" || Online.Status != "open" || Time.time - sentAt < 3);

    /// <summary>A move of yours, sent to the room.</summary>
    void Send(EngineAction a)
    {
        if (OnlineHeld) return;
        sentAt = Time.time;
        Online.Act(a);
    }

    /// <summary>
    /// The room's new state (app.ts onRemoteState): shown as the move that made it plays out. The rival's card waits on
    /// the stage (flown in from their row, aimed at its target) until you have read it and said OK, and only lands then,
    /// with its sounds; your own hangs there until your rival has read it. A reconnect's resend is just shown (a card
    /// still waiting to be read, shown again).
    /// </summary>
    public void TakeRemote(GameState next, Online.LastMove last)
    {
        // (A move still waiting to be read lands first.)
        if (landing != null) FlushLanding();
        var prev = state;
        sentAt = -10;
        bool unchanged = prev == null || last == null || (prev.Log.LastOrDefault()?.Seq ?? 0) == (next.Log.LastOrDefault()?.Seq ?? 0);
        if (unchanged)
        {
            state = next;
            if (Online.WaitFor == "you" && stage == null && last?.Action?.Type == "playCard") stage = RemoteStage(last, next);
            if (Online.WaitFor != "you" && stage != null && stage.Confirm) stage = null;
            if (stage != null && stage.Shown == 0) stage.Shown = Time.time;
            Clear();
            Refresh();
            return;
        }
        var actor = prev.Players.FirstOrDefault(p => p.Id == last.ActorId) ?? Game.ActivePlayer(prev);
        bool turnPassed = Game.ActivePlayer(prev).Id != Game.ActivePlayer(next).Id;
        dawnPick = null;
        discarding = null;
        stage = null;
        if (actor.Id != you && last.Action.Type == "playCard") stage = RemoteStage(last, next);
        else if (actor.Id == you) stage = OwnStage(actor, last.Action);
        var sprung = Sprung(next);
        if (sprung != null) stage = sprung;
        if (stage != null) stage.Shown = Time.time;
        void Land()
        {
            // (Once the move lands, a card with nothing left to read leaves the stage (your own for the board, from where
            // it hung); one that sprang stays its moment.)
            if (stage != null && stage.Own && stage.Uid != null && stageCardRect != null) Board.PutAtPage(stage.Uid, stageCardRect.Value);
            if (stage != null && (stage.Own || (!stage.Confirm && stage != sprung))) stage = null;
            if (last.Action.Type != "setTarget") StarSpin.Burst();
            state = next;
            // (A new day isn't under way until its dawn has played out: dusk, the dawn's banner, then the day.)
            if (turnPassed) Phase = "dawn";
            // (Skip all lasts the rival's day: as yours begins, it is back to auto.)
            if (turnPassed && confirmMode == "skip" && Game.ActivePlayer(next).Id == you) confirmMode = "auto";
            try
            {
                Hear(prev, next, last.Action);
                if (Application.isPlaying && !Autoplay) Arcs(prev, next, last.Action, actor);
            }
            catch (System.Exception e) { Debug.LogException(e); }
            Clear();
            Refresh();
            if (turnPassed && Application.isPlaying) AnnouncePhases(next, DayTimeline(next, actor));
        }
        // The rival's card takes effect once you have read it and said OK (app.ts stageEntrance: it sounds as it comes).
        if (stage != null && stage.Confirm && next.WinnerId == null)
        {
            landing = Land;
            Sound.Play("play");
            entranceHeard = true;
            Clear();
            Refresh();
            return;
        }
        // Your own card hangs on the stage until your rival has read it (app.ts holdOwn: StageTick lets it go).
        if (stage != null && stage.Own)
        {
            landing = Land;
            landingSince = Time.time;
            Clear();
            Refresh();
            return;
        }
        Land();
    }

    /// <summary>The rival's card just played, online, on the stage: to read and confirm, if the room waits on you (app.ts remoteStage).</summary>
    StageInfo RemoteStage(Online.LastMove last, GameState s)
    {
        var actor = s.Players.FirstOrDefault(p => p.Id == last.ActorId);
        if (actor == null) return null;
        bool confirm = Online.WaitFor == "you";
        if (last.FaceDown == true) return new StageInfo { DefId = "null_field", ActorId = actor.Id, FaceDown = true, Caption = $"{actor.Name.ToLowerInvariant()} sets a card face down", Confirm = confirm };
        if (last.Played != null) return new StageInfo { DefId = last.Played, ActorId = actor.Id, Confirm = confirm, Option = last.Action?.Type == "playCard" ? last.Action.Choice : null, Target = last.Action?.Type == "playCard" ? last.Action.EnemyUid : null };
        return null;
    }

    /// <summary>The room said no (or something else went wrong): said on the board.</summary>
    public void SayOnline(string message)
    {
        sentAt = -10;
        Say(message);
    }

    /// <summary>The session changed (connection, rival, who waits on whom, the result's reward): its part of the screen redrawn.</summary>
    public void OnlineChanged()
    {
        if (!online || hud == null) return;
        if (onlineLayer == null)
        {
            onlineLayer = Hud.Rect(Layer, "Online");
            Hud.Fill(onlineLayer);
        }
        foreach (Transform c in onlineLayer) Mats.Kill(c.gameObject);
        if (state == null) return;
        bool over = state.WinnerId != null;
        // The connection, and the rival's: a word at the top (connection lost: tap to retry).
        string word = Online.Status == "connecting" ? "reconnecting…" : Online.Status == "lost" ? "connection lost · retry" : !Online.RivalOnline && !over ? "rival disconnected · waiting" : Online.WaitFor == "rival" && !over ? "waiting for rival" : null;
        if (word != null)
        {
            var pill = Online.Status == "lost" ? Hud.Pill(onlineLayer, word, Online.Retry, 14) : null;
            var r = pill != null ? (RectTransform)pill.transform : (RectTransform)Hud.Glass(onlineLayer, "Net", Look.GlassStrong).transform;
            Hud.At(r, new Vector2(0.5f, 1), new Vector2(0, -16), new Vector2(Mathf.Max(220, 26 + word.Length * 13), 44));
            if (pill == null) Hud.Label(r, word.ToUpperInvariant(), 14, Look.InkSoft, true, 500, 14);
        }
        if (over) GameOver();
    }

    /// <summary>Under an online game's result: what it earned, then play again (the same rival) or another ranked match, or the menu.</summary>
    void OnlineEnd(string title, int tone, string why, bool conceded)
    {
        var buttons = Online.Ranked
            ? new[] { new ResultAction("find another match", () => { Online.Leave(); var m = App.Instance?.Menu("online"); Online.FindRanked(() => m?.Show("signin")); }, true), new ResultAction("return to menu", Online.ToMenu, false) }
            : conceded
                ? new[] { new ResultAction("return to menu", Online.ToMenu, true) }
                : new[] { new ResultAction("play again", Online.Rematch, true), new ResultAction("return to menu", Online.ToMenu, false) };
        ResultCard(title, tone, why, Online.ResultExtra, buttons, buttons.Length > 1);
    }

    /// <summary>Quitting an online game loses it: concede and leave, or keep playing.</summary>
    void OnlineQuit()
    {
        sheet = Hud.Sheet(Layer, "quit game", new[]
        {
            new Hud.Row("concede and leave", () => { CloseSheet(); Online.ConcedeAndLeave(you); }, null, true),
            new Hud.Row("keep playing", CloseSheet),
        }, CloseSheet);
    }
}
