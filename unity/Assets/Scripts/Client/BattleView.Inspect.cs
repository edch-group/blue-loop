using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The card read large (app.ts renderZoom: .zoom-view): over a pale veil, the card at --pw (min(340px, 62% of the
/// page's height, 80vw)), and beside it what it carries explained (explainCard, baked from the web by
/// scripts/bake-explain.mjs: its race, traits, a boss's action, each keyword and rule), "tap anywhere to close" under
/// them. A card in play wears its badges as it stands, and its defence is explained too.
/// </summary>
public partial class BattleView
{
    [System.Serializable] class ExplainRow { public bool race; public string head, colour, body; public int icon; }

    static Dictionary<string, List<ExplainRow>> explains;

    static List<ExplainRow> Explain(string defId)
    {
        explains ??= Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, List<ExplainRow>>>(Resources.Load<TextAsset>("Engine/explain").text);
        if (explains.TryGetValue(defId, out var rows)) return rows;
        // (A built card: its base card's.)
        var def = Cards.Def(defId);
        var baseId = def.FusedFrom?[0] ?? def.ArtOf ?? defId.Split('@')[0];
        return baseId != defId && explains.TryGetValue(baseId, out rows) ? rows : new List<ExplainRow>();
    }

    static Color CssColour(string rgb)
    {
        var m = System.Text.RegularExpressions.Regex.Matches(rgb ?? "", @"[\d.]+");
        if (m.Count < 3) return Look.Ink;
        return new Color(float.Parse(m[0].Value) / 255f, float.Parse(m[1].Value) / 255f, float.Parse(m[2].Value) / 255f, m.Count > 3 ? float.Parse(m[3].Value) : 1);
    }

    void Inspect()
    {
        if (!Physics.Raycast(Cam.ScreenPointToRay(Input.mousePosition), out var hit, 100)) return;
        var v = hit.collider.GetComponentInParent<CardView>();
        if (v == null) return;
        // (A rival's trap stays hidden.)
        if (state.Players.Any(p => p.Id != you && p.Lightspeed?.Uid == v.Uid)) return;
        ShowZoom(v.DefId, v.Uid);
    }

    /// <summary>
    /// The inspector (app.ts sheet 'card': .overlay.overlay-inspect &gt; .inspector.sheet): over the blurred, veiled
    /// screen, the card at --pw (min(280px, 56vh)) and beside it, as wide, what it carries explained; under them PLAY
    /// (a card in your hand: lit when it can be played now) and CLOSE, each at least 140 wide, 10 apart. A tap outside
    /// closes it.
    /// </summary>
    void ShowZoom(string defId, string uid) => BuildInspector(defId, uid, 0);

    /// <summary>
    /// A card with nothing to do now, tapped (app.ts renderCard's data-act="inspect"): read large in the inspector (a
    /// rival's trap stays hidden).
    /// </summary>
    void InspectTap(string uid)
    {
        if (state == null || state.Players.Any(p => p.Id != you && p.Lightspeed?.Uid == uid)) return;
        var c = state.Players.SelectMany(p => p.Tableau.Concat(p.Hand)).FirstOrDefault(x => x.Uid == uid);
        if (c == null) return;
        Sound.Play("hover");
        ShowZoom(c.DefId, uid);
    }

    /// <summary>
    /// The inspector drawn over the screen blurred (again, a tab chosen: in place). A card in play with Fusion
    /// cards on it gets tabs along its top (app.ts inspectorCard, .insp-tabs: the card itself, then each fused card in
    /// purple), to read each one; a fused card's tab shows it as printed, with its own explanations.
    /// </summary>
    void BuildInspector(string hostDefId, string uid, int tab)
    {
        foreach (Transform c in inspector) Mats.Kill(c.gameObject);
        inspector.SetAsLastSibling();
        inspector.gameObject.SetActive(true);
        var veil = inspector.gameObject.GetComponent<Image>() ?? inspector.gameObject.AddComponent<Image>();
        veil.color = new Color(1, 1, 1, 0.001f);
        var btn = inspector.gameObject.GetComponent<Button>() ?? inspector.gameObject.AddComponent<Button>();
        btn.transition = Selectable.Transition.None;
        btn.onClick.RemoveAllListeners();
        btn.onClick.AddListener(() => inspector.gameObject.SetActive(false));
        var wash = Hud.Rect(inspector, "Veil");
        Hud.Fill(wash);
        var wi = wash.gameObject.AddComponent<Image>();
        wi.color = new Color(246 / 255f, 246 / 255f, 244 / 255f, 0.8f);
        wi.raycastTarget = false;
        // (.overlay: the screen behind blurred 6, under the wash.)
        BackdropBlur.Blur(inspector);
        var l = BoardLayout.Current;
        float pw = Mathf.Min(280, 56 * l.Vh), ch = pw * 1.4f;
        var sheetR = Hud.Rect(inspector, "Inspector");
        Hud.Fill(sheetR);
        sheetR.gameObject.AddComponent<Rise>();

        // The explanations, as wide as the card (.inspector-row .kw-wrap: width --pw), at most as tall.
        var owner = uid != null ? state.Players.FirstOrDefault(p => p.Tableau.Any(c => c.Uid == uid)) : null;
        var card = owner?.Tableau.First(c => c.Uid == uid);
        var fused = card?.Fused ?? new List<CardInstance>();
        tab = Mathf.Clamp(tab, 0, fused.Count);
        string defId = tab == 0 ? hostDefId : fused[tab - 1].DefId;
        if (tab > 0) card = null;
        var rows = new List<ExplainRow>(Explain(defId));
        if (card != null) rows.Add(new ExplainRow { head = "⛨ Defence", colour = "rgb(79, 112, 168)", icon = -1, body = "Takes heat before stability." });
        RectTransform panel = null;
        float panelH = 0;
        if (rows.Count > 0) (panel, panelH) = ExplainPanel(sheetR, rows, pw, ch);

        // The actions: PLAY (your hand's card) and CLOSE.
        var held = uid != null ? Me.Hand.FirstOrDefault(c => c.Uid == uid) : null;
        float gap = Mathf.Clamp(2.4f * l.Vh, 10, 18), btnH = 10.56f * 1.25f + 18 + 2;
        // (.insp-tabs: a row along the card's top, 4% in either side, 4 apart, 12 above it; each an equal share, its
        // name 10.56 px capitals spaced 0.12em, padded 6 × 10, corners 10.)
        float tabsH = fused.Count > 0 ? MenuKit.LineH(10.56f) + 12 : 0, cardBlock = ch + (fused.Count > 0 ? tabsH + 12 : 0);
        float rowW = pw + (panel != null ? 16 + pw : 0), rowH = Mathf.Max(cardBlock, panelH);
        float blockH = rowH + gap + btnH;
        float left = (l.W - rowW) / 2, top = (l.H - blockH) / 2;
        if (fused.Count > 0) InspectTabs(sheetR, hostDefId, uid, fused, tab, left + 0.04f * pw, top + (rowH - cardBlock) / 2, 0.92f * pw, tabsH);
        var face = Hud.Rect(sheetR, "Card");
        Hud.Place(face, left, top + (rowH - cardBlock) / 2 + (cardBlock - ch), pw, ch);
        var raw = face.gameObject.AddComponent<RawImage>();
        raw.texture = Faces.Of(defId, false);
        raw.raycastTarget = false;
        WebLook.Shadow(raw, 26, 60, new Color(70 / 255f, 70 / 255f, 90 / 255f, 0.3f), pw * 0.08f, 2, Color.white);
        var def = Cards.Def(defId);
        void Badge(Faces.Place at, string kind, int n)
        {
            var r = Hud.Rect(face, kind);
            Hud.Place(r, at.x * pw, at.y * pw, at.w * pw, at.h * pw);
            var img = r.gameObject.AddComponent<RawImage>();
            img.texture = Faces.Badge(kind, n);
            img.raycastTarget = false;
        }
        if (card != null)
        {
            // (In play: its numbers as they stand.)
            int atk = Game.CardAttack(state, owner, card), hp = card.Health ?? 0;
            if (atk > 0 || Game.BaseAttack(def) > 0) Badge(Faces.OnFace("atk"), card.Dimmed == true ? "atk-dim" : "atk", Mathf.Max(0, atk));
            Badge(Faces.OnFace("stab"), hp <= 1 ? "stab-low" : "stab", hp);
            bool guard = Game.IsGuard(owner, card);
            Badge(Faces.OnFace(guard ? "guard" : "def"), guard ? "guard" : "def", Game.CardDefence(owner, card));
        }
        else Printed(face, defId, pw);
        if (panel != null) Hud.Place(panel, left + pw + 16, top + (rowH - panelH) / 2, pw, panelH);

        bool playable = held != null && MyDay && !busy && picked == null && Game.HandCost(held, Me) <= Me.PlaysLeft;
        var names = held != null ? new[] { "PLAY", "CLOSE" } : new[] { "CLOSE" };
        var widths = names.Select(n => Mathf.Max(140, Hud.Wide(n, 10.56f, n == "PLAY" ? 700 : 500, 14, 16, false) + 2)).ToArray();
        float x = (l.W - (widths.Sum() + 10 * (names.Length - 1))) / 2, y = top + rowH + gap;
        for (int i = 0; i < names.Length; i++)
        {
            bool play = names[i] == "PLAY";
            Button b;
            if (play)
            {
                b = WhiteButton(sheetR, "PLAY", () => { inspector.gameObject.SetActive(false); TapCard(held.Uid); Refresh(); }, 10.56f, 10, 1);
                Usable(b, playable);
            }
            else
            {
                var box = Hud.Box(sheetR, "CLOSE", new Color(252 / 255f, 252 / 255f, 251 / 255f), 10);
                WebLook.Shadow(box, 2, 10, new Color(90 / 255f, 90 / 255f, 110 / 255f, 0.12f), 10, 1, Color.white);
                Hud.Label(box.transform, "CLOSE", 10.56f, Look.Ink, false, 500, 14);
                box.raycastTarget = true;
                b = box.gameObject.AddComponent<Button>();
                b.onClick.AddListener(() => inspector.gameObject.SetActive(false));
            }
            Hud.Place((RectTransform)b.transform, x, y, widths[i], btnH);
            x += widths[i] + 10;
        }
    }

    static Texture2D fusedTab, fusedTabOn;

    /// <summary>
    /// The tabs (.insp-tab: #eef1f6, slate ink, a soft shadow; chosen white, darker ink, a deeper shadow; a fused card's
    /// purple to blue (90deg, #8c5ad6 → #5f8fc4, its ink #f2ecff; chosen #7a44d0 → #4f7fbe, white, ringed white and
    /// glowing violet)), each cut short with "…" when its name runs out of room.
    /// </summary>
    void InspectTabs(RectTransform parent, string hostDefId, string uid, List<CardInstance> fused, int tab, float x, float y, float w, float h)
    {
        int n = fused.Count + 1;
        float tw = (w - 4 * (n - 1)) / n;
        for (int i = 0; i < n; i++)
        {
            bool on = i == tab, f = i > 0;
            string name = Cards.Def(i == 0 ? hostDefId : fused[i - 1].DefId).Name.ToUpperInvariant();
            var box = Hud.Box(parent, "Tab", f ? Color.white : on ? Color.white : Hud.Rgba(0xee, 0xf1, 0xf6), 10);
            Hud.Place(box.rectTransform, x + i * (tw + 4), y, tw, h);
            box.raycastTarget = true;
            if (f && on) Hud.Shadow(box, 10, new Hud.Drop(Color.white, 0, 0, 2), new Hud.Drop(Hud.Rgba(140, 90, 214, 0.5f), 2, 10));
            else Hud.Shadow(box, 10, new Hud.Drop(Hud.Rgba(80, 84, 100, on ? 0.25f : 0.15f), 2, on ? 10 : 6));
            if (f)
            {
                Texture2D Across(Color a, Color b)
                {
                    var t = new Texture2D(32, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
                    for (int k = 0; k < 32; k++) t.SetPixel(k, 0, Color.Lerp(a, b, k / 31f));
                    t.Apply();
                    return t;
                }
                fusedTab ??= Across(Hud.Rgba(0x8c, 0x5a, 0xd6), Hud.Rgba(0x5f, 0x8f, 0xc4));
                fusedTabOn ??= Across(Hud.Rgba(0x7a, 0x44, 0xd0), Hud.Rgba(0x4f, 0x7f, 0xbe));
                box.gameObject.AddComponent<Mask>().showMaskGraphic = false;
                var g = Hud.Rect(box.transform, "Fill");
                Hud.Fill(g);
                var gi = g.gameObject.AddComponent<RawImage>();
                gi.texture = on ? fusedTabOn : fusedTab;
                gi.raycastTarget = false;
            }
            var ink = f ? (on ? Color.white : Hud.Rgba(0xf2, 0xec, 0xff)) : on ? Hud.Rgba(0x2f, 0x3a, 0x52) : Hud.Rgba(0x5a, 0x62, 0x74);
            var t = MenuKit.Words(box.transform, name, 10 + 0.06f * 10.56f, 0, tw - 20, h, 10.56f, ink, true, 500, 0.12f);
            t.overflowMode = TextOverflowModes.Ellipsis;
            var b = box.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            int k2 = i;
            b.onClick.AddListener(() => { Sound.Play("hover"); BuildInspector(hostDefId, uid, k2); });
        }
    }

    /// <summary>A card not in play's attack and stability as printed (stabilityBadge), on its face `w` wide.</summary>
    static void Printed(RectTransform face, string defId, float w, bool sized = false)
    {
        var def = Cards.Def(defId);
        if (!Game.Persists(defId) || Cards.IsBurst(def)) return;
        void Badge(Faces.Place at, string kind, int n)
        {
            var r = Hud.Rect(face, kind);
            Hud.Place(r, at.x * w, at.y * w, at.w * w, at.h * w);
            var img = r.gameObject.AddComponent<RawImage>();
            img.texture = Faces.Badge(kind, n);
            img.raycastTarget = false;
        }
        // (`sized`: on a face baked for its width, the stones where the web sets them on a card that wide: Faces.At.)
        int atk = Game.BaseAttack(def);
        if (atk > 0) Badge(sized ? Faces.At("atk", w, false) : Faces.OnFace("atk"), "atk", atk);
        Badge(sized ? Faces.At("stab", w, false) : Faces.OnFace("stab"), "stab", Game.BaseHealth(defId));
    }

    /// <summary>The explanations' panel (.kw-list): white, rounded 16, padded 12 x 14, rows 8 apart, `w` wide, at most `most` tall.</summary>
    (RectTransform, float) ExplainPanel(Transform parent, List<ExplainRow> rows, float w, float most)
    {
        const float padX = 14, padY = 12, head = 13.76f, bodySize = 11.84f;
        float inner = w - 2 * padX;
        var p = Hud.Box(parent, "Explain", new Color(1, 1, 1, 0.96f), 16);
        var panel = (RectTransform)p.transform;
        WebLook.Shadow(p, 10, 30, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.18f), 16);
        float y = padY;
        for (int i = 0; i < rows.Count; i++)
        {
            var r = rows[i];
            if (i > 0) y += 8;
            float x = padX;
            if (r.icon >= 0)
            {
                var ic = Hud.Rect(panel, "Mark");
                float s = head * 0.78f;
                Hud.Place(ic, x, y + (head * 1.35f - s) / 2 + head * 0.04f, s, s);
                var img = ic.gameObject.AddComponent<RawImage>();
                img.texture = Resources.Load<Texture2D>($"Icons/kw/k{r.icon}");
                img.raycastTarget = false;
                x += s + head * 0.25f;
            }
            var h = Hud.Rect(panel, "Head");
            var ht = h.gameObject.AddComponent<TextMeshProUGUI>();
            Look.Style(ht, head, CssColour(r.colour), false, 600, 2, TextAlignmentOptions.TopLeft);
            ht.text = r.head;
            Hud.Place(h, x, y, inner - (x - padX), head * 1.35f);
            y += head * 1.35f;
            if (!string.IsNullOrEmpty(r.body))
            {
                y += 2;
                var b = Hud.Rect(panel, "Body");
                var bt = b.gameObject.AddComponent<TextMeshProUGUI>();
                Look.Style(bt, bodySize, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
                bt.textWrappingMode = TextWrappingModes.Normal;
                bt.lineSpacing = (1.35f - 1.2f) * 100;
                bt.text = r.body;
                var size = bt.GetPreferredValues(r.body, inner, 0);
                Hud.Place(b, padX, y, inner, size.y);
                y += size.y;
            }
            if (r.race)
            {
                y += 8;
                var line = Hud.Box(panel, "Rule", new Color(120 / 255f, 126 / 255f, 140 / 255f, 0.18f), 0);
                Hud.Place((RectTransform)line.transform, padX, y, inner, 1);
                y += 1;
            }
        }
        float hgt = Mathf.Min(y + padY, most);
        // (Taller than the card: what runs over is cut, as the web's column scrolls.)
        p.gameObject.AddComponent<RectMask2D>();
        return (panel, hgt);
    }

    /// <summary>@keyframes rise: the card comes up a little as it fades in (0.2 s, ease-out).</summary>
    class Rise : MonoBehaviour
    {
        float t0;
        RectTransform r;
        Vector2 home;
        Graphic g;
        void Start() { t0 = Time.time; r = (RectTransform)transform; home = r.anchoredPosition; g = GetComponent<Graphic>(); Update(); }
        void Update()
        {
            float k = Mathf.Clamp01((Time.time - t0) / 0.2f), e = 1 - (1 - k) * (1 - k);
            r.anchoredPosition = home + new Vector2(0, -10 * (1 - e));
            if (g != null) { var c = g.color; c.a = e; g.color = c; }
            if (k >= 1) Destroy(this);
        }
    }
}
