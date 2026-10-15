using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using K = MenuKit;

/// <summary>
/// The shop (app.ts renderShop): booster packs, one for each race and a general one, at ✦100 each; one bought tears
/// open and its five cards come out, each new, another copy, or (already held as many as a deck can use) spare flux.
/// Bought from the server, which keeps the account's economy (EconomyCalls); with no server, against this device's profile.
/// </summary>
public class ShopView : MonoBehaviour, MenuView.IRedraw
{
    RectTransform root;
    MenuView menu;
    // The booster just opened: its kind (null: the general one) and its cards.
    int? openedKind;
    List<BoosterCard> opened;
    // (A booster asked of the server, not yet answered.)
    bool buying;

    public static ShopView Make(RectTransform parent, MenuView menu)
    {
        var r = Hud.Rect(parent, "Shop");
        Hud.Fill(r);
        var v = r.gameObject.AddComponent<ShopView>();
        v.root = r;
        v.menu = menu;
        v.Draw();
        return v;
    }

    static string PackName(int? kind) => kind == null ? "general" : Races.RaceNames[kind.Value].ToLowerInvariant();

    /// <summary>
    /// A pack's baked picture (scripts/bake-menus.mjs): turned as the shop's row shows it (`part` ""), too dear ("off"),
    /// or torn open facing straight on, its body ("open") or its tear strip ("tear"); baked 132 across, the web's
    /// largest, and 62 across as a phone held sideways sizes it and its words ("-m": for packs drawn under 97 across).
    /// </summary>
    static Texture2D PackFace(int? kind, string part, bool small)
        => Resources.Load<Texture2D>($"Icons/pack-{(kind == null ? "general" : kind.Value.ToString())}{(part.Length > 0 ? "-" + part : "")}{(small ? "-m" : "")}");

    /// <summary>The web's .pack width: as wide as the window allows, short enough that two rows (with their labels) fit under the page's header.</summary>
    static float PackW => Mathf.Max(56, Mathf.Min(12 * K.Vw, 132, ((K.H - 120) / 2 - 56) * 0.625f));

    public void Redraw() => Draw();

    void Draw()
    {
        var old = new List<GameObject>();
        foreach (Transform c in root) old.Add(c.gameObject);
        foreach (var o in old) Mats.Kill(o);
        var was = root.GetComponent<BoosterReveal>();
        if (was != null) Mats.Kill(was);
        if (opened != null) Opened();
        else Packs();
    }

    /// <summary>
    /// A pack's picture over its box (x, y its top-left, `w` across, 1.6 w tall): baked with its shadow, padded 24 left
    /// and top, 34 right and 40 below, in the baked pack's own measure (132 or 62 across).
    /// </summary>
    static RawImage Wrapper(Transform parent, int? kind, string part, float x, float y, float w)
    {
        bool small = w < 97;
        float baked = small ? 62 : 132, s = w / baked;
        var tex = PackFace(kind, part, small);
        var face = Hud.Rect(parent, "Wrapper " + part);
        float tw = (baked + 58) * s;
        Hud.Place(face, x - 24 * s, y - 24 * s, tw, tex != null ? tw * tex.height / tex.width : tw * 1.36f);
        var img = face.gameObject.AddComponent<RawImage>();
        img.texture = tex;
        img.raycastTarget = false;
        return img;
    }

    // ---- The packs: rows of the wrappers, each its name and price ----

