using System;
using System.Collections.Generic;
using System.Linq;
using static BlueLoop.Models.Vec;

namespace BlueLoop.Models
{
    /// <summary>A sun a ship carries (the Aureline's captive sun): where, in its own axes, and how big; it radiates heat.</summary>
    public struct CarriedSun
    {
        public V3 At;
        public double R;
    }

    public class ShipModel
    {
        public float[] Mesh;
        /// <summary>Where its engines are, in its own axes (for their glow, and a trail while it flies).</summary>
        public List<V3> Engines;
        /// <summary>The colour its engines burn.</summary>
        public Rgb Glow;
        /// <summary>Suns it carries: where, in its own axes, and how big; they radiate heat.</summary>
        public List<CarriedSun> Suns;
        /// <summary>Where it smokes (the Captain's ship, while worn), in its own axes; empty for the rest.</summary>
        public List<V3> Smoke = new List<V3>();
    }

    /// <summary>The map's stations (see Ship3d.PropModel3d).</summary>
    public enum PropKind
    {
        Station,
        Lab,
    }

    /// <summary>
    /// The ships armies sail the campaign map in (ship3d.ts), as genuine 3D objects in the map's scene: one model per race,
    /// after the race's own design, built here once as a mesh.
    ///
    /// They are modelled, not extruded: hulls are lofted through cross-sections (each a superellipse, so a hull can be
    /// round, faceted like crystal, or squared off like armour), and dressed with real parts round them: wings and
    /// fins with an airfoil's section, engine bells with their burn, armour plates, bands, turrets, smokestacks,
    /// spires and shards set at any angle, tentacles and legs, and rows of lit windows that give them their scale.
    /// Their look (plated metal, crystal, living chitin, glowing furnaces) is worked out in the shader from each
    /// part's material and colour, so there are no images to load.
    ///
    /// Box units: x along the ship (0 the stern, 40 the bow), y across (12 the keel line), z up from the keel; the ship
    /// is 40 long. They map onto its own axes: +x forward, +y up, +z across (to starboard), 1 long.
    ///
    /// Each vertex: position (3), normal (3), colour (3), material (1). Materials: 0 plated metal, 1 glass or crystal,
    /// 2 glowing (engines, suns, furnaces, windows), 3 living (chitin, reef, hide), 4 dark gloss (void-metal, rust),
    /// 5 metal in its holder's colour, 6 molten (an ember hull).
    /// </summary>
    public static class Ship3d
    {
        public const int ShipStride = 10;

        static V3 P(double x, double y, double z) => Mesh.P(x, y, z);
        static V3 V(double x, double y, double z) => new V3(x, y, z);
        static Rgb C(double r, double g, double b) => new Rgb(r, g, b);
        static Sec S(double x, double w, double t, double? b = null, double? y = null, double? z = null, double? p = null) => new Sec(x, w, t, b, y, z, p);

        // ---- Colours ----
        static readonly Rgb WhiteMetal = C(0.92, 0.93, 0.95);
        static readonly Rgb Gold = C(0.93, 0.75, 0.38);
        static readonly Rgb Sun = C(1, 0.84, 0.48);
        static readonly Rgb Canopy = C(0.16, 0.22, 0.34);
        static readonly Rgb Window = C(1, 0.9, 0.62);
        static readonly Rgb CrystalDark = C(0.33, 0.27, 0.6);
        static readonly Rgb Crystal = C(0.8, 0.73, 0.98);
        static readonly Rgb CrystalGlow = C(0.86, 0.74, 1);
        static readonly Rgb Reef = C(0.26, 0.5, 0.52);
        static readonly Rgb ReefLight = C(0.46, 0.76, 0.72);
        static readonly Rgb Bell = C(0.6, 0.88, 0.86);
        static readonly Rgb CoreCyan = C(0.55, 1, 0.92);
        static readonly Rgb Chitin = C(0.66, 0.54, 0.36);
        static readonly Rgb ChitinDark = C(0.3, 0.23, 0.16);
        static readonly Rgb Cap = C(0.62, 0.95, 0.4);
        static readonly Rgb Void = C(0.14, 0.12, 0.24);
        static readonly Rgb VoidDome = C(0.28, 0.22, 0.52);
        static readonly Rgb Violet = C(0.78, 0.58, 1);
        static readonly Rgb Iron = C(0.48, 0.49, 0.53);
        static readonly Rgb IronDark = C(0.33, 0.33, 0.37);
        static readonly Rgb Bronze = C(0.8, 0.55, 0.26);
        static readonly Rgb Furnace = C(1, 0.55, 0.18);
        static readonly Rgb Pearl = C(0.94, 0.95, 1);
        static readonly Rgb PearlSail = C(0.92, 0.94, 1);
        static readonly Rgb Starlight = C(0.92, 0.96, 1);
        static readonly Rgb Silver = C(0.78, 0.82, 0.9);
        static readonly Rgb Moon = C(0.72, 0.77, 0.94);
        static readonly Rgb Ember = C(0.92, 0.36, 0.12);
        static readonly Rgb Crust = C(0.22, 0.12, 0.1);
        static readonly Rgb Heart = C(1, 0.95, 0.72);
        static readonly Rgb Tongue = C(1, 0.42, 0.06);
        static readonly Rgb Rust = C(0.5, 0.42, 0.4);
        static readonly Rgb RustDark = C(0.2, 0.17, 0.17);
        static readonly Rgb EngineBurn = C(1, 0.82, 0.58);

        /// <summary>Suns the ship being built carries (see ShipModel.Suns).</summary>
        static List<CarriedSun> carried = new List<CarriedSun>();

