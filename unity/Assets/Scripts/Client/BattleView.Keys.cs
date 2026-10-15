using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The battle's keys and the pointer's paper (app.ts onKey, setPeek, onHover): Escape backs out of whatever is open
/// (or, with nothing open, brings up the settings); Space held looks past a mid-move overlay at the board (as the "view
/// board" button does); cards rustle like paper as the pointer comes onto them.
/// </summary>
public partial class BattleView
{
    // ---- Escape ----

    /// <summary>Each frame (Enter is EndDayTick's): Escape, and Space held to look past an overlay.</summary>
    void KeysTick()
    {
        if (Input.GetKeyDown(KeyCode.Space) && CanPeek())
        {
            peekHeld = true;
            SetPeek(true);
        }
        if (Input.GetKeyUp(KeyCode.Space) && peekHeld)
        {
            peekHeld = false;
            SetPeek(false);
        }
        SyncPeek();
        if (Input.GetKeyDown(KeyCode.Escape)) Escape();
    }

    /// <summary>app.ts onKey's Escape: the innermost thing open closed, one at a time.</summary>
    void Escape()
    {
        if (peeking) { SetPeek(false); return; }
        if (discarding != null)
        {
            discarding = null;
            Refresh();
            return;
        }
        // (Zoomed onto a tableau, with nothing else open: back out of it.)
        if (zoom != null && !inspector.gameObject.activeSelf && pending == null && sheet == null) { SetBoardZoom(null); return; }
        if (pending != null || attacker != null || sheet != null || inspector.gameObject.activeSelf)
        {
            pending = null;
            attacker = null;
            CloseSheet();
            inspector.gameObject.SetActive(false);
            Refresh();
            return;
        }
        // Nothing to close: the settings (in a battle, its menu).
        if (stage == null && landing == null) Settings();
    }

    // ---- Looking past an overlay ----

    bool peeking, peekHeld;
    RectTransform peekShield, peekToggle;

    /// <summary>
    /// app.ts canPeek: an overlay is up that the player must answer mid-move and can't back out of (one with a cancel
    /// button is just cancelled instead, as are sheets opened and closed at will).
    /// </summary>
    bool CanPeek() => state != null && pending != null && sheet == null && choiceView != null && !HasCancel(choiceView);

    static bool HasCancel(Transform t)
    {
        foreach (Transform c in t)
            if (c.name.ToLowerInvariant() == "cancel" || HasCancel(c)) return true;
        return false;
    }

    /// <summary>app.ts setPeek: the overlay faded away (kept in place) so the board can be studied; a tap anywhere brings it back.</summary>
    void SetPeek(bool on)
    {
        peeking = on && CanPeek();
        SyncPeek();
    }

    /// <summary>
    /// app.ts syncPeek: the view-board toggle shown while a mid-move choice is up (.peek-toggle: a white pill centred 10 px
    /// over the page's foot padding, 7 × 14 padded, its words 500 11px spaced 0.12em; peeking, ringed blue); peeking
    /// dropped once the overlay is gone.
    /// </summary>
    void SyncPeek()
    {
        bool open = CanPeek();
        if (!open) peeking = false;
        if (choiceView != null)
        {
            var g = choiceView.GetComponent<CanvasGroup>() ?? choiceView.gameObject.AddComponent<CanvasGroup>();
            // (.overlay: opacity over 0.25 s; peeking, it takes no taps.)
            g.alpha = Mathf.MoveTowards(g.alpha, peeking ? 0 : 1, Time.deltaTime / 0.25f);
            g.blocksRaycasts = !peeking;
        }
        string key = open ? (peeking ? "back" : "view") : null;
        if (peekToggle != null && peekToggle.name == "Peek " + key) return;
        if (peekToggle != null) Mats.Kill(peekToggle.gameObject);
        if (peekShield != null) Mats.Kill(peekShield.gameObject);
        peekToggle = peekShield = null;
        if (key == null) return;
        var l = BoardLayout.Current;
        if (peeking)
        {
            // (.peek-shield: the whole page, over the overlay: a tap brings it back.)
            peekShield = Hud.Rect(hud.transform, "Peek shield");
            Hud.Fill(peekShield);
            peekShield.gameObject.AddComponent<Image>().color = new Color(1, 1, 1, 0);
            peekShield.gameObject.AddComponent<Button>().onClick.AddListener(() => SetPeek(false));
        }
        string words = peeking ? "◉ BACK" : "◎ VIEW BOARD";
        float w = Hud.Wide(words, 11, 500, 12, 14) + 2, h = 11 + 14 + 2;
        var pill = Hud.Box(hud.transform, "Peek " + key, new Color(1, 1, 1, 0.92f), h / 2);
        pill.raycastTarget = true;
        var drops = peeking
            ? new[] { new Hud.Drop(Hud.Rgba(120, 150, 220, 0.5f), 0, 0, 2), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.18f), 4, 14) }
            : new[] { new Hud.Drop(new Color(1, 1, 1, 0.9f), 0, 0, 1), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.18f), 4, 14) };
        Hud.Shadow(pill, h / 2, drops);
        peekToggle = (RectTransform)pill.transform;
        Hud.At(peekToggle, new Vector2(0.5f, 0), new Vector2(0, l.PadB + 10), new Vector2(w, h));
        Hud.Label(peekToggle, words, 11, Look.Ink, true, 500, 12);
        pill.gameObject.AddComponent<Button>().onClick.AddListener(() => SetPeek(!peeking));
        peekToggle.SetAsLastSibling();
    }

    // ---- Paper ----

    string rustledOver;

    /// <summary>app.ts onHover: with a mouse, a card (in the hand, on the table) rustles as the pointer comes onto it.</summary>
    void HoverRustle()
    {
        if (touch || Cam == null) return;
        string over = null;
        if (!OverHud() && Physics.Raycast(Cam.ScreenPointToRay(Input.mousePosition), out var hit, 100))
            over = hit.collider.GetComponentInParent<CardView>()?.Uid;
        if (over != null && over != rustledOver) Sound.Play("rustle");
        rustledOver = over;
    }
}
