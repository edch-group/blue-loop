using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

/// <summary>Starts the game from nothing (the build's one scene is empty): a camera, the UI's canvas, a battle.</summary>
public static class Boot
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Start() => Create(out _).NewBattle(Random.Range(1, 100000));

    /// <summary>The camera, canvas and battle screen (also used by the editor's screenshots).</summary>
    public static BattleScreen Create(out Camera cam)
    {
        EngineData.Ensure();
        var camGo = new GameObject("Camera");
        cam = camGo.AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = Ui.Paper;
        cam.orthographic = true;

        if (Application.isPlaying) new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));

        var canvasGo = new GameObject("Canvas", typeof(RectTransform));
        var canvas = canvasGo.AddComponent<Canvas>();
        // (On the camera, not over the screen: so a camera rendered to a texture, as the screenshots are, shows it.)
        canvas.renderMode = RenderMode.ScreenSpaceCamera;
        canvas.worldCamera = cam;
        canvas.planeDistance = 1;
        var scaler = canvasGo.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(BattleScreen.W, BattleScreen.H);
        scaler.matchWidthOrHeight = 0.5f;
        canvasGo.AddComponent<GraphicRaycaster>();

        // The battle: in a box of the reference size, centred.
        var area = Ui.Rect(canvasGo.transform, "Battle");
        area.anchorMin = area.anchorMax = new Vector2(0.5f, 0.5f);
        area.pivot = new Vector2(0.5f, 0.5f);
        area.sizeDelta = new Vector2(BattleScreen.W, BattleScreen.H);
        return area.gameObject.AddComponent<BattleScreen>();
    }
}
