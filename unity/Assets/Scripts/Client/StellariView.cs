using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

/// <summary>
/// The Stellari's skill tree (campaign.ts renderShop): the flower at the foot of the sky, half of it below; a branch
/// off each of seven of its petals, each its own colour, its petal deepening the more is learnt; a tier a ring out,
/// the capstone last. A tap learns a point at once (undo or clear takes it back while the tree is open); reset takes
/// every point back for a few petals. Kinship's and Fellowship's first points ask which race first.
/// </summary>
public class StellariView : MonoBehaviour
{
    class Branch { public string g, title, colour; public float dir; }
    class SkillLook { public bool icon; public List<string> say, value; }
    class Looks { public List<Branch> branches; public Dictionary<string, SkillLook> skills; }

    static Looks looks;
    static Sprite ring, half;
    static Texture2D dash;
    const float Tip = 0.345f;
    static readonly float[] Reach = { 0, 0.46f, 0.7f, 0.94f };

    RectTransform root, sky;
    MenuView menu;
    readonly List<string> placed = new List<string>();
    string just, tipFor;
    bool resetArmed;
    (string skill, int? race)? aff;
    float R;
    readonly Dictionary<string, Vector2> pos = new Dictionary<string, Vector2>();

    public static StellariView Make(RectTransform parent, MenuView menu)
    {
        var r = Hud.Rect(parent, "Stellari");
        Hud.Fill(r);
        var v = r.gameObject.AddComponent<StellariView>();
        v.root = r;
        v.menu = menu;
        v.Draw();
        return v;
    }

    static Looks L => looks ??= Newtonsoft.Json.JsonConvert.DeserializeObject<Looks>(Resources.Load<TextAsset>("Engine/upgrades-look").text);

    static Color Hex(string h) => ColorUtility.TryParseHtmlString(h, out var c) ? c : new Color(0.44f, 0.62f, 0.85f);
    static Color Rgb(int v, float a = 1) => new Color(((v >> 16) & 255) / 255f, ((v >> 8) & 255) / 255f, (v & 255) / 255f, a);

    static IEnumerable<MetaUpgrade> Skills => Meta.MetaUpgrades.Where(u => u.Group != "unlock");

    void Draw()
    {
        foreach (Transform c in root) Mats.Kill(c.gameObject);
        var meta = CampaignView.LoadMeta();
        Header(meta);
        // The sky: a true circle of reach R round the Stellari's heart, at the foot of the page.
        sky = Hud.Rect(root, "Sky");
        Hud.At(sky, new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(1100, Hud.H - 96));
        // (The branch alone, as large as the sky lets it be: R the rows' scale, G the gap between skills across a row.)
        R = Mathf.Clamp((Hud.H - 96 - 150) / 1.16f, 96, 620);
        G = Mathf.Clamp((0.5f * 1100 - 220) * 0.9f, 128, 380);
        Layout();
        Flower(meta);
        Lines(meta);
        foreach (var u in Skills.Where(u => u.Group == Shown.g)) Node(meta, u);
        Spin();
        if (tipFor != null) ShowTip(meta, tipFor);
        if (aff != null) Affinity(meta);
    }

    /// <summary>A point of the sky (pixels from the heart, y down as the web's) on the canvas.</summary>
    static Vector2 At(Vector2 p) => new Vector2(p.x, 40 - p.y);

    // The branch shown, and how far the flower is turned to bring its petal straight up (degrees, the web's: clockwise).
    static int branch;
    static float turnGoal = 90, turnNow = 90;
    float G;
    RectTransform wheel;
    Branch Shown => L.branches[branch % L.branches.Count];

    static Vector2 Place(float deg, float k)
    {
        float r = deg * Mathf.Deg2Rad;
        return new Vector2(k * Mathf.Cos(r), k * Mathf.Sin(r));
    }

