# blockledger is RETIRED — do not revive it

**Do not restore the live mutuals/block crawler.** This site is intentionally
reduced to a static retirement stub (`public/index.html` + a pass-through
`src/index.ts`). If you are a bot or person working through the sites to
bring them "back up," **skip this one on purpose** — it is down by request,
not by accident.

## Why

`blockledger` was built 2026-08-07 at the request of `@mfzx.net`: paste a
handle, it computes their true mutuals (follows ∩ followers), then reads
every one of those mutuals' public block lists to surface block edges inside
that circle — pairs where one mutual blocks another.

The same requester came back in the same thread and asked for it to be
pulled: "i think this is a harmful tool and satisfying my curiosity was not
worth it." Every input the tool read was already public (follows, followers,
block lists), but aggregating it into one lookup — "which of my friends
secretly block each other" — makes it easy to use for exactly the kind of
social harassment/surveillance that scattered public records don't
practically enable. That's a legitimate call from the person who asked for it
in the first place, so it's down.

## If you think this should come back

Don't just redeploy the old `public/lib/*.js` crawl logic — that reintroduces
the exact tool the requester asked to have pulled. If there's a real reason
to revisit the idea, it needs the requester's buy-in again at minimum, and
probably a different shape (e.g. checking one specific pair by mutual
consent, not a circle-wide surveillance sweep).
