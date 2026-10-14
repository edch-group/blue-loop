using TMPro;
using UnityEngine;

/// <summary>Materials from the game's shaders (Resources/Shaders), and the flat quads and text everything is built of.</summary>
public static class Mats
{
    public static Material Make(string shader, Color? color = null)
    {
        var m = new Material(Shader.Find("BlueLoop/" + shader));
        if (color != null) m.color = color.Value;
        return m;
    }

    /// <summary>Destroy an object, in play or (for the editor's screenshots) out of it.</summary>
    public static void Kill(Object o)
    {
        if (o == null) return;
        if (Application.isPlaying) Object.Destroy(o);
        else Object.DestroyImmediate(o);
    }

    /// <summary>A quad lying flat (facing up), `w` wide and `h` deep, its top edge away from the viewer.</summary>
    public static MeshRenderer Flat(string name, Transform parent, Material m, float w, float h, float lift = 0)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
        Kill(go.GetComponent<Collider>());
        go.name = name;
        go.transform.SetParent(parent, false);
        go.transform.localRotation = Quaternion.Euler(90, 0, 0);
        go.transform.localPosition = new Vector3(0, lift, 0);
        go.transform.localScale = new Vector3(w, h, 1);
        var r = go.GetComponent<MeshRenderer>();
        r.sharedMaterial = m;
        r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        r.receiveShadows = false;
        return r;
    }

    /// <summary>Text lying flat on the table, in the game's type.</summary>
    public static TextMeshPro FlatText(string name, Transform parent, string text, float size, Color color, bool display = true, int weight = 500, float spacing = 0, TextAlignmentOptions align = TextAlignmentOptions.Center)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent, false);
        go.transform.localRotation = Quaternion.Euler(90, 0, 0);
        var t = go.AddComponent<TextMeshPro>();
        Look.Style(t, size, color, display, weight, spacing, align);
        t.text = text;
        t.rectTransform.sizeDelta = new Vector2(6, 1);
        return t;
    }
}
