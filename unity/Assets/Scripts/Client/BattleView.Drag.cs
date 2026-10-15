using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;
using UnityEngine.UI;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// Dragging, as app.ts drags: a card dragged up out of your hand is played where it is let go (a slot, a card of yours
/// to fuse onto or recall); a surge that only heats one target stays in the hand, lit, and aims, a beam from it to the
/// pointer, played at the rival card or sun it is let go on; a card of yours that can attack, dragged, aims its attack
/// the same way. (onDragStart/Move/End, onAttackDragStart/Move/End.)
/// </summary>
public partial class BattleView
{
    class HandDrag
    {
        public string Uid;
        public Vector2 Start, Offset, Size;
        public RawImage Ghost;
        public bool Aim;
        public Beam Beam;
        public Game.AimOptions Choices;
    }

    class AttackDrag
    {
        public string Uid;
        public Vector2 Start;
        public Beam Beam;
    }

    HandDrag drag;
    AttackDrag attackDrag;
    /// <summary>What a drag is over that it would land on (a slot, a card of either side, or a sun), lit.</summary>
    string dropOver;
    int dropSlot = int.MinValue;
    bool dropSun;
    /// <summary>A hand card aiming (lit, as .card-aiming), and the rival card an attack being dragged is over.</summary>
    string aimingUid, aimOver;

    bool Dragging => drag != null || attackDrag != null;

    /// <summary>The pointer in the browser's own pixels (the web's client pixels: its thresholds are in them).</summary>
    static Vector2 Client(Vector3 screen) => new Vector2(screen.x, Screen.height - screen.y) / Css.PixelRatio;

    /// <summary>A collider's rectangle on the page (its box's corners seen by the table's camera), as getBoundingClientRect.</summary>
    Rect PageRect(Collider col)
    {
        var b = col.bounds;
        float x0 = float.MaxValue, y0 = float.MaxValue, x1 = float.MinValue, y1 = float.MinValue;
        for (int i = 0; i < 8; i++)
        {
            var w = new Vector3((i & 1) == 0 ? b.min.x : b.max.x, (i & 2) == 0 ? b.min.y : b.max.y, (i & 4) == 0 ? b.min.z : b.max.z);
            var p = Page(Cam.WorldToScreenPoint(w));
            x0 = Mathf.Min(x0, p.x); y0 = Mathf.Min(y0, p.y); x1 = Mathf.Max(x1, p.x); y1 = Mathf.Max(y1, p.y);
        }
        return new Rect(x0, y0, x1 - x0, y1 - y0);
    }

    Rect? CardRect(string uid)
    {
        var v = Board.View(uid);
        var col = v != null ? v.GetComponent<Collider>() : null;
        return col != null ? PageRect(col) : (Rect?)null;
    }

    /// <summary>Whatever is under a point of the screen on the table: a card, a slot, a sun.</summary>
    (CardView card, SlotTag slot, SunTag sun) Under(Vector3 screen)
    {
        if (!Physics.Raycast(Cam.ScreenPointToRay(screen), out var hit, 100)) return (null, null, null);
        return (hit.collider.GetComponentInParent<CardView>(), hit.collider.GetComponent<SlotTag>(), hit.collider.GetComponentInParent<SunTag>());
    }

    /// <summary>
    /// What lies on the table under a point, through your hand (document.elementsFromPoint, as dropEl looks): the
    /// nearest card in play, slot or sun, whatever of the hand is over it.
    /// </summary>
    (CardView card, SlotTag slot, SunTag sun) OnTable(Vector3 screen)
    {
        foreach (var hit in Physics.RaycastAll(Cam.ScreenPointToRay(screen), 100).OrderBy(h => h.distance))
        {
            var card = hit.collider.GetComponentInParent<CardView>();
            if (card != null && !card.Table) continue;
            var slot = hit.collider.GetComponent<SlotTag>();
            var sun = hit.collider.GetComponentInParent<SunTag>();
            if (card != null || slot != null || sun != null) return (card, slot, sun);
        }
        return (null, null, null);
    }