    void Packs()
    {
        var f = menu.Setup(root, "shop", () => menu.Show("hub"));
        // (.shop-body: its label (.section-label, Orbitron's line, 1.25 of its size) over the packs, clamp(10px, 2.4vh,
        // 20px) apart, centred in the body. .pack-row: the slots wrapped in centred rows, clamp(14px, 2.6vw, 30px)
        // apart; each its wrapper (5:8), then 6 under it its name (10.56 bold, spaced 0.18em) and price, 6 apart, each
        // on a line 14 tall.)
        float gap = K.Clamp(10, 2.4f * K.Vh, 20), rowGap = K.Clamp(14, 2.6f * K.Vw, 30);
        float pw = PackW, ph = pw * 1.6f;
        float slotH = ph + 6 + 14 + 6 + 14, labelF = K.Big ? 8.96f : 8, labelH = labelF * 1.25f;
        bool afford = Profile.Me.Stardust >= Progression.BoosterPrice;
        var kinds = Progression.Boosters;
        var widths = kinds.Select(k => Mathf.Max(pw, K.TextW(PackName(k).ToUpperInvariant(), 10.56f, 700, 0.18f) + 2)).ToList();
        // (Rows as the flex row wraps them.)
        var rows = new List<List<int>> { new List<int>() };
        float run = 0, avail = f.Right - f.Left;
        for (int i = 0; i < kinds.Count; i++)
        {
            float need = (rows[rows.Count - 1].Count > 0 ? rowGap : 0) + widths[i];
            if (rows[rows.Count - 1].Count > 0 && run + need > avail) { rows.Add(new List<int>()); run = 0; need = widths[i]; }
            rows[rows.Count - 1].Add(i);
            run += need;
        }
        float total = labelH + gap + rows.Count * slotH + (rows.Count - 1) * rowGap;
        var content = K.Scroller(root, "Packs", 0, f.BodyTop, K.W, f.BodyH, total);
        float y = Mathf.Max(0, (f.BodyH - total) / 2);
        K.Words(content, $"BOOSTERS · ✦ {Progression.BoosterPrice} EACH", f.Left, y, avail, labelH, labelF, Look.InkSoft, true, 400, 0.3f);
        y += labelH + gap;
        foreach (var row in rows)
        {
            float rw = row.Sum(i => widths[i]) + (row.Count - 1) * rowGap, x = (f.Left + f.Right - rw) / 2;
            foreach (int i in row)
            {
                int? kind = kinds[i];
                float sw = widths[i];
                var b = K.Hit(content, $"Pack {PackName(kind)}", null, false);
                var slot = (RectTransform)b.transform;
                Hud.Place(slot, x, y, sw, slotH);
                b.interactable = afford;
                b.onClick.AddListener(() => Buy(kind));
                // (Too dear: .pack-slot[disabled] .pack, greyed and faded, its shadow gone; baked so.)
                Wrapper(slot, kind, afford ? "" : "off", (sw - pw) / 2, 0, pw);
                K.Words(slot, PackName(kind).ToUpperInvariant(), -10, ph + 6, sw + 20, 14, 10.56f, Look.Ink, true, 700, 0.18f);
                K.Words(slot, $"✦ {Progression.BoosterPrice}", 0, ph + 6 + 14 + 6, sw, 14, 10.56f, Hud.Rgba(185, 133, 42), true, 400);
                x += sw + rowGap;
            }
            y += slotH + rowGap;
        }
    }

    /// <summary>
    /// Buy and open a booster (account.ts buyBooster): the server opens it (it keeps the collection), and the pack tears
    /// open once it answers; with no server, opened here as the server would (server/economy.ts buyBooster).
    /// </summary>
    void Buy(int? kind)
    {
        if (buying) return;
        buying = true;
        EconomyCalls.Booster(kind, (cards, why) =>
        {
            buying = false;
            if (this == null) return;
            if (why != null)
            {
                Sound.Play("error");
                menu.Toast(why);
                Draw();
                return;
            }
            openedKind = kind;
            opened = cards;
            Sound.Play("shuffle");
            Draw();
        });
    }

    // ---- A booster torn open: the strip tears off, the wrapper drops away, the cards come out ----

