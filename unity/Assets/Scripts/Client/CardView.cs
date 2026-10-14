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

    void Update()
    {
        float k = 1 - Mathf.Exp(-Time.deltaTime * 12);
        transform.localPosition = Vector3.Lerp(transform.localPosition, goalPos, k);
        transform.localRotation = Quaternion.Slerp(transform.localRotation, goalRot, k);
        transform.localScale = Vector3.Lerp(transform.localScale, goalScale, k);
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
        transform.localPosition = goalPos;
        transform.localRotation = goalRot;
        transform.localScale = goalScale;
    }
}
