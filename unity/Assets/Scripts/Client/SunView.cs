using System.Collections.Generic;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;

/// <summary>
/// A side's sun on the table, as the web's (art.ts vitals, sun3d.ts, styles.css .vit): flat on the board, as the web's
/// are, its corona's flames under the rings, then the dome, where the sun and its planets are drawn as solids seen from
/// the viewer's eye (SunArt and the Sun* shaders, a port of sun3d.ts, drawn per pixel on the GPU), the orbit's trail and
/// notches, and the shields' lattice; its heat
/// standing up over the sun's middle, turned to the eye; under it, the planet it faces in a pill and its shields'
/// honeycomb badge. Sized and placed in the board's own pixels at the screen's size (BoardLayout).
/// </summary>
public class SunView : MonoBehaviour
{
    public string PlayerId;
    bool mine;
    /// <summary>Whether it is the viewer's own sun.</summary>
    public bool Mine => mine;

    // Where it stands (the gauge's middle, board px) and how big (--vs), as last placed.
    float vs = 1, cx, cy;
    BoardLayout lay;
    Camera eye;

    // The corona; the dome's flat things, the lattice's far side, the sun and its planets, the lattice's near side, in
    // that order over one another (each drawn per pixel by its shader: SunCorona, SunFlat, SunLattice, SunBalls).
    MeshRenderer corona, dome, balls, latBack, latFront;
    Mesh backMesh, frontMesh;
    TextMeshPro heatB, heatSmall, heatGlowB, heatGlowSmall, planet, shieldN;
    MeshRenderer pillShadow, pillEdge, pill, badge, badgePatch;
    Transform heatRoot;
    BoxCollider hit;

    // What it shows.
    int heat, most = 20, shields, orbit;
    bool dead, danger, cold, paradise, eaten, hasOrbit;
    float seed;
    float shownOrbit = float.NaN, orbitSeen;
    bool domeDirty = true;
    // (The 20ths and 10ths of a second the corona and the dome were last drawn on; the eye and size the lattice and the
    // heat were last laid out for.)
    long coronaBeat = -1, domeBeat = -1;
    Vector3 laidCam = new Vector3(float.NaN, 0, 0);
    float laidVs, laidS, laidU;
    List<SunArt.LatticeCell> laidCells;
    readonly string[] mapsShown = new string[3];

    public static SunView Make(Transform parent, Vector3 at, string playerId, bool mine = true)
    {
        var go = new GameObject("Sun");
        go.transform.SetParent(parent, false);
        go.transform.localPosition = at;
        var v = go.AddComponent<SunView>();
        v.PlayerId = playerId;
        v.mine = mine;
        // (art.ts: the seed from the player's id, turning the sun's surface and its planets their own way.)
        int sd = 0;
        foreach (char ch in playerId ?? "") sd = (sd * 31 + ch) % 997;
        v.seed = sd / 997f * 6.28f;
        v.Build();
        return v;
    }

    void Build()
    {
        corona = Quad("Corona", "SunCorona", 2950, 0.001f);
        dome = Quad("Dome", "SunFlat", 2956, 0.002f);
        latBack = Lattice("Lattice far side", 2957, 0.0021f, out backMesh);
        balls = Quad("Dome balls", "SunBalls", 2958, 0.0022f);
        latFront = Lattice("Lattice near side", 2959, 0.0023f, out frontMesh);
        corona.sharedMaterial.SetTexture(SurfaceId, SurfaceTexture());
        balls.sharedMaterial.SetTexture(SurfaceId, SurfaceTexture());
        // (A tap on the gauge is a tap on the sun.)
        gameObject.AddComponent<SunTag>().PlayerId = PlayerId;
        hit = gameObject.AddComponent<BoxCollider>();

        // The heat count, standing up over the sun's middle (.vit-heat: the count over its most, line-height 1), each with
        // its soft halo (text-shadow) behind.
        heatRoot = new GameObject("Heat").transform;
        heatRoot.SetParent(transform, false);
        heatGlowB = Stand("Heat glow", 700);
        heatGlowSmall = Stand("Most glow", 700);
        heatB = Stand("Heat", 700);
        heatSmall = Stand("Most", 700);

        // Under it (.vit-under): the planet's pill and the shields' badge, side by side.
        pillShadow = Board.Shape("Planet pill shadow", transform, new Color(60 / 255f, 80 / 255f, 120 / 255f, 0.18f), 1, 1, 0.5f, 2990, 0.0015f);
        pillEdge = Board.Shape("Planet pill edge", transform, new Color(150 / 255f, 164 / 255f, 190 / 255f, 0.5f), 1, 1, 0.5f, 2991, 0.0016f);
        pill = Board.Shape("Planet pill", transform, Color.white, 1, 1, 0.5f, 2992, 0.0017f);
        planet = Mats.FlatText("Planet", transform, "", 1, Look.InkSoft, true, 700, 12);
        badge = Board.Picture("Shields", transform, Resources.Load<Texture2D>("Icons/bt-hex"), Color.white, 1, 1, 2993, 0.0016f);
        badgePatch = Board.Shape("Shields patch", transform, Color.white, 1, 1, 0.1f, 2994, 0.0017f);
        shieldN = Mats.FlatText("Shields count", transform, "0", 1, Hud.Rgba(179, 188, 203), true, 700, 0);
    }

