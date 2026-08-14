# Shout Into the Void — voidshout.bisks.net

Put a joke somewhere on the map. Anyone can carry it to a new Place with an
Echo, or react to it with a Murmur. Everyone's vote decides whether it
survives. Built from [@fromthewestmeadow.com](https://bsky.app/profile/fromthewestmeadow.com)'s
73-post spec as the smallest complete vertical slice that obeys every rule
in it, without faking the hard atproto pieces.

## Architecture: frontend-first, no backend

There is no server-side database, no Durable Object, no KV, nothing
authoritative outside atproto itself. Every `net.bisks.void.*` record is a
real record in its author's own PDS repo, written with real OAuth
(`public/lib/oauth.js` — public client, PKCE + DPoP, no `client_assertion`).
The "backend" is `public/lib/ingest.js`: every visitor's browser opens its
own Jetstream subscription (`public/lib/ingest.js`), validates every
`net.bisks.void.*` commit anyone on the network publishes, and folds the
valid ones into an IndexedDB cache (`public/lib/store.js`). Feeds, scores,
the map, hide/restore, subtree pruning — all derived, all rebuildable from
scratch by reconnecting. Two visitors' local views can differ slightly by
backfill depth, but both are honest projections of the same public repos.

This means the Worker (`src/index.ts`) does nothing but serve static
assets — there's no server-side OAuth token exchange, no proxy, no secret.

## Records (see `lexicons/`)

- `net.bisks.void.shout` — the root of a carry-tree. Text-only (≤280
  graphemes), a Place, optional `sourcePostUri` (CAR-import provenance).
  `rkey` is a deterministic hash of (author, text, place, minute-bucket) —
  see `rkeyForShout` in `public/lib/voidlogic.mjs` — so retrying a dropped
  `createRecord` after a network error is a no-op, not a duplicate post.
- `net.bisks.void.echo` — carries a Shout/Echo/Murmur to a new Place, no
  text.
- `net.bisks.void.murmur` — same, but with a short (≤140 grapheme) reaction.
- `net.bisks.void.vote` — ±1 on any of the above. rkey is derived from the
  subject alone (within the voter's own repo), so re-voting overwrites
  rather than duplicates.
- `net.bisks.void.participation` — one per member (`rkey: "self"`): default
  Place. Written on onboarding, deleted last when leaving.

`public/lib/voidlogic.mjs` is the canonical, hand-kept shape of every
record (JSDoc typedefs) and every pure rule — validation, scoring,
hide/restore threshold (-5), echo cooldown (60s), duplicate-root window (5
min) — kept in lockstep with the lexicons by hand, since there's no server
to run a codegen step against. It's imported directly by both the browser
pages and `tests/logic.test.mjs`, so the tests exercise the exact same code
the app runs, not a mock of it.

## Pages (`public/`)

| path | what it does |
|---|---|
| `/` | Home feed — live Jetstream-derived, or seeded demo data |
| `/onboarding/` | Sign in, see your generated Home, pick a default Place |
| `/compose/` | Shout composer (text-only) |
| `/import/` | CAR import — downloads and walks your own repo's real MST (`public/lib/car.js`) to find `app.bsky.feed.post` records, lets you turn any into a Shout with `sourcePostUri` set |
| `/shout/?uri=` | Shout/tree detail — vote, Echo, Murmur |
| `/place/` | Place search + per-Place feed |
| `/map/` | World map, route lines between Places |
| `/profile/?did=` | Home, prefix, activity, Voids discovered, vote geography (defaults to your own; viewable for anyone) |
| `/settings/` | Change default Place; "leave the Void" (see below) |
| `/audit/` | Live log of every record this browser's ingest has rejected, and why |
| `/admin/` | Tiny read-only mirror of this browser's local ingest state — there's no privileged role to gate it behind |

Any Shout with `sourcePostUri` set (from CAR import) is rendered with the
*current* canonical Bluesky post hydrated inline — text, avatar, images —
fetched live from the public AppView (`public/lib/bskypost.js`) rather than
copied at import time, so an edit or delete on the original bsky.app post
is reflected everywhere the Shout appears.

## Leaving the Void

`/settings/` → "leave the Void" deletes every record you own
(shout/echo/murmur/vote) via batched `com.atproto.repo.applyWrites` calls
(50 deletes per batch, up to 3 retries per batch on failure, with a visible
progress bar and a "retry failed batches" button if any batch never
succeeds), deletes your `participation` record last, then purges this
browser's local IndexedDB cache of your activity. Nothing here is a soft
delete — the records are really gone from your PDS.

## OAuth scope

Public client (`token_endpoint_auth_method: none`), scoped to exactly the
five `repo:` grants the app writes to — never the broad
`atproto transition:generic`. `public/client-metadata.json`'s `scope` and
`public/lib/oauth.js`'s `SCOPE` constant must stay byte-identical (see
`notes/50-oauth-scopes.md` at the repo root) or the PDS rejects login.

## Testing

```
npm test   # node --test tests/*.test.mjs
```

Covers the pure rules in `voidlogic.mjs`: grapheme-safe truncation, record
validation per collection, scoring/hide/prune, echo-cooldown,
duplicate-root, and CAR-import candidate filtering. There's no DOM/network
test harness in this repo's house style — OAuth, ingest, and the PDS write
paths are exercised by hand against real accounts.

## Deployment / env

No secrets, no wrangler vars — this is a pure static site (Cloudflare
Workers assets binding) plus client-side atproto calls. `wrangler deploy`
from this directory, or push to `main` (see `notes/20-deploy.md` at the
repo root) and the CI workflow redeploys it.

## What's still a stub

- No lat/lng coastline asset on `/map/` — Places are plotted on an
  equirectangular graticule (`public/lib/places.js`'s `project()`), not a
  traced coastline, so placement stays honest instead of hand-drawn-wrong.
- Curated `PLACES` list is fixed; anyone can still publish a `place` object
  outside it (the lexicon allows it) and it'll render as "elsewhere" in the
  reference client's own picker while remaining fully valid on the network.
