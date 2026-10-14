using System.Collections.Generic;

namespace BlueLoop.Engine
{
    /// <summary>Who speaks a line: the guide (kind "oracle"), or a hero (by Hero card id) of a faction (kind "general").</summary>
    public class Speaker
    {
        public string Kind;
        public string Card;
        public string Faction;
    }

    public class StoryLine
    {
        public Speaker Speaker;
        public string Text;
    }

    public class StoryScene
    {
        /// <summary>What happened (each moment plays once per campaign).</summary>
        public string Id;
        public string Title;
        public List<StoryLine> Lines;
    }

    /// <summary>The campaign's story (story.ts): who speaks, and what they say, at each moment worth a scene.</summary>
    public static class Story
    {
        public class GeneralLine { public string Join; public string Taunt; }
        public class Keeper { public string Name; public string Role; }
        public class Data
        {
            public List<List<string>> Generals;
            public List<string> Motive;
            public Dictionary<string, string> HeroBios;
            public Dictionary<string, GeneralLine> GeneralLines;
            public Dictionary<string, string> StruggleLines;
            public Dictionary<string, string> ArrivalLines;
            public Keeper Quartermaster;
            public Keeper Recycler;
            public List<string> QuartermasterLines;
            public List<string> RecyclerLines;
            public List<string> LostRaces;
        }

        public static Data D;

        public const string OracleName = "Oriel the Wanderer";
        /// <summary>The star at the centre of the universe, and what is said to grow there.</summary>
        public const string HeartName = "The Heart";
        public const string StellariaName = "Infinite Stellari";
        /// <summary>What the Aureline, its first keepers, call it: roughly, "life-giver".</summary>
        public const string Vitalia = "Vitalia";

        /// <summary>Each race's generals (Hero cards), in the order they join: the first leads the opening army.</summary>
        public static List<List<string>> Generals => D.Generals;
        /// <summary>Why each race marches on the Heart.</summary>
        public static List<string> Motive => D.Motive;
        /// <summary>Each hero in a line or two, as the run's setup introduces them.</summary>
        public static Dictionary<string, string> HeroBios => D.HeroBios;
        /// <summary>What a general says on taking command (and on first meeting a rival).</summary>
        public static Dictionary<string, GeneralLine> GeneralLines => D.GeneralLines;
        /// <summary>What a hero of your own race says, coming for your command while your sun runs overheated.</summary>
        public static Dictionary<string, string> StruggleLines => D.StruggleLines;
        /// <summary>What each general says as their flagship first flies in, at the start of a campaign.</summary>
        public static Dictionary<string, string> ArrivalLines => D.ArrivalLines;
        /// <summary>The armoury's keepers: the quartermaster sells; the recycler breaks cards down.</summary>
        public static Keeper Quartermaster => D.Quartermaster;
        public static Keeper Recycler => D.Recycler;
        public static List<string> QuartermasterLines => D.QuartermasterLines;
        public static List<string> RecyclerLines => D.RecyclerLines;
        /// <summary>The Lost Races: the last of peoples whose stars went dark in the dimming.</summary>
        public static List<string> LostRaces => D.LostRaces;

        static StoryLine Oracle(string text) => new StoryLine { Speaker = new Speaker { Kind = "oracle" }, Text = text };
        static StoryLine General(string card, string faction, string text) => new StoryLine { Speaker = new Speaker { Kind = "general", Card = card, Faction = faction }, Text = text };
        static StoryScene Scene(string id, string title, params StoryLine[] lines) => new StoryScene { Id = id, Title = title, Lines = new List<StoryLine>(lines) };
        static string Join(string card) => GeneralLines.TryGetValue(card, out var l) ? l.Join : null;
        static string Taunt(string card) => GeneralLines.TryGetValue(card, out var l) ? l.Taunt : null;
        static string RaceName(int race) => Races.RaceNames[race];

        /// <summary>The opening: the dying universe, the legend, the player's race and its first general.</summary>
        public static StoryScene IntroScene(int race, string faction, string hero = null)
        {
            var first = hero ?? Generals[race][0];
            return Scene("intro", "A dying universe",
                Oracle($"I am {OracleName}. I have walked between the stars since before they began to go out. Now I walk among the ashes."),
                Oracle("The universe is dying. Star by star, the light is failing, and every race left alive is fighting over the last warm worlds."),
                Oracle($"But there is a legend. At the centre of all things burns {HeartName}, the oldest star, and in its light grows the {StellariaName}: a white flower whose bloom gives energy without end."),
                Oracle(race == 0
                    ? $"Your people know it is more than a legend. The Aureline kept it once, and called it {Vitalia}, the life-giver. You remember what losing it cost."
                    : $"It is more than a legend. It was kept, once, by the Aureline, who called it {Vitalia}, the life-giver. They lost it, and very nearly everything else."),
                Oracle(Motive[race]),
                General(first, faction, ArrivalLines.TryGetValue(first, out var arrive) ? arrive : GeneralLines[first].Join),
                Oracle($"Your armies march one route a turn. Take systems for their materials, and press on towards {HeartName}. Recruit more generals as you grow: each leads an army with a deck of its own."));
        }

