/* Seeds the lab with a known, INVENTED starting point, then the caller reloads.
 *
 * Everything here is made up, and that now matters more than it used to.
 *
 * READ THIS BEFORE RUNNING IT. The lab used to namespace every key under
 * LAB_COMBINED_, so a seed could not reach anything real. index.html has no such
 * shim: this writes the ACTUAL spendly_* keys for whatever origin it runs on,
 * and it WIPES what is there first. On localhost that is a throwaway dev store.
 * Pointed at the deployed app it would delete the real records.
 *
 * A test fixture is never somebody's actual money, and it never runs where the
 * actual money is kept.
 *
 * The shape is chosen so the probes can do arithmetic on it:
 *
 *   Test Bank       500,000    no interest   - the account entries are charged to
 *   Interest Bank   100,000    6% gross, 20% tax, auto, last paid three months ago
 *   Small Bank          100    the overdraw check drains this one and only this one
 *
 * That second one is two completed unpaid months as of any "today", because
 * lastInterestMonth is set relative to the current month rather than to a fixed
 * date - a fixture pinned to a literal month starts lying the month after it is
 * written.
 *
 * Returns what it wrote so the caller can assert against it rather than against
 * numbers restated in two places.
 */
(function(){
  "use strict";

  const monthsAgo = (n) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  };
  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  };

  const savings = [
    { id: "sv_seed_plain", provider: "Test Bank", amount: 500000,
      openingAmount: 500000, rate: 0, taxRate: 20, tiered: false,
      tierCap: null, tierOverRate: null, dateAdded: daysAgo(200) },
    { id: "sv_seed_interest", provider: "Interest Bank", amount: 100000,
      openingAmount: 100000, rate: 6, taxRate: 20, tiered: false,
      tierCap: null, tierOverRate: null, dateAdded: daysAgo(200),
      autoInterest: true, lastInterestMonth: monthsAgo(3) },
    /* Its own account, because the overdraw check drains whatever it charges and
       every later balance assertion would then be measuring the wreckage. */
    { id: "sv_seed_small", provider: "Small Bank", amount: 100,
      openingAmount: 100, rate: 0, taxRate: 20, tiered: false,
      tierCap: null, tierOverRate: null, dateAdded: daysAgo(200) }
  ];

  /* A loan with interest already running, so the interest figure on screen is
     checkable without waiting three months for it to become non-zero. Simple,
     never compounding: 10,000 at 2%/month for three months is 600. */
  const loansGiven = [
    { id: "lg_seed_interest", person: "Seed Borrower", amount: 10000,
      dateGiven: daysAgo(95), deadline: "", status: "outstanding",
      bank: null, notes: "", repayMonthly: false, repayDay: 0,
      interestKind: "monthly", interestRate: 2, reference: "", payments: [] }
  ];

  const wipe = [
    "spendly_expenses_v1", "spendly_incomes_v1", "spendly_savings_v1",
    "spendly_loans_given_v1", "spendly_loans_taken_v1", "spendly_investments_v1",
    "spendly_recurring_v1", "spendly_balance_ops_v1", "spendly_tombstones_v1",
    "spendly_networth_history_v1", "spendly_budgets_v1", "spendly_corrections_v1",
    "spendly_map_times_v1", "spendly_draft_v1", "spendly_crypto_v1",
    /* The UI preferences too, and this one was learned the hard way: the sweep
       presses a filter's "Clear all", that choice is remembered, and the NEXT
       run starts with a filter the first run did not have. Two checks passed in
       run 2 and failed in run 3 on identical code. A fixture that does not reset
       the view is not a fixture. */
    "spendly_ui_prefs_v1"
  ];
  wipe.forEach(k => localStorage.removeItem(k));

  localStorage.setItem("spendly_savings_v1", JSON.stringify(savings));
  localStorage.setItem("spendly_loans_given_v1", JSON.stringify(loansGiven));
  localStorage.setItem("spendly_expenses_v1", "[]");
  localStorage.setItem("spendly_incomes_v1", "[]");
  localStorage.setItem("spendly_welcome_dismissed_v1", "1");

  return {
    seeded: true,
    accounts: savings.map(a => a.provider),
    interestFrom: savings[1].lastInterestMonth,
    plainOpening: 500000,
    interestOpening: 100000,
    loanPrincipal: 10000,
    loanMonths: 3
  };
})()
