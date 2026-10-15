using System;
using System.Collections.Generic;

namespace BlueLoop.Models
{
    /// <summary>
    /// The Captain as Meshy made and rigged him (scripts/bake-captain.py: Resources/Models/Captain.bytes): his figure, his
    /// skeleton and his poses, solved when baked (unity/ModelSources/captain/poses.json). Held in a pose and never quite
    /// still: he breathes, shifts his weight and looks about, each bone turned a little about its joint, all he hangs from
    /// it following. Laid out as his old figure (CaptainModels.cs): his box units, 40 tall, feet at 0, centred on x 20 and
    /// y 12, facing +y, his left +x (mirrored, as the ship's box is: the scenes mirror it back); given as the models are,
    /// +x forward, +y up, 1 long (B: (x - 20) / 40, z / 40, (y - 12) / 40).
    /// </summary>
    public sealed class CaptainFigure
    {
        /// <summary>Where his bytes come from (Unity: Resources; the tests: the file).</summary>
        public static Func<byte[]> Source;

        sealed class Rig
        {
            public float[] Pos, Nor, Uv;
            public int[] Tris;
            public byte[] Bone, Weight;
            public string[] Names;
            public int[] Parent, Order;
            public float[][] RestInv;
            public Dictionary<string, float[][]> Poses = new Dictionary<string, float[][]>();
        }

        static Rig rig;

        static Rig Load()
        {
            if (rig != null) return rig;
            var bytes = Source?.Invoke() ?? throw new InvalidOperationException("the Captain (Models/Captain.bytes) is not loaded");
            using (var r = new System.IO.BinaryReader(new System.IO.MemoryStream(bytes)))
            {
                if (new string(r.ReadChars(4)) != "BLCR") throw new InvalidOperationException("not the Captain");
                if (r.ReadInt32() != 1) throw new InvalidOperationException("the Captain is an old bake (scripts/bake-captain.py)");
                int nv = r.ReadInt32(), nt = r.ReadInt32(), nb = r.ReadInt32(), np = r.ReadInt32();
                float q = r.ReadSingle();
                var g = new Rig { Pos = new float[nv * 3], Nor = new float[nv * 3], Uv = new float[nv * 2], Bone = new byte[nv * 4], Weight = new byte[nv * 4] };
                for (int i = 0; i < nv; i++)
                {
                    for (int c = 0; c < 3; c++) g.Pos[i * 3 + c] = r.ReadInt16() / q;
                    for (int c = 0; c < 3; c++) g.Nor[i * 3 + c] = r.ReadSByte() / 127f;
                    for (int c = 0; c < 2; c++) g.Uv[i * 2 + c] = r.ReadUInt16() / 65535f;
                    for (int c = 0; c < 4; c++) g.Bone[i * 4 + c] = r.ReadByte();
                    for (int c = 0; c < 4; c++) g.Weight[i * 4 + c] = r.ReadByte();
                }
                g.Tris = new int[nt * 3];
                for (int i = 0; i < nt * 3; i++) g.Tris[i] = nv > 65535 ? (int)r.ReadUInt32() : r.ReadUInt16();
                g.Names = new string[nb];
                g.Parent = new int[nb];
                g.RestInv = new float[nb][];
                for (int b = 0; b < nb; b++)
                {
                    g.Names[b] = new string(r.ReadChars(r.ReadByte()));
                    g.Parent[b] = r.ReadInt16();
                    g.RestInv[b] = Inverse(Read(r));
                }
                for (int p = 0; p < np; p++)
                {
                    var name = new string(r.ReadChars(r.ReadByte()));
                    var m = new float[nb][];
                    for (int b = 0; b < nb; b++) m[b] = Read(r);
                    g.Poses[name] = m;
                }
                // (Each bone after its parent, so a turn reaches all below it.)
                var order = new List<int>();
                var done = new bool[nb];
                while (order.Count < nb)
                    for (int b = 0; b < nb; b++)
                        if (!done[b] && (g.Parent[b] < 0 || done[g.Parent[b]])) { done[b] = true; order.Add(b); }
                g.Order = order.ToArray();
                return rig = g;
            }
        }

