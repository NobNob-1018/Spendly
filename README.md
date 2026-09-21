# Spendly — Single-File Personal Finance Tracker

A self-contained personal finance app. **One HTML file, no build step, no dependencies to install.**
Open `index.html` in a browser and it runs.

- **~9,140 lines total** — ~2,720 CSS, ~5,770 JS, ~645 HTML (602 KB)
- **203 functions**, all in one inline `<script>`
- **Only external dependency:** Chart.js, lazy-loaded from CDN on first visit to Charts
- **All data lives in `localStorage` on the user's device.** Nothing is sent anywhere
  *unless you explicitly turn on device sync* (Settings → Sync), which is off by default.
  When on, records go to one **private gist on your own GitHub account** — no third-party
  server. The token is stored on that device only and is deliberately excluded from every
  backup, so an exported file never carries a credential.

---

## Non-negotiable constraints

Please preserve these unless explicitly asked otherwise:

1. **Stays a single portable HTML file.** No bundler, no npm, no split into modules. The whole point is that it can be emailed, dropped on a USB stick, or opened offline.
2. **No frameworks.** Vanilla JS/CSS only. Don't introduce React/Vue/Tailwind.
3. **Data integrity beats features.** This is the user's only copy of their financial records. See "Money invariants" below.
4. **Every animation respects `prefers-reduced-motion`.**

---

## Architecture

### Storage layer
All persistence goes through one factory:

```js
const someStore = makeStore(KEY, defaultValue, notify);
someStore.load();   // returns a *clone* of the default if unset
someStore.save(v);  // returns true/false — guarded against quota errors
```

18 localStorage keys, all prefixed `spendly_*_v1`. Key ones:
`expenses`, `incomes`, `categories`, `budgets`, `recurring`, `savings`,
`loans_given`, `loans_taken`, `investments`, `currencies`, `crypto`,
`networth_history`, `corrections`, `ui_prefs`.

`save()` is wrapped in try/catch — a full or blocked localStorage shows a persistent
red "Not saved" indicator instead of falsely reporting success.

### Tabs
Seven panels, six in the tab bar: `dashboard`, `charts`, `history`, `savings`, `loans`, `settings` — plus `add`, which is reached only from the floating button.
Switching goes through `activateTab(name)`.

`add` is a real `<section class="tab-panel">` reached only from the floating button,
which is deliberate: it is an action, not a place, and having it in both the tab bar
and the FAB gave two controls for one thing. The trap to avoid is that with no tab-bar
entry, landing on Add leaves every nav item unselected and `aria-current` on nothing,
so the app reports no current location at all. `activateTab` therefore puts the
current-location state on the FAB whenever Add is showing. Backup is the same kind of
thing in reverse: it opens an overlay rather than changing where you are, so it sits in
the header beside search instead of in the tab bar.

### Keyboard
| Key | Does |
|---|---|
| `/` | Open the command palette |
| `1`–`6` | Jump to that tab |
| `↑` `↓` | Move through palette results |
| `Enter` | Run the highlighted result |
| `Esc` | Close the palette or the backup overlay |

Digit and `/` shortcuts share one `isTyping` guard, so they never steal a keystroke
from an amount field.

### Money invariants (**read before touching financial logic**)

- **All money math routes through `round2()`** (57 call sites). Unguarded float
  arithmetic drifts — verified: 1,000 chained `+0.10` operations stay exact with
  `round2`, drift to `99.9999999999986` without it.
- **`depositToSavings()` / `withdrawFromSavings()` are the only ways balances change** —
  they currently appear on **19 lines each, and that parity is meaningful**: every add has a
  matching reverse (delete, undo, status flip, account relink). If you add a money
  path, add its reversal too.
- **`withdrawFromSavings()` clamps at zero** and reports a shortfall rather than going negative.
- **Settled records don't reverse.** Deleting a *repaid* loan or a *sold* investment must
  not move money — that transaction already closed.
- **Total Money = liquid cash only** (savings + unsold investments). Outstanding loans are
  shown separately, deliberately. `computeNetWorth()` is the fuller figure used by the trend chart.

### Shared helpers (prefer these over new one-offs)

| Helper | Purpose | Call sites |
|---|---|---|
| `paginate(list, page, size)` | Pagination + renders the bar | 5 |
| `buildThFilter(...)` | Filter dropdown fused into a table header | 12 |
| `buildSortableTh(...)` | Sortable column header | 8 |
| `wireNotes(...)` | Full notes lifecycle for a row/card | 4 |
| `setupCollapseToggle(...)` | Collapsible section, persists state | 4 |
| `showUndoToast(msg, fn)` | Destructive action with undo | 8 |
| `emptyStateHtml(...)` | Consistent empty states | 13 |
| `convertToPHP(amt, code)` | Currency conversion for entry | 2 |
| `fmtMoney` / `fmtMoneyRich` | Plain text vs HTML (de-emphasised ₱/cents) | 48 / 20 |

**`fmtMoney` vs `fmtMoneyRich`:** `fmtMoneyRich` returns HTML and is only safe where
markup renders. Toasts, tooltips, and anything set via `textContent` must use plain `fmtMoney`.

