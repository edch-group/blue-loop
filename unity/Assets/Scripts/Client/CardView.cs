using System.Linq;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// A card as an object in the scene: its baked face (rounded, greyed when dimmed), a soft shadow under it, a rim for
/// its state (playable, picked, aimed at), and the badges it wears in play (attack, stability, defence). It glides to
/// wherever it is told to be.
/// </summary>
public class CardView : MonoBehaviour
{
    public string Uid;
    public string DefId;
    public bool Table;
    MeshRenderer face, shadow, rim;
    readonly Dictionary<string, MeshRenderer> badges = new Dictionary<string, MeshRenderer>();
    Vector3 goalPos, goalScale = Vector3.one;
    Quaternion goalRot = Quaternion.identity;
    bool placed;
    // Its motions on top of where it is going: held in place a while (on the stage), a lunge, a shake.
    float holdUntil, lungeAge = -1, shakeAge = -11;
    Vector3 lunge;
    const float LungeTime = 0.4f, ShakeTime = 0.32f;

    /// <summary>
    /// A card in the hand drawn over everything on the table, its shadow, rim, face and badges together: the table's
    /// badges (3010) were drawn over the hand's faces (3000).
    /// </summary>
    int Lift => Table ? 0 : 200 + 30 * stack;

    /// <summary>Its place in the hand's fan (0 at the back): each card a band of queues over the one before, badges and all.</summary>
    int stack;

    public void Stack(int i)
    {
        if (Table || i == stack) return;
        stack = i;
        shadow.sharedMaterial.renderQueue = 2990 + Lift;
        rim.sharedMaterial.renderQueue = 2995 + Lift;
        if (flash != null) flash.sharedMaterial.renderQueue = 2996 + Lift;
        face.sharedMaterial.renderQueue = 3000 + Lift;
        foreach (var b in badges.Values) b.sharedMaterial.renderQueue = 3010 + Lift;
        foreach (var kv in marks) kv.Value.sharedMaterial.renderQueue = markQueue[kv.Key] + Lift;
        foreach (var kv in discardQueue) kv.Key.sharedMaterial.renderQueue = kv.Value + Lift;
    }

    /// <param name="css">The CSS width it is drawn at (see DrawnAt); 0: not known.</param>
    public static CardView Make(Transform parent, string uid, string defId, bool table, float css = 0)
    {
        var go = new GameObject($"Card {defId}");
        go.transform.SetParent(parent, false);
        var v = go.AddComponent<CardView>();
        v.Uid = uid;
        v.Table = table;
        v.Css = css;
        v.shadow = Mats.Flat("Shadow", go.transform, Mats.Make("Soft", new Color(0.25f, 0.27f, 0.33f, 0.22f)), 1.5f, 1.9f, -0.002f);
        v.shadow.sharedMaterial.SetFloat("_Aspect", 1.9f / 1.5f);
        v.shadow.sharedMaterial.SetFloat("_Size", 0.36f);
        v.shadow.sharedMaterial.SetFloat("_Soft", 0.09f);
        v.shadow.transform.localPosition = new Vector3(0.02f, -0.002f, -0.07f);
        v.shadow.sharedMaterial.renderQueue = 2990 + v.Lift;
        v.rim = Mats.Flat("Rim", go.transform, Mats.Make("Soft", new Color(0, 0, 0, 0)), 1.36f, 1.76f, -0.001f);
        v.rim.sharedMaterial.SetFloat("_Aspect", 1.76f / 1.36f);
        v.rim.sharedMaterial.SetFloat("_Size", 0.37f);
        v.rim.sharedMaterial.SetFloat("_Soft", 0.035f);
        v.rim.sharedMaterial.renderQueue = 2995 + v.Lift;
        v.face = Mats.Flat("Face", go.transform, Mats.Make("Card"), 1, 1.4f);
        v.face.sharedMaterial.renderQueue = 3000 + v.Lift;
        var col = go.AddComponent<BoxCollider>();
        col.size = new Vector3(1, 0.05f, 1.4f);
        v.SetCard(defId);
        return v;
    }

    public void SetCard(string defId)
    {
        if (defId == DefId) return;
        DefId = defId;
        ShowFace();
    }

    /// <summary>The CSS width it is drawn at (a table card's --tcw, a hand card's --hw); 0: not known (the old faces).</summary>
    public float Css { get; private set; }

    /// <summary>
    /// Drawn `css` CSS px wide: its face the one baked for that size (the web's card at that width, its floors and all),
    /// and its badges where the web sets them on a card that wide.
    /// </summary>
    public void DrawnAt(float css)
    {
        if (Mathf.Abs(css - Css) < 0.01f) return;
        Css = css;
        ShowFace();
        foreach (var kv in badges) PlaceBadge(kv.Key, kv.Value);
    }

    void ShowFace()
    {
        if (DefId == null) return;
        face.sharedMaterial.mainTexture = Css > 0 ? (pricey && !Table ? Faces.Pricey(DefId, Css) : Faces.Of(DefId, Table ? Faces.Look.Table : Faces.Look.Hand, Css)) : Faces.Of(DefId, Table);
    }

    /// <summary>A card face down (a set trap, a pile).</summary>
    public void FaceDown() => face.sharedMaterial.mainTexture = Resources.Load<Texture2D>("Board/back");

    /// <summary>Dragged out of the hand: it stays, faint, while its copy flies (.card-dragging).</summary>
    public void Ghosted(bool on)
    {
        var c = face.sharedMaterial.color;
        c.a = on ? 0.3f : 1;
        face.sharedMaterial.color = c;
        shadow.gameObject.SetActive(!on);
    }

