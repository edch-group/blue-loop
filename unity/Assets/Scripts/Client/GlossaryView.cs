using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using K = MenuKit;

/// <summary>
/// The glossary (app.ts renderGlossary): its sections down a pane on the left, the chosen section's page taking the
/// rest, scrolling. The pages themselves are the web game's own, baked whole (scripts/bake-glossary.mjs).
/// </summary>
public class GlossaryView : MonoBehaviour, MenuView.IRedraw
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

    public void Redraw() => Draw();

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var f = menu.Setup(root, "glossary", () => menu.Show("hub"));
        // (.glossary: the sections, 220 across (at least 150), then the page, clamp(12px, 2vw, 24px) apart, the body's
        // height.)
        float gap = K.Clamp(12, 2 * K.Vw, 24), navW = Mathf.Clamp(f.Right - f.Left - gap - 300, 150, 220);
        // The sections, down the left (.gl-nav: 72% white, corners 18, padded 6, 4 between, scrolling; each tab padded
        // 12 by 14, 10.24 spaced 0.22em; the one open white, lifted by a soft shadow).
        var nav = Hud.Box(root, "Sections", new Color(1, 1, 1, 0.72f), 18);
        Hud.Place(nav.rectTransform, f.Left, f.BodyTop, navW, f.BodyH);
        Hud.Shadow(nav, 18, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.06f), 6, 18));
        float tabH = 36;
        var tabs = K.Scroller(nav.transform, "Tabs", 0, 0, navW, f.BodyH, 12 + sections.Length * (tabH + 4) - 4);
        for (int i = 0; i < sections.Length; i++)
        {
            var s = sections[i];
            bool on = s.id == tab;
            var img = Hud.Box(tabs, s.id, Color.white, 12);
            var r = img.rectTransform;
            Hud.Place(r, 6, 6 + i * (tabH + 4), navW - 12, tabH);
            if (on) Hud.Shadow(img, 12, new Hud.Drop(Hud.Rgba(40, 46, 70, 0.12f), 2, 10));
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
            var l = K.Fill(r, s.name.ToUpperInvariant(), 10.24f, on ? Look.Ink : Look.InkSoft, true, 400, 0.22f, TextAlignmentOptions.Left);
            l.margin = new Vector4(14, 0, 4, 0);
            l.overflowMode = TextOverflowModes.Ellipsis;
        }
        // The section's page, scrolling inside its rounded panel (.gl-page: 60% white, corners 22, a faint ring and a
        // wide shadow, padded clamp(14px, 3vh, 26px)). The pages are the web game's own, baked whole at its width: drawn
        // to the panel's width, though never under two thirds of their size (a phone's narrow panel scrolls across too).
        float px = f.Left + navW + gap, pw = f.Right - px;
        var frame = Hud.Box(root, "Page", new Color(1, 1, 1, 0.6f), 22);
        var fr = frame.rectTransform;
        Hud.Place(fr, px, f.BodyTop, pw, f.BodyH);
        Hud.Shadow(frame, 22, new Hud.Drop(Hud.Rgba(58, 66, 86, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.08f), 14, 40));
        frame.raycastTarget = true;
        var viewport = Hud.Rect(fr, "Viewport");
        Hud.Fill(viewport);
        var vm = viewport.gameObject.AddComponent<Image>();
        Hud.Corner(vm, 22);
        viewport.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var tex = Pictures.Load("Glossary/" + tab);
        float bakedW = 1078.4f, pad = 0;
        float scale = Mathf.Max((pw - 2 * Mathf.Max(0, pad)) / bakedW, 0.66f), iw = bakedW * scale;
        float h = tex != null ? iw * tex.height / tex.width : f.BodyH;
        var content = Hud.Rect(viewport, "Content");
        content.anchorMin = content.anchorMax = content.pivot = new Vector2(0, 1);
        content.anchoredPosition = Vector2.zero;
        content.sizeDelta = new Vector2(Mathf.Max(pw, iw + 2 * Mathf.Max(0, pad)), Mathf.Max(f.BodyH, h + 2 * Mathf.Max(0, pad)));
        var pic = Hud.Rect(content, "Picture");
        Hud.Place(pic, Mathf.Max(0, pad) + Mathf.Max(0, (pw - 2 * Mathf.Max(0, pad) - iw) / 2), Mathf.Max(0, pad), iw, h);
        var raw = pic.gameObject.AddComponent<RawImage>();
        raw.texture = tex;
        raw.raycastTarget = false;
        var hit = content.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0.001f);
        var scroll = fr.gameObject.AddComponent<ScrollRect>();
        scroll.viewport = viewport;
        scroll.content = content;
        scroll.horizontal = iw + 2 * Mathf.Max(0, pad) > pw + 1;
        scroll.movementType = ScrollRect.MovementType.Elastic;
        scroll.elasticity = 0.08f;
        scroll.scrollSensitivity = 24;
    }
}
