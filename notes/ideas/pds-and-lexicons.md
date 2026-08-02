# Should there be a PDS? Should the lexicons be real?

Two questions that arrived together but have pretty different answers. Short
version: **the lexicon work is real, cheap, and already half-done. Self-hosting a
PDS is mostly a separate hobby that doesn't unlock much here.**

## Current state (checked 2026-07-31)

**Lexicons.** Sites already write ~11 custom namespaces under `net.bisks.*`:

| namespace | site |
| --- | --- |
| `net.bisks.steamtags.rating` | steamtags |
| `net.bisks.quadrants.position` | quadrants |
| `net.bisks.keytags.set` | keytags |
| `net.bisks.docmoot.snapshot` | docmoot |
| `net.bisks.war.state` / `.ruleset` | war |
| `net.bisks.postwith.profile` / `.response` / `.meeting` / `.feedback` | postwith |
| `net.bisks.verdict.judgment` | verdict |
| `net.bisks.paintmoot.mark` / `.board` | paintmoot |
| `net.bisks.padmoot.pattern` | padmoot |
| `net.bisks.alicemeetsbob.crush` / `.pubkey` | alice-meets-bob |

**Exactly one of these is written down as a schema:** `steamtags` has a real
lexicon JSON, in the repo *and* served at `/lexicons/`. It's good — typed,
constrained, documented, `key: "any"` with the appid as rkey so re-rating
overwrites in place. Whoever wrote it understood the format.

The other ten are implicit: a shape that exists only in whatever JS happened to
call `createRecord`. Nothing validates them, nothing documents them, nothing
stops the next edit from silently changing the shape.

**Resolution is not wired up.** There's no `_lexicon.bisks.net` TXT record, so
even the steamtags schema isn't resolvable by the mechanism the ecosystem uses to
find schemas by NSID. It's a file on a website, not a published lexicon.

**Rob's PDS** is `calocybe.us-west.host.bsky.network` — a standard Bluesky-hosted
one. The handle `bisks.net` is already domain-based, so identity is self-owned in
the way that matters.

## The lexicon question: yes, and it's mostly cleanup

This is the cheap win. Three tiers, increasing effort:

**Tier 1 — write the ten missing schemas.** Copy the steamtags one as the
template. Pure documentation of what the sites already do. The payoff isn't
theoretical:

- `padmoot` and `paintmoot` *both* independently shipped the float bug (atproto
  records take integers, not floats) and both needed a user to report it. A
  written schema is where that constraint would have been caught.
- It gives the builder a reference for the next site that wants to persist
  something, instead of re-deriving the rules each time.

**Tier 2 — publish them.** Serve every schema under one path (`bisks.net/lexicons/…`)
and add the `_lexicon` DNS record so NSIDs actually resolve. Then `net.bisks.*`
is a real namespace other people can read, validate against, and build on.
Cheap: one worker route, one DNS record.

**Tier 3 — use `listReposByCollection`.** This is the fun part and the reason to
bother. It finds every repo on the network holding records in a given collection.
Right now each of these sites writes records into individual users' repos and
then can only ever read *your own* back. With `listReposByCollection` you get the
aggregate view for free:

- every steamtags rating anyone has made → a real crowdsourced tag-fit dataset,
  which is what 7778777 was asking for in the first place ("let users log in and
  save this under `net.bisks.steamtags`")
- every verdict judgment → a "what did the network think" page
- every paintmoot board → a gallery instead of a private canvas

That turns eleven isolated toys into something that looks like a small network of
apps sharing a data layer. Same house style (copy, don't abstract) — the sites
stay independent, they just agree on record shapes.

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

1. Write the ten missing lexicon schemas (template already exists).
2. Serve them all at one path + add the `_lexicon` DNS record.
3. Build one aggregate view off `listReposByCollection` — steamtags is the
   obvious first, since the crowdsourced version is what was originally asked
   for.
4. Publish a feed generator, as the flashier protocol-ownership move.
5. Only then reconsider a PDS, with a specific reason.