    public void Dimmed(bool on) => Grey(0, on ? 0.75f : 0);

    // (Each look that greys the face, the strongest shown: dimmed, frozen, (2: none now, too costly has its own face), its
    // side out of the game, marked to discard.)
    readonly float[] greys = new float[5];

    void Grey(int i, float k)
    {
        greys[i] = k;
        face.sharedMaterial.SetFloat("_Grey", greys.Max());
    }

    /// <summary>
    /// Frozen (.card-table.card-frozen .card-glyph: saturate(0.4) hue-rotate(-10deg) brightness(1.05)): its colours muted
    /// under the frost (the "frozen" mark).
    /// </summary>
    public void Frozen(bool on) => Grey(1, on ? 0.6f : 0);

    /// <summary>
    /// Too costly to play right now (.hand .card.card-pricey: its picture and words at saturate(0.4), its energy dots
    /// grey and unlit): still a solid card, its colours muted. Its face the one baked so (Faces.Pricey), not greyed
    /// whole: greyed, its dots stayed a washed-out green and its card stock, name and kind went grey with them.
    /// </summary>
    public void Pricey(bool on)
    {
        if (on == pricey) return;
        pricey = on;
        ShowFace();
    }

    bool pricey;

    /// <summary>Its side out of the game (.tableau-dead: opacity 0.45, grayscale(0.7)).</summary>
    public void Dead(bool on)
    {
        if ((whole < 1) == on) return;
        whole = on ? 0.45f : 1;
        Grey(3, on ? 0.7f : 0);
        if (!flying) Fade(1);
    }

    /// <summary>How much of it shows (its side out of the game: 0.45).</summary>
    float whole = 1;

    // ---- Marks: what app.ts renderCard sets on it beyond its face and badges, baked (Marks) ----

    readonly Dictionary<string, MeshRenderer> marks = new Dictionary<string, MeshRenderer>();
    readonly Dictionary<string, int> markQueue = new Dictionary<string, int>();
    readonly Dictionary<string, string> markName = new Dictionary<string, string>();
    readonly Dictionary<string, float> markAt = new Dictionary<string, float>();

    /// <summary>How many marks its room row (.card-room) shows, room0 onwards.</summary>
    public int RoomShown { get; set; }

    /// <summary>
    /// A mark in `slot` (one at a time each): `name` as baked (Marks), drawn at render queue `queue` (over the face, 3000,
    /// or under it), `dx` card widths across from where it was baked; none (null), it is put away.
    /// </summary>
    public void Mark(string slot, string name, int queue, float dx = 0)
    {
        marks.TryGetValue(slot, out var r);
        var got = name != null ? Marks.Get(name, Table, Css) : null;
        if (got == null)
        {
            if (r != null) r.gameObject.SetActive(false);
            markName.Remove(slot);
            return;
        }
        if (r == null)
        {
            r = Mats.Flat(slot, transform, Mats.Make("Card"), 1, 1, 0.004f);
            r.sharedMaterial.SetFloat("_Radius", 0);
            marks[slot] = r;
        }
        markQueue[slot] = queue;
        r.sharedMaterial.renderQueue = queue + Lift;
        r.gameObject.SetActive(true);
        var (tex, at) = got.Value;
        if (!markName.ContainsKey(slot)) markAt[slot] = Time.time;
        markName[slot] = name;
        r.sharedMaterial.mainTexture = tex;
        r.sharedMaterial.SetFloat("_Aspect", at.h / at.w);
        // (Over the face a little higher the later it is drawn; under it, a little below.)
        float lift = queue >= 3000 ? 0.004f + (queue - 3000) * 0.0001f : -0.0006f + (queue - 2990) * 0.00005f;
        var c = r.sharedMaterial.color;
        c.a = (flying && flyFade ? face.sharedMaterial.color.a : whole);
        r.sharedMaterial.color = c;
        r.transform.localScale = new Vector3(at.w, at.h, 1);
        r.transform.localPosition = new Vector3(-0.5f + at.x + at.w / 2 + dx, lift, 0.7f - (at.y + at.h / 2));
        r.transform.localRotation = Quaternion.Euler(90, 0, 0);
    }

    /// <summary>
    /// The chill's snowflake comes in (@keyframes chill-in, 0.5 s ease-out: from nothing, 0.6 of its size and turned back
    /// 30°).
    /// </summary>
    string chillIn;

    void MarksIn()
    {
        if (!marks.TryGetValue("chill", out var r) || !r.gameObject.activeSelf || !markName.TryGetValue("chill", out var name)) return;
        float t = Mathf.Clamp01((Time.time - markAt["chill"]) / 0.5f);
        if (t >= 1 && chillIn == name) return;
        chillIn = t >= 1 ? name : null;
        var got = Marks.Get(name, Table, Css);
        if (got == null) return;
        float e = Ease(0, 0, 0.58f, 1, t);
        var p = got.Value.at;
        r.transform.localScale = new Vector3(p.w, p.h, 1) * Mathf.Lerp(0.6f, 1, e);
        r.transform.localRotation = Quaternion.Euler(90, Mathf.Lerp(-30, 0, e), 0);
        var c = r.sharedMaterial.color;
        c.a = e * (flying && flyFade ? face.sharedMaterial.color.a : whole);
        r.sharedMaterial.color = c;
    }

