using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;

/// <summary>
/// The battle as a 3D scene (the web's .board-plane): a pearl table seen at a tilt, each side's row of five slots,
/// their Heroes, their suns (burning spheres with a heat meter round them and their three planets in orbit), the
/// Stellari's flower and the day's phases in the middle, the piles at the side, and the hand along the foot of the
/// screen. <see cref="Sync"/> lays it all out from a game state; cards glide to their new places.
/// </summary>
public class Board : MonoBehaviour
{
    // The table's layout, in card widths (a card is 1 × 1.4), x across and z away from the viewer: the web board's
    // own, measured off it laid flat (scripts/measure-board.mjs), the table 12.68 wide.
    public const float Pitch = 1.1775f, RowZ = 2.495f, MyRowZ = -2.475f, TableW = 12.68f, TableD = 8.07f, TableZ = 0.09f;
    public static readonly Vector3 MyHero = new Vector3(2.944f, 0, -0.886f), RivalHero = new Vector3(-2.944f, 0, 0.906f);
    public static readonly Vector3 MyTrap = new Vector3(2.944f, 0, MyRowZ), RivalTrap = new Vector3(-2.944f, 0, RowZ);
    public static readonly Vector3 MySun = new Vector3(-5.03f, 0.12f, -2.342f), RivalSun = new Vector3(-5.03f, 0.12f, 2.628f);
    // (Each side's piles: its deck, its reserves and its wreckage, small cards in a row.)
    public const float PileX = 4.313f, PileStep = 0.704f, PileScale = 0.552f;
    /// <summary>A web size in CSS pixels on the board, as a TextMeshPro size on the table (a card is 87 px wide there).</summary>
    public static float Px(float css) => css * 10f / 87f;

    public Camera Cam;
    public string Viewer;
    /// <summary>Whether the hand is raised to be read whole (the pointer over it).</summary>
    public bool HandUp;
    /// <summary>The hand's cards' top edge, and how far either side of the middle they reach: in pixels of a screen 1000 tall, from its middle (down positive).</summary>
    public float HandTop = 1e9f, HandSpan;
    Transform table, handRoot;
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

    public static Vector3 PileAt(bool mine, int i) => new Vector3(PileX + PileStep * i, 0, mine ? MyRowZ : RowZ);