        /// <summary>The Captain's opening: a nameless human with a stolen hulk, and no race to call their own.</summary>
        public static StoryScene CaptainIntroScene(string faction, string captain) =>
            Scene("intro", "A dying universe",
                Oracle($"I am {OracleName}. I have walked between the stars since before they began to go out. Now I walk among the ashes."),
                Oracle("The universe is dying. Star by star, the light is failing, and every race left alive is fighting over the last warm worlds."),
                Oracle($"But there is a legend. At the centre of all things burns {HeartName}, the oldest star, and in its light grows the {StellariaName}: a white flower whose bloom gives energy without end."),
                Oracle("And you? You are no one. A human, with a battered hulk, an engine that coughs smoke, and a hold of salvage. No race calls you its own. No hero would follow you. Not yet."),
                Oracle("The great heroes of the four peoples are out there. Some will come for your ship. Beat them, and they are yours: to take aboard, or to strip of everything they carry."),
                General(captain, faction, "She still flies. Mostly. Set a course for the Heart."),
                Oracle($"Jump one route at a time. Take systems for their materials, and press on towards {HeartName}."));

        /// <summary>A new general takes command of an army.</summary>
        public static StoryScene RecruitScene(string card, string faction) => Scene($"recruit:{card}", "A new general", General(card, faction, Join(card) ?? "I am ready."));

        /// <summary>The player's first conquest.</summary>
        public static StoryScene FirstConquestScene() =>
            Scene("first-conquest", "The first world",
                Oracle("Your first world. A settled world feeds your armies every turn; an absorbed one pays once, and is spent."),
                Oracle("And a burned one bars your rivals for a turn. A terrible thing to do to a star, when so few are left. Choose as well with the next."));

        /// <summary>A rival faction, met for the first time: its general speaks, the player's answers.</summary>
        public static StoryScene ContactScene(int rivalRace, string rivalGeneral, string rivalFaction, string myGeneral, string myFaction) =>
            Scene($"contact:{rivalFaction}", $"The {RaceName(rivalRace)}",
                Oracle($"The {RaceName(rivalRace)}. {Motive[rivalRace]}"),
                General(rivalGeneral, rivalFaction, Taunt(rivalGeneral) ?? "Turn back."),
                General(myGeneral, myFaction, (Join(myGeneral)?.Split('.')[0] ?? "Out of my way") + ". We do not turn back."));

        public static StoryScene StellariaSightedScene() =>
            Scene("stellaria-sighted", "A Stellari bloom",
                Oracle("Look there: a Stellari bloom. A finite one, a cutting from the legend, blown out across the dark."),
                Oracle("Hold the system, and the bloom will pour materials into your hands every turn. But it is not the real thing. It wilts."));

        public static StoryScene StellariaClaimedScene() =>
            Scene("stellaria-claimed", "The bloom is yours",
                Oracle("The bloom is yours. Feel how it warms everything near it? Imagine one that never wilts. That is what waits at the centre."));

        public static StoryScene StellariaWiltedScene() =>
            Scene("stellaria-wilted", "A bloom wilts",
                Oracle("The bloom has wilted. They all do, out here. Only one flower is infinite, and it does not grow this far from the Heart."));

        public static StoryScene DimmingScene(string system) =>
            Scene("dimming", "A star gutters",
                Oracle($"Did you see? The star of {system} has guttered. Its worlds will yield less now, and less again, until they yield nothing."),
                Oracle("It will keep happening. The longer this war lasts, the less there will be left to win."));

        public static StoryScene InstabilityScene() =>
            Scene("instability", "Regional stability",
                Oracle("Do you feel it? The space between the stars is thinning. Regional stability is failing."),
                Oracle("Soon whole systems will start to fall into the dark: the farthest first, then on, and in. Do not be standing in one when it goes."));

        public static StoryScene CollapseScene() =>
            Scene("collapse", "The collapse",
                Oracle("It has begun. The systems marked on your map will be gone next turn, and more will follow, every turn, from the rim inwards."),
                Oracle("You cannot stay. Keep moving towards the Heart. If a world is worth it, you can spend materials to hold it together a little longer: once, and only once."));

