using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// Beside a Hero in its slot (app.ts heroRail, .hero-rail): its singularity's charge, a slim gauge filling from the foot
/// with a star over it, blazing once full; under it the boons its card carries, each its mark on a cream disc (and how
/// many). A Hero whose singularity fills catches fire (sound.ignite), a red flaming border round its card
/// (.card-ablaze). Its ability fired, the Hero lights up (.fx-trigger); its singularity unleashed, a burst of red fire
/// off its card (.fx-unleash). Your own Hero's moves sound (sound.hero).
/// </summary>
public partial class BattleView
{
    /// <summary>Each player's rail, by player id, and what it was drawn for.</summary>
    readonly Dictionary<string, (GameObject go, string key)> rails = new Dictionary<string, (GameObject, string)>();
    /// <summary>Heroes whose singularity is full (each caught fire once, as it filled).</summary>
    readonly HashSet<string> ablaze = new HashSet<string>();

    void HeroRails()
    {
        if (state == null || Board == null) return;
        foreach (var p in state.Players)
        {
            bool mine = p.Id == you;
            var hero = Game.CommandCard(p);
            var v = hero != null ? Board.View(hero.Uid) : null;
            var k = hero != null ? Singularities.Of(hero.DefId) : null;
            int n = k != null ? Mathf.Min(k.Need, hero.Charge ?? 0) : 0;
            bool full = k != null && n >= k.Need;
            // (Filled just now: it catches fire [direction: a sound like catching fire, a red flaming border round the card].)
            if (full) { if (ablaze.Add(hero.Uid)) Sound.Play("ignite"); }
            else if (hero != null) ablaze.Remove(hero.Uid);
            if (v != null)
            {
                var fire = v.GetComponent<Ablaze>();
                if (full && fire == null) v.gameObject.AddComponent<Ablaze>();
                else if (!full && fire != null) fire.Out();
            }
            var boons = hero?.Boons ?? new List<string>();
            string key = v == null || (k == null && boons.Count == 0) ? null : $"{hero.Uid}|{n}/{k?.Need}|{string.Join(",", boons)}|{BoardLayout.Current.Tcw}|{BoardLayout.Current.FramePad}";
            rails.TryGetValue(p.Id, out var had);
            if (had.go != null && had.key == key) continue;
            // (The gauge fills from where it stood: transition height 0.5s ease-out.)
            float was = had.go != null && had.go.GetComponentInChildren<Gauge>() is Gauge g0 ? g0.Shown : -1;
            if (had.go != null) Mats.Kill(had.go);
            rails[p.Id] = (key == null ? null : Rail(v.transform.parent, mine, hero, k, n, boons, was), key);
        }
    }