        /// <summary>An engine: a housing collared in its holder's colour, flaring to its bell, the burn inside; facing astern.</summary>
        static void Engine(Mesh m, double x, double y, double z, double r, double l, List<V3> e, Rgb? burn = null, Rgb? housing = null, double mat = 0)
        {
            var b = burn ?? EngineBurn;
            var h = housing ?? Iron;
            m.Cyl(V(x + l * 0.5, y, z), V(x, y, z), r * 0.75, r * 0.9, h, mat);
            m.Cyl(V(x + l * 0.32, y, z), V(x + l * 0.12, y, z), r * 0.95, r * 0.95, h, 5);
            m.Cyl(V(x, y, z), V(x - l * 0.5, y, z), r * 0.8, r, Shade(h, 0.75), mat);
            m.Cyl(V(x - l * 0.45, y, z), V(x - l * 0.52, y, z), r * 0.82, r * 0.82, b, 2);
            e.Add(P(x - l * 0.6, y, z));
        }

        static readonly Func<Mesh, List<V3>, Rgb>[] Builders = { Aureline, XelNaru, Vorthane, Ixquor, Nyxari, Korrath, Seren, Pyrr };

        /// <summary>
        /// Aureline: a sun-barque. A long sleek hull of white metal belted in gold, a bridge forward under dark glass,
        /// its sun carried amidships in a golden cradle, outrigger engines on swept pylons and twin engines astern.
        /// </summary>
        static Rgb Aureline(Mesh m, List<V3> e)
        {
            var hull = new[]
            {
                S(3.5, 2.5, 2.0, b: 1.8, z: 3.4, p: 2.6),
                S(6, 3.3, 2.5, b: 2.3, z: 3.4, p: 2.6),
                S(13, 3.8, 2.9, b: 2.8, z: 3.4, p: 2.6),
                S(22, 3.6, 2.8, b: 2.7, z: 3.4, p: 2.6),
                S(30, 2.8, 2.2, b: 2.0, z: 3.3, p: 2.4),
                S(36, 1.5, 1.3, b: 1.1, z: 3.1, p: 2.2),
                S(40.5, 0, 0, z: 3.0),
            };
            m.Loft(hull, WhiteMetal, 0);
            // Its gold belt, and its spine in its holder's colour.
            m.Loft(hull.Take(hull.Length - 1).Select(s => Belt(s, 0.14, 0.32, 0.3)).Concat(new[] { S(40.6, 0, 0, z: 2.7) }).ToList(), Gold, 0, segs: 18);
            m.Spine(hull, 8, 33, 0.6, 0.55, WhiteMetal, 5);
            foreach (var x in new[] { 9.0, 26 }) m.Band(hull, x, 0.8, 0.14, Gold, 0);
            // The bridge, under dark glass.
            m.Loft(new[] { S(23, 1.4, 0.4, b: 0.2, z: 5.7, p: 2.4), S(25, 1.7, 1.7, b: 0.2, z: 5.7, p: 2.4), S(29, 1.6, 1.6, b: 0.2, z: 5.5, p: 2.4), S(32, 0, 0, z: 5.2) }, WhiteMetal, 0);
            m.Loft(new[] { S(28.4, 1.45, 0.9, b: 0.2, z: 6.2, p: 2.2), S(30.4, 1.1, 0.6, b: 0.2, z: 5.9, p: 2.2), S(31.9, 0, 0, z: 5.4) }, Canopy, 1);
            m.Windows(hull, 9, 31, 11, 0.32, 0.26, Window);
            // The sun, in its cradle (radiating heat: nebula-objects.ts draws its corona).
            m.Ball(16, 12, 11.6, 3.0, Sun, 2, 22, 14);
            carried.Add(new CarriedSun { At = P(16, 12, 11.6), R = 3.0 / 40 });
            m.Ring(16, 12, 11.6, 4.0, 0.34, Math.PI / 2, Gold, 0);
            m.Ring(16, 12, 11.6, 4.7, 0.16, 0.45, Gold, 5);
            m.Mirror(() => m.Tube(new[] { V(16, 9.4, 5.9), V(16, 8.0, 8.4), V(16, 8.0, 11.6) }, 0.6, 0.45, Gold, 0));
            // Fins: one above, a keel below.
            m.Wing(new Chord(10, 4.2, 12, 5.6), new Chord(6.4, 3.4, 12, 9.6), 0.6, WhiteMetal, 0);
            m.Wing(new Chord(30, 8, 12, 1.3), new Chord(23, 11, 12, -0.8), 0.7, Gold, 0);
            // Outriggers on swept pylons, each with its engine.
            m.Mirror(() =>
            {
                m.Wing(new Chord(15, 9, 9.0, 3.6), new Chord(11.5, 6.5, 3.8, 4.6), 0.7, WhiteMetal, 0);
                var pod = new[]
                {
                    S(3.4, 1.0, 1.0, y: 3.6, z: 4.6),
                    S(5, 1.3, 1.3, y: 3.6, z: 4.6),
                    S(12, 1.3, 1.3, y: 3.6, z: 4.6),
                    S(15, 0.8, 0.8, y: 3.6, z: 4.6),
                    S(16.4, 0, 0, y: 3.6, z: 4.6),
                };
                m.Loft(pod, WhiteMetal, 0, segs: 16);
                m.Band(pod, 13, 0.6, 0.12, Gold, 0);
                m.Band(pod, 6.5, 0.5, 0.1, WhiteMetal, 5);
                Engine(m, 3.4, 3.6, 4.6, 1.0, 1.6, e);
            });
            Engine(m, 3.8, 10.7, 3.4, 1.3, 2.0, e);
            Engine(m, 3.8, 13.3, 3.4, 1.3, 2.0, e);
            m.Ball(40.6, 12, 3.0, 0.3, Sun, 2, 8, 5);
            return EngineBurn;
        }

