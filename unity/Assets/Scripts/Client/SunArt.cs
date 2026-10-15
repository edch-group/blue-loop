using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// The suns as the web draws them (sun3d.ts): the corona, ragged flames licking out across the board round each sun's
/// base; and the dome, the sun and its planets ray-traced as solids rising out of the board, painted flat on it so that
/// from the viewer's eye they look solid (the trick of 3D pavement art), with the orbit's trail and notches, the planets'
/// bases, the rings (art.ts's tracks) and the shields' lattice laid flat round them. Drawn pixel by pixel on the GPU
/// (Shaders/SunCore.cginc, sun3d.ts's pixel loops ported line for line); here, what the shaders are given: the surface
/// and the planets' maps (painted once), and each drawing's numbers (the palette, the places, the eye, the time).
/// </summary>
public static class SunArt
{
    const int TW = 512, TH = 256;
    static float[] texture;

    static float Hash3(int x, int y, int z)
    {
        int h = (x * 374761393) ^ (y * 668265263) ^ (z * 2147483647);
        h = (int)((uint)h ^ ((uint)h >> 13)) * 1274126177;
        return (uint)(h ^ (int)((uint)h >> 16)) / 4294967296f;
    }

    static float Noise3(float x, float y, float z)
    {
        int xi = Mathf.FloorToInt(x), yi = Mathf.FloorToInt(y), zi = Mathf.FloorToInt(z);
        float xf = x - xi, yf = y - yi, zf = z - zi;
        float u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
        float L(float a, float b, float t) => a + (b - a) * t;
        float C(int dx, int dy, int dz) => Hash3(xi + dx, yi + dy, zi + dz);
        return L(L(L(C(0, 0, 0), C(1, 0, 0), u), L(C(0, 1, 0), C(1, 1, 0), u), v),
            L(L(C(0, 0, 1), C(1, 0, 1), u), L(C(0, 1, 1), C(1, 1, 1), u), v), w);
    }

    static float Fbm3(float x, float y, float z, int octaves)
    {
        float sum = 0, amp = 0.5f, f = 1, norm = 0;
        for (int i = 0; i < octaves; i++)
        {
            sum += amp * Noise3(x * f, y * f, z * f);
            norm += amp;
            f *= 2.07f;
            amp *= 0.52f;
        }
        return sum / norm;
    }

    /// <summary>The surface, as brightness 0–1 over longitude × latitude (painted on first use).</summary>
    static float[] Surface()
    {
        if (texture != null) return texture;
        var t = new float[TW * TH];
        for (int j = 0; j < TH; j++)
        {
            float lat = (j / (float)(TH - 1) - 0.5f) * Mathf.PI;
            for (int i = 0; i < TW; i++)
            {
                float lon = i / (float)TW * Mathf.PI * 2;
                float x = Mathf.Cos(lat) * Mathf.Cos(lon), y = Mathf.Sin(lat), z = Mathf.Cos(lat) * Mathf.Sin(lon);
                // Large convection cells, folded so their edges run as darker lanes, with fine granulation over them.
                float cells = Fbm3(x * 2.2f + 5, y * 2.2f, z * 2.2f, 4);
                float lanes = 1 - Mathf.Abs(2 * Fbm3(x * 4.5f, y * 4.5f + 9, z * 4.5f, 4) - 1);
                float grain = Fbm3(x * 16, y * 16, z * 16 + 3, 3);
                t[j * TW + i] = Mathf.Clamp01(0.18f + cells * 0.55f + lanes * 0.35f - grain * 0.28f);
            }
        }
        texture = t;
        return t;
    }

    /// <summary>
    /// The surface for the shaders: 512 × 256 RGBA, row j of the canvas's texture at row j (bottom up), its brightness in
    /// 16 bits (red the high byte, green the low), read back exactly by point sampling (SunCore.cginc SunSurface).
    /// </summary>
    public static Color32[] SurfacePixels()
    {
        var t = Surface();
        var o = new Color32[TW * TH];
        for (int k = 0; k < o.Length; k++)
        {
            int v = Mathf.Clamp(Mathf.RoundToInt(t[k] * 65535), 0, 65535);
            o[k] = new Color32((byte)(v >> 8), (byte)(v & 255), 0, 255);
        }
        return o;
    }

    // (The sun's white-hot limb, 255 248 222, and a living world's glowing air, 170 220 255, are in SunCore.cginc.)

    static Vector3 Mix(Vector3 a, Vector3 b, float k) => a + (b - a) * k;

