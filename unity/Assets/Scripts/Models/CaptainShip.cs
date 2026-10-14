using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using static BlueLoop.Models.Vec;

namespace BlueLoop.Models
{
    /// <summary>What the Captain's ship is fitted with, for its model: each slot's part and its rarity, and the Captain's level.</summary>
    public class CaptainShipSpec
    {
        /// <summary>Each slot's part (armour, shield, port, starboard, booster, warp), if one is fitted.</summary>
        public Dictionary<string, string> Parts = new Dictionary<string, string>();
        /// <summary>Each fitted part's rarity (by slot).</summary>
        public Dictionary<string, string> Rarity = new Dictionary<string, string>();
        /// <summary>How far the Captain has been built up (petal upgrades bought, 0 to about 15).</summary>
        public double Level;
        /// <summary>The companions aboard (the map's ship shows them where the menu's does).</summary>
        public List<string> Crew;
    }

    /// <summary>The Captain's ship as captainShipModel builds it: its mesh, and where things are on it (box units, or its own axes).</summary>
    public class CaptainShipBuild
    {
        public float[] Mesh;
        public List<V3> Smoke;
        public List<V3> Engines;
        public double Deck;
        public double Bridge;
        public double RailY, RailZ;
        public double Dish;
    }

    /// <summary>
    /// The Captain's ship (captain-ship.ts), as one model wherever it is seen: on the campaign's menu (base3d.ts, large, the
    /// Captain on its deck) and on the map (nebula-objects.ts, flying between systems) [direction: the hero's ship on the map
    /// the same model as the campaign menu's]. Box units as the ships' (ship3d.ts): 40 to the model's 1, x along, y across, z up.
    /// </summary>
    public static class CaptainShip
    {
        /// <summary>A point of the box (x along, y across, z up) in the model's own axes.</summary>
        static V3 B(double x, double y, double z) => new V3((x - 20) / 40, z / 40, (y - 12) / 40);
        static V3 V(double x, double y, double z) => new V3(x, y, z);
        static Rgb C(double r, double g, double b) => new Rgb(r, g, b);

        // ---- Colours ----
        static readonly Rgb Hull = C(0.66, 0.68, 0.73);
        static readonly Rgb HullDark = C(0.4, 0.42, 0.48);
        public static readonly Rgb HullDeep = C(0.26, 0.27, 0.31);
        static readonly Rgb Rust = C(0.52, 0.41, 0.36);
        static readonly Rgb Scorch = C(0.17, 0.15, 0.15);
        static readonly Rgb Engine = C(1, 0.8, 0.52);
        static readonly Rgb Ember = C(1, 0.55, 0.22);
        static readonly Rgb Window = C(1, 0.9, 0.62);
        static readonly Rgb Canopy = C(0.16, 0.22, 0.34);
        static readonly Rgb LampAmber = C(1, 0.78, 0.36);
        static readonly Rgb LampCyan = C(0.55, 0.88, 1);
        static readonly Rgb Stripe = C(0.86, 0.62, 0.26);
        static readonly Dictionary<string, Rgb> PartTint = new Dictionary<string, Rgb> { ["dwarf"] = C(0.62, 0.7, 0.82), ["stellar"] = C(0.93, 0.75, 0.38), ["anomaly"] = C(0.72, 0.56, 0.98) };

        /// <summary>The ship's slots, in the hangar's order.</summary>
        public static readonly string[] Slots = { "armour", "shield", "port", "starboard", "booster", "warp" };

        /// <summary>A small, fixed sequence of numbers from 0 to 1 (the same ship every time).</summary>
        public static Func<double> Seq(double seed)
        {
            var s = seed;
            return () =>
            {
                s = (s * 16807) % 2147483647;
                return (s - 1) / 2147483646;
            };
        }

        /// <summary>The hull's sections (box units), swelling with the Captain's level.</summary>
        static Sec[] HullSecs(double k) => new[]
        {
            new Sec(1.5, 3.4 * k, 2.6 * k, b: 2.4 * k, z: 5, p: 3.4),
            new Sec(4, 4.4 * k, 3.2 * k, b: 3 * k, z: 5, p: 3.4),
            new Sec(13, 4.7 * k, 3.4 * k, b: 3.2 * k, z: 5, p: 3.4),
            new Sec(25, 4.5 * k, 3.2 * k, b: 3 * k, z: 5, p: 3.2),
            new Sec(32, 3.7 * k, 2.7 * k, b: 2.6 * k, z: 4.9, p: 3),
            new Sec(37, 2.1 * k, 1.6 * k, b: 1.8 * k, z: 4.6, p: 2.6),
            new Sec(40.5, 0.25, 0.25, b: 0.35, z: 4.3, p: 2),
        };

