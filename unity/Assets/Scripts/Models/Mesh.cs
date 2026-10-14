using System;
using System.Collections.Generic;

namespace BlueLoop.Models
{
    /// <summary>A point or direction (ship3d.ts V3): in the box (x along, y across, z up) or in a model's own axes.</summary>
    public struct V3
    {
        public double X, Y, Z;

        public V3(double x, double y, double z)
        {
            X = x;
            Y = y;
            Z = z;
        }

        public double this[int i] => i == 0 ? X : i == 1 ? Y : Z;

        public override string ToString() => $"[{X}, {Y}, {Z}]";
    }

    /// <summary>A colour (0 to 1 each).</summary>
    public struct Rgb
    {
        public double R, G, B;

        public Rgb(double r, double g, double b)
        {
            R = r;
            G = g;
            B = b;
        }

        public double this[int i] => i == 0 ? R : i == 1 ? G : B;
    }

    /// <summary>
    /// A cross-section of a lofted hull, at <c>X</c>: half its width <c>W</c>, its height above its centre <c>T</c> and depth below
    /// it <c>B</c> (box units), round its centre (<c>Y</c>, <c>Z</c>; the keel line and the keel by default). <c>P</c> is how square it
    /// is: 1 a diamond, 2 an ellipse, more a box with rounded corners.
    /// </summary>
    public class Sec
    {
        public double X, W, T;
        public double? B, Y, Z, P;

        public Sec(double x, double w, double t, double? b = null, double? y = null, double? z = null, double? p = null)
        {
            X = x;
            W = w;
            T = t;
            B = b;
            Y = y;
            Z = z;
            P = p;
        }

        public Sec Clone() => (Sec)MemberwiseClone();
    }

    /// <summary>One end of a wing or fin: its leading and trailing edges (x), where it is across and up.</summary>
    public struct Chord
    {
        public double Le, Te, Y, Z;

        public Chord(double le, double te, double y, double z)
        {
            Le = le;
            Te = te;
            Y = y;
            Z = z;
        }
    }

    /// <summary>
    /// The models' arithmetic (ship3d.ts), kept as JavaScript does it so the meshes come out the same: doubles throughout,
    /// Math.hypot as V8 sums it, Math.sign and Math.round as JavaScript's.
    /// </summary>
    public static class Vec
    {
        public static V3 Add(V3 a, V3 b) => new V3(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        public static V3 Sub(V3 a, V3 b) => new V3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        public static V3 Mul(V3 a, double k) => new V3(a.X * k, a.Y * k, a.Z * k);
        public static double Dot(V3 a, V3 b) => a.X * b.X + a.Y * b.Y + a.Z * b.Z;
        public static V3 Cross(V3 a, V3 b) => new V3(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X);
        public static double Len(V3 a) => Hypot(a.X, a.Y, a.Z);

        public static V3 Norm(V3 a)
        {
            var l = Len(a);
            if (l == 0 || double.IsNaN(l)) l = 1;
            return new V3(a.X / l, a.Y / l, a.Z / l);
        }

        public static Rgb Shade(Rgb c, double k) => new Rgb(c.R * k, c.G * k, c.B * k);

        /// <summary>Math.hypot as V8 works it out: scaled by the largest, the squares summed with compensation.</summary>
        public static double Hypot(double a, double b, double c)
        {
            a = Math.Abs(a);
            b = Math.Abs(b);
            c = Math.Abs(c);
            if (double.IsInfinity(a) || double.IsInfinity(b) || double.IsInfinity(c)) return double.PositiveInfinity;
            if (double.IsNaN(a) || double.IsNaN(b) || double.IsNaN(c)) return double.NaN;
            var max = Math.Max(a, Math.Max(b, c));
            if (max == 0) return 0;
            double sum = 0, comp = 0;
            Kahan(a / max, ref sum, ref comp);
            Kahan(b / max, ref sum, ref comp);
            Kahan(c / max, ref sum, ref comp);
            return Math.Sqrt(sum) * max;
        }

        public static double Hypot(double a, double b)
        {
            a = Math.Abs(a);
            b = Math.Abs(b);
            if (double.IsInfinity(a) || double.IsInfinity(b)) return double.PositiveInfinity;
            if (double.IsNaN(a) || double.IsNaN(b)) return double.NaN;
            var max = Math.Max(a, b);
            if (max == 0) return 0;
            double sum = 0, comp = 0;
            Kahan(a / max, ref sum, ref comp);
            Kahan(b / max, ref sum, ref comp);
            return Math.Sqrt(sum) * max;
        }

        static void Kahan(double n, ref double sum, ref double comp)
        {
            var summand = n * n - comp;
            var pre = sum + summand;
            comp = (pre - sum) - summand;
            sum = pre;
        }

        /// <summary>Math.sign: -1, 0 or 1 (NaN for NaN).</summary>
        public static double Sign(double x) => double.IsNaN(x) ? double.NaN : x > 0 ? 1 : x < 0 ? -1 : x;

        /// <summary>Math.round: halves round up.</summary>
        public static double Round(double x) => Math.Floor(x + 0.5);
    }

