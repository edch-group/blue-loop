using System.Collections;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;

/// <summary>
/// The game's screens (app.ts): the menu (title, hub, quickplay and the rest) and a battle, one at a time. Each
/// screen builds its own objects; leaving it clears them.
/// </summary>
public class App : MonoBehaviour
{
    public static App Instance { get; private set; }
    GameObject current;
    public Camera MenuCam { get; private set; }

    public static App Make()
    {
        var go = new GameObject("App");
        var app = go.AddComponent<App>();
        Instance = app;
        // (The account's session checked, and its economy and any newer progress taken up: Account. Progress from
        // another device taken up, the menu reads it afresh (app.ts start: reloadHere); a picture just dealt shows.)
        var avatar = Account.Current?.Avatar;
        if (Application.isPlaying)
            Account.CheckIn(replaced =>
            {
                var menu = MenuView.Live;
                if (menu == null) return;
                if (replaced) menu.Reload();
                else if (Account.Current?.Avatar != avatar) menu.Redraw();
            });
        return app;
    }

    void Clear()
    {
        // (A battle of the run's lies outside the current screen: it goes too.)
        foreach (var b in FindObjectsByType<BattleView>(FindObjectsInactive.Include, FindObjectsSortMode.None)) if (b.gameObject != current) Mats.Kill(b.gameObject);
        if (current != null) Mats.Kill(current);
        current = null;
        if (MenuCam != null) Mats.Kill(MenuCam.gameObject);
        MenuCam = null;
        Left();
    }

    // The campaign menu as a run sets out from it: kept until the run has taken over (CampaignView.Launch).
    GameObject leaving;
    Camera leavingCam;

    void Left()
    {
        if (leaving != null) Mats.Kill(leaving);
        if (leavingCam != null) Mats.Kill(leavingCam.gameObject);
        leaving = null;
        leavingCam = null;
    }

    /// <summary>The menu, at one of its pages ("title", "hub", "quickplay").</summary>
    public MenuView Menu(string page = "title")
    {
        Clear();
        var cam = new GameObject("Menu camera").AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = Look.Paper;
        cam.orthographic = true;
        MenuCam = cam;
        var menu = MenuView.Make(cam, page);
        current = menu.gameObject;
        return menu;
    }

    /// <summary>The saved game against the AI, where it was left.</summary>
    public void Continue()
    {
        var saved = BattleView.Saved();
        if (saved == null) { Menu("hub"); return; }
        Clear();
        var battle = BattleView.Make();
        current = battle.gameObject;
        battle.Cam.transform.SetParent(current.transform, true);
        battle.Board.transform.SetParent(current.transform, true);
        battle.Load(saved);
    }

    CampaignView campaign;

    /// <summary>
    /// The campaign: a run (the saved one, or a new one), its map. A new run opens on its opening shot; set out from the
    /// campaign menu, in one shot from the menu's own land (the menu kept, under it, until the run has taken over).
    /// </summary>
    public void Run(CampaignState run)
    {
        bool fresh = run != null && !CampaignView.HasSave && run.Rift == null;
        var scene = current != null && current.GetComponent<MenuView>() != null ? current.GetComponentInChildren<CampaignBackdrop>() : null;
        if (fresh && scene != null && MenuCam != null && Application.isPlaying)
        {
            Left();
            leaving = current;
            leavingCam = MenuCam;
            MenuCam = null;
            campaign = CampaignView.Make(run, true);
            current = campaign.gameObject;
            campaign.Launch(scene, leaving.GetComponentInChildren<Canvas>(), leavingCam, Left);
            return;
        }
        // A run picked up mid-battle: the paper comes in over the menu, and the battle is made under it (the map,
        // never seen, put aside at once: CampaignBattle).
        if (run?.Battle != null && Application.isPlaying)
        {
            StartCoroutine(RunIntoBattle(run, fresh));
            return;
        }
        Clear();
        campaign = CampaignView.Make(run, fresh);
        current = campaign.gameObject;
    }

    IEnumerator RunIntoBattle(CampaignState run, bool fresh)
    {
        Curtain.Hold();
        try
        {
            // (Nothing showing yet: the paper simply up.)
            if (current != null) yield return Curtain.Close();
            else Curtain.Cover();
            Clear();
            campaign = CampaignView.Make(run, fresh);
            current = campaign.gameObject;
        }
        finally { Curtain.Release(); }
    }

    // ---- Between the run's map and its battles ----

    /// <summary>How long the ship is seen settled at the system before the paper comes in over the map (campaign.ts ENCOUNTER_PAUSE, shortened: the camera already leaning in).</summary>
    const float Landed = 0.35f;
    /// <summary>The longest the paper waits on the new screen's pictures arriving (in the browser each streams in).</summary>
    const float PicturesWait = 0.6f;
    bool switching;

    /// <summary>
    /// A battle of the run's: the map put aside (not gone) while it is fought. The camera leans in toward the ship
    /// as the paper comes in over the map, the battle's score taking over; the board is made under it, and the paper
    /// lifts off it as its opening hand is dealt in. (A run picked up mid-battle: the paper is already up.)
    /// </summary>
    public void CampaignBattle(GameState game, CampaignView from)
    {
        if (!Application.isPlaying)
        {
            from.gameObject.SetActive(false);
            MakeCampaignBattle(game, from, false);
            return;
        }
        StartCoroutine(IntoBattle(game, from));
    }

