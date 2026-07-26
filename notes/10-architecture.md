# Architecture

## The shape

```
atprotozoa/
├── .tool-versions          # node pinned (asdf)
├── package.json            # pnpm workspace root
├── pnpm-workspace.yaml     # sites/* and apex are workspace packages
├── notes/                  # these docs
├── apex/                   # front-door Worker for bisks.net (apex domain)
│   ├── src/index.ts
│   ├── public/             # static landing/gallery page
│   └── wrangler.toml
└── sites/
    ├── trigrams/           # first experiment → trigrams.bisks.net
    │   ├── src/index.ts
    │   ├── public/
    │   └── wrangler.toml
    └── <next-site>/        # copy an existing site, rename, edit
```

## Why Cloudflare Workers (not Pages)

Each site is a **Worker with static assets** (the `assets` binding), not a Pages
project. Reasons:

- **One Worker per site, one path per site.** A Worker maps cleanly to
  `bisks.net/<name>` via a plain (non-custom-domain) Route on the shared zone.
  Pages gives one project per repo connection, which fights the "tons of tiny
  sites" goal.
- **Server surface when we want it.** atproto experiments routinely need a little
  server: an OAuth callback, a CORS-dodging proxy to a PDS or AppView, a cron
  trigger, a Durable Object for firehose state. Workers give each site that for
  free. Pure-static sites just serve `public/` and never touch the fetch handler.
- **Closer to the mino.mobi model** (a shared OAuth worker + many surfaces).

A fully static site still ships as a Worker: `public/` via the assets binding, and
a trivial (or absent) fetch handler. The overhead is one `wrangler.toml`.

## Anatomy of a site

Minimum viable site = a directory under `sites/` with:

- `wrangler.toml` — name, `main`, `assets` dir, a path Route on the shared zone
  (`bisks.net/<name>` + `bisks.net/<name>/*`).
- `public/` — static files (at least `index.html`).
- `src/index.ts` — a fetch handler is required even for a static site now: it
  strips the `/<name>` mount prefix before handing the request to the ASSETS
  binding (the assets directory has no idea it's not living at the domain
  root). See `notes/40-new-site-playbook.md` for the copyable template. (Sites
  still on their own `<name>.bisks.net` custom domain can omit `main` and stay
  pure-static, since they don't need prefix-stripping.)
- `package.json` — so pnpm treats it as a workspace member and `wrangler` deps
  resolve. Kept minimal.

Each site is deployed independently as its own Cloudflare Worker named
`atprotozoa-<sitename>` (see `notes/20-deploy.md`).

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
  the easy path — filtered, JSON, no CBOR decoding. A Durable Object or cron can
  hold a rolling window of records.
- **Identity resolution:** resolve a handle → DID via the AppView or the PLC
  directory (`https://plc.directory/<did>`).
- **OAuth (when a site acts on the user's behalf):** atproto OAuth. This is the
  heaviest block; the first site that needs it establishes the copyable template.

Each of these gets its own note as we actually build it.
