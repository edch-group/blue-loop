using System.Collections.Generic;

namespace BlueLoop.Engine
{
    /// <summary>
    /// The world around the battles, as data (scripts/export-engine.ts's world.json): the story's words, the races, the
    /// rifts, the encounters' hunters, research, ship parts, the dreams and the lessons. Loaded once, into each module.
    /// </summary>
    public static class World
    {
        public class Data
        {
            public Story.Data Story;
            public Races.Data Races;
            public Rifts.Data Rifts;
            public List<Encounters.Hunter> Hunters;
            public Research.Data Research;
            public Parts.Data Parts;
            public List<Game.DreamSpec> Dreams;
            public List<Lesson> Lessons;
        }

        public static Data D { get; private set; }

        public static void Load(string json)
        {
            D = Json.Read<Data>(json);
            Story.D = D.Story;
            Races.D = D.Races;
            Rifts.D = D.Rifts;
            Encounters.Hunters = D.Hunters;
            Research.Load(D.Research);
            Parts.D = D.Parts;
            DreamsData.Dreams = D.Dreams;
            Lessons.Load(D.Lessons);
        }
    }
}
