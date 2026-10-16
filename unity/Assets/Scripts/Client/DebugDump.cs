using System.Text;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>A UI tree written to the log once (what draws, in what order, with what): for faults seen only in a build.</summary>
public static class DebugDump
{
    public static void Tree(Transform t, string why)
    {
        var sb = new StringBuilder($"UI tree ({why}):\n");
        Walk(t, 0, sb);
        // (Up the parents too: groups and canvases above it change how it draws.)
        for (var p = t.parent; p != null; p = p.parent) sb.Append($"  ^ {Describe(p)}\n");
        Debug.Log(sb.ToString());
    }

    static void Walk(Transform t, int depth, StringBuilder sb)
    {
        sb.Append(new string(' ', depth * 2)).Append(Describe(t)).Append('\n');
        if (depth < 4) foreach (Transform c in t) Walk(c, depth + 1, sb);
    }

    static string Props(Material m)
    {
        var sb = new StringBuilder();
        foreach (var p in new[] { "_ScaleRatioA", "_FaceDilate", "_OutlineSoftness", "_OutlineWidth", "_Sharpness", "_GradientScale", "_WeightNormal", "_UnderlaySoftness" })
            if (m.HasProperty(p)) sb.Append($" {p.Substring(1)}={m.GetFloat(p):0.###}");
        sb.Append($" kw=[{string.Join(",", m.shaderKeywords)}]");
        return sb.ToString();
    }

    static string Describe(Transform t)
    {
        var sb = new StringBuilder($"{t.GetSiblingIndex()}:{t.name} active={t.gameObject.activeInHierarchy} layer={t.gameObject.layer} scale={t.localScale.x:0.##}");
        var g = t.GetComponent<Graphic>();
        if (g != null) sb.Append($" {g.GetType().Name} color={g.color} mat={(g.material != null ? g.material.name + "/" + g.material.shader.name : "null")} enabled={g.enabled}");
        if (g is TMP_Text tx)
        {
            sb.Append($" text='{tx.text}' alpha={tx.alpha} font={tx.font?.name} chars={tx.textInfo?.characterCount}");
            var m = tx.fontSharedMaterial;
            if (m != null) sb.Append($" shared={m.name}/{m.shader?.name} id={m.GetInstanceID()}{Props(m)}");
            var crm = t.GetComponent<CanvasRenderer>();
            if (crm != null && crm.materialCount > 0 && crm.GetMaterial(0) != null) { var rm = crm.GetMaterial(0); sb.Append($" drawn={rm.name}/{rm.shader?.name}{Props(rm)}"); }
            sb.Append($" lossy={t.lossyScale.y:0.#####}");
            if (tx.mesh != null && tx.mesh.vertexCount > 0)
            {
                var u0 = new System.Collections.Generic.List<Vector4>();
                var u1 = new System.Collections.Generic.List<Vector4>();
                tx.mesh.GetUVs(0, u0);
                tx.mesh.GetUVs(1, u1);
                sb.Append($" uv0={(u0.Count > 0 ? u0[0].ToString("F4") : "-")} uv1={(u1.Count > 0 ? u1[0].ToString("F4") : "-")} vcol={(tx.mesh.colors32.Length > 0 ? tx.mesh.colors32[0].ToString() : "-")}");
            }
        }
        var cr = t.GetComponent<CanvasRenderer>();
        if (cr != null) sb.Append($" crAlpha={cr.GetAlpha()} inherited={cr.GetInheritedAlpha()} cull={cr.cull}");
        var cg = t.GetComponent<CanvasGroup>();
        if (cg != null) sb.Append($" group={cg.alpha} ignore={cg.ignoreParentGroups}");
        var cv = t.GetComponent<Canvas>();
        if (cv != null) sb.Append($" CANVAS mode={cv.renderMode} override={cv.overrideSorting} order={cv.sortingOrder} cam={(cv.worldCamera != null ? cv.worldCamera.name : "-")}");
        if (t.GetComponent<RectMask2D>() != null) sb.Append(" RectMask2D");
        if (t.GetComponent<Mask>() != null) sb.Append(" Mask");
        return sb.ToString();
    }
}
