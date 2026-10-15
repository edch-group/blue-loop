using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// The stage (app.ts Stage, renderStage, styles.css .stage): what the rival just played, shown large at the middle
/// right, waiting for your OK before it lands (or, as the pill at the bottom left is set, a moment and then by itself);
/// your own card hanging there a moment before it lands; a trap sprung or a card played at lightspeed in reply, with
/// the card it answered; the card picked from your hand while you choose where it goes. A card aimed at a card of
/// yours (heat, or a removal) points at it, a beam from the stage, while it waits.
/// </summary>
public partial class BattleView
{
    class StageInfo
    {
        public string DefId, ActorId, Caption, Option, Against, Target, Uid;
        public bool FaceDown, Confirm, Own;
        public float Shown, Until = -1;
    }

    const float AutoConfirm = 2f, OwnHold = 1.1f;

    StageInfo stage;
    /// <summary>A move held back until its card has been read (then it lands).</summary>
    System.Action landing;
    float landingSince;
    /// <summary>The pill: "normal" (each rival card waits for your OK), "auto" (a moment, then by itself), "skip" (that, and your replies let pass).</summary>
    string confirmMode = "normal";
    bool AutoConfirms => confirmMode != "normal";
    RectTransform stagePane;
    Beam stageAim;
    string stageKey;

    /// <summary>
    /// A move made (app.ts dispatch): played, and shown on the stage as the web shows it before it lands; a rival's card
    /// waits there to be read, your own hangs a moment.
    /// </summary>
    void Commit(EngineAction a)
    {
        if (landing != null) FlushLanding();
        var prev = state;
        var actor = Game.ActivePlayer(prev);
        var next = Game.Apply(prev, a);
        stage = next.Reaction != null ? null : actor.IsAI ? StageFor(actor, a) : OwnStage(actor, a);
        // (With someone watching, an AI's card waits on the stage until they have read it.)
        if (stage != null && !stage.Own && !Autoplay && next.WinnerId == null && next.Players.Any(p => !p.IsAI)) stage.Confirm = true;
        var sprung = Sprung(next);
        if (sprung != null) stage = sprung;
        if (stage != null) stage.Shown = Time.time;
        bool turnPassed = Game.ActivePlayer(prev).Id != Game.ActivePlayer(next).Id;
        void Land()
        {
            if (stage != null && stage.Own) stage = null;
            state = next;
            StarSpin.Burst();
            Hear(prev, next, a);
            // (Skip all lasts the rival's day: as yours begins, it is back to auto.)
            if (turnPassed && confirmMode == "skip" && Game.ActivePlayer(next).Id == you) confirmMode = "auto";
            Refresh();
        }
        if (stage != null && stage.Confirm)
        {
            landing = Land;
            Sound.Play("play");
            Refresh();
            return;
        }
        if (stage != null && stage.Own && !Autoplay)
        {
            landing = Land;
            landingSince = Time.time;
            Refresh();
            return;
        }
        Land();
    }

    void FlushLanding()
    {
        var land = landing;
        landing = null;
        land?.Invoke();
    }

    /// <summary>The viewer has read the rival's card: it goes, and the rival carries on.</summary>
    void ConfirmStage()
    {
        if (stage == null || !stage.Confirm) return;
        stage = null;
        Sound.Play("click");
        aiAfter = Time.time + 0.45f;
        if (landing != null) FlushLanding();
        else Refresh();
    }

    /// <summary>The stage's clock: auto-confirming, your own card's hold, a sprung card's moment.</summary>
    void StageTick()
    {
        if (stage == null) return;
        if (stage.Confirm && (AutoConfirms || stage.FaceDown) && Time.time - stage.Shown > (stage.FaceDown ? 1.1f : AutoConfirm)) ConfirmStage();
        else if (stage.Own && landing != null && Time.time - landingSince > OwnHold) FlushLanding();
        else if (stage.Until > 0 && Time.time > stage.Until) { stage = null; Refresh(); }
    }

    float aiAfter;
    /// <summary>Whether the AI may move now (nothing waiting on the stage to be read).</summary>
    bool StageClear => landing == null && (stage == null || !stage.Confirm) && Time.time >= aiAfter;

    StageInfo StageFor(PlayerState actor, EngineAction a)
    {
        if (a.Type != "playCard") return null;
        var card = actor.Hand.FirstOrDefault(c => c.Uid == a.CardUid);
        if (card == null) return null;
        if (Cards.Def(card.DefId).Kind == "trap" || a.FaceDown == true) return new StageInfo { DefId = card.DefId, ActorId = actor.Id, FaceDown = true, Caption = $"{actor.Name.ToLowerInvariant()} sets a card face down" };
        return new StageInfo { DefId = card.DefId, ActorId = actor.Id, Option = a.Choice, Target = a.EnemyUid ?? a.AimUid };
    }

