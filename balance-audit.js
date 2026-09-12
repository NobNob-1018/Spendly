/* Does an account balance survive two devices spending at once?
   Runs the REAL functions out of index.html: the ledger arithmetic, the migration,
   and the same union merge sync uses. */
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

global.round2 = v => Math.round((Number(v) || 0) * 100) / 100;
eval([ "recomputeBalances", "adoptOpeningBalances", "mergeRecords" ].map(grab).join("\n"));

let pass = 0, fail = 0;
function check(name, ok, detail){
  if (ok){ pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (detail ? "\n          " + detail : "")); }
}

// The two globals the extracted functions read and write.
global.savings = [];
global.balanceOps = [];
global.saveSavings = () => {};

let seq = 0;
const move = (account, delta) => ({ id: "bo_" + (++seq), account, delta, at: "2026-09-10T0" + seq + ":00:00Z" });
const OPS = "spendly_balance_ops_v1";

console.log("\n--- the reported bug: both devices spend before syncing ---");
{
  const OPENING = 187000;
  // Both devices start in step, holding the same account and no movements yet.
  const start = () => ({
    savings: [{ id:"s_1", provider:"BPI", opening: OPENING, amount: OPENING }],
    ops: []
  });
  const phone = start(), desktop = start();

  // Phone: groceries 640. Desktop, a minute later: lunch 250. Neither has synced.
  phone.ops.push(move("BPI", -640));
  desktop.ops.push(move("BPI", -250));

  const withState = (dev) => { global.savings = dev.savings; global.balanceOps = dev.ops; recomputeBalances(); return dev.savings[0].amount; };
  const phoneAlone = withState(phone);
  const deskAlone  = withState(desktop);
  check("each device is right on its own", phoneAlone === 186360 && deskAlone === 186750,
        "phone " + phoneAlone + ", desktop " + deskAlone);

  // Sync: movements union by id, then the balance is worked out.
  const merged = mergeRecords(OPS, phone.ops, desktop.ops, {});
  global.savings = [{ id:"s_1", provider:"BPI", opening: OPENING, amount: 999999 }];
  global.balanceOps = merged;
  recomputeBalances();
  const after = global.savings[0].amount;

  check("both movements survive the merge", merged.length === 2, "kept " + merged.length);
  check("the balance matches the arithmetic", after === 187000 - 890,
        "shows " + after + ", should be " + (187000 - 890) +
        " (out by " + (after - (187000 - 890)) + ")");
  check("the stale cached balance is overwritten, not trusted", after !== 999999);
}

console.log("\n--- and it does not care which order they sync in ---");
{
  const OPENING = 50000;
  const a = [move("BPI", -100), move("BPI", -250)];
  const b = [move("BPI", -640), move("BPI", 1200)];
  const run = (x, y) => {
    global.savings = [{ id:"s_1", provider:"BPI", opening: OPENING, amount: 0 }];
    global.balanceOps = mergeRecords(OPS, x, y, {});
    recomputeBalances();
    return global.savings[0].amount;
  };
  const one = run(a, b), other = run(b, a);
  check("same answer whichever device merges first", one === other, one + " vs " + other);
  check("and it is the right answer", one === 50000 - 100 - 250 - 640 + 1200, "got " + one);
}

console.log("\n--- merging twice must not count anything twice ---");
{
  global.savings = [{ id:"s_1", provider:"BPI", opening: 1000, amount: 0 }];
  const mine = [move("BPI", -300)], theirs = [move("BPI", -200)];
  let m = mergeRecords(OPS, mine, theirs, {});
  m = mergeRecords(OPS, m, theirs, {});
  m = mergeRecords(OPS, m, mine, {});
  global.balanceOps = m;
  recomputeBalances();
  check("three merges of the same movements still say 500", global.savings[0].amount === 500,
        "got " + global.savings[0].amount + " from " + m.length + " movements");
}

console.log("\n--- upgrading: nobody's balance may move ---");
{
  // What every existing account looks like right now: a balance, no opening figure.
  global.savings = [
    { id:"s_1", provider:"BPI",   amount: 187000 },
    { id:"s_2", provider:"GCash", amount: 4210.55 }
  ];
  global.balanceOps = [];
  adoptOpeningBalances();
  recomputeBalances();
  check("balances are untouched by the upgrade",
        global.savings[0].amount === 187000 && global.savings[1].amount === 4210.55,
        "became " + global.savings.map(a=>a.amount).join(", "));
  check("each account took its balance as its opening figure",
        global.savings[0].opening === 187000 && global.savings[1].opening === 4210.55);

  // And a movement after the upgrade behaves normally.
  global.balanceOps = [move("BPI", -1000)];
  recomputeBalances();
  check("spending after the upgrade comes off the right figure", global.savings[0].amount === 186000,
        "got " + global.savings[0].amount);
}

