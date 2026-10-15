using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;

/// <summary>
/// Ending your day as the web's (app.ts requestEndDay, leftUndone, scheduleAutoEnd, onKey): Enter OKs the rival's card or
/// ends the day; with something still to do, you are asked first; with nothing left you can do, the day ends by itself
/// once the board has settled.
/// </summary>
public partial class BattleView
{
    const float AutoEnd = 0.25f;
    /// <summary>When the day (after its dawn's banner and effects) is under way: before it, it is still dawn.</summary>
    float dayFrom;
    float settledSince = -1;
    bool askingEnd;

    /// <summary>app.ts leftUndone: what you could still do today (cards you can play, cards that can attack, the Hero's ability).</summary>
    List<string> LeftUndone()
    {
        // (Asked every frame while the day waits on you: worked out once a state, and again as the dawn ends.)
        bool day = Time.time >= dayFrom;
        if (leftFor == state && leftDay == day && leftCache != null) return leftCache;
        leftFor = state;
        leftDay = day;
        return leftCache = WorkLeftUndone();
    }

    GameState leftFor;
    bool leftDay;
    List<string> leftCache;

    List<string> WorkLeftUndone()
    {
        var me = Game.ActivePlayer(state);
        var o = new List<string>();
        int playable = me.Hand.Count(c => CanPlayNow(me, c.DefId, c.Discount ?? 0));
        if (playable > 0) o.Add($"{playable} playable card{(playable == 1 ? "" : "s")}");
        var aims = Game.AimChoices(state, me, true);
        int attackers = aims != null && (aims.Sun || aims.Cards.Count > 0) ? me.Tableau.Count(c => c.Dimmed != true && Game.CardAttack(state, me, c) > 0) : 0;
        if (attackers > 0) o.Add($"{attackers} card{(attackers == 1 ? "" : "s")} that can still attack");
        var hero = Game.CommandCard(me);
        if (hero != null && Enumerable.Range(0, Game.HeroAbilities(me, hero).Count).Any(i => Game.HeroAbilityProblem(state, me, i) == null)) o.Add($"{Cards.Def(hero.DefId).Name}'s ability");
        return o;
    }

    /// <summary>app.ts canPlayNow: a card in hand you could play now (by day; a Lightspeed one at any time).</summary>
    bool CanPlayNow(PlayerState me, string defId, int discount)
    {
        if (Time.time < dayFrom && !Game.IsLightspeed(defId)) return false;
        return (Mathf.Max(0, Game.CardCost(defId) - discount) <= me.PlaysLeft && Game.HasRoomFor(me, defId) && (Cards.Def(defId).Kind != "trap" || Game.CanSetTrap(me))) || Game.CanSetFaceDown(me, defId);
    }

    /// <summary>app.ts requestEndDay: end the day, asking first if there is still something you could do.</summary>
    void RequestEndDay()
    {
        if (state == null || !MyDay || Dawn != null) return;
        if (pending != null || attacker != null) return;
        if (discarding != null) { EndDay(); return; }
        var left = LeftUndone();
        if (left.Count > 0 && !askingEnd)
        {
            CloseSheet();
            askingEnd = true;
            string still = left.Count > 1 ? $"{string.Join(", ", left.Take(left.Count - 1))} and {left[left.Count - 1]}" : left[0];
            sheet = Hud.Sheet(Layer, "end your day?", new[]
            {
                new Hud.Row($"end day\nstill to do: {still}", () => { CloseSheet(); EndDay(); }, null, true),
                new Hud.Row("keep playing", CloseSheet),
            }, CloseSheet);
            return;
        }
        CloseSheet();
        EndDay();
    }

    /// <summary>app.ts canAutoEnd: nothing you can do today, nothing open, nothing playing out.</summary>
    bool CanAutoEnd() =>
        state != null && state.WinnerId == null && MyDay && !online && Dawn == null && pending == null && attacker == null
        && stage == null && sheet == null && landing == null && drag == null && attackDrag == null && discarding == null
        && (heroPanel == null || !heroPanel.gameObject.activeSelf) && relicPanel == null && !inspector.gameObject.activeSelf
        && Time.time >= dayFrom && Time.time >= bannerFree && hud.transform.Find("Banner") == null && LeftUndone().Count == 0;