    StageInfo OwnStage(PlayerState actor, EngineAction a)
    {
        if (a.Type != "playCard") return null;
        var card = actor.Hand.FirstOrDefault(c => c.Uid == a.CardUid);
        if (card == null) return null;
        bool faceDown = a.FaceDown == true || Cards.Def(card.DefId).Kind == "trap";
        return new StageInfo { DefId = card.DefId, Uid = card.Uid, ActorId = actor.Id, Own = true, Caption = faceDown ? "you set it face down" : "you play", Option = a.Choice, Target = a.EnemyUid ?? a.AimUid };
    }

    /// <summary>A trap that just sprang (or a Lightspeed card played in reply), announced for everyone, a few seconds.</summary>
    StageInfo Sprung(GameState next)
    {
        var why = next.Sprung?.LastOrDefault();
        var now = why != null ? next.Players.FirstOrDefault(p => p.Id == why.OwnerId) : null;
        if (why == null || now == null) return null;
        Sound.Play("flare");
        bool trap = !Game.IsLightspeed(why.DefId);
        return new StageInfo
        {
            DefId = why.DefId, ActorId = now.Id, Against = why.Against,
            Caption = trap ? "trap triggered!" : $"⚡ {now.Name.ToLowerInvariant()} replies",
            Until = Time.time + (why.Against != null ? 5f : 3.5f),
        };
    }

    // ---- Drawn (renderStage) ----

    static Texture2D stageGlow;

