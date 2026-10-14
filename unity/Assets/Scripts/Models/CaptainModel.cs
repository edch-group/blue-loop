using System;
using System.Collections.Generic;

namespace BlueLoop.Models
{
    /// <summary>
    /// The Captain's model (captain-model.ts), wherever he stands: on the campaign menu's ship (base3d.ts, his coat's tails
    /// streaming as a part of their own) and on the map's (CaptainShip, at rest) [direction: the Captain standing atop the
    /// campaign map's ship too]. Box units as the ships' (Ship3d): 40 to the model's 1.
    /// </summary>
    public static class CaptainModels
    {
        static V3 Sub3(V3 a, V3 b) => new V3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);

        static V3 Norm3(V3 a)
        {
            var l = Vec.Hypot(a.X, a.Y, a.Z);
            if (l == 0 || double.IsNaN(l)) l = 1;
            return new V3(a.X / l, a.Y / l, a.Z / l);
        }

        /// <summary>A point of the box (x along, y across, z up) in the model's own axes.</summary>
        static V3 B(double x, double y, double z) => new V3((x - 20) / 40, z / 40, (y - 12) / 40);
        static V3 V(double x, double y, double z) => new V3(x, y, z);
        static Rgb C(double r, double g, double b) => new Rgb(r, g, b);

        // ---- The Captain ----
        static readonly Rgb Coat = C(0.27, 0.28, 0.33);
        static readonly Rgb CoatShade = C(0.21, 0.22, 0.27);
        static readonly Rgb Lining = C(0.24, 0.36, 0.4);
        static readonly Rgb Tunic = C(0.34, 0.37, 0.44);
        static readonly Rgb Leather = C(0.46, 0.33, 0.23);
        static readonly Rgb Strap = C(0.3, 0.21, 0.15);
        static readonly Rgb Buckle = C(0.74, 0.68, 0.58);
        static readonly Rgb Scarf = C(0.52, 0.55, 0.62);
        static readonly Rgb Trousers = C(0.22, 0.22, 0.26);
        static readonly Rgb Boot = C(0.3, 0.24, 0.2);
        static readonly Rgb Glove = C(0.2, 0.17, 0.16);
        static readonly Rgb Skin = C(0.84, 0.66, 0.54);
        static readonly Rgb SkinShade = C(0.74, 0.55, 0.45);
        static readonly Rgb Hair = C(0.15, 0.12, 0.11);
        static readonly Rgb Stubble = C(0.3, 0.24, 0.21);
        static readonly Rgb Bandage = C(0.92, 0.89, 0.83);
        static readonly Rgb Plate = C(0.62, 0.66, 0.74);
        static readonly Rgb Ink = C(0.1, 0.09, 0.1);
        // (Cloth, leather, skin and hair are soft, matt: the "living" material; metal is plated; the blade glows.)
        const int Soft = 3;

        /// <summary>Points along a limb (box units) and their joint balls: a tube from each to the next, tapering.</summary>
        public static void Limb(Mesh m, IList<V3> pts, double r0, double r1, Rgb col)
        {
            m.Tube(pts, r0, r1, col, Soft, 18);
            for (int i = 1; i < pts.Count - 1; i++) m.Ball(pts[i].X, pts[i].Y, pts[i].Z, r0 + ((r1 - r0) * i) / (pts.Count - 1), col, Soft, 16, 10);
        }

        /// <summary>Turned about a line through a point (box units) along the model's x, y or z ('x', 'y', 'z'): for a feature's own angle.</summary>
        public static void Turned(Mesh m, V3 at, char axis, double a, System.Action build)
        {
            var c = B(at.X, at.Y, at.Z);
            double cs = Math.Cos(a), sn = Math.Sin(a);
            m.With(p =>
            {
                var d = Sub3(p, c);
                // (Model axes: box x → x, box z → y, box y → z.)
                if (axis == 'x') return V(p.X, c.Y + d.Y * cs - d.Z * sn, c.Z + d.Y * sn + d.Z * cs);
                if (axis == 'z') return V(c.X + d.X * cs + d.Z * sn, p.Y, c.Z - d.X * sn + d.Z * cs);
                return V(c.X + d.X * cs - d.Y * sn, c.Y + d.X * sn + d.Y * cs, p.Z);
            }, build);
        }

