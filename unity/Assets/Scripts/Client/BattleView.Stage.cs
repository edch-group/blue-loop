using System.Collections.Generic;
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
    /// <summary>Where the stage's card stands on the page.</summary>
    Rect? stageCardRect;
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
        NoteMove(prev, a);
        stage = next.Reaction != null ? null : actor.IsAI ? StageFor(actor, a) : OwnStage(actor, a);
        // (With someone watching, an AI's card waits on the stage until they have read it.)
        if (stage != null && !stage.Own && !Autoplay && next.WinnerId == null && next.Players.Any(p => !p.IsAI)) stage.Confirm = true;
        var sprung = Sprung(next);
        if (sprung != null) stage = sprung;
        if (stage != null) stage.Shown = Time.time;
        bool turnPassed = Game.ActivePlayer(prev).Id != Game.ActivePlayer(next).Id;
        void Land()
        {
            // (Your own card leaves the stage for the board: from where it hung there.)
            if (stage != null && stage.Own && stage.Uid != null && stageCardRect != null) Board.PutAtPage(stage.Uid, stageCardRect.Value);
            if (stage != null && stage.Own) stage = null;
            state = next;
            // An AI's attacks bring its target's tableau onto the table (app.ts land).
            if (actor.IsAI && a.Type == "setTarget" && a.TargetId != you) viewRivalId = a.TargetId;
            // (The view follows the human whose day it is now: BattleView.Seats.)
            SyncViewer();
            StarSpin.Burst();
            if (next.WinnerId != null && prev.WinnerId == null && Application.isPlaying && !Autoplay) HoldResult(next, a);
            // A day's start replays its effects one by one (app.ts replayPulses), on the day's timeline (dayTimeline).
            var day = turnPassed && Application.isPlaying && !Autoplay ? DayTimeline(next, actor) : ((float?)null, (float?)0f, 0f, new List<float>());
            replaying = Application.isPlaying && !Autoplay && Replays(next, a);
            Hear(prev, next, a);
            Arcs(prev, next, a, actor);
            // (Skip all lasts the rival's day: as yours begins, it is back to auto.)
            if (turnPassed && confirmMode == "skip" && Game.ActivePlayer(next).Id == you) confirmMode = "auto";
            float replayEnd = replaying ? ReplayPulses(prev, next, day.Item4) : 0;
            // Cards that faded at dawn stay in their slots while the day's effects play out, then go, one at a time.
            if (a.Type == "endTurn")
            {
                int faded = 0;
                var nowIn = new HashSet<string>(next.Players.SelectMany(p => p.Tableau).Select(c => c.Uid));
                foreach (var c in prev.Players.SelectMany(p => p.Tableau))
                    if (!nowIn.Contains(c.Uid)) Board?.LeaveAfter(c.Uid, (replayEnd > 0 ? replayEnd : 0.2f) + faded++ * 0.11f);
            }
            // (A new day isn't under way until its dawn has played out.)
            if (turnPassed) Phase = "dawn";
            Refresh();
            // (No dawn replayed effect by effect: the new player's dawn cards light up, oldest first, as they trigger:
            // app.ts animate's endTurn, pulse fx-trigger at 220 + 90 ms each, in their tableau's order, its Hero last.)
            if (a.Type == "endTurn" && replayEnd <= 0 && Application.isPlaying && !Autoplay)
            {
                int k = 0;
                var source = Game.ActivePlayer(next);
                foreach (var c in source.Tableau.OrderBy(c => c.Slot == Game.CommandSlot ? 1 : 0).ThenBy(c => c.Slot ?? 0))
                {
                    var def = Cards.Def(c.DefId);
                    if (def.OnTurn == null || def.OnTurn.Count == 0) continue;
                    Board?.View(c.Uid)?.Trigger(Look.Kind.TryGetValue(BuilderView.ShownKind(def), out var kc) ? kc : Look.Ink, 0.22f + 0.09f * k++);
                }
            }
            replaying = false;
            // (The dusk ticking in, the next day's dawn: its banner when the timeline brings it, after the dusk's
            // effects, and the day once they are over: app.ts announcePhases.)
            if (turnPassed) AnnouncePhases(next, day);
            // (Until the day's banner and its effects are over, it is still dawn: no cards but Lightspeed ones count as playable.)
            if (turnPassed) dayFrom = Time.time + day.Item3 + (day.Item2 != null ? BannerShown : 0);
            // The AI waits for the day's banner to have come and gone (after its dusk and dawn have played out) before it
            // acts; otherwise a pause for the kind of move just made.
            ScheduleAI(turnPassed ? Mathf.Max(AiPause("endTurn"), (day.Item3 + BannerShown + 0.3f) / SpeedK) : AiPause(a.Type));
        }
        if (stage != null && stage.Confirm)
        {
            landing = Land;
            // (A rival's card arriving on the stage to be read sounds as it comes: app.ts stageEntrance.)
            Sound.Play("play");
            entranceHeard = true;
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
        // An attack lands the moment the attacker strikes (app.ts lunge, landAtStrike).
        if (a.Type == "attack" && next.Reaction == null && StrikeFor(prev, a))
        {
            landing = Land;
            strikeLand = Time.time + CardView.StrikeTime * CardView.StrikeHit;
            return;
        }
        Land();
    }

    /// <summary>The card landing has sounded already, as it came onto the stage (app.ts entranceHeard).</summary>
    bool entranceHeard;

    float strikeLand;
    string struckBy;

    /// <summary>
    /// app.ts lunge: the attacker lifts off the table, tilts back and smashes into the card it attacks (or its rival's
    /// sun), then settles back; false when there is nothing to animate.
    /// </summary>
    bool StrikeFor(GameState prev, EngineAction a)
    {
        if (!Application.isPlaying || Autoplay || Board == null) return false;
        var view = Board.View(a.AttackerUid);
        if (view == null) return false;
        var owner = prev.Players.FirstOrDefault(p => p.Tableau.Any(c => c.Uid == a.AttackerUid));
        var rival = owner != null ? Game.TargetOf(prev, owner) : null;
        Vector3? to = a.TargetUid != null ? Board.WorldOf(a.TargetUid) : rival != null ? Board.SunOf(rival.Id)?.transform.position : null;
        if (to == null) return false;
        var rect = CardRect(a.AttackerUid);
        float liftPx = Mathf.Max(18, (rect?.height ?? 0) * 0.18f);
        view.Strike(to.Value, Board.Px(liftPx));
        struckBy = a.AttackerUid;
        Sound.Play("swing");
        return true;
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
        // (Taps are ignored for 0.4 s, so a tap on OK can't land on the board beneath it: app.ts clickShieldUntil.)
        clickShieldUntil = Time.time + 0.4f;
        stage = null;
        Sound.Play("click");
        // (Online, the room hears it: the rival carries on.)
        if (online)
        {
            Online.Ack();
            OnlineChanged();
        }
        // Now the card takes effect.
        if (landing != null) FlushLanding();
        else
        {
            Refresh();
            if (!online) ScheduleAI(0.45f);
        }
    }

    /// <summary>The stage's clock: auto-confirming, your own card's hold, a sprung card's moment.</summary>
    void StageTick()
    {
        if (strikeLand > 0 && Time.time >= strikeLand)
        {
            strikeLand = 0;
            if (landing != null) FlushLanding();
        }
        if (stage == null) return;
        if (stage.Confirm && (AutoConfirms || stage.FaceDown) && Time.time - stage.Shown > (stage.FaceDown ? 1.1f : AutoConfirm)) ConfirmStage();
        // (Online, your own card hangs there until your rival has read it: app.ts holdOwn.)
        else if (stage.Own && landing != null && Time.time - landingSince > OwnHold && !(online && Online.WaitFor == "rival")) FlushLanding();
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
        // (While an answer is being chosen, the pane is the answer's.)
        var r = state?.Reaction;
        if (r != null && Answering(r) && !Autoplay && state.WinnerId == null)
        {
            DrawReact(r);
            return;
        }
        var now = StageNow();
        var heroOpen = heroPanel != null && heroPanel.gameObject.activeSelf;
        // (The card picked, while its place is chosen, and it can be set face down: "set as trap" under it.)
        bool asTrap = stage == null && now.defId != null && TrapChoosable;
        string key = now.defId == null || heroOpen ? null : $"{now.defId}|{now.caption}|{now.faceDown}|{now.ok}|{now.against}|{stage?.Shown}|{asTrap}|{BoardLayout.Current.W}x{BoardLayout.Current.H}";
        if (key == stageKey) return;
        stageKey = key;
        if (stagePane != null) Destroy(stagePane.gameObject);
        stagePane = null;
        if (stageAim != null) Destroy(stageAim.gameObject);
        stageAim = null;
        if (key == null) return;
        var l = BoardLayout.Current;
        // (--scw: min(250px, 50vh); against the right edge, 16 px in from the page's padding, its middle the page's.)
        // (.stage-picked:has(.stage-ls-btn): the card gives up a little height so the choice fits under it, 6 apart.)
        float scw = Mathf.Min(250, (asTrap ? 44 : 50) * l.Vh), ch = scw * 1.4f;
        bool caption = now.caption != null && now.caption != "you play";
        float lsSize = 9.92f, lsH = lsSize * 1.25f + 14 + 2;
        float capH = caption ? 8.96f * 1.25f + 10 + 2 : 0, okH = now.ok ? 10.56f * 1.25f + 16 + 2 : 0;
        // A sprung trap, or a Lightspeed card played in reply, with the card that set it off (.stage-pair): that card is
        // the stage's own, plain, to be read; the answer the same size 18 px to its left (.stage-ls), a Lightspeed one
        // under an amber "⚡ lightspeed" tag 26 px above it. Played in reply with nothing to show beside it: the tag over
        // the card, in its column (.stage-ls-tag-solo, 2 px into the gap under it).
        bool pair = now.against != null, trapped = !Game.IsLightspeed(now.defId);
        bool soloTag = !pair && !now.faceDown && now.caption != null && now.caption.StartsWith("⚡") && !trapped;
        float tagH = 8 * 1.25f + 6 + 2, cardY = soloTag ? tagH - 2 + 8 : 0;
        float pairW = pair ? scw * 2 + 18 : scw;
        float h = cardY + ch + (caption ? 8 + capH : 0) + (now.ok ? 8 + 2 + okH : 0) + (asTrap ? 6 + lsH : 0);
        float right = l.W - (l.PadR + 16), top = l.H / 2 - h / 2;
        stagePane = Hud.Rect(hud.transform, "Stage");
        Hud.Place(stagePane, right - pairW, top, pairW, h);
        stagePane.SetSiblingIndex(beamLayer.GetSiblingIndex() + 1);
        var fade = stagePane.gameObject.AddComponent<CanvasGroup>();
        fade.blocksRaycasts = now.ok || asTrap;
        stagePane.gameObject.AddComponent<RiseFade>().Seconds = 0.25f;
        var glow = Hud.Rect(stagePane, "Glow");
        Hud.Fill(glow);
        glow.offsetMin = new Vector2(-110, -50);
        glow.offsetMax = new Vector2(110, 50);
        var gi = glow.gameObject.AddComponent<RawImage>();
        gi.texture = StageGlow();
        gi.raycastTarget = false;
        // The card (and, a sprung card, the one it answered beside it on the right, the answer on the left).
        RawImage Card(string defId, float x, bool back, Color? glow)
        {
            var r = Hud.Rect(stagePane, "Card");
            Hud.Place(r, x, cardY, scw, ch);
            var img = r.gameObject.AddComponent<RawImage>();
            img.texture = back ? Resources.Load<Texture2D>("Board/back") : Faces.Of(defId, Faces.Look.Card, scw);
            img.raycastTarget = false;
            // (0 24px 50px rgba(70,70,90,.28), 0 0 0 2px #fff; sprung, a glow too: 0 0 30px.)
            if (glow != null) WebLook.Shadow(img, 0, 30, glow.Value, scw * 0.08f);
            WebLook.Shadow(img, 24, 50, new Color(70 / 255f, 70 / 255f, 90 / 255f, 0.28f), scw * 0.08f, 2, Color.white);
            if (!back) Printed(r, defId, scw, true);
            return img;
        }
        // (.stage-sprung .card: indigo, rgba(75,79,176,.6); in a pair, .stage-ls .card amber, rgba(212,149,42,.6), a
        // trap's indigo (.stage-trap .stage-ls .card); the card that set it off none, .stage-pair .card.)
        Color indigo = new Color(75 / 255f, 79 / 255f, 176 / 255f, 0.6f), amber = new Color(212 / 255f, 149 / 255f, 42 / 255f, 0.6f);
        bool sprung = pair || now.caption != null && !now.faceDown;
        var main = Card(now.defId, 0, now.faceDown, pair ? (trapped ? indigo : amber) : sprung ? indigo : (Color?)null);
        stageCardRect = new Rect(right - pairW, top + cardY, scw, ch);
        if (pair) Card(now.against, scw + 18, false, null);
        // (.stage-ls-tag: amber #d4952a, white, a 1 px #c4851c edge, 0 4px 12px rgba(170,110,20,.35); 0.5rem spaced 0.16em.)
        if (pair && !trapped || soloTag)
        {
            float tw = Hud.Wide("⚡ LIGHTSPEED", 8, 600, 16, 10, true) + 2;
            var tagBox = Hud.Box(stagePane, "Lightspeed tag", Hud.Rgba(212, 149, 42), 8);
            Hud.Place((RectTransform)tagBox.transform, (scw - tw) / 2, pair ? -26 : 0, tw, tagH);
            WebLook.Shadow(tagBox, 4, 12, new Color(170 / 255f, 110 / 255f, 20 / 255f, 0.35f), 8, 1, Hud.Rgba(196, 133, 28));
            Hud.Label(tagBox.transform, "⚡ LIGHTSPEED", 8, Color.white, true, 600, 16);
        }
        float y = cardY + ch;
        if (caption)
        {
            y += 8;
            bool ls = sprung;
            var ink = ls ? Hud.Rgba(60, 63, 143) : Look.Ink;
            // (A pair's caption, under the card that set it off: a trap says only that it was triggered; a Lightspeed card
            // who played it, and against what.)
            string text = now.caption;
            if (pair)
            {
                var actor = state.Players.FirstOrDefault(p => p.Id == stage?.ActorId);
                var trigger = state.Sprung?.FirstOrDefault(x => x.OwnerId == stage?.ActorId)?.Trigger ?? "enemyPlays";
                string how = trigger == "sunAttacked" || trigger == "cardAttacked" ? "against its attack" : trigger == "targeted" ? "against this" : "in answer to this";
                text = trapped ? "trap triggered!" : $"{(actor?.Name ?? "").ToLowerInvariant()} plays {Cards.Def(now.defId).Name.ToLowerInvariant()} {how}";
            }
            // (.stage-trap .stage-caption: bolder.)
            bool bold = pair ? trapped : now.caption == "trap triggered!";
            float tw = Mathf.Min(pairW + 220, Hud.Wide(text.ToUpperInvariant(), 8.96f, bold ? 600 : 500, 18, 14, false) + 2);
            var cap = Hud.Box(stagePane, "Caption", new Color(1, 1, 1, 0.9f), 8);
            var cr = (RectTransform)cap.transform;
            // (Centred under the stage's own column: in a pair, the card that set it off.)
            Hud.Place(cr, (pair ? scw + 18 + scw / 2 : pairW / 2) - tw / 2, y, tw, capH);
            WebLook.Shadow(cap, 2, 10, ls ? new Color(75 / 255f, 79 / 255f, 176 / 255f, 0.4f) : new Color(90 / 255f, 90 / 255f, 110 / 255f, 0.12f), 8, 1, ls ? new Color(75 / 255f, 79 / 255f, 176 / 255f, 0.6f) : Color.white);
            Hud.Label(cap.transform, text.ToUpperInvariant(), 8.96f, ink, false, bold ? 600 : 500, 18);
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
            ok.raycastTarget = true;
            var b = ok.gameObject.AddComponent<Button>();
            b.onClick.AddListener(ConfirmStage);
        }
        if (asTrap) TrapButton(stagePane, pairW, y + 6, lsSize, lsH);
        // A rival's card waiting: it flies in from the middle of their row, at a card's size, sweeping up and over.
        if (stage != null && stage.Confirm)
        {
            var row = RowRect(stage.ActorId);
            if (row != null)
            {
                var fly = main.gameObject.AddComponent<FlyIn>();
                float w = Mathf.Min(row.Value.height / 1.4f, scw);
                var to = stageCardRect.Value;
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
                held.From = stageCardRect.Value;
                held.Target = stage.Target;
                held.Delay = 0.64f;
            }
        }
        // A card shown there once a move has landed (a trap sprung, a card played at lightspeed in reply): it flies in
        // from its player's sun, fading in (app.ts animate: flyFrom(stageCard, orbRect(actor), fade, 520 ms)).
        else if (stage != null && !stage.Own && !now.faceDown)
        {
            var sun = SunRect(stage.ActorId);
            if (sun != null)
            {
                var fly = main.gameObject.AddComponent<FlyIn>();
                fly.From = sun.Value;
                fly.To = stageCardRect.Value;
                fly.Seconds = 0.52f;
            }
        }
    }

    /// <summary>
    /// A reply window (app.ts renderReaction, .stage.stage-react): in the stage's place, the move it answers as the
    /// pane's card (--scw min(250px, 40vh)) under an amber "⚡ answer?" tag, what it does under it; to its left, 14 px
    /// off, the answers (your face-down card, free; cards in hand your banked energy pays for), each half the pane's
    /// card, and "let it pass".
    /// </summary>
    void DrawReact(Reaction r)
    {
        var who = Player(r.PlayerId);
        var enemy = state.Players.First(p => p.Id == r.EnemyId);
        // (A card not on their side, as a state from the room may have it: no name, rather than an unknown card's throw.)
        string Name(string uid) => who.Tableau.FirstOrDefault(c => c.Uid == uid) is CardInstance c ? Cards.Def(c.DefId).Name ?? "" : "";
        string moveId = null, what;
        if (r.Pending.Kind == "play")
        {
            var ev = r.Events[0];
            var aimed = r.Events.FirstOrDefault(e => e.On == "targeted");
            if (ev.FaceDown == true || ev.DefId == null) what = "a card set face down";
            else
            {
                moveId = ev.DefId;
                what = aimed != null ? $"aimed at {Name(aimed.MineUid)}" : $"{enemy.Name} plays it";
            }
        }
        else
        {
            var atk = enemy.Tableau.FirstOrDefault(c => c.Uid == r.Pending.AttackerUid);
            moveId = atk?.DefId;
            what = $"attacks {(r.Pending.TargetUid != null ? Name(r.Pending.TargetUid) : "your sun")}";
        }
        var opts = new System.Collections.Generic.List<(string defId, string tag, EngineAction act)>();
        if (r.Slot && who.Lightspeed != null) opts.Add((who.Lightspeed.DefId, "face down · free", new EngineAction { Type = "react", Slot = true }));
        foreach (var uid in r.Hand)
        {
            var c = who.Hand.FirstOrDefault(x => x.Uid == uid);
            if (c != null) opts.Add((c.DefId, $"{Game.ReactCost(c.DefId)} banked", new EngineAction { Type = "react", CardUid = uid }));
        }
        var l = BoardLayout.Current;
        string key = $"react|{moveId}|{what}|{string.Join(",", opts.Select(o => o.defId))}|{l.W}x{l.H}";
        if (key == stageKey) return;
        stageKey = key;
        if (stagePane != null) Destroy(stagePane.gameObject);
        if (stageAim != null) Destroy(stageAim.gameObject);
        stageAim = null;
        float scw = Mathf.Min(250, 40 * l.Vh), ch = scw * 1.4f, ow = scw * 0.5f, oh = scw * 0.7f;
        // (The answers' column: each card 4 px padded, its tag 4 under it; 8 between them; the pass button 10 under.)
        float tagH = 8.96f * 1.25f, optH = 4 + oh + 4 + tagH + 4;
        float passW = Hud.Wide("LET IT PASS", 9.92f, 500, 14, 14, false) + 2, passH = 9.92f * 1.25f + 14 + 2;
        float sideW = Mathf.Max(ow + 8, passW), sideH = opts.Count * optH + Mathf.Max(0, opts.Count - 1) * 8 + (opts.Count > 0 ? 10 : 0) + passH;
        float capW = scw, capLine = 8.96f * 1.6f;
        var capT = what.ToUpperInvariant();
        float mainH = ch + 8 + capLine * 2 + 10;
        float w = sideW + 14 + scw, h = Mathf.Max(sideH, mainH);
        float right = l.W - (l.PadR + 16), top = l.H / 2 - h / 2;
        stagePane = Hud.Rect(hud.transform, "Stage (answer)");
        Hud.Place(stagePane, right - w, top, w, h);
        stagePane.SetAsLastSibling();
        stagePane.gameObject.AddComponent<CanvasGroup>();
        stagePane.gameObject.AddComponent<RiseFade>().Seconds = 0.25f;
        var glow = Hud.Rect(stagePane, "Glow");
        Hud.Fill(glow);
        glow.offsetMin = new Vector2(-110, -50);
        glow.offsetMax = new Vector2(110, 50);
        var gi = glow.gameObject.AddComponent<RawImage>();
        gi.texture = StageGlow();
        gi.raycastTarget = false;
        // The answers.
        float y = (h - sideH) / 2;
        foreach (var (defId, tag, act) in opts)
        {
            var o = Hud.Rect(stagePane, "Answer");
            Hud.Place(o, (sideW - (ow + 8)) / 2, y, ow + 8, optH);
            var hitImg = o.gameObject.AddComponent<Image>();
            hitImg.color = new Color(1, 1, 1, 0.001f);
            var b = o.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            var a = act;
            b.onClick.AddListener(() => Do(a));
            var face = Hud.Rect(o, "Card");
            Hud.Place(face, 4, 4, ow, oh);
            var img = face.gameObject.AddComponent<RawImage>();
            img.texture = Faces.Of(defId, Faces.Look.Card, ow);
            img.raycastTarget = false;
            Printed(face, defId, ow, true);
            // (0 0 0 1.5px #fff, 0 0 18px rgba(212,149,42,.55), 0 6px 18px rgba(90,90,110,.18).)
            WebLook.Shadow(img, 0, 18, new Color(212 / 255f, 149 / 255f, 42 / 255f, 0.55f), ow * 0.08f, 1.5f, Color.white);
            var t = Hud.Rect(o, "Tag");
            Hud.Place(t, -20, 4 + oh + 4, ow + 48, tagH);
            var tt = t.gameObject.AddComponent<TextMeshProUGUI>();
            Look.Style(tt, 8.96f, Hud.Rgba(168, 109, 16), false, 500, 14, TextAlignmentOptions.Top);
            tt.text = tag.ToUpperInvariant();
            y += optH + 8;
        }
        if (opts.Count > 0) y += 2;
        var pass = Hud.Box(stagePane, "Let it pass", new Color(252 / 255f, 252 / 255f, 251 / 255f), 10);
        Hud.Place((RectTransform)pass.transform, (sideW - passW) / 2, opts.Count > 0 ? y : (h - passH) / 2, passW, passH);
        WebLook.Shadow(pass, 2, 10, new Color(90 / 255f, 90 / 255f, 110 / 255f, 0.12f), 10, 1, Color.white);
        Hud.Label(pass.transform, "LET IT PASS", 9.92f, Look.Ink, false, 500, 14);
        pass.raycastTarget = true;
        var pb = pass.gameObject.AddComponent<Button>();
        pb.onClick.AddListener(() => Do(new EngineAction { Type = "react" }));
        // The move it answers, under its tag, and what it does.
        float mx = sideW + 14, my = (h - mainH) / 2 + 10;
        var card = Hud.Rect(stagePane, "Move");
        Hud.Place(card, mx, my, scw, ch);
        var ci = card.gameObject.AddComponent<RawImage>();
        ci.texture = moveId != null ? Faces.Of(moveId, Faces.Look.Card, scw) : Resources.Load<Texture2D>("Board/back");
        ci.raycastTarget = false;
        if (moveId != null) Printed(card, moveId, scw, true);
        WebLook.Shadow(ci, 24, 50, new Color(70 / 255f, 70 / 255f, 90 / 255f, 0.28f), scw * 0.08f, 2, Color.white);
        float tw = Hud.Wide("⚡ ANSWER?", 8, 600, 16, 10, true) + 2, th = 8 * 1.25f + 6 + 2;
        var tagBox = Hud.Box(stagePane, "Answer tag", Hud.Rgba(212, 149, 42), 8);
        Hud.Place((RectTransform)tagBox.transform, mx + (scw - tw) / 2, my - 26, tw, th);
        WebLook.Shadow(tagBox, 4, 12, new Color(170 / 255f, 110 / 255f, 20 / 255f, 0.35f), 8, 1, Hud.Rgba(196, 133, 28));
        Hud.Label(tagBox.transform, "⚡ ANSWER?", 8, Color.white, true, 600, 16);
        var cap = Hud.Rect(stagePane, "Caption");
        Hud.Place(cap, mx, my + ch + 8, capW, capLine * 2 + 10);
        var box = cap.gameObject.AddComponent<Image>();
        box.sprite = Hud.Rounded;
        box.type = Image.Type.Sliced;
        box.color = new Color(1, 1, 1, 0.9f);
        box.raycastTarget = false;
        Corners(box, 8);
        var ct = Hud.Label(cap, capT, 8.96f, Look.Ink, false, 500, 18);
        ct.textWrappingMode = TextWrappingModes.Normal;
        ct.margin = new Vector4(14, 5, 14, 5);
        float need = ct.GetPreferredValues(capT, capW - 28, 0).y + 10;
        cap.sizeDelta = new Vector2(capW, need);
    }

    /// <summary>
    /// The card picked can also be set face down as a trap: said here, plainly, under it (its slot can be out of sight):
    /// .btn.stage-ls-btn, indigo (#4b4fb0, a 1 px #3f4296 edge, 0 6px 18px rgba(50,52,120,.35)), white, padded 7 × 14,
    /// rounded 10; the trap's mark, "set as trap" and, smaller, "+1 energy", 6 apart, in spaced capitals 0.62rem.
    /// </summary>
    void TrapButton(RectTransform pane, float paneW, float y, float size, float h)
    {
        const string words = "SET AS TRAP", more = "+1 ENERGY";
        float mark = 0.78f * size, small = 0.8f * size;
        float ww = Hud.Wide(words, size, 500, 14, 0, true), mw = Hud.Wide(more, small, 500, 6, 0, true);
        float w = 14 + mark + 0.08f * size + 6 + ww + 6 + mw + 14 + 2;
        var b = Hud.Box(pane, "Set as trap", Hud.Rgba(63, 66, 150), 10);
        Hud.Place(b.rectTransform, (paneW - w) / 2, y, w, h);
        WebLook.Shadow(b, 6, 18, new Color(50 / 255f, 52 / 255f, 120 / 255f, 0.35f), 10);
        var face = Hud.Box(b.transform, "Face", Hud.Rgba(75, 79, 176), 9);
        Hud.Fill(face.rectTransform);
        face.rectTransform.offsetMin = new Vector2(1, 1);
        face.rectTransform.offsetMax = new Vector2(-1, -1);
        float x = 1 + 14;
        var icon = Hud.Rect(b.transform, "Trap");
        // (Its mark on a picture a quarter larger than it, as the board's.)
        Hud.Place(icon, x - mark * 0.125f, (h - mark) / 2 - mark * 0.125f, mark * 1.25f, mark * 1.25f);
        var ii = icon.gameObject.AddComponent<RawImage>();
        ii.texture = Resources.Load<Texture2D>("Icons/bt-trap");
        ii.color = Color.white;
        ii.raycastTarget = false;
        x += mark + 0.08f * size + 6;
        Hud.Text(b.transform, words, x, 0, ww + 2, h, size, Color.white, true, 500, 14, TextAlignmentOptions.MidlineLeft);
        x += ww + 6;
        var m = Hud.Text(b.transform, more, x, 0, mw + 2, h, small, Color.white, true, 500, 6, TextAlignmentOptions.MidlineLeft);
        m.alpha = 0.9f;
        b.raycastTarget = true;
        var btn = b.gameObject.AddComponent<Button>();
        btn.transition = Selectable.Transition.None;
        btn.onClick.AddListener(() => { Sound.Play("click"); Act("choose-slot", "ls"); });
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

    /// <summary>Whether a card of your hand is on the stage instead (picked, or just played and hanging there), or the hand hidden for a hot seat's handoff.</summary>
    public bool OffHand(string uid) => uid == picked || (stage != null && stage.Own && stage.Uid == uid) || NeedsHandoff();

    /// <summary>The pill's mode chosen (app.ts setConfirmMode): a card waiting now goes, skipping lets a reply waiting pass.</summary>
    void SetConfirmMode(string mode)
    {
        confirmMode = mode;
        // (Auto and normal are kept between games; skip lasts the day.)
        Store.Set(AutoConfirmKey, mode == "normal" ? "0" : "1");
        Sound.Play("hover");
        if (AutoConfirms && stage != null && stage.Confirm) ConfirmStage();
        // (Online, the rival's card waiting to be read is read now.)
        if (AutoConfirms && online && Online.WaitFor == "you" && state?.WinnerId == null) { Online.Ack(); OnlineChanged(); }
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
            // (Along its arc eased out; straight, fx.ts flyFrom's cubic-bezier(.2,.8,.2,1).)
            float t = Arc > 0 ? 1 - Mathf.Pow(1 - p, 3) : CubicBezier(0.2f, 0.8f, 0.2f, 1, p), u = 1 - t;
            float dx = From.center.x - To.center.x, dy = From.center.y - To.center.y;
            float cx = dx / 2, cy = dy / 2 - Arc;
            float x = u * u * dx + 2 * u * t * cx, y = u * u * dy + 2 * u * t * cy;
            float s = Mathf.Min(From.width / To.width, From.height / To.height);
            r.anchoredPosition = home + new Vector2(x, -y);
            r.localScale = Vector3.one * (s + (1 - s) * t);
            if (g != null) { var c = g.color; c.a = Arc > 0 ? Mathf.Min(1, t * 2.5f) : t; g.color = c; }
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
