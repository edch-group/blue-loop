using System.Collections;
using TMPro;
using UnityEngine;

/// <summary>
/// The phase track's light (styles.css .phase-step, app.ts setPhase, flashPhase): the phase under way lit, its word
/// dark and its dot in the phase's colour, glowing (the rest grey), each change eased over 0.4 s; the phase coming in
/// lights up a moment, a soft glow in its colour swelling round it (.phase-glow, well clear of the word) and its dot
/// pulsing, then settling.
/// </summary>
public partial class Board
{
    static readonly string[] PhaseNames = { "dawn", "day", "dusk" };
    /// <summary>The phase shown lit, and the track it was shown on (a new one after a relayout).</summary>
    string phaseShown;
    TextMeshPro[] phaseShownOn;
    Coroutine phaseFade;
    readonly MeshRenderer[] phaseFlash = new MeshRenderer[3];
    readonly float[] dotPulseUntil = new float[3];
    static Texture2D phaseGlowTex;

    /// <summary>A phase's own colour (.phase-step[data-phase]: dawn amber, day gold, dusk violet).</summary>
    static Color PhaseColour(int i) => i == 0 ? Rgba(240, 160, 64) : i == 1 ? Rgba(232, 194, 58) : Rgba(138, 106, 208);

    /// <summary>The phase under way lit on the track (eased over 0.4 s, as the web's transitions; at once on a new track).</summary>
    public void ShowPhase(string phase)
    {
        if (phases == null) return;
        bool fresh = phaseShownOn != phases;
        if (!fresh && phase == phaseShown) return;
        phaseShown = phase;
        phaseShownOn = phases;
        if (phaseFade != null) StopCoroutine(phaseFade);
        phaseFade = null;
        if (fresh || !Application.isPlaying || !isActiveAndEnabled) { PhaseLook(phase, 1, null); return; }
        var from = new Color[9];
        for (int i = 0; i < 3; i++)
        {
            from[i] = phases[i].color;
            from[3 + i] = phaseDots[i].sharedMaterial.color;
            from[6 + i] = phaseGlows[i].sharedMaterial.color;
        }
        phaseFade = StartCoroutine(PhaseFade(phase, from));
    }

    IEnumerator PhaseFade(string phase, Color[] from)
    {
        float t0 = Time.time;
        while (true)
        {
            float k = Mathf.Clamp01((Time.time - t0) / 0.4f);
            // (CSS's ease: cubic-bezier(.25, .1, .25, 1).)
            PhaseLook(phase, BattleView.CubicBezier(0.25f, 0.1f, 0.25f, 1, k), from);
            if (k >= 1) break;
            yield return null;
        }
        phaseFade = null;
    }

    void PhaseLook(string phase, float k, Color[] from)
    {
        for (int i = 0; i < phases.Length; i++)
        {
            if (phases[i] == null) continue;
            bool on = PhaseNames[i] == phase;
            var pc = PhaseColour(i);
            // (.phase-step.on: the word #2f3a52; .phase-step.on i: the dot in its colour, glowing 10 px; the rest #a3aab5, #c9ced8.)
            Color word = on ? Rgba(47, 58, 82) : Rgba(163, 170, 181), dot = on ? pc : Rgba(201, 206, 216), glow = new Color(pc.r, pc.g, pc.b, on ? 0.8f : 0);
            phases[i].color = from != null ? Color.Lerp(from[i], word, k) : word;
            phaseDots[i].sharedMaterial.color = from != null ? Color.Lerp(from[3 + i], dot, k) : dot;
            phaseGlows[i].sharedMaterial.color = from != null ? Color.Lerp(from[6 + i], glow, k) : glow;
            if (Time.time >= dotPulseUntil[i]) phaseDots[i].transform.localScale = dotScale;
        }
    }

