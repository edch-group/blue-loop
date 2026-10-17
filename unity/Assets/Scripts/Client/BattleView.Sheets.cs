using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// The battle's own sheets (app.ts renderSheet): the game log as a popover under its button (log, logview.ts logRows),
/// a pile looked through (renderPileSheet, renderWreckSheet: a Reclaim relic's "take back"), a player's summary
/// (renderPlayerSheet, tabbed per player), and the global field's chip in the HUD (renderHud .field). Opened from the
/// HUD's log button and from the board's piles and names (Board's BoardHit).
/// </summary>
public partial class BattleView
{
    /// <summary>The log popover, while it is the sheet open (its button is ringed then: .icon-btn.icon-on).</summary>
    RectTransform logSheet;
    /// <summary>The player summary shown (its tabs switch it in place) and what it is drawn in.</summary>
    string playerShown;
    RectTransform playerBody;
    Image logRing;
    Button logButton;
    /// <summary>The field chip, and which global card it shows.</summary>
    RectTransform fieldChip;
    string fieldShown;

    // ---- Every frame: the pieces of the HUD this file adds, made again when the HUD is laid out again ----

    /// <summary>The log button's act and ring, the field chip and the HUD's tooltips (kept as the HUD is made again), the zoom and the tooltips.</summary>
    void ExtrasTick()
    {
        if (hud == null) return;
        if (logButton == null)
        {
            var corner = chrome.Find("Corner log");
            if (corner != null)
            {
                logButton = corner.GetComponent<Button>();
                logButton.onClick.AddListener(() => { Sound.Play("click"); if (sheet != null && sheet == logSheet) CloseSheet(); else OpenLog(); });
                // (.icon-btn.icon-on: 0 0 0 2px #7c8aa6 round it while the log is open.)
                float b = ((RectTransform)corner).sizeDelta.x;
                logRing = Hud.Box(chrome, "Log ring", Hud.Rgba(0x7c, 0x8a, 0xa6), b / 2 + 2);
                var rr = logRing.rectTransform;
                var cr = (RectTransform)corner;
                rr.anchorMin = cr.anchorMin;
                rr.anchorMax = cr.anchorMax;
                rr.pivot = new Vector2(0.5f, 0.5f);
                rr.sizeDelta = cr.sizeDelta + new Vector2(4, 4);
                rr.anchoredPosition = cr.anchoredPosition + new Vector2(-b / 2, -b / 2);
                rr.SetSiblingIndex(cr.GetSiblingIndex());
                HudTips();
            }
        }
        if (logRing != null) logRing.gameObject.SetActive(sheet != null && sheet == logSheet);
        FieldChip();
        ZoomTick();
        TipsTick();
    }

    /// <summary>A layer over the screen in the page's own pixels (the overlays' layer undone), for a sheet.</summary>
    RectTransform CssSheet(string name)
    {
        var l = BoardLayout.Current;
        var r = Hud.Rect(Layer, name);
        r.anchorMin = r.anchorMax = r.pivot = new Vector2(0.5f, 0.5f);
        r.localScale = Vector3.one * RefScale;
        r.sizeDelta = new Vector2(l.W, l.H);
        return r;
    }

    /// <summary>
    /// A sheet over the screen blurred and veiled (.overlay: backdrop-filter blur(6px), its wash `wash`): the sheet
    /// built over it by `build`. A tap on the veil closes it.
    /// </summary>
    void OverSheet(string name, Color wash, System.Action<RectTransform> build)
    {
        CloseSheet();
        var root = CssSheet(name);
        sheet = root;
        var veil = MenuKit.Hit(root, "Veil", CloseSheet, false);
        Hud.Fill((RectTransform)veil.transform);
        veil.GetComponent<Image>().color = wash;
        BackdropBlur.Blur(root);
        build(root);
    }

    // ---- The game log (app.ts sheet 'log': .log-pop under the log button; logview.ts logRows) ----

