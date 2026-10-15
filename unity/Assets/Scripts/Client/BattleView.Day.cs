using System.Collections;
using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;
using UnityEngine.UI;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// A day's turn, as app.ts plays it (dayTimeline, replayPulses, startWave): the dusk's effects, the dawn's banner, then
/// the dawn's effects one by one (each card that fires lighting up, its heat, cooling or shield flying from it to the
/// sun or card it reaches, whose numbers change as it lands; the table's heat a wave from the Stellari), and then the
/// day. Cards that faded at dawn wait in their slots until it is over.
/// </summary>
public partial class BattleView
{
    const float PulseStep = 0.72f, WaveTime = 0.55f, WaveExtra = 0.45f, RageIn = 0.2f;

    float SpeedK => SpeedFactor[System.Array.IndexOf(Speeds, Speed)];

    static bool IsWave(TurnPulse p) => p.Kind == "unstable" && p.Uid == null;

    /// <summary>app.ts dayTimeline: when the dusk's tick, the dawn's banner, the day, and each effect come (seconds).</summary>
    (float? dusk, float? dawn, float day, List<float> pulses) DayTimeline(GameState next, PlayerState actor)
    {
        var now = Game.ActivePlayer(next);
        bool wantsDusk = next.LastDusk != null && next.LastDusk.PlayerId == actor.Id && next.LastDusk.Acted;
        float step = PulseStep * SpeedK;
        float? dusk = null, dawn = null;
        float t = 0;
        void Banner(string phase)
        {
            if (phase == "dawn" && wantsDusk && dusk == null) Banner("dusk");
            if (phase == "dusk" ? !wantsDusk || dusk != null : dawn != null) return;
            if (phase == "dusk") { dusk = t; t += 0.35f; }
            else { dawn = t; t += BannerShown + 0.15f; }
        }
        var pulses = new List<float>();
        string ph = "dawn";
        float lastAt = t;
        bool any = false;
        foreach (var p in next.TurnPulses ?? new List<TurnPulse>())
        {
            if (p.Kind == "start")
            {
                ph = p.Source == now.Id ? "dawn" : "dusk";
                continue;
            }
            Banner(ph);
            if (!any) t = Mathf.Max(t, 0.3f);
            any = true;
            float when = p.Together == true ? lastAt : t;
            lastAt = when;
            pulses.Add(when);
            if (p.Together != true) t += step + (IsWave(p) ? WaveExtra : 0);
        }
        Banner("dawn");
        return (dusk, dawn, any ? t + 0.4f : t, pulses);
    }

    /// <summary>Whether this move's dawn is replayed effect by effect (and so its hits are shown by the replay).</summary>
    static bool Replays(GameState next, EngineAction a) => a.Type == "endTurn" && (next.TurnPulses ?? new List<TurnPulse>()).Any(p => p.Kind != "start");

    /// <summary>A copy of a player with a sun's numbers (heat, shields, alive) as the replay shows them.</summary>
    static PlayerState WithSun(PlayerState p, SunAt sun)
    {
        var c = (PlayerState)typeof(PlayerState).GetMethod("MemberwiseClone", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic).Invoke(p, null);
        c.Heat = sun.Heat;
        c.Shields = sun.Shields;
        c.Eliminated = sun.Eliminated;
        return c;
    }

    /// <summary>A rectangle of the page round a point of the table, `half` either way along it (x) and across it (z).</summary>
    Rect? TableRect(Vector3 centre, float halfX, float halfZ)
    {
        if (Cam == null) return null;
        var pts = new[] { centre + new Vector3(-halfX, 0, -halfZ), centre + new Vector3(halfX, 0, -halfZ), centre + new Vector3(-halfX, 0, halfZ), centre + new Vector3(halfX, 0, halfZ) }
            .Select(w => Page(Cam.WorldToScreenPoint(w))).ToArray();
        float x0 = pts.Min(p => p.x), x1 = pts.Max(p => p.x), y0 = pts.Min(p => p.y), y1 = pts.Max(p => p.y);
        return new Rect(x0, y0, x1 - x0, y1 - y0);
    }

