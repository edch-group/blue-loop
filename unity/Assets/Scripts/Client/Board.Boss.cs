using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;

/// <summary>
/// A Lost Overlord has no sun (app.ts bossVitals, styles.css .boss-vitals): in its place, flat on the board where a
/// sun's .vitals stands (vs × 0.08 in from the row, on its middle), a dark rounded box: what must be beaten down
/// (the Overlord's own stability, or the crystal's), its bar, its shields and the days left; or, a challenge with no
/// leader (the mine, the Frost Line), its count in place of a sun.
/// </summary>
public partial class Board
{
    readonly Dictionary<string, (GameObject go, string key)> bossPanels = new Dictionary<string, (GameObject, string)>();

    /// <summary>The box in place of a boss's sun (its collider, for where it is on the page).</summary>
    public Collider BossPanel(string playerId) => bossPanels.TryGetValue(playerId, out var b) && b.go != null ? b.go.GetComponent<Collider>() : null;

    void BossVitals(GameState s, PlayerState p, bool mine, BattleView ui)
    {
        var l = L;
        var ch = s.Challenge;
        var leader = p.Tableau.FirstOrDefault(c => c.Uid == p.Boss?.Leader);
        string label, hp;
        float? pct = null;
        var lines = new List<string>();
        // Its own action's recharge (.boss-vitals-charge): a pip filled for each of its days, all three when it is
        // ready; as the board shows it (BattleView.BossShown: as it was while its blow plays out).
        int chargeLeft = -1;
        if (p.Boss?.Leader == null && ch != null)
        {
            bool mineCh = ch.Kind == "mine";
            label = mineCh ? "crystals broken" : "days to hold";
            hp = (mineCh ? ch.Broken : ch.Days ?? 0).ToString();
            if (mineCh) lines.Add($"{ch.Days ?? 0} day{(ch.Days == 1 ? "" : "s")} left");
        }
        else
        {
            int hpNow = leader?.Health ?? 0, max = leader?.MaxHealth ?? (leader != null ? Game.BaseHealth(leader.DefId) : 1);
            pct = Mathf.Clamp01(hpNow / (float)Mathf.Max(1, max));
            label = ch?.Kind == "crystal" ? "break the crystal" : "destroy the overlord";
            // (.boss-vitals-hp small: half its size, at 0.7.)
            hp = $"{hpNow}<size=50%><alpha=#B3>/{max}</size>";
            var lord = BossShown(s, p, ui)?.p ?? p;
            var own = Game.BossOrder(lord).FirstOrDefault(c => Cards.Def(c.DefId).OverlordPart == "overlord");
            if (own != null) chargeLeft = Game.Charging(lord, own) ? lord.Boss?.Charge ?? 0 : 0;
            if (p.Shields > 0) lines.Add($"⛨ {p.Shields}");
            if (ch?.Kind == "crystal" && ch.Days != null) lines.Add($"{ch.Days} day{(ch.Days == 1 ? "" : "s")} left");
        }
        string key = $"{l.Tcw}|{l.Vs}|{mine}|{label}|{hp}|{pct}|{chargeLeft}|{string.Join("|", lines)}";
        if (bossPanels.TryGetValue(p.Id, out var had) && had.go != null && had.key == key) return;
        if (had.go != null) Mats.Kill(had.go);

        var go = new GameObject("Boss vitals");
        go.transform.SetParent(table, false);
        bossPanels[p.Id] = (go, key);
        // (Its contents, top down, 4 px apart, inside 10 px by 14 px of padding.)
        const float labelPx = 9.92f, hpPx = 25.6f, linePx = 12, gap = 4, padY = 10, padX = 14;
        var texts = new List<(TextMeshPro t, float h)>();
        var lab = Mats.FlatText("Label", go.transform, label.ToUpperInvariant(), Px(labelPx), Rgba(0xff, 0xb0, 0x70), true, 400, 22);
        texts.Add((lab, labelPx * 1.25f));
        var big = Mats.FlatText("Count", go.transform, hp, Px(hpPx), Rgba(0xf6, 0xec, 0xe6), true, 500, 0);
        texts.Add((big, hpPx));
        var more = lines.Select(x => Mats.FlatText("Line", go.transform, x, Px(linePx), Rgba(0xbf, 0xe6, 0xff), false, 400, 0)).ToList();
        // (.boss-vitals-charge: three 7 px pips 3 px apart, then 6 px on, "charging · 2" or "ready" in the display face,
        // amber when ready, pale while charging.)
        const float pip = 7, pipGap = 3, chargeGap = 6;
        int pips = Game.BossRecharge + 1;
        float pipsW = pips * pip + (pips - 1) * pipGap;
        TextMeshPro chargeText = chargeLeft < 0 ? null : Mats.FlatText("Charge", go.transform, (chargeLeft > 0 ? $"charging · {chargeLeft}" : "ready").ToUpperInvariant(), Px(labelPx), chargeLeft > 0 ? Rgba(246, 236, 230, 0.6f) : Rgba(0xff, 0xb0, 0x70), true, 400, 14, TextAlignmentOptions.Left);
        float chargeTextW = chargeText != null ? chargeText.GetPreferredValues(chargeText.text).x * l.Tcw : 0;
        float chargeW = chargeText != null ? pipsW + chargeGap + chargeTextW : 0;
        float inner = chargeW;
        foreach (var t in texts.Select(x => x.t).Concat(more)) inner = Mathf.Max(inner, t.GetPreferredValues(t.text).x * l.Tcw);
        float w = Mathf.Max(110, inner + 2 * padX);
        float barW = w - 2 * padX, barH = 6;
        float chargeH = labelPx * 1.25f;
        float h = padY * 2 + labelPx * 1.25f + gap + hpPx + (pct != null ? gap + barH : 0) + (chargeText != null ? gap + chargeH : 0) + more.Count * (gap + linePx * 1.25f);
        // (Where a sun's .vitals stands: its left edge vs × 0.08 in from the row's, on the row's middle.)
        float cx = l.WrapLeft + 0.08f * l.Vs + w / 2, cy = mine ? l.MyRowCy : l.RivalRowCy;
        go.transform.localPosition = l.At(cx, cy);
        float W = l.U(w), H = l.U(h);
        // box-shadow: 0 0 0 1px rgba(255,176,112,.4), 0 8px 24px rgba(40,10,10,.3); on rgba(20,8,10,.88), corners 16.
        var shadow = Shape("Shadow", go.transform, Rgba(40, 10, 10, 0.3f), W, H, l.U(16), 2958, 0.001f, l.U(12), l.U(24));
        shadow.transform.localPosition += new Vector3(0, 0, -l.U(8));
        Shape("Box", go.transform, Rgba(20, 8, 10, 0.88f), W, H, l.U(16), 2960, 0.002f);
        Shape("Edge", go.transform, Rgba(255, 176, 112, 0.4f), W + l.U(1), H + l.U(1), l.U(16.5f), 2961, 0.0025f, l.U(0.5f), l.U(2), true);
        float y = padY;
        void Row(TextMeshPro t, float rowH)
        {
            t.rectTransform.sizeDelta = new Vector2(W, l.U(rowH));
            t.transform.localPosition = new Vector3(0, 0.01f, l.U(h / 2 - y - rowH / 2));
            y += rowH + gap;
        }
        Row(lab, labelPx * 1.25f);
        big.lineSpacing = 0;
        Row(big, hpPx);
        if (pct != null)
        {
            // (.boss-vitals-bar: a faint track, 3 px corners, its fill from #ff6a3a to #ffb070, cut square where it ends.)
            int tw = Mathf.Max(8, Mathf.RoundToInt(barW * 4)), th = 24;
            var tex = new Texture2D(tw, th, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[tw * th];
            var a = Rgba(0xff, 0x6a, 0x3a);
            var b = Rgba(0xff, 0xb0, 0x70);
            for (int x = 0; x < tw; x++)
            {
                float u = (x + 0.5f) / tw;
                Color c = u <= pct.Value ? Color.Lerp(a, b, pct.Value > 0 ? u / pct.Value : 0) : new Color(1, 1, 1, 0.15f);
                for (int yy = 0; yy < th; yy++) px[yy * tw + x] = c;
            }
            tex.SetPixels32(px);
            tex.Apply();
            var bar = Picture("Bar", go.transform, tex, Color.white, l.U(barW), l.U(barH), 2962, 0.004f);
            bar.sharedMaterial.SetFloat("_Radius", 3f / barW);
            bar.transform.localPosition = new Vector3(0, 0.004f, l.U(h / 2 - y - barH / 2));
            y += barH + gap;
        }
        if (chargeText != null)
        {
            // The pips, then the words, the row centred.
            float x0 = -chargeW / 2, zc = l.U(h / 2 - y - chargeH / 2);
            int filled = pips - chargeLeft;
            for (int i = 0; i < pips; i++)
            {
                bool on = i < filled;
                var dot = Shape("Pip", go.transform, on ? Rgba(0xff, 0x8d, 0x55) : new Color(1, 1, 1, 0.15f), l.U(pip), l.U(pip), l.U(pip / 2), 2962, 0.004f);
                dot.transform.localPosition = new Vector3(l.U(x0 + i * (pip + pipGap) + pip / 2), 0.004f, zc);
                if (!on)
                {
                    var ring = Shape("Pip edge", go.transform, Rgba(255, 176, 112, 0.45f), l.U(pip), l.U(pip), l.U(pip / 2), 2963, 0.0045f, l.U(0.5f), l.U(1), true);
                    ring.transform.localPosition = dot.transform.localPosition + new Vector3(0, 0.0005f, 0);
                }
            }
            chargeText.rectTransform.sizeDelta = new Vector2(l.U(chargeTextW + 2), l.U(chargeH));
            chargeText.transform.localPosition = new Vector3(l.U(x0 + pipsW + chargeGap + chargeTextW / 2), 0.01f, zc);
            y += chargeH + gap;
        }
        foreach (var t in more) Row(t, linePx * 1.25f);
        // (For where it is on the page: as a sun's collider is.)
        var col = go.AddComponent<BoxCollider>();
        col.size = new Vector3(W, 0.02f, H);
    }

    /// <summary>A boss's place cleared of a sun (made before it was known to be one).</summary>
    void NoSun(string playerId)
    {
        if (suns.TryGetValue(playerId, out var sun) && sun != null) Mats.Kill(sun.gameObject);
        suns.Remove(playerId);
    }
}
