using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using K = MenuKit;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// A campaign hero's battle skills and a relic's powers (app.ts renderTurnControls, renderRelicPanel): the skills as
/// pills above End Day, each its hero's face, its name, once or daily and its cost; the relics' powers as tokens down the
/// right of the screen (as on the map), each its painted badge with what it does marked over it, and a relic that counts
/// the day's attacks as a token filling a ring a third at a time. A token tapped shows its power in the preview pane, to
/// use or not. Your day begun, each once-a-day relic ready to use pulses once (nudgeDailyRelics). The hero's and the
/// relic's panes close with a tap anywhere else, and the tap still does what it does there (app.ts onClick).
/// </summary>
public partial class BattleView
{
    RectTransform emblems, relicColumn, relicPane;
    /// <summary>The relic power shown in the preview pane (its index among your skills), if any (app.ts relicPanel).</summary>
    int? relicPanel;
    string emblemsKey;
    int nudgedTurn = -1;
    float nudgeAt = -10;
    /// <summary>Presses of the pointer, counted; and the one that last put your Hero's picks away (tapping the Hero toggles them).</summary>
    int press, heroShutPress = -1;

    /// <summary>app.ts canAct() && phase === 'day', and nothing being played (!pending): what may be called on now.</summary>
    bool EmblemsAct => state != null && MyDay && Dawn == null && Time.time >= dayFrom && pending == null && attacker == null && discarding == null;

    /// <summary>Laid out again when what they show changes (each frame asked: the day coming in readies them).</summary>
    void Emblems()
    {
        if (hud == null || chrome == null) return;
        if (emblems == null)
        {
            emblems = Hud.Rect(hud.transform, "Emblems");
            Hud.Fill(emblems);
            emblems.gameObject.AddComponent<EmblemTicker>().View = this;
        }
        // (Over the stage (z 15) with End Day (z 16), under the Hero's picks and the sheets.)
        emblems.SetSiblingIndex(chrome.GetSiblingIndex() + 1);
        HeroRails();
        bool shown = state != null && !Autoplay && state.WinnerId == null;
        var skills = shown ? Me.Skills ?? new List<BattleSkill>() : new List<BattleSkill>();
        if (relicPanel != null && (relicPanel.Value >= skills.Count || skills[relicPanel.Value].Relic == null)) relicPanel = null;
        bool act = EmblemsAct;
        bool paneFree = StageNow().defId == null;
        string key = EmblemsKey();
        if (key == emblemsKey) return;
        emblemsKey = key;
        foreach (Transform c in emblems) Mats.Kill(c.gameObject);
        relicColumn = relicPane = null;
        if (!shown) return;
        // (A relic in the preview pane: only while no card is shown there, app.ts renderStage.)
        if (relicPanel != null && paneFree) RelicPane(relicPanel.Value, act);
        HeroSkills(skills, act);
        RelicTokens(skills, act);
    }

    /// <summary>What the emblems are drawn for: the state, whether they may be used, the relic shown, the pane free, the page's size.</summary>
    string EmblemsKey()
    {
        var l = BoardLayout.Current;
        if (state == null || Autoplay || state.WinnerId != null) return null;
        return $"{System.Runtime.CompilerServices.RuntimeHelpers.GetHashCode(state)}|{EmblemsAct}|{relicPanel}|{StageNow().defId == null}|{l.W}x{l.H}";
    }

    // ---- The hero's skills ----

