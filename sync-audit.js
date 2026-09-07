/* Pulls the REAL merge functions out of index.html and exercises them against the
   two-device scenarios that matter. Nothing here is a reimplementation: if the file
   changes, this test changes with it. */
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

eval(["mergeRecords","mergeTombstones","fingerprint","mergeByKey"].map(grab).join("\n"));

let pass = 0, fail = 0;
function check(name, ok, detail){
  if (ok){ pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (detail ? "\n          " + detail : "")); }
}
const ids = a => a.map(r => r.id).sort().join(",");
const T = n => new Date(Date.UTC(2026, 8, 7, 12, 0, n)).toISOString();

console.log("\n--- Entries: union, no duplicates ---");
{
  const A = [{id:"e1",amount:100,updatedAt:T(1)}, {id:"e2",amount:200,updatedAt:T(2)}];
  const B = [{id:"e1",amount:100,updatedAt:T(1)}, {id:"e3",amount:300,updatedAt:T(3)}];
  const out = mergeRecords("spendly_expenses_v1", A, B, {});
  check("both devices' entries survive", ids(out) === "e1,e2,e3", "got " + ids(out));
  check("a record held by both appears exactly once", out.filter(r=>r.id==="e1").length === 1);
  check("merging twice changes nothing (idempotent)",
        ids(mergeRecords("k", out, B, {})) === "e1,e2,e3");
}
{
  const A = [{id:"e1",amount:100,updatedAt:T(5)}];
  const B = [{id:"e1",amount:999,updatedAt:T(9)}];
  check("the later edit wins", mergeRecords("k",A,B,{})[0].amount === 999);
  check("...whichever side it is merged from", mergeRecords("k",B,A,{})[0].amount === 999);
}
{
  const A = [{id:"e1",amount:100}];                       // written before sync existed
  const B = [{id:"e1",amount:555,updatedAt:T(4)}];
  check("a stamped record beats an unstamped one", mergeRecords("k",A,B,{})[0].amount === 555);
}

console.log("\n--- Deletion ---");
{
  const out = mergeRecords("k", [{id:"e1",updatedAt:T(1)}],
                                [{id:"e1",updatedAt:T(1)},{id:"e2",updatedAt:T(2)}],
                                { k:{ e2:T(6) } });
  check("deleted on one device stays deleted", ids(out) === "e1", "got " + ids(out));
}
{
  const out = mergeRecords("k", [], [{id:"e2",updatedAt:T(8)}], { k:{ e2:T(3) } });
  check("an edit made AFTER the delete survives", ids(out) === "e2", "got " + ids(out));
}
{
  const m = mergeTombstones({k:{a:T(1)}}, {k:{a:T(5), b:T(2)}});
  check("tombstones union, keeping the later time", m.k.a === T(5) && m.k.b === T(2));
}

console.log("\n--- Record types with no id (net worth, currencies) ---");
{
  const nwh = [{date:"2026-09-01",netWorth:400000},{date:"2026-09-02",netWorth:401200}];
  const cur = [{code:"USD",rate:58.2,lastUpdated:"2026-09-05"}];
  check("net-worth points survive a sync", mergeByKey(nwh,nwh,"date",null).length === 2);
  check("currencies survive a sync", mergeByKey(cur,cur,"code","lastUpdated").length === 1);
  check("net-worth points from both devices union by date",
        mergeByKey(nwh,[{date:"2026-09-03",netWorth:399800}],"date",null).length === 3);
  check("the more recently synced rate wins",
        mergeByKey(cur,[{code:"USD",rate:59.9,lastUpdated:"2026-09-06"}],"code","lastUpdated")[0].rate === 59.9);
  check("an older rate does not clobber a newer one",
        mergeByKey(cur,[{code:"USD",rate:1,lastUpdated:"2026-01-01"}],"code","lastUpdated")[0].rate === 58.2);
  check("an id-keyed merge still rejects a malformed record (correct for that type)",
        mergeRecords("k",[{id:"e1"},{amount:50}],[],{}).length === 1);
}

