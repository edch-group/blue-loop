using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Play online (app.ts renderOnline): the game mode in its pane, you and your deck, and three ways in: host a game (a
/// room code and link to send a friend), ranked (the ladder finds a rival near your rank), or join a game by its code.
/// In a room: its code and the invite, you against your rival (or waiting for them), and ready; the game starts when
/// you are both ready. Laid out to the web's measures on its 1600 x 1000 page.
/// </summary>
public class OnlineView : MonoBehaviour
{
    MenuView menu;
    RectTransform page, body;

    public static OnlineView Make(RectTransform page, MenuView menu)
    {
        var v = page.gameObject.AddComponent<OnlineView>();
        v.menu = menu;
        v.page = page;
        // (Your deck is your quickplay seat's, in the mode played: the room hears of a change.)
        var mine = menu.SeatDeck(0).Name;
        if (Online.DeckName != mine)
        {
            Online.DeckName = mine;
            if (Online.Client != null) Online.StepDeck(0);
        }
        Online.Changed += v.Draw;
        v.Draw();
        return v;
    }

    void OnDestroy() => Online.Changed -= Draw;

    void Draw()
    {
        if (this == null || page == null) return;
        if (body != null) Mats.Kill(body.gameObject);
        body = Hud.Rect(page, "Online");
        Hud.Fill(body);
        if (Online.Client == null)
        {
            menu.ModePane("online", body);
            menu.SetupTop(body, "play online", () => { Online.Leave(); menu.Show("hub"); }, MenuView.PaneW);
            Ways();
        }
        else
        {
            menu.SetupTop(body, "play online", () => { Online.Leave(); menu.Show("hub"); });
            InRoom();
        }
    }

    /// <summary>Quiet words (the web's .muted: Exo 2 18.6, ink-faint), centred on `mid`, `y` down.</summary>
    TextMeshProUGUI Muted(string text, float mid, float y, TextAlignmentOptions align = TextAlignmentOptions.Center)
    {
        float w = Hud.Wide(text, 18.6f, 400, 0, 2, false);
        return Hud.Text(body, text, align == TextAlignmentOptions.Right ? mid - w : mid - w / 2, y, w, 23, 18.6f, Look.InkFaint, false, 400, 0, align);
    }

    /// <summary>The web's .btn-primary as the ways in have it (13, padded 20.3 a side, 41.2 tall), its right edge at `right`.</summary>
    static Button Act(RectTransform r, string text, float right, float y, System.Action act, bool primary = true)
    {
        float w = Hud.Wide(text.ToUpperInvariant(), 13, primary ? 700 : 500, 14, 21.7f);
        var b = primary ? Hud.Primary(r, text, act, 13) : Hud.Btn(r, text, act, 13);
        Hud.Place((RectTransform)b.transform, right - w, y, w, 41.2f);
        return b;
    }

    // ---- Not in a room: you, and the ways in ----

    void Ways()
    {
        // You, as in quickplay (the web's .online-me: 435 by 435).
        var you = menu.SeatPanel(body, 481, 288.3f, string.IsNullOrEmpty(Profile.Me.Name) ? "Commander" : Profile.Me.Name, null, null, w: 435);
        menu.SeatDecks(you, 0);
        var rank = Profile.Me.RankPoints;
        Mode(0, "host a game", "a room code and link to send a friend", r => Act(r, "create room", 532.6f, 46.1f, () => Online.Go()));
        Mode(1, "ranked", rank == null ? "climb from olivine i against rivals near your rank" : $"{Progression.RankName(rank.Value).ToLowerInvariant()} · rivals within one rank", r =>
        {
            if (Online.Searching)
            {
                var cancel = Act(r, "cancel", 532.6f, 46.1f, Online.CancelRanked, false);
                float cx = ((RectTransform)cancel.transform).anchoredPosition.x - 8.7f;
                float sw = Hud.Wide("searching…", 18.6f, 400, 0, 2, false);
                Hud.Text(r, "searching…", cx - sw, 55.2f, sw, 23, 18.6f, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Right);
            }
            else Act(r, "find a match", 532.6f, 46.1f, () => Online.FindRanked(() => { AccountView.Begin(); menu.Show("signin"); }));
        });
        Mode(2, "join a game", "the code your friend sent you", r =>
        {
            var join = Act(r, "join", 532.6f, 46.1f, () =>
            {
                var c = Online.CleanCode(Online.JoinCode);
                if (c.Length < 4) { menu.Toast("Enter a room code"); return; }
                Online.Go(c);
            });
            // (The web's .online-code: 118.9 by 42.3, round, a hairline of #eceae6, its letters spaced 0.24em.)
            float jx = ((RectTransform)join.transform).anchoredPosition.x;
            var code = AccountView.Field(r, Online.JoinCode, jx - 8.7f - 118.9f, 45.6f, 118.9f, 42.3f, "CODE", false, 8, 16.2f);
            ((Image)code.targetGraphic).color = new Color(1, 1, 1, 0.85f);
            code.textComponent.characterSpacing = 24;
            ((TextMeshProUGUI)code.placeholder).characterSpacing = 24;
            ((TextMeshProUGUI)code.placeholder).color = Look.InkFaint;
            code.textViewport.offsetMin = new Vector2(8, 2);
            code.textViewport.offsetMax = new Vector2(-8, -2);
            code.onValueChanged.AddListener(v => Online.JoinCode = v);
        });
        Muted("1v1 · each player on their own device", 991.4f, 929.2f);
    }

    /// <summary>
    /// One way in (the web's .online-mode): a panel 551 by 133.4 like a seat; what it is (18.1, spaced 0.18em) over a
    /// word on it (Exo 2 16.2, ink-soft) on the left, its button(s) on the right.
    /// </summary>
    void Mode(int i, string title, string sub, System.Action<RectTransform> act)
    {
        var r = menu.SeatPanel(body, 950.8f, 288.3f + i * 150.8f, null, null, null, w: 551, h: 133.4f);
        Hud.Text(r, title.ToUpperInvariant(), 27.1f, 44.7f, 330, 22, 18.1f, Look.Ink, true, 500, 18, TextAlignmentOptions.Left);
        var s = Hud.Text(r, sub, 27.1f, 69.6f, 316.6f, 19, 16.2f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
        s.overflowMode = TextOverflowModes.Ellipsis;
        act(r);
    }

    // ---- In a room ----

    void InRoom()
    {
        var seats = Online.Lobby ?? new System.Collections.Generic.List<Online.LobbySeat>();
        var rival = seats.Where((_, i) => i != Online.You).FirstOrDefault();
        bool ready = Online.You < seats.Count && seats[Online.You].Ready;
        // The room: its code and the invite, on a line centred 266 down (a ranked match: who against, and what for).
        if (Online.Ranked)
        {
            var rank = Profile.Me.RankPoints;
            Hud.Text(body, "RANKED MATCH", 0, 236, 1600, 17, 13.9f, Look.InkFaint, true, 400, 20);
            Hud.Text(body, rival != null ? $"VS {rival.Name.ToUpperInvariant()}" : "MATCHED", 0, 259.4f, 1600, 37, 30.2f, Look.Ink, true, 700, 30);
            Muted($"a win climbs the ladder · {(rank != null ? Progression.RankName(rank.Value).ToLowerInvariant() : "olivine i")}", 800, 305);
        }
        else
        {
            string code = Online.Client.Code;
            float sw = Hud.Wide("ROOM CODE", 13.9f, 400, 20, 0), cw = Hud.Wide(code, 46.4f, 700, 30, 0), pw = Hud.Wide("SHARE INVITE LINK", 13, 500, 14, 16.6f);
            float x = 800 - (sw + 17.4f + cw + 17.4f + pw) / 2;
            Hud.Text(body, "ROOM CODE", x, 286.3f, sw + 2, 17, 13.9f, Look.InkFaint, true, 400, 20, TextAlignmentOptions.Left);
            Hud.Text(body, code, x + sw + 17.4f, 265.8f, cw + 2, 58, 46.4f, Look.Ink, true, 700, 30, TextAlignmentOptions.Left);
            var share = Hud.Btn(body, "Share invite link", () =>
            {
                Net.Share(Online.InviteLink(Online.Client.Code));
                menu.Toast("Invite link copied");
            }, 13, 16.25f);
            Hud.Place((RectTransform)share.transform, x + sw + 17.4f + cw + 17.4f, 278.5f, pw, 32.5f);
        }
        // You against your rival (theirs to choose, so not buttons), or waiting for them: seats 451.2 by 330.
        var you = menu.SeatPanel(body, 307, 353.8f, string.IsNullOrEmpty(Profile.Me.Name) ? "Commander" : Profile.Me.Name, null, null, ready ? "ready" : "not ready", ready, 451.2f, 330);
        menu.SeatDecks(you, 0, 85.6f, 104.4f, 274.2f);
        Hud.Text(body, "vs", 758.2f, 504.3f, 83.6f, 29, 23.2f, Look.InkFaint, true, 400, 20);
        if (rival != null)
        {
            var theirs = menu.SeatPanel(body, 841.8f, 353.8f, rival.Name, null, null, rival.Ready ? "ready" : "choosing", rival.Ready, 451.2f, 330);
            var deck = new Decks.Saved { Id = "rival", Name = rival.DeckName ?? "", Cards = rival.Cover != null ? new System.Collections.Generic.List<string> { rival.Cover } : new System.Collections.Generic.List<string>(), Cover = rival.Cover };
            BuilderView.DeckBoxMini(theirs, (451.2f - 104.4f) / 2, 85.6f, deck, true, null, 104.4f);
            Hud.Text(theirs, "their deck", 0, 274.2f + 2.8f, 451.2f, 23, 18.6f, Look.InkFaint, false, 400, 0);
        }
        else
        {
            var waiting = menu.SeatPanel(body, 841.8f, 353.8f, null, null, null, w: 451.2f, h: 330);
            // (A green light, humming, over the words.)
            var pulse = Hud.Rect(waiting, "Pulse");
            Hud.Place(pulse, 215.4f, 124.7f, 20.3f, 20.3f);
            var pi = pulse.gameObject.AddComponent<Image>();
            pi.sprite = Hud.Circle;
            pi.color = Hud.Rgba(124, 199, 154);
            pi.raycastTarget = false;
            Hud.Shadow(pi, 10.15f, new Hud.Drop(Hud.Rgba(124, 199, 154, 0.75f), 0, 17.4f));
            pulse.gameObject.AddComponent<Hum>();
            Hud.Text(waiting, "WAITING FOR YOUR OPPONENT", 0, 156.6f, 451.2f, 19, 15.3f, Look.InkSoft, true, 500, 16);
            Hud.Text(waiting, "send them the code or the link", 0, 187.2f, 451.2f, 18, 15.3f, Look.InkFaint, false, 400, 0);
        }
        // The connection, if it isn't up.
        if (Online.Status == "lost")
        {
            float lw = Hud.Wide("CONNECTION LOST · RETRY", 15.3f, 500, 14, 24.2f);
            var retry = Hud.Btn(body, "Connection lost · retry", Online.Retry, 15.3f);
            Hud.Place((RectTransform)retry.transform, 800 - lw / 2, 703.6f, lw, 47.1f);
        }
        else if (Online.Status != "open") Muted("connecting…", 800, 713.7f);
        // The foot: leave, where things stand, ready.
        float leaveW = Hud.Wide("LEAVE ROOM", 15.3f, 500, 14, 24.2f);
        var leave = Hud.Btn(body, "Leave room", Online.Leave, 15.3f);
        Hud.Place((RectTransform)leave.transform, 26.1f, 912.6f, leaveW, 47.1f);
        Muted(rival == null ? "get ready while you wait" : ready && rival.Ready ? "starting…" : ready ? $"waiting for {rival.Name} to confirm" : "the game starts when you are both ready", 1327.4f, 924.7f, TextAlignmentOptions.Right);
        var go = ready ? Hud.Btn(body, "Not ready", Online.Ready, 15.3f) : Hud.Primary(body, "Ready", Online.Ready, 15.3f, 24);
        Hud.Place((RectTransform)go.transform, 1341.9f, ready ? 912.6f : 909.7f, 232, ready ? 47.1f : 52.9f);
    }
}

/// <summary>The waiting light's hum (the web's ls-hum): its glow swelling and easing, once in 1.4 seconds.</summary>
public class Hum : MonoBehaviour
{
    void Update()
    {
        float k = 0.85f + 0.15f * Mathf.Sin(Time.time * Mathf.PI * 2 / 1.4f);
        transform.localScale = new Vector3(k, k, 1);
    }
}
