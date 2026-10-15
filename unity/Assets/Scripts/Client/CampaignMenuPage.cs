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
        Lay(layer, menu, scene);
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

        // The half circle round the bow: a fine dotted ink line (stroke 1.2, dashes 2 and 5, in CSS pixels).
        var arc = Hud.Rect(page, "Arc");
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
            var node = WebLook.Box(page, title, 0, 0, 52 * Z + 150 * Z, 42 * Z);
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
            if (shut) continue;
            var b = node.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            b.onClick.AddListener(() => { Sound.Play("click"); menu.Show(to); });
            var lift = node.gameObject.AddComponent<WebLook.Lift>();
            lift.Disc = disc;
            lift.Name = name;
            lift.Rest = Look.InkSoft;
            lift.Over = Look.Ink;
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
    }
}
