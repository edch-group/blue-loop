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

    static string Describe(Transform t)
    {
        var sb = new StringBuilder($"{t.GetSiblingIndex()}:{t.name} active={t.gameObject.activeInHierarchy} layer={t.gameObject.layer} scale={t.localScale.x:0.##}");
        var g = t.GetComponent<Graphic>();
        if (g != null) sb.Append($" {g.GetType().Name} color={g.color} mat={(g.material != null ? g.material.name + "/" + g.material.shader.name : "null")} enabled={g.enabled}");
        if (g is TMP_Text tx) sb.Append($" text='{tx.text}' alpha={tx.alpha} font={tx.font?.name} verts={tx.textInfo?.characterCount}");
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