        static float[] Read(System.IO.BinaryReader r)
        {
            var m = new float[16];
            for (int i = 0; i < 16; i++) m[i] = r.ReadSingle();
            return m;
        }

        /// <summary>His poses, by name (poses.json).</summary>
        public static IEnumerable<string> Poses => Load().Poses.Keys;

        /// <summary>The place in his texture of each corner (u, v: v from its foot), and his triangles; these never change.</summary>
        public float[] Uv => g.Uv;
        public int[] Tris => g.Tris;
        /// <summary>Each corner's place and normal as he stands now (Pose), in the models' axes.</summary>
        public readonly float[] Pos, Nor;
        public int Count => g.Pos.Length / 3;

        readonly Rig g;
        readonly float[][] pose;
        readonly float[][] skin;
        readonly float[][] moved;

        public CaptainFigure(string pose)
        {
            g = Load();
            if (!g.Poses.TryGetValue(pose, out this.pose)) throw new ArgumentException($"the Captain has no pose {pose}");
            Pos = new float[g.Pos.Length];
            Nor = new float[g.Nor.Length];
            skin = new float[g.Names.Length][];
            moved = new float[g.Names.Length][];
            idle = new (int, float[], Func<double, double>)[Idle.Length];
            int n = 0;
            foreach (var (bone, axis, angle) in Idle)
            {
                int b = Array.IndexOf(g.Names, bone);
                if (b >= 0) idle[n++] = (b, axis, angle);
            }
            Array.Resize(ref idle, n);
            Pose(0);
        }

        // His box's axes: across him (x), ahead of him (y), up (z).
        static readonly float[] Across = { 1, 0, 0 }, Ahead = { 0, 1, 0 }, Up = { 0, 0, 1 };
        static double Wave(double t, double period, double phase = 0) => Math.Sin(2 * Math.PI * t / period + phase);

        /// <summary>
        /// What moves as he stands (degrees about his box's axes, turned about the bone's joint): his chest rising and
        /// falling with his breath, his shoulders with it; his weight shifting; his head turning slowly as he looks about.
        /// </summary>
        static readonly (string bone, float[] axis, Func<double, double> angle)[] Idle =
        {
            ("Spine02", Up, t => 1.2 * Wave(t, 7.3)),
            ("Spine02", Ahead, t => 0.6 * Wave(t, 9.1, 1)),
            ("Spine01", Across, t => -0.9 * Wave(t, 4.2)),
            ("Spine", Across, t => -0.7 * Wave(t, 4.2, 0.4)),
            ("LeftShoulder", Ahead, t => -1.0 * Wave(t, 4.2, 0.6)),
            ("RightShoulder", Ahead, t => 1.0 * Wave(t, 4.2, 0.6)),
            ("LeftForeArm", Across, t => 1.2 * Wave(t, 4.2, 0.9)),
            ("RightForeArm", Across, t => 1.2 * Wave(t, 4.2, 0.9)),
            ("Head", Up, t => 5 * Wave(t, 11) + 2 * Wave(t, 4.7, 2)),
            ("Head", Across, t => 1.5 * Wave(t, 6.1, 1)),
        };

        readonly (int bone, float[] axis, Func<double, double> angle)[] idle;

