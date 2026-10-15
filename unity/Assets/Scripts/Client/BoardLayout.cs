using UnityEngine;

/// <summary>
/// The battle laid out as the web lays it out at the screen's size, phone first (styles.css .table-view and the board
/// inside it, app.ts fitHand): every size the web works out from vw, vh and clamp(), in the web's own pixels at its
/// layout size (Css.Size). Boxes on the board are in the board's own pixels before its tilt (x right, y down, from the
/// top-left of the board's box, .table-view &gt; .game); the hand, the HUD and the rival's hand in the page's.
/// <see cref="Current"/> is worked out again whenever the screen changes size.
/// </summary>
public class BoardLayout
{
    // The page.
    public float W, H, Vw, Vh;
    /// <summary>A short (phone) screen: the web's (orientation: landscape) and (max-height: 560px) rules.</summary>
    public bool Phone;
    /// <summary>The page's padding clear of the safe area (--pad-t, -r, -b, -l).</summary>
    public float PadT, PadR, PadB, PadL;
    /// <summary>The grid's gap (--gap).</summary>
    public float Gap;

    // The board's box (.table-view &gt; .game) and its sizes.
    public float Gw, Gh, Inset, Reach, Drop, GameLeft, GameTop, GameH;
    /// <summary>A card's width on the board (--tcw), the gap between slots, the room each row's ends get (--row-side).</summary>
    public float Tcw, SlotGap, RowSide;
    /// <summary>A sun's size (the row's --vs) and the tableau's outline padding (--frame-pad).</summary>
    public float Vs, FramePad;
    /// <summary>The board's play area (.board-plane): its top and height, and its middle (where the Stellari lies).</summary>
    public float PlaneTop, PlaneH, PlaneCy;
    /// <summary>Each row's middle, down the board.</summary>
    public float RivalRowCy, MyRowCy;
    /// <summary>The left edge of the six columns, and of the row's whole width (sun to piles).</summary>
    public float RowLeft, WrapLeft, WrapRight;
    /// <summary>The piles: a pile's width (--pw), the gap between them, the left edge of the three.</summary>
    public float Pw, PileGap, PilesLeft;
    /// <summary>The hand count's pill height, and the names' size.</summary>
    public float HandPillH, NameSize;
    /// <summary>The middle: the Stellari's size, the round's disc, how far the words either side stand off (--stellari-r).</summary>
    public float Star, Round, RoundNum, RoundEm, StellariR, PhaseFont, PhaseSpacing, PhaseDot, PhaseGap, PhaseRowGap;
    /// <summary>The eye by each row: its size.</summary>
    public float Eye;

    // The hand (.table-view &gt; .dock): its box on the page, a card's width.
    public float HandLeft, HandW, HandTop, HandBottom, HandCard, DockHh;

    /// <summary>A rival card back's width (.rival-hand --rhw).</summary>
    public float RivalBack;

    public float Pitch => Tcw + SlotGap;
    public float PilesW => 3 * Pw + 2 * PileGap;

    static BoardLayout current;
    static Vector2 madeFor;
    static Vector4 madeInsets;
    static int checkedAt = -1;

    /// <summary>The layout for the screen as it is now (worked out again when its size or safe area changes).</summary>
    public static BoardLayout Current
    {
        get
        {
            // (Looked at once a frame: the screen's size comes from the browser.)
            if (current != null && checkedAt == Time.frameCount && Application.isPlaying) return current;
            checkedAt = Time.frameCount;
            var size = Css.Size;
            var insets = Css.SafeInsets;
            if (current == null || (size - madeFor).sqrMagnitude > 0.01f || (insets - madeInsets).sqrMagnitude > 0.01f)
            {
                current = new BoardLayout(size, Css.Screen, insets);
                madeFor = size;
                madeInsets = insets;
            }
            return current;
        }
    }

    static float Clamp(float min, float v, float max) => Css.Clamp(min, v, max);

