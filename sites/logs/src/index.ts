// logs Worker — logs.bisks.net
//
// The build bot's tags-and-outcomes timeline. It's a pure reader: it fetches the
// event log from the buildthis worker (buildthis.bisks.net/logs.json) and renders
// it server-side. No KV of its own — the event log lives on buildthis, keyed by
// mention uri, written by the watcher (seen/gate/dispatch) and the builder
// (outcome). See notes/80-buildthis-bot.md and sites/buildthis/src/index.ts.
//
// Routes:
//   /          -> the tags -> outcomes timeline (PRIMARY page)
//   /milestones -> fiesta for every post-count milestone, past and future
//   /stats     -> STUB: cross-microsite request/error stats (SECONDARY, separate)
//   everything else -> static assets (public/), incl. a plain 404-ish index.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  // Where to read the event log. A var (not a secret) so it's easy to point at a
  // local buildthis during dev. Defaults to prod if unset.
  LOGS_SOURCE?: string;
}

const DEFAULT_SOURCE = "https://buildthis.bisks.net/logs.json";

// Mirrors the LogEvent shape the buildthis worker writes. Kept as a local copy —
// house style is copy, don't share — so this site never imports across sites.
interface LogEvent {
  mentionUri: string;
  mentionCid?: string;
  authorHandle?: string;
  authorDid?: string;
  text?: string;
  isReply?: boolean;
  firstSeen: string;
  updatedAt: string;
  mutual?: boolean;
  dispatched?: boolean;
  outcome?: {
    status: "success" | "failure";
    builtName?: string;
    url?: string;
    replyText?: string;
    at: string;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return renderTimeline(env);
    }

    // Every tag gets its own permanent page — @norvid-studies' "every @buildthis
    // tag deserves to be a website." Built or not, each request has a URL here:
    // /tag/<rkey>, where <rkey> is the mention post's record key. So even a tag
    // that never became a site still becomes a little page.
    const tagMatch = url.pathname.match(/^\/tag\/([a-z0-9]+)\/?$/i);
    if (tagMatch) {
      return renderTagPage(env, tagMatch[1]);
    }

    // @antiali.as's update to "celebrate being @'d 1001 times": pick a
    // monotonic sequence and throw a fiesta for every milestone in it, in
    // order, retroactively and going forward. See renderMilestones().
    if (url.pathname === "/milestones") {
      return renderMilestones(env);
    }

    // SECONDARY, deliberately separate from the tags timeline: a cross-microsite
    // stats page (requests + errors per site). Stubbed — see the TODO in
    // renderStats(). Kept as its own route so it never blends into the timeline.
    if (url.pathname === "/stats") {
      return renderStats();
    }

    return env.ASSETS.fetch(request);
  },
};

// Fetch events from the buildthis worker. Returns them newest-first (the order
// the source uses), plus the total the source holds — never throws.
//
// `query` narrows the request at the SOURCE rather than here: `limit` for the
// timeline's screenful, `rkey` for a single tag permalink. Pulling the whole
// log for either was what made this page slow — it's ~470 events / 434 KB, and
// every permalink was downloading all of it to render one row.
async function loadEvents(
  env: Env,
  query: { limit?: number; rkey?: string } = {},
): Promise<{ events: LogEvent[]; total: number; error: string | null }> {
  const source = new URL(env.LOGS_SOURCE || DEFAULT_SOURCE);
  if (query.rkey) source.searchParams.set("rkey", query.rkey);
  else if (query.limit) source.searchParams.set("limit", String(query.limit));
  try {
    // 30s edge cache. The log only changes when the watcher or builder writes,
    // so this is plenty fresh and it keeps repeat views off the origin.
    const res = await fetch(source.toString(), { cf: { cacheTtl: 30 } as never });
    if (!res.ok) return { events: [], total: 0, error: `log source returned ${res.status}` };
    const j = (await res.json()) as { events?: LogEvent[]; total?: number };
    const events = Array.isArray(j.events) ? j.events : [];
    return { events, total: typeof j.total === "number" ? j.total : events.length, error: null };
  } catch (err) {
    return { events: [], total: 0, error: `couldn't reach the log source (${err})` };
  }
}

