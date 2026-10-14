using System;
using System.Collections;
using UnityEngine;

/// <summary>
/// The CI check that Unity runs at all: a few frames in, the screen is saved to the path given as "-shot <path>",
/// and the player quits.
/// </summary>
public class Snap : MonoBehaviour
{
    IEnumerator Start()
    {
        for (int i = 0; i < 10; i++) yield return new WaitForEndOfFrame();
        var args = Environment.GetCommandLineArgs();
        var path = "shot.png";
        for (int i = 0; i < args.Length - 1; i++) if (args[i] == "-shot") path = args[i + 1];
        var tex = ScreenCapture.CaptureScreenshotAsTexture();
        System.IO.File.WriteAllBytes(path, tex.EncodeToPNG());
        Debug.Log("Saved " + path);
        Application.Quit();
    }

    void Update()
    {
        transform.Rotate(0, 40 * Time.deltaTime, 0);
    }
}
