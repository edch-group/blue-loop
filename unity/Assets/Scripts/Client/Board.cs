using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;

/// <summary>
/// The battle as a 3D scene (the web's .board-plane): a pearl table seen at a tilt, each side's row of five slots,
/// their Heroes, their suns (burning spheres with a heat meter round them and their three planets in orbit), the
/// Stellari's flower and the day's phases in the middle, the piles at the side, and the hand along the foot of the
/// screen. <see cref="Sync"/> lays it all out from a game state; cards glide to their new places. Everything stands
/// where the web's board puts it at the screen's size (BoardLayout): <see cref="Relayout"/> when that changes.
/// </summary>
public partial class Board : MonoBehaviour
{
    // The table's layout, in card widths (a card is 1 × 1.4), x across and z away from the viewer, from the Stellari's
    // middle: the web board's own at this screen's size (BoardLayout, from styles.css).
    public static BoardLayout L => BoardLayout.Current;
    public static float Pitch => L.U(L.Pitch);
    public static float RowZ => L.At(0, L.RivalRowCy).z;
    public static float MyRowZ => L.At(0, L.MyRowCy).z;
    public static float TableW => L.U(L.Gw);
    public static float TableD => L.U(L.GameH);
    public static float TableZ => L.U(L.PlaneCy - L.GameH / 2);
    /// <summary>How far each side's Hero stands out from its row (its slot, and the outline's gap before it).</summary>
    static float HeroOff => 1.4f + L.U(L.FramePad + 4);
    public static Vector3 MyHero => L.At(L.ColX(5), L.MyRowCy) + new Vector3(0, 0, HeroOff);
    public static Vector3 RivalHero => L.At(L.ColX(0), L.RivalRowCy) - new Vector3(0, 0, HeroOff);
    public static Vector3 MyTrap => L.At(L.ColX(5), L.MyRowCy);
    public static Vector3 RivalTrap => L.At(L.ColX(0), L.RivalRowCy);
    /// <summary>
    /// Each side's sun: in the middle of its .vit, at the row's left end (its --vs across, 0.08 of it in from the row's
    /// edge, a little above the row's middle), drawn at the size the web's is (SunView is made for a sun 1.667 card widths
    /// across), its middle above the table as the sphere's own.
    /// </summary>
    public static float SunScale => L.U(L.Vs) / (145f / 87);
    public static Vector3 MySun => L.At(L.WrapLeft + 0.58f * L.Vs, L.MyRowCy - 0.08f * L.Vs, 0.55f * SunScale);
    public static Vector3 RivalSun => L.At(L.WrapLeft + 0.58f * L.Vs, L.RivalRowCy - 0.08f * L.Vs, 0.55f * SunScale);
    // (Each side's piles: its deck, its reserves and its wreckage, small cards in a row.)
    public static float PileScale => L.U(L.Pw);
    /// <summary>A web size in CSS pixels on the board, as a TextMeshPro size on the table (a card is --tcw px wide there).</summary>
    public static float Px(float css) => css * 10f / L.Tcw;

    public Camera Cam;
    public string Viewer;
    /// <summary>Whether the hand is raised to be read whole (the pointer over it, or a first tap on it).</summary>
    public bool HandUp;
    /// <summary>The card in hand under the pointer (lifted out of the fan, straight), if any.</summary>
    public string HandHover;
    /// <summary>Where the hand's cards stand on the page now (layout pixels: x right, y down), for what the pointer is over.</summary>
    public readonly List<Rect> HandRects = new List<Rect>();
    Transform table, decor, handRoot;
    BoardLayout built;
    readonly Dictionary<string, CardView> cards = new Dictionary<string, CardView>();
    readonly Dictionary<string, SunView> suns = new Dictionary<string, SunView>();
    readonly List<GameObject> slotMarks = new List<GameObject>();
    /// <summary>
    /// Each slot's two looks: plain, and open to what is being chosen (yours by their index, your rival's by 100 more,
    /// your Lightspeed slot by TrapKey), and the word under its defence when open.
    /// </summary>
    readonly Dictionary<int, (GameObject plain, GameObject choose)> slotLooks = new Dictionary<int, (GameObject, GameObject)>();
    readonly Dictionary<int, TextMeshPro> slotWords = new Dictionary<int, TextMeshPro>();
    const int TrapKey = 1000;
    TextMeshPro[] phases;
    readonly MeshRenderer[] phaseDots = new MeshRenderer[3], phaseGlows = new MeshRenderer[3];
    TextMeshPro myLabel, rivalLabel, turnThem, turnYou, roundN, roundUp;
    readonly List<MeshRenderer> roundTicks = new List<MeshRenderer>(), roundGlows = new List<MeshRenderer>();
    MeshRenderer roundTrack;
    Vector3 dotScale = Vector3.one;
    MeshRenderer myDeck, rivalDeck, myDiscard, rivalDiscard, myWreck, rivalWreck;
    TextMeshPro myDeckN, rivalDeckN, myDiscardN, rivalDiscardN, myWreckN, rivalWreckN, rivalHandN, myHandN;

    public static Vector3 PileAt(bool mine, int i) => L.At(L.PilesLeft + L.Pw / 2 + i * (L.Pw + L.PileGap), mine ? L.MyRowCy : L.RivalRowCy);

    public static Vector3 SlotAt(bool mine, int slot)
    {
        if (slot < 0) return mine ? MyHero : RivalHero;
        // (Your row runs from the left, your trap's place at its right end; your rival's from its trap's place.)
        return mine ? L.At(L.ColX(slot), L.MyRowCy) : L.At(L.ColX(slot + 1), L.RivalRowCy);
    }

    public static Board Make(Camera cam)
    {
        var go = new GameObject("Board");
        var b = go.AddComponent<Board>();
        b.Cam = cam;
        b.Build();
        return b;
    }

    /// <summary>
    /// A flat rounded box on the table (a pill, a disc, a panel, or its soft shadow): `w` × `h` with corners of
    /// `radius` (all in card widths), its edge blurred over `soft`, the quad grown by `pad` round it for the blur.
    /// </summary>
    public static MeshRenderer Shape(string name, Transform parent, Color c, float w, float h, float radius, int queue, float lift = 0, float soft = 0.004f, float pad = 0.01f, bool ring = false)
    {
        // (The quad keeps the box's own shape, as the shader draws the box in the quad's proportions: grown to leave at
        // least `pad` all round.)
        float grow = Mathf.Max((w + 2 * pad) / w, (h + 2 * pad) / h);
        float qw = w * grow, qh = h * grow;
        var r = Mats.Flat(name, parent, Mats.Make("Soft", c), qw, qh, lift);
        r.sharedMaterial.SetFloat("_Aspect", qh / qw);
        r.sharedMaterial.SetFloat("_Size", 0.5f / grow);
        r.sharedMaterial.SetFloat("_Radius", Mathf.Min(radius, Mathf.Min(w, h) / 2) / qw);
        r.sharedMaterial.SetFloat("_Soft", Mathf.Max(0.0005f, soft / qw));
        r.sharedMaterial.SetFloat("_Ring", ring ? 1 : 0);
        r.sharedMaterial.renderQueue = queue;
        return r;
    }

    /// <summary>A picture lying flat on the table (an icon), `w` × `h`, tinted.</summary>
    public static MeshRenderer Picture(string name, Transform parent, Texture2D tex, Color tint, float w, float h, int queue, float lift = 0)
    {
        var r = Mats.Flat(name, parent, Mats.Make("Card"), w, h, lift);
        r.sharedMaterial.mainTexture = tex;
        r.sharedMaterial.color = tint;
        r.sharedMaterial.SetFloat("_Radius", 0);
        r.sharedMaterial.SetFloat("_Aspect", h / w);
        r.sharedMaterial.renderQueue = queue;
        return r;
    }

    /// <summary>
    /// A card of your hand put where a rectangle of the page is (the stage's card), at its size, at once: the card it
    /// becomes on the table flies from there (as the web's own card leaves the preview pane for the board).
    /// </summary>
    public void PutAtPage(string uid, Rect page)
    {
        if (!cards.TryGetValue(uid, out var v) || v.Table) return;
        const float depth = 3.2f;
        var l = L;
        var at = l.Screen(page.center.x, page.center.y, depth);
        v.gameObject.SetActive(true);
        v.MoveTo(new Vector3(at.x, -depth + 0.06f, at.y), Quaternion.identity, page.width * l.ScreenScale(depth), true);
    }

    /// <summary>The hand shown, or put away (the result showing).</summary>
    public void ShowHand(bool on)
    {
        if (handRoot != null && handRoot.gameObject.activeSelf != on) handRoot.gameObject.SetActive(on);
    }

    MeshRenderer dropMark;

    /// <summary>
    /// The slot of yours a dragged card would land in, outlined (styles.css .tableau-mine .drop-over: 2 px of green
    /// mixed 70% into white, 3 px off the slot, its corners following); none: no outline.
    /// </summary>
    public void MarkDrop(int? slot)
    {
        if (slot == null)
        {
            if (dropMark != null) dropMark.gameObject.SetActive(false);
            return;
        }
        float k = 1f / L.Tcw;
        if (dropMark == null)
            dropMark = Shape("Drop over", table, Rgba(121, 177, 151), 1 + 8 * k, 1.4f + 8 * k, 0.08f + 4 * k, 2990, 0.0008f, 1 * k, 4 * k, true);
        dropMark.gameObject.SetActive(true);
        // (Your Lightspeed slot too: .ls-slot.drop-over.)
        dropMark.transform.localPosition = (slot == BattleView.TrapSlot ? MyTrap : SlotAt(true, slot.Value)) + new Vector3(0, 0.0008f, 0);
    }

    public static Color Rgba(int r, int g, int b, float a = 1) => new Color(r / 255f, g / 255f, b / 255f, a);

    /// <summary>Zoomed onto a tableau (BattleView.Zoom): the hand dropped to its peeking strip.</summary>
    public bool Zoomed;
    readonly List<GameObject> eyes = new List<GameObject>();

    /// <summary>A button of the board's own, `w` × `d` (table units) at `at` in `parent`: a collider tagged with what it is.</summary>
    static void Hit(Transform parent, string act, bool mine, Vector3 at, float w, float d)
    {
        var go = new GameObject("Hit " + act);
        go.transform.SetParent(parent, false);
        go.transform.localPosition = at;
        var col = go.AddComponent<BoxCollider>();
        col.size = new Vector3(w, 0.05f, d);
        var tag = go.AddComponent<BoardHit>();
        tag.Act = act;
        tag.Mine = mine;
    }

    /// <summary>
    /// Zoomed onto a tableau, what steps out of the way on the board (styles.css: .tableau-eye display none; the
    /// phase track and whose turn, opacity 0); back, they return.
    /// </summary>
    public void ZoomLook(bool zoomed)
    {
        foreach (var e in eyes) if (e != null && e.activeSelf == zoomed) e.SetActive(!zoomed);
        if (decor == null) return;
        foreach (Transform c in decor)
            if (c.name == "Dot ring" || c.name == "Opponent" || c.name == "You" || c.name == "dawn" || c.name == "day" || c.name == "dusk"
                || (phaseDots.Any(d => d != null && d.transform == c)) || (phaseGlows.Any(g => g != null && g.transform == c)))
                if (c.gameObject.activeSelf == zoomed) c.gameObject.SetActive(!zoomed);
    }

    void Build()
    {
        table = new GameObject("Table").transform;
        table.SetParent(transform, false);
        table.localPosition = Vector3.zero;
        handRoot = new GameObject("Hand").transform;
        handRoot.SetParent(Cam.transform, false);
        handRoot.localRotation = Quaternion.Euler(-90, 0, 0);
        Relayout();
    }

    /// <summary>The table drawn again at the screen's size: its plate, slots, frames, middle, piles and labels (the cards and suns kept, put in place by the next Sync).</summary>
    public void Relayout()
    {
        built = L;
        string tagWas = tagName != null ? tagName.text : null, subWas = tagSub != null ? tagSub.text : null;
        tagName = tagSub = null;
        if (decor != null) Mats.Kill(decor.gameObject);
        slotMarks.Clear();
        slotLooks.Clear();
        slotDressed.Clear();
        slotWords.Clear();
        roundTicks.Clear();
        roundGlows.Clear();
        decor = new GameObject("Decor").transform;
        decor.SetParent(table, false);
        var table0 = table;
        table = decor;
        try { Decor(); }
        finally { table = table0; }
        foreach (var kv in suns) PlaceSun(kv.Value, kv.Value.Mine);
        if (tagWas != null) SetTag(tagWas, subWas);
        PageBack();
    }

    MeshRenderer page;
    static Texture2D pageTex;