        /// <summary>A hull's section as its belt: a little wider, thin, a little lower, round.</summary>
        static Sec Belt(Sec s, double wider, double thick, double lower)
        {
            var b = s.Clone();
            b.W = s.W + wider;
            b.T = thick;
            b.B = thick;
            b.Z = (s.Z ?? 0) - lower;
            b.P = 2;
            return b;
        }

        /// <summary>
        /// Xel'Naru: a shard of dark crystal cut in facets, a great crystal spire rising from it, lesser shards round it
        /// at every angle and a few drifting free, a violet light running down its ridge.
        /// </summary>
        static Rgb XelNaru(Mesh m, List<V3> e)
        {
            var hull = new[]
            {
                S(1.5, 0, 0, z: 3),
                S(4, 1.8, 1.6, b: 1.2, z: 3),
                S(12, 3.6, 3.6, b: 2.6, z: 3),
                S(21, 4.4, 4.8, b: 3.2, z: 3),
                S(31, 2.8, 2.8, b: 2.0, z: 3),
                S(41, 0, 0, z: 3),
            };
            m.Loft(hull, CrystalDark, 1, segs: 6, flat: true, under: 0.35);
            // A lighter crystal laid along its flanks.
            m.Mirror(() => m.Shard(V(6, 9.6, 2.6), V(1, -0.08, 0.02), 26, 1.4, C(0.5, 0.42, 0.8), 1));
            m.Tube(hull.Skip(1).Take(hull.Length - 2).Select(s => V(s.X, 12, (s.Z ?? 0) + s.T + 0.05)).Concat(new[] { V(40.6, 12, 3.1) }).ToList(), 0.22, 0.12, CrystalGlow, 2, 6);
            void Spire(V3 b, V3 d, double l, double r, Rgb? c = null, bool glow = true)
            {
                m.Shard(b, d, l, r, c ?? Crystal, 1);
                if (glow)
                {
                    var dd = Norm(d);
                    m.Ball(b.X + dd.X * (l + 0.6), b.Y + dd.Y * (l + 0.6), b.Z + dd.Z * (l + 0.6), Math.Max(0.35, r * 0.28), CrystalGlow, 2, 8, 5);
                }
            }
            Spire(V(21, 12, 6.5), V(-0.35, 0, 1), 21, 3.0);
            Spire(V(16, 12, 6.0), V(-0.8, 0, 0.9), 9, 1.6, Crystal, false);
            m.Mirror(() =>
            {
                Spire(V(14, 9.6, 5), V(-0.45, -0.55, 0.9), 11, 1.9);
                Spire(V(28, 10.4, 4.4), V(0.35, -0.5, 0.75), 7, 1.3);
                Spire(V(8, 11, 4), V(-0.9, -0.35, 0.5), 6, 1.1, Crystal, false);
                Spire(V(20, 9, 0.6), V(-0.2, -0.4, -1), 5, 1.2, CrystalDark, false);
            });
            // Shards drifting free beside it.
            Spire(V(33, 3.5, 9), V(0.3, 0.2, 1), 3.2, 0.8, Crystal, false);
            Spire(V(9, 20.5, 10), V(-0.2, 0.3, 1), 2.6, 0.7, Crystal, false);
            Spire(V(25, 2, 2.5), V(0.5, -0.1, 0.6), 2.2, 0.6, Crystal, false);
            Engine(m, 2.6, 12, 3, 1.2, 1.4, e, CrystalGlow, CrystalDark, 1);
            return CrystalGlow;
        }

        /// <summary>
        /// Vorthane: a living reef-raft under a great ribbed glass bell, lit at its crown, coral along its rim, a lantern
        /// hung below and long tentacles trailing astern.
        /// </summary>
        static Rgb Vorthane(Mesh m, List<V3> e)
        {
            var raft = new[]
            {
                S(7, 0, 0, z: 1.8),
                S(8, 3.5, 0.8, b: 1.0, z: 1.8),
                S(13, 7, 1.2, b: 1.6, z: 1.8),
                S(24, 8.6, 1.4, b: 1.8, z: 1.8),
                S(34, 6.5, 1.2, b: 1.5, z: 1.8),
                S(39, 2.5, 0.8, b: 0.9, z: 1.8),
                S(40, 0, 0, z: 1.8),
            };
            m.Loft(raft, Reef, 3, segs: 28);
            // Coral along its rim.
            for (int i = 0; i < 13; i++)
            {
                var x = 9.5 + i * 2.3;
                var s = Mesh.SecAt(raft, x);
                foreach (var side in new[] { -1, 1 })
                {
                    var h = 0.5 + ((i * 7 + (side > 0 ? 3 : 0)) % 5) * 0.18;
                    m.Ball(x, 12 + side * (s.W - 0.3), 2.6, h, i % 3 != 0 ? ReefLight : C(0.9, 0.55, 0.6), 3, 8, 5);
                }
            }
            // The bell, ribbed, crowned with light.
            m.Orb(24, 12, 3.0, 8.2, 6.8, 10.4, Bell, 1, true, 28, 14);
            for (int k = 0; k < 10; k++)
            {
                var th = (k / 10.0) * Math.PI * 2;
                var pts = new List<V3>();
                for (int i = 0; i <= 8; i++)
                {
                    var ph = (i / 8.0) * 1.32;
                    pts.Add(V(24 + Math.Cos(th) * Math.Cos(ph) * 8.35, 12 + Math.Sin(th) * Math.Cos(ph) * 6.95, 3.0 + Math.Sin(ph) * 10.55));
                }
                m.Tube(pts, 0.38, 0.22, ReefLight, 3, 6);
            }
            m.Ring(24, 12, 3.2, 7.6, 0.6, 0, ReefLight, 3);
            m.Ball(24, 12, 13.7, 1.3, CoreCyan, 2);
            m.Ring(24, 12, 13.2, 1.7, 0.3, 0, ReefLight, 3);
            // Its lantern, hung below.
            m.Cyl(V(24, 12, 0.6), V(24, 12, -1.2), 0.3, 0.3, ReefLight, 3, 8);
            m.Ball(24, 12, -2.4, 1.3, CoreCyan, 2);
            // Tentacles trailing astern, and feelers forward.
            for (int k = 0; k < 7; k++)
            {
                var y0 = 12 + (k - 3) * 1.9;
                var pts = new List<V3>();
                for (int i = 0; i <= 8; i++)
                {
                    var t = i / 8.0;
                    pts.Add(V(12 - t * 22, 12 + (y0 - 12) * (1 + t * 0.9) + Math.Sin(t * 5 + k) * 0.9, 0.6 - t * 3.2 + Math.Sin(t * 7 + k * 1.7) * 0.7));
                }
                m.Tube(pts, 0.75, 0.12, k % 2 != 0 ? ReefLight : Reef, 3, 8, false);
            }
            m.Mirror(() => m.Tube(new[] { V(36, 10.5, 0.8), V(40, 9.5, -0.6), V(42.5, 9.8, -1.6) }, 0.4, 0.1, ReefLight, 3, 6, false));
            e.Add(P(8, 12, 1.4));
            return CoreCyan;
        }

