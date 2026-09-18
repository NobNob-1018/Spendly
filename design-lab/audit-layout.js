/* A layout auditor for the three lab variants.
 *
 * WHY IT EXISTS. Two rounds of visible defects were found by the user looking at
 * the screen, not by me checking. Both times the checking read innerText and ids
 * — which proves an element EXISTS — and never geometry, which proves it is LAID
 * OUT. A seven-column chart collapsed to 60px still reports the right seven day
 * names. This measures boxes instead.
 *
 * WHAT IT REPORTS, for the whole visible document — not just the open tab
 * panel, because a design whose main surface is not inside one would otherwise
 * be reported clean without having been looked at:
 *   overlaps   two text-bearing boxes that intersect (excluding ancestor pairs
 *              and anything painted in the fixed layer, itself or via an
 *              ancestor, which is allowed to sit over things)
 *   collapsed  a grid whose every track computed to ~0
 *   overflow   an element whose BOX is outside the parent that should contain it
 *   bleed      an element whose INK is wider than its own box, with nothing
 *              - except the bento's own furniture, which hangs in the gutter
 *              on purpose and carries data-bento-chrome to say so; that is
 *              forgiven only when nothing else is outside the box
 *              downstream to clip or scroll it — a rect can sit perfectly
 *              inside its parent while the glyphs run out of the column
 *   sticky     a sticky element with a NON-ZERO offset inside a scroll
 *              container — i.e. an offset measured for the viewport being
 *              applied against a container, which parks it on the content.
 *              top:0 inside a container is correct and is not reported.
 *   clipped    text cut off with no ellipsis
 *   hscroll    a CARD that has to scroll sideways to hold its own contents.
 *              Separate from overflow because overflow stops at the first
 *              ancestor that can scroll, and a bento card is overflow:auto as
 *              a safety net rather than as an intended scroller - so every
 *              collision inside one was invisible here. Measured: a 3000px box
 *              planted in a 629px card reported zero on all six checks.
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
 * A full-bleed row — negative horizontal margin that its own padding gives
 * back, so its rule reaches the container edge while its content stays on the
 * measure — used to report twice per sweep, as overflow and again as bleed. It
 * is recognised and skipped now.
 */
