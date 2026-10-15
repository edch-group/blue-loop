using System.Collections;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;
using UnityEngine.UI;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// A move's arcs, as app.ts animate draws them: a card played (or a Hero's ability) that takes or hurts a rival card
/// without heat reaches it with a white arc (fx.ts tether: drawn out over 0.42 s, held 0.52 s, faded over 0.26 s);
/// heat aimed at a card flies to it; a Hero's ability on its own side sends a beam of light to each card it changes
/// (fx.ts beam). Each a little after the last.
/// </summary>
public partial class BattleView
{
    void Arcs(GameState prev, GameState next, EngineAction a, PlayerState actor)
    {
        if (!Application.isPlaying || hud == null) return;
        bool heroMove = a.Type == "heroAbility" || a.Type == "singularity";
        if (a.Type != "playCard" && !heroMove) return;
        var hero = heroMove ? Game.CommandCard(actor) : null;
        // Where the move comes from: the card played (where it is now), the Hero, or the actor's sun.
        var fromUid = a.Type == "playCard" ? a.CardUid : hero?.Uid;
        Rect? from = fromUid != null ? CardRect(fromUid) : null;
        if (from == null) from = SunRect(actor.Id);
        if (from == null) return;
        var playedId = a.Type == "playCard" ? actor.Hand.FirstOrDefault(c => c.Uid == a.CardUid)?.DefId : null;
        var effects = playedId != null ? Cards.Def(playedId).OnPlay ?? new System.Collections.Generic.List<Effect>() : new System.Collections.Generic.List<Effect>();
        bool heats = effects.Any(e => e.Type == "heat") || heroMove;
        string shotAim = a.AimUid;
        var was = prev.Players.Where(p => p.Id != actor.Id).SelectMany(p => p.Tableau).ToDictionary(c => c.Uid);
        var now = next.Players.Where(p => p.Id != actor.Id).SelectMany(p => p.Tableau).ToDictionary(c => c.Uid);
        var hit = was.Where(kv => !now.ContainsKey(kv.Key) || (now[kv.Key].Health ?? 0) < (kv.Value.Health ?? 0) || (now[kv.Key].Dented ?? 0) > (kv.Value.Dented ?? 0) || (heroMove && CardShift(prev, next, kv.Key).Count > 0)).Select(kv => kv.Key).ToList();
        for (int i = 0; i < hit.Count; i++)
        {
            var uid = hit[i];
            var to = CardRect(uid);
            if (to == null) continue;
            float delay = (actor.IsAI ? 0.6f : 0.47f) + i * 0.14f;
            now.TryGetValue(uid, out var nowC);
            bool byHeat = heats && uid != a.EnemyUid && (uid == shotAim || (nowC?.Dented ?? 0) > (was[uid].Dented ?? 0) || (heroMove && nowC != null && (nowC.Health ?? 0) < (was[uid].Health ?? 0)));
            if (byHeat)
            {
                var land = to.Value;
                StartCoroutine(Projectile(from.Value, () => CardRect(uid) ?? land, Hot, delay, 30, 0.56f, null));
                // (The card struck glows as it lands; a Hero's heat shows what it did.)
                Board.View(uid)?.Flash(true, delay + 0.56f);
                Board.HoldCard(uid, prev, delay + 0.56f);
                if (nowC == null) Board.Linger(uid, delay + 0.56f);
                Sound.Play("launch", delay);
                Sound.Play(nowC == null ? "whoosh" : "whoosh-keep", delay + 0.56f - 0.06f);
                var blowOn = uid;
                StartCoroutine(After(delay + 0.56f, () => CardBlow(prev, next, blowOn)));
                if (heroMove) CardShiftNumbers(CardShift(prev, next, uid), to.Value, delay + 0.56f);
                continue;
            }
            StartCoroutine(Arc(from.Value, to.Value, Beam.Kind.Plain, 0.36f, delay, 0.42f, 0.52f, 0.26f));
            // (A Hero's: what it did to the card shown as the arc reaches it.)
            float reach = delay + 0.42f + 0.52f * 0.7f;
            if (nowC == null) Board.Linger(uid, reach);
            // (The beam whooshes onto the card, and, if it takes it, sweeps it away.)
            Sound.Play(next.Players.Any(p => p.Tableau.Any(c => c.Uid == uid)) ? "whoosh-keep" : "whoosh", delay);
            if (heroMove && nowC != null)
            {
                Board.View(uid)?.Flash(true, reach);
                Board.HoldCard(uid, prev, reach);
                CardShiftNumbers(CardShift(prev, next, uid), to.Value, reach);
            }
        }
        // A Hero's ability on its own side: a beam of light from the Hero to each card it changes.
        if (heroMove && hero != null)
        {
            var mineWas = prev.Players.First(p => p.Id == actor.Id).Tableau.ToDictionary(c => c.Uid);
            int k = 0;
            foreach (var c in next.Players.First(p => p.Id == actor.Id).Tableau)
            {
                var shift = CardShift(prev, next, c.Uid);
                if (shift.Count == 0 || !mineWas.ContainsKey(c.Uid)) continue;
                var to = CardRect(c.Uid);
                if (to == null) continue;
                float delay = (actor.IsAI ? 0.6f : 0.42f) + k++ * 0.14f, land = delay;
                // (The Hero itself only glows.)
                if (c.Uid != hero.Uid)
                {
                    StartCoroutine(Arc(from.Value, to.Value, Beam.Kind.Plain, 0.12f, delay, 0.38f, 0.38f * 0.6f, 0.22f));
                    land = delay + 0.38f;
                }
                bool bad = shift.Any(x => x.Bad);
                Board.View(c.Uid)?.Flash(bad, land);
                Board.HoldCard(c.Uid, prev, land);
                CardShiftNumbers(shift, to.Value, land);
                Sound.Play(bad ? "clash-1" : "shield", land);
            }
        }
    }