    /// <param name="size">The page's layout size (Css.Size).</param>
    /// <param name="screen">The screen in CSS pixels before zoom (the rival's backs are sized by it: vw units).</param>
    /// <param name="safe">The safe area's insets in layout pixels: top, right, bottom, left.</param>
    public BoardLayout(Vector2 size, Vector2 screen, Vector4 safe)
    {
        W = size.x;
        H = size.y;
        Vw = W / 100;
        Vh = H / 100;
        Phone = screen.y <= 560;
        PadT = Mathf.Max(6, safe.x);
        PadR = Mathf.Max(12, safe.y);
        PadB = Mathf.Max(6, safe.z);
        PadL = Mathf.Max(12, safe.w);
        Gap = Clamp(6, 1.4f * Vh, 14);

        // .table-view: the table keeps one shape whatever the window (--gw, --gh); .game: its inset, its reach back
        // and the hand's drop over its front edge, its height and its place.
        Gw = Mathf.Min(100 * Vw, H * 2.2f);
        Gh = Mathf.Min(112 * Vh, Gw * 0.64f);
        Inset = Clamp(14, 2.6f * Vh, 24);
        Reach = Gh * 0.07f;
        float hh = Mathf.Min(33 * Vh, 270) * 0.78f, hvis = hh * 0.5f;
        Drop = hvis * 0.6f;
        GameH = Gh + Reach - Drop;
        GameTop = (100 * Vh - Gh) / 2 - 2 * Vh - Reach;
        GameLeft = (W - Gw) / 2;

        // The cards on the board (--tcw): six across with their gaps, capped by the board's height share, 150 px, and the
        // room the rows' ends leave.
        SlotGap = Clamp(6, 1.4f * Vw, 18);
        float rowVs = Clamp(84, Gh / 112 * 23, 168);
        RowSide = 1.3f * rowVs;
        float boardW = Gw - 2 * Inset - Clamp(8, 1.6f * Vw, 20) - 24;
        Tcw = Mathf.Min(Mathf.Min((boardW - 5 * SlotGap - 12) / 6, Gh / 1.12f * (Phone ? 0.215f : 0.262f) * 0.714f),
            Mathf.Min(150, (Gw * 0.95f - 2 * Inset - 24 - 2 * RowSide - 5 * SlotGap - 12) / 6));
        Vs = Phone ? 20 * Vh : rowVs;
        FramePad = Clamp(10, 1.8f * Vh, 16);

        // .board-plane: under the board's padding, a gap, then the rows at its top and foot (4 px in), the room for the
        // hand's place below it.
        PlaneTop = Inset + Reach + Gap;
        PlaneH = Gh - 2 * Inset - 2 * Gap - hvis;
        PlaneCy = PlaneTop + PlaneH / 2;
        RivalRowCy = PlaneTop + 4 + 0.7f * Tcw;
        MyRowCy = PlaneTop + PlaneH - 4 - 0.7f * Tcw;
        RowLeft = Gw / 2 - (6 * Tcw + 5 * SlotGap) / 2;
        WrapLeft = Inset + 12;
        WrapRight = Gw - Inset - 12;

        // .tableau-piles: three piles at the row's right end; the hand count above yours (below theirs), the name beyond.
        PileGap = Clamp(8, 1.2f * Vw, 16);
        Pw = Mathf.Min(Tcw * 0.6f, (RowSide - 2 * PileGap) / 3 - 6);
        PilesLeft = WrapRight - PilesW;
        HandPillH = Mathf.Max(20, Pw * 0.26f);
        NameSize = Clamp(8, 1.6f * Vh, 12);
        Eye = Clamp(26, Tcw * 0.3f, 40);

        // The middle: the Stellari (104 px on a phone), the round's disc, whose turn and the day's phases either side.
        Star = Phone ? 104 : 160;
        Round = Phone ? 27 : Clamp(34, 5.4f * Vh, 70);
        RoundNum = Phone ? 11 : Clamp(12, 2 * Vh, 23);
        RoundEm = Phone ? 6 : Clamp(7, 1.1f * Vh, 12);
        StellariR = Phone ? 48 : 74;
        PhaseFont = Phone ? 7 : Clamp(8, 1.5f * Vh, 11);
        PhaseSpacing = Phone ? 18 : 24;
        PhaseDot = Phone ? 6 : 9;
        PhaseGap = Phone ? 5 : 8;
        PhaseRowGap = Phone ? 4 : Clamp(5, 1.4f * Vh, 10);

        // The hand (.table-view &gt; .dock): between the dock's two side columns, its foot 9% of --hh up.
        DockHh = Mathf.Min(23 * Vh, 186);
        float side = Phone ? Clamp(96, 15 * Vw, 150) : Clamp(124, 15 * Vw, 210);
        HandCard = Mathf.Min(33 * Vh, 270) * 0.714f * 0.78f;
        HandLeft = side + Gap;
        HandW = W - 2 * side - 2 * Gap;
        HandBottom = H - DockHh * 0.09f;
        HandTop = HandBottom - HandCard * 1.4f * 0.72f;

        RivalBack = Clamp(40, 0.043f * screen.x, 64);
    }