    void Opened()
    {
        // The foot (.setup-foot): what was opened, quiet, on the left; done, the primary button (its line 14 tall,
        // padded 12 above and below: 38), on the right.
        float doneH = 14 + 24;
        var f = menu.Setup(root, "shop", () => { opened = null; Draw(); }, false, doneH);
        float footY = f.FootTop + (f.FootH - f.FootPad) / 2;
        K.Words(root, $"{PackName(openedKind)} booster", f.Left, footY - 8, 300, 16, 12.8f, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Left);
        float dw = Mathf.Max(160, K.BtnW("done", K.Kind.Primary, 10.56f, 0.24f, 24));
        K.Btn(root, "done", () => { opened = null; Draw(); }, f.Right - dw, footY - doneH / 2, K.Kind.Primary, dw, doneH, 10.56f, 0.24f);

        // (.booster-cards: slots clamp(96px, 13vw, 150px) across, 12 apart, wrapped and centred in the body (which
        // scrolls when they are taller). In each, centred, the card's face: a hand card's (.card sets --cw to --hw, 0.714
        // of min(30vh, 230px)) across, 1.4 times that tall; 6 under it its word (9.6, spaced 0.14em, on a line 13 tall).)
        int n = opened.Count;
        float cw = K.Clamp(96, 13 * K.Vw, 150), fw = 0.714f * Mathf.Min(30 * K.Vh, 230), fh = fw * 1.4f, gap = 12, avail = f.Right - f.Left;
        int perRow = Mathf.Max(1, Mathf.Min(n, Mathf.FloorToInt((avail + gap) / (cw + gap))));
        int rowsN = (n + perRow - 1) / perRow;
        float cellH = fh + 6 + 13, total = rowsN * cellH + (rowsN - 1) * gap;
        var content = K.Scroller(root, "Opened", 0, f.BodyTop, K.W, f.BodyH, total);
        float top = Mathf.Max(0, (f.BodyH - total) / 2);
        var reveal = root.gameObject.AddComponent<BoosterReveal>();
        for (int i = 0; i < n; i++)
        {
            var c = opened[i];
            int row = i / perRow, col = i % perRow, inRow = Mathf.Min(perRow, n - row * perRow);
            float x = (f.Left + f.Right - (inRow * cw + (inRow - 1) * gap)) / 2 + col * (cw + gap);
            var slot = Hud.Rect(content, c.Id);
            // (Turned and scaled about its middle, as the web's transform-origin.)
            Hud.At(slot, new Vector2(0, 1), new Vector2(x + cw / 2, -(top + row * (cellH + gap) + cellH / 2)), new Vector2(cw, cellH));
            slot.pivot = new Vector2(0.5f, 0.5f);
            var face = Hud.Rect(slot, "Face");
            Hud.At(face, new Vector2(0.5f, 1), Vector2.zero, new Vector2(fw, fh));
            var raw = face.gameObject.AddComponent<RawImage>();
            raw.texture = Faces.Of(c.Id, false);
            raw.raycastTarget = false;
            // (Spare when it came as flux (none: not), new, or another copy: .bc-flux #6d6fd0, .bc-new #3a9e6a bold, ink-soft.)
            bool spare = (c.Flux ?? 0) > 0, isNew = !spare && c.IsNew == true;
            var tag = spare ? $"SPARE · +⟁{c.Flux}" : isNew ? "NEW" : "ANOTHER COPY";
            var colour = spare ? Hud.Rgba(109, 111, 208) : isNew ? Look.Good : Look.InkSoft;
            K.Words(slot, tag, -10, fh + 6, cw + 20, 13, 9.6f, colour, true, isNew ? 700 : 400, 0.14f);
            reveal.Shown.Add(slot.gameObject.AddComponent<CanvasGroup>());
        }
        // (.pack-ripped: the wrapper, its .pack width, centred over the cards 10 below their top; facing straight on,
        // its strip over its body.)
        float pw = PackW;
        var pack = Hud.Rect(content, "Pack");
        Hud.At(pack, new Vector2(0, 1), new Vector2(K.W / 2, -(top + 10 + pw * 0.8f)), new Vector2(pw, pw * 1.6f));
        pack.pivot = new Vector2(0.5f, 0.5f);
        Wrapper(pack, openedKind, "open", 0, 0, pw);
        var tear = Wrapper(pack, openedKind, "tear", 0, 0, pw);
        // (The strip turns about its own middle: 11% of the pack's height at its top.)
        var tr = tear.rectTransform;
        var size = tr.sizeDelta;
        var pivot = new Vector2((24 * pw / (pw < 97 ? 62f : 132f) + pw / 2) / size.x, 1 - (24 * pw / (pw < 97 ? 62f : 132f) + pw * 1.6f * 0.055f) / size.y);
        tr.anchoredPosition += new Vector2((pivot.x) * size.x, -(1 - pivot.y) * size.y);
        tr.pivot = pivot;
        reveal.Pack = pack.gameObject.AddComponent<CanvasGroup>();
        reveal.Tear = tear.gameObject.AddComponent<CanvasGroup>();
        reveal.PackW = pw;
        reveal.Begin();
    }
}

