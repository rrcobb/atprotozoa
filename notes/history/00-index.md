# History

Superseded designs and incident logs. **None of this is current guidance** —
it's kept because the reasoning is often still useful, and because the failure
modes recur. Check anything here against the code before acting on it.

- **`2026-07-deploy-incidents.md`** — the original `20-deploy.md`. The Safe
  Browsing flag on the zone and its root cause, the Cloudflare custom-domain
  cap, the path-mounting era and the bugs it produced (unconditional
  prefix-strip, bare-mount trailing slash), and the migration back to
  subdomains. The most useful of these if a deploy symptom looks familiar.

- **`going-live-checklist.md`** — the one-time bootstrap: Cloudflare login, the
  DID for handle verification, first deploys, wiring CI. All done.

- **`prior-art-mino.md`** — mino.mobi (`github.com/minormobius/agent01`), the
  project this one took its shape from, and where it deliberately diverged
  (Workers rather than Pages; a stricter no-shared-package rule). Still the
  first place to look for a pattern this repo hasn't built yet.

- **`trigrams-design.md`** — the design of the first site: live 3-grams off the
  firehose, and the honest scoping of "novel" (novel to the session, not
  globally unique).

- **`trigrams-reply-and-quiver.md`** — the `/quiver` and `/reply` views, and
  what reading mino's source settled about atproto OAuth. Its conclusion is
  worth keeping in mind generally: the "this needs a server" instinct was wrong
  every time here — search, OAuth, and uniqueness verification all turned out to
  work client-side.

- **`trigrams-taste-calibration.md`** — calibrating what makes a trigram good
  against ~128 hand-curated examples. Concluded that heuristics filter well and
  rank badly: surprise and juxtaposition are what the good ones share, and
  length features can't see either.
