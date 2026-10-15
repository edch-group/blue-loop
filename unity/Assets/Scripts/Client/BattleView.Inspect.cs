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

    void ShowZoom(string defId, string uid)
    {
        foreach (Transform c in inspector) Mats.Kill(c.gameObject);
        inspector.SetAsLastSibling();
        inspector.gameObject.SetActive(true);
        // (.overlay.overlay-soft: a pale veil over everything; a tap anywhere closes it.)
        var veil = inspector.gameObject.GetComponent<Image>() ?? inspector.gameObject.AddComponent<Image>();
        veil.color = new Color(244 / 255f, 244 / 255f, 242 / 255f, 0.45f);
        var btn = inspector.gameObject.GetComponent<Button>() ?? inspector.gameObject.AddComponent<Button>();
        btn.transition = Selectable.Transition.None;
        btn.onClick.RemoveAllListeners();
        btn.onClick.AddListener(() => inspector.gameObject.SetActive(false));
        var l = BoardLayout.Current;
        float pw = Mathf.Min(340, 0.62f * l.H, 0.8f * l.W), ch = pw * 1.4f;

        // The explanations (.kw-list): a white panel, rounded 16, padded 12 x 14, at most 260 wide, rows 8 apart.
        var rows = new List<ExplainRow>(Explain(defId));
        var owner = uid != null ? state.Players.FirstOrDefault(p => p.Tableau.Any(c => c.Uid == uid)) : null;
        var card = owner?.Tableau.First(c => c.Uid == uid);
        if (card != null) rows.Add(new ExplainRow { head = "⛨ Defence", colour = "rgb(79, 112, 168)", icon = -1, body = "Takes heat before stability." });
        const float listW = 260, padX = 14, padY = 12, head = 13.76f, bodySize = 11.84f;
        float inner = listW - 2 * padX;
        RectTransform panel = null;
        float panelH = 0, panelW = 0;
        if (rows.Count > 0)
        {
            var p = Hud.Box(inspector, "Explain", new Color(1, 1, 1, 0.96f), 16);
            panel = (RectTransform)p.transform;
            WebLook.Shadow(p, 10, 30, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.18f), 16);
            float y = padY, widest = 0;
            for (int i = 0; i < rows.Count; i++)
            {
                var r = rows[i];
                if (i > 0) y += 8;
                float x = padX;
                // (Its mark, 0.78em, a quarter em before its name.)
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
                float hw = ht.GetPreferredValues(r.head).x;
                Hud.Place(h, x, y, hw + 2, head * 1.35f);
                widest = Mathf.Max(widest, x - padX + hw);
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
                    widest = inner;
                    y += size.y;
                }
                // (The race's row closes with a hairline under it, 8 below.)
                if (r.race)
                {
                    y += 8;
                    var line = Hud.Box(panel, "Rule", new Color(120 / 255f, 126 / 255f, 140 / 255f, 0.18f), 0);
                    Hud.Place((RectTransform)line.transform, padX, y, inner, 1);
                    y += 1;
                }
            }
            panelW = Mathf.Min(listW, widest + 2 * padX);
            panelH = Mathf.Min(y + padY, ch);
        }

        // The card (.card-big: its shadow 0 26px 60px, a white ring of 2), rising in.
        float gap = panel != null ? 16 : 0, total = pw + gap + panelW, rowH = Mathf.Max(ch, panelH);
        float smallH = 12.8f * 1.2f, blockH = rowH + 10 + smallH;
        float left = (l.W - total) / 2, top = (l.H - blockH) / 2;
        var face = Hud.Rect(inspector, "Card");
        Hud.Place(face, left, top + (rowH - ch) / 2, pw, ch);
        var raw = face.gameObject.AddComponent<RawImage>();
        raw.texture = Faces.Of(defId, false);
        raw.raycastTarget = false;
        WebLook.Shadow(raw, 26, 60, new Color(70 / 255f, 70 / 255f, 90 / 255f, 0.3f), pw * 0.08f, 2, Color.white);
        face.gameObject.AddComponent<Rise>();
        // (In play: its attack, stability and defence as they stand, where the web's big card wears them.)
        if (card != null)
        {
            var def = Cards.Def(defId);
            int atk = Game.CardAttack(state, owner, card), hp = card.Health ?? 0;
            void Badge(Faces.Place at, string kind, int n)
            {
                var r = Hud.Rect(face, kind);
                Hud.Place(r, at.x * pw, at.y * pw, at.w * pw, at.h * pw);
                var img = r.gameObject.AddComponent<RawImage>();
                img.texture = Faces.Badge(kind, n);
                img.raycastTarget = false;
            }
            if (atk > 0 || Game.BaseAttack(def) > 0) Badge(Faces.Where.atk, card.Dimmed == true ? "atk-dim" : "atk", Mathf.Max(0, atk));
            Badge(Faces.Where.stab, hp <= 1 ? "stab-low" : "stab", hp);
            bool guard = Game.IsGuard(owner, card);
            Badge(guard ? Faces.Where.guard : Faces.Where.def, guard ? "guard" : "def", Game.CardDefence(owner, card));
        }
        if (panel != null)
        {
            Hud.Place(panel, left + pw + gap, top + (rowH - panelH) / 2, panelW, panelH);
            panel.SetAsLastSibling();
        }
        // (small.muted: "tap anywhere to close", 10 under them.)
        var hintR = Hud.Rect(inspector, "Close hint");
        Hud.Place(hintR, 0, top + rowH + 10, l.W, smallH);
        var hintT = hintR.gameObject.AddComponent<TextMeshProUGUI>();
        Look.Style(hintT, 12.8f, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Top);
        hintT.text = "tap anywhere to close";
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
            r.anchoredPosition = home + new Vector2(0, -8 * (1 - e));
            if (g != null) { var c = g.color; c.a = e; g.color = c; }
            if (k >= 1) Destroy(this);
        }
    }
}
