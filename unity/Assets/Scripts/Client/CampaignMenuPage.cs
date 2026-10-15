using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The campaign's menu page (campaign.ts renderSetup, styles.css .cs-*), laid out as the web lays it out at the
/// screen's size (and again when that changes): back at the top left and A DYING UNIVERSE over the middle, in the
/// page's padding (clear of the safe area); the sections arced round the ship's bow, each a white disc with its emblem
/// (the skill tree's nodes), its name and what it holds beside it, on a fine dotted half circle, placed where the
/// ship's camera has the bow on this screen; BEGIN RUN at the foot. A section with nothing in it yet is greyed out and
/// can't be opened. (The page it is given is taken to fill the screen.)
/// </summary>
public static class CampaignMenuPage
{
    public static void Make(RectTransform page, MenuView menu, CampaignBackdrop scene = null)
    {
        RefLayer layer = null;
        layer = RefLayer.Make(page, "Campaign menu", () =>
        {
            foreach (Transform c in layer.Rect) Mats.Kill(c.gameObject);
            Lay(layer, menu, scene);
        });
        var zones = layer.Rect.gameObject.AddComponent<Zones>();
        zones.Scene = scene;
        zones.Menu = menu;
        zones.Page = page;
        // Opened afresh (campaign.ts openSetup's menuIntro): the scene hidden while its land is made, then faded in as
        // the ship flies in, the options after it. Back from one of its sections (.cs-focus taken off): the options
        // fading back in.
        if (scene != null && !scene.BeginIntro() && !(scene.OptionsAt > scene.Clock) && Application.isPlaying) zones.BackAt = Time.unscaledTime;
        Lay(layer, menu, scene);
        zones.Apply();
    }