    /// <summary>
    /// app.ts replayPulses: the day's effects one by one, at `times` (seconds from now). Returns when the last has
    /// landed (and the suns show as they really are).
    /// </summary>
    float ReplayPulses(GameState prev, GameState next, List<float> times)
    {
        var all = next.TurnPulses ?? new List<TurnPulse>();
        var steps = all.Where(p => p.Kind != "start").ToList();
        float step = PulseStep * SpeedK;
        // Every sun starts where it was as the turn began (shields already faded).
        var start = all.FirstOrDefault(p => p.Kind == "start")?.Suns ?? prev.Players.ToDictionary(p => p.Id, p => new SunAt { Heat = p.Heat, Shields = p.Shields, Eliminated = p.Eliminated });
        var shown = new Dictionary<string, SunAt>();
        foreach (var p in next.Players) shown[p.Id] = start.TryGetValue(p.Id, out var s0) ? s0 : new SunAt { Heat = p.Heat, Shields = p.Shields, Eliminated = p.Eliminated };
        var last = start;
        float t = 0.7f, lastAt = t, lastLand = 0;
        int index = 0;
        (float start, Rect centre, float rx, float ry)? wave = null;
        var cardLands = new Dictionary<string, float>();
        var board = Board;
        // (Each sun shows its replayed numbers until the replay is over.)
        float holdAll = 60;
        foreach (var p in next.Players) board.HoldSun(p.Id, next, WithSun(p, shown[p.Id]), holdAll);
        foreach (var ps in steps)
        {
            float at = index < times.Count ? times[index] : ps.Together == true ? lastAt : t;
            index++;
            lastAt = at;
            t = Mathf.Max(t, at);
            var was = last;
            last = ps.Suns ?? last;
            var fromCard = ps.Uid != null ? CardRect(ps.Uid) : null;
            var from = fromCard ?? (ps.Uid == null ? TableRect(board.Middle, board.RoundHalf, board.RoundHalf) : null);
            var cardTo = ps.ToCard != null ? CardRect(ps.ToCard) : null;
            var to = ps.ToCard != null ? cardTo : SunRect(ps.To);
            // Heat aimed at a card whooshes onto it (sweeping it away, if it burns away).
            if (ps.ToCard != null)
            {
                bool burns = !next.Players.Any(p => p.Tableau.Any(c => c.Uid == ps.ToCard));
                Sound.Play(burns ? "whoosh" : "whoosh-keep", at + 0.12f);
            }
            if (fromCard != null)
            {
                var v = board.View(ps.Uid);
                var def = v != null ? Cards.Def(v.DefId) : null;
                if (v != null) v.Trigger(def != null && Look.Kind.TryGetValue(BuilderView.ShownKind(def), out var kc) ? kc : Look.Ink, at);
            }
            float land = at + 0.3f;
            bool tableWave = IsWave(ps);
            if (tableWave && ps.Together != true) wave = StartWave(at + 0.12f);
            if (tableWave && wave != null)
            {
                var w = wave.Value;
                var target = to;
                land = w.start + (target != null ? Mathf.Min(1, WaveReach(w.centre, w.rx, w.ry, target.Value)) : 0.5f) * WaveTime;
            }
            else if (from != null && to != null)
            {
                var f = from.Value;
                var dest = to.Value;
                var cardId = ps.ToCard;
                var sunId = ps.To;
                System.Func<Rect> live = () => (cardId != null ? CardRect(cardId) : SunRect(sunId)) ?? dest;
                if (ps.Kind == "heat" || ps.Kind == "selfHeat" || ps.Kind == "unstable")
                {
                    StartCoroutine(Projectile(f, live, Hot, at + 0.12f, ps.Kind == "heat" ? 34 : 26, 0.52f, null));
                    land = at + 0.12f + 0.52f;
                }
                else if (ps.Kind == "cool" || ps.Kind == "shield")
                {
                    StartCoroutine(Arc(f, dest, ps.Kind == "cool" ? Beam.Kind.Cool : Beam.Kind.Plain, 0.12f, at + 0.12f, 0.42f, 0.42f * 0.6f, 0.22f));
                    land = at + 0.12f + 0.42f;
                }
            }
            // A struck card glows as the heat lands, and its numbers change then (after its last blow this dawn).
            if (ps.ToCard != null)
            {
                var uid = ps.ToCard;
                bool lastBlow = !steps.Skip(steps.IndexOf(ps) + 1).Any(x => x.ToCard == uid);
                if (lastBlow) StartCoroutine(After(land, () => CardBlow(prev, next, uid)));
                if (cardTo != null)
                {
                    board.View(uid)?.Flash(true, land);
                    cardLands[uid] = Mathf.Max(cardLands.TryGetValue(uid, out var l0) ? l0 : 0, land);
                }
            }
            lastLand = Mathf.Max(lastLand, land);
            if (ps.Together != true)
            {
                if (tableWave) Sound.Play("heat-wave", at + 0.12f);
                else if (ps.Kind == "heat" || ps.Kind == "selfHeat" || ps.Kind == "unstable") Sound.Play("launch", at + 0.12f);
                else if (ps.Kind == "cool") Sound.Play("thermo", at + 0.12f);
                else if (ps.Kind == "draw") Sound.Play("draw", at + 0.12f);
            }
            var before = was;
            var after = ps.Suns;
            var source = ps.Source;
            bool table = tableWave;
            StartCoroutine(After(land, () =>
            {
                if (after == null || hud == null) return;
                // Every sun that changed takes its new numbers, with what changed floating over it (one heat sound a landing).
                bool heard = false;
                foreach (var p in next.Players)
                {
                    if (!before.TryGetValue(p.Id, out var a) || !after.TryGetValue(p.Id, out var b)) continue;
                    if (a.Heat == b.Heat && a.Shields == b.Shields && a.Eliminated == b.Eliminated) continue;
                    board.HoldSun(p.Id, next, WithSun(p, new SunAt { Heat = b.Heat, Shields = b.Shields, Eliminated = false }), holdAll);
                    board.Resync();
                    if (b.Eliminated && !a.Eliminated) SupernovaAt(next, p.Id, 0);
                    var r = SunRect(p.Id);
                    int dHeat = b.Heat - a.Heat, dShield = b.Shields - a.Shields;
                    if (r != null && dHeat != 0) FloatNumber(r.Value, dHeat > 0 ? $"+{dHeat}" : $"−{-dHeat}", dHeat > 0 ? "hot" : "cool", 0);
                    if (r != null && dShield != 0) FloatNumber(r.Value, dShield > 0 ? $"⬡+{dShield}" : $"⬡−{-dShield}", "block", dHeat != 0 ? 1 : 0);
                    board.SunOf(p.Id)?.Pulse(dHeat >= 0);
                    if (dHeat > 0 && table && p.Id == you) HurtFlash();
                    if (dHeat > 0 && !heard)
                    {
                        heard = true;
                        if (table) Sound.Play("hurt", dHeat);
                        else if (p.Id == you && source != you)
                        {
                            Sound.Play("hurt", dHeat);
                            HurtFlash();
                        }
                        else if (p.Id != source) Sound.Play("strike", dHeat);
                        else Sound.Play("impact-hot");
                    }
                    else if (dHeat < 0) Sound.Play("impact-cold");
                    if (dShield < 0) Sound.Play("block");
                    else if (dShield > 0 && dHeat == 0) Sound.Play("shield");
                }
            }));
            if (ps.Together != true) t += step;
        }
        foreach (var kv in cardLands) board.HoldCard(kv.Key, prev, kv.Value);
        // Finally the suns as they really are.
        float end = Mathf.Max(t, lastLand) + 0.2f;
        StartCoroutine(After(end, () =>
        {
            foreach (var p in next.Players) board.HoldSun(p.Id, next, p, 0);
            board.Resync();
        }));
        return end;
    }