    /// <summary>
    /// .hero-skills: above End Day (at the page's right padding, max(14px, --pad-b) + clamp(96px, 18vh, 124px) up), as
    /// wide as it (clamp(120px, 14vw, 190px)), 6 px apart. Each .hero-skill: a white pill (14 px corners, 92%, a white
    /// hairline) ringed in gold (0 0 0 1.5px) over the soft shadow; its hero's face (26 px, round) at its left, 8 px from
    /// its name (0.56rem display 600, 0.12em, capitals) over "once" or "daily" and its cost (0.56rem, 0.08em, amber).
    /// One that can't be used now pale (0.5) and unringed; used, paler still (0.35).
    /// </summary>
    void HeroSkills(List<BattleSkill> skills, bool act)
    {
        var l = BoardLayout.Current;
        var mine = Enumerable.Range(0, skills.Count).Where(i => skills[i].Relic == null).ToList();
        if (mine.Count == 0) return;
        float cw = Css.Clamp(120, 14 * l.Vw, 190), ph = 1 + 6 + 26 + 6 + 1, gap = 6;
        float bottom = l.H - (Mathf.Max(14, l.PadB) + Css.Clamp(96, 18 * l.Vh, 124));
        float top = bottom - (mine.Count * ph + (mine.Count - 1) * gap), x = l.W - l.PadR - cw;
        const float size = 8.96f;
        for (int n = 0; n < mine.Count; n++)
        {
            int i = mine[n];
            var k = skills[i];
            var why = Game.HeroSkillProblem(state, Me, i);
            bool spent = k.Spent == true || (k.Once != true && k.UsedTurn == state.TurnNumber);
            bool off = why != null || !act;
            var pill = Hud.Box(emblems, $"Skill {k.Name}", new Color(1, 1, 1, 0.92f), 14);
            Hud.Place(pill.rectTransform, x, top + n * (ph + gap), cw, ph);
            // (box-shadow: 0 0 0 1.5px gold (not when it can't be used), then --shadow: 0 8px 30px, 0 2px 6px.)
            var drops = new List<Hud.Drop>();
            if (!off) drops.Add(new Hud.Drop(Hud.Rgba(212, 165, 42, 0.55f), 0, 0, 1.5f));
            drops.Add(new Hud.Drop(Hud.Rgba(90, 90, 110, 0.13f), 8, 30));
            drops.Add(new Hud.Drop(Hud.Rgba(90, 90, 110, 0.07f), 2, 6));
            Hud.Shadow(pill, 14, drops.ToArray());
            pill.gameObject.AddComponent<CanvasGroup>().alpha = spent ? 0.35f : off ? 0.5f : 1;
            // Its hero's face (.hero-skill-face: cardArtLite in a 26 px disc), across both its rows.
            var disc = WebLook.Rounded(pill.transform, "Face", Look.Ink, 999);
            Hud.Place(disc.rectTransform, 1 + 6, 1 + 6, 26, 26);
            disc.gameObject.AddComponent<Mask>().showMaskGraphic = true;
            var art = Hud.Rect(disc.transform, "Art");
            Hud.Fill(art);
            var ai = art.gameObject.AddComponent<RawImage>();
            ai.texture = EngineData.Art(k.Hero);
            ai.enabled = ai.texture != null;
            ai.raycastTarget = false;
            // Its name over when it may be used (and its cost, as green dots).
            float tx = 1 + 6 + 26 + 8, tw = cw - tx - 10 - 1;
            var name = Hud.Text(pill.transform, k.Name.ToUpperInvariant(), tx, 1 + 6 + 13 / 2f - K.LineH(size) / 2, tw, K.LineH(size), size, Look.Ink, true, 600, 12, TextAlignmentOptions.MidlineLeft);
            Hud.Ellipsis(name);
            string when = k.Once == true ? "once" : "daily";
            var small = Hud.Text(pill.transform, when, tx, 1 + 6 + 13 + 13 / 2f - K.LineH(size, false) / 2, tw, K.LineH(size, false), size, Hud.Rgba(168, 109, 16), false, 400, 8, TextAlignmentOptions.MidlineLeft);
            if (k.Cost > 0)
            {
                // (keywordHtml('cost'): after a space, a dot per energy, 0.78em, a 0.12em white edge and a green glow, 0.18em apart.)
                float dx = tx + small.GetPreferredValues(when + " ").x, d = 0.78f * size, cy = 1 + 6 + 13 + 13 / 2f + 0.05f * size;
                for (int e = 0; e < k.Cost; e++)
                {
                    var dot = WebLook.Rounded(pill.transform, "Energy", Color.white, 999);
                    Hud.Place(dot.rectTransform, dx + e * (d + 0.18f * size), cy - d / 2, d, d);
                    Hud.Shadow(dot, d / 2, new Hud.Drop(Hud.Rgba(110, 196, 146, 0.75f), 0, 6), new Hud.Drop(Hud.Rgba(20, 40, 30, 0.35f), 1, 2));
                    var core = WebLook.Rounded(dot.transform, "Core", Hud.Rgba(124, 199, 154), 999);
                    Hud.Fill(core.rectTransform);
                    core.rectTransform.offsetMin = Vector2.one * 0.12f * size;
                    core.rectTransform.offsetMax = -Vector2.one * 0.12f * size;
                }
            }
            if (off) continue;
            pill.raycastTarget = true;
            var b = pill.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            int index = i;
            b.onClick.AddListener(() => { Sound.Play("click"); UseSkill(index); });
        }
    }

