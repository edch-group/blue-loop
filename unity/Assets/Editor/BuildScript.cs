using System;
using System.IO;
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