    /// <summary>fx.ts waveReach: how far out a point is on the wave's ellipse (1 at its edge).</summary>
    static float WaveReach(Rect centre, float rx, float ry, Rect at)
    {
        float dx = at.center.x - centre.center.x, dy = at.center.y - centre.center.y;
        return Mathf.Sqrt((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry));
    }

    /// <summary>
    /// app.ts startWave: `delay` from now, the Stellari whirls and flushes red (0.2 s), then a hot ring goes out across
    /// the board, wide enough to pass every sun and card. Returns when the ring sets out and its shape.
    /// </summary>
    (float start, Rect centre, float rx, float ry)? StartWave(float delay)
    {
        var board = Board;
        var c = TableRect(board.Middle, board.StarHalf, board.StarHalf);
        if (c == null) return null;
        var centre = c.Value;
        // (The board lies tilted: the ring is an ellipse, flattened as the star's own square slot is.)
        float aspect = centre.width > 0 ? Mathf.Clamp(centre.height / centre.width, 0.3f, 1) : 1;
        float cx = centre.center.x, cy = centre.center.y, far = 0;
        foreach (var r in board.OnTable().Select(uid => CardRect(uid)).Concat(state.Players.Select(p => SunRect(p.Id))))
            if (r != null) far = Mathf.Max(far, Mathf.Sqrt(Mathf.Pow(r.Value.center.x - cx, 2) + Mathf.Pow((r.Value.center.y - cy) / aspect, 2)));
        float rx = far * 1.12f + 30, ry = rx * aspect;
        float start = delay + RageIn;
        StartCoroutine(After(delay, () => StarSpin.HeatWave(WaveTime)));
        StartCoroutine(Wave(centre, rx, ry, start, WaveTime));
        return (start, centre, rx, ry);
    }