    /// <summary>The sun's palette by heat: deep, mid and bright.</summary>
    static Vector3[] Palette(float t, float cold)
    {
        if (cold > 0)
            return new[] { Mix(new Vector3(170, 58, 8), new Vector3(24, 64, 150), cold), Mix(new Vector3(246, 140, 34), new Vector3(96, 160, 236), cold), Mix(new Vector3(255, 232, 150), new Vector3(222, 242, 255), cold) };
        // Orange-gold when cool, through orange, to a deep angry red near supernova (like a photograph of the Sun).
        return new[] { Mix(new Vector3(170, 58, 8), new Vector3(120, 16, 6), t), Mix(new Vector3(246, 140, 34), new Vector3(226, 64, 22), t), Mix(new Vector3(255, 232, 150), new Vector3(255, 186, 110), t) };
    }

    static Vector3[] SunPalette(float t, float cold, bool dead) =>
        dead ? new[] { new Vector3(92, 94, 102), new Vector3(148, 151, 158), new Vector3(204, 206, 212) } : Palette(t, cold);

    static Vector4 V4(Vector3 v, float w = 0) => new Vector4(v.x, v.y, v.z, w);

    // ---- The corona ----

    /// <summary>The corona's numbers for a moment (sun3d.ts draw), for Shaders/SunCorona.</summary>
    public struct CoronaUniforms
    {
        /// <summary>The palette (0–255).</summary>
        public Vector4 Deep, Mid, Bright;
        /// <summary>x: danger, y: seed, z: flick (time × 0.0004).</summary>
        public Vector4 Flame;
        /// <summary>x: (flick × 20) mod 256 (the wisps' row), y: floor(flick × 30) mod 512 (their column).</summary>
        public Vector4 Wisp;
    }

    public static CoronaUniforms Corona(float t, float cold, bool danger, float seed, double timeMs)
    {
        var pal = Palette(t, cold);
        double flick = timeMs * 0.0004;
        // (The wisps' offsets wrapped round the surface here, in double: the texture's rows and columns repeat, and the
        // shader's floats stay small however long the game runs.)
        double row = flick * 20, col = System.Math.Floor(flick * 30);
        return new CoronaUniforms
        {
            Deep = V4(pal[0]), Mid = V4(pal[1]), Bright = V4(pal[2]),
            Flame = new Vector4(danger ? 1 : 0, seed, (float)flick, 0),
            Wisp = new Vector4((float)(row - 256 * System.Math.Floor(row / 256)), (float)(col - 512 * System.Math.Floor(col / 512)), 0, 0),
        };
    }

    // ---- The dome: the sun and its planets as solids, seen from where the eye really is ----

    /// <summary>The dome's radius and the orbit's, as shares of the gauge's size; how far the dome canvas reaches past it.</summary>
    public const float DOME_R = 0.27f, ORBIT_R = 0.56f, DOME_PAD = 0.6f;

    static readonly string[] PLANETS = { "dead", "abundant", "industrial" };
    const int PW = 256, PH = 128;
    static readonly Dictionary<string, Color32[]> planetMaps = new Dictionary<string, Color32[]>();
    static float Clamp01(float x) => Mathf.Clamp01(x);

