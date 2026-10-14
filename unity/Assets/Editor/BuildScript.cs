using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

/// <summary>
/// The CI build: screenshots of a battle (the AI playing both sides, stepped here in the editor), then the player:
/// one empty scene (the game builds itself from code at start: see Boot), for whichever platform was asked for.
/// </summary>
public static class BuildScript
{
    public static void Build()
    {
        try { Shots("ci"); }
        catch (Exception e) { Debug.LogError("Screenshots failed: " + e); }

        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        Directory.CreateDirectory("Assets/Scenes");
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Main.unity");
        PlayerSettings.productName = "Blue Loop";
        PlayerSettings.defaultScreenWidth = 1600;
        PlayerSettings.defaultScreenHeight = 900;
        PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
        PlayerSettings.resizableWindow = true;

        var args = Environment.GetCommandLineArgs();
        var output = "build/Game";
        for (int i = 0; i < args.Length - 1; i++) if (args[i] == "-customBuildPath") output = args[i + 1];
        var target = EditorUserBuildSettings.activeBuildTarget;
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = new[] { "Assets/Scenes/Main.unity" },
            locationPathName = output,
            target = target,
            options = BuildOptions.None,
        });
        Debug.Log($"Build {target}: {report.summary.result} -> {output}");
        if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) EditorApplication.Exit(1);
    }

    static void Shots(string dir)
    {
        Directory.CreateDirectory(dir);
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        EngineData.Ensure();
        var battle = BattleView.Make();
        var cam = battle.Cam;
        cam.targetTexture = new RenderTexture(1600, 1000, 24) { antiAliasing = 4 };
        BattleView.Frame(cam);
        battle.Autoplay = true;
        battle.NewBattle(42);
        battle.Settle();
        Shot(cam, Path.Combine(dir, "battle-1.png"));
        int moves = 0;
        while (battle.State.TurnNumber < 7 && battle.State.WinnerId == null && moves++ < 400) battle.Step();
        battle.Settle();
        Shot(cam, Path.Combine(dir, "battle-2.png"));
        while (battle.State.TurnNumber < 13 && battle.State.WinnerId == null && moves++ < 800) battle.Step();
        battle.Settle();
        Shot(cam, Path.Combine(dir, "battle-3.png"));
        Debug.Log($"Screenshots: day {battle.State.TurnNumber}, {moves} moves, winner {battle.State.WinnerId ?? "none yet"}");
        // The glossary's board (scripts/glossary-shots.mjs), set out the same, to set beside src/assets/glossary/board.jpg.
        battle.Autoplay = false;
        battle.NewBattle(7);
        battle.Load(GlossaryBoard(battle.State));
        battle.Settle();
        Shot(cam, Path.Combine(dir, "battle-glossary.png"));
        // The menu's pages.
        UnityEngine.Object.DestroyImmediate(battle.Board.gameObject);
        UnityEngine.Object.DestroyImmediate(cam.gameObject);
        UnityEngine.Object.DestroyImmediate(battle.gameObject);
        var app = App.Make();
        foreach (var page in new[] { "title", "hub", "quickplay", "collection", "glossary", "tutorial", "challenges", "campaign" })
        {
            var menu = app.Menu(page);
            app.MenuCam.targetTexture = new RenderTexture(1600, 1000, 24) { antiAliasing = 4 };
            // (Twice: glyphs added to the atlas by later labels would leave the earlier ones' meshes stale.)
            for (int pass = 0; pass < 2; pass++)
                foreach (var t in menu.GetComponentsInChildren<TMPro.TMP_Text>(true)) t.ForceMeshUpdate(true);
            // (The campaign's page over its scene: the scene's cameras drawn first, into the same picture.)
            var scene = menu.GetComponentInChildren<CampaignBackdrop>();
            if (scene != null)
            {
                scene.At = 30;
                scene.Into(app.MenuCam.targetTexture);
                foreach (var c in scene.Cameras) c.Render();
            }
            Shot(app.MenuCam, Path.Combine(dir, $"menu-{page}.png"));
        }
        UnityEngine.Object.DestroyImmediate(app.gameObject);
        CampaignShot(dir);
    }

    /// <summary>The board the web glossary photographs: both suns, Heroes, armed cards, a Guard, a trap set, shields, a hand.</summary>
    /// <summary>A new run's map, as it opens.</summary>
    static void CampaignShot(string dir)
    {
        var meta = BlueLoop.Engine.Meta.MigrateMeta(new BlueLoop.Engine.MetaState());
        var run = BlueLoop.Engine.Campaign.Create(new BlueLoop.Engine.CampaignSetup { Seed = 5, Captain = BlueLoop.Engine.Meta.CaptainCard(meta), Run = BlueLoop.Engine.Meta.RunBonuses(meta) });
        var view = CampaignView.Make(run);
        view.Cam.targetTexture = new RenderTexture(1600, 1000, 24) { antiAliasing = 4 };
        view.Settle();
        Shot(view.Cam, Path.Combine(dir, "campaign-map.png"));
        UnityEngine.Object.DestroyImmediate(view.gameObject);
    }

    static BlueLoop.Engine.GameState GlossaryBoard(BlueLoop.Engine.GameState s)
    {
        int n = 0;
        BlueLoop.Engine.CardInstance Card(string defId, int? slot = null, int? health = null) => new BlueLoop.Engine.CardInstance { Uid = $"gl{n++}", DefId = defId, Slot = slot, Health = health };
        var me = s.Players[0];
        var foe = s.Players[1];
        me.Name = "You";
        foe.Name = "Your rival";
        me.Heat = 7;
        me.Shields = 2;
        me.TurnsTaken = 3;
        s.Round = 3;
        s.TurnNumber = 5;
        s.ActivePlayerIndex = 0;
        me.PlaysLeft = 3;
        me.DawnChoices = null;
        me.Tableau = new System.Collections.Generic.List<BlueLoop.Engine.CardInstance> { Card("ignition_protocol", -1, 5), Card("helio_lancer", 1, 2), Card("halo_ward", 2, 1), Card("aureline_vanguard", 3, 3) };
        me.Lightspeed = Card("ink_cloud");
        me.Hand = new System.Collections.Generic.List<BlueLoop.Engine.CardInstance> { Card("coronal_lance"), Card("cryo_vault"), Card("sunforge") };
        me.Deck = Enumerable.Range(0, 18).Select(_ => Card("helio_lancer")).ToList();
        me.Discard = new System.Collections.Generic.List<BlueLoop.Engine.CardInstance> { Card("coronal_lance") };
        foe.Heat = 12;
        foe.Tableau = new System.Collections.Generic.List<BlueLoop.Engine.CardInstance> { Card("war_council", -1, 5), Card("p_prism_blade", 1, 2), Card("p_bell_sentry", 2, 1), Card("shard_reactor", 3, 3) };
        foe.Hand = new System.Collections.Generic.List<BlueLoop.Engine.CardInstance> { Card("helio_lancer"), Card("helio_lancer") };
        foe.Deck = Enumerable.Range(0, 16).Select(_ => Card("helio_lancer")).ToList();
        foe.Discard = new System.Collections.Generic.List<BlueLoop.Engine.CardInstance>();
        foe.Lightspeed = null;
        foreach (var p in s.Players) p.Wreck = new System.Collections.Generic.List<BlueLoop.Engine.CardInstance>();
        return s;
    }

    static void Shot(Camera cam, string path)
    {
        Canvas.ForceUpdateCanvases();
        var rt = cam.targetTexture;
        cam.Render();
        RenderTexture.active = rt;
        var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
        tex.Apply();
        File.WriteAllBytes(path, tex.EncodeToPNG());
        RenderTexture.active = null;
        Debug.Log("Saved " + path);
    }
}
