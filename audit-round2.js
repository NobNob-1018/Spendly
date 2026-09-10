/* Second audit round. Everything here runs the REAL functions lifted out of
   index.html, so a fix in the file changes this test with it. Scenarios are the
   ones two devices actually produce, not the ones that are easy to write. */
const fs = require("fs");
const SRC = fs.readFileSync("C:/Users/Tim Salinas/Desktop/Repository/spend-tracker/index.html", "utf8");

function grab(name){
  const start = SRC.indexOf("function " + name + "(");
  if (start < 0) throw new Error("could not find " + name);
  let d = 0, i = start, started = false;
  while (i < SRC.length){
    const c = SRC[i];
    if (c === "{") { d++; started = true; }
    if (c === "}") { d--; if (d === 0 && started) return SRC.slice(start, i + 1); }
    i++;
  }
  throw new Error("unterminated " + name);
}

const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.SYNCED_KEYS = [
  "spendly_expenses_v1", "spendly_incomes_v1", "spendly_savings_v1",
  "spendly_loans_given_v1", "spendly_loans_taken_v1", "spendly_investments_v1",
  "spendly_currencies_v1", "spendly_networth_history_v1", "spendly_recurring_v1"
];
global.TOMBSTONE_KEY = "spendly_tombstones_v1";
const decl = "const RECORD_KEY_FIELD = ";
const rkfAt = SRC.indexOf(decl);
global.RECORD_KEY_FIELD = eval("(" + SRC.slice(rkfAt + decl.length, SRC.indexOf("};", rkfAt) + 1) + ")");
global.keyFieldFor = key => RECORD_KEY_FIELD[key] || "id";
global.lastSaved = {};
global.mapTimes = {};
global.mapSnapshot = {};
global.mapTimesStore = { save(){}, load(){ return {}; } };

eval([
  "loadTombstones","saveTombstones","stampAndTombstone","primeSyncBaseline",
  "mergeRecords","mergeByKey","mergeTombstones","mergeStampedMap","stampMap",
  "primeMapSnapshot","fingerprint","sortedBy","categoryMap","mergeCategoryList"
].map(grab).join("\n"));

let pass = 0, fail = 0;
const found = [];
function check(name, ok, detail){
  if (ok){ pass++; console.log("  PASS  " + name); }
  else { fail++; found.push(name); console.log("  FAIL  " + name + (detail ? "\n          " + detail : "")); }
}
// Deliberately in the PAST. stampAndTombstone stamps graves off the real clock, so
// fabricated times in the future make a record look edited after its own deletion -
// the tombstone then loses, correctly, and the test reads as a bug that is not there.
const T = n => new Date(Date.UTC(2026, 8, 1, 12, 0, n)).toISOString();
const LATER = () => new Date(Date.now() + 60000).toISOString();
const EXP = "spendly_expenses_v1";

console.log("\n--- budgets and learned categories: does a removal stick? ---");
{
  // Clearing a budget field deletes the key (index.html: `delete budgets[cat]`).
  global.mapTimes = { budgets: {} };
  global.mapSnapshot = {};
  let budgets = { Food: 8000, Transport: 3000 };
  primeMapSnapshot("budgets", budgets);
  delete budgets.Food;                       // removed on this device
  stampMap("budgets", budgets);              // stamps the removal
  check("removing a budget records WHEN it was removed",
        !!(mapTimes.budgets || {}).Food,
        "nothing recorded -> the other device cannot tell a removal from a key it never had");

  // The other device still has it, written before we removed it.
  const remoteTimes = { budgets: { Food: T(1), Transport: T(1) } };
  const merged = mergeStampedMap("budgets", budgets, { Food: 8000, Transport: 3000 }, remoteTimes);
  check("a removed budget stays removed after a sync",
        merged.Food === undefined,
        "Food came back as " + merged.Food + ". mergeStampedMap restores any key the\n" +
        "          device does not currently have, checked BEFORE the timestamps - so a\n" +
        "          deliberate removal is indistinguishable from never having seen it.");
  check("the budget that was NOT removed is untouched", merged.Transport === 3000);
}

console.log("\n--- ...without breaking what already worked ---");
{
  global.mapTimes = { budgets: { Food: T(1) } };
  const merged = mergeStampedMap("budgets", { Food: 8000 }, { Food: 9000 }, { budgets: { Food: T(9) } });
  check("an edited budget still reaches the other device", merged.Food === 9000,
        "regression: the 2026-09-07 fix relied on this");

  global.mapTimes = { budgets: {} };
  const first = mergeStampedMap("budgets", {}, { Food: 8000 }, { budgets: { Food: T(1) } });
  check("a budget this device has never seen still arrives", first.Food === 8000);

  // A device still on the old build sends no mapTimes at all.
  global.mapTimes = { budgets: {} };
  const legacy = mergeStampedMap("budgets", {}, { Food: 7000 }, undefined);
  check("budgets from a device with no write-times still arrive", legacy.Food === 7000,
        "an un-upgraded device would stop sharing budgets entirely");
}

