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
  `atprotozoa-<name>` → `<name>.bisks.net`. See `notes/40-new-site-playbook.md`.
- **Views within a site are paths**, not subdomains (e.g.
  `trigrams.bisks.net/firehose`).

Start with `notes/` — `00-vision.md` first.