    /// <summary>
    /// The page behind the table (styles.css body): a white glow from the top's middle (ellipse 70% × 60%), a grey one
    /// rising from below (120% × 90% at 50% 110%), over #faf9f6 to the paper at 55% down and #e0dfdb at the foot. Its
    /// ellipses are shares of the page, so one small picture stretched over it draws it at any size.
    /// </summary>
    void PageBack()
    {
        if (pageTex == null)
        {
            const int n = 128;
            pageTex = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color[n * n];
            Color top = Rgba(250, 249, 246), paper = Look.Paper, foot = Rgba(224, 223, 219), grey = Rgba(222, 220, 216);
            for (int j = 0; j < n; j++)
                for (int i = 0; i < n; i++)
                {
                    float x = (i + 0.5f) / n, y = 1 - (j + 0.5f) / n;
                    var c = y < 0.55f ? Color.Lerp(top, paper, y / 0.55f) : Color.Lerp(paper, foot, (y - 0.55f) / 0.45f);
                    float g = new Vector2((x - 0.5f) / 1.2f, (y - 1.1f) / 0.9f).magnitude;
                    c = Color.Lerp(c, grey, Mathf.Clamp01(1 - g / 0.6f));
                    float w = new Vector2((x - 0.5f) / 0.7f, y / 0.6f).magnitude;
                    float wa = w < 0.4f ? Mathf.Lerp(1, 0.6f, w / 0.4f) : Mathf.Lerp(0.6f, 0, Mathf.Clamp01((w - 0.4f) / 0.35f));
                    c = Color.Lerp(c, Color.white, wa);
                    c.a = 1;
                    px[j * n + i] = c;
                }
            pageTex.SetPixels(px);
            pageTex.Apply(false);
        }
        if (page == null)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Mats.Kill(go.GetComponent<Collider>());
            go.name = "Page";
            go.transform.SetParent(Cam.transform, false);
            page = go.GetComponent<MeshRenderer>();
            page.sharedMaterial = Mats.Make("Card", Color.white);
            page.sharedMaterial.mainTexture = pageTex;
            page.sharedMaterial.SetFloat("_Radius", 0);
            page.sharedMaterial.renderQueue = 2800;
        }
        // (Far behind the table, filling the page as the camera sees it.)
        var l = L;
        const float depth = 90;
        var a = l.Screen(0, 0, depth);
        var b = l.Screen(l.W, l.H, depth);
        page.transform.localPosition = (a + b) / 2;
        page.transform.localRotation = Quaternion.identity;
        page.transform.localScale = new Vector3(Mathf.Abs(b.x - a.x) * 1.02f, Mathf.Abs(b.y - a.y) * 1.02f, 1);
        page.sharedMaterial.SetFloat("_Aspect", Mathf.Abs(b.y - a.y) / Mathf.Abs(b.x - a.x));
    }

    /// <summary>Whether the table was last drawn for the screen as it is now.</summary>
    public bool Fits => built == BoardLayout.Current;

    void Decor()
    {
        var l = L;
        // The plate (styles.css .table-view > .game: corners of 34 px), its lip under the near edge (a shadow 18 px
        // down in #dcdbd5), and its shadow on the floor (60 px down, blurred 90 px).
        float r34 = l.U(34);
        var floor = Shape("Floor shadow", table, Rgba(60, 60, 80, 0.28f), TableW, TableD, r34, 2900, -0.05f, l.U(45), l.U(95));
        floor.transform.localPosition = new Vector3(0, -0.05f, TableZ - l.U(60));
        var lip = Shape("Lip", table, Rgba(220, 219, 213), TableW - l.U(4), TableD - l.U(4), r34, 2905, -0.02f);
        lip.transform.localPosition = new Vector3(0, -0.02f, TableZ - l.U(18));
        var plate = Mats.Flat("Plate", table, Mats.Make("Table"), TableW, TableD);
        plate.transform.localPosition = new Vector3(0, 0, TableZ);
        plate.sharedMaterial.SetVector("_Size", new Vector4(l.Gw, l.GameH, 0, 0));
        plate.sharedMaterial.SetFloat("_Corner", 34);
        plate.sharedMaterial.renderQueue = 2910;
        // The board's floor over it (.board-floor: the play area grown by 48% each side and 38% top and foot, an ellipse
        // of faint rings and dots round the middle, reaching past the plate's edges).
        float floorW = 1.96f * (l.Gw - 2 * l.Inset), floorH = 1.76f * l.PlaneH;
        var rings = Mats.Flat("Board floor", table, Mats.Make("BoardFloor"), l.U(floorW), l.U(floorH), 0.0001f);
        rings.transform.localPosition = l.At(l.Gw / 2, l.PlaneCy, 0.0001f);
        rings.sharedMaterial.SetVector("_Size", new Vector4(floorW, floorH, 0, 0));
        rings.sharedMaterial.renderQueue = 2912;

        // Each side's tableau framed: a pale panel round its row, reaching up round its Hero's slot (app.ts frameTableaus).
        float rowW = l.U(6 * l.Tcw + 5 * l.SlotGap), pad = l.U(l.FramePad), up = HeroOff;
        var frame = BoardArt.Frame(rowW, pad, up);
        float fw = rowW + 2 * pad, fd = 1.4f + 2 * pad + up;
        foreach (bool mine in new[] { true, false })
        {
            var f = Picture("Tableau frame", table, frame, Color.white, fw, fd, 2915, 0.0002f);
            f.transform.localPosition = mine ? new Vector3(0, 0.0002f, MyRowZ + up / 2) : new Vector3(0, 0.0002f, RowZ - up / 2);
            if (!mine) f.transform.localRotation = Quaternion.Euler(90, 180, 0);
        }

        // The Stellari's flower in the middle (160 px, 104 on a phone), and the day's phases beside it.
        // (The web's own: the petal mandala, its board framing (backdrop.ts attach: 780 of its units across), a silver
        // wireframe on the white board (.backdrop-board .petals), its two rings baked (Board/star-outer, -inner) and
        // turned as backdrop.ts turns them.)
        float star = l.U(l.Star);
        var spin = new GameObject("Stellari").AddComponent<StarSpin>();
        spin.transform.SetParent(table, false);
        foreach (var ring in new[] { "outer", "inner" })
        {
            var pivot = new GameObject(ring).transform;
            pivot.SetParent(spin.transform, false);
            // (Baked with the petals' colour white and black, mixed by the colour backdrop.ts gives them: StarSpin.)
            var r = Mats.Flat("Ring", pivot, Mats.Make("Petals"), star, star, ring == "outer" ? 0.001f : 0.0012f);
            r.sharedMaterial.mainTexture = Resources.Load<Texture2D>("Board/star-" + ring);
            r.sharedMaterial.SetTexture("_Dark", Resources.Load<Texture2D>("Board/star-" + ring + "-k"));
            r.sharedMaterial.color = StarSpin.PetalColour;
            r.sharedMaterial.renderQueue = ring == "outer" ? 2920 : 2921;
            if (ring == "outer") spin.Outer = pivot;
            else spin.Inner = pivot;
        }
        RoundDisc();
        // (styles.css .phase-track, --stellari-r out from the middle: capitals spaced 0.24em, a dot before each, a row
        // apart; the turn's two words the same distance to the flower's left, right-aligned.)
        float dot = l.U(l.PhaseDot), rowPx = l.PhaseFont * 1.15f + l.PhaseRowGap, dotX = l.U(l.StellariR + l.PhaseDot / 2);
        float textX = l.U(l.StellariR + l.PhaseDot + l.PhaseGap);
        phases = new[] { "dawn", "day", "dusk" }.Select((k, i) =>
        {
            float z = l.U((1 - i) * rowPx);
            var t = Mats.FlatText(k, table, k.ToUpperInvariant(), Px(l.PhaseFont), Rgba(161, 168, 179), true, 400, l.PhaseSpacing, TextAlignmentOptions.Left);
            t.transform.localPosition = new Vector3(textX + 3, 0.01f, z);
            phaseGlows[i] = Shape("Glow", table, Rgba(240, 160, 64, 0), dot, dot, dot * 0.6f, 2985, 0.009f, dot * 0.6f, dot);
            phaseGlows[i].transform.localPosition = new Vector3(dotX, 0.009f, z);
            var d = Shape("Dot", table, Rgba(202, 206, 213), dot, dot, dot * 0.6f, 2990, 0.01f);
            d.transform.localPosition = new Vector3(dotX, 0.01f, z);
            // (Its 1.5 px white ring, round the dot where it stands: it had been left at the board's middle.)
            var halo = Shape("Dot ring", table, Color.white, dot + l.U(3), dot + l.U(3), dot, 2988, 0.0095f);
            halo.transform.localPosition = new Vector3(dotX, 0.0095f, z);
            phaseDots[i] = d;
            dotScale = d.transform.localScale;
            return t;
        }).ToArray();
        float turnX = -l.U(l.StellariR) - 3;
        turnThem = Mats.FlatText("Opponent", table, "OPPONENT", Px(l.PhaseFont), Rgba(185, 191, 202), true, 400, l.PhaseSpacing, TextAlignmentOptions.Right);
        turnThem.transform.localPosition = new Vector3(turnX, 0.01f, l.U(rowPx / 2));
        turnYou = Mats.FlatText("You", table, "YOU", Px(l.PhaseFont), Rgba(47, 58, 82), true, 400, l.PhaseSpacing, TextAlignmentOptions.Right);
        turnYou.transform.localPosition = new Vector3(turnX, 0.01f, -l.U(rowPx / 2));

        // Each side's slots: a dashed outline and its defence where a card could stand.
        for (int s = -1; s < Balance.TableauSlots; s++)
        {
            Slot(true, s);
            Slot(false, s);
        }
        TrapSlot(MyTrap, true);
        TrapSlot(RivalTrap, false);
        // (An eye at each row's left end, clear of the tableau's outline: the web's way to look closely at a tableau.)
        float eyeX = l.RowLeft - l.FramePad - 8 - l.Eye / 2;
        eyes.Clear();
        Eye(l.At(eyeX, l.RivalRowCy), false);
        Eye(l.At(eyeX, l.MyRowCy), true);

        // The piles.
        myDeck = Pile("My deck", PileAt(true, 0), true, out myDeckN);
        rivalDeck = Pile("Rival deck", PileAt(false, 0), true, out rivalDeckN);
        myDiscard = Pile("My reserves", PileAt(true, 1), false, out myDiscardN, "RESERVES");
        rivalDiscard = Pile("Rival reserves", PileAt(false, 1), false, out rivalDiscardN, "RESERVES");
        myWreck = Pile("My wreckage", PileAt(true, 2), false, out myWreckN, "WRECKAGE");
        rivalWreck = Pile("Rival wreckage", PileAt(false, 2), false, out rivalWreckN, "WRECKAGE");
        // (The hand counts: above your piles, below theirs, 8 px off them.)
        float pileHalf = 0.7f * l.Pw, pillOff = pileHalf + 8 + l.HandPillH / 2;
        rivalHandN = HandPill("Rival hand", l.At(l.PilesLeft + l.PilesW / 2, l.RivalRowCy + pillOff));
        myHandN = HandPill("My hand", l.At(l.PilesLeft + l.PilesW / 2, l.MyRowCy - pillOff));
        // (Each player's name beyond its hand count, 14 px off it: capitals spaced 0.18em from the piles' left edge, 6 px
        // in, wrapping within the piles' width, as the web's .tpile-name.)
        float nameOff = pileHalf + 14 + l.HandPillH;
        rivalLabel = Name("Rival name", l.At(l.PilesLeft + 6, l.RivalRowCy + nameOff), false);
        myLabel = Name("My name", l.At(l.PilesLeft + 6, l.MyRowCy - nameOff), true);
        // (What on the board is a button of its own, and says what it is under the pointer: BoardHit.)
        Hit(myDeck.transform.parent, "deck", true, Vector3.zero, 1, 1.4f);
        Hit(rivalDeck.transform.parent, "deck", false, Vector3.zero, 1, 1.4f);
        Hit(myDiscard.transform.parent, "discard", true, Vector3.zero, 1, 1.4f);
        Hit(rivalDiscard.transform.parent, "discard", false, Vector3.zero, 1, 1.4f);
        Hit(myWreck.transform.parent, "wreck", true, Vector3.zero, 1, 1.4f);
        Hit(rivalWreck.transform.parent, "wreck", false, Vector3.zero, 1, 1.4f);
        Hit(myHandN.transform.parent, "hand", true, Vector3.zero, l.U(l.PilesW), l.U(l.HandPillH));
        Hit(rivalHandN.transform.parent, "hand", false, Vector3.zero, l.U(l.PilesW), l.U(l.HandPillH));
        // (A name's button: the piles' width, a line of its words tall, by its edge nearest the hand count.)
        float nameH = l.NameSize * 1.25f + 4;
        Hit(table, "name", false, l.At(l.PilesLeft + l.PilesW / 2, l.RivalRowCy + nameOff + nameH / 2), l.U(l.PilesW), l.U(nameH));
        Hit(table, "name", true, l.At(l.PilesLeft + l.PilesW / 2, l.MyRowCy - nameOff - nameH / 2), l.U(l.PilesW), l.U(nameH));
    }

    /// <summary>A player's name by their piles: from the left on one line; too long for it, wrapped and centred (as the web's button's text).</summary>
    static void SetName(TextMeshPro t, string name, bool mine)
    {
        t.text = name.ToUpperInvariant();
        bool one = t.GetPreferredValues(t.text).x <= t.rectTransform.sizeDelta.x;
        t.alignment = mine ? (one ? TextAlignmentOptions.BottomLeft : TextAlignmentOptions.Bottom) : (one ? TextAlignmentOptions.TopLeft : TextAlignmentOptions.Top);
    }

    TextMeshPro Name(string name, Vector3 at, bool mine)
    {
        var t = Mats.FlatText(name, table, "", Px(L.NameSize), Rgba(58, 66, 86), true, 400, 18, mine ? TextAlignmentOptions.BottomLeft : TextAlignmentOptions.TopLeft);
        t.textWrappingMode = TextWrappingModes.Normal;
        t.rectTransform.pivot = new Vector2(0, mine ? 0 : 1);
        t.rectTransform.sizeDelta = new Vector2(L.U(L.PilesW - 12), L.U(60));
        t.transform.localPosition = at + new Vector3(0, 0.01f, 0);
        return t;
    }

    /// <summary>
    /// The round, in the flower's heart (styles.css .round-ring): a white disc (27 px on a phone), regional stability's
    /// ticks round its rim on a faint track, and the round in Roman numerals.
    /// </summary>
    void RoundDisc()
    {
        var l = L;
        float d = l.U(l.Round);
        var shadow = Shape("Round shadow", table, Rgba(90, 90, 110, 0.18f), d, d, d / 2, 2921, 0.0015f, l.U(4), l.U(8));
        shadow.transform.localPosition = new Vector3(0, 0.0015f, -l.U(2));
        // (Its 1 px white border, and inside it radial-gradient(circle at 40% 35%, #ffffff, #eeeeef).)
        var disc = Shape("Round", table, Color.white, d, d, d / 2, 2922, 0.002f);
        Hit(table, "round", false, Vector3.zero, d, d);
        disc.transform.localPosition = new Vector3(0, 0.002f, 0);
        float inner = d - l.U(2);
        var face = Picture("Round face", table, RoundFace(), Color.white, inner, inner, 2923, 0.0021f);
        face.sharedMaterial.SetFloat("_Radius", 0.5f);
        face.transform.localPosition = new Vector3(0, 0.0021f, 0);
        float svg = d * 0.963f, r = svg * 0.44f;
        roundTrack = Shape("Track", table, Rgba(120, 124, 134, 0.14f), 2 * r + svg * 0.09f, 2 * r + svg * 0.09f, r, 2924, 0.0025f, svg * 0.045f, 0.01f, true);
        roundTrack.transform.localPosition = new Vector3(0, 0.0025f, 0);
        int total = Balance.InstabilityStartsRound - 1;
        for (int i = 0; i < total; i++)
        {
            // (Each tick an arc of the rim, 4° apart from the next, clockwise from the top; lit, a fine grey edge round
            // it, its drop-shadow(0 0 1.5px rgba(150, 158, 175, 0.95)) in the ring's own units.)
            float a0 = (i / (float)total) * 360 + 2, a1 = ((i + 1) / (float)total) * 360 - 2;
            MeshRenderer Arc(string name, float width, Color c, int queue, float lift)
            {
                var go = new GameObject(name);
                go.transform.SetParent(table, false);
                go.transform.localPosition = new Vector3(0, lift, 0);
                var mf = go.AddComponent<MeshFilter>();
                var mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = Mats.Make("Soft", c);
                mr.sharedMaterial.SetFloat("_Size", 0.5f);
                mr.sharedMaterial.SetFloat("_Soft", 0.0001f);
                mr.sharedMaterial.renderQueue = queue;
                mf.mesh = BoardArt.Arc(r, width, a0 - 0.8f * (width - svg * 0.06f) / r * Mathf.Rad2Deg / 2, a1 + 0.8f * (width - svg * 0.06f) / r * Mathf.Rad2Deg / 2);
                return mr;
            }
            roundGlows.Add(Arc("Tick edge", svg * 0.09f, Rgba(150, 158, 175, 0.5f), 2925, 0.0028f));
            roundTicks.Add(Arc("Tick", svg * 0.06f, Color.white, 2926, 0.003f));
        }
        roundN = Mats.FlatText("Round", table, "I", Px(l.RoundNum), Rgba(91, 95, 103), true, 700, 0);
        roundN.transform.localPosition = new Vector3(0, 0.004f, 0);
        roundUp = Mats.FlatText("Unstable", table, "", Px(l.RoundEm), Rgba(192, 86, 61), true, 500, 10);
        roundUp.transform.localPosition = new Vector3(0, 0.004f, -l.U(l.RoundEm * 1.6f));
    }

    static Texture2D roundFace;

    /// <summary>The round's disc's face: radial-gradient(circle at 40% 35%, #ffffff, #eeeeef), to its farthest corner.</summary>
    static Texture2D RoundFace()
    {
        if (roundFace != null) return roundFace;
        const int n = 64;
        roundFace = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var px = new Color[n * n];
        float far = new Vector2(0.6f, 0.65f).magnitude;
        Color a = Color.white, b = Rgba(0xee, 0xee, 0xef);
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                // (Rows bottom up: the page's 35% down is 65% up.)
                var p = new Vector2((x + 0.5f) / n - 0.4f, (y + 0.5f) / n - 0.65f);
                px[y * n + x] = Color.Lerp(a, b, p.magnitude / far);
            }
        roundFace.SetPixels(px);
        roundFace.Apply(false);
        return roundFace;
    }

    /// <summary>A slot's defence: the shield sign and the number, `size` px, centred where it is placed.</summary>
    static void Defence(Transform parent, string text, Vector3 at, Color c, float size, int weight = 400)
    {
        // (Measured at a card 87 px wide: as many card widths at this size.)
        float k = 87f / L.Tcw;
        var mark = Picture("Shield", parent, Resources.Load<Texture2D>("Icons/bt-shield"), c, size * 0.00823f * k, size * 0.00862f * k, 2935, 0.002f);
        var t = Mats.FlatText("Defence", parent, text, size * 0.1149f * k, c, true, weight, 8, TextAlignmentOptions.Left);
        t.rectTransform.sizeDelta = new Vector2(1, 0.3f);
        // (The sign's advance, then the number; the pair centred.)
        float adv = size * 0.0101f * k, w = adv + t.GetPreferredValues(text).x;
        mark.transform.localPosition = at + new Vector3(-w / 2 + size * 0.0046f * k, 0.002f, 0);
        t.transform.localPosition = at + new Vector3(-w / 2 + adv + 0.5f, 0.002f, 0);
    }

    void Slot(bool mine, int s)
    {
        var at = SlotAt(mine, s);
        var go = new GameObject($"Slot {(mine ? "mine" : "rival")} {s}");
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        var plain = new GameObject("Plain").transform;
        plain.SetParent(go.transform, false);
        var choose = new GameObject("Choosable").transform;
        choose.SetParent(go.transform, false);
        choose.gameObject.SetActive(false);
        int key = mine ? s : 100 + s;
        slotLooks[key] = (plain.gameObject, choose.gameObject);
        DressSlot(key, s, new SlotLook { Def = Game.SlotDefence(s) });
        var col = go.AddComponent<BoxCollider>();
        col.size = new Vector3(1, 0.05f, 1.4f);
        go.AddComponent<SlotTag>().Set(mine, s);
        slotMarks.Add(go);
    }

    /// <summary>
    /// How an empty slot stands (app.ts renderTableau): its defence as it is now (a campaign ship's room's walls added,
    /// the wear of the card that stood there taken off), worn, wrecked shut, a hero's slot with its hero wounded, the
    /// room's guns and module's boons (Rooms: "kind:n", in order), its side out of the game.
    /// </summary>
    struct SlotLook
    {
        public int Def;
        public bool Worn, Wrecked, Wounded, Dead;
        public string Rooms;
    }

    readonly Dictionary<int, SlotLook> slotDressed = new Dictionary<int, SlotLook>();

    /// <summary>
    /// A slot drawn as it stands (when that changes): plain (styles.css .slot-empty: pale, a white line inside a dashed
    /// edge, corners of 8% of its width, its defence in the middle; a Hero's, "hero" small under it), and open to what is
    /// being chosen (button.slot-choosable: a coral dashed edge on white, a faint coral glow, its defence and "here" or
    /// "move here" under it in coral).
    /// </summary>
    void DressSlot(int key, int s, SlotLook look)
    {
        if (slotDressed.TryGetValue(key, out var had) && had.Equals(look)) return;
        slotDressed[key] = look;
        var (plainGo, chooseGo) = slotLooks[key];
        Transform plain = plainGo.transform, choose = chooseGo.transform;
        foreach (Transform c in plain) Mats.Kill(c.gameObject);
        foreach (Transform c in choose) Mats.Kill(c.gameObject);
        plain.DetachChildren();
        choose.DetachChildren();
        Picture("Outline", plain, look.Wrecked ? BoardArt.SlotWrecked() : look.Wounded ? BoardArt.SlotWounded() : BoardArt.Slot(false), Color.white, 1, 1.4f, 2925, 0.0005f);
        // (Worn: .slot-worn .slot-def, #c0563d and bolder.)
        var coral = Rgba(192, 86, 61);
        var ink = look.Worn ? coral : Rgba(120, 128, 150, 0.55f);
        int weight = look.Worn ? 600 : 400;
        string def = look.Def.ToString();
        float size = Mathf.Max(9, L.Tcw * 0.14f), k = 1f / L.Tcw;
        if (look.Wrecked)
        {
            // (.slot-wrecked small: no defence, "wrecked" in #b5503a, 0.45rem, spaced 0.18em.)
            var w = Mats.FlatText("Wrecked", plain, "WRECKED", Px(7.2f), Rgba(181, 80, 58), true, 400, 18);
            w.transform.localPosition = new Vector3(0, 0.002f, 0);
        }
        else if (s < 0)
        {
            // (The Hero's slot: its defence, and "hero" small under it; its hero wounded (.slot-wounded, #e88a80): a
            // cross in its place, and "wounded".)
            var col = look.Wounded ? Rgba(232, 138, 128) : ink;
            if (look.Wounded)
            {
                var cross = Mats.FlatText("Cross", plain, "✚", Px(size), col, true, 400, 8);
                cross.transform.localPosition = new Vector3(0, 0.002f, 0.059f);
            }
            else Defence(plain, def, new Vector3(0, 0, 0.059f), ink, size, weight);
            var hero = Mats.FlatText("Hero", plain, look.Wounded ? "WOUNDED" : "HERO", Px(Mathf.Max(6, L.Tcw * 0.075f)), new Color(col.r, col.g, col.b, col.a * 0.8f), true, 400, 20);
            hero.transform.localPosition = new Vector3(0, 0.002f, -0.102f);
        }
        else Defence(plain, def, Vector3.zero, ink, size, weight);
        if (!look.Wrecked && look.Rooms != null) RoomRow(plain, look.Rooms);
        if (!look.Wrecked)
        {
            Shape("Glow", choose, Rgba(208, 101, 75, 0.25f), 1, 1.4f, 0.08f, 2920, 0.0003f, 10 * k, 14 * k, true);
            Picture("Outline", choose, BoardArt.SlotChoose(), Color.white, 1, 1.4f, 2925, 0.0005f);
            float hereSize = Mathf.Max(7, L.Tcw * 0.08f), defH = size * 1.2f, hereH = hereSize * 1.2f;
            // (The two lines centred together, 2 px apart.)
            float top = (defH + 2 + hereH) / 2;
            Defence(choose, def, new Vector3(0, 0, (top - defH / 2) * k), coral, size, weight);
            var here = Mats.FlatText("Here", choose, "HERE", Px(hereSize), coral, true, 400, 20);
            here.transform.localPosition = new Vector3(0, 0.002f, -(top - hereH / 2) * k);
            slotWords[key] = here;
            if (look.Rooms != null) RoomRow(choose, look.Rooms);
        }
        else slotWords.Remove(key);
        // (.tableau-dead: all of it at 0.45.)
        if (look.Dead)
            foreach (var r in plainGo.GetComponentsInChildren<Renderer>(true).Concat(chooseGo.GetComponentsInChildren<Renderer>(true)))
            {
                if (r.GetComponent<TextMeshPro>() is TextMeshPro t) { t.alpha *= 0.45f; continue; }
                var c = r.sharedMaterial.color;
                c.a *= 0.45f;
                r.sharedMaterial.color = c;
            }
    }

    /// <summary>
    /// A ship's room on an empty slot (.slot-room: its foot 8% up from the slot's, the marks in a row, centred, 3 px
    /// apart): each a .boon-mark (0.18 of a card across, baked with 4 px round it at --tcw 200: 36 px of 44), its amount
    /// small at its foot, 3 px out (0.07 card widths, display, ink).
    /// </summary>
    void RoomRow(Transform parent, string rooms)
    {
        var items = rooms.Split(',').Select(x => x.Split(':')).ToList();
        float px = 1f / L.Tcw, bd = 0.18f, gap = 3 * px, img = bd * 44 / 36;
        float total = items.Count * bd + (items.Count - 1) * gap, cz = 0.7f - (1.4f * 0.92f - bd / 2);
        for (int i = 0; i < items.Count; i++)
        {
            float cx = -total / 2 + bd / 2 + i * (bd + gap);
            var pic = Picture($"Room {items[i][0]}", parent, Resources.Load<Texture2D>($"Icons/boon/{items[i][0]}"), Color.white, img, img, 2936, 0.002f);
            pic.transform.localPosition = new Vector3(cx, 0.002f, cz);
            int n = int.Parse(items[i][1]);
            if (n <= 0) continue;
            float size = 0.07f * L.Tcw;
            var count = Mats.FlatText("Amount", parent, n.ToString(), Px(size), Look.Ink, true, 400, 0, TextAlignmentOptions.Right);
            count.rectTransform.sizeDelta = new Vector2(1, size * 1.25f * px);
            count.rectTransform.pivot = new Vector2(1, 0.5f);
            count.transform.localPosition = new Vector3(cx + bd / 2 + 3 * px, 0.004f, cz - bd / 2 - 3 * px + size * 1.25f * px / 2);
        }
    }

    /// <summary>
    /// An empty place a trap could be set: a dashed indigo outline, and the trap's mark in it (as the web's). Yours,
    /// open to the card picked when it can be set face down (button.slot-ls.slot-choosable): the coral dashed edge on
    /// white and faint coral glow of an open slot, the mark coral and "trap +1" under it; tapped, it is set there.
    /// </summary>
    void TrapSlot(Vector3 at, bool mine)
    {
        var go = new GameObject("Trap slot");
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        var plain = new GameObject("Plain").transform;
        plain.SetParent(go.transform, false);
        Picture("Outline", plain, BoardArt.Slot(true), Color.white, 1, 1.4f, 2925, 0.0005f);
        // (Its mark 1.15em of the slot's defence size, drawn on a picture a quarter larger than it.)
        float size = Mathf.Max(12, L.Tcw * 0.22f);
        float s = L.U(size * 1.15f) * 1.25f;
        var trap = Resources.Load<Texture2D>("Icons/bt-trap");
        Picture("Trap", plain, trap, Rgba(70, 74, 160, 0.6f), s, s, 2935, 0.002f);
        if (!mine) return;
        var choose = new GameObject("Choosable").transform;
        choose.SetParent(go.transform, false);
        float k = 1f / L.Tcw;
        Shape("Glow", choose, Rgba(208, 101, 75, 0.25f), 1, 1.4f, 0.08f, 2920, 0.0003f, 10 * k, 14 * k, true);
        Picture("Outline", choose, BoardArt.SlotChoose(), Color.white, 1, 1.4f, 2925, 0.0005f);
        var coral = Rgba(192, 86, 61);
        float wordSize = Mathf.Max(7, L.Tcw * 0.08f), markH = size * 1.2f, wordH = wordSize * 1.2f;
        // (The two lines centred together, 2 px apart.)
        float top = (markH + 2 + wordH) / 2;
        var mark = Picture("Trap", choose, trap, coral, s, s, 2935, 0.002f);
        mark.transform.localPosition = new Vector3(0, 0.002f, (top - markH / 2) * k);
        var word = Mats.FlatText("Here", choose, "TRAP +1", Px(wordSize), coral, true, 400, 20);
        word.transform.localPosition = new Vector3(0, 0.002f, -(top - wordH / 2) * k);
        choose.gameObject.SetActive(false);
        slotLooks[TrapKey] = (plain.gameObject, choose.gameObject);
        var col = go.AddComponent<BoxCollider>();
        col.size = new Vector3(1, 0.05f, 1.4f);
        go.AddComponent<SlotTag>().Set(true, BattleView.TrapSlot);
    }

    /// <summary>A round white button by a row (styles.css .tableau-eye: 30% of a card's width, 26 to 40 px), an eye in it.</summary>
    void Eye(Vector3 at, bool mine)
    {
        var go = new GameObject("Eye");
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        float d = L.U(L.Eye);
        var shadow = Shape("Shadow", go.transform, Rgba(70, 76, 100, 0.2f), d, d, d / 2, 2926, 0.001f, L.U(4), L.U(8));
        shadow.transform.localPosition = new Vector3(0, 0.001f, -L.U(2));
        Shape("Button", go.transform, new Color(1, 1, 1, 0.92f), d, d, d / 2, 2927, 0.0015f);
        float s = d * 0.587f * 1.25f;
        Picture("Eye", go.transform, Resources.Load<Texture2D>("Icons/bt-eye"), Rgba(91, 97, 112), s, s, 2928, 0.002f);
        Hit(go.transform, "eye", mine, Vector3.zero, d, d);
        eyes.Add(go);
    }

    MeshRenderer Pile(string name, Vector3 at, bool back, out TextMeshPro count, string title = "")
    {
        var go = new GameObject(name);
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        go.transform.localScale = Vector3.one * PileScale;
        // (An open pile's place: pale and dashed, as the slots, its name small in it: styles.css .tpile-empty.)
        if (!back) Picture("Outline", go.transform, BoardArt.Pile(), Color.white, 1, 1.4f, 2945, 0.001f);
        var face = Mats.Flat("Top", go.transform, Mats.Make("Card"), 1, 1.4f, 0.02f);
        go.AddComponent<PileStack>().Face = face;
        face.sharedMaterial.mainTexture = back ? Resources.Load<Texture2D>("Board/back") : null;
        face.sharedMaterial.color = back ? Color.white : new Color(1, 1, 1, 0);
        face.sharedMaterial.renderQueue = 2950;
        var label = Mats.FlatText("Name", go.transform, title, Px(Mathf.Max(5, L.Pw * 0.068f)) / PileScale, Look.InkSoft, true, 400, 10);
        label.transform.localPosition = new Vector3(0, 0.03f, 0);
        // (.tpile > small: at most 92% of the pile across, cut off past it, as the web's.)
        label.rectTransform.sizeDelta = new Vector2(0.92f, 0.3f);
        label.textWrappingMode = TextWrappingModes.NoWrap;
        label.overflowMode = TextOverflowModes.Truncate;
        // (Too long for it, the box is as wide as it may be and its words run from its left, cut at its right.)
        if (label.GetPreferredValues(label.text).x > 0.92f) label.alignment = TextAlignmentOptions.Left;
        label.gameObject.SetActive(!back);
        // (How many, small in its corner.)
        count = Mats.FlatText("Count", go.transform, "", Px(Mathf.Max(11, L.Pw * 0.28f)) / PileScale * 0.86f, Look.InkSoft, true, 700, 0, TextAlignmentOptions.Right);
        count.rectTransform.sizeDelta = new Vector2(1, 0.4f);
        count.transform.localPosition = new Vector3(-0.08f, 0.03f, -0.5f);
        return face;
    }

    /// <summary>
    /// A side's hand, counted (styles.css .tpile-hand): a pale pill as wide as the piles and max(20 px, 26% of a pile)
    /// tall with a fine edge, 10 px in: the hand's mark, "HAND" 6 px after it, and how many at its right.
    /// </summary>
    TextMeshPro HandPill(string name, Vector3 at)
    {
        var l = L;
        var go = new GameObject(name);
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        float w = l.U(l.PilesW), h = l.U(l.HandPillH), font = Mathf.Max(9, l.Pw * 0.11f);
        var shadow = Shape("Shadow", go.transform, Rgba(90, 90, 110, 0.1f), w, h, h / 2, 2952, 0.001f, l.U(4), l.U(8));
        shadow.transform.localPosition = new Vector3(0, 0.001f, -l.U(2));
        Shape("Pill", go.transform, Rgba(250, 251, 253, 0.85f), w, h, h / 2, 2955, 0.002f);
        Shape("Edge", go.transform, Rgba(140, 150, 175, 0.28f), w, h, h / 2, 2956, 0.0025f, 0.004f, 0.01f, true);
        float icon = l.U(1.3f * font);
        var mark = Picture("Hand", go.transform, Resources.Load<Texture2D>("Icons/bt-hand"), Color.white, icon * 1.25f, icon * 1.25f, 2957, 0.003f);
        mark.transform.localPosition = new Vector3(-w / 2 + l.U(10) + icon / 2, 0.003f, 0);
        var word = Mats.FlatText("Hand", go.transform, "HAND", Px(font), Look.InkSoft, true, 400, 14, TextAlignmentOptions.Left);
        word.rectTransform.sizeDelta = new Vector2(1, 0.3f);
        word.transform.localPosition = new Vector3(-w / 2 + l.U(10 + 6) + icon + 0.5f, 0.01f, 0);
        var t = Mats.FlatText("Count", go.transform, "", Px(font * 1.25f), Look.Ink, true, 700, 0, TextAlignmentOptions.Right);
        t.rectTransform.sizeDelta = new Vector2(1, 0.3f);
        t.transform.localPosition = new Vector3(w / 2 - l.U(10) - 0.5f, 0.01f, 0);
        return t;
    }

    readonly Dictionary<string, SunRing> sunRings = new Dictionary<string, SunRing>();

    /// <summary>
    /// A sun that can be chosen (.vitals-choosable .vit::after): a plain red ring round the sun itself, like a card you
    /// can choose, drawn flat over it (its shaders untouched); none, put away.
    /// </summary>
    void SunRing(string playerId, bool mine, bool on)
    {
        sunRings.TryGetValue(playerId, out var ring);
        if (!on)
        {
            if (ring != null && ring.Go.activeSelf) ring.Go.SetActive(false);
            return;
        }
        float vs = L.Vs;
        if (ring == null || ring.Go == null || Mathf.Abs(ring.Vs - vs) > 0.01f)
        {
            if (ring?.Go != null) Mats.Kill(ring.Go);
            ring = new SunRing(table, vs);
            sunRings[playerId] = ring;
        }
        ring.Go.transform.localPosition = L.At(L.WrapLeft + 0.58f * vs, (mine ? L.MyRowCy : L.RivalRowCy) - 0.08f * vs) + new Vector3(0, 0.004f, 0);
        if (!ring.Go.activeSelf) { ring.Go.SetActive(true); ring.Since = Time.time; }
    }

    /// <summary>A sun put where the web's stands at this size, at its size.</summary>
    static void PlaceSun(SunView sun, bool mine)
    {
        sun.Place(L, L.WrapLeft + 0.58f * L.Vs, (mine ? L.MyRowCy : L.RivalRowCy) - 0.08f * L.Vs);
    }

    /// <summary>Lay the battle out as it stands: every card where it belongs, every sun as hot as it is.</summary>
    public void Sync(GameState s, BattleView ui)
    {
        // (Who moved, and whether a day ended, as the cards it brought arrive: app.ts animate's delays.)
        if (synced != null && synced != s)
        {
            var was = Game.ActivePlayer(synced);
            arriveByAI = was.IsAI;
            arriveAtDawn = was.Id != Game.ActivePlayer(s).Id;
        }
        synced = s;
        syncedBy = ui;
        dealing = 0;
        if (!Fits) Relayout();
        var me = s.Players.First(p => p.Id == Viewer);
        var rival = s.Players.First(p => p.Id != Viewer);
        var seen = new HashSet<string>();
        foreach (var p in new[] { me, rival })
        {
            bool mine = p == me;
            foreach (var c in p.Tableau)
            {
                var v = Card(c, true, mine, p.Id);
                seen.Add(c.Uid);
                var at = SlotAt(mine, c.Slot ?? 0) + new Vector3(0, 0.03f, 0);
                v.transform.SetParent(table, false);
                v.MoveTo(at, Quaternion.identity);
                // (Until a blow lands on it, it keeps showing what it was: app.ts holdCardStats.)
                if (cardHold.TryGetValue(c.Uid, out var held) && Time.time < held.until) InPlay(v, held.s, held.p, held.c, ui, c.Uid == tableOver);
                else InPlay(v, s, p, c, ui, c.Uid == tableOver);
                v.Dead(ui.ShownDead(p));
                ui.Dress(v, p, c, true);
            }
            // Each empty slot as it stands now (app.ts renderTableau's slots).
            for (int i = -1; i < Balance.TableauSlots; i++) DressSlot(mine ? i : 100 + i, i, SlotNow(p, i, ui));
            // (A trap set face down, beside the row.)
            if (p.Lightspeed != null)
            {
                var v = Card(p.Lightspeed, true, mine, p.Id);
                seen.Add(p.Lightspeed.Uid);
                v.transform.SetParent(table, false);
                v.MoveTo((mine ? MyTrap : RivalTrap) + new Vector3(0, 0.03f, 0), Quaternion.identity);
                // (Set face down, yours too, as the web's: hold it to read it.)
                v.FaceDown();
                for (int k = 0; k < 3; k++) v.Badge(new[] { "atk", "stab", "def" }[k], "atk", null);
                v.Dead(ui.ShownDead(p));
            }
            // (A Lost Overlord has no sun: its vitals in its place.)
            if (p.Boss != null) { NoSun(p.Id); BossVitals(s, p, mine); continue; }
            var sunView = SunFor(p, mine);
            // (Until the blow lands, a sun keeps showing its old heat and shields: app.ts holdUntil.)
            if (sunHold.TryGetValue(p.Id, out var sh) && Time.time < sh.until) sunView.Show(sh.s, sh.p);
            else sunView.Show(s, p);
            sunView.Face(Cam);
            SunRing(p.Id, mine, ui.SunChoosable(p.Id));
        }
        Hand(me, ui, seen);
        foreach (var uid in cards.Keys.Where(k => !seen.Contains(k)).ToList())
        {
            // (In play, a card leaving flies to the pile it went to, or to its owner's sun; anywhere else, it fades away
            // where it was.)
            var gone = cards[uid];
            if (!Application.isPlaying) Mats.Kill(gone.gameObject);
            else
            {
                Vector3? to = null;
                float k = 0.3f;
                foreach (var p in s.Players)
                {
                    bool mine = p.Id == Viewer;
                    if (p.Discard.Any(c => c.Uid == uid)) { to = this.table.TransformPoint(PileAt(mine, 1)); k = PileScale / Mathf.Max(0.001f, gone.transform.lossyScale.x); }
                    else if (p.Wreck != null && p.Wreck.Any(c => c.Uid == uid)) { to = this.table.TransformPoint(PileAt(mine, 2)); k = PileScale / Mathf.Max(0.001f, gone.transform.lossyScale.x); }
                    else if (p.Deck.Any(c => c.Uid == uid) || p.Hand.Any(c => c.Uid == uid)) to = suns.TryGetValue(p.Id, out var sv) ? sv.transform.position : (Vector3?)null;
                    if (to != null) break;
                }
                // (Taken by a blow still on its way: it waits in its slot for it, then dissolves there.)
                float wait = leaveAt.TryGetValue(uid, out var la) ? Mathf.Max(0, la - Time.time) : 0;
                if (linger.TryGetValue(uid, out var at) && at > Time.time) gone.Dissolve(at - Time.time);
                else if (to != null && gone.Table) gone.GoTo(to.Value + Vector3.up * 0.05f, Mathf.Clamp(k, 0.15f, 1), wait);
                else gone.Die(0.25f);
            }
            cards.Remove(uid);
        }
        dealt = true;

        // Piles and counts.
        // (Each pile as tall as the cards in it, as the web's: no count but the wreckage's.)
        myDeckN.text = "";
        rivalDeckN.text = "";
        Top(myDiscard, myDiscardN, me.Discard, false);
        Top(rivalDiscard, rivalDiscardN, rival.Discard, false);
        Top(myWreck, myWreckN, me.Wreck, true);
        Top(rivalWreck, rivalWreckN, rival.Wreck, true);
        myDeck.gameObject.SetActive(me.Deck.Count > 0);
        rivalDeck.gameObject.SetActive(rival.Deck.Count > 0);
        myDeck.transform.parent.GetComponent<PileStack>().Set(me.Deck.Count);
        rivalDeck.transform.parent.GetComponent<PileStack>().Set(rival.Deck.Count);
        rivalHandN.text = rival.Hand.Count.ToString();
        myHandN.text = me.Hand.Count.ToString();
        SetName(rivalLabel, rival.Name, false);
        SetName(myLabel, me.Name, true);
        // (The petals follow the region's stability (app.ts render): blue while it holds, whitening as it drains, then
        // redder the more unstable it grows.)
        int stable = Balance.InstabilityStartsRound - 1, instab = Game.InstabilityHeat(s);
        StarSpin.Heat(instab > 0 ? Mathf.Min(1, instab / 5f) : -Mathf.Max(0, stable - (s.Round - 1)) / (float)stable);
        var active = Game.ActivePlayer(s);
        bool mineNow = active == me;
        // (Whose turn: the one lit dark, the other pale; the day's part lit, its dot in the phase's colour and glowing.)
        Color lit = Rgba(47, 58, 82), pale = Rgba(185, 191, 202);
        turnYou.color = mineNow ? lit : pale;
        turnThem.color = mineNow ? pale : lit;
        ShowPhase(ui.Phase);
        // The round, and regional stability's ticks: one drains each round; gone, the track reddens and every sun
        // takes the round's heat at its dawn.
        int total = roundTicks.Count, left = Mathf.Max(0, total - (s.Round - 1)), unstable = Game.InstabilityHeat(s);
        roundN.text = BoardArt.Roman(s.Round);
        roundUp.text = unstable > 0 ? $"+{unstable}" : "";
        roundN.transform.localPosition = new Vector3(0, 0.004f, unstable > 0 ? L.U(3) : 0);
        // (Lit white, unlit white at half; unstable, all a faint coral.)
        for (int i = 0; i < total; i++)
        {
            roundTicks[i].sharedMaterial.color = unstable > 0 ? Rgba(240, 190, 180, 0.6f) : new Color(1, 1, 1, i < left ? 1 : 0.5f);
            roundGlows[i].gameObject.SetActive(unstable <= 0 && i < left);
        }
        roundTrack.sharedMaterial.color = unstable > 0 ? Rgba(201, 138, 134, 0.25f) : Rgba(120, 124, 134, 0.14f);
        foreach (var slot in slotMarks) slot.SetActive(true);
        // (A card picked, waiting for its place, or a card being moved: each empty slot open to it, BattleView.SlotWord.)
        foreach (var kv in slotLooks)
        {
            string word = kv.Key == TrapKey ? (ui.TrapChoosable ? "" : null) : kv.Key >= 50 ? ui.SlotWord(false, kv.Key - 100) : ui.SlotWord(true, kv.Key);
            bool open = word != null;
            if (open && slotWords.TryGetValue(kv.Key, out var t) && t.text != word.ToUpperInvariant()) t.text = word.ToUpperInvariant();
            if (kv.Value.plain.activeSelf == open) kv.Value.plain.SetActive(!open);
            if (kv.Value.choose.activeSelf != open) kv.Value.choose.SetActive(open);
        }
    }

    /// <summary>
    /// My hand, flat along the foot of the screen in front of the board (app.ts fitHand, styles.css .table-view &gt;
    /// .dock): cards --hw wide between the dock's side columns, overlapping by the same share of their widths (at most
    /// 98%), 12% of a card in from each end, turned 2.5° apart (less for a big hand) on an arc, their tops 10 px into
    /// the hand's strip, the rest below the screen. The card under the pointer (or picked) rises 8% of --hh and turns
    /// straight. Raised (the pointer over it, or a first tap on a touch screen), the hand grows 1.14 times from its
    /// foot and rises until its lowest corner is 8 px above the screen's foot (app.ts measureRaise).
    /// </summary>
    void Hand(PlayerState me, BattleView ui, HashSet<string> seen)
    {
        var l = L;
        const float depth = 3.2f, grow = 1.14f;
        float px = l.ScreenScale(depth), w = l.HandCard, h = w * 1.4f;
        // (The card picked, or just played, is on the stage, not in the hand: kept, out of sight, until it comes back
        // or lands.)
        var hand = new List<CardInstance>();
        foreach (var c in me.Hand)
        {
            if (!ui.OffHand(c.Uid)) { hand.Add(c); continue; }
            seen.Add(c.Uid);
            if (cards.TryGetValue(c.Uid, out var gone)) gone.gameObject.SetActive(false);
        }
        int n = hand.Count;
        float inset = w * 0.12f, room = l.HandW - 2 * inset;
        float spacing = n > 1 ? Mathf.Min(0.98f, (room - w) / ((n - 1) * w)) * w : 0;
        float span = w + (n - 1) * spacing, start = l.HandLeft + inset + (room - span) / 2 + w / 2;
        float step = Mathf.Min(2.5f, 12f / Mathf.Max(n - 1, 1));
        float radius = spacing / (step * Mathf.Deg2Rad);
        // (Where each card rests, its middle on the page; and the lowest corner of all, from the hand's top.)
        var spot = new Vector2[n];
        float low = 0;
        for (int i = 0; i < n; i++)
        {
            float t = i - (n - 1) / 2f, a = t * step * Mathf.Deg2Rad;
            float fy = radius * (1 - Mathf.Cos(a)) * 1.25f;
            spot[i] = new Vector2(start + i * spacing, l.HandTop + 10 + h / 2 + fy);
            low = Mathf.Max(low, 10 + fy + h / 2 + (w * Mathf.Abs(Mathf.Sin(a)) + h * Mathf.Cos(a)) / 2);
        }
        float foot = l.HandBottom;
        float rise = HandUp && n > 0 ? Mathf.Max(0, Mathf.Round(foot + (l.HandTop + low - foot) * grow - l.H + 8)) : 0, size = HandUp ? grow : 1;
        // (Zoomed onto a tableau and not raised (app.ts handDrop): the hand drops until only the top 60% of its lowest
        // card peeks up from the screen's foot.)
        float drop = 0;
        if (Zoomed && !HandUp && n > 0)
        {
            float lowest = 0;
            for (int i = 0; i < n; i++)
            {
                float a = (i - (n - 1) / 2f) * step * Mathf.Deg2Rad;
                lowest = Mathf.Max(lowest, spot[i].y - (w * Mathf.Abs(Mathf.Sin(a)) + h * Mathf.Cos(a)) / 2);
            }
            drop = Mathf.Max(0, Mathf.Round(l.H - h * 0.6f - lowest));
        }
        float mid = l.HandLeft + l.HandW / 2;
        HandRects.Clear();
        for (int i = 0; i < n; i++)
        {
            var c = hand[i];
            var v = Card(c, false);
            v.gameObject.SetActive(true);
            seen.Add(c.Uid);
            v.transform.SetParent(handRoot, false);
            float t = i - (n - 1) / 2f;
            bool lifted = ui.HandLift(c) > 0 || c.Uid == HandHover;
            float turn = lifted ? 0 : t * step;
            float y = spot[i].y - (lifted ? l.DockHh * 0.08f : 0);
            // (Raised: grown from the hand's foot, then lifted.)
            float x = mid + (spot[i].x - mid) * size;
            y = foot + (y - foot) * size - rise + drop;
            var at = l.Screen(x, y, depth);
            v.MoveTo(new Vector3(at.x, -depth + 0.001f * (lifted ? 50 : i), at.y), Quaternion.Euler(0, turn, 0), w * size * px);
            // (Drawn in the fan's order, the lifted card over all, each with its own badges.)
            v.Stack(lifted ? 50 : i);
            float a = turn * Mathf.Deg2Rad, bw = (w * Mathf.Abs(Mathf.Cos(a)) + h * Mathf.Abs(Mathf.Sin(a))) * size, bh = (w * Mathf.Abs(Mathf.Sin(a)) + h * Mathf.Cos(a)) * size;
            HandRects.Add(new Rect(x - bw / 2, y - bh / 2, bw, bh));
            // (Its attack and stability as printed, as the web's hand cards wear them: stabilityBadge.)
            var def = Cards.Def(c.DefId);
            bool stands = Game.Persists(c.DefId) && !Cards.IsBurst(def);
            int atk = Game.BaseAttack(def);
            v.Badge("atk", "atk", stands && atk > 0 ? atk : (int?)null);
            v.Badge("stab", "stab", stands ? Game.BaseHealth(c.DefId) : (int?)null);
            v.Badge("def", "def", null);
            v.Dimmed(false);
            // (Too costly to play now, muted; made cheaper, its discount on its corner: .card-pricey, .card-discount.)
            v.Pricey(ui.Pricey(me, c));
            int off = ui.Discount(c);
            v.Mark("discount", off > 0 ? $"discount-{Mathf.Min(off, 6)}" : null, 3016);
            ui.Dress(v, me, c, false);
        }
    }

    /// <summary>Whether a point of the page is in the hand's column: between its outermost cards, from their tops down (app.ts inHandColumn).</summary>
    public bool InHandColumn(Vector2 at)
    {
        if (HandRects.Count == 0) return false;
        float left = HandRects.Min(r => r.xMin), right = HandRects.Max(r => r.xMax), top = HandRects.Min(r => r.yMin);
        return at.x >= left && at.x <= right && at.y >= top;
    }

    /// <summary>An open pile: its top card face up, and how many are in it (none: its empty place and name).</summary>
    /// <summary>
    /// An open pile: its top card face up (the reserves' last; the wreckage's first, the next to go), stacked as tall as
    /// the pile; the wreckage's count over it (.tpile-n).
    /// </summary>
    static void Top(MeshRenderer face, TextMeshPro count, List<CardInstance> pile, bool wreck)
    {
        var top = wreck ? pile?.FirstOrDefault() : pile?.LastOrDefault();
        face.sharedMaterial.mainTexture = top != null ? Faces.Of(top.DefId, true) : null;
        face.sharedMaterial.color = top != null ? Color.white : new Color(1, 1, 1, 0);
        count.text = wreck && pile != null && pile.Count > 0 ? pile.Count.ToString() : "";
        foreach (Transform c in face.transform.parent) if (c.name == "Name") c.gameObject.SetActive(top == null);
        face.transform.parent.GetComponent<PileStack>().Set(top != null ? pile.Count : 0);
    }

    TextMeshPro tagName, tagSub;

    /// <summary>Whether the board has been laid out once (after that, cards arriving come from somewhere).</summary>
    bool dealt;

    CardView Card(CardInstance c, bool table, bool mine = true, string owner = null)
    {
        if (cards.TryGetValue(c.Uid, out var v) && v.Table != table)
        {
            // (From the hand to the table, or back: a new view, as its face is the other's, flying from where the old one
            // was (app.ts animate: flyFrom(el, old.rect), 420 ms, unfaded; a card flung back to hand by a removal waits
            // in its slot until the arc reaches it).)
            var at = v.transform;
            var nv = CardView.Make(table ? this.table : handRoot, c.Uid, c.DefId, table, table ? L.Tcw : L.HandCard);
            float wait = linger.TryGetValue(c.Uid, out var lt) ? Mathf.Max(0, lt - Time.time) : 0;
            if (Application.isPlaying) nv.FlyFrom(at.position, at.rotation, at.lossyScale, wait, 0.42f, false);
            else nv.StartFrom(at.position, at.rotation, at.lossyScale);
            Mats.Kill(v.gameObject);
            cards[c.Uid] = nv;
            v = nv;
        }
        else if (v == null)
        {
            v = CardView.Make(table ? this.table : handRoot, c.Uid, c.DefId, table, table ? L.Tcw : L.HandCard);
            cards[c.Uid] = v;
            if (dealt && Application.isPlaying) Arrive(v, table, owner);
        }
        v.SetCard(c.DefId);
        // (Its face the web's at the width it is drawn: in play --tcw, in the hand --hw.)
        v.DrawnAt(table ? L.Tcw : L.HandCard);
        return v;
    }

    /// <summary>Whether the last move was the AI's, and whether it ended a day (set as each new state is synced).</summary>
    bool arriveByAI, arriveAtDawn;

    /// <summary>
    /// A card arriving that wasn't on screen (app.ts animate): drawn, it flies from your deck pile to its place in the
    /// fan, fading in (dealCard: 520 ms, (a day's end ? 420 : 60) ms + 110 ms a card after the last), with the draw's
    /// sound as it leaves; in a tableau, it flies in from its owner's sun, fading in (560 ms, 350 ms late after the AI's
    /// move).
    /// </summary>
    void Arrive(CardView v, bool table, string owner)
    {
        if (!table)
        {
            var deck = this.table.TransformPoint(PileAt(true, 0));
            float delay = (arriveAtDawn ? 0.42f : 0.06f) + dealing++ * 0.11f;
            v.FlyFrom(deck + Vector3.up * 0.1f, this.table.rotation, Vector3.one * PileScale, delay, 0.52f, true);
            Sound.Play("draw", delay);
            return;
        }
        SunView sun = null;
        if (owner != null) suns.TryGetValue(owner, out sun);
        var from = sun != null ? sun.transform.position : this.table.TransformPoint(PileAt(owner == Viewer, 0));
        // (At the sun's size on the page: fx.ts orbRect.)
        v.FlyFrom(from + Vector3.up * 0.1f, this.table.rotation, Vector3.one * 0.3f, arriveByAI ? 0.35f : 0, 0.56f, true);
    }

    /// <summary>When the opening deal is over (until then the hand can't be raised: app.ts dealtAt).</summary>
    public float DealtAt { get; private set; }

    /// <summary>
    /// app.ts dealOpening: the shuffle, then your opening hand dealt in from your deck one by one (350 ms, then 110 ms
    /// apart, 520 ms each, fading in), each with the draw's sound.
    /// </summary>
    public void DealOpening(GameState s)
    {
        if (!Application.isPlaying) return;
        Sound.Play("shuffle");
        var me = s.Players.FirstOrDefault(p => p.Id == Viewer);
        if (me == null) return;
        var deck = this.table.TransformPoint(PileAt(true, 0));
        int i = 0;
        foreach (var c in me.Hand)
        {
            if (!cards.TryGetValue(c.Uid, out var v) || v == null || v.Table || !v.gameObject.activeSelf) continue;
            float delay = 0.35f + i++ * 0.11f;
            v.FlyFrom(deck + Vector3.up * 0.1f, this.table.rotation, Vector3.one * PileScale, delay, 0.52f, true);
            Sound.Play("draw", delay);
        }
        DealtAt = Time.time + 0.35f + i * 0.11f + 0.52f;
    }

    /// <summary>How many cards have been dealt into the hand this sync (each a little after the last).</summary>
    int dealing;

    readonly Dictionary<string, (GameState s, PlayerState p, float until)> sunHold = new Dictionary<string, (GameState, PlayerState, float)>();
    readonly Dictionary<string, (GameState s, PlayerState p, CardInstance c, float until)> cardHold = new Dictionary<string, (GameState, PlayerState, CardInstance, float)>();
    GameState synced;
    BattleView syncedBy;
    float holdEnds;

    readonly Dictionary<string, float> linger = new Dictionary<string, float>();
    readonly Dictionary<string, float> leaveAt = new Dictionary<string, float>();

    /// <summary>A card leaving play waits in its slot `seconds` (until the dawn's effects are over), then goes.</summary>
    public void LeaveAfter(string uid, float seconds) => leaveAt[uid] = Time.time + seconds;

    /// <summary>Shown again as it is (a hold changed).</summary>
    public void Resync()
    {
        if (synced != null && syncedBy != null) Sync(synced, syncedBy);
    }

    /// <summary>The middle of the table (the Stellari and the round's disc), in world space.</summary>
    public Vector3 Middle => table.TransformPoint(Vector3.zero);

    /// <summary>Half the round's disc, and half the Stellari's slot, across (world).</summary>
    public float RoundHalf => L.U(L.Round) / 2 * table.lossyScale.x;
    public float StarHalf => L.U(L.Star) / 2 * table.lossyScale.x;

    /// <summary>Your deck run out (.fx-shuffle): its pile rocks a little either way, 0.6 s.</summary>
    public void ShuffleDeck()
    {
        if (myDeck == null || !Application.isPlaying) return;
        var pile = myDeck.transform.parent;
        if (pile.GetComponent<Rocking>() == null) pile.gameObject.AddComponent<Rocking>();
    }

    /// <summary>The cards on the table.</summary>
    public IEnumerable<string> OnTable() => cards.Where(kv => kv.Value != null && kv.Value.Table).Select(kv => kv.Key).ToList();

    /// <summary>A card a blow takes stays in its slot until the blow reaches it, `seconds` from now.</summary>
    public void Linger(string uid, float seconds) => linger[uid] = Time.time + seconds;

    /// <summary>A sun keeps showing `was` (in the state `before`) for `seconds`, until what strikes it lands.</summary>
    public void HoldSun(string playerId, GameState before, PlayerState was, float seconds)
    {
        if (seconds < 0.15f) { sunHold.Remove(playerId); return; }
        sunHold[playerId] = (before, was, Time.time + seconds);
        holdEnds = Mathf.Max(holdEnds, Time.time + seconds);
    }

    /// <summary>A card in play keeps showing its numbers from `before` for `seconds`, until what strikes it lands.</summary>
    public void HoldCard(string uid, GameState before, float seconds)
    {
        foreach (var p in before.Players)
            foreach (var c in p.Tableau)
                if (c.Uid == uid)
                {
                    cardHold[uid] = (before, p, c, Time.time + seconds);
                    holdEnds = Mathf.Max(holdEnds, Time.time + seconds);
                    return;
                }
    }

    void Update()
    {
        // (A hold over: shown as it is now.)
        if (holdEnds > 0 && Time.time >= holdEnds)
        {
            holdEnds = 0;
            sunHold.Clear();
            cardHold.Clear();
            if (synced != null && syncedBy != null) Sync(synced, syncedBy);
        }
        else if (holdEnds > 0)
        {
            bool lapsed = false;
            foreach (var kv in sunHold) if (Time.time >= kv.Value.until) lapsed = true;
            foreach (var kv in cardHold) if (Time.time >= kv.Value.until) lapsed = true;
            if (lapsed && synced != null && syncedBy != null)
            {
                foreach (var k in sunHold.Where(kv => Time.time >= kv.Value.until).Select(kv => kv.Key).ToList()) sunHold.Remove(k);
                foreach (var k in cardHold.Where(kv => Time.time >= kv.Value.until).Select(kv => kv.Key).ToList()) cardHold.Remove(k);
                Sync(synced, syncedBy);
            }
        }
        Hover();
        if (synced != null && syncedBy != null)
        {
            // (A sun's explosion played out: its side greys now, app.ts shownDead.)
            string dead = string.Join(",", synced.Players.Where(syncedBy.ShownDead).Select(p => p.Id));
            if (dead != shownDead) { shownDead = dead; Sync(synced, syncedBy); }
        }
        foreach (var ring in sunRings.Values) ring.Throb();
    }

    string shownDead = "";

    /// <summary>The card in play under the pointer (a mouse's: a touch has no hover), for what aimed heat would leave of it.</summary>
    string tableOver;

    void Hover()
    {
        if (!Application.isPlaying || Cam == null || synced == null || syncedBy == null || Input.touchCount > 0) return;
        string over = null;
        if (Physics.Raycast(Cam.ScreenPointToRay(Input.mousePosition), out var hit, 100))
        {
            var v = hit.collider.GetComponentInParent<CardView>();
            if (v != null && v.Table) over = v.Uid;
        }
        if (over == tableOver) return;
        var was = tableOver;
        tableOver = over;
        // (Only the two cards' badges drawn again: the one left, and the one now under it.)
        foreach (var uid in new[] { was, over })
        {
            if (uid == null || !cards.TryGetValue(uid, out var v) || v == null) continue;
            var p = synced.Players.FirstOrDefault(x => x.Tableau.Any(c => c.Uid == uid));
            var c = p?.Tableau.First(x => x.Uid == uid);
            if (c == null || (cardHold.TryGetValue(uid, out var held) && Time.time < held.until)) continue;
            InPlay(v, synced, p, c, syncedBy, uid == over);
        }
    }

    /// <summary>
    /// The cards' rims and dimming done again for what is being chosen (a drag over a new spot), nothing else: a whole
    /// Sync each time the pointer crossed into a slot or onto a card dropped frames while dragging.
    /// </summary>
    public void Redress(GameState s, BattleView ui)
    {
        foreach (var p in s.Players)
        {
            bool mine = p.Id == Viewer;
            foreach (var c in p.Tableau)
                if (cards.TryGetValue(c.Uid, out var v) && v != null) ui.Dress(v, p, c, true);
            if (mine)
                foreach (var c in p.Hand)
                    if (cards.TryGetValue(c.Uid, out var v) && v != null) ui.Dress(v, p, c, false);
        }
    }

    /// <summary>The sun of a player, as drawn.</summary>
    public SunView SunOf(string playerId) => suns.TryGetValue(playerId, out var s) ? s : null;

    /// <summary>Where a card is now (world space), if on show.</summary>
    public Vector3? WorldOf(string uid) => cards.TryGetValue(uid, out var v) ? v.transform.position : (Vector3?)null;

    /// <summary>
    /// A card in play's badges: its attack (dimmed once it has attacked), stability, and defence (a Guard's; worn by
    /// heat, .stat-dented). While heat or an attack is aimed, a card that can be chosen shows, under the pointer
    /// (`over`), the defence and stability it would leave, in red (app.ts pv: .card-choosable:hover .pv-after). And
    /// what else renderCard sets on it (Marks).
    /// </summary>
    static void InPlay(CardView v, GameState s, PlayerState p, CardInstance c, BattleView ui, bool over)
    {
        var def = Cards.Def(c.DefId);
        int atk = Game.CardAttack(s, p, c);
        bool armed = atk > 0 || Game.BaseAttack(def) > 0;
        v.Badge("atk", c.Dimmed == true ? "atk-dim" : "atk", armed ? Mathf.Max(0, atk) : (int?)null);
        int hp = c.Health ?? 0, defence = Game.CardDefence(p, c);
        var pv = over && ui != null && ui.Choosable(p, c) ? ui.Preview(c.Uid) : null;
        bool pvHp = pv != null && pv.Value.hp != hp, pvDef = pv != null && pv.Value.def != defence;
        string stab = hp <= 1 ? "stab-low" : "stab", shield = (Game.IsGuard(p, c) ? "guard" : "def") + ((c.Dented ?? 0) > 0 ? "-dent" : "");
        v.Badge("stab", pvHp ? stab + "-pv" : stab, pvHp ? pv.Value.hp : hp);
        v.Badge("def", pvDef ? shield + "-pv" : shield, pvDef ? pv.Value.def : defence);
        v.Dimmed(c.Dimmed == true);
        v.Frozen(c.Frozen == true);
        CardMarks(v, s, p, c, ui);
    }

    // (Where each of a card's marks is drawn: under the card, over its face, over its badges (3010).)
    const int QRing = 2994, QFusedBack = 2997, QFused = 2998, QFrost = 3005, QRoom = 3012, QGrowth = 3013, QChill = 3014, QShields = 3015, QAimHeat = 3016;

    /// <summary>
    /// app.ts renderCard, a card in play: its growth (top right), the boons and a room's guns along its top (.card-room),
    /// the Fusion cards fused onto it tucked behind it (each a step higher, its name showing), the frost of a frozen or
    /// chilled card (chilled's drawn over frozen's, as the later rule) and a chilled card's snowflake, its own shields
    /// (on its top edge), the ring round a card a staged card is aimed at (.card-targeted), the burn of an Overlord's
    /// part acting next (.card-intent) and the heat each part acting will deal, large across its middle (.boss-aim-heat).
    /// </summary>
    static void CardMarks(CardView v, GameState s, PlayerState p, CardInstance c, BattleView ui)
    {
        var def = Cards.Def(c.DefId);
        v.Mark("growth", (c.Growth ?? 0) > 0 ? $"growth-{Mathf.Min(c.Growth.Value, 20)}" : null, QGrowth);
        // (The room's guns, then the card's boons, one mark a kind: a Hero's boons stand on its rail instead.)
        bool hero = c.Slot == Game.CommandSlot;
        var room = ui != null ? ui.RoomMarks(p, hero ? -1 : c.Slot ?? -1, false, def.Kind == "command" && hero ? null : c.Boons) : new List<(string, int)>();
        float css = v.Css > 0 ? v.Css : L.Tcw, bd = 0.18f, gap = 3 / css, total = room.Count * bd + Mathf.Max(0, room.Count - 1) * gap;
        for (int i = 0; i < Mathf.Max(room.Count, v.RoomShown); i++)
        {
            string name = i >= room.Count ? null : room[i].Item1 == "guns" ? $"guns-{Mathf.Clamp(room[i].Item2, 1, 6)}" : $"boon-{room[i].Item1}-{Mathf.Clamp(room[i].Item2, 0, 3)}";
            v.Mark($"room{i}", name, QRoom, -total / 2 + bd / 2 + i * (bd + gap));
        }
        v.RoomShown = room.Count;
        for (int i = 0; i < 2; i++)
            v.Mark($"fused{i}", c.Fused != null && i < c.Fused.Count ? $"fused-{c.Fused[i].DefId}-{i}" : null, i == 0 ? QFused : QFusedBack);
        v.Mark("frost", (c.Chill ?? 0) > 0 ? "chilled" : c.Frozen == true ? "frozen" : null, QFrost);
        v.Mark("chill", (c.Chill ?? 0) > 0 ? $"chill-{Mathf.Min(c.Chill.Value, 6)}" : null, QChill);
        v.Mark("shields", (c.Shields ?? 0) > 0 ? $"shields-{Mathf.Min(c.Shields.Value, 12)}" : null, QShields);
        // (The part acting next burns over any ring: its box-shadow !important.)
        bool full = Cards.IsBossCard(c.DefId) || Builds.IsCaptain(c.DefId) || c.DefId.StartsWith("companion_");
        bool intent = full && p.Boss?.Intent == c.Uid;
        bool targeted = ui != null && ui.StageTarget == c.Uid && !ui.Choosable(p, c);
        v.Mark("ring", intent ? "intent" : targeted ? "targeted" : null, QRing);
        int aimHeat = 0;
        if (p.Boss != null && (p.Boss.Intent == c.Uid || Game.BossMinions(p).Any(m => m.Uid == c.Uid)))
        {
            var blow = Game.PartAim(s, p, c);
            aimHeat = Mathf.Max(0, blow.Sun);
            foreach (var x in blow.Cards) aimHeat = Mathf.Max(aimHeat, x.heat);
        }
        v.Mark("aimheat", aimHeat > 0 ? $"aimheat-{Mathf.Min(aimHeat, 20)}" : null, QAimHeat);
    }

    /// <summary>
    /// An empty slot as app.ts renderTableau draws it now: its defence (a ship's room's walls added; the Hero's, the
    /// command room's; the wear of the card that stood there taken off, mending a day at a time), wrecked shut, the
    /// Hero's with its hero wounded, a room's guns and module, its side out of the game.
    /// </summary>
    static SlotLook SlotNow(PlayerState p, int slot, BattleView ui)
    {
        var look = new SlotLook { Dead = ui.ShownDead(p) };
        if (slot < 0)
        {
            look.Def = Balance.CommandSlotDefence + (p.Rooms?.Command ?? 0);
            look.Wounded = p.Wounded != null && Game.CommandCard(p) == null;
            return look;
        }
        if (Game.SlotClosed(p, slot)) { look.Wrecked = true; return look; }
        int full = Game.SlotDefence(slot) + (p.Rooms?.Defence != null && slot < p.Rooms.Defence.Count ? p.Rooms.Defence[slot] : 0);
        int wear = p.SlotWear != null && p.SlotWear.TryGetValue(slot, out var w) ? w : 0;
        look.Def = Mathf.Max(0, full - wear);
        look.Worn = wear > 0;
        if (p.Rooms != null)
        {
            var marks = ui.RoomMarks(p, slot, true);
            if (marks.Count > 0) look.Rooms = string.Join(",", marks.Select(m => $"{m.kind}:{m.n}"));
        }
        return look;
    }

    SunView SunFor(PlayerState p, bool mine)
    {
        if (!suns.TryGetValue(p.Id, out var sun))
        {
            sun = SunView.Make(table, mine ? MySun : RivalSun, p.Id, mine);
            suns[p.Id] = sun;
        }
        PlaceSun(sun, mine);
        return sun;
    }

    public CardView View(string uid) => cards.TryGetValue(uid, out var v) ? v : null;

    /// <summary>Every card settled where it is going (for a still picture).</summary>
    public void Settle()
    {
        foreach (var v in cards.Values) v.Settle();
        foreach (var sun in suns.Values) sun.Settle();
        // (Text meshes are built as they're about to be drawn in play; for a still picture, now.)
        foreach (var t in GetComponentsInChildren<TMPro.TMP_Text>(true)) t.ForceMeshUpdate();
        foreach (var t in Cam.GetComponentsInChildren<TMPro.TMP_Text>(true)) t.ForceMeshUpdate();
    }
}

