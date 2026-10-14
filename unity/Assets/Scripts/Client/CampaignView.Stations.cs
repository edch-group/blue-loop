using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using Kit = StationKit;

/// <summary>
/// The stations (campaign.ts renderArmory, renderStationShip, renderResearch, renderLab). A space station: on the
/// page's own paper, nothing boxed; its name small at the top, buy · recycle · fuse · ship under it as words, its cards
/// across the middle each with its price beneath, the one action under the row, the keeper and their line at the foot,
/// materials (and the dock's repair for your sun) top right. A research station on the Captain's runs: a story scene,
/// its lab come alongside the ship, its scientist offering three experiments.
/// </summary>
public partial class CampaignView
{
    /// <summary>The station open (its system's id; null: none), its tab, the card or part lifted, the upgrade picked, a card looked over.</summary>
    string stationId, arTab = "buy", arPick, rsPick, arLooking;
    /// <summary>The two cards to fuse (a card twice, if the deck has two).</summary>
    readonly List<string> arFuse = new List<string>();
    /// <summary>Visits and tabs opened, so the keeper's line changes.</summary>
    int keeperVisit;

    float StationH => sheetRoot.rect.height > 1 ? sheetRoot.rect.height : Hud.H;

    // ---- In and out ----

    /// <summary>Into a space station: its armoury, on its buy tab (the keeper's line moves on).</summary>
    void Armory(string nodeId)
    {
        CloseSheet();
        keeperVisit++;
        stationId = nodeId;
        arTab = "buy";
        arPick = null;
        arFuse.Clear();
        Station();
    }

    /// <summary>Into a research station: nothing picked yet.</summary>
    void Lab(string nodeId)
    {
        CloseSheet();
        stationId = nodeId;
        rsPick = null;
        Station();
    }

    /// <summary>A station opened from outside (the editor's pictures): as the ship arriving there opens it.</summary>
    public void OpenStation(string nodeId) => EnterStation(nodeId);

    /// <summary>A research station's lab is up (its scene in 3D: the ship, and the lab alongside).</summary>
    bool LabUp()
    {
        if (stationId == null) return false;
        var n = state.Nodes.FirstOrDefault(x => x.Id == stationId);
        return n?.Station?.Kind == "research" && Campaign.Player(state).Human == true;
    }

    /// <summary>Back to the map.</summary>
    void LeaveStation()
    {
        CloseSheet();
        Refresh();
    }

    /// <summary>The station open, drawn afresh.</summary>
    void Station()
    {
        foreach (var c in sheetRoot.Cast<Transform>().ToList()) if (c != null) Mats.Kill(c.gameObject);
        var n = stationId != null ? state.Nodes.FirstOrDefault(x => x.Id == stationId) : null;
        if (n?.Station == null)
        {
            stationId = null;
            return;
        }
        var page = Hud.Rect(sheetRoot, "Station");
        Hud.Fill(page);
        if (n.Station.Kind == "armory")
        {
            // (The ship tab only on the Captain's runs; fusing only where the station can.)
            if (arTab == "ship" && Campaign.Player(state).Human != true) arTab = "buy";
            if (arTab == "fuse" && n.Station.Fuse != true) arTab = "buy";
            if (arTab == "ship") StationShip(page, n);
            else ArmoryPage(page, n);
        }
        else if (Campaign.Player(state).Human == true) LabScene(page, n);
        else ResearchPage(page, n);
        if (arLooking != null) StationInspect(page, arLooking);
    }

    // ---- The armoury ----

