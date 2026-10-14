using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

/// <summary>The CI build: a scene made here (a camera, a light, a cube that saves a screenshot), built for Linux.</summary>
public static class BuildScript
{
    public static void Build()
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var cam = new GameObject("Camera").AddComponent<Camera>();
        cam.transform.position = new Vector3(0, 1.2f, -3.5f);
        cam.transform.LookAt(Vector3.zero);
        cam.backgroundColor = new Color(0.09f, 0.1f, 0.14f);
        cam.clearFlags = CameraClearFlags.SolidColor;
        var light = new GameObject("Light").AddComponent<Light>();
        light.type = LightType.Directional;
        light.transform.rotation = Quaternion.Euler(50, -30, 0);
        var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
        cube.AddComponent<Snap>();
        System.IO.Directory.CreateDirectory("Assets/Scenes");
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Test.unity");

        var args = Environment.GetCommandLineArgs();
        var output = "build/StandaloneLinux64/Game";
        for (int i = 0; i < args.Length - 1; i++) if (args[i] == "-customBuildPath") output = args[i + 1];
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = new[] { "Assets/Scenes/Test.unity" },
            locationPathName = output,
            target = BuildTarget.StandaloneLinux64,
            options = BuildOptions.None,
        });
        Debug.Log("Build: " + report.summary.result + " -> " + output);
        if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) EditorApplication.Exit(1);
    }
}
