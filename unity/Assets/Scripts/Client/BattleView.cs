using System.Collections;
using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// A battle, you against the AI, on the 3D board. Tap a card in your hand to pick it up: the slots it can go to light
/// up (and then what it can aim at); tap one. Tap one of your cards that can attack, then a rival card or their sun.
/// Tap your Hero for its abilities. The rival's days play out a move at a time.
/// </summary>
public partial class BattleView : MonoBehaviour
{
    public Camera Cam;
    public Board Board;
    public bool Autoplay;
    public float MoveDelay = 0.75f;
    GameState state;
    string you = "p1";
    bool busy;

    // What is being chosen: an attacker's target (a card from hand, or a Hero's ability: BattleView.Play's pending).
    string attacker;

    Canvas hud;
    RectTransform hint;
    Button endDay;
    TextMeshProUGUI toast, energyLabel;
    RectTransform energyDots, reactionPanel, heroPanel, overPanel, inspector;
    float pressAt = -1;
    Vector3 pressPos;
    float toastUntil;

    public GameState State => state;
    /// <summary>Which part of the day the phase track shows lit.</summary>
    public string Phase = "day";

    public static BattleView Make()
    {
        var cam = new GameObject("Camera").AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.93f, 0.93f, 0.91f);
        cam.nearClipPlane = 0.1f;
        cam.farClipPlane = 100;
        Frame(cam);
        var v = new GameObject("Battle").AddComponent<BattleView>();
        v.Cam = cam;
        v.Board = Board.Make(cam);
        v.BuildHud();
        return v;
    }

    /// <summary>
    /// The web's view of the table at the screen's size (styles.css .table-view: the board scaled to 0.82 and tipped
    /// 22° away, seen in a perspective of twice the page's height from an eye a quarter of the way down it): every
    /// point of the table lands on the web's pixel, on a phone as on a big screen (BoardLayout.Frame).
    /// </summary>
    public static void Frame(Camera cam)
    {
        // (A camera drawing to a texture, as the build's screenshots: laid out for the texture's size.)
        var tex = cam.targetTexture;
        BoardLayout.Target = tex != null ? new Vector2(tex.width, tex.height) : (Vector2?)null;
        BoardLayout.Current.Frame(cam);
    }

    /// <summary>The layout the screen was last laid out for (laid out again when it changes).</summary>
    BoardLayout laidOut;

    public void NewBattle(int seed, string myDeck = null, string theirDeck = null)
    {
        var decks = CardData.Decks.Where(d => d.Mixed != true).ToList();
        var mine = decks.FirstOrDefault(d => d.Name == myDeck) ?? decks[seed % decks.Count];
        var theirs = decks.FirstOrDefault(d => d.Name == theirDeck) ?? decks[(seed * 7 + 3) % decks.Count];
        if (theirs == mine) theirs = decks[(seed + 1) % decks.Count];
        // (As the web's quickplay: you under your profile's name, the AI under a bot's name picked at random.)
        string myName = string.IsNullOrEmpty(Profile.Me?.Name) ? "Commander" : Profile.Me.Name;
        string botName = BotNames[(seed * 13 + 5) % BotNames.Length];
        state = Game.Create(new GameSetup
        {
            Seed = seed,
            Mode = mine.Mode,
            Players = new List<PlayerSetup>
            {
                new PlayerSetup { Name = myName, IsAI = Autoplay, Deck = mine.Cards, DeckName = mine.Name },
                new PlayerSetup { Name = botName, IsAI = true, Deck = theirs.Cards, DeckName = theirs.Name },
            },
        });
        Board.Viewer = you;
        Clear();
        Refresh();
        Sound.Scene("battle");
        // (The opening hand: shuffled, then dealt in from the deck: app.ts begin, dealOpening.)
        Board.DealOpening(state);
        DawnBanner(state, 0.4f);
    }

    /// <summary>The names the AI plays under in quickplay (app.ts BOT_NAMES).</summary>
    static readonly string[] BotNames = { "Unit Parhelion", "Kepler-9", "Null Vector", "Coronabot", "Tycho Engine", "Sentinel K4", "Orrery", "Halo Mk II", "Lagrange", "Umbra-7", "Perihelion", "Quasar Drone", "Brightwire", "Heliostat", "Ember Logic", "Cold Fusion" };

    CampaignView campaignOf;

    /// <summary>A battle of the campaign's: fought as any other, its end handed back to the run.</summary>
    public void LoadCampaign(GameState game, CampaignView from)
    {
        campaignOf = from;
        Load(game);
        Sound.Scene(game.Players.Any(p => p.Boss != null) ? "boss" : "battle");
        // Kaelen's crystal: he begs to be freed, and the Captain answers.
        if (game.Challenge?.Kind == "crystal" && game.TurnNumber <= 1 && Application.isPlaying)
        {
            var crystal = game.Players[1].Tableau.FirstOrDefault()?.Uid;
            var captain = game.Players[0].Id;
            Voices.Converse(this, refLayer,
                ("Captain? Is that you? Break it, please. I can’t hold on much longer.", () => crystal != null && Board.View(crystal) != null ? CaptionAt(Board.View(crystal).transform.position, 0.7f) : null),
                ("Hold on, Kaelen. I’m getting you out.", () => Board.SunOf(captain) != null ? CaptionAt(Board.SunOf(captain).transform.position, 0.5f * Board.SunScale) : null));
        }
    }

    void BackToCampaign() => App.Instance.EndCampaignBattle(this, state, campaignOf);

    /// <summary>Show a battle as it stands (a state set up elsewhere: a lesson, a puzzle, a picture).</summary>
    public void Load(GameState s)
    {
        state = s;
        Board.Viewer = you;
        Clear();
        Refresh();
        // (A match against an Overlord, or a challenge with one, gets the boss track.)
        Sound.Scene(s.Players.Any(p => p.Boss != null) ? "boss" : "battle");
        scoreLeft = false;
        // (The opening hand: shuffled, then dealt in from the deck: app.ts begin, dealOpening.)
        Board.DealOpening(state);
        DawnBanner(state, 0.4f);
    }

    /// <summary>Whether the match's score has given way to the voyage, the game being over (app.ts render's inPlay).</summary>
    bool scoreLeft;

    // ---- The loop ----

    void Update()
    {
        if (!scoreLeft && state?.WinnerId != null && Application.isPlaying) { scoreLeft = true; Sound.Scene("voyage"); }
        if (FitScreen() && state != null) Refresh();
        if (toast != null) toast.gameObject.SetActive(Time.time < toastUntil);
        if (state == null || state.WinnerId != null) return;
        StageTick();
        DreamTick();
        if (!Autoplay) EndDayTick();
        if (!busy && StageClear && AiToMove()) StartCoroutine(AiMove());
        // (Skip all: a reply waiting on you is let pass.)
        if (!busy && confirmMode == "skip" && state.Reaction != null && state.Reaction.PlayerId == you && !online) StartCoroutine(PassReply());
        if (Autoplay) return;
        // (A touch screen has no hover: a first tap on the hand raises it, a tap away lowers it, as the web's.)
        if (Input.touchCount > 0) touch = true;
        var page = Page(Input.mousePosition);
        // With a mouse, the pointer over your hand raises it to be read whole, and lifts the card under it; off the
        // hand's column (or over the screen's own layer), it lowers.
        if (!touch && !Dragging)
        {
            bool up = Board.HandUp ? Board.InHandColumn(page) : Board.InHandColumn(page) && !OverHud();
            up &= !inspector.gameObject.activeSelf && sheet == null && Time.time >= Board.DealtAt;
            string over = up ? HandCardAt(Input.mousePosition) : null;
            if (up != Board.HandUp || over != Board.HandHover) RaiseHand(up, over);
        }
        // A tap acts; a press held on a touch screen (or a right click) reads the card under it, large (as the web's
        // onPressStart, never for a mouse).
        if (Input.GetMouseButtonDown(1) && !OverHud()) Inspect();
        if (Input.GetMouseButtonDown(0) && !OverHud())
        {
            pressAt = Time.time;
            pressPos = Input.mousePosition;
            DragPress();
        }
        if (Dragging && Input.GetMouseButton(0)) DragMove();
        if (Dragging && Input.GetMouseButtonUp(0)) DragRelease();
        if (pressAt >= 0 && touch && !Dragging && Input.GetMouseButton(0) && Time.time - pressAt > 0.45f && (Input.mousePosition - pressPos).magnitude < 12 * Css.PixelRatio)
        {
            pressAt = -1;
            Inspect();
        }
        if (pressAt >= 0 && Input.GetMouseButtonUp(0))
        {
            pressAt = -1;
            if (inspector.gameObject.activeSelf) inspector.gameObject.SetActive(false);
            else if (touch && !Board.HandUp && HandCardAt(Input.mousePosition) != null) RaiseHand(true, null);
            else
            {
                if (touch && Board.HandUp && !Board.InHandColumn(page)) RaiseHand(false, null);
                Tap();
            }
        }
    }

    /// <summary>
    /// The screen changed size (a phone turned, a window dragged): the table, the hand and the HUD laid out again as the
    /// web lays them out at the new size. Whether it had.
    /// </summary>
    bool FitScreen()
    {
        if (Cam == null || hud == null) return false;
        var tex = Cam.targetTexture;
        var want = tex != null ? new Vector2(tex.width, tex.height) : (Vector2?)null;
        if (BoardLayout.Target != want) Frame(Cam);
        if (laidOut == BoardLayout.Current) return false;
        laidOut = BoardLayout.Current;
        Frame(Cam);
        Board.Relayout();
        LayoutHud();
        return true;
    }

    /// <summary>Whether a touch screen is in use (seen touched).</summary>
    bool touch;

    /// <summary>A point on the screen (in screen pixels, y up) as a point of the web's page (layout pixels, y down).</summary>
    static Vector2 Page(Vector3 screen)
    {
        float k = Css.PixelRatio * Css.Zoom;
        return new Vector2(screen.x / k, (Screen.height - screen.y) / k);
    }

    /// <summary>The card in your hand under a point of the screen, if any.</summary>
    string HandCardAt(Vector3 screen)
    {
        if (!Physics.Raycast(Cam.ScreenPointToRay(screen), out var hit, 100)) return null;
        var v = hit.collider.GetComponentInParent<CardView>();
        return v != null && !v.Table && state != null && Me.Hand.Any(c => c.Uid == v.Uid) ? v.Uid : null;
    }

    /// <summary>The hand raised to be read whole, or lowered (app.ts raiseHand), and the card lifted under the pointer.</summary>
    void RaiseHand(bool up, string over)
    {
        if (up && !Board.HandUp) Sound.Play("hand-lift");
        Board.HandUp = up;
        Board.HandHover = over;
        if (state != null) Board.Sync(state, this);
    }

    bool AiToMove()
    {
        if (state.Reaction != null) return Player(state.Reaction.PlayerId).IsAI || Autoplay;
        return Game.ActivePlayer(state).IsAI || Autoplay;
    }

    bool HumanDawnChoice() => state.Reaction == null && Game.ActivePlayer(state).Id == you && (Game.ActivePlayer(state).DawnChoices?.Count ?? 0) > 0;

    IEnumerator PassReply()
    {
        busy = true;
        var s = state;
        yield return new WaitForSeconds(0.25f);
        busy = false;
        if (state == s && confirmMode == "skip") Do(new EngineAction { Type = "react" });
    }

    IEnumerator AiMove()
    {
        busy = true;
        yield return new WaitForSeconds(Delay);
        Step();
        busy = false;
    }

    /// <summary>One move by the AI for whoever is to move.</summary>
    public void Step()
    {
        if (state.WinnerId != null) return;
        try
        {
            var a = HumanDawnChoice() ? AI.DawnChoiceFor(state) : AI.Choose(state);
            Commit(a);
        }
        catch (System.Exception e)
        {
            Debug.LogError(e);
        }
        Refresh();
    }

    PlayerState Player(string id) => state.Players.First(p => p.Id == id);
    PlayerState Me => Player(you);
    PlayerState Rival => state.Players.First(p => p.Id != you);
    bool MyDay => state.Reaction == null && Game.ActivePlayer(state).Id == you && state.WinnerId == null && !Autoplay && !OnlineHeld;

    void Do(EngineAction a)
    {
        if (LessonBlocks(a)) return;
        // (Online, the room plays it and sends back the result: BattleView.Online.)
        if (online)
        {
            Send(a);
            dawnPick = null;
            discarding = null;
            Clear();
            Refresh();
            return;
        }
        try
        {
            Commit(a);
        }
        catch (GameError e)
        {
            Say(e.Message);
            Sound.Play("error");
        }
        dawnPick = null;
        discarding = null;
        Clear();
        Refresh();
    }

    void Clear()
    {
        pending = null;
        attacker = null;
        if (heroPanel != null) heroPanel.gameObject.SetActive(false);
    }

    void Say(string text, bool fresh = true)
    {
        toast.text = text;
        // (app.ts TOAST_MS: 2.6 s.)
        if (fresh) toastUntil = Time.time + 2.6f;
        // (As wide as its words, at most min(440px, 100vw − 32px), padded 7 × 16 px; its lines 1.35 apart.)
        var box = (RectTransform)toast.transform.parent;
        float most = Mathf.Min(440, BoardLayout.Current.W - 32);
        toast.textWrappingMode = TextWrappingModes.NoWrap;
        float w = Mathf.Min(most, toast.GetPreferredValues(text).x + 32 + 2);
        toast.textWrappingMode = TextWrappingModes.Normal;
        float h = toast.GetPreferredValues(text, w - 34, 0).y * 1.1f + 14 + 2;
        box.sizeDelta = new Vector2(w, h);
    }

    // ---- Settings and leaving (the web's settings and quit sheets) ----

    RectTransform sheet;
    static readonly string[] Speeds = { "slow", "normal", "fast" };
    static readonly float[] SpeedFactor = { 1.7f, 1, 0.4f };
    const string SpeedKey = "blue-loop:ai-speed", SaveKey = "blue-loop:save:v4";

    public static string Speed => System.Array.IndexOf(Speeds, Store.Get(SpeedKey)) >= 0 ? Store.Get(SpeedKey) : "normal";
    public static void NextSpeed() => Store.Set(SpeedKey, Speeds[(System.Array.IndexOf(Speeds, Speed) + 1) % 3]);
    float Delay => 0.75f * SpeedFactor[System.Array.IndexOf(Speeds, Speed)];

    void CloseSheet()
    {
        if (sheet != null) Mats.Kill(sheet.gameObject);
        sheet = null;
    }

    void Settings()
    {
        CloseSheet();
        bool over = state == null || state.WinnerId != null;
        sheet = Hud.Sheet(Layer, "settings", new[]
        {
            new Hud.Row("sound", () => { Sound.Muted = !Sound.Muted; Settings(); }, Sound.Muted ? "off" : "on"),
            new Hud.Row("music", Sound.Muted ? (System.Action)null : () => { Sound.MusicOn = !Sound.MusicOn; Settings(); }, Sound.MusicOn && !Sound.Muted ? "on" : "off"),
            new Hud.Row("ai speed", () => { Store.Set(SpeedKey, Speeds[(System.Array.IndexOf(Speeds, Speed) + 1) % 3]); Settings(); }, Speed),
            over ? new Hud.Row("main menu", () => { if (online) Online.ToMenu(); else App.Instance?.Menu("hub"); }) : new Hud.Row("quit game", Quit),
        }, CloseSheet);
    }

    void Quit()
    {
        CloseSheet();
        if (online) { OnlineQuit(); return; }
        // (A battle of the run's: retreat, which loses it.)
        if (campaignOf != null)
        {
            sheet = Hud.Sheet(Layer, "quit game", new[] { new Hud.Row("retreat", () => { CloseSheet(); state = Game.Apply(state, new EngineAction { Type = "concede", PlayerId = you }); BackToCampaign(); }, null, true), new Hud.Row("keep playing", CloseSheet) }, CloseSheet);
            return;
        }
        // (A lesson or a challenge is quick to begin again: only leave.)
        if (puzzleKind != null)
        {
            sheet = Hud.Sheet(Layer, "quit game", new[] { new Hud.Row("leave", LeavePuzzle, null, true), new Hud.Row("keep playing", CloseSheet) }, CloseSheet);
            return;
        }
        sheet = Hud.Sheet(Layer, "quit game", new[]
        {
            new Hud.Row("save and leave", () => { Persist(); App.Instance?.Menu("hub"); }, null, true),
            new Hud.Row("concede", () => { CloseSheet(); Do(new EngineAction { Type = "concede", PlayerId = you }); }),
            new Hud.Row("keep playing", CloseSheet),
        }, CloseSheet);
    }

    /// <summary>Autosave (storage.ts): a game in play kept to continue later; a finished one let go.</summary>
    void Persist()
    {
        if (state == null || Autoplay || !Application.isPlaying || puzzleKind != null || campaignOf != null || online) return;
        if (state.WinnerId != null) Store.Remove(SaveKey);
        else Store.Write(SaveKey, state);
    }

    public static bool HasSave => Store.Get(SaveKey) != null;

    /// <summary>The saved game, to continue (none, or one that no longer reads: null).</summary>
    public static GameState Saved()
    {
        try { return Store.Read<GameState>(SaveKey); }
        catch { return null; }
    }

    // ---- What a move sounds like (app.ts: the same sounds for the same changes) ----

    /// <summary>This move's dawn is being replayed effect by effect.</summary>
    bool replaying;

    void Hear(GameState prev, GameState next, EngineAction a)
    {
        if (!Application.isPlaying) return;
        var actor = Game.ActivePlayer(prev);
        bool ending = a.Type == "endTurn";
        var source = ending ? Game.ActivePlayer(next) : actor;
        float delay = ending ? 0.75f : actor.IsAI ? 0.52f : 0.16f;
        PlayerState Was(PlayerState p) => prev.Players.First(x => x.Id == p.Id);
        // A sun struck, cooled or shielded: heat taken (yours, by them: hurt; theirs: strike), cooling, shields lost or raised.
        // Where heat is loosed from: the card played (still where it was), or the striking sun.
        var origin = (a.CardUid != null ? Board.WorldOf(a.CardUid) : null) ?? Board.SunOf(source.Id)?.transform.position ?? Vector3.zero;
        // (When each sun's blow lands: a supernova goes off then.)
        var hitAt = new Dictionary<string, float>();
        void Hit(PlayerState p, float at, bool byEnemy)
        {
            var w = Was(p);
            int dHeat = p.Heat - w.Heat;
            var sunView = Board.SunOf(p.Id);
            int lost = byEnemy ? Mathf.Max(0, w.Shields - p.Shields) : 0;
            int gained = Mathf.Max(0, p.Shields - w.Shields);
            // As it lands: heat taken (red, rising) or cooled (blue) over the sun, shields lost or raised beside it;
            // your own edges burning if it was you a rival struck.
            var who = p.Id;
            void Land()
            {
                var r = SunRect(who);
                if (r != null)
                {
                    if (dHeat != 0) FloatNumber(r.Value, dHeat > 0 ? $"+{dHeat}" : $"−{-dHeat}", dHeat > 0 ? "hot" : "cool", 0);
                    if (lost > 0) FloatNumber(r.Value, $"⬡−{lost}", "block", dHeat != 0 ? 1 : 0);
                    else if (gained > 0) FloatNumber(r.Value, $"⬡+{gained}", "block", dHeat != 0 ? 1 : 0);
                }
                if (dHeat > 0 && who == you && byEnemy) HurtFlash();
            }
            bool flown = false;
            if (sunView != null && (dHeat != 0 || p.Shields != w.Shields))
            {
                if (byEnemy && a.Type != "attack" && dHeat > 0)
                {
                    // (Heat flies from the card played, or the striking sun, to the sun it strikes: fx.ts projectile.)
                    var fromRect = (a.CardUid != null ? CardRect(a.CardUid) : null) ?? SunRect(source.Id);
                    var pid = p.Id;
                    if (fromRect != null)
                    {
                        flown = true;
                        StartCoroutine(Projectile(fromRect.Value, () => SunRect(pid) ?? fromRect.Value, Hot, Mathf.Max(0, at - 0.4f), 34, 0.62f, () => { sunView.Pulse(true); Land(); }));
                    }
                    else sunView.Pulse(true, at);
                }
                else sunView.Pulse(dHeat >= 0, a.Type == "attack" ? 0.15f : at);
            }
            if (!flown) StartCoroutine(After(at, Land));
            if (!hitAt.ContainsKey(p.Id)) hitAt[p.Id] = flown ? Mathf.Max(0, at - 0.4f) + 0.62f : at;
            // (Until then, the sun keeps showing its old heat and shields: those only, as the web's holdUntil swaps its
            // vitals; its planets move on as they do, or they would sweep there, back and there again.)
            if (dHeat != 0 || p.Shields != w.Shields || p.Eliminated != w.Eliminated) Board?.HoldSun(p.Id, next, WithSun(p, new SunAt { Heat = w.Heat, Shields = w.Shields, Eliminated = w.Eliminated }), flown ? Mathf.Max(0, at - 0.4f) + 0.62f : at);
            if (dHeat > 0)
            {
                // (Yours, by them: as the blow lands, as the web's.)
                if (p.Id == you && byEnemy) Sound.Play($"hurt-{Mathf.Clamp(dHeat, 1, 5)}", at);
                else if (byEnemy) Sound.Play($"strike-{Mathf.Clamp(dHeat, 1, 5)}", at);
                else Sound.Play("impact-hot", at);
            }
            else if (dHeat < 0) Sound.Play("impact-cold", at);
            if (lost > 0) Sound.Play("block", at);
            else if (gained > 0 && dHeat == 0) Sound.Play("shield", at);
        }
        int volley = 0;
        // (A day's start that replays its effects one by one shows its hits itself.)
        foreach (var p in replaying ? new List<PlayerState>() : next.Players)
        {
            if (p.Id == source.Id) continue;
            var w = Was(p);
            bool struck = p.Heat > w.Heat || (p.Shields < w.Shields && !(ending && p.Id == actor.Id)) || (p.Eliminated && !w.Eliminated);
            if (!struck) continue;
            if (a.Type == "attack") { Hit(p, 0, true); continue; }
            Hit(p, delay + 0.11f * volley++ + 0.4f, true);
        }
        if (volley > 0) Sound.Play("launch", delay);
        var me = next.Players.First(p => p.Id == source.Id);
        var meWas = Was(me);
        if (!replaying && (me.Heat != meWas.Heat || me.Shields > meWas.Shields))
        {
            Hit(me, delay, false);
            if (me.Heat < meWas.Heat) Sound.Play("thermo", delay);
        }
        switch (a.Type)
        {
            case "playCard":
                // (A rival's card already sounded as it arrived on the stage: app.ts entranceHeard.)
                if (!entranceHeard) Sound.Play("play");
                entranceHeard = false;
                var played = actor.Hand.FirstOrDefault(c => c.Uid == a.CardUid);
                if (played != null && Cards.Def(played.DefId).Kind == "command")
                {
                    Sound.Play("hero", Mathf.Max(0, delay - 0.3f));
                    StartCoroutine(SpeakLater(played.DefId, played.Uid, delay + 0.25f));
                }
                break;
            case "endTurn":
                Sound.Play("end-turn");
                if (Game.ActivePlayer(next).Id == you) Sound.Play("turn", 0.6f);
                break;
            case "attack":
                // (The attacker struck already, and the blow lands now: app.ts lunge.) A card struck shudders and flares.
                bool struck = struckBy == a.AttackerUid;
                struckBy = null;
                if (!struck)
                {
                    Sound.Play("swing");
                    var target = a.TargetUid != null ? Board.WorldOf(a.TargetUid) : Board.SunOf(next.Players.FirstOrDefault(p => p.Id != actor.Id)?.Id ?? "")?.transform.position;
                    if (target != null) Board.View(a.AttackerUid)?.Lunge(target.Value);
                }
                if (a.TargetUid != null)
                {
                    Board.View(a.TargetUid)?.Shake(struck ? 0 : 0.15f);
                    Board.View(a.TargetUid)?.Flash(true, struck ? 0 : 0.15f, 0.42f, 0.9f);
                    CardBlow(prev, next, a.TargetUid);
                }
                break;
        }
        // (Cards drawn into your hand sound as each is dealt in from the deck: Board.Arrive, app.ts dealCard.)
        var mine = next.Players.First(p => p.Id == you);
        // Supernovas not shown by a dawn replay go off as the blow that caused them lands.
        if (!replaying)
            foreach (var p in next.Players)
                if (p.Eliminated && !Was(p).Eliminated) SupernovaAt(next, p.Id, hitAt.TryGetValue(p.Id, out var h) ? h : 0.6f);
        // (Your deck run out: its pile rocks.)
        if (mine.Deck.Count == 0 && Was(mine).Deck.Count > 0) Board?.ShuffleDeck();
    }

    /// <summary>
    /// Where a caption stands for a thing on the board (on the overlay layer): over it, or under it when it sits at the
    /// top of the screen (voice.ts showCaption).
    /// </summary>
    (Vector2 at, bool below)? CaptionAt(Vector3 world, float halfDepth)
    {
        var screen = Cam.WorldToScreenPoint(world + new Vector3(0, 0, halfDepth));
        bool below = screen.y > Screen.height * 0.93f;
        if (below) screen = Cam.WorldToScreenPoint(world - new Vector3(0, 0, halfDepth));
        return RectTransformUtility.ScreenPointToLocalPointInRectangle(refLayer, screen, hudCam, out var at) ? (at, below) : ((Vector2, bool)?)null;
    }

    /// <summary>A Hero's line as it lands: a caption over its card on the board.</summary>
    IEnumerator SpeakLater(string defId, string uid, float after)
    {
        yield return new WaitForSeconds(after);
        var v = Board.View(uid);
        if (v == null || hud == null) yield break;
        var canvas = refLayer;
        var screen = Cam.WorldToScreenPoint(v.transform.position + new Vector3(0, 0, 0.7f));
        bool below = screen.y > Screen.height * 0.93f;
        if (below) screen = Cam.WorldToScreenPoint(v.transform.position - new Vector3(0, 0, 0.7f));
        if (RectTransformUtility.ScreenPointToLocalPointInRectangle(canvas, screen, hudCam, out var at)) Voices.Speak(defId, canvas, at, below);
    }

    /// <summary>A blow on a card: its defence cracking if the blow wore it, and the crunch of what got through.</summary>
    static void CardBlow(GameState prev, GameState next, string uid)
    {
        CardInstance Find(GameState st) => st.Players.SelectMany(p => p.Tableau).FirstOrDefault(c => c.Uid == uid);
        var was = Find(prev);
        var now = Find(next);
        if (was == null) return;
        if ((now?.Dented ?? 0) > (was.Dented ?? 0)) Sound.Play("crack");
        int lost = (was.Health ?? 0) - (now != null ? now.Health ?? 0 : 0);
        if (lost > 0 || now == null || (now.Dented ?? 0) <= (was.Dented ?? 0)) Sound.Play("clash", Mathf.Max(1, lost));
    }

    // ---- Taps on the board ----

    bool OverHud() => UnityEngine.EventSystems.EventSystem.current != null && UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject();

    void Tap()
    {
        // (Just after the stage's OK, or while a rival's card waits on it to be read, the board takes no taps.)
        if (Time.time < clickShieldUntil || (stage != null && stage.Confirm)) return;
        if (!Physics.Raycast(Cam.ScreenPointToRay(Input.mousePosition), out var hit, 100)) { Click(null, null); Refresh(); return; }
        var card = hit.collider.GetComponentInParent<CardView>();
        var slot = hit.collider.GetComponent<SlotTag>();
        var sun = hit.collider.GetComponentInParent<SunTag>();
        if (card != null) TapCard(card.Uid);
        else if (slot != null) TapSlot(slot);
        else if (sun != null) TapSun(sun.PlayerId);
        else Click(null, null);
        Refresh();
    }

    /// <summary>A card tapped: what it does now (BattleView.Play CardAct).</summary>
    void TapCard(string uid)
    {
        if (state == null) return;
        var (owner, c, hand) = Find(uid);
        if (c == null) { Click(null, null); return; }
        var (act, arg, _) = CardAct(owner, c, hand);
        Click(act, arg);
    }

    void TapSlot(SlotTag slot)
    {
        if (state == null) return;
        var (act, arg) = SlotAct(slot.Mine, slot.Slot);
        Click(act, arg);
    }

    void TapSun(string playerId)
    {
        if (state == null) return;
        var (act, arg) = SunAct(playerId);
        Click(act, arg);
    }

    // ---- Dusk: over the hand limit, the cards to let go ----

    List<string> discarding;
    int Over => Me.Hand.Count - Game.MaxHand(Me);

    /// <summary>End your day; holding more than you may, first choose what goes (a second End Day lets it go).</summary>
    void EndDay()
    {
        if (!MyDay || Dawn != null) return;
        if (Over > 0 && discarding == null)
        {
            Clear();
            discarding = new List<string>();
            Refresh();
            return;
        }
        Do(new EngineAction { Type = "endTurn", Discard = discarding?.ToList() });
    }

    // ---- Dawn: a choice waiting first thing in your day (a Recall, a Shift, what an ability or relic leaves) ----

    /// <summary>The choice waiting on you now, if any.</summary>
    DawnChoice Dawn => state != null && state.WinnerId == null && !Autoplay && HumanDawnChoice() ? Game.ActivePlayer(state).DawnChoices[0] : null;
    string dawnPick;

    /// <summary>What the dawn choice asks, in a word or two (the web's mid-board hint).</summary>
    string DawnAsk(DawnChoice d)
    {
        int n = d.Amount ?? 1;
        switch (d.Kind)
        {
            case "recall": return d.Relic != null ? "recall a card to hand" : "dawn recall: return a card to hand";
            case "discount": return $"−{n} cost: choose a card in hand";
            case "empower": return $"+{n} attack: choose a card";
            case "renew": return $"+{n} stability: choose a card";
            case "ward": return $"{n} shields: choose a card";
            case "freeze": return "freeze a rival card";
            case "displace": return dawnPick != null ? "where it moves" : "move a rival card";
            case "aim": return $"{(d.Relic != null ? d.Relic.ToLowerInvariant() + ": " : "")}{d.Amount ?? 0} heat, pick a target";
            default: return dawnPick != null ? "dawn shift: where it moves" : "dawn shift: move a card";
        }
    }

    /// <summary>
    /// What the board waits on you for (the web's .mid-hint, lying on the board's middle, over the flower): the words in
    /// a white pill, spaced capitals clamp(0.8rem, 3.6vh, 1.5rem), and under it the ways out (.mid-cancel), white pills
    /// side by side; drawn where the board's middle is drawn, at the board's size there.
    /// </summary>
    void MidHint(string text, params (string label, System.Action act)[] buttons)
    {
        var l = BoardLayout.Current;
        hint.gameObject.SetActive(true);
        PlaceHint();
        float f = Css.Clamp(12.8f, 3.6f * l.Vh, 24), ph = f * 1.2f + 12;
        float f2 = Css.Clamp(9.6f, 2.2f * l.Vh, 12.8f), bh = f2 * 1.2f + 14 + 2;
        float total = ph + (buttons.Length > 0 ? 8 + bh : 0);
        var pill = Hud.Box(hint, "Words", new Color(1, 1, 1, 0.86f), ph / 2);
        Hud.Shadow(pill, ph / 2, new Hud.Drop(Color.white, 0, 0, 1), new Hud.Drop(Hud.Rgba(70, 76, 100, 0.14f), 6, 18));
        var words = Hud.Label(pill.transform, text.ToUpperInvariant(), f, Look.Ink, true, 500, 32);
        float w = words.GetPreferredValues(words.text).x + 2 * 18;
        Hud.At(pill.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0, total / 2 - ph / 2), new Vector2(w, ph));
        float x = 0, gap = 8;
        var made = new List<(RectTransform, float)>();
        foreach (var (label, act) in buttons)
        {
            // (A white pill with a faint 1 px edge and a soft shadow; its word 600 weight, drawn bold.)
            var b = Hud.Box(hint, label, Hud.Rgba(120, 126, 150, 0.35f), bh / 2);
            b.raycastTarget = true;
            Hud.Shadow(b, bh / 2, new Hud.Drop(Hud.Rgba(70, 76, 100, 0.18f), 4, 14));
            var face = Hud.Box(b.transform, "Face", Color.white, bh / 2 - 1);
            Hud.Fill(face.rectTransform);
            face.rectTransform.offsetMin = new Vector2(1, 1);
            face.rectTransform.offsetMax = new Vector2(-1, -1);
            var bl = Hud.Label(b.transform, label.ToUpperInvariant(), f2, Look.Ink, true, 700, 20);
            float bw = bl.GetPreferredValues(bl.text).x + 2 * 18 + 2;
            var btn = b.gameObject.AddComponent<Button>();
            btn.onClick.AddListener(() => { Sound.Play("click"); act(); });
            made.Add((b.rectTransform, bw));
            x += bw + gap;
        }
        float at = -(x - gap) / 2;
        foreach (var (r, bw) in made)
        {
            Hud.At(r, new Vector2(0.5f, 0.5f), new Vector2(at + bw / 2, -total / 2 + bh / 2), new Vector2(bw, bh));
            at += bw + gap;
        }
    }

    /// <summary>The mid-board hint put over the board's middle as drawn (30 px up off it), at the board's scale there.</summary>
    void PlaceHint()
    {
        var l = BoardLayout.Current;
        var t = Board.transform;
        var mid = t.TransformPoint(new Vector3(0, l.U(30), 0));
        var a = Cam.WorldToScreenPoint(mid);
        var e = Cam.WorldToScreenPoint(mid + t.TransformVector(Vector3.right));
        float k = Css.PixelRatio * Css.Zoom;
        float scale = (e - a).magnitude / k / l.Tcw;
        hint.anchorMin = hint.anchorMax = new Vector2(0, 1);
        hint.pivot = new Vector2(0.5f, 0.5f);
        hint.sizeDelta = Vector2.zero;
        hint.anchoredPosition = new Vector2(a.x / k, -(Screen.height - a.y) / k);
        hint.localScale = Vector3.one * scale;
    }

    /// <summary>What the board waits on you for, in its middle (app.ts renderMidHint).</summary>
    void ShowHint()
    {
        foreach (Transform c in hint) Mats.Kill(c.gameObject);
        hint.gameObject.SetActive(false);
        if (state.WinnerId != null) return;
        var d = Dawn;
        // Over the hand limit at the day's end: pick the cards to discard in the hand, then End Day.
        if (discarding != null && pending == null)
        {
            int left = Over - discarding.Count;
            MidHint(left > 0 ? $"discard {left} card{(left == 1 ? "" : "s")}" : "end day to discard", ("keep playing", () => { discarding = null; Refresh(); }));
            return;
        }
        if (d != null)
        {
            // Skip (or, aiming heat, their sun: it has to go somewhere); moving a card, back.
            System.Action skip = () => Act("dawn-shift-skip", null);
            if (d.Kind == "aim") MidHint(DawnAsk(d), ("their sun", () => Act("dawn-aim-sun", null)));
            else if (dawnPick != null) MidHint(DawnAsk(d), ("back", () => Act("dawn-shift-back", null)), ("skip", skip));
            else MidHint(DawnAsk(d), ("skip", skip));
            return;
        }
        dawnPick = null;
        if (pending == null && attacker == null)
        {
            // A dream: its goal, and the time left to reach it.
            if (puzzleKind == null && state.Challenge?.Kind == "dream")
            {
                DreamHint();
                return;
            }
            // A challenge's clock (the mine's count too), with nothing acting next. (Against a Lost Overlord or Lord, the
            // card that acts next burns on the board: that says enough.)
            var lord = state.Players.FirstOrDefault(x => x.Boss != null && !x.Eliminated);
            var ch = state.Challenge;
            string clock = ch?.Days != null ? $"{ch.Days} day{(ch.Days == 1 ? "" : "s")} left{(ch.Kind == "mine" ? $" · {ch.Broken} broken" : "")}" : "";
            if (lord != null && Game.BossIntent(lord) == null && clock != "")
                BossHint(lord.Name, ch.Kind == "mine" ? "break the crystals" : ch.Kind == "crystal" ? "break the crystal" : "hold the line", clock);
            return;
        }
        // A card picked, a Hero's ability or an attacker readied: what to choose next, and a way back out.
        var ask = PendingAsk();
        if (ask != null) MidHint(ask, ("cancel", () => Act("cancel", null)));
    }

    // ---- What the board shows of the choosing ----

    /// <summary>
    /// A card's rim for what is being chosen (app.ts renderCard's state): one that can be chosen ringed coral
    /// (.card-choosable), the one picked blue (.card-picked), one that can attack faintly red (.card-attacker), the one
    /// aiming red (.card-aiming); in the hand, one to discard, and one that can be played (.card-playable).
    /// </summary>
    public void Dress(CardView v, PlayerState owner, CardInstance c, bool inPlay)
    {
        if (DragRim(v, c)) return;
        Color? rim = null;
        float strength = 1;
        if (!inPlay && discarding != null)
        {
            if (discarding.Contains(c.Uid)) rim = Look.Danger;
            else if (discarding.Count < Over) { rim = Look.Danger; strength = 0.35f; }
            v.Rim(rim, strength);
            return;
        }
        string look = state != null && state.WinnerId == null && (inPlay ? owner.Tableau.Contains(c) : owner.Hand.Contains(c)) ? CardAct(owner, c, !inPlay).look : null;
        switch (look)
        {
            case "choosable": rim = Look.Aim; break;
            case "picked": rim = Look.Pick; break;
            case "attacker": rim = Look.Aim; strength = 0.45f; break;
            case "aiming": rim = Look.Aim; strength = 1.15f; break;
        }
        // ...and a card in hand that can be played now has a faint green rim.
        if (!inPlay && look == null && MyDay && owner.Id == you && Game.HandCost(c, owner) <= owner.PlaysLeft && CanPlayNow(owner, c.DefId, c.Discount ?? 0)) { rim = Look.Good; strength = 0.6f; }
        v.Rim(rim, strength);
    }

    /// <summary>How far a card in hand is held up (a picked card, most).</summary>
    public float HandLift(CardInstance c) => c.Uid == picked || (discarding?.Contains(c.Uid) ?? false) ? 1f : 0;

    /// <summary>The card under the pointer, read large: its face, and in play what stands on it now.</summary>
    // ---- The screen's own layer ----

    /// <summary>A rounded image's corners at `radius` canvas units (Hud.Rounded's own are 22).</summary>
    static Image Corners(Image img, float radius)
    {
        img.pixelsPerUnitMultiplier = 22f / Mathf.Max(0.5f, radius);
        return img;
    }

    /// <summary>The .btn-primary's face, white shading to #eeeff1.</summary>
    static Texture2D buttonShade;

    /// <summary>
    /// The web's .btn-primary (End Day, a result's way on): white shading to #eeeff1, a white hairline inside a faint
    /// ring, corners of `radius`, a soft shadow; its words bold spaced capitals. Disabled, the whole of it fades to 0.4.
    /// (In the units of the canvas it is on: `ring` the ring's width.)
    /// </summary>
    static Button WhiteButton(Transform parent, string text, System.Action onClick, float size, float radius = 14.5f, float ring = 1.5f)
    {
        var img = Hud.Box(parent, text, new Color(0.975f, 0.976f, 0.98f), radius);
        img.raycastTarget = true;
        // (Its shadow, 0 6px 20px, in the canvas's units: `ring` is a CSS pixel's worth of them.)
        Hud.Shadow(img, radius, new Hud.Drop(Hud.Rgba(120, 124, 134, 0.22f), 6 * ring, 20 * ring));
        var edge = Hud.Rect(img.transform, "Ring");
        Hud.Fill(edge);
        edge.offsetMin = new Vector2(-ring, -ring);
        edge.offsetMax = new Vector2(ring, ring);
        var ri = edge.gameObject.AddComponent<Image>();
        ri.sprite = Hud.Rounded;
        ri.type = Image.Type.Sliced;
        ri.color = new Color(120 / 255f, 124 / 255f, 134 / 255f, 0.3f);
        ri.raycastTarget = false;
        Corners(ri, radius + ring);
        // (The ring is the button's own child, so drawn over it: the face is drawn again over the ring, inset.)
        var face = Hud.Rect(img.transform, "Face");
        Hud.Fill(face);
        face.offsetMin = new Vector2(ring * 0.67f, ring * 0.67f);
        face.offsetMax = new Vector2(-ring * 0.67f, -ring * 0.67f);
        var fi = face.gameObject.AddComponent<Image>();
        fi.sprite = Hud.Rounded;
        fi.type = Image.Type.Sliced;
        fi.raycastTarget = false;
        Corners(fi, radius - ring * 0.67f);
        fi.color = Color.white;
        // (Its face shading down, linear-gradient(180deg, #ffffff, #eeeff1), within its rounded corners.)
        face.gameObject.AddComponent<Mask>().showMaskGraphic = true;
        var shade = Hud.Rect(face, "Shade");
        Hud.Fill(shade);
        var si = shade.gameObject.AddComponent<RawImage>();
        si.texture = buttonShade != null ? buttonShade : (buttonShade = MenuKit.Down(Color.white, Hud.Rgba(0xee, 0xef, 0xf1)));
        si.raycastTarget = false;
        img.color = Color.white;
        var b = img.gameObject.AddComponent<Button>();
        b.transition = Selectable.Transition.None;
        b.onClick.AddListener(() => { Sound.Play("click"); onClick(); });
        img.gameObject.AddComponent<CanvasGroup>();
        Hud.Label(img.transform, text.ToUpperInvariant(), size, Look.Ink, true, 700, 14);
        return b;
    }

    /// <summary>A button made usable or not, faded as the web's (opacity 0.4).</summary>
    static void Usable(Button b, bool on)
    {
        b.interactable = on;
        var g = b.GetComponent<CanvasGroup>();
        if (g != null) g.alpha = on ? 1 : 0.4f;
    }

    /// <summary>
    /// The layer the battle's overlays are drawn on (the hero's abilities, the inspector, an answer to make, the result,
    /// the settings and quit sheets, Oriel, an online game's words): measured as the web's page at 1600 × 1000 (its CSS
    /// pixels × 1.45), drawn at the web's size on any screen, as large as the page.
    /// </summary>
    RectTransform refLayer;
    /// <summary>The HUD's pieces laid out at the screen's size (made again when it changes).</summary>
    RectTransform chrome;
    RectTransform rivalHand;
    Image[] paceOn;
    readonly TextMeshProUGUI[] paceWords = new TextMeshProUGUI[3];

    /// <summary>The pill's chosen mode, a dark pill under its name.</summary>
    void PaceShown()
    {
        if (paceOn == null) return;
        int k = confirmMode == "auto" ? 1 : confirmMode == "skip" ? 2 : 0;
        for (int i = 0; i < 3; i++)
        {
            paceOn[i].color = i == k ? Look.Ink : new Color(1, 1, 1, 0);
            if (paceWords[i] != null) paceWords[i].color = i == k ? Color.white : Look.InkSoft;
        }
    }
    const float RefScale = 1.45f;

    /// <summary>The overlays' layer (see refLayer).</summary>
    Transform Layer => refLayer;

    /// <summary>The HUD's own camera (see BuildHud).</summary>
    Camera hudCam;
    RectTransform beamLayer;

    void BuildHud()
    {
        // The HUD measured in the web's own pixels at its layout size (Css), so it is laid out as the web's on a phone
        // as on a big screen.
        // (On a camera of its own, well away from the table: the table's camera draws through an off-centre frustum,
        // which would carry a canvas on it off centre too.)
        hudCam = new GameObject("Hud camera").AddComponent<Camera>();
        hudCam.transform.SetParent(transform, false);
        hudCam.transform.position = new Vector3(0, -500, 0);
        hudCam.clearFlags = CameraClearFlags.Depth;
        hudCam.cullingMask = 1 << 5;
        hudCam.depth = Cam.depth + 1;
        hudCam.nearClipPlane = 0.1f;
        hudCam.farClipPlane = 10;
        Cam.cullingMask &= ~(1 << 5);
        hud = Hud.CssCanvas(hudCam);
        hud.gameObject.layer = 5;
        hud.transform.SetParent(transform, false);
        var root = hud.transform;
        // (Beams lie under the screen's own layer, as .beam-arc.beam-attack under the dock and HUD.)
        beamLayer = Hud.Rect(root, "Beams");
        // (A canvas of its own, in its place among the rest: its beams redrawn every frame batch only themselves.)
        beamLayer.gameObject.AddComponent<Canvas>();
        Hud.Fill(beamLayer);
        chrome = Hud.Rect(root, "Chrome");
        Hud.Fill(chrome);
        // (What the board waits on you for lies in the board's middle, over the flower: the web's .mid-hint.)
        hint = Hud.Rect(root, "Dawn hint");
        hint.gameObject.SetActive(false);
        refLayer = Hud.Rect(root, "Overlays");
        refLayer.anchorMin = refLayer.anchorMax = refLayer.pivot = new Vector2(0.5f, 0.5f);
        refLayer.localScale = Vector3.one / RefScale;
        // (The card read large: in the page's own pixels, over everything, as the web's .zoom-view.)
        inspector = Hud.Rect(root, "Inspector");
        Hud.Fill(inspector);
        inspector.gameObject.SetActive(false);
        reactionPanel = Hud.Rect(refLayer, "Reaction");
        heroPanel = Hud.Rect(refLayer, "Hero");
        overPanel = Hud.Rect(refLayer, "Over");
        foreach (var p in new[] { reactionPanel, heroPanel, overPanel }) p.gameObject.SetActive(false);
        laidOut = BoardLayout.Current;
        LayoutHud();
    }

    /// <summary>
    /// The HUD at the screen's size, where the web puts it (styles.css; the page's padding --pad-* keeps it clear of a
    /// phone's notch, corners and home bar): your rival's hand hanging in from the top, the corner buttons top right,
    /// the pace bottom left, End Day and your energy bottom right, and the toast.
    /// </summary>
    void LayoutHud()
    {
        var l = BoardLayout.Current;
        refLayer.sizeDelta = new Vector2(l.W, l.H) * RefScale;
        foreach (Transform c in chrome) Mats.Kill(c.gameObject);
        // Your rival's hand, its cards' backs hanging in from the top of the screen (under everything else).
        rivalHand = Hud.Rect(chrome, "Rival hand");
        Hud.At(rivalHand, new Vector2(0.5f, 1), Vector2.zero, Vector2.zero);

        // End Day, and your energy over it (.turn-corner: clamp(120px, 14vw, 190px) wide, at the page's right padding and
        // at least 14 px up; the button padded clamp(8px, 3vh, 14px), its word 0.66rem bold; .plays 5 px over it, its
        // word clamp(0.46rem, 1.6vh, 0.6rem) over 9 px pips).
        float cw = Css.Clamp(120, 14 * l.Vw, 190), right = l.PadR, bottom = Mathf.Max(14, l.PadB);
        float eh = 10.56f * 1.2f + 2 * Css.Clamp(8, 3 * l.Vh, 14) + 2;
        // (While dawn or dusk plays out, or a choice is owed, it is refused with the blocker's thud: app.ts onClick.)
        endDay = WhiteButton(chrome, "End day", () => { if (MyDay && (!DayNow || Dawn != null)) { Sound.Play("blocked"); return; } RequestEndDay(); }, 10.56f, 10, 1);
        Hud.At((RectTransform)endDay.transform, new Vector2(1, 0), new Vector2(-right, bottom), new Vector2(cw, eh));
        float word = Css.Clamp(7.36f, 1.6f * l.Vh, 9.6f), plays = word * 1.22f + 3 + 9;
        var energy = Hud.Rect(chrome, "Energy");
        Hud.At(energy, new Vector2(1, 0), new Vector2(-right, bottom + eh + 5), new Vector2(cw, plays));
        energyLabel = Hud.Label(energy, "ENERGY", word, Look.InkSoft, true, 400, 16, TextAlignmentOptions.Center);
        Hud.At(energyLabel.rectTransform, new Vector2(0.5f, 1), Vector2.zero, new Vector2(cw, word * 1.22f));
        energyDots = Hud.Rect(energy, "Dots");
        Hud.At(energyDots, new Vector2(0.5f, 0), Vector2.zero, new Vector2(cw, 9));

        // The pace (the web's .confirm-pill): a white pill at the bottom left (16 px in from the page's padding, 8 on a
        // phone), 3 px round its buttons, the mode chosen a dark pill in it.
        var names = new[] { "Normal", "Auto", "Skip" };
        float font = l.Phone ? 8 : 9.28f, spacing = l.Phone ? 10 : 14, padX = l.Phone ? 8 : 12, padY = l.Phone ? 5 : 6;
        float bh = font * 1.2f + 2 * padY;
        var widths = names.Select(n => Hud.Wide(n.ToUpperInvariant(), font, 400, spacing, padX)).ToArray();
        float pw = widths.Sum() + 2 * 2 + 2 * 3;
        float inX = l.PadL + (l.Phone ? 8 : 16), inY = l.PadB + (l.Phone ? 8 : 16);
        var pace = Hud.Box(chrome, "Pace", new Color(1, 1, 1, 0.92f), (bh + 6) / 2);
        // (Its 1 px ring and its shadow both outside it: a ring drawn as its child had lain over it, greying it.)
        Hud.Shadow(pace, (bh + 6) / 2, new Hud.Drop(Hud.Rgba(120, 126, 150, 0.22f), 0, 0, 1), new Hud.Drop(Hud.Rgba(70, 76, 100, 0.14f), 4, 14));
        Hud.At((RectTransform)pace.transform, new Vector2(0, 0), new Vector2(inX, inY), new Vector2(pw, bh + 6));
        paceOn = new Image[3];
        float x = 3;
        for (int i = 0; i < 3; i++)
        {
            var seg = Hud.Rect(pace.transform, names[i]);
            Hud.At(seg, new Vector2(0, 0.5f), new Vector2(x, 0), new Vector2(widths[i], bh));
            x += widths[i] + 2;
            var on = seg.gameObject.AddComponent<Image>();
            on.sprite = Hud.Rounded;
            on.type = Image.Type.Sliced;
            on.color = i == 0 ? Look.Ink : new Color(1, 1, 1, 0);
            Corners(on, bh / 2);
            paceOn[i] = on;
            paceWords[i] = Hud.Label(seg, names[i].ToUpperInvariant(), font, i == 0 ? Color.white : Look.InkSoft, true, 400, spacing);
            string mode = names[i].ToLowerInvariant();
            var pb = seg.gameObject.AddComponent<Button>();
            pb.transition = Selectable.Transition.None;
            pb.onClick.AddListener(() => SetConfirmMode(mode));
        }
        PaceShown();

        // The corner buttons (the web's .hud .icon-btn, round, clamp(36px, 8vh, 44px), 6 px apart, at the page's top
        // right padding): the log, fullscreen, settings.
        float b = Css.Clamp(36, 8 * l.Vh, 44);
        string[] icons = { "log", "fullscreen", "settings" };
        for (int i = 0; i < 3; i++)
        {
            var bi = Hud.Box(chrome, "Corner " + icons[i], Look.GlassStrong, b / 2);
            bi.raycastTarget = true;
            Hud.Shadow(bi, b / 2, new Hud.Drop(Hud.Rgba(90, 90, 110, 0.12f), 2, 10));
            Hud.At((RectTransform)bi.transform, new Vector2(1, 1), new Vector2(-l.PadR - (2 - i) * (b + 6), -l.PadT), new Vector2(b, b));
            var btn = bi.gameObject.AddComponent<Button>();
            if (i == 2) btn.onClick.AddListener(() => { Sound.Play("click"); Settings(); });
            if (i == 1) btn.onClick.AddListener(() => Screen.fullScreen = !Screen.fullScreen);
            var ic = Hud.Rect(bi.transform, "Icon");
            Hud.At(ic, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(b, b));
            var raw = ic.gameObject.AddComponent<RawImage>();
            raw.texture = Resources.Load<Texture2D>("Icons/hud-" + icons[i]);
            raw.raycastTarget = false;
        }

        // A word when something can't be done (the web's .toast): a small white slip 8 px under the page's top padding,
        // centred, at most min(440px, 100vw − 32px) wide, padded 7 × 16 px, corners of 12, its words 0.74rem soft ink.
        string said = toast != null ? toast.text : "";
        // (Its faint 1 px ring the slip itself, its white face inset in it.)
        var t = Hud.Box(chrome, "Toast", Hud.Rgba(58, 66, 86, 0.1f), 13);
        Hud.At((RectTransform)t.transform, new Vector2(0.5f, 1), new Vector2(0, -(l.PadT + 8)), new Vector2(300, 30));
        var slip = Hud.Box(t.transform, "Face", new Color(1, 1, 1, 0.9f), 12);
        Hud.Fill(slip.rectTransform);
        slip.rectTransform.offsetMin = new Vector2(1, 1);
        slip.rectTransform.offsetMax = new Vector2(-1, -1);
        toast = Hud.Label(t.transform, said, 11.84f, Look.InkSoft, false, 400, 0);
        toast.margin = new Vector4(16, 0, 16, 0);
        toast.gameObject.SetActive(Time.time < toastUntil);
        t.gameObject.AddComponent<ToastHide>().Text = toast;
        foreach (var img in t.GetComponentsInChildren<Image>(true)) img.enabled = false;
        if (said != "") Say(said, false);
        else toast.text = "";
        hint.SetAsLastSibling();
        refLayer.SetAsLastSibling();
        if (state != null) Usable(endDay, MyDay);
    }

    /// <summary>
    /// The rival's hand (app.ts renderRivalHand, styles.css .rival-hand): a card's back for each card they hold,
    /// clamp(40px, 4.3vw, 64px) wide, hanging half off the top of the screen in a fan (each 62% of a card from the next,
    /// turned 4° about a point well above the screen), white-edged with a soft shadow.
    /// </summary>
    void RivalHand()
    {
        foreach (Transform c in rivalHand) Mats.Kill(c.gameObject);
        var rival = Rival;
        int n = rival != null && !rival.Eliminated ? rival.Hand.Count : 0;
        float w = BoardLayout.Current.RivalBack, h = w * 1.4f;
        var back = Resources.Load<Texture2D>("Board/back");
        for (int i = 0; i < n; i++)
        {
            float o = i - (n - 1) / 2f;
            var card = Hud.Rect(rivalHand, "Back");
            card.anchorMin = card.anchorMax = new Vector2(0.5f, 0.5f);
            // (Pivoted 2.6 card heights above its top edge, as the web's transform-origin: 50% -260%.)
            card.pivot = new Vector2(0.5f, 3.6f);
            card.sizeDelta = new Vector2(w, h);
            card.anchoredPosition = new Vector2(o * w * 0.62f, (0.54f + 2.6f) * h);
            card.localRotation = Quaternion.Euler(0, 0, 4 * o);
            var shadow = Hud.Rect(card, "Shadow");
            Hud.Fill(shadow);
            shadow.offsetMin = new Vector2(-w * 0.15f, -w * 0.19f);
            shadow.offsetMax = new Vector2(w * 0.15f, w * 0.11f);
            var si = shadow.gameObject.AddComponent<Image>();
            si.sprite = Hud.Soft;
            si.type = Image.Type.Sliced;
            si.pixelsPerUnitMultiplier = 14.4f / 10;
            si.color = new Color(50 / 255f, 56 / 255f, 80 / 255f, 0.3f);
            si.raycastTarget = false;
            var edge = Hud.Rect(card, "Edge");
            Hud.Fill(edge);
            var ei = edge.gameObject.AddComponent<Image>();
            ei.sprite = Hud.Rounded;
            ei.type = Image.Type.Sliced;
            ei.color = Color.white;
            ei.raycastTarget = false;
            Corners(ei, w * 0.1f);
            var clip = Hud.Rect(card, "Clip");
            Hud.Fill(clip);
            clip.offsetMin = new Vector2(1.5f, 1.5f);
            clip.offsetMax = new Vector2(-1.5f, -1.5f);
            var ci = clip.gameObject.AddComponent<Image>();
            ci.sprite = Hud.Rounded;
            ci.type = Image.Type.Sliced;
            ci.raycastTarget = false;
            Corners(ci, w * 0.1f - 1.5f);
            clip.gameObject.AddComponent<Mask>().showMaskGraphic = false;
            var face = Hud.Rect(clip, "Face");
            Hud.Fill(face);
            // (The baked back has its own pale corners: drawn a little larger, so they fall outside the clip.)
            face.offsetMin = new Vector2(-1.4f, -1.4f);
            face.offsetMax = new Vector2(1.4f, 1.4f);
            var raw = face.gameObject.AddComponent<RawImage>();
            raw.texture = back;
            raw.raycastTarget = false;
        }
    }

    /// <summary>
    /// A part of the overlays' layer for something that must be seen whole (`need` of the layer's units across and
    /// down): as large as the layer, drawn smaller on a screen too small for it.
    /// </summary>
    RectTransform Whole(RectTransform parent, Vector2 need)
    {
        var size = refLayer.sizeDelta;
        float k = Mathf.Min(1, Mathf.Min(size.x / need.x, size.y / need.y));
        var r = Hud.Rect(parent, "Whole");
        r.anchorMin = r.anchorMax = r.pivot = new Vector2(0.5f, 0.5f);
        r.sizeDelta = size / k;
        r.localScale = Vector3.one * k;
        return r;
    }

    void Refresh()
    {
        if (state == null) return;
        FitScreen();
        Phase = Dawn != null ? "dawn" : "day";
        Persist();
        Board.Sync(state, this);
        Usable(endDay, MyDay);
        endDay.gameObject.SetActive(!Autoplay);
        // Energy (app.ts renderTurnControls): your day's whole energy as pips, those spent left pale, any beyond the
        // day's usual amount amber; on your rival's day, the energy banked to answer them with.
        foreach (Transform c in energyDots) Mats.Kill(c.gameObject);
        bool myTurn = Game.ActivePlayer(state).Id == you && state.WinnerId == null;
        int banked = myTurn ? 0 : Me.Banked ?? 0;
        int total = myTurn ? Mathf.Max(Me.PlaysLeft, Me.Turn?.EnergyTotal ?? Game.PlaysAllowed(state, Me)) : banked;
        int usual = myTurn ? Me.Turn?.EnergyBase ?? total : total;
        energyLabel.text = myTurn ? "ENERGY" : banked > 0 ? "BANKED" : "WAITING";
        energyLabel.color = myTurn || banked > 0 ? Look.InkSoft : Look.InkFaint;
        for (int i = 0; i < total; i++)
        {
            bool on = !myTurn || i < Me.PlaysLeft, bonus = myTurn && i >= usual;
            Color fill = !on ? new Color(1, 1, 1, 0.7f) : !myTurn ? new Color(226 / 255f, 176 / 255f, 74 / 255f) : bonus ? new Color(242 / 255f, 181 / 255f, 68 / 255f) : new Color(124 / 255f, 199 / 255f, 154 / 255f);
            Color ring = !myTurn ? new Color(212 / 255f, 149 / 255f, 42 / 255f) : bonus ? (on ? new Color(212 / 255f, 149 / 255f, 42 / 255f) : new Color(224 / 255f, 178 / 255f, 90 / 255f)) : on ? new Color(95 / 255f, 181 / 255f, 130 / 255f) : new Color(185 / 255f, 194 / 255f, 207 / 255f);
            var d = Hud.Rect(energyDots, "Pip");
            // (Each 9 px, 4 apart, a 1 px ring.)
            Hud.At(d, new Vector2(0.5f, 0.5f), new Vector2((i - (total - 1) / 2f) * 13, 0), new Vector2(9, 9));
            if (on)
            {
                // (Lit, it glows.)
                var glow = Hud.Rect(d, "Glow");
                Hud.Fill(glow);
                glow.offsetMin = new Vector2(-6, -6);
                glow.offsetMax = new Vector2(6, 6);
                var gi = glow.gameObject.AddComponent<Image>();
                gi.sprite = Hud.Soft;
                gi.type = Image.Type.Sliced;
                gi.pixelsPerUnitMultiplier = 14.4f / 6;
                gi.color = new Color(fill.r, fill.g, fill.b, 0.5f);
                gi.raycastTarget = false;
            }
            var edge = Hud.Rect(d, "Edge");
            Hud.Fill(edge);
            var ei = edge.gameObject.AddComponent<Image>();
            ei.sprite = Hud.Circle;
            ei.color = ring;
            ei.raycastTarget = false;
            var core = Hud.Rect(d, "Core");
            Hud.Fill(core);
            core.offsetMin = new Vector2(1, 1);
            core.offsetMax = new Vector2(-1, -1);
            var ci = core.gameObject.AddComponent<Image>();
            ci.sprite = Hud.Circle;
            ci.color = on ? fill : Color.white;
            ci.raycastTarget = false;
        }
        RivalHand();
        Reaction();
        ShowHint();
        ShowChoice();
        PuzzleTag();
        GameOver();
        DrawStage();
        PaceShown();
        SyncBossAim();
    }

    void Reaction()
    {
        foreach (Transform c in reactionPanel) Mats.Kill(c.gameObject);
        // (Drawn on the stage now, as the web's .stage-react: see DrawReact.)
        bool show = false;
        reactionPanel.gameObject.SetActive(show);
        if (!show) return;
        var r = state.Reaction;
        var panel = Hud.Glass(reactionPanel, "Panel");
        Hud.At((RectTransform)panel.transform, new Vector2(0.5f, 0.5f), new Vector2(0, 40), new Vector2(720, 250));
        var title = Hud.Label(panel.transform, "ANSWER IT?", 30, Look.Ink, true, 500, 20, TextAlignmentOptions.Top);
        title.margin = new Vector4(0, 26, 0, 0);
        var opts = new List<(string, EngineAction)> { ("Let it pass", new EngineAction { Type = "react" }) };
        if (r.Slot) opts.Add(("Spring your trap", new EngineAction { Type = "react", Slot = true }));
        foreach (var uid in r.Hand) opts.Add(($"Play {Cards.Def(Me.Hand.First(c => c.Uid == uid).DefId).Name}", new EngineAction { Type = "react", CardUid = uid }));
        for (int i = 0; i < opts.Count; i++)
        {
            var (label, action) = opts[i];
            var b = Hud.Pill(panel.transform, label, () => Do(action), 18);
            Hud.At((RectTransform)b.transform, new Vector2(0.5f, 0), new Vector2((i % 3 - Mathf.Min(2, opts.Count - 1) / 2f) * 226, 30 + (i / 3) * 76), new Vector2(214, 62));
        }
    }


    float resultAt;

    /// <summary>
    /// app.ts holdResult: the game just ended: its result held back until its last moves have played out (a day's
    /// banners and effects as dayTimeline lays them out, or 0.9 s), and 1.8 s more.
    /// </summary>
    void HoldResult(GameState next, EngineAction a)
    {
        var pulses = (next.TurnPulses ?? new List<TurnPulse>()).Where(p => p.Kind != "start" && p.Together != true).ToList();
        float waves = pulses.Count(IsWave) * WaveExtra;
        float wait = (a.Type == "endTurn" ? (pulses.Count > 0 ? 2 * (BannerShown + 0.15f) + pulses.Count * PulseStep * SpeedK + waves + 0.7f : 0) : 0.9f) + 1.8f;
        resultAt = Time.time + wait;
        StartCoroutine(After(wait + 0.02f, () => { if (state != null && state.WinnerId != null) Refresh(); }));
    }

    void GameOver()
    {
        foreach (Transform c in overPanel) Mats.Kill(c.gameObject);
        overPanel.gameObject.SetActive(false);
        // (The result waits until the game's last moves have played out on the table: app.ts resultAt.)
        bool over = state.WinnerId != null && !Autoplay && Time.time >= resultAt;
        // (body:has(.game-result) .dock: the hand put away while the result shows.)
        Board.ShowHand(!over);
        if (!over) { ClearResult(); return; }
        if (resultCard != null) return;
        if (puzzleKind != null) { PuzzleResult(); return; }
        bool draw = Game.IsDraw(state);
        bool won = state.WinnerId == you;
        var quitter = state.ConcededBy != null ? Player(state.ConcededBy) : null;
        string title = draw ? "draw" : won ? "victory" : "defeat";
        string why = draw ? $"Every sun went supernova together in round {state.Round}.{(campaignOf != null ? " Your flagship pulls back, unbroken." : "")}"
            : quitter != null ? $"{(quitter.Id == you ? "You" : "Your rival")} conceded in round {state.Round}."
            : $"The last sun standing after {state.Round} round{(state.Round == 1 ? "" : "s")}.";
        int tone = draw ? 0 : won ? 1 : -1;
        if (online) { OnlineEnd(title, tone, why, quitter != null); return; }
        // (A battle of the run's goes back to the map, what it won waiting there.)
        var act = campaignOf != null ? new ResultAction("continue", BackToCampaign, true) : new ResultAction("return to menu", () => App.Instance?.Menu("hub"), true);
        ResultCard(title, tone, why, null, new[] { act }, false);
    }

    /// <summary>Everything settled where it is going (for a still picture).</summary>
    public void Settle()
    {
        Board.Settle();
        foreach (var t in hud.GetComponentsInChildren<TMP_Text>(true)) t.ForceMeshUpdate();
    }
}

public class ToastHide : MonoBehaviour
{
    public TextMeshProUGUI Text;
    void Update()
    {
        bool on = Text != null && Text.gameObject.activeSelf;
        foreach (var img in GetComponentsInChildren<Image>(true)) img.enabled = on;
    }
}