    void ArmoryPage(RectTransform page, CampaignNode n)
    {
        var me = Campaign.Player(state);
        var st = n.Station;
        var flag = Campaign.Flagship(state, state.PlayerId);
        // (Recycling and fusing take from the flagship's deck; its leader's card stays. Characters, the Captain, the
        // crew and any Hero, are never recycled: they don't show.)
        var deck = flag?.Deck ?? new List<string>();
        var stock = (st.Cards ?? new List<string>()).Where(c => !string.IsNullOrEmpty(c)).ToList();
        int Have(List<string> among, string card) => among.Count(c => c == card);
        var list = arTab == "buy" ? stock : deck.Distinct().Where(c => (c != flag?.General || Have(deck, c) > 1) && !(arTab == "recycle" && Campaign.IsCharacter(c))).ToList();
        StationFrame(page, n, me);

        // The shelf: the cards across the middle, a little tilted each, wrapping to more rows (scrolled) if need be.
        var area = Hud.Rect(page, "Shelf");
        area.anchorMin = new Vector2(0.5f, 0);
        area.anchorMax = new Vector2(0.5f, 1);
        area.pivot = new Vector2(0.5f, 0.5f);
        area.offsetMin = new Vector2(-560, 136);
        area.offsetMax = new Vector2(560, -134);
        if (list.Count == 0)
            Hud.Label(area, (arTab == "buy" ? "sold out" : "nothing in your deck").ToUpperInvariant(), 13, Look.InkFaint, true, 500, 30);
        else
        {
            float areaH = StationH - 270;
            int cols = Mathf.Max(1, Mathf.FloorToInt((1080 + 22) / (Kit.CardW + 22)));
            int rows = (list.Count + cols - 1) / cols;
            float need = 30 + rows * Kit.CellH + (rows - 1) * 26 + 24;
            var content = Kit.Scroller(area, Mathf.Max(need, areaH));
            float top = 30 + Mathf.Max(0, (areaH - need) / 2);
            for (int i = 0; i < list.Count; i++)
            {
                var id = list[i];
                int row = i / cols, inRow = Mathf.Min(cols, list.Count - row * cols);
                float x = ((i % cols) - (inRow - 1) / 2f) * (Kit.CardW + 22);
                bool picked = arTab == "fuse" ? arFuse.Contains(id) : arPick == id;
                string tag = arTab == "buy" ? $"⬢{Campaign.BuyPrice(state, me, id)}" : arTab == "recycle" ? $"×{Have(deck, id)} · +⬢{Campaign.RecycleValue(id)}" : $"×{Have(deck, id)}";
                Color ink = arTab == "buy" && me.Materials < Campaign.BuyPrice(state, me, id) ? Kit.Short : Look.Ink;
                var cell = Hud.At(Hud.Rect(content, id), new Vector2(0.5f, 1), new Vector2(x, -(top + row * (Kit.CellH + 26))), new Vector2(Kit.CardW, Kit.CellH));
                ShelfCard(cell, id, i, picked, tag, ink, picked && arTab != "fuse");
            }
        }

        // The one action, beneath the row (once each here: a buy, a recycle, a fusion).
        var act = Hud.At(Hud.Rect(page, "Act"), new Vector2(0.5f, 0), new Vector2(0, 74), new Vector2(1000, 54));
        bool used = arTab == "buy" ? st.Used?.Buy == true : arTab == "recycle" ? st.Used?.Recycle == true : st.Used?.Fuse == true;
        var nodeId = n.Id;
        if (used) Kit.Across(act, 14, Kit.Hint(act, $"{(arTab == "buy" ? "bought here" : arTab == "recycle" ? "recycled here" : "fused here")} · one per station"));
        else if (arTab == "fuse")
        {
            if (arFuse.Count < 2) Kit.Across(act, 14, Kit.Hint(act, "choose two to fuse into one"));
            else
            {
                string a = arFuse[0], b = arFuse[1];
                var problem = Campaign.FuseProblem(state, me, n, a, b);
                int cost = Campaign.FusionCost(a, b);
                if (problem != null && !problem.StartsWith("Not enough")) Kit.Across(act, 14, Kit.Hint(act, problem.ToLowerInvariant(), true));
                else
                {
                    // (What the two become, beside the way to make it.)
                    var fused = Hud.Rect(act, "Fused");
                    fused.sizeDelta = new Vector2(88, 124);
                    var face = fused.gameObject.AddComponent<RawImage>();
                    face.texture = Faces.Of(Builds.FusedId(a, b), false);
                    face.raycastTarget = false;
                    Kit.Across(act, 14, fused, Kit.Go(act, $"fuse · ⬢{cost}", true, problem, () => StationFuse(nodeId, a, b)), Kit.Hint(act, "for good"));
                }
            }
        }
        else
        {
            var held = arPick != null && list.Contains(arPick) ? arPick : null;
            if (held == null) Kit.Across(act, 14, Kit.Hint(act, arTab == "buy" ? "one card per station" : "break a card down for materials"));
            else if (arTab == "buy")
            {
                var why = Campaign.BuyProblem(state, me, n, (st.Cards ?? new List<string>()).IndexOf(held));
                Kit.Across(act, 14, Kit.Go(act, $"buy · ⬢{Campaign.BuyPrice(state, me, held)}", true, why, () => StationBuy(nodeId, held)));
            }
            else
            {
                var why = Campaign.RecycleProblem(state, me, n, held);
                if (why != null) Kit.Across(act, 14, Kit.Hint(act, why.ToLowerInvariant(), true));
                else Kit.Across(act, 14, Kit.Go(act, $"recycle · +⬢{Campaign.RecycleValue(held)}", true, null, () => StationRecycle(nodeId, held)));
            }
        }

        // The keeper, at the foot: their face and their line, nothing round them.
        bool buying = arTab == "buy";
        var keeper = buying ? BlueLoop.Engine.Story.Quartermaster : BlueLoop.Engine.Story.Recycler;
        var lines = buying ? BlueLoop.Engine.Story.QuartermasterLines : BlueLoop.Engine.Story.RecyclerLines;
        if (keeper != null && lines != null && lines.Count > 0)
        {
            var foot = Hud.At(Hud.Rect(page, "Keeper"), new Vector2(0, 0), new Vector2(26, 16), new Vector2(540, 54));
            Kit.Disc(foot, Resources.Load<Texture2D>(buying ? "Portraits/hesk" : "Portraits/tallow"), new Vector2(0, 0.5f), Vector2.zero, 50);
            var who = Hud.Label(foot, keeper.Name.ToUpperInvariant(), 11, Look.InkSoft, true, 400, 26, TextAlignmentOptions.TopLeft);
            who.margin = new Vector4(64, 6, 0, 0);
            var said = Hud.Label(foot, $"“{lines[(state.Turn * 3 + keeperVisit) % lines.Count]}”", 15, Look.InkFaint, false, 400, 0, TextAlignmentOptions.TopLeft);
            said.fontStyle = FontStyles.Italic;
            said.textWrappingMode = TextWrappingModes.Normal;
            said.margin = new Vector4(64, 24, 0, 0);
        }
    }

    /// <summary>A card on the shelf: its face (tilted; picked, lifted and glowing gold behind), what it costs or fetches beneath.</summary>
    void ShelfCard(RectTransform cell, string id, int i, bool picked, string tag, Color ink, bool inspect)
    {
        float tilt = (((i * 37) % 7) - 3) * 0.5f, lift = picked ? 12 : 0;
        if (picked)
        {
            // (Picked: a soft golden light behind it, not a box round it.)
            var glow = Hud.Rect(cell, "Glow");
            glow.anchorMin = glow.anchorMax = new Vector2(0.5f, 1);
            glow.pivot = new Vector2(0.5f, 0.5f);
            glow.anchoredPosition = new Vector2(0, -Kit.CardH * 0.4f + lift);
            glow.sizeDelta = new Vector2(Kit.CardW * 1.9f, Kit.CardH * 1.45f);
            var gi = glow.gameObject.AddComponent<Image>();
            gi.sprite = Hud.Soft;
            gi.color = new Color(1, 0.84f, 0.51f, 0.6f);
            gi.raycastTarget = false;
        }
        var card = Hud.Rect(cell, "Card");
        card.anchorMin = card.anchorMax = new Vector2(0.5f, 1);
        card.pivot = new Vector2(0.5f, 0.5f);
        card.sizeDelta = new Vector2(Kit.CardW, Kit.CardH);
        card.anchoredPosition = new Vector2(0, -Kit.CardH / 2 + lift);
        // (CSS turns clockwise, Unity the other way.)
        card.localRotation = Quaternion.Euler(0, 0, picked ? 0 : -tilt);
        card.localScale = Vector3.one * (picked ? 1.06f : 1);
        var shade = Hud.Rect(card, "Shadow");
        Hud.Fill(shade);
        shade.offsetMin = new Vector2(-12, -20);
        shade.offsetMax = new Vector2(12, 4);
        var si = shade.gameObject.AddComponent<Image>();
        si.sprite = Hud.Soft;
        si.type = Image.Type.Sliced;
        si.color = new Color(0.16f, 0.18f, 0.27f, 0.14f);
        si.raycastTarget = false;
        var face = Hud.Rect(card, "Face");
        Hud.Fill(face);
        var raw = face.gameObject.AddComponent<RawImage>();
        raw.texture = Faces.Of(id, false);
        var b = card.gameObject.AddComponent<Button>();
        b.targetGraphic = raw;
        b.onClick.AddListener(() => ArPick(id, inspect));
        Kit.Inline(cell, tag, 13, ink, new Vector2(0.5f, 0), Vector2.zero, true, 700, 8);
    }