        /// <summary>
        /// Ixquor: a segmented chitin seed pod on six jointed legs, mandibles at its bow, a glowing cap swelling from
        /// its back, its eyes and spots alight.
        /// </summary>
        static Rgb Ixquor(Mesh m, List<V3> e)
        {
            var body = new List<Sec> { S(2, 0, 0, z: 6) };
            for (double x = 3; x <= 36; x += 1.5)
            {
                var @base = 6.2 * Math.Pow(Math.Sin((Math.PI * (x - 1.5)) / 37), 0.65);
                var ridge = Round((x - 3) / 1.5) % 3 == 2 ? 0.9 : 1;
                body.Add(S(x, @base * ridge, @base * 0.95 * ridge, b: @base * 0.75 * ridge, z: 6));
            }
            body.Add(S(38, 0, 0, z: 6));
            m.Loft(body, Chitin, 3, segs: 24, under: 0.4);
            foreach (var x in new[] { 8.0, 13, 18, 23 }) m.Shard(V(x, 12, Mesh.SecPoint(Mesh.SecAt(body, x), Math.PI / 2).Z - 0.4), V(-0.6, 0, 1), 3.4, 0.8, ChitinDark, 3);
            // Legs, jointed, three a side.
            m.Mirror(() =>
            {
                foreach (var x in new[] { 12.0, 18, 24 })
                {
                    V3 hip = V(x, 12 - 4.6, 4.4), knee = V(x + (x - 18) * 0.25, 12 - 9.4, 8.6), foot = V(x + (x - 18) * 0.55, 12 - 12.8, -1.4);
                    m.Tube(new[] { hip, knee }, 0.85, 0.6, ChitinDark, 3, 8);
                    m.Ball(knee.X, knee.Y, knee.Z, 0.75, Chitin, 3, 8, 5);
                    m.Tube(new[] { knee, V((knee.X + foot.X) / 2, (knee.Y + foot.Y) / 2 - 0.4, (knee.Z + foot.Z) / 2 + 1), foot }, 0.6, 0.18, ChitinDark, 3, 8);
                }
                m.Tube(new[] { V(34, 10.2, 4.4), V(38.6, 9.4, 3.6), V(41, 10.6, 2.6), V(41.6, 11.5, 2.0) }, 0.6, 0.12, ChitinDark, 3, 8);
                m.Ball(35.4, 9.9, 6.8, 0.75, C(1, 0.62, 0.2), 2, 10, 6);
            });
            // The cap, glowing, ringed in dark chitin.
            m.Orb(28.5, 12, 9.4, 4.0, 3.6, 3.0, Cap, 2, true, 20, 10);
            m.Ring(28.5, 12, 9.5, 3.8, 0.45, 0, ChitinDark, 3);
            m.Windows(body, 8, 30, 7, -0.15, 0.32, Cap);
            m.Ball(2.4, 12, 6, 1.5, Cap, 2);
            e.Add(P(1.4, 12, 6));
            return Cap;
        }

