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
    // own, measured off it laid flat (scripts/measure-board.mjs), the table 12.66 wide.
    public const float Pitch = 1.175f, RowZ = 2.47f, TableW = 12.66f, TableD = 8.05f, TableZ = 0.09f;
    public static readonly Vector3 MyHero = new Vector3(2.94f, 0, -0.89f), RivalHero = new Vector3(-2.94f, 0, 0.9f);
    public static readonly Vector3 MyTrap = new Vector3(2.94f, 0, -RowZ), RivalTrap = new Vector3(-2.94f, 0, RowZ);
    public static readonly Vector3 MySun = new Vector3(-5.03f, 0.55f, -2.33f), RivalSun = new Vector3(-5.03f, 0.55f, 2.62f);
    // (Each side's piles: its deck, its reserves and its wreckage, small cards in a row.)
    public const float PileX = 4.3f, PileStep = 0.705f, PileScale = 0.545f;

    public Camera Cam;
    public string Viewer;
    Transform table, handRoot;
    readonly Dictionary<string, CardView> cards = new Dictionary<string, CardView>();
    readonly Dictionary<string, SunView> suns = new Dictionary<string, SunView>();
    readonly List<GameObject> slotMarks = new List<GameObject>();
    TextMeshPro[] phases;
    readonly MeshRenderer[] phaseDots = new MeshRenderer[3];
    TextMeshPro myLabel, rivalLabel, turnThem, turnYou;
    MeshRenderer myDeck, rivalDeck, myDiscard, rivalDiscard, myWreck, rivalWreck;
    TextMeshPro myDeckN, rivalDeckN, myDiscardN, rivalDiscardN, myWreckN, rivalWreckN, rivalHandN, myHandN;

    public static Vector3 PileAt(bool mine, int i) => new Vector3(PileX + PileStep * i, 0, mine ? -RowZ : RowZ);

    public static Vector3 SlotAt(bool mine, int slot)
    {
        if (slot < 0) return mine ? MyHero : RivalHero;
        // (Your row runs from the left, your deck at its right end; your rival's from its Hero's place.)
        return mine ? new Vector3(-2.9f + Pitch * slot, 0, -RowZ) : new Vector3(-1.74f + Pitch * slot, 0, RowZ);
    }

    public static Board Make(Camera cam)
    {
        var go = new GameObject("Board");
        var b = go.AddComponent<Board>();
        b.Cam = cam;
        b.Build();
        return b;
    }

    void Build()
    {
        table = new GameObject("Table").transform;
        table.SetParent(transform, false);
        // The plate, a lip under its near edge, and the floor's shadow under it all.
        table.localPosition = new Vector3(0, 0, 0);
        var floor = Mats.Flat("Floor shadow", table, Mats.Make("Soft", new Color(0.35f, 0.35f, 0.4f, 0.18f)), TableW + 1.5f, TableD + 1.6f, -0.05f);
        floor.sharedMaterial.SetFloat("_Aspect", (TableD + 1.6f) / (TableW + 1.5f));
        floor.sharedMaterial.SetFloat("_Size", 0.44f);
        floor.sharedMaterial.SetFloat("_Radius", 0.03f);
        floor.sharedMaterial.SetFloat("_Soft", 0.04f);
        floor.transform.localPosition = new Vector3(0, -0.05f, TableZ - 0.3f);
        floor.sharedMaterial.renderQueue = 2900;
        var lip = Mats.Flat("Lip", table, Mats.Make("Table"), TableW, TableD, -0.02f);
        lip.sharedMaterial.SetFloat("_Aspect", TableD / TableW);
        lip.sharedMaterial.SetColor("_Top", new Color(0.86f, 0.86f, 0.85f));
        lip.sharedMaterial.SetColor("_Bottom", new Color(0.8f, 0.8f, 0.79f));
        lip.sharedMaterial.SetColor("_Mark", new Color(0.8f, 0.8f, 0.79f));
        lip.transform.localPosition = new Vector3(0, -0.02f, TableZ - 0.16f);
        lip.sharedMaterial.renderQueue = 2905;
        var plate = Mats.Flat("Plate", table, Mats.Make("Table"), TableW, TableD);
        plate.transform.localPosition = new Vector3(0, 0, TableZ);
        plate.sharedMaterial.SetFloat("_Aspect", TableD / TableW);
        plate.sharedMaterial.renderQueue = 2910;

        // The Stellari's flower in the middle, and the day's phases beside it.
        var flower = Mats.Flat("Flower", table, Mats.Make("Card"), 1.85f, 1.85f, 0.001f);
        flower.sharedMaterial.mainTexture = Resources.Load<Texture2D>("Board/flower");
        flower.sharedMaterial.SetFloat("_Radius", 0);
        flower.sharedMaterial.SetFloat("_Aspect", 1);
        flower.sharedMaterial.color = new Color(0.8f, 0.85f, 0.97f, 0.9f);
        flower.sharedMaterial.renderQueue = 2920;
        phases = new[] { "dawn", "day", "dusk" }.Select((k, i) =>
        {
            var t = Mats.FlatText(k, table, k.ToUpperInvariant(), 1.75f, Look.InkFaint, true, 500, 14, TextAlignmentOptions.Left);
            t.transform.localPosition = new Vector3(1.0f + 3, 0.01f, 0.26f - i * 0.26f);
            var dot = Mats.Flat("Dot", t.transform.parent, Mats.Make("Soft", Look.InkFaint), 0.11f, 0.11f, 0.01f);
            dot.sharedMaterial.SetFloat("_Aspect", 1);
            dot.sharedMaterial.SetFloat("_Size", 0.45f);
            dot.sharedMaterial.SetFloat("_Radius", 0.45f);
            dot.sharedMaterial.SetFloat("_Soft", 0.02f);
            dot.sharedMaterial.renderQueue = 2990;
            dot.transform.localPosition = new Vector3(0.82f, 0.01f, 0.26f - i * 0.26f);
            phaseDots[i] = dot;
            return t;
        }).ToArray();
        turnThem = Mats.FlatText("Opponent", table, "OPPONENT", 1.75f, Look.InkFaint, true, 500, 14, TextAlignmentOptions.Right);
        turnThem.transform.localPosition = new Vector3(-0.85f - 3, 0.01f, 0.13f);
        turnYou = Mats.FlatText("You", table, "YOU", 1.75f, Look.InkSoft, true, 500, 14, TextAlignmentOptions.Right);
        turnYou.transform.localPosition = new Vector3(-0.85f - 3, 0.01f, -0.13f);

        // Each side's slots: a faint outline and its defence where a card could stand.
        for (int s = -1; s < Balance.TableauSlots; s++)
        {
            Slot(true, s);
            Slot(false, s);
        }
        TrapSlot(MyTrap);
        TrapSlot(RivalTrap);

        // The piles.
        myDeck = Pile("My deck", PileAt(true, 0), true, out myDeckN);
        rivalDeck = Pile("Rival deck", PileAt(false, 0), true, out rivalDeckN);
        myDiscard = Pile("My reserves", PileAt(true, 1), false, out myDiscardN, "RESERVES");
        rivalDiscard = Pile("Rival reserves", PileAt(false, 1), false, out rivalDiscardN, "RESERVES");
        myWreck = Pile("My wreckage", PileAt(true, 2), false, out myWreckN, "WRECKAGE");
        rivalWreck = Pile("Rival wreckage", PileAt(false, 2), false, out rivalWreckN, "WRECKAGE");
        rivalHandN = HandPill("Rival hand", new Vector3(PileX + PileStep, 0, 1.9f));
        myHandN = HandPill("My hand", new Vector3(PileX + PileStep, 0, -1.89f));
        rivalLabel = Mats.FlatText("Your rival", table, "YOUR RIVAL", 2.1f, Look.InkSoft, true, 500, 18, TextAlignmentOptions.Left);
        rivalLabel.transform.localPosition = new Vector3(4.12f + 3, 0.01f, 1.57f);
        myLabel = Mats.FlatText("You", table, "YOU", 2.1f, Look.InkSoft, true, 500, 18, TextAlignmentOptions.Left);
        myLabel.transform.localPosition = new Vector3(4.12f + 3, 0.01f, -1.58f);

        handRoot = new GameObject("Hand").transform;
        handRoot.SetParent(Cam.transform, false);
        handRoot.localRotation = Quaternion.Euler(-90, 0, 0);
    }

    void Slot(bool mine, int s)
    {
        var at = SlotAt(mine, s);
        var go = new GameObject($"Slot {(mine ? "mine" : "rival")} {s}");
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        var ring = Mats.Flat("Outline", go.transform, Mats.Make("Soft", new Color(0.62f, 0.64f, 0.7f, 0.5f)), 1.12f, 1.52f, 0.001f);
        ring.sharedMaterial.SetFloat("_Aspect", 1.52f / 1.12f);
        ring.sharedMaterial.SetFloat("_Size", 0.45f);
        ring.sharedMaterial.SetFloat("_Soft", 0.006f);
        ring.sharedMaterial.SetFloat("_Ring", 1);
        ring.sharedMaterial.renderQueue = 2930;
        var fill = Mats.Flat("Fill", go.transform, Mats.Make("Soft", new Color(1, 1, 1, 0.35f)), 1.12f, 1.52f, 0.0005f);
        fill.sharedMaterial.SetFloat("_Aspect", 1.52f / 1.12f);
        fill.sharedMaterial.SetFloat("_Size", 0.45f);
        fill.sharedMaterial.SetFloat("_Soft", 0.004f);
        fill.sharedMaterial.renderQueue = 2925;
        var label = Mats.FlatText("Defence", go.transform, s < 0 ? "" : $"<size=75%>DEF</size> {Game.SlotDefence(s)}", 1.7f, Look.InkFaint, true, 500, 6);
        label.transform.localPosition = new Vector3(0, 0.002f, 0);
        var col = go.AddComponent<BoxCollider>();
        col.size = new Vector3(1, 0.05f, 1.4f);
        go.AddComponent<SlotTag>().Set(mine, s);
        slotMarks.Add(go);
    }

    /// <summary>An empty place a trap could be set: a dashed outline, as the web's.</summary>
    void TrapSlot(Vector3 at)
    {
        var go = new GameObject("Trap slot");
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        var ring = Mats.Flat("Outline", go.transform, Mats.Make("Soft", new Color(0.55f, 0.52f, 0.78f, 0.55f)), 1.12f, 1.52f, 0.001f);
        ring.sharedMaterial.SetFloat("_Aspect", 1.52f / 1.12f);
        ring.sharedMaterial.SetFloat("_Size", 0.45f);
        ring.sharedMaterial.SetFloat("_Soft", 0.006f);
        ring.sharedMaterial.SetFloat("_Ring", 1);
        ring.sharedMaterial.renderQueue = 2930;
    }

    MeshRenderer Pile(string name, Vector3 at, bool back, out TextMeshPro count, string title = "")
    {
        var go = new GameObject(name);
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        go.transform.localScale = Vector3.one * PileScale;
        var shadow = Mats.Flat("Shadow", go.transform, Mats.Make("Soft", new Color(0.25f, 0.27f, 0.33f, back ? 0.2f : 0.08f)), 1.5f, 1.9f, -0.001f);
        shadow.sharedMaterial.SetFloat("_Aspect", 1.9f / 1.5f);
        shadow.sharedMaterial.SetFloat("_Size", 0.36f);
        shadow.sharedMaterial.SetFloat("_Soft", 0.09f);
        shadow.sharedMaterial.renderQueue = 2940;
        if (!back)
        {
            var ring = Mats.Flat("Outline", go.transform, Mats.Make("Soft", new Color(0.62f, 0.64f, 0.7f, 0.45f)), 1.08f, 1.48f, 0.001f);
            ring.sharedMaterial.SetFloat("_Aspect", 1.48f / 1.08f);
            ring.sharedMaterial.SetFloat("_Size", 0.45f);
            ring.sharedMaterial.SetFloat("_Soft", 0.008f);
            ring.sharedMaterial.SetFloat("_Ring", 1);
            ring.sharedMaterial.renderQueue = 2945;
        }
        var face = Mats.Flat("Top", go.transform, Mats.Make("Card"), 1, 1.4f, 0.02f);
        face.sharedMaterial.mainTexture = back ? Resources.Load<Texture2D>("Board/back") : null;
        face.sharedMaterial.color = back ? Color.white : new Color(1, 1, 1, 0);
        face.sharedMaterial.renderQueue = 2950;
        var label = Mats.FlatText("Name", go.transform, title, 1.5f, Look.InkFaint, true, 500, 10);
        label.transform.localPosition = new Vector3(0, 0.03f, 0);
        label.gameObject.SetActive(!back);
        // (How many, small in its corner.)
        count = Mats.FlatText("Count", go.transform, "", 2.4f, Look.InkSoft, true, 700, 0, TextAlignmentOptions.Right);
        count.rectTransform.sizeDelta = new Vector2(1, 0.4f);
        count.transform.localPosition = new Vector3(-0.08f, 0.03f, -0.5f);
        return face;
    }

    /// <summary>A side's hand, counted: a white pill on the table, "HAND" and how many.</summary>
    TextMeshPro HandPill(string name, Vector3 at)
    {
        var go = new GameObject(name);
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        var pill = Mats.Flat("Pill", go.transform, Mats.Make("Soft", new Color(1, 1, 1, 0.9f)), 1.96f, 0.26f, 0.002f);
        pill.sharedMaterial.SetFloat("_Aspect", 0.26f / 1.96f);
        pill.sharedMaterial.SetFloat("_Size", 0.5f);
        pill.sharedMaterial.SetFloat("_Radius", 0.26f / 1.96f / 2);
        pill.sharedMaterial.SetFloat("_Soft", 0.006f);
        pill.sharedMaterial.renderQueue = 2955;
        var t = Mats.FlatText("Count", go.transform, "", 1.6f, Look.InkSoft, true, 500, 14, TextAlignmentOptions.Left);
        t.rectTransform.sizeDelta = new Vector2(1.7f, 0.3f);
        t.transform.localPosition = new Vector3(0, 0.01f, 0);
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
        // My hand, fanned along the foot of the screen; held up a little when it can be played.
        float d = 3.2f;
        float h = 2 * d * Mathf.Tan(Cam.fieldOfView * 0.5f * Mathf.Deg2Rad);
        float w = h * Cam.aspect;
        // (As the web's: cards a quarter of the screen tall, their middles near its foot, a little overlapped.)
        float cardH = h * 0.262f, cardW = cardH / 1.4f;
        int n = me.Hand.Count;
        float step = Mathf.Min(cardW * 0.93f, (w * 0.62f) / Mathf.Max(1, n - 1));
        for (int i = 0; i < n; i++)
        {
            var c = me.Hand[i];
            var v = Card(c, false);
            seen.Add(c.Uid);
            v.transform.SetParent(handRoot, false);
            float x = (i - (n - 1) / 2f) * step;
            float lift = ui.HandLift(c);
            var y = -h * 0.44f + lift * cardH * 0.3f;
            v.MoveTo(new Vector3(x, -d + 0.001f * i, y), Quaternion.Euler(0, (i - (n - 1) / 2f) * 1.6f, 0), cardW);
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
        rivalHandN.text = $"HAND<pos=86%><b>{rival.Hand.Count}</b>";
        myHandN.text = $"HAND<pos=86%><b>{me.Hand.Count}</b>";
        rivalLabel.text = rival.Name.ToUpperInvariant();
        var active = Game.ActivePlayer(s);
        bool mineNow = active == me;
        turnYou.color = mineNow ? Look.Ink : Look.InkFaint;
        turnThem.color = mineNow ? Look.InkFaint : Look.Ink;
        string phase = ui.Phase;
        for (int i = 0; i < phases.Length; i++)
        {
            bool on = new[] { "dawn", "day", "dusk" }[i] == phase;
            phases[i].color = on ? Look.Ink : Look.InkFaint;
            phaseDots[i].sharedMaterial.color = on ? Look.Gold : new Color(0.75f, 0.76f, 0.8f);
        }
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
            v.StartFrom(Cam.transform.position + f * 9f + Cam.transform.up * 0.4f, Quaternion.LookRotation(Cam.transform.up, -f), Vector3.one * 2.3f);
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
