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

    // ---- The packs: rows of the wrappers, each its name and price ----

    void Packs()
    {
        // (The web's: its label 13 spaced 0.3em at 103 down; the slots 191.4 by 361.6, 41.6 apart, six to a row, each
        // row centred, from 143.4 down; under each wrapper its name, 15.3 bold, and its price.)
        Hud.Text(root, $"BOOSTERS · ✦ {Progression.BoosterPrice} EACH", 0, 103.4f, 1600, 16, 13, Look.InkSoft, true, 400, 30);
        bool afford = Profile.Me.Stardust >= Progression.BoosterPrice;
        const float sw = 191.4f, sh = 361.6f, gap = 41.6f;
        var kinds = Progression.Boosters;
        for (int i = 0; i < kinds.Count; i++)
        {
            int row = i / 6, col = i % 6, inRow = Mathf.Min(6, kinds.Count - row * 6);
            int? kind = kinds[i];
            var slot = Hud.Rect(root, $"Pack {PackName(kind)}");
            Hud.Place(slot, 800 - (inRow * sw + (inRow - 1) * gap) / 2 + col * (sw + gap), 143.4f + row * (sh + gap), sw, sh);
            var hit = slot.gameObject.AddComponent<Image>();
            hit.color = new Color(1, 1, 1, 0.001f);
            var b = slot.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            b.interactable = afford;
            b.onClick.AddListener(() => Buy(kind));
            // (The baked wrapper, turned and with its shadow, has room round it: 34.8 left and above.)
            var face = Hud.Rect(slot, "Wrapper");
            Hud.Place(face, -34.8f, -34.8f, 275.5f, 400.2f);
            var img = face.gameObject.AddComponent<RawImage>();
            img.texture = PackFace(kind);
            // (Too dear: greyed and faded, as the web's.)
            img.color = afford ? Color.white : new Color(0.8f, 0.8f, 0.8f, 0.6f);
            img.raycastTarget = false;
            Hud.Text(slot, PackName(kind).ToUpperInvariant(), -20, 314.9f, sw + 40, 19, 15.3f, Look.Ink, true, 700, 18);
            Hud.Text(slot, $"✦ {Progression.BoosterPrice}", 0, 342.6f, sw, 19, 15.3f, Hud.Rgba(185, 133, 42), true, 400, 0);
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
        // (The web's .booster-cards: faces 208 by 291.2, 17.4 apart, centred on the page, their words 13.9 under
        // them; the wrapper over them, 14.5 below their top.)
        const float cw = 208, ch = 291.2f, gap = 17.4f, top = 343;
        var reveal = root.gameObject.AddComponent<BoosterReveal>();
        float x0 = 800 - (opened.Count * cw + (opened.Count - 1) * gap) / 2;
        for (int i = 0; i < opened.Count; i++)
        {
            var c = opened[i];
            var slot = Hud.Rect(root, c.Id);
            Hud.Place(slot, x0 + i * (cw + gap), top, cw, ch + 8.7f + 17);
            var face = Hud.Rect(slot, "Face");
            Hud.At(face, new Vector2(0.5f, 1), Vector2.zero, new Vector2(cw, ch));
            var raw = face.gameObject.AddComponent<RawImage>();
            raw.texture = Faces.Of(c.Id, false);
            raw.raycastTarget = false;
            bool isNew = c.IsNew == true;
            var tag = c.Flux != null ? $"SPARE · +⟁{c.Flux}" : isNew ? "NEW" : "ANOTHER COPY";
            var colour = c.Flux != null ? Hud.Rgba(109, 111, 208) : isNew ? Look.Good : Look.InkSoft;
            Hud.Text(slot, tag, -10, ch + 8.7f, cw + 20, 17, 13.9f, colour, true, isNew ? 700 : 400, 14);
            reveal.Shown.Add(slot.gameObject.AddComponent<CanvasGroup>());
        }
        // The wrapper, over the cards, falling away.
        var pack = Hud.Rect(root, "Wrapper");
        Hud.Place(pack, 800 - 95.7f - 34.8f, top + 14.5f - 34.8f, 275.5f, 400.2f);
        var img = pack.gameObject.AddComponent<RawImage>();
        img.texture = PackFace(openedKind);
        img.raycastTarget = false;
        reveal.Pack = pack.gameObject.AddComponent<CanvasGroup>();
        reveal.Begin();

        // The foot (the web's .setup-foot): what was opened, quiet, on the left; done, the primary button, on the right.
        Hud.Text(root, $"{PackName(openedKind)} booster", 26.1f, 924.7f, 600, 23, 18.6f, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Left);
        var done = Hud.Primary(root, "Done", () => { opened = null; Draw(); }, 15.3f, 24);
        Hud.Place((RectTransform)done.transform, 1341.9f, 909.7f, 232, 52.9f);
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
            r.anchoredPosition = packAt + new Vector2(0, -186 * k);
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
            if (r.childCount > 0) ((RectTransform)r.GetChild(0)).anchoredPosition = new Vector2(0, 58 * (1 - e));
        }
        if (t > 2.5f) enabled = false;
    }
}