    /// <summary>A card on the shelf tapped: lifted (or, fusing, one of the two); tapped again, looked over.</summary>
    void ArPick(string id, bool inspect)
    {
        Sound.Play("hover");
        if (inspect) arLooking = id;
        else if (arTab == "fuse")
        {
            var deck = Campaign.Flagship(state, state.PlayerId)?.Deck ?? new List<string>();
            int at = arFuse.LastIndexOf(id);
            if (at >= 0) arFuse.RemoveAt(at);
            else if (arFuse.Count < 2 && arFuse.Count(c => c == id) < deck.Count(c => c == id)) arFuse.Add(id);
            else
            {
                // (A third in place of the second.)
                var first = arFuse.Take(1).ToList();
                arFuse.Clear();
                arFuse.AddRange(first);
                arFuse.Add(id);
            }
        }
        else arPick = arPick == id ? null : id;
        Station();
    }

    void StationBuy(string nodeId, string id)
    {
        int index = (Campaign.NodeById(state, nodeId).Station?.Cards ?? new List<string>()).IndexOf(id);
        if (index >= 0 && Apply(new CampaignAction { Type = "buyCard", NodeId = nodeId, Index = index }))
        {
            Sound.Play("buy");
            arPick = null;
        }
        Station();
        Refresh();
    }

    void StationRecycle(string nodeId, string id)
    {
        if (Apply(new CampaignAction { Type = "recycle", DefId = id, NodeId = nodeId }))
        {
            Sound.Play("shuffle");
            arPick = null;
        }
        Station();
        Refresh();
    }

    void StationFuse(string nodeId, string a, string b)
    {
        if (Apply(new CampaignAction { Type = "fuseDeck", NodeId = nodeId, A = a, B = b }))
        {
            Sound.Play("upgrade");
            arFuse.Clear();
        }
        Station();
        Refresh();
    }