    /// <summary>Each frame: Enter, and the day ending by itself once settled for a moment.</summary>
    void EndDayTick()
    {
        // (While Oriel's tour shows, its keys are its own and the day never ends by itself: tour.ts, canAutoEnd.)
        if (Tour.Showing) { settledSince = -1; return; }
        if (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter))
        {
            if (stage != null && stage.Confirm) ConfirmStage();
            else if (sheet == null || askingEnd) RequestEndDay();
        }
        if (sheet == null) askingEnd = false;
        EndReady();
        if (!CanAutoEnd()) { settledSince = -1; return; }
        if (settledSince < 0) settledSince = Time.time;
        else if (Time.time - settledSince >= AutoEnd)
        {
            settledSince = -1;
            EndDay();
        }
    }

    /// <summary>
    /// app.ts renderTurnControls' .end-turn-ready: End Day, on your day, with no card in hand you could play now,
    /// pulses (@keyframes endReady, 1.8 s ease-in-out, three times as it begins: at its height a 2 px white ring and a
    /// green glow, 0 0 18px rgba(110, 196, 146, .55)).
    /// </summary>
    void EndReady()
    {
        if (endDay == null) return;
        bool ready = MyDay && Phase == "day" && !Me.Hand.Any(c => CanPlayNow(Me, c.DefId, c.Discount ?? 0));
        var pulse = endDay.GetComponent<EndPulse>() ?? endDay.gameObject.AddComponent<EndPulse>();
        pulse.Ready = ready;
    }

    class EndPulse : MonoBehaviour
    {
        public bool Ready;
        bool was;
        float t0 = -1;
        UnityEngine.UI.Image ring, glow;

        void Update()
        {
            if (Ready && !was) t0 = Time.time;
            if (!Ready) t0 = -1;
            was = Ready;
            float k = 0;
            if (t0 >= 0)
            {
                float t = (Time.time - t0) / 1.8f;
                if (t >= 3) t0 = -1;
                // (ease-in-out to the middle and back: cubic-bezier(.42, 0, .58, 1) over each half.)
                else k = BattleView.CubicBezier(0.42f, 0, 0.58f, 1, 1 - Mathf.Abs((t % 1) * 2 - 1));
            }
            if (k <= 0 && ring == null) return;
            if (ring == null) Make();
            ring.color = new Color(1, 1, 1, k);
            glow.color = new Color(110 / 255f, 196 / 255f, 146 / 255f, 0.55f * k);
        }

        /// <summary>The glow and the ring, just under the button (as its box-shadow is), where it stands.</summary>
        void Make()
        {
            var r = (RectTransform)transform;
            glow = Layer("End ready glow", 18 * 1.25f, Hud.Soft, 14.4f / 18);
            ring = Layer("End ready ring", 2, Hud.Rounded, 22f / (10 + 2));
            UnityEngine.UI.Image Layer(string name, float e, Sprite sprite, float ppu)
            {
                var go = new GameObject(name, typeof(RectTransform));
                var s = (RectTransform)go.transform;
                s.SetParent(r.parent, false);
                s.SetSiblingIndex(r.GetSiblingIndex());
                s.anchorMin = r.anchorMin;
                s.anchorMax = r.anchorMax;
                s.pivot = r.pivot;
                s.offsetMin = r.offsetMin - new Vector2(e, e);
                s.offsetMax = r.offsetMax + new Vector2(e, e);
                var img = go.AddComponent<UnityEngine.UI.Image>();
                img.sprite = sprite;
                img.type = UnityEngine.UI.Image.Type.Sliced;
                img.pixelsPerUnitMultiplier = ppu;
                img.raycastTarget = false;
                img.color = Color.clear;
                return img;
            }
        }

        void OnDestroy()
        {
            if (ring != null) Destroy(ring.gameObject);
            if (glow != null) Destroy(glow.gameObject);
        }
    }
}