        public static StoryScene HeartSightedScene() =>
            Scene("heart-sighted", HeartName,
                Oracle($"There it is. {HeartName}. Even dying, it outshines everything."),
                Oracle("It is guarded. A Lost Overlord squats before it: the last of some dead empire, more body than mind now, and it will not stand aside for anyone. Watch what it means to do next, and break that part of it first."));

        public static StoryScene ArmyLostScene() =>
            Scene("army-lost", "An army falls",
                Oracle("An army is broken, and its general driven from the field. Generals can be recruited again, but the war will not wait for them."));

        public static StoryScene RivalFallsScene(int rivalRace, string rivalFaction) =>
            Scene($"falls:{rivalFaction}", $"The {RaceName(rivalRace)} fall",
                Oracle($"The {RaceName(rivalRace)} are finished. Their worlds are yours to take, or to leave in the dark. One fewer people to share the light with."));

        public static StoryScene VictoryHeartScene(string hero, string faction, int race) =>
            Scene("victory", race == 0 ? Vitalia : StellariaName,
                Oracle($"You have reached {HeartName}, and its Overlord has fallen. And there, in the white fire at its centre: the {StellariaName}, in bloom."),
                General(hero, faction, race == 0 ? $"{Vitalia}. She is still here. After everything, we have brought her home." : "It is real. After everything, it is real."),
                Oracle("Carry it home. Light your star again. And remember, when the others come to you in the dark, how much light there is now to share."));

        public static StoryScene VictoryDominationScene() =>
            Scene("victory", "Dominion",
                Oracle("Half the universe answers to you now. The Heart can wait: with so much under your banner, no one is left to reach it first."));

        public static StoryScene DefeatScene(int winnerRace, bool heart) =>
            Scene("defeat", "The light goes out",
                Oracle(heart
                    ? $"The {RaceName(winnerRace)} have reached {HeartName}, and the {StellariaName} is theirs. Your star will go dark without it."
                    : $"It is over. The {RaceName(winnerRace)} hold the universe now, and your people's star goes quietly out."),
                Oracle("I will remember you. Someone should."));

        public static StoryScene LostSightedScene(string name) =>
            Scene("lost-sighted", "The Lost Races",
                Oracle($"Do you see that fleet? The last of the {name}. Their star went dark in the dimming, and took their worlds with it."),
                Oracle("There are others like them: the Lost Races, the last of peoples the dark has already taken. They have no home to defend, and nothing left to lose. They wander, and they take what they can."),
                Oracle("Some still carry emblems of the worlds they lost. Bring one of them down, and the emblems are yours. Leave them be, and they may come for your worlds instead."));

        public static StoryScene LostRaidScene(string name, string system) =>
            Scene("lost-raid", "A raid",
                Oracle($"The {name} have stripped {system}. They do not keep what they take. They only need it for a little longer than you do."));

        // ---- The loop: universe after universe, each collapsing behind the one who crosses it ----

        /// <summary>The Stellari's wormhole, as a new universe's strip begins (where it lies, and that it is guarded).</summary>
        public static StoryScene WormholeSightedScene(int universe) =>
            universe == 1
                ? Scene($"wormhole:{universe}", "The wormhole",
                    Oracle("Look to the far end of this reach. A Stellari bloom, and so much power pouring off it that space has torn open round it: a wormhole."),
                    Oracle("Beyond it lies another galaxy, younger, still burning. Reach it before this one collapses behind you. Something guards it. Something always does."))
                : Scene($"wormhole:{universe}", $"Galaxy {universe}",
                    Oracle("Another galaxy, and another bloom at the far end of it. They burn hotter here, and so does everything guarding them."),
                    Oracle("The collapse will come sooner this time. It always does. Keep moving."));

        /// <summary>Through the wormhole: the petals grabbed on the way.</summary>
        public static StoryScene WormholeCrossedScene(int universe, int petals) =>
            Scene($"crossed:{universe}", "Through the wormhole",
                Oracle($"You tore through, and as you went you caught {petals} Stellari petal{(petals == 1 ? "" : "s")}. Not the flower: never the flower. But petals keep, even when everything else is lost."),
                Oracle("Whatever becomes of you, they will be there for the one who tries next."));

        /// <summary>The run is over: the flagship is lost.</summary>
        public static StoryScene RunOverScene(int universe) =>
            Scene("run-over", "The light goes out",
                Oracle(universe > 1 ? $"{universe} galaxies. Further than most ever go." : "It is over, this time."),
                Oracle("The petals you carried are safe. Spend them, and go again. The loop always comes round."));
    }
}