    public static Vector3 SlotAt(bool mine, int slot)
    {
        if (slot < 0) return mine ? MyHero : RivalHero;
        // (Your row runs from the left, your trap's place at its right end; your rival's from its trap's place.)
        return mine ? new Vector3(-2.944f + Pitch * slot, 0, MyRowZ) : new Vector3(-1.766f + Pitch * slot, 0, RowZ);
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
        // The plate (styles.css .table-view > .game: corners of 34 px), its lip under the near edge (a shadow 18 px
        // down in #dcdbd5), and its shadow on the floor (60 px down, blurred 90 px).
        table.localPosition = new Vector3(0, 0, 0);
        var floor = Shape("Floor shadow", table, Rgba(60, 60, 80, 0.28f), TableW, TableD, 0.39f, 2900, -0.05f, 0.5f, 1.1f);
        floor.transform.localPosition = new Vector3(0, -0.05f, TableZ - Px(60) / 10);
        var lip = Shape("Lip", table, Rgba(220, 219, 213), TableW - Px(2) / 5, TableD - Px(2) / 5, 0.39f, 2905, -0.02f);
        lip.transform.localPosition = new Vector3(0, -0.02f, TableZ - Px(18) / 10);
        var plate = Mats.Flat("Plate", table, Mats.Make("Table"), TableW, TableD);
        plate.transform.localPosition = new Vector3(0, 0, TableZ);
        plate.sharedMaterial.SetFloat("_Aspect", TableD / TableW);
        plate.sharedMaterial.SetFloat("_Radius", 0.39f / TableW);
        plate.sharedMaterial.renderQueue = 2910;

        // Each side's tableau framed: a pale panel round its row, reaching up round its Hero's slot (app.ts frameTableaus).
        var frame = BoardArt.Frame();
        foreach (bool mine in new[] { true, false })
        {
            var f = Picture("Tableau frame", table, frame, Color.white, BoardArt.FrameW, BoardArt.FrameD, 2915, 0.0002f);
            f.transform.localPosition = mine ? new Vector3(0, 0.0002f, BoardArt.FrameZ) : new Vector3(0, 0.0002f, -BoardArt.FrameZ + RowZ + MyRowZ);
            if (!mine) f.transform.localRotation = Quaternion.Euler(90, 180, 0);
        }

        // The Stellari's flower in the middle, and the day's phases beside it.
        var flower = Mats.Flat("Flower", table, Mats.Make("Card"), 1.85f, 1.85f, 0.001f);
        flower.sharedMaterial.mainTexture = Resources.Load<Texture2D>("Board/flower");
        flower.sharedMaterial.SetFloat("_Radius", 0);
        flower.sharedMaterial.SetFloat("_Aspect", 1);
        flower.sharedMaterial.color = new Color(0.8f, 0.85f, 0.97f, 0.9f);
        flower.transform.localPosition = new Vector3(0, 0.001f, 0.01f);
        flower.sharedMaterial.renderQueue = 2920;
        RoundDisc();
        // (styles.css .phase-track: 10 px capitals spaced 0.24em, a 9 px dot before each, 26 px apart; the turn's
        // two words to the flower's left, right-aligned.)
        phases = new[] { "dawn", "day", "dusk" }.Select((k, i) =>
        {
            float z = 0.272f - i * 0.262f;
            var t = Mats.FlatText(k, table, k.ToUpperInvariant(), Px(10.34f), Rgba(161, 168, 179), true, 400, 24, TextAlignmentOptions.Left);
            t.transform.localPosition = new Vector3(1.046f + 3, 0.01f, z);
            phaseGlows[i] = Shape("Glow", table, Rgba(240, 160, 64, 0), 0.103f, 0.103f, 0.06f, 2985, 0.009f, 0.06f, 0.1f);
            phaseGlows[i].transform.localPosition = new Vector3(0.902f, 0.009f, z);
            var dot = Shape("Dot", table, Rgba(202, 206, 213), 0.103f, 0.103f, 0.06f, 2990, 0.01f);
            dot.transform.localPosition = new Vector3(0.902f, 0.01f, z);
            var halo = Shape("Dot ring", table, Color.white, 0.103f + Px(3) / 10, 0.103f + Px(3) / 10, 0.1f, 2988, 0.0095f);
            halo.transform.SetParent(dot.transform, true);
            phaseDots[i] = dot;
            dotScale = dot.transform.localScale;
            return t;
        }).ToArray();
        turnThem = Mats.FlatText("Opponent", table, "OPPONENT", Px(10.34f), Rgba(185, 191, 202), true, 400, 24, TextAlignmentOptions.Right);
        turnThem.transform.localPosition = new Vector3(-0.851f - 3, 0.01f, 0.141f);
        turnYou = Mats.FlatText("You", table, "YOU", Px(10.34f), Rgba(47, 58, 82), true, 400, 24, TextAlignmentOptions.Right);
        turnYou.transform.localPosition = new Vector3(-0.851f - 3, 0.01f, -0.121f);

        // Each side's slots: a dashed outline and its defence where a card could stand.
        for (int s = -1; s < Balance.TableauSlots; s++)
        {
            Slot(true, s);
            Slot(false, s);
        }
        TrapSlot(MyTrap);
        TrapSlot(RivalTrap);
        // (An eye at each row's left end: the web's way to look closely at a tableau.)
        Eye(new Vector3(-3.828f, 0, RowZ));
        Eye(new Vector3(-3.828f, 0, MyRowZ));

        // The piles.
        myDeck = Pile("My deck", PileAt(true, 0), true, out myDeckN);
        rivalDeck = Pile("Rival deck", PileAt(false, 0), true, out rivalDeckN);
        myDiscard = Pile("My reserves", PileAt(true, 1), false, out myDiscardN, "RESERVES");
        rivalDiscard = Pile("Rival reserves", PileAt(false, 1), false, out rivalDiscardN, "RESERVES");
        myWreck = Pile("My wreckage", PileAt(true, 2), false, out myWreckN, "WRECKAGE");
        rivalWreck = Pile("Rival wreckage", PileAt(false, 2), false, out rivalWreckN, "WRECKAGE");
        rivalHandN = HandPill("Rival hand", new Vector3(5.017f, 0, 1.902f));
        myHandN = HandPill("My hand", new Vector3(5.017f, 0, -1.882f));
        // (Each player's name by their hand: 11 px capitals spaced 0.18em, from the piles' left edge.)
        rivalLabel = Mats.FlatText("Rival name", table, "", Px(11.03f), Rgba(58, 66, 86), true, 400, 18, TextAlignmentOptions.Left);
        rivalLabel.transform.localPosition = new Vector3(4.107f + 3, 0.01f, 1.639f);
        myLabel = Mats.FlatText("My name", table, "", Px(11.03f), Rgba(58, 66, 86), true, 400, 18, TextAlignmentOptions.Left);
        myLabel.transform.localPosition = new Vector3(4.107f + 3, 0.01f, -1.619f);

        handRoot = new GameObject("Hand").transform;
        handRoot.SetParent(Cam.transform, false);
        handRoot.localRotation = Quaternion.Euler(-90, 0, 0);
    }

