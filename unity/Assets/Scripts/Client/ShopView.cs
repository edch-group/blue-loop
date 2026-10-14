using System.Collections.Generic;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// The shop (app.ts renderShop): booster packs, one for each race and a general one, at ✦100 each; one bought tears
/// open and its five cards come out, each new, another copy, or (already held as many as a deck can use) spare flux.
/// Bought from the server, which keeps the account's economy (EconomyCalls); with no server, against this device's profile.
/// </summary>
public class ShopView : MonoBehaviour
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

    void Draw()
    {
        var old = new List<GameObject>();
        foreach (Transform c in root) old.Add(c.gameObject);
        foreach (var o in old) Mats.Kill(o);
        var was = root.GetComponent<BoosterReveal>();
        if (was != null) Mats.Kill(was);
        menu.SetupTop(root, "shop", () => { if (opened != null) { opened = null; Draw(); } else menu.Show("hub"); });
        if (opened != null) Opened();
        else Packs();
    }

    // ---- The packs: two rows of the wrappers, each its name and price ----

    void Packs()
    {
        var head = Hud.Label(root, $"BOOSTERS · ✦ {Progression.BoosterPrice} EACH", 13, Look.InkSoft, true, 500, 30);
        head.rectTransform.anchoredPosition = new Vector2(0, 296);
        bool afford = Profile.Me.Stardust >= Progression.BoosterPrice;
        const float pw = 132, ph = 211, slotH = 262, gap = 30;
        var kinds = Progression.Boosters;
        for (int i = 0; i < kinds.Count; i++)
        {
            int row = i / 6, col = i % 6, inRow = Mathf.Min(6, kinds.Count - row * 6);
            int? kind = kinds[i];
            var slot = Hud.Rect(root, $"Pack {PackName(kind)}");
            Hud.At(slot, new Vector2(0.5f, 0.5f), new Vector2((col - (inRow - 1) / 2f) * (pw + gap), 120 - row * (slotH + gap)), new Vector2(pw, slotH));
            var hit = slot.gameObject.AddComponent<Image>();
            hit.color = new Color(1, 1, 1, 0.001f);
            var b = slot.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            b.onClick.AddListener(() => Buy(kind));
            // (The baked wrapper has room round it for its turn and its shadow: 24 left and above.)
            var face = Hud.Rect(slot, "Wrapper");
            Hud.At(face, new Vector2(0.5f, 1), new Vector2(5, 24), new Vector2(190, 276));
            var img = face.gameObject.AddComponent<RawImage>();
            img.texture = PackFace(kind);
            img.color = afford ? Color.white : new Color(0.85f, 0.85f, 0.85f, 0.6f);
            img.raycastTarget = false;
            var n = Hud.Label(slot, PackName(kind).ToUpperInvariant(), 13, Look.Ink, true, 500, 18, TextAlignmentOptions.Top);
            n.margin = new Vector4(-20, ph + 8, -20, 0);
            var price = Hud.Label(slot, $"✦ {Progression.BoosterPrice}", 13, new Color(0.725f, 0.522f, 0.165f), true, 500, 0, TextAlignmentOptions.Top);
            price.margin = new Vector4(0, ph + 30, 0, 0);
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
        const float cw = 170, ch = 238, gap = 14;
        var reveal = root.gameObject.AddComponent<BoosterReveal>();
        for (int i = 0; i < opened.Count; i++)
        {
            var c = opened[i];
            var slot = Hud.Rect(root, c.Id);
            Hud.At(slot, new Vector2(0.5f, 0.5f), new Vector2((i - (opened.Count - 1) / 2f) * (cw + gap), 10), new Vector2(cw, ch + 34));
            var face = Hud.Rect(slot, "Face");
            Hud.At(face, new Vector2(0.5f, 1), Vector2.zero, new Vector2(cw, ch));
            var raw = face.gameObject.AddComponent<RawImage>();
            raw.texture = Faces.Of(c.Id, false);
            raw.raycastTarget = false;
            bool isNew = c.IsNew == true;
            var tag = c.Flux != null ? $"SPARE · +⟁{c.Flux}" : isNew ? "NEW" : "ANOTHER COPY";
            var colour = c.Flux != null ? new Color(0.427f, 0.435f, 0.816f) : isNew ? Look.Good : Look.InkSoft;
            var t = Hud.Label(slot, tag, 12, colour, true, isNew ? 700 : 500, 14, TextAlignmentOptions.Bottom);
            t.margin = new Vector4(-10, 0, -10, 4);
            reveal.Shown.Add(slot.gameObject.AddComponent<CanvasGroup>());
        }
        // The wrapper, over the cards, falling away.
        var pack = Hud.Rect(root, "Wrapper");
        Hud.At(pack, new Vector2(0.5f, 0.5f), new Vector2(5, 120), new Vector2(190, 276));
        var img = pack.gameObject.AddComponent<RawImage>();
        img.texture = PackFace(openedKind);
        img.raycastTarget = false;
        reveal.Pack = pack.gameObject.AddComponent<CanvasGroup>();
        reveal.Begin();

        var what = Hud.Label(root, $"{PackName(openedKind)} booster", 17, Look.InkSoft, false, 400, 0, TextAlignmentOptions.BottomLeft);
        what.margin = new Vector4(250, 0, 0, 52);
        var done = Hud.Pill(root, "Done", () => { opened = null; Draw(); }, 17, Look.Ink, Color.white);
        Hud.At((RectTransform)done.transform, new Vector2(1, 0), new Vector2(-250, 36), new Vector2(190, 58));
    }
}

/// <summary>A booster's reveal (styles.css pack-drop, booster-reveal): the wrapper drops and fades, then the cards rise in one by one.</summary>
public class BoosterReveal : MonoBehaviour
{
    public readonly List<CanvasGroup> Shown = new List<CanvasGroup>();
    public CanvasGroup Pack;
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
            r.anchoredPosition = packAt + new Vector2(0, -166 * k);
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
