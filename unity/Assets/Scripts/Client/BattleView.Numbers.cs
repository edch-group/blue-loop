using System.Collections;
using System.Collections.Generic;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// What a blow did, floated up where it landed (app.ts floatNumber and cardShiftNumbers, styles.css .dmg): heat taken
/// or cooled over a sun, shields lost or raised beside it, a card's own changes over it; and the screen's edges
/// burning a moment when you take heat (hurtFlash, .hurt-vignette).
/// </summary>
public partial class BattleView
{
    /// <summary>A change to a card in play (app.ts Shift): its words, its tone, and whether it hurt the card.</summary>
    struct Shift
    {
        public string Text, Tone;
        public bool Bad;
        public Shift(string text, string tone, bool bad) { Text = text; Tone = tone; Bad = bad; }
    }

    /// <summary>app.ts cardShift: what a move changed on a card that stays in play.</summary>
    static List<Shift> CardShift(GameState prev, GameState next, string uid)
    {
        (PlayerState p, CardInstance c) Find(GameState st)
        {
            foreach (var p in st.Players)
                foreach (var c in p.Tableau)
                    if (c.Uid == uid) return (p, c);
            return (null, null);
        }
        var a = Find(prev);
        var b = Find(next);
        var o = new List<Shift>();
        if (a.c == null || b.c == null) return o;
        string N(int d) => $"{(d > 0 ? "+" : "−")}{Mathf.Abs(d)}";
        int dh = (b.c.Health ?? 0) - (a.c.Health ?? 0);
        if (dh != 0) o.Add(new Shift(N(dh), dh > 0 ? "buff" : "hot", dh < 0));
        int dd = Game.CardDefence(b.p, b.c) - Game.CardDefence(a.p, a.c);
        if (dd != 0) o.Add(new Shift("⛨" + N(dd), dd > 0 ? "buff" : "block", dd < 0));
        int da = Game.CardAttack(next, b.p, b.c) - Game.CardAttack(prev, a.p, a.c);
        if (da != 0) o.Add(new Shift("⚔" + N(da), da > 0 ? "buff" : "hot", da < 0));
        int ds = (b.c.Shields ?? 0) - (a.c.Shields ?? 0);
        if (ds > 0) o.Add(new Shift($"⬡+{ds}", "block", false));
        if (b.c.Frozen == true && a.c.Frozen != true) o.Add(new Shift("❄", "cool", true));
        if (b.c.Slot != a.c.Slot && b.p.Id == a.p.Id) o.Add(new Shift("⇄", "block", true));
        return o;
    }

    /// <summary>A card's changes floated up over it, one above the next, `after` seconds from now.</summary>
    void CardShiftNumbers(List<Shift> shift, Rect at, float after)
    {
        if (shift.Count == 0) return;
        for (int i = 0; i < shift.Count; i++)
            Dmg(shift[i].Text, shift[i].Tone, true, new Vector2(at.x + at.width / 2, at.y + at.height * (0.42f - i * 0.2f)), after);
    }

    /// <summary>Over a sun: heat over its middle (row 0); shields lower down and to its side (row 1).</summary>
    void FloatNumber(Rect at, string text, string tone, int row, float after = 0) =>
        Dmg(text, tone, false, new Vector2(at.x + at.width * (row != 0 ? 1.02f : 0.5f), at.y + at.height * (row != 0 ? 0.78f : 0.34f)), after);

    /// <summary>
    /// .dmg: Orbitron, heavy, clamp(22px, 6vh, 44px) (shields clamp(16px, 4.2vh, 30px); a card's clamp(15px, 3.6vh,
    /// 26px)), stroked white 1.5 under its fill, a soft shadow under it; centred on its point, rising as dmg-rise.
    /// </summary>
    void Dmg(string text, string tone, bool card, Vector2 page, float after)
    {
        if (hud == null || !Application.isPlaying) return;
        StartCoroutine(DmgAfter(text, tone, card, page, after));
    }

    IEnumerator DmgAfter(string text, string tone, bool card, Vector2 page, float after)
    {
        if (after > 0) yield return new WaitForSeconds(after);
        if (hud == null) yield break;
        var l = BoardLayout.Current;
        float size = card ? Mathf.Clamp(3.6f * l.Vh, 15, 26) : tone == "block" ? Mathf.Clamp(4.2f * l.Vh, 16, 30) : Mathf.Clamp(6 * l.Vh, 22, 44);
        var colour = tone switch
        {
            "hot" => Hud.Rgba(0xe2, 0x46, 0x1f),
            "cool" => Hud.Rgba(0x3d, 0x8f, 0xd8),
            "buff" => Hud.Rgba(0xc9, 0x9a, 0x2e),
            _ => Hud.Rgba(0x5b, 0x7b, 0xb3),
        };
        var t = Hud.Label(hud.transform, text, size, colour, true, 700, 2);
        t.textWrappingMode = TextWrappingModes.NoWrap;
        t.raycastTarget = false;
        var r = t.rectTransform;
        r.anchorMin = r.anchorMax = new Vector2(0, 1);
        r.pivot = new Vector2(0.5f, 0.5f);
        r.sizeDelta = new Vector2(t.GetPreferredValues(text).x + 8, size * 1.25f);
        r.anchoredPosition = new Vector2(page.x, -page.y);
        r.SetAsLastSibling();
        Hud.Own(r, 25);
        // (-webkit-text-stroke 1.5px #fff, painted under the fill; text-shadow 0 2px 10px rgba(0,0,0,.25).)
        t.outlineColor = Color.white;
        t.outlineWidth = Mathf.Clamp01(1.5f / size * 2.2f);
        t.fontMaterial.EnableKeyword("UNDERLAY_ON");
        t.fontMaterial.SetColor("_UnderlayColor", new Color(0, 0, 0, 0.25f));
        t.fontMaterial.SetFloat("_UnderlayOffsetY", -2f / size * 2);
        t.fontMaterial.SetFloat("_UnderlaySoftness", 0.6f);
        t.gameObject.AddComponent<DmgRise>();
    }

