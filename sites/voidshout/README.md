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

## Choosing a Place

Every Place picker (compose's "from Place", onboarding/settings' default
Place, and `/shout/`'s carry-to-a-new-Place destination) offers the curated
`PLACES` grid plus a "📍 map" button (`public/lib/mappicker.js`) that opens a
real zoomable slippy map — Leaflet + OpenStreetMap-derived tiles (CARTO's
Voyager basemap, same OSM data, served off Carto's CDN rather than
hotlinking `tile.openstreetmap.org`), loaded from CDN only when the picker
first opens. A search box (Nominatim, OSM's own free geocoder) jumps the map
to a typed place name; from there a member can zoom all the way to street
level before tapping the exact spot — still no `navigator.geolocation` call
anywhere, this is a manual pick, not a location request. The pick's lat/lng
is turned into a stable Place `id` with a 6-character geohash
(`public/lib/geohash.js`, prefixed `geo:` so it can never collide with a
curated id), and named via a live reverse-geocode call to a free, keyless,
client-CORS-open public API (`public/lib/geocode.js`) — degrading to a plain
coordinate string and a 📍 if that lookup fails or times out, rather than
blocking Place selection on a third party being up. The result is a real
Place object — same shape as any `PLACES` entry — validated by the same
`isValidPlace()` every other Place already goes through.

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

## Signing in

The header's "sign in" button and `/onboarding/`'s sign-in step both open an
inline handle field wired to `public/lib/handle-typeahead.js` — the same
Bluesky actor-search dropdown every other handle field in this app (and most
of the constellation's sites) uses, loaded lazily on first use rather than
shipped on every page. Neither ever calls `window.prompt()` anymore.

## What's still a stub

Nothing currently — the last known gap is fixed, see below.

Previously listed here: the header's "sign in" button and `/onboarding/`'s
sign-in step both used a bare `window.prompt()` for a handle — no
confirmation you'd typed a real one, and no consistency with every other
handle field in the app. Fixed — see "Signing in" above: both now use the
same actor-search dropdown as everywhere else.

Previously also listed here: the "📍 map" Place picker was a single static
SVG world silhouette a member could tap once, at whatever precision the
whole-world view allowed — no way to zoom in and pick a specific street or
neighborhood. Fixed — see "Choosing a Place" above: it's now a real
zoomable Leaflet/OpenStreetMap map with a place-name search box.

Previously listed here: every Place picker (compose, onboarding, settings,
and `/shout/`'s carry destination) only offered the curated `PLACES` list —
a real Place a member wanted to shout from or carry to had to already be in
that hardcoded list, or already have real activity from someone else's
record (see the "found in the wild" fix below). Fixed — see "Choosing a
Place" above: every picker now has a "📍 map" button that lets a member tap
any real point on the world map, computes a stable geohash id and a real
location name for it, and treats the result as a full Place, same as any
curated one.

Previously listed here: `/map/` plotted Places on a bare graticule with no
coastline, because a hand-traced coastline asset risked being quietly wrong.
Fixed — `public/lib/worldmap-data.js` bakes in a real Natural Earth land
silhouette (110m resolution, public domain), projected through the exact
same equirectangular `project()` formula as every pin and route in
`public/lib/places.js`, so land, pins, and routes all agree pixel-for-pixel
on the map's 1000x500 viewBox.

Previously also listed here: a stranger publishing a `place` object outside
the curated `PLACES` list rendered correctly on `/map/` (every record
carries its own real lat/lng) but was invisible in `/place/`'s search grid.
Fixed — `discoveredPlaces()` in `public/lib/places.js` surfaces any place
with real activity that isn't curated, tagged "found in the wild" in the
grid, and `searchPlaces()` matches it by name/emoji/id like any other Place.

Also previously listed: the Home feed (`/`) hardcoded every card's `hidden`
flag to `false`, so a Shout voted to ≤ -5 kept showing on the front page
with no hidden badge even though `/map/` and `/place/` correctly tagged it.
Fixed — `/` now computes `isHidden(score)` per root like every other page.
Echo/Murmur cooldown (60s) was enforced only inside `ingest.js`, so a rapid
same-user re-carry wrote a real record to the PDS that got silently rejected
after the fact, with the form closing as if it had worked. Fixed —
`/shout/`'s carry form now pre-checks `cooldownOk` before writing, and
surfaces a message if a race still gets rejected server-side. A signed-in
user's own cached `handle` was resolved once at login and never refreshed,
so it went stale forever after a handle change (profile pages for *other*
DIDs already re-resolved correctly). Fixed — `refreshSession()` in
`public/lib/oauth.js` now re-resolves the handle on every token refresh.

Also previously listed: `/map/`'s dashed route lines ("a carry in the last 6
hours") were computed against `public/data/demo.json`'s fixed, hand-written
`createdAt` timestamps. Demo mode is on by default for a first-time visitor,
so as real time passed those timestamps aged past the 6-hour window and the
map's routes silently stopped rendering for good — pins only, no carries,
looking broken rather than idle. Fixed — `loadDemoRoots()` in
`public/lib/demo.js` now shifts every fixture timestamp by a constant offset
that pins the newest demo record to "now" on each load, preserving the
relative gaps between records (so some carries still correctly fall outside
the 6h window and some still correctly fall inside it). This also keeps
`timeAgo()` on every demo card fresh instead of creeping toward "N days ago"
everywhere else demo data renders.
