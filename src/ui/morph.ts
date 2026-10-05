/**
 * Redraw a part of the page from new markup by changing only what differs (a "morph"), rather than
 * replacing it wholesale. Elements that stay keep their identity: the browser need not lay out and
 * paint them afresh, their animations and transitions carry on, canvases keep their pixels and lists
 * keep their scroll.
 *
 * Children are matched by key where they have one (id, data-uid, data-anchor or data-key), so a card
 * that moves (from hand to the table, along the hand) is moved, not rebuilt; otherwise by position and tag.
 *
 * Inline styles are merged: the declarations the markup gives are applied, and those it gave last time
 * but no longer does are removed, while properties set from script (a card's place in the fan, a fitted
 * font size) are left alone.
 */

/** What each element's markup last said its style was (to tell markup styles from script ones). */
const markupStyle = new WeakMap<Element, string>();

/** Classes added from script that a redraw keeps (a hand card lifted under the pointer, or held still as the hand rises). */
const KEEP_CLASSES = ['lifted', 'no-lift'];

const keyOf = (n: Node): string | null => {
  if (n.nodeType !== 1) return null;
  const el = n as Element;
  return el.id || el.getAttribute('data-uid') || el.getAttribute('data-anchor') || el.getAttribute('data-key');
};

const sameKind = (a: Node, b: Node) => a.nodeType === b.nodeType && a.nodeName === b.nodeName;

/** The first class an element's markup gives it: what it is (a `.game`, a `.cmp-sky`), as opposed to its state. */
const role = (n: Node) => (n.nodeType === 1 ? ((n as Element).getAttribute('class') ?? '').trim().split(/\s+/)[0] : '');

/**
 * Whether an unkeyed element can stand in for another: the same tag, and the same role. Otherwise a
 * different screen's element would be reused, and keep what was set on it from script (the campaign
 * sky's pan, say, would carry over onto the battle's game board).
 */
const sameElement = (a: Node, b: Node) => sameKind(a, b) && role(a) === role(b);

/** Replace `root`'s contents with `html`, changing only what differs. */
export function morphInto(root: Element, html: string) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  morphChildren(root, tpl.content);
}

function morphChildren(from: Element, to: ParentNode) {
  const keyed = new Map<string, Node>();
  for (let c = from.firstChild; c; c = c.nextSibling) {
    const k = keyOf(c);
    if (k && !keyed.has(k)) keyed.set(k, c);
  }
  let cur: Node | null = from.firstChild;
  for (let next = to.firstChild; next; ) {
    const after: ChildNode | null = next.nextSibling;
    const k = keyOf(next);
    let match: Node | null = null;
    if (k) {
      const old = keyed.get(k);
      if (old && sameKind(old, next)) {
        match = old;
        keyed.delete(k);
      }
    } else {
      // An old element no new one here can stand in for is dropped, so it doesn't hold up those after it.
      while (cur && !keyOf(cur) && !sameElement(cur, next) && !laterMatch(cur, after)) {
        const gone: Node = cur;
        cur = cur.nextSibling;
        from.removeChild(gone);
      }
      if (cur && !keyOf(cur) && sameElement(cur, next)) match = cur;
    }
    if (match) {
      if (match === cur) cur = cur.nextSibling;
      else from.insertBefore(match, cur);
      morphNode(match, next);
    } else {
      from.insertBefore(next, cur);
      if (next.nodeType === 1) noteMarkupStyles(next as Element);
    }
    next = after;
  }
  // Whatever is left over had no place in the new markup.
  while (cur) {
    const gone: Node = cur;
    cur = cur.nextSibling;
    from.removeChild(gone);
  }
}

/** Whether an unkeyed new node from `start` on could reuse `old`. */
function laterMatch(old: Node, start: Node | null): boolean {
  for (let n = start; n; n = n.nextSibling) if (!keyOf(n) && sameElement(old, n)) return true;
  return false;
}

function morphNode(old: Node, next: Node) {
  if (old.nodeType !== 1) {
    if (old.nodeValue !== next.nodeValue) old.nodeValue = next.nodeValue;
    return;
  }
  const a = old as HTMLElement, b = next as HTMLElement;
  // Nothing changed here, and nothing below it: done (a fast native check).
  if (a.isEqualNode(b)) return;
  syncAttributes(a, b);
  // A canvas's pixels are its own; the backdrop's slot holds the star moved into it from script.
  if (a.tagName === 'CANVAS' || a.hasAttribute('data-morph-keep')) return;
  morphChildren(a, b);
}

function syncAttributes(a: HTMLElement, b: HTMLElement) {
  for (const { name } of [...a.attributes]) {
    if (b.hasAttribute(name) || name === 'style') continue;
    // A canvas's size is set from script.
    if (a.tagName === 'CANVAS' && (name === 'width' || name === 'height')) continue;
    a.removeAttribute(name);
  }
  for (const { name, value } of [...b.attributes]) {
    if (name === 'style') continue;
    if (name === 'class') {
      const keep = KEEP_CLASSES.filter((c) => a.classList.contains(c));
      if (a.getAttribute('class') !== value) a.setAttribute('class', value);
      for (const c of keep) a.classList.add(c);
      continue;
    }
    if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  }
  // Form fields: what's typed is the field's own (unless the markup changes it, and it isn't being typed in).
  if (a instanceof HTMLInputElement && b instanceof HTMLInputElement && document.activeElement !== a) {
    if (a.value !== b.value) a.value = b.value;
    if (a.checked !== b.checked) a.checked = b.checked;
  }
  mergeStyle(a, b.getAttribute('style') ?? '');
}

function mergeStyle(a: HTMLElement, style: string) {
  const was = markupStyle.get(a) ?? a.getAttribute('style') ?? '';
  if (was === style) return;
  markupStyle.set(a, style);
  const now = declarations(style);
  for (const prop of declarations(was).keys()) if (!now.has(prop)) a.style.removeProperty(prop);
  for (const [prop, [value, important]] of now) a.style.setProperty(prop, value, important);
}

/** A style attribute's declarations, by property. */
function declarations(style: string): Map<string, [string, string]> {
  const out = new Map<string, [string, string]>();
  if (!style) return out;
  const probe = document.createElement('div').style;
  probe.cssText = style;
  for (let i = 0; i < probe.length; i++) {
    const prop = probe[i];
    out.set(prop, [probe.getPropertyValue(prop), probe.getPropertyPriority(prop)]);
  }
  return out;
}

/** Remember the markup style of elements just drawn wholesale (the first time a part of the page appears). */
export function noteMarkupStyles(root: Element) {
  if (root.hasAttribute('style')) markupStyle.set(root, root.getAttribute('style') ?? '');
  root.querySelectorAll<HTMLElement>('[style]').forEach((el) => markupStyle.set(el, el.getAttribute('style') ?? ''));
}
