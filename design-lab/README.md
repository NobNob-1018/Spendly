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
