/* A contrast auditor for the three lab variants.
 *
 * WHY IT EXISTS. Contrast had never been measured in any of the three, and when
 * it finally was, all three failed — including a colour that means "money
 * arriving" sitting at 4.41, and a fourth ink level at 1.98 that was carrying
 * real meaning. Reading a palette and believing it is not measuring it.
 *
 * WHAT IT DOES. Walks the visible DOM, and for every element that paints its own
 * text, composites the effective background (through every ancestor, honouring
 * alpha) and compares it with the effective foreground. Reports anything under
 * the WCAG AA threshold for its size: 3.0 for text at 24px, or 18.66px bold;
 * 4.5 for everything else.
 *
 * TWO THINGS IT GETS RIGHT THAT THE FIRST VERSION DID NOT, both of which made it
 * report passing colours as failures:
 *
 *   1. `color(srgb r g b / a)` is parsed. Chrome returns that form for any
 *      colour authored in a wide-gamut space, and reading its numbers as 0-255
 *      turned a legible chip into a fake failure at 3.22 when it was at 5.22.
 *   2. Alpha is composited, not ignored. `rgb(255 255 255 / .70)` over a dark
 *      ground is not white; treating it as white understates the ink and as
 *      transparent overstates it.
 *
 * HOW TO RUN IT. It is an expression, not a module: fetch it and eval it inside
 * the page being audited, exactly like audit-layout.js.
 *
 *   const SRC = await fetch("/design-lab/audit-contrast.js").then(r => r.text());
 *   const report = iframe.contentWindow.eval(SRC);
 *
 * Sweep every variant x every tab x every theme. A variant with a light and a
 * dark edition has to pass in both; the accents that work on paper are the ones
 * that vanish at night.
 *
 * KNOWN LIMIT. It measures against the composited background COLOUR. Text laid
 * over an image or a gradient reports against whichever flat colour is behind
 * that, so anything in .hero or a chart needs an eye as well as this.
 */
(function(){
  const out = { fail: [], unmeasurable: [], checked: 0, skipped: 0 };

  function parse(str){
    if (!str) return null;
    str = str.trim();
    if (str === "transparent") return [0, 0, 0, 0];
    // color(srgb 0.12 0.34 0.56 / 0.7) — components are 0-1, not 0-255.
    let m = str.match(/^color\(\s*srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s*(?:\/\s*([\d.eE+-]+%?)\s*)?\)$/);
    if (m){
      const a = m[4] == null ? 1 : (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return [+m[1] * 255, +m[2] * 255, +m[3] * 255, a];
    }
    m = str.match(/^rgba?\(([^)]+)\)$/);
    if (m){
      const p = m[1].split(/[\s,/]+/).filter(Boolean);
      const a = p.length > 3 ? (p[3].endsWith("%") ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1;
      return [parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2]), a];
    }
    return null;
  }

  // src over dst, both premultiplied out to plain sRGB bytes.
  function over(src, dst){
    const a = src[3];
    if (a >= 1) return [src[0], src[1], src[2], 1];
    if (a <= 0) return dst;
    return [src[0] * a + dst[0] * (1 - a),
            src[1] * a + dst[1] * (1 - a),
            src[2] * a + dst[2] * (1 - a), 1];
  }

  function lum(c){
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function ratio(a, b){
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  // Walk up until the stack is opaque. Anything translucent on the way down
  // contributes, which is the whole point.
  //
  // A gradient or an image anywhere in that stack stops the walk and says so.
  // The first version reported the masthead's gradient-filled ₱ mark as a 1.1
  // failure, because computed backgroundColor for a gradient is transparent and
  // the paper behind it was taken as the ground. A tool that cries wolf about
  // the one thing it cannot see is how a real failure gets scrolled past.
  function groundOf(el){
    const stack = [];
    let n = el;
    while (n && n.nodeType === 1){
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none")
        return { painted: true, where: label(n) };
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0){ stack.push(c); if (c[3] >= 1) break; }
      n = n.parentElement;
    }
    let ground = [255, 255, 255, 1];           // the canvas under everything
    for (let i = stack.length - 1; i >= 0; i--) ground = over(stack[i], ground);
    return ground;
  }

  function hasOwnText(el){
    for (const n of el.childNodes)
      if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
  }

  function label(el){
    return el.tagName.toLowerCase() +
      (el.id ? "#" + el.id : "") +
      (el.className && typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
  }

  const seen = new Set();
  document.querySelectorAll("*").forEach(el => {
    if (!hasOwnText(el)) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1){ out.skipped++; return; }

    const fgRaw = parse(cs.color);
    if (!fgRaw){ out.skipped++; return; }
    const ground = groundOf(el);
    if (ground.painted){
      out.unmeasurable.push({ el: label(el), over: ground.where, color: cs.color,
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 44) });
      return;
    }
    const fg = over(fgRaw, ground);

    const size = parseFloat(cs.fontSize);
    const weight = +cs.fontWeight || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(fg, ground);

    out.checked++;
    if (got + 0.005 < need){
      const key = label(el) + "|" + cs.color + "|" + Math.round(got * 100);
      if (seen.has(key)) return;
      seen.add(key);
      out.fail.push({
        el: label(el),
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 44),
        color: cs.color,
        on: "rgb(" + ground.slice(0, 3).map(Math.round).join(" ") + ")",
        size: Math.round(size * 10) / 10 + "px" + (weight >= 700 ? " bold" : ""),
        got: Math.round(got * 100) / 100,
        need: need
      });
    }
  });

  out.fail.sort((a, b) => a.got - b.got);
  return out;
})()
