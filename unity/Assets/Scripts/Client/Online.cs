using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using Newtonsoft.Json.Linq;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// Online 1v1 (online.ts, and app.ts's goOnline): a room on the game's server (server/room.ts) that runs the game and
/// sends each player their own view of it. Create a room (a code and a link to send a friend), join one by its code,
/// or let the ranked ladder find you a rival; both get ready in the room's lobby, then play, each on their own device.
/// The connection rejoins by itself if it drops, with the seat's token kept for the room.
///
/// This is the one online session, alive across the menu and the battle: the online page shows its lobby, and the
/// battle sends its moves through it (BattleView.Online).
/// </summary>
public static class Online
{
    public class LobbySeat
    {
        public string Name;
        public string DeckName;
        public bool Ready;
        /// <summary>Their deck's cover card.</summary>
        public string Cover;
    }

    /// <summary>The last move, for the battle to play out.</summary>
    public class LastMove
    {
        public EngineAction Action;
        public string ActorId;
        public string Played;
        public bool? FaceDown;
    }

    /// <summary>The room connection (null: in none).</summary>
    public static Room Client;
    /// <summary>A code typed (or from an invite link) to join.</summary>
    public static string JoinCode = "";
    /// <summary>idle, connecting, open, or lost (given up: the player can retry).</summary>
    public static string Status = "idle";
    public static List<LobbySeat> Lobby;
    public static int You;
    /// <summary>Whether the rival is connected (they may have closed the game; the room waits for them).</summary>
    public static bool RivalOnline = true;
    /// <summary>Whether this is a ranked game (its reward comes from the ladder).</summary>
    public static bool Ranked;
    /// <summary>Queued on the ranked ladder, looking for a match.</summary>
    public static bool Searching;
    /// <summary>In a game: "you" must confirm the rival's card; the "rival" is reading yours (you wait); null.</summary>
    public static string WaitFor;
    /// <summary>What the game just over earned you, for under its result.</summary>
    public static string ResultExtra = "";
    /// <summary>The card the rival played last (null: set face down), for you to read.</summary>
    public static string LastPlayed;
    /// <summary>The deck you play online (by name; unset: the first on offer).</summary>
    public static string DeckName;
    /// <summary>Something changed: the page or the battle showing it redraws.</summary>
    public static event System.Action Changed;
    static Ladder ladder;
    static BattleView battle;

    static void Change()
    {
        Changed?.Invoke();
        if (battle != null) battle.OnlineChanged();
    }

    /// <summary>A word from the room (why not), on the board or over the menu.</summary>
    static void Say(string message)
    {
        if (battle != null) battle.SayOnline(message);
        else UnityEngine.Object.FindAnyObjectByType<MenuView>()?.Toast(message);
    }

    // ---- Codes and links ----

    /// <summary>Room codes: five letters and digits, without the ones easily confused (0/O, 1/I).</summary>
    public static string NewCode()
    {
        const string abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var r = new System.Random();
        return new string(Enumerable.Range(0, 5).Select(_ => abc[r.Next(abc.Length)]).ToArray());
    }