// The record key (rkey) of a mention's at:// uri — the stable per-tag id we use
// for /tag/<rkey> permalinks.
function rkeyOf(uri: string): string | null {
  const m = uri.match(/\/app\.bsky\.feed\.post\/([^/]+)$/);
  return m ? m[1] : null;
}

// How many rows the timeline renders. The full log is ~470 events and growing;
// showing a screenful keeps the page fast, and every event is still reachable
// at its own /tag/<rkey> permalink.
const TIMELINE_LIMIT = 60;

async function renderTimeline(env: Env): Promise<Response> {
  const { events, total, error: fetchError } = await loadEvents(env, {
    limit: TIMELINE_LIMIT,
  });

  const rows = events.map(renderEvent).join("\n");
  const more =
    total > events.length
      ? `<p class="empty">showing the ${events.length} most recent of ${total}.</p>`
      : "";
  const body =
    fetchError !== null
      ? `<p class="empty">${esc(fetchError)}</p>`
      : events.length === 0
        ? `<p class="empty">no tags logged yet. tag <a href="https://bsky.app/profile/buildthis.bisks.net">@buildthis.bisks.net</a> and it'll show up here.</p>`
        : rows + more;

  return html(page(body, total));
}

// One timeline entry: who tagged, what they asked, the gate result, and the
// outcome (dispatched -> built/failed -> reply). Each fact is a small labelled
// chip so the row reads as a status line, not prose.
function renderEvent(e: LogEvent): string {
  const handle = e.authorHandle ? `@${esc(e.authorHandle)}` : "someone";
  const profile = e.authorHandle
    ? `https://bsky.app/profile/${esc(e.authorHandle)}`
    : null;
  const who = profile ? `<a href="${profile}">${handle}</a>` : handle;

  const postLink = bskyPostUrl(e.mentionUri, e.authorHandle);
  const when = fmtTime(e.firstSeen);
  const whenEl = postLink
    ? `<a class="when" href="${postLink}">${when}</a>`
    : `<span class="when">${when}</span>`;
  // Every tag's own page — "every tag deserves a website."
  const rkey = rkeyOf(e.mentionUri);
  const tagLink = rkey ? `<a class="when tagperma" href="/tag/${rkey}">its page ↗</a>` : "";

  const chips: string[] = [];
  // Gate.
  if (e.mutual === true) chips.push(chip("mutual", "ok"));
  else if (e.mutual === false) chips.push(chip("non-mutual", "muted"));
  // Dispatch.
  if (e.dispatched === true) chips.push(chip("dispatched", "ok"));
  else if (e.dispatched === false)
    chips.push(chip(e.mutual === false ? "no build" : "dispatch failed", e.mutual === false ? "muted" : "bad"));
  // Reply tag context.
  if (e.isReply) chips.push(chip("reply-tag", "muted"));

  // Outcome (from the builder). Success shows the live link; failure is honest.
  let outcomeEl = "";
  if (e.outcome) {
    if (e.outcome.status === "success") {
      chips.push(chip("built", "ok"));
      if (e.outcome.url) {
        outcomeEl = `<div class="outcome"><span class="arrow">→</span> <a href="${esc(e.outcome.url)}">${esc(e.outcome.url)}</a></div>`;
      } else if (e.outcome.builtName) {
        outcomeEl = `<div class="outcome"><span class="arrow">→</span> ${esc(e.outcome.builtName)}</div>`;
      }
    } else {
      chips.push(chip("build failed", "bad"));
    }
  } else if (e.dispatched === true) {
    // Dispatched but no outcome yet: build is in flight (or the bot is down).
    chips.push(chip("pending", "muted"));
  }

  const ask = e.text ? `<div class="ask">${esc(e.text)}</div>` : "";

  return `<article class="event">
  <div class="head">${who} ${whenEl} ${tagLink}</div>
  ${ask}
  <div class="chips">${chips.join(" ")}</div>
  ${outcomeEl}
</article>`;
}

