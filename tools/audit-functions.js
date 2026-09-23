/* THE FUNCTIONAL SWEEP. Drives the real controls and asserts on what a person
 * can see, because every previous shortcut here produced a false result:
 *
 *   - reading `in-desc` back proved nothing, the field is in the document
 *     whether or not the drawer is open;
 *   - `tr.textContent` finds no description, it lives in an <input> value;
 *   - `window.expenses` is not the live array, the stores are module-scoped.
 *
 * So: press the buttons, read localStorage for the record, and read the DOM for
 * the row - and require offsetParent on anything claimed to be visible.
 *
 * Run it against a freshly seeded page (audit-seed.js, then reload). Returns a
 * report; it does not print, so the caller decides what to do with a failure.
 */
(async function(){
  "use strict";

  const R = [];
  const ok = (name, pass, detail) => {
    R.push({ name, pass: !!pass, detail: detail === undefined ? "" : String(detail) });
    return !!pass;
  };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const g = (id) => document.getElementById(id);
  const S = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch(e){ return []; } };
  const EXP = "spendly_expenses_v1", INC = "spendly_incomes_v1",
        SAV = "spendly_savings_v1", LG = "spendly_loans_given_v1",
        LT = "spendly_loans_taken_v1", INV = "spendly_investments_v1";

  /* offsetParent is null for anything display:none, or inside something that is.
     It is the cheapest honest answer to "can the user see this". */
  const seen = (el) => !!(el && el.offsetParent !== null);

  /* A control is asked for the way a person asks: by pressing it. */
  const press = async (el, settle) => {
    if (!el) return false;
    el.click();
    await wait(settle === undefined ? 260 : settle);
    return true;
  };
  /* Typing, with the events a real keystroke would fire - the category guess,
     the draft save and the currency preview all hang off `input`. */
  const type = (id, v) => {
    const el = g(id);
    if (!el) return null;
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return el;
  };
  const tick = (id, on) => {
    const el = g(id);
    if (!el) return null;
    if (el.checked !== on) el.click();
    return el;
  };

  const goTab = async (name) => {
    const b = document.querySelector('nav.tabs [data-tab="' + name + '"]');
    await press(b, 320);
    return seen(g("tab-" + name));
  };

  /* A history row carries its description in an <input>, so it is found by
     VALUE, never by text. Returns the <tr>. */
  const rowFor = (wrapId, text) => {
    const wrap = g(wrapId);
    if (!wrap) return null;
    return [...wrap.querySelectorAll("tr")].find(tr =>
      [...tr.querySelectorAll("input")].some(i => i.value === text)) || null;
  };
  /* Loans and savings draw a CARD at a wide viewport and a <tr> at a narrow one -
     both are the same record, and a probe that knows only about rows reports a
     healthy Cards view as a missing loan. Six checks failed that way on the first
     run. Ask for whichever the view is currently using. */
  const recordNode = (wrapId, text) => {
    const wrap = g(wrapId);
    if (!wrap) return null;
    const holders = [...wrap.querySelectorAll(".loan-card, .sa-card, tr")];
    return holders.find(n =>
      [...n.querySelectorAll("input")].some(i => i.value === text) ||
      (n.textContent || "").includes(text)) || null;
  };

  /* ASK FOR AN ADD FORM THE WAY A PERSON DOES.

     The drawer shows five tabs on a wide screen and four on a phone, where Lent
     and Borrowed are one "Loans" tab with the direction on a strip underneath.
     Press the tab if it is there; otherwise press the tab that holds it and
     then the direction. Both shapes, one call, so the checks below do not each
     need to know which screen they are on. */
  const openAddTab = async (label, dir) => {
    const tabs = () => [...document.querySelectorAll("#rd-tabs .rd-tab")];
    const byName = (n) => tabs().find(b => b.textContent.trim() === n);
    const direct = byName(label);
    if (direct){ await press(direct, 420); return "tab"; }
    /* Folded away: the phone shape. */
    const holder = byName("Loans");
    if (holder && dir){
      await press(holder, 420);
      const d = document.querySelector('#rd-dir [data-add-dir="' + dir + '"]');
      if (d){ await press(d, 420); return "folded"; }
    }
    /* Or simply renamed to fit - "Investment" is "Invest" on a phone. */
    const short = tabs().find(b => label.indexOf(b.textContent.trim()) === 0 ||
                                   b.textContent.trim().indexOf(label) === 0);
    if (short){ await press(short, 420); return "renamed"; }
    return "missing";
  };

  const uniq = (a) => new Set(a).size === a.length;
  const money = (n) => Math.round(n * 100) / 100;

  const stamp = Date.now().toString(36).slice(-5);
  const tag = (s) => "AUD" + stamp + s;

  /* ---------------------------------------------------------------- 1. the +  */
  await goTab("dashboard");
  await press(g("btn-fab-add"), 420);

  ok("the + opens the add drawer",
    document.body.classList.contains("beside-open"), document.body.className);
  ok("it opens on Expense, not a menu",
    (g("rd-title") || {}).textContent === "Add an expense",
    (g("rd-title") || {}).textContent);
  ok("the expense fields are actually on screen", seen(g("in-desc")));
  /* Five on a wide screen, four on a phone where Lent and Borrowed are folded
     into one Loans tab. Asserting a flat 5 made this fail at 390px on a drawer
     that was working exactly as designed. */
  {
    const n = document.querySelectorAll("#rd-tabs .rd-tab").length;
    const phone = window.matchMedia("(max-width: 720px)").matches;
    ok("the add drawer offers every way in, folded to fit the screen",
      n === (phone ? 4 : 5),
      n + " tabs at " + window.innerWidth + "px");
    ok("and the strip holds them without scrolling",
      (()=>{ const t=document.getElementById("rd-tabs");
             return t.scrollWidth <= t.clientWidth + 1; })(),
      (()=>{ const t=document.getElementById("rd-tabs");
             return (t.scrollWidth - t.clientWidth) + "px off the end"; })());
  }
  ok("both seeded accounts are offered",
    g("in-bank") && [...g("in-bank").options].map(o => o.value).includes("Test Bank"));

  /* ------------------------------------------------- 2. a refusal is not a save */
  const before0 = S(EXP).length;
  type("in-desc", "");
  type("in-amount", "123");
  g("in-bank").value = "Test Bank";
  await press(g("btn-add"), 220);
  ok("an entry with no description is refused, not saved",
    S(EXP).length === before0, S(EXP).length + " vs " + before0);
  ok("and the field it refused on is marked",
    g("in-desc").classList.contains("field-invalid") ||
    g("in-desc").getAttribute("aria-invalid") === "true",
    g("in-desc").className);

  /* ------------------------------------------- 3. price is exactly as entered */
  const AMOUNTS = [1234.56, 0.01, 99999.99, 7, 19.99];
  const written = [];
  for (let i = 0; i < AMOUNTS.length; i++){
    const desc = tag("-amt" + i);
    type("in-desc", desc);
    type("in-amount", String(AMOUNTS[i]));
    g("in-bank").value = "Test Bank";
    g("in-bank").dispatchEvent(new Event("change", { bubbles: true }));
    g("in-currency").value = "PHP";
    await press(g("btn-add"), 240);
    written.push({ desc, want: AMOUNTS[i] });
  }

  const afterAmt = S(EXP);
  const found = written.map(w => afterAmt.filter(e => e.description === w.desc));
  ok("every amount typed was saved once, not twice",
    found.every(list => list.length === 1),
    found.map(l => l.length).join(","));
  ok("the price stored is the price entered",
    written.every((w, i) => found[i][0] && found[i][0].amount === w.want),
    written.map((w, i) => (found[i][0] ? found[i][0].amount : "-") + "/" + w.want).join(" "));
  ok("no two entries share an id",
    uniq(afterAmt.map(e => e.id)), afterAmt.length + " ids");
  ok("the form clears after a save, so the next one is not a repeat",
    g("in-desc").value === "" && g("in-amount").value === "",
    JSON.stringify([g("in-desc").value, g("in-amount").value]));

  /* --------------------------------- 4. the account is charged what was spent */
  const spent = money(AMOUNTS.reduce((s, n) => s + n, 0));
  const plain = S(SAV).find(a => a.provider === "Test Bank");
  ok("the account is charged exactly what was spent",
    plain && money(500000 - plain.amount) === spent,
    plain ? (500000 - plain.amount) + " vs " + spent : "no account");

  /* Spending more than an account holds. The documented behaviour is that it is
     zeroed rather than sent negative, the movement recorded is the part that
     really came out so the arithmetic still adds up, and the shortfall is said
     out loud. An account that silently goes negative would be the defect. */
  const overDesc = tag("-over");
  type("in-desc", overDesc);
  type("in-amount", "9999999");
  g("in-bank").value = "Small Bank";
  g("in-bank").dispatchEvent(new Event("change", { bubbles: true }));
  await press(g("btn-add"), 360);
  const drained = S(SAV).find(a => a.provider === "Small Bank");
  ok("overspending an account zeroes it rather than sending it negative",
    drained && drained.amount === 0, drained ? drained.amount : "-");
  ok("the expense is still recorded at the price entered, not at what fitted",
    (S(EXP).find(e => e.description === overDesc) || {}).amount === 9999999,
    (S(EXP).find(e => e.description === overDesc) || {}).amount);
  ok("and the shortfall is said out loud, not swallowed",
    /only had|zeroed/i.test(document.body.innerText),
    (document.querySelector(".toast, #toast") || {}).textContent || "no toast on screen");

  /* ------------------------------------- 5. the entries are visible in History */
  await goTab("history");
  await wait(340);
  const missing = written.filter(w => !rowFor("history-table-wrap", w.desc));
  ok("every logged entry has a row in History",
    missing.length === 0, missing.map(m => m.desc).join(","));
  const hidden = written
    .map(w => rowFor("history-table-wrap", w.desc))
    .filter(tr => tr && !seen(tr));
  ok("and none of those rows is hidden", hidden.length === 0, hidden.length);

  const dupRows = written.filter(w => {
    const wrap = g("history-table-wrap");
    if (!wrap) return false;
    return [...wrap.querySelectorAll("tr")]
      .filter(tr => [...tr.querySelectorAll("input")].some(i => i.value === w.desc)).length > 1;
  });
  ok("no entry is drawn twice", dupRows.length === 0, dupRows.map(d => d.desc).join(","));

  /* Nothing may be silently dropped between the file and the screen: every
     record that passes no filter at all must be on screen or on another page. */
  const pageRows = [...(g("history-table-wrap") || document.createElement("div"))
    .querySelectorAll("tbody tr")].filter(tr => tr.querySelector("input"));
  const pager = g("history-table-wrap")
    ? g("history-table-wrap").querySelector("[data-page], .pager, .pagination") : null;
  ok("the row count matches the record count when nothing is filtered",
    pager ? pageRows.length <= S(EXP).length : pageRows.length === S(EXP).length,
    pageRows.length + " rows / " + S(EXP).length + " records" + (pager ? " (paged)" : ""));

  /* ------------------------- 6. logging while ON History updates History       */
  const liveDesc = tag("-live");
  await press(g("btn-fab-add"), 420);
  type("in-desc", liveDesc);
  type("in-amount", "42");
  g("in-bank").value = "Test Bank";
  g("in-bank").dispatchEvent(new Event("change", { bubbles: true }));
  await press(g("btn-add"), 700);
  const liveRec = S(EXP).filter(e => e.description === liveDesc);
  ok("logging from History saves the record", liveRec.length === 1, liveRec.length);
  ok("and the new row appears without leaving the page",
    !!rowFor("history-table-wrap", liveDesc),
    rowFor("history-table-wrap", liveDesc) ? "shown" : "NOT SHOWN until a re-render");

  /* --------------------------------------------------------- 7. income logging */
  await press(g("btn-fab-add"), 300);
  const incTab = [...document.querySelectorAll("#rd-tabs .rd-tab")]
    .find(b => b.textContent.trim() === "Income");
  await press(incTab, 420);
  ok("the Income tab switches the form", seen(g("in-desc")) &&
    (g("rd-title") || {}).textContent === "Add income",
    (g("rd-title") || {}).textContent);

  const incDesc = tag("-inc");
  type("in-desc", incDesc);
  type("in-amount", "5000.25");
  g("in-bank").value = "Test Bank";
  g("in-bank").dispatchEvent(new Event("change", { bubbles: true }));
  await press(g("btn-add"), 320);
  const incRec = S(INC).filter(i => i.description === incDesc);
  ok("income is saved once, at the amount entered",
    incRec.length === 1 && incRec[0] && incRec[0].amount === 5000.25,
    incRec.length + " / " + (incRec[0] ? incRec[0].amount : "-"));
  ok("income did not land in expenses",
    S(EXP).filter(e => e.description === incDesc).length === 0);

  await goTab("history");
  await wait(320);
  /* History is one card at a time, chosen by a segmented control - the income
     table is display:none until it is asked for. A probe that reads the income
     table without pressing the control finds the rows and calls them invisible,
     which is the toggle working. */
  const modeBtns = [...(g("history-mode-toggle") || document.createElement("div"))
    .querySelectorAll("button")];
  ok("History offers both tables through one control",
    modeBtns.length === 2, modeBtns.map(b => b.textContent.trim()).join(" / "));
  const incToggle = modeBtns.find(b => /income/i.test(b.textContent));
  await press(incToggle, 380);
  ok("the income has a visible row in its own table",
    seen(rowFor("income-history-table-wrap", incDesc)),
    rowFor("income-history-table-wrap", incDesc) ? "on screen" : "missing");
  ok("and switching tables puts the expense one away rather than stacking both",
    !seen(g("history-table-wrap")),
    seen(g("history-table-wrap")) ? "both on screen" : "one at a time");
  const expToggle = modeBtns.find(b => /expense/i.test(b.textContent));
  await press(expToggle, 380);
  ok("and back again", seen(g("history-table-wrap")));

  /* ------------------------------------------------------------ 8. interest    */
  const interestIncomes = S(INC).filter(i => /^i_int_/.test(i.id));
  ok("interest posted for the completed months only, not the running one",
    interestIncomes.length === 2, interestIncomes.length + " postings");
  ok("interest ids are deterministic, so a second run cannot double-post",
    uniq(interestIncomes.map(i => i.id)) &&
    interestIncomes.every(i => /^i_int_sv_seed_interest_\d{4}-\d{2}-\d{2}$/.test(i.id)),
    interestIncomes.map(i => i.id).join(" "));
  const interestSum = money(interestIncomes.reduce((s, i) => s + i.amount, 0));
  const intAcct = S(SAV).find(a => a.provider === "Interest Bank");
  ok("the account grew by exactly the interest posted",
    intAcct && money(intAcct.amount - 100000) === interestSum,
    intAcct ? money(intAcct.amount - 100000) + " vs " + interestSum : "no account");
  ok("interest compounds rather than repeating a flat figure",
    interestIncomes.length === 2 &&
    money(interestIncomes[0].amount) !== money(interestIncomes[1].amount),
    interestIncomes.map(i => i.amount).join(" / "));
  ok("each posting is dated in a month that has finished",
    interestIncomes.every(i => i.date < new Date().toISOString().slice(0, 10)),
    interestIncomes.map(i => i.date).join(" "));

  /* --------------------------------------------------------------- 9. loans    */
  await goTab("loans");
  await wait(260);

  const seedLoan = S(LG).find(l => l.id === "lg_seed_interest");
  ok("the seeded loan survived boot", !!seedLoan, seedLoan ? seedLoan.amount : "gone");
  /* 10,000 at 2% a month, simple, three whole months = 600. */
  const chip = [...document.querySelectorAll(".loan-chip.is-interest")]
    .map(c => c.textContent).join(" | ");
  ok("the loan's interest is shown and is simple, not compounding",
    /600/.test(chip), chip || "no interest chip on screen");

  const borrower = tag("-lent");
  await press(g("btn-fab-add"), 300);
  const lentVia = await openAddTab("Lent", "lent");
  ok("Lent reaches the loan form, whichever shape the drawer is in",
    seen(g("lg-person")),
    lentVia + " / " + (g("rd-title") || {}).textContent);

  type("lg-person", borrower);
  type("lg-amount", "8000");
  g("lg-bank").value = "Test Bank";
  g("lg-bank").dispatchEvent(new Event("change", { bubbles: true }));
  type("lg-interest-kind", "flat");
  type("lg-interest-rate", "5");
  await press(g("btn-add-loan-given"), 380);

  const mine = S(LG).filter(l => l.person === borrower);
  ok("the loan given is saved once", mine.length === 1, mine.length);
  ok("every field on the form reached the record",
    mine[0] && mine[0].amount === 8000 && mine[0].bank === "Test Bank" &&
    mine[0].interestKind === "flat" && mine[0].interestRate === 5 &&
    mine[0].status === "outstanding" && Array.isArray(mine[0].payments),
    mine[0] ? JSON.stringify({ a: mine[0].amount, b: mine[0].bank,
      k: mine[0].interestKind, r: mine[0].interestRate, s: mine[0].status }) : "-");

  await goTab("loans");
  await wait(300);
  const loanRow = recordNode("loans-given-table-wrap", borrower);
  ok("the loan given is on screen", seen(loanRow),
    loanRow ? "on screen" : "missing");

  /* --- a payment against it ------------------------------------------------ */
  const beforePay = S(LG).find(l => l.person === borrower);
  /* Read here, not from the snapshot taken twenty checks ago - the overdraw
     test sits between the two and a stale figure fails against its own history. */
  const bankBeforePay = S(SAV).find(x => x.provider === "Test Bank").amount;
  /* The control belongs to the record, so it is looked for INSIDE the node that
     names it - a card carries its own, and a row carries it in the detail row
     underneath. Reaching for the first one on the page would log the payment
     against somebody else's loan and still pass. */
  let payPanel = null;
  if (loanRow){
    const own = loanRow.querySelector('[data-action="toggle-payment"]');
    const next = loanRow.nextElementSibling;
    const hit = own || (next && next.querySelector('[data-action="toggle-payment"]'));
    await press(hit, 340);
    payPanel = loanRow.querySelector("[data-payment-panel]:not(.is-collapsed)") ||
      (next && next.querySelector("[data-payment-panel]:not(.is-collapsed)")) ||
      document.querySelector("[data-payment-panel]:not(.is-collapsed)");
  }
  ok("the payment panel opens from the row", !!payPanel,
    payPanel ? "open" : "did not open");

  if (payPanel){
    const amtField = payPanel.querySelector('input[type="number"], input[data-pay-amount], input');
    if (amtField){
      amtField.value = "3000";
      amtField.dispatchEvent(new Event("input", { bubbles: true }));
      amtField.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const payBtn = [...payPanel.querySelectorAll("button")]
      .find(b => /log|record|save|pay/i.test(b.textContent)) ||
      payPanel.querySelector("button");
    await press(payBtn, 420);
  }

  const afterPay = S(LG).find(l => l.person === borrower);
  ok("a payment reduces the outstanding by exactly what was paid",
    afterPay && beforePay && money(beforePay.amount - afterPay.amount) === 3000,
    afterPay ? beforePay.amount + " -> " + afterPay.amount : "-");
  ok("the payment is written to the loan's own ledger",
    afterPay && Array.isArray(afterPay.payments) && afterPay.payments.length === 1 &&
    afterPay.payments[0].amount === 3000,
    afterPay ? JSON.stringify(afterPay.payments.map(p => p.amount)) : "-");
  ok("the original amount is kept, so interest is not recomputed on the remainder",
    afterPay && afterPay.originalAmount === 8000, afterPay ? afterPay.originalAmount : "-");
  ok("a payment on a loan given puts the money back in the account",
    money(S(SAV).find(x => x.provider === "Test Bank").amount - bankBeforePay) === 3000,
    bankBeforePay + " -> " + S(SAV).find(x => x.provider === "Test Bank").amount);

  /* --- and it is refused when it is more than is owed ---------------------- */
  const owed = S(LG).find(l => l.person === borrower).amount;
  const panel2 = document.querySelector("[data-payment-panel]:not(.is-collapsed)");
  if (panel2){
    const f = panel2.querySelector("input");
    if (f){
      f.value = String(owed + 500);
      f.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const b = [...panel2.querySelectorAll("button")]
      .find(x => /log|record|save|pay/i.test(x.textContent)) || panel2.querySelector("button");
    await press(b, 360);
  }
  ok("paying more than is outstanding is refused",
    S(LG).find(l => l.person === borrower).amount === owed,
    S(LG).find(l => l.person === borrower).amount + " vs " + owed);

  /* --- and the same payment through the SHEET, which is a phone's only way -- */
  /* The list view makes a row an index line and puts the controls in a sheet,
     and the sheet MOVES them out of the row rather than copying them. Every
     lookup the submit does at click time therefore has to survive the move. It
     did not: `payRow.querySelector` returned null and the button did nothing,
     silently, on the only path a phone offers. */
  {
    const rowsBtn = document.querySelector('.seg.is-icons [data-layout="list"]');
    await press(rowsBtn, 620);
    const listed = document.body.classList.contains("list-as-rows");
    ok("the loans list can be shown as rows", listed, document.body.className);

    const row = recordNode("loans-given-table-wrap", borrower);
    await press(row, 700);
    const sheet = document.querySelector(".drill-panel");
    ok("tapping a row opens the sheet", seen(sheet));

    /* The controls arrive behind Edit; the read view is deliberately read-only. */
    const editBtn = sheet && [...sheet.querySelectorAll("button")]
      .find(b => (b.getAttribute("aria-label") || "").trim() === "Edit");
    await press(editBtn, 800);

    const field = sheet && sheet.querySelector('[data-field="payment"]');
    ok("the amount box is on screen in the sheet, already open",
      seen(field), field ? "shown" : "missing");
    ok("and the button that would only hide it is gone",
      !seen(sheet && sheet.querySelector('[data-action="toggle-payment"]')),
      "a sheet has no drawers to open");

    const owedBefore = (S(LG).find(l => l.person === borrower) || {}).amount;
    if (field){
      field.value = "500";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await press(sheet && sheet.querySelector('[data-action="log-payment"]'), 900);
    const owedAfter = (S(LG).find(l => l.person === borrower) || {}).amount;
    ok("a payment logged from the sheet actually lands",
      money(owedBefore - owedAfter) === 500,
      owedBefore + " -> " + owedAfter);
    ok("and it is written to the ledger like any other",
      ((S(LG).find(l => l.person === borrower) || {}).payments || [])
        .some(p => p.amount === 500));

    /* An empty box must refuse WITHOUT leaving a record behind - the History row
       used to be written before the amount was ever checked. */
    const incBefore = S(INC).length;
    const f2 = sheet && sheet.querySelector('[data-field="payment"]');
    if (f2){ f2.value = ""; f2.dispatchEvent(new Event("input", { bubbles: true })); }
    await press(sheet && sheet.querySelector('[data-action="log-payment"]'), 700);
    ok("an empty amount leaves no half-written entry behind",
      S(INC).length === incBefore && !S(INC).some(i => isNaN(i.amount)),
      (S(INC).length - incBefore) + " rows added");

    const closeBtn = sheet && [...sheet.querySelectorAll("button")]
      .find(b => /close|done/i.test(b.textContent));
    await press(closeBtn, 600);
    await press(document.querySelector('.seg.is-icons [data-layout="cards"]'), 620);
  }

  /* --- deleting the row a payment wrote must undo the payment -------------- */
  /* A logged payment is one event with three effects: a row in History, a
     payment on the loan, and money moved. Deleting the row used to undo only
     the first, so History said no payment had been made and the loan said one
     had. */
  {
    const who = tag("-del");
    const acct = "Test Bank";
    await press(g("btn-fab-add"), 320);
    await openAddTab("Lent", "lent");
    type("lg-person", who);
    type("lg-amount", "4000");
    g("lg-bank").value = acct;
    g("lg-bank").dispatchEvent(new Event("change", { bubbles: true }));
    await press(g("btn-add-loan-given"), 420);

    const bankOf = () => (S(SAV).find(a => a.provider === acct) || {}).amount;
    const loanOf = () => S(LG).find(l => l.person === who) || {};

    await goTab("loans");
    await press(document.querySelector('.seg.is-icons [data-layout="cards"]'), 620);
    const node = recordNode("loans-given-table-wrap", who);
    const tog = node && (node.querySelector('[data-action="toggle-payment"]') ||
      (node.nextElementSibling && node.nextElementSibling.querySelector('[data-action="toggle-payment"]')));
    await press(tog, 420);
    const box = node && node.querySelector('[data-field="payment"]');
    if (box){
      box.value = "1500";
      box.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const bankBefore = bankOf();
    await press(node && node.querySelector('[data-action="log-payment"]'), 800);
    const owedAfterPay = loanOf().amount;
    ok("the payment reduced the loan before anything is deleted",
      owedAfterPay === 2500, owedAfterPay);

    /* Now delete the History row it wrote. A loan GIVEN files it as income. */
    await goTab("history");
    const incBtn = [...(g("history-mode-toggle") || document.createElement("div"))
      .querySelectorAll("button")].find(b => /income/i.test(b.textContent));
    await press(incBtn, 620);
    const payRow = [...document.querySelectorAll("#income-history-table-wrap tbody tr")]
      .find(tr => [...tr.querySelectorAll("input")].some(i => i.value.indexOf(who) >= 0));
    ok("the payment left a row in History to find", !!payRow,
      payRow ? "found" : "no row");
    await press(payRow && payRow.querySelector('[data-action="delete"]'), 900);

    ok("deleting it puts the loan back",
      loanOf().amount === 4000, owedAfterPay + " -> " + loanOf().amount);
    ok("and takes the payment off the ledger",
      (loanOf().payments || []).length === 0,
      JSON.stringify((loanOf().payments || []).map(p => p.amount)));
    ok("and puts the money back where it came from",
      money(bankOf()) === money(bankBefore),
      bankBefore + " -> " + bankOf());

    /* And undo has to return all of it, not just the row. */
    const undoBtn = [...document.querySelectorAll("#toast button")]
      .find(b => /undo/i.test(b.textContent));
    await press(undoBtn, 900);
    ok("undo restores the payment as well as the row",
      loanOf().amount === 2500 && (loanOf().payments || []).length === 1,
      loanOf().amount + " / " + (loanOf().payments || []).length + " payment(s)");

    /* Back where the next section expects to be. This block ends on History,
       and what follows reads the loans board - left here, it measured a panel
       that was not on screen and called a visible loan invisible. */
    await goTab("loans");
  }

  /* --- a settled loan leaves a trace, it does not just disappear ----------- */
  /* The list filters to outstanding by default, so settling a loan takes it off
     the screen. That is fine ONLY because the strip says the list is being
     narrowed and offers the way back; a list that silently shrinks is how a user
     concludes the app lost their record. */
  const settleNode = recordNode("loans-given-table-wrap", borrower);
  const settleBtn = settleNode && [...settleNode.querySelectorAll("button")]
    .find(b => /fully paid|mark.*paid|settle/i.test(
      (b.getAttribute("aria-label") || "") + " " + b.textContent));
  if (settleBtn){
    await press(settleBtn, 300);
    const confirm = settleNode.querySelector('[data-action="confirm"], .is-confirming') ||
      [...document.querySelectorAll("button")].find(b => /confirm|yes/i.test(b.textContent));
    if (confirm && confirm !== settleBtn) await press(confirm, 340);
  }
  const settled = S(LG).find(l => l.person === borrower);
  ok("marking a loan fully paid records it as repaid",
    settled && settled.status === "repaid", settled ? settled.status : "-");
  ok("and stamps the day it was settled",
    settled && !!settled.repaidOn, settled ? settled.repaidOn : "-");
  const strip = document.querySelector("#loans-given-table-wrap .filter-status");
  ok("a loan hidden by the default filter is declared, not silently dropped",
    !!strip && /filter/i.test(strip.textContent),
    strip ? strip.textContent.trim() : "no filter strip");
  ok("and there is a way to see it again in one press",
    !!(strip && strip.querySelector("button")),
    strip && strip.querySelector("button") ? strip.querySelector("button").textContent : "no exit");
  const clearBtn = strip && strip.querySelector("button");
  /* Clearing a filter re-renders the board, and the repaint that follows a
     setUiPref write is debounced - 360ms landed inside it, so the node was read
     while the panel was between renders. */
  if (clearBtn) await press(clearBtn, 900);
  ok("clearing the filter brings the settled loan back on screen",
    seen(recordNode("loans-given-table-wrap", borrower)),
    recordNode("loans-given-table-wrap", borrower) ? "back" : "still gone");

  /* --- a loan taken -------------------------------------------------------- */
  const lender = tag("-borrowed");
  await press(g("btn-fab-add"), 300);
  const borVia = await openAddTab("Borrowed", "borrowed");
  ok("Borrowed reaches its own form, and it is not the Lent one",
    seen(g("lt-person")) && !seen(g("lg-person")), borVia);
  type("lt-person", lender);
  type("lt-amount", "2500.50");
  await press(g("btn-add-loan-taken"), 380);
  const taken = S(LT).filter(l => l.person === lender);
  ok("a loan taken is saved once, at the amount entered",
    taken.length === 1 && taken[0] && taken[0].amount === 2500.50,
    taken.length + " / " + (taken[0] ? taken[0].amount : "-"));
  ok("a loan taken did not land in loans given",
    S(LG).filter(l => l.person === lender).length === 0);

  /* --- an investment ------------------------------------------------------- */
  const invName = tag("-inv");
  await press(g("btn-fab-add"), 300);
  const invVia = await openAddTab("Investment");
  ok("Investment reaches its own form", seen(g("inv-name")), invVia);
  type("inv-name", invName);
  const invAmt = g("inv-amount") || g("inv-invested");
  if (invAmt){
    invAmt.value = "15000";
    invAmt.dispatchEvent(new Event("input", { bubbles: true }));
    invAmt.dispatchEvent(new Event("change", { bubbles: true }));
  }
  await press(g("btn-add-investment"), 380);
  ok("an investment is saved once",
    S(INV).filter(i => i.name === invName).length === 1,
    S(INV).filter(i => i.name === invName).length);

  /* ------------------- 10. a logged entry reaches the figures on screen ------ */
  /* The money bar always moved, because saveExpenses refreshes it on the way
     past. Everything else did not, and the two are easy to confuse: check a
     figure the money bar does not own. */
  await goTab("dashboard");
  await wait(320);
  const monthBtn = [...document.querySelectorAll("#tab-dashboard button")]
    .find(b => b.textContent.trim() === "This month");
  await press(monthBtn, 460);
  const readMonth = () => (g("tab-dashboard").innerText.match(/₱[\d,]+\.\d\d/g) || []).join("|");
  const monthBefore = readMonth();
  await press(g("btn-fab-add"), 380);
  type("in-desc", tag("-dash"));
  type("in-amount", "3333");
  g("in-bank").value = "Interest Bank";
  g("in-bank").dispatchEvent(new Event("change", { bubbles: true }));
  await press(g("btn-add"), 900);
  ok("logging an entry moves the dashboard's own figures, not just the money bar",
    readMonth() !== monthBefore,
    monthBefore === readMonth() ? "unchanged after a 3,333 expense" : "updated");

  /* ------------------------------------------- 11. nothing churns while idle   */
  await goTab("dashboard");
  await wait(400);
  let muts = 0, writes = 0;
  const mo = new MutationObserver(recs => { muts += recs.length; });
  mo.observe(document.querySelector(".app") || document.body,
    { childList: true, subtree: true, characterData: true });
  const realSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function(k, v){ writes++; return realSet.call(this, k, v); };
  await wait(2200);
  mo.disconnect();
  Storage.prototype.setItem = realSet;
  ok("nothing redraws itself while the dashboard is just sitting there",
    muts === 0, muts + " mutations");
  ok("and nothing writes to storage while idle", writes === 0, writes + " writes");

  /* ---------------------------------- 12. the page keeps its height and place  */
  const h0 = document.documentElement.scrollHeight;
  await goTab("history"); await goTab("savings"); await goTab("dashboard");
  await wait(420);
  ok("the page is the same height after a tab round trip",
    document.documentElement.scrollHeight === h0,
    h0 + " -> " + document.documentElement.scrollHeight);

  for (let i = 0; i < 6; i++) window.dispatchEvent(new Event("resize"));
  await wait(420);
  ok("and a burst of resizes does not move it",
    document.documentElement.scrollHeight === h0,
    h0 + " -> " + document.documentElement.scrollHeight);

  const travel = document.documentElement.scrollHeight - window.innerHeight;
  if (travel > 20){
    window.scrollTo(0, travel);
    await wait(120);
    const parked = window.scrollY;
    window.dispatchEvent(new Event("resize"));
    await wait(700);
    ok("parked at the bottom, an automatic render does not throw the scroll away",
      Math.abs(window.scrollY - parked) <= 2,
      parked + " -> " + window.scrollY);
    window.scrollTo(0, 0);
  } else {
    ok("parked at the bottom, an automatic render does not throw the scroll away",
      true, "skipped - only " + travel + "px of travel");
  }

  const fails = R.filter(r => !r.pass);
  return {
    total: R.length,
    passed: R.length - fails.length,
    failed: fails.length,
    failures: fails.map(f => f.name + "  [" + f.detail + "]"),
    all: R.map(r => (r.pass ? "PASS  " : "FAIL  ") + r.name +
      (r.detail ? "   (" + r.detail + ")" : ""))
  };
})()
