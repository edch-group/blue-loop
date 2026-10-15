using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// The AI's pace (app.ts scheduleAI, AI_PAUSE): after each move a pause for the kind of move it was (scaled by the game
/// speed), the AI making up its mind as the pause begins and being seen to, a card of its hand or two lifted as it
/// thinks, ending on the one it plays. Online, your rival sees which card of your hand you hover, and you theirs.
/// </summary>
public partial class BattleView
{
    /// <summary>app.ts AI_PAUSE: the pause after each kind of move, before the AI's next (seconds at normal speed).</summary>
    static float AiPause(string type)
    {
        switch (type)
        {
            case "reclaim": return 0.8f;
            case "playCard": return 1.7f;
            case "setTarget": return 0.5f;
            case "endTurn": return 1.2f;
            case "heroSkill": case "heroAbility": return 1.4f;
            case "singularity": return 2.2f;
            case "attack": return 1.3f;
            case "dawnChoice": return 1.1f;
            case "react": return 1;
            default: return 0;
        }
    }

    /// <summary>The pause the AI takes next (seconds at normal speed), from when the board is clear for it.</summary>
    float aiPause = 0.9f;
    /// <summary>The AI's move made up, and when it goes (-1: none waiting).</summary>
    float aiAt = -1;
    GameState aiFor;
    EngineAction aiNext;
    /// <summary>Its hovers over its hand as it thinks: when, and which card (null: none).</summary>
    readonly List<(float at, int? i)> aiHovers = new List<(float, int?)>();
    /// <summary>The card of the rival's hand they are hovering (by place), lifted out of their fan.</summary>
    int? rivalHover;

    /// <summary>The game begun (app.ts begin): the day under way, the AI's first move 0.9 s off, the reward's game noted, the viewer's dawn announced.</summary>
    void Begin()
    {
        Phase = "day";
        rivalHover = null;
        sentHover = null;
        ScheduleAI(0.9f);
        BeginAiGame();
        BeginStats();
        AnnounceTurn(0.4f);
    }

    /// <summary>app.ts scheduleAI: the AI's next move after `pause` (seconds at normal speed, scaled by the game speed).</summary>
    void ScheduleAI(float pause)
    {
        aiPause = pause;
        aiAt = -1;
        aiFor = null;
        aiNext = null;
        aiHovers.Clear();
    }

    /// <summary>Each frame: the AI's mind made up once the board is clear for it, its hovers, then its move.</summary>
    void AiTick()
    {
        if (aiAt < 0 && !busy && StageClear && AiToMove()) PlanAI();
        if (aiAt < 0) return;
        while (aiHovers.Count > 0 && Time.time >= aiHovers[0].at)
        {
            var h = aiHovers[0];
            aiHovers.RemoveAt(0);
            if (state == aiFor) SetRivalHover(h.i);
        }
        if (Time.time < aiAt) return;
        var s = aiFor;
        var a = aiNext;
        aiAt = -1;
        aiFor = null;
        aiNext = null;
        aiHovers.Clear();
        rivalHover = null;
        if (state == s && state.WinnerId == null) Step(a);
    }

    /// <summary>
    /// The AI makes up its mind now, and is seen to: it hovers a card of its hand or two as it thinks, ending on the one
    /// it plays. (A reaction window: an AI answering decides after a moment.)
    /// </summary>
    void PlanAI()
    {
        var s = state;
        EngineAction a = null;
        try { a = HumanDawnChoice() ? AI.DawnChoiceFor(s) : AI.Choose(s); }
        catch (System.Exception e) { Debug.LogError(e); }
        aiFor = s;
        aiNext = a;
        aiHovers.Clear();
        if (s.Reaction != null)
        {
            aiAt = Time.time + AiPause("react") * SpeedK;
            return;
        }
        float wait = aiPause * SpeedK;
        aiAt = Time.time + wait;
        var ai = Game.ActivePlayer(s);
        int n = ai.Hand.Count;
        int played = a?.Type == "playCard" ? ai.Hand.FindIndex(c => c.Uid == a.CardUid) : -1;
        if (n == 0 || wait < 0.35f || ai.Id == you || !Application.isPlaying) return;
        int Other() => Random.Range(0, n);
        if (Random.value < 0.7f) aiHovers.Add((Time.time + wait * 0.15f, Other()));
        if (played >= 0) aiHovers.Add((Time.time + Mathf.Max(wait * 0.35f, wait - 0.65f), played));
        else if (Random.value < 0.5f) aiHovers.Add((Time.time + wait * 0.5f, Other()));
        if (played < 0) aiHovers.Add((Time.time + wait * 0.85f, null));
        aiHovers.Sort((x, y) => x.at.CompareTo(y.at));
    }

