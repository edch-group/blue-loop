using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The ship's page (campaign.ts renderHangar): the ship from above on the left (the menu's scene), each part's slot
/// marked on the ship itself, following it; every part found on the right, as its small 3D view; the part picked
/// below, with where it goes. Pick a part to light where it goes; tap a slot to fit it there (or, with nothing in
/// hand, to pick up what is fitted there, to see or remove).
/// </summary>
[ExecuteAlways]
public class HangarView : MonoBehaviour
{
    RectTransform root, marks;
    MenuView menu;
    CampaignBackdrop scene;
    string pick;
    readonly Dictionary<string, RectTransform> slotMarks = new Dictionary<string, RectTransform>();

    static readonly Dictionary<string, Color> RarityRing = new Dictionary<string, Color>
    {
        ["dwarf"] = new Color32(0x5f, 0x86, 0xb8, 255), ["stellar"] = new Color32(0xb8, 0x89, 0x2f, 255), ["anomaly"] = new Color32(0x7a, 0x5c, 0xc0, 255),
    };

    /// <summary>The page over its own (taken to fill the screen), laid out as the web lays it out at the screen's size, and again when that changes.</summary>
    public static HangarView Make(RectTransform parent, MenuView menu, CampaignBackdrop scene)
    {
        var layer = RefLayer.Make(parent, "Hangar");
        var r = layer.Rect;
        var v = r.gameObject.AddComponent<HangarView>();
        v.root = r;
        v.layer = layer;
        v.menu = menu;
        v.scene = scene;
        layer.Changed = v.Draw;
        v.Draw();
        return v;
    }

    RefLayer layer;

    const float Z = WebLook.Zoom;

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        slotMarks.Clear();
        var meta = CampaignView.LoadMeta();
        var fitted = meta.Fitted ?? new Dictionary<string, string>();
        var have = meta.Hangar ?? new List<string>();
        var fits = pick != null ? Parts.PartSlots(pick) : new List<string>();
        // The marks on the ship (.hg-mark): each slot a ring 30 across, dashed while empty (a pale dot in it), ringed in
        // its part's rarity once fitted; lit gold where the part in hand goes, the rest dimmed; its name beneath.
        marks = Hud.Rect(root, "Marks");
        Hud.Fill(marks);
        foreach (var sl in Parts.ShipSlots)
        {
            fitted.TryGetValue(sl.Id, out var there);
            var part = Parts.ShipPart(there);
            string state = pick != null && fits.Contains(sl.Id) && there != pick ? "lit" : pick != null ? "dim" : part != null ? "fitted" : "empty";
            float d = 30 * Z;
            var m = Hud.Rect(marks, sl.Id);
            m.anchorMin = m.anchorMax = new Vector2(0.5f, 0.5f);
            m.sizeDelta = new Vector2(d, d);
            var hit = m.gameObject.AddComponent<Image>();
            hit.sprite = Hud.Circle;
            hit.color = new Color(1, 1, 1, 0);
            var ringBox = Hud.Rect(m, "Ring");
            Hud.Fill(ringBox);
            if (state == "empty" || state == "dim")
            {
                var bg = Disc(ringBox, "Back", d, new Color(1, 1, 1, 0.72f));
                WebLook.Shadow(bg, 2 * Z, 8 * Z, new Color(40 / 255f, 50 / 255f, 70 / 255f, 0.18f), 999);
                var dash = Hud.Rect(ringBox, "Dashes");
                Hud.Fill(dash);
                var di = dash.gameObject.AddComponent<RawImage>();
                di.texture = DashedRing();
                di.color = WebLook.Hex("#8ea6c8");
                di.raycastTarget = false;
                Disc(ringBox, "Dot", d - 2 * 9 * Z, new Color(0x8e / 255f, 0xa6 / 255f, 0xc8 / 255f, 0.45f));
            }
            else if (state == "lit")
            {
                Disc(ringBox, "Border", d, WebLook.Hex("#d6bd7a"));
                Disc(ringBox, "Back", d - 2 * 2 * Z, new Color(1, 250 / 255f, 235 / 255f, 0.9f));
                Disc(ringBox, "Dot", d - 2 * 9 * Z, new Color(0xd6 / 255f, 0xbd / 255f, 0x7a / 255f, 0.9f));
                ringBox.gameObject.AddComponent<WebLook.Pulse>();
            }
            else
            {
                // (Fitted: a ring only, in its part's rarity, the part on the ship showing through it.)
                Disc(ringBox, "Rim", d, RarityRing.GetValueOrDefault(part.Rarity, RarityRing["dwarf"])).sprite = Ring15();
            }
            // Its name beneath (.hg-mark small): small spaced capitals on a wash of white.
            string name = (part != null ? part.Name : sl.Name).ToUpperInvariant();
            var tag = WebLook.Rounded(m, "Name", new Color(1, 1, 1, 0.8f), 6 * Z);
            var tt = WebLook.Words(tag.transform, name, 0.5f * 16 * Z, 0.14f, state == "empty" || state == "dim" ? Look.InkFaint : Look.Ink, true, 400);
            float tw = tt.GetPreferredValues(name).x + 2 * 6 * Z;
            var tr = tag.rectTransform;
            tr.anchorMin = tr.anchorMax = new Vector2(0.5f, 0.5f);
            tr.pivot = new Vector2(0.5f, 1);
            tr.anchoredPosition = new Vector2(0, -19 * Z);
            tr.sizeDelta = new Vector2(tw, 21);
            var cg = m.gameObject.AddComponent<CanvasGroup>();
            cg.alpha = state == "dim" ? 0.35f : 1;
            cg.blocksRaycasts = state != "dim";
            var id = sl.Id;
            m.gameObject.AddComponent<Button>().onClick.AddListener(() => Slot(id));
            slotMarks[sl.Id] = m;
        }
        Place();