    public static string CleanCode(string s)
    {
        var c = new string((s ?? "").ToUpperInvariant().Where(ch => (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')).ToArray());
        return c.Length > 8 ? c.Substring(0, 8) : c;
    }

    /// <summary>An invite link to a room: the game in the browser, at the room.</summary>
    public static string InviteLink(string code)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        var here = UnityEngine.Application.absoluteURL;
        int cut = here.IndexOfAny(new[] { '?', '#' });
        return (cut >= 0 ? here.Substring(0, cut) : here) + "?room=" + code;
#else
        return $"{Net.Base}/play/?room={code}";
#endif
    }

    /// <summary>A room the page was opened at (?room=CODE), waiting to be joined (taken once).</summary>
    public static string TakeInvite()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        if (inviteTaken) return null;
        inviteTaken = true;
        var url = UnityEngine.Application.absoluteURL ?? "";
        int q = url.IndexOf('?');
        if (q < 0) return null;
        foreach (var part in url.Substring(q + 1).Split('&', '#'))
            if (part.StartsWith("room=")) return CleanCode(System.Uri.UnescapeDataString(part.Substring(5)));
#endif
        return null;
    }
#if UNITY_WEBGL && !UNITY_EDITOR
    static bool inviteTaken;
#endif

    static string TokenKey(string code) => $"blue-loop:online:{code}";

    /// <summary>Whether this device already holds a seat in a room (so it can rejoin without asking).</summary>
    public static bool HasSeat(string code) => Store.Get(TokenKey(code)) != null;

    // ---- You, as the room needs you ----

    /// <summary>The decks on offer online: as quickplay's.</summary>
    public static List<Decks.Saved> DeckChoices() => Decks.All().Where(d => d.Mixed != true).ToList();

    public static Decks.Saved Deck()
    {
        var decks = DeckChoices();
        return decks.FirstOrDefault(d => d.Name == DeckName) ?? decks[0];
    }

    /// <summary>Your name and deck, as the room needs them.</summary>
    static JObject JoinInfo()
    {
        var deck = Deck();
        var o = new JObject
        {
            ["name"] = string.IsNullOrEmpty(Profile.Me.Name) ? "Commander" : Profile.Me.Name,
            ["deck"] = new JArray(deck.Cards),
            ["deckName"] = deck.Name,
            ["profileId"] = Profile.Me.Id,
            ["mode"] = Modes.ModeOf(deck),
        };
        var avatar = Account.Current?.Avatar;
        if (avatar != null) o["avatar"] = avatar;
        return o;
    }

    /// <summary>Step to another deck (in the lobby, the room hears of it, and you are no longer ready).</summary>
    public static void StepDeck(int step)
    {
        var decks = DeckChoices();
        int at = decks.FindIndex(d => d.Name == Deck().Name);
        DeckName = decks[((at + step) % decks.Count + decks.Count) % decks.Count].Name;
        Client?.Setup(JoinInfo());
        Change();
    }

    // ---- Into a room, and out ----

    /// <summary>Create a room (no code) or join one.</summary>
    public static void Go(string code = null)
    {
        Leave();
        var room = code ?? NewCode();
        Lobby = null;
        ResultExtra = "";
        Client = new Room(room, JoinInfo());
        Change();
    }

    public static void Leave()
    {
        ladder?.Close();
        ladder = null;
        Searching = false;
        Client?.Close();
        Client = null;
        Lobby = null;
        Status = "idle";
        RivalOnline = true;
        WaitFor = null;
        battle = null;
        Change();
    }

    public static void Ready()
    {
        bool mine = Lobby != null && You < Lobby.Count && Lobby[You].Ready;
        Client?.Send(new JObject { ["t"] = "ready", ["ready"] = !mine });
    }

    public static void Rematch() => Client?.Send(new JObject { ["t"] = "rematch" });

    public static void Retry() => Client?.Retry();

    // ---- In the game ----

    /// <summary>A move of yours: the room plays it and sends back the result.</summary>
    public static void Act(EngineAction a) => Client?.Send(new JObject { ["t"] = "action", ["action"] = JObject.Parse(Json.Write(a)) });

    /// <summary>The card of your hand under your pointer (by place; null: none), for your rival to see lift.</summary>
    public static void Hover(int? index) => Client?.Send(new JObject { ["t"] = "hover", ["i"] = index != null ? (JToken)index.Value : JValue.CreateNull() });

    /// <summary>You have read the card your rival just played: they may carry on.</summary>
    public static void Ack()
    {
        WaitFor = null;
        Client?.Send(new JObject { ["t"] = "ack" });
    }

    /// <summary>Concede (only ever for yourself), then leave once the word has gone.</summary>
    public static void ConcedeAndLeave(string playerId)
    {
        Act(new EngineAction { Type = "concede", PlayerId = playerId });
        Net.After(0.15f, () =>
        {
            Leave();
            App.Instance?.Menu("hub");
        });
    }

    /// <summary>Back to the menu from a game over (the room let go).</summary>
    public static void ToMenu()
    {
        Leave();
        App.Instance?.Menu("hub");
    }

    // ---- What the room says ----

    static void Hear(Room from, string raw)
    {
        if (from != Client) return;
        JObject msg;
        try { msg = JObject.Parse(raw); }
        catch { return; }
        switch ((string)msg["t"])
        {
            case "joined":
                Store.Set(TokenKey(from.Code), (string)msg["token"]);
                break;
            case "lobby":
                Lobby = msg["seats"]?.ToObject<List<LobbySeat>>(Newtonsoft.Json.JsonSerializer.Create(Json.Settings)) ?? new List<LobbySeat>();
                You = (int?)msg["you"] ?? 0;
                Ranked = (bool?)msg["ranked"] ?? false;
                WaitFor = null;
                // After a game ("play again"), both players come back to the lobby to confirm again.
                if (battle != null)
                {
                    battle = null;
                    App.Instance?.Menu("online");
                }
                Change();
                break;
            case "state":
            {
                var state = Json.Read<GameState>(msg["state"].ToString());
                var last = msg["last"] != null && msg["last"].Type != JTokenType.Null ? Json.Read<LastMove>(msg["last"].ToString()) : null;
                WaitFor = (string)msg["waitFor"];
                if (last?.Action?.Type == "playCard") LastPlayed = last.FaceDown == true ? null : last.Played;
                Ranked = (bool?)msg["ranked"] ?? false;
                var you = (string)msg["you"];
                // A new game (or this device's first sight of one): to the board.
                if (battle == null || battle.State == null || battle.State.Players.Select(p => p.Id).SequenceEqual(state.Players.Select(p => p.Id)) == false || (battle.State.WinnerId != null && state.WinnerId == null))
                {
                    ResultExtra = "";
                    battle = App.Instance?.OnlineBattle(state, you);
                }
                else battle.TakeRemote(state, last);
                Change();
                break;
            }
            case "ranked":
                // The ladder's word on a ranked game: what the server paid you, and where it left you.
                var paid = Account.PayoutOf(msg["reward"]);
                Account.RefreshEconomy(() =>
                {
                    ResultExtra = paid != null ? Account.RewardLine(paid) : "";
                    Change();
                });
                break;
            case "reward":
                // An unranked game: the server paid it into your account (or nothing).
                var reward = Account.PayoutOf(msg["reward"]);
                Account.RefreshEconomy(() =>
                {
                    ResultExtra = reward != null ? Account.RewardLine(reward) : "";
                    Change();
                });
                break;
            case "error":
                var message = (string)msg["message"] ?? "Something went wrong.";
                Sound.Play("error");
                Say(message);
                if (message.Contains("full")) Leave();
                break;
            case "rivalHover":
                // (The card of their hand your rival is hovering, by place: lifted out of their fan.)
                var hovered = msg["i"];
                battle?.SetRivalHover(hovered != null && hovered.Type == JTokenType.Integer ? (int)hovered : (int?)null);
                break;
            case "presence":
                bool on = (bool?)msg["rivalOnline"] ?? true;
                if (on == RivalOnline) break;
                RivalOnline = on;
                Change();
                break;
        }
    }

    static void SetStatus(string status)
    {
        Status = status;
        Change();
    }

    /// <summary>
    /// The connection to one room (online.ts OnlineClient): a WebSocket to /room/CODE that joins with your name and
    /// deck (and the seat's token, rejoining), pings to stay awake, and tries again, backing off, if it drops.
    /// </summary>
    public class Room
    {
        public readonly string Code;
        JObject join;
        NetSocket ws;
        bool closed;
        int retries;
        UnityEngine.Coroutine ping, again;

        public Room(string code, JObject join)
        {
            Code = code;
            this.join = join;
            Open();
        }

        void Open()
        {
            SetStatus("connecting");
            var url = Net.Socket($"/room/{Code}");
            if (url == null) { SetStatus("lost"); return; }
            var socket = new NetSocket(url);
            ws = socket;
            socket.Opened = () =>
            {
                retries = 0;
                SetStatus("open");
                var hello = (JObject)join.DeepClone();
                hello["t"] = "join";
                var token = Store.Get(TokenKey(Code));
                if (token != null) hello["token"] = token;
                Send(hello);
                Net.Cancel(ping);
                ping = Net.After(25, Ping);
            };
            socket.Received = raw => Hear(this, raw);
            socket.Closed = () =>
            {
                Net.Cancel(ping);
                ping = null;
                if (closed || socket != ws) return;
                // Try again, backing off, for about a minute; then say so (the player can retry).
                if (retries++ > 8) { SetStatus("lost"); return; }
                SetStatus("connecting");
                again = Net.After(System.Math.Min(8f, 0.5f * (1 << retries)), () => { if (!closed) Open(); });
            };
        }

        void Ping()
        {
            if (closed) return;
            Send(new JObject { ["t"] = "ping" });
            ping = Net.After(25, Ping);
        }

        public void Send(JObject msg) => ws?.Send(msg.ToString(Newtonsoft.Json.Formatting.None));

        /// <summary>In the lobby: a new name or deck (kept for rejoining too).</summary>
        public void Setup(JObject info)
        {
            join = info;
            var msg = (JObject)info.DeepClone();
            msg["t"] = "setup";
            Send(msg);
        }

        /// <summary>Reconnect now (after the connection was given up).</summary>
        public void Retry()
        {
            retries = 0;
            if (ws != null && ws.Open) return;
            Net.Cancel(again);
            ws?.Close();
            Open();
        }

        public void Close()
        {
            closed = true;
            Net.Cancel(ping);
            Net.Cancel(again);
            ws?.Close();
        }
    }

    // ---- The ranked ladder ----

    /// <summary>
    /// Queue for a ranked match (online.ts LadderClient): a WebSocket to /ladder; once a rival within a tier of you is
    /// found, both go to a room made for you. Ranked play keeps your rank on your account: sign in first.
    /// </summary>
    public static void FindRanked(System.Action signIn)
    {
        if (!Account.SignedIn) { signIn(); return; }
        if (!Net.Available) { Say("Ranked is unreachable"); return; }
        ladder?.Close();
        Searching = true;
        ladder = new Ladder(signIn);
        Change();
    }

    public static void CancelRanked()
    {
        ladder?.Close();
        ladder = null;
        Searching = false;
        Change();
    }

    class Ladder
    {
        readonly NetSocket ws;
        bool closed;

        public Ladder(System.Action signIn)
        {
            ws = new NetSocket(Net.Socket("/ladder"));
            ws.Opened = () => ws.Send(new JObject { ["t"] = "queue", ["id"] = Profile.Me.Id, ["name"] = (string)JoinInfo()["name"], ["mode"] = Modes.ModeOf(Deck()) }.ToString(Newtonsoft.Json.Formatting.None));
            ws.Received = raw =>
            {
                JObject msg;
                try { msg = JObject.Parse(raw); }
                catch { return; }
                switch ((string)msg["t"])
                {
                    case "signin":
                        CancelRanked();
                        signIn();
                        break;
                    case "queued":
                        Change();
                        break;
                    case "match":
                        // Matched: to the room made for the two of you.
                        Close();
                        ladder = null;
                        Searching = false;
                        Go((string)msg["room"]);
                        break;
                }
            };
            ws.Closed = () => { if (!closed) Lost(); };
        }

        void Lost()
        {
            ladder = null;
            Searching = false;
            Say("Ranked is unreachable");
            Change();
        }

        public void Close()
        {
            closed = true;
            ws?.Send("{\"t\":\"leave\"}");
            ws?.Close();
        }
    }
}
