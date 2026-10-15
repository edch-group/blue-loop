using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

/// <summary>
/// The menus under a mouse (app.ts onHover): the main menu's choices chime softly as the pointer comes onto them
/// (.hub-card, .hub-link, .hub-options, .player-chip, .hub-continue), cards and deck boxes rustle like paper; and what
/// hovering (and pressing) a thing changes about it. A touch screen has no hover: none of it there.
/// </summary>
public class MenuHover : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler
{
    System.Action<bool> over, down;
    string sound;
    bool inside;
    // (sound.ts: a chime at most every 90 ms, a rustle every 70.)
    static float lastHover = -1, lastRustle = -1;

    /// <summary>`go` chimes as a mouse comes onto it, and tells `over` as one comes and goes (and `down` as it is pressed, mouse or touch).</summary>
    public static MenuHover On(GameObject go, System.Action<bool> over, System.Action<bool> down = null, string sound = "hover")
    {
        var h = go.AddComponent<MenuHover>();
        h.over = over;
        h.down = down;
        h.sound = sound;
        return h;
    }

    /// <summary>A card or a deck box: it rustles as a mouse comes onto it.</summary>
    public static MenuHover Rustle(GameObject go, System.Action<bool> over = null) => On(go, over, null, "rustle");

    /// <summary>A mouse's pointer (a touch's ids are 0 and up).</summary>
    public static bool Mouse(PointerEventData e) => e.pointerId < 0 && Input.touchCount == 0;

    public void OnPointerEnter(PointerEventData e)
    {
        if (!Mouse(e) || inside) return;
        inside = true;
        if (sound == "hover" && Time.unscaledTime - lastHover >= 0.09f) { lastHover = Time.unscaledTime; Sound.Play("hover"); }
        if (sound == "rustle" && Time.unscaledTime - lastRustle >= 0.07f) { lastRustle = Time.unscaledTime; Sound.Play("rustle"); }
        over?.Invoke(true);
    }

    public void OnPointerExit(PointerEventData e)
    {
        if (!inside) return;
        inside = false;
        over?.Invoke(false);
    }

    public void OnPointerDown(PointerEventData e) => down?.Invoke(true);

    public void OnPointerUp(PointerEventData e) => down?.Invoke(false);

    void OnDisable()
    {
        if (inside) over?.Invoke(false);
        inside = false;
    }
}

/// <summary>
/// A hub tile's feel (styles.css .hub-card, its transitions 0.18 s ease): under a mouse its shadow deepens (0 14px 34px
/// at 14% to 0 20px 40px at 18%) and its contents lift 3 (the tile itself stays, so a pointer on its edge can't make it
/// jitter); pressed (:active), it shrinks to 0.98.
/// </summary>
public class HubFeel : MonoBehaviour
{
    public Shades Shades;
    public RectTransform Contents;
    public bool Over, Down;
    float over, down;

    void Update()
    {
        float step = Time.unscaledDeltaTime / 0.18f;
        float o = Mathf.MoveTowards(over, Over ? 1 : 0, step), d = Mathf.MoveTowards(down, Down ? 1 : 0, step);
        if (o == over && d == down) return;
        over = o;
        down = d;
        // (CSS's `ease` along the way.)
        float eo = MenuView.Bezier(0.25f, 0.1f, 0.25f, 1, over), ed = MenuView.Bezier(0.25f, 0.1f, 0.25f, 1, down);
        if (Shades != null) Shades.Set(0, new Hud.Drop(Hud.Rgba(80, 84, 100, Mathf.Lerp(0.14f, 0.18f, eo)), Mathf.Lerp(14, 20, eo), Mathf.Lerp(34, 40, eo)));
        if (Contents != null) Contents.anchoredPosition = new Vector2(0, 3 * eo);
        transform.localScale = Vector3.one * Mathf.Lerp(1, 0.98f, ed);
    }
}

/// <summary>
/// A card in the menus read large (app.ts contextmenu, onPressStart): a right-click on it, or on a touch screen a press
/// held 450 ms without moving more than 10 (the tap that ends it then does nothing else). `read` shows it.
/// </summary>
public class CardPress : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
{
    System.Action read;
    float pressedAt = -1;
    Vector2 pressedPos;
    bool shown;

    public static CardPress On(GameObject go, System.Action read)
    {
        var p = go.AddComponent<CardPress>();
        p.read = read;
        return p;
    }

