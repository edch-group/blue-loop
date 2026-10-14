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
    /// The web's view of the table: tipped 22° away, seen from twice the screen's height away (a vertical field of
    /// 28°), the eye a quarter of the way down the screen (here, the camera turned down to match). Narrower screens
    /// widen the view so the whole table still fits.
    /// </summary>
    public static void Frame(Camera cam)
    {
        const float tilt = 22, px = 93.3f;
        float aspect = cam.aspect > 0 ? cam.aspect : 1.6f;
        float fov = 28.07f;
        if (aspect < 1.6f) fov = 2 * Mathf.Atan(Mathf.Tan(fov * 0.5f * Mathf.Deg2Rad) * 1.6f / aspect) * Mathf.Rad2Deg;
        cam.fieldOfView = fov;
        float t = tilt * Mathf.Deg2Rad;
        var back = new Vector3(0, Mathf.Cos(t), -Mathf.Sin(t));
        var up = new Vector3(0, Mathf.Sin(t), Mathf.Cos(t));
        var centre = new Vector3(0, 0, Board.TableZ);
        // (The eye 1800 px out and 140 px above the table's middle; the screen's middle 234 px below the eye.)
        float dist = 1800 / px;
        cam.transform.position = centre + back * dist + up * (140 / px);
        cam.transform.rotation = Quaternion.LookRotation(-back, up) * Quaternion.Euler(Mathf.Atan(234f / 1800f) * Mathf.Rad2Deg, 0, 0);
    }

    float framedAspect;

    public void NewBattle(int seed, string myDeck = null, string theirDeck = null)
    {
        var decks = CardData.Decks.Where(d => d.Mixed != true).ToList();
        var mine = decks.FirstOrDefault(d => d.Name == myDeck) ?? decks[seed % decks.Count];
        var theirs = decks.FirstOrDefault(d => d.Name == theirDeck) ?? decks[(seed * 7 + 3) % decks.Count];
        if (theirs == mine) theirs = decks[(seed + 1) % decks.Count];
        state = Game.Create(new GameSetup
        {
            Seed = seed,
            Mode = mine.Mode,
            Players = new List<PlayerSetup>
            {
                new PlayerSetup { Name = "Captain", IsAI = Autoplay, Deck = mine.Cards, DeckName = mine.Name },
                new PlayerSetup { Name = "Rival", IsAI = true, Deck = theirs.Cards, DeckName = theirs.Name },
            },
        });
        Board.Viewer = you;
        Clear();
        Refresh();
        Sound.Scene("battle");
    }

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
        if (Cam != null && !Mathf.Approximately(framedAspect, Cam.aspect))
        {
            framedAspect = Cam.aspect;
            Frame(Cam);
            if (state != null) Board.Sync(state, this);
        }
        if (toast != null) toast.gameObject.SetActive(Time.time < toastUntil);
        if (state == null || state.WinnerId != null) return;
        if (!busy && AiToMove()) StartCoroutine(AiMove());
        if (Autoplay) return;
        // A tap acts; a press held (or a right click) reads the card under it, large.
        if (Input.GetMouseButtonDown(1) && !OverHud()) Inspect();
        if (Input.GetMouseButtonDown(0) && !OverHud())
        {
            pressAt = Time.time;
            pressPos = Input.mousePosition;
        }
        if (pressAt >= 0 && Input.GetMouseButton(0) && Time.time - pressAt > 0.45f && (Input.mousePosition - pressPos).magnitude < 12)
        {
            pressAt = -1;
            Inspect();
        }
        if (pressAt >= 0 && Input.GetMouseButtonUp(0))
        {
            pressAt = -1;
            if (inspector.gameObject.activeSelf) inspector.gameObject.SetActive(false);
            else Tap();
        }
    }

    bool AiToMove()
    {
        if (state.Reaction != null) return Player(state.Reaction.PlayerId).IsAI || Autoplay;
        return Game.ActivePlayer(state).IsAI || Autoplay;
    }

    bool HumanDawnChoice() => state.Reaction == null && Game.ActivePlayer(state).Id == you && (Game.ActivePlayer(state).DawnChoices?.Count ?? 0) > 0;

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
            var was = state;
            state = Game.Apply(state, a);
            Hear(was, state, a);
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
            var was = state;
            state = Game.Apply(state, a);
            Hear(was, state, a);
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

    void Say(string text)
    {
        toast.text = text;
        toastUntil = Time.time + 3.5f;
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
        sheet = Hud.Sheet(hud.transform, "settings", new[]
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
            sheet = Hud.Sheet(hud.transform, "quit game", new[] { new Hud.Row("retreat", () => { CloseSheet(); state = Game.Apply(state, new EngineAction { Type = "concede", PlayerId = you }); BackToCampaign(); }, null, true), new Hud.Row("keep playing", CloseSheet) }, CloseSheet);
            return;
        }
        // (A lesson or a challenge is quick to begin again: only leave.)
        if (puzzleKind != null)
        {
            sheet = Hud.Sheet(hud.transform, "quit game", new[] { new Hud.Row("leave", LeavePuzzle, null, true), new Hud.Row("keep playing", CloseSheet) }, CloseSheet);
            return;
        }
        sheet = Hud.Sheet(hud.transform, "quit game", new[]
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
        var canvas = (RectTransform)hud.transform;
        var screen = Cam.WorldToScreenPoint(v.transform.position + new Vector3(0, 0, 0.7f));
        bool below = screen.y > Screen.height * 0.93f;
        if (below) screen = Cam.WorldToScreenPoint(v.transform.position - new Vector3(0, 0, 0.7f));
        if (RectTransformUtility.ScreenPointToLocalPointInRectangle(canvas, screen, Cam, out var at)) Voices.Speak(defId, canvas, at, below);
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
        var here = options.Where(o => o.SlotIndex == slot.Slot).ToList();
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

    void ShowHint()
    {
        foreach (Transform c in hint) Mats.Kill(c.gameObject);
        var d = Dawn;
        if (discarding != null && d == null)
        {
            hint.gameObject.SetActive(true);
            int left = Over - discarding.Count;
            var p = Hud.Glass(hint, "Hint", Look.GlassStrong);
            Hud.Fill((RectTransform)p.transform);
            var l = Hud.Label(p.transform, (left > 0 ? $"discard {left} card{(left == 1 ? "" : "s")}" : "end day to discard").ToUpperInvariant(), 17, Look.Ink, true, 500, 12, TextAlignmentOptions.Left);
            l.margin = new Vector4(26, 0, 0, 0);
            var keep = Hud.Pill(p.transform, "Keep playing", () => { discarding = null; Refresh(); }, 14);
            Hud.At((RectTransform)keep.transform, new Vector2(1, 0.5f), new Vector2(-10, 0), new Vector2(190, 40));
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
            hint.gameObject.SetActive(true);
            var p = Hud.Glass(hint, "Hint", Look.GlassStrong);
            Hud.Fill((RectTransform)p.transform);
            var l = Hud.Label(p.transform, ask.ToUpperInvariant(), 17, Look.Ink, true, 500, 12, TextAlignmentOptions.Left);
            l.margin = new Vector4(26, 0, 0, 0);
            var cancel = Hud.Pill(p.transform, "Cancel", () => { Clear(); Refresh(); }, 14);
            Hud.At((RectTransform)cancel.transform, new Vector2(1, 0.5f), new Vector2(-10, 0), new Vector2(120, 40));
            return;
        }
        hint.gameObject.SetActive(d != null);
        if (d == null) { dawnPick = null; return; }
        var panel = Hud.Glass(hint, "Hint", Look.GlassStrong);
        Hud.Fill((RectTransform)panel.transform);
        var t = Hud.Label(panel.transform, DawnAsk(d).ToUpperInvariant(), 17, Look.Ink, true, 500, 12, TextAlignmentOptions.Left);
        t.margin = new Vector4(26, 0, 0, 0);
        // Skip (or, aiming heat, their sun: it has to go somewhere).
        bool aim = d.Kind == "aim";
        var b = Hud.Pill(panel.transform, aim ? "Their sun" : "Skip", () => Do(new EngineAction { Type = "dawnChoice" }), 14);
        Hud.At((RectTransform)b.transform, new Vector2(1, 0.5f), new Vector2(-10, 0), new Vector2(aim ? 150 : 100, 40));
        if (dawnPick != null)
        {
            var back = Hud.Pill(panel.transform, "Back", () => { dawnPick = null; Refresh(); }, 14);
            Hud.At((RectTransform)back.transform, new Vector2(1, 0.5f), new Vector2(-118, 0), new Vector2(100, 40));
        }
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
        veil.color = new Color(0.95f, 0.95f, 0.94f, 0.82f);
        var btn = inspector.gameObject.GetComponent<Button>() ?? inspector.gameObject.AddComponent<Button>();
        btn.onClick.RemoveAllListeners();
        btn.onClick.AddListener(() => inspector.gameObject.SetActive(false));
        var face = Hud.Rect(inspector, "Face");
        Hud.At(face, new Vector2(0.5f, 0.5f), new Vector2(-170, 20), new Vector2(460, 644));
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
        var info = Hud.Glass(inspector, "Info", Look.GlassStrong);
        Hud.At((RectTransform)info.transform, new Vector2(0.5f, 0.5f), new Vector2(270, 120), new Vector2(380, 60 + 40 * lines.Count));
        var t = Hud.Label(info.transform, string.Join("\n", lines), 24, Look.Ink, false, 500, 0, TextAlignmentOptions.TopLeft);
        t.margin = new Vector4(24, 20, 24, 20);
        var hint = Hud.Label(inspector, "TAP ANYWHERE TO CLOSE", 18, Look.InkSoft, true, 500, 14, TextAlignmentOptions.Bottom);
        hint.margin = new Vector4(0, 0, 0, 40);
    }

    // ---- The screen's own layer ----

    void BuildHud()
    {
        hud = Hud.Canvas(Cam);
        hud.transform.SetParent(transform, false);
        var root = hud.transform;
        // End Day, and your energy over it (sizes as the web's, in a 1600 × 1000 frame).
        endDay = Hud.Pill(root, "End day", EndDay, 19, Color.white);
        Hud.At((RectTransform)endDay.transform, new Vector2(1, 0), new Vector2(-18, 20), new Vector2(224, 62));
        var energy = Hud.Rect(root, "Energy");
        Hud.At(energy, new Vector2(1, 0), new Vector2(-18, 86), new Vector2(224, 52));
        energyLabel = Hud.Label(energy, "ENERGY", 16, Look.InkSoft, true, 500, 16, TextAlignmentOptions.Top);
        energyDots = Hud.Rect(energy, "Dots");
        Hud.At(energyDots, new Vector2(0.5f, 0), Vector2.zero, new Vector2(224, 16));
        // The pace: normal, auto, skip.
        var pace = Hud.Glass(root, "Pace", Look.GlassStrong);
        Hud.At((RectTransform)pace.transform, new Vector2(0, 0), new Vector2(40, 32), new Vector2(292, 44));
        var names = new[] { "Normal", "Auto", "Skip" };
        for (int i = 0; i < 3; i++)
        {
            var seg = Hud.Rect(pace.transform, names[i]);
            Hud.At(seg, new Vector2(0, 0.5f), new Vector2(5 + i * 94, 0), new Vector2(94, 36));
            if (i == 0)
            {
                var on = seg.gameObject.AddComponent<Image>();
                on.sprite = Hud.Rounded;
                on.type = Image.Type.Sliced;
                on.color = Look.Ink;
            }
            Hud.Label(seg, names[i].ToUpperInvariant(), 15, i == 0 ? Color.white : Look.InkSoft, true, 500, 10);
        }
        // The corner buttons: the log, fullscreen, settings (for now: back to the hub).
        string[] icons = { "log", "fullscreen", "settings" };
        for (int i = 0; i < 3; i++)
        {
            var b = Hud.Glass(root, "Corner " + icons[i], Look.GlassStrong);
            Hud.At((RectTransform)b.transform, new Vector2(1, 1), new Vector2(-18 - (2 - i) * 72, -10), new Vector2(63, 63));
            var btn = b.gameObject.AddComponent<Button>();
            if (i == 2) btn.onClick.AddListener(() => { Sound.Play("click"); Settings(); });
            if (i == 1) btn.onClick.AddListener(() => Screen.fullScreen = !Screen.fullScreen);
            var ic = Hud.Rect(b.transform, "Icon");
            Hud.At(ic, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(63, 63));
            var raw = ic.gameObject.AddComponent<RawImage>();
            raw.texture = Resources.Load<Texture2D>("Icons/hud-" + icons[i]);
            raw.raycastTarget = false;
        }
        // A word when something can't be done.
        var t = Hud.Glass(root, "Toast", Look.GlassStrong, false);
        Hud.At((RectTransform)t.transform, new Vector2(0.5f, 1), new Vector2(0, -40), new Vector2(820, 70));
        toast = Hud.Label(t.transform, "", 22, Look.Ink, false, 500, 0);
        toast = t.GetComponentInChildren<TextMeshProUGUI>();
        toast.gameObject.SetActive(false);
        t.gameObject.AddComponent<ToastHide>().Text = toast;
        foreach (var img in t.GetComponentsInChildren<Image>(true)) img.enabled = false;

        inspector = Hud.Rect(root, "Inspector");
        Hud.Fill(inspector);
        inspector.gameObject.SetActive(false);
        hint = Hud.Rect(root, "Dawn hint");
        Hud.At(hint, new Vector2(0.5f, 0.5f), new Vector2(0, 60), new Vector2(640, 58));
        hint.gameObject.SetActive(false);
        reactionPanel = Hud.Rect(root, "Reaction");
        heroPanel = Hud.Rect(root, "Hero");
        overPanel = Hud.Rect(root, "Over");
        foreach (var p in new[] { reactionPanel, heroPanel, overPanel }) p.gameObject.SetActive(false);
    }

    void Refresh()
    {
        if (state == null) return;
        Phase = Dawn != null ? "dawn" : "day";
        Persist();
        Board.Sync(state, this);
        endDay.interactable = MyDay;
        endDay.gameObject.SetActive(!Autoplay);
        // Energy: a dot for each left today.
        foreach (Transform c in energyDots) Mats.Kill(c.gameObject);
        int left = Game.ActivePlayer(state) == Me ? Me.PlaysLeft : 0;
        for (int i = 0; i < left; i++)
        {
            var d = Hud.Rect(energyDots, "Dot");
            Hud.At(d, new Vector2(0.5f, 0.5f), new Vector2((i - (left - 1) / 2f) * 19, 0), new Vector2(14, 14));
            var img = d.gameObject.AddComponent<Image>();
            img.sprite = Hud.Rounded;
            img.type = Image.Type.Sliced;
            img.color = i == 0 ? new Color(0.4f, 0.75f, 0.55f) : new Color(0.93f, 0.7f, 0.25f);
        }
        Reaction();
        ShowHint();
        PuzzleTag();
        GameOver();
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
        var t = Hud.Label(card.transform, draw ? "DRAW" : won ? "VICTORY" : "DEFEAT", 38, draw ? Look.Ink : won ? new Color(0.76f, 0.48f, 0.12f) : new Color(0.42f, 0.46f, 0.56f), true, 500, 32, TextAlignmentOptions.Top);
        t.margin = new Vector4(0, 34, 0, 0);
        string why = draw ? $"Every sun went supernova together in round {state.Round}."
            : quitter != null ? $"{(quitter.Id == you ? "You" : "Your rival")} conceded in round {state.Round}."
            : $"The last sun standing after {state.Round} round{(state.Round == 1 ? "" : "s")}.";
        var w = Hud.Label(card.transform, why, 16, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
        w.margin = new Vector4(20, 96, 20, 0);
        if (online) { OnlineEnd(card.transform, quitter != null); return; }
        // (A battle of the run's goes back to the map, what it won waiting there.)
        var menu = campaignOf != null ? Hud.Pill(card.transform, "Continue", BackToCampaign, 17, Look.Ink, Color.white) : Hud.Pill(card.transform, "Return to menu", () => App.Instance?.Menu("hub"), 17, Look.Ink, Color.white);
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
