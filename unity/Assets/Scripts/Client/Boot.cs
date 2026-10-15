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
        // (The build's scene is empty; one opened in the editor may hold a camera of its own, which would draw its sky
        // over the game's cameras.)
        foreach (var c in Object.FindObjectsByType<Camera>(FindObjectsSortMode.None)) c.gameObject.SetActive(false);
        App.Make().Menu("title");
    }
}
