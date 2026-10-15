using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// The suns as the web draws them (sun3d.ts, ported line for line): the corona, ragged flames licking out across the
/// board round each sun's base; and the dome, the sun and its planets ray-traced as solids rising out of the board,
/// painted flat on it so that from the viewer's eye they look solid (the trick of 3D pavement art), with the orbit's
/// trail and notches, the planets' bases, the rings (art.ts's tracks) and the shields' lattice laid flat round them.
/// Each draws into a pixel buffer, rows top down as a canvas's (the caller turns them for a texture).
/// </summary>
public static class SunArt
{
    const int TW = 512, TH = 256, FLAMES = 360;
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

    /// <summary>The sun's white-hot limb, and a living world's glowing air.</summary>
    static readonly Vector3 LIMB = new Vector3(255, 248, 222), AIR = new Vector3(170, 220, 255);

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

    // ---- The corona ----

    /// <summary>Each pixel of a corona canvas, by size: how far from the sun's centre (in its radii), and which flame's direction.</summary>
    static readonly Dictionary<int, (float[] rad, short[] dir)> coronaGrids = new Dictionary<int, (float[], short[])>();

    static (float[] rad, short[] dir) CoronaGrid(int size, float c, float R)
    {
        if (coronaGrids.TryGetValue(size, out var g)) return g;
        var rad = new float[size * size];
        var dir = new short[size * size];
        for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float dx = (x - c + 0.5f) / R, dy = (y - c + 0.5f) / R;
                rad[y * size + x] = Mathf.Sqrt(dx * dx + dy * dy);
                float a = Mathf.Atan2(dy, dx) / (Mathf.PI * 2) + 1;
                dir[y * size + x] = (short)Mathf.FloorToInt((a % 1) * FLAMES);
            }
        g = (rad, dir);
        coronaGrids[size] = g;
        return g;
    }

    /// <summary>The sun's base radius, as a share of the corona's canvas (the dome is 0.27 of the gauge; the canvas 0.88 of it).</summary>
    const float RADIUS = 0.27f / 0.88f;

    /// <summary>The corona's flames for a frame (sun3d.ts draw), into `px` (size × size, rows top down).</summary>
    public static void Corona(Color32[] px, int size, float t, float cold, bool danger, bool dead, float seed, float timeMs)
    {
        if (dead)
        {
            System.Array.Clear(px, 0, px.Length);
            return;
        }
        var tex = Surface();
        var pal = Palette(t, cold);
        Vector3 deep = pal[0], mid = pal[1], bright = pal[2];
        float c = size / 2f, R = size * RADIUS, flick = timeMs * 0.0004f;
        // The flames round the base, worked out once per frame (FLAMES directions), not per pixel.
        var flames = new float[FLAMES];
        for (int k = 0; k < FLAMES; k++)
        {
            float ang = k / (float)FLAMES * Mathf.PI * 2;
            flames[k] = Fbm3(Mathf.Cos(ang) * 2.6f + flick, Mathf.Sin(ang) * 2.6f, flick * 0.6f + seed, 4);
        }
        var (rad, dir) = CoronaGrid(size, c, R);
        int fl20 = Mathf.FloorToInt(flick * 20), fl30 = Mathf.FloorToInt(flick * 30);
        for (int p = 0; p < size * size; p++)
        {
            float r = rad[p];
            if (r <= 1)
            {
                // Under the dome: solid and white-hot, so no board shows through between its facets.
                px[p] = new Color32((byte)bright.x, (byte)bright.y, (byte)bright.z, 255);
                continue;
            }
            if (r > 1.75f)
            {
                px[p] = default;
                continue;
            }
            int f = dir[p];
            // Ragged wisps: the surface texture, sampled along the flame, frays its edge.
            float wisp = tex[((Mathf.FloorToInt(r * 37) + fl20) % TH) * TW + ((f * 2 + fl30) % TW)];
            float flame = flames[f] * (0.7f + 0.6f * wisp);
            float reach = 0.16f + flame * (danger ? 0.62f : 0.46f);
            float o = (r - 1) / reach;
            if (o >= 1)
            {
                px[p] = default;
                continue;
            }
            // White-hot at the base, then orange flames reddening and thinning towards their tips.
            float hot = Mathf.Max(0, 1 - o * 3);
            float glow = Mathf.Pow(1 - o, 1.6f) * (0.65f + flame * 0.5f);
            px[p] = new Color32(
                (byte)Mathf.Clamp(255 * hot + mid.x * (1 - hot), 0, 255),
                (byte)Mathf.Clamp(244 * hot + (mid.y * (1 - o) + deep.y * o) * (1 - hot), 0, 255),
                (byte)Mathf.Clamp(200 * hot + (mid.z * (1 - o) + deep.z * o) * (1 - hot), 0, 255),
                (byte)Mathf.Clamp(glow * 255, 0, 255));
        }
    }

    // ---- The dome: the sun and its planets as solids, seen from where the eye really is ----

    /// <summary>The dome's radius and the orbit's, as shares of the gauge's size; how far the dome canvas reaches past it.</summary>
    public const float DOME_R = 0.27f, ORBIT_R = 0.56f, DOME_PAD = 0.6f;
    const float SHIELD_R = 0.47f, HEAT_R = 0.40f;

    static readonly string[] PLANETS = { "dead", "abundant", "industrial" };
    const int PW = 256, PH = 128;
    static readonly Dictionary<string, byte[]> planetMaps = new Dictionary<string, byte[]>();
    static float Clamp01(float x) => Mathf.Clamp01(x);

    static byte[] PlanetMap(string pl)
    {
        if (planetMaps.TryGetValue(pl, out var have)) return have;
        var o = new byte[PW * PH * 3];
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
                int at = (j * PW + i) * 3;
                o[at] = (byte)Mathf.Clamp(col.x, 0, 255);
                o[at + 1] = (byte)Mathf.Clamp(col.y, 0, 255);
                o[at + 2] = (byte)Mathf.Clamp(col.z, 0, 255);
            }
        }
        planetMaps[pl] = o;
        return o;
    }

    /// <summary>A planet's surface colour at a longitude and height (`v`, 0–1), turned by `spin` (bilinear).</summary>
    static Vector3 PlanetAt(byte[] map, float lon, float v, float spin)
    {
        float u = (lon + spin) / (Mathf.PI * 2);
        float fx = (u - Mathf.Floor(u)) * PW, fy = Mathf.Min(PH - 1.001f, v * (PH - 1));
        int x0 = Mathf.FloorToInt(fx) % PW, x1 = (x0 + 1) % PW, y0 = Mathf.FloorToInt(fy), y1 = y0 + 1;
        float tx = fx - Mathf.Floor(fx), ty = fy - y0;
        int a = (y0 * PW + x0) * 3, b = (y0 * PW + x1) * 3, c = (y1 * PW + x0) * 3, d = (y1 * PW + x1) * 3;
        float Q(int q) => (map[a + q] * (1 - tx) + map[b + q] * tx) * (1 - ty) + (map[c + q] * (1 - tx) + map[d + q] * tx) * ty;
        return new Vector3(Q(0), Q(1), Q(2));
    }

    /// <summary>Each planet's trail along the orbit, and its notches: deeper than the planet, to read on the white board.</summary>
    static Vector3 TrailRgb(string pl) => pl switch
    {
        "dead" => new Vector3(112, 118, 132),
        "paradise" => new Vector3(52, 176, 170),
        "abundant" => new Vector3(40, 158, 112),
        _ => new Vector3(214, 120, 36),
    };

    /// <summary>The three notches on the orbit's near side (degrees): where the facing planet spends each of its turns.</summary>
    static readonly float[] NOTCHES = { 50, 90, 130 };

    /// <summary>Where an orbit stands on the drawn ring of nine notches (art.ts orbitNotch).</summary>
    public static float OrbitNotch(int orbit)
    {
        float per = 3f / BlueLoop.Engine.Balance.OrbitTurns;
        return orbit * per + (per - 1) / 2;
    }

    /// <summary>A notch-to-notch swing: within each step, ease in and out.</summary>
    public static float NotchEase(float o)
    {
        float i = Mathf.Floor(o), f = o - i;
        return i + f * f * (3 - 2 * f);
    }

    static Vector3 OnBoard(Vector3 cam, Vector3 p)
    {
        float k = cam.z / (cam.z - p.z);
        return new Vector3(cam.x + (p.x - cam.x) * k, cam.y + (p.y - cam.y) * k, 0);
    }

    class Geometry { public int[] idx; public float[] cover, normal, mu, lon, v; }
    static readonly Dictionary<string, Geometry> geometries = new Dictionary<string, Geometry>();

    static Geometry TraceGeometry(int W, float s, float pad, Vector3 cam, Vector3 ctr, float r)
    {
        string key = $"{W}|{s:F5}|{pad:F3}|{cam.x:F3},{cam.y:F3},{cam.z:F3}|{ctr.x:F3},{ctr.y:F3},{ctr.z:F3}|{r:F4}";
        if (geometries.TryGetValue(key, out var hit)) return hit;
        // The ball's outline on the board, from points round its surface.
        float x0 = float.PositiveInfinity, y0 = float.PositiveInfinity, x1 = float.NegativeInfinity, y1 = float.NegativeInfinity;
        for (int la = 0; la <= 90; la += 15)
            for (int lo = 0; lo < 360; lo += 15)
            {
                float a = la * Mathf.Deg2Rad, o = lo * Mathf.Deg2Rad;
                var q = OnBoard(cam, new Vector3(ctr.x + r * Mathf.Cos(a) * Mathf.Cos(o), ctr.y + r * Mathf.Cos(a) * Mathf.Sin(o), r * Mathf.Sin(a)));
                x0 = Mathf.Min(x0, q.x); y0 = Mathf.Min(y0, q.y); x1 = Mathf.Max(x1, q.x); y1 = Mathf.Max(y1, q.y);
            }
        int pa = Mathf.Max(0, Mathf.FloorToInt((x0 + pad) * s) - 2), pb = Mathf.Min(W - 1, Mathf.CeilToInt((x1 + pad) * s) + 2);
        int qa = Mathf.Max(0, Mathf.FloorToInt((y0 + pad) * s) - 2), qb = Mathf.Min(W - 1, Mathf.CeilToInt((y1 + pad) * s) + 2);
        int most = Mathf.Max(0, (pb - pa + 1) * (qb - qa + 1));
        var idx = new List<int>(most);
        var cover = new List<float>(most);
        var normal = new List<float>(most * 3);
        var mus = new List<float>(most);
        var lons = new List<float>(most);
        var vs = new List<float>(most);
        float ox = cam.x - ctr.x, oy = cam.y - ctr.y, oz = cam.z - ctr.z;
        float oo = ox * ox + oy * oy + oz * oz;
        for (int y = qa; y <= qb; y++)
            for (int x = pa; x <= pb; x++)
            {
                // The line of sight from the eye to this point of the board.
                float dx = (x + 0.5f) / s - pad - cam.x, dy = (y + 0.5f) / s - pad - cam.y, dz = -cam.z;
                float a = dx * dx + dy * dy + dz * dz, b = ox * dx + oy * dy + oz * dz;
                // How close the line passes to the ball's centre, and how big a pixel is out there (for smooth edges).
                float near = Mathf.Sqrt(Mathf.Max(0, oo - b * b / a));
                float reach = Mathf.Sqrt(oo / a) / s;
                float cov = Mathf.Clamp01((r - near) / reach + 0.5f);
                if (cov <= 0) continue;
                float disc = b * b - a * (oo - r * r);
                float t = disc > 0 ? (-b - Mathf.Sqrt(disc)) / a : -b / a;
                float Px = cam.x + dx * t, Py = cam.y + dy * t, Pz = cam.z + dz * t;
                // Where the ball meets the board on the near side, smooth its edge too.
                float qx = (x + 0.5f) / s - pad - ctr.x, qy = (y + 0.5f) / s - pad - ctr.y;
                float edge = 1;
                if (Pz < r * 0.25f && qx * ox + qy * oy > 0) edge = Mathf.Clamp01((r - Mathf.Sqrt(qx * qx + qy * qy)) * s + 0.5f);
                float all = Mathf.Min(cov, edge);
                if (all <= 0) continue;
                if (Pz < 0) Pz = 0;
                float nx = Px - ctr.x, ny = Py - ctr.y, nz = Pz - ctr.z;
                float nl = Mathf.Sqrt(nx * nx + ny * ny + nz * nz);
                if (nl == 0) nl = 1;
                nx /= nl; ny /= nl; nz /= nl;
                if (nz < 0) nz = 0;
                float vx = cam.x - Px, vy = cam.y - Py, vz = cam.z - Pz;
                float vl = Mathf.Sqrt(vx * vx + vy * vy + vz * vz);
                if (vl == 0) vl = 1;
                vx /= vl; vy /= vl; vz /= vl;
                idx.Add(y * W + x);
                cover.Add(all);
                normal.Add(nx); normal.Add(ny); normal.Add(nz);
                mus.Add(Mathf.Max(0, nx * vx + ny * vy + nz * vz));
                lons.Add(Mathf.Atan2(ny, nx));
                vs.Add(Mathf.Asin(Mathf.Min(1, nz)) / Mathf.PI + 0.5f);
            }
        var g = new Geometry { idx = idx.ToArray(), cover = cover.ToArray(), normal = normal.ToArray(), mu = mus.ToArray(), lon = lons.ToArray(), v = vs.ToArray() };
        if (geometries.Count > 24) geometries.Clear();
        geometries[key] = g;
        return g;
    }

    delegate Vector3 Shade(Vector3 n, float mu, float lon, float v);

    class Ball { public Vector3 ctr; public float r; public Shade shade; }

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
    /// Draws a sun's dome (sun3d.ts drawDome) into `px` (size × size, rows top down), its canvas spanning the gauge and
    /// DOME_PAD of it past every side: the rings flat on the board (art.ts's tracks), the planets' bases, the orbit's trail
    /// and notches, the shields' lattice behind, the sun and its planets as solids, then the lattice in front.
    /// `cam` is the eye in the gauge's own board pixels (x right, y down from its top-left, z up off the board).
    /// </summary>
    public static void Dome(Color32[] px, int size, float vs, Vector3 cam, DomeState st, float timeMs)
    {
        float span = vs * (1 + 2 * DOME_PAD);
        float s = size / span, pad = DOME_PAD * vs;
        var cv = new Canvas(px, size, s, pad);
        cv.Clear();
        var c = new Vector3(vs / 2, vs / 2, 0);
        float R = vs * DOME_R;

        // The tracks, flat on the board under the dome (art.ts ringTracks: viewBox 100 = the gauge): the orbit, the
        // shields' and the heat's, each a full faint ring and its arc from the left end round the near side.
        float dim = st.Dead ? 0.5f : 1;
        if (st.HasOrbit) cv.StrokeArc(c.x, c.y, ORBIT_R * vs, 0, 360, vs * 0.009f, new Color(150 / 255f, 160 / 255f, 185 / 255f, 0.5f * dim), false);
        cv.StrokeArc(c.x, c.y, SHIELD_R * vs, 0, 360, vs * 0.032f, new Color(150 / 255f, 164 / 255f, 190 / 255f, 0.22f * dim), false);
        if (st.Shields > 0 && st.ShieldArc > 0)
        {
            // (Its glow: drop-shadow(0 0 3px rgba(110, 150, 220, 0.7)).)
            cv.StrokeArc(c.x, c.y, SHIELD_R * vs, 180, 180 - 360 * st.ShieldArc, vs * 0.032f + 6, new Color(110 / 255f, 150 / 255f, 220 / 255f, 0.25f * dim), true);
            cv.StrokeArc(c.x, c.y, SHIELD_R * vs, 180, 180 - 360 * st.ShieldArc, vs * 0.032f, new Color(0x6d / 255f, 0x8c / 255f, 0xc2 / 255f, dim), true);
        }
        cv.StrokeArc(c.x, c.y, HEAT_R * vs, 0, 360, vs * 0.022f, new Color(1, 1, 1, 0.75f * dim), false);
        if (st.HeatArc > 0) cv.StrokeArc(c.x, c.y, HEAT_R * vs, 180, 180 - 360 * st.HeatArc, vs * 0.022f, new Color(st.Rim.r, st.Rim.g, st.Rim.b, dim), true);

        var pal = SunPalette(st.T, st.Cold, st.Dead);
        Vector3 deep = pal[0], mid = pal[1], bright = pal[2];
        var tex = Surface();
        float spin = timeMs * 0.00004f + st.Seed;
        var balls = new List<Ball>
        {
            new Ball
            {
                ctr = c, r = R,
                shade = (n, mu, lon, v) =>
                {
                    // The granulation, turning with the sun.
                    float u = (lon + spin) / (Mathf.PI * 2);
                    float raw = tex[Mathf.Min(TH - 1, Mathf.FloorToInt(v * TH)) * TW + (Mathf.FloorToInt((u - Mathf.Floor(u)) * TW) % TW)];
                    float g = Mathf.Clamp01((raw - 0.3f) * 1.6f);
                    float k = Mathf.Min(1, g * (0.6f + 0.4f * Mathf.Sqrt(mu)));
                    float a = k < 0.5f ? k / 0.5f : (k - 0.5f) / 0.5f;
                    Vector3 lo = k < 0.5f ? deep : mid, hi = k < 0.5f ? mid : bright;
                    float w = st.Dead ? 0 : Mathf.Min(1, Mathf.Pow(1 - mu, 4) * 1.3f);
                    var bse = lo + (hi - lo) * a;
                    return bse + (LIMB - bse) * w;
                },
            },
        };

        // The planets: half-spheres in the board on the orbit (on the ring's nine notches, each planet's middle one).
        if (!st.Dead && st.HasOrbit)
        {
            float o = st.Orbit;
            float wrap = ((o % 9) + 9) % 9;
            int fi = Mathf.Min(2, Mathf.FloorToInt(wrap / 3));
            string Look(string pl) => pl == "dead" && st.Paradise ? "paradise" : pl;
            string facing = Look(PLANETS[fi]);
            float stage = wrap - fi * 3;
            Vector2 RingAt(float deg) => new Vector2(c.x + Mathf.Cos(deg * Mathf.Deg2Rad) * ORBIT_R * vs, c.y + Mathf.Sin(deg * Mathf.Deg2Rad) * ORBIT_R * vs);
            Color Colour(string pl, float a) { var t = TrailRgb(pl) / 255f; return new Color(t.x, t.y, t.z, a); }
            var glow = new Vector3(c.x, c.y, R * 0.5f);
            // (The planets' bases first, under the trail and the notches.)
            for (int i = 0; i < 3; i++)
            {
                string pl = Look(PLANETS[i]);
                float pr = vs * 0.07f;
                float ang = (90 - (i * 3 + 1 - o) * 40) * Mathf.Deg2Rad;
                var ctr = new Vector3(c.x + Mathf.Cos(ang) * ORBIT_R * vs, c.y + Mathf.Sin(ang) * ORBIT_R * vs, 0);
                // A clear border round its base on the board: a band of its own colour hugging the outline, fading out.
                var t0 = TrailRgb(pl) / 255f;
                cv.RadialRing(ctr.x, ctr.y, pr, pr * 1.35f, new Color(t0.x, t0.y, t0.z, 1), new[] { (0f, 0.9f), (0.45f, 0.7f), (0.75f, 0.22f), (1f, 0f) });
                var map = PlanetMap(pl);
                float turn = timeMs * 0.00012f + st.Seed + i * 2.1f;
                var light = (glow - (ctr + new Vector3(0, 0, pr * 0.5f))).normalized;
                var half = (light + new Vector3(0, 0, 1)).normalized;
                bool wet = pl == "abundant" || pl == "paradise";
                balls.Add(new Ball
                {
                    ctr = ctr, r = pr,
                    shade = (n, mu, lon, v) =>
                    {
                        var tx = PlanetAt(map, lon, v, turn);
                        // Lit from the sun: a soft terminator, darker towards the outline, and a glint of sunlight.
                        float sun = Mathf.Max(0, Vector3.Dot(n, light));
                        float lit = 0.5f + 0.62f * Mathf.Pow(sun, 0.8f) - 0.16f * (1 - mu);
                        float spec = Mathf.Pow(Mathf.Max(0, Vector3.Dot(n, half)), wet ? 40 : 18) * (wet ? 90 : 36);
                        var col = new Vector3(Mathf.Min(255, tx.x * lit + spec), Mathf.Min(255, tx.y * lit + spec), Mathf.Min(255, tx.z * lit + spec));
                        // The living world's air glows at its rim.
                        if (wet) col += (AIR - col) * (Mathf.Pow(1 - mu, 3) * 0.6f);
                        return col;
                    },
                });
            }
            // (Its days marked only while a planet faces the sun for more than one.)
            if (BlueLoop.Engine.Balance.OrbitTurns > 1)
            {
                float to = NOTCHES[0] + 40 * stage, alpha = stage > 2 ? 3 - stage : 1;
                if (to > NOTCHES[0] + 0.01f && alpha > 0) cv.StrokeArc(c.x, c.y, ORBIT_R * vs, NOTCHES[0], to, Mathf.Max(2.5f, vs * 0.028f), Colour(facing, alpha), true);
                for (int k = 0; k < 3; k++)
                {
                    var p = RingAt(NOTCHES[k]);
                    bool reached = stage >= k - 0.02f;
                    bool now = Mathf.Round(stage) == k || (stage > 2 && k == 2);
                    float rr = vs * (now ? 0.026f : 0.018f);
                    cv.Disc(p.x, p.y, rr, reached ? Colour(facing, 1) : Color.white, reached ? Color.white : new Color(150 / 255f, 160 / 255f, 185 / 255f, 0.85f), Mathf.Max(1, vs * 0.008f));
                }
            }
        }

        // Shields: a dome of hexagons over the sun. Its far side goes under the sun, its near side over it.
        var lattice = st.Shields > 0 && !st.Dead ? LatticeCells(c, R * LATTICE_R, cam) : null;
        float strength = Mathf.Min(1, st.Shields / (float)BlueLoop.Engine.Balance.MaxKeptShields);
        float shimmer = 0.85f + 0.15f * Mathf.Sin(timeMs * 0.0021f);
        void DrawCells(bool front)
        {
            if (lattice == null) return;
            foreach (var cell in lattice)
            {
                if (cell.front != front) continue;
                float a = (front ? 0.22f + 0.6f * cell.face : 0.12f) * (0.45f + 0.55f * strength) * shimmer;
                cv.Polygon(cell.pts, new Color(150 / 255f, 200 / 255f, 1, a * 0.16f), new Color(118 / 255f, 178 / 255f, 240 / 255f, a), Mathf.Max(0.6f, vs * 0.0055f));
            }
        }
        if (lattice != null) cv.StrokeArc(c.x, c.y, R * LATTICE_R, 0, 360, Mathf.Max(1, vs * 0.008f), new Color(118 / 255f, 178 / 255f, 240 / 255f, 0.25f + 0.35f * strength), false);
        DrawCells(false);

        // The balls, farthest first, so nearer balls paint over farther ones, on a layer of their own over the flat things.
        balls.Sort((a, b) => (cam - b.ctr).magnitude.CompareTo((cam - a.ctr).magnitude));
        var layer = BallLayer(size);
        System.Array.Clear(layer, 0, layer.Length);
        foreach (var ball in balls)
        {
            var g = TraceGeometry(size, s, pad, cam, ball.ctr, ball.r);
            for (int k = 0; k < g.idx.Length; k++)
            {
                var col = ball.shade(new Vector3(g.normal[k * 3], g.normal[k * 3 + 1], g.normal[k * 3 + 2]), g.mu[k], g.lon[k], g.v[k]);
                int i = g.idx[k];
                float cov = g.cover[k];
                ref var d = ref layer[i];
                if (d.w == 0 || cov >= 1) d = new Vector4(col.x, col.y, col.z, cov);
                else d = new Vector4(d.x + (col.x - d.x) * cov, d.y + (col.y - d.y) * cov, d.z + (col.z - d.z) * cov, Mathf.Min(1, d.w + (1 - d.w) * cov));
            }
        }
        for (int i = 0; i < layer.Length; i++)
            if (layer[i].w > 0) cv.Over(i, layer[i].x / 255f, layer[i].y / 255f, layer[i].z / 255f, layer[i].w);
        DrawCells(true);
        cv.Finish();
    }

    static Vector4[] ballLayer;
    static Vector4[] BallLayer(int size)
    {
        if (ballLayer == null || ballLayer.Length != size * size) ballLayer = new Vector4[size * size];
        return ballLayer;
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
    class LatticeCell { public Vector2[] pts; public bool front; public float face; }
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

    /// <summary>
    /// What a canvas's 2D context does here, on a buffer of straight-alpha colours: strokes of arcs, discs, radial bands and
    /// polygons in the gauge's own pixels (set out by `s` and `pad`, as setTransform(s, 0, 0, s, pad·s, pad·s)), each
    /// smoothed at its edges and laid over what is there (source-over).
    /// </summary>
    class Canvas
    {
        readonly Color32[] outPx;
        readonly Vector4[] px;
        readonly int size;
        readonly float s, pad;
        static Vector4[] work;

        public Canvas(Color32[] o, int size, float s, float pad)
        {
            outPx = o;
            this.size = size;
            this.s = s;
            this.pad = pad;
            if (work == null || work.Length != size * size) work = new Vector4[size * size];
            px = work;
        }

        public void Clear() => System.Array.Clear(px, 0, px.Length);

        public void Over(int i, float r, float g, float b, float a)
        {
            if (a <= 0) return;
            ref var d = ref px[i];
            float oa = a + d.w * (1 - a);
            if (oa <= 0) return;
            d = new Vector4((r * a + d.x * d.w * (1 - a)) / oa, (g * a + d.y * d.w * (1 - a)) / oa, (b * a + d.z * d.w * (1 - a)) / oa, oa);
        }

        void Over(int i, Color c, float cover) => Over(i, c.r, c.g, c.b, c.a * cover);

        /// <summary>A circle's arc from `a0` to `a1` (degrees, either way round), `width` wide; round caps if asked.</summary>
        public void StrokeArc(float cx, float cy, float r, float a0, float a1, float width, Color c, bool round)
        {
            float lo = Mathf.Min(a0, a1), hi = Mathf.Max(a0, a1);
            bool full = hi - lo >= 359.99f;
            float half = width / 2, reach = r + half + 1 / s;
            ForBox(cx - reach, cy - reach, cx + reach, cy + reach, (x, y, i) =>
            {
                float dx = x - cx, dy = y - cy, d = Mathf.Sqrt(dx * dx + dy * dy);
                float dist;
                if (full) dist = Mathf.Abs(d - r);
                else
                {
                    float ang = Mathf.Atan2(dy, dx) * Mathf.Rad2Deg;
                    // (The angle brought into the arc's own range.)
                    float k = ang;
                    while (k < lo) k += 360;
                    while (k > lo + 360) k -= 360;
                    if (k <= hi) dist = Mathf.Abs(d - r);
                    else if (!round) return;
                    else
                    {
                        var e0 = new Vector2(cx + Mathf.Cos(lo * Mathf.Deg2Rad) * r, cy + Mathf.Sin(lo * Mathf.Deg2Rad) * r);
                        var e1 = new Vector2(cx + Mathf.Cos(hi * Mathf.Deg2Rad) * r, cy + Mathf.Sin(hi * Mathf.Deg2Rad) * r);
                        dist = Mathf.Min(Vector2.Distance(new Vector2(x, y), e0), Vector2.Distance(new Vector2(x, y), e1));
                    }
                }
                float cov = Mathf.Clamp01((half - dist) * s + 0.5f);
                if (cov > 0) Over(i, c, cov);
            });
        }

        /// <summary>A filled disc with a stroked edge (a notch).</summary>
        public void Disc(float cx, float cy, float r, Color fill, Color stroke, float width)
        {
            float reach = r + width + 1 / s;
            ForBox(cx - reach, cy - reach, cx + reach, cy + reach, (x, y, i) =>
            {
                float d = Mathf.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                float f = Mathf.Clamp01((r - d) * s + 0.5f);
                if (f > 0) Over(i, fill, f);
                float e = Mathf.Clamp01((width / 2 - Mathf.Abs(d - r)) * s + 0.5f);
                if (e > 0) Over(i, stroke, e);
            });
        }

        /// <summary>A disc filled with a radial gradient from `r0` to `r1` (stops: where, alpha), as createRadialGradient.</summary>
        public void RadialRing(float cx, float cy, float r0, float r1, Color c, (float at, float a)[] stops)
        {
            ForBox(cx - r1, cy - r1, cx + r1, cy + r1, (x, y, i) =>
            {
                float d = Mathf.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                if (d > r1 + 1 / s) return;
                float t = Mathf.Clamp01((d - r0) / (r1 - r0));
                float a = stops[stops.Length - 1].a;
                for (int k = 1; k < stops.Length; k++)
                    if (t <= stops[k].at)
                    {
                        float u = (t - stops[k - 1].at) / Mathf.Max(1e-5f, stops[k].at - stops[k - 1].at);
                        a = Mathf.Lerp(stops[k - 1].a, stops[k].a, u);
                        break;
                    }
                float edge = Mathf.Clamp01((r1 - d) * s + 0.5f);
                Over(i, new Color(c.r, c.g, c.b, a), edge);
            });
        }

        /// <summary>A closed polygon: filled, then its outline stroked `width` wide.</summary>
        public void Polygon(Vector2[] pts, Color fill, Color stroke, float width)
        {
            float x0 = float.PositiveInfinity, y0 = float.PositiveInfinity, x1 = float.NegativeInfinity, y1 = float.NegativeInfinity;
            foreach (var p in pts) { x0 = Mathf.Min(x0, p.x); y0 = Mathf.Min(y0, p.y); x1 = Mathf.Max(x1, p.x); y1 = Mathf.Max(y1, p.y); }
            float m = width + 1 / s;
            ForBox(x0 - m, y0 - m, x1 + m, y1 + m, (x, y, i) =>
            {
                var q = new Vector2(x, y);
                bool inside = false;
                float dist = float.PositiveInfinity;
                for (int k = 0, j = pts.Length - 1; k < pts.Length; j = k++)
                {
                    var a = pts[j];
                    var b = pts[k];
                    if ((b.y > y) != (a.y > y) && x < (a.x - b.x) * (y - b.y) / (a.y - b.y) + b.x) inside = !inside;
                    var ab = a - b;
                    float t = Mathf.Clamp01(Vector2.Dot(q - b, ab) / Mathf.Max(1e-6f, ab.sqrMagnitude));
                    dist = Mathf.Min(dist, Vector2.Distance(q, b + ab * t));
                }
                float f = inside ? Mathf.Clamp01(dist * s + 0.5f) : Mathf.Clamp01(0.5f - dist * s);
                if (f > 0) Over(i, fill, f);
                float e = Mathf.Clamp01((width / 2 - dist) * s + 0.5f);
                if (e > 0) Over(i, stroke, e);
            });
        }

        /// <summary>Each pixel whose middle lies in a box (gauge px), with its middle in gauge px and its index.</summary>
        void ForBox(float x0, float y0, float x1, float y1, System.Action<float, float, int> f)
        {
            int pa = Mathf.Max(0, Mathf.FloorToInt((x0 + pad) * s)), pb = Mathf.Min(size - 1, Mathf.CeilToInt((x1 + pad) * s));
            int qa = Mathf.Max(0, Mathf.FloorToInt((y0 + pad) * s)), qb = Mathf.Min(size - 1, Mathf.CeilToInt((y1 + pad) * s));
            for (int y = qa; y <= qb; y++)
                for (int x = pa; x <= pb; x++)
                    f((x + 0.5f) / s - pad, (y + 0.5f) / s - pad, y * size + x);
        }

        public void Finish()
        {
            for (int i = 0; i < px.Length; i++)
            {
                var d = px[i];
                outPx[i] = new Color32((byte)Mathf.Clamp(d.x * 255, 0, 255), (byte)Mathf.Clamp(d.y * 255, 0, 255), (byte)Mathf.Clamp(d.z * 255, 0, 255), (byte)Mathf.Clamp(d.w * 255, 0, 255));
            }
        }
    }
}
