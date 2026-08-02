# New-site playbook (for humans and agents)

The target workflow: "text an idea → an agent builds and deploys a whole small
site." This note is the recipe.

A site is a directory under `sites/`, deployed as its own Cloudflare Worker
named `atprotozoa-<name>`, served at `<name>.bisks.net`.

## Steps

1. **Pick a lineage.** Copy the existing site closest to the idea:
   `cp -r sites/<closest> sites/<newname>`. If nothing's close, copy
   `sites/trigrams` or start from the template below.

2. **Rename.** In the new `sites/<newname>/`:
   - `wrangler.toml`: `name = "atprotozoa-<newname>"` and a single route
     `{ pattern = "<newname>.bisks.net/*", zone_name = "bisks.net" }`.
   - `package.json`: `"name": "@atprotozoa/<newname>"`.
   - If you copied an older site, delete any `bisks.net/<oldname>` path route
     and the prefix-stripping in its `src/index.ts` — a new site is served at
     the root of its own hostname and needs neither. See "Older sites" below.
   - Purge copied-in logic you don't need.

3. **Build the idea.** Edit `public/` and `src/`. Copy atproto helpers from
   sibling sites as needed — copy, don't import across sites. Any absolute URL
   the site writes about itself (OG tags, share links, OAuth redirect URIs) is
   `https://<newname>.bisks.net/...` with no path prefix.

4. **Run it locally.** `cd sites/<newname> && pnpm dlx wrangler dev`, then open
   `localhost:8787`.

5. **Check local paths.** `pnpm check:imports` from the repo root walks every
   site's `public/` for `<script src>` / `<link href>` / module `import`
   references that don't resolve or don't exist on disk.

6. **Write `sites/<newname>/site.json`** — the site's canonical record, and what
   puts it on the apex gallery:

   ```json
   {
     "name": "<newname>",
     "url": "https://<newname>.bisks.net/",
     "title": "<newname>",
     "blurb": "one or two sentences, lowercase, what it is and who asked",
     "tag": "game",
     "type": "game",
     "by": "requester.handle",
     "src": "bot",
     "hidden": false
   }
   ```

   `type` is the front page's filter vocabulary — `toy`, `game`, `tool`,
   `joke`, `explainer`, `art`. Set `hidden: true` for infrastructure or a
   retired site.

   Then run `node audit/build-gallery.mjs --apply` to regenerate
   `apex/public/index.html`. **Don't hand-edit the gallery's card list** — it's
   overwritten from the manifests, and CI fails the push if the two disagree.
   That check exists because a build once committed a gallery card for a site it
   never created, and the dead link sat on the front page for three days.

7. **Deploy.** Push to `main` and let CI deploy, or `pnpm dlx wrangler deploy`
   once to confirm it comes up.

## Why a route and not a Custom Domain

The zone has a wildcard `*.bisks.net` DNS record (proxied) and a wildcard ACM
certificate. Together those mean an arbitrary subdomain resolves and completes
TLS without being registered in advance — so a site claims its hostname with a
plain **route**:

```toml
routes = [
  { pattern = "<name>.bisks.net/*", zone_name = "bisks.net" },
]
```

**Don't use `custom_domain = true`.** Custom Domains cap at 100 per zone and
routes cap at 1000. The zone hit that cap once already, which is what forced the
path-mounting era; a Custom Domain now consumes a scarce slot for no benefit.
The apex is the one exception — `*.bisks.net` matches one level below the apex,
so `bisks.net` itself stays a Custom Domain.

## Template

```toml
# sites/<name>/wrangler.toml
name = "atprotozoa-<name>"
main = "src/index.ts"
compatibility_date = "2025-01-01"

routes = [
  { pattern = "<name>.bisks.net/*", zone_name = "bisks.net" },
]

[assets]
directory = "./public"
binding = "ASSETS"
run_worker_first = true
```

```ts
// sites/<name>/src/index.ts
// Served at the root of <name>.bisks.net, so requests are passed to the
// static-asset router unchanged. Server-side behavior (an OAuth callback, a
// per-result share route, a cron) goes here, ahead of the ASSETS fallthrough.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
```

```
sites/<name>/
├── wrangler.toml
├── package.json          # { "name": "@atprotozoa/<name>", "private": true }
├── src/index.ts
├── site.json
└── public/index.html
```

See `sites/windmill` for a personalized `/r/<code>` share route and
`sites/padmoot` for OAuth.

## Older sites: legacy path routes

For a stretch, sites were mounted at `bisks.net/<name>` because the zone was at
its Custom Domain cap. Those sites kept their path routes alongside their
subdomain so previously-shared links still work, so **an older site may answer
on both** and its `src/index.ts` strips the mount prefix.

If you're editing one, the prefix-strip must be **conditional**:

```ts
if (url.pathname === PREFIX || url.pathname.startsWith(PREFIX + "/")) {
  url.pathname = url.pathname.slice(PREFIX.length) || "/";
}
```

Stripping unconditionally is a real bug and a quiet one. Reached on the
subdomain the prefix isn't there, so the slice chops the front off short paths
instead (`"/app.js".slice(6)` → `""` → falls back to `"/"`), and every asset
request serves `index.html` with a 200. The page renders; nothing works.

The ~30 sites under `bisks.net/games/<name>` are the same story one level
deeper — their `PREFIX` is `/games/<name>`. `sites/games` serves the cluster's
index page at the bare `bisks.net/games`, and deliberately does *not* claim
`bisks.net/games/*`, which would shadow each game's own path route. Clusters
are no longer a routing concept: a new game is an ordinary site with its own
subdomain.

**OAuth sites need a single canonical host.** An atproto client is identified by
its `client_id` URL, and the PDS fetches `client-metadata.json` from that URL and
checks the contents agree — so the client can't be dual-homed. Pick the
subdomain, set `MOUNT = ""`, and point `client_id` / `client_uri` /
`redirect_uris` at `https://<name>.bisks.net`. A legacy path route may still
serve the site, but login only works on the canonical host.

## Conventions that keep this one-shottable

- **Directory name = site name = subdomain.** `sites/foo` → `atprotozoa-foo` →
  `foo.bisks.net`.
- **`public/index.html` always exists.** Even server-heavy sites have a static
  entry.
- **No cross-site imports.** An agent should never need to understand two sites
  to change one.
- **Keep `wrangler.toml` boring.** Same fields every time; only `name` and the
  route differ for a static site.
- **Self-contained deps.** A site declares what it needs in its own
  `package.json`. Don't hoist to the root.
- **Include sharing, not just when asked.** OG/Twitter meta tags with a real
  preview image, plus a one-tap way to post the result to Bluesky. This is the
  default for most sites — see `notes/45-sharing-and-virality.md` for the recipe
  and `sites/didscope` for the reference implementation. Skip it only when the
  site has no per-user "result" to show off.