    /// <summary>app.ts 'hero-skill': a skill or a relic's power called on (its sound as it lands: HeroMoved).</summary>
    void UseSkill(int index)
    {
        relicPanel = null;
        emblemsKey = null;
        var why = Game.HeroSkillProblem(state, Me, index);
        if (why != null) { Refresh(); Say(why); return; }
        Do(new EngineAction { Type = "heroSkill", Index = index });
    }

    // ---- The relics' tokens ----

    /// <summary>
    /// .relic-actives: a column down the right of the screen (2 px in from the page's padding, its middle the page's),
    /// 4 px padded, the tokens 12 px apart (8 on a phone). Each .cmp-relic 40 px (32 on a phone), its painted badge
    /// softly shadowed, bobbing 2 px (cmp-token-float, 5 s, every other half a beat behind); ready to use, a gold glow;
    /// used, grey and faint (0.45); open, 1.12 times as large. The attack counter first, its tally under it.
    /// </summary>
    void RelicTokens(List<BattleSkill> skills, bool act)
    {
        var l = BoardLayout.Current;
        var relics = Enumerable.Range(0, skills.Count).Where(i => skills[i].Relic != null).ToList();
        var tally = Relics.RelicOf(Me.Relics, "flurry");
        if (relics.Count == 0 && tally == null) return;
        float d = l.Phone ? 32 : 40, gap = l.Phone ? 8 : 12;
        int count = relics.Count + (tally != null ? 1 : 0);
        float h = 4 + count * d + (count - 1) * gap + (tally != null ? 14 : 0) + 4;
        relicColumn = Hud.Rect(emblems, "Relics");
        Hud.Place(relicColumn, l.W - (l.PadR + 2) - 4 - d, l.H / 2 - h / 2 + 4, d, h - 8);
        float y = 0;
        int child = 0;
        bool myTurn = Game.ActivePlayer(state).Id == you;
        if (tally != null)
        {
            // (A relic that counts the day's attacks: a ring round its token fills a third with each, and its tally
            // under it; full, it glows as one ready.)
            int done = myTurn ? Mathf.Min(3, Me.Turn?.Attacks ?? 0) : 0;
            var t = Token(relicColumn, new Relic { Name = tally.Name, Slot = "weapon" }, null, y, d, done >= 3, false, false, child++, null);
            var ring = Hud.Rect(t, "Count ring");
            Hud.Fill(ring);
            ring.offsetMin = -Vector2.one * 5;
            ring.offsetMax = Vector2.one * 5;
            var ri = ring.gameObject.AddComponent<Image>();
            ri.sprite = RingSprite(d + 10, 2);
            ri.type = Image.Type.Filled;
            ri.fillMethod = Image.FillMethod.Radial360;
            ri.fillOrigin = (int)Image.Origin360.Top;
            ri.fillClockwise = true;
            ri.fillAmount = done / 3f;
            ri.color = Hud.Rgba(201, 162, 78);
            ri.raycastTarget = false;
            // (Its tally: 0.5rem display 600, 0.08em, on a white pill 5 px padded, just under the token.)
            string n = $"{done}/3";
            float tw = K.TextW(n, 8, 600, 0.08f) + 0.08f * 8 + 10;
            var tag = Hud.Box(t, "Tally", Color.white, 6);
            Hud.Place(tag.rectTransform, d / 2 - tw / 2, d, tw, 12);
            WebLook.Shadow(tag, 1, 4, Hud.Rgba(60, 70, 100, 0.2f), 6);
            Hud.Label(tag.transform, n, 8, Look.Ink, true, 600, 8);
            y += d + 14 + gap;
        }
        float nudgeIndex = 0;
        foreach (int i in relics)
        {
            var k = skills[i];
            var why = Game.HeroSkillProblem(state, Me, i);
            bool ready = why == null && act;
            bool used = k.Spent == true || (k.Once != true && k.UsedTurn == state.TurnNumber);
            // (Your day begun: each once-a-day relic ready to use pulses once, 0.14 s after the one before.)
            float? nudge = ready && k.Once != true ? nudgeAt + 0.14f * nudgeIndex++ : (float?)null;
            int index = i;
            // (Its face what it does, where the power has one clear effect (relicFace): else the relic's badge, marked.)
            var t = Token(relicColumn, new Relic { Name = k.Relic, Slot = "" }, RelicActionMark(k), y, d, ready, used, relicPanel == i, child++, nudge, RelicFace(k));
            var img = t.GetComponent<Image>();
            img.raycastTarget = true;
            var b = t.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            b.onClick.AddListener(() =>
            {
                Sound.Play("click");
                // (app.ts 'relic-panel': tapped again, it closes; your Hero's picks put away.)
                relicPanel = relicPanel == index ? (int?)null : index;
                if (heroPanel != null && heroPanel.gameObject.activeSelf) { heroPanel.gameObject.SetActive(false); stageKey = null; }
                Sound.Play("hover");
                emblemsKey = null;
                Refresh();
            });
            y += d + gap;
        }
    }

