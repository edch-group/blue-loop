using System.Collections.Generic;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

/// <summary>
/// The map's tooltip (app.ts showTip, .kw-tip, as the battle's: BattleView.Tips), for what on the map has words of its
/// own (a Tip: data-tip, data-tip-title, data-tip-note), such as your emblems down the right. With a mouse, after a
/// 350 ms hover (KW_TIP_DELAY_MS), gone at once as the pointer leaves; on a touch screen, a tap shows it at once, for
/// 2.6 s (never on a button that does something: a press acts). A white popover (at most 260 wide, padded 8 × 12,
/// corners 12, shadowed 0 8 24 and ringed by a white hairline), centred over what it is about, 8 above it (under it, if
/// there is no room), kept 8 inside the page; fading in over 0.12 s. Its title (.tip-head: 0.62rem spaced capitals of
/// the display face, 0.16em, ink, 4 under it), its words (.tip-body: 0.76rem, 1.4 apart, ink, set as card text sets
/// them, cardTextHtml: each sentence a paragraph of its own, 0.55em between, its full stop dropped), a note
/// (.tip-note: 0.64rem, faint ink, 5 over it).
/// </summary>
public partial class CampaignView
{
    RectTransform tipBox;
    string tipKey;
    float tipSince, tipShown, tipUntil;
    bool tipTouch;
    static readonly List<RaycastResult> tipHits = new List<RaycastResult>();

    /// <summary>A relic's note in its tooltip (campaign.ts relicNote).</summary>
    static string RelicNote(Relic r)
    {
        if (string.IsNullOrEmpty(r.Power)) return "Hero card.";
        var kind = Relics.Powers.TryGetValue(r.Power, out var p) ? p.Kind : null;
        return kind == "once" ? "Once per battle." : kind == "ability" ? "Hero ability, one a day." : "";
    }

    /// <summary>What has words of its own at a point of the screen: the topmost thing there, if it is one (or is in one).</summary>
    static Tip TipAt(Vector2 screen)
    {
        var es = EventSystem.current;
        if (es == null) return null;
        tipHits.Clear();
        es.RaycastAll(new PointerEventData(es) { position = screen }, tipHits);
        if (tipHits.Count == 0) return null;
        var t = tipHits[0].gameObject.GetComponentInParent<Tip>();
        return t != null && t.isActiveAndEnabled && !string.IsNullOrEmpty(t.Text) ? t : null;
    }

    /// <summary>A tip's identity, kept as the map's top is made again under it (as the web's morph keeps the element).</summary>
    static string TipKey(Tip t) => t == null ? null : $"{t.Head}\n{t.Text}\n{t.Note}";

    void TipsTick()
    {
        float now = Time.time;
        if (Input.touchCount > 0)
        {
            tipTouch = true;
            var touch0 = Input.GetTouch(0);
            if (touch0.phase == TouchPhase.Began)
            {
                var t = TipAt(touch0.position);
                // (A button that does something acts on a press: only one that can't says why.)
                var b = t != null ? t.GetComponentInParent<Button>() : null;
                if (t == null) { HideCampaignTip(); tipKey = null; }
                else if (b == null || !b.interactable)
                {
                    tipKey = TipKey(t);
                    HideCampaignTip();
                    ShowCampaignTip(t);
                    tipUntil = now + 2.6f;
                }
            }
        }
        else if (!tipTouch && Input.mousePresent)
        {
            var t = TipAt(Input.mousePosition);
            var key = TipKey(t);
            if (key != tipKey)
            {
                tipKey = key;
                tipSince = now;
                tipUntil = float.MaxValue;
                HideCampaignTip();
            }
            else if (t != null && tipBox == null && now - tipSince >= 0.35f)
            {
                ShowCampaignTip(t);
                tipUntil = float.MaxValue;
            }
        }
        if (tipBox == null) return;
        if (now >= tipUntil) { HideCampaignTip(); tipKey = null; return; }
        // (Its fade in, opacity over 0.12 s.)
        tipBox.GetComponent<CanvasGroup>().alpha = Mathf.Clamp01((now - tipShown) / 0.12f);
    }

    void HideCampaignTip()
    {
        if (tipBox != null) Mats.Kill(tipBox.gameObject);
        tipBox = null;
    }

