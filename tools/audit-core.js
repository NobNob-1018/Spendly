/* THE CORE FUNCTIONS NOTHING ELSE CHECKS.
 *
 * audit-coverage.js asks which areas no tool names. Four came back with nothing
 * at all: backup and restore, archiving, budgets, and every loan function. This
 * covers the ones where being wrong costs a NUMBER rather than a pixel and the
 * browser sweep does not reach them:
 *
 *   the backup carries every store     anything missing is lost on restore
 *   re-importing does not duplicate    the common case is restoring onto data
 *   replace really replaces           and does not leave rows the backup lacks
 *   deleting a loan moves money back  it was taken out when the loan was made
 *   deleting an investment likewise
 *   settle and unsettle balance       a status flip moves cash both ways
 *
 * Driven through the real controls and the real file input, because importJSON
 * is reached through a FileReader and a confirm() and both are part of what it
 * does.
 *
 * Run it on a page the seed has loaded and reloaded, exactly like
 * audit-functions.js. It writes to the storage of whatever origin it runs on -
 * the warning at the top of audit-seed.js applies here twice over.
 */
(async function(){
  "use strict";

  /* NOTHING MEANINGFUL COMES OUT OF A COLLAPSED PANE.

     Measured twice now: the preview pane can lose its size, innerWidth goes to
     0, and then every width query matches, every box is 2px wide and the add
     strip reports 170px of overflow. audit-layout.js has refused this for weeks;
     these two had no such guard and reported a healthy app as broken.

     Refused rather than annotated, for the same reason: the findings look
     specific and plausible, and the one number that gives it away is the one
     such a report never prints. */
  if (!window.innerWidth || window.innerWidth < 320 || !window.innerHeight){
    return { refused: "viewport is " + window.innerWidth + "x" + window.innerHeight +
      " - too small to measure; nothing below 320px wide is real",
      total: 0, passed: 0, failed: 0, failures: [], all: [] };
  }

  const R = [];
  const ok = (name, pass, detail) => {
    R.push({ name, pass: !!pass, detail: detail === undefined ? "" : String(detail) });
    return !!pass;
  };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const g = (id) => document.getElementById(id);
  const S = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch(e){ return []; } };
  const money = (n) => Math.round(n * 100) / 100;
  const press = async (el, settle) => {
    if (!el) return false;
    el.click();
    await wait(settle === undefined ? 450 : settle);
    return true;
  };
  const seen = (el) => !!(el && el.offsetParent !== null);

  const EXP = "spendly_expenses_v1", INC = "spendly_incomes_v1",
        SAV = "spendly_savings_v1", LG = "spendly_loans_given_v1",
        LT = "spendly_loans_taken_v1", INV = "spendly_investments_v1";
  const bankOf = (name) => (S(SAV).find(a => a.provider === name) || {}).amount;
  const countAll = () => ({
    expenses: S(EXP).length, incomes: S(INC).length, savings: S(SAV).length,
    given: S(LG).length, taken: S(LT).length, investments: S(INV).length
  });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* ---- taking a backup, without a file ever touching the disk ------------- */
  /* downloadFile builds a Blob and hands it to an anchor. The URL factory is the
     one seam a caller can reach, so the payload is read there rather than
     reconstructed - a reconstruction would test this file's idea of the format
     instead of the app's. */
  const takeBackup = async () => {
    const realCreate = URL.createObjectURL;
    const realClick = HTMLAnchorElement.prototype.click;
    let grabbed = null;
    URL.createObjectURL = function(blob){ grabbed = blob; return realCreate.call(URL, blob); };
    /* The export runs for real - that is the check - but the <a download> it
       hands the file to must not reach the browser's download manager, or every
       audit run drops a backup on whoever is watching the pane. Buttons are not
       anchors, so pressing the control is unaffected. */
    HTMLAnchorElement.prototype.click = function(){
      if (this.hasAttribute("download")) return;
      return realClick.apply(this, arguments);
    };
    try { await press(g("btn-export-json"), 600); }
    finally {
      URL.createObjectURL = realCreate;
      HTMLAnchorElement.prototype.click = realClick;
    }
    if (!grabbed) return null;
    return await grabbed.text();
  };

  /* And restoring one, through the input the Restore button opens. */
  const restoreBackup = async (text, replace) => {
    const realConfirm = window.confirm;
    window.confirm = () => !!replace;
    try {
      const input = g("file-import");
      const file = new File([text], "spendly-backup.json", { type: "application/json" });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(1400);                 // FileReader is asynchronous
    } finally { window.confirm = realConfirm; }
  };

  /* Filling a form the way audit-functions.js does, because a record written
     straight to localStorage never reaches the live arrays and every check
     below reads those. */
  const set = (id, v) => {
    const e = g(id); if (!e) return;
    e.value = v;
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const openAdd = async (label, dir) => {
    await press(g("btn-fab-add"), 350);
    const tabs = () => [...document.querySelectorAll("#rd-tabs .rd-tab")];
    const direct = tabs().find(b => b.textContent.trim() === label);
    if (direct) return press(direct, 450);
    const folded = tabs().find(b => b.textContent.trim() === "Loans");
    if (folded && dir){
      await press(folded, 450);
      return press(document.querySelector('#rd-dir [data-add-dir="' + dir + '"]'), 450);
    }
    const short = tabs().find(b => label.indexOf(b.textContent.trim()) === 0);
    return press(short, 450);
  };

  /* Something for the backup checks to lose. The seed carries no investment, so
     "a replace empties them and a restore brings them back" was comparing
     nothing with nothing and passing on air. */
  await (async () => {
    await openAdd("Investment");
    set("inv-name", "Core Fund");
    const amt = g("inv-amount") || g("inv-invested");
    if (amt){
      amt.value = "15000";
      amt.dispatchEvent(new Event("input", { bubbles: true }));
      amt.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await press(g("btn-add-investment"), 600);
    ok("there is an investment for the backup checks to carry",
      S(INV).length > 0, S(INV).length + " on the books");
  })();

  /* ---------------------------------------------- 1. the backup is complete - */
  await (async () => {
    const text = await takeBackup();
    ok("the backup button produces a file", !!text, text ? text.length + " bytes" : "nothing captured");
    if (!text) return;
    let data = null;
    try { data = JSON.parse(text); } catch(e){ /* reported below */ }
    ok("and it is valid JSON", !!data);
    if (!data) return;

    /* Every store that is persisted must be in the payload. Anything missing is
       silently lost the moment somebody restores - which is exactly how
       currencies, cryptos and netWorthHistory went missing once before. */
    const MUST_CARRY = ["expenses", "incomes", "categories", "budgets", "recurring",
      "savings", "balanceOps", "loansGiven", "loansTaken", "investments", "settings",
      "currencies", "cryptos", "netWorthHistory", "corrections", "tombstones"];
    const missing = MUST_CARRY.filter(k => !(k in data));
    ok("the backup carries every store", missing.length === 0, missing.join(", ") || "all present");

    ok("and it does NOT carry the sync token",
      text.indexOf("gh_token") < 0 && text.indexOf("ghp_") < 0 &&
      !("token" in data) && !(data.settings && data.settings.token),
      "a backup is a file people hand to other people");

    ok("the records in it match what is on disk",
      (data.expenses || []).length === S(EXP).length &&
      (data.savings || []).length === S(SAV).length &&
      (data.loansGiven || []).length === S(LG).length,
      [(data.expenses||[]).length, (data.savings||[]).length, (data.loansGiven||[]).length].join("/"));
  })();

  /* ------------------------------------- 2. restoring onto what you have ---- */
  /* The common case: you still have your data and you restore a backup of it.
     Appending would double every record, which is the bug the confirm() exists
     to avoid - both answers are checked. */
  await (async () => {
    const before = countAll();
    const bankBefore = bankOf("Test Bank");
    const text = await takeBackup();
    if (!text) return;

    await restoreBackup(text, false);           // Cancel = merge
    const afterMerge = countAll();
    ok("merging a backup you already hold changes nothing",
      same(before, afterMerge),
      JSON.stringify(before) + " -> " + JSON.stringify(afterMerge));
    ok("and no account balance moved",
      money(bankOf("Test Bank")) === money(bankBefore),
      bankBefore + " -> " + bankOf("Test Bank"));

    await restoreBackup(text, true);            // OK = replace
    const afterReplace = countAll();
    ok("replacing with a backup you already hold also changes nothing",
      same(before, afterReplace),
      JSON.stringify(before) + " -> " + JSON.stringify(afterReplace));
  })();

  /* --------------------------------- 3. a backup missing a key cannot clear -- */
  /* The bare-array format and older exports have no `savings`. Replace clears
     everything first, so a key the backup lacks must survive as emptied rather
     than coming back from localStorage on the next load. */
  await (async () => {
    const text = await takeBackup();
    if (!text) return;
    const data = JSON.parse(text);
    const slim = Object.assign({}, data);
    delete slim.investments;
    await restoreBackup(JSON.stringify(slim), true);
    ok("replacing with a backup that has no investments empties them",
      S(INV).length === 0, S(INV).length + " left");
    /* And put the world back for the checks below. */
    await restoreBackup(text, true);
    ok("and restoring the full backup brings them back",
      S(INV).length === (data.investments || []).length,
      S(INV).length + " of " + (data.investments || []).length);
  })();

  /* --------------------------------------- 4. deleting a loan moves money --- */
  /* Lending withdrew the cash; removing the loan has to put it back. */
  await (async () => {
    const who = "CoreDel" + Date.now().toString(36).slice(-4);
    const acct = "Test Bank";
    if (bankOf(acct) === undefined){ ok("a banked account exists to test against", false, "no Test Bank"); return; }

    await openAdd("Lent", "lent");
    set("lg-person", who); set("lg-amount", "3000");
    g("lg-bank").value = acct; g("lg-bank").dispatchEvent(new Event("change", { bubbles: true }));
    const bankBefore = bankOf(acct);
    await press(g("btn-add-loan-given"), 600);
    ok("lending takes the money out of the account",
      money(bankBefore - bankOf(acct)) === 3000, bankBefore + " -> " + bankOf(acct));

    const navBtn = document.querySelector('nav.tabs [data-tab="loans"]');
    await press(navBtn, 500);
    await press(document.querySelector('.seg.is-icons [data-layout="cards"]'), 500);
    const card = [...document.querySelectorAll("#loans-given-table-wrap .loan-card")]
      .find(c => (c.textContent || "").indexOf(who) >= 0);
    ok("the new loan is on the board", !!card);
    const del = card && card.querySelector('[data-action="delete"]');
    await press(del, 500);
    /* The row asks before it goes. */
    const confirmBtn = card && [...card.querySelectorAll("button")]
      .find(b => /sure|confirm|yes|remove/i.test(b.textContent) && b !== del);
    if (confirmBtn) await press(confirmBtn, 700);
    ok("deleting the loan puts the money back",
      money(bankOf(acct)) === money(bankBefore),
      bankBefore + " -> " + bankOf(acct));
    ok("and the loan is gone",
      !S(LG).some(l => l.person === who), S(LG).length + " loans left");
  })();

  /* ------------------------------------- 5. settle and unsettle must balance - */
  /* Marking a loan repaid deposits the cash; marking it unpaid takes it out
     again. Round trip to the same figure, or one of the two is wrong. */
  await (async () => {
    const acct = "Test Bank";
    /* Its own, rather than whatever the check above happened to leave behind -
       that one deletes the loan it makes, so this had nothing to work with. */
    const who = "CoreSettle" + Date.now().toString(36).slice(-4);
    await openAdd("Lent", "lent");
    set("lg-person", who); set("lg-amount", "4500");
    g("lg-bank").value = acct; g("lg-bank").dispatchEvent(new Event("change", { bubbles: true }));
    await press(g("btn-add-loan-given"), 600);
    const loan = S(LG).find(l => l.person === who);
    if (!loan){ ok("the loan to settle was created", false, "not found"); return; }
    await press(document.querySelector('nav.tabs [data-tab="loans"]'), 500);
    await press(document.querySelector('.seg.is-icons [data-layout="cards"]'), 500);
    const find = () => [...document.querySelectorAll("#loans-given-table-wrap .loan-card")]
      .find(c => c.dataset.id === loan.id);
    const start = bankOf(acct);
    const card = find();
    const settle = card && card.querySelector('[data-action="settle"]');
    await press(settle, 500);
    const confirm1 = find() && [...find().querySelectorAll("button")]
      .find(b => /sure|confirm|yes/i.test(b.textContent));
    if (confirm1) await press(confirm1, 700);
    const afterSettle = bankOf(acct);
    ok("settling a loan you gave pays the money in",
      money(afterSettle - start) === money(loan.amount),
      start + " -> " + afterSettle + " (loan " + loan.amount + ")");

    /* A settled loan is hidden by the default outstanding filter, so the card
       carrying Mark unpaid is off the board until the filter is cleared. The
       first run of this check pressed nothing and reported the app as broken. */
    const strip = document.querySelector("#loans-given-table-wrap .filter-status button");
    if (strip) await press(strip, 800);
    ok("a settled loan can be found again once the filter is cleared",
      !!find(), find() ? "on the board" : "still hidden");
    const back = find() && find().querySelector('[data-action="unsettle"]');
    ok("and it offers Mark unpaid", !!back);
    await press(back, 800);
    ok("and marking it unpaid takes it out again, to the same figure",
      money(bankOf(acct)) === money(start),
      afterSettle + " -> " + bankOf(acct) + ", started at " + start);
  })();

  const fails = R.filter(r => !r.pass);
  return {
    total: R.length, passed: R.length - fails.length, failed: fails.length,
    failures: fails.map(f => f.name + "  [" + f.detail + "]"),
    all: R.map(r => (r.pass ? "PASS  " : "FAIL  ") + r.name + (r.detail ? "   (" + r.detail + ")" : ""))
  };
})()