        /// <summary>
        /// Nyxari: a low black blade, faceted, its crescent wings swept out and curling forward to points edged in violet
        /// light; a hooded dark-glass canopy with one violet eye, canted fins, twin engines.
        /// </summary>
        static Rgb Nyxari(Mesh m, List<V3> e)
        {
            var hull = new[]
            {
                S(3, 1.2, 0.9, b: 0.6, z: 2.2),
                S(9, 2.6, 1.8, b: 1.0, z: 2.2),
                S(19, 3.2, 2.4, b: 1.2, z: 2.2),
                S(30, 2.0, 1.4, b: 0.8, z: 2.2),
                S(42, 0, 0, z: 2.0),
            };
            m.Loft(hull, Void, 4, segs: 6, flat: true, under: 0.2);
            m.Mirror(() =>
            {
                m.Wing(new Chord(25, 8.5, 10, 2.3), new Chord(20, 12, 4, 1.7), 1.2, Void, 4);
                m.Wing(new Chord(20, 12, 4, 1.7), new Chord(33, 29.5, 0.4, 1.1), 0.7, Void, 4);
                m.Wing(new Chord(33, 29.5, 0.4, 1.1), new Chord(37.5, 36.5, 1.6, 0.95), 0.4, Void, 4);
                m.Tube(new[] { V(25, 9.9, 2.4), V(22.2, 6.8, 2.0), V(20, 4, 1.75), V(26, 1.6, 1.4), V(33, 0.35, 1.15), V(37.5, 1.6, 0.97) }, 0.18, 0.1, Violet, 2, 6, false);
                m.Wing(new Chord(17, 12.5, 7.2, 2.1), new Chord(14.5, 12.8, 4.4, 1.9), 0.9, Void, 5);
                m.Wing(new Chord(9, 4, 10.6, 3.6), new Chord(6, 3.4, 8.6, 7.2), 0.45, Void, 4);
                Engine(m, 3.4, 10.7, 2.2, 0.95, 1.4, e, Violet, Void, 4);
            });
            m.Orb(23, 12, 4.0, 4.6, 2.4, 2.3, VoidDome, 1, true, 18, 9);
            m.Wing(new Chord(24.5, 15, 12, 4.6), new Chord(19, 14, 12, 7.4), 0.5, Void, 4);
            m.Ball(27.4, 12, 4.7, 0.8, Violet, 2, 12, 8);
            return Violet;
        }

        /// <summary>
        /// Korrath: a squat armoured forge-barge of dark iron, plated and banded in bronze, a bronze ram at its bow, a
        /// stepped bridge, smokestacks breathing fire, a gun turret forward, furnace vents glowing down its flanks and
        /// three great engines astern.
        /// </summary>
        static Rgb Korrath(Mesh m, List<V3> e)
        {
            var hull = new[]
            {
                S(2.8, 4.6, 2.6, b: 2.2, z: 3.2, p: 6),
                S(5, 5.6, 3.2, b: 2.6, z: 3.2, p: 6),
                S(14, 6.0, 3.4, b: 2.8, z: 3.2, p: 6),
                S(26, 5.8, 3.3, b: 2.8, z: 3.2, p: 6),
                S(33, 4.6, 2.8, b: 2.4, z: 3.2, p: 5),
                S(36.5, 2.6, 2.0, b: 1.6, z: 3.0, p: 4),
            };
            m.Loft(hull, Iron, 0, segs: 28);
            m.Loft(new[] { S(34.5, 2.4, 1.9, b: 1.7, z: 2.8, p: 1), S(38, 1.5, 1.0, b: 1.5, z: 2.3, p: 1), S(42.5, 0, 0, z: 1.4) }, Bronze, 0, segs: 4, flat: true);
            m.Mirror(() =>
            {
                foreach (var x in new[] { 6.6, 12.6, 18.6, 24.6 })
                {
                    m.Box(x, x + 5.4, 12 - 6.55, 12 - 5.7, 0.9, 5.7, IronDark, 0, 0.2);
                    m.Box(x + 5.45, x + 5.95, 12 - 6.25, 12 - 5.85, 1.8, 4.8, Furnace, 2);
                }
            });
            foreach (var x in new[] { 6.2, 18.5, 30.5 }) m.Band(hull, x, 0.9, 0.5, Bronze, 0);
            m.Box(15, 33, 11.1, 12.9, 6.45, 6.85, Iron, 5);
            // The bridge, stepped.
            m.Box(6.5, 16.5, 8.2, 15.8, 6.4, 9.2, Iron, 0, 0.6);
            m.Box(8.6, 14.4, 9.4, 14.6, 9.2, 11.8, IronDark, 0, 0.4);
            m.Box(14.0, 14.45, 10.0, 14.0, 10.1, 11.0, Window, 2);
            m.Mirror(() => m.Box(10, 13.5, 9.35, 9.45, 10.0, 10.7, Window, 2));
            m.Cyl(V(11.5, 12, 11.8), V(11.5, 12, 15), 0.18, 0.1, Bronze, 0, 6);
            // Smokestacks, burning.
            foreach (var (x, y, top) in new[] { (20.5, 9.8, 13.4), (20.5, 14.2, 13.4), (24.6, 12.0, 11.6) })
            {
                m.Cyl(V(x, y, 6.4), V(x, y, top), 1.35, 1.05, IronDark, 0);
                m.Cyl(V(x, y, top - 1.0), V(x, y, top + 0.2), 1.25, 1.25, Bronze, 0);
                m.Ball(x, y, top + 0.15, 0.8, Furnace, 2, 10, 6);
            }
            // A gun turret forward.
            m.Cyl(V(29.5, 12, 6.1), V(29.5, 12, 7.5), 2.1, 2.0, IronDark, 0, 18);
            m.Orb(29.5, 12, 7.5, 1.9, 1.9, 1.3, Iron, 0, true, 16, 6);
            foreach (var y in new[] { 11.35, 12.65 }) m.Cyl(V(30.5, y, 8.0), V(35.6, y, 8.3), 0.34, 0.28, IronDark, 0, 8);
            foreach (var y in new[] { 8.2, 12, 15.8 }) Engine(m, 2.8, y, 3.4, 1.75, 2.4, e, C(1, 0.62, 0.3), IronDark);
            return C(1, 0.62, 0.3);
        }