    /// <summary>A mesh being built (ship3d.ts Mesh): 10 floats a vertex, position (3), normal (3), colour (3), material (1).</summary>
    public class Mesh
    {
        public readonly List<float> Out = new List<float>();
        readonly List<Func<V3, V3>> xfs = new List<Func<V3, V3>>();

        /// <summary>A point of the box (x along, y across, z up) in the ship's own axes.</summary>
        public static V3 P(double x, double y, double z) => new V3((x - 20) / 40, z / 40, (y - 12) / 40);

        public static V3 P(V3 b) => P(b.X, b.Y, b.Z);

        /// <summary>A direction in the box, in the ship's own axes.</summary>
        public static V3 D(double x, double y, double z) => Vec.Norm(new V3(x, z, y));

        /// <summary>Where a section's outline is at angle <c>a</c> (0 starboard, π/2 the top), in box units.</summary>
        public static V3 SecPoint(Sec s, double a)
        {
            var p = s.P ?? 2;
            double E(double c) => Vec.Sign(c) * Math.Pow(Math.Abs(c), 2 / p);
            double ca = Math.Cos(a), sa = Math.Sin(a);
            return new V3(s.X, (s.Y ?? 12) + s.W * E(ca), (s.Z ?? 0) + (sa >= 0 ? s.T : (s.B ?? s.T)) * E(sa));
        }

        /// <summary>A hull's section at any <c>x</c> along it (between the two it was given either side).</summary>
        public static Sec SecAt(IList<Sec> secs, double x)
        {
            int i = 0;
            while (i < secs.Count - 2 && secs[i + 1].X < x) i++;
            Sec a = secs[i], b = secs[i + 1];
            var span = b.X - a.X;
            var k = Math.Max(0, Math.Min(1, (x - a.X) / (span == 0 || double.IsNaN(span) ? 1 : span)));
            double L(double? u, double? v, double d) => (u ?? d) + ((v ?? d) - (u ?? d)) * k;
            return new Sec(x, L(a.W, b.W, 0), L(a.T, b.T, 0), L(a.B ?? a.T, b.B ?? b.T, 0), L(a.Y, b.Y, 12), L(a.Z, b.Z, 0), L(a.P, b.P, 2));
        }

        void V(V3 p, V3 n, Rgb c, double m)
        {
            for (int i = xfs.Count - 1; i >= 0; i--)
            {
                var f = xfs[i];
                var a = f(p);
                n = Vec.Norm(Vec.Sub(f(Vec.Add(p, Vec.Mul(n, 1e-3))), a));
                p = a;
            }
            Out.Add((float)p.X);
            Out.Add((float)p.Y);
            Out.Add((float)p.Z);
            Out.Add((float)n.X);
            Out.Add((float)n.Y);
            Out.Add((float)n.Z);
            Out.Add((float)c.R);
            Out.Add((float)c.G);
            Out.Add((float)c.B);
            Out.Add((float)m);
        }

        /// <summary>The mesh built, as its floats.</summary>
        public float[] ToArray() => Out.ToArray();

        /// <summary>Builds parts moved by <c>f</c> (in the ship's own axes).</summary>
        public void With(Func<V3, V3> f, System.Action build)
        {
            xfs.Add(f);
            build();
            xfs.RemoveAt(xfs.Count - 1);
        }

