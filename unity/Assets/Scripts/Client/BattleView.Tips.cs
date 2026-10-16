using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

/// <summary>
/// Words a part of the screen says about itself under a mouse (the web's title and data-tip), shown by the battle's
/// tooltip (BattleView.Tips; on the campaign's map, CampaignView.Tips). `Head`: a data-tip's title, if any; `Note`: its
/// data-tip-note, if any (the campaign's tooltip shows it).
/// </summary>
public class Tip : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler
{
    public string Text, Head, Note;
    public static Tip Over;
    public void OnPointerEnter(PointerEventData e) => Over = this;
    public void OnPointerExit(PointerEventData e) { if (Over == this) Over = null; }
    void OnDisable() { if (Over == this) Over = null; }
}

/// <summary>
/// The tooltip (app.ts's .kw-tip, for data-tip and title alike): after a 350 ms hover (KW_TIP_DELAY_MS), a white
/// popover (at most 260 wide, padded 8 × 12, corners 12, a soft shadow and a white hairline) centred over what it is
/// about, 8 above it (under it, if there is no room), kept 8 inside the page; a data-tip's title over its words
/// (.tip-head: 9.92 px capitals spaced 0.16em; .tip-body 12.16 px, 1.4 apart), a title's words alone (11.52 px, soft
/// ink, 1.35 apart). Gone at once as the pointer leaves. With a mouse only: a touch screen has none.
/// </summary>
public partial class BattleView
{
    RectTransform tipBox;
    object tipFor;
    float tipSince;

    /// <summary>The HUD's own words (its buttons' titles), put on it as it is made.</summary>
    void HudTips()
    {
        void On(string name, string text)
        {
            var t = chrome.Find(name);
            if (t != null) (t.GetComponent<Tip>() ?? t.gameObject.AddComponent<Tip>()).Text = text;
        }
        On("Corner log", "Game log");
        On("Corner fullscreen", Screen.fullScreen ? "Leave fullscreen" : "Fullscreen");
        On("Corner settings", "Settings");
        var pace = chrome.Find("Pace");
        if (pace != null)
        {
            string[] tips = { "Each of your rival's cards waits for your OK", "Your rival's cards show a moment, then land by themselves", "Auto, and Lightspeed replies let pass, until the day ends" };
            string[] names = { "Normal", "Auto", "Skip" };
            for (int i = 0; i < 3; i++)
            {
                var seg = pace.Find(names[i]);
                if (seg != null) (seg.GetComponent<Tip>() ?? seg.gameObject.AddComponent<Tip>()).Text = tips[i];
            }
        }
    }

    /// <summary>What the board's own button under the pointer says (its title in app.ts renderPiles, the round ring, the eyes).</summary>
    string BoardTip(BoardHit hit)
    {
        var p = hit.Mine ? Me : Rival;
        bool mine = hit.Mine;
        switch (hit.Act)
        {
            case "deck": return mine ? $"{p.Deck.Count} cards left in your deck (what they are, and their order, stay hidden)" : $"{p.Deck.Count} cards left in {p.Name}'s deck";
            case "discard": return $"{(mine ? "Your" : $"{p.Name}'s")} reserves ({p.Discard.Count}): look through them";
            case "wreck": return $"{(mine ? "Your" : $"{p.Name}'s")} wreckage ({p.Wreck?.Count ?? 0}): what was discarded waits here, and two cards a dawn (the top ones) go on to the reserves";
            case "hand": return mine ? "Cards in your hand" : $"Cards in {p.Name}'s hand";
            case "name": return mine ? $"{p.Name} (you)" : p.Name;
            case "eye": return $"Look closely at {(mine ? "your" : "their")} tableau (or double-tap it; pinch on a phone)";
            case "round":
            {
                int total = Balance.InstabilityStartsRound - 1, remaining = Mathf.Max(0, total - (state.Round - 1));
                int instab = Game.InstabilityHeat(state), next = Game.InstabilityHeat(new GameState { Round = state.Round + 1 });
                return instab > 0
                    ? $"Round {state.Round}. Regional instability: every sun heats by {instab} at its dawn this round, and by {next} next round."
                    : $"Round {state.Round}. Regional stability {remaining}: it drains by one each round; when it runs out, every sun heats at its dawn.";
            }
        }
        return null;
    }

