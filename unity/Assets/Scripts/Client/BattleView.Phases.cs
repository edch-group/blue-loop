using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;

/// <summary>
/// The day's phases on the phase track (app.ts announceTurn, announcePhases, setPhase, flashPhase): each day runs dawn,
/// day, dusk. As a day ends, dusk ticks in (the dusk's effects), then the next player's "dawn" banner (their dawn
/// effects play out), then their day ticks in once the dawn has played out. The phase coming in lights up a moment: a
/// soft glow swelling round it and its dot pulsing (Board.FlashPhase).
/// </summary>
public partial class BattleView
{
    /// <summary>
    /// app.ts announceTurn: the game begun on the viewer's own day: dawn's banner (lighting dawn), then day ticks in once
    /// it has gone. (The AI's, or anyone else's, opens with no banner.)
    /// </summary>
    void AnnounceTurn(float delay)
    {
        var s = state;
        if (s == null || s.WinnerId != null || Autoplay || !Application.isPlaying) return;
        var p = Game.ActivePlayer(s);
        if (p.IsAI || p.Id != you) return;
        DawnBanner(s, delay, () => SetPhase("dawn"));
        StartCoroutine(After(delay + BannerShown + 0.15f, () => { if (state != null) { SetPhase("day"); Refresh(); } }));
    }

    /// <summary>
    /// app.ts announcePhases: a day passed on, laid out by its timeline (DayTimeline): dusk ticking in (if its effects
    /// did something), the dawn's banner (lighting dawn as it comes), and the day once the dawn has played out.
    /// </summary>
    void AnnouncePhases(GameState next, (float? dusk, float? dawn, float day, List<float> pulses) t)
    {
        if (next.WinnerId != null) return;
        // (Until the day's banner, it isn't day: no cards are played but Lightspeed ones.)
        Phase = t.dusk != null ? "dusk" : "dawn";
        Board.ShowPhase(Phase);
        if (t.dusk != null) StartCoroutine(After(t.dusk.Value, () => SetPhase("dusk")));
        if (t.dawn != null) DawnBanner(next, t.dawn.Value, () => SetPhase("dawn"));
        StartCoroutine(After(t.day, () =>
        {
            SetPhase("day");
            // (The hand's cards light up as playable now it is day.)
            if (state != null && Game.ActivePlayer(state).Id == you) Refresh();
        }));
    }

    /// <summary>app.ts setPhase: the phase under way lit on the track; one coming in flashes.</summary>
    void SetPhase(string phase)
    {
        bool changed = phase != Phase;
        Phase = phase;
        if (Board == null) return;
        Board.ShowPhase(phase);
        if (changed) Board.FlashPhase(phase);
    }

    /// <summary>
    /// A reaction window someone else answers (app.ts renderReaction's .react-wait): "⚡ name may answer…" in a white
    /// pill at the top of the screen, 14 px down, its words 0.85rem spaced 0.06em, the ⚡ amber.
    /// </summary>
    void ReactWait()
    {
        var old = chrome != null ? chrome.Find("React wait") : null;
        if (old != null) Mats.Kill(old.gameObject);
        var r = state?.Reaction;
        if (r == null || state.WinnerId != null || chrome == null) return;
        var who = state.Players.FirstOrDefault(p => p.Id == r.PlayerId);
        if (who == null) return;
        bool answering = !who.IsAI && (!online || who.Id == you);
        if (answering) return;
        string text = $"<b><color=#b07a1c>⚡</color></b> {who.Name.ToLowerInvariant()} may answer…";
        // (Padded 8 × 16, round, a soft shadow 0 6px 20px.)
        const float size = 13.6f;
        float w = Hud.Wide($"⚡ {who.Name.ToLowerInvariant()} may answer…", size, 400, 6, 16, false) + 2, h = size * 1.2f + 16;
        var pill = Hud.Box(chrome, "React wait", new Color(1, 1, 1, 0.95f), h / 2);
        Hud.Shadow(pill, h / 2, new Hud.Drop(Hud.Rgba(70, 70, 90, 0.18f), 6, 20));
        Hud.At((RectTransform)pill.transform, new Vector2(0.5f, 1), new Vector2(0, -14), new Vector2(w, h));
        Hud.Label(pill.transform, text, size, Look.Ink, false, 400, 6);
    }
}
