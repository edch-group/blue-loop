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
        /// <summary>Where the Captain stands on the foredeck (box units).</summary>
        public V3 Captain;
        /// <summary>How much the hull has swollen with the Captain's level (across and up, about its axis).</summary>
        public double Swell;

        /// <summary>Where one of the crew stands aboard (box units): at the near rail, or on the hull's top where they are placed.</summary>
        public V3 CrewAt(CompanionPlace pl) =>
            pl.On == "rail" ? new V3(pl.X, RailY, RailZ) : new V3(pl.X, pl.Y, CaptainShip.ZC + (CaptainShip.TopAt(pl.X, pl.Y) - CaptainShip.ZC) * Swell);
    }

    /// <summary>
    /// The Captain's ship, as one model wherever it is seen: on the campaign's menu (CampaignBackdrop, large, the Captain on
    /// its deck) and on the map (flying between systems) [direction: the hero's ship on the map the same model as the
    /// campaign menu's]. Its hull is a made model (Resources/Models/CaptainShip.bytes, baked by scripts/bake-captain-ship.py
    /// from unity/ModelSources/captain-ship), painted after its art (CaptainShipPaint.png, Ship.shader's painted metal); the
    /// parts fitted, its wounds while the Captain is low, and the engines' glow are built onto it here. Box units as the
    /// ships' (ship3d.ts): 40 to the model's 1, x along, y across, z up.
    /// </summary>
    public static class CaptainShip
    {
        /// <summary>A point of the box (x along, y across, z up) in the model's own axes.</summary>
        static V3 B(double x, double y, double z) => new V3((x - 20) / 40, z / 40, (y - 12) / 40);
        static V3 V(double x, double y, double z) => new V3(x, y, z);
        static Rgb C(double r, double g, double b) => new Rgb(r, g, b);

        // ---- Colours (after the art: dark slate plating, amber trim) ----
        static readonly Rgb HullDark = C(0.24, 0.26, 0.3);
        static readonly Rgb Slate = C(0.15, 0.16, 0.19);
        /// <summary>(The old hull's darkest grey, which the Captain's own model still wears.)</summary>
        public static readonly Rgb HullDeep = C(0.26, 0.27, 0.31);
        static readonly Rgb Rust = C(0.52, 0.41, 0.36);
        static readonly Rgb Scorch = C(0.14, 0.12, 0.11);
        static readonly Rgb Engine = C(1, 0.8, 0.52);
        static readonly Rgb Ember = C(1, 0.55, 0.22);
        static readonly Rgb LampCyan = C(0.55, 0.88, 1);
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

        // ---- The hull (the made model) ----

        /// <summary>The baked hull's bytes (Unity: Resources/Models/CaptainShip; the tests: the file).</summary>
        public static Func<byte[]> HullSource;

        /// <summary>The hull's axis (box units, up): it swells about this with the Captain's level.</summary>
        public const double ZC = 5.1;

        class HullData
        {
            public float[] Pos, Nor;
            public byte[] Mat;
            public int[] Tris;
            public double PaintX0, PaintX1, PaintZ0, PaintZ1;
        }

        static HullData hull;

        static HullData Hull0()
        {
            if (hull != null) return hull;
            var bytes = HullSource?.Invoke() ?? throw new InvalidOperationException("the Captain's ship's hull (Models/CaptainShip.bytes) is not loaded");
            using (var r = new System.IO.BinaryReader(new System.IO.MemoryStream(bytes)))
            {
                if (new string(r.ReadChars(4)) != "BLCS") throw new InvalidOperationException("not the Captain's ship's hull");
                r.ReadInt32();
                int nv = r.ReadInt32(), nt = r.ReadInt32();
                float q = r.ReadSingle();
                var h = new HullData { PaintX0 = r.ReadSingle(), PaintX1 = r.ReadSingle(), PaintZ0 = r.ReadSingle(), PaintZ1 = r.ReadSingle() };
                h.Pos = new float[nv * 3];
                h.Nor = new float[nv * 3];
                h.Mat = new byte[nv];
                for (int i = 0; i < nv; i++)
                {
                    for (int c = 0; c < 3; c++) h.Pos[i * 3 + c] = r.ReadInt16() / q;
                    for (int c = 0; c < 3; c++) h.Nor[i * 3 + c] = r.ReadSByte() / 127f;
                    h.Mat[i] = r.ReadByte();
                }
                h.Tris = new int[nt * 3];
                for (int i = 0; i < nt * 3; i++) h.Tris[i] = nv > 65535 ? (int)r.ReadUInt32() : r.ReadUInt16();
                hull = h;
            }
            return hull;
        }

        /// <summary>
        /// The top of the hull at (x, y) (box units, as made: before it swells): the highest of its faces over that point,
        /// where the crew stand.
        /// </summary>
        public static double TopAt(double x, double y)
        {
            lock (tops)
                if (tops.TryGetValue((x, y), out var known)) return known;
            var h = Hull0();
            double top = double.NegativeInfinity;
            var p = h.Pos;
            for (int t = 0; t < h.Tris.Length; t += 3)
            {
                int a = h.Tris[t] * 3, b = h.Tris[t + 1] * 3, c = h.Tris[t + 2] * 3;
                double ax = p[a], ay = p[a + 1], bx = p[b], by = p[b + 1], cx = p[c], cy = p[c + 1];
                if (x < Math.Min(ax, Math.Min(bx, cx)) || x > Math.Max(ax, Math.Max(bx, cx)) || y < Math.Min(ay, Math.Min(by, cy)) || y > Math.Max(ay, Math.Max(by, cy))) continue;
                double d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
                if (Math.Abs(d) < 1e-12) continue;
                double w0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, w1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d, w2 = 1 - w0 - w1;
                if (w0 < 0 || w1 < 0 || w2 < 0) continue;
                top = Math.Max(top, w0 * p[a + 2] + w1 * p[b + 2] + w2 * p[c + 2]);
            }
            if (double.IsInfinity(top)) top = ZC;
            lock (tops) tops[(x, y)] = top;
            return top;
        }

        static readonly Dictionary<(double, double), double> tops = new Dictionary<(double, double), double>();

        /// <summary>The hull's half-width at x (box units, as made), at the height of its flanks.</summary>
        static double HalfWidth(double x)
        {
            for (int i = 0; i < Width.Length - 1; i++)
                if (x <= Width[i + 1].X)
                {
                    var t = Math.Max(0, (x - Width[i].X) / (Width[i + 1].X - Width[i].X));
                    return Width[i].W + (Width[i + 1].W - Width[i].W) * t;
                }
            return 0.2;
        }

        // (Measured off the made hull: the engine block, the long flanks, the porthole's frame, the bow tapering.)
        static readonly (double X, double W)[] Width =
        {
            (-2.6, 4.3), (-0.3, 4.3), (0, 5.55), (3.6, 5.58), (4.2, 4.75), (15.5, 4.75), (16, 5.25), (20.3, 5.25), (20.8, 4.75),
            (32, 4.75), (33, 4.05), (34, 3.85), (35, 3.77), (36, 3.45), (37, 2.9), (38, 2.4), (39, 1.7), (40, 0.95), (40.5, 0.2),
        };

        // Where things are on the made hull (box units).
        /// <summary>The foredeck's floor, between its rails; the rails' tops and how far out they run.</summary>
        const double DeckFloor = 8.07, RailTop = 8.95, RailOut = 3.0;
        /// <summary>The engine block's three bells: their mouths' centres (across, up), where they open astern, how wide.</summary>
        static readonly (double Y, double Z)[] Bells = { (9.96, 5.3), (14.08, 5.3), (11.9, 2.5) };
        const double BellX = -2.6, BellR = 1.7;
        /// <summary>The bridge's roof.</summary>
        const double BridgeTop = 9.4;

        /// <summary>
        /// Where each part's slot is on the ship (box units: x along, y across, z up), as the hangar marks it [direction: a
        /// birdseye view of the actual ship, parts attached to it directly]: over the place its part is built.
        /// </summary>
        public static Dictionary<string, V3> SlotSpots(double level)
        {
            var k = SwellOf(level);
            V3 S(double x, double y, double z) => V(x, 12 + (y - 12) * k, ZC + (z - ZC) * k);
            return new Dictionary<string, V3>
            {
                ["armour"] = S(8, 12 - HalfWidth(8) - 0.4, 6.4),
                ["shield"] = S(12.6, 14, BridgeTop + 1.6),
                ["port"] = S(24.5, 12 - (HalfWidth(24.5) + 1.3), 7.3),
                ["starboard"] = S(24.5, 12 + HalfWidth(24.5) + 1.3, 7.3),
                ["booster"] = S(4, 12 + 5.58 + 1.7, 6),
                ["warp"] = S(1.8, 12 + 5.58 + 0.9, 7),
            };
        }

        static double SwellOf(double level) => 1 + Math.Max(0, Math.Min(15, level)) * 0.025;

        static bool Fitted(CaptainShipSpec spec, string slot) => spec.Parts != null && spec.Parts.TryGetValue(slot, out var p) && !string.IsNullOrEmpty(p);

        /// <summary>
        /// The Captain's ship: the made hull, a battered corvette painted after its art (dark slate plating and amber trim,
        /// its windows and porthole lit, its bells burning), swelling a little with the Captain's level; every part fitted
        /// built on in its place and its rarity's colour; and, while the Captain is still low, the wear of it: scorched and
        /// torn plating, a burning gash in the flank, a smoking engine.
        /// </summary>
        public static CaptainShipBuild CaptainShipModel(CaptainShipSpec spec)
        {
            var h = Hull0();
            var m = new Mesh();
            var lv = Math.Max(0, Math.Min(15, spec.Level));
            var k = SwellOf(lv);
            var worn = lv < 4;
            Rgb Tint(string slot)
            {
                string r = null;
                if (spec.Rarity == null || !spec.Rarity.TryGetValue(slot, out r) || r == null) r = "dwarf";
                return PartTint.TryGetValue(r, out var c) ? c : PartTint["dwarf"];
            }
            // A point of the box as the hull has swollen: wider and taller about its axis.
            V3 S(double x, double y, double z) => V(x, 12 + (y - 12) * k, ZC + (z - ZC) * k);
            V3 SB(double x, double y, double z) { var p = S(x, y, z); return B(p.X, p.Y, p.Z); }
            var smoke = new List<V3>();
            var engines = new List<V3>();

            // The hull, each corner where the paint is laid over it side on (its colour: the paint's place; Ship.shader).
            {
                var o = m.Out;
                o.Capacity = h.Tris.Length * Ship3d.ShipStride + 60000;
                double pw = h.PaintX1 - h.PaintX0, ph = h.PaintZ1 - h.PaintZ0;
                foreach (var i in h.Tris)
                {
                    double x = h.Pos[i * 3], y = h.Pos[i * 3 + 1], z = h.Pos[i * 3 + 2];
                    var p = SB(x, y, z);
                    // (Its normal as the hull swells: leaning less across and up.)
                    var n = Norm(V(h.Nor[i * 3] * k, h.Nor[i * 3 + 2], h.Nor[i * 3 + 1]));
                    o.Add((float)p.X);
                    o.Add((float)p.Y);
                    o.Add((float)p.Z);
                    o.Add((float)n.X);
                    o.Add((float)n.Y);
                    o.Add((float)n.Z);
                    o.Add((float)((x - h.PaintX0) / pw));
                    o.Add((float)((z - h.PaintZ0) / ph));
                    o.Add(0);
                    o.Add(h.Mat[i]);
                }
            }

            m.With(
                p => { var b = V(p.X * 40 + 20, p.Z * 40 + 12, p.Y * 40); var s = S(b.X, b.Y, b.Z); return B(s.X, s.Y, s.Z); },
                () =>
                {
                    // The bells burning in their throats (the right one sputtering embers while the ship is a wreck).
                    foreach (var (y, z) in Bells)
                    {
                        m.Orb(BellX + 0.7, y, z - 1.0, 0.3, 1.0, 1.0, worn && y > 12 && z > 4 ? Ember : Engine, 2, false, 20, 10);
                        engines.Add(SB(BellX, y, z));
                    }

                    // Worn: scorched and torn plating, a burning gash in the starboard flank (smoking), a smoking engine.
                    if (worn)
                    {
                        // (Low on the flanks, under the windows.)
                        var w = HalfWidth(26.5);
                        m.Rbox(26.5, 12 + w + 0.02, 4.5, 1.2, 0.06, 0.28, Scorch, 4, 2.4, 2.4, 20, 10);
                        m.Orb(26.5, 12 + w + 0.06, 4.4, 0.85, 0.1, 0.1, Ember, 2, false, 14, 6);
                        smoke.Add(SB(26.5, 12 + w + 0.4, 4.8));
                        m.Rbox(30.6, 12 + HalfWidth(30.6) + 0.02, 4.6, 0.8, 0.06, 0.22, Scorch, 4, 2.4, 2.4, 18, 8);
                        m.Wing(new Chord(13.6, 11.2, 12 - HalfWidth(12.5), 6.4), new Chord(13.2, 11.6, 12 - HalfWidth(12.5) - 1.6, 7.6), 0.12, Rust, 4);
                        m.Rbox(7.5, 12 - HalfWidth(7.5) - 0.02, 4.4, 1.1, 0.06, 0.3, Scorch, 4, 2.4, 2.4, 16, 8);
                        smoke.Add(SB(BellX + 1, Bells[1].Y, Bells[1].Z + 1));
                    }

                    // The parts fitted, each in its place and its rarity's colour.
                    if (Fitted(spec, "armour"))
                    {
                        // (Plates down both flanks, clear of the porthole and the windows above them.)
                        var c = Tint("armour");
                        foreach (var sd in new[] { -1, 1 })
                            foreach (var (x0, x1) in new[] { (5.0, 10.0), (10.5, 15.5), (21.0, 26.0), (26.5, 31.5) })
                            {
                                var y = 12 + sd * (HalfWidth((x0 + x1) / 2) - 0.05);
                                m.Rbox((x0 + x1) / 2, y, 4.9, (x1 - x0) / 2 - 0.1, 0.32, 1.6, c, 0, 6, 5, 20, 10);
                                foreach (var xr in new[] { x0 + 0.7, x1 - 0.7 }) foreach (var zr in new[] { 3.6, 6.2 }) m.Ball(xr, y + sd * 0.3, zr, 0.16, Slate, 0, 6, 4);
                            }
                    }
                    if (Fitted(spec, "shield"))
                    {
                        // (A dome on the bridge's roof, aft of the mast.)
                        var c = Tint("shield");
                        const double x = 12.6, y = 14;
                        var z = BridgeTop - 0.1;
                        m.Cyl(V(x, y, z - 0.4), V(x, y, z + 0.5), 1.1, 1, HullDark, 0, 16);
                        m.Orb(x, y, z + 0.5, 1.2, 1.2, 1, C(0.7, 0.85, 1), 1, true, 18, 8);
                        m.Ring(x, y, z + 0.55, 1.25, 0.14, 0, c, 0);
                    }
                    foreach (var (slot, sd) in new[] { ("port", -1), ("starboard", 1) })
                    {
                        if (!Fitted(spec, slot)) continue;
                        // (A turret on a sponson off the flank, under the deck's rail, its barrels laid forward.)
                        var c = Tint(slot);
                        var hw = HalfWidth(24.5);
                        var y = 12 + sd * (hw + 1.3);
                        m.Box(22, 27, sd < 0 ? y - 0.8 : 12 + hw - 0.3, sd < 0 ? 12 - hw + 0.3 : y + 0.8, 5.7, 6.6, HullDark, 0, 0.2);
                        m.Cyl(V(24.5, y, 6.6), V(24.5, y, 7.1), 1.1, 1, Slate, 0, 14);
                        m.Ball(24.5, y, 7.3, 1.05, c, 0, 14, 8);
                        foreach (var dy in new[] { -0.4, 0.4 }) m.Cyl(V(25.1, y + dy, 7.4), V(31, y + dy, 7.6), 0.2, 0.16, c, 0, 10);
                    }
                    if (Fitted(spec, "booster"))
                    {
                        // (Pods either side of the engine block, on struts, burning astern.)
                        var c = Tint("booster");
                        foreach (var sd in new[] { -1, 1 })
                        {
                            var y = 12 + sd * (5.58 + 1.7);
                            m.Loft(new[] { new Sec(-1, 1, 1, y: y, z: 5), new Sec(1, 1.3, 1.3, y: y, z: 5), new Sec(9, 1.2, 1.2, y: y, z: 5), new Sec(11.5, 0, 0, y: y, z: 5) }, c, 0, segs: 18);
                            foreach (var x in new[] { 2.0, 7.0 }) m.Cyl(V(x, 12 + sd * (HalfWidth(x) - 0.2), 5), V(x, y, 5), 0.3, 0.3, Slate, 0, 8);
                            m.Orb(-1.3, y, 4.1, 0.25, 0.9, 0.9, Engine, 2, false, 14, 8);
                            engines.Add(SB(-1.4, y, 5));
                        }
                    }
                    if (Fitted(spec, "warp"))
                    {
                        // (Two coils round the engine block, as broad as it and a little taller.)
                        var c = Tint("warp");
                        foreach (var x in new[] { 0.6, 3.0 })
                            m.With(
                                p => { var u = (p.Y * 40 - ZC) * 0.66 + ZC; return V(p.X, u / 40, p.Z); },
                                () =>
                                {
                                    m.Ring(x, 12, ZC, 5.58 + 0.9, 0.3, Math.PI / 2, c, 0);
                                    m.Ring(x, 12, ZC, 5.58 + 0.9, 0.12, Math.PI / 2, LampCyan, 2);
                                });
                    }
                });

            var deck = ZC + (DeckFloor - ZC) * k;
            return new CaptainShipBuild
            {
                Mesh = m.ToArray(),
                Smoke = smoke,
                Engines = engines,
                Deck = deck,
                Bridge = ZC + (BridgeTop - ZC) * k,
                RailY = 12 + RailOut * k,
                RailZ = ZC + (RailTop - ZC) * k + 0.05,
                Captain = V(33.4, 12, deck),
                Swell = k,
            };
        }

        static readonly Dictionary<string, ShipModel> mapModels = new Dictionary<string, ShipModel>();

        /// <summary>
        /// The ship with the Captain standing on its foredeck, as the menu shows him (CampaignBackdrop: there his coat's
        /// tails stream in the wind; here they are still): at the rail, facing ahead and a little out, his height 0.7 of
        /// the menu ship's 4.2.
        /// </summary>
        static float[] WithCaptain(float[] ship, V3 at) => Placed(ship, new[] { CaptainModels.CaptainModel(), CaptainModels.StreamerModel() }, B(at.X, at.Y, at.Z), B(20, 12, 0), 0.7 / 4.2, 1.3);

        /// <summary>
        /// The companions aboard [direction: the map's ship shows the friends on it too, both ships identical]: each where the
        /// menu's ship has them (CompanionModels.Places), as it stands, sits or flies there.
        /// </summary>
        static float[] WithCrew(float[] ship, IList<string> crew, CaptainShipBuild build)
        {
            var @out = ship;
            foreach (var id in crew)
            {
                if (id == null || !CompanionModels.Places.TryGetValue(id, out var pl)) continue;
                var spot = pl.On == "air" ? V(pl.X, pl.Y, pl.Z) : build.CrewAt(pl);
                @out = Placed(@out, new[] { CompanionModels.CompanionModel(id) }, B(spot.X, spot.Y, spot.Z), B(pl.Anchor.X, pl.Anchor.Y, pl.Anchor.Z), pl.Size / 4.2, pl.Turn);
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
                        Mesh = WithCrew(WithCaptain(s.Mesh, s.Captain), spec.Crew ?? new List<string>(), s),
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