    void ShowCampaignTip(Tip about)
    {
        const float Z = WebLook.Zoom;
        float pw = tips.rect.width, ph = tips.rect.height;
        // (Where it is about, on the page: its corners in the tooltip's layer, from its top left.)
        var corners = new Vector3[4];
        ((RectTransform)about.transform).GetWorldCorners(corners);
        Vector2 a = tips.InverseTransformPoint(corners[0]), c = tips.InverseTransformPoint(corners[2]);
        var r = Rect.MinMaxRect(Mathf.Min(a.x, c.x) + pw / 2, ph / 2 - Mathf.Max(a.y, c.y), Mathf.Max(a.x, c.x) + pw / 2, ph / 2 - Mathf.Min(a.y, c.y));

        tipShown = Time.time;
        tipBox = Hud.Rect(tips, "Tooltip");
        var g = tipBox.gameObject.AddComponent<CanvasGroup>();
        g.alpha = 0;
        g.blocksRaycasts = false;
        g.interactable = false;
        var bg = WebLook.Rounded(tipBox, "Tip", Color.white, 12 * Z);
        Hud.Fill(bg.rectTransform);
        WebLook.Shadow(bg, 8 * Z, 24 * Z, new Color(60 / 255f, 64 / 255f, 90 / 255f, 0.2f), 12 * Z, 1 * Z, new Color(1, 1, 1, 0.9f));

        float most = (260 - 24) * Z, hs = 0.62f * 16 * Z, bs = 0.76f * 16 * Z, ns = 0.64f * 16 * Z;
        // Its words as card text sets them: each sentence a paragraph (its full stop dropped), 0.55em between.
        var paras = System.Text.RegularExpressions.Regex.Replace(about.Text, @"\.(\s+|$)", m => m.Groups[1].Length > 0 ? "\u0001" : "").Split('\u0001');
        TextMeshProUGUI head = null, note = null;
        var body = new TextMeshProUGUI[paras.Length];
        float w = 0;
        if (!string.IsNullOrEmpty(about.Head))
        {
            head = WebLook.Words(Hud.Rect(tipBox, "Head"), about.Head.ToUpperInvariant(), hs, 0.16f, Look.Ink, true, 500, TextAlignmentOptions.TopLeft);
            // (CSS letter-spacing trails the last letter too.)
            w = Mathf.Max(w, head.GetPreferredValues(head.text).x + 0.16f * hs);
        }
        for (int i = 0; i < paras.Length; i++)
        {
            body[i] = WebLook.Words(Hud.Rect(tipBox, "Body"), paras[i], bs, 0, Look.Ink, false, 400, TextAlignmentOptions.TopLeft);
            body[i].lineSpacing = (1.4f - 1.2f) * 100 / 1.2f;
            if (paras[i].Length > 0) w = Mathf.Max(w, body[i].GetPreferredValues(paras[i]).x + 1);
        }
        if (!string.IsNullOrEmpty(about.Note))
        {
            note = WebLook.Words(Hud.Rect(tipBox, "Note"), about.Note, ns, 0, Look.InkFaint, false, 400, TextAlignmentOptions.TopLeft);
            note.lineSpacing = (1.35f - 1.2f) * 100 / 1.2f;
            w = Mathf.Max(w, note.GetPreferredValues(note.text).x + 1);
        }
        w = Mathf.Min(most, w);
        float y = 8 * Z;
        float Set(TextMeshProUGUI t, float lineH)
        {
            t.textWrappingMode = TextWrappingModes.Normal;
            float h = t.text.Length == 0 ? 0 : Mathf.Max(lineH, t.GetPreferredValues(t.text, w, 0).y);
            WebLook.Box((RectTransform)t.transform.parent, 12 * Z, y, w, h);
            return h;
        }
        if (head != null) y += Set(head, hs * 1.35f) + 4 * Z;
        for (int i = 0; i < body.Length; i++)
        {
            if (i > 0) y += 0.55f * bs;
            y += Set(body[i], bs * 1.4f);
        }
        if (note != null) y += 5 * Z + Set(note, ns * 1.35f);
        float bw = w + 24 * Z, bh = y + 8 * Z;
        float x = Mathf.Max(8 * Z, Mathf.Min(pw - bw - 8 * Z, r.center.x - bw / 2));
        float top = r.yMin - bh - 8 * Z < 8 * Z ? r.yMax + 8 * Z : r.yMin - bh - 8 * Z;
        WebLook.Box(tipBox, x, top, bw, bh);
    }
}