        /// <summary>Builds parts on both sides: as given (to port, y under 12), and mirrored to starboard.</summary>
        public void Mirror(System.Action build)
        {
            build();
            With(p => new V3(p.X, p.Y, -p.Z), build);
        }

        /// <summary>
        /// Builds a part laid along +x from the box's origin (x 20, y 12, z 0), stood at <c>base</c> and pointing along <c>dir</c>
        /// (box units), turned <c>roll</c> about its own length.
        /// </summary>
        public void Orient(V3 @base, V3 dir, System.Action build, double roll = 0)
        {
            var f = D(dir.X, dir.Y, dir.Z);
            var refv = Math.Abs(f.Y) > 0.95 ? new V3(1, 0, 0) : new V3(0, 1, 0);
            var u = Vec.Norm(Vec.Sub(refv, Vec.Mul(f, Vec.Dot(refv, f))));
            var s = Vec.Cross(f, u);
            if (roll != 0 && !double.IsNaN(roll))
            {
                double c = Math.Cos(roll), sn = Math.Sin(roll);
                (u, s) = (Vec.Add(Vec.Mul(u, c), Vec.Mul(s, sn)), Vec.Sub(Vec.Mul(s, c), Vec.Mul(u, sn)));
            }
            var o = P(@base.X, @base.Y, @base.Z);
            With(p => Vec.Add(o, Vec.Add(Vec.Mul(f, p.X), Vec.Add(Vec.Mul(u, p.Y), Vec.Mul(s, p.Z)))), build);
        }

        /// <summary>A flat triangle, facing away from <c>inside</c>.</summary>
        public void Tri(V3 a, V3 b, V3 c, Rgb col, double mat, V3? inside = null)
        {
            var raw = Vec.Cross(Vec.Sub(b, a), Vec.Sub(c, a));
            if (Vec.Len(raw) < 1e-10) return;
            var n = Vec.Norm(raw);
            if (inside is V3 i)
            {
                var mid = new V3((a.X + b.X + c.X) / 3 - i.X, (a.Y + b.Y + c.Y) / 3 - i.Y, (a.Z + b.Z + c.Z) / 3 - i.Z);
                if (Vec.Dot(n, mid) < 0) n = Vec.Mul(n, -1);
            }
            V(a, n, col, mat);
            V(b, n, col, mat);
            V(c, n, col, mat);
        }

