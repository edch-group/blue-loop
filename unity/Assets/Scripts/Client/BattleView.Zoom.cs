using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Zooming the board onto one tableau (app.ts setBoardZoom, zoomTransform; styles.css .table-view.zoom-*): the board
/// is not laid out again, it is moved and scaled as a whole (its transform, eased over 0.45 s): laid flat, scaled so
/// that side's row, Hero and trap span the window (76 px clear either side, 94% of the height above the hand's peeking
/// strip), centred. Everything else steps out of the way but the zoom's own buttons (back, and across to the other
/// side) and the hand's tops. By a tableau's eye, a double-tap on the open table, or a pinch; out again as the turn
/// passes.
/// </summary>
public partial class BattleView
{
    /// <summary>The tableau zoomed onto: "mine", "rival", or none.</summary>
    string zoom;
    /// <summary>The board's transform now and where it is going (translate, tilt, scale: as CSS interpolates them), and since when.</summary>
    Vector2 zoomT, zoomFromT;
    float zoomTilt = 22, zoomFromTilt = 22, zoomScale = 0.82f, zoomFromScale = 0.82f, zoomAt = -10;
    bool zoomMoving;
    RectTransform zoomCtl;
    string zoomTurn;
    float zoomFade = 1;
    float lastTapAt = -10;
    Vector3 lastTapPos;
    float pinchFrom;
    float pinchY;

    /// <summary>The board zoomed onto a side, or out (null).</summary>
    void SetBoardZoom(string side)
    {
        if (zoom == side) return;
        // (From wherever it stands now: a CSS transition interrupted starts from there.)
        var (t, tilt, scale) = ZoomNow();
        zoomFromT = t;
        zoomFromTilt = tilt;
        zoomFromScale = scale;
        zoomAt = Time.time;
        zoomMoving = true;
        zoom = side;
        Sound.Play("hover");
        Board.Zoomed = side != null;
        Board.ZoomLook(side != null);
        ZoomControls();
        if (state != null) Refresh();
    }

    /// <summary>The board's transform where it rests: flat (the default tipped 22° and shrunk to 0.82, a vh up, down on a phone), or zoomed onto `side`.</summary>
    (Vector2 t, float tilt, float scale) ZoomRest(string side)
    {
        var l = BoardLayout.Current;
        if (side == null) return (new Vector2(0, l.Phone ? l.Vh : -l.Vh), 22, 0.82f);
        bool mine = side == "mine";
        // The tableau's span on the board (its row of six, its Hero's slot beyond it), in the board's pixels.
        float left = l.RowLeft, right = l.RowLeft + 6 * l.Tcw + 5 * l.SlotGap, hero = 1.4f * l.Tcw + l.FramePad + 4;
        float rowCy = mine ? l.MyRowCy : l.RivalRowCy;
        float top = mine ? rowCy - hero - 0.7f * l.Tcw : rowCy - 0.7f * l.Tcw, bottom = mine ? rowCy + 0.7f * l.Tcw : rowCy + hero + 0.7f * l.Tcw;
        // (Above the hand's peeking tops: 60% of a hand card's height.)
        float h = l.H - Mathf.Round(l.HandCard * 1.4f * 0.6f);
        float k = Mathf.Min((l.W - 2 * 76) / (right - left), h * 0.94f / (bottom - top));
        // (Flat, the span's middle at the window's: page = box + O + t + k (p − O), O the box's middle.)
        var o = new Vector2(l.Gw / 2, l.GameH / 2);
        var c = new Vector2((left + right) / 2, (top + bottom) / 2);
        var t = new Vector2(l.W / 2, h / 2) - new Vector2(l.GameLeft, l.GameTop) - o - k * (c - o);
        return (t, 0, k);
    }

    /// <summary>The transform as it stands this moment (cubic-bezier(0.2, 0.8, 0.2, 1) over 0.45 s from where it was).</summary>
    (Vector2 t, float tilt, float scale) ZoomNow()
    {
        var to = ZoomRest(zoom);
        float k = Mathf.Clamp01((Time.time - zoomAt) / 0.45f), e = Bezier(k, 0.2f, 0.8f, 0.2f, 1);
        return (Vector2.Lerp(zoomFromT, to.t, e), Mathf.Lerp(zoomFromTilt, to.tilt, e), Mathf.Lerp(zoomFromScale, to.scale, e));
    }

