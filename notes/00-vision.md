# atprotozoa — vision

A monorepo of tiny atproto experiments. One repo, many small sites, deployed
on commit. Each experiment is its own little thing, and they borrow from each
other by copying, not by extracting shared libraries.

## The feeling we're going for

Prior art we're stealing the vibe from:

- **mino.mobi** — 125+ interconnected "surfaces" built on Bluesky / atproto, all
  under one domain, sharing a common OAuth worker. The clearest model for what we
  want: lots of small tools, each its own page, loosely federated by living in
  one place.
- **vibe-coded.com/projects** — a gallery of small vibe-coded web toys.
- **all-paperclips.bsky.social** ("fluoddity") and **cee.wtf** — one-person
  streams of tiny, weird, atproto-flavored web things.
- **github.com/dollspace-gay** (@dollspace.gay) — third-party atproto software,
  mostly Rust tooling. A reminder that the ecosystem is bigger than the web-toy
  corner, and that "tools for the protocol" is a valid flavor of experiment too.
- **@carbonadoks.com** — another handle-as-domain person shipping small sites;
  same shape as this project (the domain is both identity and host).

The shared thread: a single person can text an idea to a coding agent and have a
whole small site built and deployed. Low ceremony, high output, deliberately
unserious.

## Principles

1. **Copy, don't abstract.** When a new site needs the OAuth dance, or a card
   component, or a Bluesky API helper that an existing site already has — copy the
   file in and edit it. Accidental uniformity is fine. Shared packages,
   dependency extraction, and "let's make this reusable" are explicitly *not*
   goals. The cost of a wrong abstraction across 50 tiny sites is higher than the
   cost of 50 near-duplicate files.

2. **Each site is self-contained.** A site is a directory. Deleting the directory
   deletes the site. No site should break because another site changed.

3. **Deploy on commit.** Push to main → changed sites deploy. No manual deploy
   step in the normal loop.

4. **The agent is the interface.** The target workflow is: describe an idea →
   an agent scaffolds a new site from an existing one, builds it, and it deploys.
   The repo conventions exist to make that one-shottable.

5. **atproto-native where it's fun.** These are experiments *on* atproto — reading
   the firehose / Jetstream, querying the AppView, signing in with Bluesky OAuth,
   writing records to a PDS. Not every site needs it, but it's the house style.

6. **Built to be shared, by default.** Most sites should ship with a real OG
   preview and a one-tap way to post the result to Bluesky — not bolted on after
   someone asks, but part of the first pass. See `notes/45-sharing-and-virality.md`.
   The exception is a pure utility page with no per-user result to show off.

## What lives here

- `notes/` — these docs. Architecture, conventions, deploy, identity.
- `sites/` — one directory per experiment. Each is an independent Cloudflare
  Worker (see `notes/10-architecture.md`).
- `apex/` — the front-door Worker for the root domain: the landing/gallery page
  plus the `.well-known` endpoints that make the domain an atproto identity.
- Root config: pnpm workspace, shared tooling versions, the deploy workflow.

## Domain & identity

Everything lives under **bisks.net** (Cloudflare). The apex serves a landing page
and the handle-verification endpoint so `bisks.net` can be used as a Bluesky
handle. Individual experiments get their own **subdomain**: `trigrams.bisks.net`,
`<name>.bisks.net`.

For a stretch they were mounted at paths instead (`bisks.net/<name>`), because
the zone hit Cloudflare's 100-custom-domain cap. Those sites keep their path
route alongside the subdomain so previously-shared links still work. See
`notes/40-new-site-playbook.md`.

See `notes/30-identity-and-did.md` for identity.
