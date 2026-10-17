using System.Collections;
using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// A repair landing on a slot (app.ts cranks, fx.ts crank): over each slot it mended, a spanner on a white disc comes
/// in, cranks back and forth three turns of the wrist about its head (the bolt), bobbing a little with each stroke,
/// then settles and fades; the repair sound ticks with each stroke, and the slot's wear stays shown until the crank
/// has turned it out. Several slots mended at once crank a little apart. The spanner and its disc are the web's,
/// baked (scripts/bake-crank.mjs: Resources/Icons/crank).
/// </summary>
public partial class BattleView
{
    // (fx.ts CRANK_MS, CRANK_TICKS, CRANK_MENDED, CRANK_STAGGER_MS and CRANK_KEYS, in seconds.)
    const float CrankTime = 1.1f, CrankMended = 0.8f, CrankStagger = 0.14f;
    static readonly float[] CrankTicks = { 0.27f, 0.51f, 0.75f };
    static readonly (float at, float turn, float bob, float scale, float alpha)[] CrankKeys =
    {
        (0, -20, 0, 0.6f, 0), (0.14f, -20, 0, 1, 1), (0.27f, 35, 0.08f, 1, 1), (0.39f, -25, 0, 1, 1), (0.51f, 35, 0.08f, 1, 1),
        (0.63f, -25, 0, 1, 1), (0.75f, 35, 0.08f, 1, 1), (0.86f, 0, 0, 1, 1), (1, 0, 0.1f, 1.15f, 0),
    };

    /// <summary>One slot mended: whose, which (a worn card's, `Uid`, or an empty one's), by how much, and when (seconds from now).</summary>
    struct Mend
    {
        public string Pid, Uid;
        public int Slot, By;
        public float At;
    }

    /// <summary>
    /// app.ts repairsIn: what a move repaired (not a day's turn, whose repairs are its pulses): each worn card still in
    /// its slot that wears less now, and each empty slot whose wear went down, in slot order.
    /// </summary>
    static List<Mend> RepairsIn(GameState prev, GameState next)
    {
        var o = new List<Mend>();
        foreach (var p in next.Players)
        {
            var was = prev.Players.FirstOrDefault(x => x.Id == p.Id);
            if (was == null) continue;
            for (int slot = Game.CommandSlot; slot < Balance.TableauSlots; slot = slot == Game.CommandSlot ? 0 : slot + 1)
            {
                var c = p.Tableau.FirstOrDefault(x => x.Slot == slot);
                var pc = was.Tableau.FirstOrDefault(x => x.Slot == slot);
                int Wear(PlayerState x) => x.SlotWear != null && x.SlotWear.TryGetValue(slot, out var w) ? w : 0;
                if (c != null && pc != null && c.Uid == pc.Uid && (pc.Dented ?? 0) > (c.Dented ?? 0))
                    o.Add(new Mend { Pid = p.Id, Slot = slot, Uid = c.Uid, By = (pc.Dented ?? 0) - (c.Dented ?? 0) });
                else if (c == null && pc == null && Wear(was) > Wear(p))
                    o.Add(new Mend { Pid = p.Id, Slot = slot, By = Wear(was) - Wear(p) });
            }
        }
        return o;
    }

    /// <summary>
    /// app.ts cranks: the cranks of these repairs, with their ticks, and each slot's wear held until its crank has
    /// turned it out (a card's numbers as they were in `prev`; an empty slot's wear, from `next`, climbing back by each
    /// repair as its crank finishes).
    /// </summary>
    void Cranks(List<Mend> mends, GameState prev, GameState next)
    {
        if (mends.Count == 0 || hud == null || !Application.isPlaying) return;
        foreach (var m in mends)
        {
            var e = m;
            StartCoroutine(Crank(e));
            foreach (var k in CrankTicks) Sound.Play("repair", e.At + CrankTime * k);
        }
        var board = Board;
        if (board == null) return;
        foreach (var g in mends.GroupBy(m => (m.Pid, m.Slot)))
        {
            var list = g.OrderBy(m => m.At).ToList();
            float last = list.Max(m => m.At + CrankTime * CrankMended);
            var uid = list[0].Uid;
            var p = next.Players.FirstOrDefault(x => x.Id == g.Key.Pid);
            if (uid != null && p != null && p.Tableau.Any(c => c.Uid == uid)) { board.HoldCard(uid, prev, last); continue; }
            if (p == null || g.Key.Slot < 0) continue;
            int wear = (p.SlotWear != null && p.SlotWear.TryGetValue(g.Key.Slot, out var w) ? w : 0) + list.Sum(m => m.By);
            var steps = new List<(float, int)>();
            foreach (var m in list)
            {
                steps.Add((m.At + CrankTime * CrankMended, wear));
                wear -= m.By;
            }
            board.HoldSlot(g.Key.Pid, g.Key.Slot, steps);
        }
    }