/// <summary>
/// styles.css .vitals-choosable .vit::after: a circle 2% in from the sun's box, a 3 px border rgba(216,69,43,0.85), and
/// round it a 2 px white ring and a red glow (0 0 18px rgba(216,69,43,0.45)), throbbing (aim-throb, 1.4 s ease-in-out,
/// endless: half way, the white ring and the glow give way to a glow of 0 0 14px rgba(216,69,43,0.9)). Its two
/// shadows' looks drawn each once and crossfaded; the border over them.
/// </summary>
public class SunRing
{
    public readonly GameObject Go;
    public readonly float Vs;
    public float Since;
    readonly MeshRenderer rest, peak;
    static readonly Dictionary<string, Texture2D> made = new Dictionary<string, Texture2D>();

    public SunRing(Transform table, float vs)
    {
        Vs = vs;
        Go = new GameObject("Sun ring");
        Go.transform.SetParent(table, false);
        float r = 0.48f * vs, R = r + 30;
        float size = BoardLayout.Current.U(2 * R);
        rest = Board.Picture("Rest", Go.transform, Ring(r, R, 0), Color.white, size, size, 2965, 0.001f);
        peak = Board.Picture("Peak", Go.transform, Ring(r, R, 1), Color.white, size, size, 2966, 0.0012f);
        Board.Picture("Border", Go.transform, Ring(r, R, 2), Color.white, size, size, 2967, 0.0014f);
        Throb();
    }

