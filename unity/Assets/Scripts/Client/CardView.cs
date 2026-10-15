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

    public static CardView Make(Transform parent, string uid, string defId, bool table)
    {
        var go = new GameObject($"Card {defId}");
        go.transform.SetParent(parent, false);
        var v = go.AddComponent<CardView>();
        v.Uid = uid;
        v.Table = table;
        v.shadow = Mats.Flat("Shadow", go.transform, Mats.Make("Soft", new Color(0.25f, 0.27f, 0.33f, 0.22f)), 1.5f, 1.9f, -0.002f);
        v.shadow.sharedMaterial.SetFloat("_Aspect", 1.9f / 1.5f);
        v.shadow.sharedMaterial.SetFloat("_Size", 0.36f);
        v.shadow.sharedMaterial.SetFloat("_Soft", 0.09f);
        v.shadow.transform.localPosition = new Vector3(0.02f, -0.002f, -0.07f);
        v.shadow.sharedMaterial.renderQueue = 2990;
        v.rim = Mats.Flat("Rim", go.transform, Mats.Make("Soft", new Color(0, 0, 0, 0)), 1.36f, 1.76f, -0.001f);
        v.rim.sharedMaterial.SetFloat("_Aspect", 1.76f / 1.36f);
        v.rim.sharedMaterial.SetFloat("_Size", 0.37f);
        v.rim.sharedMaterial.SetFloat("_Soft", 0.035f);
        v.rim.sharedMaterial.renderQueue = 2995;
        v.face = Mats.Flat("Face", go.transform, Mats.Make("Card"), 1, 1.4f);
        v.face.sharedMaterial.renderQueue = 3000;
        var col = go.AddComponent<BoxCollider>();
        col.size = new Vector3(1, 0.05f, 1.4f);
        v.SetCard(defId);
        return v;
    }

    public void SetCard(string defId)
    {
        if (defId == DefId) return;
        DefId = defId;
        face.sharedMaterial.mainTexture = Faces.Of(defId, Table);
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

    public void Dimmed(bool on) => face.sharedMaterial.SetFloat("_Grey", on ? 0.75f : 0);

    /// <summary>Its rim: none, or a colour (playable green, picked blue, aimed red), soft or strong.</summary>
    public void Rim(Color? c, float strength = 1)
    {
        var col = c ?? new Color(0, 0, 0, 0);
        if (c != null) col.a = 0.85f * strength;
        rim.sharedMaterial.color = col;
    }

    /// <summary>A badge (atk, atk-dim, stab, stab-low, def, guard) with its value, or none (n null).</summary>
    public void Badge(string slot, string kind, int? n)
    {
        if (!badges.TryGetValue(slot, out var r))
        {
            // (Nothing to show, and never shown: nothing to make.)
            if (n == null) return;
            var p = slot == "atk" ? Faces.Where.atk : slot == "stab" ? Faces.Where.stab : kind == "guard" ? Faces.Where.guard : Faces.Where.def;
            r = Mats.Flat(slot, transform, Mats.Make("Card"), p.w, p.h, 0.004f);
            r.sharedMaterial.SetFloat("_Radius", 0);
            r.sharedMaterial.SetFloat("_Aspect", p.h / p.w);
            r.sharedMaterial.renderQueue = 3010;
            r.transform.localPosition = new Vector3(-0.5f + p.x + p.w / 2, 0.004f, 0.7f - (p.y + p.h / 2));
            badges[slot] = r;
        }
        r.gameObject.SetActive(n != null);
        if (n != null) r.sharedMaterial.mainTexture = Faces.Badge(kind, n.Value);
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
        if (shakeAge >= 0) o += new Vector3(Mathf.Sin(shakeAge * 70) * 0.06f * (1 - shakeAge / ShakeTime), 0, 0);
        return o;
    }

    void Update()
    {
        if (Time.time < holdUntil) return;
        float k = 1 - Mathf.Exp(-Time.deltaTime * 12);
        var at = transform.localPosition - applied;
        at = Vector3.Lerp(at, goalPos, k);
        transform.localRotation = Quaternion.Slerp(transform.localRotation, goalRot, k);
        transform.localScale = Vector3.Lerp(transform.localScale, goalScale, k);
        if (lungeAge >= 0) { lungeAge += Time.deltaTime; if (lungeAge > LungeTime) lungeAge = -1; }
        if (shakeAge > -10) { shakeAge += Time.deltaTime; if (shakeAge > ShakeTime) shakeAge = -11; }
        applied = Offset();
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