        /// <summary>
        /// Where each part's slot is on the ship (box units: x along, y across, z up), as the hangar marks it [direction: a
        /// birdseye view of the actual ship, parts attached to it directly]: over the place its part is built.
        /// </summary>
        public static Dictionary<string, V3> SlotSpots(double level)
        {
            var k = 1 + Math.Max(0, Math.Min(15, level)) * 0.025;
            return new Dictionary<string, V3>
            {
                ["armour"] = V(9.5, 12 - HullAt(k, 9.5).W - 0.4, HullAt(k, 9.5).Top - 1),
                ["shield"] = V(21.5, 14.5, HullAt(k, 22).Top + 1.6),
                ["port"] = V(24, 12 - (HullAt(k, 22).W + 1.4), 6.6),
                ["starboard"] = V(24, 12 + HullAt(k, 22).W + 1.4, 6.6),
                ["booster"] = V(3, 12 + 4.6 * k + 1.6, 6),
                ["warp"] = V(13.2, 12 + HullAt(k, 13.2).W + 0.9, 6),
            };
        }

        struct HullPoint
        {
            public double W, Top, Z, B;
        }

        /// <summary>The hull's half-width and its top at x (box units), by its sections.</summary>
        static HullPoint HullAt(double k, double x)
        {
            var s = HullSecs(k);
            for (int i = 0; i < s.Length - 1; i++)
                if (x <= s[i + 1].X)
                {
                    var t = (x - s[i].X) / (s[i + 1].X - s[i].X);
                    double z0 = s[i].Z.Value, z1 = s[i + 1].Z.Value, b0 = s[i].B.Value, b1 = s[i + 1].B.Value;
                    double w = s[i].W + (s[i + 1].W - s[i].W) * t, top = z0 + s[i].T + (z1 + s[i + 1].T - z0 - s[i].T) * t;
                    return new HullPoint { W = w, Top = top, Z = z0 + (z1 - z0) * t, B = b0 + (b1 - b0) * t };
                }
            return new HullPoint { W = 0.2, Top = 4.5, Z = 4.3, B = 0.3 };
        }

        static bool Fitted(CaptainShipSpec spec, string slot) => spec.Parts != null && spec.Parts.TryGetValue(slot, out var p) && !string.IsNullOrEmpty(p);

