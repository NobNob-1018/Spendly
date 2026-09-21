/* WHAT IS IN THE FILE AND NOT USED.
 *
 * Four questions, each asked of combined.html:
 *
 *   1. functions declared and never called
 *   2. element ids written in the markup that nothing ever reads
 *   3. functions that are now one line wrapping another function
 *   4. the same helper written out more than once
 *
 * All four are approximations and the output SAYS SO, because this app builds
 * markup from template strings and reads ids out of variables. Anything listed
 * here is a candidate to look at, never a thing to delete on sight.
 *
 * Both blind spots were found by running it. The first pass called 29 live
 * module blocks dead, because they are named IIFEs and a name mentioned once is
 * the same shape as a function nobody calls; and it called 16 live elements
 * unread, because their ids are assembled rather than written. Both are handled
 * below, and what the pass still cannot see is printed with the results.
 */
const fs = require("fs");
/* index.html by default - it is the build, and there is nothing else to point
   at now. Any other HTML file can be passed as an argument. */
const F = process.argv[2] || require("path").join(__dirname, "..", "index.html");
const SRC = fs.readFileSync(F, "utf8");

/* Comments hide false positives in both directions: a name mentioned in a
   comment is not a use, and a rule commented out is not a rule. Masked to spaces
   so every offset stays where it was. */
