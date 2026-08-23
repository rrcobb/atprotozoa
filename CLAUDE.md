# atprotozoa — working conventions

This repo is a personal playground of tiny, self-contained atproto experiments.
It intentionally runs looser than a shared production codebase.

## Git: commit straight to main, no worktrees

**Override the global "always use a worktree" rule for this repo.** Work directly
on `main` and commit as you go. No worktrees, no feature branches, no PRs for the
normal loop — the sites are small and independent, so the isolation a worktree
buys isn't worth the ceremony here.

- Commit freely in small, focused commits. Push to `main`.
- Pushing to `main` triggers the deploy workflow, which redeploys only the
  site(s) that changed (see `notes/20-deploy.md`).
- Standard git safety still applies: don't force-push, don't commit secrets
  (`.dev.vars`, API tokens), don't rewrite published history.

## The house style (see notes/)

- **Copy, don't abstract.** New sites copy from existing ones; no shared package
  across sites. See `notes/10-architecture.md` and `notes/00-vision.md`.
- **One site = one directory = one Worker = one subdomain.** `sites/<name>` →
  `atprotozoa-<name>` → `<name>.bisks.net`, claimed with a plain route
  (`zone_name`), not `custom_domain = true`. Sites built during the
  path-mounting era also answer at `bisks.net/<name>`; see
  `notes/40-new-site-playbook.md` before editing one.
- **Views within a site are paths**, not subdomains (e.g.
  `trigrams.bisks.net/firehose`).

## Notes

`notes/` is documentation, not a journal. Start with `00-vision.md`.

- Numbered notes at the top level describe how things work **now**. When
  something changes, edit the note rather than appending a dated entry to it.
- `notes/history/` holds incident logs and superseded designs. Consult it when a
  symptom looks familiar; don't treat it as current.
- `notes/ideas/` holds undecided proposals. Nothing there is committed to.

### Current

- `00-vision.md`
- `10-architecture.md`
- `11-durable-objects.md`
- `20-deploy.md`
- `30-identity-and-did.md`
- `40-new-site-playbook.md`
- `45-sharing-and-virality.md`
- `50-oauth-scopes.md`
- `80-buildthis-bot.md`
- `90-infra-and-budget.md`

### history/

- `00-index.md`
- `2026-07-deploy-incidents.md`
- `2026-08-pnpm-lockfile-outage.md`
- `builder-inputs-and-runway.md`
- `going-live-checklist.md`
- `prior-art-mino.md`
- `trigrams-design.md`
- `trigrams-reply-and-quiver.md`
- `trigrams-taste-calibration.md`

### ideas/

- `00-index.md`
- `atproto-surface-map.md`
- `beyond-buildthis.md`
- `bot-ideas-riff.md`
- `feeds-and-labels.md`
- `other-bots.md`
- `pds-and-lexicons.md`
- `protocol-object-bot.md`
- `store-ours-rederive-theirs.md`

### inspiration/

Screenshots plus `README.md`.