    public void Throb()
    {
        if (Go == null || !Go.activeSelf) return;
        float t = Mathf.Repeat(Time.time - Since, 1.4f) / 1.4f;
        float k = t < 0.5f ? BattleView.CubicBezier(0.42f, 0, 0.58f, 1, t / 0.5f) : 1 - BattleView.CubicBezier(0.42f, 0, 0.58f, 1, (t - 0.5f) / 0.5f);
        rest.sharedMaterial.color = new Color(1, 1, 1, 1 - k);
        peak.sharedMaterial.color = new Color(1, 1, 1, k);
    }

    /// <summary>
    /// One layer, a picture 2 `R` CSS px across round the circle of radius `r` (3 texels a pixel): 0, its shadows at
    /// rest (the glow under the white ring); 1, half way (the 14 px glow); 2, the border.
    /// </summary>
    static Texture2D Ring(float r, float R, int layer)
    {
        string key = $"{r:0.00} {layer}";
        if (made.TryGetValue(key, out var t)) return t;
        const float k = 3;
        int n = Mathf.CeilToInt(2 * R * k);
        t = new Texture2D(n, n, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Trilinear };
        var px = new Color[n * n];
        var red = new Color(216 / 255f, 69 / 255f, 43 / 255f);
        // (A box-shadow's blur is a Gaussian of half its length; outside the circle only.)
        float Glow(float d, float blur) => d <= r ? 0 : 0.5f * Erfc((d - r) / (blur / 2 * Mathf.Sqrt(2)));
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float d = new Vector2((x + 0.5f) / k - R, (y + 0.5f) / k - R).magnitude, aa = 0.5f / k;
                Color c;
                if (layer == 2) c = new Color(red.r, red.g, red.b, 0.85f * Mathf.Clamp01(Mathf.Min(d - (r - 3) + aa, r - d + aa) / (2 * aa)));
                else if (layer == 1) c = new Color(red.r, red.g, red.b, 0.9f * Glow(d, 14));
                else
                {
                    float glow = 0.45f * Glow(d, 18), white = Mathf.Clamp01(Mathf.Min(d - r + aa, r + 2 - d + aa) / (2 * aa));
                    float a = white + glow * (1 - white);
                    c = a <= 0 ? new Color(1, 1, 1, 0) : new Color(Mathf.Lerp(red.r, 1, white / a), Mathf.Lerp(red.g, 1, white / a), Mathf.Lerp(red.b, 1, white / a), a);
                }
                px[y * n + x] = c;
            }
        t.SetPixels(px);
        t.Apply(true);
        made[key] = t;
        return t;
    }

    /// <summary>The complementary error function (Abramowitz and Stegun 7.1.26).</summary>
    static float Erfc(float x)
    {
        float z = Mathf.Abs(x), u = 1 / (1 + 0.3275911f * z);
        float e = u * (0.254829592f + u * (-0.284496736f + u * (1.421413741f + u * (-1.453152027f + u * 1.061405429f)))) * Mathf.Exp(-z * z);
        return x >= 0 ? e : 2 - e;
    }
}

