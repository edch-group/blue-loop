using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;

/// <summary>
/// The tutorial's lessons and the challenges (puzzles.ts): which have been done, kept on this device, and the
/// challenges themselves (the Dreams of the Lost from the third tier up).
/// </summary>
public static class Puzzles
{
    const string LessonsKey = "blue-loop:lessons-done", ChallengesKey = "blue-loop:challenges-solved";
    /// <summary>The dream tier challenge mode starts at (tiers 1 and 2 are what the tutorial teaches).</summary>
    public const int ChallengeFromTier = 3;

    static List<string> ReadList(string key)
    {
        try { return Store.Read<List<string>>(key) ?? new List<string>(); }
        catch { return new List<string>(); }
    }

    static void AddTo(string key, string id)
    {
        var list = ReadList(key);
        if (!list.Contains(id)) { list.Add(id); Store.Write(key, list); }
    }

    public static List<string> LessonsDone => ReadList(LessonsKey);
    public static void MarkLesson(string id) => AddTo(LessonsKey, id);
    public static List<string> ChallengesSolved => ReadList(ChallengesKey);
    public static void MarkChallenge(string id) => AddTo(ChallengesKey, id);

    /// <summary>The challenges, in order: by tier, then race, then goal.</summary>
    public static List<Game.DreamSpec> Challenges => DreamsData.Dreams.Where(d => d.Tier >= ChallengeFromTier)
        .OrderBy(d => d.Tier).ThenBy(d => d.Race).ThenBy(d => d.Goal, System.StringComparer.Ordinal).ToList();

    public static Game.DreamSpec ChallengeById(string id) => Challenges.FirstOrDefault(c => c.Id == id);

    /// <summary>The lesson after this one, if it is open now (the next to take).</summary>
    public static Lesson NextLesson(string id)
    {
        var done = LessonsDone;
        int i = Lessons.All.FindIndex(l => l.Id == id);
        return Lessons.All.Skip(i + 1).Concat(Lessons.All.Take(i)).FirstOrDefault(l => !done.Contains(l.Id) && Lessons.LessonOpen(l.Id, done));
    }

    public static Game.DreamSpec NextChallenge(string id)
    {
        var all = Challenges;
        int i = all.FindIndex(c => c.Id == id);
        return i >= 0 && i + 1 < all.Count ? all[i + 1] : null;
    }

    /// <summary>A challenge's time limit, in seconds, over all its days (a minute, and 20 seconds more a tier).</summary>
    public static int TimeLimit(Game.DreamSpec spec) => 60 + 20 * spec.Tier;
}