    /// <summary>Its rim: none, or a colour (playable green, picked blue, aimed red), soft or strong.</summary>
    public void Rim(Color? c, float strength = 1)
    {
        var col = c ?? new Color(0, 0, 0, 0);
        if (c != null) col.a = 0.85f * strength;
        rimA = col.a;
        // (Flying in faded, its rim fades in with it.)
        if (flying && flyFade) col.a *= face.sharedMaterial.color.a;
        rim.sharedMaterial.color = col;
    }

    float rimA;

    // ---- Marked to discard at the day's end (styles.css .hand > .card.card-discard) ----

    MeshRenderer discardRing, discardGap, discardWash, discardX1, discardX2;
    readonly Dictionary<MeshRenderer, int> discardQueue = new Dictionary<MeshRenderer, int>();
    bool discarded;

    /// <summary>
    /// Marked to discard at the day's end (.hand > .card.card-discard): ringed (box-shadow 0 0 0 2px #fff, 0 0 0 5px
    /// #d0654b, 0 14px 30px rgba(120, 60, 50, 0.28)), greyed (filter: grayscale(0.65) brightness(0.96)), and crossed out
    /// under a pale wash (::after: '✕' in #c0563d at 0.42 of its width, over rgba(255, 255, 255, 0.38)). The filter
    /// greys all of it, ring, shadow and cross too: their colours here are the web's after it.
    /// </summary>
    public void Discard(bool on)
    {
        if (!on && !discarded) return;
        if (on && discardRing == null)
        {
            discardRing = DiscardBox("Discard ring", Filtered(208, 101, 75, 1), 2993, -0.0012f);
            discardGap = DiscardBox("Discard gap", Filtered(255, 255, 255, 1), 2994, -0.0011f);
            discardWash = DiscardBox("Discard wash", Filtered(255, 255, 255, 0.38f), 3020, 0.005f);
            discardX1 = DiscardBox("Discard cross", Filtered(192, 86, 61, 1), 3021, 0.0052f);
            discardX2 = DiscardBox("Discard cross", Filtered(192, 86, 61, 1), 3021, 0.0052f);
        }
        if (on)
        {
            // (Sized for the width it is drawn at, in CSS px: the rings 2 and 5 px out, their corners the card's 8% and
            // as much again; the cross a DejaVu Sans '✕' at 0.42 of the card's width, its strokes 0.73 em long and 0.098
            // em thick, a little below the middle as its line sets it.)
            float px = 1f / (Css > 0 ? Css : 100);
            PlaceBox(discardRing, 1 + 10 * px, 1.4f + 10 * px, 0.08f + 5 * px, px);
            PlaceBox(discardGap, 1 + 4 * px, 1.4f + 4 * px, 0.08f + 2 * px, px);
            PlaceBox(discardWash, 1, 1.4f, 0.08f, px);
            float em = 0.42f;
            PlaceBox(discardX1, 0.729f * em, 0.0977f * em, 0, px, 45, -0.0345f * em);
            PlaceBox(discardX2, 0.729f * em, 0.0977f * em, 0, px, -45, -0.0345f * em);
        }
        if (on == discarded) return;
        discarded = on;
        foreach (var r in discardQueue.Keys) r.gameObject.SetActive(on);
        // (Its face, badges and marks greyed and dimmed with it.)
        Grey(4, on ? 0.65f : 0);
        foreach (var r in new[] { face }.Concat(badges.Values).Concat(marks.Values))
        {
            if (r != null) Dim(r, on ? 0.96f : 1);
            if (r != null && r != face) r.sharedMaterial.SetFloat("_Grey", on ? 0.65f : 0);
        }
        // (Its shadow the web's for a card to go, reddened and greyed.)
        var sc = shadow.sharedMaterial.color;
        float was = shadowA < 0 ? sc.a : shadowA, k = was > 0 ? sc.a / was : 1;
        var want = on ? Filtered(120, 60, 50, 0.28f) : new Color(0.25f, 0.27f, 0.33f, 0.22f);
        shadowA = want.a;
        want.a *= k;
        shadow.sharedMaterial.color = want;
    }

    static void Dim(MeshRenderer r, float b)
    {
        var c = r.sharedMaterial.color;
        r.sharedMaterial.color = new Color(b, b, b, c.a);
    }

    /// <summary>A colour as the web's filter: grayscale(0.65) brightness(0.96) leaves it (the Filter Effects matrices).</summary>
    static Color Filtered(int r8, int g8, int b8, float a)
    {
        float r = r8 / 255f, g = g8 / 255f, b = b8 / 255f;
        const float k = 0.35f;
        float r2 = (0.2126f + 0.7874f * k) * r + (0.7152f - 0.7152f * k) * g + (0.0722f - 0.0722f * k) * b;
        float g2 = (0.2126f - 0.2126f * k) * r + (0.7152f + 0.2848f * k) * g + (0.0722f - 0.0722f * k) * b;
        float b2 = (0.2126f - 0.2126f * k) * r + (0.7152f - 0.7152f * k) * g + (0.0722f + 0.9278f * k) * b;
        return new Color(r2 * 0.96f, g2 * 0.96f, b2 * 0.96f, a);
    }

    MeshRenderer DiscardBox(string name, Color c, int queue, float lift)
    {
        var r = Mats.Flat(name, transform, Mats.Make("Soft", c), 1, 1, lift);
        r.sharedMaterial.renderQueue = queue + Lift;
        discardQueue[r] = queue;
        return r;
    }