    /// <summary>
    /// The round, in the flower's heart (styles.css .round-ring): a white disc 37 px across, regional stability's
    /// ticks round its rim on a faint track, and the round in Roman numerals.
    /// </summary>
    void RoundDisc()
    {
        float d = Px(37.24f) / 10;
        var shadow = Shape("Round shadow", table, Rgba(90, 90, 110, 0.18f), d, d, d / 2, 2921, 0.0015f, Px(4) / 10, Px(8) / 10);
        shadow.transform.localPosition = new Vector3(0, 0.0015f, 0.01f - Px(2) / 10);
        var disc = Shape("Round", table, Rgba(247, 247, 248), d, d, d / 2, 2922, 0.002f);
        disc.transform.localPosition = new Vector3(0, 0.002f, 0.01f);
        float svg = Px(35.86f) / 10, r = svg * 0.44f;
        roundTrack = Shape("Track", table, Rgba(120, 124, 134, 0.14f), 2 * r + svg * 0.09f, 2 * r + svg * 0.09f, r, 2923, 0.0025f, svg * 0.045f, 0.01f, true);
        roundTrack.transform.localPosition = new Vector3(0, 0.0025f, 0.01f);
        int total = Balance.InstabilityStartsRound - 1;
        for (int i = 0; i < total; i++)
        {
            // (Each tick an arc of the rim, 4° apart from the next, clockwise from the top.)
            var go = new GameObject("Tick");
            go.transform.SetParent(table, false);
            go.transform.localPosition = new Vector3(0, 0.003f, 0.01f);
            var mf = go.AddComponent<MeshFilter>();
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = Mats.Make("Soft", Color.white);
            mr.sharedMaterial.SetFloat("_Size", 0.5f);
            mr.sharedMaterial.SetFloat("_Soft", 0.0001f);
            mr.sharedMaterial.renderQueue = 2924;
            mf.mesh = BoardArt.Arc(r, svg * 0.06f, (i / (float)total) * 360 + 2, ((i + 1) / (float)total) * 360 - 2);
            roundTicks.Add(mr);
        }
        roundN = Mats.FlatText("Round", table, "I", Px(13.79f), Rgba(91, 95, 103), true, 700, 0);
        roundN.transform.localPosition = new Vector3(0, 0.004f, 0.01f);
        roundUp = Mats.FlatText("Unstable", table, "", Px(7), Rgba(192, 86, 61), true, 500, 10);
        roundUp.transform.localPosition = new Vector3(0, 0.004f, 0.01f - Px(11) / 10);
    }