        // The page (.hangar-panel): the right 42% of the screen beside the ship, the paper washing in over the land.
        var panel = Hud.Rect(root, "Panel");
        panel.anchorMin = new Vector2(0.58f, 0);
        panel.anchorMax = new Vector2(1, 1);
        panel.offsetMin = panel.offsetMax = Vector2.zero;
        var wash = panel.gameObject.AddComponent<RawImage>();
        wash.texture = Wash();
        wash.raycastTarget = false;
        // (.up-shop: padded max(14, the safe area) at the top (on a short screen max(8, ...)), max(18, ...) at the sides,
        // max(10, ...) at the foot.)
        var sa = layer.Insets;
        bool phone = Css.MaxHeight(560);
        float padT = Mathf.Max((phone ? 8 : 14) * Z, sa.x), padB = Mathf.Max(10 * Z, sa.z);
        float px = 0.58f * layer.W + Mathf.Max(18 * Z, sa.w), pw = layer.W - px - Mathf.Max(18 * Z, sa.y), mid = px + pw / 2;
        WebLook.UpBack(root, () => menu.Show("campaign"), px, padT);
        // (.up-title-big: SHIP (clamp(1.6rem, 5.4vh, 2.6rem)), and 6 under it (on a short screen 2) how many parts are
        // found of how many.)
        // (The title's line box 1.25 its size; the count's row under it, the gap below.)
        float ts = Css.Clamp(1.6f * 16 * Z, 5.4f * layer.H / 100, 2.6f * 16 * Z), py = padT + ts * 1.25f + (phone ? 2 : 6) * Z;
        var title = WebLook.Words(WebLook.Box(root, "Title", px, padT - ts * 0.05f, pw, ts * 1.26f), "SHIP", ts, 0.5f, Look.Ink, true, 400);
        // (Its text-indent as wide as the letter-spacing trailing its last letter: the words centred as they are.)
        var count = WebLook.Words(Hud.Fill(Hud.Rect(root, "Found")), have.Count.ToString(), 1.15f * 16 * Z, 0, Look.Ink, true, 500, TextAlignmentOptions.Left);
        var of = WebLook.Words(Hud.Fill(Hud.Rect(root, "Of")), $"OF {Parts.ShipParts.Count} PARTS FOUND", 0.56f * 16 * Z, 0.22f, Look.InkFaint, true, 400, TextAlignmentOptions.Left);
        float cw = count.GetPreferredValues(count.text).x, ow = of.GetPreferredValues(of.text).x, x0 = mid - (cw + 10 * Z + ow) / 2;
        // (.up-xp: a row as tall as the count's line box (1.15rem at 1.25), the words centred on it.)
        float rowH = 1.15f * 16 * Z * 1.25f, ofH = 0.56f * 16 * Z * 1.25f;
        WebLook.Box((RectTransform)count.transform, x0, py, cw + 4, rowH);
        WebLook.Box((RectTransform)of.transform, x0 + cw + 10 * Z, py + (rowH - ofH) / 2, ow + 8, ofH);
        // Every part found (.hg-parts): its turning 3D view, its name; fitted, marked so; picked, ringed in gold.
        var owned = Parts.ShipParts.Where(p => have.Contains(p.Id)).ToList();
        var on = new HashSet<string>(fitted.Values.Where(v => v != null));
        // The part picked at the foot (as tall as its words make it), the grid filling the page between.
        float detailH = Detail(px, pw, padB, fitted, have, phone);
        // (Under the header: .hg-body padded 6 4, .hg-parts padded 2; above the detail at the foot, scrolling between.)
        float gx = px + 6 * Z, gw = pw - 12 * Z;
        float gy = py + rowH + 8 * Z, gh = Mathf.Max(40, layer.H - padB - detailH - 8 * Z - gy);
        if (owned.Count == 0)
        {
            var none = WebLook.Words(WebLook.Box(root, "None", gx, gy, gw, 30), "No parts yet.", 0.85f * 16 * Z, 0, Look.InkFaint, false, 400, TextAlignmentOptions.TopLeft);
            none.raycastTarget = false;
        }
        // (.hg-part: padded 8 6, its 3D view 64, a 4 gap, its name (0.5rem at 1.3), and fitted: 4 more and "fitted"
        // (0.6rem). Every tile in a row as tall as the row's tallest: the spare split between a tile's two rows, its
        // name starting half of it lower.)
        float gap = 8 * Z, minW = 104 * Z, nameH = 0.5f * 16 * Z * 1.3f, fitH = 0.6f * 16 * Z * 1.25f;
        int cols = Mathf.Max(1, Mathf.FloorToInt((gw + gap) / (minW + gap)));
        float tileW = (gw - (cols - 1) * gap) / cols, tileH = 8 * Z + 64 * Z + 4 * Z + nameH + 8 * Z;
        int rowsN = (owned.Count + cols - 1) / cols;
        var rowHs = new float[rowsN];
        var rowYs = new float[rowsN];
        float need = 0;
        for (int r = 0; r < rowsN; r++)
        {
            bool anyFit = owned.Skip(r * cols).Take(cols).Any(q => on.Contains(q.Id));
            rowHs[r] = tileH + (anyFit ? 4 * Z + fitH : 0);
            rowYs[r] = need;
            need += rowHs[r] + (r < rowsN - 1 ? gap : 0);
        }
        need += 12;
        // (A margin round the grid for the tiles' rings and shadows.)
        var area = WebLook.Box(root, "Parts", gx - 6, gy - 6, gw + 12, gh + 6);
        var grid = owned.Count > 0 && need > gh ? StationKit.Scroller(area, need + 6) : area;
        for (int i = 0; i < owned.Count; i++)
        {
            var p = owned[i];
            bool fit = on.Contains(p.Id);
            int row = i / cols;
            float h = rowHs[row], spare = fit ? 0 : (h - tileH) / 2;
            var tile = WebLook.Rounded(grid, p.Id, fit ? WebLook.Hex("#f6f9fd") : Color.white, 12 * Z);
            tile.raycastTarget = true;
            WebLook.Box(tile.rectTransform, 6 + (i % cols) * (tileW + gap), 6 + rowYs[row], tileW, h);
            if (pick == p.Id) WebLook.Shadow(tile, 3 * Z, 10 * Z, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.12f), 12 * Z, 2.5f * Z, WebLook.Hex("#d6bd7a"));
            else WebLook.Shadow(tile, 3 * Z, 8 * Z, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.06f), 12 * Z, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.1f));
            var icon = WebLook.Box(tile.transform, "Icon", (tileW - 64 * Z) / 2, 8 * Z, 64 * Z, 64 * Z);
            var ii = icon.gameObject.AddComponent<RawImage>();
            ii.texture = Resources.Load<Texture2D>($"Icons/part-{p.Kind}-{p.Rarity}");
            ii.raycastTarget = false;
            var nm = WebLook.Words(WebLook.Box(tile.transform, "Name", 6 * Z, 8 * Z + 64 * Z + spare + 4 * Z, tileW - 12 * Z, nameH), p.Name.ToUpperInvariant(), 0.5f * 16 * Z, 0.14f, Look.Ink, true, 500);
            nm.raycastTarget = false;
            if (fit) WebLook.Words(WebLook.Box(tile.transform, "Fitted", 6 * Z, tileH - 8 * Z + 4 * Z, tileW - 12 * Z, fitH), "fitted", 0.6f * 16 * Z, 0, Look.InkFaint, false, 400).raycastTarget = false;
            var id = p.Id;
            tile.gameObject.AddComponent<Button>().onClick.AddListener(() => { pick = pick == id ? null : id; Sound.Play("hover"); Draw(); });
        }
    }

    /// <summary>
    /// The part picked (.hp-detail), at the foot of the page: its name and what it does, and where it goes (or, fitted
    /// there, remove); none picked, a hint in faint words. Its height (min 56, padded 10 16; on a short screen min 44,
    /// padded 6 12) as its words make it, returned.
    /// </summary>
    float Detail(float px, float pw, float padB, Dictionary<string, string> fitted, List<string> have, bool phone)
    {
        float padY = (phone ? 6 : 10) * Z, padX = (phone ? 12 : 16) * Z, minH = (phone ? 44 : 56) * Z;
        var box = WebLook.Rounded(root, "Detail", Color.white, 16 * Z);
        box.raycastTarget = true;
        WebLook.Shadow(box, 6 * Z, 18 * Z, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.1f), 16 * Z, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.1f));
        var p = Parts.ShipPart(pick);
        if (p == null)
        {
            WebLook.Box(box.rectTransform, px, layer.H - padB - minH, pw, minH);
            WebLook.Words(box.transform, have.Count > 0 ? "Pick a part, then its slot." : "Parts are found on runs: every boss leaves one.", 0.8f * 16 * Z, 0, Look.InkFaint, false, 400);
            return minH;
        }
        var where = Parts.ShipSlots.Where(sl => sl.Kind == p.Kind).ToList();
        // (Its buttons (.btn / .btn-primary): padded 9 16 inside a 1px border, 0.66rem words at 1.25, right of the words
        // a 16 gap, 8 between them.)
        float bh = 0.66f * 16 * Z * 1.25f + 2 * 9 * Z + 2 * Z;
        float x = pw - padX;
        var buttons = new List<RectTransform>();
        foreach (var sl in Enumerable.Reverse(where))
        {
            bool here = fitted.TryGetValue(sl.Id, out var f) && f == p.Id;
            var label = here ? "remove" : where.Count > 1 ? sl.Name.Replace(" weapon", "") : "fit";
            var id = sl.Id;
            var b = WebLook.Button(box.transform, label, () => { if (here) Clear(id); else Slot(id); }, !here, 0.66f * 16 * Z, 0.14f);
            var t = b.GetComponentInChildren<TextMeshProUGUI>();
            float bw = t.GetPreferredValues(t.text).x + 2 * 16 * Z + 2 * Z;
            var br = (RectTransform)b.transform;
            br.anchorMin = br.anchorMax = br.pivot = new Vector2(1, 0.5f);
            br.anchoredPosition = new Vector2(-(pw - x), 0);
            br.sizeDelta = new Vector2(bw, bh);
            x -= bw + 8 * Z;
        }
        float tw = x + 8 * Z - 16 * Z - padX;
        var name = WebLook.Words(box.transform, p.Name.ToUpperInvariant(), 0.7f * 16 * Z, 0.22f, Look.Ink, true, 500, TextAlignmentOptions.TopLeft);
        var what = WebLook.Words(box.transform, p.Text, 0.82f * 16 * Z, 0, Look.InkSoft, false, 400, TextAlignmentOptions.TopLeft);
        what.textWrappingMode = TextWrappingModes.Normal;
        // (The name sits on a line of the page's own words (19 tall, the name 5 down it), the text 3 under that line.)
        float lineH = 19 * Z, wh = Mathf.Max(0.82f * 16 * Z * 1.25f, what.GetPreferredValues(p.Text, tw, 0).y), all = lineH + 3 * Z + wh;
        float dh = Mathf.Max(minH, Mathf.Max(all, bh) + 2 * padY), top = (dh - all) / 2;
        WebLook.Box(box.rectTransform, px, layer.H - padB - dh, pw, dh);
        WebLook.Box(name.rectTransform, padX, top + 5 * Z, tw, 0.7f * 16 * Z * 1.25f);
        WebLook.Box(what.rectTransform, padX, top + lineH + 3 * Z, tw, wh + 2);
        return dh;
    }

    /// <summary>A disc centred in its parent, at a size.</summary>
    static Image Disc(RectTransform parent, string name, float size, Color colour)
    {
        var r = Hud.Rect(parent, name);
        Hud.At(r, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size, size));
        var img = r.gameObject.AddComponent<Image>();
        img.sprite = Hud.Circle;
        img.color = colour;
        img.raycastTarget = false;
        return img;
    }

    static Texture2D dashed, wash;
    static Sprite ring15;

    /// <summary>A mark's dashed rim (a 1.5 dashed border round a 30 circle), white to tint.</summary>
    static Texture2D DashedRing()
    {
        if (dashed != null) return dashed;
        const int S = 96;
        dashed = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        float w = 1.5f / 30 * S, rad = S / 2f - w / 2;
        const int dashes = 16;
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                var p = new Vector2(x + 0.5f - S / 2f, y + 0.5f - S / 2f);
                float d = Mathf.Abs(p.magnitude - rad);
                float a = (Mathf.Atan2(p.y, p.x) / (Mathf.PI * 2) + 1) % 1 * dashes, f = a - Mathf.Floor(a);
                float on = Mathf.Clamp01(Mathf.Min(f, 0.55f - f) * rad * Mathf.PI * 2 / dashes + 0.5f);
                dashed.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(w / 2 - d + 0.5f) * on));
            }
        dashed.Apply();
        return dashed;
    }

    /// <summary>A fitted mark's rim: a solid ring 1.5 wide round a 30 circle, white to tint.</summary>
    static Sprite Ring15()
    {
        if (ring15 != null) return ring15;
        const int S = 96;
        var t = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        float w = 1.5f / 30 * S, rad = S / 2f - w / 2;
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float d = Mathf.Abs(new Vector2(x + 0.5f - S / 2f, y + 0.5f - S / 2f).magnitude - rad);
                t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(w / 2 - d + 0.5f)));
            }
        t.Apply();
        return ring15 = Sprite.Create(t, new Rect(0, 0, S, S), new Vector2(0.5f, 0.5f));
    }

    /// <summary>The page's wash over the land: #fbfbfc, nothing at its left edge, 0.88 by 9% across, 0.94 at its right.</summary>
    static Texture2D Wash()
    {
        if (wash != null) return wash;
        wash = new Texture2D(64, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var c = WebLook.Hex("#fbfbfc");
        for (int x = 0; x < 64; x++)
        {
            float k = (x + 0.5f) / 64;
            wash.SetPixel(x, 0, new Color(c.r, c.g, c.b, k < 0.09f ? 0.88f * k / 0.09f : Mathf.Lerp(0.88f, 0.94f, (k - 0.09f) / 0.91f)));
        }
        wash.Apply();
        return wash;
    }

    void Slot(string slot)
    {
        var meta = CampaignView.LoadMeta();
        if (pick != null && Parts.PartSlots(pick).Contains(slot))
        {
            CampaignView.SaveMeta(Meta.FitPart(meta, slot, pick));
            Sound.Play("upgrade");
            scene?.Refit();
        }
        else if (meta.Fitted != null && meta.Fitted.TryGetValue(slot, out var on) && on != null)
        {
            pick = on;
            Sound.Play("hover");
        }
        Draw();
    }

    void Clear(string slot)
    {
        CampaignView.SaveMeta(Meta.FitPart(CampaignView.LoadMeta(), slot, null));
        Sound.Play("hover");
        scene?.Refit();
        Draw();
    }

    void LateUpdate() => Place();

    /// <summary>Each mark on its slot, wherever the ship is now.</summary>
    public void Place()
    {
        if (scene == null || marks == null) return;
        var cam = GetComponentInParent<Canvas>()?.worldCamera;
        foreach (var kv in slotMarks)
        {
            var at = scene.SlotScreen(kv.Key);
            if (at == null || kv.Value == null) continue;
            if (RectTransformUtility.ScreenPointToLocalPointInRectangle(marks, at.Value, cam, out var local)) kv.Value.anchoredPosition = local;
        }
    }
}
