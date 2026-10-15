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
        toured = state;
        if (lesson != null) Invoke(nameof(LessonTour), 1.5f);
    }

    void LeavePuzzle() => App.Instance?.Menu(puzzleKind == "lesson" ? "tutorial" : "challenges");

    // ---- The name under the flower, and a challenge's clock ----

    void PuzzleTag()
    {
        if (puzzleKind == null || state == null || state.WinnerId != null) { GalaxyTag(); return; }
        if (lesson != null) { Board.SetTag(lesson.Name, lesson.Teaches); return; }
        int days = state.Challenge?.Days ?? 1;
        string goal = state.Challenge?.Goal == "survive" ? "survive their day" : days > 1 ? $"win within {days} days · day {Mathf.Min(days, state.Players[0].TurnsTaken)}" : "win this day";
        int left = Mathf.Max(0, Mathf.CeilToInt(clockLeft));
        Board.SetTag($"challenge {Puzzles.Challenges.FindIndex(c => c.Id == puzzleId) + 1}", $"{goal} · {left / 60}:{left % 60:00}");
    }

    /// <summary>app.ts renderGalaxyTag: a campaign galaxy's trade-off, its name and what it does in short (none: no tag).</summary>
    void GalaxyTag()
    {
        var g = state?.Players.SelectMany(p => p.Conditions ?? new List<BattleCondition>()).FirstOrDefault(c => c.Galaxy == true);
        Board.SetTag(g?.Name?.ToLowerInvariant(), g?.Short);
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

    /// <summary>The lesson's board as dealt: Oriel talks it through 1.5 s on, unless a move has been made by then.</summary>
    GameState toured;

    void LessonTour()
    {
        if (lesson == null || state == null || state != toured) return;
        Speak(lesson.Intro.Select(st => (st.Text, st.Light)).ToList());
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
        Speak(new List<(string, List<LessonLight>)> { ((early ? "Not yet: their sun can still be brought down today. " : "Not that. ") + lesson.Hint, null) });
        return true;
    }

    /// <summary>
    /// Oriel's words (app.ts lessonTour: startTour, shown every time a lesson is taken): a step at a time, what each
    /// speaks of lit as it stands on screen (Tour); none while words of his already show.
    /// </summary>
    void Speak(List<(string text, List<LessonLight> light)> steps)
    {
        if (Tour.Showing) return;
        var list = steps.Select(st => new Tour.Step
        {
            Text = st.text,
            Shapes = st.light != null && st.light.Count > 0 ? () => st.light.SelectMany(Trace).ToList() : (System.Func<List<Vector2[]>>)null,
        }).ToList();
        Tour.Show(hud.transform, list, Resources.Load<Texture2D>("Portraits/oriel"));
    }

    // ---- What a lesson lights, traced as it stands on screen (tour.ts trace) ----

    /// <summary>
    /// A lesson's light (the web's selector for it) as outlines on the page, in CSS pixels from its top left: the
    /// thing's own outline, its rounded corners and all, 6 out from it, traced in its own plane (a card on the tilted
    /// board as the trapezoid it is drawn as, a sun's place as an ellipse); or a circle in that plane (`Circle`: its
    /// radius as a share of the thing's width). The first such thing (none on screen: none).
    /// </summary>
    List<Vector2[]> Trace(LessonLight l)
    {
        var found = new List<Vector2[]>();
        var shape = TraceOf(l.Sel, l.Circle);
        if (shape != null && shape.Length >= 3) found.Add(shape);
        return found;
    }

    Vector2[] TraceOf(string sel, int? circle)
    {
        var L = BoardLayout.Current;
        var table = Board.transform.Find("Table") ?? Board.transform;
        string id = sel.Contains("data-card=\"") ? sel.Split(new[] { "data-card=\"" }, System.StringSplitOptions.None)[1].Split('"')[0] : null;
        // (On the board: a box in the table's plane, its middle at (x, y) on the board's page, w by h, its corners `radius`, in CSS px.)
        Vector2[] OnBoard(float x, float y, float w, float h, float radius)
        {
            System.Func<Vector2, Vector3> at = q => table.TransformPoint(L.At(x + q.x, y - q.y));
            return Outline(at, w, h, radius, 1, circle);
        }
        // (A card, wherever it lies (in the hand, flat to the screen; on the table): its face 1 by 1.4 in its own units.)
        Vector2[] OfCard(CardView v)
        {
            if (v == null || !v.gameObject.activeInHierarchy) return null;
            var t = v.transform;
            // (Its own units as page pixels, measured across its middle: the padding is 6 of those.)
            float unit = (ToPage(t.TransformPoint(new Vector3(0.5f, 0, 0))) - ToPage(t.TransformPoint(new Vector3(-0.5f, 0, 0)))).magnitude;
            if (unit < 1) return null;
            System.Func<Vector2, Vector3> at = q => t.TransformPoint(new Vector3(q.x / unit, 0, q.y / unit));
            return Outline(at, unit, 1.4f * unit, 0.08f * unit, 1, circle);
        }
        // (A part of the screen's own layer: its box, flat.)
        Vector2[] OnHud(RectTransform r, float radius)
        {
            if (r == null || !r.gameObject.activeInHierarchy) return null;
            var c = new Vector3[4];
            r.GetWorldCorners(c);
            Vector2 a = HudPage(c[1]), b = HudPage(c[3]);
            var mid = (a + b) / 2;
            System.Func<Vector2, Vector3> at = q => new Vector3(mid.x + q.x, mid.y - q.y, 0);
            return Outline(at, b.x - a.x, b.y - a.y, radius, 0, circle);
        }
        CardView Card(PlayerState p, bool hand) => id == null ? null : (hand ? p.Hand : p.Tableau).Where(x => x.DefId == id).Select(x => Board.View(x.Uid)).FirstOrDefault(v => v != null);
        if (sel.StartsWith(".tableau-rival .vitals")) return OnBoard(L.WrapLeft + 0.58f * L.Vs, L.RivalRowCy - 0.08f * L.Vs, L.Vs, L.Vs, L.Vs / 2);
        if (sel.StartsWith(".tableau-mine .vitals")) return OnBoard(L.WrapLeft + 0.58f * L.Vs, L.MyRowCy - 0.08f * L.Vs, L.Vs, L.Vs, L.Vs / 2);
        // (The trap's slot: a card's place, corners 8% of its width.)
        if (sel.StartsWith(".tableau-mine .slot-ls")) return OnBoard(L.ColX(5), L.MyRowCy, L.Tcw, 1.4f * L.Tcw, 0.08f * L.Tcw);
        // (The rival's row: its six places and the gaps between, square.)
        if (sel.StartsWith(".tableau-rival .tableau-row")) return OnBoard(L.RowLeft + (6 * L.Tcw + 5 * L.SlotGap) / 2, L.RivalRowCy, 6 * L.Tcw + 5 * L.SlotGap, 1.4f * L.Tcw, 0);
        if (id != null && sel.StartsWith(".tableau-mine")) return OfCard(Card(Me, false));
        if (id != null && sel.StartsWith(".tableau-rival")) return OfCard(Card(Rival, false));
        if (id != null && sel.StartsWith(".hand")) return OfCard(Card(Me, true));
        if (sel.StartsWith(".hand") && Board.HandRects.Count > 0)
        {
            // (The hand's place along the foot, flat: between the dock's columns, from 8 above its cards to the page's foot.)
            float top = Board.HandRects.Min(r => r.yMin) - 8;
            var mid = new Vector2(L.HandLeft + L.HandW / 2, (top + L.H) / 2);
            System.Func<Vector2, Vector3> at = q => new Vector3(mid.x + q.x, mid.y - q.y, 0);
            return Outline(at, L.HandW, L.H - top, 0, 0, circle);
        }
        // (Your energy: its word over its pips; End Day, a button's corners of 10.)
        if (sel.StartsWith(".plays")) return OnHud(energyLabel != null ? (RectTransform)energyLabel.transform.parent : null, 0);
        if (sel.StartsWith(".end-turn")) return OnHud((RectTransform)endDay.transform, 10);
        return null;
    }

    /// <summary>
    /// A box's outline traced round (tour.ts trace): `at` maps a point of its own plane (from its middle, x across, y
    /// up, in the page's pixels) to where it stands; `space` 1 the world (projected to the page), 0 the page already.
    /// Its corners each a quarter circle of `radius` grown by the padding (6; at most half the box's shorter side and
    /// 6), or, with `circle`, a circle of that share of its width, 40 points round.
    /// </summary>
    Vector2[] Outline(System.Func<Vector2, Vector3> at, float w, float h, float radius, int space, int? circle)
    {
        System.Func<Vector2, Vector2> page = q => { var p = at(q); return space == 1 ? ToPage(p) : new Vector2(p.x, p.y); };
        var pts = new List<Vector2>();
        if (circle != null)
        {
            float share = circle.Value > 1 ? circle.Value / 100f : circle.Value, r = share * w;
            for (int k = 0; k < 40; k++)
            {
                float a = k / 40f * Mathf.PI * 2;
                pts.Add(page(new Vector2(Mathf.Cos(a) * r, -Mathf.Sin(a) * r)));
            }
        }
        else
        {
            const float pad = 6;
            float max = Mathf.Min(w, h) / 2, rr = Mathf.Min(max + pad, Mathf.Min(max, radius) + pad);
            float hx = w / 2 + pad, hy = h / 2 + pad;
            // (Clockwise on the page from the top left, each corner 9 steps round its centre.)
            var corners = new[] { (new Vector2(-hx + rr, hy - rr), 180f), (new Vector2(hx - rr, hy - rr), 270f), (new Vector2(hx - rr, -hy + rr), 0f), (new Vector2(-hx + rr, -hy + rr), 90f) };
            foreach (var (c, from) in corners)
                for (int k = 0; k <= 9; k++)
                {
                    float a = (from + k / 9f * 90) * Mathf.Deg2Rad;
                    pts.Add(page(c + new Vector2(Mathf.Cos(a) * rr, -Mathf.Sin(a) * rr)));
                }
        }
        return pts.Any(p => float.IsNaN(p.x) || float.IsInfinity(p.x)) ? null : pts.ToArray();
    }

    /// <summary>A point of the world where the table's camera draws it on the page (CSS px from its top left).</summary>
    Vector2 ToPage(Vector3 world)
    {
        var s = Cam.WorldToScreenPoint(world);
        var l = BoardLayout.Current;
        return new Vector2(s.x / Cam.pixelWidth * l.W, (1 - s.y / Cam.pixelHeight) * l.H);
    }

    /// <summary>A point of the screen's own layer on the page (CSS px from its top left).</summary>
    Vector2 HudPage(Vector3 world)
    {
        var root = (RectTransform)hud.transform;
        var p = root.InverseTransformPoint(world);
        return new Vector2(p.x - root.rect.xMin, root.rect.yMax - p.y);
    }

    // ---- The end ----

    void PuzzleResult()
    {
        bool won = state.WinnerId == state.Players[0].Id;
        if (won) { if (lesson != null) Puzzles.MarkLesson(puzzleId); else Puzzles.MarkChallenge(puzzleId); }
        string next = won ? (lesson != null ? Puzzles.NextLesson(puzzleId)?.Id : Puzzles.NextChallenge(puzzleId)?.Id) : null;
        string title = won ? (lesson != null ? "learnt" : "solved") : "not yet";
        string why = won ? (lesson != null ? lesson.Done : "The dream gives way.") : lesson != null ? "Try again: the answer is there." : "The dream holds. Try again.";
        var kind = puzzleKind;
        var id = puzzleId;
        var back = new ResultAction(kind == "lesson" ? "tutorial" : "challenges", LeavePuzzle, false);
        var actions = won
            ? (next != null ? new[] { new ResultAction("next", () => App.Instance.Puzzle(kind, next), true), back } : new[] { back })
            : new[] { new ResultAction("try again", () => App.Instance.Puzzle(kind, id), true), back };
        ResultCard(title, won ? 1 : -1, why, null, actions, true, won && lesson != null);
    }
}
