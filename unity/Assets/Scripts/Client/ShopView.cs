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
    static Texture2D PackFace(int? kind) => Resources.Load<Texture2D>($"Icons/pack-{(kind == null ? "general" : kind.Value.ToString())}");

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

    /// <summary>The baked wrapper (turned, with its shadow) is 1.44 times the pack's width, the pack 18% in from its left and top.</summary>
    static RawImage Wrapper(Transform parent, int? kind, float x, float y, float w)
    {
        var face = Hud.Rect(parent, "Wrapper");
        Hud.Place(face, x - 0.182f * w, y - 0.182f * w, 1.4394f * w, 1.4394f * w * 552f / 380f);
        var img = face.gameObject.AddComponent<RawImage>();
        img.texture = PackFace(kind);
        img.raycastTarget = false;
        return img;
    }

    // ---- The packs: rows of the wrappers, each its name and price ----

    void Packs()
    {
        var f = menu.Setup(root, "shop", () => menu.Show("hub"));
        // (.shop-body: its label (.section-label) over the packs, clamp(10px, 2.4vh, 20px) apart, centred in the body.
        // .pack-row: the slots wrapped in centred rows, clamp(14px, 2.6vw, 30px) apart; each its wrapper (5:8, max(56px,
        // min(12vw, 132px, (the page's height less 120, halved, less 56) × 0.625)) across), then 6 under it its name
        // (10.56 bold, spaced 0.18em) and price, 6 apart.)
        float gap = K.Clamp(10, 2.4f * K.Vh, 20), rowGap = K.Clamp(14, 2.6f * K.Vw, 30);
        float pw = Mathf.Max(56, Mathf.Min(12 * K.Vw, 132, ((K.H - 120) / 2 - 56) * 0.625f)), ph = pw * 1.6f;
        float slotH = ph + 6 + 12.4f + 6 + 12.4f, labelF = K.Big ? 8.96f : 8;
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
        float total = K.LineH(labelF) + gap + rows.Count * slotH + (rows.Count - 1) * rowGap;
        var content = K.Scroller(root, "Packs", 0, f.BodyTop, K.W, f.BodyH, total);
        float y = Mathf.Max(0, (f.BodyH - total) / 2);
        K.Words(content, $"BOOSTERS · ✦ {Progression.BoosterPrice} EACH", f.Left, y, avail, K.LineH(labelF), labelF, Look.InkSoft, true, 400, 0.3f);
        y += K.LineH(labelF) + gap;
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
                var img = Wrapper(slot, kind, (sw - pw) / 2, 0, pw);
                // (Too dear: greyed and faded, as the web's.)
                img.color = afford ? Color.white : new Color(0.8f, 0.8f, 0.8f, 0.6f);
                K.Words(slot, PackName(kind).ToUpperInvariant(), -10, ph + 6, sw + 20, 12.4f, 10.56f, Look.Ink, true, 700, 0.18f);
                K.Words(slot, $"✦ {Progression.BoosterPrice}", 0, ph + 6 + 12.4f + 6, sw, 12.4f, 10.56f, Hud.Rgba(185, 133, 42), true, 400);
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

    // ---- A booster torn open: the wrapper drops away, the cards come out ----

    void Opened()
    {
        // The foot (.setup-foot): what was opened, quiet, on the left; done, the primary button, on the right.
        float doneH = K.LineH(10.56f) + 24;
        var f = menu.Setup(root, "shop", () => { opened = null; Draw(); }, false, doneH);
        float footY = f.FootTop + (f.FootH - f.FootPad) / 2;
        K.Words(root, $"{PackName(openedKind)} booster", f.Left, footY - 7.5f, 300, 15, 12.8f, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Left);
        float dw = Mathf.Max(160, K.BtnW("done", K.Kind.Primary, 10.56f, 0.24f, 24));
        K.Btn(root, "done", () => { opened = null; Draw(); }, f.Right - dw, footY - doneH / 2, K.Kind.Primary, dw, doneH, 10.56f, 0.24f);

        // (.booster-cards: faces clamp(96px, 13vw, 150px) across, 12 apart, wrapped and centred, each its word (9.6
        // spaced 0.14em) 6 under it; as many as fit the body, shrunk to fit its height if need be. The wrapper over
        // them, falling away.)
        int n = opened.Count;
        float cw = K.Clamp(96, 13 * K.Vw, 150), gap = 12, avail = f.Right - f.Left;
        int perRow = Mathf.Max(1, Mathf.Min(n, Mathf.FloorToInt((avail + gap) / (cw + gap))));
        int rowsN = (n + perRow - 1) / perRow;
        float cellH = cw * 1.4f + 6 + 11;
        if (rowsN * cellH + (rowsN - 1) * gap > f.BodyH) cw = Mathf.Max(48, ((f.BodyH - (rowsN - 1) * gap) / rowsN - 17) / 1.4f);
        cellH = cw * 1.4f + 6 + 11;
        float top = f.BodyTop + Mathf.Max(0, (f.BodyH - (rowsN * cellH + (rowsN - 1) * gap)) / 2);
        var reveal = root.gameObject.AddComponent<BoosterReveal>();
        for (int i = 0; i < n; i++)
        {
            var c = opened[i];
            int row = i / perRow, col = i % perRow, inRow = Mathf.Min(perRow, n - row * perRow);
            float x = (f.Left + f.Right - (inRow * cw + (inRow - 1) * gap)) / 2 + col * (cw + gap);
            var slot = Hud.Rect(root, c.Id);
            Hud.Place(slot, x, top + row * (cellH + gap), cw, cellH);
            var face = Hud.Rect(slot, "Face");
            Hud.At(face, new Vector2(0.5f, 1), Vector2.zero, new Vector2(cw, cw * 1.4f));
            var raw = face.gameObject.AddComponent<RawImage>();
            raw.texture = Faces.Of(c.Id, false);
            raw.raycastTarget = false;
            bool isNew = c.IsNew == true;
            var tag = c.Flux != null ? $"SPARE · +⟁{c.Flux}" : isNew ? "NEW" : "ANOTHER COPY";
            var colour = c.Flux != null ? Hud.Rgba(109, 111, 208) : isNew ? Look.Good : Look.InkSoft;
            K.Words(slot, tag, -10, cw * 1.4f + 6, cw + 20, 11, 9.6f, colour, true, isNew ? 700 : 400, 0.14f);
            reveal.Shown.Add(slot.gameObject.AddComponent<CanvasGroup>());
        }
        float pw = Mathf.Min(cw * 0.92f, 132);
        var pack = Wrapper(root, openedKind, (f.Left + f.Right - pw) / 2, top + 10, pw);
        reveal.Pack = pack.gameObject.AddComponent<CanvasGroup>();
        reveal.Fall = pw * 1.6f * 0.6f;
        reveal.Begin();
    }
}