        /// <summary>
        /// A hull lofted through its sections (in order along x): smooth, or (<c>flat</c>) cut in facets, one to each of its
        /// <c>segs</c> sides. Its underside is shaded darker; open ends are capped.
        /// </summary>
        public void Loft(IList<Sec> secs, Rgb col, double mat, int segs = 22, bool flat = false, double under = 0.3)
        {
            double Ang(int j) => Math.PI / 2 + ((double)j / segs) * Math.PI * 2;
            int last = secs.Count - 1;
            var G = new V3[secs.Count][];
            var C = new V3[secs.Count];
            for (int i = 0; i <= last; i++)
            {
                var s = secs[i];
                G[i] = new V3[segs];
                for (int j = 0; j < segs; j++) G[i][j] = P(SecPoint(s, Ang(j)));
                C[i] = P(s.X, s.Y ?? 12, s.Z ?? 0);
            }
            bool Tip(Sec s) => s.W < 1e-6 && s.T < 1e-6 && (s.B ?? s.T) < 1e-6;
            Rgb Tone(int j) => Vec.Shade(col, 1 - under * (0.5 - 0.5 * Math.Sin(Ang(j))));
            V3 Axial(int i) => Vec.Norm(i == 0 ? Vec.Sub(C[0], C[1]) : i == last ? Vec.Sub(C[last], C[last - 1]) : new V3(0, 1, 0));
            var N = new V3[secs.Count][];
            for (int i = 0; i <= last; i++)
            {
                var ring = G[i];
                N[i] = new V3[segs];
                for (int j = 0; j < segs; j++)
                {
                    if (Tip(secs[i]))
                    {
                        N[i][j] = Axial(i);
                        continue;
                    }
                    var dA = Vec.Sub(ring[(j + 1) % segs], ring[(j - 1 + segs) % segs]);
                    var dL = Vec.Sub(G[Math.Min(i + 1, last)][j], G[Math.Max(i - 1, 0)][j]);
                    var c = Vec.Cross(dL, dA);
                    if (Vec.Len(c) < 1e-12)
                    {
                        N[i][j] = Axial(i);
                        continue;
                    }
                    var n = Vec.Norm(c);
                    N[i][j] = Vec.Dot(n, Vec.Sub(ring[j], C[i])) < 0 ? Vec.Mul(n, -1) : n;
                }
            }
            for (int i = 0; i < last; i++)
            {
                var mid = Vec.Mul(Vec.Add(C[i], C[i + 1]), 0.5);
                for (int j = 0; j < segs; j++)
                {
                    int j2 = (j + 1) % segs;
                    V3 a = G[i][j], b = G[i][j2], c = G[i + 1][j2], d = G[i + 1][j];
                    if (flat)
                    {
                        var t = Vec.Shade(col, 1 - under * (0.5 - 0.5 * Math.Sin((Ang(j) + Ang(j + 1)) / 2)));
                        Tri(a, b, c, t, mat, mid);
                        Tri(a, c, d, t, mat, mid);
                    }
                    else
                    {
                        V3 na = N[i][j], nb = N[i][j2], nc = N[i + 1][j2], nd = N[i + 1][j];
                        if (Vec.Len(Vec.Sub(a, b)) > 1e-9)
                        {
                            V(a, na, Tone(j), mat);
                            V(b, nb, Tone(j2), mat);
                            V(c, nc, Tone(j2), mat);
                        }
                        if (Vec.Len(Vec.Sub(c, d)) > 1e-9)
                        {
                            V(a, na, Tone(j), mat);
                            V(c, nc, Tone(j2), mat);
                            V(d, nd, Tone(j), mat);
                        }
                    }
                }
            }
            foreach (var i in new[] { 0, last })
            {
                if (Tip(secs[i])) continue;
                var n = Axial(i);
                for (int j = 0; j < segs; j++)
                {
                    V3 a = G[i][j], b = G[i][(j + 1) % segs];
                    V(C[i], n, Vec.Shade(col, 0.8), mat);
                    V(a, n, Vec.Shade(col, 0.8), mat);
                    V(b, n, Vec.Shade(col, 0.8), mat);
                }
            }
        }

        /// <summary>A block from (x0, y0, z0) to (x1, y1, z1), its top drawn in by <c>inset</c> on every side (a bevelled top).</summary>
        public void Box(double x0, double x1, double y0, double y1, double z0, double z1, Rgb col, double mat, double inset = 0)
        {
            var i = inset;
            var b = new[] { P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0) };
            var t = new[] { P(x0 + i, y0 + i, z1), P(x1 - i, y0 + i, z1), P(x1 - i, y1 - i, z1), P(x0 + i, y1 - i, z1) };
            var c = P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
            for (int k = 0; k < 4; k++)
            {
                int k2 = (k + 1) % 4;
                var side = Vec.Shade(col, 0.88);
                Tri(b[k], b[k2], t[k2], side, mat, c);
                Tri(b[k], t[k2], t[k], side, mat, c);
            }
            Tri(t[0], t[1], t[2], col, mat, c);
            Tri(t[0], t[2], t[3], col, mat, c);
            Tri(b[0], b[1], b[2], Vec.Shade(col, 0.6), mat, c);
            Tri(b[0], b[2], b[3], Vec.Shade(col, 0.6), mat, c);
        }

        /// <summary>An ellipsoid (box units: x along, y across; z0 its bottom, height 2rz), or (dome) its upper half from z0.</summary>
        public void Orb(double x, double y, double z0, double rx, double ry, double rz, Rgb col, double mat, bool dome = false, int segs = 18, int rings = 10)
        {
            var cz = dome ? z0 : z0 + rz;
            (V3, V3) At(int i, int j)
            {
                var th = ((double)j / segs) * Math.PI * 2;
                var ph = dome ? ((double)i / rings) * (Math.PI / 2) : ((double)i / rings) * Math.PI - Math.PI / 2;
                double nx = Math.Cos(ph) * Math.Cos(th), ny = Math.Cos(ph) * Math.Sin(th), nz = Math.Sin(ph);
                return (P(x + nx * rx, y + ny * ry, cz + nz * rz), Vec.Norm(new V3(nx / rx, nz / rz, ny / ry)));
            }
            for (int i = 0; i < rings; i++)
                for (int j = 0; j < segs; j++)
                {
                    var (a, na) = At(i, j);
                    var (b, nb) = At(i, j + 1);
                    var (c, nc) = At(i + 1, j + 1);
                    var (e, ne) = At(i + 1, j);
                    V(a, na, col, mat);
                    V(c, nc, col, mat);
                    V(b, nb, col, mat);
                    V(a, na, col, mat);
                    V(e, ne, col, mat);
                    V(c, nc, col, mat);
                }
            if (dome)
                for (int j = 0; j < segs; j++)
                {
                    var (a, _) = At(0, j);
                    var (b, _) = At(0, j + 1);
                    Tri(P(x, y, cz), a, b, Vec.Shade(col, 0.6), mat, P(x, y, cz + 1));
                }
        }

