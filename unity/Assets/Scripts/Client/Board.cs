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
public class Board : MonoBehaviour
{
    // The table's layout, in card widths (a card is 1 × 1.4), x across and z away from the viewer, from the Stellari's
    // middle: the web board's own at this screen's size (BoardLayout, from styles.css).
    static BoardLayout L => BoardLayout.Current;
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
    TextMeshPro[] phases;
    readonly MeshRenderer[] phaseDots = new MeshRenderer[3], phaseGlows = new MeshRenderer[3];
    TextMeshPro myLabel, rivalLabel, turnThem, turnYou, roundN, roundUp;
    readonly List<MeshRenderer> roundTicks = new List<MeshRenderer>();
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

    static Color Rgba(int r, int g, int b, float a = 1) => new Color(r / 255f, g / 255f, b / 255f, a);

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
        roundTicks.Clear();
        decor = new GameObject("Decor").transform;
        decor.SetParent(table, false);
        var table0 = table;
        table = decor;
        try { Decor(); }
        finally { table = table0; }
        foreach (var kv in suns) PlaceSun(kv.Value, kv.Value.Mine);
        if (tagWas != null) SetTag(tagWas, subWas);
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
        plate.sharedMaterial.SetFloat("_Aspect", TableD / TableW);
        plate.sharedMaterial.SetFloat("_Radius", r34 / TableW);
        plate.sharedMaterial.renderQueue = 2910;

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
            var r = Mats.Flat("Ring", pivot, Mats.Make("Card"), star, star, ring == "outer" ? 0.001f : 0.0012f);
            r.sharedMaterial.mainTexture = Resources.Load<Texture2D>("Board/star-" + ring);
            r.sharedMaterial.SetFloat("_Radius", 0);
            r.sharedMaterial.SetFloat("_Aspect", 1);
            r.sharedMaterial.color = Color.white;
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
            var halo = Shape("Dot ring", table, Color.white, dot + l.U(3), dot + l.U(3), dot, 2988, 0.0095f);
            halo.transform.SetParent(d.transform, true);
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
        TrapSlot(MyTrap);
        TrapSlot(RivalTrap);
        // (An eye at each row's left end, clear of the tableau's outline: the web's way to look closely at a tableau.)
        float eyeX = l.RowLeft - l.FramePad - 8 - l.Eye / 2;
        Eye(l.At(eyeX, l.RivalRowCy));
        Eye(l.At(eyeX, l.MyRowCy));

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
        var disc = Shape("Round", table, Rgba(247, 247, 248), d, d, d / 2, 2922, 0.002f);
        disc.transform.localPosition = new Vector3(0, 0.002f, 0);
        float svg = d * 0.963f, r = svg * 0.44f;
        roundTrack = Shape("Track", table, Rgba(120, 124, 134, 0.14f), 2 * r + svg * 0.09f, 2 * r + svg * 0.09f, r, 2923, 0.0025f, svg * 0.045f, 0.01f, true);
        roundTrack.transform.localPosition = new Vector3(0, 0.0025f, 0);
        int total = Balance.InstabilityStartsRound - 1;
        for (int i = 0; i < total; i++)
        {
            // (Each tick an arc of the rim, 4° apart from the next, clockwise from the top.)
            var go = new GameObject("Tick");
            go.transform.SetParent(table, false);
            go.transform.localPosition = new Vector3(0, 0.003f, 0);
            var mf = go.AddComponent<MeshFilter>();
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = Mats.Make("Soft", Color.white);
            mr.sharedMaterial.SetFloat("_Size", 0.5f);
            mr.sharedMaterial.SetFloat("_Soft", 0.0001f);
            mr.sharedMaterial.renderQueue = 2924;
            mf.mesh = BoardArt.Arc(r, svg * 0.06f, (i / (float)total) * 360 + 2, ((i + 1) / (float)total) * 360 - 2);
            roundTicks.Add(mr);
        }
        roundN = Mats.FlatText("Round", table, "I", Px(l.RoundNum), Rgba(91, 95, 103), true, 700, 0);
        roundN.transform.localPosition = new Vector3(0, 0.004f, 0);
        roundUp = Mats.FlatText("Unstable", table, "", Px(l.RoundEm), Rgba(192, 86, 61), true, 500, 10);
        roundUp.transform.localPosition = new Vector3(0, 0.004f, -l.U(l.RoundEm * 1.6f));
    }

    /// <summary>A slot's defence: the shield sign and the number, `size` px, centred where it is placed.</summary>
    static void Defence(Transform parent, string text, Vector3 at, Color c, float size)
    {
        // (Measured at a card 87 px wide: as many card widths at this size.)
        float k = 87f / L.Tcw;
        var mark = Picture("Shield", parent, Resources.Load<Texture2D>("Icons/bt-shield"), c, size * 0.00823f * k, size * 0.00862f * k, 2935, 0.002f);
        var t = Mats.FlatText("Defence", parent, text, size * 0.1149f * k, c, true, 400, 8, TextAlignmentOptions.Left);
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
        // (styles.css .slot-empty: pale, a white line inside a dashed edge, corners of 8% of its width.)
        Picture("Outline", go.transform, BoardArt.Slot(false), Color.white, 1, 1.4f, 2925, 0.0005f);
        var ink = Rgba(120, 128, 150, 0.55f);
        int def = Game.SlotDefence(s);
        float size = Mathf.Max(9, L.Tcw * 0.14f);
        if (s < 0)
        {
            // (The Hero's slot: its defence, and "hero" small under it.)
            Defence(go.transform, def.ToString(), new Vector3(0, 0, 0.059f), ink, size);
            var hero = Mats.FlatText("Hero", go.transform, "HERO", Px(Mathf.Max(6, L.Tcw * 0.075f)), new Color(ink.r, ink.g, ink.b, ink.a * 0.8f), true, 400, 20);
            hero.transform.localPosition = new Vector3(0, 0.002f, -0.102f);
        }
        else Defence(go.transform, def.ToString(), Vector3.zero, ink, size);
        var col = go.AddComponent<BoxCollider>();
        col.size = new Vector3(1, 0.05f, 1.4f);
        go.AddComponent<SlotTag>().Set(mine, s);
        slotMarks.Add(go);
    }

    /// <summary>An empty place a trap could be set: a dashed indigo outline, and the trap's mark in it (as the web's).</summary>
    void TrapSlot(Vector3 at)
    {
        var go = new GameObject("Trap slot");
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        Picture("Outline", go.transform, BoardArt.Slot(true), Color.white, 1, 1.4f, 2925, 0.0005f);
        // (Its mark 1.15em of the slot's defence size, drawn on a picture a quarter larger than it.)
        float s = L.U(Mathf.Max(12, L.Tcw * 0.22f) * 1.15f) * 1.25f;
        Picture("Trap", go.transform, Resources.Load<Texture2D>("Icons/bt-trap"), Rgba(70, 74, 160, 0.6f), s, s, 2935, 0.002f);
    }

    /// <summary>A round white button by a row (styles.css .tableau-eye: 30% of a card's width, 26 to 40 px), an eye in it.</summary>
    void Eye(Vector3 at)
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
    }

    MeshRenderer Pile(string name, Vector3 at, bool back, out TextMeshPro count, string title = "")
    {
        var go = new GameObject(name);
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        go.transform.localScale = Vector3.one * PileScale;
        if (back)
        {
            var shadow = Mats.Flat("Shadow", go.transform, Mats.Make("Soft", new Color(0.25f, 0.27f, 0.33f, 0.2f)), 1.5f, 1.9f, -0.001f);
            shadow.sharedMaterial.SetFloat("_Aspect", 1.9f / 1.5f);
            shadow.sharedMaterial.SetFloat("_Size", 0.36f);
            shadow.sharedMaterial.SetFloat("_Soft", 0.09f);
            shadow.sharedMaterial.renderQueue = 2940;
        }
        // (An open pile's place: pale and dashed, as the slots, its name small in it: styles.css .tpile-empty.)
        else Picture("Outline", go.transform, BoardArt.Pile(), Color.white, 1, 1.4f, 2945, 0.001f);
        var face = Mats.Flat("Top", go.transform, Mats.Make("Card"), 1, 1.4f, 0.02f);
        face.sharedMaterial.mainTexture = back ? Resources.Load<Texture2D>("Board/back") : null;
        face.sharedMaterial.color = back ? Color.white : new Color(1, 1, 1, 0);
        face.sharedMaterial.renderQueue = 2950;
        var label = Mats.FlatText("Name", go.transform, title, Px(Mathf.Max(5, L.Pw * 0.068f)) / PileScale, Look.InkSoft, true, 400, 10);
        label.transform.localPosition = new Vector3(0, 0.03f, 0);
        // (.tpile > small: at most 92% of the pile across, cut off past it, as the web's.)
        label.rectTransform.sizeDelta = new Vector2(0.92f, 0.3f);
        label.textWrappingMode = TextWrappingModes.NoWrap;
        label.overflowMode = TextOverflowModes.Truncate;
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

    readonly Dictionary<string, int> lastHealth = new Dictionary<string, int>();
    readonly Dictionary<string, int> lastHeat = new Dictionary<string, int>();

    /// <summary>A number that rises and fades where something changed: heat on a sun, stability on a card.</summary>
    void Float(Vector3 at, int delta, bool heat)
    {
        if (!Application.isPlaying) return;
        var t = Mats.FlatText("Float", table, (delta > 0 ? "+" : "") + delta, Px(48), heat ? (delta > 0 ? Look.Heat : Look.Cool) : (delta < 0 ? Look.Heat : Look.Good), true, 700, 0);
        t.transform.localRotation = Quaternion.LookRotation(Cam.transform.forward, Cam.transform.up);
        t.transform.localPosition = at + new Vector3(0, 1.2f, 0);
        t.outlineWidth = 0.2f;
        t.outlineColor = new Color32(255, 255, 255, 200);
        t.gameObject.AddComponent<Floater>();
    }

    /// <summary>A sun put where the web's stands at this size, at its size.</summary>
    static void PlaceSun(SunView sun, bool mine)
    {
        sun.Place(L, L.WrapLeft + 0.58f * L.Vs, (mine ? L.MyRowCy : L.RivalRowCy) - 0.08f * L.Vs);
    }

    /// <summary>Lay the battle out as it stands: every card where it belongs, every sun as hot as it is.</summary>
    public void Sync(GameState s, BattleView ui)
    {
        if (!Fits) Relayout();
        var me = s.Players.First(p => p.Id == Viewer);
        var rival = s.Players.First(p => p.Id != Viewer);
        var seen = new HashSet<string>();
        foreach (var p in new[] { me, rival })
        {
            bool mine = p == me;
            foreach (var c in p.Tableau)
            {
                var v = Card(c, true, mine);
                seen.Add(c.Uid);
                var at = SlotAt(mine, c.Slot ?? 0) + new Vector3(0, 0.03f, 0);
                v.transform.SetParent(table, false);
                v.MoveTo(at, Quaternion.identity);
                InPlay(v, s, p, c);
                ui.Dress(v, p, c, true);
            }
            // (A trap set face down, beside the row.)
            if (p.Lightspeed != null)
            {
                var v = Card(p.Lightspeed, true, mine);
                seen.Add(p.Lightspeed.Uid);
                v.transform.SetParent(table, false);
                v.MoveTo((mine ? MyTrap : RivalTrap) + new Vector3(0, 0.03f, 0), Quaternion.identity);
                // (Set face down, yours too, as the web's: hold it to read it.)
                v.FaceDown();
                for (int k = 0; k < 3; k++) v.Badge(new[] { "atk", "stab", "def" }[k], "atk", null);
            }
            var sunView = SunFor(p, mine);
            sunView.Show(s, p);
            sunView.Face(Cam);
            if (lastHeat.TryGetValue(p.Id, out var was) && was != p.Heat) Float(mine ? MySun : RivalSun, p.Heat - was, true);
            lastHeat[p.Id] = p.Heat;
            foreach (var c in p.Tableau)
            {
                int hp = c.Health ?? 0;
                if (lastHealth.TryGetValue(c.Uid, out var had) && had != hp) Float(SlotAt(mine, c.Slot ?? 0), hp - had, false);
                lastHealth[c.Uid] = hp;
            }
        }
        Hand(me, ui, seen);
        foreach (var uid in cards.Keys.Where(k => !seen.Contains(k)).ToList())
        {
            // (In play, a card leaving fades away where it was; it was destroyed, returned, or played out.)
            if (Application.isPlaying) cards[uid].Die(0.25f);
            else Mats.Kill(cards[uid].gameObject);
            cards.Remove(uid);
        }
        dealt = true;

        // Piles and counts.
        myDeckN.text = "";
        rivalDeckN.text = "";
        Top(myDiscard, myDiscardN, me.Discard);
        Top(rivalDiscard, rivalDiscardN, rival.Discard);
        Top(myWreck, myWreckN, me.Wreck);
        Top(rivalWreck, rivalWreckN, rival.Wreck);
        myDeck.gameObject.SetActive(me.Deck.Count > 0);
        rivalDeck.gameObject.SetActive(rival.Deck.Count > 0);
        rivalHandN.text = rival.Hand.Count.ToString();
        myHandN.text = me.Hand.Count.ToString();
        SetName(rivalLabel, rival.Name, false);
        SetName(myLabel, me.Name, true);
        var active = Game.ActivePlayer(s);
        bool mineNow = active == me;
        // (Whose turn: the one lit dark, the other pale; the day's part lit, its dot amber, larger and glowing.)
        Color lit = Rgba(47, 58, 82), pale = Rgba(185, 191, 202);
        turnYou.color = mineNow ? lit : pale;
        turnThem.color = mineNow ? pale : lit;
        string phase = ui.Phase;
        for (int i = 0; i < phases.Length; i++)
        {
            bool on = new[] { "dawn", "day", "dusk" }[i] == phase;
            phases[i].color = on ? Rgba(49, 60, 84) : Rgba(161, 168, 179);
            phaseDots[i].sharedMaterial.color = on ? Rgba(239, 161, 67) : Rgba(202, 206, 213);
            phaseDots[i].transform.localScale = dotScale * (on ? 1.25f : 1);
            phaseGlows[i].sharedMaterial.color = Rgba(240, 160, 64, on ? 0.79f : 0);
        }
        // The round, and regional stability's ticks: one drains each round; gone, the track reddens and every sun
        // takes the round's heat at its dawn.
        int total = roundTicks.Count, left = Mathf.Max(0, total - (s.Round - 1)), unstable = Game.InstabilityHeat(s);
        roundN.text = BoardArt.Roman(s.Round);
        roundUp.text = unstable > 0 ? $"+{unstable}" : "";
        roundN.transform.localPosition = new Vector3(0, 0.004f, unstable > 0 ? L.U(3) : 0);
        for (int i = 0; i < total; i++) roundTicks[i].sharedMaterial.color = new Color(1, 1, 1, unstable > 0 ? 0.35f : i < left ? 1 : 0.5f);
        roundTrack.sharedMaterial.color = unstable > 0 ? Rgba(201, 138, 134, 0.25f) : Rgba(120, 124, 134, 0.14f);
        foreach (var slot in slotMarks) slot.SetActive(true);
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
        int n = me.Hand.Count;
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
        float mid = l.HandLeft + l.HandW / 2;
        HandRects.Clear();
        for (int i = 0; i < n; i++)
        {
            var c = me.Hand[i];
            var v = Card(c, false);
            seen.Add(c.Uid);
            v.transform.SetParent(handRoot, false);
            float t = i - (n - 1) / 2f;
            bool lifted = ui.HandLift(c) > 0 || c.Uid == HandHover;
            float turn = lifted ? 0 : t * step;
            float y = spot[i].y - (lifted ? l.DockHh * 0.08f : 0);
            // (Raised: grown from the hand's foot, then lifted.)
            float x = mid + (spot[i].x - mid) * size;
            y = foot + (y - foot) * size - rise;
            var at = l.Screen(x, y, depth);
            v.MoveTo(new Vector3(at.x, -depth + 0.001f * (lifted ? 50 : i), at.y), Quaternion.Euler(0, turn, 0), w * size * px);
            float a = turn * Mathf.Deg2Rad, bw = (w * Mathf.Abs(Mathf.Cos(a)) + h * Mathf.Abs(Mathf.Sin(a))) * size, bh = (w * Mathf.Abs(Mathf.Sin(a)) + h * Mathf.Cos(a)) * size;
            HandRects.Add(new Rect(x - bw / 2, y - bh / 2, bw, bh));
            foreach (var b in new[] { "atk", "stab", "def" }) v.Badge(b, "atk", null);
            v.Dimmed(false);
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
    static void Top(MeshRenderer face, TextMeshPro count, List<CardInstance> pile)
    {
        var top = pile?.LastOrDefault();
        face.sharedMaterial.mainTexture = top != null ? Faces.Of(top.DefId, true) : null;
        face.sharedMaterial.color = top != null ? Color.white : new Color(1, 1, 1, 0);
        count.text = pile != null && pile.Count > 1 ? pile.Count.ToString() : "";
        foreach (Transform c in face.transform.parent) if (c.name == "Name") c.gameObject.SetActive(top == null);
    }

    TextMeshPro tagName, tagSub;

    /// <summary>A lesson's or a challenge's name, and what it asks, under the flower (where a galaxy's would be); null: none.</summary>
    public void SetTag(string name, string sub)
    {
        if (tagName == null)
        {
            float under = L.Star / 2;
            tagName = Mats.FlatText("Tag", decor, "", Px(13.9f), Look.Ink, true, 600, 24);
            tagName.transform.localPosition = new Vector3(0, 0.01f, -L.U(under + 9));
            tagSub = Mats.FlatText("Tag words", decor, "", Px(12.2f), Look.InkSoft, false, 400, 4);
            tagSub.transform.localPosition = new Vector3(0, 0.01f, -L.U(under + 25));
        }
        tagName.text = name?.ToUpperInvariant() ?? "";
        tagSub.text = sub ?? "";
    }

    /// <summary>Whether the board has been laid out once (after that, cards arriving come from somewhere).</summary>
    bool dealt;

    CardView Card(CardInstance c, bool table, bool mine = true)
    {
        if (cards.TryGetValue(c.Uid, out var v) && v.Table != table)
        {
            // (From the hand to the table: a new view, as its face is the table's, flying from where the old one was.)
            var at = v.transform;
            var nv = CardView.Make(table ? this.table : handRoot, c.Uid, c.DefId, table);
            nv.StartFrom(at.position, at.rotation, at.lossyScale);
            Mats.Kill(v.gameObject);
            cards[c.Uid] = nv;
            return nv;
        }
        if (v == null)
        {
            v = CardView.Make(table ? this.table : handRoot, c.Uid, c.DefId, table);
            cards[c.Uid] = v;
            if (dealt && Application.isPlaying) Arrive(v, table, mine);
        }
        v.SetCard(c.DefId);
        return v;
    }

    /// <summary>
    /// Where a card arriving comes from: drawn, from your deck; your rival's, shown large on the stage a moment (so you
    /// see what they played: the web's stage, a card min(250 px, 44vh) wide in the screen's middle) before it lands;
    /// anything else, from just above its place.
    /// </summary>
    void Arrive(CardView v, bool table, bool mine)
    {
        if (!table)
        {
            var deck = this.table.TransformPoint(PileAt(true, 0));
            v.StartFrom(deck + Vector3.up * 0.1f, this.table.rotation, Vector3.one * PileScale);
            return;
        }
        if (!mine)
        {
            var l = L;
            const float depth = 5;
            var f = Cam.transform.forward;
            var at = Cam.transform.TransformPoint(l.Screen(l.W / 2, l.H * 0.45f, depth));
            float w = Mathf.Min(250, 0.44f * l.H) / 1.4f;
            v.StartFrom(at, Quaternion.LookRotation(Cam.transform.up, -f), Vector3.one * w * l.ScreenScale(depth));
            v.Hold(0.85f);
            return;
        }
    }

    /// <summary>The sun of a player, as drawn.</summary>
    public SunView SunOf(string playerId) => suns.TryGetValue(playerId, out var s) ? s : null;

    /// <summary>Where a card is now (world space), if on show.</summary>
    public Vector3? WorldOf(string uid) => cards.TryGetValue(uid, out var v) ? v.transform.position : (Vector3?)null;

    /// <summary>A card in play's badges: its attack (dimmed once it has attacked), stability, and defence (a Guard's).</summary>
    static void InPlay(CardView v, GameState s, PlayerState p, CardInstance c)
    {
        var def = Cards.Def(c.DefId);
        int atk = Game.CardAttack(s, p, c);
        bool armed = atk > 0 || Game.BaseAttack(def) > 0;
        v.Badge("atk", c.Dimmed == true ? "atk-dim" : "atk", armed ? Mathf.Max(0, atk) : (int?)null);
        int hp = c.Health ?? 0;
        v.Badge("stab", hp <= 1 ? "stab-low" : "stab", hp);
        v.Badge("def", Game.IsGuard(p, c) ? "guard" : "def", Game.CardDefence(p, c));
        v.Dimmed(c.Dimmed == true);
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

/// <summary>A number rising off the table and fading out.</summary>
/// <summary>
/// The Stellari on the board, turning as backdrop.ts turns it: one turn every three minutes, its inner ring the other
/// way at 0.6 of the speed, and a 30° burst each time a move is made (eased in and out over 1.8 s).
/// </summary>
public class StarSpin : MonoBehaviour
{
    public Transform Outer, Inner;
    float angle;
    readonly System.Collections.Generic.List<float> bursts = new System.Collections.Generic.List<float>();
    static StarSpin current;

    void Awake() => current = this;

    /// <summary>A move was made: spin faster for a moment (at most three at once).</summary>
    public static void Burst()
    {
        if (current == null || current.bursts.Count >= 3) return;
        current.bursts.Add(Time.time);
    }

    void Update()
    {
        angle = (angle + 2 * Mathf.Min(0.1f, Time.deltaTime)) % 1800;
        float extra = 0;
        for (int i = bursts.Count - 1; i >= 0; i--)
        {
            float t = (Time.time - bursts[i]) / 1.8f;
            if (t >= 1)
            {
                angle = (angle + 30) % 1800;
                bursts.RemoveAt(i);
                continue;
            }
            extra += 30 * (0.5f - Mathf.Cos(Mathf.PI * Mathf.Max(0, t)) / 2);
        }
        float a = angle + extra;
        // (Clockwise as the page sees it, from above the board.)
        if (Outer != null) Outer.localRotation = Quaternion.Euler(0, a, 0);
        if (Inner != null) Inner.localRotation = Quaternion.Euler(0, -a * 0.6f, 0);
    }
}

public class Floater : MonoBehaviour
{
    float age;
    TMPro.TMP_Text text;
    void Awake() => text = GetComponent<TMPro.TMP_Text>();
    void Update()
    {
        age += Time.deltaTime;
        transform.localPosition += new Vector3(0, Time.deltaTime * 0.9f, 0);
        var c = text.color;
        c.a = Mathf.Clamp01(1.6f - age);
        text.color = c;
        if (age > 1.6f) Mats.Kill(gameObject);
    }
}

/// <summary>Which side's slot an object on the table is.</summary>
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

    /// <summary>An empty slot (1 × 1.4 card widths at 160 pixels a width): pale, a white line inside a dashed edge; a trap's edge indigo.</summary>
    public static Texture2D Slot(bool trap)
    {
        string key = trap ? "trap" : "slot";
        if (made.TryGetValue(key, out var t)) return t;
        // (A CSS pixel of the board is 1.84 of these; a pixel on screen about 1.55.)
        t = Dashed(160, 224, 12.8f, new Color(250 / 255f, 251 / 255f, 253 / 255f, 0.66f), new Color(1, 1, 1, 0.5f), 1.84f,
            trap ? new Color(75 / 255f, 79 / 255f, 176 / 255f, 0.4f) : new Color(140 / 255f, 150 / 255f, 175 / 255f, 0.35f), 1.5f, 4.6f, 3.1f);
        made[key] = t;
        return t;
    }

    /// <summary>An open pile's empty place (a pile's 48 px wide card at 160 pixels a width): pale, a dashed edge.</summary>
    public static Texture2D Pile()
    {
        if (made.TryGetValue("pile", out var t)) return t;
        t = Dashed(160, 224, 20.3f, new Color(250 / 255f, 251 / 255f, 253 / 255f, 0.6f), new Color(1, 1, 1, 0), 0, new Color(140 / 255f, 150 / 255f, 175 / 255f, 0.4f), 2.6f, 8f, 5.5f);
        made["pile"] = t;
        return t;
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