/// <summary>
/// The Stellari on the board, turning as backdrop.ts turns it: one turn every three minutes, its inner ring the other
/// way at 0.6 of the speed, and a 30° burst each time a move is made (eased in and out over 1.8 s).
/// </summary>
public class StarSpin : MonoBehaviour
{
    public Transform Outer, Inner;
    float angle;
    // (As backdrop.ts's, one for the page: kept when the board is laid out again.)
    static float tint, tintTarget;
    /// <summary>The petals' colour now (backdrop.ts applyTint's rgb), for the Petals shader to mix by.</summary>
    public static Color PetalColour = Color.white;
    readonly System.Collections.Generic.List<float> bursts = new System.Collections.Generic.List<float>();
    static StarSpin current;

    void Awake() => current = this;

    /// <summary>
    /// The region's stability, as backdrop.ts setHeat: -1 fully stable (blue), 0 drained, up to 1 the more unstable it
    /// grows (red). The petals take a light wash of it, eased toward it.
    /// </summary>
    public static void Heat(float t) => tintTarget = Mathf.Clamp(t, -1, 1);

    /// <summary>A move was made: spin faster for a moment (at most three at once).</summary>
    public static void Burst()
    {
        if (current == null || current.bursts.Count >= 3) return;
        current.bursts.Add(Time.time);
        current.burstDeg.Add(30);
        current.burstTime.Add(1.8f);
    }

