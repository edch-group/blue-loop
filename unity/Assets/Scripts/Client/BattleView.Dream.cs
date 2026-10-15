using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// A dream of the lost, fought on the campaign's map (app.ts armDreamClock, dreamTick, .mid-hint.boss-hint.dream-hint):
/// over the board's middle, "a dream of the lost", its goal and the time left to reach it, a minute and 20 seconds more
/// for each step of its tier, run only on the dreamer's own day (red under 15 seconds); run out, the dream is lost.
/// </summary>
public partial class BattleView
{
    GameState dreamGame;
    float dreamLeft = -1;
    TextMeshProUGUI dreamClock;

    void ArmDreamClock()
    {
        var begun = campaignOf?.State?.Battle?.Game;
        if (dreamLeft >= 0 && dreamGame == begun) return;
        var id = campaignOf?.State?.Battle?.Dream?.Id;
        int tier = DreamsData.Dreams?.FirstOrDefault(x => x.Id == id)?.Tier ?? 1;
        dreamGame = begun;
        dreamLeft = 60 + 20 * tier;
    }

    static string Clock(float left)
    {
        int s = Mathf.Max(0, Mathf.CeilToInt(left));
        return $"{s / 60}:{s % 60:00}";
    }

    void DreamHint()
    {
        ArmDreamClock();
        int days = state.Challenge.Days ?? 1;
        string goal = state.Challenge.Goal == "win" ? (days > 1 ? $"win within {days} days · day {Mathf.Min(days, state.Players[0].TurnsTaken)}" : "win this day") : "survive their day";
        var l = BoardLayout.Current;
        hint.gameObject.SetActive(true);
        PlaceHint();
        var red = Hud.Rgba(194, 64, 28);
        float small = 11.2f, f = Css.Clamp(12.8f, 3.6f * l.Vh, 24), ph = f * 1.2f + 12, span = 13.6f;
        float total = small * 1.2f + 2 + ph + 2 + span * 1.2f;
        float y = total / 2;
        var top = Hud.Label(hint, "A DREAM OF THE LOST", small, red, true, 400, 20);
        Hud.At(top.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0, y - small * 0.6f), new Vector2(Mathf.Min(520, l.W * 0.7f), small * 1.2f));
        y -= small * 1.2f + 2;
        var pill = Hud.Box(hint, "Words", new Color(1, 1, 1, 0.86f), ph / 2);
        Hud.Shadow(pill, ph / 2, new Hud.Drop(Color.white, 0, 0, 1), new Hud.Drop(Hud.Rgba(70, 76, 100, 0.14f), 6, 18));
        var words = Hud.Label(pill.transform, goal.ToUpperInvariant(), f, red, true, 500, 32);
        float w = words.GetPreferredValues(words.text).x + 2 * 18;
        Hud.At(pill.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0, y - ph / 2), new Vector2(w, ph));
        y -= ph + 2;
        dreamClock = Hud.Label(hint, Clock(dreamLeft), span, Look.Ink, false, 400, 0);
        Hud.At(dreamClock.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0, y - span * 0.6f), new Vector2(200, span * 1.2f));
        dreamClock.fontStyle = FontStyles.Normal;
    }

    /// <summary>The dream's clock, run in the dreamer's own day only.</summary>
    void DreamTick()
    {
        if (puzzleKind != null || state == null || state.Challenge?.Kind != "dream" || state.WinnerId != null || dreamLeft < 0) return;
        if (Game.ActivePlayer(state) != state.Players[0]) return;
        dreamLeft -= Time.deltaTime;
        if (dreamClock != null)
        {
            dreamClock.text = Clock(dreamLeft);
            dreamClock.color = dreamLeft < 15 ? Hud.Rgba(194, 64, 28) : Look.Ink;
        }
        if (dreamLeft <= 0)
        {
            dreamLeft = 0;
            Do(new EngineAction { Type = "concede", PlayerId = state.Players[0].Id });
        }
    }
}
