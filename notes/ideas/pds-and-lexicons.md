# Should there be a PDS? Should the lexicons be real?

Two questions that arrived together but have pretty different answers. Short
version: **the lexicon work is real, cheap, and now mostly done — see
"Current state" below. Self-hosting a PDS is mostly a separate hobby that
doesn't unlock much here.**

## Current state (checked 2026-08-16)

**Lexicons.** Tier 1 (write down every schema) and half of Tier 2 (publish
them in one place) are done. 20 sites now write 32 `net.bisks.*` record
types, and every one of them ships a real lexicon JSON at its own
`sites/<name>/public/lexicons/<nsid>.json` — not just steamtags anymore.
`audit/build-lexicons.mjs --apply` mirrors all of them into
`apex/public/lexicons/`, so **https://bisks.net/lexicons/** is one page
listing every namespace, its description, and the site that owns it (linked
from the apex "about the zoo" section). Re-run that script after adding or
changing a lexicon; it's the same pattern as `build-gallery.mjs` for the
site cards.

**Resolution is still not wired up.** There's no `_lexicon.bisks.net` TXT
record, so a schema still isn't resolvable by NSID the way the ecosystem
expects — `bisks.net/lexicons/<nsid>.json` is a documented, fetchable file,
not a published lexicon in the formal sense. That DNS record needs dashboard
access the builder doesn't have; someone with Cloudflare access needs to add
it by hand. The rest of Tier 2 (the aggregation page) no longer blocks on it.

**Rob's PDS** is `calocybe.us-west.host.bsky.network` — a standard Bluesky-hosted
one. The handle `bisks.net` is already domain-based, so identity is self-owned in
the way that matters.

## The lexicon question: yes, and it's mostly cleanup

This is the cheap win. Three tiers, increasing effort:

**Tier 1 — write the missing schemas. Done.** Every site with a `net.bisks.*`
namespace now ships a real lexicon JSON, copied from the steamtags template.
The payoff wasn't theoretical:

- `padmoot` and `paintmoot` *both* independently shipped the float bug (atproto
  records take integers, not floats) and both needed a user to report it. A
  written schema is where that constraint would have been caught.
- It gives the builder a reference for the next site that wants to persist
  something, instead of re-deriving the rules each time.

**Tier 2 — publish them. Half done.** Every schema is now served under one
path, `bisks.net/lexicons/…` (`audit/build-lexicons.mjs --apply` mirrors them
from each site into `apex/public/lexicons/`). The `_lexicon` DNS TXT record
that would make NSIDs actually resolve is still missing — that needs
Cloudflare dashboard access the builder doesn't have. Until then `net.bisks.*`
is documented and fetchable, not a formally resolvable namespace.

**Tier 3 — use `listReposByCollection`.** This is the fun part and the reason to
bother. It finds every repo on the network holding records in a given collection.
Most of these sites write records into individual users' repos and can otherwise
only ever read *your own* back. With `listReposByCollection` you get the
aggregate view for free:

- steamtags — **done.** `sites/steamtags/public/lib/global-index.js` is the
  reference implementation: `listReposByCollection` backfill + a live Jetstream
  subscription, rendered as a per-tag board of games and average fit scores.
- memex — **done**, same pattern (`sites/memex/public/lib/`).
- verdict — **done, 2026-08-18** (daily-slot pass). `sites/verdict/public/lib/global-index.js`
  (copied from steamtags') + `verdict.bisks.net/crowd` — network-wide good/bad/beautiful
  totals, a kindest/harshest judge leaderboard, and the actual payoff: posts more
  than one person judged where the calls split, rendered with the real post text
  pulled from the AppView.
- paintmoot's `/gallery` — **done**, a later daily-slot pass: every board a
  gallery instead of a private canvas.
- tallybot — **done, 2026-08-20.** Its signed-in vote path was write-only (wrote
  `net.bisks.tallybot.point` but nothing read it back) until this pattern gave
  it a read path — see `sites/sidenote`'s 2026-08-20 entry.
- catspace's `/directory` — **done, 2026-08-22.** Had sat as a "local to your
  own records" stub since launch (leftover from a Registry Durable Object built
  for this and later ripped out under the cost wall) until filled in with the
  same client-side recipe.
- quadrants — **done, 2026-08-23** (daily-slot pass). `sites/quadrants/public/lib/global-index.js`
  finds every live position marker for a chart across the network, scoped by
  rkey instead of a singleton "self" record since this collection holds one
  record per (person, chart).
- docmoot — **done, 2026-08-24** (daily-slot pass). Its snapshot rkey is a
  PDS-assigned TID rather than the docId, so `global-index.js` here pages a
  candidate's *whole* snapshot collection via `listRecords` and filters
  locally — closer to steamtags' multi-record-per-repo shape than quadrants'
  single-getRecord one. Opening `/d/<id>` now lists every snapshot anyone's
  published of that doc, alongside your own.