    /// <summary>
    /// .stage::before: a white glow behind it, 50 px above and below, 110 either side (radial-gradient(ellipse,
    /// rgba(255,255,255,.94), rgba(255,255,255,.6) 45%, transparent 70%), reaching to its corners).
    /// </summary>
    static Texture2D StageGlow()
    {
        if (stageGlow != null) return stageGlow;
        const int n = 128;
        stageGlow = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
        var px = new Color32[n * n];
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float u = (x + 0.5f) / n * 2 - 1, v = (y + 0.5f) / n * 2 - 1;
                float d = Mathf.Sqrt(u * u + v * v) / Mathf.Sqrt(2);
                float a = d <= 0.45f ? Mathf.Lerp(0.94f, 0.6f, d / 0.45f) : d <= 0.7f ? Mathf.Lerp(0.6f, 0, (d - 0.45f) / 0.25f) : 0;
                px[y * n + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(a * 255));
            }
        stageGlow.SetPixels32(px);
        stageGlow.Apply();
        return stageGlow;
    }

    /// <summary>What the stage shows now: the move waiting, or the card picked from your hand.</summary>
    (string defId, string caption, bool faceDown, bool ok, bool sprung, bool trap, string against) StageNow()
    {
        if (state == null || state.WinnerId != null) return (null, null, false, false, false, false, null);
        if (stage == null)
        {
            // A card picked from your hand: it waits here while you choose where it goes and what it does.
            var held = picked != null ? Me.Hand.FirstOrDefault(c => c.Uid == picked) : null;
            return held != null ? (held.DefId, null, false, false, false, false, null) : (null, null, false, false, false, false, null);
        }
        bool trapped = !Game.IsLightspeed(stage.DefId);
        bool sprungNow = stage.Caption != null && !stage.FaceDown && stage.Own == false && stage.Until > 0;
        return (stage.DefId, stage.Caption, stage.FaceDown, stage.Confirm && !stage.FaceDown, sprungNow, sprungNow && trapped, stage.Against);
    }

    /// <summary>The stage laid out again for what it shows (only when that changes: it fades in and its card flies in as the web's).</summary>
    void DrawStage()
    {
        if (hud == null) return;
        var now = StageNow();
        var heroOpen = heroPanel != null && heroPanel.gameObject.activeSelf;
        string key = now.defId == null || heroOpen ? null : $"{now.defId}|{now.caption}|{now.faceDown}|{now.ok}|{now.against}|{stage?.Shown}|{BoardLayout.Current.W}x{BoardLayout.Current.H}";
        if (key == stageKey) return;
        stageKey = key;
        if (stagePane != null) Destroy(stagePane.gameObject);
        stagePane = null;
        if (stageAim != null) Destroy(stageAim.gameObject);
        stageAim = null;
        if (key == null) return;
        var l = BoardLayout.Current;
        // (--scw: min(250px, 50vh); against the right edge, 16 px in from the page's padding, its middle the page's.)
        float scw = Mathf.Min(250, 50 * l.Vh), ch = scw * 1.4f;
        bool caption = now.caption != null && now.caption != "you play";
        float capH = caption ? 8.96f * 1.25f + 10 + 2 : 0, okH = now.ok ? 10.56f * 1.25f + 16 + 2 : 0;
        float pairW = now.against != null ? scw * 2 + 8 : scw;
        float h = ch + (caption ? 8 + capH : 0) + (now.ok ? 8 + 2 + okH : 0);
        float right = l.W - (l.PadR + 16), top = l.H / 2 - h / 2;
        stagePane = Hud.Rect(hud.transform, "Stage");
        Hud.Place(stagePane, right - pairW, top, pairW, h);
        stagePane.SetSiblingIndex(beamLayer.GetSiblingIndex() + 1);
        var fade = stagePane.gameObject.AddComponent<CanvasGroup>();
        fade.blocksRaycasts = now.ok;
        stagePane.gameObject.AddComponent<RiseFade>().Seconds = 0.25f;
        var glow = Hud.Rect(stagePane, "Glow");
        Hud.Fill(glow);
        glow.offsetMin = new Vector2(-110, -50);
        glow.offsetMax = new Vector2(110, 50);
        var gi = glow.gameObject.AddComponent<RawImage>();
        gi.texture = StageGlow();
        gi.raycastTarget = false;
        // The card (and, a sprung card, the one it answered beside it on the right, the answer on the left).
        RawImage Card(string defId, float x, bool back)
        {
            var r = Hud.Rect(stagePane, "Card");
            Hud.Place(r, x, 0, scw, ch);
            var img = r.gameObject.AddComponent<RawImage>();
            img.texture = back ? Resources.Load<Texture2D>("Board/back") : Faces.Of(defId, false);
            img.raycastTarget = false;
            // (0 24px 50px rgba(70,70,90,.28), 0 0 0 2px #fff; a trap sprung glows indigo too.)
            WebLook.Shadow(img, 24, 50, new Color(70 / 255f, 70 / 255f, 90 / 255f, 0.28f), scw * 0.08f, 2, Color.white);
            return img;
        }
        var main = Card(now.defId, 0, now.faceDown);
        if (now.against != null) Card(now.against, scw + 8, false);
        float y = ch;
        if (caption)
        {
            y += 8;
            bool ls = now.sprung;
            var ink = ls ? Hud.Rgba(60, 63, 143) : Look.Ink;
            string text = now.against != null && now.trap ? "trap triggered!" : now.caption;
            float tw = Mathf.Min(pairW + 220, Hud.Wide(text.ToUpperInvariant(), 8.96f, now.trap ? 600 : 500, 18, 14, false) + 2);
            var cap = Hud.Box(stagePane, "Caption", new Color(1, 1, 1, 0.9f), 8);
            var cr = (RectTransform)cap.transform;
            Hud.Place(cr, (pairW - tw) / 2, y, tw, capH);
            WebLook.Shadow(cap, 2, 10, ls ? new Color(75 / 255f, 79 / 255f, 176 / 255f, 0.4f) : new Color(90 / 255f, 90 / 255f, 110 / 255f, 0.12f), 8, 1, ls ? new Color(75 / 255f, 79 / 255f, 176 / 255f, 0.6f) : Color.white);
            Hud.Label(cap.transform, text.ToUpperInvariant(), 8.96f, ink, false, now.trap ? 600 : 500, 18);
            y += capH;
        }
        if (now.ok)
        {
            y += 8 + 2;
            // (.btn.stage-ok: dark, white words, 8 x 26 px padded, rounded 10.)
            float bw = Hud.Wide("OK", 10.56f, 600, 14, 26, false) + 2;
            var ok = Hud.Box(stagePane, "OK", Hud.Rgba(47, 58, 82), 10);
            Hud.Place((RectTransform)ok.transform, (pairW - bw) / 2, y, bw, okH);
            WebLook.Shadow(ok, 6, 18, new Color(30 / 255f, 40 / 255f, 60 / 255f, 0.35f), 10, 1, Hud.Rgba(47, 58, 82));
            Hud.Label(ok.transform, "OK", 10.56f, Color.white, false, 600, 14);
            var b = ok.gameObject.AddComponent<Button>();
            b.onClick.AddListener(ConfirmStage);
        }
        // A rival's card waiting: it flies in from the middle of their row, at a card's size, sweeping up and over.
        if (stage != null && stage.Confirm)
        {
            var row = RowRect(stage.ActorId);
            if (row != null)
            {
                var fly = main.gameObject.AddComponent<FlyIn>();
                float w = Mathf.Min(row.Value.height / 1.4f, scw);
                var to = new Rect(right - pairW, top, scw, ch);
                fly.From = new Rect(row.Value.center.x - w / 2, row.Value.center.y - w * 0.7f, w, w * 1.4f);
                fly.To = to;
                fly.Arc = Mathf.Min(140, Mathf.Abs(to.y - fly.From.y) * 0.35f + 60);
            }
            // A card aimed at one of yours points at it while it waits (heat red, a removal white), after its flight.
            if (stage.Target != null)
            {
                var def = Cards.Def(stage.DefId);
                bool removal = (def.OnPlay ?? new System.Collections.Generic.List<Effect>()).Any(e => e.Type == "destroy" || e.Type == "bounce");
                stageAim = Beam.Make(beamLayer, removal ? Beam.Kind.Plain : Beam.Kind.Attack);
                var held = stageAim.gameObject.AddComponent<HeldAim>();
                held.View = this;
                held.From = new Rect(right - pairW, top, scw, ch);
                held.Target = stage.Target;
                held.Delay = 0.64f;
            }
        }
    }

    /// <summary>The middle of a player's row of cards on the page (the rival's, as the web's .tableau-row).</summary>
    Rect? RowRect(string playerId)
    {
        bool mine = playerId == you;
        var a = Cam.WorldToScreenPoint(Board.SlotAt(mine, 0));
        var b = Cam.WorldToScreenPoint(Board.SlotAt(mine, 4));
        var pa = Page(a);
        var pb = Page(b);
        // (A slot's height on the page: its two ends' projections a card's height apart.)
        var up = Page(Cam.WorldToScreenPoint(Board.SlotAt(mine, 2) + new Vector3(0, 0, 0.7f)));
        var down = Page(Cam.WorldToScreenPoint(Board.SlotAt(mine, 2) - new Vector3(0, 0, 0.7f)));
        float hgt = Mathf.Abs(down.y - up.y);
        if (hgt <= 0) return null;
        float x0 = Mathf.Min(pa.x, pb.x), x1 = Mathf.Max(pa.x, pb.x);
        return new Rect(x0, (pa.y + pb.y) / 2 - hgt / 2, x1 - x0, hgt);
    }

    /// <summary>Whether a card of your hand is on the stage instead (picked, or just played and hanging there).</summary>
    public bool OffHand(string uid) => uid == picked || (stage != null && stage.Own && stage.Uid == uid);

    /// <summary>The pill's mode chosen (app.ts setConfirmMode): a card waiting now goes, skipping lets a reply waiting pass.</summary>
    void SetConfirmMode(string mode)
    {
        confirmMode = mode;
        Sound.Play("hover");
        if (AutoConfirms && stage != null && stage.Confirm) ConfirmStage();
        Refresh();
    }

    /// <summary>A held aim (fx.ts aim): drawn out over 0.42 s after its delay, following the target as the board moves.</summary>
    class HeldAim : MonoBehaviour
    {
        public BattleView View;
        public Rect From;
        public string Target;
        public float Delay;
        float t0 = -1;
        Beam beam;

        void Start()
        {
            beam = GetComponent<Beam>();
            t0 = Time.time + Delay;
            beam.Hide();
        }

        void Update()
        {
            if (Time.time < t0) return;
            var to = View.CardRect(Target);
            if (to == null) { beam.Hide(); return; }
            float k = Mathf.Min(1, (Time.time - t0) / 0.42f);
            beam.Draw(From, to.Value, 1 - Mathf.Pow(1 - k, 3));
        }
    }

    /// <summary>fx.ts flyFrom with an arc: from a rectangle along a curve bowed upwards, eased out, fading in, scaling up (0.64 s).</summary>
    class FlyIn : MonoBehaviour
    {
        public Rect From, To;
        public float Arc, Seconds = 0.64f;
        float t0;
        RectTransform r;
        Vector2 home;
        Graphic g;

        void Start()
        {
            t0 = Time.time;
            r = (RectTransform)transform;
            home = r.anchoredPosition;
            g = GetComponent<Graphic>();
            Step();
        }

        void Update() => Step();

        void Step()
        {
            float p = Mathf.Clamp01((Time.time - t0) / Seconds);
            float t = 1 - Mathf.Pow(1 - p, 3), u = 1 - t;
            float dx = From.center.x - To.center.x, dy = From.center.y - To.center.y;
            float cx = dx / 2, cy = dy / 2 - Arc;
            float x = u * u * dx + 2 * u * t * cx, y = u * u * dy + 2 * u * t * cy;
            float s = Mathf.Min(From.width / To.width, From.height / To.height);
            r.anchoredPosition = home + new Vector2(x, -y);
            r.localScale = Vector3.one * (s + (1 - s) * t);
            if (g != null) { var c = g.color; c.a = Mathf.Min(1, t * 2.5f); g.color = c; }
            if (p >= 1) Destroy(this);
        }
    }

    /// <summary>@keyframes stage-in: fades in where it stands.</summary>
    class RiseFade : MonoBehaviour
    {
        public float Seconds = 0.25f;
        float t0;
        CanvasGroup g;
        void Start() { t0 = Time.time; g = GetComponent<CanvasGroup>(); Update(); }
        void Update()
        {
            float k = Mathf.Clamp01((Time.time - t0) / Seconds);
            g.alpha = 1 - (1 - k) * (1 - k);
            if (k >= 1) Destroy(this);
        }
    }
}
