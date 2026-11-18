# Rolling back to the earlier build (Spendly)

This folder holds the main program exactly as it was before it was replaced by
the new build on 18 November 2026:

- `index.html` (APP_BUILD 2026-10-26c), `sw.js` (cache `spendly-v58`),
  `manifest.webmanifest`, `icon.svg`, `icon-180.png`.

## To put it back

From the repository root:

    cp backup/spendly-before-new-build-2026-11-18/index.html index.html
    cp backup/spendly-before-new-build-2026-11-18/sw.js sw.js

Then, in `sw.js`, change `VERSION` to `'spendly-v60'` (any name not used
before). The new build is cached under `spendly-v59`; a new name is what makes
phones throw that copy away. Commit and push for the live site.

## Your records

- **The earlier build's records were never touched.** The new build copies
  them across the first time it opens on a device and leaves the old keys
  (`spendly_*`) exactly as they were. So rolling back opens on your records
  as they stood when the new build first opened on that device.
- Anything recorded in the new build after the switch is kept under its own
  keys (`opus.generated.*`). The earlier build cannot read those, so it will
  not show them. Write those down, or export a CSV from the new build, before
  rolling back.
- Sync: the earlier build syncs to its own file in your gist with the token
  it already has on each device. The new build uses a separate gist file and
  its own token entry, so the two never write over each other.
