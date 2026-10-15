using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// A battle's end (app.ts renderResult, styles.css .game-result): a white card floating flat over the board, its
/// middle 45% down the page (50% on a short screen), drawn at three quarters of its size; the result in large spaced
/// capitals (gold won, slate lost), why under it, what it earned, and the way on. The hand is put away meanwhile.
/// </summary>
public partial class BattleView
{
    RectTransform resultCard;

    /// <summary>An action under the result: its words, what it does, and whether it is the primary one (.btn-primary).</summary>
    public struct ResultAction
    {
        public string Label;
        public System.Action Act;
        public bool Primary;
        public ResultAction(string label, System.Action act, bool primary) { Label = label; Act = act; Primary = primary; }
    }

    void ClearResult()
    {
        if (resultCard != null) Destroy(resultCard.gameObject);
        resultCard = null;
    }

    /// <summary>
    /// The result card: `title` (won: gold, lost: slate, else ink), `why` under it (with Oriel's portrait beside it, a
    /// lesson learnt), `extra` (what the game earned) and its actions (`grouped`: in a row, as .result-actions).
    /// </summary>
    void ResultCard(string title, int tone, string why, string extra, ResultAction[] actions, bool grouped, bool oriel = false)
    {
        ClearResult();
        var l = BoardLayout.Current;
        // (@media (max-height: 560px): the phone's own sizes.)
        bool shortScreen = Screen.height / Css.PixelRatio <= 560;
        float padY = shortScreen ? 10 : Mathf.Clamp(2 * l.Vh, 10, 18), padX = shortScreen ? 18 : Mathf.Clamp(3 * l.Vw, 18, 36);
        float gap = shortScreen ? 4 : 6;
        float h2 = shortScreen ? 21.6f : Mathf.Clamp(7 * l.Vh, 22.4f, 44.8f), h2Space = shortScreen ? 26 : 32;
        float pSize = shortScreen ? 9.92f : Mathf.Clamp(2.3f * l.Vh, 9.92f, 14.4f);
        float exSize = Mathf.Clamp(2.2f * l.Vh, 9.92f, 13.76f);
        float btnSize = grouped && shortScreen ? 11.2f : 10.56f, btnPadX = 16, btnPadY = grouped && shortScreen ? 7 : 9;
        float btnH = btnSize * 1.25f + 2 * btnPadY + 2;
        var words = actions.Select(a => a.Label.ToUpperInvariant()).ToArray();
        var widths = actions.Select((a, i) => Hud.Wide(words[i], btnSize, a.Primary ? 700 : 500, 14, btnPadX, false) + 2).ToArray();

        // Measured first: the card is as wide as what it holds.
        string titleT = title.ToUpperInvariant();
        float titleW = Hud.Wide(titleT, h2, 700, h2Space, 0, true), titleH = h2 * 1.2f;
        float orielW = oriel ? 38 + 10 : 0;
        float whyMax = Mathf.Min(34 * pSize, l.W * 0.9f - 2 * padX - orielW);
        var probe = Hud.Rect(hud.transform, "Probe");
        var pt = probe.gameObject.AddComponent<TextMeshProUGUI>();
        Look.Style(pt, pSize, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
        pt.textWrappingMode = TextWrappingModes.Normal;
        var whySize = pt.GetPreferredValues(why, whyMax, 0);
        float whyW = Mathf.Min(whyMax, whySize.x + 1), whyH = Mathf.Max(oriel ? 38 : 0, pt.GetPreferredValues(why, whyW, 0).y);
        Destroy(probe.gameObject);
        float exH = string.IsNullOrEmpty(extra) ? 0 : exSize * 1.25f;
        float actW = grouped ? widths.Sum() + 8 * (widths.Length - 1) : widths.Max();
        float actH = grouped ? btnH : btnH * actions.Length + gap * (actions.Length - 1);
        float innerW = Mathf.Max(titleW, whyW + orielW, actW);
        float w = innerW + 2 * padX;
        float h = padY + titleH + gap + whyH + (exH > 0 ? gap + exH : 0) + gap + actH + padY;

        resultCard = Hud.Rect(hud.transform, "Result");
        float cy = l.H * (shortScreen ? 0.5f : 0.45f);
        resultCard.anchorMin = resultCard.anchorMax = new Vector2(0, 1);
        resultCard.pivot = new Vector2(0.5f, 0.5f);
        resultCard.anchoredPosition = new Vector2(l.W / 2, -cy);
        resultCard.sizeDelta = new Vector2(w, h);
        resultCard.SetAsLastSibling();
        var bg = Hud.Box(resultCard, "Card", Color.white, 22);
        Hud.Fill((RectTransform)bg.transform);
        WebLook.Shadow(bg, 10, 30, new Color(70 / 255f, 76 / 255f, 100 / 255f, 0.18f), 22, 1, Color.white);
        resultCard.gameObject.AddComponent<ResultIn>();

        float y = padY;
        var colour = tone > 0 ? Hud.Rgba(194, 122, 30) : tone < 0 ? Hud.Rgba(107, 117, 144) : Look.Ink;
        var t = Hud.Text(resultCard, titleT, 0, y, w, titleH, h2, colour, true, 700, h2Space);
        y += titleH + gap;
        float wx = (w - (whyW + orielW)) / 2;
        if (oriel)
        {
            var face = Hud.Rect(resultCard, "Oriel");
            Hud.Place(face, wx, y + (whyH - 38) / 2, 38, 38);
            var ring = face.gameObject.AddComponent<Image>();
            ring.sprite = Hud.Circle;
            ring.color = Color.white;
            var pic = Hud.Rect(face, "Picture");
            Hud.Fill(pic);
            pic.offsetMin = new Vector2(2, 2);
            pic.offsetMax = new Vector2(-2, -2);
            pic.gameObject.AddComponent<Image>().sprite = Hud.Circle;
            pic.gameObject.AddComponent<Mask>().showMaskGraphic = false;
            var art = Hud.Rect(pic, "Art");
            Hud.Fill(art);
            art.gameObject.AddComponent<RawImage>().texture = Resources.Load<Texture2D>("Portraits/oriel");
        }
        var wt = Hud.Text(resultCard, why, wx + orielW, y, whyW, whyH, pSize, Look.InkSoft, false, 400, 0, oriel ? TextAlignmentOptions.MidlineLeft : TextAlignmentOptions.Top);
        wt.textWrappingMode = TextWrappingModes.Normal;
        y += whyH;
        if (exH > 0)
        {
            y += gap;
            Hud.Text(resultCard, extra, 0, y, w, exH, exSize, Look.Ink, true, 500, 0);
            y += exH;
        }
        y += gap;
        float x = grouped ? (w - actW) / 2 : 0;
        for (int i = 0; i < actions.Length; i++)
        {
            var a = actions[i];
            float bw = widths[i], bx = grouped ? x : (w - bw) / 2;
            Button b;
            if (a.Primary) b = WhiteButton(resultCard, words[i], a.Act, btnSize, 10, 1);
            else
            {
                var box = Hud.Box(resultCard, words[i], new Color(252 / 255f, 252 / 255f, 251 / 255f), 10);
                WebLook.Shadow(box, 2, 10, new Color(90 / 255f, 90 / 255f, 110 / 255f, 0.12f), 10, 1, Color.white);
                Hud.Label(box.transform, words[i], btnSize, Look.Ink, false, 500, 14);
                box.raycastTarget = true;
                b = box.gameObject.AddComponent<Button>();
                var act = a.Act;
                b.onClick.AddListener(() => act());
            }
            Hud.Place((RectTransform)b.transform, bx, y, bw, btnH);
            if (grouped) x += bw + 8;
            else y += btnH + gap;
        }
    }

    /// <summary>@keyframes result-in: from nothing, 10 px lower and at 0.7, to its place at 0.75 (0.6 s, cubic-bezier(.2,.8,.2,1)).</summary>
    class ResultIn : MonoBehaviour
    {
        float t0;
        RectTransform r;
        Vector2 home;
        CanvasGroup g;
        void Start()
        {
            t0 = Time.time;
            r = (RectTransform)transform;
            home = r.anchoredPosition;
            g = gameObject.AddComponent<CanvasGroup>();
            Update();
        }
        void Update()
        {
            float k = Mathf.Clamp01((Time.time - t0) / 0.6f);
            float e = Bezier(k);
            g.alpha = e;
            r.localScale = Vector3.one * Mathf.Lerp(0.7f, 0.75f, e);
            r.anchoredPosition = home + new Vector2(0, -10 * (1 - e));
            if (k >= 1) { r.localScale = Vector3.one * 0.75f; Destroy(this); }
        }
        // (cubic-bezier(.2,.8,.2,1), solved for the time.)
        static float Bezier(float x)
        {
            float t = x;
            for (int i = 0; i < 8; i++)
            {
                float cx = 3 * 0.2f * t * (1 - t) * (1 - t) + 3 * 0.2f * t * t * (1 - t) + t * t * t - x;
                float d = 3 * 0.2f * (1 - t) * (1 - t) - 6 * 0.2f * t * (1 - t) + 3 * 0.2f * t * t - 6 * 0.2f * t * (1 - t) + 3 * t * t;
                d = Mathf.Max(1e-4f, d);
                t = Mathf.Clamp01(t - cx / d);
            }
            return 3 * 0.8f * t * (1 - t) * (1 - t) + 3 * 1f * t * t * (1 - t) + t * t * t;
        }
    }
}