const mask = (s, re) => s.replace(re, m => " ".repeat(m.length));
const CODE = mask(mask(SRC, /\/\*[\s\S]*?\*\//g), /(^|[^:])\/\/[^\n\r]*/g);

const lineOf = (i) => SRC.slice(0, i).split("\n").length;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c);
const out = { unusedFunctions: [], unusedIds: [], thinWrappers: [], duplicateBodies: [] };

/* ---- 1. functions declared and never called ------------------------------ */
const declared = [];
const fnRe = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
let m;
while ((m = fnRe.exec(CODE))) declared.push({ name: m[1], at: m.index });

/* A NAMED FUNCTION EXPRESSION IS NOT A DECLARATION.

   This file names its module blocks - (function wireSwipe(){ ... })() - so the
   stack trace and the fold marker both say what the block is for. The name is
   then mentioned exactly once, which is the same shape as a function nobody
   calls: 29 live blocks were reported as dead on the first run.

   An expression is invoked where it stands, or handed straight to something that
   will invoke it. Either way it is reachable, so what matters is the character
   before the keyword. */
const isExpression = (at) => {
  const before = CODE.slice(Math.max(0, at - 40), at).replace(/\s+$/, "");
  return /[(=,:?[]$|\breturn$|\b(?:typeof|new|await|yield)$/.test(before);
};

declared.forEach(function(d){
  if (isExpression(d.at)) return;
  const uses = CODE.split(new RegExp("\\b" + esc(d.name) + "\\b")).length - 1;
  if (uses <= 1) out.unusedFunctions.push({ name: d.name, line: lineOf(d.at) });
});

/* ---- 2. ids in the markup that nothing reads ----------------------------- */
const idRe = /\bid="([A-Za-z][-\w]*)"/g;
const ids = new Set();
while ((m = idRe.exec(SRC))) ids.add(m[1]);

/* IDS THE CODE BUILDS RATHER THAN WRITES.

   getElementById(`${kind}-bulk-bar`) reaches a real element and does not contain
   the id being looked for. Sixteen live elements were reported as unread on the
   first run, among them the bulk selection bar and all four date-range filters.

   Each such expression becomes a pattern with the substituted part as a
   wildcard. Deliberately generous: a false "used" costs nothing, a false "dead"
   gets a working control deleted. */
const HOLE = "\u0000";
const builtPatterns = [];
const addPattern = (literal) => {
  const shape = literal
    .replace(/\$\{[^}]*\}/g, HOLE)                         // `${kind}-bulk-bar`
    .replace(/["'`]\s*\+\s*[\w.$]+\s*\+\s*["'`]/g, HOLE)   // "a-" + x + "-b"
    .replace(/["'`]\s*\+\s*[\w.$()]+$/, HOLE)              // "x-" + prefix
    .replace(/^[\w.$()]+\s*\+\s*["'`]/, HOLE)              // prefix + "-x"
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
  if (shape.indexOf(HOLE) < 0) return;
  if (shape.split(HOLE).join("").length < 4) return;       // too loose to mean anything
  builtPatterns.push(new RegExp("^" +
    shape.split(HOLE).map(esc).join("[\\w-]*") + "$"));
};
const builtRe = /getElementById\(\s*([^)]+?)\s*\)|querySelector\(\s*["'`]#([^"'`]+)["'`]\s*\)/g;
let bm;
while ((bm = builtRe.exec(CODE))) addPattern(bm[1] || ("`" + bm[2] + "`"));
const couldBeBuilt = (id) => builtPatterns.some(re => re.test(id));

ids.forEach(id => {
  if (couldBeBuilt(id)) return;
  const q = esc(id);
  const readRe = new RegExp(
    'getElementById\\(\\s*["\']' + q + '["\']' +
    '|#' + q + '\\b' +
    '|["\']' + q + '["\']', "g");
  const hits = (SRC.match(readRe) || []).length;
  /* One hit is the id="..." attribute itself. A label's `for`, an
     aria-labelledby or a CSS rule all show up as a second. */
  const attrHits = (SRC.match(new RegExp('\\bid="' + q + '"', "g")) || []).length;
  if (hits <= attrHits) out.unusedIds.push(id);
});

/* ---- 2b. CSS classes nothing ever wears ---------------------------------- */
/* Where this file's dead weight actually is. A class is USED if its name turns
   up anywhere outside a <style> block - a class attribute, a template string, a
   classList call, a badgeClass value - which is deliberately generous, because a
   false "unused" deletes a live rule.

   Only single-class selectors are reported. A compound like `.a .b` is dead when
   either half is, and saying so twice helps nobody; the halves are each checked
   on their own. */
const styleBlocks = [];
{
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let sm;
  while ((sm = re.exec(SRC))) styleBlocks.push({ css: sm[1], at: sm.index });
}
const cssOnly = styleBlocks.map(b => b.css).join("\n");
/* Everything that is not CSS: where a class name would have to appear to be
   worn by something. */
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

const classNames = new Set();
{
  /* Selector text only - never a declaration, or a colour like #fff and a unit
     like .5em start looking like class names. */
  const blocks = cssOnly.replace(/\/\*[\s\S]*?\*\//g, " ");
  const re = /(^|[\s,>+~{}])\.(-?[_a-zA-Z][\w-]*)/g;
  let cm;
  while ((cm = re.exec(blocks))) classNames.add(cm[2]);
}

const unusedClasses = [];
classNames.forEach(c => {
  /* Word-boundaried, so `stat` does not match `stat-row` and `kpi` does not
     match `kpi-value`. */
  const re = new RegExp("(^|[^\\w-])" + esc(c) + "([^\\w-]|$)");
  if (!re.test(notCss)) unusedClasses.push(c);
});
unusedClasses.sort();

/* ---- 3. one-line wrappers ------------------------------------------------ */
/* A function whose whole body is a call to one other function. Not a defect -
   some exist to give a call site a better name - but a name that no longer says
   what it does is how renderQuickStats came to be called from fifteen places
   while rendering no stats. */
const wrapRe = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{\s*(?:return\s+)?([A-Za-z_$][\w$]*)\s*\(([^;{}]*)\)\s*;?\s*\}/g;
while ((m = wrapRe.exec(CODE))){
  const name = m[1], params = m[2], callee = m[3], args = m[4];
  if (name === callee) continue;
  const calls = CODE.split(new RegExp("\\b" + esc(name) + "\\s*\\(")).length - 1;
  out.thinWrappers.push({
    name: name, callee: callee, line: lineOf(m.index),
    callSites: Math.max(0, calls - 1),
    passesThrough: params.trim() === args.trim()
  });
}

/* ---- 4. the same helper written out more than once ----------------------- */
/* Matched on name AND body: two different functions that happen to share a shape
   are not a duplicate, and the same helper copied into three module scopes is. */
const bodyOf = (at) => {
  const open = CODE.indexOf("{", at);
  let d = 0, i = open, started = false;
  while (i < CODE.length){
    if (CODE[i] === "{"){ d++; started = true; }
    if (CODE[i] === "}"){ d--; if (!d && started) return CODE.slice(open, i + 1); }
    i++;
  }
  return "";
};
const byBody = {};
declared.forEach(function(d){
  const b = bodyOf(d.at).replace(/\s+/g, " ").trim();
  if (b.length < 60) return;
  const key = d.name + "::" + b;
  (byBody[key] = byBody[key] || []).push({ name: d.name, line: lineOf(d.at) });
});
Object.keys(byBody).forEach(k => {
  const g = byBody[k];
  if (g.length > 1){
    out.duplicateBodies.push(g[0].name + " x" + g.length + "  @" +
      g.map(x => x.line).join(", @"));
  }
});

/* ---- report -------------------------------------------------------------- */
const file = F.split(/[\\/]/).pop();
console.log("\n  " + file + "  -  candidates, not verdicts\n");

console.log("  functions never called (" + out.unusedFunctions.length +
  ")   [named IIFEs excluded - they run where they stand]");
out.unusedFunctions.forEach(f => console.log("    " + f.name + "  @" + f.line));
if (!out.unusedFunctions.length) console.log("    none");

console.log("\n  ids in the markup nothing reads (" + out.unusedIds.length + ")");
console.log("    [ids the code assembles are excluded; an element reached only");
console.log("     by class or by a data- attribute is invisible to this pass too]");
out.unusedIds.forEach(id => console.log("    #" + id));
if (!out.unusedIds.length) console.log("    none");

console.log("\n  CSS classes nothing wears (" + unusedClasses.length + ")");
console.log("    [a class is used if its name appears anywhere outside a <style>");
console.log("     block: an attribute, a template string, a classList call]");
{
  /* Grouped by prefix, because dead weight arrives as a whole retired design
     rather than as scattered single rules, and a list of 40 names hides that. */
  const byStem = {};
  unusedClasses.forEach(c => {
    const stem = c.split("-")[0];
    (byStem[stem] = byStem[stem] || []).push(c);
  });
  Object.keys(byStem).sort((a, b) => byStem[b].length - byStem[a].length).forEach(stem => {
    const g = byStem[stem];
    console.log("    ." + g.join("  ."));
  });
  if (!unusedClasses.length) console.log("    none");
}

const worth = out.thinWrappers.filter(w => w.callSites >= 3);
console.log("\n  one-line wrappers called 3+ times (" + worth.length + " of " +
  out.thinWrappers.length + ")");
worth.sort((a, b) => b.callSites - a.callSites).forEach(w =>
  console.log("    " + w.name + " -> " + w.callee + "()   " + w.callSites +
    " call sites  @" + w.line));
if (!worth.length) console.log("    none");

console.log("\n  the same helper written out more than once (" +
  out.duplicateBodies.length + ")");
out.duplicateBodies.forEach(d => console.log("    " + d));
if (!out.duplicateBodies.length) console.log("    none");

console.log("");