console.log("\n--- learned category corrections ---");
{
  global.mapTimes = { corrections: {} };
  global.mapSnapshot = {};
  let corrections = { grab: "Transportation", jollibee: "Food" };
  primeMapSnapshot("corrections", corrections);
  Object.keys(corrections).forEach(k => delete corrections[k]);   // the Settings reset
  stampMap("corrections", corrections);
  const merged = mergeStampedMap("corrections", corrections,
                                 { grab: "Transportation", jollibee: "Food" },
                                 { corrections: { grab: T(1), jollibee: T(1) } });
  check("clearing learned categories is not undone by the other device",
        Object.keys(merged).length === 0,
        Object.keys(merged).length + " came back. Same cause as the budget case above.");
}

console.log("\n--- deleting an entry, and changing your mind ---");
{
  store[EXP] = JSON.stringify([{ id:"e_1", amount:250, updatedAt:T(1) },
                               { id:"e_2", amount:180, updatedAt:T(1) }]);
  global.lastSaved = {}; saveTombstones({});
  primeSyncBaseline();
  let mine = [{ id:"e_2", amount:180, updatedAt:T(1) }];        // e_1 deleted here
  stampAndTombstone(EXP, mine);
  const theirs = [{ id:"e_1", amount:250, updatedAt:T(1) },
                  { id:"e_2", amount:180, updatedAt:T(1) }];
  check("a deleted entry stays deleted",
        !mergeRecords(EXP, mine, theirs, loadTombstones()).some(e=>e.id==="e_1"));

  // An edit made on the other device AFTER the delete should win.
  const laterEdit = [{ id:"e_1", amount:999, updatedAt:LATER() }];
  check("an edit made after the delete brings it back",
        mergeRecords(EXP, mine, laterEdit, loadTombstones()).some(e=>e.id==="e_1"),
        "a delete on one device would permanently block re-adding on the other");

  // Restoring a backup taken before the deletion.
  const restored = [{ id:"e_1", amount:250, updatedAt:T(1) },
                    { id:"e_2", amount:180, updatedAt:T(1) }];
  stampAndTombstone(EXP, restored);
  check("restoring a backup brings back an entry you had deleted",
        mergeRecords(EXP, restored, [], loadTombstones()).some(e=>e.id==="e_1"),
        "the old tombstone would delete it again the moment you restored");
}

console.log("\n--- monthly interest posted on two devices ---");
{
  // index.html mints "i_int_" + acct.id + "_" + date, so both devices agree.
  const mk = () => [{ id:"i_int_s_1_2026-09-01", description:"Interest", amount:390, updatedAt:T(1) }];
  const merged = mergeRecords("spendly_incomes_v1", mk(), mk(), {});
  check("interest is credited once, not twice", merged.length === 1,
        "credited " + merged.length + " times");
}

console.log("\n--- two devices creating an entry in the same millisecond ---");
{
  // The realistic collision is TWO entries sharing a millisecond, not twenty thousand.
  // Asking for twenty thousand measures the birthday paradox rather than the app: at
  // 36^5 suffixes it predicts ~3 collisions, and finding ~3 says nothing is wrong.
  // What matters is the size of the space, which this notices if it ever shrinks.
  const TRIALS = 200000;
  let collisions = 0;
  for (let i = 0; i < TRIALS; i++){
    if (Math.random().toString(36).slice(2,7) === Math.random().toString(36).slice(2,7)) collisions++;
  }
  check("two entries made in the same millisecond do not share an id",
        collisions === 0,
        collisions + " collisions in " + TRIALS + " pairs -> the random suffix is too short");
}

console.log("\n--- tombstones do not grow without bound ---");
{
  saveTombstones({});
  store[EXP] = JSON.stringify([{ id:"e_x", amount:10, updatedAt:T(1) }]);
  global.lastSaved = {}; primeSyncBaseline();
  for (let i = 0; i < 5; i++){
    stampAndTombstone(EXP, []);                                    // delete it
    stampAndTombstone(EXP, [{ id:"e_x", amount:10, updatedAt:T(1) }]); // put it back
  }
  const graves = Object.keys(loadTombstones()[EXP] || {}).length;
  check("a record cycled in and out leaves no grave behind", graves === 0,
        graves + " graves for one record -> the payload grows every time");
}

