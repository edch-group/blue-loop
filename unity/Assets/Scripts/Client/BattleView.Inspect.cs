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

    void ShowZoom(string defId, string uid) => StartCoroutine(ShowInspector(defId, uid));

    Texture2D shotTex;
    RenderTexture blurTex;

    /// <summary>
    /// The screen as it stands, blurred (.overlay's backdrop-filter: blur(6px)): taken at the frame's end, then drawn
    /// down small and back up, smoothly, twice.
    /// </summary>
    System.Collections.IEnumerator Blurred(System.Action<Texture> done)
    {
        yield return new WaitForEndOfFrame();
        if (shotTex != null) Destroy(shotTex);
        shotTex = ScreenCapture.CaptureScreenshotAsTexture();
        // (6 CSS px of blur: about a twelfth of a CSS px's worth per texel at the smallest.)
        float k = Css.PixelRatio * Css.Zoom * 6;
        int w = Mathf.Max(8, Mathf.RoundToInt(Screen.width / k)), h = Mathf.Max(8, Mathf.RoundToInt(Screen.height / k));
        var a = RenderTexture.GetTemporary(w * 2, h * 2, 0);
        var b = RenderTexture.GetTemporary(w, h, 0);
        a.filterMode = b.filterMode = FilterMode.Bilinear;
        Graphics.Blit(shotTex, a);
        Graphics.Blit(a, b);
        if (blurTex == null || blurTex.width != w * 2 || blurTex.height != h * 2)
        {
            if (blurTex != null) blurTex.Release();
            blurTex = new RenderTexture(w * 2, h * 2, 0) { filterMode = FilterMode.Bilinear };
        }
        Graphics.Blit(b, blurTex);
        RenderTexture.ReleaseTemporary(a);
        RenderTexture.ReleaseTemporary(b);
        done(blurTex);
    }

    /// <summary>
    /// The inspector (app.ts sheet 'card': .overlay.overlay-inspect &gt; .inspector.sheet): over the blurred, veiled
    /// screen, the card at --pw (min(280px, 56vh)) and beside it, as wide, what it carries explained; under them PLAY
    /// (a card in your hand: lit when it can be played now) and CLOSE, each at least 140 wide, 10 apart. A tap outside
    /// closes it.
    /// </summary>
    System.Collections.IEnumerator ShowInspector(string defId, string uid)
    {
        Texture back = null;
        yield return Blurred(t => back = t);
        foreach (Transform c in inspector) Mats.Kill(c.gameObject);
        inspector.SetAsLastSibling();
        inspector.gameObject.SetActive(true);
        var veil = inspector.gameObject.GetComponent<Image>() ?? inspector.gameObject.AddComponent<Image>();
        veil.color = new Color(1, 1, 1, 0.001f);
        var btn = inspector.gameObject.GetComponent<Button>() ?? inspector.gameObject.AddComponent<Button>();
        btn.transition = Selectable.Transition.None;
        btn.onClick.RemoveAllListeners();
        btn.onClick.AddListener(() => inspector.gameObject.SetActive(false));
        var bg = Hud.Rect(inspector, "Blur");
        Hud.Fill(bg);
        var bgi = bg.gameObject.AddComponent<RawImage>();
        bgi.texture = back;
        bgi.raycastTarget = false;
        var wash = Hud.Rect(inspector, "Veil");
        Hud.Fill(wash);
        var wi = wash.gameObject.AddComponent<Image>();
        wi.color = new Color(246 / 255f, 246 / 255f, 244 / 255f, 0.8f);
        wi.raycastTarget = false;
        var l = BoardLayout.Current;
        float pw = Mathf.Min(280, 56 * l.Vh), ch = pw * 1.4f;
        var sheetR = Hud.Rect(inspector, "Inspector");
        Hud.Fill(sheetR);
        sheetR.gameObject.AddComponent<Rise>();

        // The explanations, as wide as the card (.inspector-row .kw-wrap: width --pw), at most as tall.
        var rows = new List<ExplainRow>(Explain(defId));
        var owner = uid != null ? state.Players.FirstOrDefault(p => p.Tableau.Any(c => c.Uid == uid)) : null;
        var card = owner?.Tableau.First(c => c.Uid == uid);
        if (card != null) rows.Add(new ExplainRow { head = "⛨ Defence", colour = "rgb(79, 112, 168)", icon = -1, body = "Takes heat before stability." });
        RectTransform panel = null;
        float panelH = 0;
        if (rows.Count > 0) (panel, panelH) = ExplainPanel(sheetR, rows, pw, ch);

        // The actions: PLAY (your hand's card) and CLOSE.
        var held = uid != null ? Me.Hand.FirstOrDefault(c => c.Uid == uid) : null;
        float gap = Mathf.Clamp(2.4f * l.Vh, 10, 18), btnH = 10.56f * 1.25f + 18 + 2;
        float rowW = pw + (panel != null ? 16 + pw : 0), rowH = Mathf.Max(ch, panelH);
        float blockH = rowH + gap + btnH;
        float left = (l.W - rowW) / 2, top = (l.H - blockH) / 2;
        var face = Hud.Rect(sheetR, "Card");
        Hud.Place(face, left, top + (rowH - ch) / 2, pw, ch);
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
            if (atk > 0 || Game.BaseAttack(def) > 0) Badge(Faces.Where.atk, card.Dimmed == true ? "atk-dim" : "atk", Mathf.Max(0, atk));
            Badge(Faces.Where.stab, hp <= 1 ? "stab-low" : "stab", hp);
            bool guard = Game.IsGuard(owner, card);
            Badge(guard ? Faces.Where.guard : Faces.Where.def, guard ? "guard" : "def", Game.CardDefence(owner, card));
        }
        else if (Game.Persists(defId) && !Cards.IsBurst(def))
        {
            // (Not in play: its attack and stability as printed, stabilityBadge.)
            int atk = Game.BaseAttack(def);
            if (atk > 0) Badge(Faces.Where.atk, "atk", atk);
            Badge(Faces.Where.stab, "stab", Game.BaseHealth(defId));
        }
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
                b = box.gameObject.AddComponent<Button>();
                b.onClick.AddListener(() => inspector.gameObject.SetActive(false));
            }
            Hud.Place((RectTransform)b.transform, x, y, widths[i], btnH);
            x += widths[i] + 10;
        }
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
            r.anchoredPosition = home + new Vector2(0, -8 * (1 - e));
            if (g != null) { var c = g.color; c.a = e; g.color = c; }
            if (k >= 1) Destroy(this);
        }
    }
}