    /// <summary>
    /// Whether a card in hand can be dragged straight onto what it heats: a surge whose only choice is where its heat
    /// goes (one target: no other card to pick, no option, nothing to consume). (app.ts quickAim)
    /// </summary>
    static bool QuickAim(string defId)
    {
        var def = Cards.Def(defId);
        if (!Cards.IsBurst(def) || !Game.Aimable(defId) || def.Consume == true || (def.Choices?.Count ?? 0) > 0) return false;
        var single = new HashSet<string> { "heat", "cool", "shield", "draw", "selfHeat", "plays", "repair" };
        var effects = def.OnPlay ?? new List<Effect>();
        return effects.All(e => single.Contains(e.Type)) && effects.Count(e => e.Type == "heat" && e.To == "target") == 1;
    }

    /// <summary>A press: on a card of your hand, a drag may begin; on a card of yours that can attack, an attack's.</summary>
    void DragPress()
    {
        if (busy || !MyDay || Dawn != null || discarding != null || sheet != null || inspector.gameObject.activeSelf) return;
        var at = Client(Input.mousePosition);
        var (card, _, _) = Under(Input.mousePosition);
        if (card == null) return;
        var held = Me.Hand.FirstOrDefault(c => c.Uid == card.Uid);
        if (held != null && !card.Table)
        {
            // (Its middle under the pointer's offset, and its size as it lies in the hand, in the page's pixels.)
            var r = CardRect(card.Uid) ?? new Rect();
            var page = Page(Input.mousePosition);
            float w = BoardLayout.Current.HandCard * (Board.HandUp ? 1.14f : 1);
            drag = new HandDrag { Uid = card.Uid, Start = at, Offset = page - r.center, Size = new Vector2(w, w * 1.4f), Aim = QuickAim(held.DefId) };
            return;
        }
        // (Only a card that can attack now carries the attack's drag: .card-attacker.)
        if (card.Table && Me.Tableau.Any(c => c.Uid == card.Uid) && Phase == "day" && Game.AttackProblem(state, Me, card.Uid, null, false) == null)
            attackDrag = new AttackDrag { Uid = card.Uid, Start = at };
    }