    /// <summary>
    /// A planet's surface, 256 × 128 RGBA over longitude × latitude (row j at row j, bottom up), painted on first use;
    /// the shader reads it bilinear, wrapping round in longitude (SunCore.cginc SunPlanetShade).
    /// </summary>
    public static Color32[] PlanetPixels(string pl)
    {
        if (planetMaps.TryGetValue(pl, out var have)) return have;
        var o = new Color32[PW * PH];
        // A few craters for the dead world: centre direction and size.
        var craters = new List<(Vector3 d, float r)>();
        for (int k = 0; k < 26; k++)
        {
            float u = Hash3(k, 7, 1) * 2 - 1, th = Hash3(k, 3, 9) * Mathf.PI * 2, q = Mathf.Sqrt(1 - u * u);
            craters.Add((new Vector3(q * Mathf.Cos(th), u, q * Mathf.Sin(th)), 0.08f + 0.22f * Mathf.Pow(Hash3(k, 5, 2), 2)));
        }
        for (int j = 0; j < PH; j++)
        {
            float lat = (j / (float)(PH - 1) - 0.5f) * Mathf.PI;
            for (int i = 0; i < PW; i++)
            {
                float lon = i / (float)PW * Mathf.PI * 2;
                float x = Mathf.Cos(lat) * Mathf.Cos(lon), y = Mathf.Sin(lat), z = Mathf.Cos(lat) * Mathf.Sin(lon);
                Vector3 col;
                if (pl == "dead")
                {
                    // Dusty grey rock: mottled maria, fine grit, and craters with bright rims and dark floors.
                    float maria = Fbm3(x * 2.4f + 11, y * 2.4f, z * 2.4f, 4);
                    float grit = Fbm3(x * 18, y * 18, z * 18, 3);
                    float v = 0.62f + (maria - 0.5f) * 0.55f + (grit - 0.5f) * 0.22f;
                    foreach (var (d, r) in craters)
                    {
                        float dd = Mathf.Acos(Mathf.Min(1, x * d.x + y * d.y + z * d.z)) / r;
                        if (dd < 1.25f) v += dd < 0.8f ? -0.24f * (1 - dd / 0.8f) - 0.06f : 0.2f * (1 - Mathf.Abs(dd - 1) / 0.25f);
                    }
                    col = Mix(new Vector3(92, 96, 106), new Vector3(206, 210, 218), Clamp01(v));
                }
                else if (pl == "paradise")
                {
                    // A Paradise relic's dead world, brought to life: turquoise shallows, white sand, blossoming green isles.
                    float land = Fbm3(x * 2.2f + 9, y * 2.2f, z * 2.2f + 1, 5);
                    float bloom = Fbm3(x * 9, y * 9 + 3, z * 9, 3);
                    var sea = Mix(new Vector3(40, 170, 190), new Vector3(120, 220, 214), Clamp01((land - 0.3f) * 4));
                    var isle = Mix(new Vector3(70, 176, 96), new Vector3(246, 196, 222), Clamp01((bloom - 0.62f) * 4));
                    col = land > 0.55f ? isle : land > 0.52f ? new Vector3(240, 232, 200) : sea;
                    float cloud = Clamp01((Fbm3(x * 3 + 4, y * 6, z * 3, 5) - 0.58f) * 3);
                    col = Mix(col, new Vector3(255, 255, 255), cloud * 0.8f);
                }
                else if (pl == "abundant")
                {
                    // Oceans and green continents, ice at the poles, and wisps of cloud.
                    float land = Fbm3(x * 1.8f + 3, y * 1.8f, z * 1.8f + 7, 5);
                    float lush = Fbm3(x * 5, y * 5 + 4, z * 5, 3);
                    var ocean = Mix(new Vector3(28, 92, 150), new Vector3(52, 148, 196), Clamp01((land - 0.3f) * 4));
                    var ground = Mix(new Vector3(54, 150, 82), new Vector3(150, 168, 92), Clamp01((lush - 0.45f) * 2.4f));
                    col = land > 0.52f ? Mix(ground, new Vector3(40, 120, 70), Clamp01((land - 0.6f) * 3)) : ocean;
                    if (land > 0.5f && land < 0.52f) col = Mix(ocean, new Vector3(196, 200, 150), 0.5f);
                    float ice = Clamp01((Mathf.Abs(y) - 0.8f) * 8 + (Fbm3(x * 6, y * 6, z * 6, 3) - 0.5f) * 2);
                    col = Mix(col, new Vector3(236, 244, 250), ice);
                    float cloud = Clamp01((Fbm3(x * 3.2f + 20, y * 6.5f, z * 3.2f, 5) - 0.55f) * 3.2f);
                    col = Mix(col, new Vector3(250, 252, 255), cloud * 0.85f);
                }
                else
                {
                    // An industrial world: rust-and-ochre bands, smoke swirls, and a lattice of glowing works.
                    float warp = Fbm3(x * 3, y * 3, z * 3 + 5, 4);
                    float band = 0.5f + 0.5f * Mathf.Sin(y * 14 + warp * 5);
                    col = Mix(new Vector3(150, 72, 30), new Vector3(238, 168, 86), band);
                    float smoke = Clamp01((Fbm3(x * 7, y * 7 + 2, z * 7, 4) - 0.5f) * 2.5f);
                    col = Mix(col, new Vector3(96, 58, 40), smoke * 0.55f);
                    float grid = Mathf.Max(Mathf.Pow(Mathf.Abs(Mathf.Sin(lon * 18)), 60), Mathf.Pow(Mathf.Abs(Mathf.Sin(lat * 18)), 60));
                    float works = Clamp01((Fbm3(x * 9 + 1, y * 9, z * 9, 2) - 0.52f) * 6);
                    col = Mix(col, new Vector3(255, 226, 140), grid * works * 0.9f);
                }
                // (Bytes as a canvas's ImageData keeps them: Uint8ClampedArray rounds.)
                o[j * PW + i] = new Color32((byte)Mathf.Clamp(Mathf.Round(col.x), 0, 255), (byte)Mathf.Clamp(Mathf.Round(col.y), 0, 255), (byte)Mathf.Clamp(Mathf.Round(col.z), 0, 255), 255);
            }
        }
        planetMaps[pl] = o;
        return o;
    }