        /// <summary>
        /// Seren: a slender pale star-skiff under a tall crescent sail, an orrery turning at its bow with a star at its
        /// heart and two moons on its rings, outrigger floats, a gold keel.
        /// </summary>
        static Rgb Seren(Mesh m, List<V3> e)
        {
            var hull = new[]
            {
                S(2.6, 0.9, 0.8, b: 0.9, z: 3.2, p: 2.2),
                S(5, 1.7, 1.3, b: 1.5, z: 3.2, p: 2.2),
                S(14, 2.4, 1.7, b: 2.0, z: 3.2, p: 2.2),
                S(26, 2.3, 1.6, b: 1.9, z: 3.2, p: 2.2),
                S(35, 1.3, 1.0, b: 1.1, z: 3.1, p: 2.2),
                S(42, 0, 0, z: 3.0),
            };
            m.Loft(hull, Pearl, 0);
            m.Loft(hull.Take(hull.Length - 1).Select(s => Belt(s, 0.1, 0.22, 0.4)).Concat(new[] { S(42.1, 0, 0, z: 2.6) }).ToList(), Gold, 0, segs: 16);
            m.Windows(hull, 9, 30, 9, 0.35, 0.22, Window);
            m.Wing(new Chord(26, 9, 12, 1.4), new Chord(19, 11.5, 12, -2.8), 0.45, Gold, 0);
            // The mast, its boom and its sail: a crescent, bellied, rimmed in gold.
            m.Cyl(V(15, 12, 4.6), V(15, 12, 21), 0.42, 0.24, Silver, 0, 8);
            m.Ball(15, 12, 21.3, 0.5, Starlight, 2, 8, 5);
            m.Cyl(V(15, 12, 6.0), V(7.6, 12, 6.2), 0.22, 0.18, Silver, 0, 6);
            const int rows = 18;
            (V3, V3) Edge(double s)
            {
                var d = s * 6.95;
                var z = 13 + d;
                double xo = 15 - Math.Sqrt(Math.Max(0, 56.25 - d * d)), xi = 21.5 - Math.Sqrt(Math.Max(0, 72 - d * d));
                var belly = 1.1 * (1 - s * s);
                return (V(xo, 12 + belly * 0.6, z), V(Math.Min(xi, 14.8), 12 + belly * 0.2, z));
            }
            var rim = new List<V3>();
            for (int i = 0; i < rows; i++)
            {
                double s0 = -0.995 + (1.99 * i) / rows, s1 = -0.995 + (1.99 * (i + 1)) / rows;
                var (a0, b0) = Edge(s0);
                var (a1, b1) = Edge(s1);
                m.Tri(Mesh.P(a0), Mesh.P(b0), Mesh.P(b1), PearlSail, 3);
                m.Tri(Mesh.P(a0), Mesh.P(b1), Mesh.P(a1), PearlSail, 3);
                rim.Add(a0);
                if (i == rows - 1) rim.Add(a1);
            }
            m.Tube(rim, 0.2, 0.2, Gold, 0, 6, false);
            // The orrery.
            m.Cyl(V(28, 12, 4.4), V(28, 12, 8.4), 0.32, 0.22, Gold, 0, 8);
            m.Ball(28, 12, 10.2, 1.5, Starlight, 2, 16, 10);
            m.Ring(28, 12, 10.2, 3.0, 0.16, 0.5, Gold, 0);
            m.Ring(28, 12, 10.2, 4.3, 0.13, -0.38, Silver, 5);
            m.Ball(28 + Math.Cos(0.7) * 3 * Math.Cos(0.5), 12 + Math.Sin(0.7) * 3, 10.2 + Math.Cos(0.7) * 3 * Math.Sin(0.5), 0.6, Moon, 0, 10, 6);
            m.Ball(28 + Math.Cos(3.7) * 4.3 * Math.Cos(-0.38), 12 + Math.Sin(3.7) * 4.3, 10.2 + Math.Cos(3.7) * 4.3 * Math.Sin(-0.38), 0.5, Moon, 0, 10, 6);
            // Outrigger floats.
            m.Mirror(() =>
            {
                m.Wing(new Chord(21, 16.5, 10, 3.0), new Chord(18, 14, 5.8, 2.4), 0.35, Silver, 0);
                m.Loft(new[] { S(7, 0, 0, y: 5.4, z: 2.4), S(8.4, 0.65, 0.65, y: 5.4, z: 2.4), S(19, 0.75, 0.75, y: 5.4, z: 2.4), S(23, 0, 0, y: 5.4, z: 2.4) }, Pearl, 5, segs: 12);
                m.Ball(7.2, 5.4, 2.4, 0.3, Starlight, 2, 6, 4);
            });
            Engine(m, 3.0, 12, 3.2, 0.95, 1.3, e, Starlight, Silver);
            return Starlight;
        }