    /// <summary>
    /// A crisp rounded box (the Soft shader filling its quad but for an edge to smooth) `w` by `h` card widths about
    /// the card's middle (`dz` toward its top), its corners `radius`, turned `turn`° on the card.
    /// </summary>
    static void PlaceBox(MeshRenderer r, float w, float h, float radius, float px, float turn = 0, float dz = 0)
    {
        // (The shader's box is _Size of the quad's width across and as much of its height down; the quad a little bigger.)
        const float size = 0.45f;
        float qw = w / (2 * size), qh = h / (2 * size);
        r.transform.localScale = new Vector3(qw, qh, 1);
        r.transform.localRotation = Quaternion.Euler(0, turn, 0) * Quaternion.Euler(90, 0, 0);
        var p = r.transform.localPosition;
        r.transform.localPosition = new Vector3(0, p.y, dz);
        var m = r.sharedMaterial;
        m.SetFloat("_Aspect", qh / qw);
        m.SetFloat("_Size", size);
        m.SetFloat("_Radius", radius / qw);
        m.SetFloat("_Soft", 0.5f * px / qw);
        m.SetFloat("_Ring", 0);
    }

    MeshRenderer flash;
    float flashAt = -1, flashFor, flashBright;
    bool flashHit;

    /// <summary>
    /// A card struck (.fx-hit-card: a hot ring and glow, the card brightened, gone over 0.6 s) or given something
    /// (.fx-upgrade: a white ring and glow rising to 30% of 1.2 s and gone), `after` seconds from now.
    /// </summary>
    public void Flash(bool hit, float after = 0, float seconds = 0, float bright = 0.6f)
    {
        flashBright = bright;
        if (flash == null)
        {
            flash = Mats.Flat("Flash", transform, Mats.Make("Soft", new Color(0, 0, 0, 0)), 1.8f, 2.2f, -0.0005f);
            flash.sharedMaterial.SetFloat("_Aspect", 2.2f / 1.8f);
            flash.sharedMaterial.SetFloat("_Size", 0.54f / 1.8f);
            flash.sharedMaterial.SetFloat("_Soft", 0.3f / 1.8f);
            flash.sharedMaterial.renderQueue = 2996 + Lift;
        }
        flashHit = hit;
        flashTrigger = false;
        flashFor = seconds > 0 ? seconds : hit ? 0.6f : 1.2f;
        flashAt = Time.time + after;
    }

    Color flashColour;
    bool flashTrigger;

    /// <summary>.fx-trigger: a card firing lights up in its kind's colour (a white ring and a glow), gone over 0.7 s.</summary>
    public void Trigger(Color kind, float after = 0)
    {
        Flash(false, after, 0.7f, 0);
        flashTrigger = true;
        flashColour = Color.Lerp(Color.white, kind, 0.7f);
    }

    void Flashing()
    {
        if (flashAt < 0 || flash == null || Time.time < flashAt) return;
        float t = (Time.time - flashAt) / flashFor;
        // (ease-out over the whole for a blow; for a gift, in to its peak at 30% and out after.)
        float k = flashHit || flashTrigger ? 1 - (1 - Mathf.Pow(1 - Mathf.Clamp01(t), 2)) : t < 0.3f ? 1 - Mathf.Pow(1 - t / 0.3f, 2) : 1 - (1 - Mathf.Pow(1 - (t - 0.3f) / 0.7f, 2));
        if (t >= 1) { k = 0; flashAt = -1; }
        var c = flashTrigger ? flashColour : flashHit ? Hud.Rgba(255, 106, 58) : Color.white;
        c.a = Mathf.Clamp01(k);
        flash.sharedMaterial.color = c;
        if (flashHit)
        {
            var f = face.sharedMaterial.color;
            float b = 1 + flashBright * Mathf.Clamp01(k);
            face.sharedMaterial.color = new Color(b, b, b, f.a);
        }
    }

    /// <summary>A badge (atk, atk-dim, stab, stab-low, def, guard) with its value, or none (n null).</summary>
    public void Badge(string slot, string kind, int? n)
    {
        if (!badges.TryGetValue(slot, out var r))
        {
            // (Nothing to show, and never shown: nothing to make.)
            if (n == null) return;
            r = Mats.Flat(slot, transform, Mats.Make("Card"), 1, 1, 0.004f);
            r.sharedMaterial.SetFloat("_Radius", 0);
            r.sharedMaterial.renderQueue = 3010 + Lift;
            badges[slot] = r;
        }
        r.gameObject.SetActive(n != null);
        if (n == null) return;
        badgeKind[slot] = kind;
        PlaceBadge(slot, r);
        r.sharedMaterial.mainTexture = Css > 0 ? Faces.Badge(kind, n.Value, Css) : Faces.Badge(kind, n.Value);
    }

    readonly Dictionary<string, string> badgeKind = new Dictionary<string, string>();

    /// <summary>
    /// A badge where the web sets it on a card as wide as this is drawn (Faces.At: a hand card's stones smaller than a
    /// table card's, a small card's shield at its floor); not knowing its width, where it sits on the face it wears (a
    /// 200 px table card's, or the magnified one's: Faces.OnFace).
    /// </summary>
    void PlaceBadge(string slot, MeshRenderer r)
    {
        badgeKind.TryGetValue(slot, out var kind);
        var at = slot == "def" && kind != null && kind.StartsWith("guard") ? "guard" : slot;
        var p = Css > 0 ? Faces.At(at, Css, Table) : !Table ? Faces.OnFace(at) : at == "atk" ? Faces.Where.atk : at == "stab" ? Faces.Where.stab : at == "guard" ? Faces.Where.guard : Faces.Where.def;
        r.transform.localScale = new Vector3(p.w, p.h, 1);
        r.sharedMaterial.SetFloat("_Aspect", p.h / p.w);
        r.transform.localPosition = new Vector3(-0.5f + p.x + p.w / 2, 0.004f, 0.7f - (p.y + p.h / 2));
    }

