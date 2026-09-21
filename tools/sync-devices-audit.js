/* TWO DEVICES, RECORDS THE APP ITSELF WROTE.
 *
 * sync-audit.js exercises the merge against hand-built records. This one starts
 * from records the running app produced - a loan carrying a real payments[]
 * ledger, an interest income with its deterministic id, entries with the exact
 * field set addExpense writes - and asks the question the user asked: after both
 * devices have been used and then synced, is anything duplicated, and is anything
 * lost?
 *
 * Nothing here is a reimplementation: the merge functions are pulled out of
 * index.html, so this test goes stale the moment the file does.
 */
const fs = require("fs");
const SRC = fs.readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8");

function grab(name){
  const start = SRC.indexOf("function " + name + "(");
  if (start < 0) throw new Error("could not find " + name);
  let d = 0, i = start, started = false;
  while (i < SRC.length){
    const c = SRC[i];
    if (c === "{"){ d++; started = true; }
    if (c === "}"){ d--; if (d === 0 && started) return SRC.slice(start, i + 1); }
    i++;
  }
  throw new Error("unterminated " + name);
}
/* mergeLedger and round2 come too: the merge depends on both now, and a test
   that stubbed either would be checking its own arithmetic rather than the
   app's. */
eval(["mergeRecords", "mergeTombstones", "fingerprint", "mergeByKey",
      "mergeLedger", "round2"].map(grab).join("\n"));

/* A const, so it comes out by slice rather than by brace-matching a function.
   Its absence is a failure in its own right: without it loans merge by whole
   record again and a payment goes missing on every two-device repayment. */
const ledgerAt = SRC.indexOf("const LEDGER_FIELD = {");
if (ledgerAt < 0) throw new Error("LEDGER_FIELD is gone - loans merge by whole record again");
const LEDGER_FIELD = eval("(" +
  SRC.slice(SRC.indexOf("{", ledgerAt), SRC.indexOf("};", ledgerAt) + 1) + ")");
if (LEDGER_FIELD["spendly_loans_given_v1"] !== "payments" ||
    LEDGER_FIELD["spendly_loans_taken_v1"] !== "payments"){
  throw new Error("both loan stores must name payments as their ledger");
}

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok){ pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (detail ? "\n          " + detail : "")); }
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const ids = (a) => a.map(r => r.id).sort().join(",");
const dupes = (a) => {
  const seen = {}, out = [];
  a.forEach(r => { if (seen[r.id]) out.push(r.id); seen[r.id] = 1; });
  return out;
};
const at = (n) => new Date(Date.UTC(2026, 8, 21, 3, 13, n)).toISOString();

/* The real thing, straight off a run of the app. */
const LOAN = {
  id: "lg_1789960383000_emi76", person: "Borrower", amount: 8000,
  dateGiven: "2026-09-21", deadline: "", status: "outstanding", bank: "Test Bank",
  notes: "", repayMonthly: false, repayDay: null, interestKind: "flat",
  interestRate: 5, reference: "", payments: [], updatedAt: at(0),
  originalAmount: null
};
const ENTRY = (id, desc, amount, when) => ({
  id, description: desc, amount, category: "Other", notes: "", date: "2026-09-21",
  bank: "Test Bank", originalAmount: null, originalCurrency: null, updatedAt: when
});

console.log("\n--- both devices used, then synced: entries ---");
{
  const shared = ENTRY("e_shared", "Groceries", 500, at(1));
  const A = [clone(shared), ENTRY("e_a1", "Bus fare", 30, at(2))];
  const B = [clone(shared), ENTRY("e_b1", "Coffee", 120, at(3))];

  const onA = mergeRecords("spendly_expenses_v1", A, B, {});
  const onB = mergeRecords("spendly_expenses_v1", B, A, {});
  check("nothing is duplicated", dupes(onA).length === 0, dupes(onA).join(","));
  check("nothing is lost", ids(onA) === "e_a1,e_b1,e_shared", ids(onA));
  check("both devices end up identical", ids(onA) === ids(onB), ids(onA) + " vs " + ids(onB));
  check("syncing again changes nothing",
    ids(mergeRecords("spendly_expenses_v1", onA, onB, {})) === ids(onA));
}