    TextMeshPro Stand(string name, int weight)
    {
        var t = Mats.FlatText(name, heatRoot, "", 1, Color.white, true, weight, 6);
        t.alignment = TextAlignmentOptions.Center;
        return t;
    }

    /// <summary>Put it where the web's gauge stands at this size: its middle at (x, y) on the board (px), --vs across.</summary>
    public void Place(BoardLayout l, float x, float y)
    {
        lay = l;
        cx = x;
        cy = y;
        vs = l.Vs;
        transform.localPosition = l.At(x, y);
        transform.localScale = Vector3.one;
        transform.localRotation = Quaternion.identity;
        float u = l.U(1);
        corona.transform.localScale = new Vector3(0.88f * vs * u, 0.88f * vs * u, 1);
        float span = vs * (1 + 2 * SunArt.DOME_PAD);
        dome.transform.localScale = new Vector3(span * u, span * u, 1);
        balls.transform.localScale = new Vector3(span * u, span * u, 1);
        hit.size = new Vector3(vs * u, 0.1f, vs * u);
        hit.center = Vector3.zero;
        domeDirty = true;
        Lay();
    }

    /// <summary>The planet's pill and the shields' badge, laid out as .vit-under is at this size.</summary>
    void Lay()
    {
        if (lay == null) return;
        float u = lay.U(1);
        // (.vit-planet-tag: max(16px, --vs × 0.16) tall, padded --vs × 0.05 each side, a 2 px edge; its words Orbitron
        // 700 at max(8px, --vs × 0.075), spaced 0.12em. .board-shields: max(32px, --vs × 0.3) square. 4 px between.)
        float h = Mathf.Max(16, vs * 0.16f), font = Mathf.Max(8, vs * 0.075f), bs = Mathf.Max(32, vs * 0.3f);
        planet.fontSize = Board.Px(font);
        planet.characterSpacing = 12;
        float words = planet.GetPreferredValues(planet.text).x / u;
        float w = words + 2 * vs * 0.05f + 4;
        float row = Mathf.Max(h, bs), total = w + 4 + bs;
        // (Under the rival's sun, its row's top 1.26 --vs down from the gauge's; over yours, its foot 0.26 --vs up.)
        float top = mine ? -0.26f * vs - row : 1.26f * vs;
        float mid = top + row / 2 - vs / 2;
        float left = -total / 2;
        Vector3 At(float x, float y) => new Vector3(x * u, 0, -y * u);
        void Box(MeshRenderer r, float x, float y, float bw, float bh, float lift)
        {
            r.transform.localPosition = At(x, y) + new Vector3(0, lift, 0);
            float grow = r.transform.localScale.x > 0 ? 1 : 1;
            r.transform.localScale = new Vector3(bw * u * grow, bh * u * grow, 1);
            r.sharedMaterial.SetFloat("_Aspect", bh / bw);
            r.sharedMaterial.SetFloat("_Size", 0.5f);
            r.sharedMaterial.SetFloat("_Radius", Mathf.Min(bw, bh) / 2 / bw);
            r.sharedMaterial.SetFloat("_Soft", Mathf.Max(0.0005f, 0.6f / bw));
        }
        float px = left + w / 2;
        // (Its shadow, 0 2px 8px: the pill's own box 2 px down, its edge blurred 8 px (σ 4 px) either way, on a quad
        // grown 8 px all round to hold the blur.)
        {
            float grow = Mathf.Max((w + 16) / w, (h + 16) / h), qw = w * grow, qh = h * grow;
            pillShadow.transform.localPosition = At(px, mid + 2) + new Vector3(0, 0.0015f, 0);
            pillShadow.transform.localScale = new Vector3(qw * u, qh * u, 1);
            var m = pillShadow.sharedMaterial;
            m.SetFloat("_Aspect", qh / qw);
            m.SetFloat("_Size", 0.5f / grow);
            m.SetFloat("_Radius", h / 2 / qw);
            m.SetFloat("_Soft", 7f / qw);
        }
        Box(pillEdge, px, mid, w, h, 0.0016f);
        Box(pill, px, mid, w - 4, h - 4, 0.0017f);
        planet.transform.localPosition = At(px, mid) + new Vector3(0, 0.0018f, 0);
        planet.rectTransform.sizeDelta = new Vector2(w * u * 2, h * u);
        float bx = left + w + 4 + bs / 2;
        badge.transform.localPosition = At(bx, mid) + new Vector3(0, 0.0016f, 0);
        badge.transform.localScale = new Vector3(bs * 1.26f * u, bs * 1.26f * u, 1);
        float nf = bs * 0.28f;
        shieldN.fontSize = Board.Px(nf);
        shieldN.transform.localPosition = At(bx, mid) + new Vector3(0, 0.0019f, 0);
        float patchW = shieldN.GetPreferredValues(shieldN.text).x / u + nf * 0.24f, patchH = nf * 1.08f;
        Box(badgePatch, bx, mid, patchW, patchH, 0.0017f);
        badgePatch.sharedMaterial.SetFloat("_Radius", nf * 0.3f / patchW);
    }

