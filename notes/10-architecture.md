# Architecture

## The shape

```
atprotozoa/
├── .tool-versions          # node pinned (asdf)
├── package.json            # pnpm workspace root
├── pnpm-workspace.yaml     # sites/* and apex are workspace packages
├── notes/                  # these docs
├── audit/                  # repo-wide scripts: gallery build, path checks,
│                           #   Cloudflare inventory, site surveys
├── apex/                   # front-door Worker for bisks.net (apex domain)
│   ├── src/index.ts
│   ├── public/             # generated landing/gallery page
│   └── wrangler.toml
└── sites/                  # ~200 of these, one per experiment
    ├── trigrams/           # the first one → trigrams.bisks.net
    │   ├── src/index.ts
    │   ├── public/
    │   ├── site.json
    │   └── wrangler.toml
    └── <next-site>/        # copy an existing site, rename, edit
```

## Why Cloudflare Workers (not Pages)

Each site is a **Worker with static assets** (the `assets` binding), not a Pages
project. Reasons:

- **One Worker per site, one hostname per site.** A Worker maps cleanly to
  `<name>.bisks.net` via a plain Route on the shared zone. Pages gives one
  project per repo connection, which fights the "tons of tiny sites" goal.
- **A frontend-first server surface.** The browser should own ephemeral state and
  can connect directly to Jetstream for live atproto data. User-owned durable
  data belongs in atproto records when possible. Workers still handle static
  assets, OAuth callbacks, and small CORS or protocol adapters. When a toy needs
  shared or global persistence, KV is the normal low-cost compromise: it is
  intentionally best-effort and eventually consistent, which is fine for most
  experiment state. Durable Objects are not used here at all; where an
  invariant looks like it needs exact coordination, soften the semantics
  instead (notes/11-durable-objects.md).
- **Closer to the mino.mobi model** (a shared OAuth worker + many surfaces).

A fully static site still ships as a Worker: `public/` via the assets binding, and
a trivial (or absent) fetch handler. The overhead is one `wrangler.toml`.

## Anatomy of a site

Minimum viable site = a directory under `sites/` with:

- `wrangler.toml` — name, `main`, `assets` dir, and one Route on the shared
  zone (`<name>.bisks.net/*`, with `zone_name`, not `custom_domain`).
- `public/` — static files (at least `index.html`).
- `src/index.ts` — the fetch handler. A purely static site just forwards to the
  ASSETS binding; server surface (an OAuth callback, a share route, a cron) goes
  here. See `notes/40-new-site-playbook.md` for the template.
- `site.json` — the site's canonical record; the apex gallery is generated from
  these.
- `package.json` — so pnpm treats it as a workspace member and `wrangler` deps
  resolve. Kept minimal.

Sites built during the path-mounting era also carry a `bisks.net/<name>` route
and prefix-stripping in their handler; see the playbook before editing one.

Each site is deployed independently as its own Cloudflare Worker named
`atprotozoa-<sitename>` (see `notes/20-deploy.md`).

## Frontend-first rule

The default site starts in the frontend, but frontend-first does not mean
browser-local by default when shared persistence would make the site more useful:

- Keep UI state, derived firehose state, timers, and polling in `public/`.
- Connect to Jetstream from the browser when a live atproto feed is the feature.
- Ask the user to sign in and write an atproto record when the result should
  persist or be shareable.
- Use KV when a low-stakes result should be visible across browsers or visitors:
  approximate counters, best-effort leaderboards, small event logs, snapshots,
  and derived indexes are all reasonable uses.
- Use a Worker for static assets, OAuth, a narrow upstream proxy, or a share
  route that cannot run in the browser.
- Global state means KV, not a Durable Object. If the product seems to need
  atomic updates, a single authoritative ordering, or a first-writer claim,
  that is a signal to change the product, not the backend.

KV-backed shared state is part of the normal frontend-first toolbox. A short
note in the site or its config should say what may be stale, duplicated, or
overwritten. This repo does not use Durable Objects at all — the migration off
them is finished, and a new site must not copy one from an older site's git
history. See notes/11-durable-objects.md.

## The "copy, don't abstract" rule in practice

There is intentionally **no `packages/shared`**. When a new site needs code an
existing site has:

1. Copy the file(s) into the new site's `src/`.
2. Edit to taste.
3. Do not reach back into another site's directory at import time.

Common things that will get copied around, and that's fine:

- The Bluesky OAuth client setup.
- An AppView / XRPC fetch helper (`getPost`, `resolveHandle`, etc.).
- A Jetstream (firehose) websocket consumer.
- The card / mono-title visual components (the mino.mobi-ish look).

If a pattern stabilizes and gets copied for the tenth time, we *might* promote it —
but the default is copy. Uniformity here is a side effect of shared lineage, not
an enforced dependency.

## atproto building blocks (reference, to be copied per-site)

- **Read public data:** hit the AppView at `https://public.api.bsky.app` (no auth)
  for `app.bsky.*` queries — posts, profiles, threads.
- **Firehose:** Jetstream (`wss://jetstream2.us-east.bsky.network/subscribe`) is
  the easy path — filtered, JSON, no CBOR decoding. Prefer a browser WebSocket
  and a client-side rolling window. If the window should be shared across
  visitors, a KV snapshot or event log is enough.
- **Identity resolution:** resolve a handle → DID via the AppView or the PLC
  directory (`https://plc.directory/<did>`).
- **OAuth (when a site acts on the user's behalf):** atproto OAuth. This is the
  heaviest block; the first site that needs it establishes the copyable template.

Each of these gets its own note as we actually build it.
