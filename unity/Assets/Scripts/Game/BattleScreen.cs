using System.Collections;
using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;
using UnityEngine.UI;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// A battle, you against the AI: the rival's side across the top, yours below, your hand along the foot. Tap a card in
/// hand to play it (the AI's judgement picks where it goes and what it aims at); tap one of your ready cards, then a
/// rival card or their sun, to attack. The AI's days play out a move at a time.
/// </summary>
public class BattleScreen : MonoBehaviour
{
    public const float W = 1600, H = 900;
    const float CardW = 132, CardH = 184;

    GameState state;
    /// <summary>Both sides played by the AI (the CI's autoplay for its screenshots).</summary>
    public bool Autoplay;
    public float MoveDelay = 0.7f;
    string you = "p1";
    string selected;
    string message = "";
    RectTransform root;
    bool busy;

    public GameState State => state;

    public void NewBattle(int seed)
    {
        var decks = CardData.Decks.Where(d => d.Mixed != true).ToList();
        var mine = decks[seed % decks.Count];
        var theirs = decks[(seed * 7 + 3) % decks.Count];
        if (theirs == mine) theirs = decks[(seed + 1) % decks.Count];
        state = Game.Create(new GameSetup
        {
            Seed = seed,
            Players = new List<PlayerSetup>
            {
                new PlayerSetup { Name = "Captain", IsAI = Autoplay, Deck = mine.Cards, DeckName = mine.Name },
                new PlayerSetup { Name = "Rival", IsAI = true, Deck = theirs.Cards, DeckName = theirs.Name },
            },
        });
        selected = null;
        message = $"{mine.Name} against {theirs.Name}.";
        Render();
    }

    void Awake()
    {
        root = (RectTransform)transform;
    }

    void Update()
    {
        if (state == null || busy || state.WinnerId != null) return;
        if (AiToMove()) StartCoroutine(AiMove());
        else if (HumanDawnChoice()) Do(AI.DawnChoiceFor(state), "(dawn choice made for you)");
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
        try
        {
            var a = AI.Choose(state);
            state = Game.Apply(state, a);
        }
        catch (System.Exception e)
        {
            Debug.LogError(e);
            message = "The AI stumbled: " + e.Message;
        }
        busy = false;
        Render();
    }

    PlayerState Player(string id) => state.Players.First(p => p.Id == id);
    PlayerState Me => Player(you);
    PlayerState Rival => state.Players.First(p => p.Id != you);
    bool MyDay => state.Reaction == null && Game.ActivePlayer(state).Id == you && state.WinnerId == null && !Autoplay;

    void Do(EngineAction a, string note = null)
    {
        try
        {
            state = Game.Apply(state, a);
            message = note ?? "";
        }
        catch (GameError e)
        {
            message = e.Message;
        }
        selected = null;
        Render();
    }

    // ---- Taps ----

    void TapHand(CardInstance c)
    {
        if (!MyDay) return;
        if (Game.HandCost(c, Me) > Me.PlaysLeft)
        {
            message = $"{Cards.Def(c.DefId).Name} costs {Game.HandCost(c, Me)}: you have {Me.PlaysLeft} energy.";
            Render();
            return;
        }
        var best = AI.BestOf(state, AI.PlaysFor(state, c.Uid));
        if (best == null)
        {
            message = Game.RoomProblem(Me, c.DefId) ?? "It can't be played now.";
            Render();
            return;
        }
        Do(best);
    }

    void TapMine(CardInstance c)
    {
        if (!MyDay) return;
        var why = Game.AttackProblem(state, Me, c.Uid, null, false);
        if (why != null)
        {
            message = $"{Cards.Def(c.DefId).Name}: {why}.";
            selected = null;
        }
        else selected = selected == c.Uid ? null : c.Uid;
        Render();
    }

    void TapRival(CardInstance c)
    {
        if (!MyDay || selected == null) return;
        Do(new EngineAction { Type = "attack", AttackerUid = selected, TargetUid = c.Uid });
    }

    void TapRivalSun()
    {
        if (!MyDay || selected == null) return;
        Do(new EngineAction { Type = "attack", AttackerUid = selected, TargetUid = null });
    }

    void UseAbility(int index)
    {
        var hero = Game.CommandCard(Me);
        var options = new List<EngineAction> { new EngineAction { Type = "heroAbility", Index = index } };
        if (hero != null && Game.AbilityAimable(hero.DefId, index)) options.AddRange((Game.AimChoices(state, Me).Cards ?? new List<CardInstance>()).Select(c => new EngineAction { Type = "heroAbility", Index = index, AimUid = c.Uid }));
        var best = AI.BestOf(state, options);
        if (best == null) message = Game.HeroAbilityProblem(state, Me, index) ?? "Not now.";
        else Do(best);
        Render();
    }