    /// <summary>
    /// The branch shown laid out in rows straight up from its petal (once the flower has turned it upright): a tier a
    /// row, its skills spread across, each named to its right.
    /// </summary>
    void Layout()
    {
        pos.Clear();
        var own = Skills.Where(u => u.Group == Shown.g).ToList();
        for (int tier = 1; tier <= 3; tier++)
        {
            var row = own.Where(u => (u.Tier ?? 1) == tier).ToList();
            for (int i = 0; i < row.Count; i++)
            {
                float sx = i - (row.Count - 1) / 2f, sy = -(Tip + 0.2f + 0.375f * (tier - 1));
                pos[row[i].Id] = new Vector2(sx * G, sy * R);
            }
        }
    }

    /// <summary>The flower turned on to the next branch (or back), the branch's petal brought straight up.</summary>
    void Turn(int step)
    {
        branch = (branch + step + L.branches.Count) % L.branches.Count;
        float want = 270 - Shown.dir;
        // (Turning the way the arrow points: on to the right, the flower turns anticlockwise.)
        float t = turnGoal - step;
        while ((((t - want) % 360) + 360) % 360 > 0.01f) t -= step;
        turnGoal = t;
        tipFor = null;
        Sound.Play("hover");
        Draw();
    }

    void Update()
    {
        if (wheel == null) return;
        turnNow = Mathf.MoveTowards(turnNow, turnGoal, Time.deltaTime * Mathf.Max(90, Mathf.Abs(turnGoal - turnNow) * 6));
        wheel.localRotation = Quaternion.Euler(0, 0, -turnNow);
    }

    /// <summary>The arrows, at the foot: the branch's name between them, in its colour.</summary>
    void Spin()
    {
        // (As wide as the longest branch's name, whichever is shown: the arrows never move.)
        var nav = Hud.Rect(root, "Spin");
        var name = Hud.Label(nav, Shown.title.ToUpperInvariant(), 12, Color.Lerp(Hex(Shown.colour), Look.Ink, 0.3f), true, 500, 24);
        float widest = L.branches.Max(b => name.GetPreferredValues(b.title.ToUpperInvariant()).x);
        Hud.At(nav, new Vector2(0.5f, 0), new Vector2(0, 14), new Vector2(widest + 2 * (44 + 14), 44));
        for (int d = -1; d <= 1; d += 2)
        {
            int step = d;
            var b = Hud.Rect(nav, d < 0 ? "Back" : "On");
            Hud.At(b, new Vector2(d < 0 ? 0 : 1, 0.5f), Vector2.zero, new Vector2(44, 44));
            var bi = b.gameObject.AddComponent<Image>();
            bi.sprite = Hud.Circle;
            bi.color = new Color(1, 1, 1, 0.85f);
            b.gameObject.AddComponent<Button>().onClick.AddListener(() => Turn(step));
            Hud.Label(b, d < 0 ? "‹" : "›", 26, Look.InkSoft, false, 400, 0).raycastTarget = false;
        }
        name.raycastTarget = false;
    }

    // ---- The header: back, undo, clear, reset; the title and the petals ----

    void Header(MetaState meta)
    {
        var back = Hud.Pill(root, "‹ Back", () => menu.Show("campaign"), 15);
        Hud.At((RectTransform)back.transform, new Vector2(0, 1), new Vector2(26, -26), new Vector2(110, 44));
        float x = 150;
        void Small(string label, System.Action act, Color ink)
        {
            var r = Hud.Rect(root, label);
            Hud.At(r, new Vector2(0, 1), new Vector2(x, -26), new Vector2(18 + label.Length * 11, 44));
            var hit = r.gameObject.AddComponent<Image>();
            hit.color = new Color(1, 1, 1, 0);
            r.gameObject.AddComponent<Button>().onClick.AddListener(() => act());
            Hud.Label(r, label.ToUpperInvariant(), 13, ink, true, 500, 20);
            x += 30 + label.Length * 11;
        }
        if (placed.Count > 0)
        {
            Small("undo", () => Undo(1), Look.InkSoft);
            Small("clear", () => Undo(placed.Count), Look.InkSoft);
        }
        if (Meta.TreePetalsSpent(meta) > 0) Small(resetArmed ? $"confirm reset · {Meta.SkillResetPetals} petals" : $"reset · {Meta.SkillResetPetals} petals", Reset, resetArmed ? Look.Danger : Look.InkSoft);
        var title = Hud.Label(root, "SKILLS", 30, Look.Ink, true, 400, 40, TextAlignmentOptions.Top);
        title.margin = new Vector4(0, 22, 0, 0);
        var purse = Hud.Rect(root, "Purse");
        Hud.At(purse, new Vector2(0.5f, 1), new Vector2(0, -66), new Vector2(200, 30));
        var pi = Hud.Rect(purse, "Petal");
        Hud.At(pi, new Vector2(0.5f, 0.5f), new Vector2(-58, 0), new Vector2(26, 26));
        pi.gameObject.AddComponent<RawImage>().texture = Resources.Load<Texture2D>("Icons/petal");
        var pt = Hud.Label(purse, $"<b>{meta.Petals}</b>  <size=60%><color=#9aa0ac>PETALS</color></size>", 22, Look.Ink, true, 500, 6, TextAlignmentOptions.Left);
        pt.margin = new Vector4(58, 0, 0, 0);
    }

