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
        var back = Hud.Pill(root, "‹ Back", () => menu.Show("hub"), 15);
        Hud.At((RectTransform)back.transform, new Vector2(0, 1), new Vector2(24, -20), new Vector2(92, 40));
        var small = Hud.Label(root, "DREAMS OF THE LOST", 13, Look.InkFaint, true, 500, 30, TextAlignmentOptions.Top);
        small.margin = new Vector4(0, 22, 0, 0);
        var title = Hud.Label(root, "CHALLENGES", 50, Look.Ink, true, 400, 60, TextAlignmentOptions.Top);
        title.margin = new Vector4(0, 44, 0, 0);

        // The tiers, scrolling between the title and the foot.
        var view = Hud.Rect(root, "Tiers");
        view.anchorMin = new Vector2(0, 0);
        view.anchorMax = new Vector2(1, 1);
        view.offsetMin = new Vector2(0, 120);
        view.offsetMax = new Vector2(0, -112);
        view.gameObject.AddComponent<RectMask2D>();
        var content = Hud.Rect(view, "Content");
        content.anchorMin = new Vector2(0, 1);
        content.anchorMax = new Vector2(1, 1);
        content.pivot = new Vector2(0.5f, 1);
        float y = -8;
        const float tw = 134, th = 118, step = 147;
        foreach (var tier in all.Select(c => c.Tier).Distinct())
        {
            var row = all.Where(c => c.Tier == tier).ToList();
            int days = row[0].Days ?? 1;
            if (tier > all[0].Tier)
            {
                var h = Hud.Label(content, $"TIER {Roman[Mathf.Min(Roman.Length - 1, tier - Puzzles.ChallengeFromTier + 1)]}{(days > 1 ? $" · WIN IN {days}" : "")}", 14, Look.InkSoft, true, 500, 30, TextAlignmentOptions.Top);
                h.rectTransform.anchorMin = new Vector2(0, 1);
                h.rectTransform.anchorMax = new Vector2(1, 1);
                h.rectTransform.pivot = new Vector2(0.5f, 1);
                h.rectTransform.anchoredPosition = new Vector2(0, y - 8);
                h.rectTransform.sizeDelta = new Vector2(0, 30);
                y -= 44;
            }
            for (int start = 0; start < row.Count; start += 10)
            {
                var line = row.Skip(start).Take(10).ToList();
                for (int i = 0; i < line.Count; i++)
                {
                    var c = line[i];
                    int n = all.IndexOf(c) + 1;
                    bool on = picked == c.Id, isSolved = solved.Contains(c.Id);
                    var tile = Hud.Glass(content, c.Id, Color.white);
                    var tr = (RectTransform)tile.transform;
                    Hud.At(tr, new Vector2(0.5f, 1), new Vector2((i - (line.Count - 1) / 2f) * step, y), new Vector2(tw, th));
                    if (on)
                    {
                        var ring = Hud.Rect(tr, "Ring");
                        Hud.Fill(ring);
                        ring.offsetMin = new Vector2(-3, -3);
                        ring.offsetMax = new Vector2(3, 3);
                        ring.SetSiblingIndex(1);
                        var ri = ring.gameObject.AddComponent<Image>();
                        ri.sprite = Hud.Rounded;
                        ri.type = Image.Type.Sliced;
                        ri.color = Look.Ink;
                        var fill = Hud.Rect(tr, "Fill");
                        Hud.Fill(fill);
                        fill.SetSiblingIndex(2);
                        var fi = fill.gameObject.AddComponent<Image>();
                        fi.sprite = Hud.Rounded;
                        fi.type = Image.Type.Sliced;
                        fi.color = Color.white;
                    }
                    var em = Hud.Rect(tr, "Emblem");
                    Hud.At(em, new Vector2(0.5f, 1), new Vector2(0, -12), new Vector2(46, 46));
                    var raw = em.gameObject.AddComponent<RawImage>();
                    raw.texture = Resources.Load<Texture2D>($"Icons/faction-f{c.Race + 1}");
                    raw.raycastTarget = false;
                    var num = Hud.Label(tr, n.ToString(), 22, Look.Ink, true, 500, 0, TextAlignmentOptions.Top);
                    num.margin = new Vector4(0, 62, 0, 0);
                    var g = Hud.Label(tr, Goal(c).ToUpperInvariant(), 11, Look.InkFaint, true, 500, 26, TextAlignmentOptions.Bottom);
                    g.margin = new Vector4(0, 0, 0, 12);
                    if (isSolved)
                    {
                        var check = Hud.Label(tr, "✓", 16, new Color(0.73f, 0.54f, 0.17f), false, 600, 0, TextAlignmentOptions.TopRight);
                        check.margin = new Vector4(0, 8, 12, 0);
                    }
                    var id = c.Id;
                    tile.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("hover"); picked = picked == id ? null : id; Draw(); });
                }
                y -= th + 13;
            }
            y -= 8;
        }
        content.anchoredPosition = Vector2.zero;
        content.sizeDelta = new Vector2(0, -y + 10);
        var hit = content.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0.001f);
        var scroll = view.gameObject.AddComponent<ScrollRect>();
        scroll.viewport = view;
        scroll.content = content;
        scroll.horizontal = false;
        scroll.movementType = ScrollRect.MovementType.Clamped;
        scroll.scrollSensitivity = 40;

        // The one picked, waiting to begin; or how many are solved.
        var pick = picked != null ? Puzzles.ChallengeById(picked) : null;
        if (pick != null)
        {
            var foot = Hud.Rect(root, "Picked");
            Hud.At(foot, new Vector2(0.5f, 0), new Vector2(0, 20), new Vector2(600, 100));
            var t1 = Hud.Label(foot, $"AS THE {Races.RaceNames[pick.Race].ToUpperInvariant()} · {Puzzles.TimeLimit(pick)} S", 11, Look.InkFaint, true, 500, 26, TextAlignmentOptions.TopLeft);
            t1.margin = new Vector4(90, 6, 0, 0);
            var t2 = Hud.Label(foot, $"CHALLENGE {all.IndexOf(pick) + 1}", 24, Look.Ink, true, 400, 26, TextAlignmentOptions.Left);
            t2.margin = new Vector4(90, 0, 0, 6);
            var t3 = Hud.Label(foot, pick.Goal == "win" ? ((pick.Days ?? 1) > 1 ? $"win within {pick.Days} days" : "win this day") : "survive their day", 16, Look.InkSoft, false, 400, 0, TextAlignmentOptions.BottomLeft);
            t3.margin = new Vector4(90, 0, 0, 10);
            var id = pick.Id;
            var begin = Hud.Pill(foot, solved.Contains(id) ? "Again" : "Begin", () => App.Instance.Puzzle("challenge", id), 16, Color.white);
            Hud.At((RectTransform)begin.transform, new Vector2(0.5f, 0.5f), new Vector2(190, 0), new Vector2(150, 50));
        }
        else
        {
            var hint = Hud.Label(root, $"{solved.Count} of {all.Count} solved", 16, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Bottom);
            hint.margin = new Vector4(0, 0, 0, 44);
        }
    }
}
