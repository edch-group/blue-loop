using System;
using System.Collections.Generic;
using static BlueLoop.Models.CaptainModels;

namespace BlueLoop.Models
{
    /// <summary>
    /// Where a companion is (box units of the ship) and how it is set there:
    /// - <c>rail</c>: sitting on the foredeck's near rail at <c>X</c>, its seat (<c>Anchor</c>) on the rail's top;
    /// - <c>dish</c>: crouched on the hull just fore of the sensor dish, at (<c>X</c>, <c>Y</c>), its feet (<c>Anchor</c>) on the hull's top;
    /// - <c>air</c>: flying free alongside at (<c>X</c>, <c>Y</c>, <c>Z</c>), its <c>Anchor</c> there, rising and falling on its own, not with the ship.
    /// <c>Turn</c> is which way it faces (radians about the vertical; 0 is toward the near side, where the camera is), <c>Size</c>
    /// its height against the Captain's 0.7.
    /// </summary>
    public class CompanionPlace
    {
        public string On;
        public double X, Y, Z;
        public V3 Anchor;
        public double Turn, Size;
    }

    /// <summary>
    /// The Captain's companions as the campaign menu's ship carries them (companion-models.ts) [direction: every character
    /// earnt sits or stands on the ship somewhere in the campaign menu with the Captain; the mechanic crouched over the
    /// antenna fixing it; the Aureline lancer sat with both legs dangling over the railing, facing the camera; the Xel'Naru
    /// flying alongside the ship, just below and to the left of it, both arms behind it, with its own bob], after their art:
    /// Kaelen, the Aureline lancer, sitting on the foredeck's near rail, his legs over the side, his lance leant on his
    /// shoulder; Mara Venn, the engineer, crouched on the hull over the sensor dish astern, its panel open, a wrench in it;
    /// Vey'Sharr, the Xel'Naru defector, flying alongside, leaning into the flight, arms swept back, its shards apart round a
    /// core of light. Box units as the Captain's (CaptainModels): built facing +y, about 40 tall.
    /// </summary>
    public static class CompanionModels
    {
        // (Materials: 0 plated metal, 1 glass or crystal, 2 glowing, 3 living, 4 dark gloss.)
        const int Metal = 0, GlassMat = 1, Glow = 2, Soft = 3, Gloss = 4;

        static V3 V(double x, double y, double z) => new V3(x, y, z);
        static Rgb C(double r, double g, double b) => new Rgb(r, g, b);
        static V3 Sub(V3 a, V3 b) => new V3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        static V3 Lerp(V3 a, V3 b, double t) => new V3(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t, a.Z + (b.Z - a.Z) * t);
        static double Dist(V3 a, V3 b) => Vec.Hypot(a.X - b.X, a.Y - b.Y, a.Z - b.Z);

        /// <summary>A limb: a tube through its points, tapering, a ball at each joint.</summary>
        static void Lim(Mesh m, IList<V3> pts, double r0, double r1, Rgb col, double mat)
        {
            m.Tube(pts, r0, r1, col, mat, 18);
            for (int i = 1; i < pts.Count - 1; i++) m.Ball(pts[i].X, pts[i].Y, pts[i].Z, r0 + ((r1 - r0) * i) / (pts.Count - 1), col, mat, 16, 10);
        }

        /// <summary>A rounded plate laid from <c>a</c> to <c>b</c> (its thickness <c>t</c> and width <c>w</c> about that line), turned <c>roll</c> about it.</summary>
        static void Plate(Mesh m, V3 a, V3 b, double w, double t, Rgb col, double mat, double roll = 0, double round = 3)
        {
            var L = Dist(a, b);
            m.Orient(a, Sub(b, a), () => m.Rbox(20 + L / 2, 12, 0, L / 2, w, t, col, mat, round, round, 24, 12), roll);
        }

        // ---- Kaelen, the Aureline lancer ----
        static readonly Rgb Ivory = C(0.88, 0.86, 0.8);
        static readonly Rgb IvoryShade = C(0.74, 0.72, 0.68);
        static readonly Rgb Gold = C(0.86, 0.64, 0.28);
        static readonly Rgb Alien = C(0.7, 0.71, 0.74);
        static readonly Rgb AlienShade = C(0.58, 0.59, 0.63);
        static readonly Rgb Undersuit = C(0.3, 0.27, 0.3);
        static readonly Rgb Crimson = C(0.52, 0.12, 0.12);
        static readonly Rgb CrimsonDark = C(0.36, 0.08, 0.09);
        static readonly Rgb LanceLight = C(1, 0.8, 0.38);
        static readonly Rgb Eye = C(0.1, 0.14, 0.32);
        /// <summary>How far Kaelen slouches forward over his lap.</summary>
        const double Slouch = -0.2;