    /// <summary>
    /// What every armoury tab has round it: the page's paper, the way back to the map, materials (and the dock's repair
    /// for your sun) top right, its name small at the top and its tabs as words under it.
    /// </summary>
    void StationFrame(RectTransform page, CampaignNode n, Faction me)
    {
        Kit.Paper(page);
        var back = Hud.Pill(page, "‹ map", LeaveStation, 11, new Color(1, 1, 1, 0.7f), Look.InkSoft);
        Hud.At((RectTransform)back.transform, new Vector2(0, 1), new Vector2(18, -16), new Vector2(108, 36));
        // Materials; before them, your sun's damage and its repair.
        float x = -24;
        x -= Kit.Inline(page, $"⬢{me.Materials}", 19, Look.Ink, new Vector2(1, 1), new Vector2(x, -18), true, 700, 0) + 18;
        var flag = Campaign.Flagship(state, state.PlayerId);
        if (flag != null && flag.Damage > 0)
        {
            int cost = Campaign.T.ArmyHealCost;
            int most = Mathf.Min(flag.Damage, me.Materials / Mathf.Max(1, cost));
            string why = me.Materials < cost ? "" : null;
            var armyId = flag.Id;
            if (flag.Damage > 1)
            {
                var whole = Kit.Go(page, $"repair all · ⬢{Mathf.Max(1, most) * cost}", false, why, () => StationRepair(armyId, true), 10, 32);
                Hud.At(whole, new Vector2(1, 1), new Vector2(x, -18), whole.sizeDelta);
                Kit.Nudge(whole);
                x -= whole.sizeDelta.x + 8;
            }
            var one = Kit.Go(page, $"repair 1 · ⬢{cost}", false, why, () => StationRepair(armyId, false), 10, 32);
            Hud.At(one, new Vector2(1, 1), new Vector2(x, -18), one.sizeDelta);
            Kit.Nudge(one);
            x -= one.sizeDelta.x + 10;
            var sun = Hud.Rect(page, "Sun");
            var heat = Hud.Label(sun, $"SUN ✸{flag.Damage}", 12, Kit.Warn, true, 500, 20);
            Hud.At(sun, new Vector2(1, 1), new Vector2(x, -18), new Vector2(heat.GetPreferredValues(heat.text).x + 4, 32));
        }
        Kit.Head(page, "space station", n.Name);
        // The tabs: buy, recycle, fuse (where the station can), the ship (the Captain's runs).
        var tabs = new List<string> { "buy", "recycle" };
        if (n.Station.Fuse == true) tabs.Add("fuse");
        if (me.Human == true) tabs.Add("ship");
        var row = Hud.At(Hud.Rect(page, "Tabs"), new Vector2(0.5f, 1), new Vector2(0, -100), new Vector2(0, 28));
        float tx = 0;
        foreach (var tab in tabs)
        {
            bool open = tab == arTab;
            var r = Hud.Rect(row, tab);
            var t = Hud.Label(r, tab.ToUpperInvariant(), 12, open ? Look.Ink : Look.InkFaint, true, 500, 30);
            float w = t.GetPreferredValues(t.text).x + 8;
            Hud.At(r, new Vector2(0, 0.5f), new Vector2(tx, 0), new Vector2(w, 28));
            r.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0.001f);
            var which = tab;
            r.gameObject.AddComponent<Button>().onClick.AddListener(() => StationTab(which));
            if (open)
            {
                // (The tab open: a dot beneath it.)
                var dot = Hud.At(Hud.Rect(r, "Dot"), new Vector2(0.5f, 0), new Vector2(-2, -4), new Vector2(5, 5));
                var di = dot.gameObject.AddComponent<Image>();
                di.sprite = Hud.Circle;
                di.color = Look.Ink;
                di.raycastTarget = false;
            }
            tx += w + 22;
        }
        row.sizeDelta = new Vector2(Mathf.Max(0, tx - 22), 28);
    }

    void StationTab(string tab)
    {
        Sound.Play("click");
        arTab = tab;
        arPick = null;
        arFuse.Clear();
        keeperVisit++;
        Station();
    }

    void StationRepair(string armyId, bool all)
    {
        if (Apply(new CampaignAction { Type = "healArmy", ArmyId = armyId, All = all })) Sound.Play(all ? "upgrade" : "repair");
        Station();
        Refresh();
    }

    /// <summary>A card looked over: its face, large, over a veil; a tap puts it back.</summary>
    void StationInspect(RectTransform page, string id)
    {
        var v = Hud.Rect(page, "Inspect");
        Hud.Fill(v);
        v.gameObject.AddComponent<Image>().color = new Color(0.95f, 0.95f, 0.94f, 0.86f);
        v.gameObject.AddComponent<Button>().onClick.AddListener(() => { arLooking = null; Station(); });
        var f = Hud.At(Hud.Rect(v, "Face"), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(340, 476));
        var raw = f.gameObject.AddComponent<RawImage>();
        raw.texture = Faces.Of(id, false);
        raw.raycastTarget = false;
    }

    // ---- The ship tab (the Captain's runs) ----

    /// <summary>
    /// A space station's ship tab: the ship's schematic as fitted for the run, and every part in the hangar beside it;
    /// pick a part, then its slot (one swap per station).
    /// </summary>
    void StationShip(RectTransform page, CampaignNode n)
    {
        var me = Campaign.Player(state);
        var fitted = state.Run?.Ship?.Fitted ?? new Dictionary<string, string>();
        var have = Campaign.RunHangar(state);
        bool used = n.Station.Used?.Part == true;
        var pick = !used && arPick != null && have.Contains(arPick) ? arPick : null;
        var fits = pick != null ? Parts.PartSlots(pick) : new List<string>();
        var aboard = new HashSet<string>(fitted.Values.Where(v => v != null));
        StationFrame(page, n, me);

        float boxH = Mathf.Min(560, StationH - 280);
        var area = Hud.At(Hud.Rect(page, "Ship"), new Vector2(0.5f, 0.5f), new Vector2(0, -4), new Vector2(1040, boxH));
        // The schematic: the hull in blueprint lines, every slot outlined (dashed while empty, filled with its part
        // when fitted); lit where the part in hand could go (not where it already is).
        float sw = Mathf.Min(1040 * 1.4f / 2.4f - 12, boxH / 0.6f), sh = sw * 0.6f, k = sw / 400;
        var plan = Hud.At(Hud.Rect(area, "Schematic"), new Vector2(0, 0.5f), Vector2.zero, new Vector2(sw, sh));
        Kit.Picture(plan, "ship-hull", Color.white);
        var nodeId = n.Id;
        foreach (var sl in Parts.ShipSlots)
        {
            fitted.TryGetValue(sl.Id, out var there);
            var part = Parts.ShipPart(there);
            bool lit = pick != null && fits.Contains(sl.Id) && there != pick;
            var ink = part != null && Kit.RarityInk.TryGetValue(part.Rarity, out var rarity) ? rarity : Kit.RarityInk["dwarf"];
            if (lit) Kit.Picture(plan, $"ship-{sl.Id}-fill", Kit.SlotLitFill);
            else if (part != null) Kit.Picture(plan, $"ship-{sl.Id}-fill", ink.fill);
            if (lit) Kit.Picture(plan, $"ship-{sl.Id}-line", Kit.SlotLitLine);
            else if (part != null) Kit.Picture(plan, $"ship-{sl.Id}-line", ink.line);
            else Kit.Picture(plan, $"ship-{sl.Id}-dash", Kit.SlotLine);
            if (!Kit.SlotBox.TryGetValue(sl.Id, out var bx)) continue;
            var hit = Hud.At(Hud.Rect(plan, sl.Id), new Vector2(0, 1), new Vector2(bx.x * k, -bx.y * k), new Vector2(bx.z * k, bx.w * k));
            hit.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0.001f);
            var slot = sl.Id;
            hit.gameObject.AddComponent<Button>().onClick.AddListener(() => ArSlot(nodeId, slot));
        }

        // Every part in the hangar: its picture, its name; fitted, marked so.
        var grid = Hud.Rect(area, "Parts");
        grid.anchorMin = new Vector2(0, 0);
        grid.anchorMax = new Vector2(1, 1);
        grid.offsetMin = new Vector2(sw + 24, 0);
        grid.offsetMax = Vector2.zero;
        var owned = Parts.ShipParts.Where(p => have.Contains(p.Id)).ToList();
        if (owned.Count == 0) Hud.Label(grid, "No parts yet.", 15, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Left);
        else
        {
            float gw = 1040 - sw - 24, gap = 8;
            int cols = Mathf.Max(1, Mathf.FloorToInt((gw + gap) / (96 + gap)));
            float tw = (gw - gap * (cols - 1)) / cols, th = 112;
            int rows = (owned.Count + cols - 1) / cols;
            float need = rows * th + (rows - 1) * gap + 6;
            var content = Kit.Scroller(grid, Mathf.Max(need, boxH));
            float top = 3 + Mathf.Max(0, (boxH - need) / 2);
            for (int i = 0; i < owned.Count; i++)
            {
                var p = owned[i];
                var spot = new Vector2((i % cols) * (tw + gap) + 3, -(top + (i / cols) * (th + gap)));
                if (pick == p.Id)
                {
                    var ring = Hud.Glass(content, p.Id + " ring", Kit.PickRing, false);
                    Hud.At((RectTransform)ring.transform, new Vector2(0, 1), spot + new Vector2(-2.5f, 2.5f), new Vector2(tw + 5, th + 5));
                    ring.raycastTarget = false;
                }
                var tile = Hud.Glass(content, p.Id, aboard.Contains(p.Id) ? (Color)new Color32(0xf6, 0xf9, 0xfd, 255) : Color.white, false);
                Hud.At((RectTransform)tile.transform, new Vector2(0, 1), spot, new Vector2(tw, th));
                var icon = Hud.At(Hud.Rect(tile.transform, "Icon"), new Vector2(0.5f, 1), new Vector2(0, -8), new Vector2(64, 64));
                var ii = icon.gameObject.AddComponent<RawImage>();
                ii.texture = Resources.Load<Texture2D>($"Icons/part-{p.Kind}-{p.Rarity}");
                ii.raycastTarget = false;
                var nm = Hud.Label(tile.transform, p.Name.ToUpperInvariant(), 9, Look.Ink, true, 500, 14, TextAlignmentOptions.Top);
                nm.textWrappingMode = TextWrappingModes.Normal;
                nm.margin = new Vector4(6, 76, 6, 0);
                if (aboard.Contains(p.Id))
                {
                    var fit = Hud.Label(tile.transform, "fitted", 11, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Bottom);
                    fit.margin = new Vector4(0, 0, 0, 6);
                }
                var b = tile.gameObject.AddComponent<Button>();
                var id = p.Id;
                b.onClick.AddListener(() => { Sound.Play("hover"); arPick = arPick == id ? null : id; Station(); });
                if (used)
                {
                    b.interactable = false;
                    tile.gameObject.AddComponent<CanvasGroup>().alpha = 0.55f;
                }
            }
        }

        var act = Hud.At(Hud.Rect(page, "Act"), new Vector2(0.5f, 0), new Vector2(0, 74), new Vector2(1000, 54));
        var held = Parts.ShipPart(pick);
        Kit.Across(act, 14, Kit.Hint(act, used ? "refitted here · one part per station" : held != null ? $"{held.Text} · tap its slot" : have.Count > 0 ? "swap one part · pick it, then its slot" : "no parts in your hangar yet"));
    }

    /// <summary>A part in hand, fitted in this slot (one swap per station); the run's fit kept as the hangar's too.</summary>
    void ArSlot(string nodeId, string slot)
    {
        if (arPick == null) return;
        if (Apply(new CampaignAction { Type = "swapPart", NodeId = nodeId, PartSlot = slot, PartId = arPick }))
        {
            var meta = LoadMeta();
            meta.Fitted = new Dictionary<string, string>(state.Run?.Ship?.Fitted ?? new Dictionary<string, string>());
            SaveMeta(meta);
            Sound.Play("upgrade");
            arPick = null;
            // (The ship on the map refitted.)
            Map();
        }
        Station();
        Refresh();
    }

    // ---- The research station ----

    /// <summary>
    /// A research station, on the Captain's runs (a story scene): its lab comes alongside, its scientist offers three
    /// experiments, each a big gain at a big cost; one picked, then volunteer (or not today).
    /// </summary>
    void LabScene(RectTransform page, CampaignNode n)
    {
        StoryShip(true, "lab");
        var st = n.Station;
        bool taken = st.TakenBy != null;
        var me = Campaign.Player(state);
        var options = st.Options ?? new List<string>();
        var pick = rsPick != null && options.Contains(rsPick) && !taken ? rsPick : null;
        page.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0);
        var kicker = Hud.Label(page, "RESEARCH STATION", 11, Look.InkSoft, true, 500, 30, TextAlignmentOptions.Top);
        kicker.margin = new Vector4(0, 18, 0, 0);
        var title = Hud.Label(page, n.Name.ToUpperInvariant(), 22, Look.Ink, true, 400, 26, TextAlignmentOptions.Top);
        title.margin = new Vector4(0, 36, 0, 0);
        var talk = Hud.At(Hud.Rect(page, "Talk"), new Vector2(0.5f, 0), new Vector2(0, 18), new Vector2(720, 0));
        // (From the foot up: the choices, the experiments, then the lines, the last nearest them.)
        var acts = Hud.At(Hud.Rect(talk, "Actions"), new Vector2(0.5f, 0), Vector2.zero, new Vector2(900, 56));
        var nodeId = n.Id;
        if (taken) Buttons(acts, ("fly on", true, null, () => LeaveStation()));
        else Buttons(acts, ("not today", false, null, () => LeaveStation()), ("volunteer", true, pick == null ? "" : null, () => TakeProject(nodeId, pick)));
        float y = 66;
        if (!taken)
        {
            var offers = options.Where(o => !Research.RetiredResearch.Contains(o)).Select(o => Research.ResearchProject(o)).Where(o => o != null).ToList();
            const float OfferW = 190, OfferGap = 10;
            float h = offers.Count > 0 ? offers.Max(o => Kit.ExperimentHeight(o, OfferW)) : 0;
            for (int i = 0; i < offers.Count; i++)
            {
                var p = offers[i];
                var why = Campaign.ResearchProblem(state, me, n, p.Id);
                string mode = why != null ? "gone" : pick == p.Id ? "picked" : "";
                var r = Hud.At(Hud.Rect(talk, p.Id), new Vector2(0.5f, 0), new Vector2((i - (offers.Count - 1) / 2f) * (OfferW + OfferGap), y + (mode == "picked" ? 3 : 0)), new Vector2(OfferW, h));
                var id = p.Id;
                Kit.Experiment(r, p, mode, why == null ? () => { Sound.Play("hover"); rsPick = rsPick == id ? null : id; Station(); } : (System.Action)null);
            }
            y += h + 14;
        }
        var lines = taken
            ? new List<(string who, string text)> { ("visitor", "The experiment is done, Captain. There is nothing left here to try.") }
            : new List<(string who, string text)> { ("visitor", "Captain! Volunteers, at last. Everything we make here works. Mostly. There is always a price."), ("captain", "Show us what you have.") };
        for (int i = lines.Count - 1; i >= 0; i--)
        {
            var (who, text) = lines[i];
            bool them = who == "visitor";
            var said = Hud.Label(talk, $"<size=62%><color=#737780>{(them ? "THE SCIENTIST" : "THE CAPTAIN")}</color></size>\n{(them ? "<i>" : "")}{text}{(them ? "</i>" : "")}", 17, Look.Ink, false, 400, 0, TextAlignmentOptions.BottomLeft);
            said.textWrappingMode = TextWrappingModes.Normal;
            var lr = said.rectTransform;
            lr.anchorMin = lr.anchorMax = new Vector2(0.5f, 0);
            lr.pivot = new Vector2(0.5f, 0);
            float lh = said.GetPreferredValues(said.text, 676, 0).y;
            lr.sizeDelta = new Vector2(676, lh);
            lr.anchoredPosition = new Vector2(22, y);
            // (The Captain's face beside their words; the scientist's set in as far, without one.)
            if (!them) Kit.Disc(talk, EngineData.Art(Captain.CaptainCard), new Vector2(0.5f, 0), new Vector2(-343, y + lh - 34), 34);
            y += lh + 10;
        }
    }

    /// <summary>
    /// A research station on another's run [direction: on the page's own paper, nothing boxed]: its name small at the
    /// top; its upgrades across the middle, each a glowing mark, its name and what it does beneath; one tapped lifts and
    /// glows, and confirm waits beneath them. What you carry already, a line at the foot.
    /// </summary>
    void ResearchPage(RectTransform page, CampaignNode n)
    {
        var me = Campaign.Player(state);
        var st = n.Station;
        var taken = st.TakenBy;
        var options = st.Options ?? new List<string>();
        var pick = rsPick != null && options.Contains(rsPick) && taken == null ? rsPick : null;
        Kit.Paper(page);
        Kit.Head(page, "research station", n.Name);
        // (Upgrades retired from the game, left in an older save's station, are not offered.)
        var offers = options.Where(o => !Research.RetiredResearch.Contains(o)).Select(o => Research.ResearchProject(o)).Where(o => o != null).ToList();
        const float OfferW = 200, OfferGap = 56;
        for (int i = 0; i < offers.Count; i++)
        {
            var p = offers[i];
            var why = taken != null ? null : Campaign.ResearchProblem(state, me, n, p.Id);
            string mode = taken != null ? (st.Project == p.Id ? "chosen" : "gone") : why != null ? "gone" : pick == p.Id ? "picked" : "";
            var r = Hud.At(Hud.Rect(page, p.Id), new Vector2(0.5f, 0), new Vector2((i - (offers.Count - 1) / 2f) * (OfferW + OfferGap), 160 + (mode == "picked" ? 8 : 0)), new Vector2(OfferW, 280));
            Kit.ResearchMark(r, p, 84, mode == "picked" || mode == "chosen", new Vector2(0.5f, 1), Vector2.zero);
            var called = Hud.Label(r, p.Name.ToUpperInvariant(), 12, Look.Ink, true, 400, 24, TextAlignmentOptions.Top);
            called.textWrappingMode = TextWrappingModes.Normal;
            called.margin = new Vector4(0, 98, 0, 0);
            float nh = called.GetPreferredValues(called.text, OfferW, 0).y;
            var words = Hud.Label(r, p.Text ?? "", 15, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
            words.textWrappingMode = TextWrappingModes.Normal;
            words.margin = new Vector4(0, 98 + nh + 10, 0, 0);
            float wh = words.GetPreferredValues(words.text, OfferW, 0).y;
            // (Its tier: a dot for each.)
            for (int d = 0; d < p.Tier; d++)
            {
                var dot = Hud.At(Hud.Rect(r, "Tier"), new Vector2(0.5f, 1), new Vector2((d - (p.Tier - 1) / 2f) * 9, -(98 + nh + 10 + wh + 12)), new Vector2(5, 5));
                var di = dot.gameObject.AddComponent<Image>();
                di.sprite = Hud.Circle;
                di.color = new Color(Look.InkFaint.r, Look.InkFaint.g, Look.InkFaint.b, 0.6f);
                di.raycastTarget = false;
            }
            r.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0.001f);
            var b = r.gameObject.AddComponent<Button>();
            var id = p.Id;
            if (taken == null && why == null) b.onClick.AddListener(() => { Sound.Play("hover"); rsPick = rsPick == id ? null : id; Station(); });
            else b.interactable = false;
            if (mode == "gone") r.gameObject.AddComponent<CanvasGroup>().alpha = 0.4f;
        }
        // [direction: no way back to the map but a confirm beneath the options, which takes the one picked and returns]
        bool open = taken == null && offers.Any(o => Campaign.ResearchProblem(state, me, n, o.Id) == null);
        var act = Hud.At(Hud.Rect(page, "Act"), new Vector2(0.5f, 0), new Vector2(0, 86), new Vector2(1000, 54));
        var nodeId = n.Id;
        var confirm = Kit.Go(act, "confirm", true, open && pick == null ? "" : null, () => TakeProject(nodeId, pick));
        if (taken != null) Kit.Across(act, 14, Kit.Hint(act, taken == me.Id ? "taken" : $"taken by {Campaign.FactionById(state, taken).Name.ToLowerInvariant()}"), confirm);
        else Kit.Across(act, 14, confirm);
        // What you carry already.
        var done = (me.Research?.Done ?? new List<string>()).Where(o => !Research.RetiredResearch.Contains(o)).Select(o => Research.ResearchProject(o)).Where(o => o != null).ToList();
        if (done.Count > 0)
        {
            var foot = Hud.At(Hud.Rect(page, "Carried"), new Vector2(0.5f, 0), new Vector2(0, 24), new Vector2(1400, 30));
            var items = new List<RectTransform> { Kit.Hint(foot, "carried") };
            items.AddRange(done.Select(o => Kit.Hint(foot, o.Name, false, Look.InkSoft)));
            Kit.Across(foot, 14, items.ToArray());
        }
    }

    /// <summary>Confirm: the upgrade picked is taken (nothing picked: just back), and it is back to the map.</summary>
    void TakeProject(string nodeId, string project)
    {
        if (project != null)
        {
            if (!Apply(new CampaignAction { Type = "research", NodeId = nodeId, ProjectId = project })) return;
            Sound.Play("upgrade");
        }
        rsPick = null;
        LeaveStation();
    }
}

