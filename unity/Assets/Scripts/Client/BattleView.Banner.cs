using System.Collections;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The day's banner (app.ts showBanner, styles.css .turn-banner): as a day begins, its dawn announced across the middle
/// of the screen on a soft white bloom, a light sweeping across it: "dawn" (or whose), the round under it, a line
/// growing out under that and the orbit facing the sun today (and what it gives). Two seconds, fading in and out.
/// </summary>
public partial class BattleView
{
    const float BannerShown = 2f, BannerGap = 1.3f;
    float bannerFree;

    /// <summary>A day begins: its dawn's banner (the viewer's own reads plainly; anyone else's carries their name).</summary>
    void DawnBanner(GameState s, float delay)
    {
        if (s == null || s.WinnerId != null || Autoplay || hud == null || !Application.isPlaying) return;
        var p = Game.ActivePlayer(s);
        string text = p.Id == you ? "dawn" : $"{p.Name.ToLowerInvariant()}'s dawn";
        // (The AI waits for the day's banner to have come and gone before it acts.)
        if (p.IsAI) aiAfter = Mathf.Max(aiAfter, Mathf.Max(Time.time + delay, bannerFree) + BannerShown + 0.3f);
        StartCoroutine(Banner(text, $"round {BoardArt.Roman(s.Round)}", Game.CurrentPlanet(p, s), delay));
    }

    static Texture2D bannerGlow, bannerSweep, bannerLine;

    /// <summary>radial-gradient(ellipse 72% 60% at 50% 50%, rgba(250,250,248,.99), rgba(250,250,248,.92) 45%, transparent 75%).</summary>
    static Texture2D BannerGlow()
    {
        if (bannerGlow != null) return bannerGlow;
        const int w = 256, h = 64;
        bannerGlow = new Texture2D(w, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var px = new Color32[w * h];
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                float u = ((x + 0.5f) / w - 0.5f) / 0.72f, v = ((y + 0.5f) / h - 0.5f) / 0.6f;
                float d = Mathf.Sqrt(u * u + v * v);
                float a = d <= 0.45f ? Mathf.Lerp(0.99f, 0.92f, d / 0.45f) : d <= 0.75f ? Mathf.Lerp(0.92f, 0, (d - 0.45f) / 0.3f) : 0;
                px[y * w + x] = new Color32(250, 250, 248, (byte)Mathf.RoundToInt(a * 255));
            }
        bannerGlow.SetPixels32(px);
        bannerGlow.Apply();
        return bannerGlow;
    }