(function(){
  const out = { overlaps: [], collapsed: [], overflow: [], bleed: [], sticky: [], clipped: [], hscroll: [] };
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
  // A row pulled out to the container's edge: negative horizontal margin, and
  // its own padding puts the content back on the measure. Its box hangs out on
  // purpose and its parent's scrollWidth grows by the same amount.
  const fullBleed = el => {
    const s = getComputedStyle(el);
    const ml = parseFloat(s.marginLeft) || 0, mr = parseFloat(s.marginRight) || 0;
    if (ml > -1 && mr > -1) return false;
    const pl = parseFloat(s.paddingLeft) || 0, pr = parseFloat(s.paddingRight) || 0;
    return Math.abs(pl + ml) < 2 && Math.abs(pr + mr) < 2;
  };
  // A pulled-out row inflates the scrollWidth of every ancestor, not only its
  // parent, so this looks down the subtree — and only accepts the excuse when
  // the pull-out is at least as large as the excess being explained.
  const bleedExplained = (el, excess) =>
    [...el.querySelectorAll('*')].some(c => {
      if (!fullBleed(c)) return false;
      const cs = getComputedStyle(c);
      const pull = Math.max(-(parseFloat(cs.marginLeft) || 0), -(parseFloat(cs.marginRight) || 0));
      return pull >= excess - 1;
    });
  const inFixed = el => {
    let n = el;
    while (n && n.nodeType === 1 && n !== document.body){
      if (getComputedStyle(n).position === 'fixed') return true;
      n = n.parentElement;
    }
    return false;
  };
  const ownText = el => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
    return t.trim();
  };

  // The whole visible document. Scoping this to the active .tab-panel meant the
  // ledger — whose frame is a SIBLING of the panels, not inside one — was never
  // measured at all, and reported clean for it. shown() already rejects
  // display:none, visibility:hidden, zero opacity and zero-sized boxes, so a
  // closed drawer and an inactive panel stay out on their own merits.
  // The TEST BUILD badge is the harness, not the design: it is fixed, it sits
  // over the page deliberately, and it was reporting as overlapping the rail.
  const badge = document.getElementById('lab-badge');
  const all = [...document.body.querySelectorAll('*')]
    .filter(el => !(badge && (el === badge || badge.contains(el))))
    .filter(shown);

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
        // Anything painted in the fixed layer is allowed to sit over the page —
        // and that is true of its CHILDREN too, which is why this walks up
        // rather than reading one element's own position.
        if (inFixed(a) || inFixed(b)) continue;
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
    if (fullBleed(el)) return;
    if (r.right > pr.right + 2 || r.left < pr.left - 2)
      out.overflow.push(name(el) + ' outside ' + name(p) + ' by ' +
        Math.round(Math.max(r.right - pr.right, pr.left - r.left)) + 'px');
  });

  // ---- ink wider than the box, with nothing to clip it -------------------
  // A rect is where the box is; scrollWidth is where the ink is. They may
  // differ under overflow:visible, and that only matters when no ancestor
  // clips or scrolls — at which point the glyphs land on the neighbour.
  all.forEach(el => {
    const s = getComputedStyle(el);
    if (s.overflowX !== 'visible') return;
    if (s.position === 'absolute' || s.position === 'fixed') return;
    const bleed = el.scrollWidth - el.clientWidth;
    if (bleed <= 1 || el.clientWidth < 2) return;
    // Only if nothing above it takes responsibility for the excess.
    let p = el.parentElement, contained = false;
    while (p && p !== document.body){
      const ps = getComputedStyle(p);
      if (ps.overflowX === 'auto' || ps.overflowX === 'scroll' || ps.overflowX === 'hidden'){ contained = true; break; }
      p = p.parentElement;
    }
    if (contained) return;
    if (bleedExplained(el, bleed)) return;
    /* The bento's own furniture hangs in the gutter on purpose - the resize
       handles are placed outside the cards so there is no scrollbar to dodge
       and nothing underneath them to cover - and it says so in the DOM. The
       excess is forgiven ONLY when nothing but that furniture is outside the
       box: a real element bleeding still reports. */
    if (el.querySelector('[data-bento-chrome]')){
      const box = el.getBoundingClientRect();
      let worst = 0;
      el.querySelectorAll('*').forEach(k => {
        if (k.closest('[data-bento-chrome]')) return;
        const b = k.getBoundingClientRect();
        if (b.width && b.right - box.right > worst) worst = b.right - box.right;
      });
      if (worst <= 1) return;
    }
    out.bleed.push(name(el) + ' paints ' + bleed + 'px past its own box (' +
      el.scrollWidth + ' into ' + el.clientWidth + ')');
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
    // Visually-hidden text is a 1x1 box with its overflow clipped away on
    // purpose, and it is the IDIOM that makes it not a defect, not the class
    // name it happens to carry. Keyed to .sr-only, this check called three
    // perfectly good screen-reader labels a clipping bug the moment a button
    // wore its label under a different name.
    if (el.clientWidth <= 1 && el.clientHeight <= 1) return;
    const s = getComputedStyle(el);
    if (s.textOverflow === 'ellipsis') return;
    if (s.overflowX === 'visible') return;
    if (el.scrollWidth > el.clientWidth + 2)
      out.clipped.push(name(el) + ' "' + ownText(el).slice(0,18) + '" clipped ' +
        (el.scrollWidth - el.clientWidth) + 'px');
  });

  // ---- a card that has to scroll sideways --------------------------------
  /* The overflow check above returns as soon as a parent can scroll, which is
     correct for a scroller and blind for a card. Proved by planting a 3000px
     box inside a 629px card: scrollWidth 3048 against clientWidth 629, and all
     six counts came back zero. "This month against last" was drawn 66px
     outside its own column at a width the layout allowed, and nothing here
     said so. */
  document.querySelectorAll('[data-arrange-id], .loan-card').forEach(el => {
    if (!shown(el)) return;
    /* ONLY overflow-x:auto - the safety net that got used. 'scroll' is a box
       that means to scroll, and 'visible' is a box that never will: measured,
       a .loan-card reports scrollWidth 23px over clientWidth because its
       remove button's tooltip is absolutely positioned 93px to the right and
       translated back, and a transform does not shrink the scrollable overflow
       area. Nothing scrolls, nothing is clipped, and setting scrollLeft to 50
       leaves it at 0. Flagging that is calling geometry a defect. */
    if (getComputedStyle(el).overflowX !== 'auto') return;
    const by = el.scrollWidth - el.clientWidth;
    if (by > 2) out.hscroll.push(name(el) + ' needs ' + by + 'px it does not have');
  });

  // Built from the keys of the collector rather than named one at a time, so adding a
  // check to the top of this file cannot silently fail to reach the caller —
  // which is what happened when the bleed check was added and the hand-written return
  // below it was not.
  const dedupe = a => [...new Set(a)];
  const LIMIT = { overlaps: 10, collapsed: 6, overflow: 8, bleed: 8, sticky: 6, clipped: 6, hscroll: 8 };
  const report = { counts: {} };
  Object.keys(out).forEach(k => {
    const list = dedupe(out[k]);
    report[k] = list.slice(0, LIMIT[k] || 8);
    report.counts[k] = list.length;
  });
  report.total = Object.values(report.counts).reduce((t, n) => t + n, 0);
  return report;
})()