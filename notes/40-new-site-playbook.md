# New-site playbook (for humans and agents)

The target workflow: "text an idea → an agent builds and deploys a whole small
site." This note is the recipe an agent (or you) follows to spin one up.

## Steps

1. **Pick a lineage.** Find the existing site closest to the idea and copy its
   directory: `cp -r sites/<closest> sites/<newname>`. If nothing's close, copy
   `sites/trigrams` (the reference site) or the barebones template.

2. **Rename.** In the new `sites/<newname>/`:
   - `wrangler.toml`: set `name = "atprotozoa-<newname>"` and the routes to
     `bisks.net/<newname>` + `bisks.net/<newname>/*` (see the template below —
     **not** a `<newname>.bisks.net` custom domain; see "Why paths, not
     subdomains" below).
   - `package.json`: set `"name": "@atprotozoa/<newname>"`.
   - `src/index.ts`: set `PREFIX = "/<newname>"` in the prefix-stripping
     handler (template below).
   - Purge copied-in logic you don't need. Keep what you'll edit.

3. **Build the idea.** Edit `public/` and `src/`. Copy in atproto helpers from
   sibling sites as needed — copy, don't import across sites. Any absolute
   URL a site writes about itself (OG tags, share-intent links, an OAuth
   `client_id`/`redirect_uri`) must include the `/<newname>` mount prefix —
   `location.origin` alone drops the path, so a site that computes its own URL
   from `location.origin` needs a `MOUNT` constant appended. See
   `sites/padmoot` for the OAuth case.

4. **Run it locally.** `cd sites/<newname> && pnpm dlx wrangler dev`. Open
   `localhost:8787` (dev serves at the root, not `/<newname>` — the prefix
   only applies to the deployed route). Confirm it works.

5. **Check local paths.** `pnpm check:imports` from the repo root (see
   `audit/check-import-paths.mjs`) statically walks every site's `public/` for
   `<script src>`/`<link href>`/module `import` references that don't resolve
   under the site's mount prefix, or don't exist on disk at all. Catches the
   "absolute path forgot the mount prefix" class of bug — see the
   fitzcarraldo report in `notes/20-deploy.md` ("Migrated-to-path sites") —
   before it ships instead of after someone reports a broken page.

6. **Deploy.** `pnpm dlx wrangler deploy` once to confirm it comes up at
   `bisks.net/<newname>` (or push to `main` and let CI do it).

## Subdomains again (2026-07-31)

Sites get their own `<name>.bisks.net` hostname. For a stretch they were
mounted as paths instead, because the zone hit Cloudflare's 100-custom-domain
cap; that constraint is gone and the paths are legacy.

What changed: the zone now has a wildcard `*.bisks.net` DNS record (proxied)
and an ACM wildcard certificate covering `*.bisks.net` + `bisks.net`. Together
those mean an arbitrary subdomain resolves and completes TLS without being
registered in advance — so a site can claim a hostname with a plain **route**
rather than a **Custom Domain**:

```
routes = [
  { pattern = "<name>.bisks.net/*", zone_name = "bisks.net" },
]
```

Routes cap at 1000/zone; Custom Domains cap at 100. That's the whole reason
this works now. Don't use `custom_domain = true` for a new site — it consumes a
capped slot for no benefit. The apex is the one exception: `*.bisks.net`
matches one level below the apex, so `bisks.net` itself stays a Custom Domain.

Existing sites keep their old `bisks.net/<name>` path routes alongside the new
hostname so previously-shared links don't break. A new site doesn't need one.

**If a site is mounted at a path as well, the prefix-strip in `src/index.ts`
must be conditional:**

```ts
if (url.pathname.startsWith(PREFIX + "/")) {
  url.pathname = url.pathname.slice(PREFIX.length) || "/";
}
```

Stripping unconditionally is a real bug, and it is quiet. Reached on the
subdomain the prefix isn't there, so the slice chops the front off short paths
instead (`"/app.js".slice(6)` → `""` → falls back to `"/"`), and every asset
request serves `index.html` with a 200. The page renders; nothing works.

**OAuth sites need a single canonical host.** An atproto client is identified
by its `client_id` URL, and the PDS fetches `client-metadata.json` from that
URL and checks the contents agree — so the client cannot be dual-homed.
Deriving the mount from `location` (right for plain assets) is wrong here: it
would compute a `client_id` that disagrees with the served file. Pick the
subdomain, set `MOUNT = ""`, and point `client_id` / `client_uri` /
`redirect_uris` at `https://<name>.bisks.net`. The path route may still serve
the site, but login only works on the canonical host.

6. **Link it from the apex gallery** (`apex/public/`) so it shows up on the
   landing page. Add an entry; the gallery is intentionally just a list.

## Clusters: grouping related sites under a shared path segment

Clusters were a path-era idea: sites in a family mounted one level deeper at
`bisks.net/games/<name>` rather than flat. Now that every site has its own
hostname, a new site doesn't need one — `<name>.bisks.net` is the address, and
membership in a family is a matter for the gallery, not the URL.

The existing games sites keep their `bisks.net/games/<name>` path routes for
old links, so if you're touching one, note its `PREFIX` is `/games/<name>`
rather than `/<name>`. See
`notes/20-deploy.md` ("Clustering related sites under a shared path segment")
for the games cluster's current membership and the two gotchas that came up
migrating existing sites into it (client-side path routing that assumes it
owns the domain root, and sibling sites linking to each other by old
subdomain). Don't invent a new cluster for a single site — it's worth doing
once there's a real handful that belong together, the way games did.

## Conventions that keep this one-shottable

- **Directory name = site name = subdomain.** `sites/foo` → `atprotozoa-foo` →
  `foo.bisks.net`. No surprises.
- **`public/index.html` always exists.** Even server-heavy sites have a static
  entry.
- **No cross-site imports.** An agent should never need to understand two sites
  to change one.
- **Keep `wrangler.toml` boring.** Same fields every time; only `name` and the
  route differ for a static site.
- **Self-contained deps.** If a site needs an npm package, it declares it in its
  own `package.json`. Don't hoist deps to the root.
- **Include sharing, not just when asked.** OG/Twitter meta tags with a real
  preview image, plus a one-tap way to post the result to Bluesky (intent-compose
  link at minimum; a generated share-card image + native `navigator.share` where
  the site has a per-user result worth showing off; a per-result unfurl route
  once a site is worth passing around). This is the default for most sites, not
  an optional extra — see `notes/45-sharing-and-virality.md` for the recipe and
  `sites/didscope` for the reference implementation. Skip it only when the site
  genuinely has no "result" to share (a pure tool/utility page).

## Barebones static template

The smallest possible site, mounted at `bisks.net/<name>`:

```toml
# sites/<name>/wrangler.toml
name = "atprotozoa-<name>"
main = "src/index.ts"
compatibility_date = "2025-01-01"

# Path route on the shared zone, not a dedicated custom domain — see "Why
# paths, not subdomains" above. Two entries: the bare path (no trailing
# slash) and everything under it.
routes = [
  { pattern = "bisks.net/<name>", zone_name = "bisks.net" },
  { pattern = "bisks.net/<name>/*", zone_name = "bisks.net" },
]

[assets]
directory = "./public"
binding = "ASSETS"
run_worker_first = true
```

```ts
// sites/<name>/src/index.ts
// Mounted at bisks.net/<name>/ — strips the mount prefix before handing the
// request to the static-asset router, since the assets directory has no idea
// it isn't living at the domain root.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/<name>";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
```

```
sites/<name>/
├── wrangler.toml
├── package.json          # { "name": "@atprotozoa/<name>", "private": true }
├── src/index.ts
└── public/index.html
```

That's a deployable site. A site with real server-side behavior (an OAuth
callback, a dynamic per-result route, a cron) adds that logic to the same
`fetch` handler, after the prefix strip — see `sites/windmill` (a personalized
`/r/<code>` share route) and `sites/padmoot` (OAuth) for worked examples.

Sites that predate this convention still answer on their own
`<name>.bisks.net` custom domain (`routes = [{ pattern = "<name>.bisks.net",
custom_domain = true }]`, no prefix-stripping needed since they own the whole
host) — leave those as-is unless you're specifically migrating one.