### Design tokens
CSS custom properties at the top of `<style>`: spacing (`--sp-1`…`--sp-6`),
radius (`--r-sm/md/lg/pill`), tracking (`--track-caps`, `--track-tight`), and colors.

**Important:** `--hover` and `--selected` are distinct from `--accent-light` on purpose.
`--accent-light` is a *static* tinted surface; using it for hover made hover feedback
invisible on elements already using it as a background.

### Backup & restore
- **JSON export = the real backup.** 13 keys, full round-trip verified.
- **CSV export = read-only.** Sectioned, multi-table, opens in Excel/Sheets. *Cannot be
  imported back* — `importCSV` explicitly detects and rejects it.
- Import offers **Replace or Merge**. Replace must clear *everything* it restores
  (including currencies, crypto, net worth history, corrections) — this was a bug once.

---

## Install and updates

The file is also a **PWA**, which is the answer to "I don't want to keep sending myself
the file". Published to GitHub Pages, a phone can add it to the home screen, and after
that it updates itself.

| File | Job |
|---|---|
| `manifest.webmanifest` | Name, icon, colours, and `display: standalone` so it opens without browser chrome |
| `icon.svg` | The home-screen mark. Maskable, so Android's circle crop does not cut the glyph |
| `sw.js` | The update engine and the offline copy |
| `.nojekyll` | Stops Pages running the files through Jekyll |

**How an update reaches the phone.** The service worker serves the shell
*stale-while-revalidate*: you get the cached copy immediately, which is what makes a
602 KB file open instantly, and a fresh copy is fetched in the background. So a change
pushed to `main` lands on the phone at its **next open**, silently. Push, wait for Pages,
open the app twice.

Bump `VERSION` in `sw.js` on a release you want to be certain about — the `activate`
handler deletes every cache not in the current set, so the bump is also the eviction.

**The worker only registers on https and localhost.** It cannot register from `file://`,
which is still how the desktop copy is opened, so the registration is guarded and its
failure is caught. The app runs identically with no worker at all.

**Chart.js is cached separately and cache-first**, because the URL is version-pinned and
SRI-checked and therefore immutable. Requests to the GitHub API (device sync) are never
cached — handing back a stale copy of your own records is the one thing this must not do.

> **`localStorage` is scoped to the origin.** The hosted copy
> (`https://<user>.github.io/spendly/`) is a *different origin* from a local `file://`
> copy, so records do not carry across on their own. Export a backup from the old copy
> and import it once on the new one; after that, Settings → Sync keeps devices together.

---

## Known open items

- **#2 from an earlier list:** fixed column-width proportions across the five tables
  (currently auto-sized, so widths shift between pages).
- Two spacing tokens (`--sp-1`, `--sp-6`) are defined but unused — intentional scale endpoints.
- `migrateLegacyBalance` and `initRecurringDayOptions` are named IIFEs. `tools/audit-deadcode.js`
  understands the difference between a declaration and a self-invoking expression, so it will
  not report them — but a plain grep still will. Don't delete them.

## Verification

`index.html` is the build. There is no source it is generated from — edit it directly.

### The gates — run all five after every edit batch, and never pipe them

```bash
node verify.js
```

Scripts parse, CSS braces and `<div>`s balance, no undefined CSS variables, and
`depositToSavings` / `withdrawFromSavings` stay in step. This replaces the python
one-liner and the greps that used to live here.

```bash
node sync-audit.js
```

37 checks. Two devices merge without duplicating or losing a record.

```bash
node audit-round2.js
```

34 checks. Budgets, categories and deletions survive a sync; a repaint cannot land
on a field being typed in; a logged entry reaches the screen.

```bash
node balance-audit.js
```

33 checks. Account arithmetic — no money created, no spend counted twice.

```bash
node sync-devices-audit.js
```

23 checks. The loan payment-ledger merge, against records the app itself wrote.

### The auditors in `tools/`

Three run under plain `node`:

```bash
node tools/audit-wiring.js
node tools/audit-deadcode.js
node tools/prune-dead-css.js
```

Wiring proves every control reaches a live handler. The dead-code pass reports
uncalled functions, unread ids and CSS classes nothing wears — candidates, not
verdicts. The pruner removes dead rules and needs `--write` to do anything.

Three run **inside the page**, because they measure what the browser actually did:

```bash
node tools/serve.js      # http://localhost:8899
```

Then, from the console on that page:

```js
eval(await fetch("/tools/audit-layout.js").then(r => r.text()))     // geometry
eval(await fetch("/tools/audit-contrast.js").then(r => r.text()))   // WCAG AA
eval(await fetch("/tools/audit-functions.js").then(r => r.text()))  // 61 checks
```

`audit-layout` finds overlapping text, collapsed grids and content painting outside
its box. `audit-contrast` composites every background through alpha and checks the
ratio. `audit-functions` presses the real controls — logs entries, records loan
payments, checks interest — and asserts on what is visible; it needs
`tools/audit-seed.js` run first, then a reload.

> **`tools/audit-seed.js` WIPES the store for whatever origin it runs on.** The lab
> that used to namespace these keys is gone. On localhost that is a throwaway dev
> store; never point it at the deployed app.

Sweep at 375, 768, 1024 and 1440 in both editions, over every tab and every page
group. A collapsed viewport reports the whole app as broken, so `audit-layout`
refuses below 320px rather than lying.
