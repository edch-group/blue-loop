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
    Button endDay;
    TextMeshProUGUI toast, energyLabel;
    RectTransform energyDots, reactionPanel, heroPanel, overPanel;
    float toastUntil;

    public GameState State => state;

    public static BattleView Make()
    {
        var cam = new GameObject("Camera").AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.93f, 0.93f, 0.91f);
        cam.fieldOfView = 30;
        cam.nearClipPlane = 0.1f;
        cam.farClipPlane = 100;
        cam.transform.position = new Vector3(0.2f, 15.2f, -11.4f);
        cam.transform.LookAt(new Vector3(0.2f, 0, -0.75f));
        var v = new GameObject("Battle").AddComponent<BattleView>();
        v.Cam = cam;
        v.Board = Board.Make(cam);
        v.BuildHud();
        return v;
    }

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

    // ---- The loop ----

    void Update()
    {
        if (toast != null) toast.gameObject.SetActive(Time.time < toastUntil);
        if (state == null || state.WinnerId != null) return;
        if (!busy && AiToMove()) StartCoroutine(AiMove());
        else if (!busy && HumanDawnChoice()) Do(AI.DawnChoiceFor(state));
        if (!Autoplay && Input.GetMouseButtonDown(0) && !OverHud()) Tap();
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
        if (!MyDay || picked == null || !slot.Mine) return;
        var here = options.Where(o => o.SlotIndex == slot.Slot).ToList();
        if (here.Count == 0) return;
        options = here;
        if (here.All(o => Aims(o) == null) || here.Select(Aims).Distinct().Count() == 1) Finish(here);
    }

    void TapSun(string playerId)
    {
        if (!MyDay || playerId == you) return;
        if (attacker != null) Do(new EngineAction { Type = "attack", AttackerUid = attacker, TargetUid = null });
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
        if (inPlay)
        {
            if (c.Uid == attacker) rim = Look.Pick;
            else if (attacker != null && owner.Id != you && Game.AttackProblem(state, Me, attacker, c.Uid, true) == null) rim = Look.Aim;
            else if (picked != null && options != null && options.Any(o => Aims(o) == c.Uid)) rim = Look.Aim;
            else if (MyDay && owner.Id == you && attacker == null && picked == null && Game.AttackProblem(state, Me, c.Uid, null, false) == null) { rim = Look.Aim; strength = 0.45f; }
        }
        else
        {
            if (c.Uid == picked) rim = Look.Pick;
            else if (MyDay && Game.HandCost(c, owner) <= owner.PlaysLeft && AI.PlaysFor(state, c.Uid).Count > 0) { rim = Look.Good; strength = 0.6f; }
        }
        v.Rim(rim, strength);
    }

    /// <summary>How far a card in hand is held up (a picked card, most).</summary>
    public float HandLift(CardInstance c) => c.Uid == picked ? 1f : 0;

    // ---- The screen's own layer ----

    void BuildHud()
    {
        hud = Hud.Canvas(Cam);
        var root = hud.transform;
        // End Day, and your energy over it.
        endDay = Hud.Pill(root, "End day", () => { if (MyDay) Do(new EngineAction { Type = "endTurn" }); }, 26);
        Hud.At((RectTransform)endDay.transform, new Vector2(1, 0), new Vector2(-34, 34), new Vector2(270, 84));
        var energy = Hud.Rect(root, "Energy");
        Hud.At(energy, new Vector2(1, 0), new Vector2(-34, 128), new Vector2(270, 70));
        energyLabel = Hud.Label(energy, "ENERGY", 22, Look.InkSoft, true, 500, 16, TextAlignmentOptions.Top);
        energyDots = Hud.Rect(energy, "Dots");
        Hud.At(energyDots, new Vector2(0.5f, 0), Vector2.zero, new Vector2(270, 28));
        // The pace: normal, auto, skip.
        var pace = Hud.Glass(root, "Pace", Look.GlassStrong);
        Hud.At((RectTransform)pace.transform, new Vector2(0, 0), new Vector2(34, 34), new Vector2(380, 66));
        var names = new[] { "Normal", "Auto", "Skip" };
        for (int i = 0; i < 3; i++)
        {
            var seg = Hud.Rect(pace.transform, names[i]);
            Hud.At(seg, new Vector2(0, 0.5f), new Vector2(8 + i * 122, 0), new Vector2(118, 50));
            if (i == 0)
            {
                var on = seg.gameObject.AddComponent<Image>();
                on.sprite = Hud.Rounded;
                on.type = Image.Type.Sliced;
                on.color = Look.Ink;
            }
            Hud.Label(seg, names[i].ToUpperInvariant(), 20, i == 0 ? Color.white : Look.InkSoft, true, 500, 10);
        }
        // The corner buttons: menu, full screen, settings.
        string[] glyphs = { "≡", "⛶", "⚙" };
        for (int i = 0; i < 3; i++)
        {
            var b = Hud.Glass(root, "Corner " + i, Look.GlassStrong);
            Hud.At((RectTransform)b.transform, new Vector2(1, 1), new Vector2(-30 - (2 - i) * 98, -26), new Vector2(84, 84));
            Hud.Label(b.transform, glyphs[i], 36, Look.Ink, false, 500, 0);
        }
        // A word when something can't be done.
        var t = Hud.Glass(root, "Toast", Look.GlassStrong);
        Hud.At((RectTransform)t.transform, new Vector2(0.5f, 1), new Vector2(0, -40), new Vector2(820, 70));
        toast = Hud.Label(t.transform, "", 22, Look.Ink, false, 500, 0);
        toast = t.GetComponentInChildren<TextMeshProUGUI>();
        toast.gameObject.SetActive(false);
        t.gameObject.AddComponent<ToastHide>().Text = toast;

        reactionPanel = Hud.Rect(root, "Reaction");
        heroPanel = Hud.Rect(root, "Hero");
        overPanel = Hud.Rect(root, "Over");
        foreach (var p in new[] { reactionPanel, heroPanel, overPanel }) p.gameObject.SetActive(false);
    }

    void Refresh()
    {
        if (state == null) return;
        Board.Sync(state, this);
        endDay.interactable = MyDay;
        endDay.gameObject.SetActive(!Autoplay);
        // Energy: a dot for each left today.
        foreach (Transform c in energyDots) Mats.Kill(c.gameObject);
        int left = Game.ActivePlayer(state) == Me ? Me.PlaysLeft : 0;
        for (int i = 0; i < left; i++)
        {
            var d = Hud.Rect(energyDots, "Dot");
            Hud.At(d, new Vector2(0.5f, 0.5f), new Vector2((i - (left - 1) / 2f) * 32, 0), new Vector2(24, 24));
            var img = d.gameObject.AddComponent<Image>();
            img.sprite = Hud.Rounded;
            img.type = Image.Type.Sliced;
            img.color = i == 0 ? new Color(0.4f, 0.75f, 0.55f) : new Color(0.93f, 0.7f, 0.25f);
        }
        Reaction();
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
    void Update() => GetComponent<Image>().enabled = Text != null && Text.gameObject.activeSelf;
}