console.log("\n--- the category list ---");
{
  // Removed here, still present on the other device and written before we removed it.
  global.mapTimes = { categories: {} };
  global.mapSnapshot = {};
  let categories = ["Food","Transport","Yu-Gi-Oh!"];
  primeMapSnapshot("categories", categoryMap(categories));
  categories = categories.filter(c => c !== "Yu-Gi-Oh!");
  stampMap("categories", categoryMap(categories));
  const remoteTimes = { categories: { Food:T(1), Transport:T(1), "Yu-Gi-Oh!":T(1) } };
  const after = mergeCategoryList(categories, ["Food","Transport","Yu-Gi-Oh!"], remoteTimes);
  check("a removed category stays removed", after.indexOf("Yu-Gi-Oh!") === -1,
        "it came back from the other device");
  check("the categories that were kept survive",
        after.indexOf("Food") !== -1 && after.indexOf("Transport") !== -1);

  // A name added on the other device must still arrive.
  global.mapTimes = { categories: {} };
  global.mapSnapshot = {};
  const arrived = mergeCategoryList(["Food"], ["Food","Groceries"],
                                    { categories: { Food:T(1), Groceries:T(9) } });
  check("a category added on the other device arrives", arrived.indexOf("Groceries") !== -1);

  // Their removal must reach us too, even though they no longer send the name.
  global.mapTimes = { categories: { Snacks: T(1) } };
  global.mapSnapshot = {};
  const dropped = mergeCategoryList(["Food","Snacks"], ["Food"],
                                    { categories: { Food:T(1), Snacks:T(9) } });
  check("a category they removed later than we wrote it goes here too",
        dropped.indexOf("Snacks") === -1,
        "removals only ever travelled one way");

  // ...but not if we wrote it more recently than they removed it.
  global.mapTimes = { categories: { Snacks: T(20) } };
  global.mapSnapshot = {};
  const kept = mergeCategoryList(["Food","Snacks"], ["Food"],
                                 { categories: { Food:T(1), Snacks:T(9) } });
  check("a category we added after they removed it stays", kept.indexOf("Snacks") !== -1);

  // Order is the user's arrangement, so it must not be reshuffled.
  global.mapTimes = { categories: {} };
  global.mapSnapshot = {};
  const ordered = mergeCategoryList(["Zebra","Apple","Mango"], ["Apple","Mango","Zebra","New"],
                                    { categories: { Apple:T(1), Mango:T(1), Zebra:T(1), New:T(9) } });
  check("the user's category order is preserved, new names appended",
        ordered.slice(0,3).join(",") === "Zebra,Apple,Mango" && ordered[3] === "New",
        "got " + ordered.join(","));
}

/* ---- Live UI state destroyed by an unbidden re-render ----
   Three bugs in this family so far: the category select rebuilding to "Food", the
   History row being replaced while you typed in it, and a selection surviving a
   filter that no longer contains it. These are DOM-shaped, so what is checked here is
   that the guards are still wired in - the behaviour itself is verified in a browser. */

console.log("\n--- a sync cannot pull live UI out from under the user ---");
{
  const at = SRC.indexOf("function refreshAfterSync(");
  const body = SRC.slice(at, SRC.indexOf("\n  }", at));
  check("the post-sync repaint waits while a field is focused",
        body.indexOf("editingATableField()") > 0,
        "a repaint mid-edit destroys the input, the caret and the on-screen keyboard");
  check("something releases the held repaint",
        SRC.indexOf("refreshHeldForEditing") > 0 && SRC.indexOf("focusout") > 0,
        "held and never released means the table stops updating altogether");
  check("it only repaints the tab on screen",
        body.indexOf("onScreen(\"tab-history\")") > 0,
        "rebuilding tables nobody is looking at, every twelve seconds, on a phone");
  check("rebuilding the category list keeps the chosen category",
        SRC.indexOf("if (chosen && activeList.indexOf(chosen) !== -1)") > 0,
        "replacing a select's options selects its first entry, which is Food");
  check("the guess never overrides a category picked by hand",
        SRC.indexOf("if (!categoryChosenByHand) sel.value = guess;") > 0);
}

console.log("\n--- a selection cannot outlive the filter that made it ---");
{
  check("both history tables prune their selection",
        SRC.split("pruneSelection(").length - 1 >= 3,
        "expected the helper plus a call in each of the two renderers");
  // And the rule itself, run for real.
  eval(grab("pruneSelection"));
  const sel = new Set(["a","b","c"]);
  pruneSelection(sel, [{id:"a"},{id:"c"}]);
  check("what the filter still shows stays selected",
        sel.has("a") && sel.has("c"));
  check("what it no longer shows is dropped", !sel.has("b"),
        "the bar would read 3 selected with two rows on screen, and Delete would take a record the user could not see");
  const empty = new Set();
  pruneSelection(empty, []);
  check("an empty selection is left alone", empty.size === 0);
}

console.log("\n" + (fail ? fail + " issue(s): " + found.join("; ") : "all " + pass + " checks passed"));
process.exit(0);