    /// <summary>Each planet's trail along the orbit, and its notches: deeper than the planet, to read on the white board.</summary>
    static Vector3 TrailRgb(string pl) => pl switch
    {
        "dead" => new Vector3(112, 118, 132),
        "paradise" => new Vector3(52, 176, 170),
        "abundant" => new Vector3(40, 158, 112),
        _ => new Vector3(214, 120, 36),
    };

    /// <summary>Where an orbit stands on the drawn ring of nine notches (art.ts orbitNotch).</summary>
    public static float OrbitNotch(int orbit)
    {
        float per = 3f / BlueLoop.Engine.Balance.OrbitTurns;
        return orbit * per + (per - 1) / 2;
    }

    /// <summary>A step-to-step swing (a planet's worth of notches, from one planet's place to the next): within each, ease in and out.</summary>
    public static float NotchEase(float o)
    {
        float per = 3f / BlueLoop.Engine.Balance.OrbitTurns, off = (per - 1) / 2;
        float u = (o - off) / per, i = Mathf.Floor(u), f = u - i;
        return off + (i + f * f * (3 - 2 * f)) * per;
    }

    static Vector3 OnBoard(Vector3 cam, Vector3 p)
    {
        float k = cam.z / (cam.z - p.z);
        return new Vector3(cam.x + (p.x - cam.x) * k, cam.y + (p.y - cam.y) * k, 0);
    }

    /// <summary>What a sun's dome shows: its heat, its orbit as drawn (fractional while swinging), its shields.</summary>
    public struct DomeState
    {
        public float T, Cold, Seed, Orbit;
        public bool Dead, Paradise, HasOrbit;
        public int Shields;
        public float HeatArc, ShieldArc;
        public Color Rim;
    }

    /// <summary>
    /// A dome's numbers for a moment (sun3d.ts drawDome), for Shaders/SunFlat and SunBalls (their properties by name), and
    /// the planets' maps by slot. All in the gauge's own board pixels (x right, y down from its top-left, z up off the
    /// board), as `cam`, the eye; the canvas spans the gauge and DOME_PAD of it past every side, `size` pixels across.
    /// </summary>
    public class DomeUniforms
    {
        public Vector4 Geo, Rings, Rim, Planets, Base0, Base1, Base2, Trail0, Trail1, Trail2, Facing, Lattice;
        public Vector4 Cam, Ball0, Ball1, Ball2, Ball3, Kinds, SunP, Deep, Mid, Bright, Light0, Half0, Light1, Half1, Light2, Half2;
        /// <summary>The planet whose map each planet slot (0–2) shows.</summary>
        public string[] Maps = new string[3];
        /// <summary>The shields' lattice (null: none): its cells, and x: strength × shimmer, y: the outline's width, z: s.</summary>
        public List<LatticeCell> Cells;
        public Vector4 Lat;
    }