    /// <summary>
    /// app.ts flashPhase: a soft glow swelling round the phase coming in (.phase-glow: inset -10px -20px -10px -14px
    /// round its step, a radial gradient of its colour; opacity 0 → 1 at 28% → 0, scale .82 → 1 → 1.06, 1.1 s
    /// ease-out) and its dot pulsing (scale 1 → 1.55 at 25% → 1, 0.7 s ease-out).
    /// </summary>
    public void FlashPhase(string phase)
    {
        int i = System.Array.IndexOf(PhaseNames, phase);
        if (i < 0 || phases == null || phases[i] == null || !Application.isPlaying || !isActiveAndEnabled) return;
        var l = L;
        // The step: its dot, 8 px (5 on a phone), its word; as tall as a row of the track.
        var word = phases[i];
        float left = l.StellariR, right = l.StellariR + l.PhaseDot + l.PhaseGap + word.GetPreferredValues(word.text).x * l.Tcw;
        float h = l.PhaseFont * 1.15f;
        float gw = right - left + 14 + 20, gh = h + 20;
        float z = word.transform.localPosition.z;
        if (phaseFlash[i] == null)
        {
            phaseFlash[i] = Picture("Phase glow", word.transform.parent, PhaseGlowTexture(), Color.clear, 1, 1, 2984, 0.0085f);
        }
        var g = phaseFlash[i];
        g.transform.localPosition = new Vector3(l.U(left - 14 + gw / 2), 0.0085f, z);
        StartCoroutine(Flash(i, g, l.U(gw), l.U(gh)));
    }

    IEnumerator Flash(int i, MeshRenderer glow, float w, float h)
    {
        var pc = PhaseColour(i);
        // (--pc: the phase's colour at .32 (dusk .3).)
        float alpha = i == 2 ? 0.3f : 0.32f;
        var dot = phaseDots[i].transform;
        var ring = DotRing(i);
        Vector3 ringScale = ring != null ? ring.localScale : Vector3.one, glowScale = phaseGlows[i].transform.localScale;
        float t0 = Time.time;
        dotPulseUntil[i] = t0 + 0.7f;
        while (glow != null)
        {
            float t = Time.time - t0;
            // (Each animation eased as a whole, ease-out: cubic-bezier(0, 0, .58, 1); its keyframes linear between.)
            float g = BattleView.CubicBezier(0, 0, 0.58f, 1, Mathf.Clamp01(t / 1.1f));
            float o = g < 0.28f ? g / 0.28f : 1 - (g - 0.28f) / 0.72f;
            float s = g < 0.28f ? Mathf.Lerp(0.82f, 1, g / 0.28f) : Mathf.Lerp(1, 1.06f, (g - 0.28f) / 0.72f);
            glow.transform.localScale = new Vector3(w * s, h * s, 1);
            glow.sharedMaterial.color = new Color(pc.r, pc.g, pc.b, alpha * o);
            if (dot != null && t < 0.7f)
            {
                float d = BattleView.CubicBezier(0, 0, 0.58f, 1, t / 0.7f);
                float ds = d < 0.25f ? Mathf.Lerp(1, 1.55f, d / 0.25f) : Mathf.Lerp(1.55f, 1, (d - 0.25f) / 0.75f);
                dot.localScale = dotScale * ds;
                if (ring != null) ring.localScale = ringScale * ds;
                phaseGlows[i].transform.localScale = glowScale * ds;
            }
            else if (dot != null)
            {
                dot.localScale = dotScale;
                if (ring != null) ring.localScale = ringScale;
                phaseGlows[i].transform.localScale = glowScale;
            }
            if (t >= 1.1f) break;
            yield return null;
        }
        if (glow != null) glow.sharedMaterial.color = Color.clear;
    }

    /// <summary>The white ring round a phase's dot (its box-shadow 0 0 0 1.5px #fff, pulsing with it).</summary>
    Transform DotRing(int i)
    {
        var at = phaseDots[i].transform.localPosition;
        foreach (Transform c in phaseDots[i].transform.parent)
            if (c.name == "Dot ring" && Mathf.Abs(c.localPosition.z - at.z) < 1e-4f && Mathf.Abs(c.localPosition.x - at.x) < 1e-4f) return c;
        return null;
    }

    /// <summary>radial-gradient(closest-side, --pc 0%, --pc at 45% of its alpha 45%, transparent 100%), white for tinting.</summary>
    static Texture2D PhaseGlowTexture()
    {
        if (phaseGlowTex != null) return phaseGlowTex;
        const int n = 64;
        phaseGlowTex = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
        var px = new Color32[n * n];
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float u = (x + 0.5f) / n * 2 - 1, v = (y + 0.5f) / n * 2 - 1;
                float d = Mathf.Sqrt(u * u + v * v);
                float a = d <= 0.45f ? Mathf.Lerp(1, 0.45f, d / 0.45f) : d <= 1 ? Mathf.Lerp(0.45f, 0, (d - 0.45f) / 0.55f) : 0;
                px[y * n + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(a * 255));
            }
        phaseGlowTex.SetPixels32(px);
        phaseGlowTex.Apply();
        return phaseGlowTex;
    }
}