    /// <summary>Lift a card of the rival's hand (or none), in place (app.ts setRivalHover).</summary>
    public void SetRivalHover(int? i)
    {
        rivalHover = i;
        if (rivalHand == null) return;
        int k = 0;
        foreach (Transform c in rivalHand)
        {
            var lift = c.GetComponent<RivalLift>();
            if (lift != null) lift.Lifted = i == k;
            k++;
        }
    }

    /// <summary>Online: the card of your hand under your pointer (by place; null: none), last sent to your rival.</summary>
    int? sentHover;

    /// <summary>Online, your rival sees which card of your hand you hover (by place, never which card: app.ts onLiftChange).</summary>
    void SendHover(string uid)
    {
        if (!online || state == null) return;
        int i = uid != null ? Me.Hand.FindIndex(c => c.Uid == uid) : -1;
        int? at = i >= 0 ? i : (int?)null;
        if (at == sentHover) return;
        sentHover = at;
        Online.Hover(at);
    }

    /// <summary>
    /// A card of the rival's hand lifting out of their fan or settling back (.rh-card.lifted: translateY(32% of its
    /// height) along its turn, its shadow deepening from 0 3px 10px .22 to 0 8px 18px .3; 0.28 s,
    /// cubic-bezier(.2,.8,.2,1)).
    /// </summary>
    public class RivalLift : MonoBehaviour
    {
        public bool Lifted;
        RectTransform lift;
        float h, k, from, t0 = -1;
        bool was;

        public void Init(RectTransform frame, float height, bool lifted)
        {
            lift = frame;
            h = height;
            Lifted = was = lifted;
            k = from = lifted ? 1 : 0;
            Show();
        }

        void Update()
        {
            if (Lifted != was)
            {
                was = Lifted;
                from = k;
                t0 = Time.time;
            }
            if (t0 < 0) return;
            float p = Mathf.Clamp01((Time.time - t0) / 0.28f);
            float e = CubicBezier(0.2f, 0.8f, 0.2f, 1, p);
            k = Mathf.Lerp(from, Lifted ? 1 : 0, e);
            if (p >= 1) t0 = -1;
            Show();
        }

        void Show()
        {
            if (lift == null) return;
            lift.anchoredPosition = new Vector2(0, -0.32f * h * k);
            var shadow = lift.Find("Shadow") as RectTransform;
            if (shadow == null) return;
            // (The resting shadow's reach and drop, grown to the lifted one's: 18 px of blur for 10, 8 px down for 3.)
            float w = h / 1.4f, grow = Mathf.Lerp(1, 1.8f, k), down = Mathf.Lerp(0.04f, 0.04f * 8 / 3, k) * w, reach = 0.15f * w * grow;
            shadow.offsetMin = new Vector2(-reach, -reach - down);
            shadow.offsetMax = new Vector2(reach, reach - down);
            var img = shadow.GetComponent<UnityEngine.UI.Image>();
            if (img != null) img.color = new Color(50 / 255f, 56 / 255f, 80 / 255f, Mathf.Lerp(0.3f, 0.3f * 0.3f / 0.22f, k));
        }
    }
}
