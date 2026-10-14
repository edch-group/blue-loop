using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

/// <summary>
/// The game's baked pictures (card faces, card art, the glossary's pages), by their path under Resources. In the
/// browser they are not packed into the game's data (far too big for it: a thousand card faces): the build moves them
/// to StreamingAssets, each its own file, with a list of what there is and how big (Resources/Engine/pictures.txt);
/// a picture asked for is handed back at once, blank at its own size, and filled in as it arrives.
/// </summary>
public static class Pictures
{
    static readonly Dictionary<string, Texture2D> cache = new Dictionary<string, Texture2D>();
    static Dictionary<string, (string file, int w, int h)> list;

    public static Texture2D Load(string path)
    {
        if (cache.TryGetValue(path, out var t)) return t;
#if UNITY_WEBGL && !UNITY_EDITOR
        t = Fetch(path);
#else
        t = Resources.Load<Texture2D>(path);
#endif
        cache[path] = t;
        return t;
    }

#if UNITY_WEBGL && !UNITY_EDITOR
    static Texture2D Fetch(string path)
    {
        if (list == null)
        {
            list = new Dictionary<string, (string, int, int)>();
            var text = Resources.Load<TextAsset>("Engine/pictures");
            // (Each line: the file under StreamingAssets, its width and height.)
            if (text != null)
                foreach (var line in text.text.Split('\n'))
                {
                    var parts = line.Trim().Split(' ');
                    if (parts.Length < 3) continue;
                    var file = parts[0];
                    var key = file.Substring(0, file.LastIndexOf('.'));
                    list[key] = (file, int.Parse(parts[1]), int.Parse(parts[2]));
                }
        }
        // (What was left in the game's data, as ever.)
        if (!list.TryGetValue(path, out var found)) return Resources.Load<Texture2D>(path);
        var t = new Texture2D(found.w, found.h, TextureFormat.RGBA32, false);
        var blank = new Color32[found.w * found.h];
        t.SetPixels32(blank);
        t.Apply();
        var request = UnityWebRequest.Get(Application.streamingAssetsPath + "/" + found.file);
        request.SendWebRequest().completed += _ =>
        {
            if (request.result == UnityWebRequest.Result.Success) t.LoadImage(request.downloadHandler.data, false);
            request.Dispose();
        };
        return t;
    }
#endif
}