/// <summary>
/// A booster's reveal (styles.css .pack-ripped, .booster-card): the strip tears off (pack-tear, 0.5s), the wrapper
/// holds, then drops and fades (pack-drop, 1.1s), and the cards come in one by one (booster-reveal, 0.55s each, from
/// 0.65s, 0.16s apart).
/// </summary>
public class BoosterReveal : MonoBehaviour
{
    public readonly List<CanvasGroup> Shown = new List<CanvasGroup>();
    public CanvasGroup Pack, Tear;
    public float PackW = 62;
    float start;
    Vector2 packAt, tearAt;
    readonly List<Vector2> shownAt = new List<Vector2>();

    public void Begin()
    {
        start = Time.time;
        if (Pack != null) packAt = ((RectTransform)Pack.transform).anchoredPosition;
        if (Tear != null) tearAt = ((RectTransform)Tear.transform).anchoredPosition;
        foreach (var g in Shown) shownAt.Add(((RectTransform)g.transform).anchoredPosition);
        // (Out of play, as for a screenshot: shown as it ends.)
        Apply(Application.isPlaying ? 0 : 10);
    }

    void Update() => Apply(Time.time - start);

    void Apply(float t)
    {
        if (Tear != null)
        {
            // (pack-tear, cubic-bezier(.3,.7,.4,1): to translate(60%, -140%) rotate(28deg), faded out.)
            float e = Ease(0.3f, 0.7f, 0.4f, 1, Mathf.Clamp01(t / 0.5f));
            var r = (RectTransform)Tear.transform;
            r.anchoredPosition = tearAt + new Vector2(0.6f * PackW, 1.4f * PackW * 1.6f * 0.11f) * e;
            r.localEulerAngles = new Vector3(0, 0, -28 * e);
            Tear.alpha = 1 - e;
        }
        if (Pack != null)
        {
            // (pack-drop, cubic-bezier(.4,0,.6,1): held to 40%, then to translateY(60%) scale(0.9), faded out.)
            float e = Ease(0.4f, 0, 0.6f, 1, Mathf.Clamp01((t - 0.44f) / 0.66f));
            Pack.alpha = 1 - e;
            var r = (RectTransform)Pack.transform;
            r.anchoredPosition = packAt + new Vector2(0, -0.6f * PackW * 1.6f * e);
            r.localScale = Vector3.one * (1 - 0.1f * e);
            if (t > 1.1f) Pack.gameObject.SetActive(false);
        }
        for (int i = 0; i < Shown.Count; i++)
        {
            var g = Shown[i];
            if (g == null) continue;
            // (booster-reveal, cubic-bezier(.2,.8,.2,1): from opacity 0, translateY(-40px) scale(0.7) rotateY(80deg),
            // with no perspective: turned edge-on it narrows by the cosine.)
            float e = Ease(0.2f, 0.8f, 0.2f, 1, Mathf.Clamp01((t - 0.65f - i * 0.16f) / 0.55f));
            g.alpha = e;
            var r = (RectTransform)g.transform;
            float sc = Mathf.Lerp(0.7f, 1, e);
            r.localScale = new Vector3(sc * Mathf.Cos(80 * (1 - e) * Mathf.Deg2Rad), sc, 1);
            r.anchoredPosition = shownAt[i] + new Vector2(0, 40 * (1 - e));
        }
        if (t > 0.65f + Shown.Count * 0.16f + 0.6f) enabled = false;
    }

    /// <summary>A CSS cubic-bezier timing function at `x`.</summary>
    static float Ease(float x1, float y1, float x2, float y2, float x)
    {
        float t = x;
        for (int i = 0; i < 10; i++)
        {
            float u = 1 - t;
            float bx = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t - x;
            float dx = 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2);
            if (Mathf.Abs(dx) < 1e-5f) break;
            t = Mathf.Clamp01(t - bx / dx);
        }
        float v = 1 - t;
        return 3 * v * v * t * y1 + 3 * v * t * t * y2 + t * t * t;
    }
}