    /// <summary>A CSS cubic-bezier(x1, y1, x2, y2) at k.</summary>
    static float Bezier(float k, float x1, float y1, float x2, float y2)
    {
        if (k <= 0) return 0;
        if (k >= 1) return 1;
        float B(float t, float a, float b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
        float D(float t, float a, float b) => 3 * (1 - t) * (1 - t) * a + 6 * (1 - t) * t * (b - a) + 3 * t * t * (1 - b);
        float u = k;
        for (int i = 0; i < 8; i++)
        {
            float dx = D(u, x1, x2);
            if (Mathf.Abs(dx) < 1e-5f) break;
            u = Mathf.Clamp01(u - (B(u, x1, x2) - k) / dx);
        }
        return B(u, y1, y2);
    }

    /// <summary>
    /// The camera for the board under a transform (BoardLayout.Frame, its translate, tilt and scale given): a table
    /// point u lies on the page at b + s·R·(u.x, −u.z, u.y), seen from the web's eye in its perspective.
    /// </summary>
    static void FrameAt(Camera cam, BoardLayout l, Vector2 tr, float tiltDeg, float scale)
    {
        float tilt = tiltDeg * Mathf.Deg2Rad, cos = Mathf.Cos(tilt), sin = Mathf.Sin(tilt);
        float s = scale * l.Tcw, persp = 200 * l.Vh;
        var centre = new Vector3(l.GameLeft + l.Gw / 2 + tr.x, l.GameTop + l.GameH / 2 + tr.y, 0);
        float dy = scale * (l.PlaneCy - l.GameH / 2);
        var b = centre + new Vector3(0, dy * cos, dy * sin);
        var eye = new Vector3(l.W / 2, 0.24f * l.H, persp) - b;
        var r = new Vector3(eye.x, eye.y * cos + eye.z * sin, -eye.y * sin + eye.z * cos);
        cam.transform.position = new Vector3(r.x, r.z, -r.y) / s;
        cam.transform.rotation = Quaternion.LookRotation(new Vector3(0, -cos, sin), new Vector3(0, sin, cos));
        float n = 0.1f, f = 100, k = n / persp;
        cam.nearClipPlane = n;
        cam.farClipPlane = f;
        cam.projectionMatrix = Matrix4x4.Frustum(-l.W / 2 * k, l.W / 2 * k, -0.76f * l.H * k, 0.24f * l.H * k, n, f);
    }

    /// <summary>Each frame: the board's camera while zoomed (or easing), the HUD faded out of the way, the zoom's ways in, and out as the turn passes.</summary>
    void ZoomTick()
    {
        if (Cam == null || state == null) return;
        // A new player's turn: out of any tableau, so the whole table is in view (app.ts announcePhases).
        string turn = Game.ActivePlayer(state).Id;
        if (zoomTurn != null && turn != zoomTurn && zoom != null) SetBoardZoom(null);
        zoomTurn = turn;
        if (zoom != null || zoomMoving)
        {
            var (t, tilt, scale) = ZoomNow();
            FrameAt(Cam, BoardLayout.Current, t, tilt, scale);
            if (zoom == null && Time.time - zoomAt >= 0.45f)
            {
                zoomMoving = false;
                Frame(Cam);
            }
        }
        // (Zoomed, the HUD, the turn's controls, the pace and the rival's hand fade out over 0.25 s: all the HUD but the
        // toast, which keeps its own.)
        float want = zoom != null ? 0 : 1;
        if (zoomFade != want)
        {
            zoomFade = Mathf.MoveTowards(zoomFade, want, Time.deltaTime / 0.25f);
            var g = chrome.GetComponent<CanvasGroup>() ?? chrome.gameObject.AddComponent<CanvasGroup>();
            g.alpha = zoomFade;
            g.blocksRaycasts = g.interactable = zoom == null;
        }
        var toastBox = chrome.Find("Toast");
        if (toastBox != null && toastBox.GetComponent<CanvasGroup>() == null) toastBox.gameObject.AddComponent<CanvasGroup>().ignoreParentGroups = true;
        if (zoom != null) Board.ZoomLook(true);
        if (zoomCtl == null && zoom != null) ZoomControls();
        PinchTick();
    }

    /// <summary>
    /// Zoomed, its buttons (app.ts renderZoomControls, .board-zoom: at the screen's left (max(10px, its safe inset)),
    /// its middle, 10 apart): "‹ back" to the whole board, and an eye to look at the other side's tableau ("you" or
    /// "opponent"). Each .zoom-btn: at least 46 wide, padded 6 7 5, corners 14, white at 85% with a white hairline and
    /// var(--shadow), soft ink; its mark over its word (7.36 px capitals spaced 0.14em), 1 apart; as wide as the wider.
    /// </summary>
    void ZoomControls()
    {
        if (zoomCtl != null) Mats.Kill(zoomCtl.gameObject);
        zoomCtl = null;
        if (zoom == null || hud == null) return;
        var l = BoardLayout.Current;
        zoomCtl = Hud.Rect(hud.transform, "Board zoom");
        Hud.Fill(zoomCtl);
        zoomCtl.SetSiblingIndex(refLayer.GetSiblingIndex());
        string other = zoom == "mine" ? "rival" : "mine", word = other == "mine" ? "YOU" : "OPPONENT";
        float sw = Mathf.Max(MenuKit.TextW("BACK", 7.36f, 500, 0.14f), MenuKit.TextW(word, 7.36f, 500, 0.14f)) + 0.14f * 7.36f;
        float w = Mathf.Max(46, sw + 2 * 7 + 2), small = MenuKit.LineH(7.36f);
        float h1 = 1 + 6 + 16 + 1 + small + 5 + 1, h2 = 1 + 6 + 20 + 1 + small + 5 + 1;
        float x = Mathf.Max(10, Css.SafeInsets.w), y = (l.H - (h1 + 10 + h2)) / 2;
        Button Make(float top, float h, string label, System.Action act, System.Action<RectTransform> mark, string tip)
        {
            var box = Hud.Box(zoomCtl, label, new Color(1, 1, 1, 0.85f), 14);
            Hud.Place(box.rectTransform, x, top, w, h);
            box.raycastTarget = true;
            Hud.Shadow(box, 14, new Hud.Drop(Color.white, 0, 0, 1), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.13f), 8, 30), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.07f), 2, 6));
            mark(box.rectTransform);
            MenuKit.Words(box.transform, label, 0.07f * 7.36f, h - 1 - 5 - small, w, small, 7.36f, Look.InkSoft, true, 500, 0.14f);
            var b = box.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            b.onClick.AddListener(() => { Sound.Play("click"); act(); });
            box.gameObject.AddComponent<Tip>().Text = tip;
            return b;
        }
        string z = zoom;
        Make(y, h1, "BACK", () => SetBoardZoom(null), r => MenuKit.Words(r, "‹", 0, 7, w, 16, 16, Look.InkSoft, true, 500), "Back to the whole board (Esc)");
        Make(y + h1 + 10, h2, word, () => SetBoardZoom(other), r =>
        {
            var eye = Hud.Rect(r, "Eye");
            Hud.Place(eye, (w - 20) / 2, 7, 20, 20);
            var ei = eye.gameObject.AddComponent<RawImage>();
            ei.texture = Resources.Load<Texture2D>("Icons/bt-eye");
            ei.color = Look.InkSoft;
            ei.raycastTarget = false;
        }, $"Look at {(other == "mine" ? "your" : "their")} tableau instead");
    }

    /// <summary>The tableau nearer a point of the page's height (app.ts half): by the rows' middles on the screen.</summary>
    string HalfAt(float pageY)
    {
        var l = BoardLayout.Current;
        float Y(float rowCy)
        {
            var sp = Cam.WorldToScreenPoint(Board.transform.TransformPoint(l.At(l.Gw / 2, rowCy)));
            return Page(sp).y;
        }
        return Mathf.Abs(pageY - Y(l.RivalRowCy)) < Mathf.Abs(pageY - Y(l.MyRowCy)) ? "rival" : "mine";
    }

    /// <summary>
    /// A tap on the board (app.ts's dblclick): the second within half a second, on the open table (not a card, a sun or
    /// one of the board's buttons), zooms onto the tableau nearer it, or back out.
    /// </summary>
    void ZoomTap(Collider hit)
    {
        bool open = hit == null || (hit.GetComponentInParent<CardView>() == null && hit.GetComponentInParent<SunTag>() == null && hit.GetComponent<BoardHit>() == null);
        var at = Input.mousePosition;
        if (open && Time.time - lastTapAt < 0.5f && (at - lastTapPos).magnitude < 12 * Css.PixelRatio)
        {
            lastTapAt = -10;
            SetBoardZoom(zoom != null ? null : HalfAt(Page(at).y));
            return;
        }
        lastTapAt = open ? Time.time : -10;
        lastTapPos = at;
    }

    /// <summary>Two fingers spread a quarter apart zoom onto the tableau between them; drawn a fifth together, back out (app.ts's pinch).</summary>
    void PinchTick()
    {
        if (Input.touchCount != 2 || sheet != null) { pinchFrom = 0; return; }
        var a = Input.GetTouch(0).position;
        var b = Input.GetTouch(1).position;
        float d = (a - b).magnitude;
        if (pinchFrom == 0)
        {
            pinchFrom = d;
            pinchY = Page((a + b) / 2).y;
            pressAt = -1;
            return;
        }
        if (pinchFrom < 0) return;
        float ratio = d / Mathf.Max(1, pinchFrom);
        if (ratio > 1.25f) SetBoardZoom(HalfAt(pinchY));
        else if (ratio < 0.8f) SetBoardZoom(null);
        else return;
        // (Once a pinch has acted, nothing more until the fingers lift.)
        pinchFrom = -1;
    }
}