    /// <summary>The pointer moving with a press held.</summary>
    void DragMove()
    {
        var at = Client(Input.mousePosition);
        var page = Page(Input.mousePosition);
        var d = drag;
        if (d != null)
        {
            if (d.Ghost == null && d.Beam == null)
            {
                // A drag, not a tap: it has moved a little, mostly upwards (out of the hand).
                if ((at - d.Start).magnitude < 14 || d.Start.y - at.y < 8) return;
                pressAt = -1;
                if (d.Aim)
                {
                    // A card that heats one target stays in the hand, lit, and aims: the beam runs from it to the pointer.
                    d.Beam = Beam.Make(beamLayer, Beam.Kind.Attack, 0.22f);
                    aimingUid = d.Uid;
                    Sound.Play("hover");
                    Board.Redress(state, this);
                }
                else
                {
                    var view = Board.View(d.Uid);
                    // (In a layer of its own canvas, with its shadows: moved every frame, it would otherwise have the
                    // whole HUD batched again each frame.)
                    var layer = Hud.Rect(hud.transform, "Drag layer");
                    Hud.Fill(layer);
                    var own = layer.gameObject.AddComponent<Canvas>();
                    own.overrideSorting = true;
                    own.sortingOrder = 500;
                    var ghost = Hud.Rect(layer, "Drag ghost");
                    ghost.anchorMin = ghost.anchorMax = new Vector2(0, 1);
                    ghost.pivot = new Vector2(0.5f, 0.5f);
                    ghost.sizeDelta = d.Size;
                    d.Ghost = ghost.gameObject.AddComponent<RawImage>();
                    // (app.ts: a copy of the hand's card on the page itself, out of the hand, as wide as it lies there: a card
                    // on its own, that wide.)
                    d.Ghost.texture = Faces.Of(view != null ? view.DefId : Me.Hand.First(c => c.Uid == d.Uid).DefId, Faces.Look.Card, BoardLayout.Current.HandCard);
                    d.Ghost.raycastTarget = false;
                    // (.drag-ghost: lifted well off the page, a white hairline round it.)
                    WebLook.Shadow(d.Ghost, 24, 50, new Color(70 / 255f, 70 / 255f, 90 / 255f, 0.35f), d.Size.x * 0.08f, 2, Color.white);
                    // (Its offset from the pointer, in the card as it lies in the hand.)
                    var r = CardRect(d.Uid);
                    if (r != null && r.Value.width > 0) d.Offset *= d.Size.x / r.Value.width;
                    view?.Ghosted(true);
                    Board.Redress(state, this);
                    Sound.Play("hand-lift");
                }
            }
            if (d.Beam != null)
            {
                var from = CardRect(d.Uid);
                if (from != null) d.Beam.To(from.Value, page);
                MarkDrop(DropAt(Input.mousePosition));
                return;
            }
            var g = (RectTransform)d.Ghost.transform;
            g.anchoredPosition = new Vector2(page.x - d.Offset.x, -(page.y - d.Offset.y));
            g.localRotation = Quaternion.Euler(0, 0, 3);
            g.localScale = Vector3.one * 1.05f;
            MarkDrop(DropAt(Input.mousePosition));
            return;
        }
        var a = attackDrag;
        if (a == null) return;
        if (a.Beam == null)
        {
            // A drag, not a tap: it has moved a little.
            if ((at - a.Start).magnitude < 10) return;
            pressAt = -1;
            var mine = Me.Tableau.First(c => c.Uid == a.Uid);
            var why = Game.AttackProblem(state, Me, a.Uid, null, false);
            if (why != null)
            {
                attackDrag = null;
                Say($"{Cards.Def(mine.DefId).Name}: {why}.");
                Refresh();
                return;
            }
            // The targets light up as for a click to aim; the beam runs from the card to the pointer.
            Clear();
            attacker = a.Uid;
            Refresh();
            Sound.Play("hover");
            a.Beam = Beam.Make(beamLayer, Beam.Kind.Attack, 0.22f);
        }
        var src = CardRect(a.Uid);
        if (src != null) a.Beam.To(src.Value, page);
        var over = AttackTargetAt(Input.mousePosition);
        if (over != aimOver)
        {
            aimOver = over;
            Board.Redress(state, this);
        }
    }

    /// <summary>What an attack being dragged is over that it could strike: a rival card lit for it, or their sun ("sun").</summary>
    string AttackTargetAt(Vector3 screen)
    {
        var (card, _, sun) = OnTable(screen);
        if (card != null && card.Table && Rival.Tableau.Any(c => c.Uid == card.Uid) && Game.AttackProblem(state, Me, attacker, card.Uid, true) == null) return card.Uid;
        if (sun != null && sun.PlayerId != you && Game.AttackProblem(state, Me, attacker, null, true) == null) return "sun";
        return null;
    }

    struct Drop { public int? Slot; public string Uid, Aim; }

    /// <summary>
    /// What a dragged card would land on (app.ts dropEl/dropAt): a slot of yours, or a card of yours; aiming, the rival
    /// card or sun it would heat.
    /// </summary>
    Drop? DropAt(Vector3 screen)
    {
        var (card, slot, sun) = OnTable(screen);
        if (drag?.Aim == true)
        {
            var ch = drag.Choices ??= Game.AimChoices(state, Me);
            if (card != null && ch.Cards.Any(c => c.Uid == card.Uid)) return new Drop { Aim = card.Uid };
            if (sun != null && sun.PlayerId != you && ch.Sun) return new Drop { Aim = "sun" };
            return null;
        }
        if (slot != null && slot.Mine) return new Drop { Slot = slot.Slot };
        if (card != null && card.Table && Me.Tableau.Any(c => c.Uid == card.Uid)) return new Drop { Uid = card.Uid };
        return null;
    }

