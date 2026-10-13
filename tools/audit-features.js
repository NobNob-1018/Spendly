/* THE FEATURES NOTHING ELSE DRIVES.
 *
 * audit-coverage.js keeps reporting the same three areas with no tool naming a
 * single function in them - budgets 0 of 7, archive 0 of 2, and most of
 * recurring, categories and money parsing. audit-core.js took the money paths
 * (backup, restore, lending, settling). This takes the rest of the features a
 * person actually presses, and it presses them the way a person does.
 *
 * Every number here is checked against arithmetic the test does itself, never
 * against a figure restated from index.html.
 *
 * HOW TO RUN IT. In the page, on a fresh seed:
 *
 *   const fresh = async (p) => {
 *     for (const k of await caches.keys()) await caches.delete(k);
 *     return fetch(p, { cache: "reload" }).then(r => r.text());
 *   };
 *   localStorage.clear(); eval(await fresh("/tools/audit-seed.js")); location.reload();
 *   // then
 *   await eval(await fresh("/tools/audit-features.js"))
 *
 * ONE RUN PER SEED. A second run inherits the first run's writes, and every
 * failure it then reports is the fixture's rather than the app's.
 *
 * THE ARCHIVE CHECKS NEED A PHONE. A history row opens its sheet only at 720px
 * and under; above that the row is edited in place and there is no sheet. The
 * checks say so and skip rather than pretending, because a skip that reads as a
 * pass is worse than no check at all.
 */
