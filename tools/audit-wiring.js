/* A wiring auditor: does every control in the markup reach any code?
 *
 * WHY IT EXISTS. `.row-kebab` sat in this file as two CSS rules for weeks. It
 * styled a button that no renderer has ever emitted, and it hid the real row
 * actions in favour of it on every coarse pointer - so the history table's
 * ACTIONS column was empty on every touch device, and nothing said so. The
 * layout auditor cannot see it (there is no element to measure), the contrast
 * auditor cannot see it (no ink), and the gates only check that the file parses.
 *
 * A control that is painted but not wired, and a handler that waits for markup
 * nobody emits, are the same defect seen from two ends. This looks for both.
 *
 * WHAT IT CHECKS
 *   dead-action     data-action="x" in markup with no handler comparing "x"
 *   unheard-action  code comparing an action name that no markup ever emits
 *   dead-id         id="btn-..." (or similar control id) never referenced in JS
 *   phantom-css     a control-looking class styled in CSS but never produced
 *                   by markup or JS - what .row-kebab was
 *   dead-hook       code reading [data-x] that no markup or JS ever sets
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not prove a handler WORKS; it
 * proves the two halves refer to each other. A control can pass this and still
 * do nothing useful, which is what the browser pass is for. It errs towards
 * reporting: everything it prints is read by a person, and a false positive
 * costs a glance while a miss costs a column nobody can use.
 *
 *   node tools/audit-wiring.js
 */
const fs = require("fs"), path = require("path");
/* One file now. This used to sweep four lab variants at once; there is one
   build, and it is the parent directory's index.html. */
const FILES = [process.argv[2] || path.join(__dirname, "..", "index.html")];

// Control classes worth caring about: things a person clicks. A class that only
// ever lays something out is not a control and is not this tool's business.
// `tab-` is deliberately absent: the tab PANELS are #tab-add, #tab-history and
// so on, and a panel is not a control. The tab buttons carry data-tab, which
// the action and hook checks cover.
const CONTROLISH = /^(btn|row-action|row-kebab|nav-(pin|hide|edit|restore|caret|back|key)|arrange-|fab|ico|chip|pill|toggle|step|close|dismiss)/;

let bad = 0;
for (const file of FILES){
  if (!fs.existsSync(file)){ console.log("  " + path.basename(file).padEnd(17) + "MISSING"); bad++; continue; }
  const s = fs.readFileSync(file, "utf8");

  // Split markup from script so "appears in the file" cannot stand in for
  // "appears in code" - that conflation is what let .row-kebab look wired.
  const scripts = [...s.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");
  const styles  = [...s.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join("\n");
  let markup = s;
  [...s.matchAll(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/g)].forEach(m => { markup = markup.replace(m[0], ""); });
  [...s.matchAll(/<style>[\s\S]*?<\/style>/g)].forEach(m => { markup = markup.replace(m[0], ""); });

  const notes = [];
  const uniq = a => [...new Set(a)];
  const inCode = (needle) => scripts.indexOf(needle) >= 0;

  // ---- actions ----------------------------------------------------------
  // Emitted from static markup AND from template strings in code, because most
  // rows are built by a renderer.
  const emitted = uniq([...s.matchAll(/data-action="([a-z-]+)"/g)].map(m => m[1]));
  // Only the two patterns that can ONLY mean an action. A bare `case "j":` is a
  // keyboard handler and `x === "cat"` is a sort column; counting those reported
  // nine handlers for actions that were never actions.
  const handled = uniq([
    ...scripts.matchAll(/dataset\.action\s*===?\s*["']([a-z-]+)["']/g),
    ...scripts.matchAll(/\[data-action=["']?([a-z-]+)/g)
  ].map(m => m[1]));
  emitted.forEach(a => {
    if (!handled.includes(a) && !inCode('"' + a + '"') && !inCode("'" + a + "'"))
      notes.push("dead-action    data-action=\"" + a + "\" is emitted, nothing handles it");
  });
  handled.forEach(a => {
    if (!emitted.includes(a))
      notes.push("unheard-action code handles \"" + a + "\", no markup emits it");
  });

  // ---- control ids ------------------------------------------------------
  const ids = uniq([...s.matchAll(/\bid="([A-Za-z][\w-]*)"/g)].map(m => m[1]));
  ids.filter(id => CONTROLISH.test(id)).forEach(id => {
    if (!inCode('"' + id + '"') && !inCode("'" + id + "'") && !inCode("#" + id))
      notes.push("dead-id        #" + id + " is a control, no code ever looks it up");
  });

  // ---- classes styled but never produced --------------------------------
  const styled = uniq([...styles.matchAll(/\.([a-z][\w-]*)/g)].map(m => m[1]));
  styled.filter(c => CONTROLISH.test(c)).forEach(c => {
    const asAttr = new RegExp('class="[^"]*\\b' + c + '\\b', "");
    const madeInMarkup = asAttr.test(markup);
    const madeInCode = scripts.indexOf(c) >= 0;   // className, classList, template
    if (!madeInMarkup && !madeInCode)
      notes.push("phantom-css    ." + c + " is styled; no markup or code ever puts it on anything");
  });

  // ---- data hooks read but never set ------------------------------------
  const read = uniq([
    ...scripts.matchAll(/closest\(["']\[data-([a-z-]+)\]["']\)/g),
    ...scripts.matchAll(/querySelector(?:All)?\(["']\[data-([a-z-]+)\]["']\)/g)
  ].map(m => m[1]));
  read.forEach(h => {
    const attr = "data-" + h;
    const camel = "dataset." + h.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    // A hook is set four ways, and only one of them has an "=" after it. Six
    // false positives in the first run were all bare boolean attributes
    // (`<button data-edit>`), which is the normal way to write a marker.
    const set =
      s.indexOf(attr + '="') >= 0 ||                          // data-x="v"
      new RegExp(attr + "[\\s>/]").test(s) ||                  // <b data-x> / data-x />
      scripts.indexOf('setAttribute("' + attr + '"') >= 0 ||   // setAttribute
      scripts.indexOf("setAttribute('" + attr + "'") >= 0 ||
      scripts.indexOf(camel + " =") >= 0 ||                    // el.dataset.x = v
      scripts.indexOf(camel + "=") >= 0;
    if (!set) notes.push("dead-hook      code looks for [" + attr + "], nothing ever sets it");
  });

  bad += notes.length;
  console.log("  " + path.basename(file).padEnd(17) +
    emitted.length + " actions, " + ids.filter(i => CONTROLISH.test(i)).length + " control ids" +
    (notes.length ? "\n      " + notes.join("\n      ") : "   all wired"));
}

console.log(bad ? "\nWIRING: " + bad + " to look at" : "\nWIRING CLEAN");
process.exitCode = bad ? 1 : 0;