    /// <summary>
    /// .hero-rail-mine / -rival: from the card's top, (--frame-pad + 0.08 card widths) off its right side (a rival's, its
    /// left), a column of what it shows, centred on each other, 0.06 card widths apart. In card widths on the table.
    /// </summary>
    GameObject Rail(Transform table, bool mine, CardInstance hero, Singularity k, int n, List<string> boons, float was)
    {
        var l = BoardLayout.Current;
        float t = l.Tcw, px = 1 / t;
        var root = new GameObject($"Hero rail {(mine ? "mine" : "rival")}");
        root.transform.SetParent(table, false);
        root.transform.localPosition = (mine ? Board.MyHero : Board.RivalHero) + new Vector3(0, 0.031f, 0);
        // (Boons gathered: one mark a kind, its amount the sum: boonMarks.)
        var marks = new List<(string mark, int amount)>();
        foreach (var grp in boons.GroupBy(b => b))
        {
            var kind = System.Text.RegularExpressions.Regex.Replace(grp.Key.StartsWith("boon_") ? grp.Key.Substring(5) : grp.Key, @"_\d+$", "");
            var m = System.Text.RegularExpressions.Regex.Match(grp.Key, @"_(\d+)$");
            marks.Add((MarkOf(kind), (m.Success ? int.Parse(m.Groups[1].Value) : 0) * grp.Count()));
        }
        float gw = Mathf.Max(10, 0.14f * t) * px, gh = 0.9f, bd = 0.18f;
        float colW = Mathf.Max(k != null ? gw : 0, marks.Count > 0 ? bd : 0);
        float off = 0.5f + (l.FramePad + 0.08f * t) * px;
        float cx = mine ? off + colW / 2 : -off - colW / 2, top = 0.7f;
        if (k != null)
        {
            // .hero-charge: max(10px, 0.14) wide, 0.9 tall, a pill; a faint red, its 1 px edge redder inside; filled from
            // the foot (2 px in) with fire (#ffb08a, #e2361f at 45%, #a8180e), glowing (0 0 6px); a star 0.13 card widths
            // over it (0.16 above its top). Full: redder, its edge bright, a red glow breathing (hero-charge-blaze, 1.4 s).
            var gauge = new GameObject("Charge").AddComponent<Gauge>();
            gauge.transform.SetParent(root.transform, false);
            gauge.transform.localPosition = new Vector3(cx, 0, top - gh / 2);
            gauge.Build(gw, gh, px, (float)n / k.Need, n >= k.Need, was);
            var star = Mats.FlatText("Star", gauge.transform, "✦", Board.Px(0.13f * t), n >= k.Need ? Hud.Rgba(226, 54, 31) : Hud.Rgba(180, 104, 90), false, 400, 0);
            star.rectTransform.sizeDelta = new Vector2(1, 0.3f);
            star.transform.localPosition = new Vector3(0, 0.004f, gh / 2 + 0.16f - 0.065f);
            top -= gh + 0.06f;
        }
        foreach (var (mark, amount) in marks)
        {
            // .boon-mark.hero-boon: 0.18 card widths, its mark on a cream disc in a faint gold ring (baked with 4 px
            // round it at --tcw 200: 36 px of 44); its amount small at its foot, 3 px out (0.07 card widths, display, ink).
            float cz = top - bd / 2, img = bd * 44 / 36;
            var pic = Board.Picture($"Boon {mark}", root.transform, Resources.Load<Texture2D>($"Icons/boon/{mark}"), Color.white, img, img, 2942, 0.002f);
            pic.transform.localPosition = new Vector3(cx, 0.002f, cz);
            if (amount > 0)
            {
                float size = 0.07f * t;
                var count = Mats.FlatText("Amount", root.transform, amount.ToString(), Board.Px(size), Look.Ink, true, 400, 0, TextAlignmentOptions.Right);
                count.rectTransform.sizeDelta = new Vector2(1, size * 1.25f * px);
                count.rectTransform.pivot = new Vector2(1, 0.5f);
                count.transform.localPosition = new Vector3(cx + bd / 2 + 3 * px, 0.004f, cz - bd / 2 - 3 * px + size * 1.25f * px / 2);
            }
            top -= bd + 0.06f;
        }
        return root;
    }

    /// <summary>
    /// app.ts animate: a Hero's move lights its card (its ability: .fx-trigger; its singularity: .fx-unleash); your own
    /// Hero's moves (an ability, its singularity, a skill or relic called on) sound as they are made (sound.hero).
    /// </summary>
    void HeroMoved(EngineAction a, PlayerState actor)
    {
        if (!Application.isPlaying || Autoplay) return;
        bool heroMove = a.Type == "heroAbility" || a.Type == "singularity";
        if (a.Type == "heroSkill" && actor.Id == you && !actor.IsAI) Sound.Play("hero");
        if (!heroMove) return;
        var hero = Game.CommandCard(actor);
        var v = hero != null ? Board.View(hero.Uid) : null;
        if (v == null) return;
        if (a.Type == "singularity") v.gameObject.AddComponent<UnleashFx>();
        else v.Trigger(Look.Kind.TryGetValue(BuilderView.ShownKind(Cards.Def(hero.DefId)), out var kc) ? kc : Look.Ink);
    }

    /// <summary>A box made by Board.Shape given a new size, corners, blur and colour (its quad grown `pad` round it).</summary>
    static void Fit(MeshRenderer r, float w, float h, float radius, float soft, float pad, Color c)
    {
        float grow = Mathf.Max((w + 2 * pad) / w, (h + 2 * pad) / h), qw = w * grow, qh = h * grow;
        r.transform.localScale = new Vector3(qw, qh, 1);
        var m = r.sharedMaterial;
        m.color = c;
        m.SetFloat("_Aspect", qh / qw);
        m.SetFloat("_Size", 0.5f / grow);
        m.SetFloat("_Radius", Mathf.Min(radius, Mathf.Min(w, h) / 2) / qw);
        m.SetFloat("_Soft", Mathf.Max(0.0005f, soft) / qw);
    }

