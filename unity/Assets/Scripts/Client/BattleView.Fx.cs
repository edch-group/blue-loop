using System.Collections;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// A move's arcs, as app.ts animate draws them: a card played (or a Hero's ability) that takes or hurts a rival card
/// without heat reaches it with a white arc (fx.ts tether: drawn out over 0.42 s, held 0.52 s, faded over 0.26 s);
/// heat aimed at a card flies to it; a Hero's ability on its own side sends a beam of light to each card it changes
/// (fx.ts beam). Each a little after the last.
/// </summary>
public partial class BattleView
{
    void Arcs(GameState prev, GameState next, EngineAction a, PlayerState actor)
    {
        if (!Application.isPlaying || hud == null) return;
        bool heroMove = a.Type == "heroAbility" || a.Type == "singularity";
        if (a.Type != "playCard" && !heroMove) return;
        var hero = heroMove ? Game.CommandCard(actor) : null;
        // Where the move comes from: the card played (where it is now), the Hero, or the actor's sun.
        var fromUid = a.Type == "playCard" ? a.CardUid : hero?.Uid;
        Rect? from = fromUid != null ? CardRect(fromUid) : null;
        if (from == null) from = SunRect(actor.Id);
        if (from == null) return;
        var playedId = a.Type == "playCard" ? actor.Hand.FirstOrDefault(c => c.Uid == a.CardUid)?.DefId : null;
        var effects = playedId != null ? Cards.Def(playedId).OnPlay ?? new System.Collections.Generic.List<Effect>() : new System.Collections.Generic.List<Effect>();
        bool heats = effects.Any(e => e.Type == "heat") || heroMove;
        string shotAim = a.AimUid;
        var was = prev.Players.Where(p => p.Id != actor.Id).SelectMany(p => p.Tableau).ToDictionary(c => c.Uid);
        var now = next.Players.Where(p => p.Id != actor.Id).SelectMany(p => p.Tableau).ToDictionary(c => c.Uid);
        var hit = was.Where(kv => !now.ContainsKey(kv.Key) || (now[kv.Key].Health ?? 0) < (kv.Value.Health ?? 0) || (now[kv.Key].Dented ?? 0) > (kv.Value.Dented ?? 0)).Select(kv => kv.Key).ToList();
        for (int i = 0; i < hit.Count; i++)
        {
            var uid = hit[i];
            var to = CardRect(uid);
            if (to == null) continue;
            float delay = (actor.IsAI ? 0.6f : 0.47f) + i * 0.14f;
            now.TryGetValue(uid, out var nowC);
            bool byHeat = heats && uid != a.EnemyUid && (uid == shotAim || (nowC?.Dented ?? 0) > (was[uid].Dented ?? 0) || (heroMove && nowC != null && (nowC.Health ?? 0) < (was[uid].Health ?? 0)));
            if (byHeat)
            {
                var target = Board.WorldOf(uid);
                var origin = fromUid != null ? Board.WorldOf(fromUid) : null;
                if (target != null) Shot.Fire(Board.transform, origin ?? Board.SunOf(actor.Id)?.transform.position ?? target.Value, target.Value, null, true, delay);
                continue;
            }
            StartCoroutine(Arc(from.Value, to.Value, Beam.Kind.Plain, 0.36f, delay, 0.42f, 0.52f, 0.26f));
        }
        // A Hero's ability on its own side: a beam of light from the Hero to each card it changes.
        if (heroMove && hero != null)
        {
            var mineWas = prev.Players.First(p => p.Id == actor.Id).Tableau.ToDictionary(c => c.Uid);
            int k = 0;
            foreach (var c in next.Players.First(p => p.Id == actor.Id).Tableau)
            {
                if (c.Uid == hero.Uid || !mineWas.TryGetValue(c.Uid, out var w)) continue;
                if ((c.Health ?? 0) == (w.Health ?? 0) && (c.Shields ?? 0) == (w.Shields ?? 0) && (c.Growth ?? 0) == (w.Growth ?? 0) && c.Frozen == w.Frozen) continue;
                var to = CardRect(c.Uid);
                if (to == null) continue;
                StartCoroutine(Arc(from.Value, to.Value, Beam.Kind.Plain, 0.12f, (actor.IsAI ? 0.6f : 0.42f) + k++ * 0.14f, 0.38f, 0.38f * 0.6f, 0.22f));
            }
        }
    }

    /// <summary>A sun's rectangle on the page (its gauge as drawn).</summary>
    Rect? SunRect(string playerId)
    {
        var s = Board.SunOf(playerId);
        var col = s != null ? s.GetComponentInChildren<Collider>() : null;
        return col != null ? PageRect(col) : (Rect?)null;
    }

    /// <summary>An arc drawn out from one rectangle to another (eased out), held, then faded away.</summary>
    IEnumerator Arc(Rect from, Rect to, Beam.Kind kind, float bow, float delay, float draw, float hold, float fade)
    {
        yield return new WaitForSeconds(delay);
        var b = Beam.Make(beamLayer, kind, bow);
        var group = b.gameObject.AddComponent<CanvasGroup>();
        group.blocksRaycasts = false;
        float t0 = Time.time;
        while (true)
        {
            float k = Mathf.Min(1, (Time.time - t0) / draw);
            b.Draw(from, to, 1 - Mathf.Pow(1 - k, 3));
            if (k >= 1) break;
            yield return null;
        }
        yield return new WaitForSeconds(hold);
        t0 = Time.time;
        while (Time.time - t0 < fade)
        {
            group.alpha = 1 - (Time.time - t0) / fade;
            yield return null;
        }
        Destroy(b.gameObject);
    }
}