    public static DomeUniforms Dome(int size, float vs, Vector3 cam, DomeState st, double timeMs)
    {
        var u = new DomeUniforms();
        float span = vs * (1 + 2 * DOME_PAD);
        float s = size / span, pad = DOME_PAD * vs;
        var c = new Vector3(vs / 2, vs / 2, 0);
        float R = vs * DOME_R;
        u.Geo = new Vector4(vs, span, pad, s);
        u.Cam = V4(cam);

        // The tracks, flat on the board under the dome (art.ts ringTracks: viewBox 100 = the gauge): the orbit, the
        // shields' and the heat's, each a full faint ring and its arc from the left end round the near side.
        float dim = st.Dead ? 0.5f : 1;
        u.Rings = new Vector4(dim, st.HasOrbit ? 1 : 0, st.HeatArc > 0 ? st.HeatArc : 0, st.Shields > 0 && st.ShieldArc > 0 ? st.ShieldArc : 0);
        u.Rim = new Vector4(st.Rim.r, st.Rim.g, st.Rim.b, 1);

        var pal = SunPalette(st.T, st.Cold, st.Dead);
        u.Deep = V4(pal[0]);
        u.Mid = V4(pal[1]);
        u.Bright = V4(pal[2]);
        // (The turns wrapped to a whole turn here, in double: the shader reads them round the circle, and its floats stay
        // precise however long the game runs.)
        double Turn(double a) => a - System.Math.PI * 2 * System.Math.Floor(a / (System.Math.PI * 2));
        u.SunP = new Vector4((float)Turn(timeMs * 0.00004 + st.Seed), st.Dead ? 1 : 0, 0, 0);
        var balls = new List<(Vector3 ctr, float r, int kind)> { (c, R, 0) };

        // The planets: half-spheres in the board on the orbit (on the ring's nine notches, each planet's middle one).
        u.Planets = new Vector4(0, vs * 0.07f, 0, 0);
        var lights = new Vector4[3];
        var halves = new Vector4[3];
        var bases = new Vector4[3];
        var trails = new Vector4[3];
        for (int i = 0; i < 3; i++) u.Maps[i] = PLANETS[i];
        if (!st.Dead && st.HasOrbit)
        {
            float o = st.Orbit;
            float wrap = ((o % 9) + 9) % 9;
            int fi = Mathf.Min(2, Mathf.FloorToInt(wrap / 3));
            string Look(string pl) => pl == "dead" && st.Paradise ? "paradise" : pl;
            string facing = Look(PLANETS[fi]);
            float stage = wrap - fi * 3;
            var glow = new Vector3(c.x, c.y, R * 0.5f);
            for (int i = 0; i < 3; i++)
            {
                string pl = Look(PLANETS[i]);
                float pr = vs * 0.07f;
                float ang = (90 - (i * 3 + 1 - o) * 40) * Mathf.Deg2Rad;
                var ctr = new Vector3(c.x + Mathf.Cos(ang) * ORBIT_R * vs, c.y + Mathf.Sin(ang) * ORBIT_R * vs, 0);
                // A clear border round its base on the board: a band of its own colour hugging the outline, fading out.
                bases[i] = new Vector4(ctr.x, ctr.y, 0, 0);
                trails[i] = V4(TrailRgb(pl) / 255f, 1);
                u.Maps[i] = pl;
                double turn = Turn(timeMs * 0.00012 + st.Seed + i * 2.1);
                var light = (glow - (ctr + new Vector3(0, 0, pr * 0.5f))).normalized;
                var half = (light + new Vector3(0, 0, 1)).normalized;
                bool wet = pl == "abundant" || pl == "paradise";
                // Lit from the sun: a soft terminator, darker towards the outline, and a glint of sunlight.
                lights[i] = V4(light, wet ? 1 : 0);
                halves[i] = V4(half, (float)turn);
                balls.Add((ctr, pr, i + 1));
            }
            // (Its days marked only while a planet faces the sun for more than one.)
            u.Planets = new Vector4(1, vs * 0.07f, BlueLoop.Engine.Balance.OrbitTurns > 1 ? 1 : 0, stage);
            u.Facing = V4(TrailRgb(facing) / 255f, 1);
        }
        u.Base0 = bases[0]; u.Base1 = bases[1]; u.Base2 = bases[2];
        u.Trail0 = trails[0]; u.Trail1 = trails[1]; u.Trail2 = trails[2];
        u.Light0 = lights[0]; u.Light1 = lights[1]; u.Light2 = lights[2];
        u.Half0 = halves[0]; u.Half1 = halves[1]; u.Half2 = halves[2];

        // Shields: a dome of hexagons over the sun. Its far side goes under the sun, its near side over it.
        float strength = Mathf.Min(1, st.Shields / (float)BlueLoop.Engine.Balance.MaxKeptShields);
        if (st.Shields > 0 && !st.Dead)
        {
            u.Cells = LatticeCells(c, R * LATTICE_R, cam);
            float shimmer = 0.85f + 0.15f * (float)System.Math.Sin(timeMs * 0.0021);
            u.Lat = new Vector4((0.45f + 0.55f * strength) * shimmer, Mathf.Max(0.6f, vs * 0.0055f), s, 0);
            u.Lattice = new Vector4(1, R * LATTICE_R, 0.25f + 0.35f * strength, 0);
        }

        // The balls, farthest first, so nearer balls paint over farther ones.
        balls.Sort((a, b) => (cam - b.ctr).magnitude.CompareTo((cam - a.ctr).magnitude));
        var slots = new Vector4[4];
        var kinds = new float[] { -1, -1, -1, -1 };
        for (int k = 0; k < balls.Count && k < 4; k++)
        {
            slots[k] = V4(balls[k].ctr, balls[k].r);
            kinds[k] = balls[k].kind;
        }
        u.Ball0 = slots[0]; u.Ball1 = slots[1]; u.Ball2 = slots[2]; u.Ball3 = slots[3];
        u.Kinds = new Vector4(kinds[0], kinds[1], kinds[2], kinds[3]);
        return u;
    }

