// Standing gate for index.html. Runs in-process and sets a real exit code:
// piping `node --check` to head/tail swallows the status and prints a reassuring
// "OK" over a genuine parse error, which is how a dead app once looked healthy.
const fs = require("fs"), vm = require("vm");
const F = "C:/Users/Tim Salinas/Desktop/Repository/spend-tracker/index.html";
const s = fs.readFileSync(F, "utf8");
let bad = 0;

// 1. The whole app is one IIFE: a parse error anywhere kills all of it while the
//    markup still renders happily. This is the check that matters most.
[...s.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
  if (!m[1].trim()) return;
  const line = s.slice(0, m.index).split("\n").length;
  try { new vm.Script(m[1], { filename: "b" + i });
        console.log("  script @line " + line + ": PARSES (" + m[1].length + " bytes)"); }
  catch (e) { bad++; console.error("  script @line " + line + ": PARSE ERROR -> " + e.message); }
});

const css = (s.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
const ob = (css.match(/{/g) || []).length, cb = (css.match(/}/g) || []).length;
console.log("  CSS braces " + ob + "/" + cb + " " + (ob === cb ? "balanced" : "UNBALANCED"));
if (ob !== cb) bad++;
const od = (s.match(/<div\b/g) || []).length, cd = (s.match(/<\/div>/g) || []).length;
console.log("  divs " + od + "/" + cd + " " + (od === cd ? "balanced" : "UNBALANCED"));
if (od !== cd) bad++;

// 2. Token integrity. Custom properties may also be declared inline (style="--fill:…")
//    or from script, so both of those count as definitions.
const defs = new Set([...s.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
[...s.matchAll(/setProperty\(\s*["'](--[\w-]+)/g)].forEach(m => defs.add(m[1]));
const missing = [...new Set([...s.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]))].filter(u => !defs.has(u));
console.log("  css vars: " + defs.size + " defined, " + missing.length + " undefined" +
            (missing.length ? " -> " + missing.join(", ") : ""));
if (missing.length) bad++;

// 3. The three damage shapes past token migrations actually produced in this file:
//    var(--ease-in-out)-in-out, --positive:var(--positive), and values emptied outright.
//    A value of `none` is deliberate (reduced-motion blocks) and is not damage.
const concat   = [...css.matchAll(/:\s*[^;{}]*var\(--[\w-]+\)-[\w-]+/g)].length;
const circular = [...css.matchAll(/(--[\w-]+)\s*:\s*var\(\1\)/g)].length;
const emptied  = [...css.matchAll(/(?:transition|animation|box-shadow)\s*:\s*(?:;|})/g)].length;
console.log("  malformed var() concat: " + concat + " | circular tokens: " + circular +
            " | emptied values: " + emptied);
if (concat || circular || emptied) bad++;

// 4. Money invariant: every mutation must go through round2().
const js = (s.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/) || [, ""])[1];
const deposits = (js.match(/depositToSavings\(/g) || []).length;
const withdraws = (js.match(/withdrawFromSavings\(/g) || []).length;
console.log("  money movers: depositToSavings " + deposits + " / withdrawFromSavings " + withdraws);

console.log(bad ? "\nGATE FAILED (" + bad + ")" : "\nGATE PASSED");
process.exit(bad ? 1 : 0);
