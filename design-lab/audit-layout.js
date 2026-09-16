/* A layout auditor for the three lab variants.
 *
 * WHY IT EXISTS. Two rounds of visible defects were found by the user looking at
 * the screen, not by me checking. Both times the checking read innerText and ids
 * — which proves an element EXISTS — and never geometry, which proves it is LAID
 * OUT. A seven-column chart collapsed to 60px still reports the right seven day
 * names. This measures boxes instead.
 *
 * WHAT IT REPORTS, for the visible surface of whatever tab is open:
 *   overlaps   two text-bearing boxes that intersect (excluding ancestor pairs
 *              and anything fixed, which is allowed to sit over things)
 *   collapsed  a grid whose every track computed to ~0
 *   overflow   an element outside the parent that should contain it
 *   sticky     a sticky element with a NON-ZERO offset inside a scroll
 *              container — i.e. an offset measured for the viewport being
 *              applied against a container, which parks it on the content.
 *              top:0 inside a container is correct and is not reported.
 *   clipped    text cut off with no ellipsis
 *
 * Every rect is clipped to its nearest scrolling ancestor first — without that,
 * a bounded table reports every scrolled-out row as overlapping whatever sits
 * below the container.
 *
 * HOW TO RUN IT. It is an expression, not a module: fetch it and eval it inside
 * the page you want to audit. From a driver page on the same origin:
 *
 *   const SRC = await fetch("/design-lab/audit-layout.js").then(r => r.text());
 *   // ...load a variant in an iframe, click a tab, wait for it to settle...
 *   const report = iframe.contentWindow.eval(SRC);
 *
 * Sweep every variant x every tab x {420, 900, 1400, 1900} before calling a
 * design pass done. It found eleven real defects on its first run.
 *
 * KNOWN FALSE POSITIVE. A full-bleed toolbar row (negative margin, matching
 * padding, so its border reaches the card edge) reports as overflowing its
 * parent by the margin. Its CONTENT lines up; only its box hangs out.
 */
(function(){
  const out = { overlaps: [], collapsed: [], overflow: [], sticky: [], clipped: [] };
  const name = el => el.tagName.toLowerCase() +
    (el.id ? '#' + el.id : (el.className && typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/)[0] : ''));
  const shown = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const clipRect = el => { let r = el.getBoundingClientRect(); let p = el.parentElement; while (p && p !== document.body){ const s = getComputedStyle(p); if (["auto","scroll","hidden"].includes(s.overflowY) || ["auto","scroll","hidden"].includes(s.overflowX)){ const c = p.getBoundingClientRect(); const top=Math.max(r.top,c.top), bottom=Math.min(r.bottom,c.bottom), left=Math.max(r.left,c.left), right=Math.min(r.right,c.right); if (bottom<=top||right<=left) return null; r={top,bottom,left,right,width:right-left,height:bottom-top}; } p=p.parentElement; } return r; };
  const ownText = el => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
    return t.trim();
  };

  const panel = document.querySelector('.tab-panel[style*="display: block"], .tab-panel.is-active')
             || document.querySelector('.tab-panel:not([style*="none"])');
  const root = panel || document.body;
  const all = [...root.querySelectorAll('*')].filter(shown);

  // ---- overlapping text -------------------------------------------------
  // Only leaf-ish elements that carry their own text, and never an
  // ancestor/descendant pair, which legitimately overlap.
  const texts = all.filter(el => ownText(el).length > 1 &&
    !/^(script|style|option)$/i.test(el.tagName));
  for (let i = 0; i < texts.length; i++){
    for (let j = i + 1; j < texts.length; j++){
      const a = texts[i], b = texts[j];
      if (a.contains(b) || b.contains(a)) continue;
      const A = clipRect(a), B = clipRect(b); if(!A||!B) continue;
      const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
      const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (ox > 2 && oy > 2){
        // absolutely positioned things are allowed to sit over things
        const pa = getComputedStyle(a).position, pb = getComputedStyle(b).position;
        if (pa === 'fixed' || pb === 'fixed') continue;
        out.overlaps.push(name(a) + ' "' + ownText(a).slice(0,18) + '" over ' +
                          name(b) + ' "' + ownText(b).slice(0,18) + '"');
      }
    }
  }

  // ---- collapsed grid/flex tracks ---------------------------------------
  all.forEach(el => {
    const s = getComputedStyle(el);
    if (s.display !== 'grid' && s.display !== 'inline-grid') return;
    const cols = s.gridTemplateColumns;
    if (!cols || cols === 'none') return;
    const parts = cols.split(' ').map(parseFloat).filter(n => !isNaN(n));
    if (parts.length > 1 && parts.every(n => n < 2))
      out.collapsed.push(name(el) + ' grid tracks all ~0 (' + parts.length + ' cols)');
  });

  // ---- overflow ----------------------------------------------------------
  all.forEach(el => {
    const s = getComputedStyle(el);
    if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden') return;
    const p = el.parentElement; if (!p) return;
    const ps = getComputedStyle(p);
    if (ps.overflowX === 'auto' || ps.overflowX === 'scroll' || ps.overflowX === 'hidden') return;
    if (s.position === 'absolute' || s.position === 'fixed') return;
    const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
    if (pr.width < 2) return;
    if (r.right > pr.right + 2 || r.left < pr.left - 2)
      out.overflow.push(name(el) + ' outside ' + name(p) + ' by ' +
        Math.round(Math.max(r.right - pr.right, pr.left - r.left)) + 'px');
  });

  // ---- sticky inside an unintended scroll container ----------------------
  all.forEach(el => {
    if (getComputedStyle(el).position !== 'sticky') return;
    let p = el.parentElement, container = null;
    while (p && p !== document.body){
      const s = getComputedStyle(p);
      if (['auto','scroll','hidden'].includes(s.overflowY) || ['auto','scroll','hidden'].includes(s.overflowX)){
        container = p; break;
      }
      p = p.parentElement;
    }
    if (container){
      const top = parseFloat(getComputedStyle(el).top) || 0;
      // top:0 against a scroll container is the correct construction — it pins
      // to the top of the thing that scrolls. Only an offset meant for the
      // viewport, applied inside a container, lands on content.
      if (top === 0) return;
      out.sticky.push(name(el) + ' sticks inside ' + name(container) +
        ' (top:' + top + 'px) not the viewport');
    }
  });

  // ---- clipped text without an ellipsis ----------------------------------
  all.forEach(el => {
    if (ownText(el).length < 2) return;
    if (el.classList && el.classList.contains("sr-only")) return;
    const s = getComputedStyle(el);
    if (s.textOverflow === 'ellipsis') return;
    if (s.overflowX === 'visible') return;
    if (el.scrollWidth > el.clientWidth + 2)
      out.clipped.push(name(el) + ' "' + ownText(el).slice(0,18) + '" clipped ' +
        (el.scrollWidth - el.clientWidth) + 'px');
  });

  const dedupe = a => [...new Set(a)];
  return { overlaps: dedupe(out.overlaps).slice(0,10), collapsed: dedupe(out.collapsed).slice(0,6),
           overflow: dedupe(out.overflow).slice(0,8), sticky: dedupe(out.sticky).slice(0,6),
           clipped: dedupe(out.clipped).slice(0,6),
           counts: { overlaps: dedupe(out.overlaps).length, collapsed: dedupe(out.collapsed).length,
                     overflow: dedupe(out.overflow).length, sticky: dedupe(out.sticky).length,
                     clipped: dedupe(out.clipped).length } };
})()