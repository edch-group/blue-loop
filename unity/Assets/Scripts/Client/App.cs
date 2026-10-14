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