/// <summary>The stations' building blocks: their colours, the paper, words, buttons and tokens laid along a line.</summary>
static class StationKit
{
    public static readonly Color Warn = new Color32(0xc0, 0x56, 0x3f, 255);
    public static readonly Color Short = new Color32(0xb9, 0xbd, 0xc8, 255);
    public static readonly Color Boon = new Color32(0x2f, 0x7d, 0x55, 255);
    public static readonly Color Bane = new Color32(0xb5, 0x50, 0x3a, 255);
    public static readonly Color MarkInk = new Color32(0x3a, 0x42, 0x56, 255);
    public static readonly Color MarkLit = new Color32(0x2f, 0x6d, 0xb5, 255);
    public static readonly Color SlotLine = new Color32(0x8e, 0xa6, 0xc8, 255);
    public static readonly Color SlotLitLine = new Color32(0xb8, 0x89, 0x2f, 255);
    public static readonly Color SlotLitFill = new Color(214 / 255f, 189 / 255f, 122 / 255f, 0.22f);
    public static readonly Color PickRing = new Color32(0xd6, 0xbd, 0x7a, 255);

    /// <summary>A card on the shelf: its width, its height, and its cell's (its price beneath it).</summary>
    public const float CardW = 124, CardH = 174, CellH = CardH + 8 + 22;