        /// <summary>
        /// Kaelen, sitting easy on the rail [direction: more relaxed, slouched, spear facing down, one leg on the railing]: his
        /// seat at (20, 12, 20), the left leg hanging over the side, the right drawn up with its foot on the rail, his forearm
        /// over that knee; slouched forward, head low; the lance held loosely at his left side, its blade pointing down over the
        /// side; his cape falling behind him onto the deck.
        /// </summary>
        static float[] LancerModel()
        {
            var m = new Mesh();
            // Legs: white plate over a dark undersuit; a gold-rimmed knee cop; long greaves; pointed sabatons.
            // (The left hangs over the side; the right is drawn up, its foot set on the rail beside him, toes along it.)
            var legs = new[]
            {
                (V(18.5, 12.6, 20.4), V(18.3, 22, 20.7), V(18.1, 23.6, 8.6), V(0, 2.6, -1.4)),
                (V(21.5, 12.6, 20.6), V(24, 16.4, 29), V(27.6, 12.6, 21.4), V(2.8, 0.3, -0.5)),
            };
            foreach (var (hip, knee, ankle, toeDir) in legs)
            {
                Lim(m, new[] { hip, knee, ankle }, 1.2, 0.9, Undersuit, Soft);
                // Cuisse over the thigh, its top edge rolled in gold.
                Plate(m, Lerp(hip, knee, 0.08), Lerp(hip, knee, 0.86), 1.5, 1.3, Ivory, Metal);
                Plate(m, Lerp(hip, knee, 0.08), Lerp(hip, knee, 0.15), 1.6, 1.4, Gold, Metal);
                // Knee cop: a domed plate, a gold rim.
                m.Rbox(knee.X, knee.Y + 0.45, knee.Z + 0.1, 1.25, 0.65, 1.2, Ivory, Metal, 2.4, 2.4);
                m.Ring(knee.X, knee.Y + 0.95, knee.Z + 0.1, 0.75, 0.13, Math.PI / 2, Gold, Metal);
                // Greave down the shin, a gold ridge down its front.
                Plate(m, Lerp(knee, ankle, 0.1), Lerp(knee, ankle, 0.94), 1.3, 1.15, Ivory, Metal);
                Plate(m, Lerp(knee, ankle, 0.14), Lerp(knee, ankle, 0.9), 0.22, 1.22, Gold, Metal);
                // Sabaton: lames over the foot, pointed at the toe (the foot hanging, toes down a little).
                var toe = V(ankle.X + toeDir.X, ankle.Y + toeDir.Y, ankle.Z + toeDir.Z);
                Plate(m, V(ankle.X - toeDir.X * 0.15, ankle.Y - toeDir.Y * 0.15, ankle.Z - 0.2), toe, 1.05, 0.8, IvoryShade, Metal);
                m.Ball(ankle.X, ankle.Y, ankle.Z, 1.1, Ivory, Metal, 14, 9);
            }
            // Hips: a fauld of overlapping lames, tassets over the thighs, a gold belt with a sun boss.
            m.Rbox(20, 12.2, 20.6, 3.5, 2.5, 1.6, Undersuit, Soft, 2.4, 2.4);
            for (int i = 0; i < 3; i++) m.Rbox(20, 12.4 + i * 0.1, 22.9 - i * 0.9, 3.55 - i * 0.05, 2.45, 0.55, Ivory, Metal, 2.6, 4);
            foreach (var sd in new[] { -1, 1 }) Plate(m, V(20 + sd * 1.8, 13.4, 21.6), V(20 + sd * 1.9, 17.2, 21.2), 1.55, 0.45, Ivory, Metal, 0, 4);
            m.Rbox(20, 12.4, 23.8, 3.6, 2.55, 0.5, Gold, Metal, 2.6, 6);
            m.Ball(20, 14.95, 23.8, 0.55, LanceLight, Glow, 10, 6);
            // Leaning back [direction: Kaelen leaning back a little, at ease, not stiff]: the body above the hips tipped back.
            Turned(m, V(20, 12.2, 22), 'x', Slouch, () =>
            {
                // The cuirass: a narrow waist, the chest swelling over it, sculpted plates, a gold sunburst between.
                m.Rbox(20, 12.2, 26, 2.4, 1.8, 2.4, IvoryShade, Metal, 2.6, 2.6);
                m.Rbox(20, 12.3, 29.8, 3.2, 2.2, 3.2, Ivory, Metal, 2.4, 2.4);
                foreach (var sd in new[] { -1, 1 }) m.Rbox(20 + sd * 1.4, 13.85, 30.5, 1.35, 0.7, 1.8, Ivory, Metal, 2.2, 2.2);
                m.Rbox(20, 14.45, 29.6, 0.3, 0.25, 2.2, Gold, Metal, 3, 3);
                for (int i = 0; i < 8; i++)
                {
                    var a = (i / 8.0) * Math.PI * 2;
                    Plate(m, V(20, 14.55, 29.4), V(20 + Math.Cos(a) * 1.2, 14.55, 29.4 + Math.Sin(a) * 1.2), 0.16, 0.12, Gold, Metal);
                }
                m.Ball(20, 14.65, 29.4, 0.4, LanceLight, Glow, 10, 6);
                // Gorget: a high gold collar.
                m.Cyl(V(20, 12.2, 32.2), V(20, 12.2, 33.6), 1.7, 1.45, Gold, Metal, 20);
                // Pauldrons: three lames each, broad and swept up, gold-edged.
                foreach (var sd in new[] { -1, 1 })
                {
                    for (int i = 0; i < 3; i++)
                    {
                        double x = 20 + sd * (3.4 + i * 0.3), z = 32.8 - i * 1;
                        var ii = i;
                        Turned(m, V(x, 12.2, z), 'y', sd * (0.4 + i * 0.12), () =>
                        {
                            m.Rbox(x, 12.2, z, 1.6 - ii * 0.12, 1.9 - ii * 0.1, 0.6, Ivory, Metal, 2.4, 3);
                            m.Rbox(x, 12.2, z - 0.48, 1.65 - ii * 0.12, 1.95 - ii * 0.1, 0.14, Gold, Metal, 2.4, 3);
                        });
                    }
                }
                // A long slim grey neck; the head, smooth and long, its crown swept back; one great eye; a narrow lipless face.
                m.Cyl(V(20, 12.2, 33.4), V(20, 12.5, 35.6), 0.8, 0.72, Alien, Soft, 14);
                Turned(m, V(20, 12.5, 35.8), 'x', 0.5, () =>
                {
                    Turned(m, V(20, 12.3, 37.6), 'x', -0.5, () => m.Rbox(20, 11.6, 38.6, 1.75, 2.9, 1.95, Alien, Soft, 2, 2, 30, 18));
                    m.Rbox(20, 13, 37.2, 1.6, 1.45, 2.1, Alien, Soft, 2, 2, 28, 16);
                    m.Rbox(20, 13.4, 35.6, 0.95, 1, 1, AlienShade, Soft, 2, 2, 18, 10);
                    m.Ball(20, 14.2, 37.7, 0.85, Eye, GlassMat, 18, 12);
                    m.Ball(20, 14.85, 37.75, 0.24, C(0.85, 0.92, 1), Glow, 8, 5);
                    m.Ring(20, 14.25, 37.7, 0.9, 0.13, Math.PI / 2, AlienShade, Soft);
                    m.Rbox(20, 14.3, 35.9, 0.45, 0.08, 0.05, AlienShade, Soft, 2, 2, 10, 6);
                    // The halo, round his head at the brow, tipped back with it.
                    m.Ring(20, 12.2, 39.4, 3, 0.2, 0.25, Gold, Glow);
                });
            });
            // A crimson tabard from the belt, over his lap and down between his knees, hemmed in gold.
            var tab = new List<IList<V3>>();
            for (int r = 0; r <= 6; r++)
            {
                var t = r / 6.0;
                var y = t < 0.6 ? 14.7 + (t / 0.6) * 5.6 : 20.3 + (t - 0.6) * 1.5;
                var z = t < 0.6 ? 22.6 - (t / 0.6) * 0.5 : 22.1 - ((t - 0.6) / 0.4) * 6.5;
                var row = new List<V3>();
                foreach (var dx in new[] { -1.3, -0.45, 0.45, 1.3 }) row.Add(V(20 + dx * (1 - t * 0.15), y + Math.Abs(dx) * -0.1, z + (t < 0.6 ? 0.15 * (1.3 - Math.Abs(dx)) : 0)));
                tab.Add(row);
            }
            Cloth(m, tab, Crimson, Gold);
            V3 SlouchAt(V3 p)
            {
                double c = Math.Cos(Slouch), sn = Math.Sin(Slouch), dy = p.Y - 12.2, dz = p.Z - 22;
                return V(p.X, 12.2 + dy * c + dz * sn, 22 - dy * sn + dz * c);
            }
            // The cape: from the shoulders, down his back and over the rail onto the deck behind him.
            var grid = new List<IList<V3>>();
            for (int r = 0; r <= 10; r++)
            {
                var row = new List<V3>();
                for (int c = 0; c <= 8; c++)
                {
                    double t = r / 10.0, a = Math.PI * (0.15 + 0.7 * (c / 8.0));
                    var fold = 0.35 * Math.Sin(c * 1.7 + t * 4) * t;
                    var y = 10.6 - Math.Sin(a) * 1.6 - (t > 0.45 ? (t - 0.45) * 9 : 0) + fold;
                    var at = V(20 - Math.Cos(a) * (4 + t * 1.6), y, Math.Max(14.3, 32.2 - t * 26));
                    // (Its top with his shoulders, leaning back.)
                    row.Add(at.Z > 22 ? SlouchAt(at) : at);
                }
                grid.Add(row);
            }
            Cloth(m, grid, Crimson, CrimsonDark);
            // Arms, from where his shoulders went as he leant back: the right reaching back, its hand braced on the rail behind
            // him [direction: the arm not holding the spear behind him]; the left down at his side, holding the lance loosely,
            // its blade pointing down over the side.
            void Arm(V3 sh, V3 el, V3 wr)
            {
                Lim(m, new[] { sh, el, wr }, 0.9, 0.75, Undersuit, Soft);
                Plate(m, Lerp(sh, el, 0.15), Lerp(sh, el, 0.9), 1.1, 1.05, Ivory, Metal);
                Plate(m, Lerp(el, wr, 0.1), Lerp(el, wr, 0.92), 1, 0.95, Ivory, Metal);
                Plate(m, Lerp(el, wr, 0.75), Lerp(el, wr, 0.9), 1.06, 1.01, Gold, Metal);
                m.Rbox(el.X, el.Y - 0.4, el.Z, 0.8, 0.55, 0.9, Ivory, Metal, 2.4, 2.4);
            }
            var rw = V(24.4, 7.6, 20.6);
            Arm(SlouchAt(V(23.6, 12.2, 31.6)), V(25.6, 8.6, 26), rw);
            // (The hand flat on the rail, fingers back.)
            m.Rbox(rw.X, rw.Y - 0.8, rw.Z - 0.5, 0.75, 1.1, 0.45, Alien, Soft, 2.4, 2.4);
            var lw = V(15.2, 15.4, 21.8);
            Arm(SlouchAt(V(16.4, 12.2, 31.6)), V(15.2, 12.8, 26.6), lw);
            m.Rbox(lw.X, lw.Y + 0.1, lw.Z, 0.85, 0.9, 0.95, IvoryShade, Metal, 2.6, 2.6);
            // The lance through that hand, its butt up behind his shoulder, its leaf of light hanging down past the hull.
            var d = V(0.05, 0.42, -1);
            var dl = Vec.Hypot(d.X, d.Y, d.Z);
            V3 At(double k) => V(lw.X + (d.X / dl) * k, lw.Y + (d.Y / dl) * k, lw.Z + (d.Z / dl) * k);
            V3 butt = At(-10), head = At(22);
            m.Cyl(butt, head, 0.28, 0.26, Ivory, Metal, 12);
            foreach (var t in new[] { 0.02, 0.5, 0.97 }) m.Cyl(Lerp(butt, head, t - 0.012), Lerp(butt, head, t + 0.012), 0.44, 0.44, Gold, Metal, 12);
            m.Shard(head, d, 7, 1.05, LanceLight, Glow);
            return m.ToArray();
        }