    /// <summary>A rounded box on the table (Board.Shape) in table units, its blur `soft` and its pad.</summary>
    static MeshRenderer Glow(string name, Transform parent, Color c, float w, float h, float radius, int queue, float soft, float lift = 0.001f)
        => Board.Shape(name, parent, c, w, h, radius, queue, lift, Mathf.Max(0.0005f, soft), Mathf.Max(0.01f, soft * 2));

    /// <summary>The charge gauge: its fill rising to where it stands, and once full, its blaze breathing.</summary>
    class Gauge : MonoBehaviour
    {
        public float Shown;
        float goal, from, at, w, h, px;
        bool full;
        MeshRenderer back, edge, fill, fillGlow, blaze;

        public void Build(float w, float h, float px, float k, bool full, float was)
        {
            this.w = w;
            this.h = h;
            this.px = px;
            this.full = full;
            goal = k;
            from = was >= 0 ? was : k;
            Shown = from;
            at = Time.time;
            // (Full: rgba(230, 70, 30, 0.2), its edge rgba(255, 120, 70, 0.8) and a glow 0 0 12px rgba(255, 80, 30, 0.8).)
            if (full) blaze = Glow("Blaze", transform, Hud.Rgba(255, 80, 30, 0.8f), w, h, w / 2, 2936, 6 * px);
            back = Glow("Gauge", transform, full ? Hud.Rgba(230, 70, 30, 0.2f) : Hud.Rgba(120, 30, 20, 0.1f), w, h, w / 2, 2937, 0.5f * px);
            edge = Board.Shape("Edge", transform, full ? Hud.Rgba(255, 120, 70, 0.8f) : Hud.Rgba(170, 60, 40, 0.3f), w - px, h - px, (w - px) / 2, 2938, 0.0012f, 0.5f * px, 2 * px, true);
            fillGlow = Glow("Fill glow", transform, Hud.Rgba(230, 60, 30, 0.6f), w, h, w / 2, 2939, 3 * px, 0.0014f);
            fill = Board.Picture("Fill", transform, Fire(), Color.white, w, h, 2940, 0.0016f);
            Place();
        }

        static Texture2D fire;

        /// <summary>linear-gradient(180deg, #ffb08a, #e2361f 45%, #a8180e).</summary>
        static Texture2D Fire()
        {
            if (fire != null) return fire;
            const int n = 64;
            fire = new Texture2D(1, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            Color a = Hud.Rgba(255, 176, 138), b = Hud.Rgba(226, 54, 31), c = Hud.Rgba(168, 24, 14);
            for (int y = 0; y < n; y++)
            {
                float u = 1 - (y + 0.5f) / n;
                fire.SetPixel(0, y, u < 0.45f ? Color.Lerp(a, b, u / 0.45f) : Color.Lerp(b, c, (u - 0.45f) / 0.55f));
            }
            fire.Apply();
            return fire;
        }

        void Place()
        {
            // (2 px in from its sides and foot; (100% − 4px) × --k tall.)
            float fw = w - 4 * px, fh = (h - 4 * px) * Shown;
            bool any = fh > 0.0005f;
            fill.gameObject.SetActive(any);
            fillGlow.gameObject.SetActive(any);
            if (!any) return;
            float z = -h / 2 + 2 * px + fh / 2;
            fill.transform.localScale = new Vector3(fw, fh, 1);
            fill.transform.localPosition = new Vector3(0, 0.0016f, z);
            fill.sharedMaterial.SetFloat("_Aspect", fh / fw);
            fill.sharedMaterial.SetFloat("_Radius", Mathf.Min(0.5f, fh / fw * 0.5f));
            Fit(fillGlow, fw, fh, Mathf.Min(fw, fh) / 2, 3 * px, 6 * px, Hud.Rgba(230, 60, 30, 0.6f));
            fillGlow.transform.localPosition = new Vector3(0, 0.0014f, z);
        }

        void Update()
        {
            if (Shown != goal)
            {
                float k = Mathf.Clamp01((Time.time - at) / 0.5f);
                // (ease-out: cubic-bezier(0, 0, .58, 1), near enough.)
                Shown = Mathf.Lerp(from, goal, 1 - (1 - k) * (1 - k));
                if (k >= 1) Shown = goal;
                Place();
            }
            if (full && blaze != null)
            {
                // (hero-charge-blaze: at 50%, its edge rgba(255, 170, 110, 0.95) and its glow 0 0 20px rgba(255, 90, 30, 1).)
                float b = 0.5f - 0.5f * Mathf.Cos(Mathf.PI * 2 * Mathf.Repeat(Time.time / 1.4f, 1));
                blaze.sharedMaterial.color = Color.Lerp(Hud.Rgba(255, 80, 30, 0.8f), Hud.Rgba(255, 90, 30, 1), b);
                blaze.sharedMaterial.SetFloat("_Soft", Mathf.Lerp(6, 10, b) * px / blaze.transform.localScale.x);
                edge.sharedMaterial.color = Color.Lerp(Hud.Rgba(255, 120, 70, 0.8f), Hud.Rgba(255, 170, 110, 0.95f), b);
            }
        }
    }