(function(){
  "use strict";

  if (window.innerWidth < 320){
    return { note: "pane is " + window.innerWidth + "px - too small to measure anything",
             total: 0, passed: 0, failed: 0, failures: [], all: [] };
  }

  const R = [];
  const ok = (name, pass, detail) => {
    R.push({ name, pass: !!pass, detail: detail === undefined ? "" : String(detail) });
    return !!pass;
  };
  const skip = (name, why) => { R.push({ name, pass: true, skipped: true, detail: "SKIPPED - " + why }); };

  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const g = (id) => document.getElementById(id);
  const S = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch(e){ return []; } };
  const O = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch(e){ return {}; } };
  const EXP = "spendly_expenses_v1", SAV = "spendly_savings_v1",
        BUD = "spendly_budgets_v1", CAT = "spendly_categories_v1",
        REC = "spendly_recurring_v1", CUR = "spendly_currencies_v1";

  const seen = (el) => !!(el && el.checkVisibility && el.checkVisibility());
  /* EXPENSES ONLY. "#tab-history tbody tr" also matches the income table that
     sits in the same panel, and the seed posts interest as income - so a sweep
     written against the loose selector deleted an interest row, archived it, and
     then reported the app broken for not having changed an expense. */
  const EROWS = "#history-table-wrap tbody tr";
  const erows = () => [...document.querySelectorAll(EROWS)];
  const press = async (el, settle) => { if (!el) return false; el.click(); await wait(settle === undefined ? 320 : settle); return true; };
  const type = (id, v) => { const el = g(id); if (!el) return null;
    el.value = v; el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true })); return el; };
  const choose = (id, v) => { const el = g(id); if (!el) return null;
    el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); return el; };

  const goTab = async (name) => { const b = document.querySelector('nav.tabs [data-tab="' + name + '"]');
    if (b) { b.click(); await wait(480); } return !!b; };
  const goSetting = async (grp) => { const b = document.querySelector('#settings-nav [data-settings="' + grp + '"]');
    if (b) { b.click(); await wait(520); } return !!b; };
  const bank = (name) => { const a = S(SAV).find(s => s.provider === name); return a ? a.amount : null; };
  const tag = (s) => "AUDF" + Math.random().toString(36).slice(2, 6) + s;

  /* The day of THIS month, so a budget check lands in the window budgetPicture
     measures. A fixture pinned to a literal date starts lying next month. */
  const dayThisMonth = (d) => { const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"); };

  return (async function run(){

  /* ===================================================== 1. BUDGETS (0 of 7) */
  /* Its own material: two entries in one category this month, so the spend the
     budget reports can be checked against a number this file added up. */
  /* Through the FORM, not into localStorage. budgetPicture() reads the array the
     app booted with; writing behind it leaves that array stale and the panel
     honestly reports zero spend. Lost an audit round to this. */
  const foodA = 1200, foodB = 800, foodTotal = foodA + foodB;
  for (const amt of [foodA, foodB]){
    await press(g("btn-fab-add"), 700);
    type("in-desc", tag(" food"));
    type("in-amount", String(amt));
    choose("in-category", "Food");
    choose("in-bank", "Test Bank");
    await press(g("btn-add"), 900);
  }
  ok("two entries logged through the form land in one category",
    S(EXP).filter(e => e.category === "Food").length >= 2,
    S(EXP).filter(e => e.category === "Food").length + " in Food");

  await goTab("settings");
  ok("the Budgets panel is reachable from the settings nav", await goSetting("budgeting"));

  const budInput = (cat) => [...document.querySelectorAll("#budget-list [data-budget-input]")]
    .find(i => i.closest("[data-cat]") && i.closest("[data-cat]").dataset.cat === cat);

  ok("every category offers a limit field, not just the ones already set",
    document.querySelectorAll("#budget-list [data-budget-input]").length >= 7,
    document.querySelectorAll("#budget-list [data-budget-input]").length + " fields");

  const under = foodTotal + 100000;   // comfortably above whatever is on file
  const fi = budInput("Food");
  if (fi){ fi.value = String(under); fi.dispatchEvent(new Event("change", { bubbles: true })); await wait(600); }
  ok("a limit typed into the field is saved against its category",
    O(BUD).Food === under, JSON.stringify(O(BUD)));

  /* Read the figure off the panel and check it against what is on file for the
     one limited category - not against a constant, which would only prove this
     file can restate its own arithmetic. */
  const lead = document.querySelector("#budget-list .bgl-lead");
  const spentShown = lead ? parseFloat(lead.textContent.replace(/[^\d.]/g, "").slice(0, -4) || "0") : NaN;
  const foodOnFile = S(EXP).filter(e => e.category === "Food" &&
    e.date.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((a, e) => a + e.amount, 0);
  ok("the panel reports the spend that is actually on file for that category",
    Math.abs(spentShown - foodOnFile) < 0.51, "panel " + spentShown + " vs file " + foodOnFile);

  /* The limit is PRINTED formatted - 102,000.00 - so compare the digits, not
     the string. This read false against a correct panel for exactly that. */
  const leadDigits = lead ? lead.textContent.replace(/,/g, "") : "";
  ok("a category with no limit is left out of the total",
    leadDigits.indexOf(String(under)) > -1,
    lead ? lead.textContent.trim() : "-");

  /* Over is a different sentence and a different class, and it is the one that
     matters: a budget that cannot say you passed it is decoration. */
  const OVERSHOOT = 500;
  const over = Math.max(1, Math.round((foodOnFile - OVERSHOOT) * 100) / 100);   // round2 lives inside the app IIFE, not here
  const fi2 = budInput("Food");
  if (fi2){ fi2.value = String(over); fi2.dispatchEvent(new Event("change", { bubbles: true })); await wait(600); }
  const sub = document.querySelector("#budget-list .bgl-sub");
  ok("going past a limit is said out loud, by exactly how much",
    !!sub && /over/i.test(sub.textContent) &&
      Math.abs(parseFloat((sub.textContent.match(/₱([\d,]+(?:\.\d+)?)\s*over/) || [0, "0"])[1].replace(/,/g, "")) - OVERSHOOT) < 0.51,
    sub ? sub.textContent.trim().slice(0, 90) : "no line");
  ok("and the over state is marked, not just worded",
    !!document.querySelector("#budget-list .bgl-sub.is-over"));

  /* The dashboard card and the settings panel are two renderers of one figure. */
  await goTab("dashboard");
  const card = g("budget-card");
  ok("the dashboard card agrees with the panel",
    !!card && /over/i.test(card.textContent) && card.textContent.indexOf(String(OVERSHOOT)) > -1,
    card ? card.textContent.replace(/\s+/g, " ").trim().slice(0, 80) : "no card");

  await goTab("settings"); await goSetting("budgeting");
  const fi3 = budInput("Food");
  if (fi3){ fi3.value = ""; fi3.dispatchEvent(new Event("change", { bubbles: true })); await wait(600); }
  ok("clearing the field removes the limit rather than storing a zero",
    O(BUD).Food === undefined, JSON.stringify(O(BUD)));
  /* The empty-state trap, in its budget form: clearing the last limit must not
     delete the fields you would use to set another one. */
  ok("and the fields to set one again are still there",
    document.querySelectorAll("#budget-list [data-budget-input]").length >= 7,
    document.querySelectorAll("#budget-list [data-budget-input]").length + " fields");

  /* ================================================== 2. CATEGORIES (1 of 8) */
  const newCat = tag(" Cat");
  await goSetting("budgeting");
  const catField = g("new-category"), catAdd = g("btn-add-category");
  if (catField && catAdd && seen(catField)){
    catField.value = newCat;
    catField.dispatchEvent(new Event("input", { bubbles: true }));
    await press(catAdd, 700);
    ok("a category added in Settings is stored", S(CAT).indexOf(newCat) > -1, newCat);
    await goTab("history");
    /* The filter <th> is rebuilt by renderHistory, so it is only current after
       one has run. Going to the tab is not the same as the table repainting. */
    if (typeof renderHistory === "function") renderHistory();
    await wait(450);
    const inFilter = [...(g("exp-f-cat") ? g("exp-f-cat").options : [])].some(o => o.value === newCat);
    const inBulk = [...(g("expense-bulk-category") ? g("expense-bulk-category").options : [])].some(o => o.value === newCat);
    ok("and it reaches the history filter and the bulk control without a reload",
      inFilter && inBulk, "filter " + inFilter + " / bulk " + inBulk);
  } else {
    skip("a category added in Settings is stored", "the category field is not on this page");
    skip("and it reaches the history filter and the bulk control without a reload", "as above");
  }

  /* ============================================ 3. BULK ACTIONS AND THE MONEY */
  await goTab("history");
  const boxes = () => [...document.querySelectorAll("#history-table-wrap tbody .row-select")];
  const pickedIds = () => erows()
    .filter(t => t.querySelector(".row-select") && t.querySelector(".row-select").checked)
    .map(t => t.dataset.id);

  /* A phone hides the row checkbox and picks by holding instead, so the bulk bar
     cannot be raised this way there. Skipping says that; failing would claim the
     app is broken for following its own design. */
  const canTick = !window.matchMedia("(max-width: 720px)").matches;
  boxes().forEach(b => { if (b.checked) b.click(); });
  await wait(300);
  const bb = boxes();
  if (canTick && bb.length >= 2){
    bb[0].click(); bb[1].click(); await wait(500);
    ok("picking rows raises the bulk bar and says how many", seen(g("expense-bulk-bar")) &&
      /2/.test(g("expense-bulk-count").textContent), g("expense-bulk-count").textContent.trim());

    const chosen = pickedIds();
    const was = {}; S(EXP).forEach(e => { was[e.id] = e.category; });
    const target = S(CAT).indexOf(newCat) > -1 ? newCat : "Other";
    choose("expense-bulk-category", target);
    await press(g("btn-bulk-recategorize-expense"), 800);
    const moved = S(EXP).filter(e => was[e.id] !== e.category).map(e => e.id);
    ok("recategorising in bulk changes the rows picked and no others",
      moved.length === chosen.length && chosen.every(id => moved.indexOf(id) > -1),
      "picked " + chosen.length + ", changed " + moved.length);
  } else {
    const why = canTick ? "fewer than two expense rows on screen" : "a phone picks by holding, not by a checkbox";
    skip("picking rows raises the bulk bar and says how many", why);
    skip("recategorising in bulk changes the rows picked and no others", why);
  }

  /* Deleting an expense has to put the money back where it came from. */
  const realConfirm = window.confirm;
  window.confirm = () => true;
  try {
    boxes().forEach(b => { if (b.checked) b.click(); });
    await wait(300);
    const one = canTick ? boxes()[0] : null;
    if (one){
      one.click(); await wait(450);
      const id = pickedIds()[0];
      const rec = S(EXP).find(e => e.id === id);
      const amt = rec ? rec.amount : 0;
      const acct = rec ? rec.bank : null;
      const before = bank(acct);
      await press(g("btn-bulk-delete-expense"), 900);
      ok("deleting in bulk removes exactly the record picked",
        !S(EXP).find(e => e.id === id), id);
      ok("and puts its money back in the account it came out of",
        acct == null || Math.abs((bank(acct) - before) - amt) < 0.005,
        before + " -> " + bank(acct) + " for " + amt);
    } else {
      const why = canTick ? "no expense rows to pick" : "a phone picks by holding, not by a checkbox";
      skip("deleting in bulk removes exactly the record picked", why);
      skip("and puts its money back in the account it came out of", why);
    }

    /* Undo is the other half: the record comes back AND the money goes out again. */
    const row = erows()[0];
    if (row){
      const id = row.dataset.id;
      const rec = S(EXP).find(e => e.id === id);
      const acct = rec ? rec.bank : null;
      const start = bank(acct);
      await press(row.querySelector('[data-action="delete"]'), 900);
      const undo = [...document.querySelectorAll("button")].find(b => seen(b) && /undo/i.test(b.textContent));
      ok("a single delete offers an undo", !!undo, undo ? undo.textContent.trim() : "no undo offered");
      if (undo){
        await press(undo, 900);
        ok("undo brings the record back", !!S(EXP).find(e => e.id === id), id);
        ok("and takes the refund back out, to the figure it started at",
          acct == null || Math.abs(bank(acct) - start) < 0.005,
          start + " -> " + bank(acct));
      } else {
        skip("undo brings the record back", "nothing offered an undo");
        skip("and takes the refund back out, to the figure it started at", "as above");
      }
    }
  } finally { window.confirm = realConfirm; }

  /* ================================================= 4. ARCHIVE (0 of 2) */
  /* Filed away is not deleted: the row leaves the list and the totals do not
     move. The sheet that carries the button only exists on a phone. */
  if (window.matchMedia("(max-width: 720px)").matches){
    await goTab("history");
    const row = erows().find(t => !t.hasAttribute("data-archived"));
    const liveRows = () => erows().filter(t => t.getBoundingClientRect().height > 0).length;
    const totalText = () => { const el = document.querySelector(".tm-value"); return el ? el.textContent.trim() : ""; };
    if (row){
      const id = row.dataset.id;
      const rowsBefore = liveRows(), totalBefore = totalText();
      await press(row, 700);
      const sheet = g("item-sheet");
      const pencil = sheet ? [...sheet.querySelectorAll("button")]
        .find(b => (b.getAttribute("aria-label") || "") === "Edit") : null;
      ok("tapping a history row opens its sheet", seen(sheet));
      if (pencil) await press(pencil, 700);
      const arch = sheet ? sheet.querySelector(".sheet-archive") : null;
      ok("the sheet offers Archive, so the swipe is not the only way to reach it",
        seen(arch), arch ? arch.textContent.trim() : "no button");
      if (arch){
        await press(arch, 800);
        const close = [...sheet.querySelectorAll("button")].find(b => /close/i.test(b.textContent));
        if (close) await press(close, 700);
        ok("the record is marked filed rather than removed",
          !!S(EXP).find(e => e.id === id && e.archived), id);
        ok("the row leaves the list", liveRows() === rowsBefore - 1,
          rowsBefore + " -> " + liveRows());
        /* The whole point of archive over delete. */
        ok("and the money does not move, because it still counts",
          totalText() === totalBefore, totalBefore + " -> " + totalText());
        const strip = [...document.querySelectorAll('[data-action="toggle-archived"]')].find(seen);
        ok("the list says it is shorter than it looks, and offers the way back",
          !!strip, strip ? strip.textContent.trim() : "nothing said");
        if (strip){
          await press(strip, 800);
          ok("and that way back actually shows them again",
            liveRows() === rowsBefore, rowsBefore + " vs " + liveRows());
        }
      }
    }
  } else {
    const w = window.innerWidth;
    skip("tapping a history row opens its sheet", "needs a phone; this pane is " + w + "px");
    skip("the sheet offers Archive, so the swipe is not the only way to reach it", "needs a phone");
    skip("the record is marked filed rather than removed", "needs a phone");
    skip("the row leaves the list", "needs a phone");
    skip("and the money does not move, because it still counts", "needs a phone");
    skip("the list says it is shorter than it looks, and offers the way back", "needs a phone");
    skip("and that way back actually shows them again", "needs a phone");
  }

  /* ==================================== 5. CURRENCY (money parsing, 2 of 6) */
  /* A round invented rate, so the conversion is checkable by eye. */
  await goTab("settings");
  await goSetting("trackers");
  const RATE = 50;
  if (g("new-currency-code") && g("btn-add-currency")){
    choose("new-currency-code", "USD");
    type("new-currency-rate", String(RATE));
    await press(g("btn-add-currency"), 800);
    ok("a tracked currency is stored with its rate",
      !!S(CUR).find(c => c.code === "USD" && c.rate === RATE), JSON.stringify(S(CUR)));

    await press(g("btn-fab-add"), 800);
    const moreBody = g("add-more-options");
    if (moreBody && moreBody.classList.contains("is-collapsed")) await press(g("btn-toggle-more-options"), 500);
    ok("currency and recurring are behind the More disclosure, and it opens them",
      seen(g("in-currency")) && seen(g("in-recurring")));

    choose("in-currency", "USD");
    type("in-amount", "10");
    await wait(400);
    const prev = g("in-currency-preview");
    ok("the form says what it will cost in pesos BEFORE it is saved",
      seen(prev) && /500/.test(prev.textContent), prev ? prev.textContent.trim() : "no preview");

    const fx = tag(" USD buy");
    type("in-desc", fx);
    choose("in-bank", "Test Bank");
    await press(g("btn-add"), 1000);
    const saved = S(EXP).find(e => e.description === fx);
    ok("it is stored converted, at the rate that was tracked",
      !!saved && saved.amount === 10 * RATE, saved ? saved.amount : "not saved");
    ok("and what was actually typed is kept beside it",
      !!saved && saved.originalAmount === 10 && saved.originalCurrency === "USD",
      saved ? saved.originalAmount + " " + saved.originalCurrency : "-");
  } else {
    skip("a tracked currency is stored with its rate", "the Trackers controls are not on this page");
    skip("currency and recurring are behind the More disclosure, and it opens them", "as above");
    skip("the form says what it will cost in pesos BEFORE it is saved", "as above");
    skip("it is stored converted, at the rate that was tracked", "as above");
    skip("and what was actually typed is kept beside it", "as above");
  }

  /* ================================================ 6. RECURRING (1 of 5) */
  await press(g("btn-fab-add"), 800);
  const body2 = g("add-more-options");
  if (body2 && body2.classList.contains("is-collapsed")) await press(g("btn-toggle-more-options"), 500);
  const repeat = g("in-recurring");
  if (repeat){
    if (!repeat.checked) await press(repeat, 450);
    ok("asking to repeat reveals the day to repeat on", seen(g("recurring-day-row")));
    choose("in-recurring-day", "15");
    const sub = tag(" subscription");
    type("in-desc", sub);
    type("in-amount", "350");
    choose("in-bank", "Test Bank");
    await press(g("btn-add"), 1100);
    const rule = S(REC).find(r => r.description === sub);
    ok("the rule is stored with the day it was given", !!rule && rule.dayOfMonth === 15,
      rule ? "day " + rule.dayOfMonth : "no rule");
    ok("and this month's entry is posted ONCE, not twice",
      S(EXP).filter(e => e.description === sub).length === 1,
      S(EXP).filter(e => e.description === sub).length + " entries");

    await goTab("settings"); await goSetting("budgeting");
    const rcard = g("recurring-card");
    ok("the rule is listed where the commitments are", seen(rcard),
      rcard ? rcard.textContent.replace(/\s+/g, " ").trim().slice(0, 60) : "no card");

    const expensesBefore = S(EXP).length;
    const x = rcard ? rcard.querySelector("button") : null;
    const realC = window.confirm; window.confirm = () => true;
    try { if (x) await press(x, 900); } finally { window.confirm = realC; }
    ok("deleting the rule stops the repeat", !S(REC).find(r => r.description === sub));
    /* The rule and the entry it already posted are different things. */
    ok("and leaves the entry it has already posted alone",
      S(EXP).length === expensesBefore, expensesBefore + " -> " + S(EXP).length);
  }

  /* ================================================ 7. THE SPREADSHEET OUT */
  const realCreate = URL.createObjectURL;
  let blob = null;
  URL.createObjectURL = function(b){ blob = b; return realCreate.call(URL, b); };
  try { await press(g("btn-export-csv"), 900); } finally { URL.createObjectURL = realCreate; }
  const csv = blob ? await blob.text() : null;
  ok("the spreadsheet export produces a file", !!csv, csv ? csv.length + " bytes" : "nothing");
  if (csv){
    const live = S(EXP);
    const missing = live.filter(e => csv.indexOf(e.description) < 0);
    ok("every expense on file is in it", missing.length === 0,
      missing.length ? missing.map(e => e.description).join(", ") : live.length + " rows");
    ok("with the amount each was entered at",
      live.every(e => csv.indexOf(String(e.amount)) > -1));
    /* The same rule the backup follows: a sync token is this device's, and an
       export is a file that leaves the device. */
    ok("and no sync token in it", !/gh[pousr]_[A-Za-z0-9]{10,}/.test(csv));
  }

  /* ---------------------------------------------------------------- report */
  const failures = R.filter(r => !r.pass);
  return {
    total: R.length,
    passed: R.filter(r => r.pass && !r.skipped).length,
    skipped: R.filter(r => r.skipped).length,
    failed: failures.length,
    failures: failures.map(r => r.name + "  [" + r.detail + "]"),
    all: R.map(r => (r.skipped ? "SKIP  " : r.pass ? "PASS  " : "FAIL  ") + r.name +
      (r.detail ? "   (" + r.detail + ")" : ""))
  };
  })();
})()
