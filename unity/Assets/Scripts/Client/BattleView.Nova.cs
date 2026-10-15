using System.Collections;
using BlueLoop.Engine;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// A sun going supernova (app.ts supernovaAt, fx.ts supernovaBurst): as the blow lands, the sun flares; a flash white
/// at its heart swells past it and fades, three shockwaves go out, sparks are flung away; the screen flashes white and
/// the board quakes. The sun is drawn alive until its explosion has played (app.ts dying).
/// </summary>
public partial class BattleView
{
    /// <summary>A sun goes supernova `after` seconds from now (as the blow that causes it lands).</summary>
    void SupernovaAt(GameState next, string pid, float after)
    {
        if (!Application.isPlaying || hud == null) return;
        var p = next.Players.Find(x => x.Id == pid);
        // (Drawn alive meanwhile, and for the explosion's 0.9 s.)
        if (p != null) Board?.HoldSun(pid, next, WithSun(p, new SunAt { Heat = p.Heat, Shields = p.Shields, Eliminated = false }), after + 0.9f);
        StartCoroutine(After(after, () =>
        {
            Sound.Play("supernova");
            Board?.SunOf(pid)?.Pulse(true);
            var r = SunRect(pid);
            if (r != null) NovaBurst(r.Value);
            StartCoroutine(Flash(0.12f));
            StartCoroutine(Quake(0.06f));
        }));
    }

    /// <summary>fx.ts supernovaBurst: the flash, three shockwaves and 28 sparks, from the middle of `at`.</summary>
    void NovaBurst(Rect at)
    {
        var c = at.center;
        float r = Mathf.Max(30, at.width / 2);
        var layer = Hud.Rect(hud.transform, "Nova");
        layer.anchorMin = layer.anchorMax = new Vector2(0, 1);
        layer.pivot = new Vector2(0.5f, 0.5f);
        layer.anchoredPosition = new Vector2(c.x, -c.y);
        layer.sizeDelta = Vector2.zero;
        layer.SetAsLastSibling();
        Hud.Own(layer, 27);
        // The flash: white at the heart, orange at its edge, swelling past the sun and fading (1.3 s).
        var core = Disc(layer, "Core", NovaCore(), 2 * r);
        StartCoroutine(Animate(1.3f, 0, k =>
        {
            float e = CubicBezier(0.2f, 0.7f, 0.3f, 1, k);
            float s = e < 0.25f ? Mathf.Lerp(0.6f, 2.6f, e / 0.25f) : Mathf.Lerp(2.6f, 4.2f, (e - 0.25f) / 0.75f);
            core.rectTransform.localScale = Vector3.one * s;
            core.color = new Color(1, 1, 1, e < 0.25f ? 1 : 1 - (e - 0.25f) / 0.75f);
        }));
        // Shockwaves: three rings, each a little later and wider.
        float[] delays = { 0, 0.14f, 0.32f };
        for (int i = 0; i < 3; i++)
        {
            var ringR = Hud.Rect(layer, "Ring");
            ringR.anchorMin = ringR.anchorMax = new Vector2(0.5f, 0.5f);
            ringR.sizeDelta = Vector2.zero;
            var ring = ringR.gameObject.AddComponent<NovaRing>();
            ring.Radius = r;
            ring.color = new Color(1, 1, 1, 0);
            int n = i;
            StartCoroutine(Animate(1.1f + i * 0.25f, delays[i], k =>
            {
                float e = CubicBezier(0.15f, 0.6f, 0.3f, 1, k);
                ring.Scale = Mathf.Lerp(0.8f, 7 + n * 3, e);
                ring.Border = Mathf.Lerp(6 - n, 1, e);
                ring.color = new Color(1, 1, 1, Mathf.Lerp(0.95f, 0, e));
                ring.SetVerticesDirty();
            }));
        }
        // Sparks flung outwards.
        const int sparks = 28;
        for (int i = 0; i < sparks; i++)
        {
            float angle = i / (float)sparks * Mathf.PI * 2 + Random.value * 0.3f;
            float dist = r * (2.2f + Random.value * 3.5f), size = 3 + Random.value * 5;
            var s = Disc(layer, "Spark", Spark(), size + 2 * 10);
            s.color = new Color(1, 1, 1, 0);
            var to = new Vector2(Mathf.Cos(angle) * dist, -Mathf.Sin(angle) * dist);
            StartCoroutine(Animate(0.9f + Random.value * 0.7f, 0.06f + Random.value * 0.12f, k =>
            {
                float e = CubicBezier(0.1f, 0.7f, 0.3f, 1, k);
                s.rectTransform.anchoredPosition = to * e;
                s.rectTransform.localScale = Vector3.one * Mathf.Lerp(1, 0.3f, e);
                s.color = new Color(1, 1, 1, 1 - e);
            }));
        }
        StartCoroutine(After(2.4f, () => { if (layer != null) Destroy(layer.gameObject); }));
    }