    /// <summary>
    /// The log as a popover under its button, the board in view (.log-pop: min(440px, 100% − 32px) wide, its top
    /// clamp(40px, 9vh, 52px) under the page's top padding, at its right padding; at most min(70%, 76vh) tall; the
    /// strong glass, corners 16, padded 10 × 12, var(--shadow) and a white hairline): "game log" and a close pill over
    /// the last 120 lines, scrolled to the newest. A tap anywhere else closes it (.log-pop-overlay).
    /// </summary>
    void OpenLog()
    {
        CloseSheet();
        var l = BoardLayout.Current;
        var root = CssSheet("Log");
        sheet = logSheet = root;
        var veil = MenuKit.Hit(root, "Veil", CloseSheet, false);
        Hud.Fill((RectTransform)veil.transform);
        float w = Mathf.Min(440, l.W - 32), most = Mathf.Min(0.7f * l.H, 76 * l.Vh);
        float top = l.PadT + Css.Clamp(40, 9 * l.Vh, 52), x = l.W - l.PadR - w;
        var pop = Hud.Box(root, "Log pop", Look.GlassStrong, 16);
        pop.raycastTarget = true;
        pop.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        Hud.Shadow(pop, 16, new Hud.Drop(Color.white, 0, 0, 1), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.13f), 8, 30), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.07f), 2, 6));
        // The head (.log-pop-head: the section label, the close pill (.pill-btn: 8.96, padded 5 × 11), 6 above the list).
        const float headH = 23;
        MenuKit.Words(pop.transform, "GAME LOG", 12, 10 + (headH - MenuKit.LineH(8)) / 2, 200, MenuKit.LineH(8), 8, Look.InkSoft, true, 400, 0.3f, TextAlignmentOptions.Left);
        float cw = MenuKit.BtnW("close", MenuKit.Kind.Pill);
        MenuKit.Btn(pop.transform, "close", CloseSheet, w - 12 - cw, 10, MenuKit.Kind.Pill, cw, headH);
        // The list (.log-list: 0 −12 px, rows divided by hairlines), built, then measured into its scroller.
        var holder = Hud.Rect(pop.transform, "Rows");
        float listH = LogRows(holder, w, state.Log.Skip(Mathf.Max(0, state.Log.Count - 120)).ToList());
        float h = Mathf.Min(most, 10 + headH + 6 + listH + 10), viewH = h - 10 - headH - 6 - 10;
        Hud.Place(pop.rectTransform, x, top, w, h);
        var content = MenuKit.Scroller(pop.transform, "List", 0, 10 + headH + 6, w, viewH, listH);
        holder.SetParent(content, false);
        Hud.Place(holder, 0, 0, w, listH);
        // (Scrolled to the newest, as the web's after each render.)
        var scroll = content.parent.GetComponent<ScrollRect>();
        scroll.verticalNormalizedPosition = 0;
        RiseIn.On(pop.rectTransform, Time.time, 0, 0.18f, 10 / WebLook.Zoom, true);
    }

    static Regex logNames;
    static Dictionary<string, CardDef> logDefs;

    /// <summary>
    /// The log's rows (logview.ts logRows): a new day a header ("day N" and whose, red, or blue for yours); every other
    /// line the art of the card it is about (else an icon for what happened), its words with card and player names
    /// picked out, and a chip with what came of it. Rows of the newest day lit. Its height comes back.
    /// </summary>
    float LogRows(RectTransform parent, float w, List<LogEntry> log)
    {
        if (logNames == null)
        {
            logDefs = new Dictionary<string, CardDef>();
            foreach (var d in CardData.All) if (!logDefs.ContainsKey(d.Name)) logDefs[d.Name] = d;
        }
        var players = state.Players;
        var all = logDefs.Keys.Concat(players.Select(p => p.Name)).Distinct().OrderByDescending(n => n.Length).Select(Regex.Escape);
        var who = new Regex($@"(?<![\w])({string.Join("|", all)})(?![\w])");
        int? lastTurn = log.Count > 0 ? log[log.Count - 1].Turn : (int?)null;
        float y = 0;
        for (int i = 0; i < log.Count; i++)
        {
            var e = log[i];
            bool last = i == log.Count - 1, border = i > 0;
            var day = Regex.Match(e.Text, @"^— Day (\d+): (.+)\.$");
            if (day.Success)
            {
                // (.log-day: padded 10 12 5, its words 9.6 px spaced 0.16em on a line of 1.35, a firmer hairline.)
                bool mine = players.FirstOrDefault(p => p.Name == day.Groups[2].Value)?.Id == you;
                float rh = 10 + 9.6f * 1.35f + 5 + (border ? 1 : 0);
                if (border) Hairline(parent, y, w, Hud.Rgba(140, 150, 175, 0.35f));
                float ty = y + (border ? 1 : 0) + 10;
                string d1 = $"DAY {day.Groups[1].Value}";
                float dw = MenuKit.TextW(d1, 9.6f, 400, 0.16f) + 0.16f * 9.6f;
                MenuKit.Words(parent, d1, 12, ty, dw + 4, 9.6f * 1.35f, 9.6f, last ? Look.Ink : Look.InkFaint, true, 400, 0.16f, TextAlignmentOptions.Left);
                MenuKit.Words(parent, day.Groups[2].Value.ToUpperInvariant(), 12 + dw + 8, ty, w - 24 - dw - 8, 9.6f * 1.35f, 9.6f, mine ? Hud.Rgba(0x3d, 0x72, 0xc4) : Hud.Rgba(0xc2, 0x55, 0x3e), true, 600, 0.16f, TextAlignmentOptions.Left);
                y += rh;
                continue;
            }
            string text = Regex.Replace(e.Text, @"^[☀⚡]\s*", "");
            var cards = new List<CardDef>();
            string rich = who.Replace(text, m =>
            {
                string n = m.Value;
                if (logDefs.TryGetValue(n, out var d))
                {
                    cards.Add(d);
                    // (.log-card: its kind's colour 75% into the ink, bold.)
                    var kc = Look.Kind.TryGetValue(BuilderView.ShownKind(d), out var k) ? Color.Lerp(Look.Ink, k, 0.75f) : Look.Ink;
                    return $"<b><color=#{ColorUtility.ToHtmlStringRGB(kc)}>{n}</color></b>";
                }
                bool me = players.FirstOrDefault(p => p.Name == n)?.Id == you;
                return $"<b><color=#{(me ? "3d72c4" : "c2553e")}>{n}</color></b>";
            });
            var o = LogOutcome(text);
            // (A Lightspeed card that sprang is the one it is about, not the card it answered.)
            var card = cards.Count == 0 ? null : Regex.IsMatch(text, "Lightspeed!") ? cards[0] : cards[cards.Count - 1];
            bool now = e.Turn == lastTurn;
            // The chip, measured first: the line takes what is left (.log-row: 34px, the line, the chip; 10 apart, padded 6 × 12).
            float chipW = 0, chipH = 10.56f * 1.35f + 6;
            if (o.chip != null) chipW = 8 + (o.chipIcon >= 0 ? 11 + 3 : 0) + MenuKit.TextW(o.chip, 10.56f, 400, 0.04f) + 8;
            float textW = w - 24 - 34 - 10 - (o.chip != null ? 10 + chipW : 0);
            var t = Hud.Rect(parent, "Line");
            var tt = t.gameObject.AddComponent<TextMeshProUGUI>();
            Look.Style(tt, 11.84f, now || last ? Look.Ink : Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
            tt.textWrappingMode = TextWrappingModes.Normal;
            tt.lineSpacing = (1.35f - 1.2f) * 100;
            tt.text = rich;
            float textH = tt.GetPreferredValues(rich, textW, 0).y;
            float rowH = Mathf.Max(46, 12 + textH + (border ? 1 : 0)), top = y + (border ? 1 : 0), inner = rowH - (border ? 1 : 0);
            if (now)
            {
                var lit = Hud.Box(parent, "Now", new Color(1, 1, 1, 0.6f), 0);
                Hud.Place(lit.rectTransform, 0, top, w, inner);
                lit.transform.SetAsFirstSibling();
            }
            if (border) Hairline(parent, y, w, Hud.Rgba(140, 150, 175, 0.18f));
            Hud.Place(t, 12 + 34 + 10, top + (inner - textH) / 2, textW, textH);
            // Its picture: the card's art (.log-thumb: 34 square, corners 8, a ring of its colour mixed into white), or the
            // outcome's icon in a tinted disc (.lg-icon).
            if (card != null)
            {
                var kc = Look.Kind.TryGetValue(BuilderView.ShownKind(card), out var k) ? k : Look.Ink;
                var ring = Hud.Box(parent, "Thumb ring", Color.Lerp(Color.white, kc, 0.55f), 9.5f);
                Hud.Place(ring.rectTransform, 12 - 1.5f, top + (inner - 34) / 2 - 1.5f, 37, 37);
                Hud.Shadow(ring, 9.5f, new Hud.Drop(Hud.Rgba(80, 84, 100, 0.18f), 2, 6));
                var clip = Hud.Box(ring.transform, "Thumb", Color.white, 8);
                Hud.Place(clip.rectTransform, 1.5f, 1.5f, 34, 34);
                clip.gameObject.AddComponent<Mask>().showMaskGraphic = false;
                var art = Hud.Rect(clip.transform, "Art");
                Hud.Fill(art);
                var ai = art.gameObject.AddComponent<RawImage>();
                ai.texture = EngineData.Art(card.Id);
                ai.raycastTarget = false;
                // (object-fit: cover: the middle of the picture, as tall as it is wide.)
                if (ai.texture != null && ai.texture.width > ai.texture.height)
                {
                    float f = (float)ai.texture.height / ai.texture.width;
                    ai.uvRect = new Rect((1 - f) / 2, 0, f, 1);
                }
            }
            else
            {
                var tone = LogTone(o.tone);
                var disc = Hud.Box(parent, "Icon", tone.bg, 17);
                Hud.Place(disc.rectTransform, 12, top + (inner - 34) / 2, 34, 34);
                if (o.iconKw >= 0)
                {
                    var ic = Hud.Rect(disc.transform, "Mark");
                    Hud.Place(ic, 9, 9, 16, 16);
                    var ii = ic.gameObject.AddComponent<RawImage>();
                    ii.texture = Resources.Load<Texture2D>($"Icons/kw/k{o.iconKw}");
                    ii.raycastTarget = false;
                }
                else MenuKit.Fill(disc.transform, o.icon, 16, tone.ink, false, 400);
            }
            if (o.chip != null)
            {
                // (.log-chip: a pill padded 3 × 8, 10.56 px Orbitron spaced 0.04em, tinted by what it says.)
                var (bg, ink) = LogChip(o.chipCls);
                var chip = Hud.Box(parent, "Chip", bg, chipH / 2);
                Hud.Place(chip.rectTransform, w - 12 - chipW, top + (inner - chipH) / 2, chipW, chipH);
                float cx = 8;
                if (o.chipIcon >= 0)
                {
                    var ic = Hud.Rect(chip.transform, "Mark");
                    Hud.Place(ic, cx, (chipH - 11) / 2, 11, 11);
                    var ii = ic.gameObject.AddComponent<RawImage>();
                    ii.texture = Resources.Load<Texture2D>($"Icons/kw/k{o.chipIcon}");
                    ii.raycastTarget = false;
                    cx += 11 + 3;
                }
                MenuKit.Words(chip.transform, o.chip, cx, 0, chipW - cx - 6, chipH, 10.56f, ink, true, 400, 0.04f, TextAlignmentOptions.Left);
            }
            y += rowH;
        }
        return y;
    }

    static void Hairline(Transform parent, float y, float w, Color c)
    {
        var line = Hud.Box(parent, "Line", c, 0);
        Hud.Place(line.rectTransform, 0, y, w, 1);
    }

    /// <summary>A line's outcome (logview.ts outcome): its icon (or a keyword mark), its tone, and its chip (with a mark before it, if any).</summary>
    static (string icon, int iconKw, string tone, string chip, int chipIcon, string chipCls) LogOutcome(string text)
    {
        const string A = "<alpha=#B3>→<alpha=#FF>";
        Match m;
        (string, int, string, string, int, string) R(string icon, string tone, string cls, string chip, int chipIcon = -1, int iconKw = -1) => (icon, iconKw, tone, chip, chipIcon, cls);
        if (Regex.IsMatch(text, "SUPERNOVA")) return R("✸", "nova", "nova", "SUPERNOVA");
        if (Regex.IsMatch(text, "wins the Blue Loop")) return R("★", "win", "win", "VICTORY");
        if (Regex.IsMatch(text, "supernova together: a draw")) return R("✸", "nova", "nova", "DRAW");
        if ((m = Regex.Match(text, @"instability heats every sun by (\d+)")).Success) return R("≋", "heat", "heat", $"+{m.Groups[1].Value} {A} EVERY SUN", 0);
        if ((m = Regex.Match(text, @"heats their sun by (\d+)")).Success) return R("↻", "heat", "heat", $"+{m.Groups[1].Value}", 0);
        if ((m = Regex.Match(text, @"(?:sun heats to |'s sun to (?=-?\d+ \(\+))(-?\d+)")).Success) return R("", "heat", "heat", $" {A} {m.Groups[1].Value}", 0, 0);
        if ((m = Regex.Match(text, @"(?:sun cools to |'s sun to (?=-?\d+ \(−))(-?\d+)")).Success) return R("", "cool", "cool", $" {A} {m.Groups[1].Value}", 1, 1);
        if ((m = Regex.Match(text, @"shields absorb (\d+)|'s shields \(−(\d+)\)")).Success) return R("", "shield", "shield", $"−{(m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value)}", 2, 2);
        if ((m = Regex.Match(text, @"raises (\d+) shield")).Success) return R("", "shield", "shield", $"+{m.Groups[1].Value}", 2, 2);
        if ((m = Regex.Match(text, @"stings .+ for (\d+)")).Success) return R("⚔", "heat", "heat", $"+{m.Groups[1].Value}", 0);
        if ((m = Regex.Match(text, @"takes (\d+) on its defence.*?\(defence (\d+) left")).Success) return R("⛨", "shield", "shield", $"⛨−{m.Groups[1].Value} {A} {m.Groups[2].Value}");
        if ((m = Regex.Match(text, @"'s .* takes \d+ \(stability (\d+)\)\.$")).Success) return R("", "heat", "remove", $"◷ {A} {m.Groups[1].Value}", -1, 0);
        if (Regex.IsMatch(text, "burns away")) return R("✕", "remove", "remove", "✕ BURNED");
        if (Regex.IsMatch(text, "destroys")) return R("✕", "remove", "remove", "✕ DESTROYED");
        if (Regex.IsMatch(text, "flung back|returns .+ to their hand")) return R("↩", "remove", "move", $"{A} HAND");
        if (Regex.IsMatch(text, "recovers")) return R("↩", "move", "move", $"{A} HAND");
        if (Regex.IsMatch(text, "fades into")) return R("◌", "fade", "fade", $"{A} WRECKAGE");
        if ((m = Regex.Match(text, @"loses (\d+) stability")).Success) return R("◷", "remove", "remove", $"◷−{m.Groups[1].Value}");
        if (Regex.IsMatch(text, "steadies")) return R("◷", "move", "move", "◷ STEADIED");
        if (Regex.IsMatch(text, "sets a card face down")) return R("⚡", "ls", "ls", $"{A} FACE DOWN");
        if (Regex.IsMatch(text, "Lightspeed!")) return R("⚡", "ls", "ls", "SPRUNG");
        if (Regex.IsMatch(text, " plays ")) return R("▶", "play", "play", $"{A} TABLEAU");
        if (Regex.IsMatch(text, "replaces")) return R("⇄", "play", "play", "⇄ SWAPPED");
        if (Regex.IsMatch(text, "chooses:")) return R("◆", "play", null, null);
        if (Regex.IsMatch(text, "is cancelled|misses|never reaches")) return R("⦸", "fade", "fade", "NO EFFECT");
        if ((m = Regex.Match(text, @"gains (\d+) energy")).Success) return R("●", "play", "play", $"+{m.Groups[1].Value} ENERGY");
        if (Regex.IsMatch(text, "may play no more")) return R("⦸", "remove", "remove", "NO MORE PLAYS");
        if (Regex.IsMatch(text, "draws")) return R("⇡", "move", "move", $"{A} HAND");
        if (Regex.IsMatch(text, "planet|orbit")) return R("◍", "orbit", null, null);
        if (Regex.IsMatch(text, "concedes")) return R("⚑", "nova", null, null);
        return R("·", "plain", null, null);
    }

    /// <summary>An outcome icon's disc and ink (.lg-icon and its .log-tone-*).</summary>
    static (Color bg, Color ink) LogTone(string tone) => tone switch
    {
        "heat" or "nova" => (Hud.Rgba(224, 85, 58, 0.1f), Hud.Rgba(0xe0, 0x55, 0x3a)),
        "cool" => (Hud.Rgba(30, 155, 215, 0.1f), Hud.Rgba(0x1e, 0x9b, 0xd7)),
        "shield" => (Hud.Rgba(107, 127, 214, 0.1f), Hud.Rgba(0x6b, 0x7f, 0xd6)),
        "win" or "ls" => (Hud.Rgba(212, 165, 42, 0.14f), Hud.Rgba(0xb9, 0x86, 0x1a)),
        "remove" => (Hud.Rgba(192, 88, 120, 0.1f), Hud.Rgba(0xc0, 0x58, 0x78)),
        "orbit" => (Hud.Rgba(63, 158, 116, 0.1f), Hud.Rgba(0x3f, 0x9e, 0x74)),
        _ => (Hud.Rgba(139, 144, 155, 0.1f), Look.InkSoft),
    };

    /// <summary>A chip's tint and ink (.log-chip-*).</summary>
    static (Color bg, Color ink) LogChip(string cls) => cls switch
    {
        "heat" => (Hud.Rgba(224, 85, 58, 0.12f), Hud.Rgba(0xc2, 0x44, 0x2b)),
        "cool" => (Hud.Rgba(30, 155, 215, 0.12f), Hud.Rgba(0x16, 0x83, 0xb8)),
        "shield" => (Hud.Rgba(107, 127, 214, 0.12f), Hud.Rgba(0x53, 0x66, 0xbd)),
        "remove" or "nova" => (Hud.Rgba(192, 88, 120, 0.12f), Hud.Rgba(0xa8, 0x45, 0x5f)),
        "win" or "ls" => (Hud.Rgba(212, 165, 42, 0.16f), Hud.Rgba(0x96, 0x69, 0x0f)),
        "play" => (Hud.Rgba(63, 158, 116, 0.12f), Hud.Rgba(0x2f, 0x84, 0x60)),
        _ => (Hud.Rgba(139, 144, 155, 0.12f), Look.InkSoft),
    };

    // ---- A sheet's frame (app.ts sheetFrame: .overlay.overlay-soft > .modal.sheet) ----

    /// <summary>
    /// A modal sheet (.modal: white, corners 18, a faint ring and two soft shadows; at least min(380px, 92vw) across, at
    /// most min(900px, 94vw) and 94vh; rising in): its title (.bar-title) over its body (.modal-body, padded
    /// clamp(10px, 3vh, 22px) by clamp(14px, 3vw, 28px), scrolling when it is too tall) and "close" (.modal-cancel)
    /// along its foot. `want`: the body's own width; `fill` lays the body out in the width it is given, from its top
    /// left, and gives back its height. Centred in the page's padding.
    /// </summary>
    void Modal(RectTransform root, string title, float want, System.Func<RectTransform, float, float> fill)
    {
        var l = BoardLayout.Current;
        float padV = Css.Clamp(10, 3 * l.Vh, 22), padX = Css.Clamp(14, 3 * l.Vw, 28);
        float w = Mathf.Clamp(want + 2 * padX + 2, Mathf.Min(380, 92 * l.Vw), Mathf.Min(900, 94 * l.Vw)), inner = w - 2 - 2 * padX;
        float titleH = 14 + MenuKit.LineH(11.2f) + 10, closeH = 1 + 11 + MenuKit.LineH(8.96f) + 11;
        // (Rising in with its shadows.)
        var card = Hud.Box(RiseIn.Modal(root), "Modal", Color.white, 18);
        card.raycastTarget = true;
        card.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        Hud.Shadow(card, 18, new Hud.Drop(Hud.Rgba(120, 124, 134, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(80, 80, 100, 0.18f), 30, 80), new Hud.Drop(Hud.Rgba(80, 80, 100, 0.08f), 6, 18));
        // (overflow: hidden: what is in it clipped to its corners.)
        card.gameObject.AddComponent<Mask>().showMaskGraphic = true;
        var holder = Hud.Rect(card.transform, "Holder");
        float contentH = fill(holder, inner);
        float bodyH = Mathf.Min(94 * l.Vh - 2 - titleH - closeH, padV + contentH + padV), h = 2 + titleH + bodyH + closeH;
        float cx = l.PadL + (l.W - l.PadL - l.PadR) / 2, cy = l.PadT + (l.H - l.PadT - l.PadB) / 2;
        Hud.Place(card.rectTransform, cx - w / 2, cy - h / 2, w, h);
        BarTitle(card.transform, title, w, titleH);
        var content = MenuKit.Scroller(card.transform, "Body", 1, 1 + titleH, w - 2, bodyH, padV + contentH + padV);
        holder.SetParent(content, false);
        Hud.Place(holder, padX, padV, inner, contentH);
        ModalCancel(card.transform, 1, 1 + titleH + bodyH, w - 2, closeH);
    }

    /// <summary>.bar-title: 11.2 px capitals spaced 0.28em, padded 14 44 10, a 44-wide hairline fading out either side at its foot.</summary>
    static void BarTitle(Transform card, string title, float w, float titleH)
    {
        // (Centred with the spacing after its last letter, as the browser centres it: half of it to the left.)
        MenuKit.Words(card, title.ToUpperInvariant(), 1 + 44 - 0.14f * 11.2f, 1 + 14, w - 2 - 88, MenuKit.LineH(11.2f), 11.2f, Look.Ink, true, 500, 0.28f);
        var rule = Hud.Rect(card, "Rule");
        Hud.Place(rule, (w - 44) / 2, 1 + titleH - 1, 44, 1);
        var ri = rule.gameObject.AddComponent<RawImage>();
        var rt = new Texture2D(16, 1, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        for (int x = 0; x < 16; x++) rt.SetPixel(x, 0, new Color(120 / 255f, 124 / 255f, 134 / 255f, 0.45f * (1 - Mathf.Abs(x - 7.5f) / 7.5f)));
        rt.Apply();
        ri.texture = rt;
        ri.raycastTarget = false;
    }

    /// <summary>.modal-cancel: "close" across the sheet's foot (8.96 px capitals spaced 0.24em, soft ink, padded 11), a faint hairline over it; #f7f7f8 under the pointer.</summary>
    void ModalCancel(Transform parent, float x, float y, float w, float h)
    {
        var img = Hud.Box(parent, "Close", Color.white, 0);
        Hud.Place(img.rectTransform, x, y, w, h);
        img.raycastTarget = true;
        var b = img.gameObject.AddComponent<Button>();
        var colors = b.colors;
        colors.normalColor = new Color(1, 1, 1, 0);
        colors.highlightedColor = Hud.Rgba(0xf7, 0xf7, 0xf8);
        colors.pressedColor = Hud.Rgba(0xf7, 0xf7, 0xf8);
        colors.selectedColor = new Color(1, 1, 1, 0);
        b.colors = colors;
        b.onClick.AddListener(() => { Sound.Play("click"); CloseSheet(); });
        var line = Hud.Box(img.transform, "Line", Hud.Rgba(120, 124, 134, 0.12f), 0);
        Hud.Place(line.rectTransform, 0, 0, w, 1);
        MenuKit.Words(img.transform, "CLOSE", 0.12f * 8.96f, 1, w, h - 1, 8.96f, Look.InkSoft, true, 500, 0.24f);
    }

    // ---- The piles, looked through (app.ts renderPileSheet, renderWreckSheet) ----

    /// <summary>
    /// A reserves (`wreck` false) or wreckage pile looked through (app.ts view-pile): the reserves newest first, the
    /// wreckage top first, the two that reach the reserves at the next dawn marked so (.pile-next). On your day, with a
    /// Reclaim relic, any card in your reserves can be taken back to hand, for its energy (.pile-take).
    /// </summary>
    void OpenPile(string playerId, bool wreck)
    {
        OverSheet(wreck ? "Wreckage" : "Reserves", new Color(244 / 255f, 244 / 255f, 242 / 255f, 0.45f), root =>
        {
            var of = Player(playerId);
            bool mine = of.Id == you;
            string whose = mine ? "your" : $"{of.Name.ToLowerInvariant()}'s";
            var items = new List<(CardInstance c, bool next, bool take)>();
            int reclaim = 0;
            bool canTake = false;
            if (wreck) items = (of.Wreck ?? new List<CardInstance>()).Select((c, i) => (c, i < Balance.WreckPerDawn, false)).ToList();
            else
            {
                reclaim = mine ? Relics.RelicN(Me.Relics, "reclaim") : 0;
                canTake = reclaim > 0 && MyDay && Dawn == null;
                items = Enumerable.Reverse(of.Discard).Select(c => (c, false, canTake)).ToList();
            }
            int n = wreck ? of.Wreck?.Count ?? 0 : of.Discard.Count;
            string title = $"{whose} {(wreck ? "wreckage" : "reserves")} · {n}";
            float want = items.Count > 0 ? items.Count * 107 + (items.Count - 1) * 10 : MenuKit.TextW("Empty.", 12.8f, 400, 0, false);
            Modal(root, title, want, (body, inner) => PileGrid(body, inner, items, reclaim, Me.PlaysLeft >= reclaim));
        });
    }

    /// <summary>
    /// .pile-grid: the cards (107 × 150, .pile-card .card) in rows 10 apart, centred, under 4 px; each with what it
    /// carries under it ("next dawn", 9.6 px spaced 0.14em, 4 under it; "take back · N energy" in an ink pill, 6 under).
    /// None: "Empty." Its height comes back.
    /// </summary>
    float PileGrid(RectTransform body, float inner, List<(CardInstance c, bool next, bool take)> items, int reclaim, bool afford)
    {
        const float cw = 107, chh = 150, gap = 10;
        if (items.Count == 0)
        {
            // (.modal-body p.muted: 12.8 px, faint, 6 under it.)
            float ew = MenuKit.TextW("Empty.", 12.8f, 400, 0, false);
            MenuKit.Words(body, "Empty.", (inner - ew) / 2 - 2, 4, ew + 4, MenuKit.LineH(12.8f, false), 12.8f, Look.InkFaint, false, 400);
            return 4 + MenuKit.LineH(12.8f, false) + 6;
        }
        int perRow = Mathf.Max(1, Mathf.FloorToInt((inner + gap) / (cw + gap)));
        float y = 4;
        for (int r = 0; r * perRow < items.Count; r++)
        {
            var row = items.Skip(r * perRow).Take(perRow).ToList();
            float rowW = row.Count * cw + (row.Count - 1) * gap, x = (inner - rowW) / 2, rowH = 0;
            foreach (var (c, next, take) in row)
            {
                PileCard(body, c.DefId, x, y, cw);
                float h = chh;
                if (next)
                {
                    MenuKit.Words(body, "NEXT DAWN", x, y + chh + 4, cw, 12, 9.6f, Look.InkSoft, false, 400, 0.14f);
                    h += 4 + 12;
                }
                if (take)
                {
                    string word = $"take back · {reclaim} energy".ToUpperInvariant();
                    float bw = MenuKit.TextW(word, 9.6f, 500, 0.12f) + 0.12f * 9.6f + 24, bh = MenuKit.LineH(9.6f) + 8;
                    var pill = Hud.Box(body, "Take", afford ? Look.Ink : Hud.Rgba(0xc9, 0xcc, 0xd6), bh / 2);
                    Hud.Place(pill.rectTransform, x + (cw - bw) / 2, y + chh + 6, bw, bh);
                    MenuKit.Fill(pill.transform, word, 9.6f, Color.white, true, 500, 0.12f);
                    if (afford)
                    {
                        pill.raycastTarget = true;
                        var b = pill.gameObject.AddComponent<Button>();
                        b.transition = Selectable.Transition.None;
                        string uid = c.Uid;
                        b.onClick.AddListener(() => { Sound.Play("click"); CloseSheet(); Do(new EngineAction { Type = "reclaim", CardUid = uid }); });
                    }
                    h += 6 + bh;
                }
                rowH = Mathf.Max(rowH, h);
                x += cw + gap;
            }
            y += rowH + gap;
        }
        return y - gap;
    }

    /// <summary>A card shown as itself, `w` wide (renderCard, static): its face, its printed stats, the card's soft shadow (0 5px 16px).</summary>
    static RectTransform PileCard(Transform parent, string defId, float x, float y, float w)
    {
        var face = Hud.Rect(parent, "Card");
        Hud.Place(face, x, y, w, w * 1.4f);
        var raw = face.gameObject.AddComponent<RawImage>();
        raw.texture = Faces.Of(defId, Faces.Look.Card, w);
        Faces.Follow(raw);
        raw.raycastTarget = false;
        Hud.Shadow(raw, w * 0.08f, new Hud.Drop(Hud.Rgba(90, 90, 110, 0.15f), 5, 16));
        Printed(face, defId, w, true);
        return face;
    }

    // ---- A player's summary (app.ts renderPlayerSheet) ----

    /// <summary>
    /// A player's summary (their name tapped by their piles: app.ts view-player), over the blurred, veiled screen
    /// (.overlay-inspect): a tab for each player, you first; under them the card (.sys-card): who, their picture,
    /// their deck's name, their Heroes in play, a trap set, the conditions they fight under, and their counts.
    /// </summary>
    void OpenPlayer(string playerId)
    {
        OverSheet("Player", new Color(246 / 255f, 246 / 255f, 244 / 255f, 0.8f), root =>
        {
            playerBody = Hud.Rect(root, "Summary");
            Hud.Fill(playerBody);
            PlayerSummary(playerId, true);
        });
    }

    /// <summary>The summary drawn (again, another tab chosen: in place, the blur kept).</summary>
    void PlayerSummary(string playerId, bool rise)
    {
        if (playerBody == null) return;
        foreach (Transform c in playerBody) Mats.Kill(c.gameObject);
        playerShown = playerId;
        var l = BoardLayout.Current;
        var p = Player(playerId);
        bool big = !(Css.Screen.y <= 560 && Css.Screen.x > Css.Screen.y) && !(Css.Screen.x <= 560 && Css.Screen.y > Css.Screen.x);
        // (.sys-wrap: min(560px, 94vw) across; on a phone min(760px, 94vw), its card in two columns 18 apart.)
        float w = Mathf.Min(big ? 560 : 760, 94 * l.Vw);
        var wrap = Hud.Rect(playerBody, "Wrap");
        // The tabs (.sys-tab: a pill padded 3 12 3 3, its sun's orb 26 across, 6, its name 8.32 px spaced 0.14em).
        var order = new[] { Me }.Concat(state.Players.Where(o => o.Id != you)).ToList();
        var tabW = order.Select(o => 1 + 3 + 26 + 6 + MenuKit.TextW(TabName(o), 8.32f, 500, 0.14f) + 0.14f * 8.32f + 12 + 1).ToList();
        float tabsW = tabW.Sum() + 6 * (order.Count - 1), tx = (w - tabsW) / 2;
        for (int i = 0; i < order.Count; i++)
        {
            var o = order[i];
            bool on = o.Id == p.Id;
            var tab = Hud.Box(wrap, "Tab", on ? Color.white : new Color(1, 1, 1, 0.7f), 17);
            Hud.Place(tab.rectTransform, tx, 0, tabW[i], 34);
            if (on) Hud.Shadow(tab, 17, new Hud.Drop(Color.white, 0, 0, 1.5f), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.2f), 4, 16));
            else Hud.Shadow(tab, 17, new Hud.Drop(Color.white, 0, 0, 1), new Hud.Drop(Hud.Rgba(90, 90, 110, 0.12f), 2, 8));
            tab.raycastTarget = true;
            var tb = tab.gameObject.AddComponent<Button>();
            var colors = tb.colors;
            colors.highlightedColor = on ? Color.white : new Color(1 / 0.7f, 1 / 0.7f, 1 / 0.7f);
            tb.colors = colors;
            string id = o.Id;
            tb.onClick.AddListener(() => { Sound.Play("click"); PlayerSummary(id, false); });
            Orb(tab.transform, 4, 4, 26, o.Heat, Game.SupernovaThreshold(o), o.Eliminated);
            MenuKit.Words(tab.transform, TabName(o), 1 + 3 + 26 + 6, 0, tabW[i] - 36, 34, 8.32f, on ? Look.Ink : Look.InkSoft, true, 500, 0.14f, TextAlignmentOptions.Left);
            if (o.Eliminated) tab.gameObject.AddComponent<CanvasGroup>().alpha = 0.5f;
            tx += tabW[i] + 6;
        }

        // The card (.sys-card): white, corners 18, padded clamp(12px, 3vh, 22px) clamp(14px, 3vw, 26px) 0, its rows
        // clamp(6px, 1.6vh, 12px) apart; on a phone a grid of two columns (as auto-placed: see Place below).
        float padT = Css.Clamp(12, 3 * l.Vh, 22), padX = Css.Clamp(14, 3 * l.Vw, 26), rowGap = Css.Clamp(6, 1.6f * l.Vh, 12);
        float inner = w - 2 - 2 * padX, colW = big ? inner : (inner - 18) / 2;
        var card = Hud.Box(wrap, "Card", Color.white, 18);
        card.raycastTarget = true;
        card.gameObject.AddComponent<Button>().transition = Selectable.Transition.None;
        Hud.Shadow(card, 18, new Hud.Drop(Hud.Rgba(120, 124, 134, 0.08f), 0, 0, 1), new Hud.Drop(Hud.Rgba(80, 80, 100, 0.18f), 30, 80), new Hud.Drop(Hud.Rgba(80, 80, 100, 0.08f), 6, 18));
        // Its items, each drawn into a box of its own (laid out in the grid afterwards): its columns (0 both, 1, 2, or
        // -1 placed in turn), its height, and its own left margin (the close's −padX).
        var items = new List<(RectTransform r, int col, float h, float dx)>();
        RectTransform Item(string name) => Hud.Rect(card.transform, name);
        string who = p.Id == you ? "YOU" : p.Name.ToUpperInvariant();
        var kicker = Item("Kicker");
        MenuKit.Words(kicker, who, 0.15f * 7.68f, 0, inner, MenuKit.LineH(7.68f), 7.68f, Look.InkFaint, true, 400, 0.3f);
        items.Add((kicker, 0, MenuKit.LineH(7.68f), 0));
        float av = Css.Clamp(44, 12 * l.Vh, 64);
        var emblem = Item("Emblem");
        PlayerPicture(emblem, (colW - av) / 2, 0, av, p.Avatar ?? PictureFor(p.Name));
        items.Add((emblem, -1, av, 0));
        float nameSize = Css.Clamp(16, 4.4f * l.Vh, 24);
        var name = Item("Deck");
        string deck = (p.DeckName ?? "custom deck").ToUpperInvariant();
        var nt = MenuKit.Words(name, deck, 0.15f * nameSize, 0, colW, MenuKit.LineH(nameSize), nameSize, Hud.Rgba(0x55, 0x5a, 0x63), true, 400, 0.3f);
        nt.textWrappingMode = TextWrappingModes.Normal;
        float nameH = Mathf.Max(MenuKit.LineH(nameSize), nt.GetPreferredValues(deck, colW, 0).y);
        nt.rectTransform.sizeDelta = new Vector2(colW, nameH);
        items.Add((name, 1, nameH, 0));
        // (p.muted: 12.8 px, faint, centred, its 1em margins kept: a grid's items' margins do not collapse.)
        float Muted(string text, Texture2D mark)
        {
            var r = Item("Muted");
            float room = colW - (mark != null ? 14 : 0);
            var t = MenuKit.Words(r, text, 0, 12.8f, room, 16, 12.8f, Look.InkFaint, false, 400);
            t.textWrappingMode = TextWrappingModes.Normal;
            float th = t.GetPreferredValues(text, room, 0).y;
            float tw = mark != null ? Mathf.Min(room, t.GetPreferredValues(text).x + 1) : colW;
            Hud.Place(t.rectTransform, (colW - tw - (mark != null ? 14 : 0)) / 2 + (mark != null ? 14 : 0), 12.8f, tw, th);
            if (mark != null)
            {
                // (mechanicMark('trap'), an em across, before the words.)
                var m = Hud.Rect(r, "Mark");
                Hud.Place(m, (colW - tw - 14) / 2, 12.8f + 2, 12, 12);
                var mi = m.gameObject.AddComponent<RawImage>();
                mi.texture = mark;
                mi.color = Look.Kind["trap"];
                mi.raycastTarget = false;
            }
            items.Add((r, -1, 12.8f + th + 12.8f, 0));
            return th;
        }
        var commands = p.Tableau.Where(c => Cards.Def(c.DefId).Kind == "command").Select(c => Cards.Def(c.DefId).Name.ToLowerInvariant() + (c.Choice != null ? $" ({Words(c.Choice)})" : "")).ToList();
        if (commands.Count > 0) Muted($"Heroes in play: {string.Join(" · ", commands)}", null);
        if (p.Lightspeed != null) Muted(p.Id == you ? $"Set face down: {Cards.Def(p.Lightspeed.DefId).Name.ToLowerInvariant()}" : "A trap is set face down.", Resources.Load<Texture2D>("Icons/bt-trap"));
        if (p.Conditions != null && p.Conditions.Count > 0)
        {
            // (.sys-conditions: a box each, 4 apart, padded 6 × 10, a violet tint and edge; its name 8.96 px spaced 0.18em.)
            var r = Item("Conditions");
            float cy = 0;
            foreach (var c in p.Conditions)
            {
                string body = c.Text ?? "";
                var box = MenuKit.Inset(r, "Condition", Color.Lerp(Color.white, Hud.Rgba(120, 110, 170), 0.07f), Hud.Rgba(120, 110, 170, 0.28f), 10);
                var bt = MenuKit.Words(box.transform, body, 11, 0, colW - 22, 16, 12.8f, Look.InkSoft, false, 400);
                bt.textWrappingMode = TextWrappingModes.Normal;
                float bh = bt.GetPreferredValues(body, colW - 22, 0).y, hh = MenuKit.LineH(8.96f);
                MenuKit.Words(box.transform, (c.Name ?? "").ToUpperInvariant(), 11 + 0.09f * 8.96f, 7, colW - 22, hh, 8.96f, Hud.Rgba(0x7a, 0x6f, 0xae), true, 500, 0.18f);
                Hud.Place(bt.rectTransform, 11, 7 + hh, colW - 22, bh);
                float boxH = 1 + 6 + hh + bh + 6 + 1;
                Hud.Place(box.rectTransform, 0, cy, colW, boxH);
                cy += boxH + 4;
            }
            items.Add((r, -1, cy - 4, 0));
        }
        // (.sys-stats: 12.16 px soft ink, wrapping, centred, 4 × 12 apart.)
        var stats = Item("Stats");
        var parts = new List<(string text, bool hand)>
        {
            ($"heat {p.Heat}/{Game.SupernovaThreshold(p)}", false), ($"⬡ {p.Shields}", false), ($"{p.Hand.Count} in hand", true),
            ($"▤ {p.Deck.Count} in deck", false), ($"{p.Discard.Count} discarded", false), ($"{p.Tableau.Count}/{Balance.TableauSlots} in play", false),
        };
        float iconW = 12.16f + 3;
        var widths = parts.Select(s => MenuKit.TextW(s.text, 12.16f, 400, 0, false) + (s.hand ? iconW : 0)).ToList();
        float sy = 0;
        int k = 0;
        while (k < parts.Count)
        {
            int j = k;
            float lw = widths[j++];
            while (j < parts.Count && lw + 12 + widths[j] <= colW) lw += 12 + widths[j++];
            bool icon = parts.Skip(k).Take(j - k).Any(s => s.hand);
            float lh = icon ? 15 : MenuKit.LineH(12.16f, false), sx = (colW - lw) / 2;
            for (int i = k; i < j; i++)
            {
                float ix = sx;
                if (parts[i].hand)
                {
                    var hm = Hud.Rect(stats, "Hand");
                    Hud.Place(hm, ix, sy + (lh - 12.16f) / 2, 12.16f, 12.16f);
                    var hi = hm.gameObject.AddComponent<RawImage>();
                    hi.texture = Resources.Load<Texture2D>("Icons/bt-hand");
                    hi.raycastTarget = false;
                    ix += iconW;
                }
                MenuKit.Words(stats, parts[i].text, ix - 2, sy, widths[i] + 4 - (parts[i].hand ? iconW : 0), lh, 12.16f, Look.InkSoft, false, 400);
                sx += widths[i] + 12;
            }
            sy += lh + 4;
            k = j;
        }
        items.Add((stats, 2, sy - 4, 0));
        float closeH = 1 + 11 + MenuKit.LineH(8.96f) + 11;
        var close = Item("Close");
        ModalCancel(close, 0, 0, inner, closeH);
        items.Add((close, 0, closeH, -padX));

        // The grid (on a phone: CSS grid's auto-placement, in order: an item given a column goes to the earliest row at
        // or after the cursor where that column is free (the next row, if its column is before the cursor's); one with
        // none takes the next free cell; spanning both, a row of its own).
        var at = new List<(int row, int col)>();
        int rowN = 0, cursor = 0;
        var taken = new HashSet<(int, int)>();
        foreach (var it in items)
        {
            if (big) { at.Add((at.Count, 1)); continue; }
            int row = rowN, col;
            if (it.col == 0)
            {
                if (cursor > 0) row++;
                while (taken.Contains((row, 1)) || taken.Contains((row, 2))) row++;
                taken.Add((row, 1));
                taken.Add((row, 2));
                at.Add((row, 0));
                rowN = row;
                cursor = 2;
                continue;
            }
            if (it.col > 0)
            {
                col = it.col;
                if (col <= cursor) row++;
                while (taken.Contains((row, col))) row++;
            }
            else
            {
                col = cursor + 1;
                if (col > 2) { col = 1; row++; }
                while (taken.Contains((row, col))) { col++; if (col > 2) { col = 1; row++; } }
            }
            taken.Add((row, col));
            at.Add((row, col));
            rowN = row;
            cursor = col;
        }
        int rows = at.Count == 0 ? 0 : at.Max(a => a.row) + 1;
        var rowH = new float[rows];
        for (int i = 0; i < items.Count; i++) rowH[at[i].row] = Mathf.Max(rowH[at[i].row], items[i].h);
        var rowY = new float[rows];
        float yy = 1 + padT;
        for (int r = 0; r < rows; r++)
        {
            rowY[r] = yy;
            yy += rowH[r] + (r < rows - 1 ? rowGap : 0);
        }
        for (int i = 0; i < items.Count; i++)
        {
            var (r, col, h, dx) = items[i];
            float x = 1 + padX + dx + (col == 2 ? colW + 18 : 0);
            Hud.Place(r, x, rowY[at[i].row], col == 0 ? inner : colW, h);
        }
        float cardH = yy + 1;
        Hud.Place(card.rectTransform, 0, 34 + 8, w, cardH);
        float wrapH = 34 + 8 + cardH;
        float cx = l.PadL + (l.W - l.PadL - l.PadR) / 2, cyy = l.PadT + (l.H - l.PadT - l.PadB) / 2;
        Hud.Place(wrap, cx - w / 2, cyy - wrapH / 2, w, wrapH);
        if (rise) RiseIn.On(wrap, Time.time, 0, 0.25f, 10 / WebLook.Zoom, true);
    }

    string TabName(PlayerState o) => o.Id == you ? "YOU" : o.Name.ToUpperInvariant();

    /// <summary>A player's picture when they have none of their own (glyphs.ts pictureFor): a card's art picked by their name.</summary>
    static string PictureFor(string name)
    {
        var pool = CardData.All.Where(c => c.Token != true).ToList();
        uint h = 0;
        foreach (char ch in name.ToLowerInvariant()) h = unchecked(h * 31 + ch);
        return pool.Count > 0 ? pool[(int)(h % (uint)pool.Count)].Id : null;
    }

    /// <summary>
    /// A player's picture (glyphs.ts playerAvatar, .avatar): their card's art in a circle on the dark of space, zoomed
    /// 1.5 times into it, ringed white then #dfe3ec.
    /// </summary>
    static void PlayerPicture(Transform parent, float x, float y, float size, string cardId)
    {
        var disc = Hud.Rect(parent, "Avatar");
        Hud.Place(disc, x, y, size, size);
        var di = disc.gameObject.AddComponent<Image>();
        di.sprite = Hud.Circle;
        di.color = Hud.Rgba(26, 28, 42);
        di.raycastTarget = false;
        Hud.Shadow(di, size / 2, new Hud.Drop(Color.white, 0, 0, 1.5f), new Hud.Drop(Hud.Rgba(223, 227, 236), 0, 0, 2.5f));
        if (cardId == null) return;
        disc.gameObject.AddComponent<Mask>().showMaskGraphic = true;
        var art = Hud.Rect(disc, "Art");
        Hud.Fill(art);
        var ai = art.gameObject.AddComponent<RawImage>();
        ai.texture = EngineData.Art(cardId);
        ai.raycastTarget = false;
        // (avatarStyle with its subject taken at the middle: the art 240% × 150% of the circle, from −70%, −25%.)
        ai.uvRect = new Rect(0.7f / 2.4f, 0.25f / 1.5f, 1 / 2.4f, 1 / 1.5f);
    }

    static readonly Dictionary<string, Texture2D> orbs = new Dictionary<string, Texture2D>();

    /// <summary>
    /// A sun's orb (art.ts sunOrb, .orb): a thin ring filling grey from its foot clockwise as the heat nears supernova,
    /// over white; inside it, 14% in, a pearl core lit at 36% 32% and tinted by the heat (heatTint), glowing; a soft
    /// shadow under it. Dead: grey and faint.
    /// </summary>
    static void Orb(Transform parent, float x, float y, float size, int heat, int threshold, bool dead)
    {
        float pct = Mathf.Clamp01((heat - (float)Balance.MinHeat) / (threshold - Balance.MinHeat));
        var tint = HeatTint(heat, threshold);
        string key = $"{Mathf.RoundToInt(pct * 100)}|{ColorUtility.ToHtmlStringRGB(tint)}|{dead}";
        if (!orbs.TryGetValue(key, out var tex))
        {
            const int n = 64;
            tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color[n * n];
            Color grey = Hud.Rgba(0x9e, 0xa1, 0xa8);
            for (int j = 0; j < n; j++)
                for (int i = 0; i < n; i++)
                {
                    float u = (i + 0.5f) / n - 0.5f, v = 0.5f - (j + 0.5f) / n, d = Mathf.Sqrt(u * u + v * v);
                    var c = new Color(0, 0, 0, 0);
                    // (The ring: the mask's 62%–64% of the farthest corner, 0.438–0.453 of the box, out to its edge.)
                    float ring = Mathf.Clamp01((d - 0.438f) / 0.015f) * Mathf.Clamp01((0.5f - d) * n + 0.5f);
                    if (ring > 0)
                    {
                        // (conic-gradient(from 180deg): clockwise from the foot.)
                        float a = Mathf.Repeat(Mathf.Atan2(-u, -v) * Mathf.Rad2Deg, 360) / 360;
                        var rc = a <= pct ? grey : new Color(1, 1, 1, 0.85f);
                        c = new Color(rc.r, rc.g, rc.b, rc.a * ring);
                    }
                    // (The core, 14% in: radial-gradient(circle at 36% 32%, #fff 0 30%, the tint at its farthest corner).)
                    float cr = 0.36f, cu = (i + 0.5f) / n - 0.14f, cv = (j + 0.5f) / n;
                    cv = 1 - cv - 0.14f;
                    float ccx = cu / 0.72f, ccy = cv / 0.72f, cd = new Vector2(u, v).magnitude;
                    if (cd < cr)
                    {
                        float far = new Vector2(0.64f, 0.68f).magnitude, g = new Vector2(ccx - 0.36f, ccy - 0.32f).magnitude / far;
                        var core = g <= 0.3f ? Color.white : Color.Lerp(Color.white, tint, (g - 0.3f) / 0.7f);
                        float ca = Mathf.Clamp01((cr - cd) * n + 0.5f);
                        c = Color.Lerp(c, new Color(core.r, core.g, core.b, 1), ca);
                    }
                    if (dead)
                    {
                        float l = c.grayscale;
                        c = new Color(l, l, l, c.a * 0.4f);
                    }
                    px[j * n + i] = c;
                }
            tex.SetPixels(px);
            tex.Apply();
            orbs[key] = tex;
        }
        var r = Hud.Rect(parent, "Orb");
        Hud.Place(r, x, y, size, size);
        // (Its glow, 0 0 30% of it in the tint, and the shell's soft shadow, 0 4px 14px.)
        var glow = Hud.Rect(r, "Glow");
        Hud.Fill(glow);
        float gs = size * 0.3f;
        glow.offsetMin = new Vector2(-gs + size * 0.14f, -gs + size * 0.14f);
        glow.offsetMax = new Vector2(gs - size * 0.14f, gs - size * 0.14f);
        var gi = glow.gameObject.AddComponent<Image>();
        gi.sprite = Hud.Soft;
        gi.type = Image.Type.Sliced;
        gi.pixelsPerUnitMultiplier = 14.4f / Mathf.Max(1, gs);
        gi.color = new Color(tint.r, tint.g, tint.b, dead ? 0 : 0.9f);
        gi.raycastTarget = false;
        var img = r.gameObject.AddComponent<RawImage>();
        img.texture = tex;
        img.raycastTarget = false;
        Hud.Shadow(img, size / 2, new Hud.Drop(Hud.Rgba(80, 80, 100, dead ? 0.06f : 0.16f), 4, 14));
    }

    /// <summary>art.ts heatTint: a pale blue below zero, warming from a pale sand to a soft red as the heat nears supernova.</summary>
    static Color HeatTint(int heat, int threshold)
    {
        if (heat <= 0)
        {
            float t = Mathf.Min(1, heat / (float)Balance.MinHeat);
            return Hsl(205, Mathf.Lerp(10, 38, t), Mathf.Lerp(97, 86, t));
        }
        float k = Mathf.Min(1, heat / (float)threshold);
        return Hsl(Mathf.Lerp(35, 10, k), Mathf.Lerp(15, 55, k), Mathf.Lerp(96, 80, k));
    }

    static Color Hsl(float h, float s, float l)
    {
        s /= 100;
        l /= 100;
        float a = s * Mathf.Min(l, 1 - l);
        float F(float n)
        {
            float k = (n + h / 30) % 12;
            return l - a * Mathf.Max(-1, Mathf.Min(k - 3, Mathf.Min(9 - k, 1)));
        }
        return new Color(F(0), F(8), F(4));
    }

    // ---- The global field's chip (app.ts renderHud .field) ----

    /// <summary>
    /// While a global card is in play, its chip in the HUD's top right, before the log button (.field: a white pill
    /// padded 3 10 3 4, a violet ring and glow pulsing every 3.2 s, its glyph and its name in 8.32 px capitals spaced
    /// 0.14em, the name dropped on a small screen). Tapped, it opens the card's inspector.
    /// </summary>
    void FieldChip()
    {
        var g = state != null ? Game.ActiveGlobal(state) : null;
        string id = g?.Card.DefId;
        if (fieldChip != null && fieldShown == id)
        {
            // (fieldPulse: the ring 0.35 → 0.5 and the glow 14 → 20 px at 0.25 → 0.4, and back, eased.)
            var sh = fieldChip.GetComponent<Shades>();
            if (sh != null)
            {
                float k = (1 - Mathf.Cos(Time.time / 3.2f * 2 * Mathf.PI)) / 2;
                sh.Set(0, new Hud.Drop(Hud.Rgba(146, 101, 214, Mathf.Lerp(0.35f, 0.5f, k)), 0, 0, 1));
                sh.Set(1, new Hud.Drop(Hud.Rgba(146, 101, 214, Mathf.Lerp(0.25f, 0.4f, k)), 0, Mathf.Lerp(14, 20, k)));
            }
            return;
        }
        if (fieldChip != null) Mats.Kill(fieldChip.gameObject);
        fieldChip = null;
        fieldShown = id;
        if (id == null) return;
        var l = BoardLayout.Current;
        var def = Cards.Def(id);
        bool named = !(Css.Screen.x > Css.Screen.y ? Css.Screen.x <= 760 : Css.Screen.y <= 760);
        string word = def.Name.ToUpperInvariant();
        float nameW = named ? MenuKit.TextW(word, 8.32f, 500, 0.14f) + 0.14f * 8.32f : 0;
        float w = 1 + 4 + 30 + (named ? 4 + nameW : 0) + 10 + 1, h = 1 + 3 + 20 + 3 + 1;
        float b = Css.Clamp(36, 8 * l.Vh, 44);
        var chip = Hud.Box(chrome, "Field", new Color(1, 1, 1, 0.85f), h / 2);
        chip.raycastTarget = true;
        Hud.Shadow(chip, h / 2, new Hud.Drop(Hud.Rgba(146, 101, 214, 0.35f), 0, 0, 1), new Hud.Drop(Hud.Rgba(146, 101, 214, 0.25f), 0, 14));
        // (Its right edge 6 before the log button's; level with the buttons' middle.)
        Hud.At(chip.rectTransform, new Vector2(1, 1), new Vector2(-l.PadR - 2 * (b + 6) - b - 6, -l.PadT - (b - h) / 2), new Vector2(w, h));
        var glyph = Hud.Rect(chip.transform, "Glyph");
        // (Baked with 4 px round it, for its strokes: scripts/bake-field-glyphs.mjs.)
        Hud.Place(glyph, 1 + 4 - 4, 1 + 3 - 4, 38, 28);
        var gl = glyph.gameObject.AddComponent<RawImage>();
        gl.texture = Resources.Load<Texture2D>($"Icons/glyph/{id}");
        gl.color = gl.texture != null ? Color.white : new Color(1, 1, 1, 0);
        gl.raycastTarget = false;
        if (named) MenuKit.Words(chip.transform, word, 1 + 4 + 30 + 4, 0, nameW + 4, h, 8.32f, Hud.Rgba(0x6d, 0x4b, 0xb0), true, 500, 0.14f, TextAlignmentOptions.Left);
        var btn = chip.gameObject.AddComponent<Button>();
        btn.transition = Selectable.Transition.None;
        btn.onClick.AddListener(() => { Sound.Play("hover"); ShowZoom(id, null); });
        chip.gameObject.AddComponent<Tip>().Text = PlainText(def.Text);
        fieldChip = chip.rectTransform;
    }

    /// <summary>keywords.ts plainText, near enough: a card's words with its keywords named ("{heat:1}" as "Heat 1").</summary>
    static string PlainText(string text)
    {
        string s = Regex.Replace(text ?? "", @"\{([a-zA-Z]+)(?::([^}]*))?\}", m =>
        {
            string k = m.Groups[1].Value;
            string name = char.ToUpperInvariant(k[0]) + k.Substring(1);
            return m.Groups[2].Success ? $"{name} {m.Groups[2].Value}" : name;
        });
        return s.Length > 0 ? char.ToUpperInvariant(s[0]) + s.Substring(1) : s;
    }

    // ---- The board's own buttons (Board's BoardHit: its piles, its names, its eyes) ----

    /// <summary>
    /// A tap on one of the board's own buttons: a reserves or wreckage pile looked through, a name's summary, an eye's
    /// zoom (as app.ts acts on them whatever the day). Whether it was one.
    /// </summary>
    bool TapBoardHit(Collider c)
    {
        var hit = c != null ? c.GetComponent<BoardHit>() : null;
        if (hit == null || state == null) return false;
        var of = hit.Mine ? Me : Rival;
        switch (hit.Act)
        {
            case "discard":
            case "wreck":
                Sound.Play("click");
                OpenPile(of.Id, hit.Act == "wreck");
                return true;
            case "name":
                Sound.Play("click");
                OpenPlayer(of.Id);
                return true;
            case "eye":
                Sound.Play("click");
                SetBoardZoom(zoom == (hit.Mine ? "mine" : "rival") ? null : hit.Mine ? "mine" : "rival");
                return true;
        }
        return false;
    }
}
