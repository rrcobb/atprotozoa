# atprotozoa

A monorepo of ~200 tiny atproto experiments. One repo, many small sites, each its
own Cloudflare Worker at `<name>.bisks.net`, deployed on commit. Sites borrow from
each other by **copying**, not by extracting shared libraries.

Many of them were built by [`@buildthis.bisks.net`](https://buildthis.bisks.net),
a Bluesky bot: tag it with an idea and it builds the site and replies with the
link.

See [`notes/`](./notes) for the full picture:

- [`notes/00-vision.md`](./notes/00-vision.md) — what this is and why.
- [`notes/10-architecture.md`](./notes/10-architecture.md) — Workers layout, the copy-don't-abstract rule.
- [`notes/20-deploy.md`](./notes/20-deploy.md) — deploy-on-commit, routes, checks.
- [`notes/30-identity-and-did.md`](./notes/30-identity-and-did.md) — using bisks.net as a Bluesky handle.
- [`notes/40-new-site-playbook.md`](./notes/40-new-site-playbook.md) — how to spin up a new experiment.
- [`notes/45-sharing-and-virality.md`](./notes/45-sharing-and-virality.md) — the sharing defaults every site ships with.
- [`notes/80-buildthis-bot.md`](./notes/80-buildthis-bot.md) — the build bot's design and house rules.
- [`notes/90-infra-and-budget.md`](./notes/90-infra-and-budget.md) — where builds run, and what stops runaway spend.

`notes/ideas/` is undecided proposals; `notes/history/` is incident logs and
superseded designs.

## Layout

```
apex/          front-door Worker for bisks.net (gallery + handle verification)
sites/         one directory per experiment, each its own Worker
audit/         repo-wide scripts: gallery build, path checks, CF inventory
notes/         docs (start here)
.github/       deploy-on-commit workflow
```

## Local dev

```
pnpm install
pnpm --filter @atprotozoa/<site> dev    # http://localhost:8787
pnpm check:imports                      # verify local asset/import paths
```

## License

[MIT](./LICENSE) — remix, fork, and ship whatever you want with this. No
attribution required, no warranty offered.