    /// <summary>A rarity's colours on the schematic (hangar.ts RARITY_INK): its fill and its line.</summary>
    public static readonly Dictionary<string, (Color fill, Color line)> RarityInk = new Dictionary<string, (Color fill, Color line)>
    {
        ["dwarf"] = (new Color32(0xcf, 0xe0, 0xf5, 255), new Color32(0x5f, 0x86, 0xb8, 255)),
        ["stellar"] = (new Color32(0xf6, 0xe3, 0xb0, 255), new Color32(0xb8, 0x89, 0x2f, 255)),
        ["anomaly"] = (new Color32(0xe2, 0xd6, 0xf6, 255), new Color32(0x7a, 0x5c, 0xc0, 255)),
    };

    /// <summary>Where each slot's shape lies on the schematic (hangar.ts SLOT_BOX, in its 400 × 240): x, y, width, height.</summary>
    public static readonly Dictionary<string, Vector4> SlotBox = new Dictionary<string, Vector4>
    {
        ["armour"] = new Vector4(100, 80, 180, 80), ["shield"] = new Vector4(172, 94, 56, 52), ["port"] = new Vector4(210, 46, 90, 38),
        ["starboard"] = new Vector4(210, 156, 90, 38), ["booster"] = new Vector4(14, 84, 74, 72), ["warp"] = new Vector4(94, 94, 60, 52),
    };

    /// <summary>A research project's mark, as the skill tree's like upgrades have it (by its icon); any other, the flask.</summary>
    static readonly Dictionary<string, string> ResearchLook = new Dictionary<string, string>
    {
        ["cool"] = "cryo", ["energy"] = "foundry", ["hull"] = "plating", ["mend"] = "mend", ["draw"] = "cards", ["loot"] = "scouts",
    };