        /// <summary>
        /// The Captain's ship, in detail: a battered corvette, lofted and plated, a flat foredeck, a bridge tower with its
        /// windows lit, a dorsal spine, an engine block of three bells, pipes and vents and hatches down its flanks, a sensor
        /// array astern (research), a mast; every part fitted built on in its place and its rarity's colour; and, while the
        /// Captain is still low, the wear of it: scorched and torn plating, a burning gash, the ribs showing.
        /// </summary>
        public static CaptainShipBuild CaptainShipModel(CaptainShipSpec spec)
        {
            var m = new Mesh();
            var lv = Math.Max(0, Math.Min(15, spec.Level));
            var k = 1 + lv * 0.025;
            var worn = lv < 4;
            var rnd = Seq(7);
            Rgb Tint(string slot)
            {
                string r = null;
                if (spec.Rarity == null || !spec.Rarity.TryGetValue(slot, out r) || r == null) r = "dwarf";
                return PartTint.TryGetValue(r, out var c) ? c : PartTint["dwarf"];
            }
            var secs = HullSecs(k);
            var smoke = new List<V3>();
            var engines = new List<V3>();

            // The hull, smooth-plated, its keel darker; a band of hazard stripe at the bow.
            m.Loft(secs, Hull, 0, segs: 36, under: 0.35);
            m.Band(secs, 33.5, 0.9, 0.12, Stripe, 0);
            m.Band(secs, 9, 1.2, 0.18, HullDark, 0);
            m.Band(secs, 21, 1.2, 0.18, HullDark, 0);
            // The keel: a fin below, and landing skids folded up against the hull.
            m.Wing(new Chord(24, 10, 12, 5 - 3 * k), new Chord(17, 11, 12, 5 - 3 * k - 3.2), 0.7, HullDark, 0);
            foreach (var sd in new[] { -1, 1 })
            {
                m.Tube(new[] { V(12, 12 + sd * 3.4 * k, 2.6), V(12, 12 + sd * 3.9 * k, 1.2), V(26, 12 + sd * 3.9 * k, 1.4) }, 0.35, 0.35, HullDeep, 4, 8);
                m.Cyl(V(26, 12 + sd * 3.9 * k, 1.4), V(28.5, 12 + sd * 3.9 * k, 2.2), 0.35, 0.3, HullDeep, 4, 8);
            }

            // The foredeck: a flat plate where the Captain stands, a rail round its edge.
            var dk = HullAt(k, 27);
            var deck = dk.Top + 0.55;
            m.Box(21, 34, 12 - dk.W * 0.72, 12 + dk.W * 0.72, dk.Top - 0.4, deck, HullDark, 0, 0.35);
            for (double x = 21.5; x <= 33.5; x += 1.5)
                foreach (var sd in new[] { -1, 1 }) m.Cyl(V(x, 12 + sd * dk.W * 0.68, deck), V(x, 12 + sd * dk.W * 0.68, deck + 1.1), 0.09, 0.09, HullDeep, 0, 6);
            foreach (var sd in new[] { -1, 1 }) m.Tube(new[] { V(21.5, 12 + sd * dk.W * 0.68, deck + 1.1), V(33.5, 12 + sd * dk.W * 0.68, deck + 1.1) }, 0.1, 0.1, HullDeep, 0, 6);
            // (And across its fore end, where the Captain sets his boot.)
            m.Tube(new[] { V(33.5, 12 - dk.W * 0.68, deck + 1.1), V(33.5, 12 + dk.W * 0.68, deck + 1.1) }, 0.1, 0.1, HullDeep, 0, 6);
            foreach (var y in new[] { -1, 1 }) m.Cyl(V(33.5, 12 + y * dk.W * 0.25, deck), V(33.5, 12 + y * dk.W * 0.25, deck + 1.1), 0.09, 0.09, HullDeep, 0, 6);
            // A hatch and a bollard on it.
            m.Cyl(V(23.4, 12 - 1.6, deck), V(23.4, 12 - 1.6, deck + 0.25), 1, 1, Hull, 0, 18);
            m.Ring(23.4, 12 - 1.6, deck + 0.27, 0.8, 0.1, 0, HullDeep, 0);
            m.Cyl(V(32.4, 12 + 1.4, deck), V(32.4, 12 + 1.4, deck + 0.8), 0.35, 0.3, HullDeep, 0, 10);

            // The dorsal spine, from the engines to the bridge, and the bridge tower on it.
            m.Spine(secs, 3, 19, 1, 0.8, HullDark, 5);
            var bz = HullAt(k, 14).Top - 0.2;
            var bridge = new[]
            {
                new Sec(9, 2.2 * k, 0.4, b: 0.2, z: bz, p: 3),
                new Sec(11, 2.9 * k, 2.6, b: 0.2, z: bz, p: 3),
                new Sec(17, 2.6 * k, 2.4, b: 0.2, z: bz, p: 3),
                new Sec(19.5, 1.7 * k, 1.1, b: 0.2, z: bz, p: 2.6),
                new Sec(20.5, 0, 0, z: bz),
            };
            m.Loft(bridge, Hull, 0, segs: 24, under: 0.2);
            // Its windows: a band round the front, dark glass, lit within.
            m.Loft(
                new[]
                {
                    new Sec(17.2, 2.65 * k, 0.7, b: 0.1, z: bz + 1.4, p: 3),
                    new Sec(19.6, 1.75 * k, 0.45, b: 0.1, z: bz + 0.8, p: 2.6),
                    new Sec(20.3, 0, 0, z: bz + 0.6),
                },
                Canopy,
                1,
                segs: 20);
            for (int i = 0; i < 5; i++) foreach (var sd in new[] { -1, 1 }) m.Ball(12 + i * 1.2, 12 + sd * 2.78 * k, bz + 1.5, 0.22, Window, 2, 6, 4);
            // The mast: a lattice of rods, a lamp at its top, a whip antenna, a small dish.
            m.Cyl(V(13.5, 12, bz + 2.6), V(13.5, 12, bz + 7.5), 0.18, 0.12, HullDeep, 0, 8);
            m.Cyl(V(13.5, 12, bz + 4.4), V(12.2, 12, bz + 4.8), 0.1, 0.1, HullDeep, 0, 6);
            m.Cyl(V(13.5, 12, bz + 5.8), V(15, 12, bz + 6.2), 0.08, 0.08, HullDeep, 0, 6);
            m.Ball(13.5, 12, bz + 7.6, 0.3, LampAmber, 2, 8, 5);
            m.Cyl(V(15.5, 12.8, bz + 2.5), V(16.4, 13.2, bz + 9), 0.05, 0.03, HullDeep, 0, 5);
            m.Orb(12.2, 12, bz + 4.7, 0.7, 0.7, 0.2, Hull, 0, true, 12, 4);
            // Windows down the hull's sides, and running lights.
            m.Windows(secs, 6, 31, 12, 0.35, 0.22, Window);
            m.Ball(39.6, 12, 4.6, 0.25, LampCyan, 2, 8, 5);
            foreach (var sd in new[] { -1, 1 }) m.Ball(30, 12 + sd * (HullAt(k, 30).W + 0.1), 5, 0.22, sd < 0 ? LampAmber : LampCyan, 2, 8, 5);

            // The flanks: pipes run along each, vents and hatches and plates set into it.
            foreach (var sd in new[] { -1, 1 })
            {
                var pipe = new List<V3>();
                for (double x = 4; x <= 31; x += 3) pipe.Add(V(x, 12 + sd * (HullAt(k, x).W + 0.25), 4.1 + 0.15 * Math.Sin(x)));
                m.Tube(pipe, 0.22, 0.22, HullDeep, 4, 8);
                var pipe2 = new List<V3>();
                for (double x = 6; x <= 26; x += 4) pipe2.Add(V(x, 12 + sd * (HullAt(k, x).W + 0.15), 3.2));
                m.Tube(pipe2, 0.14, 0.14, Rust, 4, 6);
                for (int i = 0; i < 16; i++)
                {
                    double x = 5 + rnd() * 27, w = 0.6 + rnd() * 1.6, h = 0.4 + rnd() * 0.9, z = 4.6 + rnd() * 1.8;
                    var y = 12 + sd * (HullAt(k, x + w / 2).W - 0.05);
                    m.Box(x, x + w, sd < 0 ? y - 0.25 : y, sd < 0 ? y : y + 0.25, z, z + h, rnd() < 0.3 ? HullDeep : HullDark, 0, 0.06);
                }
                // Vents: a row of slats.
                for (int i = 0; i < 5; i++)
                {
                    double x = 7 + i * 0.7, y = 12 + sd * (HullAt(k, x).W + 0.02);
                    m.Box(x, x + 0.4, sd < 0 ? y - 0.15 : y, sd < 0 ? y : y + 0.15, 6.2, 7.2, HullDeep, 0);
                }
            }
            // Greebles on the back: boxes and caps between the bridge and the engines.
            for (int i = 0; i < 14; i++)
            {
                double x = 3 + rnd() * 6, y = 12 + (rnd() - 0.5) * 5, top = HullAt(k, x).Top - 0.2, s = 0.4 + rnd() * 0.8;
                if (rnd() < 0.5) m.Box(x, x + s, y, y + s * 0.8, top, top + 0.3 + rnd() * 0.6, rnd() < 0.5 ? HullDark : Hull, 0, 0.05);
                else m.Cyl(V(x, y, top), V(x, y, top + 0.4 + rnd() * 0.5), s * 0.4, s * 0.35, HullDeep, 0, 10);
            }

            // The engine block: a housing astern, three bells, burning; vanes between them.
            m.Rbox(1.8, 12, 5, 2.4, 4.6 * k, 3.3 * k, HullDark, 0, 4, 4, 32, 16);
            foreach (var (dy, dz) in new[] { (-2.6, 0.6), (2.6, 0.6), (0.0, -1.6) })
            {
                double y = 12 + dy * k, z = 5 + dz * k;
                m.Cyl(V(0, y, z), V(-2.6, y, z), 1.25 * k, 1.75 * k, HullDeep, 4, 24);
                m.Ring(-2.55, y, z, 1.7 * k, 0.16, Math.PI / 2, HullDark, 0);
                m.Ring(-1, y, z, 1.45 * k, 0.12, Math.PI / 2, Rust, 4);
                m.Orb(-2.2, y, z - 1.4 * k, 0.35, 1.4 * k, 1.4 * k, worn && dy > 0 ? Ember : Engine, 2, false, 20, 10);
                engines.Add(B(-2.6, y, z));
            }
            foreach (var sd in new[] { -1, 1 }) m.Wing(new Chord(4, 0, 12 + sd * 4.4 * k, 5), new Chord(2, -0.8, 12 + sd * 6.6 * k, 5.6), 0.4, HullDark, 0);

            // The sensor array astern (research): a dish on a turret, its feed horn, a holo emitter ring lit beside it.
            double ax = 5.5, az = HullAt(k, 5.5).Top - 0.2;
            m.Cyl(V(ax, 12, az), V(ax, 12, az + 1.3), 0.9, 0.7, HullDark, 0, 16);
            m.With(
                p =>
                {
                    // (The dish tipped back to the sky, round its centre.)
                    var c = B(ax, 12, az + 2.2);
                    double a = 0.55, cs = Math.Cos(a), sn = Math.Sin(a);
                    double x = p.X - c.X, y = p.Y - c.Y;
                    return V(c.X + x * cs - y * sn, c.Y + x * sn + y * cs, p.Z);
                },
                () =>
                {
                    m.Orb(ax, 12, az + 1.7, 2.4, 2.4, 0.55, Hull, 0, false, 28, 10);
                    m.Ring(ax, 12, az + 2.2, 2.35, 0.12, 0, HullDark, 0);
                    foreach (var a in new[] { 0, 2.1, 4.2 }) m.Cyl(V(ax + Math.Cos(a) * 2.2, 12 + Math.Sin(a) * 2.2, az + 2.2), V(ax, 12, az + 4.2), 0.06, 0.06, HullDeep, 0, 5);
                    m.Ball(ax, 12, az + 4.3, 0.32, LampCyan, 2, 10, 6);
                });
            m.Cyl(V(9.5, 12 - 2.4, HullAt(k, 9.5).Top - 0.2), V(9.5, 12 - 2.4, HullAt(k, 9.5).Top + 0.6), 0.7, 0.55, HullDark, 0, 16);
            m.Ring(9.5, 12 - 2.4, HullAt(k, 9.5).Top + 0.65, 0.5, 0.1, 0, LampCyan, 2);

            // Worn: scorched and torn plating, a burning gash in the flank (smoking), the ribs showing at the bow.
            if (worn)
            {
                var w = HullAt(k, 16).W;
                m.Rbox(16.2, 12 + w - 0.02, 4.9, 2.6, 0.12, 1.9, Scorch, 4, 2.4, 2.4, 20, 10);
                m.Orb(16.2, 12 + w + 0.1, 4.4, 1.4, 0.2, 0.7, Ember, 2, false, 14, 6);
                smoke.Add(B(16.2, 12 + w + 0.4, 5));
                m.Rbox(30.8, 12 + HullAt(k, 31).W - 0.06, 6, 2, 0.1, 1.1, Scorch, 4, 2.4, 2.4, 18, 8);
                m.Wing(new Chord(25, 22, 12 - HullAt(k, 23).W, 6), new Chord(24.6, 22.5, 12 - HullAt(k, 23).W - 1.6, 7.2), 0.12, Rust, 4);
                m.Rbox(7.5, 12 - HullAt(k, 7).W + 0.02, 4.8, 1.6, 0.1, 1.3, Scorch, 4, 2.4, 2.4, 16, 8);
                smoke.Add(B(-1.5, 12 + 2.6 * k, 5.6));
            }

            // The parts fitted, each in its place and its rarity's colour.
            if (Fitted(spec, "armour"))
            {
                var c = Tint("armour");
                foreach (var sd in new[] { -1, 1 })
                    foreach (var (x0, x1) in new[] { (6.0, 11.0), (12.0, 17.0), (18.0, 23.0), (24.0, 28.0) })
                    {
                        var y = 12 + sd * (HullAt(k, (x0 + x1) / 2).W - 0.05);
                        m.Rbox((x0 + x1) / 2, y, 4.9, (x1 - x0) / 2 - 0.1, 0.32, 2.3, c, 0, 6, 5, 20, 10);
                        foreach (var xr in new[] { x0 + 0.7, x1 - 0.7 }) foreach (var zr in new[] { 3, 6.8 }) m.Ball(xr, y + sd * 0.3, zr, 0.16, HullDeep, 0, 6, 4);
                    }
            }
            if (Fitted(spec, "shield"))
            {
                var c = Tint("shield");
                var z = HullAt(k, 22).Top + 0.1;
                m.Cyl(V(21.5, 12 + 2.5, z - 0.4), V(21.5, 12 + 2.5, z + 0.5), 1.1, 1, HullDark, 0, 16);
                m.Orb(21.5, 12 + 2.5, z + 0.5, 1.2, 1.2, 1, C(0.7, 0.85, 1), 1, true, 18, 8);
                m.Ring(21.5, 12 + 2.5, z + 0.55, 1.25, 0.14, 0, c, 0);
            }
            foreach (var (slot, sd) in new[] { ("port", -1), ("starboard", 1) })
            {
                if (!Fitted(spec, slot)) continue;
                var c = Tint(slot);
                var y = 12 + sd * (HullAt(k, 22).W + 1.4);
                m.Box(19.5, 24.5, sd < 0 ? y : y - 1.6, sd < 0 ? y + 1.6 : y, 4.2, 5.2, HullDark, 0, 0.2);
                m.Cyl(V(22, y, 5.2), V(22, y, 6.2), 1.1, 1, HullDeep, 0, 14);
                m.Ball(22, y, 6.4, 1.1, c, 0, 14, 8);
                foreach (var dy in new[] { -0.4, 0.4 }) m.Cyl(V(22.6, y + dy, 6.5), V(28.5, y + dy, 6.7), 0.2, 0.16, c, 0, 10);
            }
            if (Fitted(spec, "booster"))
            {
                var c = Tint("booster");
                foreach (var sd in new[] { -1, 1 })
                {
                    var y = 12 + sd * (4.6 * k + 1.6);
                    m.Loft(new[] { new Sec(-1, 1, 1, y: y, z: 5), new Sec(1, 1.3, 1.3, y: y, z: 5), new Sec(9, 1.2, 1.2, y: y, z: 5), new Sec(11.5, 0, 0, y: y, z: 5) }, c, 0, segs: 18);
                    m.Cyl(V(4, 12 + sd * 4.4 * k, 5), V(4, y, 5), 0.3, 0.3, HullDeep, 0, 8);
                    m.Orb(-1.3, y, 4.1, 0.25, 0.9, 0.9, Engine, 2, false, 14, 8);
                    engines.Add(B(-1.4, y, 5));
                }
            }
            if (Fitted(spec, "warp"))
            {
                var c = Tint("warp");
                foreach (var x in new[] { 12, 14.5 })
                {
                    m.Ring(x, 12, 5, HullAt(k, x).W + 0.9, 0.3, Math.PI / 2, c, 0);
                    m.Ring(x, 12, 5, HullAt(k, x).W + 0.9, 0.12, Math.PI / 2, LampCyan, 2);
                }
            }
            return new CaptainShipBuild { Mesh = m.ToArray(), Smoke = smoke, Engines = engines, Deck = deck, Bridge = bz + 2.6, RailY = 12 + dk.W * 0.68, RailZ = deck + 1.2, Dish = HullAt(k, 8.7).Top - 0.1 };
        }