    /// <summary>app.ts HOT: heat's colour.</summary>
    static readonly Color Hot = new Color(240 / 255f, 160 / 255f, 122 / 255f);

    static readonly System.Collections.Generic.Dictionary<string, Texture2D> bolts = new System.Collections.Generic.Dictionary<string, Texture2D>();

    /// <summary>
    /// .bolt: a disc `size` across, radial-gradient(circle, #fff 0 30%, colour 60%, transparent 72%), and its glow
    /// (box-shadow 0 0 22px 6px colour) round it; drawn `size` + 2 × 34 across.
    /// </summary>
    static Texture2D Bolt(Color c, float size)
    {
        string key = $"{ColorUtility.ToHtmlStringRGB(c)} {size}";
        if (bolts.TryGetValue(key, out var t)) return t;
        const int n = 96;
        float extent = size + 2 * 34, k = extent / n, r = size / 2;
        t = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var px = new Color[n * n];
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(n / 2f, n / 2f)) * k;
                // (The disc: white to 30% of its radius, its colour by 60%, gone by 72%.)
                float u = d / r;
                Color disc = u <= 0.3f ? Color.white : u <= 0.6f ? Color.Lerp(Color.white, c, (u - 0.3f) / 0.3f) : u <= 0.72f ? new Color(c.r, c.g, c.b, 1 - (u - 0.6f) / 0.12f) : new Color(c.r, c.g, c.b, 0);
                if (u > 1) disc.a = 0;
                // (The glow: spread 6, blurred 22: a soft edge from the disc's rim out.)
                float g = d - (r + 6);
                float glow = d <= r + 6 ? 1 : Mathf.Exp(-(g * g) / (2 * 11 * 11 / 4f * 4));
                var gc = new Color(c.r, c.g, c.b, glow * (d <= r ? 0 : 1));
                // (The disc over its glow.)
                float a = disc.a + gc.a * (1 - disc.a);
                px[y * n + x] = a > 0 ? new Color((disc.r * disc.a + gc.r * gc.a * (1 - disc.a)) / a, (disc.g * disc.a + gc.g * gc.a * (1 - disc.a)) / a, (disc.b * disc.a + gc.b * gc.a * (1 - disc.a)) / a, a) : new Color(c.r, c.g, c.b, 0);
            }
        t.SetPixels(px);
        t.Apply();
        bolts[key] = t;
        return t;
    }

    /// <summary>
    /// fx.ts projectile: a glowing bolt `size` across from one rectangle to another (measured as it fires and as it
    /// flies), up to 80 px above the higher of them halfway, swelling from 0.4 to 1.2 and landing at 0.8, fading in
    /// (cubic-bezier(.4,0,.6,1) over `duration`); `landed` as it arrives.
    /// </summary>
    IEnumerator Projectile(Rect from, System.Func<Rect> to, Color colour, float delay, float size, float duration, System.Action landed)
    {
        if (delay > 0) yield return new WaitForSeconds(delay);
        if (beamLayer == null) yield break;
        var r = Hud.Own(Hud.Rect(beamLayer.parent, "Bolt"), 24);
        r.anchorMin = r.anchorMax = new Vector2(0, 1);
        r.pivot = new Vector2(0.5f, 0.5f);
        float extent = size + 2 * 34;
        r.sizeDelta = new Vector2(extent, extent);
        r.SetAsLastSibling();
        var img = r.gameObject.AddComponent<RawImage>();
        img.texture = Bolt(colour, size);
        img.raycastTarget = false;
        float t0 = Time.time;
        while (true)
        {
            float k = Mathf.Clamp01((Time.time - t0) / duration);
            float p = CubicBezier(0.4f, 0f, 0.6f, 1f, k);
            var b = to();
            Vector2 a0 = from.center, a1 = b.center, mid = new Vector2((a0.x + a1.x) / 2, Mathf.Min(a0.y, a1.y) - 80);
            Vector2 at; float s, o;
            if (p < 0.5f) { float q = p / 0.5f; at = Vector2.Lerp(a0, mid, q); s = Mathf.Lerp(0.4f, 1.2f, q); o = q; }
            else { float q = (p - 0.5f) / 0.5f; at = Vector2.Lerp(mid, a1, q); s = Mathf.Lerp(1.2f, 0.8f, q); o = 1; }
            r.anchoredPosition = new Vector2(at.x, -at.y);
            r.localScale = Vector3.one * s;
            img.color = new Color(1, 1, 1, o);
            if (k >= 1) break;
            yield return null;
        }
        Destroy(r.gameObject);
        landed?.Invoke();
    }

    /// <summary>A CSS cubic-bezier timing function at `x`.</summary>
    static float CubicBezier(float x1, float y1, float x2, float y2, float x)
    {
        float t = x;
        for (int i = 0; i < 10; i++)
        {
            float u = 1 - t;
            float bx = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t - x;
            float dx = 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2);
            if (Mathf.Abs(dx) < 1e-5f) break;
            t = Mathf.Clamp01(t - bx / dx);
        }
        float v = 1 - t;
        return 3 * v * v * t * y1 + 3 * v * t * t * y2 + t * t * t;
    }

    string bossAimKey = "";
    readonly System.Collections.Generic.List<GameObject> bossAims = new System.Collections.Generic.List<GameObject>();

    /// <summary>
    /// A Lost Overlord's next blow, shown ahead (app.ts syncBossAim): an arrow from each part acting next (its chosen
    /// action, and every minion) to each card (or the sun) it will strike, held until what it aims at changes.
    /// </summary>
    void SyncBossAim()
    {
        if (hud == null || beamLayer == null) return;
        var s = state;
        var boss = s != null && s.WinnerId == null && stage == null ? s.Players.FirstOrDefault(p => p.Boss != null) : null;
        var foe = boss != null ? s.Players.FirstOrDefault(p => p != boss && !p.Eliminated) : null;
        var lines = new System.Collections.Generic.List<(string from, string to)>();
        if (boss != null && foe != null)
        {
            var parts = new System.Collections.Generic.List<CardInstance>();
            var intent = Game.BossIntent(boss);
            if (intent != null) parts.Add(intent.Value.card);
            parts.AddRange(Game.BossMinions(boss));
            foreach (var c in parts)
            {
                var at = Game.PartAim(s, boss, c);
                if (at.Sun > 0) lines.Add((c.Uid, "sun:" + foe.Id));
                foreach (var x in at.Cards) lines.Add((c.Uid, x.uid));
            }
        }
        var key = string.Join("|", lines.Select(l => $"{l.from}>{l.to}"));
        if (key == bossAimKey) return;
        bossAimKey = key;
        foreach (var g in bossAims) if (g != null) Destroy(g);
        bossAims.Clear();
        foreach (var (from, to) in lines)
        {
            var b = Beam.Make(beamLayer, Beam.Kind.Attack);
            var live = b.gameObject.AddComponent<LiveAim>();
            var f = from;
            var t = to;
            live.From = () => CardRect(f);
            live.To = () => t.StartsWith("sun:") ? SunRect(t.Substring(4)) : CardRect(t);
            bossAims.Add(b.gameObject);
        }
    }

    /// <summary>fx.ts aim: a held arc between two things as they stand (drawn out over 0.42 s), hidden while either is gone.</summary>
    class LiveAim : MonoBehaviour
    {
        public System.Func<Rect?> From, To;
        public float Delay;
        float t0 = -1;
        Beam beam;

        void Start()
        {
            beam = GetComponent<Beam>();
            t0 = Time.time + Delay;
            beam.Hide();
        }

        void Update()
        {
            if (Time.time < t0) return;
            var a = From();
            var b = To();
            if (a == null || b == null) { beam.Hide(); return; }
            float k = Mathf.Min(1, (Time.time - t0) / 0.42f);
            beam.Draw(a.Value, b.Value, 1 - Mathf.Pow(1 - k, 3));
        }
    }

    /// <summary>A sun's rectangle on the page (its gauge as drawn).</summary>
    Rect? SunRect(string playerId)
    {
        var s = Board.SunOf(playerId);
        var col = s != null ? s.GetComponentInChildren<Collider>() : Board.BossPanel(playerId);
        return col != null ? PageRect(col) : (Rect?)null;
    }

    /// <summary>An arc drawn out from one rectangle to another (eased out), held, then faded away.</summary>
    IEnumerator Arc(Rect from, Rect to, Beam.Kind kind, float bow, float delay, float draw, float hold, float fade)
    {
        yield return new WaitForSeconds(delay);
        var b = Beam.Make(beamLayer, kind, bow);
        var group = b.gameObject.AddComponent<CanvasGroup>();
        group.blocksRaycasts = false;
        float t0 = Time.time;
        while (true)
        {
            float k = Mathf.Min(1, (Time.time - t0) / draw);
            b.Draw(from, to, 1 - Mathf.Pow(1 - k, 3));
            if (k >= 1) break;
            yield return null;
        }
        yield return new WaitForSeconds(hold);
        t0 = Time.time;
        while (Time.time - t0 < fade)
        {
            group.alpha = 1 - (Time.time - t0) / fade;
            yield return null;
        }
        Destroy(b.gameObject);
    }
}
