/* Build the shipping app from the lab variant.
 *
 * design-lab/combined.html is the design, wrapped in a harness that exists so it
 * can be opened and thrown away without touching the real Spendly: a storage
 * namespace, a block on every call to GitHub, a service worker kill, invented
 * seed records, and a badge saying which build you are looking at. Every one of
 * those has to come off before it is the app.
 *
 * WHY THE NAMESPACE MATTERS MOST. localStorage is scoped to the ORIGIN, not the
 * path - which is the whole reason the harness prefixes keys in the first place.
 * Take the prefix off and this build reads exactly what the live app reads on
 * that origin: the records, the rail layout, and the device-local GitHub token
 * at spendly_gh_token_v1. Nothing is copied, exported or moved to make that
 * happen, and the token never leaves the browser it was pasted into. It is not
 * in this repository and must never be.
 *
 * Run:  node design-lab/build-production.js [outfile]
 * Default outfile is index.html at the repo root. Re-runnable.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC  = path.join(__dirname, "combined.html");
const OUT  = path.join(ROOT, process.argv[2] || "index.html");

let s = fs.readFileSync(SRC, "utf8");
const before = s.length;

const cut = (from, to, what) => {
  const i = s.indexOf(from);
  if (i < 0) throw new Error("harness marker missing: " + what);
  if (i !== s.lastIndexOf(from)) throw new Error("harness marker ambiguous: " + what);
  s = s.replace(from, to);
};

/* ---- 1. the harness script, whole ---------------------------------------- */
{
  const start = s.indexOf("<!-- ===========================================================================\n     OFFLINE TEST HARNESS");
  if (start < 0) throw new Error("could not find the harness block");
  const close = s.indexOf("\n})();\n</script>\n", start);
  if (close < 0) throw new Error("could not find the end of the harness block");
  const end = close + "\n})();\n</script>\n".length;
  s = s.slice(0, start) + s.slice(end);
}

/* ---- 2. the badge, markup and style -------------------------------------- */
cut([
  '<div id="lab-badge" role="note">',
  '  <strong>TEST BUILD</strong>',
  '  <span>combined</span>',
  '  <small>the aspects picked out of the three — sidebar first</small>',
  '  <button type="button" onclick="__labReset()" title="Wipe this variant\'s test data and reload">reset</button>',
  '</div>',
  ''
].join("\n"), "", "badge markup");

cut([
  '  /* Deliberately not using the app\'s tokens: a redesign must not be able to restyle',
  '     this by accident, or nobody can tell which build they are looking at. */',
  '  #lab-badge{',
  '    position: fixed; z-index: 99999; left: 10px; bottom: 10px;',
  '    display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;',
  '    max-width: calc(100vw - 20px);',
  '    padding: 6px 10px; border-radius: 999px;',
  '    background: #2b1d00; color: #ffd479; border: 1px solid #7a5a12;',
  '    font: 600 11px/1.3 ui-sans-serif, system-ui, sans-serif;',
  '    letter-spacing: .02em; pointer-events: none;',
  '  }',
  '  #lab-badge strong{ letter-spacing: .08em; }',
  '  #lab-badge small{ opacity: .65; font-weight: 500; }',
  '  #lab-badge button{',
  '    pointer-events: auto; cursor: pointer;',
  '    background: transparent; border: 1px solid #7a5a12; color: inherit;',
  '    border-radius: 999px; padding: 1px 7px; font: inherit; font-size: 10px;',
  '  }',
  '  @media (max-width: 720px){',
  '    #lab-badge{ bottom: auto; top: 6px; left: 6px; font-size: 10px; padding: 4px 8px; }',
  '    #lab-badge small{ display: none; }',
  '  }',
  ''
].join("\n"), "", "badge style");

/* ---- 3. the service worker comes back ------------------------------------ */
cut(
  "/* Service worker registration removed: this is an offline test copy. */",
  [
    'if ("serviceWorker" in navigator &&',
    '    (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")){',
    '  window.addEventListener("load", ()=>{',
    '    navigator.serviceWorker.register("./sw.js").catch(()=>{});',
    '  });',
    '}'
  ].join("\n"),
  "service worker registration");

/* ---- 4. the pre-paint reads the real keys only --------------------------- */
cut(
  '      var t = localStorage.getItem(k) || localStorage.getItem("LAB_COMBINED_" + k);',
  '      var t = localStorage.getItem(k);',
  "theme bootstrap");
cut(
  '      var w = parseInt(localStorage.getItem(wk) || localStorage.getItem("LAB_COMBINED_" + wk), 10);',
  '      var w = parseInt(localStorage.getItem(wk), 10);',
  "rail width bootstrap");
cut([
  '<!-- The stored edition, before the first paint. The switch itself lives at the',
  '     bottom of the page with the rest of the app, which is far too late to',
  '     decide this: the header would paint in one edition and flip to the other.',
  '     Two keys, because the lab\'s storage namespace is installed further down and',
  '     has not patched anything yet; in the real app only the plain one exists. -->'
].join("\n"), [
  '<!-- The stored edition, before the first paint. The switch itself lives at the',
  '     bottom of the page with the rest of the app, which is far too late to',
  '     decide this: the header would paint in one edition and flip to the other. -->'
].join("\n"), "bootstrap comment");

/* ---- and then it is checked, because this one is the app ----------------- */
const mustNotContain = [
  ["LAB_COMBINED_",          "the storage namespace"],
  ["__labReset",             "the lab reset hook"],
  ["lab-badge",              "the TEST BUILD badge"],
  ["OFFLINE TEST HARNESS",   "the harness itself"],
  ["Sync is disabled in the design lab", "the block on GitHub"],
  ["spendly_lab_seed_stamp", "the seed stamp"],
  ["design lab",             "any remaining lab wording"]
];
for (const [needle, what] of mustNotContain){
  if (s.indexOf(needle) >= 0) throw new Error("still present after the build: " + what + " (" + needle + ")");
}

const mustContain = [
  ['navigator.serviceWorker.register("./sw.js")', "the service worker registration"],
  ['script.integrity = "sha512-SIMGYRUjwY8+gKg7nn9EItdD8LCADSDfJNutF9TPrvEo86sQmFMh6MyralfIyhADlajSxqc7G0gs7+MwWF/ogQ=="',
   "the Chart.js SRI hash, carried over byte for byte and never recomputed here"],
  ['const GH_TOKEN_KEY = "spendly_gh_token_v1"', "the real token key"],
  ['<link rel="manifest" href="./manifest.webmanifest">', "the manifest link"]
];
for (const [needle, what] of mustContain){
  if (s.indexOf(needle) < 0) throw new Error("missing from the build: " + what);
}

// A token is device-local and belongs in nobody's repository. This is a public
// repo; a build that carried one would publish it.
if (/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/.test(s))
  throw new Error("something that looks like a GitHub token is in the output - refusing to write it");

if (!/<\/html>\s*$/.test(s)) throw new Error("the build does not end in </html>");
if (s.length > before) throw new Error("the build is LARGER than the lab file - the harness cannot have come out");
if (s.length < before * 0.5) throw new Error("the build lost more than half the file");

// Every script has to parse, the same check verify.js makes.
const scripts = [...s.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((body, i) => {
  try { new Function(body); }
  catch (e){ throw new Error("script " + (i + 1) + " does not parse: " + e.message); }
});

fs.writeFileSync(OUT, s);
console.log("  built  " + path.relative(ROOT, OUT));
console.log("         " + s.split("\n").length + " lines, " + scripts.length + " scripts parse");
console.log("         harness out, service worker back, real storage keys");
