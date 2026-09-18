# buildthis: five threads to explore (Rob, 2026-09-17)

Not scheduled. Each entry says what exists today, so the exploration starts
from the code rather than from the idea.

## Images

**Input already works.** `box-build.sh` downloads up to `MAX_BRIEF_IMAGES` (4)
thread images from the Bluesky CDN, checks their content type, and names the
paths in the brief so the builder can look at them. It's best-effort, and
`notes/history/2026-09-buildthis-issue-themes.md` records the case where the
download silently failed and the bot answered about images it never saw.

**Output does not.** The bot never posts an image: no screenshot of what it
built, no generated art. Two separate ideas hide under "better image support":

- **A screenshot in the reply.** The box has no browser today. Playwright on
  the box, one screenshot of the live URL, `uploadBlob` + `embed.images` on
  the reply. This also gives the builder a way to see its own work before
  shipping, which is the bigger win. Cost is a headless Chromium on the box.
- **Image generation as a site feature or bot output.** Ideas index #9. The
  cost problem is the blocker; `sites/byok` (in-browser keys, 2026-09-17) is
  the pattern that might answer it for sites, but not for bot-posted images.

## explainthis

Tag it on a post and get a plain explanation back: what a site does, what a
thread is about, what a record is. Read-only, no build, one Sonnet call, so
it's cheap and fast. Questions to settle before building:

- Same account or a second bot? Same account keeps the mutual gate and the
  audience; a second account keeps "@buildthis" meaning "build."
- What it's allowed to read. A post, a thread, a bisks.net site's source, a
  pdsls record? The `.buildthis.json` stamp and `net.bisks.buildthis.request`
  records mean it can explain its own builds from the record, not from guessing.
- The reply budget is 300 graphemes. An explanation that needs more wants a
  page, which makes it a build again.

## Effort level

Today every build gets the same `BUILDER_MODEL` (claude-sonnet-5) and
`BUILDER_MAX_TURNS` (90). There's no knob a tagger can turn and no signal the
watcher reads. Possible signals, cheapest first:

- Words in the tag: "quick", "small", "go deep", "take your time."
- Who's asking: Rob vs a mutual vs a stranger's first tag.
- Edit vs new site: an edit to a live site is usually smaller.

What the knob would move: model, max turns, whether the builder gets the
smoke test and a screenshot pass, whether it's allowed a second attempt.
Mobius mode already paces a burst; effort would size each job.

## Model choice

Sonnet 5 has been good, and it's well below the cost-quality frontier now
(artificialanalysis.ai/agents/coding-agents). Two different questions:

- **Quality per build.** Run the same brief through two models and rate the
  output. `sites/rateyourbuild` is the rater and `stats.bisks.net` is the
  traffic signal, so an A/B over a week of daily slots is measurable without
  new tooling: alternate `BUILDER_MODEL` by day, compare ratings and visits.
- **Cost.** Builds run on Rob's subscription through the box
  (`notes/90-infra-and-budget.md`), so dollars per build is subscription
  rate-limit pressure, not an invoice. A cheaper model buys more builds per
  day; a better one buys fewer partials. The partial rate is the number to
  watch, since a re-tag costs a whole second build.

## Fluent replies

Reply text is a template plus the builder's own note, fitted to 300
graphemes (`builder/reply.mjs`, `fitToLimit`). The note is what the builder
wrote about the work; the template carries the URL and the caveats. That
was a deliberate choice so brief text can never become bot copy
(`notes/80`, "watcher-side").

What "more fluent" could mean, and what each costs:

- **Let the builder write the whole reply** inside the same safety rule: the
  reply is derived from the build result, so the builder can phrase it. Same
  guarantee, less template.
- **A second, tiny model call** that rewrites note + template into one
  sentence. Adds a call per build and a place for tone to drift.
- **Thread-aware replies** that answer what was asked, not just announce the
  URL. Needs the reply step to see the brief, which it deliberately doesn't.

Check first whether the daily-slot replies and the tag replies read
differently; the templates are per disposition, and the "partial" copy is the
one people see most.