    public void MoveTo(Vector3 pos, Quaternion rot, float scale = 1, bool snap = false)
    {
        goalPos = pos;
        goalRot = rot;
        goalScale = Vector3.one * scale;
        if (snap || !placed)
        {
            transform.localPosition = pos;
            transform.localRotation = rot;
            transform.localScale = goalScale;
            placed = true;
        }
    }

    /// <summary>Stay where it is for a while before going on (a card shown on the stage).</summary>
    public void Hold(float seconds) => holdUntil = Time.time + seconds;

    // A flight in (fx.ts flyFrom): from a pose, after a delay, onto where it is going.
    bool flying, flyFade;
    float flyAt, flyFor;
    Vector3 flyPos, flyScale;
    Quaternion flyRot;

    /// <summary>
    /// fx.ts flyFrom: from where another object stands (world space), `delay` seconds from now, over `seconds`
    /// (cubic-bezier(.2,.8,.2,1)), onto where it is told to be; faded in from nothing as it goes if `fade` (held unseen
    /// where it starts until then: fill backwards), else whole from the start.
    /// </summary>
    public void FlyFrom(Vector3 worldPos, Quaternion worldRot, Vector3 worldScale, float delay, float seconds, bool fade)
    {
        StartFrom(worldPos, worldRot, worldScale);
        flyPos = transform.localPosition;
        flyRot = transform.localRotation;
        flyScale = transform.localScale;
        applied = Vector3.zero;
        holdUntil = 0;
        flying = true;
        flyFade = fade;
        flyAt = Time.time + Mathf.Max(0, delay);
        flyFor = Mathf.Max(0.01f, seconds);
        Fade(fade ? 0 : 1);
    }

    /// <summary>Whether it is still flying in.</summary>
    public bool Flying => flying;

    float shadowA = -1;

    /// <summary>The whole card faded to `k` (its face, shadow and badges) as it flies in.</summary>
    void Fade(float k)
    {
        // (Its side out of the game, all of it at 0.45.)
        k *= whole;
        var f = face.sharedMaterial.color;
        if (shadowA < 0) shadowA = shadow.sharedMaterial.color.a;
        var sc = shadow.sharedMaterial.color;
        f.a = k;
        face.sharedMaterial.color = f;
        sc.a = shadowA * k;
        shadow.sharedMaterial.color = sc;
        foreach (var b in badges.Values.Concat(marks.Values))
        {
            var c = b.sharedMaterial.color;
            c.a = k;
            b.sharedMaterial.color = c;
        }
        var r = rim.sharedMaterial.color;
        r.a = rimA * k;
        rim.sharedMaterial.color = r;
    }

    void Fly()
    {
        float t = Mathf.Clamp01((Time.time - flyAt) / flyFor);
        float e = Ease(0.2f, 0.8f, 0.2f, 1, t);
        transform.localPosition = Vector3.LerpUnclamped(flyPos, goalPos, e);
        transform.localRotation = Quaternion.SlerpUnclamped(flyRot, goalRot, e);
        transform.localScale = Vector3.LerpUnclamped(flyScale, goalScale, e);
        if (flyFade) Fade(Mathf.Clamp01(e));
        if (t < 1) return;
        flying = false;
        if (flyFade) Fade(1);
        baseRot = goalRot;
        baseScale = goalScale;
        based = true;
    }

    /// <summary>Lunge toward a point (in world space) and back: an attack.</summary>
    public void Lunge(Vector3 worldTarget, float distance = 0.75f)
    {
        var d = worldTarget - transform.position;
        d.y = 0;
        lunge = (transform.parent != null ? transform.parent.InverseTransformVector(d.normalized) : d.normalized) * Mathf.Min(distance, d.magnitude * 0.6f);
        lungeAge = 0;
    }

    /// <summary>Shudder: a blow landing.</summary>
    public void Shake(float after = 0) => shakeAge = -after;

    /// <summary>A card that can't be played now shakes its head (app.ts startPlay refuse).</summary>
    public void Refuse() => refuseAge = 0;

    float refuseAge = -1;
    const float RefuseTime = 0.38f;

    // An attack's strike (app.ts lunge): where it smashes into, from where it stands, and how far it lifts first.
    float strikeAge = -1;
    Vector3 strikeTo, strikeLift;
    float strikeSide;
    public const float StrikeTime = 0.9f, StrikeHit = 0.58f;

    /// <summary>
    /// app.ts lunge (0.9 s): lifted, tilted back (1.16 by 30%), then into its target just short of its middle (82% of
    /// the way, by 58%, where the blow lands), rebounding a little (to 90% by 66%), then home. Over everything.
    /// </summary>
    public void Strike(Vector3 worldTarget, float liftWorld)
    {
        var d = worldTarget - transform.position;
        d.y = 0;
        var local = transform.parent != null ? transform.parent.InverseTransformVector(d) : d;
        strikeTo = local * 0.82f;
        strikeSide = d.x >= 0 ? 1 : -1;
        var up = transform.parent != null ? transform.parent.InverseTransformVector(new Vector3(0, 0, liftWorld)) : new Vector3(0, 0, liftWorld);
        strikeLift = up;
        strikeAge = 0;
    }

