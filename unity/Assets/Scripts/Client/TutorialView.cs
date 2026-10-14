using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The tutorial (puzzles.ts tutorialPage): the branch of lessons with Oriel at its root (the trunk, the core forking
/// into holding on and the four races, the Lost Races' crown above), and the lesson picked, waiting to begin.
/// </summary>
public class TutorialView : MonoBehaviour
{
    /// <summary>Where each lesson sits on the branch, in a 100 × 64 box.</summary>
    static readonly Dictionary<string, Vector2> At = new Dictionary<string, Vector2>
    {
        ["sun"] = new Vector2(50, 50), ["energy"] = new Vector2(50, 42), ["guard"] = new Vector2(50, 34), ["breach"] = new Vector2(50, 26),
        ["shields"] = new Vector2(39, 23), ["cooling"] = new Vector2(29, 19), ["removal"] = new Vector2(19, 16), ["traps"] = new Vector2(9, 13),
        ["forge"] = new Vector2(61, 23), ["overheat"] = new Vector2(71, 19), ["growth"] = new Vector2(81, 16), ["heroes"] = new Vector2(91, 13),
        ["dusk"] = new Vector2(96, 7), ["darkspeed"] = new Vector2(50, 16), ["consume"] = new Vector2(39, 11), ["erode"] = new Vector2(61, 11),
        ["spend"] = new Vector2(28, 6), ["bulwark"] = new Vector2(72, 6), ["ahead"] = new Vector2(50, 4),
    };

    RectTransform root;
    MenuView menu;
    string picked;

    public static TutorialView Make(RectTransform parent, MenuView menu)
    {
        var r = Hud.Rect(parent, "Tutorial");
        Hud.Fill(r);
        var v = r.gameObject.AddComponent<TutorialView>();
        v.root = r;
        v.menu = menu;
        v.Draw();
        return v;
    }

    // (The branch's box on the page, as the web lays it out on its 1600 × 1000 page: 1553.6 across from 23.2 in,
    // 768.4 tall from 149.8 down; points from the middle of the page, y up.)
    static Vector2 Map(float x, float y) => new Vector2(23.2f + x / 100 * 1553.6f - 800, 500 - (149.8f + y / 64 * 768.4f));

    static Vector2 Pt(string id)
    {
        var p = At.TryGetValue(id, out var a) ? a : new Vector2(50, 50);
        return Map(p.x, p.y);
    }

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var done = Puzzles.LessonsDone;
        bool coreDone = Lessons.CoreLessons.All(done.Contains);
        MenuView.BackButton(root, () => menu.Show("hub"), 23.2f, 20.3f);
        Hud.Text(root, "WITH ORIEL", 0, 20.3f, 1600, 17, 13.9f, Look.InkFaint, true, 400, 30);
        Hud.Text(root, "TUTORIAL", 0, 40.2f, 1600, 58, 46.4f, Look.Ink, true, 400, 40);

        // The links: each lesson to those before it (the crown from the trunk's top, once the core is done); a curve
        // through a point a unit above the lower end, as the web's path.
        var linesRect = Hud.Rect(root, "Links");
        Hud.At(linesRect, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1600, 1000));
        var lines = linesRect.gameObject.AddComponent<UiLines>();
        var gold = Hud.Rgba(214, 178, 94);
        lines.Add(new List<Vector2> { Map(50, 59), Pt("sun") }, gold, 3);
        foreach (var l in Lessons.All)
            foreach (var a in l.After)
            {
                var from = a == "core" ? At["breach"] : At.TryGetValue(a, out var fa) ? fa : new Vector2(50, 50);
                var to = At.TryGetValue(l.Id, out var ta) ? ta : new Vector2(50, 50);
                bool lit = done.Contains(l.Id), open = Lessons.LessonOpen(l.Id, done);
                var pts = UiLines.Curve(Map(from.x, from.y), Map((from.x + to.x) / 2, Mathf.Max(from.y, to.y) - 1), Map(to.x, to.y));
                if (lit) lines.Add(pts, gold, 3);
                else if (open) lines.Add(pts, Hud.Rgba(95, 143, 196, 0.45f), 2, 4, 5);
                else if (a == "core") lines.Add(pts, Hud.Rgba(58, 66, 86, 0.16f), 2, 2, 6);
                else lines.Add(pts, Hud.Rgba(58, 66, 86, 0.16f), 2);
            }

        // The lessons: each a dot (60.9 across) over its name (15.3, spaced 0.16em), the two centred on its point.
        for (int i = 0; i < Lessons.All.Count; i++)
        {
            var l = Lessons.All[i];
            bool isDone = done.Contains(l.Id), open = Lessons.LessonOpen(l.Id, done), on = picked == l.Id;
            var p = Pt(l.Id);
            var node = Hud.Rect(root, l.Id);
            Hud.At(node, new Vector2(0.5f, 0.5f), p, new Vector2(240, 85.7f));
            var group = node.gameObject.AddComponent<CanvasGroup>();
            group.alpha = open || isDone ? 1 : 0.5f;
            // (Picked, the dot grows by 18% in a dark ring.)
            float d = on ? 60.9f * 1.18f : 60.9f;
            var dot = Hud.Rect(node, "Dot");
            Hud.At(dot, new Vector2(0.5f, 1), new Vector2(0, -30.45f), new Vector2(d, d));
            dot.pivot = new Vector2(0.5f, 0.5f);
            var di = dot.gameObject.AddComponent<Image>();
            di.sprite = Hud.Circle;
            di.color = isDone ? Hud.Rgba(231, 194, 106) : l.Track == "advanced" && !open ? Hud.Rgba(236, 238, 243) : Color.white;
            var ring = on ? new Hud.Drop(Hud.Rgba(58, 66, 86), 0, 0, 4.35f)
                : isDone ? new Hud.Drop(Hud.Rgba(150, 110, 30, 0.5f), 0, 0, 1.4f)
                : open ? new Hud.Drop(Hud.Rgba(95, 143, 196), 0, 0, 2.9f)
                : new Hud.Drop(Hud.Rgba(58, 66, 86, 0.2f), 0, 0, 1.4f);
            var glow = on ? new Hud.Drop(Hud.Rgba(40, 46, 70, 0.25f), 8.7f, 26.1f)
                : isDone ? new Hud.Drop(Hud.Rgba(230, 190, 90, 0.5f), 0, 20.3f)
                : open ? new Hud.Drop(Hud.Rgba(95, 143, 196, 0.5f), 0, 23.2f)
                : new Hud.Drop(Hud.Rgba(40, 46, 70, 0.1f), 5.8f, 17.4f);
            Hud.Shadow(di, d / 2, ring, glow);
            Hud.Label(dot, isDone ? "✓" : (i + 1).ToString(), 16.7f, isDone ? Hud.Rgba(106, 74, 18) : open ? Look.Ink : Look.InkSoft, true, 400, 0);
            Hud.Text(node, l.Name.ToUpperInvariant(), 0, 66.7f, 240, 19, 15.3f, Look.InkSoft, true, 400, 16);
            if (open || isDone)
            {
                var id = l.Id;
                var b = dot.gameObject.AddComponent<Button>();
                b.targetGraphic = di;
                b.onClick.AddListener(() => { Sound.Play("hover"); picked = picked == id ? null : id; Draw(); });
            }
        }

        // Oriel, at the root: 87 across, a white ring and a soft shadow.
        var oriel = Hud.Rect(root, "Oriel");
        Hud.At(oriel, new Vector2(0.5f, 0.5f), Map(50, 59), new Vector2(87, 87));
        var face = oriel.gameObject.AddComponent<Image>();
        face.sprite = Hud.Circle;
        Hud.Shadow(face, 43.5f, new Hud.Drop(Color.white, 0, 0, 2.9f), new Hud.Drop(Hud.Rgba(40, 46, 70, 0.25f), 8.7f, 26.1f));
        oriel.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var pic = Hud.Rect(oriel, "Picture");
        Hud.Fill(pic);
        var raw = pic.gameObject.AddComponent<RawImage>();
        raw.texture = Resources.Load<Texture2D>("Portraits/oriel");

        // The lesson picked, waiting to begin (its track, name and what it teaches, and begin beside them), or
        // Oriel's word, centred under the branch.
        var lesson = picked != null ? Lessons.LessonById(picked) : null;
        if (lesson != null)
        {
            string track = lesson.Track == "core" ? "CORE" : "THE LOST RACES", name = lesson.Name.ToUpperInvariant(), go = done.Contains(lesson.Id) ? "again" : "begin";
            float colW = Mathf.Max(Hud.Wide(track, 12.1f, 400, 24, 0), Hud.Wide(name, 23.2f, 400, 24, 0), Hud.Wide(lesson.Teaches, 18.1f, 400, 0, 0, false));
            float bw = Hud.Wide(go.ToUpperInvariant(), 15.3f, 700, 14, 24.6f), x = 800 - (colW + 26.1f + bw) / 2;
            Hud.Text(root, track, x, 900.3f, colW + 2, 15, 12.1f, Look.InkFaint, true, 400, 24, TextAlignmentOptions.Left);
            Hud.Text(root, name, x, 918.2f, colW + 2, 29, 23.2f, Look.Ink, true, 400, 24, TextAlignmentOptions.Left);
            Hud.Text(root, lesson.Teaches, x, 950.1f, colW + 2, 22, 18.1f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
            var id = lesson.Id;
            var begin = Hud.Primary(root, go, () => App.Instance.Puzzle("lesson", id));
            Hud.Place((RectTransform)begin.transform, x + colW + 26.1f, 912.7f, bw, 47.1f);
        }
        else
        {
            var hint = coreDone ? "The lost races await, above." : done.Count > 0 ? "The lost races open once the core is learnt." : "Walk with me. Start at the root.";
            Hud.Text(root, hint.ToUpperInvariant(), 0, 927.2f, 1600, 18, 14.4f, Look.InkFaint, true, 400, 24);
        }
    }
}