    readonly System.Collections.Generic.List<float> burstDeg = new System.Collections.Generic.List<float>(), burstTime = new System.Collections.Generic.List<float>();
    readonly System.Collections.Generic.List<(float start, float hold)> rages = new System.Collections.Generic.List<(float, float)>();
    float rage;

    /// <summary>
    /// backdrop.ts heatWave: the Stellari looses a heat wave: it whirls round (120 degrees over 0.75 s) and turns red
    /// (eased in over 0.2 s), holds red while the wave goes out (`hold`), then cools back over 0.4 s.
    /// </summary>
    public static void HeatWave(float hold)
    {
        if (current == null) return;
        current.rages.Add((Time.time, hold));
        current.bursts.Add(Time.time);
        current.burstDeg.Add(120);
        current.burstTime.Add(0.75f);
    }

    void Update()
    {
        angle = (angle + 2 * Mathf.Min(0.1f, Time.deltaTime)) % 1800;
        float extra = 0;
        for (int i = bursts.Count - 1; i >= 0; i--)
        {
            float deg = i < burstDeg.Count ? burstDeg[i] : 30, ms = i < burstTime.Count ? burstTime[i] : 1.8f;
            float t = (Time.time - bursts[i]) / ms;
            if (t >= 1)
            {
                angle = (angle + deg) % 1800;
                bursts.RemoveAt(i);
                if (i < burstDeg.Count) burstDeg.RemoveAt(i);
                if (i < burstTime.Count) burstTime.RemoveAt(i);
                continue;
            }
            extra += deg * (0.5f - Mathf.Cos(Mathf.PI * Mathf.Max(0, t)) / 2);
        }
        float a = angle + extra;
        // (A heat wave's flush of red: in over 0.2 s, held, then out over 0.4 s.)
        float ease(float x) => 0.5f - Mathf.Cos(Mathf.PI * x) / 2;
        float r = 0;
        for (int i = rages.Count - 1; i >= 0; i--)
        {
            float t = Time.time - rages[i].start, hold = rages[i].hold;
            if (t > 0.2f + hold + 0.4f) { rages.RemoveAt(i); continue; }
            r = Mathf.Max(r, t < 0.2f ? ease(t / 0.2f) : t < 0.2f + hold ? 1 : 1 - ease((t - 0.2f - hold) / 0.4f));
        }
        bool tinted = r != rage;
        rage = r;
        // (applyTint: deep red when hot, icy blue when cold, and red, strongly, while it looses a heat wave; the petals
        // mixed a third of the way toward it, or most of the way in a heat wave.)
        if (Mathf.Abs(tint - tintTarget) > 0.002f)
        {
            tint += (tintTarget - tint) * Mathf.Min(1, Time.deltaTime * 1.5f);
            tinted = true;
        }
        if (tinted)
        {
            var b = tint >= 0 ? new Color(226 / 255f, 84 / 255f, 66 / 255f) : new Color(74 / 255f, 142 / 255f, 226 / 255f);
            b = Color.Lerp(b, new Color(222 / 255f, 52 / 255f, 38 / 255f), rage);
            PetalColour = Color.Lerp(Color.white, b, Mathf.Max(Mathf.Abs(tint) * 0.35f, rage * 0.9f));
            foreach (var t in new[] { Outer, Inner })
                if (t != null) t.GetComponentInChildren<MeshRenderer>().sharedMaterial.color = PetalColour;
        }
        // (Clockwise as the page sees it, from above the board.)
        if (Outer != null) Outer.localRotation = Quaternion.Euler(0, a, 0);
        if (Inner != null) Inner.localRotation = Quaternion.Euler(0, -a * 0.6f, 0);
    }
}

