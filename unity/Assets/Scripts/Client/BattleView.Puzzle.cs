using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// A lesson or a challenge as a battle (app.ts startPuzzle): a set position played as a dream is. A lesson has Oriel
/// talk it through, lighting what he speaks of, and holds back a move that would leave it unwinnable, saying why; a
/// challenge is timed (the dreamer's own days only). Its end says learnt, solved or not yet, and what's next.
/// </summary>
public partial class BattleView
{
    string puzzleKind, puzzleId;
    Lesson lesson;
    Game.DreamSpec puzzleSpec;
    float clockLeft;
    RectTransform tour;

    public void StartPuzzle(string kind, string id)
    {
        puzzleKind = kind;
        puzzleId = id;
        lesson = kind == "lesson" ? Lessons.LessonById(id) : null;
        puzzleSpec = lesson?.Spec ?? (kind == "challenge" ? Puzzles.ChallengeById(id) : null);
        if (puzzleSpec == null) { App.Instance?.Menu("hub"); return; }
        clockLeft = Puzzles.TimeLimit(puzzleSpec);
        var me = string.IsNullOrEmpty(Profile.Me.Name) ? "You" : Profile.Me.Name;
        var s = Game.CreateDream(puzzleSpec, Random.Range(1, int.MaxValue), me, lesson != null ? "a shade" : "the dream", lesson?.Mode ?? "lost");
        Load(s);
        if (lesson != null) Invoke(nameof(LessonTour), 1.5f);
    }

    void LeavePuzzle() => App.Instance?.Menu(puzzleKind == "lesson" ? "tutorial" : "challenges");

    // ---- The name under the flower, and a challenge's clock ----

    void PuzzleTag()
    {
        if (puzzleKind == null || state == null) { Board.SetTag(null, null); return; }
        if (state.WinnerId != null) { Board.SetTag(null, null); return; }
        if (lesson != null) { Board.SetTag(lesson.Name, lesson.Teaches); return; }
        int days = state.Challenge?.Days ?? 1;
        string goal = state.Challenge?.Goal == "survive" ? "survive their day" : days > 1 ? $"win within {days} days · day {Mathf.Min(days, state.Players[0].TurnsTaken)}" : "win this day";
        int left = Mathf.Max(0, Mathf.CeilToInt(clockLeft));
        Board.SetTag($"challenge {Puzzles.Challenges.FindIndex(c => c.Id == puzzleId) + 1}", $"{goal} · {left / 60}:{left % 60:00}");
    }

    float lastShown = -1;

    /// <summary>The challenge's clock, run in the dreamer's own day; at nothing, the dream is lost.</summary>
    void LateUpdate()
    {
        if (puzzleKind != "challenge" || state == null || state.WinnerId != null) return;
        if (Game.ActivePlayer(state) != state.Players[0]) return;
        clockLeft -= Time.deltaTime;
        if (Mathf.Ceil(clockLeft) != lastShown) { lastShown = Mathf.Ceil(clockLeft); PuzzleTag(); }
        if (clockLeft <= 0) Do(new EngineAction { Type = "concede", PlayerId = state.Players[0].Id });
    }

    // ---- Oriel ----

    void LessonTour()
    {
        if (lesson == null || state == null) return;
        Speak(lesson.Intro.Select(st => (st.Text, st.Light)).ToList(), 0);
    }

    /// <summary>A move that would leave the lesson unwinnable is held back, and Oriel says why.</summary>
    bool LessonBlocks(EngineAction a)
    {
        if (lesson == null || state == null || a.Type == "concede" || a.Type == "react") return false;
        if (Game.ActivePlayer(state) != state.Players[0]) return false;
        if (Puzzle.KeepsWinnable(lesson.Spec, state, a)) return false;
        Sound.Play("error");
        Clear();
        Refresh();
        bool early = a.Type == "endTurn" && lesson.Spec.Goal == "win" && (lesson.Spec.Days ?? 1) <= 1;
        Speak(new List<(string, List<LessonLight>)> { ((early ? "Not yet: their sun can still be brought down today. " : "Not that. ") + lesson.Hint, null) }, 0);
        return true;
    }

