using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The glossary (app.ts renderGlossary): its sections down a pane on the left, the chosen section's page taking the
/// rest, scrolling. The pages themselves are the web game's own, baked whole (scripts/bake-glossary.mjs).
/// </summary>
public class GlossaryView : MonoBehaviour
{
    [System.Serializable] class Section { public string id, name; }
    [System.Serializable] class Index { public Section[] items; }

    RectTransform root, pane;
    MenuView menu;
    Section[] sections;
    string tab = "basics";

    public static GlossaryView Make(RectTransform parent, MenuView menu)
    {
        var r = Hud.Rect(parent, "Glossary");
        Hud.Fill(r);
        var v = r.gameObject.AddComponent<GlossaryView>();
        v.root = r;
        v.menu = menu;
        v.sections = JsonUtility.FromJson<Index>("{\"items\":" + Resources.Load<TextAsset>("Glossary/index").text + "}").items;
        v.Draw();
        return v;
    }

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var back = Hud.Pill(root, "‹ Back", () => menu.Show("hub"), 15);
        Hud.At((RectTransform)back.transform, new Vector2(0, 1), new Vector2(26, -36), new Vector2(92, 40));
        var title = Hud.Label(root, "GLOSSARY", 32, Look.Ink, true, 500, 40, TextAlignmentOptions.Top);
        title.margin = new Vector4(0, 36, 0, 0);
        menu.Chip(root);
        // The sections, down the left.
        var nav = Hud.Glass(root, "Sections", new Color(1, 1, 1, 0.72f));
        Hud.At((RectTransform)nav.transform, new Vector2(0, 1), new Vector2(26, -122), new Vector2(318, 766));
        for (int i = 0; i < sections.Length; i++)
        {
            var s = sections[i];
            bool on = s.id == tab;
            var r = Hud.Rect(nav.transform, s.id);
            Hud.At(r, new Vector2(0.5f, 1), new Vector2(0, -10 - i * 58), new Vector2(302, 52));
            var img = r.gameObject.AddComponent<Image>();
            img.sprite = Hud.Rounded;
            img.type = Image.Type.Sliced;
            img.color = on ? Color.white : new Color(1, 1, 1, 0.001f);
            var id = s.id;
            r.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); tab = id; Draw(); });
            var l = Hud.Label(r, s.name.ToUpperInvariant(), 15, on ? Look.Ink : Look.InkSoft, true, 500, 26, TextAlignmentOptions.Left);
            l.margin = new Vector4(22, 0, 0, 0);
        }
        // The section's page, scrolling inside its rounded panel.
        var frame = Hud.Glass(root, "Page", Color.white);
        var fr = (RectTransform)frame.transform;
        Hud.At(fr, new Vector2(1, 1), new Vector2(-26, -122), new Vector2(1198, 766));
        var viewport = Hud.Rect(fr, "Viewport");
        Hud.Fill(viewport);
        var vm = viewport.gameObject.AddComponent<Image>();
        vm.sprite = Hud.Rounded;
        vm.type = Image.Type.Sliced;
        viewport.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var tex = Pictures.Load("Glossary/" + tab);
        var content = Hud.Rect(viewport, "Content");
        content.anchorMin = new Vector2(0, 1);
        content.anchorMax = new Vector2(1, 1);
        content.pivot = new Vector2(0.5f, 1);
        content.anchoredPosition = Vector2.zero;
        float h = tex != null ? 1198f * tex.height / tex.width : 766;
        content.sizeDelta = new Vector2(0, Mathf.Max(766, h));
        var pic = Hud.Rect(content, "Picture");
        pic.anchorMin = new Vector2(0, 1);
        pic.anchorMax = new Vector2(1, 1);
        pic.pivot = new Vector2(0.5f, 1);
        pic.anchoredPosition = Vector2.zero;
        pic.sizeDelta = new Vector2(0, h);
        var raw = pic.gameObject.AddComponent<RawImage>();
        raw.texture = tex;
        raw.raycastTarget = false;
        var hit = content.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0.001f);
        var scroll = fr.gameObject.AddComponent<ScrollRect>();
        scroll.viewport = viewport;
        scroll.content = content;
        scroll.horizontal = false;
        scroll.movementType = ScrollRect.MovementType.Clamped;
        scroll.scrollSensitivity = 40;
    }
}