console.log("\n--- fingerprint: does it notice every real change? ---");
{
  const base = { expenses: [], writtenAt: T(1) };
  for (let i = 0; i < 400; i++) base.expenses.push({id:"e"+i, description:"Entry number "+i,
    amount:1000+i, category:"Food", account:"BPI", tags:[], updatedAt:T(1)});
  const size = JSON.stringify(base).length;
  const far = JSON.parse(JSON.stringify(base)); far.expenses[399].amount = 9999;
  check("notices an edit at the END of a " + size + "-char payload",
        fingerprint(base) !== fingerprint(far),
        "identical fingerprints -> the push is SKIPPED and that edit never leaves the device");
  const near = JSON.parse(JSON.stringify(base)); near.expenses[0].amount = 9999;
  check("notices an edit at the start", fingerprint(base) !== fingerprint(near));
  const del = JSON.parse(JSON.stringify(base)); del.expenses.pop();
  check("notices a deletion", fingerprint(base) !== fingerprint(del));
  const same = JSON.parse(JSON.stringify(base)); same.writtenAt = T(50);
  check("does NOT fire on writtenAt alone (would push on every poll)",
        fingerprint(base) === fingerprint(same));
}

/* ---- The three failures reported from real two-device use, 2026-09-07 ---- */

console.log("\n--- the boot baseline is primed before anything can save ---");
{
  // processRecurringExpenses() and processSavingsInterest() save a synced store when
  // they post. If primeSyncBaseline() has not run yet, stampAndTombstone sees an empty
  // baseline, reads every existing record as new, and re-stamps the whole device as
  // edited just now - so it wins every merge and reverts the other device edits.
  const primed   = SRC.indexOf("\n  primeSyncBaseline();");
  const posts    = SRC.indexOf("\n  processRecurringExpenses();");
  const interest = SRC.indexOf("\n  processSavingsInterest();");
  check("primeSyncBaseline() is called at all", primed > 0);
  check("it runs before processRecurringExpenses()", primed > 0 && posts > 0 && primed < posts,
        "a boot that posts a recurring charge re-stamps every record and wins every merge");
  check("it runs before processSavingsInterest()", primed > 0 && interest > 0 && primed < interest,
        "a boot that posts monthly interest does the same");
}

console.log("\n--- GitHub reads are never served from the browser cache ---");
{
  // GitHub answers an authenticated GET with Cache-Control: private, max-age=60, and
  // the fetch() default honours it - so a poll can merge against a minute-old gist.
  const callAt = SRC.indexOf("async function ghCall(");
  const call = SRC.slice(callAt, callAt + 900);
  check("ghCall passes cache: no-store", call.indexOf("cache: \"no-store\"") > 0,
        "a cached read merges against a stale gist, and the push that follows erases");
  check("the truncated-file read is uncached too",
        SRC.indexOf("fetch(f.raw_url, { cache: \"no-store\" })") > 0);
}

console.log("\n--- a clobbered entry comes back instead of being lost forever ---");
{
  // The old gate compared our payload with what WE last pushed. A push replaces the
  // whole gist file, so once another device overwrote it without our records we saw
  // no local change, skipped, and never sent them again.
  const gateAt = SRC.indexOf("const outgoing = syncPayload();");
  const gate = SRC.slice(gateAt, gateAt + 900);
  check("the push gate compares against the gist that was just read",
        gate.indexOf("print === fingerprint(remote)") > 0,
        "comparing against our own last push loses any record another device overwrote");
  check("lastPushedPrint is gone", SRC.indexOf("lastPushedPrint") === -1);

  // And end to end, with the real merge and the real fingerprint.
  eval(grab("sortedBy"));
  let gist = null;
  const dev = (expenses)=>({ expenses,
    sync(stale){
      const remote = stale !== undefined ? stale : gist;
      if (remote) this.expenses = mergeRecords("spendly_expenses_v1", this.expenses, remote.expenses, {});
      const out = { v:2, writtenAt:new Date().toISOString(), expenses: sortedBy(this.expenses, "id") };
      if (gist && fingerprint(out) === fingerprint(gist)) return "skipped";
      gist = JSON.parse(JSON.stringify(out)); return "pushed";
    }});
  const base = [{ id:"e_1", amount:250, updatedAt:T(1) }];
  const phone = dev(JSON.parse(JSON.stringify(base)));
  const desk  = dev(JSON.parse(JSON.stringify(base)));
  phone.sync(); desk.sync();
  const staleCopy = JSON.parse(JSON.stringify(gist));
  phone.expenses.push({ id:"e_new", amount:640, updatedAt:T(9) });
  phone.sync();
  desk.sync(staleCopy);                 // reads a stale gist and overwrites the file
  check("a stale-read push does drop the entry from the gist (the hazard is real)",
        !gist.expenses.some(e=>e.id==="e_new"));
  phone.sync();                         // fresh read: notices the gist is missing it
  desk.sync();
  check("the owning device notices and sends it again",
        gist.expenses.some(e=>e.id==="e_new"));
  check("the other device ends up with it",
        desk.expenses.some(e=>e.id==="e_new"),
        "still missing -> an entry logged on the phone never reaches the desktop");

  let writes = 0; gist = null;
  const A = dev([{id:"e_1",amount:250,updatedAt:T(1)},{id:"e_2",amount:180,updatedAt:T(1)}]);
  const B = dev([{id:"e_2",amount:180,updatedAt:T(1)},{id:"e_1",amount:250,updatedAt:T(1)}]);
  if (A.sync() === "pushed") writes++;
  for (let i=0;i<6;i++){ if (B.sync()==="pushed") writes++; if (A.sync()==="pushed") writes++; }
  check("two idle devices listing the same data differently do not write forever",
        writes === 1,
        writes + " writes over 12 idle polls - each device reads the other order as a change");
}