function chip(label: string, kind: "ok" | "bad" | "muted"): string {
  return `<span class="chip ${kind}">${esc(label)}</span>`;
}

// One tag, its own page: /tag/<rkey>. Realizes "every tag deserves a website" —
// every request has a permanent URL here whether or not it ever became a site.
async function renderTagPage(env: Env, rkey: string): Promise<Response> {
  // Ask the source for just this one event instead of the whole log.
  const { events, error } = await loadEvents(env, { rkey });
  if (error !== null) {
    return html(pageShell("tag — bisks.net", "tag", "", `<p class="empty">${esc(error)}</p>`), 502);
  }
  const e = events.find((ev) => rkeyOf(ev.mentionUri) === rkey);
  if (!e) {
    const body = `<p class="empty">no tag with id <code>${esc(rkey)}</code>. it may have aged out of the log, or never existed. <a href="/">back to the timeline</a>.</p>`;
    return html(pageShell("tag not found — bisks.net", "tag", "not found", body), 404);
  }

  const handle = e.authorHandle ? `@${esc(e.authorHandle)}` : "someone";
  const built = e.outcome?.status === "success" && e.outcome.url;
  const sub = built
    ? `${handle}'s tag → a website`
    : e.outcome?.status === "failure"
      ? `${handle}'s tag · didn't get built`
      : `${handle}'s tag`;

  // Reuse the timeline row as the detail body, plus a bigger call-out for the
  // built site (or an honest "no site yet" line) so the page stands on its own.
  const detail = renderEvent(e);
  let banner = "";
  if (built) {
    banner = `<p class="tagbanner ok">this one became a site: <a href="${esc(e.outcome!.url!)}">${esc(e.outcome!.url!)}</a></p>`;
  } else if (e.outcome?.status === "failure") {
    banner = `<p class="tagbanner">this tag didn't become a site${e.outcome.replyText ? ` — the bot said: <em>${esc(e.outcome.replyText)}</em>` : "."}</p>`;
  } else {
    banner = `<p class="tagbanner">no site yet — this tag is still waiting on the bot.</p>`;
  }

  const body = `${banner}\n${detail}\n<p class="note"><a href="/">← all tags</a></p>`;
  return html(pageShell(`tag — bisks.net`, "tag", sub, body));
}

// STUB (SECONDARY concern — kept separate from the tags timeline on purpose).
//
// TODO: cross-microsite request/error stats. Idea: each site's worker already has
// [observability] on, so per-site request + error counts can come from the
// Cloudflare GraphQL Analytics API (see notes/80 "Watching the watcher"), read
// with a scoped API token and rendered here as one row per site. Not built yet —
// this route exists so the tags timeline never gets muddied with site metrics.
function renderStats(): Response {
  const body = `<p class="empty">
    cross-site request &amp; error stats aren't built yet — this is a stub.
    the tags timeline is at <a href="/">/</a>.
  </p>
  <p class="note">
    planned: one row per <code>&lt;name&gt;.bisks.net</code> worker with request
    and error counts from the Cloudflare GraphQL Analytics API. tracked as a TODO
    in <code>sites/logs/src/index.ts</code>.
  </p>`;
  return html(pageShell("stats — bisks.net", "stats", "cross-site request & error counts (stub)", body));
}

// Milestones — @antiali.as's follow-up to "celebrate being @'d 1001 times":
// pick a monotonic integer sequence (any style) and throw a fiesta for each
// milestone in order, retroactively as well as from now on.
//
// The sequence is powers of two. That's not arbitrary: the *reason* this
// thread exists is that logs.bisks.net used to cap its own count at 1000
// (KV's list() hands back one page at a time — see notes/ and this site's own
// history), and 1024 is the binary number sitting right on top of that old
// ceiling. So the fiesta sequence is the same shape as the bug that started
// it: 1, 2, 4, 8, ... 1024, 2048, ...
//
// "Retroactively" means every power of two under the current total already
// counts as celebrated — this page doesn't wait for a fresh crossing, it
// shows the whole run of fiestas so far, most recent first, plus a live
// countdown to the next one.
function powersOfTwoUpTo(total: number): number[] {
  const out: number[] = [];
  for (let n = 1; n <= total; n *= 2) out.push(n);
  return out;
}

