using BlueLoop.Engine;
using TMPro;
using UnityEngine;

/// <summary>
/// A side's sun on the table, as the web's (art.ts vitals, sun3d.ts, styles.css .vit): flat on the board, as the web's
/// are, its corona's flames under the rings, then the dome, where the sun and its planets are drawn as solids seen from
/// the viewer's eye (SunArt, a port of sun3d.ts), the orbit's trail and notches, and the shields' lattice; its heat
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

    MeshRenderer corona, dome;
    Texture2D coronaTex, domeTex;
    Color32[] coronaPx, coronaFlip, domePx, domeFlip;
    TextMeshPro heatB, heatSmall, heatGlowB, heatGlowSmall, planet, shieldN;
    MeshRenderer pillShadow, pillEdge, pill, badge, badgePatch;
    Transform heatRoot;
    BoxCollider hit;

    // What it shows.
    int heat, most = 20, shields, orbit;
    bool dead, danger, cold, paradise, eaten, hasOrbit;
    float seed;
    float shownOrbit = float.NaN, orbitSeen;
    float nextCorona, nextDome;
    bool domeDirty = true;

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
        corona = Board.Picture("Corona", transform, null, Color.white, 1, 1, 2950, 0.001f);
        dome = Board.Picture("Dome", transform, null, Color.white, 1, 1, 2956, 0.002f);
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
            return real;
        }
        float dt = Mathf.Max(0, now - orbitSeen);
        float gap = (((real - shownOrbit) % 9) + 9) % 9;
        if (gap > 4.5f) gap -= 9;
        if (Mathf.Abs(gap) < 1e-3f)
        {
            shownOrbit = real;
            orbitSeen = now;
            return real;
        }
        float speed = dt / 1.4f * Mathf.Max(1, Mathf.Abs(gap) / 2.5f);
        shownOrbit = Mathf.Abs(gap) <= speed ? real : shownOrbit + Mathf.Sign(gap) * speed;
        orbitSeen = now;
        moving = shownOrbit != real;
        return shownOrbit;
    }

    bool moving;

    float pulseAge = -1, pulseDelay;
    bool pulseHot;

    /// <summary>A hit landing: the sun swells and flares (hot), or shrinks a little and pales (cooled), and settles.</summary>
    public void Pulse(bool hot, float after = 0)
    {
        pulseAge = 0;
        pulseDelay = after;
        pulseHot = hot;
    }

    void Update()
    {
        if (lay == null) return;
        float now = Time.realtimeSinceStartup, ms = now * 1000;
        // The corona flickers about 20 times a second; the dome turns about 10 (every frame while the orbit swings).
        if (now >= nextCorona)
        {
            nextCorona = now + 0.05f;
            DrawCorona(ms);
        }
        if (domeDirty || moving || now >= nextDome)
        {
            nextDome = now + 0.1f;
            domeDirty = false;
            DrawDome(ms, now);
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

    void DrawCorona(float ms)
    {
        // (sun3d.ts draw: its canvas at the screen's pixels, at most 220 at the page's zoom.)
        float cw = 0.88f * vs;
        int size = Mathf.Max(8, Mathf.RoundToInt(Mathf.Min(220 * Css.Zoom, cw * Css.PixelRatio * Css.Zoom)));
        Ensure(ref coronaTex, ref coronaPx, ref coronaFlip, size, corona);
        float t = Mathf.Clamp01(heat / (float)most);
        float c = heat < 0 ? Mathf.Min(1, heat / (float)Balance.MinHeat) : 0;
        SunArt.Corona(coronaPx, size, t, c, danger, dead, seed, ms);
        Upload(coronaTex, coronaPx, coronaFlip, size);
    }

    void DrawDome(float ms, float now)
    {
        // (sun3d.ts drawDome: a little finer than the screen's own pixels, at most 760 at the page's zoom.)
        float span = vs * (1 + 2 * SunArt.DOME_PAD);
        int size = Mathf.Max(8, Mathf.RoundToInt(Mathf.Min(760 * Css.Zoom, span * Css.PixelRatio * Css.Zoom * 1.15f)));
        Ensure(ref domeTex, ref domePx, ref domeFlip, size, dome);
        var cam = EyeInGauge();
        float t = Mathf.Clamp01(heat / (float)most);
        float c = heat < 0 ? Mathf.Min(1, heat / (float)Balance.MinHeat) : 0;
        var st = new SunArt.DomeState
        {
            T = t, Cold = c, Seed = seed, Dead = dead, Paradise = paradise, HasOrbit = hasOrbit,
            Orbit = hasOrbit ? SunArt.NotchEase(ShownOrbit(now)) : 0,
            Shields = shields,
            HeatArc = c > 0 ? c : t,
            ShieldArc = Mathf.Min(1, shields / (float)Balance.MaxKeptShields),
            Rim = Rim(),
        };
        SunArt.Dome(domePx, size, vs, cam, st, ms);
        Upload(domeTex, domePx, domeFlip, size);
        PlaceHeat(cam);
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

    static void Ensure(ref Texture2D tex, ref Color32[] px, ref Color32[] flip, int size, MeshRenderer r)
    {
        if (tex != null && tex.width == size) return;
        if (tex != null) Mats.Kill(tex);
        tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
        px = new Color32[size * size];
        flip = new Color32[size * size];
        r.sharedMaterial.mainTexture = tex;
    }

    /// <summary>A canvas's rows (top down) into a texture's (bottom up).</summary>
    static void Upload(Texture2D tex, Color32[] px, Color32[] flip, int size)
    {
        for (int y = 0; y < size; y++) System.Array.Copy(px, y * size, flip, (size - 1 - y) * size, size);
        // (A clear pixel takes its drawn neighbour's colour: the texture is filtered between its pixels, and a clear
        // black one beside a fine white ring (the heat track) greyed its edges into a dark, broken line round the sun.)
        for (int i = 0; i < flip.Length; i++)
        {
            if (flip[i].a != 0) continue;
            int x = i % size;
            Color32 n = default;
            if (x > 0 && px[Src(i - 1)].a != 0) n = px[Src(i - 1)];
            else if (x < size - 1 && px[Src(i + 1)].a != 0) n = px[Src(i + 1)];
            else if (i >= size && px[Src(i - size)].a != 0) n = px[Src(i - size)];
            else if (i + size < flip.Length && px[Src(i + size)].a != 0) n = px[Src(i + size)];
            else continue;
            flip[i] = new Color32(n.r, n.g, n.b, 0);
        }
        int Src(int j) => (size - 1 - j / size) * size + j % size;
        tex.SetPixels32(flip);
        tex.Apply(false);
    }

    public void Settle()
    {
        shownOrbit = SunArt.OrbitNotch(orbit);
        domeDirty = true;
    }

    void OnDestroy()
    {
        if (coronaTex != null) Mats.Kill(coronaTex);
        if (domeTex != null) Mats.Kill(domeTex);
    }
}

/// <summary>Whose sun this is (what a tap on it aims at).</summary>
public class SunTag : MonoBehaviour
{
    public string PlayerId;
}
