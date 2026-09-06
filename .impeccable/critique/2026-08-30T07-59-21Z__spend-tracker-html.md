---
target: spend-tracker.html
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-30T07-59-21Z
slug: spend-tracker-html
---
Method: dual-agent (A: design review · B: detector + browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Toast is the whole feedback layer and renders white-on-near-white (1.11:1). Nav shows no active item on the Add tab. |
| 2 | Match System / Real World | 3 | Copy is excellent and PH-native; the brand mark is `$` above a ₱ hero. |
| 3 | User Control and Freedom | 2 | Undo exists on every delete and is invisible for its whole 6s window. |
| 4 | Consistency and Standards | 3 | Same money field rendered two ways (bare number input in History, ₱-wrapped in Savings). "Backup" is a tab that opens an overlay. |
| 5 | Error Prevention | 1 | `importJSON` native `confirm()`: OK = wipe everything, labelled "(recommended)", Enter-activated, no snapshot. |
| 6 | Recognition Rather Than Recall | 2 | Hero figure's definition lives only in a hover `title` — no keyboard, no touch. 7 unlabeled mobile icons. |
| 7 | Flexibility and Efficiency | 2 | 3 keyboard bindings in 8,171 lines. Command palette has zero arrow-key handling. |
| 8 | Aesthetic and Minimalist Design | 2 | History renders 90 visible interactive controls. `#money-overview-row` is a 2-col grid holding 3 tiles. |
| 9 | Error Recovery | 2 | Good messages, no `aria-invalid`/`aria-describedby`; toast-borne errors invisible; "Loan removed." omits the ₱5,000 it moved. |
| 10 | Help and Documentation | 3 | Strong contextual copy (withholding tax, tiered rates, CSV limits); zero shortcut discovery. |
| **Total** | | **22/40** | **Acceptable (55%)** |

## Design Specificity Verdict

**The logic is bespoke; the surface is rented.**

Bespoke: `SAVINGS_PROVIDERS` is a real list of PH banks and e-wallets. Tiered savings modelled as cap + over-rate because Maya works that way. 20% withholding tax defaulted and explained. `KEYWORD_MAP` contains jeep, tricycle, MRT, Grab, Jollibee, Shopee, condo dues, load. `toLocalISO()` exists with written justification about UTC+8. And `#btn-backsolve-rate` — "if you already know the actual gross interest you received, use this instead" — inverts the input because a GCash user knows "₱475 landed" and not "2.6% p.a.". That could not be designed by someone who hadn't lived it.

Rented: teal-on-near-black, 12-column bento, count-up hero, gradient stat icons, insight chips with coloured rails. Swap the strings for MRR and churn and a Stripe dashboard wears it unchanged. Six of seven nav icons are generic.

The tell: the brand mark is `$`. The file embeds ~85KB of Inter's latin-ext subset specifically so the ₱ glyph matches its digits — that reasoning is a comment in the stylesheet — then puts a dollar sign in the logo above a ₱515,470 hero.

Second tell: the product's actual thesis — this is yours, it never leaves this machine — appears twice, both at 12.5px. The most distinctive fact about the product is set in the smallest type in the file.

**Deterministic scan:** 54 findings, exit 2. `low-contrast` ×18 (REAL — 17 trace to one token), `gpt-thin-border-wide-shadow` ×26 (false positive: the tokenised elevation ladder), `tiny-text` ×3 and `undersized-ui-text` ×1 (REAL), `overused-font` ×1 and `em-dash-overuse` ×1 (false positives: Inter is deliberate; em-dashes are in code comments). Overlay scan added 16 visible `undersized-ui-text` and 6 `nested-cards`.

**Methodological finding:** the detector runs DEGRADED by default — HTML parser modules absent, so custom properties, selector matching and computed contrast are not evaluated. Default run = 12 findings; with parsers installed = 54. A 4.5× undercount.

## Priority Issues

### [P0] The toast is white-on-white — every Undo, error and budget warning is invisible
`#toast` sets `background: var(--ink)` (#F2F3F5) and `color: var(--on-accent)` (#fff). Measured 1.11:1 for text, 1.69:1 for the Undo button.
Why: the toast is the entire feedback layer. It carries `showUndoToast` — the sole safety net for every deletion in the app, including deletions that silently move money between savings accounts — on a 6,000ms timer. It also carries the just-in-time budget warning and the withdrawal-failure path.
Pre-existing, not a regression: the original file had `color:#fff` on the same background. The token pass preserved it faithfully.
Fix: `#toast{ background: var(--card); color: var(--ink); border:1px solid var(--line); }`, `.toast-undo{ color: var(--accent-dark); }`, plus `role="status" aria-live="polite"`.
Command: /impeccable audit

### [P0] `--on-accent: #fff` fails contrast on every primary button — one token, 17 findings
White on `--accent` #22D3C5 = 1.88:1; on `--accent-dark` hover = 1.49:1 (worse on hover). Affects every primary button, the FAB glyph and the `$` mark.
Fix: `--on-accent: #0B0D10` → 10.37:1 normal, 13.08:1 hover. One line.
Command: /impeccable audit

### [P1] "Replace everything" is bound to Enter, with no snapshot
`importJSON` uses native `confirm()` where OK = destroy every record, worded "(recommended when restoring)". Native confirm focuses OK; Enter fires it. The handler then clears 11 stores and persists immediately.
Why: the only irreversible action in an app that otherwise undoes everything, and the one place the safe choice isn't the default.
Fix: snapshot to `spendly_preimport_backup_v1` before clearing; in-app dialog defaulting to Merge, Replace demoted to `.btn-danger-text`.
Command: /impeccable harden

### [P1] History is 90 form controls, and the amount column can't be scanned
Every cell is a permanent live input — 90 visible controls for 10 rows. Amounts render as raw left-aligned numbers with no ₱, no separators, inconsistent decimals ("1624.3" beside "254.19"), no tabular figures — while the dashboard uses `fmtMoneyRich` and Savings wraps the same field with ₱.
Fix: render as formatted text, swap to input on click/focus (the `.sub` already promises "Click any field to fix…"). Move Remove behind row hover.
Command: /impeccable layout

### [P1] `--ink-dim` was fixed against one background only
The `:root` comment says it was raised to clear 4.5:1. Verified: 4.54:1 on `--card` (pass), 4.17:1 on `--raised`, 3.48:1 on `--accent-light` (both fail). Every hint inside a nested surface is under AA. Both agents computed these independently and agree exactly.
Command: /impeccable audit

### [P2] Mobile: 43 undersized touch targets, Settings scrolls horizontally
43 unique control combos under 44×44 out of 177. Worst: row-select checkboxes at 16×16, savings checkbox 18×18, most buttons 31–38px tall. Measured on Comfortable; Compact is worse. Settings overflows 37px at 375px — the sub-tab row neither wraps nor scrolls, clipping "About". Each mobile expense card is 349px tall, so two fit per screen.
Command: /impeccable adapt

## Persona Red Flags

**Alex (power user):** 3 keyboard bindings in 8,171 lines. The command palette has zero ArrowDown/ArrowUp handling — hit `/`, type, then reach for the mouse. `/` is advertised nowhere (0 hits for `kbd`, `shortcut`, "Press /"). `addExpense` clears fields but never re-focuses, so rapid entry breaks after the first record. Tabbing History costs 8 stops per row — ~1,760 presses for 220 expenses.

**Sam (accessibility-dependent):** 8 `aria-label`, 4 `aria-hidden`, and **zero** `role`, `aria-live`, `aria-current`, `aria-invalid`, `aria-describedby`, `aria-expanded` in the entire file. The toast has no `role="status"` — every confirmation, error and **every Undo offer** is silent, on a 6-second timer. `markFieldInvalid` focuses the field but the error text is never announced. Both overlays lack `role="dialog"`, focus trap and focus restoration. Nav conveys the active tab by CSS class only.

Confirmed strength: keyboard reachability is clean (0 of 177 controls unreachable) and focus indicators are genuinely present — 32/32 real Tab presses produced a visible 2px teal ring at 10.37:1. B's initial "4 fields have no focus indicator" reading was a measurement artifact and is withdrawn.

## Minor Observations

- Hero definition lives only in `bar.title`; the static markup's `title` still carries an older, incorrect formula.
- `#money-overview-row` is `stat-row two` (2 columns) populated with 3 tiles — 242px of dead space in the dashboard's primary card.
- `guessCategory` uses bare `includes()` with no word boundaries: "load" matches "download", "gas" matches "Vegas", "market" matches "Marketing".
- The Add surface has no nav representation; nav shows nothing selected during the app's primary task.
- "Backup" is styled as the 7th tab but opens an overlay.
- Onboarding puts "Log your first entry" third, behind enumerating bank balances.
- History `.sub` says "Click any field to fix…" but fields are always inputs — copy describes an interaction the UI doesn't have.
- `--line` on `--card` is 1.23:1 — table borders are effectively invisible.
- Charts are the one thing that won't work offline from a USB stick (Chart.js CDN).

## Questions to Consider

1. If every action is undoable except the one that destroys all of it, does that decision belong in a native `confirm()`?
2. 177KB of font was embedded so ₱ matches its digits — and the logo is `$`. Which decision reflects what this product is?
3. History is the only screen with no read mode. Is editing genuinely the common case, or was 220 inputs less code than text plus an edit affordance?
4. The insight writer will say "Transport is over budget" and "Bills is over budget" in the same breath. Who is that for, on a bad month, in an app one person opens?
5. This is one person's private ledger. What is the amber backup nag apologising for, and would a silent auto-export be more honest than a permanent bar above the hero?
