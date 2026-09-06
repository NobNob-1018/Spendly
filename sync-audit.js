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

console.log("\n" + (fail ? "FAILURES: " + fail : "all " + pass + " checks passed"));
process.exit(fail ? 1 : 0);
