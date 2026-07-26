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

5. **Deploy.** `pnpm dlx wrangler deploy` once to confirm it comes up at
   `bisks.net/<newname>` (or push to `main` and let CI do it).

## Why paths, not subdomains

The original convention was one dedicated `<name>.bisks.net` custom domain per
site. That stopped being the default once the `bisks.net` zone hit a
Cloudflare custom-domain cap somewhere around the 100-site mark — brand-new
custom-domain routes silently failed to provision DNS while edits to
already-provisioned sites kept deploying fine (see `notes/20-deploy.md`).

The fix: mount new sites as a **path** on the `bisks.net` zone instead of a
new hostname. A plain Route (`{ pattern = "bisks.net/<name>/*", zone_name =
"bisks.net" }`) doesn't provision a new custom domain/hostname/cert — it's
just a URL-pattern rule on a zone that's already live — so it sidesteps the
cap entirely. Cloudflare resolves the most specific matching route/custom
domain for a request, so `bisks.net/<name>/*` takes precedence over the
apex's `bisks.net` catch-all without anything needing to change on the apex
Worker.

The tradeoff: since the site's own Worker is now mounted under a path instead
of owning a whole hostname, its `src/index.ts` has one new job — strip the
`/<name>` prefix before forwarding to the `ASSETS` binding, since the assets
directory itself has no idea it isn't living at the domain root. That's the
one thing every new site's `src/index.ts` needs now, even a purely static one.

6. **Link it from the apex gallery** (`apex/public/`) so it shows up on the
   landing page. Add an entry; the gallery is intentionally just a list.

## Clusters: grouping related sites under a shared path segment

Most sites mount flat at `bisks.net/<name>`. When a new site is clearly a
member of an existing family — right now that's just games — mount it one
level deeper instead: `bisks.net/games/<name>`, with routes
`{ pattern = "bisks.net/games/<name>", zone_name = "bisks.net" }` +
`.../games/<name>/*`, and `PREFIX = "/games/<name>"` in `src/index.ts`. Same
template as the barebones site below, just a longer prefix. See
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