    public void Show(GameState s, PlayerState p)
    {
        int newMost = Game.SupernovaThreshold(p);
        dead = p.Eliminated;
        heat = p.Heat;
        most = newMost;
        shields = dead ? 0 : p.Shields;
        danger = heat > 0 && heat >= most - 4;
        cold = heat < 0;
        hasOrbit = !dead;
        orbit = p.Orbit;
        eaten = Game.PlanetsEaten(s, p);
        paradise = Relics.RelicN(p.Relics, "paradise") + (p.Modifiers?.Paradise ?? 0) > 0;

        // The heat count (dark umber haloed white; white haloed deep blue when cold; faded when dead).
        float k = dead ? 0.5f : 1;
        var ink = cold ? Color.white : Hud.Rgba(0x3b, 0x1a, 0x08);
        var halo = cold ? new Color(10 / 255f, 28 / 255f, 72 / 255f, 0.95f) : new Color(1, 250 / 255f, 235 / 255f, 0.95f);
        heatB.text = heatGlowB.text = dead ? "" : heat.ToString();
        heatSmall.text = heatGlowSmall.text = dead ? "" : $"/{most}";
        heatB.color = new Color(ink.r, ink.g, ink.b, k);
        heatSmall.color = new Color(ink.r, ink.g, ink.b, 0.8f * k);
        foreach (var g in new[] { heatGlowB, heatGlowSmall })
        {
            g.color = new Color(halo.r, halo.g, halo.b, 0.85f * k);
            g.outlineWidth = 0.32f;
            g.outlineColor = new Color(halo.r, halo.g, halo.b, 0.55f * k);
        }

        // The planet facing the sun, named in its colour (a rival's galaxy eater: eaten; a Paradise relic: paradise).
        string facing = Game.PlanetAt(orbit);
        string word = eaten ? "eaten" : facing == "dead" && paradise ? "paradise" : facing;
        string look = eaten ? "dead" : word;
        planet.text = dead ? "" : word.ToUpperInvariant();
        planet.color = look switch
        {
            "abundant" => Hud.Rgba(0x2f, 0x9a, 0x72),
            "industrial" => Hud.Rgba(0xc0, 0x6d, 0x24),
            "paradise" => Hud.Rgba(0x2a, 0xa6, 0xa0),
            _ => Hud.Rgba(0x7d, 0x82, 0x8d),
        };
        foreach (var r in new[] { pillShadow, pillEdge, pill }) r.gameObject.SetActive(!dead);

        // The shields' badge: faint at none; up, tinted blue, its count in blue.
        bool up = shields > 0;
        badge.sharedMaterial.mainTexture = Resources.Load<Texture2D>(up ? "Icons/bt-hex-up" : "Icons/bt-hex");
        float op = up ? 1 : 0.35f;
        badge.sharedMaterial.color = new Color(1, 1, 1, op);
        var bsInk = up ? Hud.Rgba(0x3d, 0x7f, 0xc4) : Hud.Rgba(0xb3, 0xbc, 0xcb);
        var bsBg = up ? Color.Lerp(Color.white, Hud.Rgba(0x3d, 0x7f, 0xc4), 0.16f) : Color.white;
        shieldN.text = shields.ToString();
        shieldN.color = new Color(bsInk.r, bsInk.g, bsInk.b, op);
        badgePatch.sharedMaterial.color = new Color(bsBg.r, bsBg.g, bsBg.b, op);
        domeDirty = true;
        // (A changed sun is drawn at once, as sun3d.ts animateSuns redraws a changed canvas.)
        coronaBeat = -1;
        Lay();
    }

