using System;
using UnityEngine;

/// <summary>
/// The CI check that Unity runs at all: a few frames in, the camera is rendered into a texture and saved to the path
/// given as "-shot <path>", and the player quits. (Rendered straight from the camera, not read off the screen: a
/// virtual screen with no refresh rate never presents a frame.)
/// </summary>
public class Snap : MonoBehaviour
{
    int frames;

    void Awake()
    {
        QualitySettings.vSyncCount = 0;
        Application.targetFrameRate = 30;
    }

    void Update()
    {
        transform.Rotate(20 * Time.deltaTime, 40 * Time.deltaTime, 0);
        if (++frames != 10) return;
        var args = Environment.GetCommandLineArgs();
        var path = "shot.png";
        for (int i = 0; i < args.Length - 1; i++) if (args[i] == "-shot") path = args[i + 1];
        var cam = Camera.main != null ? Camera.main : FindFirstObjectByType<Camera>();
        var rt = new RenderTexture(1280, 720, 24);
        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;
        var tex = new Texture2D(1280, 720, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0);
        tex.Apply();
        System.IO.File.WriteAllBytes(path, tex.EncodeToPNG());
        Debug.Log("Saved " + path);
        Application.Quit();
    }
}