    /// <summary>
    /// fx.ts heatWave: the hot ring (.heat-wave: scale 0.04 to 1, in by 8%, fading from 75%), and behind it three
    /// ripples (.wave-ripple), each a little after and fainter than the last.
    /// </summary>
    IEnumerator Wave(Rect centre, float rx, float ry, float delay, float duration)
    {
        for (int i = 0; i < 3; i++) StartCoroutine(Ripple(centre, rx * 1.25f, ry * 1.25f, delay + duration * 0.35f + i * 0.11f, duration * 1.9f, i));
        if (delay > 0) yield return new WaitForSeconds(delay);
        if (hud == null) yield break;
        var r = Hud.Own(Hud.Rect(hud.transform, "Heat wave"), 28);
        r.anchorMin = r.anchorMax = new Vector2(0, 1);
        r.pivot = new Vector2(0.5f, 0.5f);
        r.anchoredPosition = new Vector2(centre.center.x, -centre.center.y);
        r.sizeDelta = new Vector2(2 * rx, 2 * ry);
        r.SetAsLastSibling();
        var img = r.gameObject.AddComponent<RawImage>();
        img.texture = WaveRing(rx);
        img.raycastTarget = false;
        float t0 = Time.time;
        while (r != null)
        {
            float k = (Time.time - t0) / duration;
            if (k >= 1) break;
            float s, o;
            if (k < 0.08f) { s = Mathf.Lerp(0.04f, 0.12f, k / 0.08f); o = k / 0.08f; }
            else if (k < 0.75f) { s = Mathf.Lerp(0.12f, 0.75f, (k - 0.08f) / 0.67f); o = Mathf.Lerp(1, 0.9f, (k - 0.08f) / 0.67f); }
            else { s = Mathf.Lerp(0.75f, 1, (k - 0.75f) / 0.25f); o = Mathf.Lerp(0.9f, 0, (k - 0.75f) / 0.25f); }
            r.localScale = Vector3.one * s;
            img.color = new Color(1, 1, 1, o);
            yield return null;
        }
        if (r != null) Destroy(r.gameObject);
    }

    IEnumerator Ripple(Rect centre, float rx, float ry, float delay, float duration, int i)
    {
        if (delay > 0) yield return new WaitForSeconds(delay);
        if (hud == null) yield break;
        var r = Hud.Own(Hud.Rect(hud.transform, "Ripple"), 28);
        r.anchorMin = r.anchorMax = new Vector2(0, 1);
        r.pivot = new Vector2(0.5f, 0.5f);
        r.anchoredPosition = new Vector2(centre.center.x, -centre.center.y);
        r.sizeDelta = new Vector2(2 * rx, 2 * ry);
        r.SetAsLastSibling();
        var img = r.gameObject.AddComponent<RawImage>();
        img.texture = RippleTexture();
        img.raycastTarget = false;
        float t0 = Time.time, peak = 1 - i * 0.25f;
        while (r != null)
        {
            float k = (Time.time - t0) / duration;
            if (k >= 1) break;
            float e = CubicBezier(0.2f, 0.6f, 0.4f, 1, k);
            float s, o;
            if (e < 0.1f) { s = Mathf.Lerp(0.05f, 0.15f, e / 0.1f); o = Mathf.Lerp(0, peak, e / 0.1f); }
            else { s = Mathf.Lerp(0.15f, 1, (e - 0.1f) / 0.9f); o = Mathf.Lerp(peak, 0, (e - 0.1f) / 0.9f); }
            r.localScale = Vector3.one * s;
            img.color = new Color(1, 1, 1, o);
            yield return null;
        }
        if (r != null) Destroy(r.gameObject);
    }