    /// <summary>The viewer's eye, which the dome is drawn for and the heat turned to.</summary>
    public void Face(Camera cam)
    {
        if (cam != eye) domeDirty = true;
        eye = cam;
    }

    /// <summary>The eye in the gauge's own board pixels (x right, y down from its top-left, z up off the board).</summary>
    Vector3 EyeInGauge()
    {
        if (eye == null || lay == null) return new Vector3(vs / 2, vs * 4, vs * 7);
        var t = transform.parent;
        var e = t != null ? t.InverseTransformPoint(eye.transform.position) : eye.transform.position;
        float bx = e.x * lay.Tcw + lay.Gw / 2, by = lay.PlaneCy - e.z * lay.Tcw, bz = e.y * lay.Tcw;
        return new Vector3(bx - (cx - vs / 2), by - (cy - vs / 2), bz);
    }

    /// <summary>The track's colour (art.ts vitals --rim): pale gold at 0, amber, deep red at supernova; icy blue when cold.</summary>
    Color Rim()
    {
        float t = Mathf.Clamp01(heat / (float)most);
        float c = heat < 0 ? Mathf.Min(1, heat / (float)Balance.MinHeat) : 0;
        float hue = c > 0 ? 205 : Mathf.Lerp(46, 4, t);
        float sat = c > 0 ? Mathf.Lerp(40, 70, c) : Mathf.Lerp(90, 88, t);
        float light = c > 0 ? Mathf.Lerp(80, 62, c) : Mathf.Lerp(60, 42, t);
        return Hsl(hue, sat, light);
    }

    static Color Hsl(float h, float s, float l)
    {
        s /= 100;
        l /= 100;
        float a = s * Mathf.Min(l, 1 - l);
        float F(int n)
        {
            float k = (n + h / 30) % 12;
            return l - a * Mathf.Max(-1, Mathf.Min(k - 3, Mathf.Min(9 - k, 1)));
        }
        return new Color(F(0), F(8), F(4));
    }

    /// <summary>The orbit as drawn: following the real one a notch at a time, each step eased (sun3d.ts shownOrbit).</summary>
    float ShownOrbit(float now)
    {
        float real = SunArt.OrbitNotch(orbit);
        if (float.IsNaN(shownOrbit) || now - orbitSeen > 3)
        {
            shownOrbit = real;
            orbitSeen = now;
            moving = false;
            return real;
        }
        float dt = Mathf.Max(0, now - orbitSeen);
        float gap = (((real - shownOrbit) % 9) + 9) % 9;
        if (gap > 4.5f) gap -= 9;
        if (Mathf.Abs(gap) < 1e-3f)
        {
            shownOrbit = real;
            orbitSeen = now;
            moving = false;
            return real;
        }
        // (A step is a planet's worth of notches: with a day for each planet, one sweep from planet to planet.)
        float per = 3f / BlueLoop.Engine.Balance.OrbitTurns;
        float speed = dt / 1.4f * per * Mathf.Max(1, Mathf.Abs(gap) / per / 2.5f);
        shownOrbit = Mathf.Abs(gap) <= speed ? real : shownOrbit + Mathf.Sign(gap) * speed;
        orbitSeen = now;
        moving = shownOrbit != real;
        return shownOrbit;
    }