        static readonly Dictionary<string, ShipModel> mapModels = new Dictionary<string, ShipModel>();

        /// <summary>
        /// The ship with the Captain standing on its foredeck, as the menu shows him (base3d.ts: there his coat's tails stream
        /// in the wind; here they are still): at the rail, facing ahead and a little out, his height 0.7 of the menu ship's 4.2.
        /// </summary>
        static float[] WithCaptain(float[] ship, double deck) => Placed(ship, new[] { CaptainModels.CaptainModel(), CaptainModels.StreamerModel() }, B(32, 12, deck), B(20, 12, 0), 0.7 / 4.2, 1.3);

        /// <summary>
        /// The companions aboard [direction: the map's ship shows the friends on it too, both ships identical]: each where the
        /// menu's ship has them (CompanionModels.Places), as it stands, sits or flies there.
        /// </summary>
        static float[] WithCrew(float[] ship, IList<string> crew, double railY, double railZ, double dish)
        {
            var @out = ship;
            foreach (var id in crew)
            {
                if (id == null || !CompanionModels.Places.TryGetValue(id, out var pl)) continue;
                var at = pl.On == "rail" ? B(pl.X, railY, railZ) : pl.On == "dish" ? B(pl.X, pl.Y, dish) : B(pl.X, pl.Y, pl.Z);
                @out = Placed(@out, new[] { CompanionModels.CompanionModel(id) }, at, B(pl.Anchor.X, pl.Anchor.Y, pl.Anchor.Z), pl.Size / 4.2, pl.Turn);
            }
            return @out;
        }

