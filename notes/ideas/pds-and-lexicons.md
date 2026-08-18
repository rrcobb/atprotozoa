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
- paintmoot boards → still just a private canvas per board, not a gallery. Next
  obvious candidate — same `listReposByCollection` shape, the interesting part
  would be surfacing boards other people's moots have drawn on.
- the other lexicon-bearing sites without an aggregate view yet: alice-meets-bob,
  catspace, clusterpedia, docmoot, duohaunt, griftmax, hyperobject, keytags,
  kolpelor, padmoot, postwith, quadrants, socialcredit, tallybot, velvetrope, war.

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
3. ~~Build one aggregate view off `listReposByCollection`~~ Done for steamtags,
   memex, and verdict (`/crowd`, 2026-08-18). Paintmoot boards are the next
   obvious candidate; the rest of the lexicon-bearing sites listed above are
   still one-repo-only.
4. Publish a feed generator, as the flashier protocol-ownership move.
5. Only then reconsider a PDS, with a specific reason.