    bool moving;

    float pulseAge = -1, pulseDelay;
    bool pulseHot;

    /// <summary>A hit landing: the sun swells and flares (hot), or shrinks a little and pales (cooled), and settles.</summary>
    float novaAge = -1;
    static readonly int NovaId = Shader.PropertyToID("_Nova");

    /// <summary>The sun going supernova (.fx-nova): it flares, twice as bright, then three times, then back, over 1.3 s.</summary>
    public void Nova() => novaAge = 0;

    public void Pulse(bool hot, float after = 0)
    {
        pulseAge = 0;
        pulseDelay = after;
        pulseHot = hot;
    }

    void Update()
    {
        if (lay == null) return;
        float now = Time.realtimeSinceStartup;
        double ms = Time.realtimeSinceStartupAsDouble * 1000;
        // (Drawn per pixel by their shaders: each frame only hands them their numbers, on the web's beats (sun3d.ts
        // frame). About 20 drawings a second for the corona's lazy flicker, on the twentieths of a second.)
        long beat = (long)System.Math.Floor(ms / 50);
        if (beat != coronaBeat)
        {
            coronaBeat = beat;
            DrawCorona(ms);
        }
        // The planets turn slowly: ten drawings a second do, unless an orbit is swinging (then every frame).
        float shown = hasOrbit ? ShownOrbit(now) : 0;
        if (!hasOrbit) moving = false;
        var cam = EyeInGauge();
        long tenth = (long)System.Math.Floor(ms / 100);
        if (domeDirty || moving || tenth != domeBeat || cam != laidCam)
        {
            domeBeat = tenth;
            DrawDome(ms, shown, cam);
        }
        if (novaAge >= 0)
        {
            // (@keyframes nova, 1.3 s, each step eased out: brightness 2, then 3 by 40%, then back to none.)
            novaAge += Time.deltaTime;
            float k = novaAge / 1.3f, b;
            float Out(float x) => BattleView.CubicBezier(0, 0, 0.58f, 1, Mathf.Clamp01(x));
            if (k >= 1) { b = 1; novaAge = -1; }
            else b = k < 0.4f ? Mathf.Lerp(2, 3, Out(k / 0.4f)) : Mathf.Lerp(3, 1, Out((k - 0.4f) / 0.6f));
            foreach (var r in new[] { corona, dome, balls, latBack, latFront })
                if (r != null) r.sharedMaterial.SetFloat(NovaId, b);
        }
        if (pulseAge >= 0)
        {
            pulseAge += Time.deltaTime;
            float t = Mathf.Clamp01((pulseAge - pulseDelay) / 0.42f);
            float bump = t > 0 ? Mathf.Sin(Mathf.PI * t) : 0;
            float k = 1 + (pulseHot ? 0.08f : -0.05f) * bump;
            float u = lay.U(1);
            corona.transform.localScale = new Vector3(0.88f * vs * u * k, 0.88f * vs * u * k, 1);
            if (pulseAge - pulseDelay > 0.42f)
            {
                pulseAge = -1;
                corona.transform.localScale = new Vector3(0.88f * vs * u, 0.88f * vs * u, 1);
            }
        }
    }

    /// <summary>The pixels per CSS pixel the suns were drawn at: the screen's, but at most 2 (sun3d.ts); their edges are smoothed over one.</summary>
    static float SunDpr => Mathf.Min(2, Css.PixelRatio);