console.log("\n--- a correction typed by hand ---");
{
  global.savings = [{ id:"s_1", provider:"BPI", opening: 1000, amount: 0 }];
  const spend = move("BPI", -250);
  global.balanceOps = [spend];
  recomputeBalances();
  const shown = global.savings[0].amount;              // 750
  // Typing 900 records the difference, not the total.
  global.balanceOps.push(move("BPI", 900 - shown));
  recomputeBalances();
  check("typing a balance lands on that balance", global.savings[0].amount === 900,
        "got " + global.savings[0].amount);
  // The other device holds the SAME spend - same id, because that is how it reached
  // them - but has not seen the correction yet. Merging must not double the spend.
  global.balanceOps = mergeRecords(OPS, [spend], global.balanceOps, {});
  recomputeBalances();
  check("the correction survives a sync and nothing is applied twice",
        global.savings[0].amount === 900, "got " + global.savings[0].amount);
}

console.log("\n--- pennies ---");
{
  global.savings = [{ id:"s_1", provider:"BPI", opening: 0.1, amount: 0 }];
  global.balanceOps = [move("BPI", 0.2)];
  recomputeBalances();
  check("0.1 + 0.2 is 0.3, not 0.30000000000000004",
        global.savings[0].amount === 0.3, "got " + global.savings[0].amount);
}

console.log("\n--- an account with no movements, and one with no account ---");
{
  global.savings = [{ id:"s_1", provider:"BPI", opening: 500, amount: 0 }];
  global.balanceOps = [move("Maya Bank", -100)];   // an account that is not here
  recomputeBalances();
  check("movements for an account this device does not have are ignored, not lost",
        global.savings[0].amount === 500 && global.balanceOps.length === 1,
        "got " + global.savings[0].amount);
}

console.log("\n--- spending 50 must never take off 100 ---");
{
  // Reported from a phone. adoptOpeningBalances assumed an account with no opening
  // figure had no movements yet - true the first time, false ever afterwards. Once a
  // record lost its opening figure, adoption handed back the CURRENT balance and the
  // recompute applied every movement a second time.
  global.savings = [{ id:"s_1", provider:"BPI", amount: 950 }];   // net, no opening
  global.balanceOps = [move("BPI", -50)];                         // the 50 is recorded
  adoptOpeningBalances();
  recomputeBalances();
  check("a 50 spend still shows as 50 off, not 100",
        global.savings[0].amount === 950,
        "shows " + global.savings[0].amount + " - the movements were applied twice");
  check("the opening figure was worked backwards from the balance",
        global.savings[0].opening === 1000,
        "got " + global.savings[0].opening + ", expected 1000");

  // And doing it again changes nothing.
  adoptOpeningBalances();
  recomputeBalances();
  check("adopting twice does not move the balance again", global.savings[0].amount === 950,
        "got " + global.savings[0].amount);
}

console.log("\n--- an account written by a device on the older build ---");
{
  // That build knows nothing about opening figures, so a merge can hand one back
  // without one. Treating it as opening at zero made the balance the ledger sum.
  global.savings = [{ id:"s_1", provider:"BPI", opening: 1000, amount: 950, updatedAt:"2026-09-10T00:00:00Z" }];
  global.balanceOps = [move("BPI", -50)];
  const fromOldBuild = [{ id:"s_1", provider:"BPI", amount: 950, updatedAt:"2026-09-11T00:00:00Z" }];
  global.savings = mergeRecords("spendly_savings_v1", global.savings, fromOldBuild, {});
  check("the merge really can drop the opening figure (the hazard is real)",
        global.savings[0].opening === undefined);
  adoptOpeningBalances();
  recomputeBalances();
  check("the balance survives it", global.savings[0].amount === 950,
        "got " + global.savings[0].amount);
}

console.log("\n--- the order the app actually does it in ---");
{
  // syncNow must adopt BEFORE recomputing, or a merged account looks as though it
  // opened at zero.
  const at = SRC.indexOf("function syncNow(");
  const body = SRC.slice(at, SRC.indexOf("\n  }", at));
  const adoptAt = body.indexOf("adoptOpeningBalances()");
  const recomputeAt = body.indexOf("recomputeBalances()");
  check("syncNow adopts before it recomputes",
        adoptAt > 0 && recomputeAt > 0 && adoptAt < recomputeAt,
        "adopt at " + adoptAt + ", recompute at " + recomputeAt);

  const boot = SRC.indexOf("  adoptOpeningBalances();\n  recomputeBalances();");
  check("boot does the same, before anything posts", boot > 0);
}

console.log("\n" + (fail ? fail + " FAILURE(S)" : "all " + pass + " checks passed"));
process.exit(fail ? 1 : 0);
