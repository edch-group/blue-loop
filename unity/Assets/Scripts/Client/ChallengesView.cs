using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The challenges (puzzles.ts challengesPage): a row of tiles for each tier (the dream tiers from the third, shown
/// from tier I), each its race's emblem, its number and its goal; the one picked waits at the foot to begin.
/// </summary>
public class ChallengesView : MonoBehaviour
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

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var solved = Puzzles.ChallengesSolved;
        var all = Puzzles.Challenges;
        MenuView.BackButton(root, () => menu.Show("hub"), 23.2f, 20.3f);
        Hud.Text(root, "DREAMS OF THE LOST", 0, 20.3f, 1600, 17, 13.9f, Look.InkFaint, true, 400, 30);
        Hud.Text(root, "CHALLENGES", 0, 40.2f, 1600, 58, 46.4f, Look.Ink, true, 400, 40);

        // The tiers (the web's .ch-tiers: 768.4 tall from 109.8 down, centred in it and scrolling): each its name
        // (13.9, spaced 0.3em) over its tiles, 133.4 by 116.4, 14.5 apart, ten to a line, each line centred.
        var view = Hud.Rect(root, "Tiers");
        Hud.Place(view, 0, 109.8f, 1600, 768.4f);
        view.gameObject.AddComponent<RectMask2D>();
        var content = Hud.Rect(view, "Content");
        content.anchorMin = new Vector2(0, 1);
        content.anchorMax = new Vector2(1, 1);
        content.pivot = new Vector2(0.5f, 1);
        const float tw = 133.4f, th = 116.4f, gap = 14.5f;
        // (A little room above and below, so the picked tile's lift and the shadows aren't cut.)
        float y = 12;
        var tiers = all.Select(c => c.Tier).Distinct().ToList();
        for (int t = 0; t < tiers.Count; t++)
        {
            var tier = tiers[t];
            var row = all.Where(c => c.Tier == tier).ToList();
            int days = row[0].Days ?? 1;
            Hud.Text(content, $"TIER {Roman[Mathf.Clamp(tier - Puzzles.ChallengeFromTier + 1, 0, Roman.Length - 1)]}{(days > 1 ? $" · WIN IN {days}" : "")}", 0, y, 1600, 17, 13.9f, Look.InkFaint, true, 400, 30);
            y += 28.6f;
            for (int start = 0; start < row.Count; start += 10)
            {
                var line = row.Skip(start).Take(10).ToList();
                float x = 800 - (line.Count * tw + (line.Count - 1) * gap) / 2;
                for (int i = 0; i < line.Count; i++)
                {
                    var c = line[i];
                    int n = all.IndexOf(c) + 1;
                    bool on = picked == c.Id, isSolved = solved.Contains(c.Id);
                    var tile = Hud.Box(content, c.Id, isSolved ? Hud.Rgba(255, 247, 230) : Color.white, 20.3f);
                    var tr = (RectTransform)tile.transform;
                    Hud.Place(tr, x + i * (tw + gap), y - (on ? 4.35f : 0), tw, th);
                    var ring = on ? new Hud.Drop(Hud.Rgba(58, 66, 86), 0, 0, 3.6f)
                        : isSolved ? new Hud.Drop(Hud.Rgba(200, 160, 70, 0.5f), 0, 0, 1.4f)
                        : new Hud.Drop(Hud.Rgba(58, 66, 86, 0.12f), 0, 0, 1.4f);
                    Hud.Shadow(tile, 20.3f, ring, on ? new Hud.Drop(Hud.Rgba(40, 46, 70, 0.2f), 11.6f, 26.1f) : new Hud.Drop(Hud.Rgba(40, 46, 70, 0.08f), 5.8f, 17.4f));
                    tile.raycastTarget = true;
                    var em = Hud.Rect(tr, "Emblem");
                    Hud.Place(em, (tw - 43.5f) / 2, 14.5f, 43.5f, 43.5f);
                    var raw = em.gameObject.AddComponent<RawImage>();
                    raw.texture = Resources.Load<Texture2D>($"Icons/faction-f{c.Race + 1}");
                    raw.raycastTarget = false;
                    Hud.Text(tr, n.ToString(), 0, 60.9f, tw, 26, 20.9f, Look.Ink, true, 400, 0);
                    Hud.Text(tr, Goal(c).ToUpperInvariant(), 0, 89.8f, tw, 15, 11.6f, Look.InkFaint, true, 400, 20);
                    if (isSolved) Hud.Text(tr, "✓", tw - 10.15f - 16, 7.25f, 16, 20, 16.2f, Hud.Rgba(185, 138, 44), false, 600, 0);
                    var id = c.Id;
                    var tb = tile.gameObject.AddComponent<Button>();
                    var cb = tb.colors;
                    cb.highlightedColor = new Color(0.98f, 0.98f, 1f);
                    tb.colors = cb;
                    tb.onClick.AddListener(() => { Sound.Play("hover"); picked = picked == id ? null : id; Draw(); });
                }
                y += th + (start + 10 < row.Count ? gap : 0);
            }
            y += t + 1 < tiers.Count ? 30 : 12;
        }
        content.anchoredPosition = Vector2.zero;
        content.sizeDelta = new Vector2(0, y);
        var hit = content.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0.001f);
        var scroll = view.gameObject.AddComponent<ScrollRect>();
        scroll.viewport = view;
        scroll.content = content;
        scroll.horizontal = false;
        scroll.movementType = ScrollRect.MovementType.Clamped;
        scroll.scrollSensitivity = 40;
        // (As the web centres the tiers in their space: begun at their middle when they run over it.)
        if (y > 768.4f) content.anchoredPosition = new Vector2(0, (y - 768.4f) / 2);
        else
        {
            content.sizeDelta = new Vector2(0, 768.4f);
            foreach (RectTransform child in content) child.anchoredPosition -= new Vector2(0, (768.4f - y) / 2);
        }

        // The one picked, waiting to begin (as the tutorial's: what, which, and begin beside them); or how many are
        // solved.
        var pick = picked != null ? Puzzles.ChallengeById(picked) : null;
        if (pick != null)
        {
            string small = $"AS THE {Races.RaceNames[pick.Race].ToUpperInvariant()} · {Puzzles.TimeLimit(pick)} S", name = $"CHALLENGE {all.IndexOf(pick) + 1}";
            string goal = pick.Goal == "win" ? ((pick.Days ?? 1) > 1 ? $"win within {pick.Days} days" : "win this day") : "survive their day";
            string go = solved.Contains(pick.Id) ? "again" : "begin";
            float colW = Mathf.Max(Hud.Wide(small, 12.1f, 400, 24, 0), Hud.Wide(name, 23.2f, 400, 24, 0), Hud.Wide(goal, 18.1f, 400, 0, 0, false));
            float bw = Hud.Wide(go.ToUpperInvariant(), 15.3f, 700, 14, 24.6f), x = 800 - (colW + 26.1f + bw) / 2;
            Hud.Text(root, small, x, 900.3f, colW + 2, 15, 12.1f, Look.InkFaint, true, 400, 24, TextAlignmentOptions.Left);
            Hud.Text(root, name, x, 918.2f, colW + 2, 29, 23.2f, Look.Ink, true, 400, 24, TextAlignmentOptions.Left);
            Hud.Text(root, goal, x, 950.1f, colW + 2, 22, 18.1f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
            var id = pick.Id;
            var begin = Hud.Primary(root, go, () => App.Instance.Puzzle("challenge", id));
            Hud.Place((RectTransform)begin.transform, x + colW + 26.1f, 912.7f, bw, 47.1f);
        }
        else Hud.Text(root, $"{solved.Count} OF {all.Count} SOLVED", 0, 927.2f, 1600, 18, 14.4f, Look.InkFaint, true, 400, 24);
    }
}
