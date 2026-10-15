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

    /// <summary>Quiet words (the web's .muted: Exo 2 12.8, ink-faint, on a line 16 tall), centred on `mid` (or ending at it), `y` down; returns their width.</summary>
    float Muted(string text, float mid, float y, TextAlignmentOptions align = TextAlignmentOptions.Center)
    {
        float w = K.TextW(text, 12.8f, 400, 0, false) + 2;
        K.Words(body, text, align == TextAlignmentOptions.Right ? mid - w : mid - w / 2, y, w, Line(12.8f, false), 12.8f, Look.InkFaint, false, 400, 0, align);
        return w;
    }

    /// <summary>
    /// A line's height as the browser sets a normal line: the font's ascent and descent (Orbitron 1.011 and 0.243 of
    /// its size, Exo 2 0.999 and 0.201), each rounded to a pixel.
    /// </summary>
    static float Line(float size, bool display = true)
        => display ? Mathf.Round(1.011f * size) + Mathf.Round(0.243f * size) : Mathf.Round(0.999f * size) + Mathf.Round(0.201f * size);

    /// <summary>
    /// A small screen (styles.css: landscape no more than 560 tall, or portrait no more than 560 across): the room's
    /// parts 8 apart, and the page's foot with no least height or padding, its quiet words gone.
    /// </summary>
    static bool Small => Css.Screen.x >= Css.Screen.y ? Css.Screen.y <= 560 : Css.Screen.x <= 560;

    // ---- Not in a room: you, and the ways in ----

    void Ways()
    {
        menu.ModePane("online", body);
        // (On a small screen the foot's words go, and the foot with them.)
        var f = menu.Setup(body, "play online", () => { Online.Leave(); menu.Show("hub"); }, true, Small ? MenuView.Footless : 16);
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
                K.Words(r, "searching…", right - cw - 6 - sw, my - 8, sw, 16, 12.8f, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Right);
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
            // (The web's .online-code: 82 across, padded 7 by 8 about its line and a hairline of #eceae6 (30 tall),
            // round, Orbitron 11.2 spaced 0.24em.)
            var code = AccountView.Field(r, Online.JoinCode, right - jw - 6 - 82, my - 15, 82, 30, "CODE", false, 8, 11.2f, 0.24f, 8);
            ((Image)code.targetGraphic).color = new Color(1, 1, 1, 0.85f);
            ((TextMeshProUGUI)code.placeholder).color = Look.InkFaint;
            code.onValueChanged.AddListener(v => Online.JoinCode = v);
            return jw + 6 + 82;
        });
        if (!Small) Muted("1v1 · each player on their own device", (f.Left + f.Right) / 2, f.FootTop + (f.FootH - f.FootPad - 16) / 2);
    }

    /// <summary>The web's .btn-primary as the ways in have it (8.96, padded 8 by 14 about its line, and its hairline: 29 tall), its right edge at `right`, centred on `mid`; returns its width.</summary>
    static float Act(RectTransform r, string text, float right, float mid, System.Action act, bool primary = true)
    {
        float w = K.BtnW(text, primary ? K.Kind.Primary : K.Kind.Btn, 8.96f, 0.14f, 14);
        K.Btn(r, text, act, right - w, mid - 14.5f, primary ? K.Kind.Primary : K.Kind.Btn, w, 29, 8.96f);
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
        float tl = Line(tf), sl = Line(sf, false), th = tl + 2 + sl;
        Hud.Ellipsis(K.Words(r, title.ToUpperInvariant(), 19, mid - th / 2, tw, tl, tf, Look.Ink, true, 500, 0.18f, TextAlignmentOptions.Left));
        var s = K.Words(r, sub, 19, mid - th / 2 + tl + 2, tw, sl, sf, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
        Hud.Ellipsis(s);
    }

    // ---- In a room ----

    void InRoom()
    {
        var seats = Online.Lobby ?? new System.Collections.Generic.List<Online.LobbySeat>();
        var rival = seats.Where((_, i) => i != Online.You).FirstOrDefault();
        bool ready = Online.You < seats.Count && seats[Online.You].Ready;
        // The foot (.setup-foot, its parts 10 apart): leave on the left, where things stand and ready on the right. (Its
        // buttons a line of 10.56 (14) padded 9 (.btn, 34 tall) or 11 (.setup-foot .btn-primary, 38) about it, with
        // their hairline. On a small screen the foot is only as tall as they are, with no padding, its words gone.)
        string goWord = ready ? "not ready" : "ready";
        float gw = ready ? K.BtnW(goWord, K.Kind.Btn) : Mathf.Max(160, K.BtnW(goWord, K.Kind.Primary, 10.56f, 0.24f, 24));
        float gh = ready ? 34 : 38, footH = Mathf.Max(34, gh);
        var f = menu.Setup(body, "play online", () => { Online.Leave(); menu.Show("hub"); }, false, footH);
        if (Small)
        {
            f.FootPad = 0;
            f.FootH = footH;
            f.FootTop = K.H - K.PadB - footH;
            f.BodyH = f.FootTop - K.Clamp(8, 3 * K.Vh, 22) - f.BodyTop;
        }
        float footMid = f.FootTop + (f.FootH - f.FootPad) / 2;
        K.Btn(body, "leave room", Online.Leave, f.Left, footMid - 17, K.Kind.Btn, 0, 34);
        K.Btn(body, goWord, Online.Ready, f.Right - gw, footMid - gh / 2, ready ? K.Kind.Btn : K.Kind.Primary, gw, gh, 10.56f, ready ? 0.14f : 0.24f);
        if (!Small)
            Muted(rival == null ? "get ready while you wait" : ready && rival.Ready ? "starting…" : ready ? $"waiting for {rival.Name} to confirm" : "the game starts when you are both ready", f.Right - gw - 10, footMid - 8, TextAlignmentOptions.Right);

        // The body (.online-wrap, centred, clamp(12px, 3vh, 24px) between its parts, 8 on a small screen): the room
        // (its code and the invite; a ranked match: who against, and what for), you against your rival (or waiting for
        // them), and the connection if it isn't up.
        float gap = Small ? 8 : K.Clamp(12, 3 * K.Vh, 24), cx = (f.Left + f.Right) / 2;
        float codeF = K.Clamp(1.1f * K.Rem, 6 * K.Vh, 2 * K.Rem), titleF = K.Clamp(1.4f * K.Rem, 6 * K.Vh, 2.6f * K.Rem);
        // (.online-room: ranked, its label (9.6), title and words 6 apart; else a row as tall as its code's line.)
        float roomH = Online.Ranked ? Line(9.6f) + 6 + Line(titleF) + 6 + Line(12.8f, false) : Mathf.Max(Line(codeF), 23);
        // (.qp-seat: padded clamp(10px, 3vh, 18px) inside its hairline; its head (the name's line, or the ready tag's
        // of 8.96 and its 3 a side), the deck box (lifted bw × 0.12; the box bw / 0.72 tall, 6, its name's Orbitron
        // line) and "view decks" (.link-btn: 9.6 and 4 a side), clamp(6px, 2vh, 14px) apart.)
        float bw = K.Clamp(38, 14 * K.Vh, 72), pv = K.Clamp(10, 3 * K.Vh, 18) + 1, sg = K.Clamp(6, 2 * K.Vh, 14);
        float seatH = 2 * pv + Mathf.Max(Line(K.Clamp(10.56f, 2.8f * K.Vh, 14.4f)), Line(8.96f) + 6) + 2 * sg + bw * 0.12f + bw / 0.72f + 6 + Line(K.Clamp(6.4f, 1.5f * K.Vh, 8.32f)) + Line(9.6f) + 8;
        bool status = Online.Status != "open";
        float statusH = Online.Status == "lost" ? 34 : 16;
        float total = roomH + gap + seatH + (status ? gap + statusH : 0);
        float y = f.BodyTop + Mathf.Max(0, (f.BodyH - total) / 2);
        if (Online.Ranked)
        {
            var rank = Profile.Me.RankPoints;
            // (Its title a <b>: bold.)
            float ly = Line(9.6f) + 6;
            K.Words(body, "RANKED MATCH", f.Left, y, f.Right - f.Left, Line(9.6f), 9.6f, Look.InkFaint, true, 400, 0.2f);
            K.Words(body, rival != null ? $"VS {rival.Name.ToUpperInvariant()}" : "MATCHED", f.Left, y + ly, f.Right - f.Left, Line(titleF), titleF, Look.Ink, true, 700, 0.2f);
            Muted($"a win climbs the ladder · {(rank != null ? Progression.RankName(rank.Value).ToLowerInvariant() : "olivine i")}", cx, y + ly + Line(titleF) + 6);
        }
        else
        {
            // (A row: its label (9.6 spaced 0.2em, faint), the code (a <b>, bold: clamp(17.6px, 6vh, 32px), spaced
            // 0.3em), and share (.pill-btn, a line of 8.96 padded 5 about it and its hairline: 23 tall), 12 apart.)
            string code = Online.Client.Code;
            float sw = K.TextW("ROOM CODE", 9.6f, 400, 0.2f) + 2, cw = K.TextW(code, codeF, 700, 0.3f) + 2, pw = K.BtnW("share invite link", K.Kind.Pill);
            float x = cx - (sw + 12 + cw + 12 + pw) / 2, mid = y + roomH / 2;
            K.Words(body, "ROOM CODE", x, mid - Line(9.6f) / 2, sw, Line(9.6f), 9.6f, Look.InkFaint, true, 400, 0.2f, TextAlignmentOptions.Left);
            K.Words(body, code, x + sw + 12, mid - Line(codeF) / 2, cw, Line(codeF), codeF, Look.Ink, true, 700, 0.3f, TextAlignmentOptions.Left);
            K.Btn(body, "share invite link", () =>
            {
                Net.Share(Online.InviteLink(Online.Client.Code));
                menu.Toast("Invite link copied");
            }, x + sw + 12 + cw + 12, mid - 11.5f, K.Kind.Pill, pw, 23);
        }
        y += roomH + gap;
        // You against your rival (theirs to choose, so not buttons), or waiting for them (.online-seats: min(680px, the
        // body) across, the two seats either side of "vs" (Orbitron 16, spaced 0.2em, faint), 14 apart).
        float rowW = Mathf.Min(680, f.Right - f.Left), vsW = K.TextW("VS", 16, 400, 0.2f), seatW = (rowW - vsW - 28) / 2, rx = cx - rowW / 2;
        menu.Seat(body, rx, y, seatW, seatH, string.IsNullOrEmpty(Profile.Me.Name) ? "Commander" : Profile.Me.Name, null, null, ready ? "ready" : "not ready", ready, 0, bw);
        K.Words(body, "VS", rx + seatW + 14, y + seatH / 2 - 10, vsW, 20, 16, Look.InkFaint, true, 400, 0.2f, TextAlignmentOptions.Left);
        float tx = rx + seatW + 14 + vsW + 14;
        if (rival != null)
        {
            var deck = new Decks.Saved { Id = "rival", Name = rival.DeckName ?? "", Cards = rival.Cover != null ? new System.Collections.Generic.List<string> { rival.Cover } : new System.Collections.Generic.List<string>(), Cover = rival.Cover };
            menu.Seat(body, tx, y, seatW, seatH, rival.Name, null, null, rival.Ready ? "ready" : "choosing", rival.Ready, -1, bw, deck, "their deck");
        }
        else
        {
            var waiting = MenuView.SeatBox(body, tx, y, seatW, seatH).rectTransform;
            // (A green light, humming, over the words (Orbitron's line of 10.56, then Exo 2's), 8 apart: .online-waiting.)
            float wl = Line(10.56f), sl = Line(10.56f, false), wh = 14 + 8 + wl + 8 + sl, wy = (seatH - wh) / 2;
            var pulse = Hud.Rect(waiting, "Pulse");
            Hud.Place(pulse, (seatW - 14) / 2, wy, 14, 14);
            var pi = pulse.gameObject.AddComponent<Image>();
            pi.sprite = Hud.Circle;
            pi.color = Hud.Rgba(124, 199, 154);
            pi.raycastTarget = false;
            // (Its glow, 0 0 12px #7cc79a, turns to 0 0 16px rgba(75, 79, 176, 0.55) and back: both laid under it, crossfaded.)
            Hud.Shadow(pi, 7, new Hud.Drop(Hud.Rgba(124, 199, 154, 0.75f), 0, 12), new Hud.Drop(Hud.Rgba(75, 79, 176, 0), 0, 16));
            pulse.gameObject.AddComponent<Hum>();
            Hud.Ellipsis(K.Words(waiting, "WAITING FOR YOUR OPPONENT", 0, wy + 22, seatW, wl, 10.56f, Look.InkSoft, true, 500, 0.16f));
            K.Words(waiting, "send them the code or the link", 0, wy + 22 + wl + 8, seatW, sl, 10.56f, Look.InkFaint, false, 400);
        }
        y += seatH + gap;
        // The connection, if it isn't up.
        if (Online.Status == "lost")
        {
            float lw = K.BtnW("connection lost · retry", K.Kind.Btn);
            K.Btn(body, "connection lost · retry", Online.Retry, cx - lw / 2, y, K.Kind.Btn, lw, 34);
        }
        else if (status) Muted("connecting…", cx, y);
    }
}

/// <summary>
/// The waiting light's hum (the web's ls-hum, 1.4s ease-in-out, endless): its green glow turning to an indigo one
/// (rgba(75, 79, 176, 0.55)) half way and back; the two glows Hud.Shadow laid under it (just before it), crossfaded.
/// </summary>
public class Hum : MonoBehaviour
{
    Image green, indigo;

    void Update()
    {
        if (green == null)
        {
            int at = transform.GetSiblingIndex();
            if (at < 2) return;
            green = transform.parent.GetChild(at - 1).GetComponent<Image>();
            indigo = transform.parent.GetChild(at - 2).GetComponent<Image>();
            if (green == null || indigo == null) return;
        }
        float p = Time.time % 1.4f / 1.4f, half = p < 0.5f ? p * 2 : 2 - p * 2;
        // (ease-in-out, cubic-bezier(.42, 0, .58, 1), over each half: near enough smoothstep.)
        float k = half * half * (3 - 2 * half);
        var g = green.color;
        g.a = 0.75f * (1 - k);
        green.color = g;
        var i = indigo.color;
        i.a = 0.55f * 0.75f * k;
        indigo.color = i;
    }
}
