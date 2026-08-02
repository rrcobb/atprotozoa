# Prior art: mino's source

mino.mobi's full source is public: **github.com/minormobius/agent01**. It's the
closest existing thing to what we're building, so it's the first place to look
when we need a pattern (OAuth, a firehose consumer, a surface layout). Read it,
copy from it, but know where we deliberately differ.

## What mino does (per its README)

- Sprawling monorepo, ~23+ small "surfaces" grouped into publications/apps,
  ATProto tools, and Bluesky dashboards. One domain, many surfaces.
- "Static files on Cloudflare **Pages**. Data on ATProto PDS. No backend servers.
  No SaaS dependencies." Auto-deploy from `main` via GitHub Actions.
- Compute when needed: Workers, Durable Objects, D1. Data lives on a PDS.
- Tech varies per app: React, Vite, PWA, MapLibre, deck.gl, DuckDB, Pyodide,
  Wasm, Canvas, ATProto.
- Has a `packages/shared` inside at least one complex surface (`/poll`:
  apps/web + apps/api + packages/shared; "build order: shared → web").

## Where we deliberately diverge

Two conscious departures — not because mino is wrong, but because our goals are
smaller/looser:

1. **Workers, not Pages.** mino serves static files on Pages with no backend.
   We give each site its own Worker so it can have a small server surface (OAuth
   callback, redirect, CORS proxy, well-known endpoint) without a rearchitecture.
   We've already used that (the `/firehose` redirect, `bisks.net`'s
   `.well-known/atproto-did`). If a site is purely static, its Worker just serves
   `public/` and the fetch handler is trivial or absent.

2. **Copy, don't abstract — stricter than mino.** mino extracts a
   `packages/shared` within complex surfaces. Our rule is stricter: no shared
   package, copy code between sites. This is a bet that for *tiny* experiments the
   coupling cost of shared deps outweighs the duplication cost. If a surface ever
   grows into its own mini-monorepo (like mino's `/poll`), we can relax the rule
   *inside that one site* — but not across sites.

## How to use it

When building a new site that needs a block we don't have yet (atproto OAuth, a
Jetstream consumer with a Durable Object, a PDS write), find the mino surface that
does it, read how they did it, and copy the shape into our site — adapted to
Workers and to a single self-contained directory.