    static readonly int SurfaceId = Shader.PropertyToID("_Surface"), DeepId = Shader.PropertyToID("_Deep"), MidId = Shader.PropertyToID("_Mid"),
        BrightId = Shader.PropertyToID("_Bright"), FlameId = Shader.PropertyToID("_Flame"), WispId = Shader.PropertyToID("_Wisp"),
        GeoId = Shader.PropertyToID("_Geo"), RingsId = Shader.PropertyToID("_Rings"), RimId = Shader.PropertyToID("_Rim"),
        PlanetsId = Shader.PropertyToID("_Planets"), Base0Id = Shader.PropertyToID("_Base0"), Base1Id = Shader.PropertyToID("_Base1"),
        Base2Id = Shader.PropertyToID("_Base2"), Trail0Id = Shader.PropertyToID("_Trail0"), Trail1Id = Shader.PropertyToID("_Trail1"),
        Trail2Id = Shader.PropertyToID("_Trail2"), FacingId = Shader.PropertyToID("_Facing"), LatticeId = Shader.PropertyToID("_Lattice"),
        CamId = Shader.PropertyToID("_Cam"), Ball0Id = Shader.PropertyToID("_Ball0"), Ball1Id = Shader.PropertyToID("_Ball1"),
        Ball2Id = Shader.PropertyToID("_Ball2"), Ball3Id = Shader.PropertyToID("_Ball3"), KindsId = Shader.PropertyToID("_Kinds"),
        SunPId = Shader.PropertyToID("_SunP"), Light0Id = Shader.PropertyToID("_Light0"), Half0Id = Shader.PropertyToID("_Half0"),
        Light1Id = Shader.PropertyToID("_Light1"), Half1Id = Shader.PropertyToID("_Half1"), Light2Id = Shader.PropertyToID("_Light2"),
        Half2Id = Shader.PropertyToID("_Half2"), LatId = Shader.PropertyToID("_Lat");
    static readonly int[] MapIds = { Shader.PropertyToID("_Map0"), Shader.PropertyToID("_Map1"), Shader.PropertyToID("_Map2") };

    void DrawCorona(double ms)
    {
        if (dead)
        {
            corona.enabled = false;
            return;
        }
        float t = Mathf.Clamp01(heat / (float)most);
        float c = heat < 0 ? Mathf.Min(1, heat / (float)Balance.MinHeat) : 0;
        var k = SunArt.Corona(t, c, danger, seed, ms);
        var m = corona.sharedMaterial;
        m.SetVector(DeepId, k.Deep);
        m.SetVector(MidId, k.Mid);
        m.SetVector(BrightId, k.Bright);
        m.SetVector(FlameId, k.Flame);
        m.SetVector(WispId, k.Wisp);
        corona.enabled = true;
    }

    void DrawDome(double ms, float shown, Vector3 cam)
    {
        // (sun3d.ts drawDome: its canvas a little finer than the screen's own pixels, at most 760 at the page's zoom; the
        // shaders smooth its edges over one of the canvas's pixels, as it did.)
        float span = vs * (1 + 2 * SunArt.DOME_PAD);
        int size = Mathf.Max(8, Mathf.RoundToInt(Mathf.Min(760 * Css.Zoom, span * SunDpr * Css.Zoom * 1.15f)));
        float t = Mathf.Clamp01(heat / (float)most);
        float c = heat < 0 ? Mathf.Min(1, heat / (float)Balance.MinHeat) : 0;
        var st = new SunArt.DomeState
        {
            T = t, Cold = c, Seed = seed, Dead = dead, Paradise = paradise, HasOrbit = hasOrbit,
            Orbit = hasOrbit ? SunArt.NotchEase(shown) : 0,
            Shields = shields,
            HeatArc = c > 0 ? c : t,
            ShieldArc = Mathf.Min(1, shields / (float)Balance.MaxKeptShields),
            Rim = Rim(),
        };
        var d = SunArt.Dome(size, vs, cam, st, ms);
        var f = dome.sharedMaterial;
        f.SetVector(GeoId, d.Geo);
        f.SetVector(RingsId, d.Rings);
        f.SetVector(RimId, d.Rim);
        f.SetVector(PlanetsId, d.Planets);
        f.SetVector(Base0Id, d.Base0);
        f.SetVector(Base1Id, d.Base1);
        f.SetVector(Base2Id, d.Base2);
        f.SetVector(Trail0Id, d.Trail0);
        f.SetVector(Trail1Id, d.Trail1);
        f.SetVector(Trail2Id, d.Trail2);
        f.SetVector(FacingId, d.Facing);
        f.SetVector(LatticeId, d.Lattice);
        var b = balls.sharedMaterial;
        b.SetVector(GeoId, d.Geo);
        b.SetVector(CamId, d.Cam);
        b.SetVector(Ball0Id, d.Ball0);
        b.SetVector(Ball1Id, d.Ball1);
        b.SetVector(Ball2Id, d.Ball2);
        b.SetVector(Ball3Id, d.Ball3);
        b.SetVector(KindsId, d.Kinds);
        b.SetVector(SunPId, d.SunP);
        b.SetVector(DeepId, d.Deep);
        b.SetVector(MidId, d.Mid);
        b.SetVector(BrightId, d.Bright);
        b.SetVector(Light0Id, d.Light0);
        b.SetVector(Half0Id, d.Half0);
        b.SetVector(Light1Id, d.Light1);
        b.SetVector(Half1Id, d.Half1);
        b.SetVector(Light2Id, d.Light2);
        b.SetVector(Half2Id, d.Half2);
        for (int i = 0; i < 3; i++)
            if (mapsShown[i] != d.Maps[i])
            {
                mapsShown[i] = d.Maps[i];
                b.SetTexture(MapIds[i], PlanetTexture(d.Maps[i]));
            }
        // Shields: a dome of hexagons over the sun, its cells laid out again only when the eye or the size moves.
        bool lattice = d.Cells != null;
        if (lattice && (d.Cells != laidCells || d.Geo.w != laidS || lay.U(1) != laidU)) LayLattice(d.Cells, d.Geo.w, d.Lat.y);
        latBack.enabled = latFront.enabled = lattice;
        if (lattice)
        {
            latBack.sharedMaterial.SetVector(LatId, d.Lat);
            latFront.sharedMaterial.SetVector(LatId, d.Lat);
        }
        dome.enabled = balls.enabled = true;
        if (domeDirty || cam != laidCam || vs != laidVs) PlaceHeat(cam);
        domeDirty = false;
        laidCam = cam;
        laidVs = vs;
    }

