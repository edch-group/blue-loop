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
    // The table's layout, in card widths (a card is 1 × 1.4), x across and z away from the viewer.
    public const float Pitch = 1.16f, RowZ = 2.45f;
    public static readonly Vector3 MyHero = new Vector3(2.8f, 0, -0.62f), RivalHero = new Vector3(-2.95f, 0, 0.82f);
    public static readonly Vector3 MySun = new Vector3(-6.2f, 0.9f, -2.2f), RivalSun = new Vector3(-6.0f, 0.9f, 2.25f);
    public static readonly Vector3 MyDeck = new Vector3(2.9f, 0, -RowZ), MyDiscard = new Vector3(5.35f, 0, -2.6f);
    public static readonly Vector3 RivalDeck = new Vector3(4.55f, 0, RowZ), RivalDiscard = new Vector3(5.65f, 0, RowZ);

    public Camera Cam;
    public string Viewer;
    Transform table, handRoot;
    readonly Dictionary<string, CardView> cards = new Dictionary<string, CardView>();
    readonly Dictionary<string, SunView> suns = new Dictionary<string, SunView>();
    readonly List<GameObject> slotMarks = new List<GameObject>();
    TextMeshPro[] phases;
    TextMeshPro myLabel, rivalLabel;
    MeshRenderer myDeck, rivalDeck, myDiscard, rivalDiscard;
    TextMeshPro myDeckN, rivalDeckN, myDiscardN, rivalDiscardN, rivalHandN, myHandN;

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
        var floor = Mats.Flat("Floor shadow", table, Mats.Make("Soft", new Color(0.35f, 0.35f, 0.4f, 0.18f)), 17.5f, 11f, -0.05f);
        floor.material.SetFloat("_Aspect", 11f / 17.5f);
        floor.material.SetFloat("_Size", 0.44f);
        floor.material.SetFloat("_Radius", 0.03f);
        floor.material.SetFloat("_Soft", 0.04f);
        floor.transform.localPosition = new Vector3(0, -0.05f, -0.25f);
        floor.material.renderQueue = 2900;
        var lip = Mats.Flat("Lip", table, Mats.Make("Table"), 16f, 9.2f, -0.02f);
        lip.material.SetFloat("_Aspect", 9.2f / 16f);
        lip.material.SetColor("_Top", new Color(0.86f, 0.86f, 0.85f));
        lip.material.SetColor("_Bottom", new Color(0.8f, 0.8f, 0.79f));
        lip.material.SetColor("_Mark", new Color(0.8f, 0.8f, 0.79f));
        lip.transform.localPosition = new Vector3(0, -0.02f, -0.14f);
        lip.material.renderQueue = 2905;
        var plate = Mats.Flat("Plate", table, Mats.Make("Table"), 16f, 9.2f);
        plate.material.SetFloat("_Aspect", 9.2f / 16f);
        plate.material.renderQueue = 2910;

        // The Stellari's flower in the middle, and the day's phases beside it.
        var flower = Mats.Flat("Flower", table, Mats.Make("Card"), 2.6f, 2.6f, 0.001f);
        flower.material.mainTexture = Resources.Load<Texture2D>("Board/flower");
        flower.material.SetFloat("_Radius", 0);
        flower.material.SetFloat("_Aspect", 1);
        flower.material.color = new Color(0.86f, 0.9f, 1f, 0.9f);
        flower.material.renderQueue = 2920;
        phases = new[] { "dawn", "day", "dusk" }.Select((k, i) =>
        {
            var t = Mats.FlatText(k, table, k.ToUpperInvariant(), 2.6f, Look.InkFaint, true, 500, 14, TextAlignmentOptions.Left);
            t.transform.localPosition = new Vector3(2.85f, 0.01f, 0.4f - i * 0.38f);
            return t;
        }).ToArray();
        var them = Mats.FlatText("Opponent", table, "OPPONENT", 2.2f, Look.InkFaint, true, 500, 14, TextAlignmentOptions.Right);
        them.transform.localPosition = new Vector3(-3.4f, 0.01f, 0.18f);
        var you = Mats.FlatText("You", table, "YOU", 2.2f, Look.InkSoft, true, 500, 14, TextAlignmentOptions.Right);
        you.transform.localPosition = new Vector3(-3.4f, 0.01f, -0.2f);

        // Each side's slots: a faint outline and its defence where a card could stand.
        for (int s = -1; s < Balance.TableauSlots; s++)
        {
            Slot(true, s);
            Slot(false, s);
        }

        // The piles.
        myDeck = Pile("My deck", MyDeck, true, out myDeckN);
        rivalDeck = Pile("Rival deck", RivalDeck, true, out rivalDeckN);
        myDiscard = Pile("My discard", MyDiscard, false, out myDiscardN);
        rivalDiscard = Pile("Rival discard", RivalDiscard, false, out rivalDiscardN);
        rivalLabel = Mats.FlatText("Your rival", table, "YOUR RIVAL", 2.6f, Look.InkSoft, true, 500, 18, TextAlignmentOptions.Left);
        rivalLabel.transform.localPosition = new Vector3(6.2f, 0.01f, 1.05f);
        rivalHandN = Mats.FlatText("Rival hand", table, "", 2.4f, Look.Ink, true, 500, 10, TextAlignmentOptions.Left);
        rivalHandN.transform.localPosition = new Vector3(6.2f, 0.01f, 1.45f);
        myLabel = Mats.FlatText("You", table, "YOU", 2.6f, Look.InkSoft, true, 500, 18, TextAlignmentOptions.Left);
        myLabel.transform.localPosition = new Vector3(6.6f, 0.01f, -0.95f);
        myHandN = Mats.FlatText("My hand", table, "", 2.4f, Look.Ink, true, 500, 10, TextAlignmentOptions.Left);
        myHandN.transform.localPosition = new Vector3(6.6f, 0.01f, -1.35f);

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
        ring.material.SetFloat("_Aspect", 1.52f / 1.12f);
        ring.material.SetFloat("_Size", 0.45f);
        ring.material.SetFloat("_Soft", 0.006f);
        ring.material.SetFloat("_Ring", 1);
        ring.material.renderQueue = 2930;
        var fill = Mats.Flat("Fill", go.transform, Mats.Make("Soft", new Color(1, 1, 1, 0.35f)), 1.12f, 1.52f, 0.0005f);
        fill.material.SetFloat("_Aspect", 1.52f / 1.12f);
        fill.material.SetFloat("_Size", 0.45f);
        fill.material.SetFloat("_Soft", 0.004f);
        fill.material.renderQueue = 2925;
        var label = Mats.FlatText("Defence", go.transform, s < 0 ? "HERO" : $"<size=70%>DEF</size> {Game.SlotDefence(s)}", 2.4f, Look.InkFaint, true, 500, 6);
        label.transform.localPosition = new Vector3(0, 0.002f, 0);
        var col = go.AddComponent<BoxCollider>();
        col.size = new Vector3(1, 0.05f, 1.4f);
        go.AddComponent<SlotTag>().Set(mine, s);
        slotMarks.Add(go);
    }

    MeshRenderer Pile(string name, Vector3 at, bool back, out TextMeshPro count)
    {
        var go = new GameObject(name);
        go.transform.SetParent(table, false);
        go.transform.localPosition = at;
        var shadow = Mats.Flat("Shadow", go.transform, Mats.Make("Soft", new Color(0.25f, 0.27f, 0.33f, 0.2f)), 1.5f, 1.9f, -0.001f);
        shadow.material.SetFloat("_Aspect", 1.9f / 1.5f);
        shadow.material.SetFloat("_Size", 0.36f);
        shadow.material.SetFloat("_Soft", 0.09f);
        shadow.material.renderQueue = 2940;
        var face = Mats.Flat("Top", go.transform, Mats.Make("Card"), 1, 1.4f, 0.02f);
        face.material.mainTexture = back ? Resources.Load<Texture2D>("Board/back") : null;
        face.material.color = back ? Color.white : new Color(1, 1, 1, 0.55f);
        face.material.renderQueue = 2950;
        var label = Mats.FlatText("Name", go.transform, back ? "" : "DISCARD", 1.9f, Look.InkFaint, true, 500, 10);
        label.transform.localPosition = new Vector3(0, 0.03f, 0);
        count = Mats.FlatText("Count", go.transform, "", 2.6f, Look.InkSoft, true, 700, 4);
        count.transform.localPosition = new Vector3(0, 0.03f, -0.92f);
        return face;
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
                var v = Card(c, true);
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
                var v = Card(p.Lightspeed, true);
                seen.Add(p.Lightspeed.Uid);
                v.transform.SetParent(table, false);
                v.MoveTo(SlotAt(mine, 0) + new Vector3(-1.25f, 0.03f, mine ? 0.4f : -0.4f), Quaternion.Euler(0, mine ? -8 : 8, 0), 0.8f);
                if (mine) v.SetCard(p.Lightspeed.DefId);
                else v.FaceDown();
                for (int k = 0; k < 3; k++) v.Badge(new[] { "atk", "stab", "def" }[k], "atk", null);
            }
            SunFor(p, mine).Show(s, p);
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
        float cardH = h * 0.36f, cardW = cardH / 1.4f;
        int n = me.Hand.Count;
        float step = Mathf.Min(cardW * 1.04f, (w * 0.62f) / Mathf.Max(1, n - 1));
        for (int i = 0; i < n; i++)
        {
            var c = me.Hand[i];
            var v = Card(c, false);
            seen.Add(c.Uid);
            v.transform.SetParent(handRoot, false);
            float x = (i - (n - 1) / 2f) * step;
            float lift = ui.HandLift(c);
            var y = -h / 2 + cardH * 0.36f + lift * cardH * 0.25f;
            v.MoveTo(new Vector3(x, -d + 0.001f * i, y), Quaternion.Euler(0, (i - (n - 1) / 2f) * 1.2f, 0), cardW);
            foreach (var b in new[] { "atk", "stab", "def" }) v.Badge(b, "atk", null);
            v.Dimmed(false);
            ui.Dress(v, me, c, false);
        }
        foreach (var uid in cards.Keys.Where(k => !seen.Contains(k)).ToList())
        {
            Mats.Kill(cards[uid].gameObject);
            cards.Remove(uid);
        }

        // Piles and counts.
        myDeckN.text = me.Deck.Count.ToString();
        rivalDeckN.text = rival.Deck.Count.ToString();
        myDiscardN.text = me.Discard.Count.ToString();
        rivalDiscardN.text = rival.Discard.Count.ToString();
        var top = me.Discard.LastOrDefault();
        myDiscard.material.mainTexture = top != null ? Faces.Of(top.DefId, true) : null;
        myDiscard.material.color = top != null ? Color.white : new Color(1, 1, 1, 0.5f);
        var rtop = rival.Discard.LastOrDefault();
        rivalDiscard.material.mainTexture = rtop != null ? Faces.Of(rtop.DefId, true) : null;
        rivalDiscard.material.color = rtop != null ? Color.white : new Color(1, 1, 1, 0.5f);
        myDeck.gameObject.SetActive(me.Deck.Count > 0);
        rivalDeck.gameObject.SetActive(rival.Deck.Count > 0);
        rivalHandN.text = $"HAND  <b>{rival.Hand.Count}</b>";
        myHandN.text = $"HAND  <b>{me.Hand.Count}</b>";
        rivalLabel.text = rival.Name.ToUpperInvariant();
        var active = Game.ActivePlayer(s);
        for (int i = 0; i < phases.Length; i++) phases[i].color = i == 1 ? (active == me ? Look.Ink : Look.InkSoft) : Look.InkFaint;
        foreach (var slot in slotMarks) slot.SetActive(true);
    }

    CardView Card(CardInstance c, bool table)
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
        }
        v.SetCard(c.DefId);
        return v;
    }

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
            sun = SunView.Make(table, mine ? MySun : RivalSun, p.Id);
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
