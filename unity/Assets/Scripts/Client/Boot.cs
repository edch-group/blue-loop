using UnityEngine;

/// <summary>Starts the game from nothing (the build's one scene is empty): the engine's data, then a battle.</summary>
public static class Boot
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Start()
    {
        Application.targetFrameRate = 60;
        QualitySettings.antiAliasing = 4;
        EngineData.Ensure();
        BattleView.Make().NewBattle(Random.Range(1, 100000));
    }
}