    static RawImage Disc(RectTransform parent, string name, Texture2D tex, float size)
    {
        var d = Hud.Rect(parent, name);
        d.anchorMin = d.anchorMax = new Vector2(0.5f, 0.5f);
        d.pivot = new Vector2(0.5f, 0.5f);
        d.sizeDelta = new Vector2(size, size);
        var img = d.gameObject.AddComponent<RawImage>();
        img.texture = tex;
        img.raycastTarget = false;
        return img;
    }

    /// <summary>A step of an animation each frame, `k` from 0 to 1 over `seconds`, after `delay` (held at 0 until then).</summary>
    IEnumerator Animate(float seconds, float delay, System.Action<float> step)
    {
        step(0);
        if (delay > 0) yield return new WaitForSeconds(delay);
        float t0 = Time.time;
        while (true)
        {
            float k = Mathf.Clamp01((Time.time - t0) / seconds);
            try { step(k); }
            catch (MissingReferenceException) { yield break; }
            if (k >= 1) yield break;
            yield return null;
        }
    }

    static Texture2D novaCore, spark;

    /// <summary>.nova-core: radial-gradient(circle, #fff 0 30%, #fff3c4 45%, rgba(255,170,60,.85) 62%, transparent 72%), blurred 2 px.</summary>
    static Texture2D NovaCore()
    {
        if (novaCore != null) return novaCore;
        const int n = 128;
        novaCore = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var clear = new Color(1, 110 / 255f, 40 / 255f, 0);
        var stops = new[] { (0.3f, Color.white), (0.45f, new Color(1, 243 / 255f, 196 / 255f, 1)), (0.62f, new Color(1, 170 / 255f, 60 / 255f, 0.85f)), (0.72f, clear), (1f, clear) };
        var px = new Color[n * n];
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float dx = (x + 0.5f) / n * 2 - 1, dy = (y + 0.5f) / n * 2 - 1;
                px[y * n + x] = Stops(Mathf.Sqrt(dx * dx + dy * dy), stops);
            }
        novaCore.SetPixels(px);
        novaCore.Apply();
        return novaCore;
    }

    /// <summary>.nova-spark: a disc of #fff6d8 with a glow (0 0 8px 2px rgba(255,170,70,.9)) round it; drawn 20 px wider.</summary>
    static Texture2D Spark()
    {
        if (spark != null) return spark;
        const int n = 64;
        spark = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var px = new Color[n * n];
        // (The disc is the middle 0.3 of it, its glow to the edge.)
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float dx = (x + 0.5f) / n * 2 - 1, dy = (y + 0.5f) / n * 2 - 1;
                float u = Mathf.Sqrt(dx * dx + dy * dy);
                float disc = Mathf.Clamp01((0.3f - u) * n / 2 + 0.5f);
                float g = 0.9f * Mathf.Exp(-Mathf.Pow(Mathf.Max(0, u - 0.36f) / 0.3f, 2) * 2);
                var glow = new Color(1, 170 / 255f, 70 / 255f, g * (u > 1 ? 0 : 1));
                var core = new Color(1, 246 / 255f, 216 / 255f, disc);
                float a = core.a + glow.a * (1 - core.a);
                px[y * n + x] = a > 0 ? new Color((core.r * core.a + glow.r * glow.a * (1 - core.a)) / a, (core.g * core.a + glow.g * glow.a * (1 - core.a)) / a, (core.b * core.a + glow.b * glow.a * (1 - core.a)) / a, a) : new Color(1, 1, 1, 0);
            }
        spark.SetPixels(px);
        spark.Apply();
        return spark;
    }

    /// <summary>.fx-flash: the whole screen white, from 0.95 to nothing over a second (ease-out), `after` from now.</summary>
    IEnumerator Flash(float after)
    {
        if (after > 0) yield return new WaitForSeconds(after);
        if (hud == null) yield break;
        var r = Hud.Rect(hud.transform, "Flash");
        Hud.Fill(r);
        Hud.Own(r, 40);
        r.SetAsLastSibling();
        var img = r.gameObject.AddComponent<Image>();
        img.raycastTarget = false;
        float t0 = Time.time;
        while (r != null)
        {
            float k = (Time.time - t0) / 1f;
            if (k >= 1) break;
            img.color = new Color(1, 1, 1, Mathf.Lerp(0.95f, 0, CubicBezier(0, 0, 0.58f, 1, k)));
            yield return null;
        }
        if (r != null) Destroy(r.gameObject);
    }

    /// <summary>.fx-quake: the board shaken (0.6 s): -7,3 · 6,-4 · -5,2 · 4,-2 · -2,1 · 1,0 px, at each 15% from 10%.</summary>
    IEnumerator Quake(float after)
    {
        if (after > 0) yield return new WaitForSeconds(after);
        if (Cam == null) yield break;
        var cam = Cam.transform;
        var keys = new[] { (0f, Vector2.zero), (0.1f, new Vector2(-7, 3)), (0.25f, new Vector2(6, -4)), (0.4f, new Vector2(-5, 2)), (0.55f, new Vector2(4, -2)), (0.7f, new Vector2(-2, 1)), (0.85f, new Vector2(1, 0)), (1f, Vector2.zero) };
        float t0 = Time.time;
        var applied = Vector3.zero;
        while (cam != null)
        {
            float k = CubicBezier(0.3f, 0.6f, 0.4f, 1, Mathf.Clamp01((Time.time - t0) / 0.6f));
            int i = 0;
            while (i < keys.Length - 2 && k > keys[i + 1].Item1) i++;
            var a = keys[i];
            var b = keys[i + 1];
            var px = Vector2.Lerp(a.Item2, b.Item2, (k - a.Item1) / Mathf.Max(1e-4f, b.Item1 - a.Item1));
            // (The board moves by these pixels: the camera the other way.)
            var off = -(cam.right * Board.Px(px.x) - cam.up * Board.Px(px.y));
            cam.position += off - applied;
            applied = off;
            if (Time.time - t0 >= 0.6f) break;
            yield return null;
        }
        if (cam != null) cam.position -= applied;
    }
}

