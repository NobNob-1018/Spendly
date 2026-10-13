/* WHICH CORE FUNCTIONS NOTHING CHECKS.
 *
 * The five gates and the browser sweep all pass, which says the things they look
 * at are right. It says nothing about the things they do not look at, and that
 * is the question worth asking after a run of green.
 *
 * A function counts as COVERED when a tool names it, or when it is reachable
 * from a control the browser sweep presses. The second half cannot be decided
 * from source, so this reports the first and marks the rest UNNAMED - a list to
 * read, not a verdict. A renderer driven by a tab press is exercised thoroughly
 * and named nowhere.
 *
 * What it is really for: finding whole AREAS with no mention anywhere. A money
 * mover, a merge, a migration or a parser that no tool names is a function whose
 * behaviour nobody has written down an expectation for.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const mask = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n\r]*/g, "$1");
const CODE = mask(SRC);

/* Every function the app declares. */
const declared = [];
{
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(CODE))){
    /* A named function EXPRESSION is a module block, not a unit anybody tests. */
    const before = CODE.slice(Math.max(0, m.index - 40), m.index).replace(/\s+$/, "");
    if (/[(=,:?[]$|\breturn$|\b(?:typeof|new|await|yield)$/.test(before)) continue;
    declared.push(m[1]);
  }
}
const unique = [...new Set(declared)];

/* Everything the tools say. */
const TOOLS = fs.readdirSync(path.join(ROOT, "tools"))
  .filter(f => f.endsWith(".js") && f !== "audit-coverage.js");
const toolText = TOOLS
  .map(f => fs.readFileSync(path.join(ROOT, "tools", f), "utf8"))
  .join("\n");

const named = new Set();
unique.forEach(fn => {
  if (new RegExp("\\b" + fn.replace(/\$/g, "\\$") + "\\b").test(toolText)) named.add(fn);
});

/* The areas worth reporting on, by what a function's name says it does. Money
   and merges first, because those are the ones where being wrong costs a
   number rather than a pixel. */
const AREAS = [
  { k: "money moved",      re: /^(deposit|withdraw|recompute|adopt|attach|movements|accountIdFor|recordMovement)/i },
  { k: "merge and sync",   re: /^(merge|stamp|tombstone|fingerprint|prime|quietSync|syncNow|ghCall|push|pull)/i },
  { k: "loans",            re: /^(logLoanPayment|loanPaymentFor|detachLoanPayment|reattachLoanPayment|applyLoanStatus|relinkLoanBank|interestOf|paymentsOf|nextDueOf)/i },
  { k: "interest",         re: /interest/i },
  { k: "recurring",        re: /recurring/i },
  { k: "money parsing",    re: /^(parseMoney|convertTo|round2|fmtMoney|fmtAxis)/i },
  { k: "backup",           re: /(backup|restore|export|import)/i },
  { k: "archive",          re: /archiv/i },
  { k: "budgets",          re: /budget/i },
  { k: "categories",       re: /categor/i }
];

const bucket = {};
AREAS.forEach(a => { bucket[a.k] = { named: [], unnamed: [] }; });
bucket["everything else"] = { named: [], unnamed: [] };

unique.forEach(fn => {
  const area = AREAS.find(a => a.re.test(fn));
  const b = bucket[area ? area.k : "everything else"];
  (named.has(fn) ? b.named : b.unnamed).push(fn);
});

console.log("\n  index.html — " + unique.length + " declared functions, " +
  named.size + " named by a tool\n");
console.log("  UNNAMED does not mean untested: the browser sweep drives controls,");
console.log("  not function names, so renderers are exercised and never mentioned.");
console.log("  What matters here is an AREA with nothing named in it at all.\n");

Object.keys(bucket).forEach(k => {
  const b = bucket[k];
  if (!b.named.length && !b.unnamed.length) return;
  const total = b.named.length + b.unnamed.length;
  const flag = b.named.length === 0 ? "   <-- nothing in this area is named anywhere" : "";
  console.log("  " + k + "  (" + b.named.length + " of " + total + " named)" + flag);
  if (b.unnamed.length) console.log("      unnamed: " + b.unnamed.sort().join(", "));
  console.log("");
});
