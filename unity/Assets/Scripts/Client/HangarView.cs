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

    public static HangarView Make(RectTransform parent, MenuView menu, CampaignBackdrop scene)
    {
        var r = Hud.Rect(parent, "Hangar");
        Hud.Fill(r);
        var v = r.gameObject.AddComponent<HangarView>();
        v.root = r;
        v.menu = menu;
        v.scene = scene;
        v.Draw();
        return v;
    }

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        slotMarks.Clear();
        var meta = CampaignView.LoadMeta();
        var fitted = meta.Fitted ?? new Dictionary<string, string>();
        var have = meta.Hangar ?? new List<string>();
        var fits = pick != null ? Parts.PartSlots(pick) : new List<string>();
        // The marks on the ship: each slot, dashed while empty, ringed in its part's rarity once fitted; lit where the
        // part in hand goes, the rest dimmed.
        marks = Hud.Rect(root, "Marks");
        Hud.Fill(marks);
        foreach (var sl in Parts.ShipSlots)
        {
            fitted.TryGetValue(sl.Id, out var on);
            var part = Parts.ShipPart(on);
            string state = pick != null && fits.Contains(sl.Id) && on != pick ? "lit" : pick != null ? "dim" : part != null ? "fitted" : "empty";
            var m = Hud.Rect(marks, sl.Id);
            m.anchorMin = m.anchorMax = new Vector2(0.5f, 0.5f);
            m.sizeDelta = new Vector2(30, 30);
            var ring = m.gameObject.AddComponent<Image>();
            ring.sprite = Hud.Circle;
            ring.color = state == "lit" ? new Color32(0xd6, 0xbd, 0x7a, 255) : state == "fitted" ? RarityRing.GetValueOrDefault(part.Rarity, RarityRing["dwarf"]) : new Color32(0x8e, 0xa6, 0xc8, 255);
            var inner = Hud.Rect(m, "Inner");
            Hud.Fill(inner);
            float w = state == "lit" ? 2 : 1.5f;
            inner.offsetMin = new Vector2(w, w);
            inner.offsetMax = new Vector2(-w, -w);
            var ii = inner.gameObject.AddComponent<Image>();
            ii.sprite = Hud.Circle;
            ii.color = state == "lit" ? new Color(1, 0.98f, 0.92f, 0.9f) : state == "fitted" ? new Color(1, 1, 1, 0.15f) : new Color(1, 1, 1, 0.72f);
            ii.raycastTarget = false;
            if (state != "fitted")
            {
                var dot = Hud.Rect(m, "Dot");
                Hud.At(dot, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(12, 12));
                var di = dot.gameObject.AddComponent<Image>();
                di.sprite = Hud.Circle;
                di.color = state == "lit" ? new Color32(0xd6, 0xbd, 0x7a, 230) : new Color(0x8e / 255f, 0xa6 / 255f, 0xc8 / 255f, 0.45f);
                di.raycastTarget = false;
            }
            var tag = Hud.Glass(m, "Name", new Color(1, 1, 1, 0.8f), false);
            var tr = (RectTransform)tag.transform;
            string name = (part != null ? part.Name : sl.Name).ToUpperInvariant();
            Hud.At(tr, new Vector2(0.5f, 0), new Vector2(0, -24), new Vector2(16 + name.Length * 8, 20));
            tr.pivot = new Vector2(0.5f, 1);
            Hud.Label(tag.transform, name, 9, state == "empty" || state == "dim" ? Look.InkFaint : Look.Ink, true, 500, 14).raycastTarget = false;
            tag.raycastTarget = false;
            var cg = m.gameObject.AddComponent<CanvasGroup>();
            cg.alpha = state == "dim" ? 0.35f : 1;
            cg.blocksRaycasts = state != "dim";
            var id = sl.Id;
            m.gameObject.AddComponent<Button>().onClick.AddListener(() => Slot(id));
            slotMarks[sl.Id] = m;
        }
        Place();

        // The page: the right of the screen, beside the ship.
        var panel = Hud.Rect(root, "Panel");
        panel.anchorMin = new Vector2(0.58f, 0);
        panel.anchorMax = new Vector2(1, 1);
        panel.offsetMin = new Vector2(0, 24);
        panel.offsetMax = new Vector2(-28, -24);
        var back = Hud.Pill(root, "‹ Back", () => menu.Show("campaign"), 15);
        Hud.At((RectTransform)back.transform, new Vector2(0, 1), new Vector2(26, -26), new Vector2(110, 44));
        var title = Hud.Label(panel, "SHIP", 30, Look.Ink, true, 400, 40, TextAlignmentOptions.Top);
        title.raycastTarget = false;
        var count = Hud.Label(panel, $"<b>{have.Count}</b>  <size=60%><color=#9aa0ac>OF {Parts.ShipParts.Count} PARTS FOUND</color></size>", 20, Look.Ink, true, 500, 6, TextAlignmentOptions.Top);
        count.margin = new Vector4(0, 44, 0, 0);
        count.raycastTarget = false;
        // Every part found: its small 3D view, its name; fitted, marked so.
        var grid = Hud.Rect(panel, "Parts");
        grid.anchorMin = new Vector2(0, 0);
        grid.anchorMax = new Vector2(1, 1);
        grid.offsetMin = new Vector2(0, 90);
        grid.offsetMax = new Vector2(0, -96);
        var owned = Parts.ShipParts.Where(p => have.Contains(p.Id)).ToList();
        var on = new HashSet<string>(fitted.Values.Where(v => v != null));
        if (owned.Count == 0)
        {
            var none = Hud.Label(grid, "No parts yet.", 15, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Top);
            none.margin = new Vector4(0, 30, 0, 0);
        }
        const float TileW = 112, TileH = 116, Gap = 8;
        int cols = Mathf.Max(1, Mathf.FloorToInt((Hud.W * 0.42f - 28 + Gap) / (TileW + Gap)));
        for (int i = 0; i < owned.Count; i++)
        {
            var p = owned[i];
            var at = new Vector2((i % cols) * (TileW + Gap), -(i / cols) * (TileH + Gap));
            // (Picked: a gold ring round it.)
            if (pick == p.Id)
            {
                var ring = Hud.Glass(grid, p.Id + " ring", new Color32(0xd6, 0xbd, 0x7a, 255), false);
                Hud.At((RectTransform)ring.transform, new Vector2(0, 1), at + new Vector2(-2.5f, 2.5f), new Vector2(TileW + 5, TileH + 5));
                ring.raycastTarget = false;
            }
            var tile = Hud.Glass(grid, p.Id, on.Contains(p.Id) ? new Color32(0xf6, 0xf9, 0xfd, 255) : Color.white, false);
            Hud.At((RectTransform)tile.transform, new Vector2(0, 1), at, new Vector2(TileW, TileH));
            var icon = Hud.Rect(tile.transform, "Icon");
            Hud.At(icon, new Vector2(0.5f, 1), new Vector2(0, -8), new Vector2(64, 64));
            var ii = icon.gameObject.AddComponent<RawImage>();
            ii.texture = Resources.Load<Texture2D>($"Icons/part-{p.Kind}-{p.Rarity}");
            ii.raycastTarget = false;
            var nm = Hud.Label(tile.transform, p.Name.ToUpperInvariant() + (on.Contains(p.Id) ? "\n<size=110%><color=#a6a9b0>fitted</color></size>" : ""), 9, Look.Ink, true, 500, 14, TextAlignmentOptions.Top);
            nm.textWrappingMode = TextWrappingModes.Normal;
            nm.margin = new Vector4(6, 76, 6, 0);
            nm.raycastTarget = false;
            var id = p.Id;
            tile.gameObject.AddComponent<Button>().onClick.AddListener(() => { pick = pick == id ? null : id; Sound.Play("hover"); Draw(); });
        }
        Detail(panel, fitted, have);
    }

    /// <summary>The part picked: its name and what it does, and where it goes (or, fitted there, remove).</summary>
    void Detail(RectTransform panel, Dictionary<string, string> fitted, List<string> have)
    {
        var box = Hud.Glass(panel, "Detail", Color.white);
        var r = (RectTransform)box.transform;
        r.anchorMin = new Vector2(0, 0);
        r.anchorMax = new Vector2(1, 0);
        r.pivot = new Vector2(0.5f, 0);
        r.offsetMin = new Vector2(0, 0);
        r.offsetMax = new Vector2(0, 70);
        var p = Parts.ShipPart(pick);
        if (p == null)
        {
            Hud.Label(box.transform, have.Count > 0 ? "Pick a part, then its slot." : "Parts are found on runs: every boss leaves one.", 15, Look.InkSoft, false, 400, 0);
            return;
        }
        var t = Hud.Label(box.transform, $"<b>{p.Name.ToUpperInvariant()}</b>", 13, Look.Ink, true, 500, 14, TextAlignmentOptions.TopLeft);
        t.margin = new Vector4(18, 14, 200, 0);
        var w = Hud.Label(box.transform, p.Text, 14, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
        w.textWrappingMode = TextWrappingModes.Normal;
        w.margin = new Vector4(18, 34, 220, 0);
        var where = Parts.ShipSlots.Where(sl => sl.Kind == p.Kind).ToList();
        float x = -14;
        foreach (var sl in Enumerable.Reverse(where))
        {
            bool here = fitted.TryGetValue(sl.Id, out var f) && f == p.Id;
            var label = here ? "remove" : where.Count > 1 ? sl.Name.Replace(" weapon", "") : "fit";
            var id = sl.Id;
            var b = Hud.Pill(box.transform, label, () => { if (here) Clear(id); else Slot(id); }, 13, here ? Look.GlassStrong : Look.Ink, here ? Look.Ink : Color.white);
            float bw = 30 + label.Length * 11;
            Hud.At((RectTransform)b.transform, new Vector2(1, 0.5f), new Vector2(x, 0), new Vector2(bw, 44));
            x -= bw + 8;
        }
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
