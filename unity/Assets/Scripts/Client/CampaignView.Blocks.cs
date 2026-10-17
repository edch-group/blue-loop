using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UMesh = UnityEngine.Mesh;

/// <summary>
/// The map's land collapsing as solid blocks: it breaks along the ink mesh drawn into it (GroundCore.cginc), each cell
/// of it a block whose top is the land over that cell (hills and all) and whose sides go straight down to a flat bottom
/// a slab's depth under its lowest point. As the collapse sweeps along the route, cell by cell (each a little ahead of
/// it or behind, at random), the land there is gone (Ground.shader) and its block parts from its neighbours, tumbles
/// and falls into the abyss, shrinking and darkening (Blocks.shader). The cells left standing round the hole show their
/// sides, the cliff it is cut into. Each collapse's blocks are built once, as one mesh, and animated on the GPU from
/// how far the collapse has swept; gone once the last has fallen out of sight. Land already gone when it is first seen
/// (a run carried on, a new land) is simply gone: no blocks.
/// </summary>
public partial class CampaignView
{
    // ---- Tuning ----
    /// <summary>A block's size: a cell of the ink mesh (two of the land mesh's cells across; GroundCore.cginc's CELL).</summary>
    const float BlockCell = (float)(BlueLoop.Models.NebulaGeometry.Cell * 2);
    /// <summary>How deep a block's flat bottom lies under the lowest point of its top (web units).</summary>
    const float BlockDepth = 0.2f;
    /// <summary>How far ahead of the collapse a cell may break, at random (columns: as the shards did, 0.45 × 1.6).</summary>
    const float BlockRagged = 0.72f;
    /// <summary>How long a block takes to fall out of sight (seconds), how far it shrinks from its neighbours as it parts,
    /// how fast it falls (half its acceleration, web units a second squared).</summary>
    const float BlockLife = 2.4f, BlockGap = 0.07f, BlockDrop = 2.0f;
    /// <summary>How fast the collapse sweeps along the route (columns a second): the land's and its blocks' alike.</summary>
    const float SweepRate = 1.3f;
    /// <summary>How far a standing cell's cliff is set in from its border (clear of a block just parting from it).</summary>
    const float RimInset = 0.004f;

    /// <summary>The land cut into the ink mesh's cells: which of the ground's triangles lie in each, and when each goes.</summary>
    class LandCells
    {
        public int Nx, Nz;
        public float[] G;
        /// <summary>Each cell's triangles (the index of each one's first corner in the ground's data).</summary>
        public List<int>[] Tris;
        /// <summary>How far along the route each cell lies (its shards', by area), its random number, its key (it goes
        /// once the collapse passes it), and how far its nearest shard lies (soft below the menu's break, if that is less).</summary>
        public float[] Prog, Rand, Key, MinShard;
        public bool Has(int i, int j) => i >= 0 && j >= 0 && i < Nx && j < Nz && Tris[j * Nx + i] != null;
    }

    LandCells landCells;
    Transform groundT;
    Material blocksMat;
    MaterialPropertyBlock blockProps;
    GameObject rimGo;
    /// <summary>Keys up to here have broken away (or were gone when first seen); the cliff as built, for where the land
    /// is gone to and where it was soft.</summary>
    float blocksUpTo = -1e9f, rimGone = float.NaN, rimSoft = float.NaN, softBelowNow = -1e9f;

    class BlockBatch
    {
        public GameObject Go;
        public MeshRenderer R;
        public float Sweep, End;
    }

    readonly List<BlockBatch> batches = new List<BlockBatch>();

    static float GridAt(float v, float origin) => (v - origin) / BlockCell;
    static float X0f => (float)BlueLoop.Models.NebulaGeometry.X0;
    static float Z0f => (float)BlueLoop.Models.NebulaGeometry.Z0;