    /// <summary>Where the heat count stands: the middle of the sun's outline as the eye sees it, on the board (gauge px).</summary>
    public static Vector2 LabelAt(float vs, Vector3 cam)
    {
        var c = new Vector3(vs / 2, vs / 2, 0);
        float R = vs * DOME_R;
        float x0 = float.PositiveInfinity, y0 = float.PositiveInfinity, x1 = float.NegativeInfinity, y1 = float.NegativeInfinity;
        for (int la = 0; la <= 90; la += 10)
            for (int lo = 0; lo < 360; lo += 10)
            {
                float a = la * Mathf.Deg2Rad, b = lo * Mathf.Deg2Rad;
                var q = OnBoard(cam, new Vector3(c.x + R * Mathf.Cos(a) * Mathf.Cos(b), c.y + R * Mathf.Cos(a) * Mathf.Sin(b), R * Mathf.Sin(a)));
                x0 = Mathf.Min(x0, q.x); y0 = Mathf.Min(y0, q.y); x1 = Mathf.Max(x1, q.x); y1 = Mathf.Max(y1, q.y);
            }
        return new Vector2((x0 + x1) / 2, (y0 + y1) / 2);
    }

    /// <summary>The shield dome's radius, as a share of the sun's.</summary>
    const float LATTICE_R = 1.4f;
    /// <summary>A cell of the shields' lattice: its corners on the board (gauge px), whether on the near side, how squarely it faces the eye.</summary>
    public class LatticeCell { public Vector2[] pts; public bool front; public float face; }
    static readonly Dictionary<string, List<LatticeCell>> lattices = new Dictionary<string, List<LatticeCell>>();

    /// <summary>The shield dome's hexagons, laid over a half-sphere round the sun, each projected onto the board as the eye sees it.</summary>
    static List<LatticeCell> LatticeCells(Vector3 c, float r, Vector3 cam)
    {
        string key = $"{c.x:F2},{c.y:F2}|{r:F2}|{cam.x:F2},{cam.y:F2},{cam.z:F2}";
        if (lattices.TryGetValue(key, out var have)) return have;
        float deg = Mathf.Deg2Rad, size = 11 * deg, dx = size * 1.5f, dy = size * Mathf.Sqrt(3);
        Vector3 At(float lon, float lat) => new Vector3(c.x + r * Mathf.Cos(lat) * Mathf.Cos(lon), c.y + r * Mathf.Cos(lat) * Mathf.Sin(lon), r * Mathf.Sin(lat));
        var cells = new List<LatticeCell>();
        int cols = Mathf.RoundToInt(Mathf.PI * 2 / dx);
        for (int col = 0; col < cols; col++)
            for (int row = 0; row <= 6; row++)
            {
                float lon = col * (Mathf.PI * 2 / cols);
                float lat = row * dy + (col % 2 == 1 ? dy / 2 : 0) + size * 0.5f;
                if (lat > 84 * deg) continue;
                var midp = At(lon, lat);
                var n = (midp - c).normalized;
                float face = Vector3.Dot(n, (cam - midp).normalized);
                var pts = new Vector2[6];
                for (int k = 0; k < 6; k++)
                {
                    float a = k * Mathf.PI / 3;
                    float la = Mathf.Max(0, lat + Mathf.Sin(a) * size * 0.9f);
                    var q = OnBoard(cam, At(lon + Mathf.Cos(a) * size * 0.9f / Mathf.Max(0.3f, Mathf.Cos(lat)), la));
                    pts[k] = new Vector2(q.x, q.y);
                }
                cells.Add(new LatticeCell { pts = pts, front = face > 0, face = Mathf.Max(0, face) });
            }
        if (lattices.Count > 16) lattices.Clear();
        lattices[key] = cells;
        return cells;
    }

    /// <summary>A lattice cell's own alpha (before strength × shimmer): faint on the far side, by how squarely it faces on the near.</summary>
    public static float CellAlpha(LatticeCell cell) => cell.front ? 0.22f + 0.6f * cell.face : 0.12f;
}