/// <summary>
/// .nova-ring: a ring `Radius` across at scale 1, its border (`Border` px, rgba(255,200,120,.95)) and its glow
/// (0 0 18px rgba(255,160,70,.8) outside, inset 0 0 14px rgba(255,230,180,.7) inside), drawn at `Scale`.
/// </summary>
public class NovaRing : MaskableGraphic
{
    public float Radius = 30, Border = 5, Scale = 1;

    protected override void OnPopulateMesh(VertexHelper vh)
    {
        vh.Clear();
        float R = Radius * Scale, bw = Border * Scale;
        var edge = new Color(1, 200 / 255f, 120 / 255f, 0.95f);
        var outer = new Color(1, 160 / 255f, 70 / 255f, 0.8f);
        var inner = new Color(1, 230 / 255f, 180 / 255f, 0.7f);
        var a = color.a;
        Color A(Color c, float k) => new Color(c.r, c.g, c.b, c.a * k * a);
        // (Bands from inside out: the inset glow fading in, the border, the glow fading out.)
        Band(vh, R - bw - 14, R - bw, A(inner, 0), A(inner, 1));
        Band(vh, R - bw, R, A(edge, 1), A(edge, 1));
        Band(vh, R, R + 18, A(outer, 1), A(outer, 0));
    }

    static void Band(VertexHelper vh, float r0, float r1, Color c0, Color c1)
    {
        r0 = Mathf.Max(0, r0);
        if (r1 <= r0) return;
        const int n = 72;
        int start = vh.currentVertCount;
        for (int i = 0; i <= n; i++)
        {
            float t = i / (float)n * Mathf.PI * 2;
            var d = new Vector2(Mathf.Cos(t), Mathf.Sin(t));
            vh.AddVert(d * r0, c0, Vector4.zero);
            vh.AddVert(d * r1, c1, Vector4.zero);
            if (i > 0)
            {
                int k = start + 2 * (i - 1);
                vh.AddTriangle(k, k + 2, k + 1);
                vh.AddTriangle(k + 1, k + 2, k + 3);
            }
        }
    }
}