    void Unleash()
    {
        var options = new List<EngineAction> { new EngineAction { Type = "singularity" } };
        options.AddRange((Game.AimChoices(state, Me).Cards ?? new List<CardInstance>()).Select(c => new EngineAction { Type = "singularity", AimUid = c.Uid }));
        var best = AI.BestOf(state, options);
        if (best == null) message = Game.SingularityProblem(state, Me) ?? "Not now.";
        else Do(best);
        Render();
    }

    // ---- Drawing (all of it again after every change: a battle is small) ----

    /// <summary>One move by the AI for whoever is to move (the editor's screenshots step the battle this way).</summary>
    public void Step()
    {
        if (state.WinnerId != null) return;
        state = state.Reaction == null && Game.ActivePlayer(state).DawnChoices?.Count > 0 && Game.ActivePlayer(state).Id == you
            ? Game.Apply(state, AI.DawnChoiceFor(state))
            : Game.Apply(state, AI.Choose(state));
        Render();
    }

    public void Render()
    {
        if (root == null) root = (RectTransform)transform;
        for (int i = root.childCount - 1; i >= 0; i--)
        {
            if (Application.isPlaying) Destroy(root.GetChild(i).gameObject);
            else DestroyImmediate(root.GetChild(i).gameObject);
        }
        if (state == null) return;
        Ui.Fill(Ui.Panel(root, "Background", Ui.Paper).rectTransform);
        DrawSide(Rival, 0, false);
        DrawMiddle(300);
        DrawSide(Me, 430, true);
        DrawHand(690);
        if (state.Reaction != null && state.Reaction.PlayerId == you && !Autoplay) DrawReaction();
        if (state.WinnerId != null) DrawGameOver();
    }

    void DrawSide(PlayerState p, float top, bool mine)
    {
        // Their sun, shields, cards and deck: the bar along the side's outer edge.
        float barY = mine ? top + 210 : top + 10;
        var bar = Ui.Place(Ui.Panel(root, "Bar", new Color(1, 1, 1, 0.8f)).rectTransform, 20, barY, W - 40, 44);
        var sun = Ui.Label(bar, $"{p.Name}   Sun {p.Heat}/{Game.SupernovaThreshold(p)}   Shields {p.Shields}   Hand {p.Hand.Count}   Deck {p.Deck.Count}   Reserves {p.Discard.Count}   Wreckage {p.Wreck?.Count ?? 0}{(p.Lightspeed != null ? "   [trap set]" : "")}", 20, Ui.Ink);
        Ui.Fill(sun.rectTransform, 10);
        if (!mine)
        {
            // Tapping the rival's bar is aiming at their sun.
            var b = bar.gameObject.AddComponent<Button>();
            b.onClick.AddListener(TapRivalSun);
            if (selected != null && Game.AttackProblem(state, Me, selected, null, true) == null) bar.GetComponent<Image>().color = new Color(1f, 0.85f, 0.8f);
        }
        float rowY = mine ? top + 10 : top + 64;
        // The Hero slot, then the five.
        var hero = Game.CommandCard(p);
        DrawSlot(p, hero, -1, 40, rowY, mine);
        for (int s = 0; s < Balance.TableauSlots; s++)
        {
            var c = p.Tableau.FirstOrDefault(x => x.Slot == s);
            DrawSlot(p, c, s, 230 + s * (CardW + 16), rowY, mine);
        }
        // The heat meter: how close to supernova.
        var meter = Ui.Place(Ui.Panel(root, "Meter", new Color(0.88f, 0.89f, 0.92f)).rectTransform, 1120, rowY + 10, 440, 22);
        float f = Mathf.Clamp01((p.Heat - Balance.MinHeat) / (float)(Game.SupernovaThreshold(p) - Balance.MinHeat));
        var fill = Ui.Panel(meter, "Fill", f < 0.5f ? Color.Lerp(Ui.Cool, Ui.Stability, f * 2) : Color.Lerp(Ui.Stability, Ui.Heat, f * 2 - 1)).rectTransform;
        fill.anchorMin = Vector2.zero;
        fill.anchorMax = new Vector2(f, 1);
        fill.offsetMin = fill.offsetMax = Vector2.zero;
        var info = Ui.Label(root, $"{p.DeckName}\nPlanet: {Game.CurrentPlanet(p, state)}   Energy {(Game.ActivePlayer(state) == p ? p.PlaysLeft.ToString() : "-")}", 18, Ui.InkSoft, TextAnchor.UpperLeft);
        Ui.Place(info.rectTransform, 1120, rowY + 44, 440, 80);
    }