        /// <summary>Stand him as he is at this moment (seconds): Pos and Nor set.</summary>
        public void Pose(double t)
        {
            var turn = new float[16];
            foreach (var b in g.Order)
            {
                int p = g.Parent[b];
                var d = p >= 0 ? moved[p] : Identity();
                // (Turned about its joint, where its parent's turns have put it.)
                var at = Apply(d, pose[b][3], pose[b][7], pose[b][11]);
                foreach (var (bone, axis, angle) in idle)
                {
                    if (bone != b) continue;
                    Rotation(axis, angle(t) * Math.PI / 180, turn);
                    turn[3] = at.x - (turn[0] * at.x + turn[1] * at.y + turn[2] * at.z);
                    turn[7] = at.y - (turn[4] * at.x + turn[5] * at.y + turn[6] * at.z);
                    turn[11] = at.z - (turn[8] * at.x + turn[9] * at.y + turn[10] * at.z);
                    d = Mul(turn, d);
                }
                moved[b] = d;
                skin[b] = Mul(Mul(d, pose[b]), g.RestInv[b]);
            }
            for (int i = 0, n = Count; i < n; i++)
            {
                float x = g.Pos[i * 3], y = g.Pos[i * 3 + 1], z = g.Pos[i * 3 + 2];
                float nx = g.Nor[i * 3], ny = g.Nor[i * 3 + 1], nz = g.Nor[i * 3 + 2];
                float px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
                for (int k = 0; k < 4; k++)
                {
                    int w = g.Weight[i * 4 + k];
                    if (w == 0) continue;
                    float f = w / 255f;
                    var m = skin[g.Bone[i * 4 + k]];
                    px += f * (m[0] * x + m[1] * y + m[2] * z + m[3]);
                    py += f * (m[4] * x + m[5] * y + m[6] * z + m[7]);
                    pz += f * (m[8] * x + m[9] * y + m[10] * z + m[11]);
                    qx += f * (m[0] * nx + m[1] * ny + m[2] * nz);
                    qy += f * (m[4] * nx + m[5] * ny + m[6] * nz);
                    qz += f * (m[8] * nx + m[9] * ny + m[10] * nz);
                }
                // (His box to the models' axes.)
                Pos[i * 3] = (px - 20) / 40;
                Pos[i * 3 + 1] = pz / 40;
                Pos[i * 3 + 2] = (py - 12) / 40;
                float l = (float)Math.Sqrt(qx * qx + qy * qy + qz * qz) + 1e-9f;
                Nor[i * 3] = qx / l;
                Nor[i * 3 + 1] = qz / l;
                Nor[i * 3 + 2] = qy / l;
            }
        }

        /// <summary>
        /// Him as one of the models' vertex arrays (stride 10: place, normal, colour, material), still, in a pose: his
        /// place in his texture in the colour's red and green, material 11 (the ship shader paints him from his texture).
        /// </summary>
        public static float[] Model(string pose)
        {
            if (still.TryGetValue(pose, out var made)) return made;
            var f = new CaptainFigure(pose);
            var v = new float[f.Tris.Length * 10];
            for (int i = 0; i < f.Tris.Length; i++)
            {
                int c = f.Tris[i], k = i * 10;
                for (int a = 0; a < 3; a++) { v[k + a] = f.Pos[c * 3 + a]; v[k + 3 + a] = f.Nor[c * 3 + a]; }
                v[k + 6] = f.Uv[c * 2];
                v[k + 7] = f.Uv[c * 2 + 1];
                v[k + 9] = 11;
            }
            return still[pose] = v;
        }

        static readonly Dictionary<string, float[]> still = new Dictionary<string, float[]>();

        static float[] Identity() => new float[] { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 };

        static (float x, float y, float z) Apply(float[] m, float x, float y, float z) =>
            (m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]);

        static float[] Mul(float[] a, float[] b)
        {
            var m = new float[16];
            for (int r = 0; r < 4; r++)
                for (int c = 0; c < 4; c++)
                    m[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
            return m;
        }

        /// <summary>A turn of the angle (radians) about a unit axis, into m (its last row and column left as a rigid move's).</summary>
        static void Rotation(float[] a, double angle, float[] m)
        {
            float c = (float)Math.Cos(angle), s = (float)Math.Sin(angle), k = 1 - c, x = a[0], y = a[1], z = a[2];
            m[0] = c + x * x * k; m[1] = x * y * k - z * s; m[2] = x * z * k + y * s;
            m[4] = y * x * k + z * s; m[5] = c + y * y * k; m[6] = y * z * k - x * s;
            m[8] = z * x * k - y * s; m[9] = z * y * k + x * s; m[10] = c + z * z * k;
            m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
        }

        /// <summary>A rigid move's inverse (its turn's transpose, and back by where it moved).</summary>
        static float[] Inverse(float[] m)
        {
            var r = new float[16];
            for (int i = 0; i < 3; i++)
                for (int j = 0; j < 3; j++) r[i * 4 + j] = m[j * 4 + i];
            for (int i = 0; i < 3; i++) r[i * 4 + 3] = -(r[i * 4] * m[3] + r[i * 4 + 1] * m[7] + r[i * 4 + 2] * m[11]);
            r[15] = 1;
            return r;
        }
    }
}
