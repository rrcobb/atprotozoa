# What labelers already exist

A sweep of the network on 2026-09-17, made after building a gift-link labeler
and then discovering `paywall-radar` had already shipped the same idea
(`labeler-candidates.md`). **Check this list, and re-run the sweep, before
building another one.**

How to re-run it: `app.bsky.actor.searchActors?q=<term>` over a handful of
terms, then keep the actors whose `associated.labeler` is true. A dozen queries
takes about a minute. `app.bsky.unspecced.getPopularFeedGenerators?query=` does
the same job for the feed form, and returns like counts, which is the better
signal of whether anyone actually wants the thing.

Not exhaustive — search ranks by relevance, so this finds the well-known ones
and misses the long tail.

## The 23 found

**Link and source context** — the crowded corner, and where gift links landed.

- `paywall-radar.bsky.social` — labels posts linking to known paywalled
  publications. Explicitly does not bypass or inspect.
- `paywall.bsky.social` — manages the paywall label list.
- `labeler.antisubstack.fyi` — marks accounts that post on Substack.
- `pds.labeler.tny.im` — accounts on a PDS not run by Bluesky PBC.

**Moderation and abuse**

- `cryptolabeler.w3igg.com` — crypto spammers.
- `engagement-hacks.bsky.social` — suspected engagement hacking.
- `arttheft.bsky.social` — art plagiarism, report-driven.
- `antiantiai.bsky.social` — AI-discussion moderation plus blocklist.
- `handle.invalid` — hide US politics, by topic or politician.

**Accessibility**

- `alt-text-labeler.bsky.social` — images posted without alt text.
- `baatl.mastod.one` — user-hostile accessibility properties.

**Identity and self-description** — mostly opt-in, subscriber asks to be labeled.

- `pronounsinb.io`
- `github-labeler.bsky.social` — repos you contribute to.
- `verified.babesky.com` — adult industry creators, age-verified.
- `stechlab-labels.bsky.social` — Cornell Tech research, account context.

**Community and fandom** — the largest category by count, all opt-in flair.

- `labeler.radial.racing` (pro cycling), `labeler.bikesky.social`,
  `labeler.urbanism.plus`, `nfl.sickos.club`, `sports-labeler.hooray.social`,
  `middleearth.quest` (a labeler *game*), `perfect-skeeties.bsky.social`,
  `jerrified.bsky.social`.

## What the shape of this list says

- **Fandom flair is the dominant use.** Most of these don't make a claim about
  anyone — the subscriber asks for their own label. That sidesteps the entire
  "standing claim about someone else's post" problem, which is why there are so
  many.
- **Involuntary labels cluster in moderation**, where there's an existing norm
  that someone is being judged, and usually a report path.
- **The descriptive-claim-about-a-stranger space is thin**, and it's thin
  because it's hard: it needs a fact worth knowing, checkable without judgment,
  that a subscriber acts on at the moment they see the post. Paywall status is
  one of the few that works, which is why it's taken.
- **Nobody has to subscribe.** Every one of these competes for a subscription
  the user must actively choose and can revoke. That's a much higher bar than a
  feed, which people try and forget about.

## The question to ask first

Not "is this claim true and checkable" — that's necessary, not sufficient.
Ask: *what does the subscriber do differently at the moment they see the
label?* If the answer is "seek out more of this," it's a feed. If it's "nothing,
but it's nice to know," nobody subscribes.