        /// <summary>
        /// The Captain, standing at the rail, facing ahead with the ship [direction: facing forwards with the ship, one leg up on
        /// the railing, no sword]: the right boot up on the rail, that forearm across its knee, the left fist on his hip;
        /// after the art otherwise: a long coat open over a fitted tunic, a leather harness and belt, a steel plate on the
        /// right shoulder, a scarf, worn boots; weathered: stubble, tousled dark hair, a bandaged brow, his face set and tired,
        /// looking out ahead. Built facing +y (box), feet at z 0, 40 tall; the coat's tails and the scarf's
        /// end are a part of their own (they stream in the wind).
        /// </summary>
        public static float[] CaptainModel()
        {
            var m = new Mesh();
            var HullDeep = CaptainShip.HullDeep;
            // Legs: the right raised, its boot up on the rail ahead; the left straight, planted on the deck.
            Limb(m, new[] { V(22, 12.6, 21), V(22, 18.5, 18.5), V(22, 20.4, 10) }, 1.75, 1.3, Trousers);
            Limb(m, new[] { V(18, 11.8, 21), V(17.8, 11.6, 11.6), V(17.6, 11.4, 2.6) }, 1.75, 1.3, Trousers);
            // Boots: a shaft up the shin, a strap at its top, the foot and its sole (the right's on the rail).
            foreach (var (ax, ay, az, kx, ky, kz) in new[] { (22.0, 20.4, 10.0, 22.0, 18.5, 18.5), (17.6, 11.4, 2.6, 17.8, 11.6, 11.6) })
            {
                var d = Norm3(V(kx - ax, ky - ay, kz - az));
                var top = V(ax + d.X * 5.5, ay + d.Y * 5.5, az + d.Z * 5.5);
                m.Tube(new[] { top, V(ax, ay, az - 1.2) }, 1.5, 1.45, Boot, Soft, 18);
                m.Ball(top.X, top.Y, top.Z, 1.55, Strap, Soft, 14, 6);
                m.Rbox(ax, ay + 1.4, az - 1.45, 1.45, 3, 1.15, Boot, Soft, 3, 3);
                m.Rbox(ax, ay + 1.4, az - 2.35, 1.5, 3.1, 0.3, HullDeep, Soft, 4, 4);
            }
            // A guard strapped over the raised knee.
            m.Rbox(22, 19.9, 19.2, 1.3, 0.8, 1.6, Plate, 0, 2, 2.4);
            // Hips, belt (buckle, pouches), the tunic, the harness crossed over it.
            m.Rbox(20, 12, 21.3, 3.5, 2.3, 2.3, Trousers, Soft, 2.4, 2.4);
            m.Rbox(20, 12, 23.2, 3.6, 2.45, 0.75, Strap, Soft, 2.6, 6);
            m.Rbox(20, 14.45, 23.2, 0.75, 0.25, 0.55, Buckle, 0, 4, 4);
            foreach (var sd in new[] { -1, 1 }) m.Rbox(20 + sd * 2.6, 14, 22.6, 0.9, 0.7, 1, Leather, Soft, 3, 3);
            m.Rbox(20, 12, 25.6, 3.3, 2.2, 2.8, Tunic, Soft, 2.4, 2.4);
            m.Rbox(20, 12.1, 29.6, 3.9, 2.5, 3.6, Tunic, Soft, 2.4, 2.4);
            foreach (var sd in new[] { -1, 1 }) Turned(m, V(20, 14.5, 28.5), 'y', sd * 0.5, () => m.Rbox(20, 14.45, 28.5, 0.42, 0.22, 4.4, Leather, Soft, 3, 4));
            m.Ball(20, 14.65, 28.5, 0.45, Buckle, 0, 10, 6);
            // The coat over it, open down the front: its back and sides to the hips, lapels turned back, a raised collar.
            m.Rbox(20, 11.2, 28, 4.4, 1.9, 6.4, Coat, Soft, 2.4, 3);
            foreach (var sd in new[] { -1, 1 })
            {
                m.Rbox(20 + sd * 3.5, 12.4, 28.2, 1.1, 2.6, 6.2, Coat, Soft, 2.6, 3);
                Turned(m, V(20 + sd * 2.6, 14.6, 31), 'y', sd * 0.32, () => m.Rbox(20 + sd * 2.6, 14.55, 30.6, 0.65, 0.3, 3.2, Lining, Soft, 3, 3));
            }
            m.Rbox(20, 11, 34.4, 3.3, 1.6, 1.9, Coat, Soft, 2, 3);
            // Shoulders: the left under the coat; the right under a steel plate two lames deep.
            m.Ball(16.1, 12, 32.6, 1.75, Coat, Soft, 16, 10);
            m.Ball(23.9, 12, 32.6, 1.75, Coat, Soft, 16, 10);
            Turned(m, V(24.4, 12, 33.2), 'y', -0.35, () =>
            {
                m.Rbox(24.4, 12, 33.6, 2.2, 2.2, 0.85, Plate, 0, 2, 3);
                m.Rbox(25.1, 12, 32.4, 1.9, 2, 0.7, Plate, 0, 2, 3);
            });
            // The right forearm laid across the raised knee, the hand hanging over it; the left fist on his hip.
            Limb(m, new[] { V(24.2, 12, 32.4), V(24.4, 15.6, 24.6), V(22.6, 19.6, 21.2) }, 1.25, 1.0, CoatShade);
            m.Rbox(23, 18.8, 21.8, 1.1, 0.75, 1.1, Lining, Soft, 2, 3);
            m.Ball(22.4, 20.6, 20.8, 1.05, Glove, Soft, 14, 8);
            Limb(m, new[] { V(15.8, 12, 32.4), V(12.8, 11.4, 27.6), V(15.2, 12.8, 23.8) }, 1.25, 1.0, CoatShade);
            m.Rbox(14.6, 12.4, 24.6, 1.1, 1.1, 0.75, Lining, Soft, 2, 3);
            m.Ball(15.6, 13, 23.4, 1.05, Glove, Soft, 14, 8);
            // Neck, scarf wound round it; the head, looking out ahead, chin up a little.
            m.Cyl(V(20, 12.2, 33.6), V(20, 12.4, 35.6), 0.9, 0.85, Skin, Soft, 14);
            m.Rbox(20, 12.1, 34.6, 2.2, 2.1, 1.1, Scarf, Soft, 2, 2.6);
            Turned(m, V(20, 12.3, 35.4), 'x', -0.08, () =>
                Turned(m, V(20, 12.3, 35.4), 'z', 0, () =>
                {
                    double Hx = 20, Hy = 12.5, Hz = 37.6, Hrx = 1.9, Hry = 2.15, Hrz = 2.45;
                    m.Rbox(Hx, Hy, Hz, Hrx, Hry, Hrz, Skin, Soft, 2, 2, 32, 20);
                    double Face(double dx, double dz) => Hy + Hry * Math.Sqrt(Math.Max(0, 1 - Math.Pow(dx / Hrx, 2) - Math.Pow(dz / Hrz, 2)));
                    // A jaw, stubbled; the mouth a set line.
                    m.Rbox(Hx, Hy + 0.25, Hz - 1.25, 1.9, 2.05, 1.3, Stubble, Soft, 2, 2, 28, 14);
                    m.Rbox(Hx, Face(0, -0.85) - 0.05, Hz - 0.85, 0.75, 0.2, 0.2, Stubble, Soft, 2, 2, 12, 6);
                    m.Rbox(Hx, Face(0, -1.15) + 0.01, Hz - 1.15, 0.5, 0.1, 0.07, Ink, Soft, 2, 2, 12, 6);
                    // Eyes under heavy brows, shadowed; a strong nose; ears.
                    foreach (var sd in new[] { -1, 1 })
                    {
                        var ex = Hx + sd * 0.68;
                        m.Rbox(ex, Face(sd * 0.68, 0.2) - 0.08, Hz + 0.2, 0.26, 0.14, 0.17, Ink, 0, 2, 2, 12, 8);
                        m.Rbox(ex, Face(sd * 0.68, 0.45) - 0.03, Hz + 0.45, 0.38, 0.18, 0.16, SkinShade, Soft, 2, 2, 12, 8);
                        Turned(m, V(ex, Face(sd * 0.68, 0.72), Hz + 0.72), 'y', sd * 0.25, () => m.Rbox(ex, Face(sd * 0.68, 0.72) - 0.04, Hz + 0.72, 0.48, 0.2, 0.13, Hair, Soft, 2, 2, 12, 8));
                        m.Rbox(Hx + sd * 1.88, Hy, Hz - 0.15, 0.26, 0.45, 0.6, Skin, Soft, 2, 2, 12, 8);
                    }
                    m.Rbox(Hx, Face(0, -0.25) + 0.08, Hz - 0.25, 0.28, 0.36, 0.5, SkinShade, Soft, 2, 2, 12, 8);
                    // A bandage round the brow.
                    m.Rbox(Hx, Hy + 0.05, Hz + 1.25, 1.95, 2.2, 0.28, Bandage, Soft, 2, 3, 28, 8);
                    // Tousled dark hair: a mop, a fringe swept over, locks over the ears and down the neck, tufts.
                    m.Rbox(Hx, Hy - 0.4, Hz + 1.2, 2.1, 2.15, 1.55, Hair, Soft, 2, 2, 28, 16);
                    m.Rbox(Hx + 0.5, Face(0.5, 1.6) - 0.5, Hz + 1.7, 1.3, 0.6, 0.6, Hair, Soft, 2, 2, 18, 10);
                    foreach (var sd in new[] { -1, 1 }) m.Rbox(Hx + sd * 1.85, Hy - 0.4, Hz + 0.4, 0.5, 1.2, 1.2, Hair, Soft, 2, 2, 16, 10);
                    m.Rbox(Hx, Hy - 1.6, Hz - 0.3, 1.8, 0.8, 1.6, Hair, Soft, 2, 2, 20, 12);
                    foreach (var (dx, dy, dz) in new[] { (-0.8, 0.2, 2.5), (0.9, -0.6, 2.5), (0.0, -1.2, 2.1), (-1.3, -1.0, 1.9) })
                        m.Rbox(Hx + dx, Hy + dy, Hz + dz, 0.8, 0.9, 0.55, Hair, Soft, 2, 2, 14, 8);
                }));
            return m.ToArray();
        }

