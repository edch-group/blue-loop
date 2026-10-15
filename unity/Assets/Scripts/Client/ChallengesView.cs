using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using K = MenuKit;

/// <summary>
/// The challenges (puzzles.ts challengesPage): a row of tiles for each tier (the dream tiers from the third, shown
/// from tier I), each its race's emblem, its number and its goal; the one picked waits at the foot to begin.
/// </summary>
public class ChallengesView : MonoBehaviour, MenuView.IRedraw
{
    static readonly string[] Roman = { "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII" };
    RectTransform root;
    MenuView menu;
    string picked;

    public static ChallengesView Make(RectTransform parent, MenuView menu)
    {
        var r = Hud.Rect(parent, "Challenges");
        Hud.Fill(r);
        var v = r.gameObject.AddComponent<ChallengesView>();
        v.root = r;
        v.menu = menu;
        v.Draw();
        return v;
    }

    static string Goal(Game.DreamSpec c) => c.Goal == "win" ? ((c.Days ?? 1) > 1 ? $"win in {c.Days}" : "win") : "survive";

    public void Redraw() => Draw();

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var solved = Puzzles.ChallengesSolved;
        var all = Puzzles.Challenges;
        var box = TutorialView.Frame(root, menu, "dreams of the lost", "challenges");

        // The tiers (.ch-tiers: between head and foot, clamp(10px, 3vh, 24px) apart, centred in their room, scrolling
        // when they run over it): each its name (9.6, spaced 0.3em; 8 above its tiles) over its tiles (.ch-tile:
        // clamp(64px, 14vh, 92px) across, 10 apart, as many to a line as fit, each line centred; padded 10 6 8, corners
        // 14: its race's emblem (30 across), its number (14.4) and its goal (8, spaced 0.2em), 2 apart).
        float nameH = K.LineH(9.6f), numH = K.LineH(14.4f), goalH = K.LineH(8);
        float tw = K.Clamp(64, 14 * K.Vh, 92), th = 10 + 30 + 2 + numH + 2 + goalH + 8, gap = 10, tierGap = K.Clamp(10, 3 * K.Vh, 24);
        int perLine = Mathf.Max(1, Mathf.FloorToInt((box.width + gap) / (tw + gap)));
        var tiers = all.Select(c => c.Tier).Distinct().ToList();
        float total = 0;
        foreach (var tier in tiers)
        {
            int n = all.Count(c => c.Tier == tier), lines = (n + perLine - 1) / perLine;
            total += nameH + 8 + lines * th + (lines - 1) * gap;
        }
        total += (tiers.Count - 1) * tierGap;
        // (Centred as the web's grid centres them (align-content: center) even when they run over their room: what
        // runs over above is cut off, out of reach, and only what runs over below scrolls into view. Clipped at the
        // box's edges, the shadows too.)
        float off = (box.height - total) / 2;
        var content = K.Scroller(root, "Tiers", box.x, box.y, box.width, box.height, total + Mathf.Min(0, off));
        float y = off;
        for (int t = 0; t < tiers.Count; t++)
        {
            var tier = tiers[t];
            var row = all.Where(c => c.Tier == tier).ToList();
            int days = row[0].Days ?? 1;
            K.Words(content, $"TIER {Roman[Mathf.Clamp(tier - Puzzles.ChallengeFromTier + 1, 0, Roman.Length - 1)]}{(days > 1 ? $" · WIN IN {days}" : "")}", -0.15f * 9.6f, y, box.width, nameH, 9.6f, Look.InkFaint, true, 400, 0.3f);
            y += nameH + 8;
            for (int start = 0; start < row.Count; start += perLine)
            {
                var line = row.Skip(start).Take(perLine).ToList();
                float x = (box.width - (line.Count * tw + (line.Count - 1) * gap)) / 2;
                for (int i = 0; i < line.Count; i++)
                {
                    var c = line[i];
                    int n = all.IndexOf(c) + 1;
                    bool on = picked == c.Id, isSolved = solved.Contains(c.Id);
                    var tile = Hud.Box(content, c.Id, isSolved ? Hud.Rgba(255, 247, 230) : Color.white, 14);
                    var tr = tile.rectTransform;
                    Hud.Place(tr, x + i * (tw + gap), y - (on ? 3 : 0), tw, th);
                    var ring = on ? new Hud.Drop(Hud.Rgba(58, 66, 86), 0, 0, 2.5f)
                        : isSolved ? new Hud.Drop(Hud.Rgba(200, 160, 70, 0.5f), 0, 0, 1)
                        : new Hud.Drop(Hud.Rgba(58, 66, 86, 0.12f), 0, 0, 1);
                    Hud.Shadow(tile, 14, ring, on ? new Hud.Drop(Hud.Rgba(40, 46, 70, 0.2f), 8, 18) : new Hud.Drop(Hud.Rgba(40, 46, 70, 0.08f), 4, 12));
                    tile.raycastTarget = true;
                    var em = Hud.Rect(tr, "Emblem");
                    Hud.Place(em, (tw - 30) / 2, 10, 30, 30);
                    var raw = em.gameObject.AddComponent<RawImage>();
                    raw.texture = Resources.Load<Texture2D>($"Icons/faction-f{c.Race + 1}");
                    raw.raycastTarget = false;
                    K.Words(tr, n.ToString(), 0, 42, tw, numH, 14.4f, Look.Ink, true, 400);
                    K.Words(tr, Goal(c).ToUpperInvariant(), -0.1f * 8, 42 + numH + 2, tw, goalH, 8, Look.InkFaint, true, 400, 0.2f);
                    if (isSolved) K.Words(tr, "✓", tw - 7 - 12, 4, 12, 14, 11.2f, Hud.Rgba(185, 138, 44), false, 600);
                    var id = c.Id;
                    var tb = tile.gameObject.AddComponent<Button>();
                    var cb = tb.colors;
                    cb.highlightedColor = new Color(0.98f, 0.98f, 1f);
                    tb.colors = cb;
                    tb.onClick.AddListener(() => { Sound.Play("hover"); picked = picked == id ? null : id; Draw(); });
                }
                y += th + (start + perLine < row.Count ? gap : 0);
            }
            if (t + 1 < tiers.Count) y += tierGap;
        }

        // The one picked, waiting to begin (as the tutorial's: what, which, and begin beside them); or how many are
        // solved.
        var pick = picked != null ? Puzzles.ChallengeById(picked) : null;
        if (pick != null)
        {
            string goal = pick.Goal == "win" ? ((pick.Days ?? 1) > 1 ? $"win within {pick.Days} days" : "win this day") : "survive their day";
            var id = pick.Id;
            TutorialView.Foot(root, $"as the {Races.RaceNames[pick.Race].ToLowerInvariant()} · {Puzzles.TimeLimit(pick)} s", $"challenge {all.IndexOf(pick) + 1}", goal, solved.Contains(pick.Id) ? "again" : "begin", () => App.Instance.Puzzle("challenge", id), null);
        }
        else TutorialView.Foot(root, null, null, null, null, null, $"{solved.Count} of {all.Count} solved");
    }
}