    /// <summary>Oriel's words, a step at a time: the step's text beside what it lights, and the way on.</summary>
    void Speak(List<(string text, List<LessonLight> light)> steps, int at)
    {
        if (tour != null) Mats.Kill(tour.gameObject);
        tour = null;
        if (at >= steps.Count) return;
        tour = Hud.Rect(Layer, "Oriel");
        Hud.Fill(tour);
        var (text, light) = steps[at];
        // What he speaks of, ringed.
        Rect? target = null;
        foreach (var l in light ?? new List<LessonLight>())
        {
            var r = LightRect(l.Sel);
            if (r == null) continue;
            target ??= r;
            var ring = Hud.Rect(tour, "Light");
            Hud.At(ring, new Vector2(0.5f, 0.5f), r.Value.center, r.Value.size + new Vector2(28, 28));
            var ri = ring.gameObject.AddComponent<Image>();
            ri.sprite = Hud.Soft;
            ri.type = Image.Type.Sliced;
            ri.color = new Color(0.55f, 0.45f, 0.95f, 0.55f);
            ri.raycastTarget = false;
        }
        // The way on: the steps as dots, Next (or done), and close.
        var bar = Hud.Glass(tour, "Steps", Color.white);
        Hud.At((RectTransform)bar.transform, new Vector2(0.5f, 1), new Vector2(0, -18), new Vector2(312, 62));
        for (int i = 0; i < steps.Count; i++)
        {
            var d = Hud.Rect(bar.transform, "Dot");
            Hud.At(d, new Vector2(0.5f, 0.5f), new Vector2(-82 + i * 14 - (steps.Count - 1) * 7 + 14, 0), new Vector2(7, 7));
            var di = d.gameObject.AddComponent<Image>();
            di.sprite = Hud.Circle;
            di.color = i == at ? new Color(0.42f, 0.36f, 0.88f) : new Color(0.8f, 0.8f, 0.86f);
            di.raycastTarget = false;
        }
        var next = Hud.Pill(bar.transform, at + 1 < steps.Count ? "Next" : "Done", () => Speak(steps, at + 1), 16, new Color(0.42f, 0.36f, 0.88f), Color.white);
        Hud.At((RectTransform)next.transform, new Vector2(0.5f, 0.5f), new Vector2(26, 0), new Vector2(115, 46));
        var close = Hud.Label(bar.transform, "×", 22, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Right);
        close.margin = new Vector4(0, 0, 22, 4);
        var cr = Hud.Rect(bar.transform, "Close");
        Hud.At(cr, new Vector2(1, 0.5f), new Vector2(-6, 0), new Vector2(44, 44));
        cr.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0.001f);
        cr.gameObject.AddComponent<Button>().onClick.AddListener(() => Speak(steps, steps.Count));
        // His words, beside it (under it, or over it near the foot), or in the middle.
        var bubble = Hud.Glass(tour, "Words", Color.white);
        var br = (RectTransform)bubble.transform;
        var t = Hud.Label(br, text, 17, Look.Ink, false, 400, 0, TextAlignmentOptions.Left);
        t.textWrappingMode = TextWrappingModes.Normal;
        t.margin = new Vector4(86, 18, 22, 18);
        var size = t.GetPreferredValues(text, 432 - 108, 0);
        var bs = new Vector2(432, Mathf.Max(84, size.y + 40));
        Vector2 pos = Vector2.zero;
        if (target != null)
        {
            var r = target.Value;
            // (Within the screen, whatever its size: the layer is as large as the page.)
            var room = refLayer.rect.size / 2;
            bool below = r.center.y > -0.3f * room.y;
            pos = new Vector2(Mathf.Clamp(r.center.x, -room.x + bs.x / 2 + 20, room.x - bs.x / 2 - 20), below ? r.yMin - 24 - bs.y / 2 : r.yMax + 24 + bs.y / 2);
            pos.y = Mathf.Clamp(pos.y, -room.y + bs.y / 2 + 10, room.y - bs.y / 2 - 90);
        }
        Hud.At(br, new Vector2(0.5f, 0.5f), pos, bs);
        var face = Hud.Rect(br, "Oriel");
        Hud.At(face, new Vector2(0, 0.5f), new Vector2(20, 0), new Vector2(50, 50));
        face.gameObject.AddComponent<Image>().sprite = Hud.Circle;
        face.gameObject.AddComponent<Mask>().showMaskGraphic = false;
        var pic = Hud.Rect(face, "Picture");
        Hud.Fill(pic);
        pic.gameObject.AddComponent<RawImage>().texture = Resources.Load<Texture2D>("Portraits/oriel");
    }

    /// <summary>Where on the canvas a lesson's light falls (the web's selector for it), if it is on show.</summary>
    Rect? LightRect(string sel)
    {
        var canvas = refLayer;
        Rect? FromWorld(Vector3 centre, Vector3 half)
        {
            var pts = new List<Vector2>();
            foreach (var dx in new[] { -1, 1 })
                foreach (var dz in new[] { -1, 1 })
                {
                    var sp = Cam.WorldToScreenPoint(centre + new Vector3(half.x * dx, half.y, half.z * dz));
                    if (RectTransformUtility.ScreenPointToLocalPointInRectangle(canvas, sp, hudCam, out var lp)) pts.Add(lp);
                }
            if (pts.Count == 0) return null;
            float x0 = pts.Min(p => p.x), x1 = pts.Max(p => p.x), y0 = pts.Min(p => p.y), y1 = pts.Max(p => p.y);
            return new Rect(x0, y0, x1 - x0, y1 - y0);
        }
        Rect? FromHud(RectTransform r)
        {
            if (r == null) return null;
            var c = new Vector3[4];
            r.GetWorldCorners(c);
            var a = canvas.InverseTransformPoint(c[0]);
            var b = canvas.InverseTransformPoint(c[2]);
            return new Rect(a.x, a.y, b.x - a.x, b.y - a.y);
        }
        Rect? Card(PlayerState p, string defId, bool hand)
        {
            var c = (hand ? p.Hand : p.Tableau).FirstOrDefault(x => x.DefId == defId);
            var v = c != null ? Board.View(c.Uid) : null;
            if (v == null) return null;
            if (hand) return FromWorld(v.transform.position, new Vector3(v.transform.lossyScale.x * 0.5f, 0, v.transform.lossyScale.x * 0.7f));
            return FromWorld(v.transform.position, new Vector3(0.5f, 0, 0.7f));
        }
        string id = sel.Contains("data-card=\"") ? sel.Split(new[] { "data-card=\"" }, System.StringSplitOptions.None)[1].Split('"')[0] : null;
        // (A sun's place as large as it is drawn; the rival's row its five slots.)
        var sunHalf = new Vector3(1, 0, 1) * Board.SunScale;
        if (sel.StartsWith(".tableau-rival .vitals")) return FromWorld(Board.RivalSun, sunHalf);
        if (sel.StartsWith(".tableau-mine .vitals")) return FromWorld(Board.MySun, sunHalf);
        if (sel.StartsWith(".tableau-mine .slot-ls")) return FromWorld(Board.MyTrap, new Vector3(0.5f, 0, 0.7f));
        if (sel.StartsWith(".tableau-rival .tableau-row")) return FromWorld(new Vector3(Board.Pitch / 2, 0, Board.RowZ), new Vector3(2 * Board.Pitch + 0.75f, 0, 0.75f));
        if (id != null && sel.StartsWith(".tableau-mine")) return Card(Me, id, false);
        if (id != null && sel.StartsWith(".tableau-rival")) return Card(Rival, id, false);
        if (id != null && sel.StartsWith(".hand")) return Card(Me, id, true);
        if (sel.StartsWith(".hand") && Board.HandRects.Count > 0)
        {
            // (The hand's cards on the page, as the layer measures it: from its middle, y up.)
            var l = BoardLayout.Current;
            float x0 = Board.HandRects.Min(r => r.xMin), x1 = Board.HandRects.Max(r => r.xMax), y0 = Board.HandRects.Min(r => r.yMin);
            return new Rect((x0 - l.W / 2) * RefScale, (l.H / 2 - l.H) * RefScale, (x1 - x0) * RefScale, (l.H - y0) * RefScale);
        }
        if (sel.StartsWith(".plays")) return FromHud(energyDots);
        if (sel.StartsWith(".end-turn")) return FromHud((RectTransform)endDay.transform);
        return null;
    }

    // ---- The end ----

    void PuzzleResult()
    {
        bool won = state.WinnerId == state.Players[0].Id;
        if (won) { if (lesson != null) Puzzles.MarkLesson(puzzleId); else Puzzles.MarkChallenge(puzzleId); }
        string next = won ? (lesson != null ? Puzzles.NextLesson(puzzleId)?.Id : Puzzles.NextChallenge(puzzleId)?.Id) : null;
        Hud.At(overPanel, new Vector2(0.5f, 0.55f), Vector2.zero, new Vector2(560, 250));
        var card = Hud.Glass(overPanel, "Result", Color.white);
        Hud.Fill((RectTransform)card.transform);
        var t = Hud.Label(card.transform, won ? (lesson != null ? "LEARNT" : "SOLVED") : "NOT YET", 38, won ? new Color(0.76f, 0.48f, 0.12f) : new Color(0.42f, 0.46f, 0.56f), true, 500, 32, TextAlignmentOptions.Top);
        t.margin = new Vector4(0, 30, 0, 0);
        string why = won ? (lesson != null ? lesson.Done : "The dream gives way.") : lesson != null ? "Try again: the answer is there." : "The dream holds. Try again.";
        var w = Hud.Label(card.transform, why, 16, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
        w.textWrappingMode = TextWrappingModes.Normal;
        w.margin = new Vector4(won && lesson != null ? 84 : 30, 92, 30, 0);
        if (won && lesson != null)
        {
            var face = Hud.Rect(card.transform, "Oriel");
            Hud.At(face, new Vector2(0, 1), new Vector2(26, -88), new Vector2(46, 46));
            face.gameObject.AddComponent<Image>().sprite = Hud.Circle;
            face.gameObject.AddComponent<Mask>().showMaskGraphic = false;
            var pic = Hud.Rect(face, "Picture");
            Hud.Fill(pic);
            pic.gameObject.AddComponent<RawImage>().texture = Resources.Load<Texture2D>("Portraits/oriel");
        }
        var kind = puzzleKind;
        string backName = kind == "lesson" ? "Tutorial" : "Challenges";
        if (won && next != null)
        {
            var go = Hud.Pill(card.transform, "Next", () => App.Instance.Puzzle(kind, next), 17, Look.Ink, Color.white);
            Hud.At((RectTransform)go.transform, new Vector2(0.5f, 0), new Vector2(-105, 26), new Vector2(190, 54));
        }
        else if (!won)
        {
            var id = puzzleId;
            var again = Hud.Pill(card.transform, "Try again", () => App.Instance.Puzzle(kind, id), 17, Look.Ink, Color.white);
            Hud.At((RectTransform)again.transform, new Vector2(0.5f, 0), new Vector2(-105, 26), new Vector2(190, 54));
        }
        var back = Hud.Pill(card.transform, backName, LeavePuzzle, 17);
        Hud.At((RectTransform)back.transform, new Vector2(0.5f, 0), new Vector2(won && next == null ? 0 : 105, 26), new Vector2(190, 54));
    }
}