    BattleView MakeCampaignBattle(GameState game, CampaignView from, bool held)
    {
        var battle = BattleView.Make();
        battle.Cam.transform.SetParent(battle.transform, true);
        battle.Board.transform.SetParent(battle.transform, true);
        battle.LoadCampaign(game, from, held);
        return battle;
    }

    IEnumerator IntoBattle(GameState game, CampaignView from)
    {
        Curtain.Hold();
        switching = true;
        try
        {
            // (The battle's score in as the map's goes: Sound.Scene crossfades them.)
            Sound.Scene(game.Players.Any(p => p.Boss != null) ? "boss" : "battle", from.TimeRift);
            if (!Curtain.Covered)
            {
                from.LeanIn();
                yield return Wait(Landed);
                yield return Curtain.Close();
                // (A frame drawn wholly covered before the board is made: the hitch of making it never seen.)
                yield return null;
            }
            if (from == null) yield break;
            // (The map put aside and the board made in the one frame: never a frame with neither.)
            from.gameObject.SetActive(false);
            var battle = MakeCampaignBattle(game, from, true);
            yield return null;
            yield return Arrivals();
            battle.Open();
            yield return Curtain.Open();
        }
        finally
        {
            switching = false;
            Curtain.Release();
        }
    }

    /// <summary>
    /// Back from a battle of the run's, with how it ended (or retreated from): the paper comes in over the board as the
    /// map's score comes back; under it the map is shown as it now stands, framed on the flagship; the paper lifts off
    /// it as the camera eases back out to rest. Whatever the battle left waiting (spoils, a card, the run's end) is
    /// there as it clears.
    /// </summary>
    public void EndCampaignBattle(BattleView battle, GameState game, CampaignView to)
    {
        if (!Application.isPlaying)
        {
            Mats.Kill(battle.gameObject);
            to.gameObject.SetActive(true);
            to.FinishBattle(game);
            return;
        }
        if (switching) return;
        StartCoroutine(BackToMap(battle, game, to));
    }

    IEnumerator BackToMap(BattleView battle, GameState game, CampaignView to)
    {
        Curtain.Hold();
        switching = true;
        try
        {
            to.ScoreBack();
            yield return Curtain.Close();
            // (A frame drawn wholly covered, then the map shown afresh under it: its rebuilding never seen.)
            yield return null;
            if (battle != null) Mats.Kill(battle.gameObject);
            if (to == null) yield break;
            to.gameObject.SetActive(true);
            to.FinishBattle(game);
            to.Reframe();
            yield return null;
            yield return Arrivals();
            yield return Curtain.Open();
        }
        finally
        {
            switching = false;
            Curtain.Release();
        }
    }

    /// <summary>A moment for the pictures the new screen asked for to arrive (never long), so none pops in after.</summary>
    static IEnumerator Arrivals()
    {
        for (float t = 0; t < PicturesWait && Pictures.Waiting > 0; t += Mathf.Min(Time.unscaledDeltaTime, 0.1f)) yield return null;
    }

    static IEnumerator Wait(float seconds)
    {
        for (float t = 0; t < seconds; t += Mathf.Min(Time.unscaledDeltaTime, 1 / 30f)) yield return null;
    }

    /// <summary>A lesson ("lesson") or a challenge ("challenge"), as a battle.</summary>
    public void Puzzle(string kind, string id)
    {
        Clear();
        var battle = BattleView.Make();
        current = battle.gameObject;
        battle.Cam.transform.SetParent(current.transform, true);
        battle.Board.transform.SetParent(current.transform, true);
        battle.StartPuzzle(kind, id);
    }

    /// <summary>An online game (Online): the room's view of it, seen as `you`, its moves sent to the room.</summary>
    public BattleView OnlineBattle(GameState game, string you)
    {
        Clear();
        var battle = BattleView.Make();
        current = battle.gameObject;
        battle.Cam.transform.SetParent(current.transform, true);
        battle.Board.transform.SetParent(current.transform, true);
        battle.LoadOnline(game, you);
        return battle;
    }

    /// <summary>A battle between two decks (by name; unset: chosen at random), you against the AI.</summary>
    public BattleView Battle(string myDeck = null, string theirDeck = null, int? seed = null)
    {
        var battle = NewScreen();
        battle.NewBattle(seed ?? Random.Range(1, 100000), myDeck, theirDeck);
        return battle;
    }

    /// <summary>Quickplay's battle (app.ts newGame): its seats as set, each a human or the AI, in the mode played.</summary>
    public BattleView Battle(System.Collections.Generic.List<PlayerSetup> players, string mode, int? seed = null)
    {
        var battle = NewScreen();
        battle.NewBattle(seed ?? Random.Range(1, 100000), players, mode);
        return battle;
    }

    BattleView NewScreen()
    {
        Clear();
        var battle = BattleView.Make();
        current = battle.gameObject;
        // (The battle's camera, board and HUD go when it does.)
        battle.Cam.transform.SetParent(current.transform, true);
        battle.Board.transform.SetParent(current.transform, true);
        return battle;
    }
}