    /// <summary>One token (.cmp-relic in .relic-actives) at `y` in its column: its badge, its power's mark, its looks.</summary>
    RectTransform Token(RectTransform column, Relic relic, string mark, float y, float d, bool ready, bool used, bool open, int child, float? nudge, Texture2D face = null)
    {
        var t = Hud.Rect(column, relic.Name);
        Hud.Place(t, 0, y, d, d);
        // (A clear disc to tap, its shadows: ready, a gold glow 0 0 14px 4px; else 0 3px 8px and 0 1px 2px. Round, as
        // the web's, soft all the way: no box round the token.)
        var disc = t.gameObject.AddComponent<Image>();
        WebLook.Round(disc, 999);
        disc.color = new Color(1, 1, 1, 0);
        disc.raycastTarget = false;
        RoundShade(t, d, ready
            ? new[] { new Hud.Drop(Hud.Rgba(222, 178, 90, 0.55f), 0, 14, 4), new Hud.Drop(Hud.Rgba(30, 34, 50, 0.3f), 3, 8) }
            : new[] { new Hud.Drop(Hud.Rgba(30, 34, 50, 0.3f), 3, 8), new Hud.Drop(Hud.Rgba(30, 34, 50, 0.25f), 1, 2) });
        var badge = Hud.Rect(t, "Badge");
        Hud.Fill(badge);
        var bi = badge.gameObject.AddComponent<RawImage>();
        bi.texture = face != null ? face : CampaignView.RelicArt(relic);
        bi.raycastTarget = false;
        if (mark != null && face == null)
        {
            var m = Hud.Rect(t, "Action");
            Hud.Fill(m);
            var mi = m.gameObject.AddComponent<RawImage>();
            mi.texture = Resources.Load<Texture2D>($"Icons/relic-action/{mark}");
            mi.raycastTarget = false;
            if (used) mi.material = Greyed();
        }
        // (Used: filter grayscale(1), opacity 0.45, still.)
        if (used)
        {
            bi.material = Greyed();
            t.gameObject.AddComponent<CanvasGroup>().alpha = 0.45f;
        }
        else
        {
            var bob = t.gameObject.AddComponent<CampaignView.Bob>();
            bob.Height = 2;
            bob.Period = 5;
            bob.Delay = child % 2 == 1 ? -2.5f : 0;
        }
        var pulse = t.gameObject.AddComponent<TokenPulse>();
        pulse.Open = open;
        pulse.NudgeAt = nudge;
        pulse.Glow = disc;
        return t;
    }

    static readonly Dictionary<string, Texture2D> shades = new Dictionary<string, Texture2D>();