    // ---- The board's pixels as the table's units (a card's width), x across and z away from the viewer, from the
    // Stellari's middle ----

    public float U(float px) => px / Tcw;
    public Vector3 At(float x, float y, float lift = 0) => new Vector3((x - Gw / 2) / Tcw, lift, (PlaneCy - y) / Tcw);
    /// <summary>A column's middle (0 to 5), across the board.</summary>
    public float ColX(int i) => RowLeft + Tcw / 2 + i * Pitch;

    /// <summary>
    /// The camera that draws the table as the web's CSS 3D does at this size (.table-view: a perspective of 200vh from an
    /// eye at 50% 24% of the page; the board's box tipped 22° away about its middle, shrunk to 0.82 and nudged a vh, up
    /// on big screens, down on phones). The eye is off the screen's middle, so the camera's frustum is off-centre to
    /// match; every point of the table lands on the web's pixel.
    /// </summary>
    public void Frame(Camera cam)
    {
        float tilt = 22 * Mathf.Deg2Rad, cos = Mathf.Cos(tilt), sin = Mathf.Sin(tilt);
        float s = 0.82f * Tcw, persp = 200 * Vh;
        // (The page's 3D space: x right, y down, z toward the viewer. A table point u lies at b + s·R·(u.x, −u.z, u.y).)
        var centre = new Vector3(GameLeft + Gw / 2, GameTop + GameH / 2 + (Phone ? Vh : -Vh), 0);
        float dy = 0.82f * (PlaneCy - GameH / 2);
        var b = centre + new Vector3(0, dy * cos, dy * sin);
        var eye = new Vector3(W / 2, 0.24f * H, persp) - b;
        // (Back through the tip, R⁻¹, and the axes: (a, b, c) → (a, c, −b).)
        var r = new Vector3(eye.x, eye.y * cos + eye.z * sin, -eye.y * sin + eye.z * cos);
        cam.transform.position = new Vector3(r.x, r.z, -r.y) / s;
        cam.transform.rotation = Quaternion.LookRotation(new Vector3(0, -cos, sin), new Vector3(0, sin, cos));
        float n = 0.1f, f = 100;
        cam.nearClipPlane = n;
        cam.farClipPlane = f;
        float k = n / persp;
        cam.projectionMatrix = Matrix4x4.Frustum(-W / 2 * k, W / 2 * k, -0.76f * H * k, 0.24f * H * k, n, f);
    }

    /// <summary>
    /// A point of the page (x right, y down) at `depth` in front of the camera, in the camera's own space (as the hand
    /// is held: flat across the screen).
    /// </summary>
    public Vector3 Screen(float x, float y, float depth)
    {
        float k = depth / (200 * Vh);
        return new Vector3((x - W / 2) * k, -(y - 0.24f * H) * k, depth);
    }

    /// <summary>The page's pixels at `depth` in front of the camera, in its units.</summary>
    public float ScreenScale(float depth) => depth / (200 * Vh);
}
