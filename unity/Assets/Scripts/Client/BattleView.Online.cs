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
        if (!unchanged)
        {
            try { Hear(prev, next, last.Action); }
            catch (System.Exception e) { Debug.LogException(e); }
        }
        dawnPick = null;
        discarding = null;
        Clear();
        Refresh();
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
        // (Kept on, the auto-confirm setting reads it for you after a moment.)
        if (Store.Get(AutoConfirmKey) == "1")
        {
            if (autoAck == null) autoAck = StartCoroutine(AckLater());
            return;
        }
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

    System.Collections.IEnumerator AckLater()
    {
        yield return new WaitForSeconds(1.2f);
        autoAck = null;
        if (online && Online.WaitFor == "you") Online.Ack();
        OnlineChanged();
    }

    /// <summary>Under an online game's result: what it earned, then play again (the same rival) or another ranked match, or the menu.</summary>
    void OnlineEnd(Transform card, bool conceded)
    {
        overPanel.sizeDelta = new Vector2(600, 290);
        if (!string.IsNullOrEmpty(Online.ResultExtra))
        {
            var r = Hud.Label(card, Online.ResultExtra, 16, Look.Ink, false, 500, 0, TextAlignmentOptions.Top);
            r.margin = new Vector4(20, 132, 20, 0);
        }
        var buttons = Online.Ranked
            ? new (string, System.Action)[] { ("Find another match", () => { Online.Leave(); var m = App.Instance?.Menu("online"); Online.FindRanked(() => m?.Show("signin")); }), ("Return to menu", Online.ToMenu) }
            : conceded
                ? new (string, System.Action)[] { ("Return to menu", Online.ToMenu) }
                : new (string, System.Action)[] { ("Play again", Online.Rematch), ("Return to menu", Online.ToMenu) };
        for (int i = 0; i < buttons.Length; i++)
        {
            var (label, act) = buttons[i];
            var b = Hud.Pill(card, label, act, 16, i == 0 ? Look.Ink : (Color?)null, i == 0 ? Color.white : (Color?)null);
            Hud.At((RectTransform)b.transform, new Vector2(0.5f, 0), new Vector2((i - (buttons.Length - 1) / 2f) * 270, 30), new Vector2(250, 56));
        }
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
