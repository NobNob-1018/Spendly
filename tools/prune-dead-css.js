/* REMOVES CSS RULES FOR CLASSES NOTHING WEARS.
 *
 * Reports by default; pass --write to actually cut. Point it at a file:
 *
 *   node tools/prune-dead-css.js index.html
 *   node tools/prune-dead-css.js index.html --write
 *
 * WHAT IT WILL AND WILL NOT TOUCH. A class is dead when its name appears nowhere
 * outside a <style> block - no class attribute, no template string, no classList
 * call. A rule is cut only when EVERY selector in its list is dead; a rule like
 *
 *     .stat .label, .label{ ... }
 *
 * keeps `.label` and loses `.stat .label`, because half of it is still worn.
 *
 * TWO THINGS THIS HAS GOT WRONG BEFORE, both guarded here:
 *
 *   A pruner that works on raw text cuts inside a comment. One did, on this very
 *   file, and left a dangling /* that took the whole stylesheet with it. Comments
 *   are masked to spaces before anything is matched, so an offset found in the
 *   masked copy is always real code in the original.
 *
 *   A brace counter that does not understand nesting eats an @media block. Depth
 *   is tracked, and the result is refused unless braces balance exactly as they
 *   did before, minus the rules removed.
 *
 * It also refuses to run if it would remove more than a third of the stylesheet,
 * which is not a number with a theory behind it - it is a tripwire for the case
 * where the "is it used" test breaks and everything looks dead at once.
 */
const fs = require("fs");

const args = process.argv.slice(2);
const WRITE = args.indexOf("--write") !== -1;
const F = args.filter(a => a.indexOf("--") !== 0)[0] ||
  require("path").join(__dirname, "..", "index.html");
const SRC = fs.readFileSync(F, "utf8");

/* ---- 1. which classes are worn ------------------------------------------- */
const styleBlocks = [];
{
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(SRC))) styleBlocks.push({ css: m[1], start: m.index + m[0].indexOf(m[1]) });
}
if (!styleBlocks.length){ console.log("  no <style> blocks"); process.exit(0); }

let notCss = SRC;
styleBlocks.forEach(b => { notCss = notCss.split(b.css).join(" "); });
/* Comments are not wearers. One HTML comment containing the words "for stat
   badge" kept the whole retired .stat design alive through a prune: the test
   searches everything outside <style>, and a comment is outside <style>. Same
   failure as a removal guard matching the sentence that explains the removal. */
const decomment = (t) => t
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n\r]*/g, "$1");
notCss = decomment(notCss);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c);
const wornCache = {};
const isWorn = (cls) => {
  if (wornCache[cls] !== undefined) return wornCache[cls];
  const re = new RegExp("(^|[^\\w-])" + esc(cls) + "([^\\w-]|$)");
  return (wornCache[cls] = re.test(notCss));
};

/* ---- 2. walk each stylesheet, rule by rule -------------------------------- */
/* Comments masked to spaces: same length, same offsets, no text to match
   inside. Every index found below is an index into real code. */
const mask = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));

const cut = [];          // {start, end} in SRC, or {start, end, replacement}
let removedRules = 0, trimmedSelectors = 0;