// @antiali.as, replying to this very page: "powers of two might grow too
// quickly … wdyt". Fair complaint — the gap between fiestas doubles every
// time, so the wait gets long fast. But the fiesta sequence itself is a
// retroactive, forever promise (see above); quietly swapping it for
// something slower-growing would break that. The compromise: a smaller
// "sprinkle" ✨ at the halfway point of every gap — not a fiesta, just a
// sign of life partway through the wait. Doesn't fix the exponential curve,
// just halves how long any one silence feels.
function sprinklesUpTo(total: number): { reached: number[]; next: number } {
  const reached: number[] = [];
  let next = 0;
  for (let prev = 2; prev <= 1 << 30; prev *= 2) {
    const mid = prev + Math.floor(prev / 2); // halfway between prev and prev*2
    if (mid <= total) {
      reached.push(mid);
    } else {
      next = mid;
      break;
    }
  }
  return { reached, next };
}

async function renderMilestones(env: Env): Promise<Response> {
  // Only the total is needed here, so ask for the smallest page.
  const { total, error } = await loadEvents(env, { limit: 1 });
  if (error !== null) {
    return html(
      pageShell("milestones — bisks.net", "milestones", "", `<p class="empty">${esc(error)}</p>`),
      502,
    );
  }

  const reached = powersOfTwoUpTo(total);
  const latest = reached.length ? reached[reached.length - 1] : null;
  const next = latest ? latest * 2 : 1;
  const toGo = next - total;
  const sprinkles = sprinklesUpTo(total);

  const hero = latest
    ? `<div class="fiesta-hero" id="fiesta-hero">
        <div class="fiesta-emoji" aria-hidden="true">🎉🎊🎉</div>
        <p class="fiesta-headline">fiesta #${reached.length} — tag ${latest} popped the confetti</p>
        <p class="fiesta-sub">${total} tags so far · ${toGo} to go until the next fiesta at ${next}</p>
      </div>`
    : `<div class="fiesta-hero"><p class="fiesta-headline">no fiesta yet — tag <a href="https://bsky.app/profile/buildthis.bisks.net">@buildthis.bisks.net</a> to start one.</p></div>`;

  const shareLink = latest
    ? `<p class="share"><a href="${shareIntentUrl(latest, reached.length, toGo, next)}">share this fiesta →</a></p>`
    : "";

  const upcoming = milestoneCard(next, total, false);
  const cards = reached.slice().reverse().map((n) => milestoneCard(n, total, true)).join("\n");

  const sprinkleUpcoming = sprinkleCard(sprinkles.next, total, false);
  const sprinkleCards = sprinkles.reached.slice().reverse().map((n) => sprinkleCard(n, total, true)).join("\n");

  const body = `${hero}
  ${shareLink}
  <h2 class="section">next up</h2>
  <div class="fiesta-grid">${upcoming}</div>
  <h2 class="section">every fiesta so far, most recent first</h2>
  <div class="fiesta-grid">${cards || `<p class="empty">none yet.</p>`}</div>
  <h2 class="section">sprinkles along the way</h2>
  <p class="note" style="margin:0 0 .9rem 0">
    @antiali.as wondered if the fiesta gaps grow too quickly — fair, the wait
    doubles every time. can't shrink it without breaking the "retroactive
    powers of two, forever" promise above, so here's the compromise: a
    halfway-point sprinkle ✨ in every gap, just to prove the count's still
    moving between fiestas.
  </p>
  <div class="fiesta-grid">${sprinkleUpcoming}${sprinkleCards ? "\n" + sprinkleCards : ""}</div>
  <p class="note">the sequence is powers of two — every one under the current tag count already counts as thrown, retroactively; new ones fire as the count climbs. <a href="/">back to the timeline</a>.</p>
  ${latest ? confettiScript() : ""}`;

  return html(
    pageShell(
      "milestones — bisks.net",
      "milestones",
      "a fiesta for every power-of-two tag count, past and future",
      body,
    ),
  );
}