        /// <summary>Figures set on the ship: each scaled by <c>k</c> about its <c>mid</c>, turned by <c>turn</c> about the vertical, and stood at <c>at</c>.</summary>
        static float[] Placed(float[] ship, float[][] parts, V3 at, V3 mid, double k, double turn)
        {
            double c = Math.Cos(turn), sn = Math.Sin(turn);
            var @out = new float[ship.Length + parts.Sum(p => p.Length)];
            Array.Copy(ship, @out, ship.Length);
            int o = ship.Length;
            const int stride = Ship3d.ShipStride;
            foreach (var p in parts)
            {
                for (int i = 0; i < p.Length; i += stride)
                {
                    double x = (p[i] - mid.X) * k, y = (p[i + 1] - mid.Y) * k, z = (p[i + 2] - mid.Z) * k;
                    @out[o + i] = (float)(at.X + c * x + sn * z);
                    @out[o + i + 1] = (float)(at.Y + y);
                    @out[o + i + 2] = (float)(at.Z - sn * x + c * z);
                    @out[o + i + 3] = (float)(c * p[i + 3] + sn * p[i + 5]);
                    @out[o + i + 4] = p[i + 4];
                    @out[o + i + 5] = (float)(-sn * p[i + 3] + c * p[i + 5]);
                    for (int j = 6; j < stride; j++) @out[o + i + j] = p[i + j];
                }
                o += p.Length;
            }
            return @out;
        }