    /// <summary>
    /// .card-ablaze: a red rim (0 0 0 1.5px) round the card, flames licking out round it in uneven tongues that flicker
    /// and climb (card-ablaze: four looks, 0.9 s, in six steps, there and back), under the card's own face.
    /// </summary>
    class Ablaze : MonoBehaviour
    {
        MeshRenderer rim, lick, tongue, halo;
        float px;

        // Each look: the rim's colour; a close glow (blur, spread, colour); a tongue (x, y, blur, spread, colour); a halo (y, blur, spread, colour).
        static readonly (Color rim, float b1, float s1, Color c1, float x2, float y2, float b2, float s2, Color c2, float y3, float b3, float s3, Color c3)[] Looks =
        {
            (Hud.Rgba(226, 54, 31), 6, 2, Hud.Rgba(255, 70, 20, 0.85f), -3, -6, 14, 2, Hud.Rgba(255, 110, 30, 0.6f), 0, 26, 6, Hud.Rgba(220, 40, 10, 0.4f)),
            (Hud.Rgba(255, 74, 38), 8, 3, Hud.Rgba(255, 90, 20, 0.9f), 2, -9, 16, 3, Hud.Rgba(255, 140, 40, 0.65f), -2, 30, 7, Hud.Rgba(230, 50, 10, 0.45f)),
            (Hud.Rgba(212, 42, 21), 5, 2, Hud.Rgba(255, 60, 20, 0.8f), 4, -5, 12, 2, Hud.Rgba(255, 120, 30, 0.55f), 0, 22, 5, Hud.Rgba(210, 40, 10, 0.4f)),
            (Hud.Rgba(255, 90, 46), 9, 3, Hud.Rgba(255, 100, 30, 0.9f), -2, -11, 18, 3, Hud.Rgba(255, 150, 50, 0.6f), -3, 32, 8, Hud.Rgba(235, 55, 10, 0.45f)),
        };
        static readonly float[] At = { 0, 0.35f, 0.7f, 1 };

        void Start()
        {
            px = 1 / BoardLayout.Current.Tcw;
            // (Drawn in order under the face (3000) and its rim (2995): the first shadow on top.)
            halo = Board.Shape("Ablaze halo", transform, Color.clear, 1, 1.4f, 0.08f, 2991, -0.0016f, 0.01f, 0.4f);
            tongue = Board.Shape("Ablaze tongue", transform, Color.clear, 1, 1.4f, 0.08f, 2992, -0.0014f, 0.01f, 0.4f);
            lick = Board.Shape("Ablaze glow", transform, Color.clear, 1, 1.4f, 0.08f, 2993, -0.0012f, 0.01f, 0.2f);
            rim = Board.Shape("Ablaze rim", transform, Color.clear, 1 + 3 * px, 1.4f + 3 * px, 0.08f + 1.5f * px, 2994, -0.001f, 0.3f * px, 0.01f);
            Update();
        }

        public void Out() => Destroy(this);

        void OnDestroy()
        {
            foreach (var r in new[] { rim, lick, tongue, halo }) if (r != null) Mats.Kill(r.gameObject);
        }

        /// <summary>A box-shadow under the card: offset (x, y) px, its blur and spread, in a colour.</summary>
        void Shade(MeshRenderer r, float x, float y, float blur, float spread, Color c)
        {
            Fit(r, 1 + 2 * spread * px, 1.4f + 2 * spread * px, 0.08f + spread * px, blur / 2 * px, blur * px + 0.01f, c);
            r.transform.localPosition = new Vector3(x * px, r.transform.localPosition.y, -y * px);
        }

