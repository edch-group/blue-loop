using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using Kit = StationKit;

/// <summary>
/// A space station's dock, on the Captain's runs (Unity only): the station in 3D (StationDock), the Captain's ship docked
/// in its bay, the shop on the right, the recycling unit on the left. Tapping the shop opens its card shop, the
/// recycling unit its recycling (and fusing, where the station can), the ship pans the camera down over it to fit parts:
/// each slot marked on the ship itself (empty, fitted in its part's rarity, lit where the part in hand goes), the parts
/// listed beside it with what each does, and what is picked (a part, or a slot) told in full at the panel's foot. The
/// station's tabs stay as a row of words under its name; repair stays top right; back returns to the dock, then the map.
/// </summary>
public partial class CampaignView
{
    StationDock dock;
    /// <summary>The slot looked at on the ship (nothing in hand): its part told in full.</summary>
    string dockSlot;

    /// <summary>A station with a dock to show: a space station, on the Captain's runs (their ship is the one docked).</summary>
    bool DockStation(CampaignNode n) => n?.Station?.Kind == "armory" && Campaign.Player(state).Human == true;

    /// <summary>The dock's scene, up (or kept) for the station open, posed for its tab; put away for any other.</summary>
    void DockScene(CampaignNode n)
    {
        if (!DockStation(n))
        {
            if (dock != null)
            {
                var d = dock;
                d.Wanted = null;
                d.Gone = null;
                d.Placed = null;
                d.Hold = null;
                Mats.Kill(d.gameObject);
                DockGone();
            }
            return;
        }
        if (dock == null)
        {
            dock = StationDock.Make(transform, Cam);
            dock.Wanted = () => stationId != null && DockStation(state.Nodes.FirstOrDefault(x => x.Id == stationId));
            dock.Gone = DockGone;
            dock.Hold = DockHold;
        }
        if (arTab != "ship") dockSlot = null;
        // (What followed the last drawing of the page is gone with it.)
        dock.Placed = null;
        dock.Refit(ShipSpec());
        dock.View = arTab == "ship" ? StationDock.Shot.Bird : StationDock.Shot.Dock;
        // (Under the shop's or the recycler's paper, not drawn at all.)
        dock.Shown = arTab == "dock" || arTab == "ship";
        DockHold(dock.Shown);
    }

    /// <summary>While the dock is up: the map put away under it, and the page's camera drawing over the dock's (not clearing it).</summary>
    void DockHold(bool shown)
    {
        var clear = shown ? CameraClearFlags.Depth : CameraClearFlags.SolidColor;
        if (Cam.clearFlags != clear) Cam.clearFlags = clear;
        if (world != null && world.gameObject.activeSelf) world.gameObject.SetActive(false);
        if (top != null && top.gameObject.activeSelf) top.gameObject.SetActive(false);
    }

    /// <summary>The dock gone (the station left): the map back, unless a story scene holds the screen.</summary>
    void DockGone()
    {
        dock = null;
        if (storyShip != null) return;
        Cam.clearFlags = CameraClearFlags.SolidColor;
        if (world != null) world.gameObject.SetActive(true);
        if (top != null) top.gameObject.SetActive(true);
    }

    /// <summary>A screen point (pixels) in a page's own space (about its middle).</summary>
    Vector2 OnPage(RectTransform page, Vector2 screen)
    {
        RectTransformUtility.ScreenPointToLocalPointInRectangle(page, screen, Cam, out var local);
        return local;
    }

    // ---- The dock ----