    /// <summary>A radial gradient's colour at `u` of the way out (closest-side), from its stops (premultiplied between them).</summary>
    static Color Stops(float u, (float at, Color c)[] stops)
    {
        if (u <= stops[0].at) return stops[0].c;
        for (int i = 1; i < stops.Length; i++)
            if (u <= stops[i].at)
            {
                var a = stops[i - 1];
                var b = stops[i];
                float k = (u - a.at) / Mathf.Max(1e-5f, b.at - a.at);
                float al = Mathf.Lerp(a.c.a, b.c.a, k);
                var rgb = al > 0 ? (a.c * a.c.a * (1 - k) + b.c * b.c.a * k) / al : b.c;
                return new Color(rgb.r, rgb.g, rgb.b, al);
            }
        return stops[stops.Length - 1].c;
    }

    static Texture2D waveRing;
    static float waveRingFor;

    /// <summary>
    /// .heat-wave: radial-gradient(closest-side, transparent 80%, rgba(255,170,90,.35) 88%, rgba(236,72,40,.85) 95%,
    /// rgba(255,220,160,.9) 97.5%, transparent 100%), with its drop-shadow(0 0 10px rgba(236,72,40,.7)) round it.
    /// </summary>
    static Texture2D WaveRing(float rx)
    {
        if (waveRing != null && Mathf.Abs(waveRingFor - rx) < 1) return waveRing;
        waveRingFor = rx;
        const int n = 256;
        if (waveRing == null) waveRing = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var clear = new Color(1, 1, 1, 0);
        var stops = new[] { (0.8f, clear), (0.88f, new Color(1, 170 / 255f, 90 / 255f, 0.35f)), (0.95f, new Color(236 / 255f, 72 / 255f, 40 / 255f, 0.85f)), (0.975f, new Color(1, 220 / 255f, 160 / 255f, 0.9f)), (1f, clear) };
        var glow = new Color(236 / 255f, 72 / 255f, 40 / 255f);
        // (The glow's blur, 10 px at the ring's full size, as a share of its radius.)
        float sigma = 5f / Mathf.Max(1, rx);
        var px = new Color[n * n];
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float dx = (x + 0.5f) / n * 2 - 1, dy = (y + 0.5f) / n * 2 - 1;
                float u = Mathf.Sqrt(dx * dx + dy * dy);
                var c = Stops(u, stops);
                // (Its shadow: outside the ring's band, falling away.)
                float d = u < 0.86f ? 0.86f - u : u > 0.99f ? u - 0.99f : 0;
                float g = 0.7f * Mathf.Exp(-(d * d) / (2 * sigma * sigma));
                float a = c.a + g * (1 - c.a);
                px[y * n + x] = a > 0 ? new Color((c.r * c.a + glow.r * g * (1 - c.a)) / a, (c.g * c.a + glow.g * g * (1 - c.a)) / a, (c.b * c.a + glow.b * g * (1 - c.a)) / a, a) : clear;
            }
        waveRing.SetPixels(px);
        waveRing.Apply();
        return waveRing;
    }

    static Texture2D ripple;

    /// <summary>
    /// .wave-ripple: radial-gradient(closest-side, transparent 84%, rgba(80,90,120,.12) 89%, rgba(255,255,255,.75)
    /// 93.5%, rgba(255,236,214,.35) 96%, transparent 100%), masked to its band (transparent 82%, #000 90 to 96%, transparent).
    /// </summary>
    static Texture2D RippleTexture()
    {
        if (ripple != null) return ripple;
        const int n = 256;
        ripple = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var clear = new Color(1, 1, 1, 0);
        var stops = new[] { (0.84f, clear), (0.89f, new Color(80 / 255f, 90 / 255f, 120 / 255f, 0.12f)), (0.935f, new Color(1, 1, 1, 0.75f)), (0.96f, new Color(1, 236 / 255f, 214 / 255f, 0.35f)), (1f, clear) };
        var px = new Color[n * n];
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float dx = (x + 0.5f) / n * 2 - 1, dy = (y + 0.5f) / n * 2 - 1;
                float u = Mathf.Sqrt(dx * dx + dy * dy);
                var c = Stops(u, stops);
                float m = u < 0.82f ? 0 : u < 0.9f ? (u - 0.82f) / 0.08f : u <= 0.96f ? 1 : u < 1 ? (1 - u) / 0.04f : 0;
                c.a *= m;
                px[y * n + x] = c;
            }
        ripple.SetPixels(px);
        ripple.Apply();
        return ripple;
    }
}