        void Update()
        {
            if (rim == null) return;
            // (steps(6, jump-none), alternate: six looks a run, held a sixth each, there and back.)
            float u = Mathf.Repeat(Time.time / 0.9f, 2);
            if (u > 1) u = 2 - u;
            float p = Mathf.Min(5, Mathf.Floor(u * 6)) / 5;
            int i = p >= At[2] ? 2 : p >= At[1] ? 1 : 0;
            float f = (p - At[i]) / (At[i + 1] - At[i]);
            var a = Looks[i];
            var b = Looks[i + 1];
            float L(float x, float y) => Mathf.Lerp(x, y, f);
            rim.sharedMaterial.color = Color.Lerp(a.rim, b.rim, f);
            Shade(lick, 0, 0, L(a.b1, b.b1), L(a.s1, b.s1), Color.Lerp(a.c1, b.c1, f));
            Shade(tongue, L(a.x2, b.x2), L(a.y2, b.y2), L(a.b2, b.b2), L(a.s2, b.s2), Color.Lerp(a.c2, b.c2, f));
            Shade(halo, 0, L(a.y3, b.y3), L(a.b3, b.b3), L(a.s3, b.s3), Color.Lerp(a.c3, b.c3, f));
        }
    }

    /// <summary>
    /// .fx-unleash: a burst of red fire off the Hero's card: by a quarter of 1 s a ring 6 px out (rgba(255, 90, 30, 0.95))
    /// and a glow 0 0 46px 12px (rgba(255, 60, 20, 0.9)), the card 1.08 times as large; gone by the end (ease-out each
    /// way). The card's parts are grown about its middle, as a transform scales the card and its shadows.
    /// </summary>
    class UnleashFx : MonoBehaviour
    {
        float t0;
        MeshRenderer ring, glow;
        readonly Dictionary<Transform, (Vector3 pos, Vector3 scale, Vector3 set, Vector3 setScale)> rest = new Dictionary<Transform, (Vector3, Vector3, Vector3, Vector3)>();
        float px;

        void Start()
        {
            t0 = Time.time;
            px = 1 / BoardLayout.Current.Tcw;
            foreach (var u in GetComponents<UnleashFx>()) if (u != this) Destroy(u);
            glow = Board.Shape("Unleash glow", transform, Color.clear, 1, 1.4f, 0.08f, 2992, -0.0013f, 0.01f, 1);
            ring = Board.Shape("Unleash ring", transform, Color.clear, 1, 1.4f, 0.08f, 2994, -0.0009f, 0.3f * px, 0.1f);
        }

        void LateUpdate()
        {
            Restore();
            float t = (Time.time - t0) / 1f;
            if (t >= 1) { Destroy(this); return; }
            float k = t < 0.25f ? Out(t / 0.25f) : 1 - Out((t - 0.25f) / 0.75f);
            float s = 1 + 0.08f * k;
            Fit(ring, 1 + 12 * k * px, 1.4f + 12 * k * px, 0.08f + 6 * k * px, 0.3f * px, 0.01f, Hud.Rgba(255, 90, 30, 0.95f * k));
            Fit(glow, 1 + 24 * k * px, 1.4f + 24 * k * px, 0.08f + 12 * k * px, 23 * k * px, 46 * k * px + 0.01f, Hud.Rgba(255, 60, 20, 0.9f * k));
            foreach (Transform c in transform)
            {
                var pos = new Vector3(c.localPosition.x * s, c.localPosition.y, c.localPosition.z * s);
                rest[c] = (c.localPosition, c.localScale, pos, c.localScale * s);
                c.localPosition = pos;
                c.localScale = c.localScale * s;
            }
        }

        /// <summary>Each part put back as it was (unless something else has moved it since: then left where that put it).</summary>
        void Restore()
        {
            foreach (var kv in rest)
                if (kv.Key != null && kv.Key.localPosition == kv.Value.set && kv.Key.localScale == kv.Value.setScale) { kv.Key.localPosition = kv.Value.pos; kv.Key.localScale = kv.Value.scale; }
            rest.Clear();
        }

        /// <summary>ease-out: cubic-bezier(0, 0, .58, 1), near enough.</summary>
        static float Out(float x) => 1 - (1 - x) * (1 - x);

        void OnDestroy()
        {
            Restore();
            if (ring != null) Mats.Kill(ring.gameObject);
            if (glow != null) Mats.Kill(glow.gameObject);
        }
    }
}
