using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Heroes' lines (voice.ts): as a Hero takes the field it says one of its lines (never the one it said last), shown
/// as a caption above its card, and spoken when that line has been recorded (Resources/Sound/Voice/&lt;id&gt;-&lt;line&gt;).
/// </summary>
public static class Voices
{
    static Dictionary<string, List<string>> lines;
    static readonly Dictionary<string, int> last = new Dictionary<string, int>();
    static GameObject caption;

    static Dictionary<string, List<string>> Lines => lines ??= Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, List<string>>>(Resources.Load<TextAsset>("Engine/voices").text);

    /// <summary>A Hero's line, beside the point `at` on the canvas (in its own coordinates).</summary>
    public static void Speak(string defId, RectTransform canvas, Vector2 at, bool below)
    {
        if (!Lines.TryGetValue(defId.Split('@')[0], out var says) || says.Count == 0) return;
        int n = says.Count;
        int i = Random.Range(0, n);
        if (n > 1 && last.TryGetValue(defId, out var was) && was == i) i = (i + 1) % n;
        last[defId] = i;
        Show(says[i], canvas, at, below);
        var clip = Resources.Load<AudioClip>($"Sound/Voice/{defId}-{i}");
        if (clip != null) Sound.PlayClip(clip);
    }

    static void Show(string text, RectTransform canvas, Vector2 at, bool below)
    {
        if (caption != null) Mats.Kill(caption);
        // (As the web's .hero-line: a white rounded card, italic, centred, up to 355 wide, above the card or below it.)
        var r = Hud.Rect(canvas, "Hero line");
        r.anchorMin = r.anchorMax = new Vector2(0.5f, 0.5f);
        r.pivot = new Vector2(0.5f, below ? 1 : 0);
        r.anchoredPosition = at + new Vector2(0, below ? -10 : 10);
        var bg = r.gameObject.AddComponent<Image>();
        bg.sprite = Hud.Rounded;
        bg.type = Image.Type.Sliced;
        bg.color = new Color(1, 1, 1, 0.94f);
        bg.raycastTarget = false;
        var t = Hud.Label(r, $"“{text}”", 15, Look.Ink, false, 400, 0);
        t.fontStyle = FontStyles.Italic;
        t.textWrappingMode = TextWrappingModes.Normal;
        t.margin = new Vector4(16, 9, 16, 9);
        var size = t.GetPreferredValues(text, 355 - 32, 0);
        r.sizeDelta = new Vector2(Mathf.Min(355, size.x + 36), size.y + 20);
        caption = r.gameObject;
        caption.AddComponent<Fade>().Life = 2.6f + text.Length * 0.03f;
    }

    class Fade : MonoBehaviour
    {
        public float Life;
        float age;
        CanvasGroup group;
        void Awake() => group = gameObject.AddComponent<CanvasGroup>();
        void Update()
        {
            age += Time.deltaTime;
            group.alpha = Mathf.Clamp01(Mathf.Min(age / 0.35f, (Life + 0.4f - age) / 0.4f));
            if (age > Life + 0.4f) Mats.Kill(gameObject);
        }
    }
}