console.log("\n--- the same spend typed on BOTH devices ---");
{
  /* Two different records describing one purchase. The app cannot tell these
     apart and must not try: they have different ids because they are different
     records, and silently collapsing them would delete a real entry. What it must
     not do is turn ONE record into two. */
  const A = [ENTRY("e_a", "Lunch", 250, at(4))];
  const B = [ENTRY("e_b", "Lunch", 250, at(4))];
  const out = mergeRecords("spendly_expenses_v1", A, B, {});
  check("two separate records stay two records", out.length === 2, out.length);
  check("and neither is a copy of the other", out[0].id !== out[1].id);
}

console.log("\n--- interest posted on both devices before they met ---");
{
  /* The id is built from the account and the month, so the same month posted
     independently on two devices is the same id. This is the one place where two
     records SHOULD collapse into one. */
  const int = (n) => ({
    id: "i_int_sv_seed_interest_2026-08-31",
    description: "Interest - Interest Bank (August 2026)", amount: 401.6,
    category: "Other Income", date: "2026-08-31", bank: "Interest Bank",
    originalAmount: null, originalCurrency: null, notes: "", updatedAt: at(n)
  });
  const out = mergeRecords("spendly_incomes_v1", [int(5)], [int(6)], {});
  check("interest for one month lands once, not twice", out.length === 1, out.length);
  check("the money is not doubled",
    out.reduce((s, r) => s + r.amount, 0) === 401.6,
    out.reduce((s, r) => s + r.amount, 0));
}

console.log("\n--- a loan repaid a bit on each device ---");
{
  /* THE ONE THAT MATTERS. A loan carries its payment ledger INSIDE the record,
     and mergeRecords picks a whole record by updatedAt. So two payments made
     before the devices met are not merged - the later record wins entire. */
  const onPhone = clone(LOAN);
  onPhone.payments = [{ id: "pay_phone", date: "2026-09-21", amount: 3000,
    note: "", entryId: null, bank: "Test Bank" }];
  onPhone.amount = 5000;
  onPhone.originalAmount = 8000;
  onPhone.updatedAt = at(10);

  const onLaptop = clone(LOAN);
  onLaptop.payments = [{ id: "pay_laptop", date: "2026-09-21", amount: 2000,
    note: "", entryId: null, bank: "Test Bank" }];
  onLaptop.amount = 6000;
  onLaptop.originalAmount = 8000;
  onLaptop.updatedAt = at(11);          // the laptop saved a moment later

  const merged = mergeRecords("spendly_loans_given_v1", [onPhone], [onLaptop], {});
  const loan = merged[0];
  const payIds = loan.payments.map(p => p.id).sort().join(",");

  check("the loan is still one record", merged.length === 1, merged.length);
  check("both payments survive the merge",
    payIds === "pay_laptop,pay_phone",
    "kept [" + payIds + "] - the other payment is gone");
  check("the outstanding reflects both payments",
    loan.amount === 3000,
    "outstanding " + loan.amount + ", expected 8000 - 3000 - 2000 = 3000");
  check("no payment is recorded twice",
    loan.payments.length === new Set(loan.payments.map(p => p.id)).size,
    loan.payments.map(p => p.id).join(","));
}

