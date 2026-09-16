# design-lab

Three offline test copies of Spendly, one per design approach, so they can be
compared side by side against the same data.

| File | Built by | Design authority |
|---|---|---|
| `unai-only.html` | `/unai` | The un-ai-ify video corpus, alone. Every other design skill ignored. |
| `unai-team.html` | `/unai-team` | The corpus at layer 3; layers 1–2 set direction, the rest fill the gaps. |
| `ui-only.html` | `/ui` | The nine-skill stack. No un-ai-ify. |

## These are tests. They cannot touch the real app.

Each copy carries a harness injected ahead of the app's own code, so the app
below it is unmodified and a diff against `index.html` shows only design work.

- **Storage is namespaced** (`LAB_UNAI_`, `LAB_UNAITEAM_`, `LAB_UI_`).
  `localStorage` is scoped to the *origin*, not the path — without this, a copy
  served from the same site would read and **write** the real records.
- **No route to GitHub.** Sync is off because the namespaced token key is empty,
  and any request to the API is rejected outright regardless.
- **No service worker.** The live one has scope over the whole site and would
  otherwise cache these pages.
- **Seeded with invented data** — roughly four months of ordinary use. The real
  backup is financial records and this repo is public, so none of it is real.
- **A `TEST BUILD` badge** sits in the corner, deliberately styled outside the
  app's tokens so a redesign cannot restyle it away. Its `reset` button wipes
  only that variant's namespace.

## Viewing them

    node design-lab/serve.js

then open `http://localhost:8899/design-lab/<file>.html`. Opening the file
directly with `file://` works too; only the lazy-loaded Chart.js needs network.

## Rebuilding

`build.js` regenerates all three from the current `index.html`:

    node design-lab/build.js

**It overwrites the three HTML files.** That is what you want before any design
work has started, and never after — re-running it discards a redesign. Edit
`seed.js` and re-run it first if the seed data needs to change.

## Checking a variant before calling it done

Two auditors live here. Both are expressions, not modules: fetch one and
`eval` it inside the page being audited. Each file's own header has the
snippet.

`audit-layout.js` measures geometry rather than reading text, because reading
text is how three rounds of visible defects got past review: a seven-column
chart collapsed to 60px still reports the right seven day names.

It reports overlapping text, grids whose tracks computed to zero, elements
whose **box** is outside their container, elements whose **ink** is wider than
their own box with nothing downstream to clip it, sticky elements given a
**non-zero** offset inside a scroll container, and text clipped with no
ellipsis.

The ink check exists because a rect is where the box is and `scrollWidth` is
where the glyphs are. The ledger's today figure sat perfectly inside its parent
by rect while painting 51px past its column, so every rect-based check passed
it — and it was the break visible in a screenshot.

> **It audits the whole document, not the open tab panel.** It used to scope
> itself to the active `.tab-panel`, which is fine for a design whose surface
> IS a panel and useless for one whose surface is not. The ledger's frame is a
> sibling of the panels, so for that variant the auditor was measuring a hidden
> panel inside a closed drawer and reporting clean without having looked. If you
> narrow the scope again, check what falls outside it first.

`audit-contrast.js` composites the real background through every ancestor —
honouring alpha — and compares it with the real foreground, then reports
anything under WCAG AA for its size. When contrast was finally measured rather
than assumed, all three variants failed, including the colour meaning *money
arriving* at 4.41 and a fourth ink level at 1.98 that was carrying meaning.

Sweep **every variant x every tab x {420, 900, 1400, 1900}px**, and a variant
with two editions in **both of them** — the accents that work on paper are the
ones that vanish at night.

### What each auditor cannot see, and says so

Neither one is allowed to guess. Both name what they could not measure rather
than reporting it as a fault, because a checker that cries wolf is one nobody
reads the fourth time.

- **audit-contrast** stops at a gradient or an image and lists the element
  under `unmeasurable`. The first version had no such rule and reported the
  masthead's gradient-filled mark as a 1.1 failure, because computed
  `backgroundColor` for a gradient is transparent and it took the paper behind
  it as the ground.
- **audit-layout** ignores `top: 0` sticky inside a scroll container, which is
  the correct construction. The defect it looks for is an offset measured for
  the viewport being applied against a container — a `th` given the masthead's
  height and then pinned from the top of a table, which parks it on the rows.
- **A full-bleed row** (negative horizontal margin that its own padding gives
  back) is now recognised and skipped in both the box and ink checks, including
  when it is several levels below the container reporting the excess. The guard
  demands the pull-out be at least as large as the excess it excuses, so a real
  60px of ink is still reported in a container that happens to hold a 24px
  full-bleed row.
- **Focus rings cannot be tested from script.** `:focus-visible` does not match
  a programmatic `.focus()`, so a script that focuses each control and compares
  what it paints will report every single one as having no visible focus. It is
  measuring `:focus` rules only. Drive real Tab presses.

Two traps worth knowing before you trust a result:

- **The browser pane runs hidden** (`document.hidden === true`), so
  `requestAnimationFrame` never fires. Charts do not paint, CSS transitions do
  not advance, scroll restores do nothing, and a counted-up figure keeps its old
  value. None of it is a defect and all of it looks like one. Force the work
  (`chart.draw()`, remove the transition) and read state rather than screenshots.
- **The three copies should agree.** They read the same seed through the same
  money code, so any figure that differs between them is a defect in one of
  them. That comparison is what caught the seed carrying expenses against three
  accounts it did not have.