        // ---- Mara Venn, the engineer ----
        static readonly Rgb WorkCoat = C(0.34, 0.29, 0.24);
        static readonly Rgb WorkShade = C(0.27, 0.23, 0.2);
        static readonly Rgb Overall = C(0.28, 0.29, 0.33);
        static readonly Rgb Human = C(0.82, 0.63, 0.53);
        static readonly Rgb HumanShade = C(0.7, 0.52, 0.44);
        static readonly Rgb GreyHair = C(0.56, 0.54, 0.52);
        static readonly Rgb Goggle = C(0.2, 0.3, 0.34);
        static readonly Rgb Brass = C(0.74, 0.56, 0.3);
        static readonly Rgb Amber = C(1, 0.62, 0.22);
        static readonly Rgb Spark = C(1, 0.84, 0.5);
        static readonly Rgb Steel = C(0.62, 0.64, 0.68);
        static readonly Rgb Boots = C(0.27, 0.21, 0.17);
        static readonly Rgb Belt = C(0.36, 0.25, 0.17);

        /// <summary>Where Mara's hands are at work, in her own box units (the dish's back, its panel open).</summary>
        static readonly V3 MaraWork = new V3(20, 20.6, 21.5);

        /// <summary>
        /// Mara, crouched deep on the hull over the sensor dish: her left foot planted ahead, her right knee down, leaning in; her left
        /// hand holding the mast's panel open, her right working a wrench inside it, sparks; her head bowed into the work.
        /// </summary>
        static float[] EngineerModel()
        {
            var m = new Mesh();
            // Legs: the left in a deep crouch, its knee by her chest; the right knee down on the roof, on her toes.
            Lim(m, new[] { V(18.5, 12.2, 9.4), V(18.2, 16.8, 12.6), V(18.1, 16.4, 2.2) }, 1.6, 1.25, Overall, Soft);
            Lim(m, new[] { V(21.5, 11.8, 9.2), V(21.8, 15.8, 2.4), V(21.8, 10.6, 2.6) }, 1.6, 1.25, Overall, Soft);
            // Knee pads; boots, thick-soled.
            m.Ball(18.2, 17.9, 12.8, 1.2, Belt, Soft, 12, 8);
            m.Ball(21.8, 16.9, 2.5, 1.15, Belt, Soft, 12, 8);
            m.Rbox(18.1, 17.3, 1.1, 1.35, 2.4, 1.15, Boots, Soft, 3, 3);
            m.Rbox(18.1, 17.5, 0.2, 1.45, 2.5, 0.3, C(0.14, 0.12, 0.11), Soft, 4, 4);
            Turned(m, V(21.8, 10.4, 2), 'x', 0.7, () => m.Rbox(21.8, 9.4, 2, 1.25, 2, 1.1, Boots, Soft, 3, 3));
            // Leaning in, from the hips.
            Turned(m, V(20, 12, 9.6), 'x', 0.62, () =>
            {
                m.Rbox(20, 12, 10.4, 3.4, 2.3, 2, Overall, Soft, 2.4, 2.4);
                // A tool belt slung round: pouches, a hammer, a coil of cable.
                m.Rbox(20, 12, 12.3, 3.55, 2.45, 0.7, Belt, Soft, 2.6, 6);
                foreach (var (dx, dy) in new[] { (-2.8, 1.4), (2.8, 1.4), (3.3, -0.6) }) m.Rbox(20 + dx, 12 + dy, 11.6, 0.85, 0.65, 1.15, Belt, Soft, 3, 3);
                m.Cyl(V(23.6, 11.4, 12.4), V(24.2, 10.8, 8.8), 0.18, 0.18, Steel, Metal, 8);
                m.Ring(16.4, 11.2, 11.4, 1, 0.28, Math.PI / 2, C(0.18, 0.2, 0.22), Gloss);
                // The work coat: heavy, its collar up, its skirt falling round her hips.
                m.Rbox(20, 12, 16.6, 3.7, 2.45, 4.2, WorkCoat, Soft, 2.4, 2.6);
                m.Rbox(20, 11.8, 20.8, 3.2, 2.1, 1.3, WorkCoat, Soft, 2.2, 3);
                m.Rbox(20, 11.2, 21.6, 2.4, 1.4, 1.1, WorkShade, Soft, 2, 3);
                foreach (var sd in new[] { -1, 1 })
                {
                    m.Ball(20 + sd * 3.6, 12, 19.6, 1.65, WorkCoat, Soft, 16, 10);
                    m.Rbox(20 + sd * 2.6, 13.9, 15.8, 0.9, 0.5, 3.4, WorkShade, Soft, 2.6, 3);
                }
                m.Rbox(20, 10.4, 10.6, 3.6, 1.2, 2.8, WorkShade, Soft, 2.4, 3);
                // Her head, bowed into the work: grey hair cropped short, goggles pushed up on her brow.
                Turned(m, V(20, 12.4, 22), 'x', 0.35, () =>
                {
                    m.Cyl(V(20, 12.2, 21.4), V(20, 12.5, 23.2), 0.85, 0.8, Human, Soft, 12);
                    m.Rbox(20, 12.8, 25.2, 1.75, 2, 2.3, Human, Soft, 2, 2, 28, 16);
                    m.Rbox(20, 13.1, 23.9, 1.35, 1.7, 1, HumanShade, Soft, 2, 2, 20, 10);
                    m.Rbox(20, 14.75, 25.1, 0.28, 0.4, 0.55, HumanShade, Soft, 2, 2, 10, 6);
                    foreach (var sd in new[] { -1, 1 }) m.Rbox(20 + sd * 0.7, 14.65, 25.6, 0.24, 0.1, 0.13, C(0.1, 0.09, 0.1), 0, 2, 2, 10, 6);
                    m.Rbox(20, 12.4, 26.5, 1.88, 2.05, 1.25, GreyHair, Soft, 2, 2, 24, 12);
                    m.Rbox(20, 11.4, 25.2, 1.75, 1.15, 1.9, GreyHair, Soft, 2, 2, 20, 10);
                    foreach (var sd in new[] { -1, 1 })
                    {
                        m.Ball(20 + sd * 0.8, 14.55, 26.6, 0.58, Goggle, GlassMat, 12, 8);
                        m.Rbox(20 + sd * 0.8, 14.3, 26.6, 0.68, 0.32, 0.66, Brass, Metal, 3, 3);
                    }
                    m.Rbox(20, 12.6, 26.6, 1.95, 2.1, 0.2, Belt, Soft, 2, 3, 24, 6);
                });
            });
            // Her left hand up holding the mast's panel open; her right in it with a wrench. (Each arm from where its shoulder
            // went as she leant in.)
            V3 Lean(V3 p)
            {
                double a = 0.62, c = Math.Cos(a), sn = Math.Sin(a), dy = p.Y - 12, dz = p.Z - 9.6;
                return V(p.X, 12 + dy * c + dz * sn, 9.6 - dy * sn + dz * c);
            }
            V3 lsh = Lean(V(16.4, 12, 19.6)), rsh = Lean(V(23.6, 12, 19.6));
            double wx = MaraWork.X, wy = MaraWork.Y, wz = MaraWork.Z;
            Lim(m, new[] { lsh, V(15.6, 17.4, 19.6), V(18.4, wy - 0.6, wz + 1.6) }, 1.05, 0.9, WorkShade, Soft);
            m.Rbox(16.4, 16.8, 19.4, 0.95, 1, 1.25, Amber, Glow, 3, 3);
            m.Ball(18.6, wy - 0.3, wz + 1.7, 0.85, Human, Soft, 12, 8);
            Lim(m, new[] { rsh, V(24.2, 17, 16.6), V(21.4, wy - 0.8, wz - 1.2) }, 1.05, 0.9, WorkShade, Soft);
            m.Ball(21.3, wy - 0.5, wz - 1.2, 0.85, Human, Soft, 12, 8);
            // The panel, swung open off the mast, in her hand; the wrench in the works; sparks.
            Plate(m, V(18.6, wy + 0.1, wz + 2.8), V(18.6, wy + 0.1, wz - 0.4), 1.5, 0.12, Steel, Metal, Math.PI / 2, 4);
            m.Cyl(V(21.3, wy - 0.5, wz - 1.2), V(wx + 0.4, wy + 0.9, wz - 0.2), 0.24, 0.24, Steel, Metal, 8);
            m.Rbox(wx + 0.5, wy + 1, wz - 0.1, 0.55, 0.5, 0.25, Steel, Metal, 3, 3);
            foreach (var (dx, dy, dz, r) in new[] { (0.9, 1.3, 0.4, 0.22), (1.6, 0.6, 1.1, 0.14), (0.2, 0.4, 1.4, 0.12), (1.8, 1.4, -0.5, 0.1), (-0.4, 1.2, 0.9, 0.1) })
                m.Ball(wx + dx, wy + dy, wz + dz, r, Spark, Glow, 6, 4);
            // A toolbox open on the roof beside her.
            m.Rbox(25.4, 12.6, 1.5, 2, 1.3, 1.5, C(0.55, 0.2, 0.16), Metal, 4, 4);
            m.Rbox(25.4, 12.6, 3.05, 2.05, 1.35, 0.12, C(0.16, 0.15, 0.16), Metal, 4, 4);
            m.Cyl(V(24.4, 12.6, 3.2), V(26.4, 12.6, 3.2), 0.14, 0.14, Steel, Metal, 6);
            return m.ToArray();
        }

