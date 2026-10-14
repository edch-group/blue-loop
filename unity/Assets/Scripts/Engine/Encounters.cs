using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>Who comes alongside, for the scene to show: "merchant", "pirate", "hunter", "nyxari" or "seren".</summary>
    public class VisitorLook
    {
        public string Ship;
    }

    /// <summary>A line said: by the visitor, the Captain, or one of the crew (by companion id).</summary>
    public class EncounterLine
    {
        public string Who;
        public string Text;
    }

    /// <summary>A choice on offer: an id, and its label (the price shown).</summary>
    public class EncounterChoice
    {
        public string Id;
        public string Label;
    }

    /// <summary>
    /// Story encounters (encounters.ts): the Captain's runs only. Who comes alongside, what they say, what the Captain may
    /// choose, and what comes of it (the kinds: merchant, pirates, hunters, and the Lost Races' exile and stillness).
    /// The outcomes: good, bad, declined, paid, won, lost, fled, joined.
    /// </summary>
    public static class Encounters
    {
        public class Hunter { public string Name; public string Leader; }

        /// <summary>The odds a merchant's device works.</summary>
        public const double CurioGood = 0.4;
        /// <summary>Stages of Kaelen's hunters before they give up for good.</summary>
        public const int HunterStages = 3;
        /// <summary>Story encounters on each galaxy's strip (the Captain's runs; none in a rift).</summary>
        public const int EncountersPerGalaxy = 2;

        /// <summary>What the hunters' leader is called at each stage, and who they bring.</summary>
        public static List<Hunter> Hunters;

        /// <summary>What each costs, by galaxy: the merchant's price, the pirates' toll, the hunters' bribe.</summary>
        public static int EncounterPrice(string kind, int universe, int stage = 0)
        {
            if (kind == "merchant") return 6 + 2 * universe;
            if (kind == "pirates") return 12 + 4 * universe;
            if (kind == "exile" || kind == "stillness") return 0;
            return 10 + 4 * universe + 4 * stage;
        }

        /// <summary>The visitor's name, for the scene's title.</summary>
        public static string VisitorName(string kind, int stage = 0)
        {
            if (kind == "merchant") return "A Travelling Merchant";
            if (kind == "pirates") return "Void Pirates";
            if (kind == "exile") return "A Nyxari Exile";
            if (kind == "stillness") return "A Stopped Hour";
            return Hunters[Math.Min(stage, Hunters.Count - 1)].Name;
        }

        public static VisitorLook VisitorLook(string kind) => new VisitorLook
        {
            Ship = kind == "merchant" ? "merchant" : kind == "pirates" ? "pirate" : kind == "exile" ? "nyxari" : kind == "stillness" ? "seren" : "hunter",
        };

        static EncounterLine L(string who, string text) => new EncounterLine { Who = who, Text = text };
        static List<EncounterLine> Ls(params EncounterLine[] lines) => lines.ToList();

        /// <summary>What is said as the visitor comes alongside (`crew`: who is aboard to speak).</summary>
        public static List<EncounterLine> OpeningLines(string kind, int price, int stage, IList<string> crew)
        {
            bool mara = crew.Contains("engineer");
            if (kind == "merchant")
                return Ls(
                    L("visitor", $"Captain! A moment of your time. I have here a device from beyond the Heart. What does it do? Ah. That is the thrill of it. {price} materials, and it is yours."),
                    mara ? L("engineer", "It's humming, Captain. Things that hum like that either save your ship or take a hole out of it.") : L("captain", "It is humming. Things that hum like that rarely stay quiet."));
            if (kind == "exile")
                return Ls(
                    L("visitor", "Human ship! Open your hold to me. They are a jump behind, and they do not take prisoners. Not of their own."),
                    L("captain", "Who is \"they\"?"),
                    L("visitor", "My kin. I would not feed the dark what it asked for, so now it asks for me. Stand with me, and I am yours."));
            if (kind == "stillness")
                return Ls(
                    L("visitor", "You can see me. Then the reading was true: a human, a battered ship, the hour that will not move."),
                    L("visitor", "I stepped out of time to wait for you, Captain. Every chart I read ends the same. Take me aboard, and let us change one."));
            if (kind == "pirates")
                return Ls(
                    L("visitor", $"Nice ship. Be a shame if something happened to it. {price} materials, and we were never here."),
                    L("captain", "And if we say no?"),
                    L("visitor", "Then we take it the hard way, and the ship too."));
            if (stage == 0)
                return Ls(
                    L("visitor", "By order of the Solarch: Kaelen of the Lancer Guard, you are charged with desertion. Surrender him, Captain, and you may fly on."),
                    L("lancer", "I left because they ordered me to burn a world that had already surrendered. I would leave again."),
                    L("visitor", $"Or pay the bounty yourself. {price} materials buys him a little more time."));
            if (stage == 1)
                return Ls(
                    L("visitor", "Ilvane. You will have heard of me. The trackers came back empty-handed, Kaelen. I won't."),
                    L("lancer", "Ilvane trained half the Guard, Captain. If we fight, we fight carefully."),
                    L("visitor", $"{price} materials and I report I lost the trail. Or we do this properly."));
            return Ls(
                L("visitor", "The Solarch sends her last word, deserter. It is me."),
                L("lancer", "This is the last of them, Captain. Win this, and they will never come for me again."));
        }

        static EncounterChoice C(string id, string label) => new EncounterChoice { Id = id, Label = label };

        /// <summary>The choices on offer: an id, and its label (the price shown).</summary>
        public static List<EncounterChoice> EncounterChoices(string kind, int price, int stage)
        {
            if (kind == "merchant") return new List<EncounterChoice> { C("buy", $"buy it · {price}"), C("leave", "no thanks") };
            if (kind == "pirates") return new List<EncounterChoice> { C("fight", "fight"), C("pay", $"pay · {price}") };
            if (kind == "exile") return new List<EncounterChoice> { C("fight", "stand with her"), C("leave", "leave her to them") };
            if (kind == "stillness") return new List<EncounterChoice> { C("free", "take her aboard"), C("leave", "leave her waiting") };
            return stage >= HunterStages - 1
                ? new List<EncounterChoice> { C("fight", "stand with Kaelen") }
                : new List<EncounterChoice> { C("fight", "stand with Kaelen"), C("pay", $"pay the bounty · {price}") };
        }

        /// <summary>What is said once it is decided.</summary>
        public static List<EncounterLine> ClosingLines(string kind, string outcome, int stage, IList<string> crew)
        {
            bool mara = crew.Contains("engineer");
            if (kind == "merchant")
            {
                if (outcome == "good") return Ls(L("visitor", "A fine choice. A fine, fine choice."), mara ? L("engineer", "Captain... it works. It actually works. I'm fitting it now.") : L("captain", "It works. It actually works."));
                if (outcome == "bad") return Ls(L("visitor", "No refunds!"), mara ? L("engineer", "It blew, Captain! A slot's wrecked. I can't fix it out here; I need a space station.") : L("captain", "It blew. A slot is wrecked until a space station can mend it."));
                return Ls(L("visitor", "Your loss, Captain. Your loss."));
            }
            if (kind == "exile")
            {
                if (outcome == "won") return Ls(L("visitor", "They are gone. For now. I am Nyss, Captain, and my blade is yours."));
                if (outcome == "lost") return Ls(L("visitor", "They have me... go, Captain. Go!"));
                return Ls(L("visitor", "Then fly fast, human. They will not stop at me."));
            }
            if (kind == "stillness")
            {
                if (outcome == "joined") return Ls(L("visitor", "The hour moves again. I am Ilyra. Let us read a different ending."));
                return Ls(L("visitor", "Then I will wait. Time is the one thing I have."));
            }
            if (kind == "pirates")
            {
                if (outcome == "paid") return Ls(L("visitor", "Pleasure doing business."));
                if (outcome == "won") return Ls(L("captain", "Whatever they had in the hold is ours now."));
                return Ls(L("visitor", "We'll take what we came for, then."));
            }
            if (outcome == "paid") return Ls(L("lancer", "They will be back, Captain. They always come back."));
            if (outcome == "won")
                return stage >= HunterStages - 1
                    ? Ls(L("lancer", "It's over. I am free, Captain. Truly free. My lance is yours for as long as you'll have it."))
                    : Ls(L("lancer", "Thank you, Captain. They will send someone worse."));
            return Ls(L("lancer", "I'm still here, Captain. They didn't take me. Not today."));
        }
    }
}
