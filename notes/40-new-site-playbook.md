# New-site playbook (for humans and agents)

The target workflow: "text an idea → an agent builds and deploys a whole small
site." This note is the recipe an agent (or you) follows to spin one up.

## Steps

1. **Pick a lineage.** Find the existing site closest to the idea and copy its
   directory: `cp -r sites/<closest> sites/<newname>`. If nothing's close, copy
   `sites/trigrams` (the reference site) or the barebones template.

2. **Rename.** In the new `sites/<newname>/`:
   - `wrangler.toml`: set `name = "atprotozoa-<newname>"` and the route to
     `<newname>.bisks.net`.
   - `package.json`: set `"name": "@atprotozoa/<newname>"`.
   - Purge copied-in logic you don't need. Keep what you'll edit.

3. **Build the idea.** Edit `public/` and (if it has a server surface) `src/`.
   Copy in atproto helpers from sibling sites as needed — copy, don't import
   across sites.

4. **Run it locally.** `cd sites/<newname> && pnpm dlx wrangler dev`. Open
   `localhost:8787`. Confirm it works.

5. **Deploy.** `pnpm dlx wrangler deploy` once to create the Worker + custom
   domain (or push to `main` and let CI do it — but a first manual deploy is the
   surest way to provision the subdomain).

6. **Link it from the apex gallery** (`apex/public/`) so it shows up on the
   landing page. Add an entry; the gallery is intentionally just a list.

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

## Barebones static template

The smallest possible site (no server code):

```toml
# sites/<name>/wrangler.toml
name = "atprotozoa-<name>"
compatibility_date = "2025-01-01"
assets = { directory = "./public" }
routes = [{ pattern = "<name>.bisks.net", custom_domain = true }]
```

```
sites/<name>/
├── wrangler.toml
├── package.json          # { "name": "@atprotozoa/<name>", "private": true }
└── public/index.html
```

That's a deployable site. Add `src/index.ts` + `main = "src/index.ts"` to
wrangler.toml only when you need a fetch handler.
