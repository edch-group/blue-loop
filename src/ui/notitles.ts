/**
 * No plain browser tooltips anywhere: the only tooltips are the styled ones on keywords. Every `title` is
 * taken off as it reaches the page; a control named only by its title keeps that name as its aria-label,
 * so screen readers still announce it.
 */
export function noNativeTooltips() {
  const strip = (el: Element) => {
    const t = el.getAttribute('title');
    if (t === null) return;
    if (t && !el.hasAttribute('aria-label') && el.matches('button, a, input, select, textarea, [role="button"], [data-act]')) el.setAttribute('aria-label', t);
    el.removeAttribute('title');
  };
  const sweep = (root: Element) => {
    strip(root);
    root.querySelectorAll('[title]').forEach(strip);
    // (SVG shows its <title> as a tooltip too.)
    root.querySelectorAll('svg title').forEach((t) => t.remove());
  };
  sweep(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') strip(r.target as Element);
      else r.addedNodes.forEach((n) => n instanceof Element && sweep(n));
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
}
