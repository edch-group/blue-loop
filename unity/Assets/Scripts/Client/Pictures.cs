using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

/// <summary>
/// The game's baked pictures (card faces, card art, badges), by their path under Resources. In the
/// browser they are not packed into the game's data (far too big for it: a thousand card faces): the build moves them
/// to StreamingAssets, each its own file, with a list of what there is and how big (Resources/Engine/pictures.txt);
/// a picture asked for is handed back at once, blank at its own size, and filled in as it arrives.
/// </summary>
public static class Pictures
{
    static readonly Dictionary<string, Texture2D> cache = new Dictionary<string, Texture2D>();
    static Dictionary<string, (string file, int w, int h)> list;
    /// <summary>Pictures still on their way (handed back blank, not yet filled in).</summary>
    static readonly HashSet<Texture2D> waiting = new HashSet<Texture2D>();

    /// <summary>Whether a picture has arrived (a blank one still on its way has not).</summary>
    public static bool Ready(Texture2D t) => t != null && !waiting.Contains(t);

    /// <summary>How many pictures are still on their way (a screen made under the paper waits a moment for them).</summary>
    public static int Waiting => waiting.Count;

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

    /// <summary>
    /// A picture whose shape comes from a second (a card face: the jpg's colour, the png's alpha, both as the web drew
    /// them), with its smaller sizes made, so it stays smooth however small it is drawn.
    /// </summary>
    public static Texture2D Load(string path, string alphaPath)
    {
        if (cache.TryGetValue(path, out var t)) return t;
#if UNITY_WEBGL && !UNITY_EDITOR
        t = Fetch(path, alphaPath);
#else
        t = Resources.Load<Texture2D>(path);
#endif
        cache[path] = t;
        return t;
    }

#if UNITY_WEBGL && !UNITY_EDITOR
    static void Index()
    {
        if (list != null) return;
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

    static void Get(string file, System.Action<byte[]> done)
    {
        var request = UnityWebRequest.Get(Application.streamingAssetsPath + "/" + file);
        request.SendWebRequest().completed += _ =>
        {
            done(request.result == UnityWebRequest.Result.Success ? request.downloadHandler.data : null);
            request.Dispose();
        };
    }

    static Texture2D Fetch(string path)
    {
        Index();
        // (What was left in the game's data, as ever.)
        if (!list.TryGetValue(path, out var found)) return Resources.Load<Texture2D>(path);
        var t = new Texture2D(found.w, found.h, TextureFormat.RGBA32, false);
        var blank = new Color32[found.w * found.h];
        t.SetPixels32(blank);
        t.Apply();
        waiting.Add(t);
        Get(found.file, data => { if (data != null) t.LoadImage(data, false); waiting.Remove(t); });
        return t;
    }

    static Texture2D Fetch(string path, string alphaPath)
    {
        Index();
        if (!list.TryGetValue(path, out var found) || !list.TryGetValue(alphaPath, out var shape)) return Fetch(path);
        // (Leaning to its sharper sizes: a card's words stay crisp drawn small, as the web's are.)
        var t = new Texture2D(found.w, found.h, TextureFormat.RGBA32, true) { filterMode = FilterMode.Trilinear, mipMapBias = -0.5f };
        t.SetPixels32(new Color32[found.w * found.h]);
        t.Apply(true);
        waiting.Add(t);
        byte[] colour = null, alpha = null;
        int left = 2;
        void Arrived()
        {
            if (--left > 0) return;
            waiting.Remove(t);
            if (colour == null) return;
            var c = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            c.LoadImage(colour, false);
            var px = c.GetPixels32();
            int w = c.width, h = c.height;
            Object.Destroy(c);
            if (alpha != null)
            {
                var a = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                a.LoadImage(alpha, false);
                var ap = a.GetPixels32();
                Object.Destroy(a);
                // (The jpg was taken on white: its edge undone from it, as the web's card has it.)
                if (ap.Length == px.Length)
                    for (int i = 0; i < px.Length; i++)
                    {
                        int k = ap[i].a;
                        if (k == 255) continue;
                        if (k == 0) { px[i] = new Color32(0, 0, 0, 0); continue; }
                        px[i] = new Color32(Unblend(px[i].r, k), Unblend(px[i].g, k), Unblend(px[i].b, k), (byte)k);
                    }
            }
            if (w != t.width || h != t.height) t.Reinitialize(w, h);
            t.SetPixels32(px);
            t.Apply(true);
        }
        Get(found.file, d => { colour = d; Arrived(); });
        Get(shape.file, d => { alpha = d; Arrived(); });
        return t;
    }

    static byte Unblend(byte c, int a) => (byte)Mathf.Clamp(Mathf.RoundToInt((c - (255 - a)) * 255f / a), 0, 255);
#endif
}