    /// <summary>CSS's cubic-bezier(x1, y1, x2, y2) timing at k (0 to 1).</summary>
    public static float Bezier(float k, float x1, float y1, float x2, float y2)
    {
        if (k <= 0) return 0;
        if (k >= 1) return 1;
        float B(float t, float a, float b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
        float D(float t, float a, float b) => 3 * (1 - t) * (1 - t) * a + 6 * (1 - t) * t * (b - a) + 3 * t * t * (1 - b);
        // (Solve the curve's x for its parameter, by Newton's method, then read its y.)
        float u = k;
        for (int i = 0; i < 8; i++)
        {
            float dx = D(u, x1, x2);
            if (Mathf.Abs(dx) < 1e-5f) break;
            u = Mathf.Clamp01(u - (B(u, x1, x2) - k) / dx);
        }
        return B(u, y1, y2);
    }

    /// <summary>CSS's `ease`.</summary>
    public static float Ease(float k) => Bezier(k, 0.25f, 0.1f, 0.25f, 1);
    /// <summary>CSS's `ease-out`.</summary>
    public static float EaseOut(float k) => Bezier(k, 0, 0, 0.58f, 1);
    /// <summary>CSS's `ease-in`.</summary>
    public static float EaseIn(float k) => Bezier(k, 0.42f, 0, 1, 1);

    /// <summary>
    /// Leaving the menu for a section (the Stellari's tree, the ship tab, the Captain's page: .cs-captain-page.cs-focus):
    /// its header and foot put away at once, its options fading out (0.3 s), the page then taken away. False if `page`
    /// is not the campaign's menu.
    /// </summary>
    public static bool FadeOut(RectTransform page)
    {
        var zones = page != null ? page.GetComponentInChildren<Zones>() : null;
        if (zones == null || zones.Nodes == null) return false;
        zones.LeftAt = Time.unscaledTime;
        foreach (Transform c in zones.transform)
            if (c != zones.Nodes.transform) c.gameObject.SetActive(false);
        zones.Nodes.blocksRaycasts = zones.Nodes.interactable = false;
        return true;
    }

    /// <summary>
    /// The Stellari's tree over the menu's scene (styles.css .cs-captain-page .up-shop.up-tree: up-in 0.7 s ease-out,
    /// 0.9 s on, the camera gliding down to the Stellari first): the page, and the page's own light under it, faded in.
    /// </summary>
    public static void TreeIn(RectTransform page, GameObject light)
    {
        var f = page.gameObject.AddComponent<Fade>();
        f.Groups.Add(Group(page.gameObject));
        if (light != null) f.Groups.Add(Group(light));
        f.From = Time.unscaledTime;
        f.Apply();
    }

    static CanvasGroup Group(GameObject g)
    {
        var c = g.GetComponent<CanvasGroup>();
        return c != null ? c : g.AddComponent<CanvasGroup>();
    }

    /// <summary>A page coming in after the camera has moved (0.9 s on, over 0.7 s, ease-out); left whole when it goes.</summary>
    class Fade : MonoBehaviour
    {
        public readonly List<CanvasGroup> Groups = new List<CanvasGroup>();
        public float From;
        void Update() => Apply();
        public void Apply()
        {
            float a = EaseOut(Mathf.Clamp01((Time.unscaledTime - From - 0.9f) / 0.7f));
            foreach (var g in Groups) if (g != null) g.alpha = a;
            if (a >= 1) enabled = false;
        }
        void OnDestroy()
        {
            foreach (var g in Groups) if (g != null) g.alpha = 1;
        }
    }

    /// <summary>
    /// The ship's sections under the pointer (campaign.ts showBase's hover): a section of the ship under it (base3d.ts
    /// zoneAt: the Captain, one of the crew, the hull; never the research bay, nor a section not yet open) lights its
    /// option as if it were under the pointer, a label under it lights its own; each new one sounds (not to a finger).
    /// A tap on a section is a tap on its option.
    /// </summary>
    public class Zones : MonoBehaviour
    {
        public CampaignBackdrop Scene;
        /// <summary>Each option's section, its node lighting, its button (none: shut).</summary>
        public readonly Dictionary<string, (WebLook.Lift lift, Button button)> Options = new Dictionary<string, (WebLook.Lift, Button)>();
        /// <summary>The option the pointer is over, if any (told by its node).</summary>
        public string OverLabel;
        string over;
        Vector3 downAt;
        public MenuView Menu;
        public RectTransform Page;
        /// <summary>The options and their half circle (.cs-nodes), faded together.</summary>
        public CanvasGroup Nodes;
        /// <summary>When the menu came back from a section (its options fading back in), or was left for the tree.</summary>
        public float? BackAt, LeftAt;
        // (The page's light laid over the scene while it fades in.)
        bool veiled;

        /// <summary>
        /// The scene fading in (.cs-base: its opacity 0.9 s ease-out, the page's own light showing through until then),
        /// and the options: hidden while it comes in, then 0.6 s ease-out a second after (.cs-nodes-wait), not to be
        /// touched until then; back from a section, 0.6 s ease-out (.cs-nodes) with their own 0.3 s (.cs-base-label);
        /// leaving for the tree, 0.3 s out, both.
        /// </summary>
        public void Apply()
        {
            float a = 1;
            bool wait = false;
            if (Scene != null && Scene.OptionsAt is float at)
            {
                wait = Scene.Clock < at;
                a = EaseOut(Mathf.Clamp01((Scene.Clock - at) / 0.6f));
            }
            if (BackAt is float back)
            {
                float k = Time.unscaledTime - back;
                a *= EaseOut(Mathf.Clamp01(k / 0.6f)) * Ease(Mathf.Clamp01(k / 0.3f));
            }
            if (LeftAt is float left)
            {
                float k = Ease(Mathf.Clamp01((Time.unscaledTime - left) / 0.3f));
                a = (1 - k) * (1 - k);
                if (k >= 1 && Page != null)
                {
                    Mats.Kill(Page.gameObject);
                    Page = null;
                }
            }
            if (Nodes != null)
            {
                Nodes.alpha = a;
                if (LeftAt == null) Nodes.blocksRaycasts = Nodes.interactable = !wait;
            }
            // (The scene behind the page's own light until it is shown: the light laid over it, fading.)
            var light = Menu != null ? Menu.Backdrop : null;
            if (Scene == null || light == null || LeftAt != null) return;
            float shown = Scene.Shown;
            if (shown < 1)
            {
                if (!light.activeSelf) light.SetActive(true);
                Group(light).alpha = 1 - shown;
                veiled = true;
            }
            else if (veiled)
            {
                veiled = false;
                Group(light).alpha = 1;
                light.SetActive(false);
            }
        }

        void OnDestroy()
        {
            if (veiled && Menu != null && Menu.Backdrop != null) Group(Menu.Backdrop).alpha = 1;
        }

        void Update()
        {
            Apply();
            // (Left for the tree: nothing here answers any more.)
            if (LeftAt != null) return;
            bool overControl = OverControl();
            string zone = OverLabel;
            if (zone == null && !overControl && Scene != null && Input.mousePresent)
            {
                var z = Scene.ZoneAt(Input.mousePosition);
                zone = z != null && z != "research" && !(Options.TryGetValue(z, out var o) && o.button == null) ? z : null;
            }
            if (zone != over)
            {
                // (Lit as under the pointer: .cs-base-label.on.)
                if (over != null && over != OverLabel && Options.TryGetValue(over, out var was) && was.lift != null) was.lift.OnPointerExit(null);
                if (zone != null && Options.TryGetValue(zone, out var now) && now.lift != null) now.lift.OnPointerEnter(null);
                over = zone;
                if (zone != null && Input.touchCount == 0) Sound.Play("hover");
            }
            // (A tap on the ship over a section: its option's.)
            if (Input.GetMouseButtonDown(0)) downAt = Input.mousePosition;
            if (Input.GetMouseButtonUp(0) && !overControl && OverLabel == null && (Input.mousePosition - downAt).magnitude < 8 && Scene != null)
            {
                var z = Scene.ZoneAt(Input.mousePosition);
                if (z != null && z != "research" && Options.TryGetValue(z, out var o) && o.button != null) o.button.onClick.Invoke();
            }
        }

        /// <summary>The page's own controls under the pointer (back, begin run, an option): the ship behind them is not.</summary>
        public int OverControls;

        bool OverControl() => OverControls > 0;
    }

    /// <summary>A control telling the page's Zones the pointer is over it (an option: over its section).</summary>
    class OverOption : MonoBehaviour, UnityEngine.EventSystems.IPointerEnterHandler, UnityEngine.EventSystems.IPointerExitHandler
    {
        public Zones Zones;
        public string Zone;
        bool on;
        public void OnPointerEnter(UnityEngine.EventSystems.PointerEventData e)
        {
            if (Zones == null || on) return;
            on = true;
            Zones.OverControls++;
            if (Zone != null) Zones.OverLabel = Zone;
        }
        public void OnPointerExit(UnityEngine.EventSystems.PointerEventData e) => Leave();
        void OnDisable() => Leave();
        void Leave()
        {
            if (Zones == null || !on) return;
            on = false;
            Zones.OverControls--;
            if (Zone != null && Zones.OverLabel == Zone) Zones.OverLabel = null;
        }

        /// <summary>A control told of (an option's section with it).</summary>
        public static void On(Component c, Zones zones, string zone = null)
        {
            if (zones == null) return;
            var o = c.gameObject.AddComponent<OverOption>();
            o.Zones = zones;
            o.Zone = zone;
        }
    }

    static void Lay(RefLayer layer, MenuView menu, CampaignBackdrop scene)
    {
        const float Z = WebLook.Zoom;
        var page = layer.Rect;
        float W = layer.W, H = layer.H;
        var sa = layer.Insets;
        // (.cs-page: padded 12 at the top and foot and 18 at the sides, clear of the safe area; on a short screen, 6 at
        // the top and foot, its header 36 high (not 52), BEGIN RUN 7 20 (not 11 24) and nothing under it.)
        bool phone = Css.MaxHeight(560);
        float padT = Mathf.Max((phone ? 6 : 12) * Z, sa.x), padB = Mathf.Max((phone ? 6 : 12) * Z, sa.z), padL = Mathf.Max(18 * Z, sa.w);
        float headH = (phone ? 36 : 52) * Z;
        // The header: back (.btn.btn-small, 26 high) and the page's name (.menu-heading, clamp(0.9rem, 4vh, 1.3rem)).
        var back = WebLook.Button(page, "‹ back", () => menu.Show("hub"), false, 0.56f * 16 * Z, 0.14f);
        WebLook.Box((RectTransform)back.transform, padL, padT + headH / 2 - 13 * Z, 63 * Z, 26 * Z);
        var zoneKeeper = layer.Rect.GetComponent<Zones>();
        OverOption.On(back, zoneKeeper);
        float hs = Css.Clamp(0.9f * 16 * Z, 4 * H / 100, 1.3f * 16 * Z);
        var head = WebLook.Box(page, "Heading", 0, padT + headH / 2 - hs * 0.62f, W, hs * 1.25f);
        var h = WebLook.Words(head, "A DYING UNIVERSE", hs, 0.3f, WebLook.Hex("#555a63"));
        h.margin = new Vector4(0, 0, 0.3f * hs, 0);

        // (Sections opened for good once there is first something in them.)
        var was = CampaignView.LoadMeta();
        var meta = Meta.OpenSections(was);
        if (!ReferenceEquals(meta, was)) CampaignView.SaveMeta(meta);
        // (Once the first companion is found, the Captain's option is the crew's.)
        var found = Meta.CompanionsFound(meta);
        int crewPoints = Meta.PointsLeft(meta) + found.Sum(id => Meta.CompanionPoints(meta, id));
        var options = new (string section, string mark, string title, string sub, string page)[]
        {
            found.Count > 0 ? ("captain", "captain", "the crew", $"{crewPoints} skill point{(crewPoints == 1 ? "" : "s")}", "captain") : ("captain", "captain", "the captain", $"{Meta.PointsLeft(meta)} skill points", "captain"),
            ("ship", "ship", "the ship", "fit parts", "hangar"),
            ("stellari", "stellari", "the stellari", $"{meta.Petals} petals", "stellari"),
        };

        // The options round the ship's bow (campaign.ts showBase's onFrame): a half circle 13.5 across the ship's box
        // about its bow (39.5, 5), standing upright along it, seen as the ship's camera frames the whole ship at rest
        // on this screen; three a quarter turn apart (52 degrees), top to bottom.
        Vector2? On(float deg)
        {
            float r = deg * Mathf.Deg2Rad;
            var q = scene != null ? scene.ShipViewport(39.5f + 13.5f * Mathf.Cos(r), 12, 5 + 13.5f * Mathf.Sin(r)) : null;
            return q != null ? new Vector2(q.Value.x * W, q.Value.y * H) : (Vector2?)null;
        }

        // (.cs-nodes: the options and their half circle, faded together.)
        var nodes = Hud.Rect(page, "Nodes");
        Hud.Fill(nodes);
        if (zoneKeeper != null)
        {
            zoneKeeper.Nodes = nodes.gameObject.AddComponent<CanvasGroup>();
            zoneKeeper.Apply();
        }

        // The half circle round the bow: a fine dotted ink line (stroke 1.2, dashes 2 and 5, in CSS pixels).
        var arc = Hud.Rect(nodes, "Arc");
        Hud.Fill(arc);
        var lines = arc.gameObject.AddComponent<UiLines>();
        var pts = new List<Vector2>();
        for (int i = 0; i < 19; i++)
        {
            var q = On(-90 + i * 10);
            if (q != null) pts.Add(new Vector2(q.Value.x - W / 2, H / 2 - q.Value.y));
        }
        if (pts.Count > 1) lines.Add(pts, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.32f), 1.2f * Z, 2.5f * Z, 4.5f * Z);

        for (int i = 0; i < options.Length; i++)
        {
            var (section, mark, title, sub, to) = options[i];
            bool shut = !Meta.SectionOpen(meta, section);
            // (Without the ship's camera, where the web's have them at 1600 x 1000, as fractions of the screen.)
            var at = On((1 - i) * 52) ?? new Vector2(new[] { 0.709f, 0.748f, 0.701f }[i] * W, new[] { 0.313f, 0.505f, 0.702f }[i] * H);
            // (Its disc 42 across, its words 10 to the right of it: the whole a button; kept on the screen, its words and all.)
            var node = WebLook.Box(nodes, title, 0, 0, 52 * Z + 150 * Z, 42 * Z);
            var hit = node.gameObject.AddComponent<Image>();
            hit.color = new Color(1, 1, 1, 0);
            var disc = WebLook.Centred(node, "Disc", 21 * Z, 21 * Z, 84 * Z, 84 * Z);
            var di = disc.gameObject.AddComponent<RawImage>();
            di.texture = Resources.Load<Texture2D>($"Icons/menu-node-{mark}{(shut ? "-shut" : "")}");
            di.raycastTarget = false;
            var words = WebLook.Box(node, "Words", 52 * Z, 21 * Z - 20, 150 * Z, 40);
            var group = words.gameObject.AddComponent<CanvasGroup>();
            group.alpha = shut ? 0.4f : 1;
            group.blocksRaycasts = false;
            var name = WebLook.Words(WebLook.Box(words, "Name", 0, 0, 150 * Z, 18), title.ToUpperInvariant(), 0.62f * 16 * Z, 0.22f, Look.InkSoft, true, 500, TextAlignmentOptions.Left);
            var holds = WebLook.Words(WebLook.Box(words, "Holds", 0, 21, 150 * Z, 19), sub, 0.68f * 16 * Z, 0, Look.InkFaint, false, 400, TextAlignmentOptions.Left);
            float textW = Mathf.Max(name.GetPreferredValues(name.text).x, holds.GetPreferredValues(holds.text).x);
            float nodeW = 52 * Z + textW;
            WebLook.Box(node, Mathf.Round(Mathf.Min(at.x, W - nodeW + 21 * Z - 4 * Z)) - 21 * Z, Mathf.Round(at.y) - 21 * Z, 52 * Z + 150 * Z, 42 * Z);
            // (Its section of the ship: the Captain's, the hull for the ship's, the research bay for the Stellari's.)
            string zone = section == "ship" ? "hangar" : section == "stellari" ? "research" : section;
            var zones = zoneKeeper;
            if (shut)
            {
                if (zones != null) zones.Options[zone] = (null, null);
                OverOption.On(node, zones);
                continue;
            }
            var b = node.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            b.onClick.AddListener(() => { Sound.Play("click"); menu.Show(to); });
            var lift = node.gameObject.AddComponent<WebLook.Lift>();
            lift.Disc = disc;
            lift.Name = name;
            lift.Rest = Look.InkSoft;
            lift.Over = Look.Ink;
            if (zones != null)
            {
                zones.Options[zone] = (lift, b);
                OverOption.On(node, zones, zone);
            }
        }

        // Begin the run (.setup-foot .btn-primary: at least 160 across, padded 11 24, on a short screen 7 20; clamp(4,
        // 2vh, 16) above the page's foot padding, on a short screen none): always a new one, in place of any under way
        // (campaign.ts cmp-start: the hub's continue carries one on).
        var begin = WebLook.Button(page, "begin run", () =>
        {
            Store.Remove(CampaignView.Key);
            App.Instance.Run(CampaignView.NewRun());
        }, true, 0.66f * 16 * Z, 0.24f);
        var bt = begin.GetComponentInChildren<TextMeshProUGUI>();
        float bw = Mathf.Max(160 * Z, bt.GetPreferredValues(bt.text).x + 2 * (phone ? 20 : 24) * Z), bh = 0.66f * 16 * Z * 1.25f + 2 * (phone ? 7 : 11) * Z;
        float foot = phone ? 0 : Css.Clamp(4 * Z, 2 * H / 100, 16 * Z);
        WebLook.Box((RectTransform)begin.transform, W / 2 - bw / 2, H - padB - foot - bh, bw, bh);
        OverOption.On(begin, zoneKeeper);
    }
}
