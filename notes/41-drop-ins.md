# Drop-ins: files copied verbatim and kept identical

The house rule is copy, don't abstract (`notes/10-architecture.md`): no shared
package across sites, no import from one site into another. This note is
about the one kind of sharing that has worked inside that rule, and the tool
that keeps it working.

## The problem

By 2026-09-17 the repo had 600+ sites and several files that most of them
carry. They split into two populations:

| file | copies | distinct versions |
| --- | --- | --- |
| handle-typeahead.js | 245 | 1 |
| oauth-jwt.js | 66 | 6 |
| car.js | 51 | 21 |
| identity.js | 39 | 26 |
| oauth.js | 66 | 66 |

The typeahead cutover to waow.tech that day was one edit and one sweep,
because every copy was byte-identical. The same kind of fix cannot reach
oauth.js at all. And the bot's own `grudges` site records the cost of the
other direction: `GRAPH_PAGES = 12` was copied into about 55 sites and every
copy carried the bad cap for months, because copying preserves a bad default
as faithfully as a good one.

"Copy, don't abstract" had been read as "copy, then edit freely." That is
what produces 66 forks with the same filename.

## The rule

A **drop-in** is a file that is copied verbatim and never edited in place.

- One canonical copy, named in `audit/drop-ins.mjs`. Every other copy is
  identical bytes.
- Edits go to the canonical file and are swept to every copy in one commit
  (`node audit/drop-ins.mjs --sweep`). A bad sweep is one revert.
- No import across sites, no CDN, no package. Each site still owns its bytes,
  so a broken canonical file breaks nothing until someone sweeps it.
- A drop-in is small, has one call site, and carries its own fallback, so a
  site never depends on the service behind it being up.
- If a site needs the drop-in to do something different, that copy is a fork:
  rename it. A drop-in with a site-specific edit is a fork with a misleading
  name, and the audit will keep flagging it until it is renamed or swept.

This is a third option next to "copy and edit" and "abstract," not a
replacement for either. Most files in a site are still copy-and-edit.

## The list

| drop-in | canonical | what it does |
| --- | --- | --- |
| `handle-typeahead.js` | `sites/didscope` | handle autocomplete, waow.tech first, AppView fallback |
| `visits.js` | `sites/didscope` | "N visits this week" footer from stats.bisks.net |
| `microcosm.js` | `sites/listenheimer` | Constellation backlink reads: followers, likers, reposters, quotes, replies, mention count |
| `oauth-jwt.js` | `sites/alice-meets-bob` | DPoP and PKCE helpers for browser OAuth, Web Crypto only |

`microcosm.js` throws on any failure, so a caller keeps the AppView walk as
its fallback (`sites/listenheimer/public/lib/likes.js` is the reference). Five
sites carry an older per-site `constellation.js` with different exports
(blockcurve, blocksweep, listrank, tacocounter, velvetrope). Those are forks
by design and are not on the list.

`oauth-jwt.js` joined the list on 2026-09-17: its six versions across 66
sites differed only in the provenance comment, so one sweep made them
identical. Candidates not yet on the list, each needing a config seam before
it can be verbatim: `oauth.js` (differs per site by `SCOPE` and `MOUNT`, then
drifts in behavior), `car.js`, the `/img?u=` avatar proxy in `src/index.ts`.

## The audit

```
node audit/drop-ins.mjs            # copies per drop-in, which drifted
node audit/drop-ins.mjs --sweep    # overwrite drifted copies with canonical
node audit/drop-ins.mjs --json
```

Look at a drifted copy's diff before sweeping it. The builder is told to use
drop-ins in `sites/buildthis/builder/INSTRUCTIONS.md`, and the daily slot may
spend its run on a sweep instead of a new site — its brief names this command,
and a sweep reports itself through the `maintenance` disposition rather than
having to name a site it built (`notes/80`, `notes/90`).