    /// <summary>A slot's defence: the shield sign and the number, 12 px, centred where it is placed.</summary>
    static void Defence(Transform parent, string text, Vector3 at, Color c, float size)
    {
        var mark = Picture("Shield", parent, Resources.Load<Texture2D>("Icons/bt-shield"), c, size * 0.00823f, size * 0.00862f, 2935, 0.002f);
        var t = Mats.FlatText("Defence", parent, text, size * 0.1149f, c, true, 400, 8, TextAlignmentOptions.Left);
        t.rectTransform.sizeDelta = new Vector2(1, 0.3f);
        // (The sign's advance, then the number; the pair centred.)
        float adv = size * 0.0101f, w = adv + t.GetPreferredValues(text).x;
        mark.transform.localPosition = at + new Vector3(-w / 2 + size * 0.0046f, 0.002f, 0);
        t.transform.localPosition = at + new Vector3(-w / 2 + adv + 0.5f, 0.002f, 0);
    }

    void Slot(bool mine, int s)
    {
        var at = SlotAt(mine, s);
        var go = new GameObject($"Slot {(mine ? "mine" : "rival")} {s}");
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        // (styles.css .slot-empty: pale, a white line inside a dashed edge, corners of 7 px.)
        Picture("Outline", go.transform, BoardArt.Slot(false), Color.white, 1, 1.4f, 2925, 0.0005f);
        var ink = Rgba(120, 128, 150, 0.55f);
        int def = Game.SlotDefence(s);
        if (s < 0)
        {
            // (The Hero's slot: its defence, and "hero" small under it.)
            Defence(go.transform, def.ToString(), new Vector3(0, 0, 0.059f), ink, 12.18f);
            var hero = Mats.FlatText("Hero", go.transform, "HERO", Px(6.53f), new Color(ink.r, ink.g, ink.b, ink.a * 0.8f), true, 400, 20);
            hero.transform.localPosition = new Vector3(0, 0.002f, -0.102f);
        }
        else Defence(go.transform, def.ToString(), Vector3.zero, ink, 12.18f);
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
        // (Its mark 22 px, drawn on a picture a quarter larger than it.)
        float s = Px(22) / 10 * 1.25f;
        Picture("Trap", go.transform, Resources.Load<Texture2D>("Icons/bt-trap"), Rgba(70, 74, 160, 0.6f), s, s, 2935, 0.002f);
    }

    /// <summary>A round white button by a row (styles.css .tableau-eye): 26 px, an eye in it.</summary>
    void Eye(Vector3 at)
    {
        var go = new GameObject("Eye");
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        float d = Px(26.1f) / 10;
        var shadow = Shape("Shadow", go.transform, Rgba(70, 76, 100, 0.2f), d, d, d / 2, 2926, 0.001f, Px(4) / 10, Px(8) / 10);
        shadow.transform.localPosition = new Vector3(0, 0.001f, -Px(2) / 10);
        Shape("Button", go.transform, new Color(1, 1, 1, 0.92f), d, d, d / 2, 2927, 0.0015f);
        float s = Px(15.32f) / 10 * 1.25f;
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
        var label = Mats.FlatText("Name", go.transform, title, Px(5) / PileScale, Look.InkSoft, true, 400, 10);
        label.transform.localPosition = new Vector3(0, 0.03f, 0);
        label.gameObject.SetActive(!back);
        // (How many, small in its corner.)
        count = Mats.FlatText("Count", go.transform, "", 2.4f, Look.InkSoft, true, 700, 0, TextAlignmentOptions.Right);
        count.rectTransform.sizeDelta = new Vector2(1, 0.4f);
        count.transform.localPosition = new Vector3(-0.08f, 0.03f, -0.5f);
        return face;
    }