- kolpelor's `/atlas` — **done, 2026-08-25** (daily-slot pass). Singleton-"self"
  shape, closer to catspace's `/directory` than docmoot's.
- war's `/front` — **done, 2026-08-21** (daily-slot pass, previously missing
  from this list — its lexicon pins the state record to a fixed `"self"` rkey
  per repo, so `network-index.js` backfills with one `getRecord` per DID
  instead of a paginated scan).
- socialcredit — **done, 2026-08-26** (daily-slot pass). Its votes are
  `key: "tid"`, one record per vote, written into the *voter's* own repo with
  the target as a field — so unlike every site above, the aggregate view here
  isn't `listReposByCollection` + `getRecord`/`listRecords` per candidate, it's
  `listReposByCollection` to find every voter, then a full-repo
  `com.atproto.sync.getRepo` CAR download per voter (`public/lib/car.js`,
  copied from sites/backscroll) to pull all of that voter's votes in one
  request — the "prefer bulk reads over paginated listRecords" standing order
  (2026-08-25) applied to this pattern for the first time. Replaces the old
  Jetstream-only 48h backfill that made the leaderboard honestly
  eventually-consistent; see `public/lib/global-backfill.js`.
- the remaining lexicon-bearing sites without an aggregate view: alice-meets-bob,
  clusterpedia, duohaunt, griftmax, hyperobject, padmoot, postwith, velvetrope.
  (keytags is a deliberate exception — its whole point is that a
  `net.bisks.keytags.set` entry is an opaque hash unless you hold the key, so
  an aggregate view would have nothing meaningful to show.)

Steamtags, memex, and verdict now look like a small network of apps sharing a
data layer. Same house style (copy, don't abstract) — the sites stay
independent, they just agree on record shapes and, increasingly, on the same
`global-index.js` pattern for reading them back in aggregate.

**Worth noting:** this is the "dataset maker" idea from `beyond-buildthis.md`, except the
dataset is one you already own and already generate. Much less work than indexing
the firehose, and more distinctive.

## The PDS question: probably not, and here's the honest case

Self-hosting a PDS means running `bsky-social/pds` (Docker, a small VM, Postgres
or SQLite, blob storage, TLS, backups) and migrating the account to it.

**What it would genuinely get you:**

- Ownership of the raw repo — no dependency on Bluesky's infra for storage.
- Freedom to host accounts for things (bot identities, per-project accounts)
  without bsky.social signups.
- The "I run my own infrastructure" bit, which is on-theme for a repo full of
  atproto experiments.

**What it would not get you, contrary to the usual assumption:**

- *Custom lexicons don't need it.* Any PDS accepts any well-formed record in any
  namespace. The `net.bisks.*` records already work fine on Bluesky's PDS —
  eleven sites are writing them today.
- *Identity isn't at stake.* `bisks.net` as a handle already makes the identity
  domain-owned. The DID is `did:plc:`, portable by design; migrating PDS later is
  a supported operation, not a rewrite.
- *No new capability for the sites.* Everything in `sites/` talks to the AppView
  and to users' own PDSes. None of it cares where Rob's repo lives.

**What it would cost:** the first standing server in a project whose whole
premise is "one Cloudflare Worker per idea, no servers." Backups, upgrades, and
uptime become yours. If it goes down, your account goes down — where today that's
someone else's pager. `notes/90-infra-and-budget.md` exists because this project
is deliberately cheap; a PDS is the first thing that breaks that.

**The middle path**, if the appeal is really "more atproto": do Tier 1–3 above,
publish a feed generator (per `atproto-surface-map.md`, that surface is completely untouched
and is a *much* more visible bit of protocol ownership than storage), and revisit
the PDS if a concrete need shows up — e.g. wanting to mint many bot accounts
without bsky.social signups, which is the one scenario in the current notes where
self-hosting actually helps.

## Suggested order

1. ~~Write the missing lexicon schemas.~~ Done (2026-08-16).
2. ~~Serve them all at one path~~ (`bisks.net/lexicons/`, done 2026-08-16) +
   add the `_lexicon` DNS record — still needs a human with dashboard access.
3. Build aggregate views off `listReposByCollection` — done for eleven sites so
   far (steamtags, memex, verdict, paintmoot, tallybot, catspace, quadrants,
   docmoot, kolpelor, war, socialcredit). Eight lexicon-bearing sites remain
   one-repo-only (see the list above); griftmax's single `ascension` collection
   is the next natural target.
4. Publish a feed generator, as the flashier protocol-ownership move.
5. Only then reconsider a PDS, with a specific reason.
