using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace BlueLoop.Models
{
    /// <summary>
    /// The strip of systems the land lies low under: its systems (world x, z; how far along the route each lies, in
    /// columns; its height, world y: each node 2 to 4 numbers, the last two optional) and routes (x0, z0, x1, z1).
    /// </summary>
    public class Strip
    {
        public List<double[]> Nodes = new List<double[]>();
        public List<double[]> Routes = new List<double[]>();
    }

    public class NebulaShape
    {
        /// <summary>
        /// The ground, as triangles, 17 floats a corner: position (3), normal (3), barycentric (3), whether each edge
        /// (opposite each corner) is a shard's border (3), its shard's middle and a random number (4), and how far along
        /// the route its shard lies (1: in columns, as the collapse counts them).
        /// </summary>
        public float[] Ground;
        /// <summary>The stars over it: x, y, z, size, hue (0 ink; 1 gold, 2 rose, 3 sea blue), phase.</summary>
        public float[] Stars;
    }

    /// <summary>
    /// The campaign's landscape (nebula-geometry.ts), worked out once per universe (seeded): see nebula3d.ts. Pure, so it can
    /// run off the main thread.
    ///
    /// A mesh landscape like a sea: a heightfield of long rolling swells and smaller waves on them, low in a shallow
    /// trough where the strip of systems lies (the strip floats just over it, on the plane y = 0), rising a little
    /// away from it, most behind (never peaks). The ground is cut in advance into shards (a jittered
    /// grid of cells, each triangle given to the cell its middle falls in), each triangle carrying its own corners,
    /// which of its edges lie on a shard's border, and its shard's middle: so when instability comes, the ground can
    /// crack along those borders and the shards break away and fall (nebula3d.ts).
    ///
    /// Over it hang a scattering of stars, most in ink, a few in colour.
    /// </summary>
    public static class NebulaGeometry
    {
        // The ground's extent (x across, z toward the viewer) and the size of its mesh's cells.
        public const double X0 = -7, X1 = 7, Z0 = -5.5, Z1 = 4, Cell = 0.11;
        // The shards' size.
        const double ShardSize = 0.42;

        public const int GroundStride = 17;

        // ---------- noise (seeded value noise, fBm) ----------

        class Noise
        {
            readonly byte[] perm = new byte[512];
            readonly float[] val = new float[256];
            uint s;

            public Noise(double seed)
            {
                var p = new int[256];
                for (int i = 0; i < 256; i++) p[i] = i;
                s = ToUint32(seed);
                if (s == 0) s = 1;
                for (int i = 255; i > 0; i--)
                {
                    var j = (int)Math.Floor(Rnd() * (i + 1));
                    (p[i], p[j]) = (p[j], p[i]);
                }
                for (int i = 0; i < 512; i++) perm[i] = (byte)p[i & 255];
                for (int i = 0; i < 256; i++) val[i] = (float)(Rnd() * 2 - 1);
            }

            /// <summary>ToUint32, as JavaScript's <c>&gt;&gt;&gt; 0</c>.</summary>
            static uint ToUint32(double x)
            {
                if (double.IsNaN(x) || double.IsInfinity(x)) return 0;
                var t = Math.Truncate(x) % 4294967296.0;
                if (t < 0) t += 4294967296.0;
                return (uint)t;
            }

            public double Rnd()
            {
                unchecked
                {
                    s = (s ^ (s >> 15)) * 2246822519u + 0x9e3779b9u;
                }
                return s / 4294967296.0;
            }

            double H(int x, int y) => val[perm[perm[x & 255] + (y & 255)]];

            double Value(double x, double y)
            {
                double xi = Math.Floor(x), yi = Math.Floor(y);
                double xf = x - xi, yf = y - yi;
                double u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
                int ix = ToInt32(xi), iy = ToInt32(yi);
                var a = H(ix, iy) + (H(ix + 1, iy) - H(ix, iy)) * u;
                var b = H(ix, iy + 1) + (H(ix + 1, iy + 1) - H(ix, iy + 1)) * u;
                return a + (b - a) * v;
            }

            /// <summary>ToInt32 of an integral double (as JavaScript's bitwise operators take it).</summary>
            static int ToInt32(double x) => unchecked((int)ToUint32(x));

            public double Fbm(double x, double y, int oct)
            {
                double sum = 0, amp = 0.5, f = 1;
                for (int i = 0; i < oct; i++)
                {
                    sum += amp * Value(x * f + i * 17.3, y * f - i * 9.1);
                    amp *= 0.5;
                    f *= 2.03;
                }
                return sum;
            }
        }

        static double Smooth(double a, double b, double x)
        {
            var t = Math.Min(1, Math.Max(0, (x - a) / (b - a)));
            return t * t * (3 - 2 * t);
        }

        /// <summary>A node's k-th number, if it has one.</summary>
        static double? At(double[] n, int k) => k < n.Length ? n[k] : (double?)null;

        class Vtx
        {
            public double X, Z;
        }

        struct Edge
        {
            public Vtx V;
            public bool Cut;
        }

        /// <summary>The key a point's surface is kept under: its place to five decimals (as JavaScript's toFixed(5)).</summary>
        static string Fixed5(double x)
        {
            var s = Math.Abs(x).ToString("F5", CultureInfo.InvariantCulture);
            return x < 0 ? "-" + s : s;
        }

        public static NebulaShape BuildNebula(double seed, Strip strip = null)
        {
            strip = strip ?? new Strip();
            var nodes = strip.Nodes ?? new List<double[]>();
            var noise = new Noise(seed);
            Func<double> rnd = noise.Rnd;
            double Range(double a, double b) => a + rnd() * (b - a);
            // The strip's footprint, a little padded: the land lies low there.
            var xs = nodes.Select(n => n[0]).ToList();
            var zs = nodes.Select(n => n[1]).ToList();
            double fx0 = xs.Count > 0 ? xs.Min() - 0.35 : -2.4, fx1 = xs.Count > 0 ? xs.Max() + 0.35 : 2.4;
            double fz0 = zs.Count > 0 ? zs.Min() - 0.35 : -0.6, fz1 = zs.Count > 0 ? zs.Max() + 0.35 : 0.6;

            // The route's own heights and places along it, spread over the land: each point takes after the systems nearest
            // it (by inverse distance), so the land rises and falls with the route, and breaks away in the route's order.
            double Near(double x, double z, int k)
            {
                double wsum = 0, v = 0;
                foreach (var n in nodes)
                {
                    var d = Math.Pow(n[0] - x, 2) + Math.Pow(n[1] - z, 2);
                    var w = 1 / (d * d + 1e-4);
                    wsum += w;
                    v += w * (At(n, k) ?? 0);
                }
                return wsum != 0 && !double.IsNaN(wsum) ? v / wsum : 0;
            }
            var lifts = nodes.Any(n => At(n, 3) is double h && h != 0 && !double.IsNaN(h));
            double Base(double x, double z)
            {
                // How far outside the footprint (0 inside it).
                double dx = Math.Max(Math.Max(fx0 - x, 0), x - fx1), dzBack = Math.Max(fz0 - z, 0), dzFront = Math.Max(z - fz1, 0);
                var outside = Vec.Hypot(dx, dzBack, dzFront);
                // Rolling, like a sea: long swells and smaller waves on them, a little higher away from the strip (most
                // behind it), and never peaks.
                var swell = Math.Sin(x * 0.55 + z * 0.25 + noise.Fbm(x * 0.2, z * 0.2, 2) * 3) * 0.5 + 0.5;
                var waves = noise.Fbm(x * 0.45 + 3, z * 0.6, 4);
                var rise = Smooth(0, 1.2, outside) * (0.35 + 0.35 * Math.Min(1, dzBack / 2));
                return -0.32 + 0.05 * noise.Fbm(x * 1.3, z * 1.3, 2) + rise * (swell * 0.7 + waves * 0.6);
            }
            double Height(double x, double z) => (lifts ? Near(x, z, 3) : 0) + Base(x, z);

            int nx = (int)Vec.Round((X1 - X0) / Cell) + 1, nz = (int)Vec.Round((Z1 - Z0) / Cell) + 1;

            // The shards: a jittered grid of seeds; each point belongs to its nearest.
            int sx = (int)Math.Ceiling((X1 - X0) / ShardSize) + 2, sz = (int)Math.Ceiling((Z1 - Z0) / ShardSize) + 2;
            var seeds = new float[sx * sz * 3];
            for (int j = 0; j < sz; j++)
                for (int i = 0; i < sx; i++)
                {
                    var k = (j * sx + i) * 3;
                    seeds[k] = (float)(X0 + (i - 0.5 + Range(0.1, 0.9)) * ShardSize);
                    seeds[k + 1] = (float)(Z0 + (j - 0.5 + Range(0.1, 0.9)) * ShardSize);
                    seeds[k + 2] = (float)rnd();
                }
            // How far along the route each shard lies (in columns): with no route, its x (as the land always broke before).
            var progress = new float[sx * sz];
            var along = nodes.Count > 0 && nodes[0].Length > 2;
            for (int k = 0; k < sx * sz; k++) progress[k] = along ? (float)Near(seeds[k * 3], seeds[k * 3 + 1], 2) : seeds[k * 3];
            // A shard's reach, warped a little by smooth noise so its borders curve gently rather than run dead straight.
            (double, double) Warp(double x, double z) => (x + 0.09 * noise.Fbm(x * 2.2 + 11, z * 2.2, 2), z + 0.09 * noise.Fbm(x * 2.2, z * 2.2 - 7, 2));
            double DistTo(int k, double x, double z)
            {
                var (wx, wz) = Warp(x, z);
                return Math.Pow(seeds[k * 3] - wx, 2) + Math.Pow(seeds[k * 3 + 1] - wz, 2);
            }
            int ShardOf(double x, double z)
            {
                var (wx, wz) = Warp(x, z);
                int ci = (int)Math.Floor((wx - X0) / ShardSize + 0.5), cj = (int)Math.Floor((wz - Z0) / ShardSize + 0.5);
                int best = 0;
                var bd = double.PositiveInfinity;
                for (int j = cj - 1; j <= cj + 1; j++)
                    for (int i = ci - 1; i <= ci + 1; i++)
                    {
                        if (i < 0 || j < 0 || i >= sx || j >= sz) continue;
                        var k = j * sx + i;
                        var d = Math.Pow(seeds[k * 3] - wx, 2) + Math.Pow(seeds[k * 3 + 1] - wz, 2);
                        if (d < bd)
                        {
                            bd = d;
                            best = k;
                        }
                    }
                return best;
            }
            // Each point's height and normal (worked out once: most points are shared by six triangles).
            var memo = new Dictionary<string, double[]>();
            double[] Surface(double x, double z)
            {
                var key = Fixed5(x) + "," + Fixed5(z);
                if (!memo.TryGetValue(key, out var v))
                {
                    var e = Cell * 0.5;
                    double gx = (Height(x + e, z) - Height(x - e, z)) / (2 * e), gz = (Height(x, z + e) - Height(x, z - e)) / (2 * e);
                    var l = Vec.Hypot(gx, 1, gz);
                    v = new[] { Height(x, z), -gx / l, 1 / l, -gz / l };
                    memo[key] = v;
                }
                return v;
            }

            // The mesh: each cell's two triangles, cut along the shards' borders where a border crosses them (so a shard's
            // edge runs smoothly across the cells, never in steps along them). A cut is where two shards' reach is equal,
            // found along each edge; the edges a cut makes are the shard's border (where the cracks glow).
            var @out = new List<float>();
            void Emit(Vtx a, Vtx b, Vtx c, int e0, int e1, int e2, int s)
            {
                double sxw = seeds[s * 3], szw = seeds[s * 3 + 1];
                var mid = Height(sxw, szw);
                var corners = new[] { a, b, c };
                for (int k = 0; k < 3; k++)
                {
                    var v = corners[k];
                    var su = Surface(v.X, v.Z);
                    @out.Add((float)v.X);
                    @out.Add((float)su[0]);
                    @out.Add((float)v.Z);
                    @out.Add((float)su[1]);
                    @out.Add((float)su[2]);
                    @out.Add((float)su[3]);
                    @out.Add(k == 0 ? 1 : 0);
                    @out.Add(k == 1 ? 1 : 0);
                    @out.Add(k == 2 ? 1 : 0);
                    @out.Add(e0);
                    @out.Add(e1);
                    @out.Add(e2);
                    @out.Add((float)sxw);
                    @out.Add((float)mid);
                    @out.Add((float)szw);
                    @out.Add(seeds[s * 3 + 2]);
                    @out.Add(progress[s]);
                }
            }
            // Clip a polygon (its edges flagged as cuts or not) to where shard `s` reaches further than shard `t`.
            List<Edge> Clip(List<Edge> poly, int s, int t)
            {
                double G(Vtx v) => DistTo(s, v.X, v.Z) - DistTo(t, v.X, v.Z);
                var res = new List<Edge>();
                for (int i = 0; i < poly.Count; i++)
                {
                    Edge cur = poly[i], next = poly[(i + 1) % poly.Count];
                    double gc = G(cur.V), gn = G(next.V);
                    if (gc <= 0) res.Add(cur);
                    if ((gc <= 0) != (gn <= 0))
                    {
                        var k = gc / (gc - gn);
                        var m = new Vtx { X = cur.V.X + (next.V.X - cur.V.X) * k, Z = cur.V.Z + (next.V.Z - cur.V.Z) * k };
                        // Leaving the region the edge from here on is a cut; coming back in, the original edge goes on.
                        res.Add(gc <= 0 ? new Edge { V = m, Cut = true } : new Edge { V = m, Cut = cur.Cut });
                    }
                }
                return res;
            }
            var owner = new Dictionary<Vtx, int>();
            int OwnerOf(Vtx v)
            {
                if (!owner.TryGetValue(v, out var k)) owner[v] = k = ShardOf(v.X, v.Z);
                return k;
            }
            void Tri(Vtx a, Vtx b, Vtx c)
            {
                var owners = new List<int>();
                foreach (var v in new[] { a, b, c })
                {
                    var o = OwnerOf(v);
                    if (!owners.Contains(o)) owners.Add(o);
                }
                if (owners.Count == 1)
                {
                    Emit(a, b, c, 0, 0, 0, owners[0]);
                    return;
                }
                foreach (var s in owners)
                {
                    var poly = new List<Edge> { new Edge { V = a }, new Edge { V = b }, new Edge { V = c } };
                    foreach (var t in owners) if (t != s && poly.Count >= 3) poly = Clip(poly, s, t);
                    if (poly.Count < 3) continue;
                    // A fan from its first corner; each triangle's edges opposite its corners (b-c, c-a, a-b).
                    for (int i = 1; i < poly.Count - 1; i++)
                    {
                        var e0 = poly[i].Cut ? 1 : 0;
                        var e1 = i + 1 == poly.Count - 1 && poly[i + 1].Cut ? 1 : 0;
                        var e2 = i == 1 && poly[0].Cut ? 1 : 0;
                        Emit(poly[0].V, poly[i].V, poly[i + 1].V, e0, e1, e2, s);
                    }
                }
            }
            int qx = nx - 1, qz = nz - 1;
            var grid = new Vtx[nx * nz];
            for (int j = 0; j < nz; j++) for (int i = 0; i < nx; i++) grid[j * nx + i] = new Vtx { X = X0 + i * Cell, Z = Z0 + j * Cell };
            Vtx Gv(int i, int j) => grid[j * nx + i];
            for (int j = 0; j < qz; j++)
                for (int i = 0; i < qx; i++)
                {
                    Vtx v00 = Gv(i, j), v10 = Gv(i + 1, j), v11 = Gv(i + 1, j + 1), v01 = Gv(i, j + 1);
                    Tri(v00, v10, v11);
                    Tri(v00, v11, v01);
                }
            var ground = @out.ToArray();

            // Stars over the land, mostly behind the strip and above the mountains: most in ink, a few in colour.
            var stars = new List<float>();
            for (int n = 0; n < 340; n++)
            {
                double x = Range(-9, 9), z = Range(-9, 1.5), y = Range(0.4, 4.5);
                if (y < Height(x, z) + 0.3) continue;
                var roll = rnd();
                stars.Add((float)x);
                stars.Add((float)y);
                stars.Add((float)z);
                stars.Add((float)Range(1.2, 3.2));
                stars.Add(roll < 0.08 ? 1 : roll < 0.13 ? 2 : roll < 0.18 ? 3 : 0);
                stars.Add((float)rnd());
            }
            return new NebulaShape { Ground = ground, Stars = stars.ToArray() };
        }
    }
}