    /// <summary>The strike's pose at `k` of it: offset (local), its turn about the table's normal (degrees) and scale.</summary>
    (Vector3 off, float turn, float scale) StrikePose(float k)
    {
        // (A screen pixel to the side: the lift's own length over 18.)
        var side = new Vector3(strikeSide * strikeLift.magnitude / 18 * -8, 0, 0);
        var p1 = side + strikeLift;
        if (k < 0.3f)
        {
            float e = k / 0.3f;
            return (Vector3.Lerp(Vector3.zero, p1, e), Mathf.Lerp(0, -strikeSide * 10, e), Mathf.Lerp(1, 1.16f, e));
        }
        if (k < 0.58f)
        {
            float e = Ease(0.55f, 0, 0.95f, 0.45f, (k - 0.3f) / 0.28f);
            return (Vector3.Lerp(p1, strikeTo, e), Mathf.Lerp(-strikeSide * 10, strikeSide * 8, e), Mathf.Lerp(1.16f, 1.08f, e));
        }
        if (k < 0.66f)
        {
            float e = (k - 0.58f) / 0.08f;
            return (Vector3.Lerp(strikeTo, strikeTo * 0.9f, e), Mathf.Lerp(strikeSide * 8, strikeSide * 3, e), Mathf.Lerp(1.08f, 1.06f, e));
        }
        float f = Ease(0.3f, 0.7f, 0.3f, 1, (k - 0.66f) / 0.34f);
        return (Vector3.Lerp(strikeTo * 0.9f, Vector3.zero, f), Mathf.Lerp(strikeSide * 3, 0, f), Mathf.Lerp(1.06f, 1, f));
    }

    /// <summary>cubic-bezier(x1, y1, x2, y2) at x.</summary>
    static float Ease(float x1, float y1, float x2, float y2, float x)
    {
        x = Mathf.Clamp01(x);
        float t = x;
        for (int i = 0; i < 12; i++)
        {
            float u = 1 - t;
            float bx = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t - x;
            float dx = 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2);
            if (Mathf.Abs(dx) < 1e-5f) break;
            t = Mathf.Clamp01(t - bx / dx);
        }
        float v = 1 - t;
        return 3 * v * v * t * y1 + 3 * v * t * t * y2 + t * t * t;
    }

    /// <summary>Gone to a pile (or its owner): it flies there, shrinking to `scale` and fading, then is gone.</summary>
    public void GoTo(Vector3 worldTo, float scale, float after = 0)
    {
        enabled = false;
        var g = gameObject.AddComponent<Ghosting>();
        g.To = worldTo;
        g.Scale = scale;
        g.After = after;
        foreach (var c in GetComponentsInChildren<Collider>()) c.enabled = false;
    }

    /// <summary>
    /// app.ts lingerInSlot: taken by a blow, it stays in its slot until the blow reaches it (`after`), then dissolves
    /// where it stands (0.52 s, ease-in: brightening and swelling to 1.06 by 35%, then burning out to nothing at 0.7).
    /// </summary>
    public void Dissolve(float after)
    {
        enabled = false;
        var d = gameObject.AddComponent<Dissolving>();
        d.After = after;
        foreach (var c in GetComponentsInChildren<Collider>()) c.enabled = false;
    }

    /// <summary>Its end: it lifts, fades and shrinks away, then is gone.</summary>
    public void Die(float after = 0)
    {
        enabled = false;
        var d = gameObject.AddComponent<Dying>();
        d.After = after;
        foreach (var c in GetComponentsInChildren<Collider>()) c.enabled = false;
    }

    /// <summary>The lunge's and the shake's offset, added to its place each frame (and taken off again the next).</summary>
    Vector3 applied;

    Vector3 Offset()
    {
        var o = Vector3.zero;
        if (lungeAge >= 0) o += lunge * Mathf.Sin(Mathf.PI * Mathf.Clamp01(lungeAge / LungeTime));
        if (shakeAge >= 0)
        {
            // (translate: 0, (-5px, 2px), (4px, -2px), (-2px, 1px), 0, evenly over 0.32 s; down the screen is toward you.)
            var keys = new[] { Vector2.zero, new Vector2(-5, 2), new Vector2(4, -2), new Vector2(-2, 1), Vector2.zero };
            float u = Mathf.Clamp01(shakeAge / ShakeTime) * 4;
            int i = Mathf.Min(3, (int)u);
            var px = Vector2.Lerp(keys[i], keys[i + 1], u - i);
            var w = new Vector3(Board.Px(px.x), 0, -Board.Px(px.y));
            o += transform.parent != null ? transform.parent.InverseTransformVector(w) : w;
        }
        if (refuseAge >= 0)
        {
            // (translate: 0, -7px, 6px, -4px, 2px, 0 across the screen, over 0.38 s eased out; a CSS px of it, its own
            // width over the width the web draws it.)
            var keys = new[] { 0f, -7, 6, -4, 2, 0 };
            float u = BattleView.CubicBezier(0, 0, 0.58f, 1, Mathf.Clamp01(refuseAge / RefuseTime)) * 5;
            int i = Mathf.Min(4, (int)u);
            var col = GetComponentInChildren<Collider>();
            float css = Table ? BoardLayout.Current.Tcw : BoardLayout.Current.HandCard;
            float px = col != null ? col.bounds.size.x / css : 0;
            var w = Vector3.right * Mathf.Lerp(keys[i], keys[i + 1], u - i) * px;
            o += transform.parent != null ? transform.parent.InverseTransformVector(w) : w;
        }
        return o;
    }

    Quaternion baseRot = Quaternion.identity;
    Vector3 baseScale = Vector3.one;
    bool based;

    void Update()
    {
        Flashing();
        MarksIn();
        if (flying) { Fly(); return; }
        if (Time.time < holdUntil) return;
        float k = 1 - Mathf.Exp(-Time.deltaTime * 12);
        var at = transform.localPosition - applied;
        at = Vector3.Lerp(at, goalPos, k);
        if (!based || strikeAge < 0) { baseRot = transform.localRotation; baseScale = transform.localScale; based = true; }
        baseRot = Quaternion.Slerp(baseRot, goalRot, k);
        baseScale = Vector3.Lerp(baseScale, goalScale, k);
        if (lungeAge >= 0) { lungeAge += Time.deltaTime; if (lungeAge > LungeTime) lungeAge = -1; }
        if (shakeAge > -10) { shakeAge += Time.deltaTime; if (shakeAge > ShakeTime) shakeAge = -11; }
        if (refuseAge >= 0) { refuseAge += Time.deltaTime; if (refuseAge > RefuseTime) refuseAge = -1; }
        applied = Offset();
        var turn = Quaternion.identity;
        var grow = 1f;
        if (strikeAge >= 0)
        {
            strikeAge += Time.deltaTime;
            float sk = strikeAge / StrikeTime;
            if (sk >= 1) strikeAge = -1;
            else
            {
                var pose = StrikePose(sk);
                // (Over everything: raised off the table while it flies.)
                applied += pose.off + new Vector3(0, 0.6f * Mathf.Sin(Mathf.PI * sk), 0);
                turn = Quaternion.Euler(0, pose.turn, 0);
                grow = pose.scale;
            }
        }
        transform.localRotation = baseRot * turn;
        transform.localScale = baseScale * grow;
        transform.localPosition = at + applied;
    }

    /// <summary>Start from where another object stands (in world space), then glide to where it is told.</summary>
    public void StartFrom(Vector3 worldPos, Quaternion worldRot, Vector3 worldScale)
    {
        transform.position = worldPos;
        transform.rotation = worldRot;
        var p = transform.parent != null ? transform.parent.lossyScale : Vector3.one;
        transform.localScale = new Vector3(worldScale.x / p.x, worldScale.y / p.y, worldScale.z / p.z);
        placed = true;
    }

    /// <summary>Settle at once (for a still picture).</summary>
    public void Settle()
    {
        applied = Vector3.zero;
        holdUntil = 0;
        if (flying) { flying = false; if (flyFade) Fade(1); }
        transform.localPosition = goalPos;
        transform.localRotation = goalRot;
        transform.localScale = goalScale;
    }
}