    /// <summary>
    /// A side's hand, counted (styles.css .tpile-hand): a pale pill 170 × 20 px with a fine edge, the hand's mark,
    /// "HAND" and how many at its right.
    /// </summary>
    TextMeshPro HandPill(string name, Vector3 at)
    {
        var go = new GameObject(name);
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        float w = 1.959f, h = 0.23f;
        var shadow = Shape("Shadow", go.transform, Rgba(90, 90, 110, 0.1f), w, h, h / 2, 2952, 0.001f, Px(4) / 10, Px(8) / 10);
        shadow.transform.localPosition = new Vector3(0, 0.001f, -Px(2) / 10);
        Shape("Pill", go.transform, Rgba(250, 251, 253, 0.85f), w, h, h / 2, 2955, 0.002f);
        Shape("Edge", go.transform, Rgba(140, 150, 175, 0.28f), w, h, h / 2, 2956, 0.0025f, 0.004f, 0.01f, true);
        float s = 0.134f * 1.25f;
        var icon = Picture("Hand", go.transform, Resources.Load<Texture2D>("Icons/bt-hand"), Color.white, s, s, 2957, 0.003f);
        icon.transform.localPosition = new Vector3(-0.797f, 0.003f, 0);
        var word = Mats.FlatText("Hand", go.transform, "HAND", Px(9), Look.InkSoft, true, 400, 14, TextAlignmentOptions.Left);
        word.rectTransform.sizeDelta = new Vector2(1, 0.3f);
        word.transform.localPosition = new Vector3(-0.65f + 0.5f, 0.01f, 0);
        var t = Mats.FlatText("Count", go.transform, "", Px(11.25f), Look.Ink, true, 700, 0, TextAlignmentOptions.Center);
        t.rectTransform.sizeDelta = new Vector2(0.4f, 0.3f);
        t.transform.localPosition = new Vector3(0.812f, 0.01f, 0);
        return t;
    }

    readonly Dictionary<string, int> lastHealth = new Dictionary<string, int>();
    readonly Dictionary<string, int> lastHeat = new Dictionary<string, int>();

    /// <summary>A number that rises and fades where something changed: heat on a sun, stability on a card.</summary>
    void Float(Vector3 at, int delta, bool heat)
    {
        if (!Application.isPlaying) return;
        var t = Mats.FlatText("Float", table, (delta > 0 ? "+" : "") + delta, 5.5f, heat ? (delta > 0 ? Look.Heat : Look.Cool) : (delta < 0 ? Look.Heat : Look.Good), true, 700, 0);
        t.transform.localRotation = Quaternion.LookRotation(Cam.transform.forward, Cam.transform.up);
        t.transform.localPosition = at + new Vector3(0, 1.2f, 0);
        t.outlineWidth = 0.2f;
        t.outlineColor = new Color32(255, 255, 255, 200);
        t.gameObject.AddComponent<Floater>();
    }

