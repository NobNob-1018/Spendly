/* A standing gate for the lab variants.
 *
 * WHY IT EXISTS. `node verify.js` in the project root checks index.html and
 * nothing else — so the four files in here, which are the ones actually being
 * edited every day, had no gate at all. That was fine while they were copies.
 * It stopped being fine the moment a bad edit truncated combined.html to
 * 12,274 lines ending in the literal text "NaN", and the root gate reported
 * GATE PASSED, because it was reading a different file.
 *
 * WHAT IT CHECKS, per variant:
 *   ends        the document is closed — a truncated file is the failure mode
 *               that a parse check alone will not see, because what survives
 *               can still parse
 *   scripts     every inline script parses; the app is one IIFE, so one error
 *               kills all of it while the markup still renders happily
 *   css         braces balance
 *   divs        open/close balance
 *   harness     the storage namespace is present, and is this variant's own —
 *               a copied file that kept its source's namespace would read and
 *               WRITE another variant's records
 *   size        a floor, because the interesting failure is a file that lost
 *               most of itself and still parses
 *
 * Run it after every edit batch, like the root gate, and never pipe it:
 *
 *     node design-lab/verify-lab.js
 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const LAB = __dirname;

const VARIANTS = [
  { file: "unai-only.html",  ns: "LAB_UNAI_" },
  { file: "unai-team.html",  ns: "LAB_UNAITEAM_" },
  { file: "ui-only.html",    ns: "LAB_UI_" },
  { file: "combined.html",   ns: "LAB_COMBINED_" }
];
const MIN_LINES = 9000;          // a baseline copy is ~10,600; a redesign is more

let bad = 0;
for (const v of VARIANTS){
  const p = path.join(LAB, v.file);
  if (!fs.existsSync(p)){ console.log("  " + v.file.padEnd(17) + "MISSING"); bad++; continue; }
  const s = fs.readFileSync(p, "utf8");
  const lines = s.split("\n").length;
  const notes = [];

  // The document is closed. A truncation can still parse whatever survived it.
  if (!/<\/html>\s*$/.test(s)){ notes.push("DOES NOT END IN </html>"); bad++; }
  if (lines < MIN_LINES){ notes.push("ONLY " + lines + " LINES"); bad++; }

  let scripts = 0, broken = 0;
  [...s.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
    if (!m[1].trim()) return;
    scripts++;
    try { new vm.Script(m[1], { filename: v.file + "#" + i }); }
    catch (e){
      broken++; bad++;
      const at = s.slice(0, m.index).split("\n").length;
      notes.push("SCRIPT @line " + at + ": " + e.message);
    }
  });

  const css = [...s.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join("\n");
  const ob = (css.match(/{/g) || []).length, cb = (css.match(/}/g) || []).length;
  if (ob !== cb){ notes.push("CSS BRACES " + ob + "/" + cb); bad++; }
  const od = (s.match(/<div\b/g) || []).length, cd = (s.match(/<\/div>/g) || []).length;
  if (od !== cd){ notes.push("DIVS " + od + "/" + cd); bad++; }

  // Its own namespace, and nobody else's: a copy that kept the source's would
  // read and write another variant's test records.
  if (s.indexOf('var NS = "' + v.ns + '"') < 0){ notes.push("NAMESPACE NOT " + v.ns); bad++; }
  VARIANTS.forEach(o => {
    if (o.ns !== v.ns && s.indexOf('var NS = "' + o.ns + '"') >= 0){
      notes.push("ALSO CARRIES " + o.ns); bad++;
    }
  });

  console.log("  " + v.file.padEnd(17) + String(lines).padStart(6) + " lines, " +
    scripts + " script" + (scripts === 1 ? "" : "s") +
    (broken ? ", " + broken + " BROKEN" : " parse") +
    (notes.length ? "\n      " + notes.join("\n      ") : ""));
}

console.log(bad ? "\nLAB GATE FAILED (" + bad + ")" : "\nLAB GATE PASSED");
process.exitCode = bad ? 1 : 0;