    /// <summary>Which grid line (k) a coordinate lies on, if it lies on one.</summary>
    static bool OnLine(float v, float origin, out int k)
    {
        float t = GridAt(v, origin);
        k = Mathf.RoundToInt(t);
        return Mathf.Abs(t - k) < 2e-3f;
    }

    /// <summary>The land (the ground's data) cut into cells: each triangle to the cell its middle lies in.</summary>
    static LandCells CutLand(float[] g, double seed)
    {
        const int S = BlueLoop.Models.NebulaGeometry.GroundStride;
        var c = new LandCells
        {
            G = g,
            Nx = Mathf.CeilToInt((float)((BlueLoop.Models.NebulaGeometry.X1 - BlueLoop.Models.NebulaGeometry.X0) / BlockCell)) + 1,
            Nz = Mathf.CeilToInt((float)((BlueLoop.Models.NebulaGeometry.Z1 - BlueLoop.Models.NebulaGeometry.Z0) / BlockCell)) + 1,
        };
        int n = c.Nx * c.Nz;
        c.Tris = new List<int>[n];
        c.Prog = new float[n];
        c.Rand = new float[n];
        c.Key = new float[n];
        c.MinShard = new float[n];
        var area = new float[n];
        for (int k = 0; k < n; k++) c.MinShard[k] = float.MaxValue;
        int tris = g.Length / S / 3;
        for (int t = 0; t < tris; t++)
        {
            int o = t * 3 * S;
            float ax = g[o], az = g[o + 2], bx = g[o + S], bz = g[o + S + 2], cx = g[o + 2 * S], cz = g[o + 2 * S + 2];
            int i = Mathf.Clamp(Mathf.FloorToInt(GridAt((ax + bx + cx) / 3, X0f)), 0, c.Nx - 1);
            int j = Mathf.Clamp(Mathf.FloorToInt(GridAt((az + bz + cz) / 3, Z0f)), 0, c.Nz - 1);
            int at = j * c.Nx + i;
            (c.Tris[at] ??= new List<int>()).Add(o);
            float a = Mathf.Abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) * 0.5f + 1e-7f;
            float prog = g[o + 16];
            c.Prog[at] += prog * a;
            area[at] += a;
            c.MinShard[at] = Mathf.Min(c.MinShard[at], prog);
        }
        float salt = (float)(System.Math.Abs(seed) % 997) * 0.731f;
        for (int k = 0; k < n; k++)
        {
            if (c.Tris[k] == null) continue;
            c.Prog[k] /= area[k];
            int i = k % c.Nx, j = k / c.Nx;
            float h = Mathf.Sin(i * 12.9898f + j * 78.233f + salt) * 43758.5453f;
            c.Rand[k] = h - Mathf.Floor(h);
            c.Key[k] = c.Prog[k] - BlockRagged * c.Rand[k];
        }
        return c;
    }

    /// <summary>The map's land mesh, breaking along its cells: its cracks on the cells' borders, each corner knowing its
    /// cell's key, place and nearest shard (Ground.shader's _Cells; the abyss's alike).</summary>
    static void CellGround(UMesh m, LandCells c)
    {
        const int S = BlueLoop.Models.NebulaGeometry.GroundStride;
        var g = c.G;
        int count = g.Length / S;
        var edge = new List<Vector3>(count);
        var prog = new List<Vector4>(count);
        // (In the ground's own order: each triangle's corners, each edge opposite a corner flagged if on a cell's border.)
        var cellOf = new int[count / 3];
        for (int k = 0; k < c.Tris.Length; k++)
            if (c.Tris[k] != null)
                foreach (var o in c.Tris[k]) cellOf[o / S / 3] = k;
        for (int t = 0; t < count / 3; t++)
        {
            int o = t * 3 * S, cell = cellOf[t];
            var flags = new Vector3(
                Border(g, o + S, o + 2 * S) ? 1 : 0,
                Border(g, o + 2 * S, o) ? 1 : 0,
                Border(g, o, o + S) ? 1 : 0);
            var p = new Vector4(0, c.Key[cell], c.Prog[cell], c.MinShard[cell]);
            for (int k = 0; k < 3; k++)
            {
                edge.Add(flags);
                p.x = g[o + k * S + 16];
                prog.Add(p);
            }
        }
        m.SetUVs(1, edge);
        m.SetUVs(3, prog);
    }

    /// <summary>Whether the edge between two corners (offsets into the ground's data) lies along a cell's border.</summary>
    static bool Border(float[] g, int a, int b)
    {
        if (OnLine(g[a], X0f, out var ka) && OnLine(g[b], X0f, out var kb) && ka == kb) return true;
        return OnLine(g[a + 2], Z0f, out ka) && OnLine(g[b + 2], Z0f, out kb) && ka == kb;
    }

    /// <summary>A new land: its cells, and none of its blocks yet.</summary>
    void NewBlocks(Transform ground, float[] g, double seed)
    {
        foreach (var b in batches) if (b.Go != null) Mats.Kill(b.Go);
        batches.Clear();
        if (rimGo != null) Mats.Kill(rimGo);
        rimGo = null;
        if (blocksMat != null) Mats.Kill(blocksMat);
        groundT = ground;
        landCells = CutLand(g, seed);
        blocksMat = Mats.Make("Blocks");
        blocksMat.SetFloat("_G", G);
        blocksMat.SetFloat("_Rate", SweepRate);
        blocksMat.SetFloat("_Life", BlockLife);
        blocksMat.SetFloat("_Gap", BlockGap);
        blocksMat.SetFloat("_Drop", BlockDrop);
        blockProps ??= new MaterialPropertyBlock();
        blocksUpTo = -1e9f;
        rimGone = rimSoft = float.NaN;
    }

    bool Blocky(int k) => landCells.MinShard[k] >= softBelowNow;

    /// <summary>
    /// The collapse come on (Collapse): the cells it has newly passed break away, as one batch of blocks, each going as
    /// the land's collapse sweeps past its key; the cliff round the hole built afresh. Snapped (a first look, going back,
    /// a new land), what is gone is simply gone.
    /// </summary>
    void BreakAway(bool snapped)
    {
        if (landCells == null || groundT == null) return;
        var c = landCells;
        if (snapped)
        {
            foreach (var b in batches) if (b.Go != null) Mats.Kill(b.Go);
            batches.Clear();
            blocksUpTo = goneNow;
        }
        bool shown = groundT.gameObject.activeSelf;
        if (goneTarget > blocksUpTo)
        {
            var list = new List<int>();
            float last = blocksUpTo;
            for (int k = 0; k < c.Tris.Length; k++)
                if (c.Tris[k] != null && c.Key[k] > blocksUpTo && c.Key[k] <= goneTarget && Blocky(k))
                {
                    list.Add(k);
                    last = Mathf.Max(last, c.Key[k]);
                }
            if (list.Count > 0 && shown && Application.isPlaying)
            {
                var t = Thing("Blocks", groundT, BlockMesh(list, true), blocksMat);
                t.gameObject.layer = groundT.gameObject.layer;
                t.gameObject.AddComponent<MeshOwner>();
                var b = new BlockBatch { Go = t.gameObject, R = t.GetComponent<MeshRenderer>(), Sweep = goneNow, End = last + (BlockLife + 0.2f) * SweepRate };
                batches.Add(b);
                SweepBatch(b);
            }
            blocksUpTo = goneTarget;
        }
        if (rimGone != goneTarget || rimSoft != softBelowNow) Cliff(shown);
    }

    /// <summary>The cliff round the hole: the sides of each cell standing beside one gone (or going), under the land.</summary>
    void Cliff(bool shown)
    {
        if (rimGo != null) Mats.Kill(rimGo);
        rimGo = null;
        rimGone = goneTarget;
        rimSoft = softBelowNow;
        if (!shown) return;
        var c = landCells;
        var list = new List<int>();
        for (int k = 0; k < c.Tris.Length; k++)
        {
            if (c.Tris[k] == null || c.Key[k] <= goneTarget || !Blocky(k)) continue;
            int i = k % c.Nx, j = k / c.Nx;
            if (Open(i - 1, j) || Open(i + 1, j) || Open(i, j - 1) || Open(i, j + 1)) list.Add(k);
        }
        if (list.Count == 0) return;
        var t = Thing("Cliff", groundT, BlockMesh(list, false), blocksMat);
        t.gameObject.layer = groundT.gameObject.layer;
        t.gameObject.AddComponent<MeshOwner>();
        rimGo = t.gameObject;
    }

    /// <summary>Whether a cell is gone, or going in the collapse now under way.</summary>
    bool Open(int i, int j) => landCells.Has(i, j) && landCells.Key[j * landCells.Nx + i] <= goneTarget;

    /// <summary>The blocks' collapse sweeping on with the land's (Update), the land's own clock and look with it; each
    /// batch gone once its last block has fallen out of sight.</summary>
    void BlocksTick(float dt)
    {
        if (blocksMat == null) return;
        blocksMat.SetFloat("_T", landClock);
        blocksMat.SetFloat("_Crack", crackNow);
        for (int i = batches.Count - 1; i >= 0; i--)
        {
            var b = batches[i];
            b.Sweep += dt * SweepRate;
            if (b.Go == null || b.Sweep > b.End)
            {
                if (b.Go != null) Mats.Kill(b.Go);
                batches.RemoveAt(i);
                continue;
            }
            SweepBatch(b);
        }
    }

    void SweepBatch(BlockBatch b)
    {
        blockProps.SetFloat("_Sweep", b.Sweep);
        b.R.SetPropertyBlock(blockProps);
    }

    /// <summary>
    /// The blocks of some cells, as one mesh: breaking away (each its top, its sides, its bottom), or standing (only its
    /// sides beside a cell gone, set in a hair). Each corner knows its block's middle and random number, its key, which
    /// face it is on and where on it, whether it breaks away, and how far along the route its cell lies.
    /// </summary>
    UMesh BlockMesh(List<int> list, bool falling)
    {
        const int S = BlueLoop.Models.NebulaGeometry.GroundStride;
        var c = landCells;
        var g = c.G;
        var pos = new List<Vector3>();
        var nrm = new List<Vector3>();
        var mid = new List<Vector4>();
        var face = new List<Vector4>();
        var more = new List<Vector2>();
        var tris = new List<int>();
        foreach (var k in list)
        {
            int ci = k % c.Nx, cj = k / c.Nx;
            float cellX = X0f + ci * BlockCell, cellZ = Z0f + cj * BlockCell;
            float minX = float.MaxValue, maxX = float.MinValue, minZ = float.MaxValue, maxZ = float.MinValue, low = float.MaxValue, sum = 0;
            int corners = 0;
            foreach (var o in c.Tris[k])
                for (int v = 0; v < 3; v++)
                {
                    int q = o + v * S;
                    minX = Mathf.Min(minX, g[q]);
                    maxX = Mathf.Max(maxX, g[q]);
                    minZ = Mathf.Min(minZ, g[q + 2]);
                    maxZ = Mathf.Max(maxZ, g[q + 2]);
                    low = Mathf.Min(low, g[q + 1]);
                    sum += g[q + 1];
                    corners++;
                }
            float bottom = low - BlockDepth;
            var m = new Vector4((minX + maxX) / 2, (sum / corners + bottom) / 2, (minZ + maxZ) / 2, c.Rand[k]);
            var more1 = new Vector2(falling ? 1 : 0, c.Prog[k]);
            float key = c.Key[k];
            void Corner(Vector3 p, Vector3 n, float f, float across, float down)
            {
                pos.Add(p);
                nrm.Add(n);
                mid.Add(m);
                face.Add(new Vector4(key, f, across, down));
                more.Add(more1);
            }
            foreach (var o in c.Tris[k])
            {
                // Its top: the land over the cell, as it lay.
                if (falling)
                {
                    int at = pos.Count;
                    for (int v = 0; v < 3; v++)
                    {
                        int q = o + v * S;
                        Corner(new Vector3(g[q], g[q + 1], g[q + 2]), new Vector3(g[q + 3], g[q + 4], g[q + 5]), 0, 0, 0);
                    }
                    tris.Add(at);
                    tris.Add(at + 1);
                    tris.Add(at + 2);
                }
                // Its sides: down from each edge of it along the cell's border, to its flat bottom.
                for (int e = 0; e < 3; e++)
                {
                    int a = o + e * S, b = o + (e + 1) % 3 * S;
                    Vector3 out1;
                    float acrossA, acrossB;
                    int ni = ci, nj = cj;
                    if (OnLine(g[a], X0f, out var ka) && OnLine(g[b], X0f, out var kb) && ka == kb)
                    {
                        out1 = new Vector3(ka <= ci ? -1 : 1, 0, 0);
                        ni += ka <= ci ? -1 : 1;
                        acrossA = (g[a + 2] - cellZ) / BlockCell;
                        acrossB = (g[b + 2] - cellZ) / BlockCell;
                    }
                    else if (OnLine(g[a + 2], Z0f, out ka) && OnLine(g[b + 2], Z0f, out kb) && ka == kb)
                    {
                        out1 = new Vector3(0, 0, ka <= cj ? -1 : 1);
                        nj += ka <= cj ? -1 : 1;
                        acrossA = (g[a] - cellX) / BlockCell;
                        acrossB = (g[b] - cellX) / BlockCell;
                    }
                    else continue;
                    // (Standing, only where the cell beside it is gone.)
                    if (!falling && !Open(ni, nj)) continue;
                    var inset = falling ? Vector3.zero : -out1 * RimInset;
                    var pa = new Vector3(g[a], g[a + 1], g[a + 2]) + inset;
                    var pb = new Vector3(g[b], g[b + 1], g[b + 2]) + inset;
                    int at = pos.Count;
                    Corner(pa, out1, 1, acrossA, 0);
                    Corner(pb, out1, 1, acrossB, 0);
                    Corner(new Vector3(pb.x, bottom, pb.z), out1, 1, acrossB, 1);
                    Corner(new Vector3(pa.x, bottom, pa.z), out1, 1, acrossA, 1);
                    tris.AddRange(new[] { at, at + 1, at + 2, at, at + 2, at + 3 });
                }
            }
            // Its bottom, flat.
            if (falling)
            {
                int at = pos.Count;
                Corner(new Vector3(minX, bottom, minZ), Vector3.down, 2, 0.5f, 0.5f);
                Corner(new Vector3(maxX, bottom, minZ), Vector3.down, 2, 0.5f, 0.5f);
                Corner(new Vector3(maxX, bottom, maxZ), Vector3.down, 2, 0.5f, 0.5f);
                Corner(new Vector3(minX, bottom, maxZ), Vector3.down, 2, 0.5f, 0.5f);
                tris.AddRange(new[] { at, at + 1, at + 2, at, at + 2, at + 3 });
            }
        }
        var mesh = new UMesh { name = falling ? "blocks" : "cliff", indexFormat = pos.Count > 65000 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
        mesh.SetVertices(pos);
        mesh.SetNormals(nrm);
        mesh.SetUVs(0, mid);
        mesh.SetUVs(1, face);
        mesh.SetUVs(2, more);
        mesh.SetTriangles(tris, 0);
        mesh.RecalculateBounds();
        // (Falling blocks drop well below the land, drifting a little: never culled as they go.)
        if (falling)
        {
            var bounds = mesh.bounds;
            bounds.Expand(new Vector3(3, 30, 3));
            mesh.bounds = bounds;
        }
        return mesh;
    }
}