    /// <summary>
    /// The dock (the station's first view): its name, tabs and purse over the scene; over the shop, the recycling unit
    /// and the ship, a tag saying what each is (and if it is used up here), each tappable, as is the thing itself.
    /// </summary>
    void DockPage(RectTransform page, CampaignNode n)
    {
        const float Z = WebLook.Zoom;
        var me = Campaign.Player(state);
        var st = n.Station;
        var lay = ArLay();
        TopWash(page, lay.ShelfTop);
        bool fuse = st.Fuse == true;
        int stock = (st.Cards ?? new List<string>()).Count(c => !string.IsNullOrEmpty(c));
        var spots = new[]
        {
            (what: "ship", title: "your ship", sub: st.Used?.Part == true ? "refitted here" : "tap to fit parts", done: st.Used?.Part == true,
                tip: "Fit the parts you have found to your ship. One swap per station.", tab: "ship"),
            (what: "shop", title: "shop", sub: st.Used?.Buy == true ? "bought here" : stock == 0 ? "sold out" : $"{stock} cards · buy one", done: st.Used?.Buy == true || stock == 0,
                tip: "Buy a card for your deck. One per station.", tab: "buy"),
            (what: "recycle", title: "recycling", sub: st.Used?.Recycle == true ? (fuse ? "recycled here · fuse" : "recycled here") : fuse ? "recycle · fuse" : "recycle a card", done: st.Used?.Recycle == true && (!fuse || st.Used?.Fuse == true),
                tip: fuse ? "Break a card from your deck down for materials, or fuse two cards into one. One of each per station." : "Break a card from your deck down for materials. One per station.", tab: "recycle"),
        };
        // (The things themselves first, the ship under the vendors; their tags over them all.)
        var hits = new List<RectTransform>();
        foreach (var s in spots)
        {
            var hit = Hud.Rect(page, s.what + " hit");
            hit.anchorMin = hit.anchorMax = hit.pivot = new Vector2(0.5f, 0.5f);
            hit.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0.001f);
            var tab = s.tab;
            hit.gameObject.AddComponent<Button>().onClick.AddListener(() => StationTab(tab));
            var tip = hit.gameObject.AddComponent<Tip>();
            tip.Head = s.title;
            tip.Text = s.tip;
            hits.Add(hit);
        }
        var tags = spots.Select(s => DockTag(page, s.title, s.sub, s.done, s.tab)).ToList();
        StationFrame(page, n, me, lay);
        float top = PH / 2 - lay.ShelfTop, foot = -PH / 2 + lay.Pad.z + (lay.Phone ? 44 * Z : 0);
        dock.Placed = () =>
        {
            for (int i = 0; i < spots.Length; i++)
            {
                var hit = hits[i];
                var tag = tags[i];
                if (hit == null || tag == null) continue;
                var box = dock.ScreenBox(spots[i].what);
                bool on = box != null;
                if (hit.gameObject.activeSelf != on) hit.gameObject.SetActive(on);
                if (tag.gameObject.activeSelf != on) tag.gameObject.SetActive(on);
                if (!on) continue;
                Vector2 a = OnPage(page, box.Value.min), b = OnPage(page, box.Value.max), c = (a + b) / 2;
                var size = new Vector2(Mathf.Abs(b.x - a.x), Mathf.Abs(b.y - a.y));
                hit.anchoredPosition = c;
                // (The ship's box is roomy round its hull: a little in from it.)
                hit.sizeDelta = spots[i].what == "ship" ? size * 0.85f : size;
                // The ship's tag under it, on the pad; the vendors' over their signs; all kept on the page.
                bool below = spots[i].what == "ship";
                float h = tag.sizeDelta.y, w = tag.sizeDelta.x;
                float y = below ? Mathf.Min(a.y, b.y) - 4 * Z - h : Mathf.Max(a.y, b.y) + 6 * Z;
                y = Mathf.Clamp(y, foot, top - h);
                float x = Mathf.Clamp(c.x, -PW / 2 + w / 2 + 8 * Z, PW / 2 - w / 2 - 8 * Z);
                tag.anchoredPosition = new Vector2(x, y);
            }
        };
        dock.Tick();
    }

    /// <summary>A tag over something in the dock: its name in spaced capitals, what it offers under it; tapped, it opens it.</summary>
    RectTransform DockTag(RectTransform page, string title, string sub, bool done, string tab)
    {
        const float Z = WebLook.Zoom;
        var bg = WebLook.Rounded(page, title, new Color(1, 1, 1, 0.9f), 14 * Z);
        bg.raycastTarget = true;
        WebLook.Shadow(bg, 4 * Z, 14 * Z, new Color(40 / 255f, 50 / 255f, 70 / 255f, 0.16f), 14 * Z, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.1f));
        float ts = 0.7f * 16 * Z, ss = 0.54f * 16 * Z;
        var t = WebLook.Words(bg.transform, title.ToUpperInvariant(), ts, 0.24f, Look.Ink, true, 500);
        var u = WebLook.Words(bg.transform, sub.ToUpperInvariant(), ss, 0.16f, done ? Look.InkFaint : WebLook.Hex("#9a7429"), true, 400);
        float w = Mathf.Max(t.GetPreferredValues(t.text).x, u.GetPreferredValues(u.text).x) + 2 * 16 * Z;
        float h = ts * 1.3f + 2 * Z + ss * 1.3f + 2 * 8 * Z;
        var r = bg.rectTransform;
        r.anchorMin = r.anchorMax = new Vector2(0.5f, 0.5f);
        r.pivot = new Vector2(0.5f, 0);
        r.sizeDelta = new Vector2(w, h);
        WebLook.Box(t.rectTransform, 0, 8 * Z, w, ts * 1.3f);
        WebLook.Box(u.rectTransform, 0, 8 * Z + ts * 1.3f + 2 * Z, w, ss * 1.3f);
        bg.gameObject.AddComponent<Button>().onClick.AddListener(() => StationTab(tab));
        return r;
    }

    /// <summary>A wash of the page's white down from the top, under the station's name and tabs, so they read over the scene.</summary>
    static void TopWash(RectTransform page, float h)
    {
        const float Z = WebLook.Zoom;
        var g = Hud.Rect(page, "Wash");
        g.anchorMin = new Vector2(0, 1);
        g.anchorMax = new Vector2(1, 1);
        g.pivot = new Vector2(0.5f, 1);
        g.anchoredPosition = Vector2.zero;
        g.sizeDelta = new Vector2(0, h + 36 * Z);
        var raw = g.gameObject.AddComponent<RawImage>();
        raw.texture = WashDown();
        raw.raycastTarget = false;
    }

    static Texture2D washDown;

    /// <summary>The page's white (#fbfbfc), 0.85 at the top, fading out to nothing at the foot.</summary>
    static Texture2D WashDown()
    {
        if (washDown != null) return washDown;
        washDown = new Texture2D(1, 64, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var c = WebLook.Hex("#fbfbfc");
        for (int y = 0; y < 64; y++)
        {
            float k = (y + 0.5f) / 64;
            washDown.SetPixel(0, y, new Color(c.r, c.g, c.b, 0.85f * Mathf.SmoothStep(0, 1, k)));
        }
        washDown.Apply();
        return washDown;
    }

    // ---- The ship, from above ----

    /// <summary>What each kind of slot's parts do, for a slot with nothing in it.</summary>
    static string SlotWords(string kind) => kind switch
    {
        "armour" => "Armour: more health on your sun, and defence on every slot of your tableau.",
        "shield" => "Shield module: shields up as each battle begins, and each day.",
        "weapon" => "Weapon: attack on its side's two slots, and heat on the foe's sun as each battle begins.",
        "booster" => "Booster: cooling on each jump, and more jumps a turn.",
        "warp" => "Warp drive: reach farther along the routes.",
        _ => "",
    };

    /// <summary>Where a part goes on the ship (its slots' names).</summary>
    static string PartWhere(ShipPartDef p) => string.Join(" or ", Parts.ShipSlots.Where(s => s.Kind == p.Kind).Select(s => s.Name.ToLowerInvariant()));

    static Color RarityLine(string rarity) => Kit.RarityInk.TryGetValue(rarity ?? "dwarf", out var ink) ? ink.line : Kit.RarityInk["dwarf"].line;

    /// <summary>
    /// A space station's ship tab, on the Captain's runs: the camera over the ship, its slots marked on it; every part
    /// in the hangar listed on the right (its picture, name, rarity, where it goes and what it does), what is picked told
    /// at the foot. Pick a part, then its slot (on the ship, or by its button), one swap per station.
    /// </summary>
    void StationShip(RectTransform page, CampaignNode n)
    {
        const float Z = WebLook.Zoom;
        var me = Campaign.Player(state);
        var fitted = state.Run?.Ship?.Fitted ?? new Dictionary<string, string>();
        var have = Campaign.RunHangar(state);
        bool used = n.Station.Used?.Part == true;
        var pick = !used && arPick != null && have.Contains(arPick) ? arPick : null;
        var fits = pick != null ? Parts.PartSlots(pick) : new List<string>();
        var aboard = new HashSet<string>(fitted.Values.Where(v => v != null));
        var lay = ArLay();
        var nodeId = n.Id;
        TopWash(page, lay.ShelfTop);

        // The marks on the ship, each following its slot as the ship rides.
        var marks = Hud.Fill(Hud.Rect(page, "Marks"));
        var placed = new Dictionary<string, RectTransform>();
        foreach (var sl in Parts.ShipSlots) placed[sl.Id] = SlotMark(marks, sl, fitted, pick, fits, nodeId);

        // The parts, in a panel on the right (the left 58% the ship's).
        bool phone = lay.Phone;
        float px = PW * 0.58f, pw = PW - px - lay.Pad.y, py = lay.ShelfTop + 2 * Z, ph = PH - lay.Pad.z - (phone ? 44 * Z : 0) - py, pad = (phone ? 8 : 12) * Z;
        var panel = WebLook.Rounded(page, "Parts panel", new Color(1, 1, 1, 0.92f), 16 * Z);
        panel.raycastTarget = true;
        WebLook.Shadow(panel, 6 * Z, 18 * Z, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.1f), 16 * Z, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.1f));
        WebLook.Box(panel.rectTransform, px, py, pw, ph);
        // (Its head: PARTS, and how many are in the hangar.)
        float hs = 0.6f * 16 * Z, headH = hs * 1.4f;
        var head = WebLook.Words(WebLook.Box(panel.transform, "Head", pad, pad, pw - 2 * pad, headH), $"PARTS · {have.Count} IN YOUR HANGAR", hs, 0.24f, Look.InkSoft, true, 400, TextAlignmentOptions.Left);
        head.raycastTarget = false;
        // (What is picked, told at the foot.)
        var info = Hud.Rect(panel.transform, "Info");
        float iw = pw - 2 * pad, ih = DockInfo(info, iw, pick, fitted, have, used, nodeId, phone);
        WebLook.Box(info, pad, ph - pad - ih, iw, ih);
        // Every part in the hangar, a row each.
        float ly = pad + headH + 4 * Z, lh = Mathf.Max(30, ph - pad - ih - 8 * Z - ly), lw = pw - 2 * pad;
        var owned = Parts.ShipParts.Where(p => have.Contains(p.Id)).ToList();
        var area = WebLook.Box(panel.transform, "List", pad - 4 * Z, ly, lw + 8 * Z, lh);
        if (owned.Count > 0)
        {
            float icon = (phone ? 38 : 48) * Z, gap = 6 * Z, ns = 0.58f * 16 * Z, ms = 0.5f * 16 * Z, ds = (phone ? 0.64f : 0.72f) * 16 * Z;
            float rowW = lw, tx = 8 * Z + icon + 10 * Z, tw = rowW - tx - 8 * Z;
            var probe = WebLook.Words(panel.transform, "", ds, 0, Look.Ink, false, 400, TextAlignmentOptions.TopLeft);
            probe.textWrappingMode = TextWrappingModes.Normal;
            var descH = owned.Select(p => Mathf.Max(ds * 1.25f, probe.GetPreferredValues(p.Text ?? "", tw, 0).y)).ToList();
            Mats.Kill(probe.gameObject);
            float RowH(int i) => 8 * Z + Mathf.Max(icon, ns * 1.3f + 2 * Z + ms * 1.3f + 3 * Z + descH[i] + (aboard.Contains(owned[i].Id) ? 2 * Z + ms * 1.3f : 0)) + 8 * Z;
            float need = 4 * Z + owned.Select((_, i) => RowH(i) + gap).Sum();
            var list = need > lh ? Kit.Scroller(area, need) : area;
            float y = 4 * Z;
            for (int i = 0; i < owned.Count; i++)
            {
                var p = owned[i];
                float rh = RowH(i);
                bool fit = aboard.Contains(p.Id);
                var tile = WebLook.Rounded(list, p.Id, fit ? WebLook.Hex("#f6f9fd") : Color.white, 12 * Z);
                tile.raycastTarget = true;
                WebLook.Box(tile.rectTransform, 4 * Z, y, rowW, rh);
                if (pick == p.Id) WebLook.Shadow(tile, 3 * Z, 10 * Z, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.12f), 12 * Z, 2.5f * Z, WebLook.Hex("#d6bd7a"));
                else WebLook.Shadow(tile, 2 * Z, 8 * Z, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.06f), 12 * Z, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.1f));
                var ic = WebLook.Box(tile.transform, "Icon", 8 * Z, (rh - icon) / 2, icon, icon);
                var ii = ic.gameObject.AddComponent<RawImage>();
                ii.texture = Resources.Load<Texture2D>($"Icons/part-{p.Kind}-{p.Rarity}");
                ii.raycastTarget = false;
                float ty = 8 * Z;
                var nm = WebLook.Words(WebLook.Box(tile.transform, "Name", tx, ty, tw, ns * 1.3f), p.Name.ToUpperInvariant(), ns, 0.14f, Look.Ink, true, 500, TextAlignmentOptions.TopLeft);
                nm.raycastTarget = false;
                ty += ns * 1.3f + 2 * Z;
                var meta = $"{p.Rarity} · {PartWhere(p)}".ToUpperInvariant();
                var mt = WebLook.Words(WebLook.Box(tile.transform, "Meta", tx, ty, tw, ms * 1.3f), meta, ms, 0.14f, RarityLine(p.Rarity), true, 400, TextAlignmentOptions.TopLeft);
                mt.raycastTarget = false;
                ty += ms * 1.3f + 3 * Z;
                var what = WebLook.Words(WebLook.Box(tile.transform, "What", tx, ty, tw, descH[i] + 2), p.Text ?? "", ds, 0, Look.InkSoft, false, 400, TextAlignmentOptions.TopLeft);
                what.textWrappingMode = TextWrappingModes.Normal;
                what.raycastTarget = false;
                ty += descH[i] + 2 * Z;
                if (fit)
                {
                    var on = string.Join(", ", fitted.Where(kv => kv.Value == p.Id).Select(kv => Parts.ShipSlots.FirstOrDefault(s => s.Id == kv.Key)?.Name.ToLowerInvariant() ?? kv.Key));
                    var ft = WebLook.Words(WebLook.Box(tile.transform, "Fitted", tx, ty, tw, ms * 1.3f), $"fitted · {on}", ms * 1.1f, 0, Look.InkFaint, false, 400, TextAlignmentOptions.TopLeft);
                    ft.raycastTarget = false;
                }
                var tip = tile.gameObject.AddComponent<Tip>();
                tip.Head = p.Name;
                tip.Text = p.Text;
                tip.Note = $"{p.Rarity} · {PartWhere(p)}";
                var b = tile.gameObject.AddComponent<Button>();
                var id = p.Id;
                b.onClick.AddListener(() =>
                {
                    Sound.Play("hover");
                    arPick = arPick == id ? null : id;
                    dockSlot = null;
                    Station();
                });
                if (used)
                {
                    b.interactable = false;
                    tile.gameObject.AddComponent<CanvasGroup>().alpha = 0.55f;
                }
                y += rh + gap;
            }
        }
        else
        {
            var none = WebLook.Words(area, "No parts yet: every boss leaves one.", 0.8f * 16 * Z, 0, Look.InkFaint, false, 400, TextAlignmentOptions.TopLeft);
            none.textWrappingMode = TextWrappingModes.Normal;
            none.margin = new Vector4(8 * Z, 6 * Z, 8 * Z, 0);
        }

        StationFrame(page, n, me, lay);
        dock.Placed = () =>
        {
            foreach (var kv in placed)
            {
                if (kv.Value == null) continue;
                var at = dock.SlotScreen(kv.Key);
                bool on = at != null;
                if (kv.Value.gameObject.activeSelf != on) kv.Value.gameObject.SetActive(on);
                if (on) kv.Value.anchoredPosition = OnPage(marks, at.Value);
            }
        };
        dock.Tick();
    }

    /// <summary>
    /// A slot's mark on the ship (as the hangar's, HangarView): a ring, dashed while empty; ringed in its part's rarity,
    /// the part's picture in it, once fitted; lit gold where the part in hand goes, the rest dimmed; its name beneath.
    /// Tapped: the part in hand fitted there, if it can go there; otherwise the slot looked at.
    /// </summary>
    RectTransform SlotMark(RectTransform marks, ShipSlot sl, Dictionary<string, string> fitted, string pick, List<string> fits, string nodeId)
    {
        const float Z = WebLook.Zoom;
        fitted.TryGetValue(sl.Id, out var there);
        var part = Parts.ShipPart(there);
        bool canFit = pick != null && fits.Contains(sl.Id) && there != pick;
        string look = canFit ? "lit" : pick != null ? "dim" : part != null ? "fitted" : "empty";
        bool chosen = pick == null && dockSlot == sl.Id;
        float d = 34 * Z;
        var m = Hud.Rect(marks, sl.Id);
        m.anchorMin = m.anchorMax = new Vector2(0.5f, 0.5f);
        m.sizeDelta = new Vector2(d, d);
        var hit = m.gameObject.AddComponent<Image>();
        hit.sprite = Hud.Circle;
        hit.color = new Color(1, 1, 1, 0);
        var ring = Hud.Fill(Hud.Rect(m, "Ring"));
        if (chosen)
        {
            var halo = HangarView.Disc(ring, "Halo", d * 1.9f, new Color(1, 0.84f, 0.51f, 0.55f));
            halo.sprite = Hud.Soft;
            HangarView.Disc(ring, "Chosen", d + 6 * Z, WebLook.Hex("#d6bd7a"));
        }
        if (look == "empty" || look == "dim")
        {
            var bg = HangarView.Disc(ring, "Back", d, new Color(1, 1, 1, 0.78f));
            WebLook.Shadow(bg, 2 * Z, 8 * Z, new Color(40 / 255f, 50 / 255f, 70 / 255f, 0.18f), 999);
            var dash = Hud.Fill(Hud.Rect(ring, "Dashes"));
            var di = dash.gameObject.AddComponent<RawImage>();
            di.texture = HangarView.DashedRing();
            di.color = WebLook.Hex("#8ea6c8");
            di.raycastTarget = false;
            if (part == null) HangarView.Disc(ring, "Dot", d - 2 * 10 * Z, new Color(0x8e / 255f, 0xa6 / 255f, 0xc8 / 255f, 0.45f));
        }
        else if (look == "lit")
        {
            HangarView.Disc(ring, "Border", d, WebLook.Hex("#d6bd7a"));
            HangarView.Disc(ring, "Back", d - 2 * 2 * Z, new Color(1, 250 / 255f, 235 / 255f, 0.92f));
            if (part == null) HangarView.Disc(ring, "Dot", d - 2 * 10 * Z, new Color(0xd6 / 255f, 0xbd / 255f, 0x7a / 255f, 0.9f));
            ring.gameObject.AddComponent<WebLook.Pulse>();
        }
        else
        {
            var bg = HangarView.Disc(ring, "Back", d, new Color(1, 1, 1, 0.86f));
            WebLook.Shadow(bg, 2 * Z, 8 * Z, new Color(40 / 255f, 50 / 255f, 70 / 255f, 0.18f), 999);
            HangarView.Disc(ring, "Rim", d, RarityLine(part.Rarity)).sprite = HangarView.Ring15();
        }
        // (A fitted part's picture in its ring, whatever the look.)
        if (part != null)
        {
            var ic = Hud.At(Hud.Rect(ring, "Part"), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(d - 8 * Z, d - 8 * Z));
            var ii = ic.gameObject.AddComponent<RawImage>();
            ii.texture = Resources.Load<Texture2D>($"Icons/part-{part.Kind}-{part.Rarity}");
            ii.raycastTarget = false;
        }
        // Its name beneath: small spaced capitals on a wash of white.
        string name = (part != null ? part.Name : sl.Name).ToUpperInvariant();
        var tag = WebLook.Rounded(m, "Name", new Color(1, 1, 1, 0.82f), 6 * Z);
        var tt = WebLook.Words(tag.transform, name, 0.5f * 16 * Z, 0.14f, look == "empty" || look == "dim" ? Look.InkSoft : Look.Ink, true, 400);
        tt.raycastTarget = false;
        var tr = tag.rectTransform;
        tr.anchorMin = tr.anchorMax = new Vector2(0.5f, 0.5f);
        tr.pivot = new Vector2(0.5f, 1);
        tr.anchoredPosition = new Vector2(0, -d / 2 - 3 * Z);
        tr.sizeDelta = new Vector2(tt.GetPreferredValues(name).x + 2 * 6 * Z, 0.5f * 16 * Z * 1.6f);
        var cg = m.gameObject.AddComponent<CanvasGroup>();
        cg.alpha = look == "dim" ? 0.45f : 1;
        var tip = m.gameObject.AddComponent<Tip>();
        tip.Head = part != null ? part.Name : sl.Name;
        tip.Text = part != null ? part.Text : SlotWords(sl.Kind);
        tip.Note = part != null ? $"{part.Rarity} · {sl.Name.ToLowerInvariant()}" : $"{sl.Name.ToLowerInvariant()} · empty";
        var slot = sl.Id;
        m.gameObject.AddComponent<Button>().onClick.AddListener(() => DockSlotTap(nodeId, slot, canFit));
        return m;
    }

    /// <summary>A slot on the ship tapped: the part in hand fitted there (as ever, ArSlot), or the slot looked at (again: let go).</summary>
    void DockSlotTap(string nodeId, string slot, bool canFit)
    {
        if (canFit)
        {
            dockSlot = null;
            ArSlot(nodeId, slot);
            return;
        }
        Sound.Play("hover");
        dockSlot = dockSlot == slot && arPick == null ? null : slot;
        arPick = null;
        Station();
    }

    /// <summary>
    /// What is picked, told in full at the foot of the parts (made in `box`, `w` across; its height returned): a part in
    /// hand (its name, rarity and where it goes, what it does, where it is fitted, and a button for each slot it can go
    /// in); a slot looked at (its part, or what its kind does and that it is empty); or, nothing picked, how it is done.
    /// </summary>
    float DockInfo(RectTransform box, float w, string pick, Dictionary<string, string> fitted, List<string> have, bool used, string nodeId, bool phone)
    {
        const float Z = WebLook.Zoom;
        var bg = WebLook.Rounded(box, "Back", WebLook.Hex("#f3f7fc"), 12 * Z);
        Hud.Fill(bg.rectTransform);
        WebLook.Shadow(bg, 0, 0, Color.clear, 12 * Z, Z, new Color(95 / 255f, 134 / 255f, 184 / 255f, 0.18f));
        float pad = (phone ? 8 : 10) * Z, tw = w - 2 * pad, y = pad;
        float ks = 0.5f * 16 * Z, ns = 0.66f * 16 * Z, ms = 0.52f * 16 * Z, ds = (phone ? 0.68f : 0.76f) * 16 * Z, hs = 0.6f * 16 * Z;
        void Line(string text, float size, float spacing, Color c, bool display, int weight, float after)
        {
            if (string.IsNullOrEmpty(text)) return;
            var t = WebLook.Words(box, text, size, spacing, c, display, weight, TextAlignmentOptions.TopLeft);
            t.textWrappingMode = TextWrappingModes.Normal;
            t.raycastTarget = false;
            float h = Mathf.Max(size * 1.25f, t.GetPreferredValues(text, tw, 0).y);
            WebLook.Box(t.rectTransform, pad, y, tw, h + 2);
            y += h + after;
        }
        var slotDef = dockSlot != null ? Parts.ShipSlots.FirstOrDefault(s => s.Id == dockSlot) : null;
        string there = null;
        if (slotDef != null) fitted.TryGetValue(slotDef.Id, out there);
        var p = Parts.ShipPart(pick ?? there);
        if (pick == null && slotDef != null) Line($"{slotDef.Name} slot".ToUpperInvariant(), ks, 0.2f, Look.InkFaint, true, 400, 3 * Z);
        if (p != null)
        {
            Line(p.Name.ToUpperInvariant(), ns, 0.2f, Look.Ink, true, 500, 2 * Z);
            Line($"{p.Rarity} · goes in {PartWhere(p)}".ToUpperInvariant(), ms, 0.14f, RarityLine(p.Rarity), true, 400, 4 * Z);
            Line(p.Text, ds, 0, Look.InkSoft, false, 400, 4 * Z);
            var on = fitted.Where(kv => kv.Value == p.Id).Select(kv => Parts.ShipSlots.FirstOrDefault(s => s.Id == kv.Key)?.Name.ToLowerInvariant() ?? kv.Key).ToList();
            string status = on.Count > 0 ? $"Fitted: {string.Join(", ", on)}." : "In your hangar.";
            if (pick != null) status += used ? "" : " Tap a lit slot on the ship to fit it.";
            else if (!used && slotDef != null) status += " Pick a part to change it.";
            if (used) status += " Refitted here: one part per station.";
            Line(status, hs, 0, Look.InkFaint, false, 400, 4 * Z);
        }
        else if (slotDef != null)
        {
            Line(slotDef.Name.ToUpperInvariant(), ns, 0.2f, Look.Ink, true, 500, 2 * Z);
            Line("EMPTY", ms, 0.14f, Look.InkFaint, true, 400, 4 * Z);
            Line(SlotWords(slotDef.Kind), ds, 0, Look.InkSoft, false, 400, 4 * Z);
            bool any = Parts.ShipParts.Any(q => q.Kind == slotDef.Kind && have.Contains(q.Id));
            Line(used ? "Refitted here: one part per station." : any ? "Pick one of your parts for it from the list." : "No part for it in your hangar yet.", hs, 0, Look.InkFaint, false, 400, 4 * Z);
        }
        else
            Line(used ? "Refitted here: one part per station." : have.Count > 0 ? "Pick a part to see what it does, then tap its slot on the ship. Tap a slot to see what is fitted there." : "No parts in your hangar yet: every boss leaves one.", ds, 0, Look.InkSoft, false, 400, 4 * Z);
        // (A part in hand: a button for each slot it can go in, to fit it without finding the mark.)
        if (pick != null && !used && p != null)
        {
            float x = pad, bh = 0.6f * 16 * Z * 1.25f + 16 * Z, rowY = y + 2 * Z;
            foreach (var sl in Parts.ShipSlots.Where(s => s.Kind == p.Kind))
            {
                fitted.TryGetValue(sl.Id, out var on);
                if (on == p.Id) continue;
                var slot = sl.Id;
                var go = Kit.Go(box, $"fit · {sl.Name}", true, null, () => DockSlotTap(nodeId, slot, true), 0.6f * 16 * Z, bh);
                if (x > pad && x + go.sizeDelta.x > w - pad)
                {
                    x = pad;
                    rowY += bh + 6 * Z;
                }
                go.anchorMin = go.anchorMax = go.pivot = new Vector2(0, 1);
                go.anchoredPosition = new Vector2(x, -rowY);
                Kit.Nudge(go);
                x += go.sizeDelta.x + 8 * Z;
                y = rowY + bh + 4 * Z;
            }
        }
        return y - 4 * Z + pad;
    }
}
