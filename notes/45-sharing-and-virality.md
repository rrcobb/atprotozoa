# Sharing and virality — the default, not the afterthought

Prompted by @antiali.as asking for "beast virality" on didscope, then asking to
make it a standing habit. **Most new sites should ship with a real way to show
the result off, not just a link back to the tool.** "As appropriate" still
applies — skip it for a pure utility/tool page with no per-user result — but
treat that as the exception, not the default.

## The checklist (do these, roughly in this order of effort)

1. **Static OG/Twitter meta tags**, always, even for the barebones template:
   `og:title`, `og:description`, `og:image` (1200×630), `og:url`,
   `twitter:card=summary_large_image`. Costs nothing, makes every link unfurl
   like a real thing instead of a bare URL.
2. **A one-tap Bluesky share**, always: an intent-compose link is the floor.
   ```js
   els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
   ```
   No auth, no worker, works everywhere.

   **The `shareText` itself must contain the actual URL back to the site** —
   not just an og:title/description on the page the link points to. If the
   composed post is only "look what I got: '...'" with no URL in the visible
   text, anyone who sees it shared (a screenshot, a quote-post, a reply
   thread) has no way to find the tool at all — happened for real on
   dial-a-mutual, where a shared "dialed @x and got: ..." post read as
   confusing out-of-context text because the link wasn't in the string being
   shared. Build the URL into the `shareText` string before it's
   `encodeURIComponent`-ed, budget its length against the 300-grapheme cap
   (see `sites/dial-a-mutual/public/index.html`'s `buildShareText`), don't
   rely on the intent page or unfurl card to carry it.
3. **A generated share-card image**, when there's a per-user result worth
   showing off (a reading, a score, a match, a generated thing — not just "you
   used the tool"). Draw it client-side to a `<canvas>`, offer a download, and
   where the platform supports it, hand it straight to the OS share sheet:
   ```js
   function canShareFiles() {
     if (!navigator.share || !navigator.canShare) return false;
     const probe = new File([""], "probe.png", { type: "image/png" });
     return navigator.canShare({ files: [probe] });
   }
   // ...
   await navigator.share({ files: [file], text: shareText, title: siteName });
   ```
   Falls back to canvas `.toBlob()` → download link when `navigator.share`
   isn't available. See `sites/didscope/public/index.html` (`buildShareCard`,
   `canShareFiles`) for the full working version.
4. **Per-result unfurl cards**, the highest-effort tier, only worth it once a
   site actually gets shared around: a plain static page serves the *same*
   og:image/title/description for every query-string variant, so link-unfurl
   caches (Bluesky's included) show one generic card forever no matter who
   shares it. Fix: give each shareable result its own real URL
   (`/s/<handle>`, `/s/<result-id>`, whatever fits) and a tiny Worker fetch
   handler that fetches the static shell, computes the same result the client
   would, and string-replaces the generic title/description/url before
   serving it. See `sites/didscope/src/index.ts` (`renderShare`) — it's
   ~100 lines and needs no framework, just `Response`/`URL` and a couple of
   `String.split(...).join(...)` swaps into the static HTML.

## Judgment call: when to skip it

- A pure utility/tool with no interesting per-user output (a converter, a
  status page, a dashboard) — OG tags still make sense, but don't force a
  share-card or per-result URL onto something with nothing to brag about.
- A one-off internal/admin view. Still fine to skip entirely.

Otherwise, build it in from the start — retrofitting sharing onto a site after
the fact (as happened with didscope) works, but shipping v1 without it means a
second round-trip that could've been the first pass.