        // ---- Vey'Sharr, the Xel'Naru defector ----
        static readonly Rgb ShardCol = C(0.62, 0.48, 0.86);
        static readonly Rgb ShardDeep = C(0.44, 0.32, 0.7);
        static readonly Rgb ShardPale = C(0.76, 0.66, 0.95);
        static readonly Rgb Core = C(0.94, 0.9, 1);
        static readonly Rgb Scrap = C(0.27, 0.28, 0.33);

        /// <summary>
        /// Vey'Sharr in flight: leaning hard into it, both arms swept back behind it (the right's forearm still a blade, along
        /// its side), its legs trailing; every shard apart from the next, the core blazing in its chest.
        /// </summary>
        static float[] DefectorModel()
        {
            var m = new Mesh();
            // (Heavy shards, as the art's: broad slabs of crystal, not splinters.)
            void Sh(V3 @base, V3 dir, double l, double r, Rgb? col = null, double roll = 0) => m.Shard(@base, dir, l * 1.05, r * 1.85, col ?? ShardCol, GlassMat, roll);
            Turned(m, V(20, 12, 24), 'x', 0.8, () =>
            {
                m.Ball(20, 12.4, 28, 1.6, Core, Glow, 16, 10);
                // Ribs of shards curving out and back from the core, a gap between each; a breastbone; shoulders.
                foreach (var sd in new[] { -1, 1 })
                {
                    for (int i = 0; i < 3; i++) Sh(V(20 + sd * 1.7, 13, 30 - i * 1.9), V(sd, 0.2, -0.15 - i * 0.25), 3.2 - i * 0.4, 0.85, i % 2 != 0 ? ShardDeep : ShardCol, i);
                    Sh(V(20 + sd * 2.4, 12, 32.6), V(sd, -0.3, 0.25), 3.2, 1.25, ShardCol, sd);
                }
                Sh(V(20, 13.4, 31.6), V(0, 0.25, 1), 2.4, 0.7, ShardDeep);
                // A breastplate of slabs over the core, and a broad back.
                foreach (var (dx, dz, c) in new[] { (-1.6, 30.6, ShardCol), (1.6, 30.6, ShardPale), (-1.4, 26.4, ShardDeep), (1.4, 26.4, ShardCol) }) Sh(V(20 + dx * 0.4, 13.2, dz), V(dx, 0.9, (dz - 28.5) * 0.3), 2.6, 1, c);
                m.Rbox(20, 10.8, 29.4, 3, 1.4, 3.2, ShardDeep, GlassMat, 3, 3);
                Sh(V(20, 13.2, 26.2), V(0, 0.15, -1), 2.4, 0.9, ShardCol);
                // Back shards, like folded wings.
                foreach (var sd in new[] { -1, 1 }) Sh(V(20 + sd * 1.2, 10.4, 30.6), V(sd * 0.4, -1, 0.5), 4.6, 0.9, ShardDeep, sd);
                // Arms swept back behind it: upper arm, forearm, a fist of small shards; the right's forearm a long blade.
                foreach (var sd in new[] { -1, 1 })
                {
                    Sh(V(20 + sd * 4, 11.4, 31.2), V(sd * 0.25, -0.75, -0.55), 4.4, 0.85, ShardCol);
                    if (sd < 0)
                    {
                        Sh(V(16.6, 7.6, 28.4), V(-0.1, -0.85, -0.45), 3.8, 0.75, ShardDeep);
                        Sh(V(16.3, 4.4, 26.6), V(0, -0.8, -0.4), 1.8, 0.85, ShardCol);
                    }
                    else
                    {
                        Sh(V(23.4, 7.6, 28.4), V(0.05, -0.9, -0.4), 12, 1.15, ShardPale);
                        // The scrap of the ship's cloth tied round it, streaming back.
                        m.Ring(23.6, 7.4, 28.4, 0.95, 0.26, 1.1, Scrap, Soft);
                        m.Tube(new[] { V(23.8, 7, 28.8), V(24.4, 4.4, 29.6), V(24.8, 1.6, 29.6) }, 0.28, 0.1, Scrap, Soft, 8);
                    }
                }
                // Hips and legs trailing behind, apart, tapering to points.
                Sh(V(20, 12, 23.2), V(0, -0.1, -1), 3, 1.6, ShardDeep);
                foreach (var sd in new[] { -1, 1 })
                {
                    Sh(V(20 + sd * 1.6, 11.8, 20.6), V(sd * 0.1, -0.3, -1), 5.4, 1.1, ShardCol, sd);
                    Sh(V(20 + sd * 2, 10.2, 14.6), V(sd * 0.05, -0.55, -1), 5, 0.95, ShardDeep, sd);
                    Sh(V(20 + sd * 2.1, 7.6, 9.6), V(0, -0.75, -1), 4.4, 0.75, ShardCol, sd);
                }
                // The head, lifted to look ahead: a crown of sharp shards swept back round one burning slit of light.
                Turned(m, V(20, 12.4, 35), 'x', -0.55, () =>
                {
                    m.Rbox(20, 13.1, 37, 1.1, 0.4, 0.25, Core, Glow, 2, 2, 12, 6);
                    for (int i = 0; i < 7; i++)
                    {
                        var a = Math.PI * (0.1 + 0.8 * (i / 6.0));
                        Sh(V(20 + Math.Cos(a) * 1.4, 12.4, 36.4 + Math.Sin(a) * 0.6), V(Math.Cos(a) * 0.6, -0.5, 1), 3.2 + (i == 3 ? 1.8 : 0), 0.6, i % 2 != 0 ? ShardCol : ShardDeep, i);
                    }
                    Sh(V(20, 12.6, 35), V(0, 0, -1), 1.6, 1.2, ShardDeep);
                });
            });
            return m.ToArray();
        }

