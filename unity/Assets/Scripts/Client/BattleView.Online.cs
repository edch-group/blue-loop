using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// An online battle (app.ts onRemoteState): the room (Online) makes the moves. Yours go to it instead of being played
/// here (Do), and each new state it sends is shown with the sounds of the move that made it. The rival's card just
/// played waits on the board until you have read it (OK), as the room asks; while they read yours, you wait.
/// </summary>
public partial class BattleView
{
    /// <summary>Played online: moves go to the room, which sends back each new state.</summary>
    bool online;
    /// <summary>A move sent, its answer not yet back (so a second tap doesn't send it twice).</summary>
    float sentAt = -10;
    RectTransform onlineLayer;
    Coroutine autoAck;
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

    /// <summary>The room's new state: shown, with the sounds of the move that made it (a reconnect's resend just shown).</summary>
    public void TakeRemote(GameState next, Online.LastMove last)
    {
        var prev = state;
        sentAt = -10;
        bool unchanged = prev == null || last == null || (prev.Log.LastOrDefault()?.Seq ?? 0) == (next.Log.LastOrDefault()?.Seq ?? 0);
        state = next;
        bool turnPassed = !unchanged && Game.ActivePlayer(prev).Id != Game.ActivePlayer(next).Id;
        if (!unchanged)
        {
            try { Hear(prev, next, last.Action); }
            catch (System.Exception e) { Debug.LogException(e); }
            // (Skip all lasts the rival's day: as yours begins, it is back to auto.)
            if (turnPassed && confirmMode == "skip" && Game.ActivePlayer(next).Id == you) confirmMode = "auto";
        }
        dawnPick = null;
        discarding = null;
        Clear();
        // (A new day isn't under way until its dawn has played out: dusk, the dawn's banner, then the day.)
        if (turnPassed) Phase = "dawn";
        Refresh();
        if (turnPassed && Application.isPlaying)
        {
            var actor = prev.Players.FirstOrDefault(p => p.Id == last.ActorId) ?? Game.ActivePlayer(prev);
            AnnouncePhases(next, DayTimeline(next, actor));
        }
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
        RivalCard();
        if (over) GameOver();
    }

    /// <summary>The card your rival just played, to read before they carry on (the room waits on you): OK lets them.</summary>
    void RivalCard()
    {
        if (Online.WaitFor != "you" || state.WinnerId != null) return;
        // (The pill set to auto or skip: shown a moment, then read for you; a card set face down needs no reading, and
        // goes by itself after a moment: app.ts stageEntrance.)
        if ((AutoConfirms || Online.LastPlayed == null) && autoAck == null) autoAck = StartCoroutine(AckLater(Online.LastPlayed == null ? 1.1f : AutoConfirm));
        var veil = Hud.Rect(onlineLayer, "Rival card");
        Hud.Fill(veil);
        veil.gameObject.AddComponent<Image>().color = new Color(0.95f, 0.95f, 0.94f, 0.55f);
        var rival = Rival;
        var face = Hud.Rect(veil, "Face");
        Hud.At(face, new Vector2(0.5f, 0.5f), new Vector2(0, 50), new Vector2(300, 420));
        var raw = face.gameObject.AddComponent<RawImage>();
        raw.raycastTarget = false;
        var played = Online.LastPlayed;
        raw.texture = played != null ? Faces.Of(played, false) : Resources.Load<Texture2D>("Board/back");
        var caption = played == null ? $"{rival.Name} sets a card face down" : $"{rival.Name} plays {Cards.Def(played).Name}";
        var t = Hud.Label(veil, caption.ToUpperInvariant(), 18, Look.Ink, true, 500, 14);
        t.rectTransform.anchorMin = new Vector2(0, 0.5f);
        t.rectTransform.anchorMax = new Vector2(1, 0.5f);
        t.rectTransform.sizeDelta = new Vector2(0, 40);
        t.rectTransform.anchoredPosition = new Vector2(0, -190);
        var ok = Hud.Pill(veil, "OK", () =>
        {
            Online.Ack();
            OnlineChanged();
        }, 18, Look.Ink, Color.white);
        Hud.At((RectTransform)ok.transform, new Vector2(0.5f, 0.5f), new Vector2(0, -250), new Vector2(180, 56));
    }

    System.Collections.IEnumerator AckLater(float after)
    {
        yield return new WaitForSeconds(after);
        autoAck = null;
        if (online && Online.WaitFor == "you") Online.Ack();
        OnlineChanged();
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
