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

    /// <summary>The campaign: a run (the saved one, or a new one), its map.</summary>
    public void Run(CampaignState run)
    {
        Clear();
        campaign = CampaignView.Make(run);
        current = campaign.gameObject;
    }

    /// <summary>A battle of the run's: the map put aside (not gone) while it is fought.</summary>
    public void CampaignBattle(GameState game, CampaignView from)
    {
        from.gameObject.SetActive(false);
        var battle = BattleView.Make();
        battle.Cam.transform.SetParent(battle.transform, true);
        battle.Board.transform.SetParent(battle.transform, true);
        battle.LoadCampaign(game, from);
    }

    /// <summary>Back from a battle of the run's, with how it ended (or retreated from).</summary>
    public void EndCampaignBattle(BattleView battle, GameState game, CampaignView to)
    {
        Mats.Kill(battle.gameObject);
        to.gameObject.SetActive(true);
        to.FinishBattle(game);
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

    /// <summary>A battle between two decks (by name; unset: chosen at random), you against the AI.</summary>
    public BattleView Battle(string myDeck = null, string theirDeck = null, int? seed = null)
    {
        Clear();
        var battle = BattleView.Make();
        current = battle.gameObject;
        // (The battle's camera, board and HUD go when it does.)
        battle.Cam.transform.SetParent(current.transform, true);
        battle.Board.transform.SetParent(current.transform, true);
        battle.NewBattle(seed ?? Random.Range(1, 100000), myDeck, theirDeck);
        return battle;
    }
}