        /// <summary>
        /// A rounded block (a superquadric) round (x, y, z), its half sizes rx (along), ry (across), rz (up): <c>nh</c> how square it
        /// is seen from above (2 round, 4 or more a rounded square), <c>nv</c> how square from the side. Smooth all over (no hard
        /// edges), so it shades and outlines cleanly.
        /// </summary>
        public void Rbox(double x, double y, double z, double rx, double ry, double rz, Rgb col, double mat, double nh = 4, double nv = 4, int segs = 28, int rings = 16)
        {
            double F(double c, double e) => Vec.Sign(c) * Math.Pow(Math.Abs(c), e);
            double eh = 2 / nh, ev = 2 / nv, gh = 2 - 2 / nh, gv = 2 - 2 / nv;
            (V3, V3) At(int i, int j)
            {
                double ph = -Math.PI / 2 + ((double)i / rings) * Math.PI, th = ((double)j / segs) * Math.PI * 2;
                double cp = Math.Cos(ph), sp = Math.Sin(ph), ct = Math.Cos(th), st = Math.Sin(th);
                var p = P(x + rx * F(cp, ev) * F(ct, eh), y + ry * F(cp, ev) * F(st, eh), z + rz * F(sp, ev));
                var n = new V3((F(cp, gv) * F(ct, gh)) / rx, F(sp, gv) / rz, (F(cp, gv) * F(st, gh)) / ry);
                // (At the poles the sums give nothing: straight up or down.)
                if (Vec.Len(n) < 1e-9)
                {
                    var sg = Vec.Sign(sp);
                    n = new V3(0, sg == 0 || double.IsNaN(sg) ? 1 : sg, 0);
                }
                return (p, Vec.Norm(n));
            }
            for (int i = 0; i < rings; i++)
                for (int j = 0; j < segs; j++)
                {
                    var (a, na) = At(i, j);
                    var (b, nb) = At(i, j + 1);
                    var (c, nc) = At(i + 1, j + 1);
                    var (e, ne) = At(i + 1, j);
                    V(a, na, col, mat);
                    V(c, nc, col, mat);
                    V(b, nb, col, mat);
                    V(a, na, col, mat);
                    V(e, ne, col, mat);
                    V(c, nc, col, mat);
                }
        }

        /// <summary>A ball round (x, y, z).</summary>
        public void Ball(double x, double y, double z, double r, Rgb col, double mat, int segs = 14, int rings = 8)
        {
            Orb(x, y, z - r, r, r, r, col, mat, false, segs, rings);
        }

