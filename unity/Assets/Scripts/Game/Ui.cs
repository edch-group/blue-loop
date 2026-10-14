using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.UI;

/// <summary>uGUI built from code: panels, text, buttons, and the game's colours.</summary>
public static class Ui
{
    public static Font Font => font ??= Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
    static Font font;

    public static readonly Color Paper = new Color(0.95f, 0.95f, 0.96f);
    public static readonly Color Ink = new Color(0.16f, 0.18f, 0.24f);
    public static readonly Color InkSoft = new Color(0.42f, 0.45f, 0.53f);
    public static readonly Color Heat = new Color(0.85f, 0.39f, 0.29f);
    public static readonly Color Stability = new Color(0.85f, 0.65f, 0.24f);
    public static readonly Color Cool = new Color(0.37f, 0.56f, 0.85f);
    public static readonly Color Good = new Color(0.36f, 0.68f, 0.49f);

    public static RectTransform Rect(Transform parent, string name)
    {
        var go = new GameObject(name, typeof(RectTransform));
        go.transform.SetParent(parent, false);
        return (RectTransform)go.transform;
    }

    /// <summary>Placed by its top-left corner and size, in the parent's units (y down).</summary>
    public static RectTransform Place(RectTransform r, float x, float y, float w, float h)
    {
        r.anchorMin = r.anchorMax = new Vector2(0, 1);
        r.pivot = new Vector2(0, 1);
        r.anchoredPosition = new Vector2(x, -y);
        r.sizeDelta = new Vector2(w, h);
        return r;
    }

    /// <summary>Filling its parent, inset.</summary>
    public static RectTransform Fill(RectTransform r, float inset = 0)
    {
        r.anchorMin = Vector2.zero;
        r.anchorMax = Vector2.one;
        r.offsetMin = new Vector2(inset, inset);
        r.offsetMax = new Vector2(-inset, -inset);
        return r;
    }

    public static Image Panel(Transform parent, string name, Color color)
    {
        var img = Rect(parent, name).gameObject.AddComponent<Image>();
        img.color = color;
        return img;
    }

    public static Text Label(Transform parent, string text, int size, Color color, TextAnchor align = TextAnchor.MiddleLeft, FontStyle style = FontStyle.Normal)
    {
        var t = Rect(parent, "Text").gameObject.AddComponent<Text>();
        t.font = Font;
        t.text = text;
        t.fontSize = size;
        t.color = color;
        t.alignment = align;
        t.fontStyle = style;
        t.horizontalOverflow = HorizontalWrapMode.Wrap;
        t.verticalOverflow = VerticalWrapMode.Truncate;
        t.raycastTarget = false;
        return t;
    }

    public static Button Button(Transform parent, string text, System.Action onClick, Color? bg = null, int size = 20)
    {
        var img = Panel(parent, "Button", bg ?? Color.white);
        var b = img.gameObject.AddComponent<Button>();
        b.onClick.AddListener(() => onClick());
        var label = Label(img.transform, text, size, Ink, TextAnchor.MiddleCenter, FontStyle.Bold);
        Fill(label.rectTransform, 4);
        return b;
    }

    /// <summary>A card's words as plain text: its keywords ({heat:2}, {sturdy:1}, {dawn}…) written out.</summary>
    public static string CardText(string text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        text = Regex.Replace(text, @"\{sing:([^}]*)\}", "\n* $1: ");
        text = Regex.Replace(text, @"\{options:([^}]*)\}", m => string.Join(" / ", m.Groups[1].Value.Split('|')));
        text = Regex.Replace(text, @"\{([a-zA-Z]+)(?::([^}]*))?\}", m =>
        {
            var k = m.Groups[1].Value;
            var v = m.Groups[2].Success ? " " + m.Groups[2].Value.Split('/')[0] : "";
            return char.ToUpper(k[0]) + k.Substring(1) + v;
        });
        return text.Replace("—", "-").Replace("−", "-").Replace("·", "-");
    }
}