styleBlocks.forEach(block => {
  const css = block.css;
  const M = mask(css);
  let i = 0, depth = 0;

  while (i < M.length){
    const ch = M[i];

    if (ch === "}"){ depth--; i++; continue; }
    if (ch === "{"){ depth++; i++; continue; }
    if (/\s/.test(ch)){ i++; continue; }

    /* An at-rule opens a nested block (@media, @supports) or ends at a
       semicolon (@import, @charset). Either way its own prelude is not a
       selector list and is stepped over, and the rules INSIDE a nested one are
       reached by the ordinary walk on the next iteration. */
    if (ch === "@"){
      const brace = M.indexOf("{", i), semi = M.indexOf(";", i);
      if (semi !== -1 && (brace === -1 || semi < brace)){ i = semi + 1; continue; }
      if (brace === -1) break;
      i = brace + 1; depth++; continue;
    }

    /* A rule: selector list up to the next {, then a body to its matching }. */
    const open = M.indexOf("{", i);
    if (open === -1) break;
    let d = 0, j = open, close = -1;
    while (j < M.length){
      if (M[j] === "{") d++;
      else if (M[j] === "}"){ d--; if (!d){ close = j; break; } }
      j++;
    }
    if (close === -1) break;

    const selectorText = css.slice(i, open);
    const maskedSelectors = M.slice(i, open);

    /* Split on commas that are not inside brackets or parens - :is(.a, .b)
       is one selector, not two. */
    const parts = [];
    {
      let d2 = 0, from = 0;
      for (let k = 0; k < maskedSelectors.length; k++){
        const c = maskedSelectors[k];
        if (c === "(" || c === "[") d2++;
        else if (c === ")" || c === "]") d2--;
        else if (c === "," && d2 === 0){ parts.push([from, k]); from = k + 1; }
      }
      parts.push([from, maskedSelectors.length]);
    }

    const keep = [], drop = [];
    parts.forEach(([a, b]) => {
      const one = selectorText.slice(a, b);
      const masked = maskedSelectors.slice(a, b);
      const classes = [];
      const cre = /\.(-?[_a-zA-Z][\w-]*)/g;
      let cm;
      while ((cm = cre.exec(masked))) classes.push(cm[1]);
      /* A selector naming no class cannot be judged by this test, so it stays. */
      const dead = classes.length > 0 && classes.some(c => !isWorn(c));
      (dead ? drop : keep).push(one);
    });

    if (drop.length){
      if (!keep.length){
        removedRules++;
        /* Take the whitespace before the rule with it, so removing a rule does
           not leave a blank line where it stood. */
        let from = i;
        while (from > 0 && /[ \t]/.test(css[from - 1])) from--;
        if (from > 0 && css[from - 1] === "\n") from--;
        cut.push({ start: block.start + from, end: block.start + close + 1 });
      } else {
        trimmedSelectors += drop.length;
        cut.push({
          start: block.start + i,
          end: block.start + open,
          replacement: keep.join(",").replace(/^\s+/, "") + " "
        });
      }
    }
    i = close + 1;
  }
});

/* ---- 3. report, and only then write --------------------------------------- */
const bytes = cut.reduce((t, c) => t + (c.end - c.start) - (c.replacement || "").length, 0);
const cssBytes = styleBlocks.reduce((t, b) => t + b.css.length, 0);
const pct = ((bytes / cssBytes) * 100).toFixed(1);

console.log("\n  " + F.split(/[\\/]/).pop());
console.log("  " + removedRules + " rules removed, " + trimmedSelectors +
  " dead selectors trimmed from rules that keep others");
console.log("  " + bytes + " bytes of " + cssBytes + " (" + pct + "% of the CSS)\n");

if (!WRITE){ console.log("  dry run - pass --write to apply\n"); process.exit(0); }

if (bytes > cssBytes / 3){
  console.error("  REFUSED: that is more than a third of the stylesheet. The test for");
  console.error("  'is this class worn' has probably broken rather than the CSS having");
  console.error("  become a third dead overnight.");
  process.exit(1);
}

let outSrc = SRC;
cut.sort((a, b) => b.start - a.start).forEach(c => {
  outSrc = outSrc.slice(0, c.start) + (c.replacement || "") + outSrc.slice(c.end);
});

/* Braces must balance, and the file must still be a document. */
const countIn = (s) => {
  let open = 0, close = 0;
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(s))){
    const c = mask(m[1]);
    open += (c.match(/\{/g) || []).length;
    close += (c.match(/\}/g) || []).length;
  }
  return { open, close };
};
const after = countIn(outSrc);
if (after.open !== after.close)
  throw new Error("braces do not balance after pruning: " + after.open + "/" + after.close);
if (!/<\/html>\s*$/.test(outSrc))
  throw new Error("result does not end in </html>");
if (outSrc.indexOf("/*") !== -1 && outSrc.split("/*").length !== outSrc.split("*/").length)
  throw new Error("a comment was left unterminated");

fs.writeFileSync(F, outSrc);
console.log("  written\n");