    /// <summary>The page's own paper: lighter at the top, a little shade at the foot.</summary>
    public static void Paper(RectTransform page)
    {
        page.gameObject.AddComponent<Image>().color = Look.Paper;
        foreach (var (anchor, size, c) in new[]
        {
            (new Vector2(0.5f, 1), new Vector2(1500, 760), new Color(1, 1, 1, 0.8f)),
            (new Vector2(0.5f, 0), new Vector2(2200, 620), new Color(0.87f, 0.863f, 0.847f, 0.8f)),
        })
        {
            var g = Hud.Rect(page, "Glow");
            g.anchorMin = g.anchorMax = anchor;
            g.pivot = new Vector2(0.5f, 0.5f);
            g.anchoredPosition = Vector2.zero;
            g.sizeDelta = size;
            var gi = g.gameObject.AddComponent<Image>();
            gi.sprite = Hud.Soft;
            gi.color = c;
            gi.raycastTarget = false;
        }
    }

    /// <summary>A station's kind small at the top, its name under it in wide capitals.</summary>
    public static void Head(RectTransform page, string kind, string name)
    {
        var k = Hud.At(Hud.Rect(page, "Kind"), new Vector2(0.5f, 1), new Vector2(0, -24), new Vector2(900, 18));
        Hud.Label(k, kind.ToUpperInvariant(), 12, Look.InkFaint, true, 500, 36);
        var t = Hud.At(Hud.Rect(page, "Name"), new Vector2(0.5f, 1), new Vector2(0, -44), new Vector2(1400, 46));
        Hud.Label(t, name.ToUpperInvariant(), 34, Look.Ink, true, 400, 42);
    }

    /// <summary>A hint in small spaced capitals (a warning in red); sized to its words.</summary>
    public static RectTransform Hint(Transform row, string text, bool warn = false, Color? colour = null)
    {
        var r = Hud.Rect(row, "Hint");
        var t = Hud.Label(r, text.ToUpperInvariant(), 12, warn ? Warn : colour ?? Look.InkFaint, true, 500, warn ? 14 : 30);
        r.sizeDelta = new Vector2(t.GetPreferredValues(t.text).x + 4, 24);
        return r;
    }

    /// <summary>A pill button whose words may carry materials (⬢): primary (ink, white words) or plain; held back (why) faded.</summary>
    public static RectTransform Go(Transform parent, string text, bool primary, string why, System.Action act, float size = 13, float height = 48)
    {
        var b = Hud.Pill(parent, "", () => act(), size, primary ? Look.Ink : new Color(1, 1, 1, 0.8f), primary ? Color.white : Look.InkSoft);
        var r = (RectTransform)b.transform;
        float w = Inline(r, text.ToUpperInvariant(), size, primary ? Color.white : Look.InkSoft, new Vector2(0.5f, 0.5f), Vector2.zero, true, 500, size < 12 ? 16 : 26);
        r.sizeDelta = new Vector2(w + (size < 12 ? 30 : 56), height);
        b.interactable = why == null;
        if (why != null) r.gameObject.AddComponent<CanvasGroup>().alpha = 0.45f;
        return r;
    }

    /// <summary>Things laid across a row, centred, a gap between each.</summary>
    public static void Across(RectTransform row, float gap, params RectTransform[] items)
    {
        float total = items.Sum(it => it.sizeDelta.x) + gap * (items.Length - 1);
        float x = -total / 2;
        foreach (var r in items)
        {
            r.anchorMin = r.anchorMax = r.pivot = new Vector2(0.5f, 0.5f);
            r.anchoredPosition = new Vector2(x + r.sizeDelta.x / 2, 0);
            x += r.sizeDelta.x + gap;
            Nudge(r);
        }
    }

    /// <summary>A rect moved: its size touched, so a glass shadow under it follows it there at once.</summary>
    public static void Nudge(RectTransform r)
    {
        var size = r.sizeDelta;
        r.sizeDelta = size + Vector2.one;
        r.sizeDelta = size;
    }

    /// <summary>Words and materials tokens along a line (each ⬢ in the words drawn as the token), placed by an anchor; its width.</summary>
    public static float Inline(Transform parent, string text, float size, Color c, Vector2 anchor, Vector2 at, bool display = true, int weight = 500, float spacing = 8)
    {
        var line = Hud.Rect(parent, "Inline");
        var bits = text.Split('⬢');
        float x = 0, tok = size * 1.35f, h = Mathf.Max(tok, size * 1.6f);
        var mark = Resources.Load<Texture2D>("Icons/materials");
        for (int i = 0; i < bits.Length; i++)
        {
            if (i > 0)
            {
                var m = Hud.At(Hud.Rect(line, "Materials"), new Vector2(0, 0.5f), new Vector2(x + 2, 0), new Vector2(tok, tok));
                var mi = m.gameObject.AddComponent<RawImage>();
                mi.texture = mark;
                mi.raycastTarget = false;
                x += tok + 5;
            }
            if (bits[i].Length == 0) continue;
            var r = Hud.Rect(line, "Words");
            var t = Hud.Label(r, bits[i], size, c, display, weight, spacing, TextAlignmentOptions.Left);
            float w = t.GetPreferredValues(bits[i]).x + 2;
            Hud.At(r, new Vector2(0, 0.5f), new Vector2(x, 0), new Vector2(w, h));
            x += w;
        }
        Hud.At(line, anchor, at, new Vector2(x, h));
        return x;
    }

    /// <summary>A picture laid over the whole of its rect (the schematic's pieces, tinted).</summary>
    public static void Picture(RectTransform parent, string icon, Color tint)
    {
        var r = Hud.Rect(parent, icon);
        Hud.Fill(r);
        var raw = r.gameObject.AddComponent<RawImage>();
        raw.texture = Resources.Load<Texture2D>("Icons/" + icon);
        raw.color = tint;
        raw.raycastTarget = false;
    }

    /// <summary>A face in a circle, ringed (a keeper, the Captain).</summary>
    public static void Disc(Transform parent, Texture tex, Vector2 anchor, Vector2 at, float size)
    {
        var face = Hud.At(Hud.Rect(parent, "Face"), anchor, at, new Vector2(size, size));
        var ring = face.gameObject.AddComponent<Image>();
        ring.sprite = Hud.Circle;
        ring.color = new Color(0.82f, 0.68f, 0.38f);
        ring.raycastTarget = false;
        var inner = Hud.Rect(face, "Inner");
        Hud.Fill(inner);
        inner.offsetMin = new Vector2(2, 2);
        inner.offsetMax = new Vector2(-2, -2);
        var ii = inner.gameObject.AddComponent<Image>();
        ii.sprite = Hud.Circle;
        ii.raycastTarget = false;
        inner.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var pic = Hud.Rect(inner, "Picture");
        Hud.Fill(pic);
        var raw = pic.gameObject.AddComponent<RawImage>();
        raw.texture = tex;
        raw.raycastTarget = false;
    }