/// <summary>A card going: lifting, fading and shrinking away, then gone.</summary>
/// <summary>
/// fx.ts ghost: a card leaving play flies to the pile it went to (or its owner's sun), shrinking to the pile's size
/// and fading to 0.2 (cubic-bezier(.5,0,.3,1), 0.46 s), then is gone.
/// </summary>
public class Ghosting : MonoBehaviour
{
    public Vector3 To;
    public float Scale = 0.3f, After, Seconds = 0.46f, EndAlpha = 0.2f;
    float age;
    Vector3 from, scale0;
    Renderer[] parts;
    float[] alpha0;

    void Start()
    {
        from = transform.position;
        scale0 = transform.localScale;
        parts = GetComponentsInChildren<Renderer>();
        alpha0 = parts.Select(r => r.sharedMaterial != null && r.sharedMaterial.HasProperty("_Color") ? r.sharedMaterial.color.a : 1).ToArray();
    }

    void Update()
    {
        age += Time.deltaTime;
        float t = Mathf.Clamp01((age - After) / Seconds);
        if (t <= 0) return;
        float e = Ease(t);
        transform.position = Vector3.Lerp(from, To, e);
        transform.localScale = scale0 * Mathf.Lerp(1, Scale, e);
        for (int i = 0; i < parts.Length; i++)
        {
            var r = parts[i];
            if (r.sharedMaterial == null || !r.sharedMaterial.HasProperty("_Color")) continue;
            var c = r.sharedMaterial.color;
            c.a = alpha0[i] * Mathf.Lerp(1, EndAlpha, e);
            r.sharedMaterial.color = c;
        }
        if (t >= 1) Mats.Kill(gameObject);
    }

    // (cubic-bezier(.5,0,.3,1).)
    static float Ease(float x)
    {
        float t = x;
        for (int i = 0; i < 10; i++)
        {
            float u = 1 - t;
            float bx = 3 * u * u * t * 0.5f + 3 * u * t * t * 0.3f + t * t * t - x;
            float dx = 3 * u * u * 0.5f + 6 * u * t * (0.3f - 0.5f) + 3 * t * t * (1 - 0.3f);
            if (Mathf.Abs(dx) < 1e-5f) break;
            t = Mathf.Clamp01(t - bx / dx);
        }
        float v = 1 - t;
        return 3 * v * t * t + t * t * t;
    }
}

public class Dying : MonoBehaviour
{
    public float After;
    float age;
    Vector3 scale0, pos0;
    Renderer[] parts;

    void Start()
    {
        scale0 = transform.localScale;
        pos0 = transform.localPosition;
        parts = GetComponentsInChildren<Renderer>();
    }

    void Update()
    {
        age += Time.deltaTime;
        float t = Mathf.Clamp01((age - After) / 0.5f);
        if (t <= 0) return;
        transform.localScale = scale0 * (1 - 0.35f * t);
        transform.localPosition = pos0 + new Vector3(0, 0.6f * t, 0);
        foreach (var r in parts)
        {
            if (r is MeshRenderer m && m.sharedMaterial != null && m.sharedMaterial.HasProperty("_Grey")) m.sharedMaterial.SetFloat("_Grey", t);
            if (r.sharedMaterial != null && r.sharedMaterial.HasProperty("_Color"))
            {
                var c = r.sharedMaterial.color;
                c.a = Mathf.Min(c.a, 1 - t);
                r.sharedMaterial.color = c;
            }
        }
        if (t >= 1) Mats.Kill(gameObject);
    }
}