function milestoneCard(n: number, total: number, reached: boolean): string {
  const label = reached ? "🎉 reached" : `⏳ ${n - total} to go`;
  return `<div class="milestone ${reached ? "hit" : "next"}">
    <span class="milestone-num">${n}</span>
    <span class="milestone-label">${label}</span>
  </div>`;
}

function sprinkleCard(n: number, total: number, reached: boolean): string {
  const label = reached ? "✨ sprinkled" : `✨ ${n - total} to go`;
  return `<div class="milestone sprinkle ${reached ? "hit" : "next"}">
    <span class="milestone-num">${n}</span>
    <span class="milestone-label">${label}</span>
  </div>`;
}

function shareIntentUrl(latest: number, count: number, toGo: number, next: number): string {
  const text = `buildthis just threw fiesta #${count} — tag ${latest} (powers of two, obviously). ${toGo} tags to go until ${next}. logs.bisks.net/milestones`;
  return `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
}

// A small confetti burst for the hero card, in the same self-contained-inline
// style as the chicken-mode script already living in public/index.html — no
// canvas, just a handful of absolutely-positioned spans with a CSS fall.
function confettiScript(): string {
  return `<script>
  (function () {
    var hero = document.getElementById("fiesta-hero");
    if (!hero) return;
    var colors = ["#1a5fd0", "#0a7d33", "#c02626", "#c8922e", "#8a3fc0"];
    for (var i = 0; i < 24; i++) {
      var p = document.createElement("span");
      p.className = "confetti-piece";
      p.style.left = (Math.random() * 100) + "%";
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.6) + "s";
      p.style.animationDuration = (1.6 + Math.random() * 1.2) + "s";
      hero.appendChild(p);
    }
  })();
  </script>`;
}

// --- rendering helpers -----------------------------------------------------

function page(body: string, count: number): string {
  const sub =
    count > 0
      ? `${count} tag${count === 1 ? "" : "s"} · newest first · every tag gets its own page · <a href="/milestones">milestones 🎉</a>`
      : "the build bot's tags and what became of them";
  return pageShell("logs — bisks.net", "logs", sub, body);
}

function pageShell(title: string, h1: string, sub: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="The build bot's tags and their outcomes." />
<style>
  :root {
    --bg:#fff; --ink:#111; --muted:#6b6b6b; --faint:#e4e4e4; --accent:#1a5fd0;
    --ok:#0a7d33; --bad:#c02626;
    --mono: ui-monospace,"SF Mono","JetBrains Mono","Cascadia Code","Roboto Mono",Menlo,Consolas,monospace;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family:var(--mono); font-size:15px; line-height:1.6; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:680px; margin:0 auto; padding:3.5rem 1.25rem 6rem; }
  header h1 { font-size:1.6rem; margin:0 0 .35rem; font-weight:600; }
  header p { color:var(--muted); margin:0 0 2.5rem; font-size:.9rem; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }

  .event { padding:1.1rem 0; border-top:1px solid var(--faint); }
  .event:first-of-type { border-top:1px solid var(--ink); }
  .head { display:flex; align-items:baseline; gap:.6rem; flex-wrap:wrap; }
  .head a { font-weight:600; }
  .when { color:var(--muted); font-size:.8rem; }
  .ask { margin:.4rem 0 .55rem; color:var(--ink); white-space:pre-wrap; word-break:break-word; }
  .chips { display:flex; gap:.4rem; flex-wrap:wrap; }
  .chip { font-size:.68rem; letter-spacing:.02em; padding:.12em .5em; border-radius:3px;
    border:1px solid var(--faint); color:var(--muted); }
  .chip.ok { color:var(--ok); border-color:var(--ok); }
  .chip.bad { color:var(--bad); border-color:var(--bad); }
  .chip.muted { color:var(--muted); }
  .outcome { margin-top:.5rem; font-size:.9rem; word-break:break-all; }
  .outcome .arrow { color:var(--muted); }
  .tagperma { font-size:.72rem; }
  .tagbanner { margin:0 0 1.5rem; padding:.9rem 1rem; border:1px solid var(--faint);
    border-left:3px solid var(--muted); border-radius:4px; font-size:.9rem; color:var(--ink); }
  .tagbanner.ok { border-left-color:var(--ok); }
  .tagbanner em { color:var(--muted); font-style:italic; }

  .empty { color:var(--muted); padding:1.5rem 0; border-top:1px solid var(--ink); }
  .note { color:var(--muted); font-size:.85rem; }
  code { background:rgba(0,0,0,.05); padding:.1em .35em; border-radius:4px; font-size:.9em; }

  footer { margin-top:3rem; padding-top:.75rem; border-top:1px solid var(--faint);
    color:var(--muted); font-size:.78rem; }

  /* --- milestones / fiesta ------------------------------------------------ */
  .fiesta-hero { position:relative; overflow:hidden; text-align:center;
    padding:2rem 1rem; border:1px solid var(--faint); border-radius:8px;
    background:linear-gradient(180deg, rgba(26,95,208,.05), transparent); }
  .fiesta-emoji { font-size:1.8rem; }
  .fiesta-headline { font-size:1.15rem; font-weight:600; margin:.5rem 0 .25rem; }
  .fiesta-sub { color:var(--muted); font-size:.85rem; margin:0; }
  .share { text-align:center; margin:.9rem 0 0; font-size:.85rem; }
  .section { font-size:.95rem; font-weight:600; margin:2rem 0 .75rem; color:var(--muted);
    text-transform:uppercase; letter-spacing:.04em; }
  .fiesta-grid { display:flex; flex-wrap:wrap; gap:.6rem; }
  .milestone { border:1px solid var(--faint); border-radius:6px; padding:.6rem .9rem;
    min-width:6rem; text-align:center; }
  .milestone.hit { border-color:var(--ok); }
  .milestone.next { border-style:dashed; }
  .milestone-num { display:block; font-size:1.1rem; font-weight:700; }
  .milestone-label { display:block; font-size:.68rem; color:var(--muted); margin-top:.2rem; }
  .milestone.hit .milestone-label { color:var(--ok); }
  .milestone.sprinkle { min-width:4.5rem; padding:.4rem .6rem; opacity:.85; }
  .milestone.sprinkle .milestone-num { font-size:.9rem; }
  .milestone.sprinkle.hit { border-color:#c8922e; }
  .milestone.sprinkle.hit .milestone-label { color:#c8922e; }

  .confetti-piece { position:absolute; top:-1.2rem; width:.5rem; height:.9rem;
    opacity:.9; border-radius:1px; animation-name:confetti-fall; animation-timing-function:ease-in;
    animation-iteration-count:1; animation-fill-mode:forwards; pointer-events:none; }
  @keyframes confetti-fall {
    0% { transform:translateY(0) rotate(0deg); opacity:1; }
    100% { transform:translateY(9rem) rotate(360deg); opacity:0; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${esc(h1)}</h1>
      <p>${sub}</p>
    </header>
    <main>
${body}
    </main>
    <footer>
      part of <a href="https://bisks.net">bisks.net</a> ·
      the bot: <a href="https://buildthis.bisks.net">buildthis</a> ·
      <a href="/milestones">milestones 🎉</a> ·
      <a href="/stats">site stats</a> (stub)
    </footer>
  </div>
</body>
</html>`;
}

function html(s: string, status = 200): Response {
  return new Response(s, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}

// Turn an at:// mention uri into a bsky.app permalink, when we can. The uri looks
// like at://<did>/app.bsky.feed.post/<rkey>; bsky.app wants
// /profile/<handle-or-did>/post/<rkey>. We prefer the handle for readability but
// fall back to the did in the uri.
function bskyPostUrl(uri: string, handle?: string): string | null {
  const m = uri.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
  if (!m) return null;
  const who = handle || m[1];
  return `https://bsky.app/profile/${who}/post/${m[2]}`;
}

function fmtTime(iso: string): string {
  // Compact, locale-stable, UTC. A toy log doesn't need per-viewer timezones.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