    // ---- The flower, its petals filling in their branches' colours ----

    void Flower(MetaState meta)
    {
        // (The flower 0.9 R across, its petals' tips 0.345 R out.)
        float F = R * 0.9f;
        tipK = R;
        wheel = Hud.Rect(sky, "Wheel");
        wheel.anchorMin = wheel.anchorMax = new Vector2(0.5f, 0);
        wheel.pivot = new Vector2(0.5f, 0.5f);
        wheel.anchoredPosition = At(Vector2.zero);
        wheel.sizeDelta = Vector2.zero;
        wheel.localRotation = Quaternion.Euler(0, 0, -turnNow);
        // Each branch's petal: its outer lobe washed in the branch's colour, deeper the more of it is learnt.
        foreach (var br in L.branches)
        {
            var own = Skills.Where(u => u.Group == br.g).ToList();
            int got = own.Sum(u => Mathf.Min(Meta.LevelOf(meta, u.Id), u.Max)), all = own.Sum(u => u.Max);
            float f = all > 0 ? (float)got / all : 0;
            if (f <= 0) continue;
            float deg = Mathf.Round(br.dir / 30) * 30;
            var lobe = Hud.Rect(wheel, "Petal " + br.g);
            lobe.anchorMin = lobe.anchorMax = new Vector2(0.5f, 0.5f);
            lobe.pivot = new Vector2(0.5f, 0);
            lobe.anchoredPosition = Vector2.zero;
            // (The flower's petals: ellipses 95 by 330 round its heart, in a flower 860 across.)
            lobe.sizeDelta = new Vector2(F * 190 / 860f, F * 330 / 860f);
            // (Pointing its way: web degrees run clockwise from the right, y down.)
            lobe.localRotation = Quaternion.Euler(0, 0, -(deg - 270));
            var img = lobe.gameObject.AddComponent<Image>();
            img.sprite = HalfEllipse;
            var c = Hex(br.colour);
            c.a = 0.06f + 0.26f * f;
            img.color = c;
            img.raycastTarget = false;
        }
        var fl = Hud.Rect(wheel, "Flower");
        fl.anchorMin = fl.anchorMax = new Vector2(0.5f, 0.5f);
        fl.pivot = new Vector2(0.5f, 0.5f);
        fl.anchoredPosition = Vector2.zero;
        fl.sizeDelta = new Vector2(F, F);
        var raw = fl.gameObject.AddComponent<RawImage>();
        raw.texture = Resources.Load<Texture2D>("Icons/up-flower");
        raw.raycastTarget = false;
    }

    // ---- The stems and links: dashed until learnt ----

    float tipK;

    void Lines(MetaState meta)
    {
        // A stem up from the petal's tip to each first skill: across beneath the row and up, when there are two or more.
        var firsts = Skills.Where(u => u.Group == Shown.g && (u.Tier ?? 1) == 1).ToList();
        var tip = new Vector2(0, -Tip * tipK);
        var mid = new Vector2(0, -(Tip + 0.07f) * R);
        foreach (var u in firsts)
        {
            bool lit = Meta.LevelOf(meta, u.Id) > 0;
            var to = pos[u.Id];
            if (firsts.Count > 1)
            {
                var under = new Vector2(to.x, mid.y);
                if (u == firsts[0]) Line(tip, mid, lit);
                Line(mid, under, lit);
                Line(under, to, lit);
            }
            else Line(tip, to, lit);
        }
        foreach (var u in Skills.Where(u => u.Group == Shown.g))
            foreach (var r in u.Requires ?? new List<MetaRequirement>())
                if (pos.ContainsKey(r.Id)) Line(pos[r.Id], pos[u.Id], Meta.LevelOf(meta, u.Id) > 0);
    }