        /// <summary>
        /// Pyrr: a living flare. A molten hull like a flame laid on its side, its tongues streaming astern, flame spikes
        /// down its back and flanks, its white-hot heart burning through a ring of crust.
        /// </summary>
        static Rgb Pyrr(Mesh m, List<V3> e)
        {
            var hull = new[]
            {
                S(1.5, 0.6, 0.5, b: 0.5, z: 3),
                S(6, 2.2, 1.8, b: 1.4, z: 3),
                S(12, 3.6, 2.8, b: 2.0, z: 3.1),
                S(20, 4.4, 3.4, b: 2.4, z: 3.2),
                S(28, 3.8, 3.0, b: 2.2, z: 3.2),
                S(35, 2.4, 1.9, b: 1.4, z: 3.1),
                S(41, 0, 0, z: 3),
            };
            m.Loft(hull, Ember, 6, segs: 22);
            for (int k = 0; k < 6; k++)
            {
                var al = (k / 6.0) * Math.PI * 2 + 0.3;
                var pts = new List<V3>();
                for (int i = 0; i <= 7; i++)
                {
                    var t = i / 7.0;
                    var r = 2.4 + t * 3.4;
                    pts.Add(V(9 - t * 17, 12 + Math.Cos(al) * r + Math.Sin(t * 6 + k) * 0.8, 3 + Math.Sin(al) * r * 0.8 + Math.Cos(t * 5 + k * 2) * 0.6));
                }
                m.Tube(pts, 1.2, 0.08, k % 2 != 0 ? Tongue : C(1, 0.6, 0.12), 2, 8, false);
            }
            m.Shard(V(24, 12, 5.6), V(-0.7, 0, 1), 7.5, 1.4, Tongue, 2);
            m.Shard(V(18, 12, 5.8), V(-0.8, 0, 0.9), 6, 1.15, Tongue, 2);
            m.Shard(V(12.5, 12, 5.0), V(-0.9, 0, 0.7), 4.4, 0.95, Tongue, 2);
            m.Mirror(() =>
            {
                m.Shard(V(21, 8.6, 3.4), V(-0.6, -0.8, 0.2), 6.4, 1.1, Ember, 6);
                m.Shard(V(14, 9.4, 2.9), V(-0.7, -0.7, 0.05), 4.6, 0.9, Ember, 6);
                m.Shard(V(27, 9.5, 2.0), V(-0.4, -0.6, -0.6), 3.6, 0.8, Ember, 6);
            });
            m.Ring(27.5, 12, 5.9, 2.3, 0.5, 0, Crust, 4);
            m.Ball(27.5, 12, 6.0, 1.9, Heart, 2, 18, 12);
            m.Ball(2, 12, 3, 1.4, Heart, 2);
            e.Add(P(1, 12, 3));
            return Tongue;
        }

        /// <summary>The Lost Races: a broken derelict, listing, its back snapped and its ribs showing, a mast stump, wreckage.</summary>
        static void Derelict(Mesh m)
        {
            m.With(
                p =>
                {
                    double c = Math.Cos(0.24), s = Math.Sin(0.24);
                    return V(p.X, p.Y * c - p.Z * s, p.Y * s + p.Z * c);
                },
                () =>
                {
                    var fore = new[]
                    {
                        S(24, 3.3, 2.5, b: 2.1, z: 3, p: 3),
                        S(25.5, 3.8, 3.0, b: 2.4, z: 3.2, p: 3),
                        S(31, 3.2, 2.6, b: 2.0, z: 3, p: 3),
                        S(37, 1.6, 1.4, b: 1.2, z: 2.8, p: 3),
                        S(39, 0.5, 0.4, b: 0.3, z: 2.8, p: 3),
                    };
                    var aft = new[]
                    {
                        S(4, 3, 2.2, b: 2, z: 3.2, p: 3),
                        S(6, 3.6, 2.8, b: 2.4, z: 3.2, p: 3),
                        S(15.5, 3.8, 3.0, b: 2.4, z: 3.4, p: 3),
                        S(17, 3.3, 2.5, b: 2.1, z: 3.4, p: 3),
                    };
                    m.With(
                        p =>
                        {
                            double c = Math.Cos(0.14), sn = Math.Sin(0.14);
                            var q = V(p.X - 0.06, p.Y - 0.01, p.Z);
                            return V(q.X * c - q.Z * sn + 0.06, q.Y, q.X * sn + q.Z * c);
                        },
                        () =>
                        {
                            m.Loft(fore, Rust, 4, segs: 12, flat: true);
                            m.Cyl(V(28, 12, 5.4), V(29.6, 12.9, 11.2), 0.5, 0.32, RustDark, 4, 8);
                            m.Cyl(V(29.1, 10.6, 9.0), V(29.5, 15.2, 8.0), 0.22, 0.18, RustDark, 4, 6);
                            m.Box(25.5, 28, 8.15, 8.4, 2.2, 4.2, RustDark, 4);
                            m.Box(31, 33.5, 15.0, 15.3, 1.8, 3.6, RustDark, 4);
                        });
                    m.Loft(aft, Rust, 4, segs: 12, flat: true);
                    // The ribs across the break, some snapped short.
                    foreach (var (x, span) in new[] { (18.2, 1.0), (19.6, 0.55), (21.0, 0.9), (22.4, 0.4) })
                    {
                        var pts = new List<V3>();
                        for (int i = 0; i <= 8; i++)
                        {
                            var a = -0.25 + (Math.PI + 0.5) * span * (i / 8.0);
                            pts.Add(V(x, 12 + Math.Cos(a) * 3.5, 3.2 + Math.Sin(a) * 2.9));
                        }
                        m.Tube(pts, 0.36, 0.3, C(0.62, 0.42, 0.32), 4, 6);
                    }
                    m.Cyl(V(16.5, 12, 0.9), V(25, 12, 0.7), 0.6, 0.6, RustDark, 4, 8);
                    m.Ball(20.5, 11, 1.2, 0.5, C(1, 0.45, 0.2), 2, 6, 4);
                    m.Box(8.5, 14, 9.6, 14.4, 5.6, 7.8, Rust, 4, 0.4);
                    m.Box(14.0, 14.2, 10.4, 12.2, 6.4, 7.2, RustDark, 4);
                    m.Box(9, 11, 15.6, 15.85, 2.6, 4.4, RustDark, 4);
                    Engine(m, 3.6, 12, 3.2, 1.3, 1.6, new List<V3>(), RustDark, Rust, 4);
                    m.Ball(12, 12, 8.1, 0.32, C(1, 0.3, 0.2), 2, 6, 4);
                });
            // Wreckage drifting beside it.
            m.Shard(V(16, 4, 7), V(0.3, -0.5, 0.8), 2.2, 0.8, Rust, 4, 0.6);
            m.Shard(V(31, 20, 6), V(-0.6, 0.2, 0.4), 1.8, 0.7, RustDark, 4, 1.4);
            m.Shard(V(6, 18, 9), V(0.2, 0.7, -0.3), 1.4, 0.55, Rust, 4, 2.2);
        }

