using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using K = MenuKit;

/// <summary>
/// Play online (app.ts renderOnline): the game mode in its pane, you and your deck, and three ways in: host a game (a
/// room code and link to send a friend), ranked (the ladder finds a rival near your rank), or join a game by its code.
/// In a room: its code and the invite, you against your rival (or waiting for them), and ready; the game starts when
/// you are both ready. Laid out as the web lays it out, in its CSS pixels.
/// </summary>
public class OnlineView : MonoBehaviour, MenuView.IRedraw
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
        if (Online.Client == null) Ways();
        else InRoom();
    }

    public void Redraw() => Draw();

    /// <summary>Quiet words (the web's .muted: Exo 2 12.8, ink-faint), centred on `mid` (or ending at it), `y` down; returns their width.</summary>
    float Muted(string text, float mid, float y, TextAlignmentOptions align = TextAlignmentOptions.Center)
    {
        float w = K.TextW(text, 12.8f, 400, 0, false) + 2;
        K.Words(body, text, align == TextAlignmentOptions.Right ? mid - w : mid - w / 2, y, w, 15, 12.8f, Look.InkFaint, false, 400, 0, align);
        return w;
    }

    // ---- Not in a room: you, and the ways in ----

    void Ways()
    {
        menu.ModePane("online", body);
        // (On a short screen the foot's words go, and the foot with them.)
        var f = menu.Setup(body, "play online", () => { Online.Leave(); menu.Show("hub"); }, true, K.Short ? MenuView.Footless : 15);
        // (.online-page: you (at most 300 across) and the ways in (at most 380), clamp(12px, 2.4vw, 24px) apart, centred;
        // at most 300 tall, centred in the body.)
        float gap = K.Clamp(12, 2.4f * K.Vw, 24), avail = f.Right - f.Left - gap;
        float c1 = Mathf.Min(300, avail / 2), c2 = Mathf.Min(380, avail - c1);
        float h = Mathf.Min(300, f.BodyH), x = (f.Left + f.Right - (c1 + gap + c2)) / 2, y = f.BodyTop + (f.BodyH - h) / 2;
        // You, as in quickplay.
        menu.Seat(body, x, y, c1, h, string.IsNullOrEmpty(Profile.Me.Name) ? "Commander" : Profile.Me.Name, null, null, null, false, 0);
        var rank = Profile.Me.RankPoints;
        float mx = x + c1 + gap, mgap = K.Clamp(6, 1.8f * K.Vh, 12), mh = (h - 2 * mgap) / 3;
        Mode(mx, y, c2, mh, "host a game", "a room code and link to send a friend", (r, right, my) => Act(r, "create room", right, my, () => Online.Go()));
        Mode(mx, y + mh + mgap, c2, mh, "ranked", rank == null ? "climb from olivine i against rivals near your rank" : $"{Progression.RankName(rank.Value).ToLowerInvariant()} · rivals within one rank", (r, right, my) =>
        {
            if (Online.Searching)
            {
                float cw = Act(r, "cancel", right, my, Online.CancelRanked, false);
                float sw = K.TextW("searching…", 12.8f, 400, 0, false) + 2;
                K.Words(r, "searching…", right - cw - 6 - sw, my - 7.5f, sw, 15, 12.8f, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Right);
                return cw + 6 + sw;
            }
            return Act(r, "find a match", right, my, () => Online.FindRanked(() => { AccountView.Begin(); menu.Show("signin"); }));
        });
        Mode(mx, y + 2 * (mh + mgap), c2, mh, "join a game", "the code your friend sent you", (r, right, my) =>
        {
            float jw = Act(r, "join", right, my, () =>
            {
                var c = Online.CleanCode(Online.JoinCode);
                if (c.Length < 4) { menu.Toast("Enter a room code"); return; }
                Online.Go(c);
            });
            // (The web's .online-code: 82 by 29, round, a hairline of #eceae6, Orbitron 11.2 spaced 0.24em.)
            var code = AccountView.Field(r, Online.JoinCode, right - jw - 6 - 82, my - 14.5f, 82, 29, "CODE", false, 8, 11.2f, 0.24f, 8);
            ((Image)code.targetGraphic).color = new Color(1, 1, 1, 0.85f);
            ((TextMeshProUGUI)code.placeholder).color = Look.InkFaint;
            code.onValueChanged.AddListener(v => Online.JoinCode = v);
            return jw + 6 + 82;
        });
        if (!K.Short) Muted("1v1 · each player on their own device", (f.Left + f.Right) / 2, f.FootTop + (f.FootH - f.FootPad - 15) / 2);
    }

    /// <summary>The web's .btn-primary as the ways in have it (8.96, padded 8 by 14, 28 tall), its right edge at `right`, centred on `mid`; returns its width.</summary>
    static float Act(RectTransform r, string text, float right, float mid, System.Action act, bool primary = true)
    {
        float w = K.BtnW(text, primary ? K.Kind.Primary : K.Kind.Btn, 8.96f, 0.14f, 14);
        K.Btn(r, text, act, right - w, mid - 14, primary ? K.Kind.Primary : K.Kind.Btn, w, 28, 8.96f);
        return w;
    }

    /// <summary>
    /// One way in (the web's .online-mode): a panel like a seat (padded 10 12 10 18); what it is (clamp(9.6px, 2.4vh,
    /// 12.48px), spaced 0.18em) over a word on it (Exo 2 clamp(8.96px, 2vh, 11.2px), ink-soft, cut short if long) on
    /// the left, its button(s) on the right, 12 apart.
    /// </summary>
    void Mode(float x, float y, float w, float h, string title, string sub, System.Func<RectTransform, float, float, float> act)
    {
        var r = MenuView.SeatBox(body, x, y, w, h).rectTransform;
        float right = w - 13, mid = h / 2;
        float actW = act(r, right, mid);
        float tf = K.Clamp(9.6f, 2.4f * K.Vh, 12.48f), sf = K.Clamp(8.96f, 2 * K.Vh, 11.2f), tw = right - actW - 12 - 19;
        float th = K.LineH(tf) + 2 + sf * 1.17f;
        Hud.Ellipsis(K.Words(r, title.ToUpperInvariant(), 19, mid - th / 2, tw, K.LineH(tf), tf, Look.Ink, true, 500, 0.18f, TextAlignmentOptions.Left));
        var s = K.Words(r, sub, 19, mid - th / 2 + K.LineH(tf) + 2, tw, sf * 1.17f, sf, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
        Hud.Ellipsis(s);
    }

    // ---- In a room ----

    void InRoom()
    {
        var seats = Online.Lobby ?? new System.Collections.Generic.List<Online.LobbySeat>();
        var rival = seats.Where((_, i) => i != Online.You).FirstOrDefault();
        bool ready = Online.You < seats.Count && seats[Online.You].Ready;
        // The foot (.setup-foot): leave on the left, where things stand and ready on the right.
        var f = menu.Setup(body, "play online", () => { Online.Leave(); menu.Show("hub"); }, false, 32);
        float footY = f.FootTop + (f.FootH - f.FootPad - 32) / 2;
        K.Btn(body, "leave room", Online.Leave, f.Left, footY);
        string goWord = ready ? "not ready" : "ready";
        float gw = ready ? K.BtnW(goWord, K.Kind.Btn) : Mathf.Max(160, K.BtnW(goWord, K.Kind.Primary, 10.56f, 0.24f, 24));
        float gh = ready ? 32 : K.LineH(10.56f) + 24;
        K.Btn(body, goWord, Online.Ready, f.Right - gw, f.FootTop + (f.FootH - f.FootPad - gh) / 2, ready ? K.Kind.Btn : K.Kind.Primary, gw, gh, 10.56f, ready ? 0.14f : 0.24f);
        Muted(rival == null ? "get ready while you wait" : ready && rival.Ready ? "starting…" : ready ? $"waiting for {rival.Name} to confirm" : "the game starts when you are both ready", f.Right - gw - 10, footY + 8.5f, TextAlignmentOptions.Right);

        // The body (.online-wrap, centred, clamp(12px, 3vh, 24px) between its parts): the room (its code and the
        // invite; a ranked match: who against, and what for), you against your rival (or waiting for them), and the
        // connection if it isn't up.
        float gap = K.Clamp(12, 3 * K.Vh, 24), cx = (f.Left + f.Right) / 2;
        float codeF = K.Clamp(1.1f * K.Rem, 6 * K.Vh, 2 * K.Rem), titleF = K.Clamp(1.4f * K.Rem, 6 * K.Vh, 2.6f * K.Rem);
        float roomH = Online.Ranked ? 11 + 6 + titleF * 1.16f + 6 + 15 : Mathf.Max(codeF * 1.16f, 22);
        float bw = K.Clamp(38, 14 * K.Vh, 72), pv = K.Clamp(10, 3 * K.Vh, 18) + 1, sg = K.Clamp(6, 2 * K.Vh, 14);
        float seatH = 2 * pv + Mathf.Max(K.LineH(K.Clamp(10.56f, 2.8f * K.Vh, 14.4f)), K.LineH(8.96f) + 6) + 2 * sg + bw * 0.12f + BuilderView.MiniH(bw) + 19;
        bool status = Online.Status != "open";
        float statusH = Online.Status == "lost" ? 32 : 15;
        float total = roomH + gap + seatH + (status ? gap + statusH : 0);
        float y = f.BodyTop + Mathf.Max(0, (f.BodyH - total) / 2);
        if (Online.Ranked)
        {
            var rank = Profile.Me.RankPoints;
            K.Words(body, "RANKED MATCH", f.Left, y, f.Right - f.Left, 11, 9.6f, Look.InkFaint, true, 400, 0.2f);
            K.Words(body, rival != null ? $"VS {rival.Name.ToUpperInvariant()}" : "MATCHED", f.Left, y + 17, f.Right - f.Left, titleF * 1.16f, titleF, Look.Ink, true, 400, 0.2f);
            Muted($"a win climbs the ladder · {(rank != null ? Progression.RankName(rank.Value).ToLowerInvariant() : "olivine i")}", cx, y + 17 + titleF * 1.16f + 6);
        }
        else
        {
            // (A row: its label (9.6 spaced 0.2em, faint), the code (clamp(17.6px, 6vh, 32px), spaced 0.3em), and share, 12 apart.)
            string code = Online.Client.Code;
            float sw = K.TextW("ROOM CODE", 9.6f, 400, 0.2f) + 2, cw = K.TextW(code, codeF, 500, 0.3f) + 2, pw = K.BtnW("share invite link", K.Kind.Pill);
            float x = cx - (sw + 12 + cw + 12 + pw) / 2, mid = y + roomH / 2;
            K.Words(body, "ROOM CODE", x, mid - 5.5f, sw, 11, 9.6f, Look.InkFaint, true, 400, 0.2f, TextAlignmentOptions.Left);
            K.Words(body, code, x + sw + 12, mid - codeF * 0.58f, cw, codeF * 1.16f, codeF, Look.Ink, true, 500, 0.3f, TextAlignmentOptions.Left);
            K.Btn(body, "share invite link", () =>
            {
                Net.Share(Online.InviteLink(Online.Client.Code));
                menu.Toast("Invite link copied");
            }, x + sw + 12 + cw + 12, mid - 11, K.Kind.Pill);
        }
        y += roomH + gap;
        // You against your rival (theirs to choose, so not buttons), or waiting for them (.online-seats: min(680px, the
        // body) across, the two seats either side of "vs", 14 apart).
        float rowW = Mathf.Min(680, f.Right - f.Left), vsW = K.TextW("VS", 12.8f, 400, 0.2f) + 2, seatW = (rowW - vsW - 28) / 2, rx = cx - rowW / 2;
        menu.Seat(body, rx, y, seatW, seatH, string.IsNullOrEmpty(Profile.Me.Name) ? "Commander" : Profile.Me.Name, null, null, ready ? "ready" : "not ready", ready, 0, bw);
        K.Words(body, "VS", rx + seatW + 14, y + seatH / 2 - 8, vsW, 16, 12.8f, Look.InkFaint, true, 400, 0.2f);
        float tx = rx + seatW + 14 + vsW + 14;
        if (rival != null)
        {
            var deck = new Decks.Saved { Id = "rival", Name = rival.DeckName ?? "", Cards = rival.Cover != null ? new System.Collections.Generic.List<string> { rival.Cover } : new System.Collections.Generic.List<string>(), Cover = rival.Cover };
            menu.Seat(body, tx, y, seatW, seatH, rival.Name, null, null, rival.Ready ? "ready" : "choosing", rival.Ready, -1, bw, deck, "their deck");
        }
        else
        {
            var waiting = MenuView.SeatBox(body, tx, y, seatW, seatH).rectTransform;
            // (A green light, humming, over the words, 8 apart: .online-waiting.)
            float wh = 14 + 8 + 13 + 8 + 13, wy = (seatH - wh) / 2;
            var pulse = Hud.Rect(waiting, "Pulse");
            Hud.Place(pulse, (seatW - 14) / 2, wy, 14, 14);
            var pi = pulse.gameObject.AddComponent<Image>();
            pi.sprite = Hud.Circle;
            pi.color = Hud.Rgba(124, 199, 154);
            pi.raycastTarget = false;
            Hud.Shadow(pi, 7, new Hud.Drop(Hud.Rgba(124, 199, 154, 0.75f), 0, 12));
            pulse.gameObject.AddComponent<Hum>();
            Hud.Ellipsis(K.Words(waiting, "WAITING FOR YOUR OPPONENT", 0, wy + 22, seatW, 13, 10.56f, Look.InkSoft, true, 500, 0.16f));
            K.Words(waiting, "send them the code or the link", 0, wy + 43, seatW, 13, 10.56f, Look.InkFaint, false, 400);
        }
        y += seatH + gap;
        // The connection, if it isn't up.
        if (Online.Status == "lost")
        {
            float lw = K.BtnW("connection lost · retry", K.Kind.Btn);
            K.Btn(body, "connection lost · retry", Online.Retry, cx - lw / 2, y);
        }
        else if (status) Muted("connecting…", cx, y);
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