    void DrawSlot(PlayerState owner, CardInstance c, int slot, float x, float y, bool mine)
    {
        if (c == null)
        {
            var empty = Ui.Place(Ui.Panel(root, "Slot", new Color(0.88f, 0.89f, 0.92f, 0.6f)).rectTransform, x, y, CardW, CardH);
            var lab = Ui.Label(empty, slot < 0 ? "Hero" : $"Defence {Game.SlotDefence(slot)}", 16, Ui.InkSoft, TextAnchor.MiddleCenter);
            Ui.Fill(lab.rectTransform);
            if (owner.ClosedSlots?.Contains(slot) == true) lab.text = "Wrecked";
            return;
        }
        var view = CardView(c, owner, x, y, CardW, CardH, true);
        var b = view.gameObject.AddComponent<Button>();
        if (mine) b.onClick.AddListener(() => TapMine(c));
        else b.onClick.AddListener(() => TapRival(c));
        if (mine && selected == c.Uid) view.GetComponent<Image>().color = new Color(1f, 0.9f, 0.55f);
        if (!mine && selected != null && Game.AttackProblem(state, Me, selected, c.Uid, true) == null) view.GetComponent<Image>().color = new Color(1f, 0.8f, 0.75f);
    }

    RectTransform CardView(CardInstance c, PlayerState owner, float x, float y, float w, float h, bool inPlay)
    {
        var def = Cards.Def(c.DefId);
        var frame = Ui.Place(Ui.Panel(root, def.Name, Color.white).rectTransform, x, y, w, h);
        var art = EngineData.Art(c.DefId);
        if (art != null)
        {
            var img = Ui.Rect(frame, "Art").gameObject.AddComponent<RawImage>();
            img.texture = art;
            img.raycastTarget = false;
            Ui.Place(img.rectTransform, 4, 4, w - 8, (w - 8) * 0.625f);
        }
        float textTop = 4 + (w - 8) * 0.625f;
        var name = Ui.Label(frame, def.Name, 14, Ui.Ink, TextAnchor.UpperLeft, FontStyle.Bold);
        Ui.Place(name.rectTransform, 6, textTop + 2, w - 12, 34);
        var words = Ui.Label(frame, Ui.CardText(def.Text), 11, Ui.InkSoft, TextAnchor.UpperLeft);
        // (In play its defence line sits above the foot: the words stop short of it.)
        Ui.Place(words.rectTransform, 6, textTop + 34, w - 12, h - textTop - (inPlay ? 78 : 58));
        // Cost, top left; attack and stability along the foot.
        var cost = Ui.Label(frame, (inPlay ? Game.CardCost(c.DefId) : Game.HandCost(c, owner)).ToString(), 18, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold);
        var costBg = Ui.Panel(frame, "Cost", new Color(0.36f, 0.68f, 0.49f));
        Ui.Place(costBg.rectTransform, 6, 6, 26, 26);
        cost.transform.SetParent(costBg.transform, false);
        Ui.Fill(cost.rectTransform);
        int attack = inPlay ? Game.CardAttack(state, owner, c) : Game.BaseAttack(def);
        int stability = inPlay ? c.Health ?? 0 : Game.BaseHealth(c.DefId);
        var foot = Ui.Label(frame, $"{(attack > 0 || inPlay ? $"Atk {attack}" : "")}", 15, Ui.Heat, TextAnchor.LowerLeft, FontStyle.Bold);
        Ui.Place(foot.rectTransform, 6, h - 24, w / 2, 20);
        var stab = Ui.Label(frame, $"Stab {stability}", 15, Ui.Stability, TextAnchor.LowerRight, FontStyle.Bold);
        Ui.Place(stab.rectTransform, w / 2 - 6, h - 24, w / 2, 20);
        if (inPlay)
        {
            var def2 = Ui.Label(frame, $"Def {Game.CardDefence(owner, c)}{((c.Shields ?? 0) > 0 ? $"  Sh {c.Shields}" : "")}", 13, Ui.Cool, TextAnchor.LowerCenter);
            Ui.Place(def2.rectTransform, 0, h - 42, w, 18);
            if (c.Dimmed == true || c.Frozen == true)
            {
                var dim = Ui.Panel(frame, "Dimmed", new Color(0.2f, 0.22f, 0.3f, 0.25f));
                dim.raycastTarget = false;
                Ui.Fill(dim.rectTransform);
            }
        }
        return frame;
    }