    void Line(Vector2 a, Vector2 b, bool lit)
    {
        Vector2 p = At(a), q = At(b), d = q - p;
        var r = Hud.Rect(sky, "Line");
        r.anchorMin = r.anchorMax = new Vector2(0.5f, 0);
        r.pivot = new Vector2(0, 0.5f);
        r.anchoredPosition = p;
        r.sizeDelta = new Vector2(d.magnitude, 1.4f);
        r.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
        var img = r.gameObject.AddComponent<RawImage>();
        img.raycastTarget = false;
        if (lit) { img.texture = Texture2D.whiteTexture; img.color = new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.55f); }
        else
        {
            img.texture = Dash;
            img.uvRect = new Rect(0, 0, d.magnitude / 7f, 1);
            img.color = Rgb(0xcfd3db);
        }
    }

    // ---- A skill: a disc, its mark, a ring of its levels ----

    void Node(MetaState meta, MetaUpgrade u)
    {
        int tier = u.Tier ?? 1;
        int level = Mathf.Min(Meta.LevelOf(meta, u.Id), u.Max);
        int had = Mathf.Max(0, level - placed.Count(x => x == u.Id));
        bool maxed = level >= u.Max, open = Meta.UpgradeOpen(meta, u.Id);
        string why = maxed ? null : Meta.BuyUpgradeProblem(meta, u.Id);
        float size = tier == 3 ? 40 : 30;
        var n = Hud.Rect(sky, u.Id);
        n.anchorMin = n.anchorMax = new Vector2(0.5f, 0);
        n.pivot = new Vector2(0.5f, 0.5f);
        n.anchoredPosition = At(pos[u.Id]);
        n.sizeDelta = new Vector2(size, size);
        if (u.Id == tipFor) n.localScale = Vector3.one * 1.12f;
        // (A capstone: a faint ring round it.)
        if (tier == 3)
        {
            var halo = Hud.Rect(n, "Halo");
            Hud.Fill(halo);
            halo.offsetMin = new Vector2(-7, -7);
            halo.offsetMax = new Vector2(7, 7);
            var hi = halo.gameObject.AddComponent<Image>();
            hi.sprite = Ring;
            hi.color = new Color(58 / 255f, 66 / 255f, 86 / 255f, 0.18f);
            hi.raycastTarget = false;
        }
        var disc = n.gameObject.AddComponent<Image>();
        disc.sprite = Hud.Circle;
        disc.color = open ? Color.white : Rgb(0xf6f7f9);
        // Its ring: a segment a level (learnt inked; placed this visit blue; still to learn pale).
        float C = 2 * Mathf.PI * 22, g = u.Max > 1 ? 7 : 0;
        for (int i = 0; i < u.Max; i++)
        {
            var seg = Hud.Rect(n, "Level " + i);
            Hud.Fill(seg);
            seg.offsetMin = new Vector2(-3, -3);
            seg.offsetMax = new Vector2(3, 3);
            var s = seg.gameObject.AddComponent<Image>();
            s.sprite = Ring;
            s.type = Image.Type.Filled;
            s.fillMethod = Image.FillMethod.Radial360;
            s.fillOrigin = (int)Image.Origin360.Top;
            s.fillClockwise = true;
            s.fillAmount = (C / u.Max - g) / C;
            seg.localRotation = Quaternion.Euler(0, 0, -(i * 360f / u.Max + g / C * 180));
            s.color = i < had ? Rgb(0x3a4256) : i < level ? Rgb(0x6f9fd8) : Rgb(0xe3e6ec);
            s.raycastTarget = false;
        }
        var mark = Hud.Rect(n, "Mark");
        Hud.At(mark, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.one * (tier == 3 ? 16 : 13));
        var mi = mark.gameObject.AddComponent<RawImage>();
        mi.texture = Resources.Load<Texture2D>("Icons/up-" + u.Id);
        mi.color = !open ? Rgb(0xc8ccd6) : had > 0 ? Rgb(0x3a4256) : level > had ? Rgb(0x4f7fc0) : Rgb(0x9aa1b2);
        mi.raycastTarget = false;
        // (One to learn now: a small dot, pulsing.)
        if (why == null && !maxed && level == 0)
        {
            var dot = Hud.Rect(n, "Ready");
            Hud.At(dot, new Vector2(1, 1), new Vector2(3, 3), new Vector2(7, 7));
            var di = dot.gameObject.AddComponent<Image>();
            di.sprite = Hud.Circle;
            di.color = Rgb(0x3a4256);
            di.raycastTarget = false;
        }
        if (level > had)
        {
            var plus = Hud.Rect(n, "Plus");
            Hud.At(plus, new Vector2(0.5f, 1), new Vector2(16, 9), new Vector2(24, 14));
            var pi = plus.gameObject.AddComponent<Image>();
            pi.sprite = Hud.Circle;
            pi.type = Image.Type.Sliced;
            pi.color = Rgb(0x6f9fd8);
            Hud.Label(plus, $"+{level - had}", 9, Color.white, true, 500, 0);
        }
        // Its name to its right, and what it gives.
        L.skills.TryGetValue(u.Id, out var look);
        var words = Hud.Rect(n, "Words");
        Hud.At(words, new Vector2(1, 0.5f), new Vector2(4, 0), new Vector2(Mathf.Min(170, G - 34), 60));
        words.pivot = new Vector2(0, 0.5f);
        var nm = Hud.Label(words, u.Name.ToUpperInvariant(), 10, open ? Look.InkSoft : Rgb(0xb9bdc8), true, 500, 14, TextAlignmentOptions.BottomLeft);
        nm.margin = new Vector4(6, 0, 0, 32);
        var say = Hud.Label(words, look != null ? look.say[Mathf.Max(level, 1) - 1] : u.Text, 12, open ? Look.InkFaint : Rgb(0xc8ccd6), false, 400, 0, TextAlignmentOptions.TopLeft);
        say.textWrappingMode = TextWrappingModes.Normal;
        say.margin = new Vector4(6, 31, 0, 0);
        nm.raycastTarget = say.raycastTarget = false;
        var b = n.gameObject.AddComponent<Button>();
        b.targetGraphic = disc;
        var id = u.Id;
        b.onClick.AddListener(() => Pick(id));
        var hover = n.gameObject.AddComponent<EventTrigger>();
        var enter = new EventTrigger.Entry { eventID = EventTriggerType.PointerEnter };
        enter.callback.AddListener(_ => { tipFor = id; ShowTip(CampaignView.LoadMeta(), id); });
        hover.triggers.Add(enter);
    }

    // ---- Its tip: its name, what it gives now, what the next point makes it, its price ----

    GameObject tip;

    void ShowTip(MetaState meta, string id)
    {
        if (tip != null) Mats.Kill(tip);
        var u = Meta.MetaUpgrade(id);
        if (u == null || !pos.ContainsKey(id)) return;
        int level = Mathf.Min(Meta.LevelOf(meta, id), u.Max);
        bool maxed = level >= u.Max;
        L.skills.TryGetValue(id, out var look);
        string vals = look != null ? look.say[Mathf.Max(level, 1) - 1] : u.Text;
        var next = new List<string>();
        if (look != null && look.icon && level > 0 && !maxed) next.Add("Next: " + look.value[level]);
        if (!maxed) next.Add($"{Meta.PointCost(u)} petals");
        var why = maxed ? null : Meta.BuyUpgradeProblem(meta, id);
        var p = At(pos[id]);
        var panel = Hud.Glass(sky, "Tip", Look.GlassStrong);
        tip = panel.gameObject;
        var r = (RectTransform)panel.transform;
        r.anchorMin = r.anchorMax = new Vector2(0.5f, 0);
        // (Beside it, on the side with room.)
        bool left = p.x > 0;
        r.pivot = new Vector2(left ? 1 : 0, 0.5f);
        r.anchoredPosition = p + new Vector2(left ? -34 : 34, 0);
        r.sizeDelta = new Vector2(300, 118);
        var t = Hud.Label(panel.transform, $"<b>{u.Name.ToUpperInvariant()}</b>\n<size=80%>{vals}</size>\n<size=62%><color=#9aa0ac>{string.Join(" · ", next).ToUpperInvariant()}</color>{(why != null && !maxed ? $"\n<color=#b0b5c0>{why}</color>" : "")}</size>", 15, Look.Ink, true, 500, 4, TextAlignmentOptions.Left);
        t.textWrappingMode = TextWrappingModes.Normal;
        t.margin = new Vector4(18, 10, 18, 10);
        t.raycastTarget = false;
        panel.raycastTarget = false;
    }

    // ---- Learning, undoing, resetting ----

    void Pick(string id)
    {
        var meta = CampaignView.LoadMeta();
        tipFor = id;
        // (Kinship's or Fellowship's first point: its race picked first.)
        bool affinity = id == Meta.AffinitySkill["primary"] || id == Meta.AffinitySkill["secondary"];
        if (affinity && Meta.LevelOf(meta, id) == 0 && Meta.BuyUpgradeProblem(meta, id) == null)
        {
            aff = (id, null);
            Sound.Play("hover");
            Draw();
            return;
        }
        var why = Meta.BuyUpgradeProblem(meta, id);
        if (why != null)
        {
            Sound.Play("error");
            Draw();
            return;
        }
        // (A battery charging up, higher with each point already in it.)
        Sound.Play("charge-" + Mathf.Clamp(Meta.LevelOf(meta, id), 0, 3));
        CampaignView.SaveMeta(Meta.BuyUpgrade(meta, id));
        placed.Add(id);
        just = id;
        resetArmed = false;
        Draw();
    }

    void Undo(int n)
    {
        var meta = CampaignView.LoadMeta();
        for (int i = 0; i < n && placed.Count > 0; i++)
        {
            meta = Meta.RefundUpgrade(meta, placed[placed.Count - 1]);
            placed.RemoveAt(placed.Count - 1);
        }
        CampaignView.SaveMeta(meta);
        just = null;
        Sound.Play("hover");
        Draw();
    }

    void Reset()
    {
        var meta = CampaignView.LoadMeta();
        var why = Meta.ResetSkillsProblem(meta);
        if (why != null) { resetArmed = false; Sound.Play("error"); Draw(); return; }
        if (!resetArmed) { resetArmed = true; Sound.Play("hover"); Draw(); return; }
        resetArmed = false;
        CampaignView.SaveMeta(Meta.ResetSkills(meta));
        placed.Clear();
        just = null;
        Sound.Play("upgrade");
        Draw();
    }

    // ---- Kinship's or Fellowship's first point: which race ----

    void Affinity(MetaState meta)
    {
        var (skill, race) = aff.Value;
        bool primary = skill == Meta.AffinitySkill["primary"];
        int? other = primary ? meta.Affinity?.Secondary : meta.Affinity?.Primary;
        var veil = Hud.Rect(root, "Affinity");
        Hud.Fill(veil);
        var vi = veil.gameObject.AddComponent<Image>();
        vi.color = new Color(0.97f, 0.97f, 0.96f, 0.6f);
        veil.gameObject.AddComponent<Button>().onClick.AddListener(() => { aff = null; Draw(); });
        var pop = Hud.Glass(veil, "Pop", Look.GlassStrong);
        Hud.At((RectTransform)pop.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(560, 330));
        pop.gameObject.AddComponent<Button>();
        var u = Meta.MetaUpgrade(skill);
        var h = Hud.Label(pop.transform, $"{u.Name.ToUpperInvariant()}\n<size=70%><color=#737780>{(primary ? "Which race do you favour?" : "And which race besides?")}</color></size>", 22, Look.Ink, true, 500, 20, TextAlignmentOptions.Top);
        h.margin = new Vector4(0, 24, 0, 0);
        for (int i = 0; i < Modes.CoreRaces.Length; i++)
        {
            int r = Modes.CoreRaces[i];
            bool taken = other == r;
            var cell = Hud.Rect(pop.transform, "Race " + r);
            Hud.At(cell, new Vector2(0.5f, 0.5f), new Vector2(-195 + i * 130, 0), new Vector2(110, 120));
            var hit = cell.gameObject.AddComponent<Image>();
            hit.color = race == r ? new Color(0.23f, 0.26f, 0.34f, 0.08f) : new Color(1, 1, 1, 0);
            var b = cell.gameObject.AddComponent<Button>();
            b.interactable = !taken;
            b.onClick.AddListener(() => { aff = (skill, r); Sound.Play("hover"); Draw(); });
            var em = Hud.Rect(cell, "Emblem");
            Hud.At(em, new Vector2(0.5f, 1), new Vector2(0, -6), new Vector2(64, 64));
            var ei = em.gameObject.AddComponent<RawImage>();
            ei.texture = Resources.Load<Texture2D>($"Icons/faction-f{r + 1}");
            ei.color = taken ? new Color(1, 1, 1, 0.35f) : Color.white;
            ei.raycastTarget = false;
            var nm = Hud.Label(cell, Races.RaceNames[r].ToLowerInvariant() + (taken ? $"\n<size=70%><color=#b0b5c0>{(primary ? "fellowship" : "kinship")}</color></size>" : ""), 13, race == r ? Look.Ink : Look.InkSoft, true, 500, 6, TextAlignmentOptions.Bottom);
            nm.margin = new Vector4(0, 0, 0, 4);
        }
        var cancel = Hud.Pill(pop.transform, "cancel", () => { aff = null; Draw(); }, 14);
        Hud.At((RectTransform)cancel.transform, new Vector2(0.5f, 0), new Vector2(-110, 26), new Vector2(170, 48));
        var why = Meta.BuyUpgradeProblem(meta, skill);
        var ok = Hud.Pill(pop.transform, $"confirm · {Meta.PriceOf(u, 0)} petals", () =>
        {
            var m = CampaignView.LoadMeta();
            if (aff?.race == null || Meta.BuyUpgradeProblem(m, skill) != null) { Sound.Play("error"); return; }
            m = Meta.SetAffinity(Meta.BuyUpgrade(m, skill), primary ? "primary" : "secondary", aff.Value.race);
            CampaignView.SaveMeta(m);
            placed.Add(skill);
            just = skill;
            aff = null;
            Sound.Play("upgrade");
            Draw();
        }, 14, race != null && why == null ? Look.Ink : Look.GlassStrong, race != null && why == null ? Color.white : Look.InkFaint);
        ok.interactable = race != null && why == null;
        Hud.At((RectTransform)ok.transform, new Vector2(0.5f, 0), new Vector2(110, 26), new Vector2(210, 48));
    }

    // ---- Sprites: a ring (a level's arc), half an ellipse (a petal's lobe), a dash ----

    static Sprite Ring
    {
        get
        {
            if (ring != null) return ring;
            const int S = 128;
            var t = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            float rad = 22f / 24 * S / 2, w = 2.4f / 48 * S;
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float d = Mathf.Abs(new Vector2(x + 0.5f - S / 2f, y + 0.5f - S / 2f).magnitude - rad);
                    t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(w / 2 - d + 0.5f)));
                }
            t.Apply();
            return ring = Sprite.Create(t, new Rect(0, 0, S, S), new Vector2(0.5f, 0.5f));
        }
    }

    static Sprite HalfEllipse
    {
        get
        {
            if (half != null) return half;
            const int W = 64, H = 256;
            var t = new Texture2D(W, H, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    float u = (x + 0.5f) / W * 2 - 1, v = (y + 0.5f) / H;
                    float e = Mathf.Sqrt(u * u + v * v);
                    t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01((1 - e) * 60)));
                }
            t.Apply();
            return half = Sprite.Create(t, new Rect(0, 0, W, H), new Vector2(0.5f, 0));
        }
    }

    static Texture2D Dash
    {
        get
        {
            if (dash != null) return dash;
            dash = new Texture2D(8, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Point };
            for (int x = 0; x < 8; x++) dash.SetPixel(x, 0, new Color(1, 1, 1, x < 4 ? 1 : 0));
            dash.Apply();
            return dash;
        }
    }
}
