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
        menu.SetupTop(root, "glossary", () => menu.Show("hub"));
        // The sections, down the left (the web's .gl-nav: 319 by 766, corners 26.1; each tab 301.6 by 53.8, 59.6
        // apart, its name 14.8 spaced 0.22em; the one open white, lifted by a soft shadow).
        var nav = Hud.Box(root, "Sections", new Color(1, 1, 1, 0.72f), 26.1f);
        Hud.Place((RectTransform)nav.transform, 26.1f, 122.8f, 319, 766);
        Hud.Shadow(nav, 26.1f, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1.4f), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.06f), 8.7f, 26.1f));
        for (int i = 0; i < sections.Length; i++)
        {
            var s = sections[i];
            bool on = s.id == tab;
            var img = Hud.Box(nav.transform, s.id, Color.white, 17.4f);
            var r = (RectTransform)img.transform;
            Hud.Place(r, 8.7f, 8.7f + i * 59.6f, 301.6f, 53.8f);
            if (on) Hud.Shadow(img, 17.4f, new Hud.Drop(Hud.Rgba(40, 46, 70, 0.12f), 2.9f, 14.5f));
            img.raycastTarget = true;
            var b = r.gameObject.AddComponent<Button>();
            if (!on)
            {
                // (Clear, and a faint blue under the pointer, as the web's.)
                var colors = b.colors;
                colors.normalColor = new Color(1, 1, 1, 0);
                colors.highlightedColor = Hud.Rgba(95, 143, 196, 0.08f);
                colors.pressedColor = Hud.Rgba(95, 143, 196, 0.14f);
                colors.selectedColor = new Color(1, 1, 1, 0);
                b.colors = colors;
            }
            var id = s.id;
            b.onClick.AddListener(() => { Sound.Play("click"); tab = id; Draw(); });
            var l = Hud.Label(r, s.name.ToUpperInvariant(), 14.8f, on ? Look.Ink : Look.InkSoft, true, 400, 22, TextAlignmentOptions.Left);
            l.margin = new Vector4(20.3f, 0, 0, 0);
        }
        // The section's page, scrolling inside its rounded panel (the web's .gl-page: 1196.8 by 766, 60% white,
        // corners 31.9, a faint ring and a wide shadow).
        var frame = Hud.Box(root, "Page", new Color(1, 1, 1, 0.6f), 31.9f);
        var fr = (RectTransform)frame.transform;
        Hud.Place(fr, 377.1f, 122.8f, 1196.8f, 766);
        Hud.Shadow(frame, 31.9f, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1.4f), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.08f), 20.3f, 58));
        frame.raycastTarget = true;
        var viewport = Hud.Rect(fr, "Viewport");
        Hud.Fill(viewport);
        var vm = viewport.gameObject.AddComponent<Image>();
        Hud.Corner(vm, 31.9f);
        viewport.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var tex = Pictures.Load("Glossary/" + tab);
        var content = Hud.Rect(viewport, "Content");
        content.anchorMin = new Vector2(0, 1);
        content.anchorMax = new Vector2(1, 1);
        content.pivot = new Vector2(0.5f, 1);
        content.anchoredPosition = Vector2.zero;
        float h = tex != null ? 1196.8f * tex.height / tex.width : 766;
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
