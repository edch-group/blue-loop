using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;

/// <summary>
/// The tag lying on the board under the Stellari (styles.css .galaxy-tag, app.ts renderGalaxyTag, placeGalaxyTag): a
/// campaign galaxy's trade-off (its name, and what it does in short), or a lesson's or challenge's name and what it
/// asks. It lies 66 px under the board's middle unless something there is in its way: then its name only, and if even
/// that is in the way, under "you", left of the Stellari, or under the day's phases, right of it; where nothing is
/// clear, not at all.
/// </summary>
public partial class Board
{
    /// <summary>A name (in capitals, spaced 0.24em) and the words under it, under the flower; null: none.</summary>
    public void SetTag(string name, string sub)
    {
        var l = L;
        if (tagName == null)
        {
            // (b: 600 weight, clamp(7px, 1.4vh, 11px), ink; span: clamp(7px, 1.3vh, 10px) spaced 0.04em, soft ink; both
            // the display face.)
            tagName = Mats.FlatText("Tag", decor, "", Px(Css.Clamp(7, 1.4f * l.Vh, 11)), Look.Ink, true, 600, 24);
            tagSub = Mats.FlatText("Tag words", decor, "", Px(Css.Clamp(7, 1.3f * l.Vh, 10)), Look.InkSoft, true, 400, 4);
        }
        tagName.text = name?.ToUpperInvariant() ?? "";
        tagSub.text = sub ?? "";
        PlaceTag();
    }

    /// <summary>app.ts placeGalaxyTag: the tag put where it is clear (see the class's summary).</summary>
    public void PlaceTag()
    {
        if (tagName == null) return;
        bool any = tagName.text != "";
        tagName.gameObject.SetActive(any);
        tagSub.gameObject.SetActive(false);
        if (!any) return;
        var l = L;
        // (@media (max-height: 560px): room for the name only, and the side places closer in.)
        bool shortScreen = l.H <= 560;
        foreach (var at in new[] { "under", "name", "side", "right" })
        {
            if (at == "under" && (shortScreen || tagSub.text == "")) continue;
            if (Lay(at, at == "under")) return;
        }
        tagName.gameObject.SetActive(false);
    }

    /// <summary>The tag laid out at a place (`full`: its words under its name too); whether it is clear there.</summary>
    bool Lay(string at, bool full)
    {
        var l = L;
        bool shortScreen = l.H <= 560;
        float fn = Css.Clamp(7, 1.4f * l.Vh, 11), fs = Css.Clamp(7, 1.3f * l.Vh, 10);
        float nameW = tagName.GetPreferredValues(tagName.text).x * l.Tcw, subW = full ? tagSub.GetPreferredValues(tagSub.text).x * l.Tcw : 0;
        // (At most min(46%, 300px) wide; its lines 1.25 apart, 1 px between.)
        float w = Mathf.Min(Mathf.Max(nameW, subW), Mathf.Min(0.46f * l.Gw, 300));
        float h = fn * 1.25f + (full ? 1 + fs * 1.25f : 0);
        float top, left;
        if (at == "side") { top = shortScreen ? 16 : 24; left = -(shortScreen ? 48 : 74) - w; }
        else if (at == "right") { top = shortScreen ? 26 : 36; left = shortScreen ? 48 : 74; }
        else { top = 66; left = -w / 2; }
        bool crowded = false;
        if (at == "under" || at == "name")
        {
            // Under the Stellari it keeps clear of your tableau's outline below: lifted as far as that takes, but never
            // up into the Stellari (its flower fills the inner 90% of its slot); still too close, it counts as in the way.
            float frameTop = -(MyRowZ + HeroOff / 2 + (1.4f + 2 * l.U(l.FramePad) + HeroOff) / 2) * l.Tcw;
            float need = top + h + 8 - frameTop;
            if (need > 0)
            {
                float room = top - (l.Star / 2 - l.Star * 0.05f) - 2;
                float lift = Mathf.Max(0, Mathf.Min(need, room));
                top -= lift;
                crowded = lift < need;
            }
        }
        var align = at == "side" ? TextAlignmentOptions.Right : at == "right" ? TextAlignmentOptions.Left : TextAlignmentOptions.Center;
        // (A flat text's box is 6 card widths across: its edge put at the tag's.)
        float x = at == "side" ? l.U(left + w) - 3 : at == "right" ? l.U(left) + 3 : 0;
        tagName.alignment = align;
        tagName.transform.localPosition = new Vector3(x, 0.01f, -l.U(top + fn * 0.625f));
        tagSub.alignment = align;
        tagSub.transform.localPosition = new Vector3(x, 0.01f, -l.U(top + fn * 1.25f + 1 + fs * 0.625f));
        tagSub.gameObject.SetActive(full);
        if (crowded) return false;
        return !Clash(new Rect(left, top, w, h));
    }

    /// <summary>Whether anything on the board lies within 2 px of the tag (in the board's pixels from its middle, y down).</summary>
    bool Clash(Rect t)
    {
        var l = L;
        var parts = new List<Rect>();
        // (Cards on the board.)
        foreach (var v in cards.Values)
        {
            if (v == null || !v.Table || !v.gameObject.activeInHierarchy) continue;
            var p = table.InverseTransformPoint(v.transform.position);
            parts.Add(new Rect((p.x - 0.5f) * l.Tcw, (-p.z - 0.7f) * l.Tcw, l.Tcw, 1.4f * l.Tcw));
        }
        // (The turn's words, and the day's phases with their dots.)
        foreach (var word in new[] { turnYou, turnThem }.Concat(phases ?? new TextMeshPro[0]))
        {
            if (word == null) continue;
            var p = word.transform.localPosition;
            float ww = word.GetPreferredValues(word.text).x, wh = l.U(l.PhaseFont * 1.15f);
            float x0 = word.alignment == TextAlignmentOptions.Right ? p.x + 3 - ww : word.alignment == TextAlignmentOptions.Left ? p.x - 3 : p.x - ww / 2;
            bool step = phases != null && phases.Contains(word);
            if (step) { float dotLeft = l.U(l.StellariR); ww += x0 - dotLeft; x0 = dotLeft; }
            parts.Add(new Rect(x0 * l.Tcw, (-p.z - wh / 2) * l.Tcw, ww * l.Tcw, wh * l.Tcw));
        }
        return parts.Any(r => r.xMin < t.xMax + 2 && r.xMax > t.xMin - 2 && r.yMin < t.yMax + 2 && r.yMax > t.yMin - 2);
    }
}