/// <summary>
/// A pile as tall as the cards in it (app.ts renderPiles, .tpile-stacked): its top card raised by its depth (0.45 px a
/// card, at least 1), their edges stacked beneath it a pixel apart, light and grey in turn, and a soft shadow under all.
/// </summary>
public class PileStack : MonoBehaviour
{
    public MeshRenderer Face;
    int shown = -1;
    float faceZ = float.NaN;

    public void Set(int n)
    {
        int depth = n > 0 ? Mathf.Max(1, Mathf.RoundToInt(n * 0.45f)) : 0;
        if (depth == shown) return;
        shown = depth;
        foreach (Transform c in transform)
            if (c.name == "Edge" || c.name == "Stack shadow" || c.name == "Top ring") Mats.Kill(c.gameObject);
        if (float.IsNaN(faceZ)) faceZ = Face.transform.localPosition.z;
        // (A pixel in the pile's own units: it is a pile's width across.)
        float px = 1 / Board.L.Pw;
        var p = Face.transform.localPosition;
        Face.transform.localPosition = new Vector3(p.x, p.y, faceZ + depth * px);
        if (depth == 0) return;
        float radius = Board.L.Tcw * 0.07f * px;
        // (The top card's 1 px white ring: 0 0 0 1px #fff.)
        var ring = Board.Shape("Top ring", transform, Color.white, 1 + 2 * px, 1.4f + 2 * px, radius + px, 2949, 0.0195f, 0.002f, 0.004f);
        ring.transform.localPosition = new Vector3(0, 0.0195f, faceZ + depth * px);
        // (Its edges, a pixel apart beneath it: #f4f4f2 the first, then #d9dadf, in turn.)
        for (int i = 1; i <= depth; i++)
        {
            var e = Board.Shape("Edge", transform, i % 2 == 1 ? Board.Rgba(0xf4, 0xf4, 0xf2) : Board.Rgba(0xd9, 0xda, 0xdf), 1, 1.4f, radius, 2948 - Mathf.Min(i, 40), 0.019f, 0.002f, 0.004f);
            e.transform.localPosition = new Vector3(0, 0.019f, faceZ + (depth - i) * px);
        }
        // (0 depth+3px 8px rgba(80, 84, 100, 0.22), under them all.)
        var sh = Board.Shape("Stack shadow", transform, Board.Rgba(80, 84, 100, 0.22f), 1, 1.4f, radius, 2905, 0.0185f, 8 * px, 10 * px);
        sh.transform.localPosition = new Vector3(0, 0.0185f, faceZ + (depth - depth - 3) * px);
    }
}

/// <summary>Which side's slot an object on the table is.</summary>
/// <summary>One of the board's own buttons (a pile, a hand count, a name, an eye, the round): what it is, and whose.</summary>
public class BoardHit : MonoBehaviour
{
    public string Act;
    public bool Mine;
}

public class SlotTag : MonoBehaviour
{
    public bool Mine;
    public int Slot;
    public void Set(bool mine, int slot)
    {
        Mine = mine;
        Slot = slot;
    }
}

/// <summary>
/// The board's drawn pieces, made once as pictures: an empty slot's dashed outline (styles.css .slot-empty), an open
/// pile's (.tpile-empty), and the frame round each side's tableau (app.ts frameTableaus), and the arcs of a ring.
/// </summary>
public static class BoardArt
{
    static readonly Dictionary<string, Texture2D> made = new Dictionary<string, Texture2D>();

    static float Box(float px, float py, float hx, float hy, float r)
    {
        float qx = Mathf.Abs(px) - hx + r, qy = Mathf.Abs(py) - hy + r;
        float ox = Mathf.Max(qx, 0), oy = Mathf.Max(qy, 0);
        return Mathf.Sqrt(ox * ox + oy * oy) + Mathf.Min(Mathf.Max(qx, qy), 0) - r;
    }