    /// <summary>
    /// @keyframes dmg-rise (1.3 s, each step eased cubic-bezier(.2,.8,.2,1)): from nothing at half size, a little
    /// low, to whole at 1.35 by 15%; settling to 1 by 30%; rising and fading to nothing by the end.
    /// </summary>
    class DmgRise : MonoBehaviour
    {
        float t0;
        RectTransform r;
        Vector2 home;
        TMP_Text text;

        void Start()
        {
            t0 = Time.time;
            r = (RectTransform)transform;
            home = r.anchoredPosition;
            text = GetComponent<TMP_Text>();
            Update();
        }

        void Update()
        {
            float k = (Time.time - t0) / 1.3f;
            if (k >= 1) { Mats.Kill(gameObject); return; }
            float E(float a, float b) => CubicBezier(0.2f, 0.8f, 0.2f, 1, Mathf.Clamp01((k - a) / (b - a)));
            // (Its translate in its own heights, from -50%, and its scale and opacity, at each step.)
            float y, s, o;
            if (k < 0.15f) { float e = E(0, 0.15f); y = Mathf.Lerp(-0.3f, -0.6f, e); s = Mathf.Lerp(0.5f, 1.35f, e); o = e; }
            else if (k < 0.3f) { float e = E(0.15f, 0.3f); y = Mathf.Lerp(-0.6f, -0.7f, e); s = Mathf.Lerp(1.35f, 1, e); o = 1; }
            else { float e = E(0.3f, 1); y = Mathf.Lerp(-0.7f, -1.9f, e); s = Mathf.Lerp(1, 0.95f, e); o = 1 - e; }
            r.anchoredPosition = home - new Vector2(0, (y + 0.5f) * r.sizeDelta.y);
            r.localScale = Vector3.one * s;
            text.alpha = o;
        }
    }

    static Texture2D hurtGlow;
    static Vector2 hurtGlowFor;

    /// <summary>
    /// .hurt-vignette: the screen's edges burning (an inset shadow, rgba(230,70,30,.55) blurred over 18vh), in by 12% of
    /// 0.9 s and out by its end (each eased out), `after` seconds from now.
    /// </summary>
    void HurtFlash(float after = 0)
    {
        if (hud == null || !Application.isPlaying) return;
        StartCoroutine(Hurt(after));
    }

    IEnumerator Hurt(float after)
    {
        if (after > 0) yield return new WaitForSeconds(after);
        if (hud == null) yield break;
        var l = BoardLayout.Current;
        var size = new Vector2(l.W, l.H);
        if (hurtGlow == null || hurtGlowFor != size)
        {
            // (The shade beyond the screen's box, blurred by a Gaussian of half the blur, as it falls inside.)
            const int w = 192, h = 96;
            hurtGlowFor = size;
            if (hurtGlow == null) hurtGlow = new Texture2D(w, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            float sigma = 18 * l.Vh / 2;
            float In(float d) => 0.5f * (1 + Erf(d / (sigma * 1.41421356f)));
            var px = new Color32[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    float px_ = (x + 0.5f) / w * size.x, py = (y + 0.5f) / h * size.y;
                    float inside = (In(px_) - In(px_ - size.x)) * (In(py) - In(py - size.y));
                    px[y * w + x] = new Color32(230, 70, 30, (byte)Mathf.RoundToInt(Mathf.Clamp01(1 - inside) * 0.55f * 255));
                }
            hurtGlow.SetPixels32(px);
            hurtGlow.Apply();
        }
        var r = Hud.Rect(hud.transform, "Hurt");
        Hud.Fill(r);
        Hud.Own(r, 26);
        r.SetAsLastSibling();
        var img = r.gameObject.AddComponent<RawImage>();
        img.texture = hurtGlow;
        img.raycastTarget = false;
        float t0 = Time.time;
        while (r != null)
        {
            float k = (Time.time - t0) / 0.9f;
            if (k >= 1) break;
            float Out(float x) => CubicBezier(0, 0, 0.58f, 1, Mathf.Clamp01(x));
            img.color = new Color(1, 1, 1, k < 0.12f ? Out(k / 0.12f) : 1 - Out((k - 0.12f) / 0.88f));
            yield return null;
        }
        if (r != null) Destroy(r.gameObject);
    }

    /// <summary>The error function (Abramowitz and Stegun 7.1.26).</summary>
    static float Erf(float x)
    {
        float s = Mathf.Sign(x);
        x = Mathf.Abs(x);
        float t = 1 / (1 + 0.3275911f * x);
        float y = 1 - (((((1.061405429f * t - 1.453152027f) * t) + 1.421413741f) * t - 0.284496736f) * t + 0.254829592f) * t * Mathf.Exp(-x * x);
        return s * y;
    }

    /// <summary>Something done `seconds` from now.</summary>
    static IEnumerator After(float seconds, System.Action act)
    {
        if (seconds > 0) yield return new WaitForSeconds(seconds);
        act();
    }
}