/// <summary>A booster's reveal (styles.css pack-drop, booster-reveal): the wrapper drops and fades, then the cards rise in one by one.</summary>
public class BoosterReveal : MonoBehaviour
{
    public readonly List<CanvasGroup> Shown = new List<CanvasGroup>();
    public CanvasGroup Pack;
    /// <summary>How far the wrapper drops as it goes.</summary>
    public float Fall = 128;
    float start;
    Vector2 packAt;

    public void Begin()
    {
        start = Time.time;
        if (Pack != null) packAt = ((RectTransform)Pack.transform).anchoredPosition;
        // (Out of play, as for a screenshot: shown as it ends.)
        Apply(Application.isPlaying ? 0 : 10);
    }

    void Update() => Apply(Time.time - start);

    void Apply(float t)
    {
        if (Pack != null)
        {
            float k = Mathf.Clamp01((t - 0.44f) / 0.66f);
            k = k * k;
            Pack.alpha = 1 - k;
            var r = (RectTransform)Pack.transform;
            r.anchoredPosition = packAt + new Vector2(0, -Fall * k);
            r.localScale = Vector3.one * (1 - 0.1f * k);
            if (t > 1.1f) Pack.gameObject.SetActive(false);
        }
        for (int i = 0; i < Shown.Count; i++)
        {
            var g = Shown[i];
            if (g == null) continue;
            float k = Mathf.Clamp01((t - 0.65f - i * 0.16f) / 0.55f);
            float e = 1 - (1 - k) * (1 - k) * (1 - k);
            g.alpha = k;
            var r = (RectTransform)g.transform;
            r.localScale = new Vector3(Mathf.Lerp(0.05f, 1, e), Mathf.Lerp(0.7f, 1, e), 1);
            // (Its face drops in from a little above.)
            if (r.childCount > 0) ((RectTransform)r.GetChild(0)).anchoredPosition = new Vector2(0, 40 * (1 - e));
        }
        if (t > 2.5f) enabled = false;
    }
}