    /// <summary>A rect whose content scrolls up and down (held in it), at a height; the content.</summary>
    public static RectTransform Scroller(RectTransform area, float height)
    {
        area.gameObject.AddComponent<RectMask2D>();
        area.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0.001f);
        var content = Hud.Rect(area, "Content");
        content.anchorMin = new Vector2(0, 1);
        content.anchorMax = new Vector2(1, 1);
        content.pivot = new Vector2(0.5f, 1);
        content.offsetMin = content.offsetMax = Vector2.zero;
        content.sizeDelta = new Vector2(0, height);
        var sr = area.gameObject.AddComponent<ScrollRect>();
        sr.content = content;
        sr.viewport = area;
        sr.horizontal = false;
        sr.movementType = ScrollRect.MovementType.Clamped;
        sr.scrollSensitivity = 30;
        return content;
    }

    /// <summary>An upgrade's mark: its sign on a pale disc, a hairline round it; lit (picked or chosen), ringed in blue and glowing.</summary>
    public static void ResearchMark(Transform parent, ResearchProject p, float size, bool lit, Vector2 anchor, Vector2 at)
    {
        var m = Hud.At(Hud.Rect(parent, "Mark"), anchor, at, new Vector2(size, size));
        if (lit)
        {
            var halo = Hud.At(Hud.Rect(m, "Halo"), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size * 1.8f, size * 1.8f));
            var hi = halo.gameObject.AddComponent<Image>();
            hi.sprite = Hud.Soft;
            hi.color = new Color(150 / 255f, 200 / 255f, 1, 0.5f);
            hi.raycastTarget = false;
        }
        float edge = lit ? 3 : 2;
        var ring = Hud.At(Hud.Rect(m, "Ring"), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size + edge, size + edge));
        var ri = ring.gameObject.AddComponent<Image>();
        ri.sprite = Hud.Circle;
        ri.color = lit ? new Color(80 / 255f, 140 / 255f, 220 / 255f, 0.6f) : new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.12f);
        ri.raycastTarget = false;
        var disc = Hud.At(Hud.Rect(m, "Disc"), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size, size));
        var di = disc.gameObject.AddComponent<Image>();
        di.sprite = Hud.Circle;
        di.color = new Color(0.975f, 0.978f, 0.986f);
        di.raycastTarget = false;
        var icon = Hud.At(Hud.Rect(m, "Icon"), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size * 0.46f, size * 0.46f));
        var raw = icon.gameObject.AddComponent<RawImage>();
        bool own = p.Icon != null && ResearchLook.ContainsKey(p.Icon);
        raw.texture = Resources.Load<Texture2D>(own ? $"Icons/up-{ResearchLook[p.Icon]}" : "Icons/research-flask");
        raw.color = own ? (lit ? MarkLit : MarkInk) : Color.white;
        raw.raycastTarget = false;
    }

    /// <summary>How tall an experiment's card stands, at a width (its mark, its name, what it gives and what it costs).</summary>
    public static float ExperimentHeight(ResearchProject p, float w)
    {
        var probe = new GameObject("Probe", typeof(RectTransform));
        var t = probe.AddComponent<TextMeshProUGUI>();
        float h = 10 + 52 + 6;
        Look.Style(t, 10, Look.Ink, true, 400, 20);
        t.textWrappingMode = TextWrappingModes.Normal;
        h += t.GetPreferredValues(p.Name.ToUpperInvariant(), w - 16, 0).y + 5;
        Look.Style(t, 13, Boon, false, 400, 0);
        t.textWrappingMode = TextWrappingModes.Normal;
        bool twoSided = !string.IsNullOrEmpty(p.Boon);
        h += t.GetPreferredValues(twoSided ? p.Boon : p.Text ?? "", w - 16, 0).y;
        if (twoSided) h += 4 + t.GetPreferredValues(p.Bane ?? "", w - 16, 0).y;
        Mats.Kill(probe);
        return h + 12;
    }

    /// <summary>An experiment: its mark, its name, what it gives (in green) and what it costs (in red); picked, ringed in ink.</summary>
    public static void Experiment(RectTransform r, ResearchProject p, string mode, System.Action act)
    {
        if (mode == "picked" || mode == "chosen")
        {
            var ring = Hud.Glass(r, "Ring", Look.Ink, mode == "picked");
            var rr = (RectTransform)ring.transform;
            Hud.Fill(rr);
            rr.offsetMin = new Vector2(-2, -2);
            rr.offsetMax = new Vector2(2, 2);
            ring.raycastTarget = false;
        }
        var card = Hud.Glass(r, "Card", new Color(1, 1, 1, 0.82f), false);
        Hud.Fill((RectTransform)card.transform);
        float w = r.sizeDelta.x - 16;
        ResearchMark(card.transform, p, 52, mode == "picked" || mode == "chosen", new Vector2(0.5f, 1), new Vector2(0, -10));
        var called = Hud.Label(card.transform, p.Name.ToUpperInvariant(), 10, Look.Ink, true, 400, 20, TextAlignmentOptions.Top);
        called.textWrappingMode = TextWrappingModes.Normal;
        called.margin = new Vector4(8, 68, 8, 0);
        float nh = called.GetPreferredValues(called.text, w, 0).y;
        bool twoSided = !string.IsNullOrEmpty(p.Boon);
        var boon = Hud.Label(card.transform, twoSided ? p.Boon : p.Text ?? "", 13, Boon, false, 400, 0, TextAlignmentOptions.Top);
        boon.textWrappingMode = TextWrappingModes.Normal;
        boon.margin = new Vector4(8, 68 + nh + 5, 8, 0);
        if (twoSided)
        {
            float bh = boon.GetPreferredValues(boon.text, w, 0).y;
            var bane = Hud.Label(card.transform, p.Bane ?? "", 13, Bane, false, 400, 0, TextAlignmentOptions.Top);
            bane.textWrappingMode = TextWrappingModes.Normal;
            bane.margin = new Vector4(8, 68 + nh + 5 + bh + 4, 8, 0);
        }
        var b = card.gameObject.AddComponent<Button>();
        if (act != null) b.onClick.AddListener(() => act());
        else b.interactable = false;
        if (mode == "gone") r.gameObject.AddComponent<CanvasGroup>().alpha = 0.4f;
    }
}