        /// <summary>A plainly built figure's colours (see Figure).</summary>
        class FigureLook
        {
            public Rgb Body, Cloak, Skin, Trim;
            public bool Hood;
            public Rgb? Halo;
        }

        /// <summary>
        /// A standing figure, plainly built [direction: placeholders for the Lost Races' companions for now]: legs, a cloaked
        /// body, arms at its sides, a head (a hood over it, or a glow above it), in its colours; its feet at (20, 12, 0).
        /// </summary>
        static float[] Figure(FigureLook o)
        {
            var m = new Mesh();
            foreach (var sd in new[] { -1, 1 }) Lim(m, new[] { V(20 + sd * 1.4, 12, 1.2), V(20 + sd * 1.4, 12.3, 8), V(20 + sd * 1.3, 12, 14) }, 1.2, 1.4, o.Body, Soft);
            m.Rbox(20, 12, 18.4, 3.2, 2.1, 4.8, o.Body, Soft, 2.4, 2.6);
            m.Rbox(20, 12, 13.6, 3.3, 2.2, 0.6, o.Trim, Metal, 2.6, 6);
            // A cloak from the shoulders to the ankles behind.
            m.Rbox(20, 13.6, 12.2, 3.6, 0.6, 10.6, o.Cloak, Soft, 2, 3);
            foreach (var sd in new[] { -1, 1 })
            {
                m.Ball(20 + sd * 3.3, 12, 22.2, 1.4, o.Cloak, Soft, 14, 9);
                Lim(m, new[] { V(20 + sd * 3.4, 12, 22), V(20 + sd * 3.9, 11.6, 17.4), V(20 + sd * 3.8, 11.2, 13.2) }, 0.95, 0.8, o.Body, Soft);
            }
            m.Cyl(V(20, 12, 23), V(20, 12, 24.4), 0.9, 0.85, o.Skin, Soft, 12);
            m.Ball(20, 12, 26.6, 2.3, o.Skin, Soft, 18, 12);
            if (o.Hood) m.Ball(20, 12.6, 27.2, 2.75, o.Cloak, Soft, 18, 12);
            m.Ball(19.1, 10.1, 26.8, 0.38, o.Trim, Glow, 8, 6);
            m.Ball(20.9, 10.1, 26.8, 0.38, o.Trim, Glow, 8, 6);
            if (o.Halo is Rgb halo) m.Ring(20, 12, 30.4, 2.4, 0.3, 0, halo, Glow);
            return m.ToArray();
        }

