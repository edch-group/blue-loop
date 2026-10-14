using UnityEngine;

/// <summary>Starts the game from nothing (the build's one scene is empty): the engine's data, then the title page.</summary>
public static class Boot
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Start()
    {
        Application.targetFrameRate = 60;
        QualitySettings.antiAliasing = 4;
        EngineData.Ensure();
        App.Make().Menu("title");
    }
}
