using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The campaign's menu page (campaign.ts renderSetup, styles.css .cs-*), laid to the web's measures at 1600 x 1000:
/// back at the top left and A DYING UNIVERSE over the middle; the sections arced round the ship's bow, each a white
/// disc with its emblem (the skill tree's nodes), its name and what it holds beside it, on a fine dotted half circle;
/// BEGIN RUN at the foot. A section with nothing in it yet is greyed out and can't be opened.
/// </summary>
public static class CampaignMenuPage
{
    // Where the web lays the options on its page (campaign.ts showBase's onFrame: round the bow of the ship at rest,
    // three a quarter turn apart), and the half circle they sit on, in its drawn pixels.
    static readonly Vector2[] Spots = { new Vector2(1133.9f, 313.2f), new Vector2(1196.3f, 504.6f), new Vector2(1122.3f, 701.8f) };
    static readonly float[] Arc =
    {
        694.1f, 532.2f, 717.2f, 525.8f, 739.2f, 514.6f, 759.5f, 499.1f, 777.7f, 479.8f, 793.4f, 457.3f, 806.1f, 432.2f, 815.7f, 405.3f,
        821.9f, 377.0f, 824.6f, 348.2f, 823.7f, 319.5f, 819.3f, 291.6f, 811.2f, 265.3f, 799.8f, 241.1f, 785.1f, 220.0f, 767.5f, 202.4f,
        747.4f, 189.0f, 725.2f, 180.5f, 701.7f, 177.1f,
    };

    public static void Make(RectTransform page, MenuView menu)
    {
        const float Z = WebLook.Zoom;
        // The header: back (.btn.btn-small) and the page's name (.menu-heading).
        var back = WebLook.Button(page, "‹ back", () => menu.Show("hub"), false, 13f, 0.14f);
        WebLook.Box((RectTransform)back.transform, 26, 36, 92, 38);
        var head = WebLook.Box(page, "Heading", 0, 37, 1600, 37);
        var h = WebLook.Words(head, "A DYING UNIVERSE", 30.2f, 0.3f, WebLook.Hex("#555a63"));
        h.margin = new Vector4(0, 0, 0.3f * 30.2f, 0);

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

        // The half circle round the bow: a fine dotted ink line (stroke 1.2, dashes 2 and 5, in CSS pixels).
        var arc = Hud.Rect(page, "Arc");
        Hud.Fill(arc);
        var lines = arc.gameObject.AddComponent<UiLines>();
        var pts = new List<Vector2>();
        for (int i = 0; i < Arc.Length; i += 2) pts.Add(new Vector2(Arc[i] * Z - 800, 500 - Arc[i + 1] * Z));
        lines.Add(pts, new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.32f), 1.2f * Z, 2.5f * Z, 4.5f * Z);

        for (int i = 0; i < options.Length; i++)
        {
            var (section, mark, title, sub, to) = options[i];
            bool shut = !Meta.SectionOpen(meta, section);
            var at = Spots[i];
            // (Its disc 42 across, its words 10 to the right of it: the whole a button.)
            var node = WebLook.Box(page, title, at.x - 21 * Z, at.y - 21 * Z, 280, 42 * Z);
            var hit = node.gameObject.AddComponent<Image>();
            hit.color = new Color(1, 1, 1, 0);
            var disc = WebLook.Centred(node, "Disc", 21 * Z, 21 * Z, 84 * Z, 84 * Z);
            var di = disc.gameObject.AddComponent<RawImage>();
            di.texture = Resources.Load<Texture2D>($"Icons/menu-node-{mark}{(shut ? "-shut" : "")}");
            di.raycastTarget = false;
            var words = WebLook.Box(node, "Words", 52 * Z, 21 * Z - 20, 220, 40);
            var group = words.gameObject.AddComponent<CanvasGroup>();
            group.alpha = shut ? 0.4f : 1;
            group.blocksRaycasts = false;
            var name = WebLook.Words(WebLook.Box(words, "Name", 0, 0, 220, 18), title.ToUpperInvariant(), 0.62f * 16 * Z, 0.22f, Look.InkSoft, true, 500, TextAlignmentOptions.Left);
            WebLook.Words(WebLook.Box(words, "Holds", 0, 21, 220, 19), sub, 0.68f * 16 * Z, 0, Look.InkFaint, false, 400, TextAlignmentOptions.Left);
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

        // Begin the run (.setup-foot .btn-primary): or carry on the one under way.
        var saved = CampaignView.Saved();
        var begin = WebLook.Button(page, saved != null ? "continue run" : "begin run", () => App.Instance.Run(saved ?? CampaignView.NewRun()), true, 15.3f, 0.24f);
        WebLook.Box((RectTransform)begin.transform, 800 - 116, 910, 232, 53);
    }
}