console.log("\n--- removing a tracked currency stays removed ---");
{
  // A currency has no id - it IS its code - so it fell straight through
  // stampAndTombstone, which only ever looked at rec.id. Never stamped, never
  // tombstoned: removing one left no trace and the next sync unioned it back in
  // from the other device.
  const cstore = {};
  global.localStorage = {
    getItem: k => (k in cstore ? cstore[k] : null),
    setItem: (k,v) => { cstore[k] = String(v); },
    removeItem: k => { delete cstore[k]; }
  };
  const KEY = "spendly_currencies_v1";
  global.SYNCED_KEYS = [KEY];
  global.TOMBSTONE_KEY = "spendly_tombstones_v1";
  const decl = "const RECORD_KEY_FIELD = ";
  const rkfAt = SRC.indexOf(decl);
  check("index.html declares which field names a record", rkfAt > 0);
  global.RECORD_KEY_FIELD = eval("(" + SRC.slice(rkfAt + decl.length, SRC.indexOf("};", rkfAt) + 1) + ")");
  check("currencies are declared as keyed by code", RECORD_KEY_FIELD[KEY] === "code");
  global.keyFieldFor = key => RECORD_KEY_FIELD[key] || "id";
  global.lastSaved = {};
  eval(["loadTombstones","saveTombstones","stampAndTombstone","primeSyncBaseline"].map(grab).join("\n"));

  let mine = [{ code:"PHP", rate:1, lastUpdated:"2026-09-01" },
              { code:"USD", rate:58.2, lastUpdated:"2026-09-01" }];
  const theirs = JSON.parse(JSON.stringify(mine));   // the other device still has both
  cstore[KEY] = JSON.stringify(mine);
  primeSyncBaseline();

  mine = mine.filter(c => c.code !== "USD");         // exactly what Remove does
  stampAndTombstone(KEY, mine);
  const graves = loadTombstones()[KEY] || {};
  check("removing a currency writes a tombstone", !!graves.USD,
        "no grave -> nothing tells the other device it was removed");

  const merged = mergeByKey(mine, theirs, "code", "lastUpdated", KEY, loadTombstones());
  check("it is still gone after syncing with a device that has it",
        !merged.some(c => c.code === "USD"),
        "it came back - the removal did not survive the union");
  check("removing one currency does not take the others with it",
        merged.some(c => c.code === "PHP"));

  // lastUpdated is only a date, so it could not tell "removed this morning" from
  // "added again this afternoon". updatedAt carries a time, which is why the
  // tombstone check prefers it.
  const readded = mine.concat([{ code:"USD", rate:58.9, lastUpdated:"2026-09-07" }]);
  stampAndTombstone(KEY, readded);
  check("adding it back the same day sticks",
        mergeByKey(readded, [], "code", "lastUpdated", KEY, loadTombstones()).some(c=>c.code==="USD"),
        "the tombstone outranks the new record and you cannot re-add it that day");

  // The baseline has to name records the same way the stamper does, or currencies
  // look brand new every boot and re-stamp themselves as the freshest edit - the bug
  // that reverted a category and an amount.
  const OLD = "2026-09-01T08:00:00.000Z";
  const held = [{ code:"PHP", rate:1, lastUpdated:"2026-09-01", updatedAt: OLD }];
  cstore[KEY] = JSON.stringify(held);
  global.lastSaved = {};
  primeSyncBaseline();
  stampAndTombstone(KEY, held);
  check("an untouched currency is not re-stamped on the next save",
        held[0].updatedAt === OLD,
        "re-stamped to " + held[0].updatedAt + " -> it would win every merge it joins");
}

console.log("\n" + (fail ? "FAILURES: " + fail : "all " + pass + " checks passed"));
process.exit(fail ? 1 : 0);