        /// <summary>A companion's figure, built once.</summary>
        static readonly Dictionary<string, float[]> Built = new Dictionary<string, float[]>();

        /// <summary>A companion's figure (lancer, engineer, defector, shade, seer; any other, the seer's), built once.</summary>
        public static float[] CompanionModel(string id)
        {
            lock (Built)
            {
                if (!Built.TryGetValue(id, out var b))
                {
                    b = id == "lancer" ? LancerModel()
                        : id == "engineer" ? EngineerModel()
                        : id == "defector" ? DefectorModel()
                        // Nyss: a hooded Nyxari exile in black and violet, her eyes lit.
                        : id == "shade" ? Figure(new FigureLook { Body = C(0.12, 0.1, 0.16), Cloak = C(0.2, 0.12, 0.3), Skin = C(0.42, 0.4, 0.5), Trim = C(0.7, 0.45, 1), Hood = true })
                        // Ilyra: a Seren star-reader in pale blue robes, a ring of starlight over her head.
                        : Figure(new FigureLook { Body = C(0.72, 0.78, 0.9), Cloak = C(0.36, 0.46, 0.72), Skin = C(0.8, 0.82, 0.92), Trim = C(0.75, 0.88, 1), Halo = C(0.85, 0.92, 1) });
                    Built[id] = b;
                }
                return b;
            }
        }