    /// <summary>
    /// A round token's box-shadows (`drops`, the first on top), drawn as the web draws them round a circle: soft discs,
    /// blurred as CSS blurs (a Gaussian of half the blur), painted only outside the token. (The page's shared shadows
    /// are rounded boxes: round a 40 px disc, a 2 px blur's was a hard grey square showing at its corners.) As the
    /// token's first child, so it bobs, swells and fades with it.
    /// </summary>
    static void RoundShade(RectTransform token, float d, Hud.Drop[] drops)
    {
        float m = 0;
        foreach (var dr in drops) m = Mathf.Max(m, dr.Spread + 1.5f * dr.Blur + Mathf.Abs(dr.Y) + Mathf.Abs(dr.X));
        m = Mathf.Ceil(m);
        string key = $"{d}|{string.Join(";", drops.Select(x => $"{x.Color}/{x.X}/{x.Y}/{x.Blur}/{x.Spread}"))}";
        if (!shades.TryGetValue(key, out var tex) || tex == null)
        {
            const float k = 3;
            float size = d + 2 * m;
            int n = Mathf.CeilToInt(size * k);
            tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color32[n * n];
            float r0 = d / 2;
            for (int j = 0; j < n; j++)
                for (int i = 0; i < n; i++)
                {
                    // (CSS px from the token's middle, y down; the texture's rows run up.)
                    float x = (i + 0.5f) / k - size / 2, y = size / 2 - (j + 0.5f) / k;
                    float pr = 0, pg = 0, pb = 0, pa = 0;
                    for (int q = drops.Length - 1; q >= 0; q--)
                    {
                        var dr = drops[q];
                        float dist = Mathf.Sqrt((x - dr.X) * (x - dr.X) + (y - dr.Y) * (y - dr.Y)) - (r0 + dr.Spread);
                        float cover = dr.Blur > 0 ? 0.5f * Erfc(dist / (dr.Blur / 2 * 1.41421356f)) : Mathf.Clamp01(0.5f - dist * k);
                        float a = dr.Color.a * cover;
                        pr = dr.Color.r * a + pr * (1 - a);
                        pg = dr.Color.g * a + pg * (1 - a);
                        pb = dr.Color.b * a + pb * (1 - a);
                        pa = a + pa * (1 - a);
                    }
                    // (Its own colour, not premultiplied; and not under the token itself.)
                    float inv = pa > 0.0001f ? 1 / pa : 0;
                    pa *= Mathf.Clamp01((Mathf.Sqrt(x * x + y * y) - r0) * k + 0.5f);
                    px[j * n + i] = new Color32((byte)Mathf.RoundToInt(Mathf.Clamp01(pr * inv) * 255), (byte)Mathf.RoundToInt(Mathf.Clamp01(pg * inv) * 255), (byte)Mathf.RoundToInt(Mathf.Clamp01(pb * inv) * 255), (byte)Mathf.RoundToInt(pa * 255));
                }
            tex.SetPixels32(px);
            tex.Apply();
            shades[key] = tex;
        }
        var s = Hud.Rect(token, "Shade");
        Hud.Fill(s);
        s.offsetMin = -Vector2.one * m;
        s.offsetMax = Vector2.one * m;
        s.SetAsFirstSibling();
        var ri = s.gameObject.AddComponent<RawImage>();
        ri.texture = tex;
        ri.raycastTarget = false;
    }

    /// <summary>The complementary error function (Abramowitz and Stegun 7.1.26), for a Gaussian blur's edge.</summary>
    static float Erfc(float x)
    {
        float z = Mathf.Abs(x), t = 1 / (1 + 0.3275911f * z);
        float y = t * (0.254829592f + t * (-0.284496736f + t * (1.421413741f + t * (-1.453152027f + t * 1.061405429f)))) * Mathf.Exp(-z * z);
        return x >= 0 ? y : 2 - y;
    }

    /// <summary>
    /// relic-art.ts relicFace: a relic power's button face as what it does (its effect's mark and number, baked from the
    /// page to Icons/relic-face/<key>), or none for a power with no one clear effect (its badge shown instead).
    /// </summary>
    static Texture2D RelicFace(BattleSkill k)
    {
        var effects = k.Effects ?? new List<Effect>();
        if (effects.Count > 1 || (effects.Count > 0 && k.Choices != null)) return null;
        string key = null;
        if (effects.Count == 0)
        {
            if (k.Choices?.Kind == "recall") key = $"recall-{k.Choices.Times}";
            else if (k.Choices?.Kind == "shift") key = "shift";
        }
        else
        {
            var e = effects[0];
            string n = e.Amount is int a && a != 0 ? a.ToString() : "";
            string Face(string kind, string num = "") => num.Length > 0 ? $"{kind}-{num}" : kind;
            key = e.Type switch
            {
                "strikeAll" or "heat" => Face("heat", n + (e.Plus != null && n.Length > 0 ? "plus" : "")),
                "cool" => Face("cool", n),
                "shield" => Face("shield", n),
                "draw" => Face("draw", n),
                "plays" => Face("plays", n),
                "repair" => Face("repair", n),
                "restore" => Face(e.All == true ? "renew" : "restore", n),
                "fortify" => Face("guard", n),
                "devour" or "destroy" => "destroy",
                "recover" => "recover",
                _ => null,
            };
        }
        return key != null ? Resources.Load<Texture2D>($"Icons/relic-face/{key}") : null;
    }