    /// <summary>Lay the battle out as it stands: every card where it belongs, every sun as hot as it is.</summary>
    public void Sync(GameState s, BattleView ui)
    {
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
        // My hand, fanned along the foot of the screen (app.ts fitHand, at 1600 × 1000: the page drawn 1.45 times its
        // layout size): cards 127 px wide in a hand 753 px across, overlapping by the same share of their widths,
        // turned 2.5° apart (less for a big hand) on an arc, their middles 63 px above the screen's foot; a picked
        // card held up. Raised (the pointer over it), the hand grows 1.14 times from its foot and rises until its
        // lowest corner is 8 px above the screen's foot (app.ts measureRaise).
        float d = 3.2f;
        float h = 2 * d * Mathf.Tan(Cam.fieldOfView * 0.5f * Mathf.Deg2Rad);
        float px = h / 1000;
        const float z = 1.45f, cw = 127 * z, room = (753 - 2 * 0.12f * 127) * z, grow = 1.14f, foot = 479.3f;
        int n = me.Hand.Count;
        float spacing = n > 1 ? Mathf.Min(0.98f, (room - cw) / ((n - 1) * cw)) * cw : 0;
        float turn = Mathf.Min(2.5f, 12f / Mathf.Max(n - 1, 1));
        float radius = spacing / (turn * Mathf.Deg2Rad);
        // (Where each card stands, in pixels from the screen's middle, down positive; and the lowest corner of all.)
        var spot = new Vector2[n];
        float low = 0;
        for (int i = 0; i < n; i++)
        {
            float t = i - (n - 1) / 2f, a = t * turn * Mathf.Deg2Rad;
            spot[i] = new Vector2(t * spacing, 437.5f + radius * (1 - Mathf.Cos(a)) * 1.25f);
            low = Mathf.Max(low, spot[i].y + (cw * Mathf.Abs(Mathf.Sin(a)) + cw * 1.4f * Mathf.Cos(a)) / 2);
        }
        float rise = HandUp && n > 0 ? Mathf.Max(0, foot + (low - foot) * grow - 500 + 8 * z) : 0, size = HandUp ? grow : 1;
        HandTop = 1e9f;
        HandSpan = 0;
        for (int i = 0; i < n; i++)
        {
            var c = me.Hand[i];
            var v = Card(c, false);
            seen.Add(c.Uid);
            v.transform.SetParent(handRoot, false);
            float t = i - (n - 1) / 2f;
            float x = spot[i].x * size, y = foot + (spot[i].y - foot) * size - rise;
            HandTop = Mathf.Min(HandTop, y - cw * 1.4f * size / 2);
            HandSpan = Mathf.Max(HandSpan, Mathf.Abs(x) + cw * size / 2);
            float lift = ui.HandLift(c);
            v.MoveTo(new Vector3(x * px, -d + 0.001f * i, -y * px + lift * cw * 1.4f * px * 0.3f), Quaternion.Euler(0, t * turn, 0), cw * size * px);
            foreach (var b in new[] { "atk", "stab", "def" }) v.Badge(b, "atk", null);
            v.Dimmed(false);
            ui.Dress(v, me, c, false);
        }
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
        rivalLabel.text = rival.Name.ToUpperInvariant();
        myLabel.text = me.Name.ToUpperInvariant();
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
        roundN.transform.localPosition = new Vector3(0, 0.004f, 0.01f + (unstable > 0 ? Px(3) / 10 : 0));
        for (int i = 0; i < total; i++) roundTicks[i].sharedMaterial.color = new Color(1, 1, 1, unstable > 0 ? 0.35f : i < left ? 1 : 0.5f);
        roundTrack.sharedMaterial.color = unstable > 0 ? Rgba(201, 138, 134, 0.25f) : Rgba(120, 124, 134, 0.14f);
        foreach (var slot in slotMarks) slot.SetActive(true);
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
            tagName = Mats.FlatText("Tag", table, "", 1.6f, Look.Ink, true, 600, 24);
            tagName.transform.localPosition = new Vector3(0, 0.01f, -1.02f);
            tagSub = Mats.FlatText("Tag words", table, "", 1.4f, Look.InkSoft, false, 400, 4);
            tagSub.transform.localPosition = new Vector3(0, 0.01f, -1.2f);
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
    /// see what they played) before it lands; anything else, from just above its place.
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
            var f = Cam.transform.forward;
            v.StartFrom(Cam.transform.position + f * 5.25f + Cam.transform.up * 0.23f, Quaternion.LookRotation(Cam.transform.up, -f), Vector3.one * 2.3f);
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

    // The frame round your tableau, in card widths: your row's six places and your Hero's above its right end, 12 px
    // (0.138) round them, corners of 12 px and the inner corner where they meet rounded 8 px. (Your rival's, turned round.)
    public const float FrameW = 7.164f, FrameD = 3.265f, FrameZ = -1.6805f;

    public static Texture2D Frame()
    {
        if (made.TryGetValue("frame", out var t)) return t;
        const float k = 128, pad = 0.138f, r = 0.138f, rc = 0.092f;
        int w = Mathf.CeilToInt(FrameW * k), h = Mathf.CeilToInt(FrameD * k);
        t = New(w, h);
        var px = new Color[w * h];
        var fill = new Color(250 / 255f, 251 / 255f, 253 / 255f, 0.45f);
        var line = new Color(140 / 255f, 150 / 255f, 175 / 255f, 0.16f);
        float rowZ = Board.MyRowZ, rowH = 0.7f + pad, top = rowZ + rowH;
        float bx0 = Board.MyHero.x - 0.5f - pad, bx1 = FrameW / 2, bz1 = Board.MyHero.z + 0.7f + pad;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                float u = (x + 0.5f) / k - FrameW / 2, v = FrameZ + (y + 0.5f) / k - FrameD / 2;
                float d = Mathf.Min(Box(u, v - rowZ, FrameW / 2, rowH, r), Box(u - (bx0 + bx1) / 2, v - (rowZ + bz1) / 2, (bx1 - bx0) / 2, (bz1 - rowZ) / 2, r));
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
        made["frame"] = t;
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