console.log("\n--- one device thinks the loan is settled, the other does not ---");
{
  /* The phone took the last payment it knew about and called the loan repaid. It
     was working from half the ledger. With both halves in hand the sum decides,
     not whichever device saved last. */
  const phone = clone(LOAN);
  phone.payments = [{ id: "pay_p", date: "2026-09-21", amount: 8000, note: "", bank: null }];
  phone.amount = 0; phone.originalAmount = 8000; phone.status = "repaid";
  phone.repaidOn = "2026-09-21"; phone.updatedAt = at(50);

  const laptop = clone(LOAN);
  laptop.payments = [{ id: "pay_l", date: "2026-09-20", amount: 1000, note: "", bank: null }];
  laptop.amount = 7000; laptop.originalAmount = 8000; laptop.updatedAt = at(51);

  const out = mergeRecords("spendly_loans_given_v1", [phone], [laptop], {})[0];
  check("both payments are kept", out.payments.length === 2, out.payments.length);
  check("the loan stays settled once the payments cover it",
    out.status === "repaid" && out.amount === 0,
    out.status + " / " + out.amount);

  /* The mirror, and the one that loses money: neither half covers the loan, but
     one device called it repaid anyway. Left alone it falls off the outstanding
     list with 5,000 still on it. */
  const early = clone(LOAN);
  early.payments = [{ id: "pay_e", date: "2026-09-19", amount: 2000, note: "", bank: null }];
  early.amount = 0; early.originalAmount = 8000; early.status = "repaid";
  early.repaidOn = "2026-09-19"; early.updatedAt = at(53);
  const other = clone(LOAN);
  other.payments = [{ id: "pay_o", date: "2026-09-18", amount: 1000, note: "", bank: null }];
  other.amount = 7000; other.originalAmount = 8000; other.updatedAt = at(52);

  const out2 = mergeRecords("spendly_loans_given_v1", [early], [other], {})[0];
  check("a loan marked settled too early goes back to outstanding",
    out2.status === "outstanding" && out2.amount === 5000,
    out2.status + " / " + out2.amount + " (8000 - 2000 - 1000 = 5000)");
  check("and the settled date is cleared with it",
    !out2.repaidOn, out2.repaidOn);
}

console.log("\n--- a note added on one device, an amount fixed on the other ---");
{
  /* Same shape of hazard on a plain entry, and here it is harmless: the fields
     are independent scalars, so last-write-wins loses the earlier EDIT but never
     a whole record. Worth pinning so the distinction stays visible. */
  const a = ENTRY("e_x", "Dinner", 900, at(20)); a.notes = "with Ana";
  const b = ENTRY("e_x", "Dinner", 950, at(21));
  const out = mergeRecords("spendly_expenses_v1", [a], [b], {});
  check("one record, not two", out.length === 1);
  check("the later save wins outright", out[0].amount === 950 && out[0].notes === "",
    JSON.stringify({ amount: out[0].amount, notes: out[0].notes }));
}

console.log("\n--- a deletion on one device, an edit on the other ---");
{
  const a = [ENTRY("e_d", "Taxi", 200, at(30))];
  const b = [];
  const tomb = { "spendly_expenses_v1": { e_d: at(31) } };
  check("a delete later than the edit sticks",
    mergeRecords("spendly_expenses_v1", a, b, tomb).length === 0);
  const a2 = [ENTRY("e_d", "Taxi", 260, at(32))];
  check("an edit later than the delete brings it back",
    mergeRecords("spendly_expenses_v1", a2, b, tomb).length === 1);
}

console.log("\n--- balance movements, which are append-only ---");
{
  const op = (id, d) => ({ id, account: "Test Bank", accountId: "sv_seed_plain",
    delta: d, reason: "out", updatedAt: at(40) });
  const A = [op("o1", -500), op("o2", -300)];
  const B = [op("o1", -500), op("o3", -200)];
  const out = mergeRecords("spendly_balance_ops_v1", A, B, {});
  check("each movement appears exactly once", dupes(out).length === 0, dupes(out).join(","));
  check("the shared one is not counted twice",
    out.filter(o => o.id === "o1").length === 1);
  check("the total is the union, not the sum of both lists",
    out.reduce((s, o) => s + o.delta, 0) === -1000,
    out.reduce((s, o) => s + o.delta, 0));
}

console.log("\n" + (fail ? fail + " of " + (pass + fail) + " checks FAILED"
                         : "all " + pass + " checks passed"));
process.exit(fail ? 1 : 0);