    static Material greyed;

    /// <summary>filter: grayscale(1) on a picture (the card's own shader, its greying full, its corners none).</summary>
    static Material Greyed()
    {
        if (greyed != null) return greyed;
        greyed = Mats.Make("Card", new Color(1, 1, 1, 0.45f));
        greyed.SetFloat("_Grey", 1);
        greyed.SetFloat("_Radius", 0);
        greyed.SetFloat("_Aspect", 1);
        return greyed;
    }

    static readonly Dictionary<int, Sprite> rings = new Dictionary<int, Sprite>();

    /// <summary>A ring `width` px thick round a disc `size` px across (the counter's masked ::after), as a sprite to fill.</summary>
    static Sprite RingSprite(float size, float width)
    {
        int key = Mathf.RoundToInt(size * 10 + width);
        if (rings.TryGetValue(key, out var s)) return s;
        const int n = 128;
        var tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var px = new Color32[n * n];
        float outer = n / 2f, inner = outer * (1 - 2 * width / size), aa = 1;
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float r = Mathf.Sqrt((x + 0.5f - outer) * (x + 0.5f - outer) + (y + 0.5f - outer) * (y + 0.5f - outer));
                float a = Mathf.Clamp01((outer - r) / aa) * Mathf.Clamp01((r - inner) / aa);
                px[y * n + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(a * 255));
            }
        tex.SetPixels32(px);
        tex.Apply();
        s = Sprite.Create(tex, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), 100);
        rings[key] = s;
        return s;
    }

    /// <summary>app.ts relicActionMark: the mark of what a relic's power does (its first effect, or its choice), none for a power with no plain mark.</summary>
    static string RelicActionMark(BattleSkill k)
    {
        var type = k.Effects?.FirstOrDefault()?.Type ?? k.Choices?.Kind;
        if (type == null) return null;
        var kind = type.StartsWith("strike") ? "heat" : type == "fortify" ? "sturdy" : type;
        var mark = MarkOf(kind);
        return mark == "star" ? null : mark;
    }

    // ---- The relic's pane ----

    /// <summary>
    /// renderRelicPanel (.stage.stage-relic.relic-panel): in the preview pane (min(240px, 60vw) wide, 64 px in from the
    /// page's right padding, clear of the tokens; its middle the page's), on the stage's white glow, 6 px apart: its badge
    /// 84 px with what it does marked over it, its name (0.95rem display 500, 0.08em), its words (0.85rem, 1.35), when it
    /// may be used (0.62rem display, 0.16em, capitals, faint), and cancel and use (or why not) 8 px apart, 4 px more down.
    /// </summary>
    void RelicPane(int i, bool act)
    {
        var l = BoardLayout.Current;
        var k = Me.Skills[i];
        bool used = k.Spent == true || (k.Once != true && k.UsedTurn == state.TurnNumber);
        bool myDay = Game.ActivePlayer(state).Id == you;
        string why = used ? (k.Spent == true ? "Used." : "Used today.") : !myDay ? "On your day." : Game.HeroSkillProblem(state, Me, i) ?? (!act ? "Not now." : null);
        float w = Mathf.Min(240, 60 * l.Vw), gap = 6;
        string words = System.Text.RegularExpressions.Regex.Replace(k.Text ?? "", "^Once (per|a) (battle|day|turn): ", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (words.Length > 0) words = char.ToUpperInvariant(words[0]) + words.Substring(1);
        string name = k.Relic.ToLowerInvariant(), when = k.Once == true ? "ONCE A BATTLE" : "ONCE A DAY";
        string useWord = why != null ? why.TrimEnd('.').ToLowerInvariant() : "use";
        // (Measured: the words wrapped in the pane's width.)
        var probe = Hud.Text(emblems, words, 0, 0, w, 10, 13.6f, Look.Ink, false, 400, 0, TextAlignmentOptions.Top);
        probe.textWrappingMode = TextWrappingModes.Normal;
        probe.lineSpacing = (1.35f - 1.2f) * 100 / 1.2f;
        float textH = probe.GetPreferredValues(words, w, 0).y;
        Mats.Kill(probe.gameObject);
        float nameH = K.LineH(15.2f), whenH = K.LineH(9.92f), btnH = K.Measure(K.Kind.Btn).h;
        float h = 84 + gap + nameH + gap + textH + gap + whenH + gap + 4 + btnH;
        float right = l.W - (l.PadR + 64), top = l.H / 2 - h / 2;
        relicPane = Hud.Rect(emblems, "Relic pane");
        Hud.Place(relicPane, right - w, top, w, h);
        relicPane.SetAsFirstSibling();
        relicPane.gameObject.AddComponent<CanvasGroup>();
        relicPane.gameObject.AddComponent<RiseFade>().Seconds = 0.25f;
        var glow = Hud.Rect(relicPane, "Glow");
        Hud.Fill(glow);
        glow.offsetMin = new Vector2(-110, -50);
        glow.offsetMax = new Vector2(110, 50);
        var gi = glow.gameObject.AddComponent<RawImage>();
        gi.texture = StageGlow();
        // (The pane takes taps (pointer-events: auto): a tap on it is not a tap away.)
        gi.raycastTarget = false;
        var catcher = relicPane.gameObject.AddComponent<Image>();
        catcher.color = new Color(1, 1, 1, 0);
        // Its badge, large (.relic-panel-badge: 84 px, still).
        var badge = Hud.Rect(relicPane, "Badge");
        Hud.Place(badge, w / 2 - 42, 0, 84, 84);
        var bdisc = badge.gameObject.AddComponent<Image>();
        WebLook.Round(bdisc, 999);
        bdisc.color = new Color(1, 1, 1, 0);
        bdisc.raycastTarget = false;
        RoundShade(badge, 84, new[] { new Hud.Drop(Hud.Rgba(30, 34, 50, 0.3f), 3, 8), new Hud.Drop(Hud.Rgba(30, 34, 50, 0.25f), 1, 2) });
        var art = Hud.Rect(badge, "Art");
        Hud.Fill(art);
        var ai = art.gameObject.AddComponent<RawImage>();
        ai.texture = CampaignView.RelicArt(new Relic { Name = k.Relic, Slot = "" });
        ai.raycastTarget = false;
        var mark = RelicActionMark(k);
        if (mark != null)
        {
            var m = Hud.Rect(badge, "Action");
            Hud.Fill(m);
            var mi = m.gameObject.AddComponent<RawImage>();
            mi.texture = Resources.Load<Texture2D>($"Icons/relic-action/{mark}");
            mi.raycastTarget = false;
        }
        float y = 84 + gap;
        Hud.Text(relicPane, name, 0, y, w, nameH, 15.2f, Look.Ink, true, 500, 8);
        y += nameH + gap;
        var text = Hud.Text(relicPane, words, 0, y, w, textH, 13.6f, Look.Ink, false, 400, 0, TextAlignmentOptions.Top);
        text.textWrappingMode = TextWrappingModes.Normal;
        text.lineSpacing = (1.35f - 1.2f) * 100 / 1.2f;
        y += textH + gap;
        Hud.Text(relicPane, when, 0, y, w, whenH, 9.92f, Look.InkFaint, true, 400, 16);
        y += whenH + gap + 4;
        // Cancel, and use (or why not, greyed): each at least 84 px, 8 apart, centred.
        float cw = Mathf.Max(84, K.BtnW("cancel", K.Kind.Btn)), uw = Mathf.Max(84, K.BtnW(useWord, K.Kind.Primary)), all = cw + 8 + uw;
        K.Btn(relicPane, "cancel", () => { relicPanel = null; emblemsKey = null; Refresh(); }, w / 2 - all / 2, y, K.Kind.Btn, cw);
        var use = K.Btn(relicPane, useWord, () => UseSkill(i), w / 2 - all / 2 + cw + 8, y, K.Kind.Primary, uw);
        if (why != null)
        {
            use.interactable = false;
            use.gameObject.AddComponent<CanvasGroup>().alpha = 0.4f;
        }
    }

    // ---- Each frame ----

    /// <summary>
    /// Your day begun: the once-a-day relics pulse (nudgeDailyRelics). A press anywhere but on your Hero's picks puts them
    /// away, and anywhere but on the relic's pane or a token puts that away; the press goes on to do what it does there
    /// (app.ts onClick: closed, then acted on).
    /// </summary>
    void EmblemsTick()
    {
        if (state == null || hud == null) return;
        if (MyDay && Dawn == null && Time.time >= dayFrom && nudgedTurn != state.TurnNumber)
        {
            nudgedTurn = state.TurnNumber;
            nudgeAt = Time.time;
            emblemsKey = null;
        }
        if (Input.GetMouseButtonDown(0))
        {
            press++;
            bool heroOpen = heroPanel != null && heroPanel.gameObject.activeSelf;
            if (heroOpen || relicPanel != null)
            {
                // (What takes taps there: the picks' pills, the relic's pane, the tokens. Where a finger is, itself.)
                Vector2 point = Input.touchCount > 0 ? Input.GetTouch(0).position : (Vector2)Input.mousePosition;
                bool Over(Transform t) => t is RectTransform r && t.gameObject.activeInHierarchy
                    && RectTransformUtility.ScreenPointToLocalPointInRectangle(r, point, hudCam, out var at) && r.rect.Contains(at);
                bool OnPick() => heroPanel.Cast<Transform>().Any(c => c.GetComponent<Image>() is Image i && i.raycastTarget && Over(c));
                if (heroOpen && !OnPick())
                {
                    heroPanel.gameObject.SetActive(false);
                    heroShutPress = press;
                    stageKey = null;
                    DrawStage();
                }
                bool onToken = relicColumn != null && relicColumn.Cast<Transform>().Any(c => c.GetComponent<Button>() != null && Over(c));
                if (relicPanel != null && !Over(relicPane) && !onToken)
                {
                    // (Put away where it stands, the rest left as it is: the press goes on to what it is on.)
                    relicPanel = null;
                    if (relicPane != null) Mats.Kill(relicPane.gameObject);
                    relicPane = null;
                    if (relicColumn != null) foreach (var tp in relicColumn.GetComponentsInChildren<TokenPulse>()) tp.Open = false;
                    emblemsKey = EmblemsKey();
                }
            }
        }
        Emblems();
    }

    class EmblemTicker : MonoBehaviour
    {
        public BattleView View;
        void Update() { if (View != null) View.EmblemsTick(); }
    }

    /// <summary>
    /// A token's own motion: open, 1.12 times as large; nudged, scale(1) → scale(1.22) and a stronger gold glow
    /// (0 0 22px 8px) → scale(1) over 0.9 s, cubic-bezier(.3,.7,.3,1), added to what it has.
    /// </summary>
    class TokenPulse : MonoBehaviour
    {
        public bool Open;
        public float? NudgeAt;
        public Image Glow;
        RectTransform glow;

        void Update()
        {
            float s = Open ? 1.12f : 1, g = 0;
            if (NudgeAt != null)
            {
                float t = (Time.time - NudgeAt.Value) / 0.9f;
                if (t >= 0 && t < 1)
                {
                    float e = Ease(t);
                    float k = e < 0.5f ? e * 2 : 2 - e * 2;
                    s *= 1 + 0.22f * k;
                    g = k;
                }
            }
            transform.localScale = Vector3.one * s;
            if (g > 0 && glow == null)
            {
                glow = Hud.Rect(transform, "Nudge");
                glow.SetAsFirstSibling();
                Hud.Fill(glow);
                var gi = glow.gameObject.AddComponent<Image>();
                gi.sprite = Hud.Soft;
                gi.type = Image.Type.Sliced;
                gi.raycastTarget = false;
            }
            if (glow != null)
            {
                // (0 0 22px 8px rgba(222, 178, 90, 0.75): grown 8 px all round and blurred 22.)
                glow.offsetMin = -Vector2.one * (8 + 11) * g;
                glow.offsetMax = Vector2.one * (8 + 11) * g;
                var gi = glow.GetComponent<Image>();
                gi.pixelsPerUnitMultiplier = 14.4f / Mathf.Max(1, 22 * g);
                gi.color = new Color(222 / 255f, 178 / 255f, 90 / 255f, 0.75f * g);
                if (g <= 0) { Destroy(glow.gameObject); glow = null; }
            }
        }

        /// <summary>cubic-bezier(.3, .7, .3, 1) at time `x`.</summary>
        static float Ease(float x)
        {
            float lo = 0, hi = 1, u = x;
            for (int i = 0; i < 20; i++)
            {
                u = (lo + hi) / 2;
                float bx = 3 * (1 - u) * (1 - u) * u * 0.3f + 3 * (1 - u) * u * u * 0.3f + u * u * u;
                if (bx < x) lo = u; else hi = u;
            }
            return 3 * (1 - u) * (1 - u) * u * 0.7f + 3 * (1 - u) * u * u * 1 + u * u * u;
        }
    }
}
