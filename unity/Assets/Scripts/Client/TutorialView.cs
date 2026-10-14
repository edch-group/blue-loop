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

    // (The branch's box on the page: the full width, 768 tall from 138 down, in the 1600 × 1000 frame.)
    static Vector2 Pt(string id)
    {
        var p = At.TryGetValue(id, out var a) ? a : new Vector2(50, 50);
        return new Vector2((p.x - 50) / 100 * 1600, -138 - p.y / 64 * 768 + 500);
    }

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var done = Puzzles.LessonsDone;
        bool coreDone = Lessons.CoreLessons.All(done.Contains);
        var back = Hud.Pill(root, "‹ Back", () => menu.Show("hub"), 15);
        Hud.At((RectTransform)back.transform, new Vector2(0, 1), new Vector2(24, -20), new Vector2(92, 40));
        var small = Hud.Label(root, "WITH ORIEL", 13, Look.InkFaint, true, 500, 30, TextAlignmentOptions.Top);
        small.margin = new Vector4(0, 22, 0, 0);
        var title = Hud.Label(root, "TUTORIAL", 50, Look.Ink, true, 400, 60, TextAlignmentOptions.Top);
        title.margin = new Vector4(0, 44, 0, 0);

        // The links: each lesson to those before it (the crown from the trunk's top, once the core is done).
        var linesRect = Hud.Rect(root, "Links");
        Hud.At(linesRect, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1600, 1000));
        var lines = linesRect.gameObject.AddComponent<UiLines>();
        var gold = new Color(0.84f, 0.7f, 0.37f);
        var root0 = Pt("sun") + new Vector2(0, -9 / 64f * 768);
        lines.Add(new List<Vector2> { root0, Pt("sun") }, gold, 3);
        foreach (var l in Lessons.All)
            foreach (var a in l.After)
            {
                var p1 = a == "core" ? Pt("breach") : Pt(a);
                var p2 = Pt(l.Id);
                bool lit = done.Contains(l.Id), open = Lessons.LessonOpen(l.Id, done);
                // (The control point a unit above the lower end, as the web's path.)
                var c = new Vector2((p1.x + p2.x) / 2, Mathf.Max(p1.y, p2.y) + 768 / 64f);
                var pts = UiLines.Curve(p1, new Vector2(c.x, Mathf.Min(p1.y, p2.y) + 12), p2);
                if (lit) lines.Add(pts, gold, 3);
                else if (open) lines.Add(pts, new Color(0.37f, 0.56f, 0.77f, 0.45f), 2, 4, 5);
                else if (a == "core") lines.Add(pts, new Color(0.23f, 0.26f, 0.34f, 0.16f), 2, 2, 6);
                else lines.Add(pts, new Color(0.23f, 0.26f, 0.34f, 0.16f), 2);
            }

        // The lessons.
        for (int i = 0; i < Lessons.All.Count; i++)
        {
            var l = Lessons.All[i];
            bool isDone = done.Contains(l.Id), open = Lessons.LessonOpen(l.Id, done), on = picked == l.Id;
            var node = Hud.Rect(root, l.Id);
            Hud.At(node, new Vector2(0.5f, 0.5f), Pt(l.Id), new Vector2(140, 90));
            var group = node.gameObject.AddComponent<CanvasGroup>();
            group.alpha = open || isDone ? 1 : 0.5f;
            float d = on ? 58 : 50;
            if (on)
            {
                var ring = Hud.Rect(node, "Ring");
                Hud.At(ring, new Vector2(0.5f, 0.5f), new Vector2(0, 14), new Vector2(d + 6, d + 6));
                var ri = ring.gameObject.AddComponent<Image>();
                ri.sprite = Hud.Circle;
                ri.color = Look.Ink;
            }
            var dot = Hud.Rect(node, "Dot");
            Hud.At(dot, new Vector2(0.5f, 0.5f), new Vector2(0, 14), new Vector2(d, d));
            var di = dot.gameObject.AddComponent<Image>();
            di.sprite = Hud.Circle;
            di.color = isDone ? new Color(0.91f, 0.76f, 0.42f) : l.Track == "advanced" && !open ? new Color(0.93f, 0.93f, 0.95f) : Color.white;
            Hud.Label(dot, isDone ? "✓" : (i + 1).ToString(), 15, isDone ? new Color(0.42f, 0.29f, 0.07f) : Look.InkSoft, true, 500, 0);
            var name = Hud.Label(node, l.Name.ToUpperInvariant(), 13, Look.InkSoft, true, 400, 16, TextAlignmentOptions.Bottom);
            name.margin = new Vector4(-40, 0, -40, 0);
            if (open || isDone)
            {
                var id = l.Id;
                var b = node.gameObject.AddComponent<Button>();
                b.targetGraphic = di;
                b.onClick.AddListener(() => { Sound.Play("hover"); picked = picked == id ? null : id; Draw(); });
            }
        }

        // Oriel, at the root.
        var oriel = Hud.Rect(root, "Oriel");
        Hud.At(oriel, new Vector2(0.5f, 0.5f), root0, new Vector2(88, 88));
        var halo = oriel.gameObject.AddComponent<Image>();
        halo.sprite = Hud.Circle;
        halo.color = Color.white;
        var face = Hud.Rect(oriel, "Face");
        Hud.Fill(face);
        face.offsetMin = new Vector2(3, 3);
        face.offsetMax = new Vector2(-3, -3);
        var fm = face.gameObject.AddComponent<Image>();
        fm.sprite = Hud.Circle;
        face.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var pic = Hud.Rect(face, "Picture");
        Hud.Fill(pic);
        var raw = pic.gameObject.AddComponent<RawImage>();
        raw.texture = Resources.Load<Texture2D>("Portraits/oriel");

        // The lesson picked, waiting to begin (or Oriel's word).
        var lesson = picked != null ? Lessons.LessonById(picked) : null;
        if (lesson != null)
        {
            var foot = Hud.Rect(root, "Picked");
            Hud.At(foot, new Vector2(0.5f, 0), new Vector2(0, 20), new Vector2(600, 100));
            var t1 = Hud.Label(foot, lesson.Track == "core" ? "CORE" : "THE LOST RACES", 11, Look.InkFaint, true, 500, 26, TextAlignmentOptions.TopLeft);
            t1.margin = new Vector4(130, 6, 0, 0);
            var t2 = Hud.Label(foot, lesson.Name.ToUpperInvariant(), 24, Look.Ink, true, 400, 26, TextAlignmentOptions.Left);
            t2.margin = new Vector4(130, 0, 0, 6);
            var t3 = Hud.Label(foot, lesson.Teaches, 16, Look.InkSoft, false, 400, 0, TextAlignmentOptions.BottomLeft);
            t3.margin = new Vector4(130, 0, 0, 10);
            var id = lesson.Id;
            var begin = Hud.Pill(foot, done.Contains(id) ? "Again" : "Begin", () => App.Instance.Puzzle("lesson", id), 16, Color.white);
            Hud.At((RectTransform)begin.transform, new Vector2(0.5f, 0.5f), new Vector2(150, 0), new Vector2(150, 50));
        }
        else
        {
            var hint = Hud.Label(root, coreDone ? "The lost races await, above." : done.Count > 0 ? "The lost races open once the core is learnt." : "Walk with me. Start at the root.", 16, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Bottom);
            hint.margin = new Vector4(0, 0, 0, 44);
        }
    }
}