    /// <summary>A horizontal gradient: clear, `peak` in the middle (at 50%, from 35% to 65% for the sweep), clear.</summary>
    static Texture2D Across(Color peak, float from, float to)
    {
        const int w = 256;
        var t = new Texture2D(w, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var px = new Color32[w];
        for (int x = 0; x < w; x++)
        {
            float u = (x + 0.5f) / w;
            float a = u < from || u > to ? 0 : u < 0.5f ? (u - from) / (0.5f - from) : (to - u) / (to - 0.5f);
            var c = peak;
            c.a *= a;
            px[x] = c;
        }
        t.SetPixels32(px);
        t.Apply();
        return t;
    }

    IEnumerator Banner(string text, string sub, string planet, float delay)
    {
        float at = Mathf.Max(Time.time + delay, bannerFree);
        bannerFree = at + BannerGap;
        yield return new WaitForSeconds(at - Time.time);
        if (hud == null) yield break;
        var old = hud.transform.Find("Banner");
        if (old != null) Destroy(old.gameObject);
        Sound.Play("turn");
        var l = BoardLayout.Current;
        var root = Hud.Rect(hud.transform, "Banner");
        Hud.Fill(root);
        root.SetAsLastSibling();
        var life = root.gameObject.AddComponent<CanvasGroup>();
        life.blocksRaycasts = false;
        life.interactable = false;
        bool long_ = text.Length > 12;
        float size = long_ ? Mathf.Clamp(Mathf.Min(6.4f * l.Vh, 4.2f * l.Vw), 17.6f, 41.6f) : Mathf.Clamp(9 * l.Vh, 25.6f, 54.4f);
        float endSpace = long_ ? 0.34f : 0.5f, startSpace = long_ ? 0.6f : 0.9f;
        float subSize = 9.6f, lineW = Mathf.Min(420, 60 * l.Vw);
        // (The block: the words, the round 6 under them; the line 4 under that and the orbit 2 under it.)
        float textH = size * 1.25f, subH = subSize * 1.25f, orbitH = subSize * 1.25f + 4;
        float blockH = textH + 6 + subH + 6 + 4 + 1 + 6 + 2 + orbitH;
        float top = l.H / 2 - blockH / 2;
        // The bloom behind, min(46vh, 260px) tall across the whole width, and the light sweeping over it.
        float gh = Mathf.Min(46 * l.Vh, 260);
        var glow = Hud.Rect(root, "Glow");
        Hud.Place(glow, 0, l.H / 2 - gh / 2, l.W, gh);
        var gi = glow.gameObject.AddComponent<RawImage>();
        gi.texture = BannerGlow();
        gi.raycastTarget = false;
        var sweep = Hud.Rect(glow, "Sweep");
        sweep.anchorMin = new Vector2(0, 0.3f);
        sweep.anchorMax = new Vector2(1, 0.7f);
        sweep.offsetMin = sweep.offsetMax = Vector2.zero;
        var si = sweep.gameObject.AddComponent<RawImage>();
        bannerSweep ??= Across(Color.white, 0.35f, 0.65f);
        si.texture = bannerSweep;
        si.raycastTarget = false;
        // The words, the round, the line and the orbit.
        var words = Hud.Text(root, text.ToUpperInvariant(), 0, top, l.W, textH, size, Hud.Rgba(91, 95, 103), true, 400, startSpace * 100);
        var round = Hud.Text(root, sub.ToUpperInvariant(), 0, top + textH + 6, l.W, subH, subSize, Look.InkSoft, true, 400, 40);
        float ly = top + textH + 6 + subH + 6 + 4;
        var line = Hud.Rect(root, "Line");
        Hud.Place(line, (l.W - lineW) / 2, ly, lineW, 1);
        line.pivot = new Vector2(0.5f, 0.5f);
        line.anchoredPosition += new Vector2(lineW / 2, -0.5f);
        var li = line.gameObject.AddComponent<RawImage>();
        bannerLine ??= Across(Hud.Rgba(158, 161, 168), 0, 1);
        li.texture = bannerLine;
        li.raycastTarget = false;
        string gift = planet == "abundant" ? $"+{Balance.AbundantDraw}" : planet == "industrial" ? $"+{Balance.IndustrialPlays}" : null;
        var orbitT = $"{planet} orbit".ToUpperInvariant();
        float ow = Hud.Wide(orbitT, subSize, 400, 32, 0, true), giftW = gift != null ? 8 + 16 + 12 + 3 + Hud.Wide(gift, subSize, 400, 8, 0, true) : 0;
        float ox = (l.W - (ow + (gift != null ? 8 + giftW : 0))) / 2, oy = ly + 1 + 2;
        var orbit = Hud.Text(root, orbitT, ox, oy, ow + 2, orbitH, subSize, Hud.Rgba(109, 122, 142), true, 400, 32, TextAlignmentOptions.Left);
        RectTransform giftR = null;
        if (gift != null)
        {
            var pill = Hud.Box(root, "Gift", new Color(1, 1, 1, 0.92f), 999);
            giftR = (RectTransform)pill.transform;
            Hud.Place(giftR, ox + ow + 8, oy + (orbitH - (subSize * 1.25f + 4)) / 2, giftW, subSize * 1.25f + 4);
            WebLook.Shadow(pill, 1, 4, new Color(90 / 255f, 90 / 255f, 110 / 255f, 0.18f), 999);
            var ic = Hud.Rect(giftR, "Mark");
            float s = subSize * 0.9f;
            Hud.Place(ic, 8, (subSize * 1.25f + 4 - s) / 2, s * (planet == "abundant" ? 16f / 14 : 1), s);
            var img = ic.gameObject.AddComponent<Image>();
            if (planet == "abundant") { img.sprite = Sprite.Create(Resources.Load<Texture2D>("Icons/bt-hand"), new Rect(0, 0, Resources.Load<Texture2D>("Icons/bt-hand").width, Resources.Load<Texture2D>("Icons/bt-hand").height), new Vector2(0.5f, 0.5f)); img.color = Hud.Rgba(58, 66, 86); }
            else { img.sprite = Hud.Circle; img.color = Hud.Rgba(124, 199, 154); s *= 0.89f; }
            Hud.Text(giftR, gift, 8 + s + 3, 0, giftW - (8 + s + 3), subSize * 1.25f + 4, subSize, Hud.Rgba(58, 66, 86), true, 400, 8, TextAlignmentOptions.Left);
        }
        // The life of it: in by 12%, out from 75%; the words closing in from wide, the light sweeping, the line growing.
        float t0 = Time.time;
        while (true)
        {
            float t = Time.time - t0, k = t / BannerShown;
            if (k >= 1 || root == null) break;
            life.alpha = k < 0.12f ? k / 0.12f : k < 0.75f ? 1 : 1 - (k - 0.75f) / 0.25f;
            float Ease(float x) => 1 - Mathf.Pow(1 - Mathf.Clamp01(x), 3);
            float tw = Ease(t / BannerShown), ts = Ease((t - 0.1f) / BannerShown);
            words.characterSpacing = Mathf.Lerp(startSpace, endSpace, tw) * 100;
            words.alpha = Mathf.Clamp01(t / (0.3f * BannerShown));
            round.alpha = Mathf.Clamp01((t - 0.1f) / (0.3f * BannerShown));
            round.characterSpacing = Mathf.Lerp(0.9f, 0.4f, ts) * 100;
            float to = Mathf.Clamp01((t - 0.2f) / (0.3f * BannerShown));
            orbit.alpha = to;
            if (giftR != null) giftR.GetComponent<Image>().color = new Color(1, 1, 1, 0.92f * to);
            float sw = Mathf.Clamp01((t - 0.15f) / 1.4f);
            sweep.anchoredPosition = new Vector2(Mathf.Lerp(-0.6f, 0.6f, 1 - Mathf.Pow(1 - sw, 2)) * l.W, 0);
            float lg = Mathf.Clamp01((t - 0.2f) / 1.6f);
            line.localScale = new Vector3(1 - Mathf.Pow(1 - lg, 2), 1, 1);
            yield return null;
        }
        if (root != null) Destroy(root.gameObject);
    }
}