    /// <summary>The spot a dragged card would land on, outlined (.drop-over).</summary>
    void MarkDrop(Drop? d)
    {
        string uid = d?.Uid ?? (d?.Aim != "sun" ? d?.Aim : null);
        int slot = d?.Slot ?? int.MinValue;
        bool sun = d?.Aim == "sun";
        if (uid == dropOver && slot == dropSlot && sun == dropSun) return;
        dropOver = uid;
        dropSlot = slot;
        dropSun = sun;
        Board.MarkDrop(slot != int.MinValue ? slot : (int?)null);
        Board.Redress(state, this);
    }

    /// <summary>The press let go.</summary>
    void DragRelease()
    {
        var d = drag;
        var a = attackDrag;
        drag = null;
        attackDrag = null;
        if (d != null && (d.Ghost != null || d.Beam != null))
        {
            var drop = DropAt(Input.mousePosition);
            var page = Page(Input.mousePosition);
            if (d.Ghost != null) Destroy(d.Ghost.transform.parent.gameObject);
            if (d.Beam != null) Destroy(d.Beam.gameObject);
            Board.View(d.Uid)?.Ghosted(false);
            aimingUid = null;
            MarkDrop(null);
            // Let go above the hand: it is played (and on as any card played); else it goes back. (Aimed with the
            // beam: let go on a target, it is played at it; anywhere else, nothing, as with an attack.)
            if (d.Beam != null)
            {
                if (drop?.Aim != null)
                {
                    RaiseHand(false, null);
                    PlayDropped(d.Uid, drop.Value);
                }
            }
            else if (page.y < BoardLayout.Current.HandTop)
            {
                RaiseHand(false, null);
                Sound.Play("rustle");
                PlayDropped(d.Uid, drop);
            }
            Refresh();
            return;
        }
        if (a != null && a.Beam != null)
        {
            Destroy(a.Beam.gameObject);
            // Let go over a target: it attacks (as a tap on it would). Anywhere else: no attack.
            var target = AttackTargetAt(Input.mousePosition);
            aimOver = null;
            if (target == "sun") TapSun(Rival.Id);
            else if (target != null) TapCard(target);
            else Clear();
            Refresh();
        }
    }

    /// <summary>A card played from the hand where it was let go (app.ts startPlay with its drop).</summary>
    void PlayDropped(string uid, Drop? drop)
    {
        Clear();
        TapCard(uid);
        if (picked != uid || drop == null) return;
        var d = drop.Value;
        if (d.Aim == "sun") TapSun(Rival.Id);
        else if (d.Aim != null) TapCard(d.Aim);
        else if (d.Slot != null) PickSlot(d.Slot.Value);
        else if (d.Uid != null) TapCard(d.Uid);
    }

    /// <summary>A drag given up (the battle left, or a touch cancelled).</summary>
    void DragCancel()
    {
        if (drag != null)
        {
            if (drag.Ghost != null) Destroy(drag.Ghost.transform.parent.gameObject);
            if (drag.Beam != null) Destroy(drag.Beam.gameObject);
            Board.View(drag.Uid)?.Ghosted(false);
        }
        if (attackDrag?.Beam != null) Destroy(attackDrag.Beam.gameObject);
        drag = null;
        attackDrag = null;
        aimingUid = aimOver = null;
        MarkDrop(null);
    }

    /// <summary>The rim a drag puts on a card: the spot it would land (.drop-over), aiming (.card-aiming), the target under an attack (.aim-over).</summary>
    bool DragRim(CardView v, CardInstance c)
    {
        // (Left in the hand while its copy flies, faint, its ring with it.)
        if (drag?.Ghost != null && c.Uid == drag.Uid) { v.Rim(Look.Good, 0.6f * 0.3f); return true; }
        if (c.Uid == aimingUid) { v.Rim(Hud.Rgba(224, 110, 60), 0.75f); return true; }
        if (c.Uid == aimOver) { v.Rim(Hud.Rgba(224, 69, 43), 1.15f); return true; }
        if (c.Uid == dropOver)
        {
            bool rival = Rival.Tableau.Any(x => x.Uid == c.Uid);
            v.Rim(rival ? Hud.Rgba(216, 69, 43) : Hud.Rgba(121, 177, 151), 1.15f);
            return true;
        }
        return false;
    }
}