    /// <summary>`c` laid over `under` (straight alpha), `a` of it showing.</summary>
    static Color Over(Color under, Color c, float a)
    {
        float sa = c.a * Mathf.Clamp01(a);
        float oa = sa + under.a * (1 - sa);
        if (oa <= 0) return new Color(c.r, c.g, c.b, 0);
        var rgb = ((Vector4)c * sa + (Vector4)under * under.a * (1 - sa)) / oa;
        return new Color(rgb.x, rgb.y, rgb.z, oa);
    }

    static Texture2D New(int w, int h)
    {
        return new Texture2D(w, h, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Trilinear, anisoLevel = 4 };
    }

    /// <summary>
    /// A dashed rounded box filling the picture (all sizes in its pixels): its fill, a line inside the edge, the
    /// dashed edge (dashes centred on each side's middle).
    /// </summary>
    static Texture2D Dashed(int w, int h, float radius, Color fill, Color inset, float insetW, Color edge, float edgeW, float dash, float gap)
    {
        var t = New(w, h);
        var px = new Color[w * h];
        float hx = w / 2f, hy = h / 2f, period = dash + gap;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                float u = x + 0.5f - hx, v = y + 0.5f - hy;
                float d = Box(u, v, hx, hy, radius);
                var c = new Color(fill.r, fill.g, fill.b, 0);
                c = Over(c, fill, 0.5f - d);
                // (The inner line just inside the edge, then the edge itself.)
                c = Over(c, inset, Mathf.Min(d + edgeW + insetW + 0.5f, 0.5f - (d + edgeW)));
                float s = Mathf.Abs(u) <= hx - radius ? Mathf.Abs(u) : Mathf.Abs(v) <= hy - radius ? Mathf.Abs(v) : -1;
                bool on = s < 0 || Mathf.Repeat(s + dash / 2, period) < dash;
                if (on) c = Over(c, edge, Mathf.Min(d + edgeW + 0.5f, 0.5f - d));
                px[y * w + x] = c;
            }
        t.SetPixels(px);
        t.Apply(true);
        return t;
    }

    /// <summary>
    /// A dashed box `w` by `h` CSS px (drawn at 3 texels a pixel): corners of `radius`, filled `fill`, a `edgeW` px
    /// dashed `edge` (as a CSS dashed border: dashes 3 widths long, as far apart).
    /// </summary>
    public static Texture2D DashedBox(float w, float h, float radius, Color fill, Color edge, float edgeW)
    {
        string key = $"dashed {w:0.0}x{h:0.0} {radius} {ColorUtility.ToHtmlStringRGBA(fill)} {ColorUtility.ToHtmlStringRGBA(edge)} {edgeW}";
        if (made.TryGetValue(key, out var t)) return t;
        const float k = 3;
        t = Dashed(Mathf.CeilToInt(w * k), Mathf.CeilToInt(h * k), radius * k, fill, new Color(0, 0, 0, 0), 0, edge, edgeW * k, edgeW * 3 * k, edgeW * 3 * k);
        made[key] = t;
        return t;
    }

    /// <summary>Texels a CSS pixel of the board, for the slots' and piles' outlines (their 1 px dashes kept sharp).</summary>
    const float Texel = 2;

    /// <summary>
    /// A box `w` × `h` CSS px drawn as the web's: corners of `radius`, filled `fill`, an `insetW` px `inset` line just
    /// inside its edge, a `edgeW` px dashed `edge` (as Chrome dashes a border: dashes and gaps 3 widths long).
    /// </summary>
    static Texture2D Outline(string key, float w, float h, float radius, Color fill, Color inset, float insetW, Color edge, float edgeW)
    {
        key = $"{key} {w:0.0}x{h:0.0}";
        if (made.TryGetValue(key, out var t)) return t;
        const float k = Texel;
        t = Dashed(Mathf.CeilToInt(w * k), Mathf.CeilToInt(h * k), radius * k, fill, inset, insetW * k, edge, edgeW * k, 3 * edgeW * k, 3 * edgeW * k);
        made[key] = t;
        return t;
    }

    /// <summary>
    /// An empty slot at the board's size (styles.css .slot-empty: --tcw × 1.4, corners 8% of it, rgba(250,251,253,0.66),
    /// a 1 px white line at 0.5 inside a 1 px dashed edge); a trap's edge indigo (.slot-ls).
    /// </summary>
    public static Texture2D Slot(bool trap)
    {
        float w = BoardLayout.Current.Tcw;
        return Outline(trap ? "trap" : "slot", w, w * 1.4f, w * 0.08f, new Color(250 / 255f, 251 / 255f, 253 / 255f, 0.66f), new Color(1, 1, 1, 0.5f), 1,
            trap ? new Color(75 / 255f, 79 / 255f, 176 / 255f, 0.4f) : new Color(140 / 255f, 150 / 255f, 175 / 255f, 0.35f), 1);
    }

    /// <summary>
    /// A campaign hero's slot while the hero is wounded (.slot-empty.slot-wounded): a faint red, rgba(176,84,74,0.12), its
    /// dashed edge rgba(232,138,128,0.6).
    /// </summary>
    public static Texture2D SlotWounded()
    {
        float w = BoardLayout.Current.Tcw;
        return Outline("wounded", w, w * 1.4f, w * 0.08f, new Color(176 / 255f, 84 / 255f, 74 / 255f, 0.12f), new Color(1, 1, 1, 0.5f), 1, new Color(232 / 255f, 138 / 255f, 128 / 255f, 0.6f), 1);
    }

    /// <summary>
    /// A wrecked slot (.slot-empty.slot-wrecked: a merchant's device that blew): scorched shut, its edge solid
    /// rgba(181,80,58,0.35), striped across at 135° (rgba(120,90,80,0.12) 6 px, clear 6 px) over rgba(60,50,48,0.06).
    /// </summary>
    public static Texture2D SlotWrecked()
    {
        float w = BoardLayout.Current.Tcw, h = w * 1.4f;
        string key = $"wrecked {w:0.0}x{h:0.0}";
        if (made.TryGetValue(key, out var t)) return t;
        const float k = Texel;
        int tw = Mathf.CeilToInt(w * k), th = Mathf.CeilToInt(h * k);
        // (Its edge and the white line inside it; a gap of nothing: solid.)
        t = Dashed(tw, th, w * 0.08f * k, new Color(0, 0, 0, 0), new Color(1, 1, 1, 0.5f), k, new Color(181 / 255f, 80 / 255f, 58 / 255f, 0.35f), k, 3 * k, 0);
        var px = t.GetPixels();
        float hx = tw / 2f, hy = th / 2f;
        Color under = new Color(60 / 255f, 50 / 255f, 48 / 255f, 0.06f), stripe = new Color(120 / 255f, 90 / 255f, 80 / 255f, 0.12f);
        for (int y = 0; y < th; y++)
            for (int x = 0; x < tw; x++)
            {
                float cover = Mathf.Clamp01(0.5f - Box(x + 0.5f - hx, y + 0.5f - hy, hx, hy, w * 0.08f * k));
                // (Along the gradient's line, from the top left corner: rows run bottom up.)
                float along = ((x + 0.5f) + (th - y - 0.5f)) / k / Mathf.Sqrt(2);
                var c = Over(new Color(0, 0, 0, 0), under, cover);
                if (Mathf.Repeat(along, 12) < 6) c = Over(c, stripe, cover);
                px[y * tw + x] = Over(c, px[y * tw + x], 1);
            }
        t.SetPixels(px);
        t.Apply(true);
        made[key] = t;
        return t;
    }

    /// <summary>A slot open to the card picked (button.slot-choosable): white at 0.7, a 1.5 px coral dashed edge.</summary>
    public static Texture2D SlotChoose()
    {
        float w = BoardLayout.Current.Tcw;
        return Outline("choose", w, w * 1.4f, w * 0.08f, new Color(1, 1, 1, 0.7f), new Color(1, 1, 1, 0), 0, new Color(208 / 255f, 101 / 255f, 75 / 255f, 0.7f), 1.5f);
    }

    /// <summary>An open pile's empty place (.tpile-empty: --pw × 1.4, corners 7% of --tcw, rgba(250,251,253,0.6), a 1 px dashed edge).</summary>
    public static Texture2D Pile()
    {
        var l = BoardLayout.Current;
        return Outline("pile", l.Pw, l.Pw * 1.4f, l.Tcw * 0.07f, new Color(250 / 255f, 251 / 255f, 253 / 255f, 0.6f), new Color(1, 1, 1, 0), 0, new Color(140 / 255f, 150 / 255f, 175 / 255f, 0.4f), 1);
    }

    /// <summary>
    /// The frame round your tableau (in card widths): your row's six places, `rowW` across, and your Hero's place above
    /// its right end, `up` beyond the row's top edge; `pad` round them (the web's --frame-pad), corners of 12 px and the
    /// inner corner where they meet rounded 8 px. (Your rival's, turned round.) Its picture is `rowW` + 2 `pad` wide and
    /// 1.4 + 2 `pad` + `up` deep, the row's middle `up` / 2 below its middle.
    /// </summary>
    public static Texture2D Frame(float rowW, float pad, float up)
    {
        string key = $"frame {rowW:0.000} {pad:0.000} {up:0.000}";
        if (made.TryGetValue(key, out var t)) return t;
        // (Corners of 12 px and 8 px on a card 87 px wide.)
        const float k = 128, r = 0.138f, rc = 0.092f;
        float fw = rowW + 2 * pad, fd = 1.4f + 2 * pad + up;
        int w = Mathf.CeilToInt(fw * k), h = Mathf.CeilToInt(fd * k);
        t = New(w, h);
        var px = new Color[w * h];
        var fill = new Color(250 / 255f, 251 / 255f, 253 / 255f, 0.45f);
        var line = new Color(140 / 255f, 150 / 255f, 175 / 255f, 0.16f);
        float rowZ = -up / 2, rowH = 0.7f + pad, top = rowZ + rowH;
        float bx0 = rowW / 2 - 1 - pad, bx1 = fw / 2, bz1 = rowZ + 0.7f + up + pad;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                float u = (x + 0.5f) / k - fw / 2, v = (y + 0.5f) / k - fd / 2;
                float d = Mathf.Min(Box(u, v - rowZ, fw / 2, rowH, r), Box(u - (bx0 + bx1) / 2, v - (rowZ + bz1) / 2, (bx1 - bx0) / 2, (bz1 - rowZ) / 2, r));
                // (The inner corner, filled round to a quarter circle; the fill reaches a little into both boxes, so
                // their edges there are inside it and draw no line.)
                const float e = 3 / k;
                if (u > bx0 - rc && u < bx0 + e && v > top - e && v < top + rc) d = Mathf.Min(d, rc - Vector2.Distance(new Vector2(u, v), new Vector2(bx0 - rc, top + rc)));
                d *= k;
                var c = Over(new Color(fill.r, fill.g, fill.b, 0), fill, 0.5f - d);
                c = Over(c, line, 1.3f - Mathf.Abs(d));
                px[y * w + x] = c;
            }
        t.SetPixels(px);
        t.Apply(true);
        // (Only the latest few kept: a window dragged to a new size makes a new one each time.)
        foreach (var old in made.Keys.Where(n => n.StartsWith("frame ") && n != key).ToList())
        {
            Mats.Kill(made[old]);
            made.Remove(old);
        }
        made[key] = t;
        return t;
    }

    /// <summary>An arc lying flat, `radius` round and `width` wide, from `from`° to `to`° clockwise from the far side.</summary>
    public static Mesh Arc(float radius, float width, float from, float to)
    {
        int n = Mathf.Max(2, Mathf.CeilToInt(Mathf.Abs(to - from) / 4));
        var verts = new List<Vector3>();
        var uvs = new List<Vector2>();
        var tris = new List<int>();
        for (int i = 0; i <= n; i++)
        {
            float a = (90 - Mathf.Lerp(from, to, i / (float)n)) * Mathf.Deg2Rad;
            var dir = new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a));
            verts.Add(dir * (radius - width / 2));
            verts.Add(dir * (radius + width / 2));
            uvs.Add(new Vector2(0.5f, 0.5f));
            uvs.Add(new Vector2(0.5f, 0.5f));
            if (i > 0)
            {
                int j = i * 2;
                tris.AddRange(new[] { j - 2, j - 1, j, j - 1, j + 1, j });
            }
        }
        var m = new Mesh();
        m.SetVertices(verts);
        m.SetUVs(0, uvs);
        m.SetTriangles(tris, 0);
        return m;
    }

    /// <summary>A number in Roman numerals (the round).</summary>
    public static string Roman(int n)
    {
        if (n <= 0) return n.ToString();
        var sb = new System.Text.StringBuilder();
        int[] v = { 1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1 };
        string[] s = { "M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I" };
        for (int i = 0; i < v.Length; i++)
            while (n >= v[i])
            {
                sb.Append(s[i]);
                n -= v[i];
            }
        return sb.ToString();
    }
}

/// <summary>@keyframes shufflePile (0.6 s, each step eased in and out): turned -6 degrees by 25%, 6 by 75%, and back.</summary>
public class Rocking : MonoBehaviour
{
    float t0;
    Quaternion home;

    void Start()
    {
        t0 = Time.time;
        home = transform.localRotation;
    }

    void Update()
    {
        float k = (Time.time - t0) / 0.6f;
        if (k >= 1)
        {
            transform.localRotation = home;
            Destroy(this);
            return;
        }
        float E(float x) => x * x * (3 - 2 * x);
        float deg = k < 0.25f ? Mathf.Lerp(0, -6, E(k / 0.25f)) : k < 0.75f ? Mathf.Lerp(-6, 6, E((k - 0.25f) / 0.5f)) : Mathf.Lerp(6, 0, E((k - 0.75f) / 0.25f));
        // (Turned in the table's plane, clockwise as the page sees it.)
        transform.localRotation = home * Quaternion.Euler(0, deg, 0);
    }
}