    /// <summary>fx.ts crank: one slot's crank, `m.At` from now, over the card standing there (if it still does), else the slot.</summary>
    IEnumerator Crank(Mend m)
    {
        if (m.At > 0) yield return new WaitForSeconds(m.At);
        if (hud == null || Board == null) yield break;
        Rect? at = m.Uid != null ? CardRect(m.Uid) : null;
        if (at == null)
        {
            var col = Board.SlotCollider(m.Pid, m.Slot);
            if (col != null) at = PageRect(col);
        }
        if (at == null) yield break;
        var rect = at.Value;
        // (The disc about half the slot across, within reason, in its upper part: the slot's number shows under it.)
        float size = Mathf.Clamp(rect.width * 0.56f, 28, 72);
        var r = Hud.Own(Hud.Rect(hud.transform, "Crank"), 27);
        r.anchorMin = r.anchorMax = new Vector2(0, 1);
        r.pivot = new Vector2(0.5f, 0.5f);
        var home = new Vector2(rect.center.x, -(rect.y + rect.height * 0.32f));
        r.anchoredPosition = home;
        r.sizeDelta = new Vector2(size, size);
        r.SetAsLastSibling();
        var group = r.gameObject.AddComponent<CanvasGroup>();
        group.blocksRaycasts = false;
        group.interactable = false;
        // (.crank-disc, with its ring and shadow: baked with 12% of its size round it.)
        var disc = Hud.Rect(r, "Disc");
        disc.anchorMin = disc.anchorMax = disc.pivot = new Vector2(0.5f, 0.5f);
        disc.sizeDelta = new Vector2(size * 1.24f, size * 1.24f);
        var di = disc.gameObject.AddComponent<RawImage>();
        di.texture = Resources.Load<Texture2D>("Icons/crank/disc");
        di.raycastTarget = false;
        // (The spanner, 60% of the disc, turning about its head: 69% across, 31% down.)
        var spanner = Hud.Rect(r, "Spanner");
        spanner.anchorMin = spanner.anchorMax = new Vector2(0.5f, 0.5f);
        spanner.pivot = new Vector2(0.69f, 1 - 0.31f);
        spanner.sizeDelta = new Vector2(size * 0.6f, size * 0.6f);
        spanner.anchoredPosition = new Vector2((0.69f - 0.5f) * size * 0.6f, (0.5f - 0.31f) * size * 0.6f);
        var si = spanner.gameObject.AddComponent<RawImage>();
        si.texture = Resources.Load<Texture2D>("Icons/crank/spanner");
        si.raycastTarget = false;
        float t0 = Time.time;
        while (r != null)
        {
            float k = (Time.time - t0) / CrankTime;
            if (k >= 1) break;
            int i = 1;
            while (i < CrankKeys.Length - 1 && CrankKeys[i].at < k) i++;
            var a = CrankKeys[i - 1];
            var b = CrankKeys[i];
            float e = CubicBezier(0.45f, 0, 0.4f, 1, Mathf.Clamp01((k - a.at) / Mathf.Max(0.0001f, b.at - a.at)));
            float turn = Mathf.Lerp(a.turn, b.turn, e), bob = Mathf.Lerp(a.bob, b.bob, e), scale = Mathf.Lerp(a.scale, b.scale, e);
            r.anchoredPosition = home + new Vector2(0, bob * size);
            r.localScale = Vector3.one * scale;
            group.alpha = Mathf.Lerp(a.alpha, b.alpha, e);
            // (CSS turns clockwise for a positive angle; the canvas, anticlockwise.)
            spanner.localRotation = Quaternion.Euler(0, 0, -turn);
            yield return null;
        }
        if (r != null) Destroy(r.gameObject);
    }
}