        /// <summary>A tube through points (box units), its radius going from r0 to r1, shaded smooth; its ends closed.</summary>
        public void Tube(IList<V3> path, double r0, double r1, Rgb col, double mat, int segs = 10, bool caps = true)
        {
            int n = path.Count;
            var pts = new V3[n];
            for (int k = 0; k < n; k++) pts[k] = P(path[k]);
            var tan = new V3[n];
            for (int k = 0; k < n; k++) tan[k] = Vec.Norm(Vec.Sub(pts[Math.Min(k + 1, n - 1)], pts[Math.Max(k - 1, 0)]));
            // Frames carried along the tube (so it never twists).
            var refv = Math.Abs(tan[0].Y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
            var side = Vec.Norm(Vec.Cross(tan[0], refv));
            var rings = new (V3 p, V3 d)[n][];
            for (int k = 0; k < n; k++)
            {
                if (k > 0)
                {
                    var s2 = Vec.Sub(side, Vec.Mul(tan[k], Vec.Dot(side, tan[k])));
                    if (Vec.Len(s2) > 1e-6) side = Vec.Norm(s2);
                }
                var up = Vec.Cross(side, tan[k]);
                var r = (r0 + (r1 - r0) * ((double)k / (n - 1))) / 40;
                rings[k] = new (V3, V3)[segs];
                for (int j = 0; j < segs; j++)
                {
                    var t = ((double)j / segs) * Math.PI * 2;
                    var d = Vec.Add(Vec.Mul(side, Math.Cos(t)), Vec.Mul(up, Math.Sin(t)));
                    rings[k][j] = (Vec.Add(pts[k], Vec.Mul(d, r)), d);
                }
            }
            for (int k = 0; k < n - 1; k++)
                for (int j = 0; j < segs; j++)
                {
                    int j2 = (j + 1) % segs;
                    var (a, na) = rings[k][j];
                    var (b, nb) = rings[k + 1][j];
                    var (c, nc) = rings[k + 1][j2];
                    var (d, nd) = rings[k][j2];
                    V(a, na, col, mat);
                    V(b, nb, col, mat);
                    V(c, nc, col, mat);
                    V(a, na, col, mat);
                    V(c, nc, col, mat);
                    V(d, nd, col, mat);
                }
            if (caps)
                foreach (var (k, sgn) in new[] { (0, -1), (n - 1, 1) })
                {
                    var nn = Vec.Mul(tan[k], sgn);
                    for (int j = 0; j < segs; j++)
                    {
                        V(pts[k], nn, col, mat);
                        V(rings[k][j].p, nn, col, mat);
                        V(rings[k][(j + 1) % segs].p, nn, col, mat);
                    }
                }
        }

        /// <summary>A straight cylinder (or cone) from a to b.</summary>
        public void Cyl(V3 a, V3 b, double r0, double r1, Rgb col, double mat, int segs = 14)
        {
            Tube(new[] { a, b }, r0, r1, col, mat, segs);
        }

        /// <summary>A ring (a thin torus) round (x, y) at height z, radius R, tube r, tipped about its across axis by <c>tilt</c>.</summary>
        public void Ring(double x, double y, double z, double R, double r, double tilt, Rgb col, double mat)
        {
            const int segs = 40, sides = 8;
            double ct = Math.Cos(tilt), st = Math.Sin(tilt);
            (V3, V3) At(int i, int j)
            {
                double a = ((double)i / segs) * Math.PI * 2, b = ((double)j / sides) * Math.PI * 2;
                double cxr = Math.Cos(a) * (R + r * Math.Cos(b)), cyr = Math.Sin(a) * (R + r * Math.Cos(b)), czr = r * Math.Sin(b);
                double nx = Math.Cos(a) * Math.Cos(b), ny = Math.Sin(a) * Math.Cos(b), nz = Math.Sin(b);
                return (P(x + cxr * ct - czr * st, y + cyr, z + cxr * st + czr * ct), Vec.Norm(new V3(nx * ct - nz * st, nx * st + nz * ct, ny)));
            }
            for (int i = 0; i < segs; i++)
                for (int j = 0; j < sides; j++)
                {
                    var (a, na) = At(i, j);
                    var (b, nb) = At(i + 1, j);
                    var (c, nc) = At(i + 1, j + 1);
                    var (e, ne) = At(i, j + 1);
                    V(a, na, col, mat);
                    V(b, nb, col, mat);
                    V(c, nc, col, mat);
                    V(a, na, col, mat);
                    V(c, nc, col, mat);
                    V(e, ne, col, mat);
                }
        }

        /// <summary>A wing or fin from its root chord to its tip, with an airfoil's diamond section, thinning to the tip.</summary>
        public void Wing(Chord root, Chord tip, double thick, Rgb col, double mat)
        {
            double sp0 = tip.Y - root.Y, sp1 = tip.Z - root.Z;
            var sl = Vec.Hypot(sp0, sp1);
            if (sl == 0) sl = 1;
            // Thickness runs square to the span, across the wing.
            double th0 = -sp1 / sl, th1 = sp0 / sl;
            V3[] Sec(Chord c, double t)
            {
                var m = c.Le - (c.Le - c.Te) * 0.4;
                return new[] { P(c.Le, c.Y, c.Z), P(m, c.Y + th0 * t, c.Z + th1 * t), P(c.Te, c.Y, c.Z), P(m, c.Y - th0 * t, c.Z - th1 * t) };
            }
            V3[] r = Sec(root, thick / 2), tt = Sec(tip, thick * 0.2);
            var mid = Vec.Mul(Vec.Add(Vec.Add(r[0], r[2]), Vec.Add(tt[0], tt[2])), 0.25);
            for (int k = 0; k < 4; k++)
            {
                int k2 = (k + 1) % 4;
                var tone = k < 2 ? col : Vec.Shade(col, 0.78);
                Tri(r[k], r[k2], tt[k2], tone, mat, mid);
                Tri(r[k], tt[k2], tt[k], tone, mat, mid);
            }
            Tri(tt[0], tt[1], tt[2], col, mat, mid);
            Tri(tt[0], tt[2], tt[3], col, mat, mid);
            Tri(r[0], r[1], r[2], col, mat, mid);
            Tri(r[0], r[2], r[3], col, mat, mid);
        }

        /// <summary>A crystal shard (or spike): a six-sided faceted spire laid along +x from the origin, <c>l</c> long, <c>r</c> thick.</summary>
        public void Shard(V3 @base, V3 dir, double l, double r, Rgb col, double mat, double roll = 0)
        {
            Orient(
                @base,
                dir,
                () => Loft(
                    new[]
                    {
                        new Sec(19.6, r * 0.55, r * 0.55, p: 2),
                        new Sec(20 + l * 0.22, r, r, p: 2),
                        new Sec(20 + l * 0.68, r * 0.72, r * 0.72, p: 2),
                        new Sec(20 + l, 0, 0),
                    },
                    col,
                    mat,
                    segs: 6,
                    flat: true,
                    under: 0.2),
                roll);
        }

        /// <summary>Lights set into a hull's sides: <c>n</c> along it from x0 to x1, at angle <c>a</c> round it (both sides).</summary>
        public void Windows(IList<Sec> secs, double x0, double x1, int n, double a, double r, Rgb col)
        {
            for (int i = 0; i < n; i++)
            {
                var x = x0 + ((x1 - x0) * i) / Math.Max(1, n - 1);
                var s = SecAt(secs, x);
                foreach (var aa in new[] { a, Math.PI - a })
                {
                    var q = SecPoint(s, aa);
                    Ball(q.X, q.Y + Math.Cos(aa) * r * 0.2, q.Z + Math.Sin(aa) * r * 0.2, r, col, 2, 6, 4);
                }
            }
        }

        /// <summary>A raised ridge down a hull's back from x0 to x1, <c>w</c> wide and <c>h</c> high, tapering at its ends.</summary>
        public void Spine(IList<Sec> secs, double x0, double x1, double w, double h, Rgb col, double mat)
        {
            var o = new List<Sec>();
            for (int i = 0; i <= 8; i++)
            {
                var x = x0 + ((x1 - x0) * i) / 8;
                var top = SecPoint(SecAt(secs, x), Math.PI / 2);
                var f = i == 0 || i == 8 ? 0 : Math.Min(1, Math.Sin((Math.PI * i) / 8) * 1.6);
                o.Add(new Sec(x, w * f, h * f, b: 0.4 * f, z: top.Z - 0.15, p: 3));
            }
            Loft(o, col, mat, segs: 12, under: 0.15);
        }

        /// <summary>A band round a hull at x (a hoop standing proud of it by <c>out</c>, <c>wide</c> long).</summary>
        public void Band(IList<Sec> secs, double x, double wide, double @out, Rgb col, double mat)
        {
            var s = SecAt(secs, x);
            Sec G(double dx, double k)
            {
                var g = s.Clone();
                g.X = x + dx;
                g.W = s.W + k;
                g.T = s.T + k;
                g.B = (s.B ?? s.T) + k;
                return g;
            }
            Loft(new[] { G(-wide / 2, 0), G(-wide / 2 + 0.05, @out), G(wide / 2 - 0.05, @out), G(wide / 2, 0) }, col, mat, segs: 24, under: 0.2);
        }
    }
}