    void TipsTick()
    {
        // (A touch screen: no tooltips, as the web's hover ones.)
        if (touch || Input.touchCount > 0 || Input.GetMouseButton(0)) { HideTip(); tipFor = null; return; }
        object over = null;
        string head = null, text = null;
        Rect box = default;
        if (Tip.Over != null && Tip.Over.isActiveAndEnabled && !string.IsNullOrEmpty(Tip.Over.Text))
        {
            over = Tip.Over;
            text = Tip.Over.Text;
            head = Tip.Over.Head;
            box = PageRect((RectTransform)Tip.Over.transform);
        }
        else if (!OverHud() && state != null && Physics.Raycast(Cam.ScreenPointToRay(Input.mousePosition), out var hit, 100))
        {
            var bh = hit.collider.GetComponent<BoardHit>();
            if (bh != null && bh.gameObject.activeInHierarchy)
            {
                over = bh;
                text = BoardTip(bh);
                box = PageRect(hit.collider.bounds);
            }
        }
        if (over != tipFor)
        {
            tipFor = over;
            tipSince = Time.time;
            HideTip();
            return;
        }
        if (over == null || text == null || Time.time - tipSince < 0.35f) return;
        if (tipBox == null) ShowTip(head, text, box);
        else
        {
            // (Its fade in, opacity over 0.12 s.)
            var g = tipBox.GetComponent<CanvasGroup>();
            g.alpha = Mathf.Clamp01((Time.time - tipSince - 0.35f) / 0.12f);
        }
    }

    void HideTip()
    {
        if (tipBox != null) Mats.Kill(tipBox.gameObject);
        tipBox = null;
    }

    void ShowTip(string head, string text, Rect r)
    {
        var l = BoardLayout.Current;
        tipBox = Hud.Rect(hud.transform, "Tooltip");
        tipBox.SetAsLastSibling();
        var g = tipBox.gameObject.AddComponent<CanvasGroup>();
        g.alpha = 0;
        g.blocksRaycasts = false;
        var bg = Hud.Box(tipBox, "Tip", Color.white, 12);
        Hud.Fill(bg.rectTransform);
        Hud.Shadow(bg, 12, new Hud.Drop(new Color(1, 1, 1, 0.9f), 0, 0, 1), new Hud.Drop(Hud.Rgba(60, 64, 90, 0.2f), 8, 24));
        float size = head != null ? 12.16f : 11.52f, lh = head != null ? 1.4f : 1.35f;
        var t = Hud.Rect(tipBox, "Words");
        var tt = t.gameObject.AddComponent<TextMeshProUGUI>();
        Look.Style(tt, size, head != null ? Look.Ink : Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
        tt.lineSpacing = (lh - 1.2f) * 100;
        tt.text = text;
        float most = 260 - 24, w = Mathf.Min(most, tt.GetPreferredValues(text).x + 1);
        tt.textWrappingMode = TextWrappingModes.Normal;
        float th = tt.GetPreferredValues(text, w, 0).y, y = 8;
        float headH = 0;
        if (head != null)
        {
            string hw = head.ToUpperInvariant();
            w = Mathf.Max(w, Mathf.Min(most, MenuKit.TextW(hw, 9.92f, 500, 0.16f) + 0.16f * 9.92f));
            headH = MenuKit.LineH(9.92f);
            MenuKit.Words(tipBox, hw, 12, 8, w, headH, 9.92f, Look.Ink, true, 500, 0.16f, TextAlignmentOptions.Left);
            y += headH + 4;
        }
        Hud.Place(t, 12, y, w, th);
        float bw = w + 24, bh = y + th + 8;
        float x = Mathf.Max(8, Mathf.Min(l.W - bw - 8, r.center.x - bw / 2));
        float top = r.yMin - bh - 8 < 8 ? r.yMax + 8 : r.yMin - bh - 8;
        Hud.Place(tipBox, x, top, bw, bh);
    }

    /// <summary>A rect of the HUD as a rect of the page (layout pixels, y down).</summary>
    Rect PageRect(RectTransform r)
    {
        var corners = new Vector3[4];
        r.GetWorldCorners(corners);
        var cam = hud.worldCamera;
        Vector2 a = Page(RectTransformUtility.WorldToScreenPoint(cam, corners[0])), b = Page(RectTransformUtility.WorldToScreenPoint(cam, corners[2]));
        return Rect.MinMaxRect(Mathf.Min(a.x, b.x), Mathf.Min(a.y, b.y), Mathf.Max(a.x, b.x), Mathf.Max(a.y, b.y));
    }

    /// <summary>A box on the table as a rect of the page (its corners as the camera sees them).</summary>
    Rect PageRect(Bounds bounds)
    {
        float x0 = float.MaxValue, y0 = float.MaxValue, x1 = float.MinValue, y1 = float.MinValue;
        for (int i = 0; i < 8; i++)
        {
            var c = bounds.center + Vector3.Scale(bounds.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
            var p = Page(Cam.WorldToScreenPoint(c));
            x0 = Mathf.Min(x0, p.x);
            y0 = Mathf.Min(y0, p.y);
            x1 = Mathf.Max(x1, p.x);
            y1 = Mathf.Max(y1, p.y);
        }
        return Rect.MinMaxRect(x0, y0, x1, y1);
    }
}
