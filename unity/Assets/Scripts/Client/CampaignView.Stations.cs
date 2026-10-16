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

    /// <summary>
    /// Where a station's page puts things at this size (styles.css .ar: a grid of its head, its shelf, its action, a
    /// spacer and its keeper, padded clear of the safe area; on a short screen, max-height 560, everything a size down,
    /// no keeper): its padding (top, right, bottom, left), where its tabs are, where the shelf starts, where the action
    /// row is and how tall, where the keeper stands.
    /// </summary>
    struct ArLayout
    {
        public bool Phone;
        public Vector4 Pad;
        public float HeadTop, H3, TabsY, ShelfTop, ActY, ActH, KeeperY;
    }

    ArLayout ArLay(bool tabs = true)
    {
        const float Z = WebLook.Zoom;
        var sa = overlay.GetComponent<RefLayer>().Insets;
        bool phone = Css.MaxHeight(560);
        var l = new ArLayout { Phone = phone };
        l.Pad = new Vector4(Mathf.Max((phone ? 10 : 16) * Z, sa.x), Mathf.Max(20 * Z, sa.y), Mathf.Max(14 * Z, sa.z), Mathf.Max(20 * Z, sa.w));
        // (.ar-head: 4 down; its kind small (not on a phone), 4, its name clamp(1.3rem, 4.4vh, 2.1rem) (on a phone
        // 1.05rem), 4, and its tabs 6 under it (on a phone 2), 19 high.)
        l.HeadTop = l.Pad.x + 4 * Z;
        l.H3 = (phone ? 1.05f * 16 : Css.Clamp(1.3f * 16, 4.4f * PH / Z / 100, 2.1f * 16)) * Z;
        float y = l.HeadTop + (phone ? 0 : 0.6f * 16 * Z * 1.25f + 4 * Z) + l.H3 * 1.25f;
        l.TabsY = y + 4 * Z + (phone ? 2 : 6) * Z;
        l.ShelfTop = tabs ? l.TabsY + 0.62f * 16 * Z * 1.25f + 8 * Z : y;
        // (From the foot up: the keeper (44; none on a phone), the spacer (12; on a phone 44), the action (at least 54;
        // on a phone 40).)
        l.KeeperY = PH - l.Pad.z - (phone ? 0 : 44 * Z);
        l.ActH = (phone ? 40 : 54) * Z;
        l.ActY = l.KeeperY - (phone ? 44 : 12) * Z - l.ActH;
        return l;
    }

    /// <summary>The row a station's one action sits in (.ar-act), across the middle of the page.</summary>
    RectTransform ActRow(RectTransform page, ArLayout l) => WebLook.Box(page, "Act", PW / 2 - Mathf.Min(500, PW / 2), l.ActY, Mathf.Min(1000, PW), l.ActH);

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
        arRedress = null;
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
        var lay = ArLay();
        StationFrame(page, n, me, lay);

        // The shelf (.ar-shelf): the cards across the middle, a little tilted each, wrapping to more rows (scrolled) if
        // need be; min(1100, the page inside its padding) across, padded 30 20 24, 26 and 22 apart (on a phone 16 10
        // 10, 14 and 14).
        const float Z = WebLook.Zoom;
        float shelfW = Mathf.Min(1100 * Z, PW - lay.Pad.y - lay.Pad.w), areaH = lay.ActY - lay.ShelfTop;
        var area = WebLook.Box(page, "Shelf", PW / 2 - shelfW / 2, lay.ShelfTop, shelfW, areaH);
        // (Each card's place on the shelf, and how it is dressed there for what is picked.)
        var cells = new List<RectTransform>();
        var cards = new List<System.Action>();
        if (list.Count == 0)
            Hud.Label(area, (arTab == "buy" ? "sold out" : "nothing in your deck").ToUpperInvariant(), 0.7f * 16 * Z, Look.InkFaint, true, 400, 30);
        else
        {
            float GapX = (lay.Phone ? 14 : 22) * Z, GapY = (lay.Phone ? 14 : 26) * Z, padTop = (lay.Phone ? 16 : 30) * Z, padX = (lay.Phone ? 10 : 20) * Z, padFoot = (lay.Phone ? 10 : 24) * Z;
            int cols = Mathf.Max(1, Mathf.FloorToInt((shelfW - 2 * padX + GapX) / (Kit.CardW + GapX)));
            int rows = (list.Count + cols - 1) / cols;
            float need = padTop + rows * Kit.CellH + (rows - 1) * GapY + padFoot;
            var content = Kit.Scroller(area, Mathf.Max(need, areaH));
            float top = padTop + Mathf.Max(0, (areaH - need) / 2);
            for (int i = 0; i < list.Count; i++)
            {
                var id = list[i];
                int row = i / cols, inRow = Mathf.Min(cols, list.Count - row * cols);
                float x = ((i % cols) - (inRow - 1) / 2f) * (Kit.CardW + GapX);
                string tag = arTab == "buy" ? $"⬢{Campaign.BuyPrice(state, me, id)}" : arTab == "recycle" ? $"×{Have(deck, id)} · +⬢{Campaign.RecycleValue(id)}" : $"×{Have(deck, id)}";
                Color ink = arTab == "buy" && me.Materials < Campaign.BuyPrice(state, me, id) ? Kit.Short : Look.Ink;
                var cell = Hud.At(Hud.Rect(content, id), new Vector2(0.5f, 1), new Vector2(x, -(top + row * (Kit.CellH + GapY))), new Vector2(Kit.CardW, Kit.CellH));
                int at = i;
                cells.Add(cell);
                cards.Add(() =>
                {
                    bool picked = arTab == "fuse" ? arFuse.Contains(id) : arPick == id;
                    ShelfCard(cell, id, at, picked, tag, ink, picked && arTab != "fuse");
                });
            }
        }

        // The one action, beneath the row (once each here: a buy, a recycle, a fusion).
        var act = ActRow(page, lay);
        foreach (var card in cards) card();
        ArAct(act, list, st, me, n);
        // (A card tapped: the shelf's cards and the action under them dressed again where they are, the shelf held
        // where it was scrolled to, as the web's morph keeps the page: the station is not drawn again.)
        arRedress = () =>
        {
            foreach (var cell in cells) foreach (Transform c in cell) Mats.Kill(c.gameObject);
            foreach (Transform c in act) Mats.Kill(c.gameObject);
            foreach (var card in cards) card();
            ArAct(act, list, st, me, n);
        };

        // The keeper, at the foot: their face and their line, nothing round them (none on a phone).
        bool buying = arTab == "buy";
        if (lay.Phone) return;
        var keeper = buying ? BlueLoop.Engine.Story.Quartermaster : BlueLoop.Engine.Story.Recycler;
        var lines = buying ? BlueLoop.Engine.Story.QuartermasterLines : BlueLoop.Engine.Story.RecyclerLines;
        if (keeper != null && lines != null && lines.Count > 0)
        {
            var foot = Hud.At(Hud.Rect(page, "Keeper"), new Vector2(0, 0), new Vector2(lay.Pad.w, lay.Pad.z - 1), new Vector2(Mathf.Min(560 * Z, PW * 0.9f), 66));
            Kit.Disc(foot, Resources.Load<Texture2D>(buying ? "Portraits/hesk" : "Portraits/tallow"), new Vector2(0, 0.5f), Vector2.zero, 64);
            var who = WebLook.Words(foot, keeper.Name.ToUpperInvariant(), 13.5f, 0.26f, Look.InkSoft, true, 400, TextAlignmentOptions.TopLeft);
            who.margin = new Vector4(81, 0, 0, 0);
            var said = WebLook.Words(foot, $"“{lines[(state.Turn * 3 + keeperVisit) % lines.Count]}”", 18.6f, 0, Look.InkFaint, false, 400, TextAlignmentOptions.TopLeft);
            said.fontStyle = FontStyles.Italic;
            said.textWrappingMode = TextWrappingModes.Normal;
            said.margin = new Vector4(81, 20, 0, 0);
        }
    }

    /// <summary>The armoury's shelf and its action dressed again in place for what is picked now (set by ArmoryPage).</summary>
    System.Action arRedress;

    /// <summary>The armoury's one action, beneath the row (once each here: a buy, a recycle, a fusion), for what is picked.</summary>
    void ArAct(RectTransform act, List<string> list, BlueLoop.Engine.Station st, Faction me, CampaignNode n)
    {
        const float Z = WebLook.Zoom;
        var lay = ArLay();
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
                    // (.ar-fused: 88 across (on a phone 66), 1.4 times as tall.)
                    var fused = Hud.Rect(act, "Fused");
                    fused.sizeDelta = lay.Phone ? new Vector2(66 * Z, 92 * Z) : new Vector2(88 * Z, 124 * Z);
                    var face = fused.gameObject.AddComponent<RawImage>();
                    face.texture = Faces.Of(Builds.FusedId(a, b), Faces.Look.Card, fused.sizeDelta.x / WebLook.Zoom);
                    face.raycastTarget = false;
                    Kit.Printed(fused, Builds.FusedId(a, b), fused.sizeDelta.x, true);
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
        raw.texture = Faces.Of(id, Faces.Look.Card, Kit.CardW / WebLook.Zoom);
        Kit.Printed(face, id, Kit.CardW, true);
        var b = card.gameObject.AddComponent<Button>();
        b.targetGraphic = raw;
        b.onClick.AddListener(() => ArPick(id, inspect));
        Kit.Inline(cell, tag, 0.82f * 16 * WebLook.Zoom, ink, new Vector2(0.5f, 0), Vector2.zero, true, 700, 8);
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
        // (A pick: the shelf and its action dressed again where they are; looking a card over opens over the page.)
        if (!inspect && arRedress != null) arRedress();
        else Station();
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
    void StationFrame(RectTransform page, CampaignNode n, Faction me, ArLayout lay)
    {
        const float Z = WebLook.Zoom;
        var sa = overlay.GetComponent<RefLayer>().Insets;
        Kit.Paper(page);
        // (.ar-back: max(18, the safe area) in, max(14, the safe area) down.)
        WebLook.UpBack(page, LeaveStation, Mathf.Max(18 * Z, sa.w), Mathf.Max(14 * Z, sa.x), "‹ map");
        // Materials (.ar-purse), max(20, the safe area) in from the right, max(16, the safe area) down (on a phone at
        // the foot, max(10, the safe area) up from it); before them, your sun's damage and its repair.
        float x = -Mathf.Max(20 * Z, sa.y);
        var anchor = lay.Phone ? new Vector2(1, 0) : new Vector2(1, 1);
        float py = lay.Phone ? Mathf.Max(10 * Z, sa.z) : -Mathf.Max(16 * Z, sa.x);
        x -= Kit.Inline(page, $"⬢{me.Materials}", 1.05f * 16 * Z, Look.Ink, anchor, new Vector2(x, py), true, 700, 0) + 14 * Z;
        var flag = Campaign.Flagship(state, state.PlayerId);
        if (flag != null && flag.Damage > 0)
        {
            int cost = Campaign.T.ArmyHealCost;
            int most = Mathf.Min(flag.Damage, me.Materials / Mathf.Max(1, cost));
            string why = me.Materials < cost ? "" : null;
            var armyId = flag.Id;
            if (flag.Damage > 1)
            {
                var whole = Kit.Go(page, $"repair all · ⬢{Mathf.Max(1, most) * cost}", false, why, () => StationRepair(armyId, true), 0.56f * 16 * Z, 32);
                Hud.At(whole, anchor, new Vector2(x, py), whole.sizeDelta);
                Kit.Nudge(whole);
                x -= whole.sizeDelta.x + 8;
            }
            var one = Kit.Go(page, $"repair 1 · ⬢{cost}", false, why, () => StationRepair(armyId, false), 0.56f * 16 * Z, 32);
            Hud.At(one, anchor, new Vector2(x, py), one.sizeDelta);
            Kit.Nudge(one);
            x -= one.sizeDelta.x + 10;
            var sun = Hud.Rect(page, "Sun");
            var heat = WebLook.Words(sun, $"SUN ✸{flag.Damage}", 0.6f * 16 * Z, 0.2f, Kit.Warn, true, 400);
            Hud.At(sun, anchor, new Vector2(x, py), new Vector2(heat.GetPreferredValues(heat.text).x + 4, 32));
        }
        Kit.Head(page, "space station", n.Name, lay.HeadTop, lay.H3, !lay.Phone);
        // The tabs: buy, recycle, fuse (where the station can), the ship (the Captain's runs).
        var tabs = new List<string> { "buy", "recycle" };
        if (n.Station.Fuse == true) tabs.Add("fuse");
        if (me.Human == true) tabs.Add("ship");
        // (.ar-tabs: 22 (CSS) apart under the name, small spaced capitals; the one open inked, a dot under it.)
        const float TabGap = 22 * Z;
        float tabH = 0.62f * 16 * Z * 1.25f + 8 * Z;
        var row = Hud.At(Hud.Rect(page, "Tabs"), new Vector2(0.5f, 1), new Vector2(0, -lay.TabsY), new Vector2(0, tabH));
        float tx = 0;
        foreach (var tab in tabs)
        {
            bool open = tab == arTab;
            var r = Hud.Rect(row, tab);
            var t = WebLook.Words(r, tab.ToUpperInvariant(), 0.62f * 16 * Z, 0.3f, open ? Look.Ink : Look.InkFaint, true, 400);
            t.margin = new Vector4(0, 0, 0.3f * 0.62f * 16 * Z, 0);
            float w = t.GetPreferredValues(t.text).x + 4 * Z;
            Hud.At(r, new Vector2(0, 0.5f), new Vector2(tx, 0), new Vector2(w, tabH));
            r.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0.001f);
            var which = tab;
            r.gameObject.AddComponent<Button>().onClick.AddListener(() => StationTab(which));
            if (open)
            {
                // (The tab open: a dot beneath it.)
                var dot = Hud.At(Hud.Rect(r, "Dot"), new Vector2(0.5f, 0), new Vector2(-0.2f * 0.62f * 16 * Z, -4 * Z), new Vector2(4 * Z, 4 * Z));
                var di = dot.gameObject.AddComponent<Image>();
                di.sprite = Hud.Circle;
                di.color = Look.Ink;
                di.raycastTarget = false;
            }
            tx += w + TabGap;
        }
        row.sizeDelta = new Vector2(Mathf.Max(0, tx - TabGap), tabH);
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
        float fh = Mathf.Min(476, PH * 0.86f);
        var f = Hud.At(Hud.Rect(v, "Face"), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(fh / 1.4f, fh));
        var raw = f.gameObject.AddComponent<RawImage>();
        raw.texture = Faces.Of(id, false);
        raw.raycastTarget = false;
        Kit.Printed(f, id, fh / 1.4f);
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
        var lay = ArLay();
        StationFrame(page, n, me, lay);

        // (.ar-ship: min(1000, the page) across, between the tabs and the action: the schematic 1.4 parts of it, the
        // parts 1, clamp(10, 2.4vw, 24) between; the schematic no taller than 100vh less 230.)
        const float Z = WebLook.Zoom;
        float areaW = Mathf.Min(1000 * Z, PW - lay.Pad.y - lay.Pad.w), boxH = Mathf.Max(60, lay.ActY - lay.ShelfTop - 8 * Z), between = Css.Clamp(10 * Z, 2.4f * Css.Screen.x / 100 * Z, 24 * Z);
        var area = WebLook.Box(page, "Ship", PW / 2 - areaW / 2, lay.ShelfTop + 4 * Z, areaW, boxH);
        // The schematic: the hull in blueprint lines, every slot outlined (dashed while empty, filled with its part
        // when fitted); lit where the part in hand could go (not where it already is).
        float colW = (areaW - between) * 1.4f / 2.4f;
        // (.hg-ship: its column across, padded 10, rounded 18, a pale blue (#f3f7fc) inside a 1 blue hairline
        // (rgba(95, 134, 184, 0.18)); the schematic in its middle, as wide as it is inside its padding, at most
        // 100vh - 230 tall.)
        float sw = Mathf.Min(colW - 20 * Z, (boxH - 20 * Z) / 0.6f, Mathf.Max(60, PH - 230 * Z) / 0.6f), sh = sw * 0.6f, k = sw / 400;
        var panel = WebLook.Rounded(area, "Panel", new Color(216 / 255f, 227 / 255f, 240 / 255f), 18 * Z);
        var pr = panel.rectTransform;
        pr.anchorMin = pr.anchorMax = pr.pivot = new Vector2(0, 0.5f);
        pr.anchoredPosition = Vector2.zero;
        pr.sizeDelta = new Vector2(colW, sh + 20 * Z);
        var inner = WebLook.Rounded(pr, "Inside", WebLook.Hex("#f3f7fc"), 18 * Z - 1);
        Hud.Fill(inner.rectTransform);
        inner.rectTransform.offsetMin = Vector2.one;
        inner.rectTransform.offsetMax = -Vector2.one;
        var plan = Hud.At(Hud.Rect(area, "Schematic"), new Vector2(0, 0.5f), new Vector2((colW - sw) / 2, 0), new Vector2(sw, sh));
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
        grid.offsetMin = new Vector2(colW + between, 0);
        grid.offsetMax = Vector2.zero;
        var owned = Parts.ShipParts.Where(p => have.Contains(p.Id)).ToList();
        // (.hg-none: 0.85rem faint ink.)
        if (owned.Count == 0) Hud.Label(grid, "No parts yet.", 0.85f * 16 * Z, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Left);
        else
        {
            // (.hg-parts: columns at least 96 across, 8 apart, padded 2; each part (.hg-part) padded 8 6, its 64 picture,
            // 4, its name (0.5rem spaced capitals, line-height 1.3), 4, "fitted" (0.6rem faint) if it is aboard; a row as
            // tall as its tallest.)
            float gw = areaW - colW - between - 4 * Z, gap = 8 * Z;
            int cols = Mathf.Max(1, Mathf.FloorToInt((gw + gap) / (96 * Z + gap)));
            float tw = (gw - gap * (cols - 1)) / cols, ns = 0.5f * 16 * Z, nl = ns * 1.3f, fs = 0.6f * 16 * Z;
            var probe = WebLook.Words(grid, "", ns, 0.14f, Look.Ink, true, 500, TextAlignmentOptions.Top);
            probe.textWrappingMode = TextWrappingModes.Normal;
            var nameH = owned.Select(q => Mathf.Max(nl, probe.GetPreferredValues(q.Name.ToUpperInvariant(), tw - 12 * Z, 0).y)).ToList();
            Mats.Kill(probe.gameObject);
            float TileH(int i) => (8 + 64 + 4) * Z + nameH[i] + (aboard.Contains(owned[i].Id) ? 4 * Z + fs * 1.2f : 0) + 8 * Z;
            int rows = (owned.Count + cols - 1) / cols;
            var rowH = Enumerable.Range(0, rows).Select(r => Enumerable.Range(r * cols, Mathf.Min(cols, owned.Count - r * cols)).Max(TileH)).ToList();
            float need = rowH.Sum() + (rows - 1) * gap + 4 * Z;
            var content = Kit.Scroller(grid, Mathf.Max(need, boxH));
            float top = 2 * Z + Mathf.Max(0, (boxH - need) / 2);
            for (int i = 0; i < owned.Count; i++)
            {
                var p = owned[i];
                int r = i / cols;
                float th = rowH[r], y = top + rowH.Take(r).Sum() + r * gap;
                var spot = new Vector2((i % cols) * (tw + gap) + 2 * Z, -y);
                if (pick == p.Id)
                {
                    // (Picked: ringed 2.5 in gold.)
                    var ring = Hud.Glass(content, p.Id + " ring", Kit.PickRing, false);
                    Hud.At((RectTransform)ring.transform, new Vector2(0, 1), spot + new Vector2(-2.5f * Z, 2.5f * Z), new Vector2(tw + 5 * Z, th + 5 * Z));
                    ring.raycastTarget = false;
                }
                var tile = Hud.Glass(content, p.Id, aboard.Contains(p.Id) ? (Color)new Color32(0xf6, 0xf9, 0xfd, 255) : Color.white, false);
                Hud.At((RectTransform)tile.transform, new Vector2(0, 1), spot, new Vector2(tw, th));
                var icon = Hud.At(Hud.Rect(tile.transform, "Icon"), new Vector2(0.5f, 1), new Vector2(0, -8 * Z), new Vector2(64 * Z, 64 * Z));
                var ii = icon.gameObject.AddComponent<RawImage>();
                ii.texture = Resources.Load<Texture2D>($"Icons/part-{p.Kind}-{p.Rarity}");
                ii.raycastTarget = false;
                var nm = WebLook.Words(WebLook.Box(tile.transform, "Name", 6 * Z, (8 + 64 + 4) * Z, tw - 12 * Z, nameH[i] + 2), p.Name.ToUpperInvariant(), ns, 0.14f, Look.Ink, true, 500, TextAlignmentOptions.Top);
                nm.textWrappingMode = TextWrappingModes.Normal;
                nm.lineSpacing = (1.3f - 1.26f) * 100 / 1.26f;
                if (aboard.Contains(p.Id))
                    WebLook.Words(WebLook.Box(tile.transform, "Fitted", 0, (8 + 64 + 4 + 4) * Z + nameH[i], tw, fs * 1.2f), "fitted", fs, 0, Look.InkFaint, false, 400);
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

        var act = ActRow(page, lay);
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
        var nodeId = n.Id;
        var lines = taken
            ? new List<(string who, string text)> { ("visitor", "The experiment is done, Captain. There is nothing left here to try.") }
            : new List<(string who, string text)> { ("visitor", "Captain! Volunteers, at last. Everything we make here works. Mostly. There is always a price."), ("captain", "Show us what you have.") };
        // (As an encounter's scene (campaign.ts renderLab): the scientist's word and the Captain's, the experiments
        // (.enc-offers: each 190 (CSS) across, 10 apart) between them and the choices.)
        System.Func<RectTransform, float, float> offers = null;
        if (!taken)
            offers = (mid, from) =>
            {
                const float Z = WebLook.Zoom, OfferW = 190 * Z, OfferGap = 10 * Z;
                var list = options.Where(o => !Research.RetiredResearch.Contains(o)).Select(o => Research.ResearchProject(o)).Where(o => o != null).ToList();
                float h = list.Count > 0 ? list.Max(o => Kit.ExperimentHeight(o, OfferW)) : 0, w = mid.sizeDelta.x;
                for (int i = 0; i < list.Count; i++)
                {
                    var p = list[i];
                    var why = Campaign.ResearchProblem(state, me, n, p.Id);
                    string mode = why != null ? "gone" : pick == p.Id ? "picked" : "";
                    var r = WebLook.Box(mid, p.Id, w / 2 + (i - list.Count / 2f) * (OfferW + OfferGap) + OfferGap / 2, mode == "picked" ? -3 * Z : 0, OfferW, h);
                    var id = p.Id;
                    Kit.Experiment(r, p, mode, why == null ? () => { Sound.Play("hover"); rsPick = rsPick == id ? null : id; Station(); } : (System.Action)null);
                    RiseIn.On(r, from, LineDelay(lines.Count + i));
                }
                return h;
            };
        ShipScene("research station", n.Name, lines, acts =>
        {
            if (taken) Buttons(acts, ("fly on", true, null, () => LeaveStation()));
            else Buttons(acts, ("not today", false, null, () => LeaveStation()), ("volunteer", true, pick == null ? "" : null, () => TakeProject(nodeId, pick)));
        }, null, page, offers, "the scientist");
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
        var lay = ArLay(false);
        Kit.Head(page, "research station", n.Name, lay.HeadTop, lay.H3, !lay.Phone);
        // (Upgrades retired from the game, left in an older save's station, are not offered.)
        var offers = options.Where(o => !Research.RetiredResearch.Contains(o)).Select(o => Research.ResearchProject(o)).Where(o => o != null).ToList();
        // (.rs-offers: at the foot of the shelf, padded 20; each 200 (CSS) across, 56 apart (on a phone 170 and 30).)
        float OfferW = lay.Phone ? 170 : 200, OfferGap = lay.Phone ? 30 : 56;
        for (int i = 0; i < offers.Count; i++)
        {
            var p = offers[i];
            var why = taken != null ? null : Campaign.ResearchProblem(state, me, n, p.Id);
            string mode = taken != null ? (st.Project == p.Id ? "chosen" : "gone") : why != null ? "gone" : pick == p.Id ? "picked" : "";
            var r = Hud.At(Hud.Rect(page, p.Id), new Vector2(0.5f, 0), new Vector2((i - (offers.Count - 1) / 2f) * (OfferW + OfferGap), PH - lay.ActY + 20 * WebLook.Zoom + (mode == "picked" ? 8 : 0)), new Vector2(OfferW, 280));
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
        var act = ActRow(page, lay);
        var nodeId = n.Id;
        var confirm = Kit.Go(act, "confirm", true, open && pick == null ? "" : null, () => TakeProject(nodeId, pick));
        if (taken != null) Kit.Across(act, 14, Kit.Hint(act, taken == me.Id ? "taken" : $"taken by {Campaign.FactionById(state, taken).Name.ToLowerInvariant()}"), confirm);
        else Kit.Across(act, 14, confirm);
        // What you carry already.
        var done = (me.Research?.Done ?? new List<string>()).Where(o => !Research.RetiredResearch.Contains(o)).Select(o => Research.ResearchProject(o)).Where(o => o != null).ToList();
        if (done.Count > 0)
        {
            var foot = Hud.At(Hud.Rect(page, "Carried"), new Vector2(0.5f, 0), new Vector2(0, lay.Pad.z), new Vector2(Mathf.Min(1400, PW * 0.9f), 30));
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

    /// <summary>
    /// A card's attack and stability as printed (the web's .cmp-card, cardHtml, shows them on its face; the baked face
    /// has none), on its face `w` wide: as the battle's inspector draws a card not in play (BattleView.Printed).
    /// `sized`: on a face baked for its width, the stones where the web sets them on a card that wide (Faces.At).
    /// </summary>
    public static void Printed(RectTransform face, string defId, float w, bool sized = false)
    {
        var def = Cards.Def(defId);
        if (def == null || !Game.Persists(defId) || Cards.IsBurst(def)) return;
        void Badge(Faces.Place at, string kind, int n)
        {
            var r = Hud.Rect(face, kind);
            Hud.Place(r, at.x * w, at.y * w, at.w * w, at.h * w);
            var img = r.gameObject.AddComponent<RawImage>();
            img.texture = Faces.Badge(kind, n);
            img.raycastTarget = false;
        }
        int atk = Game.BaseAttack(def);
        if (atk > 0) Badge(sized ? Faces.At("atk", w / WebLook.Zoom, false) : Faces.Where.atk, "atk", atk);
        Badge(sized ? Faces.At("stab", w / WebLook.Zoom, false) : Faces.Where.stab, "stab", Game.BaseHealth(defId));
    }

    /// <summary>A card on the shelf: its width (120 (CSS), on a phone 88), its height, and its cell's (its price beneath it).</summary>
    public static float CardW => (Css.MaxHeight(560) ? 88 : 120) * WebLook.Zoom;
    public static float CardH => CardW * 1.4f;
    public static float CellH => CardH + 10 * WebLook.Zoom + 25;

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

    /// <summary>
    /// A station's kind small at the top (where there is room for it), its name under it in wide capitals (its size as
    /// the page has it), from `top` down.
    /// </summary>
    public static void Head(RectTransform page, string kind, string name, float top, float size, bool kicker)
    {
        const float Z = WebLook.Zoom;
        float y = top;
        if (kicker)
        {
            var k = Hud.At(Hud.Rect(page, "Kind"), new Vector2(0.5f, 1), new Vector2(0, -y), new Vector2(900, 0.6f * 16 * Z * 1.25f));
            WebLook.Words(k, kind.ToUpperInvariant(), 0.6f * 16 * Z, 0.36f, Look.InkFaint, true, 400).margin = new Vector4(0, 0, 0.36f * 0.6f * 16 * Z, 0);
            y += 0.6f * 16 * Z * 1.25f + 4 * Z;
        }
        var t = Hud.At(Hud.Rect(page, "Name"), new Vector2(0.5f, 1), new Vector2(0, -y), new Vector2(1400, size * 1.25f));
        WebLook.Words(t, name.ToUpperInvariant(), size, 0.42f, Look.Ink, true, 400);
    }

    /// <summary>A hint in small spaced capitals (a warning in red); sized to its words.</summary>
    public static RectTransform Hint(Transform row, string text, bool warn = false, Color? colour = null)
    {
        var r = Hud.Rect(row, "Hint");
        var t = WebLook.Words(r, text.ToUpperInvariant(), 0.6f * 16 * WebLook.Zoom, warn ? 0.14f : 0.3f, warn ? Warn : colour ?? Look.InkFaint, true, 400);
        r.sizeDelta = new Vector2(t.GetPreferredValues(t.text).x + 4, 24);
        return r;
    }

    /// <summary>A pill button whose words may carry materials (⬢): primary (ink, white words) or plain; held back (why) faded.</summary>
    public static RectTransform Go(Transform parent, string text, bool primary, string why, System.Action act, float size = 0.7f * 16 * WebLook.Zoom, float height = 0.7f * 16 * WebLook.Zoom * 1.25f + 22 * WebLook.Zoom)
    {
        const float Z = WebLook.Zoom;
        var img = WebLook.Rounded(parent, text, primary ? Color.white : new Color(1, 1, 1, 0.75f), 999);
        img.raycastTarget = true;
        img.sprite = Hud.Rounded;
        img.type = UnityEngine.UI.Image.Type.Sliced;
        img.pixelsPerUnitMultiplier = 22f / (height / 2);
        var r = img.rectTransform;
        if (primary)
        {
            WebLook.Fade(img, Color.white, WebLook.Hex("#eeeff1"));
            var line = new Color(120 / 255f, 124 / 255f, 134 / 255f, 0.22f);
            WebLook.Shadow(img, 6 * Z, 20 * Z, line, height / 2, Z, line);
        }
        else WebLook.Shadow(img, 0, 0, Color.clear, height / 2, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.12f));
        var b = img.gameObject.AddComponent<UnityEngine.UI.Button>();
        b.onClick.AddListener(() => { Sound.Play("click"); act(); });
        float w = Inline(r, text.ToUpperInvariant(), size, primary ? Look.Ink : Look.InkSoft, new Vector2(0.5f, 0.5f), Vector2.zero, true, primary ? 700 : 500, primary ? 26 : 16);
        r.sizeDelta = new Vector2(w + (primary ? 52 : 22) * Z, height);
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
        var mark = Resources.Load<Texture2D>("Icons/purse-materials");
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
        const float Z = WebLook.Zoom;
        var probe = new GameObject("Probe", typeof(RectTransform));
        var t = probe.AddComponent<TextMeshProUGUI>();
        // (.enc-offer: 10 above and below, 8 either side, 5 between its mark, its name and its words.)
        float h = 10 * Z + 52 * Z + 5 * Z, inner = w - 16 * Z;
        Look.Style(t, 0.7f * 16 * Z, Look.Ink, true, 400, 20);
        t.textWrappingMode = TextWrappingModes.Normal;
        h += t.GetPreferredValues(p.Name.ToUpperInvariant(), inner, 0).y + 5 * Z;
        Look.Style(t, 0.78f * 16 * Z, Boon, false, 400, 0);
        t.textWrappingMode = TextWrappingModes.Normal;
        bool twoSided = !string.IsNullOrEmpty(p.Boon);
        h += t.GetPreferredValues(twoSided ? p.Boon : p.Text ?? "", inner, 0).y;
        if (twoSided) h += 5 * Z + t.GetPreferredValues(p.Bane ?? "", inner, 0).y;
        Mats.Kill(probe);
        return h + 10 * Z;
    }

    /// <summary>An experiment: its mark, its name, what it gives (in green) and what it costs (in red); picked, ringed in ink.</summary>
    public static void Experiment(RectTransform r, ResearchProject p, string mode, System.Action act)
    {
        const float Z = WebLook.Zoom;
        // (.enc-offer: white glass, rounded 14, a hairline round it; picked, ringed in ink and lifted, shadowed.)
        var card = WebLook.Rounded(r, "Card", new Color(1, 1, 1, 0.55f), 14 * Z);
        card.raycastTarget = true;
        Hud.Fill(card.rectTransform);
        if (mode == "picked") WebLook.Shadow(card, 10 * Z, 24 * Z, new Color(60 / 255f, 70 / 255f, 110 / 255f, 0.18f), 14 * Z, 2 * Z, Look.Ink);
        else if (mode == "chosen") WebLook.Shadow(card, 0, 0, Color.clear, 14 * Z, 2 * Z, Look.Ink);
        else WebLook.Shadow(card, 0, 0, Color.clear, 14 * Z, Z, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.08f));
        float w = r.sizeDelta.x - 16 * Z, y = 10 * Z;
        ResearchMark(card.transform, p, 52 * Z, mode == "picked" || mode == "chosen", new Vector2(0.5f, 1), new Vector2(0, -y));
        y += 52 * Z + 5 * Z;
        var called = WebLook.Words(card.transform, p.Name.ToUpperInvariant(), 0.7f * 16 * Z, 0.2f, Look.Ink, true, 400, TextAlignmentOptions.Top);
        called.textWrappingMode = TextWrappingModes.Normal;
        float nh = called.GetPreferredValues(called.text, w, 0).y;
        WebLook.Box(called.rectTransform, 8 * Z, y, w, nh + 2);
        y += nh + 5 * Z;
        bool twoSided = !string.IsNullOrEmpty(p.Boon);
        var boon = WebLook.Words(card.transform, twoSided ? p.Boon : p.Text ?? "", 0.78f * 16 * Z, 0, Boon, false, 400, TextAlignmentOptions.Top);
        boon.textWrappingMode = TextWrappingModes.Normal;
        float bh = boon.GetPreferredValues(boon.text, w, 0).y;
        WebLook.Box(boon.rectTransform, 8 * Z, y, w, bh + 2);
        if (twoSided)
        {
            var bane = WebLook.Words(card.transform, p.Bane ?? "", 0.78f * 16 * Z, 0, Bane, false, 400, TextAlignmentOptions.Top);
            bane.textWrappingMode = TextWrappingModes.Normal;
            WebLook.Box(bane.rectTransform, 8 * Z, y + bh + 5 * Z, w, bane.GetPreferredValues(bane.text, w, 0).y + 2);
        }
        var b = card.gameObject.AddComponent<Button>();
        if (act != null) b.onClick.AddListener(() => act());
        else b.interactable = false;
        if (mode == "gone") r.gameObject.AddComponent<CanvasGroup>().alpha = 0.4f;
    }
}