        /// <summary>
        /// Where each is on the ship and how it is set there (see CompanionPlace): on the made hull (CaptainShip), the
        /// engineer just fore of the dish, the shade and the seer on the bridge's roof either side of its mast.
        /// </summary>
        public static readonly Dictionary<string, CompanionPlace> Places = new Dictionary<string, CompanionPlace>
        {
            ["lancer"] = new CompanionPlace { On = "rail", X = 25.2, Y = 0, Z = 0, Anchor = new V3(20, 12, 19.2), Turn = -0.4, Size = 0.8 },
            ["engineer"] = new CompanionPlace { On = "dish", X = 10, Y = 13, Z = 0, Anchor = new V3(20, 13, 0), Turn = -1.25, Size = 0.66 },
            ["defector"] = new CompanionPlace { On = "air", X = 5, Y = 19, Z = -0.6, Anchor = new V3(20, 12, 24), Turn = Math.PI / 2 - 0.25, Size = 1 },
            ["shade"] = new CompanionPlace { On = "dish", X = 13.1, Y = 10.8, Z = 0, Anchor = new V3(20, 12, 0), Turn = -0.6, Size = 0.66 },
            ["seer"] = new CompanionPlace { On = "dish", X = 17.3, Y = 13.3, Z = 0, Anchor = new V3(20, 12, 0), Turn = -0.2, Size = 0.66 },
        };
    }
}