        static readonly Dictionary<int, ShipModel> models = new Dictionary<int, ShipModel>();

        /// <summary>A race's ship (or, <c>race</c> -1, a Lost Races derelict), built once.</summary>
        public static ShipModel ShipModel3d(int race)
        {
            lock (models)
            {
                if (!models.TryGetValue(race, out var model))
                {
                    var m = new Mesh();
                    var engines = new List<V3>();
                    var glow = C(1, 0.4, 0.3);
                    carried = new List<CarriedSun>();
                    if (race < 0) Derelict(m);
                    else glow = (race < Builders.Length ? Builders[race] : Builders[0])(m, engines);
                    model = new ShipModel { Mesh = m.ToArray(), Engines = engines, Glow = glow, Suns = carried };
                    models[race] = model;
                }
                return model;
            }
        }

        // The map's stations, modelled as the ships are (1 long, the same materials): a space station (where cards are
        // bought, circling its star) and a research station's test tube (hovering over its star). [direction: space stations
        // orbiting the stars they belong to, research stations a model of their own; both were near impossible to find]
        static readonly Rgb HullWhite = C(0.86, 0.87, 0.9);
        static readonly Rgb PanelBlue = C(0.16, 0.3, 0.62);
        static readonly Rgb Lamp = C(1, 0.86, 0.55);
        // (Lit glass: pale, glowing faintly with the brew's light, so it reads against the paper.)
        static readonly Rgb Glass = C(0.72, 0.84, 0.97);
        static readonly Rgb Brew = C(0.35, 0.62, 1);
        static readonly Rgb Brass = C(0.78, 0.64, 0.36);

        static readonly Dictionary<PropKind, float[]> props = new Dictionary<PropKind, float[]>();

        /// <summary>A station's model (see PropKind), built once.</summary>
        public static float[] PropModel3d(PropKind kind)
        {
            lock (props)
            {
                if (props.TryGetValue(kind, out var mesh)) return mesh;
                var m = new Mesh();
                if (kind == PropKind.Lab)
                {
                    // A research test tube: glowing brew in its round-bottomed lower half, clear glass above to a lipped mouth, and a
                    // brass ring round it, tipped, as an orbit is drawn.
                    m.Loft(new[] { S(2, 0, 0, b: 0), S(2.6, 2.6, 2.6, b: 2.6, p: 2), S(4.2, 4.2, 4.2, b: 4.2, p: 2), S(6.2, 4.6, 4.6, b: 4.6, p: 2), S(20, 4.6, 4.6, b: 4.6, p: 2) }, Brew, 2, segs: 18, under: 0);
                    m.Loft(new[] { S(20, 4.6, 4.6, b: 4.6, p: 2), S(35, 4.6, 4.6, b: 4.6, p: 2), S(35.4, 5.6, 5.6, b: 5.6, p: 2), S(37, 5.6, 5.6, b: 5.6, p: 2) }, Glass, 2, segs: 18, under: 0);
                    m.Ring(18, 12, 0, 11, 0.7, Math.PI / 2 + 0.4, Brass, 0);
                    m.Ball(18, 12 + 11 * Math.Cos(0.4), 11 * Math.Sin(0.4), 1.2, Lamp, 2, 8, 5);
                }
                else
                {
                    // A hub standing up through a great ring, four spokes out to it, lamps round the ring, a mast and two wings of
                    // solar panels over the top, a dish under.
                    m.Cyl(V(20, 12, 8), V(20, 12, 30), 4, 4, HullWhite, 0, 16);
                    m.Ball(20, 12, 19, 5.5, HullWhite, 0, 16, 10);
                    m.Ring(20, 12, 19, 16, 1.6, 0, HullWhite, 0);
                    foreach (var (dx, dy) in new[] { (1, 0), (-1, 0), (0, 1), (0, -1) }) m.Cyl(V(20 + dx * 4, 12 + dy * 4, 19), V(20 + dx * 15, 12 + dy * 15, 19), 0.8, 0.8, HullWhite, 0, 8);
                    for (int i = 0; i < 12; i++)
                    {
                        var a = (i / 12.0) * Math.PI * 2;
                        m.Ball(20 + Math.Cos(a) * 16, 12 + Math.Sin(a) * 16, 20.4, 0.75, Lamp, 2, 6, 4);
                    }
                    m.Cyl(V(20, 12, 30), V(20, 12, 36), 0.9, 0.9, HullWhite, 0, 8);
                    m.Box(3, 17, 10, 14, 34, 34.8, PanelBlue, 1);
                    m.Box(23, 37, 10, 14, 34, 34.8, PanelBlue, 1);
                    m.Cyl(V(17, 12, 34.4), V(23, 12, 34.4), 0.6, 0.6, HullWhite, 0, 6);
                    m.Cyl(V(20, 12, 8), V(20, 12, 4), 1, 4.5, HullWhite, 0, 14);
                    m.Ball(20, 12, 37, 0.9, C(0.55, 0.9, 1), 2, 6, 4);
                }
                mesh = m.ToArray();
                props[kind] = mesh;
                return mesh;
            }
        }
    }
}
