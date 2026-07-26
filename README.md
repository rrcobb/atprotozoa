# atprotozoa

A monorepo of tiny atproto experiments. One repo, many small sites, each its own
Cloudflare Worker, deployed on commit. Sites borrow from each other by **copying**,
not by extracting shared libraries.

See [`notes/`](./notes) for the full picture:

- [`notes/00-vision.md`](./notes/00-vision.md) — what this is and why.
- [`notes/10-architecture.md`](./notes/10-architecture.md) — Workers layout, the copy-don't-abstract rule.
- [`notes/20-deploy.md`](./notes/20-deploy.md) — deploy-on-commit, custom domains.
- [`notes/30-identity-and-did.md`](./notes/30-identity-and-did.md) — using bisks.net as a Bluesky handle.
- [`notes/40-new-site-playbook.md`](./notes/40-new-site-playbook.md) — how to spin up a new experiment.
- [`notes/50-trigrams.md`](./notes/50-trigrams.md) — the first site.

## Layout

```
apex/          front-door Worker for bisks.net (landing page + handle verification)
sites/         one directory per experiment, each its own Worker
  trigrams/    live Bluesky-firehose 3-gram feed
notes/         docs (start here)
.github/       deploy-on-commit workflow
```

## Local dev

```
pnpm install
pnpm --filter @atprotozoa/trigrams dev    # http://localhost:8787
pnpm --filter @atprotozoa/apex dev
```

## Going live

See [`notes/60-going-live.md`](./notes/60-going-live.md) for the one-time setup
(Cloudflare login, DID, GitHub secrets) and the deploy steps.

## License

[MIT](./LICENSE) — remix, fork, and ship whatever you want with this. No
attribution required, no warranty offered.