/// <summary>A card dissolving in its slot (app.ts lingerInSlot).</summary>
public class Dissolving : MonoBehaviour
{
    public float After;
    float age;
    Vector3 scale0;
    Renderer[] parts;
    Color[] colour0;

    void Start()
    {
        scale0 = transform.localScale;
        parts = GetComponentsInChildren<Renderer>();
        colour0 = parts.Select(r => r.sharedMaterial != null && r.sharedMaterial.HasProperty("_Color") ? r.sharedMaterial.color : Color.white).ToArray();
    }

    void Update()
    {
        age += Time.deltaTime;
        float t = Mathf.Clamp01((age - After) / 0.52f);
        if (age < After) return;
        // (ease-in over the whole.)
        float e = EaseIn(t);
        float bright, scale, alpha;
        if (e < 0.35f) { float u = e / 0.35f; bright = Mathf.Lerp(1, 1.6f, u); scale = Mathf.Lerp(1, 1.06f, u); alpha = 1; }
        else { float u = (e - 0.35f) / 0.65f; bright = Mathf.Lerp(1.6f, 2.2f, u); scale = Mathf.Lerp(1.06f, 0.7f, u); alpha = 1 - u; }
        transform.localScale = scale0 * scale;
        for (int i = 0; i < parts.Length; i++)
        {
            var r = parts[i];
            if (r == null || r.sharedMaterial == null || !r.sharedMaterial.HasProperty("_Color")) continue;
            var c = colour0[i];
            // (The face brightens; everything fades.)
            r.sharedMaterial.color = r.name == "Face" ? new Color(c.r * bright, c.g * bright, c.b * bright, c.a * alpha) : new Color(c.r, c.g, c.b, c.a * alpha);
        }
        if (t >= 1) Mats.Kill(gameObject);
    }

    // (cubic-bezier(.42,0,1,1).)
    static float EaseIn(float x)
    {
        float t = x;
        for (int i = 0; i < 10; i++)
        {
            float u = 1 - t;
            float bx = 3 * u * u * t * 0.42f + 3 * u * t * t + t * t * t - x;
            float dx = 3 * u * u * 0.42f + 6 * u * t * (1 - 0.42f);
            if (Mathf.Abs(dx) < 1e-5f) break;
            t = Mathf.Clamp01(t - bx / dx);
        }
        float v = 1 - t;
        return 3 * v * t * t + t * t * t;
    }
}

/// <summary>
/// What the web sets on a card beyond its face and badges, baked as it draws each on a card that wide
/// (scripts/bake-marks.mjs: Resources/Marks/<size>/<name>.png, and where each sits in Marks/places.json, in card widths
/// from the card's top left): in play on a phone's board (t-p56, t-p66, t-p78) or a desktop's (t-d84, t-d96), or in
/// the hand (h-66 … h-124). The boons and guns along a card's top scale with it alone: baked once, at t-d96.
/// </summary>
public static class Marks
{
    [System.Serializable] class Item { public string k; public float x, y, w, h; }
    [System.Serializable] class Items { public List<Item> items; }

    static Dictionary<string, Faces.Place> places;
    static readonly Dictionary<string, Texture2D> cache = new Dictionary<string, Texture2D>();
    static readonly int[] TablePhone = { 56, 66, 78 }, TableDesk = { 84, 96 }, Hand = { 66, 79, 100, 124 };

    /// <summary>The baked size nearest a card `css` px wide, in play or in the hand (as Faces picks a face's).</summary>
    static string Dir(string name, bool table, float css)
    {
        if (name.StartsWith("boon-") || name.StartsWith("guns-")) return "t-d96";
        bool phone = table && BoardLayout.Current.Phone;
        var sizes = table ? (phone ? TablePhone : TableDesk) : Hand;
        if (css <= 0) css = table ? BoardLayout.Current.Tcw : BoardLayout.Current.HandCard;
        int best = sizes[0];
        foreach (var w in sizes) if (Mathf.Abs(w - css) < Mathf.Abs(best - css)) best = w;
        return table ? $"t-{(phone ? "p" : "d")}{best}" : $"h-{best}";
    }

    /// <summary>A mark by name ("shields-3", "frozen", "fused-<id>-0", …) for a card `css` px wide: its picture and place.</summary>
    public static (Texture2D tex, Faces.Place at)? Get(string name, bool table, float css)
    {
        if (places == null)
        {
            places = new Dictionary<string, Faces.Place>();
            var json = Resources.Load<TextAsset>("Marks/places");
            if (json != null)
                foreach (var it in JsonUtility.FromJson<Items>(json.text).items)
                    places[it.k] = new Faces.Place { x = it.x, y = it.y, w = it.w, h = it.h };
        }
        var key = $"{Dir(name, table, css)}/{name}";
        if (!places.TryGetValue(key, out var at)) return null;
        if (!cache.TryGetValue(key, out var tex))
        {
            tex = Resources.Load<Texture2D>("Marks/" + key);
            if (tex != null) { tex.wrapMode = TextureWrapMode.Clamp; tex.anisoLevel = 4; }
            cache[key] = tex;
        }
        return tex != null ? (tex, at) : ((Texture2D, Faces.Place)?)null;
    }
}