    /// <summary>
    /// The shields' lattice cells as quads round each (its box on the board, grown by the outline and a pixel), each
    /// carrying its six corners for the shader; the far side's in one mesh, the near side's in the other, in order.
    /// </summary>
    void LayLattice(List<SunArt.LatticeCell> cells, float s, float width)
    {
        laidCells = cells;
        laidS = s;
        laidU = lay.U(1);
        float u = laidU, m = width + 1 / s;
        foreach (bool front in new[] { false, true })
        {
            var pos = new List<Vector3>();
            var at = new List<Vector4>();
            var c01 = new List<Vector4>();
            var c23 = new List<Vector4>();
            var c45 = new List<Vector4>();
            var tris = new List<int>();
            foreach (var cell in cells)
            {
                if (cell.front != front) continue;
                var p = cell.pts;
                float x0 = float.PositiveInfinity, y0 = float.PositiveInfinity, x1 = float.NegativeInfinity, y1 = float.NegativeInfinity;
                foreach (var q in p) { x0 = Mathf.Min(x0, q.x); y0 = Mathf.Min(y0, q.y); x1 = Mathf.Max(x1, q.x); y1 = Mathf.Max(y1, q.y); }
                x0 -= m; y0 -= m; x1 += m; y1 += m;
                float a = SunArt.CellAlpha(cell);
                int n = pos.Count;
                foreach (var (x, y) in new[] { (x0, y0), (x1, y0), (x1, y1), (x0, y1) })
                {
                    pos.Add(new Vector3((x - vs / 2) * u, 0, -(y - vs / 2) * u));
                    at.Add(new Vector4(x, y, a, 0));
                    c01.Add(new Vector4(p[0].x, p[0].y, p[1].x, p[1].y));
                    c23.Add(new Vector4(p[2].x, p[2].y, p[3].x, p[3].y));
                    c45.Add(new Vector4(p[4].x, p[4].y, p[5].x, p[5].y));
                }
                tris.AddRange(new[] { n, n + 1, n + 2, n, n + 2, n + 3 });
            }
            var mesh = front ? frontMesh : backMesh;
            mesh.Clear();
            mesh.SetVertices(pos);
            mesh.SetUVs(0, at);
            mesh.SetUVs(1, c01);
            mesh.SetUVs(2, c23);
            mesh.SetUVs(3, c45);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateBounds();
        }
    }

    /// <summary>A quad lying flat on the board under the gauge's middle, drawn by one of the suns' shaders (hidden until first given its numbers).</summary>
    MeshRenderer Quad(string name, string shader, int queue, float lift)
    {
        var r = Mats.Flat(name, transform, Mats.Make(shader), 1, 1, lift);
        r.sharedMaterial.renderQueue = queue;
        r.enabled = false;
        return r;
    }