        /// <summary>
        /// A sheet of cloth through a grid of points (box units; rows down it, columns across), each face shaded on whichever
        /// side is seen.
        /// </summary>
        public static void Cloth(Mesh m, IList<IList<V3>> grid, Rgb col, Rgb hem)
        {
            for (int r = 0; r < grid.Count - 1; r++)
                for (int c = 0; c < grid[r].Count - 1; c++)
                {
                    V3 a = B(grid[r][c].X, grid[r][c].Y, grid[r][c].Z), b = B(grid[r][c + 1].X, grid[r][c + 1].Y, grid[r][c + 1].Z);
                    V3 d = B(grid[r + 1][c].X, grid[r + 1][c].Y, grid[r + 1][c].Z), e = B(grid[r + 1][c + 1].X, grid[r + 1][c + 1].Y, grid[r + 1][c + 1].Z);
                    var tone = r == grid.Count - 2 ? hem : col;
                    m.Tri(a, b, e, tone, Soft);
                    m.Tri(a, e, d, tone, Soft);
                }
        }

        /// <summary>
        /// The coat's skirt and the scarf's end, streaming back in the wind (a part of their own, swung as one): the skirt a
        /// sheet from the waist round his back and sides, falling and blown back, rippling, its hem torn ragged.
        /// </summary>
        public static float[] StreamerModel()
        {
            var m = new Mesh();
            const int cols = 14, rows = 12;
            var grid = new List<IList<V3>>();
            var rnd = CaptainShip.Seq(5);
            var tear = new double[cols + 1];
            for (int i = 0; i <= cols; i++) tear[i] = 0.72 + rnd() * 0.28;
            for (int r = 0; r <= rows; r++)
            {
                var row = new List<V3>();
                for (int c = 0; c <= cols; c++)
                {
                    // Round the waist from his left side, across the back, to his right (an arc behind him).
                    var a = Math.PI * (0.05 + 0.9 * ((double)c / cols));
                    var t = ((double)r / rows) * tear[c];
                    double rx = 3.9 + t * 1.8, ry = 2.6 + t * 1.2;
                    var back = t * t * 7.5 + t * 2;
                    var ripple = Math.Sin(c * 1.3 + t * 7) * 0.35 * t;
                    row.Add(V(20 - Math.Cos(a) * rx, 12 - Math.Sin(a) * ry - back + ripple, 23.4 - t * 19 + t * t * 5));
                }
                grid.Add(row);
            }
            Cloth(m, grid, Coat, CoatShade);
            // The scarf's end, flying back from the neck.
            m.Tube(new[] { V(20, 10.6, 34.4), V(19, 9, 34), V(17.6, 7.2, 33.6), V(16.4, 5.4, 33.6) }, 0.75, 0.4, Scarf, Soft, 12);
            return m.ToArray();
        }
    }
}