    void DrawMiddle(float top)
    {
        var p = Game.ActivePlayer(state);
        var day = Ui.Label(root, $"Day {state.TurnNumber} (round {state.Round}): {p.Name}{(state.Reaction != null ? $" - waiting on {Player(state.Reaction.PlayerId).Name}'s answer" : "")}", 24, Ui.Ink, TextAnchor.UpperLeft, FontStyle.Bold);
        Ui.Place(day.rectTransform, 40, top, 900, 34);
        var log = Ui.Label(root, string.Join("\n", state.Log.Skip(System.Math.Max(0, state.Log.Count - 4)).Select(e => e.Text)), 16, Ui.InkSoft, TextAnchor.UpperLeft);
        Ui.Place(log.rectTransform, 40, top + 36, 1000, 90);
        var note = Ui.Label(root, message, 18, Ui.Heat, TextAnchor.UpperLeft, FontStyle.Italic);
        Ui.Place(note.rectTransform, 1120, top + 4, 440, 50);
        if (!MyDay) return;
        Ui.Place((RectTransform)Ui.Button(root, "End day", () => Do(new EngineAction { Type = "endTurn" }), new Color(0.2f, 0.22f, 0.3f)).transform, 1400, top + 60, 160, 60).GetComponentInChildren<Text>().color = Color.white;
        var hero = Game.CommandCard(Me);
        if (hero == null) return;
        var abilities = Game.HeroAbilities(Me, hero, true);
        for (int i = 0; i < abilities.Count; i++)
        {
            int index = i;
            var b = Ui.Button(root, abilities[i].Name, () => UseAbility(index), Game.HeroAbilityProblem(state, Me, i) == null ? Color.white : new Color(0.85f, 0.86f, 0.9f), 16);
            Ui.Place((RectTransform)b.transform, 1120 + i * 136, top + 60, 128, 60);
        }
        var k = Singularities.Of(hero.DefId);
        if (k != null)
        {
            var sb = Ui.Button(root, $"{k.Name}\n{hero.Charge ?? 0}/{k.Need}", Unleash, Game.SingularityProblem(state, Me) == null ? new Color(1f, 0.85f, 0.5f) : new Color(0.85f, 0.86f, 0.9f), 14);
            Ui.Place((RectTransform)sb.transform, 1120, top - 40, 270, 40);
        }
    }

    void DrawHand(float top)
    {
        var hand = Me.Hand;
        float step = Mathf.Min(CardW + 14, (W - 80 - CardW) / Mathf.Max(1, hand.Count - 1));
        for (int i = 0; i < hand.Count; i++)
        {
            var c = hand[i];
            var view = CardView(c, Me, 40 + i * step, top, CardW, CardH, false);
            var b = view.gameObject.AddComponent<Button>();
            b.onClick.AddListener(() => TapHand(c));
            if (MyDay && Game.HandCost(c, Me) <= Me.PlaysLeft) view.GetComponent<Image>().color = new Color(0.85f, 1f, 0.9f);
        }
    }

    void DrawReaction()
    {
        var r = state.Reaction;
        var panel = Ui.Place(Ui.Panel(root, "Reaction", new Color(1, 1, 1, 0.97f)).rectTransform, 500, 330, 600, 220);
        var title = Ui.Label(panel, "Answer it?", 26, Ui.Ink, TextAnchor.UpperCenter, FontStyle.Bold);
        Ui.Place(title.rectTransform, 0, 16, 600, 40);
        var options = new List<(string, EngineAction)> { ("Let it pass", new EngineAction { Type = "react" }) };
        if (r.Slot) options.Add(("Spring your trap", new EngineAction { Type = "react", Slot = true }));
        foreach (var uid in r.Hand) options.Add(($"Play {Cards.Def(Me.Hand.First(c => c.Uid == uid).DefId).Name}", new EngineAction { Type = "react", CardUid = uid }));
        for (int i = 0; i < options.Count; i++)
        {
            var (label, action) = options[i];
            Ui.Place((RectTransform)Ui.Button(panel, label, () => Do(action), new Color(0.92f, 0.93f, 0.96f), 18).transform, 30 + (i % 3) * 185, 80 + (i / 3) * 64, 175, 54);
        }
    }

    void DrawGameOver()
    {
        var veil = Ui.Panel(root, "Over", new Color(0.95f, 0.95f, 0.96f, 0.92f));
        Ui.Fill(veil.rectTransform);
        var won = state.WinnerId == you;
        var t = Ui.Label(veil.transform, Game.IsDraw(state) ? "A draw" : won ? "Victory" : "Defeat", 64, won ? Ui.Good : Ui.Heat, TextAnchor.MiddleCenter, FontStyle.Bold);
        Ui.Place(t.rectTransform, 0, 300, W, 100);
        Ui.Place((RectTransform)Ui.Button(veil.transform, "New battle", () => NewBattle(Random.Range(1, 100000)), Color.white, 24).transform, W / 2 - 120, 440, 240, 70);
    }
}