    /// <summary>A mesh of lattice cells lying on the board, in the gauge's own frame.</summary>
    MeshRenderer Lattice(string name, int queue, float lift, out Mesh mesh)
    {
        var go = new GameObject(name);
        go.transform.SetParent(transform, false);
        go.transform.localPosition = new Vector3(0, lift, 0);
        mesh = new Mesh { name = name };
        mesh.MarkDynamic();
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        var r = go.AddComponent<MeshRenderer>();
        r.sharedMaterial = Mats.Make("SunLattice");
        r.sharedMaterial.renderQueue = queue;
        r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        r.receiveShadows = false;
        r.enabled = false;
        return r;
    }

    static Texture2D surfaceTex;
    static readonly Dictionary<string, Texture2D> planetTex = new Dictionary<string, Texture2D>();

    /// <summary>The sun's surface for the shaders (painted once): its brightness in 16 bits, read back exactly (point, linear).</summary>
    static Texture2D SurfaceTexture()
    {
        if (surfaceTex != null) return surfaceTex;
        surfaceTex = new Texture2D(512, 256, TextureFormat.RGBA32, false, true) { name = "Sun surface", wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Point };
        surfaceTex.SetPixels32(SunArt.SurfacePixels());
        surfaceTex.Apply(false, true);
        return surfaceTex;
    }

    /// <summary>A planet's map for the shaders (painted once): its colours as the canvas's bytes (linear, so read as they are), wrapping round.</summary>
    static Texture2D PlanetTexture(string pl)
    {
        if (planetTex.TryGetValue(pl, out var have) && have != null) return have;
        var t = new Texture2D(256, 128, TextureFormat.RGBA32, false, true) { name = "Planet " + pl, wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Bilinear };
        t.SetPixels32(SunArt.PlanetPixels(pl));
        t.Apply(false, true);
        planetTex[pl] = t;
        return t;
    }

    /// <summary>The heat count where it stands: over the middle of the sun's outline as the eye sees it, turned to the eye.</summary>
    void PlaceHeat(Vector3 cam)
    {
        if (eye == null) return;
        float u = lay.U(1);
        var at = SunArt.LabelAt(vs, cam);
        var local = new Vector3((at.x - vs / 2) * u, 0, -(at.y - vs / 2) * u);
        var world = transform.TransformPoint(local);
        // (Drawn nearer the eye along its line of sight, and smaller to match, so it looks the same but stands clear of the
        // board.)
        const float f = 0.8f;
        var ep = eye.transform.position;
        var p = ep + (world - ep) * f;
        heatRoot.position = p;
        heatRoot.rotation = eye.transform.rotation;
        heatRoot.localScale = Vector3.one * f;
        // (.vit-heat: the count at --vs × 0.2, its most at --vs × 0.09 under it, line-height 1, 2 px under.)
        float bSize = vs * 0.2f, sSize = vs * 0.09f, total = bSize + sSize + 2;
        foreach (var x in new[] { heatB, heatGlowB })
        {
            x.fontSize = Board.Px(bSize);
            x.transform.localPosition = new Vector3(0, (total / 2 - bSize / 2) * u, 0);
            x.transform.localRotation = Quaternion.identity;
        }
        foreach (var x in new[] { heatSmall, heatGlowSmall })
        {
            x.fontSize = Board.Px(sSize);
            x.transform.localPosition = new Vector3(0, (total / 2 - bSize - sSize / 2) * u, 0);
            x.transform.localRotation = Quaternion.identity;
        }
        heatGlowB.transform.localPosition += new Vector3(0, 0, 0.001f);
        heatGlowSmall.transform.localPosition += new Vector3(0, 0, 0.001f);
    }

    public void Settle()
    {
        shownOrbit = SunArt.OrbitNotch(orbit);
        domeDirty = true;
    }

    void OnDestroy()
    {
        if (backMesh != null) Mats.Kill(backMesh);
        if (frontMesh != null) Mats.Kill(frontMesh);
    }
}

/// <summary>Whose sun this is (what a tap on it aims at).</summary>
public class SunTag : MonoBehaviour
{
    public string PlayerId;
}
