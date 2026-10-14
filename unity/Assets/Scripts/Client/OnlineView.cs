using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Play online (app.ts renderOnline): you and your deck, and three ways in: host a game (a room code and link to send a
/// friend), ranked (the ladder finds a rival near your rank), or join a game by its code. In a room: its code and the
/// invite, you against your rival (or waiting for them), and ready; the game starts when you are both ready.
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
        menu.SetupTop(body, "play online", () =>
        {
            Online.Leave();
            menu.Show("hub");
        });
        if (Online.Client == null) Ways();
        else InRoom();
    }

    /// <summary>A line of quiet words at the foot of the page.</summary>
    void Foot(string text, float y = 34)
    {
        var t = Hud.Label(body, text, 15, Look.InkSoft, false, 500, 0);
        Hud.At(t.rectTransform, new Vector2(0.5f, 0), new Vector2(0, y), new Vector2(900, 40));
    }

    // ---- Not in a room: you, and the ways in ----

    void Ways()
    {
        Seat(new Vector2(-330, -20), null);
        var rank = Profile.Me.RankPoints;
        Mode(0, "host a game", "a room code and link to send a friend", r =>
        {
            var b = Hud.Pill(r, "Create room", () => Online.Go(), 15, Look.Ink, Color.white);
            Hud.At((RectTransform)b.transform, new Vector2(1, 0.5f), new Vector2(-22, 0), new Vector2(190, 50));
        });
        Mode(1, "ranked", rank == null ? "climb from olivine i against rivals near your rank" : $"{Progression.RankName(rank.Value).ToLowerInvariant()} · rivals within one rank", r =>
        {
            if (Online.Searching)
            {
                var b = Hud.Pill(r, "Cancel", Online.CancelRanked, 15);
                Hud.At((RectTransform)b.transform, new Vector2(1, 0.5f), new Vector2(-22, 0), new Vector2(130, 50));
                var s = Hud.Label(r, "searching…", 15, Look.InkSoft, false, 500, 0, TextAlignmentOptions.Right);
                s.margin = new Vector4(0, 0, 166, 0);
            }
            else
            {
                var b = Hud.Pill(r, "Find a match", () => Online.FindRanked(() => { AccountView.Begin(); menu.Show("signin"); }), 15, Look.Ink, Color.white);
                Hud.At((RectTransform)b.transform, new Vector2(1, 0.5f), new Vector2(-22, 0), new Vector2(190, 50));
            }
        });
        Mode(2, "join a game", "the code your friend sent you", r =>
        {
            var code = AccountView.Field(r, Online.JoinCode, new Vector2(91, -42), new Vector2(150, 50), "code", false, 8);
            code.onValueChanged.AddListener(v => Online.JoinCode = v);
            var b = Hud.Pill(r, "Join", () =>
            {
                var c = Online.CleanCode(Online.JoinCode);
                if (c.Length < 4) { menu.Toast("Enter a room code"); return; }
                Online.Go(c);
            }, 15, Look.Ink, Color.white);
            Hud.At((RectTransform)b.transform, new Vector2(1, 0.5f), new Vector2(-22, 0), new Vector2(110, 50));
        });
        Foot("1v1 · each player on their own device");
    }

    /// <summary>One way in: what it is, a word on it, and its button(s) on the right.</summary>
    void Mode(int i, string title, string sub, System.Action<RectTransform> act)
    {
        var panel = Hud.Glass(body, title, Look.GlassStrong);
        var r = (RectTransform)panel.transform;
        Hud.At(r, new Vector2(0.5f, 0.5f), new Vector2(300, 170 - i * 170), new Vector2(620, 134));
        var t = Hud.Label(r, $"<b>{title.ToUpperInvariant()}</b>\n<size=75%><color=#737780>{sub}</color></size>", 19, Look.Ink, true, 500, 10, TextAlignmentOptions.Left);
        t.margin = new Vector4(30, 0, 250, 0);
        t.textWrappingMode = TextWrappingModes.Normal;
        act(r);
    }

    /// <summary>
    /// You, as in quickplay: your name, your deck's cover and name, and arrows to step through the decks (in a room,
    /// whether you are ready).
    /// </summary>
    void Seat(Vector2 at, bool? ready)
    {
        var panel = Hud.Glass(body, "You", Look.GlassStrong);
        Hud.At((RectTransform)panel.transform, new Vector2(0.5f, 0.5f), at, new Vector2(440, 520));
        var me = Profile.Me;
        var name = Hud.Label(panel.transform, string.IsNullOrEmpty(me.Name) ? "COMMANDER" : me.Name.ToUpperInvariant(), 22, Look.Ink, true, 500, 14, TextAlignmentOptions.Top);
        name.margin = new Vector4(0, 26, 0, 0);
        if (ready != null) Tag(panel.transform, ready.Value, "not ready");
        var deck = Online.Deck();
        Cover(panel.transform, deck.Cover ?? deck.Cards.FirstOrDefault(id => Cards.Def(id).Kind == "command") ?? deck.Cards[0]);
        var deckName = Hud.Label(panel.transform, deck.Name.ToUpperInvariant(), 18, Look.Ink, true, 500, 10, TextAlignmentOptions.Bottom);
        deckName.margin = new Vector4(20, 0, 20, 34);
        for (int dir = -1; dir <= 1; dir += 2)
        {
            int step = dir;
            var arrow = Hud.Pill(panel.transform, dir < 0 ? "‹" : "›", () => Online.StepDeck(step), 28);
            Hud.At((RectTransform)arrow.transform, new Vector2(0.5f, 0.5f), new Vector2(step * 170, 0), new Vector2(56, 56));
        }
    }

    static void Cover(Transform parent, string card)
    {
        var face = Hud.Rect(parent, "Cover");
        Hud.At(face, new Vector2(0.5f, 0.5f), new Vector2(0, 0), new Vector2(214, 300));
        var raw = face.gameObject.AddComponent<RawImage>();
        raw.texture = card != null ? Faces.Of(card, false) : Resources.Load<Texture2D>("Board/back");
        raw.raycastTarget = false;
    }

    /// <summary>A seat's word, top right: ready, or what they are still doing.</summary>
    static void Tag(Transform parent, bool on, string otherwise)
    {
        var r = Hud.Rect(parent, "Tag");
        Hud.At(r, new Vector2(1, 1), new Vector2(-18, -20), new Vector2(124, 32));
        var img = r.gameObject.AddComponent<Image>();
        img.sprite = Hud.Rounded;
        img.type = Image.Type.Sliced;
        img.color = on ? Look.Good : new Color(0.93f, 0.93f, 0.95f);
        Hud.Label(r, (on ? "ready" : otherwise).ToUpperInvariant(), 12, on ? Color.white : Look.InkSoft, true, 500, 12);
    }

    // ---- In a room ----

    void InRoom()
    {
        var seats = Online.Lobby ?? new System.Collections.Generic.List<Online.LobbySeat>();
        var rival = seats.Where((_, i) => i != Online.You).FirstOrDefault();
        bool ready = Online.You < seats.Count && seats[Online.You].Ready;
        // The room: its code and the invite (a ranked match: who against, and what it is for).
        var head = Hud.Rect(body, "Room");
        Hud.At(head, new Vector2(0.5f, 1), new Vector2(0, -96), new Vector2(700, 120));
        if (Online.Ranked)
        {
            var rank = Profile.Me.RankPoints;
            Hud.Label(head, $"<size=55%><color=#a6a9b0>RANKED MATCH</color></size>\n{(rival != null ? $"VS {rival.Name.ToUpperInvariant()}" : "MATCHED")}\n<size=50%><color=#737780>a win climbs the ladder · {(rank != null ? Progression.RankName(rank.Value).ToLowerInvariant() : "olivine i")}</color></size>", 30, Look.Ink, true, 500, 12);
        }
        else
        {
            var code = Hud.Label(head, $"<size=45%><color=#a6a9b0>ROOM CODE</color></size>\n{Online.Client.Code}", 44, Look.Ink, true, 700, 24, TextAlignmentOptions.Left);
            code.margin = new Vector4(130, 0, 0, 0);
            var share = Hud.Pill(head, "Share invite link", () =>
            {
                Net.Share(Online.InviteLink(Online.Client.Code));
                menu.Toast("Invite link copied");
            }, 13);
            Hud.At((RectTransform)share.transform, new Vector2(1, 0.5f), new Vector2(-60, 0), new Vector2(230, 44));
        }
        // You against your rival (theirs to choose, so not buttons), or waiting for them.
        Seat(new Vector2(-280, -60), ready);
        var vs = Hud.Label(body, "VS", 22, Look.InkFaint, true, 500, 14);
        Hud.At(vs.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0, -60), new Vector2(100, 40));
        var theirs = Hud.Glass(body, "Rival", rival != null ? Look.GlassStrong : new Color(0.97f, 0.97f, 0.96f, 0.7f));
        Hud.At((RectTransform)theirs.transform, new Vector2(0.5f, 0.5f), new Vector2(280, -60), new Vector2(440, 520));
        if (rival != null)
        {
            var name = Hud.Label(theirs.transform, rival.Name.ToUpperInvariant(), 22, Look.Ink, true, 500, 14, TextAlignmentOptions.Top);
            name.margin = new Vector4(0, 26, 0, 0);
            Tag(theirs.transform, rival.Ready, "choosing");
            Cover(theirs.transform, rival.Cover);
            var deckName = Hud.Label(theirs.transform, $"{rival.DeckName.ToUpperInvariant()}\n<size=75%><color=#a6a9b0>THEIR DECK</color></size>", 18, Look.Ink, true, 500, 10, TextAlignmentOptions.Bottom);
            deckName.margin = new Vector4(20, 0, 20, 22);
        }
        else
        {
            var wait = Hud.Label(theirs.transform, "WAITING FOR YOUR OPPONENT\n<size=70%><color=#737780>send them the code or the link</color></size>", 18, Look.Ink, true, 500, 10);
            wait.textWrappingMode = TextWrappingModes.Normal;
            wait.margin = new Vector4(30, 0, 30, 0);
        }
        // The connection, if it isn't up.
        if (Online.Status == "lost")
        {
            var retry = Hud.Pill(body, "Connection lost · retry", Online.Retry, 14);
            Hud.At((RectTransform)retry.transform, new Vector2(0.5f, 0), new Vector2(0, 110), new Vector2(320, 46));
        }
        else if (Online.Status != "open") Foot("connecting…", 116);
        // The foot: leave, where things stand, ready.
        var leave = Hud.Pill(body, "Leave room", Online.Leave, 15);
        Hud.At((RectTransform)leave.transform, new Vector2(0, 0), new Vector2(40, 34), new Vector2(190, 56));
        Foot(rival == null ? "get ready while you wait" : ready && rival.Ready ? "starting…" : ready ? $"waiting for {rival.Name} to confirm" : "the game starts when you are both ready");
        var go = Hud.Pill(body, ready ? "Not ready" : "Ready", Online.Ready, 17, ready ? (Color?)null : Look.Ink, ready ? (Color?)null : Color.white);
        Hud.At((RectTransform)go.transform, new Vector2(1, 0), new Vector2(-40, 34), new Vector2(200, 56));
    }
}
