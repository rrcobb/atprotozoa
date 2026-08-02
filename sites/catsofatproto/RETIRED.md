# catsofatproto is RETIRED — do not revive it

**Do not restore the live firehose cat feed.** This site is intentionally
reduced to a static retirement stub (`public/index.html` + a prefix-stripping
`src/index.ts`). If you are a bot or person working through the sites to bring
them "back up," **skip this one on purpose** — it is down by design, not by
accident.

## Why

On 2026-07-26, Google Safe Browsing flagged `catsofatproto.bisks.net` as a
**"deceptive page"** (Search Console → Security Issues, category *Deceptive
pages*). Because every site shares the one `bisks.net` zone, that single flag
put a red **"Dangerous site"** warning in front of **every site on the domain**,
not just this one.

The trigger was not deceptive content in the ordinary sense — it was the page's
premise: it streamed **live, unvetted third-party images straight off the
Bluesky firehose** as they were posted, while also loading remote
`tfjs`/`mobilenet` scripts from a CDN and running an open-ish `/img/` image
proxy. To Safe Browsing's automated crawler, "a page full of unreviewed
third-party images + remote script loading + an image proxy" reads as a
compromised/deceptive page. There is no safe way to keep the original feed:
you cannot pre-vet a live public image firehose, so anything that re-displays it
risks re-tripping the flag and taking down the whole domain again.

## If you think this should come back

Don't just redeploy the old `index.html`. That reintroduces the exact content
that got the domain flagged. If there's a real reason to revisit it, it needs a
fundamentally different design (e.g. a human-moderated, curated set — not a live
unfiltered firehose grid) **and** a conversation with Rob first, because the
blast radius is the entire `bisks.net` zone.

See `notes/history/2026-07-deploy-incidents.md` (the Safe Browsing sections) for
the full incident, and `notes/20-deploy.md` for the standing rule.
