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

    // What is being chosen: a card from hand (its plays still possible), or an attacker.
    string picked;
    List<EngineAction> options;
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
    }

    void BackToCampaign() => App.Instance.EndCampaignBattle(this, state, campaignOf);

    /// <summary>Show a battle as it stands (a state set up elsewhere: a lesson, a puzzle, a picture).</summary>
    public void Load(GameState s)
    {
        state = s;
        Board.Viewer = you;
        Clear();
        Refresh();
        Sound.Scene("battle");
    }

    // ---- The loop ----

    void Update()
    {
        if (FitScreen() && state != null) Refresh();
        if (toast != null) toast.gameObject.SetActive(Time.time < toastUntil);
        if (state == null || state.WinnerId != null) return;
        StageTick();
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
            up &= !inspector.gameObject.activeSelf && sheet == null;
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
        picked = null;
        options = null;
        attacker = null;
        if (heroPanel != null) heroPanel.gameObject.SetActive(false);
    }

    void Say(string text, bool fresh = true)
    {
        toast.text = text;
        if (fresh) toastUntil = Time.time + 3.5f;
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
        void Hit(PlayerState p, float at, bool byEnemy)
        {
            var w = Was(p);
            int dHeat = p.Heat - w.Heat;
            var sunView = Board.SunOf(p.Id);
            if (sunView != null && (dHeat != 0 || p.Shields != w.Shields))
            {
                if (byEnemy && a.Type != "attack" && dHeat > 0) Shot.Fire(Board.transform, origin, sunView.transform.position, sunView, true, Mathf.Max(0, at - 0.42f));
                else sunView.Pulse(dHeat >= 0, a.Type == "attack" ? 0.15f : at);
            }
            int lost = byEnemy ? Mathf.Max(0, w.Shields - p.Shields) : 0;
            int gained = Mathf.Max(0, p.Shields - w.Shields);
            if (dHeat > 0)
            {
                if (p.Id == you && byEnemy) Sound.Play("hurt", dHeat);
                else if (byEnemy) Sound.Play($"strike-{Mathf.Clamp(dHeat, 1, 5)}", at);
                else Sound.Play("impact-hot", at);
            }
            else if (dHeat < 0) Sound.Play("impact-cold", at);
            if (lost > 0) Sound.Play("block", at);
            else if (gained > 0 && dHeat == 0) Sound.Play("shield", at);
        }
        int volley = 0;
        foreach (var p in next.Players)
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
        if (me.Heat != meWas.Heat || me.Shields > meWas.Shields)
        {
            Hit(me, delay, false);
            if (me.Heat < meWas.Heat) Sound.Play("thermo", delay);
        }
        switch (a.Type)
        {
            case "playCard":
                Sound.Play("play");
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
                Sound.Play("swing");
                // The attacker lunges at what it strikes; a card struck shudders.
                var target = a.TargetUid != null ? Board.WorldOf(a.TargetUid) : Board.SunOf(next.Players.FirstOrDefault(p => p.Id != actor.Id)?.Id ?? "")?.transform.position;
                if (target != null) Board.View(a.AttackerUid)?.Lunge(target.Value);
                if (a.TargetUid != null)
                {
                    Board.View(a.TargetUid)?.Shake(0.15f);
                    CardBlow(prev, next, a.TargetUid);
                }
                break;
        }
        // Cards drawn into your hand, one after another.
        var mine = next.Players.First(p => p.Id == you);
        int drawn = mine.Hand.Count(c => !Was(mine).Hand.Any(x => x.Uid == c.Uid));
        for (int i = 0; i < drawn; i++) Sound.Play("draw", 0.35f + i * 0.12f);
        if (next.WinnerId != null && prev.WinnerId == null) Sound.Play("supernova", 0.4f);
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
        if (!Physics.Raycast(Cam.ScreenPointToRay(Input.mousePosition), out var hit, 100)) { Clear(); Refresh(); return; }
        var card = hit.collider.GetComponentInParent<CardView>();
        var slot = hit.collider.GetComponent<SlotTag>();
        var sun = hit.collider.GetComponentInParent<SunTag>();
        if (card != null) TapCard(card.Uid);
        else if (slot != null) TapSlot(slot);
        else if (sun != null) TapSun(sun.PlayerId);
        else Clear();
        Refresh();
    }

    void TapCard(string uid)
    {
        if (!MyDay) return;
        if (Dawn != null) { DawnCard(uid); return; }
        if (discarding != null)
        {
            if (Me.Hand.Any(c => c.Uid == uid))
            {
                if (discarding.Contains(uid)) discarding.Remove(uid);
                else if (discarding.Count < Over) discarding.Add(uid);
            }
            return;
        }
        var inHand = Me.Hand.FirstOrDefault(c => c.Uid == uid);
        var mineInPlay = Me.Tableau.FirstOrDefault(c => c.Uid == uid);
        // Choosing what a card from hand aims at, or an attacker's target.
        if (picked != null && options != null && options.Any(o => Aims(o) == uid))
        {
            Finish(options.Where(o => Aims(o) == uid).ToList());
            return;
        }
        if (attacker != null && mineInPlay == null)
        {
            Do(new EngineAction { Type = "attack", AttackerUid = attacker, TargetUid = uid });
            return;
        }
        if (inHand != null)
        {
            if (picked == uid) { Clear(); return; }
            Clear();
            if (Game.HandCost(inHand, Me) > Me.PlaysLeft)
            {
                Say($"{Cards.Def(inHand.DefId).Name} costs {Game.HandCost(inHand, Me)}: you have {Me.PlaysLeft} energy.");
                return;
            }
            var plays = AI.PlaysFor(state, uid);
            if (plays.Count == 0)
            {
                Say(Game.RoomProblem(Me, inHand.DefId) ?? "It can't be played now.");
                return;
            }
            picked = uid;
            options = plays;
            Sound.Play("hand-lift");
            // (Nothing to choose: it's played at once.)
            if (plays.All(o => o.SlotIndex == null) && plays.All(o => Aims(o) == null)) Finish(plays);
            return;
        }
        if (mineInPlay != null)
        {
            Clear();
            // (Your Hero, tapped: its abilities, its singularity and its attack to pick from.)
            if (mineInPlay.Slot == Game.CommandSlot)
            {
                ShowHero();
                return;
            }
            var why = Game.AttackProblem(state, Me, uid, null, false);
            if (why != null) Say($"{Cards.Def(mineInPlay.DefId).Name}: {why}.");
            else attacker = uid;
        }
    }

    void TapSlot(SlotTag slot)
    {
        if (MyDay && Dawn != null)
        {
            if (dawnPick != null && slot.Slot >= 0 && slot.Mine == (Dawn.Kind == "shift"))
                Do(Dawn.Kind == "shift" ? new EngineAction { Type = "dawnChoice", AllyUid = dawnPick, ShiftTo = slot.Slot } : new EngineAction { Type = "dawnChoice", EnemyUid = dawnPick, ShiftTo = slot.Slot });
            return;
        }
        if (!MyDay || picked == null || !slot.Mine) return;
        PickSlot(slot.Slot);
    }

    /// <summary>The card picked from hand put in a slot of yours (what lands there; aimed at, if one aim is all it has).</summary>
    void PickSlot(int slotIndex)
    {
        if (picked == null || options == null) return;
        var here = options.Where(o => o.SlotIndex == slotIndex).ToList();
        if (here.Count == 0) return;
        options = here;
        if (here.All(o => Aims(o) == null) || here.Select(Aims).Distinct().Count() == 1) Finish(here);
    }

    void TapSun(string playerId)
    {
        if (!MyDay || playerId == you) return;
        // (A Hero's ability or singularity aimed: their sun, if it may be.)
        // (Something aimed, a card from hand or a Hero's ability: their sun, where it may go there.)
        if (picked != null && options != null && options.Any(o => Aims(o) != null))
        {
            var atSun = options.Where(o => Aims(o) == null).ToList();
            if (atSun.Count > 0 && atSun.Select(o => o.SlotIndex).Distinct().Count() == 1) { Finish(atSun); return; }
        }
        if (Dawn != null) { if (Dawn.Kind == "aim") Do(new EngineAction { Type = "dawnChoice" }); return; }
        if (attacker != null) Do(new EngineAction { Type = "attack", AttackerUid = attacker, TargetUid = null });
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

    /// <summary>Whether a card can answer the dawn choice (or, moving one, be the one moved).</summary>
    bool DawnTarget(PlayerState owner, CardInstance c, bool inPlay)
    {
        var d = Dawn;
        if (d == null) return false;
        bool mine = owner.Id == you;
        switch (d.Kind)
        {
            case "discount": return mine && !inPlay;
            case "aim": case "freeze": return !mine && inPlay;
            case "displace": return !mine && inPlay && c.Slot != Game.CommandSlot;
            case "empower": case "renew": case "ward": return mine && inPlay;
            default: return mine && inPlay && c.Slot != Game.CommandSlot;
        }
    }

    void DawnCard(string uid)
    {
        var d = Dawn;
        var owner = state.Players.FirstOrDefault(p => p.Tableau.Any(c => c.Uid == uid) || p.Hand.Any(c => c.Uid == uid));
        if (owner == null) return;
        var c = owner.Tableau.FirstOrDefault(x => x.Uid == uid) ?? owner.Hand.First(x => x.Uid == uid);
        if (!DawnTarget(owner, c, owner.Tableau.Contains(c))) return;
        if (d.Kind == "shift" || d.Kind == "displace")
        {
            dawnPick = dawnPick == uid ? null : uid;
            return;
        }
        Do(owner.Id == you ? new EngineAction { Type = "dawnChoice", AllyUid = uid } : new EngineAction { Type = "dawnChoice", EnemyUid = uid });
    }

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

    void ShowHint()
    {
        foreach (Transform c in hint) Mats.Kill(c.gameObject);
        hint.gameObject.SetActive(false);
        var d = Dawn;
        if (discarding != null && d == null)
        {
            int left = Over - discarding.Count;
            MidHint(left > 0 ? $"discard {left} card{(left == 1 ? "" : "s")}" : "end day to discard", ("keep playing", () => { discarding = null; Refresh(); }));
            return;
        }
        if (d == null && MyDay && (picked != null || attacker != null))
        {
            // A card picked or an attacker readied: what to choose next, and a way back out.
            string ask;
            if (attacker != null)
            {
                var a = Me.Tableau.FirstOrDefault(c => c.Uid == attacker);
                bool guarded = !(Game.AimChoices(state, Me, true)?.Sun ?? true);
                ask = guarded ? "attack a guard" : $"attack with {(a != null ? Cards.Def(a.DefId).Name.ToLowerInvariant() : "it")}";
            }
            else
            {
                bool slots = options != null && options.Select(o => o.SlotIndex).Distinct().Count() > 1;
                ask = slots ? "place it" : "choose a target";
            }
            MidHint(ask, ("cancel", () => { Clear(); Refresh(); }));
            return;
        }
        if (d == null) { dawnPick = null; return; }
        // Skip (or, aiming heat, their sun: it has to go somewhere); moving a card, back.
        System.Action skip = () => Do(new EngineAction { Type = "dawnChoice" });
        if (d.Kind == "aim") MidHint(DawnAsk(d), ("their sun", skip));
        else if (dawnPick != null) MidHint(DawnAsk(d), ("back", () => { dawnPick = null; Refresh(); }), ("skip", skip));
        else MidHint(DawnAsk(d), ("skip", skip));
    }

    /// <summary>What a play aims at (a card), if anything.</summary>
    static string Aims(EngineAction a) => a.AimUid ?? a.EnemyUid ?? a.AllyUid ?? a.RecoverUid ?? a.SacrificeUid;

    void Finish(List<EngineAction> left)
    {
        var best = left.Count == 1 ? left[0] : AI.BestOf(state, left);
        if (best != null) Do(best);
    }

    // ---- What the board shows of the choosing ----

    /// <summary>A card's rim and dimming for what is being chosen.</summary>
    public void Dress(CardView v, PlayerState owner, CardInstance c, bool inPlay)
    {
        if (DragRim(v, c)) return;
        Color? rim = null;
        float strength = 1;
        if (Dawn != null)
        {
            if (c.Uid == dawnPick) rim = Look.Pick;
            else if (dawnPick == null && DawnTarget(owner, c, inPlay)) rim = Look.Aim;
        }
        else if (inPlay)
        {
            if (c.Uid == attacker) rim = Look.Pick;
            else if (attacker != null && owner.Id != you && Game.AttackProblem(state, Me, attacker, c.Uid, true) == null) rim = Look.Aim;
            else if (picked != null && options != null && options.Any(o => Aims(o) == c.Uid)) rim = Look.Aim;
            else if (MyDay && owner.Id == you && attacker == null && picked == null && Game.AttackProblem(state, Me, c.Uid, null, false) == null) { rim = Look.Aim; strength = 0.45f; }
        }
        else if (discarding != null)
        {
            if (discarding.Contains(c.Uid)) rim = Look.Danger;
            else if (discarding.Count < Over) { rim = Look.Danger; strength = 0.35f; }
        }
        else
        {
            if (c.Uid == picked) rim = Look.Pick;
            else if (MyDay && Game.HandCost(c, owner) <= owner.PlaysLeft && AI.PlaysFor(state, c.Uid).Count > 0) { rim = Look.Good; strength = 0.6f; }
        }
        v.Rim(rim, strength);
    }

    /// <summary>How far a card in hand is held up (a picked card, most).</summary>
    public float HandLift(CardInstance c) => c.Uid == picked || (discarding?.Contains(c.Uid) ?? false) ? 1f : 0;

    /// <summary>The card under the pointer, read large: its face, and in play what stands on it now.</summary>
    void Inspect()
    {
        if (!Physics.Raycast(Cam.ScreenPointToRay(Input.mousePosition), out var hit, 100)) return;
        var v = hit.collider.GetComponentInParent<CardView>();
        if (v == null) return;
        // (A rival's trap stays hidden.)
        if (state.Players.Any(p => p.Id != you && p.Lightspeed?.Uid == v.Uid)) return;
        foreach (Transform c in inspector) Mats.Kill(c.gameObject);
        inspector.gameObject.SetActive(true);
        var veil = inspector.gameObject.GetComponent<Image>() ?? inspector.gameObject.AddComponent<Image>();
        veil.color = new Color(240 / 255f, 240 / 255f, 238 / 255f, 0.78f);
        var btn = inspector.gameObject.GetComponent<Button>() ?? inspector.gameObject.AddComponent<Button>();
        btn.onClick.RemoveAllListeners();
        btn.onClick.AddListener(() => inspector.gameObject.SetActive(false));
        // (Seen whole on any screen: smaller on a phone's.)
        var box = Whole(inspector, new Vector2(880, 700));
        var face = Hud.Rect(box, "Face");
        Hud.At(face, new Vector2(0.5f, 0.5f), new Vector2(-205, 30), new Vector2(406, 568));
        var raw = face.gameObject.AddComponent<RawImage>();
        raw.texture = Faces.Of(v.DefId, false);
        raw.raycastTarget = false;
        // What stands on it now, for a card in play.
        var owner = state.Players.FirstOrDefault(p => p.Tableau.Any(c => c.Uid == v.Uid));
        var card = owner?.Tableau.First(c => c.Uid == v.Uid);
        var def = Cards.Def(v.DefId);
        var lines = new List<string> { $"<b>{def.Name.ToUpperInvariant()}</b>" };
        if (card != null)
        {
            int atk = Game.CardAttack(state, owner, card);
            if (atk > 0 || Game.BaseAttack(def) > 0) lines.Add($"Attack {atk}{(card.Dimmed == true ? " (dimmed: attacked today)" : "")}");
            lines.Add($"Stability {card.Health ?? 0}");
            lines.Add($"Defence {Game.CardDefence(owner, card)}{(Game.IsGuard(owner, card) ? " · Guard" : "")}");
            if ((card.Shields ?? 0) > 0) lines.Add($"Shields {card.Shields}");
            if ((card.Growth ?? 0) > 0) lines.Add($"Grown {card.Growth}");
            if (card.Frozen == true) lines.Add("Frozen");
        }
        var info = Hud.Glass(box, "Info", Look.GlassStrong);
        Hud.At((RectTransform)info.transform, new Vector2(0.5f, 0.5f), new Vector2(219, 30 + 145), new Vector2(406, 60 + 40 * lines.Count));
        var t = Hud.Label(info.transform, string.Join("\n", lines), 24, Look.Ink, false, 500, 0, TextAlignmentOptions.TopLeft);
        t.margin = new Vector4(24, 20, 24, 20);
        // (Under it, as the web's inspector sheet: a way to close it.)
        var close = WhiteButton(box, "Close", () => inspector.gameObject.SetActive(false), 15);
        Hud.At((RectTransform)close.transform, new Vector2(0.5f, 0.5f), new Vector2(0, -300), new Vector2(150, 50));
    }

    // ---- The screen's own layer ----

    /// <summary>A rounded image's corners at `radius` canvas units (Hud.Rounded's own are 22).</summary>
    static Image Corners(Image img, float radius)
    {
        img.pixelsPerUnitMultiplier = 22f / Mathf.Max(0.5f, radius);
        return img;
    }

    /// <summary>
    /// The web's .btn-primary (End Day, a result's way on): white, a white hairline inside a faint ring, corners of
    /// `radius`, a soft shadow; its words bold spaced capitals. Disabled, the whole of it fades to 0.4. (In the units of
    /// the canvas it is on: `ring` the ring's width.)
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
        Hud.Fill(beamLayer);
        chrome = Hud.Rect(root, "Chrome");
        Hud.Fill(chrome);
        // (What the board waits on you for lies in the board's middle, over the flower: the web's .mid-hint.)
        hint = Hud.Rect(root, "Dawn hint");
        hint.gameObject.SetActive(false);
        refLayer = Hud.Rect(root, "Overlays");
        refLayer.anchorMin = refLayer.anchorMax = refLayer.pivot = new Vector2(0.5f, 0.5f);
        refLayer.localScale = Vector3.one / RefScale;
        inspector = Hud.Rect(refLayer, "Inspector");
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
        endDay = WhiteButton(chrome, "End day", EndDay, 10.56f, 10, 1);
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
        Hud.Shadow(pace, (bh + 6) / 2, new Hud.Drop(Hud.Rgba(70, 76, 100, 0.14f), 4, 14));
        Hud.At((RectTransform)pace.transform, new Vector2(0, 0), new Vector2(inX, inY), new Vector2(pw, bh + 6));
        var edge = Hud.Rect(pace.transform, "Ring");
        Hud.Fill(edge);
        edge.offsetMin = new Vector2(-1, -1);
        edge.offsetMax = new Vector2(1, 1);
        edge.SetAsFirstSibling();
        var ei = edge.gameObject.AddComponent<Image>();
        ei.sprite = Hud.Rounded;
        ei.type = Image.Type.Sliced;
        ei.color = new Color(120 / 255f, 126 / 255f, 150 / 255f, 0.22f);
        Corners(ei, (bh + 8) / 2);
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
        PuzzleTag();
        GameOver();
        DrawStage();
        PaceShown();
    }

    void Reaction()
    {
        foreach (Transform c in reactionPanel) Mats.Kill(c.gameObject);
        bool show = state.Reaction != null && state.Reaction.PlayerId == you && !Autoplay;
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


    void GameOver()
    {
        foreach (Transform c in overPanel) Mats.Kill(c.gameObject);
        bool over = state.WinnerId != null && !Autoplay;
        overPanel.gameObject.SetActive(over);
        if (!over) return;
        if (puzzleKind != null) { PuzzleResult(); return; }
        // (As the web's: a white card a little above the middle, the result, why, and the way out.)
        Hud.At(overPanel, new Vector2(0.5f, 0.55f), Vector2.zero, new Vector2(560, 230));
        var card = Hud.Glass(overPanel, "Result", Color.white);
        Hud.Fill((RectTransform)card.transform);
        bool draw = Game.IsDraw(state);
        bool won = state.WinnerId == you;
        var quitter = state.ConcededBy != null ? Player(state.ConcededBy) : null;
        var t = Hud.Label(card.transform, draw ? "DRAW" : won ? "VICTORY" : "DEFEAT", 48.7f, draw ? Look.Ink : won ? new Color(0.76f, 0.48f, 0.12f) : new Color(0.42f, 0.46f, 0.56f), true, 500, 32, TextAlignmentOptions.Top);
        t.margin = new Vector4(0, 34, 0, 0);
        string why = draw ? $"Every sun went supernova together in round {state.Round}."
            : quitter != null ? $"{(quitter.Id == you ? "You" : "Your rival")} conceded in round {state.Round}."
            : $"The last sun standing after {state.Round} round{(state.Round == 1 ? "" : "s")}.";
        var w = Hud.Label(card.transform, why, 16, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
        w.margin = new Vector4(20, 96, 20, 0);
        if (online) { OnlineEnd(card.transform, quitter != null); return; }
        // (A battle of the run's goes back to the map, what it won waiting there.)
        var menu = campaignOf != null ? WhiteButton(card.transform, "Continue", BackToCampaign, 15) : WhiteButton(card.transform, "Return to menu", () => App.Instance?.Menu("hub"), 15);
        Hud.At((RectTransform)menu.transform, new Vector2(0.5f, 0), new Vector2(0, 30), new Vector2(250, 56));
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
