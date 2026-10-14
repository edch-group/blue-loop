using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>Something on the battle screen for Oriel to light as he speaks (a CSS selector; `circle`: a ring round it).</summary>
    public class LessonLight
    {
        public string Sel;
        public int? Circle;
    }

    public class LessonStep
    {
        public string Text;
        public List<LessonLight> Light;
    }

    public class Lesson
    {
        public string Id;
        public string Name;
        /// <summary>A few words on what it teaches (under its name on the branch).</summary>
        public string Teaches;
        /// <summary>"core" or "advanced".</summary>
        public string Track;
        /// <summary>Lessons to finish first (none: open from the start; "core": every core lesson).</summary>
        public List<string> After;
        public string Mode;
        public Game.DreamSpec Spec;
        /// <summary>Oriel's words as the lesson begins, step by step.</summary>
        public List<LessonStep> Intro;
        /// <summary>Oriel's word once it is solved.</summary>
        public string Done;
        /// <summary>Oriel's word when a move would leave the lesson unwinnable (the move is held back).</summary>
        public string Hint;
        /// <summary>Solved by holding back: ending the day at once is the answer (the dusk lesson).</summary>
        public bool? Waiting;
    }

    /// <summary>
    /// The tutorial (lessons.ts): set positions played as dreams are (Puzzle), with Oriel's words before each begins and
    /// as it is solved. Core lessons first; the advanced (Lost Races) open once the core is done.
    /// </summary>
    public static class Lessons
    {
        /// <summary>Every lesson, in order. (LESSONS.)</summary>
        public static List<Lesson> All { get; private set; }
        /// <summary>The core lessons (the advanced open once every one is done).</summary>
        public static List<string> CoreLessons { get; private set; }

        public static void Load(List<Lesson> lessons)
        {
            All = lessons;
            CoreLessons = All.Where(l => l.Track == "core").Select(l => l.Id).ToList();
        }

        public static Lesson LessonById(string id) => All.FirstOrDefault(l => l.Id == id);

        /// <summary>Whether a lesson is open: its lessons before done ("core": every core lesson).</summary>
        public static bool LessonOpen(string id, IList<string> done)
        {
            var l = LessonById(id);
            if (l == null) return false;
            return l.After.All(a => a == "core" ? CoreLessons.All(done.Contains) : done.Contains(a));
        }
    }
}