    public void OnPointerDown(PointerEventData e)
    {
        // (The buttons by number: left 0, right 1.)
        if ((int)e.button == 1) { read?.Invoke(); return; }
        if (MenuHover.Mouse(e) || (int)e.button != 0) return;
        pressedAt = Time.unscaledTime;
        pressedPos = e.position;
        shown = false;
    }

    void Update()
    {
        if (pressedAt < 0 || shown) return;
        // (Moved: a scroll or a swipe, not a press. Watched from the touch itself, so a list it is in still scrolls.)
        if (Input.touchCount > 0 && (Input.GetTouch(0).position - pressedPos).magnitude > 10 * Css.PixelRatio) { pressedAt = -1; return; }
        if (Time.unscaledTime - pressedAt < 0.45f) return;
        shown = true;
        read?.Invoke();
    }

    public void OnPointerUp(PointerEventData e)
    {
        if ((int)e.button == 0) pressedAt = -1;
    }

    /// <summary>Whether the press ending now ended a long press (so its tap is not also a tap).</summary>
    public bool Swallow()
    {
        if (!shown) return false;
        shown = false;
        return true;
    }
}

/// <summary>
/// A swipe across an area (app.ts: the deck builder's card pool), not by a mouse: a stroke begun over it, over 60
/// across and more than twice as far across as down, tells `swiped` how far (left: below 0). (Watched from the
/// pointer itself: what is in the area takes the press.)
/// </summary>
public class Swipe : MonoBehaviour
{
    System.Action<float> swiped;
    Vector2? from;

    public static Swipe On(GameObject go, System.Action<float> swiped)
    {
        var s = go.AddComponent<Swipe>();
        s.swiped = swiped;
        return s;
    }

    void Update()
    {
        if (Input.touchCount == 0 && from == null) return;
        if (Input.touchCount > 0)
        {
            var t = Input.GetTouch(0);
            if (t.phase == TouchPhase.Began)
            {
                var canvas = GetComponentInParent<Canvas>();
                var cam = canvas != null ? canvas.worldCamera : null;
                from = RectTransformUtility.RectangleContainsScreenPoint((RectTransform)transform, t.position, cam) ? t.position : (Vector2?)null;
            }
            else if ((t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled) && from != null)
            {
                var d = (t.position - from.Value) / Css.PixelRatio;
                from = null;
                if (t.phase == TouchPhase.Ended && Mathf.Abs(d.x) > 60 && Mathf.Abs(d.x) > Mathf.Abs(d.y) * 2) swiped?.Invoke(d.x);
            }
        }
    }
}

/// <summary>A thing shown or not, fading between (a transition of opacity, 0.15 s): the deck builder's corner to read a card large.</summary>
public class Fade : MonoBehaviour
{
    public bool Shown;
    CanvasGroup group;

    /// <summary>`go` faded in or out as it is to be shown or not; as it starts, `shown` or not at once.</summary>
    public static Fade On(GameObject go, bool shown)
    {
        var f = go.AddComponent<Fade>();
        f.group = go.GetComponent<CanvasGroup>() ?? go.AddComponent<CanvasGroup>();
        f.Shown = shown;
        f.group.alpha = shown ? 1 : 0;
        return f;
    }

    void Update()
    {
        if (group != null) group.alpha = Mathf.MoveTowards(group.alpha, Shown ? 1 : 0, Time.unscaledDeltaTime / 0.15f);
    }
}

/// <summary>A card held up to read easing in (.card-preview.show: opacity and scale from 0.95, 0.12 s), about its middle.</summary>
public class PopIn : MonoBehaviour
{
    CanvasGroup group;
    float born;

    void Start()
    {
        group = GetComponent<CanvasGroup>() ?? gameObject.AddComponent<CanvasGroup>();
        var r = (RectTransform)transform;
        // (Turned about its middle: the pivot moved there, the box kept where it is.)
        var size = r.rect.size;
        var shift = new Vector2(0.5f, 0.5f) - r.pivot;
        r.pivot = new Vector2(0.5f, 0.5f);
        r.anchoredPosition += new Vector2(shift.x * size.x, shift.y * size.y);
        born = Time.unscaledTime;
        Apply();
    }

    void Update() => Apply();

    void Apply()
    {
        float k = MenuView.Bezier(0.25f, 0.1f, 0.25f, 1, Mathf.Clamp01((Time.unscaledTime - born) / 0.12f));
        group.alpha = k;
        transform.localScale = Vector3.one * Mathf.Lerp(0.95f, 1, k);
        if (k >= 1) enabled = false;
    }
}