        /// <summary>A fitting's identity (what tells one built ship from another).</summary>
        static string Key(CaptainShipSpec spec)
        {
            var sb = new StringBuilder();
            sb.Append(spec.Level.ToString("R", System.Globalization.CultureInfo.InvariantCulture)).Append('|');
            if (spec.Parts != null) foreach (var kv in spec.Parts.OrderBy(kv => kv.Key, StringComparer.Ordinal)) sb.Append(kv.Key).Append('=').Append(kv.Value).Append(';');
            sb.Append('|');
            if (spec.Rarity != null) foreach (var kv in spec.Rarity.OrderBy(kv => kv.Key, StringComparer.Ordinal)) sb.Append(kv.Key).Append('=').Append(kv.Value).Append(';');
            sb.Append('|');
            if (spec.Crew != null) sb.Append(string.Join(",", spec.Crew));
            return sb.ToString();
        }

        /// <summary>The ship as the map flies it, the Captain on its deck and the crew aboard (built once for each fitting).</summary>
        public static ShipModel CaptainShipMap(CaptainShipSpec spec)
        {
            var key = Key(spec);
            lock (mapModels)
            {
                if (!mapModels.TryGetValue(key, out var m))
                {
                    var s = CaptainShipModel(spec);
                    m = new ShipModel
                    {
                        Mesh = WithCrew(WithCaptain(s.Mesh, s.Deck), spec.Crew ?? new List<string>(), s.RailY, s.RailZ, s.Dish),
                        Engines = s.Engines,
                        Glow = Engine,
                        Suns = new List<CarriedSun>(),
                        Smoke = s.Smoke,
                    };
                    mapModels[key] = m;
                }
                return m;
            }
        }
    }
}
