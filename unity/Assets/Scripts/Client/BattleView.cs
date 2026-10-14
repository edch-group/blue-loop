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
public class BattleView : MonoBehaviour
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
    }

    /// <summary>Show a battle as it stands (a state set up elsewhere: a lesson, a puzzle, a picture).</summary>
    public void Load(GameState s)
    {
        state = s;
        Board.Viewer = you;
        Clear();
        Refresh();
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
        yield return new WaitForSeconds(MoveDelay);
        Step();
        busy = false;
    }

    /// <summary>One move by the AI for whoever is to move.</summary>
    public void Step()
    {
        if (state.WinnerId != null) return;
        try
        {
            state = Game.Apply(state, HumanDawnChoice() ? AI.DawnChoiceFor(state) : AI.Choose(state));
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
    bool MyDay => state.Reaction == null && Game.ActivePlayer(state).Id == you && state.WinnerId == null && !Autoplay;

    void Do(EngineAction a)
    {
        try
        {
            state = Game.Apply(state, a);
        }
        catch (GameError e)
        {
            Say(e.Message);
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
            // (Nothing to choose: it's played at once.)
            if (plays.All(o => o.SlotIndex == null) && plays.All(o => Aims(o) == null)) Finish(plays);
            return;
        }
        if (mineInPlay != null)
        {
            Clear();
            if (mineInPlay.Slot == Game.CommandSlot && Game.AttackProblem(state, Me, uid, null, false) != null)
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
        endDay = Hud.Pill(root, "End day", EndDay, 19);
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
            if (i == 2) btn.onClick.AddListener(() => App.Instance?.Menu("hub"));
            if (i == 1) btn.onClick.AddListener(() => Screen.fullScreen = !Screen.fullScreen);
            var ic = Hud.Rect(b.transform, "Icon");
            Hud.At(ic, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(63, 63));
            var raw = ic.gameObject.AddComponent<RawImage>();
            raw.texture = Resources.Load<Texture2D>("Icons/hud-" + icons[i]);
            raw.raycastTarget = false;
        }
        // A word when something can't be done.
        var t = Hud.Glass(root, "Toast", Look.GlassStrong);
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

    void ShowHero()
    {
        foreach (Transform c in heroPanel) Mats.Kill(c.gameObject);
        var hero = Game.CommandCard(Me);
        if (hero == null) return;
        heroPanel.gameObject.SetActive(true);
        var panel = Hud.Glass(heroPanel, "Panel");
        Hud.At((RectTransform)panel.transform, new Vector2(0.5f, 0.5f), new Vector2(0, 60), new Vector2(900, 420));
        // The Hero's face, large, and its abilities beside it.
        var face = Hud.Rect(panel.transform, "Face");
        Hud.At(face, new Vector2(0, 0.5f), new Vector2(30, 0), new Vector2(260, 364));
        var raw = face.gameObject.AddComponent<RawImage>();
        raw.texture = Faces.Of(hero.DefId, false);
        var abilities = Game.HeroAbilities(Me, hero, true);
        for (int i = 0; i < abilities.Count; i++)
        {
            int index = i;
            var why = Game.HeroAbilityProblem(state, Me, i);
            var b = Hud.Pill(panel.transform, abilities[i].Name, () => UseAbility(index), 20);
            b.interactable = why == null;
            Hud.At((RectTransform)b.transform, new Vector2(0, 1), new Vector2(330, -40 - i * 86), new Vector2(520, 70));
        }
        var k = Singularities.Of(hero.DefId);
        if (k != null)
        {
            var b = Hud.Pill(panel.transform, $"{k.Name}  {hero.Charge ?? 0}/{k.Need}", Unleash, 20, new Color(1f, 0.93f, 0.78f));
            b.interactable = Game.SingularityProblem(state, Me) == null;
            Hud.At((RectTransform)b.transform, new Vector2(0, 1), new Vector2(330, -40 - abilities.Count * 86), new Vector2(520, 70));
        }
        var close = Hud.Pill(panel.transform, "Close", () => { heroPanel.gameObject.SetActive(false); }, 18);
        Hud.At((RectTransform)close.transform, new Vector2(1, 0), new Vector2(-26, 26), new Vector2(170, 58));
    }

    void UseAbility(int index)
    {
        var hero = Game.CommandCard(Me);
        var opts = new List<EngineAction> { new EngineAction { Type = "heroAbility", Index = index } };
        if (hero != null && Game.AbilityAimable(hero.DefId, index)) opts.AddRange((Game.AimChoices(state, Me).Cards ?? new List<CardInstance>()).Select(c => new EngineAction { Type = "heroAbility", Index = index, AimUid = c.Uid }));
        var best = AI.BestOf(state, opts);
        if (best == null) Say(Game.HeroAbilityProblem(state, Me, index) ?? "Not now.");
        else Do(best);
    }

    void Unleash()
    {
        var opts = new List<EngineAction> { new EngineAction { Type = "singularity" } };
        opts.AddRange((Game.AimChoices(state, Me).Cards ?? new List<CardInstance>()).Select(c => new EngineAction { Type = "singularity", AimUid = c.Uid }));
        var best = AI.BestOf(state, opts);
        if (best == null) Say(Game.SingularityProblem(state, Me) ?? "Not now.");
        else Do(best);
    }

    void GameOver()
    {
        foreach (Transform c in overPanel) Mats.Kill(c.gameObject);
        bool over = state.WinnerId != null && !Autoplay;
        overPanel.gameObject.SetActive(over);
        if (!over) return;
        Hud.Fill(overPanel);
        var veil = overPanel.gameObject.GetComponent<Image>() ?? overPanel.gameObject.AddComponent<Image>();
        veil.color = new Color(0.96f, 0.96f, 0.95f, 0.85f);
        bool won = state.WinnerId == you;
        var t = Hud.Label(overPanel, Game.IsDraw(state) ? "A DRAW" : won ? "VICTORY" : "DEFEAT", 96, won ? Look.Gold : Look.Danger, true, 700, 40);
        t.rectTransform.offsetMin = new Vector2(0, 120);
        var again = Hud.Pill(overPanel, "New battle", () => NewBattle(Random.Range(1, 100000)), 24);
        Hud.At((RectTransform)again.transform, new Vector2(0.5f, 0.5f), new Vector2(0, -90), new Vector2(320, 80));
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
